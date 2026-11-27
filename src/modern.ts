import { createLive2D, isMobileViewport, OFFICIAL_CUBISM_CORE_URL, resolveAutoQualityPolicy,
  type Live2DInstance } from 'live2d-web';

import { cubismWebGL } from 'live2d-web/backends/cubism-webgl';
import type { Live2DBackend, ModelHandle, StageHandle } from 'live2d-web';
import { onSurface, referenceSurface, type Camera, type Framing, type PaintSurface } from './library/framing';
import { loadModernAssets, bindInteractions } from './modern/interactions';
import { loadCubismCore } from './modern/core';
import { createFramePacer } from './runtime/frame-pacer';
import { maxPaintBuffer, paintResolution, visibleArea } from './runtime/paint-buffer';
import type { DialogueSource, GameCue } from './library/catalog';

/** Catalog mesh lists: `hidden` meshes cut what is drawn below them, `skipped` meshes are not drawn. */
export interface DrawableEffects { hidden?: readonly string[]; skipped?: readonly string[] }

export async function mountModern(canvas: HTMLCanvasElement, src: string, coreUrl: string | undefined, signal: AbortSignal, dialogue?: DialogueSource, framing?: Framing, onPaint?: (canvas: HTMLCanvasElement) => void, cues?: Record<string, GameCue>, randomTap = false, sceneAspect?: number, drawables: DrawableEffects = {}, files?: Record<string, string | null>, paint: () => PaintSurface = () => referenceSurface) {
  signal.throwIfAborted();
  if (!(canvas instanceof HTMLCanvasElement)) throw new Error('Missing Live2D canvas');
  // Keep the original canvas and its CSS dimensions. WebGL 1 and 2 cannot share a canvas.
  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'display:inline-block;position:relative;vertical-align:top;line-height:0';
  const host = document.createElement('div');
  host.className = 'waifu-model-stage';
  host.style.cssText = 'position:absolute;inset:0;cursor:grab';
  // Scene rigs park scenery outside their Cubism artboard to animate it into view.
  // Fit into a viewport of the authored aspect so the GPU clips that scenery naturally.
  if (sceneAspect && sceneAspect > 0 && Number.isFinite(sceneAspect)) {
    host.classList.add('waifu-scene-artboard');
    Object.assign(host.style, {
      inset: 'auto auto 0 50%', transform: 'translateX(-50%)',
      width: Math.min(1, sceneAspect) * 100 + '%',
      height: Math.min(1, 1 / sceneAspect) * 100 + '%', overflow: 'hidden',
    });
  }
  const visibility = canvas.style.visibility;
  canvas.before(wrapper);
  wrapper.append(canvas, host);
  canvas.style.visibility = 'hidden';
  let stage: Live2DInstance | undefined;
  let stopSizing: (() => void) | undefined;
  function cleanup() {
    stopSizing?.();
    stage?.dispose();
    if (wrapper.contains(canvas)) {
      wrapper.replaceWith(canvas);
      canvas.style.visibility = visibility;
    }
    signal.removeEventListener('abort', cleanup);
  }
  signal.addEventListener('abort', cleanup, { once: true });
  try {
    const { interactions, src: model, resolveAsset } = loadModernAssets(src, dialogue, signal, cues, randomTap, files);
    signal.throwIfAborted();
    let graphics: StageHandle | undefined;
    let modelHandle: ModelHandle | undefined;
    // live2d-web's automatic quality only ever lowers the resolution. Opening the full-screen view
    // caps it to the pixel budget, and back in the small widget the model would stay blurry for
    // good. Size the drawing buffer here instead, in both directions.
    // live2d-web also treats every container under 768px as a phone, and the widget always is
    // one, so a high-DPI desktop would be capped at 1.5x. Keep phone limits for touch devices.
    // The paint margin for zooming motions makes the surface reach past the screen edges. Only its
    // visible part counts against the budget, so a full-screen or zoomed-in character renders at
    // the display's own pixel ratio; the buffer side has its own limit (runtime/paint-buffer.ts).
    const coarse = matchMedia('(pointer: coarse)').matches;
    const maxRes = Math.min(3, Math.max(2, devicePixelRatio || 2));
    const policy = resolveAutoQualityPolicy(coarse ? undefined
      : { desktopMaxResolution: maxRes, mobileMaxResolution: maxRes, mobilePixelBudget: 16.8e6, desktopPixelBudget: 16.8e6 });
    // Lowered when frames run long. Visible device pixels, so a smaller view can still render sharper.
    let pixelCap = Infinity;
    const shownPixels = () => visibleArea(host.getBoundingClientRect(), innerWidth, innerHeight);
    const targetResolution = (cap = pixelCap) => {
      const rect = host.getBoundingClientRect();
      const mobile = isMobileViewport(Math.max(1, rect.width), Math.max(1, rect.height));
      // 2x supersampling keeps fine line art razor-sharp in the small floating widget on 1x/1.25x/1.5x displays.
      const dpr = !coarse && Math.max(rect.width, rect.height) <= 720 ? Math.max(devicePixelRatio, 2) : devicePixelRatio;
      return Math.max(policy.minResolution, paintResolution(rect, { width: innerWidth, height: innerHeight }, dpr, {
        maxResolution: mobile ? policy.mobileMaxResolution : policy.desktopMaxResolution,
        pixelBudget: mobile ? policy.mobilePixelBudget : policy.desktopPixelBudget,
        maxSide: maxPaintBuffer(),
      }, cap));
    };
    let sizing = 0;
    const resizeBuffer = () => {
      if (sizing || signal.aborted) return;
      sizing = requestAnimationFrame(() => {
        sizing = 0;
        const next = targetResolution();
        if (graphics && !signal.aborted && Math.abs(next - graphics.getResolution()) > 0.01) graphics.setResolution(next);
      });
    };
    const resized = new ResizeObserver(resizeBuffer);
    resized.observe(host);
    // The pixel ratio changes when the window moves to another screen or the page is zoomed.
    let ratio: MediaQueryList | undefined;
    const watchRatio = () => {
      ratio?.removeEventListener('change', onRatio);
      ratio = matchMedia(`(resolution: ${devicePixelRatio}dppx)`);
      ratio.addEventListener('change', onRatio);
    };
    function onRatio() { watchRatio(); resizeBuffer(); }
    watchRatio();
    stopSizing = () => {
      resized.disconnect();
      ratio?.removeEventListener('change', onRatio);
      cancelAnimationFrame(sizing);
    };
    function watchFrames(stage: StageHandle) {
      let elapsed = 0, frames = 0, slow = 0, stableWindows = 0;
      stage.onFrame(delta => {
        // A gap this long is a pause or a hidden tab, not a slow frame.
        if (!(delta > 0 && delta < 250)) return;
        elapsed += delta;
        frames++;
        if (delta > policy.longFrameMs) slow++;
        if (elapsed < policy.sampleWindowMs) return;
        const current = stage.getResolution();
        const overloaded = slow / frames > policy.longFrameRatioThreshold;
        stableWindows = slow === 0 ? stableWindows + 1 : 0;
        if (overloaded && current > policy.minResolution) {
          const next = Math.max(policy.minResolution, Math.round((current - policy.resolutionStep) * 100) / 100);
          pixelCap = shownPixels() * next * next;
          stage.setResolution(next);
        } else if (stableWindows >= 4 && Number.isFinite(pixelCap)) {
          // Probe one step after sustained smooth rendering at the same viewport size.
          const wanted = targetResolution(Infinity);
          const next = Math.min(wanted, current + policy.resolutionStep);
          pixelCap = next >= wanted ? Infinity : shownPixels() * next * next;
          if (next > current) stage.setResolution(next);
          stableWindows = 0;
        }
        elapsed = frames = slow = 0;
      });
    }
    const { hidden: hiddenDrawables, skipped: skippedDrawables } = drawables;
    const custom = !!(framing || onPaint || hiddenDrawables?.length || skippedDrawables?.length);
    const backend: Live2DBackend = { ...cubismWebGL, createStage(element, options) {
      // Evenly spaced frames on whole display refreshes, up to 120 fps (runtime/frame-pacer.ts).
      const created = graphics = cubismWebGL.createStage(element, { ...options, pace: createFramePacer() });
      // Input uses the full camera, including any paint margin cropped at the screen edge.
      if (custom) created.toWorld = (x, y) => {
        const rect = element.getBoundingClientRect();
        return { x: x - rect.left, y: y - rect.top };
      };
      watchFrames(created);
      // A recovered stage starts from the initial resolution; bring it back to the current one.
      resizeBuffer();
      return created;
    }, async loadModel(stage, url, options) {
      return modelHandle = await cubismWebGL.loadModel(stage, url, { ...options, hiddenDrawables, skippedDrawables });
    } };
    // The measured camera for the reference square, placed on the current paint surface.
    let framed: Camera | undefined;
    const fit = (camera: Camera) => ({ scale: camera.scale / 2, offsetX: camera.x,
      offsetY: camera.y - 0.5, units: 'stage' as const });
    // The floating widget waits below the viewport until its first framed paint.
    const waitForFirstPaint = canvas.closest('body > #waifu[data-initial-framing]');
    // Runtime errors (lost WebGL context, a failing frame) stop the render loop. Recreate the
    // canvas a couple of times before giving up, instead of leaving a frozen or blank model.
    let recoveries = 0;
    const recover = (error: unknown) => {
      console.error('[Live2D]', error);
      if (signal.aborted || recoveries >= 2) return;
      const attempt = ++recoveries;
      setTimeout(() => {
        if (!signal.aborted) stage?.retry().catch(failure => console.error('[Live2D] Recovery failed', failure));
      }, 400 * attempt);
    };
    // A site-provided coreUrl is used as given. Otherwise prefer the official host, with a fallback.
    if (!coreUrl) await loadCubismCore(signal);
    signal.throwIfAborted();
    stage = await createLive2D({ container: host, src: model, resolveAsset, coreUrl: coreUrl || OFFICIAL_CUBISM_CORE_URL,
      pauseWhenOffscreen: !waitForFirstPaint, resolution: targetResolution(),
      backend, fit: framing ? fit(framing.initial) : 'full', followPointer: true, signal, onError: recover });
    signal.throwIfAborted();
    const instance = stage;
    const output = host.querySelector('canvas');
    if (graphics && output) {
      const unsubscribe = graphics.onFrame(() => queueMicrotask(() => {
        if (signal.aborted) return;
        if (framing) {
          const { width, height } = graphics!.getSize();
          const camera = framing.measure(output, (x, y) => modelHandle!.hitTest(x * width, y * height),
            wider => instance.setFit(fit(wider)));
          if (camera) {
            framing = undefined;
            framed = camera;
            instance.setFit(fit(onSurface(camera, paint())));
          }
          return;
        }
        unsubscribe();
        onPaint?.(output);
      }));
    }
    // Unnamed regions need a visible-pixel test while WebGL's drawing buffer still holds the frame.
    const pixel = randomTap && output && graphics ? document.createElement('canvas') : undefined;
    if (pixel) pixel.width = pixel.height = 1;
    const sample = pixel?.getContext('2d', { willReadFrequently:true });
    const hitVisible = sample && graphics && output ? (event: MouseEvent, onHit: () => void) => {
      const bounds = host.getBoundingClientRect();
      const x = Math.floor((event.clientX-bounds.left)*output.width/bounds.width);
      const y = Math.floor((event.clientY-bounds.top)*output.height/bounds.height);
      if (x < 0 || y < 0 || x >= output.width || y >= output.height) return;
      const unsubscribe = graphics!.onFrame(() => queueMicrotask(() => {
        unsubscribe();
        if (signal.aborted) return;
        sample.clearRect(0,0,1,1);
        sample.drawImage(output,x,y,1,1,0,0,1,1);
        if (sample.getImageData(0,0,1,1).data[3] > 16) onHit();
      }));
    } : undefined;
    let interaction: ReturnType<typeof bindInteractions> | undefined;
    void interactions.then(({ actions, idleFiles }) => {
      if (signal.aborted || !wrapper.contains(canvas)) return;
      interaction = bindInteractions(host, instance, actions, signal, idleFiles, hitVisible);
      window.dispatchEvent(new CustomEvent('live2d:motions', { detail: actions.map(({group,index,sound})=>({group,index,voiced:!!sound})) }));
    }).catch(error => { if (!signal.aborted) console.warn('[Live2D] Interactions unavailable', error); });
    return {
      reframe() { if (framed && !signal.aborted) instance.setFit(fit(onSurface(framed, paint()))); },
      playMotion: (group: string, index: number) => interaction?.playMotion(group, index) ?? false,
      onNextPaint(copy: (canvas: HTMLCanvasElement) => void) {
        if (!graphics || !output || signal.aborted) return;
        const unsubscribe = graphics.onFrame(() => {
          unsubscribe();
          queueMicrotask(() => { if (!signal.aborted) copy(output); });
        });
        return unsubscribe;
      },
      pause: () => { interaction?.stop(); instance.pause(); },
      resume: () => instance.resume(),
      capture() {
        requestAnimationFrame(() => {
          const output = host.querySelector('canvas');
          if (!output || signal.aborted) return;
          const link = document.createElement('a');
          link.download = 'photo.png';
          link.href = output.toDataURL('image/png');
          link.click();
        });
      },
    };
  } catch (error) {
    cleanup();
    throw error;
  }
}
