import assert from 'node:assert/strict';

// Render the packaged widget on a host page with a working button behind its paint margin.
export async function checkPaintOverflow(browser, base) {
  const page = await browser.newPage({ reducedMotion: 'reduce' });
  try {
    await page.route(base + 'overflow-test', route => route.fulfill({ contentType: 'text/html',
      body: '<!doctype html><meta name="viewport" content="width=device-width"><style>body{margin:0}#behind{position:fixed;z-index:4}</style><button id="behind">Page action</button>' }));
    for (const [width, position] of [[1100, 'left'], [390, 'left'], [390, 'right']]) {
      const animated = width === 1100;
      await page.emulateMedia({ reducedMotion: animated ? 'no-preference' : 'reduce' });
      await page.setViewportSize({ width, height: 820 });
      await page.goto(base + 'overflow-test');
      const waitForSlide = (from, to) => page.waitForFunction(([from, to]) => {
        const widget = document.querySelector('#waifu');
        const bottom = parseFloat(getComputedStyle(widget).bottom);
        return widget.style.display !== 'none' && bottom > Math.min(from, to) && bottom < Math.max(from, to);
      }, [from, to]);
      const waitForArrival = () => page.waitForFunction(() => getComputedStyle(document.querySelector('#waifu')).bottom === '0px');
      let releaseCatalog;
      const floatingEdges = () => page.evaluate(() => {
        const shell = document.querySelector('#waifu').getBoundingClientRect();
        return [shell.right, shell.height];
      });
      let loadingEdges;
      const catalogGate = new Promise(resolve => { releaseCatalog = resolve; });
      await page.route(base + 'overflow-catalog.json', async route => {
        await catalogGate;
        await route.fulfill({ json: {
          schemaVersion: 1, sources: { local: { baseUrl: './model/' } },
          models: { 'fairy/test/1/default': [{ source: 'local', manifest: 'fairy/air_attack/index.json' }] },
        } });
      }, { times: 1 });
      try {
        await page.evaluate(async ({ base, position }) => {
          const { loadWidget } = await import(base + 'widget.mjs');
          await loadWidget({ collection: 'girls-frontline', catalogUrl: base + 'overflow-catalog.json', baseUrl: base, position });
        }, { base, position });
        if (animated) await waitForSlide(-1000, 0);
        await waitForArrival();
        loadingEdges = await floatingEdges();
        const status = page.locator('#waifu[data-initial-framing] #waifu-status');
        await status.locator('.waifu-loading-icon').waitFor();
        assert.equal(await status.textContent(), '模型加载中…');
        assert.equal(await page.locator('#waifu-tool').evaluate(el => getComputedStyle(el).opacity), '1');
        assert.equal(await page.locator('#live2d').evaluate(el => getComputedStyle(el).opacity), '0');
        assert.equal(await page.locator('.waifu-hit').evaluate(el => getComputedStyle(el).pointerEvents), 'none');
      } finally {
        releaseCatalog();
      }
      await page.waitForSelector('#waifu:not([data-initial-framing]):not([data-model-loading]) .waifu-hit');
      assert.deepEqual(await floatingEdges(), loadingEdges, 'first paint keeps the shell footprint');
      assert.equal(await page.locator('#waifu-status').textContent(), '');
      await page.addStyleTag({ content: '#waifu-tips { visibility:hidden } #waifu-tool svg { transition:none }' });
      const checkCaption = async (subject, gap = 12) => {
        const tip = await page.locator('#waifu-tips').evaluate(el => el.getBoundingClientRect().toJSON());
        assert.ok(Math.abs(subject.y - tip.bottom - gap) < 1, JSON.stringify({ subject, tip }));
        assert.ok(Math.abs(subject.x + subject.width / 2 - tip.x - tip.width / 2) < 1);
        assert.ok(tip.y >= 0);
      };
      const hit = await page.locator('.waifu-hit').boundingBox();
      await checkCaption(hit);
      const tools = await page.locator('#waifu-tool').boundingBox();
      assert.ok(Math.abs(tools.y + tools.height / 2 - hit.y - hit.height / 2) <= 1);
      const paint = await page.locator('#live2d').boundingBox();
      const camera = await page.locator('.waifu-surface').boundingBox();
      const widget = await page.locator('#waifu').boundingBox();
      if (position === 'left') {
        const rail = await page.locator('#waifu-tool').boundingBox();
        assert.ok(widget.x + widget.width - rail.x - rail.width >= Math.min(40, width * 0.03) - 1);
      }
      const aspect = await page.locator('#waifu').evaluate(el => Number(getComputedStyle(el).getPropertyValue('--waifu-aspect')));
      const edge = Math.max(12, Math.min(width * 0.02, 24));
      const maxWidth = Math.min(480, width - (position === 'left' ? edge : 2 * edge) - 50) * 0.85;
      const subjectWidth = position === 'left' ? maxWidth + 6 - Math.min(40, Math.max(8, width * 0.03)) - 24 : maxWidth;
      const expectedWidth = Math.min(subjectWidth, 410 * 0.85 * aspect);
      assert.ok(Math.abs(hit.width - expectedWidth) <= 1);
      assert.ok(Math.abs(hit.height - expectedWidth / aspect) <= 1);
      const square = Math.max(hit.width, hit.height);
      if (position === 'left') {
        assert.ok(Math.abs(paint.x) <= 1, JSON.stringify(paint));
        const rail = await page.locator('#waifu-tool').boundingBox();
        assert.ok(Math.abs(widget.x) <= 1 && hit.x >= 11.9 && hit.x <= 48.1, JSON.stringify(hit));
        assert.ok(Math.abs(hit.x - (rail.x - hit.x - hit.width)) <= 1, JSON.stringify({rail, hit}));
        assert.ok(Math.abs(paint.width - camera.width - camera.x) <= 1);
        assert.ok(await page.locator('#waifu-tips').evaluate(el => el.getBoundingClientRect().left >= 12));
        assert.ok(widget.x + widget.width <= width + 1);
      } else {
        assert.ok(Math.abs(paint.width - camera.width) <= 1);
      }
      assert.ok(Math.abs(camera.width - square * 1.5) <= 1);
      assert.ok(widget.width >= hit.width + 50 - 1);
      assert.ok(Math.abs(camera.x + camera.width / 2 - hit.x - hit.width / 2) <= 1);
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
      const tab = page.locator('#waifu-toggle');
      const originalCanvas = await page.locator('#live2d').elementHandle();
      await page.locator('#waifu-tool-expand').click({ force: true });
      const viewer = page.locator('#waifu-expanded');
      const view = viewer.locator('.waifu-view-viewport');
      const caption = viewer.locator('#waifu-tips');
      await caption.evaluate(el => { el.textContent = '指挥官，今天也一起加油吧。'; });
      const assertFit = async () => {
        const frame = await view.boundingBox();
        const canvas = await viewer.locator('#live2d').boundingBox();
        const subject = await viewer.locator('.waifu-hit').boundingBox();
        const tip = await caption.boundingBox();
        assert.ok(subject.x >= frame.x - 1 && tip.y >= frame.y &&
          subject.x + subject.width <= frame.x + frame.width + 1 &&
          subject.y + subject.height <= frame.y + frame.height + 1, JSON.stringify({ frame, subject, tip }));
        assert.ok(Math.abs(subject.x + subject.width / 2 - frame.x - frame.width / 2) <= 1);
        if (width > 1000) {
          const coverage = (subject.y + subject.height - tip.y) / frame.height;
          assert.ok(coverage >= 0.80 && coverage <= 0.90, String(coverage));
        }
        assert.deepEqual(await view.evaluate(el => [el.scrollWidth - el.clientWidth, el.scrollHeight - el.clientHeight]), [0, 0]);
        return canvas.width;
      };
      const expandedWidth = await assertFit();
      const expandedCanvas = await viewer.locator('#live2d').boundingBox();
      const subject = await viewer.locator('.waifu-hit').boundingBox();
      await checkCaption(subject, 820 * 0.012);
      const rail = await viewer.locator('#waifu-tool').boundingBox();
      if (width > 540) {
        assert.ok(Math.abs(rail.x - subject.x - subject.width - 6) < 2);
        assert.ok(Math.abs(rail.y + rail.height / 2 - subject.y - subject.height / 2) < 2);
      } else {
        assert.ok(Math.abs(rail.y - subject.y - subject.height - 4) < 2);
      }
      assert.ok(Math.abs(expandedWidth - expandedCanvas.height) <= 1, 'the character canvas keeps its aspect on a wide screen');
      if (width > 1000) {
        assert.ok(Math.abs(expandedCanvas.x + expandedWidth / 2 - width / 2) < 2);
      }
      await page.waitForFunction(() => {
        const canvas = document.querySelector('#live2d');
        return Math.abs(canvas.width / canvas.height - canvas.clientWidth / canvas.clientHeight) < 0.01;
      });
      await viewer.getByRole('button', { name: '全屏', exact: true }).click();
      await page.waitForFunction(() => !!document.fullscreenElement);
      const fitted = await assertFit();
      await viewer.getByRole('spinbutton').fill('200');
      await viewer.getByRole('spinbutton').press('Enter');
      assert.ok(Math.abs((await viewer.locator('#live2d').boundingBox()).width - 2 * fitted) <= 2);
      assert.equal(await view.evaluate(el => getComputedStyle(el).scrollbarWidth), 'none');
      if (width > 1000) {
        await view.focus();
        const scroll = await view.evaluate(el => el.scrollTop);
        await view.press('ArrowUp');
        await page.waitForFunction(top => document.querySelector('.waifu-view-viewport').scrollTop < top, scroll);
      }
      await viewer.getByRole('button', { name: '适应窗口' }).click();
      await assertFit();
      await viewer.getByRole('button', { name: '退出全屏' }).click();
      await viewer.getByRole('button', { name: '还原' }).click();
      assert.ok(await originalCanvas.evaluate(canvas => canvas === document.querySelector('body > #waifu #live2d')));
      await page.locator('#waifu-tool-quit').click();
      if (animated) {
        await waitForSlide(0, -500);
        assert.equal(await tab.isVisible(), false);
        await page.locator('#waifu').waitFor({ state: 'hidden' });
        const waitForEdge = (min, max) => page.waitForFunction(([min, max]) => {
          const edge = document.querySelector('#waifu-toggle').getBoundingClientRect().right;
          return edge >= min && edge <= max;
        }, [min, max]);
        await waitForEdge(0.01, 6.99);
        await waitForEdge(7, 7);
        const label = tab.locator('span');
        const opacity = () => label.evaluate(el => getComputedStyle(el).opacity);
        assert.equal(await opacity(), '0');
        const bounds = await tab.boundingBox();
        await page.mouse.move(5, bounds.y + bounds.height / 2);
        await waitForEdge(7.01, 23.99);
        await waitForEdge(24, 24);
        assert.equal(await opacity(), '1');
        const button = await tab.boundingBox();
        const text = await label.boundingBox();
        const leftGap = text.x - button.x;
        const rightGap = button.x + button.width - text.x - text.width;
        assert.ok(leftGap > 0 && Math.abs(leftGap - rightGap) <= 1);
        await page.mouse.move(width / 2, 0);
        await waitForEdge(7, 7);
        assert.equal(await opacity(), '0');
      }
      assert.equal(await page.locator('#waifu').isVisible(), false);
      assert.equal(await tab.getAttribute('aria-expanded'), 'false');
      assert.deepEqual(await tab.evaluate(el => {
        const style = getComputedStyle(el);
        return [style.borderTopLeftRadius, style.borderBottomLeftRadius,
          style.borderTopRightRadius, style.borderBottomRightRadius];
      }), ['0px', '0px', '5px', '5px']);
      await tab.focus();
      await tab.press('Enter');
      assert.equal(await page.locator('#waifu').isVisible(), true);
      assert.equal(await tab.getAttribute('aria-expanded'), 'true');
      if (animated) {
        await waitForSlide(-500, 0);
        assert.equal(await tab.isVisible(), true, 'tab stays visible as it retracts');
        await tab.waitFor({ state: 'hidden' });
        await waitForArrival();
      } else {
        await waitForArrival();
        assert.equal(await tab.isVisible(), false);
      }
    }
  } finally {
    await page.close();
  }
}
