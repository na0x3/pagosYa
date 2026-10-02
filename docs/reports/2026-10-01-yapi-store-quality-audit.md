# Yapi store quality audit and implementation

Scope: shared generation behavior and local browser verification. Preserve the merchant's original revision. No publication or production deployment.

## What failed in the Rhode store

The original homepage hid `data-pagosya-catalog` and wrote a permanent “El catálogo se está preparando” section. Eleven active products existed. This was a source-generation/lifecycle failure, not missing inventory.

The merchant supplied a cream/gray, sans-serif Rhode brief and eleven images. They explicitly requested all images. Onboarding nevertheless forced two discovery turns, a starting-method choice, and generic direction cards. The selected technical preset produced a red/monospace archive, including overlapping campaign images. Showing all images was authorized; presenting them as an archive/stack did not satisfy the intended design.

The subsequent catalog repair failed because two current product photos were not in the old site's asset bundle. Both uploads existed; one PNG was about 3.2 MB. The preview's media reconciliation reused existing bundled images but did not hydrate newer catalog uploads.

The reference reader also rejected the official Rhode homepage: approximately 2.5 MB HTML and 405 KB primary CSS exceeded its 1 MB/300 KB limits. The capture worker dropped concurrent resources rather than queuing them. These were general failures affecting large commerce references.

Original snapshot, conversation, generation diagnostics and test outputs are retained locally under `.yapi-evaluation/rhode-audit/`. They are not committed as public merchant data.

## Shared changes

1. Replace the agent's forced composition recipe with reference-aware hierarchy and media curation. Apply the same guidance to concept planning. A request to use every image still requires an intentional sequence; it does not mandate overlapping images or an archive.
2. Remove generic direction-card offers and their Studio controls. Continue reading legacy choices for compatibility.
3. Let a usable brief proceed immediately. Remove the server's fixed two-question gate and forced template question. Preserve necessary clarification, explicit template selection, and requests to wait.
4. Explain that a named brand is not inspected evidence. Ask for the intended URL/screenshot when necessary; do not claim visual inspection from familiarity with a brand name.
5. Keep live catalog mounts visible. Repair authored JSX `hidden` attributes, restore legacy runtime mounts, and reject CSS-hidden catalog mounts during browser verification. Runtime owns changing catalog states; generated copy must not permanently assert that the catalog is empty.
6. Bundle current catalog and variant upload images into the isolated generation preview, deduplicating by content. Retain missing/oversize URLs for honest diagnostics. Do not silently replace or discard merchant photos. Preserve the existing aggregate asset budget.
7. Verify available home/catalog/product/checkout pages at desktop and mobile widths independently of the agent's selected assertions.
8. Accept bounded 3 MB HTML and 600 KB CSS reference resources; retain public-URL checks, DNS pinning, content-type checks, deadlines and aggregate limits. Queue concurrent requests and cache bounded resources across viewports. Do not wait for every third-party script to finish. Omit captures without readable primary content and report partial capture limitations.
9. The live empty-store replay exposed a theme-check loop: no product meant no product page could be verified, so each theme repair failed again. Verify empty-store themes with a temporary long-name product and option inside the isolated browser copy. Regression tests prove that the saved snapshot remains unchanged and hidden buy controls still fail.
10. Detect common permanent empty-catalog messages outside platform-managed catalog elements during browser verification. Report them to Yapi for repair instead of accepting copy that becomes false after products are added. This check is deliberately narrow; it is not a universal semantic or visual quality judge.

## Acceptance matrix

| Scenario | Required behavior | Evidence method |
| --- | --- | --- |
| Full initial brief | Generate without arbitrary style/discovery turns | Dialogue/service regressions and fresh browser run |
| Incomplete or unrelated request | Ask a relevant clarification; do not invent facts | Conversation regressions |
| Explicit template / old retry | Preserve the requested starting method and legacy compatibility | Chat regressions |
| Reference-driven redesign | Observe real reference; retain merchant facts; no generic preset override | Rhode browser replay plus visual review |
| Many uploaded photos | Deliberate hierarchy and no default collage | Prompt/planner checks plus Rhode visual review |
| Empty catalog → products added | Products appear without regenerating site code | Runtime regression plus private store browser lifecycle |
| Missing photo / no photo | Usable real product details and purchasing; honest media diagnostics | Commerce and capture regressions |
| New gallery/variant photo | Bundle current upload even if absent from old revision | Media tests and Rhode replay |
| Price/stock/variant changes | Refresh against current catalog; enforce actual stock | Existing commerce regressions |
| Local content change | Preserve unrelated composition, photos and brand | Generation scope regressions |
| Mobile shopping | Readable wrapping, visible purchasing, working navigation/cart | Automatic baseline checks and browser review |
| Incomplete build | Preserve saved revision and report unfinished work | Existing recovery campaign plus current failure review |

## Design review criteria

Compare the homepage, catalog, product and cart as one shopping journey. Inspect one dominant campaign composition, controlled image density, consistent typography, readable product names/prices, useful whitespace, clear calls to action, and responsive navigation. Review desktop and mobile screenshots manually. Automated structural checks alone cannot establish professional visual quality.

Use the real reference for layout principles, not its business claims, pricing or assets. Do not add fake reviews, promotions or shipping promises. An empty inventory must remain a supported temporary state. No product should require another AI generation merely to appear after import.

## Execution and cost discipline

Use targeted deterministic regressions before another model run. Reuse reference captures and image bundles. Run one normal merchant redesign and one fresh empty-store lifecycle test; only repeat a generation when a concrete failure warrants it. Do not fix a store by silently replacing its source with a manually authored special case.

Results and remaining limitations are recorded below after browser verification.

The first deterministic pass completed with 414 API tests and 15 Studio tests passing. The subsequent real empty-store run still failed on the previously untested no-product theme check, demonstrating why these test totals alone do not prove a successful customer experience. Its checkpoint was retained and the exact customer brief retried after the shared fix. Further focused tests cover that fix and stale catalog copy.

### Additional failures found and fixed during live verification

- The accepted 3.2 MB PNG still exceeded the source project's per-file encoded limit after bundling. Catalog uploads above 2 MB now receive bounded WebP display derivatives, retaining original uploads and their ownership mapping. The actual failed Rhode checkpoint was recompiled with current product assets: no page or product-theme errors. This is a media-pipeline fix, not a manually rewritten store.
- At 390 px a shared cart selector changed the item body to flex and squeezed a long product's unit price onto several lines. Narrowing that selector restores the intended layout. A real browser regression checks the product title, unit-price position, quantity layout and stock limit.
- Narrative validation silently upgraded subtle motion into expressive motion with two scenes. It now preserves the chosen intensity and scene count. Planner guidance explicitly permits a restrained static composition. A regression preserves zero-scene subtle motion.
- Matching interrupted requests retain their validated chosen design in the checkpoint, avoiding another three-concept planning call. A changed merchant request must plan again. The focused retry regression exercises both cases.
- Reference captures with missing visible images are excluded and their limitations reported. The official Rhode site remains dynamically difficult to capture completely in the isolated renderer. Readable HTML/CSS evidence does not constitute a complete visual reference.

### Verified private-store lifecycle

A fresh Papel Claro store was generated through the ordinary browser composer with a complete, nontechnical brief and zero products. After the shared empty-product theme fix, the same brief completed and saved revision 1. A first product was added through the normal product wizard; two additional stock fixtures were inserted directly into the private test store. All three appeared while the source revision remained 1. The zero-stock item's purchase button was disabled. A product priced at Bs 49.50 with stock 2 could be added twice, could not exceed that stock, and showed Bs 99.00 in the mobile cart and checkout review. The 390 px checkout did not overflow. No payment was submitted.

Screenshots: `.yapi-evaluation/rhode-audit/papel-mobile-cart-fixed.png` and `papel-mobile-checkout.png`. Original merchant data and the original Rhode revision remain preserved.

### Validation accounting

The broader subsequent run reported 423 passing tests and one failing reference-capture test caused by accumulated mock calls across parameterized cases. Resetting the mocks fixed it; the relevant three suites then passed all 27 tests. After the final motion/media/cart changes, four targeted suites passed all 42 tests. The checkpoint retry plus motion assertions passed three focused tests. API and Studio type checks, and the embedded Studio build, passed. These are overlapping targeted runs, not additive unique-test totals or a claim that the entire repository suite passes.

## Owner rejection: visual quality was still unacceptable

Revision 2 completed through Yapi and passed the earlier structural checks. **It is not an accepted professional design.** The owner rejected the repeated imagery, blur and confusing composition. The following generic quality-review generation was cancelled; no further model generation was started. Nothing was published.

The saved result contained eleven authored editorial photographs outside its eleven-product catalog, including a seven-image decorative sequence. In the 1280 px isolated renderer the 736×1104 portrait hero occupied a 1178×567 cover panel: 1.60× enlargement and only 32% of its original area retained. No product/catalog action fit within the first desktop screen. Earlier checks did not measure these failures. Live-browser measurements at a wider viewport showed 1325 px displayed width from that same 736 px source.

### Actual design-system changes after that rejection

- Asset inventories and `inspect_project` now expose measured image pixel dimensions without model calls. Planning receives both retained and newly bundled assets.
- Whole-store shop designs receive a server-owned homepage media policy. The default ceiling is three authored photographs outside the live catalog, not a three-photo requirement. Explicit homepage galleries can exceed it; portfolio sites and local copy edits do not inherit this redesign policy.
- Rendered checks reject authored raster photographs enlarged over 1.05×, cover crops retaining less than half of the photo, unrequested overlapping photo piles, and a homepage without a visible product/catalog action in its first screen. The same policy reaches the final assembled snapshot check.
- The planning contract requires each section to support a real customer decision. Remaining uploads belong in relevant product/detail or separate gallery destinations, not filler homepage sections. Existing photo ownership and original uploads are preserved.
- Removed the required second masthead row and four-to-six-navigation-entry rule.
- Changed the **actual shared Hero component** default from a cropped editorial band to `contained`: bounded uncropped imagery, natural aspect ratio, no intrinsic enlargement, a compact desktop layout, and copy/actions before imagery on mobile. Explicit art-directed variants remain available; their rendered result still needs to pass applicable checks.
- Added a narrow shop-copy check for leaked design-process wording. Navigation instructions require category labels to match their destination.

### Evidence and limits

Replaying saved revision 2 through the new deterministic checks rejects its blur, crop, image count, absent first-screen shopping entry and design-process copy. Results: `.yapi-evaluation/rhode-audit/rejected-design.json`. This replay used no model generation.

Five focused suites passed 55 tests, then the extended media suite passed six tests including the first-screen action check. Three wiring/recovery suites passed 12 selected tests. The new real-browser Hero regression passed at 1280 and 390 px, measuring aspect preservation, no enlargement, action visibility and no overflow; existing media compilation/export tests also passed. API type checking passed. Counts overlap and are not a whole-repository total.

The saved merchant design is still revision 2 and remains visually rejected. The new component examples (`hero-component-1280.png`, `hero-component-390.png`) are isolated shared-component demonstrations using the supplied photo, not a replacement merchant store or evidence that Yapi has generated an approved design. No new model run has validated the full aesthetic outcome after these changes.

These measurable checks are useful minimums, not a universal aesthetic judge. They currently inspect authored raster `img` elements in the homepage, excluding platform-managed product/catalog/checkout media; CSS backgrounds, source-photo softness, semantic crop focal points and overall brand fidelity still require further review. The public reference renderer also still reports incomplete Rhode captures honestly. Do not present functional checks or this component demo as proof of Rhode-level design quality.
