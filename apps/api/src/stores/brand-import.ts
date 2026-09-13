import { BadRequestException } from '@nestjs/common';
import { lookup } from 'node:dns/promises';
import { request } from 'node:https';
import { BlockList, isIP } from 'node:net';

const blocked = new BlockList();
for (const [address, prefix] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.168.0.0', 16], ['192.0.0.0', 24], ['192.0.2.0', 24], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 3]] as const) blocked.addSubnet(address, prefix, 'ipv4');

export function publicBrandUrl(raw: string): URL {
  let url: URL;
  try { url = new URL(raw); } catch { throw new BadRequestException('Introduce una dirección HTTPS pública.'); }
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') || isIP(url.hostname) || url.hostname.startsWith('[') || !url.hostname.includes('.')) throw new BadRequestException('Introduce una dirección HTTPS pública, sin credenciales.');
  return url;
}

export async function publicBrandAddresses(url: URL) {
  const addresses = await lookup(url.hostname, { family: 4, all: true });
  if (!addresses.length || addresses.some(a => blocked.check(a.address, 'ipv4'))) throw new BadRequestException('La dirección debe ser un sitio público.');
  return addresses;
}

/** IPv4-only, DNS-pinned fetch. No redirects, cookies, subresources or JavaScript. */
export async function importBrandWebsite(raw: string): Promise<string> {
  const url = publicBrandUrl(raw);
  const addresses = await publicBrandAddresses(url);
  return new Promise((resolve, reject) => {
    const fail = () => new BadRequestException('No se pudo leer esa página. Pega el texto de tu marca o usa la dirección HTTPS final.');
    const req = request(url, { method: 'GET', family: 4, headers: { 'User-Agent': 'PagosYa-BrandImport/1.0', Accept: 'text/html,text/plain', 'Accept-Encoding': 'identity' },
      lookup: ((_host: string, _options: unknown, callback: any) => callback(null, addresses[0].address, 4)) as any,
    }, res => {
      if (res.statusCode !== 200 || !/^text\/(html|plain)\b/i.test(String(res.headers['content-type']))) { res.resume(); req.destroy(fail()); return; }
      let size = 0; const parts: Buffer[] = [];
      res.on('data', (chunk: Buffer) => { size += chunk.length; if (size > 1_000_000) req.destroy(fail()); else parts.push(chunk); });
      res.on('error', () => reject(fail()));
      res.on('end', () => resolve(Buffer.concat(parts).toString('utf8').replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').slice(0, 18000)));
    });
    const timer = setTimeout(() => req.destroy(fail()), 10_000);
    req.on('close', () => clearTimeout(timer)); req.on('error', () => reject(fail())); req.end();
  });
}
