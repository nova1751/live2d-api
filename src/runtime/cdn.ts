import { trackResponse } from './request.ts';

const MIRROR = 'https://cdn.jsdmirror.com/gh/';
const JSDELIVR = 'https://cdn.jsdelivr.net/gh/';
const RAW = 'https://raw.githubusercontent.com/';
const COMMIT = /^[a-f\d]{40}$/i;

/**
 * The page picks its host family once, with its first CDN request: when the first host has not
 * started answering (response headers, not the whole file) within this long, the other family
 * starts in parallel and whichever answers first serves the rest of the page. Only that first
 * request races, before a model's dozens of files compete for the connection, so a working host
 * is rarely this slow. A host that fails outright hands over at once instead.
 */
export const HEDGE_MS = 2000;
/** How long the host family that answered first stays preferred, so later visits skip the wait. */
const PREFERENCE_MS = 86_400_000;
const PREFERENCE_KEY = 'live2d-cdn';

export type CdnFamily = 'global' | 'mainland';

/** Retry the same immutable resource through a fresh cache key on JSDMirror. */
export function mirrorRetryUrl(input: string): string | undefined {
  if (!input.startsWith(MIRROR)) return;
  const url = new URL(input);
  if (url.searchParams.has('live2d-retry')) return;
  url.searchParams.set('live2d-retry', '1');
  return url.href;
}

/** Split a GitHub CDN or raw URL into owner, repo, ref and path. */
function githubFile(input: string) {
  let match: RegExpExecArray | null;
  if (input.startsWith(MIRROR) || input.startsWith(JSDELIVR)) {
    match = /^https:\/\/[^/]+\/gh\/([^/]+)\/([^/@]+)@([^/]+)\/([^?#]*)/.exec(input);
  } else if (input.startsWith(RAW)) {
    match = /^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\/([^?#]*)/.exec(input);
  } else return;
  if (!match) return;
  const [, owner, repo, ref, path] = match;
  return { owner, repo, ref, path };
}

/**
 * raw.githubusercontent.com needs a real Git ref. Commits and named tags such as cdn-… or v2.9.38
 * are; jsDelivr's own aliases (latest, or a bare version range like 2 or 2.9) are not.
 */
function onRaw(ref: string) {
  return COMMIT.test(ref) || (ref !== 'latest' && /[^\d.]/.test(ref));
}

const familyOf = (href: string): CdnFamily | undefined =>
  href.startsWith(MIRROR) ? 'mainland' : href.startsWith(JSDELIVR) || href.startsWith(RAW) ? 'global' : undefined;

// The widget, the renderer and the gallery are separate bundles with their own copy of this module.
// Keep the choice on the page so a host found by one serves the others too.
interface PreferenceState {
  /** The family tried first: the page's choice, else the one remembered from a recent visit. */
  family?: CdnFamily;
  loaded?: boolean;
  /** This page has settled on `family`; later requests go there directly. */
  decided?: boolean;
  /** The first request, still finding out which family answers. Others wait for it. */
  race?: Promise<unknown>;
}
const preferenceKey = Symbol.for('live2d.cdnPreference');
const state = ((globalThis as unknown as Record<symbol, PreferenceState | undefined>)[preferenceKey] ??= {});

/** The host family this page uses, or the one that answered first on this browser recently. */
export function cdnPreference(): CdnFamily | undefined {
  if (!state.loaded) {
    state.loaded = true;
    try {
      const saved = JSON.parse(localStorage.getItem(PREFERENCE_KEY) ?? 'null') as { family?: CdnFamily; until?: number } | null;
      if (saved && (saved.family === 'global' || saved.family === 'mainland') && Number(saved.until) > Date.now()) state.family = saved.family;
    } catch { /* Storage can be blocked or hold something else; start without a preference. */ }
  }
  return state.family;
}

/**
 * Use `family` for this page without racing the hosts; another family is tried only when it
 * fails. Remembered for a day unless `persist` is false, as for a one-off choice such as the
 * gallery's ?cdn= parameter.
 */
export function setCdnPreference(family: CdnFamily, persist = true) {
  state.loaded = true;
  state.family = family;
  state.decided = true;
  if (!persist) return;
  try { localStorage.setItem(PREFERENCE_KEY, JSON.stringify({ family, until: Date.now() + PREFERENCE_MS })); }
  catch { /* Not remembered across visits, which only costs the hedge delay next time. */ }
}

const demoted = new Map<string, number>();
const DEMOTE_MS = 120_000;
// Callers may pass page-relative URLs; resolve them instead of throwing.
const hostOf = (href: string) => { try { return new URL(href, document.baseURI).host; } catch { return ''; } };
const isDemoted = (href: string) => (demoted.get(hostOf(href)) ?? 0) > Date.now();

/**
 * Every place serving this file, in the order to try them. Commit- and tag-pinned GitHub files are
 * identical on jsDelivr, raw.githubusercontent.com and JSDMirror. The family this page settled on
 * goes first; before that, the one remembered from a recent visit; otherwise the one the link
 * names, so a site embedding from the mirror starts there and everyone else starts with the global
 * hosts. `script` leaves out raw GitHub: it serves code as text/plain with
 * nosniff, which browsers refuse to run. Hosts that failed recently move to the back for a while.
 */
export function cdnCandidates(input: string, { script = false } = {}): string[] {
  const file = githubFile(input);
  if (!file) {
    const retry = mirrorRetryUrl(input);
    return retry ? [input, retry] : [input];
  }
  const { owner, repo, ref, path } = file;
  const mirror = `${MIRROR}${owner}/${repo}@${ref}/${path}`;
  const jsdelivr = `${JSDELIVR}${owner}/${repo}@${ref}/${path}`;
  const raw = !script && onRaw(ref) ? `${RAW}${owner}/${repo}/${ref}/${path}` : undefined;
  // A raw link stays first among the global hosts: large repositories may exceed jsDelivr's limits.
  const global = input.startsWith(RAW) ? [raw, jsdelivr] : [jsdelivr, raw];
  const mainland = [mirror, mirrorRetryUrl(mirror)];
  const family = cdnPreference() ?? familyOf(input);
  const ordered = family === 'mainland' ? [mainland[0], ...global, mainland[1]] : [...global, ...mainland];
  const unique = ordered.filter((href, index): href is string => !!href && ordered.indexOf(href) === index);
  return [...unique.filter(href => !isDemoted(href)), ...unique.filter(isDemoted)];
}

/** Other places serving the same file, most preferred first. */
export function cdnAlternates(input: string, options?: { script?: boolean }): string[] {
  return cdnCandidates(input, options).filter(href => href !== input);
}

// Statuses that point at the CDN rather than the file: blocked, rate limited, misrouted or down.
const transient = (status: number) => status === 403 || status === 421 || status === 429 || status >= 500;

/**
 * Fetch a CDN asset. The page's first CDN request picks the host family (see `race`); requests
 * made meanwhile wait for that choice, and later ones go straight to the chosen family. From then
 * on another host is tried only when one fails: a network error or a transient status hands over
 * at once, with no timer. A 404 is final: the file is genuinely missing at that commit.
 */
export async function fetchCdnAsset(url: string, signal?: AbortSignal, progressSignal = signal): Promise<Response> {
  if (githubFile(url)) {
    while (!state.decided && state.race) await until(state.race, signal);
    if (!state.decided) {
      const race = raceHosts(cdnCandidates(url), signal, progressSignal);
      state.race = race;
      try { return await race; }
      finally { if (state.race === race) state.race = undefined; }
    }
  }
  return failover(cdnCandidates(url), signal, progressSignal);
}

/** Wait for `promise` to settle either way, unless `signal` cancels first. */
function until(promise: Promise<unknown>, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) { reject(signal.reason); return; }
    const abort = () => reject(signal!.reason);
    signal?.addEventListener('abort', abort, { once: true });
    promise.then(() => {}, () => {}).then(() => { signal?.removeEventListener('abort', abort); resolve(); });
  });
}

/** Try each host in turn, moving on only when one fails. */
async function failover(candidates: string[], signal?: AbortSignal, progressSignal = signal): Promise<Response> {
  let last: Response | undefined;
  let failure: unknown;
  for (const candidate of candidates) {
    signal?.throwIfAborted();
    try {
      const response = await fetch(candidate, { signal });
      if (response.ok || !transient(response.status)) return trackResponse(response, progressSignal);
      void response.body?.cancel().catch(() => {});
      last = response;
    } catch (error) {
      if (signal?.aborted) throw error;
      failure = error;
    }
    // Only demote shared CDNs; a failing same-origin or third-party host has no alternative anyway.
    if (candidates.length > 1) demoted.set(hostOf(candidate), Date.now() + DEMOTE_MS);
  }
  if (last) return last;
  throw failure;
}

/**
 * The page's first request: find out which host family answers. A host that fails hands over to
 * the next one at once. A host that stays silent for `HEDGE_MS` brings in the other family in
 * parallel: a network that cannot reach jsDelivr usually cannot reach raw GitHub either, so the
 * mirror starts after one wait rather than two. The first host to answer wins, the others are
 * cancelled, and its family serves the rest of the page and is remembered for a day.
 */
function raceHosts(candidates: string[], signal?: AbortSignal, progressSignal = signal): Promise<Response> {
  return new Promise<Response>((resolve, reject) => {
    // Requests still waiting for an answer.
    const attempts = new Set<AbortController>();
    let next = 0;
    let settled = false;
    let hedge: ReturnType<typeof setTimeout> | undefined;
    let last: Response | undefined;
    let failure: unknown;
    const finish = (settle: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(hedge);
      signal?.removeEventListener('abort', cancel);
      settle();
    };
    function cancel() {
      for (const attempt of attempts) attempt.abort(signal!.reason);
      finish(() => reject(signal!.reason));
    }
    const failed = (candidate: string) => {
      // Only demote shared CDNs; a failing same-origin or third-party host has no alternative anyway.
      if (candidates.length > 1) demoted.set(hostOf(candidate), Date.now() + DEMOTE_MS);
      if (next < candidates.length) start();
      else if (!attempts.size) finish(() => last ? resolve(last) : reject(failure));
    };
    /** After a silent wait, move the first host of a family not yet tried to the front of the queue. */
    function switchFamily() {
      const tried = new Set(candidates.slice(0, next).map(familyOf));
      const other = candidates.findIndex((href, index) => index >= next && !tried.has(familyOf(href)));
      if (other > next) candidates.splice(next, 0, ...candidates.splice(other, 1));
      start();
    }
    function start() {
      if (settled) return;
      const candidate = candidates[next++];
      const attempt = new AbortController();
      attempts.add(attempt);
      clearTimeout(hedge);
      if (next < candidates.length) hedge = setTimeout(switchFamily, HEDGE_MS);
      fetch(candidate, { signal: attempt.signal }).then(response => {
        attempts.delete(attempt);
        if (settled) { void response.body?.cancel().catch(() => {}); return; }
        if (response.ok || !transient(response.status)) {
          for (const other of attempts) other.abort();
          // Even a 404 shows the host is reachable from here.
          const family = familyOf(candidate);
          if (family) setCdnPreference(family);
          finish(() => resolve(trackResponse(response, progressSignal)));
          return;
        }
        void response.body?.cancel().catch(() => {});
        last = response;
        failed(candidate);
      }, error => {
        attempts.delete(attempt);
        if (settled) return;
        failure = error;
        failed(candidate);
      });
    }
    if (signal?.aborted) { reject(signal.reason); return; }
    signal?.addEventListener('abort', cancel, { once: true });
    start();
  });
}
