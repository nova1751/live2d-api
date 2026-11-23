import { execFileSync, spawnSync } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, mkdtempSync, openSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, posix, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { collections, type ModelCatalog } from '../src/library/catalog.ts';
import { readJson, repository, type Library } from './library-files.mts';
import { archiveClassicVariants } from './archive-classic-variants.mts';

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    bundle: { type: 'string' },
    'voice-cache': { type: 'string' },
  },
});
if (positionals.length !== 1)
  throw Error('Pass a model source cache directory and optionally --bundle <new file>');
const cache = resolve(positionals[0]);
mkdirSync(cache, { recursive: true });
const scratch = mkdtempSync(join(cache, '.archive-'));
const root = resolve(repository);
const target = join(root, '.git');
const indexEnv = { ...process.env, GIT_INDEX_FILE: join(scratch, 'index') };
function args(dir: string, ...command: string[]) {
  return [
    '-c',
    'safe.directory=' + resolve(dir, '..').replaceAll('\\', '/'),
    '--git-dir=' + dir,
    ...command,
  ];
}
function git(dir: string, command: string[], input?: string, env = process.env) {
  return execFileSync('git', args(dir, ...command), {
    input,
    encoding: 'utf8',
    env,
    maxBuffer: 256 * 1024 ** 2,
  });
}
function pinned(url: string) {
  const match =
    /^https:\/\/(?:raw\.githubusercontent\.com\/([^/]+\/[^/]+)\/([0-9a-f]{40})|cdn\.jsdelivr\.net\/gh\/([^/]+\/[^/@]+)@([^/]+))\/(.*)$/u.exec(
      url,
    );
  if (!match) throw Error('Cannot archive unpinned URL ' + url);
  const repo = match[1] ?? match[3],
    revision = match[2] ?? match[4];
  const path = decodeURIComponent(match[5]);
  if (
    [...repo.split('/'), revision, ...path.split('/')].some(
      (p) => p === '..' || p === '.' || /[\\\x00-\x1f]/.test(p),
    )
  )
    throw Error('Invalid asset URL ' + url);
  return { repo, revision, path, prefix: 'gh/' + repo + '@' + revision };
}
type Plan = ReturnType<typeof pinned> & { directories: Set<string>; files: Set<string> };
const plans = new Map<string, Plan>();
function plan(url: string) {
  const spec = pinned(url);
  if (!plans.has(spec.prefix))
    plans.set(spec.prefix, { ...spec, files: new Set(), directories: new Set() });
  return plans.get(spec.prefix)!;
}
const entries = new Map<string, string>();
function blob(path: string, data: string) {
  entries.set(path, git(target, ['hash-object', '-w', '--stdin'], data).trim());
}
function list(dir: string, revision: string, paths: string[] = []) {
  return git(dir, ['ls-tree', '-rz', revision, '--', ...paths])
    .split('\0')
    .filter(Boolean)
    .map((row) => {
      const [meta, path] = row.split('\t');
      const [mode, type, oid] = meta.split(' ');
      return { path, oid, mode, type };
    });
}
const gfl = readJson<Library>(join(root, 'catalog/library.json'));
function origin(p: Plan) {
  if (p.repo === 'nova1751/live2d-api') return target;
  const source = Object.entries(gfl.sources).find(([, s]) => s.repository === p.repo)?.[0];
  const checkout = source && join(cache, 'sources', source, '.git');
  if (checkout && existsSync(checkout)) return checkout;
  if (p.repo === 'Fernando2603/AzurLane' && values['voice-cache']) return resolve(values['voice-cache']);
  const dir = join(cache, 'archives/git', p.repo.replace('/', '--') + '.git');
  if (!existsSync(dir)) execFileSync('git', ['init', '--bare', '-q', dir]);
  if (spawnSync('git', args(dir, 'cat-file', '-e', p.revision + '^{commit}')).status !== 0) {
    git(dir, ['config', 'remote.origin.url', 'https://github.com/' + p.repo + '.git']);
    git(dir, ['config', 'remote.origin.promisor', 'true']);
    git(dir, ['config', 'remote.origin.partialclonefilter', 'blob:none']);
    git(dir, [
      'fetch',
      '--no-tags',
      '--filter=blob:none',
      '--depth=1',
      'origin',
      p.revision + ':refs/archive/' + p.revision,
    ]);
  }
  return dir;
}
function missing(dir: string, oids: string[]) {
  if (!oids.length) return [];
  return git(
    dir,
    ['--no-lazy-fetch', 'cat-file', '--batch-check=%(objectname) %(objecttype)'],
    oids.join('\n') + '\n',
  )
    .trimEnd()
    .split('\n')
    .filter((row) => row.endsWith(' missing'))
    .map((row) => row.split(' ')[0]);
}
async function transfer(dir: string, paths: Map<string, string>, p: Plan) {
  const needed = missing(target, [...paths.keys()]);
  if (!needed.length) return;
  const absent = missing(dir, needed);
  if (absent.length) {
    // Fetch only selected assets from a partial clone. Verify the pinned tree's blob ID before storing each file.
    let index = 0;
    await Promise.all(
      Array.from({ length: Math.min(12, absent.length) }, async () => {
        while (index < absent.length) {
          const oid = absent[index++],
            path = paths.get(oid)!;
          const url =
            'https://raw.githubusercontent.com/' +
            p.repo +
            '/' +
            p.revision +
            '/' +
            path.split('/').map(encodeURIComponent).join('/');
          for (let attempt = 1; ; attempt++) {
            try {
              const response = await fetch(url, { signal: AbortSignal.timeout(45000) });
              if (!response.ok) throw Error(response.status + ' ' + url);
              const bytes = Buffer.from(await response.arrayBuffer());
              const actual = createHash('sha1')
                .update('blob ' + bytes.length + '\0')
                .update(bytes)
                .digest('hex');
              if (actual !== oid) throw Error('Unexpected content for ' + url);
              execFileSync('git', args(dir, 'hash-object', '-w', '--stdin'), { input: bytes });
              break;
            } catch (error) {
              if (attempt === 3) throw error;
            }
          }
        }
      }),
    );
  }
  const pack = join(scratch, 'transfer.pack');
  const output = openSync(pack, 'w');
  try {
    execFileSync('git', args(dir, 'pack-objects', '--stdout', '--window=0', '--threads=2'), {
      input: needed.join('\n') + '\n',
      stdio: ['pipe', output, 'inherit'],
    });
  } finally {
    closeSync(output);
  }
  const input = openSync(pack, 'r');
  try {
    execFileSync('git', args(target, 'index-pack', '--stdin'), { stdio: [input, 'pipe', 'inherit'] });
  } finally {
    closeSync(input);
    rmSync(pack);
  }
}
try {
  const head = git(target, ['rev-parse', 'HEAD']).trim();
  const runtime = readJson<{ files: string[] }>(join(root, 'package.json')).files;
  for (const e of list(target, head, [
    ...runtime.map((x) => x.replace(/\/$/, '')),
    'catalog',
    'model',
    'img',
    'index.html',
    'model_list.json',
  ])) {
    if (e.type === 'blob') entries.set(e.path, e.oid);
  }
  let modelCount = 0;
  let archivedLibrary: Library | undefined;
  for (const collection of collections) {
    const file =
      collection === 'girls-frontline' ? 'catalog/library.json' : 'catalog/games/' + collection + '.json';
    const catalog = JSON.parse(git(target, ['show', head + ':' + file])) as ModelCatalog;
    for (const s of Object.values(catalog.sources)) {
      delete s.packs;
      // BanG Dream outfits share motion and expression directories with their siblings.
      if (collection === 'bang-dream')
        plan(s.baseUrl).directories.add(pinned(s.baseUrl).path.replace(/\/$/, ''));
    }
    for (const variants of Object.values(catalog.models)) {
      modelCount++;
      for (const v of variants) {
        const base = catalog.sources[v.source].baseUrl,
          src = plan(base);
        for (const f of [v.manifest, (v as { binary?: string }).binary, v.dialogue].filter(
          (x): x is string => !!x,
        )) {
          const path = posix.join(pinned(base).path, f);
          src.files.add(path);
          if (f === v.manifest || f === (v as { binary?: string }).binary)
            src.directories.add(posix.dirname(path));
        }
      }
    }
    for (const [name, audio] of Object.entries(catalog.audio ?? {})) {
      const url = catalog.sources[name].baseUrl;
      for (const path of audio) plan(url).files.add(posix.join(pinned(url).path, path));
    }
    const rewritten = JSON.stringify(catalog, (_key, value: unknown) => {
      if (typeof value !== 'string' || !value.startsWith('https://')) return value;
      const p = pinned(value);
      if (p.path && !value.endsWith('/')) plan(value).files.add(p.path);
      return '/' + p.prefix + '/' + p.path.split('/').map(encodeURIComponent).join('/');
    });
    if (collection === 'girls-frontline') archivedLibrary = JSON.parse(rewritten);
    else blob(file, rewritten);
  }
  // Legacy manifests refer to sibling pack tags via relative paths.
  for (const tag of git(target, ['tag', '-l', 'cdn-b3ac5ae545e2-assets-*']).trim().split('\n')) {
    plan('https://cdn.jsdelivr.net/gh/nova1751/live2d-api@' + tag + '/').directories.add('model');
  }
  const sources = [];
  for (const p of plans.values()) {
    const dir = origin(p);
    const all = list(dir, p.revision);
    const found = new Set<string>(),
      oids = new Map<string, string>();
    for (const { path, type, oid, mode } of all) {
      if (type !== 'blob') continue;
      let selected = p.files.has(path);
      for (let parent = posix.dirname(path); !selected && parent !== '.'; parent = posix.dirname(parent))
        selected = p.directories.has(parent);
      if (!selected) continue;
      if (mode === '120000') throw Error('Asset is a symbolic link: ' + path);
      entries.set(p.prefix + '/' + path, oid);
      found.add(path);
      oids.set(oid, path);
    }
    for (const path of p.files)
      if (!found.has(path)) throw Error('Missing catalog asset: ' + p.prefix + '/' + path);
    console.log(p.repo, p.revision, found.size, 'files');
    await transfer(dir, oids, p);
    sources.push({
      repository: p.repo,
      revision: p.revision,
      commit: git(dir, ['rev-parse', p.revision + '^{commit}']).trim(),
      files: found.size,
    });
  }
  const repairs = archiveClassicVariants(
    archivedLibrary!,
    entries,
    (oid) => git(target, ['cat-file', 'blob', oid]),
    blob,
  );
  blob('catalog/library.json', JSON.stringify(archivedLibrary));
  blob(
    'archive-sources.json',
    JSON.stringify({ catalogCommit: head, modelIds: modelCount, sources, repairs }, null, 2),
  );
  const rows = Array.from(entries, ([path, oid]) => '100644 ' + oid + '\t' + path + '\0');
  git(target, ['read-tree', '--empty'], undefined, indexEnv);
  git(
    target,
    ['-c', 'core.ignorecase=false', 'update-index', '-z', '--index-info'],
    rows.join(''),
    indexEnv,
  );
  const tree = git(target, ['write-tree'], undefined, indexEnv).trim();
  const ref = 'refs/live2d-archive/' + tree;
  const date = git(target, ['show', '-s', '--format=%cI', head]).trim();
  const env = {
    ...process.env,
    GIT_AUTHOR_DATE: date,
    GIT_COMMITTER_DATE: date,
    GIT_AUTHOR_NAME: 'Model Archive',
    GIT_COMMITTER_NAME: 'Model Archive',
    GIT_AUTHOR_EMAIL: 'archive@localhost',
    GIT_COMMITTER_EMAIL: 'archive@localhost',
  };
  const commit = git(
    target,
    ['commit-tree', tree, '-m', 'Playable model archive for ' + head],
    undefined,
    env,
  ).trim();
  const previous = spawnSync('git', args(target, 'rev-parse', '--verify', ref), { encoding: 'utf8' });
  if (previous.status === 0 && previous.stdout.trim() !== commit)
    throw Error('Archive ref already contains a different snapshot');
  git(target, ['update-ref', ref, commit, previous.status === 0 ? commit : '0'.repeat(40)]);
  console.log(ref, commit, entries.size, 'files');
  if (values.bundle) {
    const file = resolve(values.bundle);
    if (existsSync(file)) throw Error('Bundle destination already exists');
    git(target, ['bundle', 'create', file, ref]);
    git(target, ['bundle', 'verify', file]);
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
