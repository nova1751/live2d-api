export interface ModelSource { baseUrl: string }
export interface ModelVariant { source: string; manifest?: string; dialogue?: string; soundAliases?: Record<string, string> }
export interface ModelCatalog {
  schemaVersion: 1;
  legacyIds?: string[][];
  sources: Record<string, ModelSource>;
  models: Record<string, ModelVariant[]>;
  presentation?: { labels: Record<string,string>; captions: Record<string,string>; aliases: Record<string,string> };
  audio?: Record<string, string[]>;
}
export interface DialogueSource { url: string; captions?: Record<string,string>; audio: ReadonlyMap<string, string> }

export type Collection = 'girls-frontline';
export const defaultDoll = 'doll/k2/3301/normal';

export async function loadModelCatalog(input: string | URL, collection?: Collection) {
  const url = new URL(input, document.baseURI);
  const response = await fetch(url);
  if (!response.ok) throw new Error('Cannot load catalog: HTTP ' + response.status);
  const catalog: ModelCatalog = await response.json();
  if (catalog.schemaVersion !== 1 || !catalog.models || !catalog.sources) throw new Error('Unsupported model catalog');
  const audioBySource = new Map<string, Map<string, string>>();
  const available = Object.keys(catalog.models).filter(id => (!collection || !id.startsWith('other/')) && catalog.models[id].some(asset => asset.manifest));
  const presentation = collection ? catalog.presentation : undefined;
  const visibleId = (id: string) => {
    const alias = presentation?.aliases[id];
    return alias && available.includes(alias) ? alias : id;
  };
  const ids = available.filter(id => visibleId(id) === id);
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
      dialogue = { captions: presentation?.captions, url: assetUrl(asset.dialogue), audio };
    }
    return { captions: presentation?.captions, modelUrl: assetUrl(asset.manifest), dialogue, soundAliases: asset.soundAliases };
  }
  return { ids, visibleId, labels: presentation?.labels ?? {}, resolve, legacyIds: catalog.legacyIds };
}
