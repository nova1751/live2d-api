/**
 * Pan and zoom arithmetic for the expanded viewer (runtime/expand.ts). The viewer moves the
 * character itself instead of scrolling a larger page, so the drawn surface can stay fixed to the
 * screen at one resolution while the character is zoomed and dragged across it.
 */
export interface Point { x: number; y: number }
export interface Rect { left: number; top: number; width: number; height: number }

/**
 * Like an image viewer: a character box that fits the view moves freely but stays inside it, and
 * one larger than the view keeps covering it, so dragging never leaves the screen mostly empty.
 * `box` is where the character is now, with `pan` applied; returns the nearest allowed pan.
 */
export function clampPan(pan: Point, box: Rect, view: Rect): Point {
  const axis = (offset: number, start: number, size: number, viewStart: number, viewSize: number) => {
    const base = start - offset;
    const ends = [viewStart - base, viewStart + viewSize - size - base];
    return Math.min(Math.max(...ends), Math.max(Math.min(...ends), offset));
  };
  return {
    x: axis(pan.x, box.left, box.width, view.left, view.width),
    y: axis(pan.y, box.top, box.height, view.top, view.height),
  };
}

/**
 * The pan that keeps the point under `anchor` in place after a zoom. `before` and `after` are the
 * character box before and after the new zoom was laid out, both measured with `pan` applied.
 */
export function anchoredPan(pan: Point, before: Rect, after: Rect, anchor: Point): Point {
  if (!before.width || !before.height) return pan;
  const x = after.left + (anchor.x - before.left) * after.width / before.width;
  const y = after.top + (anchor.y - before.top) * after.height / before.height;
  return { x: pan.x - (x - anchor.x), y: pan.y - (y - anchor.y) };
}

/**
 * Velocity in px/ms from recent pointer samples, ignoring ones older than `windowMs`, and capped
 * at `max` so a hasty flick glides a few hundred pixels rather than across the whole character.
 */
export function releaseVelocity(samples: readonly (Point & { t: number })[], windowMs = 100, max = 2.5): Point {
  const last = samples[samples.length - 1];
  if (!last) return { x: 0, y: 0 };
  const first = samples.find(sample => last.t - sample.t <= windowMs) ?? last;
  const dt = last.t - first.t;
  if (!(dt > 0)) return { x: 0, y: 0 };
  const x = (last.x - first.x) / dt, y = (last.y - first.y) / dt;
  const scale = Math.min(1, max / (Math.hypot(x, y) || 1));
  return { x: x * scale, y: y * scale };
}

/** One step of an inertial glide: velocity decays exponentially with time constant `tauMs`. */
export function glide(velocity: Point, dtMs: number, tauMs = 325) {
  const decay = Math.exp(-dtMs / tauMs);
  // The distance covered while decaying over the step, not velocity * dt.
  const travel = tauMs * (1 - decay);
  return { move: { x: velocity.x * travel, y: velocity.y * travel }, velocity: { x: velocity.x * decay, y: velocity.y * decay } };
}
