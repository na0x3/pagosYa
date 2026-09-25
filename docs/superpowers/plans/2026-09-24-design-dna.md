# Design DNA — Implementation Plan (sub-project 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every store carries a structured Design DNA (form, behaviour and placement enums plus up to 3 motifs and a signature). New designs get it from the planner with each concept; old revisions and static stores get a deterministic default seeded by the store id. The runtime receives the enums as `window.PAGOSYA_CONFIG.dna` and `commerce.js` writes them onto `<html>` as `data-dna-*` attributes, ready for sub-projects 5 and 6.

**Architecture:** One new pure module, `source-dna.ts`, owns the enums, the type, the JSON-schema fragment, `normalizeDna` (repair in code, never a paid repair), `defaultDna(seed)`, `dnaFingerprint`, `dnaRuntimeConfig` and `sourceRuntimeDna` (the flat, prose-free runtime object with the product page aligned). The planner asks for `dna` per concept and `validateSourceDesign` normalizes it. Generation writes `dna` into `config.js` for every run. `SourcePublishingService.publicSite` fills a seeded `dna` into a published `config.js` that lacks one. `commerce.js` applies the attributes at start-up with its own copy of the allowed values, and a test pins that copy to the TypeScript enums.

**Tech Stack:** NestJS API, TypeScript, Jest (ts-jest, `rootDir: src`), jsdom (borrowed from `apps/checkout`, as `source-commerce-policies.spec.ts` already does), plain browser JS in `packages/storefront-kit/kit/commerce.js`.

**Spec:** `docs/superpowers/specs/2026-09-24-design-dna-design.md` (binding). Parent: `docs/superpowers/specs/2026-09-24-yapi-unique-stores-design.md` §4 (DNA contract), §5 (failure handling "automatic code fix first").

## Global Constraints

- Colours are never part of the DNA. `--store-*` / `--brand-*` tokens stay the colour source.
- A bad DNA never costs a paid repair: `normalizeDna` replaces each invalid enum with the seeded default for that field and returns a repair line. Planner repairs reach the generation's `autoRepairs` (`source-generation.service.ts:474`), and only for the attempt that succeeded.
- `config.js` carries enums only (`dnaRuntimeConfig`): no motifs, no signature, no free text.
- `productPageStyle` in `config.js` stays the single source the kit reads. When a concept has both a valid model-chosen `dna.surfaces.product` and `layout.productPage`, the DNA wins and the layout follows. When the DNA product had to be defaulted, it follows `layout.productPage` instead (the model's explicit choice beats a seeded guess). The runtime `dna.product` always equals the `productPageStyle` written beside it.
- Saved designs without `dna` stay byte-equal through `savedSourceDesign`: normalization runs only for planning (`requireLayout`) or when `dna` is present.
- The seed for defaults is the store id (generation and publishing agree). Planner field defaults use `${storeId}:${conceptIndex}` so the three concepts differ.
- `commerce.js` stays dependency-free, ES2019-ish classic script, and ignores unknown values and keys.
- `SOURCE_PRODUCT_PAGE_STYLES` moves to `source-dna.ts` and is re-exported from `source-design.ts`, so `source-dna.ts` imports nothing from `source-design.ts` (no import cycle at module-evaluation time).
- Jest paths are relative to `apps/api/src`: `cd apps/api && npx jest storefront-source/<file>`. Full check: `npx jest storefront-source --runInBand`.
- No paid AI calls, no benchmark scripts, no new dependencies.

## Review Focus

1. The planner's schema is strict: every DNA property must be in `required`, every object `additionalProperties: false` → Task 1 schema test, Task 2 planner test.
2. An invalid DNA from the model must not trigger the planner's second (paid) attempt → Task 2 planner test counts `fetch` calls.
3. Saved designs without DNA must round-trip unchanged (existing `source-design.spec.ts:10` and `source-theme.spec.ts:14` keep passing) → Task 2.
4. `defaultDna` must be deterministic and spread: 50 seeds give ≥ 40 distinct fingerprints → Task 1.
5. `commerce.js` must accept every TypeScript enum value and nothing else → Task 4 test iterates every value.
6. A published `config.js` that already has `dna` is served untouched; a missing one gets the seeded default aligned to its `productPageStyle` → Task 5.

---

## File Structure

| File | Responsibility |
|---|---|
| `apps/api/src/storefront-source/source-dna.ts` (create) | Enums, `SourceDesignDna`, `SOURCE_DNA_SCHEMA`, `SOURCE_DNA_DIRECTION`, `normalizeDna`, `defaultDna`, `dnaFingerprint`, `dnaRuntimeConfig`, `sourceRuntimeDna`, `SOURCE_DNA_RUNTIME_ENUMS`, `SOURCE_PRODUCT_PAGE_STYLES`. |
| `apps/api/src/storefront-source/fixtures/dna.ts` (create) | `validDna()` shared by specs. |
| `apps/api/src/storefront-source/source-dna.spec.ts` (create) | Model tests. |
| `apps/api/src/storefront-source/source-design.ts` (modify) | `dna` in concept type and schema; `validateSourceDesign` normalizes and aligns; re-export product styles. |
| `apps/api/src/storefront-source/source-design-planner.ts` (modify) | DNA brief in prompt, 4,800 output tokens, `dnaSeed` and `repairs` inputs. |
| `apps/api/src/storefront-source/source-design.spec.ts`, `source-design-planner.spec.ts` (modify) | Tests. |
| `apps/api/src/storefront-source/source-generation.service.ts` (modify, ~486 and ~691) | Pass `dnaSeed`/`repairs` to the planner; write `dna` into `config.js`. |
| `apps/api/src/storefront-source/source-generation.service.spec.ts` (modify) | Static, component-mode and edit-without-DNA tests; line 373 passes the seed. |
| `packages/storefront-kit/kit/commerce.js` (modify, after line 4) | Apply `data-dna-*`. |
| `apps/api/src/storefront-source/source-commerce-dna.spec.ts` (create) | jsdom test of the runtime. |
| `apps/api/src/storefront-source/source-publishing.service.ts` (modify, `publicSite`) | Seed a missing `dna`. |
| `apps/api/src/storefront-source/source-publishing.service.spec.ts` (modify) | Test. |

---

### Task 1: The DNA model

**Files:**
- Create: `apps/api/src/storefront-source/source-dna.ts`, `apps/api/src/storefront-source/fixtures/dna.ts`, `apps/api/src/storefront-source/source-dna.spec.ts`

**Interfaces:**
- Produces: `type SourceDesignDna` (spec §3), `SOURCE_DNA_ENUMS` (group → key → values), `SOURCE_DNA_MOTIF_ENUMS`, `SOURCE_DNA_RUNTIME_ENUMS: Record<string, readonly string[]>` (flat runtime name → values; `buttons.form` → `button`, `motion.personality` → `motion`, other keys keep their name), `SOURCE_DNA_SCHEMA`, `SOURCE_DNA_DIRECTION: string`, `normalizeDna(raw: unknown, seed: string): { dna: SourceDesignDna; repairs: string[] }`, `defaultDna(seed: string): SourceDesignDna`, `dnaFingerprint(dna): string`, `dnaRuntimeConfig(dna): SourceRuntimeDna`, `sourceRuntimeDna(dna: SourceDesignDna | undefined, seed: string, productPageStyle?: unknown): SourceRuntimeDna`.
- Limits: motifs ≤ 3 (extra dropped), motif `target` ≤ 60 chars, `meaning` ≤ 140 chars (cut), `signature` ≤ 160 chars (cut). Each cut or drop is a repair line.

- [ ] **Step 1: Write the fixture and failing tests**

`fixtures/dna.ts`:

```ts
import type { SourceDesignDna } from '../source-dna';

export const validDna = (): SourceDesignDna => ({
  version: 1,
  type: { display: 'fraunces', text: 'instrument', case: 'small-caps', tracking: 'wide' },
  shape: { radius: 'pill', border: 'hairline', frame: 'arch' },
  buttons: { form: 'stamp', hover: 'tilt', press: 'squash' },
  motion: { personality: 'playful' },
  layout: { grammar: 'collage', density: 'airy' },
  surfaces: { cart: 'sheet', added: 'ribbon', product: 'story-led', review: 'ticket', card: 'second-photo' },
  motifs: [{ for: 'product', target: 'Café de altura', meaning: 'El vapor de una taza recién servida', behavior: 'steam', trigger: 'add-to-cart', placement: 'cart' }],
  signature: 'Cada pedido se sella como un boleto de tren antiguo.',
});
```

`source-dna.spec.ts`:

```ts
import { validDna } from './fixtures/dna';
import { defaultDna, dnaFingerprint, dnaRuntimeConfig, normalizeDna, sourceRuntimeDna, SOURCE_DNA_ENUMS, SOURCE_DNA_RUNTIME_ENUMS, SOURCE_DNA_SCHEMA } from './source-dna';

describe('design DNA', () => {
  it('accepts a full valid DNA unchanged', () => {
    expect(normalizeDna(validDna(), 'store-1')).toEqual({ dna: validDna(), repairs: [] });
  });

  it('replaces every invalid enum with the seeded default for that field and reports it', () => {
    const fallback = defaultDna('store-1') as any;
    for (const [group, keys] of Object.entries(SOURCE_DNA_ENUMS)) for (const key of Object.keys(keys)) {
      const raw = validDna() as any;
      raw[group][key] = 'sparkle';
      const { dna, repairs } = normalizeDna(raw, 'store-1') as any;
      expect(dna[group][key]).toBe(fallback[group][key]);
      expect(repairs).toEqual([expect.stringContaining(`dna.${group}.${key}`)]);
      expect({ ...dna, [group]: { ...dna[group], [key]: raw[group][key] } }).toEqual(raw);
    }
  });

  it('uses the whole seeded default when the DNA is missing', () => {
    expect(normalizeDna(undefined, 'store-1')).toEqual({ dna: defaultDna('store-1'), repairs: [expect.stringContaining('dna')] });
  });

  it('caps motifs at three, drops invalid ones and cuts the signature at 160', () => {
    const raw = validDna() as any;
    const motif = raw.motifs[0];
    raw.motifs = [motif, { ...motif, behavior: 'explode' }, motif, motif, motif];
    raw.signature = 'x'.repeat(400);
    const { dna, repairs } = normalizeDna(raw, 's');
    expect(dna.motifs).toEqual([motif, motif, motif]);
    expect(dna.signature).toHaveLength(160);
    expect(repairs).toEqual([expect.stringContaining('motifs[1]'), expect.stringContaining('motifs'), expect.stringContaining('signature')]);
  });

  it('derives a stable, valid default that differs between stores', () => {
    expect(defaultDna('store-1')).toEqual(defaultDna('store-1'));
    expect(normalizeDna(defaultDna('store-1'), 'other').repairs).toEqual([]);
    const prints = new Set(Array.from({ length: 50 }, (_, i) => dnaFingerprint(defaultDna(`store-${i}`))));
    expect(prints.size).toBeGreaterThanOrEqual(40);
  });

  it('fingerprints button form, cart, added style and type pairing', () => {
    expect(dnaFingerprint(validDna())).toBe('stamp|sheet|ribbon|fraunces+instrument');
  });

  it('gives the runtime enums only, no prose', () => {
    const runtime = dnaRuntimeConfig(validDna()) as Record<string, unknown>;
    expect(Object.keys(runtime).sort()).toEqual(['version', ...Object.keys(SOURCE_DNA_RUNTIME_ENUMS)].sort());
    for (const [name, values] of Object.entries(SOURCE_DNA_RUNTIME_ENUMS)) expect(values).toContain(runtime[name]);
    expect(runtime).toMatchObject({ button: 'stamp', cart: 'sheet', added: 'ribbon', motion: 'playful', product: 'story-led' });
    expect(JSON.stringify(runtime)).not.toMatch(/boleto|vapor|Café/);
  });

  it('aligns the runtime product surface to the product page style the kit reads', () => {
    expect(sourceRuntimeDna(undefined, 'store-1', 'dense')).toEqual({ ...dnaRuntimeConfig(defaultDna('store-1')), product: 'dense' });
    expect(sourceRuntimeDna(validDna(), 'store-1', 'luxury')).toEqual(dnaRuntimeConfig(validDna()));
  });

  it('describes a strict schema: every property required, no extra keys', () => {
    const strict = (schema: any): void => {
      if (schema.type !== 'object') { if (schema.items) strict(schema.items); return; }
      expect(schema.additionalProperties).toBe(false);
      expect([...schema.required].sort()).toEqual(Object.keys(schema.properties).sort());
      Object.values(schema.properties).forEach(strict);
    };
    strict(SOURCE_DNA_SCHEMA);
    expect(SOURCE_DNA_SCHEMA.properties.buttons.properties.form.enum).toEqual([...SOURCE_DNA_ENUMS.buttons.form]);
    expect(SOURCE_DNA_SCHEMA.properties.motifs.maxItems).toBe(3);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/api && npx jest storefront-source/source-dna.spec.ts`
Expected: FAIL, `Cannot find module './source-dna'`.

- [ ] **Step 3: Implement `source-dna.ts`**

Enums per spec §3 as `as const` tuples grouped by `type`, `shape`, `buttons`, `motion`, `layout`, `surfaces`; `SourceDesignDna` derived from them plus `version: 1`, `motifs`, `signature`. A flat `FIELDS` list (group, key, runtime name, values) drives the default, normalization, schema and runtime config so they cannot drift. `defaultDna` hashes the seed (FNV-1a) into a mulberry32 generator and picks one value per field; motifs `[]`, signature `''`. `normalizeDna` starts from `defaultDna(seed)` and copies every valid field from `raw`, pushing `dna.<group>.<key>: invalid "<value>", used the default` for each invalid one. `sourceRuntimeDna(dna, seed, style)` = `dnaRuntimeConfig(dna ?? defaultDna(seed))` with `product` replaced by `style` when `style` is a valid product page style.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/api && npx jest storefront-source/source-dna.spec.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/storefront-source/source-dna.ts apps/api/src/storefront-source/source-dna.spec.ts apps/api/src/storefront-source/fixtures/dna.ts
git commit -m "feat(yapi): design DNA model with seeded defaults, repair-in-code validation and a prose-free runtime form"
```

---

### Task 2: The planner chooses a DNA with each concept

**Files:**
- Modify: `apps/api/src/storefront-source/source-design.ts` (type ~26, schema ~28, `validateSourceDesign` ~68, re-export line 11)
- Modify: `apps/api/src/storefront-source/source-design-planner.ts` (prompt ~31, reserve ~35, validate call ~57)
- Test: `apps/api/src/storefront-source/source-design.spec.ts`, `apps/api/src/storefront-source/source-design-planner.spec.ts`

**Interfaces:**
- Produces: `SourceDesignConcept.dna?: SourceDesignDna`; `validateSourceDesign(value, selected?, requireLayout?, requireNarrative?, dna?: { seed?: string; repairs?: string[] })`; planner input gains `dnaSeed?: string` and `repairs?: string[]`.
- Consumes: Task 1 (`normalizeDna`, `SOURCE_DNA_SCHEMA`, `SOURCE_DNA_DIRECTION`).

- [ ] **Step 1: Write the failing tests**

In `source-design.spec.ts` (import `validDna` from `./fixtures/dna` and `SOURCE_PRODUCT_PAGE_STYLES` from `./source-design`):

```ts
describe('design DNA in concepts', () => {
  const planned = () => { const value = proposal() as any; for (const concept of value.concepts) concept.layout = { sections: ['menu'], catalogSection: 'menu', standaloneIntro: false, productsInOpening: true, productPage: 'dense' }; return value; };
  it('keeps a valid DNA and lets its product surface decide the product page', () => {
    const value = planned(); value.concepts[1].dna = validDna();
    const concept = validateSourceDesign(value, 1, true).concepts[1];
    expect(concept.dna).toEqual(validDna());
    expect(concept.layout?.productPage).toBe('story-led');
  });
  it('repairs an invalid DNA in code, reports it, and keeps the planned product page when the DNA product was defaulted', () => {
    const value = planned(); value.concepts[1].dna = { ...validDna(), buttons: { form: 'sparkle', hover: 'lift', press: 'pop' }, surfaces: { ...validDna().surfaces, product: 'luxury' } };
    const repairs: string[] = [];
    const concept = validateSourceDesign(value, 1, true, false, { seed: 'store-1', repairs }).concepts[1];
    expect(concept.dna!.buttons.form).not.toBe('sparkle');
    expect(concept.dna!.surfaces.product).toBe('dense');
    expect(concept.layout?.productPage).toBe('dense');
    expect(repairs.filter(repair => repair.startsWith('concepts[1]'))).toEqual([expect.stringContaining('concepts[1].dna.buttons.form'), expect.stringContaining('concepts[1].dna.surfaces.product')]);
  });
  it('gives every planned concept a DNA, and leaves a saved design without one untouched', () => {
    expect(validateSourceDesign(planned(), 1, true).concepts.every(concept => concept.dna)).toBe(true);
    expect(validateSourceDesign(proposal(), 1).concepts.some(concept => 'dna' in concept)).toBe(false);
    expect(SOURCE_PRODUCT_PAGE_STYLES).toEqual(['editorial', 'dense', 'image-led', 'story-led']);
  });
});
```

In `source-design-planner.spec.ts` (import `validDna`, `SOURCE_DNA_SCHEMA`, `SOURCE_DNA_DIRECTION`):

```ts
it('asks for a DNA per concept in both arms, with room for it in the output budget', async () => {
  const reserve = jest.spyOn(SourceRequestBudget.prototype, 'reserve');
  const mock = jest.spyOn(globalThis, 'fetch').mockImplementation(async () => planningResponse({ index: 1, rationale: 'Fits.' }));
  await new SourceDesignPlanner().explore({ ...input(), selected: undefined });
  await new SourceDesignPlanner().explore({ ...input(), selected: undefined, narrative: false });
  for (const call of mock.mock.calls) {
    const body = JSON.parse(call[1]!.body as string);
    const items = body.text.format.schema.properties.concepts.items;
    expect(items.required).toContain('dna');
    expect(items.properties.dna).toEqual(SOURCE_DNA_SCHEMA);
    expect(body.input[0].content[0].text).toContain(SOURCE_DNA_DIRECTION);
  }
  expect(reserve.mock.calls.map(call => call[2])).toEqual([4800, 4800]);
});

it('repairs an invalid DNA in code instead of spending the paid retry', async () => {
  const withDna = concepts.map(concept => ({ ...concept, dna: { ...validDna(), buttons: { form: 'sparkle', hover: 'lift', press: 'pop' } } }));
  const mock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ status: 'completed', output: [{ content: [{ type: 'output_text', text: JSON.stringify({ concepts: withDna, selection: { index: 1, rationale: 'Fits.' } }) }] }] })));
  const repairs: string[] = [];
  const result = await new SourceDesignPlanner().explore({ ...input(), selected: undefined, dnaSeed: 'store-1', repairs });
  expect(mock).toHaveBeenCalledTimes(1);
  expect(result.concepts[1].dna!.buttons.form).not.toBe('sparkle');
  expect(repairs).toEqual(expect.arrayContaining([expect.stringContaining('concepts[1].dna.buttons.form')]));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/api && npx jest storefront-source/source-design.spec.ts storefront-source/source-design-planner.spec.ts -t "DNA"`
Expected: FAIL: `dna` is dropped by `validateSourceDesign`, the schema has no `dna`, reserve is called with 4200.

- [ ] **Step 3: Implement**

- `source-design.ts`: `export { SOURCE_PRODUCT_PAGE_STYLES, type SourceProductPageStyle } from './source-dna'` replaces the local definitions (import them too for local use); concept type gets `dna?: SourceDesignDna`; concept schema `required` gets `'dna'` and `properties.dna = SOURCE_DNA_SCHEMA`; in `validateSourceDesign`, after story/motion:

```ts
    if (requireLayout || concept.dna !== undefined) {
      // A bad DNA is repaired in code and reported: it never costs the paid planning retry.
      const normalized = normalizeDna(concept.dna, dnaOptions.seed !== undefined ? `${dnaOptions.seed}:${index}` : result.name);
      const chosenProduct = SOURCE_PRODUCT_PAGE_STYLES.includes(concept.dna?.surfaces?.product);
      // One source for the product page: a chosen DNA product wins; a defaulted one follows the planned layout.
      if (result.layout?.productPage) chosenProduct ? result.layout.productPage = normalized.dna.surfaces.product : normalized.dna.surfaces.product = result.layout.productPage;
      result.dna = normalized.dna;
      dnaOptions.repairs?.push(...normalized.repairs.map(repair => `concepts[${index}].${repair}`));
    }
```

- `source-design-planner.ts`: include `SOURCE_DNA_DIRECTION` in the prompt after the contract; reserve `4800`; collect repairs per attempt into a local array and pass `{ seed: input.dnaSeed, repairs: attemptRepairs }` to `validateSourceDesign`; push into `input.repairs` only after success.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/api && npx jest storefront-source/source-design.spec.ts storefront-source/source-design-planner.spec.ts storefront-source/source-theme.spec.ts`
Expected: PASS, including the pre-existing round-trip tests.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/storefront-source/source-design.ts apps/api/src/storefront-source/source-design-planner.ts apps/api/src/storefront-source/source-design.spec.ts apps/api/src/storefront-source/source-design-planner.spec.ts
git commit -m "feat(yapi): the design planner chooses a DNA with each concept and repairs it in code"
```

---

### Task 3: Every generation writes the DNA into config.js

**Files:**
- Modify: `apps/api/src/storefront-source/source-generation.service.ts` (planner call ~486, config ~691)
- Test: `apps/api/src/storefront-source/source-generation.service.spec.ts`

**Interfaces:**
- Consumes: `sourceRuntimeDna(dna, storeId, productPageStyle)` (Task 1); planner inputs `dnaSeed`, `repairs` (Task 2).
- Produces: `window.PAGOSYA_CONFIG.dna` (flat runtime DNA) in every generated `config.js`.

- [ ] **Step 1: Write the failing tests**

Inside `describe('Independent source generation', …)` (import `validDna` and `dnaRuntimeConfig`, `sourceRuntimeDna`):

```ts
  const configOf = (saved: any) => JSON.parse(saved.files.find((f: any) => f.path === 'config.js').content.match(/=\s*([\s\S]*);/)[1]);
  it('writes a seeded DNA into config.js of a static store whose design has none', async () => {
    const { service, projects } = setup();
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ status: 'completed', output: [{ content: [{ type: 'output_text', text: JSON.stringify({ label: 'Menu', files: files() }) }] }] })));
    await service.generate('m', 's', input);
    const config = configOf(projects.save.mock.calls[0][2]);
    expect(config.dna).toEqual(sourceRuntimeDna(undefined, 's', 'editorial'));
    expect(config.dna.product).toBe(config.productPageStyle);
  });
  it('writes the chosen concept DNA in component mode and records planner DNA repairs', async () => {
    const { service, projects } = setup('next');
    const planned = design(); planned.concepts[0].dna = validDna(); planned.concepts[0].layout!.productPage = 'story-led';
    jest.mocked(SourceDesignPlanner.prototype.explore).mockImplementation(async request => { request.repairs?.push('concepts[0].dna.buttons.hover: invalid'); return planned; });
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ status: 'completed', output: [{ content: [{ type: 'output_text', text: JSON.stringify({ label: 'React shop', files: nextStoreFiles(), products: [] }) }] }] })));
    const result = await service.generate('m', 's', input);
    expect(jest.mocked(SourceDesignPlanner.prototype.explore).mock.calls[0][0].dnaSeed).toBe('s');
    const config = configOf(projects.save.mock.calls[0][2]);
    expect(config.dna).toEqual(dnaRuntimeConfig(validDna()));
    expect(config.productPageStyle).toBe('story-led');
    expect(result.generation.autoRepairs).toContain('concepts[0].dna.buttons.hover: invalid');
  });
  it('gives an edited store whose saved design has no DNA the same seeded DNA', async () => {
    const { service, projects } = setup();
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ status: 'completed', output: [{ content: [{ type: 'output_text', text: JSON.stringify({ label: 'Menu', files: files() }) }] }] })));
    await service.generate('m', 's', input);
    const saved = projects.save.mock.calls[0][2];
    const old = configOf(saved); delete old.dna;
    saved.files.find((f: any) => f.path === 'config.js').content = `window.PAGOSYA_CONFIG = ${JSON.stringify(old)};\n`;
    projects.current.mockResolvedValue({ revision: 1 }); projects.version.mockResolvedValue({ snapshot: saved });
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ status: 'completed', output: [{ content: [{ type: 'output_text', text: JSON.stringify({ label: 'Color', edits: [{ path: 'styles.css', search: '#222', replacement: '#333' }], files: [] }) }] }] })));
    await service.generate('m', 's', { ...input, revision: 1, instruction: 'Cambia el color de texto a #333' });
    expect(configOf(projects.save.mock.calls[1][2]).dna).toEqual(sourceRuntimeDna(undefined, 's', 'editorial'));
  });
```

And line 373 compares against `validateSourceDesign(design(), 0, true, true, { seed: 's' })`, since the real planner now seeds defaults with the store id.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/api && npx jest storefront-source/source-generation.service.spec.ts -t "DNA"`
Expected: FAIL, `config.dna` is undefined and `dnaSeed` is not passed.

- [ ] **Step 3: Implement**

Pass `dnaSeed: storeId, repairs: autoRepairs` to `designPlanner.explore`. At the config line:

```ts
    // Every store carries a DNA: the chosen concept's, else one seeded by the store id (stable, differs per store).
    const dna = sourceRuntimeDna(acceptedDesign?.concepts[acceptedDesign.selected]?.dna, storeId, productPageStyle);
```

and add `dna` to the `config` object.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/api && npx jest storefront-source/source-generation.service.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/storefront-source/source-generation.service.ts apps/api/src/storefront-source/source-generation.service.spec.ts
git commit -m "feat(yapi): every generation writes the store's DNA into config.js"
```

---

### Task 4: commerce.js applies the DNA as data-dna-* attributes

**Files:**
- Modify: `packages/storefront-kit/kit/commerce.js` (after `const config = …`, line 4)
- Test: `apps/api/src/storefront-source/source-commerce-dna.spec.ts` (create)

**Interfaces:**
- Consumes: `config.dna` (flat runtime DNA).
- Produces: `<html data-dna-<name>="<value>">` for each known name with an allowed value.

- [ ] **Step 1: Write the failing test**

```ts
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { kitPath } from '@pagosya/storefront-kit';
import { dnaRuntimeConfig, SOURCE_DNA_RUNTIME_ENUMS } from './source-dna';
import { validDna } from './fixtures/dna';

const { JSDOM, VirtualConsole } = createRequire(join(__dirname, '../../../checkout/package.json'))('jsdom');
const commerce = readFileSync(kitPath('commerce.js'), 'utf8');

function boot(dna: unknown) {
  const dom = new JSDOM('<html><body><button data-cart-open>Pedido</button><section data-pagosya-catalog></section><section data-pagosya-cart></section><p data-pagosya-status></p></body></html>', { url: 'https://shop.test/', runScripts: 'outside-only', virtualConsole: new VirtualConsole() });
  const w = dom.window;
  w.HTMLElement.prototype.scrollIntoView = () => {};
  w.matchMedia = () => ({ matches: true });
  w.PAGOSYA_PREVIEW = true;
  const data = { storeName: 'Marca', items: [] };
  w.PAGOSYA_CONFIG = { slug: 'marca', apiBaseUrl: 'https://api.test', checkoutOrigin: 'https://pay.test', data, dna };
  w.fetch = jest.fn(async () => ({ ok: true, json: async () => data }));
  w.eval(commerce);
  return w.document.documentElement;
}
const dnaAttributes = (root: any) => Object.fromEntries([...root.attributes].filter((a: any) => a.name.startsWith('data-dna-')).map((a: any) => [a.name.slice(9), a.value]));

describe('design DNA in the storefront runtime', () => {
  it('writes each DNA enum onto <html> as a data-dna-* attribute', () => {
    const { version: _version, ...enums } = dnaRuntimeConfig(validDna());
    expect(dnaAttributes(boot(dnaRuntimeConfig(validDna())))).toEqual(enums);
  });
  it('accepts every value the API can send', () => {
    const longest = Math.max(...Object.values(SOURCE_DNA_RUNTIME_ENUMS).map(values => values.length));
    for (let i = 0; i < longest; i++) {
      const dna = Object.fromEntries(Object.entries(SOURCE_DNA_RUNTIME_ENUMS).map(([name, values]) => [name, values[i % values.length]]));
      expect(dnaAttributes(boot(dna))).toEqual(dna);
    }
  });
  it('ignores unknown values, unknown keys and a missing DNA', () => {
    expect(dnaAttributes(boot({ ...dnaRuntimeConfig(validDna()), button: 'sparkle', cart: '"><script>', evil: 'pill' }))).not.toHaveProperty('button');
    const root = boot({ button: 'sparkle', evil: 'pill', cart: 'sheet' });
    expect(dnaAttributes(root)).toEqual({ cart: 'sheet' });
    expect(dnaAttributes(boot(undefined))).toEqual({});
    expect(dnaAttributes(boot('pill'))).toEqual({});
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/api && npx jest storefront-source/source-commerce-dna.spec.ts`
Expected: FAIL, no `data-dna-*` attributes.

- [ ] **Step 3: Implement** — after `const config = window.PAGOSYA_CONFIG || {};` add a frozen `DNA_VALUES` table (same values as `SOURCE_DNA_RUNTIME_ENUMS`) and set `data-dna-<name>` for each own key whose value is included; wrap nothing in try (setAttribute on documentElement cannot throw for these names).

- [ ] **Step 4: Run to verify it passes**

Run: `cd apps/api && npx jest storefront-source/source-commerce-dna.spec.ts storefront-source/source-commerce-policies.spec.ts && node packages/storefront-kit/kit/check-runtimes.mjs` (the last from the repo root)
Expected: PASS; the kit runtime parse check prints no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/storefront-kit/kit/commerce.js apps/api/src/storefront-source/source-commerce-dna.spec.ts
git commit -m "feat(kit): apply the store's DNA as data-dna-* attributes at start-up"
```

---

### Task 5: Published stores without a DNA get a seeded one

**Files:**
- Modify: `apps/api/src/storefront-source/source-publishing.service.ts` (`publicSite`, line ~190)
- Test: `apps/api/src/storefront-source/source-publishing.service.spec.ts`

**Interfaces:**
- Consumes: `sourceRuntimeDna(undefined, store.id, config.productPageStyle)`.
- Produces: the served `config.js` always has `dna`.

Ruling (placement): the API's `publicSite`, not the checkout rewrite. `defaultDna` lives in the API; doing it in checkout would need a second copy of the seeded generator that must stay identical to the generation-time default. The API is also the one path every consumer of the published site JSON goes through.

- [ ] **Step 1: Write the failing test**

```ts
it('gives a published revision without a DNA a seeded one, and leaves an existing DNA alone', async () => {
  const prisma: any = { store: { findFirst: jest.fn().mockResolvedValue({ id: 'store-7', publishedSourceRevision: 1 }) }, storeSourceExperiment: { findUnique: jest.fn().mockResolvedValue(null) }, storeSourceVersion: { findUnique: jest.fn().mockResolvedValue({ digest: 'b'.repeat(64) }) } };
  const service = new SourcePublishingService(prisma);
  const config = (value: object) => ({ path: 'config.js', content: `window.PAGOSYA_CONFIG = ${JSON.stringify(value)};`, encoding: 'utf8' as const });
  const served = async (value: object) => {
    jest.spyOn(service, 'snapshot').mockResolvedValue({ schemaVersion: 1, brief: { businessType: '', audience: '', primaryAction: '', visualDirection: '' }, files: [{ path: 'index.html', content: '<main></main>', encoding: 'utf8' }, config(value)] } as any);
    const site = await service.publicSite('demo');
    return JSON.parse(site.snapshot!.files.find(f => f.path === 'config.js')!.content.match(/=\s*([\s\S]*?);?\s*$/)![1]);
  };
  expect((await served({ productPageStyle: 'dense', data: {} })).dna).toEqual(sourceRuntimeDna(undefined, 'store-7', 'dense'));
  expect((await served({ dna: { button: 'pill' } })).dna).toEqual({ button: 'pill' });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/api && npx jest storefront-source/source-publishing.service.spec.ts -t "DNA"`
Expected: FAIL, `dna` undefined.

- [ ] **Step 3: Implement** — in `publicSite`'s `publicFiles` map, rewrite `config.js` (new object, never mutating the shared cached file) when its parsed config lacks an object `dna`; an unparsable config is served as-is.

- [ ] **Step 4: Run to verify it passes**

Run: `cd apps/api && npx jest storefront-source/source-publishing.service.spec.ts`
Expected: PASS, including "serves pinned scripts … after the installed kit changes" (the default is deterministic).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/storefront-source/source-publishing.service.ts apps/api/src/storefront-source/source-publishing.service.spec.ts
git commit -m "feat(api): published stores without a DNA are served a seeded one"
```

---

### Task 6: Verify

- [ ] `cd apps/api && npx jest storefront-source --runInBand` → all green.
- [ ] `pnpm --filter @pagosya/checkout run test` → all green (checkout untouched, but it consumes the site JSON).
- [ ] `cd apps/api && npx tsc --noEmit -p tsconfig.json` → no output.
- [ ] `npx eslint` on every touched file → 0 errors.
- [ ] Update the ledger with counts. No benchmark: sub-project 2 changes no visuals; its before/after evidence is the attributes arriving, which Tasks 4–5 prove. The browser benchmark belongs to sub-project 5, when the attributes start changing pixels.
