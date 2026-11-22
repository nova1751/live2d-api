import assert from 'node:assert/strict';

export async function checkNativeEvents(browser, base) {
  const page = await browser.newPage();
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
      const body = (await response.text()).replace('window.loadlive2d=L', 'window.modelsUnderTest=R;window.loadlive2d=L');
      await route.fulfill({ response, body });
    });
    await page.addInitScript(() => {
      Math.random = () => 0;
      sessionStorage.setItem('Sleepy', '1');
    });
    await page.goto(base);
    await page.waitForSelector('#live2d');
    await page.addStyleTag({ content: '#waifu {bottom:0!important;transition:none!important} #waifu-tips {pointer-events:none} #waifu-toggle {transition:none!important}' });
    const ready = () => page.waitForFunction(() => window.modelsUnderTest?.getModel(0)?.initialized);
    await ready();
    const load = async skin => {
      await page.evaluate(skin => loadlive2d('live2d', '/model/' + skin + '/index.json'), skin);
      await ready();
    };
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
    await load('rfbchristmas/normal');
    const hand = await point('hand');
    const change = page.waitForRequest('**/rfbchristmas/destroy/index.json');
    await page.mouse.click(...hand);
    await change;
    assert.equal(await page.evaluate(() => localStorage.getItem('modelTexturesId')), '1');
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
    assert.deepEqual(errors, []);
    console.log('Verified silent load, deliberate start and replay, sound-only playback and ship gestures.');
  } finally {
    await page.close();
  }
}
