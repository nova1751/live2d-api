// Find effect layers in Cubism 3+ models: black curtains and vignettes, flashes, glows and backdrops
// that cover the page around the character. Reads every pinned model from a local archive
// (scripts/archive-collections.mts), evaluates each motion's curves with Cubism Core, and records
// how large and how opaque every mesh gets, where it sits in the draw order and what colour its
// texture is. Writes candidates and a contact sheet of their texture regions for review.
//
//   node scripts/detect-effect-layers.mts --git-dir E:/live2d-archive-scan refs/live2d-archive/<commit> --out <dir>
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright-core';
import { parseModelCatalog, type Collection } from '../src/library/catalog.ts';
import { repository } from './library-files.mts';

const { positionals, values } = parseArgs({ allowPositionals: true, options: {
  'git-dir': { type: 'string' }, out: { type: 'string' }, only: { type: 'string' }, workers: { type: 'string', default: '4' },
} });
const [ref] = positionals;
if (!/^refs\/live2d-archive\/[0-9a-f]{40}$/.test(ref ?? '') || !values.out) throw Error('Pass the archive ref and --out');
const gitDir = resolve(values['git-dir'] ?? join(repository, '.git')).replaceAll('\\', '/');
const git = ['-c', 'safe.directory=' + gitDir, '--git-dir=' + gitDir, '--no-lazy-fetch'];
const out = resolve(values.out);
mkdirSync(out, { recursive: true });

// One long-lived `git cat-file --batch` serves every file, in request order.
const batch = spawn('git', [...git, 'cat-file', '--batch'], { stdio: ['pipe', 'pipe', 'inherit'], windowsHide: true });
const pending: { resolve: (data: Buffer | undefined) => void }[] = [];
let buffer = Buffer.alloc(0);
batch.stdout.on('data', (chunk: Buffer) => {
  buffer = Buffer.concat([buffer, chunk]);
  for (;;) {
    const newline = buffer.indexOf(10);
    if (newline < 0 || !pending.length) return;
    const header = buffer.subarray(0, newline).toString();
    if (header.endsWith(' missing')) { buffer = buffer.subarray(newline + 1); pending.shift()!.resolve(undefined); continue; }
    const size = Number(header.split(' ')[2]);
    if (buffer.length < newline + 1 + size + 1) return;
    const data = buffer.subarray(newline + 1, newline + 1 + size);
    buffer = buffer.subarray(newline + 2 + size);
    pending.shift()!.resolve(Buffer.from(data));
  }
});
const read = (path: string) => new Promise<Buffer | undefined>(resolve => {
  pending.push({ resolve });
  batch.stdin.write(`${ref}:${path}\n`);
});
const json = async (path: string) => JSON.parse((await read(path))!.toString('utf8').replace(/^\uFEFF/, ''));

const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname.slice(1));
  // Cubism Core comes from vendor/ through a page route.
  const data = path === 'scan.html' ? Buffer.from('<!doctype html><script src="/core.js"></script>') : await read(path);
  if (!data) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'Content-Type': path.endsWith('.js') ? 'text/javascript' : path.endsWith('.html') ? 'text/html' : 'application/octet-stream' });
  res.end(data);
});
await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}/`;

const collections: Record<string, string> = {
  'girls-frontline': 'catalog/library.json', 'azur-lane': 'catalog/games/azur-lane.json',
  'warship-girls': 'catalog/games/warship-girls.json',
};
const targets: { collection: string; id: string; source: string; manifest: string; url: string }[] = [];
for (const [collection, path] of Object.entries(collections)) {
  const input = await json(path);
  const catalog = parseModelCatalog(input, new URL(path, origin), collection as Collection);
  for (const id of catalog.ids) {
    if (id.startsWith('background/') || values.only && !id.includes(values.only)) continue;
    const { modelUrl } = catalog.resolve(id);
    if (!modelUrl.endsWith('.model3.json')) continue;
    const variants = input.models[id] as { source: string; manifest: string; collectionDefault?: boolean }[];
    const variant = variants.find(v => v.collectionDefault && v.manifest) ?? variants.find(v => v.manifest)!;
    targets.push({ collection, id, source: variant.source, manifest: variant.manifest, url: modelUrl });
  }
}
console.log(targets.length, 'Cubism 3+ models');

type Target = typeof targets[number];
const browser = await chromium.launch();
// Each page scans one model at a time; a page whose model hangs is replaced.
async function open() {
  const page = await browser.newPage();
  await page.route(origin + 'core.js', route => route.fulfill({ path: join(repository, 'vendor/cubism-core/live2dcubismcore.min.js'), contentType: 'text/javascript' }));
  await page.goto(origin + 'scan.html');
  await page.waitForFunction(() => (window as any).Live2DCubismCore?.Moc);
  await page.evaluate(defineScanner);
  return page;
}
function defineScanner() {
  const Core = (window as any).Live2DCubismCore;
  // Evaluate a motion3 curve at `time`, following the segment encoding of the motion3 format.
  function curveAt(points: number[], time: number) {
    let t0 = points[0], v0 = points[1];
    if (time <= t0) return v0;
    for (let i = 2; i < points.length;) {
      const type = points[i];
      if (type === 1) {
        const [c1t, c1v, c2t, c2v, t1, v1] = points.slice(i + 1, i + 7);
        if (time <= t1) {
          const s = (time - t0) / (t1 - t0 || 1), u = 1 - s;
          return u * u * u * v0 + 3 * u * u * s * c1v + 3 * u * s * s * c2v + s * s * s * v1;
        }
        t0 = t1; v0 = v1; i += 7; void c1t; void c2t;
      } else {
        const t1 = points[i + 1], v1 = points[i + 2];
        if (time <= t1) return type === 0 ? v0 + (v1 - v0) * (time - t0) / (t1 - t0 || 1) : type === 2 ? v0 : v1;
        t0 = t1; v0 = v1; i += 3;
      }
    }
    return v0;
  }
  async function texture(url: string) {
    const response = await fetch(url);
    if (!response.ok) return undefined;
    const image = await createImageBitmap(await response.blob());
    const canvas = new OffscreenCanvas(image.width, image.height);
    const g = canvas.getContext('2d')!;
    g.drawImage(image, 0, 0);
    return { width: image.width, height: image.height, data: g.getImageData(0, 0, image.width, image.height).data };
  }
  async function scan(target: Target) {
    const base = new URL('.', target.url);
    const setting = await (await fetch(target.url)).json();
    const refs = setting.FileReferences;
    const moc = Core.Moc.fromArrayBuffer(await (await fetch(new URL(refs.Moc, base))).arrayBuffer());
    const model = Core.Model.fromMoc(moc);
    try {
      const { parameters, parts, drawables: d, canvasinfo: info } = model;
      const ppu = info.PixelsPerUnit;
      const canvas = { x0: -info.CanvasOriginX / ppu, x1: (info.CanvasWidth - info.CanvasOriginX) / ppu,
        y0: (info.CanvasOriginY - info.CanvasHeight) / ppu, y1: info.CanvasOriginY / ppu };
      const canvasArea = (canvas.x1 - canvas.x0) * (canvas.y1 - canvas.y0);
      const defaults = Float32Array.from(parameters.defaultValues), partDefaults = Float32Array.from(parts.opacities);
      const stats = Array.from({ length: d.count }, () => ({ rest: 0, peak: 0, area: 0, cover: 0, order: 1, motions: new Set<string>(), best: 0, at: undefined as undefined | [string, number] }));
      // Measure every mesh in the current pose: bounding box relative to the canvas, and how much of
      // the canvas it covers. Only poses where the mesh is visible count.
      const sample = (motion?: string, time = 0) => {
        model.update();
        // Core 5.3 orders drawables and offscreens together on the model.
        const orders = model.renderOrders ?? d.renderOrders, layers = orders.length;
        for (let i = 0; i < d.count; i++) {
          const opacity = d.opacities[i], s = stats[i];
          if (!motion) s.rest = opacity;
          if (opacity < 0.05) continue;
          const v = d.vertexPositions[i];
          let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
          for (let k = 0; k < v.length; k += 2) {
            x0 = Math.min(x0, v[k]); x1 = Math.max(x1, v[k]); y0 = Math.min(y0, v[k + 1]); y1 = Math.max(y1, v[k + 1]);
          }
          if (!Number.isFinite(x0 + x1 + y0 + y1)) continue;
          const area = (x1 - x0) * (y1 - y0) / canvasArea;
          const cover = Math.max(0, Math.min(x1, canvas.x1) - Math.max(x0, canvas.x0)) * Math.max(0, Math.min(y1, canvas.y1) - Math.max(y0, canvas.y0)) / canvasArea;
          if (opacity > s.peak) s.peak = opacity;
          if (area > s.area) s.area = area;
          // Where the mesh covers the most, to render that moment for review.
          if (motion && cover * opacity > s.best) { s.best = cover * opacity; s.at = [motion, +time.toFixed(2)]; }
          if (cover > s.cover) s.cover = cover;
          s.order = Math.min(s.order, orders[i] / layers);
          if (motion && cover > 0.3) s.motions.add(motion);
        }
      };
      sample();
      const motions = Object.entries(refs.Motions ?? {}).flatMap(([group, list]) =>
        (list as { File: string }[]).map((entry, index) => ({ name: `${group}:${index}`, file: entry.File })));
      for (const { name, file } of motions) {
        const response = await fetch(new URL(file, base));
        if (!response.ok) continue;
        let motion;
        try { motion = await response.json(); } catch { continue; }
        const duration = Math.min(30, motion.Meta?.Duration ?? 0);
        const curves = (motion.Curves ?? []).map((curve: { Target: string; Id: string; Segments: number[] }) => ({
          curve, index: curve.Target === 'Parameter' ? parameters.ids.indexOf(curve.Id) : curve.Target === 'PartOpacity' ? parts.ids.indexOf(curve.Id) : -1,
        })).filter((entry: { index: number }) => entry.index >= 0);
        for (let time = 0; time <= duration + 1e-6; time += 1 / 15) {
          parameters.values.set(defaults);
          parts.opacities.set(partDefaults);
          for (const { curve, index } of curves) {
            const value = curveAt(curve.Segments, time);
            if (curve.Target === 'Parameter') parameters.values[index] = value;
            else parts.opacities[index] = value;
          }
          sample(name, time);
        }
      }
      // Texture colour under each candidate mesh: alpha-weighted mean, and how much of the mesh's UV
      // region is opaque (a vignette is transparent in the middle).
      const candidates = stats.map((s, i) => ({ s, i })).filter(({ s }) => s.cover >= 0.6 || s.area >= 1.5);
      const textures: Record<number, Awaited<ReturnType<typeof texture>>> = {};
      const rows = [];
      for (const { s, i } of candidates) {
        const index = d.textureIndices[i];
        textures[index] ??= await texture(new URL(refs.Textures[index], base).href);
        const tex = textures[index];
        const uv = d.vertexUvs[i], tri = d.indices[i];
        let r = 0, g = 0, b = 0, weight = 0, samples = 0, opaque = 0, u0 = 1, v0 = 1, u1 = 0, v1 = 0;
        const at = (u: number, v: number) => {
          if (!tex) return;
          const x = Math.min(tex.width - 1, Math.max(0, Math.floor(u * tex.width)));
          const y = Math.min(tex.height - 1, Math.max(0, Math.floor((1 - v) * tex.height)));
          const o = (y * tex.width + x) * 4, a = tex.data[o + 3] / 255;
          r += tex.data[o] * a; g += tex.data[o + 1] * a; b += tex.data[o + 2] * a; weight += a; samples++;
          if (a > 0.5) opaque++;
        };
        for (let k = 0; k < uv.length; k += 2) {
          u0 = Math.min(u0, uv[k]); u1 = Math.max(u1, uv[k]); v0 = Math.min(v0, uv[k + 1]); v1 = Math.max(v1, uv[k + 1]);
        }
        // Sample each triangle on a small barycentric grid.
        for (let k = 0; k < tri.length; k += 3) {
          const [p, q, w] = [tri[k], tri[k + 1], tri[k + 2]];
          for (const [a, c] of [[1 / 3, 1 / 3], [0.6, 0.2], [0.2, 0.6], [0.2, 0.2]]) {
            const e = 1 - a - c;
            at(a * uv[2 * p] + c * uv[2 * q] + e * uv[2 * w], a * uv[2 * p + 1] + c * uv[2 * q + 1] + e * uv[2 * w + 1]);
          }
        }
        const flags = d.constantFlags[i];
        rows.push({
          mesh: d.ids[i], area: +s.area.toFixed(2), cover: +s.cover.toFixed(2), rest: +s.rest.toFixed(2), peak: +s.peak.toFixed(2),
          order: +s.order.toFixed(2), blend: flags & 1 ? 'add' : flags & 2 ? 'multiply' : 'normal',
          color: weight ? [r, g, b].map(c => Math.round(c / weight)) : null, opaque: samples ? +(opaque / samples).toFixed(2) : 0,
          motions: [...s.motions].slice(0, 12), at: s.at, texture: index, uv: [u0, 1 - v1, u1, 1 - v0].map(n => +n.toFixed(4)),
        });
      }
      return { ...target, meshes: d.count, motions: motions.length, candidates: rows };
    } finally {
      model.release();
      moc._release?.();
    }
  }
  (window as any).scanModel = scan;
}
const started = Date.now();
const reports: unknown[] = [];
let next = 0;
await Promise.all(Array.from({ length: Number(values.workers) }, async () => {
  let page = await open();
  while (next < targets.length) {
    const target = targets[next++];
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(Error('timed out')), 60_000); });
    try {
      reports.push(await Promise.race([page.evaluate(t => (window as any).scanModel(t), target), timeout]));
    } catch (error) {
      reports.push({ ...target, error: String(error).slice(0, 200) });
      console.log('failed', target.id, String(error).slice(0, 120));
      if (String(error).includes('timed out')) { await page.close().catch(() => {}); page = await open(); }
    } finally { clearTimeout(timer); }
    if (reports.length % 50 === 0) console.log(reports.length, '/', targets.length, ((Date.now() - started) / 1000).toFixed(0) + 's');
  }
  await page.close();
}));
console.log('scanned in', ((Date.now() - started) / 1000).toFixed(0), 's');
writeFileSync(join(out, 'effect-layers.json'), JSON.stringify(reports, null, 1) + '\n');
await browser.close();
server.close();
batch.stdin.end();
