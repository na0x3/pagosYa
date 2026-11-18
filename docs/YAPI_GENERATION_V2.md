# YAPI generation V2 — target architecture

Status: **target, not built.** Today's live engine is section fill ([YAPI_CURRENT_ARCHITECTURE.md](YAPI_CURRENT_ARCHITECTURE.md)).
The owner decided on 2026-11-13 to keep section fill as the only engine for two weeks; this document describes where it grows to,
so that short-term work lands on the right interfaces. The order and the decision gates are in
[YAPI_MIGRATION_PLAN.md](YAPI_MIGRATION_PLAN.md).

Goal: Lovable-level design freedom on top of YAPI's existing commerce runtime, without a second commerce backend and without a
second generation engine running beside the first. **This is a full-storefront engine, not a landing-page generator**: home,
catalogue, product pages, cart, login and account, order history and checkout all get brand-specific design (§12), while
authentication, prices, stock, payments, orders and business rules stay with trusted YAPI code.

## 1. One pipeline, typed stages

V2 is not a new engine next to section fill. It is section fill's own pipeline, with every stage given a typed input and output so
that richer stages can replace simpler ones one at a time:

```
MerchantContext ─▶ Plan ─▶ Compose ─▶ Render ─▶ Inspect ─▶ Repair ─▶ Save (new revision) ─▶ Publish (pointer move)
                                        ▲                     │
                                        └─── bounded loop ────┘
```

| Stage | Today (section fill) | V2 |
|---|---|---|
| MerchantContext | `libraryFacts` (`LibraryFacts`) | `MerchantContext` v1 — same facts, typed, with verified facts and generated words kept apart (§2) |
| Plan | implicit: the template's own home order | `DesignPlan` v1 — whole-page plan (§3) |
| Compose | `composeLibrary` + `validateLibraryLayout` + `with*` passes | emits a `PageSpec` (§4) of library, parametric and custom nodes |
| Render | `refillDraft` + `withVisualSandbox` | unchanged; custom nodes come in as built artifacts (§7) |
| Inspect | `templateQaFindings` (log only) | `Finding[]` from deterministic rules + vision review (§5) |
| Repair | none on section fill; `applyComposerChanges` in the dormant composer | `PatchOp[]` applied to the `PageSpec` (§6) |
| Save | `templates.refill` → `StoreSourceVersion` | unchanged, plus spec + ops + metrics in the revision |
| Publish | `SourcePublishingService.publish` | unchanged |

The rule for every stage: **the model proposes, typed code decides.** Each model output is a schema-validated proposal; what is
saved comes out of deterministic validation that only knows real ids.

## 2. MerchantContext v1

One normalised object per build, assembled from the database (never from the chat transcript alone):

```ts
type MerchantContextV1 = {
  version: 1;
  facts: {                       // verified — the model may reference, never invent
    store: { id: string; name: string; checkoutMode: 'payment' | 'whatsapp' | string; locations: LocationRef[] };
    products: Array<{ id: string; name: string; categoryIds: string[]; photoIds: string[]; hasOptions: boolean }>;
    categories: Array<{ id: string; name: string }>;
    media: Array<{ id: string; url: string; width: number; height: number; backdrop?: { hex: string; uniformity: number }; composite?: boolean }>;
    codes: Array<{ id: string; code: string }>;   // only public ones
    packs: Array<{ id: string; productIds: string[] }>;
    delivery: Array<{ zoneId: string; label: string }>;
  };
  voice: { request: string; answers: string[] };  // the merchant's own words, verbatim
};
```

- **Prices, stock, delivery prices and promises are not values the model writes.** The page places them through commerce mounts
  that read the platform at runtime (§8), so a model cannot misstate them.
- The model refers to products, photos, codes and packs **by id**. Validation drops anything that is not an id in `facts`.
  (Today `validateLibraryLayout` matches exact product names and photo indexes; moving to ids is a mechanical change.)
- Generated marketing words live only in the `PageSpec`, never in `facts`.

## 3. DesignPlan v1

The whole-page decision made before any section is written:

```ts
type DesignPlanV1 = {
  version: 1;
  direction: { idea: string; mood: 'calm' | 'colourful'; references?: string[] };
  type: { pairId: string; scale: 'quiet' | 'regular' | 'loud' };
  colour: { paper: string; ink: string; muted: string; accent: string; deep: string; strategy: 'photo-ground' | 'brand' | 'mono' };
  shape: { corners: 'sharp' | 'soft' | 'round' | 'pill' | 'cut'; hover: 'lift' | 'sweep' | 'arrow' | 'glow' | 'press' };
  density: 'airy' | 'regular' | 'compact';
  sequence: Array<{ role: 'cover' | 'products' | 'story' | 'proof' | 'offer' | 'place' | 'closing' | string; mediaId?: string; why: string }>;
  mobile: { navigation: 'drawer' | 'bar'; coverCrop: 'whole' | 'focus'; stackOrder: 'media-first' | 'text-first' };
  needs: Array<{ role: string; reason: string }>;   // what the catalogue cannot express — input to custom nodes later
};
```

Most of it already exists in pieces: `MasterLook` (colours, shape, clean), `brandStyleLook` (type), `groundPalette` (colour from
the cover photo), `pickDesignPlan` in `home-directions.ts` (chassis plan), `write_brief` (studio brief). V2 consolidates them into
one schema. `needs` is new: it is how the planner says «this layout is not in the library», and it is the evidence that will
decide whether custom components earn their cost.

## 4. PageSpec v1 — three kinds of node

```ts
type PageSpecV1 = { version: 1; page: 'home' | 'product' | 'about' | string; nodes: PageNode[] };

type PageNode =
  | { kind: 'library'; id: string; type: string; look?: string; band?: Band; content: LibraryContent }   // Type 1
  | { kind: 'param';   id: string; type: string; props: ParamProps; content: LibraryContent }          // Type 2
  | { kind: 'custom';  id: string; artifact: ArtifactRef; content: CustomContent };                    // Type 3 (future)
```

- **Compatibility adapter:** today's `LayoutBlock` is a `library` node. `fromLayout(blocks)` / `toLayout(nodes)` convert
  losslessly for library nodes, so every existing store reads as a v1 spec with no migration of stored data. Library nodes keep
  rendering through `library.tsx`.
- **Parametric nodes** are library sections whose layout is opened up through validated props instead of new templates:
  `columns`, `mediaSide`, `mediaRatio`, `align`, `scale`, `gap`, `maxWidth`, `bleed`. Each section declares which props it accepts
  and their ranges in its catalogue entry; the validator rejects the rest. This is the step that gives two brands in one industry
  different compositions with no new template per layout.
- **Custom nodes** reference a built artifact (§7). They are not built yet; the interface is fixed now so nothing short-term has
  to be undone.
- Mixing is free: a page is a list of nodes of any kind. Commerce always arrives through mounts, whatever the node kind.

## 5. Inspect — findings

```ts
type Finding = {
  rule: string;                       // stable id, e.g. 'text-only-band', 'h-overflow', 'title-under-photo'
  source: 'rule' | 'vision';
  viewport: 'desktop' | 'phone';
  at: number | null;                  // node index (from data-lb-at), null = page level
  severity: 'block' | 'advice';
  note: string;
};
```

- **Deterministic rules** run inside the render sandbox (`page.evaluate`): contrast, text-only bands, horizontal overflow,
  broken or blurred images, title collisions, tap targets on the phone. They are measurable, cheap and identical every run.
- **Vision review** looks only for the subjective problems rules cannot measure (hierarchy, balance, «two sections look the
  same», «unfinished»), from a closed list, at desktop **and** phone widths.
- The phone is first class: every rule runs at 390 px, and a phone-only finding blocks like a desktop one.

## 6. Repair and edit — one patch language

```ts
type PatchOp =
  | { op: 'look'; at: number; value: string }        // one of that section's declared looks
  | { op: 'band'; at: number; value: Band | null }
  | { op: 'photo'; at: number; mediaId: string }
  | { op: 'move'; at: number; to: number }
  | { op: 'remove'; at: number }
  | { op: 'swap'; at: number; type: string }          // then a rewrite of that node only
  | { op: 'props'; at: number; props: Partial<ParamProps> }   // parametric nodes
  | { op: 'content'; at: number; fields: Partial<LibraryContent> }
  | { op: 'replace'; at: number; node: PageNode };    // e.g. a custom node, later
```

- The same ops serve the inspect→repair loop and the merchant's chat edits («move this above the products» → `move`, «make the
  hero more editorial» → `look`/`props` on the cover, «change only the phone menu» → a phone-scoped `props` op on the header).
  `applyComposerChanges` (`source-composer.ts`) is today's implementation of the first six; it becomes `applyPatch`.
- Every applied list of ops is saved with the new revision (affected node ids), so rollback is «restore revision N» (exists) and a
  diff is «the ops between N and N+1».
- Guards live in the applier, not in prompts: the cover never moves, the main grid is never removed, a signature section never
  swaps, a look must be one the section declares.
- The loop is bounded (rounds and budget), and a round whose result has more blocking findings than its input is thrown away.

## 7. Custom components and the build sandbox (future)

Custom nodes are presentation only — hero layouts, editorial grids, galleries, storytelling, motion. The contract:

- **Source shape:** one TSX module with a default export `(props: { content; tokens; commerce: CommerceView }) => JSX`, plus one CSS
  file whose every selector is scoped to the component root (`@scope ([data-node="<id>"])`). No `!important`, no element or `:root`
  selectors, no `@import`.
- **Allowed imports:** `react`, the kit's presentation UI (`kit/ui.tsx` exports), and `@pagosya/commerce-view` (§8). Nothing else:
  no `fetch`, no `window.PAGOSYA_*`, no storage, no `eval`.
- **Build sandbox:** a separate worker process, not the API process: no environment secrets, no network, a temp working directory,
  CPU / memory / wall-clock limits, esbuild with an import allowlist, a TypeScript check, and the lint rules above. Output: a bundle
  plus a digest, stored as a design-artifact record (`StoreSourceDesignArtifact` exists). Errors come back as structured findings
  for a bounded rewrite.
- **Render:** the storefront loads custom nodes only by artifact digest. The render sandbox (`withVisualSandbox`) already serves
  only snapshot bytes with `connect-src 'none'`.
- Today's studio writer compiles model TSX inside the API process. V2 does not grow that path; the build sandbox replaces it when
  custom nodes start.

## 8. Commerce presentation interface

The `data-pagosya-*` mounts already are the commerce interface. V2 gives them a typed face for custom code:

```ts
interface CommerceView {
  ProductCard(props: { productId: string; look?: string }): JSX.Element;    // a kit card: real name, price, stock, add
  Price(props: { productId: string; variantId?: string }): JSX.Element;    // drawn by the kit from runtime data
  AddToCart(props: { productId: string; variantId?: string; label?: string }): JSX.Element;
  VariantPicker(props: { productId: string }): JSX.Element;
  CartButton(props: { label?: string }): JSX.Element;
  Catalog(props: { productIds?: string[]; categoryId?: string; layout?: 'grid' | 'row' }): JSX.Element;
  Delivery(props: { variant?: 'zones' | 'line' }): JSX.Element;
  Pack(props: { packId: string }): JSX.Element;
}
```

Each component renders a mount element that the kit fills at runtime. Generated code never receives a price, stock count or
payment handle as a value, so it cannot alter one. Checkout, payment authorisation, stock and credentials stay in `apps/checkout`,
the kit and the API, untouched. The kit's commerce UI is customised through tokens and declared looks, the same as sections.

## 9. Styling without new layers

- **Tokens:** the `DesignPlan`'s colour, type, shape and density become CSS custom properties on the store root (today:
  `--es-*` from `masterThemeCss`). Components read tokens; they never hard-code a theme.
- **Scoped section styles:** each library section owns its CSS, scoped to `[data-lb="<type>"]`, and ships only when used (the
  247 `lb:` markers are the start of this). Theme differences become token values or section looks, not theme-scoped selectors.
- **No new global rules.** Any short-term visual change is a token, a look already in the catalogue, or a data op — never a new
  theme block or `!important`.
- The 485 KB `globals.css` shrinks as sections move to scoped files; that is a migration track, not a rewrite (plan, Track C).

## 10. Asset intelligence

Extends what sharp already measures (`photoBackdrop`, `productGrounds`, `photoComposite`, `withSharpCover`) into the `media`
entries of `MerchantContext`: width/height, aspect ratio, backdrop colour and uniformity, composite flag, plus a vision label
(«product on plain ground», «lifestyle scene», «flat lay», «design board») cached per upload. The planner chooses cover, category
and product images from those facts; a photo below the cover's needed width never fills it (the `withSharpCover` rule).
Generated images, when added, are separate media with `origin: 'generated'`; originals are never replaced.

## 11. Observability

One structured event per stage — `generation_stage {storeId, revision, stage, ms, usd, model, retries, outcome, findings}` —
written where `productLogger` writes today, with the existing metering for cost. A build's trace is the list of its stages, and
the two-week benchmark reads the same events.

## 12. Full storefront, page by page

### 12.1 The trust boundary that already exists

YAPI already separates presentation from commerce the way headless storefronts do (Medusa's Next.js starter keeps commerce
calls in a server data layer with the cart id and auth token in `httpOnly` cookies; Hydrogen keeps them in route handlers and a
customer-account package). YAPI's split is stricter, because the store's page never holds a session at all:

```
┌──────────────── trusted host (apps/checkout) ────────────────┐        ┌──── store document (framed) ────┐
│ source-storefront.ts   frames the store, routes navigation    │◀──────▶│ generated presentation           │
│ account-session.ts     shopper session, never leaves the host │ post-  │ + kit commerce.js (mounts)       │
│ account-bridge-handler answers PAGOSYA_ACCOUNT_REQUEST         │ Message│   PAGOSYA_HOSTED_REQUEST(action) │
│ cart-state / cart-quote, checkout/payment-form.ts, results    │        │   PAGOSYA_ACCOUNT_REQUEST(action)│
└───────────────────────────────┬───────────────────────────────┘        └──────────────────────────────────┘
                                ▼
                 YAPI API (source of truth): products, variants, stock, prices, promo codes, packs, shipping,
                 orders, payments, accounts. /cart-checkout re-prices every order from the database
                 (store-checkout.service.ts), so nothing the page sends can change what is charged.
```

- The store document (`packages/storefront-preview/src/source-preview.ts`) defines `PAGOSYA_HOSTED_REQUEST` and
  `PAGOSYA_ACCOUNT_REQUEST` as `postMessage` calls to the parent. The kit (`commerce-src/shared/state.js`) maps its calls to a
  fixed list of actions (checkout, lead, shipping quote, review, content; account actions). The host decides what each does.
- Account pages are drawn by the kit (`commerce-src/account/pages.js`: 4 layouts + `accountTheme` tokens) and styled by the
  store; the host keeps the session and calls the API.
- Checkout is one calm checkout in the host (`checkout-branding.ts` takes only name, logo, photo and accent).

V2 keeps this boundary exactly. What changes is how much of each page's **presentation** the AI may design.

### 12.2 Trust rules (every page, every phase)

1. **Every write is an allowlisted action executed by the host.** Generated code cannot add actions; it can only render the
   kit components that call them.
2. **Generated code gets read-only view models.** Prices, totals, stock and order amounts arrive as kit-drawn elements or
   pre-formatted strings, never as numbers it is asked to compute with.
3. **Generated code never sees a session, token or cookie.** The store document has no access to the host's storage, and
   custom modules are linted to refuse any `PAGOSYA_*` global, `fetch`, storage or `postMessage` (§7).
4. **Forms that collect credentials or payment are always trusted forms** (kit- or host-drawn, `trusted-form.ts`). Generated
   code may frame them, never re-implement them.
5. **The server re-validates everything**: prices, stock, codes, shipping and accounts are decided in the API, whatever the page
   shows.

### 12.3 Pages

Freedom grows in three steps per page: **tokens + declared looks** (today) → **parametric layout** (Phase 3) → **custom
presentation components** (Phase 5). The trusted column never moves.

| Page | Drawn by today | Design control today | Parametric step | Custom-component step | Always trusted |
|---|---|---|---|---|---|
| **Home** | `library.tsx` sections (`layout`) | full section composition, looks, bands, tokens | section props (columns, media side/ratio, scale, bleed) | any presentation node; commerce via `CommerceView` | catalogue data, prices, packs, codes, cart actions |
| **Product page** | kit `product/page.js` from `product.html` + `productLayout` sections | 11 `pdp` layouts, `pdpOrder`, sections under the buy box, `data-part` hooks | gallery / info arrangement, sticky bar, sections above and below | gallery, story and usage sections; buy box assembled from `Price`, `VariantPicker`, `AddToCart`, `Delivery` | price, variant availability, stock, add to cart, personaliser rules |
| **Catalogue / collection** | kit `catalog/render.js`, `filters.js` (`productos.html`, `coleccion.html`) | `grid` 7, `card` 5, `cards` 4, `filters` 4 | grid density, card arrangement, header | collection header, editorial interludes; cards composed around `ProductCard` slots (media, name, price) | filtering, sorting, search, stock badges, prices |
| **Cart** | kit `cart/drawer.js`, `lines.js`, `merman.js` | side panel, kit tokens | drawer framing, empty state, upsell area placement | drawer shell, empty state, cross-sell presentation | lines, quantities, totals, shipping quote, promo and pack discounts |
| **Login / register / password** | kit `account/pages.js` | 4 layouts + `accountTheme` | framing (side photo, copy, alignment) | the page around the form (brand panel, imagery, copy) | the form fields (`trusted-form`), submission via `PAGOSYA_ACCOUNT_REQUEST`, session in the host |
| **Account / orders / addresses / subscriptions** | kit `account/pages.js` (signed-in views) | 4 layouts + tokens | list/card arrangement | page framing; order cards rendered from a read-only order view model | order data, address and subscription changes (account actions only) |
| **Checkout** | host `checkout/shell.ts`, `payment-form.ts`, `payment-result.ts` | name, logo, photo, accent | type, radius, colour tokens within a contrast guard | one brand panel beside the summary (image + words), nothing inside the form | contact, shipping, payment method, payment authorisation, result |
| **WhatsApp ordering** | kit `checkout/submit.js` (`checkoutMode: 'whatsapp'`) | button style | — | button and confirmation presentation | the order message built from the real cart |

Checkout is last and gets the least freedom on purpose: it is where a design error costs a sale or a payment.

### 12.4 How custom components reach each page

- Each page is a `PageSpec` (§4): `home`, `product`, `catalog`, `collection`, `cart`, `account:login`, `account:orders`, …
  The kit already loads page templates (`kit-templates.js`, `productTemplateHas`), so a page spec maps onto an existing template
  slot rather than a new route system.
- A custom node on a commerce page declares the **slots** it fills (`gallery`, `story`, `belowBuy`, `cardMedia`, `emptyCart`,
  `accountAside`, …). A page type exposes a fixed slot list; a node outside it is refused by the validator.
- The kit keeps drawing the trusted parts and exposes them to custom code only as `CommerceView` components (§8), extended per
  page: `BuyBox` parts for the product page, `CartLines` / `CartTotals` / `CheckoutButton` for the cart, `AccountForm(view)` and
  `OrderList` for accounts. They render kit mounts; the kit fills them at runtime.
- Each page passes the same inspect → repair loop (§5–6) at desktop and phone, plus a **functional probe** per page type that
  already exists in part (`probeSourceShopping`): add to cart, change a variant, open the cart, reach checkout, open login. A
  custom node that breaks a probe is refused.

### 12.5 Page-by-page migration (none built yet)

Each step is its own benchmark round on the seven brands, behind its own flag, and existing stores keep rendering throughout.

| Step | Page | Needs first | Done when |
|---|---|---|---|
| P1 | Home — parametric, then custom nodes | Phases 2–5 of the migration plan | home acceptance on the seven brands |
| P2 | Product page — sections above/below the buy box as nodes; buy box from `CommerceView` parts | P1, buy-box parts exposed by the kit | add-to-cart, variant and personaliser probes pass on all seven |
| P3 | Catalogue / collection — header + card composition around `ProductCard` slots | P1 | filter / sort / search probes pass; cards still show real price and stock |
| P4 | Cart — drawer shell, empty state, cross-sell | P2 | totals equal the host's quote on every probe |
| P5 | Login / account / orders — framing around trusted forms and read-only order views | P1 | sign-in, sign-up, order list probes pass in the hosted frame |
| P6 | Checkout — tokens + one brand panel | P4, owner sign-off | payment and WhatsApp probes pass; contrast guard holds |

## 13. What V2 does not change

Commerce runtime, checkout, payments, orders, stock, discounts, delivery, the publish gate, append-only versions, pointer
publication, the lease-based job queue and «sigue» resume, the provider switch. Existing stores keep rendering: their layouts are
v1 specs made of library nodes.
