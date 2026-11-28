/**
 * Largest drawing-buffer side for a paint surface, in device pixels; both renderers clamp their
 * buffers to it. The expanded view draws on a square around the screen (runtime/expand.ts), and
 * 8192 holds that square at 2x on a 1440p screen and at native resolution on 4K and 5K screens.
 * On touch devices 3072 holds it at the screen's own ratio on a 3x phone (932 px tall) and a 2x
 * 12.9" tablet (1366 px), where 2048 left the full-screen character at about 2x and 1.5x.
 */
export function maxPaintBuffer() {
  return typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches ? 3072 : 8192;
}

/** Visible device pixels a desktop drawing buffer may hold: 4K at native resolution, 1440p at 2x. */
export const desktopPixelBudget = 16.8e6;

/**
 * Visible device pixels a touch device may draw: enough for a full-screen character on a 3x phone
 * (about 3.6M) and a 2x 12.9" tablet (about 5.6M) at their own ratio, so the widget and the
 * gallery, which are smaller, always are. live2d-web's phone default of 1.5M at 1.5x leaves the
 * character visibly soft on those screens. Frames that run long still lower the resolution
 * (modern.ts).
 */
export const touchPixelBudget = 6e6;

/**
 * The pixel ratio to aim for. Desktops render the floating widget and the expanded view at 2x or
 * more even on a 1x screen: the supersampled, mipmapped result is sharper than drawing at 1x.
 * Touch devices keep their own ratio to save power.
 */
export function targetPixelRatio(element: Element, width: number, height: number, coarse: boolean) {
  const ratio = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  return !coarse && (Math.max(width, height) <= 720 || element.closest('#waifu-expanded')) ? Math.max(ratio, 2) : ratio;
}

export interface Box { left: number; top: number; width: number; height: number }
export interface ResolutionLimits { maxResolution: number; pixelBudget: number; maxSide: number }

/** CSS pixels of `box` inside a `width` × `height` viewport; the whole box when it is off screen. */
export function visibleArea(box: Box, width: number, height: number) {
  const w = Math.max(1, box.width), h = Math.max(1, box.height);
  const x = Math.min(box.left + w, width) - Math.max(box.left, 0);
  const y = Math.min(box.top + h, height) - Math.max(box.top, 0);
  return x > 0 && y > 0 ? x * y : w * h;
}

/**
 * Drawing-buffer scale for a paint surface. The surface reaches past the screen edges so zooming
 * motions are not cut; only its visible part counts against the pixel budget, so the character on
 * screen renders at the display's own pixel ratio. `cap` is a visible-pixel count lowered when
 * frames run long. Never below 1: a stage cannot draw fewer pixels than CSS pixels.
 */
export function paintResolution(box: Box, view: { width: number; height: number }, devicePixelRatio: number,
  limits: ResolutionLimits, cap = Infinity) {
  const dpr = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  const visible = visibleArea(box, view.width, view.height);
  const side = Math.max(1, box.width, box.height);
  return Math.max(1, Math.min(dpr, limits.maxResolution, Math.sqrt(limits.pixelBudget / visible),
    Math.sqrt(cap / visible), limits.maxSide / side));
}
