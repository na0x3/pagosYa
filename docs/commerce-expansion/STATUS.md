# Commerce and brand expansion

Scope authorized 2026-09-07: Amboras-advertised ecommerce capabilities, plus persistent brand recognition, evidence import, shared design rules, visual checks, task context optimization and whole-workflow AI cost tracking.

Reference scope: https://www.amboras.com/faq and https://www.amboras.com/bundles (reviewed 2026-09-07). Vendor marketing claims are scope inputs, not independently verified benchmarks. “Available” below means implementation exists in this repository; production provider availability must be verified separately.

## Delivery record

- Added private per-store brand profiles, optimistic revision checks, confirmed evidence versus suggestions, text/HTTPS/image analysis, content-hash reuse, an editable merchant UI, restorable immutable history, uploaded WOFF2 heading/body fonts, and shared color/font tokens in exported pages.
- Connected confirmed brand context to source conversations, source generation, Visual Studio proposals, revision planning and image generation.
- Added private telemetry for conversation, brand analysis, source attempts, Visual Studio analysis/directions/revision planning and image generation. Unpriced models retain numeric provider usage and show an unknown-cost marker; their cost is not assumed to be zero. Added cache-write accounting and explicit reusable prompt boundaries. Conversation defaults to Terra, independently configurable from design generation.
- Added checkout shipping fees: active rate selection, BOB/USD, discounted-subtotal bands, free-above thresholds, product weight bands, owner controls, read-only quotation and atomic payment/order/delivery fee snapshots.
- Added deterministic context narrowing for explicit HTML-file edits, with full context for global or ambiguous work and protection against editing omitted pages.
- Added fixed and mix-and-match bundles and BOGO; the best single discount wins against promo codes before shipping thresholds. Cart items retain ordinary stock validation.
- Added paid-purchase review submission, duplicate protection, private moderation and public approved reviews. Added localized plain-text articles with drafts, scheduled publication and concurrent-edit protection.
- Added merchant controls for content/offers and product shipping weights, generated storefront content hooks, and shipping in both source and standard checkout.
- Extended existing desktop/mobile functional checks with shared-brand stylesheet and broken-image checks.
- Brand and shipping migrations and isolation/checkout flows passed an isolated PostgreSQL integration test.

## Full capability inventory and remaining work

| Capability | Existing foundation / delivered work | Remaining acceptance criteria |
| --- | --- | --- |
| Custom storefronts, pages, responsive design | Source generation, HTML/CSS/JS editing, revision history and static export | Evaluate a representative merchant corpus against visual quality rubric |
| Brand recognition | Persistent evidence import and approved rules, both generation paths | PDF text ingestion; persistent visual strategy, spacing/type-scale tokens, per-field confidence; recognition quality evaluation against merchant-approved examples |
| Generation cost | Model routing, exact patches, budgets, attempts, brand caching and telemetry | Measured model-routing evaluation; broader semantic context selection; pricing for image/unknown models; dashboard per accepted/published site |
| Visual evaluation | Desktop/mobile checkout, navigation, overflow, image and brand-load checks | Bounded vision critique with reference comparison and one repair pass |
| Optional design directions | Legacy Visual Studio proposals and source alternatives | Brand-aware compact concept picker before full first generation |
| Shipping calculator | Merchant rules, weight/value thresholds, country/postal restrictions and authoritative checkout fees | Live carrier rating and customs, carrier labels, tracking events, return labels |
| Local delivery | Zones, couriers, assignments, branch pickup | Route optimization, geofenced radius validation, selectable delivery slots, SMS provider |
| Products and variants | Catalog, options, extras, inventory and branch stock | Full three-dimensional SKU matrix, B2B price lists and gated catalogs |
| Promotions | Codes, scheduled product discounts, bundles/BOGO and merchant-issued gift-card/store-credit codes with a transactional balance ledger | Customer purchase/delivery of gift cards, customer-account credit wallets, editable bundle rules and additional offer scheduling |
| Subscriptions | Plans, customers, invoices, retries, reminders and synchronization | Automatic recurring mandates per payment rail, customer self-service, configurable dunning |
| Bookings | Service offerings, appointments, Google Calendar integration | Storefront integration and end-to-end availability/payment verification |
| Digital goods | Private uploads, digital-only/mixed carts, paid-order snapshots, expiring download links and receipt/tracking renewal | Production private storage activation; per-item refund revocation; automated resend emails |
| Reviews | Verified paid-purchase submission, private moderation, storefront display, and opt-in post-delivery review requests with signed tracking links | Review reporting, pagination beyond the first 100 records |
| Content and SEO | Editable source pages, localized scheduled articles, server-rendered article URLs/archive, canonical/structured metadata, brand colors/fonts, RSS, article sitemap and scoped 301 redirects | Custom-domain/root routing, product sitemap/robots/Atom; merchant content pagination beyond the first 100 records |
| Analytics and experiments | Consent-gated storefront funnel with stage conversion rates, store growth insights, partner attribution, source A/B experiments | Broader segmentation, statistically guarded auto-promotion, pricing/bundle/email experiments |
| Email and customer support | Provider abstraction, transactional mail, idempotent outbox/retries, welcome/cart/review automations, inbox, customer records | Brand-aware campaign editor, consent-aware segments, per-domain sender verification and support drafting |
| Returns/refunds | Return requests and operations resolution, payment transaction model | Customer exchange flow, inventory restocking policy, carrier labels and end-to-end refund support per rail |
| Migration/import/export | Catalog CSV normalization, inventory/subscription sync, static site export | Idempotent customer/order/promotion/redirect migrations from named external platforms |
| Payments/currencies | Pluggable rails, local BOB workflows, catalog currency checks | Provider onboarding, globally available payment methods, FX quotes and multi-currency settlement |
| Domains and hosting | Custom domains, TXT + routing verification, active-domain revalidation, and source publishing | Production DNS/TLS/CDN provisioning and verified hosting environments |
| Permissions/auditing | Merchant auth, sessions, staff/ops roles and audit mechanisms | Ecommerce action permissions, scoped AI autonomy, 2FA/WebAuthn, comprehensive action audit |
| Reliability/compliance | Ledger/outbox transaction architecture | Backup restore drills, regional failover, operational SLAs; formal certifications require external audits |

## Verification and deployment

`pnpm --filter @pagosya/api exec prisma generate`
`pnpm --filter @pagosya/api run test:e2e --runInBand --runTestsByPath test/brand-shipping.e2e-spec.ts`

All four new migrations were applied to the local `localhost:54329/pagosya` development database on 2026-09-07 and passed an isolated PostgreSQL run. Production still requires these additive migrations before the updated API starts. Do not reset or push a replacement schema over merchant data. No production deployment or external carrier/payment account activation is implied by passing local tests.

No global payment-method count, shipping-carrier integration, compliance certification, migration-time guarantee, uptime SLA or measured conversion uplift should be advertised until backed by the corresponding live implementation and evidence.

## Operating the delivered features

In the source editor, use **Identidad de mi marca**, **Envíos y retiro**, and **Contenido y ofertas** above the composer.

- Brand imports produce suggestions. Accept the useful suggestions and save identity; only confirmed fields govern generation. WOFF2 files are validated by the browser before upload, ownership checked on the API, and bundled into exported assets. Saving/restoring creates a revision; the UI lists the latest 20, while older snapshots stay in storage. Clearing confirmed visual fields also clears generated visual tokens on the next generation.
- Shipping is opt-in. Create rates, set product weights if using weight rules, and activate shipping. Rates use integer minor units on the API, decimal currency amounts in the UI, and grams for weights. Country and postal-prefix restrictions filter the supplied destination. Street-address verification, radius geofencing and live carrier rates are not implemented. Quotes create no orders/payments. Checkout revalidates prices, discounts, stock and rates and records the fee/address together with the order.
- Fixed bundles discount complete repeated kits; mix-and-match discounts complete groups of the minimum quantity; BOGO makes the cheapest half of eligible units free. A single best offer applies, without stacking against promotional codes. An active offer does not reserve inventory independently of the normal checkout lifecycle.
- Articles are plain text and rendered in optional `data-pagosya-blog` slots. Reviews use `data-pagosya-reviews` and `data-pagosya-review-form`; offers use `data-pagosya-bundles`. Ask YAPI to add the desired section to the source site; the generation contract names these working hooks. Creating content does not silently republish the website.
- Usage appears under **Créditos → Ver uso reciente**. The API ledger includes failure/repair calls even when customer credits are zero. Its displayed total covers the latest 100 logged calls and excludes costs explicitly marked unknown. It is not an invoice reconciliation or a measured savings percentage. `OPENAI_CONVERSATION_MODEL` independently configures conversation (default Terra).

## Boundaries of this delivery

This is a tested implementation batch, **not complete Amboras parity**. The unfinished acceptance criteria above remain part of the requested scope. The first batch did not include digital goods or gift balances; the follow-up now delivers those transaction flows and article SEO/destination rules. PDF brand import, source concept selection, screenshot-based model critique/repair, full global payments, live carriers and production deployment remain unfinished.

No paid model benchmark was run. AI responses in automated tests are fixtures, so tests verify contracts, ownership, caching/accounting behavior and packaging; they do not establish live brand-recognition quality or an API savings percentage.

Technical references: [OpenAI prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching), [WOFF2 format](https://www.w3.org/TR/WOFF2/). Provider-price assumptions belong to `source-generation-policy.ts` and need refreshing when provider rates change.

## Verification record (2026-09-07)

- API, merchant studio and checkout production builds passed.
- Focused API suites passed for source generation/conversation, source context, brand import/profile, shipping/bundles, uploads, usage metering, store checkout and legacy Visual Studio.
- Four isolated database scenarios passed, covering ownership/CAS/history restore, authoritative shipping/payment snapshots/product weights, article scheduling/revisions, and bundle pricing/verified-review moderation.
- Browser flows passed for desktop/mobile brand and shipping management, exported shipping, standard checkout quotation, hosted iframe shipping, article/bundle/review management, and existing source publication/checkout. The content test also verifies that a failed save preserves the merchant's draft.
- Desktop/mobile screenshots were inspected. Dialog height/width and product checkbox labels were corrected after the browser checks.
- `git diff --check` passed. No production deployment or paid AI call was made.
- Local development database migration history already contained an applied event-refund migration absent from this checkout. The four new additive migrations deployed successfully; the existing history entry was left intact.

## Follow-up: credit, digital goods and article publishing

See [operating guide and exact boundaries](CREDIT_DIGITAL_SEO.md).

- Merchant-issued gift-card/store-credit codes, balance reservation and refunds; zero-rail-amount checkout; failed-payment reacquisition and abandoned-cart release.
- Private digital files with paid-order snapshots, 15-minute signed downloads, receipt/tracking link renewal and full-refund revocation.
- Country and postal-prefix filtering in shipping quotes and final checkout; destination snapshots.
- Server-rendered localized article pages/archive, confirmed brand colors/fonts, metadata, RSS, sitemap and scoped 301 redirects.
- Merchant controls under **Saldos y archivos digitales**, alongside the existing brand/shipping/content controls.

These close additional functional gaps. They do **not** complete the full parity matrix above. Provider onboarding is still needed for live carrier rates/labels and international payments, and the other explicitly listed software gaps remain open.

### Follow-up verification (2026-09-07)

- API, checkout and merchant-studio builds passed.
- 130 focused unit tests passed across payment intents, product management, stores, shipping and source generation.
- Seven isolated PostgreSQL integration scenarios passed for the new transaction, digital delivery, destination and article flows. The final scenario directly exercises the checkout service for a mixed physical/digital cart; the preceding scenarios exercise HTTP routes.
- Eight distinct browser flows passed across the brand/commerce and new credit/digital suites. Merchant controls and server-rendered articles were inspected at desktop and mobile sizes; article overflow was false and the confirmed brand background was applied.
- Both new additive migrations were applied to local `localhost:54329/pagosya`. The previously recorded orphan migration entry was preserved. The development API answered the protected commerce endpoint with the expected unauthenticated 401 response.
- `git diff --check` passed. No production deployment or paid-model/provider benchmark was performed.
