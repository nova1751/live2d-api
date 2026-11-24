/*! Live2D API | Generated from src/ | https://github.com/nova1751/live2d-api */

// package.json
var version = "2.9.12";

// src/distribution.ts
var repository = "/gh/nova1751/live2d-api";
var snapshot = repository + "@cdn-b3ac5ae545e2/";
var runtimeSnapshot = repository + "@widget-" + version + "/";
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

// src/collections.mts
if (window.innerWidth >= 768) {
  const entry = new URL(import.meta.url);
  const collection = entry.searchParams.get("collection") ?? "all";
  const baseUrl = scriptDirectory(entry.href);
  const runtime = new URL("widget.mjs", baseUrl);
  const { loadWidget } = await import(runtime.href);
  await loadWidget({
    collection,
    switchBy: "outfit",
    locale: entry.searchParams.get("lang") === "en" ? "en" : "zh-CN",
    baseUrl
  });
}
