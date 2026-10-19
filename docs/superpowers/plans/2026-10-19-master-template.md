# Master Template «Esencial» Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every new pagosYa shop starts from one hand-built, Amboras-style template («Esencial») filled by a single small YAPI call, and later chat edits change its data or make minimal code edits instead of re-authoring the store.

**Architecture:** Esencial is a hidden Plantilla in `packages/store-templates` with a new `master` manifest block (default copy, 8 palettes, 8 font pairs). The API's existing template apply (`assembleTemplateRevision`) learns to write the copy into `components/store-data.tsx` and a platform-owned theme block into `styles/globals.css`. A new chat branch applies Esencial for new shops and calls one structured "fill" model call; content edits rewrite the data through a `refill`, design edits go to the agent under minimal-edit rules plus a headless overflow/overlap check.

**Tech Stack:** NestJS (apps/api, Jest), Node test runner (packages/store-templates), React/TSX templates compiled by `compileNextPreview`, Playwright sandbox (`withVisualSandbox`), OpenAI Responses API structured outputs, lucide-static icons, SIL OFL fonts.

**Spec:** `docs/superpowers/specs/2026-10-19-master-template-design.md` (with its §5 amendments). Research: `docs/superpowers/research/2026-10-19-amboras-reverse-engineering.md`.

## Global Constraints

- Flag `YAPI_MASTER_TEMPLATE` → `app.yapiMasterTemplate`, **default on**; `YAPI_MASTER_TEMPLATE=off` returns to today's flow.
- Template id `esencial`; manifest `"hidden": true`, `"category": "general"`, `"sitePurpose": "shop"`.
- Fonts: **SIL OFL only**. Never add a Fontshare/ITF font (FFL v2.0 §02 forbids SaaS use). New families: geist, mona-sans, hanken-grotesk, schibsted-grotesk, gloock, eb-garamond.
- Icons: **Lucide only** (lucide-static, ISC), stroke 1.5. **No emoji** anywhere in Esencial.
- No code copied from Amboras repos (no licence). Structure and proportions only.
- Craft numbers: container 1280px, gutters 24px (16px phone), section rhythm 96px (48px phone), display 72px/1.05, h1 48/1.15, h2 36/1.2, h3 24/1.3, body 16–17px/1.6, buttons are pills, `text-wrap: balance` on headings, never `overflow-wrap: anywhere` on headings.
- Motion: kit `Parallax` (hero, `mobileStrength` 10–20) + kit `Reveal`; no marquee, no scroll scenes; still under `prefers-reduced-motion`.
- Copy caps (characters): announcement 90, eyebrow 40, headline 70, subcopy 160, primaryCta 28, secondaryCta 28, productsTitle 50, storyTitle 60, storyBody 420, value title 40, value text 140, closingLine 80, closingCta 28, tagline 90.
- Merchant-facing text in Spanish. The fill prompt forbids invented facts (reviews, numbers, years, awards, certifications, prices, delivery promises).
- Demo photos never reach a saved merchant store.
- Testing: run API tests per file (`cd apps/api && npx jest <path>`); never the whole API suite with default workers (add `--maxWorkers=2` when running several files). Package tests: `cd packages/store-templates && npm test`.
- Saving files under `apps/api` while the owner's dev stack runs restarts `nest --watch` and kills a running YAPI job. Before the first `apps/api` edit of a session, ask the owner whether a YAPI build is running; tell them when a restart happened.
- Never run `prisma migrate`/`db push`/`reset` (this plan needs no migration).
- Commit after every task on `feature/store-page-architecture`; never push.
- After any change under `apps/merchant-studio` or `packages/storefront-kit`, run `cd apps/merchant-dashboard && pnpm run build:studio`.

## Review Focus

1. **A merchant with no photos and no products** finishes the walkthrough → the store saves with the plain colour hero, the kit's empty catalogue text and no demo photo. Pinned in Task 3 (`no demo photo reaches a store without photos`) and Task 5 (`renders with no products and no hero photo`).
2. **A merchant colour that cannot be read** ("fondo amarillo #ffff33 y letras blancas") → ink is corrected to a readable one, never white-on-yellow. Pinned in Task 3 (`corrects unreadable custom ink`).
3. **A 60-character store name and a cap-length headline at 390px** → no sideways scroll. Pinned in Task 5 (`long name and headline fit a phone`).
4. **A content edit on a store whose theme block or copy line was hand-deleted** → the refill re-inserts the block / falls back to defaults instead of failing. Pinned in Task 3 (`refill restores a deleted theme block`).
5. **A merchant who said "desde cero" in an earlier message** of the same conversation → their store is designed from scratch, not from Esencial. Pinned in Task 8 (`an earlier «desde cero» keeps the scratch flow`).

---

### Task 1: Hide the Plantillas section

**Files:**
- Modify: `apps/merchant-dashboard/index.html:175` (the `data-dashboard-view="templates"` nav link)
- Modify: `apps/merchant-studio/src/source-studio.ts:795` (button) and `:1092` (its click handler)
- Create: `apps/merchant-dashboard/src/plantillas-hidden.test.mjs`
- Create: `apps/merchant-studio/src/plantillas-hidden.test.ts`

**Interfaces:** none (UI only).

- [ ] **Step 1: Write the failing tests**

`apps/merchant-dashboard/src/plantillas-hidden.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Spec 2026-10-19 §5.1: the Plantillas section is removed for now (the page and API stay so it can come back).
test('the dashboard menu has no Plantillas entry', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.doesNotMatch(html, /data-dashboard-view="templates"/);
});
```

`apps/merchant-studio/src/plantillas-hidden.test.ts`:
```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Spec 2026-10-19 §5.1: no «Plantillas» button in the Studio's Diseño y contenido group.
describe('Plantillas hidden', () => {
  it('the Studio renders no Plantillas button', () => {
    const source = readFileSync(new URL('./source-studio.ts', import.meta.url), 'utf8');
    expect(source).not.toContain('data-open-templates');
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd apps/merchant-dashboard && node --test src/plantillas-hidden.test.mjs` → FAIL (match found).
Run: `cd apps/merchant-studio && npx vitest run src/plantillas-hidden.test.ts` → FAIL.

- [ ] **Step 3: Remove the entries**

In `apps/merchant-dashboard/index.html` delete the whole line 175 `<a class="dashboard-nav-button" href="#dashboard-templates" data-dashboard-view="templates">…Plantillas</a>`. Leave the `data-dashboard-page="templates"` section and the `DASHBOARD_VIEW_COPY.templates` entry (unreachable, kept for the return).

In `apps/merchant-studio/src/source-studio.ts:795` delete `<button data-open-templates ${disabled(locked || !storeId || historical() || dirty())}>Plantillas</button>` (keep the rest of the `<section>`). At `:1092` delete the `app.querySelectorAll('[data-open-templates]').forEach(...)` statement through its closing `}));`.

- [ ] **Step 4: Run the new and existing tests**

Run: `cd apps/merchant-dashboard && node --test src/plantillas-hidden.test.mjs` → PASS.
Run: `cd apps/merchant-studio && npx vitest run src` → all PASS. If `source-browser.test.ts` or `source-templates.test.ts` asserted the button, change those assertions to expect it absent (the templates page module itself stays).

- [ ] **Step 5: Rebuild the Studio and commit**

```bash
cd apps/merchant-dashboard && pnpm run build:studio
cd ../.. && git add apps/merchant-dashboard/index.html apps/merchant-dashboard/src/plantillas-hidden.test.mjs apps/merchant-studio/src/source-studio.ts apps/merchant-studio/src/plantillas-hidden.test.ts apps/merchant-dashboard/public/studio
git commit -m "feat(studio): hide the Plantillas section for now"
```

---

### Task 2: Six premium OFL font families

**Files:**
- Create (via script): `packages/storefront-kit/kit/fonts/{geist,mona-sans,hanken-grotesk,schibsted-grotesk,gloock,eb-garamond}.ttf` and `<id>-OFL.txt`; modifies `packages/storefront-kit/kit/fonts/provenance.json`
- Modify: `apps/api/src/storefront-source/source-font-catalog.ts` (append to `FONTS`, after the last entry)
- Create: `apps/api/src/storefront-source/source-font-premium.spec.ts`

**Interfaces:**
- Produces: catalogue ids `geist`, `mona-sans`, `hanken-grotesk`, `schibsted-grotesk`, `gloock`, `eb-garamond` in `SOURCE_FONT_CATALOG` (and therefore in the DNA `display`/`text` enums, which are generated from it).

- [ ] **Step 1: Write the failing test**

```ts
import { existsSync, readFileSync } from 'node:fs';
import { kitPath } from '@pagosya/storefront-kit';
import { SOURCE_FONT_CATALOG, SOURCE_FONT_SEED_IDS } from './source-font-catalog';

// Spec 2026-10-19 §5.2: premium-grade families, SIL OFL only (Fontshare's FFL forbids SaaS use).
const PREMIUM = ['geist', 'mona-sans', 'hanken-grotesk', 'schibsted-grotesk', 'gloock', 'eb-garamond'];

describe('premium OFL fonts', () => {
  it.each(PREMIUM)('%s is catalogued, shipped and OFL-licensed', id => {
    expect(SOURCE_FONT_CATALOG.some(font => font.id === id)).toBe(true);
    expect(existsSync(kitPath('fonts', `${id}.ttf`))).toBe(true);
    expect(readFileSync(kitPath('fonts', `${id}-OFL.txt`), 'utf8').toUpperCase()).toContain('SIL OPEN FONT LICENSE');
  });

  it('does not change the seeded set saved stores were drawn from', () => {
    expect(PREMIUM.some(id => (SOURCE_FONT_SEED_IDS as readonly string[]).includes(id))).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/api && npx jest src/storefront-source/source-font-premium.spec.ts` → FAIL (not catalogued).

- [ ] **Step 3: Fetch the fonts**

```bash
cd packages/storefront-kit
node scripts/add-font.mjs geist geist 'Geist[wght].ttf'
node scripts/add-font.mjs mona-sans monasans 'MonaSans[wdth,wght].ttf'
node scripts/add-font.mjs hanken-grotesk hankengrotesk 'HankenGrotesk[wght].ttf'
node scripts/add-font.mjs schibsted-grotesk schibstedgrotesk 'SchibstedGrotesk[wght].ttf'
node scripts/add-font.mjs gloock gloock 'Gloock-Regular.ttf'
node scripts/add-font.mjs eb-garamond ebgaramond 'EBGaramond[wght].ttf'
```
If a call fails with 404, list the folder (`curl -s https://api.github.com/repos/google/fonts/contents/ofl/<dir> | grep '"name"'`) and rerun with the exact file name. If `mona-sans` fails the 600 KB check, use `onest` instead (`node scripts/add-font.mjs onest onest 'Onest[wght].ttf'`) and replace `mona-sans` by `onest` everywhere in this plan (Task 2 test, Task 5 font pair `luxury`).

- [ ] **Step 4: Catalogue them**

Append to the `FONTS` array in `source-font-catalog.ts`, after its current last entry (appending keeps `SOURCE_FONT_SEED_IDS` unchanged):
```ts
  // Spec 2026-10-19 master template: premium-grade OFL families for Esencial's font pairs.
  { id: 'geist', family: 'Geist', role: 'both', personality: ['grotesk', 'precise', 'premium'], weights: '100–900' },
  { id: 'mona-sans', family: 'Mona Sans', role: 'both', personality: ['grotesk', 'confident', 'premium'], weights: '200–900' },
  { id: 'hanken-grotesk', family: 'Hanken Grotesk', role: 'text', personality: ['grotesk', 'calm', 'premium'], weights: '100–900' },
  { id: 'schibsted-grotesk', family: 'Schibsted Grotesk', role: 'text', personality: ['grotesk', 'editorial', 'premium'], weights: '400–900' },
  { id: 'gloock', family: 'Gloock', role: 'display', personality: ['serif', 'high-contrast', 'luxury'], weights: '400' },
  { id: 'eb-garamond', family: 'EB Garamond', role: 'both', personality: ['serif', 'classic', 'bookish'], weights: '400–800' },
```
Check each `weights` against the downloaded file (the google/fonts `METADATA.pb` axes, or `fc-scan --format '%{weight}\n' kit/fonts/<id>.ttf`) and correct it if it differs.

- [ ] **Step 5: Run the test and the existing font specs**

Run: `cd apps/api && npx jest src/storefront-source/source-font-premium.spec.ts src/storefront-source/source-font-pairings.spec.ts --maxWorkers=2` → PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/storefront-kit/kit/fonts apps/api/src/storefront-source/source-font-catalog.ts apps/api/src/storefront-source/source-font-premium.spec.ts
git commit -m "feat(fonts): six premium OFL families for the master template"
```

---

### Task 3: Master manifest, theme and refill

**Files:**
- Modify: `packages/store-templates/index.js` (`TEMPLATE_CATEGORIES`, `validate`)
- Modify: `packages/store-templates/index.d.ts`
- Modify: `packages/store-templates/test/registry.test.mjs`
- Create: `apps/api/src/storefront-source/source-master.ts`
- Create: `apps/api/src/storefront-source/source-master.spec.ts`
- Modify: `apps/api/src/storefront-source/source-templates.ts` (`fillTemplatePhotos`, `templateStoreDataFile`, `assembleTemplateRevision`, `templateDemoRevision`, `CATEGORY_BUSINESS`; add `readMasterState`, `refillMasterFiles`)
- Modify: `apps/api/src/storefront-source/source-templates.service.ts` (`assemble`; add `applyMaster`, `refill`)
- Create: `apps/api/src/storefront-source/source-master-refill.spec.ts`

**Interfaces:**
- Produces (package): `TemplateManifest.master?: MasterSettings` with
  `MasterCopy = { announcement, eyebrow, headline, subcopy, primaryCta, secondaryCta, productsTitle, storyTitle, storyBody, values: [{title,text}×3], closingLine, closingCta, tagline }` (all strings),
  `MasterPalette = { id, name, paper, ink, muted, accent, deep }`, `MasterFontPair = { id, name, heading, body }`,
  `MasterSettings = { copy: MasterCopy; palettes: MasterPalette[] (8); fonts: MasterFontPair[] (8) }`; category `'general'`.
- Produces (api, `source-master.ts`): `MASTER_TEMPLATE_ID = 'esencial'`, `MASTER_COPY_CAPS`, `MASTER_VALUE_CAPS`, `MASTER_COLOURS`, `MasterColour`, `MasterLook = { palette: string; fonts: string; colors: Partial<Record<MasterColour,string>> }`, `MasterFill = { copy?: Partial<MasterCopy>; look?: Partial<MasterLook>; heroPhoto?: string | null; storyPhoto?: string | null }`, `masterCopy(settings, partial?) → MasterCopy`, `masterLook(settings, partial?) → MasterLook`, `masterColours(settings, look)`, `masterThemeCss(settings, look) → string`, `withMasterTheme(css, block) → string`, `masterDnaFonts(settings, look) → { display; text }`.
- Produces (api, `source-templates.ts`): `assembleTemplateRevision({ …, fill?: MasterFill, demoPhotos?: boolean })`, `fillTemplatePhotos(manifest, items, allowDemo = true)`, `readMasterState(files) → { store?; photos: Record<string,string>; copy?: MasterCopy; look?: MasterLook }`, `refillMasterFiles(files, manifest, change: MasterFill) → files`, `templateDemoRevision(manifest, source, fill?)`.
- Produces (service): `MasterFacts = { storeName: string; products: string[]; photos: string[] }`; `SourceTemplatesService.applyMaster(merchantId, storeId, revision, filler: (facts: MasterFacts) => Promise<MasterFill | null>) → Promise<{ revision; label; filled: boolean }>`; `SourceTemplatesService.refill(merchantId, storeId, revision, change: MasterFill, label: string)`.

- [ ] **Step 1: Write the failing package test**

Append to `packages/store-templates/test/registry.test.mjs`:
```js
const masterManifest = master => ({ id: 'base', name: 'Base', category: 'general', description: 'x', tags: [], sitePurpose: 'shop', order: 1, hidden: true, photos: [], master });
const palette = id => ({ id, name: id, paper: '#ffffff', ink: '#111111', muted: '#eeeeee', accent: '#aa3300', deep: '#222222' });
const pair = id => ({ id, name: id, heading: 'fraunces', body: 'geist' });
const eight = make => [1, 2, 3, 4, 5, 6, 7, 8].map(n => make(`p${n}`));
const copy = { announcement: '', eyebrow: 'e', headline: 'h', subcopy: 's', primaryCta: 'p', secondaryCta: 's', productsTitle: 't', storyTitle: 't', storyBody: 'b', values: [{ title: 'a', text: 'b' }, { title: 'a', text: 'b' }, { title: 'a', text: 'b' }], closingLine: 'c', closingCta: 'c', tagline: '' };
const writeManifest = manifest => { const root = mkdtempSync(join(tmpdir(), 'tpl-')); mkdirSync(join(root, 'base'), { recursive: true }); writeFileSync(join(root, 'base', 'template.json'), JSON.stringify(manifest)); return root; };

test('a master manifest with copy, eight palettes and eight font pairs loads', () => {
  const [{ manifest }] = templates.loadTemplates(writeManifest(masterManifest({ copy, palettes: eight(palette), fonts: eight(pair) })));
  assert.equal(manifest.master.palettes.length, 8);
  assert.equal(manifest.category, 'general');
});

test('a master palette with a colour that is not #rrggbb is rejected', () => {
  const palettes = eight(palette); palettes[3] = { ...palettes[3], accent: 'red' };
  assert.throws(() => templates.loadTemplates(writeManifest(masterManifest({ copy, palettes, fonts: eight(pair) }))), /base.*master palette p4/);
});

test('a master copy without three values is rejected', () => {
  assert.throws(() => templates.loadTemplates(writeManifest(masterManifest({ copy: { ...copy, values: [] }, palettes: eight(palette), fonts: eight(pair) }))), /base.*master\.copy\.values/);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd packages/store-templates && npm test` → the three new tests FAIL (`general` is not a category).

- [ ] **Step 3: Implement the manifest block**

In `packages/store-templates/index.js`: add `'general'` at the end of `TEMPLATE_CATEGORIES`. Add before `validate`:
```js
const HEX = /^#[0-9a-f]{6}$/i;
const MASTER_COPY_KEYS = ['announcement', 'eyebrow', 'headline', 'subcopy', 'primaryCta', 'secondaryCta', 'productsTitle', 'storyTitle', 'storyBody', 'closingLine', 'closingCta', 'tagline'];
function validateMaster(id, master) {
  if (!master || typeof master !== 'object') fail(id, 'master', 'must be an object');
  const copy = master.copy || {};
  for (const key of MASTER_COPY_KEYS) if (typeof copy[key] !== 'string') fail(id, `master.copy.${key}`, 'must be text');
  if (!Array.isArray(copy.values) || copy.values.length !== 3 || copy.values.some(v => !v || typeof v.title !== 'string' || typeof v.text !== 'string')) fail(id, 'master.copy.values', 'must be three { title, text }');
  if (!Array.isArray(master.palettes) || master.palettes.length !== 8) fail(id, 'master.palettes', 'must list eight palettes');
  for (const p of master.palettes) {
    if (!p || !SLOT.test(p.id) || typeof p.name !== 'string') fail(id, 'master.palettes', 'need an id and a name');
    for (const key of ['paper', 'ink', 'muted', 'accent', 'deep']) if (!HEX.test(p[key])) fail(id, `master palette ${p.id}`, `${key} must be #rrggbb`);
  }
  if (!Array.isArray(master.fonts) || master.fonts.length !== 8) fail(id, 'master.fonts', 'must list eight font pairs');
  for (const f of master.fonts) if (!f || !SLOT.test(f.id) || typeof f.name !== 'string' || !SLOT.test(f.heading) || !SLOT.test(f.body)) fail(id, 'master.fonts', 'need id, name, heading and body font ids');
}
```
In `validate`, after the `dna` check add `if (manifest.master !== undefined) validateMaster(id, manifest.master);` and include `...(manifest.master ? { master: Object.freeze(manifest.master) } : {})` in the returned object.

In `index.d.ts`: add `'general'` to `TemplateCategory`; add
```ts
export interface MasterValue { readonly title: string; readonly text: string }
export interface MasterCopy { readonly announcement: string; readonly eyebrow: string; readonly headline: string; readonly subcopy: string; readonly primaryCta: string; readonly secondaryCta: string; readonly productsTitle: string; readonly storyTitle: string; readonly storyBody: string; readonly values: readonly MasterValue[]; readonly closingLine: string; readonly closingCta: string; readonly tagline: string }
export interface MasterPalette { readonly id: string; readonly name: string; readonly paper: string; readonly ink: string; readonly muted: string; readonly accent: string; readonly deep: string }
export interface MasterFontPair { readonly id: string; readonly name: string; readonly heading: string; readonly body: string }
export interface MasterSettings { readonly copy: MasterCopy; readonly palettes: readonly MasterPalette[]; readonly fonts: readonly MasterFontPair[] }
```
and `readonly master?: MasterSettings;` in `TemplateManifest`.

In `apps/api/src/storefront-source/source-templates.ts` `CATEGORY_BUSINESS`, add `general: 'Tienda en línea'`.

- [ ] **Step 4: Run the package tests**

Run: `cd packages/store-templates && npm test` → PASS.

- [ ] **Step 5: Write the failing API unit tests**

`apps/api/src/storefront-source/source-master.spec.ts`:
```ts
import type { MasterSettings } from '@pagosya/store-templates';
import { masterColours, masterCopy, masterDnaFonts, masterLook, masterThemeCss, withMasterTheme, MASTER_THEME_START, MASTER_THEME_END } from './source-master';
import { contrastRatio } from './sketch/sketch-schema';

const values = [{ title: 'Uno', text: 'Primero' }, { title: 'Dos', text: 'Segundo' }, { title: 'Tres', text: 'Tercero' }];
const settings: MasterSettings = {
  copy: { announcement: '', eyebrow: 'Nueva colección', headline: 'Hecho con cuidado', subcopy: 'Sub', primaryCta: 'Ver la colección', secondaryCta: 'Nuestra historia', productsTitle: 'Productos', storyTitle: 'Historia', storyBody: 'Cuerpo', values, closingLine: 'Cierre', closingCta: 'Ver todo', tagline: '' },
  palettes: [{ id: 'terracotta', name: 'Terracota', paper: '#f6f1ea', ink: '#1f1a17', muted: '#ede6dc', accent: '#b8553a', deep: '#2b211c' }, { id: 'gold', name: 'Oro', paper: '#141210', ink: '#f2ece2', muted: '#1e1b18', accent: '#c9a45c', deep: '#0b0a09' }],
  fonts: [{ id: 'classic', name: 'Clásica', heading: 'cormorant-garamond', body: 'dm-sans' }, { id: 'modern', name: 'Moderna', heading: 'fraunces', body: 'geist' }],
};

describe('masterCopy', () => {
  it('keeps defaults for missing or blank fields and clips to the caps', () => {
    const copy = masterCopy(settings, { headline: '  ' + 'x'.repeat(200), subcopy: '' });
    expect(copy.headline).toHaveLength(70);
    expect(copy.subcopy).toBe('Sub');
    expect(copy.eyebrow).toBe('Nueva colección');
  });
  it('lets the announcement and tagline be empty on purpose', () => {
    expect(masterCopy({ ...settings, copy: { ...settings.copy, announcement: 'Envío gratis' } }, { announcement: '' }).announcement).toBe('');
  });
  it('always has three values, filling the missing ones from the defaults', () => {
    expect(masterCopy(settings, { values: [{ title: 'Propio', text: 'Texto' }] as any }).values).toEqual([{ title: 'Propio', text: 'Texto' }, values[1], values[2]]);
  });
});

describe('masterLook', () => {
  it('falls back to the first palette and pair for unknown ids and drops colours that are not #rrggbb', () => {
    expect(masterLook(settings, { palette: 'nope', fonts: 'nope', colors: { accent: 'red', paper: '#FFFFFF' } })).toEqual({ palette: 'terracotta', fonts: 'classic', colors: { paper: '#ffffff' } });
  });
});

describe('masterColours', () => {
  it('corrects unreadable custom ink', () => {
    const colours = masterColours(settings, { palette: 'terracotta', fonts: 'classic', colors: { paper: '#ffff33', ink: '#ffffff' } });
    expect(contrastRatio(colours.paper, colours.ink)).toBeGreaterThanOrEqual(4.5);
  });
  it('picks a readable text colour on the accent', () => {
    const colours = masterColours(settings, { palette: 'gold', fonts: 'classic', colors: {} });
    expect(contrastRatio(colours.accent, colours.onAccent)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('masterThemeCss', () => {
  it('declares both fonts from the kit catalogue and every colour variable', () => {
    const css = masterThemeCss(settings, masterLook(settings, { fonts: 'modern' }));
    expect(css.startsWith(MASTER_THEME_START)).toBe(true);
    expect(css.endsWith(MASTER_THEME_END)).toBe(true);
    expect(css).toContain('src:url(assets/fraunces.ttf)');
    expect(css).toContain('src:url(assets/geist.ttf)');
    expect(css).toMatch(/--es-heading:'Fraunces'/);
    for (const name of ['paper', 'ink', 'muted', 'accent', 'deep', 'on-accent', 'on-deep']) expect(css).toContain(`--es-${name}:#`);
  });
  it('maps the pair onto the kit DNA fonts', () => {
    expect(masterDnaFonts(settings, masterLook(settings, { fonts: 'modern' }))).toEqual({ display: 'fraunces', text: 'geist' });
  });
});

describe('withMasterTheme', () => {
  it('replaces an existing block and prepends a missing one, idempotently', () => {
    const block = `${MASTER_THEME_START}\n:root{--es-paper:#000000}\n${MASTER_THEME_END}`;
    const once = withMasterTheme('body{margin:0}', block);
    expect(once).toBe(`${block}\nbody{margin:0}`);
    expect(withMasterTheme(once, block)).toBe(once);
    expect(withMasterTheme(once, block.replace('#000000', '#ffffff'))).toContain('--es-paper:#ffffff');
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `cd apps/api && npx jest src/storefront-source/source-master.spec.ts` → FAIL (module not found).

- [ ] **Step 7: Implement `source-master.ts`**

```ts
/** Spec 2026-10-19 master template: the copy, look and theme a master template (manifest.master) is filled with.
 *  Pure; the template apply and the content edits (source-templates.ts) both use it. */
import type { MasterCopy, MasterSettings } from '@pagosya/store-templates';
import { SOURCE_FONT_CATALOG } from './source-font-catalog';
import { bestInkFor, contrastRatio } from './sketch/sketch-schema';

export const MASTER_TEMPLATE_ID = 'esencial';
export const MASTER_THEME_START = '/* pagosya:master-theme */';
export const MASTER_THEME_END = '/* pagosya:master-theme:end */';
export const MASTER_COPY_CAPS = { announcement: 90, eyebrow: 40, headline: 70, subcopy: 160, primaryCta: 28, secondaryCta: 28, productsTitle: 50, storyTitle: 60, storyBody: 420, closingLine: 80, closingCta: 28, tagline: 90 } as const;
export const MASTER_VALUE_CAPS = { title: 40, text: 140 } as const;
/** Fields a merchant may leave empty on purpose: the bar and the footer line are then not shown. */
const OPTIONAL = new Set(['announcement', 'tagline']);
const HEX = /^#[0-9a-f]{6}$/i;

export type MasterColour = 'paper' | 'ink' | 'muted' | 'accent' | 'deep';
export const MASTER_COLOURS: readonly MasterColour[] = ['paper', 'ink', 'muted', 'accent', 'deep'];
export type MasterLook = { palette: string; fonts: string; colors: Partial<Record<MasterColour, string>> };
export type MasterFill = { copy?: Partial<MasterCopy>; look?: Partial<MasterLook>; heroPhoto?: string | null; storyPhoto?: string | null };

const clip = (value: unknown, max: number) => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max).trim() : undefined;

export function masterCopy(settings: MasterSettings, partial: Partial<MasterCopy> = {}): MasterCopy {
  const base = settings.copy;
  const text = Object.fromEntries((Object.keys(MASTER_COPY_CAPS) as Array<keyof typeof MASTER_COPY_CAPS>).map(key => {
    const value = clip(partial[key], MASTER_COPY_CAPS[key]);
    return [key, value === undefined || (!value && !OPTIONAL.has(key)) ? base[key] : value];
  })) as Omit<MasterCopy, 'values'>;
  const given = Array.isArray(partial.values) ? partial.values : [];
  const values = base.values.map((fallback, index) => {
    const title = clip(given[index]?.title, MASTER_VALUE_CAPS.title);
    const body = clip(given[index]?.text, MASTER_VALUE_CAPS.text);
    return title && body ? { title, text: body } : { title: fallback.title, text: fallback.text };
  });
  return { ...text, values };
}

export function masterLook(settings: MasterSettings, partial: Partial<MasterLook> = {}): MasterLook {
  const palette = settings.palettes.some(p => p.id === partial.palette) ? partial.palette! : settings.palettes[0].id;
  const fonts = settings.fonts.some(f => f.id === partial.fonts) ? partial.fonts! : settings.fonts[0].id;
  const colors: Partial<Record<MasterColour, string>> = {};
  for (const key of MASTER_COLOURS) { const value = partial.colors?.[key]; if (typeof value === 'string' && HEX.test(value)) colors[key] = value.toLowerCase(); }
  return { palette, fonts, colors };
}

/** The palette with the merchant's own colours over it; text is always readable on paper, accent and deep. */
export function masterColours(settings: MasterSettings, look: MasterLook) {
  const base = settings.palettes.find(p => p.id === look.palette) ?? settings.palettes[0];
  const merged = { paper: base.paper, ink: base.ink, muted: base.muted, accent: base.accent, deep: base.deep, ...look.colors };
  const ink = contrastRatio(merged.paper, merged.ink) >= 4.5 ? merged.ink : bestInkFor(merged.paper, merged.ink);
  return { ...merged, ink, onAccent: bestInkFor(merged.accent, '#ffffff'), onDeep: bestInkFor(merged.deep, '#ffffff') };
}

const catalogFont = (id: string) => {
  const font = SOURCE_FONT_CATALOG.find(entry => entry.id === id);
  if (!font) throw new TypeError(`La fuente ${id} no está en el catálogo de pagosYa.`);
  return font;
};
const face = (id: string) => { const font = catalogFont(id); return `@font-face{font-family:'${font.family}';src:url(assets/${font.id}.ttf) format('truetype');font-weight:${font.weights.replace('–', ' ')};font-display:swap}`; };

export function masterThemeCss(settings: MasterSettings, look: MasterLook): string {
  const pair = settings.fonts.find(f => f.id === look.fonts) ?? settings.fonts[0];
  const c = masterColours(settings, look);
  const vars = `:root{--es-paper:${c.paper};--es-ink:${c.ink};--es-muted:${c.muted};--es-accent:${c.accent};--es-deep:${c.deep};--es-on-accent:${c.onAccent};--es-on-deep:${c.onDeep};`
    + `--es-heading:'${catalogFont(pair.heading).family}',Georgia,serif;--es-body:'${catalogFont(pair.body).family}',system-ui,sans-serif;`
    + `--store-background:var(--es-paper);--store-foreground:var(--es-ink);--store-accent:var(--es-accent);--store-accent-foreground:var(--es-on-accent)}`;
  return [MASTER_THEME_START, face(pair.heading), pair.body !== pair.heading ? face(pair.body) : '', vars, MASTER_THEME_END].filter(Boolean).join('\n');
}

export function withMasterTheme(css: string, block: string): string {
  const start = css.indexOf(MASTER_THEME_START);
  const end = css.indexOf(MASTER_THEME_END);
  if (start !== -1 && end > start) return css.slice(0, start) + block + css.slice(end + MASTER_THEME_END.length);
  return `${block}\n${css}`;
}

export function masterDnaFonts(settings: MasterSettings, look: MasterLook) {
  const pair = settings.fonts.find(f => f.id === look.fonts) ?? settings.fonts[0];
  return { display: pair.heading, text: pair.body };
}
```
`bestInkFor`/`contrastRatio` (`sketch/sketch-schema.ts:155`) take `#rrggbb` strings; when no candidate reaches 4.5, `bestInkFor` returns the best available, which is accepted.

- [ ] **Step 8: Run it to verify it passes**

Run: `cd apps/api && npx jest src/storefront-source/source-master.spec.ts` → PASS.

- [ ] **Step 9: Write the failing assembly/refill tests**

`apps/api/src/storefront-source/source-master-refill.spec.ts`:
```ts
import type { MasterSettings, TemplateManifest } from '@pagosya/store-templates';
import { fillTemplatePhotos, readMasterState, refillMasterFiles, templateStoreDataFile, TEMPLATE_STORE_DATA_PATH } from './source-templates';
import { MASTER_THEME_START, MASTER_THEME_END, masterCopy, masterLook } from './source-master';

const values = [{ title: 'Uno', text: 'Primero' }, { title: 'Dos', text: 'Segundo' }, { title: 'Tres', text: 'Tercero' }];
const master: MasterSettings = {
  copy: { announcement: '', eyebrow: 'Nueva', headline: 'Hecho con cuidado', subcopy: 'Sub', primaryCta: 'Ver', secondaryCta: 'Historia', productsTitle: 'Productos', storyTitle: 'Historia', storyBody: 'Cuerpo', values, closingLine: 'Cierre', closingCta: 'Ver todo', tagline: '' },
  palettes: [{ id: 'terracotta', name: 'Terracota', paper: '#f6f1ea', ink: '#1f1a17', muted: '#ede6dc', accent: '#b8553a', deep: '#2b211c' }, { id: 'sage', name: 'Salvia', paper: '#eef0ea', ink: '#1a211c', muted: '#e1e6dd', accent: '#2f5d46', deep: '#1f3a2e' }],
  fonts: [{ id: 'classic', name: 'Clásica', heading: 'cormorant-garamond', body: 'dm-sans' }, { id: 'modern', name: 'Moderna', heading: 'fraunces', body: 'geist' }],
};
const manifest = { id: 'esencial', name: 'Esencial', category: 'general', description: 'x', tags: [], sitePurpose: 'shop', order: 0, hidden: true, master,
  photos: [{ slot: 'hero', role: 'hero', demo: 'hero.jpg' }, { slot: 'story', role: 'lifestyle', demo: 'story.jpg' }] } as unknown as TemplateManifest;

const storeFiles = () => [
  templateStoreDataFile({ name: 'Café Buna', tagline: '', city: 'La Paz' }, { hero: 'https://x/h.jpg', story: '' }, { copy: masterCopy(master), look: masterLook(master) }),
  { path: 'styles/globals.css', content: `${MASTER_THEME_START}\n:root{}\n${MASTER_THEME_END}\nbody{margin:0}` },
  { path: 'config.js', content: `window.PAGOSYA_CONFIG = ${JSON.stringify({ dna: { display: 'cormorant-garamond', text: 'dm-sans', button: 'pill' }, data: {} })};\n` },
];

describe('master store data', () => {
  it('no demo photo reaches a store without photos', () => {
    const { photos, demoSlots } = fillTemplatePhotos(manifest, [], false);
    expect(photos).toEqual({ hero: '', story: '' });
    expect(demoSlots).toEqual([]);
  });

  it('round-trips copy, look and photos through store-data', () => {
    const state = readMasterState(storeFiles());
    expect(state.copy?.headline).toBe('Hecho con cuidado');
    expect(state.look).toEqual({ palette: 'terracotta', fonts: 'classic', colors: {} });
    expect(state.photos.hero).toBe('https://x/h.jpg');
  });

  it('refill changes only what was asked and moves the kit DNA fonts with the pair', () => {
    const files = refillMasterFiles(storeFiles(), manifest, { copy: { headline: 'Café de altura' }, look: { fonts: 'modern' } });
    const state = readMasterState(files);
    expect(state.copy?.headline).toBe('Café de altura');
    expect(state.copy?.subcopy).toBe('Sub');
    expect(state.look?.palette).toBe('terracotta');
    expect(files.find(f => f.path === 'styles/globals.css')!.content).toContain('assets/geist.ttf');
    expect(files.find(f => f.path === 'config.js')!.content).toContain('"display":"fraunces"');
    expect(files.find(f => f.path === 'config.js')!.content).toContain('"button":"pill"');
  });

  it('refill restores a deleted theme block and survives a missing copy line', () => {
    const files = storeFiles().map(f => f.path === 'styles/globals.css' ? { ...f, content: 'body{margin:0}' }
      : f.path === TEMPLATE_STORE_DATA_PATH ? { ...f, content: f.content.replace(/^export const copy = .*$/m, '') } : f);
    const out = refillMasterFiles(files, manifest, { look: { palette: 'sage' } });
    expect(out.find(f => f.path === 'styles/globals.css')!.content.startsWith(MASTER_THEME_START)).toBe(true);
    expect(readMasterState(out).copy?.headline).toBe('Hecho con cuidado');
  });
});
```

- [ ] **Step 10: Run it to verify it fails**

Run: `cd apps/api && npx jest src/storefront-source/source-master-refill.spec.ts` → FAIL (exports missing).

- [ ] **Step 11: Implement the source-templates changes**

In `source-templates.ts`:

1. Imports: `import type { MasterCopy } from '@pagosya/store-templates';` and `import { masterCopy, masterDnaFonts, masterLook, masterThemeCss, withMasterTheme, type MasterFill, type MasterLook } from './source-master';`
2. `fillTemplatePhotos(manifest, items, allowDemo = true)`: change the demo fallback to `photos[slot] = allowDemo ? templateDemoPath(manifest, slot) : '';`.
3. Replace `templateStoreDataFile` with:
```ts
export function templateStoreDataFile(store: { name: string; tagline?: string; city?: string; logo?: string; phone?: string }, photos: Record<string, string>, master?: { copy: MasterCopy; look: MasterLook }): SourceProjectFileDto {
  const data = { name: store.name, tagline: store.tagline ?? '', city: store.city ?? '', logo: store.logo ?? '', phone: store.phone ?? '' };
  return {
    path: TEMPLATE_STORE_DATA_PATH,
    content: `// Written by pagosYa when the template is applied. Edit the store's name and photos in the Studio.\n`
      + `export const store = ${JSON.stringify(data)} as const;\n`
      + `export const photos: Record<string, string> = ${JSON.stringify(photos)};\n`
      + (master ? `export const copy = ${JSON.stringify(master.copy)} as const;\nexport const look = ${JSON.stringify(master.look)} as const;\n` : ''),
  };
}
```
4. Add the reader and the refill:
```ts
const dataLine = (content: string, name: string) => {
  const match = content.match(new RegExp(`^export const ${name}(?:: [^=]+)? = (.*?)(?: as const)?;$`, 'm'));
  try { return match ? JSON.parse(match[1]) : undefined; } catch { return undefined; }
};

/** What a master store's store-data says now (spec 2026-10-19 §3.1): the content edits start from it. */
export function readMasterState(files: readonly SourceProjectFileDto[]) {
  const content = files.find(file => file.path === TEMPLATE_STORE_DATA_PATH)?.content ?? '';
  return {
    store: dataLine(content, 'store') as { name: string; tagline?: string; city?: string; logo?: string; phone?: string } | undefined,
    photos: (dataLine(content, 'photos') ?? {}) as Record<string, string>,
    copy: dataLine(content, 'copy') as MasterCopy | undefined,
    look: dataLine(content, 'look') as MasterLook | undefined,
  };
}

/** A content edit: new store-data, theme block and DNA fonts; components and every other file untouched. */
export function refillMasterFiles(files: SourceProjectFileDto[], manifest: TemplateManifest, change: MasterFill): SourceProjectFileDto[] {
  const settings = manifest.master;
  if (!settings) throw new TypeError(`Plantilla ${manifest.id}: no es una plantilla base.`);
  const state = readMasterState(files);
  const copy = masterCopy(settings, { ...(state.copy ?? {}), ...(change.copy ?? {}) });
  const look = masterLook(settings, { ...(state.look ?? {}), ...(change.look ?? {}), colors: { ...(state.look?.colors ?? {}), ...(change.look?.colors ?? {}) } });
  const photos = { ...state.photos, ...(change.heroPhoto !== undefined ? { hero: change.heroPhoto ?? '' } : {}), ...(change.storyPhoto !== undefined ? { story: change.storyPhoto ?? '' } : {}) };
  const theme = masterThemeCss(settings, look);
  return files.map(file => {
    if (file.path === TEMPLATE_STORE_DATA_PATH) return templateStoreDataFile(state.store ?? { name: '' }, photos, { copy, look });
    if (file.path === 'styles/globals.css') return { ...file, content: withMasterTheme(file.content, theme) };
    if (file.path === 'config.js') {
      const match = file.content.match(/^\s*window\.PAGOSYA_CONFIG\s*=\s*([\s\S]*?);?\s*$/);
      if (!match) return file;
      const config = JSON.parse(match[1]);
      return { ...file, content: `window.PAGOSYA_CONFIG = ${JSON.stringify({ ...config, dna: { ...config.dna, ...masterDnaFonts(settings, look) } })};\n` };
    }
    return file;
  });
}
```
5. `assembleTemplateRevision` input gains `fill?: MasterFill; demoPhotos?: boolean`. Replace its `fillTemplatePhotos`/`storeData`/`authored` lines with:
```ts
  const settings = manifest.master;
  const filled = fillTemplatePhotos(manifest, data.items, input.demoPhotos !== false);
  const photos = { ...filled.photos,
    ...(settings && input.fill?.heroPhoto !== undefined ? { hero: input.fill.heroPhoto ?? '' } : {}),
    ...(settings && input.fill?.storyPhoto !== undefined ? { story: input.fill.storyPhoto ?? '' } : {}) };
  const demoSlots = filled.demoSlots.filter(slot => photos[slot] === templateDemoPath(manifest, slot));
  const copy = settings ? masterCopy(settings, input.fill?.copy) : undefined;
  const look = settings ? masterLook(settings, input.fill?.look) : undefined;
  const storeData = templateStoreDataFile({ name: data.storeName, tagline: data.tagline ?? '', city: (data.locations as Array<{ city?: string | null }> | undefined)?.[0]?.city ?? '',
    logo: (data as { logoUrl?: string | null }).logoUrl ?? '', phone: (data as { contactPhone?: string | null }).contactPhone ?? '' }, photos, settings ? { copy: copy!, look: look! } : undefined);
  const themed = (file: SourceProjectFileDto) => settings && file.path === 'styles/globals.css' ? { ...file, content: withMasterTheme(file.content, masterThemeCss(settings, look!)) } : file;
  const authored = [...input.source.filter(file => file.path !== TEMPLATE_STORE_DATA_PATH).map(themed), ...contentPagesFor(input.source), storeData];
```
Read the exact logo and phone field names off `sourceStoreConfigData`'s return in `source-store-config.ts`; use those names instead of the casts if they differ. The config `dna:` line becomes `dna: { ...templateDna(manifest, input.storeId), ...(settings ? masterDnaFonts(settings, look!) : {}) },`.
6. `templateDemoRevision(manifest, source, fill?: MasterFill)` passes `fill` into `assembleTemplateRevision`.

In `source-templates.service.ts`, give `assemble` a trailing `fill?: MasterFill` parameter and pass `fill, demoPhotos: !manifest.master` to `assembleTemplateRevision`. Then add:
```ts
export type MasterFacts = { storeName: string; products: string[]; photos: string[] };

  /** Spec 2026-10-19 §2: the master template applied to a new store and filled in one call; the store is saved even when
   *  the filler fails. The filler sees what the apply sees: the store's name, product names and photos. */
  async applyMaster(merchantId: string, storeId: string, revision: number, filler: (facts: MasterFacts) => Promise<MasterFill | null>) {
    const manifest = this.registry.templateManifest(MASTER_TEMPLATE_ID);
    if (!manifest?.master) throw new NotFoundException('La plantilla base no está disponible.');
    const current = await this.projects.current(merchantId, storeId);
    const publicStore = await this.publicStores.getStorePublic(current.slug, { trackView: false, ownerMerchantId: merchantId });
    const facts: MasterFacts = { storeName: publicStore.storeName, products: publicStore.items.map(item => item.name), photos: [...new Set(publicStore.items.flatMap(item => item.imageUrls ?? []))] };
    const fill = await filler(facts).catch(() => null);
    const { assembled } = await this.assemble(merchantId, storeId, MASTER_TEMPLATE_ID, revision, fill ?? undefined);
    const saved = await this.projects.save(merchantId, storeId, { revision, ...assembled, brief: { ...assembled.brief, templateRevision: revision + 1 } });
    if (revision === 0) await this.prisma.store.update({ where: { id: storeId }, data: { checkoutMode: 'payment' } });
    return { ...saved, filled: Boolean(fill) };
  }

  /** Spec 2026-10-19 §3.1: a content edit on a master store — data and theme only, as a new revision. */
  async refill(merchantId: string, storeId: string, revision: number, change: MasterFill, label: string) {
    const previous = await this.projects.version(merchantId, storeId, revision);
    const snapshot = previous.snapshot as unknown as SourceProjectSnapshot;
    const manifest = snapshot.brief?.templateId ? this.registry.templateManifest(snapshot.brief.templateId) : undefined;
    if (!manifest?.master) throw new BadRequestException('Esta tienda no usa la plantilla base.');
    return this.projects.save(merchantId, storeId, { revision, label, brief: snapshot.brief, files: refillMasterFiles(snapshot.files, manifest, change) });
  }
```
Imports: `BadRequestException` from `@nestjs/common`; `MASTER_TEMPLATE_ID, type MasterFill` from `./source-master`; `refillMasterFiles` from `./source-templates`. `publicStore.items` fields (`name`, `imageUrls`) match `templateDemoPublicStore` in `source-templates.ts`.

- [ ] **Step 12: Run the tests**

Run: `cd apps/api && npx jest src/storefront-source/source-master.spec.ts src/storefront-source/source-master-refill.spec.ts src/storefront-source/source-templates.service.spec.ts --maxWorkers=2` → PASS.

- [ ] **Step 13: Commit**

```bash
git add packages/store-templates/index.js packages/store-templates/index.d.ts packages/store-templates/test/registry.test.mjs apps/api/src/storefront-source/source-master.ts apps/api/src/storefront-source/source-master.spec.ts apps/api/src/storefront-source/source-master-refill.spec.ts apps/api/src/storefront-source/source-templates.ts apps/api/src/storefront-source/source-templates.service.ts
git commit -m "feat(templates): master manifest block, theme, store-data copy and refill"
```

---

### Task 4: Lucide icons for templates

**Files:**
- Create: `packages/store-templates/tools/lucide-icons.mjs`
- Create (generated): `packages/store-templates/templates/esencial/components/icons.tsx`
- Create: `packages/store-templates/test/lucide-icons.test.mjs`

**Interfaces:**
- Produces: `icons.tsx` exporting `IconMenu, IconX, IconSearch, IconLogIn, IconShoppingBag, IconArrowRight, IconArrowUpRight, IconPlus, IconMinus, IconChevronDown, IconStar, IconTruck, IconShieldCheck, IconRefreshCcw, IconMessageCircle, IconMapPin, IconMail` — each `({ className }: { className?: string }) => JSX.Element`, 24×24 viewBox, stroke 1.5, `aria-hidden="true"`.

- [ ] **Step 1: Write the failing test**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, '../../../apps/api/package.json'));
const lucideDir = join(dirname(require.resolve('lucide-static/package.json')), 'icons');
const icons = readFileSync(join(here, '../templates/esencial/components/icons.tsx'), 'utf8');

// Spec 2026-10-19 §1.6: Esencial's icons are Lucide's own paths, unchanged.
test('every generated icon carries the exact Lucide geometry', () => {
  for (const [component, file] of [['IconShoppingBag', 'shopping-bag'], ['IconMenu', 'menu'], ['IconLogIn', 'log-in'], ['IconSearch', 'search']]) {
    const start = icons.indexOf(`export function ${component}(`);
    assert.ok(start >= 0, `${component} is missing`);
    const block = icons.slice(start, icons.indexOf('</svg>', start));
    for (const d of [...readFileSync(join(lucideDir, `${file}.svg`), 'utf8').matchAll(/ d="([^"]+)"/g)].map(m => m[1])) assert.ok(block.includes(`d="${d}"`), `${component} misses ${d}`);
  }
});

test('icons are thin, decorative and credit Lucide', () => {
  assert.match(icons, /Lucide.*ISC/);
  assert.doesNotMatch(icons, /strokeWidth=\{2\}/);
  assert.match(icons, /strokeWidth=\{1\.5\}/);
  assert.match(icons, /aria-hidden="true"/);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd packages/store-templates && node --test test/lucide-icons.test.mjs` → FAIL (file missing).

- [ ] **Step 3: Write the generator**

```js
// Writes a template's components/icons.tsx from lucide-static (ISC). Usage: node tools/lucide-icons.mjs <template-id>
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, '../../../apps/api/package.json'));
const dir = join(dirname(require.resolve('lucide-static/package.json')), 'icons');
const version = JSON.parse(readFileSync(join(dir, '..', 'package.json'), 'utf8')).version;
const ICONS = ['menu', 'x', 'search', 'log-in', 'shopping-bag', 'arrow-right', 'arrow-up-right', 'plus', 'minus', 'chevron-down', 'star', 'truck', 'shield-check', 'refresh-ccw', 'message-circle', 'map-pin', 'mail'];
const pascal = name => name.split('-').map(part => part[0].toUpperCase() + part.slice(1)).join('');
const camel = attrs => attrs.replace(/ ([a-z]+)-([a-z])/g, (_, a, b) => ` ${a}${b.toUpperCase()}`);
const children = svg => camel(svg.slice(svg.indexOf('>', svg.indexOf('<svg')) + 1, svg.lastIndexOf('</svg>')).split('\n').map(line => line.trim()).filter(Boolean).join(''));

const template = process.argv[2];
if (!/^[a-z0-9-]+$/.test(template || '')) throw new Error('usage: lucide-icons.mjs <template-id>');
const body = ICONS.map(name => `export function Icon${pascal(name)}({ className }: { className?: string }) {\n  return <svg className={className} viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">${children(readFileSync(join(dir, `${name}.svg`), 'utf8'))}</svg>;\n}`).join('\n\n');
writeFileSync(join(here, '..', 'templates', template, 'components', 'icons.tsx'), `// Generated by tools/lucide-icons.mjs from lucide-static ${version} — Lucide Icons, ISC License (https://lucide.dev/license). Do not edit.\n\n${body}\n`);
console.log(`${ICONS.length} icons → templates/${template}/components/icons.tsx`);
```

- [ ] **Step 4: Generate and run the test**

```bash
cd packages/store-templates && mkdir -p templates/esencial/components && node tools/lucide-icons.mjs esencial && node --test test/lucide-icons.test.mjs
```
Expected: PASS. (The registry ignores `templates/esencial` until Task 5 adds `template.json`.)

- [ ] **Step 5: Commit**

```bash
git add packages/store-templates/tools/lucide-icons.mjs packages/store-templates/templates/esencial/components/icons.tsx packages/store-templates/test/lucide-icons.test.mjs
git commit -m "feat(templates): Lucide icon generator for template components"
```

---

### Task 5: The Esencial template

**Files:**
- Create: `packages/store-templates/templates/esencial/template.json`
- Create: `packages/store-templates/templates/esencial/components/{Shell,home,product,checkout}.tsx`
- Create: `packages/store-templates/templates/esencial/styles/globals.css`
- Create: `packages/store-templates/templates/esencial/demo/{hero,story,p1,p2,p3,p4}.jpg` (≤ 600 KB each)
- Create: `packages/store-templates/test/esencial.test.mjs`
- Create: `apps/api/src/storefront-source/source-master-esencial.spec.ts`

**Interfaces:**
- Consumes: Task 3 `master` block and the `store`, `photos`, `copy`, `look` exports of `./store-data`; Task 4 icons; kit `Parallax`/`Reveal`/`KitSlot`/`ProductPageTemplate` from `@pagosya/ui` (`packages/storefront-kit/kit/ui.tsx`).
- Produces: template `esencial` with photo slots `hero` (hero), `story` (lifestyle), `p1`–`p4` (product); palette ids `terracotta, olive, mono, sand, sage, plum, navy, noir`; font-pair ids `classic, modern, editorial, literary, luxury, gallery, heritage, caslon`.

- [ ] **Step 1: Write the failing tests**

`packages/store-templates/test/esencial.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const templates = require('../index.js');
const esencial = templates.templateManifest('esencial');
const source = templates.templateSourceFiles('esencial');
const file = path => source.find(f => f.path === path)?.content ?? '';

test('esencial is the hidden master template', () => {
  assert.equal(esencial.hidden, true);
  assert.equal(esencial.master.palettes.length, 8);
  assert.equal(esencial.master.fonts.length, 8);
  assert.deepEqual(esencial.photos.map(p => p.slot), ['hero', 'story', 'p1', 'p2', 'p3', 'p4']);
  assert.ok(!templates.galleryTemplates().some(t => t.id === 'esencial'));
});

test('no emoji and no icon outside icons.tsx', () => {
  for (const { path, content } of source) {
    assert.doesNotMatch(content, /\p{Extended_Pictographic}/u, `${path} has an emoji`);
    if (path !== 'components/icons.tsx') assert.doesNotMatch(content, /<svg/, `${path} draws its own icon`);
  }
});

test('every merchant-visible sentence comes from store-data', () => {
  const home = file('components/home.tsx');
  for (const field of ['eyebrow', 'headline', 'subcopy', 'primaryCta', 'secondaryCta', 'productsTitle', 'storyTitle', 'storyBody', 'closingLine', 'closingCta']) assert.match(home, new RegExp(`copy\\.${field}\\b`), `home misses copy.${field}`);
  assert.match(home, /copy\.values\.map/);
  assert.match(file('components/Shell.tsx'), /copy\.announcement/);
});

test('headings never break words anywhere and the theme block is platform-written', () => {
  const css = file('styles/globals.css');
  assert.doesNotMatch(css, /overflow-wrap:\s*anywhere/);
  assert.doesNotMatch(css, /pagosya:master-theme/);
  for (const name of ['paper', 'ink', 'muted', 'accent', 'deep', 'on-accent', 'heading', 'body']) assert.match(css, new RegExp(`var\\(--es-${name}\\)`));
});
```

`apps/api/src/storefront-source/source-master-esencial.spec.ts`:
```ts
import { templateManifest, templateSourceFiles } from '@pagosya/store-templates';
import { assembleTemplateRevision, templateDemoPublicStore, templateDemoRevision } from './source-templates';
import { SourceProjectsService } from './source-projects.service';
import { withVisualSandbox } from './source-visual-capture';
import { SOURCE_FONT_CATALOG } from './source-font-catalog';

jest.setTimeout(240_000);
const manifest = templateManifest('esencial')!;
const prepare = (assembled: { files: any[]; brief: any; label: string }) => new SourceProjectsService({} as any).prepare({ revision: 0, ...assembled });
const readAt = (snapshot: any, width: number) => withVisualSandbox(snapshot, '', undefined, false, async context => {
  const page = await context.newPage();
  await page.setViewportSize({ width, height: 900 });
  await page.goto('https://preview.invalid/index.html', { waitUntil: 'load', timeout: 12000 });
  await page.evaluate(async () => { await document.fonts.ready; });
  const read = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, plain: Boolean(document.querySelector('.es-hero--plain')) }));
  await page.close();
  return read;
});
const assemble = (publicStore: any, extra: Record<string, unknown> = {}) => assembleTemplateRevision({ manifest, source: templateSourceFiles('esencial'), storeId: 's1', slug: 's1', publicStore, apiUrl: new URL('https://api.pagosya.test/v1'), firstRevision: true, ...extra });

describe('Esencial', () => {
  it('every font pair uses catalogued OFL fonts', () => {
    for (const pair of manifest.master!.fonts) for (const id of [pair.heading, pair.body]) expect(SOURCE_FONT_CATALOG.some(font => font.id === id)).toBe(true);
  });

  it('renders with no products and no hero photo, without demo photos', async () => {
    const assembled = await assemble({ ...templateDemoPublicStore(), items: [] }, { demoPhotos: false });
    expect(assembled.files.some(file => file.path.startsWith('assets/template-esencial-'))).toBe(false);
    const read = await readAt(await prepare(assembled), 390);
    expect(read.plain).toBe(true);
    expect(read.overflow).toBeLessThanOrEqual(0);
  });

  it('long name and headline fit a phone', async () => {
    const assembled = await assemble({ ...templateDemoPublicStore(), storeName: 'Mochilas y Accesorios de Cuero Artesanal Hechos a Mano en Sucre' },
      { fill: { copy: { headline: 'Mochilas de cuero artesanal hechas a mano para toda la vida en Bolivia' } } });
    const snapshot = await prepare(assembled);
    for (const width of [390, 768, 1280]) expect((await readAt(snapshot, width)).overflow).toBeLessThanOrEqual(0);
  });

  it('carries the chosen pair into the theme block and the kit DNA', async () => {
    const assembled = await templateDemoRevision(manifest, templateSourceFiles('esencial'), { look: { palette: 'sage', fonts: 'literary' } });
    const snapshot = await prepare(assembled);
    expect(assembled.files.find(f => f.path === 'styles/globals.css')!.content).toContain('assets/newsreader.ttf');
    expect(assembled.files.find(f => f.path === 'config.js')!.content).toContain('"display":"newsreader"');
    expect(snapshot.files.some((f: { path: string }) => f.path === 'assets/hanken-grotesk.ttf')).toBe(true);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd packages/store-templates && node --test test/esencial.test.mjs` → FAIL (no manifest).

- [ ] **Step 3: Write `template.json`**

```json
{
  "id": "esencial",
  "name": "Esencial",
  "category": "general",
  "description": "La tienda base de pagosYa: foto a pantalla completa, catálogo claro, historia y valores. Tranquila y profesional.",
  "tags": ["base", "profesional", "tranquilo"],
  "sitePurpose": "shop",
  "order": 0,
  "hidden": true,
  "dna": { "case": "none", "radius": "soft", "border": "hairline", "button": "pill", "hover": "lift", "press": "sink", "motion": "calm", "cart": "drawer", "added": "toast", "card": "second-photo", "frame": "bleed" },
  "photos": [
    { "slot": "hero", "role": "hero", "demo": "hero.jpg" },
    { "slot": "story", "role": "lifestyle", "demo": "story.jpg" },
    { "slot": "p1", "role": "product", "demo": "p1.jpg" },
    { "slot": "p2", "role": "product", "demo": "p2.jpg" },
    { "slot": "p3", "role": "product", "demo": "p3.jpg" },
    { "slot": "p4", "role": "product", "demo": "p4.jpg" }
  ],
  "master": {
    "copy": {
      "announcement": "",
      "eyebrow": "Nueva colección",
      "headline": "Hecho con cuidado, pensado para ti",
      "subcopy": "Descubre nuestra selección y pide en pocos minutos.",
      "primaryCta": "Ver la colección",
      "secondaryCta": "Nuestra historia",
      "productsTitle": "Nuestros productos",
      "storyTitle": "Nuestra historia",
      "storyBody": "Somos un emprendimiento que elige con cuidado cada producto que ofrece.",
      "values": [
        { "title": "Selección propia", "text": "Elegimos uno por uno lo que ofrecemos." },
        { "title": "Compra simple", "text": "Agrega al carrito y paga en pocos minutos." },
        { "title": "Pago seguro", "text": "Paga con QR o tarjeta, protegido por pagosYa." }
      ],
      "closingLine": "Encuentra lo que buscas",
      "closingCta": "Ver todos los productos",
      "tagline": ""
    },
    "palettes": [
      { "id": "terracotta", "name": "Crema y terracota", "paper": "#f6f1ea", "ink": "#1f1a17", "muted": "#ede6dc", "accent": "#b8553a", "deep": "#2b211c" },
      { "id": "olive", "name": "Crema y oliva", "paper": "#f4f1e8", "ink": "#1e1f1a", "muted": "#e7e3d6", "accent": "#5f6b3a", "deep": "#2a2e22" },
      { "id": "mono", "name": "Blanco y negro", "paper": "#ffffff", "ink": "#111111", "muted": "#f2f2f0", "accent": "#111111", "deep": "#111111" },
      { "id": "sand", "name": "Arena y óxido", "paper": "#f3ece3", "ink": "#241c17", "muted": "#e8ded2", "accent": "#9a4a2a", "deep": "#3a2a20" },
      { "id": "sage", "name": "Salvia y bosque", "paper": "#eef0ea", "ink": "#1a211c", "muted": "#e1e6dd", "accent": "#2f5d46", "deep": "#1f3a2e" },
      { "id": "plum", "name": "Rubor y ciruela", "paper": "#f8f0ee", "ink": "#261a21", "muted": "#efe2df", "accent": "#7a3b5c", "deep": "#3b2230" },
      { "id": "navy", "name": "Piedra y azul marino", "paper": "#f2f1ee", "ink": "#161b26", "muted": "#e5e4df", "accent": "#23395b", "deep": "#1a2436" },
      { "id": "noir", "name": "Noche y oro", "paper": "#141210", "ink": "#f2ece2", "muted": "#1e1b18", "accent": "#c9a45c", "deep": "#0b0a09" }
    ],
    "fonts": [
      { "id": "classic", "name": "Clásica", "heading": "cormorant-garamond", "body": "dm-sans" },
      { "id": "modern", "name": "Moderna", "heading": "fraunces", "body": "geist" },
      { "id": "editorial", "name": "Editorial", "heading": "instrument-serif", "body": "instrument" },
      { "id": "literary", "name": "Literaria", "heading": "newsreader", "body": "hanken-grotesk" },
      { "id": "luxury", "name": "Lujo", "heading": "bodoni-moda", "body": "mona-sans" },
      { "id": "gallery", "name": "Galería", "heading": "gloock", "body": "schibsted-grotesk" },
      { "id": "heritage", "name": "Tradición", "heading": "eb-garamond", "body": "manrope" },
      { "id": "caslon", "name": "Caslon", "heading": "libre-caslon-text", "body": "figtree" }
    ]
  }
}
```

- [ ] **Step 4: Write the components**

`components/Shell.tsx`:
```tsx
import { useState, type ReactNode } from 'react';
import { store, copy } from './store-data';
import { IconLogIn, IconMapPin, IconMenu, IconMessageCircle, IconSearch, IconShoppingBag, IconX } from './icons';

const links = [{ label: 'Inicio', href: 'index.html' }, { label: 'Productos', href: 'productos.html' }, { label: 'Nuestra historia', href: 'index.html#historia' }];

export function Header() {
  const [open, setOpen] = useState(false);
  return <>
    {copy.announcement ? <p className="es-announce">{copy.announcement}</p> : null}
    <header className="es-header">
      <div className="es-header__start">
        <button type="button" className="es-icon-btn" aria-controls="es-menu" aria-expanded={open} aria-label="Abrir menú" onClick={() => setOpen(true)}><IconMenu /></button>
        <a className="es-logo" href="index.html">{store.logo ? <img src={store.logo} alt={store.name} /> : store.name}</a>
      </div>
      <div className="es-header__end">
        <a className="es-icon-btn" href="buscar.html" aria-label="Buscar"><IconSearch /></a>
        <a className="es-icon-btn" data-pagosya-account="login" href="acceso-ingresar.html" aria-label="Mi cuenta"><IconLogIn /></a>
        <button type="button" className="es-icon-btn es-cart-btn" data-cart-open aria-label="Abrir carrito"><IconShoppingBag /><span className="es-cart-count" data-cart-count>0</span></button>
      </div>
    </header>
    <div className={open ? 'es-menu es-menu--open' : 'es-menu'} id="es-menu" aria-hidden={!open} onClick={event => { if (event.target === event.currentTarget) setOpen(false); }}>
      <nav className="es-menu__panel" aria-label="Principal">
        <button type="button" className="es-icon-btn es-menu__close" aria-label="Cerrar menú" onClick={() => setOpen(false)}><IconX /></button>
        {links.map(link => <a key={link.href} href={link.href} onClick={() => setOpen(false)}>{link.label}</a>)}
      </nav>
    </div>
  </>;
}

export function Footer() {
  const tagline = copy.tagline || store.tagline;
  return <footer className="es-footer">
    <div className="es-footer__grid">
      <div className="es-footer__brand"><p className="es-footer__name">{store.name}</p>{tagline ? <p>{tagline}</p> : null}</div>
      <div><h2>Tienda</h2><nav aria-label="Tienda"><a href="productos.html">Todos los productos</a><a href="index.html#historia">Nuestra historia</a></nav></div>
      <div><h2>Ayuda</h2><nav data-pagosya-pages className="pagosya-info-nav es-footer__pages" aria-label="Información" /></div>
      <div><h2>Contacto</h2>
        {store.city ? <p className="es-footer__line"><IconMapPin /> {store.city}</p> : null}
        {store.phone ? <a className="es-footer__line" href={`https://wa.me/${store.phone.replace(/\D/g, '')}`}><IconMessageCircle /> WhatsApp</a> : null}
        <a className="es-footer__line" data-pagosya-account="login" href="acceso-ingresar.html">Mi cuenta</a>
      </div>
    </div>
    <p className="es-footer__legal">© {new Date().getFullYear()} {store.name} · Pagos seguros con pagosYa</p>
  </footer>;
}

export default function Shell({ children }: { children: ReactNode }) {
  return <div className="es">
    <a className="es-skip" href="#contenido">Ir al contenido</a>
    <Header />
    {children}
    <Footer />
    <div data-pagosya-cart hidden />
    <p data-pagosya-status role="status" aria-live="polite" className="es-status" />
  </div>;
}
```

`components/home.tsx`:
```tsx
import { Parallax, Reveal } from '@pagosya/ui';
import Shell from './Shell';
import { copy, photos } from './store-data';
import { IconArrowRight, IconArrowUpRight } from './icons';

export default function Home() {
  return <Shell>
    <main id="contenido">
      <section id="inicio" className={photos.hero ? 'es-hero' : 'es-hero es-hero--plain'} aria-labelledby="es-hero-title">
        {photos.hero ? <Parallax className="es-hero__media" strength={60} mobileStrength={16}><img src={photos.hero} alt="" /></Parallax> : null}
        <div className="es-hero__copy">
          {copy.eyebrow ? <p className="es-eyebrow">{copy.eyebrow}</p> : null}
          <h1 id="es-hero-title" className="es-display">{copy.headline}</h1>
          {copy.subcopy ? <p className="es-hero__sub">{copy.subcopy}</p> : null}
          <div className="es-actions">
            <a className="es-btn es-btn--accent" href="productos.html">{copy.primaryCta}</a>
            {copy.secondaryCta ? <a className="es-btn es-btn--ghost" href="#historia">{copy.secondaryCta}</a> : null}
          </div>
        </div>
      </section>

      <section id="productos" className="es-section" aria-labelledby="es-products-title">
        <Reveal className="es-section__head">
          <h2 id="es-products-title" className="es-h2">{copy.productsTitle}</h2>
          <a className="es-link" href="productos.html">Ver todo <IconArrowRight /></a>
        </Reveal>
        <template data-pagosya-product-template>
          <article className="es-card">
            <a className="es-card__media" data-product-link href="product.html"><img data-product-field="image" alt="Foto del producto" /></a>
            <h3 className="es-card__name" data-product-field="name">Producto</h3>
            <p className="es-card__price" data-product-field="price" />
          </article>
        </template>
        <div className="es-grid" data-pagosya-catalog />
      </section>

      <section id="historia" className={photos.story ? 'es-section es-story' : 'es-section es-story es-story--text'} aria-labelledby="es-story-title">
        {photos.story ? <Reveal className="es-story__media"><img src={photos.story} alt="" /></Reveal> : null}
        <Reveal className="es-story__copy" delay={120}>
          <h2 id="es-story-title" className="es-h2">{copy.storyTitle}</h2>
          <p>{copy.storyBody}</p>
        </Reveal>
      </section>

      <section id="valores" className="es-section es-values" aria-label="Lo que nos importa">
        <ol>{copy.values.map((value, index) => <li key={value.title}><Reveal delay={index * 90}><span className="es-values__n">{String(index + 1).padStart(2, '0')}</span><h3 className="es-h3">{value.title}</h3><p>{value.text}</p></Reveal></li>)}</ol>
      </section>

      <section id="resenas" className="es-section es-reviews" data-pagosya-reviews-section aria-labelledby="es-reviews-title">
        <h2 id="es-reviews-title" className="es-h2">Lo que dicen nuestros clientes</h2>
        <div className="es-reviews__list" data-pagosya-reviews />
      </section>

      <section id="cierre" className="es-closing" aria-labelledby="es-closing-title">
        <Reveal>
          <h2 id="es-closing-title" className="es-h2">{copy.closingLine}</h2>
          <a className="es-btn es-btn--light" href="productos.html">{copy.closingCta} <IconArrowUpRight /></a>
        </Reveal>
      </section>
    </main>
  </Shell>;
}
```

`components/product.tsx`:
```tsx
import Shell from './Shell';
import { ProductPageTemplate, KitSlot } from '@pagosya/ui';

export default function Product() {
  return <Shell>
    <ProductPageTemplate>
      <article className="es-pdp">
        <KitSlot kind="product" name="breadcrumb" className="es-pdp__crumbs" />
        <div className="es-pdp__grid">
          <KitSlot kind="product" name="gallery" className="es-pdp__gallery" />
          <div className="es-pdp__info">
            <KitSlot kind="product" name="title" className="es-pdp__title" />
            <KitSlot kind="product" name="rating" />
            <KitSlot kind="product" name="pricing" className="es-pdp__price" />
            <KitSlot kind="product" name="description" className="es-pdp__desc" />
            <KitSlot kind="product" name="buy" />
            <KitSlot kind="product" name="highlights" />
            <KitSlot kind="product" name="delivery" />
            <KitSlot kind="product" name="info" />
          </div>
        </div>
        <KitSlot kind="product" name="reviews" />
        <KitSlot kind="product" name="related" />
      </article>
    </ProductPageTemplate>
    <main id="contenido" className="es-page" data-pagosya-product-page />
  </Shell>;
}
```

`components/checkout.tsx`:
```tsx
import { Header, Footer } from './Shell';

export default function Checkout() {
  return <div className="es">
    <Header />
    <main id="contenido" className="es-page" data-pagosya-checkout-page />
    <p data-pagosya-status role="status" aria-live="polite" className="es-status" />
    <Footer />
  </div>;
}
```

- [ ] **Step 5: Write `styles/globals.css`**

```css
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;background:var(--es-paper);color:var(--es-ink);font:400 17px/1.6 var(--es-body);-webkit-font-smoothing:antialiased}
img{display:block;max-width:100%}
a{color:inherit}
:where(h1,h2,h3){font-family:var(--es-heading);font-weight:400;text-wrap:balance;margin:0}
.es-skip{position:absolute;left:-999px;top:8px;background:var(--es-ink);color:var(--es-paper);padding:8px 14px;border-radius:999px;z-index:60}
.es-skip:focus{left:16px}
.es-status:empty{display:none}
.es-announce{margin:0;padding:8px 16px;background:var(--es-deep);color:var(--es-on-deep);font-size:13px;letter-spacing:.06em;text-align:center}
.es-header{position:sticky;top:0;z-index:30;display:flex;align-items:center;justify-content:space-between;gap:16px;min-height:72px;padding:0 max(24px,calc((100% - 1280px)/2));background:var(--es-paper);border-bottom:1px solid color-mix(in srgb,var(--es-ink) 10%,transparent)}
.es-header__start,.es-header__end{display:flex;align-items:center;gap:4px;min-width:0}
.es-logo{margin-left:6px;font:400 clamp(22px,2.4vw,30px)/1 var(--es-heading);text-decoration:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:min(52vw,420px)}
.es-logo img{height:36px;width:auto}
.es-icon-btn{position:relative;display:inline-grid;place-items:center;width:44px;height:44px;border:0;border-radius:999px;background:transparent;color:var(--es-ink);cursor:pointer;text-decoration:none}
.es-icon-btn:hover{background:var(--es-muted)}
.es-icon-btn:focus-visible,.es-btn:focus-visible,.es-link:focus-visible{outline:2px solid var(--es-accent);outline-offset:2px}
.es-icon-btn svg{width:22px;height:22px}
.es-cart-count{position:absolute;top:4px;right:2px;min-width:18px;height:18px;padding:0 5px;border-radius:999px;background:var(--es-accent);color:var(--es-on-accent);font:600 11px/18px var(--es-body)}
.es-menu{position:fixed;inset:0;z-index:50;background:color-mix(in srgb,var(--es-ink) 40%,transparent);opacity:0;visibility:hidden;transition:opacity .25s ease,visibility .25s}
.es-menu--open{opacity:1;visibility:visible}
.es-menu__panel{display:grid;align-content:start;gap:4px;width:min(360px,86vw);height:100%;padding:16px 24px;background:var(--es-paper);transform:translateX(-100%);transition:transform .3s cubic-bezier(.32,.72,0,1)}
.es-menu--open .es-menu__panel{transform:none}
.es-menu__close{justify-self:end;margin-bottom:16px}
.es-menu__panel a{padding:12px 0;font:400 28px/1.2 var(--es-heading);text-decoration:none;border-bottom:1px solid color-mix(in srgb,var(--es-ink) 10%,transparent)}
.es-hero{position:relative;display:grid;align-items:center;min-height:min(88vh,860px);overflow:hidden;color:#fff;background:var(--es-deep)}
.es-hero__media{position:absolute;inset:-60px 0;z-index:0}
.es-hero__media img{width:100%;height:100%;object-fit:cover}
.es-hero::after{content:'';position:absolute;inset:0;z-index:1;background:linear-gradient(90deg,rgba(0,0,0,.55),rgba(0,0,0,.15) 70%),linear-gradient(0deg,rgba(0,0,0,.35),transparent 45%)}
.es-hero--plain{color:var(--es-on-deep)}
.es-hero--plain::after{display:none}
.es-hero__copy{position:relative;z-index:2;width:min(1280px,100%);margin:0 auto;padding:96px max(24px,calc((100% - 1280px)/2))}
.es-hero__copy>*{max-width:640px}
.es-eyebrow{margin:0 0 20px;font:500 13px/1 var(--es-body);letter-spacing:.32em;text-transform:uppercase;opacity:.86}
.es-display{font-size:clamp(40px,6.2vw,72px);line-height:1.05;letter-spacing:-.01em}
.es-hero__sub{margin:20px 0 0;font-size:clamp(17px,1.6vw,20px);font-weight:300;opacity:.9}
.es-actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:36px}
.es-btn{display:inline-flex;align-items:center;justify-content:center;gap:10px;min-height:52px;padding:0 30px;border-radius:999px;border:1px solid transparent;font:500 14px/1 var(--es-body);letter-spacing:.14em;text-transform:uppercase;text-decoration:none;transition:transform .2s ease,background-color .2s ease}
.es-btn:hover{transform:translateY(-2px)}
.es-btn svg{width:18px;height:18px}
.es-btn--accent{background:var(--es-accent);color:var(--es-on-accent)}
.es-btn--ghost{border-color:currentColor;color:inherit;background:transparent}
.es-btn--light{background:var(--es-paper);color:var(--es-ink)}
.es-section{width:min(1280px,100%);margin:0 auto;padding:96px 24px}
.es-section__head{display:flex;align-items:end;justify-content:space-between;gap:16px;margin-bottom:40px}
.es-h2{font-size:clamp(30px,3.4vw,36px);line-height:1.2}
.es-h3{font-size:24px;line-height:1.3}
.es-link{display:inline-flex;align-items:center;gap:8px;font-size:15px;text-decoration:none;white-space:nowrap;border-bottom:1px solid currentColor;padding-bottom:2px}
.es-link svg{width:16px;height:16px}
.es-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:32px 24px}
.es-card{display:grid;gap:12px;min-width:0}
.es-card__media{display:block;aspect-ratio:4/5;overflow:hidden;border-radius:6px;background:var(--es-muted);transition:transform .3s ease}
.es-card__media img{width:100%;height:100%;object-fit:cover}
.es-card:hover .es-card__media{transform:translateY(-4px)}
.es-card__name{font:400 18px/1.35 var(--es-body);margin:0}
.es-card__price{margin:0;font-weight:500}
.catalog-empty{grid-column:1/-1;margin:0;padding:48px 0;text-align:center;color:color-mix(in srgb,var(--es-ink) 70%,transparent)}
.es-story{display:grid;grid-template-columns:1fr 1fr;gap:64px;align-items:center}
.es-story--text{grid-template-columns:minmax(0,760px);justify-content:center;text-align:center}
.es-story__media img{width:100%;aspect-ratio:4/5;object-fit:cover;border-radius:6px}
.es-story__copy p{margin:20px 0 0;font-size:18px}
.es-values{border-top:1px solid color-mix(in srgb,var(--es-ink) 12%,transparent);border-bottom:1px solid color-mix(in srgb,var(--es-ink) 12%,transparent)}
.es-values ol{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:48px}
.es-values__n{display:block;margin-bottom:16px;font:500 13px/1 var(--es-body);letter-spacing:.2em;color:var(--es-accent)}
.es-values p{margin:10px 0 0;color:color-mix(in srgb,var(--es-ink) 78%,transparent)}
.es-reviews__list{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:24px;margin-top:32px}
.es-closing{background:var(--es-deep);color:var(--es-on-deep);text-align:center;padding:96px 24px}
.es-closing .es-h2{margin-bottom:28px}
.es-footer{background:var(--es-muted);padding:72px max(24px,calc((100% - 1280px)/2)) 32px}
.es-footer__grid{display:grid;grid-template-columns:1.4fr 1fr 1fr 1fr;gap:40px}
.es-footer h2{font:600 13px/1 var(--es-body);letter-spacing:.16em;text-transform:uppercase;margin-bottom:18px}
.es-footer nav,.es-footer__grid>div{display:grid;align-content:start;gap:10px}
.es-footer a{text-decoration:none}
.es-footer a:hover{text-decoration:underline}
.es-footer__name{margin:0;font:400 28px/1.1 var(--es-heading)}
.es-footer__brand p{margin:0}
.es-footer__line{display:inline-flex;align-items:center;gap:8px;margin:0}
.es-footer__line svg{width:18px;height:18px}
.es-footer__legal{margin:56px 0 0;padding-top:24px;border-top:1px solid color-mix(in srgb,var(--es-ink) 12%,transparent);font-size:14px;color:color-mix(in srgb,var(--es-ink) 70%,transparent)}
.es-page{width:min(1280px,100%);margin:0 auto;padding:40px 24px 96px;min-height:60vh}
.es-pdp__crumbs{font-size:14px;margin-bottom:20px}
.es-pdp__grid{display:grid;grid-template-columns:1.15fr 1fr;gap:64px;align-items:start}
.es-pdp__gallery{border-radius:6px;overflow:hidden;background:var(--es-muted)}
.es-pdp__info{display:grid;gap:18px;position:sticky;top:96px}
.es-pdp__title h1,.es-pdp__title h2{font-size:clamp(32px,3.6vw,48px);line-height:1.15}
.es-pdp__price{font-size:22px;font-weight:500}
@media (max-width:1024px){.es-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media (max-width:760px){
  .es-header{min-height:60px;padding:0 8px}
  .es-hero{min-height:78vh}
  .es-hero__copy{padding:72px 16px 56px}
  .es-section{padding:48px 16px}
  .es-closing{padding:56px 16px}
  .es-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:24px 12px}
  .es-story,.es-values ol,.es-reviews__list,.es-pdp__grid{grid-template-columns:1fr;gap:32px}
  .es-footer{padding:48px 16px 24px}
  .es-footer__grid{grid-template-columns:1fr 1fr}
  .es-footer__brand{grid-column:1/-1}
  .es-pdp__info{position:static}
  .es-page{padding:24px 16px 56px}
}
@media (prefers-reduced-motion:reduce){*{transition:none!important;scroll-behavior:auto!important}}
```

- [ ] **Step 6: Make the demo photos**

Generate six images with the owner's Higgsfield (`mcp__claude_ai_higgsfield__generate_image`, model `gpt_image_2_5`, quality medium, ≤ 4 per batch). No logos, text or brand marks in any of them:
- `hero.jpg` (16:9): "Calm editorial product still life on a linen-covered table by a window, soft morning light, neutral cream and terracotta tones, ceramic cups, a woven basket, no text, no logos, no brands"
- `story.jpg` (4:5): "Hands of an artisan wrapping a small parcel in kraft paper on a wooden workbench, warm natural light, no text, no logos"
- `p1.jpg`–`p4.jpg` (4:5): "Single [handmade ceramic mug | linen tote bag | scented candle in amber glass | olive-wood serving board] on a plain warm-cream backdrop, soft shadow, product photography, no text, no logos"

Download each, then resize and compress under 600 KB: `sips -Z 1800 -s format jpeg -s formatOptions 78 <in> --out templates/esencial/demo/<name>.jpg`. Never use photos from the owner's personal folders.

- [ ] **Step 7: Run every check**

Run: `cd packages/store-templates && npm test` → PASS (registry, shell contract, info-nav slot, lookalike, lucide, esencial).
Run: `cd apps/api && npx jest src/storefront-source/source-master-esencial.spec.ts` → PASS.
Run: `cd apps/api && npx jest src/storefront-source/source-templates-contract.spec.ts -t "plantilla esencial"` → PASS.
Run: `cd apps/api && npx jest src/storefront-source/source-templates-motion.spec.ts -t esencial` → PASS.
If `lookalike.test.mjs` flags Esencial as too close to another template, read its threshold and change Esencial's markup, not the test.

- [ ] **Step 8: Commit**

```bash
git add packages/store-templates/templates/esencial packages/store-templates/test/esencial.test.mjs apps/api/src/storefront-source/source-master-esencial.spec.ts
git commit -m "feat(templates): Esencial, the Amboras-style master template"
```

---

### Task 6: Screenshots for the owner — STOP GATE

**Files:**
- Modify: `apps/api/src/storefront-source/source-templates-qa.tool.spec.ts` (accept `MASTER_LOOKS`)

**Interfaces:**
- Consumes: `templateDemoRevision(manifest, source, fill?)` from Task 3.

- [ ] **Step 1: Let the QA tool render master looks**

In the QA tool, where it calls `templateDemoRevision(manifest, templateSourceFiles(manifest.id))`, loop over looks for master templates:
```ts
const looks = manifest.master ? (process.env.MASTER_LOOKS || 'terracotta:classic').split(',').map(pair => { const [palette, fonts] = pair.split(':'); return { palette, fonts }; }) : [undefined];
for (const look of looks) {
  const assembled = await templateDemoRevision(manifest, templateSourceFiles(manifest.id), look ? { look } : undefined);
  const prefix = `${manifest.id}${look ? `-${look.palette}-${look.fonts}` : ''}`;
  // …the existing capture code, using `prefix` wherever it used `manifest.id` in output file names…
}
```

- [ ] **Step 2: Capture**

Run: `cd apps/api && QA_TEMPLATES=1 TEMPLATE_IDS=esencial MASTER_LOOKS=terracotta:classic,sage:literary,noir:luxury QA_OUT=$CLAUDE_JOB_DIR/tmp/esencial-qa npx jest source-templates-qa.tool`
Expected: PASS; screenshots of home, product page, empty cart and cart with product at 1280 and 390 in three looks.

- [ ] **Step 3: Commit the tool change**

```bash
git add apps/api/src/storefront-source/source-templates-qa.tool.spec.ts
git commit -m "test(templates): QA tool renders a master template in chosen looks"
```

- [ ] **Step 4: STOP — show the owner**

Show the screenshots (home 1280 + 390, product 1280, cart 390, in the three looks) and ask the owner to approve the look or say what to change. **Do not start Task 7 until the owner approves.** Apply their changes to Task 5's files, rerun Task 5 Step 7, recapture, and ask again.

---

### Task 7: The fill call

**Files:**
- Modify: `apps/api/src/storefront-source/source-master.ts` (add `MasterRead`, `masterFillFromRead`)
- Modify: `apps/api/src/storefront-source/source-conversation.service.ts` (add `MasterFillInput`, `fillMaster`, its prompt and schema)
- Create: `apps/api/src/storefront-source/source-master-fill.spec.ts`

**Interfaces:**
- Produces (`source-master.ts`): `MasterRead = MasterCopy & { palette: string; fonts: string; colors: Record<MasterColour, string>; heroPhoto: number; storyPhoto: number; changed: string[] }`; `masterFillFromRead(read: MasterRead, photos: readonly string[], edit: boolean): MasterFill` — photo index → URL (`-1` or out of range → `null`); empty colours dropped; when `edit` only fields named in `read.changed` are kept (`'look'` covers palette/fonts/colors, `'photos'` covers hero/story).
- Produces (`source-conversation.service.ts`): `MasterFillInput = { storeId: string; model?: SourceModelChoice; storeName: string; what: string; story: string; city: string; products: string[]; photos: string[]; palettes: Array<{ id: string; name: string }>; fonts: Array<{ id: string; name: string }>; current?: { copy: MasterCopy; look: MasterLook }; request?: string }`; `SourceConversationService.fillMaster(merchantId: string, input: MasterFillInput): Promise<MasterRead | null>`.

- [ ] **Step 1: Write the failing tests**

```ts
import { masterFillFromRead, type MasterRead } from './source-master';
import { SourceConversationService } from './source-conversation.service';

const read = (over: Partial<MasterRead> = {}): MasterRead => ({ announcement: '', eyebrow: 'Café de altura', headline: 'Café de Coroico', subcopy: 'Tostado cada semana.', primaryCta: 'Ver cafés', secondaryCta: 'Nuestra historia', productsTitle: 'Nuestros cafés', storyTitle: 'De la finca a tu taza', storyBody: 'Cuerpo',
  values: [{ title: 'a', text: 'b' }, { title: 'c', text: 'd' }, { title: 'e', text: 'f' }], closingLine: 'Pide el tuyo', closingCta: 'Ver todo', tagline: '',
  palette: 'sand', fonts: 'literary', colors: { paper: '', ink: '', muted: '', accent: '#9a4a2a', deep: '' }, heroPhoto: 1, storyPhoto: -1, changed: [], ...over });

describe('masterFillFromRead', () => {
  it('turns photo indexes into URLs and drops empty colours', () => {
    const fill = masterFillFromRead(read(), ['a.jpg', 'b.jpg'], false);
    expect(fill.heroPhoto).toBe('b.jpg');
    expect(fill.storyPhoto).toBeNull();
    expect(fill.look).toEqual({ palette: 'sand', fonts: 'literary', colors: { accent: '#9a4a2a' } });
    expect(fill.copy?.headline).toBe('Café de Coroico');
  });
  it('an out-of-range photo index is no photo', () => {
    expect(masterFillFromRead(read({ heroPhoto: 7 }), ['a.jpg'], false).heroPhoto).toBeNull();
  });
  it('an edit keeps only the fields the model says it changed', () => {
    const fill = masterFillFromRead(read({ changed: ['headline'] }), ['a.jpg'], true);
    expect(fill).toEqual({ copy: { headline: 'Café de Coroico' } });
  });
});

describe('fillMaster', () => {
  const input = { storeId: 's1', storeName: 'Café Buna', what: 'Café de especialidad', story: '', city: 'La Paz', products: ['Coroico 250 g'], photos: [], palettes: [{ id: 'sand', name: 'Arena' }], fonts: [{ id: 'literary', name: 'Literaria' }] };
  const service = () => new SourceConversationService({ mediaAsset: { findMany: jest.fn().mockResolvedValue([]) } } as any, { getBuffer: jest.fn(), contentTypeFor: () => 'image/jpeg' } as any, { get: () => undefined } as any);
  beforeEach(() => jest.useFakeTimers({ advanceTimers: true }));
  afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

  it('returns the parsed read on success', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, status: 200, json: async () => ({ output_text: JSON.stringify(read()), output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(read()) }] }] }) } as any);
    expect((await service().fillMaster('m1', input))?.headline).toBe('Café de Coroico');
  });
  it('returns null after a failed call and one retry', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 502, json: async () => ({}) } as any);
    expect(await service().fillMaster('m1', input)).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
```
Before running, open `readListing` in `source-conversation.service.ts` and the helpers it imports (`sourceProvider`, `sourceResponseJson`): adjust the `ConfigService` stub so `sourceProvider` returns an endpoint and key in tests (mirror an existing spec that constructs `SourceConversationService`: `grep -ln "new SourceConversationService" src/storefront-source/*.spec.ts`), and shape the success body the way `sourceResponseJson` reads it.

- [ ] **Step 2: Run them to verify they fail**

Run: `cd apps/api && npx jest src/storefront-source/source-master-fill.spec.ts` → FAIL.

- [ ] **Step 3: Implement `masterFillFromRead`** (append to `source-master.ts`)

```ts
export type MasterRead = MasterCopy & { palette: string; fonts: string; colors: Record<MasterColour, string>; heroPhoto: number; storyPhoto: number; changed: string[] };
const COPY_FIELDS = [...Object.keys(MASTER_COPY_CAPS), 'values'];

export function masterFillFromRead(read: MasterRead, photos: readonly string[], edit: boolean): MasterFill {
  const keep = (field: string) => !edit || read.changed.includes(field);
  const copy = Object.fromEntries(COPY_FIELDS.filter(keep).map(field => [field, (read as unknown as Record<string, unknown>)[field]])) as Partial<MasterCopy>;
  const colors = Object.fromEntries(MASTER_COLOURS.filter(key => read.colors?.[key]).map(key => [key, read.colors[key]]));
  const photo = (index: number) => Number.isInteger(index) && index >= 0 && index < photos.length ? photos[index] : null;
  return {
    ...(Object.keys(copy).length ? { copy } : {}),
    ...(keep('look') ? { look: { palette: read.palette, fonts: read.fonts, colors } } : {}),
    ...(keep('photos') ? { heroPhoto: photo(read.heroPhoto), storyPhoto: photo(read.storyPhoto) } : {}),
  };
}
```

- [ ] **Step 4: Implement `fillMaster`** (in `SourceConversationService`, next to `readListing`, using the same imports)

Module-level:
```ts
const MASTER_FILL_PROMPT = `You fill in the words and pick the look of a calm, professional online store template for a small business. Write in Spanish, in the business's own voice: warm, concrete, short. Use only facts the merchant gave (name, what they sell, story, city, product names). Never invent reviews, ratings, numbers, years, awards, certifications, prices, delivery times or shipping promises. eyebrow is 2–4 words; headline is one short line about what they sell, never the store name alone; subcopy is one sentence; values are three short promises the business can keep from its own facts; tagline may be "". announcement is "" unless the merchant stated a real offer. Pick palette and fonts by the business's character from the lists given. heroPhoto is the index of the best wide, calm photo for a full-width banner (-1 if none fits); storyPhoto a different photo that shows the people, place or process (-1 if none). colors: "" for every colour unless the merchant named specific colours (then #rrggbb). When "request" and "current" are given, this is an edit: change only what the request asks, copy every other field from current unchanged, and list in "changed" the field names you changed (use "look" for palette/fonts/colors and "photos" for heroPhoto/storyPhoto). Otherwise "changed" is [].`;
const capped = (max: number) => ({ type: 'string', maxLength: max });
const masterFillSchema = (palettes: string[], fonts: string[]) => ({
  type: 'object', additionalProperties: false,
  required: [...Object.keys(MASTER_COPY_CAPS), 'values', 'palette', 'fonts', 'colors', 'heroPhoto', 'storyPhoto', 'changed'],
  properties: {
    ...Object.fromEntries(Object.entries(MASTER_COPY_CAPS).map(([key, max]) => [key, capped(max)])),
    values: { type: 'array', minItems: 3, maxItems: 3, items: { type: 'object', additionalProperties: false, required: ['title', 'text'], properties: { title: capped(MASTER_VALUE_CAPS.title), text: capped(MASTER_VALUE_CAPS.text) } } },
    palette: { type: 'string', enum: palettes }, fonts: { type: 'string', enum: fonts },
    colors: { type: 'object', additionalProperties: false, required: [...MASTER_COLOURS], properties: Object.fromEntries(MASTER_COLOURS.map(key => [key, capped(7)])) },
    heroPhoto: { type: 'integer' }, storyPhoto: { type: 'integer' },
    changed: { type: 'array', items: { type: 'string', enum: [...Object.keys(MASTER_COPY_CAPS), 'values', 'look', 'photos'] } },
  },
});
export type MasterFillInput = { storeId: string; model?: SourceModelChoice; storeName: string; what: string; story: string; city: string; products: string[]; photos: string[];
  palettes: Array<{ id: string; name: string }>; fonts: Array<{ id: string; name: string }>; current?: { copy: MasterCopy; look: MasterLook }; request?: string };
```
Method:
```ts
  /** Spec 2026-10-19 §2.3/§3.1: one structured call that fills (or edits) the master template. Null when it fails twice. */
  async fillMaster(merchantId: string, input: MasterFillInput): Promise<MasterRead | null> {
    const model = sourceConversationModel(input.model, this.config.get<string>('app.openAi.conversationModel'));
    const provider = sourceProvider(this.config, model);
    const photos = input.photos.slice(0, 8);
    const owned = photos.length ? new Set((await this.prisma.mediaAsset.findMany({ where: { merchantId, url: { in: photos } }, select: { url: true } })).map(asset => asset.url)) : new Set<string>();
    const images: Array<{ type: 'input_image'; image_url: string; detail: 'low' }> = [];
    for (const url of photos) {
      const filename = url.split('/').at(-1)!;
      const bytes = owned.has(url) ? await this.uploads.getBuffer(filename).catch(() => null) : null;
      if (bytes && bytes.length <= 4_000_000) images.push({ type: 'input_image', image_url: `data:${this.uploads.contentTypeFor(filename)};base64,${bytes.toString('base64')}`, detail: 'low' });
    }
    const facts = { storeName: input.storeName, what: input.what, story: input.story, city: input.city, products: input.products.slice(0, 12), photoCount: photos.length,
      palettes: input.palettes, fonts: input.fonts, ...(input.current ? { current: input.current } : {}), ...(input.request ? { request: input.request } : {}) };
    for (let attempt = 0; attempt < 2; attempt++) {
      const started = Date.now(); let body: any = null; let status = 'FAILED';
      try {
        const response = await fetch(provider.endpoint, {
          method: 'POST', headers: { Authorization: `Bearer ${provider.apiKey}`, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(60_000),
          body: JSON.stringify({ model, store: false, instructions: MASTER_FILL_PROMPT,
            input: [{ role: 'user', content: [{ type: 'input_text', text: JSON.stringify(facts) }, ...images] }],
            text: { format: { type: 'json_schema', name: 'master_fill', strict: true, schema: masterFillSchema(input.palettes.map(p => p.id), input.fonts.map(f => f.id)) } },
            reasoning: { effort: 'low' }, max_output_tokens: 2500 }),
        });
        body = await response.json().catch(() => null);
        checkSourceProviderQuota(response.status, body, provider.name);
        if (response.ok) { status = 'COMPLETED'; return sourceResponseJson(body) as MasterRead; }
      } catch (error) {
        if (error instanceof SourceProviderQuotaException) throw error;
        this.logger.warn(JSON.stringify({ stage: 'master-fill', attempt, reason: ((error as Error)?.message || '').slice(0, 200) }));
      } finally { await this.metering?.record(input.storeId, 'source-master-fill', model, body, Date.now() - started, status); }
      if (attempt === 0) await new Promise(resolve => setTimeout(resolve, 3000));
    }
    return null;
  }
```
Imports: `MASTER_COPY_CAPS, MASTER_VALUE_CAPS, MASTER_COLOURS, type MasterRead, type MasterLook` from `./source-master`; `type MasterCopy` from `@pagosya/store-templates`. Metering records the call like `readListing`'s, which is how a chat message's model use is billed.

- [ ] **Step 5: Run the tests**

Run: `cd apps/api && npx jest src/storefront-source/source-master-fill.spec.ts src/storefront-source/source-master.spec.ts --maxWorkers=2` → PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/storefront-source/source-conversation.service.ts apps/api/src/storefront-source/source-master.ts apps/api/src/storefront-source/source-master-fill.spec.ts
git commit -m "feat(yapi): one structured call fills the master template"
```

---

### Task 8: New shops start from Esencial

**Files:**
- Modify: `apps/api/src/config/configuration.ts` (type beside `yapiStylePick` ~line 104; value beside line 454)
- Modify: `apps/api/src/storefront-source/source-chat.service.ts` (module constant; branch before the `// "Elige tu estilo": new stores and full redesigns…` comment; new `useMasterTemplate` next to `useTemplate`)
- Create: `apps/api/src/storefront-source/source-chat-master.spec.ts`

**Interfaces:**
- Consumes: `SourceTemplatesService.applyMaster` (Task 3), `SourceConversationService.fillMaster` and `masterFillFromRead` (Task 7), `MASTER_TEMPLATE_ID`.
- Produces: config key `app.yapiMasterTemplate: boolean`.

- [ ] **Step 1: Write the failing tests**

```ts
import { randomUUID as uuid } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { SourceChatService } from './source-chat.service';
import { SourceRequestBudget } from './source-request-budget';

jest.mock('./source-master-check', () => ({ masterLayoutFindings: jest.fn().mockResolvedValue([]) }));

let chat: SourceChatService, prisma: any, generate: jest.Mock, applyMaster: jest.Mock, fillMaster: jest.Mock, decide: jest.Mock, config: Map<string, unknown>, messages: any[];
const generation = () => ({ generate, newBudget: jest.fn((max?: number) => new SourceRequestBudget(max)), catalog: jest.fn(), interruptedPreview: jest.fn() } as any);
beforeEach(() => {
  messages = [];
  prisma = {
    store: { findFirst: jest.fn().mockResolvedValue({ name: 'Café Buna', logoUrl: null, onboarding: { what: 'Café de especialidad', story: 'Tostamos en casa', contact: { city: 'La Paz' }, photos: ['https://x/u1.jpg'] }, _count: { paymentLinks: 0 }, paymentLinks: [] }), update: jest.fn() },
    storeAgentThread: { findUnique: jest.fn().mockImplementation(async () => ({ id: 't1', messages: [...messages].reverse() })), upsert: jest.fn().mockResolvedValue({ id: 't1' }) },
    storeAgentMessage: { create: jest.fn().mockImplementation(async ({ data }) => { const message = { ...data, id: String(messages.length), createdAt: new Date() }; messages.push(message); return message; }), update: jest.fn() },
    storeSourceVersion: { count: jest.fn().mockResolvedValue(1) },
    storeSourceGeneration: { findFirst: jest.fn().mockResolvedValue(null), updateMany: jest.fn() },
    storeSourceChatJob: { findFirst: jest.fn().mockResolvedValue(null) },
    mediaAsset: { findMany: jest.fn().mockResolvedValue([]) },
  };
  generate = jest.fn().mockResolvedValue({ revision: 1, label: 'Diseño propio' });
  decide = jest.fn().mockResolvedValue({ action: 'generate', reply: '', summary: 'Cafetería en Sopocachi.', generationInstruction: 'Crea la tienda.', imageUses: [], startFrom: 'scratch', editKind: 'none' });
  fillMaster = jest.fn().mockResolvedValue(null);
  applyMaster = jest.fn().mockImplementation(async (_m, _s, _r, filler) => { await filler({ storeName: 'Café Buna', products: ['Coroico'], photos: ['https://x/p1.jpg'] }); return { revision: 1, label: 'Plantilla: Esencial', filled: false }; });
  config = new Map<string, unknown>([['app.yapiMasterTemplate', true], ['app.yapiStylePick', true]]);
  chat = new SourceChatService(prisma, { current: jest.fn().mockResolvedValue({ revision: 0 }), version: jest.fn() } as any, generation(), { decide, fillMaster } as any, { apply: jest.fn(), applyMaster } as any, { get: (key: string) => config.get(key) } as unknown as ConfigService);
});

const send = (instruction: string) => chat.send('m1', 's1', { revision: 0, instruction, setupAction: 'generate', requestId: uuid() }) as Promise<any>;

it('a new shop is built from Esencial, never by the designer or the style cards', async () => {
  const out = await send('Mi negocio se llama Café Buna.\nCrea mi tienda.');
  expect(applyMaster).toHaveBeenCalledWith('m1', 's1', 0, expect.any(Function));
  expect(generate).not.toHaveBeenCalled();
  expect(out.revision).toMatchObject({ revision: 1 });
  expect(out.assistantMessage.content).toContain('Café Buna');
});

it('the filler gets the walkthrough facts and the store photos, walkthrough photos first', async () => {
  await send('Crea mi tienda.');
  expect(fillMaster).toHaveBeenCalledWith('m1', expect.objectContaining({ storeName: 'Café Buna', what: 'Café de especialidad', story: 'Tostamos en casa', city: 'La Paz', products: ['Coroico'], photos: ['https://x/u1.jpg', 'https://x/p1.jpg'] }));
});

it('«desde cero» keeps the scratch flow', async () => {
  await send('Quiero crear mi tienda desde cero.');
  expect(applyMaster).not.toHaveBeenCalled();
  expect(generate).toHaveBeenCalled();
});

it('an earlier «desde cero» keeps the scratch flow', async () => {
  messages.push({ role: 'USER', content: 'Prefiero un diseño desde cero', metadata: {}, createdAt: new Date(), id: 'x' });
  await send('Listo, créala.');
  expect(applyMaster).not.toHaveBeenCalled();
});

it('the flag off returns to today’s flow', async () => {
  config.set('app.yapiMasterTemplate', false);
  await send('Crea mi tienda.');
  expect(applyMaster).not.toHaveBeenCalled();
  expect(generate).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd apps/api && npx jest src/storefront-source/source-chat-master.spec.ts` → FAIL. (If the `jest.mock('./source-master-check'…)` line errors because the module does not exist yet, comment it out until Task 9.)

- [ ] **Step 3: Add the flag**

In `configuration.ts`, beside `yapiStylePick` in the type:
```ts
  /** Master template (spec 2026-10-19): new shops start from «Esencial», filled by one call. Default on; YAPI_MASTER_TEMPLATE=off disables. */
  yapiMasterTemplate: boolean;
```
and in the values object beside `yapiStylePick:`: `yapiMasterTemplate: process.env.YAPI_MASTER_TEMPLATE !== 'off',`.

- [ ] **Step 4: Route new shops**

In `source-chat.service.ts`, beside the other module constants:
```ts
/** The merchant's own words asking for a store designed from nothing (spec 2026-10-19 §2.1). */
const MASTER_SCRATCH = /desde (?:cero|0)|from scratch|diseño propio|algo (?:propio|único)|sin (?:usar )?plantillas?/i;
```
Immediately before the line `// "Elige tu estilo": new stores and full redesigns get two styles to pick from (one calm, one bold); a kept template stays its own style.`, insert:
```ts
      // Master template (spec 2026-10-19): a new shop starts from Esencial unless the merchant asked, in their own words, for a design
      // from scratch. A website copy and a product link keep their own flows.
      const askedScratch = [input.instruction, ...history.messages.filter(message => message.role === 'USER').map(message => message.content)].some(text => MASTER_SCRATCH.test(text));
      if (this.config.get<boolean>('app.yapiMasterTemplate') === true && newShop && decision.action === 'generate' && !askedScratch && !websiteCopy && !productLink) {
        return await this.useMasterTemplate(merchantId, storeId, thread.id, userMessage, workflow, setupDraft, current.revision);
      }
```
Read the ~80 lines above that comment and use the file's own names for `history`, `newShop`, `websiteCopy`, `productLink` and `current` (they are in scope there in the current code).

Add next to `useTemplate`:
```ts
  /** Spec 2026-10-19 §2: Esencial applied and filled in one call; the store is saved even when the call fails. */
  private async useMasterTemplate(merchantId: string, storeId: string, threadId: string, userMessage: StoreAgentMessage, workflow: ReturnType<typeof createSourceProgress>, draft: SourceSetupDraft, revision: number) {
    await workflow.report('saving');
    const store = await this.prisma.store.findFirst({ where: { id: storeId }, select: { name: true, onboarding: true } });
    const onboarding = (store?.onboarding ?? {}) as { what?: string; story?: string; contact?: { city?: string }; photos?: string[] };
    const manifest = templateManifest(MASTER_TEMPLATE_ID)!;
    const saved = await this.templates.applyMaster(merchantId, storeId, revision, async facts => {
      const photos = [...new Set([...(onboarding.photos ?? []), ...facts.photos])].slice(0, 8);
      const read = await this.dialogue.fillMaster(merchantId, {
        storeId, storeName: facts.storeName, what: onboarding.what ?? draft.answers?.context ?? '', story: onboarding.story ?? '', city: onboarding.contact?.city ?? '',
        products: facts.products, photos, palettes: manifest.master!.palettes.map(({ id, name }) => ({ id, name })), fonts: manifest.master!.fonts.map(({ id, name }) => ({ id, name })),
      });
      return read ? masterFillFromRead(read, photos, false) : { copy: { headline: facts.storeName, subcopy: (onboarding.what ?? '').slice(0, 160) } };
    });
    await workflow.finish('completed');
    const assistantMessage = await this.prisma.storeAgentMessage.create({ data: {
      threadId, channel: 'source', role: 'ASSISTANT',
      content: `Tu tienda ${store?.name ?? ''} está lista. Pídeme cualquier cambio: textos, colores, fuentes, fotos o secciones.`.replace(/\s{2,}/g, ' '),
      metadata: { progress: workflow.value, sourceSetup: { ...draft, assetUrls: [], prompt: undefined, pendingCatalogRequest: undefined }, sourceRevision: saved.revision, label: saved.label },
    } });
    return { userMessage, assistantMessage, revision: saved };
  }
```
Imports: `MASTER_TEMPLATE_ID, masterFillFromRead` from `./source-master`. The failure fallback (headline = store name, subcopy = what they sell, template defaults for the rest) is spec §2.6.

- [ ] **Step 5: Run the new and neighbouring chat specs**

Run: `cd apps/api && npx jest src/storefront-source/source-chat-master.spec.ts src/storefront-source/source-chat-style.spec.ts src/storefront-source/source-chat.service.spec.ts --maxWorkers=2` → the new spec PASSES. Older specs whose config stub returns `undefined` for unknown keys are unaffected; where one fails because a new shop no longer reaches `generate`, set `app.yapiMasterTemplate: false` in that spec's config.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/config/configuration.ts apps/api/src/storefront-source/source-chat.service.ts apps/api/src/storefront-source/source-chat-master.spec.ts
git commit -m "feat(yapi): new shops start from the master template"
```
(Add any older spec you adjusted.)

---

### Task 9: Chat edits on master stores

**Files:**
- Create: `apps/api/src/storefront-source/source-master-check.ts`
- Create: `apps/api/src/storefront-source/source-master-check.spec.ts`
- Modify: `apps/api/src/storefront-source/source-conversation.service.ts` (decision `editKind`; prompt line; normalisation near line 281; `ConversationInput.masterTemplate`)
- Modify: `apps/api/src/storefront-source/source-chat.service.ts` (`MASTER_EDIT_RULES`; content branch; design rules; layout check + one repair; `masterContentEdit`)
- Modify: `apps/api/src/storefront-source/source-chat-master.spec.ts` (edit tests)

**Interfaces:**
- Consumes: `readMasterState`, `SourceTemplatesService.refill` (Task 3), `fillMaster`/`masterFillFromRead` (Task 7), `masterCopy`/`masterLook` (Task 3).
- Produces: `SourceConversationDecision.editKind: 'content' | 'design' | 'redesign' | 'none'`; `masterLayoutFindings(snapshot: SourceProjectSnapshot): Promise<string[]>`; exported constant `MASTER_EDIT_RULES: string`.

- [ ] **Step 1: Write the failing check test**

```ts
import { templateManifest, templateSourceFiles } from '@pagosya/store-templates';
import { templateDemoRevision } from './source-templates';
import { SourceProjectsService } from './source-projects.service';
import { masterLayoutFindings } from './source-master-check';

jest.setTimeout(240_000);
const snapshotWith = async (extraCss = '') => {
  const assembled = await templateDemoRevision(templateManifest('esencial')!, templateSourceFiles('esencial'));
  const files = assembled.files.map(f => f.path === 'styles/globals.css' ? { ...f, content: f.content + extraCss } : f);
  return new SourceProjectsService({} as any).prepare({ revision: 0, ...assembled, files });
};

it('finds nothing on Esencial as shipped', async () => {
  expect(await masterLayoutFindings(await snapshotWith() as any)).toEqual([]);
});
it('reports sideways overflow', async () => {
  const findings = await masterLayoutFindings(await snapshotWith('.es-hero__copy{width:1900px}') as any);
  expect(findings.some(f => /se desborda/.test(f))).toBe(true);
});
it('reports overlapping text', async () => {
  const findings = await masterLayoutFindings(await snapshotWith('.es-hero__sub{margin-top:-90px}') as any);
  expect(findings.some(f => /se superponen/.test(f))).toBe(true);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/api && npx jest src/storefront-source/source-master-check.spec.ts` → FAIL.

- [ ] **Step 3: Implement the check**

```ts
/** Spec 2026-10-19 §3.2: after a design edit on a master store, the home at 1280 and 390 must not scroll sideways and
 *  no two visible text boxes may overlap. Returns Spanish findings (empty = fine). */
import { withVisualSandbox } from './source-visual-capture';
import type { SourceProjectSnapshot } from './source-project';

export async function masterLayoutFindings(snapshot: SourceProjectSnapshot): Promise<string[]> {
  return withVisualSandbox(snapshot, '', undefined, false, async context => {
    const findings: string[] = [];
    for (const width of [1280, 390]) {
      const page = await context.newPage();
      await page.setViewportSize({ width, height: 900 });
      await page.goto('https://preview.invalid/index.html', { waitUntil: 'load', timeout: 12000 });
      await page.evaluate(async () => { await document.fonts.ready; });
      const read = await page.evaluate(() => {
        const overflow = document.documentElement.scrollWidth - document.documentElement.clientWidth;
        const visible = (el: Element) => { const style = getComputedStyle(el); return !el.closest('[hidden],[aria-hidden="true"],template,.es-menu') && style.visibility !== 'hidden' && Number(style.opacity) > 0.05; };
        const boxes = Array.from(document.querySelectorAll('h1,h2,h3,p,a,button,li'))
          .filter(el => !el.querySelector('h1,h2,h3,p,a,button,li') && (el.textContent || '').trim() && visible(el))
          .map(el => ({ r: el.getBoundingClientRect(), t: (el.textContent || '').trim().slice(0, 40) }))
          .filter(box => box.r.width > 0 && box.r.height > 0);
        const overlaps: string[] = [];
        for (let i = 0; i < boxes.length && overlaps.length < 3; i++) for (let j = i + 1; j < boxes.length && overlaps.length < 3; j++) {
          const a = boxes[i].r, b = boxes[j].r;
          const w = Math.min(a.right, b.right) - Math.max(a.left, b.left), h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
          if (w > 4 && h > 4) overlaps.push(`«${boxes[i].t}» y «${boxes[j].t}»`);
        }
        return { overflow, overlaps };
      });
      if (read.overflow > 1) findings.push(`A ${width}px la página se desborda ${read.overflow}px hacia el costado.`);
      for (const pair of read.overlaps) findings.push(`A ${width}px se superponen los textos ${pair}.`);
      await page.close();
    }
    return findings;
  });
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd apps/api && npx jest src/storefront-source/source-master-check.spec.ts` → PASS. If the shipped Esencial reports a finding, fix Esencial's CSS (Task 5 file), not the check.

- [ ] **Step 5: Add `editKind` to the decision**

In `source-conversation.service.ts`: add `'editKind'` to `decisionSchema.required` and `editKind: { type: 'string', enum: ['content', 'design', 'redesign', 'none'] },` to its properties; add `editKind?: 'content' | 'design' | 'redesign' | 'none';` to `SourceConversationDecision`; add to the prompt text, after the `rework:` paragraph:
```
editKind: for an existing store whose context has masterTemplate=true — "content" when the request only changes words, colours, fonts, the announcement bar or which photo goes where; "design" when it changes layout, sections, components or adds a feature (a bundle offer, moving reviews, a shorter hero); "redesign" only when the merchant explicitly asks to redesign everything or for something unique ("rediseña todo", "quiero algo único"); otherwise "none". For new stores always "none".
```
Add `masterTemplate?: boolean` to `ConversationInput` and include it in the context JSON sent to the model wherever `startedFromTemplate` is included. Normalise beside the other decision normalisations (~line 281): `decision.editKind = decision.editKind === 'content' || decision.editKind === 'design' || decision.editKind === 'redesign' ? decision.editKind : 'none';`.

- [ ] **Step 6: Write the failing chat edit tests** (append to `source-chat-master.spec.ts`; uncomment its `jest.mock('./source-master-check', …)` line if commented in Task 8)

```ts
describe('edits on a master store', () => {
  let refill: jest.Mock;
  const storeData = 'export const store = {"name":"Café Buna","tagline":"","city":"","logo":"","phone":""} as const;\nexport const photos: Record<string, string> = {"hero":"https://x/h.jpg","story":""};\nexport const copy = {"headline":"Hecho con cuidado"} as const;\nexport const look = {"palette":"terracotta","fonts":"classic","colors":{}} as const;\n';
  beforeEach(() => {
    refill = jest.fn().mockResolvedValue({ revision: 3, label: 'Textos y estilo actualizados' });
    const projects = { current: jest.fn().mockResolvedValue({ revision: 2 }), version: jest.fn().mockResolvedValue({ snapshot: { brief: { templateId: 'esencial', sitePurpose: 'shop' }, files: [{ path: 'components/store-data.tsx', content: storeData }] } }) };
    chat = new SourceChatService(prisma, projects as any, generation(), { decide, fillMaster } as any, { apply: jest.fn(), applyMaster, refill } as any, { get: (key: string) => config.get(key) } as unknown as ConfigService);
  });
  const edit = (instruction: string) => chat.send('m1', 's1', { revision: 2, instruction, requestId: uuid() }) as Promise<any>;
  const decided = (editKind: string) => decide.mockResolvedValueOnce({ action: 'generate', reply: '', summary: 's', generationInstruction: 'x', imageUses: [], startFrom: 'unknown', editKind });

  it('a content edit changes data only, through one fill call', async () => {
    decided('content');
    fillMaster.mockResolvedValueOnce({ headline: 'Café de altura', changed: ['headline'], values: [], palette: 'terracotta', fonts: 'classic', colors: {}, heroPhoto: -1, storyPhoto: -1 });
    const out = await edit('Cambia el título a «Café de altura»');
    expect(refill).toHaveBeenCalledWith('m1', 's1', 2, { copy: { headline: 'Café de altura' } }, expect.any(String));
    expect(generate).not.toHaveBeenCalled();
    expect(out.revision).toMatchObject({ revision: 3 });
    expect(fillMaster.mock.calls[0][1]).toMatchObject({ request: 'Cambia el título a «Café de altura»', current: { copy: { headline: 'Hecho con cuidado' } } });
  });

  it('a content edit that changes nothing saves nothing and says so', async () => {
    decided('content');
    fillMaster.mockResolvedValueOnce({ changed: [], values: [], palette: 'terracotta', fonts: 'classic', colors: {}, heroPhoto: -1, storyPhoto: -1 });
    const out = await edit('Déjalo bonito');
    expect(refill).not.toHaveBeenCalled();
    expect(out.assistantMessage.content).toMatch(/qué cambiar/);
  });

  it('a design edit goes to the agent with the minimal-edit rules', async () => {
    decided('design');
    generate.mockResolvedValueOnce({ revision: 3, label: 'Reseñas arriba' });
    await edit('Mueve las reseñas arriba de los productos');
    expect(generate.mock.calls[0][2].instruction).toContain('Edita el componente que ya existe');
  });
});
```

- [ ] **Step 7: Run them to verify they fail**

Run: `cd apps/api && npx jest src/storefront-source/source-chat-master.spec.ts` → the three new tests FAIL.

- [ ] **Step 8: Implement the edit routing**

In `source-chat.service.ts`, beside `MASTER_SCRATCH`:
```ts
/** Spec 2026-10-19 §3.2: how the agent edits a master store — the Amboras rule set, in YAPI's words. */
export const MASTER_EDIT_RULES = 'Esta tienda usa la plantilla base «Esencial». Edita el componente que ya existe; cambia solo lo que el comercio pidió; nunca reescribas una página completa ni cambies secciones que no nombró. Los textos visibles viven en components/store-data.tsx (copy): úsalos, no los copies dentro de los componentes. No toques el bloque /* pagosya:master-theme */ de styles/globals.css. Íconos: solo los de components/icons.tsx. Sin emojis.';
```
Right after the Task 8 branch (still before the «Elige tu estilo» comment), insert:
```ts
      const masterStore = this.config.get<boolean>('app.yapiMasterTemplate') === true && Boolean(current.revision) && previousBrief?.templateId === MASTER_TEMPLATE_ID;
      if (masterStore && decision.editKind === 'content') return await this.masterContentEdit(merchantId, storeId, thread.id, userMessage, workflow, input.instruction, current.revision, previous!);
      const masterDesign = masterStore && decision.editKind === 'design';
```
If `previousBrief` is declared after this point in the current code, move these lines below its declaration (they must run before the `run = …generate(…)` call). Then:
- change `const keepTemplate = Boolean(current.revision && …)` to `const keepTemplate = masterDesign || Boolean(current.revision && …)` (the existing condition unchanged after `||`);
- change `const requested = templateBrief ? … : input.instruction;` to
  `const requested = masterDesign ? `${MASTER_EDIT_RULES}\n\nPedido del comercio: ${input.instruction}` : templateBrief ? `${templateBrief}\n\nPedido del comercio: ${input.instruction}` : input.instruction;`
  (`proposeStyle` already excludes `keepTemplate`, so a design edit never shows style cards.)

After the `if ('styleProposal' in revision) { … }` block, before the success reply is composed:
```ts
      let layoutNote = '';
      let checkedRevision = revision;
      if (masterDesign) {
        const saved = await this.projects.version(merchantId, storeId, revision.revision);
        const findings = await masterLayoutFindings(saved.snapshot as unknown as SourceProjectSnapshot).catch(() => [] as string[]);
        if (findings.length) {
          const repaired = await this.generation.generate(merchantId, storeId, { revision: revision.revision, brief, instruction: `${MASTER_EDIT_RULES}\n\nCorrige solo esto, sin ningún otro cambio:\n- ${findings.join('\n- ')}`, model: input.model, maxCredits: input.maxCredits },
            this.generation.newBudget(input.maxCredits), [], workflow.report, {}).catch(() => null);
          if (repaired && !('styleProposal' in repaired)) checkedRevision = repaired;
          const after = checkedRevision !== revision ? await masterLayoutFindings((await this.projects.version(merchantId, storeId, checkedRevision.revision)).snapshot as unknown as SourceProjectSnapshot).catch(() => findings) : findings;
          layoutNote = after.length ? ` Revisé la página y queda esto por mejorar: ${after.join(' ')}` : '';
        }
      }
```
Use `checkedRevision` where the code below uses `revision`/`finalRevision` for the reply and return, and append `layoutNote` to the success reply's `content`. (Read the 40 lines after the `styleProposal` block first; `finalRevision` there is `const finalRevision = revision;` — make it `const finalRevision = checkedRevision;`.)

Add next to `useMasterTemplate`:
```ts
  /** Spec 2026-10-19 §3.1: a words/colours/fonts/photos change on a master store — one fill call, data only, seconds. */
  private async masterContentEdit(merchantId: string, storeId: string, threadId: string, userMessage: StoreAgentMessage, workflow: ReturnType<typeof createSourceProgress>, request: string, revision: number, previous: { snapshot: unknown }) {
    const state = readMasterState((previous.snapshot as SourceProjectSnapshot).files);
    const manifest = templateManifest(MASTER_TEMPLATE_ID)!;
    const recent = await this.prisma.mediaAsset.findMany({ where: { merchantId }, orderBy: { createdAt: 'desc' }, take: 8, select: { url: true } }).catch(() => [] as Array<{ url: string }>);
    const photos = [...new Set([...Object.values(state.photos).filter(Boolean), ...recent.map(asset => asset.url)])].slice(0, 8);
    const read = await this.dialogue.fillMaster(merchantId, { storeId, storeName: state.store?.name ?? '', what: '', story: '', city: state.store?.city ?? '', products: [], photos,
      palettes: manifest.master!.palettes.map(({ id, name }) => ({ id, name })), fonts: manifest.master!.fonts.map(({ id, name }) => ({ id, name })),
      current: { copy: masterCopy(manifest.master!, state.copy ?? {}), look: masterLook(manifest.master!, state.look ?? {}) }, request });
    const change = read ? masterFillFromRead(read, photos, true) : null;
    if (!change || !Object.keys(change).length) {
      await workflow.finish(change ? 'completed' : 'failed');
      const assistantMessage = await this.prisma.storeAgentMessage.create({ data: { threadId, channel: 'source', role: 'ASSISTANT',
        content: change ? 'No encontré qué cambiar con ese pedido. Dime qué texto, color, fuente o foto quieres distinto.' : 'No pude aplicar el cambio en este momento. Inténtalo de nuevo en un momento.',
        metadata: { progress: workflow.value, ...(change ? {} : { failed: true }) } } });
      return { userMessage, assistantMessage, setup: null };
    }
    await workflow.report('saving');
    const saved = await this.templates.refill(merchantId, storeId, revision, change, 'Textos y estilo actualizados');
    await workflow.finish('completed');
    const assistantMessage = await this.prisma.storeAgentMessage.create({ data: { threadId, channel: 'source', role: 'ASSISTANT',
      content: 'Listo, ya está aplicado. Revisa la vista previa.', metadata: { progress: workflow.value, sourceRevision: saved.revision, label: saved.label } } });
    return { userMessage, assistantMessage, revision: saved };
  }
```
Imports: `readMasterState` from `./source-templates`; `masterCopy, masterLook` from `./source-master` (beside `MASTER_TEMPLATE_ID, masterFillFromRead`); `masterLayoutFindings` from `./source-master-check`. Pass `masterTemplate: previousBrief?.templateId === MASTER_TEMPLATE_ID` into the `this.dialogue.decide({ … })` input. If merchant uploads are not listed through `prisma.mediaAsset` elsewhere in this service, use the same source `allAssets` is built from.

- [ ] **Step 9: Run the tests**

Run: `cd apps/api && npx jest src/storefront-source/source-chat-master.spec.ts src/storefront-source/source-master-check.spec.ts src/storefront-source/source-chat.service.spec.ts src/storefront-source/source-chat-style.spec.ts --maxWorkers=2` → PASS. Update an older spec's `decide` mock only if a strict assertion on the whole decision object breaks on the new `editKind`.

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/storefront-source/source-conversation.service.ts apps/api/src/storefront-source/source-chat.service.ts apps/api/src/storefront-source/source-master-check.ts apps/api/src/storefront-source/source-master-check.spec.ts apps/api/src/storefront-source/source-chat-master.spec.ts
git commit -m "feat(yapi): content edits refill the master template, design edits stay minimal and are checked"
```

---

### Task 10: Live check — owner gate

**Files:** none (verification only).

- [ ] **Step 1: Ask the owner**

Ask for approval to run the live check on the ChatGPT plan and to restart their dev stack with `pnpm dev:chatgpt` (so the API reads `YAPI_FRAME_DRAW=off`, `YAPI_DESIGN_DRAW=off` and the new flag default). Do not restart anything without that approval. Rebuild the Studio first: `cd apps/merchant-dashboard && pnpm run build:studio`.

- [ ] **Step 2: Three new stores**

With a test merchant (never the owner's real stores), go through the walkthrough three times — a café, a clothing shop, a beauty brand — each with 2–3 photos and 2–3 products. For each, record the time from «Crear mi tienda» to the saved store (target < 30 s) and screenshot home at 1440 and 390 and one product page. Confirm: no style cards, no demo photo, Spanish copy with no invented facts, no Plantillas button or menu entry.

- [ ] **Step 3: Two edits on one store**

On the café: send «Cambia los colores a verde y el título a "Café de altura"» (content: seconds, only those fields change), then «Mueve las reseñas arriba de los productos» (design: agent edit, layout note or none). Screenshot both results.

- [ ] **Step 4: Report**

Give the owner the times and screenshots and list anything that looked wrong. Update `~/.claude/projects/-Users-saramia-pagosYa/memory/project_amboras_reverse_engineering.md` with what was built and verified.
