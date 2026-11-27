import { execFileSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { isDeepStrictEqual, parseArgs } from 'node:util';
import { readJson, repository, type Library, type Source } from './library-files.mts';

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    source: { type: 'string', multiple: true },
    core: { type: 'string' },
    list: { type: 'boolean' },
  },
});
const library = readJson<Library>(join(repository, 'catalog/library.json'));
const selected = new Set(values.source ?? Object.keys(library.sources));
for (const name of selected)
  if (!Object.hasOwn(library.sources, name)) throw new Error('Unknown source: ' + name);
if (values.list) {
  for (const name of selected)
    console.log(name, library.sources[name].repository, library.sources[name].commit);
  process.exit(0);
}
if (positionals.length !== 1) throw new Error('Pass a destination directory, or --list');
const output = resolve(positionals[0]);
const sources = join(output, 'sources');
mkdirSync(sources, { recursive: true });
const git = (directory: string, ...args: string[]) =>
  execFileSync('git', ['-C', directory, ...args], { encoding: 'utf8' }).trim();
function materialize(name: string, spec: Source) {
  const destination = join(sources, name);
  if (existsSync(destination)) {
    if (
      !existsSync(join(destination, '.git')) ||
      git(destination, 'rev-parse', 'HEAD') !== spec.commit ||
      git(destination, 'status', '--porcelain')
    ) {
      throw new Error('Existing checkout differs: ' + destination);
    }
    return;
  }
  const temporary = mkdtempSync(join(sources, '.checkout-'));
  try {
    git(temporary, 'init', '-q');
    git(temporary, 'remote', 'add', 'origin', 'https://github.com/' + spec.repository + '.git');
    if (spec.scope.length) git(temporary, 'sparse-checkout', 'set', '--cone', '--', ...spec.scope);
    git(temporary, 'fetch', '--filter=blob:none', '--depth=1', 'origin', spec.commit);
    git(temporary, 'checkout', '--detach', 'FETCH_HEAD');
    if (git(temporary, 'rev-parse', 'HEAD') !== spec.commit) throw new Error('Source revision mismatch');
    renameSync(temporary, destination);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}
for (const [name, spec] of Object.entries(library.sources)) {
  if (!selected.has(name)) {
    delete library.sources[name];
    delete library.audio[name];
    continue;
  }
  materialize(name, spec);
  spec.baseUrl = 'sources/' + name + '/';
  delete spec.packs;
}
for (const [id, variants] of Object.entries(library.models)) {
  library.models[id] = variants.filter((v) => selected.has(v.source));
  if (!library.models[id].length) delete library.models[id];
}
const index = join(output, 'library.json');
if (existsSync(index)) {
  const previous = readJson<Library>(index);
  // A change of display preference among the same downloaded variants needs no new files.
  for (const [id, variants] of Object.entries(previous.models)) {
    for (const variant of variants) {
      const current = library.models[id]?.find(v => v.source === variant.source && v.manifest === variant.manifest);
      if (current?.cueSource || variant.cueSource || (current?.dialogue && current.dialogue === variant.dialogue)) {
        delete variant.cueSource;
        delete variant.cues;
        if (current?.cueSource) variant.cueSource = current.cueSource;
        if (current?.cues) variant.cues = current.cues;
      }
      if (current?.collectionDefault) variant.collectionDefault = true;
      else delete variant.collectionDefault;
    }
  }
  if (!isDeepStrictEqual({ ...previous, presentation: library.presentation }, { ...library, presentation: library.presentation }))
    throw new Error('Different catalog already exists: ' + index);
}
const viewer = join(output, 'viewer');
const marker = join(viewer, '.model-library-viewer');
if (existsSync(viewer) && !existsSync(marker))
  throw new Error('Refusing to overwrite an unrelated viewer directory');
mkdirSync(join(viewer, 'catalog'), { recursive: true });
writeFileSync(marker, '');
const files = readJson<{ files: string[] }>(join(repository, 'package.json')).files;
for (const file of [...files, 'catalog/browser.mjs', 'catalog/gallery.css', 'catalog/portraits/']) {
  const target = join(viewer, file);
  mkdirSync(dirname(target), { recursive: true });
  cpSync(join(repository, file), target, { recursive: true });
}
const recordings = new Set(Object.values(library.models).flat()
  .filter(variant => !variant.cueSource)
  .flatMap(variant => Object.values(variant.cues ?? {}).map(cue => cue.sound))
  .filter((sound): sound is string => !!sound?.startsWith('./')));
for (const file of recordings) {
  for (const directory of [output, join(viewer, 'catalog')]) {
    const target = join(directory, file);
    mkdirSync(dirname(target), { recursive: true });
    cpSync(join(repository, 'catalog', file), target);
  }
}
// A partial download can expose a historical ID when its preferred alias is absent.
for (const [id, preferred] of Object.entries(library.presentation?.aliases ?? {})) {
  if (library.models[id] && !library.models[preferred]) {
    const portrait = (key: string) => join(viewer, 'catalog/portraits', key.replaceAll('/', '--') + '.webp');
    cpSync(portrait(preferred), portrait(id));
  }
}
let html = readFileSync(join(repository, 'catalog/index.html'), 'utf8');
if (values.core) {
  cpSync(resolve(values.core), join(viewer, 'live2dcubismcore.min.js'));
  html = html.replace(
    '<html lang="zh-CN">',
    '<html lang="zh-CN" data-core-url="../live2dcubismcore.min.js">',
  );
}
writeFileSync(join(viewer, 'catalog/index.html'), html);
const local = structuredClone(library);
for (const spec of Object.values(local.sources)) spec.baseUrl = '../../' + spec.baseUrl;
writeFileSync(join(viewer, 'catalog/library.json'), JSON.stringify(local));
const temporary = mkdtempSync(join(output, '.index-'));
try {
  writeFileSync(join(temporary, 'library.json'), JSON.stringify(library));
  renameSync(join(temporary, 'library.json'), index);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
console.log(index, join(viewer, 'catalog/index.html'));
