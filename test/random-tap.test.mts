import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

test('touch rules win and only visible, unmapped taps rotate through eligible motions', async t => {
  const compiled = await build({ entryPoints:['src/modern/interactions.ts'],bundle:true,write:false,format:'esm' });
  const { bindInteractions } = await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].contents).toString('base64'));
  globalThis.document = new EventTarget();
  globalThis.cancelAnimationFrame = () => {};
  t.after(()=>{delete globalThis.document;delete globalThis.cancelAnimationFrame;});
  const host = new EventTarget(), lifetime = new AbortController(), played = [];
  let hits = ['head'], opaque = true;
  const stage = {
    hitTest:()=>hits,
    playMotion:async (group,index)=>{played.push([group,index]);return {status:'interrupted'};},
    getModelInfo:()=>({expressions:[]}),
  };
  const groups = ['TapHead','Smile','Wave','Login','SharedIdle'];
  const actions = groups.map((group,i)=>({group,index:0,file:group+'.motion3.json',area:i===0?'head':'',weight:1,delay:0}));
  bindInteractions(host,stage,actions,lifetime.signal,new Set(['SharedIdle.motion3.json']),(_event,onHit)=>{if(opaque)onHit();});
  const tap = async () => {host.dispatchEvent(new Event('click'));await new Promise(resolve=>setImmediate(resolve));};
  await tap();
  assert.deepEqual(played,[['TapHead',0]]);
  hits=[];opaque=false;
  await tap();assert.equal(played.length,1);
  opaque=true;
  for(let i=0;i<8;i++)await tap();
  assert.equal(played.length,9);
  const fallback=played.slice(1).map(([name])=>name);
  assert.ok(fallback.every((name,i)=>['TapHead','Smile','Wave'].includes(name)&&name!==fallback[i-1]));
  lifetime.abort();
  await tap();assert.equal(played.length,9);
});

test('a native voice-only body event has a caption and no synthetic motion', async t => {
  const compiled = await build({ entryPoints:['src/modern/interactions.ts'],bundle:true,write:false,format:'esm' });
  const { readActions } = await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].contents).toString('base64'));
  const manifest = { FileReferences: { Motions: { Idle: [{ File: 'idle.motion3.json' }] } } };
  const motion = { motion_name:'', touch_area:'body', probability:1, delay:0, is_hurt:0 };
  const voice = { char_code:'OTs14', voice_key:'DIALOGUE1', caption:'Hello' };
  const data = { variant:'normal', motionData: { touch:motion, login:{...motion,touch_area:'0'}, absent:{...motion,motion_name:'missing.mtn'} },
    voiceData:{touch:voice,login:voice,absent:voice} };
  t.mock.method(globalThis,'fetch',async url=>Response.json(url.endsWith('/data.json')?data:manifest));
  const source = {url:'https://example.org/data.json',audio:new Map([['AUDIO/OTS14/OTS14_DIALOGUE1_JP.OGG','voice.ogg']]),
    captions:{'OTS14|DIALOGUE1':'今天有什么计划，说来听听吧。'}};
  const { actions } = await readActions('https://example.org/model.model3.json',source,new AbortController().signal);
  assert.deepEqual(actions,[{file:'',group:'voice',index:0,area:'body',weight:1,delay:0,sound:'voice.ogg',caption:source.captions['OTS14|DIALOGUE1']}]);
});
