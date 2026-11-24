import { loadWidget, type WidgetMode, type WidgetPosition, type WidgetOptions } from './widget.mjs';

import { scriptDirectory } from './distribution';

const script = document.currentScript as HTMLScriptElement | null;
if (script && window.innerWidth >= 768) {
  const { mode, position } = script.dataset;
  const params = new URL(script.src, document.baseURI).searchParams;
  const collection = params.get('collection');
  loadWidget({
    ...(collection !== null && { collection: collection as WidgetOptions['collection'] }),
    locale: (script.dataset.locale ?? params.get('lang')) === 'en' ? 'en' : 'zh-CN',
    baseUrl: scriptDirectory(script.src),
    catalogUrl: script.dataset.catalogUrl,
    modelId: script.dataset.modelId,
    modelBaseUrl: script.dataset.modelBaseUrl,
    modelUrl: script.dataset.modelUrl,
    coreUrl: script.dataset.coreUrl,
    mode: mode as WidgetMode | undefined,
    position: position as WidgetPosition | undefined,
  }).catch(error => console.error('[Live2D]', error));
}
