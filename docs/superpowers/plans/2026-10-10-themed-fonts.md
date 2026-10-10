# Themed Fonts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stores written by the Sep-5 author load their concept's fonts, and the catalogue gains 22 themed OFL families.

**Architecture:** A pure helper turns the selected concept's DNA into a TYPE paragraph that the Sep-5 author (and its self-review) receives; `withSourceFonts` already bundles any `assets/<id>.ttf` the CSS references. New families are fetched by a small script that writes the `.ttf`, its OFL licence and a provenance record, then added to `SOURCE_FONT_CATALOG`, which drives the prompt, the DNA enum and the bundler.

**Tech Stack:** NestJS API (Jest), fontkit 2.0.4, `packages/storefront-kit/kit/fonts`, Node 26 `fetch`.

**Spec:** `docs/superpowers/specs/2026-10-10-themed-fonts-design.md`

## Global Constraints

- Every new family is SIL OFL, from `https://raw.githubusercontent.com/google/fonts/main/ofl/<dir>/<file>`, TrueType (first 4 bytes `0x00010000`), `.ttf` under 600 KB.
- Every font covers `á é í ó ú ü ñ Á É Í Ó Ú Ü Ñ ¿ ¡`.
- Files are `<id>.ttf` and `<id>-OFL.txt`; `provenance.json` records `file`, `source`, `gitBlob`, `sha256`.
- Absent fonts input, `sep5AuthorPrompt` stays byte-identical to September 5.
- Default pair when a concept names no catalogue font: display `bricolage`, text `instrument`.
- Never run `prisma migrate|diff|reset|push`.

## Review Focus

- **A concept with no DNA or a font id that isn't catalogued** (older saved designs): the TYPE paragraph uses the default pair. Pinned in Task 1.
- **Display and text are the same family:** one `@font-face` line, not two. Pinned in Task 1.
- **The self-review rewrites the CSS:** it receives the same TYPE paragraph, so it keeps the fonts. Pinned in Task 1.
- **A family's upstream file changes later:** provenance pins the git blob and SHA-256, and the catalogue test fails on a mismatch. Existing test.
- **An existing font lacks a Spanish glyph:** the coverage test runs over the whole catalogue; a failing old font is reported, not silently skipped. Pinned in Task 3.

---

### Task 1: The Sep-5 author loads the concept's fonts

**Files:**
- Modify: `apps/api/src/storefront-source/design-engine/sep5-author.ts`
- Modify: `apps/api/src/storefront-source/source-generation.service.ts` (the `authorInput` object in the Sep-5 branch)
- Test: `apps/api/src/storefront-source/design-engine/sep5-author.spec.ts`

**Interfaces:**
- Produces: `sep5FontDirection(design: { concepts: Array<{ dna?: { type?: { display?: string; text?: string } } }>; selected: number } | undefined): string`; `sep5AuthorPrompt` input `fonts?: string`.

- [ ] **Step 1: Write the failing tests** (append to `sep5-author.spec.ts`; add `sep5FontDirection` to its import)

```ts
it('names the concept fonts and how to load them, falling back to the default pair', () => {
  const design = (display?: string, text?: string) => ({ selected: 0, concepts: [{ dna: { type: { display, text } } }] });
  const direction = sep5FontDirection(design('big-shoulders-display', 'instrument'));
  expect(direction).toMatch(/^TYPE: /);
  expect(direction).toContain('Big Shoulders Display');
  expect(direction).toContain('url("assets/big-shoulders-display.ttf")');
  expect(direction).toContain('url("assets/instrument.ttf")');
  expect(direction).toContain('Never load fonts from another site');
  const fallback = sep5FontDirection(design('comic-sans', undefined));
  expect(fallback).toContain('url("assets/bricolage.ttf")');
  expect(fallback).toContain('url("assets/instrument.ttf")');
  expect(sep5FontDirection(undefined)).toContain('url("assets/bricolage.ttf")');
  const single = sep5FontDirection(design('rubik', 'rubik'));
  expect(single.match(/@font-face/g)).toHaveLength(1);
});

it('asks for the fonts before the choreography, keeps them in the self-review, and keeps September 5 intact without them', () => {
  const base = { brief: {}, instruction: 'Hazme la tienda', data: {}, assetLegend: [] };
  const fonts = sep5FontDirection({ selected: 0, concepts: [{ dna: { type: { display: 'anton', text: 'manrope' } } }] });
  const prompt = sep5AuthorPrompt({ ...base, fonts, motionPlan: 'MOTION CHOREOGRAPHY: x' });
  expect(prompt.indexOf('TYPE: ')).toBeGreaterThan(-1);
  expect(prompt.indexOf('TYPE: ')).toBeLessThan(prompt.indexOf('MOTION CHOREOGRAPHY'));
  expect(sep5ReviewPrompt({ ...base, fonts, draft: [], measured: [] })).toContain('url("assets/anton.ttf")');
  expect(sep5AuthorPrompt({ ...base, fonts: '  ' })).toBe(sep5AuthorPrompt(base));
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd apps/api && npx jest src/storefront-source/design-engine/sep5-author.spec.ts`
Expected: FAIL, `sep5FontDirection` is not exported and `fonts` is not a known property.

- [ ] **Step 3: Implement** in `sep5-author.ts`

Add the imports `import { SOURCE_FONT_CATALOG } from '../source-font-catalog';` and `import { SOURCE_FONT_CHOICES } from '../source-fonts';`. Add to the input type, after `boldDefault`:

```ts
  /** The selected concept's fonts (sep5FontDirection). Absent or blank, the prompt stays byte-identical to September 5. */
  fonts?: string;
```

In the returned array, after the `boldDefault` entry:

```ts
    ...(input.fonts?.trim() ? [input.fonts.trim()] : []),
```

And the helper, before `sep5BoldDefault`:

```ts
/**
 * Authored stores shipped Georgia and Arial: the planner chose a font and the author was never told it could load it
 * (2026-10-10). The kit bundles any assets/<id>.ttf the CSS references, so naming the file is all that was missing.
 */
export function sep5FontDirection(design: { concepts: Array<{ dna?: { type?: { display?: string; text?: string } } }>; selected: number } | undefined): string {
  const type = design?.concepts?.[design.selected]?.dna?.type;
  const pick = (id: string | undefined, fallback: string) => SOURCE_FONT_CATALOG.find(font => font.id === id) ?? SOURCE_FONT_CATALOG.find(font => font.id === fallback)!;
  const display = pick(type?.display, 'bricolage');
  const text = pick(type?.text, 'instrument');
  const faces = [...new Map([display, text].map(font => [font.id, font])).values()]
    .map(font => `@font-face { font-family: "${font.family}"; src: url("assets/${font.id}.ttf") format("truetype"); font-display: swap; }`).join(' ');
  return `TYPE: The selected concept sets display type in ${display.family} and text in ${text.family}. Load them exactly like this and use them for headings and body: ${faces} ${SOURCE_FONT_CHOICES} Never load fonts from another site.`;
}
```

- [ ] **Step 4: Wire it** in `source-generation.service.ts`

Add `sep5FontDirection` to the existing import from `./design-engine/sep5-author`, and in the `authorInput` object add, right after `boldDefault: …,`:

```ts
fonts: sep5FontDirection(committedDesign),
```

- [ ] **Step 5: Run the tests and type-check**

Run: `cd apps/api && npx jest src/storefront-source/design-engine/sep5-author.spec.ts && npx tsc --noEmit -p tsconfig.json`
Expected: all pass, tsc exits 0. If `committedDesign` is not in scope at `authorInput`, read the design from `previousFiles`' `design-direction.json` through `savedSourceDesign` instead and record that as a ruling.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/storefront-source/design-engine/sep5-author.ts apps/api/src/storefront-source/design-engine/sep5-author.spec.ts apps/api/src/storefront-source/source-generation.service.ts
git commit -m "feat(yapi): the Sep-5 author loads its concept's fonts from the self-hosted catalogue instead of Georgia and Arial"
```

---

### Task 2: A script that adds a Google Fonts family with provenance

**Files:**
- Create: `packages/storefront-kit/scripts/add-font.mjs`

**Interfaces:**
- Produces: `node packages/storefront-kit/scripts/add-font.mjs <id> <ofl-dir> <ttf-file>` writes `kit/fonts/<id>.ttf`, `kit/fonts/<id>-OFL.txt` and two `provenance.json` records; refuses non-TrueType or files over 600 KB.

- [ ] **Step 1: Write the script**

```js
// Adds one OFL family from google/fonts with its licence and provenance. Usage: add-font.mjs <id> <ofl-dir> <ttf-file>
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const [id, dir, ttf] = process.argv.slice(2);
if (!id || !dir || !ttf) throw new Error('usage: add-font.mjs <id> <ofl-dir> <ttf-file>');
const fonts = join(dirname(fileURLToPath(import.meta.url)), '..', 'kit', 'fonts');
const raw = name => `https://raw.githubusercontent.com/google/fonts/main/ofl/${dir}/${encodeURIComponent(name)}`;
const gitBlob = bytes => createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
const fetchBytes = async url => { const response = await fetch(url); if (!response.ok) throw new Error(`${response.status} ${url}`); return Buffer.from(await response.arrayBuffer()); };

const font = await fetchBytes(raw(ttf));
if (font.readUInt32BE(0) !== 0x00010000) throw new Error(`${ttf} is not TrueType`);
if (font.length > 600_000) throw new Error(`${ttf} is ${font.length} bytes, over 600 KB`);
const licence = await fetchBytes(raw('OFL.txt'));
if (!licence.toString('utf8').toUpperCase().includes('SIL OPEN FONT LICENSE')) throw new Error(`${dir}/OFL.txt is not the OFL`);

const provenancePath = join(fonts, 'provenance.json');
const provenance = JSON.parse(await readFile(provenancePath, 'utf8')).filter(entry => ![`${id}.ttf`, `${id}-OFL.txt`].includes(entry.file));
for (const [file, bytes, source] of [[`${id}.ttf`, font, raw(ttf)], [`${id}-OFL.txt`, licence, raw('OFL.txt')]]) {
  await writeFile(join(fonts, file), bytes);
  provenance.push({ file, source, gitBlob: gitBlob(bytes), sha256: createHash('sha256').update(bytes).digest('hex') });
}
await writeFile(provenancePath, `${JSON.stringify(provenance, null, 2)}\n`);
console.log(`${id}: ${font.length} bytes`);
```

- [ ] **Step 2: Try it on one family and check the record**

Run: `node packages/storefront-kit/scripts/add-font.mjs staatliches staatliches Staatliches-Regular.ttf && tail -12 packages/storefront-kit/kit/fonts/provenance.json`
Expected: `staatliches: 63316 bytes`, and two records whose `gitBlob` for the `.ttf` matches the blob GitHub lists for `ofl/staatliches/Staatliches-Regular.ttf`. (Leave the files; Task 3 catalogues them.)

- [ ] **Step 3: Commit**

```bash
git add packages/storefront-kit/scripts/add-font.mjs
git commit -m "chore(storefront-kit): a script that adds a google/fonts OFL family with its licence and provenance"
```

---

### Task 3: Catalogue 22 themed families, Spanish-checked

**Files:**
- Modify: `apps/api/src/storefront-source/source-font-catalog.ts` (the `FONTS` array)
- Modify: `apps/api/src/storefront-source/source-font-catalog.spec.ts`
- Add: `packages/storefront-kit/kit/fonts/*` (via the script)

**Interfaces:**
- Consumes: `add-font.mjs` (Task 2).
- Produces: 22 new `SOURCE_FONT_CATALOG` entries; `SOURCE_DNA_ENUMS.type.display` grows with them automatically.

- [ ] **Step 1: Write the failing tests** (in `source-font-catalog.spec.ts`; add `import * as fontkit from 'fontkit';` at the top)

```ts
  it('covers Spanish in every font, and keeps every file light enough for a store', () => {
    const missing: string[] = [];
    for (const font of SOURCE_FONT_CATALOG) {
      const face = fontkit.openSync(kitPath('fonts', font.file));
      for (const char of 'áéíóúüñÁÉÍÓÚÜÑ¿¡') if (!face.hasGlyphForCodePoint(char.codePointAt(0)!)) missing.push(`${font.id} ${char}`);
    }
    expect(missing).toEqual([]);
    for (const font of SOURCE_FONT_CATALOG.slice(30)) expect(readFileSync(kitPath('fonts', font.file)).length).toBeLessThan(600_000);
  });

  it('has themed faces a business story can call for', () => {
    const personalities = new Set(SOURCE_FONT_CATALOG.flatMap(font => font.personality));
    for (const kind of ['typewriter', 'stencil', 'techno', 'script', 'handwritten', 'chunky', 'neon', 'fashion', 'brutal', 'sports']) expect(personalities).toContain(kind);
  });
```

Run: `cd apps/api && npx jest src/storefront-source/source-font-catalog.spec.ts`
Expected: the themed-faces test FAILS (no `typewriter`…); the "nothing left over" test FAILS because `staatliches.ttf` from Task 2 is on disk but not catalogued. If the Spanish test fails for an existing font, stop and record a ruling (drop that font from the check list only with the owner's say).

- [ ] **Step 2: Fetch the remaining 21 families**

```bash
cd /Users/saramia/pagosYa && S=packages/storefront-kit/scripts/add-font.mjs
node $S courier-prime courierprime CourierPrime-Regular.ttf
node $S big-shoulders-stencil bigshouldersstencildisplay 'BigShouldersStencilDisplay[wght].ttf'
node $S black-ops-one blackopsone BlackOpsOne-Regular.ttf
node $S stardos-stencil stardosstencil StardosStencil-Bold.ttf
node $S teko teko 'Teko[wght].ttf'
node $S barlow-condensed barlowcondensed BarlowCondensed-Bold.ttf
node $S orbitron orbitron 'Orbitron[wght].ttf'
node $S audiowide audiowide Audiowide-Regular.ttf
node $S michroma michroma Michroma-Regular.ttf
node $S pacifico pacifico Pacifico-Regular.ttf
node $S caveat caveat 'Caveat[wght].ttf'
node $S kaushan-script kaushanscript KaushanScript-Regular.ttf
node $S lobster lobster Lobster-Regular.ttf
node $S bungee bungee Bungee-Regular.ttf
node $S titan-one titanone TitanOne-Regular.ttf
node $S bowlby-one bowlbyone BowlbyOne-Regular.ttf
node $S fredoka fredoka 'Fredoka[wdth,wght].ttf'
node $S monoton monoton Monoton-Regular.ttf
node $S righteous righteous Righteous-Regular.ttf
node $S abril-fatface abrilfatface AbrilFatface-Regular.ttf
node $S archivo-black archivoblack ArchivoBlack-Regular.ttf
```
Expected: 21 lines of `<id>: <bytes> bytes`. Cormorant Garamond (1.2 MB) and Dela Gothic One (2.5 MB) are left out: they fail the spec's 600 KB check.

- [ ] **Step 3: Catalogue them** (append to `FONTS`, after `bodoni-moda`)

```ts
  // Themed faces (spec 2026-10-10 part B): type a business story can call for, not one more tasteful grotesk.
  { id: 'courier-prime', family: 'Courier Prime', role: 'both', personality: ['typewriter', 'mono', 'literary'], weights: '400' },
  { id: 'big-shoulders-stencil', family: 'Big Shoulders Stencil Display', role: 'display', personality: ['stencil', 'condensed', 'industrial'], weights: '100–900' },
  { id: 'black-ops-one', family: 'Black Ops One', role: 'display', personality: ['stencil', 'military', 'heavy'], weights: '400' },
  { id: 'stardos-stencil', family: 'Stardos Stencil', role: 'display', personality: ['stencil', 'serif', 'crate'], weights: '700' },
  { id: 'staatliches', family: 'Staatliches', role: 'display', personality: ['sports', 'condensed', 'workwear'], weights: '400' },
  { id: 'teko', family: 'Teko', role: 'display', personality: ['sports', 'condensed', 'athletic'], weights: '300–700' },
  { id: 'barlow-condensed', family: 'Barlow Condensed', role: 'both', personality: ['sports', 'condensed', 'signage'], weights: '700' },
  { id: 'orbitron', family: 'Orbitron', role: 'display', personality: ['techno', 'geometric', 'futuristic'], weights: '400–900' },
  { id: 'audiowide', family: 'Audiowide', role: 'display', personality: ['techno', 'retro-future', 'wide'], weights: '400' },
  { id: 'michroma', family: 'Michroma', role: 'display', personality: ['techno', 'extended', 'precise'], weights: '400' },
  { id: 'pacifico', family: 'Pacifico', role: 'display', personality: ['script', 'surf', 'retro'], weights: '400' },
  { id: 'caveat', family: 'Caveat', role: 'display', personality: ['handwritten', 'casual', 'note'], weights: '400–700' },
  { id: 'kaushan-script', family: 'Kaushan Script', role: 'display', personality: ['script', 'brush', 'energetic'], weights: '400' },
  { id: 'lobster', family: 'Lobster', role: 'display', personality: ['script', 'retro', 'diner'], weights: '400' },
  { id: 'bungee', family: 'Bungee', role: 'display', personality: ['chunky', 'signage', 'urban'], weights: '400' },
  { id: 'titan-one', family: 'Titan One', role: 'display', personality: ['chunky', 'playful', 'rounded'], weights: '400' },
  { id: 'bowlby-one', family: 'Bowlby One', role: 'display', personality: ['chunky', 'heavy', 'poster'], weights: '400' },
  { id: 'fredoka', family: 'Fredoka', role: 'both', personality: ['rounded', 'playful', 'friendly'], weights: '300–700' },
  { id: 'monoton', family: 'Monoton', role: 'display', personality: ['neon', 'retro', 'inline'], weights: '400' },
  { id: 'righteous', family: 'Righteous', role: 'display', personality: ['neon', 'retro', 'deco'], weights: '400' },
  { id: 'abril-fatface', family: 'Abril Fatface', role: 'display', personality: ['fashion', 'didone', 'heavy'], weights: '400' },
  { id: 'archivo-black', family: 'Archivo Black', role: 'display', personality: ['brutal', 'grotesk', 'heavy'], weights: '400' },
```

- [ ] **Step 4: Run the catalogue, fonts, DNA and logo specs**

Run: `cd apps/api && npx jest src/storefront-source/source-font-catalog.spec.ts src/storefront-source/source-fonts src/storefront-source/source-dna src/store-seo`
Expected: all pass. If a variable font's real weight range differs from the entry (read it with `fontkit.openSync(path).variationAxes.wght`), correct the entry, not the test.

- [ ] **Step 5: Commit**

```bash
git add packages/storefront-kit/kit/fonts apps/api/src/storefront-source/source-font-catalog.ts apps/api/src/storefront-source/source-font-catalog.spec.ts
git commit -m "feat(yapi): 22 themed OFL font families (typewriter, stencil, sports, techno, script, chunky, neon, fashion, brutal), Spanish-checked"
```

---

### Task 4: Live check

**Files:** none changed.

- [ ] **Step 1:** Wait for the owner's dev API to reload (`dist` holds `sep5FontDirection`), then redesign the Pulso Pilates test store from the Studio ("Rediseña la tienda desde cero con un concepto nuevo, usando las mismas fotos."). Do not use a browser tab the owner is working in.
- [ ] **Step 2:** Read the saved revision: its CSS has `@font-face` with `assets/<id>.ttf` for the concept's display and text fonts, and the project contains those `.ttf` files.
- [ ] **Step 3:** Report the concept, its fonts and what loaded, with a screenshot.
