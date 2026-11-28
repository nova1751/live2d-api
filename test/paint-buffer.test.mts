import test from 'node:test';
import assert from 'node:assert/strict';
import { touchPixelBudget, paintResolution, visibleArea } from '../src/runtime/paint-buffer.ts';

const desktop = { maxResolution: 3, pixelBudget: 16.8e6, maxSide: 8192 };
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
  // Past the 8192 px buffer side limit it scales down, but never below one pixel per CSS pixel.
  const huge = { ...zoomed, width: 9000, height: 9000 };
  assert.equal(paintResolution(huge, { width: 2560, height: 1440 }, 1.5, desktop), 1);
  assert.ok(Math.abs(paintResolution({ ...zoomed, width: 5000, height: 5000 }, { width: 2560, height: 1440 }, 1.5, desktop) - 1.5) < 1e-9);
  assert.ok(Math.abs(paintResolution({ ...zoomed, width: 6000, height: 6000 }, { width: 2560, height: 1440 }, 1.5, desktop) - 8192 / 6000) < 1e-9);
});

test('desktop supersampling keeps 2x on 1080p and 2K full-screen canvases and fits 4K within budget', () => {
  // 1080p@1x and 1440p@1.5x both request 2x supersampling in the expanded view.
  assert.equal(paintResolution(fullScreen(1920, 1080), { width: 1920, height: 1080 }, 2, desktop), 2);
  assert.equal(paintResolution(fullScreen(2560, 1440), { width: 2560, height: 1440 }, 2, desktop), 2);
  // 4K@1x (3840x2160) caps to the 16.8M visible pixel budget (~1.42x), still above native 1x.
  const fourK = paintResolution(fullScreen(3840, 2160), { width: 3840, height: 2160 }, 2, desktop);
  assert.ok(fourK > 1.4 && fourK < 1.5, String(fourK));
});

const touch = { maxResolution: 3, pixelBudget: touchPixelBudget, maxSide: 3072 };

test('slow frames still lower the resolution', () => {
  const box = fullScreen(1920, 1080), view = { width: 1920, height: 1080 };
  assert.equal(paintResolution(box, view, 2, desktop, 1920 * 1080 * 1.5 ** 2), 1.5);
  const phone = { width: 390, height: 844 };
  assert.equal(paintResolution({ left: 0, top: 120, width: 390, height: 390 }, phone, 3, touch, 390 * 390 * 2 ** 2), 2);
});

test('a phone or tablet shows the full-screen character at its own pixel ratio', () => {
  // Portrait screens: the square surface spans the height and overhangs both sides.
  const portrait = (width: number, height: number) => ({ left: (width - height) / 2, top: 0, width: height, height });
  for (const [width, height, dpr] of [[390, 844, 3], [430, 932, 3], [412, 915, 2.625], [820, 1180, 2], [1024, 1366, 2]]) {
    assert.equal(paintResolution(portrait(width, height), { width, height }, dpr, touch), dpr, `${width}x${height}@${dpr}`);
  }
});

test('the gallery preview and the floating widget are as sharp on a phone as full screen', () => {
  const phone = { width: 390, height: 844 };
  // The gallery stage, a 496 px square that runs off both sides of a 390 px screen.
  assert.equal(paintResolution({ left: -53, top: 150, width: 496, height: 496 }, phone, 3, touch), 3);
  // The floating widget: its surface is twice the character's square and reaches past the edges.
  assert.equal(paintResolution({ left: -60, top: 460, width: 600, height: 600 }, phone, 3, touch), 3);
});
