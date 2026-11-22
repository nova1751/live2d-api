// The legacy renderer owns a single canvas and exposes a global loadlive2d().
const mounting = Symbol.for('live2dapi-noa.mounting');
type WidgetDocument = Document & { [mounting]?: Promise<void> };

export type WidgetMode = 'random' | 'sequential';
export type WidgetPosition = 'left' | 'right';
export interface WidgetOptions {
  /** A single model manifest to show in place of the built-in rotation. */
  modelUrl?: string | URL;
  /** Optional self-hosted Cubism Core for modern models. */
  coreUrl?: string | URL;
  mode?: WidgetMode;
  position?: WidgetPosition;
  /** Directory containing the deployed scripts, styles and models. */
  baseUrl?: string | URL;
}

const scripts = new Map<string, Promise<unknown>>();

function appendResource(element: HTMLScriptElement | HTMLLinkElement, url: string) {
  return new Promise<void>((resolve, reject) => {
    element.onload = () => resolve();
    element.onerror = () => {
      element.remove();
      reject(new Error(`Failed to load ${url}`));
    };
    document.head.appendChild(element);
  });
}

function loadScript<K extends 'initWidget' | 'loadlive2d'>(
  url: string, exportName: K, asteroidsUrl?: string,
): Promise<Window[K]> {
  if (!scripts.has(url)) {
    const script = document.createElement('script');
    script.src = url;
    if (asteroidsUrl) script.dataset.asteroidsUrl = asteroidsUrl;
    const ready = appendResource(script, url).then(() => {
      const value = window[exportName];
      if (typeof value !== 'function') throw new Error(`Missing export from ${url}`);
      return value;
    }).catch(error => {
      scripts.delete(url);
      throw error;
    });
    scripts.set(url, ready);
  }
  return scripts.get(url) as Promise<Window[K]>;
}

async function mount(base: string, mode: WidgetMode, position: WidgetPosition, modelUrl?: string | URL, coreUrl?: string | URL) {
  const style = document.createElement('link');
  style.rel = 'stylesheet';
  style.href = base + `css/${position}.css`;
  try {
    const [, , initWidget] = await Promise.all([
      appendResource(style, style.href),
      loadScript(base + 'live2d.min.js', 'loadlive2d'),
      loadScript(base + `jsdelivr/${mode}/waifu-tips.js`, 'initWidget', base + 'asteroids.js'),
    ]);
    if (!document.body) {
      await new Promise<void>(resolve => document.addEventListener('DOMContentLoaded', () => resolve(), { once: true }));
    }
    if (!document.getElementById('waifu-toggle')) {
      initWidget({ cdnPath: base, waifuPath: base + 'waifu-tips.json',
        modelUrl: modelUrl && new URL(modelUrl, document.baseURI).href,
        coreUrl: coreUrl && new URL(coreUrl, document.baseURI).href });
    }
  } catch (error) {
    style.remove();
    throw error;
  }
}

export async function loadWidget({ mode = 'sequential', position = 'left', baseUrl, modelUrl, coreUrl }: WidgetOptions = {}): Promise<void> {
  if (!['random', 'sequential'].includes(mode)) throw new TypeError('Invalid Live2D mode');
  if (!['left', 'right'].includes(position)) throw new TypeError('Invalid Live2D position');
  const page: WidgetDocument = document;
  if (page[mounting]) return page[mounting];
  if (document.getElementById('waifu-toggle')) return;

  const base = baseUrl === undefined
    ? new URL('.', import.meta.url)
    : new URL(baseUrl, document.baseURI);
  if (!base.pathname.endsWith('/')) base.pathname += '/';
  base.search = '';
  base.hash = '';
  page[mounting] = mount(base.href, mode, position, modelUrl, coreUrl).catch(error => {
    delete page[mounting];
    throw error;
  });
  return page[mounting];
}
