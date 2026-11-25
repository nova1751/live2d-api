import {chromium} from 'playwright-core';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const dir=fileURLToPath(new URL('.local/portraits/',import.meta.url));await mkdir(dir,{recursive:true});
const local='http://127.0.0.1:8801/';
const catalog=await (await fetch(local+'catalog.json')).json();
const browser=await chromium.launch({args:['--enable-unsafe-swiftshader']});
try{
 for(const row of catalog.filter(r=>r.id.startsWith('bh-'))){
  const page=await browser.newPage({viewport:{width:480,height:480}});
  try{
   page.on('pageerror',e=>console.log(row.id,e.message));
   await page.goto(local+'stage.html?collection=1&model='+row.id);
   await page.waitForFunction(()=>window.previewPortrait,null,{timeout:35000});
   const uri=await page.evaluate(()=>window.previewPortrait);
   await writeFile(dir+row.id+'.png',Buffer.from(uri.split(',')[1],'base64'));
   console.log(row.id,'portrait saved');
  }finally{await page.close()}
 }
}finally{await browser.close()}
