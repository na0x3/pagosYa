import type { SourceProjectFileDto } from './dto/save-source-project.dto';
import { sourceAssetInventory } from './source-asset-library';
import { BUNDLED_PHOTO, bundledPhotoPath } from './source-product-photos';
import type { SourceImageUse } from './source-setup';

/**
 * A redesign keeps the store's photos (baek 2026-10-16, florart 2026-10-18: «the redesign still drops the pictures»).
 *
 * A redesign with nothing attached ran as if the store had no photos: only this request's uploads enter the legend,
 * so the draw saw zero photos and offered photoless openings (a line drawing, a type poster) and the author never
 * placed the store's own pictures. The saved store names each photo by its content hash; this finds the merchant's
 * upload behind each one so the redesign starts from the same photos, with the roles and descriptions already confirmed.
 */

/** Roles that are storefront content; a reference or an unused upload stays out, the logo comes with withSavedLogo. */
const CONTENT_ROLES = new Set(['product', 'business', 'background', 'team', 'unknown']);

/** The store's own display photos in the saved project, with what visual-assets.json records about each. */
export function savedStorePhotos(files: SourceProjectFileDto[]): Array<{ path: string; role: SourceImageUse['role']; description: string }> {
  return sourceAssetInventory(files)
    .filter(asset => asset.kind === 'image' && BUNDLED_PHOTO.test(asset.path) && CONTENT_ROLES.has(asset.role))
    .map(asset => ({ path: asset.path.toLowerCase(), role: asset.role, description: asset.description }));
}

/**
 * The uploads behind the saved photos, in the saved order, at most `limit`. Candidates are tried in order (this store's
 * recent attachments first, then the merchant's library), each read once; reading stops when every photo is found.
 */
export async function recoverStorePhotos(input: {
  files: SourceProjectFileDto[]; candidates: string[]; read: (url: string) => Promise<Buffer | null>; limit: number;
}): Promise<{ assetUrls: string[]; imageUses: SourceImageUse[] }> {
  const wanted = savedStorePhotos(input.files);
  const found = new Map<string, string>();
  for (const url of [...new Set(input.candidates)]) {
    if (found.size === wanted.length) break;
    const bytes = await input.read(url).catch(() => null);
    const path = bytes ? bundledPhotoPath(bytes, url) : '';
    if (wanted.some(photo => photo.path === path) && !found.has(path)) found.set(path, url);
  }
  const kept = wanted.filter(photo => found.has(photo.path)).slice(0, Math.max(0, input.limit));
  return {
    assetUrls: kept.map(photo => found.get(photo.path)!),
    imageUses: kept.map(photo => ({ url: found.get(photo.path)!, role: photo.role, description: photo.description })),
  };
}
