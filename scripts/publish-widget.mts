import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const temporary = mkdtempSync(join(tmpdir(), 'live2d-release-'));
try {
  const env = {
    ...process.env,
    GIT_INDEX_FILE: join(temporary, 'index'),
    GIT_AUTHOR_NAME: 'Live2D CDN',
    GIT_COMMITTER_NAME: 'Live2D CDN',
    GIT_AUTHOR_EMAIL: 'noreply@github.com',
    GIT_COMMITTER_EMAIL: 'noreply@github.com',
    GIT_AUTHOR_DATE: '2000-01-01T00:00:00Z',
    GIT_COMMITTER_DATE: '2000-01-01T00:00:00Z',
  };
  const git = (args: string[], input?: Buffer) => execFileSync('git', args, { env, input });
  const { files, version } = JSON.parse(git(['show', 'HEAD:package.json']).toString());
  const tag = 'widget-' + version;
  const entries = git(['ls-tree', '-rz', 'HEAD', '--', ...files, 'readme.md']);
  git(['read-tree', '--empty']);
  git(['update-index', '-z', '--index-info'], entries);
  const tree = git(['write-tree']).toString().trim();
  const commit = git(['commit-tree', tree, '-m', tag]).toString().trim();
  if (process.argv.includes('--publish')) git(['push', 'origin', commit + ':refs/tags/' + tag]);
  console.log(tag, commit);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
