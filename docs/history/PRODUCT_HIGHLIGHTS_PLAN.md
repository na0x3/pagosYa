# Product Highlights Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Each product can carry up to four owner-approved highlights with an animated icon, suggested by YAPI and rendered by the storefront kit in both product page styles.

**Architecture:** Highlights follow the `specifications` pattern: a JSONB column on `PaymentLink`, normalized on write, exposed through the public catalog, rendered by `source-kit/commerce.js`. A suggestion endpoint asks the configured model for rows whose `icon` comes from a fixed enum. The kit owns the icon drawings and their looping motion. Studio's YAPI product guide gains a step where the owner reviews and edits the suggestions.

**Tech Stack:** NestJS + Prisma + Jest (`apps/api`), vanilla browser JS/CSS (`source-kit`), TypeScript + Playwright (`apps/merchant-studio`).

**Spec:** `docs/PRODUCT_HIGHLIGHTS.md`

## Global Constraints

- Shopper-facing copy in Spanish; code comments in English.
- Only owner-approved text reaches the storefront. The suggestion prompt may use only the facts it is given.
- Icon names live in one list (`PRODUCT_HIGHLIGHT_ICONS`); the kit draws exactly those names, checked by a test.
- Motion respects `prefers-reduced-motion` and the store motion mode, and pauses off screen.
- No new dependencies. Commit subjects in plain imperative English with the `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>` line.

---

### Task 1: Store highlights on products

**Files:** `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/20260915180000_product_highlights/migration.sql`, `apps/api/src/payment-links/product-highlights.ts` (new: icon list + `normalizeProductHighlights`), `apps/api/src/payment-links/dto/create-payment-link.dto.ts`, `apps/api/src/payment-links/payment-links.service.ts`, `apps/api/src/stores/stores.service.ts`, test `apps/api/src/payment-links/product-highlights.spec.ts`.

**Interfaces produced:** `PRODUCT_HIGHLIGHT_ICONS: readonly string[]`, `type ProductHighlight = { icon: string; label: string; detail?: string }`, `normalizeProductHighlights(rows): ProductHighlight[]`, `PaymentLink.highlights` JSONB, catalog field `highlights`.

- [ ] **Step 1:** Write `product-highlights.spec.ts`: at most 4 rows; unknown icon dropped; duplicate labels dropped; label trimmed to 24 and detail to 40 characters; blank label dropped; `undefined` yields `[]`; every icon name is lowercase kebab.
- [ ] **Step 2:** Run `cd apps/api && npx jest src/payment-links/product-highlights.spec.ts` — fails (module missing).
- [ ] **Step 3:** Add `product-highlights.ts` with the icon list from the spec §4 and `normalizeProductHighlights` mirroring `normalizeProductSpecifications` (trim, drop invalid, `slice(0, 4)`).
- [ ] **Step 4:** Add `highlights Json @default("[]")` to `PaymentLink` in `schema.prisma`, the migration SQL (`ALTER TABLE "PaymentLink" ADD COLUMN "highlights" JSONB NOT NULL DEFAULT '[]';`), then `npx prisma generate`.
- [ ] **Step 5:** Add `ProductHighlightDto` (`icon` `@IsIn(PRODUCT_HIGHLIGHT_ICONS)`, `label` `@Length(1, 24)`, optional `detail` `@Length(1, 40)`, both `@IsSafeText()`) and an optional `highlights` array (`@ArrayMaxSize(4)`) to the create DTO, beside `specifications`.
- [ ] **Step 6:** Persist in `payment-links.service.ts` create and update exactly as `specifications`, and expose `highlights` in `stores.service.ts` next to `specifications`.
- [ ] **Step 7:** Run `npx jest src/payment-links src/stores/source-commerce-pages.spec.ts && npx tsc --noEmit`.
- [ ] **Step 8:** Commit "Store up to four approved highlights on each product".

---

### Task 2: YAPI suggests highlights

**Files:** `apps/api/src/payment-links/payment-links.service.ts` (new `suggestProductHighlights`), `apps/api/src/payment-links/payment-links.controller.ts`, `apps/api/src/payment-links/dto/` (request DTO), test `apps/api/src/payment-links/product-highlight-suggestions.spec.ts`.

**Interfaces produced:** `POST v1/stores/:storeId/payment_links/highlight-suggestions` with `{ name, description?, specifications?, tags? }` returning `{ highlights: ProductHighlight[] }`.

- [ ] **Step 1:** Write the spec with a mocked `global.fetch`, following `payment-links.service.spec.ts`'s inventory tests: asserts the request model comes from `app.openAi.inventoryModel`, the JSON schema's `icon` enum equals `PRODUCT_HIGHLIGHT_ICONS`, the prompt contains the product name and the "only stated facts" rule, the reply is normalized (max 4, unknown icons dropped), nothing is written to the database, usage is recorded through `AiUsageService`, and a provider failure surfaces a friendly Spanish message.
- [ ] **Step 2:** Run it — fails (method missing).
- [ ] **Step 3:** Implement `suggestProductHighlights` modeled on `normalizeInventoryCsv`: ownership check, Responses API call with a strict schema, `normalizeProductHighlights` on the reply, `usage.record(storeId, 'product-highlights', ...)`.
- [ ] **Step 4:** Add the controller route beside `import/normalize`.
- [ ] **Step 5:** Run `npx jest src/payment-links && npx tsc --noEmit`.
- [ ] **Step 6:** Commit "Suggest product highlights from the product's own facts".

---

### Task 3: The kit renders animated highlights

**Files:** `apps/api/src/stores/source-kit/commerce.js`, test `apps/merchant-studio/tests/product-highlights.spec.ts`, plus a sync test in `apps/api/src/stores/source-commerce-design.spec.ts`.

**Interfaces produced:** `ul.product-detail__highlights` inside the purchase column, one `li` per highlight with an inline SVG icon (`aria-hidden`), label and optional detail.

- [ ] **Step 1:** Write the browser test: editorial shows the row between description and choices; dense shows it between the buy button and the assurances; icons animate (`animationName` is not `none`); the row pauses when scrolled out of view (`animation-play-state: paused`); with `prefers-reduced-motion: reduce` no icon animates; a product without highlights renders no row; unknown icon names render nothing; the buy button stays above the fold at 1280×844 with four highlights.
- [ ] **Step 2:** Run — fails.
- [ ] **Step 3:** In `commerce.js` add `highlightIcons` (name → SVG path markup + motion class) covering every name in `PRODUCT_HIGHLIGHT_ICONS`, a `highlightsMarkup(p)` that renders only known icons, and place it in the two styles.
- [ ] **Step 4:** Add the CSS: shared list layout, editorial centered column with hairlines, dense icon grid, keyframes per motion class, `@media (prefers-reduced-motion: reduce)` stop, and `animation-play-state: paused` under `[data-highlights-paused]`.
- [ ] **Step 5:** Toggle `data-highlights-paused` with an IntersectionObserver in `openProduct`.
- [ ] **Step 6:** Add the API sync test asserting `commerce.js` contains every `PRODUCT_HIGHLIGHT_ICONS` name.
- [ ] **Step 7:** Run the new browser test plus `product-page-kit`, `product-design`, `source-catalog`, and `npx jest src/stores`.
- [ ] **Step 8:** Look at the screenshots the test saves; fix anything that does not match the mockups.
- [ ] **Step 9:** Commit "Render approved product highlights with gentle looping icons".

---

### Task 4: The owner approves highlights in the product guide

**Files:** `apps/merchant-studio/src/source-create-product.ts`, `apps/merchant-studio/src/api.ts`, `apps/merchant-studio/src/style.css` (or the guide's stylesheet), test `apps/merchant-studio/tests/source-create-product.spec.ts`.

**Interfaces produced:** guide step "Destacados" (step 5 of 8) with editable rows, sending `highlights` with the saved product.

- [ ] **Step 1:** Extend the existing guide test: after the price step, the new step requests suggestions once, lists them as editable rows with an icon select, label and detail; removing a row and editing a label works; skipping leaves `highlights: []`; the saved payload carries the approved rows; a failed suggestion shows a message and still allows saving by hand; editing an existing product loads its saved highlights.
- [ ] **Step 2:** Run — fails.
- [ ] **Step 3:** Add `suggestProductHighlights` to `MerchantStudioApi`.
- [ ] **Step 4:** Add the step to the guide: 8 steps, suggestions fetched on entering the step (once), rows editable and removable, "Añadir destacado" for a blank row, icon `<select>` listing the kit's names with Spanish labels, review step lists the highlights, save sends them.
- [ ] **Step 5:** Run the Studio browser tests and `npx tsc --noEmit -p apps/merchant-studio`.
- [ ] **Step 6:** Commit "Let store owners approve YAPI's product highlights".

---

### Task 5: Evidence and documentation

- [ ] **Step 1:** Add highlights to one benchmark store's product through the API in the local database, then run `npx ts-node scripts/premium-benchmark-kit-captures.ts` and look at the capture.
- [ ] **Step 2:** Update `docs/PRODUCT_HIGHLIGHTS.md` status to implemented, recording anything that changed during the build.
- [ ] **Step 3:** Run the full suites: `cd apps/api && npx jest -w 4`, `cd apps/merchant-studio && npx playwright test`, `cd apps/checkout && npm test`.
- [ ] **Step 4:** Commit and push.
