import assert from 'node:assert/strict';

export async function checkCollectionShortcut(browser, base) {
  const page = await browser.newPage();
  const requested = [];
  const games = ['girls-frontline', 'azur-lane', 'bang-dream', 'houkai2', 'iron-saga', 'warship-girls', 'baoshi-yanwuyu'];
  try {
    await page.addInitScript(() => addEventListener('live2d:model', event => { document.body.dataset.model = event.detail; }));
    await page.route(/\/live2d-api@catalog-[a-f0-9]+\/catalog\/(?:games\/)?[^/]+\.json$/, async route => {
      const file = new URL(route.request().url()).pathname.split('/').pop();
      const game = file === 'library.json' ? games[0] : file.slice(0, -5);
      requested.push(game);
      const forms = ['a', 'b'].map(outfit => ['test/' + game + '/' + outfit, [{source:'test', manifest:outfit === 'a' ? 'index.json' : '02/index.json'}]]);
      forms.push(['test/' + game + '-solo/a', [{ source: 'test', manifest: 'index.json' }]]);
      await route.fulfill({json:{schemaVersion:1, sources:{test:{baseUrl:base+'model/fairy/air_attack/'}}, models:Object.fromEntries(forms)}});
    });
    await page.route(base + 'shortcut-host*', route => {
      const url = new URL(route.request().url());
      return route.fulfill({contentType:'text/html', body:'<!doctype html><script type="module" src="./collections.mjs'+url.search+'"></script>'});
    });
    const wait = (game, outfit) => page.waitForFunction(id => document.body.dataset.model === id, 'test/'+game+'/'+outfit);
    const next = () => page.locator('#waifu-tool-switch-model').evaluate(button => button.click());
    const outfit = page.locator('#waifu-tool-switch-texture');
    const changeOutfit = () => outfit.evaluate(button => button.click());
    await page.goto(base+'shortcut-host');
    for (const [i, game] of games.entries()) {
      await wait(game, 'a');
      assert.deepEqual(requested, games.slice(0,i+1));
      if (i === 0) {
        await page.waitForSelector('#waifu:not([data-model-loading]) canvas');
        // Hold the next manifest to inspect exactly what the packaged renderer leaves on screen.
        await page.evaluate(() => {
          const frame = loadlive2d.onNextPaint;
          loadlive2d.onNextPaint = copy => frame(canvas => {
            const reference = document.createElement('canvas');
            reference.width = canvas.width;
            reference.height = canvas.height;
            reference.getContext('2d').drawImage(canvas,0,0);
            copy(canvas);
            // The replacement can paint between two Playwright calls. Compare inside the
            // actual capture callback, while both canvases still belong to this transition.
            window.frameMatched = document.querySelector('.waifu-model-still')?.toDataURL() === reference.toDataURL();
            loadlive2d.onNextPaint = frame;
          });
        });
        let release;
        const gate = new Promise(resolve => { release = resolve; });
        const outfitUrl = base + 'model/fairy/air_attack/02/index.json';
        await page.route(outfitUrl, async route => { await gate; await route.fulfill({status:503}); }, { times:1 });
        try {
          const requestedOutfit = page.waitForRequest(outfitUrl);
          await changeOutfit();
          await requestedOutfit;
          await page.waitForFunction(() => typeof window.frameMatched === 'boolean');
          assert.equal(await page.evaluate(() => window.frameMatched), true);
          await page.locator('#waifu[data-model-pending] .waifu-loading-icon').waitFor();
        } finally { release(); }
        await page.getByRole('status').filter({hasText:'加载失败'}).waitFor({state:'attached'});
        assert.equal(await page.locator('.waifu-loading-icon').isVisible(), false);
        assert.equal(await page.locator('.waifu-model-still').count(),0);
        assert.equal(await page.evaluate(() => new Promise(resolve => {
          if (!window.loadlive2d.onNextPaint(canvas => resolve(canvas.width > 0))) resolve(false);
        })), true, 'the previous model animates again after a failed switch');
        await page.getByRole('button', { name: '重试加载模型' }).evaluate(button => button.click());
        await wait(game, 'b');
        assert.equal(await page.locator('.waifu-model-still').count(),0);
      }
      await next();
      await wait(game + '-solo', 'a');
      assert.equal(await outfit.isDisabled(), true);
      await next();
    }
    await wait(games[0], 'a');
    requested.length = 0;
    await page.goto(base+'shortcut-host?collection=azur-lane');
    await wait(games[1], 'a');
    await changeOutfit();
    await wait(games[1], 'b');
    await page.reload();
    await wait(games[1], 'b');
    await changeOutfit();
    await wait(games[1], 'a');
    await next();
    await wait(games[1] + '-solo', 'a');
    await next();
    await wait(games[1], 'a');
    assert.deepEqual(requested, ['azur-lane', 'azur-lane']);

    await page.route(base + 'outfit-order-host', route => route.fulfill({ contentType: 'text/html',
      body: '<script type="module">import {loadWidget} from "./widget.mjs"; await loadWidget({collection:"all",switchBy:"outfit"});</script>' }));
    await page.goto(base + 'outfit-order-host');
    await wait(games[0], 'a');
    await page.getByRole('button', { name: '下一个模型条目' }).evaluate(button => button.click());
    await wait(games[0], 'b');
    await changeOutfit();
    await wait(games[0], 'a');

    const { version } = await (await page.request.get(base + 'package.json')).json();
    const entries = ['autoload.js', 'collections.mjs', 'girls-frontline.mjs'];
    for (const host of ['cdn.jsdelivr.net', 'cdn.jsdmirror.com']) {
      const cdn = `https://${host}/gh/nova1751/live2d-api@`;
      const runtime = `${cdn}widget-${version}/`;
      const sources = [`${cdn}v${version}/`, `${cdn}${version}/`, `${cdn}latest/`, cdn.slice(0, -1) + '/'];
      const unexpected = [];
      async function serveRuntime(route, directory) {
        const file = new URL(route.request().url()).pathname.slice(new URL(directory).pathname.length);
        const response = await page.request.get(base + file);
        await route.fulfill({ response, headers: { ...response.headers(), 'access-control-allow-origin': '*' } });
      }
      for (const source of sources) await page.route(source + '**', route => {
          if (entries.some(entry => route.request().url() === source + entry)) return serveRuntime(route, source);
          unexpected.push(route.request().url());
          return route.fulfill({ status: 403, body: 'Package size exceeded the configured limit of 50 MB.' });
        });
      await page.route(runtime + '**', route => serveRuntime(route, runtime));
      await page.route(base + 'source-shortcut*', route => {
        const params = new URL(route.request().url()).searchParams;
        const entry = params.get('entry');
        const source = sources[Number(params.get('source'))];
        return route.fulfill({ contentType: 'text/html', body: '<!doctype html><script ' +
          (entry.endsWith('.mjs') ? 'type="module" ' : '') + 'src="' + source + entry + '"></script>' });
      });
      for (const index of sources.keys()) {
        for (const entry of index === 0 ? entries : ['autoload.js']) {
          await page.goto(base + 'source-shortcut?entry=' + entry + '&source=' + index);
          await wait(games[0], 'a');
        }
      }
      assert.deepEqual(unexpected, []);
    }
  } finally { await page.close(); }
}
