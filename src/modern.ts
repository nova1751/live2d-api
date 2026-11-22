import { createLive2D, OFFICIAL_CUBISM_CORE_URL, type Live2DInstance } from 'live2d-web';

import { readActions, bindInteractions } from './modern/interactions';
import type { DialogueSource } from './library/catalog';

export async function mountModern(canvas: HTMLCanvasElement, src: string, coreUrl: string | undefined, signal: AbortSignal, dialogue?: DialogueSource) {
  signal.throwIfAborted();
  if (!(canvas instanceof HTMLCanvasElement)) throw new Error('Missing Live2D canvas');
  // Keep the original canvas and its CSS dimensions. WebGL 1 and 2 cannot share a canvas.
  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'display:inline-block;position:relative;vertical-align:top;line-height:0';
  const host = document.createElement('div');
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
    const { actions, src: model, resolveAsset } = await readActions(src, dialogue, signal);
    signal.throwIfAborted();
    stage = await createLive2D({ container: host, src: model, resolveAsset, coreUrl: coreUrl || OFFICIAL_CUBISM_CORE_URL,
      fit: 'full', followPointer: true, signal, onError: error => console.error('[Live2D]', error) });
    signal.throwIfAborted();
    const instance = stage;
    const stopInteraction = bindInteractions(host, instance, actions, signal);
    return {
      pause: () => { stopInteraction(); instance.pause(); },
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
