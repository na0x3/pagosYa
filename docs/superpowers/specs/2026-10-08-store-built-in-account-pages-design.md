# Built-in store account pages

Status: design approved by the owner 2026-10-08. Supersedes the "Where the account pages live" section of
`2026-09-30-store-customer-accounts-design.md` and the overlay in `2026-09-30-inline-account-forms-followup.md`.

## Goal

Each store's sign-in, sign-up and account pages look like that store, automatically on every generation, and can be
redesigned by asking YAPI. They load at once and scroll with the page. pagosYa owns the fields, the validation and every
call to the customer API; YAPI owns the look.

## Why the current design is replaced

Today the forms are a separate app (`/cuenta/<slug>/<view>` on the checkout origin) that the trusted parent places over
an empty slot in the store page (`packages/storefront-preview/src/source-account-host.ts`,
`source-account-slot.js`). Measured problems (owner report 2026-10-08):

- **Slides.** The store page reports the slot's position by message once per frame while it scrolls; the overlay is
  moved after the message arrives, so it trails the page.
- **Slow.** Every visit loads a second app; the slot shows "Cargando formulario…" until it answers (15 s timeout).
- **Same design everywhere.** YAPI can set four values (`set_account_appearance`: background, foreground, accent,
  radius). Fonts, buttons, inputs and layout are fixed.

The overlay existed to keep passwords out of authored code. That reasoning predates a fact verified on 2026-10-08:
store pages (preview and published) run under `default-src 'none'; connect-src 'none'; form-action 'none'`, with
images, fonts and frames limited to known sources and DNS prefetch off (`source-preview.ts`), and outside links open
only for merchant-configured destinations (`source-storefront.ts`, `pagosya:source-external`). Code in a store page can
read what a shopper types there but cannot send it to the internet. The remaining channel is the store's legitimate
messages to the trusted parent, which the password guard below covers. The owner accepted this trade-off.

## Scope

All account views: sign in, sign up, forgot password, reset password, email verification, orders, subscriptions,
addresses, profile (including data export and account deletion).

Out of scope: shopper social sign-in, saved cards, wishlists, changing an account's email, and any change to the
customer-account API (`apps/api/src/store-customers`), which stays as it is.

## Architecture

### Runtime views

`packages/storefront-kit/kit/commerce.js` gains an account module (kept in its own section, or a file the kit bundles
beside it) that fills the existing `[data-account-gate="<view>"]` slot of `AccountGatePage` with the matching view. The
store's account page files already exist:

| View | Page |
|---|---|
| sign in, verification | `acceso-ingresar.html` (verification arrives as `?verificar`) |
| sign up | `acceso-registro.html` |
| forgot password | `acceso-olvide-mi-contrasena.html` |
| reset password | `acceso-restablecer-contrasena.html` |
| orders, addresses, profile, subscriptions | `cuenta-pedidos.html`, `cuenta-direcciones.html`, `cuenta-perfil.html`, `cuenta-suscripciones.html` |

Every element carries a `data-part`: `account`, `card`, `media`, `title`, `lead`, `form`, `field`, `label`, `input`,
`hint`, `submit`, `link`, `error`, `notice`, `nav`, `nav-item`, `list`, `order`, `order-status`, `address`, `empty`,
`danger`. The views reuse the kit classes stores already style (`ui-button`, the `Display`/`Lead` headings,
`Container`), so they inherit each store's look. Text is escaped; no authored HTML is inserted.

Navigation between views uses the store's own pages (the existing page navigation), so the Studio page picker follows.
A signed-out shopper opening a `cuenta-*` page sees the sign-in view in place and returns to that page after signing
in; a signed-in shopper opening `acceso-ingresar` goes to `cuenta-pedidos`. Signed-in views share a small account menu
(Pedidos, Suscripciones, Direcciones, Perfil, Salir).

### Bridge

The runtime never calls the API. It posts `pagosya:account-request { id, action, body }` to its parent and waits for
`pagosya:account-response { id, ok, body }` (15 s timeout, then a retry message).

- Actions (allow-list): `state`, `login`, `register`, `verify`, `forgot`, `reset`, `me`, `update-me`, `orders`,
  `subscriptions`, `addresses`, `export`, `delete`, `logout`.
- Responses carry only what the view draws. `state` answers `{ signedIn, name }`. No response ever contains the session
  token, a verify token or a reset token.
- The parent accepts the message only from the store frame it created, as `pagosya:hosted-request` does today.

### Trusted parents

- **Published store** (`apps/checkout/src/source-storefront.ts`): answers the bridge with the existing customer API
  (`/stores/public/:slug/customers/*`). The token stays in the checkout origin's `localStorage` under the current key
  `pagosya:customer:<slug>`, so existing sessions keep working. An expired or revoked session answers `state` as
  signed out and the view shows a short message.
- **Studio and full-window preview** (`apps/merchant-studio`): answers with demo data. Nothing is sent. Every view shows
  "Vista previa · No se crean cuentas"; forms show success and error states; signed-in views show a demo customer with
  two sample orders.
- **Exported static site** (no trusted parent): the runtime gets no answer to `state` and keeps today's gate link to the
  `/cuenta` app.

### Email links

New verify and reset emails link to the store's pages: `acceso-ingresar.html?verificar` and
`acceso-restablecer-contrasena.html`, with the token in the `#fragment` of the published store's address. The parent
reads the token, removes it from the address bar and keeps it; the store page sends only the new password, and the
parent adds the token to the `reset` / `verify` call. Links in emails already sent keep pointing at `/cuenta`, which
stays.

### Password guard

The parent remembers, for the visit, every password the store page sent through `login`, `register`, `reset` and
`delete`. It drops any other message from the store page (`pagosya:hosted-request` bodies for review, lead, retention,
checkout and content; `pagosya:analytics`; `pagosya:funnel`; search terms) whose text contains one of them, its reverse,
or its base64 form, case-insensitively. Strings shorter than 8 characters are ignored: the API rejects such passwords
(8–128, `store-customers.service.ts`), and matching them would drop ordinary messages. This lowers
the risk; it cannot stop a store that leaks a password one character per message, which the owner accepted.

### Retired

- `source-account-host.ts`, `source-account-slot.js`, `mountSourceAccountPreview` and the `pagosya:account-slot*`
  messages.
- `set_account_appearance` (its four colours are carried into the new theme).
- The `/cuenta` app stays for exported sites and old email links only.

## Look and YAPI

### Automatic

The views read the store's design variables (fonts, colours, radius, border weight, button style from the DNA). A newly
generated store's account pages match it without any YAPI step; existing stores pick it up without regenerating.

### Account theme

Stored in `config.accountTheme { layout, photo?, css? }` and carried over between saves like `productAssurances`, so it
survives edits and redesigns; applied by the runtime as a scoped style element.

- `layout`: `card` (centered card, the default), `split` (form beside one of the store's photos), `minimal` (no card,
  full width), `panel` (form column beside a short welcome text). Signed-in views use the same frame.
- `photo`: an `assets/` path of the store, for `split`.
- `css`: sanitized by a new `account-theme-css.ts` built like `product-theme-css.ts`: selectors only on the account's
  `data-part` names, a property allow-list with numeric bounds, scoped to `[data-account-gate]`, size limits, fail
  closed, with a report of what was dropped. The parts `input`, `submit`, `error` and `link` may be restyled but never
  hidden, covered, made transparent or shrunk below a usable size.

### YAPI tool

`set_account_theme { layout, photo?, css? }` replaces `set_account_appearance`. On a new store or a redesign the agent
picks a layout and may add CSS in the same step where it sets the product-page theme; if it skips it, the store gets
`card` with its tokens. On a normal edit the tool is offered only when the request concerns sign-in, sign-up or the
account. Existing `set_account_appearance` values are converted to equivalent theme CSS when a design is loaded.

### Verification

The agent's `verify` renders the sign-in and sign-up views at 1280 and 390 px and fails when any field, the submit
button, an error message or the switch links are hidden, covered, clipped or unreadable, then removes the CSS that
caused it, as the product-page check does (`product-theme-check.ts`).

## Errors

Each form shows the API's message in its `error` part (wrong password, "Confirma tu correo", email in use, weak
password, expired link) and keeps the typed values. Network failures show "No pudimos conectar. Inténtalo de nuevo.".
A parent that does not answer within 15 s gets a retry message. Throttling is unchanged on the API. Account deletion
keeps its password confirmation; data export downloads through the parent, never through the store page.

## Testing

- **Runtime views** (kit tests): each view renders with its `data-part` names; signed-out and signed-in routing;
  errors keep typed values; the preview never sends anything; text is escaped.
- **Bridge** (checkout and Studio tests): only allowed actions; replies go only to the requesting store frame;
  verify and reset tokens never reach the store page; no reply contains a token.
- **Password guard:** review, lead, analytics, funnel and search messages containing a sent password, its reverse or
  its base64 form are dropped; ordinary messages pass.
- **Theme sanitizer:** allowed properties pass; protected parts cannot be hidden; oversized or unparsable input
  produces nothing.
- **YAPI:** `set_account_theme` is saved in the design and survives an edit; `verify` catches a hidden field; old
  `set_account_appearance` values convert.
- **Browser:** on a published dev store, sign up, verify, sign in, reset and view orders with a real account; the
  account page scrolls without the form sliding; phone width; two stores with different layouts side by side.

## Rollout

Ships for every store at once (the views live in the shared runtime). The overlay code is removed in the same change.
