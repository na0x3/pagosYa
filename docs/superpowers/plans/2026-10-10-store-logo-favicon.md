# Store Logo and Favicon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every store shows its own favicon (from its uploaded logo, else a letter mark drawn in its own display font and colours). Merchants can add a logo when creating a store, and YAPI always uses a saved logo on new stores and redesigns.

**Architecture:** A pure drawing function turns text into SVG outlines with `fontkit`, using the store's own design (display font from `design-direction.json`, colours from its CSS). `sharp` rasterizes either the uploaded logo or the drawn mark into PNG favicons, served by two new public routes beside the store-SEO module, cached in memory and by ETag. The shared store `<head>` links the icon. The checkout app swaps the platform icon for the store's, and keeps it on in-page navigation. Generation adds the saved logo to the run's assets. The dashboard's create dialog gains an optional logo upload.

**Tech Stack:** NestJS 10 + Prisma (apps/api, Jest specs next to sources), `fontkit` 2.0.4, `sharp`, Vite/vitest (apps/checkout, jsdom), node:test (apps/checkout/server-test, apps/merchant-dashboard/unit).

**Spec:** `docs/superpowers/specs/2026-10-10-store-logo-favicon-design.md`

## Global Constraints

- Favicon sizes: `32 | 180 | 192 | 512`; anything else serves 32.
- Default font id `bricolage` (Bricolage Grotesque); default colours `#111111` ink on `#ffffff` ground.
- Responses: `Cache-Control: public, max-age=3600` plus an `ETag` from (store id, `logoUrl`, published source revision, kind, size); `If-None-Match` hit returns 304.
- In-memory cache capped at 500 entries.
- Drawn SVG uses only `svg`, `rect` and `path`, with attributes from `MOTIF_SVG_ATTRIBUTES` (plus the `xmlns` declaration).
- Logos accepted for favicons: `/v1/uploads/<hex-uuid>.(png|jpe?g|webp|gif)`. Anything else falls through to the drawn mark.
- A favicon request never fails because of a design, a font or a logo: only an unknown slug returns 404.
- Generation change applies only to new stores (`dto.revision === 0`) and redesigns (`execution.redesign === true` or `sourceRedesignRequested(instruction)`, never candidates). Local edits are unchanged.
- Never run `prisma migrate|diff|reset|push` (no schema change in this plan). Merchant-facing copy is Spanish.

## Review Focus

- **Store with a published Next source whose CSS uses `color-mix()` or variables for its tokens:** the favicon still renders, in default colours. Pinned in Task 2.
- **Store names with one letter, emoji or only spaces:** the mark draws something, the `?` fallback for blank names. Pinned in Task 1 and Task 3.
- **A logo file that exists in `logoUrl` but is corrupt or missing from storage:** the favicon falls through to the drawn mark, no 500. Pinned in Task 3 and Task 4.
- **The pagosYa icon on checkout pages that aren't store pages:** unchanged, because icons are only replaced when the store head carries one. Pinned in Task 5.
- **A merchant's saved `logoUrl` that isn't one of their media assets** (seeded or imported stores): generation skips it instead of failing with "Un archivo no pertenece a este comercio". Pinned in Task 6.

---

### Task 1: Draw text as SVG outlines (`typographicLogo`)

**Files:**
- Modify: `apps/api/package.json` (add `"fontkit": "2.0.4"` to dependencies)
- Create: `apps/api/src/store-seo/fontkit.d.ts`
- Create: `apps/api/src/store-seo/typographic-logo.ts`
- Test: `apps/api/src/store-seo/typographic-logo.spec.ts`

**Interfaces:**
- Produces: `typographicLogo(input: TypographicLogoInput): string` (throws when there's nothing to draw or the font can't be read), `type LogoMode = 'wordmark' | 'mark'`, `type TypographicLogoInput = { name: string; fontPath: string; ink: string; ground: string; mode: LogoMode; upper?: boolean }`, `LOGO_INK = '#111111'`, `LOGO_GROUND = '#ffffff'`, `safeHex(value: string, fallback: string): string`.

- [ ] **Step 1: Add the dependency**

```bash
cd /Users/saramia/pagosYa && pnpm --filter @pagosya/api add fontkit@2.0.4
cd apps/api && node -e "console.log(typeof require('fontkit').openSync)"
```
Expected: `function`. (fontkit 2.0.4 is already in the lockfile, so nothing new downloads.)

- [ ] **Step 2: Declare the module for TypeScript**

`apps/api/src/store-seo/fontkit.d.ts`:
```ts
// fontkit ships no types; only openSync is used, and its results are read defensively.
declare module 'fontkit' {
  export function openSync(path: string): any;
}
```

- [ ] **Step 3: Write the failing test**

`apps/api/src/store-seo/typographic-logo.spec.ts`:
```ts
import { kitPath } from '@pagosya/storefront-kit';
import { MOTIF_SVG_ATTRIBUTES } from '../storefront-source/source-svg-sanitize';
import { typographicLogo } from './typographic-logo';

const font = kitPath('fonts', 'bricolage.ttf');
const tags = (svg: string) => [...svg.matchAll(/<([a-zA-Z]+)\b([^>]*)>/g)].map(match => ({ name: match[1], attrs: [...match[2].matchAll(/([\w:-]+)="/g)].map(attr => attr[1]) }));

describe('typographicLogo', () => {
  it('draws a wordmark from outlines only, inside the sanitizer allow-lists', () => {
    const svg = typographicLogo({ name: 'Estudio Eje', fontPath: font, ink: '#1e297a', ground: '#f4efe4', mode: 'wordmark' });
    expect(svg).not.toContain('<text');
    for (const tag of tags(svg)) {
      expect(['svg', 'rect', 'path']).toContain(tag.name);
      for (const attr of tag.attrs) if (attr !== 'xmlns') expect(MOTIF_SVG_ATTRIBUTES as readonly string[]).toContain(attr);
    }
    expect(svg).toContain('fill="#1e297a"');
    expect(svg).not.toContain('<rect');
  });
  it('draws a square mark of the first letter on the ground colour', () => {
    const svg = typographicLogo({ name: 'pilts', fontPath: font, ink: '#ffffff', ground: '#0b3d2e', mode: 'mark' });
    expect(svg).toMatch(/viewBox="0 0 100 100"/);
    expect(svg).toContain('<rect width="100" height="100" fill="#0b3d2e"/>');
    expect(svg.match(/<path /g)).toHaveLength(1);
  });
  it('uppercases only when the design asks for it', () => {
    const lower = typographicLogo({ name: 'pilts', fontPath: font, ink: '#000000', ground: '#ffffff', mode: 'mark' });
    const upper = typographicLogo({ name: 'pilts', fontPath: font, ink: '#000000', ground: '#ffffff', mode: 'mark', upper: true });
    expect(upper).not.toBe(lower);
  });
  it('replaces colours that are not plain hex, so nothing but a colour reaches an attribute', () => {
    const svg = typographicLogo({ name: 'A', fontPath: font, ink: 'red" onload="x', ground: 'var(--x)', mode: 'mark' });
    expect(svg).toContain('fill="#111111"');
    expect(svg).toContain('fill="#ffffff"');
    expect(svg).not.toContain('onload');
  });
  it('throws when there is nothing to draw or no font', () => {
    expect(() => typographicLogo({ name: '   ', fontPath: font, ink: '#000000', ground: '#ffffff', mode: 'wordmark' })).toThrow();
    expect(() => typographicLogo({ name: 'A', fontPath: '/nope/missing.ttf', ink: '#000000', ground: '#ffffff', mode: 'mark' })).toThrow();
  });
});
```

- [ ] **Step 4: Run it to see it fail**

Run: `cd apps/api && npx jest src/store-seo/typographic-logo.spec.ts`
Expected: FAIL, "Cannot find module './typographic-logo'".

- [ ] **Step 5: Implement**

`apps/api/src/store-seo/typographic-logo.ts`:
```ts
import * as fontkit from 'fontkit';

/** A store name drawn as outlines: no font is needed to display it, and it holds only allow-listed SVG. */
export type LogoMode = 'wordmark' | 'mark';
export type TypographicLogoInput = { name: string; fontPath: string; ink: string; ground: string; mode: LogoMode; upper?: boolean };

export const LOGO_INK = '#111111';
export const LOGO_GROUND = '#ffffff';
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const MARK_BOX = 100;
const MARK_FILL = 0.64;
const WORDMARK_HEIGHT = 100;
const WORDMARK_PAD = 8;
const fonts = new Map<string, any>();

export const safeHex = (value: string, fallback: string) => HEX.test(value) ? value : fallback;
const round = (value: number) => Math.round(value * 100) / 100;

function openFont(path: string) {
  let font = fonts.get(path);
  if (!font) {
    font = fontkit.openSync(path);
    // Variable fonts open at their default instance, usually a light weight; a logo reads better bold.
    const weight = font.variationAxes?.wght;
    if (weight) font = font.getVariation({ wght: Math.min(Math.max(700, weight.min), weight.max) });
    fonts.set(path, font);
  }
  return font;
}

export function typographicLogo(input: TypographicLogoInput): string {
  const name = input.name.trim();
  const base = input.mode === 'mark' ? (Array.from(name)[0] ?? '') : name;
  const text = input.upper ? base.toLocaleUpperCase('es') : base;
  if (!text) throw new Error('Nothing to draw');
  const font = openFont(input.fontPath);
  const run = font.layout(text);
  const box = run.bbox;
  if (!(box.maxX > box.minX && box.maxY > box.minY)) throw new Error('Text has no outline');
  const ink = safeHex(input.ink, LOGO_INK);
  const ground = safeHex(input.ground, LOGO_GROUND);
  const width = box.maxX - box.minX;
  const height = box.maxY - box.minY;
  const mark = input.mode === 'mark';
  const scale = mark ? (MARK_BOX * MARK_FILL) / Math.max(width, height) : (WORDMARK_HEIGHT - 2 * WORDMARK_PAD) / height;
  const viewWidth = mark ? MARK_BOX : width * scale + 2 * WORDMARK_PAD;
  const viewHeight = mark ? MARK_BOX : WORDMARK_HEIGHT;
  const left = mark ? (MARK_BOX - width * scale) / 2 : WORDMARK_PAD;
  const top = mark ? (MARK_BOX - height * scale) / 2 : WORDMARK_PAD;
  // Font units are y-up; flip them and place the run's box at (left, top).
  const tx = left - box.minX * scale;
  const ty = top + box.maxY * scale;
  let pen = 0;
  const d: string[] = [];
  run.glyphs.forEach((glyph: any, index: number) => {
    const position = run.positions[index];
    d.push(glyph.path.scale(scale, -scale).translate(tx + (pen + position.xOffset) * scale, ty - position.yOffset * scale).toSVG());
    pen += position.xAdvance;
  });
  const rect = mark ? `<rect width="${MARK_BOX}" height="${MARK_BOX}" fill="${ground}"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${round(viewWidth)} ${round(viewHeight)}" width="${round(viewWidth)}" height="${round(viewHeight)}">${rect}<path fill="${ink}" d="${d.join('')}"/></svg>`;
}
```

- [ ] **Step 6: Run the tests**

Run: `cd apps/api && npx jest src/store-seo/typographic-logo.spec.ts`
Expected: 5 passed.

- [ ] **Step 7: Commit**

```bash
cd /Users/saramia/pagosYa && git add apps/api/package.json pnpm-lock.yaml apps/api/src/store-seo/fontkit.d.ts apps/api/src/store-seo/typographic-logo.ts apps/api/src/store-seo/typographic-logo.spec.ts
git commit -m "feat(store-seo): draw a store name as SVG outlines in its own font, a wordmark or a square letter mark"
```

---

### Task 2: Read a store's identity from its saved design (`storeIdentity`)

**Files:**
- Create: `apps/api/src/store-seo/store-identity.ts`
- Test: `apps/api/src/store-seo/store-identity.spec.ts`

**Interfaces:**
- Consumes: `LOGO_INK`, `LOGO_GROUND` (Task 1); `SOURCE_DESIGN_FILE` (`../storefront-source/source-design`); `SOURCE_FONT_CATALOG` (`../storefront-source/source-font-catalog`).
- Produces: `type StoreIdentity = { fontId: string; upper: boolean; ink: string; ground: string }`, `DEFAULT_LOGO_FONT = 'bricolage'`, `DEFAULT_IDENTITY: StoreIdentity`, `storeIdentity(files: Array<{ path: string; content: string; encoding?: string }>): StoreIdentity`.

- [ ] **Step 1: Write the failing test**

`apps/api/src/store-seo/store-identity.spec.ts`:
```ts
import { DEFAULT_IDENTITY, storeIdentity } from './store-identity';

const design = (display: string, kase = 'none') => ({ path: 'design-direction.json', content: JSON.stringify({ selected: 1, concepts: [{ dna: { type: { display: 'fraunces', case: 'none' } } }, { dna: { type: { display, case: kase } } }] }) });

describe('storeIdentity', () => {
  it('takes the selected concept display font and case, and the hex colour tokens', () => {
    const identity = storeIdentity([design('instrument-serif', 'upper'), { path: 'styles/globals.css', content: ':root{--store-background:#F4EFE4;--store-foreground: #1e297a;}' }]);
    expect(identity).toEqual({ fontId: 'instrument-serif', upper: true, ink: '#1e297a', ground: '#F4EFE4' });
  });
  it('ignores colour tokens written as color-mix or variables, and unknown fonts', () => {
    const identity = storeIdentity([design('comic-sans'), { path: 'styles.css', content: ':root{--store-foreground:color-mix(in srgb, red 50%, blue);--store-background:var(--paper)}' }]);
    expect(identity).toEqual(DEFAULT_IDENTITY);
  });
  it('falls back to the defaults with no files, a broken design file, or base64 css', () => {
    expect(storeIdentity([])).toEqual(DEFAULT_IDENTITY);
    expect(storeIdentity([{ path: 'design-direction.json', content: '{' }])).toEqual(DEFAULT_IDENTITY);
    expect(storeIdentity([{ path: 'x.css', content: Buffer.from(':root{--store-foreground:#123456}').toString('base64'), encoding: 'base64' }])).toEqual(DEFAULT_IDENTITY);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd apps/api && npx jest src/store-seo/store-identity.spec.ts`
Expected: FAIL, "Cannot find module './store-identity'".

- [ ] **Step 3: Implement**

`apps/api/src/store-seo/store-identity.ts`:
```ts
import { SOURCE_DESIGN_FILE } from '../storefront-source/source-design';
import { SOURCE_FONT_CATALOG } from '../storefront-source/source-font-catalog';
import { LOGO_GROUND, LOGO_INK } from './typographic-logo';

/** What a drawn logo needs from a saved store design. Read-only; every miss is a default, never an error. */
export type StoreIdentity = { fontId: string; upper: boolean; ink: string; ground: string };
export const DEFAULT_LOGO_FONT = 'bricolage';
export const DEFAULT_IDENTITY: StoreIdentity = { fontId: DEFAULT_LOGO_FONT, upper: false, ink: LOGO_INK, ground: LOGO_GROUND };
const FONT_IDS = new Set<string>(SOURCE_FONT_CATALOG.map(font => font.id));

const hexToken = (css: string, name: string) => css.match(new RegExp(`--${name}\\s*:\\s*(#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3}))\\s*[;}]`, 'i'))?.[1];

export function storeIdentity(files: Array<{ path: string; content: string; encoding?: string }>): StoreIdentity {
  let fontId = DEFAULT_LOGO_FONT;
  let upper = false;
  try {
    const design = JSON.parse(files.find(file => file.path === SOURCE_DESIGN_FILE)?.content ?? 'null');
    const type = design?.concepts?.[design.selected]?.dna?.type;
    if (typeof type?.display === 'string' && FONT_IDS.has(type.display)) fontId = type.display;
    upper = type?.case === 'upper';
  } catch { /* a broken design file keeps the defaults */ }
  const css = files.filter(file => file.path.endsWith('.css') && file.encoding !== 'base64').map(file => file.content).join('\n');
  return { fontId, upper, ink: hexToken(css, 'store-foreground') ?? LOGO_INK, ground: hexToken(css, 'store-background') ?? LOGO_GROUND };
}
```

- [ ] **Step 4: Run the tests**

Run: `cd apps/api && npx jest src/store-seo/store-identity.spec.ts`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
cd /Users/saramia/pagosYa && git add apps/api/src/store-seo/store-identity.ts apps/api/src/store-seo/store-identity.spec.ts
git commit -m "feat(store-seo): read a store's display font, case and colours from its saved design for its logo"
```

---

### Task 3: Render favicons and the wordmark with fallbacks

**Files:**
- Create: `apps/api/src/store-seo/store-favicon.ts`
- Test: `apps/api/src/store-seo/store-favicon.spec.ts`

**Interfaces:**
- Consumes: `typographicLogo` (Task 1); `StoreIdentity`, `DEFAULT_IDENTITY` (Task 2); `kitPath` from `@pagosya/storefront-kit`.
- Produces: `FAVICON_SIZES = [32, 180, 192, 512] as const`, `faviconSize(raw: unknown): number`, `markSvg(name: string, identity: StoreIdentity): string`, `wordmarkSvg(name: string, identity: StoreIdentity): string`, `faviconPng(input: { logo: Buffer | null; name: string; identity: StoreIdentity; size: number }): Promise<Buffer>`.

- [ ] **Step 1: Write the failing test**

`apps/api/src/store-seo/store-favicon.spec.ts`:
```ts
import sharp from 'sharp';
import { DEFAULT_IDENTITY } from './store-identity';
import { faviconPng, faviconSize, markSvg, wordmarkSvg } from './store-favicon';

const identity = { fontId: 'instrument-serif', upper: false, ink: '#ffffff', ground: '#0b3d2e' };
const pixel = async (png: Buffer, x: number, y: number) => { const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true }); const i = (y * info.width + x) * info.channels; return [data[i], data[i + 1], data[i + 2]]; };

describe('store favicon', () => {
  it('accepts only the published sizes', () => {
    expect([faviconSize('180'), faviconSize(512), faviconSize('33'), faviconSize(undefined), faviconSize('x')]).toEqual([180, 512, 32, 32, 32]);
  });
  it('fits an uploaded logo into a square on the ground colour', async () => {
    const wide = await sharp({ create: { width: 300, height: 100, channels: 4, background: '#ff0000' } }).png().toBuffer();
    const png = await faviconPng({ logo: wide, name: 'Eje', identity, size: 180 });
    const meta = await sharp(png).metadata();
    expect([meta.width, meta.height, meta.format]).toEqual([180, 180, 'png']);
    expect(await pixel(png, 90, 5)).toEqual([0x0b, 0x3d, 0x2e]);
    expect(await pixel(png, 90, 90)).toEqual([255, 0, 0]);
  });
  it('draws the letter mark when there is no logo or the logo is corrupt', async () => {
    for (const logo of [null, Buffer.from('not an image')]) {
      const png = await faviconPng({ logo, name: 'Estudio Eje', identity, size: 32 });
      expect((await sharp(png).metadata()).width).toBe(32);
      expect(await pixel(png, 1, 1)).toEqual([0x0b, 0x3d, 0x2e]);
    }
  });
  it('falls back to the default font when the design font cannot draw, and to "?" for a blank name', () => {
    expect(markSvg('Eje', { ...identity, fontId: 'missing-font' })).toContain('fill="#0b3d2e"');
    expect(markSvg('   ', DEFAULT_IDENTITY)).toContain('<path');
    expect(wordmarkSvg('   ', DEFAULT_IDENTITY)).toContain('<path');
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd apps/api && npx jest src/store-seo/store-favicon.spec.ts`
Expected: FAIL, "Cannot find module './store-favicon'".

- [ ] **Step 3: Implement**

`apps/api/src/store-seo/store-favicon.ts`:
```ts
import sharp from 'sharp';
import { kitPath } from '@pagosya/storefront-kit';
import { DEFAULT_IDENTITY, type StoreIdentity } from './store-identity';
import { typographicLogo, type LogoMode } from './typographic-logo';

export const FAVICON_SIZES = [32, 180, 192, 512] as const;
export const faviconSize = (raw: unknown) => { const size = Number(raw); return (FAVICON_SIZES as readonly number[]).includes(size) ? size : 32; };
const fontFile = (id: string) => kitPath('fonts', `${id}.ttf`);

/** The store's own font first, then the default font in the store's colours, then a blank square: drawing never throws. */
function drawn(name: string, identity: StoreIdentity, mode: LogoMode): string {
  const text = name.trim() || '?';
  try { return typographicLogo({ name: text, fontPath: fontFile(identity.fontId), ink: identity.ink, ground: identity.ground, mode, upper: identity.upper }); } catch { /* next */ }
  try { return typographicLogo({ name: text, fontPath: fontFile(DEFAULT_IDENTITY.fontId), ink: identity.ink, ground: identity.ground, mode }); } catch { /* next */ }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100"><rect width="100" height="100" fill="${DEFAULT_IDENTITY.ground}"/></svg>`;
}
export const markSvg = (name: string, identity: StoreIdentity) => drawn(name, identity, 'mark');
export const wordmarkSvg = (name: string, identity: StoreIdentity) => drawn(name, identity, 'wordmark');

export async function faviconPng(input: { logo: Buffer | null; name: string; identity: StoreIdentity; size: number }): Promise<Buffer> {
  if (input.logo) {
    try {
      return await sharp(input.logo, { animated: false }).resize(input.size, input.size, { fit: 'contain', background: input.identity.ground }).flatten({ background: input.identity.ground }).png().toBuffer();
    } catch { /* a logo that will not decode falls through to the drawn mark */ }
  }
  return sharp(Buffer.from(markSvg(input.name, input.identity))).resize(input.size, input.size).png().toBuffer();
}
```

- [ ] **Step 4: Run the tests**

Run: `cd apps/api && npx jest src/store-seo/store-favicon.spec.ts`
Expected: 4 passed. If the uploaded-logo pixel at (90, 90) is off by a rounding step, compare each channel within ±2 rather than changing the implementation.

- [ ] **Step 5: Commit**

```bash
cd /Users/saramia/pagosYa && git add apps/api/src/store-seo/store-favicon.ts apps/api/src/store-seo/store-favicon.spec.ts
git commit -m "feat(store-seo): favicons from the uploaded logo, else the drawn letter mark, never failing"
```

---

### Task 4: Public favicon and logo routes, and the icon in every store head

**Files:**
- Create: `apps/api/src/store-seo/store-favicon.service.ts`
- Create: `apps/api/src/store-seo/store-favicon.controller.ts`
- Modify: `apps/api/src/store-seo/store-seo.module.ts`
- Modify: `apps/api/src/store-seo/store-seo.ts:28` (`seoHead`)
- Modify: `apps/api/src/store-seo/store-seo.service.ts:55-73` (`document`)
- Test: `apps/api/src/store-seo/store-favicon.service.spec.ts`, `apps/api/src/store-seo/store-seo.spec.ts`

**Interfaces:**
- Consumes: `faviconPng`, `wordmarkSvg`, `faviconSize` (Task 3); `storeIdentity`, `DEFAULT_IDENTITY` (Task 2); `UploadsService.getBuffer(filename: string): Promise<Buffer | null>`; `PUBLIC_STORE_WHERE` (`../stores/active-store`); `SOURCE_DESIGN_FILE`.
- Produces: `StoreFaviconService.favicon(slug: string, size: number): Promise<{ body: Buffer; etag: string }>`, `StoreFaviconService.logoSvg(slug: string): Promise<{ body: Buffer; etag: string }>`, routes `GET /v1/stores/public/:slug/favicon.png?size=` and `GET /v1/stores/public/:slug/logo.svg`, `seoHead` input `icon?: string`.

- [ ] **Step 1: Write the failing service test**

`apps/api/src/store-seo/store-favicon.service.spec.ts`:
```ts
import { NotFoundException } from '@nestjs/common';
import sharp from 'sharp';
import { StoreFaviconService } from './store-favicon.service';

const store = { id: 's1', name: 'Estudio Eje', logoUrl: null as string | null, publishedSourceRevision: 3 as number | null };
function service(overrides: { store?: typeof store | null; files?: Array<{ path: string; content: string }>; logo?: Buffer | null | Error } = {}) {
  const prisma = {
    store: { findFirst: jest.fn(async () => overrides.store === undefined ? store : overrides.store) },
    $queryRaw: jest.fn(async () => overrides.files ?? [{ path: 'styles/globals.css', content: ':root{--store-background:#0b3d2e;--store-foreground:#ffffff}' }]),
  };
  const uploads = { getBuffer: jest.fn(async () => { if (overrides.logo instanceof Error) throw overrides.logo; return overrides.logo ?? null; }) };
  return { favicons: new StoreFaviconService(prisma as any, uploads as any), prisma, uploads };
}

describe('StoreFaviconService', () => {
  it('404s an unknown store', async () => {
    await expect(service({ store: null }).favicons.favicon('nope', 32)).rejects.toBeInstanceOf(NotFoundException);
  });
  it('draws the mark in the published colours and caches it by store, logo, revision and size', async () => {
    const { favicons, prisma } = service();
    const first = await favicons.favicon('eje', 32);
    const again = await favicons.favicon('eje', 32);
    expect(again.etag).toBe(first.etag);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    const { data } = await sharp(first.body).raw().toBuffer({ resolveWithObject: true });
    expect([data[0], data[1], data[2]]).toEqual([0x0b, 0x3d, 0x2e]);
    expect((await favicons.favicon('eje', 180)).etag).not.toBe(first.etag);
  });
  it('uses the uploaded logo, and falls back to the mark when storage fails', async () => {
    const red = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#ff0000' } }).png().toBuffer();
    const withLogo = service({ store: { ...store, logoUrl: '/v1/uploads/0a1b2c3d-0000-4000-8000-000000000000.png' }, logo: red });
    const { data, info } = await sharp((await withLogo.favicons.favicon('eje', 32)).body).raw().toBuffer({ resolveWithObject: true });
    const centre = (16 * info.width + 16) * info.channels;
    expect([data[centre], data[centre + 1], data[centre + 2]]).toEqual([255, 0, 0]);
    const broken = service({ store: { ...store, logoUrl: '/v1/uploads/0a1b2c3d-0000-4000-8000-000000000000.png' }, logo: new Error('S3 down') });
    expect((await broken.favicons.favicon('eje', 32)).body.length).toBeGreaterThan(0);
  });
  it('never reads a logo that is not an upload, and skips the design query for an unpublished store', async () => {
    const { favicons, uploads, prisma } = service({ store: { ...store, logoUrl: 'https://cdn.example/logo.png', publishedSourceRevision: null } });
    await favicons.favicon('eje', 32);
    expect(uploads.getBuffer).not.toHaveBeenCalled();
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });
  it('serves the wordmark as SVG', async () => {
    const { body } = await service().favicons.logoSvg('eje');
    expect(body.toString()).toMatch(/^<svg [^>]*><path fill="#ffffff"/);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd apps/api && npx jest src/store-seo/store-favicon.service.spec.ts`
Expected: FAIL, "Cannot find module './store-favicon.service'".

- [ ] **Step 3: Implement the service**

`apps/api/src/store-seo/store-favicon.service.ts`:
```ts
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { PUBLIC_STORE_WHERE } from '../stores/active-store';
import { SOURCE_DESIGN_FILE } from '../storefront-source/source-design';
import { UploadsService } from '../uploads/uploads.service';
import { faviconPng, wordmarkSvg } from './store-favicon';
import { DEFAULT_IDENTITY, storeIdentity, type StoreIdentity } from './store-identity';

const CACHE_LIMIT = 500;
const UPLOADED_LOGO = /^\/v1\/uploads\/([a-f0-9-]+\.(?:png|jpe?g|webp|gif))$/i;
type FaviconStore = { id: string; name: string; logoUrl: string | null; publishedSourceRevision: number | null };

/** Every store's tab icon and drawn wordmark (spec 2026-10-10 part A). Unknown slugs 404; nothing else fails. */
@Injectable()
export class StoreFaviconService {
  private readonly logger = new Logger(StoreFaviconService.name);
  private readonly cache = new Map<string, Buffer>();
  private readonly warned = new Set<string>();
  constructor(private readonly prisma: PrismaService, private readonly uploads: UploadsService) {}

  async favicon(slug: string, size: number) {
    const store = await this.store(slug);
    const key = `${this.key(store)}|png|${size}`;
    const body = await this.remember(key, async () => faviconPng({ logo: await this.logo(store.logoUrl, key), name: store.name, identity: await this.identity(store), size }));
    return { body, etag: etagOf(key) };
  }

  async logoSvg(slug: string) {
    const store = await this.store(slug);
    const key = `${this.key(store)}|svg`;
    const body = await this.remember(key, async () => Buffer.from(wordmarkSvg(store.name, await this.identity(store))));
    return { body, etag: etagOf(key) };
  }

  private key(store: FaviconStore) { return `${store.id}|${store.logoUrl ?? ''}|${store.publishedSourceRevision ?? 0}`; }

  private async store(slug: string): Promise<FaviconStore> {
    const store = await this.prisma.store.findFirst({ where: { slug, ...PUBLIC_STORE_WHERE }, select: { id: true, name: true, logoUrl: true, publishedSourceRevision: true } });
    if (!store) throw new NotFoundException('Tienda no encontrada.');
    return store;
  }

  /** Only the design file and stylesheets of the published revision; never the bundled images. */
  private async identity(store: FaviconStore): Promise<StoreIdentity> {
    if (!store.publishedSourceRevision) return DEFAULT_IDENTITY;
    try {
      const files = await this.prisma.$queryRaw<Array<{ path: string; content: string }>>(Prisma.sql`
        SELECT f->>'path' AS path, f->>'content' AS content
        FROM "StoreSourceVersion" v, LATERAL jsonb_array_elements(v.snapshot->'files') f
        WHERE v."storeId" = ${store.id} AND v.revision = ${store.publishedSourceRevision}
          AND (f->>'path' = ${SOURCE_DESIGN_FILE} OR (f->>'path' LIKE '%.css' AND COALESCE(f->>'encoding', 'utf8') <> 'base64'))`);
      return storeIdentity(files);
    } catch (error) { this.warnOnce(`${store.id}|identity`, error); return DEFAULT_IDENTITY; }
  }

  private async logo(url: string | null, key: string): Promise<Buffer | null> {
    const filename = url?.match(UPLOADED_LOGO)?.[1];
    if (!filename) return null;
    try { return await this.uploads.getBuffer(filename); } catch (error) { this.warnOnce(key, error); return null; }
  }

  private async remember(key: string, make: () => Promise<Buffer>): Promise<Buffer> {
    const hit = this.cache.get(key);
    if (hit) { this.cache.delete(key); this.cache.set(key, hit); return hit; }
    const value = await make();
    this.cache.set(key, value);
    if (this.cache.size > CACHE_LIMIT) this.cache.delete(this.cache.keys().next().value!);
    return value;
  }

  private warnOnce(key: string, error: unknown) {
    if (this.warned.has(key)) return;
    this.warned.add(key);
    this.logger.warn(`favicon fallback for ${key}: ${(error as Error)?.message ?? error}`);
  }
}

export const etagOf = (key: string) => `"${createHash('sha1').update(key).digest('hex').slice(0, 16)}"`;
```

- [ ] **Step 4: Run the service tests**

Run: `cd apps/api && npx jest src/store-seo/store-favicon.service.spec.ts`
Expected: 5 passed.

- [ ] **Step 5: Add the controller and wire the module**

`apps/api/src/store-seo/store-favicon.controller.ts`:
```ts
import { Controller, Get, Headers, Param, Query, Res, StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
import { faviconSize } from './store-favicon';
import { StoreFaviconService } from './store-favicon.service';

@Controller('v1/stores/public/:slug')
export class StoreFaviconController {
  constructor(private readonly favicons: StoreFaviconService) {}

  @Get('favicon.png')
  async favicon(@Param('slug') slug: string, @Query('size') size: string | undefined, @Headers('if-none-match') ifNoneMatch: string | undefined, @Res({ passthrough: true }) res: Response) {
    return this.send(await this.favicons.favicon(slug, faviconSize(size)), 'image/png', ifNoneMatch, res);
  }

  @Get('logo.svg')
  async logo(@Param('slug') slug: string, @Headers('if-none-match') ifNoneMatch: string | undefined, @Res({ passthrough: true }) res: Response) {
    return this.send(await this.favicons.logoSvg(slug), 'image/svg+xml; charset=utf-8', ifNoneMatch, res);
  }

  private send(result: { body: Buffer; etag: string }, type: string, ifNoneMatch: string | undefined, res: Response) {
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.setHeader('ETag', result.etag);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (ifNoneMatch === result.etag) { res.status(304); return; }
    res.setHeader('Content-Type', type);
    return new StreamableFile(result.body);
  }
}
```

In `apps/api/src/store-seo/store-seo.module.ts`, import `UploadsModule` from `"../uploads/uploads.module"`, `StoreFaviconController` from `"./store-favicon.controller"` and `StoreFaviconService` from `"./store-favicon.service"`; then set `imports: [StoresModule, UploadsModule]`, add `StoreFaviconController` to `controllers`, and `StoreFaviconService` to `providers`.

- [ ] **Step 6: Write the failing head test**

Append to `apps/api/src/store-seo/store-seo.spec.ts`:
```ts
it('links the store favicon and its touch icon, escaped', () => {
  const head = seoHead({ title: 'Eje', description: '', canonical: 'https://x.example/', graph: [], icon: 'https://api.example/v1/stores/public/a"b/favicon.png' });
  expect(head).toContain('<link rel="icon" type="image/png" sizes="32x32" href="https://api.example/v1/stores/public/a&quot;b/favicon.png">');
  expect(head).toContain('<link rel="apple-touch-icon" href="https://api.example/v1/stores/public/a&quot;b/favicon.png?size=180">');
  expect(seoHead({ title: 'Eje', description: '', canonical: 'https://x.example/', graph: [] })).not.toContain('rel="icon"');
});
```
Run: `cd apps/api && npx jest src/store-seo/store-seo.spec.ts`
Expected: FAIL (`icon` is not a known property, or no link emitted).

- [ ] **Step 7: Emit the icon in `seoHead` and pass it from `document()`**

In `apps/api/src/store-seo/store-seo.ts`, add `icon?: string` to `seoHead`'s input type, and directly after the `<link rel="canonical" href="${e(input.canonical)}">` part of the returned string insert:
```ts
${input.icon ? `<link rel="icon" type="image/png" sizes="32x32" href="${e(input.icon)}"><link rel="apple-touch-icon" href="${e(`${input.icon}?size=180`)}">` : ''}
```

In `apps/api/src/store-seo/store-seo.service.ts` `document()`, before line 55 (`const image = …`) add:
```ts
    const icon = `${this.apiBase()}/stores/public/${encodeURIComponent(slug)}/favicon.png`;
```
Replace the Organization entry's `...(c.store.logoUrl ? { logo: publicImage(c.store.logoUrl, this.apiBase()) } : {})` with:
```ts
logo: publicImage(c.store.logoUrl, this.apiBase()) ?? `${icon}?size=512`
```
and pass `icon` in the `seoHead({ … })` call on line 73.

- [ ] **Step 8: Run the store-SEO tests and type-check**

Run: `cd apps/api && npx jest src/store-seo && npx tsc --noEmit -p tsconfig.json`
Expected: all store-seo specs pass; tsc exits 0. If an existing `document()` test asserted that `Organization` has no `logo` without a `logoUrl`, update that assertion to expect the `favicon.png?size=512` URL (the spec changes this).

- [ ] **Step 9: Commit**

```bash
cd /Users/saramia/pagosYa && git add apps/api/src/store-seo
git commit -m "feat(store-seo): public favicon.png and logo.svg routes, and the store icon in every store head"
```

---

### Task 5: The checkout shows the store's icon instead of the platform's

**Files:**
- Modify: `apps/checkout/storefront-seo.mjs:4-5` (`applySeoDocument`)
- Modify: `apps/checkout/src/store-seo.ts` (`refreshStoreSeo`)
- Test: `apps/checkout/server-test/seo.test.mjs`, `apps/checkout/src/store-seo.test.ts` (new)

**Interfaces:**
- Consumes: the store head now contains `<link rel="icon" …>` and `<link rel="apple-touch-icon" …>` (Task 4).
- Produces: nothing new for later tasks.

- [ ] **Step 1: Write the failing server-render test**

Append to `apps/checkout/server-test/seo.test.mjs`:
```js
test('a store head replaces the platform icon; a page without a store icon keeps it', () => {
  const template = '<head><title>Checkout</title><link rel="icon" type="image/png" href="/logo-mark.png" /></head><div id="app"></div>';
  const store = applySeoDocument(template, { head: '<title>Eje</title><link rel="icon" type="image/png" sizes="32x32" href="https://api.example/v1/stores/public/eje/favicon.png"><link rel="apple-touch-icon" href="https://api.example/v1/stores/public/eje/favicon.png?size=180">', body: '' });
  assert.doesNotMatch(store, /logo-mark\.png/);
  assert.equal((store.match(/rel="icon"/g) || []).length, 1);
  const plain = applySeoDocument(template, { head: '<title>Eje</title>', body: '' });
  assert.match(plain, /logo-mark\.png/);
});
```
Run: `cd apps/checkout && node --test server-test/seo.test.mjs`
Expected: the new test FAILS (two icon links).

- [ ] **Step 2: Strip the template icons when the store brings its own**

In `apps/checkout/storefront-seo.mjs` `applySeoDocument`, after the first `html = html.replace(…)` line add:
```js
  // The template carries the pagosYa mark; a store page shows the store's own icon instead.
  if (/<link\b[^>]*rel=["'](?:icon|apple-touch-icon)["']/i.test(document.head)) html = html.replace(/<link\b[^>]*rel=["'](?:shortcut icon|icon|apple-touch-icon)["'][^>]*>/gi, '');
```
Run: `cd apps/checkout && node --test server-test/seo.test.mjs`
Expected: all tests pass.

- [ ] **Step 3: Write the failing navigation test**

`apps/checkout/src/store-seo.test.ts`:
```ts
import { afterEach, expect, test, vi } from 'vitest';
import { refreshStoreSeo } from './store-seo';

const head = '<title>Eje</title><link rel="icon" type="image/png" sizes="32x32" href="https://api.example/v1/stores/public/eje/favicon.png"><link rel="apple-touch-icon" href="https://api.example/v1/stores/public/eje/favicon.png?size=180">';
afterEach(() => { vi.unstubAllGlobals(); document.head.innerHTML = ''; });

test('the store icon replaces the platform icon and stays single across page changes', async () => {
  document.head.innerHTML = '<link rel="icon" type="image/png" href="/logo-mark.png">';
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ head }) })));
  await refreshStoreSeo('eje');
  expect([...document.head.querySelectorAll('link[rel~="icon"]')].map(link => link.getAttribute('href'))).toEqual(['https://api.example/v1/stores/public/eje/favicon.png']);
  expect(document.head.querySelector('link[rel="apple-touch-icon"]')?.getAttribute('href')).toContain('size=180');
  await refreshStoreSeo('eje', 'product-1');
  expect(document.head.querySelectorAll('link[rel~="icon"]')).toHaveLength(1);
  expect(document.head.querySelectorAll('link[rel="apple-touch-icon"]')).toHaveLength(1);
});
```
Run: `cd apps/checkout && npx vitest run src/store-seo.test.ts`
Expected: FAIL (the platform icon is still there; no store icon copied).

- [ ] **Step 4: Copy icons on refresh**

In `apps/checkout/src/store-seo.ts`, directly after the existing `parsed.head.querySelectorAll('title,meta,link[rel="canonical"],script[type="application/ld+json"]').forEach(…)` line add:
```ts
    const icons = parsed.head.querySelectorAll('link[rel~="icon"],link[rel="apple-touch-icon"]');
    if (icons.length) {
      document.head.querySelectorAll('link[rel~="icon"],link[rel="apple-touch-icon"]').forEach(el => el.remove());
      icons.forEach(el => document.head.append(document.importNode(el, true)));
    }
```
Run: `cd apps/checkout && npx vitest run src/store-seo.test.ts && node --test server-test/seo.test.mjs`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/saramia/pagosYa && git add apps/checkout/storefront-seo.mjs apps/checkout/src/store-seo.ts apps/checkout/src/store-seo.test.ts apps/checkout/server-test/seo.test.mjs
git commit -m "feat(checkout): store pages show the store's own favicon, kept across in-page navigation"
```

---

### Task 6: YAPI always uses a saved logo on new stores and redesigns

**Files:**
- Create: `apps/api/src/storefront-source/source-saved-logo.ts`
- Modify: `apps/api/src/storefront-source/source-generation.service.ts:353-354` (before `const assetUrls = …`)
- Test: `apps/api/src/storefront-source/source-saved-logo.spec.ts`

**Interfaces:**
- Consumes: `SourceImageUse` (`./source-setup`), `sourceRedesignRequested` (already imported in the service).
- Produces: `withSavedLogo(input: { assetUrls: string[]; imageUses: SourceImageUse[]; logoUrl: string | null | undefined; fromScratch: boolean; owned: boolean }): { assetUrls: string[]; imageUses: SourceImageUse[] }`.

- [ ] **Step 1: Write the failing test**

`apps/api/src/storefront-source/source-saved-logo.spec.ts`:
```ts
import { withSavedLogo } from './source-saved-logo';

const logo = '/v1/uploads/0a1b2c3d-0000-4000-8000-000000000000.png';
const base = { assetUrls: ['/v1/uploads/aa.jpg'], imageUses: [], logoUrl: logo, fromScratch: true, owned: true };

describe('withSavedLogo', () => {
  it('adds the saved logo, marked as the logo, to a new store or redesign', () => {
    expect(withSavedLogo(base)).toEqual({ assetUrls: ['/v1/uploads/aa.jpg', logo], imageUses: [{ url: logo, role: 'logo', description: 'Logo de la tienda' }] });
  });
  it('changes nothing on a local edit, without a logo, or for a logo the merchant does not own', () => {
    for (const input of [{ ...base, fromScratch: false }, { ...base, logoUrl: null }, { ...base, owned: false }]) {
      expect(withSavedLogo(input)).toEqual({ assetUrls: base.assetUrls, imageUses: [] });
    }
  });
  it('skips logos the generator cannot bundle and keeps the 24-file limit', () => {
    expect(withSavedLogo({ ...base, logoUrl: '/v1/uploads/abc.gif' }).assetUrls).toEqual(base.assetUrls);
    expect(withSavedLogo({ ...base, logoUrl: 'https://cdn.example/logo.png' }).assetUrls).toEqual(base.assetUrls);
    const full = Array.from({ length: 24 }, (_, i) => `/v1/uploads/${i}.png`);
    expect(withSavedLogo({ ...base, assetUrls: full }).assetUrls).toEqual(full);
  });
  it("keeps the merchant's own role when they attached the logo themselves", () => {
    const uses = [{ url: logo, role: 'product' as const, description: 'Etiqueta' }];
    expect(withSavedLogo({ ...base, assetUrls: [logo], imageUses: uses })).toEqual({ assetUrls: [logo], imageUses: uses });
  });
});
```
Run: `cd apps/api && npx jest src/storefront-source/source-saved-logo.spec.ts`
Expected: FAIL, "Cannot find module './source-saved-logo'".

- [ ] **Step 2: Implement**

`apps/api/src/storefront-source/source-saved-logo.ts`:
```ts
import type { SourceImageUse } from './source-setup';

/** The same upload pattern the generator accepts for bundled images. */
const BUNDLABLE = /^\/v1\/uploads\/[a-f0-9-]+\.(png|jpe?g|webp)$/i;
const MAX_ASSETS = 24;

/** A store designed from scratch always carries its saved logo (spec 2026-10-10 part A); a local edit never adds it. */
export function withSavedLogo(input: { assetUrls: string[]; imageUses: SourceImageUse[]; logoUrl: string | null | undefined; fromScratch: boolean; owned: boolean }) {
  const { assetUrls, imageUses, logoUrl } = input;
  if (!input.fromScratch || !input.owned || !logoUrl || !BUNDLABLE.test(logoUrl)) return { assetUrls, imageUses };
  if (assetUrls.includes(logoUrl)) return { assetUrls, imageUses };
  if (assetUrls.length >= MAX_ASSETS) return { assetUrls, imageUses };
  return {
    assetUrls: [...assetUrls, logoUrl],
    imageUses: imageUses.some(use => use.url === logoUrl) ? imageUses : [...imageUses, { url: logoUrl, role: 'logo' as const, description: 'Logo de la tienda' }],
  };
}
```
Run: `cd apps/api && npx jest src/storefront-source/source-saved-logo.spec.ts`
Expected: 4 passed.

- [ ] **Step 3: Wire it into generation**

In `apps/api/src/storefront-source/source-generation.service.ts`, add `import { withSavedLogo } from './source-saved-logo';` with the other local imports. Directly before `const assetUrls = [...new Set(dto.assetUrls || [])];` (around line 354) insert:
```ts
    // A store designed from scratch always carries its saved logo; the merchant no longer has to attach it again.
    const fromScratch = dto.revision === 0 || (!execution?.candidate && (execution?.redesign === true || sourceRedesignRequested(dto.instruction)));
    const savedLogo = fromScratch ? (await this.prisma.store.findUnique({ where: { id: storeId }, select: { logoUrl: true } }))?.logoUrl : null;
    const logoOwned = savedLogo ? Boolean(await this.prisma.mediaAsset.findFirst({ where: { merchantId, url: savedLogo }, select: { url: true } })) : false;
    const withLogo = withSavedLogo({ assetUrls: [...new Set(dto.assetUrls || [])], imageUses, logoUrl: savedLogo, fromScratch, owned: logoOwned });
    dto = { ...dto, assetUrls: withLogo.assetUrls };
    imageUses = withLogo.imageUses;
```
(`imageUses` is a parameter of `generate`, so it can be reassigned.)

- [ ] **Step 4: Type-check and run the generation specs**

Run: `cd apps/api && npx tsc --noEmit -p tsconfig.json && npx jest src/storefront-source/source-generation.service.spec.ts src/storefront-source/source-saved-logo.spec.ts`
Expected: tsc exits 0. The generation spec keeps its one known pre-existing failure ("steers planning away from recent fingerprints…") and nothing new. If a generation test's Prisma mock lacks `store.findUnique` or `mediaAsset.findFirst`, that test fails with "is not a function": add `findUnique: jest.fn(async () => ({ logoUrl: null }))` to its `store` mock and `findFirst: jest.fn(async () => null)` to its `mediaAsset` mock, rather than changing the service.

- [ ] **Step 5: Commit**

```bash
cd /Users/saramia/pagosYa && git add apps/api/src/storefront-source/source-saved-logo.ts apps/api/src/storefront-source/source-saved-logo.spec.ts apps/api/src/storefront-source/source-generation.service.ts apps/api/src/storefront-source/source-generation.service.spec.ts
git commit -m "feat(yapi): new stores and redesigns always carry the store's saved logo"
```

---

### Task 7: An optional logo in the create-store dialog

**Files:**
- Create: `apps/merchant-dashboard/src/create-store.mjs`
- Modify: `apps/merchant-dashboard/index.html:395` (after the name field)
- Modify: `apps/merchant-dashboard/src/dashboard.js` (imports at the top; submit handler at lines 1442-1469)
- Modify: `apps/merchant-dashboard/server.mjs:151` (served-module list)
- Test: `apps/merchant-dashboard/unit/create-store.test.mjs`

**Interfaces:**
- Consumes: `uploadFile(file): Promise<string>` (`dashboard.js:3245`, same scope as the submit handler).
- Produces: `createStoreBody(name: string, file: File | undefined, uploadFile: (file) => Promise<string>): Promise<{ body: { name: string; logoUrl?: string }; warning: string | null }>`, `MAX_CREATE_LOGO_BYTES = 8_000_000`.

- [ ] **Step 1: Write the failing test**

`apps/merchant-dashboard/unit/create-store.test.mjs`:
```js
import assert from "node:assert/strict";
import test from "node:test";
import { createStoreBody } from "../src/create-store.mjs";

const file = (size) => ({ size, name: "logo.png" });

test("without a logo the store is created by name only", async () => {
  assert.deepEqual(await createStoreBody("Eje", undefined, async () => { throw new Error("no"); }), { body: { name: "Eje" }, warning: null });
});
test("an uploaded logo is sent with the new store", async () => {
  assert.deepEqual(await createStoreBody("Eje", file(1000), async () => "/v1/uploads/abc.png"), { body: { name: "Eje", logoUrl: "/v1/uploads/abc.png" }, warning: null });
});
test("a failed or oversized upload never blocks creating the store", async () => {
  const failed = await createStoreBody("Eje", file(1000), async () => { throw new Error("red caída"); });
  assert.deepEqual(failed.body, { name: "Eje" });
  assert.match(failed.warning, /sin logo/);
  const big = await createStoreBody("Eje", file(9_000_000), async () => "/v1/uploads/abc.png");
  assert.deepEqual(big.body, { name: "Eje" });
  assert.match(big.warning, /8 MB/);
});
```
Run: `cd apps/merchant-dashboard && node --test unit/create-store.test.mjs`
Expected: FAIL, cannot find `../src/create-store.mjs`.

- [ ] **Step 2: Implement the helper**

`apps/merchant-dashboard/src/create-store.mjs`:
```js
// The create-store dialog: a logo is optional and a failed upload never blocks creating the store.
export const MAX_CREATE_LOGO_BYTES = 8_000_000;

export async function createStoreBody(name, file, uploadFile) {
  if (!file || !file.size) return { body: { name }, warning: null };
  if (file.size > MAX_CREATE_LOGO_BYTES) return { body: { name }, warning: "El logo pesa más de 8 MB. La tienda se creó sin logo; súbelo luego en Ajustes de la tienda." };
  try {
    return { body: { name, logoUrl: await uploadFile(file) }, warning: null };
  } catch (error) {
    return { body: { name }, warning: `No pudimos subir el logo (${error?.message || "error desconocido"}). La tienda se creó sin logo; súbelo luego en Ajustes de la tienda.` };
  }
}
```
Run: `cd apps/merchant-dashboard && node --test unit/create-store.test.mjs`
Expected: 3 passed.

- [ ] **Step 3: Add the field, wire the handler, serve the module**

In `apps/merchant-dashboard/index.html`, after the `createStoreName` field's `<div>…</div>` add:
```html
            <div><label for="createStoreLogo">Logo <span class="faint">(opcional)</span></label><input id="createStoreLogo" name="logo" type="file" accept="image/png,image/jpeg,image/webp"><p class="faint">Lo usaremos en tu tienda y como ícono en la pestaña del navegador.</p></div>
```
In `apps/merchant-dashboard/src/dashboard.js`, add with the other imports at the top:
```js
import { createStoreBody } from "/src/create-store.mjs";
```
In the `createStoreForm` submit handler, replace
```js
      const store = await api("/stores", { method: "POST", body: JSON.stringify({ name: data.name }) });
```
with
```js
      const { body, warning } = await createStoreBody(data.name, form.querySelector("#createStoreLogo")?.files?.[0], uploadFile);
      const store = await api("/stores", { method: "POST", body: JSON.stringify(body) });
      if (warning) errorEl.textContent = warning;
```
(`new FormData(form)` now also contains the `logo` file; only `data.name` is read from it, so nothing else changes.)
In `apps/merchant-dashboard/server.mjs` line 151, add `"/src/create-store.mjs"` to the served-module array, next to `"/src/store-settings.mjs"`.

- [ ] **Step 4: Run the dashboard unit tests**

Run: `cd apps/merchant-dashboard && node --test unit/*.test.mjs`
Expected: all pass, including `served-modules.test.mjs`.

- [ ] **Step 5: Commit**

```bash
cd /Users/saramia/pagosYa && git add apps/merchant-dashboard/src/create-store.mjs apps/merchant-dashboard/unit/create-store.test.mjs apps/merchant-dashboard/index.html apps/merchant-dashboard/src/dashboard.js apps/merchant-dashboard/server.mjs
git commit -m "feat(dashboard): an optional logo when creating a store; a failed upload never blocks creation"
```

---

### Task 8: Live check

**Files:** none changed (verification only). The owner's dev servers read this working tree (see memory "Branch switching changes the owner's live app"); the API and dashboard pick the changes up on restart.

- [ ] **Step 1: Start the stack** (or ask the owner to run `pnpm dev:chatgpt`; never start a second bridge while theirs runs).

- [ ] **Step 2: Hit the routes**

```bash
curl -s -o /tmp/eje.png -w "%{http_code} %{content_type}\n" http://localhost:3001/v1/stores/public/bench2-pilates/favicon.png
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3001/v1/stores/public/bench2-pilates/favicon.png?size=180"
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/v1/stores/public/does-not-exist/favicon.png
curl -s http://localhost:3001/v1/stores/public/bench2-pilates/seo | grep -o '<link rel="icon"[^>]*>'
```
Expected: `200 image/png`, `200`, `404`, one icon link. `bench2-pilates` must be a public, active store; if it isn't, use any slug from `GET /v1/store-discovery`. Open `/tmp/eje.png`: a square letter mark.

- [ ] **Step 3: Browser check**

Open a store page through the checkout app (`http://localhost:5175/s/<slug>`). The tab shows the store's letter mark, not the pagosYa mark. Navigate to a product page; the icon stays. Upload a logo in the dashboard's store settings, save, reload the store page: the tab shows the logo (the ETag changes with `logoUrl`).

- [ ] **Step 4: Report** what was seen, with the screenshot, and any failure exactly as observed.
