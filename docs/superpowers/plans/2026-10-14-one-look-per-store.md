# One Look per Store Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The kit's product page, catalog pages, product cards and cart drawer carry each store's own look: measured from its home page (layer A) plus YAPI's guarded touches (layer B).

**Architecture:**
- **Layer A, measuring.** At every YAPI save, a headless render of the store's `index.html` is read into a small clamped `config.look` record (`store-look.ts`, `store-look-measure.ts`).
- **The kit follows it.** `commerce.js` maps `config.look` onto its existing `--pd-*`/`--kit-*` token layers through `data-look-*` attributes.
- **Layer B, YAPI's touches.** In Sep-5 builds, the background self-review stage makes one model call that writes guarded CSS per surface (`kit-touch.ts`). That CSS is sanitized by per-surface profiles of the existing sanitizer, checked in a real browser (`kit-surface-check.ts` plus the existing product check), and stored in `config.dna.{productCss,catalogCss,cardCss,cartCss}`.

**Tech Stack:** NestJS + TypeScript (apps/api), Playwright chromium (`withVisualSandbox`), postcss (sanitizer), zod, plain browser JS (packages/storefront-kit/kit/commerce.js), Jest (api), Playwright Test (apps/merchant-studio/tests).

**Spec:** `docs/superpowers/specs/2026-10-14-one-look-per-store-design.md` (owner-approved 2026-10-14). Read it before starting. Task 1 appends the planning amendments to it.

## Global Constraints

- **Kill switches.** `YAPI_LOOK_MEASURE=off` disables measurement; `YAPI_KIT_TOUCH=off` disables the touch step. Both are on unless set to `off`. Config keys: `app.yapiLookMeasure`, `app.yapiKitTouch`.
- **No look, no change.** Every new kit rule keys on a `:root[data-look…]` attribute or on `config.dna.*Css`. A store with neither `config.look` nor touch CSS must render exactly as today. The baseline screenshots from Task 4 Step 2 enforce this.
- **Naming.** Kit attributes use `data-look-*`; kit variables use `--lk-*`, because `--look-top`/`--look-left` already exist for the quick-look chip.
- **Colours.** Colours are never measured. The look may change a button's shape and type, never its colours.
- **Protected controls.** Neither layer ever restyles:
  - on the product page: price, options, quantity, buy button, seal, trust row
  - on cards: price and `.menu-add`
  - in the cart: quantities, totals, remove, checkout button
- **Main gallery.** `.product-detail__photo` and `.product-detail__stack img` are always true colour. Grain, shape and frame may apply to them; mono, sepia and duotone may not.
- **Measurement.** One render at 1280×800 with reduced motion, hard deadline 15 s. It never fails a save.
- **Touch step.** One call with a 60 s deadline, plus one retry when the bridge gives no completed answer. Guarded CSS is limited to 3,000 characters and 40 rules per surface, with no `url()`.
- **Database.** No migration in this plan. Never run `prisma migrate`, `prisma db push` or `prisma migrate reset` against the dev DB.
- **API tests.** Run them one file at a time (`npx jest <file>`). Never run the full api jest suite with default workers.
- **Owner's dev servers.** Before editing `apps/api` while they run, check that no YAPI chat job is RUNNING: `nest --watch` restarts and would interrupt it.
- **Git.** Commit on `feature/store-page-architecture`. Never push.
- **Language.** Merchant-facing text is Spanish.

## Review Focus

1. **Dark stores** (light ink on dark paper). The duotone matrix, the banded "related" band and the gallery chips (paper/ink) must stay readable. Tested in Task 4: on a dark store, the banded related text has contrast ≥ 4.5.
2. **YAPI-authored product cards** (`.menu-item[data-custom-product]`) must not get layer A on top of their own design. Tested in Task 5: a custom card keeps `filter: none` and its own radius.
3. **A chat edit on a store with a design concept** must keep its touch CSS, even though the concept's DNA re-seeds `productCss` on every save. Tested in Task 7 (`carriedTouch`).
4. **A redesign** must not carry the previous design's touch CSS into revision N. Tested in Task 7 (`carriedTouch` with `creative`).
5. **A measurement that throws or times out**, or an aborted review signal, must keep the previous look and still let the save through. Tested in Task 2 (`withMeasuredLook` keeps the previous look) and Task 3 (a save with a failing measurement still saves).

## File Structure

| File | Responsibility |
|---|---|
| `apps/api/src/storefront-source/store-look.ts` (new) | `StoreLook` and `LookReading` types, `lookFromReading` (pure classification), `sanitizeLook`, draw-treatment mapping, `readConfigFile` / `patchConfigFile` helpers |
| `apps/api/src/storefront-source/store-look-measure.ts` (new) | `readLookInPage` (runs in the browser), `measureStoreLook` (sandbox render), `withMeasuredLook` (writes `config.look`) |
| `apps/api/src/storefront-source/kit-surface-check.ts` (new) | Real-browser check of catalog, card and cart controls |
| `apps/api/src/storefront-source/kit-touch.ts` (new) | Touch prompt and schema, distinctive-CSS excerpt, `runKitTouch`, `carriedTouch`, `pickTouch`, `instructionConcernsKitSurfaces` |
| `apps/api/src/storefront-source/product-theme-css.ts` | Profile-aware `var()` validation; catalog, card and cart profiles; `sanitizeKitSurfaceCss` |
| `apps/api/src/storefront-source/product-theme.ts` | `kitCss` input and runtime fields for the agent tool |
| `apps/api/src/storefront-source/agent/agent-tools.ts` | `set_product_card_theme` gains `catalogCss`, `cardCss`, `cartCss` |
| `apps/api/src/storefront-source/source-generation.service.ts` | Glue: measuring in `assembleSave`, the touch in the Sep-5 review stage, carry rules, the chat re-run |
| `apps/api/src/config/configuration.ts` | The two flags |
| `apps/api/src/storefront-source/source-design.ts` | Fix the stale four-styles sentence |
| `packages/storefront-kit/kit/commerce.js` | `LOOK` reader, look CSS, SVG filters, `data-part` hooks, injection of the four guarded CSS fields |
| `apps/merchant-studio/tests/kit-look-harness.ts` (new) | Shared page harness for the kit tests |
| `apps/merchant-studio/tests/kit-no-look-baseline.spec.ts` (new) | Screenshot baseline: no look means no change |
| `apps/merchant-studio/tests/store-look.spec.ts` (new) | Kit look behaviour on all four surfaces |
| `apps/api/scripts/one-look-check.ts` (new) | Read-only live check of success criteria 1–2 |

---

### Task 1: The look record (pure)

**Files:**
- Create: `apps/api/src/storefront-source/store-look.ts`
- Test: `apps/api/src/storefront-source/store-look.spec.ts`
- Modify: `docs/superpowers/specs/2026-10-14-one-look-per-store-design.md` (append amendments)

**Interfaces:**
- Produces:
  - `type StoreLook = { version: 1; type?: { heading?: LookHeading; label?: LookLabel }; shape?: { photo?: PhotoRadius; card?: LookRadius; button?: LookRadius }; edge?: LookEdge; photo?: { treatment?: LookTreatment; aspect?: LookAspect; tilt?: number }; surface?: LookSurface }`
  - `type LookReading`, `LookBox`, `LookPhoto` (see code)
  - `lookFromReading(reading: LookReading, declared?: { treatment?: string }): StoreLook | undefined`
  - `sanitizeLook(raw: unknown): StoreLook | undefined`
  - `readConfigFile(files): Record<string, any>`
  - `patchConfigFile<T extends { path: string; content: string }>(files: T[], patch: (config) => config): T[]`
  - Constants `LOOK_TREATMENTS`, `LOOK_EDGES`, `LOOK_ASPECTS`, `LOOK_SURFACES`, `DRAW_TREATMENTS`

- [ ] **Step 1: Write the failing tests**

```ts
// apps/api/src/storefront-source/store-look.spec.ts
import { lookFromReading, patchConfigFile, readConfigFile, sanitizeLook, type LookBox, type LookPhoto, type LookReading } from './store-look';

const box = (radius: number, extra: Partial<LookBox> = {}): LookBox => ({ width: 300, height: 375, radii: [radius, radius, radius, radius], borderWidth: 0, shadows: [], ...extra });
const photo = (radius: number, extra: Partial<LookPhoto> = {}): LookPhoto => ({ ...box(radius), grayscale: 0, sepia: 0, blend: 'normal', overlay: false, padding: 0, lightBacking: false, rotate: 0, ...extra });
const reading = (over: Partial<LookReading> = {}): LookReading => ({
  heading: { families: ['Fraunces', 'serif'], weight: 700, transform: 'none', literalUpper: false, letterSpacing: -0.96, fontSize: 48, italic: false },
  loadedFamilies: ['Fraunces', 'Inter'], labels: [], photos: [photo(16), photo(16), photo(18)], cards: [], buttons: [], sections: [], pageLuminance: 0.9, ...over,
});

describe('lookFromReading', () => {
  it('reads a calm serif café', () => {
    const look = lookFromReading(reading())!;
    expect(look.type?.heading).toEqual({ family: 'Fraunces', weight: 700, case: 'none', tracking: -0.02, italic: false });
    expect(look.shape?.photo).toBe(16);
    expect(look.photo?.treatment).toBe('natural');
    expect(look.photo?.aspect).toBe('portrait');
  });

  it('reads a bold stamp store: uppercase heavy headline, labels, pill buttons, offset shadows', () => {
    const offset = { x: 6, y: 6, blur: 0, spread: 0, inset: false };
    const look = lookFromReading(reading({
      heading: { families: ['Anton'], weight: 900, transform: 'uppercase', literalUpper: false, letterSpacing: 4.8, fontSize: 48, italic: false },
      loadedFamilies: ['Anton'],
      labels: [1, 2, 3].map(() => ({ letterSpacing: 1.2, fontSize: 12, weight: 700 })),
      buttons: [box(999, { width: 180, height: 48 }), box(999, { width: 160, height: 48 })],
      cards: [box(0, { shadows: [offset] }), box(0, { shadows: [offset] }), box(0, { shadows: [offset] })],
    }))!;
    expect(look.type?.heading).toMatchObject({ family: 'Anton', weight: 900, case: 'upper', tracking: 0.1 });
    expect(look.type?.label).toEqual({ case: 'upper', tracking: 0.1, weight: 700 });
    expect(look.shape?.button).toBe('pill');
    expect(look.shape?.card).toBe(0);
    expect(look.edge).toBe('offset');
  });

  it('reads polaroid frames and their tilt', () => {
    const look = lookFromReading(reading({ photos: [photo(2, { padding: 12, lightBacking: true, rotate: 3 }), photo(2, { padding: 12, lightBacking: true, rotate: -2 }), photo(2, { padding: 12, lightBacking: true, rotate: 4 })] }))!;
    expect(look.photo?.treatment).toBe('polaroid');
    expect(look.photo?.tilt).toBe(3);
  });

  it('lets the drawn treatment beat the measured one', () => {
    expect(lookFromReading(reading(), { treatment: 'black-white' })!.photo?.treatment).toBe('mono');
    expect(lookFromReading(reading(), { treatment: 'one-per-screen' })!.photo?.treatment).toBe('natural');
    expect(lookFromReading(reading(), { treatment: 'tight-crops' })!.photo?.treatment).toBe('tight');
  });

  it('leaves out what it cannot read: no photos, an unloaded font', () => {
    const look = lookFromReading(reading({ photos: [], loadedFamilies: [] }))!;
    expect(look.photo).toBeUndefined();
    expect(look.shape?.photo).toBeUndefined();
    expect(look.type?.heading?.family).toBeUndefined();
    expect(look.type?.heading?.weight).toBe(700);
  });

  it('leaves out radii that disagree with each other', () => {
    expect(lookFromReading(reading({ photos: [photo(0), photo(24), photo(48)] }))!.shape?.photo).toBeUndefined();
  });

  it('recognises arches and colour treatments', () => {
    const arch = (extra: Partial<LookPhoto> = {}) => photo(0, { radii: [150, 150, 0, 0], ...extra });
    expect(lookFromReading(reading({ photos: [arch(), arch(), arch()] }))!.shape?.photo).toBe('arch');
    expect(lookFromReading(reading({ photos: [photo(0, { grayscale: 1 }), photo(0, { grayscale: 1 }), photo(0)] }))!.photo?.treatment).toBe('mono');
    expect(lookFromReading(reading({ photos: [photo(0, { grayscale: 1, blend: 'multiply' }), photo(0, { grayscale: 1, blend: 'multiply' })] }))!.photo?.treatment).toBe('duotone');
  });

  it('reads the surface rhythm', () => {
    const band = (luminance: number, background: string) => ({ luminance, background });
    expect(lookFromReading(reading({ sections: [band(0.95, 'a'), band(0.04, 'b')] }))!.surface).toBe('banded');
    expect(lookFromReading(reading({ sections: [band(0.95, 'a'), band(0.85, 'b')] }))!.surface).toBe('tinted');
    expect(lookFromReading(reading({ sections: [band(0.95, 'a'), band(0.95, 'a')] }))!.surface).toBe('flat');
  });

  it('returns nothing when the page gave nothing to read', () => {
    expect(lookFromReading(reading({ heading: null, photos: [] }))).toBeUndefined();
  });
});

describe('sanitizeLook', () => {
  it('is idempotent on its own output', () => {
    const look = lookFromReading(reading())!;
    expect(sanitizeLook(look)).toEqual(look);
    expect(sanitizeLook(JSON.parse(JSON.stringify(look)))).toEqual(look);
  });

  it('drops unknown keys, wrong versions and unsafe values', () => {
    expect(sanitizeLook(undefined)).toBeUndefined();
    expect(sanitizeLook({ version: 2, edge: 'soft' })).toBeUndefined();
    expect(sanitizeLook({ version: 1, edge: 'glow', evil: 1 })).toBeUndefined();
    const cleaned = sanitizeLook({ version: 1, type: { heading: { family: 'x;}body{display:none', weight: 1200 } }, shape: { photo: 400, card: 'pill' }, photo: { tilt: 9 } });
    expect(cleaned).toEqual({ version: 1, shape: { card: 'pill' } });
  });
});

describe('config helpers', () => {
  it('reads and patches config.js', () => {
    const files = [{ path: 'config.js', content: 'window.PAGOSYA_CONFIG = {"slug":"cafe","dna":{"version":1}};\n' }, { path: 'index.html', content: '<p>' }];
    expect(readConfigFile(files).slug).toBe('cafe');
    const patched = patchConfigFile(files, config => ({ ...config, look: { version: 1 } }));
    expect(readConfigFile(patched).look).toEqual({ version: 1 });
    expect(patched[1]).toBe(files[1]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/api && npx jest src/storefront-source/store-look.spec.ts`
Expected: FAIL with "Cannot find module './store-look'".

- [ ] **Step 3: Write the implementation**

```ts
// apps/api/src/storefront-source/store-look.ts
/** One look per store (spec 2026-10-14), layer A: what a store's own home page does, kept as a small clamped record that
 * the kit maps onto its product page, catalog, cards and cart (commerce.js, data-look-*). Pure: the browser reading
 * comes from store-look-measure.ts. Colours are deliberately absent: they stay the store's --store-* tokens. */
export const LOOK_TREATMENTS = ['natural', 'mono', 'duotone', 'sepia', 'grain', 'polaroid', 'tight'] as const;
export const LOOK_EDGES = ['none', 'hairline', 'outline', 'offset', 'soft'] as const;
export const LOOK_ASPECTS = ['square', 'portrait', 'landscape', 'free'] as const;
export const LOOK_SURFACES = ['flat', 'tinted', 'banded'] as const;
export type LookTreatment = (typeof LOOK_TREATMENTS)[number];
export type LookEdge = (typeof LOOK_EDGES)[number];
export type LookAspect = (typeof LOOK_ASPECTS)[number];
export type LookSurface = (typeof LOOK_SURFACES)[number];
export type LookRadius = number | 'pill';
export type PhotoRadius = LookRadius | 'arch';
export type LookHeading = { family?: string; weight?: number; case?: 'none' | 'upper'; tracking?: number; italic?: boolean };
export type LookLabel = { case: 'upper'; tracking?: number; weight?: number };
export type StoreLook = {
  version: 1;
  type?: { heading?: LookHeading; label?: LookLabel };
  shape?: { photo?: PhotoRadius; card?: LookRadius; button?: LookRadius };
  edge?: LookEdge;
  photo?: { treatment?: LookTreatment; aspect?: LookAspect; tilt?: number };
  surface?: LookSurface;
};

/** What readLookInPage measured in the browser (store-look-measure.ts). Lengths in CSS px. */
export type LookShadow = { x: number; y: number; blur: number; spread: number; inset: boolean };
export type LookBox = { width: number; height: number; radii: [number, number, number, number]; borderWidth: number; shadows: LookShadow[] };
export type LookPhoto = LookBox & { grayscale: number; sepia: number; blend: string; overlay: boolean; padding: number; lightBacking: boolean; rotate: number };
export type LookReading = {
  heading: { families: string[]; weight: number; transform: string; literalUpper: boolean; letterSpacing: number; fontSize: number; italic: boolean } | null;
  loadedFamilies: string[];
  labels: Array<{ letterSpacing: number; fontSize: number; weight: number }>;
  photos: LookPhoto[];
  cards: LookBox[];
  buttons: LookBox[];
  sections: Array<{ luminance: number; background: string }>;
  pageLuminance: number;
};

/** The round-2 draw's photo treatments (design-engine/frame-draw.ts, saved as `photos` in frame-draw.json). */
export const DRAW_TREATMENTS: Record<string, LookTreatment> = {
  natural: 'natural', 'black-white': 'mono', duotone: 'duotone', 'film-grain': 'grain', 'framed-polaroid': 'polaroid', 'tight-crops': 'tight', 'one-per-screen': 'natural',
};

const FAMILY = /^[\p{L}\p{N} '-]{1,60}$/u;
const round = (value: number, step = 1) => Math.round(value / step) * step;
const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));
const median = (values: number[]) => { const sorted = [...values].sort((a, b) => a - b), mid = sorted.length >> 1; return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2; };
/** The value at least 60% of the readings share; undefined when the page disagrees with itself or says too little. */
function majority<T>(values: T[], min = 2): T | undefined {
  if (values.length < min) return undefined;
  const counts = new Map<T, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  const [value, count] = [...counts].sort((a, b) => b[1] - a[1])[0];
  return count / values.length >= 0.6 ? value : undefined;
}
function radiusOf(box: LookBox, allowArch: boolean): PhotoRadius {
  const [tl, tr, br, bl] = box.radii;
  const half = Math.min(box.width, box.height) / 2;
  if (allowArch && Math.min(tl, tr) >= box.width * 0.4 && Math.max(br, bl) <= 16) return 'arch';
  if (half > 0 && Math.min(tl, tr, br, bl) >= half - 1) return 'pill';
  return clamp(round(median([tl, tr, br, bl])), 0, 48);
}
function shapeOf(boxes: LookBox[], allowArch: boolean, min: number): PhotoRadius | undefined {
  if (boxes.length < min) return undefined;
  const shapes = boxes.map(box => radiusOf(box, allowArch));
  const kind = majority(shapes.map(shape => typeof shape === 'number' ? 'n' : shape), min);
  if (kind === 'pill' || kind === 'arch') return kind;
  if (kind !== 'n') return undefined;
  const numbers = shapes.filter((shape): shape is number => typeof shape === 'number');
  const mid = median(numbers);
  return numbers.filter(n => Math.abs(n - mid) <= 4).length / numbers.length >= 0.6 ? round(mid) : undefined;
}
function edgeOf(box: LookBox): LookEdge {
  const outer = box.shadows.filter(shadow => !shadow.inset);
  if (outer.some(s => s.blur === 0 && Math.max(Math.abs(s.x), Math.abs(s.y)) >= 2)) return 'offset';
  if (outer.some(s => s.blur > 0)) return 'soft';
  if (box.borderWidth >= 2 || outer.some(s => s.blur === 0 && s.spread >= 2)) return 'outline';
  if (box.borderWidth >= 0.5 || outer.some(s => s.blur === 0 && s.spread >= 0.5)) return 'hairline';
  return 'none';
}
function treatmentOf(photo: LookPhoto): LookTreatment {
  if (photo.grayscale >= 0.8 && photo.blend !== 'normal') return 'duotone';
  if (photo.grayscale >= 0.8) return 'mono';
  if (photo.sepia >= 0.5) return 'sepia';
  if (photo.overlay) return 'grain';
  if (photo.padding >= 6 && photo.lightBacking) return 'polaroid';
  return 'natural';
}
function aspectOf(photos: LookPhoto[]): LookAspect | undefined {
  if (photos.length < 2) return undefined;
  const ratios = photos.map(photo => photo.width / photo.height);
  if (Math.max(...ratios) / Math.min(...ratios) > 1.6) return 'free';
  const mid = median(ratios);
  return mid < 0.9 ? 'portrait' : mid > 1.15 ? 'landscape' : 'square';
}
function surfaceOf(reading: LookReading): LookSurface | undefined {
  if (reading.sections.length < 2) return undefined;
  const light = reading.pageLuminance > 0.5;
  if (reading.sections.some(band => light ? band.luminance < 0.2 : band.luminance > 0.8)) return 'banded';
  return new Set(reading.sections.map(band => band.background)).size >= 2 ? 'tinted' : 'flat';
}
const compact = <T extends object>(value: T): T | undefined => Object.values(value).some(v => v !== undefined) ? Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T : undefined;

export function lookFromReading(reading: LookReading, declared: { treatment?: string } = {}): StoreLook | undefined {
  const h = reading.heading;
  const family = h?.families.find(name => FAMILY.test(name) && reading.loadedFamilies.some(loaded => loaded.toLowerCase() === name.toLowerCase()));
  const heading = h ? compact<LookHeading>({ family, weight: clamp(round(h.weight, 100), 300, 900), case: h.transform === 'uppercase' || h.literalUpper ? 'upper' : 'none', tracking: h.fontSize ? clamp(round(h.letterSpacing / h.fontSize, 0.01), -0.05, 0.3) : undefined, italic: h.italic }) : undefined;
  const label: LookLabel | undefined = reading.labels.length >= 3 ? { case: 'upper', tracking: clamp(round(median(reading.labels.map(l => l.fontSize ? l.letterSpacing / l.fontSize : 0)), 0.01), 0, 0.3), weight: clamp(round(median(reading.labels.map(l => l.weight)), 100), 300, 900) } : undefined;
  const shape = compact({ photo: shapeOf(reading.photos, true, 3), card: shapeOf(reading.cards, false, 3) as LookRadius | undefined, button: shapeOf(reading.buttons, false, 2) as LookRadius | undefined });
  const edge = majority([...reading.photos, ...reading.cards].map(edgeOf));
  const drawn = declared.treatment ? DRAW_TREATMENTS[declared.treatment] : undefined;
  const tilts = reading.photos.map(photo => Math.abs(photo.rotate)).filter(angle => angle >= 0.5);
  const photo = compact({ treatment: drawn ?? (reading.photos.length >= 2 ? majority(reading.photos.map(treatmentOf)) : undefined), aspect: aspectOf(reading.photos), tilt: tilts.length >= 2 ? clamp(round(median(tilts), 0.5), 0, 4) : undefined });
  const look: StoreLook = { version: 1 };
  const type = compact({ heading, label });
  if (type) look.type = type;
  if (shape) look.shape = shape;
  if (edge) look.edge = edge;
  if (photo) look.photo = photo;
  const surface = surfaceOf(reading);
  if (surface) look.surface = surface;
  return Object.keys(look).length > 1 ? look : undefined;
}

const inRange = (value: unknown, low: number, high: number): value is number => typeof value === 'number' && Number.isFinite(value) && value >= low && value <= high;
const oneOf = <T extends string>(list: readonly T[], value: unknown): T | undefined => (list as readonly unknown[]).includes(value) ? value as T : undefined;
const radius = (value: unknown, arch: boolean): PhotoRadius | undefined => value === 'pill' || (arch && value === 'arch') ? value as PhotoRadius : inRange(value, 0, 48) ? Math.round(value) : undefined;
/** A stored look, validated again (idempotent). Unknown keys and out-of-range values are dropped, never coerced. */
export function sanitizeLook(raw: unknown): StoreLook | undefined {
  if (!raw || typeof raw !== 'object' || (raw as { version?: unknown }).version !== 1) return undefined;
  const input = raw as Record<string, any>;
  const h = input.type?.heading, l = input.type?.label;
  const heading = h && typeof h === 'object' ? compact<LookHeading>({
    family: typeof h.family === 'string' && FAMILY.test(h.family) ? h.family : undefined,
    weight: inRange(h.weight, 300, 900) ? h.weight : undefined,
    case: oneOf(['none', 'upper'] as const, h.case),
    tracking: inRange(h.tracking, -0.05, 0.3) ? h.tracking : undefined,
    italic: typeof h.italic === 'boolean' ? h.italic : undefined,
  }) : undefined;
  const label = l && typeof l === 'object' && l.case === 'upper' ? { case: 'upper' as const, ...(inRange(l.tracking, 0, 0.3) ? { tracking: l.tracking } : {}), ...(inRange(l.weight, 300, 900) ? { weight: l.weight } : {}) } : undefined;
  const shape = input.shape && typeof input.shape === 'object' ? compact({ photo: radius(input.shape.photo, true), card: radius(input.shape.card, false) as LookRadius | undefined, button: radius(input.shape.button, false) as LookRadius | undefined }) : undefined;
  const photo = input.photo && typeof input.photo === 'object' ? compact({ treatment: oneOf(LOOK_TREATMENTS, input.photo.treatment), aspect: oneOf(LOOK_ASPECTS, input.photo.aspect), tilt: inRange(input.photo.tilt, 0, 4) ? input.photo.tilt : undefined }) : undefined;
  const look: StoreLook = { version: 1 };
  const type = compact({ heading, label });
  if (type) look.type = type;
  if (shape) look.shape = shape;
  const edge = oneOf(LOOK_EDGES, input.edge);
  if (edge) look.edge = edge;
  if (photo) look.photo = photo;
  const surface = oneOf(LOOK_SURFACES, input.surface);
  if (surface) look.surface = surface;
  return Object.keys(look).length > 1 ? look : undefined;
}

const CONFIG = /^\s*window\.PAGOSYA_CONFIG\s*=\s*([\s\S]*?);?\s*$/;
/** The parsed config.js of a file list; {} when missing or unreadable. */
export function readConfigFile(files: ReadonlyArray<{ path: string; content: string }>): Record<string, any> {
  const match = files.find(file => file.path === 'config.js')?.content.match(CONFIG);
  try { return match ? JSON.parse(match[1]) : {}; } catch { return {}; }
}
/** The file list with config.js rewritten by `patch`; every other file is returned as the same object. */
export function patchConfigFile<T extends { path: string; content: string }>(files: T[], patch: (config: Record<string, any>) => Record<string, any>): T[] {
  return files.map(file => {
    if (file.path !== 'config.js') return file;
    const match = file.content.match(CONFIG);
    if (!match) return file;
    try { return { ...file, content: `window.PAGOSYA_CONFIG = ${JSON.stringify(patch(JSON.parse(match[1])))};\n` }; } catch { return file; }
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/api && npx jest src/storefront-source/store-look.spec.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Append the planning amendments to the spec**

Append this section to the end of `docs/superpowers/specs/2026-10-14-one-look-per-store-design.md`:

```markdown
## Amendments from planning (2026-10-14)

1. Kit variables use the `--lk-*` prefix; attributes stay `data-look-*`. The kit already uses `--look-top`/`--look-left` for the quick-look chip.
2. The drawn photo treatment is already saved in `frame-draw.json` as `photos`, so nothing new needs storing. Only the photo treatment is a "declared" value; the heading font is measured, because the h1 already renders the concept's font.
3. Touch CSS is carried across chat edits by a `dna.touch: 1` marker. On a store with a design concept, `sourceRuntimeDna` re-seeds `productCss` from the concept on every save, so `KEPT_DNA` alone would lose it. New stores and redesigns never carry it.
4. The catalog "footer band" is dropped: catalog pages already reuse the home's own footer (`withSourceCommerceDesign`).
5. Guarded CSS parts:
   - Catalog: `page-title`, `tabs`, `group-title`, `grid`, `empty`. The kit has no filter or sort controls.
   - Card: `card`, `card-media`, `card-name`, `card-meta`, `card-badge`.
   - Cart, scoped to `.cart-drawer`: `cart-head`, `cart-line`, `cart-line-media`. The drawer shell keeps its DNA shape.
6. If the self-review call itself fails, the review stage fails as it does today and no touch is written. The store keeps layer A and the planner's `productCss`.
7. `type.label.case` is always `upper`, because labels are detected as small uppercase runs.
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/storefront-source/store-look.ts apps/api/src/storefront-source/store-look.spec.ts docs/superpowers/specs/2026-10-14-one-look-per-store-design.md
git commit -m "feat(look): the store look record — clamped classification of a measured home page (spec 2026-10-14)"
```

---

### Task 2: Measuring the home page in the browser

**Files:**
- Create: `apps/api/src/storefront-source/store-look-measure.ts`
- Test: `apps/api/src/storefront-source/store-look-measure.spec.ts`

**Interfaces:**
- Consumes: `LookReading`, `lookFromReading`, `sanitizeLook`, `patchConfigFile`, `StoreLook` (Task 1); `withVisualSandbox` from `./source-visual-capture`.
- Produces:
  - `readLookInPage(): LookReading`, a self-contained function for `page.evaluate`
  - `measureStoreLook(snapshot: SourceProjectSnapshot, options?: { signal?: AbortSignal; deadlineMs?: number }): Promise<LookReading | null>`
  - `type LookOutcome = 'measured' | 'kept' | 'off' | 'none'`
  - `withMeasuredLook<T extends { files: SourceProjectFileDto[] }>(input: T, options: { enabled: boolean; declaredTreatment?: string; previousLook?: unknown; brief?: unknown; signal?: AbortSignal; measure?: typeof measureStoreLook }): Promise<{ input: T; look?: StoreLook; outcome: LookOutcome; reason?: string }>`

- [ ] **Step 1: Write the failing tests**

```ts
// apps/api/src/storefront-source/store-look-measure.spec.ts
jest.setTimeout(120_000);
import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
import { kitPath } from '@pagosya/storefront-kit';
import { measureStoreLook, withMeasuredLook } from './store-look-measure';
import { lookFromReading, readConfigFile } from './store-look';
import type { SourceProjectSnapshot } from './source-project';

/** A one-page store: a stylesheet, an Anton font and three photos. Nothing leaves the sandbox. */
async function site(css: string, body: string): Promise<SourceProjectSnapshot> {
  const png = (await sharp({ create: { width: 600, height: 750, channels: 3, background: '#c08040' } }).png().toBuffer()).toString('base64');
  const font = (await readFile(kitPath('fonts/anton.ttf'))).toString('base64');
  return { brief: {}, files: [
    { path: 'index.html', content: `<!doctype html><html lang="es"><head><meta charset="utf-8"><link rel="stylesheet" href="styles.css"></head><body>${body}</body></html>`, encoding: 'utf8' },
    { path: 'styles.css', content: `@font-face{font-family:Anton;src:url(anton.ttf)}body{margin:0;background:#fff}${css}`, encoding: 'utf8' },
    { path: 'anton.ttf', content: font, encoding: 'base64' },
    { path: 'p.png', content: png, encoding: 'base64' },
  ] } as unknown as SourceProjectSnapshot;
}
const photos = (wrap = (img: string) => img) => [1, 2, 3].map(() => wrap('<img class="photo" src="p.png" alt="">')).join('');

describe('measureStoreLook', () => {
  it('reads a loaded heading font, its case and tracking, and the photo corners', async () => {
    const snapshot = await site('h1{font-family:Anton,serif;font-weight:400;text-transform:uppercase;letter-spacing:.1em;font-size:60px}.photo{width:300px;height:375px;border-radius:16px;object-fit:cover}',
      `<main><section style="height:400px"><h1>Tostadero</h1></section><section>${photos()}</section></main>`);
    const look = lookFromReading((await measureStoreLook(snapshot))!)!;
    expect(look.type?.heading).toMatchObject({ family: 'Anton', case: 'upper', tracking: 0.1 });
    expect(look.shape?.photo).toBe(16);
    expect(look.photo?.aspect).toBe('portrait');
  });

  it('reads print frames and their rotation as polaroid with tilt', async () => {
    const snapshot = await site('figure{margin:20px;padding:12px 12px 36px;background:#fff;box-shadow:0 6px 18px -8px #0006;display:inline-block;rotate:3deg}figure:nth-child(2){rotate:-2deg}.photo{display:block;width:260px;height:320px;object-fit:cover}body{background:#efe7da}',
      `<main><section>${photos(img => `<figure>${img}</figure>`)}</section></main>`);
    const look = lookFromReading((await measureStoreLook(snapshot))!)!;
    expect(look.photo?.treatment).toBe('polaroid');
    expect(look.photo?.tilt).toBeGreaterThanOrEqual(2);
  });

  it('reads offset-shadow cards and pill buttons', async () => {
    const card = '<div class="card"><img class="photo" src="p.png" alt=""><p>Café de altura</p></div>';
    const snapshot = await site('.card{box-shadow:6px 6px 0 #111;border-radius:0;width:260px}.photo{width:260px;height:260px;display:block}.btn{display:inline-block;padding:14px 24px;border-radius:999px;background:#111;color:#fff}',
      `<main><section><div class="grid">${card}${card}${card}</div><a class="btn" href="#a">Comprar</a> <a class="btn" href="#b">Ver más</a></section></main>`);
    const look = lookFromReading((await measureStoreLook(snapshot))!)!;
    expect(look.edge).toBe('offset');
    expect(look.shape?.button).toBe('pill');
  });

  it("ignores the kit's own cards and the header logo", async () => {
    const snapshot = await site('.photo{width:300px;height:300px}',
      `<header><img class="photo" src="p.png" alt="Logo"></header><main><div data-pagosya-catalog>${photos(img => `<article class="menu-item">${img}<p>Producto</p></article>`)}</div></main>`);
    const reading = (await measureStoreLook(snapshot))!;
    expect(reading.photos).toEqual([]);
    expect(reading.cards).toEqual([]);
  });
});

describe('withMeasuredLook', () => {
  const input = { files: [{ path: 'config.js', content: 'window.PAGOSYA_CONFIG = {"slug":"cafe"};\n' }] };
  const reading = { heading: { families: ['Anton'], weight: 400, transform: 'none', literalUpper: false, letterSpacing: 0, fontSize: 40, italic: false }, loadedFamilies: ['Anton'], labels: [], photos: [], cards: [], buttons: [], sections: [], pageLuminance: 1 };

  it('writes the measured look into config.js', async () => {
    const result = await withMeasuredLook(input, { enabled: true, measure: async () => reading });
    expect(result.outcome).toBe('measured');
    expect(readConfigFile(result.input.files).look).toEqual({ version: 1, type: { heading: { family: 'Anton', weight: 400, case: 'none', tracking: 0, italic: false } } });
  });

  it('keeps the previous look when measuring throws, and never throws itself', async () => {
    const previousLook = { version: 1, edge: 'soft' };
    const result = await withMeasuredLook(input, { enabled: true, previousLook, measure: async () => { throw new Error('browser crashed'); } });
    expect(result.outcome).toBe('kept');
    expect(result.reason).toMatch(/browser crashed/);
    expect(readConfigFile(result.input.files).look).toEqual(previousLook);
  });

  it('keeps the previous look and does not measure when switched off', async () => {
    const measure = jest.fn();
    const result = await withMeasuredLook(input, { enabled: false, previousLook: { version: 1, edge: 'none' }, measure });
    expect(measure).not.toHaveBeenCalled();
    expect(readConfigFile(result.input.files).look).toEqual({ version: 1, edge: 'none' });
  });

  it('returns the input unchanged when there is no look at all', async () => {
    const result = await withMeasuredLook(input, { enabled: true, measure: async () => null });
    expect(result.input).toBe(input);
    expect(result.outcome).toBe('none');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/api && npx jest src/storefront-source/store-look-measure.spec.ts`
Expected: FAIL with "Cannot find module './store-look-measure'".

- [ ] **Step 3: Write the implementation**

```ts
// apps/api/src/storefront-source/store-look-measure.ts
/// <reference lib="dom" />
/** Layer A of one look per store (spec 2026-10-14): render the store's own home page once, offline, and read what it
 * actually does (headline type, corners, edges, photo look, section rhythm). Never calls a model; never fails a save. */
import { withVisualSandbox } from './source-visual-capture';
import { lookFromReading, patchConfigFile, sanitizeLook, type LookReading, type StoreLook } from './store-look';
import type { SourceProjectSnapshot } from './source-project';
import type { SourceProjectFileDto } from './dto/save-source-project.dto';

const origin = 'https://preview.invalid';

/** Runs inside the page (serialized by page.evaluate): no outer references. Kit-owned parts, the header, the nav and the
 * footer are skipped, so the kit never measures itself and the logo never counts as a photo. */
export function readLookInPage(): LookReading {
  const px = (value: string) => parseFloat(value) || 0;
  const kitOwned = (el: Element) => Boolean(el.closest('.menu-item:not([data-custom-product]),[data-pagosya-cart],.cart-drawer,[data-pagosya-product],header,footer,nav'));
  const shown = (el: Element) => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && parseFloat(s.opacity) > 0.05; };
  const alpha = (value: string) => { const m = value.match(/rgba?\(([^)]+)\)/); if (!m) return 0; const parts = m[1].split(/[\s,/]+/).filter(Boolean); return parts.length > 3 ? parseFloat(parts[3]) : 1; };
  const luminance = (value: string) => {
    const channels = (value.match(/[\d.]+/g) ?? ['255', '255', '255']).slice(0, 3).map(Number).map(v => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  };
  const shadows = (value: string) => value === 'none' ? [] : value.split(/,(?![^(]*\))/).map(part => { const n = (part.match(/-?\d*\.?\d+px/g) ?? []).map(px); return { x: n[0] ?? 0, y: n[1] ?? 0, blur: n[2] ?? 0, spread: n[3] ?? 0, inset: /\binset\b/.test(part) }; });
  const corner = (value: string, size: number) => { const first = value.split(' ')[0]; return first.endsWith('%') ? parseFloat(first) / 100 * size : px(first); };
  const box = (el: Element) => {
    const r = el.getBoundingClientRect(), s = getComputedStyle(el);
    return { width: r.width, height: r.height, radii: [corner(s.borderTopLeftRadius, r.width), corner(s.borderTopRightRadius, r.width), corner(s.borderBottomRightRadius, r.width), corner(s.borderBottomLeftRadius, r.width)] as [number, number, number, number], borderWidth: Math.max(px(s.borderTopWidth), px(s.borderLeftWidth)), shadows: shadows(s.boxShadow) };
  };
  const angle = (s: CSSStyleDeclaration) => {
    const own = s.rotate && s.rotate !== 'none' ? parseFloat(s.rotate) : 0;
    const m = s.transform.match(/^matrix\(([^)]+)\)$/);
    const fromMatrix = m ? (() => { const [a, b] = m[1].split(',').map(Number); return Math.atan2(b, a) * 180 / Math.PI; })() : 0;
    return own || fromMatrix;
  };
  const amount = (filter: string, name: string) => { const m = filter.match(new RegExp(`${name}\\(([\\d.]+)(%?)\\)`)); return m ? Number(m[1]) / (m[2] ? 100 : 1) : 0; };
  const upperText = (text: string) => /\p{L}{2}/u.test(text) && text === text.toLocaleUpperCase('es');

  const headings = Array.from(document.querySelectorAll('h1, h2, h3')).filter(el => shown(el) && !kitOwned(el));
  const top = headings.find(el => el.tagName === 'H1') ?? headings.sort((a, b) => px(getComputedStyle(b).fontSize) - px(getComputedStyle(a).fontSize))[0];
  const hs = top ? getComputedStyle(top) : null;
  const heading = top && hs ? {
    families: hs.fontFamily.split(',').map(f => f.trim().replace(/^["']|["']$/g, '')),
    weight: Number(hs.fontWeight) || 400, transform: hs.textTransform, literalUpper: upperText(top.textContent?.trim() ?? ''),
    letterSpacing: hs.letterSpacing === 'normal' ? 0 : px(hs.letterSpacing), fontSize: px(hs.fontSize), italic: hs.fontStyle === 'italic',
  } : null;
  const loadedFamilies = Array.from(document.fonts as unknown as Iterable<FontFace>).filter(font => font.status === 'loaded').map(font => font.family.replace(/^["']|["']$/g, ''));

  const everything = Array.from(document.querySelectorAll('body *'));
  const labels = everything.filter(el => el.children.length === 0 && !kitOwned(el) && shown(el)).flatMap(el => {
    const s = getComputedStyle(el), text = el.textContent?.trim() ?? '';
    return text.length >= 3 && text.length <= 40 && px(s.fontSize) <= 14 && (s.textTransform === 'uppercase' || upperText(text))
      ? [{ letterSpacing: s.letterSpacing === 'normal' ? 0 : px(s.letterSpacing), fontSize: px(s.fontSize), weight: Number(s.fontWeight) || 400 }] : [];
  }).slice(0, 20);

  const photos = Array.from(document.images).filter(img => shown(img) && !kitOwned(img))
    .map(img => ({ img, rect: img.getBoundingClientRect() })).filter(({ rect }) => rect.width >= 120 && rect.height >= 120)
    .sort((a, b) => b.rect.width * b.rect.height - a.rect.width * a.rect.height).slice(0, 8)
    .map(({ img, rect }) => {
      const parent = img.parentElement, ps = parent ? getComputedStyle(parent) : null, pr = parent?.getBoundingClientRect();
      // A wrapper that hugs the photo (clips it, pads it like a print, shadows or rounds it) is the photo's frame.
      const hugs = Boolean(parent && ps && pr && pr.width <= rect.width + 80 && (ps.overflow !== 'visible' || px(ps.paddingTop) >= 6 || ps.boxShadow !== 'none' || px(ps.borderTopLeftRadius) > 0));
      const frame = hugs ? parent! : img;
      const s = getComputedStyle(img), fs = getComputedStyle(frame);
      const after = parent ? getComputedStyle(parent, '::after') : null;
      const overlay = Boolean(after && after.content !== 'none' && after.backgroundImage !== 'none');
      const blend = s.mixBlendMode !== 'normal' ? s.mixBlendMode : overlay && after!.mixBlendMode !== 'normal' ? after!.mixBlendMode : 'normal';
      const filter = `${s.filter} ${fs.filter}`;
      return { ...box(frame), width: rect.width, height: rect.height, grayscale: amount(filter, 'grayscale'), sepia: amount(filter, 'sepia'), blend, overlay,
        padding: hugs ? px(fs.paddingTop) : 0, lightBacking: hugs && alpha(fs.backgroundColor) > 0.9 && luminance(fs.backgroundColor) > 0.8, rotate: angle(s) || angle(fs) };
    });

  const groups = new Map<Element, Element[]>();
  for (const el of everything) {
    const parent = el.parentElement;
    if (!parent || kitOwned(el) || !shown(el) || !el.querySelector('img') || (el.textContent?.trim().length ?? 0) < 3) continue;
    groups.set(parent, [...(groups.get(parent) ?? []), el]);
  }
  const cardGroup = Array.from(groups.values()).filter(list => list.length >= 3 && new Set(list.map(el => `${el.tagName}.${el.className}`)).size === 1).sort((a, b) => b.length - a.length)[0] ?? [];
  const cards = cardGroup.slice(0, 6).map(box);

  const buttons = Array.from(document.querySelectorAll('a, button')).filter(el => shown(el) && !kitOwned(el)).filter(el => {
    const s = getComputedStyle(el), r = el.getBoundingClientRect();
    return r.height >= 32 && r.height <= 80 && px(s.paddingLeft) >= 10 && (alpha(s.backgroundColor) > 0.5 || px(s.borderTopWidth) >= 1);
  }).slice(0, 8).map(box);

  const pageBg = [document.body, document.documentElement].map(el => getComputedStyle(el).backgroundColor).find(c => alpha(c) > 0.5) ?? 'rgb(255, 255, 255)';
  let container: Element = document.querySelector('main') ?? document.body;
  while (container.children.length === 1) container = container.children[0];
  const sections = Array.from(container.children).filter(el => shown(el) && el.getBoundingClientRect().height >= 200 && el.getBoundingClientRect().width >= innerWidth * 0.9)
    .map(el => { const c = getComputedStyle(el).backgroundColor, background = alpha(c) > 0.9 ? c : pageBg; return { luminance: luminance(background), background }; });

  return { heading, loadedFamilies, labels, photos, cards, buttons, sections, pageLuminance: luminance(pageBg) };
}

/** One render of index.html at 1280×800 with reduced motion. Null when the snapshot has no home page. */
export async function measureStoreLook(snapshot: SourceProjectSnapshot, options: { signal?: AbortSignal; deadlineMs?: number } = {}): Promise<LookReading | null> {
  if (!snapshot.files.some(file => file.path === 'index.html')) return null;
  const deadline = AbortSignal.timeout(options.deadlineMs ?? 15_000);
  const signal = options.signal ? AbortSignal.any([options.signal, deadline]) : deadline;
  return withVisualSandbox(snapshot, '', signal, false, async context => {
    const page = await context.newPage();
    page.setDefaultTimeout(5000);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`${origin}/index.html`, { waitUntil: 'load', timeout: 10_000 });
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    return page.evaluate(readLookInPage);
  });
}

export type LookOutcome = 'measured' | 'kept' | 'off' | 'none';
/** The save with config.look written: freshly measured, else the store's previous look, else unchanged. Never throws for
 * a failed measurement; rethrows only when the caller's own signal was aborted. */
export async function withMeasuredLook<T extends { files: SourceProjectFileDto[] }>(input: T, options: { enabled: boolean; declaredTreatment?: string; previousLook?: unknown; brief?: unknown; signal?: AbortSignal; measure?: typeof measureStoreLook }): Promise<{ input: T; look?: StoreLook; outcome: LookOutcome; reason?: string }> {
  const kept = sanitizeLook(options.previousLook);
  let look: StoreLook | undefined = kept;
  let outcome: LookOutcome = !options.enabled ? (kept ? 'kept' : 'off') : kept ? 'kept' : 'none';
  let reason: string | undefined;
  if (options.enabled) {
    try {
      const reading = await (options.measure ?? measureStoreLook)({ brief: options.brief, files: input.files } as unknown as SourceProjectSnapshot, { signal: options.signal });
      const measured = reading ? lookFromReading(reading, { treatment: options.declaredTreatment }) : undefined;
      if (measured) { look = measured; outcome = 'measured'; }
    } catch (error) {
      options.signal?.throwIfAborted();
      reason = ((error as Error)?.message || 'sin respuesta').slice(0, 200);
    }
  }
  if (!look) return { input, outcome, reason };
  return { input: { ...input, files: patchConfigFile(input.files, config => ({ ...config, look })) }, look, outcome, reason };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/api && npx jest src/storefront-source/store-look-measure.spec.ts`
Expected: PASS. If the polaroid test reads `natural`, check that `figure` is the img's parent and that `hugs` is true (its padding is 12px). Do not loosen the expectations.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/storefront-source/store-look-measure.ts apps/api/src/storefront-source/store-look-measure.spec.ts
git commit -m "feat(look): measure the home page offline and write config.look (keeps the previous look on failure)"
```

---

### Task 3: Measure on every YAPI save

**Files:**
- Modify: `apps/api/src/config/configuration.ts` (type near line 84, values near line 428)
- Modify: `apps/api/src/storefront-source/source-generation.service.ts` (`assembleSave`, lines ~1461–1535, and the review closure's call at ~1008)
- Test: `apps/api/src/storefront-source/source-generation-review.spec.ts`

**Interfaces:**
- Consumes: `withMeasuredLook`, `measureStoreLook` (Task 2); `parseFrameDraw` (already imported in the service).
- Produces:
  - `assembleSave(assembleSignal?: AbortSignal)`
  - every saved `config.js` carries `look` when one exists
  - config keys `app.yapiLookMeasure` and `app.yapiKitTouch` (the second is used in Task 7)

- [ ] **Step 1: Write the failing tests**

At the top of `source-generation-review.spec.ts`, next to the other `jest.mock` lines, add:

```ts
// Measuring launches Chromium; these tests exercise what the service does with a reading.
jest.mock('./store-look-measure', () => ({ ...jest.requireActual('./store-look-measure'), measureStoreLook: jest.fn().mockResolvedValue(null) }));
import { measureStoreLook } from './store-look-measure';
```

At the end of the file, add:

```ts
describe('one look per store: measured at every save', () => {
  let service: SourceGenerationService, projects: any, config: any;
  const configOf = (call: any[]) => JSON.parse(call[2].files.find((f: any) => f.path === 'config.js').content.replace(/^window\.PAGOSYA_CONFIG = /, '').replace(/;\s*$/, ''));
  const reading = { heading: { families: ['Anton'], weight: 400, transform: 'uppercase', literalUpper: false, letterSpacing: 4, fontSize: 40, italic: false }, loadedFamilies: ['Anton'], labels: [], photos: [], cards: [], buttons: [], sections: [], pageLuminance: 1 };
  beforeEach(() => {
    ({ service, projects, config } = setup());
    jest.spyOn(SourceDesignPlanner.prototype, 'explore').mockResolvedValue(threeConceptDesign);
    jest.spyOn(designModule, 'sourceDesignExploration').mockReturnValue(designModule.sourceDesignExploration(0));
    config.set('app.sep5SelfReview', false);
    jest.spyOn(globalThis, 'fetch').mockImplementation(respond(async () => answer(REVIEW)) as any);
    (measureStoreLook as jest.Mock).mockReset().mockResolvedValue(null);
  });
  afterEach(() => jest.restoreAllMocks());

  it('writes the measured look into the saved config.js', async () => {
    config.set('app.yapiLookMeasure', true);
    (measureStoreLook as jest.Mock).mockResolvedValue(reading);
    await service.generate('m1', 's1', dto, new SourceRequestBudget(25), []);
    expect(configOf(projects.save.mock.calls[0]).look).toMatchObject({ version: 1, type: { heading: { family: 'Anton', case: 'upper', tracking: 0.1 } } });
  });

  it('still saves when measuring fails, without a look', async () => {
    config.set('app.yapiLookMeasure', true);
    (measureStoreLook as jest.Mock).mockRejectedValue(new Error('chromium crashed'));
    await service.generate('m1', 's1', dto, new SourceRequestBudget(25), []);
    expect(projects.save).toHaveBeenCalledTimes(1);
    expect(configOf(projects.save.mock.calls[0]).look).toBeUndefined();
  });

  it('does not measure when YAPI_LOOK_MEASURE is off', async () => {
    config.set('app.yapiLookMeasure', false);
    await service.generate('m1', 's1', dto, new SourceRequestBudget(25), []);
    expect(measureStoreLook).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/api && npx jest src/storefront-source/source-generation-review.spec.ts -t "one look per store"`
Expected: FAIL. The first test finds no `look` in config.js.

- [ ] **Step 3: Add the flags**

In `apps/api/src/config/configuration.ts`, next to `yapiFrameDraw: boolean;` in the type, add:

```ts
  /** One look per store (spec 2026-10-14): measure the home page at every save. YAPI_LOOK_MEASURE=off disables. */
  yapiLookMeasure: boolean;
  /** One look per store: YAPI's guarded touches on the kit pages in Sep-5 builds. YAPI_KIT_TOUCH=off disables. */
  yapiKitTouch: boolean;
```

and next to `yapiFrameDraw: process.env.YAPI_FRAME_DRAW !== 'off',` in the values, add:

```ts
    yapiLookMeasure: process.env.YAPI_LOOK_MEASURE !== 'off',
    yapiKitTouch: process.env.YAPI_KIT_TOUCH !== 'off',
```

- [ ] **Step 4: Measure in `assembleSave`**

In `source-generation.service.ts`:

1. Add the import next to the other storefront-source imports:

```ts
import { measureStoreLook, withMeasuredLook } from './store-look-measure';
```

2. Change the declaration `const assembleSave = async () => {` to:

```ts
    const assembleSave = async (assembleSignal: AbortSignal = signal) => {
```

3. The function ends with one statement that starts `      return { revision: dto.revision, label: generated.label, brief: dto.brief, files: await withSourceMotion(` and ends `, motion) };`. Change only its wrapper so the assembled object is measured before it is returned. Keep the inner file list byte-identical:

```ts
      const assembled = { revision: dto.revision, label: generated.label, brief: dto.brief, files: await withSourceMotion(platformHeader(await withSourceCommerceDesign(await withSourceFonts(await withSourceAssets([
        /* … the existing file list, unchanged … */
      ], previousFiles, assetLegend, imageUses, photoFacts))), []), motion) };
      // One look per store (spec 2026-10-14): read the final home page and keep it as config.look for the kit pages.
      const measured = await withMeasuredLook(assembled, { enabled: this.config.get<boolean>('app.yapiLookMeasure') === true, declaredTreatment: parseFrameDraw(frame.file?.content).photos, previousLook: previousConfig.look, brief: dto.brief, signal: assembleSignal, measure: measureStoreLook });
      this.logger.log(JSON.stringify({ event: measured.outcome === 'measured' ? 'look_measured' : 'look_kept', generationId: run.id, outcome: measured.outcome, ...(measured.reason ? { reason: measured.reason } : {}) }));
      return measured.input;
```

4. In the Sep-5 review closure, change `return { saveInput: await assembleSave(), notes: result.data.notes };` to:

```ts
            return { saveInput: await assembleSave(review.signal), notes: result.data.notes };
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd apps/api && npx jest src/storefront-source/source-generation-review.spec.ts`
Expected: PASS, both the new block and every existing test in the file.

- [ ] **Step 6: Run the neighbouring service specs**

Run: `cd apps/api && npx jest src/storefront-source/source-generation.service.spec.ts src/storefront-source/source-generation-style.spec.ts src/storefront-source/source-generation-header.spec.ts`
Expected: the same pass/fail counts as on the commit before this task. A memory note records one pre-existing fingerprint failure in `source-generation.service.spec.ts`. If a count differs, run the same files on the previous commit in a scratch worktree (`git worktree add`) to tell new failures from old ones.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/config/configuration.ts apps/api/src/storefront-source/source-generation.service.ts apps/api/src/storefront-source/source-generation-review.spec.ts
git commit -m "feat(look): every YAPI save measures the home page into config.look (YAPI_LOOK_MEASURE=off disables)"
```

---

### Task 4: The kit reads the look on the product page

**Files:**
- Create: `apps/merchant-studio/tests/kit-look-harness.ts`
- Create: `apps/merchant-studio/tests/kit-no-look-baseline.spec.ts` (and its committed screenshots)
- Create: `apps/merchant-studio/tests/store-look.spec.ts`
- Modify: `packages/storefront-kit/kit/commerce.js`:
  - after the `COMMERCE_DNA` block (~line 68)
  - new CSS constants after `DNA_PAGE_CSS`
  - the `if (hasDna) { … }` style-injection block (~3765–3790)

**Interfaces:**
- Consumes: the `config.look` shape from Task 1, which the kit reads and validates again.
- Produces, inside the kit (Task 5 uses these):
  - `LOOK`: the validated look, or null
  - `lookHeadingRules(target: string): string[]`
  - `LOOK_FILTERED` (selector prefix)
  - `LOOK_BASE_CSS` and `LOOK_PDP_CSS`
  - `lookFilters()`
  - `THEME_CSS_KEYS` (Task 6 extends it)
  - Attributes: `data-look`, `data-look-hf|hw|hc|ht|hi|label|rp|rc|rb|edge|photo|aspect|tilt|surface`
  - Variables: `--lk-hf, --lk-hw, --lk-ht, --lk-lt, --lk-lw, --lk-rp, --lk-rc, --lk-rb, --lk-aspect, --lk-tilt, --lk-ink, --lk-paper, --lk-line, --lk-edge, --lk-filter, --lk-grain`
- Produces for tests: `openKitPage(page, options)`, `openCart(page)` and `style(page, selector, property)` from `kit-look-harness.ts`, reused by Tasks 5 and 6.

- [ ] **Step 1: Write the shared harness**

```ts
// apps/merchant-studio/tests/kit-look-harness.ts
import { expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { kitPath } from '@pagosya/storefront-kit';

/** One look per store (spec 2026-10-14): the kit's product page, catalog and cart on a demo catalog, with an optional
 * config.look and DNA. Demo data only; nothing is written to a merchant store. */
const kit = (name: string) => readFileSync(kitPath(name), 'utf8');
const photo = readFileSync(new URL('./fixtures/retention-product.webp', import.meta.url));
const anton = readFileSync(kitPath('fonts/anton.ttf'));
export const ITEMS = [
  { id: 'cafe', name: 'Café de altura Caranavi', description: 'Tostado medio, notas de cacao y panela.', amount: 8500, currency: 'BOB', stock: 30, badge: 'Más vendido', recommendedProductIds: ['taza', 'molinillo'],
    imageUrls: ['https://img.test/1.webp', 'https://img.test/2.webp', 'https://img.test/3.webp'],
    variants: [{ id: 'g250', name: '250 g', amount: 8500, stock: 10, options: [{ name: 'Peso', value: '250 g' }] }, { id: 'g500', name: '500 g', amount: 15500, stock: 10, options: [{ name: 'Peso', value: '500 g' }] }] },
  { id: 'taza', name: 'Taza esmaltada', description: 'Cerámica de Cochabamba.', amount: 6000, currency: 'BOB', stock: 12, imageUrls: ['https://img.test/4.webp'] },
  { id: 'molinillo', name: 'Molinillo manual', description: 'Muelas cerámicas.', amount: 22000, currency: 'BOB', stock: 4, imageUrls: ['https://img.test/5.webp'] },
];
export const LIGHT = '--store-background:#f5efe6;--store-foreground:#2b211d;--store-accent:#5a4032;--store-accent-foreground:#ffffff';
export const DARK = '--store-background:#16120f;--store-foreground:#f4ede4;--store-accent:#e0b070;--store-accent-foreground:#16120f';
export type KitPageOptions = { path?: 'product.html' | 'productos.html'; style?: string; look?: unknown; dna?: Record<string, unknown>; tokens?: string; cart?: boolean };

export async function openKitPage(page: Page, options: KitPageOptions = {}) {
  const path = options.path ?? 'product.html';
  const config = { demo: true, slug: 'kit', productPage: 'product.html', ...(options.style ? { productPageStyle: options.style } : {}), dna: { version: 1, ...(options.dna ?? {}) }, ...(options.look ? { look: options.look } : {}), data: { storeName: 'Tostadero Yungas', shippingPickupEnabled: true, items: ITEMS } };
  const main = path === 'product.html' ? '<main data-pagosya-product-page></main>' : '<h1 class="commerce-page-title">Productos</h1><main data-pagosya-catalog data-catalog-full></main>';
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${kit('commerce-pages.css')}@font-face{font-family:Anton;src:url(https://kit.test/fonts/anton.ttf)}:root{${options.tokens ?? LIGHT}}body{margin:0;font-family:Arial,sans-serif}</style></head><body class="commerce-document"><header class="commerce-header"><a href="index.html" data-store-name>Tostadero Yungas</a><nav aria-label="Tienda"><button type="button" data-cart-open>Mi pedido (<span data-cart-count>0</span>)</button></nav></header>${main}<div data-pagosya-cart hidden></div><p data-pagosya-status></p><script>window.PAGOSYA_CONFIG=${JSON.stringify(config)}</script><script>${kit('commerce.js')}</script></body></html>`;
  await page.route('https://kit.test/**', route => route.fulfill({ contentType: 'text/html', body: html }));
  await page.route('https://kit.test/fonts/anton.ttf', route => route.fulfill({ contentType: 'font/ttf', body: anton }));
  await page.route('https://img.test/**', route => route.fulfill({ contentType: 'image/webp', body: photo }));
  if (options.cart) await page.addInitScript(() => sessionStorage.setItem('pagosya:cart:kit', JSON.stringify([{ id: 'taza', quantity: 1 }])));
  await page.goto(`https://kit.test/${path}${path === 'product.html' ? '?id=cafe' : ''}`);
  if (path === 'product.html') {
    await expect(page.locator('#pagosya-product-title')).toBeVisible();
    await page.locator('.product-detail__photo').first().evaluate((img: HTMLImageElement) => img.decode());
  } else await expect(page.locator('[data-pagosya-catalog] .menu-item').first()).toBeVisible();
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

/** Opens the cart drawer (the page must have been opened with `cart: true`). */
export async function openCart(page: Page) {
  await page.locator('header [data-cart-open]').click();
  await expect(page.locator('.cart-drawer[open]')).toBeVisible();
  await page.waitForTimeout(400);
}

export const style = (page: Page, selector: string, property: string) => page.locator(selector).first().evaluate((el, prop) => getComputedStyle(el).getPropertyValue(prop), property);
```

- [ ] **Step 2: Write the no-look baseline and record it on the untouched kit**

```ts
// apps/merchant-studio/tests/kit-no-look-baseline.spec.ts
import { expect, test } from '@playwright/test';
import { openCart, openKitPage } from './kit-look-harness';

// One look per store (spec 2026-10-14): a store without config.look and without touch CSS renders exactly as before.
// The screenshots were recorded on the kit BEFORE the look layer existed; every later kit change must keep them.
const STYLES = ['editorial', 'dense', 'image-led', 'story-led', 'conversion'];
const SHOT = { maxDiffPixelRatio: 0.002, animations: 'disabled' as const };

for (const style of STYLES) test(`no look: ${style} product page is unchanged`, async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openKitPage(page, { style });
  await expect(page).toHaveScreenshot(`no-look-${style}.png`, { ...SHOT, fullPage: true });
});

test('no look: catalog page and cart drawer are unchanged', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openKitPage(page, { path: 'productos.html', cart: true });
  await expect(page).toHaveScreenshot('no-look-catalog.png', SHOT);
  await openCart(page);
  await expect(page).toHaveScreenshot('no-look-cart.png', SHOT);
});

test('no look: the kit sets no look attribute and no look stylesheet', async ({ page }) => {
  await openKitPage(page, { style: 'dense' });
  expect(await page.evaluate(() => [...document.documentElement.attributes].map(a => a.name).filter(n => n.startsWith('data-look')))).toEqual([]);
  await expect(page.locator('style[data-pagosya-kit="look"]')).toHaveCount(0);
});
```

Run: `cd apps/merchant-studio && npx playwright test tests/kit-no-look-baseline.spec.ts --update-snapshots`
Expected: 7 passed; screenshots written to `tests/kit-no-look-baseline.spec.ts-snapshots/`.

Run it again without `--update-snapshots`. Expected: 7 passed.

Commit the baseline on its own, before touching the kit:

```bash
git add apps/merchant-studio/tests/kit-look-harness.ts apps/merchant-studio/tests/kit-no-look-baseline.spec.ts apps/merchant-studio/tests/kit-no-look-baseline.spec.ts-snapshots
git commit -m "test(kit): no-look baseline screenshots of the product page, catalog and cart (spec 2026-10-14)"
```

- [ ] **Step 3: Write the failing product-page look tests**

```ts
// apps/merchant-studio/tests/store-look.spec.ts
import { expect, test } from '@playwright/test';
import { DARK, openCart, openKitPage, style } from './kit-look-harness';

// One look per store (spec 2026-10-14): the kit follows config.look, measured from the store's own home page.
const BOLD = { version: 1, type: { heading: { family: 'Anton', weight: 800, case: 'upper', tracking: 0.1 }, label: { case: 'upper', tracking: 0.14, weight: 700 } },
  shape: { photo: 20, card: 20, button: 'pill' }, edge: 'offset', photo: { treatment: 'mono', aspect: 'square' }, surface: 'banded' };

test('product title follows the home headline: family, weight, case, tracking', async ({ page }) => {
  await openKitPage(page, { style: 'editorial', look: BOLD });
  expect(await style(page, '[data-part=title]', 'font-family')).toContain('Anton');
  expect(await style(page, '[data-part=title]', 'font-weight')).toBe('800');
  expect(await style(page, '[data-part=title]', 'text-transform')).toBe('uppercase');
  const [spacing, size] = await page.locator('[data-part=title]').evaluate(el => [parseFloat(getComputedStyle(el).letterSpacing), parseFloat(getComputedStyle(el).fontSize)]);
  expect(spacing / size).toBeCloseTo(0.1, 2);
});

test('dense keeps the measured heading font instead of switching to the body font', async ({ page }) => {
  await openKitPage(page, { style: 'dense', look: BOLD });
  expect(await style(page, '[data-part=title]', 'font-family')).toContain('Anton');
});

test('corners follow the home, with no 6px cap', async ({ page }) => {
  await openKitPage(page, { style: 'dense', look: BOLD });
  expect(await style(page, '.product-detail__buybox', 'border-top-left-radius')).toBe('20px');
  expect(await style(page, '.product-detail__photo', 'border-top-left-radius')).toBe('20px');
  expect(await style(page, '.product-detail__values:not([data-kind=swatch]) [data-product-option]', 'border-top-left-radius')).toBe('999px');
  expect(await style(page, '.product-detail__badge', 'border-top-left-radius')).toBe('999px');
});

test('the main gallery stays true colour; thumbnails and related products take the treatment until hovered', async ({ page }) => {
  await openKitPage(page, { style: 'dense', look: BOLD });
  expect(await style(page, '.product-detail__photo', 'filter')).toBe('none');
  expect(await style(page, '.product-detail__thumbnails img', 'filter')).toBe('grayscale(1)');
  expect(await style(page, '.product-detail__related img', 'filter')).toBe('grayscale(1)');
  await page.locator('.product-detail__related li').first().hover();
  await expect.poll(() => style(page, '.product-detail__related img', 'filter')).toBe('none');
});

test('offset edges reach the gallery and the dense buying box', async ({ page }) => {
  await openKitPage(page, { style: 'dense', look: BOLD });
  expect(await style(page, '.product-detail__stage', 'box-shadow')).toMatch(/5px 5px 0px/);
  expect(await style(page, '.product-detail__buybox', 'box-shadow')).toMatch(/5px 5px 0px/);
});

test('gallery controls take the store paper and ink', async ({ page }) => {
  await openKitPage(page, { style: 'dense', look: BOLD });
  expect(await style(page, '.product-detail__navigation button', 'background-color')).toBe('rgb(245, 239, 230)');
});

test('a banded home puts related products in a dark band that stays readable, also on a dark store', async ({ page }) => {
  for (const tokens of [undefined, DARK]) {
    await openKitPage(page, { style: 'editorial', look: BOLD, tokens });
    const [fg, bg] = await page.locator('.product-detail__related').evaluate(el => [getComputedStyle(el).color, getComputedStyle(el).backgroundColor]);
    const lum = (c: string) => { const [r, g, b] = c.match(/[\d.]+/g)!.slice(0, 3).map(Number).map(v => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x);
    expect((a + 0.05) / (b + 0.05)).toBeGreaterThanOrEqual(4.5);
    expect(bg).not.toBe('rgba(0, 0, 0, 0)');
  }
});

test('duotone draws with the store ink and paper through an inline SVG filter', async ({ page }) => {
  await openKitPage(page, { style: 'dense', look: { version: 1, photo: { treatment: 'duotone' } } });
  await expect(page.locator('#pagosya-look-duotone')).toHaveCount(1);
  expect(await style(page, '.product-detail__thumbnails img', 'filter')).toContain('pagosya-look-duotone');
  expect(await style(page, '.product-detail__photo', 'filter')).toBe('none');
});
```

Run: `cd apps/merchant-studio && npx playwright test tests/store-look.spec.ts`
Expected: FAIL. The title has no Anton font, and the buybox radius is `6px`.

- [ ] **Step 4: Add the look reader to `commerce.js`**

Directly after the line `if (hasDna) for (const name of Object.keys(COMMERCE_DNA)) …setAttribute(\`data-dna-${name}\`, config.dna[name]);` (≈ line 68), insert:

```js
  // One look per store (spec 2026-10-14): what the store's own home page does, measured at each save (store-look.ts in the
  // API). Validated again here; every look rule keys on a data-look-* attribute, so a store without config.look renders as before.
  const LOOK = (() => {
    const look = config.look && typeof config.look === 'object' && config.look.version === 1 ? config.look : null;
    if (!look) return null;
    const root = document.documentElement;
    const set = (name, value = '') => root.setAttribute(`data-look-${name}`, value);
    const prop = (name, value) => root.style.setProperty(`--lk-${name}`, value);
    const num = (value, low, high) => typeof value === 'number' && Number.isFinite(value) && value >= low && value <= high;
    const radius = (value, arch) => value === 'pill' ? '999px' : arch && value === 'arch' ? '999px 999px 8px 8px / 42% 42% 8px 8px' : num(value, 0, 48) ? `${Math.round(value)}px` : '';
    root.setAttribute('data-look', '');
    const heading = look.type?.heading;
    if (heading && typeof heading === 'object') {
      if (typeof heading.family === 'string' && /^[\p{L}\p{N} '-]{1,60}$/u.test(heading.family)) { set('hf'); prop('hf', `"${heading.family.replace(/'/g, '')}"`); }
      if (num(heading.weight, 300, 900)) { set('hw'); prop('hw', String(heading.weight)); }
      if (heading.case === 'upper' || heading.case === 'none') set('hc', heading.case);
      if (num(heading.tracking, -0.05, 0.3)) { set('ht'); prop('ht', `${heading.tracking}em`); }
      if (heading.italic === true) set('hi');
    }
    const label = look.type?.label;
    if (label && label.case === 'upper') { set('label'); prop('lt', num(label.tracking, 0, 0.3) ? `${label.tracking}em` : '.08em'); prop('lw', num(label.weight, 300, 900) ? String(label.weight) : '600'); }
    for (const [key, attribute, arch] of [['photo', 'rp', true], ['card', 'rc', false], ['button', 'rb', false]]) {
      const value = radius(look.shape?.[key], arch);
      if (value) { set(attribute, look.shape[key] === 'arch' ? 'arch' : ''); prop(attribute, value); }
    }
    if (['none', 'hairline', 'outline', 'offset', 'soft'].includes(look.edge)) set('edge', look.edge);
    if (['natural', 'mono', 'duotone', 'sepia', 'grain', 'polaroid', 'tight'].includes(look.photo?.treatment)) set('photo', look.photo.treatment);
    const aspect = { square: '1 / 1', portrait: '4 / 5', landscape: '4 / 3' }[look.photo?.aspect];
    if (aspect) { set('aspect', look.photo.aspect); prop('aspect', aspect); }
    if (num(look.photo?.tilt, 0.5, 4)) { set('tilt'); prop('tilt', `${look.photo.tilt}deg`); }
    if (['tinted', 'banded'].includes(look.surface)) set('surface', look.surface);
    return look;
  })();
  /* Duotone and grain are SVG filters in the page (no store url()): duotone maps luminance onto the store's ink→paper. */
  function lookFilters() {
    if (!LOOK || !['duotone', 'grain'].includes(LOOK.photo?.treatment) || document.getElementById('pagosya-look-filters')) return;
    const rgb = name => { const probe = document.createElement('span'); probe.style.color = `var(${name})`; document.body.append(probe); const channels = (getComputedStyle(probe).color.match(/[\d.]+/g) || ['0', '0', '0']).slice(0, 3).map(v => Number(v) / 255); probe.remove(); return channels; };
    const ink = rgb('--lk-ink'), paper = rgb('--lk-paper');
    const rows = [0, 1, 2].map(i => { const d = paper[i] - ink[i]; return `${(d * 0.2126).toFixed(4)} ${(d * 0.7152).toFixed(4)} ${(d * 0.0722).toFixed(4)} 0 ${ink[i].toFixed(4)}`; }).join(' ');
    document.body.insertAdjacentHTML('beforeend', `<svg id="pagosya-look-filters" width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><filter id="pagosya-look-duotone" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="${rows} 0 0 0 1 0"/></filter><filter id="pagosya-look-grain"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" stitchTiles="stitch" result="noise"/><feColorMatrix in="noise" type="saturate" values="0" result="mono"/><feComponentTransfer in="mono" result="soft"><feFuncA type="table" tableValues="0 .18"/></feComponentTransfer><feComposite in="soft" in2="SourceGraphic" operator="in" result="grain"/><feBlend in="grain" in2="SourceGraphic" mode="multiply"/></filter></svg>`);
  }
```

- [ ] **Step 5: Add the look CSS constants**

Directly after the `DNA_PAGE_CSS` array (the `  ];` that closes it, ≈ line 3764), insert:

```js
  /* One look per store (spec 2026-10-14). Unlayered, after the DNA styles, before YAPI's guarded CSS: the measured look wins
   * over drawn DNA and YAPI's touches win over both. Colours stay the store's own; protected controls are never selected. */
  const LOOK_FILTERED = ':root:is([data-look-photo=mono],[data-look-photo=sepia],[data-look-photo=duotone],[data-look-photo=grain])';
  const lookHeadingRules = target => [
    `:root[data-look-hf] ${target}{font-family:var(--lk-hf)}`,
    `:root[data-look-hw] ${target}{font-weight:var(--lk-hw)}`,
    `:root[data-look-hc=upper] ${target}{text-transform:uppercase}`,
    `:root[data-look-hc=none] ${target}{text-transform:none}`,
    `:root[data-look-ht] ${target}{letter-spacing:var(--lk-ht)}`,
    `:root[data-look-hi] ${target}{font-style:italic}`,
  ];
  const LOOK_BASE_CSS = [
    ':root[data-look]{--lk-ink:var(--store-foreground,var(--brand-foreground,var(--ink,#20211d)));--lk-paper:var(--store-background,var(--brand-background,var(--paper,#fff)));--lk-line:var(--store-border,var(--brand-border,color-mix(in srgb,var(--lk-ink) 16%,var(--lk-paper))))}',
    ':root[data-look-edge=hairline]{--lk-edge:0 0 0 1px var(--lk-line)}:root[data-look-edge=outline]{--lk-edge:0 0 0 2px var(--lk-ink)}:root[data-look-edge=offset]{--lk-edge:5px 5px 0 var(--lk-ink)}:root[data-look-edge=soft]{--lk-edge:0 14px 34px -16px color-mix(in srgb,var(--lk-ink) 55%,transparent)}',
    ':root[data-look-photo=mono]{--lk-filter:grayscale(1)}:root[data-look-photo=sepia]{--lk-filter:sepia(.65) saturate(.85)}:root[data-look-photo=duotone]{--lk-filter:url(#pagosya-look-duotone)}:root[data-look-photo=grain]{--lk-filter:url(#pagosya-look-grain);--lk-grain:url(#pagosya-look-grain)}',
  ];
  const LPC = '[data-pagosya-product][data-style]';
  const LOOK_CHIPS = `${LPC} .product-detail__values:not([data-kind=swatch]) [data-product-option]`;
  const LOOK_PDP_CSS = [
    ...lookHeadingRules(`${LPC} [data-part=title]`),
    `:root[data-look-label] :is(${LPC} [data-part=eyebrow],${LPC} .product-detail__options legend,${LPC} .product-tabs [role=tab],${LPC} .product-detail__badge){text-transform:uppercase;letter-spacing:var(--lk-lt);font-weight:var(--lk-lw)}`,
    `:root[data-look-rc] [data-pagosya-product]{--pd-radius:var(--lk-rc)}`,
    `:root[data-look-rp] ${LPC} :is(.product-detail__photo,.product-detail__stack img,.product-detail__related img){border-radius:var(--lk-rp)}`,
    `:root[data-look-rb] :is(${LOOK_CHIPS},${LPC} .product-detail__badge,${LPC} .product-detail__navigation button,${LPC} .product-detail__navigation span){border-radius:var(--lk-rb)}`,
    `:root[data-look] ${LPC} :is(.product-detail__navigation button,.product-detail__navigation span){background:var(--pd-paper);color:var(--pd-ink)}`,
    `:root[data-look-edge]:not([data-look-edge=none]) ${LPC} :is(.product-detail__stage,.product-detail__related img){box-shadow:var(--lk-edge)}`,
    `:root[data-look-edge]:not([data-look-edge=none]) ${LPC}[data-style=dense] .product-detail__buybox{border-color:transparent;box-shadow:var(--lk-edge)}`,
    `:root:is([data-look-edge=outline],[data-look-edge=offset]) ${LOOK_CHIPS}{box-shadow:var(--lk-edge)}`,
    `${LOOK_FILTERED} ${LPC} :is(.product-detail__thumbnails img,.product-detail__related img){filter:var(--lk-filter);transition:filter .25s}`,
    `${LOOK_FILTERED} ${LPC} :is(.product-detail__thumbnails button:is(:hover,:focus-visible) img,.product-detail__related li:is(:hover,:focus-within) img){filter:none}`,
    `:root[data-look-photo=grain] ${LPC} :is(.product-detail__photo,.product-detail__stack img){filter:var(--lk-grain)}`,
    `:root[data-look-photo=polaroid] ${LPC} .product-detail__stage{padding:12px 12px 40px;background:#fff;box-shadow:0 10px 26px -14px #0007}`,
    `:root[data-look-aspect] ${LPC} .product-detail__related img{aspect-ratio:var(--lk-aspect)}`,
    `:root[data-look-aspect] ${LPC}[data-style=dense][data-pagosya-product-page] .product-detail__photo{aspect-ratio:var(--lk-aspect);background:var(--pd-paper)}`,
    `:root[data-look-surface=banded] ${LPC} .product-detail__related{--pd-ink:var(--lk-paper);--pd-paper:var(--lk-ink);--pd-muted:color-mix(in srgb,var(--pd-ink) 70%,var(--pd-paper));--pd-line:color-mix(in srgb,var(--pd-ink) 22%,var(--pd-paper));--pd-tint:color-mix(in srgb,var(--pd-ink) 10%,var(--pd-paper));background:var(--pd-paper);color:var(--pd-ink);padding:clamp(28px,5vw,64px) clamp(16px,4vw,48px)}`,
    `:root[data-look-surface=tinted] ${LPC} .product-detail__related{background:var(--pd-tint);padding:clamp(28px,5vw,64px) clamp(16px,4vw,48px)}`,
  ];
```

- [ ] **Step 6: Inject the look, then the guarded CSS after it**

1. Inside the `if (hasDna) { … }` style block, remove the whole product-theme sub-block. It starts at the comment `    /* Product theme: guarded CSS the API sanitized (product-theme-css.ts) before it reached config.dna.productCss. This check is` and ends with the closing `}` of `if (typeof themeCss === 'string' && …) { … }`. Leave the rest of the `if (hasDna)` block as it is.
2. Immediately after the closing `}` of `if (hasDna) { … }` (the line before `  /* Card preview listeners (DNA stores only).`), insert:

```js
  if (LOOK) {
    const lookStyle = document.createElement('style');
    lookStyle.dataset.pagosyaKit = 'look';
    lookStyle.textContent = [...LOOK_BASE_CSS, ...LOOK_PDP_CSS].join('\n');
    document.head.append(lookStyle);
    lookFilters();
  }
  /* YAPI's guarded CSS: the API sanitized it (product-theme-css.ts) before it reached config.dna. This check is defence in
   * depth only, a coarse refusal of what the sanitizer never emits; it does not re-implement the sanitizer. It goes after
   * the kit's own styles and the look, so an equally specific theme rule wins. */
  const THEME_CSS_KEYS = [['productCss', 'product-theme']];
  if (hasDna) for (const [key, name] of THEME_CSS_KEYS) {
    const themeCss = config.dna[key];
    if (typeof themeCss === 'string' && themeCss && themeCss.length <= 8000 && !/@\s*import|url\s*\(|expression\s*\(|<|\\|position\s*:\s*fixed|pointer-events|!\s*important/i.test(themeCss)) {
      const themeStyle = document.createElement('style');
      themeStyle.dataset.pagosyaKit = name;
      themeStyle.textContent = themeCss;
      document.head.append(themeStyle);
    }
  }
```

- [ ] **Step 7: Run the look tests and the baseline**

Run: `cd apps/merchant-studio && npx playwright test tests/store-look.spec.ts tests/kit-no-look-baseline.spec.ts tests/product-page-polish.spec.ts tests/product-page-kit.spec.ts`
Expected: all PASS. The baseline must pass **without** `--update-snapshots`. If a baseline screenshot differs, some look rule is not keyed on a `data-look` attribute: find it and fix it rather than re-recording.

- [ ] **Step 8: Commit**

```bash
git add packages/storefront-kit/kit/commerce.js apps/merchant-studio/tests/store-look.spec.ts
git commit -m "feat(kit): the product page follows the measured store look — headline type, corners, edges, photo look, bands (spec 2026-10-14)"
```

---

### Task 5: The kit reads the look on cards, the catalog and the cart

**Files:**
- Modify: `packages/storefront-kit/kit/commerce.js` (new `LOOK_SURFACE_CSS` after `LOOK_PDP_CSS`; the `lookStyle.textContent` line)
- Modify: `apps/merchant-studio/tests/store-look.spec.ts`

**Interfaces:**
- Consumes: `lookHeadingRules`, `LOOK_FILTERED`, `LOOK_BASE_CSS` and `LOOK_PDP_CSS` (Task 4); `openKitPage`, `openCart` and `style` (Task 4 harness).
- Produces: `LOOK_SURFACE_CSS` (inside the kit).

- [ ] **Step 1: Write the failing tests**

Append to `apps/merchant-studio/tests/store-look.spec.ts`:

```ts
const CARD_IMG = '[data-pagosya-catalog] .menu-item:not([data-custom-product]) .menu-item__image';

test('catalog: page title and cards follow the headline; card photos take shape, aspect and treatment', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openKitPage(page, { path: 'productos.html', look: { ...BOLD, photo: { treatment: 'mono', aspect: 'square', tilt: 3 } } });
  expect(await style(page, '.commerce-page-title', 'font-family')).toContain('Anton');
  expect(await style(page, '.commerce-page-title', 'text-transform')).toBe('uppercase');
  expect(await style(page, CARD_IMG, 'border-top-left-radius')).toBe('20px');
  expect(await style(page, CARD_IMG, 'aspect-ratio')).toBe('1 / 1');
  expect(await style(page, CARD_IMG, 'filter')).toBe('grayscale(1)');
  expect(await style(page, CARD_IMG, 'box-shadow')).toMatch(/5px 5px 0px/);
  const rotations = await page.locator(CARD_IMG).evaluateAll(els => els.slice(0, 2).map(el => getComputedStyle(el).rotate));
  expect(rotations.map(r => Math.abs(parseFloat(r)))).toEqual([3, 3]);
  expect(Math.sign(parseFloat(rotations[0]))).toBe(-Math.sign(parseFloat(rotations[1])));
});

test('cards return to true colour on hover and keyboard focus', async ({ page }) => {
  await openKitPage(page, { path: 'productos.html', look: BOLD });
  await page.locator('[data-pagosya-catalog] .menu-item').first().hover();
  await expect.poll(() => style(page, CARD_IMG, 'filter')).toBe('none');
  await page.mouse.move(0, 0);
  await page.locator('[data-pagosya-catalog] .menu-item .menu-item__details').first().focus();
  await expect.poll(() => style(page, CARD_IMG, 'filter')).toBe('none');
});

test('a YAPI-authored card keeps its own design', async ({ page }) => {
  await openKitPage(page, { path: 'productos.html', look: BOLD });
  const custom = await page.evaluate(() => {
    document.querySelector('[data-pagosya-catalog]')!.insertAdjacentHTML('beforeend', '<article class="menu-item" data-custom-product><img class="menu-item__image" src="https://img.test/4.webp" alt=""></article>');
    const img = document.querySelector('.menu-item[data-custom-product] .menu-item__image')!;
    return { filter: getComputedStyle(img).filter, radius: getComputedStyle(img).borderTopLeftRadius };
  });
  expect(custom).toEqual({ filter: 'none', radius: '0px' });
});

test('cart drawer: heading follows the headline, line photos take polaroid frames', async ({ page }) => {
  await openKitPage(page, { path: 'productos.html', cart: true, look: { ...BOLD, photo: { treatment: 'polaroid' } } });
  await openCart(page);
  expect(await style(page, '.cart-drawer__header h2', 'font-family')).toContain('Anton');
  expect(await style(page, '.cart-drawer .order-item__photo', 'padding-bottom')).toBe('20px');
  expect(await style(page, '.cart-drawer .order-item__photo', 'background-color')).toBe('rgb(255, 255, 255)');
});
```

Run: `cd apps/merchant-studio && npx playwright test tests/store-look.spec.ts`
Expected: the four new tests FAIL; the Task 4 tests still pass.

- [ ] **Step 2: Add the surface CSS**

Directly after `LOOK_PDP_CSS` in `commerce.js`, insert:

```js
  /* Cards, catalog and cart. Only the kit's own cards: a YAPI-authored card ([data-custom-product]) is already the store's look. */
  const LKC = '[data-pagosya-catalog] .menu-item:not([data-custom-product])';
  const LOOK_CART_PHOTO = '.cart-drawer .order-item__photo';
  const LOOK_SURFACE_CSS = [
    ...lookHeadingRules(`:is(.commerce-page-title,[data-pagosya-catalog] .catalog-group__title,${LKC} .menu-item__copy h3,.cart-drawer__header h2)`),
    `:root[data-look-label] :is([data-pagosya-catalog] .catalog-tabs a,${LKC} .menu-item__badge){text-transform:uppercase;letter-spacing:var(--lk-lt);font-weight:var(--lk-lw)}`,
    `:root[data-look-rp]{--kit-photo-radius:var(--lk-rp)}`,
    `:root[data-look-rp] :is(${LKC} :is(.menu-item__image,.menu-item__image-alt),${LOOK_CART_PHOTO}){border-radius:var(--lk-rp)}`,
    `:root[data-look-rc] ${LKC}{border-radius:var(--lk-rc)}`,
    `:root[data-look-rb] :is([data-pagosya-catalog] .catalog-tabs a,${LKC} .menu-item__badge){border-radius:var(--lk-rb)}`,
    `:root[data-look-edge]:not([data-look-edge=none]) :is(${LKC} .menu-item__image,${LOOK_CART_PHOTO}){box-shadow:var(--lk-edge)}`,
    `${LOOK_FILTERED} :is(${LKC} :is(.menu-item__image,.menu-item__image-alt),${LOOK_CART_PHOTO}){filter:var(--lk-filter);transition:filter .25s}`,
    `@media(hover:hover){${LOOK_FILTERED} ${LKC}:hover :is(.menu-item__image,.menu-item__image-alt){filter:none}}`,
    `${LOOK_FILTERED} ${LKC}:focus-within :is(.menu-item__image,.menu-item__image-alt){filter:none}`,
    `:root[data-look-photo=polaroid] :is(${LKC} .menu-item__image,${LOOK_CART_PHOTO}){box-sizing:border-box;padding:6px 6px 20px;background:#fff;box-shadow:0 6px 18px -8px #0006;border-radius:2px}`,
    `:root[data-look-photo=tight] ${LKC} .menu-item__image{object-view-box:inset(10%)}`,
    `:root[data-look-aspect] ${LKC} .menu-item__image{aspect-ratio:var(--lk-aspect)}`,
    `:root[data-look-tilt] ${LKC}:nth-child(odd) .menu-item__image{rotate:calc(var(--lk-tilt) * -1)}`,
    `:root[data-look-tilt] ${LKC}:nth-child(even) .menu-item__image{rotate:var(--lk-tilt)}`,
  ];
```

Then change the injection line to:

```js
    lookStyle.textContent = [...LOOK_BASE_CSS, ...LOOK_PDP_CSS, ...LOOK_SURFACE_CSS].join('\n');
```

- [ ] **Step 3: Run the tests**

Run: `cd apps/merchant-studio && npx playwright test tests/store-look.spec.ts tests/kit-no-look-baseline.spec.ts tests/catalog-card-defaults.spec.ts tests/source-catalog.spec.ts`
Expected: all PASS, with the baseline unchanged.

- [ ] **Step 4: Commit**

```bash
git add packages/storefront-kit/kit/commerce.js apps/merchant-studio/tests/store-look.spec.ts
git commit -m "feat(kit): cards, catalog and cart follow the measured store look; authored cards keep their own (spec 2026-10-14)"
```

---

### Task 6: Guards for YAPI's touches — parts, profiles, browser check

**Files:**
- Modify: `packages/storefront-kit/kit/commerce.js` (`markKitParts`, cart markup, `THEME_CSS_KEYS`)
- Modify: `apps/api/src/storefront-source/product-theme-css.ts`
- Create: `apps/api/src/storefront-source/kit-surface-check.ts`
- Test:
  - `apps/api/src/storefront-source/product-theme-css.spec.ts` (append)
  - `apps/api/src/storefront-source/kit-surface-check.spec.ts` (new)
  - `apps/merchant-studio/tests/store-look.spec.ts` (append)

**Interfaces:**
- Consumes: `withVisualSandbox`, `parseConfig`, `contrastRatio`, `MIN_BUY_CONTRAST`, `currentSourceRuntime` and `ThemeCheckFailure` (existing modules); `patchConfigFile` (Task 1).
- Produces:
  - `CATALOG_PARTS`, `CARD_PARTS`, `CART_PARTS`
  - `type KitSurface = 'catalog' | 'card' | 'cart'`
  - `sanitizeKitSurfaceCss(surface: KitSurface, css: unknown): ThemeCssReport`
  - `type KitSurfaceFailures = Record<KitSurface, ThemeCheckFailure[]>`
  - `checkKitSurfacesOnSnapshot(snapshot: SourceProjectSnapshot, options?: { signal?: AbortSignal }): Promise<KitSurfaceFailures>`
  - In the kit: `data-part` hooks, and injection of `dna.catalogCss`, `dna.cardCss` and `dna.cartCss`

- [ ] **Step 1: Write the failing sanitizer tests**

Append to `apps/api/src/storefront-source/product-theme-css.spec.ts`. If `sanitizeProductThemeCss` is not already imported there, add it to the existing import from `./product-theme-css`.

```ts
import { sanitizeKitSurfaceCss } from './product-theme-css';

describe('kit surface profiles (spec 2026-10-14)', () => {
  it('scopes each surface and keeps allowed declarations, including kit variables', () => {
    const card = sanitizeKitSurfaceCss('card', '[data-part="card-media"]{transform:rotate(-3deg);box-shadow:6px 6px 0 var(--kit-ink)}');
    expect(card.css).toContain('[data-pagosya-catalog] [data-part="card-media"]');
    expect(card.css).toContain('var(--kit-ink)');
    expect(sanitizeKitSurfaceCss('cart', '[data-part="cart-line"]{border-bottom:2px dashed var(--store-foreground)}').css).toContain('.cart-drawer [data-part="cart-line"]');
    expect(sanitizeKitSurfaceCss('catalog', '[data-part="page-title"]{letter-spacing:.2em}').css).toContain('body:has([data-catalog-full]) [data-part="page-title"]');
  });

  it('is idempotent', () => {
    const once = sanitizeKitSurfaceCss('card', '[data-part="card"]{border:2px solid #111}[data-part="card-name"]{text-transform:uppercase}').css;
    expect(sanitizeKitSurfaceCss('card', once).css).toBe(once);
  });

  it("refuses protected controls, other surfaces' parts, url() and hiding a card or a cart line", () => {
    expect(sanitizeKitSurfaceCss('card', '.menu-add{opacity:0}').css).toBe('');
    expect(sanitizeKitSurfaceCss('card', '[data-part="gallery"]{border:1px solid red}').css).toBe('');
    expect(sanitizeKitSurfaceCss('card', '[data-part="card-media"]{background:url(x.png)}').css).toBe('');
    expect(sanitizeKitSurfaceCss('card', '[data-part="card"]{display:none}').css).toBe('');
    expect(sanitizeKitSurfaceCss('cart', '[data-part="cart-line"]{opacity:.1}').css).toBe('');
  });

  it('leaves the product profile as it was', () => {
    expect(sanitizeProductThemeCss('[data-part="gallery"]{border:1px solid var(--kit-ink)}').css).toBe('');
    expect(sanitizeProductThemeCss('[data-part="gallery"]{border:1px solid var(--pd-line)}').css).toContain('var(--pd-line)');
  });
});
```

Run: `cd apps/api && npx jest src/storefront-source/product-theme-css.spec.ts`
Expected: FAIL, because `sanitizeKitSurfaceCss` is not exported.

- [ ] **Step 2: Implement the profiles**

In `product-theme-css.ts`:

1. Make `var()` values follow the active profile. Replace the module-level `VAR` constant (line ~55) with:

```ts
/** A var() the active profile allows (product: --pd-/--store-/--brand-/--pt-; each profile lists its own). */
const isVar = (value: string) => { const m = value.trim().match(/^var\(\s*(--[a-z0-9-]+)\s*(?:,\s*[#\w.%\s-]+)?\)$/i); return Boolean(m && active.variables.test(m[1])); };
```

   Then update its two uses and remove the old constant:
   - In `isColour`, replace `|| VAR.test(t)` with `|| isVar(t)`.
   - In `varFont`, replace `VAR.test(value.trim())` with `isVar(value)`.
   - Delete the `const VAR = …` line.

   The product profile's `variables` regex is identical to the old `VAR`, so product behaviour does not change. The account profile's own variables, already accepted by the `var()` check at ~line 227, now also pass as colours.

2. After the `PRODUCT_PROFILE` / `sanitizeProductThemeCss` lines, add:

```ts
/** YAPI's touches on the kit's own surfaces (spec 2026-10-14 one look per store). Protected controls carry no data-part,
 * so no selector can reach them; a card or a cart line may be restyled but never hidden, shrunk or made transparent. */
export const CATALOG_PARTS = ['page-title', 'tabs', 'group-title', 'grid', 'empty'] as const;
export const CARD_PARTS = ['card', 'card-media', 'card-name', 'card-meta', 'card-badge'] as const;
export const CART_PARTS = ['cart-head', 'cart-line', 'cart-line-media'] as const;
export type KitSurface = 'catalog' | 'card' | 'cart';
const KIT_VARIABLES = /^--(?:kit|store|brand|lk)-[a-z0-9-]+$/i;
const KIT_VARIABLE_HINT = '--kit-, --store-, --brand- and --lk-';
const HIDES = /^(display|visibility|opacity|clip|clip-path|width|height|max-width|max-height|position|z-index|inset|top|left|right|bottom)$/;
const KIT_SURFACE_PROFILES: Record<KitSurface, ThemeCssProfile> = {
  catalog: { parts: CATALOG_PARTS, sizedParts: ['grid'], scope: 'body:has([data-catalog-full]) ', keyframePrefix: 'kc-', variables: KIT_VARIABLES, variableHint: KIT_VARIABLE_HINT, refuse: (part, property) => part === 'grid' && HIDES.test(property) },
  card: { parts: CARD_PARTS, sizedParts: ['card-media'], scope: '[data-pagosya-catalog] ', keyframePrefix: 'kd-', variables: KIT_VARIABLES, variableHint: KIT_VARIABLE_HINT, refuse: (part, property) => part === 'card' && HIDES.test(property) },
  cart: { parts: CART_PARTS, sizedParts: ['cart-line-media'], scope: '.cart-drawer ', keyframePrefix: 'kt-', variables: KIT_VARIABLES, variableHint: KIT_VARIABLE_HINT, refuse: (part, property) => part === 'cart-line' && HIDES.test(property) },
};
export function sanitizeKitSurfaceCss(surface: KitSurface, input: unknown): ThemeCssReport { return sanitizeThemeCss(input, KIT_SURFACE_PROFILES[surface]); }
```

Run: `cd apps/api && npx jest src/storefront-source/product-theme-css.spec.ts src/storefront-source/account-theme.spec.ts src/storefront-source/product-theme.spec.ts`
Expected: PASS.

If the idempotence test fails for the catalog scope:
- check that `withoutScope` splits on `active.scope` (it does, at line ~15);
- check that the scope is prepended after validation (`active.scope + out.join(' ')`), so `:has(` inside the scope never goes through the selector grammar.

- [ ] **Step 3: Write the failing kit hook test**

Append to `apps/merchant-studio/tests/store-look.spec.ts`:

```ts
test("the kit names its card, catalog and cart parts and injects YAPI's guarded CSS for them", async ({ page }) => {
  const dna = { cardCss: '[data-pagosya-catalog] [data-part="card-media"]{rotate:-2deg}', cartCss: '.cart-drawer [data-part="cart-head"]{border-bottom:3px solid #111}', catalogCss: 'body:has([data-catalog-full]) [data-part="page-title"]{letter-spacing:.3em}' };
  await openKitPage(page, { path: 'productos.html', cart: true, dna });
  await expect(page.locator('[data-pagosya-catalog] .menu-item[data-part=card] [data-part=card-media]').first()).toBeVisible();
  await expect(page.locator('.commerce-page-title[data-part=page-title]')).toHaveCount(1);
  expect(await style(page, '[data-part=card-media]', 'rotate')).toBe('-2deg');
  expect(parseFloat(await style(page, '.commerce-page-title', 'letter-spacing'))).toBeGreaterThan(5);
  await openCart(page);
  await expect(page.locator('.cart-drawer [data-part=cart-head]')).toHaveCount(1);
  await expect(page.locator('.cart-drawer [data-part=cart-line] [data-part=cart-line-media]').first()).toBeAttached();
  expect(await style(page, '.cart-drawer [data-part=cart-head]', 'border-bottom-width')).toBe('3px');
});
```

Run: `cd apps/merchant-studio && npx playwright test tests/store-look.spec.ts -g "names its card"`
Expected: FAIL (there is no `data-part=card` yet).

- [ ] **Step 4: Add the hooks and the injection to `commerce.js`**

1. In the cart drawer template (≈ line 2019), change `<header class="cart-drawer__header">` to `<header class="cart-drawer__header" data-part="cart-head">`.
2. In the cart rows (≈ line 3380), change `` rows.push(`<li class="order-item"${image ? ' data-has-image' : ''}>${image ? `<img class="order-item__photo" `` to `` rows.push(`<li class="order-item" data-part="cart-line"${image ? ' data-has-image' : ''}>${image ? `<img class="order-item__photo" data-part="cart-line-media" ``. The cart profile is scoped to `.cart-drawer`, so the same rows on the checkout page are never reached.
3. Before `function render() {` (≈ line 3139), add:

```js
  /* Named parts for YAPI's guarded CSS on the kit's own surfaces (spec 2026-10-14; profiles in the API's product-theme-css.ts).
   * Protected controls (prices, add-to-cart, totals) never get a part. An element that already names a part keeps it. */
  function markKitParts() {
    const mark = (selector, part) => document.querySelectorAll(selector).forEach(el => { if (!el.hasAttribute('data-part')) el.setAttribute('data-part', part); });
    mark('[data-pagosya-catalog] .menu-item', 'card');
    mark('[data-pagosya-catalog] .menu-item .menu-item__image', 'card-media');
    mark('[data-pagosya-catalog] .menu-item :is(.menu-item__name,.menu-item__copy h3)', 'card-name');
    mark('[data-pagosya-catalog] .menu-item :is(.menu-item__description,.menu-item__options)', 'card-meta');
    mark('[data-pagosya-catalog] .menu-item .menu-item__badge', 'card-badge');
    mark('.commerce-page-title', 'page-title');
    mark('[data-pagosya-catalog] .catalog-tabs', 'tabs');
    mark('[data-pagosya-catalog] .catalog-group__title', 'group-title');
    mark('[data-pagosya-catalog][data-catalog-full]', 'grid');
    mark('[data-pagosya-catalog] .catalog-empty', 'empty');
  }
```

4. In `render()`, right after `    observeCards();`, add `    markKitParts();`.
5. Extend the keys to: `const THEME_CSS_KEYS = [['productCss', 'product-theme'], ['catalogCss', 'catalog-theme'], ['cardCss', 'card-theme'], ['cartCss', 'cart-theme']];`

Run: `cd apps/merchant-studio && npx playwright test tests/store-look.spec.ts tests/kit-no-look-baseline.spec.ts`
Expected: PASS. Attributes alone do not change pixels, so the baseline stays green.

- [ ] **Step 5: Write the failing surface-check tests**

```ts
// apps/api/src/storefront-source/kit-surface-check.spec.ts
jest.setTimeout(180_000);
import { readFile } from 'node:fs/promises';
import { kitPath } from '@pagosya/storefront-kit';
import { checkKitSurfacesOnSnapshot } from './kit-surface-check';
import { kitDefaultSnapshot } from './source-scorecard-capture';
import { sanitizeKitSurfaceCss } from './product-theme-css';
import { patchConfigFile } from './store-look';

/** Real-browser check of YAPI's touches on cards, catalog and cart. Raw cases bypass the sanitizer on purpose: they prove
 * the check catches what individually allowed declarations could still add up to. */
async function themed(dna: Record<string, string>) {
  const kit = await kitDefaultSnapshot();
  const productos = { path: 'productos.html', content: await readFile(kitPath('productos.html'), 'utf8'), encoding: 'utf8' as const };
  return { ...kit, files: patchConfigFile([...kit.files, productos], config => ({ ...config, dna: { version: 1, ...dna } })) };
}

describe('checkKitSurfacesOnSnapshot', () => {
  it('passes the plain kit and benign touches', async () => {
    expect(await checkKitSurfacesOnSnapshot(await themed({}))).toEqual({ catalog: [], card: [], cart: [] });
    const benign = {
      cardCss: sanitizeKitSurfaceCss('card', '[data-part="card-media"]{transform:rotate(-2deg);box-shadow:4px 4px 0 #111}').css,
      cartCss: sanitizeKitSurfaceCss('cart', '[data-part="cart-head"]{border-bottom:3px solid #111}').css,
      catalogCss: sanitizeKitSurfaceCss('catalog', '[data-part="page-title"]{letter-spacing:.2em}').css,
    };
    expect(await checkKitSurfacesOnSnapshot(await themed(benign))).toEqual({ catalog: [], card: [], cart: [] });
  });

  it('reports an add-to-cart button made nearly transparent', async () => {
    const failures = await checkKitSurfacesOnSnapshot(await themed({ cardCss: '[data-pagosya-catalog] .menu-item .menu-add{opacity:.2}' }));
    expect(failures.card.some(f => f.control === 'add' && /transparent/.test(f.reason))).toBe(true);
  });

  it('reports a hidden checkout button in the cart drawer', async () => {
    const failures = await checkKitSurfacesOnSnapshot(await themed({ cartCss: '.cart-drawer .checkout-button{visibility:hidden}' }));
    expect(failures.cart.some(f => f.control === 'checkout' && /hidden/.test(f.reason))).toBe(true);
  });

  it('reports a card that makes the page scroll sideways', async () => {
    const failures = await checkKitSurfacesOnSnapshot(await themed({ cardCss: '[data-pagosya-catalog] [data-part="card"]{min-width:3000px}' }));
    expect(failures.card.some(f => f.control === 'page' && /overflow/.test(f.reason))).toBe(true);
  });
});
```

Run: `cd apps/api && npx jest src/storefront-source/kit-surface-check.spec.ts`
Expected: FAIL with "Cannot find module './kit-surface-check'".

- [ ] **Step 6: Implement the surface check**

```ts
// apps/api/src/storefront-source/kit-surface-check.ts
/// <reference lib="dom" />
/** Real-browser check of YAPI's guarded CSS on the kit's catalog, cards and cart (spec 2026-10-14), the sibling of
 * product-theme-check.ts. Every protected control must stay visible, opaque enough, uncovered where it is a click target,
 * big enough and readable, at phone and desktop width; no page may scroll sideways. Never calls a model. */
import type { Page } from 'playwright';
import { currentSourceRuntime } from './source-runtime';
import { withVisualSandbox } from './source-visual-capture';
import { parseConfig } from './source-scorecard-capture';
import { contrastRatio, MIN_BUY_CONTRAST } from './source-scorecard';
import type { ThemeCheckFailure } from './product-theme-check';
import type { SourceProjectSnapshot } from './source-project';
import type { KitSurface } from './product-theme-css';

export type KitSurfaceFailures = Record<KitSurface, ThemeCheckFailure[]>;
type Probe = { name: string; selector: string; target: boolean; contrast: boolean; min?: { width: number; height: number } };
type Rgb = [number, number, number];
type Reading = { overflow: boolean; controls: Array<{ name: string; width: number; height: number; hidden: boolean; opacity: number; covered: boolean; color: Rgb; bg: Rgb; target: boolean; contrast: boolean; min?: { width: number; height: number } }> };
const origin = 'https://preview.invalid';
const VIEWPORTS = [['mobile', 390, 844], ['desktop', 1280, 800]] as const;
const PROBE_ID = '__surface_probe__';
// The card's details link covers the whole card by design, so the card price is checked for visibility and contrast, not cover.
const CARD_PROBES: Probe[] = [
  { name: 'card-price', selector: '[data-pagosya-catalog] .menu-item .menu-item__price', target: false, contrast: true },
  { name: 'add', selector: '[data-pagosya-catalog] .menu-item .menu-add', target: true, contrast: false, min: { width: 40, height: 40 } },
  { name: 'card', selector: '[data-pagosya-catalog] .menu-item', target: false, contrast: false },
];
const CATALOG_PROBES: Probe[] = [{ name: 'tabs', selector: '[data-pagosya-catalog] .catalog-tabs a', target: true, contrast: true }, ...CARD_PROBES];
const CART_PROBES: Probe[] = [
  { name: 'checkout', selector: '.cart-drawer .checkout-button', target: true, contrast: true, min: { width: 120, height: 44 } },
  { name: 'total', selector: '.cart-drawer .order-total', target: false, contrast: true },
  { name: 'quantity', selector: '.cart-drawer :is([data-add],[data-remove],[data-remove-line])', target: true, contrast: false, min: { width: 24, height: 24 } },
  { name: 'line', selector: '.cart-drawer .order-item', target: false, contrast: false },
];

/** Serialized into the page: measures the first three matches of each probe. */
function measureSurface(probes: Probe[]): Reading {
  const rgba = (value: string): [number, number, number, number] => { const m = value.match(/rgba?\(([^)]+)\)/); if (!m) return [0, 0, 0, 0]; const p = m[1].split(/[\s,/]+/).filter(Boolean).map(parseFloat); return [p[0] || 0, p[1] || 0, p[2] || 0, p.length > 3 ? p[3] : 1]; };
  const background = (element: Element): Rgb => { for (let node: Element | null = element; node; node = node.parentElement) { const c = rgba(getComputedStyle(node).backgroundColor); if (c[3] >= 0.99) return [c[0], c[1], c[2]]; } return [255, 255, 255]; };
  const opacityChain = (element: Element) => { let value = 1; for (let node: Element | null = element; node && node !== document.documentElement; node = node.parentElement) value *= parseFloat(getComputedStyle(node).opacity); return value; };
  const isHidden = (element: Element) => { for (let node: Element | null = element; node && node !== document.documentElement; node = node.parentElement) { const s = getComputedStyle(node); if (s.display === 'none' || s.visibility === 'hidden') return true; } return false; };
  const controls: Reading['controls'] = [];
  for (const probe of probes) for (const element of Array.from(document.querySelectorAll(probe.selector)).slice(0, 3)) {
    (element as HTMLElement).scrollIntoView({ block: 'center', inline: 'nearest' });
    const rect = element.getBoundingClientRect();
    const x = Math.min(Math.max(rect.left + rect.width / 2, 0), innerWidth - 1), y = Math.min(Math.max(rect.top + rect.height / 2, 0), innerHeight - 1);
    const top = document.elementFromPoint(x, y);
    const c = rgba(getComputedStyle(element).color);
    controls.push({ name: probe.name, width: rect.width, height: rect.height, hidden: isHidden(element) || rect.width === 0 || rect.height === 0, opacity: opacityChain(element), covered: !top || !(top === element || element.contains(top)), color: [c[0], c[1], c[2]], bg: background(element), target: probe.target, contrast: probe.contrast, min: probe.min });
  }
  return { overflow: document.documentElement.scrollWidth > innerWidth + 1, controls };
}

function judge(reading: Reading, viewport: 'mobile' | 'desktop', into: ThemeCheckFailure[]) {
  const add = (control: string, reason: string) => { if (!into.some(f => f.control === control && f.viewport === viewport && f.reason === reason)) into.push({ control, viewport, reason }); };
  if (reading.overflow) add('page', 'horizontal overflow: the page scrolls sideways');
  for (const c of reading.controls) {
    if (c.hidden) { add(c.name, 'hidden or zero-sized'); continue; }
    if (c.opacity < 0.6) add(c.name, `too transparent (opacity ${Math.round(c.opacity * 100) / 100})`);
    if (c.target && c.covered) add(c.name, 'covered by another element');
    if (c.min && (c.width < c.min.width || c.height < c.min.height)) add(c.name, `too small (${Math.round(c.width)}x${Math.round(c.height)}px, needs ${c.min.width}x${c.min.height})`);
    if (c.contrast) { const ratio = contrastRatio(c.color, c.bg); if (ratio < MIN_BUY_CONTRAST) add(c.name, `text contrast ${Math.round(ratio * 100) / 100}:1 (needs ${MIN_BUY_CONTRAST}:1)`); }
  }
}

const settle = (page: Page) => page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));

/** Cards and the cart drawer on the home page, the catalog on productos.html when the store has it. A probe product (only
 * in the isolated copy) guarantees a card and a cart line even for a store with no products yet. */
export async function checkKitSurfacesOnSnapshot(snapshot: SourceProjectSnapshot, options: { signal?: AbortSignal } = {}): Promise<KitSurfaceFailures> {
  const runtime = await currentSourceRuntime(snapshot);
  const config = parseConfig(runtime);
  const probe = { id: PROBE_ID, name: 'Producto de comprobación con un nombre largo para validar el diseño', description: 'Dato temporal de prueba.', amount: 12900, currency: 'BOB', stock: 3, imageUrls: [] };
  const data = { ...config.data, items: [probe, ...(config.data?.items ?? [])] };
  const demo = { ...runtime, files: runtime.files.map(f => f.path === 'config.js' ? { ...f, content: `window.PAGOSYA_CONFIG = ${JSON.stringify({ ...config, data, demo: true })};` } : f) };
  const out: KitSurfaceFailures = { catalog: [], card: [], cart: [] };
  const hasCatalog = runtime.files.some(f => f.path === 'productos.html');
  await withVisualSandbox(demo, '', options.signal, true, async context => {
    await context.addInitScript(({ key, id }) => { try { sessionStorage.setItem(key, JSON.stringify([{ id, quantity: 1 }])); } catch { /* storage off */ } }, { key: `pagosya:cart:${config.slug || 'store'}`, id: PROBE_ID });
    const page = await context.newPage();
    page.setDefaultTimeout(5000);
    const visit = async (path: string) => {
      await page.goto(`${origin}/${path}`, { waitUntil: 'load', timeout: 10_000 });
      const ready = await page.waitForSelector('[data-pagosya-catalog] .menu-item', { timeout: 4000 }).then(() => true, () => false);
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      await settle(page);
      return ready;
    };
    try {
      for (const [viewport, width, height] of VIEWPORTS) {
        await page.setViewportSize({ width, height });
        if (await visit('index.html')) judge(await page.evaluate(measureSurface, CARD_PROBES), viewport, out.card);
        await page.evaluate(() => { const button = document.createElement('button'); button.type = 'button'; button.setAttribute('data-cart-open', ''); document.body.append(button); button.click(); });
        const open = await page.waitForSelector('.cart-drawer[open]', { timeout: 3000 }).then(() => true, () => false);
        if (open) { await settle(page); judge(await page.evaluate(measureSurface, CART_PROBES), viewport, out.cart); }
        else out.cart.push({ control: 'cart', viewport, reason: 'the cart drawer did not open' });
        if (hasCatalog && await visit('productos.html')) judge(await page.evaluate(measureSurface, CATALOG_PROBES), viewport, out.catalog);
      }
    } finally { await page.close(); }
  });
  return out;
}
```

- [ ] **Step 7: Run the tests**

Run: `cd apps/api && npx jest src/storefront-source/kit-surface-check.spec.ts src/storefront-source/product-theme-check.spec.ts`
Expected: PASS.

If "passes the plain kit" reports `cart: the cart drawer did not open`, the appended button should still reach the kit's capture-phase click listener (commerce.js ~line 2077). Take a `page.screenshot` in a scratch copy to see why, and fix the cause; do not weaken the probe.

- [ ] **Step 8: Commit**

```bash
git add packages/storefront-kit/kit/commerce.js apps/api/src/storefront-source/product-theme-css.ts apps/api/src/storefront-source/product-theme-css.spec.ts apps/api/src/storefront-source/kit-surface-check.ts apps/api/src/storefront-source/kit-surface-check.spec.ts apps/merchant-studio/tests/store-look.spec.ts
git commit -m "feat(look): guarded CSS for the kit's catalog, cards and cart — named parts, sanitizer profiles, browser check"
```

---

### Task 7: YAPI's touch step in the Sep-5 review stage

**Files:**
- Create: `apps/api/src/storefront-source/kit-touch.ts`
- Test: `apps/api/src/storefront-source/kit-touch.spec.ts`
- Modify `apps/api/src/storefront-source/source-generation.service.ts` in these places:
  - the attempt phase type (line 130)
  - `let sep5Review` (~747)
  - `sep5Call` (~905)
  - the review closure (~975–1010)
  - `KEPT_DNA` and the `dna` merge in `assembleSave` (~1504–1511)
- Test: `apps/api/src/storefront-source/source-generation-review.spec.ts` (append)

**Interfaces:**
- Consumes:
  - From Task 6: `sanitizeProductThemeCss`, `sanitizeKitSurfaceCss`, `COSMETIC_PARTS`, `CATALOG_PARTS`, `CARD_PARTS`, `CART_PARTS`, `checkKitSurfacesOnSnapshot`
  - From Task 1: `sanitizeLook`, `readConfigFile`, `patchConfigFile`
  - Existing: `checkProductThemeOnSnapshot`, `captureSep5Draft`, `currentSourceRuntime`, `sourceResponseJson`
- Produces:
  - `TOUCH_KEYS`
  - Types: `TouchSurface`, `KitTouchCss`, `KitTouchResult = { css: KitTouchCss; notes: string[]; dropped: Array<{ surface: TouchSurface; reason: string }> }`
  - Constants: `KIT_TOUCH_SCHEMA`, `KIT_TOUCH_TIMEOUT_MS = 60_000`, `KIT_TOUCH_MAX_OUTPUT_TOKENS = 6_000`
  - `kitTouchPrompt(input)`, `distinctiveCss(files)`, `captureHomeForTouch(snapshot, signal)`
  - `runKitTouch(deps: KitTouchDeps): Promise<KitTouchResult | null>`
  - `carriedTouch(previousDna: unknown, creative: boolean): Record<string, string | number>`
  - In the service: `sep5Call(…, options: { signal?, attempts?, maxOutputTokens?, effort? })` and a `touchCall(run)` factory

- [ ] **Step 1: Write the failing unit tests**

```ts
// apps/api/src/storefront-source/kit-touch.spec.ts
import { carriedTouch, distinctiveCss, kitTouchPrompt, runKitTouch, TOUCH_KEYS } from './kit-touch';
import { readConfigFile } from './store-look';

const files = [
  { path: 'index.html', content: '<main></main>' },
  { path: 'styles.css', content: '.stamp{transform:rotate(-8deg);border:3px double #111}.plain{color:red}.photo::after{content:"";background:linear-gradient(#0000,#0003)}@keyframes wobble{from{rotate:-1deg}to{rotate:1deg}}' },
  { path: 'commerce-pages.css', content: '.kit{transform:scale(2)}' },
  { path: 'config.js', content: 'window.PAGOSYA_CONFIG = {"slug":"cafe","dna":{"version":1},"look":{"version":1,"edge":"offset"}};\n' },
];
const reply = (value: Record<string, unknown>) => ({ status: 'completed', output: [{ content: [{ type: 'output_text', text: JSON.stringify({ product: '', catalog: '', card: '', cart: '', notes: [], ...value }) }] }] });
const deps = (body: unknown, over: Record<string, unknown> = {}) => {
  const used = jest.fn();
  return { used, deps: { files, brief: {}, storeName: 'Café', signal: new AbortController().signal, call: jest.fn(async () => ({ body, used })), capture: jest.fn(async () => []),
    checkProduct: jest.fn(async () => []), checkSurfaces: jest.fn(async () => ({ catalog: [], card: [], cart: [] })), ...over } };
};

describe('distinctiveCss', () => {
  it('keeps the authored rules that carry a device, never platform CSS', () => {
    const css = distinctiveCss(files);
    expect(css).toContain('.stamp');
    expect(css).toContain('::after');
    expect(css).toContain('@keyframes wobble');
    expect(css).not.toContain('.plain');
    expect(css).not.toContain('.kit');
  });
});

describe('kitTouchPrompt', () => {
  it("names every surface's parts, the protected controls and the merchant request", () => {
    const text = kitTouchPrompt({ storeName: 'Café', look: { version: 1, edge: 'offset' }, distinctive: '.stamp{}', instruction: 'fotos inclinadas' });
    for (const word of ['card-media', 'cart-line', 'page-title', 'gallery', 'protected', 'fotos inclinadas', '"edge":"offset"']) expect(text).toContain(word);
  });
});

describe('runKitTouch', () => {
  it("sanitizes, checks and returns each surface's CSS, and marks the call as used", async () => {
    const { deps: d, used } = deps(reply({ card: '[data-part="card-media"]{transform:rotate(-2deg)}', cart: '[data-part="cart-head"]{border-bottom:3px solid #111}', notes: ['Tarjetas inclinadas como en la portada.'] }));
    const result = (await runKitTouch(d))!;
    expect(result.css.cardCss).toContain('[data-pagosya-catalog] [data-part="card-media"]');
    expect(result.css.cartCss).toContain('.cart-drawer [data-part="cart-head"]');
    expect(result.notes).toEqual(['Tarjetas inclinadas como en la portada.']);
    expect(used).toHaveBeenCalled();
    const checked = (d.checkSurfaces as jest.Mock).mock.calls[0][0];
    expect(readConfigFile(checked.files).dna.cardCss).toBe(result.css.cardCss);
  });

  it('drops only the surface that fails its browser check', async () => {
    const { deps: d } = deps(reply({ card: '[data-part="card-media"]{transform:rotate(-2deg)}', cart: '[data-part="cart-head"]{border-bottom:3px solid #111}' }),
      { checkSurfaces: jest.fn(async () => ({ catalog: [], card: [{ control: 'add', viewport: 'mobile', reason: 'covered by another element' }], cart: [] })) });
    const result = (await runKitTouch(d))!;
    expect(result.css.cardCss).toBeUndefined();
    expect(result.css.cartCss).toBeDefined();
    expect(result.dropped).toEqual([{ surface: 'card', reason: 'add (mobile): covered by another element' }]);
  });

  it('returns null for an answer that is not the schema, and never marks it used', async () => {
    const { deps: d, used } = deps({ status: 'completed', output: [{ content: [{ type: 'output_text', text: 'no' }] }] });
    expect(await runKitTouch(d)).toBeNull();
    expect(used).not.toHaveBeenCalled();
  });

  it('returns empty CSS when the sanitizer leaves nothing', async () => {
    const { deps: d, used } = deps(reply({ card: '.menu-add{opacity:0}' }));
    const result = (await runKitTouch(d))!;
    expect(result.css).toEqual({});
    expect(used).not.toHaveBeenCalled();
  });
});

describe('carriedTouch', () => {
  const dna = { version: 1, touch: 1, productCss: 'a', cardCss: 'b', cartCss: '', swatch: 'pill' };
  it('carries the touch across an ordinary edit', () => expect(carriedTouch(dna, false)).toEqual({ touch: 1, [TOUCH_KEYS.product]: 'a', [TOUCH_KEYS.card]: 'b' }));
  it('never carries it into a new store or a redesign', () => expect(carriedTouch(dna, true)).toEqual({}));
  it('carries nothing that the touch step did not write', () => expect(carriedTouch({ productCss: 'planner' }, false)).toEqual({}));
});
```

Run: `cd apps/api && npx jest src/storefront-source/kit-touch.spec.ts`
Expected: FAIL with "Cannot find module './kit-touch'".

- [ ] **Step 2: Implement `kit-touch.ts`**

```ts
// apps/api/src/storefront-source/kit-touch.ts
/** Layer B of one look per store (spec 2026-10-14): one model call that carries the home page's own devices onto the kit's
 * product page, catalog, cards and cart as guarded CSS. Sanitized per surface, checked in a real browser, and a surface that
 * fails loses only its own CSS. Never fails a build: the caller treats null and empty CSS as "no touch". */
import postcss from 'postcss';
import { z } from 'zod';
import { CARD_PARTS, CART_PARTS, CATALOG_PARTS, COSMETIC_PARTS, sanitizeKitSurfaceCss, sanitizeProductThemeCss, type KitSurface } from './product-theme-css';
import { checkProductThemeOnSnapshot, type ThemeCheckFailure } from './product-theme-check';
import { checkKitSurfacesOnSnapshot, type KitSurfaceFailures } from './kit-surface-check';
import { captureSep5Draft } from './design-engine/sep5-review-capture';
import { currentSourceRuntime } from './source-runtime';
import { sourceResponseJson } from './source-response';
import { patchConfigFile, readConfigFile, sanitizeLook, type StoreLook } from './store-look';
import type { SourceProjectSnapshot } from './source-project';
import type { SourceProjectFileDto } from './dto/save-source-project.dto';

export const TOUCH_KEYS = { product: 'productCss', catalog: 'catalogCss', card: 'cardCss', cart: 'cartCss' } as const;
export type TouchSurface = keyof typeof TOUCH_KEYS;
export type KitTouchCss = Partial<Record<(typeof TOUCH_KEYS)[TouchSurface], string>>;
export type KitTouchResult = { css: KitTouchCss; notes: string[]; dropped: Array<{ surface: TouchSurface; reason: string }> };
export const KIT_TOUCH_TIMEOUT_MS = 60_000;
export const KIT_TOUCH_MAX_OUTPUT_TOKENS = 6_000;
const SURFACES: TouchSurface[] = ['product', 'catalog', 'card', 'cart'];
export const KIT_TOUCH_SCHEMA = { type: 'object', additionalProperties: false, required: ['product', 'catalog', 'card', 'cart', 'notes'],
  properties: { product: { type: 'string' }, catalog: { type: 'string' }, card: { type: 'string' }, cart: { type: 'string' }, notes: { type: 'array', items: { type: 'string' } } } } as const;
const replySchema = z.object({ product: z.string(), catalog: z.string(), card: z.string(), cart: z.string(), notes: z.array(z.string()) });

const PLATFORM_CSS = new Set(['commerce-pages.css', 'brand.css']);
const DEVICE = /\b(transform|rotate|box-shadow|clip-path|filter|mask|mix-blend-mode|animation)\s*:/i;
/** The authored rules that carry a visual device (transforms, hard shadows, cut edges, filters, pseudo-element layers,
 * keyframes), from the store's own stylesheets only, trimmed to about 4 KB. */
export function distinctiveCss(files: ReadonlyArray<{ path: string; content: string }>, limit = 4000): string {
  const out: string[] = [];
  for (const file of files.filter(f => f.path.endsWith('.css') && !PLATFORM_CSS.has(f.path) && !f.path.startsWith('assets/'))) {
    let root: postcss.Root;
    try { root = postcss.parse(file.content); } catch { continue; }
    root.walk(node => {
      if (node.type === 'atrule' && /keyframes$/i.test(node.name)) out.push(node.toString());
      else if (node.type === 'rule' && node.parent?.type !== 'atrule' && (/::?(before|after)/.test(node.selector) || DEVICE.test(node.toString()))) out.push(node.toString());
    });
  }
  let text = '';
  for (const rule of out) { if (text.length + rule.length > limit) break; text += `${rule}\n`; }
  return text.trim();
}

export function kitTouchPrompt(input: { storeName: string; look?: StoreLook; signature?: unknown; distinctive: string; instruction?: string }): string {
  return [
    `You designed the home page of «${input.storeName}» (screenshots attached: the first screens at 1280px). The platform draws four more surfaces itself: the product page, the catalog pages, the product cards and the cart drawer. They already follow the home's measured look below. Carry the home page's OWN distinctive devices onto those surfaces with guarded CSS, so a shopper never feels they left the store. Never invent a new style: use only devices the home already shows (its shadows, frames, rotations, cut edges, stamps, rules, label style). Leave a surface empty when the measured look already carries it.`,
    `Measured look: ${JSON.stringify(input.look ?? {})}`,
    input.signature ? `The store's signature: ${JSON.stringify(input.signature)}` : '',
    `The home page's distinctive CSS (excerpt):\n${input.distinctive || '(none)'}`,
    input.instruction ? `The merchant asked now: «${input.instruction}». Apply it to these surfaces only.` : '',
    'Guarded CSS, for every surface:',
    '- Selectors are only [data-part="name"] compounds (at most 3 per selector) with :hover, :focus-visible, ::before or ::after. No tags, classes or ids. The platform adds the scope.',
    '- Allowed: literal colours or var(--store-*), var(--brand-*), var(--kit-*) (and var(--pd-*) on the product page); borders, border-radius, box-shadow, outline, backgrounds (colours and gradients), filter (grayscale/sepia 0-1, saturate 0-2, contrast/brightness 0.5-1.5, hue-rotate up to 45deg), transform, clip-path (not on buttons), aspect-ratio, object-fit, letter-spacing, text-transform, font-style, @keyframes. No url(), no !important, no custom properties, no position:fixed.',
    '- At most 40 rules and 3000 characters per surface.',
    `- product parts: ${COSMETIC_PARTS.join(', ')}. Price, options, quantity, the buy button, the seal and the trust row are protected.`,
    `- catalog parts: ${CATALOG_PARTS.join(', ')}.`,
    `- card parts: ${CARD_PARTS.join(', ')}. The price and the add-to-cart button are protected; never hide, shrink or fade a card.`,
    `- cart parts: ${CART_PARTS.join(', ')}. Quantities, totals, remove and the checkout button are protected; never hide, shrink or fade a line.`,
    "A real browser checks every surface at 390px and 1280px: anything that hides, covers, shrinks or fades a protected control, or makes a page scroll sideways, drops that surface's CSS.",
    'Answer with JSON: product, catalog, card and cart (each CSS text, empty when nothing is needed) and notes (one short line in Spanish per surface you changed, for the merchant).',
  ].filter(Boolean).join('\n\n');
}

type ModelImage = { type: 'input_image'; image_url: string; detail: 'auto' };
export type KitTouchDeps = {
  files: SourceProjectFileDto[]; brief: unknown; storeName: string; signature?: unknown; instruction?: string; signal: AbortSignal;
  call: (text: string, images: ModelImage[]) => Promise<{ body: unknown; used: () => void }>;
  capture?: (snapshot: SourceProjectSnapshot, signal: AbortSignal) => Promise<ModelImage[]>;
  checkProduct?: (snapshot: SourceProjectSnapshot, options: { signal?: AbortSignal }) => Promise<ThemeCheckFailure[]>;
  checkSurfaces?: (snapshot: SourceProjectSnapshot, options: { signal?: AbortSignal }) => Promise<KitSurfaceFailures>;
};

/** The home page's first screens at 1280px, from the review's own capture helper. */
export async function captureHomeForTouch(snapshot: SourceProjectSnapshot, signal: AbortSignal): Promise<ModelImage[]> {
  const { shots } = await captureSep5Draft(await currentSourceRuntime(snapshot), signal);
  return shots.filter(shot => shot.width === 1280).slice(0, 2).map(shot => ({ type: 'input_image', image_url: shot.image, detail: 'auto' }));
}

export async function runKitTouch(deps: KitTouchDeps): Promise<KitTouchResult | null> {
  const snapshot = { brief: deps.brief, files: deps.files } as unknown as SourceProjectSnapshot;
  const config = readConfigFile(deps.files);
  const images = await (deps.capture ?? captureHomeForTouch)(snapshot, deps.signal);
  const { body, used } = await deps.call(kitTouchPrompt({ storeName: deps.storeName, look: sanitizeLook(config.look), signature: deps.signature, distinctive: distinctiveCss(deps.files), instruction: deps.instruction }), images);
  let raw: unknown;
  try { raw = sourceResponseJson(body); } catch { return null; }
  const parsed = replySchema.safeParse(raw);
  if (!parsed.success) return null;
  const css: KitTouchCss = {};
  const dropped: KitTouchResult['dropped'] = [];
  for (const surface of SURFACES) {
    const text = parsed.data[surface];
    if (!text.trim()) continue;
    const report = surface === 'product' ? sanitizeProductThemeCss(text) : sanitizeKitSurfaceCss(surface as KitSurface, text);
    for (const item of report.dropped) dropped.push({ surface, reason: `${item.rule ?? item.declaration ?? ''} ${item.reason}`.trim() });
    if (report.css) css[TOUCH_KEYS[surface]] = report.css;
  }
  if (Object.keys(css).length) {
    const candidate = { ...snapshot, files: patchConfigFile(deps.files, current => ({ ...current, dna: { version: 1, ...(current.dna ?? {}), ...css } })) } as SourceProjectSnapshot;
    if (css.productCss) {
      const failures = await (deps.checkProduct ?? checkProductThemeOnSnapshot)(candidate, { signal: deps.signal });
      if (failures.length) { delete css.productCss; dropped.push(...failures.map(f => ({ surface: 'product' as const, reason: `${f.control} (${f.viewport}): ${f.reason}` }))); }
    }
    if (css.catalogCss || css.cardCss || css.cartCss) {
      const failures = await (deps.checkSurfaces ?? checkKitSurfacesOnSnapshot)(candidate, { signal: deps.signal });
      for (const surface of ['catalog', 'card', 'cart'] as const) if (css[TOUCH_KEYS[surface]] && failures[surface].length) {
        delete css[TOUCH_KEYS[surface]];
        dropped.push(...failures[surface].map(f => ({ surface, reason: `${f.control} (${f.viewport}): ${f.reason}` })));
      }
    }
  }
  if (Object.keys(css).length) used();
  return { css, notes: parsed.data.notes.slice(0, 4).map(note => note.slice(0, 200)), dropped };
}

/** The touch a store's previous save carried (marked dna.touch = 1): kept on an ordinary edit, never on a new store or a
 * redesign, whose design is new. The concept's DNA re-seeds productCss on every save, so KEPT_DNA alone would lose it. */
export function carriedTouch(previousDna: unknown, creative: boolean): Record<string, string | number> {
  if (creative || !previousDna || typeof previousDna !== 'object' || (previousDna as Record<string, unknown>).touch !== 1) return {};
  const dna = previousDna as Record<string, unknown>;
  const out: Record<string, string | number> = { touch: 1 };
  for (const key of Object.values(TOUCH_KEYS)) if (typeof dna[key] === 'string' && dna[key]) out[key] = dna[key] as string;
  return out;
}
```

Run: `cd apps/api && npx jest src/storefront-source/kit-touch.spec.ts`
Expected: PASS.

- [ ] **Step 3: Write the failing service tests**

At the top of `source-generation-review.spec.ts`, add mocks for the browser checks:

```ts
jest.mock('./product-theme-check', () => ({ ...jest.requireActual('./product-theme-check'), checkProductThemeOnSnapshot: jest.fn().mockResolvedValue([]) }));
jest.mock('./kit-surface-check', () => ({ checkKitSurfacesOnSnapshot: jest.fn().mockResolvedValue({ catalog: [], card: [], cart: [] }) }));
import { checkKitSurfacesOnSnapshot } from './kit-surface-check';
```

At the end of the file:

```ts
describe('one look per store: YAPI touches the kit pages in the review stage', () => {
  let service: SourceGenerationService, projects: any, config: any;
  const configOf = (call: any[]) => JSON.parse(call[2].files.find((f: any) => f.path === 'config.js').content.replace(/^window\.PAGOSYA_CONFIG = /, '').replace(/;\s*$/, ''));
  const TOUCH = { product: '', catalog: '', card: '[data-part="card-media"]{transform:rotate(-2deg)}', cart: '', notes: ['Tarjetas inclinadas como en la portada.'] };
  const NO_EDITS = { label: 'Café', notes: [], edits: [] };
  const respondWith = (review: unknown, touch: unknown) => async (_url: unknown, init: any) => {
    const name = JSON.parse(init.body).text.format.name;
    return name === 'storefront_self_review' ? answer(review) : name === 'storefront_kit_touch' ? answer(touch) : answer({ label: 'Café', files: files(), products: [] });
  };
  const run = () => service.generate('m1', 's1', dto, new SourceRequestBudget(25), []);
  beforeEach(() => {
    ({ service, projects, config } = setup());
    jest.spyOn(SourceDesignPlanner.prototype, 'explore').mockResolvedValue(threeConceptDesign);
    jest.spyOn(designModule, 'sourceDesignExploration').mockReturnValue(designModule.sourceDesignExploration(0));
    config.set('app.yapiKitTouch', true);
    (checkKitSurfacesOnSnapshot as jest.Mock).mockReset().mockResolvedValue({ catalog: [], card: [], cart: [] });
  });
  afterEach(() => jest.restoreAllMocks());

  it('saves N+1 with the touch even when the review changes nothing', async () => {
    jest.spyOn(globalThis, 'fetch').mockImplementation(respondWith(NO_EDITS, TOUCH) as any);
    await run();
    await eventually(() => projects.save.mock.calls.length === 2);
    const dna = configOf(projects.save.mock.calls[1]).dna;
    expect(dna.cardCss).toContain('rotate(-2deg)');
    expect(dna.touch).toBe(1);
  });

  it('a surface that fails its check is dropped, and nothing left means no N+1', async () => {
    (checkKitSurfacesOnSnapshot as jest.Mock).mockResolvedValue({ catalog: [], card: [{ control: 'add', viewport: 'mobile', reason: 'covered by another element' }], cart: [] });
    jest.spyOn(globalThis, 'fetch').mockImplementation(respondWith(NO_EDITS, TOUCH) as any);
    await run();
    await new Promise(resolve => setTimeout(resolve, 300));
    expect(projects.save).toHaveBeenCalledTimes(1);
  });

  it('an unusable touch answer leaves revision N as the store', async () => {
    jest.spyOn(globalThis, 'fetch').mockImplementation(respondWith(NO_EDITS, 'not json') as any);
    await run();
    await new Promise(resolve => setTimeout(resolve, 3600));
    expect(projects.save).toHaveBeenCalledTimes(1);
  });

  it('does not call the touch step when YAPI_KIT_TOUCH is off', async () => {
    config.set('app.yapiKitTouch', false);
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(respondWith(NO_EDITS, TOUCH) as any);
    await run();
    await new Promise(resolve => setTimeout(resolve, 300));
    expect(fetchMock.mock.calls.some(c => JSON.parse((c[1] as any).body).text.format.name === 'storefront_kit_touch')).toBe(false);
  });
});
```

Run: `cd apps/api && npx jest src/storefront-source/source-generation-review.spec.ts -t "touches the kit pages"`
Expected: FAIL. The first test sees only one save.

- [ ] **Step 4: Wire the touch step into the service**

In `source-generation.service.ts`:

1. Imports:

```ts
import { carriedTouch, KIT_TOUCH_MAX_OUTPUT_TOKENS, KIT_TOUCH_SCHEMA, KIT_TOUCH_TIMEOUT_MS, runKitTouch, type KitTouchCss } from './kit-touch';
```

2. At line 130, add `| 'touch'` after `'review'` in the attempt phase union.

3. Next to `let sep5Review: Sep5Review | undefined;` (~line 747), add:

```ts
      /** YAPI's guarded touches on the kit pages (spec 2026-10-14), written by the review stage or a chat request. */
      let kitTouch: KitTouchCss | undefined;
```

4. Change `sep5Call` so the touch can ask for a smaller answer. Replace its signature with:

```ts
        const sep5Call = async (phase: 'author' | 'review' | 'touch', text: string, attached: typeof images, schemaName: string, schema: object, timeoutMs: number, options: { signal?: AbortSignal; attempts?: SourceGenerationAttempt[]; maxOutputTokens?: number; effort?: 'low' | 'medium' | 'high' } = {}) => {
```

   and change two uses inside it:
   - In `budget.reserve(model, Math.ceil(text.length / 3) + 1000, SEP5_MAX_OUTPUT_TOKENS, 500)`, replace `SEP5_MAX_OUTPUT_TOKENS` with `options.maxOutputTokens ?? SEP5_MAX_OUTPUT_TOKENS`.
   - In the request body, replace `reasoning: { effort: 'high' }` with `reasoning: { effort: options.effort ?? 'high' }`.

5. Directly after the `sep5Call` definition, add:

```ts
        /** The touch call (spec 2026-10-14): the same metered client, a smaller answer, and one more try after 3 s when the
         *  bridge gives no completed answer. The attempt is charged only when its CSS is kept (`used`). */
        const touchCall = (run: { signal: AbortSignal; attempts: SourceGenerationAttempt[] }) => async (text: string, attached: Array<{ type: 'input_image'; image_url: string; detail: 'auto' }>) => {
          for (let tries = 0; ; tries++) {
            const { attempt, body } = await sep5Call('touch', text, attached as typeof images, 'storefront_kit_touch', KIT_TOUCH_SCHEMA, KIT_TOUCH_TIMEOUT_MS, { signal: run.signal, attempts: run.attempts, maxOutputTokens: KIT_TOUCH_MAX_OUTPUT_TOKENS, effort: 'medium' });
            if ((body as { status?: string } | null)?.status === 'completed' || tries === 1) return { body, used: () => { attempt.status = 'COMPLETED'; } };
            await new Promise(resolve => setTimeout(resolve, 3000));
            run.signal.throwIfAborted();
          }
        };
```

6. Replace the whole review block with the code below. It runs from `        if (sep5SelfReview) {` through its closing `        }`, which is the line just before `        await addSep5StandardPages();` at the end of the Sep-5 branch.

```ts
        // Kit touches (spec 2026-10-14 one look per store) ride the same background stage: after the review's edits, on the
        // final home page, saved in the same N+1. A shop only: showcases have no kit pages.
        const kitTouchOn = this.config.get<boolean>('app.yapiKitTouch') === true && sitePurpose === 'shop';
        if (sep5SelfReview || kitTouchOn) {
          const draftFiles = authored.data.files, draftPreview = acceptedPreviewFiles;
          sep5Review = async review => {
            const notes: string[] = [];
            let changed = false;
            if (sep5SelfReview) {
              // The same config a new store saves with, so the runtime renders the live catalog into the draft.
              const config = { sitePurpose, scrollFeel, demo: false, slug: owner.slug, apiBaseUrl: apiUrl.href.replace(/\/$/, ''), checkoutOrigin: this.config.get<string>('app.checkoutOrigin'), productPage: 'product.html', checkoutPage: 'checkout.html', data };
              const preview = await currentSourceRuntime({ brief: dto.brief, files: [
                ...draftPreview.filter(file => !['config.js', 'commerce.js'].includes(file.path)),
                { path: 'config.js', content: `window.PAGOSYA_CONFIG = ${JSON.stringify(config)};\n` },
                { path: 'commerce.js', content: '' },
              ] } as unknown as SourceProjectSnapshot);
              const { shots, facts } = await captureSep5Draft(preview, review.signal);
              // Playbook facts: type sizes against the kind's craft profile, and contract sections missing from the page.
              const playbookFacts = playbookEntry ? facts.flatMap(fact => [...(boldAsked ? [] : craftFacts(playbookEntry.profile, fact.width, fact.h1Size ?? 0, fact.bodySize ?? 0)), ...(fact.width === 1280 && fact.pageText ? contractMisses(playbookEntry, fact.pageText, playbookEvidence).map(label => `Falta en la página: ${label} (solo con datos reales del brief; nunca lo inventes).`) : [])]) : [];
              const measured = [...sep5MeasuredFacts(facts), ...playbookFacts];
              const reviewed = await sep5Call('review', sep5ReviewPrompt({ ...authorInput, draft: draftFiles, measured }), shots.map(shot => ({ type: 'input_image' as const, image_url: shot.image, detail: 'auto' as const })), 'storefront_self_review', SEP5_REVIEW_RESPONSE_SCHEMA, SEP5_CLIENT_TIMEOUT_MS, review);
              const result = sep5ReviewSchema.safeParse(sourceResponseJson(reviewed.body));
              if (!result.success) throw new Error(`la revisión no devolvió un resultado válido (${reviewed.attempt.responseStatus || 'sin estado'}${reviewed.attempt.incompleteReason ? `: ${reviewed.attempt.incompleteReason}` : ''})`);
              this.logger.log(JSON.stringify({ event: 'sep5_self_review', generationId: run.id, measured, changed: result.data.edits.length > 0, edits: result.data.edits.length, notes: result.data.notes.length }));
              // Edits on the draft the review was shown; one that does not apply cleanly is skipped, never fatal.
              const edited = applySep5Edits(draftFiles, result.data.edits);
              if (edited.files.every((file, index) => file.content === draftFiles[index]?.content)) reviewed.attempt.status = 'COMPLETED';
              else {
                if (!sep5ProjectIsUsable(edited.files, sitePurpose)) throw new Error(sitePurpose === 'shop' ? 'la revisión dejó el proyecto sin catálogo, carrito o estilos' : 'la revisión dejó el sitio sin su acción principal o sin estilos');
                const kept = sep5AuthorableFiles(edited.files);
                reviewing = true;
                generated = { label: result.data.label.slice(0, 120) || generated.label, files: kept.files };
                lenient = true;
                try { await acceptCandidate(); } finally { lenient = false; }
                await addSep5StandardPages();
                reviewed.attempt.status = 'COMPLETED';
                notes.push(...result.data.notes);
                changed = true;
              }
            }
            if (kitTouchOn) {
              try {
                const base = await assembleSave(review.signal);
                const touch = await runKitTouch({ files: base.files, brief: dto.brief, storeName: (data as { storeName?: string }).storeName || owner.slug, signature: committedDesign?.concepts[committedDesign.selected]?.signature, signal: review.signal, call: touchCall(review) });
                const surfaces = Object.keys(touch?.css ?? {});
                if (touch && surfaces.length) { kitTouch = touch.css; notes.push(...touch.notes); changed = true; }
                this.logger.log(JSON.stringify({ event: surfaces.length ? 'kit_touch_saved' : 'kit_touch_dropped', generationId: run.id, surfaces, dropped: (touch?.dropped ?? []).slice(0, 12), ...(touch ? {} : { reason: 'unusable answer' }) }));
              } catch (error) {
                review.signal.throwIfAborted();
                this.logger.warn(JSON.stringify({ event: 'kit_touch_dropped', generationId: run.id, reason: ((error as Error)?.message || '').slice(0, 300) }));
              }
            }
            // Nothing changed: revision N stays the store and no empty «Revisión de YAPI» is saved.
            if (!changed) return null;
            return { saveInput: await assembleSave(review.signal), notes };
          };
        }
```

   Before replacing, diff the block you remove against this text. Apart from the restructuring (the `if (sep5SelfReview)` wrapper, `notes`/`changed`, and the touch block), every line must be identical. If the current file has drifted from the lines quoted here (for example, a new argument), keep the current file's version of those lines.

7. In `assembleSave`, add the touch keys to `KEPT_DNA`:

```ts
      const KEPT_DNA = ['swatch', 'gallery', 'blocks', 'divider', 'enter', 'media', 'productCss', 'catalogCss', 'cardCss', 'cartCss', 'touch', 'button', 'card', 'cart', 'review', 'motion', 'hover', 'press', 'added', 'checkout', 'fields'];
```

   and add the touch to the `dna` merge:

```ts
      const dna = { ...sourceRuntimeDna(conceptDna, storeId, productPageStyle), ...carriedDna, ...carriedTouch(previousConfig.dna, creative), ...(agentTheme ? productThemeRuntime(agentTheme) : sketchTheme ?? {}), ...(frame.dna ?? {}), ...drawnCommerce.dna, ...(kitTouch && Object.keys(kitTouch).length ? { ...kitTouch, touch: 1 } : {}) };
```

- [ ] **Step 5: Run the tests**

Run: `cd apps/api && npx jest src/storefront-source/kit-touch.spec.ts src/storefront-source/source-generation-review.spec.ts`
Expected: PASS, including every existing review test. The review behaves exactly as before when `app.yapiKitTouch` is unset.

Run: `cd apps/api && npx jest src/storefront-source/source-generation.service.spec.ts src/storefront-source/source-generation-style.spec.ts`
Expected: the same pass/fail counts as before this task.

Run: `cd apps/api && npx tsc --noEmit -p tsconfig.json`
Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/storefront-source/kit-touch.ts apps/api/src/storefront-source/kit-touch.spec.ts apps/api/src/storefront-source/source-generation.service.ts apps/api/src/storefront-source/source-generation-review.spec.ts
git commit -m "feat(look): YAPI touches the kit pages in the Sep-5 review stage — one call, guarded per surface, carried across edits"
```

---

### Task 8: Chat requests, the agent tool, the stale prompt sentence

**Files:**
- Modify: `apps/api/src/storefront-source/kit-touch.ts` (`instructionConcernsKitSurfaces`, `pickTouch`)
- Modify: `apps/api/src/storefront-source/source-generation.service.ts`
  - hoist `sep5Call` and `touchCall` above `if (sep5Author) {`
  - add the re-run before `await progress?.('saving');` (~line 1541)
- Modify: `apps/api/src/storefront-source/product-theme.ts`, `apps/api/src/storefront-source/agent/agent-tools.ts`
- Modify: `apps/api/src/storefront-source/source-design.ts:13`
- Test: `apps/api/src/storefront-source/kit-touch.spec.ts`, `apps/api/src/storefront-source/product-theme.spec.ts`

**Interfaces:**
- Consumes: everything from Task 7.
- Produces:
  - `instructionConcernsKitSurfaces(text: string): boolean`
  - `pickTouch(dna: unknown): KitTouchCss`
  - `ProductThemeInput.kitCss?: { catalog?: string; card?: string; cart?: string }`
  - `ProductThemeResult['dna']` gains optional `catalogCss`, `cardCss` and `cartCss`
  - `productThemeRuntime` emits those fields, plus `touch: 1` when any of them is present

- [ ] **Step 1: Write the failing tests**

Append to `kit-touch.spec.ts`:

```ts
import { instructionConcernsKitSurfaces, pickTouch } from './kit-touch';

describe('instructionConcernsKitSurfaces', () => {
  it.each([
    ['Pon las fotos de los productos inclinadas', true], ['El carrito con un sello como en la portada', true], ['Cambia el catálogo', true],
    ['La página de producto más parecida a la portada', true], ['Las tarjetas de producto con sombra', true],
    ['Cambia el título del inicio', false], ['Agrega mi horario', false],
  ])('%s → %s', (text, expected) => expect(instructionConcernsKitSurfaces(text)).toBe(expected));

  it("reads only the merchant's own words after the marker", () => {
    expect(instructionConcernsKitSurfaces('Resumen: tienda con carrito.\nPedido actual del comercio: cambia el título')).toBe(false);
  });
});

it('pickTouch keeps only non-empty touch fields', () => expect(pickTouch({ swatch: 'pill', cardCss: 'x', cartCss: '' })).toEqual({ cardCss: 'x' }));
```

Append to `product-theme.spec.ts` (create the file with this block if it does not exist):

```ts
import { productThemeRuntime, resolveProductTheme } from './product-theme';

describe('kit surface CSS through the product theme (spec 2026-10-14)', () => {
  it('sanitizes catalog, card and cart CSS and marks the runtime as touched', async () => {
    const result = await resolveProductTheme({ kitCss: { card: '[data-part="card-media"]{transform:rotate(-2deg)}', cart: '.menu-add{opacity:0}' } });
    expect(result.dna.cardCss).toContain('[data-pagosya-catalog] [data-part="card-media"]');
    expect(result.dna.cartCss).toBeUndefined();
    expect(productThemeRuntime(result.dna)).toMatchObject({ cardCss: result.dna.cardCss, touch: 1 });
  });
});
```

Run: `cd apps/api && npx jest src/storefront-source/kit-touch.spec.ts src/storefront-source/product-theme.spec.ts`
Expected: FAIL (missing exports and fields).

- [ ] **Step 2: Implement the request matcher, `pickTouch` and the theme fields**

In `kit-touch.ts`, add:

```ts
const MERCHANT_MARKER = 'Pedido actual del comercio:';
/** Does the merchant's own request concern the kit pages (product page, catalog, cards, cart)? Only their words count. */
export function instructionConcernsKitSurfaces(text: string): boolean {
  const own = (text.split(MERCHANT_MARKER).at(-1) ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  return /\bcarrito\b|\bcatalogo\b|\bfotos?\s+de\s+(?:los\s+)?productos?\b|\btarjetas?\s+de(?:l)?\s+productos?\b|\bpagina\s+de(?:l)?\s+productos?\b|\bficha\b|\bproduct\s+(?:page|card)s?\b/.test(own);
}

/** The touch fields of a dna object (the surfaces the store already had touched), empty ones left out. */
export function pickTouch(dna: unknown): KitTouchCss {
  const source = dna && typeof dna === 'object' ? dna as Record<string, unknown> : {};
  return Object.fromEntries(Object.values(TOUCH_KEYS).filter(key => typeof source[key] === 'string' && source[key]).map(key => [key, source[key] as string]));
}
```

In `product-theme.ts`:
- Extend `ProductThemeInput` with `kitCss?: { catalog?: string; card?: string; cart?: string }`.
- Extend `ProductThemeResult['dna']` with `catalogCss?: string; cardCss?: string; cartCss?: string`.
- Import `sanitizeKitSurfaceCss` from `./product-theme-css`.
- In `resolveProductTheme`, before the `return`, add the block below, then add `...kit` inside the returned `dna` object:

```ts
  // YAPI's touches on the kit's other surfaces (spec 2026-10-14): sanitized here; the browser check runs in kit-touch.ts.
  const kit: { catalogCss?: string; cardCss?: string; cartCss?: string } = {};
  for (const [surface, key] of [['catalog', 'catalogCss'], ['card', 'cardCss'], ['cart', 'cartCss']] as const) {
    const text = input.kitCss?.[surface];
    if (typeof text === 'string' && text.trim()) { const report = sanitizeKitSurfaceCss(surface, text); if (report.css) kit[key] = report.css; }
  }
```

- Change `productThemeRuntime` to the version below. Keep its doc comment, and adjust any call site that declared the return type as `Record<string, string>`.

```ts
export function productThemeRuntime(theme: ProductThemeResult['dna']): Record<string, string | number> {
  const kit = Object.fromEntries((['catalogCss', 'cardCss', 'cartCss'] as const).filter(key => theme[key]).map(key => [key, theme[key] as string]));
  return { ...theme.productCard, ...(theme.productCss ? { productCss: theme.productCss } : {}), ...kit, ...(Object.keys(kit).length ? { touch: 1 } : {}) };
}
```

In `agent/agent-tools.ts`:
1. Import `CATALOG_PARTS, CARD_PARTS, CART_PARTS` next to `COSMETIC_PARTS`.
2. In the `set_product_card_theme` tool schema, add after `css`:

```ts
    catalogCss: { type: ['string', 'null'], description: `CSS con guardas para las páginas de catálogo. Partes: ${CATALOG_PARTS.join(', ')}. null no cambia nada.` },
    cardCss: { type: ['string', 'null'], description: `CSS con guardas para las tarjetas de producto. Partes: ${CARD_PARTS.join(', ')}. Precio y botón de agregar están protegidos.` },
    cartCss: { type: ['string', 'null'], description: `CSS con guardas para el carrito. Partes: ${CART_PARTS.join(', ')}. Cantidades, totales y el botón de pagar están protegidos.` },
```

3. In the `case 'set_product_card_theme':` handler, after `if (typeof args.css === 'string' && args.css.trim()) chosen.css = args.css;`, add:

```ts
        const kitCss = Object.fromEntries((['catalog', 'card', 'cart'] as const).filter(surface => typeof args[`${surface}Css`] === 'string' && (args[`${surface}Css`] as string).trim()).map(surface => [surface, args[`${surface}Css`] as string]));
        if (Object.keys(kitCss).length) chosen.kitCss = kitCss;
```

4. Change the "nothing changed" guard to: `if (!chosen.preset && !chosen.params && !chosen.css && !chosen.kitCss && chosen.assurances === undefined)`.

Run: `cd apps/api && npx jest src/storefront-source/kit-touch.spec.ts src/storefront-source/product-theme.spec.ts src/storefront-source/agent`
Expected: PASS.

- [ ] **Step 3: Re-run the touch on a chat request**

In `source-generation.service.ts`:

1. Move the `sep5Call` and `touchCall` definitions, unchanged, from inside `if (sep5Author) {` to directly before that line, so every engine can use them. They only use `model`, `provider`, `apiKey`, `budget`, `attempts`, `signal`, `storeId` and `this.metering`, all declared earlier in `generate`.
2. Import `instructionConcernsKitSurfaces` and `pickTouch` from `./kit-touch`, and `readConfigFile` from `./store-look`.
3. Just before `    await progress?.('saving');` (~line 1541), add:

```ts
    // A chat request about the kit pages (spec 2026-10-14) re-runs only the touch step, with the merchant's words. The new
    // CSS replaces the surfaces it covers; surfaces it leaves empty keep the store's earlier touch.
    if (!creative && !claude && sitePurpose === 'shop' && this.config.get<boolean>('app.yapiKitTouch') === true && instructionConcernsKitSurfaces(dto.instruction)) {
      try {
        const base = await assembleSave();
        const touch = await runKitTouch({ files: base.files, brief: dto.brief, storeName: (data as { storeName?: string }).storeName || owner.slug, instruction: (dto.instruction.split('Pedido actual del comercio:').at(-1) ?? dto.instruction).trim().slice(0, 400), signal, call: touchCall({ signal, attempts }) });
        if (touch && Object.keys(touch.css).length) kitTouch = { ...pickTouch(readConfigFile(base.files).dna), ...touch.css };
        this.logger.log(JSON.stringify({ event: touch && Object.keys(touch.css).length ? 'kit_touch_saved' : 'kit_touch_dropped', generationId: run.id, surfaces: Object.keys(touch?.css ?? {}), request: true }));
      } catch (error) {
        signal.throwIfAborted();
        this.logger.warn(JSON.stringify({ event: 'kit_touch_dropped', generationId: run.id, reason: ((error as Error)?.message || '').slice(0, 300), request: true }));
      }
    }
```

- [ ] **Step 4: Fix the stale product-page sentence**

In `source-design.ts:13` (`SOURCE_PRODUCT_PRESENTATION_DIRECTION`):
- Change `in the editorial, dense, image-led or story-led presentation chosen by layout.productPage.` to `in the editorial, dense, image-led, story-led or conversion presentation chosen by layout.productPage.`
- After the sentence about story-led, add `Conversion puts icon tiles beside the photo, check-marked benefits and the price in the buy button.`

- [ ] **Step 5: Run the tests**

Run: `cd apps/api && npx jest src/storefront-source/kit-touch.spec.ts src/storefront-source/product-theme.spec.ts src/storefront-source/source-generation-review.spec.ts src/storefront-source/source-design.spec.ts`
Expected: PASS. If `source-design.spec.ts` snapshots the direction text, update only that string's expectation.

Run: `cd apps/api && npx tsc --noEmit -p tsconfig.json`
Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/storefront-source/kit-touch.ts apps/api/src/storefront-source/kit-touch.spec.ts apps/api/src/storefront-source/product-theme.ts apps/api/src/storefront-source/product-theme.spec.ts apps/api/src/storefront-source/agent/agent-tools.ts apps/api/src/storefront-source/source-generation.service.ts apps/api/src/storefront-source/source-design.ts
git commit -m "feat(look): chat requests about the kit pages re-run YAPI's touch; agent tool styles catalog, cards and cart; conversion named in the prompt"
```

---

### Task 9: Live-check script, then the owner's live check

**Files:**
- Create: `apps/api/scripts/one-look-check.ts`

**Interfaces:**
- Consumes: `readLookInPage` (Task 2); `lookFromReading`, `sanitizeLook`, `readConfigFile` and `patchConfigFile` (Task 1); `withVisualSandbox`, `currentSourceRuntime` and `parseFrameDraw` (existing).
- Produces: a printed report for success criteria 1 and 2.

- [ ] **Step 1: Write the script**

```ts
// apps/api/scripts/one-look-check.ts
/**
 * One look per store (spec 2026-10-14), success criteria 1 (coherence) and 2 (uniqueness) on saved stores. READ-ONLY: it
 * reads each store's latest saved revision and renders it offline in the visual sandbox. It never writes, never calls a model.
 *   npx ts-node --transpile-only scripts/one-look-check.ts <storeSlug> [<storeSlug> ...]
 */
import { PrismaClient } from '@prisma/client';
import { withVisualSandbox } from '../src/storefront-source/source-visual-capture';
import { currentSourceRuntime } from '../src/storefront-source/source-runtime';
import { readLookInPage } from '../src/storefront-source/store-look-measure';
import { lookFromReading, patchConfigFile, readConfigFile, sanitizeLook, type StoreLook } from '../src/storefront-source/store-look';
import { parseFrameDraw, FRAME_DRAW_FILE } from '../src/storefront-source/design-engine/frame-draw';
import type { SourceProjectSnapshot } from '../src/storefront-source/source-project';

const origin = 'https://preview.invalid';
const radiusCss = (value: unknown) => value === 'pill' ? '999px' : typeof value === 'number' ? `${value}px` : undefined;

async function main() {
  const slugs = process.argv.slice(2);
  if (!slugs.length) throw new Error('usage: one-look-check.ts <storeSlug> [...]');
  const prisma = new PrismaClient();
  const rows: Array<Record<string, unknown>> = [];
  const looks: Array<{ slug: string; look?: StoreLook }> = [];
  try {
    for (const slug of slugs) {
      const store = await prisma.store.findFirst({ where: { slug }, select: { id: true, name: true } });
      const version = store && await prisma.storeSourceVersion.findFirst({ where: { storeId: store.id }, orderBy: { revision: 'desc' }, select: { revision: true, snapshot: true } });
      if (!store || !version) { rows.push({ slug, error: 'no saved revision' }); continue; }
      const runtime = await currentSourceRuntime(version.snapshot as unknown as SourceProjectSnapshot);
      const config = readConfigFile(runtime.files);
      const saved = sanitizeLook(config.look);
      const id = config.data?.items?.[0]?.id as string | undefined;
      const demo = { ...runtime, files: patchConfigFile(runtime.files, c => ({ ...c, demo: true })) };
      const facts = await withVisualSandbox(demo, '', undefined, true, async context => {
        const page = await context.newPage();
        await page.setViewportSize({ width: 1280, height: 800 });
        await page.goto(`${origin}/index.html`, { waitUntil: 'load' });
        await page.evaluate(() => document.fonts.ready.then(() => undefined));
        const home = await page.evaluate(readLookInPage);
        let pdp: Record<string, string> | null = null, card: Record<string, string> | null = null;
        if (id) {
          await page.goto(`${origin}/product.html?id=${encodeURIComponent(id)}`, { waitUntil: 'load' });
          await page.waitForSelector('[data-pagosya-product][data-style] [data-part=title]', { timeout: 8000 }).catch(() => undefined);
          pdp = await page.evaluate(() => { const t = document.querySelector('[data-pagosya-product][data-style] [data-part=title]'); const s = t && getComputedStyle(t); return s ? { family: s.fontFamily, weight: s.fontWeight, transform: s.textTransform, touch: Array.from(document.querySelectorAll('style[data-pagosya-kit$="-theme"]')).map(el => (el as HTMLElement).dataset.pagosyaKit ?? '').join(',') } : null; });
        }
        if (runtime.files.some(f => f.path === 'productos.html')) {
          await page.goto(`${origin}/productos.html`, { waitUntil: 'load' });
          await page.waitForSelector('[data-pagosya-catalog] .menu-item', { timeout: 8000 }).catch(() => undefined);
          card = await page.evaluate(() => { const img = document.querySelector('[data-pagosya-catalog] .menu-item:not([data-custom-product]) .menu-item__image'); const s = img && getComputedStyle(img); return s ? { radius: s.borderTopLeftRadius, filter: s.filter, shadow: s.boxShadow } : null; });
        }
        return { home, pdp, card };
      });
      const fresh = lookFromReading(facts.home, { treatment: parseFrameDraw(runtime.files.find(f => f.path === FRAME_DRAW_FILE)?.content).photos });
      const heading = saved?.type?.heading;
      const checks = {
        lookSaved: Boolean(saved),
        lookMatchesHome: JSON.stringify(fresh) === JSON.stringify(saved),
        titleFamily: !heading?.family || Boolean(facts.pdp?.family.includes(heading.family)),
        titleWeight: !heading?.weight || facts.pdp?.weight === String(heading.weight),
        titleCase: !heading?.case || facts.pdp?.transform === (heading.case === 'upper' ? 'uppercase' : 'none'),
        cardRadius: !radiusCss(saved?.shape?.photo) || facts.card?.radius === radiusCss(saved?.shape?.photo),
        cardTreatment: !['mono', 'sepia', 'duotone'].includes(saved?.photo?.treatment ?? '') || facts.card?.filter !== 'none',
      };
      rows.push({ slug, store: store.name, revision: version.revision, ...checks, touched: facts.pdp?.touch ?? '' });
      looks.push({ slug, look: saved });
    }
  } finally { await prisma.$disconnect(); }
  console.table(rows);
  const key = (look?: StoreLook) => JSON.stringify([look?.type?.heading?.family, look?.type?.heading?.weight, look?.type?.heading?.case, look?.shape?.photo, look?.edge, look?.photo?.treatment]);
  const seen = new Map<string, string>();
  for (const { slug, look } of looks) { const k = key(look); if (seen.has(k)) console.log(`NOT UNIQUE: ${slug} has the same type/shape/edge/photo combination as ${seen.get(k)}`); else seen.set(k, slug); }
  console.log(seen.size === looks.length ? 'Uniqueness: every store has its own combination.' : 'Uniqueness: FAILED (see above).');
}

main().catch(error => { console.error(error); process.exit(1); });
```

Run: `cd apps/api && npx ts-node --transpile-only scripts/one-look-check.ts`
Expected: exits with the usage error (proves the script compiles and its imports resolve).

- [ ] **Step 2: Commit**

```bash
git add apps/api/scripts/one-look-check.ts
git commit -m "chore(look): read-only live check for coherence and uniqueness (spec 2026-10-14)"
```

- [ ] **Step 3: Owner gate — ask before spending the ChatGPT plan**

Stop and ask the owner. Their YAPI runs go through `pnpm dev:chatgpt`, and a build takes about 7–14 minutes. Ask them to:
1. Restart the API so the new flags load (both are on by default), and rebuild the pre-built Studio (`vite build --mode embedded`) so Studio serves the current kit.
2. Approve three new test stores on the demo account (calm café, bold playful shop, services firm), plus one chat edit on an existing store: "pon las fotos de los productos inclinadas como en la portada".

- [ ] **Step 4: Run the live check (only after approval)**

For each of the three new stores, wait for both revisions (N and «Revisión de YAPI»). Then:
- Screenshot the home page, product page, catalog and cart at 1440 and 390, side by side, into the session scratchpad.
- Run `cd apps/api && npx ts-node --transpile-only scripts/one-look-check.ts <slug1> <slug2> <slug3>`. Expected: every check column `true`, and "Uniqueness: every store has its own combination."
- Check the API log:
  - `look_measured` on every save
  - `kit_touch_saved`, or `kit_touch_dropped` with its reasons, on each build
- Note how much the review stage's duration grew, against success criterion 5 (about 45 s at most).

For the chat edit: confirm the log shows `kit_touch_saved … request: true`, and that only the touched surfaces changed (compare the `config.js` dna before and after).

Report the results to the owner exactly as they are, including any failures. Do not fix live findings inside this task; list them for a follow-up.

---

## Self-review notes

**Spec coverage.** Where each spec item is built:

| Spec item | Task |
|---|---|
| Layer A fields | Task 1 (classification), Task 2 (reading) |
| Save paths | Task 3. Every generation save, including the review N+1, goes through `assembleSave`. Template restores and Studio file saves copy `config.js` as it is, so the look carries over. |
| Kit surfaces | Tasks 4–5 |
| Guards, profiles, browser check | Task 6 |
| Touch in the review stage, fallbacks table | Task 7 |
| Chat re-run, agent tool, prompt fix | Task 8 |
| Testing and success criteria | Tasks 2–9 |
| Kill switches, logging events | Tasks 3 and 7 |
| Deviations | The amendments appended in Task 1 |

**Known limits, accepted.**
- The chat re-run has no service-level test. Its pieces are unit-tested, and the live check covers it.
- Measurement covers only `index.html`.
