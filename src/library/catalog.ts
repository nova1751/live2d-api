import { withLoadTimeout } from '../runtime/request.ts';
import { fetchCdnAsset } from '../runtime/cdn.ts';

export type WidgetLocale = 'zh-CN' | 'en';
export interface ModelSource { baseUrl: string; packs?: { baseUrl: string; directories: string[] }[] }
export interface GameCue { sound?: string; caption?: string; captionEn?: string }
export interface GalleryEntry { name: string; en?: string; outfit: string; outfitEn?: string; date?: number; portrait?: string }
export interface ModelVariant {
  /** Meshes cut out of what is drawn below them: scene curtains, and backdrops behind the character. */
  hiddenDrawables?: string[];
  /** Meshes not drawn at all: vignettes, flashes and glows laid over the character. */
  skippedDrawables?: string[];
sceneAspect?: number; cueSource?: string; collectionDefault?: boolean; cues?: Record<string, GameCue>; files?: Record<string,string|null>; source: string; manifest?: string; dialogue?: string; soundAliases?: Record<string, string> }
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

export const collections = ['girls-frontline', 'azur-lane', 'bang-dream', 'houkai2', 'iron-saga', 'warship-girls', 'baoshi-yanwuyu'] as const;
export type Collection = typeof collections[number];
export type CollectionScope = Collection | 'all';
export function collectionCatalogUrl(libraryUrl: string, collection?: CollectionScope) {
  return !collection || collection === 'all' || collection === 'girls-frontline' ? libraryUrl
    : new URL('games/' + collection + '.json', libraryUrl).href;
}
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

export async function loadModelCatalog(input: string | URL, collection?: Collection, locale: WidgetLocale = 'zh-CN', assetCdn?: 'mainland') {
  const url = new URL(input, document.baseURI);
  return withLoadTimeout(async signal => {
    const response = await fetchCdnAsset(url.href, signal);
    if (!response.ok) throw new Error(`Cannot load catalog ${url.href} (HTTP ${response.status})`);
    const catalog: ModelCatalog = await response.json();
    return parseModelCatalog(catalog, url, collection, locale, response.url || url.href, assetCdn);
  });
}

export function parseModelCatalog(catalog: ModelCatalog, url: URL, collection?: Collection, locale: WidgetLocale = 'zh-CN', sourceBase = url.href, assetCdn?: 'mainland') {
  if (catalog.schemaVersion !== 1 || !catalog.models || !catalog.sources) throw new Error('Unsupported model catalog');
  const audioBySource = new Map<string, Map<string, string>>();
  const mainland = assetCdn === 'mainland' || url.hostname === 'cdn.jsdmirror.com';
  const mainlandPath = 'https://cdn.jsdmirror.com/gh/';
  function regionalUrl(href: string) {
    if (href.startsWith('/gh/')) return new URL(href, sourceBase).href;
    if (!mainland) return href;
    return href.replace(/^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([a-f\d]{40})\//i,
      mainlandPath + '$1/$2@$3/').replace(/^https:\/\/cdn\.jsdelivr\.net\/gh\//, mainlandPath);
  }
  const available = new Set(Object.keys(catalog.models).filter(id => (!collection || !id.startsWith('other/')) && catalog.models[id].some(asset => asset.manifest)));
  const hasModel = (id: string) => available.has(id);
  const presentation = collection ? catalog.presentation : undefined;
  const localized = locale === 'en' ? presentation?.en : presentation;
  // Community transcriptions are keyed by exact recording. Prefer catalog-provided translations.
  const captions = collection === 'girls-frontline' && locale !== 'en' ? {
    'G11_0|LOADING':'唔，再让我睡会儿～','G11_0|TIP':'这个……了解一下哦。',
    'G41|MOOD1':'啊哈哈哈。','LEWIS|AGREE':'好，好。','RFB|AGREE':'好！',
    'RFB|APPRECIATE':'好厉害！','SAT8|MOOD2':'诶，等、等一下！','VECTOR|MOOD2':'啊！',
    // Parenthesized sound descriptions are distinct from spoken dialogue.
    '98K|MOOD1':'（笑）','GENERALLIU|MOOD1':'（笑）','HK416|MOOD1':'（笑）',
    'LTLX7000|MOOD1':'（笑）','SPAS15|MOOD1':'（笑）','ZB26|MOOD1':'（笑）','G41|MOOD2':'（吃惊）',
    ...localized?.captions
  } : localized?.captions;
  const visibleId = (id: string) => {
    const alias = presentation?.aliases[id];
    return alias && hasModel(alias) ? alias : id;
  };
  const ids = collection === 'girls-frontline' ? orderCollection([...available].filter(id => visibleId(id) === id), presentation?.outfitOrder ?? {}) : [...available];
  function resolve(id: string, source?: string) {
    if (collection && !hasModel(id)) throw new Error('Model outside the selected collection: ' + id);
    const variants = catalog.models[id] ?? [];
    const preferred = !source && collection && variants.find(item => item.collectionDefault && item.manifest);
    const asset = preferred || variants.find(item => item.manifest && (!source || item.source === source));
    if (!asset?.manifest) throw new Error('No model manifest for ' + id);
    const assetUrl = (path: string, sourceName = asset.source) => {
      const source = catalog.sources[sourceName];
      const base = new URL(source.baseUrl, sourceBase);
      const packs = base.hostname === 'raw.githubusercontent.com' ? source.packs : undefined;
      const pack = packs?.find(p => p.directories.some(dir => path.startsWith(dir + '/')));
      const target = new URL(path.split('/').map(encodeURIComponent).join('/'), pack?.baseUrl ?? base);
      return regionalUrl(target.href);
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
    const cues = asset.cues && (!asset.cueSource || collection && catalog.sources[asset.cueSource]) ? Object.fromEntries(
      Object.entries(asset.cues).map(([key, cue]) => [key, { ...cue,
        sound: cue.sound && (asset.cueSource ? assetUrl(cue.sound, asset.cueSource)
          : regionalUrl(cue.sound.startsWith('./') ? new URL(cue.sound, sourceBase).href : cue.sound)),
        caption: locale === 'en' ? cue.captionEn || cue.caption : cue.caption }])
    ) : undefined;
    const ratio = asset.sceneAspect;
    const sceneAspect = typeof ratio === 'number' && Number.isFinite(ratio) && ratio > 0 ? ratio : undefined;
    const files = asset.files ? Object.fromEntries(Object.entries(asset.files)
      .map(([path, replacement]) => [path, replacement && regionalUrl(replacement)])) : asset.files;
    return { cues, sceneAspect, hiddenDrawables: asset.hiddenDrawables, skippedDrawables: asset.skippedDrawables, files, captions, modelUrl: assetUrl(asset.manifest), dialogue, soundAliases: asset.soundAliases };
  }
  const gallery = catalog.gallery ? Object.fromEntries(Object.entries(catalog.gallery)
    .map(([id, entry]) => [id, entry.portrait ? { ...entry, portrait: regionalUrl(entry.portrait) } : entry])) : catalog.gallery;
  return { url: url.href, collection, locale, ids, gallery, visibleId, hasModel, labels: localized?.labels ?? {}, resolve, legacyIds: catalog.legacyIds };
}
