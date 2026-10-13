# Showcase stores and the header library

Date: 2026-10-13 · Branch: feature/store-page-architecture · Part 3 of the store-quality programme (1 bugs → 2 speed → **3 showcase stores + headers** → 4 structure)

## Why

The owner, reviewing generated stores (2026-10-12): "not all stores will sell something, some stores could be just showcase"
and "they are all the same header, let's make the header". Seen on the newest store: «deff», an architecture firm, got
Buscar / Mi cuenta / Tu carrito, an empty product grid right after the hero, and all ~24 shop pages (login, orders,
shipping, refunds…).

Root causes (read in code 2026-10-12):
- `sitePurpose` (`'shop' | 'service' | 'portfolio' | 'editorial'`, source-site-purpose.ts) exists and is honoured by the
  older and agent paths, but the Sep-5 author ignores it: its gate (source-generation.service.ts ~491) never reads it, its
  input hard-codes `products: true, storeShell: true`, and `sep5AuthorPrompt` never adds `sourceSitePurposePrompt`.
- `SEP5_STORE_SHELL` / `SEP5_STORE_SHELL_FRAMED` (design-engine/sep5-author.ts ~154/157) demand name + nav + Buscar +
  Mi cuenta + cart on every page; the self-review capture (sep5-review-capture.ts ~33–35, ~89–91) and
  `sep5ProjectIsUsable` (~209) enforce catalog and cart.
- The 10 header shapes in `FRAME_CATALOGUE.header` (design-engine/frame-draw.ts ~19–29) are prompt text only, each
  repeating Buscar/Mi cuenta/cart; the model often ignores the drawn shape (Rampa drew `side-rail`, built a top bar).
- `withStaticStandardPages` (source-static-pages.ts ~145) gives every store every standard page.

## Decisions (owner, 2026-10-13)

1. Showcase is **detected, then confirmed** in the setup form.
2. A showcase's main action can be **WhatsApp, contact form, booking link, or phone call**.
3. Headers come from a **platform header library; YAPI styles it**.
4. The library works by **the platform writing the header at save time** (approach A), not by YAPI copying markup
   and not by client-side rendering.

## Part A — Showcase stores

### A1. Setup form
- New step right after «¿Qué vendes o a qué te dedicas?»: «¿Vas a vender en línea?» with *Sí, quiero vender* / *No, solo
  mostrar mi negocio*.
- Pre-selected by a local guess on the description text (no model call): service/portfolio wording (e.g. arquitect*,
  consultor*, clínica, abogad*, fotograf*, estudio de, diseño de interiores, servicios profesionales) → showcase;
  otherwise → shop. The guess is a pure function with a word list and tests; the merchant always confirms.
- Showcase skips «Agrega hasta 5 productos».
- The contact step («¿Cómo te contactan?») gains «¿Qué hace el botón principal?»: WhatsApp (uses the existing number
  field), Formulario de contacto, Enlace de reservas (URL field, https only), Llamada (phone field). Default: WhatsApp when
  a number is given, otherwise the form.
- Saved as `sitePurpose: 'service'` plus a new `primaryAction` setting `{ kind: 'whatsapp' | 'form' | 'booking' | 'phone',
  value?: string }` in the store's config/brief (the plan picks the existing home that config.js already carries; no
  database migration). The Studio's «Quiero crear» picker keeps working and still offers all four purposes.
- Setup form lives in apps/merchant-dashboard/src/onboarding-walkthrough.mjs (steps `products`, `contact`).

### A2. What a showcase store gets
- Sep-5 author follows `sitePurpose`: adds `sourceSitePurposePrompt`, drops `products`, uses a non-shop shell (name,
  sections, main action; no catalog, cart, checkout, search, account). `sep5ProjectIsUsable` and the review capture
  checks depend on purpose: a non-shop store needs its main action, not catalog/cart.
- Calls to action on the page use the main action (WhatsApp `https://wa.me/<digits>`, `tel:`, the booking URL, or the
  contact form trigger).
- Pages: Inicio, Nosotros, Contacto, Preguntas frecuentes, Privacidad, Términos, Cookies, 404. Not added: acceso-*,
  cuenta-*, buscar, colecciones, envios, reembolsos, and the kit commerce pages (product, productos, coleccion,
  checkout). `withStaticStandardPages` and `platformSuppliedPages` take the purpose.
- Contact form: choosing it enables the store's contact form (`Store.contactFormEnabled`). Its submissions must reach the
  merchant's panel as leads. The plan verifies today's path (kit `[data-pagosya-contact]` launcher, commerce.js ~3461,
  and the API it posts to) and adds a plain contact lead (name, contact, message; no cart) only if submissions do not
  already land in the panel.
- Shop stores are unchanged by Part A.

## Part B — The header library

### B1. The headers
- The 10 catalogue shapes become real platform headers in the storefront kit (one HTML template per shape, one stylesheet,
  behaviour in the kit runtime):
  - Calm: `centered-split`, `menu-button`, `info-bar` (one real fact from the brief), `stacked`, `shrinking`.
  - Bold: `wordmark-band`, `side-rail`, `bottom-pill`, `overlay`, `reveal`.
- Each shape has two versions:
  - shop: search, account, cart (the kit's existing `buscar.html`, `data-pagosya-account`, `data-cart-open` /
    `data-cart-count` hooks, so the cart drawer and account pages keep working);
  - showcase: the main action as a button («Escríbenos», «Pide una cotización», «Agenda una cita», «Llámanos»).
- Styled only through the store's own tokens (fonts and colours from its brand/visual-system CSS variables), so the same
  shape differs between stores.
- Every shape has a phone layout and one menu that opens and closes correctly: focus moves into it, Escape closes it, and
  any scroll lock it sets is always released on close (the part-1 lesson).

### B2. How it plugs in
- YAPI no longer writes the header. `SEP5_STORE_SHELL*` ask for `<header data-pagosya-header></header>` as the page's
  first element and for `data-nav-label="…"` on each section that belongs in the menu. The self-review stops checking
  header contents.
- A save step `withSourceHeader(files, input)` renders the drawn shape into the slot on every HTML page (index, standard
  pages, kit commerce pages), from: store name or logo, the marked sections (`index.html#id` links off the home page),
  purpose and actions, the brief fact for `info-bar`. It replaces today's shared-header copy for kit pages
  (source-commerce-design.ts), including part 1's panel carry-over, which becomes unnecessary when the platform owns the
  panel.
- The shape comes from the existing frame draw (`frame-draw.json`): calm shapes for calm styles, bold for bold, playbook
  rules unchanged. The «Elige tu estilo» cards preview the shape that will be built.
- Re-rendered on every save from the store's settings, so a YAPI edit cannot break or drop it. A page without the slot
  (an older store) is left alone.
- The header-clickable check from part 1 keeps running: it now catches page content covering the platform header.
- Existing stores are untouched until a redesign. A merchant control to switch shapes is deferred.

## Out of scope
- Switching header shape from the Studio.
- Hybrid stores (sell some products and showcase services).
- Migrating existing stores.
- A services list with prices for showcase stores.

## Error handling
- Unknown or missing drawn shape → `menu-button` (calm) as the safe default, logged.
- Showcase with no usable action value (no number, invalid URL) → contact form.
- A page whose slot is missing → header not inserted on that page; logged once per save.
- Guess function never blocks the form; the merchant's choice wins.

## Testing
- Unit (API, targeted `--maxWorkers=2`): purpose-aware author prompt, usability and review checks; showcase page set;
  `withSourceHeader` on every page, idempotent re-render, missing-slot pages untouched; shape fallback.
- Kit: each of the 10 shapes × shop/showcase renders, and in a headless browser at 1440 and 390 every control works and the
  menu releases scroll on close (the probes used in part 1).
- Dashboard: the guess function's word list; the new step and the contact-step action choice.
- Live (after the owner's ChatGPT plan is renewed): one shop and one showcase store through real generation.
