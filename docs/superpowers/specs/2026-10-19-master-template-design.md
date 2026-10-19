# One master template, Amboras-style — design

Date: 2026-10-19. Status: designed with the owner in conversation, section by section (template, creation, chat edits,
testing). Research behind it: `docs/superpowers/research/2026-10-19-amboras-reverse-engineering.md`.

## 0. Why

Amboras's stores look finished because every store starts from one hand-built, hand-debugged template and their agent
edits it a little ("prefer editing existing components", "keep changes minimal"). YAPI writes most of each new store
fresh (Sep-5 author, style cards, frame and design draws), so every build re-rolls layout and every store can break in
a new way. Owner decisions, 2026-10-19:

- Every new store starts from **one new master template** (not the 61 Plantillas, not a shortlist).
- It follows **Amboras's layout**, rebuilt from scratch in our format (their repos carry no licence: no code copied).
- **YAPI writes as little as possible on creation.**
- The **"Elige tu estilo" step is removed** from new-store creation.
- The template covers **the whole store**: home, header/footer, product card, product page, cart, checkout and account look.
- Icons follow Amboras: the Lucide set.
- Random draws are off (done 2026-10-19: `YAPI_FRAME_DRAW=off`, `YAPI_DESIGN_DRAW=off` in `apps/api/.env`).

Unchanged: stores that already exist; the 61 Plantillas in the Mi tienda gallery (a merchant can still pick one);
"diseña desde cero" when the merchant asks for it in words; the walkthrough (C1) as the way a first store is described.

## 1. The template: «Esencial»

Lives at `packages/store-templates/templates/esencial`, in the same format as every Plantilla: `template.json`
(manifest, DNA, photo slots), `components/Shell.tsx`, `home.tsx`, `product.tsx`, `checkout.tsx`, `styles/globals.css`,
`demo/`. The kit renders the working parts through `KitSlot`/`data-pagosya-*` anchors; Esencial arranges and styles them.
`sitePurpose: "shop"`.

### 1.1 Shell

- Announcement bar: one line, thin; not rendered when the text is empty.
- Sticky header on a paper-coloured band: `Menu` icon button then the store name (heading font) on the left; `Search`,
  `LogIn` (account) and `ShoppingBag` (cart, with count) on the right. The links live in a slide-in menu panel (left),
  at every width. Logo image replaces the name when the store has one.
- Footer: four columns — brand (name + tagline), Tienda (Todos los productos, collections), Ayuda (the kit's standard
  pages via `data-pagosya-pages`), Contacto (city, WhatsApp, email when present) — and a legal row (© year name ·
  Pagos seguros con pagosYa). Columns stack on phones.

### 1.2 Home, in order

1. **Hero** — full-width photo (`photos.hero`), dark gradient for legibility, copy left of centre: eyebrow (small,
   uppercase, letter-spaced), two-line heading-font headline, one light line of subcopy, two pills: primary filled in
   the accent colour, uppercase letter-spaced (→ catalogue); secondary white outline (→ story anchor). Height
   `min(88vh, 860px)` desktop, `78vh` phone.
2. **Product grid** — section title + "Ver todo" link; 4 columns desktop, 3 tablet, 2 phone; the kit product cards.
3. **Brand story** — split: photo (`photos.story`) and text (title + body). Text-only variant when there is no story photo.
4. **Three values** — numbered (01/02/03), title + one sentence each, hairlines between.
5. **Reviews** — the kit reviews slot; not rendered when the store has no published reviews.
6. **Closing band** — accent or deep colour, one line + one pill.

### 1.3 Commerce surfaces

- **Product card**: 4:5 photo, name, price, compare-at struck through, a soft lift on hover (no tilt, no rotation).
- **Product page**: gallery left; right column sticky on desktop — title, rating, pricing, description, buy (variants,
  quantity, add to cart), highlights, delivery, info accordion; reviews and related below. Same `KitSlot` names as today.
- **Cart**: kit drawer from the right, styled by Esencial tokens.
- **Checkout / account**: the kit and checkout-app versions; DNA fields set so they follow Esencial's colours, fonts,
  radius and button.

### 1.4 Craft numbers

Container 1280px with 24px (phone 16px) gutters. Section rhythm 96px desktop, 48px phone. Type scale (desktop):
display 72px/1.05, h1 48/1.15, h2 36/1.2, h3 24/1.3, body 16–17px/1.6; `text-wrap: balance` on headings, no
`overflow-wrap: anywhere` on headings. One radius variable for cards and fields; buttons are pills. Motion: gentle
fade-up reveal on section entry and hero parallax (kit `Parallax` with `mobileStrength` 10–20px, kit `Reveal`) — the
2026-09-26 rule `source-templates-motion.spec.ts` enforces; no marquee, no scroll scenes, all motion off under
`prefers-reduced-motion`.

### 1.5 Theming

All colour comes from five variables (`--es-paper`, `--es-ink`, `--es-muted`, `--es-accent`, `--es-deep`) plus derived
borders; all type from `--es-heading` / `--es-body`. A palette list (8 entries) and a font-pair list (8 entries) live
in `template.json` under `esencial.palettes` / `esencial.fonts`, each with an id and a one-line description for the
model:

- Palettes: mostly calm — cream + terracotta (default), cream + olive, white + black, warm sand + rust, sage + forest,
  blush + plum, stone + navy, one dark (near-black + gold).
- Font pairs: catalogue fonts only, each a serif or display heading face with a quiet sans body; the eight exact pairs
  are chosen while building and shown to the owner in §4 step 1.

Choosing a palette or font pair changes values in `store-data`, never markup.

### 1.6 Icons

Lucide only (`lucide-static`, already a dependency of `apps/api`; ISC licence), inlined as SVG at build time through the
asset library; stroke 1.5, sizes 20/24px. No emoji anywhere in the template.

### 1.7 Demo photos

Generated (Higgsfield, owner's account) for the template preview only, with no visible brands. They never reach a
merchant's saved store (§2.5).

## 2. Creation

### 2.1 When

A new store (`revision === 0`), purpose shop, not the product-photo flow, when the walkthrough finishes or the first
chat generation would start — unless the merchant asked for a design from scratch (`startFrom === 'scratch'` read
from their own words; the current code forces `'scratch'` on every generate, which this changes). Flag
`YAPI_MASTER_TEMPLATE` (`app.yapiMasterTemplate`), default on; `=off` returns to today's flow.

With the flag on, new-store creation never enters the style pick (`YAPI_STYLE_PICK`), the concept planner, the
Sep-5 author, the frame/design draws or the review stage.

### 2.2 Apply

`SourceTemplatesService.apply(merchantId, storeId, 'esencial', 0)` as today: store name, up to five walkthrough
products, their photos, `components/store-data.tsx` generated by `assembleTemplateRevision`.

### 2.3 Fill call

One structured model call (run model, strict JSON schema, 60 s deadline, one retry on a transient bridge refusal).
Input: the walkthrough answers (name, what they sell, story, contact, city), product names, and low-detail thumbnails
of the merchant's photos with their indexes. Output:

```
{ announcement, eyebrow, headline, subcopy, primaryCta, secondaryCta,
  storyTitle, storyBody, values: [{ title, text } ×3], closingLine, closingCta, tagline,
  heroPhoto: index | null, storyPhoto: index | null, palette: id, fonts: id }
```

Every string has a length cap enforced by the schema and again on the server. The prompt: Spanish, the business's own
voice, no invented facts (no reviews, numbers, years, awards, certifications), nothing the walkthrough did not say
about price or delivery. Unknown palette/font ids fall back to the defaults; out-of-range photo indexes become null.

### 2.4 Save

The fill values are written into `store-data` (a new `copy` and `theme` object beside `store` and `photos`) and the
store saves as revision 1 through the existing `projects.save`. Template components read every visible string from
`store-data`; none is hard-coded except labels like "Ver todo".

### 2.5 Missing material

- No usable hero photo → hero uses the paper/deep colour field with the same copy (no demo photo).
- No story photo → text-only story variant.
- No products → the grid shows the kit's honest empty state ("Pronto"), no invented products.
- Demo photos are never copied into a saved store; a test checks it.

### 2.6 Failure

Fill call fails or times out → save anyway with: headline = store name, subcopy = the walkthrough's "what you sell",
other copy from short Spanish defaults in `template.json`, palette 1, fonts 1. YAPI's message says the store is ready
and the merchant can ask for changes. Creation never fails on the model.

### 2.7 Targets

Under 30 s from walkthrough end to saved store; one small call; billed like one chat message.

## 3. Chat edits

The existing interpret step (`SourceConversationService.decide`) gains `editKind: 'content' | 'design' | 'redesign'`
for stores whose brief carries `templateId: 'esencial'`.

1. **content** — copy, colours, fonts, announcement, photo swaps. Re-runs the fill call with the current values and
   the request; only fields the request touches change (server diff check). Merchant-given colours are accepted as
   custom theme values after a contrast check (text on paper and on accent ≥ 4.5:1; adjusted toward ink when it
   fails). No code changes; seconds.
2. **design** — layout or component changes ("mueve las reseñas arriba", "agrega una oferta por paquete").
   The agent edits existing component files under Amboras rules added to its prompt: edit the component that exists,
   change only what was asked, never rewrite a whole page, keep `store-data` as the copy source. The existing
   edit-scope validation applies. After the save, a headless check at 1280 and 390 px measures horizontal overflow and
   overlapping text boxes; one repair round when it fails, otherwise the edit is reported with the finding.
3. **redesign** — only on an explicit ask ("rediseña todo", "quiero algo único"): today's full design flow.

Out of scope: pushing later Esencial improvements into stores already created (Amboras does this with converge
patches); stores keep their copy.

## 4. Testing and order of work

1. **Build Esencial and show the owner before wiring anything**: screenshots of home, product page, cart and checkout
   at 1440 and 390 px in three palette/font combinations. Nothing in §2–3 is built until the owner approves the look.
2. Template tests (`packages/store-templates/test`): manifest valid; all product `KitSlot` names present; Lucide only
   (no emoji, no other icon source); motion rule; no horizontal overflow at 1280/768/390; empty cases render (0 products,
   1 product, no reviews, no story photo, no hero photo); every visible string comes from `store-data`.
3. Fill tests: schema caps, server caps, unknown ids → defaults, bad photo index → null, timeout → fallback save,
   demo photos never saved.
4. Routing tests: new shop → master path; explicit scratch → today's flow; flag off → today's flow; style pick never
   entered with the flag on; `editKind` routing; a content edit changes `store-data` only.
5. Live check (owner approval, ChatGPT plan via `pnpm dev:chatgpt`): three stores through the walkthrough (café,
   clothing, beauty) — time and screenshots each; then one content edit and one design edit on one of them.
