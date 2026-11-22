import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { context } from 'esbuild';
import { chromium } from 'playwright-core';

// CI serves the extracted npm tarball so a missing published asset fails the smoke test.
const servedir = resolve(process.argv[2] ?? '.');
const server = await context({ stdin: { contents: '' }, write: false });
let browser;
try {
  const { port } = await server.serve({ servedir, host: '127.0.0.1' });
  const url = `http://127.0.0.1:${port}/`;
  browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1024, height: 768 }, hasTouch: true });
  const errors = [];
  const motionFiles = [];
  const voices = [];
  page.on('request', request => {
    const path = new URL(request.url()).pathname;
    if (path.endsWith('.mtn')) motionFiles.push(path);
    if (path.endsWith('.mp3')) voices.push(path);
  });
  page.on('pageerror', error => errors.push(error.message));
  // Observe the actual framebuffer immediately after the renderer draws to it.
  await page.addInitScript(() => {
    sessionStorage.setItem('Sleepy', '1');
    const gl = WebGLRenderingContext.prototype;
    const draw = gl.drawElements;
    gl.drawElements = function (...args) {
      draw.apply(this, args);
      if (this.canvas.id !== 'live2d') return;
      const pixels = new Uint8Array(this.drawingBufferWidth * this.drawingBufferHeight * 4);
      this.readPixels(0, 0, this.drawingBufferWidth, this.drawingBufferHeight, this.RGBA, this.UNSIGNED_BYTE, pixels);
      if (pixels.some((value, i) => i % 4 === 3 && value > 0)) {
        this.canvas.dataset.painted = 'true';
        gl.drawElements = draw;
      }
    };
  });
  await page.goto(url);
  await page.waitForSelector('#live2d[data-painted="true"]', { timeout: 45000 });
  const canvas = page.locator('#live2d');
  await page.addStyleTag({ content: '#waifu {transition:none!important;bottom:0!important} #waifu-tips {visibility:hidden}' });
  const before = await canvas.screenshot();
  await canvas.hover();
  await page.mouse.click(650, 180);
  await page.evaluate(() => document.dispatchEvent(new MouseEvent('mouseout')));
  await page.clock.install();
  await page.clock.fastForward(60_000);
  assert.deepEqual(await canvas.screenshot(), before, 'resting pose changed without a click');
  const nextModel = page.waitForResponse(response =>
    response.url().endsWith('/model/fairy/air_attack/02/index.json') && response.ok());
  await page.locator('#waifu-tool-switch-texture').dispatchEvent('click');
  await nextModel;
  assert.equal(await page.evaluate(() => localStorage.getItem('modelTexturesId')), '1');
  assert.deepEqual(motionFiles, []);
  assert.deepEqual(voices, []);
  const catalog = await (await page.request.get(url + 'model_list.json')).json();
  const skin = 'kp31/kp31_1103/normal';
  const id = catalog.models.findIndex(skins => skins.includes(skin));
  const texture = catalog.models[id].indexOf(skin);
  await page.evaluate(([id, texture]) => {
    localStorage.setItem('modelId', id);
    localStorage.setItem('modelTexturesId', texture);
  }, [id, texture]);
  // The first touch interaction in this skin has a known motion and recording.
  await page.addInitScript(() => { Math.random = () => 0; });
  for (const gesture of ['click', 'tap']) {
    await page.reload();
    await page.waitForSelector('#live2d[data-painted="true"]', { timeout: 45000 });
    assert.deepEqual(motionFiles, []);
    assert.deepEqual(voices, []);
    await page.evaluate(() => {
      window.interactions = { motions: 0, plays: 0 };
      const start = MotionQueueManager.prototype.startMotion;
      MotionQueueManager.prototype.startMotion = function (...args) {
        window.interactions.motions++;
        return start.apply(this, args);
      };
      const play = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function () {
        this.addEventListener('playing', () => window.interactions.plays++, { once: true });
        return play.call(this);
      };
    });
    const motion = page.waitForResponse(r => r.url().endsWith('/motions/touch_1.mtn') && r.ok());
    const audio = page.waitForResponse(r => r.url().endsWith('/sounds/KP31_005.mp3') && r.ok());
    await canvas[gesture]({ position: { x: 160, y: 225 } });
    await Promise.all([motion, audio]);
    await page.waitForFunction(() => window.interactions.motions === 1 && window.interactions.plays === 1);
    await page.clock.fastForward(60_000);
    assert.deepEqual(await page.evaluate(() => window.interactions), { motions: 1, plays: 1 });
    assert.equal(motionFiles.length, 1, 'one gesture should play one action');
    assert.equal(new Set(voices).size, 1, 'one gesture should play one recording');
    motionFiles.length = voices.length = 0;
  }
  assert.deepEqual(errors, []);
  console.log('Verified static rendering, silent skin changes and one action with its voice per mouse click or touch.');
} finally {
  await browser?.close();
  await server.dispose();
}
