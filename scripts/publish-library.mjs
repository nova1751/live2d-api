import { execFileSync } from 'node:child_process';
import { libraryTag } from './library-tag.mjs';

const git = (args, input, env) => execFileSync('git', args, { input, encoding: 'utf8', env }).trim();
git(['diff', '--exit-code', 'HEAD', '--', 'catalog/library.json']);
const tag = await libraryTag();
const blob = git(['rev-parse', 'HEAD:catalog/library.json']);
const catalog = git(['mktree'], '100644 blob ' + blob + '\tlibrary.json\n');
const tree = git(['mktree'], '040000 tree ' + catalog + '\tcatalog\n');
const identity = { ...process.env, GIT_AUTHOR_NAME: 'Live2D CDN', GIT_COMMITTER_NAME: 'Live2D CDN',
  GIT_AUTHOR_EMAIL: 'noreply@github.com', GIT_COMMITTER_EMAIL: 'noreply@github.com',
  GIT_AUTHOR_DATE: '2000-01-01T00:00:00Z', GIT_COMMITTER_DATE: '2000-01-01T00:00:00Z' };
const sha = git(['commit-tree', tree, '-m', tag], undefined, identity);
if (process.argv.includes('--publish')) git(['push', 'origin', sha + ':refs/tags/' + tag]);
console.log(tag, sha);
