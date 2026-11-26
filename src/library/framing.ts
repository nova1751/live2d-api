export interface Camera { scale: number; x: number; y: number }
const authored: Camera = { scale: 1, x: 0, y: 0 };
const size = 128;
type HitTest = (x: number, y: number) => readonly string[];

// Cinematic borders can appear when the camera backs out past the authored stage.
// Ignore an isolated, thin black strip touching both sides only for the fit measurement.
function omitLetterbox(pose: Uint8Array, rgba: Uint8ClampedArray, bottom: boolean) {
  const row = (i: number) => (bottom ? size - 1 - i : i) * size;
  let first = 0;
  while (first < size / 4 && !pose.subarray(row(first), row(first) + size).some(Boolean)) first++;
  let end = first;
  while (end < size / 4) {
    const start = row(end);
    let dark = 0;
    for (let x = 0; x < size; x++) {
      const i = start + x;
      if (pose[i] && Math.max(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]) < 24) dark++;
    }
    if (dark < size * 0.95 || !pose[start] || !pose[start + size - 1]) break;
    end++;
  }
  if (end === first || end - first > 4) return 0;
  for (let i = end; i < end + 2; i++) {
    if (pose.subarray(row(i), row(i) + size).some(Boolean)) return 0;
  }
  let removed = 0;
  for (let i = first; i < end; i++) {
    const strip = pose.subarray(row(i), row(i) + size);
    for (const alpha of strip) if (alpha) removed++;
    strip.fill(0);
  }
  return removed;
}

// Pixel coordinates in a low-resolution copy of the initial, wider view.
function quantile(bins: Float64Array, total: number, fraction: number) {
  let sum = 0;
  for (let i = 0; i < bins.length; i++) {
    sum += bins[i];
    if (sum > total * fraction) return i;
  }
  return bins.length - 1;
}

export function fitSilhouette(mask: Uint8Array, initial: Camera, hitTest?: HitTest, setAspect?: (ratio: number) => void, croppedPortrait = false): Camera {
  const columns = new Float64Array(size);
  const rows = new Float64Array(size);
  let top = size, bottom = 0, mass = 0;
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    const row = Math.floor(i / size);
    columns[i % size] += mask[i];
    rows[row] += mask[i];
    mass += mask[i];
    top = Math.min(top, row);
    bottom = Math.max(bottom, row + 1);
  }
  if (!mass) return authored;
  // A few detached particles high above the head can span half the canvas.
  // Trim at most 0.1% of the alpha mass there, retaining two sample rows of slack.
  top = Math.max(top, quantile(rows, mass, 0.001) - 2);
  const left = quantile(columns, mass, 0.001);
  const right = quantile(columns, mass, 0.999) + 1;
  // A sword tip can extend below a cropped thigh. Anchor the horizontal cut of the
  // figure when only a thin prop remains below it. Full-length figures keep their feet.
  if (croppedPortrait) {
    let tail = 0;
    for (let y = bottom - 1; y > Math.max(top + 2, bottom - (bottom - top) * 0.25); y--) {
      tail += rows[y];
      if (tail > mass * 0.035) break;
      let cut = 0;
      for (let x = left; x < right; x++) {
        if (mask[(y - 2) * size + x] >= 96 && mask[(y - 1) * size + x] >= 96 && mask[y * size + x] < 24) cut++;
      }
      if (cut >= Math.max(3, (right - left) * 0.18) && rows[y] < rows[y - 1] * 0.5) {
        bottom = y;
        break;
      }
    }
  }
  const width = right - left, height = bottom - top;
  // Both backends project onto a square. The visible viewport is its
  // bottom-centered subrectangle, so pointer and camera coordinates stay shared.
  const aspect = setAspect ? Math.max(0.35, Math.min(3, width / height * 0.93 / 0.94)) : 1;
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
    // Leave room below feet, but carry a portrait's cut edge through the viewport
    // so sampling error and small vertical motions cannot reveal a seam.
    y: 0.5 + (croppedPortrait ? 0.025 : -0.03) * viewHeight + (0.5 - bottom / size) * zoom,
  };
}

/**
 * The drawn surface around the reference square that a framed camera targets. It is `scale`
 * times the square's side, horizontally centered, with the fraction `below` of the extra height
 * under the square's bottom edge (0.5 centers it; 0 grows it only upwards and sideways).
 * Motions that zoom past the framed character stay visible within the extra margin.
 */
export interface PaintSurface { scale: number; below: number }
export const referenceSurface: PaintSurface = { scale: 1, below: 0.5 };

/** Place a camera framed for the reference square on a larger surface, unchanged on screen. */
export function onSurface(camera: Camera, { scale, below }: PaintSurface): Camera {
  return { scale: camera.scale / scale, x: camera.x / scale, y: (camera.y + (scale - 1) * (0.5 - below)) / scale };
}

export interface Framing {
  /** Camera for the measurement frames, applied to the drawn surface as it is. */
  initial: Camera;
  /** The settled camera for the reference square, once measured. Place it with `onSurface`. */
  measure(canvas: HTMLCanvasElement, hitTest?: HitTest, resizeSample?: (camera: Camera) => void): Camera | undefined;
}

export function createFraming(setAspect?: (ratio: number) => void, croppedPortrait = false): Framing {
  const initial = { scale: 0.65, x: 0, y: 0 };
  let sampleCamera = initial;
  const sample = document.createElement('canvas');
  sample.width = sample.height = size;
  const ctx = sample.getContext('2d', { willReadFrequently: true });
  const mask = new Uint8Array(size * size);
  const pose = new Uint8Array(mask.length);
  let frames = 0, nextSample = 0, firstSample: number | undefined;
  return { initial, measure(canvas, hitTest, resizeSample) {
    if (!ctx) return authored;
    const now = performance.now();
    if (now < nextSample) return;
    firstSample ??= now;
    try {
      ctx.clearRect(0, 0, size, size);
      ctx.drawImage(canvas, 0, 0, size, size);
      const { data } = ctx.getImageData(0, 0, size, size);
      // Some rigs fade a full-screen black layer out of their setup pose.
      // Keep the last character on screen until the new silhouette can be measured.
      const darkCorner = (i: number) => data[i + 3] > 3 && Math.max(data[i], data[i + 1], data[i + 2]) < 12;
      if ([0, 4 * (size - 1), 4 * size * (size - 1), data.length - 4].every(darkCorner) &&
          now - firstSample < 2400) {
        nextSample = now + 80;
        return;
      }
      nextSample = now + 80;
      let visible = 0;
      for (let i = 0; i < mask.length; i++) {
        const alpha = data[4 * i + 3];
        pose[i] = alpha >= 24 ? alpha : 0;
        if (pose[i]) visible++;
      }
      if (visible >= 16) {
        visible -= omitLetterbox(pose, data, false);
        visible -= omitLetterbox(pose, data, true);
      }
      if (visible >= 16) {
        // Measure the settled pose; some rigs briefly show their setup pose on load.
        mask.set(pose);
        frames++;
      }
    } catch { return authored; }
    if (frames < 3 && now - firstSample < 3200) return;
    if (frames && resizeSample && sampleCamera === initial) {
      for (let i = 0; i < size; i++) {
        if (Math.max(mask[i], mask[(size - 1) * size + i], mask[i * size], mask[i * size + size - 1]) < 96) continue;
        sampleCamera = { ...initial, scale: initial.scale * 0.6 };
        frames = 0;
        firstSample = now;
        resizeSample(sampleCamera);
        return;
      }
    }
    return frames ? fitSilhouette(mask, sampleCamera, hitTest, setAspect, croppedPortrait) : authored;
  } };
}

// Character bounds across a full idle loop on the 320px square reference view at scale 0.65.
// 7706's baton and the damaged outfit's flying effects move independently of the figure.
const subjectFrames: ReadonlyMap<string, readonly [number, number, number, number]> = new Map([
  ['doll/56-1type/7706/normal', [108, 152, 199, 267]],
  ['doll/56-1type/7706/destroy', [139, 103, 215, 189]],
]);

const croppedForms = new Set([
  'character/himeko/himeko', 'character/Kiana/Kiana', 'character/shin/shin', 'character/xier/xier',
  'character/madierda/base', 'npc/william/1/destroy',
]);

export function catalogFraming(id: string, setAspect?: (ratio: number) => void, croppedPortrait = false): Framing {
  const bounds = subjectFrames.get(id);
  if (!bounds) return createFraming(setAspect, croppedPortrait || croppedForms.has(id));
  const [left, top, right, bottom] = bounds;
  const width = right - left, height = bottom - top;
  const aspect = setAspect ? width / height : 1;
  setAspect?.(aspect);
  const zoom = Math.min(0.93 * 320 * Math.min(1, 1 / aspect) / height, 0.94 * 320 * Math.min(1, aspect) / width);
  const camera = {
    scale: 0.65 * zoom,
    x: (0.5 - (left + right) / 640) * zoom,
    y: 0.5 - 0.03 * Math.min(1, 1 / aspect) + (0.5 - bottom / 320) * zoom,
  };
  return { initial: camera, measure: () => camera };
}
