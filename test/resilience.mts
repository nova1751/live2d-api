import assert from 'node:assert/strict';

const first = 'fairy/recovery/1/default';
const second = 'fairy/recovery/2/default';

export async function checkResilience(browser, base) {
  const page = await browser.newPage({ reducedMotion: 'reduce' });
  try {
    await page.addInitScript(() => {
      addEventListener('live2d:model', event => { document.body.dataset.model = event.detail; });
      const draw = WebGLRenderingContext.prototype.drawElements;
      WebGLRenderingContext.prototype.drawElements = function (...args) {
        draw.apply(this, args);
        this.canvas.dataset.painted = 'yes';
      };
    });
    await page.route(base + 'recovery-catalog.json', route => route.fulfill({ json: {
      schemaVersion: 1,
      sources: { fixture: { baseUrl: base + 'model/fairy/air_attack/' } },
      models: {
        [first]: [{ source: 'fixture', manifest: 'index.json' }],
        [second]: [{ source: 'fixture', manifest: 'fixture.model3.json' }],
      },
    } }));
    const fairy = base + 'model/fairy/air_attack/index.json';
    const catalogOptions = { catalogUrl: base + 'recovery-catalog.json', collection: 'girls-frontline' };
    await page.route(base + 'recovery.html*', route => {
      const mode = new URL(route.request().url()).searchParams.get('mode');
      const options = mode === 'model' ? { modelUrl: fairy } : mode === 'spa' ? {} : catalogOptions;
      return route.fulfill({ contentType: 'text/html', body: `<!doctype html><script type="module">
        import { loadWidget, selectWidgetModel } from '/widget.mjs';
        window.choose = selectWidgetModel;
        await loadWidget(${JSON.stringify({ baseUrl: base, ...options })});
      </script>` });
    });

    // The failed dynamic import must be retried at a fresh URL in the same document.
    let imports = 0;
    await page.route(base + 'modern/renderer.mjs', route => {
      imports++;
      return route.fulfill({ status: 503 });
    }, { times: 1 });
    await page.route(base + 'modern/renderer.mjs?retry=1', route => {
      imports++;
      return route.fulfill({ contentType: 'text/javascript',
        body: 'export async function mountModern(canvas, src, core, signal, dialogue, framing, onPaint) { onPaint(canvas); return {}; }' });
    });
    await page.goto(base + 'recovery.html?mode=catalog');
    await page.waitForFunction(id => document.body.dataset.model === id, first);
    await page.evaluate(async id => { try { await window.choose(id); } catch { return; } throw Error('Expected 503'); }, second);
    await page.evaluate(id => window.choose(id), second);
    await page.waitForFunction(id => document.body.dataset.model === id, second);
    assert.equal(imports, 2);

    // Accelerate the deadline only for the deliberately stalled first load.
    await page.addInitScript(() => {
      if (location.search !== '?mode=model') return;
      const timer = window.setTimeout;
      window.setTimeout = function (callback, delay, ...args) {
        return timer(callback, delay === 15000 ? 800 : delay, ...args);
      };
      window.restoreTimer = () => { window.setTimeout = timer; };
    });
    let release;
    const held = new Promise(resolve => { release = resolve; });
    await page.route(fairy, async route => { await held; await route.abort().catch(() => {}); }, { times: 1 });
    try {
      await page.goto(base + 'recovery.html?mode=model');
      const icon = await page.locator('.waifu-loading-icon svg').evaluate(svg => ({
        fill: getComputedStyle(svg).fill, size: getComputedStyle(svg).height,
      }));
      assert.deepEqual(icon, await page.locator('#waifu-tool svg').first().evaluate(svg => ({
        fill: getComputedStyle(svg).fill, size: getComputedStyle(svg).height,
      })));
      await page.getByRole('button', { name: '重试加载模型' }).waitFor();
      assert.equal(await page.locator('#waifu[data-model-pending]').count(), 0);
      await page.evaluate(() => window.restoreTimer());
      await page.getByRole('button', { name: '重试加载模型' }).click();
      await page.locator('#live2d[data-painted=yes]').waitFor();
    } finally { release(); }

    // Storage is optional even if accessing its getter throws.
    await page.addInitScript(() => {
      if (location.search !== '?mode=storage') return;
      for (const key of ['localStorage', 'sessionStorage']) {
        Object.defineProperty(window, key, { get() { throw new DOMException('Storage blocked', 'SecurityError'); } });
      }
    });
    await page.goto(base + 'recovery.html?mode=storage');
    await page.waitForFunction(id => document.body.dataset.model === id, first);

    // A SPA's successful HTML fallback is not a usable model list.
    await page.route(base + 'model_list.json', route => route.fulfill({
      contentType: 'text/html', body: '<!doctype html><title>Host application fallback</title>',
    }));
    await page.route('https://cdn.jsdelivr.net/gh/nova1751/live2d-api@cdn-b3ac5ae545e2/**', async route => {
      const file = route.request().url().split('@cdn-b3ac5ae545e2/')[1];
      const response = await page.request.get(base + file);
      await route.fulfill({ response, headers: { ...response.headers(), 'access-control-allow-origin': '*' } });
    });
    await page.goto(base + 'recovery.html?mode=spa');
    await page.locator('#live2d[data-painted=yes]').waitFor();
  } finally { await page.close(); }
}
