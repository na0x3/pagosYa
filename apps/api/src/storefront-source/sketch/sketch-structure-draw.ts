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

  // Announce is either the opening or slot 0, or not in the page.
  const body: SketchBlock['type'][] = [];
  let openingAdded = false;

  if (opening === 'announce') {
    body.push('announce');
    take('announce');
    openingAdded = true;
  } else if (allowed('announce') && random() < 0.5) {
    // Announce at slot 0, before opening.
    body.push('announce');
    take('announce');
    // If opening is an accent, pick a non-accent editorial type instead.
    const actualOpening = ACCENT.includes(opening) ? pick([...EDITORIAL].filter(allowed)) : opening;
    body.push(actualOpening);
    take(actualOpening);
    openingAdded = true;
  }

  // Add opening if not yet added.
  if (!openingAdded) {
    body.push(opening);
    take(opening);
  }

  // Build body to fill remaining slots, accounting for catalog insertion.
  const bodyTarget = allowed('catalog') ? length - 2 : length - 1;
  while (body.length < bodyTarget) {
    const accentDue = params.accentEvery !== null && body.length > 0 && body.length % params.accentEvery === 0;
    const lastType = body[body.length - 1];
    const wantAccent = accentDue && !ACCENT.includes(lastType);
    // Announce is reserved for opening or slot 0; exclude it from accent choices during body building.
    const accentChoices = (used.get('announce') ?? 0) > 0 ? ACCENT : ACCENT.filter(type => type !== 'announce');
    const choices = (wantAccent ? accentChoices : pool).filter(type => allowed(type) && !spent(type) && !(ACCENT.includes(type) && ACCENT.includes(lastType)));
    if (!choices.length) break;
    const type = pick(choices);
    body.push(type);
    take(type);
  }

  // Exactly one catalog, placed at catalogAt, when the store has something to sell.
  if (allowed('catalog')) {
    body.splice(Math.max(0, Math.min(body.length, Math.round(params.catalogAt * body.length))), 0, 'catalog');
  }

  const types = [...body.slice(0, Math.max(0, length - 1)), 'footer' as const];
  let lastWidth: SketchWidth | null = null;
  let media = 0;
  let prevMedia = false;
  let prev2Media = false;

  const slots = types.map((type, index) => {
    const width = pick(WIDTHS.filter(candidate => candidate !== lastWidth));
    lastWidth = width;
    const canCarry = MEDIA_CAPABLE.includes(type) && media < params.mediaBudget && !(prevMedia && prev2Media);
    if (canCarry) media++;
    const slot = { id: `s${index + 1}`, type, size: type === 'footer' ? 'm' : sizeFor(params.rhythm, index, types.length), width, media: canCarry } as PageSlot;
    prev2Media = prevMedia;
    prevMedia = canCarry;
    return slot;
  });
  return { slots, params };
}

/** The grammar, as a predicate. Rules, not a list of approved pages — this is what makes the space
 * combinatorial. Exported so the draw's tests and the distribution test agree on what "legal" means.
 * It is total: a malformed structure is reported as a violation rather than thrown, because the caller
 * is a validator and a validator that crashes on bad input hides the very thing it exists to find. */
export function violations(structure: PageStructure, substance: StoreSubstance): string[] {
  const rawSlots: unknown = structure?.slots;
  if (!Array.isArray(rawSlots)) return ['structure has no slots'];
  const slots = rawSlots.filter((slot): slot is PageSlot => typeof slot === 'object' && slot !== null);
  const problems: string[] = [];
  if (slots.length !== rawSlots.length) problems.push('a slot is not an object');
  if (typeof substance !== 'object' || substance === null) return ['structure has no substance to be judged against'];
  const caps = substanceCaps(substance);
  const types = slots.map(slot => slot.type);

  if (slots.length < 6 || slots.length > caps.maxLength) problems.push(`length ${slots.length} outside 6..${caps.maxLength}`);
  if (types[types.length - 1] !== 'footer') problems.push('last slot is not a footer');
  if (types.filter(type => type === 'footer').length !== 1) problems.push('not exactly one footer');
  if (substance.products > 0 && types.filter(type => type === 'catalog').length !== 1) problems.push('not exactly one catalog');
  for (const banned of caps.forbid) if (types.includes(banned)) problems.push(`forbidden type present: ${banned}`);
  for (const type of ONCE_ONLY) if (types.filter(candidate => candidate === type).length > 1) problems.push(`repeated once-only type: ${type}`);
  if (types.includes('announce') && types.indexOf('announce') !== 0) problems.push('announce is not the first slot');
  if (new Set(slots.map(slot => slot.id)).size !== slots.length) problems.push('duplicate slot ids');
  if (slots.filter(slot => slot.media).length > caps.maxMedia) problems.push('media slots exceed the photo count');

  for (let i = 1; i < slots.length; i++) {
    if (ACCENT.includes(types[i]) && ACCENT.includes(types[i - 1])) problems.push(`accent bands adjacent at ${i}`);
    if (slots[i].width === slots[i - 1].width) problems.push(`repeated width at ${i}`);
  }
  for (let i = 2; i < slots.length; i++) {
    if (slots[i].media && slots[i - 1].media && slots[i - 2].media) problems.push(`three media slots in a row at ${i}`);
  }
  return problems;
}
