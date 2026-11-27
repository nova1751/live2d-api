import { execFileSync } from 'node:child_process';
import { parseConfigFileTextToJson } from 'typescript';
import { collections, type ModelCatalog } from '../src/library/catalog.ts';
import { repository } from './library-files.mts';
import { resolve } from 'node:path';
import { writeFileSync } from 'node:fs';
import { bandDreamManifest } from '../src/library/band-dream-export.ts';

const ref = process.argv[2];
if (!ref || !/^refs\/live2d-archive\/[a-f0-9]{40}$/.test(ref))
  throw Error('Pass a local model archive ref');
const root = resolve(repository).replaceAll('\\', '/');
const git = (...args: string[]) =>
  execFileSync('git', ['-c', 'safe.directory=' + root, '-C', root, '--no-lazy-fetch', ...args], {
    maxBuffer: 128 * 1024 ** 2,
  });
const files = new Map<string, string>();
for (const row of git('ls-tree', '-rz', ref).toString().split('\0').filter(Boolean)) {
  const [header, path] = row.split('\t');
  files.set(path, header.split(' ')[2]);
}
const missing = git('rev-list', '--objects', '--no-object-names', '--missing=print', ref)
  .toString()
  .split('\n')
  .filter((x) => x.startsWith('?'));
if (missing.length) throw Error('Missing Git objects: ' + missing.slice(0, 10).join(', '));
const host = 'https://archive.invalid/';
const urlPath = (v: string, base: string) => {
  const url = new URL(v, base);
  if (url.origin !== new URL(host).origin) throw Error('External playback dependency: ' + url);
  return decodeURIComponent(url.pathname.slice(1));
};
interface Manifest {
  model?: string;
  textures?: string[];
  physics?: string;
  pose?: string;
  motions?: Record<string, { file?: string; sound?: string }[]>;
  expressions?: { file: string }[];
  FileReferences?: {
    Moc: string;
    Textures: string[];
    Physics?: string;
    Pose?: string;
    UserData?: string;
    DisplayInfo?: string;
    Expressions?: { File: string }[];
    Motions?: Record<string, { File: string; Sound?: string }[]>;
  };
}
function references(m: Manifest) {
  const f = m.FileReferences;
  if (f?.Moc && f.Textures?.length)
    return [
      f.Moc,
      ...f.Textures,
      f.Physics,
      f.Pose,
      f.DisplayInfo,
      f.UserData,
      ...(f.Expressions ?? []).map((x) => x.File),
      ...Object.values(f.Motions ?? {})
        .flat()
        .flatMap((x) => [x.File, x.Sound]),
    ];
  if (!m.model || !m.textures?.length) throw Error('Manifest lacks a model or textures');
  return [
    m.model,
    ...m.textures,
    m.pose,
    m.physics,
    ...(m.expressions ?? []).map((x) => x.file),
    ...Object.values(m.motions ?? {})
      .flat()
      .flatMap((x) => [x.file, x.sound]),
  ];
}
const errors = new Set<string>();
const manifests = new Map<string, Manifest>();
for (const collection of collections) {
  const path =
    'catalog/' + (collection === 'girls-frontline' ? 'library.json' : 'games/' + collection + '.json');
  const catalog: ModelCatalog = JSON.parse(git('show', ref + ':' + path).toString());
  let checked = 0,
    withheld = 0,
    manifestsChecked = 0;
  let voicedCues = 0, textOnlyCues = 0, voiceOnlyCues = 0;
  const check = (path: string) => {
    checked++;
    if (!files.has(path)) errors.add(collection + ' ' + path);
  };
  const variants = Object.values(catalog.models)
    .flat()
    .filter((x) => x.manifest);
  const manifestPath = (v: (typeof variants)[number]) =>
    urlPath(
      v.manifest!.split('/').map(encodeURIComponent).join('/'),
      new URL(catalog.sources[v.source].baseUrl, host + path).href,
    );
  const oids = [
    ...new Set(
      variants.map((v) => files.get(manifestPath(v))).filter((x): x is string => !!x && !manifests.has(x)),
    ),
  ];
  for (let i = 0; i < oids.length; i += 128) {
    const batch = oids.slice(i, i + 128);
    const output = execFileSync(
      'git',
      ['-c', 'safe.directory=' + root, '-C', root, '--no-lazy-fetch', 'cat-file', '--batch'],
      { input: batch.join('\n') + '\n', maxBuffer: 128 * 1024 ** 2 },
    );
    let pos = 0;
    for (const oid of batch) {
      const end = output.indexOf(10, pos),
        size = Number(output.toString('ascii', pos, end).split(' ')[2]);
      const json = output.toString('utf8', end + 1, end + 1 + size).replace(/^\uFEFF/, '');
      let model: Manifest;
      try {
        model = JSON.parse(json);
      } catch {
        const parsed = parseConfigFileTextToJson(oid, json);
        if (parsed.error) errors.add('Invalid manifest ' + oid);
        model = parsed.config;
      }
      manifests.set(oid, model);
      pos = end + size + 2;
    }
  }
  for (const v of variants) {
    const mp = manifestPath(v);
    const raw = manifests.get(files.get(mp) ?? '');
    const model: Manifest | undefined = raw && !raw.model && mp.endsWith('/buildData.asset') ? bandDreamManifest(raw) : raw;
    check(mp);
    if (!model) continue;
    const url = new URL(mp.split('/').map(part => encodeURIComponent(part).replace(/%40/g, '@')).join('/'), host).href;
    if (v.cues && !v.dialogue) {
      // Modern cues use the native motion group; classic cues use motion or sound paths.
      const keys = new Set(Object.keys(model.FileReferences?.Motions ?? {}));
      const directory = new URL('.', url).pathname;
      for (const clip of Object.values(model.motions ?? {}).flat()) {
        if (clip.sound) keys.add(clip.sound);
        if (!clip.file) continue;
        keys.add(clip.file);
        const path = new URL(clip.file, url).pathname.replace(
          /(\/gh\/nova1751\/live2d-api@cdn-[a-f0-9]+)-assets-\d+\//, '$1/',
        );
        if (path.startsWith(directory)) keys.add(decodeURIComponent(path.slice(directory.length)));
      }
      for (const [key, cue] of Object.entries(v.cues)) {
        if (!keys.has(key)) errors.add(collection + ' unbound cue ' + mp + ' ' + key);
        if (cue.sound && cue.caption) voicedCues++;
        else if (cue.caption) textOnlyCues++;
        else if (cue.sound) voiceOnlyCues++;
      }
    }
    for (const item of references(model)) {
      if (!item) continue;
      const fix =
        v.files && Object.hasOwn(v.files, item) ? v.files[item] : (v.soundAliases?.[item] ?? item);
      if (fix === null) {
        withheld++;
        continue;
      }
      check(urlPath(fix, url));
    }
    const source = new URL(catalog.sources[v.source].baseUrl, host + path);
    if (v.dialogue) check(urlPath(v.dialogue, source.href));
    for (const c of Object.values(v.cues ?? {}))
      if (c.sound) {
        const base = v.cueSource ? new URL(catalog.sources[v.cueSource].baseUrl, host + path).href : url;
        check(urlPath(c.sound, base));
      }
    manifestsChecked++;
  }
  for (const entry of Object.values(catalog.gallery ?? {}))
    if (entry.portrait) check(urlPath(entry.portrait, host + 'catalog/'));
  for (const [name, paths] of Object.entries(catalog.audio ?? {}))
    for (const file of paths)
      check(urlPath(file, new URL(catalog.sources[name].baseUrl, host + path).href));
  console.log(
    collection,
    manifestsChecked,
    'manifests,',
    checked,
    'references,',
    withheld,
    'explicitly disabled references;',
    { voicedCues, textOnlyCues, voiceOnlyCues },
  );
}
if (process.argv[3]) writeFileSync(process.argv[3], JSON.stringify([...errors], null, 2) + '\n');
if (errors.size) {
  console.error([...errors].slice(0, 10).join('\n'));
  throw Error(errors.size + ' archive issues');
}
