/*! Live2D API | Generated from src/ | https://github.com/nova1751/live2d-api */
import { loadGirlsFrontline } from "./widget.mjs";
if (window.innerWidth >= 768) {
  const entry = new URL(import.meta.url);
  const locale = entry.searchParams.get("lang") === "en" ? "en" : "zh-CN";
  const ready = entry.searchParams.has("collection") ? import("./collections.mjs" + entry.search) : loadGirlsFrontline({ locale, baseUrl: new URL(".", entry) });
  ready.catch((error) => console.error("[Live2D]", error));
}
