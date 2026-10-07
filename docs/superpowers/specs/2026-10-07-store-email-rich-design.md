# Rich store emails: editorial receipts and merchant content

Decision of 2026-10-07, building on `2026-10-07-store-email-look-design.md` (stage 1, built the same
day). The owner received the stage-1 receipt in Gmail and found it plain: no pictures, short, few
details. The references are Designmodo's and Akash Islam's email templates on Dribbble: an
announcement bar, a header with logo and menu, a big hero photo with a bold headline and button,
photo-and-text rows, product grids with photos and prices, contact cards with icons, address boxes,
and a coloured footer with links, social icons and address.

The owner also wants merchants to put their own content in these emails: promotions, an
announcement, a brand message.

## Why stage 1 looked plain

- **No pictures:** Gmail fetches every image from the internet. Locally the API is unreachable and
  `PUBLIC_ASSET_BASE_URL` is unset, so images are dropped by design. Even with a public address,
  stage 1 only has small product thumbnails; the hero photo was deferred.
- **Short:** the receipt recipe has four blocks (heading, items, button, note), and no block exists for
  icons, quotes, details or a full footer. The migration was not applied, so the standard kit was used.

## Decisions taken with the owner

| Question | Decision |
|---|---|
| Sections of the order confirmation | The 13 below, in that order |
| Merchant content | Promotions, announcement, brand message, store note, hero photo, recommendations on/off |
| Where merchants set it | **Both**: sensible automatic defaults, overridable in Ajustes › Correos |
| Which promo code goes out automatically | Only codes the merchant marks **Mostrar en correos** in Descuentos; the latest such code |
| Testimonials | Only real published reviews; otherwise a note signed by the store. Never an invented quote |

## 1. The order confirmation

| # | Section | Content from | If missing |
|---|---|---|---|
| 1 | Announcement bar | Merchant's announcement; default: the AI's line from the store's shipping/returns policies | hidden |
| 2 | Header: logo + 2–3 links | `Store.logoUrl`; the first categories by `sortOrder`, linking to the store's category pages | logo only |
| 3 | Hero: photo, "¡Gracias, {cliente}!", line, **Sigue tu pedido** | Photo: merchant's pick → the published website's main photo → `Store.bannerUrl`. Text: wording | solid colour block, no photo |
| 4 | Order summary with photos | The order (stage 1) | — |
| 5 | Delivery or pickup box | `StoreOrder.recipientName`, `shippingStreet/City/Department/References`, or `fulfillmentLocationName` | hidden |
| 6 | Next steps: 3 icons | Platform wording by fulfilment: envío (confirmado → preparando → en camino), retiro (confirmado → preparando → listo para retirar) | — |
| 7 | Trust row | Pago seguro (always); Cambios y devoluciones (returns policy set); Envíos (delivery offered); Atención (contact email or phone set) | only the real ones |
| 8 | Promo card | Code chosen in Correos → latest active code with **Mostrar en correos** | hidden |
| 9 | Quote | Latest `StoreReview` with `status: "PUBLISHED"` and rating ≥ 4, shown with the buyer's first name and stars → the store note, signed with the store name | the note |
| 10 | Brand message: photo + short story | Merchant's text → the AI's, from the brand profile | hidden |
| 11 | "También te puede gustar" | 2–4 active products with photos and prices, none from this order | hidden |
| 12 | "¿Problemas con tu pedido?" cards | `Store.contactEmail`; `Store.contactPhone` (WhatsApp when it is the WhatsApp number) | hidden |
| 13 | Footer | Logo; social icons from `StoreLink` URLs; the first location's address; policy links; "Enviado por {tienda}" | parts hidden |

The **appointment confirmation** uses the same sections. Its delivery box becomes the service, date
and location, and its steps become confirmada → recordatorio → te esperamos.

Unchanged from stage 1: every fact (prices, codes, discount values, addresses, reviews, contact
details, links) comes from the platform; the AI designs each section and writes only the wording
around the facts; the text body of every email is untouched.

**Size:** Gmail clips at 102 KB, and the render clamp stays at 90 KB. When a rendered email would
pass it, sections are removed in this order until it fits: recommendations, brand message, quote,
promo, trust row, next steps. The order summary, delivery box, contact cards and footer are never
removed. Each removal is reported as a repair.

## 2. What the merchant controls

### Descuentos (existing page)

- Each promo code gets a **Mostrar en correos** switch, off by default (new `PromoCode.showInEmails`).
- The promo card shows the code and its discount ("10% en tu próxima compra", "Bs 20 en tu próxima
  compra"), both built by the platform from `discountType` and `discountValue`. The AI writes only
  the line around them.
- Switching a code off or deactivating it removes it from the next email sent.

### Ajustes › Correos — "Contenido de tus correos"

| Item | Merchant can | Automatic default |
|---|---|---|
| Announcement | write it (≤ 90 characters) or turn it off | the kit's `announcement` wording |
| Hero photo | pick from uploads or product photos | website's main photo → store banner |
| Promotion | pick one shared code, or none | latest code with Mostrar en correos |
| Brand message | title (≤ 60), text (≤ 300), photo, or off | the kit's `storyTitle` / `storyText`, no photo |
| Store note | write it (≤ 200), signed with the store name | the kit's `note` wording |
| Recommendations | on / off | on |

- A per-email switch for announcement, promotion, brand message and recommendations.
- The merchant's text passes the same checks as wording edits: no amounts, dates or order numbers,
  nothing implying automatic charging, line breaks folded.
- Saved apart from the kit (new `StoreEmailContent`), so a redesign never wipes it. Each item shows
  "Editado por ti · restaurar".
- The preview updates as the merchant edits; Enviar una prueba sends exactly what buyers get.

## 3. The kit, icons and photos

### New block types

| Block | Slots (repeated row in bold) |
|---|---|
| `announce` | `data-block-text` |
| `hero` (now used) | `data-block-image`, `data-block-title`, `data-block-text`, `data-block-link`, `data-block-label` |
| `address` | `data-block-title`, **`data-line`** |
| `steps` | **`data-step`** with `data-step-icon`, `data-step-title` |
| `trust` | **`data-trust`** with `data-trust-icon`, `data-trust-label` |
| `quote` | `data-quote-text`, `data-quote-author`, `data-quote-stars` |
| `story` | `data-block-image`, `data-block-title`, `data-block-text` |
| `contact` | `data-block-title`, **`data-contact`** with `data-contact-icon`, `data-contact-label`, `data-contact-value` (a link) |
| `promo` (now used) | `data-block-code`, `data-block-discount`, `data-block-text` |
| `products` (now used) | as in stage 1 |

New layout slots: **`data-nav-link`** (header links), **`data-social`** with `data-social-icon`
(footer), `data-store-address`, **`data-policy-link`**.

- Each block is validated like the stage-1 blocks: fact slots required, otherwise the standard
  block stands in using the store's colours.
- The AI marks every block with `data-tone="light"` or `data-tone="dark"`, meaning the background it
  sits on.
- New copy fields per email type: `announcement`, `storyTitle`, `storyText`, `note`,
  `recommendTitle`, `helpTitle`, with the same caps and checks.
- The standard kit gets all new blocks.
- Existing AI kits keep working: missing new blocks use the standard ones. "Actualizar correos"
  regenerates the kit with the new pieces.
- The design prompt asks for a full editorial email in the store's style, like the references,
  with every fact slot left empty.

### Icons

- Gmail strips SVG. The platform ships a fixed PNG set at 2× size in two tones (dark, light) under
  `packages/storefront-kit/kit/emails/icons/`: lock, return, truck, store, chat, check, box, calendar,
  mail, whatsapp, phone, pin, star, instagram, tiktok, facebook, x, youtube.
- They are served by a public API route and resolved with `PUBLIC_ASSET_BASE_URL`, like photos. The
  block's `data-tone` picks the variant.
- Social icons come from the `StoreLink` URL host (instagram.com → instagram, and so on). An unknown
  host shows as a text link.

### Photos

- **The website's main photo:** the first image of the published homepage, resolved through the
  published site's public asset path (`/v1/stores/public/<slug>/source-site/assets/<rev>-<digest>/…`).
- **Brand-message and recommendation photos:** uploads, resolved as in stage 1.
- Anything that is not https after resolution is dropped, as in stage 1.

## 4. Safety, testing, hand-off

- Merchant and AI text: the existing checks.
- Codes, discounts, addresses, reviews, contact details and links: platform only, escaped by
  construction.
- A private code never goes out: only codes with Mostrar en correos.
- A review is shown only when published, with the buyer's first name only.
- **Unit tests:** every new block and its fallback; every "if missing" rule; the removal order under
  the size clamp; the Mostrar en correos selection; the per-email switches; icon tone; social host
  matching; the review rule; delivery-box variants (envío, retiro, cita).
- **Browser tests:** Correos "Contenido" (edit, restore, per-email switches, live preview);
  the Descuentos switch.
- **Real Gmail:** one send through the tunnel, checked on desktop and phone, light and dark mode,
  with screenshots.
- **Migration:** `PromoCode.showInEmails`, `StoreEmailContent`, hand-written, applied by the owner.

## Scope

In: the 13-section order confirmation and the matching appointment confirmation; the new blocks,
icons and photos; Descuentos switch; Correos "Contenido"; the standard kit and design prompt updates.

Out (later): marketing emails (welcome, campaigns, abandoned cart), which will reuse these blocks; a
separate "send this promo now" blast; merchant-uploaded icon sets.
