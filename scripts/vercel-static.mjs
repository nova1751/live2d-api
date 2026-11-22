import { cp, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { siteFiles } from './site-files.mjs';
const { files } = JSON.parse(await readFile('package.json', 'utf8'));
await mkdir('public', { recursive: true });
for (const path of siteFiles(files)) {
  await cp(path, join('public', path), { recursive: true });
}
