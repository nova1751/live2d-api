import { ModelTransition } from './transition';
import { createFraming } from './framing';
import { collections, collectionCatalogUrl, loadModelCatalog, type Collection } from './catalog';

export class CatalogModels {
  private libraries = new Map<Collection | undefined, ReturnType<typeof loadModelCatalog>>();
  private collection?: Collection;
  private sequence = 0;
  private transition = new ModelTransition();
  private active?: string;
  private readonly key: string;

  constructor(private readonly url: string, private readonly options: LegacyOptions) {
    this.collection = options.collection === 'all' ? collections[0] : options.collection;
    if (options.catalog) this.libraries.set(this.collection, Promise.resolve(options.catalog));
    const suffix = options.collection ? ':' + options.collection : '';
    const key = 'live2d:model:' + url + suffix;
    // An immutable catalog URL changes on release. Keep selections scoped to the same GitHub collection.
    const stable = (value: string) => value.replace(/(\/gh\/nova1751\/live2d-api)@catalog-[a-f0-9]{16}(\/catalog\/(?:library|games\/[a-z-]+)\.json:[a-z-]+)$/, '$1$2');
    this.key = stable(key);
    if (this.key !== key && !localStorage.getItem(this.key)) {
      const previous = [key, ...Object.keys(localStorage)].find(name => stable(name) === this.key && localStorage.getItem(name));
      if (previous) localStorage.setItem(this.key, localStorage.getItem(previous)!);
    }
    if (options.collection === 'all') {
      const saved = localStorage.getItem(this.key)?.split(':')[0];
      this.collection = collections.find(value => value === saved) ?? collections[0];
    }
  }
  private open(collection = this.collection) {
    let pending = this.libraries.get(collection);
    if (!pending) {
      const url = this.options.collection === 'all' ? collectionCatalogUrl(this.url, collection) : this.url;
      pending = loadModelCatalog(url, collection, this.options.locale).catch(error => {
        this.libraries.delete(collection);
        throw error;
      });
      this.libraries.set(collection, pending);
    }
    return pending;
  }
  private async select(selectId: (ids: string[], legacyIds: string[][] | undefined, visibleId: (id: string) => string) => string | undefined, start: boolean) {
    const revision = ++this.sequence;
    try {
      let collection = this.collection;
      let library = await this.open(collection);
      if (revision !== this.sequence) return;
      let id = selectId(library.ids, library.legacyIds, library.visibleId);
      if (id === undefined && this.options.collection === 'all' && collection) {
        collection = collections[(collections.indexOf(collection) + 1) % collections.length];
        library = await this.open(collection);
        if (revision !== this.sequence) return;
        id = library.ids[0];
      }
      if (!id) throw new Error('No model in collection: ' + collection);
      const { modelUrl, dialogue, soundAliases, captions, cues, files, sceneAspect } = library.resolve(id);
      let aspect = sceneAspect ?? 1;
      const fitCharacter = this.options.collection && !sceneAspect && !id.startsWith('background/');
      const paintScale = fitCharacter ? 1.5 : 1;
      const framing = fitCharacter ? createFraming(value => { aspect = value; }, paintScale) : undefined;
      const onPaint = this.options.collection ? this.transition.begin(() => aspect, paintScale) : undefined;
      await window.loadlive2d('live2d', modelUrl, { start, locale: this.options.locale, captions, sceneAspect, framing, onPaint, coreUrl: this.options.coreUrl, dialogue, soundAliases, cues, files,
        randomTap: Boolean(this.options.collection) && !id.startsWith('background/'), bandIdle: collection === 'bang-dream' });
      if (revision === this.sequence) {
        this.active = library.visibleId(id);
        this.collection = collection;
        localStorage.setItem(this.key, this.options.collection === 'all' ? collection + ':' + id : id);
        window.dispatchEvent(new CustomEvent('live2d:model', { detail: id }));
      }
    } catch (error) {
      if (revision === this.sequence) document.getElementById('waifu')?.removeAttribute('data-initial-framing');
      throw error;
    }
  }
  load(_id?: number, _texture?: number, _message?: string, start = false) {
    return this.select((ids, legacyIds, visibleId) => {
      const stored = localStorage.getItem(this.key);
      const saved = this.options.collection === 'all' ? stored?.split(':')[1] : stored;
      if (this.options.collection) return this.options.modelId ?? (saved && ids.includes(visibleId(saved)) ? saved : ids[0]);
      const legacy = legacyIds?.[Number(localStorage.getItem('modelId'))]?.[Number(localStorage.getItem('modelTexturesId'))];
      return this.options.modelId ?? (saved && ids.includes(visibleId(saved)) ? saved : legacy && ids.includes(legacy) ? legacy : ids[0]);
    }, start);
  }
  choose(id: string) { return this.select(() => id, false); }
  cancel() { this.sequence++; }
  reopen(start: boolean) { if (this.active) window.loadlive2d.show?.(start); else return this.load(undefined, undefined, undefined, start); }
  private character(id: string) { return id.split('/').slice(0, 2).join('/'); }
  nextModel(start = false) {
    return this.select(ids => {
      if (this.options.collection === 'all' || this.options.switchBy === 'outfit') {
        const next = ids.indexOf(this.active ?? '') + 1;
        return this.options.collection === 'all' ? ids[next] : ids[next % ids.length];
      }
      const groups = [...new Set(ids.map(id => this.character(id)))];
      const group = groups[(groups.indexOf(this.character(this.active ?? '')) + 1) % groups.length];
      return ids.find(id => this.character(id) === group)!;
    }, start);
  }
  nextTexture(start = false) {
    return this.select(ids => {
      const forms = ids.filter(id => this.character(id) === this.character(this.active ?? ids[0]));
      if (MODE === 'random') {
        const others = forms.filter(id => id !== this.active);
        return others.length ? others[Math.floor(Math.random() * others.length)] : forms[0];
      }
      return forms[(forms.indexOf(this.active ?? '') + 1) % forms.length];
    }, start);
  }
  async costume(target: string) {
    const lib = await this.open();
    const id = lib.ids.find(id => lib.resolve(id).modelUrl === target);
    if (id) await this.select(() => id, false);
  }
}
