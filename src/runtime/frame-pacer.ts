/**
 * Decides, once per animation frame, whether to draw a Live2D frame.
 *
 * Draws land on every n-th display refresh, so frames are evenly spaced at any refresh rate:
 * 60, 75, 90, 100 and 120 Hz draw every refresh, 144 Hz every second (72 fps), 240 Hz every
 * second (120 fps), 320 and 360 Hz every third. A fixed 60 fps deadline instead alternates
 * between one and two (or two and three) refreshes there, which shows as judder.
 *
 * `maxFps` caps the rate. When drawn frames keep arriving late, because the device cannot keep up,
 * the pacer draws on fewer refreshes, but only while that still leaves at least `minFps`: 144 Hz
 * may step from 72 to 48 fps, but a 60 Hz display never locks to 30, where an occasional missed
 * frame looks smoother than half the rate. It probes back up after a smooth stretch, waiting
 * longer after each failed probe. Long gaps, such as a hidden tab, are ignored.
 */
export function createFramePacer(maxFps = defaultMaxFps(), minFps = 45) {
  let last = NaN, period = 0, rejected = 0, lastDraw = -Infinity;
  let slower = 0, draws = 0, late = 0, calm = 0, patience = 5, probing = false;
  return (now: number) => {
    const delta = now - last;
    last = now;
    if (delta > 0 && delta < 100) {
      // Estimate the refresh period from typical gaps. Missed refreshes are longer gaps and are
      // skipped, unless they persist, as after moving the window to a slower display.
      if (!period || delta < period * 0.75) { period = delta; rejected = 0; }
      else if (delta < period * 1.5) { period += (delta - period) * 0.05; rejected = 0; }
      else if (++rejected > 30) { period = delta; rejected = 0; }
    }
    if (!period) { lastDraw = now; return true; }
    const n = Math.max(1, Math.ceil(1000 / maxFps / period - 0.05)) + slower;
    const gap = now - lastDraw;
    // Half a refresh of tolerance keeps whole-refresh steps despite timestamp jitter.
    if (gap < (n - 0.5) * period) return false;
    lastDraw = now;
    if (gap >= 100) return true;
    draws++;
    // Late by half a refresh, or half a target frame on very fast displays, where a fraction of a
    // millisecond of timing noise must not count as the device falling behind.
    if (gap > n * period + Math.max(period / 2, 500 / maxFps)) late++;
    if (draws < 120) return true;
    if (late > draws * 0.1 && 1000 / ((n + 1) * period) >= minFps) {
      slower++;
      // A probe that fails right away makes the next one wait twice as long.
      if (probing) patience = Math.min(patience * 2, 80);
      calm = 0;
    } else if (late <= draws * 0.02) {
      if (slower && ++calm >= patience) { slower--; calm = 0; probing = true; draws = late = 0; return true; }
    } else calm = 0;
    probing = false;
    draws = late = 0;
    return true;
  };
}

/** 120 fps on desktops; 90 on touch devices, so a 120 Hz phone saves power at 60 fps. */
export function defaultMaxFps() {
  return typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches ? 90 : 120;
}
