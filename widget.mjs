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
        renderer(canvas, model, options);
        if (hidden) renderer.hide?.();
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
      const result = await module.mountModern(document.getElementById(canvas), url.href, options?.coreUrl, signal);
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

// package.json
var version = "2.0.0";

// src/distribution.ts
var snapshot = "/gh/nova1751/live2d-api@cdn-b3ac5ae545e2/";
var globalCdn = "https://cdn.jsdelivr.net";
var globalModels = globalCdn + snapshot;
var packageRoot = /\/live2dapi-noa(?:@[^/]+)?\/?$/;
function scriptDirectory(src) {
  const url = new URL(src, document.baseURI);
  if (!packageRoot.test(url.pathname)) return new URL(".", url);
  if (!url.pathname.endsWith("/")) url.pathname += "/";
  url.search = url.hash = "";
  return url;
}
function runtimeDirectory(src) {
  return /^https?:\/\//.test(src) && /\/widget\.mjs(?:[?#]|$)/.test(src) ? scriptDirectory(src) : new URL(globalCdn + "/npm/live2dapi-noa@" + version + "/");
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
async function mount(base, mode, position, modelUrl, coreUrl, modelBaseUrl) {
  const style = document.createElement("link");
  style.rel = "stylesheet";
  style.href = base + `css/${position}.css`;
  try {
    const [, , initWidget] = await Promise.all([
      appendResource(style, style.href),
      modelUrl && isModern(new URL(modelUrl, document.baseURI)) ? window.loadlive2d = createRenderer(base) : loadScript(base + "live2d.min.js", "loadlive2d"),
      loadScript(base + `jsdelivr/${mode}/waifu-tips.js`, "initWidget", base + "asteroids.js")
    ]);
    if (!document.body) {
      await new Promise((resolve) => document.addEventListener("DOMContentLoaded", () => resolve(), { once: true }));
    }
    if (!document.getElementById("waifu-toggle")) {
      initWidget({
        cdnPath: base,
        modelBaseUrl: modelBaseUrl && new URL(modelBaseUrl, document.baseURI).href,
        waifuPath: base + "waifu-tips.json",
        modelUrl: modelUrl && new URL(modelUrl, document.baseURI).href,
        coreUrl: coreUrl && new URL(coreUrl, document.baseURI).href
      });
    }
  } catch (error) {
    style.remove();
    throw error;
  }
}
async function loadWidget({ mode = "sequential", position = "left", baseUrl, modelUrl, coreUrl, modelBaseUrl } = {}) {
  if (!["random", "sequential"].includes(mode)) throw new TypeError("Invalid Live2D mode");
  if (!["left", "right"].includes(position)) throw new TypeError("Invalid Live2D position");
  const page = document;
  if (page[mounting]) return page[mounting];
  if (document.getElementById("waifu-toggle")) return;
  const base = baseUrl === void 0 ? runtimeDirectory(import.meta.url) : new URL(baseUrl, document.baseURI);
  if (!base.pathname.endsWith("/")) base.pathname += "/";
  base.search = "";
  base.hash = "";
  page[mounting] = mount(base.href, mode, position, modelUrl, coreUrl, modelBaseUrl).catch((error) => {
    delete page[mounting];
    throw error;
  });
  return page[mounting];
}
export {
  loadWidget
};
