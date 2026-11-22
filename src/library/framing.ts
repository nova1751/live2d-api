export interface Camera { scale: number; x: number; y: number }
const authored: Camera = { scale: 1, x: 0, y: 0 };
const size = 96;

// Measure completed frames at a wider field of view so long accessories are included.
export function createFraming() {
  const initial = { scale: 0.65, x: 0, y: 0 };
  const sample = document.createElement('canvas');
  sample.width = sample.height = size;
  const ctx = sample.getContext('2d', { willReadFrequently: true });
  let attempts = 0, frames = 0;
  let left = size, top = size, right = 0, bottom = 0;
  return { initial, measure(canvas: HTMLCanvasElement): Camera | undefined {
    if (!ctx) return authored;
    attempts++;
    let visible = 0;
    try {
      ctx.clearRect(0, 0, size, size);
      ctx.drawImage(canvas, 0, 0, size, size);
      const { data } = ctx.getImageData(0, 0, size, size);
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        if (data[(y * size + x) * 4 + 3] < 16) continue;
        visible++;
        left = Math.min(left, x); top = Math.min(top, y);
        right = Math.max(right, x + 1); bottom = Math.max(bottom, y + 1);
      }
    } catch { return authored; }
    if (visible >= 16) frames++;
    if (frames < 2 && attempts < 8) return;
    if (!frames) return authored;
    const zoom = Math.min(0.86 * size / Math.max(right - left, bottom - top), 3 / initial.scale);
    return { scale: initial.scale * zoom, x: (0.5 - (left + right) / (2 * size)) * zoom,
      y: (0.5 - (top + bottom) / (2 * size)) * zoom };
  } };
}
export type Framing = ReturnType<typeof createFraming>;
