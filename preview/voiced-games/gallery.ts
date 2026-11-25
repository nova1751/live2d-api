import type {Entry} from './types';
const entries:Entry[]=await (await fetch('catalog.json')).json();
const $=<T extends HTMLElement>(s:string)=>document.querySelector<T>(s)!;
const frame=$<HTMLIFrameElement>('#frame'),state=$('#state'),caption=$('#caption');
let current:Entry,filter='全部',ready=false;
function button(label:string,fn:()=>void){const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=fn;return b;}
function cards(){
 const list=entries.filter(e=>filter==='全部'||e.game===filter);
 $('#total').textContent=list.length+' 位角色';
 $('#cards').replaceChildren(...list.map(e=>{
  const b=button('',()=>select(e));b.setAttribute('aria-pressed',String(current?.id===e.id));b.dataset.id=e.id;
  const img=new Image();img.src='portraits/'+e.id+'.png';img.alt='';const n=document.createElement('strong'),g=document.createElement('small');
  n.textContent=e.name;g.textContent=e.game;b.append(img,n,g);return b;
 }));
}
function select(e:Entry){
 current=e;ready=false;state.hidden=false;state.textContent='正在载入'+e.name+'…';caption.hidden=true;
 $('#name').textContent=e.name;$('#meta').textContent=e.game+' / '+e.edition;$('#count').textContent=e.actions.length+' 个互动，其中 '+e.actions.filter(a=>a.sound).length+' 个带原声';
 $('#events').replaceChildren(...e.actions.map((a,i)=>{const b=button(a.label,()=>{if(ready)(frame.contentWindow as any)?.previewPlay?.(i)});b.disabled=true;return b}));
 const link=new URL(location.href);link.searchParams.set('model',e.id);history.replaceState(null,'',link);
 frame.src='stage.html?model='+encodeURIComponent(e.id);cards();
}
window.addEventListener('message',event=>{
 const m=event.data;
 if(event.origin!==location.origin||event.source!==frame.contentWindow||m?.id!==current.id)return;
 if(m.type==='ready'){ready=true;state.hidden=true;$('#events').querySelectorAll('button').forEach(b=>b.disabled=false);}
 if(m.type==='caption'){caption.textContent=m.text;caption.hidden=!m.text;$('#events').querySelectorAll('button').forEach((b,i)=>b.classList.toggle('active',Boolean(m.text)&&m.text===current.actions[i].caption));}
 if(m.type==='error'){state.hidden=false;state.textContent=m.text;}
});
for(const name of ['全部',...new Set(entries.map(e=>e.game))]){
 const b=button(name,()=>{filter=name;$('#filters').querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));cards()});
 b.setAttribute('aria-pressed',String(name===filter));$('#filters').append(b);
}
select(entries.find(e=>e.id===new URL(location.href).searchParams.get('model'))??entries[0]);
