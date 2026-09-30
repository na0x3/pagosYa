import { createHash } from 'node:crypto';

/** Product photos the model may name. Once a store has a site, the merchant's photos live in it as bundled
 * paths ("assets/image-3887b5f05aa4.jpg") and as upload URLs the merchant owns, but only the files attached to
 * the current message used to count. "Usa mis fotos" then failed on every store that already had a site. */
export const BUNDLED_PHOTO = /^\.?\/?assets\/image-([a-f0-9]{12})\.(png|jpe?g|webp)$/i;
const UPLOAD = /^\/v1\/uploads\/[a-f0-9-]+\.(png|jpe?g|webp)$/i;

/** An upload named absolutely ("http://localhost:3000/v1/uploads/x.jpg") is the same upload. */
export function uploadPath(value: string): string {
  if (UPLOAD.test(value)) return value;
  try { const path = new URL(value).pathname; return UPLOAD.test(path) ? path : value; } catch { return value; }
}

type Photos = { imageUrls?: unknown; variants?: unknown; variantOperations?: unknown };
const variantsOf = (item: Photos) => [item.variants, item.variantOperations].flatMap(list => Array.isArray(list) ? list : [])
  .map((variant: any) => variant?.changes && typeof variant.changes === 'object' ? variant.changes : variant).filter(Boolean);

/** Every photo reference in new products and product operations, as the model wrote it. */
export function productPhotoReferences(products: unknown, operations: unknown): string[] {
  const items = [products, operations].flatMap(list => Array.isArray(list) ? list as Photos[] : []).filter(item => item && typeof item === 'object');
  return [...new Set(items.flatMap(item => [
    ...(Array.isArray(item.imageUrls) ? item.imageUrls : []),
    ...variantsOf(item).flatMap((variant: any) => [variant.imageUrl, ...(Array.isArray(variant.imageUrls) ? variant.imageUrls : [])]),
  ]).filter((ref): ref is string => typeof ref === 'string' && !!ref))];
}

/** Rewrites references in place so validation and storage see the merchant's own upload URLs. */
export function rewriteProductPhotos(products: unknown, operations: unknown, resolved: Map<string, string>): void {
  const swap = (ref: unknown) => typeof ref === 'string' && resolved.has(ref) ? resolved.get(ref)! : ref;
  for (const item of [products, operations].flatMap(list => Array.isArray(list) ? list as Photos[] : [])) {
    if (!item || typeof item !== 'object') continue;
    if (Array.isArray(item.imageUrls)) item.imageUrls = item.imageUrls.map(swap);
    for (const variant of variantsOf(item) as any[]) {
      if ('imageUrl' in variant) variant.imageUrl = swap(variant.imageUrl);
      if (Array.isArray(variant.imageUrls)) variant.imageUrls = variant.imageUrls.map(swap);
    }
  }
}

/** Upload URLs the model wrote straight into page code (e.g. a hero `<img src="/v1/uploads/x.jpg">`). The storefront
 * sandbox only loads bundled assets, so these render broken unless they are bundled and rewritten. */
const AUTHORED_UPLOAD = /(?:https?:\/\/[^\s"'`()<>]+)?\/v1\/uploads\/[a-f0-9-]+\.(?:png|jpe?g|webp)/gi;
const AUTHORED = /\.(?:tsx|jsx|ts|js|html|css)$/;
type AuthoredFile = { path: string; content: string; encoding?: string };

export function authoredUploadReferences(files: AuthoredFile[]): string[] {
  return [...new Set(files.filter(file => AUTHORED.test(file.path) && file.encoding !== 'base64').flatMap(file => file.content.match(AUTHORED_UPLOAD) || []))];
}

/** Rewrites, in place, each resolved upload reference to its bundled path; unresolved ones stay as written. */
export function rewriteAuthoredUploads(files: AuthoredFile[], resolved: Map<string, string>): void {
  for (const file of files) {
    if (!AUTHORED.test(file.path) || file.encoding === 'base64') continue;
    file.content = file.content.replace(AUTHORED_UPLOAD, ref => resolved.get(ref) ?? ref);
  }
}

/** The bundled path a photo gets when a site is generated: its content hash, not its upload name. */
export const bundledPhotoPath = (bytes: Buffer, url: string) =>
  `assets/image-${createHash('sha256').update(bytes).digest('hex').slice(0, 12)}.${url.split('.').at(-1)!.toLowerCase()}`;
