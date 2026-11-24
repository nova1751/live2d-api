export const loadTimeout = 15000;

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

export async function withLoadTimeout<T>(load: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error('Live2D resource load timed out')), loadTimeout);
  try { return await load(controller.signal); }
  finally { clearTimeout(timeout); }
}

export async function getJson<T>(url: string): Promise<T> {
  return withLoadTimeout(async signal => {
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error(`Failed to load ${url} (HTTP ${response.status})`);
    return response.json();
  });
}
