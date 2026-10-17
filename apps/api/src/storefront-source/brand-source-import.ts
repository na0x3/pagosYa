import { MAX_IMAGE_UPLOAD_BYTES } from '../uploads/uploads.service';
import type { BrandImageCandidate } from './brand-source-website';

export type ImportedBrandImage = { url: string; source: string; kind: 'photo' | 'logo' };
type Deps = {
  fetch: (url: string, signal: AbortSignal, maxBytes: number) => Promise<{ body: Buffer; contentType: string }>;
  size: (body: Buffer) => { width: number; height: number } | null;
  /** The type the bytes show; it wins over the server's label (a PNG served as image/jpeg fails the upload's sniff). */
  sniff?: (body: Buffer) => string | null;
  save: (body: Buffer, mimeType: string) => Promise<{ url: string }>;
};
const TYPES = /^image\/(png|jpeg|webp)$/i;
const MAX_IMAGES = 12;
/** As large as an upload may be: an old site's hero photo is often 3–8 MB and the website reader's 2 MB image limit dropped
 *  it (final review 2026-10-16). */
export const BRAND_IMAGE_MAX_BYTES = MAX_IMAGE_UPLOAD_BYTES;

/** The merchant's own old-site photos and logo into their uploads (spec 2026-10-16 §2). One at a time, in candidate order;
 *  any failure skips that image and is counted in one note. */
export async function importBrandImages(candidates: BrandImageCandidate[], deps: Deps, signal: AbortSignal, room = MAX_IMAGES): Promise<{ images: ImportedBrandImage[]; notes: string[] }> {
  const images: ImportedBrandImage[] = [];
  let skipped = 0;
  for (const candidate of candidates) {
    // `room`: what is left under the request's image limit (final review 2026-10-16, I3).
    if (images.length >= Math.min(MAX_IMAGES, room) || signal.aborted) break;
    try {
      const { body, contentType } = await deps.fetch(candidate.url, signal, BRAND_IMAGE_MAX_BYTES);
      const mime = deps.sniff?.(body) ?? contentType.split(';')[0].trim().toLowerCase().replace('image/jpg', 'image/jpeg');
      const size = deps.size(body);
      const long = size ? Math.max(size.width, size.height) : 0;
      if (!TYPES.test(mime) || body.length > BRAND_IMAGE_MAX_BYTES || long < (candidate.kind === 'logo' ? 96 : 400)) { skipped += 1; continue; }
      const saved = await deps.save(body, mime);
      images.push({ url: saved.url, source: candidate.url, kind: candidate.kind });
    } catch { skipped += 1; }
  }
  const notes = skipped ? [`No pude traer ${skipped} ${skipped === 1 ? 'imagen' : 'imágenes'} de tu página anterior (pequeñas, de otro tipo o no disponibles).`] : [];
  return { images, notes };
}
