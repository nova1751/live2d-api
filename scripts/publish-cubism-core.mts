// Publish the Cubism Core fallback as its own immutable tag, outside the runtime package.
// The tag name is the start of the file's SHA-256, and the commit is reproducible: fixed author,
// date and tree. Without --publish this only prints the tag and commit.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const checkout = resolve('.').replaceAll('\\', '/');
const files = ['live2dcubismcore.min.js', 'README.md'];
const core = readFileSync('vendor/cubism-core/live2dcubismcore.min.js');
const tag = 'cubism-core-' + createHash('sha256').update(core).digest('hex').slice(0, 12);
const temp = mkdtempSync(join(tmpdir(), 'live2d-cubism-core-'));
const env = { ...process.env, GIT_INDEX_FILE: join(temp, 'index'), GIT_AUTHOR_NAME: 'Live2D CDN',
  GIT_COMMITTER_NAME: 'Live2D CDN', GIT_AUTHOR_EMAIL: 'noreply@github.com', GIT_COMMITTER_EMAIL: 'noreply@github.com',
  GIT_AUTHOR_DATE: '2000-01-01T00:00:00Z', GIT_COMMITTER_DATE: '2000-01-01T00:00:00Z' };
const git = (args: string[], input?: Buffer) => execFileSync('git', ['-c', 'safe.directory=' + checkout, '-C', checkout, ...args],
  { env, input, encoding: 'utf8' }).trimEnd();
try {
  git(['read-tree', '--empty']);
  for (const name of files) {
    // Store the bytes as they are on disk, without line-ending conversion.
    const blob = git(['hash-object', '-w', '--no-filters', '--stdin'], readFileSync('vendor/cubism-core/' + name));
    git(['update-index', '--add', '--cacheinfo', '100644,' + blob + ',' + name]);
  }
  const sha = git(['commit-tree', git(['write-tree']), '-m', tag]);
  console.log(tag, sha);
  console.log('Fallback URL: https://cdn.jsdelivr.net/gh/nova1751/live2d-api@' + tag + '/live2dcubismcore.min.js');
  if (process.argv.includes('--publish')) git(['push', 'https://github.com/nova1751/live2d-api.git', sha + ':refs/tags/' + tag]);
} finally {
  rmSync(temp, { recursive: true, force: true });
}
