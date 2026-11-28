import { ensureCubismCore, OFFICIAL_CUBISM_CORE_URL } from 'live2d-web';
import { cdnCandidates } from '../runtime/cdn';

// Long enough for a slow but working connection to the official host, short enough that a
// stalled one does not leave the model loading for live2d-web's full 30 second timeout.
const OFFICIAL_WAIT_MS = 8000;

// The fallback copy lives in its own immutable tag (scripts/publish-cubism-core.mts), outside the
// runtime package, so pages download it only when the official host fails. The tag name is the
// start of the file's SHA-256; the build checks it against vendor/cubism-core.
const PINNED_CORE_PATH = '/gh/nova1751/live2d-api@cubism-core-8741f739779b/live2dcubismcore.min.js';

interface CoreGlobal { Live2DCubismCore?: object }
let shared: Promise<void> | undefined;

/** The pinned copy on the GitHub CDN this renderer came from, such as JSDMirror for mainland pages. */
function pinnedCoreUrl() {
  const mainland = new URL(import.meta.url).hostname === 'cdn.jsdmirror.com';
  return (mainland ? 'https://cdn.jsdmirror.com' : 'https://cdn.jsdelivr.net') + PINNED_CORE_PATH;
}

/**
 * Load Live2D Cubism Core from the official host, falling back to the pinned copy on the GitHub
 * CDNs when that host fails or stalls.
 */
export function loadCubismCore(signal: AbortSignal): Promise<void> {
  // One load per page, shared by every model. A cancelled model must not cancel the others.
  shared ??= load().catch(error => { shared = undefined; throw error; });
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    if (signal.aborted) return abort();
    signal.addEventListener('abort', abort, { once: true });
    shared!.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

async function load() {
  // Without a signal, this tracks the official script until it loads, errors or times out.
  const official = ensureCubismCore(OFFICIAL_CUBISM_CORE_URL);
  // Handled below, or deliberately ignored once the pinned copy has taken over.
  official.catch(() => {});
  let timer = 0;
  const stalled = new Promise<'stalled'>(resolve => { timer = window.setTimeout(() => resolve('stalled'), OFFICIAL_WAIT_MS); });
  try {
    if (await Promise.race([official, stalled]) !== 'stalled') return;
  } catch (error) {
    console.warn('[Live2D] Official Cubism Core unavailable, using the pinned copy', error);
  } finally {
    clearTimeout(timer);
  }
  const pinned = pinnedCoreUrl();
  let failure: unknown;
  for (const url of cdnCandidates(pinned, { script: true })) {
    try {
      // Resolves at once if the stalled official script finished in the meantime.
      await Promise.race([ensureCubismCore(url), official.catch(() => new Promise<never>(() => {}))]);
      failure = undefined;
      break;
    } catch (error) {
      failure = error;
    }
  }
  if (failure) throw failure;
  // Either copy may still execute later and would replace the classes on the shared namespace
  // while models built from the first are alive. The Core assigns that namespace only while its
  // script runs (its WebAssembly start-up writes to a separate module object), so freezing it
  // makes a late copy a no-op.
  const core = (window as CoreGlobal).Live2DCubismCore;
  if (core && !Object.isFrozen(core)) Object.freeze(core);
}
