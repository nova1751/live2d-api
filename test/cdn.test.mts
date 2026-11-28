import test from 'node:test';
import assert from 'node:assert/strict';

// The module reads these browser globals; give it a minimal page.
const stored = new Map<string, string>();
Object.assign(globalThis, {
  window: globalThis,
  document: { baseURI: 'https://example.test/' },
  localStorage: { getItem: (key: string) => stored.get(key) ?? null, setItem: (key: string, value: string) => stored.set(key, value) },
});
type Cdn = typeof import('../src/runtime/cdn.ts');
let copies = 0;
let cdnCandidates: Cdn['cdnCandidates'], cdnPreference: Cdn['cdnPreference'], fetchCdnAsset: Cdn['fetchCdnAsset'];
let setCdnPreference: Cdn['setCdnPreference'], HEDGE_MS: number;
/** A fresh copy of the module: no stored preference and no hosts demoted by an earlier test. */
async function reset() {
  stored.clear();
  delete (globalThis as Record<symbol, unknown>)[Symbol.for('live2d.cdnPreference')];
  ({ cdnCandidates, cdnPreference, fetchCdnAsset, setCdnPreference, HEDGE_MS } = await import('../src/runtime/cdn.ts?copy=' + ++copies));
}

const path = 'nova1751/live2d-api@cdn-b3ac5ae545e2/model/a/index.json';
const jsdelivr = 'https://cdn.jsdelivr.net/gh/' + path;
const mirror = 'https://cdn.jsdmirror.com/gh/' + path;
const raw = 'https://raw.githubusercontent.com/nova1751/live2d-api/cdn-b3ac5ae545e2/model/a/index.json';

test('global hosts come first, then the mainland mirror', async () => {
  await reset();
  assert.deepEqual(cdnCandidates(jsdelivr), [jsdelivr, raw, mirror, mirror + '?live2d-retry=1']);
  assert.deepEqual(cdnCandidates(raw), [raw, jsdelivr, mirror, mirror + '?live2d-retry=1'], 'a raw link stays first');
  // A page that links to the mirror chose it on purpose.
  assert.deepEqual(cdnCandidates(mirror), [mirror, jsdelivr, raw, mirror + '?live2d-retry=1']);
});

test('scripts never go to raw GitHub, and jsDelivr-only refs have no raw copy', async () => {
  await reset();
  assert.ok(!cdnCandidates(jsdelivr, { script: true }).some(url => url.startsWith('https://raw.')));
  assert.deepEqual(cdnCandidates('https://cdn.jsdelivr.net/gh/a/b@latest/x.js'), ['https://cdn.jsdelivr.net/gh/a/b@latest/x.js', 'https://cdn.jsdmirror.com/gh/a/b@latest/x.js', 'https://cdn.jsdmirror.com/gh/a/b@latest/x.js?live2d-retry=1']);
  assert.ok(cdnCandidates('https://cdn.jsdelivr.net/gh/a/b@' + 'f'.repeat(40) + '/x.json').some(url => url.startsWith('https://raw.')));
});

test('a remembered mainland preference puts the mirror first', async () => {
  await reset();
  setCdnPreference('mainland');
  assert.equal(cdnCandidates(jsdelivr)[0], mirror);
  assert.equal(JSON.parse(stored.get('live2d-cdn')!).family, 'mainland');
});

type Plan = Record<string, 'hang' | 'fail' | number>;
function stubFetch(t: test.TestContext, plan: Plan) {
  const started: string[] = [];
  const aborted: string[] = [];
  t.mock.method(globalThis, 'fetch', (url: string, init?: { signal?: AbortSignal }) => {
    started.push(url);
    const host = new URL(url).host;
    const action = plan[host];
    return new Promise((resolve, reject) => {
      init?.signal?.addEventListener('abort', () => { aborted.push(host); reject(new DOMException('aborted', 'AbortError')); });
      if (action === 'fail') reject(new TypeError('network'));
      else if (typeof action === 'number') resolve(new Response(host, { status: action }));
    });
  });
  return { started, aborted };
}

test('a fast global host answers alone', async t => {
  await reset();
  const { started } = stubFetch(t, { 'cdn.jsdelivr.net': 200 });
  const response = await fetchCdnAsset(jsdelivr);
  assert.equal(await response.text(), 'cdn.jsdelivr.net');
  assert.deepEqual(started, [jsdelivr]);
});

test('a silent global host brings in the mirror after one wait, not one wait per host', async t => {
  await reset();
  const { started, aborted } = stubFetch(t, { 'cdn.jsdelivr.net': 'hang', 'raw.githubusercontent.com': 'hang', 'cdn.jsdmirror.com': 200 });
  const begun = Date.now();
  const response = await fetchCdnAsset(jsdelivr);
  const took = Date.now() - begun;
  assert.equal(await response.text(), 'cdn.jsdmirror.com');
  assert.ok(took >= HEDGE_MS - 50 && took < HEDGE_MS + 500, `${took} ms`);
  assert.deepEqual(started, [jsdelivr, mirror], 'raw, on the same blocked network, is skipped');
  assert.deepEqual(aborted, ['cdn.jsdelivr.net'], 'the stalled request is cancelled');
  assert.equal(cdnPreference(), 'mainland', 'later requests start at the mirror');
});

test('a slow but working global host keeps the visitor on the global hosts', async t => {
  await reset();
  t.mock.method(globalThis, 'fetch', (url: string) => new Promise(resolve =>
    setTimeout(() => resolve(new Response(new URL(url).host)), new URL(url).host === 'cdn.jsdelivr.net' ? HEDGE_MS - 500 : 50)));
  assert.equal(await (await fetchCdnAsset(jsdelivr)).text(), 'cdn.jsdelivr.net');
  assert.notEqual(cdnPreference(), 'mainland');
});

test('only the first request races; files requested meanwhile wait and then use the winner', async t => {
  await reset();
  const { started } = stubFetch(t, { 'cdn.jsdelivr.net': 'hang', 'raw.githubusercontent.com': 'hang', 'cdn.jsdmirror.com': 200 });
  const files = ['a', 'b', 'c'].map(name => `https://cdn.jsdelivr.net/gh/o/r@tag-3/${name}.json`);
  const bodies = await Promise.all(files.map(async file => (await fetchCdnAsset(file)).text()));
  assert.deepEqual(bodies, ['cdn.jsdmirror.com', 'cdn.jsdmirror.com', 'cdn.jsdmirror.com']);
  assert.deepEqual(started.map(url => new URL(url).host + new URL(url).pathname.slice(-7)),
    ['cdn.jsdelivr.net/a.json', 'cdn.jsdmirror.com/a.json', 'cdn.jsdmirror.com/b.json', 'cdn.jsdmirror.com/c.json']);
});

test('once the page has chosen, a slow file waits for its host instead of switching', async t => {
  await reset();
  const { started } = stubFetch(t, { 'cdn.jsdelivr.net': 200 });
  await fetchCdnAsset(jsdelivr);
  t.mock.restoreAll();
  const slow = stubFetch(t, { 'cdn.jsdelivr.net': 'hang', 'cdn.jsdmirror.com': 200 });
  const controller = new AbortController();
  const pending = fetchCdnAsset('https://cdn.jsdelivr.net/gh/o/r@tag-4/big.png', controller.signal);
  await new Promise(resolve => setTimeout(resolve, HEDGE_MS + 300));
  assert.deepEqual(slow.started, ['https://cdn.jsdelivr.net/gh/o/r@tag-4/big.png'], 'no second host was started');
  controller.abort(new DOMException('stop', 'AbortError'));
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(started.length, 1);
});

test('a family remembered from an earlier visit is tried first but still checked', async t => {
  await reset();
  stored.set('live2d-cdn', JSON.stringify({ family: 'mainland', until: Date.now() + 60_000 }));
  // The mirror no longer answers, for example after travelling: the page falls back to the global hosts.
  const { started } = stubFetch(t, { 'cdn.jsdmirror.com': 'hang', 'cdn.jsdelivr.net': 200 });
  assert.equal(await (await fetchCdnAsset(jsdelivr)).text(), 'cdn.jsdelivr.net');
  assert.deepEqual(started, [mirror, jsdelivr]);
  assert.equal(cdnPreference(), 'global');
});

test('a blocked status moves on at once, and a missing file is final', async t => {
  await reset();
  const { started } = stubFetch(t, { 'cdn.jsdelivr.net': 403, 'raw.githubusercontent.com': 200 });
  assert.equal(await (await fetchCdnAsset(jsdelivr)).text(), 'raw.githubusercontent.com');
  assert.deepEqual(started, [jsdelivr, raw]);
  t.mock.restoreAll();
  await reset();
  const missing = stubFetch(t, { 'cdn.jsdelivr.net': 404, 'raw.githubusercontent.com': 200 });
  assert.equal((await fetchCdnAsset('https://cdn.jsdelivr.net/gh/a/b@tag-1/missing.json')).status, 404);
  assert.equal(missing.started.length, 1);
});

test('cancelling the load cancels every attempt', async t => {
  await reset();
  const { aborted } = stubFetch(t, { 'cdn.jsdelivr.net': 'hang', 'raw.githubusercontent.com': 'hang', 'cdn.jsdmirror.com': 'hang' });
  const controller = new AbortController();
  const pending = fetchCdnAsset('https://cdn.jsdelivr.net/gh/a/b@tag-2/x.json', controller.signal);
  await new Promise(resolve => setTimeout(resolve, HEDGE_MS + 100));
  controller.abort(new DOMException('stop', 'AbortError'));
  await assert.rejects(pending, { name: 'AbortError' });
  assert.deepEqual(aborted.sort(), ['cdn.jsdelivr.net', 'cdn.jsdmirror.com']);
});
