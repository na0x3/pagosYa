import { features, photos, sections, variants } from './store-data';

const unique = (list: Array<string | undefined>) => [...new Set(list.filter((src): src is string => Boolean(src)))];

// One build path live check 2026-10-29: one photo appeared twice on 4 of 5 home pages. The feature bands (duo, explore, capsule,
// origin) claim their photos first; the business sections and the closing band take only photos nobody else shows.
type Band = { photo?: string; halves?: Array<{ photo?: string }> };
export const bandPhotos: string[] = (() => {
  const bands = features as unknown as Record<string, Band | undefined>;
  return [...(bands.duo?.halves ?? []).map(half => half.photo), bands.explore?.photo, bands.capsule?.photo, bands.origin?.photo].filter((src): src is string => Boolean(src));
})();
export const taken = (src: string | undefined) => !src || src === photos.hero || src === photos.story || bandPhotos.includes(src);
// Owner 2026-10-29 (DooBoo «Sabores para descubrir»: «i dont like these sections of all text and blank background»): every words
// section takes, in page order, the next photo nobody else shows — the products first, then the brand photos. The pick shows the
// real products instead, FAQ, sizes, blog and gallery are what they are; a section left without a photo is not drawn.
const WORDS = (sections as unknown as Array<{ id: string }>).map(section => section.id).filter(id => !['faq', 'sizes', 'blog', 'gallery', 'pick'].includes(id));
const pool = unique(Object.keys(photos).filter(key => /^[pb]\d+$/.test(key)).sort((a, b) => a[0] === b[0] ? Number(a.slice(1)) - Number(b.slice(1)) : a[0] === 'p' ? -1 : 1)
  .map(key => (photos as Record<string, string | undefined>)[key]));
export const sectionPhotos: Record<string, string> = (() => {
  const used = new Set<string>(), out: Record<string, string> = {};
  for (const id of WORDS) { const src = pool.find(src => !taken(src) && !used.has(src)); if (src) { used.add(src); out[id] = src; } }
  return out;
})();
/** Kept names for the sections that had their own photo before the plan above. */
export const notePhoto = sectionPhotos.journal;
export const statementPhoto = sectionPhotos.manifesto;


// Owner 2026-10-29 («many photo | text, photo | text together — at least photo | text, text | photo»): the sections that put a photo
// beside words take turns, in page order — story, the story bands, the business sections, the values band.
const featureIds = String((variants as Record<string, unknown>).feature ?? '').split(',').filter(Boolean);
const bandPhoto = (id: string) => Boolean((features as unknown as Record<string, Band | undefined>)[id]?.photo);
const storyLayout = String((variants as Record<string, unknown>).story ?? 'split');
const order: string[] = [
  ...(['split', 'pair'].includes(storyLayout) && photos.story ? ['story'] : []),
  ...['explore', 'capsule'].filter(id => featureIds.includes(id) && bandPhoto(id)),
  ...WORDS.filter(id => sectionPhotos[id]),
  ...(featureIds.includes('origin') && bandPhoto('origin') ? ['origin'] : []),
];
/** «start»: the photo first; «end»: the photo after the words (desktop only — a phone always shows the photo first). */
export const photoSide = (id: string): 'start' | 'end' => order.indexOf(id) % 2 === 1 ? 'end' : 'start';
