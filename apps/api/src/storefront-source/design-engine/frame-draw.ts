/**
 * The frame and hero draw (spec docs/superpowers/specs/2026-10-10-frame-hero-draw-design.md). The model cannot be
 * random: given the same kind of brief it lands on the same header every time. The platform rolls these four parts
 * per new store or redesign, avoiding what recent stores got, and YAPI builds them in the store's own language.
 */
import { cartWordFor, parseCommerceDraw, type CommerceDraw } from './commerce-draw';
import { CONVENTIONAL_HEADERS, PLAYBOOK, type StyleFamily } from './playbook';
import { merchantAsksForPhotoGroup } from '../source-media-design';

export type FrameNeed = 'photos1' | 'photos2' | 'photos3' | 'photoGroup' | 'product' | 'facts';
export type FrameEntry = { id: string; bold: boolean; desktop: string; phone: string; needs?: FrameNeed };
export type FramePart = 'header' | 'cart' | 'footer' | 'hero';
export type FrameDraw = Record<FramePart, string>;
/** photoGroups: the merchant's own words asked for a gallery, collage or lookbook (merchantAsksForPhotoGroup). */
export type FrameAvailable = { photos: number; products: number; facts: boolean; photoGroups?: boolean };

export const FRAME_DRAW_FILE = 'frame-draw.json';
const PARTS: FramePart[] = ['header', 'cart', 'footer', 'hero'];

export const FRAME_CATALOGUE: Record<FramePart, readonly FrameEntry[]> = {
  header: [
    { id: 'centered-split', bold: false, desktop: 'Header: the store name centred, the primary navigation split into two groups either side of it, with Buscar, Mi cuenta and the cart at the outer right end.', phone: 'On phones: the name centred, a menu button on the left that opens the navigation with Buscar and Mi cuenta, the cart on the right.' },
    { id: 'menu-button', bold: false, desktop: 'Header: the store name on the left and, on the right, a single labelled menu button next to the cart; the navigation, Buscar and Mi cuenta open from that button and nothing else sits in the bar.', phone: 'On phones: the same bar; the menu button and the cart stay visible.' },
    { id: 'info-bar', bold: false, needs: 'facts', desktop: 'Header: a thin full-width bar on top carrying one real fact from the brief (delivery area, opening hours or pickup; never an invented offer), then a simple row with the store name, the navigation, Buscar, Mi cuenta and the cart.', phone: 'On phones: the fact bar stays one line; below it the name, a menu button holding the navigation, Buscar and Mi cuenta, and the cart.' },
    { id: 'stacked', bold: false, desktop: 'Header: the store name large and centred on its own row, and below it a centred row with the navigation, Buscar, Mi cuenta and the cart.', phone: 'On phones: the name centred on top, then one row with a menu button (navigation, Buscar, Mi cuenta) and the cart.' },
    { id: 'shrinking', bold: false, desktop: 'Header: a tall bar with a large store name that tightens into a compact sticky bar once the shopper scrolls; the navigation, Buscar, Mi cuenta and the cart stay in it.', phone: 'On phones: start compact; a menu button holds the navigation, Buscar and Mi cuenta, and the cart stays visible while scrolling.' },
    { id: 'wordmark-band', bold: true, desktop: 'Header: the store name set as a giant wordmark spanning the full page width, with the navigation, Buscar, Mi cuenta and the cart on one thin line directly above or below it.', phone: 'On phones: the wordmark fills the width on one line; a menu button (navigation, Buscar, Mi cuenta) and the cart sit on the thin line.' },
    { id: 'side-rail', bold: true, desktop: 'Header: a narrow vertical rail fixed to the left edge holding the store name (rotated or stacked), a menu button and the cart; the navigation, Buscar and Mi cuenta open from the menu button, and the page content sits to the right of the rail.', phone: 'On phones: the rail becomes a slim top bar with the name, the menu button and the cart.' },
    { id: 'bottom-pill', bold: true, desktop: 'Header: only the store name at the top; the navigation lives in a floating pill fixed at the bottom centre of the screen with the menu, a shop link and the cart, and Buscar and Mi cuenta open from the menu.', phone: 'On phones: the same floating pill with the menu and the cart at the bottom, thumb-reachable; leave bottom padding so it never covers add-to-cart buttons.' },
    { id: 'overlay', bold: true, desktop: 'Header: just the store name, a menu button and the cart; the menu button opens a full-screen overlay with the navigation set very large, plus Buscar and Mi cuenta.', phone: 'On phones: the same; the overlay menu closes with a visible close button and Escape, and the cart stays in the bar.' },
    { id: 'reveal', bold: true, desktop: 'Header: a header that slides away when the shopper scrolls down and slides back when they scroll up, carrying the store name, the navigation, Buscar, Mi cuenta and the cart; at the top of the page it sits over the hero.', phone: 'On phones: the same behaviour with a menu button (navigation, Buscar, Mi cuenta) and the cart; it is visible at load and on any upward scroll.' },
  ],
  cart: [
    { id: 'word-count', bold: false, desktop: 'Cart and account: the word Carrito followed by the count in parentheses, e.g. Carrito (2), and Mi cuenta as a plain word.', phone: 'On phones: Carrito with its count stays as text.' },
    { id: 'icon-dot', bold: true, desktop: 'Cart and account: a bag icon with a small accent-colour dot when the cart is not empty (keep the number in [data-cart-count], visually hidden or tiny) and a person icon for Mi cuenta, both with accessible labels.', phone: 'On phones: the same icons with tap targets of at least 44px.' },
    { id: 'accent-tag', bold: true, desktop: "Cart and account: the cart as a small tag filled with the store's accent colour showing the count; Mi cuenta as plain text.", phone: 'On phones: the tag keeps its colour and count.' },
    { id: 'own-word', bold: true, desktop: 'Cart and account: name the cart with a word that fits what this store sells (e.g. Tu canasta, Tu bolsa, Tu pedido) followed by the count; Mi cuenta keeps its label.', phone: 'On phones: the word may shorten to the count in a circle, keeping an accessible label.' },
    { id: 'underline-link', bold: false, desktop: 'Cart and account: the cart and Mi cuenta as plain text links that underline on hover, the count set small beside the word.', phone: 'On phones: the same text links, at least 44px tall.' },
    { id: 'round-icon', bold: false, desktop: 'Cart and account: round outlined icon buttons for the cart (count in a badge on its edge) and Mi cuenta, both with accessible labels.', phone: 'On phones: the same round buttons at 44px.' },
  ],
  footer: [
    { id: 'wordmark-signoff', bold: true, desktop: 'Footer: end the page with the store name set huge across the full width, with the information pages and contact in small type above it.', phone: 'On phones: the wordmark scales to fit on one or two lines.' },
    { id: 'directory', bold: false, desktop: 'Footer: a multi-column directory with shop links, the information pages, and contact and location from the brief, each column with a small heading.', phone: 'On phones: the columns stack.' },
    { id: 'quiet-line', bold: false, desktop: 'Footer: a single quiet line with the store name, the information pages and the year.', phone: 'On phones: the line wraps naturally.' },
    { id: 'contact-card', bold: false, desktop: 'Footer: a contact card first (how to reach the store, from the brief only), then the information pages.', phone: 'On phones: the card first, the information pages below.' },
    { id: 'statement-band', bold: true, desktop: "Footer: a full-width colour band with one short closing statement in the store's voice, then the information pages below it.", phone: 'On phones: the statement stays large, the information pages below.' },
    { id: 'photo-echo', bold: true, needs: 'photos2', desktop: 'Footer: repeat a photo used in the hero as a wide strip, with the store name and the information pages over or beside it.', phone: 'On phones: the photo strip stays short (at most 40vh) with the text beneath.' },
  ],
  hero: [
    { id: 'full-bleed', bold: false, needs: 'photos1', desktop: 'Hero: one photo filling the first screen edge to edge with the headline set over it, with a scrim for contrast.', phone: 'On phones: the photo fills the first screen in a portrait crop and the headline stays readable.' },
    { id: 'split', bold: false, needs: 'photos1', desktop: 'Hero: the first screen divided into a photo half and a text half with the headline and the main action.', phone: 'On phones: the photo on top, the text below.' },
    { id: 'type-only', bold: true, desktop: 'Hero: no photo at all; the first screen is typography and colour, a very large headline, one short line and the main action.', phone: 'On phones: the headline still dominates the first screen.' },
    { id: 'collage', bold: true, needs: 'photoGroup', desktop: 'Hero: three or more photos arranged as an overlapping collage with the headline set among them.', phone: 'On phones: two photos overlap above the headline and the rest are left out.' },
    { id: 'single-product', bold: false, needs: 'product', desktop: 'Hero: one real product from the catalog as the hero, its photo large with its name and a button to its product page; never type its price, which the runtime owns and may change.', phone: 'On phones: the product photo, name and button stacked.' },
    { id: 'statement-strip', bold: true, needs: 'photoGroup', desktop: 'Hero: one statement in very large type, then a horizontal strip of photos below it.', phone: 'On phones: the photo strip scrolls sideways.' },
    { id: 'offset-frame', bold: true, needs: 'photos1', desktop: "Hero: a single photo inside a visible frame or border, with the headline placed offset so it overlaps the frame's edge.", phone: 'On phones: the frame narrows and the headline overlaps its bottom edge.' },
    { id: 'slow-slideshow', bold: false, needs: 'photos2', desktop: 'Hero: two or more photos cross-fading slowly (about 6 seconds each) behind a fixed headline, paused on hover and under prefers-reduced-motion.', phone: 'On phones: the same, showing a single photo under reduced motion.' },
    // Calm openings that need no photo (night run 2026-10-11: every store without photos got the type-only hero).
    { id: 'facts-panel', bold: false, needs: 'facts', desktop: "Hero: no photo; the headline, one line and the main action on one side, and on the other a calm panel in the palette's second colour listing the store's real facts from the brief (what it offers, hours, where, delivery or pickup) as short labelled rows.", phone: 'On phones: the headline first, the facts panel below it.' },
    { id: 'catalog-lead', bold: false, desktop: "Hero: no photo; a compact headline band with one line and the main action, and the catalog's first product cards (the runtime catalog) already starting inside the first screen, the way a busy online shop opens.", phone: 'On phones: the headline band, then the first card peeking at the bottom of the screen.' },
    { id: 'illustration', bold: false, desktop: 'Hero: no photo; the headline, one line and the main action beside one large, calm line drawing of what the store sells (from the illustration library), coloured in the palette.', phone: 'On phones: the drawing smaller above the headline.' },
  ],
};

const fits = (entry: FrameEntry, available: FrameAvailable) => {
  switch (entry.needs) {
    case 'photos1': return available.photos >= 1;
    case 'photos2': return available.photos >= 2;
    case 'photos3': return available.photos >= 3;
    // Owner decision 2026-10-15: no photo groups unless the merchant asks for one.
    case 'photoGroup': return available.photos >= 3 && Boolean(available.photoGroups);
    case 'product': return available.products >= 1;
    case 'facts': return available.facts;
    default: return true;
  }
};

/** `spread`: how far above the least-used count an option may still be drawn. 0 (ordinary runs) takes only the least used;
 *  the style cards pass 1, so a stable history no longer lands on the same option every time. */
export function drawFrame(random: () => number, recent: Partial<FrameDraw>[], available: FrameAvailable, allowed: Partial<Record<FramePart, readonly string[]>> = {}, spread = 0): FrameDraw {
  const pick = <T>(items: readonly T[]): T => items[Math.min(items.length - 1, Math.floor(random() * items.length))];
  const draw = {} as FrameDraw;
  for (const part of PARTS) {
    // The playbook family narrows the choice (conventional headers); an empty narrowing falls back to every fitting option.
    const fitting = FRAME_CATALOGUE[part].filter(entry => fits(entry, available));
    const restricted = allowed[part] ? fitting.filter(entry => allowed[part]!.includes(entry.id)) : fitting;
    const options = restricted.length ? restricted : fitting;
    if (part === 'cart') { draw[part] = pick(options).id; continue; }
    const uses = new Map(options.map(entry => [entry.id, recent.filter(item => item[part] === entry.id).length]));
    const fewest = Math.min(...uses.values());
    draw[part] = pick(options.filter(entry => uses.get(entry.id)! <= fewest + spread)).id;
  }
  return draw;
}

export function frameDirection(draw: Partial<FrameDraw & DesignDraw>, omit: Partial<Record<FramePart | DesignPart, boolean>> = {}, playbook = false): string {
  const frameLines = PARTS.flatMap(part => {
    const entry = !omit[part] && FRAME_CATALOGUE[part].find(item => item.id === draw[part]);
    return entry ? [`- ${entry.desktop} ${entry.phone}`] : [];
  });
  const palette = !omit.palette && allPalettes().find(entry => entry.id === draw.palette);
  const designLines = [
    ...(palette ? [`- ${paletteLine(palette)}`] : []),
    ...(['angle', 'structure', 'photos', 'button', 'hover'] as const).flatMap(part => {
      const entry = !omit[part] && DESIGN_CATALOGUE[part].find(item => item.id === draw[part]);
      return entry ? [`- ${entry.desktop}${entry.phone ? ` ${entry.phone}` : ''}`] : [];
    }),
  ];
  if (!frameLines.length && !designLines.length) return '';
  if (!designLines.length) return ["FRAME AND HERO: This store's frame was drawn for it so stores never repeat each other. Build exactly this structure and style it entirely in the store's own language; type, colour, spacing and motion are yours.", ...frameLines, 'Before finishing, compare your desktop and phone screenshots with this list and fix any part that does not match.'].join('\n');
  return [`DESIGN DRAW: This store's design was drawn for it so stores never repeat each other, even two in the same business. Build exactly this and style it in the store's own language; ${playbook ? 'fonts and spacing follow the PLAYBOOK below, motion is yours' : 'fonts, spacing and motion are yours'}.`, ...frameLines, ...designLines,
    '- Quality: circular text only with an inline SVG <textPath>, never a rotated span; never use emoji as decoration; text never overlaps other text. Photo treatments apply to your own images, never to the platform\'s catalog cards or product page, so shoppers see the real product colours.',
    'Before finishing, compare your desktop and phone screenshots with this list and fix any part that does not match.'].join('\n');
}

/** The drawn frame without its header and cart lines (spec 2026-10-13): the platform draws the header for a static author,
 *  which is told only the hero and footer. The style cards' "- Cart label:" line goes too. Every other line is kept as it is. */
export function framePlatformHeader(paragraph: string): string {
  return paragraph.split('\n').filter(line => !/^- (?:Header|Cart and account|Cart label):/.test(line)).join('\n');
}

// \b treats accented letters as non-word characters, so "menú" would never match; whole words via letter lookarounds.
const HEADER_WORDS = /(?<!\p{L})(logo|logotipo|cabecera|encabezado|header|men[uú]|navegaci[oó]n)(?!\p{L})/iu;
const PLACE_WORDS = /(?<!\p{L})(centrad[oa]|centro|izquierda|derecha|lateral|arriba|abajo|fij[oa]|sticky|flotante)(?!\p{L})/iu;
const HERO_WORDS = /(?<!\p{L})(portada|hero|primera pantalla|banner principal)(?!\p{L})/iu;
// "portada" in passing ("mis productos en la portada", a template rework's "composición de la portada") is not a hero decision.
const HERO_CHOICE = /(?<!\p{L})(fotos?|im[aá]gen(es)?|videos?|texto|tipograf[ií]a|collage|slider|carrusel)(?!\p{L})/iu;
/** The merchant already decided: their words win over the dice for that part. When unsure, keep the draw. */
const BOLD_WORDS = /(?<!\p{L})(atrevid[oa]s?|audaz|audaces|llamativ[oa]s?|p[oó]ster|bold|rompedor[a]?|experimental)(?!\p{L})/iu;
/** The merchant asked for a bold store: poster type and unconventional headers come back. */
export function asksForBold(text: string): boolean { return BOLD_WORDS.test(text); }

export function frameOverrides(text: string): { header: boolean; hero: boolean } {
  return { header: HEADER_WORDS.test(text) && PLACE_WORDS.test(text), hero: HERO_WORDS.test(text) && HERO_CHOICE.test(text) };
}

export function parseFrameDraw(content: unknown): Partial<FrameDraw & DesignDraw & CommerceDraw> & { category?: string; kind?: string; family?: string } {
  let value: unknown;
  try { value = typeof content === 'string' ? JSON.parse(content) : undefined; } catch { return {}; }
  if (!value || typeof value !== 'object') return {};
  const out: Partial<FrameDraw & DesignDraw & CommerceDraw> & { category?: string; kind?: string; family?: string } = {};
  for (const part of PARTS) {
    const id = (value as Record<string, unknown>)[part];
    if (typeof id === 'string' && FRAME_CATALOGUE[part].some(entry => entry.id === id)) out[part] = id;
  }
  for (const part of DESIGN_PARTS) {
    const id = (value as Record<string, unknown>)[part];
    const known = part === 'palette' ? allPalettes() : designOptions(part, { photos: 99, products: 99, facts: true });
    if (typeof id === 'string' && known.some(option => option.id === id)) (out as Record<string, string>)[part] = id;
  }
  for (const key of ['category', 'kind', 'family'] as const) {
    const text = (value as Record<string, unknown>)[key];
    if (typeof text === 'string' && text.trim()) (out as Record<string, string>)[key] = text.trim().slice(0, 40);
  }
  // Account, checkout and the cart path a style card drew (spec 2026-10-11 commerce surfaces).
  Object.assign(out, parseCommerceDraw(value));
  return out;
}

/** What one generation gets. Fresh designs draw and save; edits carry the saved file without re-sending the
 *  paragraph (the saved code already embodies it); the flag off changes nothing. */
export function frameForRun(input: { enabled: boolean; designEnabled?: boolean; brandColours?: boolean; category?: string; fresh: boolean; previous: Array<{ path: string; content: string }>; recent: Array<Partial<FrameDraw & DesignDraw> & { category?: string }>; available: FrameAvailable; request: string; random?: () => number; playbook?: { kind: string; family: StyleFamily; bold: boolean }; boldStyle?: boolean; /** Style cards only: see drawFrame. */ spread?: number }): { file?: { path: string; content: string }; paragraph: string; planner?: string; dna?: { button: string; hover: string }; palette?: Palette; commerce?: { draw: Partial<CommerceDraw>; fresh: boolean; cartWord?: string } } {
  if (!input.enabled) return { paragraph: '' };
  if (!input.fresh) {
    const saved = input.previous.find(file => file.path === FRAME_DRAW_FILE);
    if (!saved) return { paragraph: '' };
    const kept = parseFrameDraw(saved.content);
    // A small edit keeps what the picked card drew for account, checkout and the cart path (spec 2026-10-11 commerce surfaces).
    const keptCommerce = parseCommerceDraw(kept);
    const cartWord = cartWordFor(kept.kind);
    const commerce = Object.keys(keptCommerce).length ? { commerce: { draw: keptCommerce, fresh: false, ...(cartWord ? { cartWord } : {}) } } : {};
    if (!input.designEnabled) return { file: saved, paragraph: '', ...commerce };
    // An ordinary edit keeps what the fresh design drew: its buttons in the DNA and its colour world in brand.css.
    const keptPalette = input.brandColours ? undefined : allPalettes().find(entry => entry.id === kept.palette);
    return { file: saved, paragraph: '', ...(kept.button && kept.hover ? { dna: { button: kept.button, hover: kept.hover } } : {}), ...(keptPalette ? { palette: keptPalette } : {}), ...commerce };
  }
  // A redesign must not get its own last header or hero back: the store's previous draw joins the history.
  const own = parseFrameDraw(input.previous.find(file => file.path === FRAME_DRAW_FILE)?.content);
  // With a spread (style cards) it counts past it, so the store's own last parts still lose to every other option.
  const recent = Object.keys(own).length ? [...Array.from({ length: 1 + (input.spread ?? 0) }, () => own), ...input.recent] : input.recent;
  // Professional by default: inside a playbook family only conventional headers, unless the merchant asked for bold.
  const conventional = Boolean(input.playbook && !input.playbook.bold);
  const calm = (list: readonly FrameEntry[]) => list.filter(entry => !entry.bold).map(entry => entry.id);
  const loud = (list: readonly FrameEntry[]) => list.filter(entry => entry.bold).map(entry => entry.id);
  // Every part, not only the header: a bold hero, footer or structure contradicts the playbook just as much.
  // A bold style card (spec 2026-10-11) prefers the loud headers and heroes; an empty narrowing falls back in drawFrame.
  const headerAllowed: Partial<Record<FramePart, readonly string[]>> = conventional
    ? { header: CONVENTIONAL_HEADERS, cart: calm(FRAME_CATALOGUE.cart), footer: ['directory', 'contact-card', 'statement-band', 'wordmark-signoff'], hero: calm(FRAME_CATALOGUE.hero) }
    : input.boldStyle ? { header: loud(FRAME_CATALOGUE.header), hero: loud(FRAME_CATALOGUE.hero) } : {};
  const frame = drawFrame(input.random ?? Math.random, recent, input.available, headerAllowed, input.spread ?? 0);
  const frameOmit = frameOverrides(input.request);
  const playbookFields: Record<string, string> = input.playbook ? { kind: input.playbook.kind, family: input.playbook.family.id } : {};
  if (!input.designEnabled) return { file: { path: FRAME_DRAW_FILE, content: JSON.stringify({ ...frame, ...playbookFields }, null, 2) + '\n' }, paragraph: frameDirection(frame, frameOmit) };
  const category = input.playbook?.kind ?? input.category ?? '';
  const design = drawDesign(input.random ?? Math.random, recent as Array<Partial<DesignDraw> & { category?: string }>, input.available, category, { palettes: input.boldStyle ? undefined : input.playbook?.family.palettes, button: input.playbook?.family.buttons, ...(conventional ? { parts: { angle: PLAYBOOK[input.playbook!.kind as keyof typeof PLAYBOOK]?.angles ?? calm(DESIGN_CATALOGUE.angle), structure: calm(DESIGN_CATALOGUE.structure), photos: calm(DESIGN_CATALOGUE.photos), hover: calm(DESIGN_CATALOGUE.hover) } } : {}) }, input.spread ?? 0);
  // Confirmed brand colours win over the drawn colour world in the prompts too, not only in brand.css.
  const designOmit = { ...designOverrides(input.request), ...(input.brandColours ? { palette: true } : {}) };
  const draw = { ...frame, ...design, category, ...playbookFields };
  // Parts the merchant decided are not saved: they were never built, so they must not count in other stores' history.
  const savedDraw: Record<string, string> = { ...draw };
  if (designOmit.palette) delete savedDraw.palette;
  if (designOmit.photos) delete savedDraw.photos;
  if (designOmit.button) { delete savedDraw.button; delete savedDraw.hover; }
  const palette = designOmit.palette ? undefined : allPalettes().find(entry => entry.id === design.palette);
  return {
    file: { path: FRAME_DRAW_FILE, content: JSON.stringify(savedDraw, null, 2) + '\n' },
    paragraph: frameDirection(draw, { ...frameOmit, palette: designOmit.palette, photos: designOmit.photos, button: designOmit.button, hover: designOmit.button }, Boolean(input.playbook)),
    planner: plannerDirection(draw, { palette: designOmit.palette }, Boolean(input.playbook)),
    ...(designOmit.button ? {} : { dna: { button: design.button, hover: design.hover } }),
    ...(palette ? { palette } : {}),
  };
}

/** Only the merchant's own words decide overrides. In the chat flow the instruction is composed: the agreed business
 *  summary, YAPI's interpretation and inspected references come first, then "Pedido actual del comercio:". */
const MERCHANT_MARKER = 'Pedido actual del comercio:';
const DISPLAY_IMAGE = /\.(png|jpe?g|webp|avif|gif)$/i;
const NOT_PHOTOS = new Set(['reference', 'unused', 'unknown', 'logo']);
const FACT = /(horario|abrimos|lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo|\d{1,2}:\d{2}|env[ií]o|delivery|entrega|recojo|retiro|pickup)/i;

export function frameInputs(input: {
  composedInstruction: string; merchantInstruction?: string;
  assetLegend: Array<{ original: string; path: string }>; imageUses: Array<{ url: string; role?: string }>; logoUrl?: string | null;
  items: Array<{ imageUrls?: string[] }>; locations?: unknown[]; businessInformation?: unknown;
}): { request: string; available: FrameAvailable } {
  const request = input.merchantInstruction?.trim() || input.composedInstruction.split(MERCHANT_MARKER).at(-1) || '';

  const info = typeof input.businessInformation === 'string' ? input.businessInformation : '';
  return {
    request,
    available: {
      photos: storePhotoPaths(input).length,
      products: input.items.filter(item => item.imageUrls?.length).length,
      facts: Boolean(input.locations?.length) || FACT.test(info),
      photoGroups: merchantAsksForPhotoGroup(request),
    },
  };
}

/** The store's own display photos, in legend order: not the logo, not a reference or unused image. */
export function storePhotoPaths(input: { assetLegend: Array<{ original: string; path: string }>; imageUses: Array<{ url: string; role?: string }>; logoUrl?: string | null }): string[] {
  return [...new Set(input.assetLegend.filter(asset => {
    if (!DISPLAY_IMAGE.test(asset.path) || (input.logoUrl && asset.original === input.logoUrl)) return false;
    const role = input.imageUses.find(use => use.url === asset.original)?.role;
    return !role || !NOT_PHOTOS.has(role);
  }).map(asset => asset.path))];
}

/** Draw only where the paragraph is actually built: the Sep-5 author or the agent builder, never the sketch-first
 *  path (it never reads the paragraph, so its draw would enter other stores' history unbuilt). */
export function frameFresh(input: { sep5Author: boolean; agentEngine: boolean; sketchFirst: boolean; hasPrevious: boolean; redesign: boolean }): boolean {
  return (input.sep5Author || (input.agentEngine && !input.sketchFirst)) && (!input.hasPrevious || input.redesign);
}

export type DesignPart = 'palette' | 'angle' | 'structure' | 'photos' | 'button' | 'hover';
export type DesignDraw = Record<DesignPart, string>;
export type Palette = { id: string; name: string; ink: string; paper: string; accent: string; accent2: string; dark: boolean };
const DESIGN_PARTS: DesignPart[] = ['palette', 'angle', 'structure', 'photos', 'button', 'hover'];

/** Colour worlds, deliberately not taken from the photos: the photos are styled to fit them. Ink on paper ≥ 7.6:1. */
export const PALETTES: readonly Palette[] = [
  { id: 'cobalt-bone', name: 'cobalt and bone', ink: '#1533c9', paper: '#f2ede3', accent: '#ff5a1f', accent2: '#0c0c0c', dark: false },
  { id: 'black-acid', name: 'black and acid green', ink: '#f4f4ef', paper: '#0d0d0d', accent: '#c8ff2e', accent2: '#7a7a7a', dark: true },
  { id: 'pink-olive', name: 'pastel pink and olive', ink: '#3b4114', paper: '#f7d6dc', accent: '#6b7a1f', accent2: '#e8476b', dark: false },
  { id: 'tomato-cream', name: 'tomato red and cream', ink: '#161616', paper: '#fff4e2', accent: '#e5371f', accent2: '#2f5d50', dark: false },
  { id: 'forest-lilac', name: 'forest green and lilac', ink: '#123b2a', paper: '#d9cff5', accent: '#1f6b45', accent2: '#f2f0ea', dark: false },
  { id: 'grey-hot-orange', name: 'mono grey and hot orange', ink: '#1b1b1b', paper: '#e6e6e3', accent: '#ff4f00', accent2: '#8a8a86', dark: false },
  { id: 'navy-butter', name: 'navy and butter yellow', ink: '#fff1b8', paper: '#12203f', accent: '#ffd23f', accent2: '#6f8bd6', dark: true },
  { id: 'sage-rust', name: 'sage and rust', ink: '#1e2a22', paper: '#c9d3bf', accent: '#b5462a', accent2: '#f4f1e8', dark: false },
  { id: 'ink-blueprint', name: 'blueprint blue and white', ink: '#eef3ff', paper: '#1739a6', accent: '#ffe14d', accent2: '#0b1b52', dark: true },
  { id: 'plum-mint', name: 'plum and mint', ink: '#c9f5e3', paper: '#3a1240', accent: '#7ef0c1', accent2: '#ff8fb1', dark: true },
  { id: 'mustard-black', name: 'mustard and black', ink: '#111111', paper: '#f2b705', accent: '#111111', accent2: '#fff6d6', dark: false },
  { id: 'sky-red', name: 'sky blue and signal red', ink: '#0a2540', paper: '#cfe8ff', accent: '#e02424', accent2: '#ffffff', dark: false },
  { id: 'charcoal-coral', name: 'charcoal and coral', ink: '#f5f1ea', paper: '#262626', accent: '#ff6f61', accent2: '#a7a29a', dark: true },
  { id: 'teal-sand', name: 'deep teal and sand', ink: '#f3e6cf', paper: '#0f4c4c', accent: '#f2a65a', accent2: '#8fd6cf', dark: true },
];

export const DESIGN_CATALOGUE: Record<Exclude<DesignPart, 'palette'>, readonly FrameEntry[]> = {
  angle: [
    { id: 'origin-place', bold: false, desktop: 'Story angle: the place it comes from; the headline names the place or the route, sections follow the product from origin to the shopper.', phone: '' },
    { id: 'process-numbers', bold: true, desktop: 'Story angle: the process told in real numbers from the brief (grams, minutes, degrees, days); the headline is a number or a measurement, sections are steps.', phone: '' },
    { id: 'ritual-time', bold: false, desktop: 'Story angle: a time of day or a ritual; the headline names a moment, sections run through the day.', phone: '' },
    { id: 'the-maker', bold: false, desktop: 'Story angle: the people who make it; the headline speaks in their voice, sections are what they do with their hands.', phone: '' },
    { id: 'product-hero', bold: true, desktop: 'Story angle: the product itself is the protagonist; the headline is the product, sections zoom into its parts and choices.', phone: '' },
    { id: 'humour', bold: true, desktop: 'Story angle: dry, warm humour; the headline is a short joke or a wink that only this business could make, sections stay useful.', phone: '' },
    { id: 'manifesto', bold: true, desktop: 'Story angle: a manifesto; the headline states a belief, sections are short numbered convictions backed by real facts.', phone: '' },
    { id: 'field-guide', bold: false, desktop: 'Story angle: helping the shopper choose; the headline names what the shopper gets, sections explain plainly how to pick between the products (never label the page a guide).', phone: '' },
    { id: 'senses', bold: false, desktop: 'Story angle: the senses; the headline is a smell, sound, taste or texture, sections are each sense.', phone: '' },
    { id: 'neighbourhood', bold: false, desktop: 'Story angle: the neighbourhood and its people; the headline names the street or the city, sections are local moments and how to pick up or receive.', phone: '' },
  ],
  structure: [
    { id: 'catalog-first', bold: false, desktop: 'Page structure: the catalog right after the hero, then one short story section, then pickup and delivery, then contact.', phone: 'On phones: the catalog first, two products per row.' },
    { id: 'story-scroll', bold: true, desktop: 'Page structure: one long story scroll of four or five chapters, each a full-width band with one idea and one photo or number, the catalog as the fourth chapter.', phone: 'On phones: one chapter per screen.' },
    { id: 'lookbook', bold: true, needs: 'photoGroup', desktop: 'Page structure: a lookbook; large photos lead in an uneven grid with short captions, the catalog follows the photos.', phone: 'On phones: photos full width, captions under each.' },
    { id: 'menu-board', bold: true, desktop: 'Page structure: a menu board; the catalog styled as a big printed menu with prices from the runtime, then a short note about the business.', phone: 'On phones: the menu as one long list.' },
    { id: 'guide-compare', bold: false, desktop: 'Page structure: a guide; a short "how to choose" section comparing the products side by side, then the catalog, then answers to real questions.', phone: 'On phones: the comparison becomes stacked cards.' },
    { id: 'magazine-issue', bold: true, desktop: 'Page structure: a magazine issue; a contents list, numbered features of different widths, a pull quote from the brief, then the catalog as the "shop" pages.', phone: 'On phones: one feature per screen with its number.' },
    { id: 'single-focus', bold: true, needs: 'product', desktop: 'Page structure: one product in focus; a long detailed section about the main product with its photo, then the rest of the catalog smaller.', phone: 'On phones: the main product first, then the list.' },
    { id: 'index-list', bold: true, desktop: 'Page structure: an index; every section is a numbered row in a long list that opens into its content, the catalog is one of the rows.', phone: 'On phones: the rows stay full width.' },
  ],
  photos: [
    { id: 'natural', bold: false, desktop: 'Photo treatment: natural colour, generous crops, no filters.', phone: '' },
    { id: 'black-white', bold: true, desktop: 'Photo treatment: every store photo in black and white (CSS grayscale), colour only from the palette.', phone: '' },
    { id: 'duotone', bold: true, desktop: "Photo treatment: duotone in the palette's ink and accent (grayscale plus a mix-blend colour layer).", phone: '' },
    { id: 'film-grain', bold: false, desktop: 'Photo treatment: slightly warm, with a fine film-grain overlay (an SVG noise layer at low opacity).', phone: '' },
    { id: 'framed-polaroid', bold: true, desktop: 'Photo treatment: photos in thick paper frames like prints, slightly rotated, never covering text.', phone: '' },
    { id: 'tight-crops', bold: true, desktop: 'Photo treatment: very tight crops on details (object-position on the interesting part), never a whole scene.', phone: '' },
    { id: 'one-per-screen', bold: true, needs: 'photos2', desktop: 'Photo treatment: one photo per screen-height band, full width, with nothing else in the band except a short caption.', phone: '' },
  ],
  button: [
    { id: 'pill', bold: false, desktop: 'Buttons: fully rounded pills; chips and quantity controls rounded too.', phone: '' },
    { id: 'block', bold: false, desktop: 'Buttons: solid blocks with square corners and generous padding.', phone: '' },
    { id: 'underline', bold: true, desktop: 'Buttons: no box at all, text with a thick underline and an arrow.', phone: '' },
    { id: 'tag', bold: true, desktop: 'Buttons: price-tag shapes with one cut corner and a small hole dot.', phone: '' },
    { id: 'stamp', bold: true, desktop: 'Buttons: rubber-stamp look, uppercase, double border, slightly rotated.', phone: '' },
    { id: 'outline', bold: false, desktop: 'Buttons: thick outlines that fill on hover.', phone: '' },
    { id: 'ghost', bold: false, desktop: 'Buttons: quiet ghost buttons, a hairline and lots of letter spacing.', phone: '' },
    { id: 'split', bold: true, desktop: 'Buttons: split in two, the label and a separate square with an arrow.', phone: '' },
    { id: 'sticker', bold: true, desktop: 'Buttons: stickers with a hard offset shadow and a small tilt.', phone: '' },
    { id: 'ticket', bold: true, desktop: 'Buttons: ticket stubs with notched ends and a dashed line.', phone: '' },
    { id: 'bubbly', bold: true, desktop: 'Buttons: soft bubbly shapes with an inner highlight.', phone: '' },
    { id: 'brutal', bold: true, desktop: 'Buttons: brutalist, thick black border, hard shadow, no radius.', phone: '' },
  ],
  hover: [
    { id: 'lift', bold: false, desktop: 'Button hover: lifts slightly with a shadow.', phone: '' },
    { id: 'fill', bold: false, desktop: 'Button hover: its edge fills inward with its own colour.', phone: '' },
    { id: 'underline-grow', bold: false, desktop: 'Button hover: an underline grows across the label.', phone: '' },
    { id: 'tilt', bold: true, desktop: 'Button hover: tilts a couple of degrees.', phone: '' },
    { id: 'shine', bold: true, desktop: 'Button hover: a light sweep crosses it.', phone: '' },
  ],
};

type DesignAllowed = { palettes?: Palette[]; button?: readonly string[]; parts?: Partial<Record<'angle' | 'structure' | 'photos' | 'hover', readonly string[]>> };
const designOptions = (part: DesignPart, available: FrameAvailable, allowed: DesignAllowed = {}): Array<{ id: string }> => {
  if (part === 'palette') return allowed.palettes?.length ? [...allowed.palettes] : [...PALETTES];
  const fitting = DESIGN_CATALOGUE[part].filter(entry => fits(entry, available));
  const only = part === 'button' ? allowed.button : allowed.parts?.[part as 'angle'];
  const narrowed = only?.length ? fitting.filter(entry => only.includes(entry.id)) : fitting;
  return narrowed.length ? narrowed : fitting;
};
/** The round-2 colour worlds plus every playbook family's palettes: what a saved draw may name. */
const allPalettes = (): Palette[] => [...PALETTES, ...Object.values(PLAYBOOK).flatMap(entry => entry.families.flatMap(family => family.palettes))];
const DESIGN_AVOID = new Set<DesignPart>(['palette', 'angle', 'structure', 'button']);

export function drawDesign(random: () => number, recent: Array<Partial<DesignDraw> & { category?: string }>, available: FrameAvailable, category: string, allowed: DesignAllowed = {}, spread = 0): DesignDraw {
  const pick = <T>(items: readonly T[]): T => items[Math.min(items.length - 1, Math.floor(random() * items.length))];
  const draw = {} as DesignDraw;
  for (const part of DESIGN_PARTS) {
    const options = designOptions(part, available, allowed);
    if (!DESIGN_AVOID.has(part)) { draw[part] = pick(options).id; continue; }
    // The same kind of business counts double: two cafés must not share a colour world while another is free.
    const weight = (item: { category?: string }) => (category && item.category === category ? 2 : 1);
    const uses = new Map(options.map(option => [option.id, recent.filter(item => item[part] === option.id).reduce((sum, item) => sum + weight(item), 0)]));
    const fewest = Math.min(...uses.values());
    draw[part] = pick(options.filter(option => uses.get(option.id)! <= fewest + spread)).id;
  }
  return draw;
}

const COLOUR_NAMES = '(?:verde|blanco|negro|rojo|azul|amarillo|rosa|rosado|morado|violeta|naranja|gris|celeste|dorado|plateado|beige|crema|turquesa|lila|fucsia|marr[oó]n)';
// "mis colores", "colores de (mi) marca", "paleta", or a colour named right after en/de color/fondo: "mi tienda en verde y blanco".
// "zapatos negros", "varios colores" and "un tono cercano" are not colour decisions.
const PALETTE_WISH = new RegExp(`(?<!\\p{L})(mis colores|colores de (mi |la )?marca|mi color|paleta)(?!\\p{L})|(?<!\\p{L})(en|de color|colou?r(es)?|fondo)\\s+${COLOUR_NAMES}(?!\\p{L})`, 'iu');
const QUOTED_NAME = /[«"“][^»"”\n]{1,80}[»"”]/gu;
const PRICED = /(?<!\p{L})(bs\.?|bob)\s*\d|\d\s*(bs|bob)(?!\p{L})/iu;
const PHOTO_PHRASE = /(?<!\p{L})(fotos?|im[aá]gen(es)?)\s+en\s+blanco y negro(?!\p{L})/giu;
const PHOTO_WISH = /(?<!\p{L})(blanco y negro|sepia)(?!\p{L})/iu;
const PHOTO_CONTEXT = /(?<!\p{L})(fotos?|im[aá]gen(es)?)(?!\p{L})/iu;
const PHOTO_FILTER = /(?<!\p{L})(filtros?|naturales|sin filtro)(?!\p{L})/iu;
const BUTTON = /(?<!\p{L})bot[oó]n(es)?(?!\p{L})/iu;
const BUTTON_SHAPE = /(?<!\p{L})(redond\w*|cuadrad\w*|p[ií]ldora|pill|bordes?|esquinas?|forma|estilo|grandes?|peque[nñ]\w*|rectangular\w*)(?!\p{L})/iu;
/** The merchant already decided: their words win over the dice for that part. When unsure, keep the draw. */
export function designOverrides(text: string): { palette: boolean; photos: boolean; button: boolean } {
  const photos = PHOTO_WISH.test(text) || (PHOTO_CONTEXT.test(text) && PHOTO_FILTER.test(text));
  // "fotos en blanco y negro" is about photos, not the store's colours; nor is a colour inside a product's name, quoted
  // or listed with its price («Flores en azul a Bs 120»).
  const colourWords = text.replace(PHOTO_PHRASE, ' ').replace(QUOTED_NAME, ' ').split(/[,;\n]|\.(?!\d)/).filter(chunk => !PRICED.test(chunk)).join(' . ');
  const palette = PALETTE_WISH.test(colourWords);
  return { palette, photos, button: BUTTON.test(text) && BUTTON_SHAPE.test(text) };
}

const paletteLine = (palette: Palette) => `Colour world: ${palette.name}, ${palette.dark ? 'a dark page' : 'a light page'}: background ${palette.paper}, text ${palette.ink}, accent ${palette.accent}, second accent ${palette.accent2}. Do not take colours from the photos; style the photos to sit in this world.`;

export function plannerDirection(draw: Partial<DesignDraw>, omit: Partial<Record<DesignPart, boolean>> = {}, playbook = false): string {
  const angle = !omit.angle && DESIGN_CATALOGUE.angle.find(entry => entry.id === draw.angle);
  const palette = !omit.palette && allPalettes().find(entry => entry.id === draw.palette);
  if (!angle && !palette) return '';
  return [`DRAWN FOR THIS STORE (build every concept on it; ${playbook ? 'fonts from the PLAYBOOK family pairings' : 'choose fonts freely'}):`, ...(angle ? [angle.desktop] : []), ...(palette ? [paletteLine(palette)] : [])].join(' ');
}

const luminance = (hex: string) => { const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const ratio = (a: string, b: string) => { const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
/** A hex `amount` of the way from `to` towards `from`: the platform's panels sit a shade off the page, never on an accent. */
const mix = (from: string, to: string, amount: number) => '#' + [1, 3, 5].map(i => Math.round(parseInt(from.slice(i, i + 2), 16) * amount + parseInt(to.slice(i, i + 2), 16) * (1 - amount)).toString(16).padStart(2, '0')).join('');
const DRAWN_BLOCK = /\/\* Drawn colour world[^*]*\*\/\n:root \{[^}]*\}\n/g;
/** brand.css: confirmed colours win; otherwise the drawn colour world (fresh draw, or kept by an edit); a run with neither
 *  keeps the previous file minus any stale drawn block. */
export function designBrandCss(input: { palette?: Palette; brandColours: boolean; confirmedCss: string; brandRevision: number; previousBrand?: string }): string {
  if (input.palette && !input.brandColours) return `${paletteBrandCss(input.palette)}${input.confirmedCss}`;
  if (input.brandRevision > 0) return input.confirmedCss || '/* No confirmed visual tokens. */\n';
  return (input.previousBrand || '').replace(DRAWN_BLOCK, '');
}

export function paletteBrandCss(palette: Palette): string {
  const onAccent = [palette.ink, palette.paper, '#111111', '#ffffff'].sort((a, b) => ratio(b, palette.accent) - ratio(a, palette.accent))[0];
  return `/* Drawn colour world (spec 2026-10-10 design draw round 2): ${palette.name}. */\n:root {\n  --brand-background: ${palette.paper};\n  --brand-foreground: ${palette.ink};\n  --brand-accent: ${palette.accent};\n  --brand-accent-foreground: ${onAccent};\n  --brand-surface: ${mix(palette.ink, palette.paper, 0.06)};\n}\n`;
}

export function designCategory(brief: unknown): string {
  const value = brief && typeof brief === 'object' ? (brief as { businessType?: unknown }).businessType : undefined;
  return typeof value === 'string' ? value.trim().toLowerCase().slice(0, 40) : '';
}
