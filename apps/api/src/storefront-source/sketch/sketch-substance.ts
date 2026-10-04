import type { SketchBlock } from './sketch-schema';

/** What a store actually has to say. The page length is derived from this rather than from an energy
 * adjective, because the store generated 2026-10-04 15:29 had ZERO products and still drew thirteen bands —
 * which can only be filled with copy about nothing. A store with little to say gets a short page. */
export type StoreSubstance = { products: number; photos: number; categories: number; briefWords: number; /** Published customer reviews the store really has. */ reviews: number };

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

/** Reads the shapes the generator really holds: `data.items` rows carry `categoryId` ONLY (never a category name),
 * so categories are counted by resolving that id against `data.categories`, exactly as the catalogue digest does.
 * A categoryId that names no known category is not a category anyone could write a collection about. */
export function countSubstance(input: unknown): StoreSubstance {
  const none: StoreSubstance = { products: 0, photos: 0, categories: 0, briefWords: 0, reviews: 0 };
  if (typeof input !== 'object' || input === null) return none;
  const obj = input as Record<string, unknown>;
  const products = Array.isArray(obj.products) ? obj.products : [];
  const known = new Set<string>();
  for (const category of Array.isArray(obj.categories) ? obj.categories : []) {
    const id = typeof category === 'object' && category !== null ? (category as Record<string, unknown>).id : undefined;
    if (typeof id === 'string' && id.trim() !== '') known.add(id);
  }
  const used = new Set<string>();
  for (const item of products) {
    const id = typeof item === 'object' && item !== null ? (item as Record<string, unknown>).categoryId : undefined;
    if (typeof id === 'string' && known.has(id)) used.add(id);
  }
  const photos = Array.isArray(obj.photos) ? obj.photos : [];
  const reviews = typeof obj.reviews === 'number' && Number.isFinite(obj.reviews) && obj.reviews > 0 ? Math.floor(obj.reviews) : 0;
  return { products: products.length, photos: photos.length, categories: used.size, briefWords: countBriefWords(obj.brief), reviews };
}

export function substanceCaps(s: StoreSubstance): { maxLength: number; forbid: SketchBlock['type'][]; maxMedia: number } {
  const forbid: SketchBlock['type'][] = [];
  if (!s.products) forbid.push('catalog', 'collections');
  else if (s.categories < 2) forbid.push('collections');
  if (s.photos < 2) forbid.push('gallery');
  // A store nobody has bought from has no testimonials, and a band titled "Clientes felices" over invented ones is
  // the one lie this page must not tell. Real reviews are the only licence to draw it.
  if (!s.reviews) forbid.push('reviews');
  // Each of these is a reason the page has less to carry; they stack.
  let maxLength = 14;
  if (!s.products) maxLength = Math.min(maxLength, 8);
  if (s.briefWords < 12) maxLength = Math.min(maxLength, 9);
  if (s.photos < 2) maxLength = Math.min(maxLength, 11);
  return { maxLength: Math.max(6, maxLength), forbid, maxMedia: Math.min(5, s.photos) }; // Floor of 6 keeps page inside grammar contract enforced by Task 3's violations() predicate.
}
