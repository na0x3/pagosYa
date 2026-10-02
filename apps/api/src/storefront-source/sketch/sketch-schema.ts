import { SOURCE_FONT_IDS } from '../source-font-catalog';

/** The editable sketch a merchant shapes before any site is built (sketch-first YAPI, sub-project 1).
 * `repairSketch` is total: any input yields a usable sketch plus notes — the sketch loop never surfaces errors. */
export type SketchPalette = { paper: string; ink: string; accent: string; deep: string; pop: string };
export type SketchSize = 's' | 'm' | 'l' | 'xl';
export type SketchBg = keyof SketchPalette;
export type SketchBlock =
  | { id: string; type: 'hero'; variant: 'photo-right' | 'full-bleed' | 'stacked'; headline: string; sub: string; cta: string; photo?: string; bg: SketchBg; size: SketchSize }
  | { id: string; type: 'marquee'; text: string; bg: SketchBg; size: SketchSize }
  | { id: string; type: 'catalog'; kicker: string; title: string; bg: SketchBg; size: SketchSize }
  | { id: string; type: 'story'; title: string; paragraphs: string[]; photo?: string; bg: SketchBg; size: SketchSize }
  | { id: string; type: 'reviews'; title: string; quotes: Array<{ text: string; name: string }>; bg: SketchBg; size: SketchSize }
  | { id: string; type: 'faq'; title: string; items: Array<{ q: string; a: string }>; bg: SketchBg; size: SketchSize }
  | { id: string; type: 'banner'; headline: string; cta: string; href: string; bg: SketchBg; size: SketchSize }
  | { id: string; type: 'gallery'; title: string; photos: string[]; bg: SketchBg; size: SketchSize }
  | { id: string; type: 'newsletter'; title: string; note: string; cta: string; bg: SketchBg; size: SketchSize }
  | { id: string; type: 'footer'; tagline: string; wordmark: 'giant' | 'plain'; bg: SketchBg; size: SketchSize };
export type StoreSketch = { palette: SketchPalette; fonts: { display: string; text: string }; scale: SketchSize; blocks: SketchBlock[] };
export type SketchContext = { storeName: string; purpose: 'shop' | 'services'; photos: string[] };

export const SKETCH_BLOCK_TYPES = ['hero', 'marquee', 'catalog', 'story', 'reviews', 'faq', 'banner', 'gallery', 'newsletter', 'footer'] as const satisfies ReadonlyArray<SketchBlock['type']>;

const DEFAULT_PALETTE: SketchPalette = { paper: '#f6ecd9', ink: '#1f2a24', accent: '#e35336', deep: '#1e3a2f', pop: '#f2c94c' };
const DEFAULT_FONTS = { display: 'fraunces', text: 'epilogue' };
const SIZES: readonly SketchSize[] = ['s', 'm', 'l', 'xl'];
const BGS: readonly SketchBg[] = ['paper', 'ink', 'accent', 'deep', 'pop'];
const LIMITS = { headline: 120, short: 200, paragraph: 600, list: 6, galleryPhotos: 12 };

const hex = (value: unknown): string | null => {
  const raw = String(value ?? '').trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(raw)) return raw;
  if (/^#[0-9a-f]{3}$/.test(raw)) return '#' + [...raw.slice(1)].map(c => c + c).join('');
  return null;
};
const luminance = (color: string) => {
  const n = parseInt(color.slice(1), 16);
  return (0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
};
const text = (value: unknown, limit: number, fallback = '') => {
  const raw = typeof value === 'string' ? value : value == null ? fallback : String(value);
  return raw.slice(0, limit);
};
const list = <T>(value: unknown, limit: number, map: (item: unknown) => T | null): T[] =>
  (Array.isArray(value) ? value : []).map(map).filter((item): item is T => item !== null).slice(0, limit);

export function repairSketch(input: unknown, ctx: SketchContext): { sketch: StoreSketch; notes: string[] } {
  const notes: string[] = [];
  const raw = (typeof input === 'object' && input !== null ? input : (input !== undefined && notes.push('input no era un objeto; se usó el boceto base'), {})) as Record<string, unknown>;

  // Palette: normalize role by role; broken values fall to defaults.
  const rawPalette = (typeof raw.palette === 'object' && raw.palette !== null ? raw.palette : {}) as Record<string, unknown>;
  const palette = { ...DEFAULT_PALETTE };
  for (const role of BGS) {
    const value = hex(rawPalette[role]);
    if (value) palette[role] = value;
    else if (rawPalette[role] !== undefined) notes.push(`color ${role} inválido; se usó el color base`);
  }
  // Readability: ink must contrast with paper.
  if (Math.abs(luminance(palette.paper) - luminance(palette.ink)) < 0.25) {
    palette.ink = luminance(palette.paper) > 0.5 ? '#111111' : '#ffffff';
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
  const size = (value: unknown): SketchSize => (SIZES.includes(value as SketchSize) ? (value as SketchSize) : 'm');
  const bg = (value: unknown, fallback: SketchBg): SketchBg => (BGS.includes(value as SketchBg) ? (value as SketchBg) : fallback);
  const photo = (value: unknown): string | undefined => {
    if (typeof value !== 'string' || !value) return undefined;
    if (ctx.photos.includes(value)) return value;
    notes.push(`foto inexistente (${value.slice(0, 60)}); se quitó`);
    return undefined;
  };

  // Blocks: keep known types, repair each field, drop the rest.
  const blocks: SketchBlock[] = [];
  for (const item of Array.isArray(raw.blocks) ? raw.blocks : []) {
    const block = (typeof item === 'object' && item !== null ? item : {}) as Record<string, unknown>;
    const type = block.type as SketchBlock['type'];
    const base = { id: '', bg: bg(block.bg, 'paper'), size: size(block.size) };
    switch (type) {
      case 'hero': {
        const heroPhoto = photo(block.photo);
        blocks.push({ ...base, type, variant: ['photo-right', 'full-bleed', 'stacked'].includes(block.variant as string) ? (block.variant as 'photo-right') : 'photo-right', headline: text(block.headline, LIMITS.headline, ctx.storeName), sub: text(block.sub, LIMITS.short), cta: text(block.cta, 60, 'Ver productos'), ...(heroPhoto ? { photo: heroPhoto } : {}) });
        break;
      }
      case 'marquee': blocks.push({ ...base, type, text: text(block.text, LIMITS.short, ctx.storeName) }); break;
      case 'catalog': blocks.push({ ...base, type, kicker: text(block.kicker, 80), title: text(block.title, LIMITS.headline, 'Nuestros productos') }); break;
      case 'story': {
        const storyPhoto = photo(block.photo);
        blocks.push({ ...base, type, title: text(block.title, LIMITS.headline, 'Nuestra historia'), paragraphs: list(block.paragraphs, LIMITS.list, p => (p == null ? null : text(p, LIMITS.paragraph))), ...(storyPhoto ? { photo: storyPhoto } : {}) });
        break;
      }
      case 'reviews': blocks.push({ ...base, type, title: text(block.title, LIMITS.headline, 'Clientes felices'), quotes: list(block.quotes, LIMITS.list, q => { const quote = (typeof q === 'object' && q !== null ? q : {}) as Record<string, unknown>; const body = text(quote.text, LIMITS.short); return body ? { text: body, name: text(quote.name, 60, 'Cliente') } : null; }) }); break;
      case 'faq': blocks.push({ ...base, type, title: text(block.title, LIMITS.headline, 'Preguntas'), items: list(block.items, LIMITS.list, i => { const entry = (typeof i === 'object' && i !== null ? i : {}) as Record<string, unknown>; const q = text(entry.q, LIMITS.short); return q ? { q, a: text(entry.a, LIMITS.paragraph) } : null; }) }); break;
      case 'banner': blocks.push({ ...base, type, headline: text(block.headline, LIMITS.headline, ctx.storeName), cta: text(block.cta, 60, 'Comprar'), href: typeof block.href === 'string' && /^(#|index\.html|productos\.html|checkout\.html|galeria\.html)/.test(block.href) ? block.href : 'checkout.html' }); break;
      case 'gallery': blocks.push({ ...base, type, title: text(block.title, LIMITS.headline, 'Galería'), photos: list(block.photos, LIMITS.galleryPhotos, p => (typeof p === 'string' && ctx.photos.includes(p) ? p : (p != null && notes.push(`foto inexistente (${String(p).slice(0, 60)}); se quitó`), null))) }); break;
      case 'newsletter': blocks.push({ ...base, type, title: text(block.title, LIMITS.headline, 'Novedades'), note: text(block.note, LIMITS.short), cta: text(block.cta, 60, 'Ver la tienda') }); break;
      case 'footer': blocks.push({ ...base, type, bg: bg(block.bg, 'deep'), tagline: text(block.tagline, LIMITS.short), wordmark: block.wordmark === 'plain' ? 'plain' : 'giant' }); break;
      default: notes.push(`bloque desconocido (${String(type).slice(0, 40)}); se quitó`);
    }
  }

  // Structure: a shop always sells and every page ends in a footer, exactly one, last.
  if (!blocks.length) blocks.push({ id: '', type: 'hero', variant: 'photo-right', headline: ctx.storeName, sub: '', cta: 'Ver productos', bg: 'paper', size: 'm' });
  if (ctx.purpose === 'shop' && !blocks.some(b => b.type === 'catalog')) {
    blocks.splice(1, 0, { id: '', type: 'catalog', kicker: '', title: 'Nuestros productos', bg: 'paper', size: 'm' });
    notes.push('faltaba el catálogo; se añadió');
  }
  const footers = blocks.filter(b => b.type === 'footer');
  const footer = footers[0] ?? { id: '', type: 'footer' as const, tagline: '', wordmark: 'giant' as const, bg: 'deep' as const, size: 'm' as const };
  const body = blocks.filter(b => b.type !== 'footer');
  const ordered = [...body, footer];
  ordered.forEach((block, index) => { block.id = `b${index + 1}`; });

  return { sketch: { palette, fonts, scale, blocks: ordered }, notes };
}
