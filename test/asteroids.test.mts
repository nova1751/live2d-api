import test from 'node:test';
import assert from 'node:assert/strict';
import { advance, createWorld, segmentEntry, STEP, TargetGrid, type Controls, type Rect } from '../src/game/asteroids/sim.ts';

const idle: Controls = { thrust: false, turn: 0, fire: false };
const never = () => false;
const rect = (left: number, top: number, right: number, bottom: number): Rect => ({ left, top, right, bottom });

test('a path crossing a thin box hits it even when neither end lies inside', () => {
  const line = rect(50, 9, 52, 11);
  assert.equal(segmentEntry(0, 10, 100, 10, line), 0.5);
  assert.ok(segmentEntry(40, 10, 60, 10, line) >= 0);
  assert.equal(segmentEntry(40, 20, 60, 20, line), -1);
  assert.ok(segmentEntry(40, 13, 60, 13, line, 2) >= 0, 'padding covers the bullet radius');
  assert.equal(segmentEntry(51, 0, 51, 5, line), -1, 'a vertical path stopping short misses');
});

test('a fast bullet cannot pass through a 2px line between frames', () => {
  const world = createWorld(800, 600);
  Object.assign(world.ship, { x: 400, y: 300, angle: 0 });
  const grid = new TargetGrid<{ depth: number; rects: Rect[]; dead?: boolean }>();
  const line = { depth: 1, rects: [rect(560, 290, 562, 310)] };
  grid.build([line]);
  let hits = 0;
  const hit = (x0: number, y0: number, x1: number, y1: number) => {
    const target = grid.query(x0, y0, x1, y1, 2);
    if (!target) return false;
    target.dead = true;
    hits++;
    return true;
  };
  advance(world, { ...idle, fire: true }, 0, STEP, hit);
  // Ten frames at 30 fps carry the bullet well past the line.
  let carry = 0;
  for (let frame = 0; frame < 10; frame++) carry = advance(world, idle, carry, 1 / 30, hit);
  assert.equal(hits, 1);
});

test('the deepest box on the path wins, and shot targets are skipped', () => {
  const grid = new TargetGrid<{ name: string; depth: number; rects: Rect[]; dead?: boolean }>();
  const page = { name: 'page', depth: 1, rects: [rect(0, 0, 4000, 4000)] };
  const card = { name: 'card', depth: 2, rects: [rect(100, 100, 300, 200)] };
  const link = { name: 'link', depth: 3, rects: [rect(150, 140, 190, 160)] };
  const left = { name: 'left', depth: 3, rects: [rect(110, 140, 120, 160)] };
  grid.build([page, card, link, left]);
  assert.equal(grid.query(140, 150, 160, 150)?.name, 'link');
  assert.equal(grid.query(105, 150, 200, 150)?.name, 'left', 'equal depth goes to the first one reached');
  assert.equal(grid.query(250, 120, 260, 120)?.name, 'card');
  assert.equal(grid.query(1000, 1000, 1010, 1000)?.name, 'page', 'large boxes are found off the grid');
  link.dead = true;
  assert.equal(grid.query(140, 150, 160, 150)?.name, 'card');
});

test('a fixed caption over the page takes the shot instead of the text under it', () => {
  const grid = new TargetGrid<{ name: string; depth: number; layer?: number; rects: Rect[] }>();
  const word = { name: 'word', depth: 4, rects: [rect(100, 100, 140, 120)] };
  const caption = { name: 'caption', depth: 2, layer: 2, rects: [rect(90, 90, 300, 160)] };
  grid.build([word, caption]);
  assert.equal(grid.query(110, 110, 120, 110)?.name, 'caption');
});

test('the ship flies the same on 60 Hz and 144 Hz screens', () => {
  const fly = (hz: number) => {
    const world = createWorld(100000, 100000);
    const controls = { thrust: true, turn: 1, fire: false };
    let carry = 0;
    for (let frame = 0; frame < hz; frame++) carry = advance(world, controls, carry, 1 / hz, never);
    controls.thrust = false;
    controls.turn = 0;
    for (let frame = 0; frame < hz; frame++) carry = advance(world, controls, carry, 1 / hz, never);
    return world.ship;
  };
  const slow = fly(60);
  const fast = fly(144);
  // Rounding can leave the two runs one fixed step apart.
  assert.ok(Math.hypot(slow.x - fast.x, slow.y - fast.y) < 3, `${slow.x},${slow.y} vs ${fast.x},${fast.y}`);
  assert.ok(Math.abs(slow.angle - fast.angle) < 0.06);
});

test('without thrust the ship coasts to a stop at the same rate however it is stepped', () => {
  const world = createWorld(100000, 100000);
  world.ship.vx = 100;
  advance(world, idle, 0, 0.5, never);
  let carry = 0;
  for (let frame = 0; frame < 120; frame++) carry = advance(world, idle, carry, STEP, never);
  // 96% kept every 1/50 s; the first call is capped to a few steps, so measure from the second.
  assert.ok(world.ship.vx > 0 && world.ship.vx < 100 * Math.pow(0.96, 50) * 1.01);
});

test('a long stall drops the backlog instead of fast-forwarding', () => {
  const world = createWorld(800, 600);
  world.ship.vx = 100;
  const x = world.ship.x;
  const carry = advance(world, idle, 0, 10, never);
  assert.equal(carry, 0);
  assert.ok(world.ship.x - x < 100 * STEP * 6);
});

test('the ship starts near the top-left corner, pointing down, even on a small screen', () => {
  const { ship } = createWorld(1280, 720);
  assert.deepEqual([ship.x, ship.y, ship.angle], [100, 100, Math.PI / 2]);
  const small = createWorld(150, 120).ship;
  assert.deepEqual([small.x, small.y], [75, 60]);
});

test('leaving an edge wraps the ship and reports the side', () => {
  const world = createWorld(800, 600);
  world.ship.x = 799;
  world.ship.vx = 600;
  const sides: [number, number][] = [];
  advance(world, idle, 0, STEP * 2, never, (dx, dy) => sides.push([dx, dy]));
  assert.deepEqual(sides, [[1, 0]]);
  assert.ok(world.ship.x < 20);
});

test('holding a pointer turns the ship toward it and fires', () => {
  const world = createWorld(800, 600);
  Object.assign(world.ship, { x: 400, y: 300, angle: 0 });
  const controls = { ...idle, aim: { x: 400, y: 0 } };
  let shots = 0;
  let carry = 0;
  for (let frame = 0; frame < 60; frame++) carry = advance(world, controls, carry, 1 / 60, never);
  for (const bullet of world.bullets) if (bullet.active) shots++;
  const { ship } = world;
  // The ship drifts while it turns, so it should point at the target from where it ended up.
  assert.ok(Math.abs(ship.angle - Math.atan2(controls.aim.y - ship.y, controls.aim.x - ship.x)) < 0.05, String(ship.angle));
  assert.ok(ship.y < 300, 'it flew toward the pointer');
  assert.ok(shots >= 5);
});
