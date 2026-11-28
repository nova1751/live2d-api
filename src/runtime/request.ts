/** A load is abandoned once this long passes without any network progress. */
export const loadTimeout = 15000;
/** Even while bytes keep trickling in, give up after this long. */
const loadLimit = 180000;

// A model load crosses independently bundled renderers. Carry its clock on that load's
// signal so activity elsewhere on the embedding page cannot keep a stalled model alive.
const clockKey = Symbol.for('live2d.loadClock');
type LoadSignal = AbortSignal & { [clockKey]?: { last: number } };
export function loadClock(signal?: LoadSignal) { return signal?.[clockKey]; }
export function shareLoadClock(child: LoadSignal, parent?: LoadSignal) {
  const clock = loadClock(parent);
  if (clock) child[clockKey] = clock;
  else delete child[clockKey];
}

export function loadDeadline(signal: LoadSignal, expire: () => void) {
  const started = Date.now();
  const clock = signal[clockKey] = { last: started };
  let timer = setTimeout(check, loadTimeout);
  function check() {
    const left = Math.min(clock.last + loadTimeout, started + loadLimit) - Date.now();
    if (left <= 0) expire();
    else timer = setTimeout(check, left);
  }
  return () => { delete signal[clockKey]; clearTimeout(timer); };
}

/** Count bytes as the consumer reads them, keeping response.url for relative paths. */
export function trackResponse(response: Response, signal?: AbortSignal) {
  const clock = loadClock(signal);
  if (!clock || !response.ok) return response;
  clock.last = Date.now();
  if (!response.body || typeof TransformStream === 'undefined') return response;
  const body = response.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, output) { clock.last = Date.now(); output.enqueue(chunk); },
  }));
  const copy = new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
  Object.defineProperty(copy, 'url', { value: response.url });
  return copy;
}

export function isLoadCancelled(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError';
}

export function appendResource(element: HTMLScriptElement | HTMLLinkElement, url: string) {
  return new Promise<void>((resolve, reject) => {
    const finish = (error?: Error) => {
      clearTimeout(deadline);
      element.onload = element.onerror = null;
      if (error) { element.remove(); reject(error); }
      else resolve();
    };
    const deadline = setTimeout(() => finish(new Error('Timed out loading ' + url)), loadTimeout);
    element.onload = () => finish();
    element.onerror = () => finish(new Error('Failed to load ' + url));
    document.head.appendChild(element);
  });
}

/** `outer` lets a caller cancel too, for example when a newer request supersedes this one. */
export async function withLoadTimeout<T>(load: (signal: AbortSignal) => Promise<T>, outer?: AbortSignal): Promise<T> {
  const controller = new AbortController();
  const cancel = loadDeadline(controller.signal, () => controller.abort(new Error('Live2D resource load timed out')));
  const forward = () => controller.abort(outer!.reason);
  if (outer?.aborted) forward();
  else outer?.addEventListener('abort', forward, { once: true });
  try { return await load(controller.signal); }
  finally {
    cancel();
    outer?.removeEventListener('abort', forward);
  }
}

export async function getJson<T>(url: string, outer?: AbortSignal): Promise<T> {
  return withLoadTimeout(async signal => {
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error(`Failed to load ${url} (HTTP ${response.status})`);
    return trackResponse(response, signal).json();
  }, outer);
}
