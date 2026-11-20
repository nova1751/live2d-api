import { pick, say } from './messages';

interface Catalog { models: (string | string[])[]; messages: string[] }
const changed = '我的新衣服好看嘛？';
const storedId = (key: string) => Number(localStorage.getItem(key)) || 0;

export async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to load ${url} (HTTP ${response.status})`);
  return response.json();
}

export class Models {
  private readonly base: string;
  private readonly useCDN: boolean;
  private catalog?: Promise<Catalog>;

  constructor(options: LegacyOptions) {
    this.useCDN = typeof options.cdnPath === 'string';
    const path = options.cdnPath ?? options.apiPath;
    if (typeof path !== 'string') throw new TypeError('Invalid initWidget argument');
    this.base = path.endsWith('/') ? path : path + '/';
  }

  private list(): Promise<Catalog> {
    return this.catalog ??= getJson<Catalog>(this.base + 'model_list.json').catch(error => {
      this.catalog = undefined;
      throw error;
    });
  }

  async load(id = storedId('modelId'), texture = storedId('modelTexturesId'), message?: string) {
    let url: string;
    if (this.useCDN) {
      const { models } = await this.list();
      if (!models[id]) id = 0;
      const entry = models[id];
      const skins = Array.isArray(entry) ? entry : [entry];
      if (!skins[texture]) texture = 0;
      const skin = MODE === 'random' ? pick(skins) : skins[texture];
      url = this.base + 'model/' + skin + '/index.json';
    } else {
      url = this.base + 'get/?id=' + id + '-' + texture;
    }
    localStorage.setItem('modelId', String(id));
    localStorage.setItem('modelTexturesId', String(texture));
    say(message, 4000, 10);
    window.loadlive2d('live2d', url);
  }

  async nextModel() {
    const current = storedId('modelId');
    if (this.useCDN) {
      const { models, messages } = await this.list();
      const id = (current + 1) % models.length;
      return this.load(id, 0, messages[id]);
    }
    const { model } = await getJson<{ model: { id: number; message: string } }>(
      this.base + 'switch/?id=' + current,
    );
    return this.load(model.id, 0, model.message);
  }

  async nextTexture() {
    const id = storedId('modelId');
    const texture = storedId('modelTexturesId');
    if (this.useCDN) {
      const entry = (await this.list()).models[id];
      const count = Array.isArray(entry) ? entry.length : 1;
      return this.load(id, MODE === 'random' ? texture : (texture + 1) % count, changed);
    }
    const { textures } = await getJson<{ textures: { id: number } }>(
      this.base + 'rand_textures/?id=' + id + '-' + texture,
    );
    if (textures.id === 1 && texture === 1) say('我还没有其他衣服呢！', 4000, 10);
    else await this.load(id, textures.id, changed);
  }
}
