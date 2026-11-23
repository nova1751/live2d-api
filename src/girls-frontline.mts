import { loadGirlsFrontline } from './widget.mjs';

// A module URL also identifies the adjacent runtime files on a GitHub CDN.
if (window.innerWidth >= 768) {
  const locale = new URL(import.meta.url).searchParams.get('lang') === 'en' ? 'en' : 'zh-CN';
  loadGirlsFrontline({ locale, baseUrl: new URL('.', import.meta.url) })
    .catch(error => console.error('[Live2D]', error));
}
