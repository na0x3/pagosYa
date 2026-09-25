# Every Kit Surface Unique Per Store — Implementation Plan (sub-project 5)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The cart, added-to-cart confirmation, checkout review, product cards and every commerce button stop looking the same in every store: each reads the store's Design DNA (`<html data-dna-*>`) and renders one of several platform-owned forms.

**Architecture:** One new injected `<style data-pagosya-kit="dna">` block in `commerce.js`, appended only when `config.dna` exists, holds every variant. It is keyed on `:root[data-dna-*]`, so a store without DNA renders exactly as today. Shape, frame and button form resolve to a shared token set on `:root` (`--kit-radius`, `--kit-radius-panel`, `--kit-border`, `--kit-photo-*`, `--kit-btn-*`), and each kit surface reads the tokens. JavaScript is limited to what layout needs: the cart grab handle, anchoring the added-to-cart confirmation to the cart button or the pressed button (and flipping it off a cart button it would cover), the card's second photo, swatches, quick-look chip and pointer tilt. Behaviour (prices, stock, totals, payment, legal text, focus order) is untouched. The checkout app receives `dna` with the public store JSON and styles the order confirmation's receipt and actions from `button` and `radius`.

**Tech Stack:** Plain browser JS (`packages/storefront-kit/kit/commerce.js`, `privacy.js`), React/TSX CSS strings (`kit/ui.tsx`), NestJS + Prisma (`apps/api`), Vite/vitest (`apps/checkout`), Jest + jsdom (`apps/api/src/storefront-source/*.spec.ts`), Playwright via the scorecard collector.

**Spec:** `docs/superpowers/specs/2026-09-24-unique-kit-surfaces-design.md` (binding), parent §3.1 and §5, DNA runtime names in `apps/api/src/storefront-source/source-dna.ts`.

## Global Constraints

- `commerce.js` stays dependency-free classic browser JS (parsed by `kit/check-runtimes.mjs`).
- Every variant selector starts with `:root[data-dna-<field>…]`; the DNA style element is appended only when `config.dna` is an object. No DNA → no new element, no new attribute, today's DOM except inert additions (a hidden grip span, no alt image when `data-dna-card` is absent).
- No variant sets `display:none`, `visibility:hidden`, `opacity:0` or a `font-size` under 12px on price, total, buy/pay or legal selectors (static guard test in Task 1).
- Hover effects also apply on `:focus-visible` and never replace the focus outline; touch gets an equivalent (long-press for the second photo, visible chip for quick-look, tap for swatches). Tilt is desktop-only (`(hover:hover) and (pointer:fine)`).
- `prefers-reduced-motion: reduce` removes every DNA transition and the pointer tilt; state changes (second photo, zoom) still happen, instantly.
- Do not edit files owned by sub-project 4 (`source-dna.ts`, `source-design*.ts`, `source-generation.service.ts`, `source-projects.service.ts`, `source-fonts.ts`, `source-font-catalog.ts`, `source-composition-registry.ts`, `kit/fonts/**`, `prisma/**`) nor the `DNA_VALUES` literal in `commerce.js`.
- Jest paths are relative to `apps/api/src`: `cd apps/api && npx jest storefront-source/<file>`.

## Review Focus

1. A store with no DNA renders byte-identical kit CSS to today (no DNA style element; existing style blocks unchanged) → Task 1 test "no DNA, no variant CSS".
2. The static guard: the DNA CSS never hides or shrinks prices, totals, buy/pay buttons or legal text → Task 1 test.
3. `cart=page` and `cart=sheet` still open through `showModal()` (native focus trap) and close on Escape → Task 2 test.
4. The added-to-cart confirmation stays `role=status` in every placement and flips away from a cart button it would cover on a phone → Task 3 tests.
5. `second-photo` renders a second image only when the product has one; `swatch-swap` only with variant photos → Task 5 tests.
6. Transparent button forms (`underline`, `stamp`, `outline`, `ghost`) take `currentColor`, so they read on any card background; filled forms use the store's accent pair.
7. `GET /v1/stores/public/:slug/store` never fails because of DNA: an unreadable or missing published config falls back to `defaultDna(store.id)` → Task 8 test.

---

## File Structure

| File | Responsibility |
|---|---|
| `packages/storefront-kit/kit/commerce.js` (modify) | DNA style block; cart grip; added-notice anchoring; card preview markup and listeners; contact rules. |
| `packages/storefront-kit/kit/privacy.js` (modify) | DNA-keyed rules: store tokens and DNA shape. Same text, choices and focus order. |
| `packages/storefront-kit/kit/ui.tsx` (modify) | Component-mode card/cart button read `--kit-btn-*`; `data-fx=zoom` yields to `data-dna-card`. |
| `apps/api/src/storefront-source/source-commerce-surfaces.spec.ts` (create) | jsdom + static tests for every JS-affecting variant and the guard. |
| `apps/api/src/storefront-source/source-scorecard-capture.ts` (modify) | Collector records the variant-driven facts. |
| `apps/api/src/storefront-source/source-scorecard-capture.spec.ts` (modify) | Browser test: variants are measured apart. |
| `apps/api/src/stores/store-dna.ts` (create) + `.spec.ts` | Runtime DNA of a published store (config.js of the published revision, else seeded). |
| `apps/api/src/stores/public-stores.service.ts` (modify) | Adds `dna` to `getStorePublic`. |
| `apps/checkout/src/checkout-branding.ts`, `checkout-branding.css`, `main.ts`, `api.ts` (modify) + test | Confirmation receipt and actions take `button` and `radius`. |
| `docs/research/scorecard-after-kit-surfaces.md` (create) | After scorecard. |

---

### Task 1: Shared tokens, button form/hover/press, and the guard

**Files:** modify `kit/commerce.js` (new `dnaStyle` after `contactStyle`); create `source-commerce-surfaces.spec.ts`.

**Interfaces:** Produces `:root` tokens `--kit-ink`, `--kit-paper`, `--kit-accent`, `--kit-on-accent`, `--kit-surface`, `--kit-line`, `--kit-radius`, `--kit-radius-panel`, `--kit-border`, `--kit-photo-radius`, `--kit-photo-pad`, `--kit-photo-bg`, `--kit-btn-radius|border|bg|fg|case|tracking|pad|decor|clip|shadow`. A constant `KIT_BUTTONS` selector list (card add, cart/checkout button, product buy, sticky buy, added-notice action, recommendation actions, bundle add, contact submit). Quantity/remove buttons take `--kit-radius` and `--kit-border` only.

- [ ] Step 1: tests — (a) booting with DNA appends exactly one `style[data-pagosya-kit=dna]`; without DNA none, and the text of every other kit style element is identical with or without DNA; (b) guard: parse the DNA CSS rules; for each rule whose selector mentions a protected hook (`price`, `total`, `buy`, `checkout-button`, `data-pay`, `pagosya-policies`, `privacy`, `order-note`, `sold-out`) the declarations contain no `display:none`, `visibility:hidden`, `opacity:0`, and no `font-size` below 12px; (c) every button form, hover and press value in `DNA_VALUES` has a rule.
- [ ] Step 2: run, expect FAIL (no DNA style element).
- [ ] Step 3: implement the token block and button rules.
- [ ] Step 4: run, expect PASS; `node packages/storefront-kit/kit/check-runtimes.mjs`.
- [ ] Step 5: commit `feat(kit): DNA button forms, hover and press over shared kit tokens`.

### Task 2: Cart placements (drawer, sheet, page, overlay)

**Files:** `kit/commerce.js` (cart drawer markup gets `<span class="cart-drawer__grip" aria-hidden="true">`, DNA rules), spec.

- [ ] Step 1: tests — with `cart=sheet` the drawer has a grip; with `cart=page` clicking `[data-cart-open]` calls `showModal` (stubbed) and not `show`, and a `cancel` + `close` returns focus to the trigger; each cart value has an `:root[data-dna-cart=<v>] .cart-drawer` rule and an entry transition (`:not([open])` and `@starting-style`); sheet and page are `width:100vw` under 700px.
- [ ] Step 2: FAIL. Step 3: implement (drawer restyled: narrower, panel radius on the open edge, DNA border; sheet: bottom, grab handle, top radius; page: full viewport with an 880px column; overlay: centred card). Cart line photo takes the frame tokens; quantity buttons the shape tokens.
- [ ] Step 4: PASS. Step 5: commit `feat(kit): cart takes the store's DNA placement and shape`.

### Task 3: Added-to-cart placements (toast, ribbon, bubble, inline, stamp)

**Files:** `kit/commerce.js` (`addedFeedback` calls `placeAddedNotice(button)`), spec.

**Interfaces:** `placeAddedNotice(button)` sets `--added-top/--added-left/--added-right` for `bubble` (below the first visible cart trigger) and `inline` (below the pressed button), then sets `data-flip="top|bottom"` if the notice's rect intersects a visible cart trigger.

- [ ] Step 1: tests (rects stubbed) — `bubble` sets `--added-top` to the cart button's bottom + 10 and `--added-right` to its right inset; `inline` anchors under the pressed button; any placement overlapping a cart trigger gets `data-flip`; the notice keeps `role=status` and `aria-live=polite`; no DNA → no custom properties are written.
- [ ] Step 2: FAIL. Step 3: implement JS + CSS (toast restyled paper panel; ribbon full width at the top, bottom on phones; bubble with an arrow; inline small card; stamp centred double-bordered, fades).
- [ ] Step 4: PASS. Step 5: commit `feat(kit): added-to-cart confirmation takes the store's DNA placement`.

### Task 4: Checkout review (split, stacked, ticket, notebook) and the checkout surfaces

**Files:** `kit/commerce.js`, spec.

- [ ] Step 1: tests — each review value has a rule on `.checkout-review`; `ticket` puts the summary in the second column; the pay button is in `KIT_BUTTONS`; the review markup (field order, names) is identical across the four values (render with each and compare the list of `name` attributes and button labels).
- [ ] Step 2: FAIL. Step 3: implement (split: two columns, summary becomes a DNA panel; stacked: one 760px column; ticket: summary right, receipt panel with a perforated edge; notebook: ruled summary with a margin line). Checkout overlay background and summary take tokens.
- [ ] Step 4: PASS. Step 5: commit `feat(kit): checkout review takes the store's DNA layout`.

### Task 5: Product cards preview the product (still, second-photo, swatch-swap, zoom, quick-look, tilt) and frame

**Files:** `kit/commerce.js` (`productCard`, `customProductCard`, a `cardPreview(p, image)` helper returning extra markup, delegated listeners), spec.

- [ ] Step 1: tests — `second-photo`: a product with two `imageUrls` gets `img.menu-item__image-alt` with the second URL, one photo gets none, and a card without DNA never gets it; `swatch-swap`: a product whose variants carry photos gets up to 4 `button[data-card-swatch]` and clicking one sets the card photo's `src` and `aria-pressed`; `quick-look`: a chip `button[data-quick-look]` opens the product dialog; `tilt` adds no markup; long-press (touchstart held 450ms) sets `data-previewing` on the card. Templates (`[data-pagosya-product-template]`) get the same.
- [ ] Step 2: FAIL. Step 3: implement; frame tokens on `.menu-item__image`.
- [ ] Step 4: PASS. Step 5: commit `feat(kit): product cards preview the product per the store's DNA`.

### Task 6: Contact launcher, privacy dialog and sticky buy bar

**Files:** `kit/commerce.js` (rules added inside the `pagosya-contact-base` layer), `kit/privacy.js`, spec.

- [ ] Step 1: tests — the contact style has `:root[data-dna-button]` rules using `--store-*` and `--kit-*`; privacy CSS has `:root[data-dna-radius]` rules and reads `--store-background`; the privacy markup (text, buttons, order) is identical with and without DNA; the sticky bar button is in `KIT_BUTTONS`.
- [ ] Step 2: FAIL. Step 3: implement. Step 4: PASS. Step 5: commit `feat(kit): contact, privacy and sticky bar take the store's tokens and DNA shape`.

### Task 7: Component mode reads the same tokens

**Files:** `kit/ui.tsx`, spec (reads `UI_CSS` text).

- [ ] Step 1: test — `.ui-card__add` and `.ui-cart` radius read `var(--kit-btn-radius,…)`; the `data-fx=zoom` hover is scoped to `:root:not([data-dna-card])`.
- [ ] Step 2: FAIL. Step 3: implement. Step 4: PASS + `pnpm --filter @pagosya/storefront-kit test`. Step 5: commit.

### Task 8: Order confirmation takes the store's button form and radius

**Files:** create `apps/api/src/stores/store-dna.ts` + spec; modify `public-stores.service.ts`; checkout `api.ts` (type), `main.ts` (remember DNA), `checkout-branding.ts`, `checkout-branding.css`, new `checkout-branding.test.ts`.

- [ ] Step 1: tests — API: `publishedStoreDna` returns the `dna` of the published `config.js` when valid, `sourceRuntimeDna(undefined, storeId)` otherwise (no revision, raw query throws, unparsable config, unknown values); checkout: with a remembered DNA, `applyCheckoutBranding` sets `data-dna-button`/`data-dna-radius` on `<body>` for a branded session, ignores unknown values, and clears them when unbranded.
- [ ] Step 2: FAIL. Step 3: implement (CSS rules on `.store-branded-checkout[data-dna-*]` for `.receipt`, `.receipt-action`, `button.primary`, `button.secondary`). The pagosYa printer overlay is not touched.
- [ ] Step 4: PASS. Step 5: commit.

### Task 9: The collector measures the variant-driven facts

**Files:** `source-scorecard-capture.ts` + spec.

- [ ] Step 1: browser test — the kit default with DNA `{cart:'sheet', added:'ribbon', review:'ticket', card:'zoom', button:'pill'}` vs `{cart:'overlay', added:'bubble', review:'stacked', card:'second-photo', button:'stamp'}` differs by ≥ 0.25 on cart, added, review, card and button, and each differs from the no-DNA kit default by ≥ 0.25.
- [ ] Step 2: FAIL (facts not measured). Step 3: add facts — cart: `border`, `photoRadius`, checkout button `btnRadius/btnBorder/btnTransform`; added: `border`, action `btnRadius/btnTransform`; review: `summaryShare`, `radius`, `border`, `bgDelta`, pay `btnRadius/btnBorder/btnTransform`; card: `pad`, `hover`, `swatches`, add `btnRadius/btnBorder/btnTransform`; button: `hover`. Cart position recognises a bottom sheet narrower than the viewport.
- [ ] Step 4: PASS. Step 5: commit.

### Task 10: Verify and re-run the scorecard

- [ ] Full verification list (jest storefront-source, checkout vitest, storefront-preview tests, kit check, Studio Playwright `cross-sell-kit` and `checkout-layout`, tsc, eslint).
- [ ] `cd apps/api && npx ts-node -T scripts/uniqueness-scorecard.ts --limit 12 --out ../../tmp/scorecard/after-kit-surfaces`; commit `SCORECARD.md` as `docs/research/scorecard-after-kit-surfaces.md` with a short "Read this first". Target: closest pair ≥ 0.25 and zero stores too close to the default on cart, added, review, card and button; iterate or rule.
