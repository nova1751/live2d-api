/*! Live2D API | Generated from src/ | https://github.com/nova1751/live2d-api */

// src/runtime/request.ts
var loadTimeout = 15e3;
var loadLimit = 18e4;
var clockKey = Symbol.for("live2d.loadClock");
function loadClock(signal) {
  return signal?.[clockKey];
}
function shareLoadClock(child, parent) {
  const clock = loadClock(parent);
  if (clock) child[clockKey] = clock;
  else delete child[clockKey];
}
function loadDeadline(signal, expire) {
  const started = Date.now();
  const clock = signal[clockKey] = { last: started };
  let timer = setTimeout(check, loadTimeout);
  function check() {
    const left = Math.min(clock.last + loadTimeout, started + loadLimit) - Date.now();
    if (left <= 0) expire();
    else timer = setTimeout(check, left);
  }
  return () => {
    delete signal[clockKey];
    clearTimeout(timer);
  };
}
function trackResponse(response, signal) {
  const clock = loadClock(signal);
  if (!clock || !response.ok) return response;
  clock.last = Date.now();
  if (!response.body || typeof TransformStream === "undefined") return response;
  const body = response.body.pipeThrough(new TransformStream({
    transform(chunk, output) {
      clock.last = Date.now();
      output.enqueue(chunk);
    }
  }));
  const copy = new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
  Object.defineProperty(copy, "url", { value: response.url });
  return copy;
}
function appendResource(element, url) {
  return new Promise((resolve, reject) => {
    const finish = (error) => {
      clearTimeout(deadline);
      element.onload = element.onerror = null;
      if (error) {
        element.remove();
        reject(error);
      } else resolve();
    };
    const deadline = setTimeout(() => finish(new Error("Timed out loading " + url)), loadTimeout);
    element.onload = () => finish();
    element.onerror = () => finish(new Error("Failed to load " + url));
    document.head.appendChild(element);
  });
}
async function withLoadTimeout(load) {
  const controller = new AbortController();
  const cancel = loadDeadline(controller.signal, () => controller.abort(new Error("Live2D resource load timed out")));
  try {
    return await load(controller.signal);
  } finally {
    cancel();
  }
}

// src/renderer.ts
function isModern(url) {
  return url.pathname.toLowerCase().endsWith(".model3.json");
}
function createRenderer(base, legacy) {
  let pendingLegacy;
  let modernModule;
  let importAttempt = 0;
  let loading;
  let controller;
  let stage;
  let generation = 0;
  let hidden = false;
  function fetchLegacy() {
    if (pendingLegacy) return pendingLegacy;
    const script = document.createElement("script");
    script.src = base + "live2d.min.js";
    script.acceptCubism2 = (renderer) => {
      legacy = renderer;
    };
    return pendingLegacy = appendResource(script, script.src).then(() => {
      if (!legacy) throw new Error("Missing Cubism 2 renderer: " + script.src);
      return legacy;
    }).catch((error) => {
      pendingLegacy = void 0;
      throw error;
    });
  }
  function fetchModern(signal) {
    if (modernModule) return modernModule;
    const url = new URL("modern/renderer.mjs", base);
    if (importAttempt) url.searchParams.set("retry", String(importAttempt));
    const reset = () => {
      if (modernModule === pending) {
        modernModule = void 0;
        importAttempt++;
      }
    };
    const pending = import(
      /* webpackIgnore: true */
      /* @vite-ignore */
      url.href
    ).catch((error) => {
      reset();
      throw error;
    }).finally(() => signal.removeEventListener("abort", reset));
    signal.addEventListener("abort", reset, { once: true });
    return modernModule = pending;
  }
  const start = (canvas, model, options) => {
    const revision = ++generation;
    controller?.abort();
    controller = void 0;
    stage = void 0;
    hidden = false;
    const url = new URL(model, document.baseURI);
    if (!isModern(url)) {
      if (legacy) return legacy(canvas, model, options);
      return fetchLegacy().then((renderer) => {
        if (generation !== revision || options?.signal?.aborted) return;
        const ready = renderer(canvas, model, options);
        if (hidden) renderer.hide?.();
        return ready;
      });
    }
    if (legacy?.unload) legacy.unload();
    else legacy?.hide?.();
    const lifecycle = controller = new AbortController();
    const { signal } = lifecycle;
    shareLoadClock(signal, options?.signal);
    const stop = () => lifecycle.abort(options?.signal?.reason);
    options?.signal?.addEventListener("abort", stop, { once: true });
    const present = options?.onPaint;
    let finishPaint;
    const abortPaint = () => finishPaint?.();
    const painted = present && new Promise((resolve) => {
      finishPaint = resolve;
      signal.addEventListener("abort", abortPaint, { once: true });
    });
    const onPaint = present && ((output) => {
      present(output);
      finishPaint?.();
    });
    return fetchModern(signal).then(async (module) => {
      if (signal.aborted) return;
      const output = document.getElementById(canvas);
      if (!(output instanceof HTMLCanvasElement)) throw new Error("Missing Live2D canvas");
      const result = await module.mountModern(output, url.href, options?.coreUrl, signal, options?.dialogue, options?.framing, onPaint, options?.cues, options?.randomTap, options?.sceneAspect, { hidden: options?.hiddenDrawables, skipped: options?.skippedDrawables }, options?.files, options?.paint);
      if (signal.aborted) return;
      stage = result;
      if (hidden) stage.pause();
      await painted;
    }).catch((error) => {
      if (!signal.aborted) {
        controller = void 0;
        lifecycle.abort();
        throw error;
      }
    }).finally(() => {
      shareLoadClock(signal, void 0);
      signal.removeEventListener("abort", abortPaint);
      options?.signal?.removeEventListener("abort", stop);
    });
  };
  const render = (canvas, model, options) => {
    render.cancelLoad?.();
    if (!options?.onPaint) return start(canvas, model, options);
    const attempt = loading = new AbortController();
    const { signal } = attempt;
    const cancelDeadline = loadDeadline(signal, () => attempt.abort(new Error("Timed out waiting for the first model frame")));
    let stop;
    const aborted = new Promise((_, reject) => {
      stop = () => reject(signal.reason);
      signal.addEventListener("abort", stop, { once: true });
    });
    const painted = Promise.resolve().then(() => {
      if (!signal.aborted) return start(canvas, model, { ...options, signal });
    });
    return Promise.race([aborted, painted]).catch((error) => {
      attempt.abort(error);
      throw error;
    }).finally(() => {
      cancelDeadline();
      signal.removeEventListener("abort", stop);
      if (loading === attempt) loading = void 0;
    });
  };
  render.cancelLoad = () => loading?.abort(new DOMException("Model load superseded", "AbortError"));
  render.hide = () => {
    hidden = true;
    if (controller) stage?.pause();
    else legacy?.hide?.();
  };
  render.show = (start2) => {
    hidden = false;
    if (controller) stage?.resume();
    else legacy?.show?.(start2);
  };
  render.prepareInteraction = () => !controller && !!legacy?.prepareInteraction?.();
  render.playMotion = (group, index) => !hidden && (controller ? !!stage?.playMotion(group, index) : !!legacy?.playMotion?.(group, index));
  render.onNextPaint = (copy) => hidden ? void 0 : controller ? stage?.onNextPaint(copy) : legacy?.onNextPaint?.(copy);
  render.reframe = () => {
    if (controller) stage?.reframe();
    else legacy?.reframe?.();
  };
  render.capture = () => {
    if (controller) stage?.capture();
    return !!controller;
  };
  return render;
}

// src/runtime/cdn.ts
var MIRROR = "https://cdn.jsdmirror.com/gh/";
var JSDELIVR = "https://cdn.jsdelivr.net/gh/";
var RAW = "https://raw.githubusercontent.com/";
var COMMIT = /^[a-f\d]{40}$/i;
function mirrorRetryUrl(input) {
  if (!input.startsWith(MIRROR)) return;
  const url = new URL(input);
  if (url.searchParams.has("live2d-retry")) return;
  url.searchParams.set("live2d-retry", "1");
  return url.href;
}
function githubFile(input) {
  let match;
  if (input.startsWith(MIRROR) || input.startsWith(JSDELIVR)) {
    match = /^https:\/\/[^/]+\/gh\/([^/]+)\/([^/@]+)@([^/]+)\/([^?#]*)/.exec(input);
  } else if (input.startsWith(RAW)) {
    match = /^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\/([^?#]*)/.exec(input);
  } else return;
  if (!match) return;
  const [, owner, repo, ref, path] = match;
  return { owner, repo, ref, path };
}
var demoted = /* @__PURE__ */ new Map();
var DEMOTE_MS = 12e4;
var hostOf = (href) => {
  try {
    return new URL(href, document.baseURI).host;
  } catch {
    return "";
  }
};
var isDemoted = (href) => (demoted.get(hostOf(href)) ?? 0) > Date.now();
function cdnAlternates(input) {
  const file = githubFile(input);
  const retry = mirrorRetryUrl(input);
  if (!file) return retry ? [retry] : [];
  const { owner, repo, ref, path } = file;
  const mirror = `${MIRROR}${owner}/${repo}@${ref}/${path}`;
  const jsdelivr = `${JSDELIVR}${owner}/${repo}@${ref}/${path}`;
  const raw = `${RAW}${owner}/${repo}/${ref}/${path}`;
  const others = input.startsWith(MIRROR) ? [retry, jsdelivr, ...COMMIT.test(ref) ? [raw] : []] : input.startsWith(JSDELIVR) ? [...COMMIT.test(ref) ? [raw] : [], mirror] : [jsdelivr, mirror];
  const unique = others.filter((href, index) => href && href !== input && others.indexOf(href) === index);
  return [...unique.filter((href) => !isDemoted(href)), ...unique.filter(isDemoted)];
}
var transient = (status) => status === 403 || status === 421 || status === 429 || status >= 500;
async function fetchCdnAsset(url, signal, progressSignal = signal) {
  const candidates = isDemoted(url) ? [...cdnAlternates(url), url] : [url, ...cdnAlternates(url)];
  let last;
  let failure;
  for (const candidate of candidates) {
    signal?.throwIfAborted();
    try {
      const response = await fetch(candidate, { signal });
      if (response.ok || !transient(response.status)) return trackResponse(response, progressSignal);
      void response.body?.cancel().catch(() => {
      });
      last = response;
    } catch (error) {
      if (signal?.aborted) throw error;
      failure = error;
    }
    if (candidates.length > 1) demoted.set(hostOf(candidate), Date.now() + DEMOTE_MS);
  }
  if (last) return last;
  throw failure;
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
  return withLoadTimeout(async (signal) => {
    const response = await fetchCdnAsset(url.href, signal);
    if (!response.ok) throw new Error(`Cannot load catalog ${url.href} (HTTP ${response.status})`);
    const catalog = await response.json();
    return parseModelCatalog(catalog, url, collection, locale, response.url || url.href, assetCdn);
  });
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
  const catalogAssetUrl = (href) => regionalUrl(href.startsWith("./") ? new URL(href, sourceBase).href : href);
  const available = new Set(Object.keys(catalog.models).filter((id) => (!collection || !id.startsWith("other/")) && catalog.models[id].some((asset) => asset.manifest)));
  const hasModel = (id) => available.has(id);
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
    // Parenthesized sound descriptions are distinct from spoken dialogue.
    "98K|MOOD1": "（笑）",
    "GENERALLIU|MOOD1": "（笑）",
    "HK416|MOOD1": "（笑）",
    "LTLX7000|MOOD1": "（笑）",
    "SPAS15|MOOD1": "（笑）",
    "ZB26|MOOD1": "（笑）",
    "G41|MOOD2": "（吃惊）",
    ...localized?.captions
  } : localized?.captions;
  const visibleId = (id) => {
    const alias = presentation?.aliases[id];
    return alias && hasModel(alias) ? alias : id;
  };
  const ids = collection === "girls-frontline" ? orderCollection([...available].filter((id) => visibleId(id) === id), presentation?.outfitOrder ?? {}) : [...available];
  function resolve(id, source) {
    if (collection && !hasModel(id)) throw new Error("Model outside the selected collection: " + id);
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
        sound: cue.sound && (asset.cueSource ? assetUrl(cue.sound, asset.cueSource) : catalogAssetUrl(cue.sound)),
        caption: locale === "en" ? cue.captionEn || cue.caption : cue.caption
      }])
    ) : void 0;
    const ratio = asset.sceneAspect;
    const sceneAspect = typeof ratio === "number" && Number.isFinite(ratio) && ratio > 0 ? ratio : void 0;
    const files = asset.files ? Object.fromEntries(Object.entries(asset.files).map(([path, replacement]) => [path, replacement && catalogAssetUrl(replacement)])) : asset.files;
    return { cues, sceneAspect, hiddenDrawables: asset.hiddenDrawables, skippedDrawables: asset.skippedDrawables, files, captions, modelUrl: assetUrl(asset.manifest), dialogue, soundAliases: asset.soundAliases };
  }
  const gallery = catalog.gallery ? Object.fromEntries(Object.entries(catalog.gallery).map(([id, entry]) => [id, entry.portrait ? { ...entry, portrait: regionalUrl(entry.portrait) } : entry])) : catalog.gallery;
  return { url: url.href, collection, locale, ids, gallery, visibleId, hasModel, labels: localized?.labels ?? {}, resolve, legacyIds: catalog.legacyIds };
}

// package.json
var version = "2.9.32";

// src/distribution.ts
var repository = "/gh/nova1751/live2d-api";
var snapshot = repository + "@cdn-b3ac5ae545e2/";
var runtimeSnapshot = repository + "@widget-" + version + "/";
var globalCdn = "https://cdn.jsdelivr.net";
var widgetSnapshot = /\/gh\/nova1751\/live2d-api@widget-[^/]+\/?$/;
var packageRoot = /\/live2dapi-noa(?:@[^/]+)?\/?$/;
var releaseRoots = ["", "@latest", "@" + version, "@v" + version].map((ref) => repository + ref);
function useRuntimeSnapshot(base) {
  if (releaseRoots.includes(base.pathname.replace(/\/$/, ""))) base.pathname = runtimeSnapshot;
  return base;
}
function scriptDirectory(src) {
  const url = new URL(src, document.baseURI);
  if (releaseRoots.includes(url.pathname.replace(/\/$/, ""))) return useRuntimeSnapshot(url);
  if (!packageRoot.test(url.pathname)) return useRuntimeSnapshot(new URL(".", url));
  if (!url.pathname.endsWith("/")) url.pathname += "/";
  url.search = url.hash = "";
  return url;
}
function runtimeDirectory(src) {
  return /^https?:\/\//.test(src) && /\/widget\.mjs(?:[?#]|$)/.test(src) ? scriptDirectory(src) : new URL(globalCdn + runtimeSnapshot);
}
function githubLibrary(base) {
  const origin = base.hostname === "cdn.jsdmirror.com" ? base.origin : globalCdn;
  return origin + "/gh/nova1751/live2d-api@catalog-67dd9f130a8f5798/catalog/library.json";
}
function defaultLibraryUrl(base) {
  if (!packageRoot.test(base.pathname) && !widgetSnapshot.test(base.pathname)) return void 0;
  return githubLibrary(base);
}

// src/widget.mts
var mounting = Symbol.for("live2dapi-noa.mounting");
var scripts = /* @__PURE__ */ new Map();
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
  useRuntimeSnapshot(base);
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
