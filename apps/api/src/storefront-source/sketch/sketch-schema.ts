import { sectionCompositions, type WebsiteDesignSpec } from '@pagosya/shared-types';
import { syncDesignSpec } from '../design-engine/design-document';
import { repairSketchFree, repairSketchLayout, sketchFreePos, sketchGroups, sketchRemapFree, SKETCH_COPY_ORDER, SKETCH_EXTRA_KINDS, SKETCH_EXTRA_MAX, type SketchExtra, type SketchExtraKind, type SketchFreePos, type SketchGroupLayout } from '@pagosya/shared-types';
import { SOURCE_FONT_IDS } from '../source-font-catalog';
import { PRESET_IDS, PRODUCT_CARD_PRESETS, PRODUCT_COMMERCE_RECIPES, type PresetId, type ProductCardParams } from '../source-product-card-presets';
import { SOURCE_DNA_ENUMS, SOURCE_PRODUCT_PAGE_STYLES, normalizeDna, dnaRuntimeConfig, type SourceDesignDna, type SourceProductPageStyle } from '../source-dna';
import { sanitizeProductAssurances, type ProductAssurance } from '../product-theme';
import { fillStructure } from './sketch-structure-fill';
import type { PageStructure } from './sketch-structure-draw';

/** The editable sketch a merchant shapes before any site is built (sketch-first YAPI, sub-project 1).
 * `repairSketch` is total: any input yields a usable sketch plus notes — the sketch loop never surfaces errors. */
export type SketchPalette = { paper: string; ink: string; accent: string; deep: string; pop: string };
export type SketchSize = 's' | 'm' | 'l' | 'xl';
/** Tint backgrounds are derived (role mixed softly into paper) so the model never invents pastel
 * hexes and contrast repair keeps working on concrete colors. */
export type SketchBg = keyof SketchPalette | 'tint-accent' | 'tint-deep' | 'tint-pop';
export type SketchAlign = 'start' | 'center' | 'end';
export type NewsletterForm = 'pill' | 'stacked' | 'underline' | 'card';
export const NEWSLETTER_FORMS: readonly NewsletterForm[] = ['pill', 'stacked', 'underline', 'card'];
/** A band's horizontal shape. `bleed` is the historical behaviour (edge to edge) and stays the default, so
 * sketches that predate this field render unchanged; the others contain the section's content without ever
 * narrowing its background. */
export type SketchWidth = 'bleed' | 'wide' | 'narrow' | 'offset-left' | 'offset-right';
export const SKETCH_WIDTHS: readonly SketchWidth[] = ['bleed', 'wide', 'narrow', 'offset-left', 'offset-right'];
/** Editor-wide layout controls every block may carry: copy alignment, mirrored photo side, swapped buttons,
 * band width, copy-column element order and per-group layout (spec 2026-10-03-boceto-structure-and-icons-design;
 * width added by spec 2026-10-04-yapi-composition-and-width-design). */
export type SketchLayout = { composition?: string; imageFit?: 'cover' | 'contain'; focalPoint?: { x: number; y: number }; productRefs?: string[]; align?: SketchAlign; flip?: boolean; swap?: boolean; width?: SketchWidth; order?: string[]; layout?: Record<string, SketchGroupLayout>; free?: Record<string, SketchFreePos>; extras?: SketchExtra[] };
export type StickerPos = { x: number; y: number };
export type SketchBlock = (
  | { id: string; type: 'hero'; variant: 'photo-right' | 'full-bleed' | 'stacked'; headline: string; sub: string; cta: string; cta2: string; trust: string; badge: string; note: string; sticker: string; caption: string; photo?: string; photos?: string[]; align?: SketchAlign; stickerPos?: StickerPos; order?: string[]; bg: SketchBg; size: SketchSize }
  | { id: string; type: 'announce'; left: string; right: string; bg: SketchBg; size: SketchSize }
  | { id: string; type: 'split'; kicker: string; headline: string; body: string; cta: string; cta2: string; href: string; pills: string[]; stats: Array<{ value: string; label: string }>; boxes: Array<{ title: string; text: string; icon?: string }>; sticker: string; tag: string; photo?: string; align?: SketchAlign; stickerPos?: StickerPos; order?: string[]; bg: SketchBg; size: SketchSize }
  | { id: string; type: 'marquee'; text: string; glyph: string; bg: SketchBg; size: SketchSize }
  | { id: string; type: 'catalog'; kicker: string; title: string; seeAll: string; badges: string[]; stripLeft: string; stripRight: string; cardRatio: '4-3' | '1-1' | '3-4'; cardDesc: boolean; cardAdd: boolean; bg: SketchBg; size: SketchSize }
  | { id: string; type: 'steps'; kicker: string; title: string; note: string; items: Array<{ icon: string; title: string; text: string }>; bg: SketchBg; size: SketchSize }
  | { id: string; type: 'story'; kicker: string; title: string; paragraphs: string[]; photo?: string; bg: SketchBg; size: SketchSize }
  | { id: string; type: 'reviews'; kicker: string; title: string; ratingValue: string; ratingSource: string; handle: string; quotes: Array<{ text: string; name: string; place: string }>; photos: string[]; bg: SketchBg; size: SketchSize }
  | { id: string; type: 'collections'; kicker: string; title: string; note: string; items: Array<{ title: string; text: string; photo?: string; href?: string }>; bg: SketchBg; size: SketchSize }
  | { id: string; type: 'faq'; kicker: string; title: string; items: Array<{ q: string; a: string }>; bg: SketchBg; size: SketchSize }
  | { id: string; type: 'banner'; kicker: string; headline: string; cta: string; href: string; sticker: string; stickerPos?: StickerPos; bg: SketchBg; size: SketchSize }
  | { id: string; type: 'gallery'; kicker: string; title: string; photos: string[]; bg: SketchBg; size: SketchSize }
  | { id: string; type: 'newsletter'; kicker: string; variant: 'center' | 'split'; form: NewsletterForm; title: string; note: string; cta: string; photo?: string; bg: SketchBg; size: SketchSize }
  | { id: string; type: 'footer'; tagline: string; wordmark: 'giant' | 'plain'; bg: SketchBg; size: SketchSize }
) & SketchLayout;
/** Whole-page styling drawn at random per generation (never by the model), so two stores differ in
 * shape — corners, buttons, cards, header and footer — not only in copy and color. */
export type SketchStyle = {
  radius: 'soft' | 'round' | 'square';
  buttons: 'pill' | 'square' | 'outline' | 'ghost' | 'underline' | 'hard-shadow';
  cards: 'bleed' | 'inset' | 'outline';
  header: 'left' | 'center';
  footer: 'columns' | 'center';
  /** Whether the primary call to action carries an icon, and which. */
  buttonIcon: 'none' | 'arrow' | 'bag' | 'plus';
  /** How an icon is framed wherever one appears (steps, boxes, assurances). */
  icons: 'bare' | 'circle' | 'square' | 'tinted';
  /** What sits between two bands. */
  dividers: 'none' | 'hairline' | 'rule' | 'notch';
  /** Catalogue badges ("NUEVO", "FAVORITO"). */
  badges: 'pill' | 'square' | 'tag';
  /** Newsletter and contact inputs. */
  fields: 'underline' | 'box' | 'pill';
  /** Inline text links. */
  links: 'plain' | 'underline' | 'arrow';
};
/** The single source of the vocabulary: the model's JSON schema, the repair, the random direction and the Boceto
 * panel all walk this, so a key added here reaches all of them. The Studio keeps its own copy of the control list. */
export const SKETCH_STYLE_OPTIONS: { [K in keyof SketchStyle]: readonly SketchStyle[K][] } = {
  radius: ['soft', 'round', 'square'],
  buttons: ['pill', 'square', 'outline', 'ghost', 'underline', 'hard-shadow'],
  cards: ['bleed', 'inset', 'outline'],
  header: ['left', 'center'],
  footer: ['columns', 'center'],
  buttonIcon: ['none', 'arrow', 'bag', 'plus'],
  icons: ['bare', 'circle', 'square', 'tinted'],
  dividers: ['none', 'hairline', 'rule', 'notch'],
  badges: ['pill', 'square', 'tag'],
  fields: ['underline', 'box', 'pill'],
  links: ['plain', 'underline', 'arrow'],
};
/** The plain choice for every key, so a sketch saved before a key existed renders as it always did. */
export const DEFAULT_SKETCH_STYLE: SketchStyle = {
  radius: 'round', buttons: 'pill', cards: 'bleed', header: 'left', footer: 'columns',
  buttonIcon: 'none', icons: 'bare', dividers: 'none', badges: 'pill', fields: 'underline', links: 'plain',
};
/** The product page's skin and composition (themed-card program): the model picks preset, layout and
 * photo side by what the store sells; the Boceto panel may override single dimensions. Missing on old
 * sketches → plain, today's page. layout is the kit's structural composition (story-led puts the text
 * under the photo); media mirrors the desktop ficha. */
export type SketchProduct = { preset: PresetId; layout: SourceProductPageStyle; assurances: ProductAssurance[] } & ProductCardParams;
/** The shopper login and sign-up pages. The sketch designs everything around the form; the form itself is drawn by
 * the trusted platform frame over the kit's account gate, so no credential input ever lives in store code. */
export type SketchAccount = { id: 'account'; type: 'account'; layout: 'split' | 'center'; kicker: string; title: string; lead: string; perks: Array<{ icon: string; text: string }>; photo?: string; bg: SketchBg };
export type StoreSketch = { dna?: SourceDesignDna; design?: WebsiteDesignSpec; palette: SketchPalette; fonts: { display: string; text: string }; scale: SketchSize; style: SketchStyle; product: SketchProduct; account: SketchAccount; structure?: PageStructure; blocks: SketchBlock[] };
export type SketchContext = { storeName: string; purpose: 'shop' | 'service'; photos: string[] };

export const SKETCH_BLOCK_TYPES = ['announce', 'hero', 'split', 'steps', 'marquee', 'catalog', 'collections', 'story', 'reviews', 'faq', 'banner', 'gallery', 'newsletter', 'footer'] as const satisfies ReadonlyArray<SketchBlock['type']>;

/** The draggable copy-column elements of a block, in default order. The Boceto editor reorders
 * within this allowlist; the renderer emits children in `block.order` when present. */
export const SKETCH_EL_ORDER: Partial<Record<SketchBlock['type'], readonly string[]>> = SKETCH_COPY_ORDER;
export const MARQUEE_GLYPHS = ['·', '✦', '•', '◆', '★'] as const;

const DEFAULT_PALETTE: SketchPalette = { paper: '#f6ecd9', ink: '#1f2a24', accent: '#e35336', deep: '#1e3a2f', pop: '#f2c94c' };
const DEFAULT_FONTS = { display: 'fraunces', text: 'epilogue' };
const SIZES: readonly SketchSize[] = ['s', 'm', 'l', 'xl'];
const ROLES: readonly (keyof SketchPalette)[] = ['paper', 'ink', 'accent', 'deep', 'pop'];
const BLOCK_BGS: readonly SketchBg[] = [...ROLES, 'tint-accent', 'tint-deep', 'tint-pop'];
const LIMITS = { headline: 120, short: 200, paragraph: 600, list: 6, galleryPhotos: 6 };
/** Kickers get their ✦ from CSS; a glyph the model typed itself would double it. */
/** Where a block button may lead: in-store pages and anchors only. */
const BLOCK_HREF = /^(#|index\.html|productos\.html|checkout\.html|galeria\.html)/;
const kickerText = (value: unknown) => (typeof value === 'string' ? value : '').replace(/^[\s✦✧★☆•·◆◇*✶✳︎-]+/u, '').slice(0, 80);

/** Per-channel mix of two hex colors: `weight` of `a` into `1-weight` of `b` (CSS color-mix equivalent). */
export const mixHex = (a: string, b: string, weight: number) => {
  const na = parseInt(a.slice(1), 16), nb = parseInt(b.slice(1), 16);
  const channel = (shift: number) => Math.round(((na >> shift) & 255) * weight + ((nb >> shift) & 255) * (1 - weight));
  return '#' + [16, 8, 0].map(shift => channel(shift).toString(16).padStart(2, '0')).join('');
};
/** A block background to a concrete hex: palette roles directly, tints as 16% of the role into paper. */
export const resolveBg = (palette: SketchPalette, bg: SketchBg): string =>
  bg === 'tint-accent' || bg === 'tint-deep' || bg === 'tint-pop' ? mixHex(palette[bg.slice(5) as 'accent' | 'deep' | 'pop'], palette.paper, 0.16) : palette[bg];

const hex = (value: unknown): string | null => {
  const raw = String(value ?? '').trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(raw)) return raw;
  if (/^#[0-9a-f]{3}$/.test(raw)) return '#' + [...raw.slice(1)].map(c => c + c).join('');
  return null;
};
/** WCAG 2.x relative luminance and contrast ratio. */
export const relativeLuminance = (color: string) => {
  const n = parseInt(color.slice(1), 16);
  const channel = (value: number) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(n >> 16) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
};
export const contrastRatio = (a: string, b: string) => {
  const [low, high] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => x - y);
  return (high + 0.05) / (low + 0.05);
};
/** The highest-contrast readable ink for a background: the preferred ink when it reads, else near-black or white. */
export const bestInkFor = (bg: string, preferred: string) => {
  const candidates = [preferred, '#111111', '#ffffff'];
  const readable = candidates.filter(ink => contrastRatio(bg, ink) >= 4.5);
  if (readable.length) return readable[0];
  return candidates.slice(1).sort((a, b) => contrastRatio(bg, b) - contrastRatio(bg, a))[0];
};
const text = (value: unknown, limit: number, fallback = '') => {
  const raw = typeof value === 'string' ? value : value == null ? fallback : String(value);
  return raw.slice(0, limit);
};
/** Which input index each kept item came from, so free spots (keyed by index) follow their item when repair drops some. */
const listSources = new WeakMap<unknown[], number[]>();
const list = <T>(value: unknown, limit: number, map: (item: unknown) => T | null): T[] => {
  const mapped = (Array.isArray(value) ? value : []).map((item, index) => ({ item: map(item), index })).filter((entry): entry is { item: T; index: number } => entry.item !== null).slice(0, limit);
  const kept = mapped.map(entry => entry.item);
  listSources.set(kept, mapped.map(entry => entry.index));
  return kept;
};

/** The array fields free spots name by index (`items/2`, `copy/pills/0`), with the node path of their group. */
const listGroups = (type: string) => sketchGroups(type).flatMap(group => (group.reorder.kind === 'array' ? [{ field: group.reorder.field, path: group.parent ? `${group.parent}/${group.key}` : group.key }] : []));

/** Free spots of list items that repair dropped go with them; the rest move to their item's new index. */
function followRepairedLists(kept: Record<string, unknown>, raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return raw;
  let free = raw as Record<string, unknown>;
  for (const { field, path } of listGroups(String(kept.type))) {
    const from = Array.isArray(kept[field]) ? listSources.get(kept[field] as unknown[]) : undefined;
    if (from) free = sketchRemapFree(free, path, index => { const to = from.indexOf(index); return to === -1 ? null : to; });
  }
  return free;
}

/** Where each item of a list went in a chat edit: the same item, else the same title (an edited item), else — when the
 * list kept its length — the same place. An item with no match is gone, so its spot goes too instead of landing on
 * the item that slid into its place. */
function matchItems(before: unknown[], after: unknown[]): (index: number) => number | null {
  const to = new Map<number, number>(), taken = new Set<number>();
  const title = (item: unknown) => {
    if (typeof item === 'string') return item.trim();
    const entry = (typeof item === 'object' && item !== null ? item : {}) as Record<string, unknown>;
    const value = entry.title ?? entry.q ?? entry.text ?? entry.value;
    return typeof value === 'string' ? value.trim() : '';
  };
  const pass = (key: (item: unknown) => string) => before.forEach((item, i) => {
    const wanted = key(item);
    if (to.has(i) || !wanted) return;
    const j = after.findIndex((other, n) => !taken.has(n) && key(other) === wanted);
    if (j !== -1) { to.set(i, j); taken.add(j); }
  });
  pass(item => JSON.stringify(item));
  pass(title);
  if (before.length === after.length) before.forEach((_, i) => { if (!to.has(i) && !taken.has(i)) { to.set(i, i); taken.add(i); } });
  return index => to.get(index) ?? null;
}

/** Generation-time photo placement, magazine-style: unplaced photos fill the page's real photo slots
 * first — hero, split, story and newsletter panels, collection cards, then a customer strip under the
 * reviews — and only what is left goes into a short gallery strip (never a wall of photos). */
export function ensureAllPhotosUsed(sketch: StoreSketch, ctx: SketchContext): StoreSketch {
  if (!ctx.photos.length) return sketch;
  const used = new Set<string>();
  for (const block of sketch.blocks) {
    if ('photo' in block && block.photo) used.add(block.photo);
    if (block.type === 'gallery' || block.type === 'reviews') for (const photo of block.photos) used.add(photo);
    if (block.type === 'collections') for (const item of block.items) if (item.photo) used.add(item.photo);
  }
  const missing = ctx.photos.filter(photo => !used.has(photo));
  const heroPhoto = (sketch.blocks.find(block => block.type === 'hero' && block.photo) as { photo?: string } | undefined)?.photo;
  if (!missing.length) return sketch.account.photo ? sketch : { ...sketch, account: { ...sketch.account, photo: heroPhoto ?? ctx.photos[0] } };
  const blocks = sketch.blocks.map(block => ({ ...block })) as SketchBlock[];
  const account = sketch.account.photo ? sketch.account : { ...sketch.account, photo: missing.length > 3 ? missing.pop() : heroPhoto ?? ctx.photos[0] };
  // A drawn structure is authoritative: its `media` flags are the page's photo plan, so a leftover photo only
  // goes where the draw said a photo belongs, never into a reviews strip or an unplanned gallery, and a photo with
  // no planned home is simply unused. Without a structure (chat edits, old sketches) the magazine placement below
  // is unchanged. The ids are read off the slots, not off the blocks, because that is what the draw promised.
  const planned = Array.isArray(sketch.structure?.slots) ? new Map(sketch.structure.slots.map(slot => [slot.id, slot.media === true])) : undefined;
  const mediaOk = (block: SketchBlock) => !planned || planned.get(block.id) === true;
  for (const block of blocks) {
    if (!missing.length) break;
    if (!mediaOk(block)) continue;
    if ((block.type === 'hero' || block.type === 'split' || block.type === 'story') && !block.photo) block.photo = missing.shift();
    else if (block.type === 'newsletter' && !block.photo) { block.photo = missing.shift(); block.variant = 'split'; }
    else if (block.type === 'collections') block.items = block.items.map(item => (item.photo || !missing.length ? item : { ...item, photo: missing.shift() }));
  }
  const reviews = planned ? undefined : blocks.find(block => block.type === 'reviews') as Extract<SketchBlock, { type: 'reviews' }> | undefined;
  if (reviews && missing.length && reviews.photos.length < 3) reviews.photos = [...reviews.photos, ...missing.splice(0, 3 - reviews.photos.length)];
  if (missing.length) {
    const gallery = blocks.find(block => block.type === 'gallery') as Extract<SketchBlock, { type: 'gallery' }> | undefined;
    if (gallery) { if (mediaOk(gallery)) gallery.photos = [...gallery.photos, ...missing].slice(0, LIMITS.galleryPhotos); }
    else if (!planned) {
      const footerIndex = blocks.findIndex(block => block.type === 'footer');
      const ids = new Set(blocks.map(block => block.id));
      let next = 1; while (ids.has(`b${next}`)) next++;
      blocks.splice(footerIndex === -1 ? blocks.length : footerIndex, 0, { id: `b${next}`, type: 'gallery', kicker: '', title: 'Galería', photos: missing.slice(0, LIMITS.galleryPhotos), bg: 'paper', size: 'm' });
    }
  }
  return { ...sketch, account, blocks };
}

/** Generation-time rhythm pass: two adjacent body sections with the same background flatten the
 * page, so the second one rotates to a tint. Strips (announce/marquee) read as dividers and are
 * exempt, and the footer is never touched. NOT applied on Boceto hand-edits — a merchant who wants
 * two equal bands side by side gets them. */
export function ensureBandRhythm(sketch: StoreSketch): StoreSketch {
  const TINT_CYCLE: SketchBg[] = ['tint-accent', 'tint-pop', 'tint-deep'];
  const blocks = sketch.blocks.map(block => ({ ...block }));
  for (let i = 1; i < blocks.length; i++) {
    const prev = blocks[i - 1], current = blocks[i];
    if (current.type === 'footer' || current.bg !== prev.bg) continue;
    if (current.type === 'announce' || current.type === 'marquee' || prev.type === 'announce' || prev.type === 'marquee') continue;
    const next = blocks[i + 1];
    current.bg = TINT_CYCLE.find(tint => tint !== prev.bg && tint !== next?.bg) ?? 'tint-pop';
  }
  return { ...sketch, blocks };
}

/** A copy column's element order: known keys only, no repeats, and `undefined` when the result is just the default
 * order (so a block that was never reordered stores nothing). Shared with the composition pass. */
export function repairSketchOrder(value: unknown, allowed: readonly string[] | undefined): string[] | undefined {
  if (!allowed || !Array.isArray(value)) return undefined;
  const kept = [...new Set(value.filter((item): item is string => typeof item === 'string' && allowed.includes(item)))];
  const full = [...kept, ...allowed.filter(key => !kept.includes(key))];
  return full.every((key, index) => key === allowed[index]) ? undefined : full;
}

/** Inserted elements (free layer): known kinds with a valid value and position, unique ids, at most 12.
 * Shared with the composition pass, which is why `ctx` is a parameter rather than a closed-over argument. */
export function repairSketchExtras(value: unknown, ctx: SketchContext): SketchExtra[] {
  const wanted: Array<{ id: unknown; extra: Omit<SketchExtra, 'id'> }> = [];
  for (const item of Array.isArray(value) ? value : []) {
    if (wanted.length >= SKETCH_EXTRA_MAX) break;
    const raw = (typeof item === 'object' && item !== null ? item : {}) as Record<string, unknown>;
    const pos = sketchFreePos(raw);
    const kind = raw.kind as SketchExtraKind;
    if (!pos || !SKETCH_EXTRA_KINDS.includes(kind)) continue;
    const given = typeof raw.value === 'string' ? raw.value.trim() : '';
    const content = kind === 'emoji' ? (given.length <= 16 && /\p{Extended_Pictographic}/u.test(given) ? given : '')
      : kind === 'text' ? given.slice(0, 120)
      : kind === 'button' ? given.slice(0, 40)
      : kind === 'photo' ? (ctx.photos.includes(given) ? given : '')
      : /^[a-z0-9-]{2,40}$/.test(given) ? given : '';
    if (!content) continue;
    const href = kind === 'button' ? (typeof raw.href === 'string' && (BLOCK_HREF.test(raw.href) || /^https:\/\/wa\.me\/\d{6,15}$/.test(raw.href)) ? raw.href : 'checkout.html') : undefined;
    wanted.push({ id: raw.id, extra: { kind, value: content, ...pos, ...(href ? { href } : {}) } });
  }
  // Valid ids are kept (first come first served); the rest get fresh ones that never collide with a kept id.
  const valid = (id: unknown): id is string => typeof id === 'string' && /^e[a-z0-9]{3,10}$/.test(id);
  const reserved = new Set(wanted.map(entry => entry.id).filter(valid));
  const used = new Set<string>();
  let fresh = 1;
  return wanted.map(({ id, extra }) => {
    let kept = valid(id) && !used.has(id) ? id : '';
    while (!kept) { const candidate = `ex${String(fresh++).padStart(2, '0')}`; if (!reserved.has(candidate) && !used.has(candidate)) kept = candidate; }
    used.add(kept);
    return { id: kept, ...extra };
  });
}

export function repairSketch(input: unknown, ctx: SketchContext, defaults?: { style?: SketchStyle; structure?: PageStructure }): { sketch: StoreSketch; notes: string[] } {
  const notes: string[] = [];
  const raw = (typeof input === 'object' && input !== null ? input : (input !== undefined && notes.push('input no era un objeto; se usó el boceto base'), {})) as Record<string, unknown>;

  // Palette: normalize role by role; broken values fall to defaults.
  const rawPalette = (typeof raw.palette === 'object' && raw.palette !== null ? raw.palette : {}) as Record<string, unknown>;
  const palette = { ...DEFAULT_PALETTE };
  for (const role of ROLES) {
    const value = hex(rawPalette[role]);
    if (value) palette[role] = value;
    else if (rawPalette[role] !== undefined) notes.push(`color ${role} inválido; se usó el color base`);
  }
  // Readability: ink must reach WCAG AA contrast against paper.
  if (contrastRatio(palette.paper, palette.ink) < 4.5) {
    palette.ink = bestInkFor(palette.paper, palette.ink);
    notes.push('tinta ilegible sobre el fondo; se ajustó');
  }

  // Fonts: catalog ids only.
  const rawFonts = (typeof raw.fonts === 'object' && raw.fonts !== null ? raw.fonts : {}) as Record<string, unknown>;
  const font = (value: unknown, fallback: string) => {
    if (typeof value === 'string' && (SOURCE_FONT_IDS as readonly string[]).includes(value)) return value;
    if (value !== undefined) notes.push(`fuente desconocida (${String(value).slice(0, 40)}); se usó ${fallback}`);
    return fallback;
  };
  const fonts = { display: font(rawFonts.display, DEFAULT_FONTS.display), text: font(rawFonts.text, DEFAULT_FONTS.text) };

  const scale: SketchSize = SIZES.includes(raw.scale as SketchSize) ? (raw.scale as SketchSize) : 'm';
  const rawStyle = (typeof raw.style === 'object' && raw.style !== null ? raw.style : {}) as Record<string, unknown>;
  // Each dimension the model left on 'auto' (or got wrong) comes from the caller's defaults: the drawn direction on a
  // fresh generation, the current sketch on an edit. 'auto' needs no special case — it is not a member of the options.
  const styleBase = defaults?.style ?? DEFAULT_SKETCH_STYLE;
  const style = Object.fromEntries((Object.keys(SKETCH_STYLE_OPTIONS) as (keyof SketchStyle)[]).map(key => {
    const value = rawStyle[key] as string;
    // `?? DEFAULT` because an edit passes the current sketch's style, which may predate the newest keys.
    return [key, (SKETCH_STYLE_OPTIONS[key] as readonly string[]).includes(value) ? value : styleBase[key] ?? DEFAULT_SKETCH_STYLE[key]];
  })) as SketchStyle;
  // Product skin: unknown presets fall to plain (today's page); each dimension starts from the
  // preset and keeps a valid stored override, so a panel tweak survives re-repair.
  const rawProduct = (typeof raw.product === 'object' && raw.product !== null ? raw.product : {}) as Record<string, unknown>;
  const preset: PresetId = PRESET_IDS.includes(rawProduct.preset as PresetId) ? (rawProduct.preset as PresetId) : 'plain';
  if (rawProduct.preset !== undefined && preset !== rawProduct.preset) notes.push(`estilo de ficha desconocido (${String(rawProduct.preset).slice(0, 40)}); se usó el sencillo`);
  const product: SketchProduct = {
    preset,
    // The composition defaults to the preset's commerce recipe, so sectors differ structurally too.
    layout: SOURCE_PRODUCT_PAGE_STYLES.includes(rawProduct.layout as SourceProductPageStyle) ? (rawProduct.layout as SourceProductPageStyle) : PRODUCT_COMMERCE_RECIPES[preset].surfaces.product,
    // Merchant/YAPI assurance lines for the ficha: honest, capped, platform claims dropped.
    assurances: (() => { const result = sanitizeProductAssurances(rawProduct.assurances); notes.push(...result.notes); return result.items; })(),
    ...PRODUCT_CARD_PRESETS[preset].params,
  };
  for (const key of Object.keys(SOURCE_DNA_ENUMS.productCard) as (keyof ProductCardParams)[]) {
    const value = rawProduct[key];
    if ((SOURCE_DNA_ENUMS.productCard[key] as readonly string[]).includes(value as string)) (product as unknown as Record<string, string>)[key] = value as string;
  }
  const size = (value: unknown): SketchSize => (SIZES.includes(value as SketchSize) ? (value as SketchSize) : 'm');
  const bg = (value: unknown, fallback: SketchBg): SketchBg => (BLOCK_BGS.includes(value as SketchBg) ? (value as SketchBg) : fallback);
  const photo = (value: unknown): string | undefined => {
    if (typeof value !== 'string' || !value) return undefined;
    if (ctx.photos.includes(value)) return value;
    notes.push(`foto inexistente (${value.slice(0, 60)}); se quitó`);
    return undefined;
  };
  // Editor-only fields: element order (allowlisted, deduped, omitted when it equals the default),
  // sticker position (percentages clamped inside the section) and copy alignment.
  const order = repairSketchOrder;
  const stickerPos = (value: unknown): StickerPos | undefined => {
    if (typeof value !== 'object' || value === null) return undefined;
    const { x, y } = value as Record<string, unknown>;
    if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) return undefined;
    return { x: Math.min(100, Math.max(0, Math.round(x * 10) / 10)), y: Math.min(100, Math.max(0, Math.round(y * 10) / 10)) };
  };
  const align = (value: unknown): SketchAlign | undefined => (value === 'center' || value === 'start' || value === 'end' ? value : undefined);
  const extras = (value: unknown): SketchExtra[] => repairSketchExtras(value, ctx);

  // Blocks: keep known types, repair each field, drop the rest. Ids that are valid and unique are
  // preserved so Studio selections and chat chips survive reorders; the rest get fresh ones.
  const blocks: SketchBlock[] = [];
  const keptIds = new Set<string>();
  const rawId = (value: unknown) => {
    if (typeof value === 'string' && /^[a-z0-9-]{1,32}$/.test(value) && !keptIds.has(value)) { keptIds.add(value); return value; }
    return '';
  };
  for (const item of Array.isArray(raw.blocks) ? raw.blocks : []) {
    const block = (typeof item === 'object' && item !== null ? item : {}) as Record<string, unknown>;
    const pushedBefore = blocks.length;
    const type = block.type as SketchBlock['type'];
    const base = { id: rawId(block.id), bg: bg(block.bg, 'paper'), size: size(block.size) };
    switch (type) {
      case 'hero': {
        const heroPhoto = photo(block.photo);
        const heroOrder = order(block.order, SKETCH_EL_ORDER.hero);
        const heroSticker = stickerPos(block.stickerPos);
        const heroAlign = align(block.align);
        const seenPhotos = new Set(heroPhoto ? [heroPhoto] : []);
        const heroPhotos = Array.isArray(block.photos) ? list(block.photos, 4, value => {
          const path = photo(value);
          if (!path || seenPhotos.has(path)) return null;
          seenPhotos.add(path);
          return path;
        }) : undefined;
        blocks.push({ ...base, type, variant: ['photo-right', 'full-bleed', 'stacked'].includes(block.variant as string) ? (block.variant as 'photo-right') : 'photo-right', headline: text(block.headline, LIMITS.headline, ctx.storeName), sub: text(block.sub, LIMITS.short), cta: text(block.cta, 60, 'Ver productos'), cta2: text(block.cta2, 60), trust: text(block.trust, 120), badge: text(block.badge, 60), note: text(block.note, 120), sticker: text(block.sticker, 40), caption: text(block.caption, 80), ...(heroPhoto ? { photo: heroPhoto } : {}), ...(heroPhotos ? { photos: heroPhotos } : {}), ...(heroOrder ? { order: heroOrder } : {}), ...(heroSticker ? { stickerPos: heroSticker } : {}), ...(heroAlign ? { align: heroAlign } : {}) });
        break;
      }
      case 'announce': blocks.push({ ...base, type, left: text(block.left, LIMITS.short), right: text(block.right, LIMITS.short) }); break;
      case 'split': {
        const splitPhoto = photo(block.photo);
        const splitOrder = order(block.order, SKETCH_EL_ORDER.split);
        const splitSticker = stickerPos(block.stickerPos);
        const splitAlign = align(block.align);
        blocks.push({ ...base, type, bg: bg(block.bg, 'accent'), kicker: kickerText(block.kicker), headline: text(block.headline, LIMITS.headline, ctx.storeName), body: text(block.body, LIMITS.paragraph), cta: text(block.cta, 60, 'Ver más'), cta2: text(block.cta2, 60), href: typeof block.href === 'string' && BLOCK_HREF.test(block.href) ? block.href : 'checkout.html', pills: list(block.pills, LIMITS.list, p => (p == null ? null : text(p, 60))), stats: list(block.stats, 4, s => { const stat = (typeof s === 'object' && s !== null ? s : {}) as Record<string, unknown>; const value = text(stat.value, 20); return value ? { value, label: text(stat.label, 40) } : null; }), boxes: list(block.boxes, 3, b => { const box = (typeof b === 'object' && b !== null ? b : {}) as Record<string, unknown>; const title = text(box.title, 40); const icon = typeof box.icon === 'string' && /^[a-z0-9-]{2,40}$/.test(box.icon) ? box.icon : ''; return title ? { title, text: text(box.text, 80), ...(icon ? { icon } : {}) } : null; }), sticker: text(block.sticker, 40), tag: text(block.tag, 60), ...(splitPhoto ? { photo: splitPhoto } : {}), ...(splitOrder ? { order: splitOrder } : {}), ...(splitSticker ? { stickerPos: splitSticker } : {}), ...(splitAlign ? { align: splitAlign } : {}) });
        break;
      }
      case 'marquee': blocks.push({ ...base, type, text: text(block.text, LIMITS.short, ctx.storeName), glyph: MARQUEE_GLYPHS.includes(block.glyph as (typeof MARQUEE_GLYPHS)[number]) ? (block.glyph as string) : '·' }); break;
      case 'catalog': blocks.push({ ...base, type, kicker: kickerText(block.kicker), title: text(block.title, LIMITS.headline, 'Nuestros productos'), seeAll: text(block.seeAll, 60), badges: list(block.badges, 3, b => (b == null ? null : text(b, 24).replace(/["\\\n\r]/g, '').trim() || null)), stripLeft: text(block.stripLeft, LIMITS.short), stripRight: text(block.stripRight, LIMITS.short), cardRatio: ['4-3', '1-1', '3-4'].includes(block.cardRatio as string) ? (block.cardRatio as '4-3') : '4-3', cardDesc: block.cardDesc !== false, cardAdd: block.cardAdd !== false }); break;
      case 'collections': blocks.push({ ...base, type, kicker: kickerText(block.kicker), title: text(block.title, LIMITS.headline, 'Colecciones'), note: text(block.note, 160), items: list(block.items, 4, i => { const entry = (typeof i === 'object' && i !== null ? i : {}) as Record<string, unknown>; const title = text(entry.title, 60); if (!title) return null; const itemPhoto = photo(entry.photo); const itemHref = typeof entry.href === 'string' && BLOCK_HREF.test(entry.href) ? entry.href : undefined; return { title, text: text(entry.text, LIMITS.short), ...(itemPhoto ? { photo: itemPhoto } : {}), ...(itemHref ? { href: itemHref } : {}) }; }) }); break;
      case 'steps': blocks.push({ ...base, type, kicker: kickerText(block.kicker), title: text(block.title, LIMITS.headline, 'Así de simple'), note: text(block.note, 160), items: list(block.items, 4, i => { const entry = (typeof i === 'object' && i !== null ? i : {}) as Record<string, unknown>; const title = text(entry.title, 60); if (!title) return null; return { icon: typeof entry.icon === 'string' && /^[a-z0-9-]{2,40}$/.test(entry.icon) ? entry.icon : 'sparkles', title, text: text(entry.text, LIMITS.short) }; }) }); break;
      case 'story': {
        const storyPhoto = photo(block.photo);
        blocks.push({ ...base, type, kicker: kickerText(block.kicker), title: text(block.title, LIMITS.headline, 'Nuestra historia'), paragraphs: list(block.paragraphs, LIMITS.list, p => (p == null ? null : text(p, LIMITS.paragraph))), ...(storyPhoto ? { photo: storyPhoto } : {}) });
        break;
      }
      case 'reviews': blocks.push({ ...base, type, kicker: kickerText(block.kicker), title: text(block.title, LIMITS.headline, 'Clientes felices'), ratingValue: text(block.ratingValue, 10), ratingSource: text(block.ratingSource, 60), handle: text(block.handle, 40), quotes: list(block.quotes, LIMITS.list, q => { const quote = (typeof q === 'object' && q !== null ? q : {}) as Record<string, unknown>; const body = text(quote.text, LIMITS.short); return body ? { text: body, name: text(quote.name, 60, 'Cliente'), place: text(quote.place, 40) } : null; }), photos: list(block.photos, 6, p => (typeof p === 'string' && ctx.photos.includes(p) ? p : null)) }); break;
      case 'faq': blocks.push({ ...base, type, kicker: kickerText(block.kicker), title: text(block.title, LIMITS.headline, 'Preguntas'), items: list(block.items, LIMITS.list, i => { const entry = (typeof i === 'object' && i !== null ? i : {}) as Record<string, unknown>; const q = text(entry.q, LIMITS.short); return q ? { q, a: text(entry.a, LIMITS.paragraph) } : null; }) }); break;
      case 'banner': {
        const bannerSticker = stickerPos(block.stickerPos);
        blocks.push({ ...base, type, kicker: kickerText(block.kicker), headline: text(block.headline, LIMITS.headline, ctx.storeName), cta: text(block.cta, 60, 'Comprar'), href: typeof block.href === 'string' && BLOCK_HREF.test(block.href) ? block.href : 'checkout.html', sticker: text(block.sticker, 40), ...(bannerSticker ? { stickerPos: bannerSticker } : {}) });
        break;
      }
      case 'gallery': blocks.push({ ...base, type, kicker: kickerText(block.kicker), title: text(block.title, LIMITS.headline, 'Galería'), photos: list(block.photos, LIMITS.galleryPhotos, p => (typeof p === 'string' && ctx.photos.includes(p) ? p : (p != null && notes.push(`foto inexistente (${String(p).slice(0, 60)}); se quitó`), null))) }); break;
      case 'newsletter': {
        const newsPhoto = photo(block.photo);
        blocks.push({ ...base, type, kicker: kickerText(block.kicker), variant: block.variant === 'split' ? 'split' : 'center', form: NEWSLETTER_FORMS.includes(block.form as NewsletterForm) ? (block.form as NewsletterForm) : 'pill', title: text(block.title, LIMITS.headline, 'Novedades'), note: text(block.note, LIMITS.short), cta: text(block.cta, 60, 'Ver la tienda'), ...(newsPhoto ? { photo: newsPhoto } : {}) });
        break;
      }
      case 'footer': blocks.push({ ...base, type, bg: bg(block.bg, 'deep'), tagline: text(block.tagline, LIMITS.short), wordmark: block.wordmark === 'plain' ? 'plain' : 'giant' }); break;
      default: notes.push(`bloque desconocido (${String(type).slice(0, 40)}); se quitó`);
    }
    // Shared layout controls: any kept block may carry alignment; photo blocks may mirror; button rows may swap.
    const kept = blocks.length > pushedBefore ? blocks[blocks.length - 1] : undefined;
    if (kept) {
      if (typeof block.composition === 'string' && sectionCompositions(kept.type).includes(block.composition)) kept.composition = block.composition;
      if (block.imageFit === 'cover' || block.imageFit === 'contain') kept.imageFit = block.imageFit;
      const focal = block.focalPoint as { x?: unknown; y?: unknown } | undefined;
      if (focal && typeof focal.x === 'number' && Number.isFinite(focal.x) && typeof focal.y === 'number' && Number.isFinite(focal.y)) kept.focalPoint = { x: Math.max(0, Math.min(100, focal.x)), y: Math.max(0, Math.min(100, focal.y)) };
      if (Array.isArray(block.productRefs)) kept.productRefs = block.productRefs.filter((id): id is string => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(id)).slice(0, 60);
      const blockAlign = align(block.align);
      if (blockAlign && blockAlign !== 'start') kept.align = blockAlign; else delete kept.align;
      if (block.flip === true && ['hero', 'split', 'story', 'newsletter'].includes(kept.type)) kept.flip = true;
      if (block.swap === true && ['hero', 'split'].includes(kept.type)) kept.swap = true;
      // Band width: `bleed` is the default, so it is stored as absence and old sketches stay byte-identical.
      const blockWidth = block.width as SketchWidth;
      if (SKETCH_WIDTHS.includes(blockWidth) && blockWidth !== 'bleed') kept.width = blockWidth; else delete kept.width;
      // Copy order for the blocks added by structured selection (hero and split repair theirs above) and group layout.
      const copyOrder = SKETCH_COPY_ORDER[kept.type];
      if (copyOrder && kept.type !== 'hero' && kept.type !== 'split') {
        const repairedOrder = order(block.order, copyOrder);
        if (repairedOrder) kept.order = repairedOrder; else delete kept.order;
      }
      const layout = repairSketchLayout(kept.type, block.layout);
      if (layout) kept.layout = layout; else delete kept.layout;
      // Free layer: inserted elements, then freed parts named against the repaired block (never nested).
      const inserted = extras(block.extras);
      if (inserted.length) kept.extras = inserted; else delete kept.extras;
      const free = repairSketchFree(kept, followRepairedLists(kept as Record<string, unknown>, block.free));
      if (free) kept.free = free; else delete kept.free;
    }
  }

  const structure = Array.isArray(defaults?.structure?.slots) ? defaults?.structure : undefined;
  // The drawn skeleton (spec 2026-10-04-page-grammar-and-real-copy). Enforced only when the caller passes a
  // structure, never because a sketch happens to carry one: a chat edit passes none, so a merchant's bands
  // are never taken from under them.
  if (structure) {
    const applied = fillStructure(blocks, structure, ctx);
    blocks.length = 0;
    blocks.push(...applied.blocks);
    notes.push(...applied.notes);
    for (const block of blocks) if (block.id) keptIds.add(block.id);
  }
  // Size: a page has at most 20 blocks; beyond that the generated file outgrows the source contract.
  if (blocks.length > 20) { blocks.length = 20; notes.push('demasiados bloques; se conservaron los primeros 20'); }
  // One catalog only: the commerce runtime reads a single product template and mount.
  const extraCatalogs = blocks.filter(block => block.type === 'catalog').slice(1);
  if (extraCatalogs.length) { notes.push('catálogo repetido; se conservó el primero'); for (const extra of extraCatalogs) blocks.splice(blocks.indexOf(extra), 1); }
  // Structure: a shop always sells and every page ends in a footer, exactly one, last.
  if (!blocks.length) blocks.push({ id: '', type: 'hero', variant: 'photo-right', headline: ctx.storeName, sub: '', cta: 'Ver productos', cta2: '', trust: '', badge: '', note: '', sticker: '', caption: '', bg: 'paper', size: 'm' });
  // A drawn structure without a catalog is a store with nothing to sell; adding one back would undo the draw.
  if (ctx.purpose === 'shop' && !structure && !blocks.some(b => b.type === 'catalog')) {
    blocks.splice(1, 0, { id: '', type: 'catalog', kicker: '', title: 'Nuestros productos', seeAll: '', badges: [], stripLeft: '', stripRight: '', cardRatio: '4-3', cardDesc: true, cardAdd: true, bg: 'paper', size: 'm' });
    notes.push('faltaba el catálogo; se añadió');
  }
  const footers = blocks.filter(b => b.type === 'footer');
  const footer = footers[0] ?? { id: '', type: 'footer' as const, tagline: '', wordmark: 'giant' as const, bg: 'deep' as const, size: 'm' as const };
  const body = blocks.filter(b => b.type !== 'footer');
  const ordered = [...body, footer];
  let next = 1;
  for (const block of ordered) {
    if (block.id) continue;
    while (keptIds.has(`b${next}`)) next++;
    block.id = `b${next++}`;
    keptIds.add(block.id);
  }
  // A collection card may lead somewhere of its own (spec: "llevame a otra parte del sitio"). Ids are final only
  // here, so the anchor check waits for them: an anchor naming no band on this page would land the shopper
  // nowhere, which is worse than the default destination, so it is dropped and the card falls back.
  const anchors = new Set(['#contenido', '#skb-catalogo', ...ordered.map(block => `#skb-${block.id}`)]);
  for (const block of ordered) {
    if (block.type !== 'collections') continue;
    for (const item of block.items) {
      if (!item.href || !item.href.startsWith('#') || anchors.has(item.href)) continue;
      notes.push(`«${item.title}» apuntaba a ${item.href}, que no existe en la página; se quitó el enlace`);
      delete item.href;
    }
  }

  const rawAccount = (typeof raw.account === 'object' && raw.account !== null ? raw.account : {}) as Record<string, unknown>;
  const accountPhoto = photo(rawAccount.photo);
  const perks = list(rawAccount.perks, 4, p => {
    const perk = (typeof p === 'object' && p !== null ? p : {}) as Record<string, unknown>;
    const perkText = text(perk.text, 60);
    return perkText ? { icon: typeof perk.icon === 'string' && /^[a-z0-9-]{2,40}$/.test(perk.icon) ? perk.icon : 'sparkles', text: perkText } : null;
  });
  const account: SketchAccount = {
    id: 'account', type: 'account',
    layout: rawAccount.layout === 'center' ? 'center' : 'split',
    kicker: kickerText(rawAccount.kicker) || 'TU CUENTA',
    title: text(rawAccount.title, LIMITS.headline) || `Bienvenido a ${ctx.storeName}`,
    lead: text(rawAccount.lead, LIMITS.short) || 'Sigue tus pedidos y compra más rápido la próxima vez.',
    perks: Array.isArray(rawAccount.perks) ? perks : [{ icon: 'package', text: 'Sigue tus pedidos' }, { icon: 'map-pin', text: 'Guarda tus direcciones' }, { icon: 'gift', text: 'Entérate primero de las ofertas' }],
    ...(accountPhoto ? { photo: accountPhoto } : {}),
    bg: bg(rawAccount.bg, 'tint-accent'),
  };

  const dna = raw.dna ? normalizeDna(raw.dna, String((raw.design as any)?.designSeed ?? ctx.storeName)).dna : undefined;
  if (dna) {
    dna.type.display = fonts.display as typeof dna.type.display;
    dna.type.text = fonts.text as typeof dna.type.text;
    // Advanced DNA forms retain their identity until the merchant changes the existing Botones control.
    if (SKETCH_STYLE_OPTIONS.buttons.includes(rawStyle.buttons as SketchStyle['buttons']) && style.buttons !== sketchButtonStyle(dna.buttons.form))
      dna.buttons.form = style.buttons === 'square' ? 'block' : style.buttons === 'hard-shadow' ? 'brutal' : style.buttons;
  }
  const sketch: StoreSketch = { ...(dna ? { dna } : {}), palette, fonts, scale, style, product, account, ...(structure ? { structure } : {}), blocks: ordered };
  const design = syncDesignSpec(raw.design, sketch, ctx);
  if (design) sketch.design = design;
  return { sketch, notes };
}

/** The kit button form that matches the sketch's Botones choice, so the platform's purchase
 * controls (buy button, cart, checkout) follow the Boceto instead of one fixed black pill. */
export function sketchButtonForm(style: SketchStyle): 'pill' | 'block' | 'outline' {
  return style.buttons === 'square' ? 'block' : style.buttons === 'outline' ? 'outline' : 'pill';
}

/** Existing editor aliases for canonical DNA forms; unsupported forms keep their DNA value. */
export function sketchButtonStyle(form: SourceDesignDna['buttons']['form']): SketchStyle['buttons'] {
  return form === 'block' ? 'square' : form === 'brutal' ? 'hard-shadow' : ['pill', 'outline', 'ghost', 'underline'].includes(form) ? form as SketchStyle['buttons'] : 'outline';
}

/** Everything the platform kit varies by DNA, derived from the sketch: catalog card behaviour (hover
 * photo swap, quick look…), cart and review formats and the motion personality come from the chosen
 * preset's commerce recipe; the button form follows the Botones control. Total for any input. */
export function sketchKitDna(sketch: Partial<StoreSketch>): Record<string, string> {
  const recipe = PRODUCT_COMMERCE_RECIPES[(sketch.product?.preset as PresetId) ?? 'plain'] ?? PRODUCT_COMMERCE_RECIPES.plain;
  return {
    ...(sketch.dna ? Object.fromEntries(Object.entries(dnaRuntimeConfig(sketch.dna)).filter(([key]) => key !== 'version')) as Record<string, string> : {}),
    button: sketch.dna?.buttons.form ?? sketchButtonForm({ ...DEFAULT_SKETCH_STYLE, ...(sketch.style ?? {}) }),
    card: sketch.dna?.surfaces.card ?? recipe.surfaces.card, cart: recipe.surfaces.cart, review: recipe.surfaces.review,
    motion: sketch.dna?.motion.personality ?? recipe.motion.personality, hover: sketch.dna?.buttons.hover ?? recipe.motion.hover, press: sketch.dna?.buttons.press ?? recipe.motion.press,
  };
}

/** The input `resolveProductTheme` expects for this sketch's skin: its preset plus every dimension
 * as an explicit override, so a panel-tweaked dimension survives the preset's own values. */
export function sketchProductTheme(product: SketchProduct): { preset: PresetId; params: ProductCardParams } {
  const { preset, layout: _layout, assurances: _assurances, ...params } = product;
  return { preset, params };
}

/** Editor-only block fields are absent from the model schema, so a chat edit reply resets them; carry them over by id. */
export const SKETCH_EDITOR_ONLY = ['align', 'flip', 'swap', 'order', 'stickerPos', 'layout', 'free', 'extras', 'composition', 'imageFit', 'focalPoint', 'productRefs'] as const;
export function carryEditorFields(current: StoreSketch, edited: StoreSketch): StoreSketch['blocks'] {
  return edited.blocks.map(block => {
    const before = current.blocks.find(item => item.id === block.id) as Record<string, unknown> | undefined;
    if (!before) return block;
    // Order, group layout and free spots name the parts of one block type; a block the model turned into another type
    // starts fresh there (inserted elements belong to the block, so they stay).
    const keys = before.type === block.type ? SKETCH_EDITOR_ONLY : SKETCH_EDITOR_ONLY.filter(key => !['order', 'layout', 'free', 'composition', 'productRefs'].includes(key));
    const carried: Record<string, unknown> = Object.fromEntries(keys.filter(key => before[key] !== undefined && (block as Record<string, unknown>)[key] === undefined).map(key => [key, before[key]]));
    // Spots on list items follow their item when the edit removed, added or reordered items.
    if (carried.free) {
      let free = carried.free as Record<string, SketchFreePos>;
      for (const { field, path } of listGroups(block.type)) {
        const was = before[field], now = (block as Record<string, unknown>)[field];
        if (Array.isArray(was) && Array.isArray(now)) free = sketchRemapFree(free, path, matchItems(was, now));
      }
      if (Object.keys(free).length) carried.free = free; else delete carried.free;
    }
    return { ...block, ...carried } as typeof block;
  });
}
