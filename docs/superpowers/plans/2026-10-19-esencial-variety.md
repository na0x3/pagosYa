# Esencial Variety, Brand and Personal Touch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every new Esencial store looks made for its business: a seeded roll of finished variants (header, hero, grid, card, story, values, closing, footer, product page, business sections, look details, 16 palettes, 14 font pairs), the merchant's brand first, per-product content, faster creation, and an automatic background «Toque personal».

**Architecture:** Variants are data. The manifest's `master.variants` lists every variant id per part; the fill call returns the business's *character* and exclusions; `source-master-dice.ts` rolls the variants (seeded by store id, avoiding the last 6 master stores' hero+palette+fonts) and writes them into `store-data` (`export const variants`). Esencial's components set `data-es-<part>="<id>"` on each part's root and render the few variant-specific elements; nearly all variants are CSS arrangements of the same markup. A background chat job runs the personal touch through the existing design-edit path.

**Tech Stack:** NestJS/Jest (apps/api), node:test (packages/store-templates), React/TSX + CSS template, Playwright sandbox, OpenAI Responses structured output.

**Spec:** `docs/superpowers/specs/2026-10-19-esencial-variety-design.md` (with §2b). Built on `2026-10-19-master-template-design.md` (Esencial).

## Global Constraints

- Flags: `YAPI_ESENCIAL_DICE` → `app.yapiEsencialDice` (default on, `=off` disables); `YAPI_PERSONAL_TOUCH` → `app.yapiPersonalTouch` (default on).
- Variants are data in `store-data` (`variants`); no variant writes code at creation. Same KitSlot names in every product-page variant.
- Dice: seeded by store id (same store → same roll); avoid the hero+palette+fonts combination of the last 6 master stores (re-roll ≤ 20, else least used).
- Brand priority: confirmed brand profile colours/fonts/voice > logo palette (`proposeStorePalette`) > dice palette. Contrast rules of `masterColours` always apply.
- Business sections: 0–2, content only from merchant facts; `quotes`/`team` only with merchant-given facts.
- Every variant: no horizontal overflow at 1280/768/390, template contract passes, Lucide icons only, no emoji, motion off under reduced motion, `text-wrap: balance`, never `overflow-wrap: anywhere` on headings.
- Personal touch: once per new store, background, `MASTER_EDIT_RULES` + touch brief, layout check + one repair, label «Toque personal», failure keeps the first version silently, skipped if the merchant's revision moved.
- Test per file (`cd apps/api && npx jest <file>`; `--maxWorkers=2` for several); `cd packages/store-templates && npm test`. Never the whole API suite with default workers. Never `prisma migrate`. Commit per task; never push. Before the first `apps/api` edit, check no YAPI chat job is RUNNING. Login rate limit: scripts reuse one session token.

## Review Focus

1. **A store with only one photo** rolls `collage`/`strip`/`pair`/`gallery` → those need ≥3/≥2 photos; the dice must exclude them (test in Task 3: `photo-hungry variants need enough photos`).
2. **A brand profile with only an accent colour** → the other colours come from the rolled palette, contrast holds (Task 5: `a partial brand palette fills the rest from the roll`).
3. **Two stores created at the same second** → both may read the same "recent" list; they must still differ because the seeds differ (Task 4: `two stores with the same recent list roll differently`).
4. **The merchant edits while the personal touch is queued** → the touch is skipped, the merchant's edit wins (Task 11: `skips when the revision moved`).
5. **A product-page variant with no reviews and one photo** → no empty boxes, no overflow (Task 8: covered by the QA `single` shape at 390).

---

### Task 1: Walkthrough stores skip the conversation step

**Files:** Modify `apps/api/src/storefront-source/source-chat.service.ts` (after the `setupAction === 'restart'` block, before `let retryDecision`); Test: `apps/api/src/storefront-source/source-chat-master.spec.ts`.

**Interfaces:** Produces nothing new; reuses `useMasterTemplate(merchantId, storeId, threadId, userMessage, workflow, setupDraft, revision, chatPhotos)`.

- [ ] **Step 1: Failing test** (append at top level of `source-chat-master.spec.ts`):
```ts
it('a walkthrough store goes straight to Esencial without the conversation step (variety spec §1)', async () => {
  await send('Mi negocio se llama Café Buna.\nCrea mi tienda.');
  expect(decide).not.toHaveBeenCalled();
  expect(applyMaster).toHaveBeenCalled();
});

it('a chat-only new store still goes through the conversation step', async () => {
  prisma.store.findFirst.mockResolvedValue({ name: 'Café Buna', logoUrl: null, onboarding: null, _count: { paymentLinks: 0 }, paymentLinks: [] });
  await send('Quiero una tienda para mi café');
  expect(decide).toHaveBeenCalled();
});
```
- [ ] **Step 2:** `cd apps/api && npx jest src/storefront-source/source-chat-master.spec.ts -t "walkthrough store goes straight"` → FAIL (decide called).
- [ ] **Step 3: Implement.** Right before `let retryDecision: SourceConversationDecision | undefined;` insert:
```ts
    // Variety spec §1: a walkthrough store's answers are already known, so it skips the conversation step.
    if (this.config.get<boolean>('app.yapiMasterTemplate') === true && input.setupAction === 'generate' && !current.revision && !MASTER_SCRATCH.test(input.instruction)) {
      const walkthrough = await this.prisma.store.findFirst({ where: { id: storeId }, select: { onboarding: true } });
      const onboarding = walkthrough?.onboarding as { purpose?: string } | null | undefined;
      if (onboarding && onboarding.purpose !== 'showcase') {
        await workflow.report('interpreting');
        return await this.useMasterTemplate(merchantId, storeId, thread.id, userMessage, workflow, setupDraft, current.revision, (input.assetUrls || []).slice(0, 8));
      }
    }
```
(`useMasterTemplate` already puts onboarding photos first and de-duplicates.)
- [ ] **Step 4:** run `source-chat-master.spec.ts` whole → PASS. The two older tests that pass a `decide` mock to a walkthrough store (`photos attached in chat reach the fill call…`, `products typed with prices…`) still pass: the first now gets chat photos from `input.assetUrls`; the second has `onboarding: null`.
- [ ] **Step 5: Commit** `feat(yapi): walkthrough stores skip the conversation step`.

---

### Task 2: Product pages get their own content after a master build

**Files:** Modify `apps/api/src/storefront-source/source-templates.service.ts` (constructor + `applyMaster`); Test: `source-templates.service.spec.ts`.

**Interfaces:** Consumes `ProductPageWriterService.fillStore(storeId: string, limit?: number): Promise<void>` (`apps/api/src/product-content/product-page-writer.service.ts`).

- [ ] **Step 1: Failing test** (in the `SourceTemplatesService` describe):
```ts
  it('writes every product\\'s own page content after a master build, in the background (variety spec §2b)', async () => {
    const { templates: base, projects, prisma } = service(0);
    const real = jest.requireActual('@pagosya/store-templates');
    const pageWriter = { fillStore: jest.fn(async () => undefined) };
    const templates = new SourceTemplatesService(prisma as any, (base as any).publicStores, projects as any, (base as any).config, undefined, pageWriter as any);
    templates.registry = { ...templates.registry, templateManifest: real.templateManifest, templateSourceFiles: real.templateSourceFiles };
    await templates.applyMaster('m1', 'store-1', 0, async () => null);
    await new Promise(resolve => setImmediate(resolve));
    expect(pageWriter.fillStore).toHaveBeenCalledWith('store-1');
  });
```
- [ ] **Step 2:** run → FAIL (constructor arity / not called).
- [ ] **Step 3: Implement.** Constructor gains `@Optional() private readonly pageWriter?: ProductPageWriterService` after `uploads` (import from `../product-content/product-page-writer.service`). At the end of `applyMaster`, before `return`: `void Promise.resolve().then(() => this.pageWriter?.fillStore(storeId)).catch(() => undefined);`. If Nest DI cannot resolve it in `StorefrontSourceModule`, import `ProductContentModule` there the same way `SourceGenerationService` gets it (check `source-generation.service.ts:103` and the module's `imports`).
- [ ] **Step 4:** run the spec → PASS; `npx tsc -p tsconfig.json --noEmit` clean.
- [ ] **Step 5: Commit** `feat(templates): master stores get per-product page content`.

---

### Task 3: Variant catalogue, character and the dice

**Files:** Modify `packages/store-templates/index.js` + `index.d.ts` (`master.variants`), `templates/esencial/template.json`; Create `apps/api/src/storefront-source/source-master-dice.ts` + `source-master-dice.spec.ts`; Modify `source-master.ts` (`MasterVariants`, fill read fields), `source-templates.ts` (store-data `variants` export, `readMasterState`).

**Interfaces — Produces:**
- Manifest: `master.variants: Record<VariantPart, string[]>` where `VariantPart = 'header'|'announce'|'hero'|'grid'|'card'|'story'|'values'|'closing'|'footer'|'pdp'|'pdpOrder'|'button'|'corners'|'density'|'texture'|'photos'` and `master.sections: string[]` (business section ids).
- `source-master.ts`: `export type MasterVariants = Record<VariantPart, string> & { sections: string[] }`; `MasterCharacter = { tone: 'calm'|'bold'; temperature: 'warm'|'cool'|'neutral'; lead: 'photo'|'text'; exclude: string[] }`.
- `source-master-dice.ts`: `rollVariants(input: { seed: string; settings: MasterSettings; character: MasterCharacter; photoCount: number; sections: string[]; recent: Array<{ hero: string; palette: string; fonts: string }> }): { variants: MasterVariants; palette: string; fonts: string }`.
- `templateStoreDataFile(..., master?: { copy; look; variants?: MasterVariants; sections?: MasterSectionContent[] })` writes `export const variants = …` and `export const sections = …`; `readMasterState` returns `variants` and `sections`.

- [ ] **Step 1: Catalogue in `template.json`** (`master.variants` and `master.sections`, plus 8 new palettes and 6 new font pairs):
```json
"variants": {
  "header": ["classic", "centered", "links", "split", "minimal"],
  "announce": ["plain", "ticker", "chip"],
  "hero": ["full", "split-left", "split-right", "framed", "collage", "type", "strip", "poster", "arch", "stack"],
  "grid": ["grid4", "grid3", "feature", "strip", "list", "masonry"],
  "card": ["plain", "framed", "overlay", "hover2", "bar"],
  "story": ["split", "quote", "overlay", "pair", "timeline", "note"],
  "values": ["numbered", "icons", "cards", "line", "checklist"],
  "closing": ["dark", "accent", "photo", "newsletter"],
  "footer": ["columns", "bigname", "minimal", "twotone"],
  "pdp": ["gallery-left", "gallery-right", "stacked", "sticky-thumbs", "editorial", "split-scroll"],
  "pdpOrder": ["story-first", "details-first", "reviews-first"],
  "button": ["pill", "soft", "square", "underline"],
  "corners": ["round", "soft", "sharp"],
  "density": ["airy", "regular", "compact"],
  "texture": ["none", "paper", "grain", "lines"],
  "photos": ["natural", "rounded", "framed", "duotone"]
},
"sections": ["process", "pick", "sizes", "gallery", "faq", "visit", "materials", "howto", "team", "quotes"]
```
New palettes (append to `master.palettes`, ids and hex):
`ember` bold `#fff4ec/#1d120c/#fde3d0/#e2541b/#3a1a0c`; `cobalt` bold `#f3f5ff/#0f1730/#e1e6fb/#2346d8/#0f1730`; `blush` pastel `#fdf3f4/#2b1c20/#f6e2e5/#c45c78/#4a2633`; `moss` earthy `#f1efe6/#1f2419/#e3e1d2/#6b7a3a/#2d3322`; `linen` warm mono `#f7f3ee/#22201d/#ebe5dc/#22201d/#22201d`; `ink` dark `#101418/#eef1f4/#1a2027/#7fb2d9/#05080b`; `wine` dark `#1a0f12/#f4e9ea/#28181c/#d8a0ad/#0e0709`; `citrus` bright `#fffdf2/#1b1b14/#fbf5d6/#e8a400/#2c2a12`.
New font pairs (only catalogue ids): `geometric` `space-grotesk`+`dm-sans`; `soft` `young-serif`+`figtree`; `poster` `bebas-neue`+`manrope`; `condensed` `oswald`+`hanken-grotesk`; `bookish` `newsreader`+`newsreader`; `gallery-sans` `syne`+`instrument`.
Update `validateMaster` (Task 3 of the previous plan) to accept ≥ 8 palettes/fonts instead of exactly 8, and to require `variants` (each part a non-empty array of slug ids) and `sections` when present. Update `esencial.test.mjs` (`8` → `16` palettes, `14` font pairs).

- [ ] **Step 2: Failing dice tests** (`source-master-dice.spec.ts`):
```ts
import { templateManifest } from '@pagosya/store-templates';
import { rollVariants } from './source-master-dice';

const settings = templateManifest('esencial')!.master!;
const calm = { tone: 'calm', temperature: 'warm', lead: 'photo', exclude: [] } as const;
const roll = (seed: string, extra: Partial<Parameters<typeof rollVariants>[0]> = {}) => rollVariants({ seed, settings, character: calm, photoCount: 6, sections: [], recent: [], ...extra });

it('the same store always rolls the same', () => expect(roll('s1')).toEqual(roll('s1')));
it('different stores roll differently somewhere', () => {
  const rolls = ['a', 'b', 'c', 'd', 'e', 'f'].map(seed => JSON.stringify(roll(seed)));
  expect(new Set(rolls).size).toBe(6);
});
it('never repeats a recent hero + palette + fonts', () => {
  const first = roll('s2');
  const again = roll('s2', { recent: [{ hero: first.variants.hero, palette: first.palette, fonts: first.fonts }] });
  expect([again.variants.hero, again.palette, again.fonts]).not.toEqual([first.variants.hero, first.palette, first.fonts]);
});
it('two stores with the same recent list roll differently', () => {
  const recent = [{ hero: 'full', palette: 'terracotta', fonts: 'classic' }];
  expect(JSON.stringify(roll('x1', { recent }))).not.toBe(JSON.stringify(roll('x2', { recent })));
});
it('respects exclusions', () => {
  for (const seed of 'abcdefghij') expect(roll(seed, { character: { ...calm, exclude: ['type', 'grid4'] } }).variants.hero).not.toBe('type');
});
it('photo-hungry variants need enough photos', () => {
  for (const seed of 'abcdefghijklmnop') {
    const v = roll(seed, { photoCount: 1 }).variants;
    expect(['collage', 'strip']).not.toContain(v.hero);
    expect(v.story).not.toBe('pair');
  }
});
it('keeps the chosen business sections (at most 2)', () => {
  expect(roll('s3', { sections: ['process', 'faq', 'visit'] }).variants.sections).toEqual(['process', 'faq']);
});
it('a bold character leans to bold palettes', () => {
  const bold = ['ember', 'cobalt', 'citrus', 'ink', 'wine', 'noir'];
  const hits = 'abcdefghijklmnopqrst'.split('').filter(seed => bold.includes(roll(seed, { character: { ...calm, tone: 'bold' } }).palette)).length;
  expect(hits).toBeGreaterThanOrEqual(12);
});
```
- [ ] **Step 3:** run → FAIL (module missing).
- [ ] **Step 4: Implement `source-master-dice.ts`:**
```ts
/** Variety spec §3: the platform's dice over Esencial's finished variants, seeded by the store. */
import { createHash } from 'node:crypto';
import type { MasterSettings } from '@pagosya/store-templates';
import type { MasterCharacter, MasterVariants } from './source-master';

const PHOTO_NEEDS: Record<string, number> = { collage: 3, strip: 3, pair: 2, gallery: 2, overlay: 1, photo: 1 };
const PALETTE_TONE: Record<string, 'bold' | 'calm'> = { ember: 'bold', cobalt: 'bold', citrus: 'bold', ink: 'bold', wine: 'bold', noir: 'bold' };
const PALETTE_TEMP: Record<string, 'warm' | 'cool' | 'neutral'> = { terracotta: 'warm', olive: 'warm', sand: 'warm', plum: 'warm', ember: 'warm', blush: 'warm', moss: 'warm', citrus: 'warm', wine: 'warm', noir: 'warm', sage: 'cool', navy: 'cool', cobalt: 'cool', ink: 'cool', mono: 'neutral', linen: 'neutral' };

function rng(seed: string) {
  let counter = 0;
  return () => { const h = createHash('sha256').update(`${seed}:${counter++}`).digest(); return h.readUInt32BE(0) / 0x100000000; };
}
const pick = <T>(next: () => number, list: readonly T[]): T => list[Math.floor(next() * list.length)];

export function rollVariants(input: { seed: string; settings: MasterSettings; character: MasterCharacter; photoCount: number; sections: string[]; recent: Array<{ hero: string; palette: string; fonts: string }> }) {
  const catalogue = (input.settings as any).variants as Record<string, string[]>;
  const allowed = (part: string) => {
    const list = catalogue[part].filter(id => !input.character.exclude.includes(id) && (PHOTO_NEEDS[id] ?? 0) <= input.photoCount);
    return list.length ? list : [catalogue[part][0]];
  };
  const palettes = input.settings.palettes.map(p => p.id);
  const fitting = palettes.filter(id => (PALETTE_TONE[id] ?? 'calm') === input.character.tone && (input.character.temperature === 'neutral' || [input.character.temperature, 'neutral'].includes(PALETTE_TEMP[id] ?? 'neutral')));
  const palettePool = fitting.length >= 2 ? fitting : palettes.filter(id => (PALETTE_TONE[id] ?? 'calm') === input.character.tone);
  const fonts = input.settings.fonts.map(f => f.id);
  const taken = new Set(input.recent.map(r => `${r.hero}|${r.palette}|${r.fonts}`));
  for (let attempt = 0; attempt < 20; attempt++) {
    const next = rng(`${input.seed}#${attempt}`);
    const variants = Object.fromEntries(Object.keys(catalogue).map(part => [part, pick(next, allowed(part))])) as Record<string, string>;
    const palette = pick(next, palettePool.length ? palettePool : palettes);
    const font = pick(next, fonts);
    if (!taken.has(`${variants.hero}|${palette}|${font}`) || attempt === 19) {
      return { variants: { ...variants, sections: input.sections.filter(id => ((input.settings as any).sections as string[]).includes(id)).slice(0, 2) } as MasterVariants, palette, fonts: font };
    }
  }
  throw new Error('unreachable');
}
```
Add to `source-master.ts`: `export type MasterVariants = Record<string, string> & { sections: string[] }; export type MasterCharacter = { tone: 'calm' | 'bold'; temperature: 'warm' | 'cool' | 'neutral'; lead: 'photo' | 'text'; exclude: string[] };`.
- [ ] **Step 5:** run dice spec → PASS. If "bold leans" fails because `palettePool` for bold+warm is small, it still must be ≥ 12/20 since every pick comes from bold palettes; investigate any failure before changing the test.
- [ ] **Step 6: Store-data.** `templateStoreDataFile` master param gains `variants?: MasterVariants; sections?: Array<{ id: string; title: string; items: Array<{ title: string; text: string }> }>` and writes `export const variants = … as const;` and `export const sections = … as const;` (defaults: first id of every part, `sections: []`). `readMasterState` reads both. Test in `source-master-refill.spec.ts`: round-trip variants and sections; refill keeps them when the change has none.
- [ ] **Step 7:** run master specs + `npm test` (package) → PASS. **Commit** `feat(templates): Esencial variant catalogue and the store dice`.

---

### Task 4: Character in the fill call, dice in the build

**Files:** Modify `source-conversation.service.ts` (fill schema/prompt), `source-master.ts` (`MasterRead`, `masterFillFromRead`), `source-templates.service.ts` (`applyMaster`: recent rolls + dice), `source-templates.ts` (assemble passes variants/sections), `configuration.ts` (`yapiEsencialDice`); Tests: `source-master-fill.spec.ts`, `source-templates.service.spec.ts`.

**Interfaces:** `MasterRead` gains `tone`, `temperature`, `lead`, `exclude: string[]`, `sections: Array<{ id; title; items: [{title,text}] }>` and `variantRequests: Record<string,string>` (edit only; e.g. a named hero). `MasterFill` gains `character?: MasterCharacter; sections?: …; variants?: Partial<MasterVariants>`. `SourceTemplatesService.applyMaster` rolls with `rollVariants` when `app.yapiEsencialDice !== false`.

- [ ] **Step 1: Failing tests:** (a) fill schema has `tone/temperature/lead/exclude/sections` with `sections.items.id` enum = manifest sections; (b) `masterFillFromRead` maps them to `character`/`sections`; (c) `applyMaster` with a filler returning `character: bold` saves store-data whose `variants.hero` is from the catalogue and whose look palette is a bold palette; (d) **recent rolls**: `applyMaster` reads the last 6 master stores — mock `prisma.storeSourceVersion.findMany` to return one version whose store-data has `variants.hero='full'`, look `terracotta/classic`, and assert the saved roll is not that triple for a seed that would otherwise produce it (use `jest.spyOn(dice, 'rollVariants')` to assert `recent` was passed).
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: Implement.**
  - Fill prompt adds: "tone/temperature/lead describe the business's character; exclude lists variant ids that do not fit this business or its photos (catalogue below); sections: 0–2 business sections from the list, each with a title and 2–4 items written from the merchant's facts only — leave a section out rather than invent." The facts JSON includes `variantCatalogue` and `sectionCatalogue`.
  - Recent rolls in `applyMaster`: `const recent = await this.recentMasterRolls(storeId)`: `prisma.storeSourceVersion.findMany({ where: { revision: 1, storeId: { not: storeId } }, orderBy: { createdAt: 'desc' }, take: 40, select: { snapshot: true } })`, keep those whose `snapshot.brief.templateId === 'esencial'`, map `readMasterState(files)` → `{ hero: variants.hero, palette: look.palette, fonts: look.fonts }`, first 6.
  - Then: `const rolled = dice ? rollVariants({ seed: storeId, settings: manifest.master, character: fill.character ?? defaultCharacter, photoCount, sections: (fill.sections ?? []).map(s => s.id), recent }) : null;` and the fill's look becomes `{ palette: rolled.palette, fonts: rolled.fonts, colors: fill.look?.colors ?? {} }` unless a brand palette applies (Task 5). Pass `variants: rolled?.variants` and `sections: fill.sections` to `assemble` → `assembleTemplateRevision` → `templateStoreDataFile`. `photoCount` = number of non-empty photos available to the store (onboarding + product photos).
  - Content edits: a named variant in the request (`variantRequests`) overrides that part in `refillMasterFiles` (merchant words beat the dice).
- [ ] **Step 4:** run the specs → PASS; tsc clean. **Commit** `feat(yapi): the fill call reads the business's character and the dice roll the store`.

---

### Task 5: The merchant's brand first

**Files:** Modify `source-templates.service.ts` (`applyMaster` brand step), `source-chat.service.ts` (`useMasterTemplate` passes brand facts to the filler), `source-conversation.service.ts` (fill prompt gets voice/headlineExamples/avoid); Test: `source-templates.service.spec.ts`, `source-master.spec.ts`.

**Interfaces:** Consumes `BrandProfileService.get(merchantId, storeId) → { data: { confirmed: BrandFact[] } }` and `proposeStorePalette({ logo, photos }) → SourcePalette | undefined` (`source-palette.ts`).

- [ ] **Step 1: Failing tests:** (a) confirmed `background/foreground/accent` → saved `look.colors` equals them (lowercased) and the dice palette is not used for those colours; (b) **a partial brand palette fills the rest from the roll**: only `accent` confirmed → `colors = { accent }`, the theme's paper/ink come from the rolled palette, contrast ≥ 4.5 (`masterColours`); (c) logo present and no confirmed colours → `proposeStorePalette` result becomes `colors: { paper, ink, accent, muted: surface }`; (d) confirmed `headingFontUrl` → theme `@font-face` uses that URL's bundled asset (reuse the brand-font bundling path the generation uses — find `brandStyles`/`fontPaths` in `source-generation.service.ts` and call the same helper).
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: Implement** in `applyMaster` after the roll: read brand (optional service, `@Optional() brands?: BrandProfileService` — the chat service already has the pattern); confirmed colours → `colors`; else logo bytes via `uploads.getBuffer` + `proposeStorePalette` → colours; logo URL already flows into `store.logo`. Fill prompt receives `brand: { voice, headlineExamples, avoid, quote }` from confirmed facts (`useMasterTemplate` passes them; quote may be used for `story: quote` or the closing line).
- [ ] **Step 4:** run → PASS. **Commit** `feat(templates): the merchant's brand comes before the dice`.

---

### Tasks 6–9: Esencial variants (four batches)

Each batch follows the same steps; the component and CSS rules are listed per variant. Rules apply under the part root's attribute, e.g. `.es-hero[data-es-hero="split-left"]`. Components read `variants` and `sections` from `./store-data`.

**Batch test (add to `packages/store-templates/test/esencial.test.mjs` per batch):**
```js
test('every catalogued variant of <PART> has its rule set in globals.css', () => {
  const css = file('styles/globals.css');
  for (const id of esencial.master.variants['<PART>']) assert.match(css, new RegExp(`data-es-<PART>="${id}"`), `<PART> ${id} has no styles`);
});
```
**Batch QA:** extend `source-templates-qa.tool.spec.ts` with `MASTER_ROLLS=n`: for master templates, render `n` rolls (seeds `qa-1..qa-n`) instead of looks, and a forced roll per variant when `MASTER_VARIANT=<part>:<id>` is set. Run `QA_TEMPLATES=1 TEMPLATE_IDS=esencial MASTER_VARIANT=hero:<id> …` for every id of the batch → all PASS (no overflow, no missing images, card hooks intact), then look at the screenshots and fix what looks wrong before committing.

**Steps per batch:** (1) add the batch test, run → FAIL; (2) add component switches + CSS rules below; (3) package tests PASS; (4) contract `-t "plantilla esencial"` and motion specs PASS; (5) QA screenshots for each new id at 1280 and 390, fix, recapture; (6) commit `feat(templates): Esencial <batch> variants`.

#### Task 6 — header, announcement, hero
- Header root gets `data-es-header={variants.header}`. `classic`: today. `centered`: grid `1fr auto 1fr`, logo centred, ☰ left, icons right. `links`: `links` rendered inline in the header from 900px (menu button hidden ≥900px), uppercase 13px tracked. `split`: links split two left / one right around the centred logo ≥900px. `minimal`: only name + cart, no search/account icons (account stays in footer).
- Announcement root `data-es-announce`: `plain` today; `ticker`: the text repeated ×4 in a `role="marquee"`-free `aria-hidden` duplicate track with a visually hidden single copy, `animation: es-ticker 40s linear infinite`, paused on hover/focus-within and off under reduced motion; `chip`: centred pill on `--es-accent` with `--es-on-accent`.
- Hero root `data-es-hero`; uses `photos.hero`, `photos.p1..p3` for `collage`/`strip`, `store.logo` for `poster`:
  `full` today · `split-left`/`split-right`: two columns 1:1 (≥900px), photo column `min-height: 560px` cover, copy on paper colour, stacked on phones (photo first) · `framed`: section on `--es-muted`, photo in a 4:5 frame with 12px paper border and `--es-deep` shadow offset, copy beside it · `collage`: three photos in an asymmetric grid (60/40, two stacked), copy below on desktop, above on phone · `type`: no photo; headline `clamp(56px, 10vw, 140px)` on `--es-accent` with `--es-on-accent` · `strip`: headline centred, three equal photos in a row below (2 on phone, scroll-snap) · `poster`: centred copy, logo (if any) 72px above the eyebrow, photo as a soft 30% overlay background · `arch`: photo clipped `border-radius: 50% 50% 0 0 / 30% 30% 0 0`, copy beside · `stack`: photo card 80% wide centred, headline overlapping its top edge by 48px on a paper band.
  Hero photo-dependent variants fall back to `type` when the photo is empty (component logic).

#### Task 7 — grid, card, story, values, closing, footer
- Grid wrapper `data-es-grid`: `grid4`/`grid3` columns; `feature`: first card spans 2×2 (≥900px); `strip`: one row, `overflow-x: auto`, `scroll-snap-type: x mandatory`, cards 280px; `list`: one column, card as a row (photo 120px, text, price, add); `masonry`: `columns: 3 240px` with `break-inside: avoid`, card photo aspect from image.
- Card root `data-es-card` (inside the product template): `plain` today; `framed`: 1px line border, 12px padding; `overlay`: name/price over the bottom of the photo on a gradient, add button top-right; `hover2`: relies on the kit's second photo (DNA `card: second-photo` already pinned) — style the swap; `bar`: add-to-cart as a full-width text button under the photo («Agregar»), the round button hidden. Every variant keeps `data-product-link`, `data-product-field="name|price"`, `button[data-product-add]` (test exists).
- Story `data-es-story`: `split` today; `quote`: `copy.storyBody` as a large heading-font quote, title as small eyebrow, no photo; `overlay`: text card over a full-width `photos.story`; `pair`: `photos.story` + `photos.p1` side by side, text below; `timeline`: `storyBody` split into up to 3 sentences on a numbered vertical line; `note`: text on `--es-muted` card with a signature line «— {store.name}».
- Values `data-es-values`: `numbered` today; `icons`: Lucide `IconStar`, `IconTruck`, `IconShieldCheck` above each; `cards`: three bordered cards; `line`: the three titles joined with « · » in one large line, texts hidden visually but kept for screen readers; `checklist`: vertical list with check icons (add `IconCheck` to the generator list and regenerate icons).
- Closing `data-es-closing`: `dark` today; `accent`: on `--es-accent`; `photo`: `photos.hero` background with shade; `newsletter`: line + an email field and button posting to `/v1/stores/public/:slug/newsletter` through the kit's existing subscribe hook if one exists (check `commerce-src` for `data-pagosya-newsletter`); if none, render the contact link instead and leave the form to Spec B.
- Footer `data-es-footer`: `columns` today; `bigname`: store name `clamp(64px, 14vw, 200px)` across the width above the columns; `minimal`: one row (name · links · legal); `twotone`: brand column on `--es-deep` with `--es-on-deep`, rest on muted.

#### Task 8 — product page layouts and order
- `product.tsx` article gets `data-es-pdp={variants.pdp}` and `data-es-pdp-order={variants.pdpOrder}`; the below-the-fold slots (`reviews`, `related`, plus the product writer's blocks rendered by the kit inside `info`/content) are wrapped in `<div className="es-pdp__below">` and ordered with CSS `order` per `pdpOrder`.
- `gallery-left` today · `gallery-right`: grid columns reversed · `stacked`: gallery full width (max 960px centred), info below in two columns (title/price/buy | highlights/delivery/info) · `sticky-thumbs`: gallery with the kit's thumbnails moved to a vertical column on the left (`.es-pdp__gallery [data-kit-thumbs]` → `flex-direction: column`; find the kit's thumbnail selector in `commerce-src/product`) · `editorial`: a full-width title band (title + price on `--es-muted`) above the grid, the title slot hidden inside the info column · `split-scroll`: info column `position: sticky; top: 96px; align-self: start`, gallery images stacked vertically (kit gallery `data-gallery="stack"` if supported; otherwise CSS grid on its images).
- QA shapes `demo`, `single` (one photo, no reviews) and `long` at 1280 and 390 for every layout — Review Focus 5.

#### Task 9 — business sections, look details, palettes and fonts
- `home.tsx` renders `sections` (from store-data) after the story, each as `<section id="{id}" data-es-section="{id}">` with title + items:
  `process` 3 numbered steps with Lucide icons · `pick` one product card (first product) + the section's reason text · `sizes` a two-column table (item title | text) · `gallery` 2–4 photos from `photos.p1..p4` + story · `faq` `<details>` list · `visit` city (store.city), hours (item text), WhatsApp button (store.phone) · `materials` icon list · `howto` 3 steps · `team` cards with name + role (text only) · `quotes` large quotes with source.
- Look details on the shell root `.es`: `data-es-button`, `data-es-corners`, `data-es-density`, `data-es-texture`, `data-es-photos` with rules: buttons (`pill` 999px · `soft` 10px · `square` 0 · `underline` transparent with 2px bottom border); corners set `--es-radius` 16/6/0px used by cards, photos, inputs; density scales section padding (`airy` 128/64, `regular` 96/48, `compact` 64/36 desktop/phone); texture `paper` (subtle SVG noise data URI at 4% opacity on body), `grain` (8%), `lines` (repeating 1px horizontal lines at 3%); photos `rounded` (radius 24px), `framed` (8px paper border + 1px line), `duotone` (`filter: grayscale(1) contrast(1.05)` with `mix-blend-mode: multiply` over `--es-accent` tint on product and story photos only — never on the product page gallery).
- Add the 8 palettes and 6 font pairs from Task 3 (fonts already in the catalogue); if a pair's fonts are not in `SOURCE_FONT_CATALOG`, replace with a catalogued pair and record it.
- Kit DNA follows: the shell maps `data-es-button` to the kit's button DNA where the kit has an equivalent (`pill`→`pill`, `square`→`block`, `underline`→`underline`, `soft`→`block` with radius), set in config DNA by `assembleTemplateRevision` from `variants.button`.

---

### Task 10: Six stores for the owner — STOP GATE

- [ ] `MASTER_ROLLS=6` QA run with seeds `book-1, book-2, coffee-1, coffee-2, prints-1, prints-2` and, for realism, the owner's photos: create six stores with `$CLAUDE_JOB_DIR/tmp/live/live.mjs` (two per folder: `~/book`, `~/coffee`, `~/cuadrizate`) after Tasks 1–9, render with `shots.ts` (uploads inlined), and show home 1440 + 390 and a product page per store.
- [ ] **STOP:** ask the owner to approve the variety. Do not start Task 11 until approved; apply their changes to Tasks 6–9 files and recapture.

---

### Task 11: «Toque personal» in the background

**Files:** Modify `configuration.ts` (`yapiPersonalTouch`), `dto/send-source-message.dto.ts` (`personalTouch?: boolean`), `source-chat.service.ts` (enqueue after `useMasterTemplate`; handle `personalTouch` requests), `source-chat-jobs.service.ts` (internal enqueue helper if `create` needs a request id); Test: `source-chat-master.spec.ts`.

**Interfaces:** `SourceChatJobsService.create(merchantId, storeId, input: SendSourceMessageDto)`; `PERSONAL_TOUCH_BRIEF` (string constant in `source-chat.service.ts`).

- [ ] **Step 1: Failing tests:**
```ts
it('queues one personal touch after a new master store (variety spec §5)', async () => { /* config app.yapiPersonalTouch true; jobs.create mock; send walkthrough → jobs.create called once with { personalTouch: true, revision: 1 } */ });
it('a personal touch runs as a design edit with the touch brief', async () => { /* send({ revision: 1, personalTouch: true, instruction: PERSONAL_TOUCH_BRIEF }) on a master store → generate called; instruction contains MASTER_EDIT_RULES and «toque personal» */ });
it('skips when the revision moved', async () => { /* projects.current → revision 2 while personalTouch request has revision 1 → generate not called, no assistant message */ });
it('a failed personal touch leaves the first version and says nothing', async () => { /* generate rejects → no failed message created; returns without throwing */ });
```
Write each test body fully when implementing (mocks as in this spec file's `edits on a master store` block; `jobs` passed as a new optional constructor arg or via `SourceChatJobsService` injected `@Optional()`).
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: Implement.**
  - `PERSONAL_TOUCH_BRIEF`: «Toque personal para este negocio: agrega UNA sección que las variantes no tienen y que nazca de sus datos reales (por ejemplo «Lo que nos hace distintos» o una guía breve de uso), UN detalle de firma (un sello con la ciudad o la idea del negocio, un subrayado dibujado en el titular o un separador propio) y, si una sección suena genérica, reescribe solo esa. No quites secciones, no cambies la estructura de store-data, no inventes datos, precios ni reseñas, no toques carrito ni pago.»
  - After `useMasterTemplate` saves (and only when `app.yapiPersonalTouch === true`), enqueue `{ instruction: PERSONAL_TOUCH_BRIEF, revision: saved.revision, personalTouch: true, requestId: randomUUID(), model: 'auto' }` through the jobs service; the assistant message for creation adds «Le estoy dando un toque personal a tu tienda…».
  - In `send`, a `personalTouch` request: if `current.revision !== input.revision` return silently (no messages); otherwise force `editKind = 'design'`, label «Toque personal», and on any failure return without a failure message (catch → `workflow.finish('completed')`, no assistant message).
- [ ] **Step 4:** run chat specs → PASS. **Commit** `feat(yapi): a background personal touch for every new master store`.

---

### Task 12: Live check

- [ ] With the owner's approval, restart nothing unless the API's dist is stale (check `dist/src/main` start time vs last commit). Create 3 stores from `~/book`, `~/coffee`, `~/cuadrizate` with `live.mjs` (reuse `token.txt`), time each (target < 25 s to first version), wait for «Toque personal» (record time), render both revisions with `shots.ts`, check each product page shows the writer's blocks, and report with screenshots. Update the project memory.
