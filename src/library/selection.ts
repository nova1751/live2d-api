import { preferences } from '../runtime/storage';
import { ModelTransition } from './transition';
import { catalogFraming } from './framing';
import { paintSurface } from './paint';
import { indexCharacters } from './navigation';
import { setModelLoading } from '../runtime/loading';
import { isLoadCancelled } from '../runtime/request';
import { collections, collectionCatalogUrl, loadModelCatalog, type Collection, type LoadedModelCatalog } from './catalog';

export class CatalogModels {
  private libraries = new Map<Collection | undefined, ReturnType<typeof loadModelCatalog>>();
  private collection?: Collection;
  private sequence = 0;
  private transition = new ModelTransition();
  private active?: string;
  private lastModel?: { library: LoadedModelCatalog; id: string; navigation: ReturnType<typeof indexCharacters> };
  private readonly key: string;

  constructor(private readonly url: string, private readonly options: LegacyOptions) {
    this.collection = options.collection === 'all' ? collections[0] : options.collection;
    if (options.catalog) this.libraries.set(this.collection, Promise.resolve(options.catalog));
    const suffix = options.collection ? ':' + options.collection : '';
    const key = 'live2d:model:' + url + suffix;
    // An immutable catalog URL changes on release. Keep selections scoped to the same GitHub collection.
    const stable = (value: string) => value.replace(/(\/gh\/nova1751\/live2d-api)@catalog-[a-f0-9]{16}(\/catalog\/(?:library|games\/[a-z-]+)\.json:[a-z-]+)$/, '$1$2');
    this.key = stable(key);
    if (this.key !== key && !preferences.getItem(this.key)) {
      const previous = [key, ...preferences.keys()].find(name => stable(name) === this.key && preferences.getItem(name));
      if (previous) preferences.setItem(this.key, preferences.getItem(previous)!);
    }
    if (options.collection === 'all') {
      const saved = preferences.getItem(this.key)?.split(':')[0];
      this.collection = collections.find(value => value === saved) ?? collections[0];
    }
  }
  private open(collection = this.collection) {
    let pending = this.libraries.get(collection);
    if (!pending) {
      const url = this.options.collection === 'all' ? collectionCatalogUrl(this.url, collection) : this.url;
      const cdn = this.options.cdnPath && new URL(this.options.cdnPath, document.baseURI).hostname === 'cdn.jsdmirror.com' ? 'mainland' : undefined;
      pending = loadModelCatalog(url, collection, this.options.locale, cdn).catch(error => {
        this.libraries.delete(collection);
        throw error;
      });
      this.libraries.set(collection, pending);
    }
    return pending;
  }
  private async select(selectId: (ids: string[], legacyIds: string[][] | undefined, visibleId: (id: string) => string) => string | undefined, start: boolean, target?: string) {
    const revision = ++this.sequence;
    window.loadlive2d.cancelLoad?.();
    setModelLoading(true);
    let replacing = false;
    try {
      let collection = this.collection;
      const all = this.options.collection === 'all';
      const namedCollection = all && collections.find(value => target?.startsWith(value + ':'));
      if (target && namedCollection) {
        collection = namedCollection;
        target = target.slice(namedCollection.length + 1);
      }
      const freeze = this.options.collection && this.active ? this.transition.freeze() : undefined;
      let [library] = await Promise.all([this.open(collection), freeze]);
      if (revision !== this.sequence) return;
      if (target && !namedCollection && all && !library.hasModel(target)) {
        const wanted = target;
        const alternatives = await Promise.allSettled(collections.filter(game => game !== collection).map(game => this.open(game)));
        if (revision !== this.sequence) return;
        const match = alternatives.find(result => result.status === 'fulfilled' && result.value.hasModel(wanted));
        if (match?.status === 'fulfilled') {
          library = match.value;
          collection = library.collection;
        } else {
          const unavailable = alternatives.find(result => result.status === 'rejected');
          if (unavailable?.status === 'rejected') throw unavailable.reason;
        }
      }
      let id = target ?? selectId(library.ids, library.legacyIds, library.visibleId);
      if (id === undefined && this.options.collection === 'all' && collection) {
        collection = collections[(collections.indexOf(collection) + 1) % collections.length];
        library = await this.open(collection);
        if (revision !== this.sequence) return;
        id = library.ids[0];
      }
      if (!id) throw new Error('No model in collection: ' + collection);
      const asset = library.resolve(id);
      replacing = true;
      await this.render(id, collection, asset, start, revision);
      if (revision === this.sequence) {
        this.active = library.visibleId(id);
        this.collection = collection;
        const navigation = this.lastModel?.library === library ? this.lastModel.navigation : indexCharacters(library.ids);
        this.lastModel = { library, id, navigation };
        const outfitButton = document.getElementById('waifu-tool-switch-texture') as HTMLButtonElement | null;
        if (outfitButton) outfitButton.disabled = navigation.outfitsFor(this.active).length < 2;
        const characterButton = document.getElementById('waifu-tool-switch-model') as HTMLButtonElement | null;
        if (characterButton) characterButton.disabled = this.options.collection !== 'all' &&
          (this.options.switchBy === 'outfit' ? library.ids.length : navigation.count) < 2;
        preferences.setItem(this.key, this.options.collection === 'all' ? collection + ':' + id : id);
        window.dispatchEvent(new CustomEvent('live2d:model', { detail: id }));
      }
    } catch (error) {
      if (revision !== this.sequence) return;
      if (replacing && this.lastModel && !isLoadCancelled(error)) {
        const { library, id } = this.lastModel;
        try { await this.render(id, this.collection, library.resolve(id), false, revision); }
        catch {
          if (revision === this.sequence) {
            this.active = undefined;
            window.dispatchEvent(new CustomEvent('live2d:motions', { detail: [] }));
          }
        }
      }
      if (revision !== this.sequence) return;
      this.transition.cancelFreeze();
      setModelLoading(false);
      document.getElementById('waifu')?.removeAttribute('data-initial-framing');
      throw error;
    }
  }
  private render(id: string, collection: Collection | undefined, asset: ReturnType<LoadedModelCatalog['resolve']>, start: boolean, revision: number) {
    const { modelUrl, subjectFrame, ...options } = asset;
    let aspect = options.sceneAspect ?? 1;
    const fit = Boolean(this.options.collection) && !options.sceneAspect && !id.startsWith('background/');
    const framing = fit ? catalogFraming(id, value => { aspect = value; }, collection === 'bang-dream', subjectFrame) : undefined;
    const present = this.options.collection ? this.transition.begin(() => aspect, fit, fit && !!subjectFrame) : undefined;
    const onPaint = () => {
      if (revision !== this.sequence) return;
      present?.();
      setModelLoading(false);
    };
    return window.loadlive2d('live2d', modelUrl, { ...options, start, locale: this.options.locale, framing, paint: framing && paintSurface, onPaint, coreUrl: this.options.coreUrl,
      randomTap: Boolean(this.options.collection) && !id.startsWith('background/'), bandIdle: collection === 'bang-dream' });
  }
  load(_id?: number, _texture?: number, _message?: string, start = false) {
    return this.select((ids, legacyIds, visibleId) => {
      const stored = preferences.getItem(this.key);
      const saved = this.options.collection === 'all' ? stored?.split(':')[1] : stored;
      if (this.options.collection) return saved && ids.includes(visibleId(saved)) ? saved : ids[0];
      const legacy = legacyIds?.[Number(preferences.getItem('modelId'))]?.[Number(preferences.getItem('modelTexturesId'))];
      return saved && ids.includes(visibleId(saved)) ? saved : legacy && ids.includes(legacy) ? legacy : ids[0];
    }, start, this.options.modelId);
  }
  choose(id: string) { return this.select(() => id, false, id); }
  cancel() {
    this.sequence++;
    window.loadlive2d.cancelLoad?.();
    if (document.getElementById('waifu')?.hasAttribute('data-model-pending')) this.active = undefined;
    this.transition.cancelFreeze();
    document.getElementById('waifu')?.removeAttribute('data-initial-framing');
    setModelLoading(false);
  }
  reopen(start: boolean) {
    if (this.active) window.loadlive2d.show?.(start);
    else if (this.lastModel) return this.select(() => this.lastModel!.id, start);
    else return this.load(undefined, undefined, undefined, start);
  }
  nextModel(start = false) {
    return this.select(ids => {
      if (this.options.switchBy === 'outfit') {
        const next = ids.indexOf(this.active ?? '') + 1;
        return this.options.collection === 'all' ? ids[next] : ids[next % ids.length];
      }
      if (!this.active || !this.lastModel) return ids[0];
      return this.lastModel.navigation.nextCharacter(this.active, this.options.collection !== 'all');
    }, start);
  }
  nextTexture(start = false) {
    return this.select(ids => {
      const forms = (this.lastModel?.navigation ?? indexCharacters(ids)).outfitsFor(this.active ?? ids[0]);
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
