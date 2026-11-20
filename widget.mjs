/*! Live2D API | Generated from src/ | https://github.com/nova1751/live2d-api */

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
async function mount(base, mode, position) {
  const style = document.createElement("link");
  style.rel = "stylesheet";
  style.href = base + `css/${position}.css`;
  try {
    const [, , initWidget] = await Promise.all([
      appendResource(style, style.href),
      loadScript(base + "live2d.min.js", "loadlive2d"),
      loadScript(base + `jsdelivr/${mode}/waifu-tips.js`, "initWidget", base + "asteroids.js")
    ]);
    if (!document.body) {
      await new Promise((resolve) => document.addEventListener("DOMContentLoaded", () => resolve(), { once: true }));
    }
    if (!document.getElementById("waifu-toggle")) {
      initWidget({ cdnPath: base, waifuPath: base + "waifu-tips.json" });
    }
  } catch (error) {
    style.remove();
    throw error;
  }
}
async function loadWidget({ mode = "sequential", position = "left", baseUrl } = {}) {
  if (!["random", "sequential"].includes(mode)) throw new TypeError("Invalid Live2D mode");
  if (!["left", "right"].includes(position)) throw new TypeError("Invalid Live2D position");
  const page = document;
  if (page[mounting]) return page[mounting];
  if (document.getElementById("waifu-toggle")) return;
  const base = baseUrl === void 0 ? new URL(".", import.meta.url) : new URL(baseUrl, document.baseURI);
  if (!base.pathname.endsWith("/")) base.pathname += "/";
  base.search = "";
  base.hash = "";
  page[mounting] = mount(base.href, mode, position).catch((error) => {
    delete page[mounting];
    throw error;
  });
  return page[mounting];
}
export {
  loadWidget
};
