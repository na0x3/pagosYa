# Identity libraries T2a + T2b Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the kit the building blocks that make two stores on one theme look like two brands: about 30 drawn motif packs with five new placements (T2a), and four button forms, three photo frames, the button icon slot, font pairings and a palette proposer (T2b).

**Architecture:** Packs are static files in `packages/storefront-kit/kit/motif-packs/<id>/`. Each pack is drawn once from two hand-drawn glyphs by a committed tool, and each file must come out of the existing motif sanitiser byte for byte. The storefront sandbox cannot fetch, so a chosen pack travels inside `config.js` as `motifPack`, the same way `motifs` does, and every save sanitises it again. `commerce.js` treats pack motifs as store-wide entries next to the store's own AI motifs. It fills the old slots (product, card, cart) and the new ones: button icon, pattern, divider, sticker and the empty cart. New placements go only on kit-owned add and buy buttons, the empty cart, and elements a store marks with `data-motif-*`. New DNA values are appended to the existing enums in the API and the kit. The API's seeded default never picks them. The palette proposer is a pure function over the existing pixel sampler, and it returns no palette on any failure.

**Tech Stack:** Vanilla JS runtime (`packages/storefront-kit/kit/commerce.js`), TypeScript API modules (`apps/api/src/storefront-source/`), Node ESM tool (`packages/storefront-kit/tools/`), Jest + JSDOM and Jest + Playwright Chromium specs in `apps/api`, Vitest in `apps/checkout`, Playwright in `apps/merchant-studio`.

**Spec:** `docs/superpowers/specs/2026-09-25-identity-libraries-design.md` §2.1–2.4 (T2a, T2b). Parent: `docs/superpowers/specs/2026-09-25-store-themes-design.md`. T1 (cart template `empty` slot): `docs/superpowers/specs/2026-09-25-kit-templates-design.md`. T2c (business sections and identity catalog) is out of scope.

## Global Constraints

- Work on branch `feature/blobs-and-identity`, which is already checked out. `git add` new files first, then commit only your own paths with `git commit -m "…" -- <paths>`. Never push, merge, reset, stash, `git clean` or `git add -A`. A parallel B1 plan owns `apps/merchant-dashboard`, `apps/api/src/dashboard` and `docs/`. This plan touches none of those; its only docs file is itself.
- Do not touch any database (no prisma migrate/db push/reset, no psql). Make no paid AI calls. Packs are hand-drawn in this plan, and the runtime never calls a model.
- Stores without a pack and without the new DNA values must render exactly as before. The regression net is the existing suites: `source-commerce-*.spec.ts`, `source-motifs.spec.ts`, `source-motif-paint.spec.ts`, `source-dna.spec.ts`, `source-scorecard*.spec.ts` and `apps/checkout` vitest. All of them stay green.
- Motifs are decorative: `aria-hidden="true"` on every holder and slot. They never cover a price, a buy control or a total (`MOTIF_PROTECTED`, and `MOTIF_PRICES` for icons). They animate with CSS only, and reduced motion and `motion: 'off'` stop them.
- The pattern stays under the contrast floor. The tile against the section background is at most 1.35:1, and every text in the section stays at 4.5:1 or more over the tile. Opacity is at most .12, and the pattern is static.
- Pay, buy and add buttons keep 4.5:1 in every new button form. Minimum height is 44px for card buttons and 48px for pay and buy buttons.
- Pack files: at most 8 per pack (this plan draws 5), at most 6 KB each. Each must come out of `sanitizeMotifSvg` unchanged. Colours are only `currentColor` or `none`, with no ids, no text and no references. Behaviours `glow`/`steam` need a `data-part="light"`/`"steam"` in the file.
- `defaultDna` (the seeded DNA used by `withSeededDna` on every public view) never picks a T2b value. Pinned hash of `defaultDna('store-0'…'store-49')`: `6b24050e210099c82f1bd48afee26df3daaabc4f1c08a62998b6a02f5d9fa84b`.
- Merchant-facing copy is Spanish (Bolivia, "tú").
- Screenshots go to `tmp/identity-shots/` at 390 and 1280. Look at them before the last commit.
- **Spec refinements (recorded here, owner to note):**
  1. Packs are drawn as two hand-drawn 24-unit glyphs per topic. `packages/storefront-kit/tools/motif-packs.mjs` composes them into 5 files (`button`, `pattern`, `divider`, `sticker`, `empty`), and `pack.json` maps all 8 placements onto those files (`product`→`empty.svg`, `card`/`cart`→`button.svg`). The output is committed, and a drift test keeps disk equal to the tool. Reason: one stroke weight per placement across 30 packs, and a plan that stays reviewable.
  2. The pack markup travels in `config.motifPack = { id, motifs: [{ placement, behavior, svg }] }`, the way `config.motifs` does, because the sandbox cannot fetch. T4 writes it; `withSanitizedMotifs` re-sanitises it on every save.
  3. New placements are opt-in by markup: `data-motif-icon`, `data-motif-pattern`, `data-motif-divider`, `data-motif-sticker`, and `data-motif-empty` inside a T1 cart template's `empty` slot, because the template owns that state's design. The kit places on its own surfaces only on add and buy buttons and the default empty cart line. The pattern never goes on the catalog, cart, product or checkout.
  4. The button icon never goes on the cart's checkout or pay buttons at all, which is stricter than "never on the price". It is hidden in the `split` form, and removed again when it would wrap the label or overflow the button.
  5. "Palette variables" is done by colouring from the kit: drawings are `currentColor` only, and the kit colours each placement (accent, the button label's colour, or the section's text colour at a computed alpha for the pattern). Presentation attributes cannot reliably use `var()`.
  6. The pattern is a CSS background image (an SVG data URL; every storefront CSP allows `img-src data:`), not an inserted element, so authored `:first-child` or grid rules never see it.
  7. The seeded default excludes T2b values (see above). Otherwise stores published before today would silently change look.
  8. An older kit (only reachable through a runtime rollback) ignores unknown values and renders its plain buttons and photos. There is no legacy fallback field.
  9. The palette proposer and font pairings are libraries; T4 wires them in. The hosted checkout (`apps/checkout`) also learns the four button forms, so a store's pay button looks the same there.
  10. Frames apply where frames apply today: card photos and cart-line photos. `tape` is drawn as translucent tape corners in the photo's padding, because an image cannot paint over itself from its own background.
  11. `KIT_FILES` in `source-scorecard-capture.ts` needs no change: packs travel inside `config.js`, not as snapshot files.

## Review Focus

1. **A pack SVG with `<script>`, `<foreignObject>`, an external `href`, an event handler or a non-local `url()`.** Validation must reject it, `loadMotifPack` must refuse it, `withSanitizedMotifs` must clean it out of a hand-edited `config.js`, and the kit must never insert it. (Tests in Task 1 and Task 2.)
2. **A pattern behind light text on a dark palette.** The tile must lift the dark background by at most 1.35:1 and keep every text at 4.5:1. A section whose text is already weak, or whose background is a photo or gradient, gets no pattern. (Tests in Task 4.)
3. **A button icon on a very narrow phone button**, whether an authored CTA at 320px or a fixed-size round add button. The icon is removed when it would wrap the label or overflow, and never sits on a price. (Tests in Task 3.)
4. **A logo that is a single flat colour, or a transparent PNG** (a mark on transparency, or fully transparent). The accent comes from the mark and never from the transparency, the photos take over when the logo is empty, and every contrast rule holds. (Tests in Task 15.)
5. **A store whose DNA names a button form an older kit does not know.** No `data-dna-button`, plain kit buttons, the store still sells, and the pay button stays at 4.5:1. (Test in Task 11.)

---

## File Structure

- Create `apps/api/src/storefront-source/source-motif-packs.ts`: pack format, `validateMotifPackDir`, `drawingProblems`, `listMotifPacks`, `loadMotifPack`, `sanitizeRuntimeMotifPack`.
- Modify `apps/api/src/storefront-source/source-motifs.ts`: `withSanitizedMotifs` also re-sanitises `config.motifPack`.
- Create `apps/api/src/storefront-source/fixtures/motif-pack.ts`: `FIXTURE_DRAWINGS`, `fixturePack()`.
- Modify `packages/storefront-kit/kit/commerce.js`: pack loading, placements (empty, button and `data-motif-icon`, pattern, divider, sticker), the identity observer, 4 button forms, 3 frames.
- Create `packages/storefront-kit/tools/motif-packs.mjs` (composer and `--check`) and `packages/storefront-kit/tools/motif-pack-drawings.mjs` (the hand-drawn glyphs).
- Create `packages/storefront-kit/kit/motif-packs/<id>/{pack.json,button.svg,pattern.svg,divider.svg,sticker.svg,empty.svg}` × 30, all written by the tool.
- Create specs in `apps/api/src/storefront-source/`: `source-motif-packs.spec.ts`, `source-commerce-motif-packs.spec.ts` (JSDOM and Chromium), `source-motif-pack-library.spec.ts`, `source-motif-pack-sheet.spec.ts` (contact sheets), `source-commerce-identity-dna.spec.ts` (Chromium), `source-font-pairings.spec.ts`, `source-palette.spec.ts`.
- Modify `apps/api/src/storefront-source/source-dna.ts` and its spec: new enum values, seed exclusion.
- Modify `apps/api/src/storefront-source/source-scorecard-capture.spec.ts`: the new values render in the capture.
- Create `apps/api/src/storefront-source/source-font-pairings.ts`, `source-palette.ts` and `fixtures/png.ts`.
- Modify `apps/checkout/src/checkout-branding.ts`, `checkout-branding.css` and `checkout-branding.test.ts`: the four forms.
- Create `apps/merchant-studio/tests/identity-libraries.spec.ts`: real preview sandbox, screenshots in `tmp/identity-shots/`.

---

### Task 1: Pack format, validator, loader and config re-sanitisation

**Files:**
- Create: `apps/api/src/storefront-source/source-motif-packs.ts`
- Create: `apps/api/src/storefront-source/fixtures/motif-pack.ts`
- Create: `apps/api/src/storefront-source/source-motif-packs.spec.ts`
- Modify: `apps/api/src/storefront-source/source-motifs.ts` (the `config.js` branch at the end of `withSanitizedMotifs`)

**Interfaces:**
- Produces: `MOTIF_PACK_PLACEMENTS = ['button','pattern','divider','sticker','empty','product','card','cart'] as const`, `type MotifPackPlacement`.
- Produces: `type SourceMotifPackManifest = { id: string; version: 1; name: string; topics: { es: string[]; en: string[] }; motifs: Array<{ placement: MotifPackPlacement; file: string; behavior: SourceDnaMotif['behavior'] }> }`.
- Produces: `type SourceRuntimeMotifPack = { id: string; motifs: Array<{ placement: MotifPackPlacement; behavior: SourceDnaMotif['behavior']; svg: string }> }`. This is the `config.motifPack` shape.
- Produces: `validateMotifPackDir(dir: string, folder: string): { manifest?: SourceMotifPackManifest; problems: string[] }`, `drawingProblems(name: string, content: string): string[]`, `listMotifPacks(root?: string): SourceMotifPackManifest[]`, `loadMotifPack(id: string, root?: string): SourceRuntimeMotifPack | undefined`, `sanitizeRuntimeMotifPack(value: unknown): SourceRuntimeMotifPack | undefined`.
- Produces (fixture): `FIXTURE_DRAWINGS: Record<'button'|'pattern'|'divider'|'sticker'|'empty', string>`, `fixturePack(placements?: MotifPackPlacement[]): SourceRuntimeMotifPack` (id `fixture-paws`).

- [ ] **Step 1: Write the fixture and the failing tests**

Create `apps/api/src/storefront-source/fixtures/motif-pack.ts`:

```ts
import { MOTIF_PACK_PLACEMENTS, type MotifPackPlacement, type SourceRuntimeMotifPack } from '../source-motif-packs';

/** Drawings written exactly as the motif sanitiser serialises them: currentColor only, no ids, a labelled steam part. */
const svg = (viewBox: string, body: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
export const FIXTURE_DRAWINGS = {
  button: svg('0 0 24 24', '<circle cx="12" cy="15" r="4"/><circle cx="6" cy="9" r="2"/><circle cx="12" cy="6" r="2"/><circle cx="18" cy="9" r="2"/>'),
  pattern: svg('0 0 96 96', '<g transform="translate(10 10)"><circle cx="12" cy="15" r="4"/><circle cx="6" cy="9" r="2"/></g><circle cx="72" cy="72" r="6"/>'),
  divider: svg('0 0 64 24', '<circle cx="8" cy="12" r="3"/><circle cx="32" cy="12" r="6"/><circle cx="56" cy="12" r="3"/>'),
  sticker: svg('0 0 64 64', '<polygon points="32,4 38,24 60,24 42,38 48,60 32,46 16,60 22,38 4,24 26,24" fill="currentColor" fill-opacity=".12"/>'),
  empty: svg('0 0 64 64', '<g data-part="steam"><path d="M26 18c-3-4 3-6 0-10"/><path d="M36 18c-3-4 3-6 0-10"/></g><path d="M16 26h32v14a10 10 0 0 1-10 10H26a10 10 0 0 1-10-10z"/>'),
};
const FILE: Record<MotifPackPlacement, keyof typeof FIXTURE_DRAWINGS> = { button: 'button', pattern: 'pattern', divider: 'divider', sticker: 'sticker', empty: 'empty', product: 'empty', card: 'button', cart: 'button' };
const BEHAVIOR = { button: 'bounce', pattern: 'float', divider: 'grow', sticker: 'sway', empty: 'steam', product: 'grow', card: 'bounce', cart: 'bounce' } as const;

/** The config.js `motifPack` a store with this pack carries (the kit specs boot with it). */
export function fixturePack(placements: MotifPackPlacement[] = [...MOTIF_PACK_PLACEMENTS]): SourceRuntimeMotifPack {
  return { id: 'fixture-paws', motifs: placements.map(placement => ({ placement, behavior: BEHAVIOR[placement], svg: FIXTURE_DRAWINGS[FILE[placement]] })) };
}
```

Create `apps/api/src/storefront-source/source-motif-packs.spec.ts`:

```ts
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { drawingProblems, listMotifPacks, loadMotifPack, MOTIF_PACK_PLACEMENTS, sanitizeRuntimeMotifPack, validateMotifPackDir } from './source-motif-packs';
import { withSanitizedMotifs } from './source-motifs';
import { FIXTURE_DRAWINGS, fixturePack } from './fixtures/motif-pack';

const MANIFEST = {
  id: 'huellas', version: 1, name: 'Huellas', topics: { es: ['perro', 'mascota', 'huella'], en: ['dog', 'pet', 'paw'] },
  motifs: [{ placement: 'button', file: 'button.svg', behavior: 'bounce' }, { placement: 'empty', file: 'empty.svg', behavior: 'steam' }, { placement: 'card', file: 'button.svg', behavior: 'bounce' }],
};
const GOOD = { 'button.svg': FIXTURE_DRAWINGS.button, 'empty.svg': FIXTURE_DRAWINGS.empty };
function packDir(files: Record<string, string> = GOOD, manifest: object = MANIFEST, folder = 'huellas') {
  const root = mkdtempSync(join(tmpdir(), 'motif-packs-'));
  mkdirSync(join(root, folder));
  writeFileSync(join(root, folder, 'pack.json'), JSON.stringify(manifest));
  for (const [name, content] of Object.entries(files)) writeFileSync(join(root, folder, name), content);
  return { root, dir: join(root, folder) };
}
const HOSTILE: Record<string, string> = {
  'a script': FIXTURE_DRAWINGS.button.replace('</svg>', '<script>alert(1)</script></svg>'),
  'a foreignObject': FIXTURE_DRAWINGS.button.replace('</svg>', '<foreignObject><div xmlns="http://www.w3.org/1999/xhtml">x</div></foreignObject></svg>'),
  'an external image href': FIXTURE_DRAWINGS.button.replace('</svg>', '<image href="https://evil.test/x.png" width="4" height="4"/></svg>'),
  'a javascript link': FIXTURE_DRAWINGS.button.replace('<circle cx="12" cy="15" r="4"/>', '<a href="javascript:alert(1)"><circle cx="12" cy="15" r="4"/></a>'),
  'an event handler': FIXTURE_DRAWINGS.button.replace('<circle cx="12"', '<circle onload="alert(1)" cx="12"'),
  'a style attribute': FIXTURE_DRAWINGS.button.replace('<circle cx="12"', '<circle style="fill:url(https://evil.test/a)" cx="12"'),
  'an external url() fill': FIXTURE_DRAWINGS.button.replace('fill="none"', 'fill="url(https://evil.test/a)"'),
  'a hard-coded colour': FIXTURE_DRAWINGS.button.replace('stroke="currentColor"', 'stroke="#ff0000"'),
  'an id that could shadow a page id': FIXTURE_DRAWINGS.button.replace('<circle cx="12" cy="15"', '<circle id="pagosya-product-title" cx="12" cy="15"'),
};

describe('motif pack validation', () => {
  it('accepts the fixture drawings exactly as written', () => {
    for (const [name, content] of Object.entries(FIXTURE_DRAWINGS)) expect({ name, problems: drawingProblems(name, content) }).toEqual({ name, problems: [] });
  });

  it('accepts a clean pack and loads it as config.js markup, one entry per placement', () => {
    const { root, dir } = packDir();
    expect(validateMotifPackDir(dir, 'huellas').problems).toEqual([]);
    expect(listMotifPacks(root).map(pack => pack.id)).toEqual(['huellas']);
    expect(loadMotifPack('huellas', root)).toEqual({ id: 'huellas', motifs: [
      { placement: 'button', behavior: 'bounce', svg: FIXTURE_DRAWINGS.button },
      { placement: 'empty', behavior: 'steam', svg: FIXTURE_DRAWINGS.empty },
      { placement: 'card', behavior: 'bounce', svg: FIXTURE_DRAWINGS.button },
    ] });
    expect(loadMotifPack('otro', root)).toBeUndefined();
    expect(loadMotifPack('../huellas', root)).toBeUndefined();
  });

  it.each(Object.keys(HOSTILE))('rejects a drawing with %s, and never loads the pack', name => {
    expect(drawingProblems('button.svg', HOSTILE[name]).length).toBeGreaterThan(0);
    const { root, dir } = packDir({ ...GOOD, 'button.svg': HOSTILE[name] });
    expect(validateMotifPackDir(dir, 'huellas').problems.length).toBeGreaterThan(0);
    expect(loadMotifPack('huellas', root)).toBeUndefined();
    expect(listMotifPacks(root)).toEqual([]);
  });

  it('rejects a drawing over 6 KB', () => {
    const heavy = FIXTURE_DRAWINGS.button.replace('</svg>', `${'<circle cx="1" cy="1" r="1"/>'.repeat(260)}</svg>`);
    expect(drawingProblems('button.svg', heavy)).toEqual(expect.arrayContaining([expect.stringContaining('6 KB')]));
  });

  it('names every manifest mistake', () => {
    const problems = (manifest: object, files: Record<string, string> = GOOD, folder = 'huellas') => { const { dir } = packDir(files, manifest, folder); return validateMotifPackDir(dir, folder).problems.join('\n'); };
    expect(problems(MANIFEST, GOOD, 'otra')).toMatch(/id must equal the folder/);
    expect(problems({ ...MANIFEST, motifs: [...MANIFEST.motifs, { placement: 'hero', file: 'button.svg', behavior: 'grow' }] })).toMatch(/unknown placement "hero"/);
    expect(problems({ ...MANIFEST, motifs: [...MANIFEST.motifs, { placement: 'button', file: 'button.svg', behavior: 'grow' }] })).toMatch(/button is declared twice/);
    expect(problems({ ...MANIFEST, motifs: [{ placement: 'button', file: 'button.svg', behavior: 'explode' }] })).toMatch(/unknown behavior/);
    expect(problems({ ...MANIFEST, motifs: [{ placement: 'button', file: 'button.svg', behavior: 'steam' }] }, { 'button.svg': FIXTURE_DRAWINGS.button })).toMatch(/labels no data-part="steam"/);
    expect(problems(MANIFEST, { ...GOOD, 'extra.svg': FIXTURE_DRAWINGS.divider })).toMatch(/extra\.svg is not declared/);
    expect(problems(MANIFEST, { 'button.svg': FIXTURE_DRAWINGS.button })).toMatch(/empty\.svg is missing/);
    expect(problems({ ...MANIFEST, topics: { es: ['perro'], en: ['dog', 'pet', 'paw'] } })).toMatch(/topics\.es/);
    const nine = Array.from({ length: 9 }, (_, i) => `f${i}.svg`);
    expect(problems({ ...MANIFEST, motifs: nine.slice(0, 8).map((file, i) => ({ placement: MOTIF_PACK_PLACEMENTS[i], file, behavior: 'grow' })).concat([{ placement: 'button', file: 'f8.svg', behavior: 'grow' }]) }, Object.fromEntries(nine.map(file => [file, FIXTURE_DRAWINGS.divider])))).toMatch(/9 files, at most 8/);
  });

  it('lists nothing when the library folder does not exist', () => {
    expect(listMotifPacks(join(tmpdir(), 'no-such-motif-packs'))).toEqual([]);
  });
});

describe('config.js motifPack', () => {
  it('keeps a clean pack as it is, and cleans or drops what a hand edit broke', () => {
    const pack = fixturePack();
    expect(sanitizeRuntimeMotifPack(pack)).toEqual(pack);
    const broken = { id: pack.id, motifs: [
      { placement: 'hero', behavior: 'grow', svg: FIXTURE_DRAWINGS.button },
      { placement: 'button', behavior: 'explode', svg: FIXTURE_DRAWINGS.button },
      { placement: 'card', behavior: 'bounce', svg: HOSTILE['a script'] },
      { placement: 'empty', behavior: 'steam', svg: '<img src=x onerror=alert(1)>' },
      { placement: 'cart', behavior: 'bounce', svg: FIXTURE_DRAWINGS.button },
      { placement: 'cart', behavior: 'spin', svg: FIXTURE_DRAWINGS.button },
    ] };
    const cleaned = sanitizeRuntimeMotifPack(broken)!;
    expect(cleaned.motifs.map(motif => motif.placement)).toEqual(['card', 'cart']);
    expect(cleaned.motifs[0].svg).not.toContain('script');
    for (const value of [undefined, null, 'paws', [], { id: 'Bad Id', motifs: pack.motifs }, { id: 'paws', motifs: 'x' }, { id: 'paws', motifs: [] }]) expect(sanitizeRuntimeMotifPack(value)).toBeUndefined();
    expect(sanitizeRuntimeMotifPack({ id: 'paws', motifs: [...pack.motifs, ...pack.motifs] })!.motifs).toHaveLength(8);
  });

  it('is re-sanitised on every save, next to motifs', () => {
    const config = (value: object) => ({ path: 'config.js', content: `window.PAGOSYA_CONFIG = ${JSON.stringify(value)};`, encoding: 'utf8' as const });
    const read = (files: Array<{ path: string; content: string }>) => JSON.parse(files.find(f => f.path === 'config.js')!.content.match(/=\s*([\s\S]*?);?\s*$/)![1]);
    const clean = [config({ slug: 's', motifPack: fixturePack() })];
    expect(withSanitizedMotifs(clean).files).toBe(clean);
    const hostile = withSanitizedMotifs([config({ slug: 's', motifPack: { id: 'paws', motifs: [{ placement: 'button', behavior: 'bounce', svg: HOSTILE['a script'] }, { placement: 'card', behavior: 'bounce', svg: FIXTURE_DRAWINGS.button }] } })]);
    expect(hostile.repairs).toEqual(['config.js: motif pack re-sanitised']);
    expect(JSON.stringify(read(hostile.files))).not.toContain('script');
    const junk = withSanitizedMotifs([config({ slug: 's', motifPack: 'paws' })]);
    expect(junk.repairs).toEqual(['config.js: motif pack dropped']);
    expect(read(junk.files)).toEqual({ slug: 's' });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/api && npx jest src/storefront-source/source-motif-packs.spec.ts`
Expected: FAIL with "Cannot find module './source-motif-packs'".

- [ ] **Step 3: Implement**

Create `apps/api/src/storefront-source/source-motif-packs.ts`:

```ts
/** Identity libraries T2a: motif packs drawn once for pagosYa in packages/storefront-kit/kit/motif-packs/<id>/. A pack is
 * pack.json plus at most 8 SVG files of at most 6 KB. Every file must come out of the motif sanitiser byte for byte (the
 * kit inlines it as drawn), paint only in currentColor (the kit colours each placement from the store's palette) and carry
 * no ids. The storefront sandbox cannot fetch, so a chosen pack travels in config.js as `motifPack` (id + sanitised
 * markup per placement), like `motifs`. T4 chooses the pack; nothing here does. */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { kitPath } from '@pagosya/storefront-kit';
import { SOURCE_DNA_MOTIF_ENUMS, type SourceDnaMotif } from './source-dna';
import { MOTIF_SVG_MAX_BYTES, sanitizeMotifSvg } from './source-svg-sanitize';

export const MOTIF_PACK_PLACEMENTS = ['button', 'pattern', 'divider', 'sticker', 'empty', 'product', 'card', 'cart'] as const;
export type MotifPackPlacement = typeof MOTIF_PACK_PLACEMENTS[number];
type Behavior = SourceDnaMotif['behavior'];
export type SourceMotifPackManifest = { id: string; version: 1; name: string; topics: { es: string[]; en: string[] }; motifs: Array<{ placement: MotifPackPlacement; file: string; behavior: Behavior }> };
export type SourceRuntimeMotifPack = { id: string; motifs: Array<{ placement: MotifPackPlacement; behavior: Behavior; svg: string }> };

export const MOTIF_PACK_MAX_FILES = 8;
const PACK_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const FILE = /^[a-z0-9]+(?:-[a-z0-9]+)*\.svg$/;
const WORD = /^[a-zà-ÿ0-9]+(?: [a-zà-ÿ0-9]+)*$/;
/** Behaviours that animate a labelled part: the file must label it. */
const PART: Partial<Record<Behavior, string>> = { glow: 'light', steam: 'steam' };
const COLOUR_ATTRIBUTES = /\s(fill|stroke|color|stop-color)="([^"]*)"/g;
const packsRoot = () => kitPath('motif-packs');
const visible = (name: string) => !name.startsWith('.');
const isBehavior = (value: unknown): value is Behavior => (SOURCE_DNA_MOTIF_ENUMS.behavior as readonly string[]).includes(value as string);
const isPlacement = (value: unknown): value is MotifPackPlacement => (MOTIF_PACK_PLACEMENTS as readonly string[]).includes(value as string);

/** A pack drawing is accepted only as the sanitiser writes it, in currentColor, without ids. */
export function drawingProblems(name: string, content: string): string[] {
  const problems: string[] = [];
  if (Buffer.byteLength(content) > MOTIF_SVG_MAX_BYTES) problems.push(`${name}: over 6 KB`);
  const cleaned = sanitizeMotifSvg(content);
  if (!cleaned.svg) problems.push(`${name}: rejected by the motif sanitiser (${cleaned.dropped})`);
  else if (cleaned.svg !== content) problems.push(`${name}: the sanitiser changes it${cleaned.removed.length ? ` (removes ${cleaned.removed.join(', ')})` : ''}; write it exactly as the sanitiser does`);
  if (/\sid="/.test(content)) problems.push(`${name}: ids are not allowed in a pack drawing`);
  for (const [, attribute, value] of content.matchAll(COLOUR_ATTRIBUTES)) if (!['none', 'currentColor'].includes(value)) problems.push(`${name}: ${attribute}="${value}" (only currentColor or none)`);
  return problems;
}

/** Every problem with one pack folder, in plain words; no problems means the manifest is returned. */
export function validateMotifPackDir(dir: string, folder: string): { manifest?: SourceMotifPackManifest; problems: string[] } {
  let raw: any;
  try { raw = JSON.parse(readFileSync(join(dir, 'pack.json'), 'utf8')); } catch { return { problems: [`${folder}: pack.json is missing or not JSON`] }; }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { problems: [`${folder}: pack.json is not an object`] };
  const problems: string[] = [];
  if (raw.id !== folder || !PACK_ID.test(String(raw.id)) || String(raw.id).length > 32) problems.push(`${folder}: id must equal the folder name, lower-case words joined by -`);
  if (raw.version !== 1) problems.push(`${folder}: version must be 1`);
  if (typeof raw.name !== 'string' || !raw.name.trim() || raw.name.length > 40) problems.push(`${folder}: name must be 1–40 characters`);
  for (const lang of ['es', 'en'] as const) {
    const words = raw.topics?.[lang];
    if (!Array.isArray(words) || words.length < 3 || words.length > 16 || !words.every((word: unknown) => typeof word === 'string' && WORD.test(word))) problems.push(`${folder}: topics.${lang} must list 3–16 lower-case words`);
  }
  const motifs: any[] = Array.isArray(raw.motifs) ? raw.motifs : [];
  if (!motifs.length) problems.push(`${folder}: motifs must list at least one placement`);
  const placements = new Set<string>();
  for (const motif of motifs) {
    if (!isPlacement(motif?.placement)) { problems.push(`${folder}: unknown placement ${JSON.stringify(motif?.placement)}`); continue; }
    if (placements.has(motif.placement)) problems.push(`${folder}: placement ${motif.placement} is declared twice`);
    placements.add(motif.placement);
    if (!isBehavior(motif.behavior)) problems.push(`${folder}: ${motif.placement} has unknown behavior ${JSON.stringify(motif.behavior)}`);
    if (typeof motif.file !== 'string' || !FILE.test(motif.file)) problems.push(`${folder}: ${motif.placement} names an invalid file`);
  }
  const files = [...new Set(motifs.map(motif => motif?.file).filter((file): file is string => typeof file === 'string' && FILE.test(file)))];
  if (files.length > MOTIF_PACK_MAX_FILES) problems.push(`${folder}: ${files.length} files, at most ${MOTIF_PACK_MAX_FILES}`);
  for (const extra of readdirSync(dir).filter(visible).filter(name => name !== 'pack.json' && !files.includes(name))) problems.push(`${folder}: ${extra} is not declared in pack.json`);
  for (const file of files) {
    const path = join(dir, file);
    if (!existsSync(path)) { problems.push(`${folder}: ${file} is missing`); continue; }
    const content = readFileSync(path, 'utf8');
    problems.push(...drawingProblems(`${folder}/${file}`, content));
    for (const motif of motifs.filter(entry => entry?.file === file)) {
      const part = PART[motif.behavior as Behavior];
      if (part && !content.includes(`data-part="${part}"`)) problems.push(`${folder}: ${motif.placement} uses ${motif.behavior} but ${file} labels no data-part="${part}"`);
    }
  }
  if (problems.length) return { problems };
  return { problems, manifest: { id: raw.id, version: 1, name: raw.name.trim(), topics: { es: raw.topics.es, en: raw.topics.en }, motifs: motifs.map(motif => ({ placement: motif.placement, file: motif.file, behavior: motif.behavior })) } };
}

/** Every valid pack on disk, by id. An invalid folder is skipped here; the library spec names its problems. */
export function listMotifPacks(root = packsRoot()): SourceMotifPackManifest[] {
  if (!existsSync(root)) return [];
  return readdirSync(root).filter(visible).filter(name => statSync(join(root, name)).isDirectory()).sort()
    .flatMap(folder => { const { manifest } = validateMotifPackDir(join(root, folder), folder); return manifest ? [manifest] : []; });
}

/** config.js `motifPack` for one pack id, or undefined when the id is unknown or the pack is invalid. */
export function loadMotifPack(id: string, root = packsRoot()): SourceRuntimeMotifPack | undefined {
  if (typeof id !== 'string' || !PACK_ID.test(id) || !existsSync(join(root, id))) return undefined;
  const { manifest } = validateMotifPackDir(join(root, id), id);
  if (!manifest) return undefined;
  return { id, motifs: manifest.motifs.map(motif => ({ placement: motif.placement, behavior: motif.behavior, svg: readFileSync(join(root, id, motif.file), 'utf8') })) };
}

/** A stored `config.motifPack` made safe again: known placements once each, known behaviours, markup re-sanitised, at
 * most 8 entries. Nothing usable → undefined, and the save drops the key. */
export function sanitizeRuntimeMotifPack(value: unknown): SourceRuntimeMotifPack | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const { id, motifs } = value as { id?: unknown; motifs?: unknown };
  if (typeof id !== 'string' || !PACK_ID.test(id) || id.length > 32 || !Array.isArray(motifs)) return undefined;
  const seen = new Set<string>();
  const kept = motifs.flatMap((motif: any) => {
    if (seen.size >= MOTIF_PACK_PLACEMENTS.length || !motif || typeof motif !== 'object' || !isPlacement(motif.placement) || seen.has(motif.placement) || !isBehavior(motif.behavior) || typeof motif.svg !== 'string') return [];
    const svg = sanitizeMotifSvg(motif.svg, { idPrefix: `pym-pack-${motif.placement}-` }).svg;
    if (!svg) return [];
    seen.add(motif.placement);
    return [{ placement: motif.placement as MotifPackPlacement, behavior: motif.behavior as Behavior, svg }];
  });
  return kept.length ? { id, motifs: kept } : undefined;
}
```

A script inside an otherwise good drawing is removed by the sanitiser, so the entry survives cleaned. That is why the test above expects `card` to be kept without `script`. A drawing that does not survive, such as `<img …>`, is dropped.

In `apps/api/src/storefront-source/source-motifs.ts`, add `import { sanitizeRuntimeMotifPack } from './source-motif-packs';` under the existing imports. Then replace these lines at the end of `withSanitizedMotifs`:

```ts
    if (!config || typeof config !== 'object' || !('motifs' in config)) return [file];
    const motifs = sanitizeRuntimeMotifs(config.motifs);
    if (JSON.stringify(motifs) === JSON.stringify(config.motifs)) return [file];
    changed = true; repairs.push('config.js: motifs re-sanitised');
    return [{ ...file, content: `window.PAGOSYA_CONFIG = ${JSON.stringify({ ...config, motifs })};\n` }];
```

with:

```ts
    if (!config || typeof config !== 'object' || !('motifs' in config || 'motifPack' in config)) return [file];
    let next = config;
    if ('motifs' in config) {
      const motifs = sanitizeRuntimeMotifs(config.motifs);
      if (JSON.stringify(motifs) !== JSON.stringify(config.motifs)) { next = { ...next, motifs }; repairs.push('config.js: motifs re-sanitised'); }
    }
    if ('motifPack' in config) {
      const motifPack = sanitizeRuntimeMotifPack(config.motifPack);
      if (JSON.stringify(motifPack) !== JSON.stringify(config.motifPack)) {
        const { motifPack: _dropped, ...rest } = next;
        next = motifPack ? { ...rest, motifPack } : rest;
        repairs.push(motifPack ? 'config.js: motif pack re-sanitised' : 'config.js: motif pack dropped');
      }
    }
    if (next === config) return [file];
    changed = true;
    return [{ ...file, content: `window.PAGOSYA_CONFIG = ${JSON.stringify(next)};\n` }];
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/api && npx jest src/storefront-source/source-motif-packs.spec.ts src/storefront-source/source-motifs.spec.ts src/storefront-source/source-commerce-motifs.spec.ts`
Expected: PASS (the new suite, and the existing motif suites unchanged).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/storefront-source/source-motif-packs.ts apps/api/src/storefront-source/source-motif-packs.spec.ts apps/api/src/storefront-source/fixtures/motif-pack.ts
git commit -m "feat(api): motif pack format, validation (sanitiser byte for byte, currentColor, 6 KB, placements) and config.motifPack re-sanitised on every save" -- apps/api/src/storefront-source/source-motif-packs.ts apps/api/src/storefront-source/source-motif-packs.spec.ts apps/api/src/storefront-source/fixtures/motif-pack.ts apps/api/src/storefront-source/source-motifs.ts
```

---

### Task 2: The kit reads a pack: product, card, cart and the empty cart

**Files:**
- Modify: `packages/storefront-kit/kit/commerce.js` (the `const MOTIFS = (Array.isArray(config.motifs) …` statement near line 66; after `function playMotifs(p) { … }` near line 1520; right before `const shoppingStyle = document.createElement('style');` near line 1565; `renderCart` right after `if (panelTemplate) applyCartTemplate(el, !count, panelTemplate);`)
- Create: `apps/api/src/storefront-source/source-commerce-motif-packs.spec.ts`

**Interfaces:**
- Consumes: `fixturePack`, `FIXTURE_DRAWINGS` (Task 1). `sourceMotifConfig`, `sourceMotifPaths` (existing) and `LAMP_SVG` (existing fixture).
- Produces in `commerce.js`: `AI_MOTIFS` (today's list), `PACK_MOTIFS` (store-wide pack entries `{ file:'', for:'store', target:'', behavior, trigger, placement, svg, pack:true }`), `MOTIFS = [...AI_MOTIFS, ...PACK_MOTIFS]`, `packMotif(placement): number` (an index into `MOTIFS`, or -1), `placeEmptyMotif(el)`, `PACK_CSS: string[]` (later tasks add to it), and `style[data-pagosya-kit="motif-pack"]` (only when a pack exists).

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/storefront-source/source-commerce-motif-packs.spec.ts`:

```ts
jest.setTimeout(90_000);
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { kitPath } from '@pagosya/storefront-kit';
import { fixturePack } from './fixtures/motif-pack';
import { LAMP_SVG } from './fixtures/motifs';
import { sourceMotifConfig, sourceMotifPaths } from './source-motifs';
import type { SourceDnaMotif } from './source-dna';

/** Identity libraries T2a: a drawn motif pack in the kit's slots. jsdom pins markup, guards and triggers; Chromium (later
 * describes in this file) measures what needs layout. */
const { JSDOM, VirtualConsole } = createRequire(join(__dirname, '../../../checkout/package.json'))('jsdom');
const commerce = readFileSync(kitPath('commerce.js'), 'utf8');
const ITEMS = [
  { id: 'galleta', name: 'Galletas de pollo', amount: 3590, currency: 'BOB', stock: 9, imageUrls: [], categoryId: 'snacks' },
  { id: 'hueso', name: 'Hueso de cuero', amount: 2500, currency: 'BOB', stock: 9, imageUrls: [], categoryId: 'snacks' },
];
const CATALOG = '<header><button data-cart-open>Pedido (<span data-cart-count>0</span>)</button></header><section data-pagosya-catalog></section><section data-pagosya-cart></section><p data-pagosya-status></p>';
const PRODUCT = '<main data-pagosya-product-page></main><section data-pagosya-cart></section><p data-pagosya-status></p>';
const own = (...motifs: SourceDnaMotif[]) => sourceMotifConfig(motifs, sourceMotifPaths(motifs).map(path => ({ path, content: LAMP_SVG })));
const opened: any[] = [];
afterEach(() => { while (opened.length) opened.pop().close(); });

function boot(options: { pack?: unknown; motifs?: unknown; body?: string; query?: string; cart?: unknown[]; reduced?: boolean; settings?: Record<string, unknown> } = {}) {
  const virtualConsole = new VirtualConsole();
  const dom = new JSDOM(`<html><head></head><body>${options.body ?? CATALOG}</body></html>`, { url: 'https://shop.test/', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole });
  const w = dom.window; opened.push(w);
  w.HTMLElement.prototype.scrollIntoView = () => {};
  w.matchMedia = (query: string) => ({ matches: /reduce/.test(query) ? !!options.reduced : /hover/.test(query), addEventListener() {}, removeEventListener() {} });
  w.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  w.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
  w.PAGOSYA_PREVIEW = true;
  w.PAGOSYA_PREVIEW_QUERY = options.query ?? '';
  if (options.cart) w.PAGOSYA_PREVIEW_CART = options.cart;
  const data = { storeName: 'Huellitas', items: ITEMS, categories: [{ id: 'snacks', name: 'Snacks' }] };
  w.PAGOSYA_CONFIG = { slug: 'huellitas', apiBaseUrl: 'https://api.test', checkoutOrigin: 'https://pay.test', data, dna: { version: 1, motion: 'calm' },
    ...(options.pack !== undefined ? { motifPack: options.pack } : {}), ...(options.motifs !== undefined ? { motifs: options.motifs } : {}), ...options.settings };
  w.fetch = jest.fn(async () => ({ ok: true, json: async () => data }));
  w.eval(commerce);
  const $ = (selector: string) => w.document.querySelector(selector);
  const $$ = (selector: string) => [...w.document.querySelectorAll(selector)];
  const tick = () => new Promise(resolve => setTimeout(resolve, 30));
  return { w, doc: w.document, $, $$, tick };
}

describe('a store without a motif pack', () => {
  it('renders exactly as before: no pack style, slot or attribute, whatever sits in motifPack', () => {
    const invalid = [undefined, null, 'paws', { id: 'Bad Id', motifs: fixturePack().motifs }, { id: 'paws', motifs: 'x' },
      { id: 'paws', motifs: [{ placement: 'hero', behavior: 'grow', svg: fixturePack().motifs[0].svg }] }];
    for (const pack of invalid) {
      const { doc } = boot({ pack });
      expect(doc.querySelector('style[data-pagosya-kit="motif-pack"]')).toBeNull();
      expect(doc.querySelector('.pagosya-motif')).toBeNull();
      expect(doc.documentElement.outerHTML).not.toContain('motif');
    }
  });
});

describe('pack placements the kit already had: product, card, cart', () => {
  it('marks every card, the product title and the cart header, hidden from assistive tech', async () => {
    const catalog = boot({ pack: fixturePack() });
    await catalog.tick();
    expect(catalog.$$('.menu-item .pagosya-motif[data-motif-slot="card"]')).toHaveLength(2);
    expect(catalog.$('.cart-drawer__header .pagosya-motif[data-motif-slot="cart"]')).not.toBeNull();
    expect(catalog.$('style[data-pagosya-kit="motif-pack"]')).not.toBeNull();
    const product = boot({ pack: fixturePack(), body: PRODUCT, query: '?id=hueso' });
    const slot = product.$('.pagosya-motif[data-motif-slot="product"]');
    expect(slot.nextElementSibling.id).toBe('pagosya-product-title');
    for (const holder of [...catalog.$$('.pagosya-motif'), slot]) expect(holder.getAttribute('aria-hidden')).toBe('true');
  });

  it('lets a store\'s own targeted motif keep the card it matches, and the pack fill the rest', async () => {
    const { $$, tick } = boot({ pack: fixturePack(), motifs: own({ for: 'product', target: 'galletas', meaning: 'm', behavior: 'glow', trigger: 'hover', placement: 'card' }) });
    await tick();
    const [galleta, hueso] = $$('.menu-item');
    expect(galleta.querySelector('.pagosya-motif').dataset.motifBehavior).toBe('glow');
    expect(hueso.querySelector('.pagosya-motif').dataset.motifBehavior).toBe('bounce');
  });

  it('uses one pack of at most 8 placements, each placement once', async () => {
    const pack = fixturePack();
    const { $$, tick } = boot({ pack: { id: pack.id, motifs: [...pack.motifs, ...pack.motifs.map(motif => ({ ...motif, behavior: 'spin' }))] } });
    await tick();
    expect($$('.menu-item .pagosya-motif').map((holder: any) => holder.dataset.motifBehavior)).toEqual(['bounce', 'bounce']);
  });

  it('never inserts a hostile pack drawing: script, foreignObject, external href, handler, external url()', async () => {
    const base = fixturePack(['card']).motifs[0];
    const hostile = [
      base.svg.replace('</svg>', '<script>window.pwned=1</script></svg>'),
      base.svg.replace('</svg>', '<foreignObject><div xmlns="http://www.w3.org/1999/xhtml">x</div></foreignObject></svg>'),
      base.svg.replace('</svg>', '<image href="https://evil.test/x.png" width="4" height="4"/></svg>'),
      base.svg.replace('<circle', '<circle onclick="window.pwned=1"'),
      base.svg.replace('stroke="currentColor"', 'stroke="url(https://evil.test/a)"'),
    ];
    for (const svg of hostile) {
      const { w, doc, tick } = boot({ pack: { id: 'paws', motifs: [{ ...base, svg }] } });
      await tick();
      expect(doc.querySelector('.pagosya-motif')).toBeNull();
      expect(doc.querySelector('script')).toBeNull();
      expect(doc.body.innerHTML).not.toMatch(/foreignObject|evil\.test/);
      expect(w.pwned).toBeUndefined();
    }
  });
});

const CART_TEMPLATE = (empty: string) => `<template data-pagosya-cart-template><div class="canasta"><button data-cart-close>Cerrar</button><div data-cart-slot="lines"></div><div data-cart-slot="total"></div><div data-cart-slot="action"></div><div data-cart-slot="empty">${empty}</div></div></template>`;

describe('the empty placement', () => {
  it('draws the kit\'s empty cart, hidden from assistive tech, and leaves once something is in the cart', async () => {
    const shop = boot({ pack: fixturePack() });
    await shop.tick();
    const holder = shop.$('li.order-empty > .pagosya-motif[data-motif-slot="empty"]');
    expect(holder).not.toBeNull();
    expect(holder.getAttribute('aria-hidden')).toBe('true');
    expect(holder.querySelector('svg [data-part="steam"]')).not.toBeNull();
    shop.$('.menu-add[data-add="galleta"]').click();
    expect(shop.$('.pagosya-motif[data-motif-slot="empty"]')).toBeNull();
  });

  it('fills a cart template only where it asks (data-motif-empty in its empty slot)', async () => {
    const asks = boot({ pack: fixturePack(), body: CATALOG + CART_TEMPLATE('<div data-motif-empty></div><p>Tu canasta espera</p>') });
    await asks.tick();
    expect(asks.$('[data-cart-panel] [data-cart-slot="empty"] [data-motif-empty] > .pagosya-motif[data-motif-slot="empty"]')).not.toBeNull();
    const silent = boot({ pack: fixturePack(), body: CATALOG + CART_TEMPLATE('<p>Tu canasta espera</p>') });
    await silent.tick();
    expect(silent.$$('[data-cart-panel] [data-cart-slot="empty"] .pagosya-motif')).toHaveLength(0);
  });

  it('never plays with reduced motion or with motion off', async () => {
    for (const options of [{ reduced: true }, { settings: { motion: 'off' } }]) {
      const shop = boot({ pack: fixturePack(), ...options });
      await shop.tick();
      expect(shop.$('.pagosya-motif[data-motif-slot="empty"]')).not.toBeNull();
      expect(shop.$$('.pagosya-motif[data-motif-play]')).toHaveLength(0);
    }
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/api && npx jest src/storefront-source/source-commerce-motif-packs.spec.ts`
Expected: FAIL. The "without a pack" test passes; every placement test fails because `.pagosya-motif` is not found (the kit ignores `motifPack` today).

- [ ] **Step 3: Implement**

In `commerce.js`, replace the statement that starts `  const MOTIFS = (Array.isArray(config.motifs) ? config.motifs : []).slice(0, 3).filter(motif => motif && typeof motif === 'object'` (three lines, ending `motifDrawing(motif.svg));`) with:

```js
  const AI_MOTIFS = (Array.isArray(config.motifs) ? config.motifs : []).slice(0, 3).filter(motif => motif && typeof motif === 'object'
    && MOTIF_BEHAVIORS.includes(motif.behavior) && MOTIF_SLOT_TRIGGERS.includes(motif.trigger) && ['product', 'card', 'cart'].includes(motif.placement)
    && ['store', 'category', 'product'].includes(motif.for) && typeof motif.target === 'string' && typeof motif.svg === 'string' && motif.svg.length <= 6144 && motifDrawing(motif.svg));
  /* Identity libraries (T2a): one drawn motif pack, at most 8 placements, one drawing each. The API sanitised the markup
   * (config.motifPack, re-sanitised on every save); it is verified again here with the same lists. Pack motifs are
   * store-wide; the store's own targeted motifs above keep precedence in the slots both can fill. A store without a
   * pack gets nothing new: no entry, no style, no observer. */
  const MOTIF_PACK_PLACEMENTS = ['button', 'pattern', 'divider', 'sticker', 'empty', 'product', 'card', 'cart'];
  const MOTIF_PACK_TRIGGERS = { product: 'appear', card: 'hover', cart: 'add-to-cart', button: 'hover', pattern: 'none', divider: 'scroll', sticker: 'appear', empty: 'appear' };
  const MOTIF_PACK = config.motifPack && typeof config.motifPack === 'object' && typeof config.motifPack.id === 'string'
    && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(config.motifPack.id) && Array.isArray(config.motifPack.motifs) ? config.motifPack : null;
  const PACK_MOTIFS = (MOTIF_PACK ? MOTIF_PACK.motifs : []).slice(0, 8).filter((motif, index, all) => motif && typeof motif === 'object'
    && MOTIF_PACK_PLACEMENTS.includes(motif.placement) && all.findIndex(other => other && other.placement === motif.placement) === index
    && MOTIF_BEHAVIORS.includes(motif.behavior) && typeof motif.svg === 'string' && motif.svg.length <= 6144 && motifDrawing(motif.svg))
    .map(motif => ({ file: '', for: 'store', target: '', behavior: motif.behavior, trigger: MOTIF_PACK_TRIGGERS[motif.placement], placement: motif.placement, svg: motif.svg, pack: true }));
  const MOTIFS = [...AI_MOTIFS, ...PACK_MOTIFS];
  const packMotif = placement => MOTIFS.findIndex(motif => motif.pack && motif.placement === placement);
```

Directly after the closing brace of `function playMotifs(p) { … }`, add:

```js
  /* The empty placement: the kit's own empty cart line shows the pack drawing. A store's cart template shows it only where
   * it asks, in an element marked data-motif-empty inside its "empty" slot: the template owns that state's design. */
  function placeEmptyMotif(el) {
    const index = packMotif('empty');
    if (index < 0) return;
    const asked = [...el.querySelectorAll('[data-cart-slot="empty"] [data-motif-empty]')];
    const hosts = asked.length ? asked : [...el.querySelectorAll('.order-items > li.order-empty')];
    for (const host of hosts) {
      if (host.querySelector(':scope > .pagosya-motif[data-motif-slot="empty"]')) continue;
      const holder = motifSlot(index, 'empty');
      if (!holder) return;
      host.prepend(holder);
      armMotif(holder, host);
    }
  }
```

Directly above `  const shoppingStyle = document.createElement('style');`, add:

```js
  /* Pack placements' own rules, written only for a store with a pack: a store without one keeps exactly the styles it had.
   * Later placements add their rules to this list. */
  const PACK_CSS = [
    '.pagosya-motif[data-motif-slot=empty]{display:block!important;width:64px;height:64px;margin:0 0 12px}',
  ];
  if (PACK_MOTIFS.length) {
    const packStyle = document.createElement('style');
    packStyle.dataset.pagosyaKit = 'motif-pack';
    packStyle.textContent = `@layer pagosya-commerce {\n${PACK_CSS.join('\n')}\n}`;
    document.head.append(packStyle);
  }
```

In `renderCart`, directly after `      if (panelTemplate) applyCartTemplate(el, !count, panelTemplate);`, add:

```js
      if (!count && PACK_MOTIFS.length) placeEmptyMotif(el);
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/api && npx jest src/storefront-source/source-commerce-motif-packs.spec.ts src/storefront-source/source-commerce && node ../../packages/storefront-kit/kit/check-runtimes.mjs`
Expected: PASS. That covers the new suite and every existing `source-commerce-*` suite (motifs, templates, DNA, contrast, cascade). The runtime check parses `commerce.js`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/storefront-source/source-commerce-motif-packs.spec.ts
git commit -m "feat(kit): a store's motif pack fills the product, card and cart slots and draws the empty cart (and a cart template's data-motif-empty); stores without a pack are unchanged" -- packages/storefront-kit/kit/commerce.js apps/api/src/storefront-source/source-commerce-motif-packs.spec.ts
```

---

### Task 3: The button placement and the `data-motif-icon` slot

**Files:**
- Modify: `packages/storefront-kit/kit/commerce.js` (after `placeEmptyMotif`; `PACK_CSS`; right after the `if (PACK_MOTIFS.length) { … packStyle … }` block; the call sites `if (MOTIFS.length) placeProductMotif(p);` and `if (MOTIFS.length) placeCardMotifs(el);`)
- Test: `apps/api/src/storefront-source/source-commerce-motif-packs.spec.ts`

**Interfaces:**
- Consumes: `packMotif`, `motifSlot`, `armMotif`, `PACK_CSS`, `PACK_MOTIFS` (Task 2).
- Produces: `MOTIF_PRICES`, `KIT_ICON_BUTTONS`, `NO_ICON`, `fillIconSlot(slot, button)`, `placeButtonMotifs(root)`, `MOTIF_SLOTS` (selector), `placeIdentityMotifs(root)`, and the identity `MutationObserver`. Slot states: `data-motif-icon=""` (empty), `"placed"`, `"removed"`. Kit-made slots carry `data-motif-kit`.
- Produces (spec helpers used by Tasks 4 and 5): `chrome()`, `openShop(options)`.

- [ ] **Step 1: Write the failing tests**

At the top of the spec, change the imports to add Playwright and the contrast helper:

```ts
import { chromium, type Browser, type Page } from 'playwright';
import { contrastRatio } from './source-scorecard';
```

Then add below `afterEach(…)`:

```ts
let browser: Browser | undefined;
const chrome = async () => (browser ??= await chromium.launch({ headless: true }));
afterAll(async () => { await browser?.close(); });
async function openShop(options: { pack?: unknown; css?: string; body?: string; query?: string; width?: number; dna?: Record<string, unknown>; reduced?: boolean; cart?: unknown[] }): Promise<Page> {
  const page = await (await chrome()).newPage({ viewport: { width: options.width ?? 1280, height: 800 }, reducedMotion: options.reduced ? 'reduce' : 'no-preference' });
  const config = { slug: 'huellitas', apiBaseUrl: 'https://api.test', checkoutOrigin: 'https://pay.test', demo: true, data: { storeName: 'Huellitas', items: ITEMS, categories: [{ id: 'snacks', name: 'Snacks' }] },
    dna: options.dna ?? { version: 1, motion: 'calm' }, ...(options.pack ? { motifPack: options.pack } : {}) };
  await page.setContent(`<!doctype html><html lang="es"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${options.css ?? ''}</style></head><body>${options.body ?? CATALOG}</body></html>`);
  await page.addScriptTag({ content: `window.PAGOSYA_PREVIEW=true;window.PAGOSYA_PREVIEW_QUERY=${JSON.stringify(options.query ?? '')};${options.cart ? `window.PAGOSYA_PREVIEW_CART=${JSON.stringify(options.cart)};` : ''}window.PAGOSYA_CONFIG=${JSON.stringify(config)};` });
  await page.addScriptTag({ content: commerce });
  return page;
}
```

Append:

```ts
describe('the button placement and the data-motif-icon slot', () => {
  it('puts the pack icon first in the add and buy buttons, beside the label and outside the price', async () => {
    const product = boot({ pack: fixturePack(), body: PRODUCT, query: '?id=galleta' });
    const buy = product.$('.product-detail__buy');
    const slot = buy.firstElementChild;
    expect(slot.getAttribute('data-motif-icon')).toBe('placed');
    expect(slot.getAttribute('aria-hidden')).toBe('true');
    expect(slot.querySelector('.pagosya-motif[data-motif-slot="button"] svg')).not.toBeNull();
    expect(buy.textContent).toContain('Añadir al pedido');
    expect(buy.querySelector('.product-detail__buy-total .pagosya-motif')).toBeNull();
    const catalog = boot({ pack: fixturePack() });
    await catalog.tick();
    expect(catalog.$$('.menu-add > [data-motif-icon="placed"] .pagosya-motif')).toHaveLength(2);
  });

  it('never decorates the cart\'s checkout or pay button', async () => {
    const shop = boot({ pack: fixturePack(), cart: [{ id: 'galleta', quantity: 1 }] });
    await shop.tick();
    shop.$('[data-cart-open]').click();
    await shop.tick();
    expect(shop.$$('.checkout-button').length).toBeGreaterThan(0);
    expect(shop.$$('.checkout-button:not(.product-detail__buy) .pagosya-motif')).toHaveLength(0);
  });

  it('fills a store\'s own slot, skips one inside a <template>, and fills one the store\'s scripts add later', async () => {
    const shop = boot({ pack: fixturePack(), body: CATALOG + '<a class="cta" href="#catalogo">Ver snacks <span data-motif-icon></span></a>' });
    expect(shop.$('.cta [data-motif-icon="placed"] .pagosya-motif')).not.toBeNull();
    const fresh = shop.doc.createElement('a');
    fresh.className = 'cta2'; fresh.innerHTML = 'Comprar <span data-motif-icon></span>';
    shop.doc.body.append(fresh);
    // React puts a <template>'s children on the element itself: they sit in the document but must stay untouched.
    const template = shop.doc.createElement('template'), inner = shop.doc.createElement('span');
    inner.setAttribute('data-motif-icon', ''); template.appendChild(inner); shop.doc.body.append(template);
    await shop.tick();
    expect(shop.$('.cta2 [data-motif-icon="placed"] .pagosya-motif')).not.toBeNull();
    expect(inner.getAttribute('data-motif-icon')).toBe('');
    expect(inner.childNodes).toHaveLength(0);
  });

  it('leaves a store\'s slot empty, with no pack style, when there is no pack button drawing', () => {
    for (const pack of [undefined, fixturePack(['card', 'empty'])]) {
      const shop = boot({ pack, body: CATALOG + '<a class="cta" href="#">Ver <span data-motif-icon></span></a>' });
      expect(shop.$('.cta [data-motif-icon]').getAttribute('data-motif-icon')).toBe('');
      expect(shop.$('.cta [data-motif-icon]').childNodes).toHaveLength(0);
    }
  });

  it('plays on hover and never with reduced motion', async () => {
    for (const reduced of [false, true]) {
      const shop = boot({ pack: fixturePack(), body: PRODUCT, query: '?id=galleta', reduced });
      const buy = shop.$('.product-detail__buy');
      buy.dispatchEvent(new shop.w.Event('pointerenter'));
      expect(buy.querySelector('.pagosya-motif').hasAttribute('data-motif-play')).toBe(!reduced);
    }
  });
});

describe('button icons in a real browser', () => {
  it('removes the icon from a narrow phone button whose label it would wrap, and keeps it on a roomy one', async () => {
    const body = CATALOG + '<p><button class="narrow" type="button">Comprar ahora<span data-motif-icon></span></button></p><p><button class="wide" type="button">Comprar ahora <span data-motif-icon></span></button></p>';
    // Monospace: 13ch is exactly the label, so the label fits alone and the icon (1.15em + gap) cannot.
    const css = 'body{margin:8px} button{font:16px/1.25 monospace;padding:6px 8px;box-sizing:border-box} .narrow{width:calc(13ch + 20px)}';
    const page = await openShop({ pack: fixturePack(), body, css, width: 320 });
    try {
      await page.waitForSelector('.wide [data-motif-icon="placed"] svg');
      await page.waitForFunction(() => document.querySelector('.narrow [data-motif-icon]')?.getAttribute('data-motif-icon') === 'removed');
      expect(await page.$('.narrow .pagosya-motif')).toBeNull();
      // Back on one line: as tall as the roomy button that kept its icon.
      const [narrow, wide] = await Promise.all(['.narrow', '.wide'].map(selector => page.$eval(selector, el => el.getBoundingClientRect().height)));
      expect(Math.abs(narrow - wide)).toBeLessThan(3);
      expect(await page.$('.wide .pagosya-motif')).not.toBeNull();
    } finally { await page.close(); }
  });

  it('removes the icon from a small fixed round add button it would overflow', async () => {
    const css = '[data-pagosya-catalog] .menu-add{display:inline-flex!important;align-items:center;justify-content:center;width:36px!important;height:36px!important;min-height:0!important;padding:0!important;overflow:hidden}';
    const page = await openShop({ pack: fixturePack(), css, width: 390 });
    try {
      await page.waitForSelector('.menu-add');
      await page.waitForTimeout(120);
      expect(await page.$$eval('.menu-add .pagosya-motif', els => els.length)).toBe(0);
    } finally { await page.close(); }
  });

  it('keeps the buy button\'s label on one line with the icon and never over its total', async () => {
    const page = await openShop({ pack: fixturePack(), body: PRODUCT, query: '?id=galleta', width: 390 });
    try {
      await page.waitForSelector('[data-pagosya-product] .product-detail__buy [data-motif-icon="placed"] svg');
      await page.waitForTimeout(120);
      const facts = await page.$eval('[data-pagosya-product] .product-detail__buy', buy => {
        const icon = buy.querySelector('.pagosya-motif')!.getBoundingClientRect(), total = buy.querySelector('.product-detail__buy-total')?.getBoundingClientRect();
        return { height: buy.getBoundingClientRect().height, overlaps: !!total && total.width > 0 && total.left < icon.right && total.right > icon.left && total.top < icon.bottom && total.bottom > icon.top };
      });
      expect(facts.overlaps).toBe(false);
      expect(facts.height).toBeLessThan(64);
    } finally { await page.close(); }
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/api && npx jest src/storefront-source/source-commerce-motif-packs.spec.ts -t "button"`
Expected: FAIL. `slot.getAttribute` is called on null, and there is no `[data-motif-icon="placed"]`.

- [ ] **Step 3: Implement**

Directly after `placeEmptyMotif`, add:

```js
  /* The button placement and the data-motif-icon slot (T2a/T2b): the pack's small drawing beside the label of the add and
   * buy buttons, and inside any element a store marks data-motif-icon (its own calls to action). Never on the cart's
   * checkout or pay buttons, never over a price, and never at the cost of the label: an icon that would wrap the label or
   * overflow its button is taken out again (the slot says "removed", so it is not retried). */
  const MOTIF_PRICES = '.menu-item__price,[data-product-field="price"],[data-product-pricing],.product-detail__buy-total,.order-total';
  const KIT_ICON_BUTTONS = '.menu-add,.product-detail__buy,.product-detail__sticky button';
  const NO_ICON = '.checkout-button:not(.product-detail__buy),[data-pay],[data-checkout],[data-finish-demo],template *';
  function fillIconSlot(slot, button) {
    const index = packMotif('button');
    if (index < 0 || slot.getAttribute('data-motif-icon') === 'placed') return;
    const holder = motifSlot(index, 'button');
    if (!holder) return;
    const before = button.getBoundingClientRect();
    const spareX = button.scrollWidth - button.clientWidth, spareY = button.scrollHeight - button.clientHeight;
    slot.replaceChildren(holder);
    slot.setAttribute('data-motif-icon', 'placed');
    slot.setAttribute('aria-hidden', 'true');
    armMotif(holder, button);
    const check = () => {
      if (!holder.isConnected) return;
      const after = button.getBoundingClientRect();
      if (!after.width) return; // nothing laid out to measure
      const box = holder.getBoundingClientRect();
      const wraps = before.height > 0 && after.height > before.height + 1;
      const overflows = button.scrollWidth - button.clientWidth > Math.max(0, spareX) + 1 || button.scrollHeight - button.clientHeight > Math.max(0, spareY) + 1;
      const scope = button.closest('.menu-item,[data-custom-product],[data-pagosya-product],.product-detail__sticky') || button;
      const onPrice = [...scope.querySelectorAll(MOTIF_PRICES)].some(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.left < box.right && r.right > box.left && r.top < box.bottom && r.bottom > box.top; });
      if (!wraps && !overflows && !onPrice) return;
      holder.remove();
      if (slot.hasAttribute('data-motif-kit')) slot.remove(); else slot.setAttribute('data-motif-icon', 'removed');
    };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(check); else check();
  }
  function placeButtonMotifs(root) {
    if (packMotif('button') < 0 || !root?.querySelectorAll) return;
    root.querySelectorAll(KIT_ICON_BUTTONS).forEach(button => {
      if (button.matches(NO_ICON) || button.querySelector(':scope > [data-motif-icon]')) return;
      const slot = document.createElement('span');
      slot.setAttribute('data-motif-icon', '');
      slot.setAttribute('data-motif-kit', '');
      button.insertBefore(slot, button.firstChild);
      fillIconSlot(slot, button);
    });
    root.querySelectorAll('[data-motif-icon]:not([data-motif-icon="placed"]):not([data-motif-icon="removed"])').forEach(slot => {
      if (slot.closest('template')) return;
      const host = slot.closest('button,a,[role="button"]') || slot;
      if (host.matches(NO_ICON)) return;
      fillIconSlot(slot, host);
    });
  }
```

Add these entries to `PACK_CSS`:

```js
    '[data-motif-icon=placed]{display:inline-flex;vertical-align:middle;line-height:0}',
    '[data-motif-icon=placed][data-motif-kit]{margin-inline-end:.45em}',
    '.pagosya-motif[data-motif-slot=button]{width:1.15em;height:1.15em;color:inherit}',
    ':root[data-dna-button=split] :is(.product-detail__buy,.product-detail__sticky button)>[data-motif-icon]{display:none}',
```

(Normal declarations, not `!important`, on purpose. The later DNA layer can then resize the icon, which the `bubbly` form does in Task 11, while the base 64px cap still holds.)

Directly after the `if (PACK_MOTIFS.length) { const packStyle … }` block, add:

```js
  /* Store-marked slots are placed once the page is parsed, and again whenever the store's own scripts (React) add or
   * replace them. Only a store with a pack observes anything. */
  const MOTIF_SLOTS = '[data-motif-icon]:not([data-motif-icon="placed"]):not([data-motif-icon="removed"])';
  function placeIdentityMotifs(root) { placeButtonMotifs(root); }
  if (PACK_MOTIFS.length) {
    const startIdentity = () => {
      placeIdentityMotifs(document.body);
      if (typeof MutationObserver !== 'function') return;
      new MutationObserver(records => {
        for (const record of records) for (const node of record.addedNodes) {
          if (node.nodeType !== 1 || node.classList?.contains('pagosya-motif')) continue;
          if (node.matches?.(MOTIF_SLOTS) || node.querySelector?.(MOTIF_SLOTS)) { placeIdentityMotifs(node.parentElement || node); return; }
        }
      }).observe(document.body, { childList: true, subtree: true });
    };
    if (document.body) startIdentity(); else document.addEventListener('DOMContentLoaded', startIdentity, { once: true });
  }
```

Replace `    if (MOTIFS.length) placeProductMotif(p);` with `    if (MOTIFS.length) { placeProductMotif(p); placeButtonMotifs(detail); }`. Replace `      if (MOTIFS.length) placeCardMotifs(el);` with `      if (MOTIFS.length) { placeCardMotifs(el); placeButtonMotifs(el); }`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/api && npx jest src/storefront-source/source-commerce-motif-packs.spec.ts src/storefront-source/source-commerce && node ../../packages/storefront-kit/kit/check-runtimes.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(kit): pack button icons beside the add and buy labels and in store-marked data-motif-icon slots; never on checkout or pay buttons or a price, removed when they would wrap or overflow" -- packages/storefront-kit/kit/commerce.js apps/api/src/storefront-source/source-commerce-motif-packs.spec.ts
```

---

### Task 4: The pattern placement, under the contrast floor

**Files:**
- Modify: `packages/storefront-kit/kit/commerce.js` (after `placeButtonMotifs`; `PACK_CSS`; the `MOTIF_SLOTS` and `placeIdentityMotifs` lines from Task 3)
- Test: `apps/api/src/storefront-source/source-commerce-motif-packs.spec.ts`

**Interfaces:**
- Consumes: `packMotif`, `motifDrawing`, `MOTIFS`, `PACK_CSS`, `openShop`, `contrastRatio`.
- Produces: `PATTERN_EXCLUDED`, `PATTERN_TILE_LIMIT = 1.35`, `motifRgb(value): number[] | null`, `motifContrast(a, b): number`, `patternBackdrop(section): number[] | null`, `patternAlpha(ink, back, texts): number` (0 means none), `placePatterns(root)`. Section states: `data-motif-pattern="placed"` plus `data-motif-pattern-alpha`, or `"skipped"`. Custom property: `--pagosya-pattern`.

- [ ] **Step 1: Write the failing tests**

Append:

```ts
const HERO = (style: string, extra = '') => `${CATALOG}<section class="hero" data-motif-pattern style="${style}"><h2>Horneados cada mañana</h2><p>Snacks sin conservantes para perros felices.</p>${extra}</section>`;

describe('the pattern placement', () => {
  it('tiles a marked section with the pack pattern in its own text colour, and never the catalog', () => {
    const shop = boot({ pack: fixturePack(), body: HERO('background:#fbf6ee;color:#2a1d12').replace('<section data-pagosya-catalog>', '<section data-pagosya-catalog data-motif-pattern>') });
    const hero = shop.$('.hero');
    expect(hero.getAttribute('data-motif-pattern')).toBe('placed');
    const alpha = Number(hero.getAttribute('data-motif-pattern-alpha'));
    expect(alpha).toBeGreaterThanOrEqual(.04);
    expect(alpha).toBeLessThanOrEqual(.12);
    const url = hero.style.getPropertyValue('--pagosya-pattern');
    expect(url).toMatch(/^url\("data:image\/svg\+xml,/);
    const drawing = decodeURIComponent(url.slice('url("data:image/svg+xml,'.length, -2));
    expect(drawing).toContain('color="rgb(42,29,18)"');
    expect(drawing).toContain(`opacity="${alpha}"`);
    expect(drawing).not.toMatch(/<script|href/);
    expect(shop.$('[data-pagosya-catalog]').getAttribute('data-motif-pattern')).toBe('');
    expect(shop.$('[data-pagosya-catalog]').style.getPropertyValue('--pagosya-pattern')).toBe('');
  });

  it('does nothing without a pack pattern, and skips a section that holds the catalog', () => {
    expect(boot({ pack: fixturePack(['card']), body: HERO('background:#fff;color:#222') }).$('.hero').getAttribute('data-motif-pattern')).toBe('');
    const wrapped = boot({ pack: fixturePack(), body: '<section class="wrap" data-motif-pattern style="background:#fff;color:#222"><div data-pagosya-catalog></div></section><section data-pagosya-cart></section><p data-pagosya-status></p>' });
    expect(wrapped.$('.wrap').style.getPropertyValue('--pagosya-pattern')).toBe('');
  });
});

describe('the pattern in a real browser', () => {
  async function facts(page: Page) {
    return page.$eval('.hero', section => {
      const rgb = (value: string) => (value.match(/[\d.]+/g) || []).map(Number).slice(0, 3);
      const texts = [section, ...Array.from(section.querySelectorAll('*'))].filter(el => Array.from(el.childNodes).some(node => node.nodeType === 3 && node.textContent!.trim())).map(el => rgb(getComputedStyle(el).color));
      return { state: section.getAttribute('data-motif-pattern'), alpha: Number(section.getAttribute('data-motif-pattern-alpha') || 0), image: getComputedStyle(section).backgroundImage, back: rgb(getComputedStyle(section).backgroundColor), ink: rgb(getComputedStyle(section).color), texts, animations: section.getAnimations().length };
    });
  }

  it.each([
    ['a light palette', 'background:#fbf6ee;color:#2a1d12', '<p style="color:#8a3b12">Desde 2019</p>'],
    ['light text on a dark palette', 'background:#151515;color:#f2f2f2', '<p style="color:#f5b041">Desde 2019</p>'],
  ])('keeps the tile under the contrast floor on %s', async (_name, style, extra) => {
    const page = await openShop({ pack: fixturePack(), body: HERO(style, extra), width: 390 });
    try {
      await page.waitForSelector('.hero[data-motif-pattern="placed"]');
      const seen = await facts(page);
      expect(seen.image).toContain('data:image/svg+xml');
      expect(seen.alpha).toBeGreaterThanOrEqual(.04);
      expect(seen.alpha).toBeLessThanOrEqual(.12);
      const tile = seen.back.map((value, i) => value + (seen.ink[i] - value) * seen.alpha);
      expect(contrastRatio(tile, seen.back)).toBeLessThanOrEqual(1.35);
      for (const text of seen.texts) expect(contrastRatio(text, tile)).toBeGreaterThanOrEqual(4.5);
      expect(seen.animations).toBe(0);
    } finally { await page.close(); }
  });

  it.each([
    ['text that is already weak', 'background:#151515;color:#777777'],
    ['a photo background', 'background:#151515 url(data:image/gif;base64,R0lGODlhAQABAAAAACw=);color:#f2f2f2'],
    ['a gradient background', 'background:linear-gradient(#ffffff,#eeeeee);color:#222222'],
  ])('skips a section with %s', async (_name, style) => {
    const page = await openShop({ pack: fixturePack(), body: HERO(style) });
    try {
      await page.waitForSelector('.hero[data-motif-pattern="skipped"]');
      expect((await facts(page)).image).not.toContain('data:image/svg+xml');
    } finally { await page.close(); }
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/api && npx jest src/storefront-source/source-commerce-motif-packs.spec.ts -t "pattern"`
Expected: FAIL. `data-motif-pattern` stays `""`, and the Chromium tests time out waiting for `placed` or `skipped`.

- [ ] **Step 3: Implement**

Directly after `placeButtonMotifs`, add:

```js
  /* The pattern placement: a tile behind a section the store marks data-motif-pattern, never behind or around the kit's
   * catalog, cart, product or checkout. It is a background image (an SVG data URL; every storefront CSP allows img-src
   * data:), drawn in the section's own text colour at the highest opacity, at most .12, that keeps it under the contrast
   * floor: the tile against the background at most 1.35:1, every text in the section still 4.5:1 over it. A section whose
   * background the page cannot compare (a photo, a gradient, an unknown colour syntax), or whose text is already weaker than
   * that, gets no pattern. Static: nothing moves. */
  const PATTERN_EXCLUDED = '[data-pagosya-catalog],[data-pagosya-cart],[data-pagosya-product],[data-pagosya-product-page],.cart-drawer,.checkout-review,dialog,template';
  const PATTERN_TILE_LIMIT = 1.35;
  const motifRgb = value => {
    const text = String(value || '').trim();
    if (!text || text === 'transparent') return [0, 0, 0, 0];
    const n = (text.match(/-?[\d.]+/g) || []).map(Number);
    return /^rgba?\(/i.test(text) && n.length >= 3 ? [n[0], n[1], n[2], n.length > 3 ? n[3] : 1] : null;
  };
  const motifLuminance = c => [0, 1, 2].map(i => { const v = c[i] / 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
  const motifContrast = (a, b) => { const [x, y] = [motifLuminance(a), motifLuminance(b)].sort((m, n) => n - m); return (x + .05) / (y + .05); };
  function patternBackdrop(section) {
    const layers = [];
    for (let node = section; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.backgroundImage && style.backgroundImage !== 'none') return null;
      const colour = motifRgb(style.backgroundColor);
      if (!colour) return null;
      if (colour[3] > 0) layers.push(colour);
      if (colour[3] >= .99) break;
    }
    return layers.reverse().reduce((under, top) => [0, 1, 2].map(i => top[i] * top[3] + under[i] * (1 - top[3])), [255, 255, 255]);
  }
  function patternAlpha(ink, back, texts) {
    for (let step = 12; step >= 4; step--) {
      const alpha = step / 100, tile = [0, 1, 2].map(i => back[i] + (ink[i] - back[i]) * alpha);
      if (motifContrast(tile, back) <= PATTERN_TILE_LIMIT && texts.every(text => motifContrast(text, tile) >= 4.5)) return alpha;
    }
    return 0;
  }
  function placePatterns(root) {
    const index = packMotif('pattern');
    if (index < 0 || !root?.querySelectorAll) return;
    const sections = [...(root.matches?.('[data-motif-pattern]') ? [root] : []), ...root.querySelectorAll('[data-motif-pattern]')];
    for (const section of sections) {
      const state = section.getAttribute('data-motif-pattern');
      if (state === 'placed' || state === 'skipped' || section.closest(PATTERN_EXCLUDED) || section.querySelector(PATTERN_EXCLUDED)) continue;
      const back = patternBackdrop(section), ink = motifRgb(getComputedStyle(section).color);
      const texts = [section, ...section.querySelectorAll('*')]
        .filter(el => [...el.childNodes].some(node => node.nodeType === 3 && node.textContent.trim()))
        .slice(0, 40).map(el => motifRgb(getComputedStyle(el).color)).filter(colour => colour && colour[3] > 0);
      const alpha = back && ink && ink[3] > 0 ? patternAlpha(ink, back, texts) : 0;
      const drawing = alpha ? motifDrawing(MOTIFS[index].svg) : null;
      const box = drawing ? (drawing.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number) : [];
      if (!drawing || box.length !== 4 || !(box[2] > 0 && box[3] > 0)) { section.setAttribute('data-motif-pattern', 'skipped'); continue; }
      drawing.setAttribute('width', String(box[2]));
      drawing.setAttribute('height', String(box[3]));
      drawing.setAttribute('color', `rgb(${ink.slice(0, 3).map(Math.round).join(',')})`);
      drawing.setAttribute('opacity', String(alpha));
      section.style.setProperty('--pagosya-pattern', `url("data:image/svg+xml,${encodeURIComponent(new XMLSerializer().serializeToString(drawing))}")`);
      section.setAttribute('data-motif-pattern-alpha', String(alpha));
      section.setAttribute('data-motif-pattern', 'placed');
    }
  }
```

Add to `PACK_CSS`. It is layered `!important` so a store's `background:` shorthand cannot silently erase the tile; a section is patterned only when it had no background image of its own.

```js
    '[data-motif-pattern=placed]{background-image:var(--pagosya-pattern)!important;background-repeat:repeat!important;background-size:auto!important;background-position:0 0!important}',
```

Replace the two Task 3 lines:

```js
  const MOTIF_SLOTS = '[data-motif-icon]:not([data-motif-icon="placed"]):not([data-motif-icon="removed"])';
  function placeIdentityMotifs(root) { placeButtonMotifs(root); }
```

with:

```js
  const MOTIF_SLOTS = '[data-motif-icon]:not([data-motif-icon="placed"]):not([data-motif-icon="removed"]),[data-motif-pattern]:not([data-motif-pattern="placed"]):not([data-motif-pattern="skipped"])';
  function placeIdentityMotifs(root) { placeButtonMotifs(root); placePatterns(root); }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/api && npx jest src/storefront-source/source-commerce-motif-packs.spec.ts src/storefront-source/source-commerce && node ../../packages/storefront-kit/kit/check-runtimes.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(kit): pack pattern behind store-marked sections, in their own text colour under the contrast floor (tile ≤1.35:1, text ≥4.5:1), never behind the catalog, cart or checkout" -- packages/storefront-kit/kit/commerce.js apps/api/src/storefront-source/source-commerce-motif-packs.spec.ts
```

---

### Task 5: The divider and sticker placements

**Files:**
- Modify: `packages/storefront-kit/kit/commerce.js` (after `placePatterns`; `PACK_CSS`; the `MOTIF_SLOTS` and `placeIdentityMotifs` lines)
- Test: `apps/api/src/storefront-source/source-commerce-motif-packs.spec.ts`

**Interfaces:**
- Consumes: `packMotif`, `motifSlot`, `armMotif`, `guardMotif`, `PACK_CSS`, `openShop`.
- Produces: `placeDividers(root)`, `placeStickers(root)`. States: `data-motif-divider="placed"` and `data-motif-sticker="placed"`.

- [ ] **Step 1: Write the failing tests**

Append:

```ts
describe('the divider and sticker placements', () => {
  const BODY = CATALOG + '<div class="sep" data-motif-divider></div><div class="said" data-motif-divider>Texto</div><hr data-motif-divider><span class="badge" data-motif-sticker>¡Nuevo!</span>';

  it('draws an empty marked divider as a hidden separator, and leaves one with content alone', () => {
    const shop = boot({ pack: fixturePack(), body: BODY });
    const sep = shop.$('.sep');
    expect(sep.getAttribute('data-motif-divider')).toBe('placed');
    expect(sep.getAttribute('aria-hidden')).toBe('true');
    expect(sep.getAttribute('role')).toBe('presentation');
    expect(sep.querySelector('.pagosya-motif[data-motif-slot="divider"] svg')).not.toBeNull();
    expect(shop.$('.said').textContent).toBe('Texto');
    expect(shop.$('.said .pagosya-motif')).toBeNull();
    expect(shop.$('hr').childNodes).toHaveLength(0);
  });

  it('leads a sticker\'s own text with the drawing, once, hidden from assistive tech', async () => {
    const shop = boot({ pack: fixturePack(), body: BODY });
    const badge = shop.$('.badge');
    expect(badge.firstElementChild.matches('.pagosya-motif[data-motif-slot="sticker"][aria-hidden="true"]')).toBe(true);
    expect(badge.textContent.trim()).toBe('¡Nuevo!');
    // A badge the store's scripts add later is placed too, and the first badge is not decorated twice.
    const later = shop.doc.createElement('span');
    later.className = 'later'; later.setAttribute('data-motif-sticker', ''); later.textContent = 'Oferta';
    shop.doc.body.append(later);
    await shop.tick();
    expect(later.querySelector('.pagosya-motif[data-motif-slot="sticker"]')).not.toBeNull();
    expect(badge.querySelectorAll('.pagosya-motif')).toHaveLength(1);
  });

  it('does nothing without the pack drawings, and never plays with reduced motion', () => {
    const bare = boot({ pack: fixturePack(['card']), body: BODY });
    expect(bare.$('.sep').getAttribute('data-motif-divider')).toBe('');
    expect(bare.$('.badge .pagosya-motif')).toBeNull();
    const calm = boot({ pack: fixturePack(), body: BODY, reduced: true });
    expect(calm.$$('.pagosya-motif[data-motif-play]')).toHaveLength(0);
  });

  it('takes a sticker drawing off a price it would cover (real browser)', async () => {
    const body = CATALOG + '<div style="position:relative;height:80px"><strong class="menu-item__price" style="position:absolute;top:0;left:0;width:140px;height:40px">Bs 35,90</strong><span data-motif-sticker style="position:absolute;top:0;left:0">¡Nuevo!</span></div>';
    const page = await openShop({ pack: fixturePack(), body });
    try {
      await page.waitForSelector('[data-motif-sticker="placed"]');
      await page.waitForTimeout(120);
      expect(await page.$$eval('[data-motif-sticker] .pagosya-motif', els => els.length)).toBe(0);
    } finally { await page.close(); }
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/api && npx jest src/storefront-source/source-commerce-motif-packs.spec.ts -t "divider and sticker"`
Expected: FAIL. `data-motif-divider` stays `""` and `.badge` has no motif.

- [ ] **Step 3: Implement**

Directly after `placePatterns`, add:

```js
  /* Divider and sticker placements. An empty element marked data-motif-divider becomes a decorative separator (hairlines
   * either side of the drawing); an element with content is the store's own and is left alone. A badge marked
   * data-motif-sticker ("¡Nuevo!") keeps its text; the drawing leads it and comes off a price it would cover. */
  const markedHosts = (root, attribute) => [...(root.matches?.(`[${attribute}]`) ? [root] : []), ...root.querySelectorAll(`[${attribute}]`)]
    .filter(host => host.getAttribute(attribute) !== 'placed' && !host.closest('template'));
  function placeDividers(root) {
    const index = packMotif('divider');
    if (index < 0 || !root?.querySelectorAll) return;
    for (const host of markedHosts(root, 'data-motif-divider')) {
      if (/^(?:HR|IMG|INPUT|BR)$/.test(host.tagName) || host.childElementCount || host.textContent.trim()) continue;
      const holder = motifSlot(index, 'divider');
      if (!holder) return;
      host.append(holder);
      host.setAttribute('data-motif-divider', 'placed');
      host.setAttribute('aria-hidden', 'true');
      if (!host.hasAttribute('role')) host.setAttribute('role', 'presentation');
      armMotif(holder, host);
      guardMotif(holder, document.body);
    }
  }
  function placeStickers(root) {
    const index = packMotif('sticker');
    if (index < 0 || !root?.querySelectorAll) return;
    for (const host of markedHosts(root, 'data-motif-sticker')) {
      const holder = motifSlot(index, 'sticker');
      if (!holder) return;
      host.prepend(holder);
      host.setAttribute('data-motif-sticker', 'placed');
      armMotif(holder, host);
      guardMotif(holder, document.body);
    }
  }
```

Add to `PACK_CSS`:

```js
    '[data-motif-divider=placed]{display:flex;align-items:center;gap:16px;margin-block:clamp(16px,4vw,40px);color:var(--store-accent,var(--brand-accent,var(--accent,currentColor)))}',
    '[data-motif-divider=placed]::before,[data-motif-divider=placed]::after{content:"";flex:1;height:1px;background:currentColor;opacity:.35}',
    '.pagosya-motif[data-motif-slot=divider]{width:64px;height:24px}',
    '[data-motif-sticker=placed]{display:inline-flex;align-items:center;gap:.35em}',
    '.pagosya-motif[data-motif-slot=sticker]{width:1.7em;height:1.7em}',
```

Replace the `MOTIF_SLOTS` and `placeIdentityMotifs` lines from Task 4 with:

```js
  const MOTIF_SLOTS = '[data-motif-icon]:not([data-motif-icon="placed"]):not([data-motif-icon="removed"]),[data-motif-pattern]:not([data-motif-pattern="placed"]):not([data-motif-pattern="skipped"]),[data-motif-divider]:not([data-motif-divider="placed"]),[data-motif-sticker]:not([data-motif-sticker="placed"])';
  function placeIdentityMotifs(root) { placeButtonMotifs(root); placePatterns(root); placeDividers(root); placeStickers(root); }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/api && npx jest src/storefront-source/source-commerce-motif-packs.spec.ts src/storefront-source/source-commerce src/storefront-source/source-motif-paint.spec.ts && node ../../packages/storefront-kit/kit/check-runtimes.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(kit): pack divider (store-marked empty separators) and sticker (leads a badge's own text, off any price) placements" -- packages/storefront-kit/kit/commerce.js apps/api/src/storefront-source/source-commerce-motif-packs.spec.ts
```

---

### Task 6: The drawing tool, library tests, contact sheets, and packs batch 1 (paws, coffee, bread, fruit, cups, chili)

**Drawing approach, for every batch:** each topic gets two glyphs, drawn by hand on a 24-unit grid inside 1–23: a primary glyph (the topic) and a secondary glyph (its companion). They are simple geometric line art (`circle`, `ellipse`, `rect`, `path`, `polygon`) in the root's `currentColor` stroke with round caps. Where a shape needs body, it gets a translucent `soft` fill (`fill="currentColor" fill-opacity=".18"`). There are no colours, ids, text, gradients or references. A part that a behaviour animates is labelled `data-part="steam"` or `data-part="light"`, and the pack's `motion` lists the placements that use it. The tool composes each pack into five files with one stroke weight per placement, and writes them exactly as the sanitiser serialises them. Every file stays far under 6 KB.

**Files:**
- Create: `packages/storefront-kit/tools/motif-packs.mjs`
- Create: `packages/storefront-kit/tools/motif-pack-drawings.mjs`
- Create: `apps/api/src/storefront-source/source-motif-pack-library.spec.ts`
- Create: `apps/api/src/storefront-source/source-motif-pack-sheet.spec.ts`
- Create (by the tool): `packages/storefront-kit/kit/motif-packs/{paws,coffee,bread,fruit,cups,chili}/{pack.json,button.svg,pattern.svg,divider.svg,sticker.svg,empty.svg}`

**Interfaces:**
- Consumes: `validateMotifPackDir`, `listMotifPacks`, `MOTIF_PACK_PLACEMENTS` (Task 1).
- Produces: `PACKS` in `motif-pack-drawings.mjs`, an array of `{ id, name, es: string[], en: string[], primary: string[], secondary: string[], motion?: Partial<Record<placement, behavior>> }`. Also `node packages/storefront-kit/tools/motif-packs.mjs [--check]`, and `LIBRARY` in the library spec, which grows each batch.

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/storefront-source/source-motif-pack-library.spec.ts`:

```ts
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { kitPath } from '@pagosya/storefront-kit';
import { listMotifPacks, MOTIF_PACK_PLACEMENTS, validateMotifPackDir } from './source-motif-packs';

const TOOL = join(__dirname, '../../../../packages/storefront-kit/tools/motif-packs.mjs');
/** The drawn library, in drawing order; each batch task adds its packs here first. */
const LIBRARY = ['paws', 'coffee', 'bread', 'fruit', 'cups', 'chili'];

describe('the drawn motif pack library', () => {
  it('ships exactly the drawn packs', () => {
    expect(readdirSync(kitPath('motif-packs')).filter(name => !name.startsWith('.')).sort()).toEqual([...LIBRARY].sort());
  });

  it('passes validation pack by pack: sanitiser byte for byte, 6 KB, currentColor, placements, labelled parts', () => {
    for (const id of LIBRARY) expect({ id, problems: validateMotifPackDir(kitPath('motif-packs', id), id).problems }).toEqual({ id, problems: [] });
  });

  it('fills all eight placements with five drawings per pack', () => {
    for (const pack of listMotifPacks()) {
      expect(pack.motifs.map(motif => motif.placement).sort()).toEqual([...MOTIF_PACK_PLACEMENTS].sort());
      expect(new Set(pack.motifs.map(motif => motif.file)).size).toBe(5);
    }
  });

  it('is exactly what the drawing tool draws from the hand-drawn glyphs', () => {
    expect(() => execFileSync(process.execPath, [TOOL, '--check'], { stdio: 'pipe' })).not.toThrow();
  });

  it('gives every pack its own topic words: no word names two packs', () => {
    const owner = new Map<string, string>();
    for (const pack of listMotifPacks()) for (const word of [...pack.topics.es, ...pack.topics.en]) {
      expect({ word, pack: owner.get(word) ?? pack.id }).toEqual({ word, pack: pack.id });
      owner.set(word, pack.id);
    }
  });
});
```

Create `apps/api/src/storefront-source/source-motif-pack-sheet.spec.ts`:

```ts
jest.setTimeout(90_000);
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { kitPath } from '@pagosya/storefront-kit';
import { listMotifPacks } from './source-motif-packs';

/** Every pack drawing at the size the kit renders it, on a light and a dark paper: the drawings must stay inside their
 * viewBox, and the sheets in tmp/identity-shots are looked at before a batch is committed. */
const SHOTS = join(__dirname, '../../../../tmp/identity-shots');
const SIZE: Record<string, [number, number]> = { 'button.svg': [24, 24], 'pattern.svg': [96, 96], 'divider.svg': [64, 24], 'sticker.svg': [48, 48], 'empty.svg': [64, 64] };

it('draws every pack inside its viewBox, on light and dark paper (contact sheets in tmp/identity-shots)', async () => {
  mkdirSync(SHOTS, { recursive: true });
  const rows = listMotifPacks().map(pack => `<tr><th>${pack.id}</th>${Object.keys(SIZE).map(file => `<td><span data-file="${pack.id}/${file}" style="display:inline-block;width:${SIZE[file][0]}px;height:${SIZE[file][1]}px">${readFileSync(kitPath('motif-packs', pack.id, file), 'utf8')}</span></td>`).join('')}</tr>`).join('');
  const browser = await chromium.launch({ headless: true });
  try {
    for (const [name, paper, ink] of [['light', '#fbf6ee', '#8a3b12'], ['dark', '#161412', '#f3c77a']]) {
      const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
      await page.setContent(`<!doctype html><html><head><style>body{margin:16px;background:${paper};color:${ink};font:12px sans-serif}[data-file] svg{display:block;width:100%;height:100%}td{padding:8px 12px}</style></head><body><table>${rows}</table></body></html>`);
      const escaped = await page.$$eval('[data-file] > svg', svgs => svgs.flatMap(svg => {
        const box = (svg as SVGSVGElement).getBBox(), view = (svg as SVGSVGElement).viewBox.baseVal;
        const inside = box.width > 0 && box.height > 0 && box.x >= view.x - 1 && box.y >= view.y - 1 && box.x + box.width <= view.x + view.width + 1 && box.y + box.height <= view.y + view.height + 1;
        return inside ? [] : [(svg.parentElement as HTMLElement).dataset.file];
      }));
      expect(escaped).toEqual([]);
      await page.screenshot({ path: join(SHOTS, `motif-packs-${name}.png`), fullPage: true });
      await page.close();
    }
  } finally { await browser.close(); }
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/api && npx jest src/storefront-source/source-motif-pack-library.spec.ts`
Expected: FAIL. `readdirSync` fails with ENOENT on `kit/motif-packs`, and the tool is missing.

- [ ] **Step 3: Implement the tool and batch 1**

Create `packages/storefront-kit/tools/motif-packs.mjs`:

```js
#!/usr/bin/env node
/**
 * Draws the identity motif packs (T2a) into packages/storefront-kit/kit/motif-packs/<id>/ from the hand-drawn glyphs in
 * motif-pack-drawings.mjs. Every pack has two glyphs on a 24-unit grid; this tool composes them into five files with one
 * stroke weight per placement, and writes pack.json:
 *   button.svg   24×24, the primary glyph (button icons, card corners, the cart header)
 *   pattern.svg  96×96 tile, both glyphs and two dots (sections marked data-motif-pattern)
 *   divider.svg  64×24, the primary glyph between two small secondary glyphs
 *   sticker.svg  64×64, the primary glyph inside a burst (badges)
 *   empty.svg    64×64, the primary glyph large, the secondary small, a soft ground shadow (empty cart, product page)
 * Output is written exactly as the API's motif sanitiser serialises it, so the kit can inline it byte for byte.
 * Usage: node packages/storefront-kit/tools/motif-packs.mjs            write every pack
 *        node packages/storefront-kit/tools/motif-packs.mjs --check    exit 1 when disk differs from the drawings
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PACKS } from './motif-pack-drawings.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '../kit/motif-packs');
const NS = 'http://www.w3.org/2000/svg';
const n = value => String(Math.round(value * 100) / 100);
const svg = (viewBox, strokeWidth, body) => `<svg xmlns="${NS}" viewBox="${viewBox}" fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
/** A glyph moved and scaled; its strokes stay `stroke` units wide in the file's own grid. */
const place = (glyph, x, y, scale, stroke, mirror = false) =>
  `<g transform="translate(${n(x)} ${n(y)}) scale(${mirror ? `-${n(scale)} ${n(scale)}` : n(scale)})" stroke-width="${n(stroke / scale)}">${glyph.join('')}</g>`;
function burst(cx, cy, outer, inner, points) {
  const coords = [];
  for (let i = 0; i < points * 2; i++) {
    const radius = i % 2 ? inner : outer, angle = (Math.PI * i) / points - Math.PI / 2;
    coords.push(`${n(cx + radius * Math.cos(angle))},${n(cy + radius * Math.sin(angle))}`);
  }
  return `<polygon points="${coords.join(' ')}" fill="currentColor" fill-opacity=".12"/>`;
}
const DOTS = '<circle cx="78" cy="22" r="1.5" fill="currentColor" stroke="none"/><circle cx="22" cy="78" r="1.5" fill="currentColor" stroke="none"/>';
const drawings = ({ primary, secondary }) => ({
  'button.svg': svg('0 0 24 24', 2, primary.join('')),
  'pattern.svg': svg('0 0 96 96', 1.5, place(primary, 10, 10, 1, 1.5) + place(secondary, 60, 58, 1, 1.5) + DOTS),
  'divider.svg': svg('0 0 64 24', 2, place(secondary, 2, 5, .58, 2) + place(primary, 20, 0, 1, 2) + place(secondary, 62, 5, .58, 2, true)),
  'sticker.svg': svg('0 0 64 64', 2, burst(32, 32, 30, 26, 14) + place(primary, 14, 14, 1.5, 2)),
  'empty.svg': svg('0 0 64 64', 2, '<ellipse cx="26" cy="57" rx="17" ry="3" fill="currentColor" fill-opacity=".12" stroke="none"/>' + place(primary, 6, 14, 1.65, 2) + place(secondary, 44, 2, .75, 2)),
});
const FILE_OF = { button: 'button.svg', pattern: 'pattern.svg', divider: 'divider.svg', sticker: 'sticker.svg', empty: 'empty.svg', product: 'empty.svg', card: 'button.svg', cart: 'button.svg' };
const MOTION = { button: 'bounce', pattern: 'float', divider: 'grow', sticker: 'sway', empty: 'float', product: 'grow', card: 'bounce', cart: 'bounce' };
const manifest = pack => ({ id: pack.id, version: 1, name: pack.name, topics: { es: pack.es, en: pack.en },
  motifs: Object.keys(FILE_OF).map(placement => ({ placement, file: FILE_OF[placement], behavior: pack.motion?.[placement] ?? MOTION[placement] })) });

const check = process.argv.includes('--check');
const problems = [];
const ids = new Set(PACKS.map(pack => pack.id));
if (ids.size !== PACKS.length) problems.push('two packs share an id');
for (const pack of PACKS) {
  const dir = join(root, pack.id);
  const output = { ...drawings(pack), 'pack.json': `${JSON.stringify(manifest(pack), null, 2)}\n` };
  if (!check) {
    mkdirSync(dir, { recursive: true });
    for (const [name, content] of Object.entries(output)) writeFileSync(join(dir, name), content);
    continue;
  }
  for (const [name, content] of Object.entries(output)) if (!existsSync(join(dir, name)) || readFileSync(join(dir, name), 'utf8') !== content) problems.push(`${pack.id}/${name} differs from what the tool draws`);
  if (existsSync(dir)) for (const name of readdirSync(dir).filter(name => !name.startsWith('.'))) if (!(name in output)) problems.push(`${pack.id}/${name} is not drawn by the tool`);
}
if (existsSync(root)) for (const name of readdirSync(root).filter(name => !name.startsWith('.'))) if (!ids.has(name)) problems.push(`${name} is on disk but not in motif-pack-drawings.mjs`);
if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
console.log(check ? `${PACKS.length} packs match their drawings` : `drew ${PACKS.length} packs into ${root}`);
```

Create `packages/storefront-kit/tools/motif-pack-drawings.mjs`:

```js
/** Hand-drawn glyphs for the identity motif packs (T2a), drawn once for pagosYa on a 24-unit grid (inside 1–23): line art
 * in the root's currentColor stroke with round caps, a translucent currentColor fill for a little body, and no colours,
 * ids, text, gradients or references. A part a behaviour animates is labelled data-part="steam" or data-part="light", and
 * `motion` names the placements that use it (the file must contain the part). tools/motif-packs.mjs composes them. */
const soft = 'fill="currentColor" fill-opacity=".18"';
const GLOW_ALL = { button: 'glow', card: 'glow', cart: 'glow', sticker: 'glow', empty: 'glow', product: 'glow', divider: 'glow' };
const STEAM_ALL = { button: 'steam', card: 'steam', cart: 'steam', sticker: 'steam', empty: 'steam', product: 'steam', divider: 'steam' };

export const PACKS = [
  {
    id: 'paws', name: 'Huellas y huesos',
    es: ['perro', 'perros', 'gato', 'gatos', 'mascota', 'mascotas', 'huella', 'hueso', 'veterinaria', 'croquetas'],
    en: ['dog', 'cat', 'pet', 'pets', 'paw', 'bone', 'vet', 'treats'],
    primary: [
      `<circle cx="5.5" cy="10.5" r="2" ${soft}/>`, `<circle cx="9.5" cy="6" r="2" ${soft}/>`, `<circle cx="14.5" cy="6" r="2" ${soft}/>`, `<circle cx="18.5" cy="10.5" r="2" ${soft}/>`,
      `<path d="M12 12c-3 0-5.5 3.2-5.5 5.6 0 1.7 1.3 2.9 2.9 2.9 1 0 1.7-.5 2.6-.5s1.6.5 2.6.5c1.6 0 2.9-1.2 2.9-2.9 0-2.4-2.5-5.6-5.5-5.6z" ${soft}/>`,
    ],
    secondary: [`<path d="M16.2 4.3a2.3 2.3 0 0 1 3.9-.8 2.3 2.3 0 0 1 .4 3.9 2.3 2.3 0 0 1-2.7 2.9l-8.1 8.1a2.3 2.3 0 0 1-2.9 2.7 2.3 2.3 0 0 1-3.9-.4 2.3 2.3 0 0 1 .8-3.9 2.3 2.3 0 0 1 2.4-3l8.1-8.1a2.3 2.3 0 0 1 2-1.4z" ${soft}/>`],
  },
  {
    id: 'coffee', name: 'Café y vapor',
    es: ['café', 'cafetería', 'grano', 'granos', 'espresso', 'tostado', 'barista'],
    en: ['coffee', 'coffee shop', 'bean', 'roastery', 'barista'],
    primary: [`<g transform="rotate(-35 12 12)"><ellipse cx="12" cy="12" rx="6.5" ry="9" ${soft}/><path d="M12 3.5c-2.6 2.8-2.6 5.7 0 8.5s2.6 5.7 0 8.5"/></g>`],
    secondary: ['<g data-part="steam"><path d="M7 21c-2-2.5 2-4.5 0-7s2-4.5 0-7"/><path d="M12 21c-2-2.5 2-4.5 0-7s2-4.5 0-7"/><path d="M17 21c-2-2.5 2-4.5 0-7s2-4.5 0-7"/></g>'],
    motion: { divider: 'steam', empty: 'steam', product: 'steam' },
  },
  {
    id: 'bread', name: 'Pan y trigo',
    es: ['pan', 'panadería', 'trigo', 'masa madre', 'horno', 'bollería', 'baguette'],
    en: ['bread', 'bakery', 'wheat', 'sourdough', 'loaf', 'oven'],
    primary: [
      '<path d="M12 22V7"/>',
      `<path d="M12 11.5c-2.6 0-4.2-1.6-4.2-4.2 2.6 0 4.2 1.6 4.2 4.2z" ${soft}/>`, `<path d="M12 11.5c2.6 0 4.2-1.6 4.2-4.2-2.6 0-4.2 1.6-4.2 4.2z" ${soft}/>`,
      `<path d="M12 16.5c-2.6 0-4.2-1.6-4.2-4.2 2.6 0 4.2 1.6 4.2 4.2z" ${soft}/>`, `<path d="M12 16.5c2.6 0 4.2-1.6 4.2-4.2-2.6 0-4.2 1.6-4.2 4.2z" ${soft}/>`,
      `<path d="M12 7c-1.2-1.3-1.2-3.2 0-5 1.2 1.8 1.2 3.7 0 5z" ${soft}/>`,
    ],
    secondary: [`<path d="M3 13.5C3 9.4 7 6.5 12 6.5s9 2.9 9 7c0 1.2-.8 2-2 2v3.5H5v-3.5c-1.2 0-2-.8-2-2z" ${soft}/>`, '<path d="M8.5 9.5l1.5 2M12 9l1.5 2M15.5 9.5l1.5 2"/>'],
  },
  {
    id: 'fruit', name: 'Frutas',
    es: ['fruta', 'frutas', 'manzana', 'cereza', 'frutería', 'jugo', 'jugos'],
    en: ['fruit', 'apple', 'cherry', 'juice', 'orchard'],
    primary: [
      `<path d="M12 7.5c-1.6-1.1-3.7-1.4-5.3.1-2.6 2.4-2 7.4.2 10.4 1.4 1.9 3.1 2.9 5.1 2 2 .9 3.7-.1 5.1-2 2.2-3 2.8-8 .2-10.4-1.6-1.5-3.7-1.2-5.3-.1z" ${soft}/>`,
      '<path d="M12 7.5c0-2 .6-3.6 2-4.6"/>', '<path d="M13 5.2c1.4-1.5 3.4-1.6 4.6-.6-1.1 1.5-3.2 1.7-4.6.6z"/>',
    ],
    secondary: [`<circle cx="7.5" cy="17" r="3.5" ${soft}/>`, `<circle cx="16.5" cy="18" r="3.5" ${soft}/>`, '<path d="M7.5 13.5C9 9 11 5.5 15 3.5M16.5 14.5c-.4-4-.9-7.6-1.5-11"/>'],
  },
  {
    id: 'cups', name: 'Tazas y té',
    es: ['té', 'infusión', 'infusiones', 'taza', 'tazas', 'tetera', 'mate'],
    en: ['tea', 'cup', 'mug', 'infusion', 'teapot'],
    primary: [
      `<path d="M5 10h11v6.5a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4z" ${soft}/>`, '<path d="M16 11.5h1.5a2.5 2.5 0 0 1 0 5H16"/>',
      '<g data-part="steam"><path d="M8.5 7.5c-1.2-1.1 1.2-2.2 0-3.5"/><path d="M12.5 7.5c-1.2-1.1 1.2-2.2 0-3.5"/></g>',
    ],
    secondary: ['<rect x="10" y="2" width="4" height="3" rx=".6"/>', '<path d="M12 5v4"/>', `<path d="M8 9h8v9.5a2.5 2.5 0 0 1-2.5 2.5h-3A2.5 2.5 0 0 1 8 18.5z" ${soft}/>`],
    motion: STEAM_ALL,
  },
  {
    id: 'chili', name: 'Picante',
    es: ['ají', 'picante', 'chile', 'salsa', 'salsas', 'llajua', 'tacos'],
    en: ['chili', 'spicy', 'hot sauce', 'salsa'],
    primary: [
      `<path d="M16.5 6.5c-1.2 0-2.2.8-2.6 2-1.3 4.5-4.6 8.8-9.4 11.1 4.1 1.8 10.9.2 13.4-6 .8-2 .6-4.4-.2-6-.3-.7-.7-1.1-1.2-1.1z" ${soft}/>`,
      '<path d="M16.5 6.5c0-1.6.8-2.9 2.3-3.5"/>', '<path d="M14.8 7.2c.9.8 2.4.9 3.4.2"/>',
    ],
    secondary: [`<path data-part="light" d="M12 21.5c3.5 0 6-2.3 6-5.5 0-3.5-3-5.5-3.5-9.5-2 1.5-3 3.5-3 5.5-1-1-1.5-2-1.5-3.5-2 1.5-4 4-4 7.5 0 3.2 2.5 5.5 6 5.5z" ${soft}/>`],
    motion: { divider: 'glow', empty: 'glow', product: 'glow' },
  },
];
```

Draw them:

Run: `node packages/storefront-kit/tools/motif-packs.mjs`
Expected: `drew 6 packs into …/kit/motif-packs`.

- [ ] **Step 4: Run the tests to verify they pass, and look at the sheets**

Run: `cd apps/api && npx jest src/storefront-source/source-motif-pack-library.spec.ts src/storefront-source/source-motif-pack-sheet.spec.ts src/storefront-source/source-motif-packs.spec.ts`
Expected: PASS. Open `tmp/identity-shots/motif-packs-light.png` and `motif-packs-dark.png`. Every glyph must read as its topic at button size (24px), and the pattern tile must feel sparse. If a glyph reads poorly, redraw it in `motif-pack-drawings.mjs` with the same primitives, run the tool again, and rerun these three suites before committing.

- [ ] **Step 5: Commit**

```bash
git add packages/storefront-kit/tools/motif-packs.mjs packages/storefront-kit/tools/motif-pack-drawings.mjs packages/storefront-kit/kit/motif-packs apps/api/src/storefront-source/source-motif-pack-library.spec.ts apps/api/src/storefront-source/source-motif-pack-sheet.spec.ts
git commit -m "feat(kit): motif pack drawing tool and the first six drawn packs (paws, coffee, bread, fruit, cups, chili), validated byte for byte against the sanitiser" -- packages/storefront-kit/tools/motif-packs.mjs packages/storefront-kit/tools/motif-pack-drawings.mjs packages/storefront-kit/kit/motif-packs apps/api/src/storefront-source/source-motif-pack-library.spec.ts apps/api/src/storefront-source/source-motif-pack-sheet.spec.ts
```

---

### Task 7: Packs batch 2 (cake, icecream, gifts, balloons, hearts, sparkles)

**Files:**
- Modify: `packages/storefront-kit/tools/motif-pack-drawings.mjs` (append to `PACKS`)
- Modify: `apps/api/src/storefront-source/source-motif-pack-library.spec.ts` (`LIBRARY`)
- Create (by the tool): `packages/storefront-kit/kit/motif-packs/{cake,icecream,gifts,balloons,hearts,sparkles}/…`

**Interfaces:**
- Consumes: the tool and specs from Task 6.

- [ ] **Step 1: Write the failing test**

In the library spec, change `LIBRARY` to:

```ts
const LIBRARY = ['paws', 'coffee', 'bread', 'fruit', 'cups', 'chili', 'cake', 'icecream', 'gifts', 'balloons', 'hearts', 'sparkles'];
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/api && npx jest src/storefront-source/source-motif-pack-library.spec.ts`
Expected: FAIL in "ships exactly the drawn packs": `cake` and the rest of the batch are missing.

- [ ] **Step 3: Draw the batch**

Append inside `PACKS`, after the `chili` entry:

```js
  {
    id: 'cake', name: 'Pasteles y velas',
    es: ['torta', 'tortas', 'pastel', 'pastelería', 'cupcake', 'repostería', 'cumpleaños'],
    en: ['cake', 'cupcake', 'pastry', 'birthday', 'patisserie'],
    primary: [
      `<path d="M6 13h12l-1.6 8H7.6z" ${soft}/>`, '<path d="M6 13a3 3 0 0 1 1-5.7A5 5 0 0 1 17 7.3a3 3 0 0 1 1 5.7"/>',
      '<path d="M10 13l.5 8M14 13l-.5 8"/>', `<circle cx="12" cy="3.5" r="1.5" ${soft}/>`,
    ],
    secondary: [`<rect x="9.5" y="10" width="5" height="11" rx="1" ${soft}/>`, '<path d="M12 10V8"/>', `<path data-part="light" d="M12 2.5c1.6 1.5 1.9 3 1 4.3-.5.6-1.5.6-2 0-.9-1.3-.6-2.8 1-4.3z" ${soft}/>`],
    motion: { divider: 'glow', empty: 'glow', product: 'glow' },
  },
  {
    id: 'icecream', name: 'Helados',
    es: ['helado', 'helados', 'heladería', 'paleta', 'cono', 'gelato'],
    en: ['ice cream', 'gelato', 'popsicle', 'cone'],
    primary: [`<path d="M7.5 11.5l4.5 10 4.5-10" ${soft}/>`, `<path d="M6.5 11.5a5.5 5.5 0 1 1 11 0z" ${soft}/>`, '<path d="M9.8 14.5l4.2-2M10.9 17.6l2.6-1.3"/>'],
    secondary: [`<path d="M8 8a4 4 0 0 1 8 0v8H8z" ${soft}/>`, '<path d="M12 16v5.5"/>', '<path d="M10.5 8.5v4"/>'],
  },
  {
    id: 'gifts', name: 'Regalos',
    es: ['regalo', 'regalos', 'detalle', 'sorpresa', 'caja', 'envoltura'],
    en: ['gift', 'gifts', 'present', 'surprise', 'wrap'],
    primary: [
      `<rect x="4" y="10" width="16" height="10.5" rx="1" ${soft}/>`, '<path d="M3 7h18v3H3z"/>', '<path d="M12 7v13.5"/>',
      '<path d="M12 7c-2-3-5.5-3.6-5.5-1.1S9.5 7 12 7c2.5 0 5.5 1.4 5.5-1.1S14 4 12 7z"/>',
    ],
    secondary: [`<path d="M12 11c-3-4-8-4-8-1s5 3 8 1c3 2 8 2 8-1s-5-3-8 1z" ${soft}/>`, '<path d="M11 12l-2.5 7M13 12l2.5 7"/>', '<circle cx="12" cy="11" r="1.3"/>'],
  },
  {
    id: 'balloons', name: 'Fiestas y globos',
    es: ['fiesta', 'fiestas', 'globo', 'globos', 'decoración de fiestas', 'evento', 'eventos'],
    en: ['party', 'balloon', 'balloons', 'celebration', 'event'],
    primary: [
      `<path d="M12 2.5c3.6 0 6 2.8 6 6.3 0 4-3.2 7.3-6 7.8-2.8-.5-6-3.8-6-7.8 0-3.5 2.4-6.3 6-6.3z" ${soft}/>`,
      '<path d="M11 16.8l1 1.4 1-1.4"/>', '<path d="M12 18.2c-1.2 1.4 1.2 2.1 0 3.6"/>', '<path d="M9.2 6.4a3 3 0 0 1 2-1.4"/>',
    ],
    secondary: [`<path d="M5.5 20.5L12 4l6.5 16.5z" ${soft}/>`, '<path d="M8.3 13.4h7.4M6.8 17.2h10.4"/>', '<circle cx="12" cy="3" r="1.2"/>'],
  },
  {
    id: 'hearts', name: 'Corazones',
    es: ['amor', 'corazón', 'san valentín', 'aniversario', 'romántico', 'pareja'],
    en: ['love', 'heart', 'valentine', 'anniversary', 'romance'],
    primary: [`<path d="M12 20.5s-7.8-4.7-7.8-10.3A4.4 4.4 0 0 1 12 7.4a4.4 4.4 0 0 1 7.8 2.8c0 5.6-7.8 10.3-7.8 10.3z" ${soft}/>`],
    secondary: [`<path d="M8 12.5s-4-2.4-4-5.3a2.3 2.3 0 0 1 4-1.5 2.3 2.3 0 0 1 4 1.5c0 2.9-4 5.3-4 5.3z" ${soft}/>`, '<path d="M16 20.5s-4-2.4-4-5.3a2.3 2.3 0 0 1 4-1.5 2.3 2.3 0 0 1 4 1.5c0 2.9-4 5.3-4 5.3z"/>'],
  },
  {
    id: 'sparkles', name: 'Brillos',
    es: ['brillo', 'limpieza', 'limpio', 'estrellitas', 'uñas', 'manicure', 'glitter'],
    en: ['sparkle', 'shine', 'cleaning', 'nails', 'glitter'],
    primary: [
      `<path d="M11 3c.6 4.3 2.7 6.4 7 7-4.3.6-6.4 2.7-7 7-.6-4.3-2.7-6.4-7-7 4.3-.6 6.4-2.7 7-7z" ${soft}/>`,
      '<path data-part="light" d="M19 14.5c.3 1.8 1.1 2.6 2.9 2.9-1.8.3-2.6 1.1-2.9 2.9-.3-1.8-1.1-2.6-2.9-2.9 1.8-.3 2.6-1.1 2.9-2.9z"/>',
    ],
    secondary: [`<path d="M12 3.5l2.4 5 5.4.8-3.9 3.8.9 5.4L12 16l-4.8 2.5.9-5.4-3.9-3.8 5.4-.8z" ${soft}/>`],
    motion: GLOW_ALL,
  },
```

Run: `node packages/storefront-kit/tools/motif-packs.mjs`
Expected: `drew 12 packs into …`.

- [ ] **Step 4: Run the tests to verify they pass, and look at the sheets**

Run: `cd apps/api && npx jest src/storefront-source/source-motif-pack-library.spec.ts src/storefront-source/source-motif-pack-sheet.spec.ts`
Expected: PASS. Open both sheets in `tmp/identity-shots/`. If a new glyph reads poorly, redraw it, run the tool again and rerun.

- [ ] **Step 5: Commit**

```bash
git add packages/storefront-kit/kit/motif-packs
git commit -m "feat(kit): motif packs batch 2 (cake, icecream, gifts, balloons, hearts, sparkles)" -- packages/storefront-kit/tools/motif-pack-drawings.mjs packages/storefront-kit/kit/motif-packs apps/api/src/storefront-source/source-motif-pack-library.spec.ts
```

---

### Task 8: Packs batch 3 (hangers, shoes, scissors, drops, gems, yarn)

**Files:**
- Modify: `packages/storefront-kit/tools/motif-pack-drawings.mjs`, `apps/api/src/storefront-source/source-motif-pack-library.spec.ts`
- Create (by the tool): `packages/storefront-kit/kit/motif-packs/{hangers,shoes,scissors,drops,gems,yarn}/…`

**Interfaces:**
- Consumes: the tool and specs from Task 6.

- [ ] **Step 1: Write the failing test**

```ts
const LIBRARY = ['paws', 'coffee', 'bread', 'fruit', 'cups', 'chili', 'cake', 'icecream', 'gifts', 'balloons', 'hearts', 'sparkles', 'hangers', 'shoes', 'scissors', 'drops', 'gems', 'yarn'];
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/api && npx jest src/storefront-source/source-motif-pack-library.spec.ts`
Expected: FAIL in "ships exactly the drawn packs" (`hangers` … `yarn` missing).

- [ ] **Step 3: Draw the batch**

Append inside `PACKS`, after `sparkles`:

```js
  {
    id: 'hangers', name: 'Ropa y costura',
    es: ['ropa', 'moda', 'prenda', 'prendas', 'costura', 'sastrería', 'boutique'],
    en: ['clothing', 'fashion', 'apparel', 'sewing', 'tailor', 'boutique'],
    primary: ['<path d="M12 8V7a2 2 0 1 1 2-2"/>', `<path d="M12 8l-8.6 7.2A1 1 0 0 0 4 17h16a1 1 0 0 0 .6-1.8z" ${soft}/>`],
    secondary: ['<path d="M19.5 3.5L6 17"/>', '<path d="M18 5l1.5 1.5"/>', '<path d="M19.5 3.5c2 2-1 5.5-4.5 7.5S7 16.5 5.5 19.5c-.8 1.6.8 2.4 2.5 1.5"/>'],
  },
  {
    id: 'shoes', name: 'Calzado',
    es: ['zapato', 'zapatos', 'zapatillas', 'calzado', 'tenis', 'sandalias'],
    en: ['shoe', 'shoes', 'sneakers', 'footwear', 'sandals'],
    primary: [`<path d="M2.5 16.5V10l4-.8 3 3h2.3l3-2c2 2.1 4.1 3.1 6.7 3.6v2.7z" ${soft}/>`, '<path d="M2.5 16.5v2h19v-2"/>', '<path d="M9.3 12.5l1-1M11.8 13.8l1-1"/>'],
    secondary: [`<path d="M8.5 3c2.5 0 4 3 4 6.5S11 15 8.5 15 5 12.5 5 9s1-6 3.5-6z" ${soft}/>`, '<path d="M16 11c2 0 3 2 3 4.8S18 21 16 21s-2.8-2.4-2.8-5.2S14.2 11 16 11z"/>'],
  },
  {
    id: 'scissors', name: 'Tijeras y peine',
    es: ['peluquería', 'barbería', 'corte', 'tijeras', 'peinado', 'salón'],
    en: ['hair salon', 'barber', 'haircut', 'scissors', 'hairstyle'],
    primary: ['<circle cx="6" cy="18" r="3"/>', '<circle cx="6" cy="6" r="3"/>', '<path d="M8.4 7.8L20 18M8.4 16.2L20 6"/>'],
    secondary: [`<rect x="3" y="7" width="18" height="4.5" rx="1" ${soft}/>`, '<path d="M5.5 11.5v6M8.5 11.5v6M11.5 11.5v6M14.5 11.5v6M17.5 11.5v6"/>'],
  },
  {
    id: 'drops', name: 'Gotas y frascos',
    es: ['cosmética', 'crema', 'cremas', 'sérum', 'cuidado de la piel', 'aceite', 'agua'],
    en: ['cosmetics', 'skincare', 'serum', 'cream', 'oil', 'water'],
    primary: [`<path d="M12 2.5c3.6 4.6 6.2 8 6.2 11.3a6.2 6.2 0 0 1-12.4 0c0-3.3 2.6-6.7 6.2-11.3z" ${soft}/>`, '<path d="M9 14.5a3 3 0 0 0 3 3"/>'],
    secondary: [`<rect x="7" y="10" width="10" height="11.5" rx="2" ${soft}/>`, '<path d="M9 10V7.5h6V10"/>', '<path d="M10.5 7.5V4.5a1.5 1.5 0 0 1 3 0v3"/>', '<path d="M9.5 14.5h5"/>'],
  },
  {
    id: 'gems', name: 'Gemas y anillos',
    es: ['joya', 'joyas', 'joyería', 'anillo', 'anillos', 'diamante', 'plata'],
    en: ['jewelry', 'jewel', 'ring', 'rings', 'diamond', 'silver'],
    primary: [`<path d="M6 4h12l4 5-10 12L2 9z" ${soft}/>`, '<path d="M2 9h20M9 4l3 5 3-5M12 21L9 9M12 21l3-12"/>'],
    secondary: ['<circle cx="12" cy="15" r="6"/>', `<path d="M9.5 9.6L8 6.5l2-3h4l2 3-1.5 3.1" ${soft}/>`],
  },
  {
    id: 'yarn', name: 'Lana y tejido',
    es: ['lana', 'tejido', 'tejidos', 'crochet', 'ovillo', 'artesanía textil', 'punto'],
    en: ['yarn', 'knitting', 'crochet', 'wool', 'handmade textiles'],
    primary: [
      `<circle cx="11" cy="12" r="8" ${soft}/>`,
      '<path d="M4.5 8.5c4 0 8 3 9.5 10.4M7 5c3 2 5.5 5.5 5.5 12.4M3.6 12.7c3 0 6.5 2.4 7.5 7M12.3 4.2c2.5 2.2 4.5 5.4 4.8 10"/>',
      '<path d="M17.5 17.5c1.5 1.2 3.2 1.6 4.5 1"/>',
    ],
    secondary: ['<path d="M4 21L18.5 4.5M8 21.5L21 7"/>', `<circle cx="18.5" cy="4.5" r="1.2" ${soft}/>`, `<circle cx="21" cy="7" r="1.2" ${soft}/>`],
  },
```

Run: `node packages/storefront-kit/tools/motif-packs.mjs`
Expected: `drew 18 packs into …`.

- [ ] **Step 4: Run the tests to verify they pass, and look at the sheets**

Run: `cd apps/api && npx jest src/storefront-source/source-motif-pack-library.spec.ts src/storefront-source/source-motif-pack-sheet.spec.ts`
Expected: PASS. Look at both sheets, redraw any glyph that reads poorly, and rerun.

- [ ] **Step 5: Commit**

```bash
git add packages/storefront-kit/kit/motif-packs
git commit -m "feat(kit): motif packs batch 3 (hangers, shoes, scissors, drops, gems, yarn)" -- packages/storefront-kit/tools/motif-pack-drawings.mjs packages/storefront-kit/kit/motif-packs apps/api/src/storefront-source/source-motif-pack-library.spec.ts
```

---

### Task 9: Packs batch 4 (leaves, flowers, lamps, brushes, books, sun)

**Files:**
- Modify: `packages/storefront-kit/tools/motif-pack-drawings.mjs`, `apps/api/src/storefront-source/source-motif-pack-library.spec.ts`
- Create (by the tool): `packages/storefront-kit/kit/motif-packs/{leaves,flowers,lamps,brushes,books,sun}/…`

**Interfaces:**
- Consumes: the tool and specs from Task 6.

- [ ] **Step 1: Write the failing test**

```ts
const LIBRARY = ['paws', 'coffee', 'bread', 'fruit', 'cups', 'chili', 'cake', 'icecream', 'gifts', 'balloons', 'hearts', 'sparkles', 'hangers', 'shoes', 'scissors', 'drops', 'gems', 'yarn', 'leaves', 'flowers', 'lamps', 'brushes', 'books', 'sun'];
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/api && npx jest src/storefront-source/source-motif-pack-library.spec.ts`
Expected: FAIL in "ships exactly the drawn packs" (`leaves` … `sun` missing).

- [ ] **Step 3: Draw the batch**

Append inside `PACKS`, after `yarn`:

```js
  {
    id: 'leaves', name: 'Hojas y brotes',
    es: ['planta', 'plantas', 'hoja', 'vivero', 'jardín', 'huerto', 'natural'],
    en: ['plant', 'plants', 'leaf', 'nursery', 'garden', 'green'],
    primary: [`<path d="M4.5 19.5C4.5 10.5 10 4 20 4c0 10-6.5 15.5-15.5 15.5z" ${soft}/>`, '<path d="M4.5 19.5L14 10"/>'],
    secondary: ['<path d="M12 21v-8"/>', `<path d="M12 13c0-3.6-2.6-6.2-6.6-6.2 0 3.6 2.6 6.2 6.6 6.2z" ${soft}/>`, `<path d="M12 11c0-3.1 2.3-5.6 6.1-5.6 0 3.1-2.3 5.6-6.1 5.6z" ${soft}/>`, '<path d="M8 21h8"/>'],
    motion: { empty: 'sway', product: 'sway', card: 'sway' },
  },
  {
    id: 'flowers', name: 'Flores',
    es: ['flor', 'flores', 'florería', 'ramo', 'ramos', 'tulipán', 'rosas'],
    en: ['flower', 'flowers', 'florist', 'bouquet', 'tulip', 'roses'],
    primary: [
      `<circle cx="12" cy="7" r="3" ${soft}/>`, `<circle cx="16.8" cy="10.5" r="3" ${soft}/>`, `<circle cx="15" cy="16" r="3" ${soft}/>`,
      `<circle cx="9" cy="16" r="3" ${soft}/>`, `<circle cx="7.2" cy="10.5" r="3" ${soft}/>`, '<circle cx="12" cy="12" r="2"/>',
    ],
    secondary: ['<path d="M12 21.5V12"/>', `<path d="M7 4.5l2.5 2L12 3.5l2.5 3L17 4.5V9a5 5 0 0 1-10 0z" ${soft}/>`, '<path d="M12 18c-2-2.5-4.5-3.1-6-2.6 1 2.6 3.5 3.6 6 2.6z"/>'],
    motion: { empty: 'sway', product: 'sway' },
  },
  {
    id: 'lamps', name: 'Lámparas y luz',
    es: ['lámpara', 'lámparas', 'iluminación', 'luz', 'foco', 'velas decorativas'],
    en: ['lamp', 'lamps', 'lighting', 'light', 'bulb'],
    primary: [
      `<path d="M12 4a6 6 0 0 0-3.5 10.9c.6.5 1 1.3 1 2.1v1.5h5V17c0-.8.4-1.6 1-2.1A6 6 0 0 0 12 4z" ${soft}/>`, '<path d="M9.5 21h5"/>',
      '<g data-part="light"><path d="M2.5 10h1.5M20 10h1.5M4.6 3.1l1.1 1.1M19.4 3.1l-1.1 1.1M12 .8v1.4"/></g>',
    ],
    secondary: [`<path d="M7.5 3h9l3 8h-15z" ${soft}/>`, '<path d="M12 11v8M8 21h8"/>', '<path data-part="light" d="M6.5 14l-1.5 2.5M17.5 14l1.5 2.5"/>'],
    motion: GLOW_ALL,
  },
  {
    id: 'brushes', name: 'Pinceles y pintura',
    es: ['arte', 'pintura', 'pincel', 'pinceles', 'acuarela', 'ilustración', 'taller de arte'],
    en: ['art', 'painting', 'paintbrush', 'watercolor', 'illustration'],
    primary: [`<path d="M18.5 2.5l3 3-8.8 8.8-3-3z" ${soft}/>`, `<path d="M9.7 11.3c-2.5 0-4.5 2-4.5 4.5 0 2-1 3.2-2.7 3.7 3 1.6 8.2 1.1 9.3-2.4.5-1.5 0-3-.6-4.3z" ${soft}/>`],
    secondary: [
      `<path d="M12 3a9 9 0 0 0 0 18c1.2 0 2-.8 2-1.8 0-.5-.2-.9-.5-1.3-.3-.3-.5-.8-.5-1.2 0-1 .8-1.7 1.8-1.7H17a4 4 0 0 0 4-4c0-4.4-4-8-9-8z" ${soft}/>`,
      '<circle cx="7.5" cy="11" r="1.2"/>', '<circle cx="10" cy="7" r="1.2"/>', '<circle cx="14.5" cy="7" r="1.2"/>', '<circle cx="17" cy="10.5" r="1.2"/>',
    ],
  },
  {
    id: 'books', name: 'Libros y lápices',
    es: ['libro', 'libros', 'librería', 'papelería', 'cuaderno', 'lectura', 'lápiz'],
    en: ['book', 'books', 'bookstore', 'stationery', 'notebook', 'reading'],
    primary: [`<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v15H6.5A2.5 2.5 0 0 0 4 19.5z" ${soft}/>`, '<path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/>', '<path d="M8.5 6.5h7"/>'],
    secondary: [`<path d="M16.5 3.5l4 4L8 20H4v-4z" ${soft}/>`, '<path d="M13.5 6.5l4 4"/>'],
  },
  {
    id: 'sun', name: 'Sol y nubes',
    es: ['sol', 'verano', 'solar', 'protector solar', 'clima', 'soleado'],
    en: ['sun', 'summer', 'sunny', 'sunscreen', 'weather'],
    primary: [`<circle cx="12" cy="12" r="4.5" ${soft}/>`, '<g data-part="light"><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/></g>'],
    secondary: [`<path d="M7 18.5a4 4 0 0 1-.6-8A6 6 0 0 1 18 10a4.3 4.3 0 0 1-.5 8.5z" ${soft}/>`],
    motion: GLOW_ALL,
  },
```

Run: `node packages/storefront-kit/tools/motif-packs.mjs`
Expected: `drew 24 packs into …`.

- [ ] **Step 4: Run the tests to verify they pass, and look at the sheets**

Run: `cd apps/api && npx jest src/storefront-source/source-motif-pack-library.spec.ts src/storefront-source/source-motif-pack-sheet.spec.ts`
Expected: PASS. Look at both sheets, redraw any glyph that reads poorly, and rerun.

- [ ] **Step 5: Commit**

```bash
git add packages/storefront-kit/kit/motif-packs
git commit -m "feat(kit): motif packs batch 4 (leaves, flowers, lamps, brushes, books, sun)" -- packages/storefront-kit/tools/motif-pack-drawings.mjs packages/storefront-kit/kit/motif-packs apps/api/src/storefront-source/source-motif-pack-library.spec.ts
```

---

### Task 10: Packs batch 5 (circuits, games, music, tools, waves, stars) and library coverage

**Files:**
- Modify: `packages/storefront-kit/tools/motif-pack-drawings.mjs`, `apps/api/src/storefront-source/source-motif-pack-library.spec.ts`
- Create (by the tool): `packages/storefront-kit/kit/motif-packs/{circuits,games,music,tools,waves,stars}/…`

**Interfaces:**
- Consumes: the tool and specs from Task 6.

- [ ] **Step 1: Write the failing tests**

```ts
const LIBRARY = ['paws', 'coffee', 'bread', 'fruit', 'cups', 'chili', 'cake', 'icecream', 'gifts', 'balloons', 'hearts', 'sparkles', 'hangers', 'shoes', 'scissors', 'drops', 'gems', 'yarn', 'leaves', 'flowers', 'lamps', 'brushes', 'books', 'sun', 'circuits', 'games', 'music', 'tools', 'waves', 'stars'];
```

Add inside the `describe`:

```ts
  it('covers the owner\'s topics: at least 30 packs, every topic the spec names drawn', () => {
    expect(LIBRARY.length).toBeGreaterThanOrEqual(30);
    const named = ['paws', 'coffee', 'leaves', 'flowers', 'bread', 'fruit', 'drops', 'sparkles', 'lamps', 'shoes', 'hangers', 'scissors', 'brushes', 'gems', 'games', 'circuits', 'books', 'music', 'balloons', 'waves', 'sun', 'stars', 'hearts', 'cups', 'chili'];
    for (const id of named) expect(LIBRARY).toContain(id);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/api && npx jest src/storefront-source/source-motif-pack-library.spec.ts`
Expected: FAIL in "ships exactly the drawn packs" (`circuits` … `stars` missing).

- [ ] **Step 3: Draw the batch**

Append inside `PACKS`, after `sun`:

```js
  {
    id: 'circuits', name: 'Circuitos',
    es: ['electrónica', 'tecnología', 'chip', 'computadora', 'cargador', 'cables', 'gadgets'],
    en: ['electronics', 'tech', 'technology', 'chip', 'computer', 'charger'],
    primary: [`<rect x="6" y="6" width="12" height="12" rx="1.5" ${soft}/>`, '<rect data-part="light" x="9.5" y="9.5" width="5" height="5"/>', '<path d="M9 2.5V6M15 2.5V6M9 18v3.5M15 18v3.5M2.5 9H6M2.5 15H6M18 9h3.5M18 15h3.5"/>'],
    secondary: ['<path d="M9 2.5v4.5M15 2.5v4.5"/>', `<path d="M6 7h12v4a6 6 0 0 1-12 0z" ${soft}/>`, '<path d="M12 17v4.5"/>'],
    motion: GLOW_ALL,
  },
  {
    id: 'games', name: 'Juegos',
    es: ['videojuegos', 'juego', 'juegos', 'consola', 'gamer', 'dados', 'juegos de mesa'],
    en: ['video games', 'game', 'games', 'console', 'gaming', 'dice', 'board games'],
    primary: [
      `<path d="M6.5 7h11a4.5 4.5 0 0 1 4.3 5.8l-1.1 4a2.8 2.8 0 0 1-4.8 1.1L14 16h-4l-1.9 1.9a2.8 2.8 0 0 1-4.8-1.1l-1.1-4A4.5 4.5 0 0 1 6.5 7z" ${soft}/>`,
      '<path d="M7.5 10v3.5M5.8 11.8h3.4"/>', '<circle cx="15.5" cy="10.8" r=".9"/>', '<circle cx="17.6" cy="12.9" r=".9"/>',
    ],
    secondary: [`<rect x="4" y="4" width="16" height="16" rx="3" ${soft}/>`, '<circle cx="8.5" cy="8.5" r="1"/>', '<circle cx="12" cy="12" r="1"/>', '<circle cx="15.5" cy="15.5" r="1"/>'],
  },
  {
    id: 'music', name: 'Música',
    es: ['música', 'instrumento', 'instrumentos', 'canción', 'discos', 'vinilo', 'guitarra'],
    en: ['music', 'instrument', 'song', 'records', 'vinyl', 'guitar'],
    primary: ['<path d="M9 18V5.5l11-2.5v13"/>', `<circle cx="6" cy="18" r="3" ${soft}/>`, `<circle cx="17" cy="16" r="3" ${soft}/>`],
    secondary: ['<path d="M12 18V3c1.8 1.5 3.8 2.2 6 2.2"/>', `<circle cx="9" cy="18" r="3" ${soft}/>`],
    motion: { empty: 'sway', product: 'sway' },
  },
  {
    id: 'tools', name: 'Herramientas',
    es: ['ferretería', 'herramienta', 'herramientas', 'llave', 'tuerca', 'reparación', 'taller mecánico'],
    en: ['hardware store', 'tool', 'tools', 'wrench', 'repair', 'hardware'],
    primary: [`<path d="M15 3a5 5 0 0 0-4.6 6.9l-6.9 6.9a2.1 2.1 0 0 0 3 3l6.9-6.9A5 5 0 0 0 20.5 9l-3 3-3-.5-.5-3 3-3A5 5 0 0 0 15 3z" ${soft}/>`],
    secondary: [`<path d="M12 3l7.8 4.5v9L12 21l-7.8-4.5v-9z" ${soft}/>`, '<circle cx="12" cy="12" r="3"/>'],
    motion: { card: 'spin' },
  },
  {
    id: 'waves', name: 'Olas y conchas',
    es: ['mar', 'playa', 'ola', 'olas', 'surf', 'concha', 'marino'],
    en: ['sea', 'beach', 'wave', 'waves', 'surf', 'shell', 'ocean'],
    primary: [
      '<path d="M2 8c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2"/>', '<path d="M2 13c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2"/>',
      '<path d="M2 18c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2"/>',
    ],
    secondary: [`<path d="M12 20.5L4 10a8 8 0 0 1 16 0z" ${soft}/>`, '<path d="M12 20.5L8.5 4.8M12 20.5V4M12 20.5l3.5-15.7"/>'],
    motion: { button: 'float', card: 'float' },
  },
  {
    id: 'stars', name: 'Estrellas y luna',
    es: ['estrella', 'estrellas', 'luna', 'noche', 'astrología', 'sueño', 'mágico'],
    en: ['star', 'stars', 'moon', 'night', 'astrology', 'dream', 'magic'],
    primary: [`<path data-part="light" d="M12 2.5l2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 16.9l-5.6 3 1.1-6.3-4.6-4.4 6.3-.9z" ${soft}/>`],
    secondary: [`<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" ${soft}/>`, '<path d="M17 3v3M15.5 4.5h3"/>'],
    motion: GLOW_ALL,
  },
```

Run: `node packages/storefront-kit/tools/motif-packs.mjs`
Expected: `drew 30 packs into …`.

- [ ] **Step 4: Run the tests to verify they pass, and look at the sheets**

Run: `cd apps/api && npx jest src/storefront-source/source-motif-pack-library.spec.ts src/storefront-source/source-motif-pack-sheet.spec.ts src/storefront-source/source-motif-packs.spec.ts`
Expected: PASS. Look at both sheets for the whole library: 30 rows, each readable on light and dark.

- [ ] **Step 5: Commit**

```bash
git add packages/storefront-kit/kit/motif-packs
git commit -m "feat(kit): motif packs batch 5 (circuits, games, music, tools, waves, stars): 30 drawn packs covering every topic the spec names" -- packages/storefront-kit/tools/motif-pack-drawings.mjs packages/storefront-kit/kit/motif-packs apps/api/src/storefront-source/source-motif-pack-library.spec.ts
```

---

### Task 11: Four new button forms (sticker, ticket, bubbly, brutal)

**Files:**
- Modify: `apps/api/src/storefront-source/source-dna.ts` (`SOURCE_DNA_ENUMS.buttons.form`, a `NOT_SEEDED` map above `FIELDS`, `FIELDS`, `defaultDna`)
- Modify: `apps/api/src/storefront-source/source-dna.spec.ts`
- Modify: `packages/storefront-kit/kit/commerce.js` (`DNA_VALUES.button`; after `dnaForm('split', …)`; after `const dnaButtonRules = …`; the `...dnaButtonRules(KIT_BUTTONS, KIT_STEPPERS),` and `...dnaButtonRules(PAGE_BUTTONS, PAGE_STEPPERS),` lines)
- Create: `apps/api/src/storefront-source/source-commerce-identity-dna.spec.ts`

**Interfaces:**
- Consumes: `fixturePack` (Task 1), `contrastRatio` (existing).
- Produces: runtime values `button: 'sticker' | 'ticket' | 'bubbly' | 'brutal'`, and in `commerce.js` the `TICKET_MASK` and `dnaIdentityButtonRules(buttons)` helpers. In `source-dna.ts`: `NOT_SEEDED: Record<string, readonly string[]>` (Task 12 extends it), and `FIELDS[i].seeded`.
- Produces (spec helpers used by Task 12): `open(options)`, `contrastOf(page, selector)`, `BASE`, `PALETTES`, `ITEM`.

- [ ] **Step 1: Write the failing tests**

Add to `source-dna.spec.ts`. Import `createHash` from `node:crypto` at the top, then append:

```ts
describe('identity libraries (T2b) DNA values', () => {
  it('accepts the four new button forms', () => {
    for (const form of ['sticker', 'ticket', 'bubbly', 'brutal']) {
      const raw = validDna() as any;
      raw.buttons.form = form;
      expect(normalizeDna(raw, 'store-1')).toEqual({ dna: raw, repairs: [] });
      expect(dnaRuntimeConfig(raw).button).toBe(form);
    }
  });

  it('never seeds a T2b value, so stores seeded before them keep exactly the DNA they had', () => {
    const all = Array.from({ length: 50 }, (_, i) => defaultDna(`store-${i}`));
    expect(createHash('sha256').update(JSON.stringify(all)).digest('hex')).toBe('6b24050e210099c82f1bd48afee26df3daaabc4f1c08a62998b6a02f5d9fa84b');
    expect(defaultDna('cafe-luna')).toEqual({ version: 1, type: { display: 'bebas-neue', text: 'rubik', case: 'upper', tracking: 'tight' }, shape: { radius: 'none', border: 'hairline', frame: 'inset' }, buttons: { form: 'stamp', hover: 'invert', press: 'pop' }, motion: { personality: 'calm' }, layout: { grammar: 'magazine', density: 'dense' }, surfaces: { cart: 'drawer', added: 'bubble', product: 'dense', review: 'notebook', card: 'zoom' }, motifs: [], signature: '' });
    const forms = new Set(Array.from({ length: 500 }, (_, i) => defaultDna(`seed-${i}`).buttons.form));
    for (const form of ['sticker', 'ticket', 'bubbly', 'brutal']) expect(forms.has(form as any)).toBe(false);
  });
});
```

Create `apps/api/src/storefront-source/source-commerce-identity-dna.spec.ts`:

```ts
jest.setTimeout(180_000);
import { readFileSync } from 'node:fs';
import { chromium, type Browser, type Page } from 'playwright';
import { kitPath } from '@pagosya/storefront-kit';
import { contrastRatio } from './source-scorecard';
import { fixturePack } from './fixtures/motif-pack';

/** Identity libraries T2b: the new button forms and frames in a real browser (jsdom drops @layer sheets). */
const commerce = readFileSync(kitPath('commerce.js'), 'utf8');
const ITEM = { id: 'taza', name: 'Taza', amount: 12000, currency: 'BOB', stock: 5, imageUrls: [] as string[] };
const BASE = { version: 1, hover: 'lift', press: 'squash', radius: 'round', border: 'hairline', frame: 'rounded', cart: 'drawer', added: 'toast', review: 'split', card: 'still' };
const CATALOG = '<header><button type="button" data-cart-open>Pedido <span data-cart-count>0</span></button></header><section data-pagosya-catalog></section><section data-pagosya-cart></section><p data-pagosya-status></p>';
const PRODUCT = '<main data-pagosya-product-page></main><section data-pagosya-cart></section><p data-pagosya-status></p>';
const FORMS = ['sticker', 'ticket', 'bubbly', 'brutal'];
const PALETTES: Record<string, string> = {
  light: ':root{--store-background:#fffaf0;--store-foreground:#1d1b18;--store-accent:#b4441f;--store-accent-foreground:#ffffff}body{background:#fffaf0;color:#1d1b18}',
  dark: ':root{--store-background:#141311;--store-foreground:#f3eee6;--store-accent:#f3c77a;--store-accent-foreground:#1a1308}body{background:#141311;color:#f3eee6}',
  // A pair that does not read (white on mid grey): the runtime guard must lift the text.
  failing: ':root{--store-background:#ffffff;--store-foreground:#222222;--store-accent:#8f8f8f;--store-accent-foreground:#ffffff}body{background:#fff;color:#222}',
};
let browser: Browser;
beforeAll(async () => { browser = await chromium.launch({ headless: true }); });
afterAll(async () => { await browser?.close(); });

async function open(options: { dna?: Record<string, unknown>; css?: string; body?: string; query?: string; cart?: unknown[]; items?: unknown[]; kit?: string; pack?: unknown; width?: number }): Promise<Page> {
  const page = await browser.newPage({ viewport: { width: options.width ?? 1280, height: 800 } });
  const config = { slug: 'marca', apiBaseUrl: 'https://api.test', checkoutOrigin: 'https://pay.test', demo: true, data: { storeName: 'Marca', items: options.items ?? [ITEM] },
    ...(options.dna ? { dna: options.dna } : {}), ...(options.pack ? { motifPack: options.pack } : {}) };
  await page.setContent(`<!doctype html><html lang="es"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${options.css ?? ''}</style></head><body>${options.body ?? CATALOG}</body></html>`);
  await page.addScriptTag({ content: `window.PAGOSYA_PREVIEW=true;window.PAGOSYA_PREVIEW_QUERY=${JSON.stringify(options.query ?? '')};${options.cart ? `window.PAGOSYA_PREVIEW_CART=${JSON.stringify(options.cart)};` : ''}window.PAGOSYA_CONFIG=${JSON.stringify(config)};` });
  await page.addScriptTag({ content: options.kit ?? commerce });
  return page;
}
/** Contrast as the scorecard measures it: text composited over the ancestors' background colours (white below). */
async function contrastOf(page: Page, selector: string) {
  const [text, back] = await page.evaluate(sel => {
    const rgba = (value: string) => { const n = (value.match(/[\d.]+/g) || []).map(Number); return [n[0], n[1], n[2], n.length > 3 ? n[3] : 1]; };
    const over = (top: number[], base: number[]) => [0, 1, 2].map(i => top[i] * top[3] + base[i] * (1 - top[3]));
    const el = document.querySelector(sel)!;
    const layers: number[][] = [];
    for (let node: Element | null = el; node; node = node.parentElement) { const c = rgba(getComputedStyle(node).backgroundColor); if (c[3] > 0) layers.push(c); if (c[3] >= 0.99) break; }
    const bg = layers.reverse().reduce((base, layer) => over(layer, base), [255, 255, 255]);
    return [over(rgba(getComputedStyle(el).color), bg), bg];
  }, selector);
  return contrastRatio(text, back);
}
const height = (page: Page, selector: string) => page.$eval(selector, el => el.getBoundingClientRect().height);
async function tabTo(page: Page, selector: string) {
  for (let i = 0; i < 12; i++) { await page.keyboard.press('Tab'); if (await page.evaluate(sel => document.activeElement?.matches(sel) ?? false, selector)) return; }
  throw new Error(`Tab never reached ${selector}`);
}

describe.each(FORMS)('the %s button form', form => {
  it.each(Object.keys(PALETTES))('keeps pay, buy and add buttons at 4.5:1 and full size (%s palette)', async palette => {
    const shop = await open({ dna: { ...BASE, button: form }, css: PALETTES[palette], cart: [{ id: 'taza', quantity: 1 }] });
    try {
      await shop.waitForSelector('.menu-add');
      await shop.waitForTimeout(300);
      expect(await shop.evaluate(() => document.documentElement.dataset.dnaButton)).toBe(form);
      expect(await contrastOf(shop, '.menu-add')).toBeGreaterThanOrEqual(4.5);
      expect(await height(shop, '.menu-add')).toBeGreaterThanOrEqual(44);
      await shop.click('[data-cart-open]');
      await shop.waitForSelector('dialog.cart-drawer[open] .checkout-button');
      await shop.waitForTimeout(300);
      expect(await contrastOf(shop, 'dialog.cart-drawer .checkout-button')).toBeGreaterThanOrEqual(4.5);
      expect(await height(shop, 'dialog.cart-drawer .checkout-button')).toBeGreaterThanOrEqual(48);
    } finally { await shop.close(); }
    const product = await open({ dna: { ...BASE, button: form }, css: PALETTES[palette], body: PRODUCT, query: '?id=taza' });
    try {
      await product.waitForSelector('[data-pagosya-product][data-style] .product-detail__buy');
      await product.waitForTimeout(300);
      expect(await contrastOf(product, '[data-pagosya-product] .product-detail__buy')).toBeGreaterThanOrEqual(4.5);
      expect(await height(product, '[data-pagosya-product] .product-detail__buy')).toBeGreaterThanOrEqual(48);
    } finally { await product.close(); }
  });
});

describe('form details', () => {
  it('drops the ticket notches while a button has keyboard focus, so the ring is never clipped', async () => {
    const shop = await open({ dna: { ...BASE, button: 'ticket' }, css: PALETTES.light });
    try {
      await shop.waitForSelector('.menu-add');
      expect(await shop.$eval('.menu-add', el => getComputedStyle(el).maskImage)).toContain('radial-gradient');
      await tabTo(shop, '.menu-add');
      expect(await shop.$eval('.menu-add', el => [getComputedStyle(el).maskImage, getComputedStyle(el).outlineStyle])).toEqual(['none', 'solid']);
    } finally { await shop.close(); }
  });

  it('gives sticker an offset ink shadow, brutal a thick ink border, and bubbly a larger pack icon', async () => {
    const facts: Record<string, any> = {};
    for (const form of ['pill', 'sticker', 'brutal', 'bubbly']) {
      const page = await open({ dna: { ...BASE, button: form }, css: PALETTES.light, body: PRODUCT, query: '?id=taza', pack: fixturePack() });
      try {
        await page.waitForSelector('[data-pagosya-product] .product-detail__buy [data-motif-icon="placed"] svg');
        facts[form] = await page.$eval('[data-pagosya-product] .product-detail__buy', buy => {
          const style = getComputedStyle(buy), icon = buy.querySelector('.pagosya-motif')!.getBoundingClientRect();
          return { shadow: style.boxShadow, border: style.borderTopWidth, icon: icon.width / parseFloat(style.fontSize) };
        });
      } finally { await page.close(); }
    }
    expect(facts.sticker.shadow).toMatch(/4px 4px 0px/);
    expect(facts.brutal.border).toBe('3px');
    expect(facts.bubbly.icon).toBeGreaterThan(facts.pill.icon + .1);
  });

  it('an older kit that does not know the new forms keeps its plain buttons, still sells, and holds the pay button at 4.5:1', async () => {
    const older = commerce.replace(/button: \[[^\]]*\]/, "button: ['pill', 'block', 'underline', 'tag', 'stamp', 'outline', 'ghost', 'split']");
    expect(older).not.toBe(commerce);
    for (const palette of ['light', 'failing']) {
      const shop = await open({ kit: older, dna: { ...BASE, button: 'bubbly' }, css: PALETTES[palette], cart: [{ id: 'taza', quantity: 1 }] });
      try {
        await shop.waitForSelector('.menu-add');
        expect(await shop.evaluate(() => [document.documentElement.hasAttribute('data-dna-button'), document.documentElement.dataset.dnaCart])).toEqual([false, 'drawer']);
        await shop.click('[data-cart-open]');
        await shop.waitForSelector('dialog.cart-drawer[open] .checkout-button');
        await shop.waitForTimeout(300);
        expect(await contrastOf(shop, 'dialog.cart-drawer .checkout-button')).toBeGreaterThanOrEqual(4.5);
      } finally { await shop.close(); }
    }
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/api && npx jest src/storefront-source/source-dna.spec.ts src/storefront-source/source-commerce-identity-dna.spec.ts`
Expected: FAIL. `normalizeDna` repairs `sticker`, and `dataset.dnaButton` is undefined. The seed pin and the older-kit test already pass; they guard the change.

- [ ] **Step 3: Implement**

In `source-dna.ts`, change the form list to:

```ts
    form: ['pill', 'block', 'underline', 'tag', 'stamp', 'outline', 'ghost', 'split', 'sticker', 'ticket', 'bubbly', 'brutal'],
```

Replace the `FIELDS` declaration with:

```ts
/** Identity libraries (T2b) appended these values. The seeded default never picks them: withSeededDna seeds every stored
 * store without a DNA on each public view, so a new value in the draw would silently restyle stores published long ago. */
const NOT_SEEDED: Record<string, readonly string[]> = { 'buttons.form': ['sticker', 'ticket', 'bubbly', 'brutal'] };
const FIELDS = Object.entries(SOURCE_DNA_ENUMS).flatMap(([group, keys]) => Object.entries(keys).map(([key, values]) => (
  { group, key, name: RUNTIME_NAMES[`${group}.${key}`] ?? key, values: values as readonly string[],
    seeded: (values as readonly string[]).filter(value => !(NOT_SEEDED[`${group}.${key}`] ?? []).includes(value)) })));
```

In `defaultDna`, replace `for (const { group, key, values } of FIELDS) (dna[group] ??= {})[key] = values[Math.floor(random() * values.length)];` with:

```ts
  for (const { group, key, seeded } of FIELDS) (dna[group] ??= {})[key] = seeded[Math.floor(random() * seeded.length)];
```

In `commerce.js`, change `DNA_VALUES.button` to:

```js
    button: ['pill', 'block', 'underline', 'tag', 'stamp', 'outline', 'ghost', 'split', 'sticker', 'ticket', 'bubbly', 'brutal'], hover: ['lift', 'fill', 'underline-grow', 'tilt', 'shine', 'invert'], press: ['squash', 'sink', 'pop', 'none'],
```

(That is the whole line: `hover` and `press` are unchanged.)

Directly after the `dnaForm('split', …),` entry in `DNA_CSS`, add:

```js
    /* Identity libraries (T2b). Sticker: an offset hard shadow in the ink. Ticket: notched ends (a mask, dropped on focus so
     * the ring shows). Bubbly: soft and round with a shaded lip; the pack icon shows a little larger. Brutal: thick ink
     * border on flat accent. All four fill with the store's accent pair, so a pay button reads the way pill does. */
    dnaForm('sticker', '--kit-btn-invert-bg:var(--kit-on-accent);--kit-btn-invert-fg:var(--kit-accent);--kit-btn-radius:min(var(--kit-radius),12px);--kit-btn-border:2px solid var(--kit-ink);--kit-btn-bg:var(--kit-accent);--kit-btn-fg:var(--kit-on-accent);--kit-btn-case:var(--kit-type-case,none);--kit-btn-caps:var(--kit-type-caps,normal);--kit-btn-tracking:var(--kit-type-tracking,0);--kit-btn-pad:.7em 1.5em;--kit-btn-decor:none;--kit-btn-clip:none;--kit-btn-shadow:4px 4px 0 var(--kit-ink)'),
    dnaForm('ticket', '--kit-btn-invert-bg:var(--kit-on-accent);--kit-btn-invert-fg:var(--kit-accent);--kit-btn-radius:4px;--kit-btn-border:0 solid transparent;--kit-btn-bg:var(--kit-accent);--kit-btn-fg:var(--kit-on-accent);--kit-btn-case:uppercase;--kit-btn-tracking:.08em;--kit-btn-pad:.75em 1.8em;--kit-btn-decor:none;--kit-btn-clip:none;--kit-btn-shadow:0 0 #0000'),
    dnaForm('bubbly', '--kit-btn-invert-bg:var(--kit-on-accent);--kit-btn-invert-fg:var(--kit-accent);--kit-btn-radius:999px;--kit-btn-border:0 solid transparent;--kit-btn-bg:var(--kit-accent);--kit-btn-fg:var(--kit-on-accent);--kit-btn-case:none;--kit-btn-tracking:.01em;--kit-btn-pad:.8em 1.7em;--kit-btn-decor:none;--kit-btn-clip:none;--kit-btn-shadow:inset 0 -3px 0 color-mix(in srgb,#000 18%,transparent),0 6px 14px -8px color-mix(in srgb,var(--kit-accent) 70%,transparent)'),
    dnaForm('brutal', '--kit-btn-invert-bg:var(--kit-ink);--kit-btn-invert-fg:var(--kit-paper);--kit-btn-radius:0px;--kit-btn-border:3px solid var(--kit-ink);--kit-btn-bg:var(--kit-accent);--kit-btn-fg:var(--kit-on-accent);--kit-btn-case:uppercase;--kit-btn-tracking:.04em;--kit-btn-pad:.75em 1.4em;--kit-btn-decor:none;--kit-btn-clip:none;--kit-btn-shadow:0 0 #0000'),
```

Directly after the whole `const dnaButtonRules = (buttons, steppers) => [ … ];` statement, add:

```js
  /* Per-form details of the T2b forms that a token cannot carry: press, the ticket notches (unmasked on focus), weight,
   * and the bubbly form's larger pack icon (the icon's base size sits in the lower pagosya-commerce layer). */
  const TICKET_MASK = 'radial-gradient(circle at 0 50%,#0000 .5em,#000 calc(.5em + .5px)) 0 0/51% 100% no-repeat,radial-gradient(circle at 100% 50%,#0000 .5em,#000 calc(.5em + .5px)) 100% 0/51% 100% no-repeat';
  const dnaIdentityButtonRules = buttons => [
    `:root[data-dna-button=sticker] ${buttons}:active:not(:disabled){transform:translate(3px,3px);box-shadow:1px 1px 0 var(--kit-ink)}`,
    `:root[data-dna-button=ticket] ${buttons}{-webkit-mask:${TICKET_MASK};mask:${TICKET_MASK}}`,
    `:root[data-dna-button=ticket] ${buttons}:focus-visible:not(:disabled){-webkit-mask:none;mask:none}`,
    `:root[data-dna-button=bubbly] ${buttons}{font-weight:700}`,
    `:root[data-dna-button=bubbly] ${buttons}:active:not(:disabled){transform:translateY(2px);box-shadow:inset 0 -1px 0 color-mix(in srgb,#000 18%,transparent)}`,
    `:root[data-dna-button=bubbly] ${buttons} .pagosya-motif[data-motif-slot=button]{width:1.35em;height:1.35em}`,
    `:root[data-dna-button=brutal] ${buttons}{font-weight:800}`,
    `:root[data-dna-button=brutal] ${buttons}:active:not(:disabled){transform:translate(2px,2px)}`,
  ];
```

Replace `    ...dnaButtonRules(KIT_BUTTONS, KIT_STEPPERS),` with `    ...dnaButtonRules(KIT_BUTTONS, KIT_STEPPERS), ...dnaIdentityButtonRules(KIT_BUTTONS),`. Replace `    ...dnaButtonRules(PAGE_BUTTONS, PAGE_STEPPERS),` with `    ...dnaButtonRules(PAGE_BUTTONS, PAGE_STEPPERS), ...dnaIdentityButtonRules(PAGE_BUTTONS),`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/api && npx jest src/storefront-source/source-dna.spec.ts src/storefront-source/source-commerce-identity-dna.spec.ts src/storefront-source/source-commerce src/storefront-source/source-design-planner.spec.ts && node ../../packages/storefront-kit/kit/check-runtimes.mjs`
Expected: PASS. `source-commerce-dna.spec.ts` confirms that the kit allows exactly the API's runtime enums, and that every value, the new ones included, becomes `data-dna-*`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/storefront-source/source-commerce-identity-dna.spec.ts
git commit -m "feat(kit,api): sticker, ticket, bubbly and brutal button forms; pay, buy and add buttons at 4.5:1 and full size in each; never seeded for existing stores; an older kit falls back to plain buttons" -- apps/api/src/storefront-source/source-dna.ts apps/api/src/storefront-source/source-dna.spec.ts packages/storefront-kit/kit/commerce.js apps/api/src/storefront-source/source-commerce-identity-dna.spec.ts
```

---

### Task 12: Three new frames (blob, stamp, tape) and the scorecard capture

**Files:**
- Modify: `apps/api/src/storefront-source/source-dna.ts` (`shape.frame`, `NOT_SEEDED`)
- Modify: `apps/api/src/storefront-source/source-dna.spec.ts`
- Modify: `packages/storefront-kit/kit/commerce.js` (`DNA_VALUES.frame`; after the `polaroid` frame entry; after the `--kit-photo-round` line; after the `.menu-item :is(.menu-item__image,.menu-item__image-alt)` frame rule; new consts above `const DNA_CSS = [`)
- Test: `apps/api/src/storefront-source/source-commerce-identity-dna.spec.ts`, `apps/api/src/storefront-source/source-scorecard-capture.spec.ts`

**Interfaces:**
- Consumes: `open`, `PALETTES`, `BASE`, `ITEM` (Task 11), and `NOT_SEEDED` (Task 11).
- Produces: runtime values `frame: 'blob' | 'stamp' | 'tape'`, and in `commerce.js` the consts `FRAMED_PHOTOS`, `STAMP_MASK`, `TAPE`, `TAPE_CORNERS`.

- [ ] **Step 1: Write the failing tests**

In `source-dna.spec.ts`, inside `describe('identity libraries (T2b) DNA values')`, add:

```ts
  it('accepts the three new frames, and never seeds them either', () => {
    for (const frame of ['blob', 'stamp', 'tape']) {
      const raw = validDna() as any;
      raw.shape.frame = frame;
      expect(normalizeDna(raw, 'store-1')).toEqual({ dna: raw, repairs: [] });
      expect(dnaRuntimeConfig(raw).frame).toBe(frame);
    }
    const frames = new Set(Array.from({ length: 500 }, (_, i) => defaultDna(`seed-${i}`).shape.frame));
    for (const frame of ['blob', 'stamp', 'tape']) expect(frames.has(frame as any)).toBe(false);
  });
```

Append to `source-commerce-identity-dna.spec.ts`:

```ts
describe('identity frames', () => {
  const PHOTO = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 50"><rect width="40" height="50" fill="#c96"/><circle cx="20" cy="22" r="10" fill="#734"/></svg>').toString('base64');

  it('frames card and cart photos as a blob, a perforated stamp and taped corners', async () => {
    const facts: Record<string, any> = {};
    for (const frame of ['blob', 'stamp', 'tape']) {
      const page = await open({ dna: { ...BASE, button: 'pill', frame }, css: PALETTES.light, items: [{ ...ITEM, imageUrls: [PHOTO] }], cart: [{ id: 'taza', quantity: 1 }] });
      try {
        await page.waitForSelector('.menu-item .menu-item__image');
        facts[frame] = await page.$eval('.menu-item .menu-item__image', el => { const s = getComputedStyle(el); return { radius: s.borderTopLeftRadius, mask: s.maskImage, image: s.backgroundImage, pad: s.paddingTop }; });
        await page.click('[data-cart-open]');
        await page.waitForSelector('dialog.cart-drawer[open] .order-item__photo');
        facts[`${frame}-cart`] = await page.$eval('dialog.cart-drawer .order-item__photo', el => { const s = getComputedStyle(el); return { mask: s.maskImage, image: s.backgroundImage }; });
      } finally { await page.close(); }
    }
    expect(facts.blob.radius).toMatch(/%/);
    expect(facts.stamp.mask).toContain('radial-gradient');
    expect(facts.stamp.pad).toBe('8px');
    expect(facts['stamp-cart'].mask).toContain('radial-gradient');
    expect(facts.tape.image.match(/linear-gradient/g)).toHaveLength(4);
    expect(facts['tape-cart'].image.match(/linear-gradient/g)).toHaveLength(4);
  });
});
```

Append to `source-scorecard-capture.spec.ts`:

```ts
it('renders the identity button forms and frames, reads them from the page, and keeps the buy contrast', async () => {
  const kit = await kitDefaultSnapshot();
  const withDna = (dna: Record<string, string>) => ({ ...kit, files: kit.files.map(f => f.path === 'config.js' ? { ...f, content: f.content.replace('"demo":true', `"demo":true,"dna":${JSON.stringify({ version: 1, ...dna })}`) } : f) });
  const combos = [{ button: 'sticker', frame: 'blob' }, { button: 'ticket', frame: 'stamp' }, { button: 'bubbly', frame: 'tape' }, { button: 'brutal', frame: 'stamp' }];
  const samples = await Promise.all(combos.map((dna, i) => collectStoreSample({ id: `t2b-${i}`, name: dna.button, snapshot: withDna({ ...dna, cart: 'drawer', added: 'toast', review: 'split', card: 'still' }) })));
  samples.forEach(({ sample }, i) => {
    expect(sample.errors).toEqual([]);
    expect(sample.surfaces.page).toEqual(expect.objectContaining({ 'dna.button': combos[i].button, 'dna.frame': combos[i].frame }));
    expect(sample.quality.buyContrast).toBeGreaterThanOrEqual(4.5);
    expect(sample.quality.overflow).toEqual({ desktop: false, mobile: false });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/api && npx jest src/storefront-source/source-dna.spec.ts src/storefront-source/source-commerce-identity-dna.spec.ts -t "frame" && npx jest src/storefront-source/source-scorecard-capture.spec.ts -t identity`
Expected: FAIL. `normalizeDna` repairs `blob`, the photo radius has no `%`, and the scorecard has no `dna.frame` of `blob`.

- [ ] **Step 3: Implement**

In `source-dna.ts`: `frame: ['bleed', 'inset', 'rounded', 'arch', 'polaroid', 'blob', 'stamp', 'tape']`. Then change `NOT_SEEDED` to:

```ts
const NOT_SEEDED: Record<string, readonly string[]> = { 'buttons.form': ['sticker', 'ticket', 'bubbly', 'brutal'], 'shape.frame': ['blob', 'stamp', 'tape'] };
```

In `commerce.js`, set `DNA_VALUES` `frame: ['bleed', 'inset', 'rounded', 'arch', 'polaroid', 'blob', 'stamp', 'tape']`, with the rest of that line unchanged. Directly above `  const DNA_CSS = [`, add:

```js
  /* Identity frames (T2b): the photos frames apply to, the stamp's perforated edge and the tape's translucent corners. */
  const FRAMED_PHOTOS = ':is(.menu-item :is(.menu-item__image,.menu-item__image-alt),.order-item__photo)';
  const STAMP_MASK = 'radial-gradient(4px,#0000 97%,#000) round -6px -6px/12px 12px,linear-gradient(#000 0 0) no-repeat 50%/calc(100% - 12px) calc(100% - 12px)';
  const TAPE = 'color-mix(in srgb,var(--kit-accent) 40%,transparent)';
  const TAPE_CORNERS = `linear-gradient(135deg,${TAPE} 0 13px,#0000 13px),linear-gradient(225deg,${TAPE} 0 13px,#0000 13px),linear-gradient(45deg,${TAPE} 0 13px,#0000 13px),linear-gradient(315deg,${TAPE} 0 13px,#0000 13px)`;
```

Directly after the `':root[data-dna-frame=polaroid]{--kit-photo-radius:2px;…}',` entry, add:

```js
    ':root[data-dna-frame=blob]{--kit-photo-radius:58% 42% 55% 45% / 45% 55% 45% 55%;--kit-photo-pad:0px}',
    ':root[data-dna-frame=stamp]{--kit-photo-radius:0px;--kit-photo-pad:8px;--kit-photo-bg:color-mix(in srgb,var(--kit-paper) 82%,#fff)}',
    ':root[data-dna-frame=tape]{--kit-photo-radius:2px;--kit-photo-pad:8px;--kit-photo-bg:color-mix(in srgb,var(--kit-paper) 82%,#fff);--kit-photo-shadow:0 6px 16px -10px #0007}',
```

Directly after the entry that starts `':root[data-dna-frame=bleed]{--kit-photo-round:`, add:

```js
    ':root[data-dna-frame=blob]{--kit-photo-round:58% 42% 55% 45% / 45% 55% 45% 55%}:root[data-dna-frame=stamp]{--kit-photo-round:0px}:root[data-dna-frame=tape]{--kit-photo-round:2px}',
```

Directly after the entry that starts `':root[data-dna-frame] .menu-item :is(.menu-item__image,.menu-item__image-alt){`, add:

```js
    `:root[data-dna-frame=stamp] ${FRAMED_PHOTOS}{-webkit-mask:${STAMP_MASK};mask:${STAMP_MASK}}`,
    `:root[data-dna-frame=tape] ${FRAMED_PHOTOS}{background-image:${TAPE_CORNERS};background-repeat:no-repeat;background-size:30px 30px;background-position:0 0,100% 0,0 100%,100% 100%}`,
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/api && npx jest src/storefront-source/source-dna.spec.ts src/storefront-source/source-commerce-identity-dna.spec.ts src/storefront-source/source-commerce src/storefront-source/source-scorecard src/storefront-source/source-scorecard-capture.spec.ts && node ../../packages/storefront-kit/kit/check-runtimes.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(kit,api): blob, stamp (perforated) and tape photo frames for card and cart photos; the T2b forms and frames render in the scorecard capture with buy contrast held" -- apps/api/src/storefront-source/source-dna.ts apps/api/src/storefront-source/source-dna.spec.ts packages/storefront-kit/kit/commerce.js apps/api/src/storefront-source/source-commerce-identity-dna.spec.ts apps/api/src/storefront-source/source-scorecard-capture.spec.ts
```

---

### Task 13: The hosted checkout learns the four button forms

**Files:**
- Modify: `apps/checkout/src/checkout-branding.ts` (`DNA_FIELDS.button`)
- Modify: `apps/checkout/src/checkout-branding.css` (after the `[data-dna-button=split]` token line; after the focus-visible rule)
- Test: `apps/checkout/src/checkout-branding.test.ts`

**Interfaces:**
- Consumes: runtime `dna.button` values from Task 11 (through the public store JSON, `rememberStoreDna`).
- Produces: `body.store-branded-checkout[data-dna-button=sticker|ticket|bubbly|brutal]` tokens.

- [ ] **Step 1: Write the failing tests**

Append to `apps/checkout/src/checkout-branding.test.ts`:

```ts
describe("identity button forms (T2b)", () => {
  const css = readFileSync(`${process.cwd()}/src/checkout-branding.css`, "utf8");
  afterEach(() => { rememberStoreDna(null); applyCheckoutBranding(document.createElement("div"), null); });
  it("carries the four new forms onto a branded checkout", () => {
    for (const form of ["sticker", "ticket", "bubbly", "brutal"]) {
      rememberStoreDna({ version: 1, button: form });
      applyCheckoutBranding(document.createElement("div"), branding as never);
      expect(document.body.dataset.dnaButton).toBe(form);
    }
  });
  it("fill the pay button with the accent pair, and drop the ticket notches on focus", () => {
    for (const form of ["sticker", "ticket", "bubbly", "brutal"]) {
      const rule = css.match(new RegExp(`body\\.store-branded-checkout\\[data-dna-button=${form}\\]\\{([^}]*)\\}`))?.[1] ?? "";
      expect(rule).toContain("--checkout-dna-btn-bg:var(--checkout-accent)");
      expect(rule).toContain("--checkout-dna-btn-fg:var(--checkout-accent-foreground)");
    }
    expect(css).toContain("body.store-branded-checkout[data-dna-button=ticket] #app :is(button.primary,.payment-success-panel .receipt-action):focus-visible{-webkit-mask:none;mask:none}");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/checkout && npx vitest run src/checkout-branding.test.ts`
Expected: FAIL (`dnaButton` is undefined for `sticker`; the rules are missing).

- [ ] **Step 3: Implement**

In `checkout-branding.ts`:

```ts
const DNA_FIELDS = { button: ['pill', 'block', 'underline', 'tag', 'stamp', 'outline', 'ghost', 'split', 'sticker', 'ticket', 'bubbly', 'brutal'], radius: ['none', 'soft', 'round', 'pill'] } as const;
```

In `checkout-branding.css`, directly after the `body.store-branded-checkout[data-dna-button=split]{…}` line, add:

```css
body.store-branded-checkout[data-dna-button=sticker]{--checkout-dna-btn-radius:min(var(--checkout-dna-radius,6px),12px);--checkout-dna-btn-border:2px solid var(--checkout-foreground);--checkout-dna-btn-bg:var(--checkout-accent);--checkout-dna-btn-fg:var(--checkout-accent-foreground);--checkout-dna-btn-case:none;--checkout-dna-btn-tracking:.01em;--checkout-dna-btn-shadow:4px 4px 0 var(--checkout-foreground)}
body.store-branded-checkout[data-dna-button=ticket]{--checkout-dna-btn-radius:4px;--checkout-dna-btn-border:0 solid transparent;--checkout-dna-btn-bg:var(--checkout-accent);--checkout-dna-btn-fg:var(--checkout-accent-foreground);--checkout-dna-btn-case:uppercase;--checkout-dna-btn-tracking:.08em}
body.store-branded-checkout[data-dna-button=bubbly]{--checkout-dna-btn-radius:999px;--checkout-dna-btn-border:0 solid transparent;--checkout-dna-btn-bg:var(--checkout-accent);--checkout-dna-btn-fg:var(--checkout-accent-foreground);--checkout-dna-btn-case:none;--checkout-dna-btn-tracking:.01em;--checkout-dna-btn-shadow:inset 0 -3px 0 color-mix(in srgb,#000 18%,transparent)}
body.store-branded-checkout[data-dna-button=brutal]{--checkout-dna-btn-radius:0px;--checkout-dna-btn-border:3px solid var(--checkout-foreground);--checkout-dna-btn-bg:var(--checkout-accent);--checkout-dna-btn-fg:var(--checkout-accent-foreground);--checkout-dna-btn-case:uppercase;--checkout-dna-btn-tracking:.04em}
body.store-branded-checkout[data-dna-button=ticket] #app :is(button.primary,.payment-success-panel .receipt-action){-webkit-mask:radial-gradient(circle at 0 50%,#0000 .5em,#000 calc(.5em + .5px)) 0 0/51% 100% no-repeat,radial-gradient(circle at 100% 50%,#0000 .5em,#000 calc(.5em + .5px)) 100% 0/51% 100% no-repeat;mask:radial-gradient(circle at 0 50%,#0000 .5em,#000 calc(.5em + .5px)) 0 0/51% 100% no-repeat,radial-gradient(circle at 100% 50%,#0000 .5em,#000 calc(.5em + .5px)) 100% 0/51% 100% no-repeat}
```

Directly after the existing `…:focus-visible{clip-path:none;outline:3px solid var(--checkout-foreground);…}` rule, add:

```css
body.store-branded-checkout[data-dna-button=ticket] #app :is(button.primary,.payment-success-panel .receipt-action):focus-visible{-webkit-mask:none;mask:none}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/checkout && npx vitest run src/checkout-branding.test.ts && cd ../api && npx jest src/storefront-source/source-motif-paint.spec.ts`
Expected: PASS. The motif-paint suite reads `checkout-branding.css` for the confirmation motif and must stay green.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(checkout): the order confirmation and pay button take the sticker, ticket, bubbly and brutal forms, filled with the accent pair" -- apps/checkout/src/checkout-branding.ts apps/checkout/src/checkout-branding.css apps/checkout/src/checkout-branding.test.ts
```

---

### Task 14: Font pairings

**Files:**
- Create: `apps/api/src/storefront-source/source-font-pairings.ts`
- Create: `apps/api/src/storefront-source/source-font-pairings.spec.ts`

**Interfaces:**
- Consumes: `SourceFontId`, `SOURCE_FONT_CATALOG` (existing).
- Produces: `SOURCE_FONT_PERSONALITIES = ['pop','editorial','luxury','handmade','tech','warm','playful','classic'] as const`, `type SourceFontPersonality`, and `type SourceFontPairing = { id: string; display: SourceFontId; text: SourceFontId; personalities: readonly SourceFontPersonality[] }`. The id is `${display}+${text}`, the same notation as `dnaFingerprint`. Also `SOURCE_FONT_PAIRINGS`, `sourceFontPairing(id)` and `sourceFontPairingsFor(personality)`.

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/storefront-source/source-font-pairings.spec.ts`:

```ts
import { SOURCE_DNA_ENUMS } from './source-dna';
import { SOURCE_FONT_CATALOG } from './source-font-catalog';
import { SOURCE_FONT_PAIRINGS, SOURCE_FONT_PERSONALITIES, sourceFontPairing, sourceFontPairingsFor } from './source-font-pairings';

const role = (id: string) => SOURCE_FONT_CATALOG.find(font => font.id === id)!.role;

describe('font pairings', () => {
  it('lists about 24 distinct pairings of bundled fonts, named display+text', () => {
    expect(SOURCE_FONT_PAIRINGS.length).toBeGreaterThanOrEqual(24);
    expect(new Set(SOURCE_FONT_PAIRINGS.map(pairing => pairing.id)).size).toBe(SOURCE_FONT_PAIRINGS.length);
    for (const pairing of SOURCE_FONT_PAIRINGS) {
      expect(pairing.id).toBe(`${pairing.display}+${pairing.text}`);
      expect(SOURCE_DNA_ENUMS.type.display).toContain(pairing.display);
      expect(SOURCE_DNA_ENUMS.type.text).toContain(pairing.text);
    }
  });

  it('puts a display face on top and a reading face below', () => {
    for (const pairing of SOURCE_FONT_PAIRINGS) {
      expect({ id: pairing.id, display: ['display', 'both'].includes(role(pairing.display)), text: ['text', 'both'].includes(role(pairing.text)) }).toEqual({ id: pairing.id, display: true, text: true });
    }
  });

  it('gives every personality at least three pairings and every pairing one to three personalities', () => {
    for (const personality of SOURCE_FONT_PERSONALITIES) expect({ personality, enough: sourceFontPairingsFor(personality).length >= 3 }).toEqual({ personality, enough: true });
    for (const pairing of SOURCE_FONT_PAIRINGS) {
      expect(pairing.personalities.length).toBeGreaterThanOrEqual(1);
      expect(pairing.personalities.length).toBeLessThanOrEqual(3);
    }
  });

  it('reaches well past the five fonts generation mostly uses', () => {
    expect(new Set(SOURCE_FONT_PAIRINGS.flatMap(pairing => [pairing.display, pairing.text])).size).toBeGreaterThanOrEqual(24);
  });

  it('finds pairings by id and by personality', () => {
    expect(sourceFontPairing('shrikhand+nunito')?.personalities).toContain('playful');
    expect(sourceFontPairing('comic-sans+arial')).toBeUndefined();
    expect(sourceFontPairingsFor('luxury').every(pairing => pairing.personalities.includes('luxury'))).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/api && npx jest src/storefront-source/source-font-pairings.spec.ts`
Expected: FAIL with "Cannot find module './source-font-pairings'".

- [ ] **Step 3: Implement**

Create `apps/api/src/storefront-source/source-font-pairings.ts`:

```ts
/** Identity libraries (T2b): curated display + text pairings of the bundled fonts (source-font-catalog.ts), tagged with
 * personalities. Themes (T3) list the pairing ids they allow; the identity engine (T4) picks within them, weighted away
 * from pairings recent stores used (the id is the type part of dnaFingerprint). Data only: nothing here chooses. */
import type { SourceFontId } from './source-font-catalog';

export const SOURCE_FONT_PERSONALITIES = ['pop', 'editorial', 'luxury', 'handmade', 'tech', 'warm', 'playful', 'classic'] as const;
export type SourceFontPersonality = typeof SOURCE_FONT_PERSONALITIES[number];
export type SourceFontPairing = { id: string; display: SourceFontId; text: SourceFontId; personalities: readonly SourceFontPersonality[] };

const pair = (display: SourceFontId, text: SourceFontId, personalities: SourceFontPersonality[]): SourceFontPairing => ({ id: `${display}+${text}`, display, text, personalities });

export const SOURCE_FONT_PAIRINGS: readonly SourceFontPairing[] = [
  pair('shrikhand', 'nunito', ['pop', 'playful', 'warm']),
  pair('anton', 'figtree', ['pop', 'playful']),
  pair('bodoni-moda', 'libre-caslon-text', ['luxury', 'classic', 'editorial']),
  pair('dm-serif-display', 'manrope', ['luxury', 'editorial']),
  pair('playfair-display', 'lora', ['editorial', 'classic']),
  pair('fraunces', 'instrument', ['warm', 'editorial']),
  pair('young-serif', 'figtree', ['warm', 'handmade']),
  pair('instrument-serif', 'newsreader', ['editorial', 'luxury']),
  pair('unbounded', 'sora', ['tech', 'pop']),
  pair('space-grotesk', 'space-mono', ['tech']),
  pair('syne', 'manrope', ['pop', 'tech']),
  pair('big-shoulders-display', 'chivo', ['pop', 'tech']),
  pair('bebas-neue', 'rubik', ['pop', 'playful']),
  pair('oswald', 'lora', ['classic', 'editorial']),
  pair('bricolage', 'figtree', ['handmade', 'playful', 'warm']),
  pair('epilogue', 'newsreader', ['editorial']),
  pair('outfit', 'nunito', ['playful', 'warm']),
  pair('bitter', 'figtree', ['handmade', 'warm', 'classic']),
  pair('rubik', 'nunito', ['playful', 'warm']),
  pair('chivo', 'libre-caslon-text', ['classic', 'editorial']),
  pair('familjen-grotesk', 'lora', ['handmade', 'editorial']),
  pair('sora', 'manrope', ['tech']),
  pair('fraunces', 'nunito', ['handmade', 'warm', 'playful']),
  pair('dm-serif-display', 'figtree', ['luxury', 'warm']),
];

export const sourceFontPairing = (id: string) => SOURCE_FONT_PAIRINGS.find(pairing => pairing.id === id);
export const sourceFontPairingsFor = (personality: SourceFontPersonality) => SOURCE_FONT_PAIRINGS.filter(pairing => pairing.personalities.includes(personality));
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/api && npx jest src/storefront-source/source-font-pairings.spec.ts src/storefront-source/source-font-catalog.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/storefront-source/source-font-pairings.ts apps/api/src/storefront-source/source-font-pairings.spec.ts
git commit -m "feat(api): 24 curated font pairings of the bundled fonts, tagged pop, editorial, luxury, handmade, tech, warm, playful and classic" -- apps/api/src/storefront-source/source-font-pairings.ts apps/api/src/storefront-source/source-font-pairings.spec.ts
```

---

### Task 15: The palette proposer

**Files:**
- Create: `apps/api/src/storefront-source/source-palette.ts`
- Create: `apps/api/src/storefront-source/fixtures/png.ts`
- Create: `apps/api/src/storefront-source/source-palette.spec.ts`

**Interfaces:**
- Consumes: `samplePhotoColours(images, signal)` and `type PhotoSample` (existing `source-photo-sampler.ts`), and `contrastRatio` (existing).
- Produces: `type SourcePalette = { paper: string; ink: string; accent: string; surface: string; onAccent: string }` (lower-case `#rrggbb`), `type PaletteImage = { url: string; path: string; bytes: Buffer }`, `paletteFromSamples(input: { logo?: PhotoSample; photos?: PhotoSample[] }): SourcePalette | undefined` (pure), and `proposeStorePalette(images: { logo?: PaletteImage; photos?: PaletteImage[] }, options?: { signal?: AbortSignal; sample?: typeof samplePhotoColours }): Promise<SourcePalette | undefined>`.
- Produces (fixture): `png(width, height, pixel: (x, y) => readonly [r, g, b, a]): Buffer`.

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/storefront-source/fixtures/png.ts`:

```ts
import { crc32, deflateSync } from 'node:zlib';

/** A tiny RGBA PNG drawn pixel by pixel, for tests that need real image bytes without fixture files on disk. */
export function png(width: number, height: number, pixel: (x: number, y: number) => readonly [number, number, number, number]): Buffer {
  const stride = width * 4 + 1;
  const rows = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const [r, g, b, a] = pixel(x, y), at = y * stride + 1 + x * 4;
    rows[at] = r; rows[at + 1] = g; rows[at + 2] = b; rows[at + 3] = a;
  }
  const chunk = (type: string, data: Buffer) => {
    const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4);
  header[8] = 8; header[9] = 6; // 8-bit RGBA; compression, filter and interlace stay 0
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', header), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]);
}
```

Create `apps/api/src/storefront-source/source-palette.spec.ts`:

```ts
jest.setTimeout(90_000);
import { contrastRatio } from './source-scorecard';
import { paletteFromSamples, proposeStorePalette, type SourcePalette } from './source-palette';
import { png } from './fixtures/png';

const rgb = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
const hue = (hex: string) => {
  const [r, g, b] = rgb(hex).map(v => v / 255), max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (!d) return 0;
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return h * 60;
};
function expectReadable(palette: SourcePalette | undefined) {
  expect(palette).toBeDefined();
  const p = palette!;
  for (const value of Object.values(p)) expect(value).toMatch(/^#[0-9a-f]{6}$/);
  expect(contrastRatio(rgb(p.ink), rgb(p.paper))).toBeGreaterThanOrEqual(4.5);
  expect(contrastRatio(rgb(p.ink), rgb(p.surface))).toBeGreaterThanOrEqual(4.5);
  expect(contrastRatio(rgb(p.onAccent), rgb(p.accent))).toBeGreaterThanOrEqual(4.5);
}

describe('paletteFromSamples', () => {
  it('takes the accent from a coloured logo and holds every contrast rule', () => {
    const palette = paletteFromSamples({ logo: { dominant: ['#ffffff', '#e4572e'], backdropHex: '#ffffff', uniformity: 1 }, photos: [] });
    expectReadable(palette);
    expect(Math.abs(hue(palette!.accent) - hue('#e4572e'))).toBeLessThan(8);
  });

  it('without a logo, takes the goods\' colour from the photos, never the backdrop they sit on', () => {
    const palette = paletteFromSamples({ photos: [{ dominant: ['#f4f1ec', '#1f7a74', '#d9d4cc'], backdropHex: '#f3f0eb', uniformity: .9 }] });
    expectReadable(palette);
    expect(Math.abs(hue(palette!.accent) - hue('#1f7a74'))).toBeLessThan(8);
  });

  it('gives nothing with neither a logo nor a photo, or with only near-white and grey', () => {
    expect(paletteFromSamples({})).toBeUndefined();
    expect(paletteFromSamples({ logo: { dominant: ['#f7f7f7', '#bdbdbd'] }, photos: [] })).toBeUndefined();
  });

  it('builds a monochrome palette from a black mark, and a dark paper from a logo drawn on black', () => {
    expectReadable(paletteFromSamples({ logo: { dominant: ['#111111'], backdropHex: '#ffffff', uniformity: 1 } }));
    const dark = paletteFromSamples({ logo: { dominant: ['#0b0b0b', '#f3c77a'], backdropHex: '#0b0b0b', uniformity: .95 } })!;
    expectReadable(dark);
    expect(contrastRatio(rgb(dark.paper), [0, 0, 0])).toBeLessThan(1.5);
  });

  it('keeps a pale brand colour and gives it dark text instead of washing it out', () => {
    const palette = paletteFromSamples({ logo: { dominant: ['#f5e050'] } })!;
    expectReadable(palette);
    expect(palette.accent).toBe('#f5e050');
    expect(palette.onAccent).toBe(palette.ink);
  });

  it('is deterministic and ignores malformed colours', () => {
    const input = { logo: { dominant: ['not-a-colour', '#e4572e'] }, photos: [{ dominant: ['#123'] }] };
    expect(paletteFromSamples(input)).toEqual(paletteFromSamples(input));
    expect(paletteFromSamples(input)).toEqual(paletteFromSamples({ logo: { dominant: ['#e4572e'] } }));
  });
});

describe('proposeStorePalette: real pixels through the photo sampler', () => {
  const orange = [228, 87, 46, 255] as const, white = [255, 255, 255, 255] as const, clear = [0, 0, 0, 0] as const, teal = [31, 122, 116, 255] as const;
  const image = (name: string, bytes: Buffer) => ({ url: `https://cdn.test/${name}.png`, path: `${name}.png`, bytes });

  it('reads a flat single-colour logo', async () => {
    const palette = await proposeStorePalette({ logo: image('flat', png(32, 32, () => orange)) });
    expectReadable(palette);
    expect(Math.abs(hue(palette!.accent) - hue('#e4572e'))).toBeLessThan(8);
  });

  it('reads a transparent PNG logo by its mark, not by the transparency', async () => {
    const palette = await proposeStorePalette({ logo: image('mark', png(48, 48, (x, y) => Math.hypot(x - 24, y - 24) < 14 ? orange : clear)) });
    expectReadable(palette);
    expect(Math.abs(hue(palette!.accent) - hue('#e4572e'))).toBeLessThan(8);
  });

  it('falls back to the photos when the logo is fully transparent', async () => {
    const product = png(64, 64, (x, y) => x > 16 && x < 48 && y > 16 && y < 48 ? teal : white);
    const palette = await proposeStorePalette({ logo: image('blank', png(16, 16, () => clear)), photos: [image('product', product)] });
    expectReadable(palette);
    expect(Math.abs(hue(palette!.accent) - hue('#1f7a74'))).toBeLessThan(8);
  });

  it('gives no palette without images, and degrades to none when the sampler fails', async () => {
    const sample = jest.fn();
    expect(await proposeStorePalette({}, { sample: sample as any })).toBeUndefined();
    expect(sample).not.toHaveBeenCalled();
    const logo = image('flat', png(8, 8, () => orange));
    expect(await proposeStorePalette({ logo }, { sample: async () => { throw new Error('no chromium'); } })).toBeUndefined();
    expect(await proposeStorePalette({ logo }, { sample: async () => new Map() })).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/api && npx jest src/storefront-source/source-palette.spec.ts`
Expected: FAIL with "Cannot find module './source-palette'".

- [ ] **Step 3: Implement**

Create `apps/api/src/storefront-source/source-palette.ts`:

```ts
/** Identity libraries (T2b): a deterministic palette from the store's logo and product photos. Colour facts come from the
 * existing pixel sampler (source-photo-sampler.ts); no model. The result keeps the kit's contrast rules: ink on paper and
 * on surface at 4.5:1 or more, and the accent's own text (onAccent) at 4.5:1, the pay button's rule. No logo and no photo,
 * or a sampler that cannot run, gives no palette: the theme's own defaults apply. T4 decides when to use it. */
import { contrastRatio } from './source-scorecard';
import { samplePhotoColours, type PhotoSample } from './source-photo-sampler';

export type SourcePalette = { paper: string; ink: string; accent: string; surface: string; onAccent: string };
export type PaletteImage = { url: string; path: string; bytes: Buffer };
type Rgb = [number, number, number];

const HEX = /^#[0-9a-f]{6}$/i;
const WHITE: Rgb = [255, 255, 255];
const BLACK: Rgb = [0, 0, 0];
const toRgb = (hex: string): Rgb => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)) as Rgb;
const toHex = (colour: readonly number[]) => '#' + colour.slice(0, 3).map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
function toHsl([r, g, b]: Rgb): [number, number, number] {
  const [x, y, z] = [r / 255, g / 255, b / 255], max = Math.max(x, y, z), min = Math.min(x, y, z), l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min, s = l > .5 ? d / (2 - max - min) : d / (max + min);
  const h = max === x ? (y - z) / d + (y < z ? 6 : 0) : max === y ? (z - x) / d + 2 : (x - y) / d + 4;
  return [h * 60, s, l];
}
function fromHsl(h: number, s: number, l: number): Rgb {
  const c = (1 - Math.abs(2 * l - 1)) * s, hp = (((h % 360) + 360) % 360) / 60, x = c * (1 - Math.abs((hp % 2) - 1)), m = l - c / 2;
  const [r, g, b] = hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x] : hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255].map(Math.round) as Rgb;
}
const mix = (a: Rgb, b: Rgb, weight: number): Rgb => [0, 1, 2].map(i => Math.round(a[i] + (b[i] - a[i]) * weight)) as Rgb;
const distance = (a: Rgb, b: Rgb) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
/** A colour that can carry a brand: saturated enough, neither near-white nor near-black. */
const chromatic = (colour: Rgb) => { const [, s, l] = toHsl(colour); return s >= .28 && l > .12 && l < .88; };
const brightness = (colour: Rgb) => contrastRatio(colour, BLACK);

/** Pure and deterministic: the same samples always give the same palette. */
export function paletteFromSamples(input: { logo?: PhotoSample; photos?: PhotoSample[] }): SourcePalette | undefined {
  const logo = (input.logo?.dominant ?? []).filter(value => HEX.test(value)).map(toRgb);
  const photos = (input.photos ?? []).flatMap(sample => {
    const backdrop = sample.backdropHex && HEX.test(sample.backdropHex) ? toRgb(sample.backdropHex) : undefined;
    // The goods, not what they sit on: a colour close to the backdrop is the table or the sweep.
    return (sample.dominant ?? []).filter(value => HEX.test(value)).map(toRgb).filter(colour => !backdrop || distance(colour, backdrop) > 40);
  });
  // A coloured logo first, then the goods; a monochrome brand (a black mark) takes its dark colour.
  const accent = logo.find(chromatic) ?? photos.find(chromatic) ?? [...logo, ...photos].find(colour => toHsl(colour)[2] < .35);
  if (!accent) return undefined;
  const backdrop = input.logo?.backdropHex && HEX.test(input.logo.backdropHex) ? toRgb(input.logo.backdropHex) : undefined;
  const dark = !!backdrop && (input.logo?.uniformity ?? 0) >= .8 && toHsl(backdrop)[2] < .2;
  const [hue, saturation] = toHsl(accent);
  const paper = dark ? fromHsl(hue, Math.min(saturation, .18), .08) : fromHsl(hue, Math.min(saturation, .35), .97);
  let ink = dark ? fromHsl(hue, Math.min(saturation, .15), .94) : fromHsl(hue, Math.min(saturation, .3), .13);
  const surface = mix(paper, ink, .06);
  if (contrastRatio(ink, paper) < 4.5 || contrastRatio(ink, surface) < 4.5) ink = dark ? WHITE : BLACK;
  // The accent's text: white, the ink or the paper, whichever reads best; if none reaches 4.5:1, move the accent's
  // lightness away from that text until it does (white or near-black always gets there).
  const onAccent = (fill: Rgb): Rgb => [WHITE, ink, paper].reduce((best, colour) => contrastRatio(colour, fill) > contrastRatio(best, fill) ? colour : best);
  let fill = accent;
  for (let step = 0; step < 50 && contrastRatio(onAccent(fill), fill) < 4.5; step++) {
    const [h, s, l] = toHsl(fill), lighterText = brightness(onAccent(fill)) > brightness(fill);
    fill = fromHsl(h, s, Math.max(0, Math.min(1, l + (lighterText ? -.02 : .02))));
  }
  return { paper: toHex(paper), ink: toHex(ink), accent: toHex(fill), surface: toHex(surface), onAccent: toHex(onAccent(fill)) };
}

/** Logo and up to 12 product photos through the pixel sampler, then paletteFromSamples. Any failure gives no palette. */
export async function proposeStorePalette(images: { logo?: PaletteImage; photos?: PaletteImage[] }, options: { signal?: AbortSignal; sample?: typeof samplePhotoColours } = {}): Promise<SourcePalette | undefined> {
  const photos = (images.photos ?? []).slice(0, 12);
  const all = [...(images.logo ? [images.logo] : []), ...photos];
  if (!all.length) return undefined;
  try {
    const samples = await (options.sample ?? samplePhotoColours)(all, options.signal);
    const logo = images.logo ? samples.get(images.logo.url) : undefined;
    const photoSamples = photos.flatMap(photo => { const sample = samples.get(photo.url); return sample ? [sample] : []; });
    if (!logo && !photoSamples.length) return undefined;
    return paletteFromSamples({ logo, photos: photoSamples });
  } catch { return undefined; }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/api && npx jest src/storefront-source/source-palette.spec.ts src/storefront-source/source-generation.service.spec.ts`
Expected: PASS. The generation spec mocks the sampler and must stay green.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/storefront-source/source-palette.ts apps/api/src/storefront-source/source-palette.spec.ts apps/api/src/storefront-source/fixtures/png.ts
git commit -m "feat(api): deterministic palette proposer from the logo and product photos through the pixel sampler; contrast held (4.5:1), no palette on no images or any failure" -- apps/api/src/storefront-source/source-palette.ts apps/api/src/storefront-source/source-palette.spec.ts apps/api/src/storefront-source/fixtures/png.ts
```

---

### Task 16: Real-browser proof in the Studio preview, and screenshots

**Files:**
- Create: `apps/merchant-studio/tests/identity-libraries.spec.ts`

**Interfaces:**
- Consumes: everything above. It reads the `paws` pack from disk the way `loadMotifPack` does, and uses the Studio preview sandbox (`sourcePreviewDocument`, CSP included) and `checkSourceWebsite`.
- Produces: `tmp/identity-shots/{home,cart,product}-<button>-<frame>-<width>.png` and `tmp/identity-shots/empty-cart-<width>.png`.

- [ ] **Step 1: Write the tests**

Create `apps/merchant-studio/tests/identity-libraries.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { kitPath } from '@pagosya/storefront-kit';

/** Identity libraries T2a/T2b in the real preview sandbox (its CSP included): the paws pack in every placement, each new
 * button form and frame, at 1280 and 390. Screenshots in tmp/identity-shots are looked at before merging. */
const commerce = readFileSync(kitPath('commerce.js'), 'utf8');
const SHOTS = '../../tmp/identity-shots';
mkdirSync(SHOTS, { recursive: true });
const pack = (id: string) => {
  const manifest = JSON.parse(readFileSync(kitPath('motif-packs', id, 'pack.json'), 'utf8'));
  return { id, motifs: manifest.motifs.map((motif: any) => ({ placement: motif.placement, behavior: motif.behavior, svg: readFileSync(kitPath('motif-packs', id, motif.file), 'utf8') })) };
};
const PHOTO = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 500"><rect width="400" height="500" fill="#e9d8c4"/><circle cx="200" cy="230" r="120" fill="#b4441f"/><rect x="120" y="380" width="160" height="40" rx="20" fill="#7a2e14"/></svg>').toString('base64');
const ITEMS = [
  { id: 'galleta', name: 'Galletas de pollo', amount: 3590, currency: 'BOB', stock: 9, imageUrls: [PHOTO], description: 'Horneadas sin conservantes' },
  { id: 'hueso', name: 'Hueso de cuero', amount: 2500, currency: 'BOB', stock: 9, imageUrls: [PHOTO], description: 'Para morder sin culpa' },
  { id: 'collar', name: 'Collar tejido', amount: 6000, currency: 'BOB', stock: 3, imageUrls: [PHOTO], description: 'Hecho a mano' },
];
const CSS = `:root{--store-background:#fbf6ee;--store-foreground:#2a1d12;--store-accent:#b4441f;--store-accent-foreground:#ffffff}
body{margin:0;font:16px/1.5 system-ui,sans-serif;background:#fbf6ee;color:#2a1d12}header{display:flex;justify-content:space-between;align-items:center;padding:16px clamp(16px,4vw,48px)}
.hero{padding:clamp(40px,8vw,96px) clamp(16px,4vw,48px);background:#fbf6ee;color:#2a1d12}.hero h1{font-size:clamp(36px,7vw,72px);margin:0 0 12px}
.cta{display:inline-flex;align-items:center;gap:.5em;padding:.8em 1.4em;border-radius:999px;background:#b4441f;color:#fff;text-decoration:none;font-weight:700}
.badge{padding:.3em .8em;border-radius:999px;background:#2a1d12;color:#fbf6ee;font-size:14px;margin-left:12px}
#catalogo{padding:0 clamp(16px,4vw,48px) 48px}[data-motif-divider]{margin-inline:clamp(16px,4vw,48px)}`;
const html = `<!doctype html><html lang="es"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${CSS}</style><script src="config.js" defer></script><script src="commerce.js" defer></script></head><body>
<header><strong>Huellitas</strong><button type="button" data-cart-open>Pedido <b data-cart-count>0</b></button></header>
<main><section class="hero" data-motif-pattern><h1>Huellitas</h1><p>Snacks horneados para perros felices.</p><a class="cta" href="#catalogo">Ver snacks <span data-motif-icon></span></a><span class="badge" data-motif-sticker>¡Nuevo!</span></section>
<div data-motif-divider></div><section id="catalogo"><h2>Snacks</h2><div data-pagosya-catalog></div></section></main>
<div data-pagosya-cart hidden></div><p data-pagosya-status></p></body></html>`;
const config = (dna: Record<string, string>) => 'window.PAGOSYA_CONFIG=' + JSON.stringify({ slug: 'huellitas', data: { storeName: 'Huellitas', locations: [], categories: [], items: ITEMS },
  dna: { version: 1, hover: 'lift', press: 'squash', radius: 'round', border: 'hairline', cart: 'drawer', added: 'toast', review: 'split', card: 'still', motion: 'playful', ...dna }, motifPack: pack('paws') }) + ';';

async function mount(browserPage: any, dna: Record<string, string>, cart: Array<{ id: string; quantity: number }> = []) {
  await browserPage.goto('/?demo=1');
  await browserPage.evaluate(async ({ commerce, html, config, cart }: any) => {
    const { sourcePreviewDocument } = await import('/src/storefront-preview.ts');
    const snapshot = { schemaVersion: 1, brief: {}, files: [{ path: 'index.html', content: html }, { path: 'config.js', content: config }, { path: 'commerce.js', content: commerce }] };
    document.body.innerHTML = ''; document.body.style.margin = '0';
    const frame = document.createElement('iframe'); frame.title = 'Tienda'; frame.sandbox.add('allow-scripts'); frame.style.cssText = 'width:100%;height:100vh;border:0';
    frame.srcdoc = sourcePreviewDocument(snapshot, 'index.html', { cart }); document.body.append(frame);
  }, { commerce, html, config: config(dna), cart });
  return browserPage.frameLocator('iframe');
}

const COMBOS = [['sticker', 'blob'], ['ticket', 'stamp'], ['bubbly', 'tape'], ['brutal', 'stamp']] as const;
for (const width of [1280, 390]) for (const [button, frame] of COMBOS) test(`${button} buttons and ${frame} frames with the paws pack at ${width}px`, async ({ page: browserPage }) => {
  await browserPage.setViewportSize({ width, height: 900 });
  await browserPage.emulateMedia({ reducedMotion: 'reduce' });
  const shop = await mount(browserPage, { button, frame }, [{ id: 'galleta', quantity: 2 }]);
  await expect(shop.locator('.menu-item').first()).toBeVisible();
  await expect(shop.locator('html')).toHaveAttribute('data-dna-button', button);
  await expect(shop.locator('.hero')).toHaveAttribute('data-motif-pattern', 'placed');
  await expect(shop.locator('.cta [data-motif-icon="placed"] svg')).toHaveCount(1);
  await expect(shop.locator('[data-motif-divider="placed"] .pagosya-motif')).toHaveCount(1);
  await expect(shop.locator('.badge .pagosya-motif')).toHaveCount(1);
  expect(await shop.locator('.pagosya-motif:not([aria-hidden="true"])').count()).toBe(0);
  expect(await shop.locator('html').evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await browserPage.screenshot({ path: `${SHOTS}/home-${button}-${frame}-${width}.png` });
  await shop.getByRole('button', { name: /Pedido/ }).first().click();
  await expect(shop.locator('dialog.cart-drawer[open] .checkout-button')).toBeVisible();
  await browserPage.screenshot({ path: `${SHOTS}/cart-${button}-${frame}-${width}.png` });
  await browserPage.keyboard.press('Escape');
  await expect(shop.locator('dialog.cart-drawer[open]')).toHaveCount(0);
  await shop.locator('.menu-item .menu-item__details').first().click();
  await expect(shop.locator('.product-detail__buy [data-motif-icon="placed"] svg')).toBeVisible();
  await browserPage.screenshot({ path: `${SHOTS}/product-${button}-${frame}-${width}.png` });
});

for (const width of [1280, 390]) test(`the empty cart draws the pack at ${width}px`, async ({ page: browserPage }) => {
  await browserPage.setViewportSize({ width, height: 900 });
  await browserPage.emulateMedia({ reducedMotion: 'reduce' });
  const shop = await mount(browserPage, { button: 'bubbly', frame: 'tape' });
  await shop.getByRole('button', { name: /Pedido/ }).first().click();
  await expect(shop.locator('dialog.cart-drawer[open] li.order-empty .pagosya-motif[data-motif-slot="empty"] svg')).toBeVisible();
  await browserPage.screenshot({ path: `${SHOTS}/empty-cart-${width}.png` });
});

test('motifs animate on hover, and nothing moves with reduced motion', async ({ page: browserPage }) => {
  for (const reduced of [false, true]) {
    await browserPage.emulateMedia({ reducedMotion: reduced ? 'reduce' : 'no-preference' });
    const shop = await mount(browserPage, { button: 'sticker', frame: 'blob' });
    await shop.locator('.cta').hover();
    await browserPage.waitForTimeout(80);
    const running = await shop.locator('.cta').evaluate((cta: Element) => Array.from(cta.querySelectorAll('.pagosya-motif, .pagosya-motif *')).reduce((sum, el) => sum + el.getAnimations().length, 0));
    if (reduced) expect(running).toBe(0); else expect(running).toBeGreaterThan(0);
  }
});

test('a store with the pack and a new form still passes the shopping checks', async ({ page: browserPage }) => {
  await browserPage.goto('/?demo=1');
  const results = await browserPage.evaluate(async ({ commerce, html, config }: any) => {
    const { checkSourceWebsite } = await import('/src/source-checks.ts');
    return checkSourceWebsite({ schemaVersion: 1, brief: { sitePurpose: 'shop' }, files: [{ path: 'index.html', content: html }, { path: 'config.js', content: config }, { path: 'commerce.js', content: commerce }] } as any);
  }, { commerce, html, config: config({ button: 'ticket', frame: 'stamp' }) });
  const critical = ['Añadir un producto', 'Compra de producto', 'Controles de compra completos', 'Pedido abre el carrito', 'Ancho de la página', 'JavaScript'];
  expect(results.filter((result: any) => critical.includes(result.label) && result.status === 'failed')).toEqual([]);
});
```

- [ ] **Step 2: Run the tests**

Run: `cd apps/merchant-studio && pnpm exec playwright test tests/identity-libraries.spec.ts --workers=2`
Expected: PASS. Every task before this one is in, so this task writes proof, not new behaviour. If a test fails, the fault is in the task that owns that behaviour. Fix it there with that task's tests, and never loosen this spec.

- [ ] **Step 3: Look at the screenshots**

Open every file in `tmp/identity-shots/`: `home-*`, `cart-*`, `product-*`, `empty-cart-*` and the two `motif-packs-*` sheets. Check that:

- The pattern is visible but quiet behind the hero.
- The paw icon sits beside "Ver snacks" and beside "Añadir al pedido", never over the total.
- The divider hairlines are even.
- The sticker leads "¡Nuevo!".
- Each button form reads as its name (offset shadow, notched ends, soft lip, thick border).
- The frames read as a blob, a perforated stamp and taped corners.
- Nothing overflows at 390.

Fix anything that overlaps or overflows in the owning task's code and rerun that task's tests, then run this spec again.

- [ ] **Step 4: Run the regression net**

Run: `cd apps/merchant-studio && pnpm exec playwright test tests/identity-libraries.spec.ts tests/kit-templates.spec.ts tests/source-checks.spec.ts --workers=2`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/merchant-studio/tests/identity-libraries.spec.ts
git commit -m "test(studio): the paws pack in every placement and each new button form and frame in the real preview at 1280 and 390, reduced motion, shopping checks; screenshots in tmp/identity-shots" -- apps/merchant-studio/tests/identity-libraries.spec.ts
```

---

## Final verification (after Task 16)

- `cd apps/api && npx jest src/storefront-source/source-motif src/storefront-source/source-commerce src/storefront-source/source-dna src/storefront-source/source-font src/storefront-source/source-palette src/storefront-source/source-scorecard src/storefront-source/source-generation.service.spec.ts src/storefront-source/source-design-planner.spec.ts`: all green.
- `node packages/storefront-kit/tools/motif-packs.mjs --check` prints `30 packs match their drawings`. `node packages/storefront-kit/kit/check-runtimes.mjs` passes.
- `cd apps/api && npx tsc -p tsconfig.json --noEmit` shows no type errors.
- `cd apps/checkout && npx vitest run` is green.
- `cd apps/merchant-studio && pnpm exec playwright test tests/identity-libraries.spec.ts tests/kit-templates.spec.ts tests/source-checks.spec.ts --workers=2` is green.
- `git status --short` shows only this plan's paths, all committed.
- The screenshots in `tmp/identity-shots/` have been looked at.
