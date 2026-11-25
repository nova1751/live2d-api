import {createLive2D} from 'live2d-web';
import {cubismWebGL} from 'live2d-web/backends/cubism-webgl';
import type {StageHandle} from 'live2d-web';
import {createFraming,type Camera} from '../../src/library/framing';
import {prepareMotion} from '../../src/modern/motion';
import type {Entry,Action} from './types';
const host=document.querySelector<HTMLDivElement>('#host')!;
const id=new URL(location.href).searchParams.get('model');
const lifetime=new AbortController();
const emit=(type:string,text='')=>parent.postMessage({id,type,text},location.origin);
const fail=(error:unknown)=>emit('error',error instanceof Error?error.message:String(error));
window.addEventListener('pagehide',()=>lifetime.abort(),{once:true});
function painted(canvas:HTMLCanvasElement){
 const thumb=document.createElement('canvas');thumb.width=thumb.height=240;thumb.getContext('2d')!.drawImage(canvas,0,0,240,240);
 Object.assign(window,{previewPortrait:thumb.toDataURL()});host.classList.add('ready');emit('ready');
}
async function mount(e:Entry){
 const base=new URL('models/'+e.id+'/',location.href),url=new URL(e.manifest,base);
 const camera=createFraming();
 if(!e.modern){
  const script=document.createElement('script');script.src='legacy.js';await new Promise<void>((res,rej)=>{script.onload=()=>res();script.onerror=rej;document.head.append(script)});
  const canvas=document.createElement('canvas');canvas.width=canvas.height=800;canvas.id='live2d';host.append(canvas);
  window.addEventListener('live2d:dialogue',(ev)=>emit('caption',(ev as CustomEvent).detail));
  window.addEventListener('live2d:dialogue-end',()=>emit('caption'));
  const legacy=(window as any).loadlive2d;
  Object.assign(window,{previewPlay:(i:number)=>{const a=e.actions[i];if(a)legacy.previewEvent(a.group,a.index)}});
  lifetime.signal.addEventListener('abort',()=>legacy.hide(),{once:true});
  legacy(canvas.id,url.href,{framing:camera,onPaint:painted,start:false,locale:'zh-CN'});
  return;
 }
 const manifest=await (await fetch(url)).json();
 const groups=manifest.FileReferences.Motions||{};
 const idleGroup=Object.keys(groups).find(key=>key.toLowerCase()==='idle');
 const src=url.pathname.slice(1),idle=new Set((groups[idleGroup??'']??[]).map(m=>new URL(m.File,base).href));
 async function resolveAsset(path:string,signal?:AbortSignal){
  if(path===src)return new Blob([JSON.stringify(manifest)]);
  const u=new URL('/'+path,location.href);
  const r=await fetch(u,{signal:signal??lifetime.signal});if(!r.ok)throw Error('缺少素材 '+path);
  if(!u.pathname.endsWith('.motion3.json'))return r.blob();
  return new Blob([JSON.stringify(prepareMotion(await r.json(),!idle.has(u.href)))]);
 }
 let graphics:StageHandle;
 const fit=(c:Camera)=>({scale:c.scale/2,offsetX:c.x,offsetY:c.y-0.5,units:'stage' as const});
 const stage=await createLive2D({container:host,src,resolveAsset,coreUrl:new URL('core.js',location.href).href,idleMotion:idleGroup,fit:fit(camera.initial),followPointer:true,signal:lifetime.signal,
  backend:{...cubismWebGL,createStage(el,opts){return graphics=cubismWebGL.createStage(el,opts)}},onError:fail});
 let fitted=false;
 const output=host.querySelector('canvas')!;
 const off=graphics!.onFrame(()=>queueMicrotask(()=>{
  if(lifetime.signal.aborted)return;
  if(fitted){off();painted(output);return;}
  const c=camera.measure(output,undefined,w=>stage.setFit(fit(w)));if(c){fitted=true;stage.setFit(fit(c))}
 }));
 let active:AbortController|undefined,audio:AudioContext|undefined;
 const buffers=new Map<string,AudioBuffer>();
 async function play(a:Action){
  active?.abort();const run=active=new AbortController(),signal=run.signal;
  if(!a.sound){
   try{
    let announced=false;
    await stage.playMotion(a.group,a.index,{sync:{ready:Promise.resolve(),signal,update(dt){if(!announced){announced=true;emit('caption',a.caption)}return dt}}});
   }catch(err){if(!signal.aborted)fail(err)}finally{if(active===run){emit('caption');active=undefined}}
   return;
  }
  audio??=new AudioContext();const clock=audio;const unlock=clock.resume();
  let voice:AudioBufferSourceNode|undefined,started=false,tick:number|undefined;
  let end!:()=>void;const ended=new Promise<void>(r=>{end=r});
  signal.addEventListener('abort',()=>{if(started)voice?.stop();voice?.disconnect();end();emit('caption')},{once:true});
  const ready=(async()=>{await unlock;let buffer=buffers.get(a.sound);if(!buffer){const r=await fetch(new URL(a.sound,base),{signal});if(!r.ok)throw Error('录音加载失败');buffer=await clock.decodeAudioData(await r.arrayBuffer());buffers.set(a.sound,buffer)}
   signal.throwIfAborted();voice=clock.createBufferSource();voice.buffer=buffer;voice.onended=end;voice.connect(clock.destination)})();
  try{
   const result=await stage.playMotion(a.group,a.index,{sync:{ready,signal,update(){const now=clock.currentTime;if(!started){voice!.start(now);started=true;emit('caption',a.caption)}const dt=tick===undefined?0:now-tick;tick=now;return dt}}});
   if(result.status==='completed')await ended;
  }catch(err){if(!signal.aborted)fail(err)}finally{if(active===run){run.abort();active=undefined;}}
 }
 Object.assign(window,{previewPlay:(i:number)=>{if(e.actions[i])void play(e.actions[i])}});
 host.addEventListener('click',ev=>{const hits=stage.hitTest(ev.clientX,ev.clientY);const action=e.actions.find(a=>hits.includes(a.group));if(action)void play(action)});
 document.addEventListener('visibilitychange',()=>{if(document.hidden)active?.abort()});
 lifetime.signal.addEventListener('abort',()=>{active?.abort();stage.dispose();void audio?.close()},{once:true});
}
async function start(){
 const collection=new URLSearchParams(location.search).has('collection');
 const response=await fetch(collection?'entries/'+encodeURIComponent(id??''):'catalog.json');
 if(!response.ok)throw Error('模型数据加载失败 HTTP '+response.status);
 const data=await response.json();const e:Entry=collection?data:data.find(e=>e.id===id);
 if(!e)throw Error('找不到这个造型');await mount(e);
}
start().catch(fail);
