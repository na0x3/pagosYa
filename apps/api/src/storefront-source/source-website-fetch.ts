import { request } from 'node:https';
import { publicBrandAddresses, publicBrandUrl } from '../brand/brand-import';

function withinDeadline<T>(task: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(new Error('Reference timeout'));
    task.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
    if (signal.aborted) { reject(new Error('Reference timeout')); return; }
    signal.addEventListener('abort', abort, { once: true });
  });
}

/** Every redirect and stylesheet gets its own URL/DNS validation and pinned connection. */
export type SourceReferenceResourceKind = 'html' | 'css' | 'script' | 'image' | 'font';
const resourceTypes: Record<SourceReferenceResourceKind, RegExp> = { html: /^text\/html\b/i, css: /^text\/css\b/i, script: /^(?:text|application)\/(?:javascript|ecmascript)\b/i, image: /^image\/(?:png|jpeg|webp|avif|gif|svg\+xml)\b/i, font: /^(?:font\/(?:woff2?|ttf|otf)|application\/(?:font-woff|x-font-ttf|vnd.ms-fontobject|octet-stream))\b/i };
const resourceLimits: Record<SourceReferenceResourceKind, number> = { html: 1_000_000, css: 300_000, script: 1_000_000, image: 2_000_000, font: 500_000 };

export async function readSourceReferenceResource(raw: string, kind: SourceReferenceResourceKind, signal: AbortSignal, consume?: (bytes: number) => void): Promise<{ url: string; body: Buffer; contentType: string }> {
  let url = publicBrandUrl(raw);
  for (let redirects = 0; redirects <= 3; redirects++) {
    if (signal.aborted) throw new Error('Reference timeout');
    const addresses = await withinDeadline(publicBrandAddresses(url), signal);
    if (signal.aborted) throw new Error('Reference timeout');
    const result = await new Promise<{ body?: Buffer; contentType?: string; location?: string }>((resolve, reject) => {
      const fail = () => new Error('Reference page unavailable');
      const req = request(url, { method: 'GET', family: 4, signal, agent: false,
        headers: { 'User-Agent': 'PagosYa-WebsiteReference/1.0', Accept: kind === 'html' ? 'text/html' : kind === 'css' ? 'text/css' : '*/*', 'Accept-Encoding': 'identity' },
        lookup: ((_host: string, _options: unknown, callback: any) => callback(null, addresses[0].address, 4)) as any,
      }, res => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode || 0) && res.headers.location) {
          resolve({ location: res.headers.location }); res.destroy(); return;
        }
        if (res.statusCode !== 200 || !resourceTypes[kind].test(String(res.headers['content-type']))
          || res.headers['content-encoding'] && res.headers['content-encoding'] !== 'identity') { reject(fail()); res.destroy(); return; }
        const parts: Buffer[] = []; let size = 0;
        res.on('data', (chunk: Buffer) => {
          try { consume?.(chunk.length); } catch { reject(fail()); req.destroy(); return; }
          size += chunk.length;
          if (size > resourceLimits[kind]) { reject(fail()); req.destroy(); }
          else parts.push(chunk);
        });
        res.on('error', () => reject(fail()));
        res.on('aborted', () => reject(fail()));
        res.on('end', () => resolve({ body: Buffer.concat(parts), contentType: String(res.headers['content-type']) }));
      });
      req.on('error', () => reject(fail())); req.end();
    });
    if (result.body !== undefined) return { url: url.href, body: result.body, contentType: result.contentType! };
    url = publicBrandUrl(new URL(result.location!, url).href);
  }
  throw new Error('Too many reference redirects');
}

export async function readSourceWebsite(raw: string, kind: 'html' | 'css', signal: AbortSignal): Promise<{ url: string; content: string }> {
  const result = await readSourceReferenceResource(raw, kind, signal);
  return { url: result.url, content: result.body.toString('utf8') };
}
