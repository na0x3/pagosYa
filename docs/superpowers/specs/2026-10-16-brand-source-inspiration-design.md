# Brand source inspiration (YAPI chat) — design

Date: 2026-10-16. Status: approved in conversation, awaiting written-spec review.

## Goal

A merchant can hand YAPI material from their **own** brand — their old website, screenshots of their Instagram, banners,
photos — in an ordinary chat request, and the store YAPI builds or edits takes that brand's **colours, fonts, layout feel,
quotes/voice, photos and logo**. Success: the store reads as the same brand as the merchant's Instagram or old site.

Material from **another** company stays what it is today: a style reference only (look, never its words, photos or logo).

## Decisions (owner, 2026-10-16)

- Instagram arrives as **uploaded screenshots/photos**; no Instagram login or scraping (Instagram blocks unauthenticated reads).
- It works **per chat request**; nothing is saved to the brand profile in this project.
- Own brand vs someone else is decided **from the merchant's words**; when they give no signal, YAPI asks once.
- From an own old website YAPI brings **look + words + photos and logo** (imported into the store's media).
- Approach A: **structured extraction**, enforced by checks, not prompt-only.

## Background (what exists)

- Chat (`source-chat.service.ts`) collects attached images with roles (`SourceImageRole`: logo, product, business, background,
  team, reference, unknown, unused) and inspects pasted links (`source-website-reference.ts`: HTML outline, CSS colour/font
  declarations, rendered screenshots). Instagram/Facebook/maps hosts are skipped. Both are treated as **other-company**
  references: SOURCE_WEBSITE_REFERENCE_INSTRUCTIONS forbids importing identity, claims, assets.
- `design-engine/photo-palette.ts` (built 2026-10-16) turns pixel samples into a light (calm) and dark (bold) palette whose id
  carries its colours; `frameForRun({ photoPalettes })` uses it instead of the drawn palette; brand colours still win.
- `brand/brand-import.ts` has a safe public-HTTPS, DNS-pinned, no-redirect fetcher (text only today).

## Design

### 1. Intent — own brand, other, or ask

`brandSourceIntent(merchantWords): 'own' | 'other' | 'unknown'` (pure, deterministic, Spanish + English, accent-safe
lookarounds like `frame-draw.ts`):

- own: «mi página/sitio/web (anterior)», «mi Instagram», «mis banners/publicaciones/posts», «nuestra marca», «de mi negocio»,
  «mi marca», «my old site», «our brand».
- other: «como esta tienda/página», «me gusta este estilo», «inspírate en <otra>», a named other brand.
- unknown: material shared (images or a link) with neither signal.

Chat behaviour:
- own → material is processed as a brand source (sections 2–4).
- other → today's behaviour, unchanged.
- unknown with shared material **and** a design request → YAPI asks once before generating:
  «¿Es material de tu marca (uso sus colores, frases y fotos) o solo una inspiración de estilo?» The answer is remembered on
  the setup draft for the rest of that request (`brandSourceIntent` on `SourceSetupDraft`).

Marking:
- Images: new `SourceImageRole` value `'brand-source'` (seen by the design model, sampled for colour, never shown on the
  store unless the merchant also asks to show it — then `honorImageContent` makes it `business` as today).
- Links: `SourceWebsiteReference.brand = true`. Own-brand links are allowed for every host the inspector already accepts;
  Instagram/Facebook links get the existing «sube capturas» answer.

### 2. Brand sheet — extraction

New module `storefront-source/brand-source.ts`, run once per request in the generation service before the design stage, when
any brand-source image or brand link exists. Output (`BrandSheet`, plain JSON, ≤ 8 KB):

```ts
type BrandSheet = {
  palettes?: { calm: Palette; bold: Palette };      // from pixels
  quotes: Array<{ text: string; source: 'website' | 'image'; where: string }>; // ≤ 8, each ≤ 160 chars
  voice?: string;                                    // ≤ 300 chars: tone, tú/usted, emoji yes/no
  fonts?: { display?: string; text?: string };       // served font family names
  layout?: string;                                   // ≤ 400 chars
  imported: Array<{ url: string; path: string; kind: 'photo' | 'logo' }>; // ≤ 12
  notes: string[];                                   // what could not be read, for the reply
};
```

Sources and methods:
- **Colours**: pixel samples (`samplePhotoColours`) of brand-source images and of the brand link's rendered captures →
  `photoPalettes`. Deterministic.
- **Quotes from a website**: the brand link's HTML — h1–h3, meta description, `og:description`, paragraphs ≤ 160 chars in the
  first two sections, `blockquote` — kept verbatim, de-duplicated, ≤ 8.
- **Quotes, voice, layout, font look from images**: one vision call (`brandSourceRead`) over ≤ 8 images (brand-source images
  + the link's captures), schema `{ quotes: [{ text, verbatim: boolean, where }], voice, layout, typeLook }`. Quotes with
  `verbatim: false` are dropped. Uses the request's provider/budget plumbing (the ChatGPT-plan bridge in dev).
- **Fonts**: CSS `font-family` from the link (first family not a generic), else `typeLook`; mapped by `matchServedFont` to the
  nearest family the platform serves (by category: serif, sans, display, slab, script, mono); unknown → none.
- **Photos + logo (website only)**: candidates from `<img src>`, `srcset` largest, `og:image`, `link[rel~=icon]` 180+, a header
  `<img>` whose alt/class/src says logo. Fetched through the brand-import fetcher (public HTTPS, DNS-pinned, no redirects),
  `image/(png|jpeg|webp)` only, ≤ 10 MB each, ≥ 400 px on the long side (logo ≥ 96 px), ≤ 12 total, largest first. Saved as
  the merchant's media (`mediaAsset`, marked as imported from the brand site through its existing kind/role fields; no schema change) and added to the run's asset legend with role `business` (logo:
  `logo`).

Failure of any part never fails the request: the part is empty and a `notes` line says so.

### 3. The build uses the sheet — enforced

- **Palette**: `sheet.palettes` replaces the run's palettes (`frameForRun({ photoPalettes })`) on fresh builds **and** on an
  edit whose request is about the look/colours (`brandSourceTouchesLook(words)`); confirmed brand-profile colours still win.
  Check `brandColourDrift(files, palette)`: the saved `--store-background/--store-foreground/--store-accent` must be within
  ΔE ≤ 12 of the sheet; a drift fails the attempt with a repair message (same mechanism as the header gate).
- **Quotes**: a `BRAND SOURCE` prompt block lists the verbatim quotes («use at least one where it fits; never reword»), the
  voice, the layout paragraph and the font line. Check `brandQuotesUsed(files, quotes)`: when the request is about the look
  or the copy and no quote appears in any saved page, the attempt is repaired once; a second miss saves with a reply note.
- **Photos/logo**: imported photos count as the store's photos (photo-hero rule applies). The logo becomes the store logo only
  when the store has none or the merchant's words ask («usa mi logo»).
- **Fonts**: the matched families go into the playbook font line (`playbookDirection({ fonts })`).
- Own-brand material is excluded from SOURCE_WEBSITE_REFERENCE_INSTRUCTIONS' «do not import identity» rule by labelling it
  `BRAND SOURCE (the merchant's own brand)` in the prompt; other references keep that rule word for word.

### 4. What the merchant sees

YAPI's reply adds one line built from the sheet (not model-written):
«Tomé de tu marca: colores <nombre>, la frase "<quote>", la tipografía <font> y <n> fotos de tu página anterior (puedes
quitarlas en Medios).» Missing parts add the `notes` (e.g. «No pude leer textos en tus capturas»).

### 5. Limits and safety

- Website fetch: existing brand-import fetcher (public HTTPS only, DNS-pinned, no cookies/scripts/subresources, 1 MB HTML,
  10 s). Images: same fetcher rules, ≤ 12, ≤ 10 MB, image types only.
- Remote HTML/text is data, never instructions (the existing reference rule applies to the brand link too).
- One vision call per request inside the request's credit budget; the sheet is cached per request id for retries.
- Other-company material never reaches this path.

## Testing

- Unit: `brandSourceIntent` (own/other/unknown, accents, mixed messages); website extraction from fixture HTML (quotes, fonts,
  photo/logo candidates, skipped tiny/SVG/data URIs); `matchServedFont`; `brandColourDrift`; `brandQuotesUsed`; vision
  response parsing drops non-verbatim quotes; reply line wording.
- Fetch: blocked private hosts, redirects, wrong content types, oversize images (mocked).
- End-to-end (mocked model, like `source-generation-header.spec.ts`): an edit with «mi Instagram» screenshots saves the photo
  palette and a quote; an «other» link keeps today's behaviour; an «unknown» message gets the one question.
- Live: baek with two Instagram-style screenshots + «usa los colores y frases de mi Instagram», and a store with its own old
  site link.

## Out of scope

Saving the sheet to the brand profile; Instagram account connection (Graph API); TikTok/Facebook; video frames as sources.
