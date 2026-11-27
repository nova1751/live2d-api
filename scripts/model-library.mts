import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join, posix, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { preserveSceneCurtains, readJson, repository, type Source, type Library } from './library-files.mts';

type Variant = Library['models'][string][number];
type Ref = { path: string };
type Tree = { sha: string; truncated: boolean; tree: { path: string; type: string }[] };
const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { 'dump-tree': { type: 'string' } },
});
assert.equal(
  positionals.length,
  2,
  'Pass the Eikanya and jacksen168 checkouts, optionally --dump-tree <json>',
);
const root = join(repository, 'catalog/girls-frontline');
const catalogs = readJson<{ sources: Record<string, Source>; characters: Ref[] }>(join(root, 'index.json'));
const dump = '527aac9245c06444d5d0259be843740915b715fd';
function source(repository: string, commit: string, scope: string[]): Source {
  return {
    repository,
    commit,
    scope,
    baseUrl: 'https://raw.githubusercontent.com/' + repository + '/' + commit + '/',
  };
}
const sources: Record<string, Source> = {
  widget: source('nova1751/live2d-api', '89053b85a3e850952b3b35fc873a2065a3fda8b9', ['model']),
  dump: source('GFL-Live2D/dump', dump, ['models', 'audio']),
};
const trees: Record<string, Set<string>> = {};
for (const [i, name] of ['eikanya', 'jacksen168'].entries()) {
  const pinned = catalogs.sources[name];
  const spec = (sources[name] = source(
    pinned.repository.replace('https://github.com/', ''),
    pinned.commit,
    i === 0 ? ['少女前线 girls Frontline'] : [],
  ));
  const path = resolve(positionals[i]).replaceAll('\\', '/');
  const files = execFileSync(
    'git',
    [
      '-c',
      'safe.directory=' + path,
      '-C',
      path,
      'ls-tree',
      '-rz',
      '--name-only',
      spec.commit,
      '--',
      ...spec.scope,
    ],
    { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
  );
  trees[name] = new Set(files.split('\0'));
}
interface Form {
  category: string;
  character: string;
  version: string;
  id: string;
  widget: { index: string }[];
  sources: { repository: string; path: string; format: string; manifest?: string }[];
}
const models: Record<string, Variant[]> = {};
function importForm(form: Form) {
  const id = [form.category, form.character, form.version, form.id].join('/');
  const choices = (models[id] = form.widget.map((w) => ({
    source: 'widget',
    manifest: w.index,
  })) as Variant[]);
  for (const record of form.sources) {
    const binary = record.path,
      repo = record.repository,
      paths = trees[repo];
    const choice: Variant = { source: repo, binary };
    let manifest = record.manifest;
    if (!manifest && record.format === 'moc') {
      const stem = binary.slice(0, -posix.extname(binary).length);
      const candidates = [stem + '.model.json', stem + '.json'];
      if (binary.endsWith('/old/AN-94/normal/model.moc'))
        candidates.push(posix.join(posix.dirname(binary), 'model #8.json'));
      manifest = candidates.find((path) => paths.has(path));
    }
    if (id === 'doll/m1928a1/archive/destroy' && repo === 'eikanya') {
      choice.soundAliases = {};
      for (const name of ['BREAK', 'DIALOGUE1']) {
        const real = 'voice/M1928A1_' + name + '_JP.mp3';
        assert.ok(paths.has(posix.join(posix.dirname(binary), real)));
        choice.soundAliases['destory/' + real] = real;
      }
    }
    if (manifest) choice.manifest = manifest;
    choices.push(choice);
  }
}
for (const character of catalogs.characters) {
  for (const version of readJson<{ versions: Ref[] }>(join(root, character.path)).versions) {
    for (const form of readJson<{ forms: Ref[] }>(join(root, version.path)).forms)
      importForm(readJson<Form>(join(root, form.path)));
  }
}
async function fetchTree(): Promise<Tree> {
  const response = await fetch(
    'https://api.github.com/repos/GFL-Live2D/dump/git/trees/' + dump + '?recursive=1',
    { signal: AbortSignal.timeout(90000) },
  );
  if (!response.ok) throw new Error('GitHub tree: HTTP ' + response.status);
  return response.json();
}
const tree = values['dump-tree'] ? readJson<Tree>(values['dump-tree']) : await fetchTree();
assert.ok(!tree.truncated && tree.sha === dump, 'Expected complete pinned file tree');
const paths = new Set(
  tree.tree
    .filter((e) => e.type === 'blob')
    .map((e) => e.path)
    .sort(),
);
for (const manifest of paths) {
  if (!manifest.startsWith('models/') || !manifest.endsWith('.model3.json')) continue;
  // The nested AK-12 MOD export only contains a duplicate texture and idle motion.
  if (manifest === 'models/ak12mod/normal/model/model.model3.json' && !paths.has('models/ak12mod/normal/model/model.moc3')) continue;
  const [, folder, form] = manifest.split('/');
  const code = folder.toLowerCase().replaceAll(' ', '-');
  const skin = /^(.+)_(\d+)$/.exec(code);
  const [who, version] = skin
    ? skin.slice(1)
    : code.endsWith('mod')
      ? [code.slice(0, -3), 'mod']
      : [code, 'base'];
  const category = who === 'gelina' ? 'adjutant' : who === 'william' ? 'npc' : 'doll';
  const choice: Variant = { source: 'dump', manifest };
  const dialogue = manifest.replace(/\.model3\.json$/, '.data.json');
  if (paths.has(dialogue)) choice.dialogue = dialogue;
  (models[[category, who, version, form].join('/')] ??= []).push(choice);
}
const rank = ['widget', 'dump', 'jacksen168', 'eikanya'];
const byWidget = new Map<string, string>();
for (const [id, choices] of Object.entries(models)) {
  choices.sort(
    (a, b) =>
      Number(!a.manifest) - Number(!b.manifest) ||
      rank.indexOf(a.source) - rank.indexOf(b.source) ||
      (a.manifest ?? '').split('/').length - (b.manifest ?? '').split('/').length,
  );
  for (const v of choices) if (v.source === 'widget' && v.manifest) byWidget.set(v.manifest, id);
}
sources.widget.baseUrl = 'https://cdn.jsdelivr.net/gh/nova1751/live2d-api@cdn-b3ac5ae545e2/';
const legacyIds = readJson<{ models: (string | string[])[] }>(join(repository, 'model_list.json')).models.map(
  (row) =>
    [row].flat().map((skin) => {
      const manifest = 'model/' + skin + '/index.json';
      const id = byWidget.get(manifest) ?? 'other/' + skin.replaceAll('/', '-') + '/base/default';
      models[id] ??= [{ source: 'widget', manifest }];
      return id;
    }),
);
const ordered = Object.fromEntries(
  Object.keys(models)
    .sort()
    .map((key) => [key, models[key]]),
);
const audio = { dump: [...paths].filter((p) => p.startsWith('audio/') && p.endsWith('.ogg')) };
// The older OTs-14 conversions lack the native event-to-voice table. Keep them for numeric IDs.
const directories = new Set<string>();
for (const [id, variants] of Object.entries(ordered)) {
  if (!id.startsWith('doll/ots14/')) continue;
  const native = variants.find(v => v.source === 'dump' && v.dialogue);
  if (!native?.manifest) continue;
  native.collectionDefault = true;
  directories.add(posix.dirname(posix.dirname(native.manifest)));
}
sources.dump.packs = [
  { baseUrl: 'https://cdn.jsdelivr.net/gh/nova1751/live2d-api@cdn-ots14-' + dump.slice(0,12) + '/',
    directories: [...directories, 'audio/OTS14'] },
  { baseUrl: 'https://cdn.jsdelivr.net/gh/nova1751/live2d-api@cdn-dsr50-' + dump.slice(0,12) + '/',
    directories: ['models/dsr50_10501'] },
];
const catalogPath = join(repository, 'catalog/library.json');
preserveSceneCurtains(catalogPath, { sources, models: ordered });
// The five damaged-form touch motions were byte-identical to the normal form in the original Cubism 2 export.
const px4 = ordered['doll/px4storm/2801/destroy']?.find(v => v.source === 'dump');
if (dump === '527aac9245c06444d5d0259be843740915b715fd' &&
    px4?.manifest === 'models/px4storm_2801/destroy/px4storm_2801.model3.json') {
  const repair = 'games/repairs/gfl-px4storm-2801-destroy.model3.json';
  const model = readJson<{ FileReferences: { Motions: Record<string, { File: string }[]> } }>(join(repository, 'catalog', repair));
  const clips = Object.values(model.FileReferences.Motions).flat().filter(clip => /^motions\/touch_[1-5]\.motion3\.json$/.test(clip.File));
  px4.files = { ...px4.files, 'px4storm_2801.model3.json': './' + repair,
    ...Object.fromEntries(clips.map(clip => [clip.File, '../normal/' + clip.File])) };
}
writeFileSync(
  catalogPath,
  JSON.stringify({ schemaVersion: 1, legacyIds, sources, models: ordered, audio }) + '\n',
);
console.log(Object.keys(models).length, 'forms;', audio.dump.length, 'voice files');
