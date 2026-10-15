# Business tools: YAPI builds selling tools for each business (spec 2026-10-14)

## Why

The owner (2026-10-14): "i want yapi to write forms like subscription forms, like forms that have to do with the business for example a milk business a price calculator per litre of milk discount."

This is the business playbook's reserved track B ("a working tool per business", `2026-10-11-business-playbook-design.md:28,56,100`).

### Owner decisions (brainstorming 2026-10-14)

- **Tools really sell.** The calculated result goes into the cart or a real subscription and is paid through pagosYa.
- **First version has four kinds:**
  - quantity calculator;
  - subscription sign-up;
  - builder / configurator;
  - quote or booking request.
- **Pricing numbers:** YAPI proposes, the merchant approves. No tool takes a payment before approval.
- **Approach (recommended, owner delegated the choice):**
  - Tools are data, drawn by tested kit renderers.
  - The server prices every line from approved product rules.
  - YAPI designs each tool: kind, products, words, layout, placement, proposed numbers.
  - A later round may add guarded markup slots around the working parts.

### What exists (research 2026-10-14)

- **The server prices every cart line.** The client is never trusted.
  - `POST /v1/stores/public/:slug/cart-checkout` (`stores-public.controller.ts:59`) goes to `createCartCheckout` (`apps/api/src/stores/store-checkout.service.ts:60`).
  - That computes `discountedProductAmount(variant ?? amount) + extras` (`:161`) and subscription prices (`apps/api/src/operations/subscription-pricing.ts:43`).
  - Then promo or bundle, whichever is best (`:213-219`), then shipping and store credit.
- **Cart line DTO** (`apps/api/src/payment-links/dto/cart-checkout.dto.ts:6-33`) has `paymentLinkId`, `variantId`, `extraIds`, an integer `quantity` (1–999) and `subscriptionCadence`.
- **Product pricing** (`PaymentLink`, `schema.prisma:1554`) has `amount`, `variants` (absolute prices), `extras` (additive) and a time-windowed `discountPercent`. `StoreBundle` MIX_MATCH (store-wide "N units, X % off") is the closest thing to volume pricing. There are no per-product tiers and no unit label.
- **Subscribe & Save:**
  - per-product cadence and discount (`ProductSubscriptionOption`, `schema.prisma:1638`);
  - enrolment on payment (`operations/subscription-enrollment.ts:29`);
  - renewal bills paid through an emailed link (`OperationsWorker.maintain`);
  - no auto-charge (blocked on dLocal card storage, `project_subscribe_and_save`).
- **Leads:**
  - `POST :slug/leads` (`stores-public.controller.ts:75`) with priced items and a 600-character message;
  - stored as `StoreLead` (`schema.prisma:1142`);
  - shown in the dashboard inbox;
  - the merchant is emailed.
  - Abuse protection is rate limits and `@IsSafeText` only.
- **No kit widget mount from config and no public add-to-cart JS API** (`packages/storefront-kit/kit/commerce.js`). `data-add`, `data-pagosya-contact` and the bundles, reviews and blog mounts are the nearest patterns.

## Sub-projects, in order

- **a.** Selling primitives (server-priced).
- **b.** The tool record and the kit's four renderers.
- **c.** YAPI authoring and merchant approval.

Each gets its own implementation plan. b depends on a; c depends on b.

### a. Selling primitives

All new pricing is computed on the server in `createCartCheckout` and in a new priced-quote function that shares the same code. The browser never sends an amount.

**1. Selling by unit.**
- `PaymentLink.unit` (JSON, nullable) is `{ label: string /* 'L','kg','m²','persona',… ≤ 12 chars */, step: number /* e.g. 0.5 */, min: number, max: number }`.
- A cart line's `quantity` counts steps (0.5 L × 40 = 20 L). The per-line cap becomes `max / step` (still an integer).
- The server computes:
  - `units = quantity × step`;
  - `lineAmount = round(unitAmount × units)` in whole cents, where `unitAmount` is the product's (or tier's) price per unit.
- Orders, receipts and invoices show «20 L».
- `unidadMedida` (the SIAT code) is unchanged.

**2. Volume tiers.**
- `PaymentLink.tiers` (JSON, nullable) is `[{ from: number /* units */, unitAmount: number }]`, sorted ascending.
  - `unitAmount` must strictly decrease as `from` increases.
  - The first tier's `from` equals `unit.min`.
- The server picks the highest tier whose `from ≤ units`.
- **Order of discounts:**
  1. tier unit price;
  2. the time-windowed `discountPercent`;
  3. the Subscribe & Save cadence discount (for subscription lines);
  4. promo or bundle on the subtotal, as today (best single offer wins).
- Tiers on products with `variants` are out of scope. A tiered product has no variants.

**3. Builder option groups.**
- `PaymentLink.optionGroups` (JSON, nullable) is `[{ id, label, type: 'single' | 'multi' | 'text', required: boolean, choices?: [{ id, label, amountDelta: number }], maxLength?: number /* text ≤ 140 */ }]`.
- The cart line gains `options?: Record<groupId, string[] | string>`.
- The server:
  - validates required groups, choice ids and text length (with `@IsSafeText`);
  - adds the deltas to the unit price;
  - stores the chosen labels and text on the order line for orders, receipts and the merchant.
- Existing `variants` and `extras` keep working unchanged.

**4. Request fields and deposits.**
- `submit-store-lead.dto.ts` gains:
  - `toolId?`;
  - `fields?: Array<{ id: string; value: string }>`, max 12 answers.
- When `toolId` is set, the server loads the approved tool's field list. It:
  - rejects unknown or missing required ids;
  - checks types: text ≤ 400 characters, number, ISO date, a choice from the list, phone.
- Labels and values are stored on `StoreLead` (new `fields` JSON) and shown in the inbox and the merchant's email.
- **Deposit:** a real product (`request.deposit` → `productId`) the merchant approves, paid through the normal checkout after the request is sent. The lead links to the order.

**5. Abuse protection on request forms:**
- a honeypot field;
- a minimum fill time of 3 s (signed timestamp issued with the form);
- a per-visitor throttle of 3 per 10 minutes;
- an existing per-store throttle.

**6. Pending proposals.**
- `PaymentLink.pricingProposal` (JSON, nullable) holds YAPI's proposed `unit`, `tiers`, `optionGroups` and subscription cadences or discount.
- The server never prices from it.
- Approval (sub-project c) copies it into the live fields in one transaction and clears it.

**7. Priced quote.**
- `POST /v1/stores/public/:slug/price-quote` takes the same line shape as cart-checkout and returns the per-line and total amounts, with the tier applied and the next tier.
- It is throttled like shipping quotes.
- It shares the pricing code with checkout, and a test asserts they agree.

### b. The tool record and kit renderers

**`StoreTool` model** (new table):
- fields: `id`, `storeId`, `kind`, `status`, `definition` (JSON), `createdAt`, `updatedAt`, `approvedAt`;
- each store has at most 4 tools;
- saves copy approved and draft definitions into `config.tools` (draft ones are flagged so the kit renders them only in preview).

```ts
type StoreToolDefinition = {
  id: string; kind: 'calculator' | 'subscribe' | 'builder' | 'request';
  title: string; intro?: string;                     // from the voice sheet's words
  words: { cta: string; total?: string; saving?: string; done?: string };
  layout: 'inline' | 'card' | 'split' | 'steps';
  calculator?: { productId: string; presets: number[]; showTiers: boolean };
  subscribe?: { productId: string; cadences: Array<'weekly' | 'biweekly' | 'monthly'>; defaultUnits?: number };
  builder?: { productId: string; steps: string[] /* optionGroup ids */; summary: boolean };
  request?: { fields: Array<{ id: string; label: string; type: 'text' | 'number' | 'date' | 'choice' | 'phone'; required: boolean; choices?: string[] }>; deposit?: string /* productId */; reply: string };
};
```

**Mount.** The page carries `<div data-pagosya-tool="<id>"></div>`. `commerce.js` renders the matching tool. The four renderers are separate, tested components:

- **Calculator:**
  - a unit stepper and preset chips;
  - a live total;
  - the tier applied («desde 15 L: Bs 7,20/L — ahorras Bs 16»);
  - the next tier («3 L más para Bs 6,90/L»);
  - its button adds the line («Añadir 20 L»).
- **Subscribe:**
  - product, amount and cadence;
  - the price per delivery with the cadence discount;
  - the renewal line «Te enviamos el link de pago antes de cada entrega», never a promise of auto-charge;
  - its button adds a subscription line («Suscribirme»).
- **Builder:**
  - steps through the option groups;
  - a running total;
  - a summary card;
  - «Añadir al pedido».
- **Request:**
  - the fields, with honeypot and timestamp;
  - sends to the leads endpoint with `toolId` and `fields`;
  - shows `reply`;
  - with a deposit, continues to checkout for the deposit product.

**Shared rules for all four.**
- **Totals.** The total shown is the server's price-quote result. A local estimate shows instantly, then is replaced. If the quote fails, the add button is disabled with a plain message.
- **Styling** comes from `config.look` and `config.controls` (`2026-10-14-store-controls-design.md`).
- **Layout and accessibility:**
  - works at 390 and 1440;
  - labelled inputs;
  - fully usable by keyboard;
  - errors are announced.
- **Status:**
  - `draft` renders only in preview and Studio, with a merchant-only banner «Números por aprobar».
  - `approved` renders on the live store.
  - `hidden` renders nothing.
- **Missing, unpublished or out-of-stock products:** the tool hides itself.

### c. YAPI authoring and approval

**When.**
- **First builds and redesigns.** One `tools` call runs after the style is picked, in parallel with the author. It decides 0–2 tools, their kinds and their placement. A tool is never forced.
- **Chat requests** («agrega una calculadora por litro», «quiero que se suscriban cada semana», «un formulario para pedir diagnóstico») run the same call for one tool, saved with that edit.

**Input:**
- the business kind and playbook;
- the voice sheet (`2026-10-14-store-voice-design.md`);
- products with prices, variants and extras;
- existing subscription options;
- the sibling stores' tools, to avoid repeats.

**Output:**
- the tool definition;
- the placement (which section the mount goes after);
- a `pricingProposal` for each product it needs;
- one Spanish chat note, e.g. «Agregué una calculadora por litro con precio por volumen; revisa los números antes de publicar.».

**Proposal checks (code).**
- Tiers derive from the product's real price.
- Each discount is at most 30 %.
- Tiers strictly decrease.
- Option deltas are ≥ 0 and at most 3× the base price.
- A deposit is at most 50 % of the cheapest related product, or merchant-set.
- Request fields: at most 12, no fields asking for payment details or government IDs.
- An unusable proposal drops the tool, never the build.

**Placement.** The author writes the mount and its heading and intro, from the voice sheet, at the placement given.

**«Herramientas por aprobar»** (Studio sidebar, plus a count on the store card in Mi tienda).
- Each tool shows its preview and an editable table of proposed numbers:
  - unit;
  - tiers;
  - option prices;
  - cadences and discount;
  - deposit.
- **Aprobar:**
  - validates with the same checks;
  - copies the proposal into the product's live fields;
  - sets `status: approved` (one transaction).
- **Ocultar** sets `hidden`.
- Publishing is never blocked; an unapproved tool simply does not render on the live store.

## Testing

**Unit tests:**
- unit and tier math, rounding to the cent;
- option pricing and validation;
- request field validation;
- honeypot and fill time;
- proposal checks (descending tiers, the 30 % cap, deposit limits);
- tool definition sanitizer.

**Checkout tests:**
- server pricing for unit lines, tiers, options, and subscription with tier and cadence discounts;
- discount order;
- price-quote equals checkout;
- a tampered client (a lower amount, unknown option, or units beyond max) is refused or ignored;
- `pricingProposal` is never used to price.

**Kit browser tests:**
- each renderer at 1440 and 390;
- keyboard use and errors;
- the draft banner only in preview;
- hidden when the product is gone.

**Generation tests:**
- the tools call runs in parallel with the author;
- proposals stay pending until approved;
- chat tool requests;
- an unusable proposal drops only the tool.

## Live check

Uses the ChatGPT plan and needs owner approval.
- A dairy store gets a per-litre calculator and a weekly subscription.
- Brújula Consultores gets a diagnostic request with a deposit.
- A bakery gets a cake builder.

Success criteria:
1. Numbers do nothing until approved.
2. After approval, the cart, checkout, order and subscription renewal charge exactly what the tool showed.
3. A tampered price is refused.
4. Each tool fits its store's look and voice.
5. The owner gets side-by-side screenshots.

## Not in this spec

- **YAPI-written markup around the tools** (guarded slots): a later round.
- **Saved-card auto-charge for subscriptions:** still blocked on dLocal (`project_subscribe_and_save`).
- **Tiers on products with variants.**
- **Store controls and store voice** have their own specs (2026-10-14).
