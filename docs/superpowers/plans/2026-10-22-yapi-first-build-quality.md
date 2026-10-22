# YAPI First-Build Quality Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A store YAPI builds by itself looks as good as the hand-built goodProtein #1: its colours come from the merchant's photos, it reads as the right kind of business, and it can use tested motion pieces and spotlight sections.

**Architecture:** Fix the four causes found in the 2026-10-22 goodProtein #2 run, each at its source: (1) the model rule gives a store's first build the strong model; (2) the photo palette reaches the one-shot author even when `YAPI_FRAME_DRAW=off`, and wins over playbook palettes; (3) a health/supplements business kind stops protein shops being read as cafés; (4) the storefront kit ships motion pieces (`data-pya-motion`) and YAPI's author and agent prompts learn them plus spotlight-section patterns. A live run on a fresh store, YAPI only, proves it.

**Tech Stack:** NestJS API (TypeScript, Jest), storefront kit (plain JS parts concatenated into `kit/commerce.js`), Playwright Studio tests.

**Spec:** this plan carries its own findings (no separate spec). Evidence, from the 2026-10-22 run on store `bi3bnttx` (generation `cmvjjt1z5000bwm1lzu5a58dm`):
- model `gpt-5.6-terra`, design phase reasoning `low`; PEPPA please (good) ran `gpt-5.6-sol` with the agent engine.
- `source-generation-policy.ts:37` gives `gpt-5.6-sol` only when `complex && revision > 0`, so every first build gets terra/luna.
- the authored `:root` is `#f7f4ef / #1a1f2b / #2f4bb8` = playbook palette `cafe-paper-blue` (`design-engine/playbook.ts`, kind `cafe-food`).
- the follow-up question «¿De dónde viene tu café…?» is the `cafe-food` playbook question.
- `photoPalettes` are computed in `source-generation.service.ts:586` but only used through `frameForRun`, gated by `app.yapiFrameDraw` (`YAPI_FRAME_DRAW=off` in the dev `.env`).
- the Sep-5 author prompt has a motion plan but no ready-made motion pieces; the kit has only `data-reveal`.

## Global Constraints

- Every user-facing word in Spanish (Bolivia), same voice as existing prompts and UI.
- Motion pieces: every animation inside `@media (prefers-reduced-motion: no-preference)`; transforms/opacity only; never on body text, navigation, cart, product selectors or checkout.
- No new dependencies.
- Existing pinned-prompt tests keep passing: new author inputs are optional and, when absent, the Sep-5 prompt stays byte-identical (the file's existing rule).
- After any kit edit: `node packages/storefront-kit/tools/build-commerce.mjs`, then `pnpm --filter @pagosya/merchant-dashboard run build:studio`.
- Never edit `apps/api` while a YAPI job is RUNNING (saving restarts the API and kills the job): check `StoreSourceChatJob` status first.
- Test stores for the live check are designed by YAPI only; scripts may create the catalog only (memory: test-stores-designed-by-yapi).

## Review Focus

1. A store with **no photos** (only a logo, or nothing): the colour line must be absent, not «colours from undefined»; the playbook palette still applies.
2. A **merchant who names colours** («quiero verde y negro»): the merchant's words beat the photo palette.
3. A protein store whose products are **flavoured like sweets** («sabor galleta», «brownie»): still `health-supplements`, never `bakery-sweets`.
4. **Reduced motion** on: no piece moves; pieces also never animate inside the checkout overlay or the cart drawer.
5. A **calm business** (law firm, wedding planner) asking nothing about energy: YAPI uses at most gentle pieces (`breathe`, `zoom`, `pop`), never `bubbles`/`spin`.

---

## File Structure

| File | Responsibility |
|---|---|
| `apps/api/src/storefront-source/source-generation-policy.ts` | model rule: first build → sol |
| `apps/api/src/storefront-source/design-engine/photo-palette.ts` | new `storeColoursDirection()` — the photo palette as one prompt line |
| `apps/api/src/storefront-source/design-engine/sep5-author.ts` | new optional inputs `storeColours`, `motionPieces`; appended before the motion choreography |
| `apps/api/src/storefront-source/source-sep5-stage.ts` | passes them into `authorInput` |
| `apps/api/src/storefront-source/source-generation-types.ts` | `GenerationRunFacts.storePhotoPalettes` |
| `apps/api/src/storefront-source/source-generation.service.ts` | stores the computed palettes on the run facts; agent prompt gets the same two lines |
| `apps/api/src/storefront-source/design-engine/playbook.ts` | new kind `health-supplements` (words, entry, families, questions) |
| `apps/api/src/storefront-source/source-motion-pieces.ts` (new) | the motion-pieces + spotlight vocabulary text, `asksForEnergy()`, `motionPieceCount()` |
| `packages/storefront-kit/commerce-src/look/motion-pieces.js` (new part) | the CSS + offscreen pause for `data-pya-motion` |
| `packages/storefront-kit/tools/build-commerce.mjs` | lists the new part |
| tests beside each file | |

---

### Task 1: A store's first build uses the strong model

**Files:**
- Modify: `apps/api/src/storefront-source/source-generation-policy.ts:30-41`
- Test: `apps/api/src/storefront-source/source-generation-policy.spec.ts`

**Interfaces:**
- Produces: `sourceGenerationPlan('auto', 0, instruction).model === 'gpt-5.6-sol'` for any first build; unchanged for `revision > 0`.

> Cost note for the owner: on the ChatGPT plan this costs nothing; for metered merchants a first build on sol costs about 2× terra (sol $4/$20 vs terra $2/$12 per M tokens; a first build is ~40–60k tokens, roughly Bs 3–6). First impressions are where quality matters most.

- [ ] **Step 1: Write the failing test** (append to the spec)

```ts
describe('first build model (owner 2026-10-22: goodProtein #2 built on terra looked far worse than PEPPA on sol)', () => {
  it('gives a store its strong model for the first build, whatever the wording', () => {
    for (const instruction of ['Diseña desde cero la tienda goodProtein, sin plantilla.', 'Una tienda de velas', 'hola'])
      expect(sourceGenerationPlan('auto', 0, instruction)).toMatchObject({ model: 'gpt-5.6-sol', reasoningEffort: 'medium' });
  });
  it('keeps the existing rule after the first build', () => {
    expect(sourceGenerationPlan('auto', 3, 'cambia el color del botón').model).toBe('gpt-5.6-luna');
    expect(sourceGenerationPlan('auto', 3, 'agrega una página de contacto y cambia el checkout').model).toBe('gpt-5.6-sol');
  });
  it('still honours a model the merchant chose', () => {
    expect(sourceGenerationPlan('gpt-5.6-terra', 0, 'Una tienda de velas').model).toBe('gpt-5.6-terra');
  });
});
```

- [ ] **Step 2: Run it** — `cd apps/api && npx jest src/storefront-source/source-generation-policy.spec.ts --runInBand` — Expected: FAIL (first case gets `gpt-5.6-terra`).

- [ ] **Step 3: Implement** — replace the `model` line and the returned `reason`:

```ts
  const firstBuild = revision === 0;
  const model: SourceModel = choice === 'auto' ? firstBuild || (complex && revision > 0) ? 'gpt-5.6-sol' : simple ? 'gpt-5.6-luna' : 'gpt-5.6-terra' : choice;
  return { requestedModel: choice, model, reasoningEffort: simple ? 'low' as const : 'medium' as const,
    maxOutputTokens: revision === 0 ? 12000 : simple ? 4000 : 10000,
    reason: choice !== 'auto' ? 'Modelo elegido por ti.' : firstBuild ? 'Primer diseño de tu tienda.' : complex ? 'Cambio de funcionalidad.' : simple ? 'Ajuste puntual.' : 'Diseño y composición del sitio.' };
```

- [ ] **Step 4: Run the spec and every spec that pins model choice** — `npx jest src/storefront-source/source-generation-policy.spec.ts src/storefront-source/source-generation.service.spec.ts --runInBand` — Expected: PASS. Where an older test pinned terra for revision 0, update it to sol with a comment citing this task.

- [ ] **Step 5: The design phase follows** — `grep -n "reasoningEffort" src/storefront-source/source-design-planner.ts`. The run logged `reasoningEffort: 'low'` for the design phase. Pass the plan's `reasoningEffort` through instead of a constant; add to `source-design-planner.spec.ts`: a first-build call records `attempt.reasoningEffort === 'medium'`. Run that spec — PASS.

- [ ] **Step 6: Commit** — `git commit -am "fix(api): a store's first build uses the strong model"`

---

### Task 2: The merchant's photo colours reach every first build

**Files:**
- Modify: `apps/api/src/storefront-source/design-engine/photo-palette.ts` (add exports)
- Modify: `apps/api/src/storefront-source/source-generation-types.ts` (add fact)
- Modify: `apps/api/src/storefront-source/source-generation.service.ts:586` and `:678`
- Modify: `apps/api/src/storefront-source/design-engine/sep5-author.ts` (input + append)
- Modify: `apps/api/src/storefront-source/source-sep5-stage.ts:53` (pass it)
- Test: `apps/api/src/storefront-source/design-engine/photo-palette.spec.ts`, `design-engine/sep5-author.spec.ts`

**Interfaces:**
- Consumes: `photoPalettes(...)` → `{ calm: Palette; bold: Palette } | undefined` (existing).
- Produces: `storeColoursDirection(palettes: { calm: Palette; bold: Palette } | undefined, merchantNamedColours: boolean): string` — `''` without palettes or when the merchant named colours.
- Produces: `merchantNamedColours(text: string): boolean`.
- Produces: `Sep5AuthorInput.storeColours?: string`; `GenerationRunFacts.storePhotoPalettes?: { calm: Palette; bold: Palette }`.

- [ ] **Step 1: Write the failing tests**

`photo-palette.spec.ts`:
```ts
import { merchantNamedColours, storeColoursDirection } from './photo-palette';
const palette = (id: string, paper: string, ink: string, accent: string, accent2: string) => ({ id, name: id, paper, ink, accent, accent2, dark: false });
describe('storeColoursDirection (owner 2026-10-22: «the colours of the site dont even match the colours of the pictures»)', () => {
  const palettes = { calm: palette('photo:a', '#fff6ee', '#2a1a12', '#ef5d1b', '#ffd6e3'), bold: palette('photo:b', '#ef5d1b', '#fff6ee', '#ffe27a', '#2a1a12') };
  it('names the photo colours and forbids unrelated hues', () => {
    const line = storeColoursDirection(palettes, false);
    expect(line).toMatch(/^STORE COLOURS:/);
    for (const hex of ['#fff6ee', '#2a1a12', '#ef5d1b', '#ffd6e3', '#ffe27a']) expect(line).toContain(hex);
    expect(line).toMatch(/do not introduce hues that are not in the photos/i);
  });
  it('is empty without photos or when the merchant named colours', () => {
    expect(storeColoursDirection(undefined, false)).toBe('');
    expect(storeColoursDirection(palettes, true)).toBe('');
  });
  it('notices colours the merchant names', () => {
    expect(merchantNamedColours('quiero verde y negro')).toBe(true);
    expect(merchantNamedColours('tú eliges la estructura, los colores y las secciones')).toBe(false);
  });
});
```
(The last case matters: «tú eliges … los colores» delegates colour — it is not a named colour.)

`sep5-author.spec.ts` (reuse the smallest input the file's existing tests build, here `MINIMAL_INPUT`):
```ts
it('appends the store colours before the motion choreography, and stays byte-identical without them', () => {
  const base = sep5AuthorPrompt(MINIMAL_INPUT);
  expect(sep5AuthorPrompt({ ...MINIMAL_INPUT, storeColours: '' })).toBe(base);
  const withColours = sep5AuthorPrompt({ ...MINIMAL_INPUT, storeColours: 'STORE COLOURS: x', motionPlan: 'MOTION CHOREOGRAPHY: y' });
  expect(withColours.indexOf('STORE COLOURS: x')).toBeGreaterThan(-1);
  expect(withColours.indexOf('STORE COLOURS: x')).toBeLessThan(withColours.indexOf('MOTION CHOREOGRAPHY: y'));
});
```

- [ ] **Step 2: Run** — `npx jest src/storefront-source/design-engine/photo-palette.spec.ts src/storefront-source/design-engine/sep5-author.spec.ts --runInBand` — Expected: FAIL (exports missing; `storeColours` ignored).

- [ ] **Step 3: Implement**

`photo-palette.ts` (append):
```ts
const COLOUR_WORDS = /\b(verde|azul|rojo|negro|blanco|amarillo|rosad?o|naranja|morado|lila|dorado|plateado|beige|celeste|turquesa|fucsia|gris|marr[oó]n|crema|#[0-9a-f]{3,6})\b/i;
/** A merchant who names a colour is obeyed over their photos; «tú eliges los colores» names none. */
export const merchantNamedColours = (text: string): boolean => COLOUR_WORDS.test(text);

/** The merchant's photo colours as one author line (owner 2026-10-22, goodProtein #2: warm orange/pink/yellow photos came out
 *  navy and blue — the café playbook palette — because the photo palette only reached frame-draw, which YAPI_FRAME_DRAW=off skips). */
export function storeColoursDirection(palettes: { calm: Palette; bold: Palette } | undefined, namedColours: boolean): string {
  if (!palettes || namedColours) return '';
  const { calm, bold } = palettes;
  return `STORE COLOURS: Build the palette from the merchant's own photos. Calm set: background ${calm.paper}, text ${calm.ink}, accent ${calm.accent}, second colour ${calm.accent2}. `
    + `Bold set for colour fields and highlights: ${bold.paper}, ${bold.ink}, ${bold.accent}, ${bold.accent2}. Use these hexes in :root; tints and shades of them are fine. `
    + 'Do not introduce hues that are not in the photos, and do not use a playbook or catalogue palette instead.';
}
```

`sep5-author.ts`: add to the input type, under `fonts?: string;`:
```ts
  /** The merchant's photo colours (storeColoursDirection). Absent or blank, the prompt stays byte-identical. */
  storeColours?: string;
```
and in the parts array of `sep5AuthorPrompt`, directly before the `motionPlan` entry:
```ts
    ...(input.storeColours?.trim() ? [input.storeColours.trim()] : []),
```

`source-generation-types.ts`: add to `GenerationRunFacts` (import `Palette` from `./design-engine/frame-draw`):
```ts
  /** Photo palettes from the merchant's photos (photoPalettes), computed once per run; undefined without photos. */
  storePhotoPalettes?: { calm: Palette; bold: Palette };
```

`source-generation.service.ts`: where the run builds its `facts` object (search `const facts` / `facts = {` in `generate`), add `storePhotoPalettes` from the value computed at line 586. If `facts` is built before line 586, assign after: `facts.storePhotoPalettes = storePhotoPalettes ?? undefined;`. At line 678, before the `sourceMotionPlan(...)` entry of the agent task prompt, add `storeColoursDirection(storePhotoPalettes, merchantNamedColours(dto.instruction))` (skipped when empty, the same way the neighbouring entries are).

`source-sep5-stage.ts`: add `'storePhotoPalettes'` to the `facts` `Pick<…>` list of `Sep5StageContext`, import both helpers, and add to `authorInput`:
```ts
storeColours: storeColoursDirection(facts.storePhotoPalettes, merchantNamedColours(dto.instruction)),
```

- [ ] **Step 4: Run** the two specs plus `npx jest src/storefront-source/source-sep5-stage.spec.ts src/storefront-source/source-generation.service.spec.ts --runInBand` and `npx tsc --noEmit -p tsconfig.json` — Expected: PASS, no type errors.

- [ ] **Step 5: Commit** — `git commit -am "fix(api): the merchant's photo colours reach the first build even with the frame draw off"`

---

### Task 3: Health and supplements is its own kind of business

**Files:**
- Modify: `apps/api/src/storefront-source/design-engine/playbook.ts` (type, KIND_WORDS, entry)
- Test: `apps/api/src/storefront-source/design-engine/playbook.spec.ts`

**Interfaces:**
- Produces: `PlaybookKind` gains `'health-supplements'`; `detectKind` returns it for protein/supplement shops; `PLAYBOOK['health-supplements']` (use the map's real exported name — check the file) with protein-shop questions.

- [ ] **Step 1: Write the failing tests**

```ts
describe('health and supplements (owner 2026-10-22: goodProtein got café colours and a café question)', () => {
  it.each([
    'Es una tienda de salud animada que vende proteínas, recuperación y snacks de varias marcas',
    'Protein Pulver Vegano sabor galleta, Bloom Clear Protein, batido de proteína vegetal',
    'suplementos, creatina, colágeno y vitaminas para tu entrenamiento',
  ])('reads «%s» as health-supplements', text => expect(detectKind(text)).toBe('health-supplements'));
  it('leaves a bakery and a café alone', () => {
    expect(detectKind('panadería de masa madre con galletas y tortas')).toBe('bakery-sweets');
    expect(detectKind('cafetería de especialidad, tostamos nuestro café')).toBe('cafe-food');
  });
  it('asks protein-shop questions, never about coffee', () => {
    const questions = PLAYBOOK['health-supplements'].questions;
    expect(questions).toHaveLength(3);
    expect(questions.join(' ')).not.toMatch(/caf[eé]/i);
  });
});
```

- [ ] **Step 2: Run** — `npx jest src/storefront-source/design-engine/playbook.spec.ts --runInBand` — Expected: FAIL.

- [ ] **Step 3: Implement**
1. Add `'health-supplements'` to the `PlaybookKind` union.
2. In `KIND_WORDS`, insert **first** (ties go to the earlier kind; «sabor galleta» must not tip a protein store into sweets):
```ts
  ['health-supplements', /(?<!\p{L})(prote[ií]nas?|protein|suplementos?|creatina|col[aá]geno|vitaminas?|whey|amino[aá]cidos?|pre-?entreno|pre-?workout|recuperaci[oó]n muscular|batidos? de prote[ií]na|nutrici[oó]n deportiva|electrolitos?)(?!\p{L})/giu],
```
3. Add the entry next to `'fitness-wellness'`, copying its `sections` and `footer` values exactly:
```ts
  'health-supplements': { kind: 'health-supplements', angles: ['field-guide', 'the-maker', 'ritual-time'], name: 'health and sports nutrition', profile: 'shop',
    references: ['bloomnu.com', 'goodprotein.ca', 'equipfoods.com'], sections: PLAYBOOK_FITNESS_SECTIONS, footer: LEGAL,
    tone: 'energetic and clear: what each product does, when to take it and for whom, in plain words; no miracle or medical claims',
    questions: ['¿Qué producto recomiendas más?', '¿Para quién es tu tienda: deportistas, gente que empieza o ambos?', '¿Qué marca o sabor se vende primero?'],
    avoid: ['resultados garantizados', 'quema grasa', 'milagro', 'cura', 'el mejor suplemento'],
    families: [
      { id: 'health-energy', name: 'bright sport energy', radius: 'round', photoShape: 'rounded-corner', buttons: ['pill', 'block'], fonts: [{ display: 'space-grotesk', text: 'dm-sans' }, { display: 'outfit', text: 'outfit' }, { display: 'archivo', text: 'inter' }],
        palettes: [p('health-citrus', 'cream and orange', '#fffdf2', '#1d1a14', '#ef5d1b', '#ffe27a'), p('health-mint', 'white and electric mint', '#ffffff', '#101614', '#11b38a', '#e6f7f1')] },
      { id: 'health-clean', name: 'clean wellness', radius: 'soft', photoShape: 'plain', buttons: ['pill', 'outline'], fonts: [{ display: 'plus-jakarta-sans', text: 'dm-sans' }, { display: 'young-serif', text: 'figtree' }],
        palettes: [p('health-blush', 'blush and berry', '#fff5f7', '#2a1520', '#d6336c', '#ffe1ea'), p('health-sand', 'sand and sage', '#f6f1e9', '#1f241d', '#5c7a52', '#e9e3d6')] },
    ] },
```
`PLAYBOOK_FITNESS_SECTIONS` stands for the literal array `'fitness-wellness'` uses: copy that array in place (do not introduce a new constant unless the file already shares one). Check that every font id used exists in the font catalogue the other families use (`grep -n "'space-grotesk'\|'plus-jakarta-sans'\|'young-serif'" design-engine/*.ts`); swap any missing one for one that exists. Task 2's photo palette wins over these when photos exist; these are the fallback.

- [ ] **Step 4: Run** the playbook spec, `npx jest src/storefront-source/design-engine --runInBand`, and `npx tsc --noEmit -p tsconfig.json`. Fix any exhaustive `Record<PlaybookKind, …>` the compiler flags with the matching health value. Expected: PASS.

- [ ] **Step 5: Commit** — `git commit -am "feat(api): health and supplements stores are read as their own kind, not as cafés"`

---

### Task 4: Motion pieces in the storefront kit

**Files:**
- Create: `packages/storefront-kit/commerce-src/look/motion-pieces.js`
- Modify: `packages/storefront-kit/tools/build-commerce.mjs` (PARTS, right after `'look/fit-headlines.js'`)
- Test: `apps/merchant-studio/tests/motion-pieces.spec.ts` (new Playwright)

**Interfaces:**
- Produces (authored HTML vocabulary): `data-pya-motion="float|bob|spin|breathe|bubbles|marquee|pop|zoom"`, optional `data-pya-motion-delay="0-600"` (ms) and `data-pya-motion-speed="slow|fast"`.

- [ ] **Step 1: Write the failing Playwright test** (pattern from `tests/cross-sell-kit.spec.ts`)

```ts
import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { kitPath } from '@pagosya/storefront-kit';
const kit = readFileSync(kitPath('commerce.js'), 'utf8');
const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"></head><body>
<img id="float" data-pya-motion="float" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" width="40" height="40">
<img id="slow" data-pya-motion="float" data-pya-motion-speed="slow" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" width="40" height="40">
<span id="spin" data-pya-motion="spin">sello</span><div id="bubbles" data-pya-motion="bubbles" style="height:200px"></div>
<p id="marquee" data-pya-motion="marquee"><span>PROTEÍNA · </span><span>PROTEÍNA · </span></p>
<div data-pagosya-cart><img id="incart" data-pya-motion="float" src="data:image/gif;base64,R0lGODlhAQABAAAAACw="></div>
<script>window.PAGOSYA_CONFIG=${JSON.stringify({ demo: true, slug: 'm', data: { storeName: 'M', items: [] } })}</script><script>${kit}</script></body></html>`;
for (const reducedMotion of ['no-preference', 'reduce'] as const) test(`motion pieces ${reducedMotion === 'reduce' ? 'stay still with reduced motion' : 'animate'}`, async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion });
  const page = await context.newPage();
  await page.route('https://kit.test/**', route => route.fulfill({ contentType: 'text/html', body: html }));
  await page.goto('https://kit.test/');
  for (const id of ['float', 'spin', 'marquee']) {
    const name = await page.locator(`#${id}`).evaluate(el => getComputedStyle(el).animationName);
    if (reducedMotion === 'reduce') expect(name, id).toBe('none'); else expect(name, id).not.toBe('none');
  }
  expect(await page.locator('#incart').evaluate(el => getComputedStyle(el).animationName)).toBe('none');
  expect(await page.locator('#bubbles i').count()).toBe(reducedMotion === 'reduce' ? 0 : 8);
  if (reducedMotion === 'no-preference') expect(await page.locator('#slow').evaluate(el => getComputedStyle(el).animationDuration)).toBe('8s');
  await context.close();
});
```

- [ ] **Step 2: Run** — `cd apps/merchant-studio && npx playwright test tests/motion-pieces.spec.ts` — Expected: FAIL (`animationName` is `none`).

- [ ] **Step 3: Implement** `look/motion-pieces.js` — a kit part running inside the kit IIFE: open `look/fit-headlines.js`, match its indentation and the way it ends (no closing of the IIFE here).

```js
  // Motion pieces (owner 2026-10-22): tested animations YAPI may put on photos, badges and decoration with data-pya-motion.
  // Never text, navigation, cart, selectors or checkout; everything stops with reduced motion and pauses off screen.
  (function motionPieces() {
    const style = document.createElement('style');
    style.setAttribute('data-pagosya-motion-pieces', '');
    style.textContent = `@layer pagosya-motion{
      [data-pya-motion=marquee]{display:flex;width:max-content;white-space:nowrap}
      [data-pya-motion=bubbles]{position:relative;overflow:hidden}
      [data-pya-motion=bubbles]>i[data-pya-bubble]{position:absolute;bottom:-60px;width:var(--s,28px);height:var(--s,28px);border-radius:50%;background:color-mix(in srgb,currentColor 18%,transparent);pointer-events:none}
      @media (prefers-reduced-motion:no-preference){
        [data-pya-motion=float]{animation:pya-float 5s ease-in-out infinite}
        [data-pya-motion=bob]{animation:pya-float 3s ease-in-out infinite}
        [data-pya-motion=spin]{animation:pya-spin 14s linear infinite}
        [data-pya-motion=breathe]{animation:pya-breathe 4.5s ease-in-out infinite}
        [data-pya-motion=marquee]{animation:pya-slide 38s linear infinite}
        [data-pya-motion=pop]{animation:pya-pop .6s cubic-bezier(.34,1.56,.64,1) both}
        [data-pya-motion=zoom]{animation:pya-zoom 22s ease-in-out infinite alternate}
        [data-pya-motion=bubbles]>i[data-pya-bubble]{animation:pya-rise var(--d,9s) linear infinite;animation-delay:var(--w,0s)}
        [data-pya-motion=float][data-pya-motion-speed=slow]{animation-duration:8s}[data-pya-motion=float][data-pya-motion-speed=fast]{animation-duration:3s}
        [data-pya-motion=spin][data-pya-motion-speed=slow]{animation-duration:22s}[data-pya-motion=spin][data-pya-motion-speed=fast]{animation-duration:8s}
        [data-pya-motion=breathe][data-pya-motion-speed=slow]{animation-duration:7s}[data-pya-motion=breathe][data-pya-motion-speed=fast]{animation-duration:3s}
        [data-pya-motion=marquee][data-pya-motion-speed=slow]{animation-duration:60s}[data-pya-motion=marquee][data-pya-motion-speed=fast]{animation-duration:22s}
        [data-pya-motion=zoom][data-pya-motion-speed=slow]{animation-duration:30s}[data-pya-motion=zoom][data-pya-motion-speed=fast]{animation-duration:14s}
        [data-pya-motion][data-pya-offscreen]{animation-play-state:paused}
      }
      :is([data-pagosya-cart],[data-pagosya-checkout],.pya-checkout,nav,header) [data-pya-motion]{animation:none!important}
      @keyframes pya-float{0%,100%{transform:translateY(0) rotate(0)}50%{transform:translateY(-14px) rotate(1.5deg)}}
      @keyframes pya-spin{to{transform:rotate(360deg)}}
      @keyframes pya-breathe{0%,100%{transform:scale(.94);opacity:.75}50%{transform:scale(1.06);opacity:1}}
      @keyframes pya-slide{to{transform:translateX(-50%)}}
      @keyframes pya-pop{from{opacity:0;transform:scale(.6)}to{opacity:1;transform:none}}
      @keyframes pya-zoom{from{transform:scale(1)}to{transform:scale(1.12)}}
      @keyframes pya-rise{0%{transform:translateY(0);opacity:0}10%{opacity:1}100%{transform:translateY(-900px);opacity:0}}
    }`;
    document.head.append(style);
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const SIZES = [22, 40, 16, 30, 20, 46, 18, 28], LEFT = [6, 18, 32, 47, 61, 73, 86, 94];
    const fill = root => root.querySelectorAll('[data-pya-motion=bubbles]').forEach(host => {
      if (reduced || host.querySelector('[data-pya-bubble]')) return;
      SIZES.forEach((size, index) => {
        const bubble = document.createElement('i'); bubble.setAttribute('data-pya-bubble', ''); bubble.setAttribute('aria-hidden', 'true');
        bubble.style.cssText = `--s:${size}px;left:${LEFT[index]}%;--d:${7 + (index % 3) * 2.5}s;--w:-${index * 1.3}s`; host.append(bubble);
      });
    });
    const delays = root => root.querySelectorAll('[data-pya-motion-delay]').forEach(el => { el.style.animationDelay = Math.max(0, Math.min(600, Number(el.getAttribute('data-pya-motion-delay')) || 0)) + 'ms'; });
    const observer = typeof IntersectionObserver === 'function' ? new IntersectionObserver(entries => entries.forEach(entry => entry.target.toggleAttribute('data-pya-offscreen', !entry.isIntersecting))) : null;
    const watch = root => { fill(root); delays(root); if (observer) root.querySelectorAll('[data-pya-motion]').forEach(el => observer.observe(el)); };
    watch(document);
    new MutationObserver(records => records.forEach(record => record.addedNodes.forEach(node => { if (node.nodeType === 1 && node.parentNode) watch(node.parentNode); }))).observe(document.body, { childList: true, subtree: true });
  })();
```
Add `'look/motion-pieces.js',` to `PARTS` right after `'look/fit-headlines.js',` and run `node packages/storefront-kit/tools/build-commerce.mjs`.

- [ ] **Step 4: Run** the new spec, `cd packages/storefront-kit && pnpm test`, and `cd apps/merchant-studio && npx playwright test tests/cross-sell-kit.spec.ts tests/checkout-layout.spec.ts -g "covers|pickup|round pills"` — Expected: PASS.

- [ ] **Step 5: Rebuild the Studio and commit** — `pnpm --filter @pagosya/merchant-dashboard run build:studio && git add -A && git commit -m "feat(kit): motion pieces — float, bob, spin, breathe, bubbles, marquee, pop and zoom via data-pya-motion"`

---

### Task 5: YAPI learns the motion pieces and spotlight sections

**Files:**
- Create: `apps/api/src/storefront-source/source-motion-pieces.ts`
- Modify: `apps/api/src/storefront-source/design-engine/sep5-author.ts` (input `motionPieces?: string`, appended right after `storeColours`)
- Modify: `apps/api/src/storefront-source/source-sep5-stage.ts:53` and `source-generation.service.ts:678`
- Test: `apps/api/src/storefront-source/source-motion-pieces.spec.ts`

**Interfaces:**
- Consumes: `SourceMotionMode` from `./source-motion`.
- Produces: `motionPiecesDirection(input: { energy: 'high' | 'calm'; motion: SourceMotionMode }): string` (`''` when `motion === 'off'`), `asksForEnergy(text: string): boolean`, `motionPieceCount(html: string): Record<string, number>`.

- [ ] **Step 1: Write the failing tests**

```ts
import { asksForEnergy, motionPieceCount, motionPiecesDirection } from './source-motion-pieces';
describe('motion pieces and spotlights for YAPI (owner 2026-10-22)', () => {
  it('reads energy requests', () => {
    expect(asksForEnergy('Quiero algo con mucha energía y movimiento, una tienda animada')).toBe(true);
    expect(asksForEnergy('una tienda sobria y elegante para un estudio contable')).toBe(false);
  });
  it('teaches every piece, the spotlight patterns and the limits', () => {
    const text = motionPiecesDirection({ energy: 'high', motion: 'auto' });
    for (const piece of ['float', 'bob', 'spin', 'breathe', 'bubbles', 'marquee', 'pop', 'zoom']) expect(text).toContain(`data-pya-motion="${piece}"`);
    expect(text).toMatch(/SPOTLIGHT SECTIONS/);
    expect(text).toMatch(/never on body text, navigation, cart/i);
    expect(text).toMatch(/at least three different pieces/i);
  });
  it('keeps calm stores gentle and turns off with motion off', () => {
    expect(motionPiecesDirection({ energy: 'calm', motion: 'auto' })).toMatch(/only breathe, zoom and pop/i);
    expect(motionPiecesDirection({ energy: 'high', motion: 'off' })).toBe('');
  });
  it('counts the pieces an authored page uses', () => {
    expect(motionPieceCount('<img data-pya-motion="float"><b data-pya-motion="spin"></b><img data-pya-motion="float">')).toEqual({ float: 2, spin: 1 });
  });
});
```

- [ ] **Step 2: Run** — `npx jest src/storefront-source/source-motion-pieces.spec.ts --runInBand` — Expected: FAIL (module missing).

- [ ] **Step 3: Implement** `source-motion-pieces.ts`:

```ts
import type { SourceMotionMode } from './source-motion';

/** Owner 2026-10-22: the hand-built goodProtein had floating products, rising bubbles, a spinning badge and a breathing glow;
 *  YAPI's own build had none because it had no tested pieces to use. The kit ships them (look/motion-pieces.js). */
export const asksForEnergy = (text: string): boolean =>
  /(?<!\p{L})(energ[ií]a|en[eé]rgic\p{L}*|animad\p{L}*|movimiento|din[aá]mic\p{L}*|divertid\p{L}*|vibrante|llamativ\p{L}*|deport\p{L}*|fitness)(?!\p{L})/iu.test(text);

const PIECES = [
  ['float', 'a product photo or pack drifts up and down (5 s)'], ['bob', 'a quicker float for small badges or icons (3 s)'],
  ['spin', 'a round sticker or seal turns slowly (14 s)'], ['breathe', 'a soft glow or halo behind a photo grows and fades (4.5 s)'],
  ['bubbles', 'an empty container fills with rising bubbles behind content (fresh, drinkable, light products)'],
  ['marquee', 'one oversized word line slides across a band behind the content (write its text twice inside)'],
  ['pop', 'stat tiles or chips pop in once; stagger them with data-pya-motion-delay="0|120|240"'], ['zoom', 'a full-bleed background photo slowly zooms (22 s)'],
] as const;

export function motionPiecesDirection(input: { energy: 'high' | 'calm'; motion: SourceMotionMode }): string {
  if (input.motion === 'off') return '';
  const list = PIECES.map(([id, use]) => `data-pya-motion="${id}": ${use}`).join('; ');
  const amount = input.energy === 'high'
    ? 'This merchant asked for energy and movement: use at least three different pieces across the home, at most one per element, and give each spotlight section its own piece.'
    : 'This business is calm: use only breathe, zoom and pop, and at most two pieces on the whole home.';
  return [
    `MOTION PIECES: The platform animates these attributes for you (reduced motion and off-screen pausing included); write no @keyframes for them. ${list}. Optional data-pya-motion-speed="slow|fast". `
      + `Put them on photos, badges, stickers and decoration only, never on body text, navigation, cart, product selectors or checkout. ${amount}`,
    'SPOTLIGHT SECTIONS: When the merchant asks to explain several brands, products or services, give each one its own full-width section with a different layout, never the same layout twice in a row, '
      + 'each with its photo, its name, one lead line, two sentences on what it does and a link to its product. Layouts to choose from: photo-led split (photo left or right), full-bleed photo with a dark veil and the copy on it, '
      + 'a giant outlined word behind the photo with a round spinning sticker, an arch-framed photo beside popping stat tiles, two overlapping photos over rising bubbles, a tall arched photo over a sliding oversized word, '
      + 'a tilted polaroid with a stamped badge, a photo inside a breathing glow on a deep background. Colour each spotlight from its own photo, within STORE COLOURS.',
  ].join('\n');
}

export function motionPieceCount(html: string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const match of html.matchAll(/data-pya-motion="([a-z]+)"/g)) counts[match[1]] = (counts[match[1]] ?? 0) + 1;
  return counts;
}
```

Wire it:
- `sep5-author.ts`: add `motionPieces?: string;` to the input type (doc: «Absent or blank, the prompt stays byte-identical.») and `...(input.motionPieces?.trim() ? [input.motionPieces.trim()] : []),` right after the `storeColours` entry.
- `source-sep5-stage.ts:53` `authorInput`: `motionPieces: motionPiecesDirection({ energy: asksForEnergy(\`${dto.instruction} ${JSON.stringify(dto.brief)}\`) ? 'high' : 'calm', motion }),`
- `source-generation.service.ts:678`: the same line, right after the motion plan in the agent prompt.
- `source-sep5-stage.ts:73` log line `sep5_author_published`: add `pieces: motionPieceCount(authored.data.files.find(file => file.path === 'index.html')?.content ?? '')`.

- [ ] **Step 4: Run** the new spec and `npx jest src/storefront-source/design-engine/sep5-author.spec.ts src/storefront-source/source-sep5-stage.spec.ts --runInBand` — Expected: PASS (byte-identical tests still pass; both inputs are optional).

- [ ] **Step 5: Commit** — `git commit -am "feat(api): YAPI uses the kit's motion pieces and spotlight sections, energetic or calm by request"`

---

### Task 6: Live check — YAPI alone, against goodProtein #1

**Files:**
- Modify: `apps/api/scripts/create-goodprotein-demo.ts` (`--yapi --record=<n>` → `examples/goodprotein-yapi-<n>`)

- [ ] **Step 1:** In the script, change the `--yapi` folder to ``examples/goodprotein-yapi-${process.argv.find(arg => arg.startsWith('--record='))?.slice(9) ?? '1'}``. Create two fresh catalog-only stores: `--yapi --record=2` and `--yapi --record=3`.
- [ ] **Step 2:** With no YAPI job RUNNING, send in the Studio of store 2: «Diseña desde cero la tienda goodProtein, sin plantilla. Es una tienda de salud animada que vende proteínas, recuperación y snacks de varias marcas (ya cargué los productos y las fotos). Quiero algo con mucha energía y movimiento, distinto a una tienda típica: tú eliges la estructura, los colores y las secciones. Cuenta en pocas palabras qué aporta cada marca.» After it finishes, send the same request **without** «desde cero, sin plantilla» in store 3 (Esencial + agent path, the PEPPA route).
- [ ] **Step 3:** For each, read the generation (`StoreSourceGeneration`): `model` is `gpt-5.6-sol`, no phase at reasoning `low`, the follow-up question is not about coffee, logs show `pieces` with ≥3 kinds; the `:root` colours are near the photo palette (not `#2f4bb8`).
- [ ] **Step 4:** Full-page screenshots at 1440 and 390 (`$CLAUDE_JOB_DIR/tmp/shot.mjs`), next to goodProtein #1 and #2. Report to the owner exactly what YAPI made — good and bad — with no edits by me.
- [ ] **Step 5:** Save the results in memory (`project_yapi_first_build_quality.md`).

---

## Not in this plan (found in the same run, tracked separately)

- **Cart did not open in YAPI's own commerce-surfaces check** («El botón del aviso no abrió el carrito», then a timeout) on the one-shot store — needs its own debugging session.
- **The review/touch stage did not run after the build** (no `review`/`touch` attempts), a known gap (memory: one-look-per-store). The agent path's self-correction is what made PEPPA good; whether first builds should always go through it is the owner's decision after Task 6's comparison.
