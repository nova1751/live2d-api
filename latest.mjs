/*! Live2D API | Generated from src/ | https://github.com/nova1751/live2d-api */

// package.json
var version = "2.9.41";

// src/latest.mts
var entry = new URL(import.meta.url);
var mainland = entry.hostname === "cdn.jsdmirror.com";
var cdn = mainland ? "https://cdn.jsdmirror.com" : "https://cdn.jsdelivr.net";
var registry = mainland ? "https://registry.npmmirror.com" : "https://registry.npmjs.org";
async function latestVersion() {
  const request = new AbortController();
  const timer = setTimeout(() => request.abort(), 2500);
  try {
    const response = await fetch(registry + "/live2dapi-noa/latest", { signal: request.signal, credentials: "omit" });
    if (response.ok) {
      const { version: version2 } = await response.json();
      if (typeof version2 === "string" && /^\d+\.\d+\.\d+$/.test(version2) && version2.localeCompare(version, "en", { numeric: true }) >= 0) return version2;
    }
  } catch {
  } finally {
    clearTimeout(timer);
  }
  return version;
}
function mount(version2) {
  return import(cdn + "/gh/nova1751/live2d-api@widget-" + version2 + "/girls-frontline.mjs" + entry.search);
}
if (window.innerWidth >= 768) {
  const version2 = await latestVersion();
  try {
    await mount(version2);
  } catch (error) {
    if (version2 === version) throw error;
    await mount(version);
  }
}
