import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { chromium } from 'playwright-core';

const server = spawn(process.execPath, ['scripts/build.mjs', '--dev'], {
  stdio: ['ignore', 'pipe', 'inherit'],
});
let browser;
try {
  let url;
  for await (const line of createInterface({ input: server.stdout })) {
    url = line.match(/http:\/\/127\.0\.0\.1:\d+\//)?.[0];
    if (url) break;
  }
  assert.ok(url, 'development server started');
  browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  // Observe the actual framebuffer immediately after the renderer draws to it.
  await page.addInitScript(() => {
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
  const nextModel = page.waitForResponse(response =>
    response.url().endsWith('/model/fairy/air_attack/02/index.json') && response.ok());
  await page.locator('#waifu-tool-switch-texture').dispatchEvent('click');
  await nextModel;
  assert.equal(await page.evaluate(() => localStorage.getItem('modelTexturesId')), '1');
  assert.deepEqual(errors, []);
  console.log('WebGL rendered the first model and the page loaded the next skin.');
} finally {
  await browser?.close();
  server.kill();
}
