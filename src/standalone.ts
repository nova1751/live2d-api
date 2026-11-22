import { createRenderer, type LegacyScript } from './renderer';

const script = document.currentScript as LegacyScript | null;
if (!script?.acceptCubism2) {
  const base = new URL('.', script?.src || document.baseURI).href;
  window.loadlive2d = createRenderer(base, window.loadlive2d);
}
