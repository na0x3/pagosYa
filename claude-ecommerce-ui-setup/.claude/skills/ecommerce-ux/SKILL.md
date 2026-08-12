---
name: ecommerce-ux
description: Designs and reviews customer-facing ecommerce UX including catalog, search, product detail, variants, cart, checkout, delivery, payments, discounts, localization, and post-purchase flows. Use for any storefront or buyer journey work.
---

# Ecommerce UX

Optimize customer-facing commerce flows for comprehension, confidence, speed, and conversion without using deceptive patterns.

## Core principle

At every step, the customer should quickly understand:
- what they are buying
- how much it costs
- whether it is available
- what choices they must make
- when/how it can be delivered or collected
- what happens after the primary action

## Catalog and discovery

For collection, category, search, and home merchandising surfaces:
- Make product imagery, name, price, availability, and important promotion information scannable.
- Keep filter and sort behavior predictable and reversible.
- Preserve filter state when reasonable.
- Show active filters clearly.
- Handle zero results with recovery options rather than a dead end.
- Avoid showing information on every product card that only matters on the product page.
- Do not hide important price qualifiers or stock limitations.

## Product detail pages

Prioritize this information hierarchy:
1. product identity and imagery
2. price and any compare-at/discount information
3. variant or option selection
4. availability / stock status
5. primary purchase action
6. fulfillment estimate or pickup information
7. concise trust/reassurance information
8. deeper description, specifications, policies, and related products

Variant rules:
- Make unavailable combinations obvious.
- Do not silently change a customer's selected variant.
- Show selection errors close to the option control.
- Update price, media, stock, SKU, and fulfillment information when the selected variant requires it.

## Cart

- Make quantity, variant, unit price, subtotal, discounts, and remove actions understandable.
- Update totals predictably after quantity or discount changes.
- Distinguish estimated costs from final costs.
- Preserve the cart across navigation when the product architecture supports it.
- Use cross-sells sparingly; never obscure checkout.

## Checkout

Reduce cognitive load. Ask only for information needed to complete or fulfill the transaction.

- Use clear sections for contact, delivery/pickup, address, payment, and review.
- Preserve entered values when validation fails.
- Put validation messages beside the relevant field and explain how to fix them.
- Show the order total before final confirmation.
- Clearly distinguish subtotal, discounts, shipping/delivery, taxes/fees, and final total.
- Never preselect paid add-ons without the user's clear intent.
- Make the final purchase button explicit about the commitment.

## Localization for the target country

This product is intended for a local market. Treat localization as product behavior, not just translation.

Before implementing country-specific assumptions, inspect the repository for locale/configuration. Use the configured locale when present. Do not invent local rules.

Account for, where relevant:
- local currency formatting and decimal conventions
- local language and terminology
- address format and administrative regions
- postal code requirements or absence of postal codes
- local phone number formatting
- local tax/VAT/receipt requirements already represented in product requirements
- common local payment methods represented by the payment integration
- cash-on-delivery or bank-transfer flows if the product supports them
- delivery zones, pickup, couriers, and delivery-time expectations
- timezone and date formatting

Design the underlying components so additional countries/locales can be added later instead of scattering hard-coded formatting across pages.

## Trust and reassurance

Surface reassurance where it reduces a real purchase concern:
- delivery estimate
- returns/refund policy summary
- secure payment context
- seller/store identity when marketplace-like
- stock status
- customer support path

Avoid repetitive badge walls or fake urgency. Never fabricate scarcity, reviews, countdowns, or social proof.

## Mobile commerce

Assume many customers will purchase on mobile.
- Keep purchase actions easy to reach.
- Make variant controls tap-friendly.
- Avoid tiny horizontally scrolling option controls unless they are clearly usable.
- Keep checkout form fields optimized for appropriate mobile keyboard/input modes.
- Avoid sticky UI that consumes excessive viewport height.

## Required state coverage

When relevant, design:
- product unavailable
- variant unavailable
- low/changed stock
- invalid coupon
- delivery unavailable to selected address
- payment failure
- pending/offline payment
- cart price changed
- empty cart
- search with no results
- checkout success
