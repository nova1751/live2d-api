import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join, posix } from 'node:path';

export const base = dirname(fileURLToPath(import.meta.url)), cache = join(base,'.local');
const raw = 'https://raw.githubusercontent.com/';
const api = 'https://api.github.com/repos/';
const az = 'Chaoray/AzurLane-Live2D-Viewer/88cb6e56a0ad472fe7e546509f096545d2bbc5b9/';
const band = 'U1s1-king/dsh-live2d-hhw/880be40fc1f06e0a317aa10e5830a0a2d5723749/';
const bh = 'KISGP/model/8caffe3e36a176b00cca5dda4e438e4d70e1f073/';
const data = 'AzurLaneTools/AzurLaneData/4cca5c2437007b62d30a6235fcfc0c0203231378/CN/';
const voices = 'Fernando2603/AzurLane/219db8feba07058dde232c461218bdacaaefdc17/audio/voiceline/';
const pending = new Map<string,Promise<Buffer|null>>();
async function cached(file:string,url:string,optional=false):Promise<Buffer|null>{
  try{return await readFile(file)}catch(e){if(e.code!=='ENOENT')throw e}
  if(!pending.has(file))pending.set(file,(async()=>{
    const res=await fetch(url,{signal:AbortSignal.timeout(60000)});
    if(optional && res.status===404)return null;
    if(!res.ok)throw Error('素材请求失败 HTTP '+res.status+' '+url);
    const buf=Buffer.from(await res.arrayBuffer());await mkdir(dirname(file),{recursive:true});
    const tmp=file+'.'+randomUUID()+'.part';await writeFile(tmp,buf);await rename(tmp,file);return buf;
  })().finally(()=>pending.delete(file)));
  return pending.get(file)!;
}
async function bytes(url:string,optional=false){
  const key=createHash('sha256').update(url).digest('hex');
  return cached(join(cache,'files',key),url,optional);
}
async function metadata(name:string,url:string){return JSON.parse((await cached(join(cache,'meta',name+'.json'),url))!.toString())}
function tree(repo:string,sha:string){return api+repo+'/git/trees/'+sha+'?recursive=1'}
const [at,bt,ht,skins,words,names,bhList,bandNames]=await Promise.all([
  metadata('az-tree',tree('Chaoray/AzurLane-Live2D-Viewer',az.split('/')[2])),
  metadata('band-tree',tree('U1s1-king/dsh-live2d-hhw','eae7f1e818c2b9a64242c281ced00b6a9c661afb')),
  metadata('bh-tree',tree('KISGP/model','f3091eab7ad53beb9f7c84b41bd4e1ea3deece59')),
  metadata('skins',raw+data+'ShareCfg/ship_skin_template.json'),metadata('words',raw+data+'sharecfgdata/ship_skin_words.json'),
  metadata('names',raw+data+'ShareCfg/name_code.json'),metadata('bh-list',raw+bh+'live2d.BengHuai2.json'),
  metadata('band-names',raw+'haneoka-gakuen/bangdream-live2d/2ed0434efb999b78bc282ad27b3964395a32340a/data/costumes.all.5.json')]);
function paths(t){if(t.truncated)throw Error('模型索引不完整');return new Set<string>(t.tree.filter(x=>x.type==='blob').map(x=>x.path))}
const aPaths=paths(at),bPaths=paths(bt),hPaths=paths(ht);
const localize=(s:string)=>s.replace(/\{namecode:(\d+)\}/g,(v,i)=>names[i]?.name||v);
const members={'009':'北泽育美','012':'松原花音','013':'濑田薰','015':'弦卷心','022':'奥泽美咲'};
const costume={casual:'日常服装',live_default:'乐队演出服',school_summer:'夏季校服',school_winter:'冬季校服',casual_summer:'夏季便服',casual_winter:'冬季便服',cafe:'咖啡店'};
const outfitNames=new Map(Object.values(bandNames).map(s=>[s.assetBundleName,s.description?.[3]||s.description?.[2]]));
const flatSkins=Object.values(skins).filter(s=>s.painting).sort((a,b)=>a.id-b.id);
type Row={id:string;name:string;character:string;edition:string;game:string;cover:string;source:string};
type Spec={repo:string;folder:string;manifest:string;paths:Set<string>;root:string;skin?:number;portrait?:string};
const specs=new Map<string,Spec>();
export const rows:Row[]=[];
function add(row:Row,spec:Spec){rows.push(row);specs.set(row.id,spec)}
const shipImages=new Map([...aPaths].filter(p=>p.startsWith('shipmodels/')).map(p=>[posix.basename(p,'.png').toLowerCase(),p]));
for(const p of aPaths){
 if(!/^live2d\/[^/]+\/[^/]+\.model3\.json$/.test(p))continue;
 const folder=posix.dirname(p),id=posix.basename(folder),baseId=id.replace(/_hx$/,'').toLowerCase();
 const skin=flatSkins.find(s=>s.painting.toLowerCase()===baseId),ship=skin&&skins[skin.ship_group*10];
 const portrait=shipImages.get(id.toLowerCase())||shipImages.get(baseId);
 add({id:'az-'+id,name:localize(ship?.name||skin?.name||id),character:'az-'+(skin?.ship_group||id),game:'碧蓝航线',
 edition:(skin?.group_index?localize(skin.name):'原版')+(id.endsWith('_hx')?' · HX 版':''),cover:portrait?'/cover/az-'+id:'',source:'https://github.com/'+az.split('/').slice(0,2).join('/')},
 {repo:az,folder,manifest:posix.basename(p),paths:aPaths,root:'',skin:skin?.id,portrait:portrait&&raw+az+portrait});
}
for(const p of bPaths){
 if(!p.endsWith('/index.json'))continue;
 const folder=posix.dirname(p),[key,...parts]=folder.split('_'),code=parts.join('_');
 if(!members[key])continue;
 add({id:'band-'+folder,name:members[key],character:'band-'+key,game:'BanG Dream!',edition:costume[code]||outfitNames.get(folder)||code.replaceAll('_',' '),
 cover:'/cover/band-'+folder,source:'https://github.com/U1s1-king/dsh-live2d-hhw'},
 {repo:band,root:'assets/model/',folder,manifest:'index.json',paths:bPaths,portrait:raw+band+'assets/assets/chara_icon_'+Number(key)+'.png'});
}
for(const b of bhList){
 const folder=posix.basename(posix.dirname(b.configuration.path));
 add({id:'bh-'+folder,name:b.title,character:'bh-'+folder,edition:'角色模型',game:'崩坏学园 2',cover:'/portrait/bh-'+folder+'.png',source:'https://github.com/KISGP/model'},
 {repo:bh,root:'live2d/BengHuai2/',folder,paths:hPaths,manifest:posix.basename(b.configuration.path)});
}
const voicedSite=join(base,'../voiced-games/.local/site');
const localEntries=new Map(),localFiles=new Map<string,Set<string>>();
for(const entry of JSON.parse(await readFile(join(voicedSite,'catalog.json'),'utf8')).filter(e=>e.game==='机动战队')){
 const id=entry.id,manifest=JSON.parse(await readFile(join(voicedSite,'models',id,entry.manifest),'utf8'));
 localEntries.set(id,entry);
 localFiles.set(id,new Set([entry.manifest,manifest.model,...manifest.textures,manifest.physics,manifest.pose,
  ...(manifest.expressions||[]).map(x=>x.file),...Object.values(manifest.motions).flat().flatMap(x=>[x.file,x.sound])].filter(Boolean)));
 rows.push({...entry,character:id,source:'https://github.com/Eikanya/Live2d-model',cover:'/cover/'+id});
}
const idleFirst=(r:Row)=>r.edition==='原版'||r.edition==='日常服装'?0:1;
rows.sort((a,b)=>a.game.localeCompare(b.game,'zh')||a.name.localeCompare(b.name,'zh')||idleFirst(a)-idleFirst(b)||a.edition.localeCompare(b.edition,'zh',{numeric:true}));
const byId=new Map(rows.map(r=>[r.id,r]));
const eventMap={touch_head:['headtouch','摸头'],touch_body:['touch','触摸'],touch_special:['touch2','特殊触摸'],login:['login','登录'],home:['home','回港'],complete:['expedition','委托完成'],mail:['mail','邮件'],wedding:['propose','誓约'],mission:['mission','任务'],mission_complete:['mission_complete','任务完成']};
const labels={angry01:'生气',bye01:'挥手告别',cry01:'哭泣',idle01:'待机 1',idle02:'待机 2',smile01:'微笑',surprised01:'惊讶',tap_face:'轻触脸部',tap_breast:'轻触胸部',tap_belly:'轻触腹部',tap_leg:'轻触腿部',flick_head:'轻拂头部',shake:'摇晃',idle:'待机',morning:'早晨',evening:'傍晚',afternoon:'午后',mail:'邮件'};
const details=new Map<string,Promise<any>>();
function buildEntry(id:string){
 const spec=specs.get(id),row=byId.get(id);if(!spec||!row)return;
 if(!details.has(id))details.set(id,(async()=>{
   const url=raw+spec.repo+spec.root+spec.folder+'/';
   const m=JSON.parse((await bytes(url+spec.manifest))!.toString('utf8').replace(/^\uFEFF/,''));
   const actions=[],recordings=new Map<string,string>(), modern=!!m.FileReferences;
   if(modern){
     const lines=words[spec.skin]||{};
     for(const [group,clips] of Object.entries(m.FileReferences.Motions||{})){
       if(/^idle$/i.test(group))continue;
       const main=/^main_(\d+)$/.exec(group);
       const [key,title]=eventMap[group]||(main?['main'+main[1],'主界面 '+main[1]]:['',group]);
       const caption=key?(main?lines.main?.split('|')[+main[1]-1]:lines[key]):'';
       for(const [index,clip] of clips.entries())actions.push({group,index,label:title+(clips.length>1?' '+(index+1):''),caption:typeof caption==='string'?localize(caption.trim()):'',sound:clip.Sound||'',key});
     }
     await Promise.all([...new Set(actions.filter(a=>a.key&&!a.sound&&spec.skin).map(a=>a.key))].map(async key=>{
       const sound='voice/'+key+'.ogg',url=raw+voices+spec.skin+'/'+key+'.ogg';
       if(await bytes(url,true)){recordings.set(sound,url);for(const a of actions)if(a.key===key&&!a.sound)a.sound=sound;}
     }));
   }else{
     const valid=(file:string)=>!!file&&spec.paths.has(spec.folder+'/'+file);
     for(const [group,clips] of Object.entries(m.motions||{})){
       m.motions[group]=clips.filter(c=>valid(c.file));
       for(const [index,clip] of m.motions[group].entries()){
         if(clip.sound&&!valid(clip.sound))delete clip.sound;
         if(typeof clip.text!=='string')delete clip.text;
         actions.push({group,index,label:(labels[group]||group||'动作')+(m.motions[group].length>1?' '+(index+1):''),sound:clip.sound||'',caption:clip.text||''});
       }
     }
     if(!m.motions.idle?.length && m.motions.idle01?.length)m.motions.idle=m.motions.idle01;
     if(m.physics&&!valid(m.physics))delete m.physics;
     if(m.expressions)m.expressions=m.expressions.filter(e=>valid(e.file));
   }
   return {m,recordings,entry:{...row,modern,manifest:spec.manifest,actions}};
 })().catch(e=>{details.delete(id);throw e}));
 return details.get(id);
}
export async function detail(id:string){return localEntries.get(id)||(await buildEntry(id))?.entry}
export async function cover(id:string){
 if(localEntries.has(id))return readFile(join(voicedSite,'portraits',id+'.png'));
 const url=specs.get(id)?.portrait;return url?bytes(url):null;
}
export async function asset(id:string,file:string){
 if(localFiles.get(id)?.has(file))return readFile(join(voicedSite,'models',id,file));
 const s=specs.get(id);if(!s)return null;
 if(file===s.manifest)return Buffer.from(JSON.stringify((await buildEntry(id)).m));
 const path=s.folder+'/'+file;
 if(s.paths.has(path))return bytes(raw+s.repo+s.root+path.split('/').map(encodeURIComponent).join('/'));
 const url=(await buildEntry(id)).recordings.get(file);return url?bytes(url):null;
}
