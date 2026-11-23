import assert from 'node:assert/strict';

export async function openLegacyDemo(page, base) {
  await page.route(base + 'legacy-demo', route => route.fulfill({ contentType: 'text/html',
    body: '<!doctype html><script defer src="./autoload.js"></script>' }));
  await page.goto(base + 'legacy-demo');
}

export async function checkNativeEvents(browser, base) {
  const page = await browser.newPage();
  page.setDefaultTimeout(20000);
  try {
    const audio = [], errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', req => {
      const path = decodeURIComponent(new URL(req.url()).pathname);
      if (path.endsWith('.mp3')) audio.push(path);
    });
    // Read transformed hit meshes from the renderer being tested, including npm tarballs.
    await page.route('**/live2d.min.js', async route => {
      const response = await route.fetch();
      const body = (await response.text()).replace('window.loadlive2d=L', '(window.modelsUnderTest=R,window.loadlive2d=L)');
      await route.fulfill({ response, body });
    });
    await page.addInitScript(() => {
      Math.random = () => 0;
      sessionStorage.setItem('Sleepy', '1');
    });
    await openLegacyDemo(page, base);
    await page.waitForSelector('#live2d');
    await page.addStyleTag({ content: '#waifu {bottom:0!important;transition:none!important} #waifu-tips {pointer-events:none} #waifu-toggle {transition:none!important}' });
    const ready = () => page.waitForFunction(() => window.modelsUnderTest?.getModel(0)?.initialized);
    await ready();
    const load = async skin => {
      await page.evaluate(skin => loadlive2d('live2d', '/model/' + skin + '/index.json'), skin);
      await ready();
    };
    const config = await (await page.request.get(base + 'waifu-tips.json')).json();
    const preset = config.click.find(rule => rule.selector === '#live2d').text[0];
    const point = name => page.evaluate(name => {
      const model = modelsUnderTest.getModel(0);
      const areas = model.modelSetting.json.hit_areas;
      const area = areas.find(a => a.name === name);
      const points = model.live2DModel.getTransformedPoints(model.live2DModel.getDrawDataIndex(area.id));
      const canvas = document.getElementById('live2d'), rect = canvas.getBoundingClientRect();
      let x = 0, y = 0;
      for (let i = 0; i < points.length; i += 2) { x += points[i]; y += points[i+1]; }
      const matrix = model.modelMatrix.getArray();
      const vx = x * 2 / points.length * matrix[0] + matrix[12];
      const vy = y * 2 / points.length * matrix[5] + matrix[13];
      return [rect.left + (vx + 1) * rect.width / 2, rect.top + (1 - vy * canvas.width / canvas.height) * rect.height / 2];
    }, name);
    for (const skin of ['AK12/ak12_0/normal', 'AN-94/an94_2404/normal']) {
      await load(skin);
      await page.waitForFunction(() => !modelsUnderTest.getModel(0).mainMotionManager.isFinished());
      await page.evaluate(() => {
        const model = modelsUnderTest.getModel(0);
        window.clickTrace = { preparations: 0, interactions: 0, hits: 0 };
        const prepare = model.prepareTap, start = model.startMotion;
        model.prepareTap = function (...args) { clickTrace.preparations++; return prepare.apply(this, args); };
        model.startMotion = function (...args) {
          if (!args[4]) clickTrace.interactions++;
          return start.apply(this, args);
        };
        document.querySelector('#live2d').addEventListener('click', () => clickTrace.hits++, { once: true });
      });
      const body = await point('body');
      await page.mouse.move(...body);
      await page.waitForTimeout(200); // Exercise the hover preparation path too.
      await page.mouse.click(...body);
      assert.equal(await page.locator('#waifu-tips').textContent(), preset);
      assert.deepEqual(await page.evaluate(() => window.clickTrace), { preparations: 0, interactions: 0, hits: 1 }, skin);
    }
    await load('rfbchristmas/normal');
    assert.deepEqual(audio, [], 'passive loads must be silent');
    const catalog = await (await page.request.get(base + 'model_list.json')).json();
    await page.evaluate(id => {
      localStorage.setItem('modelId', id);
      localStorage.setItem('modelTexturesId', '0');
    }, catalog.models.findIndex(skins => skins.includes('rfbchristmas/normal')));
    const start = page.waitForRequest('**/sounds/RFB_HELLO_JP.mp3');
    await page.locator('#waifu-tool-switch-texture').click({ force: true });
    await start;
    await page.waitForFunction(() => !!modelsUnderTest.getModel(0).voice?.source);
    assert.equal(audio.length, 1);
    await page.locator('#waifu-tool-quit').click({ force: true });
    await page.waitForFunction(() => !modelsUnderTest.getModel(0).voice);
    await page.locator('#waifu-toggle.waifu-toggle-active').waitFor();
    const replay = page.waitForRequest('**/sounds/RFB_HELLO_JP.mp3');
    await page.locator('#waifu-toggle').click();
    await replay;
    await load('rfbchristmas/normal');
    const [bx, by] = await point('breast');
    const standalone = page.waitForRequest('**/sounds/RFB_SKILL1_JP.mp3');
    await page.mouse.click(bx, by);
    await standalone;
    await page.waitForFunction(() => !!modelsUnderTest.getModel(0).voice?.source);
    assert.equal(await page.locator('#waifu-tips').textContent(), preset, 'sound-only action uses the configured preset');
    assert.ok(await page.evaluate(() => !!modelsUnderTest.getModel(0).activeDialogue));
    await load('rfbchristmas/normal');
    const hand = await point('hand');
    const change = page.waitForFunction(() => modelsUnderTest.getModel(0).modelHomeDir.endsWith('/rfbchristmas/destroy/'));
    await page.mouse.click(...hand);
    await change;
    assert.equal(await page.evaluate(() => localStorage.getItem('modelTexturesId')), '1');
    await load('rfbchristmas/normal');
    // Warm the exact sound-only head action. A hover must never start playback.
    const head = await point('head');
    const headClip = '**/sounds/RFB_MOOD1_JP.mp3';
    console.log('Checking pointer preparation and dialogue lifetime');
    const warmed = page.waitForResponse(headClip);
    await page.mouse.move(...head);
    await (await warmed).finished();
    const count = audio.length;
    assert.equal(await page.evaluate(() => !!modelsUnderTest.getModel(0).voice), false);
    const tips = page.locator('#waifu-tips');
    const active = () => tips.evaluate(el => el.classList.contains('waifu-tips-active'));
    const line = await page.evaluate(() => modelsUnderTest.getModel(0).modelSetting.json.motions.tap_head[0].text);
    await page.mouse.click(...head);
    await page.waitForFunction(() => !!modelsUnderTest.getModel(0).activeDialogue);
    await page.evaluate(async () => {
      window.testAudio = modelsUnderTest.getModel(0).voice.source.context;
      await window.testAudio.suspend();
      await new Promise(resolve => setTimeout(resolve, 5300));
      window.dispatchEvent(new Event('copy'));
    });
    assert.equal(await tips.textContent(), line);
    assert.equal(await active(), true, 'the subtitle survives the old five-second timeout');
    assert.equal(audio.length, count, 'the click reuses the warmed recording');
    await page.evaluate(() => window.testAudio.resume());
    await page.waitForFunction(() => !modelsUnderTest.getModel(0).activeDialogue);
    assert.equal(await active(), true, 'allow time to read after the recording');
    await page.waitForFunction(() => !document.querySelector('#waifu-tips').classList.contains('waifu-tips-active'));

    // Stop the voice early. The subtitle belongs to the motion until its last frame.
    await load('rfbchristmas/normal');
    await page.evaluate(() => modelsUnderTest.getModel(0).startMotion('tap', 4, 3));
    await page.waitForFunction(() => !!modelsUnderTest.getModel(0).activeDialogue);
    await page.evaluate(() => modelsUnderTest.getModel(0).voice.source.stop());
    await page.waitForFunction(() => !modelsUnderTest.getModel(0).voice);
    assert.equal(await page.evaluate(() => !!modelsUnderTest.getModel(0).activeDialogue), true);
    assert.equal(await active(), true);
    await load('rfbchristmas/destroy');
    assert.equal(await active(), false, 'switching skins releases interrupted dialogue immediately');

    // Finish the motion early and keep the recording running.
    await load('rfbchristmas/normal');
    await page.evaluate(() => modelsUnderTest.getModel(0).startMotion('tap', 4, 3));
    await page.waitForFunction(() => !!modelsUnderTest.getModel(0).activeDialogue);
    await page.evaluate(async () => {
      modelsUnderTest.getModel(0).mainMotionManager.stopAllMotions();
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
    assert.equal(await page.evaluate(() => !!modelsUnderTest.getModel(0).activeDialogue), true);
    assert.equal(await active(), true);
    await load('ship/248_1');
    const [sx, sy] = await point('SUTOKA');
    const up = page.waitForRequest(req => req.url().toLowerCase().includes('skirt') && req.url().endsWith('.mtn'));
    await page.mouse.move(sx, sy); await page.mouse.down(); await page.mouse.move(sx, sy-30, { steps: 4 }); await page.mouse.up();
    await up;
    await load('ship/325_1');
    const [hx, hy] = await point('head');
    const stroke = page.waitForRequest('**/nanguo.mtn');
    await page.mouse.move(hx, hy); await page.mouse.down(); await page.mouse.move(hx+22, hy, { steps: 4 }); await page.mouse.up();
    await stroke;
    await page.waitForFunction(() => !!modelsUnderTest.getModel(0).activeDialogue);
    const shipLine = await page.evaluate(() => modelsUnderTest.getModel(0).modelSetting.json.trigger
      .find(rule => rule.action[0] === 'nanguo').dialogue);
    assert.equal(await tips.textContent(), shipLine);
    await page.waitForFunction(() => !modelsUnderTest.getModel(0).activeDialogue);
    assert.equal(await active(), true, 'the motion-only subtitle lingers after its last frame');
    assert.deepEqual(errors, []);
    console.log('Verified silent load, deliberate start and replay, sound-only playback and ship gestures.');
  } finally {
    await page.close();
  }
}

export async function checkPackedCues(browser, base) {
  const page = await browser.newPage();
  try {
    const root = base + 'gh/nova1751/live2d-api@cdn-abcdef/';
    const folder = 'model/kp31/kp31_/normal/';
    const source = await (await page.request.get(base + folder + 'index.json')).json();
    const clip = source.motions.tap_body.find(entry => entry.file === 'motions/wedding.mtn');
    const index = source.motions.tap_body.indexOf(clip);
    const sound = new URL(clip.sound, base + folder).href;
    delete clip.sound;
    clip.file = '../../../../../live2d-api@cdn-abcdef-assets-3/' + folder + 'motions/wedding.mtn';
    await page.route(base + 'packed-cues', route => route.fulfill({contentType:'text/html',body:'<!doctype html><button id="preview">Preview motion</button>'}));
    await page.route(base + 'packed-cues.json', route => route.fulfill({json:{
      schemaVersion:1, sources:{widget:{baseUrl:root}},models:{'doll/test/1/normal':[{source:'widget',manifest:folder+'index.json',
        cues:{'motions/wedding.mtn':{sound,caption:'Matched the original motion'}}}]}
    }}));
    await page.route(base + 'gh/**', async route => {
      const path = new URL(route.request().url()).pathname.split('/').slice(4).join('/');
      if (path === folder+'index.json') await route.fulfill({json:source});
      else await route.fulfill({response:await page.request.get(base+path)});
    });
    await page.goto(base + 'packed-cues');
    await page.evaluate(async ({base,index}) => {
      window.clips = [];
      window.lines = [];
      addEventListener('live2d:motions', e => { window.clips = e.detail; });
      addEventListener('live2d:dialogue', e => window.lines.push(e.detail));
      document.querySelector('#preview').onclick = () => window.loadlive2d.playMotion('tap_body',index);
      const {loadWidget} = await import(base + 'widget.mjs');
      await loadWidget({catalogUrl:base+'packed-cues.json',collection:'girls-frontline',baseUrl:base});
    }, {base,index});
    await page.waitForFunction(index => window.clips.some(c => c.group === 'tap_body' && c.index === index && c.voiced), index);
    const requested = page.waitForResponse(r => r.url() === sound && r.ok());
    await page.locator('#preview').click();
    await requested;
    await page.waitForFunction(() => window.lines.includes('Matched the original motion'));
  } finally {
    await page.close();
  }
}
