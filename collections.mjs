/*! Live2D API | Generated from src/ | https://github.com/nova1751/live2d-api */
import { loadWidget } from "./widget.mjs";
if (window.innerWidth >= 768) {
  const entry = new URL(import.meta.url);
  const collection = entry.searchParams.get("collection") ?? "all";
  loadWidget({
    collection,
    switchBy: "outfit",
    locale: entry.searchParams.get("lang") === "en" ? "en" : "zh-CN",
    baseUrl: new URL(".", entry)
  }).catch((error) => console.error("[Live2D]", error));
}
