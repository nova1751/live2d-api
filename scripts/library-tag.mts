import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

import { collections } from '../src/library/catalog.ts';

export const gameFiles = collections.filter(name => name !== 'girls-frontline').map(name => name + '.json');
export const gameAssetDirectories = ['voices', 'band-dream-cn', 'azur-lane-l2d'];

export async function libraryTag() {
  const digest = createHash('sha256');
  for (const path of ['library.json', ...gameFiles.map(name => 'games/' + name)]) {
    const bytes = await readFile('catalog/' + path, 'utf8');
    digest.update(path + '\0').update(bytes.replaceAll('\r\n', '\n')).update('\0');
  }
  for (const directory of gameAssetDirectories) {
    const root = 'catalog/games/' + directory;
    const entries = await readdir(root, { recursive: true, withFileTypes: true });
    const files = entries.filter(entry => entry.isFile()).map(entry =>
      relative(root, join(entry.parentPath, entry.name)).split(sep).join('/')).sort();
    for (const name of files) {
      const path = 'games/' + directory + '/' + name;
      digest.update(path + '\0').update(await readFile('catalog/' + path)).update('\0');
    }
  }
  return 'catalog-' + digest.digest('hex').slice(0, 16);
}
