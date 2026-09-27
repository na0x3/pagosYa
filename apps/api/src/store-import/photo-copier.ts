import { detectedMediaMime } from '../uploads/uploads.service';
import { fetchPublic } from './public-fetch';

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
export const MAX_PHOTOS = 3000;

/** Copies Shopify photos into our uploads (spec 2026-09-27 §2): never hotlinked, since Shopify's CDN dies with the account. */
export async function copyPhotos(sources: string[], input: { storeHost: string; done: Record<string, string>; save: (buffer: Buffer, mimeType: string) => Promise<{ url: string }>; fetch?: typeof fetchPublic; onProgress?: (copied: number, total: number) => Promise<void> | void; concurrency?: number }) {
  const fetch = input.fetch ?? fetchPublic;
  const urls: Record<string, string> = {};
  const failed: string[] = [];
  const unique = [...new Set(sources)].slice(0, MAX_PHOTOS);
  // Photos a failed earlier attempt already copied are reused, not downloaded again.
  for (const source of unique) if (input.done[source]) urls[source] = input.done[source];
  const pending = unique.filter(source => !urls[source]);
  let next = 0, copied = unique.length - pending.length;
  const worker = async () => {
    while (next < pending.length) {
      const source = pending[next++];
      try {
        const url = new URL(source);
        if (url.protocol !== 'https:' || (url.hostname !== 'cdn.shopify.com' && url.hostname !== input.storeHost)) throw new Error('host');
        if (url.hostname === 'cdn.shopify.com') url.searchParams.set('width', '1600');
        const response = await fetch(url, { accept: 'image/*', maxBytes: MAX_PHOTO_BYTES, timeoutMs: 20_000 });
        const mime = detectedMediaMime(response.body);
        if (response.status !== 200 || !mime || !IMAGE_TYPES.has(mime)) throw new Error('not an image');
        urls[source] = (await input.save(response.body, mime)).url;
      } catch { failed.push(source); }
      copied++;
      await input.onProgress?.(copied, unique.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(input.concurrency ?? 4, pending.length) }, worker));
  failed.sort((a, b) => sources.indexOf(a) - sources.indexOf(b));
  return { urls, failed };
}
