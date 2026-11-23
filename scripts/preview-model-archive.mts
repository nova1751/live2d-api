import { createServer } from 'node:http';
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, createReadStream } from 'node:fs';
import { resolve, extname } from 'node:path';
import { parseArgs } from 'node:util';
import { repository } from './library-files.mts';

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { port: { type: 'string', default: '8816' }, core: { type: 'string' } },
});
const [ref] = positionals;
if (positionals.length !== 1 || !/^refs\/live2d-archive\/[0-9a-f]{40}$/.test(ref))
  throw Error('Pass the local archive ref');
if (values.core && !existsSync(values.core)) throw Error('Cannot read Core ' + values.core);
const root = resolve(repository).replaceAll('\\', '/');
const args = ['-c', 'safe.directory=' + root, '-C', root, '--no-lazy-fetch'];
const tree = execFileSync('git', [...args, 'ls-tree', '-rz', ref], {
  encoding: 'utf8',
  maxBuffer: 128 * 1024 ** 2,
});
const files = new Map<string, string>();
for (const row of tree.split('\0').filter(Boolean)) {
  const [entry, path] = row.split('\t');
  files.set(path, entry.split(' ')[2]);
}
const mime: Record<string, string> = {
  '.json': 'application/json',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.html': 'text/html; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
};
const server = createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405).end();
    return;
  }
  let path: string;
  try {
    path = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname.slice(1));
  } catch {
    res.writeHead(400).end();
    return;
  }
  if (!path) {
    res.writeHead(302, { Location: '/catalog/' }).end();
    return;
  }
  if (path.endsWith('/')) path += 'index.html';
  const core = path === 'archive-core.js' && values.core;
  const oid = files.get(path);
  if (!oid && !core) {
    res.writeHead(404).end();
    return;
  }
  res.setHeader('Content-Type', mime[extname(path)] ?? 'application/octet-stream');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  if (core) {
    createReadStream(core)
      .on('error', () => res.destroy())
      .pipe(res);
    return;
  }
  if (path === 'catalog/index.html' && values.core) {
    const html = execFileSync('git', [...args, 'cat-file', 'blob', oid!], { encoding: 'utf8' });
    res.end(html.replace('<html lang="zh-CN">', '<html lang="zh-CN" data-core-url="/archive-core.js">'));
    return;
  }
  const child = spawn('git', [...args, 'cat-file', 'blob', oid!], {
    stdio: ['ignore', 'pipe', 'ignore'],
    windowsHide: true,
  });
  child.stdout.pipe(res);
  child.once('error', () => res.destroy());
  res.once('close', () => {
    if (child.exitCode === null) child.kill();
  });
});
server.listen(Number(values.port), '127.0.0.1', () =>
  console.log('http://127.0.0.1:' + values.port + '/catalog/'),
);
