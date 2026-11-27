import test from 'node:test';
import assert from 'node:assert/strict';
import { paintResolution, visibleArea } from '../src/runtime/paint-buffer.ts';

const desktop = { maxResolution: 3, pixelBudget: 16.8e6, maxSide: 6144 };
// A full-screen expanded view: the square surface spans the screen width and overhangs top and bottom.
const fullScreen = (width: number, height: number) => ({ left: 0, top: (height - width) / 2, width, height: width });

test('only the on-screen part of a surface counts', () => {
  assert.equal(visibleArea(fullScreen(1920, 1080), 1920, 1080), 1920 * 1080);
  assert.equal(visibleArea({ left: -100, top: 500, width: 400, height: 400 }, 1000, 800), 300 * 300);
  assert.equal(visibleArea({ left: 2000, top: 0, width: 400, height: 400 }, 1000, 800), 400 * 400);
});

test('a full-screen character renders at the display pixel ratio on common screens', () => {
  for (const [width, height, dpr] of [[1920, 1080, 1], [1920, 1080, 1.5], [2560, 1440, 1], [2560, 1440, 1.5],
    [1920, 1080, 2], [2560, 1440, 2], [1280, 720, 3]]) {
    assert.equal(paintResolution(fullScreen(width, height), { width, height }, dpr, desktop), dpr, `${width}x${height}@${dpr}`);
  }
});

test('a zoomed-in character keeps native resolution until the buffer side limit', () => {
  // 200% on a 4K screen at 150%: the 1.5x surface around a 2448 px square is 3672 CSS px wide.
  const zoomed = { left: -556, top: -1116, width: 3672, height: 3672 };
  assert.equal(paintResolution(zoomed, { width: 2560, height: 1440 }, 1.5, desktop), 1.5);
  // Twice that only fits the buffer at a lower scale, but never below one pixel per CSS pixel.
  const huge = { ...zoomed, width: 7344, height: 7344 };
  assert.equal(paintResolution(huge, { width: 2560, height: 1440 }, 1.5, desktop), 1);
  assert.ok(Math.abs(paintResolution({ ...zoomed, width: 5000, height: 5000 }, { width: 2560, height: 1440 }, 1.5, desktop) - 6144 / 5000) < 1e-9);
});

test('slow frames and touch budgets still lower the resolution', () => {
  const box = fullScreen(1920, 1080), view = { width: 1920, height: 1080 };
  assert.equal(paintResolution(box, view, 2, desktop, 1920 * 1080 * 1.5 ** 2), 1.5);
  const phone = { maxResolution: 1.5, pixelBudget: 1.5e6, maxSide: 2048 };
  assert.ok(paintResolution({ left: 0, top: 0, width: 390, height: 390 }, { width: 390, height: 844 }, 3, phone) === 1.5);
});
