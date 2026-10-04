import type { SketchBlock } from './sketch-schema';

/** What a store actually has to say. The page length is derived from this rather than from an energy
 * adjective, because the store generated 2026-10-04 15:29 had ZERO products and still drew thirteen bands —
 * which can only be filled with copy about nothing. A store with little to say gets a short page. */
export type StoreSubstance = { products: number; photos: number; categories: number; briefWords: number };

export function countSubstance(input: { products?: Array<{ name?: string; category?: string }>; photos?: unknown[]; brief?: unknown }): StoreSubstance {
  const products = input.products ?? [];
  const categories = new Set(products.map(item => item?.category).filter((value): value is string => typeof value === 'string' && value.trim() !== ''));
  const briefWords = JSON.stringify(input.brief ?? '').replace(/[^\p{L}\p{N}\s]+/gu, ' ').split(/\s+/).filter(Boolean).length;
  return { products: products.length, photos: (input.photos ?? []).length, categories: categories.size, briefWords };
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
  return { maxLength: Math.max(6, maxLength), forbid, maxMedia: Math.min(5, s.photos) };
}
