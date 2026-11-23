import assert from 'node:assert/strict';

// Render the packaged widget on a host page with a working button behind its paint margin.
export async function checkPaintOverflow(browser, base) {
  const page = await browser.newPage({ reducedMotion: 'reduce' });
  try {
    await page.route(base + 'overflow-test', route => route.fulfill({ contentType: 'text/html',
      body: '<!doctype html><meta name="viewport" content="width=device-width"><style>body{margin:0}#behind{position:fixed;z-index:4}</style><button id="behind">Page action</button>' }));
    await page.route(base + 'overflow-catalog.json', route => route.fulfill({ json: {
      schemaVersion: 1, sources: { local: { baseUrl: './model/' } },
      models: { 'fairy/test/1/default': [{ source: 'local', manifest: 'fairy/air_attack/index.json' }] },
    } }));
    for (const [width, position] of [[1100, 'left'], [390, 'right']]) {
      await page.setViewportSize({ width, height: 820 });
      await page.goto(base + 'overflow-test');
      await page.evaluate(async ({ base, position }) => {
        const { loadWidget } = await import(base + 'widget.mjs');
        await loadWidget({ collection: 'girls-frontline', catalogUrl: base + 'overflow-catalog.json', baseUrl: base, position });
      }, { base, position });
      await page.waitForSelector('#waifu:not([data-initial-framing]):not([data-model-loading]) .waifu-hit');
      await page.addStyleTag({ content: '#waifu-tips { visibility:hidden } #waifu-tool svg { transition:none }' });
      const hit = await page.locator('.waifu-hit').boundingBox();
      const paint = await page.locator('#live2d').boundingBox();
      const widget = await page.locator('#waifu').boundingBox();
      const square = Math.max(hit.width, hit.height);
      assert.ok(Math.abs(paint.width - square * 1.5) <= 1);
      assert.ok(Math.abs(widget.width - hit.width - 50) <= 1);
      assert.ok(Math.abs(paint.x + paint.width / 2 - hit.x - hit.width / 2) <= 1);
      assert.ok(Math.abs(paint.y + paint.height - square / 4 - hit.y - hit.height) <= 1);
      const point = { x: Math.floor(hit.x + hit.width / 2), y: Math.floor(hit.y - 14) };
      await page.evaluate(({ x, y }) => {
        const button = document.querySelector('#behind');
        button.style.cssText = `left:${x - 20}px;top:${y - 12}px;width:40px;height:24px`;
        button.onclick = () => button.dataset.clicked = 'yes';
        // Inject a deterministic mark on the paint plane; real fairy poses vary per animation frame.
        const surface = document.querySelector('.waifu-surface');
        const rect = surface.getBoundingClientRect();
        const mark = document.createElement('span');
        mark.style.cssText = `position:absolute;left:${x - rect.left - 5}px;top:${y - rect.top - 5}px;width:10px;height:10px;background:#e817ab`;
        surface.append(mark);
      }, point);
      const png = await page.screenshot({ clip: { ...point, width: 1, height: 1 } });
      const color = await page.evaluate(async data => {
        const pixel = document.createElement('canvas').getContext('2d');
        pixel.drawImage(await createImageBitmap(await (await fetch('data:image/png;base64,' + data)).blob()), 0, 0);
        return Array.from(pixel.getImageData(0, 0, 1, 1).data);
      }, png.toString('base64'));
      assert.deepEqual(color, [232, 23, 171, 255]);
      await page.mouse.click(point.x, point.y);
      assert.equal(await page.locator('#behind').getAttribute('data-clicked'), 'yes');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
      assert.equal(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.className,
        { x: hit.x + hit.width / 2, y: hit.y + hit.height / 2 }), 'waifu-hit');
      for (const id of ['expand', 'photo']) {
        const button = page.locator('#waifu-tool-' + id);
        const svg = button.locator('svg');
        const colors = () => svg.evaluate(el => [getComputedStyle(el).fill, getComputedStyle(el).stroke]);
        await page.mouse.move(width / 2, 0);
        assert.deepEqual(await colors(), ['rgb(123, 140, 157)', 'none']);
        await button.hover();
        assert.deepEqual(await colors(), ['rgb(6, 132, 189)', 'none']);
      }
    }
  } finally {
    await page.close();
  }
}
