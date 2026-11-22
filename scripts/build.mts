import { libraryTag } from './library-tag.mts';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { build, context, transform } from 'esbuild';

const { version } = JSON.parse(await readFile('package.json', 'utf8'));
const dev = process.argv.includes('--dev');
const catalogDefine = { LIBRARY_TAG: JSON.stringify(await libraryTag()) };
const shared = {
  define: catalogDefine,
  target: 'es2020',
  charset: 'utf8',
  banner: { js: '/*! Live2D API | Generated from src/ | https://github.com/nova1751/live2d-api */' },
};
if (!dev) {
  await copyFile('node_modules/.cache/live2dapi-noa/types/widget.d.mts', 'widget.d.mts');
  await mkdir('library', { recursive: true });
  await copyFile('node_modules/.cache/live2dapi-noa/types/library/catalog.d.ts', 'library/catalog.d.ts');
}
const upstream = 'node_modules/live2d-web/';
await mkdir('modern', { recursive: true });
for (const name of ['LICENSE', 'LICENSES.md', 'THIRD_PARTY_NOTICES.md', 'vendor/cubism-web-framework-5-r.5/LICENSE.md']) {
  await copyFile(upstream + name, 'modern/' + name.split('/').pop());
}
const runtimeRequire = createRequire(import.meta.resolve('live2d-web'));
await copyFile(resolve(dirname(runtimeRequire.resolve('wlipsync')), '../LICENSE'), 'modern/wlipsync-LICENSE');
const { code: legacyEngine } = await transform(await readFile('src/vendor/cubism2.ts', 'utf8'), {
  loader: 'ts', target: 'es2020', minifyWhitespace: true, legalComments: 'inline',
});
const entries = [
  { entryPoints: ['src/vendor/asteroids.ts'], outfile: 'asteroids.js' },
  { entryPoints: ['src/standalone.ts'], outfile: 'live2d.min.js', format: 'iife', bundle: true,
    minify: true, banner: { js: legacyEngine.trimEnd() + ';' } },
  { entryPoints: ['src/modern.ts'], outfile: 'modern/renderer.mjs', target: 'es2022', format: 'esm', bundle: true, minify: true },
  { entryPoints: ['src/girls-frontline.mts'], outfile: 'girls-frontline.mjs', format: 'esm' },
  { entryPoints: ['src/pages/catalog.ts'], outfile: 'catalog/browser.mjs', format: 'esm', target: 'es2022' },
  { entryPoints: ['src/widget.mts'], outfile: 'widget.mjs', format: 'esm', bundle: true },
  {
    entryPoints: ['src/autoload.ts'], outfile: 'autoload.js', format: 'iife', bundle: true, minify: true,
    // The classic entry calls loadWidget synchronously while currentScript identifies its CDN URL.
    define: { ...catalogDefine, 'import.meta.url': 'document.currentScript.src' },
  },
];
for (const provider of ['npm', 'jsdelivr']) {
  for (const mode of ['random', 'sequential']) {
    const dir = provider + '/' + mode;
    const define = { ...catalogDefine, GLOBAL_RUNTIME: JSON.stringify('https://cdn.jsdelivr.net/gh/nova1751/live2d-api@widget-' + version + '/'), PROVIDER: JSON.stringify(provider), MODE: JSON.stringify(mode) };
    // Preserve the top-level loadExternalResource and live2d_path classic-script bindings.
    entries.push({ entryPoints: ['src/legacy-autoload.ts'], outfile: dir + '/autoload.js', define });
    if (provider === 'jsdelivr') {
      entries.push({ entryPoints: ['src/legacy-autoload.ts'], outfile: dir + '/autoload.min.js', define, minify: true });
    }
    entries.push({
      entryPoints: ['src/runtime/init.ts'], outfile: dir + '/waifu-tips.js',
      define, bundle: true, format: 'iife', minify: true,
    });
  }
}
for (const position of ['left', 'right']) {
  for (const minify of [false, true]) {
    entries.push({ entryPoints: [`src/styles/${position}.css`], bundle: true,
      outfile: `css/${position}${minify ? '.min' : ''}.css`, minify });
  }
}
if (dev) {
  const contexts = await Promise.all(entries.map(options => context({ ...shared, ...options })));
  await Promise.all(contexts.map(ctx => ctx.watch()));
  const { port } = await contexts[0].serve({ servedir: '.', host: '127.0.0.1' });
  console.log(`Live2D demo: http://127.0.0.1:${port}/`);
} else {
  await Promise.all(entries.map(options => build({ ...shared, ...options })));
}
