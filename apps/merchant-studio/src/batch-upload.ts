export const MAX_BATCH_IMAGES = 3;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export interface ImageFileLike {
  name: string;
  type: string;
  size: number;
  lastModified?: number;
}

export interface ValidatedImageFile<T extends ImageFileLike = ImageFileLike> {
  id: string;
  file: T;
  slot: number;
}

export interface RejectedImageFile<T extends ImageFileLike = ImageFileLike> {
  file: T;
  reason: "not-image" | "too-large" | "batch-full";
}

export interface ValidatedImageBatch<T extends ImageFileLike = ImageFileLike> {
  accepted: Array<ValidatedImageFile<T>>;
  rejected: Array<RejectedImageFile<T>>;
}

/**
 * Treat one picker/drop event as one ordered batch. Nothing is deduplicated by
 * file name: three selected files always occupy three visible slots.
 */
export function validateImageBatch<T extends ImageFileLike>(
  files: Iterable<T>,
  limit = MAX_BATCH_IMAGES,
): ValidatedImageBatch<T> {
  const accepted: Array<ValidatedImageFile<T>> = [];
  const rejected: Array<RejectedImageFile<T>> = [];

  Array.from(files).forEach((file, index) => {
    if (!file.type.toLowerCase().startsWith("image/")) {
      rejected.push({ file, reason: "not-image" });
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      rejected.push({ file, reason: "too-large" });
      return;
    }
    if (accepted.length >= limit) {
      rejected.push({ file, reason: "batch-full" });
      return;
    }

    const slot = accepted.length;
    accepted.push({
      id: `${Date.now()}-${index}-${file.lastModified ?? 0}-${file.size}`,
      file,
      slot,
    });
  });

  return { accepted, rejected };
}

export function batchStatusLabel(ready: number, total: number): string {
  if (total === 0) return "Sin imágenes";
  if (ready < total) return `Cargando ${ready} de ${total}`;
  return `${ready} de ${total} imágenes listas`;
}
