import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const models = JSON.parse(read('model_list.json')).models;
const base = 'https://example.test/vendor/live2d/';

// Run the shipped widget scripts against a small DOM. Record renderer calls
// so the tests exercise model selection without requiring a GPU or a CDN.
function browser(failOnce) {
  const requests = [];
  const renders = [];
  const nodes = new Map();
  const storage = () => {
    const values = new Map();
    return {
      getItem: key => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, String(value)),
      removeItem: key => values.delete(key),
    };
  };
  function element() {
    const attributes = new Map();
    return {
      hasAttribute: name => attributes.has(name),
      setAttribute: (name, value) => attributes.set(name, value),
      removeAttribute: name => attributes.delete(name),
      dataset: {}, style: {}, classList: { add() {}, remove() {} },
      remove() {},
      addEventListener(event, listener) { this[event] = () => listener({ isTrusted: false }); },
      insertAdjacentHTML(_, html) {
        for (const [, id] of html.matchAll(/id="([^"]+)"/g)) nodes.set(id, element());
      },
    };
  }
  const document = {
    addEventListener() {}, body: element(), title: 'Demo', referrer: '', baseURI: base,
    createElement: element, getElementById: id => nodes.get(id),
    head: { appendChild(tag) {
      const url = tag.src || tag.href;
      requests.push(url);
      queueMicrotask(() => {
        if (url === failOnce) {
          failOnce = undefined;
          return tag.onerror();
        }
        if (url.endsWith('live2d.min.js')) {
          context.loadlive2d = (_, model) => renders.push(model);
        } else if (url.endsWith('waifu-tips.js')) {
          document.currentScript = tag;
          vm.runInContext(read(url.match(/(?:jsdelivr|npm)\/[^/]+\/waifu-tips\.js$/)[0]), context);
          document.currentScript = null;
        }
        tag.onload?.();
      });
    } },
  };
  const context = vm.createContext({
    document, URL, screen: { width: 1024 }, location: new URL(base),
    localStorage: storage(), sessionStorage: storage(), console: { log() {}, error(error, detail) { throw detail ?? error; } },
    setTimeout() {}, setInterval() {}, clearTimeout() {}, addEventListener() {},
    async fetch(url) {
      requests.push(url);
      const file = new URL(url).pathname.split('/').pop();
      return { ok: true, json: async () => JSON.parse(read(file)) };
    },
  });
  context.window = context;
  return { context, document, requests, renders, nodes };
}

const settled = () => new Promise(resolve => setImmediate(resolve));

for (const [provider, cdn] of [
  ['jsdelivr', 'https://cdn.jsdelivr.net/gh/nova1751/live2d-api@latest/'],
  ['npm', 'https://unpkg.com/live2dapi-noa@latest/'],
]) {
  for (const mode of ['random', 'sequential']) {
    test(`legacy ${provider}/${mode} works with separate CSS`, async () => {
      const { context, requests, renders, nodes } = browser();
      vm.runInContext(read(`${provider}/${mode}/autoload.js`), context);
      await settled();
      assert.ok(requests.includes(cdn + `${provider}/${mode}/waifu-tips.js`));
      assert.ok(requests.includes(cdn + 'waifu-tips.json'));
      assert.ok(requests.every(url => !url.endsWith('.css')));
      const allowed = models[0].map(path => cdn + 'model/' + path + '/index.json');
      assert.ok(allowed.includes(renders[0]));
      nodes.get('waifu-tool-switch-texture').click();
      await settled();
      if (mode === 'sequential') assert.deepEqual(renders, allowed.slice(0, 2));
      else assert.ok(renders.length === 2 && allowed.includes(renders[1]));
    });
  }
}

test('module retries failed loads, shares initialization and uses the selected asset root', async t => {
  const { context, document, requests, renders, nodes } = browser(base + 'live2d.min.js');
  globalThis.document = document;
  globalThis.window = context;
  t.after(() => { delete globalThis.document; delete globalThis.window; });
  const { loadWidget } = await import('../widget.mjs');
  await assert.rejects(loadWidget({ mode: 'unknown' }), TypeError);
  const options = { baseUrl: base.slice(0, -1), position: 'right' };
  await assert.rejects(loadWidget(options), /Failed to load/);
  await Promise.all([loadWidget(options), loadWidget(options)]);
  await loadWidget(options);
  await settled();
  assert.equal(requests.filter(url => url.endsWith('waifu-tips.js')).length, 1);
  assert.equal(requests.filter(url => url.endsWith('css/right.css')).length, 2);
  assert.deepEqual(renders, [base + 'model/' + models[0][0] + '/index.json']);
  nodes.get('waifu-tool-asteroids').click();
  assert.ok(requests.includes(base + 'asteroids.js'));
});

test('pinned legacy CDN loaders use their own version for scripts, models and the game', async () => {
  for (const [path, cdn] of [
    ['jsdelivr/sequential/autoload.min.js', 'https://cdn.test/gh/nova1751/live2d-api@v1.1.0/'],
    ['npm/random/autoload.js', 'https://cdn.test/live2dapi-noa@1.1.0/'],
  ]) {
    const { context, document, requests, renders, nodes } = browser();
    document.currentScript = { src: cdn + path + '?cache=1' };
    vm.runInContext(read(path), context);
    await settled();
    nodes.get('waifu-tool-asteroids').click();
    assert.ok(requests.includes(cdn + 'asteroids.js'));
    assert.ok(requests.every(url => url.startsWith(cdn)));
    assert.ok(renders[0].startsWith(cdn + 'model/'));
    assert.equal(vm.runInContext('live2d_path', context), cdn);
    assert.equal(typeof context.loadExternalResource, 'function');
  }
});

test('the script tag skips small screens and loads both assets and model relative to its URL', async () => {
  const { context, document, requests, renders } = browser();
  const src = base + 'autoload.js';
  const entry = read('autoload.js');
  document.currentScript = { src, dataset: { position: 'right', mode: 'random' } };
  context.innerWidth = 767;
  vm.runInContext(entry, context);
  assert.deepEqual(requests, []);

  context.innerWidth = 768;
  vm.runInContext(entry, context);
  await settled();
  assert.ok(requests.includes(new URL('css/right.css', src).href));
  assert.ok(requests.includes(new URL('jsdelivr/random/waifu-tips.js', src).href));
  assert.ok(models[0].some(path => renders[0] === new URL('model/' + path + '/index.json', src).href));
});

test('single-model script resolves a page-relative manifest and preserves the built-in rotation preference', async () => {
  const { context, document, requests, renders, nodes } = browser();
  document.currentScript = { src: 'https://cdn.test/preview/autoload.js', dataset: { modelUrl: './Ren.model3.json' } };
  context.innerWidth = 1024;
  context.localStorage.setItem('modelId', '4');
  vm.runInContext(read('autoload.js'), context);
  await settled();
  assert.deepEqual(renders, [base + 'Ren.model3.json']);
  assert.equal(context.localStorage.getItem('modelId'), '4');
  assert.equal(nodes.has('waifu-tool-switch-model'), false);
  assert.equal(nodes.has('waifu-tool-switch-texture'), false);
  assert.ok(!requests.some(url => url.endsWith('model_list.json')));
});

test('legacy initWidget(waifuPath, apiPath) restores stored IDs and uses the original API routes', async () => {
  const { context, requests, renders, nodes } = browser();
  context.document.head.appendChild({ src: base + 'live2d.min.js' });
  await settled();
  vm.runInContext(read('npm/sequential/waifu-tips.js'), context);
  context.localStorage.setItem('modelId', '7');
  context.localStorage.setItem('modelTexturesId', '3');
  const fetchLocal = context.fetch;
  context.fetch = async url => {
    if (url === base + 'waifu-tips.json') return fetchLocal(url);
    requests.push(url);
    return { ok: true, json: async () => url.includes('/switch/')
      ? { model: { id: 8, message: 'next' } }
      : { textures: { id: 4 } } };
  };
  context.initWidget(base + 'waifu-tips.json', base + 'api');
  await settled();
  await nodes.get('waifu-tool-switch-texture').click();
  await nodes.get('waifu-tool-switch-model').click();
  assert.ok(requests.includes(base + 'api/rand_textures/?id=7-3'));
  assert.ok(requests.includes(base + 'api/switch/?id=7'));
  assert.deepEqual(renders, ['7-3', '7-4', '8-0'].map(id => base + 'api/get/?id=' + id));
});

test('a previously hidden widget waits for reopening, restores the skin and respects custom tools', async () => {
  const { context, renders, nodes } = browser();
  context.document.head.appendChild({ src: base + 'live2d.min.js' });
  await settled();
  vm.runInContext(read('jsdelivr/sequential/waifu-tips.js'), context);
  context.localStorage.setItem('waifu-display', Date.now());
  context.localStorage.setItem('modelId', 1);
  context.localStorage.setItem('modelTexturesId', 2);
  context.initWidget({ cdnPath: base, waifuPath: base + 'waifu-tips.json', tools: ['photo'] });
  assert.equal(nodes.has('live2d'), false);
  nodes.get('waifu-toggle').click();
  await settled();
  assert.deepEqual(renders, [base + 'model/' + models[1][2] + '/index.json']);
  assert.ok(nodes.has('waifu-tool-photo'));
  assert.equal(nodes.has('waifu-tool-quit'), false);
  assert.equal(context.localStorage.getItem('waifu-display'), null);
});
