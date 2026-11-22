import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { transform } from 'esbuild';

const json = async path => JSON.parse(await readFile(new URL('../' + path, import.meta.url)));
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
