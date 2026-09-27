import { detectedMediaMime } from '../uploads/uploads.service';
import { fetchPublic } from './public-fetch';
import { MAX_PHOTOS } from './shopify-mapping';

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
export { MAX_PHOTOS };

/** Copies Shopify photos into our uploads (spec 2026-09-27 §2): never hotlinked, since Shopify's CDN dies with the account.
 * `done` are this import's own earlier copies; `reuse` are copies an earlier import of the same store made, used only
 * while the file still exists. A throwing onProgress (the lease was lost) stops every worker. */
export async function copyPhotos(sources: string[], input: { storeHost: string; done: Record<string, string>; reuse?: { urls: Record<string, string>; exists: (url: string) => Promise<boolean> }; save: (buffer: Buffer, mimeType: string) => Promise<{ url: string }>; fetch?: typeof fetchPublic; onProgress?: (copied: number, total: number) => Promise<void> | void; concurrency?: number }) {
  const fetch = input.fetch ?? fetchPublic;
  const urls: Record<string, string> = {};
  const failed: string[] = [];
  const all = [...new Set(sources)];
  const unique = all.slice(0, MAX_PHOTOS);
  // Photos a failed earlier attempt already copied are reused, not downloaded again.
  for (const source of unique) if (input.done[source]) urls[source] = input.done[source];
  const pending = unique.filter(source => !urls[source]);
  const allowHost = (hostname: string) => hostname === 'cdn.shopify.com' || hostname === input.storeHost;
  let next = 0, copied = unique.length - pending.length, stopped = false;
  const worker = async () => {
    while (!stopped && next < pending.length) {
      const source = pending[next++];
      try {
        const earlier = input.reuse?.urls[source];
        if (earlier && await input.reuse!.exists(earlier).catch(() => false)) urls[source] = earlier;
        else {
          const url = new URL(source);
          if (url.protocol !== 'https:' || !allowHost(url.hostname)) throw new Error('host');
          if (url.hostname === 'cdn.shopify.com') url.searchParams.set('width', '1600');
          const response = await fetch(url, { accept: 'image/*', maxBytes: MAX_PHOTO_BYTES, timeoutMs: 20_000, allowHost });
          const mime = detectedMediaMime(response.body);
          if (response.status !== 200 || !mime || !IMAGE_TYPES.has(mime)) throw new Error('not an image');
          urls[source] = (await input.save(response.body, mime)).url;
        }
      } catch { failed.push(source); }
      copied++;
      try { await input.onProgress?.(copied, unique.length); }
      catch (error) { stopped = true; throw error; }
    }
  };
  await Promise.all(Array.from({ length: Math.min(input.concurrency ?? 4, pending.length) }, worker));
  failed.sort((a, b) => sources.indexOf(a) - sources.indexOf(b));
  return { urls, failed, skipped: all.length - unique.length };
}
