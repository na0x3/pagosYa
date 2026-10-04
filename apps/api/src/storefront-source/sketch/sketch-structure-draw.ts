import { substanceCaps, type StoreSubstance } from './sketch-substance';
import type { SketchBlock, SketchSize, SketchWidth } from './sketch-schema';

export type PageSlot = { id: string; type: SketchBlock['type']; size: SketchSize; width: SketchWidth; media: boolean };
export type PageRhythm = 'crescendo' | 'alternating' | 'plateau-spikes' | 'calm';
export type PageParams = { length: number; opening: SketchBlock['type']; catalogAt: number; accentEvery: number | null; rhythm: PageRhythm; mediaBudget: number };
export type PageStructure = { slots: PageSlot[]; params: PageParams };

/** The page skeleton, generated before the model is called (spec 2026-10-04-page-grammar-and-real-copy).
 * It replaces a prose "structure" line the model demonstrably ignored: handed one of six grammars it produced
 * its own 13-block modal spine every time. There is nothing here for it to ignore — it receives slots and
 * fills them. Widening the variety means adding a parameter, not writing a seventh archetype. */

/** Bands that carry a page's argument. */
const EDITORIAL: SketchBlock['type'][] = ['hero', 'split', 'story', 'gallery'];
/** Thin coloured strips. Two of these touching reads as a mistake, so the grammar keeps them apart. */
export const ACCENT: SketchBlock['type'][] = ['announce', 'marquee', 'banner'];
const SUPPORT: SketchBlock['type'][] = ['steps', 'reviews', 'faq'];
const COMMERCE: SketchBlock['type'][] = ['catalog', 'collections'];
/** Types a page may hold at most once. `catalog` and `footer` are handled separately: exactly one. */
export const ONCE_ONLY: SketchBlock['type'][] = ['announce', 'newsletter', 'faq', 'collections', 'hero', 'story', 'gallery', 'steps', 'reviews'];
const SIZES: SketchSize[] = ['s', 'm', 'l', 'xl'];
const WIDTHS: SketchWidth[] = ['bleed', 'wide', 'narrow', 'offset-left', 'offset-right'];
/** Types that can carry a photo; `media` marks the slot so the prompt can spend the photo budget. */
const MEDIA_CAPABLE: SketchBlock['type'][] = ['hero', 'split', 'story', 'gallery', 'newsletter', 'collections'];

const RHYTHMS: PageRhythm[] = ['crescendo', 'alternating', 'plateau-spikes', 'calm'];

function sizeFor(rhythm: PageRhythm, index: number, length: number): SketchSize {
  const position = length > 1 ? index / (length - 1) : 0;
  switch (rhythm) {
    case 'crescendo': return SIZES[Math.min(3, Math.floor(position * 4))];
    case 'alternating': return index % 2 ? 'm' : 'l';
    case 'plateau-spikes': return index % 4 === 1 ? 'xl' : 'm';
    default: return position < 0.2 ? 'l' : 'm';
  }
}

export function drawPageStructure(substance: StoreSubstance, random: () => number = Math.random): PageStructure {
  const pick = <T>(items: readonly T[]): T => items[Math.min(items.length - 1, Math.floor(random() * items.length))];
  const caps = substanceCaps(substance);
  const allowed = (type: SketchBlock['type']) => !caps.forbid.includes(type);

  const length = Math.max(6, Math.min(caps.maxLength, 6 + Math.floor(random() * 9)));
  const opening = pick([...EDITORIAL, ...ACCENT].filter(allowed));
  const params: PageParams = {
    length, opening,
    catalogAt: 0.15 + random() * 0.7,
    accentEvery: pick([3, 4, 5, null]),
    rhythm: pick(RHYTHMS),
    mediaBudget: Math.min(caps.maxMedia, 1 + Math.floor(random() * 5)),
  };

  // Body types, in order: the opening, then a pool that respects the once-only rule and the substance caps.
  // Catalog is placed separately, so exclude it from the pool.
  const pool = [...EDITORIAL, ...SUPPORT, ...COMMERCE.filter(type => type !== 'catalog'), 'newsletter' as const].filter(allowed);
  const used = new Map<SketchBlock['type'], number>();
  const take = (type: SketchBlock['type']) => used.set(type, (used.get(type) ?? 0) + 1);
  const spent = (type: SketchBlock['type']) => ONCE_ONLY.includes(type) && (used.get(type) ?? 0) >= 1;

  const body: SketchBlock['type'][] = [];
  if (allowed(opening)) { body.push(opening); take(opening); }
  const bodyTarget = length - 1; // the footer takes the last slot
  while (body.length < bodyTarget) {
    const accentDue = params.accentEvery !== null && body.length > 0 && body.length % params.accentEvery === 0;
    const wantAccent = accentDue && !ACCENT.includes(body[body.length - 1]);
    const choices = (wantAccent ? ACCENT : pool).filter(type => allowed(type) && !spent(type) && !(ACCENT.includes(type) && ACCENT.includes(body[body.length - 1])));
    if (!choices.length) break;
    const type = pick(choices);
    body.push(type); take(type);
  }

  // Exactly one catalog, placed at catalogAt, when the store has something to sell.
  if (allowed('catalog')) {
    const existing = body.indexOf('catalog');
    if (existing !== -1) body.splice(existing, 1);
    body.splice(Math.max(0, Math.min(body.length, Math.round(params.catalogAt * body.length))), 0, 'catalog');
  }
  // `announce` is a strip above the page or it is nothing.
  const announceAt = body.indexOf('announce');
  if (announceAt > 0) { body.splice(announceAt, 1); body.unshift('announce'); }

  const types = [...body.slice(0, Math.max(0, length - 1)), 'footer' as const];
  let lastWidth: SketchWidth | null = null;
  let media = 0;
  const slots = types.map((type, index) => {
    const width = pick(WIDTHS.filter(candidate => candidate !== lastWidth));
    lastWidth = width;
    const canCarry = MEDIA_CAPABLE.includes(type) && media < params.mediaBudget;
    if (canCarry) media++;
    return { id: `s${index + 1}`, type, size: type === 'footer' ? 'm' : sizeFor(params.rhythm, index, types.length), width, media: canCarry } as PageSlot;
  });
  return { slots, params };
}
