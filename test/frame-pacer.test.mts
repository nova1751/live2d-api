import test from 'node:test';
import assert from 'node:assert/strict';
import { createFramePacer } from '../src/runtime/frame-pacer.ts';

/**
 * Drive a pacer like requestAnimationFrame on a display at `hz`. Drawing costs `cost(t)` ms, and
 * the next callback comes at the first refresh after the work, so a slow device misses refreshes.
 */
function run(hz: number, { seconds = 20, maxFps = 120, cost = (_t: number) => 0.5, jitterMs = 0.15 } = {}) {
  const pace = createFramePacer(maxFps);
  const period = 1000 / hz;
  const draws: number[] = [];
  for (let vsync = 0; vsync * period < seconds * 1000;) {
    const t = vsync * period + Math.sin(vsync * 12.9898) * jitterMs;
    if (pace(t)) {
      draws.push(t);
      vsync += Math.max(1, Math.ceil(cost(t) / period));
    } else vsync++;
  }
  return draws;
}

function rhythm(draws: number[], hz: number, from = 0, to = Infinity) {
  const window = draws.filter(t => t >= from && t < to);
  const gaps = window.slice(1).map((t, i) => Math.round((t - window[i]) * hz / 1000));
  const fps = (window.length - 1) / ((window.at(-1)! - window[0]) / 1000);
  return { fps, steps: [...new Set(gaps)].sort((a, b) => a - b) };
}

test('frames are evenly spaced on whole refreshes at any refresh rate, up to 120 fps', () => {
  const expected: Record<number, [number, number]> = {
    48: [48, 1], 59.94: [59.94, 1], 60: [60, 1], 60.5: [60.5, 1], 75: [75, 1], 90: [90, 1], 100: [100, 1],
    120: [120, 1], 144: [72, 2], 165: [82.5, 2], 240: [120, 2], 320: [106.7, 3], 360: [120, 3],
  };
  for (const [hz, [fps, step]] of Object.entries(expected).map(([k, v]) => [Number(k), v] as const)) {
    const result = rhythm(run(hz), hz, 2000);
    assert.deepEqual(result.steps, [step], `${hz} Hz: ${JSON.stringify(result)}`);
    assert.ok(Math.abs(result.fps - fps) < 0.5, `${hz} Hz drew ${result.fps} fps`);
  }
});

test('touch devices cap at 90 fps, so a 120 Hz phone draws every second refresh', () => {
  for (const [hz, fps] of [[60, 60], [90, 90], [120, 60], [144, 72]]) {
    assert.ok(Math.abs(rhythm(run(hz, { maxFps: 90 }), hz, 2000).fps - fps) < 0.5, String(hz));
  }
});

test('a device too slow for the target steps down to an even rate it can hold', () => {
  // 15 ms per frame on a 144 Hz display: every second refresh (72 fps) is not sustainable.
  const draws = run(144, { cost: () => 15 });
  const settled = rhythm(draws, 144, 10_000);
  assert.deepEqual(settled.steps, [3], JSON.stringify(settled));
  assert.ok(Math.abs(settled.fps - 48) < 0.5, String(settled.fps));
  // 10 ms per frame fits two refreshes, so 72 fps holds without stepping down.
  assert.deepEqual(rhythm(run(144, { cost: () => 10 }), 144, 2000).steps, [2]);
});

test('a 60 Hz display that cannot keep up keeps drawing every refresh it gets, never locking to 30 fps', () => {
  // 20 ms frames miss every other refresh; halving to 30 fps would be smoother on paper but slower.
  const pace = createFramePacer(120);
  let drawn = 0, offered = 0;
  for (let vsync = 0; vsync < 60 * 20;) {
    offered++;
    if (pace(vsync * 1000 / 60)) { drawn++; vsync += vsync % 3 ? 1 : 2; } else vsync++;
  }
  assert.equal(drawn, offered);
});

test('the rate recovers after a temporary load, and failed probes back off', () => {
  const busy = (t: number) => t < 8000 ? 15 : 0.5;
  const draws = run(144, { seconds: 60, cost: busy });
  assert.deepEqual(rhythm(draws, 144, 3000, 8000).steps, [3]);
  assert.deepEqual(rhythm(draws, 144, 40_000).steps, [2], 'back to 72 fps');
  // Under constant overload, probes stay rare: few stutters after the first ten seconds.
  const stuck = rhythm(run(144, { seconds: 120, cost: () => 15 }), 144, 10_000);
  const slips = run(144, { seconds: 120, cost: () => 15 }).filter((t, i, all) => t > 10_000 && i && (t - all[i - 1]) * 144 / 1000 > 3.5);
  assert.ok(Math.abs(stuck.fps - 48) < 1 && slips.length <= 12, JSON.stringify({ fps: stuck.fps, slips: slips.length }));
});

test('very fast, noisy refresh timing with occasional hitches keeps the full rate', () => {
  for (const hz of [320, 500]) {
    const pace = createFramePacer(120);
    const draws: number[] = [];
    let t = 0;
    for (let i = 0; t < 20_000; i++) {
      t += 1000 / hz + Math.sin(i * 12.9898) * 0.5 + (i % 37 === 0 ? 5 : 0);
      if (pace(t)) draws.push(t);
    }
    const late = draws.filter(x => x > 5000);
    const fps = (late.length - 1) / ((late.at(-1)! - late[0]) / 1000);
    assert.ok(fps > 100, `${hz} Hz drew ${fps} fps`);
  }
});

test('a long pause resumes without a burst, and a move to a slower display is followed', () => {
  const pace = createFramePacer(120);
  for (let t = 0; t < 1000; t += 1000 / 144) pace(t);
  let burst = 0;
  for (let t = 60_000; t < 60_100; t += 1000 / 144) if (pace(t)) burst++;
  assert.ok(burst <= 8, String(burst));
  // Now at 60 Hz: after a short adjustment, every refresh draws.
  let drawn = 0, frames = 0;
  for (let t = 61_000; t < 64_000; t += 1000 / 60) { const draw = pace(t); if (t > 62_000) { frames++; if (draw) drawn++; } }
  assert.equal(drawn, frames);
});
