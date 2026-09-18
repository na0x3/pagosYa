# Storefront readiness and funnel

The source kit owns cart, fulfillment validation and checkout handoff. Generated HTML/CSS controls appearance through the shared slots and hooks. Hosted and editor snapshots replace authored commerce.js with the current platform runtime. The conversation and generation prompts share the same shopping-flow contract.

Publication has two checks: the API verifies the shared scripts, catalog, Pedido hook and configured page destinations; Studio exercises the saved revision plus current catalog in isolated desktop/mobile frames. The Studio click handler also requires a current successful result. Changing catalog data invalidates the result. These browser diagnostics are not a security attestation and do not submit real payments or orders.

Simple products exercise adding feedback, Pedido drawer, quantity removal, checkout navigation, available pickup/delivery, blank-address rejection, completed address and payment-form handoff. Empty/unavailable catalogs fail. Configurable-only catalogs check the link to the platform's existing options form and explicitly leave its selection/payment simulation pending. That shared options form is covered by checkout tests; merchants should test their own variants/extras before launch. A bounded options handoff does not block publishing or pretend that a payment was tested.

In Diseñar sitio, open **Prepara tu primera venta** for products, identity, fulfillment, payment readiness, test purchase and publication. Payment readiness intentionally remains pending in this prelaunch implementation. Publishing a design is independent of verification of a payment provider. The human testing protocol is in `research/FIRST_MERCHANT_SALE.md`.

## Analytics

Hosted source stores (including their platform options form) collect visit, product detail view, add to cart, checkout started and delivery/pickup selected. Collection requires analytics consent, honors global privacy control, and excludes owner/editor previews. No contact details, addresses, product options or payment fields enter event payloads. Browser session identifiers expire after 30 minutes and are store scoped; withdrawing consent removes local attribution. Per store, the API retains a session hash, a random order-attribution token, the first timestamp per stage and the first selected fulfillment method, with concurrent updates deduplicated. Collection errors do not block purchases.

The merchant's **Crecimiento → Sugerencias de YAPI** report counts unique sessions over 30 days. Payment completion is derived from related orders whose server payment status is SUCCEEDED and livemode is true; clients cannot submit a success event. Multiple paid orders from one session count once. Refund-adjusted revenue remains in the existing sales report.

Counts per stage are independent: customers may add directly from the catalog and digital goods may skip fulfillment. Uncompleted counts use sessions older than 24 hours; unpaid sessions can include pending payments or unavailable payment methods. YAPI suggests investigating the cart-to-checkout step only after at least 20 mature cart sessions and a drop-off of at least half. This is an observation, not a claim about causation.

## Validation and local use

Migration: `apps/api/prisma/migrations/20260908210000_storefront_funnel/migration.sql`. Apply with `pnpm --filter @pagosya/api exec prisma migrate deploy`, then generate the Prisma client and build API/checkout/dashboard. Nest now watches source-kit assets for development.

CI installs Chromium and its system dependencies, runs the Studio customer/publishing/readiness suites and dashboard growth suite, and uploads failure traces. The API integration suite uses an isolated temporary PostgreSQL database. No live providers are contacted.

Extracted modules: Studio shopping probe and readiness UI; checkout cart persistence/keys and funnel collection; dashboard growth controller. Existing frameworks, payment adapters and payout providers are unchanged.
