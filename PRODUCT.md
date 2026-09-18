# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Three distinct primary users, each with their own surface:

- **Customers** (Bolivian shoppers and payers) — may pay once as guests through `apps/checkout`, or optionally create a separate account in `apps/consumer-dashboard` to see purchases, fulfillment, receipts, and accepted relationships with any participating business or institution. An account is never required to complete checkout.
- **Merchants** (small/independent Bolivian businesses) — manage their single store per merchant account, products, payment links, branding, finances, payouts, and SIN invoicing profile through `apps/merchant-dashboard`. Recurring, task-driven users who log in repeatedly.
- **Internal ops reviewers** (pagosYa's own compliance staff) — review and approve/reject merchant KYC submissions, and monitor delivery failures (failed payouts/invoices/webhooks) and the audit log, through `apps/ops`. Internal-only, authenticated by named per-reviewer token.

## Product Purpose

pagosYa is a payment processing platform for the Bolivian market: it lets merchants accept digital payments (cards, QR via Banco Económico, and other local rails) without building their own payment infrastructure, while handling the local mechanics — settlement, payouts to Bolivian bank accounts, and SIN electronic invoicing — that a generic global processor doesn't. Success means a merchant can go from KYC approval to accepting real payments and getting paid out, entirely through pagosYa's surfaces.

## Positioning

Local-first payment infrastructure for Bolivia. The mechanism a global processor can't truthfully copy: native integration with local payment rails (Banco Económico QR Simple, with a pluggable adapter pattern for adding more), SIN electronic invoicing (CUIS) built into the payment flow, settlement/payouts in BOB to local bank accounts, and a Spanish-language product end to end. Positioned as infrastructure for the merchant who needs to operate correctly under Bolivian tax and banking rules, not just move money.

## Operating Context

- A merchant creates a store and payment links (or a single Payment Intent) from `apps/merchant-dashboard`; customers pay through `apps/checkout`, which can be embedded via `packages/widget-js` on the merchant's own site or opened as a standalone hosted page.
- `apps/consumer-dashboard` opens on the public marketplace of registered Stores, with the consumer's account summary above it when signed in. Its detailed account is a generic personal ledger, not a school-specific portal. A Store may represent a shop, school, clinic, club, landlord, lender, association, or another organization. Affiliation requires a verified email-and-carnet match plus explicit user acceptance.
- Payment and fulfillment are separate state machines: a successful PaymentIntent moves its StoreOrder to `PAID`; the merchant later moves fulfillment through preparation, pickup/shipping, and delivery. The consumer surface must never label a merely paid item as delivered.
- Every successful payment state transition writes ledger entries (double-entry) and a webhook event in the same transaction (outbox pattern) — this reliability mechanism is a durable architectural commitment, not an implementation detail to casually change.
- `PaymentIntent` moves through a state machine: `requires_payment_method → requires_confirmation → processing → succeeded/failed/requires_action`.
- Two settlement modes exist per merchant: `AGGREGATOR` and `FACILITATOR` (see HANDOFF.md for the distinction) — this affects payout/ledger behavior and must not be assumed identical across merchants.
- A merchant cannot go live (real payouts, live API keys) until KYC is reviewed and approved by an ops reviewer in `apps/ops`.
- Payment rails are pluggable adapters (`PaymentRailAdapter`/`RailRegistry`); Banco Económico QR is the first real integration, expected to be joined or replaced by others — code and UI should not assume it's the only rail.
- Local dev requires no Docker: `apps/api` uses embedded Postgres by default (`docker-compose.yml` is the alternative for those with Docker).

## Capabilities and Constraints

- `apps/checkout` is a Vite/TypeScript app (has a build step, its own token-based light/dark theming system for merchant branding).
- `apps/merchant-dashboard`, `apps/consumer-dashboard`, and `apps/ops` are **deliberately** dependency-free, no-build, vanilla HTML/JS/CSS served by minimal hand-rolled Node static servers — this is an existing, intentional constraint, not a gap to "modernize" into a framework/bundler without being asked.
- Both admin surfaces currently render as a single long scrolling page with no section navigation and no table pagination — a known, confirmed limitation, not yet decided whether/how to restructure.
- `apps/checkout` and `apps/ops` (as of this writing) have no responsive breakpoints (`@media` queries) at all. `apps/merchant-dashboard` has one minimal breakpoint (`@media (max-width: 640px)`, added to fix a confirmed mobile overflow bug) but is not otherwise designed responsively — treat all three as needing a real responsive pass, not just checkout/ops.
- Rate limiting is global (20 req/min/IP) with stricter limits (5-10 req/min) on auth-sensitive endpoints.
- Terminology: "Payment Link" = a merchant's shareable no-code catalog link (opens the customer's cart across possibly multiple products); "Payment Intent" = a single fixed-amount charge (API/code path). Both terminate in the same checkout iframe.
- `apps/ops` is currently **English-only**, inconsistent with the Spanish-language brand commitment below. This is a confirmed real gap (per an `/impeccable critique` pass), not a deliberate, documented exception — tracked here for future work, not yet scheduled or scoped.

## Brand Commitments

- Name: **pagosYa**.
- Logo: a colorful parrot mark in yellow, red, blue, black, and white — real assets at `assets/brand/logo.png` and `apps/checkout/public/logo-mark.png`.
- Typeface: "0xProto Mono" (monospace) used consistently across all three surfaces — an established brand commitment, not a placeholder default.
- Dark theme by default across all three surfaces (checkout supports a light variant for merchant-embedded contexts; the two admin tools are dark-only today).
- Voice: Spanish-language product copy throughout (all three surfaces).

## Evidence on Hand

- `README.md`, `HANDOFF.md`, `docs/SESSION_LOG.md` — real, current architecture notes and decision history; treat as authoritative product/technical fact, not marketing copy.
- Real brand assets at `assets/brand/logo.png`, `apps/checkout/public/logo-mark.png`.
- No press, testimonials, case studies, pricing, or licensing materials exist in this repo — do not fabricate any.
- `PAGOSYA_WEB_ORIGIN` in `.env.example` references a separate marketing site (pagosYaWeb) that is **not** part of this repository — out of scope for this PRODUCT.md; do not invent its content.

## Product Principles

1. Local rails and local compliance (Baneco QR, SIN invoicing, BOB settlement) are the product, not an add-on — features should extend this local-first mechanism rather than route around it.
2. Reliability over convenience: the ledger + webhook outbox pattern (same-transaction guarantee) is load-bearing; don't trade it away for a simpler-looking code path.
3. No-code first for merchants: Payment Links exist so a merchant can sell without writing integration code; don't regress that path in favor of API-only thinking.
4. The two internal/admin surfaces (`merchant-dashboard`, `ops`) are deliberately lightweight, no-build tools — respect that constraint rather than defaulting to a framework rewrite.
5. Payment rails are pluggable by design — Baneco QR is the first, not the only, integration; UI and code should generalize accordingly.

## Accessibility & Inclusion

No accessibility standard has been explicitly required by the product yet. A prior audit of the current code found zero ARIA usage in the two admin surfaces and zero responsive breakpoints across all three surfaces — recorded here as a known gap, not yet a decided requirement.
