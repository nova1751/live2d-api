export async function getJson<T>(url: string): Promise<T> {
  const resolved = new URL(url, document.baseURI);
  if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') {
    throw new Error(`Unsupported URL scheme for ${url}`);
  }
  const response = await fetch(resolved);
  if (!response.ok) throw new Error(`Failed to load ${url} (HTTP ${response.status})`);
  return response.json();
}
