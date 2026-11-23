import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseConfigFileTextToJson } from 'typescript';

// Probe the pinned manifests and every distinct dependency in the curated Cubism 2 galleries.
const mainland = process.argv.includes('--mainland');
for (const game of ['iron-saga', 'warship-girls', 'baoshi-yanwuyu']) {
  const catalog = JSON.parse(await readFile(new URL('../catalog/games/' + game + '.json', import.meta.url), 'utf8'));
  const dependencies = new Set<string>();
  let paired = 0;
  for (const [id, variants] of Object.entries(catalog.models)) {
    const [asset] = variants as Array<{ source: string; manifest: string }>;
    const url = new URL(asset.manifest, catalog.sources[asset.source].baseUrl);
    if (mainland && url.hostname === 'cdn.jsdelivr.net') url.hostname = 'cdn.jsdmirror.com';
    const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
    assert.ok(response.ok, id + ' manifest ' + response.status + ' ' + url);
    const parsed = parseConfigFileTextToJson(asset.manifest, await response.text());
    assert.ok(!parsed.error, id + ' invalid manifest');
    const model = parsed.config;
    assert.ok(model.model && model.textures?.length, id + ' missing geometry or texture');
    const clips = Object.values(model.motions ?? {}).flat() as Array<{ file?: string; sound?: string }>;
    if (clips.some(clip => clip.file && clip.sound)) paired++;
    for (const path of [model.model, ...model.textures, model.pose, model.physics,
      ...(model.expressions ?? []).map((e: { file: string }) => e.file),
      ...clips.flatMap(clip => [clip.file, clip.sound])].filter(Boolean)) {
      dependencies.add(new URL(path, url).href);
    }
  }
  const pending = [...dependencies];
  while (pending.length) {
    await Promise.all(pending.splice(0, 6).map(async url => {
      const response = await fetch(url, { headers: { Range: 'bytes=0-31' }, signal: AbortSignal.timeout(30000) });
      try {
        assert.ok(response.ok && !response.headers.get('content-type')?.includes('text/html'), response.status + ' ' + url);
        const reader = response.body!.getReader();
        const first = await reader.read();
        assert.ok(first.value?.length, 'Empty asset ' + url);
        await reader.cancel();
      } finally { if (!response.body?.locked) await response.body?.cancel(); }
    }));
  }
  console.log(game, Object.keys(catalog.models).length, 'forms,', dependencies.size, 'reachable assets,', paired, 'forms with motion-linked audio');
}
