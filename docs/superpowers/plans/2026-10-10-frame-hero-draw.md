# Frame and Hero Draw Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every new store or redesign gets a platform-drawn header, cart/account style, footer and hero, never repeating a recent store's header or hero, which YAPI builds in the store's own style.

**Architecture:** A pure module `design-engine/frame-draw.ts` holds the catalogue, the seeded draw, the prompt paragraph, the merchant-override check and a `frameForRun` helper that decides what a run gets. The Sep-5 author prompt and the agent builder instructions accept the paragraph; the generation service computes it once, saves `frame-draw.json` with the store and carries it across edits. A projects-service query supplies the last 6 other stores' draws.

**Tech Stack:** NestJS + Prisma (apps/api), jest. No Studio or kit changes.

**Spec:** `docs/superpowers/specs/2026-10-10-frame-hero-draw-design.md`

## Global Constraints

- Lists and sizes: header 10, cart 6, footer 6, hero 8; ids exactly as in the spec.
- Header and hero never repeat an id used by the 6 most recent other stores (last 30 days) while a free id exists; otherwise least-used. Cart and footer are uniform, no repeat rule.
- Every header entry's phone line keeps the cart and the menu within one tap; store name links home; Buscar and Mi cuenta reachable.
- No entry may invent facts: no "envío gratis", discounts or deadlines; the info bar uses a real brief fact only.
- `YAPI_FRAME_DRAW=off` → no draw, no file, every prompt byte-identical to today. Default on.
- `sep5AuthorPrompt` without `frame` (or blank) must stay byte-identical (existing pin tests in `sep5-author.spec.ts`).
- Draws only for a new store or full redesign; never blocks a build (failed history query → draw without history).
- **Never run `prisma migrate` (no schema change here) and never run a generation from a subagent** — the live check is main-session only and needs the owner's OK.
- Never `git stash`, `checkout` or `reset` in `/Users/saramia/pagosYa`: the owner's `pnpm dev` reads the working tree.
- Run API tests from `apps/api` with `npx jest <path>`.

## Review Focus

1. A store with no photos (empty catalogue, brand-new merchant) must never be told to build a collage, slideshow, photo strip, photo hero or product hero → test in Task 1.
2. A merchant instruction that names the header or hero ("logo centrado", "pon el menú a la izquierda", "sin foto en la portada") must remove that part of the draw — and a business brief that merely mentions a "menú" or "el centro" must not → Task 1 tests the words (accents included); Task 4 passes only the instruction, never the brief.
3. A garbage or hand-edited `frame-draw.json` (unknown ids, invalid JSON, wrong types) must yield no paragraph and no throw → tests in Tasks 1 and 4.
4. An ordinary edit must keep the store's saved `frame-draw.json` (otherwise the history used to avoid repeats silently empties) → test in Task 1 (`frameForRun` carries it) and Task 4 (file in the save list).
5. With the flag off, nothing about prompts or saved files changes → tests in Tasks 1, 2 and 3.

## Spec deviations decided while planning (also written into the spec)

- Edits carry `frame-draw.json` forward unchanged but do **not** resend the paragraph: the saved code already embodies the frame, and repeating "build exactly this structure" on a small edit invites YAPI to rebuild the header.
- `full-bleed`, `split` and `offset-frame` heroes need at least one photo (`needs: 'photos1'`); the spec listed needs only for the multi-photo entries.
- The self-review check is a sentence in the Sep-5 SELF-REVIEW prompt; the agent builder gets it as the last line of the paragraph itself (its protocol already screenshots at 1280 and 390).

---

### Task 1: The catalogue, the draw and the run decision

**Files:**
- Create: `apps/api/src/storefront-source/design-engine/frame-draw.ts`
- Test: `apps/api/src/storefront-source/design-engine/frame-draw.spec.ts`

**Interfaces:**
- Produces:
  - `type FrameNeed = 'photos1' | 'photos2' | 'photos3' | 'product' | 'facts'`
  - `type FrameEntry = { id: string; bold: boolean; desktop: string; phone: string; needs?: FrameNeed }`
  - `type FramePart = 'header' | 'cart' | 'footer' | 'hero'`
  - `type FrameDraw = Record<FramePart, string>`
  - `type FrameAvailable = { photos: number; products: number; facts: boolean }`
  - `const FRAME_CATALOGUE: Record<FramePart, readonly FrameEntry[]>`
  - `const FRAME_DRAW_FILE = 'frame-draw.json'`
  - `function drawFrame(random: () => number, recent: Partial<FrameDraw>[], available: FrameAvailable): FrameDraw`
  - `function frameDirection(draw: Partial<FrameDraw>, omit?: Partial<Record<FramePart, boolean>>): string` ('' when nothing to say)
  - `function frameOverrides(text: string): { header: boolean; hero: boolean }`
  - `function parseFrameDraw(content: unknown): Partial<FrameDraw>`
  - `function frameForRun(input: { enabled: boolean; fresh: boolean; previous: Array<{ path: string; content: string }>; recent: Partial<FrameDraw>[]; available: FrameAvailable; request: string; random?: () => number }): { file?: { path: string; content: string }; paragraph: string }`

- [ ] **Step 1: Write the failing tests** — `frame-draw.spec.ts`:

```ts
import { drawFrame, frameDirection, frameForRun, frameOverrides, parseFrameDraw, FRAME_CATALOGUE, FRAME_DRAW_FILE, type FrameAvailable } from './frame-draw';

const seeded = (seed: number) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const rich: FrameAvailable = { photos: 9, products: 9, facts: true };
const ids = (part: keyof typeof FRAME_CATALOGUE) => FRAME_CATALOGUE[part].map(entry => entry.id);

it('has the agreed catalogue sizes and every entry says something for desktop and phone', () => {
  expect([FRAME_CATALOGUE.header.length, FRAME_CATALOGUE.cart.length, FRAME_CATALOGUE.footer.length, FRAME_CATALOGUE.hero.length]).toEqual([10, 6, 6, 8]);
  for (const entry of Object.values(FRAME_CATALOGUE).flat()) {
    expect(entry.desktop.trim().length).toBeGreaterThan(20);
    expect(entry.phone.trim().length).toBeGreaterThan(10);
  }
  expect(FRAME_CATALOGUE.header.filter(entry => entry.bold)).toHaveLength(5);
  for (const entry of FRAME_CATALOGUE.header) {
    expect(entry.phone).toMatch(/cart/i);
    expect(entry.phone).toMatch(/menu|navigation/i);
  }
  expect(JSON.stringify(FRAME_CATALOGUE)).not.toMatch(/env[ií]o gratis|free shipping|discount/i);
});

it('draws one valid id per part and is repeatable with a seed', () => {
  const draw = drawFrame(seeded(7), [], rich);
  expect(ids('header')).toContain(draw.header);
  expect(ids('cart')).toContain(draw.cart);
  expect(ids('footer')).toContain(draw.footer);
  expect(ids('hero')).toContain(draw.hero);
  expect(drawFrame(seeded(7), [], rich)).toEqual(draw);
});

it('never repeats a recent header or hero while a free one exists, else takes the least used', () => {
  const headers = ids('header'), heroes = ids('hero');
  const recent = headers.slice(0, 9).map((header, i) => ({ header, hero: heroes[i % 7] }));
  for (let seed = 1; seed < 40; seed++) {
    const draw = drawFrame(seeded(seed), recent, rich);
    expect(draw.header).toBe(headers[9]);
    expect(draw.hero).toBe(heroes[7]);
  }
  const all = [...headers, headers[0], headers[1]].map(header => ({ header }));
  for (let seed = 1; seed < 20; seed++) expect(headers.slice(2)).toContain(drawFrame(seeded(seed), all, rich).header);
});

it('never asks a store for photos, a product or facts it does not have', () => {
  const bare: FrameAvailable = { photos: 0, products: 0, facts: false };
  for (let seed = 1; seed < 200; seed++) {
    const draw = drawFrame(seeded(seed), [], bare);
    expect(['collage', 'statement-strip', 'slow-slideshow', 'single-product', 'full-bleed', 'split', 'offset-frame']).not.toContain(draw.hero);
    expect(draw.footer).not.toBe('photo-echo');
    expect(draw.header).not.toBe('info-bar');
  }
});

it('writes one paragraph from the draw and drops the parts the merchant decided', () => {
  const draw = { header: 'wordmark-band', cart: 'own-word', footer: 'statement-band', hero: 'type-only' };
  const text = frameDirection(draw);
  expect(text.startsWith('FRAME AND HERO:')).toBe(true);
  for (const part of ['header', 'cart', 'footer', 'hero'] as const) expect(text).toContain(FRAME_CATALOGUE[part].find(entry => entry.id === draw[part])!.desktop);
  expect(frameDirection(draw, { header: true })).not.toContain(FRAME_CATALOGUE.header.find(entry => entry.id === 'wordmark-band')!.desktop);
  expect(frameDirection({})).toBe('');
  expect(frameOverrides('Quiero el logo centrado arriba')).toEqual({ header: true, hero: false });
  expect(frameOverrides('sin foto en la portada')).toEqual({ header: false, hero: true });
  expect(frameOverrides('Hazme una tienda de café')).toEqual({ header: false, hero: false });
  expect(frameOverrides('pon el menú a la izquierda')).toEqual({ header: true, hero: false });
});

it('reads a saved draw defensively', () => {
  expect(parseFrameDraw(JSON.stringify({ header: 'side-rail', cart: 'nope', hero: 3 }))).toEqual({ header: 'side-rail' });
  expect(parseFrameDraw('not json')).toEqual({});
  expect(parseFrameDraw(undefined)).toEqual({});
});

it('decides what a run gets: fresh draws and saves, edits carry the file, off does nothing', () => {
  const recent = [{ header: 'side-rail' }];
  const fresh = frameForRun({ enabled: true, fresh: true, previous: [], recent, available: rich, request: 'Hazme la tienda', random: seeded(3) });
  expect(fresh.file?.path).toBe(FRAME_DRAW_FILE);
  expect(parseFrameDraw(fresh.file!.content).header).not.toBe('side-rail');
  expect(fresh.paragraph.startsWith('FRAME AND HERO:')).toBe(true);
  const saved = { path: FRAME_DRAW_FILE, content: JSON.stringify({ header: 'overlay', cart: 'icon-dot', footer: 'quiet-line', hero: 'split' }) };
  expect(frameForRun({ enabled: true, fresh: false, previous: [saved], recent, available: rich, request: 'cambia el título' })).toEqual({ file: saved, paragraph: '' });
  expect(frameForRun({ enabled: true, fresh: false, previous: [], recent, available: rich, request: 'x' })).toEqual({ paragraph: '' });
  expect(frameForRun({ enabled: false, fresh: true, previous: [saved], recent, available: rich, request: 'x' })).toEqual({ paragraph: '' });
  expect(frameForRun({ enabled: true, fresh: true, previous: [], recent, available: rich, request: 'logo centrado', random: seeded(3) }).paragraph).not.toMatch(/^- Header/m);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd apps/api && npx jest src/storefront-source/design-engine/frame-draw.spec.ts`
Expected: FAIL — `Cannot find module './frame-draw'`.

- [ ] **Step 3: Implement** — `frame-draw.ts`:

```ts
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
```

- [ ] **Step 4: Run the tests**

Run: `cd apps/api && npx jest src/storefront-source/design-engine/frame-draw.spec.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/storefront-source/design-engine/frame-draw.ts apps/api/src/storefront-source/design-engine/frame-draw.spec.ts
git commit -m "feat(yapi): frame and hero catalogue and draw — 10 headers, 6 carts, 6 footers, 8 heroes, no repeat of recent stores"
```

---

### Task 2: The Sep-5 author builds the drawn frame

**Files:**
- Modify: `apps/api/src/storefront-source/design-engine/sep5-author.ts` (input type ~lines 36-56, the returned array ~lines 67-71, after `SEP5_STORE_SHELL` ~line 115, `sep5ReviewPrompt` ~line 122)
- Test: `apps/api/src/storefront-source/design-engine/sep5-author.spec.ts`

**Interfaces:**
- Consumes: a paragraph string (from Task 1's `frameDirection`; this task only needs a string).
- Produces: `sep5AuthorPrompt({ …, frame?: string })`; `export const SEP5_STORE_SHELL_FRAMED: string`.

- [ ] **Step 1: Write the failing tests** (append to `sep5-author.spec.ts`; add `SEP5_STORE_SHELL_FRAMED` to the existing import from `./sep5-author`, and `sep5ReviewPrompt` if not already imported):

```ts
// Spec 2026-10-10 frame and hero draw: the ordered shell made every header identical.
it('builds the drawn frame instead of the ordered shell, and stays byte-identical without one', () => {
  const base = { brief: {}, instruction: 'Hazme la tienda', data: {}, assetLegend: [] };
  const frame = 'FRAME AND HERO: test frame\n- Header: giant wordmark.';
  const framed = sep5AuthorPrompt({ ...base, storeShell: true, frame, motionPlan: 'MOTION CHOREOGRAPHY: subtle.' });
  expect(framed).toContain(frame);
  expect(framed).toContain(SEP5_STORE_SHELL_FRAMED);
  expect(framed).not.toContain(SEP5_STORE_SHELL);
  expect(framed.indexOf(frame)).toBeLessThan(framed.indexOf('MOTION CHOREOGRAPHY'));
  expect(SEP5_STORE_SHELL_FRAMED).toContain('href="buscar.html"');
  expect(SEP5_STORE_SHELL_FRAMED).toContain('data-pagosya-account="login"');
  expect(SEP5_STORE_SHELL_FRAMED).toContain('[data-cart-count]');
  expect(SEP5_STORE_SHELL_FRAMED).toContain('data-pagosya-pages');
  expect(sep5AuthorPrompt({ ...base, storeShell: true, frame: '  ' })).toBe(sep5AuthorPrompt({ ...base, storeShell: true }));
  expect(sep5AuthorPrompt({ ...base, frame: '  ' })).toBe(sep5AuthorPrompt(base));
});

it('asks the self-review to check the drawn frame only when there is one', () => {
  const input = { brief: {}, instruction: 'Hazme la tienda', data: {}, assetLegend: [], storeShell: true, draft: [], measured: [] };
  expect(sep5ReviewPrompt({ ...input, frame: 'FRAME AND HERO: x' })).toMatch(/header and hero match FRAME AND HERO/);
  expect(sep5ReviewPrompt(input)).not.toMatch(/FRAME AND HERO/);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd apps/api && npx jest src/storefront-source/design-engine/sep5-author.spec.ts`
Expected: FAIL — `SEP5_STORE_SHELL_FRAMED` is not exported.

- [ ] **Step 3: Implement**

In the input type, after `fonts?: string;`:
```ts
  /** The drawn frame and hero (frameDirection, spec 2026-10-10). With it, the shell lists requirements only, not
   *  an order, so headers stop repeating. Absent or blank, the prompt stays byte-identical. */
  frame?: string;
```
In the returned array, replace `...(input.storeShell ? [SEP5_STORE_SHELL] : []),` with:
```ts
    ...(input.storeShell ? [input.frame?.trim() ? SEP5_STORE_SHELL_FRAMED : SEP5_STORE_SHELL] : []),
    ...(input.frame?.trim() ? [input.frame.trim()] : []),
```
After `SEP5_STORE_SHELL`, add:
```ts
/** The shell's requirements without an order or shape: where each part sits comes from FRAME AND HERO. */
export const SEP5_STORE_SHELL_FRAMED = 'STORE SHELL: Every page shares one header that must contain a link to index.html with the store name, the primary navigation, a search link <a href="buscar.html">Buscar</a>, an account link <a href="#" data-pagosya-account="login">Mi cuenta</a>, and a cart button containing [data-cart-count]. Where they sit and how they look comes from FRAME AND HERO below. An icon may stand in for a word only with an accessible label. The footer contains <nav data-pagosya-pages aria-label="Información" hidden></nav>, which the runtime fills with the store\'s information pages. pages/ paths use ../ for these links too.';
```
In `sep5ReviewPrompt`, add before the `return`:
```ts
  const frameCheck = input.frame?.trim() ? 'Check that the header and hero match FRAME AND HERO at both widths; rebuild whichever does not. ' : '';
```
and change the start of the final paragraph from `Fix what is wrong and keep what works` to `${frameCheck}Fix what is wrong and keep what works` (rest of that sentence unchanged).

- [ ] **Step 4: Run the tests**

Run: `cd apps/api && npx jest src/storefront-source/design-engine/sep5-author.spec.ts`
Expected: PASS, including every existing pin test.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/storefront-source/design-engine/sep5-author.ts apps/api/src/storefront-source/design-engine/sep5-author.spec.ts
git commit -m "feat(yapi): the Sep-5 author builds the drawn frame — the shell lists what a header needs, not its order; self-review checks it"
```

---

### Task 3: The agent builder receives the same paragraph

**Files:**
- Modify: `apps/api/src/storefront-source/agent/agent-prompt.ts:21-23` (`agentInstructions`)
- Test: `apps/api/src/storefront-source/agent/agent-prompt.spec.ts`

**Interfaces:**
- Produces: `agentInstructions(stablePrompt, sitePurpose, isNew, creative = isNew, minutes = 6, signature = true, frame = '')`.

- [ ] **Step 1: Write the failing test** (append to `agent-prompt.spec.ts`; reuse its existing `agentInstructions` import):

```ts
it('gives a fresh design the drawn frame and leaves everything else untouched', () => {
  const frame = 'FRAME AND HERO: test\n- Header: side rail.';
  const framed = agentInstructions('STABLE', 'shop', true, true, 6, true, frame);
  expect(framed).toContain(frame);
  expect(framed.indexOf(frame)).toBeLessThan(framed.indexOf('AGENT PROTOCOL'));
  expect(agentInstructions('STABLE', 'shop', true, true, 6, true, '')).toBe(agentInstructions('STABLE', 'shop', true, true, 6, true));
  expect(agentInstructions('STABLE', 'shop', false, false, 6, true, frame)).not.toContain(frame);
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd apps/api && npx jest src/storefront-source/agent/agent-prompt.spec.ts -t "drawn frame"`
Expected: FAIL — the paragraph is not in the instructions.

- [ ] **Step 3: Implement** — change the signature and the line after `${stablePrompt}`:

```ts
export function agentInstructions(stablePrompt: string, sitePurpose: SourceSitePurpose, isNew: boolean, creative = isNew, minutes = 6, signature = true, frame = '') {
  return `${stablePrompt}
${creative ? storefrontDirection(sitePurpose, signature) : ''}${creative && frame.trim() ? `\n${frame.trim()}` : ''}
AGENT PROTOCOL. You work with tools on a private draft …`
```
(Only the signature and the `${creative ? …}` line change; everything from `AGENT PROTOCOL.` onward stays exactly as it is.)

- [ ] **Step 4: Run the tests**

Run: `cd apps/api && npx jest src/storefront-source/agent/agent-prompt.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/storefront-source/agent/agent-prompt.ts apps/api/src/storefront-source/agent/agent-prompt.spec.ts
git commit -m "feat(yapi): the agent builder receives the drawn frame on new stores and redesigns"
```

---

### Task 4: Flag, recent draws and the generation wiring

**Files:**
- Modify: `apps/api/src/config/configuration.ts` (type next to `yapiSignature` ~line 81, value next to `yapiSignature:` ~line 401)
- Modify: `apps/api/src/storefront-source/source-projects.service.ts` (new method after `recentCompositionFingerprints`)
- Modify: `apps/api/src/storefront-source/source-generation.service.ts` (after the `agentEngine` declaration ~line 465; `authorInput` ~line 832; the `agentInstructions(` call ~line 1249; `saveInput` files ~line 1441)
- Test: `apps/api/src/storefront-source/source-projects.service.spec.ts`

**Interfaces:**
- Consumes: `frameForRun`, `parseFrameDraw`, `FRAME_DRAW_FILE`, `FrameDraw` (Task 1); `sep5AuthorPrompt({ frame })` (Task 2); `agentInstructions(…, frame)` (Task 3).
- Produces: `app.yapiFrameDraw: boolean`; `SourceProjectsService.recentFrameDraws(storeId: string, now?: Date): Promise<Partial<FrameDraw>[]>`.

- [ ] **Step 1: Write the failing test** (append to `source-projects.service.spec.ts`; it already defines `setup()` returning `{ service, prisma }`):

```ts
describe('recent frame draws', () => {
  it('reads only the small frame file of the six latest other stores and drops garbage', async () => {
    const { service, prisma } = setup();
    prisma.$queryRaw = jest.fn().mockResolvedValue([
      { content: JSON.stringify({ header: 'side-rail', hero: 'collage' }) },
      { content: 'not json' },
      { content: JSON.stringify({ header: 'made-up' }) },
    ]);
    expect(await service.recentFrameDraws('s1', new Date('2026-10-10T12:00:00Z'))).toEqual([{ header: 'side-rail', hero: 'collage' }]);
    const query = prisma.$queryRaw.mock.calls[0][0];
    expect(query.text).toContain('DISTINCT ON');
    expect(query.text).toContain('jsonb_array_elements');
    expect(query.text).toContain('LIMIT 6');
    expect(query.values).toContain('s1');
    expect(query.values).toContain('frame-draw.json');
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd apps/api && npx jest src/storefront-source/source-projects.service.spec.ts -t "recent frame draws"`
Expected: FAIL — `service.recentFrameDraws is not a function`.

- [ ] **Step 3: Implement**

`configuration.ts` — in the config type next to `yapiSignature: boolean;`:
```ts
  /** Frame and hero draw (spec 2026-10-10): the platform rolls header, cart, footer and hero per new store or
   *  redesign. Default on; YAPI_FRAME_DRAW=off returns to the previous prompts and saves no frame-draw.json. */
  yapiFrameDraw: boolean;
```
and next to `yapiSignature: process.env.YAPI_SIGNATURE !== 'off',`:
```ts
    yapiFrameDraw: process.env.YAPI_FRAME_DRAW !== 'off',
```

`source-projects.service.ts` — add `import { FRAME_DRAW_FILE, parseFrameDraw, type FrameDraw } from './design-engine/frame-draw';` and, after `recentCompositionFingerprints`:
```ts
  /** The frame draws of the six most recent other stores (30 days), read server-side so no bundled photo bytes travel. */
  async recentFrameDraws(storeId: string, now = new Date()): Promise<Partial<FrameDraw>[]> {
    const since = new Date(now.getTime() - 30 * 86_400_000);
    const rows = await this.prisma.$queryRaw<Array<{ content: string }>>(Prisma.sql`
      WITH latest AS (
        SELECT DISTINCT ON (v."storeId") v."storeId", v.revision, v."createdAt"
        FROM "StoreSourceVersion" v
        WHERE v."storeId" <> ${storeId} AND v."createdAt" >= ${since}
        ORDER BY v."storeId", v."createdAt" DESC
      ), top AS (SELECT * FROM latest ORDER BY "createdAt" DESC LIMIT 6)
      SELECT f->>'content' AS content
      FROM top JOIN "StoreSourceVersion" v ON v."storeId" = top."storeId" AND v.revision = top.revision,
      LATERAL jsonb_array_elements(v.snapshot->'files') f
      WHERE f->>'path' = ${FRAME_DRAW_FILE}
    `);
    return rows.map(row => parseFrameDraw(row.content)).filter(draw => Object.keys(draw).length > 0);
  }
```

`source-generation.service.ts`:
1. Add `import { frameForRun } from './design-engine/frame-draw';`.
2. Directly after the line that declares `agentEngine` (~line 465; `sep5Author` is declared just above it, and `data`, `assetLegend`, `previous`, `redesign`, `previousFiles` and `storeId` are all in scope there), add:
```ts
    // Spec 2026-10-10: the platform rolls the frame and hero; the model alone always lands on one header.
    const frameFresh = (sep5Author || agentEngine) && (!previous || redesign);
    const frame = frameForRun({
      enabled: this.config.get<boolean>('app.yapiFrameDraw') === true,
      fresh: frameFresh,
      previous: previousFiles,
      recent: frameFresh ? await this.projects.recentFrameDraws(storeId).catch(() => []) : [],
      available: {
        photos: assetLegend.filter(asset => !sourceVideo(asset.path)).length,
        products: data.items.filter(item => item.imageUrls?.length).length,
        facts: Boolean((data as { locations?: unknown[] }).locations?.length) || (typeof (dto.brief as { businessInformation?: unknown } | undefined)?.businessInformation === 'string' && String((dto.brief as { businessInformation?: unknown }).businessInformation).trim().length > 0),
      },
      // The merchant's own instruction only: a brief like "menú del día, en el centro" is not a header request.
      request: dto.instruction,
    });
```
3. In `authorInput` (~line 832) add `frame: frame.paragraph,` to the object.
4. In the `agentInstructions(` call (~line 1249), pass `frame.paragraph` as a new 7th argument right after `signatureOn`.
5. In `saveInput.files` (~line 1441), after `...(websiteDesignFile ? [websiteDesignFile] : []),` add `...(frame.file ? [frame.file] : []),`.

- [ ] **Step 4: Run the tests and the type check**

Run: `cd apps/api && npx jest src/storefront-source/source-projects.service.spec.ts src/storefront-source/design-engine src/storefront-source/agent/agent-prompt.spec.ts --testTimeout=120000 && npx tsc --noEmit -p tsconfig.json`
Expected: PASS, tsc exit 0. Then run `npx jest src/storefront-source/source-generation.service.spec.ts src/storefront-source/source-generation-agent.spec.ts --testTimeout=120000` and report any failure with its output (do not stash to compare; the owner's dev servers read the working tree).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/config/configuration.ts apps/api/src/storefront-source/source-projects.service.ts apps/api/src/storefront-source/source-projects.service.spec.ts apps/api/src/storefront-source/source-generation.service.ts
git commit -m "feat(yapi): new stores and redesigns draw their frame and hero, avoiding the last six stores; edits keep frame-draw.json; YAPI_FRAME_DRAW=off"
```

---

### Task 5: Live check (main session only, with the owner's OK)

**Files:** none (verification); memory update.

- [ ] **Step 1: Ask the owner** — three generations spend their ChatGPT plan (about 10 minutes each). Do not start without a yes.
- [ ] **Step 2: Confirm the API is current** — the owner's `pnpm dev` recompiles; check the process on port 3001 started after the last commit (`ps -o etime= -p $(lsof -tiTCP:3001 -sTCP:LISTEN)`).
- [ ] **Step 3: Generate three stores from one brief** in the Studio (Crear una tienda, the same business text each time). After each, read `frame-draw.json` from that store's latest `StoreSourceVersion` (node + Prisma from `apps/api`, read-only).
- [ ] **Step 4: Check** — three different headers and three different heroes in the draws; screenshots at 1280 and 390 show those structures; on 390 px each has a reachable cart, Buscar and Mi cuenta (open the menu if they live there). Re-run the header table query from the spec over all stores.
- [ ] **Step 5: Record** — update `project_yapi_superbot_design.md` in memory with what the three stores showed and which parts YAPI followed.
