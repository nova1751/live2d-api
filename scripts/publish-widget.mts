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
  const git = (args: string[], input?: Buffer | string) => execFileSync('git', args, { env, input });
  const { files, version } = JSON.parse(git(['show', 'HEAD:package.json']).toString());
  const tag = 'widget-' + version;
  const entries = git(['ls-tree', '-rz', 'HEAD', '--', ...files]);
  git(['read-tree', '--empty']);
  git(['update-index', '-z', '--index-info'], entries);
  const tree = git(['write-tree']).toString().trim();
  const commit = git(['commit-tree', tree, '-m', tag]).toString().trim();
  if (process.argv.includes('--publish')) {
    git(['push', 'origin', commit + ':refs/tags/' + tag]);
    if (/^\d+\.\d+\.\d+$/.test(version)) publishLatest(version);
  }
  console.log(tag, commit);

  function publishLatest(version: string) {
    const ref = 'refs/heads/widget-latest';
    const base = '../live2d-api@widget-' + version + '/';
    git(['read-tree', '--empty']);
    for (const [name, content] of Object.entries({
      VERSION: version + '\n',
      'girls-frontline.mjs': `const target = new URL('${base}girls-frontline.mjs', import.meta.url);\ntarget.search = new URL(import.meta.url).search;\nawait import(target.href);\n`,
      'widget.mjs': `export * from '${base}widget.mjs';\n`,
    })) {
      const blob = git(['hash-object', '-w', '--stdin'], content).toString().trim();
      git(['update-index', '--add', '--cacheinfo', '100644', blob, name]);
    }
    const tree = git(['write-tree']).toString().trim();
    const remoteHead = () => git(['ls-remote', '--heads', 'origin', ref]).toString().split(/\s/)[0];
    for (;;) {
      let parent = remoteHead();
      if (parent) {
        git(['fetch', '--no-tags', '--depth=1', 'origin', ref]);
        parent = git(['rev-parse', 'FETCH_HEAD']).toString().trim();
        const current = git(['show', parent + ':VERSION']).toString().trim();
        if (version.localeCompare(current, 'en', { numeric: true }) <= 0) return;
      }
      const next = git(['commit-tree', tree, ...(parent ? ['-p', parent] : []), '-m', 'Track ' + tag]).toString().trim();
      try {
        git(['push', 'origin', next + ':' + ref]);
        return;
      } catch (error) {
        if (remoteHead() === parent) throw error;
      }
    }
  }
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
