# AI storefront architecture

This document describes the existing structured-document storefront pipeline.
The additive [independent source-project pipeline](INDEPENDENT_STOREFRONT_PROJECTS.md)
now stores private frontend source revisions and exports portable ZIP archives.
Its source is never executed by this renderer; generation, sandbox previews and
publication of independent source projects are subsequent increments.

## Product boundary

The merchant should describe the brand, provide visual references, and choose only the business behavior that cannot be inferred safely (for example, whether an order ends in pagosYa checkout or WhatsApp). Typography, layout, motion, image roles, section rhythm, and storefront copy belong to the generated proposal.

The generated storefront has two layers:

1. **Commerce shell owned by pagosYa** — store identity, navigation, products, prices, inventory, cart, checkout routing, contact form, locations, links, security messaging, accessibility, and responsive behavior.
2. **Creative canvas authored by AI** — visual direction, section sequence, editorial copy, media assignments, palette, typography, and motion choreography in the middle of the page.

The model never returns executable HTML, CSS, or JavaScript. It returns strict structured output that the API validates and stores as a reversible visual proposal. This keeps every site editable and prevents generated code from changing product data, payment behavior, or customer forms.

A full generation replaces the creative canvas instead of patching the live design. Every proposal explicitly clears legacy banners, background imagery, about imagery, section backgrounds, promotion presentation, galleries, and merchant-authored animation blocks before applying its own document. The commerce shell remains intact. Existing visual-only media is not silently added to the model context; the logo, catalog imagery, and media explicitly selected for this generation are the available sources.

## Generation lifecycle

1. Collect the catalog, logo, explicitly selected media, social links, business category, creative brief, and conversion mode into a deterministic brand fingerprint.
2. Reuse the cached brand analysis when that fingerprint is unchanged; never cache the final composition.
3. Start a new generation seed and assign three different curated art directions. When the merchant chooses a starting direction, it leads proposal one and the remaining proposals deliberately contrast it.
4. Ask the strategy phase for a bounded page plan. Simple stores remain on Inicio; richer evidence may justify up to three real destinations such as Historia, Contacto, or Visítanos.
5. Send the real reference images, brand evidence, page plan, quality constitution, art-direction assignments, and a strict JSON Schema through the Responses API.
6. Resolve requested media roles against the destination store's own logo, product covers, product details, and merchant-selected editorial assets.
7. Validate every field, page assignment, media reference, enum, length, URL, color, commerce-zone invariant, and pairwise direction distance on the server. Navigation links are derived from accepted pages instead of trusted from model output.
8. Reject structural matches against the merchant's proposals, visual versions, saved recipes, the current batch, and the recent global content-free signature history; retry with a different weighted structure.
9. Build three materially different proposals from the validated composition.
10. Preview proposals without publishing.
11. Apply one proposal atomically and snapshot the previous visual state for rollback.
12. Continue editing from the storefront preview by selecting text, media, colors, or whole sections.

## Yapi conversation editor

The merchant dashboard exposes a store-scoped Yapi conversation beside the canonical preview. Visual edits create a private, reversible proposal and never apply or publish automatically. The explicit product-creation exception persists an active product immediately, states that fact in Yapi's reply, and keeps only its page placement private until the proposal is applied. Model calls and image-generation cost occur only when the merchant submits an explicit Yapi instruction or requests a new visual direction.

Color is a system, not a single accent. Every accepted AI direction must carry at least three distinct chromatic colors derived from the brand, place color across multiple later sections, preserve AA text contrast, and keep the palette coherent across typography, surfaces, navigation, catalog, and contact. Local fallbacks follow the same rule.

## Engine model

`StorefrontGenerationEngine` separates stable brand understanding from fresh art direction:

- **Brand fingerprint:** hashes identity, brief, conversion mode, asset metadata, catalog content, and links. Any meaningful brand change invalidates the strategy cache.
- **Strategy cache:** a bounded TTL/LRU cache stores only the expensive brand analysis. It improves repeat-generation latency without making the output repetitive.
- **Generation seed:** advances for every run of the same brand. It rotates the starting art direction when the merchant lets the studio decide and is recorded with the proposal for traceability.
- **Composition grammar:** names a relationship between hierarchy, media, negative space, catalog rhythm, and narrative flow. It is not a fixed template.
- **Quality constitution:** encodes the applicable Impeccable craft rules in the model prompt: clear hierarchy, AA contrast, readable type, keyboard focus, 44px touch targets, responsive stability, purposeful motion, and product-language copy.
- **Diversity gate:** requires three distinct art directions, then compares hero, story, gallery, type, navigation, catalog, density, imagery, merchandising, experience, and section order. Three cosmetic reskins fail closed. A deterministic evaluator reports unique openings, orders, grammars, maximum pair similarity, and average pair similarity for regression coverage.
- **Structural history:** every accepted proposal and saved recipe writes a content-free signature containing only creative features and a hash. Recent signatures are compared globally without reading or exposing another merchant's copy, products, or asset URLs.
- **Safe document:** the result is still a versioned, allow-listed `siteDocument`; the model cannot emit executable code or alter commerce behavior.

Page architecture is part of that safe document. Structured output requires a bounded `pages` array and a `pageId` on every AI-authored section; an empty `pageId` means Inicio. The server rejects unknown assignments, empty pages, duplicate ids or slugs, and any attempt to move hero or catalog away from Inicio. It then creates the trusted Inicio, Tienda, and page navigation entries itself. The local fallback follows the same contract, creating Historia only when story evidence exists and Contacto only when links or contact data exist.

## Editing model

Yapi edits through the same bounded site vocabulary as the visual editor. Its structured planner receives the current IDs and labels plus a complete operation catalog for art direction, design genome, theme, header and navigation, pages, sections, section scenes, text blocks, media, footer columns and links, newsletter, motion, merchandising, collections, signature experiences, announcement and promotion treatments, content order, hero slides, editorial images, and standalone animation sections with their text and media. One instruction may produce up to twelve ordered operations, which are replayed against a cloned private document and proposal config. The server validates identifiers, enums, lengths, colors, positions, HTTPS destinations, merchant-owned media, and product ownership at each step; an invalid or ambiguous operation fails the whole private variant without touching the current draft or public store. Existing prices, inventory, payments, checkout, KYC, publication, and server-owned commerce bindings are never editable through this language.

An explicit product-creation request is the narrow commerce exception. The merchant must provide the exact product name, a literal price in Bs./BOB, and at least one existing destination page; description and stock are copied only when they also appear literally in the instruction. Yapi never invents variants, extras, discounts, categories, fiscal data, product claims, or changes to existing products. It creates the product through the normal store-owned product service and may assign up to ten ordered merchant-owned image URLs, with the first image becoming the cover. The product is active immediately, while its placement in page catalog sections remains inside the private proposal until the merchant applies that variant. If a later proposal step fails, newly created products are removed as compensation.

When the merchant explicitly asks for new imagery, the planner may request at most two landscape, portrait, or square images and name their exact bounded destination. The API creates those files with the configured image model, stores them as store-owned `AI_DERIVED` media, and records their URLs separately from merchant originals. Website imagery is replayed through ordinary validated media operations and prohibits product representation, logos, readable text, prices, discounts, certifications, and unverifiable business claims. Product imagery is allowed only alongside an explicit new-product request and an explicit request to generate photos; its prompt is constrained to the merchant's literal product description and prohibits invented materials, ingredients, functions, packaging, branding, benefits, or claims. Generated product photos are appended to the same ordered gallery, still subject to the ten-image product limit. If a full-site generation has no usable photography, the website path may create one landscape hero atmosphere and one portrait editorial detail; existing merchant or product photography always takes precedence.

The preview is the primary editor. A selected generated section exposes its content first: title, body, and action. The page-wide **Dirección base**, visual family, variation, width, alignment, motion recipe, background, and text color remain available under a collapsed **Diseño avanzado** disclosure instead of consuming the viewport. The five directions - Casa editorial, Atelier cinematográfico, Estudio de producto, Galería silenciosa, and Mercado gráfico - coordinate the page genome, type roles, navigation, catalog treatment, motion intensity, merchandising rhythm, and every section family/layout at once. Applying one preserves brand colors, copy, media, product bindings, section order, prices, forms, and checkout behavior, and is reversible through the normal editor undo stack.

After choosing a base, merchants can still switch one section among Editorial, Cinematic, Product-led, and Minimal structures, then add, edit, reorder, or remove heading, text, and action blocks directly in that section. Stable block IDs and slots keep those edits attached to the right composition role. Saving sends the bounded `siteArtDirection` together with authored section patches; the API reapplies the shared preset first and overlays the merchant's per-section choices second, so deliberate local edits win without allowing arbitrary CSS.

Motion types are allowlisted across generation, validation, editing, and rendering. Retiring a type removes it from all four layers, so legacy values disappear safely instead of leaving a broken section. The former `3d-gallery` and depth-carousel experiences are retired. Generated pages maintain one cross-layer animation inventory: the sliding hero counts as `hero-carousel`, the authored story counts as `story-scroll`, and section motions plus the signature experience count toward the same one-per-type limit. Existing merchant-authored animation blocks are not imported into a new generation, and are stripped from historical proposals that copied them. The server removes or neutralizes later duplicates even when the model ignores the prompt. This is deliberately scoped to generation, so merchants can still add multiple independently editable sections with the same animation type afterward. Technical animation names remain available to assistive technology and the editor but are not rendered as public section headings.

Inline edits and the side inspector operate on the same pending `siteDocument`, so scrolling-story text no longer falls through to legacy fields or disappears on the next preview render. The legacy editor is projected onto the document only for backward-compatible fields.

The editor rail is derived from the current document instead of a fixed hero/catalog/gallery sequence. It always includes dedicated Identity, Navigation, and Footer tabs, and inserts one tab for every authored section using its merchant-visible title. Touching an editable region in the preview selects and centers the matching tab. The explicit **Estructura** control opens this bounded inspector without replacing the storefront canvas and remains closable from inside the panel on small screens. Navigation entries bind only to home, catalog, a stable page ID, or a stable section ID; the structured footer exposes brand copy, bounded columns, safe links, copyright, badge fields, and newsletter copy. Both are sanitized with the document and saved as merchant-authored chrome rather than arbitrary HTML.

Additional pages are first-class entries in `siteDocument.pages`, not duplicate stores or free-form HTML documents. Inicio remains implicit. Every authored section may carry one validated `pageId`, and every page has a bounded label plus a unique slug. Checkout resolves `?page=<slug>` into a stable, shareable storefront URL, filters the document to that page's sections, marks the matching navigation item with `aria-current="page"`, and falls back to Inicio for an unknown slug. Deleting a page returns its sections to Inicio and removes header links that target it.

The footer newsletter is renderer-owned commerce infrastructure. Merchants edit only bounded copy and an enabled flag. Public submission uses a throttled store-scoped API endpoint; normalized addresses are upserted under the store's composite unique key so resubmission reactivates rather than duplicates a subscriber. The storefront owns validation, busy, success, and error states.

Advanced forms remain a fallback for values that are difficult or unsafe to manipulate visually: conversion mode, private contact destination, inventory behavior, custom domains, legal/compliance data, accessibility text, and exact external URLs.

Preview navigation has an explicit trust boundary. Checkout intercepts any preview-only link that leaves the current store, including another pagosYa store or the marketplace, and asks the trusted dashboard to offer a deliberate new-tab handoff. The iframe cannot open popups itself. Source-window and origin checks plus an HTTP/HTTPS/mail/telephone protocol allowlist protect that handoff. Links remain ordinary, functional anchors on the published storefront.

### Dashboard editor state boundary

The merchant dashboard now boots the appearance editor through a dedicated, typed `StoreEditorState` module. Its pure reducer owns the store-scoped draft snapshot, deterministic fingerprint, revision counters, saved baseline, active save operation, and failure state. DOM controls, Checkout iframe messages, API requests, and AI proposal controls are adapters: they may collect or present values, but they do not independently decide whether a draft is dirty, saved, or safe to replace.

The strangler migration is complete at the state boundary. The existing advanced dashboard form remains connected through a compatibility input adapter, but that adapter may only ingest one complete snapshot into `StoreEditorState`. Preview rendering reads only the store snapshot, command handlers replace that snapshot immediately after projecting to the compatibility form, and saving serializes only the revision captured by `beginSave()`. There is no preview fallback or persistence path that rereads DOM controls or `pending*` values. Those variables are now view-adapter state, not an alternate source of truth.

The first command slice owns inline site text, dragged site-text offsets, site text styles, validated section fields, list reordering, and AI creative-canvas replacement. These commands clone and validate their input before returning a new document or order; DOM and iframe handlers now only add undo metadata, install the returned value, and schedule rendering. AI previews reset stale banners, slides, promotions, and animation arrays before applying a proposal while preserving store identity, locations, links, products, and other commerce data.

The animation command slice completes the high-risk canvas migration. One immutable `applyAnimationCommand` boundary now owns animation creation/deletion, general and scene copy, independent text blocks, drag/resize coordinates, typography and color, button position, media selection/replacement/removal/reordering, and product-backed media. Media replacement swaps only image URLs between existing scene slots, preserving each slot's authored copy and text geometry. The dashboard form, inspector, upload flow, and Checkout iframe are adapters over that same command instead of separate mutation implementations.

Persistence is a separate pure boundary. `storeSettingsPayloadFromSnapshot` converts the captured editor revision into the bounded API contract, including document chrome, sections, animation media, locations, links, and private contact-form routing. Because request construction has no DOM access, edits made while a request is in flight remain in the newer draft revision and cannot leak into the earlier request or be overwritten by its response.

## Composition contract

The current renderer uses typed, allow-listed families, motion recipes, and layout primitives. They are presented to merchants in plain language.

Generation chooses from twelve content-free macro topologies before content is bound. These topologies can open with hero, story, catalog, or gallery and coordinate section order, family, layout, width, alignment, and composition grammar as one decision. The renderer marks the opening explicitly and gives non-hero openings viewport-scale treatments, so catalog-first, story-first, and image-first proposals are different page structures rather than reordered headings. Saved merchant recipes retain their authored order instead of being overwritten by this automatic topology step.

Every document now carries a backward-compatible `designGenome`. It binds seven decisions across the full page: composition grammar, vertical rhythm, geometry, color strategy, media strategy, type scale, and motion language. Missing or unsafe values resolve to neutral defaults that reproduce the legacy storefront, while new generated directions must use distinct genomes. The generation engine includes those values in its diversity score and persists the assigned composition grammar, so the renderer receives an art-direction contract rather than decorative metadata.

New documents may additionally carry the allow-listed `artDirection` provenance field. The shared-types package owns the five preset definitions and the brand-preserving transformation, the API materializes and persists them, the dashboard mirrors them for immediate local preview, and Checkout sanitizes the identifier into `data-site-art-direction` for page-level finishing. The underlying genome and section fields remain the rendering source of truth, so older documents and later merchant overrides continue to work.

The shared section capability registry is the renderer contract for hero, story, catalog, gallery, event tickets, contact, location, and links. It declares compatible families, layouts and motions, media bounds, and named slots such as `heading`, `actions`, `primary-media`, and `products`. Generation is validated against that registry.

The section family is the structural hierarchy; the layout is a smaller variation inside it. **Editorial** uses asymmetric copy-led rhythm, **Cinematic** leads with large media and overlapping narrative space, **Product-led** gives merchandise and trusted commerce the strongest position, and **Minimal** compresses the section to a quiet essential composition. All four consume the same bounded block tree, so changing family never discards merchant copy, media, product bindings, prices, forms, or checkout behavior. Documents created before this field existed derive a stable family from their `designGenome`, preserving their previous visual direction.

Sections now carry a bounded block tree as their canonical composition layer. Top-level groups can contain one level of heading, text, action, media, or trusted commerce blocks; deeper nesting and unregistered slots are rejected. Legacy `title`, `body`, `ctaLabel`, `mediaUrls`, and scene fields remain as a synchronized compatibility projection, so existing storefronts and editor controls continue to work while new compositions gain stable, movable units. Commerce blocks remain renderer-owned: a generated document can place a catalog, event summary, contact form, location, or link group, but it cannot replace those experiences with executable markup.

- editorial split and spatial gallery
- product narrative and lookbook
- image-led chapter sequence
- video reveal and process story
- quote, proof, and testimonial compositions
- catalog transition and closing call-to-action

Each section keeps a stable ID, media bindings, copy, layout parameters, theme tokens, motion recipe, visibility, and order. Regeneration can therefore target the full creative canvas, a single section, copy only, imagery only, or motion only without disturbing the commerce shell.

Hero and gallery sections with exactly two primary images may use the bounded `split` + `clip` recipe. It renders two equal editorial frames and reveals them once with opposing clip paths over 600ms using the shared strong ease; it does not become a looping carousel. Under reduced motion the clip is removed and the pair uses only a short opacity transition.

## Regeneration, originality, and reusable recipes

Merchants can lock any generated section by its stable ID. The lock set is persisted on the private Store record, outside the public `siteDocument`, so it survives browsers without becoming storefront content or renderer state. A later generation replaces every unlocked section but overlays the locked section object exactly, including its blocks, copy, media, family, layout, colors, and motion. If a model renames the section, the engine matches its canonical kind and ordinal and restores the locked section at its previous relative position.

Every candidate passes a content-free originality gate before it is stored. The gate compares art direction, genome, typography roles, navigation, page count and section-to-page topology, catalog treatment, signature experience, section order, and section geometry against recent proposals, rollback versions, non-selected saved recipes, the other directions in the batch, and the recent global signature history. It deliberately ignores copy, page labels, products, and image URLs. A rejected candidate receives up to twelve bounded, seeded retries across typography, geometry, density, rhythm, media strategy, section structure and order, color strategy, and motion. A selected recipe re-rolls only its own weighted choices; it never falls through to an unrelated automatic topology. If no sufficiently distinct result can be produced without changing locked sections, generation fails closed and asks the merchant to change the brief or release a lock.

“Guardar receta” persists a `StoreVisualTemplate` owned by the merchant. Its recipe contains weighted visual axes, typography roles, density, navigation, merchandising rhythm, alternative section orders, content-free block/slot topology, section structures, and semantic media roles such as `featured-product`, `brand-texture`, `process-image`, `founder-or-story`, and `collection-cover`. It cannot contain section IDs, product IDs, merchant text, or asset URLs. Selecting that recipe during a later generation materializes its weighted structure and block topology against the destination store's own content. The semantic resolver prioritizes matching destination assets and excludes logos from non-logo fallbacks, so a recipe can request an image's purpose without carrying the source image.

Semantic media allocation is page-aware: it uses each eligible destination asset once before repeating an image, then permits bounded reuse only when the destination store does not have enough compatible media to satisfy the recipe. Page-level recipe tokens and merchant-authored navigation/footer chrome are applied on catalog, collection, and product-detail routes; route changes never fall back to a separate visual system.

## Non-goals

- Executing arbitrary model-generated frontend code in a customer storefront.
- Allowing generation to edit products, prices, inventory, payment routing, legal copy, or private merchant data.
- Making merchants choose technical animation names, CSS concepts, component libraries, or implementation details.
