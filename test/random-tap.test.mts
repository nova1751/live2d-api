import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { nativeTouchArea } from '../src/modern/native-events.ts';

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

test('a second visible tap interrupts pending playback and an older pixel hit cannot replace it', async t => {
  const compiled = await build({entryPoints:['src/modern/interactions.ts'],bundle:true,write:false,format:'esm'});
  const { bindInteractions } = await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].contents).toString('base64'));
  globalThis.document = new EventTarget();
  globalThis.cancelAnimationFrame = () => {};
  t.after(()=>{delete globalThis.document;delete globalThis.cancelAnimationFrame;});
  const lifetime = new AbortController(), host = new EventTarget(), signals = [], hits = [];
  const stage = {hitTest:()=>[], playMotion:(_group,_index,{sync})=>{
    signals.push(sync.signal);
    return new Promise(resolve=>sync.signal.addEventListener('abort',()=>resolve({status:'interrupted'})));
  }};
  const action = {group:'Smile',index:0,file:'Smile.motion3.json',area:'',weight:1,delay:0};
  const controls = bindInteractions(host,stage,[action],lifetime.signal,new Set(),(_event,onHit)=>hits.push(onHit));
  host.dispatchEvent(new Event('click')); hits.shift()();
  host.dispatchEvent(new Event('click')); hits.shift()();
  assert.equal(signals.length,2);
  assert.ok(signals[0].aborted && !signals[1].aborted);
  host.dispatchEvent(new Event('click'));
  controls.playMotion('Smile',0);
  hits.shift()();
  assert.equal(signals.length,3);
  assert.ok(signals[1].aborted && !signals[2].aborted);
  lifetime.abort();
});

test('a native voice-only body event has a caption and no synthetic motion', async t => {
  const compiled = await build({ entryPoints:['src/modern/interactions.ts'],bundle:true,write:false,format:'esm' });
  const { loadModernAssets } = await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].contents).toString('base64'));
  const manifest = { FileReferences: { Motions: { Idle: [{ File: 'idle.motion3.json' }] } } };
  const motion = { motion_name:'', touch_area:'body', probability:1, delay:0, is_hurt:0 };
  const voice = { char_code:'OTs14', voice_key:'DIALOGUE1', caption:'Hello' };
  const data = { variant:'normal', motionData: { touch:motion, login:{...motion,touch_area:'0'}, absent:{...motion,motion_name:'missing.mtn'} },
    voiceData:{touch:voice,login:voice,absent:voice} };
  t.mock.method(globalThis,'fetch',async url=>Response.json(url.endsWith('/data.json')?data:manifest));
  const source = {url:'https://example.org/data.json',audio:new Map([['AUDIO/OTS14/OTS14_DIALOGUE1_JP.OGG','voice.ogg']]),
    captions:{'OTS14|DIALOGUE1':'今天有什么计划，说来听听吧。'}};
  const { actions } = await loadModernAssets('https://example.org/model.model3.json',source,new AbortController().signal).interactions;
  assert.deepEqual(actions,[{file:'',group:'voice',index:0,area:'body',weight:1,delay:0,sound:'voice.ogg',caption:source.captions['OTS14|DIALOGUE1']}]);
  source.audio.clear();
  const silent = await loadModernAssets('https://example.org/model.model3.json',source,new AbortController().signal).interactions;
  assert.equal(silent.actions.length,1);
  assert.equal(silent.actions[0].sound,undefined);
  assert.equal(silent.actions[0].caption,source.captions['OTS14|DIALOGUE1']);
  assert.equal(silent.actions[0].file,'');

});

test('a native text-only event retains its subtitle and leaves other motions available', async t => {
  const compiled = await build({ entryPoints:['src/modern/interactions.ts'], bundle:true, write:false, format:'esm' });
  const {loadModernAssets} = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].contents).toString('base64'));
  const manifest = {FileReferences:{Motions:{Touch:[{File:'touch.motion3.json'}],Wave:[{File:'wave.motion3.json'}]}}};
  const data = {variant:'normal',motionData:{120213:{motion_name:'touch.mtn',touch_area:'0',is_hurt:0,probability:1}},voiceData:{}};
  t.mock.method(globalThis,'fetch',async url=>Response.json(url.endsWith('/data')?data:manifest));
  const {actions} = await loadModernAssets('https://example.org/model', {url:'https://example.org/data',audio:new Map()},
    new AbortController().signal,{120213:{caption:'稍稍休息一下怎么样？'}},true).interactions;
  assert.deepEqual(actions.map(a=>[a.group,a.caption,a.sound]),[['Touch','稍稍休息一下怎么样？',undefined],['Wave',undefined,undefined]]);
});

test('the renderer preserves the CDN version delimiter and encodes reserved characters in filenames', async t => {
  const compiled = await build({ entryPoints:['src/modern/interactions.ts'],bundle:true,write:false,format:'esm' });
  const { loadModernAssets } = await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].contents).toString('base64'));
  const root = 'https://cdn.jsdelivr.net/gh/nova1751/live2d-api@cdn-ots14-527aac9245c0';
  let requested;
  t.mock.method(globalThis,'fetch',async url=>{
    requested = String(url);
    return Response.json({FileReferences:{}});
  });
  const { resolveAsset } = loadModernAssets(root+'/model.model3.json',undefined,new AbortController().signal);
  await resolveAsset('gh/nova1751/live2d-api@cdn-ots14-527aac9245c0/model #1.moc3');
  assert.equal(requested,root+'/model%20%231.moc3');
});

test('model and idle assets can load while dialogue metadata is pending', async t => {
  const compiled = await build({ entryPoints:['src/modern/interactions.ts'], bundle:true, write:false, format:'esm' });
  const { loadModernAssets } = await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].contents).toString('base64'));
  const manifest = {FileReferences:{Motions:{Idle:[{File:'idle.motion3.json'}], TapBody:[{File:'tap.motion3.json'}]}}};
  const dialogue = Promise.withResolvers<Response>();
  const clip = {Meta:{Duration:1,Loop:true},Curves:[]};
  t.mock.method(globalThis,'fetch',async url => {
    if (String(url).endsWith('/data.json')) return dialogue.promise;
    return Response.json(String(url).endsWith('/model.model3.json') ? manifest : clip);
  });
  const { src, resolveAsset, interactions } = loadModernAssets('https://example.org/model.model3.json',
    {url:'https://example.org/data.json',audio:new Map()},new AbortController().signal);
  assert.deepEqual(await (await resolveAsset(src)).text().then(JSON.parse), manifest);
  assert.equal(JSON.parse(await (await resolveAsset('idle.motion3.json')).text()).Meta.Loop, true);
  const tap = resolveAsset('tap.motion3.json');
  dialogue.resolve(Response.json({variant:'normal',motionData:{tap:{motion_name:'tap.mtn',touch_area:'body',probability:1}},voiceData:{}}));
  assert.equal((await interactions).actions.length, 1);
  assert.equal(JSON.parse(await (await tap).text()).Meta.Loop, false);
});

test('touch events can use the sole numbered head of 7706 without joining ambiguous hit areas', () => {
  assert.equal(nativeTouchArea('head', new Set(['head3', 'body', 'leg'])), 'head3');
  assert.equal(nativeTouchArea('head', new Set(['head2', 'head3'])), 'head');
  assert.equal(nativeTouchArea('leg2', new Set(['leg1'])), 'leg2');
  assert.equal(nativeTouchArea('leg', new Set(['leg', 'leg2'])), 'leg');
});
