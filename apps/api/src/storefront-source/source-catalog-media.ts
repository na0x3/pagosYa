import sharp from 'sharp';
import { createHash } from 'node:crypto';
import type { SourceProjectFileDto } from './dto/save-source-project.dto';

/** Hydrate only the current store's catalog upload URLs; never fetch arbitrary URLs. */
export async function bundleSourceCatalogMedia(
  items: Array<{ imageUrls: string[]; variants?: Array<{ imageUrl?: string | null }> }>,
  apiUrl: URL,
  retained: SourceProjectFileDto[],
  assets: SourceProjectFileDto[],
  readUpload: (pathname: string) => Promise<Buffer | null>,
  legend: Array<{ original: string; path: string }> = [],
) {
  const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex').slice(0, 12);
  const bundled = new Map([...retained, ...assets]
    .filter(file => file.encoding === 'base64' && /\.(png|jpe?g|webp)$/i.test(file.path))
    .map(file => [digest(Buffer.from(file.content, 'base64')), file.path]));
  const resolved = new Map<string, string>();
  const hydrate = async (url: string) => {
    let pathname: string;
    try {
      const parsed = new URL(url, apiUrl);
      if (parsed.origin !== apiUrl.origin || parsed.search || parsed.hash) return url;
      pathname = parsed.pathname;
    } catch { return url; }
    if (!/^\/v1\/uploads\/[a-f0-9-]+\.(png|jpe?g|webp)$/i.test(pathname)) return url;
    if (resolved.has(pathname)) return resolved.get(pathname)!;
    const bytes = await readUpload(pathname);
    // Keep unavailable/oversize URLs intact: existing verification reports them,
    // never silently discard the merchant's selected product photo.
    if (!bytes || bytes.length > 8_000_000) { resolved.set(pathname, url); return url; }
    const originalHash = digest(bytes);
    let path = bundled.get(originalHash);
    if (!path) {
      let content = bytes;
      let extension = pathname.split('.').at(-1)!.toLowerCase();
      // Products accept up to 8 MB uploads; source artifacts cap each encoded
      // image at 2.8 MB. Make a display derivative, preserving the original upload.
      if (bytes.length > 2_000_000) {
        try {
          content = await sharp(bytes).rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).webp({ quality: 88 }).toBuffer();
          if (content.length > 2_000_000) content = await sharp(bytes).rotate().resize({ width: 1280, height: 1280, fit: 'inside', withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
          extension = 'webp';
        } catch { resolved.set(pathname, url); return url; }
      }
      if (content.length > 2_000_000) { resolved.set(pathname, url); return url; }
      const hash = digest(content);
      path = bundled.get(hash);
      if (!path) {
        path = `assets/image-${hash}.${extension}`;
        assets.push({ path, content: content.toString('base64'), encoding: 'base64' });
        bundled.set(hash, path);
      }
      bundled.set(originalHash, path);
    }
    if (!legend.some(entry => entry.original === pathname && entry.path === path)) legend.push({ original: pathname, path });
    resolved.set(pathname, path);
    return path;
  };
  for (const item of items) {
    for (let i = 0; i < item.imageUrls.length; i++) item.imageUrls[i] = await hydrate(item.imageUrls[i]);
    for (const variant of item.variants || []) if (variant.imageUrl) variant.imageUrl = await hydrate(variant.imageUrl);
  }
}
