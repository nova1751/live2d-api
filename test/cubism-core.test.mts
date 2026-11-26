import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

test('the Cubism Core fallback points at the tag published for the vendored copy', async () => {
  const core = await readFile('vendor/cubism-core/live2dcubismcore.min.js');
  const tag = 'cubism-core-' + createHash('sha256').update(core).digest('hex').slice(0, 12);
  assert.match(core.subarray(0, 400).toString(), /Redistributable Code/);
  const loader = await readFile('src/modern/core.ts', 'utf8');
  assert.ok(loader.includes(`live2d-api@${tag}/live2dcubismcore.min.js`), 'Update PINNED_CORE_PATH to ' + tag);
});

test('the Cubism Core copy stays out of the published runtime', async () => {
  const { files } = JSON.parse(await readFile('package.json', 'utf8')) as { files: string[] };
  assert.ok(!files.some(path => path.startsWith('vendor')));
});
