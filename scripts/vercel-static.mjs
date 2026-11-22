import { cp, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

// Deploy the same browser assets and historical paths as the npm package.
const { files } = JSON.parse(await readFile('package.json', 'utf8'));
await mkdir('public', { recursive: true });
for (const path of files) {
  await cp(path, join('public', path), { recursive: true });
}
