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
      const forms = ['a', 'b'].map(outfit => ['test/' + game + '/' + outfit, [{source:'test', manifest:'index.json'}]]);
      await route.fulfill({json:{schemaVersion:1, sources:{test:{baseUrl:base+'model/fairy/air_attack/'}}, models:Object.fromEntries(forms)}});
    });
    await page.route(base + 'shortcut-host*', route => {
      const url = new URL(route.request().url());
      return route.fulfill({contentType:'text/html', body:'<!doctype html><script type="module" src="./collections.mjs'+url.search+'"></script>'});
    });
    const wait = (game, outfit) => page.waitForFunction(id => document.body.dataset.model === id, 'test/'+game+'/'+outfit);
    const next = () => page.locator('#waifu-tool-switch-model').evaluate(button => button.click());
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
            window.outgoingFrame = reference.toDataURL();
            copy(canvas);
          });
        });
        let release;
        const gate = new Promise(resolve => { release = resolve; });
        await page.route(base+'model/fairy/air_attack/index.json', async route => { await gate; await route.continue(); }, { times:1 });
        try {
          await next();
          await page.waitForSelector('.waifu-model-still');
          assert.ok(await page.evaluate(() => !!window.outgoingFrame &&
            document.querySelector('.waifu-model-still').toDataURL() === window.outgoingFrame));
        } finally { release(); }
        await page.waitForSelector('#waifu:not([data-model-loading]) canvas');
        assert.equal(await page.locator('.waifu-model-still').count(),0);
      } else await next();
      await wait(game, 'b');
      await next();
    }
    await wait(games[0], 'a');
    requested.length = 0;
    await page.goto(base+'shortcut-host?collection=azur-lane');
    await wait(games[1], 'a');
    await next();
    await wait(games[1], 'b');
    await page.reload();
    await wait(games[1], 'b');
    await next();
    await wait(games[1], 'a');
    assert.deepEqual(requested, ['azur-lane', 'azur-lane']);
  } finally { await page.close(); }
}
