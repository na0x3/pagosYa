/** Variety spec §3: the platform's dice over Esencial's finished variants, seeded by the store. The fill call only says
 *  the business's character and what does not fit; the roll chooses everything else, and never repeats the hero +
 *  palette + font pair of the last master stores. */
import { createHash } from 'node:crypto';
import type { MasterSettings } from '@pagosya/store-templates';
import type { MasterCharacter, MasterVariants } from './source-master';
import { uploadPath } from './source-product-photos';
import { rollFeatures } from './source-master-features';

/** Review fix: one photo is counted once, whether it is a relative upload path or an absolute API URL. */
export const distinctPhotoCount = (urls: Array<string | null | undefined>) => new Set(urls.filter((url): url is string => Boolean(url)).map(uploadPath)).size;

/** Variants that need more than one photo to look right. */
const PHOTO_NEEDS: Record<string, number> = { collage: 3, strip: 3, pair: 2 };
const PALETTE_TONE: Record<string, 'bold' | 'calm'> = { ember: 'bold', cobalt: 'bold', citrus: 'bold', ink: 'bold', wine: 'bold', noir: 'bold' };
const PALETTE_TEMP: Record<string, 'warm' | 'cool' | 'neutral'> = {
  terracotta: 'warm', olive: 'warm', sand: 'warm', plum: 'warm', ember: 'warm', blush: 'warm', moss: 'warm', citrus: 'warm', wine: 'warm', noir: 'warm',
  sage: 'cool', navy: 'cool', cobalt: 'cool', ink: 'cool', mono: 'neutral', linen: 'neutral',
};

function rng(seed: string) {
  let counter = 0;
  return () => createHash('sha256').update(`${seed}:${counter++}`).digest().readUInt32BE(0) / 0x100000000;
}
const pick = <T>(next: () => number, list: readonly T[]): T => list[Math.floor(next() * list.length)];

/** Commerce displays fit any business; the fill call's exclusions skipped them every time (live 2026-10-19: offers «steps» never rolled). */
const DICE_ONLY = new Set(['cards', 'offers', 'menu', 'filters', 'feature']);
/** Owner 2026-10-22: product pages that open on a full-screen photo hide the name, price and buy button; the dice never picks them. */
const PHOTO_FIRST_PDP = new Set(['stacked', 'editorial']);

/** Fashion look spec 2026-10-21: the fashion card and product page belong to fashion stores only, and fashion stores always get them. */
const FASHION_PARTS = ['cards', 'pdp'] as const;

/** Dropdown menu spec 2026-10-21: a menu needs at least two categories to be worth opening; fashion stores always get one.
 *  It is rolled from its own seed, so adding the part left every other part, palette and font pair as it was. */
const MENU_MIN_CATEGORIES = 2;

/** The fill's style choice over the roll: it picks panel or dropdowns, never whether a non-fashion store has a menu. */
export function menuVariant(rolled: string | undefined, chosen: string | undefined, fashion: boolean): string | undefined {
  if (rolled === undefined) return undefined;
  const style = chosen === 'panel' || chosen === 'dropdowns' ? chosen : undefined;
  if (fashion) return style ?? 'panel';
  return rolled === 'none' ? 'none' : style ?? rolled;
}

/** Most recent first. */
export type RecentRoll = { hero: string; palette: string; fonts: string };

export function rollVariants(input: { seed: string; settings: MasterSettings; character: MasterCharacter; photoCount: number; sections: string[]; recent: RecentRoll[]; categoryCount?: number;
  /** John Smedley sections (spec 2026-10-21): the sections this store can have; without it the roll is left to the page assembly. */
  featureEligible?: string[] }): { variants: MasterVariants; palette: string; fonts: string } {
  const catalogue = (input.settings.variants ?? {}) as Record<string, readonly string[]>;
  // The fill call's exclusions are honoured for at most half of a part: a model that rules out nearly everything would
  // otherwise make every store the same (live check 2026-10-19: the feature grid on 4 of 6 stores).
  // Exclusions name their part («density:compact»): an id two parts share would otherwise rule out both (live 2026-10-19:
  // calm stores ruled out compact density and lost compact cards). A bare id counts only when one part owns it.
  const owners = (id: string) => Object.keys(catalogue).filter(part => catalogue[part].includes(id)).length;
  const excluded = (part: string, id: string) => input.character.exclude.includes(`${part}:${id}`) || (input.character.exclude.includes(id) && owners(id) === 1);
  const allowed = (part: string) => {
    const fits = catalogue[part].filter(id => id !== 'fashion' && !(part === 'pdp' && PHOTO_FIRST_PDP.has(id)) && (PHOTO_NEEDS[id] ?? 0) <= input.photoCount);
    const honoured = DICE_ONLY.has(part) ? [] : fits.filter(id => excluded(part, id)).slice(0, Math.floor(fits.length / 2));
    const list = fits.filter(id => !honoured.includes(id));
    return list.length ? list : [catalogue[part].find(id => id !== 'fashion') ?? catalogue[part][0]];
  };
  // Stores made one after another never share a font pair with the last six or a palette with the last two.
  const without = (list: string[], taken: string[]) => { const left = list.filter(id => !taken.includes(id)); return left.length ? left : list; };
  const palettes = input.settings.palettes.map(p => p.id);
  const sameTone = palettes.filter(id => (PALETTE_TONE[id] ?? 'calm') === input.character.tone);
  const fitting = sameTone.filter(id => input.character.temperature === 'neutral' || [input.character.temperature, 'neutral'].includes(PALETTE_TEMP[id] ?? 'neutral'));
  const palettePool = without(fitting.length >= 2 ? fitting : sameTone.length ? sameTone : palettes, input.recent.slice(0, 2).map(r => r.palette));
  const fonts = without(input.settings.fonts.map(f => f.id), input.recent.slice(0, 6).map(r => r.fonts));
  const taken = new Set(input.recent.map(r => `${r.hero}|${r.palette}|${r.fonts}`));
  const sections = input.sections.filter(id => (input.settings.sections ?? []).includes(id)).slice(0, 2);
  let last: { variants: MasterVariants; palette: string; fonts: string } | undefined;
  for (let attempt = 0; attempt < 20; attempt++) {
    const next = rng(`${input.seed}#${attempt}`);
    const variants = Object.fromEntries(Object.keys(catalogue).filter(part => part !== 'menu' && part !== 'filters' && part !== 'feature').map(part => [part, pick(next, allowed(part))])) as Record<string, string>;
    if (input.character.kind === 'fashion') for (const part of FASHION_PARTS) if (catalogue[part]?.includes('fashion')) variants[part] = 'fashion';
    if (catalogue.menu?.length) {
      variants.menu = input.character.kind === 'fashion' ? 'panel'
        : (input.categoryCount ?? 0) < MENU_MIN_CATEGORIES ? 'none'
        : pick(rng(`${input.seed}#menu`), allowed('menu'));
    }
    // Sort & filter styles spec 2026-10-21: a fashion store with categories gets the John Smedley chip rows; others roll, from
    // their own seed, so adding the part left every other roll as it was.
    if (catalogue.feature?.length && input.featureEligible) {
      variants.feature = rollFeatures({ seed: input.seed, eligible: input.featureEligible.filter(id => catalogue.feature.includes(id)), fashion: input.character.kind === 'fashion', exclude: input.character.exclude }).join(',');
    }
    if (catalogue.filters?.length) {
      variants.filters = input.character.kind === 'fashion' && (input.categoryCount ?? 0) >= 2 && catalogue.filters.includes('chips') ? 'chips'
        : pick(rng(`${input.seed}#filters`), allowed('filters'));
    }
    last = { variants: { ...variants, sections } as MasterVariants, palette: pick(next, palettePool), fonts: pick(next, fonts) };
    if (!taken.has(`${last.variants.hero}|${last.palette}|${last.fonts}`)) return last;
  }
  return last!;
}
