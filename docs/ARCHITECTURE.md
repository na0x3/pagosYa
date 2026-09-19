# Architecture guide

Start here if you are new to the codebase. The README explains the payment model and how to run everything locally; this page explains **where code lives and which parts may depend on which**.

## Map

```
apps/
  api/                 NestJS + Prisma backend. Every other app talks to it over HTTP.
  checkout/            Buyer-facing storefront and payment page (Vite + TS), served at /s/:slug and on custom domains.
  merchant-dashboard/  Merchant back office (Vite). Embeds merchant-studio's build under /studio.
  merchant-studio/     Storefront builder: YAPI chat, AI-generated source projects, previews, publishing.
  consumer-dashboard/  "Mi pagosYa": marketplace + buyer account.
  ops/                 Internal console for support, KYC review, and audit (no build step).
  demo/                Minimal merchant backend showing the SDK + widget integration.
  matcho-showcase/     Stand-alone reference storefront (vinext), built and tested in CI.
packages/
  shared-types/        Types shared by api, checkout, and widget. No runtime dependencies on apps.
  sdk-node/            Public Node SDK for merchant backends.
  widget-js/           Embeddable pagosya.js that mounts the checkout iframe.
  storefront-kit/      Runtimes, page templates, fonts, and icons copied into every generated storefront.
  variant-editor/      Merchant editor for product options and their priced, stocked combinations (dashboard + Studio).
  storefront-preview/  Renders a source snapshot into a sandboxed preview document (Studio previews, checkout-hosted source stores).
docs/                  Current feature docs. docs/history/ holds dated reports and archived designs.
```

## Dependency rules

These are enforced by `pnpm check:boundaries` (dependency-cruiser, runs in CI):

1. **Apps never import another app's source.** Shared code goes in `packages/`. Existing violations are listed in `.dependency-cruiser-known-violations.json` and are being removed; adding a new one fails CI.
2. **Packages never import apps.**
3. **No circular imports.** The few that predate the rule are listed in the known-violations file; a new one fails CI.

## API (`apps/api/src`)

One folder per NestJS module; `app.module.ts` wires them together. Grouped by responsibility:

| Area | Modules | Notes |
|------|---------|-------|
| Payments core | `payment-intents`, `rails`, `refunds`, `ledger`, `payouts`, `international`, `payment-methods`, `idempotency`, `webhooks` | `PaymentIntent` is a state machine; every successful transition writes balanced ledger entries and webhook events in the same transaction (outbox). Rails implement `PaymentRailAdapter` and are resolved by `RailRegistry`. |
| Merchants & access | `merchants` (KYC, keys), `auth` (API-key guards), `dashboard` (merchant sessions), `consumer` (buyer accounts), `ops` (staff, audit log, support cases) | Guards decide whether a secret key, a `dash_` session, or an `ops_` token is accepted. |
| Commerce | `stores` (store core: settings, public store API, store checkout), `payment-links` (products), `categories`, `collections`, `promo-codes`, `shipping`, `domains` (connected and purchased domains), `commerce-platform` (store pages, credits, private files), `operations` (fulfillment, calendar, inbound integrations) | |
| Storefront building | `storefront-source` (AI-generated source projects: YAPI chat, generation, design jobs, visual review, publishing), `visual-studio` (visual editor and store agent for settings-based stores), `brand` (brand profile), `product-content` (AI scenes and highlights, articles, bundles, reviews), `ai-usage` (model usage metering) | Depend on `stores`; `stores` never depends on them. |
| Growth | `retention` (newsletter, comeback cards, cart recovery), `email-workspace` (templates, sending domain, delivery log), `store-growth` (visit funnel), `store-seo` (sitemaps, discovery) | Public store routes that must not depend on `StoresModule` use `stores/active-store.ts`. |
| Money reporting | `finances`, `reports`, `invoicing` (SIN e-invoicing), `debt-collections` | |
| Platform | `prisma`, `config`, `common` (filters, validation), `health`, `uploads` | |

Conventions: controllers stay thin and call a service; DTOs in `dto/` validate input; every query that touches store data is scoped to a store the caller owns.

## Checkout app (`apps/checkout/src`)

`main.ts` is a thin bootstrap: it reads the URL, decides which page to show (store, payment, debt collection, order tracking, international return), and wires the editor bridge when the page runs inside the Studio preview. Everything else lives in feature folders:

| Folder | What it holds |
|--------|---------------|
| `storefront/` | The store itself. `store-page.ts` renders the store and product pages, the catalog grid, in-store navigation and the cart review dialog; these call each other, so they share one module. Around it: routes, header/footer, catalog, product cards, locations, theme, motion. |
| `cart/` | Cart contents, prices, discounts, stock limits, promo codes, persistence (`cart.ts`) and what the review dialog shows (`cart-review.ts`). |
| `checkout/` | Payment form, payment result screens, buyer contact details, debt collection. |
| `orders/` | The order tracking page. |
| `preview-editor/` | Only active inside the Studio editor iframe: patch sanitizing, selection, toolbar, gestures, annotations, live updates, and `bridge.ts` (the message listener). Layered base → toolbar → selection → gestures → annotate, with no import cycles. |
| `ui/` | Icons, HTML formatting/escaping, color math, the `#app` mount point. |

Mutable page state lives on the `state` object in `state.ts` (ES modules cannot reassign imported variables); `preview-mode.ts` holds the URL-derived preview/editor/owner flags.

## Storefront runtime

Generated storefronts ship small browser runtimes (`commerce.js`, `privacy.js`, `retention.js`, `video.js`), which live in the `@pagosya/storefront-kit` package (`packages/storefront-kit/kit/`). The API copies them into published sites via `kitPath()`/`readKitFile()`; `checkout` and `merchant-studio` import them from the package for rendering and previews.

## Tests

| Where | Runner | Command |
|-------|--------|---------|
| api | Jest (Prisma mocked) | `pnpm --filter @pagosya/api test` |
| api integration | Jest + disposable Postgres | `pnpm --filter @pagosya/api test:e2e` |
| checkout, merchant-studio | Vitest | `pnpm --filter <app> test` |
| merchant-dashboard | node:test + Playwright | `test:unit`, `test` |
| browser flows | Playwright | see `.github/workflows/ci.yml` |
