import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { blend, Gestures, smoothDamp, type GestureFile, type GestureRule } from '../src/modern/gestures.ts';

// Albion (206072): drags, notches, a toggle, a hold sequence and five poses switched on her hat.
const albion: GestureFile = JSON.parse(readFileSync(new URL('../catalog/games/azur-lane-l2d/206072.json', import.meta.url), 'utf8'));
const motions = ['idle', 'idle1', 'idle2', 'idle3', 'idle4', 'idle5', 'touch_body', 'touch_head', 'touch_special',
  ...Array.from({ length: 4 }, (_, i) => 'touch_drag' + (i + 1)), ...Array.from({ length: 10 }, (_, i) => 'touch_idle' + (i + 1))];

function model(rules: readonly GestureRule[] = albion.rules, random = () => 0) {
  const log: string[] = [];
  const state = { playing: undefined as string | undefined, idle: 0 };
  const gestures = new Gestures(rules, {
    has: action => motions.includes(action),
    play(action) { log.push('play ' + action); state.playing = action; return true; },
    stop() { state.playing = undefined; },
    playing: () => state.playing,
    idle(index) { log.push('idle ' + index); state.idle = index; },
    parameter: () => 0,
  }, random);
  const run = (seconds: number) => { for (let t = 0; t < seconds; t += 1 / 60) gestures.step(1 / 60); };
  const value = (parameter: string) => [...gestures.contributions()].filter(c => c.parameter === parameter).at(-1)?.value;
  const tap = (hits: string[], at = 0) => {
    gestures.press(hits, { x: 0, y: 0 }, at);
    return gestures.release({ x: 0, y: 0 }, at + 0.1);
  };
  const finish = () => { state.playing = undefined; run(0.05); };
  return { gestures, log, state, run, value, tap, finish };
}

test('dragging a part moves its parameter and settles on the nearest notch', () => {
  const { gestures, run, value } = model();
  // TouchDrag1: 40 px per unit downwards (the game's y points up), notches 0, 2.4, 5, 6.6, 8, 10.
  assert.equal(gestures.press(['TouchDrag1'], { x: 0, y: 0 }, 0), true, 'a draggable part owns the press');
  gestures.move({ x: 0, y: -210 });
  run(0.2);
  assert.ok(Math.abs(value('touch_drag1')! - 5.25) < 0.06);
  gestures.release({ x: 0, y: -210 }, 1);
  run(0.3);
  assert.equal(value('touch_drag1'), 5);
  // It stays there (revert -1), and the next drag starts from it.
  run(2);
  assert.equal(value('touch_drag1'), 5);
  gestures.press(['TouchDrag1'], { x: 0, y: 0 }, 3);
  gestures.move({ x: 0, y: -64 });
  run(0.2);
  gestures.release({ x: 0, y: -64 }, 4);
  run(0.3);
  assert.equal(value('touch_drag1'), 6.6);
});

test('a part with a revert time springs back after release', () => {
  const { gestures, run, value } = model();
  // TouchDrag2: 20 px per unit to the right, only positive, back to 0 after 100 ms.
  gestures.press(['TouchDrag2'], { x: 0, y: 0 }, 0);
  gestures.move({ x: -100, y: 0 });
  run(0.1);
  assert.equal(value('touch_drag2'), 0, 'drag_direct 1 keeps it at or above zero');
  gestures.move({ x: 100, y: 0 });
  run(0.1);
  assert.equal(value('touch_drag2'), 5);
  gestures.release({ x: 100, y: 0 }, 1);
  run(0.05);
  assert.equal(value('touch_drag2'), 5, 'waits out the revert time');
  run(0.4);
  assert.equal(value('touch_drag2'), 0);
});

test('stacked pose switches pick one that changes the pose, and the way back appears in it', () => {
  const { gestures, log, state, tap, finish } = model(albion.rules, () => 0.5);
  const hat = ['TouchIdle1', 'TouchIdle3', 'TouchIdle5', 'TouchIdle7', 'TouchIdle9', 'TouchIdle10', 'TouchIdle6', 'TouchIdle8'];
  // The way back to the first pose (TouchIdle2) does nothing in it.
  assert.equal(tap(['TouchIdle2']), false);
  assert.equal(tap(hat), true);
  // Five switches lead somewhere; the middle one goes to pose 3.
  assert.deepEqual(log, ['play touch_idle5', 'idle 3']);
  assert.equal(gestures.allows('touch_head'), false, 'the pose limits what else can play');
  assert.equal(gestures.allows('touch_idle6'), true);
  assert.equal(gestures.busy(), true, 'other taps wait while the switch plays');
  assert.equal(tap(hat, 1), false);
  finish();
  // Back to the first pose through the switch that appeared for pose 3.
  assert.equal(tap(['TouchIdle6'], 2), true);
  assert.deepEqual(log.slice(2), ['play touch_idle6', 'idle 0']);
  finish();
  assert.equal(state.idle, 0);
  assert.equal(gestures.allows('touch_head'), true);
});

test('a toggle flips between its target and its start', () => {
  const { tap, run, value } = model();
  // TouchDrag6: { circle, target 10 }, no action.
  assert.equal(tap(['TouchDrag6']), true);
  run(0.3);
  assert.equal(value('touch_drag6'), 10);
  assert.equal(tap(['TouchDrag6'], 1), false, 'once per limit_time');
  run(1);
  assert.equal(tap(['TouchDrag6'], 2), true);
  run(0.3);
  assert.equal(value('touch_drag6'), 0);
});

test('holding a part plays its action list in turn', () => {
  const { gestures, log, run, finish } = model();
  // TouchDrag17: touch_drag1 after one second, then touch_drag2 three seconds later.
  assert.equal(gestures.press(['TouchDrag17'], { x: 0, y: 0 }, 0), true);
  run(0.9);
  assert.deepEqual(log, []);
  run(0.3);
  assert.deepEqual(log, ['play touch_drag1']);
  finish();
  run(2.6);
  assert.deepEqual(log, ['play touch_drag1']);
  run(0.6);
  assert.deepEqual(log, ['play touch_drag1', 'play touch_drag2']);
});

test('a press that moves or lasts is not a tap', () => {
  const { gestures, log } = model();
  gestures.press(['TouchDrag5'], { x: 0, y: 0 }, 0);
  assert.equal(gestures.release({ x: 40, y: 0 }, 0.1), false);
  gestures.press(['TouchDrag5'], { x: 0, y: 0 }, 1);
  assert.equal(gestures.release({ x: 0, y: 0 }, 1.6), false);
  assert.deepEqual(log, []);
  gestures.press(['TouchDrag5'], { x: 0, y: 0 }, 2);
  assert.equal(gestures.release({ x: 5, y: 5 }, 2.2), true);
  assert.deepEqual(log, ['play touch_drag3']);
});

test('a two-axis drag drives its related parameters', () => {
  const rule: GestureRule = { id: 1, draw_able_name: 'TouchDrag2', mode: 2, offset_x: 14, offset_y: 6, range: [-30, 30], smooth: 100,
    relation_parameter: { list: [{ name: 'ZhunxingX', type: 101 }, { name: 'ZhunxingY', type: 102 }] } };
  const { gestures, run, value } = model([rule]);
  gestures.press(['TouchDrag2'], { x: 0, y: 0 }, 0);
  gestures.move({ x: 140, y: -60 });
  run(1);
  assert.ok(Math.abs(value('ZhunxingX')! - 10) < 0.02);
  assert.ok(Math.abs(value('ZhunxingY')! + 10) < 0.02);
});

test('parameter modes override, add to or scale what the motion wrote', () => {
  assert.equal(blend(3, [{ parameter: 'p', mode: 1, value: 1 }]), 1);
  assert.equal(blend(3, [{ parameter: 'p', mode: 2, value: 1 }]), 4);
  assert.equal(blend(3, [{ parameter: 'p', mode: 3, value: 2 }]), 6);
  assert.equal(blend(3, []), 3);
  const [halfway] = smoothDamp(0, 10, 0, 0.1, 0.05);
  assert.ok(halfway > 0 && halfway < 10);
});
