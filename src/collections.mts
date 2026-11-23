import { loadWidget, type WidgetOptions } from './widget.mjs';

if (window.innerWidth >= 768) {
  const entry = new URL(import.meta.url);
  const collection = entry.searchParams.get('collection') ?? 'all';
  loadWidget({
    collection: collection as WidgetOptions['collection'],
    switchBy: 'outfit',
    locale: entry.searchParams.get('lang') === 'en' ? 'en' : 'zh-CN',
    baseUrl: new URL('.', entry),
  }).catch(error => console.error('[Live2D]', error));
}
