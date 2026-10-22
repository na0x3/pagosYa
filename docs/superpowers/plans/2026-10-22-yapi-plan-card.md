# YAPI plan card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A short or vague request becomes a checked, unique, reasoned plan that the merchant sees as a card (Construir / Cambiar) before YAPI builds it.

**Architecture:** Three pure modules (plan shape, deterministic checks, fingerprints) under `apps/api/src/storefront-source/plan/`; one new structured model call (`planStore`) beside `fillMaster`; `applyMaster` and `refill` accept a checked plan instead of the dice roll; the chat service routes first builds and vague edits through plan → checks → card, and runs a tapped plan by `planId`; the Studio renders the card.

**Tech Stack:** NestJS + Prisma (api, jest), TypeScript Studio (vitest), OpenAI Responses JSON-schema calls through the existing provider/bridge.

**Spec:** `docs/superpowers/specs/2026-10-22-yapi-plan-card-design.md`. Related, already built: `docs/superpowers/plans/2026-10-22-yapi-first-build-quality.md` (strong model on first builds, photo palette, kit motion pieces `data-pya-motion` — the follow-up brief in Task 7 may name them).

## Global Constraints

- Colour, shapes and motion only when they come from the brand or product on screen (logo, a photo, a merchant-confirmed brand colour); never invented.
- Light ground + ink; one accent for the page chrome; product cards 3–4 per row; no dark text-only band; no photo groups of 3+ unless asked.
- Every plan line carries a reason from the store's own data; a choice without one is replaced by the dice's choice for that part.
- No two stores share their section sequence; distance to any other store ≥ 0.35.
- Clear edits («cambia el precio», «quita las reseñas») keep today's path.
- Flag `YAPI_PLAN_CARD` — default on; `YAPI_PLAN_CARD=off` restores today's behaviour exactly.
- Merchant-facing text is Spanish, plain words, no internal ids.
- Internal message fields go on `SourceMessageInput`, never as an unvalidated DTO class field (an unvalidated class field makes every request 400). `planId` is a real DTO field with validators.
- Never run `prisma migrate`/`db push`/`reset` against the dev DB; this plan needs no migration.
- Check for RUNNING `StoreSourceChatJob` rows before saving `apps/api` files (nest --watch restarts kill YAPI runs). Rebuild the Studio (`cd apps/merchant-dashboard && pnpm run build:studio`) after Studio edits.

## Spec amendments (applied in Task 9)

1. Fingerprints are read from each store's current `store-data` (the dice already reads it this way); no `StorePlanFingerprint` table.
2. The plan's colour is `{ palette: <Esencial palette id>, accent?: <hex>, from: string }`; the accent hex is kept only with a valid `from`.

## Review Focus

1. A merchant taps **Construir** after the store changed (another tab, a background touch) → the card says the plan is outdated; nothing is built from it. (Task 7 test)
2. A catalog with no photos, no categories and one product → the plan still checks clean, gets no swatches/sidebar/dropdowns. (Task 2 test)
3. The plan call fails (bridge limit / timeout) → the unfinished-request note keeps the request and «sigue» re-plans; no silent dice store. (Task 7 test)
4. A model answer naming a variant that doesn't exist, or `"why": "se ve moderno"` → replaced by the dice's value for that part, never a crash. (Task 1, Task 2 tests)
5. Two stores of the same business made back to back → the second differs by ≥ 0.35 and has another section sequence. (Task 3 test)

---

## File Structure

| File | Responsibility |
|---|---|
| `apps/api/src/storefront-source/plan/store-plan.ts` (create) | `StorePlan` type, JSON schema for the model, `normalizePlan()` |
| `apps/api/src/storefront-source/plan/store-plan-checks.ts` (create) | `CatalogFacts`, `checkPlan()` — reasons, colour source, taste rules, catalog features, card lines |
| `apps/api/src/storefront-source/plan/store-plan-fingerprint.ts` (create) | `fingerprintOf()`, `planDistance()`, `clashesWith()`, `clashWords()`, `makeUnique()` |
| `apps/api/src/storefront-source/plan/store-plan-data.ts` (create) | `catalogFacts()` and `otherFingerprints()` — Prisma reads |
| `apps/api/src/storefront-source/source-conversation.service.ts` (modify) | `planStore()` call + `PLAN_PROMPT`; `vague` on the decision |
| `apps/api/src/storefront-source/source-templates.service.ts` (modify) | `applyMaster(..., plan)` uses the plan instead of the roll |
| `apps/api/src/storefront-source/source-templates.ts` (modify) | `assembleTemplateRevision` accepts a `dna` override |
| `apps/api/src/storefront-source/source-store-plan.service.ts` (create) | plan → checks → unique; follow-up brief |
| `apps/api/src/storefront-source/source-chat.service.ts` (modify) | Routes first builds, vague edits and `planId` |
| `apps/api/src/storefront-source/dto/send-source-message.dto.ts` (modify) | `planId` field |
| `apps/api/src/config/configuration.ts` (modify) | `yapiPlanCard` flag |
| `apps/merchant-studio/src/source-plan-card.ts` (create) | Card rendering |
| `apps/merchant-studio/src/source-studio.ts`, `api.ts`, `source-narrator.css` (modify) | Wire the card, send `planId` |

---

### Task 1: The plan shape

**Files:**
- Create: `apps/api/src/storefront-source/plan/store-plan.ts`
- Test: `apps/api/src/storefront-source/plan/store-plan.spec.ts`

**Interfaces:**
- Produces:
  - `type PlanChoice = { id: string; why: string }`
  - `type PlanCustomSection = { kind: 'per-brand' | 'per-category' | 'facts' | 'origin' | 'guide'; why: string; items: { name: string; layout: string; colourFrom?: string }[] }`
  - `type StorePlan = { version: 1; parts: Record<string, PlanChoice>; sections: PlanChoice[]; custom: PlanCustomSection[]; colour: { palette: string; accent?: string; from: string }; fonts: PlanChoice; motif?: { what: string; from: string }; brands: string[]; card: string[]; revision: number }`
  - `type PlanCatalogue = { variants: Record<string, readonly string[]>; sections: readonly string[]; palettes: readonly string[]; fonts: readonly string[] }`
  - `function planJsonSchema(c: PlanCatalogue): object`
  - `function normalizePlan(raw: unknown, c: PlanCatalogue, revision: number): StorePlan`

- [ ] **Step 1: Write the failing test**

```ts
import { normalizePlan, planJsonSchema, type PlanCatalogue } from './store-plan';

const catalogue: PlanCatalogue = {
  variants: { hero: ['full', 'split-left', 'type'], grid: ['grid3', 'grid4', 'feature'], header: ['classic', 'minimal'] },
  sections: ['process', 'faq', 'sizes'], palettes: ['linen', 'citrus'], fonts: ['grotesk', 'serif'],
};

it('keeps valid choices with their reasons and drops what does not exist', () => {
  const plan = normalizePlan({
    parts: { hero: { id: 'type', why: 'el nombre corto de la marca se lee grande' }, grid: { id: 'mosaic-xl', why: 'x' }, footer: { id: 'columns', why: 'y' } },
    sections: [{ id: 'faq', why: 'tres productos piden instrucciones de uso' }, { id: 'manifesto', why: 'z' }],
    custom: [{ kind: 'per-brand', why: '8 marcas en el catálogo', items: [{ name: 'Bloom', layout: 'stats', colourFrom: 'foto 2' }] }],
    colour: { palette: 'citrus', accent: '#F26B1D', from: 'logo' }, fonts: { id: 'grotesk', why: 'letra gruesa para un tono enérgico' },
    motif: { what: 'espiral', from: 'logo' }, brands: ['Bloom', 'MAGNUS'], card: ['Una sección por marca'],
  }, catalogue, 3);
  expect(plan.parts).toEqual({ hero: { id: 'type', why: 'el nombre corto de la marca se lee grande' } });
  expect(plan.sections).toEqual([{ id: 'faq', why: 'tres productos piden instrucciones de uso' }]);
  expect(plan.custom[0].items[0]).toEqual({ name: 'Bloom', layout: 'stats', colourFrom: 'foto 2' });
  expect(plan.colour).toEqual({ palette: 'citrus', accent: '#f26b1d', from: 'logo' });
  expect(plan.revision).toBe(3);
});

it('survives garbage without throwing', () => {
  expect(normalizePlan('nope', catalogue, 1)).toMatchObject({ version: 1, parts: {}, sections: [], custom: [], brands: [], card: [], colour: { palette: 'linen', from: '' }, fonts: { id: 'grotesk', why: '' } });
});

it('caps lists so a runaway answer stays a plan', () => {
  const many = Array.from({ length: 20 }, (_, i) => ({ id: 'faq', why: `motivo número ${i}` }));
  const plan = normalizePlan({ sections: many, card: Array.from({ length: 20 }, (_, i) => `línea ${i}`) }, catalogue, 1);
  expect(plan.sections).toHaveLength(1);
  expect(plan.card.length).toBeLessThanOrEqual(7);
});

it('offers the model only real ids', () => {
  const schema = JSON.stringify(planJsonSchema(catalogue));
  expect(schema).toContain('"split-left"');
  expect(schema).toContain('"sizes"');
  expect(schema).not.toContain('mosaic-xl');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx jest --maxWorkers=2 src/storefront-source/plan/store-plan.spec.ts`
Expected: FAIL — "Cannot find module './store-plan'"

- [ ] **Step 3: Write the implementation**

```ts
/** YAPI plan card (spec 2026-10-22): what a store will be, line by line with its reason, before anything is built. */
export type PlanChoice = { id: string; why: string };
export type PlanCustomSection = { kind: 'per-brand' | 'per-category' | 'facts' | 'origin' | 'guide'; why: string; items: { name: string; layout: string; colourFrom?: string }[] };
export type StorePlan = {
  version: 1; parts: Record<string, PlanChoice>; sections: PlanChoice[]; custom: PlanCustomSection[];
  colour: { palette: string; accent?: string; from: string }; fonts: PlanChoice; motif?: { what: string; from: string };
  brands: string[]; card: string[]; revision: number;
};
export type PlanCatalogue = { variants: Record<string, readonly string[]>; sections: readonly string[]; palettes: readonly string[]; fonts: readonly string[] };

const CUSTOM_KINDS = ['per-brand', 'per-category', 'facts', 'origin', 'guide'] as const;
const LAYOUTS = ['stats', 'numbered', 'polaroid', 'split', 'marquee', 'chips', 'quote', 'float'] as const;
const text = (value: unknown, max: number) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const record = (value: unknown) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {}) as Record<string, unknown>;
const list = (value: unknown) => Array.isArray(value) ? value : [];
const HEX = /^#[0-9a-f]{6}$/i;

const choice = (ids: readonly string[]) => ({ type: 'object', additionalProperties: false, required: ['id', 'why'],
  properties: { id: { type: 'string', enum: [...ids] }, why: { type: 'string' } } });

/** Strict schema: every enum is the live Esencial catalogue, so the model cannot name a part that does not exist. */
export function planJsonSchema(c: PlanCatalogue): object {
  const parts = Object.fromEntries(Object.entries(c.variants).map(([part, ids]) => [part, { anyOf: [choice(ids), { type: 'null' }] }]));
  return { type: 'object', additionalProperties: false,
    required: ['parts', 'sections', 'custom', 'colour', 'fonts', 'motif', 'brands', 'card'],
    properties: {
      parts: { type: 'object', additionalProperties: false, required: Object.keys(c.variants), properties: parts },
      sections: { type: 'array', maxItems: 4, items: choice(c.sections) },
      custom: { type: 'array', maxItems: 2, items: { type: 'object', additionalProperties: false, required: ['kind', 'why', 'items'], properties: {
        kind: { type: 'string', enum: [...CUSTOM_KINDS] }, why: { type: 'string' },
        items: { type: 'array', maxItems: 10, items: { type: 'object', additionalProperties: false, required: ['name', 'layout', 'colourFrom'], properties: {
          name: { type: 'string' }, layout: { type: 'string', enum: [...LAYOUTS] }, colourFrom: { type: ['string', 'null'] } } } } } } },
      colour: { type: 'object', additionalProperties: false, required: ['palette', 'accent', 'from'], properties: {
        palette: { type: 'string', enum: [...c.palettes] }, accent: { type: ['string', 'null'] }, from: { type: 'string' } } },
      fonts: choice(c.fonts),
      motif: { anyOf: [{ type: 'object', additionalProperties: false, required: ['what', 'from'], properties: { what: { type: 'string' }, from: { type: 'string' } } }, { type: 'null' }] },
      brands: { type: 'array', maxItems: 12, items: { type: 'string' } },
      card: { type: 'array', maxItems: 7, items: { type: 'string' } },
    } };
}

/** The model's answer as a plan: unknown ids dropped, duplicates collapsed, lists capped. Never throws. */
export function normalizePlan(raw: unknown, c: PlanCatalogue, revision: number): StorePlan {
  const input = record(raw);
  const parts: Record<string, PlanChoice> = {};
  for (const [part, value] of Object.entries(record(input.parts))) {
    const id = text(record(value).id, 40);
    if (c.variants[part]?.includes(id)) parts[part] = { id, why: text(record(value).why, 200) };
  }
  const seen = new Set<string>();
  const sections = list(input.sections).map(record).map(s => ({ id: text(s.id, 40), why: text(s.why, 200) }))
    .filter(s => c.sections.includes(s.id) && !seen.has(s.id) && Boolean(seen.add(s.id))).slice(0, 4);
  const custom = list(input.custom).map(record).flatMap(s => {
    const kind = text(s.kind, 20) as PlanCustomSection['kind'];
    if (!CUSTOM_KINDS.includes(kind)) return [];
    const items = list(s.items).map(record).map(item => {
      const layout = text(item.layout, 20);
      const colourFrom = text(item.colourFrom, 60);
      return { name: text(item.name, 60), layout: (LAYOUTS as readonly string[]).includes(layout) ? layout : 'split', ...(colourFrom ? { colourFrom } : {}) };
    }).filter(item => item.name).slice(0, 10);
    return items.length ? [{ kind, why: text(s.why, 200), items }] : [];
  }).slice(0, 2);
  const colour = record(input.colour);
  const accent = text(colour.accent, 7).toLowerCase();
  const palette = c.palettes.includes(text(colour.palette, 40)) ? text(colour.palette, 40) : c.palettes[0];
  const fontsIn = record(input.fonts);
  const fonts = { id: c.fonts.includes(text(fontsIn.id, 40)) ? text(fontsIn.id, 40) : c.fonts[0], why: text(fontsIn.why, 200) };
  const motifIn = record(input.motif);
  const motif = text(motifIn.what, 60) ? { what: text(motifIn.what, 60), from: text(motifIn.from, 60) } : undefined;
  const brands = [...new Set(list(input.brands).map(b => text(b, 60)).filter(Boolean))].slice(0, 12);
  const card = list(input.card).map(line => text(line, 140)).filter(Boolean).slice(0, 7);
  return { version: 1, parts, sections, custom, colour: { palette, ...(HEX.test(accent) ? { accent } : {}), from: text(colour.from, 60) }, fonts, ...(motif ? { motif } : {}), brands, card, revision };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && npx jest --maxWorkers=2 src/storefront-source/plan/store-plan.spec.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/storefront-source/plan/store-plan.ts apps/api/src/storefront-source/plan/store-plan.spec.ts
git commit -m "feat(api): the store plan shape — real Esencial ids, reasons, capped lists"
```

---

### Task 2: Deterministic checks

**Files:**
- Create: `apps/api/src/storefront-source/plan/store-plan-checks.ts`
- Test: `apps/api/src/storefront-source/plan/store-plan-checks.spec.ts`

**Interfaces:**
- Consumes: `StorePlan` (Task 1).
- Produces:
  - `type CatalogFacts = { productNames: string[]; productCount: number; photoCount: number; categorySizes: number[]; colourProducts: number; colourPhotoProducts: number; sizeProducts: number }`
  - `type CheckedPlan = { plan: StorePlan; dna: Record<string, string>; variants: Record<string, string>; sections: string[] }`
  - `function checkPlan(plan: StorePlan, facts: CatalogFacts, rolled: Record<string, string>): CheckedPlan` — `rolled` is the dice's variant per part (fallback for a part without a reason).
  - `function validSource(from: string | undefined, photoCount: number): boolean`

- [ ] **Step 1: Write the failing test**

```ts
import { checkPlan, validSource, type CatalogFacts } from './store-plan-checks';
import type { StorePlan } from './store-plan';

const base: StorePlan = { version: 1, parts: {}, sections: [], custom: [], colour: { palette: 'linen', from: '' }, fonts: { id: 'grotesk', why: '' }, brands: [], card: [], revision: 1 };
const facts: CatalogFacts = { productNames: ['Best Behavior Cereal', 'Bloom Clear', 'Bloom Pre', 'MAGNUS Recovery'], productCount: 4, photoCount: 6, categorySizes: [3, 1], colourProducts: 0, colourPhotoProducts: 0, sizeProducts: 0 };
const rolled = { hero: 'full', grid: 'grid3', closing: 'accent', card: 'plain', filters: 'bar', menu: 'none' };

it('a part without a real reason falls back to the dice', () => {
  const out = checkPlan({ ...base, parts: { hero: { id: 'type', why: 'se ve moderno' }, card: { id: 'framed', why: 'las fotos tienen fondos distintos y un marco las une' } } }, facts, rolled);
  expect(out.variants.hero).toBe('full');
  expect(out.variants.card).toBe('framed');
});

it('an accent needs a source; a custom colour without one stays on the ground', () => {
  expect(validSource('logo', 0)).toBe(true);
  expect(validSource('foto 5', 6)).toBe(true);
  expect(validSource('foto 9', 6)).toBe(false);
  expect(validSource('me gusta el naranja', 6)).toBe(false);
  const out = checkPlan({ ...base, colour: { palette: 'citrus', accent: '#ff00aa', from: 'energía' }, brands: ['Bloom', 'MAGNUS', 'Best Behavior'],
    custom: [{ kind: 'per-brand', why: '3 marcas', items: [{ name: 'Bloom', layout: 'stats', colourFrom: 'inventado' }, { name: 'MAGNUS', layout: 'numbered', colourFrom: 'foto 1' }] }] }, facts, rolled);
  expect(out.plan.colour.accent).toBeUndefined();
  expect(out.plan.custom[0].items[0].colourFrom).toBeUndefined();
  expect(out.plan.custom[0].items[1].colourFrom).toBe('foto 1');
});

it('taste rules: no giant feature grid over 4 products, no dark text band', () => {
  const big = { ...facts, productCount: 9 };
  const out = checkPlan({ ...base, parts: { grid: { id: 'feature', why: 'los productos estrella van grandes' }, closing: { id: 'dark', why: 'cierre fuerte con contraste alto' } } }, big, rolled);
  expect(out.variants.grid).toBe('grid4');
  expect(out.variants.closing).toBe('photo');
  expect(checkPlan({ ...base, parts: { closing: { id: 'dark', why: 'cierre fuerte con contraste alto' } } }, { ...facts, photoCount: 0 }, rolled).variants.closing).toBe('newsletter');
});

it('the catalog switches features on and says why', () => {
  const rich: CatalogFacts = { ...facts, productCount: 14, categorySizes: [5, 4, 5], colourProducts: 6, colourPhotoProducts: 4, sizeProducts: 3 };
  const out = checkPlan({ ...base, brands: ['Bloom', 'MAGNUS', 'Best Behavior', 'Inventada'] }, rich, rolled);
  expect(out.dna.card).toBe('swatch-swap');
  expect(out.variants.filters).toBe('sidebar');
  expect(out.variants.menu).toBe('dropdowns');
  expect(out.sections).toContain('sizes');
  expect(out.plan.brands).toEqual(['Bloom', 'MAGNUS', 'Best Behavior']);
  expect(out.plan.custom.some(s => s.kind === 'per-brand')).toBe(true);
  expect(out.plan.card.join(' ')).toMatch(/6 productos vienen en colores/);
});

it('a one-product store with no photos still checks clean', () => {
  const tiny: CatalogFacts = { productNames: ['Vela'], productCount: 1, photoCount: 0, categorySizes: [], colourProducts: 0, colourPhotoProducts: 0, sizeProducts: 0 };
  const out = checkPlan(base, tiny, rolled);
  expect(out.dna.card).toBeUndefined();
  expect(out.variants.menu).toBe('none');
  expect(out.variants.filters).toBe('bar');
  expect(out.plan.custom).toEqual([]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx jest --maxWorkers=2 src/storefront-source/plan/store-plan-checks.spec.ts`
Expected: FAIL — "Cannot find module './store-plan-checks'"

- [ ] **Step 3: Write the implementation**

```ts
import type { StorePlan } from './store-plan';

/** What the store's own data says; read once per plan (store-plan-data.ts). */
export type CatalogFacts = { productNames: string[]; productCount: number; photoCount: number; categorySizes: number[];
  colourProducts: number; colourPhotoProducts: number; sizeProducts: number };
export type CheckedPlan = { plan: StorePlan; dna: Record<string, string>; variants: Record<string, string>; sections: string[] };

/** Owner 2026-10-22: «no random circles». A reason that names nothing of this store is no reason. */
const GENERIC = /^(se ve (bien|moderno|bonito|elegante)|moderno|bonito|elegante|atractivo|para destacar|queda bien|más visual)\.?$/i;
const reasoned = (why: string | undefined) => Boolean(why && why.trim().length >= 12 && !GENERIC.test(why.trim()));

/** «logo», «marca» (a merchant-confirmed colour) or «foto N» for a photo the plan was shown. */
export function validSource(from: string | undefined, photoCount: number): boolean {
  const value = (from ?? '').trim().toLowerCase();
  if (value === 'logo' || value === 'marca') return true;
  const photo = /^foto (\d+)$/.exec(value);
  return Boolean(photo && Number(photo[1]) < photoCount);
}

export function checkPlan(input: StorePlan, facts: CatalogFacts, rolled: Record<string, string>): CheckedPlan {
  const plan: StorePlan = structuredClone(input);
  const variants: Record<string, string> = { ...rolled };
  for (const [part, chosen] of Object.entries(plan.parts)) if (reasoned(chosen.why)) variants[part] = chosen.id; else delete plan.parts[part];
  plan.sections = plan.sections.filter(section => reasoned(section.why));
  if (plan.motif && !validSource(plan.motif.from, facts.photoCount)) delete plan.motif;

  // Colour comes from the brand or product on screen, never invented.
  if (plan.colour.accent && !validSource(plan.colour.from, facts.photoCount)) delete plan.colour.accent;
  plan.custom = plan.custom.map(section => ({ ...section, items: section.items.map(({ colourFrom, ...item }) => validSource(colourFrom, facts.photoCount) ? { ...item, colourFrom } : item) }));

  // Taste rules (owner 2026-10-22): normal cards, no dark text-only band.
  if (variants.grid === 'feature' && facts.productCount > 4) variants.grid = 'grid4';
  if (variants.closing === 'dark') variants.closing = facts.photoCount > 0 ? 'photo' : 'newsletter';

  // The catalog switches features on by itself, each with the line that says why.
  const lines: string[] = [];
  const dna: Record<string, string> = {};
  if (facts.colourProducts >= 2 && facts.colourPhotoProducts >= 2) {
    dna.card = 'swatch-swap';
    lines.push(`Muestras y filtro de color: ${facts.colourProducts} productos vienen en colores`);
  }
  if (facts.productCount >= 12) { variants.filters = 'sidebar'; lines.push(`Filtros a un lado: ${facts.productCount} productos para explorar`); }
  const browsable = facts.categorySizes.filter(size => size >= 3).length;
  variants.menu = browsable >= 2 ? 'dropdowns' : variants.menu === 'panel' && facts.categorySizes.length >= 2 ? 'panel' : 'none';
  if (variants.menu === 'dropdowns') lines.push(`Menú con ${facts.categorySizes.length} categorías desplegables`);
  const sections = plan.sections.map(section => section.id);
  if (facts.sizeProducts >= 1 && !sections.includes('sizes')) { sections.push('sizes'); lines.push('Guía de tallas: hay productos con tallas'); }

  // A brand counts only when a product carries its name; per-brand sections need three of them.
  plan.brands = plan.brands.filter(brand => facts.productNames.some(name => name.toLowerCase().includes(brand.toLowerCase())));
  if (plan.brands.length < 3) plan.custom = plan.custom.filter(section => section.kind !== 'per-brand');
  else if (!plan.custom.some(section => section.kind === 'per-brand')) {
    plan.custom.push({ kind: 'per-brand', why: `${plan.brands.length} marcas en el catálogo`, items: plan.brands.map(name => ({ name, layout: 'split' })) });
    lines.push(`Una sección por marca: ${plan.brands.length} marcas, cada una distinta`);
  }

  const known = (line: string) => plan.card.some(existing => existing.toLowerCase().startsWith(line.split(':')[0].toLowerCase()));
  plan.card = [...plan.card, ...lines.filter(line => !known(line))].slice(0, 7);
  return { plan, dna, variants, sections: sections.slice(0, 4) };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && npx jest --maxWorkers=2 src/storefront-source/plan/store-plan-checks.spec.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/storefront-source/plan/store-plan-checks.ts apps/api/src/storefront-source/plan/store-plan-checks.spec.ts
git commit -m "feat(api): plan checks — reasons, colour sources, taste rules, catalog features"
```

---

### Task 3: Fingerprints and uniqueness

**Files:**
- Create: `apps/api/src/storefront-source/plan/store-plan-fingerprint.ts`
- Test: `apps/api/src/storefront-source/plan/store-plan-fingerprint.spec.ts`

**Interfaces:**
- Produces:
  - `type Fingerprint = { variants: Record<string, string>; sections: string[]; palette: string; fonts: string; accentHue: number | null }`
  - `function fingerprintOf(input: { variants: Record<string, string>; sections: string[]; palette: string; fonts: string; accent?: string }): Fingerprint`
  - `function planDistance(a: Fingerprint, b: Fingerprint): number` (0 = same, 1 = nothing shared)
  - `function clashesWith(a: Fingerprint, others: Fingerprint[]): { other: Fingerprint; fields: string[] } | null`
  - `function clashWords(fields: string[]): string`
  - `function makeUnique(fp: Fingerprint, others: Fingerprint[], catalogue: Record<string, readonly string[]>, sectionCatalogue: readonly string[], seed: string): { fingerprint: Fingerprint; exhausted: boolean }`

- [ ] **Step 1: Write the failing test**

```ts
import { clashesWith, clashWords, fingerprintOf, makeUnique, planDistance } from './store-plan-fingerprint';

const catalogue = { hero: ['full', 'type', 'split-left', 'poster'], header: ['classic', 'minimal', 'split'], grid: ['grid3', 'grid4', 'list'], story: ['split', 'quote'] };
const sections = ['process', 'faq', 'sizes', 'journal'];
const a = fingerprintOf({ variants: { hero: 'full', header: 'classic', grid: 'grid3', story: 'split', feature: 'duo' }, sections: ['faq'], palette: 'linen', fonts: 'grotesk', accent: '#f26b1d' });

it('identical stores are distance 0; sections weigh more than one part', () => {
  expect(planDistance(a, a)).toBe(0);
  expect(planDistance(a, { ...a, sections: ['journal'] })).toBeGreaterThan(planDistance(a, { ...a, variants: { ...a.variants, hero: 'type' } }));
});

it('the same section sequence always clashes, whatever else differs', () => {
  const far = fingerprintOf({ variants: { hero: 'poster', header: 'split', grid: 'list', story: 'quote', feature: 'duo' }, sections: ['faq'], palette: 'citrus', fonts: 'serif' });
  expect(clashesWith(far, [a])?.fields).toContain('sections');
});

it('names the matching fields in plain Spanish, never the other store', () => {
  expect(clashWords(['sections', 'hero', 'fonts'])).toBe('mismo orden de secciones, misma portada y misma tipografía que otra tienda');
});

it('two stores of the same kind made back to back end up apart', () => {
  const { fingerprint, exhausted } = makeUnique({ ...a }, [a], catalogue, sections, 'store-2');
  expect(exhausted).toBe(false);
  expect(planDistance(fingerprint, a)).toBeGreaterThanOrEqual(0.35);
  expect(fingerprint.sections.join('|')).not.toBe(a.sections.join('|'));
});

it('accent hue is bucketed by 30°', () => {
  expect(fingerprintOf({ variants: {}, sections: [], palette: 'x', fonts: 'y', accent: '#ff0000' }).accentHue).toBe(0);
  expect(fingerprintOf({ variants: {}, sections: [], palette: 'x', fonts: 'y', accent: '#00ff00' }).accentHue).toBe(4);
  expect(fingerprintOf({ variants: {}, sections: [], palette: 'x', fonts: 'y' }).accentHue).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx jest --maxWorkers=2 src/storefront-source/plan/store-plan-fingerprint.spec.ts`
Expected: FAIL — "Cannot find module './store-plan-fingerprint'"

- [ ] **Step 3: Write the implementation**

```ts
import { createHash } from 'node:crypto';

/** Spec 2026-10-22 §Uniqueness: what makes two stores look alike. Read from a plan or from a saved store-data. */
export type Fingerprint = { variants: Record<string, string>; sections: string[]; palette: string; fonts: string; accentHue: number | null };
const MIN_DISTANCE = 0.35;
const SECTION_WEIGHT = 3;
// Parts the eye does not use to tell two stores apart.
const IGNORED = new Set(['density', 'corners', 'button', 'pdpOrder', 'texture']);

function hue(hex: string): number | null {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return null;
  const [r, g, b] = m.slice(1).map(v => parseInt(v, 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (d === 0) return null;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return Math.floor(((h * 60 + 360) % 360) / 30);
}

export function fingerprintOf(input: { variants: Record<string, string>; sections: string[]; palette: string; fonts: string; accent?: string }): Fingerprint {
  const variants = Object.fromEntries(Object.entries(input.variants).filter(([part]) => part !== 'sections' && !IGNORED.has(part)));
  return { variants, sections: [...input.sections], palette: input.palette, fonts: input.fonts, accentHue: input.accent ? hue(input.accent) : null };
}

const sequence = (fp: Fingerprint) => `${fp.sections.join('|')}#${fp.variants.feature ?? ''}`;

function differences(a: Fingerprint, b: Fingerprint): { field: string; weight: number; same: boolean }[] {
  const parts = [...new Set([...Object.keys(a.variants), ...Object.keys(b.variants)])].filter(part => part !== 'feature');
  return [
    ...parts.map(part => ({ field: part, weight: 1, same: a.variants[part] === b.variants[part] })),
    { field: 'sections', weight: SECTION_WEIGHT, same: sequence(a) === sequence(b) },
    { field: 'palette', weight: 1, same: a.palette === b.palette },
    { field: 'fonts', weight: 1, same: a.fonts === b.fonts },
    { field: 'accent', weight: 1, same: a.accentHue !== null && a.accentHue === b.accentHue },
  ];
}

export function planDistance(a: Fingerprint, b: Fingerprint): number {
  const rows = differences(a, b);
  const total = rows.reduce((sum, row) => sum + row.weight, 0);
  return total ? rows.filter(row => !row.same).reduce((sum, row) => sum + row.weight, 0) / total : 1;
}

export function clashesWith(a: Fingerprint, others: Fingerprint[]): { other: Fingerprint; fields: string[] } | null {
  let worst: { other: Fingerprint; fields: string[]; distance: number } | null = null;
  for (const other of others) {
    const distance = planDistance(a, other);
    if ((distance < MIN_DISTANCE || sequence(a) === sequence(other)) && (!worst || distance < worst.distance))
      worst = { other, fields: differences(a, other).filter(row => row.same).map(row => row.field), distance };
  }
  return worst ? { other: worst.other, fields: worst.fields } : null;
}

const WORDS: Record<string, string> = { sections: 'mismo orden de secciones', hero: 'misma portada', header: 'mismo encabezado', grid: 'misma grilla de productos',
  card: 'mismas tarjetas', story: 'misma sección de historia', closing: 'mismo cierre', footer: 'mismo pie', fonts: 'misma tipografía', palette: 'misma paleta',
  accent: 'mismo color de acento', menu: 'mismo menú', values: 'misma sección de valores', photos: 'mismo tratamiento de fotos' };
export function clashWords(fields: string[]): string {
  const named = fields.map(field => WORDS[field] ?? `misma pieza «${field}»`).slice(0, 4);
  return `${named.length > 1 ? `${named.slice(0, -1).join(', ')} y ${named.at(-1)}` : named[0]} que otra tienda`;
}

/** Deterministic swaps of the clashing parts for another variant, until no store is too close. */
export function makeUnique(fp: Fingerprint, others: Fingerprint[], catalogue: Record<string, readonly string[]>, sectionCatalogue: readonly string[], seed: string) {
  let current: Fingerprint = structuredClone(fp);
  for (let round = 0; round < 12; round++) {
    const clash = clashesWith(current, others);
    if (!clash) return { fingerprint: current, exhausted: false };
    const roll = (salt: string) => createHash('sha256').update(`${seed}:${round}:${salt}`).digest().readUInt32BE(0);
    if (clash.fields.includes('sections')) {
      const unused = sectionCatalogue.filter(id => !current.sections.includes(id));
      if (unused.length) {
        const next = unused[roll('pick') % unused.length];
        current = { ...current, sections: current.sections.length ? current.sections.map((id, i) => i === roll('section') % current.sections.length ? next : id) : [next] };
      }
    }
    for (const field of clash.fields.filter(field => catalogue[field])) {
      const options = catalogue[field].filter(id => id !== clash.other.variants[field] && id !== 'fashion');
      if (options.length) current = { ...current, variants: { ...current.variants, [field]: options[roll(field) % options.length] } };
    }
  }
  return { fingerprint: current, exhausted: Boolean(clashesWith(current, others)) };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && npx jest --maxWorkers=2 src/storefront-source/plan/store-plan-fingerprint.spec.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/storefront-source/plan/store-plan-fingerprint.ts apps/api/src/storefront-source/plan/store-plan-fingerprint.spec.ts
git commit -m "feat(api): store fingerprints — distance, clash words, deterministic swaps"
```

---

### Task 4: Reading the catalog and the other stores

**Files:**
- Create: `apps/api/src/storefront-source/plan/store-plan-data.ts`
- Test: `apps/api/src/storefront-source/plan/store-plan-data.spec.ts`

**Interfaces:**
- Consumes: `CatalogFacts` (Task 2), `Fingerprint`, `fingerprintOf` (Task 3), `readMasterState`, `TEMPLATE_STORE_DATA_PATH` (`source-templates.ts`), `MASTER_TEMPLATE_ID` (`source-master.ts`).
- Produces:
  - `async function catalogFacts(prisma: PrismaService, storeId: string): Promise<CatalogFacts>`
  - `async function otherFingerprints(prisma: PrismaService, storeId: string): Promise<Fingerprint[]>` — every other store's current Esencial revision.

- [ ] **Step 1: Check the real field names**

Run: `grep -n "imageUrls\|images " apps/api/prisma/schema.prisma | sed -n 1,20p` and `grep -n "function dataLine" -A8 apps/api/src/storefront-source/source-templates.ts`. Use the PaymentLink photo field name and the exact `store-data` line format in the code and fixtures below (they are written for `imageUrls` and `STORE_DATA.<key> = <json>;` lines — change them if the grep shows otherwise).

- [ ] **Step 2: Write the failing test**

```ts
import { catalogFacts, otherFingerprints } from './store-plan-data';

it('counts colours, sizes, photos and categories from the live catalog', async () => {
  const prisma: any = { paymentLink: { findMany: jest.fn().mockResolvedValue([
    { name: 'Polo Andes', imageUrls: ['/a.jpg', '/b.jpg'], categoryId: 'c1', variants: [{ name: 'Rojo / M', options: [{ name: 'Color', value: 'Rojo' }, { name: 'Talla', value: 'M' }], imageUrls: ['/r.jpg'] }, { name: 'Azul / M', options: [{ name: 'Color', value: 'Azul' }], imageUrls: ['/z.jpg'] }] },
    { name: 'Gorra', imageUrls: ['/c.jpg'], categoryId: 'c1', variants: [{ name: 'Negro', options: [{ name: 'Colour', value: 'Negro' }] }] },
    { name: 'Taza', imageUrls: [], categoryId: null, variants: [] },
  ]) } };
  expect(await catalogFacts(prisma, 's1')).toEqual({ productNames: ['Polo Andes', 'Gorra', 'Taza'], productCount: 3, photoCount: 3, categorySizes: [2], colourProducts: 2, colourPhotoProducts: 1, sizeProducts: 1 });
});

it('reads every other Esencial store from its current store-data, skipping broken rows', async () => {
  const data = [`STORE_DATA.variants = ${JSON.stringify({ hero: 'type', grid: 'grid3', sections: ['faq'] })};`, `STORE_DATA.look = ${JSON.stringify({ palette: 'linen', fonts: 'serif', colors: { accent: '#ff0000' } })};`].join('\n');
  const prisma: any = { $queryRaw: jest.fn().mockResolvedValue([{ data }, { data: null }]) };
  expect(await otherFingerprints(prisma, 's1')).toEqual([{ variants: { hero: 'type', grid: 'grid3' }, sections: ['faq'], palette: 'linen', fonts: 'serif', accentHue: 0 }]);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/api && npx jest --maxWorkers=2 src/storefront-source/plan/store-plan-data.spec.ts`
Expected: FAIL — "Cannot find module './store-plan-data'"

- [ ] **Step 4: Write the implementation**

```ts
import { Prisma } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { readMasterState, TEMPLATE_STORE_DATA_PATH } from '../source-templates';
import { MASTER_TEMPLATE_ID } from '../source-master';
import type { CatalogFacts } from './store-plan-checks';
import { fingerprintOf, type Fingerprint } from './store-plan-fingerprint';

type Variant = { options?: Array<{ name?: unknown; value?: unknown }>; imageUrls?: unknown };
const COLOUR = /^(colou?r|tono)$/i;
const SIZE = /^(talla|tamaño|size|medida)$/i;
const has = (variants: Variant[], pattern: RegExp) => variants.some(v => (v.options ?? []).some(o => typeof o.name === 'string' && pattern.test(o.name.trim())));

export async function catalogFacts(prisma: PrismaService, storeId: string): Promise<CatalogFacts> {
  const products = await prisma.paymentLink.findMany({ where: { storeId, status: 'ACTIVE' }, select: { name: true, imageUrls: true, categoryId: true, variants: true }, orderBy: { createdAt: 'asc' }, take: 200 });
  const categories = new Map<string, number>();
  let photoCount = 0, colourProducts = 0, colourPhotoProducts = 0, sizeProducts = 0;
  for (const product of products) {
    const variants = (Array.isArray(product.variants) ? product.variants : []) as Variant[];
    photoCount += Array.isArray(product.imageUrls) ? product.imageUrls.length : 0;
    if (product.categoryId) categories.set(product.categoryId, (categories.get(product.categoryId) ?? 0) + 1);
    if (has(variants, COLOUR)) {
      colourProducts++;
      if (variants.filter(v => Array.isArray(v.imageUrls) && v.imageUrls.length).length >= 2) colourPhotoProducts++;
    }
    if (has(variants, SIZE)) sizeProducts++;
  }
  return { productNames: products.map(p => p.name), productCount: products.length, photoCount, categorySizes: [...categories.values()], colourProducts, colourPhotoProducts, sizeProducts };
}

/** Every other store's current Esencial look, read from store-data in SQL (a whole snapshot carries the kit and photos). */
export async function otherFingerprints(prisma: PrismaService, storeId: string): Promise<Fingerprint[]> {
  const rows = await prisma.$queryRaw<Array<{ data: string | null }>>(Prisma.sql`
    SELECT DISTINCT ON (v."storeId") (SELECT f->>'content' FROM jsonb_array_elements(v.snapshot->'files') f WHERE f->>'path' = ${TEMPLATE_STORE_DATA_PATH} LIMIT 1) AS data
    FROM "StoreSourceVersion" v
    WHERE v."storeId" <> ${storeId} AND v.snapshot->'brief'->>'templateId' = ${MASTER_TEMPLATE_ID}
    ORDER BY v."storeId", v.revision DESC`).catch(() => [] as Array<{ data: string | null }>);
  return rows.flatMap(row => {
    if (!row.data) return [];
    const state = readMasterState([{ path: TEMPLATE_STORE_DATA_PATH, content: row.data }]);
    if (!state.variants || !state.look) return [];
    const { sections = [], ...variants } = state.variants;
    return [fingerprintOf({ variants: variants as Record<string, string>, sections, palette: state.look.palette, fonts: state.look.fonts, accent: state.look.colors?.accent })];
  });
}
```

- [ ] **Step 5: Run test, then commit**

Run: `cd apps/api && npx jest --maxWorkers=2 src/storefront-source/plan/store-plan-data.spec.ts` — Expected: PASS (2 tests)

```bash
git add apps/api/src/storefront-source/plan/store-plan-data.ts apps/api/src/storefront-source/plan/store-plan-data.spec.ts
git commit -m "feat(api): plan data — catalog facts and every other store's fingerprint"
```

---

### Task 5: The plan call and the «vague» verdict

**Files:**
- Modify: `apps/api/src/storefront-source/source-conversation.service.ts` (decision type ~line 51; decide prompt ~line 92; schema ~line 95–110; `fillMaster` ~line 216; normalisation ~line 443)
- Test: `apps/api/src/storefront-source/source-conversation-plan.spec.ts`, one test added to `source-conversation.service.spec.ts`

**Interfaces:**
- Consumes: `planJsonSchema`, `normalizePlan`, `PlanCatalogue`, `StorePlan` (Task 1), `CatalogFacts` (Task 2).
- Produces:
  - `export type StorePlanInput = { storeId: string; storeName: string; what: string; request: string; products: string[]; facts: CatalogFacts; photos: string[]; catalogue: PlanCatalogue; revision: number; current?: { variants: Record<string, string>; sections: string[]; palette: string; fonts: string }; clash?: string; previous?: StorePlan }`
  - `SourceConversationService.planStore(merchantId: string, input: StorePlanInput): Promise<StorePlan | null>` — null after two failed attempts; rethrows `SourceProviderQuotaException`.
  - `SourceConversationDecision.vague?: boolean`
  - `export const PLAN_PROMPT: string`

- [ ] **Step 1: Write the failing test**

Copy the service construction and fetch-mocking setup from `source-conversation.service.spec.ts` (how it builds `SourceConversationService` and fakes `fetch` responses) into a new `source-conversation-plan.spec.ts`, then add:

```ts
import { PLAN_PROMPT } from './source-conversation.service';

const catalogue = { variants: { hero: ['full', 'type'], grid: ['grid3', 'grid4'] }, sections: ['faq', 'sizes'], palettes: ['linen'], fonts: ['grotesk'] };
const facts = { productNames: ['Vela'], productCount: 1, photoCount: 0, categorySizes: [], colourProducts: 0, colourPhotoProducts: 0, sizeProducts: 0 };
const request = { storeId: 's1', storeName: 'Luz', what: 'velas', request: 'hazme una tienda', products: ['Vela'], facts, photos: [], catalogue, revision: 0 };

it('the prompt carries the owner rules', () => {
  expect(PLAN_PROMPT).toMatch(/nunca inventes un color/i);
  expect(PLAN_PROMPT).toMatch(/Foto N/);
  expect(PLAN_PROMPT).toMatch(/3 o 4 por fila/);
});

it('returns a normalised plan and sends the clash words when re-planning', async () => {
  const answer = { parts: { hero: { id: 'type', why: 'nombre corto de la marca' }, grid: null }, sections: [], custom: [], colour: { palette: 'linen', accent: null, from: '' },
    fonts: { id: 'grotesk', why: 'tono claro' }, motif: null, brands: [], card: ['Portada con el nombre en grande'] };
  respondWith(answer); // the copied setup's helper that makes fetch return this JSON as the model's output_text
  const plan = await service.planStore('m1', { ...request, clash: 'misma portada que otra tienda' });
  expect(plan?.parts.hero).toEqual({ id: 'type', why: 'nombre corto de la marca' });
  expect(JSON.parse(fetchMock.mock.calls[0][1].body).input[0].content[0].text).toContain('misma portada que otra tienda');
});

it('null after two failures', async () => {
  failWith(500); // the copied setup's helper for a non-ok response
  jest.useFakeTimers({ advanceTimers: true });
  expect(await service.planStore('m1', request)).toBeNull();
  expect(fetchMock).toHaveBeenCalledTimes(2);
  jest.useRealTimers();
});
```

In `source-conversation.service.spec.ts`, beside the existing `editKind` normalisation test, add a test (same fixture style) that a decide answer with `vague: "yes"` normalises to `false` and `vague: true` stays `true`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/api && npx jest --maxWorkers=2 src/storefront-source/source-conversation`
Expected: FAIL — `PLAN_PROMPT` not exported / `planStore` not a function / `vague` undefined

- [ ] **Step 3: Implement**

Add near the other prompts:

```ts
/** YAPI plan card (spec 2026-10-22): the store as a plan, each choice with its reason from this store's data. */
export const PLAN_PROMPT = `Eres YAPI y planificas una tienda online antes de construirla. Recibes el negocio, sus productos, sus fotos (etiquetadas «Foto N») y el catálogo de piezas de la plantilla.
Elige una variante para cada pieza, hasta 4 secciones del catálogo, hasta 2 secciones propias (custom), paleta, tipografía y, si existe, un motivo de marca.
Reglas del dueño:
- Cada elección lleva un «why» que nombra algo concreto de ESTA tienda (un producto, una foto, el logo, la cantidad de productos). Nunca «se ve moderno».
- Nunca inventes un color: «accent» y «colourFrom» solo con «logo», «marca» o «foto N» de donde sale ese color; si no, accent va en null.
- Fondo claro y tinta oscura; un solo acento para la tienda. Las tarjetas de producto son normales: 3 o 4 por fila. Nada de bandas oscuras solo de texto.
- Ningún adorno sin función: un motivo sale del logo o de los productos y dice algo (una espiral del logo, un sello con un dato del producto).
- Secciones propias solo cuando el catálogo las pide: «per-brand» con 3 o más marcas que aparecen en los nombres de los productos (lístalas en brands), cada una con un layout que encaja con lo que dice (stats para números, numbered para pasos, polaroid para un sello, marquee para una palabra).
- Que no sea aburrida: movimiento, letra con carácter y secciones que solo esta tienda tendría.
- «card»: 5 a 7 líneas cortas en español simple para el comercio, por ejemplo «Colores: crema, negro y el naranja de tu logo».
Si recibes «clash», cambia justo eso. Si recibes «current», planifica cambios sobre esa tienda. Si recibes «previous», es tu plan anterior y el pedido nuevo dice qué cambiar.`;
```

Add after `fillMaster` (same transport and metering as `fillMaster`):

```ts
  /** YAPI plan card (spec 2026-10-22): one structured call; null when it fails twice. */
  async planStore(merchantId: string, input: StorePlanInput): Promise<StorePlan | null> {
    const model = sourceConversationModel(undefined, this.config.get<string>('app.openAi.conversationModel'));
    const provider = sourceProvider(this.config, model);
    const photos = input.photos.slice(0, 8);
    const owned = photos.length ? new Set((await this.prisma.mediaAsset.findMany({ where: { merchantId, url: { in: photos } }, select: { url: true } })).map(asset => asset.url)) : new Set<string>();
    const images: Array<{ type: 'input_text'; text: string } | { type: 'input_image'; image_url: string; detail: 'low' }> = [];
    for (const [index, url] of photos.entries()) {
      const filename = url.split('/').at(-1)!;
      if (!this.uploads.contentTypeFor(filename).startsWith('image/')) continue;
      const bytes = owned.has(url) ? await this.uploads.getBuffer(filename).catch(() => null) : null;
      if (bytes && bytes.length <= 4_000_000) images.push({ type: 'input_text', text: `Foto ${index}` }, { type: 'input_image', image_url: `data:${this.uploads.contentTypeFor(filename)};base64,${bytes.toString('base64')}`, detail: 'low' });
    }
    const facts = { storeName: input.storeName, what: input.what.slice(0, 1500), request: input.request.slice(0, 2000), products: input.products.slice(0, 30), catalog: input.facts,
      catalogue: input.catalogue, ...(input.current ? { current: input.current } : {}), ...(input.clash ? { clash: input.clash } : {}), ...(input.previous ? { previous: input.previous } : {}) };
    for (let attempt = 0; attempt < 2; attempt++) {
      const started = Date.now(); let body: any = null; let status = 'FAILED';
      try {
        const response = await fetch(provider.endpoint, {
          method: 'POST', headers: { Authorization: `Bearer ${provider.apiKey}`, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(90_000),
          body: JSON.stringify({ model, store: false, instructions: PLAN_PROMPT,
            input: [{ role: 'user', content: [{ type: 'input_text', text: JSON.stringify(facts) }, ...images] }],
            text: { format: { type: 'json_schema', name: 'store_plan', strict: true, schema: planJsonSchema(input.catalogue) } },
            reasoning: { effort: 'low' }, max_output_tokens: 4000 }),
        });
        body = await response.json().catch(() => null);
        checkSourceProviderQuota(response.status, body, provider.name);
        if (response.ok) { status = 'COMPLETED'; return normalizePlan(sourceResponseJson(body), input.catalogue, input.revision); }
      } catch (error) {
        if (error instanceof SourceProviderQuotaException) throw error;
        this.logger.warn(JSON.stringify({ stage: 'store-plan', attempt, reason: ((error as Error)?.message || '').slice(0, 200) }));
      } finally { await this.metering?.record(input.storeId, 'source-store-plan', model, body, Date.now() - started, status); }
      if (attempt === 0) await new Promise(resolve => setTimeout(resolve, 3000));
    }
    return null;
  }
```

Imports: `import { normalizePlan, planJsonSchema, type PlanCatalogue, type StorePlan } from './plan/store-plan';` and `import type { CatalogFacts } from './plan/store-plan-checks';`. Export `StorePlanInput` as in Interfaces.

The «vague» verdict: in `SourceConversationDecision` add `vague?: boolean;`. In the decide prompt, after the `editKind:` paragraph, add the line
`vague: true when the merchant asks for a change of look without saying what («ponlo más bonito», «hazla más moderna», «cambia el estilo», «no me gusta», «mejóralo»); false when they name what to change («cambia el precio», «quita las reseñas», «el botón verde»).`
In the decide JSON schema add `'vague'` to `required` and `vague: { type: 'boolean' }` to `properties`. At the normalisation (~line 443) add `decision.vague = decision.vague === true;`.

- [ ] **Step 4: Run tests**

Run: `cd apps/api && npx jest --maxWorkers=2 src/storefront-source/source-conversation`
Expected: PASS (new + existing conversation specs)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/storefront-source/source-conversation.service.ts apps/api/src/storefront-source/source-conversation-plan.spec.ts apps/api/src/storefront-source/source-conversation.service.spec.ts
git commit -m "feat(api): planStore call and the vague verdict on the conversation step"
```

---

### Task 6: Building from a checked plan

**Files:**
- Modify: `apps/api/src/storefront-source/source-templates.service.ts` (`assemble` ~line 44–75, `applyMaster` ~line 80–124)
- Modify: `apps/api/src/storefront-source/source-templates.ts` (`assembleTemplateRevision` input and the `dna:` line ~421)
- Test: `apps/api/src/storefront-source/source-templates-plan.spec.ts`

**Interfaces:**
- Consumes: nothing new (the plan arrives already checked).
- Produces:
  - `export type AppliedPlan = { variants: Record<string, string>; sections: string[]; palette: string; fonts: string; accent?: string; dna: Record<string, string> }`
  - `applyMaster(merchantId, storeId, revision, filler, presetId?, plan?: AppliedPlan)` — with `plan`: no dice; variants/palette/fonts/dna come from the plan.
  - `assembleTemplateRevision({ …, dna?: Record<string, string> })` — merged last into the config `dna`, invalid values dropped.

- [ ] **Step 1: Write the failing test**

Find the spec that exercises `applyMaster` (`grep -l "applyMaster" apps/api/src/storefront-source/*.spec.ts`), copy its `SourceTemplatesService` setup (registry, projects.save mock, publicStores mock) into `source-templates-plan.spec.ts`, and add:

```ts
import * as dice from './source-master-dice';
import { readMasterState, TEMPLATE_STORE_DATA_PATH } from './source-templates';

it('a checked plan replaces the dice and pins its dna', async () => {
  const rollSpy = jest.spyOn(dice, 'rollVariants');
  const plan = { variants: { hero: 'type', grid: 'grid3', menu: 'dropdowns', filters: 'sidebar' }, sections: ['faq', 'sizes'], palette: 'linen', fonts: 'grotesk', accent: '#f26b1d', dna: { card: 'swatch-swap', bogus: 'x' } };
  await service.applyMaster('m1', 's1', 0, async () => ({ copy: { headline: 'Luz' } }), undefined, plan);
  expect(rollSpy).not.toHaveBeenCalled();
  const files = save.mock.calls[0][2].files;
  const state = readMasterState(files);
  expect(state.variants).toMatchObject({ hero: 'type', grid: 'grid3', menu: 'dropdowns', filters: 'sidebar', sections: ['faq', 'sizes'] });
  expect(state.look).toMatchObject({ palette: 'linen', fonts: 'grotesk' });
  expect(state.look?.colors?.accent).toBe('#f26b1d');
  const config = files.find((f: any) => f.path === 'config.js').content;
  expect(config).toContain('"card":"swatch-swap"');
  expect(config).not.toContain('bogus');
});

it('without a plan the dice still rolls', async () => {
  const rollSpy = jest.spyOn(dice, 'rollVariants');
  await service.applyMaster('m1', 's1', 0, async () => ({ copy: { headline: 'Luz' } }));
  expect(rollSpy).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx jest --maxWorkers=2 src/storefront-source/source-templates-plan.spec.ts`
Expected: FAIL — the dice ran and the plan's hero is not saved.

- [ ] **Step 3: Implement**

In `applyMaster` add the parameter `plan?: AppliedPlan` and turn the dice block into:

```ts
    if (plan) {
      variants = { ...plan.variants, sections: plan.sections } as MasterVariants;
      fill = { ...(fill ?? {}), look: { ...(fill?.look ?? {}), palette: plan.palette, fonts: plan.fonts, ...(plan.accent ? { colors: { ...(fill?.look?.colors ?? {}), accent: plan.accent } } : {}) } };
    } else if (!presetManifest && this.config.get<boolean>('app.yapiEsencialDice') !== false) {
      // existing dice block, unchanged
    }
```

Change the logo-palette line so a plan accent wins: `const logo = presetManifest || plan?.accent || Object.keys(brandColours).length || !publicStore.logoUrl ? undefined : …`. When `plan.accent` is set and `colours` comes from confirmed brand colours, keep the brand's paper/ink and the plan's accent: `if (colours && plan?.accent) colours.accent = plan.accent;`.

Pass the dna through: `this.assemble(merchantId, storeId, presetManifest?.id ?? MASTER_TEMPLATE_ID, revision, fill ?? undefined, bundled.files, variants, plan?.dna)`; `assemble` gains a last parameter `dna?: Record<string, string>` and passes `dna` into `assembleTemplateRevision`. In `source-templates.ts`, add `dna?: Record<string, string>` to the input type and at the `dna:` line append `...Object.fromEntries(Object.entries(input.dna ?? {}).filter(([name, value]) => SOURCE_DNA_RUNTIME_ENUMS[name]?.includes(value)))` as the last spread.

- [ ] **Step 4: Run tests**

Run: `cd apps/api && npx jest --maxWorkers=2 src/storefront-source/source-templates`
Expected: PASS (new + existing)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/storefront-source/source-templates.service.ts apps/api/src/storefront-source/source-templates.ts apps/api/src/storefront-source/source-templates-plan.spec.ts
git commit -m "feat(api): applyMaster builds from a checked plan instead of the dice"
```

---

### Task 7: The plan service and the chat routes

**Files:**
- Create: `apps/api/src/storefront-source/source-store-plan.service.ts`
- Test: `apps/api/src/storefront-source/source-store-plan.service.spec.ts`
- Modify: `apps/api/src/storefront-source/source-chat.service.ts` (constructor; `useMasterTemplate` ~line 304; `send` after the user message ~line 527 and after `decision` ~line 640), `storefront-source.module.ts`, `dto/send-source-message.dto.ts`, `apps/api/src/config/configuration.ts`
- Test additions: `apps/api/src/storefront-source/source-chat-master.spec.ts`

**Interfaces:**
- Consumes: Tasks 1–6; `unfinishedNote` (`source-unfinished-request.ts`); `rollVariants` (`source-master-dice.ts`).
- Produces:
  - `class StorePlanParts { constructor(catalogue: () => PlanCatalogue, roll: (storeId: string) => Record<string, string>) }`
  - `SourceStorePlanService.draft(merchantId, storeId, input: { revision: number; request: string; what: string; photos: string[]; current?: StorePlanInput['current']; previous?: StorePlan }): Promise<{ plan: StorePlan; applied: AppliedPlan; exhausted: boolean } | null>`
  - `SourceStorePlanService.followUpBrief(plan: StorePlan): string | null`
  - DTO `planId?: string` with `@IsOptional() @IsString() @Matches(/^[a-z0-9]{8,40}$/i)`
  - config `app.yapiPlanCard: boolean`
  - Plan message metadata `{ plan: StorePlan; appliedPlan: AppliedPlan; planKind: 'new' | 'edit' }`; the message id is the `planId`.

- [ ] **Step 1: Write the failing service test**

```ts
import { SourceStorePlanService, StorePlanParts } from './source-store-plan.service';

const catalogue = { variants: { hero: ['full', 'type', 'poster'], header: ['classic', 'minimal'], grid: ['grid3', 'grid4'] }, sections: ['faq', 'sizes', 'journal'], palettes: ['linen', 'citrus'], fonts: ['grotesk', 'serif'] };
const plan: any = { version: 1, parts: { hero: { id: 'type', why: 'el nombre corto de la marca se lee grande' } }, sections: [{ id: 'faq', why: 'las velas necesitan instrucciones de uso' }], custom: [],
  colour: { palette: 'linen', from: '' }, fonts: { id: 'serif', why: 'velas artesanales, tono cálido y tranquilo' }, brands: [], card: ['Portada con el nombre en grande'], revision: 0 };
const facts = { productNames: ['Vela'], productCount: 1, photoCount: 0, categorySizes: [], colourProducts: 0, colourPhotoProducts: 0, sizeProducts: 0 };

function setup(others: any[] = []) {
  const dialogue: any = { planStore: jest.fn().mockResolvedValue(plan) };
  const data: any = { catalogFacts: jest.fn().mockResolvedValue(facts), otherFingerprints: jest.fn().mockResolvedValue(others) };
  const prisma: any = { store: { findFirst: jest.fn().mockResolvedValue({ name: 'Luz' }) } };
  const parts = new StorePlanParts(() => catalogue, () => ({ hero: 'full', header: 'classic', grid: 'grid3' }));
  return { service: new SourceStorePlanService(prisma, dialogue, parts, data), dialogue };
}

it('drafts a checked plan that builds without the dice', async () => {
  const out = await setup().service.draft('m1', 's1', { revision: 0, request: 'hazme una tienda de velas', what: 'velas', photos: [] });
  expect(out?.applied).toMatchObject({ variants: { hero: 'type', header: 'classic', grid: 'grid3' }, sections: ['faq'], palette: 'linen', fonts: 'serif', dna: {} });
});

it('a clash re-plans once with the clash in words, then swaps until unique', async () => {
  const twin = { variants: { hero: 'type', header: 'classic', grid: 'grid3' }, sections: ['faq'], palette: 'linen', fonts: 'serif', accentHue: null };
  const { service, dialogue } = setup([twin]);
  const out = await service.draft('m1', 's1', { revision: 0, request: 'tienda', what: 'velas', photos: [] });
  expect(dialogue.planStore).toHaveBeenCalledTimes(2);
  expect(dialogue.planStore.mock.calls[1][1].clash).toMatch(/que otra tienda$/);
  expect(out?.exhausted).toBe(false);
  expect(out!.applied.sections).not.toEqual(['faq']);
});

it('null when the plan call fails', async () => {
  const { service, dialogue } = setup();
  dialogue.planStore.mockResolvedValue(null);
  expect(await service.draft('m1', 's1', { revision: 0, request: 'x', what: '', photos: [] })).toBeNull();
});

it('custom sections and a motif become the follow-up brief; none means no follow-up', () => {
  const { service } = setup();
  expect(service.followUpBrief(plan)).toBeNull();
  const brief = service.followUpBrief({ ...plan, custom: [{ kind: 'per-brand', why: '3 marcas', items: [{ name: 'Bloom', layout: 'stats', colourFrom: 'foto 2' }] }], motif: { what: 'espiral', from: 'logo' } })!;
  expect(brief).toMatch(/Bloom.*stats.*foto 2/s);
  expect(brief).toMatch(/espiral.*logo/s);
  expect(brief).toMatch(/nunca inventes un color/i);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/api && npx jest --maxWorkers=2 src/storefront-source/source-store-plan.service.spec.ts`
Expected: FAIL — module missing

- [ ] **Step 3: Implement the service**

```ts
import { Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SourceConversationService, type StorePlanInput } from './source-conversation.service';
import { checkPlan } from './plan/store-plan-checks';
import { clashesWith, clashWords, fingerprintOf, makeUnique } from './plan/store-plan-fingerprint';
import { catalogFacts, otherFingerprints } from './plan/store-plan-data';
import type { PlanCatalogue, StorePlan } from './plan/store-plan';
import type { AppliedPlan } from './source-templates.service';

/** Where the catalogue and the dice come from; a seam so tests do not load the template package. */
export class StorePlanParts {
  constructor(readonly catalogue: () => PlanCatalogue, readonly roll: (storeId: string) => Record<string, string>) {}
}
type PlanData = { catalogFacts: typeof catalogFacts; otherFingerprints: typeof otherFingerprints };

/** YAPI plan card (spec 2026-10-22): plan → checks → unique; what the card shows and what Construir builds. */
@Injectable()
export class SourceStorePlanService {
  constructor(private readonly prisma: PrismaService, private readonly dialogue: SourceConversationService, private readonly parts: StorePlanParts,
    @Optional() private readonly data: PlanData = { catalogFacts, otherFingerprints }) {}

  async draft(merchantId: string, storeId: string, input: { revision: number; request: string; what: string; photos: string[]; current?: StorePlanInput['current']; previous?: StorePlan }) {
    const catalogue = this.parts.catalogue();
    const [facts, others, store] = await Promise.all([this.data.catalogFacts(this.prisma, storeId), this.data.otherFingerprints(this.prisma, storeId),
      this.prisma.store.findFirst({ where: { id: storeId }, select: { name: true } }).catch(() => null)]);
    const ask = (clash?: string) => this.dialogue.planStore(merchantId, { storeId, storeName: store?.name ?? '', what: input.what, request: input.request, products: facts.productNames,
      facts, photos: input.photos, catalogue, revision: input.revision, ...(input.current ? { current: input.current } : {}), ...(input.previous ? { previous: input.previous } : {}), ...(clash ? { clash } : {}) });
    const rolled = this.parts.roll(storeId);
    const checkedOf = (plan: StorePlan) => {
      const checked = checkPlan(plan, facts, rolled);
      return { checked, fingerprint: fingerprintOf({ variants: checked.variants, sections: checked.sections, palette: plan.colour.palette, fonts: plan.fonts.id, accent: plan.colour.accent }) };
    };
    const first = await ask();
    if (!first) return null;
    let { checked, fingerprint } = checkedOf(first);
    const clash = clashesWith(fingerprint, others);
    if (clash) {
      const again = await ask(clashWords(clash.fields)).catch(() => null);
      if (again) ({ checked, fingerprint } = checkedOf(again));
    }
    const unique = makeUnique(fingerprint, others, catalogue.variants, catalogue.sections, storeId);
    const applied: AppliedPlan = { variants: { ...checked.variants, ...unique.fingerprint.variants }, sections: unique.fingerprint.sections, palette: checked.plan.colour.palette,
      fonts: checked.plan.fonts.id, ...(checked.plan.colour.accent ? { accent: checked.plan.colour.accent } : {}), dna: checked.dna };
    return { plan: checked.plan, applied, exhausted: unique.exhausted };
  }

  followUpBrief(plan: StorePlan): string | null {
    const custom = plan.custom.map(section => `- ${section.kind} (${section.why}): ${section.items.map(item => `${item.name} → layout ${item.layout}${item.colourFrom ? `, color de ${item.colourFrom}` : ''}`).join('; ')}`);
    const motif = plan.motif ? `- Motivo de marca: ${plan.motif.what}, sacado de ${plan.motif.from}; con función, nunca solo adorno.` : '';
    if (!custom.length && !motif) return null;
    return ['Construye sobre esta tienda las secciones propias del plan que el comercio aprobó:', ...custom, motif,
      'Cada bloque con su propio layout según lo que dice, y movimiento con las piezas data-pya-motion del kit. Nunca inventes un color: usa solo el color indicado (de esa foto o del logo) o el fondo de la tienda. Tarjetas de producto normales. Nada de bandas oscuras solo de texto.'].filter(Boolean).join('\n');
  }
}
```

Register in `storefront-source.module.ts`: add `SourceStorePlanService` to providers, and a `StorePlanParts` provider built from the Esencial manifest with the same registry `SourceTemplatesService` uses:

```ts
{ provide: StorePlanParts, inject: [/* the registry class SourceTemplatesService injects */], useFactory: (registry) => {
  const master = () => registry.templateManifest(MASTER_TEMPLATE_ID)!.master!;
  return new StorePlanParts(
    () => ({ variants: master().variants, sections: master().sections ?? [], palettes: master().palettes.map((p: { id: string }) => p.id), fonts: master().fonts.map((f: { id: string }) => f.id) }),
    storeId => { const { sections: _sections, ...variants } = rollVariants({ seed: storeId, settings: master(), character: { tone: 'calm', temperature: 'neutral', lead: 'photo', exclude: [] }, photoCount: 8, sections: [], recent: [] }).variants; return variants as Record<string, string>; },
  );
} },
```

- [ ] **Step 4: Run the service test**

Run: `cd apps/api && npx jest --maxWorkers=2 src/storefront-source/source-store-plan.service.spec.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Write the failing chat tests**

In `source-chat-master.spec.ts`, inside the master-store `describe` (reusing its `chat`, `messages`, `send`, `edit`, `decided`, `generate`, `applyMaster` and config mocks), give the chat service a `plans` mock `{ draft: jest.fn(), followUpBrief: jest.fn().mockReturnValue(null) }` and add:

```ts
const PLAN: any = { version: 1, parts: {}, sections: [], custom: [], colour: { palette: 'linen', from: '' }, fonts: { id: 'grotesk', why: '' }, brands: [], card: ['Portada con el nombre en grande'], revision: 0 };
const APPLIED = { variants: { hero: 'type' }, sections: ['faq'], palette: 'linen', fonts: 'grotesk', dna: {} };

it('a short first request shows the plan card and builds nothing', async () => {
  plans.draft.mockResolvedValueOnce({ plan: PLAN, applied: APPLIED, exhausted: false });
  const out: any = await send('Hazme una tienda de velas');
  expect(applyMaster).not.toHaveBeenCalled();
  expect(out.assistantMessage.metadata).toMatchObject({ plan: PLAN, appliedPlan: APPLIED, planKind: 'new' });
  expect(out.assistantMessage.content).toMatch(/Esto es lo que voy a hacer/);
});

it('Construir builds from the saved plan without a new plan call', async () => {
  messages.push({ id: 'plan1aaaa', threadId: 't', channel: 'source', role: 'ASSISTANT', content: 'plan', metadata: { plan: PLAN, appliedPlan: APPLIED, planKind: 'new' }, createdAt: new Date() });
  await chat.send('m1', 's1', { revision: 0, instruction: 'Construir', planId: 'plan1aaaa', requestId: uuid() });
  expect(plans.draft).not.toHaveBeenCalled();
  expect(applyMaster.mock.calls[0][5]).toEqual(APPLIED);
});

it('an outdated plan is refused in plain words', async () => {
  messages.push({ id: 'plan1aaaa', threadId: 't', channel: 'source', role: 'ASSISTANT', content: 'plan', metadata: { plan: PLAN, appliedPlan: APPLIED, planKind: 'new' }, createdAt: new Date() });
  const out: any = await chat.send('m1', 's1', { revision: 2, instruction: 'Construir', planId: 'plan1aaaa', requestId: uuid() });
  expect(out.assistantMessage.content).toMatch(/La tienda cambió desde este plan/);
  expect(applyMaster).not.toHaveBeenCalled();
});

it('a failed plan call keeps the request for «sigue»', async () => {
  plans.draft.mockResolvedValueOnce(null);
  const out: any = await send('Hazme una tienda de velas');
  expect(out.assistantMessage.metadata).toMatchObject({ failed: true, pendingRequest: { instruction: 'Hazme una tienda de velas', direct: false } });
});

it('a vague edit on a master store shows a «Hacer cambios» card', async () => {
  decided('design', { vague: true });
  plans.draft.mockResolvedValueOnce({ plan: { ...PLAN, revision: 2 }, applied: APPLIED, exhausted: false });
  const out: any = await edit('Ponlo más bonito');
  expect(generate).not.toHaveBeenCalled();
  expect(out.assistantMessage.metadata.planKind).toBe('edit');
});

it('YAPI_PLAN_CARD=off keeps today\'s path', async () => {
  configValues['app.yapiPlanCard'] = false;
  await send('Hazme una tienda de velas');
  expect(plans.draft).not.toHaveBeenCalled();
  expect(applyMaster).toHaveBeenCalled();
});
```

Fit these to the spec's helpers: `send()` must be the helper that runs the walkthrough first build (`setupAction: 'generate'` on revision 0); `decided(kind, extra)` must merge `extra` into the decision (extend it if it takes one argument); `configValues` is whatever the spec uses to answer `config.get` (rename to match). The `messages.push` objects must match the shape the spec's prisma mock stores.

- [ ] **Step 6: Run to verify they fail**

Run: `cd apps/api && npx jest --maxWorkers=2 src/storefront-source/source-chat-master.spec.ts`
Expected: FAIL — `plans` not used; card never shown.

- [ ] **Step 7: Implement the chat routes**

`configuration.ts`: in the type add `/** YAPI plan card (spec 2026-10-22): short and vague requests show a plan before building. Default on; YAPI_PLAN_CARD=off disables. */ yapiPlanCard: boolean;` and in the values `yapiPlanCard: process.env.YAPI_PLAN_CARD !== 'off',`.

DTO, with the other optional fields:

```ts
  /** YAPI plan card (spec 2026-10-22): build the plan YAPI showed in this message. */
  @IsOptional() @IsString() @Matches(/^[a-z0-9]{8,40}$/i) planId?: string;
```

`SourceChatService`: inject `@Optional() private readonly plans?: SourceStorePlanService` (last constructor parameter) and add:

```ts
  private planOn() { return this.config.get<boolean>('app.yapiPlanCard') !== false && Boolean(this.plans); }

  /** The card: what YAPI will do, line by line; the message id is the plan's id. */
  private async planCard(threadId: string, userMessage: StoreAgentMessage, workflow: ReturnType<typeof createSourceProgress>, drafted: { plan: StorePlan; applied: AppliedPlan }, kind: 'new' | 'edit') {
    await workflow.finish('completed');
    const intro = kind === 'new' ? 'Esto es lo que voy a hacer con tu tienda:' : 'Esto es lo que voy a cambiar:';
    const assistantMessage = await this.prisma.storeAgentMessage.create({ data: { threadId, channel: 'source', role: 'ASSISTANT',
      content: `${intro}\n${drafted.plan.card.map(line => `• ${line}`).join('\n')}\nToca ${kind === 'new' ? '«Construir»' : '«Hacer cambios»'} o dime qué cambiar.`,
      metadata: { progress: workflow.value, plan: drafted.plan, appliedPlan: drafted.applied, planKind: kind } as unknown as Prisma.InputJsonValue } });
    return { userMessage, assistantMessage, setup: null };
  }

  /** A failed plan call keeps the request for «sigue» (unfinished requests, 2026-10-22). */
  private async planFailed(threadId: string, userMessage: StoreAgentMessage, workflow: ReturnType<typeof createSourceProgress>, instruction: string) {
    await workflow.finish('failed');
    const assistantMessage = await this.prisma.storeAgentMessage.create({ data: { threadId, channel: 'source', role: 'ASSISTANT',
      content: unfinishedNote('No pude preparar el plan de tu tienda.', false), metadata: { failed: true, progress: workflow.value, pendingRequest: { instruction, direct: false } } } });
    return { userMessage, assistantMessage, setup: null };
  }
```

Routes in `send()`:

1. **Tapped plan**, right after `workflow` is created (before the style-proposal and `formCommand` blocks):

```ts
    if (input.planId && this.planOn()) {
      const saved = history.messages.find(message => message.id === input.planId && message.role === 'ASSISTANT');
      const meta = (saved?.metadata ?? {}) as { plan?: StorePlan; appliedPlan?: AppliedPlan; planKind?: 'new' | 'edit' };
      if (!meta.plan || !meta.appliedPlan || meta.plan.revision !== current.revision) {
        await workflow.finish('completed');
        const assistantMessage = await this.prisma.storeAgentMessage.create({ data: { threadId: thread.id, channel: 'source', role: 'ASSISTANT',
          content: 'La tienda cambió desde este plan. Dime otra vez qué quieres y preparo uno nuevo.', metadata: { progress: workflow.value } } });
        return { userMessage, assistantMessage, setup: null };
      }
      return meta.planKind === 'edit'
        ? await this.buildPlanEdit(merchantId, storeId, thread.id, userMessage, workflow, meta.plan, meta.appliedPlan, current.revision)
        : await this.useMasterTemplate(merchantId, storeId, thread.id, userMessage, workflow, setupDraft, current.revision, [], undefined, '', { plan: meta.plan, applied: meta.appliedPlan });
    }
```

2. **First build**, in the walkthrough branch that today returns `useMasterTemplate(...)`:

```ts
        const ownRequest = ownDesignRequest(input.instruction, history.messages);
        if (this.planOn()) {
          const drafted = await this.plans!.draft(merchantId, storeId, { revision: 0, request: ownRequest ?? input.instruction, what: (onboarding as { what?: string }).what ?? '', photos: (input.assetUrls || []).slice(0, 8) });
          if (!drafted) return await this.planFailed(thread.id, userMessage, workflow, input.instruction);
          // A detailed first request builds at once; a short one waits for «Construir».
          if (!ownRequest) return await this.planCard(thread.id, userMessage, workflow, drafted, 'new');
          return await this.useMasterTemplate(merchantId, storeId, thread.id, userMessage, workflow, setupDraft, current.revision, (input.assetUrls || []).slice(0, 8), ownRequest, '', drafted);
        }
        return await this.useMasterTemplate(merchantId, storeId, thread.id, userMessage, workflow, setupDraft, current.revision, (input.assetUrls || []).slice(0, 8), ownRequest);
```

3. **`useMasterTemplate`** gains a last parameter `planned?: { plan: StorePlan; applied: AppliedPlan }`:
   - pass `planned?.applied` as `applyMaster`'s 6th argument;
   - inside the filler, `sectionCatalogue: planned ? manifest.master!.sections.filter(id => planned.applied.sections.includes(id)) : manifest.master!.sections`;
   - the follow-up: `const planBrief = planned ? this.plans!.followUpBrief(planned.plan) : null;` and when `planBrief` is set use `{ instruction: merchantRequest ? `${planBrief}\n\nMensajes del comercio:\n${merchantRequest}` : planBrief, revision: saved.revision, personalTouch: true, ownRequest: true, requestId: randomUUID(), model: 'auto' }` instead of today's follow-up; otherwise today's logic unchanged;
   - when `planned` is set, the reply starts `Esto es lo que hice:\n${planned.plan.card.map(line => `• ${line}`).join('\n')}\n` before today's text.

4. **Vague edit**, right after `decision` is final and before `const masterDesign = …`:

```ts
      if (this.planOn() && masterStore && decision.vague && !input.personalTouch && previous) {
        const state = readMasterState((previous.snapshot as unknown as SourceProjectSnapshot).files);
        const { sections: currentSections = [], ...currentVariants } = state.variants ?? { sections: [] };
        const drafted = await this.plans!.draft(merchantId, storeId, { revision: current.revision, request: input.instruction, what: '', photos: [],
          current: { variants: currentVariants as Record<string, string>, sections: currentSections, palette: state.look?.palette ?? '', fonts: state.look?.fonts ?? '' } });
        if (!drafted) return await this.planFailed(thread.id, userMessage, workflow, input.instruction);
        return await this.planCard(thread.id, userMessage, workflow, drafted, 'edit');
      }
```

5. **`buildPlanEdit`** (new private method):

```ts
  private async buildPlanEdit(merchantId: string, storeId: string, threadId: string, userMessage: StoreAgentMessage, workflow: ReturnType<typeof createSourceProgress>, plan: StorePlan, applied: AppliedPlan, revision: number) {
    await workflow.report('saving');
    const saved = await this.templates.refill(merchantId, storeId, revision, {
      variants: { ...applied.variants, sections: applied.sections } as MasterVariants,
      look: { palette: applied.palette, fonts: applied.fonts, ...(applied.accent ? { colors: { accent: applied.accent } } : {}) },
    }, 'Cambios del plan');
    await workflow.finish('completed');
    const assistantMessage = await this.prisma.storeAgentMessage.create({ data: { threadId, channel: 'source', role: 'ASSISTANT',
      content: `Listo: hice los cambios del plan.\n${plan.card.map(line => `• ${line}`).join('\n')}`,
      metadata: { progress: workflow.value, sourceRevision: saved.revision, label: 'Cambios del plan' } } });
    const brief = this.plans!.followUpBrief(plan);
    const followUp: SourceMessageInput | undefined = brief ? { instruction: brief, revision: saved.revision, personalTouch: true, ownRequest: true, requestId: randomUUID(), model: 'auto' } : undefined;
    return { userMessage, assistantMessage, revision: saved, ...(followUp ? { followUp } : {}) };
  }
```

If `refill` does not apply `look.palette`/`look.fonts` or `variants` today, extend it in `source-templates.service.ts` the same way `masterContentEdit` passes them (read `refill`'s body first; add a test in `source-templates-plan.spec.ts` that a refill with `variants.hero = 'type'` saves `hero: 'type'`).

- [ ] **Step 8: Run tests and type-check**

Run: `cd apps/api && npx jest --maxWorkers=2 src/storefront-source/source-store-plan.service.spec.ts src/storefront-source/source-chat && npx tsc --noEmit --incremental false -p tsconfig.json`
Expected: PASS; no type errors

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/storefront-source/source-store-plan.service.ts apps/api/src/storefront-source/source-store-plan.service.spec.ts apps/api/src/storefront-source/source-chat.service.ts apps/api/src/storefront-source/source-chat-master.spec.ts apps/api/src/storefront-source/storefront-source.module.ts apps/api/src/storefront-source/dto/send-source-message.dto.ts apps/api/src/config/configuration.ts apps/api/src/storefront-source/source-templates.service.ts apps/api/src/storefront-source/source-templates-plan.spec.ts
git commit -m "feat(api): short and vague requests show a plan card; Construir builds the saved plan"
```

---

### Task 8: The card in the Studio

**Files:**
- Create: `apps/merchant-studio/src/source-plan-card.ts`
- Test: `apps/merchant-studio/src/source-plan-card.test.ts`
- Modify: `apps/merchant-studio/src/source-studio.ts` (assistant message template ~line 881; click handlers ~line 1287; `RetrySubmission`; `send` options), `apps/merchant-studio/src/api.ts:336-337`, `apps/merchant-studio/src/source-narrator.css`

**Interfaces:**
- Produces:
  - `type PlanCardView = { id: string; kind: 'new' | 'edit'; lines: string[]; outdated: boolean }`
  - `function planCardOf(message: { id: string; metadata?: Record<string, unknown> | null }, currentRevision: number): PlanCardView | null`
  - `function renderPlanCard(card: PlanCardView, disabled: boolean): string` — `data-plan-build="<id>"` and `data-plan-change`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { planCardOf, renderPlanCard } from './source-plan-card';

const message = { id: 'plan1aaaa', metadata: { planKind: 'new', plan: { revision: 0, card: ['Menú con 3 categorías desplegables', '<b>x</b>'] } } };

describe('plan card', () => {
  it('reads the card from the message and knows when it is outdated', () => {
    expect(planCardOf(message, 0)).toEqual({ id: 'plan1aaaa', kind: 'new', lines: ['Menú con 3 categorías desplegables', '<b>x</b>'], outdated: false });
    expect(planCardOf(message, 2)?.outdated).toBe(true);
    expect(planCardOf({ id: 'm', metadata: {} }, 0)).toBeNull();
  });
  it('renders escaped lines and the two buttons; an outdated card has no build button', () => {
    const html = renderPlanCard(planCardOf(message, 0)!, false);
    expect(html).toContain('data-plan-build="plan1aaaa"');
    expect(html).toContain('Construir');
    expect(html).toContain('Cambiar');
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
    expect(renderPlanCard({ ...planCardOf(message, 0)!, kind: 'edit' }, false)).toContain('Hacer cambios');
    expect(renderPlanCard(planCardOf(message, 2)!, false)).not.toContain('data-plan-build');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/merchant-studio && npx vitest run src/source-plan-card.test.ts`
Expected: FAIL — module missing

- [ ] **Step 3: Implement**

```ts
/** YAPI plan card (spec 2026-10-22): what YAPI will do, with Construir / Cambiar, under its plan message. */
export type PlanCardView = { id: string; kind: 'new' | 'edit'; lines: string[]; outdated: boolean };
const esc = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function planCardOf(message: { id: string; metadata?: Record<string, unknown> | null }, currentRevision: number): PlanCardView | null {
  const meta = message.metadata ?? {};
  const plan = meta.plan as { revision?: unknown; card?: unknown } | undefined;
  if (!plan || !Array.isArray(plan.card)) return null;
  const lines = plan.card.filter((line): line is string => typeof line === 'string' && Boolean(line.trim())).slice(0, 7);
  return lines.length ? { id: message.id, kind: meta.planKind === 'edit' ? 'edit' : 'new', lines, outdated: plan.revision !== currentRevision } : null;
}

export function renderPlanCard(card: PlanCardView, disabled: boolean): string {
  const off = disabled ? ' disabled' : '';
  return `<div class="plan-card" data-plan-card="${esc(card.id)}"><ul>${card.lines.map(line => `<li>${esc(line)}</li>`).join('')}</ul>`
    + (card.outdated ? '<p class="plan-card__outdated">La tienda cambió desde este plan.</p>'
      : `<div class="plan-card__actions"><button type="button" class="plan-card__build" data-plan-build="${esc(card.id)}"${off}>${card.kind === 'edit' ? 'Hacer cambios' : 'Construir'}</button><button type="button" data-plan-change${off}>Cambiar</button></div>`)
    + '</div>';
}
```

The plan message's own text repeats the lines as bullets (server side); in the Studio, when a message has a plan card, render only its first line (the intro) as text and the card below — in the assistant message template, use `planCardOf(message, state.revision)` and, when it returns a card, replace the message body with `escape(message.content.split('\n')[0])` + `renderPlanCard(card, busy || dirty() || historical())`.

Click handlers, next to the suggestion handler (~line 1287):

```ts
    const planBuild = target.closest<HTMLButtonElement>('[data-plan-build]');
    if (planBuild) { void send('Construir', undefined, undefined, undefined, undefined, { planId: planBuild.dataset.planBuild! }); return; }
    if (target.closest('[data-plan-change]')) { const box = app.querySelector<HTMLTextAreaElement>('[data-agent-input], textarea'); if (box) { box.placeholder = 'Dime qué cambiar del plan…'; box.focus(); } return; }
```

(Use the click event's target variable name and the composer selector the file already uses.)

`RetrySubmission` gains `planId?: string`; in `send`, extend the options object given to `api.sendSourceMessage` with `...(retry?.planId ? { planId: retry.planId } : {})`. In `api.ts:336` add `planId?: string` to `options` and in the POST body `...(options?.planId ? { planId: options.planId } : {})`.

Styles appended to `source-narrator.css`:

```css
/* YAPI plan card (spec 2026-10-22). Yellow = YAPI. */
.plan-card { margin-top: 10px; padding: 12px 14px; border: 1px solid rgb(24 24 27 / .1); border-radius: 14px; background: rgb(255 255 255 / .72); }
.plan-card ul { margin: 0; padding-left: 18px; display: grid; gap: 4px; font-size: 13.5px; line-height: 1.45; }
.plan-card__actions { display: flex; gap: 8px; margin-top: 12px; }
.plan-card__actions button { min-height: 34px; padding: 0 14px; border-radius: 999px; border: 1px solid rgb(24 24 27 / .14); background: #fff; font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; }
.plan-card__actions .plan-card__build { background: #f3d34a; border-color: #f3d34a; color: #18181b; }
.plan-card__outdated { margin: 10px 0 0; color: #71717a; font-size: 12.5px; }
```

- [ ] **Step 4: Run tests and type-check**

Run: `cd apps/merchant-studio && npx vitest run src/source-plan-card.test.ts && npx tsc --noEmit -p .`
Expected: PASS; no type errors

- [ ] **Step 5: Rebuild the Studio and commit**

Run: `cd apps/merchant-dashboard && pnpm run build:studio`

```bash
git add apps/merchant-studio/src/source-plan-card.ts apps/merchant-studio/src/source-plan-card.test.ts apps/merchant-studio/src/source-studio.ts apps/merchant-studio/src/api.ts apps/merchant-studio/src/source-narrator.css
git commit -m "feat(studio): YAPI's plan card with Construir / Cambiar"
```

---

### Task 9: Spec amendments, the eval script and the live check

**Files:**
- Modify: `docs/superpowers/specs/2026-10-22-yapi-plan-card-design.md`
- Create: `apps/api/scripts/plan-eval.ts`

- [ ] **Step 1: Amend the spec** — append a section «Amendments (plan, 2026-10-22)» with the two amendments listed at the top of this plan, verbatim.

- [ ] **Step 2: Eval script** — prints, per store, the card lines, the applied plan, the nearest other store's distance and `exhausted`; never saves a revision.

```ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { SourceStorePlanService } from '../src/storefront-source/source-store-plan.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { otherFingerprints } from '../src/storefront-source/plan/store-plan-data';
import { fingerprintOf, planDistance } from '../src/storefront-source/plan/store-plan-fingerprint';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['warn', 'error'] });
  const prisma = app.get(PrismaService), plans = app.get(SourceStorePlanService);
  for (const storeId of process.argv.slice(2)) {
    const store = await prisma.store.findUniqueOrThrow({ where: { id: storeId }, select: { name: true, merchantId: true } });
    const out = await plans.draft(store.merchantId, storeId, { revision: 0, request: 'Hazme una tienda', what: '', photos: [] });
    if (!out) { console.log(`${store.name}: plan call failed`); continue; }
    const mine = fingerprintOf({ variants: out.applied.variants, sections: out.applied.sections, palette: out.applied.palette, fonts: out.applied.fonts, accent: out.applied.accent });
    const nearest = Math.min(1, ...(await otherFingerprints(prisma, storeId)).map(other => planDistance(mine, other)));
    console.log(`\n${store.name}\n${out.plan.card.map(line => `  • ${line}`).join('\n')}\n  nearest distance ${nearest.toFixed(2)} exhausted=${out.exhausted}\n  ${JSON.stringify(out.applied)}`);
  }
  await app.close();
}
main().catch(error => { console.error(error); process.exit(1); });
```

- [ ] **Step 3: Run the storefront-source suite**

Run: `cd apps/api && npx jest --maxWorkers=2 src/storefront-source 2>&1 | tail -5`
Expected: only the known pre-existing failures (`product-page-kit.spec.ts:124`, `source-catalog.spec.ts:79`), none in files this plan touched.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-10-22-yapi-plan-card-design.md apps/api/scripts/plan-eval.ts
git commit -m "docs+chore: plan card spec amendments and the plan eval script"
```

- [ ] **Step 5: Live check (owner-gated, ChatGPT plan quota)** — with the stack on `pnpm dev:chatgpt` and no RUNNING chat jobs:
  1. `cd apps/api && npx ts-node --transpile-only scripts/plan-eval.ts cmvjy0ajn000113t5bp70z4xi <PEPPA store id> <NOA store id>` — every card line names something of that store; nearest distance ≥ 0.35.
  2. In the Studio, a new store on the goodProtein catalog with «Hazme una tienda de proteínas» → card → Construir → judge against PEPPA, Antojo Café, BOXY, NOA and goodProtein #1.
  3. On that store, «ponlo más bonito» → «Hacer cambios» card → tap → saved.
  Record results, failures included, in the programme memory.
