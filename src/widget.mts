import { createRenderer, isModern } from './renderer';
export { loadModelCatalog } from './library/catalog.js';
import { runtimeDirectory, defaultLibraryUrl, githubLibrary, useRuntimeSnapshot } from './distribution';
const mounting = Symbol.for('live2dapi-noa.mounting');
type WidgetDocument = Document & { [mounting]?: Promise<void> };

import { collections, collectionCatalogUrl } from './library/catalog.js';
import type { WidgetLocale } from './library/catalog.js';
export type { WidgetLocale } from './library/catalog.js';
export type WidgetMode = 'random' | 'sequential';
export type WidgetPosition = 'left' | 'right';
export interface WidgetOptions {
  /** Initial zoom in the expanded viewer, in percent of fit (50–300, default 100). */
  expandedZoom?: number;
  /** Directory containing model_list.json and the built-in models. */
  modelBaseUrl?: string | URL;
  /** A single model manifest to show in place of the built-in rotation. */
  modelUrl?: string | URL;
  /** Optional self-hosted Cubism Core for modern models. */
  coreUrl?: string | URL;
  locale?: WidgetLocale;
  collection?: import('./library/catalog.js').CollectionScope;
  switchBy?: 'character' | 'outfit';
  catalogUrl?: string | URL;
  /** Reuse the catalog already loaded by a gallery, including its collection and locale. */
  catalog?: import('./library/catalog.js').LoadedModelCatalog;
  modelId?: string;
  mode?: WidgetMode;
  position?: WidgetPosition;
  /** Directory containing the deployed runtime and styles. */
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

async function mount(base: string, options: WidgetOptions, mode: WidgetMode, position: WidgetPosition) {
  const { modelUrl, coreUrl, modelBaseUrl, catalogUrl, modelId, collection, locale } = options;
  const style = document.createElement('link');
  style.rel = 'stylesheet';
  style.href = base + `css/${position}.css`;
  try {
    const [, , initWidget] = await Promise.all([
      appendResource(style, style.href),
      catalogUrl || modelUrl && isModern(new URL(modelUrl, document.baseURI))
        ? (window.loadlive2d = createRenderer(base))
        : loadScript(base + 'live2d.min.js', 'loadlive2d'),
      loadScript(base + `jsdelivr/${mode}/waifu-tips.js`, 'initWidget', base + 'asteroids.js'),
    ]);
    if (!document.body) {
      await new Promise<void>(resolve => document.addEventListener('DOMContentLoaded', () => resolve(), { once: true }));
    }
    if (!document.getElementById('waifu-toggle')) {
      initWidget({ cdnPath: base, collection, switchBy: options.switchBy, locale, ...(options.catalog && { catalog: options.catalog }), catalogUrl: catalogUrl && new URL(catalogUrl, document.baseURI).href, modelId, modelBaseUrl: modelBaseUrl && new URL(modelBaseUrl, document.baseURI).href, waifuPath: base + (locale === 'en' ? 'waifu-tips.en.json' : 'waifu-tips.json'),
        modelUrl: modelUrl && new URL(modelUrl, document.baseURI).href,
        expandedZoom: options.expandedZoom, coreUrl: coreUrl && new URL(coreUrl, document.baseURI).href });
    }
  } catch (error) {
    style.remove();
    throw error;
  }
}

export async function selectWidgetModel(id: string): Promise<void> {
  const key = Symbol.for('live2dapi-noa.selectModel');
  const select = (window as Window & { [key]?: (id: string) => Promise<void> })[key];
  if (!select) throw new Error('Initialize the widget with a model catalog first');
  await select(id);
}

export async function loadWidget({ mode = 'sequential', position = 'left', baseUrl, modelUrl, coreUrl, modelBaseUrl, catalogUrl, catalog, modelId, collection, switchBy, locale, expandedZoom }: WidgetOptions = {}): Promise<void> {
  if (catalog) {
    if (catalogUrl && new URL(catalogUrl, document.baseURI).href !== catalog.url ||
        collection && collection !== catalog.collection || locale && locale !== catalog.locale) {
      throw new TypeError('Widget options conflict with the supplied catalog');
    }
    catalogUrl = catalog.url;
    collection = catalog.collection;
    locale = catalog.locale;
  }
  if (collection !== undefined && collection !== 'all' && !collections.includes(collection)) throw new TypeError('Unknown Live2D collection: ' + collection);
  if (collection === 'all' && (modelUrl || modelBaseUrl)) throw new TypeError('Choose a collection or an explicit model source');
  if (locale && locale !== 'en' && locale !== 'zh-CN') throw new TypeError('Unsupported widget locale');
  if (!['random', 'sequential'].includes(mode)) throw new TypeError('Invalid Live2D mode');
  if (!['left', 'right'].includes(position)) throw new TypeError('Invalid Live2D position');
  if (catalogUrl && modelUrl) throw new TypeError('Choose catalogUrl or modelUrl');
  const page: WidgetDocument = document;
  if (page[mounting]) return page[mounting];
  if (document.getElementById('waifu-toggle')) return;

  const base = baseUrl === undefined
    ? runtimeDirectory(import.meta.url)
    : new URL(baseUrl, document.baseURI);
  if (!base.pathname.endsWith('/')) base.pathname += '/';
  base.search = '';
  base.hash = '';
  useRuntimeSnapshot(base);
  if (!catalogUrl && !modelUrl && !modelBaseUrl) {
    catalogUrl = collection ? collectionCatalogUrl(githubLibrary(base), collection) : defaultLibraryUrl(base);
  }
  if (modelId && !catalogUrl) throw new TypeError('modelId requires a catalog');
  page[mounting] = mount(base.href, { modelUrl, coreUrl, modelBaseUrl, catalogUrl, catalog, modelId, collection, switchBy, locale, expandedZoom }, mode, position).catch(error => {
    delete page[mounting];
    throw error;
  });
  return page[mounting];
}

/** Mount the Girls’ Frontline collection and keep character changes inside it. */
export function loadGirlsFrontline(options: Omit<WidgetOptions, 'collection' | 'modelUrl' | 'modelBaseUrl'> = {}) {
  return loadWidget({ ...options, collection: 'girls-frontline' });
}
