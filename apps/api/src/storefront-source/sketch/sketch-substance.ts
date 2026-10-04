import type { SketchBlock } from './sketch-schema';

/** What a store actually has to say. The page length is derived from this rather than from an energy
 * adjective, because the store generated 2026-10-04 15:29 had ZERO products and still drew thirteen bands —
 * which can only be filled with copy about nothing. A store with little to say gets a short page. */
export type StoreSubstance = { products: number; photos: number; categories: number; briefWords: number };

function countBriefWords(obj: unknown): number {
  let count = 0;
  const visited = new WeakSet<object>();
  const visit = (value: unknown): void => {
    if (typeof value === 'string') {
      count += value.replace(/[^\p{L}\p{N}\s]+/gu, ' ').split(/\s+/).filter(Boolean).length;
    } else if (typeof value === 'object' && value !== null) {
      if (visited.has(value)) return;
      visited.add(value);
      if (Array.isArray(value)) {
        for (const v of value) visit(v);
      } else {
        for (const v of Object.values(value)) visit(v);
      }
    }
  };
  visit(obj);
  return count;
}

export function countSubstance(input: unknown): StoreSubstance {
  if (typeof input !== 'object' || input === null) return { products: 0, photos: 0, categories: 0, briefWords: 0 };
  const obj = input as Record<string, unknown>;
  const rawProducts = obj.products;
  const products = Array.isArray(rawProducts) ? rawProducts : [];
  const categories = new Set(
    products
      .map(item => (typeof item === 'object' && item !== null ? (item as Record<string, unknown>)?.category : undefined))
      .filter((value): value is string => typeof value === 'string' && value.trim() !== '')
  );
  const rawPhotos = obj.photos;
  const photos = Array.isArray(rawPhotos) ? rawPhotos : [];
  const briefWords = countBriefWords(obj.brief);
  return { products: products.length, photos: photos.length, categories: categories.size, briefWords };
}

export function substanceCaps(s: StoreSubstance): { maxLength: number; forbid: SketchBlock['type'][]; maxMedia: number } {
  const forbid: SketchBlock['type'][] = [];
  if (!s.products) forbid.push('catalog', 'collections');
  else if (s.categories < 2) forbid.push('collections');
  if (s.photos < 2) forbid.push('gallery');
  // Each of these is a reason the page has less to carry; they stack.
  let maxLength = 14;
  if (!s.products) maxLength = Math.min(maxLength, 8);
  if (s.briefWords < 12) maxLength = Math.min(maxLength, 9);
  if (s.photos < 2) maxLength = Math.min(maxLength, 11);
  return { maxLength: Math.max(6, maxLength), forbid, maxMedia: Math.min(5, s.photos) }; // Floor of 6 keeps page inside grammar contract enforced by Task 3's violations() predicate.
}
