/*! Live2D API | Generated from src/ | https://github.com/nova1751/live2d-api */
"use strict";
(() => {
  // src/autoload.ts
  var script = document.currentScript;
  if (script && window.innerWidth >= 768) {
    const { mode, position } = script.dataset;
    import(new URL("widget.mjs", script.src).href).then((module) => module.loadWidget({
      mode,
      position
    })).catch((error) => console.error("[Live2D]", error));
  }
})();
