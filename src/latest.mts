import { version as fallback } from '../package.json';

// The bootstrap can be cached indefinitely. Every runtime asset uses the same release.
const entry = new URL(import.meta.url);
const mainland = entry.hostname === 'cdn.jsdmirror.com';
const cdn = mainland ? 'https://cdn.jsdmirror.com' : 'https://cdn.jsdelivr.net';
const registry = mainland ? 'https://registry.npmmirror.com' : 'https://registry.npmjs.org';

async function latestVersion() {
  const request = new AbortController();
  const timer = setTimeout(() => request.abort(), 2500);
  try {
    const response = await fetch(registry + '/live2dapi-noa/latest', { signal: request.signal, credentials: 'omit' });
    if (response.ok) {
      const { version } = await response.json();
      if (typeof version === 'string' && /^\d+\.\d+\.\d+$/.test(version) &&
          version.localeCompare(fallback, 'en', { numeric: true }) >= 0) return version;
    }
  } catch { /* The packaged release is usable when the registry is offline. */ }
  finally { clearTimeout(timer); }
  return fallback;
}

function mount(version: string) {
  return import(cdn + '/gh/nova1751/live2d-api@widget-' + version + '/girls-frontline.mjs' + entry.search);
}

if (window.innerWidth >= 768) {
  const version = await latestVersion();
  try { await mount(version); }
  catch (error) {
    if (version === fallback) throw error;
    await mount(fallback);
  }
}
