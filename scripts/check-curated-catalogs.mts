import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseConfigFileTextToJson } from 'typescript';
import { parseModelCatalog, type Collection } from '../src/library/catalog.ts';

// Probe the pinned manifests and every distinct dependency in the curated Cubism 2 galleries.
const mainland = process.argv.includes('--mainland');
async function checkAsset(url: string) {
  for (let attempt = 1; ; attempt++) {
    const request = new AbortController();
    const timeout = setTimeout(() => request.abort(new DOMException('Asset request timed out', 'TimeoutError')), 45000);
    try {
      const response = await fetch(url, { signal: request.signal });
      assert.ok(response.ok && !response.headers.get('content-type')?.includes('text/html'), response.status + ' ' + url);
      assert.ok((await response.arrayBuffer()).byteLength, 'Empty asset ' + url);
      return;
    } catch (error) {
      if (attempt === 3 || !(error instanceof TypeError || error instanceof DOMException)) throw new Error('Checking ' + url, { cause: error });
    } finally { clearTimeout(timeout); }
  }
}
for (const game of ['iron-saga', 'warship-girls', 'baoshi-yanwuyu']) {
  const catalog = JSON.parse(await readFile(new URL('../catalog/games/' + game + '.json', import.meta.url), 'utf8'));
  const dependencies = new Set<string>();
  let paired = 0;
  const origin = mainland ? 'https://cdn.jsdmirror.com' : 'https://cdn.jsdelivr.net';
  const library = parseModelCatalog(catalog, new URL('/catalog/games/' + game + '.json', origin), game as Collection);
  for (const id of library.ids) {
    const { modelUrl, files } = library.resolve(id);
    const url = new URL(modelUrl);
    const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
    assert.ok(response.ok, id + ' manifest ' + response.status + ' ' + url);
    const parsed = parseConfigFileTextToJson(url.pathname, await response.text());
    assert.ok(!parsed.error, id + ' invalid manifest');
    const model = parsed.config;
    assert.ok(model.model && model.textures?.length, id + ' missing geometry or texture');
    const clips = Object.values(model.motions ?? {}).flat() as Array<{ file?: string; sound?: string }>;
    if (clips.some(clip => clip.file && clip.sound)) paired++;
    for (const path of [model.model, ...model.textures, model.pose, model.physics,
      ...(model.expressions ?? []).map((e: { file: string }) => e.file),
      ...clips.flatMap(clip => [clip.file, clip.sound])].filter(Boolean)) {
      if (files?.[path] !== null) dependencies.add(new URL(files?.[path] ?? path, url).href);
    }
  }
  const pending = [...dependencies];
  while (pending.length) {
    await Promise.all(pending.splice(0, 3).map(checkAsset));
  }
  console.log(game, Object.keys(catalog.models).length, 'forms,', dependencies.size, 'reachable assets,', paired, 'forms with motion-linked audio');
}
