import { existsSync } from 'node:fs';
import { mkdir, copyFile, readFile, writeFile, rename, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const base = dirname(fileURLToPath(import.meta.url));
export const site = join(base, '.local/site');
const modelRepo = 'https://raw.githubusercontent.com/Chaoray/AzurLane-Live2D-Viewer/88cb6e56a0ad472fe7e546509f096545d2bbc5b9/live2d';
const voiceRepo = 'https://raw.githubusercontent.com/Fernando2603/AzurLane/219db8feba07058dde232c461218bdacaaefdc17/audio/voiceline';
const wordsUrl = 'https://raw.githubusercontent.com/AzurLaneTools/AzurLaneData/4cca5c2437007b62d30a6235fcfc0c0203231378/CN/sharecfgdata/ship_skin_words.json';
async function download(url: string, dest: string, optional = false) {
  if (existsSync(dest)) return true;
  await mkdir(dirname(dest), {recursive:true});
  try {
    await run('curl', ['-fLsS','--retry','2','--max-time','90','-w','%{http_code}',url,'-o',dest+'.part']);
  } catch (error) {
    await rm(dest+'.part', {force:true});
    if (optional && error.code === 22 && error.stdout.trim() === '404') return false;
    throw error;
  }
  await rename(dest+'.part',dest);
  return true;
}
async function copy(from: string,to: string) {
  await mkdir(dirname(to),{recursive:true});
  await copyFile(from,to);
}
const events = [
 ['touch_head','headtouch','摸头'],['touch_body','touch','触摸'],['touch_special','touch2','特殊触摸'],
 ['main_1','main1','主界面 · 一'],['main_2','main2','主界面 · 二'],['main_3','main3','主界面 · 三'],
 ['login','login','登录'],['home','home','回港'],['mail','mail','邮件'],['mission','mission','任务'],
 ['mission_complete','mission_complete','完成任务'],['complete','expedition','委托完成'],['wedding','propose','誓约'],
];
await mkdir(site,{recursive:true});
const cache = join(base,'.local/cache/words.json');
await download(wordsUrl,cache);
const words=JSON.parse(await readFile(cache,'utf8'));
const entries=[];
for(const [id,name,english,skin,side] of [
 ['lafei','拉菲','Laffey','101170','白鹰'],['biaoqiang','标枪','Javelin','201210','皇家'],['lingbo','绫波','Ayanami','301050','重樱'],
]){
 const dir=join(site,'models',id);
 const manifest=id+'.model3.json';
 await download(modelRepo+'/'+id+'/'+manifest,join(dir,manifest));
 const model=JSON.parse(await readFile(join(dir,manifest),'utf8'));
 const refs=model.FileReferences;
 const files=[refs.Moc,...refs.Textures,refs.Physics,...Object.values(refs.Motions).flat().map(m=>m.File)].filter(Boolean);
 for(let n=0;n<files.length;n+=4) await Promise.all(files.slice(n,n+4).map(f=>download(modelRepo+'/'+id+'/'+f,join(dir,f))));
 const actions=[];
 for(const [group,key,label] of events){
  if(!refs.Motions[group]?.length) continue;
  const lines=words[skin] ?? {};
  const caption=(key.startsWith('main')?lines.main?.split('|')[Number(key.slice(4))-1]:lines[key]) ?? '';
  const nativeSound=refs.Motions[group][0].Sound;
  let sound=nativeSound || 'voice/'+key+'.ogg';
  const soundUrl=nativeSound ? modelRepo+'/'+id+'/'+nativeSound : voiceRepo+'/'+skin+'/'+key+'.ogg';
  if(!await download(soundUrl,join(dir,sound),true)) sound='';
  actions.push({group,index:0,label,sound,caption});
 }
 entries.push({id,name,english,game:'碧蓝航线',edition:side+' · 原版',manifest,modern:true,actions});
 console.log(name,actions.length);
}
for(const [id,name,english,manifest] of [['madierda','玛蒂尔达','Matilda','index.json'],['siluokayi','斯洛卡伊','Slokai','model.model-Japanese.json']]){
 const dir=resolve(base,'../../model',id);
 const model=JSON.parse(await readFile(join(dir,manifest),'utf8'));
 const actions=[];
 const used=new Set([manifest,model.model,...model.textures,model.physics].filter(Boolean));
 for(const [group,clips] of Object.entries(model.motions)){
  for(const [index,c] of clips.entries()){
   if(c.file) used.add(c.file);
   if(c.sound) used.add(c.sound);
   if(!c.sound || !(group.startsWith('tap_') || group==='idle'))continue;
   const label=group==='idle'?'待机台词':'触摸 '+group.slice(4);
   const number=actions.filter(a=>a.group===group).length+1;
   actions.push({group,index,label:label+' · '+number,sound:c.sound,caption:c.text||''});
  }
 }
 for(const f of used) await copy(join(dir,f),join(site,'models',id,f));
 // In these exports zero means unspecified. Cubism 2 reserves zero for "no motion".
 for(const clips of Object.values(model.motions)) for(const clip of clips)
   if(clip.priority===0) delete clip.priority;
 // Keep named hit groups first. The legacy renderer uses tap only for an unmapped
 // region or a point on the visible mesh, preserving each original motion/voice pair.
 model.motions.tap=actions.filter(a=>a.group.startsWith('tap_')).map(a=>model.motions[a.group][a.index]);
 await writeFile(join(site,'models',id,manifest),JSON.stringify(model));
 entries.push({id,name,english,edition:'机师 · 原版',game:'机动战队',modern:false,manifest,actions});
 console.log(name,actions.length);
}
await writeFile(join(site,'catalog.json'),JSON.stringify(entries,null,2));
const core=process.env.CUBISM_CORE_PATH || resolve(base,'../visual-novels/.local/live2dcubismcore.min.js');
await copy(core,join(site,'core.js'));
