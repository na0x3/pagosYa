# Product highlights with animated icons

Status: implemented 2026-09-15 (`docs/PRODUCT_HIGHLIGHTS_PLAN.md`). Part 2 of the product page work; Part 1 is `docs/PRODUCT_PAGE_KIT.md`.

Built as written, with these decisions made during the work:
- The suggestion route lives with the stores module, where AI usage is recorded: `POST v1/stores/:storeId/product-highlights/suggestions`.
- Studio keeps its own icon list with Spanish names (`src/product-highlight-icons.ts`); a unit test keeps it equal to the API list, and an API test keeps the kit's drawings equal to it.
- The guide's Destacados step is step 4 of 8, right after the price.
- On product pages without photos the kit splits the column; highlights stay in the purchase panel.

## 1. What it does

A product page shows three or four short highlights, each with a small icon that moves in a gentle loop. A car listing can show a car with "Automático · 5 asientos", a fuel pump with "Gasolina · 1.6 L" and a truck with "Entrega · A domicilio". YAPI suggests the highlights from the product's own information; the store owner edits and approves them, and only approved highlights appear on the page.

Decisions already made by the owner:
- YAPI suggests, the owner confirms. Nothing reaches the storefront without the owner saving it.
- Icons loop continuously (option C of the motion mockup), kept gentle.

## 2. Data

`PaymentLink.highlights` (JSONB, default `[]`), following the `specifications` pattern from `e42e79c`:
- ordered rows `{ icon, label, detail }`, at most 4;
- `icon` is a name from the kit's icon set (§4); unknown names are dropped when saving;
- `label` 1–24 characters, `detail` 0–40 characters, safe text, trimmed; rows with a repeated label are dropped.

Migration adds the column. The DTO, `normalizeProductHighlights`, create/update in `payment-links.service.ts` and the public catalog in `stores.service.ts` mirror `specifications`.

## 3. Suggestions

`POST v1/stores/:storeId/product-highlights/suggestions` with `{ name, description, specifications, tags }`. The server calls the configured inventory model through the Responses API with a strict JSON schema whose `icon` field is an enum of the icon set, and returns up to 4 rows. It saves nothing.

The prompt allows only facts present in the request. It must not claim shipping speed, warranty, certifications, materials or performance the text does not state. Delivery and payment highlights come from store settings, which the kit already shows as assurances, so suggestions skip them. Usage is recorded with `AiUsageService.record(storeId, 'product-highlights', ...)`, like product scenes.

## 4. Icon set and motion

The kit bundles about 36 line icons drawn from Lucide paths (ISC, license already shipped), each paired with one looping motion:

| Group | Icons (motion) |
|---|---|
| Vehicles | car (rolls), fuel (drips), gauge (needle sweeps), gear (turns), seat (settles), road (lines stream) |
| Delivery and time | truck (drives), package (bobs), clock (hand turns), calendar (page flips) |
| Electronics | bolt (flickers), battery (fills), plug (nudges), wifi (arcs pulse), chip (pulses), screen (glows) |
| Home and materials | leaf (sways), ruler (slides), drop (drips), sun (rays pulse), flame (flickers), snowflake (turns) |
| Apparel and beauty | shirt (sways), wash (drum turns), sparkle (twinkles), hand (waves), scissors (snips) |
| Food and drink | cup (steam rises), wheat (sways), chef hat (bobs), bottle (tilts) |
| General | shield (check draws), star (twinkles), heart (beats), recycle (turns), check (draws) |

Motion rules:
- 1.6–3.2 s loops, movement of 1–4px or up to 10°, no color flashes.
- Animations pause while the row is off screen (IntersectionObserver).
- `prefers-reduced-motion` and the store motion mode `off` show still icons, through the existing `motion.js` rules.

## 5. Owner flow

The YAPI product guide in Studio (`source-create-product.ts`) gains a "Destacados" step after the description and specification sheet. On entering it, YAPI suggests highlights once, shown as editable rows: an icon picker, label and detail inputs, and a remove button. The owner can also add rows by hand or skip the step. Editing an existing product loads its saved highlights and does not ask again. The review step lists the highlights before saving.

## 6. Storefront

- **Editorial:** an icon row between the description and the choices, with icons centered above the label and detail, and thin rules above and below (as in the approved mockup).
- **Dense:** a grid of icon, label and detail between the buy button and the assurances.
- Icons are drawn inline by the kit; nothing is fetched.
- Products without highlights render nothing. The kit escapes all text. Icons are decorative (`aria-hidden`) and the row is a list with an accessible name.
- The fold check from Part 1 still applies: the buy button stays visible at 1280×844 with 4 highlights in editorial.

## 7. Testing

- **API:**
  - normalizing highlights (limits, unknown icons, duplicates);
  - create and update round trip;
  - public catalog exposure;
  - the suggestion endpoint with a mocked Responses call (schema enum, no persistence, usage recorded, failure returns a friendly error).
- **Studio e2e:** the guide step with mocked suggestions (edit, remove, save), plus editing an existing product.
- **Kit (Playwright):** both styles render highlights, animation runs and pauses off screen, reduced motion shows still icons, a product without highlights renders nothing, and the fold check still passes.

## 8. Out of scope

- Bulk suggestions for an existing catalog.
- Icons on homepage product cards.
- Owner-uploaded or AI-drawn icons.
