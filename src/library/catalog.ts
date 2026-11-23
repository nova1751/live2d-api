export type WidgetLocale = 'zh-CN' | 'en';
export interface ModelSource { baseUrl: string; packs?: { baseUrl: string; directories: string[] }[] }
export interface GameCue { sound?: string; caption?: string; captionEn?: string }
export interface GalleryEntry { name: string; en?: string; outfit: string; outfitEn?: string; date?: number; portrait?: string }
export interface ModelVariant { collectionDefault?: boolean; cues?: Record<string, GameCue>; files?: Record<string,string|null>; source: string; manifest?: string; dialogue?: string; soundAliases?: Record<string, string> }
export interface ModelCatalog {
  schemaVersion: 1;
  gallery?: Record<string, GalleryEntry>;
  legacyIds?: string[][];
  sources: Record<string, ModelSource>;
  models: Record<string, ModelVariant[]>;
  presentation?: { labels: Record<string,string>; captions: Record<string,string>; aliases: Record<string,string>; en?: { labels: Record<string,string>; captions: Record<string,string> }; outfitOrder?: Record<string, number> };
  audio?: Record<string, string[]>;
}
export interface DialogueSource { url: string; captions?: Record<string,string>; audio: ReadonlyMap<string, string> }

export type Collection = 'girls-frontline' | 'azur-lane' | 'bang-dream' | 'houkai2' | 'iron-saga' | 'warship-girls' | 'baoshi-yanwuyu';
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

export type LoadedModelCatalog = Awaited<ReturnType<typeof loadModelCatalog>>;

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
  // Community transcriptions are keyed by exact recording. Prefer catalog-provided translations.
  const captions = collection === 'girls-frontline' && locale !== 'en' ? {
    'G11_0|LOADING':'唔，再让我睡会儿～','G11_0|TIP':'这个……了解一下哦。',
    'G41|MOOD1':'啊哈哈哈。','LEWIS|AGREE':'好，好。','RFB|AGREE':'好！',
    'RFB|APPRECIATE':'好厉害！','SAT8|MOOD2':'诶，等、等一下！','VECTOR|MOOD2':'啊！',
    ...localized?.captions
  } : localized?.captions;
  const visibleId = (id: string) => {
    const alias = presentation?.aliases[id];
    return alias && available.includes(alias) ? alias : id;
  };
  const ids = collection === 'girls-frontline' ? orderCollection(available.filter(id => visibleId(id) === id), presentation?.outfitOrder ?? {}) : available;
  function resolve(id: string, source?: string) {
    if (collection && !available.includes(id)) throw new Error('Model outside the selected collection: ' + id);
    const variants = catalog.models[id] ?? [];
    const preferred = !source && collection && variants.find(item => item.collectionDefault && item.manifest);
    const asset = preferred || variants.find(item => item.manifest && (!source || item.source === source));
    if (!asset?.manifest) throw new Error('No model manifest for ' + id);
    const base = new URL(catalog.sources[asset.source].baseUrl, response.url || url);
    if (url.hostname === 'cdn.jsdmirror.com' && base.hostname === 'cdn.jsdelivr.net' &&
        base.pathname.startsWith('/gh/nova1751/live2d-api@cdn-')) base.hostname = url.hostname;
    const packs = base.hostname === 'raw.githubusercontent.com' ? catalog.sources[asset.source].packs : undefined;
    const assetUrl = (path: string) => {
      const pack = packs?.find(p => p.directories.some(dir => path.startsWith(dir + '/')));
      const target = new URL(path.split('/').map(encodeURIComponent).join('/'), pack?.baseUrl ?? base);
      if (pack && url.hostname === 'cdn.jsdmirror.com' && target.hostname === 'cdn.jsdelivr.net') target.hostname = url.hostname;
      return target.href;
    };
    let dialogue: DialogueSource | undefined;
    if (asset.dialogue) {
      let audio = audioBySource.get(asset.source);
      if (!audio) {
        audio = new Map((catalog.audio?.[asset.source] ?? []).map(path => [path.toUpperCase(), assetUrl(path)]));
        audioBySource.set(asset.source, audio);
      }
      dialogue = { captions: locale === 'en' ? undefined : captions, url: assetUrl(asset.dialogue), audio };
    }
    const cues = locale === 'en' && asset.cues ? Object.fromEntries(
      Object.entries(asset.cues).map(([group, cue]) => [group, { ...cue, caption: cue.captionEn || cue.caption }])
    ) : asset.cues;
    return { cues, files: asset.files, captions, modelUrl: assetUrl(asset.manifest), dialogue, soundAliases: asset.soundAliases };
  }
  return { url: url.href, collection, locale, ids, gallery: catalog.gallery, visibleId, labels: localized?.labels ?? {}, resolve, legacyIds: catalog.legacyIds };
}
