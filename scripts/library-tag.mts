import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

export async function libraryTag() {
  const bytes = await readFile('catalog/library.json', 'utf8');
  return 'catalog-' + createHash('sha256').update(bytes.replaceAll('\r\n', '\n')).digest('hex').slice(0, 16);
}
