import test from 'node:test';
import assert from 'node:assert/strict';
import { anchoredPan, clampPan, glide, releaseVelocity } from '../src/runtime/view-camera.ts';

const view = { left: 0, top: 0, width: 1600, height: 900 };

test('a character that fits moves within the view, and a larger one keeps covering it', () => {
  // A fitted character (600 x 800 at the center) moves freely within the view.
  const box = (pan: { x: number; y: number }) => ({ left: 500 + pan.x, top: 50 + pan.y, width: 600, height: 800 });
  assert.deepEqual(clampPan({ x: 300, y: -30 }, box({ x: 300, y: -30 }), view), { x: 300, y: -30 });
  // It stops at the edges of the view.
  assert.deepEqual(clampPan({ x: -2000, y: 5000 }, box({ x: -2000, y: 5000 }), view), { x: -500, y: 50 });
  assert.deepEqual(clampPan({ x: 2000, y: -5000 }, box({ x: 2000, y: -5000 }), view), { x: 500, y: -50 });
  // Zoomed past the view, its edges cannot be dragged inside it.
  const zoomed = { left: -1000, top: -1500, width: 3600, height: 4800 };
  const right = clampPan({ x: 4000, y: 0 }, { ...zoomed, left: zoomed.left + 4000 }, view);
  assert.equal(zoomed.left + right.x, 0);
  const left = clampPan({ x: -4000, y: 0 }, { ...zoomed, left: zoomed.left - 4000 }, view);
  assert.equal(zoomed.left + left.x + zoomed.width, 1600);
  assert.equal(clampPan({ x: 0, y: 300 }, zoomed, view).y, 300);
});

test('a hasty flick is capped', () => {
  const v = releaseVelocity([{ x: 0, y: 0, t: 0 }, { x: 600, y: 800, t: 10 }]);
  assert.ok(Math.abs(Math.hypot(v.x, v.y) - 2.5) < 1e-9 && Math.abs(v.x / v.y - 0.75) < 1e-9);
});

test('zooming keeps the point under the pointer in place', () => {
  const before = { left: 500, top: 50, width: 600, height: 800 };
  // The layout doubles the box around its center.
  const after = { left: 200, top: -350, width: 1200, height: 1600 };
  const anchor = { x: 700, y: 250 };
  const pan = anchoredPan({ x: 0, y: 0 }, before, after, anchor);
  const u = (anchor.x - before.left) / before.width, v = (anchor.y - before.top) / before.height;
  assert.ok(Math.abs(after.left + pan.x + u * after.width - anchor.x) < 1e-9);
  assert.ok(Math.abs(after.top + pan.y + v * after.height - anchor.y) < 1e-9);
  // Zooming at the center of the box needs no pan.
  assert.deepEqual(anchoredPan({ x: 5, y: 7 }, before, after, { x: 800, y: 450 }), { x: 5, y: 7 });
});

test('a released drag glides a finite distance and slows to a stop', () => {
  const velocity = releaseVelocity([{ x: 0, y: 0, t: 0 }, { x: 40, y: 0, t: 150 }, { x: 60, y: 10, t: 180 }, { x: 100, y: 30, t: 200 }]);
  assert.ok(Math.abs(velocity.x - 60 / 50) < 1e-9 && Math.abs(velocity.y - 30 / 50) < 1e-9, JSON.stringify(velocity));
  assert.deepEqual(releaseVelocity([{ x: 5, y: 5, t: 10 }]), { x: 0, y: 0 });
  let v = { x: 1.2, y: 0 }, travelled = 0;
  for (let frame = 0; frame < 300; frame++) {
    const step = glide(v, 1000 / 60);
    travelled += step.move.x;
    v = step.velocity;
  }
  // The exact total is v0 * tau; 60 Hz and 144 Hz steps reach the same place.
  assert.ok(Math.abs(travelled - 1.2 * 325) < 1, String(travelled));
  let fast = { x: 1.2, y: 0 }, sum = 0;
  for (let frame = 0; frame < 720; frame++) { const step = glide(fast, 1000 / 144); sum += step.move.x; fast = step.velocity; }
  assert.ok(Math.abs(sum - travelled) < 0.5);
  assert.ok(v.x < 0.02);
});
