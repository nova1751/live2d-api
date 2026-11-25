import { trackResponse } from './request.ts';

const MIRROR = 'https://cdn.jsdmirror.com/gh/';
const JSDELIVR = 'https://cdn.jsdelivr.net/gh/';
const RAW = 'https://raw.githubusercontent.com/';
const COMMIT = /^[a-f\d]{40}$/i;

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

const demoted = new Map<string, number>();
const DEMOTE_MS = 120_000;
// Callers may pass page-relative URLs; resolve them instead of throwing.
const hostOf = (href: string) => { try { return new URL(href, document.baseURI).host; } catch { return ''; } };
const isDemoted = (href: string) => (demoted.get(hostOf(href)) ?? 0) > Date.now();

/**
 * Other places serving the same file, most preferred first. Commit-pinned GitHub files are
 * identical on JSDMirror, jsDelivr and raw.githubusercontent.com, so any of them can stand in.
 * Hosts that failed recently move to the back for a while.
 */
export function cdnAlternates(input: string): string[] {
  const file = githubFile(input);
  const retry = mirrorRetryUrl(input);
  if (!file) return retry ? [retry] : [];
  const { owner, repo, ref, path } = file;
  const mirror = `${MIRROR}${owner}/${repo}@${ref}/${path}`;
  const jsdelivr = `${JSDELIVR}${owner}/${repo}@${ref}/${path}`;
  // raw needs an exact ref; jsDelivr tags such as widget-latest also exist as Git refs.
  const raw = `${RAW}${owner}/${repo}/${ref}/${path}`;
  const others = input.startsWith(MIRROR) ? [retry!, jsdelivr, ...(COMMIT.test(ref) ? [raw] : [])]
    : input.startsWith(JSDELIVR) ? [...(COMMIT.test(ref) ? [raw] : []), mirror]
    : [jsdelivr, mirror];
  const unique = others.filter((href, index) => href && href !== input && others.indexOf(href) === index);
  return [...unique.filter(href => !isDemoted(href)), ...unique.filter(isDemoted)];
}

// Statuses that point at the CDN rather than the file: blocked, rate limited, misrouted or down.
const transient = (status: number) => status === 403 || status === 421 || status === 429 || status >= 500;

/**
 * Fetch a CDN asset, falling back across the GitHub CDNs on network errors and transient
 * statuses. A 404 is final: the file is genuinely missing at that commit.
 */
export async function fetchCdnAsset(url: string, signal?: AbortSignal, progressSignal = signal): Promise<Response> {
  const candidates = isDemoted(url) ? [...cdnAlternates(url), url] : [url, ...cdnAlternates(url)];
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
