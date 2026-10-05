import type { StoreSketch } from './sketch-schema';

/** What a vision pass recorded about each upload, as `visual-assets.json` stores it. */
export type PhotoFact = { path: string; description?: string };

/** Short and generic words carry no evidence about which picture a card shows, so they are not counted. The list is
 * deliberately small: it only has to stop a stray "sobre"/"entre" from being mistaken for a match. */
const STOPWORDS = new Set([
  'sobre', 'entre', 'para', 'como', 'desde', 'hasta', 'cada', 'esta', 'este', 'esto', 'esos', 'esas', 'otro', 'otra',
  'donde', 'cuando', 'porque', 'pero', 'tiene', 'tienen', 'hace', 'hacen', 'pueden', 'puede', 'with', 'from',
]);

/** Content words of a phrase, accent- and case-insensitive. Four letters is the floor: it drops the articles and
 * prepositions Spanish leans on without needing a dictionary. */
const words = (value: string): Set<string> =>
  new Set(
    value
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(word => word.length >= 4 && !STOPWORDS.has(word)),
  );

const overlap = (a: Set<string>, b: Set<string>): number => {
  let shared = 0;
  for (const word of a) if (b.has(word)) shared++;
  return shared;
};

/** How much evidence a re-pairing needs. Two shared content words is already a sentence talking about the same
 * picture ("amapolas", "blancas"); one could be a coincidence of vocabulary across a themed catalogue. */
const MIN_EVIDENCE = 2;

type Card = { title: string; text: string; photo?: string };

/**
 * Put every collection card back on the photo its own copy describes.
 *
 * The model writes each card's words and then has to name the photo it belongs to by a content-hashed filename.
 * The words it writes are near-copies of the authoritative descriptions, so when the filenames come out shuffled the
 * evidence to undo it is already on the page — this compares the two and repairs the pairing.
 *
 * It is deliberately timid, because a wrong repair is worse than the bug it fixes:
 * - it only ever permutes photos the page was already showing, so the set of pictures never changes;
 * - it needs {@link MIN_EVIDENCE} shared content words, and the winner takes the photo ahead of weaker claims;
 * - with no descriptions, or no card whose copy describes its picture, it returns the sketch untouched.
 */
export function repairPhotoPairing(sketch: StoreSketch, facts: PhotoFact[]): { sketch: StoreSketch; notes: string[] } {
  const described = new Map<string, Set<string>>();
  for (const fact of facts) if (fact.description?.trim()) described.set(fact.path, words(fact.description));
  if (!described.size) return { sketch, notes: [] };

  const cards: Card[] = [];
  for (const block of sketch.blocks) if (block.type === 'collections') for (const item of block.items) if (item.photo) cards.push(item);
  // A single card has nothing to swap with, and a photo with no description cannot be judged.
  const pool = cards.map(card => card.photo!).filter(photo => described.has(photo));
  if (cards.length < 2 || pool.length < 2) return { sketch, notes: [] };

  const scored = cards.map(card => ({ card, copy: words(`${card.title} ${card.text}`) }));
  const candidates: Array<{ index: number; photo: string; score: number }> = [];
  for (const [index, { card, copy }] of scored.entries()) {
    const held = described.get(card.photo!);
    const holding = held ? overlap(copy, held) : 0;
    for (const photo of new Set(pool)) {
      const score = overlap(copy, described.get(photo)!);
      // A card defends the photo it already has at its own score, so one that is correctly paired cannot be
      // outbid by a weaker claim elsewhere on the page. Anything else must beat what the card is holding.
      if (photo === card.photo ? score > 0 : score >= MIN_EVIDENCE && score > holding) candidates.push({ index, photo, score });
    }
  }
  // Strongest evidence first; ties keep page order so the result never depends on object iteration order.
  candidates.sort((a, b) => b.score - a.score || a.index - b.index || a.photo.localeCompare(b.photo));

  const remaining = [...pool];
  const take = (photo: string) => {
    const at = remaining.indexOf(photo);
    if (at === -1) return false;
    remaining.splice(at, 1);
    return true;
  };
  const assigned = new Map<number, string>();
  for (const { index, photo } of candidates) {
    if (assigned.has(index) || !remaining.includes(photo)) continue;
    assigned.set(index, photo);
    take(photo);
  }
  // Cards the copy could not place keep what they had whenever it is still free, so an unmatched card is never
  // dragged along by a repair elsewhere on the page.
  for (const [index, { card }] of scored.entries()) {
    if (assigned.has(index) || !described.has(card.photo!)) continue;
    if (take(card.photo!)) assigned.set(index, card.photo!);
  }
  for (const [index, { card }] of scored.entries()) {
    if (assigned.has(index) || !described.has(card.photo!)) continue;
    const next = remaining.shift();
    if (next) assigned.set(index, next);
  }

  const moved = [...assigned.entries()].filter(([index, photo]) => scored[index].card.photo !== photo);
  if (!moved.length) return { sketch, notes: [] };
  const blocks = sketch.blocks.map(block => {
    if (block.type !== 'collections') return block;
    return { ...block, items: block.items.map(item => {
      const index = scored.findIndex(entry => entry.card === item);
      const photo = index === -1 ? undefined : assigned.get(index);
      return photo && photo !== item.photo ? { ...item, photo } : item;
    }) };
  });
  return {
    sketch: { ...sketch, blocks },
    notes: [`${moved.length} ${moved.length === 1 ? 'tarjeta mostraba' : 'tarjetas mostraban'} una foto que no coincidía con su texto; se corrigió el emparejamiento`],
  };
}
