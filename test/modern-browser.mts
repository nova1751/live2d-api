import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { context } from 'esbuild';

async function girlsFrontlineModels() {
  const root = new URL('../catalog/girls-frontline/', import.meta.url);
  const read = async path => JSON.parse(await readFile(new URL(path, root), 'utf8'));
  const { sources, characters } = await read('index.json');
  const urls = [];
  for (const character of characters) {
    for (const version of (await read(character.path)).versions) {
      for (const entry of (await read(version.path)).forms) {
        const form = await read(entry.path);
        if (form.sources.some(source => source.format !== 'moc3')) continue;
        const source = form.sources.find(s => s.repository === 'jacksen168' && s.manifest)
          ?? form.sources.find(s => s.manifest);
        assert.ok(source, 'Missing model3.json in ' + entry.path);
        const { repository, commit } = sources[source.repository];
        urls.push(repository.replace('github.com', 'raw.githubusercontent.com') + '/' + commit + '/'
          + source.manifest.split('/').map(encodeURIComponent).join('/'));
      }
    }
  }
  return urls;
}

// Opt-in network smoke test. The sample models and proprietary Core stay at their publishers.
const server = await context({ stdin: { contents: '' }, write: false });
let browser;
try {
  const { port } = await server.serve({ servedir: '.', host: '127.0.0.1' });
  const args = process.argv.slice(2).filter(arg => arg !== '--girls-frontline');
  const base = args.shift() || `http://127.0.0.1:${port}/`;
  const samples = 'https://raw.githubusercontent.com/Live2D/CubismWebSamples/5-r.5/Samples/Resources/';
  browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
  const errors = [];
  const legacyRequests = [];
  page.on('request', request => { if (new URL(request.url()).pathname.endsWith('/live2d.min.js')) legacyRequests.push(request.url()); });
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') console.error(message.text()); });
  page.on('requestfailed', r => {
    if (r.failure()?.errorText !== 'net::ERR_ABORTED') console.error(r.url(), r.failure()?.errorText);
  });
  await page.route('**/smoke.html', route => route.fulfill({ contentType: 'text/html',
    body: `<!doctype html><script defer src="${base}autoload.js" data-model-url="${samples}Haru/Haru.model3.json"></script>` }));
  await page.addInitScript(() => {
    // Read from the visible drawing buffer during drawing, before the browser clears it.
    for (const proto of [WebGLRenderingContext.prototype, WebGL2RenderingContext.prototype]) {
      const draw = proto.drawElements;
      proto.drawElements = function (...args) {
        draw.apply(this, args);
        if (this.canvas.dataset.painted || this.getParameter(this.FRAMEBUFFER_BINDING)) return;
        const rgba = new Uint8Array(this.drawingBufferWidth * this.drawingBufferHeight * 4);
        this.readPixels(0, 0, this.drawingBufferWidth, this.drawingBufferHeight, this.RGBA, this.UNSIGNED_BYTE, rgba);
        if (rgba.some((value, i) => i % 4 === 3 && value > 0)) this.canvas.dataset.painted = 'true';
      };
    }
  });
  await page.goto(`http://127.0.0.1:${port}/smoke.html`);
  const drawn = () => page.waitForSelector('canvas[data-painted]', { timeout: 90000 });
  await drawn();
  assert.equal(await page.locator('#waifu-tool-switch-model').count(), 0);
  console.log('Haru (MOC3 v1): rendered via autoload');
  const models = ['Mao', 'Ren'].map(name => samples + name + '/' + name + '.model3.json');
  if (process.argv.includes('--girls-frontline')) models.push(...await girlsFrontlineModels());
  for (const url of [...models, ...args]) {
    await page.evaluate(url => window.loadlive2d('live2d', url), url);
    await drawn();
    assert.equal(await page.locator('canvas').count(), 2);
    console.log(decodeURI(url.split('/').slice(-3).join('/')) + ': rendered');
  }
  assert.equal(legacyRequests.length, 0, 'A modern-only page should never download Cubism 2');
  await page.evaluate(url => {
    window.loadlive2d.hide();
    window.loadlive2d.show(false);
    window.loadlive2d('live2d', url);
  }, (process.env.LIVE2D_TEST_MODELS || base) + 'model/AK12/ak12_0/normal/index.json');
  await page.waitForSelector('#live2d[data-painted]', { timeout: 60000 });
  assert.equal(await page.locator('canvas').count(), 1);
  assert.equal(legacyRequests.length, 1);
  assert.deepEqual(errors, []);

  const id = 'test/haru/base/default';
  await page.route(base + 'modern-collection.json', route => route.fulfill({ json: {
    schemaVersion: 1, sources: { samples: { baseUrl: samples } },
    models: { [id]: [{ source: 'samples', manifest: 'Haru/Haru.model3.json' }] },
  } }));
  await page.route(base + 'floating-collection.html', route => route.fulfill({ contentType: 'text/html',
    body: '<!doctype html><body></body>' }));
  await page.goto(base + 'floating-collection.html');
  await page.evaluate(async ({ base, id }) => {
    const { loadWidget } = await import(base + 'widget.mjs');
    await loadWidget({ baseUrl: base, catalogUrl: base + 'modern-collection.json', collection: 'girls-frontline', modelId: id });
  }, { base, id });
  await page.waitForSelector('#waifu:not([data-initial-framing]):not([data-model-loading]) .waifu-model-stage canvas[data-painted]', { timeout: 90000 });
  assert.deepEqual(errors, []);
  console.log('Floating modern catalog reveals its first framed paint');
} finally {
  await browser?.close();
  await server.dispose();
}
