# AI storefront architecture

## Product boundary

The merchant should describe the brand, provide visual references, and choose only the business behavior that cannot be inferred safely (for example, whether an order ends in pagosYa checkout or WhatsApp). Typography, layout, motion, image roles, section rhythm, and storefront copy belong to the generated proposal.

The generated storefront has two layers:

1. **Commerce shell owned by pagosYa** — store identity, navigation, products, prices, inventory, cart, checkout routing, contact form, locations, links, security messaging, accessibility, and responsive behavior.
2. **Creative canvas authored by AI** — visual direction, section sequence, editorial copy, media assignments, palette, typography, and motion choreography in the middle of the page.

The model never returns executable HTML, CSS, or JavaScript. It returns strict structured output that the API validates and stores as a reversible visual proposal. This keeps every site editable and prevents generated code from changing product data, payment behavior, or customer forms.

## Generation lifecycle

1. Collect the catalog, saved store media, social links, business category, creative brief, and conversion mode.
2. Send the real reference images and a strict JSON Schema through the Responses API.
3. Validate every field, media reference, enum, length, URL, and color on the server.
4. Build three materially different proposals from the validated composition.
5. Preview proposals without publishing.
6. Apply one proposal atomically and snapshot the previous visual state for rollback.
7. Continue editing from the storefront preview by selecting text, media, colors, or whole sections.

## Editing model

The preview is the primary editor. A selected element exposes only controls that belong to that element. Today a selected section can be recolored or moved, supported sections can be added in place, and the full storefront can be redesigned from a new brief. Duplication, replacement, and isolated section regeneration belong to the next composition-schema revision.

Advanced forms remain a fallback for values that are difficult or unsafe to manipulate visually: conversion mode, private contact destination, inventory behavior, custom domains, legal/compliance data, accessibility text, and exact external URLs.

## Composition contract

The current renderer uses typed, allow-listed motion and layout primitives. They are implementation details selected by the generator, not choices the merchant must understand. The next schema revision can add more flexible section families while preserving the same safety boundary:

- editorial split and spatial gallery
- product narrative and lookbook
- image-led chapter sequence
- video reveal and process story
- quote, proof, and testimonial compositions
- catalog transition and closing call-to-action

Each section keeps a stable ID, media bindings, copy, layout parameters, theme tokens, motion recipe, visibility, and order. Regeneration can therefore target the full creative canvas, a single section, copy only, imagery only, or motion only without disturbing the commerce shell.

## Non-goals

- Executing arbitrary model-generated frontend code in a customer storefront.
- Allowing generation to edit products, prices, inventory, payment routing, legal copy, or private merchant data.
- Making merchants choose technical animation names, CSS concepts, component libraries, or implementation details.
