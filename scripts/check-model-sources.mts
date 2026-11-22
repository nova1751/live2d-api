// Run from the widget repository with a local checkout of the recorded source.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';

const { repository, commit, skins, unavailable, unresolvedHitAreas } = JSON.parse(readFileSync('docs/model-sources.json'));
const checkout = process.argv[2];
assert.ok(checkout, 'Pass the local checkout of ' + repository);
const revision = execFileSync('git', ['-C', checkout, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
assert.equal(revision, commit, 'The upstream checkout must match the recorded revision');
const catalog = JSON.parse(readFileSync('model_list.json')).models.flat().sort();
assert.deepEqual(Object.keys(skins).sort(), catalog);
const missing = new Set(unavailable.map(x => [x.skin, x.field, x.reference].join('|')));
let count = 0;
for (const [skin, path] of Object.entries(skins)) {
  const original = join(checkout, path);
  const upstream = JSON.parse(readFileSync(original, 'utf8').replace(/^\uFEFF/, '').replace(/\/\*[\s\S]*?\*\//g, ''));
  const local = JSON.parse(readFileSync(join('model', skin, 'index.json')));
  const sourceDir = dirname(original);
  const skinDir = join('model', skin);
  const target = (field, reference) => {
    if (skin.startsWith('ship/') && field === 'sound' && reference === 'test') return;
    if (missing.delete([skin, field, reference].join('|'))) {
      assert.ok(!existsSync(resolve(sourceDir, reference)), 'Upstream now contains ' + reference);
      return;
    }
    return reference.replaceAll('\\', '/');
  };
  const expected = {};
  for (const [group, entries] of Object.entries(upstream.motions)) {
    for (const source of entries) {
      const item = { ...source };
      for (const field of ['file', 'sound']) {
        if (!(field in source)) continue;
        const ref = target(field, source[field]);
        if (!ref) { delete item[field]; continue; }
        const actual = local.motions[group]?.[expected[group]?.length ?? 0]?.[field];
        assert.ok(actual, skin + ' ' + group + ' missing ' + ref);
        const madierda = skin === 'madierda' && field === 'sound' && /-j(\d+)\.mp3$/.exec(ref);
        const name = madierda ? 'madierda' + madierda[1] + '.mp3' : basename(ref);
        assert.equal(basename(actual).toLowerCase(), name.toLowerCase(), skin + ' ' + group);
        // When the original file is present, compare bytes, including MP3 files.
        const src = madierda ? join(sourceDir, 'voice', name) : resolve(sourceDir, ref);
        if (existsSync(src)) assert.ok(readFileSync(src).equals(readFileSync(resolve(skinDir, actual))), skin + ' ' + actual);
        item[field] = actual;
      }
      if (skin === 'rfbchristmas/normal' && item.command === 'change_cos model1.json') item.command = 'change_cos ../destroy/index.json';
      if (item.file || item.sound || item.command) { (expected[group] ??= []).push(item); count++; }
    }
  }
  assert.deepEqual(local.motions, expected, skin);
  for (const field of ['trigger', 'auto_action', 'auto_breath', 'lip_sync']) assert.deepEqual(local[field], upstream[field], skin + ' ' + field);
  const areas = structuredClone(upstream.hit_areas);
  if (skin === 'kp31/kp31_/destroy') areas.forEach(a => { a.id = a.id.replace('D_REF_', 'D_REF.'); });
  assert.deepEqual(local.hit_areas, areas, skin + ' hit areas');
  const moc = readFileSync(join(skinDir, local.model));
  for (const area of areas.filter(a => !unresolvedHitAreas[skin]?.includes(a.id))) assert.ok(moc.includes(Buffer.concat([Buffer.from([Buffer.byteLength(area.id)]), Buffer.from(area.id)])), skin + ' mesh ' + area.id);
}
assert.equal(missing.size, 0, 'Stale missing-asset exceptions');
console.log('Verified ' + catalog.length + ' skins and ' + count + ' event entries against ' + revision);
