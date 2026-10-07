# One email look per store

Decision of 2026-10-07. The owner saw the order-confirmation email the platform sends
today — a clean but plain black-and-white receipt — and asked that **every email a store
sends its buyers** look like a designed email (reference: Designmodo's "Email Templates"
on Dribbble: colour blocks, hero photos, product photos, confident type), and that each
store's emails be unique to that store.

This spec covers stage 1: the store's email kit, the service that builds every email from
it, photos, the Correos tab, and the two buyer receipts. Later stages move the remaining
email families onto the same kit, each with its own spec.

## Decisions taken with the owner

| Question | Decision |
|---|---|
| Who designs it | The AI, per store (uniqueness), not ready-made templates |
| How many designs per store | **One look per store**, shared by every email it sends |
| Which emails | Every store → buyer email. pagosYa → merchant emails are out of scope |
| How close to the website | A twin of the store's website by default; the merchant can ask YAPI for a bolder campaign version ("Más llamativo") |
| Who writes the words | The AI, in the store's voice, once, when it designs the look. Facts and required lines stay with the platform. The merchant can edit any line |
| When it is made | In the same run that generates the site; a "Diseñar mis correos" button for existing stores; a site redesign never changes the emails on its own — Correos offers "Tu sitio cambió · actualizar correos" |
| Technical approach | The AI writes a small kit of HTML parts; the platform assembles every email from them |

The approach where the AI only picks settings (colours, a header variant) was rejected: it is
the "model fills a schema" pattern the owner already identified as the reason stores look alike.
Writing every email separately was rejected by "one look per store".

## What exists today

- `apps/api/src/order-emails/` — `OrderEmailService.renderForStore()` picks the store's authored
  `emails/order-confirmation.html` when it validates, else the kit floor
  (`packages/storefront-kit/kit/emails/order-confirmation.html`); `order-email-render.ts` fills
  `data-order-*` slots by construction (text nodes, never string concatenation);
  `order-email-slots.ts` holds the contract and the 80 KB / 90 KB clamps.
- `apps/api/src/storefront-source/source-email-html.ts` — `validateOrderEmailHtml()` strips,
  clamps and reports (`repairs: string[]`), never throws on content; `SOURCE_ORDER_EMAIL_DIRECTION`
  is the generator instruction.
- `PaymentIntentsService.sendReceiptEmail()` sends the receipt (order or appointment) with `html`
  from `renderForStore` beside the untouched text `body`.
- The dashboard's Correos tab (`apps/merchant-dashboard/src/order-email-panel.mjs`) previews the
  email at 390 px and 640 px and sends the merchant a test copy.
- Uploads are stored as `/v1/uploads/<file>`, a path relative to the API. There is no setting for
  the API's public origin.

Note: the "debt paid" email in `payment-intents.service.ts` goes to the collection's notification
address or the merchant's own email — it is a merchant notice, not a buyer email, and is out of scope.

## 1. The kit the AI writes

Three files in the store's source project, written by the email step of site generation.

### `emails/layout.html` — the frame every email shares

A complete email document: header, footer, background, typography, colours.

| Slot | Filled with | As |
|---|---|---|
| `data-email-content` (exactly one) | the email's blocks | children |
| `data-store-name` | store name | text |
| `data-store-logo` | logo URL | `src` |
| `data-store-link` | the store's published address | `href` |
| `data-email-preheader` | the preview line Gmail shows beside the subject | text |
| `data-email-unsubscribe` | unsubscribe link (marketing emails only) | `href` |

A layout without exactly one `data-email-content` is invalid and the floor layout is used.
On a marketing email, a layout without `data-email-unsubscribe` gets a small platform footer
with the link appended. A transactional email with that slot has the element removed.

### `emails/blocks.html` — one sample of each block

Each block is a top-level element marked `data-block="<type>"`.

| Block | Purpose | Slots |
|---|---|---|
| `hero` | big photo, headline, line | `data-block-image` (src), `data-block-title`, `data-block-text` |
| `heading` | headline and paragraph | `data-block-title`, `data-block-text` |
| `items` | order lines with photos, and the total | exactly one `data-item` row containing `data-item-image` (src), `data-item-name`, `data-item-variant`, `data-item-extras`, `data-item-quantity`, `data-item-amount`; then `data-items-total`, `data-items-original-total` |
| `button` | call to action | `data-block-link` (href), `data-block-label` |
| `products` | product grid | exactly one `data-product` card containing `data-product-image` (src), `data-product-name`, `data-product-price`, `data-product-link` (href) |
| `promo` | code card | `data-block-code`, `data-block-text` |
| `note` | small print | `data-block-text` |

A missing or invalid block falls back to the floor block of that type, with the layout's own
colours applied, so one weak block never sends the whole email back to the floor.
Required for a usable kit: `heading`, `items`, `button`, `note`.

### `emails/copy.json` — the wording

```json
{
  "order_confirmation": { "subject": "…", "preheader": "…", "headline": "…", "intro": "…", "cta": "…", "signoff": "…" },
  "appointment_confirmed": { "…": "…" }
}
```

- String values only, each with a length cap (subject 90, preheader 110, headline 80,
  intro 400, cta 30, signoff 160).
- Placeholders `{cliente}` and `{tienda}` only; anything else in braces is removed.
- Digits that read as an amount, a date or an order number are removed and reported, as the
  template validator does today.
- A missing key falls back to the platform's default wording for that email.

### Today's authored `emails/order-confirmation.html`

Kept and used for receipts by stores that have it and no kit. Once a store has a kit, the
receipt is built from the kit and the old file is ignored.

## 2. How each email is built

`StoreEmailService.render(storeId, type, data)` replaces `OrderEmailService.renderForStore()`
(which becomes a thin caller of it until removed):

1. Load the store's kit from its current source snapshot; validate each file (cached by
   snapshot revision).
2. Take the recipe for `type` — an ordered list of blocks, in code.
3. For each block: clone the store's sample (or the floor block), fill its slots from `data`
   and the resolved wording, repeat `data-item` / `data-product` rows as needed.
4. Insert the blocks into `data-email-content`; fill the layout's slots.
5. Validate the result and apply the 90 KB clamp.
6. Return `{ html, repairs }`.

The caller sends `html` beside the text `body` it already builds. **The text body is never
changed.** If any step throws, the caller sends text only, exactly as before, and logs once.

Fallback order: the store's kit → the store's `emails/order-confirmation.html` (receipts only)
→ the floor kit.

### Recipes

Stage 1:

| Type | Blocks |
|---|---|
| `order_confirmation` | heading → items → button (tracking; dropped without a tracking URL) → note (subscription line; "No se cobra automáticamente" when there is a subscription) |
| `appointment_confirmed` | heading → note (service and date) → items (when the booking was paid) → button (tracking, when present) |

Later stages, for reference (each gets its own spec): welcome, come-back card, campaign,
review request, abandoned cart, the five subscription notices, confirm email, reset password,
Operaciones reminders and manual messages, business documents. In campaigns, reminders and
manual messages the body text is the merchant's own, verbatim; the AI's wording frames it.

## 3. Photos

- **Product photos** (`items`, `products`): the chosen variant's photo, else the product's first
  photo. None → the row renders without an image.
- **Hero photo**: the main photo of the store's website. None → a solid block in the store's
  colour carrying the headline.
- **Logo**: `Store.logoUrl`, as today.

`PUBLIC_ASSET_BASE_URL` (new, in `config/configuration.ts`; production: the API's public https
origin) and one helper, `emailImageUrl(path, store)`:

- `/v1/uploads/<file>` → `PUBLIC_ASSET_BASE_URL + path`
- `assets/<file>` (website photos) → the store's published site origin + path
- already-absolute https URLs pass through
- anything that is not https after resolution is dropped and reported

The renderer, not the author, sets `width`, `height` and `alt` (the product name, or the store
name for a hero) on every filled image, and a background colour on the image's cell, so a slow
or blocked image leaves a calm coloured box.

Local development: the Correos preview shows photos (the browser can load local URLs); a test
email sent to Gmail from local dev arrives without them. To test photos in real Gmail before
deploying, run a tunnel (for example `cloudflared tunnel --url http://localhost:3001`) and point
`PUBLIC_ASSET_BASE_URL` at it. This goes in the implementation notes.

## 4. The Correos tab

`apps/merchant-dashboard` — Ajustes › Correos (the tab built on 2026-10-07).

**Status and main action**

- No kit: "Tus correos usan el diseño estándar" and **Diseñar mis correos**, with its credit
  cost shown before it runs.
- Kit, and the site's published revision is newer than the revision the kit was designed
  from: "Tu sitio cambió · **actualizar correos**".
- Kit: **Más llamativo** — a bolder campaign version of the same kit.
- Every redesign is shown first as a candidate: **Usar este diseño** or **Volver al anterior**.
  The previous kit is kept, so undo is one click.

**One email at a time**

- A list of email types grouped Compras · Marketing · Suscripciones · Cuenta · Recordatorios;
  only implemented types appear (stage 1: the two receipts).
- The selected email's preview at 390 px and 640 px with sample data and real photos.
- Its wording fields (subject, preheader, headline, intro, cta, signoff), prefilled from the
  kit. Merchant edits are stored **apart from the kit** (a per-store, per-type, per-field
  override), so a redesign never overwrites them. Edited fields show "Editado por ti ·
  restaurar". The same wording checks apply.
- **Enviar una prueba** sends the selected email to the signed-in account address, as today.

## 5. Safety, cost and testing

**Safety**

- Every kit file is validated on write, with the existing validator extended to layouts,
  blocks and `copy.json`: allowed tags only; no scripts, forms, flexbox, grid or positioning;
  every colour paired with a background (Gmail dark mode); clamps of 80 KB per kit file and
  90 KB per rendered email.
- Order facts only come from the platform. Nothing may state or imply automatic charging.
- No pagosYa branding in the email.
- Marketing emails always carry an unsubscribe link.
- `emails/*` is writable only by the email step of generation. `brand.css`, `config.js` and
  `commerce.js` stay reserved.

**Cost**

- New stores: the kit is part of site generation, so that run grows.
- Diseñar mis correos, actualizar correos and Más llamativo are one run each, shown before
  they start.
- The real credit cost is measured during stage 1 and recorded in the plan.

**Testing**

- Unit: every block fills and escapes by construction; each recipe yields its blocks in order;
  each fallback step (block, kit, legacy file, floor); wording checks; image URL resolution;
  the unsubscribe rule; the text body stays byte-identical.
- Browser: the Correos tab — previews at both widths, editing and restoring wording, the
  design / undo flow, test send.
- An example set: kits for 5–6 different stores (fashion, café, services, tech, …), every email
  rendered to an image side by side, to judge quality and uniqueness.
- Real Gmail: one test send per example store through the tunnel, checked on desktop and phone,
  light and dark mode, with screenshots attached.

## Stage 1 scope

In: the kit and its validation; the generator step that writes it; `StoreEmailService` and the
two recipes; photos and `PUBLIC_ASSET_BASE_URL`; the Correos tab (status, design / undo,
previews, wording overrides, test send); Diseñar mis correos for existing stores.

Out (later specs): marketing, subscription, account, reminder and document emails; per-email
layouts; merchant-uploaded email-only images; scheduled sends.
