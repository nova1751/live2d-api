import { siteFiles } from './site-files.mts';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { posix } from 'node:path';

// Produce ordinary immutable Git refs with a conservative 38 MB budget per asset pack.
// Each skin family stays together so the original shared model paths still work.
const limit = 38_000_000;
const publish = process.argv.includes('--publish');
const revision = process.argv.slice(2).filter(arg => arg !== '--publish');
assert.ok(revision.length <= 1 && !revision[0]?.startsWith('-'), 'Expected [revision] [--publish]');
const git = (args, input, env) => execFileSync('git', args, { input, encoding: 'utf8', env, maxBuffer: 8_000_000 });
const source = git(['rev-parse', '--verify', (revision[0] || 'HEAD') + '^{commit}']).trim();
const tag = 'cdn-' + source.slice(0, 12);
const repoName = 'live2d-api';
const date = git(['show', '-s', '--format=%cI', source]).trim();
const env = { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date,
  GIT_AUTHOR_NAME: 'Live2D CDN', GIT_COMMITTER_NAME: 'Live2D CDN',
  GIT_AUTHOR_EMAIL: 'noreply@github.com', GIT_COMMITTER_EMAIL: 'noreply@github.com' };
const files = git(['ls-tree', '-rzl', source]).split('\0').filter(Boolean).map(line => {
  const [header, path] = line.split('\t');
  const [mode, type, oid, size] = header.split(/\s+/);
  assert.equal(type, 'blob', path);
  return { mode, oid, size: Number(size), path };
});
const blobs = new Map(files.map(file => [file.path, file]));
const readJson = path => JSON.parse(git(['cat-file', 'blob', blobs.get(path).oid]));
const families = new Map();
for (const file of files.filter(file => file.path.startsWith('model/'))) {
  const family = file.path.split('/')[1];
  if (!families.has(family)) families.set(family, { name: family, files: [], size: 0 });
  const group = families.get(family);
  group.files.push(file);
  group.size += file.size;
}
const shards = [];
const byFamily = new Map();
for (const group of [...families.values()].sort((a, b) => b.size - a.size)) {
  assert.ok(group.size <= limit, group.name + ' exceeds the snapshot size limit');
  let shard = shards.find(s => s.size + group.size <= limit);
  if (!shard) {
    shard = { tag: tag + '-assets-' + (shards.length + 1), size: 0, files: [] };
    shards.push(shard);
  }
  shard.size += group.size;
  shard.files.push(...group.files);
  byFamily.set(group.name, shard);
}

const packageFiles = siteFiles(readJson('package.json').files).filter(path => path !== 'model/');
const core = files.filter(file => packageFiles.some(path => path.endsWith('/') ? file.path.startsWith(path) : file.path === path)
  || ['readme.md', 'README.md', 'docs/model-sources.json', 'LICENSE'].includes(file.path));
for (const skin of readJson('model_list.json').models.flat()) {
  const path = 'model/' + skin + '/index.json';
  const dir = posix.dirname(path);
  const setting = readJson(path);
  function asset(ref) {
    const target = posix.join(dir, ref);
    assert.ok(blobs.has(target) && target.startsWith('model/'), path + ' references ' + ref);
    const shard = byFamily.get(target.split('/')[1]);
    const from = posix.join(repoName + '@' + tag, dir);
    return posix.relative(from, posix.join(repoName + '@' + shard.tag, target));
  }
  for (const key of ['model', 'physics', 'pose']) if (setting[key]) setting[key] = asset(setting[key]);
  setting.textures = setting.textures.map(asset);
  for (const expression of setting.expressions || []) expression.file = asset(expression.file);
  for (const entry of Object.values(setting.motions || {}).flat()) {
    if (entry.file) entry.file = asset(entry.file);
    if (entry.sound) entry.sound = asset(entry.sound);
    // change_cos points at the sibling skin index on the core ref.
  }
  const content = JSON.stringify(setting) + '\n';
  core.push({ path, mode: '100644', oid: git(['hash-object', '-w', '--stdin'], content).trim(), size: Buffer.byteLength(content) });
}

function writeTree(files) {
  const root = new Map();
  for (const file of files) {
    const parts = file.path.split('/');
    const name = parts.pop();
    let dir = root;
    for (const part of parts) {
      if (!dir.has(part)) dir.set(part, new Map());
      dir = dir.get(part);
    }
    dir.set(name, file);
  }
  function tree(dir) {
    const records = [];
    for (const [name, item] of dir) {
      const header = item instanceof Map ? '040000 tree ' + tree(item) : item.mode + ' blob ' + item.oid;
      records.push(header + '\t' + name + '\0');
    }
    return git(['mktree', '-z'], records.join('')).trim();
  }
  return tree(root);
}

const refs = [];
for (const bundle of [...shards, { tag, files: core }]) {
  const size = bundle.files.reduce((total, file) => total + file.size, 0);
  assert.ok(size < 40_000_000, bundle.tag + ' too large');
  const tree = writeTree(bundle.files);
  const commit = git(['commit-tree', tree, '-m', bundle.tag + ' from ' + source], undefined, env).trim();
  refs.push(commit + ':refs/tags/' + bundle.tag);
  console.log(bundle.tag + '  ' + size + ' bytes');
}
if (publish) git(['push', '--atomic', 'origin', ...refs]);
console.log((publish ? 'Published ' : 'Prepared ') + 'https://cdn.jsdmirror.com/gh/nova1751/live2d-api@' + tag + '/autoload.js');
