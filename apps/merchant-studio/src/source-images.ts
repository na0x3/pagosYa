export const MAX_SOURCE_VIDEO_BYTES = 20_000_000;

/** Videos keep their original bytes; image optimization must never decode a video. */
export async function prepareSourceMedia(file: File): Promise<File> {
  if (file.type === 'video/mp4' || (!file.type && /\.mp4$/i.test(file.name))) {
    if (file.size > MAX_SOURCE_VIDEO_BYTES) throw new Error('Los videos MP4 deben ocupar hasta 20 MB.');
    const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    if (header.length < 12 || String.fromCharCode(...header.slice(4, 8)) !== 'ftyp') throw new Error(`No pudimos leer ${file.name} como video MP4.`);
    return file.type === 'video/mp4' ? file : new File([file], file.name, { type: 'video/mp4', lastModified: file.lastModified });
  }
  return prepareSourceImage(file);
}

export function validateSourceMediaBatch(files: File[]) {
  if (files.length > 24) throw new Error('Adjunta hasta 24 imágenes o videos en total.');
  if (files.filter(f => f.type === 'video/mp4').reduce((sum, f) => sum + f.size, 0) > MAX_SOURCE_VIDEO_BYTES) throw new Error('Los videos adjuntos superan 20 MB en total.');
  if (files.filter(f => f.type !== 'video/mp4').reduce((sum, f) => sum + f.size, 0) > 6 * 1024 * 1024) throw new Error('Las imágenes optimizadas superan 6 MB. Adjunta menos imágenes o reduce su tamaño.');
}

/** Resize large reference photos before upload; keep small images and transparent logos intact. */
export async function prepareSourceImage(file: File): Promise<File> {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 20_000_000) throw new Error('Usa imágenes PNG, JPG o WebP, o videos MP4 de hasta 20 MB.');
  const bitmap = await createImageBitmap(file).catch(() => { throw new Error(`No pudimos leer ${file.name}.`); });
  try {
    if (file.size <= 250_000 && bitmap.width <= 1600 && bitmap.height <= 1600) return file;
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d'); if (!context) throw new Error('No pudimos preparar la imagen.');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/webp', .82));
    if (!blob || blob.size > 2_000_000) throw new Error(`Reduce el tamaño de ${file.name} antes de adjuntarla.`);
    if (bitmap.width <= 1600 && bitmap.height <= 1600 && file.size < blob.size && file.size <= 2_000_000) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.webp', { type: 'image/webp', lastModified: file.lastModified });
  } finally { bitmap.close(); }
}
