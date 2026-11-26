import { appendResource, loadDeadline, shareLoadClock } from './runtime/request';

type Render = Window['loadlive2d'];
export type LegacyScript = HTMLScriptElement & { acceptCubism2?: (renderer: Render) => void };
type ModernStage = Awaited<ReturnType<typeof import('./modern').mountModern>>;

export function isModern(url: URL) {
  return url.pathname.toLowerCase().endsWith('.model3.json');
}

export function createRenderer(base: string, legacy?: Render): Render {
  let pendingLegacy: Promise<Render> | undefined;
  let modernModule: Promise<typeof import('./modern')> | undefined;
  let importAttempt = 0;
  let loading: AbortController | undefined;
  let controller: AbortController | undefined;
  let stage: ModernStage | undefined;
  let generation = 0;
  let hidden = false;

  function fetchLegacy() {
    if (pendingLegacy) return pendingLegacy;
    const script: LegacyScript = document.createElement('script');
    script.src = base + 'live2d.min.js';
    script.acceptCubism2 = renderer => { legacy = renderer; };
    return pendingLegacy = appendResource(script, script.src).then(() => {
      if (!legacy) throw new Error('Missing Cubism 2 renderer: ' + script.src);
      return legacy;
    }).catch(error => { pendingLegacy = undefined; throw error; });
  }

  function fetchModern(signal: AbortSignal) {
    if (modernModule) return modernModule;
    const url = new URL('modern/renderer.mjs', base);
    if (importAttempt) url.searchParams.set('retry', String(importAttempt));
    // The browser remembers failed imports by URL for the lifetime of the page.
    const reset = () => {
      if (modernModule === pending) { modernModule = undefined; importAttempt++; }
    };
    const pending: Promise<typeof import('./modern')> = import(/* webpackIgnore: true */ /* @vite-ignore */ url.href)
      .catch(error => { reset(); throw error; })
      .finally(() => signal.removeEventListener('abort', reset));
    signal.addEventListener('abort', reset, { once: true });
    return modernModule = pending;
  }

  const start: Render = (canvas, model, options) => {
    const revision = ++generation;
    controller?.abort();
    controller = undefined;
    stage = undefined;
    hidden = false;
    const url = new URL(model, document.baseURI);
    if (!isModern(url)) {
      if (legacy) return legacy(canvas, model, options);
      return fetchLegacy().then(renderer => {
        if (generation !== revision || options?.signal?.aborted) return;
        const ready = renderer(canvas, model, options);
        if (hidden) renderer.hide?.();
        return ready;
      });
    }
    // A Cubism 3+ model takes the stage: free the Cubism 2 model's textures instead of only hiding it.
    if (legacy?.unload) legacy.unload(); else legacy?.hide?.();
    const lifecycle = controller = new AbortController();
    const { signal } = lifecycle;
    shareLoadClock(signal, options?.signal);
    const stop = () => lifecycle.abort(options?.signal?.reason);
    options?.signal?.addEventListener('abort', stop, { once: true });
    const present = options?.onPaint;
    let finishPaint: (() => void) | undefined;
    const abortPaint = () => finishPaint?.();
    const painted = present && new Promise<void>(resolve => {
      finishPaint = resolve;
      signal.addEventListener('abort', abortPaint, { once: true });
    });
    const onPaint = present && ((output: HTMLCanvasElement) => {
      present(output);
      finishPaint?.();
    });
    return fetchModern(signal).then(async module => {
      if (signal.aborted) return;
      const output = document.getElementById(canvas);
      if (!(output instanceof HTMLCanvasElement)) throw new Error('Missing Live2D canvas');
      const result: ModernStage = await module.mountModern(output, url.href, options?.coreUrl, signal, options?.dialogue, options?.framing, onPaint, options?.cues, options?.randomTap, options?.sceneAspect, { hidden: options?.hiddenDrawables, skipped: options?.skippedDrawables }, options?.files, options?.paint);
      if (signal.aborted) return;
      stage = result;
      if (hidden) stage.pause();
      await painted;
    }).catch(error => {
      if (!signal.aborted) { controller = undefined; lifecycle.abort(); throw error; }
    }).finally(() => {
      shareLoadClock(signal, undefined);
      signal.removeEventListener('abort', abortPaint);
      options?.signal?.removeEventListener('abort', stop);
    });
  };
  const render: Render = (canvas, model, options) => {
    render.cancelLoad?.();
    if (!options?.onPaint) return start(canvas, model, options);
    const attempt = loading = new AbortController();
    const { signal } = attempt;
    const cancelDeadline = loadDeadline(signal, () => attempt.abort(new Error('Timed out waiting for the first model frame')));
    let stop: () => void;
    const aborted = new Promise<never>((_, reject) => {
      stop = () => reject(signal.reason);
      signal.addEventListener('abort', stop, { once: true });
    });
    const painted = Promise.resolve().then(() => {
      if (!signal.aborted) return start(canvas, model, { ...options, signal });
    });
    return Promise.race([aborted, painted]).catch(error => {
      attempt.abort(error);
      throw error;
    }).finally(() => {
      cancelDeadline();
      signal.removeEventListener('abort', stop);
      if (loading === attempt) loading = undefined;
    });
  };
  render.cancelLoad = () => loading?.abort(new DOMException('Model load superseded', 'AbortError'));
  render.hide = () => { hidden = true; if (controller) stage?.pause(); else legacy?.hide?.(); };
  render.show = start => { hidden = false; if (controller) stage?.resume(); else legacy?.show?.(start); };
  render.prepareInteraction = () => !controller && !!legacy?.prepareInteraction?.();
  render.playMotion = (group, index) => !hidden && (controller ? !!stage?.playMotion(group, index) : !!legacy?.playMotion?.(group, index));
  render.onNextPaint = copy => hidden ? undefined : controller ? stage?.onNextPaint(copy) : legacy?.onNextPaint?.(copy);
  render.reframe = () => { if (controller) stage?.reframe(); else legacy?.reframe?.(); };
  render.capture = () => { if (controller) stage?.capture(); return !!controller; };
  return render;
}
