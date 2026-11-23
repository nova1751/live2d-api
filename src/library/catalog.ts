export type WidgetLocale = 'zh-CN' | 'en';
export interface ModelSource { baseUrl: string }
export interface ModelVariant { source: string; manifest?: string; dialogue?: string; soundAliases?: Record<string, string> }
export interface ModelCatalog {
  schemaVersion: 1;
  legacyIds?: string[][];
  sources: Record<string, ModelSource>;
  models: Record<string, ModelVariant[]>;
  presentation?: { labels: Record<string,string>; captions: Record<string,string>; aliases: Record<string,string>; en?: { labels: Record<string,string>; captions: Record<string,string> }; outfitOrder?: Record<string, number> };
  audio?: Record<string, string[]>;
}
export interface DialogueSource { url: string; captions?: Record<string,string>; audio: ReadonlyMap<string, string> }

export type Collection = 'girls-frontline';
const categories = ['fairy', 'doll', 'adjutant', 'npc', 'squad', 'background'];
const forms = ['default', 'normal', 'destroy'];
function rank(list: string[], key: string) {
  const i = list.indexOf(key);
  return i < 0 ? list.length : i;
}

function orderCollection(ids: string[], outfits: Record<string, number>) {
  const natural = new Intl.Collator('en', { numeric: true });
  const rows = ids.map(id => {
    const [category, character, version, form] = id.split('/');
    const outfit = outfits[[category, character, version].join('/')];
    const order = version === 'base' ? -1 : outfit ?? (category === 'fairy' && /^\d+$/.test(version)
      ? Number(version) : Number.MAX_SAFE_INTEGER);
    return { id, category, character, version, form, order };
  });
  rows.sort((a, b) => rank(categories, a.category) - rank(categories, b.category) ||
    natural.compare(a.category, b.category) || natural.compare(a.character, b.character) ||
    a.order - b.order || natural.compare(a.version, b.version) ||
    rank(forms, a.form) - rank(forms, b.form) || natural.compare(a.form, b.form));
  return rows.map(row => row.id);
}

export async function loadModelCatalog(input: string | URL, collection?: Collection, locale: WidgetLocale = 'zh-CN') {
  const url = new URL(input, document.baseURI);
  const response = await fetch(url);
  if (!response.ok) throw new Error('Cannot load catalog: HTTP ' + response.status);
  const catalog: ModelCatalog = await response.json();
  if (catalog.schemaVersion !== 1 || !catalog.models || !catalog.sources) throw new Error('Unsupported model catalog');
  const audioBySource = new Map<string, Map<string, string>>();
  const available = Object.keys(catalog.models).filter(id => (!collection || !id.startsWith('other/')) && catalog.models[id].some(asset => asset.manifest));
  const presentation = collection ? catalog.presentation : undefined;
  const localized = locale === 'en' ? presentation?.en : presentation;
  const visibleId = (id: string) => {
    const alias = presentation?.aliases[id];
    return alias && available.includes(alias) ? alias : id;
  };
  const ids = collection ? orderCollection(available.filter(id => visibleId(id) === id), presentation?.outfitOrder ?? {}) : available;
  function resolve(id: string, source?: string) {
    if (collection && !available.includes(id)) throw new Error('Model outside the selected collection: ' + id);
    const asset = catalog.models[id]?.find(item => item.manifest && (!source || item.source === source));
    if (!asset?.manifest) throw new Error('No model manifest for ' + id);
    const base = new URL(catalog.sources[asset.source].baseUrl, response.url || url);
    if (url.hostname === 'cdn.jsdmirror.com' && base.hostname === 'cdn.jsdelivr.net' &&
        base.pathname.startsWith('/gh/nova1751/live2d-api@cdn-')) base.hostname = url.hostname;
    const assetUrl = (path: string) => new URL(path.split('/').map(encodeURIComponent).join('/'), base).href;
    let dialogue: DialogueSource | undefined;
    if (asset.dialogue) {
      let audio = audioBySource.get(asset.source);
      if (!audio) {
        audio = new Map((catalog.audio?.[asset.source] ?? []).map(path => [path.toUpperCase(), assetUrl(path)]));
        audioBySource.set(asset.source, audio);
      }
      dialogue = { captions: locale === 'en' ? undefined : localized?.captions, url: assetUrl(asset.dialogue), audio };
    }
    return { captions: localized?.captions, modelUrl: assetUrl(asset.manifest), dialogue, soundAliases: asset.soundAliases };
  }
  return { ids, visibleId, labels: localized?.labels ?? {}, resolve, legacyIds: catalog.legacyIds };
}
