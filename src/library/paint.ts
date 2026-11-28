import { referenceSurface, type PaintSurface } from './framing';

// The floating widget and hosted previews keep a modest margin around the framed square. Only the
// expanded view, which owns the screen, draws on a surface fixed to it (runtime/expand.ts).
const compact: PaintSurface = { scale: 1.5, below: 0.5 };

let override: PaintSurface | undefined;
let framed = false;

/** The surface a framed model is drawn on right now. Renderers read it whenever they place one. */
export function paintSurface(): PaintSurface {
  return override ?? compact;
}

/** Whether the current model is framed, so it can be drawn on a surface other than its own box. */
export function isFramed() {
  return framed;
}

/**
 * Size the drawn surface for the current model and keep a framed character where it is on screen.
 * The CSS and the camera change in the same task, so the next frame shows both.
 */
export function applyPaintSurface(isFramed = framed) {
  const changed = framed !== isFramed;
  framed = isFramed;
  const widget = document.getElementById('waifu');
  if (!widget) return;
  // Models drawn to fill their whole surface, such as scenes, keep the reference square.
  const surface = framed ? paintSurface() : referenceSurface;
  // A placed surface is positioned by its owner; the CSS scale only sizes a centered one.
  widget.toggleAttribute('data-placed-surface', 'size' in surface);
  if ('scale' in surface) {
    widget.style.setProperty('--waifu-paint-scale', String(surface.scale));
    widget.style.setProperty('--waifu-paint-below', String(surface.below));
  }
  if (framed) window.loadlive2d?.reframe?.();
  // The expanded view places a surface for framed models only.
  if (changed && typeof Event === 'function') window.dispatchEvent(new Event('live2d:framed'));
}

/** Replace the default surface, for example with one fixed to the expanded view. */
export function overridePaintSurface(surface?: PaintSurface) {
  override = surface;
  applyPaintSurface();
}
