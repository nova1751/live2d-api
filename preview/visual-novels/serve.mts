import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import { basename, dirname, join, posix } from 'node:path';
import ts from 'typescript';
import { fileURLToPath } from 'node:url';
import { context } from 'esbuild';

const base = dirname(fileURLToPath(import.meta.url));
const local = join(base, '.local');
const assets = join(local, 'source', 'galgame live2d');
const site = join(local, 'site');
await mkdir(site, { recursive: true });
const files = (await readdir(assets, { recursive: true, withFileTypes: true }))
  .filter((entry) => entry.isFile())
  .map((entry) =>
    join(entry.parentPath, entry.name)
      .slice(assets.length + 1)
      .replaceAll('\\', '/'),
  )
  .sort();
const models = [];
const issues = [];
for (const path of files.filter(
  (path) =>
    path.endsWith('.json') &&
    !path.includes('.vn-preview.') &&
    !/\.(motion3|physics3|pose3|exp3|cdi3|userdata3)\.json$/i.test(path),
)) {
  let config;
  let fixed = false;
  try {
    const bytes = await readFile(join(assets, path));
    let raw: string;
    try {
      raw = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      raw = new TextDecoder('shift_jis', { fatal: true }).decode(bytes);
      fixed = true;
    }
    try {
      config = JSON.parse(raw);
    } catch {
      if (!/model(?:3)?\.json$/i.test(path)) continue;
      const parsed = ts.parseConfigFileTextToJson(path, raw.replace(/("fade_out"\s*:\s*\d+)\s+("lip_offset"\s*:)/g, '$1,$2'));
      if (parsed.error) throw Error('Invalid JSON');
      config = parsed.config;
      fixed = true;
    }
  } catch {
    if (/model(?:3)?\.json$/i.test(path))
      issues.push({ path, reason: '清单 JSON 无法解析' });
    continue;
  }
  const refs = config?.FileReferences;
  if (!(refs?.Moc || (config?.model && Array.isArray(config?.textures))))
    continue;
  // The sample manifest in this outfit misnames its binary and repeats texture 00.
  // Its sibling w108a.model.json provides the original binary and both texture slots.
  if (path.endsWith('/w108a/model.json') && config.model === 'v108a_01.moc') {
    const original = JSON.parse(await readFile(join(assets, posix.dirname(path), 'w108a.model.json'), 'utf8'));
    config.model = original.model;
    config.textures = original.textures;
    fixed = true;
  }
  const moc = refs?.Moc ?? config.model;
  const textures = refs?.Textures ?? config.textures ?? [];
  const directory = posix.dirname(path);
  function present(file: string) {
    if (typeof file !== 'string' || !file) return false;
    const entry = statSync(join(assets, directory, file), {
      throwIfNoEntry: false,
    });
    return !!entry?.isFile() && entry.size > 0;
  }
  // Some exporters append a numeric Unity asset ID to a texture slot.
  for (const [index, texture] of textures.entries()) {
    if (present(texture)) continue;
    const slot = /^textures\/textures?_(\d+)(?: #\d+)?(?:\.png)?$/.exec(texture);
    if (!slot) continue;
    const alternatives = files.filter(file => posix.dirname(file) === directory + '/textures' &&
      new RegExp('^texture_' + slot[1] + '(?: #\\d+)?\\.png$', 'i').test(posix.basename(file)));
    if (alternatives.length !== 1) continue;
    textures[index] = posix.relative(directory, alternatives[0]);
    fixed = true;
  }
  const coreFiles = [moc, ...textures];
  const missing = coreFiles.filter((file) => !present(file));
  if (missing.length || !textures.length) {
    issues.push({
      path,
      reason: '缺少模型或贴图：' + (missing.join('、') || '贴图列表为空'),
    });
    continue;
  }
  const [work, ...parts] = path.split('/');
  const variant = basename(path).replace(/(?:\.model3?|\.json)+$/i, '');
  let name =
    variant && variant !== 'model' ? variant : (parts.at(-2) ?? variant);
  let person = parts[0];
  if (work === 'Fox Hime Zero')
    person = name.startsWith('mori') ? '茉莉' : '琉璃';
  if (work === '三色绘恋S')
    person = name.startsWith('chiguo')
      ? '迟菓'
      : name.startsWith('yexin')
        ? '叶心'
        : '场景';
  if (work === 'LOVE³-LOVE CUBE-') person = parts.at(-2)!;
  if (work === 'メイドさんのいる暮らしS') person = '艾蕾娜';
  if (parts.length === 1) person = name;
  const groups = Object.values(
    refs?.Motions ?? config.motions ?? {},
  ).flat() as Record<string, string>[];
  const clips = groups.map((row) => row.File ?? row.file).filter(Boolean);
  const sounds = groups.map((row) => row.Sound ?? row.sound).filter(Boolean);
  let entry = path;
  if (fixed) {
    entry =
      path.slice(0, -5) + '.vn-preview.' + (refs ? 'model3.json' : 'json');
    await writeFile(join(assets, entry), JSON.stringify(config));
  }
  models.push({
    work,
    person,
    name,
    path,
    entry,
    modern: !!refs,
    motions: clips.filter(present).length,
    voices: sounds.filter(present).length,
    missing: [
      ...new Set([...clips, ...sounds].filter((file) => !present(file))),
    ],
  });
}
const amakano = JSON.parse(await readFile(join(local, 'amakano.json'), 'utf8'));
if (!existsSync(join(site, 'paint.json'))) await writeFile(join(site, 'paint.json'), '{}');
await writeFile(
  join(site, 'index.json'),
  JSON.stringify({
    models,
    issues,
    titles: amakano.titles,
    heroines: amakano.heroines,
  }),
);
if (process.argv.includes('--index-only')) {
  console.log(models.length, 'manifests;', issues.length, 'unavailable');
  process.exit(0);
}
if (!existsSync(join(site, 'models')))
  await symlink(assets, join(site, 'models'), 'junction');
for (const file of ['index.html', 'style.css', 'stage.html'])
  await copyFile(join(base, file), join(site, file));
await copyFile(join(base, '../../live2d.min.js'), join(site, 'legacy.js'));
await copyFile(join(local, 'live2dcubismcore.min.js'), join(site, 'core.js'));
await copyFile(join(local, 'shion.png'), join(site, 'shion.png'));
const bundler = await context({
  entryPoints: [join(base, 'gallery.ts'), join(base, 'stage.ts')],
  bundle: true,
  format: 'esm',
  target: 'es2022',
  charset: 'utf8',
  outdir: site,
  logLevel: 'warning',
});
await bundler.rebuild();
const { port } = await bundler.serve({
  host: '127.0.0.1',
  port: Number(process.env.VN_PREVIEW_PORT ?? 8796),
  servedir: site,
});
console.log(
  models.length,
  'model manifests;',
  issues.length,
  'unavailable;',
  'http://127.0.0.1:' + port,
);
