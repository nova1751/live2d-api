import { scriptDirectory } from './distribution';

// A module URL also identifies the adjacent runtime files on a GitHub CDN.
if (window.innerWidth >= 768) {
  const entry = new URL(import.meta.url);
  const baseUrl = scriptDirectory(entry.href);
  const locale = entry.searchParams.get('lang') === 'en' ? 'en' : 'zh-CN';
  if (entry.searchParams.has('collection')) {
    await import(new URL('collections.mjs' + entry.search, baseUrl).href);
  } else {
    const { loadGirlsFrontline }: typeof import('./widget.mjs') = await import(new URL('widget.mjs', baseUrl).href);
    await loadGirlsFrontline({ locale, baseUrl });
  }
}
