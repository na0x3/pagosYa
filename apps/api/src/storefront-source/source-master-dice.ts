/** Variety spec §3: the platform's dice over Esencial's finished variants, seeded by the store. The fill call only says
 *  the business's character and what does not fit; the roll chooses everything else, and never repeats the hero +
 *  palette + font pair of the last master stores. */
import { createHash } from 'node:crypto';
import type { MasterSettings } from '@pagosya/store-templates';
import type { MasterCharacter, MasterVariants } from './source-master';
import { uploadPath } from './source-product-photos';

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
const DICE_ONLY = new Set(['cards', 'offers']);

/** Most recent first. */
export type RecentRoll = { hero: string; palette: string; fonts: string };

export function rollVariants(input: { seed: string; settings: MasterSettings; character: MasterCharacter; photoCount: number; sections: string[]; recent: RecentRoll[] }): { variants: MasterVariants; palette: string; fonts: string } {
  const catalogue = (input.settings.variants ?? {}) as Record<string, readonly string[]>;
  // The fill call's exclusions are honoured for at most half of a part: a model that rules out nearly everything would
  // otherwise make every store the same (live check 2026-10-19: the feature grid on 4 of 6 stores).
  // Exclusions name their part («density:compact»): an id two parts share would otherwise rule out both (live 2026-10-19:
  // calm stores ruled out compact density and lost compact cards). A bare id counts only when one part owns it.
  const owners = (id: string) => Object.keys(catalogue).filter(part => catalogue[part].includes(id)).length;
  const excluded = (part: string, id: string) => input.character.exclude.includes(`${part}:${id}`) || (input.character.exclude.includes(id) && owners(id) === 1);
  const allowed = (part: string) => {
    const fits = catalogue[part].filter(id => (PHOTO_NEEDS[id] ?? 0) <= input.photoCount);
    const honoured = DICE_ONLY.has(part) ? [] : fits.filter(id => excluded(part, id)).slice(0, Math.floor(fits.length / 2));
    const list = fits.filter(id => !honoured.includes(id));
    return list.length ? list : [catalogue[part][0]];
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
    const variants = Object.fromEntries(Object.keys(catalogue).map(part => [part, pick(next, allowed(part))])) as Record<string, string>;
    last = { variants: { ...variants, sections } as MasterVariants, palette: pick(next, palettePool), fonts: pick(next, fonts) };
    if (!taken.has(`${last.variants.hero}|${last.palette}|${last.fonts}`)) return last;
  }
  return last!;
}
