/*! Live2D API | Generated from src/ | https://github.com/nova1751/live2d-api */

// src/renderer.ts
function isModern(url) {
  return url.pathname.toLowerCase().endsWith(".model3.json");
}
function createRenderer(base, legacy) {
  let pendingLegacy;
  let controller;
  let stage;
  let generation = 0;
  let hidden = false;
  function fetchLegacy() {
    return pendingLegacy ?? (pendingLegacy = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = base + "live2d.min.js";
      script.acceptCubism2 = (renderer) => {
        legacy = renderer;
        resolve(renderer);
      };
      script.onerror = () => reject(new Error("Failed to load " + script.src));
      document.head.appendChild(script);
    }).catch((error) => {
      pendingLegacy = void 0;
      throw error;
    }));
  }
  const render = (canvas, model, options) => {
    const revision = ++generation;
    controller?.abort();
    controller = void 0;
    stage = void 0;
    hidden = false;
    const url = new URL(model, document.baseURI);
    if (!isModern(url)) {
      if (legacy) return legacy(canvas, model, options);
      return fetchLegacy().then((renderer) => {
        if (generation !== revision) return;
        const ready = renderer(canvas, model, options);
        if (hidden) renderer.hide?.();
        return ready;
      });
    }
    legacy?.hide?.();
    controller = new AbortController();
    const { signal } = controller;
    return import(
      /* webpackIgnore: true */
      /* @vite-ignore */
      base + "modern/renderer.mjs"
    ).then(async (module) => {
      if (signal.aborted) return;
      const result = await module.mountModern(document.getElementById(canvas), url.href, options?.coreUrl, signal, options?.dialogue, options?.framing, options?.onPaint);
      if (signal.aborted) return;
      stage = result;
      if (hidden) stage.pause();
    }).catch((error) => {
      if (!signal.aborted) {
        controller = void 0;
        throw error;
      }
    });
  };
  render.hide = () => {
    hidden = true;
    if (controller) stage?.pause();
    else legacy?.hide?.();
  };
  render.show = (start) => {
    hidden = false;
    if (controller) stage?.resume();
    else legacy?.show?.(start);
  };
  render.prepareInteraction = () => !controller && !!legacy?.prepareInteraction?.();
  render.capture = () => {
    if (controller) stage?.capture();
    return !!controller;
  };
  return render;
}

// src/library/catalog.ts
var categories = ["fairy", "doll", "adjutant", "npc", "squad", "background"];
var forms = ["default", "normal", "destroy"];
function rank(list, key) {
  const i = list.indexOf(key);
  return i < 0 ? list.length : i;
}
function orderCollection(ids, outfits) {
  const natural = new Intl.Collator("en", { numeric: true });
  const rows = ids.map((id) => {
    const [category, character, version2, form] = id.split("/");
    const outfit = outfits[[category, character, version2].join("/")];
    const order = version2 === "base" ? -1 : outfit ?? (category === "fairy" && /^\d+$/.test(version2) ? Number(version2) : Number.MAX_SAFE_INTEGER);
    return { id, category, character, version: version2, form, order };
  });
  rows.sort((a, b) => rank(categories, a.category) - rank(categories, b.category) || natural.compare(a.category, b.category) || natural.compare(a.character, b.character) || a.order - b.order || natural.compare(a.version, b.version) || rank(forms, a.form) - rank(forms, b.form) || natural.compare(a.form, b.form));
  return rows.map((row) => row.id);
}
async function loadModelCatalog(input, collection, locale = "zh-CN") {
  const url = new URL(input, document.baseURI);
  const response = await fetch(url);
  if (!response.ok) throw new Error("Cannot load catalog: HTTP " + response.status);
  const catalog = await response.json();
  if (catalog.schemaVersion !== 1 || !catalog.models || !catalog.sources) throw new Error("Unsupported model catalog");
  const audioBySource = /* @__PURE__ */ new Map();
  const available = Object.keys(catalog.models).filter((id) => (!collection || !id.startsWith("other/")) && catalog.models[id].some((asset) => asset.manifest));
  const presentation = collection ? catalog.presentation : void 0;
  const localized = locale === "en" ? presentation?.en : presentation;
  const visibleId = (id) => {
    const alias = presentation?.aliases[id];
    return alias && available.includes(alias) ? alias : id;
  };
  const ids = collection ? orderCollection(available.filter((id) => visibleId(id) === id), presentation?.outfitOrder ?? {}) : available;
  function resolve(id, source) {
    if (collection && !available.includes(id)) throw new Error("Model outside the selected collection: " + id);
    const asset = catalog.models[id]?.find((item) => item.manifest && (!source || item.source === source));
    if (!asset?.manifest) throw new Error("No model manifest for " + id);
    const base = new URL(catalog.sources[asset.source].baseUrl, response.url || url);
    if (url.hostname === "cdn.jsdmirror.com" && base.hostname === "cdn.jsdelivr.net" && base.pathname.startsWith("/gh/nova1751/live2d-api@cdn-")) base.hostname = url.hostname;
    const assetUrl = (path) => new URL(path.split("/").map(encodeURIComponent).join("/"), base).href;
    let dialogue;
    if (asset.dialogue) {
      let audio = audioBySource.get(asset.source);
      if (!audio) {
        audio = new Map((catalog.audio?.[asset.source] ?? []).map((path) => [path.toUpperCase(), assetUrl(path)]));
        audioBySource.set(asset.source, audio);
      }
      dialogue = { captions: locale === "en" ? void 0 : localized?.captions, url: assetUrl(asset.dialogue), audio };
    }
    return { captions: localized?.captions, modelUrl: assetUrl(asset.manifest), dialogue, soundAliases: asset.soundAliases };
  }
  return { ids, visibleId, labels: localized?.labels ?? {}, resolve, legacyIds: catalog.legacyIds };
}

// package.json
var version = "2.4.4";

// src/distribution.ts
var snapshot = "/gh/nova1751/live2d-api@cdn-b3ac5ae545e2/";
var globalCdn = "https://cdn.jsdelivr.net";
var globalModels = globalCdn + snapshot;
var widgetSnapshot = /\/gh\/nova1751\/live2d-api@widget-[^/]+\/?$/;
var packageRoot = /\/live2dapi-noa(?:@[^/]+)?\/?$/;
function scriptDirectory(src) {
  const url = new URL(src, document.baseURI);
  if (!packageRoot.test(url.pathname)) return new URL(".", url);
  if (!url.pathname.endsWith("/")) url.pathname += "/";
  url.search = url.hash = "";
  return url;
}
function runtimeDirectory(src) {
  return /^https?:\/\//.test(src) && /\/widget\.mjs(?:[?#]|$)/.test(src) ? scriptDirectory(src) : new URL(globalCdn + "/gh/nova1751/live2d-api@widget-" + version + "/");
}
function githubLibrary(base) {
  const origin = base.hostname === "cdn.jsdmirror.com" ? base.origin : globalCdn;
  return origin + "/gh/nova1751/live2d-api@catalog-0cb4f982723bf0f0/catalog/library.json";
}
function defaultLibraryUrl(base) {
  if (!packageRoot.test(base.pathname) && !widgetSnapshot.test(base.pathname)) return void 0;
  return githubLibrary(base);
}

// src/widget.mts
var mounting = Symbol.for("live2dapi-noa.mounting");
var scripts = /* @__PURE__ */ new Map();
function appendResource(element, url) {
  return new Promise((resolve, reject) => {
    element.onload = () => resolve();
    element.onerror = () => {
      element.remove();
      reject(new Error(`Failed to load ${url}`));
    };
    document.head.appendChild(element);
  });
}
function loadScript(url, exportName, asteroidsUrl) {
  if (!scripts.has(url)) {
    const script = document.createElement("script");
    script.src = url;
    if (asteroidsUrl) script.dataset.asteroidsUrl = asteroidsUrl;
    const ready = appendResource(script, url).then(() => {
      const value = window[exportName];
      if (typeof value !== "function") throw new Error(`Missing export from ${url}`);
      return value;
    }).catch((error) => {
      scripts.delete(url);
      throw error;
    });
    scripts.set(url, ready);
  }
  return scripts.get(url);
}
async function mount(base, options, mode, position) {
  const { modelUrl, coreUrl, modelBaseUrl, catalogUrl, modelId, collection, locale } = options;
  const style = document.createElement("link");
  style.rel = "stylesheet";
  style.href = base + `css/${position}.css`;
  try {
    const [, , initWidget] = await Promise.all([
      appendResource(style, style.href),
      catalogUrl || modelUrl && isModern(new URL(modelUrl, document.baseURI)) ? window.loadlive2d = createRenderer(base) : loadScript(base + "live2d.min.js", "loadlive2d"),
      loadScript(base + `jsdelivr/${mode}/waifu-tips.js`, "initWidget", base + "asteroids.js")
    ]);
    if (!document.body) {
      await new Promise((resolve) => document.addEventListener("DOMContentLoaded", () => resolve(), { once: true }));
    }
    if (!document.getElementById("waifu-toggle")) {
      initWidget({
        cdnPath: base,
        collection,
        locale,
        catalogUrl: catalogUrl && new URL(catalogUrl, document.baseURI).href,
        modelId,
        modelBaseUrl: modelBaseUrl && new URL(modelBaseUrl, document.baseURI).href,
        waifuPath: base + (locale === "en" ? "waifu-tips.en.json" : "waifu-tips.json"),
        modelUrl: modelUrl && new URL(modelUrl, document.baseURI).href,
        coreUrl: coreUrl && new URL(coreUrl, document.baseURI).href
      });
    }
  } catch (error) {
    style.remove();
    throw error;
  }
}
async function selectWidgetModel(id) {
  const key = Symbol.for("live2dapi-noa.selectModel");
  const select = window[key];
  if (!select) throw new Error("Initialize the widget with a model catalog first");
  await select(id);
}
async function loadWidget({ mode = "sequential", position = "left", baseUrl, modelUrl, coreUrl, modelBaseUrl, catalogUrl, modelId, collection, locale } = {}) {
  if (locale && locale !== "en" && locale !== "zh-CN") throw new TypeError("Unsupported widget locale");
  if (!["random", "sequential"].includes(mode)) throw new TypeError("Invalid Live2D mode");
  if (!["left", "right"].includes(position)) throw new TypeError("Invalid Live2D position");
  if (catalogUrl && modelUrl) throw new TypeError("Choose catalogUrl or modelUrl");
  const page = document;
  if (page[mounting]) return page[mounting];
  if (document.getElementById("waifu-toggle")) return;
  const base = baseUrl === void 0 ? runtimeDirectory(import.meta.url) : new URL(baseUrl, document.baseURI);
  if (!base.pathname.endsWith("/")) base.pathname += "/";
  base.search = "";
  base.hash = "";
  if (!catalogUrl && !modelUrl && !modelBaseUrl) catalogUrl = collection ? githubLibrary(base) : defaultLibraryUrl(base);
  if (modelId && !catalogUrl) throw new TypeError("modelId requires a catalog");
  page[mounting] = mount(base.href, { modelUrl, coreUrl, modelBaseUrl, catalogUrl, modelId, collection, locale }, mode, position).catch((error) => {
    delete page[mounting];
    throw error;
  });
  return page[mounting];
}
function loadGirlsFrontline(options = {}) {
  return loadWidget({ ...options, collection: "girls-frontline" });
}
export {
  loadGirlsFrontline,
  loadModelCatalog,
  loadWidget,
  selectWidgetModel
};
