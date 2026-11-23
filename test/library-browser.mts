// Run against a collection created by scripts/download-models.mts.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { context } from 'esbuild';
import { chromium } from 'playwright-core';

const english = process.argv.includes('--en');
const lang = english ? 'en' : 'zh-CN';
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
    const urls = new WeakMap();
    const read = Response.prototype.arrayBuffer;
    Response.prototype.arrayBuffer = async function () {
      const bytes = await read.call(this);
      urls.set(bytes, this.url);
      return bytes;
    };
    const decode = AudioContext.prototype.decodeAudioData;
    AudioContext.prototype.decodeAudioData = async function (bytes) {
      const buffer = await decode.call(this, bytes);
      urls.set(buffer, urls.get(bytes));
      return buffer;
    };
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args) {
      window.sounds.push(urls.get(this.buffer));
      window.scheduledDelay = args[0] - this.context.currentTime;
      const result = start.apply(this, args);
      if (window.suspendOnStart) {
        window.suspendOnStart = false;
        window.speakingContext = this.context;
        window.suspended = this.context.suspend();
      }
      return result;
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
  const modelBinary = /\.moc3?(?:\?|$)/i;
  let releaseBinary!: () => void;
  const pendingBinary = new Promise<void>(resolve => { releaseBinary = resolve; });
  await page.route(modelBinary, async route => { await pendingBinary; await route.continue(); });
  await page.goto('http://127.0.0.1:' + port + '/viewer/catalog/?model=doll/56-1type/7706/normal&lang=' + lang, { waitUntil: 'domcontentloaded' });
  const widget = page.locator('#waifu');
  await widget.waitFor({ state: 'attached' });
  assert.equal(await widget.isVisible(), false, 'the temporary square frame should stay hidden');
  releaseBinary();
  await widget.waitFor({ state: 'visible', timeout: 45000 });
  assert.ok(await widget.evaluate(el => el.style.getPropertyValue('--waifu-aspect')), 'first visible frame has its measured aspect');
  await page.unroute(modelBinary);
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
  await page.waitForSelector('#waifu:not([data-model-loading])');
  const rect = await page.locator('.waifu-viewport').boundingBox();
  async function checkControls(inRow: boolean) {
    const bounds = await page.locator('.waifu-viewport').boundingBox();
    const tips = await page.locator('#waifu-tips').boundingBox();
    const tools = await page.locator('#waifu-tool').boundingBox();
    const panel = await page.locator('#stage').boundingBox();
    assert.ok(tips.y >= panel.y && tips.y + tips.height < bounds.y);
    assert.ok(Math.abs(tips.x + tips.width / 2 - bounds.x - bounds.width / 2) <= 1);
    assert.ok(tools.x + tools.width <= panel.x + panel.width + 1);
    if (inRow) {
      assert.ok(tools.y + tools.height <= bounds.y);
      assert.ok(tips.y + tips.height <= tools.y);
    } else {
      assert.ok(tools.x >= bounds.x + bounds.width);
      assert.ok(Math.abs(tools.y + tools.height / 2 - bounds.y - bounds.height / 2) <= 1);
    }
  }
  await checkControls(false);
  let tap = { x: 0, y: 0 };
  searchHit: for (let y = 0.12; y < 0.9; y += 0.08) {
    for (const x of [0.5, 0.42, 0.58]) {
      tap = { x: rect.x + x * rect.width, y: rect.y + y * rect.height };
      const requested = page.waitForRequest(/\.ogg$/i, { timeout: 350 }).catch(() => null);
      await page.mouse.click(tap.x, tap.y);
      if (await requested) break searchHit;
    }
  }
  await page.waitForFunction(() => lines.length && sounds.length);
  const line = await page.evaluate(() => lines.at(-1));
  if (english) {
    const asset = catalog.models['doll/56-1type/7706/normal'][0];
    const metadata = JSON.parse(await readFile(resolve(directory, 'sources', asset.source, asset.dialogue), 'utf8'));
    const sound = new URL(await page.evaluate(() => sounds.at(-1))).pathname.toUpperCase();
    assert.ok(Object.values(metadata.voiceData).some(v => v.caption === line &&
      sound.endsWith('/' + (v.char_code + '_' + v.voice_key + '_JP.OGG').toUpperCase())));
    assert.equal(await page.locator('html').getAttribute('lang'), 'en');
    assert.match(await page.locator('#language').getAttribute('href'), /lang=zh-CN/);
    assert.match(await page.locator('#variant option:checked').textContent(), /Peerless Nunchaku Dance/);
  } else assert.match(line, /[\u3400-\u9fff]/);
  assert.equal(await page.locator('#waifu-tips').textContent(), line);
  await page.waitForFunction(() => ends.includes(false), undefined, { timeout: 45000 });
  await page.waitForFunction(() => !document.querySelector('#waifu-tips').classList.contains('waifu-tips-active'));
  console.log('Touch triggered a voiced caption through completion:', line);

  const replayModel = async () => {
    await page.evaluate(async () => {
      const { selectWidgetModel } = await import('/viewer/widget.mjs');
      await selectWidgetModel('doll/56-1type/7706/normal');
    });
    await page.waitForSelector('#waifu:not([data-model-loading])');
  };
  // Hold either asset on a cold model. A superseded click must never start a voice.
  for (const held of [/\/(?:wedding_touch|touch_\d+)\.motion3\.json/i, /\.ogg$/i]) {
    await replayModel();
    const before = await page.evaluate(() => [sounds.length, lines.length, ends.length]);
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    await page.route(held, async route => { await gate; await route.continue().catch(() => {}); });
    const pending = page.waitForRequest(held);
    await page.mouse.click(tap.x, tap.y);
    await pending;
    await page.mouse.click(tap.x, tap.y);
    await page.waitForTimeout(450);
    assert.deepEqual(await page.evaluate(() => [sounds.length, lines.length, ends.length]), before);
    release();
    await page.waitForFunction(n => ends.length > n, before[2], { timeout: 45000 });
    assert.deepEqual(await page.evaluate(() => [sounds.length, lines.length]), [before[0] + 1, before[1] + 1]);
    await page.unroute(held);
  }
  // A declared recording that fails to load must still allow the motion and its caption.
  await replayModel();
  await page.route(/\.ogg$/i, route => route.abort());
  const previous = await page.evaluate(() => [sounds.length, lines.length, ends.length]);
  await page.mouse.click(tap.x, tap.y);
  await page.waitForFunction(n => ends.length > n, previous[2], { timeout: 45000 });
  assert.deepEqual(await page.evaluate(() => [sounds.length, lines.length]), [previous[0], previous[1] + 1]);
  await page.unroute(/\.ogg$/i);
  console.log('Verified held motion, held voice, replacement clicks and unavailable recording');

  // A delayed voice and its caption must follow the audio clock through a pause.
  const metadataRoute = '**/56-1type_7706.data.json';
  await page.route(metadataRoute, async route => {
    const response = await route.fetch();
    const data = await response.json();
    for (const motion of Object.values(data.motionData)) motion.delay = 350;
    await route.fulfill({ response, json: data });
  });
  await replayModel();
  const beforeCue = await page.evaluate(() => {
    window.suspendOnStart = true;
    return [sounds.length, lines.length, ends.length];
  });
  await page.mouse.click(tap.x, tap.y);
  await page.waitForFunction(n => sounds.length > n, beforeCue[0]);
  await page.evaluate(() => window.suspended);
  await page.waitForTimeout(450);
  assert.ok(Math.abs(await page.evaluate(() => window.scheduledDelay) - 0.35) < 0.02);
  assert.equal(await page.evaluate(() => lines.length), beforeCue[1]);
  await page.evaluate(() => window.speakingContext.resume());
  await page.waitForFunction(n => ends.length > n, beforeCue[2], { timeout: 45000 });
  assert.equal(await page.evaluate(() => lines.length), beforeCue[1] + 1);
  await page.unroute(metadataRoute);
  console.log('Verified native voice delay and suspended audio clock');

  const tips = await (await page.request.get('http://127.0.0.1:' + port + (english ? '/viewer/waifu-tips.en.json' : '/viewer/waifu-tips.json'))).json();
  const presets = tips.click.find(rule => rule.selector === '#live2d').text;
  await page.mouse.click(rect.x + 2, rect.y + 2);
  assert.ok(presets.includes(await page.locator('#waifu-tips').textContent()), 'unmapped modern canvas click uses the preset');
  // Replay the same hit without a caption or an audio key, with a delayed game event.
  await page.route('**/56-1type_7706.data.json', async route => {
    const response = await route.fetch();
    const data = await response.json();
    for (const voice of Object.values(data.voiceData)) { voice.voice_key = ''; voice.caption = ''; }
    for (const motion of Object.values(data.motionData)) motion.delay = 350;
    await route.fulfill({ response, json: data });
  });
  await page.evaluate(async () => {
    const { selectWidgetModel } = await import('/viewer/widget.mjs');
    await selectWidgetModel('doll/56-1type/7706/normal');
  });
  await page.waitForSelector('#waifu:not([data-model-loading])');
  await page.evaluate(() => {
    document.getElementById('waifu-tips').textContent = '';
    window.presetCount = 0;
    window.addEventListener('live2d:preset', () => window.presetCount++);
  });
  const soundsBefore = await page.evaluate(() => sounds.length);
  await page.mouse.click(tap.x, tap.y);
  assert.equal(await page.locator('#waifu-tips').textContent(), '', 'no premature canvas hint before the configured delay');
  await page.waitForFunction(() => presetCount === 1);
  assert.ok(presets.includes(await page.locator('#waifu-tips').textContent()));
  assert.equal(await page.evaluate(() => sounds.length), soundsBefore);
  await page.waitForFunction(() => !document.querySelector('#waifu-tips').classList.contains('waifu-tips-active'), undefined, { timeout: 45000 });
  console.log('Modern preset verified for canvas clicks and delayed silent motions');

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

  // A wide composition uses the landscape space, including after a mobile resize.
  await page.evaluate(async () => {
    const { selectWidgetModel } = await import('/viewer/widget.mjs');
    await selectWidgetModel('squad/ags-30/base/default');
  });
  await page.waitForSelector('#waifu:not([data-model-loading])');
  for (const width of [1100, 390]) {
    await page.setViewportSize({ width, height: 850 });
    const wide = await page.locator('.waifu-viewport').boundingBox();
    const stage = await page.locator('#stage').boundingBox();
    await checkControls(true);
    assert.ok(wide.width > 1.5 * wide.height && wide.width > 0.9 * stage.width);
    assert.ok(wide.x >= stage.x && wide.x + wide.width <= stage.x + stage.width + 1);
  }
  await page.setViewportSize({ width: 1100, height: 850 });

  const keys = process.argv.includes('--all') ? Object.keys(catalog.models).filter(id => !id.startsWith('other/')) : ['doll/an94/archive/normal', 'fairy/air_attack/1/default'];
  for (const id of keys) {
    await page.evaluate(async id => {
      const { selectWidgetModel } = await import('/viewer/widget.mjs');
      await selectWidgetModel(id);
    }, id);
    await page.waitForSelector('canvas[data-painted]:visible', { timeout: 25000 });
  }
  await page.getByRole('button', { name: english ? 'Hide companion' : '收起看板娘' }).focus();
  await page.keyboard.press('Enter');
  const toggle = page.getByRole('button', { name: english ? 'Show companion' : '打开看板娘' });
  await toggle.waitFor();
  await page.waitForFunction(() => document.activeElement?.id === 'waifu-toggle');
  await page.keyboard.press('Space');
  await page.waitForSelector('#waifu:visible');
  await page.locator('#search').fill(english ? 'Parachute' : '空降');
  assert.equal(await page.locator('#cards button').count(), 1);
  await page.locator('#by-form').click();
  assert.equal(await page.locator('#cards button').count(), 3);
  await page.locator('#cards button[data-id="fairy/airborne/2/default"]').click();
  await page.waitForFunction(() => document.querySelector('#result').dataset.model === 'fairy/airborne/2/default');
  assert.equal(new URL(page.url()).searchParams.get('model'), 'fairy/airborne/2/default');
  assert.equal(await page.locator('#variant').inputValue(), 'fairy/airborne/2/default');
  assert.deepEqual(errors, []);
  console.log(keys.length, 'catalog selections and keyboard close/reopen passed');
} finally {
  await browser?.close();
  await server.dispose();
}
