import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
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
  for (const { id } of audit.unavailable) assert.equal(catalog.models[id], undefined);
  for (const { id, file } of audit.optionalPhysics) assert.equal(catalog.models[id][0].files[file], null);
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

test('the Eve story motion uses the recording and subtitles from the same talk command', async () => {
  const { parseModelCatalog } = await import('../src/library/catalog.ts');
  const catalog = await read('bang-dream');
  const location = new URL('https://cdn.jsdmirror.com/gh/nova1751/live2d-api@catalog-test/catalog/games/bang-dream.json');
  const source = await read('voices/event154-06');
  const zh = parseModelCatalog(catalog, location, 'bang-dream').resolve(source.id).cues;
  const en = parseModelCatalog(catalog, location, 'bang-dream', 'en').resolve(source.id).cues;
  for (const [motion, cue] of Object.entries(source.cues)) {
    const path = new URL('./voices/' + cue.sound, location);
    assert.equal(zh[motion].sound, path.href);
    assert.equal(en[motion].sound, path.href);
    assert.equal(zh[motion].caption, cue.caption);
    assert.equal(en[motion].caption, cue.captionEn);
    const audio = await readFile(new URL('../catalog/games/voices/' + cue.sound, import.meta.url));
    assert.equal(createHash('sha256').update(audio).digest('hex'), source.recordings[cue.sound].sha256);
  }
});

test('Houkai restores native event audio and numbered subtitles from the game bundles', async () => {
  const { parseModelCatalog } = await import('../src/library/catalog.ts');
  const [catalog, audit, voices, captions] = await Promise.all(
    ['houkai2', 'audit', 'voices/houkai2-partner-11.7', 'voices/houkai2-textmap-11.7'].map(read),
  );
  const location = new URL('https://cdn.jsdmirror.com/gh/nova1751/live2d-api@catalog-test/catalog/games/houkai2.json');
  const library = parseModelCatalog(catalog, location, 'houkai2');
  for (const [event, recording] of Object.entries(voices.recordings)) {
    const name = 'houkai2-' + event + '.ogg';
    const asset = library.resolve(recording.model);
    assert.equal(asset.cues[event].sound, new URL('./voices/' + name, location).href);
    assert.ok(asset.cues[event].caption);
    assert.ok(!audit.unresolved.some(row => row.id === recording.model && row.file === event));
    const audio = await readFile(new URL('../catalog/games/voices/' + name, import.meta.url));
    assert.equal(createHash('sha256').update(audio).digest('hex'), recording.sha256);
  }
  for (const [folder, records] of Object.entries(captions.models)) {
    const id = 'character/' + (folder === 'BYC' ? 'yazakura' : folder) + '/' + folder;
    const asset = library.resolve(id);
    for (const [key, record] of Object.entries(records)) {
      assert.equal(asset.cues[key].caption, record.caption);
    }
  }
  const kiana = library.resolve('character/Kiana/Kiana');
  assert.equal(kiana.files['sound/kiana_live2d_001.wav'], null);
  assert.equal(kiana.cues['sound/kiana_live2d_001.wav'].sound, undefined);
  assert.ok(kiana.cues['sound/kiana_live2d_001.wav'].caption);
});

test('the 98K oath recording follows the catalog CDN for both native outfit events', async () => {
  const { parseModelCatalog } = await import('../src/library/catalog.ts');
  const [catalog, recording] = await Promise.all([read('../library'), read('voices/gfl-98k-dialoguewedding')]);
  for (const domain of ['cdn.jsdmirror.com', 'cdn.jsdelivr.net']) {
    const location = new URL(`/gh/nova1751/live2d-api@catalog-test/catalog/library.json`, 'https://' + domain);
    const library = parseModelCatalog(catalog, location, 'girls-frontline');
    for (const [id, event] of [['doll/98k/4301/normal', '430110'], ['doll/98k/8301/normal', '830109']]) {
      const cue = library.resolve(id).cues[event];
      assert.equal(cue.sound, new URL(recording.sound, location).href);
      assert.equal(cue.caption, recording.caption);
    }
  }
  const audio = await readFile(new URL('../catalog/' + recording.sound, import.meta.url));
  assert.equal(createHash('sha256').update(audio).digest('hex'), recording.sha256);
});

test('curated Cubism 2 galleries resolve their published IDs and have real portraits', async (t) => {
  const { loadModelCatalog } = await import('../widget.mjs');
  t.mock.method(globalThis, 'fetch', async (url) => Response.json(await read(new URL(url).pathname.split('/').pop().replace('.json', ''))));
  const document = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { baseURI: 'https://example.org/' } });
  t.after(() => { if (document) Object.defineProperty(globalThis, 'document', document); else delete globalThis.document; });

  for (const [game, count] of [['iron-saga', 5], ['warship-girls', 3], ['baoshi-yanwuyu', 16]]) {
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
  const azurRepairs = await read('voices/azur-wiki-voices');
  assert.equal(azurRepairs.length, 9);
  for (const repair of azurRepairs) {
    const cue = az.models[repair.id][0].cues[repair.group];
    assert.equal(az.gallery[repair.id].date, repair.skinId);
    assert.equal(cue.caption, repair.caption);
    assert.equal(cue.captionEn, repair.captionEn);
    assert.equal(cue.sound, repair.sound);
    const audio = await readFile(new URL('../catalog/games/' + repair.sound, import.meta.url));
    assert.equal(audio.toString('ascii', 0, 4), 'OggS');
    assert.equal(createHash('sha256').update(audio).digest('hex'), repair.sha256);
  }
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
