/** Retry the same immutable resource through a fresh cache key on JSDMirror. */
export function mirrorRetryUrl(input: string): string | undefined {
  if (!input.startsWith('https://cdn.jsdmirror.com/gh/')) return;
  const url = new URL(input);
  if (url.searchParams.has('live2d-retry')) return;
  url.searchParams.set('live2d-retry', '1');
  return url.href;
}

export async function fetchCdnAsset(url: string, signal?: AbortSignal): Promise<Response> {
  const retry = mirrorRetryUrl(url);
  if (!retry) return fetch(url, { signal });
  let response: Response;
  try { response = await fetch(url, { signal }); }
  catch (error) {
    if (signal?.aborted) throw error;
    return fetch(retry, { signal });
  }
  if (response.ok || ![403, 421, 429].includes(response.status) && response.status < 500) return response;
  void response.body?.cancel().catch(() => {});
  return fetch(retry, { signal });
}
