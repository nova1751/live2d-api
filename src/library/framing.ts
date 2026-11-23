export interface Camera { scale: number; x: number; y: number }
const authored: Camera = { scale: 1, x: 0, y: 0 };
const size = 128;
type HitTest = (x: number, y: number) => readonly string[];

// Pixel coordinates in a low-resolution copy of the initial, wider view.
function quantile(bins: Float64Array, total: number, fraction: number) {
  let sum = 0;
  for (let i = 0; i < bins.length; i++) {
    sum += bins[i];
    if (sum > total * fraction) return i;
  }
  return bins.length - 1;
}

export function fitSilhouette(mask: Uint8Array, initial: Camera, hitTest?: HitTest, setAspect?: (ratio: number) => void): Camera {
  const columns = new Float64Array(size);
  let top = size, bottom = 0, mass = 0;
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    const row = Math.floor(i / size);
    columns[i % size] += mask[i];
    mass += mask[i];
    top = Math.min(top, row);
    bottom = Math.max(bottom, row + 1);
  }
  if (!mass) return authored;
  // Keep the full vertical silhouette, including narrow shoes. Allow only the
  // sparsest horizontal tips of e.g. a long rifle to extend past the margins.
  const left = quantile(columns, mass, 0.001);
  const right = quantile(columns, mass, 0.999) + 1;
  const width = right - left, height = bottom - top;
  // Both backends project onto a square. The visible viewport is its
  // bottom-centered subrectangle, so pointer and camera coordinates stay shared.
  const aspect = setAspect ? Math.max(0.7, Math.min(1.9, width / height * 0.93 / 0.94)) : 1;
  setAspect?.(aspect);
  const viewWidth = Math.min(1, aspect), viewHeight = Math.min(1, 1 / aspect);
  const zoom = Math.min(0.93 * size * viewHeight / height, 0.94 * size * viewWidth / width, 5 / initial.scale);

  // Prefer the authored head/torso over a suitcase or companion. Probe only
  // solid points in the measured frame, once per switch, without firing input.
  let sumX = 0, hits = 0;
  if (hitTest) {
    for (let y = top + 2; y < bottom; y += 4) {
      for (let x = left + 2; x < right; x += 4) {
        if (mask[y * size + x] < 96) continue;
        const names = hitTest((x + 0.5) / size, (y + 0.5) / size);
        if (names.some(name => /^(head|face|body|bust|torso)\d*$/i.test(name))) {
          sumX += x + 0.5;
          hits++;
        }
      }
    }
  }
  const center = hits >= 3 ? sumX / hits : quantile(columns, mass, 0.5) + 0.5;
  const halfWidth = 0.475 * size * viewWidth / zoom;
  const centerX = Math.max(right - halfWidth, Math.min(left + halfWidth, center));
  return {
    scale: initial.scale * zoom,
    x: (0.5 - centerX / size) * zoom,
    y: 0.5 - 0.03 * viewHeight + (0.5 - bottom / size) * zoom,
  };
}

export function createFraming(setAspect?: (ratio: number) => void) {
  const initial = { scale: 0.65, x: 0, y: 0 };
  const sample = document.createElement('canvas');
  sample.width = sample.height = size;
  const ctx = sample.getContext('2d', { willReadFrequently: true });
  const mask = new Uint8Array(size * size);
  let attempts = 0, frames = 0, nextSample = 0;
  return { initial, measure(canvas: HTMLCanvasElement, hitTest?: HitTest): Camera | undefined {
    if (!ctx) return authored;
    const now = performance.now();
    if (now < nextSample) return;
    attempts++;
    try {
      ctx.clearRect(0, 0, size, size);
      ctx.drawImage(canvas, 0, 0, size, size);
      const { data } = ctx.getImageData(0, 0, size, size);
      let visible = 0;
      for (let i = 0; i < mask.length; i++) {
        const alpha = data[4 * i + 3];
        if (alpha < 24) continue;
        mask[i] = Math.max(mask[i], alpha);
        visible++;
      }
      if (visible >= 16) {
        frames++;
        nextSample = now + 80;
      }
    } catch { return authored; }
    if (frames < 3 && attempts < 10) return;
    return frames ? fitSilhouette(mask, initial, hitTest, setAspect) : authored;
  } };
}
export type Framing = ReturnType<typeof createFraming>;
