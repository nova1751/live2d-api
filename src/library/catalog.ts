export interface ModelSource { baseUrl: string }
export interface ModelVariant { source: string; manifest?: string; dialogue?: string; soundAliases?: Record<string, string> }
export interface ModelCatalog {
  schemaVersion: 1;
  legacyIds?: string[][];
  sources: Record<string, ModelSource>;
  models: Record<string, ModelVariant[]>;
  audio?: Record<string, string[]>;
}
export interface DialogueSource { url: string; audio: ReadonlyMap<string, string> }

export async function loadModelCatalog(input: string | URL) {
  const url = new URL(input, document.baseURI);
  const response = await fetch(url);
  if (!response.ok) throw new Error('Cannot load catalog: HTTP ' + response.status);
  const catalog: ModelCatalog = await response.json();
  if (catalog.schemaVersion !== 1 || !catalog.models || !catalog.sources) throw new Error('Unsupported model catalog');
  const audioBySource = new Map<string, Map<string, string>>();
  const ids = Object.keys(catalog.models).filter(id => catalog.models[id].some(asset => asset.manifest));
  function resolve(id: string, source?: string) {
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
      dialogue = { url: assetUrl(asset.dialogue), audio };
    }
    return { modelUrl: assetUrl(asset.manifest), dialogue, soundAliases: asset.soundAliases };
  }
  return { ids, resolve, legacyIds: catalog.legacyIds };
}
