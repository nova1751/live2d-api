import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { posix, sep } from 'node:path';
import { test } from 'node:test';

const files = new Set(readdirSync('model', { recursive: true, withFileTypes: true })
  .filter(entry => entry.isFile())
  .map(entry => posix.join(entry.parentPath.split(sep).join('/'), entry.name)));
const readJson = file => JSON.parse(readFileSync(file, 'utf8'));

test('Cubism 2 physics uses input and output types supported by the renderer', () => {
  for (const file of files) {
    if (!file.endsWith('/physics.json')) continue;
    for (const hair of readJson(file).physics_hair) {
      for (const input of hair.src) {
        assert.ok(['x', 'y', 'angle'].includes(input.ptype), `${file}: invalid input type for ${input.id}`);
      }
      for (const output of hair.targets) {
        assert.ok(['angle', 'angle_v'].includes(output.ptype), `${file}: invalid output type for ${output.id}`);
      }
    }
  }
});

test('the skin catalog covers every model index', () => {
  const { models, messages } = readJson('model_list.json');
  assert.equal(models.length, messages.length);
  const catalog = models.flat().map(skin => `model/${skin}/index.json`).sort();
  assert.deepEqual(catalog, [...files].filter(file => file.endsWith('/index.json')).sort());
});

test('model settings reference packaged assets with exact path casing', () => {
  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    const setting = readJson(file);
    if (!file.endsWith('/index.json') && !Object.hasOwn(setting, 'model')) continue;

    // This ViewerEX preset is copied into its skin directory before use.
    const preset = file.endsWith('/替换配置/model.json');
    const base = posix.dirname(preset ? posix.dirname(file) : file);
    function check(reference) {
      assert.ok(typeof reference === 'string' && reference.length, `${file}: empty reference`);
      assert.ok(!reference.includes('\\'), `${file}: ${reference} uses a backslash`);
      assert.ok(files.has(posix.join(base, reference)), `${file}: missing ${reference}`);
    }
    check(setting.model);
    assert.ok(setting.textures?.length, `${file}: no textures`);
    setting.textures.forEach(check);
    for (const key of ['physics', 'pose']) {
      if (key in setting) check(setting[key]);
    }
    for (const expression of setting.expressions ?? []) check(expression.file);
    for (const motion of Object.values(setting.motions ?? {}).flat()) {
      if (!(preset && motion.sound && !motion.file)) check(motion.file);
      if ('sound' in motion) check(motion.sound);
      if (motion.command?.startsWith('change_cos ')) check(motion.command.slice('change_cos '.length));
    }
  }
});
