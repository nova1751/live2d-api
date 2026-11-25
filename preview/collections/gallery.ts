interface Row{id:string;name:string;game:string;character:string;edition:string;cover:string;source:string}
const rows:Row[]=await (await fetch('/catalog.json')).json();
const $=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const select=(id:string)=>$<HTMLSelectElement>(id);
const frame=$<HTMLIFrameElement>('frame'), variant=select('variant'),action=select('action'),filter=select('filter'),search=$<HTMLInputElement>('search'),play=$<HTMLButtonElement>('play');
const families=new Map<string,Row[]>();
for(const r of rows){if(!families.has(r.character))families.set(r.character,[]);families.get(r.character)!.push(r)}
for(const g of new Set(rows.map(r=>r.game)))filter.add(new Option(g,g));
let current:Row,byForm=false,limit=36,version=0,ready=false;
function refresh(){
 const q=search.value.trim().toLowerCase(),byKey=new Map<string,Row>();
 for(const r of rows){
  if(filter.value&&r.game!==filter.value||q&&![r.id,r.name,r.game,r.edition].some(v=>v.toLowerCase().includes(q)))continue;
  const k=byForm?r.id:r.character;if(!byKey.has(k))byKey.set(k,r);
 }
 const list=[...byKey.values()];
 $('matches').textContent=list.length+(byForm?' 个造型':' 位人物');$('cards').replaceChildren(...list.slice(0,limit).map(r=>{
 const b=document.createElement('button');b.className='card';b.type='button';b.setAttribute('aria-pressed',String(byForm?r.id===current.id:r.character===current.character));
 const img=new Image();img.alt='';img.loading='lazy';if(r.cover)img.src=r.cover;const label=document.createElement('span');label.className='caption';
 const n=document.createElement('strong'),sub=document.createElement('small');n.textContent=r.name;sub.textContent=byForm?r.edition:r.game+' · '+families.get(r.character)!.length+' 个造型';label.append(n,sub);b.append(img,label);b.onclick=()=>void show(r);return b;
 }));$('more').hidden=list.length<=limit;
}
async function show(r:Row){
 const request=++version;current=r;ready=false;play.disabled=true;action.disabled=true;action.replaceChildren();frame.src='about:blank';$('caption').hidden=true;
 $('game').textContent=r.game;$('name').textContent=r.name;$('state').textContent='正在载入…';$('note').textContent='';$<HTMLAnchorElement>('source').href=r.source;
 variant.replaceChildren(...families.get(r.character)!.map(v=>new Option(v.edition,v.id)));variant.value=r.id;
 const u=new URL(location.href);u.searchParams.set('model',r.id);history.replaceState(null,'',u);refresh();
 try{
  const response=await fetch('/entries/'+r.id);if(!response.ok)throw Error('素材暂时无法读取，重新选择可重试');
  const entry=await response.json();if(request!==version)return;
  for(const [i,a] of entry.actions.entries())action.add(new Option(a.label+(a.sound?' · 原声':''),String(i)));
  const count=entry.actions.filter(a=>a.sound).length;
  $('note').textContent=count?entry.actions.length+' 个事件，其中 '+count+' 个有对应录音。':'此造型可手动预览原动作，当前素材没有配对录音。';
  frame.src='/stage.html?collection=1&model='+encodeURIComponent(r.id);
 }catch(e){if(request===version)$('state').textContent=e.message}
}
window.addEventListener('message',e=>{
 if(e.origin!==location.origin||e.source!==frame.contentWindow||e.data?.id!==current.id)return;
 const {type,text}=e.data;if(type==='ready'){ready=true;play.disabled=action.disabled=!action.length;$('state').textContent=''}
 if(type==='error')$('state').textContent=text;
 if(type==='caption'){$('caption').hidden=!text;$('caption').textContent=text}
});
play.onclick=()=>{if(ready)(frame.contentWindow as any)?.previewPlay?.(+action.value)};
variant.onchange=()=>void show(rows.find(r=>r.id===variant.value)!);
filter.onchange=search.oninput=()=>{limit=36;refresh()};
for(const [button,mode] of [['forms',true],['characters',false]] as const)$(button).onclick=()=>{byForm=mode;limit=36;$('forms').setAttribute('aria-pressed',String(mode));$('characters').setAttribute('aria-pressed',String(!mode));refresh()};
$('more').onclick=()=>{limit+=36;refresh()};
$('share').onclick=async()=>{try{await navigator.clipboard.writeText(location.href);$('share').textContent='已复制';setTimeout(()=>$('share').textContent='复制预览链接',1400)}catch{$('note').textContent=location.href}};
$('totals').textContent=new Set(rows.map(r=>r.game)).size+' 部作品 · '+families.size+' 位人物 · '+rows.length+' 个造型';
const params=new URLSearchParams(location.search);if(params.get('game'))filter.value=params.get('game')!;
await show(rows.find(r=>r.id===params.get('model'))||rows.find(r=>filter.value&&r.game===filter.value)||rows.find(r=>r.id==='az-lafei')!);
