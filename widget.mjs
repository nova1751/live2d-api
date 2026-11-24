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
      const result = await module.mountModern(document.getElementById(canvas), url.href, options?.coreUrl, signal, options?.dialogue, options?.framing, options?.onPaint, options?.cues, options?.randomTap, options?.sceneAspect, options?.hiddenDrawables);
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
  render.playMotion = (group, index) => !hidden && (controller ? !!stage?.playMotion(group, index) : !!legacy?.playMotion?.(group, index));
  render.onNextPaint = (copy) => hidden ? void 0 : controller ? stage?.onNextPaint(copy) : legacy?.onNextPaint?.(copy);
  render.capture = () => {
    if (controller) stage?.capture();
    return !!controller;
  };
  return render;
}

// src/library/catalog.ts
var collections = ["girls-frontline", "azur-lane", "bang-dream", "houkai2", "iron-saga", "warship-girls", "baoshi-yanwuyu"];
function collectionCatalogUrl(libraryUrl, collection) {
  return !collection || collection === "all" || collection === "girls-frontline" ? libraryUrl : new URL("games/" + collection + ".json", libraryUrl).href;
}
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
async function loadModelCatalog(input, collection, locale = "zh-CN", assetCdn) {
  const url = new URL(input, document.baseURI);
  const response = await fetch(url);
  if (!response.ok) throw new Error("Cannot load catalog: HTTP " + response.status);
  const catalog = await response.json();
  return parseModelCatalog(catalog, url, collection, locale, response.url || url.href, assetCdn);
}
function parseModelCatalog(catalog, url, collection, locale = "zh-CN", sourceBase = url.href, assetCdn) {
  if (catalog.schemaVersion !== 1 || !catalog.models || !catalog.sources) throw new Error("Unsupported model catalog");
  const audioBySource = /* @__PURE__ */ new Map();
  const mainland = assetCdn === "mainland" || url.hostname === "cdn.jsdmirror.com";
  const mainlandPath = "https://cdn.jsdmirror.com/gh/";
  function regionalUrl(href) {
    if (href.startsWith("/gh/")) return new URL(href, sourceBase).href;
    if (!mainland) return href;
    return href.replace(
      /^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([a-f\d]{40})\//i,
      mainlandPath + "$1/$2@$3/"
    ).replace(/^https:\/\/cdn\.jsdelivr\.net\/gh\//, mainlandPath);
  }
  const available = Object.keys(catalog.models).filter((id) => (!collection || !id.startsWith("other/")) && catalog.models[id].some((asset) => asset.manifest));
  const presentation = collection ? catalog.presentation : void 0;
  const localized = locale === "en" ? presentation?.en : presentation;
  const captions = collection === "girls-frontline" && locale !== "en" ? {
    "G11_0|LOADING": "唔，再让我睡会儿～",
    "G11_0|TIP": "这个……了解一下哦。",
    "G41|MOOD1": "啊哈哈哈。",
    "LEWIS|AGREE": "好，好。",
    "RFB|AGREE": "好！",
    "RFB|APPRECIATE": "好厉害！",
    "SAT8|MOOD2": "诶，等、等一下！",
    "VECTOR|MOOD2": "啊！",
    ...localized?.captions
  } : localized?.captions;
  const visibleId = (id) => {
    const alias = presentation?.aliases[id];
    return alias && available.includes(alias) ? alias : id;
  };
  const ids = collection === "girls-frontline" ? orderCollection(available.filter((id) => visibleId(id) === id), presentation?.outfitOrder ?? {}) : available;
  function resolve(id, source) {
    if (collection && !available.includes(id)) throw new Error("Model outside the selected collection: " + id);
    const variants = catalog.models[id] ?? [];
    const preferred = !source && collection && variants.find((item) => item.collectionDefault && item.manifest);
    const asset = preferred || variants.find((item) => item.manifest && (!source || item.source === source));
    if (!asset?.manifest) throw new Error("No model manifest for " + id);
    const assetUrl = (path, sourceName = asset.source) => {
      const source2 = catalog.sources[sourceName];
      const base = new URL(source2.baseUrl, sourceBase);
      const packs = base.hostname === "raw.githubusercontent.com" ? source2.packs : void 0;
      const pack = packs?.find((p) => p.directories.some((dir) => path.startsWith(dir + "/")));
      const target = new URL(path.split("/").map(encodeURIComponent).join("/"), pack?.baseUrl ?? base);
      return regionalUrl(target.href);
    };
    let dialogue;
    if (asset.dialogue) {
      let audio = audioBySource.get(asset.source);
      if (!audio) {
        audio = new Map((catalog.audio?.[asset.source] ?? []).map((path) => [path.toUpperCase(), assetUrl(path)]));
        audioBySource.set(asset.source, audio);
      }
      dialogue = { captions: locale === "en" ? void 0 : captions, url: assetUrl(asset.dialogue), audio };
    }
    const cues = asset.cues && (!asset.cueSource || collection && catalog.sources[asset.cueSource]) ? Object.fromEntries(
      Object.entries(asset.cues).map(([key, cue]) => [key, {
        ...cue,
        sound: cue.sound && (asset.cueSource ? assetUrl(cue.sound, asset.cueSource) : regionalUrl(cue.sound)),
        caption: locale === "en" ? cue.captionEn || cue.caption : cue.caption
      }])
    ) : void 0;
    const ratio = asset.sceneAspect;
    const sceneAspect = typeof ratio === "number" && Number.isFinite(ratio) && ratio > 0 ? ratio : void 0;
    const files = asset.files ? Object.fromEntries(Object.entries(asset.files).map(([path, replacement]) => [path, replacement && regionalUrl(replacement)])) : asset.files;
    return { cues, sceneAspect, hiddenDrawables: asset.hiddenDrawables, files, captions, modelUrl: assetUrl(asset.manifest), dialogue, soundAliases: asset.soundAliases };
  }
  const gallery = catalog.gallery ? Object.fromEntries(Object.entries(catalog.gallery).map(([id, entry]) => [id, entry.portrait ? { ...entry, portrait: regionalUrl(entry.portrait) } : entry])) : catalog.gallery;
  return { url: url.href, collection, locale, ids, gallery, visibleId, labels: localized?.labels ?? {}, resolve, legacyIds: catalog.legacyIds };
}

// package.json
var version = "2.9.9";

// src/distribution.ts
var globalCdn = "https://cdn.jsdelivr.net";
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
  return origin + "/gh/nova1751/live2d-api@catalog-9b7d10a1242fbed9/catalog/library.json";
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
        switchBy: options.switchBy,
        locale,
        ...options.catalog && { catalog: options.catalog },
        catalogUrl: catalogUrl && new URL(catalogUrl, document.baseURI).href,
        modelId,
        modelBaseUrl: modelBaseUrl && new URL(modelBaseUrl, document.baseURI).href,
        waifuPath: base + (locale === "en" ? "waifu-tips.en.json" : "waifu-tips.json"),
        modelUrl: modelUrl && new URL(modelUrl, document.baseURI).href,
        expandedZoom: options.expandedZoom,
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
async function loadWidget({ mode = "sequential", position = "left", baseUrl, modelUrl, coreUrl, modelBaseUrl, catalogUrl, catalog, modelId, collection, switchBy, locale, expandedZoom } = {}) {
  if (catalog) {
    if (catalogUrl && new URL(catalogUrl, document.baseURI).href !== catalog.url || collection && collection !== catalog.collection || locale && locale !== catalog.locale) {
      throw new TypeError("Widget options conflict with the supplied catalog");
    }
    catalogUrl = catalog.url;
    collection = catalog.collection;
    locale = catalog.locale;
  }
  if (collection !== void 0 && collection !== "all" && !collections.includes(collection)) throw new TypeError("Unknown Live2D collection: " + collection);
  if (collection === "all" && (modelUrl || modelBaseUrl)) throw new TypeError("Choose a collection or an explicit model source");
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
  if (!catalogUrl && !modelUrl && !modelBaseUrl) {
    catalogUrl = collection ? collectionCatalogUrl(githubLibrary(base), collection) : defaultLibraryUrl(base);
  }
  if (modelId && !catalogUrl) throw new TypeError("modelId requires a catalog");
  page[mounting] = mount(base.href, { modelUrl, coreUrl, modelBaseUrl, catalogUrl, catalog, modelId, collection, switchBy, locale, expandedZoom }, mode, position).catch((error) => {
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
