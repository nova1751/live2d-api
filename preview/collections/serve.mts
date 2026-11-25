import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {join, extname} from 'node:path';
import {build} from 'esbuild';
import {base,cache,rows,detail,asset,cover} from './sources.mts';
import {legacyPreview} from '../voiced-games/legacy.mts';
const repo=join(base,'../..'),voiced=join(base,'../voiced-games');
const bundle=async(file:string)=>(await build({entryPoints:[file],bundle:true,format:'esm',target:'es2022',write:false})).outputFiles[0].contents;
const fixed=new Map<string,Uint8Array|string>(await Promise.all([
 ['/',readFile(join(base,'index.html'))],['/gallery.css',readFile(join(repo,'catalog/gallery.css'))],['/collections.css',readFile(join(base,'style.css'))],['/gallery.js',bundle(join(base,'gallery.ts'))],['/stage.js',bundle(join(voiced,'stage.ts'))],['/stage.html',readFile(join(voiced,'stage.html'))],['/legacy.js',legacyPreview()],['/core.js',readFile(process.env.CUBISM_CORE_PATH||join(voiced,'.local/site/core.js'))]
].map(async ([url,p])=>[url,await p])));
const types={'.js':'text/javascript','.css':'text/css','.html':'text/html','.json':'application/json','.png':'image/png','.ogg':'audio/ogg','.wav':'audio/wav','.mp3':'audio/mpeg'};
const server=createServer(async(req,res)=>{
 try{
 const p=decodeURIComponent(new URL(req.url||'/','http://localhost').pathname),[,route,id,...tail]=p.split('/');
 let content,type=types[extname(p)]||'application/octet-stream';
 if(fixed.has(p)){content=fixed.get(p);if(p==='/')type='text/html'}
 else if(p==='/catalog.json'){content=JSON.stringify(rows);type='application/json'}
 else if(route==='entries'&&id&&!tail.length){const row=await detail(id);if(row)content=JSON.stringify(row);type='application/json'}
 else if(route==='models'&&id&&tail.length)content=await asset(id,tail.join('/'));
 else if(route==='cover'&&id&&!tail.length){content=await cover(id);type='image/png'}
 else if(route==='portrait'&&/^bh-[\w.-]+\.png$/.test(id)&&!tail.length)content=await readFile(join(cache,'portraits',id)).catch(()=>null);
 if(!content){res.writeHead(404).end();return}res.writeHead(200,{'Content-Type':type,'X-Content-Type-Options':'nosniff'}).end(content);
 }catch(e){console.error(req.url,e.message);res.writeHead(502,{'Content-Type':'text/plain;charset=utf-8'}).end(e.message)}
});
server.listen(8801,'127.0.0.1',()=>console.log('http://127.0.0.1:8801/'));
