import { checkCollectionShortcut } from './collection-shortcut.mts';
import { checkPaintOverflow } from './paint-overflow.mts';
import { checkResilience } from './resilience.mts';
import { checkNativeEvents, checkPackedCues, openLegacyDemo } from './native-events.mts';
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
  const modernRequests = [];
  const motionFiles = [];
  const voices = [];
  page.on('request', request => {
    const path = new URL(request.url()).pathname;
    if (path.includes('/modern/') || path.includes('live2dcubismcore')) modernRequests.push(path);
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
  // Exercise the historical loader independently of the public Girls’ Frontline demo.
  await openLegacyDemo(page, url);
  await page.waitForSelector('#live2d[data-painted="true"]', { timeout: 45000 });
  const canvas = page.locator('#live2d');
  await page.addStyleTag({ content: '#waifu {transition:none!important;bottom:0!important} #waifu-tips {visibility:hidden}' });
  const mountedCanvas = await canvas.elementHandle();
  const normalWidth = (await canvas.boundingBox()).width;
  const enlarge = page.locator('#waifu-tool-expand');
  await enlarge.focus();
  await enlarge.press('Enter');
  await page.waitForSelector('#waifu-expanded[open] #live2d');
  const fittedWidth = (await canvas.boundingBox()).width;
  assert.ok(fittedWidth > normalWidth);
  const viewer = page.locator('#waifu-expanded');
  const slider = viewer.getByRole('slider');
  const percent = viewer.getByRole('spinbutton');
  await percent.fill('175');
  await percent.press('Enter');
  assert.equal(await slider.inputValue(), '175');
  assert.ok(Math.abs((await canvas.boundingBox()).width / fittedWidth - 1.75) < 0.05);
  await slider.press('ArrowRight');
  assert.equal(await percent.inputValue(), '176');
  const fullscreen = viewer.getByRole('button', { name: '全屏', exact: true });
  await fullscreen.click();
  await page.waitForFunction(() => !!document.fullscreenElement);
  assert.equal(await percent.inputValue(), '176');
  await percent.fill('400');
  await percent.press('Enter');
  assert.equal(await slider.inputValue(), '300');
  await viewer.getByRole('button', { name: '退出全屏' }).click();
  await page.waitForFunction(() => !document.fullscreenElement);
  assert.equal(await percent.inputValue(), '300');
  await viewer.getByRole('button', { name: '适应窗口' }).click();
  assert.equal(await percent.inputValue(), '100');
  assert.ok(Math.abs((await canvas.boundingBox()).width - fittedWidth) < 1);
  await page.keyboard.press('Escape');
  await page.waitForSelector('#waifu-expanded', { state: 'detached' });
  assert.ok(await mountedCanvas.evaluate(el => el === document.getElementById('live2d')));
  assert.ok(await enlarge.evaluate(el => el === document.activeElement));
  const before = await canvas.screenshot();
  await canvas.hover();
  await page.mouse.click(650, 180);
  await page.evaluate(() => document.dispatchEvent(new MouseEvent('mouseout')));
  assert.ok(!before.equals(await canvas.screenshot()), 'model should animate without a click');
  const nextModel = page.waitForResponse(response =>
    response.url().endsWith('/model/fairy/air_attack/02/index.json') && response.ok());
  await page.locator('#waifu-tool-switch-texture').dispatchEvent('click');
  await nextModel;
  await page.locator('#waifu[data-model-pending]').waitFor({ state: 'detached' });
  assert.equal(await page.evaluate(() => localStorage.getItem('modelTexturesId')), '1');
  assert.ok(motionFiles.length && motionFiles.every(path => path.includes('/motions/daiji_idle')), JSON.stringify(motionFiles));
  assert.deepEqual(voices, []);
  const catalog = await (await page.request.get(url + 'model_list.json')).json();
  const skin = 'kp31/kp31_/normal';
  const id = catalog.models.findIndex(skins => skins.includes(skin));
  const texture = catalog.models[id].indexOf(skin);
  await page.evaluate(([id, texture]) => {
    localStorage.setItem('modelId', id);
    localStorage.setItem('modelTexturesId', texture);
  }, [id, texture]);
  // The first touch interaction in this skin has a known motion and recording.
  await page.addInitScript(() => { Math.random = () => 0; });
  const motionPath = '**/motions/wedding.mtn';
  const audioPath = '**/sounds/KP31_029.mp3';
  // Exercise both quirks found in real Cubism 2 exports against the paired-playback test.
  await page.route('**/kp31/kp31_/normal/index.json', async route => {
    const response = await route.fetch();
    const model = await response.json();
    const clip = Object.values(model.motions).flat().find(entry => entry.file === 'motions/wedding.mtn');
    clip.priority = 0;
    const body = JSON.stringify(model).slice(0, -1) + ',}';
    await route.fulfill({ response, body });
  });
  for (const scenario of ['failure and retry', 'motion delayed', 'voice delayed']) {
    const gesture = scenario === 'voice delayed' ? 'tap' : 'click';
    await page.reload();
    await page.waitForSelector('#live2d[data-painted="true"]', { timeout: 45000 });
    assert.ok(motionFiles.length && motionFiles.every(path => path.includes('/motions/daiji_idle')));
    assert.deepEqual(voices, []);
    await page.evaluate(() => {
      window.events = [];
      let frame = 0;
      function tick() { frame++; requestAnimationFrame(tick); }
      requestAnimationFrame(tick);
      const startMotion = MotionQueueManager.prototype.startMotion;
      MotionQueueManager.prototype.startMotion = function (motion, ...rest) {
        if (this.currentPriority === 3) {
          window.events.push({ type: 'motion', frame, time: performance.now() });
          window.pairedMotion = motion;
        } else if (window.pairedMotion) {
          window.returnedToIdle = true;
        }
        return startMotion.call(this, motion, ...rest);
      };
      const play = AudioBufferSourceNode.prototype.start;
      AudioBufferSourceNode.prototype.start = function (...args) {
        play.apply(this, args);
        window.speakingContext = this.context;
        window.events.push({ type: 'voice', frame, time: performance.now() });
      };
    });
    const activate = () => canvas[gesture]({ position: { x: 160, y: 225 } });
    if (scenario === 'failure and retry') {
      // A missing clip or motion must release the reservation so the next tap can retry.
      for (const path of [motionPath, audioPath]) {
        await page.route(path, route => route.fulfill({ status: 403, body: 'Forbidden' }));
        const failed = page.waitForEvent('console', msg => msg.text().includes('Interaction could not start'));
        await activate();
        await failed;
        assert.deepEqual(await page.evaluate(() => window.events), []);
        await page.unroute(path);
      }
      await activate();
      await page.waitForFunction(() => window.events.length === 2);
      motionFiles.length = voices.length = 0;
      continue;
    }
    // Hold one response, then give the other asset several frames to finish on its own.
    const slow = gesture === 'click' ? motionPath : audioPath;
    const fast = gesture === 'click' ? audioPath : motionPath;
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    await page.route(slow, async route => { await gate; await route.continue(); });
    const fastResponse = page.waitForResponse(fast);
    const pending = page.waitForRequest(slow);
    await activate();
    await pending;
    await (await fastResponse).finished();
    await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 300)));
    assert.deepEqual(await page.evaluate(() => window.events), [], 'neither half starts alone');
    release();
    await page.waitForFunction(() => window.events.length === 2);
    const [voice, motion] = await page.evaluate(() => window.events);
    assert.equal(voice.type, 'voice');
    assert.equal(motion.type, 'motion');
    assert.equal(voice.frame, motion.frame, 'voice and motion must start in one animation frame');
    console.log(gesture, 'paired start difference (ms)', Math.round(motion.time - voice.time));
    await page.evaluate(async () => {
      await window.speakingContext.suspend();
      const before = window.pairedMotion.playbackTimeMSec();
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      if (before !== window.pairedMotion.playbackTimeMSec()) throw Error('Motion advanced with suspended audio');
      await window.speakingContext.resume();
    });
    await page.waitForFunction(() => window.returnedToIdle);
    assert.equal(await page.evaluate(() => window.events.length), 2);
    assert.equal(new Set(voices).size, 1);
    await page.unroute(slow);
    motionFiles.length = voices.length = 0;
  }
  assert.deepEqual(modernRequests, []);
  await checkNativeEvents(browser, url);
  await checkPackedCues(browser, url);
  await checkPaintOverflow(browser, url);
  await checkCollectionShortcut(browser, url);
  await checkResilience(browser, url);
  assert.deepEqual(errors, []);
  console.log('Verified natural idle animation, silent skin changes, paired mouse/touch interactions and return to idle.');
} finally {
  await browser?.close();
  await server.dispose();
}
