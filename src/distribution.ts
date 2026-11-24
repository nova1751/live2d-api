import { version } from '../package.json';

// Assets have their own release cadence. Code-only releases reuse the same immutable shards.
const repository = '/gh/nova1751/live2d-api';
const snapshot = repository + '@cdn-b3ac5ae545e2/';
const runtimeSnapshot = repository + '@widget-' + version + '/';
const globalCdn = 'https://cdn.jsdelivr.net';
const widgetSnapshot = /\/gh\/nova1751\/live2d-api@widget-[^/]+\/?$/;
const packageRoot = /\/live2dapi-noa(?:@[^/]+)?\/?$/;
const releaseRoots = ['', '@latest', '@' + version, '@v' + version].map(ref => repository + ref);

export function useRuntimeSnapshot(base: URL) {
  // The source tag contains models and may exceed a GitHub CDN's size limit.
  if (releaseRoots.includes(base.pathname.replace(/\/$/, ''))) base.pathname = runtimeSnapshot;
  return base;
}

export function scriptDirectory(src: string) {
  const url = new URL(src, document.baseURI);
  if (releaseRoots.includes(url.pathname.replace(/\/$/, ''))) return useRuntimeSnapshot(url);
  if (!packageRoot.test(url.pathname)) return useRuntimeSnapshot(new URL('.', url));
  if (!url.pathname.endsWith('/')) url.pathname += '/';
  url.search = url.hash = '';
  return url;
}

export function runtimeDirectory(src: string) {
  // A bundler can move the ESM entry into the application's own JS chunk.
  return /^https?:\/\//.test(src) && /\/widget\.mjs(?:[?#]|$)/.test(src) ? scriptDirectory(src) : new URL(globalCdn + runtimeSnapshot);
}

export function githubLibrary(base: URL) {
  const origin = base.hostname === 'cdn.jsdmirror.com' ? base.origin : globalCdn;
  return origin + '/gh/nova1751/live2d-api@' + LIBRARY_TAG + '/catalog/library.json';
}

export function modelDirectory(base: string) {
  const url = new URL(base, document.baseURI);
  if ((!packageRoot.test(url.pathname) && !widgetSnapshot.test(url.pathname)) || /@1\.[^/]+\/?$/.test(url.pathname)) return base;
  return fallbackModelDirectory(base);
}

export function fallbackModelDirectory(base: string) {
  const url = new URL(base, document.baseURI);
  return (url.hostname === 'cdn.jsdmirror.com' ? url.origin : globalCdn) + snapshot;
}

export function defaultLibraryUrl(base: URL) {
  if (!packageRoot.test(base.pathname) && !widgetSnapshot.test(base.pathname)) return undefined;
  return githubLibrary(base);
}
