import type { loadWidget, WidgetMode, WidgetPosition } from './widget.mjs';

const script = document.currentScript as HTMLScriptElement | null;
if (script && window.innerWidth >= 768) {
  const { mode, position } = script.dataset;
  // loadWidget also validates plain HTML and JavaScript input at runtime.
  import(new URL('widget.mjs', script.src).href)
    .then((module: { loadWidget: typeof loadWidget }) => module.loadWidget({
      mode: mode as WidgetMode | undefined,
      position: position as WidgetPosition | undefined,
    }))
    .catch(error => console.error('[Live2D]', error));
}
