import { preferences } from '../runtime/storage';
import { translated } from '../runtime/locale';
import { getJson, isLoadCancelled, withLoadTimeout } from '../runtime/request';
import { setModelLoading } from '../runtime/loading';
import { fallbackModelDirectory, modelDirectory } from '../distribution';
import { pick, say } from '../runtime/messages';

interface Catalog { models: (string | string[])[]; messages: string[] }
const changed = () => translated('我的新衣服好看嘛？', 'How do you like my new outfit?');
const storedId = (key: string) => Number(preferences.getItem(key)) || 0;

export class LegacyModels {
  private base: string;
  private readonly useCDN: boolean;
  private catalog?: Promise<Catalog>;

  private revision = 0;
  private loaded = false;
  private lastUrl?: string;

  reopen(start: boolean) {
    if (this.loaded) window.loadlive2d.show?.(start);
    else return this.load(undefined, undefined, undefined, start);
  }

  cancel() { this.revision++; window.loadlive2d.cancelLoad?.(); setModelLoading(false); }

  constructor(private readonly options: LegacyOptions) {
    this.useCDN = typeof options.cdnPath === 'string';
    const path = options.modelBaseUrl ?? (options.cdnPath && modelDirectory(options.cdnPath)) ?? options.apiPath;
    if (typeof path !== 'string') throw new TypeError('Invalid initWidget argument');
    this.base = path.endsWith('/') ? path : path + '/';
  }

  private async fetchCatalog(): Promise<Catalog> {
    const url = this.base + 'model_list.json';
    return withLoadTimeout(async signal => {
      const response = await fetch(url, { signal });
      // SPA hosts may serve their HTML entry for a missing JSON file.
      const missing = response.status === 404 || (response.ok && response.headers?.get('content-type')?.includes('text/html'));
      if (missing && !this.options.modelBaseUrl) {
        const fallback = fallbackModelDirectory(this.base);
        if (fallback !== this.base) {
          const catalog = await getJson<Catalog>(fallback + 'model_list.json');
          this.base = fallback;
          return catalog;
        }
      }
      if (!response.ok) throw new Error(`Failed to load model catalog ${url} (HTTP ${response.status})`);
      if (missing) throw new Error('Expected JSON model catalog at ' + url);
      const catalog: Catalog = await response.json();
      if (!Array.isArray(catalog?.models) || !catalog.models.length) throw new Error('No models in catalog ' + url);
      return catalog;
    });
  }

  private list(): Promise<Catalog> {
    return this.catalog ??= this.fetchCatalog().catch(error => {
      this.catalog = undefined;
      throw error;
    });
  }

  private async change(action: (revision: number) => Promise<void>) {
    const revision = ++this.revision;
    window.loadlive2d.cancelLoad?.();
    setModelLoading(true);
    try {
      await action(revision);
    } catch (error) {
      if (revision === this.revision) throw error;
    } finally {
      if (revision === this.revision) setModelLoading(false);
    }
  }

  load(id = storedId('modelId'), texture = storedId('modelTexturesId'), message?: string, start = false) {
    return this.change(revision => this.render(id, texture, message, start, revision));
  }

  private async render(id: number, texture: number, message: string | undefined, start: boolean, revision: number, exactSkin = false) {
    let url: string;
    if (this.options.modelUrl) {
      url = this.options.modelUrl;
    } else if (this.useCDN) {
      const { models } = await this.list();
      if (!models[id]) id = 0;
      const entry = models[id];
      const skins = Array.isArray(entry) ? entry : [entry];
      if (!skins[texture]) texture = 0;
      const skin = MODE === 'random' && !exactSkin ? pick(skins) : skins[texture];
      texture = skins.indexOf(skin);
      url = this.base + 'model/' + skin + '/index.json';
    } else {
      url = this.base + 'get/?id=' + id + '-' + texture;
    }
    if (revision !== this.revision) return;
    this.loaded = false;
    try { await this.paint(url, start); }
    catch (error) {
      if (revision === this.revision && this.lastUrl && this.lastUrl !== url && !isLoadCancelled(error)) {
        try {
          await this.paint(this.lastUrl, false);
          if (revision === this.revision) this.loaded = true;
        } catch { /* the original load error is reported */ }
      }
      throw error;
    }
    if (revision !== this.revision) return;
    if (!this.options.modelUrl) {
      preferences.setItem('modelId', String(id));
      preferences.setItem('modelTexturesId', String(texture));
    }
    say(message, 4000, 10);
    this.loaded = true;
    this.lastUrl = url;
  }

  private paint(url: string, start: boolean) {
    return window.loadlive2d('live2d', url, { start, locale: this.options.locale, coreUrl: this.options.coreUrl, onPaint: () => {} });
  }

  async costume(target: string) {
    if (this.options.modelUrl || !this.useCDN) return;
    await this.change(async revision => {
      const id = storedId('modelId');
      const entry = (await this.list()).models[id];
      const skins = Array.isArray(entry) ? entry : [entry];
      const index = skins.findIndex(skin => new URL(this.base + 'model/' + skin + '/index.json', document.baseURI).href === target);
      if (index >= 0) await this.render(id, index, changed(), false, revision, true);
    });
  }

  nextModel(start = false) { return this.change(async revision => {
    const current = storedId('modelId');
    if (this.useCDN) {
      const { models, messages } = await this.list();
      const id = (current + 1) % models.length;
      return this.render(id, 0, translated(messages[id], 'Ready for duty!'), start, revision);
    }
    const { model } = await getJson<{ model: { id: number; message: string } }>(
      this.base + 'switch/?id=' + current,
    );
    return this.render(model.id, 0, model.message, start, revision);
  }); }

  nextTexture(start = false) { return this.change(async revision => {
    const id = storedId('modelId');
    const texture = storedId('modelTexturesId');
    if (this.useCDN) {
      const entry = (await this.list()).models[id];
      const count = Array.isArray(entry) ? entry.length : 1;
      return this.render(id, MODE === 'random' ? texture : (texture + 1) % count, changed(), start, revision);
    }
    const { textures } = await getJson<{ textures: { id: number } }>(
      this.base + 'rand_textures/?id=' + id + '-' + texture,
    );
    if (textures.id === 1 && texture === 1) say(translated('我还没有其他衣服呢！', 'This is my only outfit so far!'), 4000, 10);
    else await this.render(id, textures.id, changed(), start, revision);
  }); }
}
