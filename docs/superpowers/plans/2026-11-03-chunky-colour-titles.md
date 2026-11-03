# Chunky Colour Titles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Único stores get chunky titles in one of four styles YAPI picks per product — the hero headline coloured word by word from
the store's photo colours, section titles with one coloured word, a hand-drawn underline under the marked word.

**Architecture:** One pure module (`source-title-style.ts`) owns the styles, the colour picking, YAPI's choice rule and the chat ask.
The palette reader also returns the photos' other goods colours; the store's look saves up to four title colours; the theme block
writes them as `--es-title-1…4` plus the chosen style's font. Esencial draws titles from those variables (`data-es-titles` on the
store root); a small React component splits the hero headline into coloured words and draws the underline.

**Tech Stack:** NestJS + Jest; Esencial React TSX + globals.css; storefront kit fonts (`packages/storefront-kit/kit/fonts`); Playwright sandbox renders.

**Spec:** `docs/superpowers/specs/2026-11-03-chunky-colour-titles-design.md`

## Global Constraints

- Only Único stores (new builds and switches to Único) get a chunky style; the other 33 templates keep their fonts; built stores keep their files.
- Styles: `burbuja` (Baloo 2, 800, up to 4 colours, underline), `redonda` (Fredoka, 600, 2, underline), `firme` (Archivo Black, 2, no
  underline), `poster` (Anton, up to 3, no underline). Line height 1.0–1.05, sentence case, no letter-spacing.
- Every title colour reaches 3:1 on the page (paper); a lighter one is darkened toward ink; near-duplicates (RGB distance < 40) count once; minimum 2 (accent-ink and ink).
- Hero: each word the next colour, cycling. Section titles: ink, the `*marked*` word in colour 1, underline on at most every other section title.
- Titles over a darkened photo (`.lb-cover--dark`) stay white and are not recoloured. Buttons, prices, product names, menus, body text unchanged.
- Underline: inline SVG in the accent, absolutely placed (never changes line height), draws in on view; static with reduced motion.
- Playful business (`isPlayfulBusiness`) → `burbuja`; otherwise YAPI's answer; default `redonda`.
- Before saving anything under `apps/api/src` (spec files too): no `StoreSourceChatJob` RUNNING/QUEUED (check with a Prisma script).
- Jest: name spec files, always `--maxWorkers=2`, never a folder. Render specs need `NODE_OPTIONS=--max-old-space-size=6144`.
- Files that hold other uncommitted work (source-palette.ts/.spec.ts, source-master.ts, source-templates.ts, source-templates.service.ts,
  source-chat.service.ts, source-section-library.ts, globals.css): stage HEAD + exact text replacements (never `-U0` hunks); check TS parses
  and CSS lands outside/inside the intended `/* lb:… */` / `/* theme:… */` blocks.
- Rebuild the Studio after template/kit changes: `pnpm --filter @pagosya/merchant-dashboard run build:studio`.

## Review Focus

1. A hero title with no `*marked*` word: no underline drawn, words still coloured — pinned in Task 6.
2. A store whose photos give no usable goods colour (all grey/white): exactly 2 title colours (accent-ink, ink), never an unreadable one — pinned in Task 1.
3. A refill that changes only the accent (template stores) keeps the saved title colours — pinned in Task 3.
4. «un título más divertido y cambia el precio»: not a title ask (other edits go the usual way) — pinned in Task 1 (reader) and Task 8 (routing).
5. A store on another template with `titles: burbuja` set by hand: nothing breaks (falls back to the heading font, colours fall back) — pinned in Task 5.

---

### Task 1: The title-style module (styles, colours, choice, chat ask)

**Files:**
- Create: `apps/api/src/storefront-source/source-title-style.ts`
- Test: `apps/api/src/storefront-source/source-title-style.spec.ts` (create)

**Interfaces:**
- Produces:
  - `export type TitleStyle = 'burbuja' | 'redonda' | 'firme' | 'poster'`
  - `export const TITLE_STYLES: Record<TitleStyle, { font: string; colours: number; underline: boolean }>` (font = catalogue id)
  - `export const isTitleStyle: (value: unknown) => value is TitleStyle`
  - `export function titleColours(input: { paper: string; ink: string; accentInk: string; deep?: string; extras?: string[] }): string[]` — 2–4 hex, lowercase
  - `export function libraryTitleStyle(answer: { titleStyle?: unknown } | null | undefined, playful: boolean): TitleStyle`
  - `export function readTitleAsk(text: string): 'calmer' | 'livelier' | 'other' | null`
  - `export function nextTitleStyle(current: string | undefined, ask: 'calmer' | 'livelier' | 'other'): TitleStyle`

- [ ] **Step 1: Write the failing tests**

```ts
// apps/api/src/storefront-source/source-title-style.spec.ts
import { contrastRatio } from './source-scorecard';
import { TITLE_STYLES, libraryTitleStyle, nextTitleStyle, readTitleAsk, titleColours } from './source-title-style';

describe('title styles (spec 2026-11-03 chunky colour titles)', () => {
  it('names a catalogue font, a colour count and the underline per style', () => {
    expect(TITLE_STYLES).toEqual({
      burbuja: { font: 'baloo-2', colours: 4, underline: true }, redonda: { font: 'fredoka', colours: 2, underline: true },
      firme: { font: 'archivo-black', colours: 2, underline: false }, poster: { font: 'anton', colours: 3, underline: false },
    });
  });
});

describe('titleColours', () => {
  const page = { paper: '#f6f4ee', ink: '#1d1d1b', accentInk: '#5d7a2e', deep: '#2f3d18' };
  it('keeps readable goods colours after the accent, darkening a light one, at most four', () => {
    const colours = titleColours({ ...page, extras: ['#e8c9a0', '#2f6db5', '#c0392b', '#8e44ad'] });
    expect(colours[0]).toBe('#5d7a2e');
    expect(colours.length).toBe(4);
    for (const colour of colours) expect(contrastRatio(colour, page.paper)).toBeGreaterThanOrEqual(3);
  });
  it('counts near-duplicates once', () => {
    expect(titleColours({ ...page, extras: ['#5e7b2f', '#5c792d'] })).toEqual(['#5d7a2e', '#2f3d18']);
  });
  it('gives exactly accent-ink and ink when the photos have no goods colour (Review Focus 2)', () => {
    expect(titleColours({ paper: page.paper, ink: page.ink, accentInk: page.accentInk, extras: [] })).toEqual(['#5d7a2e', '#1d1d1b']);
  });
});

describe('libraryTitleStyle', () => {
  it('reads the answer, defaults to redonda, and a playful business is always burbuja', () => {
    expect(libraryTitleStyle({ titleStyle: 'firme' }, false)).toBe('firme');
    expect(libraryTitleStyle({ titleStyle: 'nope' }, false)).toBe('redonda');
    expect(libraryTitleStyle(null, false)).toBe('redonda');
    expect(libraryTitleStyle({ titleStyle: 'firme' }, true)).toBe('burbuja');
  });
});

describe('readTitleAsk / nextTitleStyle', () => {
  it('reads the three asks only when they are the whole request (Review Focus 4)', () => {
    expect(readTitleAsk('títulos más tranquilos')).toBe('calmer');
    expect(readTitleAsk('haz los títulos más divertidos por favor')).toBe('livelier');
    expect(readTitleAsk('cambia los títulos')).toBe('other');
    expect(readTitleAsk('un título más divertido y cambia el precio')).toBeNull();
    expect(readTitleAsk('hazla más colorida')).toBeNull();
  });
  it('moves one step along burbuja → redonda → firme, and «other» picks a different style', () => {
    expect(nextTitleStyle('burbuja', 'calmer')).toBe('redonda');
    expect(nextTitleStyle('redonda', 'calmer')).toBe('firme');
    expect(nextTitleStyle('firme', 'calmer')).toBe('firme');
    expect(nextTitleStyle('firme', 'livelier')).toBe('redonda');
    expect(nextTitleStyle('redonda', 'livelier')).toBe('burbuja');
    expect(nextTitleStyle(undefined, 'livelier')).toBe('burbuja');
    expect(nextTitleStyle('redonda', 'other')).not.toBe('redonda');
  });
});
```

- [ ] **Step 2: Run** `cd apps/api && npx jest src/storefront-source/source-title-style.spec.ts --maxWorkers=2` — Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
// apps/api/src/storefront-source/source-title-style.ts
/** Chunky colour titles (spec 2026-11-03): four title styles YAPI picks per product on Único stores, the colours they are drawn in
 *  (from the store's photos, always readable on the page) and the chat asks that change them. Pure; no I/O. */
import { contrastRatio } from './source-scorecard';

export type TitleStyle = 'burbuja' | 'redonda' | 'firme' | 'poster';
export const TITLE_STYLES: Record<TitleStyle, { font: string; colours: number; underline: boolean }> = {
  burbuja: { font: 'baloo-2', colours: 4, underline: true }, redonda: { font: 'fredoka', colours: 2, underline: true },
  firme: { font: 'archivo-black', colours: 2, underline: false }, poster: { font: 'anton', colours: 3, underline: false },
};
export const isTitleStyle = (value: unknown): value is TitleStyle => typeof value === 'string' && value in TITLE_STYLES;

const HEX = /^#[0-9a-f]{6}$/i;
const rgb = (hex: string) => [1, 3, 5].map(at => parseInt(hex.slice(at, at + 2), 16));
const distance = (a: string, b: string) => { const [x, y] = [rgb(a), rgb(b)]; return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]); };
const mix = (a: string, b: string, t: number) => '#' + rgb(a).map((value, at) => Math.round(value * (1 - t) + rgb(b)[at] * t).toString(16).padStart(2, '0')).join('');
/** Darkened toward ink until it reads on the paper at 3:1 (large text); ink itself always does. */
const readable = (colour: string, paper: string, ink: string) => {
  for (let step = 0; step <= 10; step++) { const mixed = mix(colour, ink, step / 10); if (contrastRatio(mixed, paper) >= 3) return mixed; }
  return ink.toLowerCase();
};

/** Up to four title colours: the accent as text first, then the photos' other goods colours, then the deep colour; ink when fewer than two. */
export function titleColours(input: { paper: string; ink: string; accentInk: string; deep?: string; extras?: string[] }): string[] {
  const out: string[] = [];
  for (const candidate of [input.accentInk, ...(input.extras ?? []), ...(input.deep ? [input.deep] : [])]) {
    if (!HEX.test(candidate) || out.length >= 4) continue;
    const colour = readable(candidate.toLowerCase(), input.paper, input.ink);
    if (out.every(kept => distance(kept, colour) >= 40)) out.push(colour);
  }
  if (out.length < 2) out.push(input.ink.toLowerCase());
  return out;
}

export function libraryTitleStyle(answer: { titleStyle?: unknown } | null | undefined, playful: boolean): TitleStyle {
  if (playful) return 'burbuja';
  return isTitleStyle(answer?.titleStyle) ? answer!.titleStyle as TitleStyle : 'redonda';
}

// «títulos más tranquilos / más divertidos», «cambia los títulos»: only when that is the whole request.
const CALMER = /\bt[ií]tulos?\s+(?:m[aá]s\s+)?(tranquil|sobri|calmad|seri)[oa]s?\b/gi;
const LIVELIER = /\bt[ií]tulos?\s+(?:m[aá]s\s+)?(divertid|colorid|loc)[oa]s?\b|\bt[ií]tulos?\s+(?:m[aá]s\s+)?alegres?\b/gi;
const OTHER = /\b(cambia|otr[oa]s?)\s+(?:los\s+|el\s+)?t[ií]tulos?\b|\bt[ií]tulos?\s+distint[oa]s\b/gi;
const FILLER = new Set(['haz', 'hazme', 'pon', 'ponle', 'los', 'las', 'el', 'la', 'que', 'sean', 'sea', 'mas', 'un', 'poco', 'por', 'favor', 'porfa',
  'quiero', 'quisiera', 'mis', 'de', 'mi', 'tienda', 'estilo', 'ahora']);
export function readTitleAsk(text: string): 'calmer' | 'livelier' | 'other' | null {
  const found = ([['calmer', CALMER], ['livelier', LIVELIER], ['other', OTHER]] as const).find(([, pattern]) => { const hit = pattern.test(text); pattern.lastIndex = 0; return hit; });
  if (!found) return null;
  const rest = text.replace(CALMER, ' ').replace(LIVELIER, ' ').replace(OTHER, ' ').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().match(/[a-z0-9]+/g) ?? [];
  return rest.every(word => FILLER.has(word)) ? found[0] : null;
}

const LADDER: TitleStyle[] = ['burbuja', 'redonda', 'firme'];
export function nextTitleStyle(current: string | undefined, ask: 'calmer' | 'livelier' | 'other'): TitleStyle {
  const style = isTitleStyle(current) ? current : 'redonda';
  if (ask === 'other') return (['burbuja', 'redonda', 'firme', 'poster'] as TitleStyle[]).find(id => id !== style)!;
  const at = LADDER.indexOf(style === 'poster' ? 'redonda' : style);
  return LADDER[Math.max(0, Math.min(LADDER.length - 1, at + (ask === 'calmer' ? 1 : -1)))];
}
```

(«y» is deliberately not a filler word: «… y cambia el precio» is another edit.)

- [ ] **Step 4: Run** the spec — Expected: PASS (all).

- [ ] **Step 5: Commit** (both files are new)

```bash
git add apps/api/src/storefront-source/source-title-style.ts apps/api/src/storefront-source/source-title-style.spec.ts
git commit -m "feat(titles): title styles, readable title colours from the photos, YAPI's choice rule and the chat asks"
```

---

### Task 2: The palette reader returns the photos' other goods colours

**Files:**
- Modify: `apps/api/src/storefront-source/source-palette.ts` (`SourcePalette` type line 8; the return of `paletteFromSamples` ~line 77)
- Test: `apps/api/src/storefront-source/source-palette.spec.ts` (append)

**Interfaces:**
- Produces: `SourcePalette` gains `extras?: string[]` — chromatic goods colours from the photos (not the accent, not near the backdrop), in sample order, distinct (RGB distance ≥ 40), at most 4.

- [ ] **Step 1: Failing test** (append):

```ts
describe('palette extras for titles (spec 2026-11-03 chunky colour titles)', () => {
  it('returns the photos\' other goods colours, distinct, without the accent', () => {
    const palette = paletteFromSamples({ photos: [{ dominant: ['#2f6db5', '#2e6cb4', '#c0392b', '#f2f2f2', '#e0a030'] }] })!;
    expect(palette.extras).toEqual(['#c0392b', '#e0a030']);
  });
  it('returns no extras for grey photos', () => {
    expect(paletteFromSamples({ photos: [{ dominant: ['#2f6db5', '#9a9a9a', '#f4f4f4'] }] })!.extras).toEqual([]);
  });
});
```

(`#2f6db5` is the accent there — the first strong goods colour on a light page.)

- [ ] **Step 2: Run** `cd apps/api && npx jest src/storefront-source/source-palette.spec.ts --maxWorkers=2` — Expected: FAIL (`extras` undefined).

- [ ] **Step 3: Implement** — type: `export type SourcePalette = { paper: string; ink: string; accent: string; surface: string; onAccent: string; extras?: string[] };`
and in `paletteFromSamples` just before the final `return`:

```ts
  // Chunky colour titles (spec 2026-11-03): the goods' other colours, for the hero's word-by-word titles.
  const extras: Rgb[] = [];
  for (const colour of photos) if (chromatic(colour) && distance(colour, accent) >= 40 && extras.every(kept => distance(kept, colour) >= 40) && extras.length < 4) extras.push(colour);
```

and add `extras: extras.map(toHex)` to the returned object.

- [ ] **Step 4: Run** — PASS, and the whole `source-palette.spec.ts` stays green.

- [ ] **Step 5: Commit** (HEAD + exact replacements for both files — both carry other uncommitted work)

`git commit -m "feat(palette): the photos' other goods colours (extras) for the title colours"`

---

### Task 3: The look saves title colours; the theme block writes them and the title font

**Files:**
- Modify: `apps/api/src/storefront-source/source-master.ts` (`MasterLook` line 20; `masterLook` ~71; `templateLook` ~195; `masterThemeBlock` ~131; `masterThemeCss` ~143)
- Modify: `apps/api/src/storefront-source/source-templates.ts` (refill ~363: compute `variants` before `theme`; assemble ~501: pass the titles variant)
- Modify: `apps/api/src/storefront-source/source-templates.service.ts` (assemble ~192: `look.titles` from the brand palette)
- Test: `apps/api/src/storefront-source/source-title-theme.spec.ts` (create)

**Interfaces:**
- Consumes: `titleColours`, `TITLE_STYLES`, `isTitleStyle`, `TitleStyle` (Task 1); `SourcePalette.extras` (Task 2); `accentInk(accent, paper, ink)` (source-master.ts).
- Produces:
  - `MasterLook.titles?: string[]` (2–4 lowercase hex), kept by `masterLook` and by `templateLook` unless the change carries its own.
  - `masterThemeBlock(colours, headingFont, bodyFont, monoFont?, titles?: { colours?: string[]; style?: string })` writes
    `--es-title-1…4` (a shorter list repeats in order; with no colours: accent-ink then ink) and, for a chunky style,
    `@font-face` for its font plus `--es-title-font:'<family>',var(--es-heading)`.
  - `masterThemeCss(settings, look, titleStyle?: string)`.

- [ ] **Step 1: Failing tests**

```ts
// apps/api/src/storefront-source/source-title-theme.spec.ts
import { templateManifest } from '@pagosya/store-templates';
import { masterLook, masterThemeCss, templateLook } from './source-master';

const settings = templateManifest('esencial')!.master!;
describe('title colours in the theme block (spec 2026-11-03 chunky colour titles)', () => {
  it('writes four title variables and the chosen style\'s font', () => {
    const look = masterLook(settings, { colors: { paper: '#f6f4ee', ink: '#1d1d1b', accent: '#5d7a2e' }, titles: ['#5d7a2e', '#c0392b'] });
    const css = masterThemeCss(settings, look, 'burbuja');
    expect(css).toMatch(/--es-title-1:#5d7a2e;--es-title-2:#c0392b;--es-title-3:#5d7a2e;--es-title-4:#c0392b;/);
    expect(css).toContain('url(assets/baloo-2.ttf)');
    expect(css).toContain("--es-title-font:'Baloo 2',var(--es-heading)");
  });
  it('falls back to two colours, and writes no title font for normal titles', () => {
    const css = masterThemeCss(settings, masterLook(settings, { colors: { paper: '#ffffff', ink: '#111111', accent: '#2457c5' } }));
    expect(css).toMatch(/--es-title-1:#[0-9a-f]{6};--es-title-2:#[0-9a-f]{6};--es-title-3:/);
    expect(css).not.toContain('--es-title-font');
  });
  it('keeps the saved title colours when only the accent changes (Review Focus 3)', () => {
    const before = masterLook(settings, { colors: { accent: '#5d7a2e' }, titles: ['#5d7a2e', '#c0392b'] });
    expect(templateLook(settings, before, { colors: { accent: '#2457c5' } }).titles).toEqual(['#5d7a2e', '#c0392b']);
  });
  it('drops invalid title colours', () => {
    expect(masterLook(settings, { titles: ['red', '#ABCDEF', '#123456', '#000000', '#ffffff', '#222222'] }).titles).toEqual(['#abcdef', '#123456', '#000000', '#ffffff']);
  });
});
```

(Task 4 adds `baloo-2` to the catalogue; until then the first test fails on «La fuente baloo-2 no está en el catálogo». Run Task 4
before Step 4 here if needed, or temporarily read the first assertion only — Task 3 is complete only with the whole spec green.)

- [ ] **Step 2: Run** `cd apps/api && npx jest src/storefront-source/source-title-theme.spec.ts --maxWorkers=2` — Expected: FAIL (`titles` dropped; no variables).

- [ ] **Step 3: Implement**

`source-master.ts`:

```ts
export type MasterLook = { palette: string; fonts: string; colors: Partial<Record<MasterColour, string>>; titles?: string[] };
```

`masterLook` — after the colours loop:

```ts
  const titles = (partial.titles ?? []).filter(value => typeof value === 'string' && HEX.test(value)).map(value => value.toLowerCase()).slice(0, 4);
  return { palette, fonts, colors, ...(titles.length ? { titles } : {}) };
```

`templateLook` — return
`{ palette: after.palette, fonts: after.fonts, colors: { ...before.colors, ...(accent ? { accent } : {}) }, ...(change.titles ? { titles: after.titles } : before.titles ? { titles: before.titles } : {}) }`.

Above `masterThemeBlock`:

```ts
/** Chunky colour titles (spec 2026-11-03): four title colours (a shorter list repeats in order) and the style's font. */
const titleVars = (colours: string[]) => [0, 1, 2, 3].map(at => `--es-title-${at + 1}:${colours[at % colours.length]};`).join('');
```

`masterThemeBlock` — new last parameter `titles?: { colours?: string[]; style?: string }`; at the top
`const titleFont = isTitleStyle(titles?.style) ? TITLE_STYLES[titles!.style as TitleStyle].font : undefined;`; in `vars` before `--store-background`:

```ts
    + titleVars(titles?.colours?.length ? titles.colours : [c.accentInk, c.ink])
    + (titleFont ? `--es-title-font:'${catalogFont(titleFont).family}',var(--es-heading);` : '')
```

and add `titleFont && titleFont !== headingFont && titleFont !== bodyFont ? face(titleFont) : ''` to the returned list. Import
`{ TITLE_STYLES, isTitleStyle, type TitleStyle }` from `./source-title-style`.

`masterThemeCss(settings, look, titleStyle?: string)` passes `{ colours: look.titles, style: titleStyle }` as the last argument.

`source-templates.ts`: at ~363 move the `const variants = …` line above `const theme = …` and call
`masterThemeCss(settings, look, String((variants as Record<string, unknown>).titles ?? ''))`; at ~501 call
`masterThemeCss(settings, look!, String((builtVariants as Record<string, unknown> | undefined)?.titles ?? ''))`.

`source-templates.service.ts` (assemble, where `fill.look.colors` is set from `colours`): when `brandPalette` and `colours.paper`,
`colours.ink`, `colours.accent` are present, also set
`titles: titleColours({ paper: colours.paper, ink: colours.ink, accentInk: accentInk(colours.accent, colours.paper, colours.ink), deep: colours.deep, extras: brandPalette.extras })`
in the same `look` object.

- [ ] **Step 4: Run** the new spec — PASS; then `npx jest src/storefront-source/source-master-theme-colours.spec.ts src/storefront-source/source-master-refill.spec.ts --maxWorkers=2` — PASS
  (stores without a title style only gain four variables). Typecheck: `cd apps/api && npx tsc -p tsconfig.json --noEmit --incremental false | grep -c "error TS"` → 0.

- [ ] **Step 5: Commit** — new spec added; the three source files staged as HEAD + exact replacements.

`git commit -m "feat(titles): the look keeps up to four title colours; the theme block writes them and the chosen style's font"`

---

### Task 4: Baloo 2 in the font catalogue

**Files:**
- Create: `packages/storefront-kit/kit/fonts/baloo-2.ttf`, `packages/storefront-kit/kit/fonts/baloo-2-OFL.txt`
- Modify: `apps/api/src/storefront-source/source-font-catalog.ts` (an entry beside `fredoka`)
- Test: `apps/api/src/storefront-source/source-font-pairings.spec.ts` (append)

**Interfaces:** Produces catalogue id `baloo-2` (family `Baloo 2`, role `display`, weights `400–800`) — consumed by `TITLE_STYLES.burbuja`.

- [ ] **Step 1: Failing test** (append):

```ts
it('ships Baloo 2 for the bubbly titles (spec 2026-11-03)', () => {
  const font = SOURCE_FONT_CATALOG.find(entry => entry.id === 'baloo-2');
  expect(font).toMatchObject({ family: 'Baloo 2', role: 'display' });
  expect(require('node:fs').statSync(require('@pagosya/storefront-kit').kitPath('fonts', 'baloo-2.ttf')).size).toBeLessThan(600_000);
});
```

- [ ] **Step 2: Run** `cd apps/api && npx jest src/storefront-source/source-font-pairings.spec.ts --maxWorkers=2` — Expected: FAIL.

- [ ] **Step 3: Implement**
  - Download the OFL font and licence from Google Fonts' repository into a new empty scratch folder:
    `curl -L -o <scratch>/baloo2.ttf 'https://github.com/google/fonts/raw/main/ofl/baloo2/Baloo2%5Bwght%5D.ttf'` and
    `curl -L -o <scratch>/OFL.txt https://github.com/google/fonts/raw/main/ofl/baloo2/OFL.txt`; check `file <scratch>/baloo2.ttf` says TrueType;
    copy to `kit/fonts/baloo-2.ttf` and `kit/fonts/baloo-2-OFL.txt`. If it is over 600 kB, subset to Latin with
    `pyftsubset baloo2.ttf --unicodes="U+0000-00FF,U+0131,U+0152-0153,U+2000-206F,U+20AC" --output-file=baloo-2.ttf`.
  - Catalogue entry: `{ id: 'baloo-2', family: 'Baloo 2', role: 'display', personality: ['rounded', 'bubbly', 'playful'], weights: '400–800' },`

- [ ] **Step 4: Run** — PASS; then the font catalogue's other specs (`npx jest src/storefront-source/source-font-pairings.spec.ts --maxWorkers=2`) stay green.
- [ ] **Step 5: Commit** — `git add` the two font files and the spec; the catalogue as HEAD + replacement if `git status` shows other work in it.
  `git commit -m "feat(fonts): Baloo 2 for bubbly titles"`

---

### Task 5: Esencial draws the styles (CSS + catalogue)

**Files:**
- Modify: `packages/store-templates/templates/esencial/template.json` (`master.variants.titles`: `["normal","upper","burbuja","redonda","firme","poster"]`)
- Modify: `packages/store-templates/templates/esencial/styles/globals.css` (after the `.es[data-es-titles="upper"]` rule ~line 726, outside any lb/theme block)
- Test: `apps/api/src/storefront-source/source-unico-lively.spec.ts` (extend; `onUnico` has a `patch` on store-data's text)

**Interfaces:** Consumes `--es-title-1…4`, `--es-title-font` (Task 3). Produces classes used by Task 6: `.lb-tw` (a hero word,
`data-w="1…4"`), `.lb-swoosh` (the underline SVG inside `.lb-em`).

- [ ] **Step 1: Failing test**

```ts
it('draws a chunky title style from the theme variables (spec 2026-11-03 titles)', async () => {
  const seen = await onUnico({ width: 1280, patch: data => data.includes('"titles":') ? data.replace(/"titles":"[a-z]+"/, '"titles":"burbuja"') : data.replace('"theme":"unico"', '"theme":"unico","titles":"burbuja"') }, page => page.evaluate(() => {
    const root = document.querySelector('.es') as HTMLElement, title = document.querySelector('main h2.lb-title') as HTMLElement;
    return { attr: root.dataset.esTitles, family: getComputedStyle(title).fontFamily, line: parseFloat(getComputedStyle(title).lineHeight) / parseFloat(getComputedStyle(title).fontSize) };
  }));
  expect(seen.attr).toBe('burbuja');
  expect(seen.family.length).toBeGreaterThan(0);
  expect(seen.line).toBeLessThanOrEqual(1.06);
});
```

(The demo's theme block has no title font until Task 7 sets the preset: the stack falls back to the heading font — Review Focus 5 —
so this test pins the attribute and the line height, not the family.)

- [ ] **Step 2: Run** `cd apps/api && NODE_OPTIONS=--max-old-space-size=6144 npx jest src/storefront-source/source-unico-lively.spec.ts -t "chunky title style" --maxWorkers=2` — Expected: FAIL.

- [ ] **Step 3: Implement** — template.json list as above; CSS:

```css
/* Chunky colour titles (spec 2026-11-03): the four styles YAPI picks per product on Único. The font comes from the theme block
   (--es-title-font); a store without one falls back to its heading font. */
.es:is([data-es-titles="burbuja"],[data-es-titles="redonda"],[data-es-titles="firme"],[data-es-titles="poster"]) :is(.es-display,.es-h2,.lb-title){font-family:var(--es-title-font,var(--es-heading));line-height:1.04;letter-spacing:0;text-transform:none}
.es[data-es-titles="burbuja"] :is(.es-display,.es-h2,.lb-title){font-weight:800}
.es[data-es-titles="redonda"] :is(.es-display,.es-h2,.lb-title){font-weight:600}
.es[data-es-titles="poster"] :is(.es-display,.es-h2,.lb-title){font-weight:400;line-height:1}
.es[data-es-titles] .lb-tw[data-w="1"]{color:var(--es-title-1)}
.es[data-es-titles] .lb-tw[data-w="2"]{color:var(--es-title-2)}
.es[data-es-titles] .lb-tw[data-w="3"]{color:var(--es-title-3)}
.es[data-es-titles] .lb-tw[data-w="4"]{color:var(--es-title-4)}
.es:is([data-es-titles="burbuja"],[data-es-titles="redonda"],[data-es-titles="firme"],[data-es-titles="poster"]) .lb-title .lb-em{color:var(--es-title-1);font-style:normal;position:relative;display:inline-block}
.lb-swoosh{position:absolute;left:-2%;bottom:-.18em;width:104%;height:.32em;overflow:visible;pointer-events:none;color:var(--es-accent)}
.lb-swoosh path{fill:none;stroke:currentColor;stroke-width:5;stroke-linecap:round;stroke-dasharray:240;stroke-dashoffset:0}
@media (prefers-reduced-motion:no-preference){.lb-swoosh path{transition:stroke-dashoffset .9s cubic-bezier(.3,.7,.2,1) .2s}:not([data-in])>.lb-title .lb-swoosh path{stroke-dashoffset:240}}
.es .lb-cover--dark :is(.lb-tw,.lb-em){color:#fff}
@media (max-width:760px){.es[data-es-titles] .es-display{font-size:clamp(32px,9vw,48px)}}
/* The buy box's product name (the kit draws it) takes the chunky font when the product opens the page; no word colours there. */
.es:is([data-es-titles="burbuja"],[data-es-titles="redonda"],[data-es-titles="firme"],[data-es-titles="poster"]) [data-pagosya-product-page] :is(h1,h2):first-of-type{font-family:var(--es-title-font,var(--es-heading))}
```

(Check the kit's product title element in `packages/storefront-kit/commerce-src/product/page.js` and use its real class instead of
`:is(h1,h2):first-of-type` if it has one.)

(`data-in` is set by `<Reveal>` when its block enters the view: read `Reveal` in `@pagosya/ui` and adjust the «not yet in view» selector to
the element that actually carries `data-in`. The Único theme's `:is(.es-h2,.lb-title,.lb-head h2){…color:var(--es-ink)}` stays: section titles are ink.)

- [ ] **Step 4: Run** — PASS; `plantilla unico ` and `plantilla crocante ` contracts 5/5 each.
- [ ] **Step 5: Commit** — template.json (HEAD + replacement if `git status` shows other work), globals.css as HEAD + replacement.
  `git commit -m "feat(esencial): chunky title styles drawn from the theme's title colours and font"`

---

### Task 6: React — the hero's coloured words and the underline

**Files:**
- Modify: `packages/store-templates/templates/esencial/components/library.tsx` (new `TitleWords`; `HeroSplit`'s h1; `Head` when `level === 1`; `Marked` gains an optional swoosh)
- Test: `apps/api/src/storefront-source/source-unico-lively.spec.ts` (extend)

**Interfaces:**
- Consumes: `variants` from `./store-data` (library.tsx already imports `photos, store, layout` from there — add `variants`); `.lb-tw`,
  `.lb-swoosh` (Task 5). Mirrors `TITLE_STYLES` as `TITLE_COLOURS = { burbuja: 4, redonda: 2, firme: 2, poster: 3 }` and
  `UNDERLINE = new Set(['burbuja', 'redonda'])` (the template cannot import from the API).
- Produces: `export function TitleWords({ text }: { text: string })`; `Marked({ text, swoosh })`.

- [ ] **Step 1: Failing tests**

```ts
const contrast = (a: string, b: string) => { const lum = (c: string) => { const [r, g, bl] = c.match(/\d+/g)!.slice(0, 3).map(Number).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }); return .2126 * r + .7152 * g + .0722 * bl; }; const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + .05) / (y + .05); };
const burbuja = (data: string) => data.includes('"titles":') ? data.replace(/"titles":"[a-z]+"/, '"titles":"burbuja"') : data.replace('"theme":"unico"', '"theme":"unico","titles":"burbuja"');
it('colours the hero word by word, one coloured word per section title, readable (spec 2026-11-03 titles)', async () => {
  const seen = await onUnico({ width: 1280, patch: burbuja }, page => page.evaluate(() => {
    const paper = getComputedStyle(document.body).backgroundColor;
    const words = Array.from(document.querySelectorAll('.lb-hero-split .lb-title .lb-tw')).map(el => getComputedStyle(el).color);
    const sections = Array.from(document.querySelectorAll('main section.es-section h2.lb-title')).map(el => el.querySelectorAll('.lb-em').length);
    return { paper, words, sections, swoosh: !!document.querySelector('.lb-hero-split .lb-swoosh') };
  }));
  expect(new Set(seen.words).size).toBeGreaterThanOrEqual(2);
  for (const colour of seen.words) expect(contrast(colour, seen.paper)).toBeGreaterThanOrEqual(3);
  for (const count of seen.sections) expect(count).toBeLessThanOrEqual(1);
  expect(seen.swoosh).toBe(true);
});
it('draws no underline for a hero with no marked word (Review Focus 1)', async () => {
  const seen = await onUnico({ width: 1280, patch: data => burbuja(data).replace(/("type":"hero-split"[^}]*?"title":")([^"]*)"/, (_m, head, title) => `${head}${title.replace(/\*/g, '')}"`) }, page => page.evaluate(() => ({
    words: document.querySelectorAll('.lb-hero-split .lb-tw').length, swoosh: document.querySelectorAll('.lb-hero-split .lb-swoosh').length,
  })));
  expect(seen.words).toBeGreaterThan(1);
  expect(seen.swoosh).toBe(0);
});
it('wraps a 70-character chunky hero at 390 with no sideways scroll', async () => {
  const scroll = await onUnico({ width: 390, patch: data => burbuja(data).replace(/"type":"hero-split",("eyebrow":"[^"]*",)?"title":"[^"]*"/, '"type":"hero-split","title":"El sofá cama que llega comprimido en una caja y se infla en tu sala"') }, page => page.evaluate(() => document.documentElement.scrollWidth));
  expect(scroll).toBe(390);
});
```

- [ ] **Step 2: Run** `-t "word by word|no underline|70-character chunky"` — Expected: FAIL (no `.lb-tw`).

- [ ] **Step 3: Implement** in library.tsx:

```tsx
const TITLE_COLOURS: Record<string, number> = { burbuja: 4, redonda: 2, firme: 2, poster: 3 };
const UNDERLINE = new Set(['burbuja', 'redonda']);
const titleStyle = () => String((variants as Record<string, unknown>).titles ?? 'normal');
const Swoosh = () => <svg className="lb-swoosh" viewBox="0 0 200 20" preserveAspectRatio="none" aria-hidden="true"><path d="M3 14 C 50 4, 120 4, 197 10" /></svg>;

/** Chunky colour titles (spec 2026-11-03): the opening headline word by word in the store's title colours; the *marked* word gets the
 *  hand-drawn underline (styles with one). Normal titles are unchanged. */
export function TitleWords({ text }: { text: string }) {
  const style = titleStyle(), count = TITLE_COLOURS[style];
  if (!count) return <Marked text={text} />;
  let at = 0;
  return <>{text.split('*').map((part, segment) => part.split(/(\s+)/).map((word, n) => {
    if (!word.trim()) return word;
    const w = (at++ % count) + 1;
    return segment % 2
      ? <em key={`${segment}-${n}`} className="lb-em lb-tw" data-w={w}>{word}{UNDERLINE.has(style) ? <Swoosh /> : null}</em>
      : <span key={`${segment}-${n}`} className="lb-tw" data-w={w}>{word}</span>;
  }))}</>;
}
```

`Marked` becomes `Marked({ text, swoosh = false }: { text: string; swoosh?: boolean })` and renders
`<em key={at} className="lb-em">{part}{swoosh && UNDERLINE.has(titleStyle()) ? <Swoosh /> : null}</em>`. `HeroSplit`'s h1 uses
`<TitleWords text={block.title} />`; `Head` uses `<TitleWords text={block.title} />` when `level === 1`, otherwise
`<Marked text={block.title} swoosh={index % 2 === 0} />`.

- [ ] **Step 4: Run** the three tests + the whole Único spec — PASS. Then `pnpm --filter @pagosya/merchant-dashboard run build:studio`.
- [ ] **Step 5: Commit** — library.tsx (HEAD + replacement if `git status` shows other work); spec.
  `git commit -m "feat(titles): the hero headline in coloured words with a hand-drawn underline; section titles one coloured word"`

---

### Task 7: YAPI picks the style; Único starts rounded

**Files:**
- Modify: `apps/api/src/storefront-source/source-section-library.ts` (answer schema ~130: `titleStyle`; prompt line after the `mood` line ~150)
- Modify: `apps/api/src/storefront-source/source-chat.service.ts` (~790: save `titles` with `mood` on Único)
- Modify: `packages/store-templates/templates/unico/template.json` (`preset.variants.titles: "redonda"`)
- Test: `apps/api/src/storefront-source/source-section-library-lively.spec.ts` (extend)

**Interfaces:** Consumes `libraryTitleStyle` (Task 1), `isPlayfulBusiness` (home-directions.ts).

- [ ] **Step 1: Failing test** — read how the existing «asks for a mood and reads it» test builds the schema in that spec and add, the same way:

```ts
it('asks YAPI for a title style beside the mood (spec 2026-11-03 titles)', () => {
  const schema = libraryAnswerSchema() as unknown as { required: string[]; properties: Record<string, { enum?: string[] }> };
  expect(schema.required).toContain('titleStyle');
  expect(schema.properties.titleStyle.enum).toEqual(['burbuja', 'redonda', 'firme', 'poster']);
});
```

- [ ] **Step 2: Run** `cd apps/api && npx jest src/storefront-source/source-section-library-lively.spec.ts --maxWorkers=2` — Expected: FAIL.
- [ ] **Step 3: Implement**
  - schema: `required: ['blocks', 'mood', 'titleStyle']`, `titleStyle: { type: 'string', enum: ['burbuja', 'redonda', 'firme', 'poster'] }`.
  - prompt line after the mood line: `- titleStyle: el estilo de los títulos según el producto: «burbuja» (juguetes, mascotas, dulces, snacks, fiestas, niños), «redonda» (casa, muebles, cocina, ropa de cama), «firme» (tecnología, belleza, herramientas), «poster» (deportes, bebidas, ropa urbana). Fuera de la plantilla Único no cambia nada.`
  - save (~790):
    ```ts
    const titles = theme === 'unico' ? libraryTitleStyle(answer as never, isPlayfulBusiness([facts.what, facts.request, ...facts.products.map(product => `${product.name} ${product.about ?? ''}`)].join('\n'))) : undefined;
    ```
    and pass `...(mood ? { variants: { mood, ...(titles ? { titles } : {}) } } : {})`.
  - unico template.json: `"titles": "redonda"` in `preset.variants` (Python `json.load` / `json.dumps(indent=2, ensure_ascii=False) + '\n'`; it round-trips byte-identical).
- [ ] **Step 4: Run** the library spec, the Único spec and `plantilla unico ` contract — PASS (the Único render now carries Fredoka for titles).
- [ ] **Step 5: Commit** — library.ts and chat.service as HEAD + replacements; template.json; spec.
  `git commit -m "feat(titles): YAPI picks the title style for the product; Único starts rounded"`

---

### Task 8: «títulos más tranquilos / más divertidos / cambia los títulos»

**Files:**
- Modify: `apps/api/src/storefront-source/source-chat.service.ts` (beside the mood ask ~1247: the title ask; `titleEdit` beside `moodEdit` ~1058)
- Test: the spec that drives `moodEdit` through `send` — find it with `grep -ln "Más colorida" apps/api/src/storefront-source/*.spec.ts`; add the title case there with the same harness.

**Interfaces:** Consumes `readTitleAsk`, `nextTitleStyle` (Task 1); `storeTheme`, `templates.refill`, `readMasterState` (existing).

- [ ] **Step 1: Failing test** — in that spec, copy the mood routing case and change it: on a Único store whose saved variants have
`titles: 'redonda'`, `send` with «títulos más tranquilos» calls `templates.refill(…, { variants: { titles: 'firme' } }, 'Títulos más tranquilos')`
and replies «Listo: tus títulos ahora son más tranquilos. Revisa la vista previa.»; a second case sends «un título más divertido y cambia el precio»
and asserts `refill` was NOT called with a `titles` variant.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** — before the mood ask:

```ts
      const titleAsk = readTitleAsk(input.instruction);
      if (titleAsk && await this.storeTheme(merchantId, storeId, current.revision) === 'unico') return await this.titleEdit(merchantId, storeId, thread.id, userMessage, workflow, current.revision, titleAsk);
```

and beside `moodEdit`:

```ts
  /** Chunky colour titles (spec 2026-11-03): the title style one step calmer, livelier or another one; saved as variants.titles. */
  private async titleEdit(merchantId: string, storeId: string, threadId: string, userMessage: StoreAgentMessage, workflow: ReturnType<typeof createSourceProgress>, revision: number, ask: 'calmer' | 'livelier' | 'other') {
    const snapshot = (await this.projects.version(merchantId, storeId, revision)).snapshot as unknown as SourceProjectSnapshot;
    const current = String((readMasterState(snapshot.files).variants as Record<string, unknown> | undefined)?.titles ?? '');
    const titles = nextTitleStyle(current, ask);
    await workflow.report('saving');
    const label = ask === 'calmer' ? 'Títulos más tranquilos' : ask === 'livelier' ? 'Títulos más divertidos' : 'Otros títulos';
    const saved = await this.templates.refill(merchantId, storeId, revision, { variants: { titles } }, label);
    await workflow.finish('completed');
    const content = ask === 'calmer' ? 'Listo: tus títulos ahora son más tranquilos. Revisa la vista previa.'
      : ask === 'livelier' ? 'Listo: tus títulos ahora tienen más color y más juego. Revisa la vista previa.' : 'Listo: cambié el estilo de tus títulos. Revisa la vista previa.';
    const assistantMessage = await this.prisma.storeAgentMessage.create({ data: { threadId, channel: 'source', role: 'ASSISTANT', content, metadata: { progress: workflow.value, sourceRevision: saved.revision, label: saved.label } } });
    return { userMessage, assistantMessage, revision: saved };
  }
```

(Task 3 made refill compute `variants` before the theme, so the saved globals.css carries the new style's `url(assets/<font>.ttf)`.)
- [ ] **Step 4: Run** — PASS. **Step 5: Commit** (chat.service as HEAD + replacements; spec) — `git commit -m "feat(titles): calmer, livelier or other titles from the chat"`

---

### Task 9: Full checks and the live stores

- [ ] **Step 1:** `pnpm --filter @pagosya/merchant-dashboard run build:studio`; contracts `-t "plantilla (unico|crocante|despensa) "` (with
  `NODE_OPTIONS=--max-old-space-size=6144`); the title-style, palette, title-theme, font-pairings, Único and library specs (named, `--maxWorkers=2`); API typecheck 0 errors.
- [ ] **Step 2:** live (stack on `pnpm dev:chatgpt`; no running jobs before API edits): a fresh sofa store from the `sofa` catalogue in
  `apps/api/scripts/create-full-store-demo.ts` (`npx ts-node --transpile-only scripts/create-full-store-demo.ts sofa titles`, then
  `node examples/full-stores-2026-11-02/send.cjs sofa-titles --first` after copying `sofa/first.txt` into `sofa-titles/`) → expect `redonda`, two
  title colours; one playful store (a toy or pet catalogue) → `burbuja`, 3–4 colours. Screenshots at 1280 and 390 (Studio «Ver en navegador»
  shows kit photos; the sandbox blocks them) next to flux-paws.myshopify.com; try «títulos más tranquilos» on the playful one.
- [ ] **Step 3:** report to the owner with the screenshots and anything that does not match the spec.
