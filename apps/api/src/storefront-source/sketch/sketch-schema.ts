import { SOURCE_FONT_IDS } from '../source-font-catalog';

/** The editable sketch a merchant shapes before any site is built (sketch-first YAPI, sub-project 1).
 * `repairSketch` is total: any input yields a usable sketch plus notes — the sketch loop never surfaces errors. */
export type SketchPalette = { paper: string; ink: string; accent: string; deep: string; pop: string };
export type SketchSize = 's' | 'm' | 'l' | 'xl';
export type SketchBg = keyof SketchPalette;
export type SketchBlock =
  | { id: string; type: 'hero'; variant: 'photo-right' | 'full-bleed' | 'stacked'; headline: string; sub: string; cta: string; badge: string; note: string; sticker: string; photo?: string; bg: SketchBg; size: SketchSize }
  | { id: string; type: 'announce'; left: string; right: string; bg: SketchBg; size: SketchSize }
  | { id: string; type: 'split'; headline: string; body: string; cta: string; href: string; pills: string[]; photo?: string; bg: SketchBg; size: SketchSize }
  | { id: string; type: 'marquee'; text: string; bg: SketchBg; size: SketchSize }
  | { id: string; type: 'catalog'; kicker: string; title: string; bg: SketchBg; size: SketchSize }
  | { id: string; type: 'steps'; title: string; items: Array<{ icon: string; title: string; text: string }>; bg: SketchBg; size: SketchSize }
  | { id: string; type: 'story'; title: string; paragraphs: string[]; photo?: string; bg: SketchBg; size: SketchSize }
  | { id: string; type: 'reviews'; title: string; quotes: Array<{ text: string; name: string }>; bg: SketchBg; size: SketchSize }
  | { id: string; type: 'faq'; title: string; items: Array<{ q: string; a: string }>; bg: SketchBg; size: SketchSize }
  | { id: string; type: 'banner'; headline: string; cta: string; href: string; bg: SketchBg; size: SketchSize }
  | { id: string; type: 'gallery'; title: string; photos: string[]; bg: SketchBg; size: SketchSize }
  | { id: string; type: 'newsletter'; title: string; note: string; cta: string; bg: SketchBg; size: SketchSize }
  | { id: string; type: 'footer'; tagline: string; wordmark: 'giant' | 'plain'; bg: SketchBg; size: SketchSize };
export type StoreSketch = { palette: SketchPalette; fonts: { display: string; text: string }; scale: SketchSize; blocks: SketchBlock[] };
export type SketchContext = { storeName: string; purpose: 'shop' | 'service'; photos: string[] };

export const SKETCH_BLOCK_TYPES = ['announce', 'hero', 'split', 'steps', 'marquee', 'catalog', 'story', 'reviews', 'faq', 'banner', 'gallery', 'newsletter', 'footer'] as const satisfies ReadonlyArray<SketchBlock['type']>;

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

/** Deterministic guarantee that every provided photo appears somewhere: the hero gets the first photo
 * when it has none, and any photo no block shows is appended to a gallery (created before the footer
 * when missing). Used at generation time so "usa estas fotos" always means all of them. */
export function ensureAllPhotosUsed(sketch: StoreSketch, ctx: SketchContext): StoreSketch {
  if (!ctx.photos.length) return sketch;
  const used = new Set<string>();
  for (const block of sketch.blocks) {
    if ('photo' in block && block.photo) used.add(block.photo);
    if (block.type === 'gallery') for (const photo of block.photos) used.add(photo);
  }
  const missing = ctx.photos.filter(photo => !used.has(photo));
  if (!missing.length) return sketch;
  const blocks = sketch.blocks.map(block => ({ ...block }));
  const hero = blocks.find(block => block.type === 'hero' && !block.photo) as Extract<SketchBlock, { type: 'hero' }> | undefined;
  if (hero && missing.length) hero.photo = missing.shift();
  if (missing.length) {
    const gallery = blocks.find(block => block.type === 'gallery') as Extract<SketchBlock, { type: 'gallery' }> | undefined;
    if (gallery) gallery.photos = [...gallery.photos, ...missing].slice(0, 12);
    else {
      const footerIndex = blocks.findIndex(block => block.type === 'footer');
      const ids = new Set(blocks.map(block => block.id));
      let next = 1; while (ids.has(`b${next}`)) next++;
      blocks.splice(footerIndex === -1 ? blocks.length : footerIndex, 0, { id: `b${next}`, type: 'gallery', title: 'Galería', photos: missing.slice(0, 12), bg: 'paper', size: 'm' });
    }
  }
  return { ...sketch, blocks };
}

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
  const size = (value: unknown): SketchSize => (SIZES.includes(value as SketchSize) ? (value as SketchSize) : 'm');
  const bg = (value: unknown, fallback: SketchBg): SketchBg => (BGS.includes(value as SketchBg) ? (value as SketchBg) : fallback);
  const photo = (value: unknown): string | undefined => {
    if (typeof value !== 'string' || !value) return undefined;
    if (ctx.photos.includes(value)) return value;
    notes.push(`foto inexistente (${value.slice(0, 60)}); se quitó`);
    return undefined;
  };

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
    const type = block.type as SketchBlock['type'];
    const base = { id: rawId(block.id), bg: bg(block.bg, 'paper'), size: size(block.size) };
    switch (type) {
      case 'hero': {
        const heroPhoto = photo(block.photo);
        blocks.push({ ...base, type, variant: ['photo-right', 'full-bleed', 'stacked'].includes(block.variant as string) ? (block.variant as 'photo-right') : 'photo-right', headline: text(block.headline, LIMITS.headline, ctx.storeName), sub: text(block.sub, LIMITS.short), cta: text(block.cta, 60, 'Ver productos'), badge: text(block.badge, 60), note: text(block.note, 120), sticker: text(block.sticker, 40), ...(heroPhoto ? { photo: heroPhoto } : {}) });
        break;
      }
      case 'announce': blocks.push({ ...base, type, left: text(block.left, LIMITS.short), right: text(block.right, LIMITS.short) }); break;
      case 'split': {
        const splitPhoto = photo(block.photo);
        blocks.push({ ...base, type, bg: bg(block.bg, 'accent'), headline: text(block.headline, LIMITS.headline, ctx.storeName), body: text(block.body, LIMITS.paragraph), cta: text(block.cta, 60, 'Ver más'), href: typeof block.href === 'string' && /^(#|index\.html|productos\.html|checkout\.html|galeria\.html)/.test(block.href) ? block.href : 'checkout.html', pills: list(block.pills, LIMITS.list, p => (p == null ? null : text(p, 60))), ...(splitPhoto ? { photo: splitPhoto } : {}) });
        break;
      }
      case 'marquee': blocks.push({ ...base, type, text: text(block.text, LIMITS.short, ctx.storeName) }); break;
      case 'catalog': blocks.push({ ...base, type, kicker: text(block.kicker, 80), title: text(block.title, LIMITS.headline, 'Nuestros productos') }); break;
      case 'steps': blocks.push({ ...base, type, title: text(block.title, LIMITS.headline, 'Así de simple'), items: list(block.items, 4, i => { const entry = (typeof i === 'object' && i !== null ? i : {}) as Record<string, unknown>; const title = text(entry.title, 60); if (!title) return null; return { icon: typeof entry.icon === 'string' && /^[a-z0-9-]{2,40}$/.test(entry.icon) ? entry.icon : 'sparkles', title, text: text(entry.text, LIMITS.short) }; }) }); break;
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

  // Size: a page has at most 20 blocks; beyond that the generated file outgrows the source contract.
  if (blocks.length > 20) { blocks.length = 20; notes.push('demasiados bloques; se conservaron los primeros 20'); }
  // One catalog only: the commerce runtime reads a single product template and mount.
  const extraCatalogs = blocks.filter(block => block.type === 'catalog').slice(1);
  if (extraCatalogs.length) { notes.push('catálogo repetido; se conservó el primero'); for (const extra of extraCatalogs) blocks.splice(blocks.indexOf(extra), 1); }
  // Structure: a shop always sells and every page ends in a footer, exactly one, last.
  if (!blocks.length) blocks.push({ id: '', type: 'hero', variant: 'photo-right', headline: ctx.storeName, sub: '', cta: 'Ver productos', badge: '', note: '', sticker: '', bg: 'paper', size: 'm' });
  if (ctx.purpose === 'shop' && !blocks.some(b => b.type === 'catalog')) {
    blocks.splice(1, 0, { id: '', type: 'catalog', kicker: '', title: 'Nuestros productos', bg: 'paper', size: 'm' });
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

  return { sketch: { palette, fonts, scale, blocks: ordered }, notes };
}
