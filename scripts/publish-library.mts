import { execFileSync } from 'node:child_process';
import { gameAssetDirectories, gameFiles, libraryTag } from './library-tag.mts';

const git = (args, input, env) => execFileSync('git', args, { input, encoding: 'utf8', env }).trim();
const gameEntries = [...gameFiles, ...gameAssetDirectories];
const paths = ['catalog/library.json', ...gameEntries.map(file => 'catalog/games/' + file)];
git(['diff', '--exit-code', 'HEAD', '--', ...paths]);
if (git(['ls-files', '--others', '--exclude-standard', '--', ...paths]))
  throw new Error('Commit catalog assets before publishing their snapshot');
const tag = await libraryTag();
const blob = git(['rev-parse', 'HEAD:catalog/library.json']);
const entries = git(['ls-tree', 'HEAD:catalog/games', '--', ...gameEntries]);
if (entries.split('\n').length !== gameEntries.length) throw new Error('Incomplete game catalog snapshot');
const games = git(['mktree'], entries + '\n');
const catalog = git(['mktree'], '040000 tree ' + games + '\tgames\n100644 blob ' + blob + '\tlibrary.json\n');
const tree = git(['mktree'], '040000 tree ' + catalog + '\tcatalog\n');
const bytes = git(['ls-tree', '-rlz', tree]).split('\0').filter(Boolean)
  .reduce((total, row) => total + Number(row.split('\t', 1)[0].trim().split(/\s+/).at(-1)), 0);
if (bytes >= 40_000_000) throw new Error('Catalog snapshot exceeds the 40 MB budget (' + bytes + ' bytes)');
const identity = { ...process.env, GIT_AUTHOR_NAME: 'Live2D CDN', GIT_COMMITTER_NAME: 'Live2D CDN',
  GIT_AUTHOR_EMAIL: 'noreply@github.com', GIT_COMMITTER_EMAIL: 'noreply@github.com',
  GIT_AUTHOR_DATE: '2000-01-01T00:00:00Z', GIT_COMMITTER_DATE: '2000-01-01T00:00:00Z' };
const sha = git(['commit-tree', tree, '-m', tag], undefined, identity);
if (process.argv.includes('--publish')) git(['push', 'origin', sha + ':refs/tags/' + tag]);
console.log(tag, sha);
