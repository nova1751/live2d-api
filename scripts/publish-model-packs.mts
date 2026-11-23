import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const checkout = resolve(process.argv[2]).replaceAll('\\', '/');
const catalog = JSON.parse(readFileSync('catalog/library.json', 'utf8'));
const { commit, packs } = catalog.sources.dump;
const temp = mkdtempSync(join(tmpdir(), 'live2d-model-pack-'));
const env = { ...process.env, GIT_INDEX_FILE: join(temp, 'index'), GIT_AUTHOR_NAME: 'Live2D CDN',
  GIT_COMMITTER_NAME: 'Live2D CDN', GIT_AUTHOR_EMAIL: 'noreply@github.com', GIT_COMMITTER_EMAIL: 'noreply@github.com',
  GIT_AUTHOR_DATE: '2000-01-01T00:00:00Z', GIT_COMMITTER_DATE: '2000-01-01T00:00:00Z' };
const git = (args: string[], input?: string) => execFileSync('git', ['-c', 'safe.directory=' + checkout, '-C', checkout, ...args], {env, input, encoding:'utf8'}).trimEnd();
try {
  for (const pack of packs) {
    const tag = /^https:\/\/cdn\.jsdelivr\.net\/gh\/nova1751\/live2d-api@(cdn-[\w-]+)\/$/.exec(pack.baseUrl)?.[1];
    assert.ok(tag, 'Unexpected pack destination');
    git(['read-tree','--empty']);
    for (const dir of pack.directories) git(['read-tree','--prefix=' + dir + '/',commit + ':' + dir]);
    const tree = git(['write-tree']);
    const files = git(['ls-tree','-rl',tree]).split('\n');
    const size = files.reduce((total, line) => total + Number(line.split('\t')[0].trim().split(/\s+/).pop()), 0);
    assert.ok(size > 0 && size < 38_000_000, 'Asset pack exceeds CDN budget');
    const sha = git(['commit-tree',tree,'-m',tag]);
    console.log(tag, sha, files.length, 'files,', size, 'bytes');
    if (process.argv.includes('--publish')) git(['push','https://github.com/nova1751/live2d-api.git',sha + ':refs/tags/' + tag]);
  }
} finally {
  rmSync(temp, {recursive:true, force:true});
}
