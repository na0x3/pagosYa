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
export const pickPhoto = unique([photos.p1, photos.p2, photos.p3, photos.p4]).find(src => !taken(src));
// The journal's lead note carries one photo the hero, story and pair story do not already show; the other notes are words only.
export const notePhoto = unique([photos.p3, photos.p2, photos.p4]).find(src => !taken(src) && src !== pickPhoto);
export const statementPhoto = unique([photos.p2, photos.p4, photos.p1, photos.p3]).find(src => !taken(src) && src !== pickPhoto && src !== notePhoto);


// Owner 2026-10-29 («many photo | text, photo | text together — at least photo | text, text | photo»): the sections that put a photo
// beside words take turns, in page order — story, the story bands, the business sections, the values band.
const featureIds = String((variants as Record<string, unknown>).feature ?? '').split(',').filter(Boolean);
const bandPhoto = (id: string) => Boolean((features as unknown as Record<string, Band | undefined>)[id]?.photo);
const storyLayout = String((variants as Record<string, unknown>).story ?? 'split');
const order: string[] = [
  ...(['split', 'pair'].includes(storyLayout) && photos.story ? ['story'] : []),
  ...['explore', 'capsule'].filter(id => featureIds.includes(id) && bandPhoto(id)),
  ...(sections as unknown as Array<{ id: string }>).flatMap(section => section.id === 'pick' && pickPhoto ? ['pick'] : section.id === 'manifesto' && statementPhoto ? ['manifesto'] : []),
  ...(featureIds.includes('origin') && bandPhoto('origin') ? ['origin'] : []),
];
/** «start»: the photo first; «end»: the photo after the words (desktop only — a phone always shows the photo first). */
export const photoSide = (id: string): 'start' | 'end' => order.indexOf(id) % 2 === 1 ? 'end' : 'start';
