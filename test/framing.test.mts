import test from 'node:test';
import assert from 'node:assert/strict';
import { catalogFraming, createFraming, fitSilhouette } from '../src/library/framing.ts';

const initial = { scale: 0.65, x: 0, y: 0 };
const size = 128;

test('7706 keeps the same camera from first paint and fits both idle silhouettes despite offstage effects', () => {
  for (const [form, center, top, bottom] of [['normal', 154, 155, 265], ['destroy', 177, 106, 186]] as const) {
    let aspect = 0;
    const bleed = 1.5;
    const framing = catalogFraming('doll/56-1type/7706/' + form, ratio => { aspect = ratio; }, bleed);
    const camera = framing.initial;
    assert.deepEqual(framing.measure({} as HTMLCanvasElement), camera);
    const project = (p: number, offset: number) => 0.5 + bleed * (offset + (p / 320 - 0.5) * camera.scale / 0.65);
    assert.ok(aspect > 0.7 && aspect < 1);
    assert.ok(Math.abs(project(center, camera.x) - 0.5) < 0.02);
    assert.ok(project(top, camera.y) > 0 && project(bottom, camera.y) < 1);
    assert.ok(project(bottom, camera.y) - project(top, camera.y) > 0.85);
  }
});
function rectangle(mask, left, top, right, bottom) {
  for (let y = top; y < bottom; y++) mask.fill(255, y * size + left, y * size + right);
}
function project(point, offset, camera) {
  return 0.5 + offset + (point / size - 0.5) * camera.scale / initial.scale;
}

test('frames head and shoes with a low baseline and centers an authored torso beside a prop', () => {
  const mask = new Uint8Array(size * size);
  rectangle(mask, 34, 25, 48, 81);
  rectangle(mask, 37, 81, 39, 86);
  rectangle(mask, 48, 57, 65, 78);
  const camera = fitSilhouette(mask, initial, x => x * size < 48 ? ['body'] : []);
  assert.ok(Math.abs(project(41, camera.x, camera) - 0.5) < 0.035);
  assert.ok(Math.abs(project(25, camera.y, camera) - 0.04) < 0.001);
  assert.ok(Math.abs(project(86, camera.y, camera) - 0.97) < 0.001);
});

test('carries a cropped portrait below the viewport without changing the head-to-torso scale', () => {
  const mask = new Uint8Array(size * size);
  for (const [left, right, top] of [[43, 84, 24], [13, 112, 52]]) {
    mask.fill(0);
    rectangle(mask, left, top, right, 100);
    let aspect;
    const body = fitSilhouette(mask, initial, undefined, value => { aspect = value; });
    const portrait = fitSilhouette(mask, initial, undefined, () => {}, true);
    assert.equal(portrait.scale, body.scale);
    assert.equal(portrait.x, body.x);
    const height = Math.min(1, 1 / aspect);
    assert.ok(project(100, portrait.y, portrait) > 1 + 0.02 * height);
    assert.ok(project(100, body.y, body) < 1);
  }
});

test('fits a wide group and gives an unmarked silhouette a stable baseline', () => {
  const mask = new Uint8Array(size * size);
  rectangle(mask, 13, 54, 112, 90);
  const camera = fitSilhouette(mask, initial);
  assert.ok(project(13, camera.x, camera) >= 0.02);
  assert.ok(project(112, camera.x, camera) <= 0.98);
  assert.ok(Math.abs(project(90, camera.y, camera) - 0.97) < 0.001);
  assert.deepEqual(fitSilhouette(new Uint8Array(mask.length), initial), { scale: 1, x: 0, y: 0 });
});

test('anchors the cut edge of a half portrait even when a thin weapon extends below it', () => {
  const mask = new Uint8Array(size * size);
  rectangle(mask, 41, 20, 77, 94);
  rectangle(mask, 78, 80, 79, 106);
  const portrait = fitSilhouette(mask, initial, undefined, () => {}, true);
  const full = fitSilhouette(mask, initial, undefined, () => {});
  assert.ok(project(94, portrait.y, portrait) > 1);
  assert.ok(project(106, full.y, full) < 1);
});

test('frames the settled figure despite a wide setup pose and a faint detached particle', t => {
  const initialPose = new Uint8Array(size * size);
  rectangle(initialPose, 6, 7, 122, 115);
  const settled = new Uint8Array(size * size);
  rectangle(settled, 44, 50, 72, 113);
  settled[3 * size + 58] = 32;
  const rgba = new Uint8ClampedArray(size * size * 4);
  const context = { clearRect() {}, drawImage() {}, getImageData: () => ({ data: rgba }) };
  globalThis.document = { createElement: () => ({ getContext: () => context }) };
  t.after(() => { delete globalThis.document; });
  let now = 0;
  t.mock.method(performance, 'now', () => now);
  const framing = createFraming();
  let camera;
  for (const pose of [initialPose, settled, settled]) {
    pose.forEach((value, index) => { rgba[4 * index + 3] = value; });
    camera = framing.measure({});
    now += 100;
  }
  assert.ok(camera);
  assert.ok(project(50, camera.y, camera) < 0.09);
  assert.ok(Math.abs(project(113, camera.y, camera) - 0.97) < 0.001);
});

test('fits tall and wide silhouettes within their bottom-centered viewports', () => {
  for (const [left, top, right, bottom, expected] of [[50, 15, 75, 106, 0.35], [12, 45, 117, 80, 3 * 0.93 / 0.94]]) {
    const mask = new Uint8Array(size * size);
    rectangle(mask, left, top, right, bottom);
    let aspect = 0;
    const camera = fitSilhouette(mask, initial, undefined, ratio => { aspect = ratio; });
    assert.equal(aspect, expected);
    const width = Math.min(1, aspect), height = Math.min(1, 1 / aspect);
    assert.ok(project(left, camera.x, camera) >= (1 - width) / 2);
    assert.ok(project(right, camera.x, camera) <= (1 + width) / 2);
    assert.ok(project(top, camera.y, camera) >= 1 - height);
    assert.ok(Math.abs(project(bottom, camera.y, camera) - (1 - 0.03 * height)) < 0.001);
  }
});

test('waits out a black setup layer and remeasures a clipped outfit before revealing it', t => {
  const rgba = new Uint8ClampedArray(size * size * 4);
  const context = { clearRect() {}, drawImage() {}, getImageData: () => ({ data: rgba }) };
  globalThis.document = { createElement: () => ({ getContext: () => context }) };
  t.after(() => { delete globalThis.document; });
  let now = 0;
  t.mock.method(performance, 'now', () => now);
  const framing = createFraming();
  const views = [];
  function sample() {
    now += 100;
    return framing.measure({}, undefined, view => views.push(view));
  }
  rgba.fill(128);
  for (let i = 0; i < rgba.length; i += 4) rgba.fill(0, i, i + 3);
  for (let i = 0; i < 12; i++) assert.equal(sample(), undefined);
  function pose(top, bottom) {
    rgba.fill(0);
    for (let y = top; y < bottom; y++) {
      for (let x = 45; x < 81; x++) rgba[(y * size + x) * 4 + 3] = 255;
    }
  }
  pose(56, 128);
  for (let i = 0; i < 3; i++) assert.equal(sample(), undefined);
  assert.equal(views.length, 1);
  assert.ok(views[0].scale < framing.initial.scale);
  pose(61, 106);
  assert.equal(sample(), undefined);
  assert.equal(sample(), undefined);
  const camera = sample();
  assert.ok(camera);
  const feet = 0.5 + camera.y + (106 / size - 0.5) * camera.scale / views[0].scale;
  assert.ok(Math.abs(feet - 0.97) < 0.001);
});

test('waits through transparent setup and ignores the isolated cinematic strip on OTs-14 5602', t => {
  const rgba = new Uint8ClampedArray(size * size * 4);
  const context = { clearRect() {}, drawImage() {}, getImageData: () => ({ data: rgba }) };
  globalThis.document = { createElement: () => ({ getContext: () => context }) };
  t.after(() => { delete globalThis.document; });
  let now = 0, aspect;
  t.mock.method(performance, 'now', () => now);
  const framing = createFraming(value => { aspect = value; });
  const sample = () => { now += 85; return framing.measure({}); };
  for (let i = 0; i < 12; i++) assert.equal(sample(), undefined);
  for (let y = 5; y < 7; y++) for (let x = 0; x < size; x++) rgba[4 * (y * size + x) + 3] = 255;
  for (let y = 59; y < 104; y++) for (let x = 48; x < 82; x++) rgba.fill(255, 4 * (y * size + x), 4 * (y * size + x + 1));
  sample();
  sample();
  const camera = sample();
  assert.ok(aspect < 1 && camera);
  assert.ok(Math.abs(project(59, camera.y, camera) - 0.04) < 0.001);
  assert.ok(Math.abs(project(104, camera.y, camera) - 0.97) < 0.001);
});
