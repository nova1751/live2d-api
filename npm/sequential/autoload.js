/*! Live2D API | Generated from src/ | https://github.com/nova1751/live2d-api */
"use strict";
const live2d_path = (() => {
  const script = document.currentScript;
  if (script?.src) {
    const url = new URL(script.src);
    if (/\/(?:live2dapi-noa|gh\/nova1751\/live2d-api)(?:@[^/]+)?\/(?:npm|jsdelivr)\/(?:random|sequential)\/autoload(?:\.min)?\.js$/.test(url.pathname)) {
      return new URL("../../", url).href;
    }
  }
  return true ? "https://unpkg.com/live2dapi-noa@2.0.0/" : "https://cdn.jsdelivr.net/npm/live2dapi-noa@2.0.0/";
})();
function loadExternalResource(url, type) {
  let tag;
  if (type === "css") {
    const link = document.createElement("link");
    link.href = url;
    link.rel = "stylesheet";
    tag = link;
  } else {
    const script = document.createElement("script");
    script.src = url;
    if (url === live2d_path + "npm/sequential/waifu-tips.js") {
      script.dataset.asteroidsUrl = live2d_path + "asteroids.js";
    }
    tag = script;
  }
  return new Promise((resolve, reject) => {
    tag.onload = () => resolve(url);
    tag.onerror = () => reject(url);
    document.head.appendChild(tag);
  });
}
if (screen.width >= 768) {
  Promise.all([
    loadExternalResource(live2d_path + "live2d.min.js", "js"),
    loadExternalResource(live2d_path + "npm/sequential/waifu-tips.js", "js")
  ]).then(async () => {
    if (!document.body) {
      await new Promise((resolve) => document.addEventListener("DOMContentLoaded", () => resolve(), { once: true }));
    }
    window.initWidget({
      tools: ["hitokoto", "asteroids", "switch-model", "switch-texture", "photo", "info", "quit"],
      cdnPath: live2d_path,
      waifuPath: live2d_path + "waifu-tips.json"
    });
  }).catch((error) => console.error("[Live2D]", error));
}
