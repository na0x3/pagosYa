# YAPI edits everything — spec (2026-11-03)

Owner 2026-11-03: «quiero que yapi sepa editar todo lo de la página porque los usuarios piden cualquier cosa» → audit
(`2026-11-03-yapi-edit-everything-audit.md`) → «haz todo» (overnight, owner asleep: built in priority order, unit-tested, live
check left for the morning on the ChatGPT plan).

## Shape
The template quick edit (`editLayout`, spec 2026-11-01) becomes the reader for the **whole store**, still one short terra call.
It now sees, next to the numbered home sections:
- `ficha`: the product page's sections (`productLayout`), numbered the same way;
- `tienda`: the store's own data — about (tagline, text), contact (phone, email), the four policies, the merchant's own FAQ
  questions, the announcement, the footer line, social links, the signup popup, the catalogue title, and the products (number,
  name, price, short description, whether it has options);
- `fotos`: numbered photos — the ones attached to this message first, then the store's own (product photos, uploads).

It answers `ops` (layout, now with `page` and a `photo` op), `store` (store ops) and `rest`, as before.

## 1. Layout ops
- `page`: `home` | `product`. Text, remove, move work on the product page too; `add` stays home-only (rest otherwise).
  The product page has no cover/grid protections.
- `photo`: `at` (+ `item` ≥ 0 for an item's photo), `field` `photo` | `photo2`, `value` = `f<n>` from `fotos`. Only a place the
  block already shows a photo in changes — a section never gains a photo place it does not draw.
- Photos are the upload paths the library already uses (`/v1/uploads/…`); attached photos are the message's own uploads.

## 2. Store ops (`source-store-edit.ts`, pure apply)
One shape `{ part, field, at, title, value }`; unused fields "" / -1.

| part | field | writes | checks |
|---|---|---|---|
| about | tagline, text | `store.tagline`, `store.aboutText` | caps 160 / 4000, safe text |
| contact | phone, email | `contactPhone`, `contactEmail` | phone `+?digits 6–24`, email shape; '' removes |
| policy | delivery, returns, privacy, terms | `policies[...]` | `policyTextProblem`; '' removes |
| faq | add, set, remove | `policies.faq` (`[{q,a}]`, ≤ 12) | q ≤ 160, a ≤ 1200, both needed |
| announcement | text | `copy.announcement` (store-data) | cap 120; '' removes |
| footer | tagline | `copy.tagline` (store-data) | cap 160 |
| social | instagram, tiktok, facebook, youtube, x | `StoreLink` (label = network) | handle → URL; http(s) only; '' removes that one |
| popup | on, off, title, text, button, discount | `storeRetention.settings` (+ promo code `BIENVENIDA<n>` for discount) | DTO caps 100/500/60; 5–50 % |
| catalog | title | `components/page-productos.tsx` h1 | cap 60, no `{}<>` |
| product | name, price, description, photo | `PaymentLink` | price > 0 (Bs → cents), refused on a product with options; photo goes first |

Every refusal is said in the reply (as layout refusals are). What no op covers stays in `rest` and follows as its own request.

## 3. Saving
`templateLayoutEdit` (same place in `send`):
1. Store ops write the database first.
2. Then one revision: `refill({ layout?, productLayout?, copy? }, label)` plus the catalogue title transform; a database-only
   change still saves a revision so the preview's `config.js` data shows it.
3. Reply: `Listo: …` with every change, the refusals, and `Ahora sigo con lo demás: …` for the rest.

## 4. Fixes
- **E1** — `masterContentEdit` on a template home keeps `copy.announcement` and `copy.tagline` (the Shell draws them);
  `visibleChanges` counts those two on any home.
- **E2** — `visibleChanges` counts a change in the store data the pages show (`aboutText`, `tagline`, contact, `policies`,
  `links`) and in the catalogue (each product's name, price, description, photos) as visible, so a design edit that changed
  products or policies is not undone and called «No logré».
- **FAQ** — `storePolicies` keeps `faq`; saving Ajustes keeps the stored `faq` when the request does not send one. The kit's FAQ
  page shows the merchant's own questions first, then the answered facts; a store with only its own questions shows the page.
- **Social links** — `config.js` data carries `links`; the kit adds them after the information links in a footer's
  `[data-pagosya-pages]` nav (existing stores get them with no file change).

## Out of scope tonight (open)
Locations/addresses, `checkoutMode`, fonts on themed templates, section looks («reseñas en carrusel»), button links to WhatsApp,
a dashboard editor for the FAQ questions, adding sections to the product page, a new page («mayoristas»).

## Tests
- `source-store-edit.spec.ts`: digest; each part's apply, caps, refusals, removal; price parsing; product with options refused;
  photo refs; social handle → URL.
- `source-layout-edit.spec.ts`: product-page ops, photo op (only existing photo places), refusals.
- `source-visible-change.spec.ts`: announcement/tagline on a template home; data-only changes (policy, product) visible.
- `store-presentation`: FAQ kept/normalised; Ajustes save keeps it.
- Kit: own FAQ questions and footer links.
- Live (morning, ChatGPT plan): on a template store — «escribe nuestra historia…», «agrega la pregunta …», «cambia el teléfono»,
  «pon una cinta …», «sube el brownie a Bs 25», «cambia la foto de la portada por esta» (with a photo), «cambia el texto de la
  ficha …», «pon mi instagram @…».
