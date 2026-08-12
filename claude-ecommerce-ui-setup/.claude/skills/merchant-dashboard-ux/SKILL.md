---
name: merchant-dashboard-ux
description: Designs and reviews merchant/admin UX for an ecommerce platform: products, variants, inventory, orders, customers, discounts, analytics, payouts, settings, onboarding, search, filters, bulk actions, and operational workflows. Use for seller-facing back-office screens.
---

# Merchant Dashboard UX

Design the merchant admin as an operational tool. Optimize for speed, scanability, confidence, and recovery from mistakes rather than marketing-page aesthetics.

## Overall information architecture

Common merchant domains include:
- Home / overview
- Orders
- Products and variants
- Inventory
- Customers
- Discounts / promotions
- Analytics / reports
- Payments / payouts / transactions
- Shipping / delivery / pickup
- Storefront / themes / navigation where supported
- Settings

Follow the actual product's capabilities; do not add modules that do not exist.

Keep navigation labels stable and task-oriented. Avoid clever names for core operational areas.

## Admin density

Merchant interfaces can be denser than storefronts.
- Prefer compact, readable rows and controls over oversized cards.
- Use cards for meaningful grouping or summary, not as a wrapper for every block.
- Keep page titles, key status, and major actions easy to scan.
- Keep repetitive metadata visually quieter than the merchant's current decision.

## Tables and lists

For orders, products, customers, transactions, etc.:
- choose columns based on the task, not on all available data
- keep the entity's main identifier prominent
- align numeric/money columns consistently
- make status easy to scan without relying on color alone
- provide search/filter/sort only where useful
- make active filters obvious
- make row navigation/action behavior consistent
- preserve list state when returning from a detail view when feasible
- support pagination or incremental loading appropriate to the backend

## Bulk actions

Bulk actions should clearly communicate:
- how many items are selected
- which action will occur
- whether it is reversible
- progress/result for long-running operations
- partial failures when relevant

Destructive bulk actions require stronger confirmation than harmless actions.

## Orders

An order detail view should make operational status clear:
- order/payment/fulfillment status
- customer and delivery information
- line items and quantities
- totals, discounts, taxes/fees, delivery charges
- payment/transaction information appropriate to permissions
- fulfillment/shipping/pickup actions
- timeline/history where available
- refunds/cancellations/returns where supported

Separate status concepts instead of collapsing payment, fulfillment, and order state into one ambiguous badge.

## Products and inventory

- Make variant relationships obvious.
- Keep price, compare-at price, cost, SKU/barcode, and stock concepts distinct.
- Clearly identify whether inventory is tracked.
- Make low/out-of-stock states scannable.
- Warn before changes that can unexpectedly make a product unavailable.
- For many variants, prefer efficient tabular/bulk editing patterns over repeated large forms.

## Money and payouts

Financial screens need precision over decoration.
- Use consistent currency formatting.
- Distinguish gross sales, discounts, refunds, fees, taxes, net, pending balance, and payout amounts when those concepts exist.
- Explain pending/processing/failed states in plain language.
- Do not imply funds are available when they are pending.
- Make date ranges/timezone clear in reports.

## Analytics

- Start with the merchant question the metric answers.
- Pair charts with exact values or summaries where useful.
- Avoid decorative charts that add no decision value.
- Make comparison periods explicit.
- Handle no-data and partial-data periods clearly.

## Settings

Group settings by merchant mental model. Avoid a single enormous settings form.
- Save behavior should be obvious: autosave vs explicit save.
- Warn about unsaved changes when appropriate.
- Explain consequential settings near the control.
- Put dangerous actions in a distinct area.

## Onboarding

Onboarding should move the merchant toward a sellable store, not force them through every feature.
Possible milestones depend on the actual product, such as:
- store identity
- first product
- payments
- delivery/shipping
- domain/storefront
- test order or launch

Show progress without blocking experienced merchants from navigating elsewhere unless a prerequisite truly prevents operation.

## Local-market operations

Inspect configuration and requirements for the target country. Where supported, make local merchant workflows first-class:
- currency and local taxes
- local payment methods and settlement states
- local delivery/pickup/courier models
- local address/region conventions
- invoices/receipts or fiscal identifiers represented in the product requirements
- local date/time/phone formats

Never invent compliance requirements. Follow explicit product/legal requirements or established integrations.
