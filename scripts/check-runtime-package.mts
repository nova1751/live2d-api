import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

const root = process.argv[2];
const files = await readdir(root, { recursive: true });
assert.ok(files.includes('girls-frontline.mjs') && files.includes('autoload.js') && files.includes('live2d.min.js'));
assert.ok(files.some(file => file.replaceAll('\\', '/') === 'modern/renderer.mjs'));
for (const file of ['README.md', 'docs/en/README.md', 'waifu-tips.en.json', 'waifu-tips.json', 'widget.d.mts', 'library/catalog.d.ts']) {
  assert.ok(files.some(path => path.replaceAll('\\', '/') === file), 'Missing ' + file);
}
assert.match(await readFile(join(root, 'README.md'), 'utf8'), /^# Live2D 网页看板娘$/m);
assert.match(await readFile(join(root, 'docs/en/README.md'), 'utf8'), /^# Live2D Web Widget$/m);
let size = 0;
for (const file of files) {
  assert.doesNotMatch(file, /^(?:model(?:[\\/]|_list\.json|$)|catalog(?:[\\/]|$)|img(?:[\\/]|$))|\.(?:moc3?|mtn|png|mp3|ogg|wav)$/i);
  const entry = await stat(join(root, file));
  if (entry.isFile()) size += entry.size;
}
assert.ok(size < 1_000_000, 'Runtime exceeded 1 MB unpacked: ' + size);
console.log('Runtime package verified (' + size + ' bytes unpacked)');
