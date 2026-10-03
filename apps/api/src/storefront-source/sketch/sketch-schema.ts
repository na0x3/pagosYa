import { repairSketchLayout, SKETCH_COPY_ORDER, type SketchGroupLayout } from '@pagosya/shared-types';
import { SOURCE_FONT_IDS } from '../source-font-catalog';

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
/** Editor-wide layout controls every block may carry: copy alignment, mirrored photo side, swapped buttons,
 * copy-column element order and per-group layout (spec 2026-10-03-boceto-structure-and-icons-design). */
export type SketchLayout = { align?: SketchAlign; flip?: boolean; swap?: boolean; order?: string[]; layout?: Record<string, SketchGroupLayout> };
export type StickerPos = { x: number; y: number };
export type SketchBlock = (
  | { id: string; type: 'hero'; variant: 'photo-right' | 'full-bleed' | 'stacked'; headline: string; sub: string; cta: string; cta2: string; trust: string; badge: string; note: string; sticker: string; caption: string; photo?: string; align?: SketchAlign; stickerPos?: StickerPos; order?: string[]; bg: SketchBg; size: SketchSize }
  | { id: string; type: 'announce'; left: string; right: string; bg: SketchBg; size: SketchSize }
  | { id: string; type: 'split'; kicker: string; headline: string; body: string; cta: string; cta2: string; href: string; pills: string[]; stats: Array<{ value: string; label: string }>; boxes: Array<{ title: string; text: string; icon?: string }>; sticker: string; tag: string; photo?: string; align?: SketchAlign; stickerPos?: StickerPos; order?: string[]; bg: SketchBg; size: SketchSize }
  | { id: string; type: 'marquee'; text: string; glyph: string; bg: SketchBg; size: SketchSize }
  | { id: string; type: 'catalog'; kicker: string; title: string; seeAll: string; badges: string[]; stripLeft: string; stripRight: string; cardRatio: '4-3' | '1-1' | '3-4'; cardDesc: boolean; cardAdd: boolean; bg: SketchBg; size: SketchSize }
  | { id: string; type: 'steps'; kicker: string; title: string; note: string; items: Array<{ icon: string; title: string; text: string }>; bg: SketchBg; size: SketchSize }
  | { id: string; type: 'story'; kicker: string; title: string; paragraphs: string[]; photo?: string; bg: SketchBg; size: SketchSize }
  | { id: string; type: 'reviews'; kicker: string; title: string; ratingValue: string; ratingSource: string; handle: string; quotes: Array<{ text: string; name: string; place: string }>; photos: string[]; bg: SketchBg; size: SketchSize }
  | { id: string; type: 'collections'; kicker: string; title: string; note: string; items: Array<{ title: string; text: string; photo?: string }>; bg: SketchBg; size: SketchSize }
  | { id: string; type: 'faq'; kicker: string; title: string; items: Array<{ q: string; a: string }>; bg: SketchBg; size: SketchSize }
  | { id: string; type: 'banner'; kicker: string; headline: string; cta: string; href: string; sticker: string; stickerPos?: StickerPos; bg: SketchBg; size: SketchSize }
  | { id: string; type: 'gallery'; kicker: string; title: string; photos: string[]; bg: SketchBg; size: SketchSize }
  | { id: string; type: 'newsletter'; kicker: string; variant: 'center' | 'split'; form: NewsletterForm; title: string; note: string; cta: string; photo?: string; bg: SketchBg; size: SketchSize }
  | { id: string; type: 'footer'; tagline: string; wordmark: 'giant' | 'plain'; bg: SketchBg; size: SketchSize }
) & SketchLayout;
/** Whole-page styling drawn at random per generation (never by the model), so two stores differ in
 * shape — corners, buttons, cards, header and footer — not only in copy and color. */
export type SketchStyle = { radius: 'soft' | 'round' | 'square'; buttons: 'pill' | 'square' | 'outline'; cards: 'bleed' | 'inset' | 'outline'; header: 'left' | 'center'; footer: 'columns' | 'center' };
export const SKETCH_STYLE_OPTIONS: { [K in keyof SketchStyle]: readonly SketchStyle[K][] } = {
  radius: ['soft', 'round', 'square'],
  buttons: ['pill', 'square', 'outline'],
  cards: ['bleed', 'inset', 'outline'],
  header: ['left', 'center'],
  footer: ['columns', 'center'],
};
export const DEFAULT_SKETCH_STYLE: SketchStyle = { radius: 'round', buttons: 'pill', cards: 'bleed', header: 'left', footer: 'columns' };
/** The shopper login and sign-up pages. The sketch designs everything around the form; the form itself is drawn by
 * the trusted platform frame over the kit's account gate, so no credential input ever lives in store code. */
export type SketchAccount = { id: 'account'; type: 'account'; layout: 'split' | 'center'; kicker: string; title: string; lead: string; perks: Array<{ icon: string; text: string }>; photo?: string; bg: SketchBg };
export type StoreSketch = { palette: SketchPalette; fonts: { display: string; text: string }; scale: SketchSize; style: SketchStyle; account: SketchAccount; blocks: SketchBlock[] };
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
const list = <T>(value: unknown, limit: number, map: (item: unknown) => T | null): T[] =>
  (Array.isArray(value) ? value : []).map(map).filter((item): item is T => item !== null).slice(0, limit);

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
  for (const block of blocks) {
    if (!missing.length) break;
    if ((block.type === 'hero' || block.type === 'split' || block.type === 'story') && !block.photo) block.photo = missing.shift();
    else if (block.type === 'newsletter' && !block.photo) { block.photo = missing.shift(); block.variant = 'split'; }
    else if (block.type === 'collections') block.items = block.items.map(item => (item.photo || !missing.length ? item : { ...item, photo: missing.shift() }));
  }
  const reviews = blocks.find(block => block.type === 'reviews') as Extract<SketchBlock, { type: 'reviews' }> | undefined;
  if (reviews && missing.length && reviews.photos.length < 3) reviews.photos = [...reviews.photos, ...missing.splice(0, 3 - reviews.photos.length)];
  if (missing.length) {
    const gallery = blocks.find(block => block.type === 'gallery') as Extract<SketchBlock, { type: 'gallery' }> | undefined;
    if (gallery) gallery.photos = [...gallery.photos, ...missing].slice(0, LIMITS.galleryPhotos);
    else {
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

export function repairSketch(input: unknown, ctx: SketchContext): { sketch: StoreSketch; notes: string[] } {
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
  const style = Object.fromEntries((Object.keys(SKETCH_STYLE_OPTIONS) as (keyof SketchStyle)[]).map(key => {
    const value = rawStyle[key] as string;
    return [key, (SKETCH_STYLE_OPTIONS[key] as readonly string[]).includes(value) ? value : DEFAULT_SKETCH_STYLE[key]];
  })) as SketchStyle;
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
  const order = (value: unknown, allowed: readonly string[] | undefined): string[] | undefined => {
    if (!allowed || !Array.isArray(value)) return undefined;
    const kept = [...new Set(value.filter((item): item is string => typeof item === 'string' && allowed.includes(item)))];
    const full = [...kept, ...allowed.filter(key => !kept.includes(key))];
    return full.every((key, index) => key === allowed[index]) ? undefined : full;
  };
  const stickerPos = (value: unknown): StickerPos | undefined => {
    if (typeof value !== 'object' || value === null) return undefined;
    const { x, y } = value as Record<string, unknown>;
    if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) return undefined;
    return { x: Math.min(100, Math.max(0, Math.round(x * 10) / 10)), y: Math.min(100, Math.max(0, Math.round(y * 10) / 10)) };
  };
  const align = (value: unknown): SketchAlign | undefined => (value === 'center' || value === 'start' || value === 'end' ? value : undefined);

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
        blocks.push({ ...base, type, variant: ['photo-right', 'full-bleed', 'stacked'].includes(block.variant as string) ? (block.variant as 'photo-right') : 'photo-right', headline: text(block.headline, LIMITS.headline, ctx.storeName), sub: text(block.sub, LIMITS.short), cta: text(block.cta, 60, 'Ver productos'), cta2: text(block.cta2, 60), trust: text(block.trust, 120), badge: text(block.badge, 60), note: text(block.note, 120), sticker: text(block.sticker, 40), caption: text(block.caption, 80), ...(heroPhoto ? { photo: heroPhoto } : {}), ...(heroOrder ? { order: heroOrder } : {}), ...(heroSticker ? { stickerPos: heroSticker } : {}), ...(heroAlign ? { align: heroAlign } : {}) });
        break;
      }
      case 'announce': blocks.push({ ...base, type, left: text(block.left, LIMITS.short), right: text(block.right, LIMITS.short) }); break;
      case 'split': {
        const splitPhoto = photo(block.photo);
        const splitOrder = order(block.order, SKETCH_EL_ORDER.split);
        const splitSticker = stickerPos(block.stickerPos);
        const splitAlign = align(block.align);
        blocks.push({ ...base, type, bg: bg(block.bg, 'accent'), kicker: kickerText(block.kicker), headline: text(block.headline, LIMITS.headline, ctx.storeName), body: text(block.body, LIMITS.paragraph), cta: text(block.cta, 60, 'Ver más'), cta2: text(block.cta2, 60), href: typeof block.href === 'string' && /^(#|index\.html|productos\.html|checkout\.html|galeria\.html)/.test(block.href) ? block.href : 'checkout.html', pills: list(block.pills, LIMITS.list, p => (p == null ? null : text(p, 60))), stats: list(block.stats, 4, s => { const stat = (typeof s === 'object' && s !== null ? s : {}) as Record<string, unknown>; const value = text(stat.value, 20); return value ? { value, label: text(stat.label, 40) } : null; }), boxes: list(block.boxes, 3, b => { const box = (typeof b === 'object' && b !== null ? b : {}) as Record<string, unknown>; const title = text(box.title, 40); const icon = typeof box.icon === 'string' && /^[a-z0-9-]{2,40}$/.test(box.icon) ? box.icon : ''; return title ? { title, text: text(box.text, 80), ...(icon ? { icon } : {}) } : null; }), sticker: text(block.sticker, 40), tag: text(block.tag, 60), ...(splitPhoto ? { photo: splitPhoto } : {}), ...(splitOrder ? { order: splitOrder } : {}), ...(splitSticker ? { stickerPos: splitSticker } : {}), ...(splitAlign ? { align: splitAlign } : {}) });
        break;
      }
      case 'marquee': blocks.push({ ...base, type, text: text(block.text, LIMITS.short, ctx.storeName), glyph: MARQUEE_GLYPHS.includes(block.glyph as (typeof MARQUEE_GLYPHS)[number]) ? (block.glyph as string) : '·' }); break;
      case 'catalog': blocks.push({ ...base, type, kicker: kickerText(block.kicker), title: text(block.title, LIMITS.headline, 'Nuestros productos'), seeAll: text(block.seeAll, 60), badges: list(block.badges, 3, b => (b == null ? null : text(b, 24).replace(/["\\\n\r]/g, '').trim() || null)), stripLeft: text(block.stripLeft, LIMITS.short), stripRight: text(block.stripRight, LIMITS.short), cardRatio: ['4-3', '1-1', '3-4'].includes(block.cardRatio as string) ? (block.cardRatio as '4-3') : '4-3', cardDesc: block.cardDesc !== false, cardAdd: block.cardAdd !== false }); break;
      case 'collections': blocks.push({ ...base, type, kicker: kickerText(block.kicker), title: text(block.title, LIMITS.headline, 'Colecciones'), note: text(block.note, 160), items: list(block.items, 4, i => { const entry = (typeof i === 'object' && i !== null ? i : {}) as Record<string, unknown>; const title = text(entry.title, 60); if (!title) return null; const itemPhoto = photo(entry.photo); return { title, text: text(entry.text, LIMITS.short), ...(itemPhoto ? { photo: itemPhoto } : {}) }; }) }); break;
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
        blocks.push({ ...base, type, kicker: kickerText(block.kicker), headline: text(block.headline, LIMITS.headline, ctx.storeName), cta: text(block.cta, 60, 'Comprar'), href: typeof block.href === 'string' && /^(#|index\.html|productos\.html|checkout\.html|galeria\.html)/.test(block.href) ? block.href : 'checkout.html', sticker: text(block.sticker, 40), ...(bannerSticker ? { stickerPos: bannerSticker } : {}) });
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
      const blockAlign = align(block.align);
      if (blockAlign && blockAlign !== 'start') kept.align = blockAlign; else delete kept.align;
      if (block.flip === true && ['hero', 'split', 'story', 'newsletter'].includes(kept.type)) kept.flip = true;
      if (block.swap === true && ['hero', 'split'].includes(kept.type)) kept.swap = true;
      // Copy order for the blocks added by structured selection (hero and split repair theirs above) and group layout.
      const copyOrder = SKETCH_COPY_ORDER[kept.type];
      if (copyOrder && kept.type !== 'hero' && kept.type !== 'split') {
        const repairedOrder = order(block.order, copyOrder);
        if (repairedOrder) kept.order = repairedOrder; else delete kept.order;
      }
      const layout = repairSketchLayout(kept.type, block.layout);
      if (layout) kept.layout = layout; else delete kept.layout;
    }
  }

  // Size: a page has at most 20 blocks; beyond that the generated file outgrows the source contract.
  if (blocks.length > 20) { blocks.length = 20; notes.push('demasiados bloques; se conservaron los primeros 20'); }
  // One catalog only: the commerce runtime reads a single product template and mount.
  const extraCatalogs = blocks.filter(block => block.type === 'catalog').slice(1);
  if (extraCatalogs.length) { notes.push('catálogo repetido; se conservó el primero'); for (const extra of extraCatalogs) blocks.splice(blocks.indexOf(extra), 1); }
  // Structure: a shop always sells and every page ends in a footer, exactly one, last.
  if (!blocks.length) blocks.push({ id: '', type: 'hero', variant: 'photo-right', headline: ctx.storeName, sub: '', cta: 'Ver productos', cta2: '', trust: '', badge: '', note: '', sticker: '', caption: '', bg: 'paper', size: 'm' });
  if (ctx.purpose === 'shop' && !blocks.some(b => b.type === 'catalog')) {
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

  return { sketch: { palette, fonts, scale, style, account, blocks: ordered }, notes };
}

/** Editor-only block fields are absent from the model schema, so a chat edit reply resets them; carry them over by id. */
export const SKETCH_EDITOR_ONLY = ['align', 'flip', 'swap', 'order', 'stickerPos', 'layout'] as const;
export function carryEditorFields(current: StoreSketch, edited: StoreSketch): StoreSketch['blocks'] {
  return edited.blocks.map(block => {
    const before = current.blocks.find(item => item.id === block.id) as Record<string, unknown> | undefined;
    if (!before) return block;
    // Order and group layout name the parts of one block type; a block the model turned into another type starts fresh.
    const keys = before.type === block.type ? SKETCH_EDITOR_ONLY : SKETCH_EDITOR_ONLY.filter(key => key !== 'order' && key !== 'layout');
    const carried = Object.fromEntries(keys.filter(key => before[key] !== undefined && (block as Record<string, unknown>)[key] === undefined).map(key => [key, before[key]]));
    return { ...block, ...carried } as typeof block;
  });
}
