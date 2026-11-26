import { referenceSurface, type PaintSurface } from './framing';

// The floating widget and hosted previews keep a modest margin around the framed square. Only the
// expanded view, which owns the screen, widens it to the whole view (runtime/expand.ts).
const compact: PaintSurface = { scale: 1.5, below: 0.5 };

let override: PaintSurface | undefined;
let framed = false;

/** The surface a framed model is drawn on right now. Renderers read it whenever they place one. */
export function paintSurface(): PaintSurface {
  return override ?? compact;
}

/**
 * Size the drawn surface for the current model and keep a framed character where it is on screen.
 * The CSS and the camera change in the same task, so the next frame shows both.
 */
export function applyPaintSurface(isFramed = framed) {
  framed = isFramed;
  const widget = document.getElementById('waifu');
  if (!widget) return;
  // Models drawn to fill their whole surface, such as scenes, keep the reference square.
  const surface = framed ? paintSurface() : referenceSurface;
  widget.style.setProperty('--waifu-paint-scale', String(surface.scale));
  widget.style.setProperty('--waifu-paint-below', String(surface.below));
  if (framed) window.loadlive2d?.reframe?.();
}

/** Replace the default surface, for example with one covering the expanded view. */
export function overridePaintSurface(surface?: PaintSurface) {
  override = surface;
  applyPaintSurface();
}
