# Part A: a logo and a favicon on every store

Status: approved in conversation 2026-10-10; written spec awaiting owner review.
Programme: `2026-10-10-choose-your-style-design.md` (part A of four).

## Why

All nine Boosterpack sites measured on 2026-10-10 ship a favicon made from the business's logo and show that logo in the header. pagosYa stores ship no favicon at all: the browser tab shows the pagosYa mark (`apps/checkout/index.html:9`) for every store. In the dev database, 0 of 40 stores have a `logoUrl`. The create-store dialog asks only for a name, and YAPI uses a saved logo only if the merchant attaches it again in the chat.

## Goals

1. Every store, YAPI-built or classic, shows its own favicon in the browser tab.
2. A merchant can give a logo when creating a store, and YAPI always uses a saved logo.
3. A store without a logo gets a typographic logo: its name drawn in its own display font and colours.

Non-goals: new fonts (part B), the style step (part C), and logos on the platform's standard product and checkout pages beyond what the header already renders.

## Design

### 1. Logo input

- **Create-store dialog** (`apps/merchant-dashboard/index.html:391-397`, submit in `dashboard.js:1442-1469`): add an optional "Logo" file field. It uploads through the existing `POST /v1/uploads`, as `store-settings.mjs:338-354` does, and sends `logoUrl` in `POST /stores` (`CreateStoreDto.logoUrl` already exists). An upload failure creates the store without a logo and says so; it never blocks creation.
- **YAPI always uses a saved logo.** In `SourceGenerationService.generate`, on a new store or a redesign (`!previous || redesign`), when `Store.logoUrl` is set and the merchant did not already attach it, add it to the run's assets with role `logo`. The existing path then places it: `role 'logo'` (`source-generation.service.ts:940`) and the design engine's navigation slot. Local edits are unchanged.
- The YAPI chat keeps asking for a missing logo once (`store-knowledge.ts`); no change.

### 2. The typographic logo (no build changes)

A pure function, `typographicLogo({ name, fontFile, ink, ground, mode })`, draws the store name with `fontkit` (already in the lockfile at 2.0.4; added as a direct API dependency) and returns an SVG made only of `<path>` elements. It needs no font to display and passes `source-svg-sanitize.ts`, which strips `<text>`.

- `mode: 'wordmark'`: the whole name on one line, sized to its own box.
- `mode: 'mark'`: the first letter, centred in a square with the ground colour behind it, for favicons.

It's drawn on demand from the store's saved design, never during a build:

| Input | Source, in order |
|---|---|
| font | the published revision's `design-direction.json`, selected concept's `dna.type.display` font file; else Bricolage Grotesque (`bricolage`) |
| ink and ground | the published revision's authored CSS: first `--store-foreground` and `--store-background` values that are plain hex colours; else the confirmed brand colours; else `#111111` on `#ffffff` |
| case | `dna.type.case` (`upper` uppercases; others keep the name as typed) |

If the font file is missing or drawing throws, the result is a plain square in the ground colour with the letter set in Bricolage Grotesque. A favicon request never fails because of a design.

The header is not changed: YAPI already sets the store name in the concept's display font with the store's own colours, which looks the same as the drawn logo and follows the theme.

### 3. Favicon endpoints and the shared head

New public routes in the store-SEO area (the same module that builds `<head>` for every store):

- `GET /v1/stores/public/:slug/favicon.png?size=32|180|192|512` (default 32).
- `GET /v1/stores/public/:slug/logo.svg`: the drawn wordmark, used as `Organization.logo` and the og:image fallback when the store has no uploaded logo.

Favicon source, in order:
1. **Uploaded logo** (`Store.logoUrl`): fitted with `sharp` into a square (`fit: contain`) on the ground colour, so tall or wide logos stay readable.
2. **Typographic mark** from section 2.
3. **Fallback mark**: first letter of the store name in Bricolage Grotesque, `#111111` on `#ffffff`.

Responses are PNG with `Cache-Control: public, max-age=3600` and an `ETag` built from (store id, `logoUrl`, published source revision, size). An in-memory cache, capped at 500 entries, keeps generated images keyed the same way. A logo change or a new publish changes the key.

`seoHead()` (`store-seo.ts:28`) gains `<link rel="icon" type="image/png" sizes="32x32" href="…/favicon.png">` and `<link rel="apple-touch-icon" href="…/favicon.png?size=180">`. In the checkout app:
- `apps/checkout/index.html:9`'s hard-coded pagosYa icon is removed from store pages, and `applySeoDocument` (`storefront-seo.mjs`) replaces any existing icon links with the store's.
- The in-page refresh (`apps/checkout/src/store-seo.ts`) copies `link[rel~=icon]` and `link[rel=apple-touch-icon]` along with title, meta and canonical, so the icon survives navigation.

## Error handling

- Unknown slug: 404, same as the other public store routes.
- Logo fetch or decode failure: fall through to the typographic mark, then the fallback mark.
- Drawing failure: the fallback mark. Errors are logged once per cache key, never thrown to the visitor.

## Testing

- `typographicLogo`: returns only `<path>` elements; passes the SVG sanitizer unchanged; `upper` case uppercases; a missing font yields the fallback; the mark is square.
- Favicon source order: uploaded logo, then typographic mark, then fallback; the ETag changes when `logoUrl` or the published revision changes.
- Colour reading: picks hex `--store-foreground` / `--store-background`, and ignores `color-mix()` and variables.
- `seoHead` includes both icon links; the checkout refresh keeps them.
- Generation: on a new store with a saved `logoUrl` the run's assets include it with role `logo`; a local edit does not add it.
- Live: Estudio Eje in the browser shows its letter mark in the tab; after a logo upload in settings, the tab shows the logo.
