import { request } from 'node:https';
import { publicBrandAddresses, publicBrandUrl } from './brand-import';

function withinDeadline<T>(task: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(new Error('Reference timeout'));
    task.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
    if (signal.aborted) { reject(new Error('Reference timeout')); return; }
    signal.addEventListener('abort', abort, { once: true });
  });
}

/** Every redirect and stylesheet gets its own URL/DNS validation and pinned connection. */
export async function readSourceWebsite(raw: string, kind: 'html' | 'css', signal: AbortSignal): Promise<{ url: string; content: string }> {
  let url = publicBrandUrl(raw);
  for (let redirects = 0; redirects <= 3; redirects++) {
    if (signal.aborted) throw new Error('Reference timeout');
    const addresses = await withinDeadline(publicBrandAddresses(url), signal);
    if (signal.aborted) throw new Error('Reference timeout');
    const result = await new Promise<{ content?: string; location?: string }>((resolve, reject) => {
      const fail = () => new Error('Reference page unavailable');
      const req = request(url, { method: 'GET', family: 4, signal, agent: false,
        headers: { 'User-Agent': 'PagosYa-WebsiteReference/1.0', Accept: kind === 'html' ? 'text/html' : 'text/css', 'Accept-Encoding': 'identity' },
        lookup: ((_host: string, _options: unknown, callback: any) => callback(null, addresses[0].address, 4)) as any,
      }, res => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode || 0) && res.headers.location) {
          resolve({ location: res.headers.location }); res.destroy(); return;
        }
        if (res.statusCode !== 200 || !(kind === 'html' ? /^text\/html\b/i : /^text\/css\b/i).test(String(res.headers['content-type']))
          || res.headers['content-encoding'] && res.headers['content-encoding'] !== 'identity') { reject(fail()); res.destroy(); return; }
        const parts: Buffer[] = []; let size = 0;
        res.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > (kind === 'html' ? 1_000_000 : 300_000)) { reject(fail()); req.destroy(); }
          else parts.push(chunk);
        });
        res.on('error', () => reject(fail()));
        res.on('aborted', () => reject(fail()));
        res.on('end', () => resolve({ content: Buffer.concat(parts).toString('utf8') }));
      });
      req.on('error', () => reject(fail())); req.end();
    });
    if (result.content !== undefined) return { url: url.href, content: result.content };
    url = publicBrandUrl(new URL(result.location!, url).href);
  }
  throw new Error('Too many reference redirects');
}
