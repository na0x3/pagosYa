# Account, checkout and the path to them, drawn per store

Status: draft for owner review, 2026-10-11.
Related: `2026-10-11-elige-tu-estilo-design.md` (the style cards), `2026-10-10-frame-hero-draw-design.md` (the draw), `2026-10-08-store-built-in-account-pages-design.md` (the account pages this restyles).

## Why

The owner: the sign-up form, the form before paying, and even the way to get there look the same in every store. A code read on 2026-10-11 found three reasons:

1. **Account forms.** The runtime has four account layouts: card, split, minimal and panel (`account-theme.ts`). Only the agent builder can choose one, through `set_account_theme`. The Sep-5 author, which writes the owner's stores, never does, so every store gets `card`. The submit button also ignores the store's button DNA, because `[data-part=submit]` is not in `KIT_BUTTONS`.
2. **Checkout.** There is one fixed page (`checkout.html` plus `showCheckout` in `commerce.js`). Colours, fonts, buttons and the four review variants change, but the page layout and the look of the fields never do. No catalogue exists for either.
3. **The path.** The DNA already has 4 cart surfaces (drawer, sheet, page, overlay) and 5 "added to cart" moments. The planner is told not to vary commerce controls, so its picks cluster. The cart is always labelled "Mi pedido" or "Carrito".

The payment flow, account security and the data collected stay platform-owned. Only presentation is drawn.

## Design

### 1. Four new parts in the style draw

Every style card's slot (calm and bold) draws these, the same way it draws the header and hero today. They avoid recent stores and recently shown cards through the same history as the style draw (built stores plus `recentStyleCards`), with spread 1:

| Part | Options | Calm leans to | Bold leans to |
|---|---|---|---|
| `account` | card · split · minimal · panel | card, minimal | split (with the store's photo when it has one), panel |
| `checkout` | columns (summary beside) · steps (one column, numbered) · ticket (receipt-style summary) · brand (split with a brand panel or photo) | columns, steps | ticket, brand |
| `fields` | boxed · underline · filled · pill | boxed, underline | filled, pill |
| `cartPath` | the DNA `surfaces.cart` (drawer · sheet · page · overlay) plus `surfaces.added` (its 5 moments) | drawer or page, quiet added moment | sheet or overlay, louder added moment |

"Leans to" is a narrowing, like the calm/bold header lists. An empty narrowing falls back to every option.

The picked card's values go into the built store:
- **Account:** the account theme is saved into the store config for every builder, Sep-5 included (`{ layout, photo? }`, no CSS).
- **Checkout and fields:** two new runtime attributes, `data-dna-checkout` and `data-dna-fields`.
- **Cart path:** the drawn values override `surfaces.cart` and `surfaces.added` in the runtime DNA.

A small edit keeps the saved values. A full redesign draws again.

### 2. Runtime work (`packages/storefront-kit/kit/commerce.js`)

- **Account.** The account submit button joins `KIT_BUTTONS`, so it follows the store's button form, hover and press.
- **Checkout layouts.** CSS keyed on `html[data-dna-checkout=…]` for the four layouts. Same markup, rearranged with CSS grid. `brand` uses a `--checkout-panel` background, which is the store's accent2, or the store photo when the config carries one. `steps` shows the review and payment steps as numbered sections.
- **Field styles.** CSS keyed on `html[data-dna-fields=…]` for inputs and selects in checkout and the account forms.
- All styles read the existing `--store-*`, `--brand-*` and `--ui-*` tokens. No new colours.
- Contrast and 44px tap targets hold in every combination, and nothing overflows at 320px.
- With the attributes absent, today's look is unchanged.

### 3. The cart's own word

The cart button and the drawer title use one word per kind of business, taken from the playbook kind. The `[data-cart-count]` count is unchanged.

| Kind | Word |
|---|---|
| café | Tu pedido |
| bakery | Tu caja |
| clothing | Tu bolsa |
| beauty | Tu neceser |
| flowers | Tu ramo |
| crafts | Tu selección |
| fitness | Tu plan |
| services | Tu solicitud |
| general | Tu carrito |

It is exposed as `config.cartWord`, and the runtime uses it where it writes "Mi pedido" or "Carrito" today. The Sep-5 author is told to use the same word in the header.

### 4. Cards and preview

The style card itself is unchanged: it shows the header and hero. The preview side panel adds one line, for example "Cuenta: dividida · Pago: ticket · Carrito: hoja", so the merchant knows the choice carries through. That line is plain text from the drawn ids.

## Not in scope

- New account flows, new checkout fields, new payment steps, or a different checkout copy voice.
- Letting the model write checkout or account markup.
- Changing stores that already exist. They keep today's look until a full redesign.

## Flags

Everything sits behind the existing `YAPI_STYLE_PICK=1`, since it rides on the style draw. Runs without it, and stores without the new config keys, are byte-identical to today.

## Testing

- **Draw:** each new part rotates over seeds; calm and bold narrowing holds; history is avoided; an empty narrowing falls back.
- **Build:** the picked slot's account layout, checkout layout, fields and cart path reach `config.js`, Sep-5 included; a small edit keeps them; a redesign redraws.
- **Runtime:**
  - with each attribute value, the checkout and account markup get the expected classes or computed styles (jsdom where possible);
  - absent attributes leave today's CSS unchanged;
  - the account submit follows the button DNA;
  - the cart word is shown and the count is unchanged.
- **Visual check in Chrome:** each checkout layout × field style at 390 and 1440 for one calm store and one bold store; the account forms in each layout.
- **Live:** build one store from each card and walk product → cart → checkout → account in the browser.
