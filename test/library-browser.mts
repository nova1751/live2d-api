// Run against a collection created by scripts/download-models.mts.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { context } from 'esbuild';
import { chromium } from 'playwright-core';

const directory = resolve(process.argv[2]);
const catalog = JSON.parse(await readFile(resolve(directory, 'library.json'), 'utf8'));
const server = await context({ stdin: { contents: '' }, write: false });
let browser;
try {
  const { port } = await server.serve({ servedir: directory, host: '127.0.0.1' });
  browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1100, height: 850 }, reducedMotion: 'reduce' });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => {
    window.lines = [];
    window.sounds = [];
    window.ends = [];
    const start = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      window.sounds.push(this.currentSrc || this.src);
      return start.call(this);
    };
    window.addEventListener('live2d:dialogue', e => window.lines.push(e.detail));
    window.addEventListener('live2d:dialogue-end', e => window.ends.push(e.detail.interrupted));
    for (const proto of [WebGLRenderingContext.prototype, WebGL2RenderingContext.prototype]) {
      const draw = proto.drawElements;
      proto.drawElements = function (...args) {
        draw.apply(this, args);
        if (this.canvas.dataset.painted || this.getParameter(this.FRAMEBUFFER_BINDING)) return;
        const pixels = new Uint8Array(this.drawingBufferWidth * this.drawingBufferHeight * 4);
        this.readPixels(0, 0, this.drawingBufferWidth, this.drawingBufferHeight, this.RGBA, this.UNSIGNED_BYTE, pixels);
        if (pixels.some((v, i) => i % 4 === 3 && v)) this.canvas.dataset.painted = '1';
      };
    }
  });
  await page.goto('http://127.0.0.1:' + port + '/viewer/catalog/?model=doll/56-1type/7706/normal');
  await page.waitForSelector('canvas[data-painted]', { timeout: 45000 });
  await page.waitForFunction(() => document.querySelector('#result').dataset.model?.endsWith('/normal'));
  assert.equal(await page.locator('#waifu-tool button').count(), 7);
  assert.equal(await page.locator('#waifu-tips').evaluate(el => getComputedStyle(el).animationName), 'none');
  assert.deepEqual(await page.evaluate(() => sounds), []);
  assert.equal(await page.locator('#category option[value="other"]').count(), 0);
  const outside = Object.keys(catalog.models).find(id => id.startsWith('other/'));
  if (outside) await assert.rejects(page.evaluate(async id => {
    const { selectWidgetModel } = await import('/viewer/widget.mjs');
    await selectWidgetModel(id);
  }, outside), /outside the selected collection/);
  const rect = await page.locator('canvas[data-painted]').boundingBox();
  for (let y = 0.12; y < 0.9; y += 0.08) {
    for (const x of [0.5, 0.42, 0.58]) {
      await page.mouse.click(rect.x + x * rect.width, rect.y + y * rect.height);
      if (await page.evaluate(() => lines.length)) break;
    }
    if (await page.evaluate(() => lines.length)) break;
  }
  await page.waitForFunction(() => lines.length && sounds.length);
  const line = await page.evaluate(() => lines.at(-1));
  assert.match(line, /[\u3400-\u9fff]/);
  assert.equal(await page.locator('#waifu-tips').textContent(), line);
  await page.waitForFunction(() => ends.includes(false), undefined, { timeout: 45000 });
  await page.waitForFunction(() => !document.querySelector('#waifu-tips').classList.contains('waifu-tips-active'));
  console.log('Touch triggered a voiced caption through completion:', line);

  // Stall an uncached manifest, then supersede that switch with a Cubism 2 model.
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/4type_5305.model3.json', async route => {
    await gate;
    await route.continue().catch(() => {});
  });
  const slow = page.evaluate(async () => {
    const { selectWidgetModel } = await import('/viewer/widget.mjs');
    await selectWidgetModel('doll/4type/5305/normal');
  });
  await page.waitForSelector('#waifu[data-model-loading] .waifu-model-still');
  const painted = await page.locator('.waifu-model-still').evaluate(canvas => {
    const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    return pixels.some((v, i) => i % 4 === 3 && v > 16);
  });
  assert.ok(painted, 'previous model stays visible while the new assets load');
  const replacement = page.evaluate(async () => {
    const { selectWidgetModel } = await import('/viewer/widget.mjs');
    await selectWidgetModel('fairy/air_attack/1/default');
  });
  await replacement;
  release();
  await slow;
  await page.waitForSelector('#waifu:not([data-model-loading])');
  assert.equal(await page.locator('.waifu-model-still').count(), 0);
  assert.equal(await page.locator('#result').getAttribute('data-model'), 'fairy/air_attack/1/default');
  console.log('Delayed and superseded model switch retained a painted frame');

  const keys = process.argv.includes('--all') ? Object.keys(catalog.models).filter(id => !id.startsWith('other/')) : ['doll/an94/archive/normal', 'fairy/air_attack/1/default'];
  for (const id of keys) {
    await page.evaluate(async id => {
      const { selectWidgetModel } = await import('/viewer/widget.mjs');
      await selectWidgetModel(id);
    }, id);
    await page.waitForSelector('canvas[data-painted]:visible', { timeout: 25000 });
  }
  await page.getByRole('button', { name: '收起看板娘' }).focus();
  await page.keyboard.press('Enter');
  const toggle = page.getByRole('button', { name: '打开看板娘' });
  await toggle.waitFor();
  await page.waitForFunction(() => document.activeElement?.id === 'waifu-toggle');
  await page.keyboard.press('Space');
  await page.waitForSelector('#waifu:visible');
  assert.deepEqual(errors, []);
  console.log(keys.length, 'catalog selections and keyboard close/reopen passed');
} finally {
  await browser?.close();
  await server.dispose();
}
