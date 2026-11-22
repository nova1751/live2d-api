import { defaultDoll, loadModelCatalog } from './catalog';

export class CatalogModels {
  private library?: ReturnType<typeof loadModelCatalog>;
  private sequence = 0;
  private active?: string;
  private readonly key: string;

  constructor(private readonly url: string, private readonly options: LegacyOptions) {
    this.key = 'live2d:model:' + url + (options.collection ? ':' + options.collection : '');
  }
  private open() {
    return this.library ??= loadModelCatalog(this.url, this.options.collection).catch(error => { this.library = undefined; throw error; });
  }
  private async select(selectId: (ids: string[], legacyIds?: string[][]) => string, start: boolean) {
    const revision = ++this.sequence;
    const library = await this.open();
    if (revision !== this.sequence) return;
    const id = selectId(library.ids, library.legacyIds);
    const { modelUrl, dialogue, soundAliases } = library.resolve(id);
    await window.loadlive2d('live2d', modelUrl, { start, coreUrl: this.options.coreUrl, dialogue, soundAliases });
    if (revision === this.sequence) {
      this.active = id;
      localStorage.setItem(this.key, id);
      window.dispatchEvent(new CustomEvent('live2d:model', { detail: id }));
    }
  }
  load(_id?: number, _texture?: number, _message?: string, start = false) {
    return this.select((ids, legacyIds) => {
      const saved = localStorage.getItem(this.key);
      if (this.options.collection) return this.options.modelId ?? (saved && ids.includes(saved) ? saved : ids.includes(defaultDoll) ? defaultDoll : ids[0]);
      const legacy = legacyIds?.[Number(localStorage.getItem('modelId'))]?.[Number(localStorage.getItem('modelTexturesId'))];
      return this.options.modelId ?? (saved && ids.includes(saved) ? saved : legacy && ids.includes(legacy) ? legacy : ids[0]);
    }, start);
  }
  choose(id: string) { return this.select(() => id, false); }
  cancel() { this.sequence++; }
  reopen(start: boolean) { if (this.active) window.loadlive2d.show?.(start); else return this.load(undefined, undefined, undefined, start); }
  private character(id: string) { return id.split('/').slice(0, 2).join('/'); }
  nextModel(start = false) {
    return this.select(ids => {
      const groups = [...new Set(ids.map(id => this.character(id)))];
      const group = groups[(groups.indexOf(this.character(this.active ?? '')) + 1) % groups.length];
      return ids.find(id => this.character(id) === group)!;
    }, start);
  }
  nextTexture(start = false) {
    return this.select(ids => {
      const forms = ids.filter(id => this.character(id) === this.character(this.active ?? ids[0]));
      if (MODE === 'random') return forms[Math.floor(Math.random() * forms.length)];
      return forms[(forms.indexOf(this.active ?? '') + 1) % forms.length];
    }, start);
  }
  async costume(target: string) {
    const lib = await this.open();
    const id = lib.ids.find(id => lib.resolve(id).modelUrl === target);
    if (id) await this.select(() => id, false);
  }
}
