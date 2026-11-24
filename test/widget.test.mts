import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const models = JSON.parse(read('model_list.json')).models;
const version = JSON.parse(read('package.json')).version;
const modelSnapshot = '/gh/nova1751/live2d-api@cdn-b3ac5ae545e2/';
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
      toggleAttribute(name, force = !attributes.has(name)) {
        if (force) attributes.set(name, '');
        else attributes.delete(name);
        return force;
      },
      dataset: {}, style: {}, classList: { add() {}, remove() {} },
      remove() {},
      addEventListener(event, listener) { this[event] = () => listener({ isTrusted: false }); },
      insertAdjacentHTML(_, html) {
        for (const [, id] of html.matchAll(/id="([^"]+)"/g)) nodes.set(id, element());
      },
    };
  }
  const document = {
    querySelector() { return null; }, addEventListener() {}, body: element(), title: 'Demo', referrer: '', baseURI: base,
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
          const draw = (_, model, options) => { renders.push(model); options?.onPaint?.(); };
          if (tag.acceptCubism2) tag.acceptCubism2(draw); else context.loadlive2d = draw;
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
    document, URL, AbortController, CustomEvent, dispatchEvent() {}, screen: { width: 1024 }, location: new URL(base),
    localStorage: storage(), sessionStorage: storage(), console: { log() {}, error(error, detail) { throw detail ?? error; } },
    setTimeout() {}, setInterval() {}, clearTimeout() {}, addEventListener() {},
    async fetch(url) {
      requests.push(url);
      const file = new URL(url).pathname.split('/').pop();
      return { ok: true, json: async () => JSON.parse(read(file === 'library.json' ? 'catalog/library.json' : file)) };
    },
  });
  context.window = context;
  return { context, document, requests, renders, nodes };
}

const settled = () => new Promise(resolve => setImmediate(resolve));

for (const [provider, cdn] of [
  ['jsdelivr', 'https://cdn.jsdelivr.net/gh/nova1751/live2d-api@widget-' + version + '/'],
  ['npm', 'https://cdn.jsdelivr.net/gh/nova1751/live2d-api@widget-' + version + '/'],
]) {
  for (const mode of ['random', 'sequential']) {
    test(`legacy ${provider}/${mode} works with separate CSS`, async () => {
      const { context, requests, renders, nodes } = browser();
      vm.runInContext(read(`${provider}/${mode}/autoload.js`), context);
      await settled();
      assert.ok(requests.includes(cdn + `${provider}/${mode}/waifu-tips.js`));
      assert.ok(requests.includes(cdn + 'waifu-tips.json'));
      assert.ok(requests.every(url => !url.endsWith('.css')));
      const allowed = models[0].map(path => 'https://cdn.jsdelivr.net' + modelSnapshot + 'model/' + path + '/index.json');
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

test('a mainland legacy embed keeps its model fallback on the mainland CDN', async () => {
  const { context, requests, renders } = browser();
  const cdn = 'https://cdn.jsdmirror.com';
  const copied = cdn + '/test/runtime/';
  const fetch = context.fetch;
  context.fetch = async url => {
    if (url === copied + 'model_list.json') {
      requests.push(url);
      return { ok: false, status: 404 };
    }
    return fetch(url);
  };
  context.loadlive2d = (_, model) => renders.push(model);
  vm.runInContext(read('jsdelivr/sequential/waifu-tips.js'), context);
  context.initWidget({ cdnPath: copied, waifuPath: copied + 'waifu-tips.json' });
  await settled();
  assert.ok(requests.includes(cdn + modelSnapshot + 'model_list.json'));
  assert.deepEqual(renders, [cdn + modelSnapshot + 'model/' + models[0][0] + '/index.json']);
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

test('the legacy loader uses the runtime snapshot when its script comes from a matching source tag', async () => {
  const { context, document, requests, renders } = browser();
  const cdn = 'https://cdn.jsdmirror.com';
  const source = cdn + '/gh/nova1751/live2d-api@v' + version + '/';
  const runtime = cdn + '/gh/nova1751/live2d-api@widget-' + version + '/';
  const path = 'jsdelivr/sequential/autoload.min.js';
  document.currentScript = { src: source + path };
  vm.runInContext(read(path), context);
  await settled();
  assert.ok(requests.includes(runtime + 'jsdelivr/sequential/waifu-tips.js'));
  assert.ok(requests.every(url => !url.startsWith(source)));
  assert.equal(renders[0], cdn + modelSnapshot + 'model/' + models[0][0] + '/index.json');
});

test('single-model script resolves a page-relative manifest and preserves the built-in rotation preference', async () => {
  const { context, document, requests, renders, nodes } = browser();
  document.currentScript = { src: 'https://cdn.test/preview/autoload.js', dataset: { modelUrl: './Haru/index.json' } };
  context.innerWidth = 1024;
  context.localStorage.setItem('modelId', '4');
  vm.runInContext(read('autoload.js'), context);
  await settled();
  assert.deepEqual(renders, [base + 'Haru/index.json']);
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

test('npm shortcuts fetch the default catalog from the corresponding GitHub CDN', async () => {
  for (const host of ['cdn.jsdmirror.com', 'cdn.jsdelivr.net']) {
    const { context, document, requests, renders } = browser();
    const url = 'https://' + host + '/npm/live2dapi-noa@' + version;
    document.currentScript = { src: url, dataset: {} };
    context.innerWidth = 1024;
    vm.runInContext(read('autoload.js'), context);
    await settled();
    assert.ok(requests.includes(url + '/live2d.min.js'));
    const assets = 'https://' + host + modelSnapshot;
    assert.ok(requests.some(r => String(r).startsWith('https://' + host + '/gh/nova1751/live2d-api@catalog-') && String(r).endsWith('/catalog/library.json')));
    assert.equal(renders[0], assets + 'model/' + models[0][0] + '/index.json');
  }
});
test('the gallery and widget can share one catalog request and parsed index', async t => {
  const { context, document, requests, renders } = browser();
  globalThis.document = document;
  globalThis.window = context;
  t.after(() => { delete globalThis.document; delete globalThis.window; });
  const { loadWidget, loadModelCatalog } = await import('../widget.mjs?gallery-test');
  const url = base + 'library.json';
  t.mock.method(globalThis, 'fetch', async input => {
    requests.push(String(input));
    return Response.json({
      schemaVersion: 1, sources: { local: { baseUrl: './' } },
      models: { demo: [{ source: 'local', manifest: 'demo/index.json' }] },
    });
  });
  const catalog = await loadModelCatalog(url);
  await loadWidget({ baseUrl: base, catalog, modelId: 'demo' });
  await settled();
  assert.deepEqual(renders, [base + 'demo/index.json']);
  assert.equal(requests.filter(request => String(request) === url).length, 1);
});
