import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = async (name) =>
  JSON.parse(
    await readFile(
      new URL('../catalog/games/' + name + '.json', import.meta.url),
      'utf8',
    ),
  );

test('each game catalog can be deployed independently using immutable model sources', async () => {
  for (const game of ['azur-lane', 'bang-dream', 'houkai2']) {
    const catalog = await read(game);
    assert.deepEqual(
      Object.keys(catalog.gallery).sort(),
      Object.keys(catalog.models).sort(),
    );
    for (const [id, [asset]] of Object.entries(catalog.models)) {
      assert.equal(id.split('/').length, 3);
      assert.ok(catalog.gallery[id].name && catalog.gallery[id].outfit);
      const url = new URL(
        asset.manifest,
        catalog.sources[asset.source].baseUrl,
      );
      assert.equal(url.hostname, 'raw.githubusercontent.com');
      assert.match(url.pathname, /\/[0-9a-f]{40}\//);
    }
  }
});

test('recovered motions and expressions use the exact bundle of the original outfit', async () => {
  const catalog = await read('bang-dream'),
    audit = await read('audit');
  assert.deepEqual(audit.unavailable, []);
  for (const [id, general, expected] of [
    ['hhw/012/012_dream_festival_4_ur', '014', 13],
    ['mygo/039/039_live_event_297_ur_活动297', '039', 2],
  ]) {
    const records = audit.repairs.filter((row) => row.id === id);
    assert.equal(records.length, expected);
    for (const row of records) {
      assert.equal(catalog.models[id][0].files[row.file], row.from);
      assert.match(
        row.from,
        new RegExp(
          '/' +
            general +
            '_(general|dream_festival_4_ur|live_event_297_ur)_rip/',
        ),
      );
      assert.match(row.sha256, /^[a-f0-9]{64}$/);
    }
  }
  const az = await read('azur-lane');
  assert.match(
    az.models['ship/10117/lafei'][0].cues.touch_head.sound,
    /\/101170\/headtouch\.ogg$/,
  );
  assert.ok(az.models['ship/10117/lafei'][0].cues.touch_head.caption);
  const bh = await read('houkai2');
  for (const row of audit.unresolved) {
    assert.equal(bh.models[row.id][0].files[row.file], null);
    assert.match(row.file, /\.wav$|^Ev_Cv/i);
  }
});
import { loadModelCatalog } from '../src/library/catalog.ts';

test('resolving the same Azur Lane event in either language keeps its original recording', async (t) => {
  const catalog = await read('azur-lane');
  const original = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { baseURI: 'https://example.test/' },
  });
  t.after(() => {
    if (original) Object.defineProperty(globalThis, 'document', original);
    else delete globalThis.document;
  });
  t.mock.method(globalThis, 'fetch', async () => Response.json(catalog));
  const cue = async (locale) =>
    (
      await loadModelCatalog(
        '/catalog/games/azur-lane.json',
        'azur-lane',
        locale,
      )
    ).resolve('ship/10117/lafei').cues.touch_head;
  const zh = await cue('zh-CN'),
    en = await cue('en');
  assert.equal(zh.sound, en.sound);
  assert.match(zh.caption, /指挥官/);
  assert.match(en.caption, /Commander/);
});

test('curated Cubism 2 galleries resolve their published IDs and have real portraits', async (t) => {
  const { loadModelCatalog } = await import('../widget.mjs');
  t.mock.method(globalThis, 'fetch', async (url) => Response.json(await read(new URL(url).pathname.split('/').pop().replace('.json', ''))));
  const document = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { baseURI: 'https://example.org/' } });
  t.after(() => { if (document) Object.defineProperty(globalThis, 'document', document); else delete globalThis.document; });

  for (const [game, count] of [['iron-saga', 4], ['warship-girls', 3], ['baoshi-yanwuyu', 14]]) {
    const url = new URL('/catalog/games/' + game + '.json', 'https://example.org');
    const gallery = await loadModelCatalog(url, game, 'en');
    assert.equal(gallery.ids.length, count);
    assert.deepEqual(gallery.ids.sort(), Object.keys(gallery.gallery).sort());
    for (const id of gallery.ids) {
      const entry = gallery.gallery[id];
      const portrait = await readFile(new URL('../catalog/' + entry.portrait, import.meta.url));
      assert.equal(portrait.toString('ascii', 8, 12), 'WEBP', id);
      assert.ok(entry.en && entry.outfitEn, id);
      assert.match(gallery.resolve(id).modelUrl, /(?:@[\w-]*-assets-[56]\/|\/[\da-f]{40}\/).+\.json$/);
    }
  }
});

test('recovered media stays with its original recording, motion and locale', async () => {
  const az = await read('azur-lane'), bh = await read('houkai2'), audit = await read('audit');
  const boise = az.models['ship/10229/boyixi_2'][0].cues.wedding;
  const dress = az.models['ship/20705/kewei_4'][0].cues;
  for (const [group, file] of [['main_3_ex','main3_ex'], ['touch_special_ex','touch2_ex'], ['home_ex','home_ex']]) {
    assert.ok(dress[group].sound.endsWith('/207053/' + file + '.ogg'));
    assert.ok(dress[group].caption && dress[group].captionEn);
    assert.notEqual(dress[group].caption, dress[group.slice(0,-3)].caption);
  }
  const mei = bh.models['character/mie/mie'][0];
  assert.equal(Object.keys(mei.files).length, 7);
  for (const [file, url] of Object.entries(mei.files)) {
    assert.ok(url.endsWith('/mei/sounds/' + file.split('/')[1]));
    assert.ok(audit.repairs.some(row => row.id === 'character/mie/mie' && row.file === file && row.from === url));
  }
  assert.match(boise.sound, /\/102290\/propose\.ogg$/);
  assert.ok(boise.caption && boise.captionEn);
  assert.equal(az.models['ship/30116/xuefeng_3'][0].cues.touch_special.sound, undefined);
  for (const [id, count] of [['character/xier/xier', 9], ['character/delisha/delisha', 5]]) {
    const asset = bh.models[id][0];
    assert.equal(Object.keys(asset.cues).length, count);
    for (const [key, cue] of Object.entries(asset.cues)) {
      const repair = audit.repairs.find(row => row.id === id && row.file === key);
      assert.ok(cue.caption && cue.captionEn);
      assert.equal(repair.from, asset.files[key]);
      assert.match(repair.sha256, /^[a-f0-9]{64}$/);
    }
  }
});
