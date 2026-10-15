/**
 * The store controls library (spec 2026-10-14, part 5): eleven hand-designed button languages, one per outline, and icons drawn
 * for a 24×24 box in two styles (line and solid). Every icon is filled with currentColor using the even-odd rule, so a line icon
 * is drawn as its own outline. Revision N of every Sep-5 build gets a pick from here, and YAPI's own design falls back to it.
 * Pure: no I/O, no randomness (the pick is seeded).
 */
import { CART_WORDS } from './design-engine/commerce-draw';
import type { PlaybookKind } from './design-engine/playbook';
import { ICON_SLOTS, sanitizeControls, WORD_MAX_CHARS, type ControlBadge, type IconSlot, type StoreControls } from './store-controls';
import type { StoreLook } from './store-look';

export type IconStyle = 'line' | 'solid';
export type CartIcon = 'cup' | 'bag' | 'basket' | 'frame' | 'scoop' | 'briefcase' | 'leaf' | 'paw';

/** The cart icon by what the store sells. */
export const CART_ICONS: Record<CartIcon, Record<IconStyle, string>> = {
  cup: {
    line: 'M4 7h12v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM5.75 8.75h8.5V13a3.25 3.25 0 0 1-3.25 3.25H9A3.25 3.25 0 0 1 5.75 13zM16 8.5h1.5a3 3 0 0 1 0 6H16v-1.75h1.5a1.25 1.25 0 0 0 0-2.5H16zM3 20h16v1.75H3z',
    solid: 'M4 6.5h12.5V13a5.5 5.5 0 0 1-5.5 5.5H9.5A5.5 5.5 0 0 1 4 13zM16.5 8h1.25a3.25 3.25 0 0 1 0 6.5H16.5v-2h1.25a1.25 1.25 0 0 0 0-2.5H16.5zM2.5 19.75h17v2h-17z',
  },
  bag: {
    line: 'M5 8h14l-1 13H6zM6.8 9.75h10.4l-.75 9.5H7.55zM9 8V6.5a3 3 0 0 1 6 0V8h-1.75V6.5a1.25 1.25 0 0 0-2.5 0V8z',
    solid: 'M4.5 8h15l-1.2 13.5H5.7zM8.5 8V6.5a3.5 3.5 0 0 1 7 0V8h-2V6.5a1.5 1.5 0 0 0-3 0V8z',
  },
  basket: {
    line: 'M3 10h18l-2 10H5zM5.2 11.75h13.6l-1.3 6.5h-11zM11.1 11.75h1.8v6.5h-1.8zM6 10a6 6 0 0 1 12 0h-1.75a4.25 4.25 0 0 0-8.5 0z',
    solid: 'M2.5 9.5h19l-2.2 11H4.7zM8 12h1.5v6H8zM11.25 12h1.5v6h-1.5zM14.5 12H16v6h-1.5zM5.5 9.5a6.5 6.5 0 0 1 13 0h-2.25a4.25 4.25 0 0 0-8.5 0z',
  },
  frame: {
    line: 'M3 4h18v16H3zM5 6h14v12H5zM7 16l3.5-4.5 2.5 3 1.5-2 2.5 3.5zM15 7.5a1.5 1.5 0 1 1 0 3a1.5 1.5 0 1 1 0-3z',
    solid: 'M2.5 3.5h19v17h-19zM6 15.5l3.5-4.5 2.5 3 1.5-2 3 3.5zM15.5 7a1.75 1.75 0 1 1 0 3.5a1.75 1.75 0 1 1 0-3.5z',
  },
  scoop: {
    line: 'M6 11.5a6 6 0 0 1 12 0v.5H6zM7.8 10.25a4.25 4.25 0 0 1 8.4 0zM7.5 12h9L12 22zM9.9 13.5h4.2L12 18.4z',
    solid: 'M5.5 11.5a6.5 6.5 0 0 1 13 0v1H5.5zM7.25 12.5h9.5L12 22.5z',
  },
  briefcase: {
    line: 'M3 8h18v12H3zM4.75 9.75h14.5v8.5H4.75zM4.75 13h14.5v1.5H4.75zM8.5 8V5.5h7V8h-1.75V7.25h-3.5V8z',
    solid: 'M2.5 7.5h19v13h-19zM10.5 12.5h3v2h-3zM8 7.5V5h8v2.5h-2V7h-4v.5z',
  },
  leaf: {
    line: 'M4 20A16 16 0 0 1 20 4A16 16 0 0 1 4 20zM6.5 17.5A13.5 13.5 0 0 1 17.5 6.5A13.5 13.5 0 0 1 6.5 17.5zM8.5 15.5 15.5 8.5l1 1-7 7z',
    solid: 'M3.5 20.5A17 17 0 0 1 20.5 3.5A17 17 0 0 1 3.5 20.5zM8 15 15 8l1 1-7 7z',
  },
  paw: {
    line: 'M12 12.5c3 0 6 3.2 6 5.8 0 1.7-1.3 2.7-3 2.7-1.2 0-2-.6-3-.6s-1.8.6-3 .6c-1.7 0-3-1-3-2.7 0-2.6 3-5.8 6-5.8zM12 14.25c2.1 0 4.25 2.4 4.25 4.1 0 .7-.5 1-1.25 1-.9 0-1.8-.6-3-.6s-2.1.6-3 .6c-.75 0-1.25-.3-1.25-1 0-1.7 2.15-4.1 4.25-4.1zM5.5 7.9a2.1 2.1 0 1 1 0 4.2a2.1 2.1 0 1 1 0-4.2zM5.5 8.9a1.1 1.1 0 1 0 0 2.2a1.1 1.1 0 1 0 0-2.2zM9.5 4.15a2.1 2.1 0 1 1 0 4.2a2.1 2.1 0 1 1 0-4.2zM9.5 5.15a1.1 1.1 0 1 0 0 2.2a1.1 1.1 0 1 0 0-2.2zM14.5 4.15a2.1 2.1 0 1 1 0 4.2a2.1 2.1 0 1 1 0-4.2zM14.5 5.15a1.1 1.1 0 1 0 0 2.2a1.1 1.1 0 1 0 0-2.2zM18.5 7.9a2.1 2.1 0 1 1 0 4.2a2.1 2.1 0 1 1 0-4.2zM18.5 8.9a1.1 1.1 0 1 0 0 2.2a1.1 1.1 0 1 0 0-2.2z',
    solid: 'M12 12.5c3 0 6 3.2 6 5.8 0 1.7-1.3 2.7-3 2.7-1.2 0-2-.6-3-.6s-1.8.6-3 .6c-1.7 0-3-1-3-2.7 0-2.6 3-5.8 6-5.8zM5.5 8.1a1.9 1.9 0 1 1 0 3.8a1.9 1.9 0 1 1 0-3.8zM9.5 4.4a2.1 2.1 0 1 1 0 4.2a2.1 2.1 0 1 1 0-4.2zM14.5 4.4a2.1 2.1 0 1 1 0 4.2a2.1 2.1 0 1 1 0-4.2zM18.5 8.1a1.9 1.9 0 1 1 0 3.8a1.9 1.9 0 1 1 0-3.8z',
  },
};

/** Account, menu, search, plus, minus and close: the same drawings for every store, in the language's style. */
export const SHARED_ICONS: Record<Exclude<IconSlot, 'cart'>, Record<IconStyle, string>> = {
  account: {
    line: 'M12 4a4 4 0 1 1 0 8a4 4 0 1 1 0-8zM12 5.5a2.5 2.5 0 1 0 0 5a2.5 2.5 0 1 0 0-5zM4 21v-1c0-3.9 3.6-6.5 8-6.5s8 2.6 8 6.5v1h-1.75v-1c0-2.8-2.8-4.75-6.25-4.75S5.75 17.2 5.75 20v1z',
    solid: 'M12 3a4.5 4.5 0 1 1 0 9a4.5 4.5 0 1 1 0-9zM3.5 21c0-4.4 3.8-7.5 8.5-7.5s8.5 3.1 8.5 7.5z',
  },
  menu: { line: 'M4 6h16v2H4zM4 11h16v2H4zM4 16h16v2H4z', solid: 'M3 5h18v3H3zM3 10.5h18v3H3zM3 16h18v3H3z' },
  search: {
    line: 'M10 3.5a6.5 6.5 0 1 1 0 13a6.5 6.5 0 1 1 0-13zM10 5.25a4.75 4.75 0 1 0 0 9.5a4.75 4.75 0 1 0 0-9.5zM14.3 15.5l1.2-1.2 5 5-1.2 1.2z',
    solid: 'M10 3a7 7 0 1 1 0 14a7 7 0 1 1 0-14zM10 6a4 4 0 1 0 0 8a4 4 0 1 0 0-8zM14.6 16.7l2.1-2.1 4.5 4.5-2.1 2.1z',
  },
  plus: { line: 'M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z', solid: 'M10 4h4v6h6v4h-6v6h-4v-6H4v-4h6z' },
  minus: { line: 'M5 11h14v2H5z', solid: 'M4 10h16v4H4z' },
  close: {
    line: 'M6.4 5 12 10.6 17.6 5 19 6.4 13.4 12 19 17.6 17.6 19 12 13.4 6.4 19 5 17.6 10.6 12 5 6.4z',
    solid: 'M6 3.5l6 6 6-6 2.5 2.5-6 6 6 6-2.5 2.5-6-6-6 6-2.5-2.5 6-6-6-6z',
  },
};

export const KIND_CART_ICON: Record<PlaybookKind, CartIcon> = {
  'cafe-food': 'cup', 'bakery-sweets': 'scoop', clothing: 'bag', beauty: 'leaf', services: 'briefcase',
  'fitness-wellness': 'leaf', 'crafts-home': 'frame', 'flowers-gifts': 'basket', general: 'bag',
};
// \b treats accented letters as non-word characters, so whole words use letter lookarounds (as frame-draw.ts does).
const PET_WORDS = /(?<!\p{L})(mascotas?|perr[oa]s?|gat[oa]s?|veterinari[ao]s?|pet ?shop)(?!\p{L})/iu;
/** The cart icon of a store: its kind's, or the paw when the merchant's own words are about pets (no playbook kind for them). */
export function cartIconFor(kind: PlaybookKind, words = ''): CartIcon {
  return PET_WORDS.test(words) ? 'paw' : KIND_CART_ICON[kind] ?? 'bag';
}

export type ControlLanguage = { id: string; mode: 'calm' | 'bold' | 'both'; icons: IconStyle; shape: StoreControls['shape']; layout: StoreControls['layout']; badge: ControlBadge };
/** One hand-designed language per outline, with tuned numbers and a badge style. */
export const CONTROL_LANGUAGES: ControlLanguage[] = [
  { id: 'quiet-rounded', mode: 'calm', icons: 'line', shape: { outline: 'rounded', corner: 10, notch: 0, tilt: 0, border: 'hairline', weight: 1, fill: 'outline', colour: 'ink' }, layout: { cart: 'icon+word', account: 'icon' }, badge: 'circle' },
  { id: 'soft-pill', mode: 'calm', icons: 'line', shape: { outline: 'pill', corner: 24, notch: 0, tilt: 0, border: 'none', weight: 1, fill: 'solid', colour: 'accent' }, layout: { cart: 'icon+word', account: 'word' }, badge: 'inline' },
  { id: 'ledger-square', mode: 'calm', icons: 'line', shape: { outline: 'square', corner: 0, notch: 0, tilt: 0, border: 'solid', weight: 1.5, fill: 'ghost', colour: 'ink' }, layout: { cart: 'word', account: 'word' }, badge: 'inline' },
  { id: 'ticket-stub', mode: 'bold', icons: 'solid', shape: { outline: 'ticket', corner: 4, notch: 5, tilt: 0, border: 'none', weight: 2, fill: 'solid', colour: 'accent' }, layout: { cart: 'icon+word', account: 'icon' }, badge: 'stamp' },
  { id: 'price-tag', mode: 'both', icons: 'line', shape: { outline: 'tag', corner: 4, notch: 6, tilt: 0, border: 'solid', weight: 1.5, fill: 'outline', colour: 'accent' }, layout: { cart: 'icon+word', account: 'icon' }, badge: 'corner' },
  { id: 'sticker', mode: 'bold', icons: 'solid', shape: { outline: 'sticker', corner: 14, notch: 0, tilt: -3, border: 'none', weight: 2, fill: 'solid', colour: 'accent' }, layout: { cart: 'icon', account: 'icon' }, badge: 'circle' },
  { id: 'folder-tab', mode: 'calm', icons: 'line', shape: { outline: 'tab', corner: 8, notch: 0, tilt: 0, border: 'solid', weight: 1, fill: 'inverted', colour: 'ink' }, layout: { cart: 'icon+word', account: 'icon' }, badge: 'inline' },
  { id: 'postage-stamp', mode: 'bold', icons: 'solid', shape: { outline: 'stamp', corner: 0, notch: 6, tilt: 2, border: 'none', weight: 2, fill: 'solid', colour: 'ink' }, layout: { cart: 'icon', account: 'icon' }, badge: 'dot' },
  { id: 'corner-brackets', mode: 'calm', icons: 'line', shape: { outline: 'bracket', corner: 0, notch: 0, tilt: 0, border: 'none', weight: 2, fill: 'ghost', colour: 'ink' }, layout: { cart: 'icon+word', account: 'icon' }, badge: 'inline' },
  { id: 'underlined', mode: 'calm', icons: 'line', shape: { outline: 'underline', corner: 0, notch: 0, tilt: 0, border: 'none', weight: 2, fill: 'ghost', colour: 'accent' }, layout: { cart: 'word', account: 'word' }, badge: 'inline' },
  { id: 'pebble', mode: 'bold', icons: 'solid', shape: { outline: 'blob', corner: 20, notch: 0, tilt: -2, border: 'none', weight: 2, fill: 'solid', colour: 'accent' }, layout: { cart: 'icon', account: 'icon' }, badge: 'dot' },
];

export type StorePalette = { paper: string; ink: string; accent: string; onAccent: string };
/** The store's four header tokens when they are plain hex (styles.css, then brand.css); undefined otherwise (oklch, var()…). */
export function storePalette(files: ReadonlyArray<{ path: string; content: string }>): StorePalette | undefined {
  const css = ['styles.css', 'brand.css'].map(path => files.find(file => file.path === path)?.content ?? '').join('\n');
  const read = (name: string) => css.match(new RegExp(`--(?:store|brand)-${name}\\s*:\\s*(#[0-9a-fA-F]{6})\\b`))?.[1]?.toLowerCase();
  const paper = read('background'), ink = read('foreground'), accent = read('accent'), onAccent = read('accent-foreground');
  return paper && ink && accent && onAccent ? { paper, ink, accent, onAccent } : undefined;
}
const luminance = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
  .map(v => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
export function hexContrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}
/** Can the store read this language on its header? Words need 4.5:1, an icon-only language 3:1 (controls.css's fill rules). */
export function languageReadable(language: ControlLanguage, palette?: StorePalette): boolean {
  if (!palette) return true;
  const colour = { accent: palette.accent, ink: palette.ink, paper: palette.paper }[language.shape.colour];
  const on = { accent: palette.onAccent, ink: palette.paper, paper: palette.ink }[language.shape.colour];
  const [background, foreground] = language.shape.fill === 'solid' ? [colour, on]
    : language.shape.fill === 'outline' ? [palette.paper, colour]
    : language.shape.fill === 'ghost' ? [palette.paper, palette.ink]
    : [on, colour];
  const words = language.layout.cart !== 'icon' || language.layout.account !== 'icon';
  return hexContrast(foreground, background) >= (words ? 4.5 : 3);
}

/** The library name of a cart drawing, either style; 'custom' for YAPI's own, 'none' without one. */
export function cartIconName(d: string | undefined): CartIcon | 'custom' | 'none' {
  if (!d) return 'none';
  for (const [name, styles] of Object.entries(CART_ICONS) as Array<[CartIcon, Record<IconStyle, string>]>) if (styles.line === d || styles.solid === d) return name;
  return 'custom';
}
/** What two stores must not share (spec criterion 2): the outline plus the cart icon. */
export function controlsKey(controls: StoreControls): string {
  const name = cartIconName(controls.icons.cart);
  return `${controls.shape.outline}|${name === 'custom' ? controls.icons.cart : name}`;
}

/** A language made into a store's record: its icons in the language's style, the kind's cart word, «Mi cuenta». */
export function libraryRecord(language: ControlLanguage, kind: PlaybookKind, cartIcon: CartIcon, look?: StoreLook): StoreControls {
  const button = look?.shape?.button;
  const corner = language.shape.outline === 'rounded' && typeof button === 'number' ? Math.min(24, Math.max(4, button)) : language.shape.corner;
  const cartWord = CART_WORDS[kind];
  return {
    version: 1,
    shape: { ...language.shape, corner },
    layout: { ...language.layout },
    icons: Object.fromEntries(ICON_SLOTS.map(slot => [slot, slot === 'cart' ? CART_ICONS[cartIcon][language.icons] : SHARED_ICONS[slot][language.icons]])),
    words: { ...(cartWord && [...cartWord].length <= WORD_MAX_CHARS ? { cart: cartWord } : {}), account: 'Mi cuenta' },
    badge: language.badge,
    source: 'library',
  };
}
/** The icon a failing slot falls back to: the line drawing of the store's own library icons. */
export function libraryIconFallback(kind: PlaybookKind, words = '', style: IconStyle = 'line'): (slot: IconSlot) => string {
  const cart = cartIconFor(kind, words);
  return slot => slot === 'cart' ? CART_ICONS[cart][style] : SHARED_ICONS[slot][style];
}

const seededIndex = (seed: string, length: number) => {
  let hash = 0x811c9dc5;
  for (const char of seed) { hash ^= char.codePointAt(0)!; hash = Math.imul(hash, 0x01000193) >>> 0; }
  return hash % length;
};
/** How well an outline follows the home's measured buttons and edges (store-look.ts); higher is closer. */
function lookAffinity(language: ControlLanguage, look?: StoreLook): number {
  const button = look?.shape?.button, outline = language.shape.outline;
  let score = 0;
  if (button === 'pill') score += ['pill', 'blob', 'rounded'].includes(outline) ? 2 : 0;
  else if (typeof button === 'number' && button <= 2) score += ['square', 'bracket', 'underline', 'tab', 'stamp', 'ticket'].includes(outline) ? 2 : 0;
  else if (typeof button === 'number') score += ['rounded', 'tag', 'ticket', 'sticker', 'tab'].includes(outline) ? 2 : 0;
  if (look?.edge === 'offset' || look?.edge === 'outline') score += ['sticker', 'stamp', 'ticket', 'tag'].includes(outline) ? 1 : 0;
  if (look?.edge === 'hairline' || look?.edge === 'none') score += ['rounded', 'pill', 'underline', 'bracket', 'square'].includes(outline) ? 1 : 0;
  return score;
}

export type LibraryPickInput = { kind: PlaybookKind; mode: 'calm' | 'bold'; seed: string; look?: StoreLook; avoid?: StoreControls[]; words?: string; palette?: StorePalette };
/**
 * Revision N's language (spec part 4): a pure function of the kind, calm or bold, the measured look and a seed. It never takes an
 * outline and cart icon a sibling store has (`avoid`), prefers outlines siblings do not use, and skips languages the store's
 * colours cannot read. When everything is taken it relaxes the mode, then readability, and always answers.
 */
export function pickLibraryControls(input: LibraryPickInput): StoreControls {
  const cartIcon = cartIconFor(input.kind, input.words);
  const avoid = input.avoid ?? [];
  const taken = new Set(avoid.map(controlsKey));
  const usedOutlines = new Set(avoid.map(controls => controls.shape.outline));
  const readable = CONTROL_LANGUAGES.filter(language => languageReadable(language, input.palette));
  const inMode = readable.filter(language => language.mode === 'both' || language.mode === input.mode);
  for (const pool of [inMode, readable, CONTROL_LANGUAGES]) {
    const options = pool.map(language => ({ language, record: libraryRecord(language, input.kind, cartIcon, input.look) })).filter(option => !taken.has(controlsKey(option.record)));
    if (!options.length) continue;
    const scored = options.map(option => ({ ...option, score: lookAffinity(option.language, input.look) - (usedOutlines.has(option.language.shape.outline) ? 2 : 0) }));
    const best = Math.max(...scored.map(option => option.score));
    const top = scored.filter(option => option.score >= best - 1);
    return top[seededIndex(input.seed, top.length)].record;
  }
  return libraryRecord(CONTROL_LANGUAGES[0], input.kind, cartIcon, input.look);
}

/** One other store's language, with the business kind its frame draw recorded (SourceProjectsService.recentControls). */
export type RecentControls = { kind?: string; controls: StoreControls };
/** The languages a new store must not repeat (spec part 4): the same-kind stores first, then the newest others, each once. */
export function controlsToAvoid(rows: RecentControls[], kind: string, limit = 6): StoreControls[] {
  const ordered = [...rows.filter(row => row.kind === kind), ...rows.filter(row => row.kind !== kind)];
  const seen = new Set<string>();
  const out: StoreControls[] = [];
  for (const { controls } of ordered) {
    const key = controlsKey(controls);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(controls);
    if (out.length === limit) break;
  }
  return out;
}

/** Spec 2026-10-14 live-check criterion 2 over a set of stores: two stores with the same outline and cart icon are duplicates (the
 *  later store named first). A store without a record has nothing to compare and is reported apart. */
export function controlsUniqueness(stores: ReadonlyArray<{ slug: string; controls?: unknown }>): { unique: boolean; duplicates: Array<[string, string]>; without: string[] } {
  const seen = new Map<string, string>();
  const duplicates: Array<[string, string]> = [], without: string[] = [];
  for (const { slug, controls: raw } of stores) {
    const controls = sanitizeControls(raw);
    if (!controls) { without.push(slug); continue; }
    const key = controlsKey(controls);
    const first = seen.get(key);
    if (first) duplicates.push([slug, first]); else seen.set(key, slug);
  }
  return { unique: duplicates.length === 0, duplicates, without };
}
