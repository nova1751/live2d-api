/*! Live2D API | Generated from src/ | https://github.com/nova1751/live2d-api */
import { loadGirlsFrontline } from "./widget.mjs";
if (window.innerWidth >= 768) {
  loadGirlsFrontline({ baseUrl: new URL(".", import.meta.url) }).catch((error) => console.error("[Live2D]", error));
}
