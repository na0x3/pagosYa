# The order confirmation email a store writes for itself

Decision of 2026-10-06. A buyer who pays on a pagosYa store receives a plain-text
receipt. The owner wants that moment to feel like the rest of the store: designed,
on-brand, reassuring. This spec covers how YAPI comes to author each store's
confirmation email, how the platform keeps that email safe and truthful, and what
deliberately stays out of the first version.

## What the buyer gets today

`PaymentIntentsService.sendReceiptEmail()` (`apps/api/src/payment-intents/payment-intents.service.ts:794`)
sends the receipt on the merchant's behalf — the subject names the store and
carries no pagosYa branding, matching the WhatsApp and email contact shown on the
checkout receipt screen. It sets `to`, `subject` and `body`. It does not set `html`.

The body is a `\n`-joined string: a greeting, `Tu pago fue confirmado.`, the order
id, one line per cart item, the total, a tracking link when a `StoreOrder` exists,
a subscription block when the order enrolled one, and `Gracias por tu compra.`

So the most reassuring message in the whole purchase arrives as an unstyled wall
of text, from a store whose product page was composed with care.

Transactional HTML email is not new to the codebase. `business-documents/` already
sends it: `business-document-email.ts` and `contract-email.ts` each export
`{ subject, text, html }` built around a small inline-styled `frame()`. That is the
shape to follow, several steps further on.

## The guarantee this design is built around

**The author never writes an order fact.**

YAPI writes markup containing hooks — `data-order-total`, `data-order-items`,
`data-order-tracking` — and the platform fills them from the payment intent. This
is the contract the storefront runtime already runs on, where the author styles
`[data-pagosya-catalog]` and the runtime renders the verified catalog into it. The
generation prompt has said so since the beginning: *"Never hardcode product cards
or prices; the runtime renders these from current API data."*

A model that cannot type a total cannot invent one. Every other safeguard in this
document is secondary to that one.

### The slots

Taken from `sendReceiptEmail()` as it stands, so the HTML email carries exactly
what the text email carries and nothing the platform cannot vouch for:

| Hook | Source | Absent when |
|---|---|---|
| `data-order-greeting` | `intent.customerName` | buyer left it blank |
| `data-order-id` | `intent.id` | never |
| `data-order-items` | `intent.metadata.cart` | the intent carries no cart — a *cita*, or a pay link settled without one |
| `data-order-item` | marks the single row the renderer clones per line | — |
| `data-order-item-name` / `-variant` / `-extras` / `-quantity` / `-amount` | per `CartInventoryLine`, inside `data-order-item` | per line |
| `data-order-total` | `intent.amount`, `intent.currency` | never |
| `data-order-original-total` | `invoiceAmountFor()` | invoice currency equals intent currency |
| `data-order-tracking` | `createOrderTrackingToken(order.id, …)` | no `StoreOrder` for the intent |
| `data-order-subscription` | `subscriptionBlock` argument | order enrolled no subscription |
| `data-order-appointment-name` / `-date` | `intent.metadata.appointment` | not a *cita* |
| `data-store-name` | `merchantName` | never |
| `data-store-logo` | `Store.logoUrl` | store uploaded none |

Item rows follow the catalog's pattern: the author marks one row as the template
and the renderer clones it per cart line. An element whose slot has no value is
removed, not left empty — an author cannot produce a receipt with a blank total
beside a label, because the label and the slot are removed together.

## Where each piece lives

| Piece | Location | Why there |
|---|---|---|
| Authored template | `emails/order-confirmation.html` inside `StoreSourceVersion.snapshot` | it is another authored file, so it inherits revisions, restore and rollback |
| Path allowlist | `source-generation.service.ts:139` | today it rejects any path that is not `pages/…`, `*.html/css/js`, `styles/kit.css` or a motif file |
| Validator | new `apps/api/src/storefront-source/source-email-html.ts` | beside `source-kit-css.ts`, in the same posture |
| Floor template | `packages/storefront-kit/kit/emails/order-confirmation.html` | the kit supplies the base, exactly as it supplies `product-detail__` styles |
| Render and send | `sendReceiptEmail()` | it already resolves `order.storeId`, so brand and template are one lookup away |
| Preview | new `apps/merchant-dashboard/src/order-email-panel.mjs` | matches `subscriptions-panel.mjs`, `shipment-panel.mjs` and the rest |

`brand.css` stays platform-owned and untouched. `source-generation.service.ts:139`
already names it among the reserved files the generator may not write, and that
does not change.

## Two constraints that make email different from the web

**Custom properties do not survive.** Outlook does not support CSS variables and
support elsewhere is uneven. The author may write `--brand-accent` because that is
the language of every other surface, but the renderer resolves each token to a
literal value and inlines it onto the element. The email never loads `brand.css`;
it carries the resolved values. `StoreBrandProfile.data.confirmed` remains the
source of truth.

**Gmail inverts colours in dark mode.** The floor sets `color-scheme` and an
explicit background on every surface that sets a foreground colour, and the
validator enforces the same pairing on authored markup, so a store's palette
cannot become unreadable on a phone at night.

### The validator

`source-email-html.ts` takes the authored file and returns the served form plus a
list of what it changed. Like `source-kit-css.ts`, **it never throws on content**:
violations are stripped, clamped or dropped, and reported.

- Layout is tables. `display:flex`, `display:grid` and `position` declarations are stripped.
- Allowed elements: `table`, `thead`, `tbody`, `tr`, `td`, `th`, `a`, `p`, `h1`–`h3`, `span`, `strong`, `em`, `img`, `div`, `ul`, `ol`, `li`, `br`, `hr`.
- Rejected outright: `script`, `iframe`, `form`, `input`, `object`, `embed`, event-handler attributes, `javascript:` URLs.
- No external stylesheets and no remote fonts. Images resolve only to store asset origins.
- CSS is inlined onto elements with **juice**, a new dependency in `apps/api`. The alternative — a minimal inliner on the `postcss` already used by `source-kit-css.ts` — was considered and rejected: inlining carries more specificity and pseudo-state edge cases than the saved dependency is worth.
- The rendered result is clamped to **80 KB**, leaving headroom under Gmail's 102 KB clipping threshold for the order data the renderer adds.
- A literal currency amount is rejected **inside the order-summary subtree** — the element carrying `data-order-items` or `data-order-total`, and its descendants. This is the guarantee of the previous section made executable rather than merely instructed. It is deliberately *not* a document-wide ban: `Envíos gratis desde Bs 300` is legitimate static copy a store may want in its footer, and stripping it would be wrong. Only amounts standing where an order fact belongs are a lie risk.

## The floor

`packages/storefront-kit/kit/emails/order-confirmation.html` is a hand-built,
email-safe template carrying the same slots. It renders when a store has no
authored email, when the store was not authored by YAPI at all, or when the
authored template did not survive validation intact — defined concretely as the
validated output no longer carrying both `data-order-total` and `data-order-items`.
Those two are the receipt; a template missing either is not one.

This is the same posture as the subscription styling shipped on 2026-10-06: the kit
guarantees a sane floor, the author raises it, and the author's work wins where it
exists. No store is ever worse off than the floor.

## The plain-text body does not change

`SendEmailRequest.body` is documented in `email-provider.interface.ts` as always
sent and the fallback for clients without HTML. It stays byte-identical; `html` is
added alongside it.

This has a consequence worth naming: **every failure mode in this feature degrades
to today's email.** No authored template, a template stripped to nothing, a brand
profile that will not load, an exception inside the renderer — the buyer still
receives the receipt they receive now. The existing `try/catch` around the send
already exists for precisely this reason, and the renderer sits inside it.

## Authoring

The generation prompt gains the email as an authored surface, in the same voice as
the existing instruction about runtime classes: the hooks it must include, the fact
that the platform fills them, and that the email is the store's own voice rather
than a platform template.

This goes into `source-generation.service.ts`. It does **not** go into
`design-engine/sep5-author.ts`: `sep5-author.spec.ts` pins that prompt byte for
byte against `sep5-prompt.26f889c8.txt`, and its comment is explicit that drift —
"a clause softened, a contract bolted on" — must fail rather than quietly become a
different generator under the same pinned version string. A Sep-5 authored store
gets the floor. Changing that is a separate decision, taken deliberately.

## Preview

`GET /stores/:id/emails/order-confirmation/preview` renders the store's template
against a fixed sample order and returns the served HTML. The panel shows it in an
iframe at both phone and desktop width.

`POST /stores/:id/emails/order-confirmation/test-send` sends that render to the
merchant's own verified address, rate-limited.

There is no editing UI. The merchant sees what a buyer will see and can send
themselves a copy; that is the smallest surface that stops a bad template reaching
a paying customer.

## Testing

- **Validator unit tests** against hostile input: `script`, event handlers, `javascript:` URLs, `display:flex`, a remote stylesheet, a remote font, an oversized document, a foreground colour with no background.
- **The truthfulness test**: a literal `Bs 120` inside the order-summary subtree is rejected and reported; the same string in the footer survives. Both halves are asserted — the second guards against over-stripping legitimate copy.
- **Golden render** of the floor and of a representative authored template against the sample order, covering: no cart, one line, many lines, a variant with extras, a differing invoice currency, no tracking link, a subscription block, and a *cita*.
- **Slot-removal test**: an absent value removes its label as well as its slot.
- **The text body is unchanged** — asserted against the current string, so this feature cannot regress the email that already works.
- **Size clamp** asserted against the rendered output, not the source.

Mail clients cannot be tested in CI. The preview panel's Playwright spec renders
both widths as the practical substitute, and real-client checking is a manual step
before enabling for live stores.

## Out of scope

- **Merchant editing** of the template. The owner chose preview-only first so the authored template, the slot contract and the validator exist and are trusted before an editor is built on top of a shape still moving. It is the natural follow-on sub-project.
- **Subscription renewal emails.** Subscribe & Save sends pay-links before each delivery; those are plain text and stay so for now. Nothing here may imply automatic charging — Bolivian rails cannot charge without buyer approval.
- **Debt and cobro notifications** (`sendDebtPaymentNotification`), which are not a store purchase.
- **Merchant-facing email.**

*Citas* are deliberately **in** scope: `sendReceiptEmail()` already serves them
through the same call with an appointment block, and splitting them out would leave
appointments on a worse email than they have reason to be.
