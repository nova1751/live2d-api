import { chromium } from 'playwright-core';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Entry } from './types.ts';

const site = join(dirname(fileURLToPath(import.meta.url)), '.local/site');
const entries: Entry[] = JSON.parse(await readFile(join(site, 'catalog.json'), 'utf8'));
const directory = join(site, 'portraits');
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage({ viewport: { width: 550, height: 550 } });
  for (const entry of entries) {
    await page.goto('http://127.0.0.1:8798/stage.html?model=' + entry.id);
    const image = await page.waitForFunction(() => (window as Window & { previewPortrait?: string }).previewPortrait);
    const uri = await image.jsonValue() as string;
    await writeFile(join(directory, entry.id + '.png'), Buffer.from(uri.split(',')[1], 'base64'));
  }
} finally {
  await browser.close();
}
