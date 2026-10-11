/**
 * The frame and hero draw (spec docs/superpowers/specs/2026-10-10-frame-hero-draw-design.md). The model cannot be
 * random: given the same kind of brief it lands on the same header every time. The platform rolls these four parts
 * per new store or redesign, avoiding what recent stores got, and YAPI builds them in the store's own language.
 */
export type FrameNeed = 'photos1' | 'photos2' | 'photos3' | 'product' | 'facts';
export type FrameEntry = { id: string; bold: boolean; desktop: string; phone: string; needs?: FrameNeed };
export type FramePart = 'header' | 'cart' | 'footer' | 'hero';
export type FrameDraw = Record<FramePart, string>;
export type FrameAvailable = { photos: number; products: number; facts: boolean };

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
    { id: 'collage', bold: true, needs: 'photos3', desktop: 'Hero: three or more photos arranged as an overlapping collage with the headline set among them.', phone: 'On phones: two photos overlap above the headline and the rest are left out.' },
    { id: 'single-product', bold: false, needs: 'product', desktop: 'Hero: one real product from the catalog as the hero, its photo large with its name, price and a button to its product page.', phone: 'On phones: the product photo, name, price and button stacked.' },
    { id: 'statement-strip', bold: true, needs: 'photos3', desktop: 'Hero: one statement in very large type, then a horizontal strip of photos below it.', phone: 'On phones: the photo strip scrolls sideways.' },
    { id: 'offset-frame', bold: true, needs: 'photos1', desktop: "Hero: a single photo inside a visible frame or border, with the headline placed offset so it overlaps the frame's edge.", phone: 'On phones: the frame narrows and the headline overlaps its bottom edge.' },
    { id: 'slow-slideshow', bold: false, needs: 'photos2', desktop: 'Hero: two or more photos cross-fading slowly (about 6 seconds each) behind a fixed headline, paused on hover and under prefers-reduced-motion.', phone: 'On phones: the same, showing a single photo under reduced motion.' },
  ],
};

const fits = (entry: FrameEntry, available: FrameAvailable) => {
  switch (entry.needs) {
    case 'photos1': return available.photos >= 1;
    case 'photos2': return available.photos >= 2;
    case 'photos3': return available.photos >= 3;
    case 'product': return available.products >= 1;
    case 'facts': return available.facts;
    default: return true;
  }
};

export function drawFrame(random: () => number, recent: Partial<FrameDraw>[], available: FrameAvailable): FrameDraw {
  const pick = <T>(items: readonly T[]): T => items[Math.min(items.length - 1, Math.floor(random() * items.length))];
  const draw = {} as FrameDraw;
  for (const part of PARTS) {
    const options = FRAME_CATALOGUE[part].filter(entry => fits(entry, available));
    if (part === 'cart' || part === 'footer') { draw[part] = pick(options).id; continue; }
    const uses = new Map(options.map(entry => [entry.id, recent.filter(item => item[part] === entry.id).length]));
    const fewest = Math.min(...uses.values());
    draw[part] = pick(options.filter(entry => uses.get(entry.id) === fewest)).id;
  }
  return draw;
}

export function frameDirection(draw: Partial<FrameDraw>, omit: Partial<Record<FramePart, boolean>> = {}): string {
  const lines = PARTS.flatMap(part => {
    const entry = !omit[part] && FRAME_CATALOGUE[part].find(item => item.id === draw[part]);
    return entry ? [`- ${entry.desktop} ${entry.phone}`] : [];
  });
  if (!lines.length) return '';
  return ["FRAME AND HERO: This store's frame was drawn for it so stores never repeat each other. Build exactly this structure and style it entirely in the store's own language; type, colour, spacing and motion are yours.", ...lines, 'Before finishing, compare your desktop and phone screenshots with this list and fix any part that does not match.'].join('\n');
}

// \b treats accented letters as non-word characters, so "menú" would never match; whole words via letter lookarounds.
const HEADER_WORDS = /(?<!\p{L})(logo|logotipo|cabecera|encabezado|header|men[uú]|navegaci[oó]n)(?!\p{L})/iu;
const PLACE_WORDS = /(?<!\p{L})(centrad[oa]|centro|izquierda|derecha|lateral|arriba|abajo|fij[oa]|sticky|flotante)(?!\p{L})/iu;
const HERO_WORDS = /(?<!\p{L})(portada|hero|primera pantalla|banner principal)(?!\p{L})/iu;
/** The merchant already decided: their words win over the dice for that part. When unsure, keep the draw. */
export function frameOverrides(text: string): { header: boolean; hero: boolean } {
  return { header: HEADER_WORDS.test(text) && PLACE_WORDS.test(text), hero: HERO_WORDS.test(text) };
}

export function parseFrameDraw(content: unknown): Partial<FrameDraw> {
  let value: unknown;
  try { value = typeof content === 'string' ? JSON.parse(content) : undefined; } catch { return {}; }
  if (!value || typeof value !== 'object') return {};
  const out: Partial<FrameDraw> = {};
  for (const part of PARTS) {
    const id = (value as Record<string, unknown>)[part];
    if (typeof id === 'string' && FRAME_CATALOGUE[part].some(entry => entry.id === id)) out[part] = id;
  }
  return out;
}

/** What one generation gets. Fresh designs draw and save; edits carry the saved file without re-sending the
 *  paragraph (the saved code already embodies it); the flag off changes nothing. */
export function frameForRun(input: { enabled: boolean; fresh: boolean; previous: Array<{ path: string; content: string }>; recent: Partial<FrameDraw>[]; available: FrameAvailable; request: string; random?: () => number }): { file?: { path: string; content: string }; paragraph: string } {
  if (!input.enabled) return { paragraph: '' };
  if (!input.fresh) {
    const saved = input.previous.find(file => file.path === FRAME_DRAW_FILE);
    return saved ? { file: saved, paragraph: '' } : { paragraph: '' };
  }
  const draw = drawFrame(input.random ?? Math.random, input.recent, input.available);
  return { file: { path: FRAME_DRAW_FILE, content: JSON.stringify(draw, null, 2) + '\n' }, paragraph: frameDirection(draw, frameOverrides(input.request)) };
}
