import { loadGirlsFrontline } from './widget.mjs';

// A module URL also identifies the adjacent runtime files on a GitHub CDN.
if (window.innerWidth >= 768) {
  const entry = new URL(import.meta.url);
  const locale = entry.searchParams.get('lang') === 'en' ? 'en' : 'zh-CN';
  const ready = entry.searchParams.has('collection') ? import('./collections.mjs' + entry.search)
    : loadGirlsFrontline({ locale, baseUrl: new URL('.', entry) });
  ready
    .catch(error => console.error('[Live2D]', error));
}
