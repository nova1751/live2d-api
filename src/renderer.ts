type Render = Window['loadlive2d'];
export type LegacyScript = HTMLScriptElement & { acceptCubism2?: (renderer: Render) => void };
type ModernStage = Awaited<ReturnType<typeof import('./modern').mountModern>>;

export function isModern(url: URL) {
  return url.pathname.toLowerCase().endsWith('.model3.json');
}

export function createRenderer(base: string, legacy?: Render): Render {
  let pendingLegacy: Promise<Render> | undefined;
  let controller: AbortController | undefined;
  let stage: ModernStage | undefined;
  let generation = 0;
  let hidden = false;

  function fetchLegacy() {
    return pendingLegacy ??= new Promise<Render>((resolve, reject) => {
      const script: LegacyScript = document.createElement('script');
      script.src = base + 'live2d.min.js';
      script.acceptCubism2 = renderer => { legacy = renderer; resolve(renderer); };
      script.onerror = () => reject(new Error('Failed to load ' + script.src));
      document.head.appendChild(script);
    }).catch(error => { pendingLegacy = undefined; throw error; });
  }

  const render: Render = (canvas, model, options) => {
    const revision = ++generation;
    controller?.abort();
    controller = undefined;
    stage = undefined;
    hidden = false;
    const url = new URL(model, document.baseURI);
    if (!isModern(url)) {
      if (legacy) return legacy(canvas, model, options);
      return fetchLegacy().then(renderer => {
        if (generation !== revision) return;
        renderer(canvas, model, options);
        if (hidden) renderer.hide?.();
      });
    }
    legacy?.hide?.();
    controller = new AbortController();
    const { signal } = controller;
    return import(/* webpackIgnore: true */ /* @vite-ignore */ base + 'modern/renderer.mjs').then(async module => {
      if (signal.aborted) return;
      const result: ModernStage = await module.mountModern(document.getElementById(canvas), url.href, options?.coreUrl, signal);
      if (signal.aborted) return;
      stage = result;
      if (hidden) stage.pause();
    }).catch(error => {
      if (!signal.aborted) { controller = undefined; throw error; }
    });
  };
  render.hide = () => { hidden = true; if (controller) stage?.pause(); else legacy?.hide?.(); };
  render.show = start => { hidden = false; if (controller) stage?.resume(); else legacy?.show?.(start); };
  render.prepareInteraction = () => !controller && !!legacy?.prepareInteraction?.();
  render.capture = () => { if (controller) stage?.capture(); return !!controller; };
  return render;
}
