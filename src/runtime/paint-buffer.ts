/**
 * Largest drawing-buffer side for a paint surface, in device pixels. The expanded view sizes its
 * surface within it (runtime/expand.ts) and both renderers clamp their buffers to it. 6144 keeps a
 * full-screen surface at native resolution on 4K and 5K screens at any system scaling.
 */
export function maxPaintBuffer() {
  return typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches ? 2048 : 6144;
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
