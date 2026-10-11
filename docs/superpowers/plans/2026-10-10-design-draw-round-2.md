# Design Draw Round 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Each new store or redesign also rolls a colour world, story angle, page structure, photo treatment and button style + hover, so two stores in the same business stop looking alike; YAPI's self-review flags emoji decoration, fake circular text and overlapping text.

**Architecture:** `design-engine/frame-draw.ts` gains the five catalogues, `drawDesign`, `designOverrides`, a planner sentence and a palette → `brand.css` helper; `frameForRun` returns them alongside the frame. The generation service passes the planner sentence into the concept planner's context, writes the drawn button/hover into the runtime DNA and the palette into `brand.css` when the merchant has no confirmed colours. The Sep-5 review capture measures three new facts.

**Tech Stack:** NestJS (apps/api), jest, Playwright inside `withVisualSandbox` (review capture).

**Spec:** `docs/superpowers/specs/2026-10-10-design-draw-round-2-design.md`

## Global Constraints

- Catalogue sizes: palette 14, angle 10, structure 8, photos 7, button 12, hover 5. Button ids are exactly the kit's `data-dna-button` forms; hover ids are the kit's `data-dna-hover` values minus `invert`.
- Every palette ink/paper pair ≥ 4.5:1 (measured: lowest 7.66). No brown ink on a cream paper.
- Repeat avoidance for palette, angle, structure, button; a recent draw with the same `category` counts twice. Photos and hover uniform.
- Photo treatment never applies to catalogue photos inside the platform product page.
- Confirmed merchant brand colours always win over the drawn palette; merchant words win over any drawn part.
- `YAPI_DESIGN_DRAW=off` → none of the five parts, no DNA/brand.css change, prompts as after round 1. Default on.
- Round-1 tests stay green unchanged (`frame-draw.spec.ts`, `sep5-author.spec.ts`, `agent-prompt.spec.ts`).
- Never run a generation or `git stash/checkout/reset` from a subagent; the owner's `pnpm dev` reads the working tree.
- Run API tests from `apps/api` with `npx jest <path>`. `brand-profile.spec.ts` and `sep5-review-capture.spec.ts` already exist: append, merging imports.

## Review Focus

1. A merchant with confirmed brand colours must keep them: the drawn palette never overwrites `brand.css` colours → test in Task 2 (`brandHasColours`) plus the tokenCss order.
2. An ordinary edit must not re-roll or change DNA/brand.css (only fresh designs draw) → round-1 `frameForRun` edit test stays exact.
3. "Usa mis colores verde y blanco" / "botones redondos" / "fotos en blanco y negro" drop exactly that part → test in Task 1.
4. A store with no photos never gets `lookbook` or `one-per-screen`; no product photo → never `single-focus` → test in Task 1.
5. The emoji/circle facts must not fire on ordinary pages (an emoji inside a sentence, a round icon button) → tests in Task 3.

---

### Task 1: Catalogues, draw, overrides and run decision

**Files:**
- Modify: `apps/api/src/storefront-source/design-engine/frame-draw.ts`
- Test: `apps/api/src/storefront-source/design-engine/frame-draw.spec.ts`

**Interfaces:**
- Produces:
  - `type DesignPart = 'palette' | 'angle' | 'structure' | 'photos' | 'button' | 'hover'`; `type DesignDraw = Record<DesignPart, string>`
  - `type Palette = { id; name; ink; paper; accent; accent2; dark }`; `const PALETTES`; `const DESIGN_CATALOGUE: Record<Exclude<DesignPart,'palette'>, readonly FrameEntry[]>`
  - `drawDesign(random, recent: Array<Partial<DesignDraw> & { category?: string }>, available: FrameAvailable, category: string): DesignDraw`
  - `designOverrides(text): { palette: boolean; photos: boolean; button: boolean }`
  - `plannerDirection(draw, omit?): string` ('' when nothing)
  - `paletteBrandCss(palette): string`; `designCategory(brief: unknown): string`
  - `frameDirection(draw, omit)`: frame-only draws unchanged; with design parts the heading is `DESIGN DRAW:`.
  - `parseFrameDraw` also keeps known design ids and `category` (≤40 chars).
  - `frameForRun` input gains optional `designEnabled?: boolean; category?: string`; output gains, only when fresh and designEnabled, `planner: string`, `dna?: { button: string; hover: string }`, `palette?: Palette`.

- [ ] **Step 1: Write the failing tests** — append to `frame-draw.spec.ts`; add `drawDesign, designOverrides, plannerDirection, paletteBrandCss, designCategory, PALETTES, DESIGN_CATALOGUE` to the existing import:

```ts
describe('design draw round 2', () => {
  const lum = (hex: string) => { const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const contrast = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
  const hsl = (hex: string) => { const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255); const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
    const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1)); const h = d === 0 ? 0 : max === r ? 60 * (((g - b) / d) % 6) : max === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4); return { h: (h + 360) % 360, s, l }; };

  it('has the agreed catalogues, readable palettes and no brown-on-cream', () => {
    expect(PALETTES).toHaveLength(14);
    expect([DESIGN_CATALOGUE.angle.length, DESIGN_CATALOGUE.structure.length, DESIGN_CATALOGUE.photos.length, DESIGN_CATALOGUE.button.length, DESIGN_CATALOGUE.hover.length]).toEqual([10, 8, 7, 12, 5]);
    expect(DESIGN_CATALOGUE.button.map(entry => entry.id).sort()).toEqual(['block', 'brutal', 'bubbly', 'ghost', 'outline', 'pill', 'split', 'stamp', 'sticker', 'tag', 'ticket', 'underline']);
    for (const palette of PALETTES) {
      expect(contrast(palette.ink, palette.paper)).toBeGreaterThanOrEqual(4.5);
      const ink = hsl(palette.ink), paper = hsl(palette.paper);
      const brownInk = ink.h >= 10 && ink.h <= 45 && ink.s > 0.15 && ink.l < 0.35, creamPaper = paper.h >= 25 && paper.h <= 55 && paper.s > 0.2 && paper.l > 0.85;
      expect(brownInk && creamPaper).toBe(false);
    }
  });

  it('avoids recent palettes and angles, the same business first', () => {
    const recent = PALETTES.slice(0, 13).map((palette, i) => ({ palette: palette.id, angle: DESIGN_CATALOGUE.angle[i % 9].id, category: 'café' }));
    for (let seed = 1; seed < 30; seed++) {
      const draw = drawDesign(seeded(seed), recent, rich, 'café');
      expect(draw.palette).toBe(PALETTES[13].id);
      expect(draw.angle).toBe(DESIGN_CATALOGUE.angle[9].id);
    }
    // p0 used once by a florist, p1 once by a café, every other palette twice by florists: only the double weight
    // of the café use separates p0 from p1.
    const mixed = [{ palette: PALETTES[0].id, category: 'florería' }, { palette: PALETTES[1].id, category: 'café' }, ...PALETTES.slice(2).flatMap(p => [{ palette: p.id, category: 'florería' }, { palette: p.id, category: 'florería' }])];
    for (let seed = 1; seed < 30; seed++) expect(drawDesign(seeded(seed), mixed, rich, 'café').palette).toBe(PALETTES[0].id);
    expect(drawDesign(seeded(5), [], rich, 'café')).toEqual(drawDesign(seeded(5), [], rich, 'café'));
  });

  it('never asks for photos or a product the store lacks', () => {
    for (let seed = 1; seed < 200; seed++) {
      const draw = drawDesign(seeded(seed), [], { photos: 0, products: 0, facts: false }, '');
      expect(['lookbook', 'single-focus']).not.toContain(draw.structure);
      expect(draw.photos).not.toBe('one-per-screen');
    }
  });

  it('lets the merchant keep their colours, buttons and photos', () => {
    expect(designOverrides('usa mis colores verde y blanco')).toEqual({ palette: true, photos: false, button: false });
    expect(designOverrides('quiero botones redondos')).toEqual({ palette: false, photos: false, button: true });
    expect(designOverrides('fotos en blanco y negro')).toEqual({ palette: false, photos: true, button: false });
    expect(designOverrides('Hazme la tienda de café')).toEqual({ palette: false, photos: false, button: false });
  });

  it('writes the design draw for YAPI and the angle and palette for the planner', () => {
    const draw = { header: 'side-rail', cart: 'icon-dot', footer: 'quiet-line', hero: 'type-only', palette: 'cobalt-bone', angle: 'process-numbers', structure: 'menu-board', photos: 'duotone', button: 'sticker', hover: 'tilt' };
    const text = frameDirection(draw);
    expect(text.startsWith('DESIGN DRAW:')).toBe(true);
    expect(text).toContain('#1533c9');
    for (const part of ['angle', 'structure', 'photos', 'button', 'hover'] as const) expect(text).toContain(DESIGN_CATALOGUE[part].find(entry => entry.id === draw[part])!.desktop);
    expect(text).toMatch(/textPath/);
    expect(frameDirection(draw, { palette: true })).not.toContain('#1533c9');
    expect(plannerDirection(draw)).toMatch(/process/i);
    expect(plannerDirection(draw)).toContain('#1533c9');
    expect(plannerDirection({})).toBe('');
  });

  it('turns a palette into brand tokens with a readable accent text colour', () => {
    const palette = PALETTES.find(p => p.id === 'cobalt-bone')!;
    const css = paletteBrandCss(palette);
    for (const token of ['--brand-background', '--brand-foreground', '--brand-accent', '--brand-accent-foreground', '--brand-surface']) expect(css).toContain(token);
    const fg = css.match(/--brand-accent-foreground:\s*(#[0-9a-f]{6})/i)![1];
    expect(contrast(fg, palette.accent)).toBeGreaterThanOrEqual(3);
  });

  it('reads the business category from the brief', () => {
    expect(designCategory({ businessType: '  Café de Especialidad ' })).toBe('café de especialidad');
    expect(designCategory({})).toBe('');
    expect(designCategory(null)).toBe('');
  });

  it('adds the design draw only to fresh runs that ask for it', () => {
    const fresh = frameForRun({ enabled: true, designEnabled: true, category: 'café', fresh: true, previous: [], recent: [], available: rich, request: 'Hazme la tienda', random: seeded(4) });
    const saved = parseFrameDraw(fresh.file!.content);
    expect(saved).toMatchObject({ category: 'café' });
    expect(Object.keys(saved)).toEqual(expect.arrayContaining(['palette', 'angle', 'structure', 'photos', 'button', 'hover']));
    expect(fresh.paragraph.startsWith('DESIGN DRAW:')).toBe(true);
    expect(fresh.dna).toEqual({ button: saved.button, hover: saved.hover });
    expect(fresh.palette?.id).toBe(saved.palette);
    expect(fresh.planner).not.toBe('');
    const kept = frameForRun({ enabled: true, designEnabled: true, category: 'café', fresh: true, previous: [], recent: [], available: rich, request: 'usa mis colores verde y blanco, botones redondos', random: seeded(4) });
    expect(kept.palette).toBeUndefined();
    expect(kept.dna).toBeUndefined();
    expect(kept.paragraph).not.toMatch(/#[0-9a-f]{6}/i);
    const off = frameForRun({ enabled: true, designEnabled: false, fresh: true, previous: [], recent: [], available: rich, request: 'x', random: seeded(4) });
    expect(off.paragraph.startsWith('FRAME AND HERO:')).toBe(true);
    expect('planner' in off || 'dna' in off || 'palette' in off).toBe(false);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd apps/api && npx jest src/storefront-source/design-engine/frame-draw.spec.ts`
Expected: FAIL — the new exports do not exist.

- [ ] **Step 3: Implement** — in `frame-draw.ts`, after `FRAME_CATALOGUE`:

```ts
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
    { id: 'field-guide', bold: false, desktop: 'Story angle: a field guide; the headline invites the shopper to learn, sections explain how to choose between the products.', phone: '' },
    { id: 'senses', bold: false, desktop: 'Story angle: the senses; the headline is a smell, sound, taste or texture, sections are each sense.', phone: '' },
    { id: 'neighbourhood', bold: false, desktop: 'Story angle: the neighbourhood and its people; the headline names the street or the city, sections are local moments and how to pick up or receive.', phone: '' },
  ],
  structure: [
    { id: 'catalog-first', bold: false, desktop: 'Page structure: the catalog right after the hero, then one short story section, then pickup and delivery, then contact.', phone: 'On phones: the catalog first, two products per row.' },
    { id: 'story-scroll', bold: true, desktop: 'Page structure: one long story scroll of four or five chapters, each a full-width band with one idea and one photo or number, the catalog as the fourth chapter.', phone: 'On phones: one chapter per screen.' },
    { id: 'lookbook', bold: true, needs: 'photos3', desktop: 'Page structure: a lookbook; large photos lead in an uneven grid with short captions, the catalog follows the photos.', phone: 'On phones: photos full width, captions under each.' },
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

const designOptions = (part: DesignPart, available: FrameAvailable): Array<{ id: string }> => part === 'palette' ? [...PALETTES] : DESIGN_CATALOGUE[part].filter(entry => fits(entry, available));
const DESIGN_AVOID = new Set<DesignPart>(['palette', 'angle', 'structure', 'button']);

export function drawDesign(random: () => number, recent: Array<Partial<DesignDraw> & { category?: string }>, available: FrameAvailable, category: string): DesignDraw {
  const pick = <T>(items: readonly T[]): T => items[Math.min(items.length - 1, Math.floor(random() * items.length))];
  const draw = {} as DesignDraw;
  for (const part of DESIGN_PARTS) {
    const options = designOptions(part, available);
    if (!DESIGN_AVOID.has(part)) { draw[part] = pick(options).id; continue; }
    // The same kind of business counts double: two cafés must not share a colour world while another is free.
    const weight = (item: { category?: string }) => (category && item.category === category ? 2 : 1);
    const uses = new Map(options.map(option => [option.id, recent.filter(item => item[part] === option.id).reduce((sum, item) => sum + weight(item), 0)]));
    const fewest = Math.min(...uses.values());
    draw[part] = pick(options.filter(option => uses.get(option.id) === fewest)).id;
  }
  return draw;
}

const PALETTE_WORDS = /(?<!\p{L})(colou?r(es)?|paleta|tonos?)(?!\p{L})/iu;
const PHOTO_WORDS = /(?<!\p{L})(blanco y negro|filtros?|sepia|fotos naturales|sin filtro)(?!\p{L})/iu;
const BUTTON_WORDS = /(?<!\p{L})botone?s?(?!\p{L})/iu;
/** The merchant already decided: their words win over the dice for that part. */
export function designOverrides(text: string): { palette: boolean; photos: boolean; button: boolean } {
  return { palette: PALETTE_WORDS.test(text), photos: PHOTO_WORDS.test(text), button: BUTTON_WORDS.test(text) };
}

const paletteLine = (palette: Palette) => `Colour world: ${palette.name}, ${palette.dark ? 'a dark page' : 'a light page'}: background ${palette.paper}, text ${palette.ink}, accent ${palette.accent}, second accent ${palette.accent2}. Do not take colours from the photos; style the photos to sit in this world.`;

export function plannerDirection(draw: Partial<DesignDraw>, omit: Partial<Record<DesignPart, boolean>> = {}): string {
  const angle = !omit.angle && DESIGN_CATALOGUE.angle.find(entry => entry.id === draw.angle);
  const palette = !omit.palette && PALETTES.find(entry => entry.id === draw.palette);
  if (!angle && !palette) return '';
  return ['DRAWN FOR THIS STORE (build every concept on it; choose fonts freely):', ...(angle ? [angle.desktop] : []), ...(palette ? [paletteLine(palette)] : [])].join(' ');
}

const luminance = (hex: string) => { const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const ratio = (a: string, b: string) => { const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
export function paletteBrandCss(palette: Palette): string {
  const onAccent = [palette.ink, palette.paper, '#111111', '#ffffff'].sort((a, b) => ratio(b, palette.accent) - ratio(a, palette.accent))[0];
  return `/* Drawn colour world (spec 2026-10-10 design draw round 2): ${palette.name}. */\n:root {\n  --brand-background: ${palette.paper};\n  --brand-foreground: ${palette.ink};\n  --brand-accent: ${palette.accent};\n  --brand-accent-foreground: ${onAccent};\n  --brand-surface: ${palette.accent2};\n}\n`;
}

export function designCategory(brief: unknown): string {
  const value = brief && typeof brief === 'object' ? (brief as { businessType?: unknown }).businessType : undefined;
  return typeof value === 'string' ? value.trim().toLowerCase().slice(0, 40) : '';
}
```

Replace `frameDirection` (frame-only draws stay byte-identical):
```ts
export function frameDirection(draw: Partial<FrameDraw & DesignDraw>, omit: Partial<Record<FramePart | DesignPart, boolean>> = {}): string {
  const frameLines = PARTS.flatMap(part => {
    const entry = !omit[part] && FRAME_CATALOGUE[part].find(item => item.id === draw[part]);
    return entry ? [`- ${entry.desktop} ${entry.phone}`] : [];
  });
  const palette = !omit.palette && PALETTES.find(entry => entry.id === draw.palette);
  const designLines = [
    ...(palette ? [`- ${paletteLine(palette)}`] : []),
    ...(['angle', 'structure', 'photos', 'button', 'hover'] as const).flatMap(part => {
      const entry = !omit[part] && DESIGN_CATALOGUE[part].find(item => item.id === draw[part]);
      return entry ? [`- ${entry.desktop}${entry.phone ? ` ${entry.phone}` : ''}`] : [];
    }),
  ];
  if (!frameLines.length && !designLines.length) return '';
  if (!designLines.length) return ["FRAME AND HERO: This store's frame was drawn for it so stores never repeat each other. Build exactly this structure and style it entirely in the store's own language; type, colour, spacing and motion are yours.", ...frameLines, 'Before finishing, compare your desktop and phone screenshots with this list and fix any part that does not match.'].join('\n');
  return ["DESIGN DRAW: This store's design was drawn for it so stores never repeat each other, even two in the same business. Build exactly this and style it in the store's own language; fonts, spacing and motion are yours.", ...frameLines, ...designLines,
    '- Quality: circular text only with an inline SVG <textPath>, never a rotated span; never use emoji as decoration; text never overlaps other text. Photo treatments apply to your own images, never inside the platform product page.',
    'Before finishing, compare your desktop and phone screenshots with this list and fix any part that does not match.'].join('\n');
}
```

`parseFrameDraw` — after the frame loop:
```ts
  for (const part of DESIGN_PARTS) {
    const id = (value as Record<string, unknown>)[part];
    if (typeof id === 'string' && designOptions(part, { photos: 99, products: 99, facts: true }).some(option => option.id === id)) (out as Record<string, string>)[part] = id;
  }
  const category = (value as Record<string, unknown>).category;
  if (typeof category === 'string' && category.trim()) (out as Record<string, string>).category = category.trim().slice(0, 40);
```
with return type `Partial<FrameDraw & DesignDraw> & { category?: string }`.

`frameForRun` — add optional inputs `designEnabled?: boolean; category?: string`; the fresh branch becomes (keeping the round-1 `own` parse):
```ts
  const recent = Object.keys(own).length ? [own, ...input.recent] : input.recent;
  const frame = drawFrame(input.random ?? Math.random, recent, input.available);
  const frameOmit = frameOverrides(input.request);
  if (!input.designEnabled) return { file: { path: FRAME_DRAW_FILE, content: JSON.stringify(frame, null, 2) + '\n' }, paragraph: frameDirection(frame, frameOmit) };
  const design = drawDesign(input.random ?? Math.random, recent as Array<Partial<DesignDraw> & { category?: string }>, input.available, input.category ?? '');
  const designOmit = designOverrides(input.request);
  const draw = { ...frame, ...design, category: input.category ?? '' };
  const palette = designOmit.palette ? undefined : PALETTES.find(entry => entry.id === design.palette);
  return {
    file: { path: FRAME_DRAW_FILE, content: JSON.stringify(draw, null, 2) + '\n' },
    paragraph: frameDirection(draw, { ...frameOmit, palette: designOmit.palette, photos: designOmit.photos, button: designOmit.button, hover: designOmit.button }),
    planner: plannerDirection(draw, { palette: designOmit.palette }),
    ...(designOmit.button ? {} : { dna: { button: design.button, hover: design.hover } }),
    ...(palette ? { palette } : {}),
  };
```
Return type: `{ file?: { path: string; content: string }; paragraph: string; planner?: string; dna?: { button: string; hover: string }; palette?: Palette }`.

- [ ] **Step 4: Run the tests**

Run: `cd apps/api && npx jest src/storefront-source/design-engine/frame-draw.spec.ts`
Expected: PASS — the new block and every round-1 test.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/storefront-source/design-engine/frame-draw.ts apps/api/src/storefront-source/design-engine/frame-draw.spec.ts
git commit -m "feat(yapi): design draw round 2 — colour world, story angle, page structure, photo treatment and buttons rolled per store, same business avoided first"
```

---

### Task 2: Wiring — flag, planner, DNA buttons and brand colours

**Files:**
- Modify: `apps/api/src/config/configuration.ts` (next to `yapiFrameDraw`)
- Modify: `apps/api/src/brand/brand-profile.ts` (export `brandHasColours`)
- Modify: `apps/api/src/storefront-source/source-generation.service.ts` (frame block ~line 498; planner `context` ~line 680; `tokenCss` ~line 1410; `const dna =` ~line 1442)
- Modify: `apps/api/src/storefront-source/design-engine/sep5-author.ts` (`frameCheck`)
- Test: `apps/api/src/brand/brand-profile.spec.ts`, `apps/api/src/storefront-source/design-engine/sep5-author.spec.ts`

**Interfaces:**
- Consumes: Task 1's `frameForRun` outputs, `paletteBrandCss`, `designCategory`.
- Produces: `app.yapiDesignDraw: boolean`; `brandHasColours(data: BrandProfile | undefined | null): boolean`.

- [ ] **Step 1: Write the failing tests**

Append to `brand-profile.spec.ts` (merge `brandHasColours` into its import from `./brand-profile`):
```ts
it('knows whether the merchant confirmed any brand colour', () => {
  expect(brandHasColours(undefined)).toBe(false);
  expect(brandHasColours({ confirmed: [{ field: 'headingFontUrl', value: 'x' }] } as never)).toBe(false);
  expect(brandHasColours({ confirmed: [{ field: 'accent', value: '#123456' }] } as never)).toBe(true);
});
```
Append to `sep5-author.spec.ts`:
```ts
it('asks the self-review to check colours, buttons and photos when there is a design draw', () => {
  const input = { brief: {}, instruction: 'Hazme la tienda', data: {}, assetLegend: [], storeShell: true, draft: [], measured: [] };
  expect(sep5ReviewPrompt({ ...input, frame: 'DESIGN DRAW: x' })).toMatch(/colours, buttons, photo treatment and structure match DESIGN DRAW/);
  expect(sep5ReviewPrompt({ ...input, frame: 'FRAME AND HERO: x' })).not.toMatch(/DESIGN DRAW/);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd apps/api && npx jest src/brand/brand-profile.spec.ts src/storefront-source/design-engine/sep5-author.spec.ts`
Expected: FAIL — `brandHasColours` missing; no DESIGN DRAW sentence.

- [ ] **Step 3: Implement**

`brand-profile.ts`, after `brandStyles`:
```ts
/** Whether the merchant confirmed any brand colour; a drawn colour world never overrides those. */
export function brandHasColours(data: BrandProfile | undefined | null): boolean {
  return Boolean(data?.confirmed?.some(fact => colors.has(fact.field)));
}
```
`configuration.ts`: type `yapiDesignDraw: boolean;` (doc: "Design draw round 2 (spec 2026-10-10): colour world, story angle, page structure, photo treatment and buttons per store. Default on; YAPI_DESIGN_DRAW=off drops them, the frame keeps YAPI_FRAME_DRAW."), value `yapiDesignDraw: process.env.YAPI_DESIGN_DRAW !== 'off',`.

`sep5-author.ts` `sep5ReviewPrompt` — replace the `frameCheck` line:
```ts
  const frame = input.frame?.trim() ?? '';
  const frameCheck = !frame ? '' : frame.startsWith('DESIGN DRAW')
    ? 'Check that the header and hero match the frame lines of the DESIGN DRAW, and that the colours, buttons, photo treatment and structure match DESIGN DRAW, at both widths; rebuild whichever does not. '
    : 'Check that the header and hero match FRAME AND HERO at both widths; rebuild whichever does not. ';
```

`source-generation.service.ts`:
1. Import `paletteBrandCss, designCategory` with the existing frame-draw import; import `brandHasColours` from the module that already provides `brandStyles`.
2. In the `frameForRun({ … })` call add `designEnabled: this.config.get<boolean>('app.yapiDesignDraw') === true,` and `category: designCategory(dto.brief),`.
3. In the planner `context: JSON.stringify({ brief: dto.brief, instruction: dto.instruction, avoidRecent, …` add `designDraw: frame.planner || undefined,` right after `avoidRecent,`.
4. Replace the `tokenCss` line:
```ts
    // Confirmed brand colours win; otherwise a fresh design's drawn colour world becomes the brand tokens.
    const paletteCss = frame.palette && !brandHasColours(brand?.data) ? paletteBrandCss(frame.palette) : '';
    const confirmedCss = brand && brand.revision > 0 ? brandStyles(brand.data, fontPaths) : '';
    const tokenCss = paletteCss ? `${paletteCss}${confirmedCss}` : brand && brand.revision > 0 ? confirmedCss || '/* No confirmed visual tokens. */\n' : previousBrand?.content || '';
```
5. Append `...(frame.dna ?? {})` as the last spread of `const dna = { … }`.

- [ ] **Step 4: Run the tests and type check**

Run: `cd apps/api && npx jest src/brand/brand-profile.spec.ts src/storefront-source/design-engine src/storefront-source/agent/agent-prompt.spec.ts src/storefront-source/source-projects.service.spec.ts && npx tsc --noEmit -p tsconfig.json`
Expected: PASS, tsc exit 0. Then `npx jest src/storefront-source/source-generation-agent.spec.ts src/storefront-source/source-generation.service.spec.ts --testTimeout=120000` — only the known "steers planning away from recent fingerprints" failure.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/config/configuration.ts apps/api/src/brand/brand-profile.ts apps/api/src/brand/brand-profile.spec.ts apps/api/src/storefront-source/source-generation.service.ts apps/api/src/storefront-source/design-engine/sep5-author.ts apps/api/src/storefront-source/design-engine/sep5-author.spec.ts
git commit -m "feat(yapi): the planner builds on the drawn angle and colours, the platform's buttons follow the drawn style, brand tokens take the drawn palette unless the merchant confirmed colours"
```

---

### Task 3: Quality floor in the Sep-5 self-review

**Files:**
- Modify: `apps/api/src/storefront-source/design-engine/sep5-review-capture.ts`
- Test: `apps/api/src/storefront-source/design-engine/sep5-review-capture.spec.ts` (append; merge imports)

**Interfaces:**
- Produces: `Sep5HeaderFacts` gains optional `decorEmoji?: number; fakeCircle?: number; overlaps?: string[]`; `sep5MeasuredFacts` reports them; exported `decorativeEmojiCount(doc: Document): number` and `fakeCircularTextCount(doc: Document, styleOf: (el: Element) => { radius: number; width: number; height: number }): number`.

- [ ] **Step 1: Write the failing tests** (append; borrow jsdom as the kit specs do):
```ts
import { join } from 'node:path';
import { createRequire } from 'node:module';
// merge into the existing import from './sep5-review-capture':
import { decorativeEmojiCount, fakeCircularTextCount, sep5MeasuredFacts } from './sep5-review-capture';

const { JSDOM } = createRequire(join(__dirname, '../../../../checkout/package.json'))('jsdom');
const html = (body: string) => new JSDOM(`<body>${body}</body>`).window.document as Document;

it('counts emoji used as decoration, not emoji inside a sentence', () => {
  expect(decorativeEmojiCount(html('<div class="roundel"><span>YUNGAS · LA PAZ ·</span><strong>☕</strong></div>'))).toBe(1);
  expect(decorativeEmojiCount(html('<p>Nos encanta el café ☕ de la mañana.</p>'))).toBe(0);
});

it('flags circular stamp text written without an SVG textPath, not round icon buttons', () => {
  const round = () => ({ radius: 120, width: 240, height: 240 });
  expect(fakeCircularTextCount(html('<div class="roundel"><span>YUNGAS · LA PAZ · CAFÉ ·</span></div>'), round)).toBe(1);
  expect(fakeCircularTextCount(html('<div class="roundel"><svg><path id="c" d="M0 0"/><text><textPath href="#c">YUNGAS · LA PAZ · CAFÉ ·</textPath></text></svg></div>'), round)).toBe(0);
  expect(fakeCircularTextCount(html('<button class="round">Ir</button>'), () => ({ radius: 22, width: 44, height: 44 }))).toBe(0);
});

it('reports emoji decoration, fake circular text and overlapping text in the merchant language', () => {
  const base = { width: 1280, pageWidth: 1280, missingImages: 0, search: true, account: true, cart: true, brokenWords: [], errors: [] };
  const facts = sep5MeasuredFacts([{ ...base, decorEmoji: 1, fakeCircle: 1, overlaps: ['«Una pausa» sobre «Explorar»'] }]).join('\n');
  expect(facts).toMatch(/emoji/);
  expect(facts).toMatch(/textPath/);
  expect(facts).toMatch(/se superpone/);
  expect(sep5MeasuredFacts([base])).toEqual([]);
});
```
(Path depth: the spec file sits in `apps/api/src/storefront-source/design-engine/`; `../../../../checkout/package.json` resolves to `apps/checkout/package.json`. Verify by reading how the existing file or the kit specs borrow jsdom and match their depth.)

- [ ] **Step 2: Run them to see them fail**

Run: `cd apps/api && npx jest src/storefront-source/design-engine/sep5-review-capture.spec.ts`
Expected: FAIL — helpers not exported.

- [ ] **Step 3: Implement** in `sep5-review-capture.ts`:
```ts
const EMOJI = /\p{Extended_Pictographic}/u;
/** Elements whose whole text is emoji: decoration, the clearest AI-site tell. Emoji inside a sentence is copy. */
export function decorativeEmojiCount(doc: Document): number {
  return Array.from(doc.body.querySelectorAll('*')).filter(el => el.children.length === 0 && EMOJI.test(el.textContent || '') && !/[\p{L}\p{N}]/u.test(el.textContent || '')).length;
}
/** Circular stamp text (several "·" separators) in a round box without an SVG textPath: HTML cannot bend it. */
export function fakeCircularTextCount(doc: Document, styleOf: (el: Element) => { radius: number; width: number; height: number }): number {
  const hits = Array.from(doc.body.querySelectorAll('*')).filter(el => {
    if (el.closest('svg') || el.querySelector('textPath')) return false;
    const text = el.textContent || '';
    if ((text.match(/[·•|]/g) || []).length < 2 || text.trim().length < 10) return false;
    const box = styleOf(el);
    return box.width >= 60 && Math.abs(box.width - box.height) <= box.width * 0.15 && box.radius >= box.width * 0.4;
  });
  return hits.filter(el => !hits.some(other => other !== el && other.contains(el))).length;
}
```
`Sep5HeaderFacts`: add `decorEmoji?: number; fakeCircle?: number; overlaps?: string[]`. In `sep5MeasuredFacts`, before the errors line:
```ts
    ...(fact.decorEmoji ? [`${fact.width}px: ${fact.decorEmoji} emoji usado(s) como decoración; reemplázalo(s) por una ilustración o quítalo(s).`] : []),
    ...(fact.fakeCircle ? [`${fact.width}px: ${fact.fakeCircle} texto(s) circular(es) hecho(s) con un span girado; un texto en círculo necesita un SVG con <textPath>, o quítalo.`] : []),
    ...(fact.overlaps?.length ? [`${fact.width}px: un texto se superpone a otro: ${fact.overlaps.join('; ')}.`] : []),
```
In `captureSep5Draft`'s `page.evaluate(() => { … })` that builds `header`, add (inlined: the browser cannot import modules):
```ts
          decorEmoji: Array.from(document.body.querySelectorAll('*')).filter(el => el.children.length === 0 && /\p{Extended_Pictographic}/u.test(el.textContent || '') && !/[\p{L}\p{N}]/u.test(el.textContent || '') && el.getBoundingClientRect().width > 0).length,
          fakeCircle: (() => {
            const hits = Array.from(document.body.querySelectorAll('*')).filter(el => {
              if (el.closest('svg') || el.querySelector('textPath')) return false;
              const text = el.textContent || ''; if ((text.match(/[·•|]/g) || []).length < 2 || text.trim().length < 10) return false;
              const r = el.getBoundingClientRect(), radius = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;
              return r.width >= 60 && Math.abs(r.width - r.height) <= r.width * 0.15 && radius >= r.width * 0.4;
            });
            return hits.filter(el => !hits.some(other => other !== el && other.contains(el))).length;
          })(),
          overlaps: (() => {
            const leaves = Array.from(document.body.querySelectorAll('h1,h2,h3,p,a,button,li,span,strong,em')).filter(el => el.children.length === 0 && (el.textContent || '').trim().length > 2 && getComputedStyle(el).visibility !== 'hidden' && Number(getComputedStyle(el).opacity) > 0.2)
              .map(el => ({ el, r: el.getBoundingClientRect() })).filter(item => item.r.width > 4 && item.r.height > 4).slice(0, 400);
            const out: string[] = [];
            for (let i = 0; i < leaves.length && out.length < 3; i++) for (let j = i + 1; j < leaves.length && out.length < 3; j++) {
              const a = leaves[i], b = leaves[j];
              if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
              const w = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left), h = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
              if (w > 0 && h > 0 && w * h > 0.3 * Math.min(a.r.width * a.r.height, b.r.width * b.r.height)) out.push(`«${(a.el.textContent || '').trim().slice(0, 30)}» sobre «${(b.el.textContent || '').trim().slice(0, 30)}»`);
            }
            return out;
          })(),
```

- [ ] **Step 4: Run the tests**

Run: `cd apps/api && npx jest src/storefront-source/design-engine && npx tsc --noEmit -p tsconfig.json`
Expected: PASS, tsc exit 0.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/storefront-source/design-engine/sep5-review-capture.ts apps/api/src/storefront-source/design-engine/sep5-review-capture.spec.ts
git commit -m "feat(yapi): the Sep-5 self-review measures emoji decoration, fake circular text and overlapping text"
```

---

### Task 4: Live check (main session; owner asked to build and run it)

- [ ] Confirm the API on :3001 started after the last commit.
- [ ] Generate three stores with the round-1 coffee brief, the same three photos and the same follow-up answer, one after another.
- [ ] Read each `frame-draw.json`; screenshot desktop and phone; read each store's `--brand-*` tokens, `h1`, and `config.js` `dna.button`.
- [ ] Pass: three palettes none brown-on-cream, three headlines from three angles, three button forms (YAPI's and the platform's add-to-cart match), all usable at 390 px.
- [ ] Record in `project_yapi_superbot_design.md` memory.
