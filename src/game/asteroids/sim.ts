// Game state and physics. Nothing here touches the DOM, so it runs under node for tests.

/** One simulation step. Fixed so the ship handles the same on 60 Hz and 144 Hz screens. */
export const STEP = 1 / 120;
export const MAX_STEPS = 5;

const ACCELERATION = 300;
const MAX_SPEED = 600;
const TURN_SPEED = Math.PI * 2;
/** The ship keeps 96% of its speed every 1/50 s without thrust. */
const DRAG_PER_SECOND = Math.pow(0.96, 50);
const BULLET_SPEED = 700;
const BULLET_LIFE = 2;
const FIRE_INTERVAL = 0.15;
const AIM_DEADZONE = 48;
export const MAX_BULLETS = 20;
export const MAX_PARTICLES = 320;
const BURST = 24;

export interface Rect { left: number; top: number; right: number; bottom: number }

export interface Controls {
  thrust: boolean;
  /** -1 turns left, 1 turns right. Ignored while aiming. */
  turn: number;
  fire: boolean;
  /** A held pointer: the ship turns toward it, flies toward it and fires. */
  aim?: { x: number; y: number };
}

export interface Bullet { active: boolean; x: number; y: number; px: number; py: number; vx: number; vy: number; age: number }
export interface Particle { active: boolean; x: number; y: number; vx: number; vy: number; age: number; life: number; tone: number }

export interface World {
  width: number;
  height: number;
  ship: { x: number; y: number; vx: number; vy: number; angle: number; thrusting: boolean };
  bullets: Bullet[];
  particles: Particle[];
  cooldown: number;
  seed: number;
}

/** Called with each bullet's path this step. Returns true when the path hit a target. */
export type HitTest = (x0: number, y0: number, x1: number, y1: number) => boolean;
/** The ship left the screen on one side. The page may scroll before the ship reappears opposite. */
export type Wrap = (dx: -1 | 0 | 1, dy: -1 | 0 | 1) => void;

export function createWorld(width: number, height: number, seed = 1): World {
  return {
    width, height,
    // Near the top-left corner, pointing down into the page: clear of the content, the score bar
    // and the companion in a bottom corner. Small screens keep it inside.
    ship: { x: Math.min(100, width / 2), y: Math.min(100, height / 2), vx: 0, vy: 0, angle: Math.PI / 2, thrusting: false },
    bullets: Array.from({ length: MAX_BULLETS }, () => ({ active: false, x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0, age: 0 })),
    particles: Array.from({ length: MAX_PARTICLES }, () => ({ active: false, x: 0, y: 0, vx: 0, vy: 0, age: 0, life: 1, tone: 0 })),
    cooldown: 0,
    seed,
  };
}

/** A small deterministic generator, so tests can replay a run exactly. */
function random(world: World) {
  world.seed = (world.seed * 1664525 + 1013904223) >>> 0;
  return world.seed / 4294967296;
}

function wrapAngle(angle: number) {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

export function burst(world: World, x: number, y: number, count = BURST) {
  for (const particle of world.particles) {
    if (count <= 0) return;
    if (particle.active) continue;
    const angle = random(world) * Math.PI * 2;
    const speed = 60 + random(world) * 260;
    particle.active = true;
    particle.x = x;
    particle.y = y;
    particle.age = 0;
    particle.tone = Math.floor(random(world) * 3);
    particle.vx = Math.cos(angle) * speed;
    particle.vy = Math.sin(angle) * speed;
    particle.life = 0.45 + random(world) * 0.5;
    count--;
  }
}

function fire(world: World) {
  const { ship } = world;
  // Reuse the oldest bullet when every slot is in flight.
  let slot = world.bullets[0];
  for (const bullet of world.bullets) {
    if (!bullet.active) { slot = bullet; break; }
    if (bullet.age > slot.age) slot = bullet;
  }
  const nose = 15;
  slot.active = true;
  slot.age = 0;
  slot.x = slot.px = ship.x + Math.cos(ship.angle) * nose;
  slot.y = slot.py = ship.y + Math.sin(ship.angle) * nose;
  slot.vx = Math.cos(ship.angle) * BULLET_SPEED + ship.vx;
  slot.vy = Math.sin(ship.angle) * BULLET_SPEED + ship.vy;
}

export function step(world: World, controls: Controls, dt: number, hit: HitTest, wrap?: Wrap) {
  const { ship } = world;
  let thrust = controls.thrust;
  if (controls.aim) {
    const dx = controls.aim.x - ship.x;
    const dy = controls.aim.y - ship.y;
    const turn = wrapAngle(Math.atan2(dy, dx) - ship.angle);
    const limit = TURN_SPEED * dt;
    ship.angle = wrapAngle(ship.angle + Math.max(-limit, Math.min(limit, turn)));
    thrust = Math.hypot(dx, dy) > AIM_DEADZONE;
  } else if (controls.turn) {
    ship.angle = wrapAngle(ship.angle + Math.sign(controls.turn) * TURN_SPEED * dt);
  }
  ship.thrusting = thrust;
  if (thrust) {
    ship.vx += Math.cos(ship.angle) * ACCELERATION * dt;
    ship.vy += Math.sin(ship.angle) * ACCELERATION * dt;
    const speed = Math.hypot(ship.vx, ship.vy);
    if (speed > MAX_SPEED) {
      ship.vx *= MAX_SPEED / speed;
      ship.vy *= MAX_SPEED / speed;
    }
  } else {
    const drag = Math.pow(DRAG_PER_SECOND, dt);
    ship.vx *= drag;
    ship.vy *= drag;
  }
  ship.x += ship.vx * dt;
  ship.y += ship.vy * dt;
  const sideX = ship.x > world.width ? 1 : ship.x < 0 ? -1 : 0;
  const sideY = ship.y > world.height ? 1 : ship.y < 0 ? -1 : 0;
  if (sideX || sideY) {
    if (sideX) ship.x = sideX > 0 ? 0 : world.width;
    if (sideY) ship.y = sideY > 0 ? 0 : world.height;
    wrap?.(sideX, sideY);
  }

  world.cooldown = Math.max(0, world.cooldown - dt);
  if ((controls.fire || controls.aim) && world.cooldown === 0) {
    fire(world);
    world.cooldown = FIRE_INTERVAL;
  }

  for (const bullet of world.bullets) {
    if (!bullet.active) continue;
    bullet.age += dt;
    if (bullet.age > BULLET_LIFE) { bullet.active = false; continue; }
    bullet.px = bullet.x;
    bullet.py = bullet.y;
    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;
    // A bullet that wraps starts a fresh path on the far side instead of crossing the screen.
    if (bullet.x > world.width) bullet.x = bullet.px = 0;
    else if (bullet.x < 0) bullet.x = bullet.px = world.width;
    if (bullet.y > world.height) bullet.y = bullet.py = 0;
    else if (bullet.y < 0) bullet.y = bullet.py = world.height;
    if (hit(bullet.px, bullet.py, bullet.x, bullet.y)) {
      bullet.active = false;
      burst(world, bullet.x, bullet.y);
    }
  }

  for (const particle of world.particles) {
    if (!particle.active) continue;
    particle.age += dt;
    if (particle.age > particle.life) { particle.active = false; continue; }
    const slow = Math.pow(0.08, dt);
    particle.vx *= slow;
    particle.vy *= slow;
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
  }
}

/**
 * Advance by a frame's real time in fixed steps. Returns the time left over for the next frame.
 * After a long stall, such as a hidden tab, it drops the backlog instead of fast-forwarding.
 */
export function advance(world: World, controls: Controls, carry: number, elapsed: number, hit: HitTest, wrap?: Wrap) {
  let time = carry + Math.min(elapsed, STEP * MAX_STEPS);
  let steps = 0;
  while (time >= STEP && steps < MAX_STEPS) {
    step(world, controls, STEP, hit, wrap);
    time -= STEP;
    steps++;
  }
  return steps === MAX_STEPS ? 0 : time;
}

/** Where the path from (x0, y0) to (x1, y1) enters `rect` grown by `pad`, as a fraction of the path, or -1. */
export function segmentEntry(x0: number, y0: number, x1: number, y1: number, rect: Rect, pad = 0) {
  const span = { enter: 0, exit: 1 };
  if (!clip(span, x0, x1 - x0, rect.left - pad, rect.right + pad)) return -1;
  if (!clip(span, y0, y1 - y0, rect.top - pad, rect.bottom + pad)) return -1;
  return span.enter;
}

/** Narrow the path's span to where it lies between `low` and `high` on one axis. */
function clip(span: { enter: number; exit: number }, start: number, delta: number, low: number, high: number) {
  if (delta === 0) return start >= low && start <= high;
  let near = (low - start) / delta;
  let far = (high - start) / delta;
  if (near > far) { const swap = near; near = far; far = swap; }
  if (near > span.enter) span.enter = near;
  if (far < span.exit) span.exit = far;
  return span.enter <= span.exit;
}

export interface Candidate {
  depth: number;
  rects: Rect[];
  /** Stacking: content in fixed, sticky or raised layers is drawn over the page below it. */
  layer?: number;
  dead?: boolean;
}

/** Positive when `a` should take the shot over `b`: higher layer, then nested deeper. */
function outranks(a: Candidate, b: Candidate) {
  return (a.layer ?? 0) - (b.layer ?? 0) || a.depth - b.depth;
}

/**
 * Bucket target boxes into a grid so each bullet checks only the boxes near its path.
 * Boxes that span many cells, such as page backgrounds, go on a short list checked every time.
 */
export class TargetGrid<T extends Candidate> {
  private cells = new Map<number, T[]>();
  private wide: T[] = [];
  private seen = new Set<T>();
  private size: number;
  private maxCells: number;

  constructor(size = 96, maxCells = 64) {
    this.size = size;
    this.maxCells = maxCells;
  }

  private key(column: number, row: number) {
    return (column + 1024) * 4096 + (row + 1024);
  }

  build(targets: T[]) {
    this.cells.clear();
    this.wide = [];
    for (const target of targets) {
      for (const rect of target.rects) {
        const left = Math.floor(rect.left / this.size);
        const right = Math.floor(rect.right / this.size);
        const top = Math.floor(rect.top / this.size);
        const bottom = Math.floor(rect.bottom / this.size);
        if ((right - left + 1) * (bottom - top + 1) > this.maxCells) {
          if (!this.wide.includes(target)) this.wide.push(target);
          continue;
        }
        for (let column = left; column <= right; column++) {
          for (let row = top; row <= bottom; row++) {
            const key = this.key(column, row);
            const cell = this.cells.get(key);
            if (!cell) this.cells.set(key, [target]);
            else if (cell[cell.length - 1] !== target) cell.push(target);
          }
        }
      }
    }
  }

  /**
   * The live target the path touches that is drawn on top: the highest layer, then the deepest
   * nested element. Ties go to the one the path reaches first.
   */
  query(x0: number, y0: number, x1: number, y1: number, pad = 0): T | undefined {
    const seen = this.seen;
    seen.clear();
    let best: T | undefined;
    let bestEntry = Infinity;
    const consider = (target: T) => {
      if (target.dead || seen.has(target)) return;
      seen.add(target);
      const rank = best ? outranks(target, best) : 1;
      if (rank < 0) return;
      for (const rect of target.rects) {
        const entry = segmentEntry(x0, y0, x1, y1, rect, pad);
        if (entry < 0) continue;
        if (rank > 0 || entry < bestEntry) {
          best = target;
          bestEntry = entry;
        }
        return;
      }
    };
    const left = Math.floor((Math.min(x0, x1) - pad) / this.size);
    const right = Math.floor((Math.max(x0, x1) + pad) / this.size);
    const top = Math.floor((Math.min(y0, y1) - pad) / this.size);
    const bottom = Math.floor((Math.max(y0, y1) + pad) / this.size);
    for (let column = left; column <= right; column++) {
      for (let row = top; row <= bottom; row++) {
        const cell = this.cells.get(this.key(column, row));
        if (cell) for (const target of cell) consider(target);
      }
    }
    for (const target of this.wide) consider(target);
    return best;
  }
}
