import type { WidgetOptions } from './widget.mjs';
import { scriptDirectory } from './distribution';

if (window.innerWidth >= 768) {
  const entry = new URL(import.meta.url);
  const collection = entry.searchParams.get('collection') ?? 'all';
  const baseUrl = scriptDirectory(entry.href);
  const runtime = new URL('widget.mjs', baseUrl);
  const { loadWidget }: typeof import('./widget.mjs') = await import(runtime.href);
  await loadWidget({
    collection: collection as WidgetOptions['collection'],
    switchBy: 'outfit',
    locale: entry.searchParams.get('lang') === 'en' ? 'en' : 'zh-CN',
    baseUrl,
  });
}
