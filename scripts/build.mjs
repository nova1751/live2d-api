import { build, context } from 'esbuild';

const dev = process.argv.includes('--dev');
const shared = {
  target: 'es2020',
  charset: 'utf8',
  banner: { js: '/*! Live2D API | Generated from src/ | https://github.com/nova1751/live2d-api */' },
};
const entries = [
  { entryPoints: ['src/widget.mts'], outfile: 'widget.mjs', format: 'esm', bundle: true },
  { entryPoints: ['src/autoload.ts'], outfile: 'autoload.js', format: 'iife', bundle: true },
];
for (const provider of ['npm', 'jsdelivr']) {
  for (const mode of ['random', 'sequential']) {
    const dir = provider + '/' + mode;
    const define = { PROVIDER: JSON.stringify(provider), MODE: JSON.stringify(mode) };
    // Preserve the top-level loadExternalResource and live2d_path classic-script bindings.
    entries.push({ entryPoints: ['src/legacy-autoload.ts'], outfile: dir + '/autoload.js', define });
    entries.push({
      entryPoints: ['src/runtime/init.ts'], outfile: dir + '/waifu-tips.js',
      define, bundle: true, format: 'iife', minify: true,
    });
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
