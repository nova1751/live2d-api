import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { context } from 'esbuild';

// Opt-in network smoke test. The sample models and proprietary Core stay at their publishers.
const server = await context({ stdin: { contents: '' }, write: false });
let browser;
try {
  const { port } = await server.serve({ servedir: '.', host: '127.0.0.1' });
  const base = process.argv[2] || `http://127.0.0.1:${port}/`;
  const samples = 'https://raw.githubusercontent.com/Live2D/CubismWebSamples/5-r.5/Samples/Resources/';
  browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
  const errors = [];
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
  for (const url of [...models, ...process.argv.slice(3)]) {
    await page.evaluate(url => window.loadlive2d('live2d', url), url);
    await drawn();
    assert.equal(await page.locator('canvas').count(), 2);
    console.log(decodeURI(url.split('/').slice(-3).join('/')) + ': rendered');
  }
  await page.evaluate(url => {
    window.loadlive2d.hide();
    window.loadlive2d.show(false);
    window.loadlive2d('live2d', url);
  }, base + 'model/AK12/ak12_0/normal/index.json');
  await page.waitForSelector('#live2d[data-painted]', { timeout: 60000 });
  assert.equal(await page.locator('canvas').count(), 1);
  assert.deepEqual(errors, []);
} finally {
  await browser?.close();
  await server.dispose();
}
