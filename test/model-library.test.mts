import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { transform } from 'esbuild';

const json = async path => JSON.parse(await readFile(new URL('../' + path, import.meta.url)));

test('DSR-50 scene curtains belong to the reviewed manifest and survive URL rewriting', async () => {
  const { parseModelCatalog } = await import('../src/library/catalog.ts');
  const source = await json('catalog/library.json');
  const id = 'doll/dsr50/10501/normal';
  for (const base of ['https://cdn.jsdmirror.com/', 'https://archive.invalid/']) {
    const catalog = parseModelCatalog(source, new URL('catalog/library.json', base), 'girls-frontline');
    const hidden = catalog.resolve(id, 'dump').hiddenDrawables;
    for (const name of ['ArtMesh308', 'ArtMesh334', 'ArtMesh390']) assert.ok(hidden?.includes(name));
    assert.equal(catalog.resolve('doll/6p62/8610/normal', 'dump').hiddenDrawables, undefined);
  }
});

test('all seven mainland catalogs resolve pinned models, recordings and absolute repairs through the mirror', async () => {
  const { collections, parseModelCatalog } = await import('../src/library/catalog.ts');
  const mirror = 'https://cdn.jsdmirror.com';
  for (const game of collections) {
    const path = game === 'girls-frontline' ? 'catalog/library.json' : 'catalog/games/' + game + '.json';
    const catalog = parseModelCatalog(await json(path), new URL(path, mirror), game);
    const recordings = new Set();
    for (const id of catalog.ids) {
      const { modelUrl, dialogue, files, cues } = catalog.resolve(id);
      const portrait = catalog.gallery?.[id]?.portrait;
      if (portrait?.startsWith('https:')) assert.equal(new URL(portrait).origin, mirror, id);
      if (dialogue) recordings.add(dialogue.audio);
      for (const url of [modelUrl, dialogue?.url, ...Object.values(files ?? {}), ...Object.values(cues ?? {}).map(cue => cue.sound)]) {
        if (url && /^https?:/.test(url)) assert.equal(new URL(url).origin, mirror, id + ' ' + url);
      }
    }
    for (const audio of recordings) for (const url of audio.values()) assert.equal(new URL(url).origin, mirror);
  }
});

test('OTs-14 uses native events and regional packs in the gallery and preserves legacy and offline sources', async t => {
  const { loadModelCatalog } = await import('../widget.mjs');
  const catalog = await json('catalog/library.json');
  const url = 'https://cdn.jsdmirror.com/gh/nova1751/live2d-api@tag/catalog/library.json';
  globalThis.document = { baseURI: url };
  t.after(() => { delete globalThis.document; });
  t.mock.method(globalThis, 'fetch', async () => Response.json(catalog));
  const id = 'doll/ots14/1203/normal';
  const gallery = await loadModelCatalog(url, 'girls-frontline');
  const native = gallery.resolve(id);
  assert.match(native.modelUrl, /^https:\/\/cdn\.jsdmirror\.com\/.+@cdn-ots14-.+\.model3\.json$/);
  assert.equal(new URL(native.dialogue.url).hostname, 'cdn.jsdmirror.com');
  assert.equal(new URL(native.dialogue.audio.get('AUDIO/OTS14/OTS14_DIALOGUE1_JP.OGG')).hostname, 'cdn.jsdmirror.com');
  const classic = await loadModelCatalog(url);
  assert.match(classic.resolve(id).modelUrl, /model\/ost14\/.+index\.json$/);
  catalog.sources.dump.baseUrl = '../../sources/dump/';
  const offline = await loadModelCatalog('http://localhost/viewer/catalog/library.json', 'girls-frontline');
  assert.match(offline.resolve(id).modelUrl, /^http:\/\/localhost\/sources\/dump\/models\//);
});
test('portable catalog retains the original numeric addresses and pinned assets', async () => {
  const catalog = await json('catalog/library.json');
  const original = await json('model_list.json');
  assert.equal(catalog.legacyIds.length, original.models.length);
  original.models.forEach((skins, group) => {
    const paths = [skins].flat().map(skin => 'model/' + skin + '/index.json');
    const entries = catalog.legacyIds[group].map(id => catalog.models[id].find(v => v.source === 'widget')?.manifest);
    assert.deepEqual(entries, paths);
  });
  for (const [id, variants] of Object.entries(catalog.models)) {
    assert.equal(id.split('/').length, 4);
    assert.ok(variants[0].manifest, id);
    for (const variant of variants) assert.match(catalog.sources[variant.source].commit, /^[a-f0-9]{40}$/);
  }
  const sample = catalog.models['doll/56-1type/7706/normal'][0];
  assert.equal(sample.source, 'dump');
  assert.ok(sample.dialogue.endsWith('.data.json'));
  assert.ok(catalog.audio.dump.includes('audio/56-1TYPE/56-1TYPE_WIN_JP.ogg'));
});

test('game motion counts match the Cubism segment encoding for all curve types', async () => {
  const source = await readFile(new URL('../src/modern/motion.ts', import.meta.url), 'utf8');
  const { code } = await transform(source, { loader: 'ts', format: 'esm' });
  const { prepareMotion } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
  const values = [0, 1, 0, 1, 2, 1, 2, 3, 3, 2, 4, 1, 2, 5, 1, 3, 6, 0];
  const clip = { Meta: { Duration: 6, Loop: true }, Curves: [{ Segments: values.slice() }, { Segments: [0, 0] }] };
  prepareMotion(clip, false);
  assert.deepEqual(clip.Meta, { Duration: 6, Loop: true, CurveCount: 2, TotalSegmentCount: 5, TotalPointCount: 9 });
  assert.deepEqual(clip.Curves[0].Segments, values);
  prepareMotion(clip, true);
  assert.equal(clip.Meta.Loop, false);
  assert.throws(() => prepareMotion({ ...clip, Curves: [{ Segments: [0, 1, 4] }] }, true));
});

test('Chinese presentation keeps archive links and speaker-specific captions', async () => {
  const catalog = await json('catalog/library.json');
  const { aliases, captions, labels } = catalog.presentation;
  for (const [old, visible] of Object.entries(aliases)) {
    assert.ok(catalog.models[old] && catalog.models[visible]);
    assert.equal(old.split('/').at(-1), visible.split('/').at(-1));
  }
  assert.equal(aliases['doll/ak12/archive/normal'], 'doll/ak12/3302/normal');
  assert.match(labels['doll/56-1type/7706'], /[\u3400-\u9fff]/);
  assert.match(captions['HK416MOD_LIVE2D|HELLO'], /指挥官/);
  assert.notEqual(captions['K2|DIALOGUE1'], captions['RFB|DIALOGUE1']);
});

test('collection navigation starts with fairies and follows CN releases, then standard/damaged', async t => {
  const catalog = await json('catalog/library.json');
  const source = await readFile(new URL('../src/library/catalog.ts', import.meta.url), 'utf8');
  const { code } = await transform(source, { loader: 'ts', format: 'esm' });
  const { loadModelCatalog } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
  const previous = globalThis.document;
  globalThis.document = { baseURI: 'https://example.org/' };
  t.after(() => { if (previous) globalThis.document = previous; else delete globalThis.document; });
  t.mock.method(globalThis, 'fetch', async () => Response.json(catalog));
  const zh = await loadModelCatalog('catalog.json', 'girls-frontline');
  const en = await loadModelCatalog('catalog.json', 'girls-frontline', 'en');
  const { ids } = zh;
  assert.deepEqual(en.ids, ids);
  const doll = 'doll/56-1type/7706';
  assert.match(en.labels[doll], /Peerless Nunchaku Dance/);
  const original = zh.resolve(doll + '/normal'), localized = en.resolve(doll + '/normal');
  assert.equal(localized.modelUrl, original.modelUrl);
  assert.equal(localized.dialogue.url, original.dialogue.url);
  assert.equal(localized.dialogue.captions, undefined);
  assert.match(en.resolve('doll/kp31/archive/normal').captions['一步也不会退让的。'], /inch/);
  assert.equal(ids[0], 'fairy/air_attack/1/default');
  assert.ok(ids.slice(0, 27).every(id => id.startsWith('fairy/')));
  const versions = who => [...new Set(ids.filter(id => id.startsWith('doll/' + who + '/')).map(id => id.split('/')[2]))];
  assert.deepEqual(versions('wa2000'), ['6','306','1108']);
  assert.deepEqual(versions('ump45'), ['2107','mod','3403','5405','584']);
  assert.deepEqual(versions('g11'), ['9','1602','4102','mod','8401']);
  for (const id of ids.filter(id => id.endsWith('/destroy'))) {
    const normal = id.replace(/destroy$/, 'normal');
    if (ids.includes(normal)) assert.equal(ids[ids.indexOf(id) - 1], normal);
  }
});

test('every visible gallery form has a WebP portrait from its model', async () => {
  const catalog = await json('catalog/library.json');
  const ids = Object.keys(catalog.models).filter(id => !id.startsWith('other/') && !catalog.presentation.aliases[id]);
  for (const id of ids) {
    const url = new URL('../catalog/portraits/' + id.replaceAll('/', '--') + '.webp', import.meta.url);
    const image = await readFile(url);
    assert.equal(image.toString('ascii', 0, 4), 'RIFF', id);
    assert.equal(image.toString('ascii', 8, 12), 'WEBP', id);
    assert.equal(image.readUInt32LE(4) + 8, image.length, id);
  }
});

test('mixed-source gallery cues retain unique Cubism 2 motions and follow the catalog region', async t => {
  const { loadModelCatalog } = await import('../widget.mjs');
  const catalog = await json('catalog/library.json');
  t.mock.method(globalThis, 'fetch', async () => Response.json(catalog));
  const url = 'https://cdn.jsdmirror.com/gh/nova1751/live2d-api@tag/catalog/library.json';
  globalThis.document = { baseURI: url };
  t.after(() => { delete globalThis.document; });
  const id = 'doll/wa2000/306/normal';
  const gallery = await loadModelCatalog(url, 'girls-frontline');
  const model = gallery.resolve(id);
  assert.match(model.modelUrl, /index\.json$/);
  assert.match(model.cues['motions/touch_1.mtn'].sound, /^https:\/\/cdn\.jsdmirror\.com\/.+WA2000_DIALOGUE3_JP\.ogg$/i);
  assert.equal((await loadModelCatalog(url)).resolve(id).cues, undefined);
  catalog.sources.dump.baseUrl = '../../sources/dump/';
  const offline = (await loadModelCatalog('https://example.test/viewer/catalog/library.json', 'girls-frontline')).resolve(id);
  assert.match(offline.cues['motions/touch_1.mtn'].sound, /^https:\/\/example\.test\/sources\/dump\/audio\//);
});
