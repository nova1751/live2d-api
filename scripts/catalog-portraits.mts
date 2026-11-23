// Render catalog card artwork from the same local collection and camera as the widget.
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { build, context } from 'esbuild';
import { chromium, type Page } from 'playwright-core';
import { readJson, repository, type Library } from './library-files.mts';

if (!process.argv[2]) throw new Error('Pass the downloaded library directory and optional model IDs');
const directory = resolve(process.argv[2]);
const catalog = readJson<Library>(join(directory, 'library.json'));
const all = Object.keys(catalog.models).filter(id => !id.startsWith('other/') && !catalog.presentation?.aliases[id]);
const selected = process.argv.slice(3);
if (selected.some(id => !all.includes(id))) throw new Error('Unknown model ID');
const destination = join(repository, 'catalog/portraits');
await mkdir(destination, { recursive: true });
const filename = (id: string) => join(destination, id.replaceAll('/', '--') + '.webp');
const ids = selected.length ? selected : all.filter(id => !existsSync(filename(id)));
const coreUrl = /data-core-url="([^"]+)"/.exec(await readFile(join(directory, 'viewer/catalog/index.html'), 'utf8'))?.[1];
const bundle = await build({
  entryPoints: [join(repository, 'src/pages/capture-portrait.ts')],
  format: 'esm', bundle: true, write: false,
});
const server = await context({ stdin: { contents: '' }, write: false });
const { port } = await server.serve({ servedir: directory, host: '127.0.0.1' });
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'] });
let next = 0, complete = 0;
const failures: string[] = [];
try {
  async function open() {
    const page = await browser.newPage({ viewport: { width: 450, height: 450 } });
    await page.route('**/portrait.html', route => route.fulfill({ contentType: 'text/html',
      body: '<canvas id="live2d" width="400" height="400"></canvas><script type="module" src="portrait.js"></script>' }));
    await page.route('**/portrait.js', route => route.fulfill({ contentType: 'text/javascript', body: bundle.outputFiles[0].text }));
    await page.goto('http://127.0.0.1:' + port + '/viewer/catalog/portrait.html');
    await page.waitForFunction(() => typeof window.portrait === 'function');
    return page;
  }
  async function worker() {
    let page: Page | undefined;
    try {
      while (next < ids.length) {
        const i = next++, id = ids[i];
        try {
          page ??= await open();
          const encoded = await page.evaluate(({ id, coreUrl }) => Promise.race([
            window.portrait(id, coreUrl),
            new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Render timed out')), 30000))
          ]), { id, coreUrl });
          await writeFile(filename(id), Buffer.from(encoded, 'base64'));
          if (++complete % 30 === 0) console.log(complete + '/' + ids.length);
        } catch (error) {
          failures.push(id);
          console.error(id, String(error).slice(0, 240));
          await page?.close();
          page = undefined;
        }
        if (page && i % 8 === 0) { await page.close(); page = undefined; }
      }
    } finally { await page?.close(); }
  }
  await Promise.all(Array.from({ length: Math.min(3, ids.length) }, worker));
} finally { await browser.close(); await server.dispose(); }
console.log(complete, 'portraits written;', failures.length, 'failed');
if (failures.length) process.exitCode = 1;
declare global {
  interface Window { portrait(id: string, coreUrl?: string): Promise<string> }
}
