import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';

const json = path => JSON.parse(readFileSync(path, 'utf8'));

test('Girls’ Frontline catalog covers the pinned trees and preserves each legacy widget address', () => {
  const base = 'catalog/girls-frontline/';
  const { characters, sources } = json(base + 'index.json');
  const legacy = json('model_list.json').models;
  const provenance = json('docs/model-sources.json').skins;
  const seenFiles = new Set(['index.json']);
  const seenSources = new Set();
  const seenSkins = new Set();
  const counts = {};
  function load(path) {
    assert.ok(!seenFiles.has(path), path);
    seenFiles.add(path);
    return json(base + path);
  }
  for (const entry of characters) {
    const character = load(entry.path);
    assert.equal(character.id, entry.id);
    assert.equal(character.category, entry.category);
    assert.equal(entry.path, entry.category + '/' + entry.id + '/index.json');
    for (const version of character.versions) {
      const record = load(version.path);
      assert.equal(version.path, entry.category + '/' + entry.id + '/' + version.id + '.json');
      assert.deepEqual([record.category, record.character, record.version], [entry.category, entry.id, version.id]);
      assert.equal(new Set(record.forms.map(f => f.id)).size, record.forms.length);
      for (const form of record.forms) {
        assert.equal(form.path, entry.category + '/' + entry.id + '/' + version.id + '/' + form.id + '.json');
        const { category, character, version: versionId, id, sources: files, widget } = load(form.path);
        assert.deepEqual([category, character, versionId, id], [entry.category, entry.id, version.id, form.id]);
        assert.ok(files.length > 0);
        for (const { repository, path, blob, format } of files) {
          const key = repository + '/' + path;
          assert.ok(sources[repository] && !seenSources.has(key), key);
          seenSources.add(key);
          assert.match(blob, /^[0-9a-f]{40}$/);
          assert.ok(path.endsWith('.' + format));
          counts[repository] = (counts[repository] ?? 0) + 1;
        }
        for (const { modelId, modelTexturesId, index } of widget) {
          const skin = [legacy[modelId]].flat()[modelTexturesId];
          assert.equal(index, 'model/' + skin + '/index.json');
          const dir = provenance[skin].slice(0, provenance[skin].lastIndexOf('/') + 1);
          const binary = dir + json(index).model.split('/').pop();
          assert.ok(files.some(f => f.repository === 'eikanya' && f.path === binary), index);
          assert.ok(!seenSkins.has(skin), skin);
          seenSkins.add(skin);
        }
      }
    }
  }
  assert.deepEqual(counts, { eikanya: 595, jacksen168: 295 });
  assert.deepEqual(seenSkins, new Set(Object.keys(provenance).filter(s => provenance[s].startsWith('少女前线 girls Frontline/'))));
  const allFiles = readdirSync(base, { recursive: true }).map(p => p.replaceAll('\\', '/')).filter(p => p.endsWith('.json'));
  assert.deepEqual(new Set(allFiles), seenFiles);
});
