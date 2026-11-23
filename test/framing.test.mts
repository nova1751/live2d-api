import test from 'node:test';
import assert from 'node:assert/strict';
import { fitSilhouette } from '../src/library/framing.ts';

const initial = { scale: 0.65, x: 0, y: 0 };
const size = 128;
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

test('fits a wide group and gives an unmarked silhouette a stable baseline', () => {
  const mask = new Uint8Array(size * size);
  rectangle(mask, 13, 54, 112, 90);
  const camera = fitSilhouette(mask, initial);
  assert.ok(project(13, camera.x, camera) >= 0.02);
  assert.ok(project(112, camera.x, camera) <= 0.98);
  assert.ok(Math.abs(project(90, camera.y, camera) - 0.97) < 0.001);
  assert.deepEqual(fitSilhouette(new Uint8Array(mask.length), initial), { scale: 1, x: 0, y: 0 });
});

test('fits tall and wide silhouettes within their bottom-centered viewports', () => {
  for (const [left, top, right, bottom, expected] of [[50, 15, 75, 106, 0.7], [12, 45, 117, 80, 1.9]]) {
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
