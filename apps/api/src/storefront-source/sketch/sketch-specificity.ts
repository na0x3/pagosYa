import type { CatalogueDigest } from './sketch-catalogue-digest';
import type { StoreSketch } from './sketch-schema';

/** Does the page say anything only this store could say? A measurement for the eval script and the tests, never a
 * repair: rewriting a model's prose mechanically produces worse prose than leaving it alone, so this reads the
 * sketch and reports. It is total because it receives model output and database-derived data. */

/** Phrases that would be true of any store on the platform. Named rather than described, because the model
 * reproduces them verbatim: every one of these came out of a real generation. */
const FILLER = ['calidad que se nota', 'hecho con amor', 'una selección pensada', 'objetos que conversan', 'pensada como una revista', 'para mirar de cerca', 'lo mejor para vos'];

/** Keys whose strings are copy a visitor reads. An allowlist, because the blocks also carry ids, colours, hrefs,
 * photo paths and icon names that would otherwise count as prose, and button labels ("Ver productos") and
 * reviewer names that say nothing about the catalogue. Nested lists (items, boxes, quotes, stats) are walked. */
const PROSE_KEYS = new Set(['kicker', 'title', 'headline', 'sub', 'body', 'note', 'tagline', 'text', 'left', 'right', 'caption', 'trust', 'badge', 'tag', 'sticker', 'paragraphs', 'pills', 'q', 'a', 'label', 'stripLeft', 'stripRight']);

/** Accent- and case-folded, punctuation to spaces, so "Algodón" in the digest meets "algodon" in the prose. */
const fold = (value: string) => ` ${value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9ñ]+/g, ' ').trim()} `;

function collect(value: unknown, key: string | undefined, out: string[], depth: number) {
  if (depth > 6) return;
  if (typeof value === 'string') { if (key && PROSE_KEYS.has(key)) out.push(value); return; }
  if (Array.isArray(value)) { for (const entry of value.slice(0, 64)) collect(entry, key, out, depth + 1); return; }
  if (typeof value === 'object' && value !== null) {
    for (const [k, v] of Object.entries(value)) collect(v, PROSE_KEYS.has(k) ? k : undefined, out, depth + 1);
  }
}

/** Three letters match half the alphabet ("sal" inside "salud"), and a bare number is a price, not a noun. */
const usable = (term: string) => term.trim().length >= 4 && /[a-zñ]/.test(term);

/** The digest fields worth matching a claim against: what a shopper would call the product (name, category, tags),
 * what it is made of or comes in (the value half of a fact or option), never the sentence-long description or the
 * formatted price, which a page can mention without knowing anything. */
function terms(catalogue: CatalogueDigest): string[] {
  const out = new Set<string>();
  const add = (raw: unknown) => { if (typeof raw === 'string') { const term = fold(raw); if (usable(term)) out.add(term); } };
  const afterColon = (raw: string) => raw.slice(raw.indexOf(':') + 1);
  for (const item of Array.isArray(catalogue?.items) ? catalogue.items : []) {
    add(item?.name);
    // A page says "la focaccia", not "Focaccia romero 500g"; long words of a name stand for it.
    if (typeof item?.name === 'string') for (const word of fold(item.name).split(' ')) if (word.length >= 5 && /[a-zñ]/.test(word)) add(word);
    add(item?.category);
    for (const tag of Array.isArray(item?.tags) ? item.tags : []) add(tag);
    for (const option of Array.isArray(item?.options) ? item.options : []) if (typeof option === 'string') for (const value of afterColon(option).split(',')) add(value);
    for (const fact of Array.isArray(item?.facts) ? item.facts : []) if (typeof fact === 'string') add(afterColon(fact));
  }
  for (const category of Array.isArray(catalogue?.totals?.categories) ? catalogue.totals.categories : []) add(category);
  return [...out];
}

// Word-boundary, tolerating a plural: "camisetas" is the product "camiseta".
const mentions = (text: string, term: string) => text.includes(term) || text.includes(`${term.trimEnd()}s `) || text.includes(`${term.trimEnd()}es `);

export type SpecificityReport = {
  /** Every block on the page, prose or not. */
  blocks: number;
  /** Blocks that carry enough prose to be judged: a banner of three words is not evidence either way. */
  bands: number;
  /** Prose bands that mention at least one real thing from the catalogue. 1 of 9 and 8 of 9 are different pages. */
  groundedBands: number;
  /** Distinct catalogue terms mentioned, summed per band. */
  hits: number;
  filler: string[];
};

export function specificityReport(sketch: StoreSketch, catalogue: CatalogueDigest): SpecificityReport {
  const report: SpecificityReport = { blocks: 0, bands: 0, groundedBands: 0, hits: 0, filler: [] };
  try {
    const known = terms(catalogue);
    const filler = new Set<string>();
    const blocks = Array.isArray(sketch?.blocks) ? sketch.blocks : [];
    report.blocks = blocks.length;
    for (const block of blocks) {
      const parts: string[] = [];
      collect(block, undefined, parts, 0);
      const text = fold(parts.join(' . '));
      if (text.trim().length < 12) continue;
      report.bands++;
      const found = known.filter(term => mentions(text, term)).length;
      report.hits += found;
      if (found) report.groundedBands++;
      for (const phrase of FILLER) if (text.includes(fold(phrase))) filler.add(phrase);
    }
    report.filler = [...filler];
  } catch { /* a measurement never fails the caller */ }
  return report;
}
