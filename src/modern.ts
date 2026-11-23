import { createLive2D, OFFICIAL_CUBISM_CORE_URL, type Live2DInstance } from 'live2d-web';

import { cubismWebGL } from 'live2d-web/backends/cubism-webgl';
import type { Live2DBackend, ModelHandle, StageHandle } from 'live2d-web';
import type { Camera, Framing } from './library/framing';
import { readActions, bindInteractions } from './modern/interactions';
import type { DialogueSource, GameCue } from './library/catalog';

export async function mountModern(canvas: HTMLCanvasElement, src: string, coreUrl: string | undefined, signal: AbortSignal, dialogue?: DialogueSource, framing?: Framing, onPaint?: (canvas: HTMLCanvasElement) => void, cues?: Record<string, GameCue>, randomTap = false) {
  signal.throwIfAborted();
  if (!(canvas instanceof HTMLCanvasElement)) throw new Error('Missing Live2D canvas');
  // Keep the original canvas and its CSS dimensions. WebGL 1 and 2 cannot share a canvas.
  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'display:inline-block;position:relative;vertical-align:top;line-height:0';
  const host = document.createElement('div');
  host.className = 'waifu-model-stage';
  host.style.cssText = 'position:absolute;inset:0;cursor:grab';
  const visibility = canvas.style.visibility;
  canvas.before(wrapper);
  wrapper.append(canvas, host);
  canvas.style.visibility = 'hidden';
  let stage: Live2DInstance | undefined;
  function cleanup() {
    stage?.dispose();
    if (wrapper.contains(canvas)) {
      wrapper.replaceWith(canvas);
      canvas.style.visibility = visibility;
    }
    signal.removeEventListener('abort', cleanup);
  }
  signal.addEventListener('abort', cleanup, { once: true });
  try {
    const { actions, idleFiles, src: model, resolveAsset } = await readActions(src, dialogue, signal, cues, randomTap);
    signal.throwIfAborted();
    let graphics: StageHandle | undefined;
    let modelHandle: ModelHandle | undefined;
    const backend: Live2DBackend | undefined = (framing || onPaint) && { ...cubismWebGL, createStage(element, options) {
      return graphics = cubismWebGL.createStage(element, options);
    }, async loadModel(stage, url, options) {
      return modelHandle = await cubismWebGL.loadModel(stage, url, options);
    } };
    const fit = (camera: Camera) => ({ scale: camera.scale / 2, offsetX: camera.x,
      offsetY: camera.y - 0.5, units: 'stage' as const });
    stage = await createLive2D({ container: host, src: model, resolveAsset, coreUrl: coreUrl || OFFICIAL_CUBISM_CORE_URL,
      backend, fit: framing ? fit(framing.initial) : 'full', followPointer: true, signal, onError: error => console.error('[Live2D]', error) });
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
          if (camera) { framing = undefined; instance.setFit(fit(camera)); }
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
      const bounds = output.getBoundingClientRect();
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
    const interaction = bindInteractions(host, instance, actions, signal, idleFiles, hitVisible);
    window.dispatchEvent(new CustomEvent('live2d:motions', { detail: actions.map(({group,index,sound})=>({group,index,voiced:!!sound})) }));
    return {
      playMotion: interaction.playMotion,
      pause: () => { interaction.stop(); instance.pause(); },
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
