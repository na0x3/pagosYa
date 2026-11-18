import { basename, join } from 'node:path';
import sharp from 'sharp';

/** Owner 2026-11-11 («no blurry cover photos»): the width of each of the store's own uploads, read from the file's header. A photo
 *  that is not a local upload, or cannot be read, keeps no width (the cover rule then leaves it as it is). */
export async function withPhotoWidths<P extends { url: string }>(photos: readonly P[], uploadsDir: string): Promise<Array<P & { width?: number }>> {
  return Promise.all(photos.map(async photo => {
    if (!photo.url.startsWith('/v1/uploads/')) return photo;
    const width = await sharp(join(uploadsDir, basename(photo.url))).metadata().then(meta => meta.width).catch(() => undefined);
    return width ? { ...photo, width } : photo;
  }));
}
