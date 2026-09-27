import { request } from 'node:https';
import { publicBrandAddresses, publicBrandUrl } from '../brand/brand-import';

export type PublicResponse = { status: number; url: URL; contentType: string; body: Buffer };
export type PublicTransport = (url: URL, address: string, limits: { accept: string; maxBytes: number; timeoutMs: number }) => Promise<{ status: number; contentType: string; location?: string; body: Buffer }>;
export class PublicFetchError extends Error {
  constructor(readonly code: 'blocked' | 'too_large' | 'unreachable' | 'too_many_redirects', message: string) { super(message); }
}

/** IPv4-only HTTPS GET pinned to an address that was already checked; no cookies, no automatic redirects. */
export const httpsTransport: PublicTransport = (url, address, limits) => new Promise((resolve, reject) => {
  const req = request(url, { method: 'GET', family: 4, headers: { 'User-Agent': 'PagosYa-StoreImport/1.0', Accept: limits.accept, 'Accept-Encoding': 'identity' },
    lookup: ((_host: string, _options: unknown, callback: any) => callback(null, address, 4)) as any,
  }, res => {
    const status = res.statusCode ?? 0;
    const location = typeof res.headers.location === 'string' ? res.headers.location : undefined;
    const parts: Buffer[] = []; let size = 0;
    res.on('data', (chunk: Buffer) => { size += chunk.length; if (size > limits.maxBytes) req.destroy(new PublicFetchError('too_large', 'Response too large')); else parts.push(chunk); });
    res.on('end', () => resolve({ status, contentType: String(res.headers['content-type'] || ''), location, body: Buffer.concat(parts) }));
    res.on('error', reject);
  });
  const timer = setTimeout(() => req.destroy(new PublicFetchError('unreachable', 'Timed out')), limits.timeoutMs);
  req.on('close', () => clearTimeout(timer)); req.on('error', reject); req.end();
});

/** Public HTTPS only, every hop re-validated (spec 2026-09-27 §4): `mitienda.com` → `www.` → `*.myshopify.com` is normal. */
export async function fetchPublic(raw: string | URL, options: { accept: string; maxBytes: number; timeoutMs?: number; maxRedirects?: number; allowHost?: (hostname: string) => boolean },
  deps: { resolve?: typeof publicBrandAddresses; transport?: PublicTransport } = {}): Promise<PublicResponse> {
  const resolve = deps.resolve ?? publicBrandAddresses, transport = deps.transport ?? httpsTransport;
  const maxRedirects = options.maxRedirects ?? 3;
  let current = String(raw);
  for (let hop = 0; ; hop++) {
    let url: URL; let addresses: { address: string }[];
    try { url = publicBrandUrl(current); }
    catch { throw new PublicFetchError('blocked', 'Not a public HTTPS address'); }
    // allowHost holds on every hop, so a redirect cannot take the request to a host the caller did not allow.
    if (options.allowHost && !options.allowHost(url.hostname)) throw new PublicFetchError('blocked', 'Host not allowed');
    try { addresses = await resolve(url); }
    catch { throw new PublicFetchError('blocked', 'Not a public HTTPS address'); }
    let response: Awaited<ReturnType<PublicTransport>>;
    try { response = await transport(url, addresses[0].address, { accept: options.accept, maxBytes: options.maxBytes, timeoutMs: options.timeoutMs ?? 10_000 }); }
    catch (error) { throw error instanceof PublicFetchError ? error : new PublicFetchError('unreachable', 'Could not reach the site'); }
    if ([301, 302, 303, 307, 308].includes(response.status) && response.location) {
      if (hop >= maxRedirects) throw new PublicFetchError('too_many_redirects', 'Too many redirects');
      current = new URL(response.location, url).href;
      continue;
    }
    return { status: response.status, url, contentType: response.contentType, body: response.body };
  }
}
