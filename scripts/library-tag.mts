import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';

import { collections } from '../src/library/catalog.ts';

export const gameFiles = collections.filter(name => name !== 'girls-frontline').map(name => name + '.json');
export const voiceDirectory = 'games/voices';

export async function libraryTag() {
  const digest = createHash('sha256');
  for (const path of ['library.json', ...gameFiles.map(name => 'games/' + name)]) {
    const bytes = await readFile('catalog/' + path, 'utf8');
    digest.update(path + '\0').update(bytes.replaceAll('\r\n', '\n')).update('\0');
  }
  for (const name of (await readdir('catalog/' + voiceDirectory)).sort()) {
    const path = voiceDirectory + '/' + name;
    digest.update(path + '\0').update(await readFile('catalog/' + path)).update('\0');
  }
  return 'catalog-' + digest.digest('hex').slice(0, 16);
}
