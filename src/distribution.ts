import { version } from '../package.json';

// Assets have their own release cadence. Code-only releases reuse the same immutable shards.
const snapshot = '/gh/nova1751/live2d-api@cdn-b3ac5ae545e2/';
const globalCdn = 'https://cdn.jsdelivr.net';
export const globalModels = globalCdn + snapshot;
const packageRoot = /\/live2dapi-noa(?:@[^/]+)?\/?$/;

export function scriptDirectory(src: string) {
  const url = new URL(src, document.baseURI);
  if (!packageRoot.test(url.pathname)) return new URL('.', url);
  if (!url.pathname.endsWith('/')) url.pathname += '/';
  url.search = url.hash = '';
  return url;
}

export function runtimeDirectory(src: string) {
  // A bundler can move the ESM entry into the application's own JS chunk.
  return /^https?:\/\//.test(src) && /\/widget\.mjs(?:[?#]|$)/.test(src) ? scriptDirectory(src) : new URL(globalCdn + '/npm/live2dapi-noa@' + version + '/');
}

export function modelDirectory(base: string) {
  const url = new URL(base, document.baseURI);
  if (!packageRoot.test(url.pathname) || /@1\.[^/]+\/?$/.test(url.pathname)) return base;
  const cdn = url.hostname === 'cdn.jsdmirror.com' ? url.origin : globalCdn;
  return cdn + snapshot;
}
