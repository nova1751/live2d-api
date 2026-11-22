import { loadWidget, type WidgetMode, type WidgetPosition } from './widget.mjs';

const script = document.currentScript as HTMLScriptElement | null;
if (script && window.innerWidth >= 768) {
  const { mode, position } = script.dataset;
  loadWidget({
    modelUrl: script.dataset.modelUrl,
    coreUrl: script.dataset.coreUrl,
    mode: mode as WidgetMode | undefined,
    position: position as WidgetPosition | undefined,
  }).catch(error => console.error('[Live2D]', error));
}
