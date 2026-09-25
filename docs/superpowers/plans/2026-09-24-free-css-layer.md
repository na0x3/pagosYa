# Validated Free-CSS Layer — Implementation Plan (sub-project 7)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** YAPI gets one validated place for kit-surface CSS (`styles/kit.css` in static mode, a `/* pagosya-kit:start */ … /* pagosya-kit:end */` block in `styles/globals.css` in component mode). It loads in a `pagosya-store-kit` cascade layer after the kit and the DNA, and it is the only CSS that may restyle the product page. Every authored stylesheet is checked so prices, totals, buy/pay buttons, quantity, legal and status text are never hidden, shrunk or faded, and authored `--motion-*` values are clamped. At runtime the kit fixes pay/buy buttons and totals that read below 4.5:1. The validator repairs and records; it never fails a generation. A store without kit CSS renders as today, except that low-contrast pay/buy buttons and totals are now fixed.

**Architecture:**
- `apps/api/src/storefront-source/source-kit-css.ts` (new, postcss) owns the rules. `validateStoreKitCss(css)` normalizes the kit CSS: it unwraps a previous canonical form, keeps only selectors rooted on kit surfaces, strips protected-element violations, external `url()`/`@import`/`@font-face`/`!important`, clamps `--motion-*` and applies a 12 KB cap. `storeKitStylesheet(plain)` emits the served form: a layer order statement `@layer pagosya-commerce, pagosya-contact-base, pagosya-dna, pagosya-store-kit;`, the surface rules inside `@layer pagosya-store-kit {…}`, and the product-page rules **unlayered**, each prefixed with `:root:not(#pagosya-store-kit)`, which adds one ID of specificity. That prefix is what lets them beat the kit's unlayered product styles and the DNA page rules. `validateAuthoredCss(css)` applies only the protected-element rules and the motion clamps to the store's other CSS.
- **Static:** `styles/kit.css` is stored in the served (canonical) form. Normalizing is idempotent, so a re-save changes nothing. `applySourceKitCss(files)` links it from every page, right after `styles.css`, with `data-pagosya-kit="store"`. It removes that attribute from any other authored tag, and it removes the links when the file is gone.
- **Component:** the block stays plain in `globals.css`. `compileNextPreview` cuts it out before Tailwind, validates it and emits `styles/kit.css` (canonical) plus the link in the compiled HTML.
- **Cascade:** `pagosya-commerce < pagosya-contact-base < pagosya-dna < pagosya-store-kit < unlayered authored CSS` for kit surfaces. On the product page, the store's `styles.css` rules are still released by `releaseProductPageStyles`. The kit link is exempt because its `ownerNode` carries `data-pagosya-kit`, and its ID-scoped rules beat the kit.
- **Runtime contrast guard** (`commerce.js`): after each render pass (the existing `queueReadableText` timer and `load`), the guard measures pay/buy buttons (`.checkout-button`, `.menu-add`, `.product-detail__sticky button`, `[data-pay]`, `[data-checkout]`) and totals (`.order-total`, `.product-detail__subtotal`). It composites text over the ancestor background colours, the way the scorecard measures. Below 4.5:1, it sets the text colour inline with `!important`, choosing the first of the store's ink, paper or on-accent, pure black or pure white that reaches 4.5:1. It marks the element `data-pagosya-contrast-guard` and warns once in the console.
- **Prompt:** one short stable section per mode (layer, allowed selectors, tokens, protected elements). The two lines that sent product/checkout styling to `styles.css` point to the kit CSS instead.

**Tech Stack:** NestJS API, postcss 8 (already a dependency), Jest (ts-jest), Playwright Chromium (cascade layers; jsdom 25 drops `@layer` sheets), kit runtime (vanilla JS).

**Spec:** `docs/superpowers/specs/2026-09-24-free-css-layer-design.md` (binding), adapted to the post-sub-project-5 cascade (see Rulings in the ledger). Parent: `docs/superpowers/specs/2026-09-24-yapi-unique-stores-design.md` §5 gates 1–2.

## Global Constraints

- The validator never throws for CSS content. It strips, clamps or drops, and records one `autoRepairs` note per problem, capped at 12 per file plus a count. Unparsable kit CSS is dropped with a note. Unparsable authored CSS is left alone, and the existing validators report it.
- A store with no kit CSS gets no `styles/kit.css`, no link and no new layer. `commerce.js` cascade code is unchanged. Only the contrast guard is new at runtime.
- Allowed kit selector roots (the first compound after an optional `html`/`:root` qualifier made only of `[data-dna-*]` attributes, optionally tag-prefixed): `.cart-drawer`, `.cart-added`, `.order-item`, `.checkout-review`, `[data-pagosya-checkout`, `[data-pagosya-product`, `.product-detail__`, `.menu-item`, `.menu-add`, `.checkout-button`, `.pagosya-contact-`, `[data-pagosya-contact`, `[data-pagosya-privacy`, `.quantity`. A bare `:root`/`html` rule may only set `--kit-*` and `--motion-*`.
- Protected subjects: price/total/subtotal classes, `[data-product-field=price]`, `.checkout-button`, `.menu-add`, `.product-detail__buy*`, `.product-detail__quantity`, `.quantity`, `[data-pay]`, `[data-add]`, `[data-checkout]`, `[data-product-quantity]`, `.pagosya-policies`, `[data-pagosya-policy]`, `.pagosya-secure-note`, `[data-pagosya-privacy]`, `[data-pagosya-status]`, `[data-pagosya-checkout-status]`, `.product-detail__status`. A bare `button|span|strong|output|small|*` is also protected when it sits under a protected compound. Pseudo-elements are exempt. `:disabled`, `[disabled]`, `[aria-disabled…]`, `:empty` and `[hidden]` exempt the hiding and fading rules.
- Motion limits equal `MOTION_LIMITS` in `commerce.js` (pinned by a test): fast/base/slow 0–900ms, distance 0–40px, stagger 0–120ms, parallax 0–2, press-scale 0.85–1.
- Commit with a pathspec only (`git commit -m … -- <paths>`), after checking `git diff --cached --name-only` and `git status --short`.
- Jest paths are relative to `apps/api/src`: `cd apps/api && npx jest storefront-source/<file>`.

## Review Focus

1. `validateStoreKitCss` is idempotent: canonical in, same canonical out, no repairs → Task 1 test.
2. A kit-CSS rule really outranks the DNA and `shoppingStyle` on the cart. A product-page rule reaches the product page (not released) over the DNA pill form. The store's unlayered `styles.css` still wins on the cart → Task 2 Chromium tests.
3. No protected violation survives in any authored CSS, and legitimate state rules (`:disabled` opacity, `[data-pagosya-status]:empty{display:none}`) survive → Task 1 tests.
4. `url(assets/x)` written by the model resolves from `styles/kit.css` (rewritten to `../assets/x`) in preview, hosted and preflight → Tasks 2 and 3.
5. The contrast guard fixes a mid-tone accent with white text (4.41:1 → ≥ 4.5 with pure black), beats an authored `!important` colour, leaves readable buttons untouched and is re-measured after re-render → Task 4 Chromium tests.
6. The prompt growth does not tip the 12-credit truncated-repair test → Task 5.

---

## File Structure

| File | Responsibility |
|---|---|
| `apps/api/src/storefront-source/source-kit-css.ts` (create) | Rules, `validateStoreKitCss`, `storeKitStylesheet`, `validateAuthoredCss`, `applySourceKitCss`, `extractKitBlock`, `SOURCE_KIT_CSS_DIRECTION(_NEXT)`, `SOURCE_MOTION_LIMITS`. |
| `apps/api/src/storefront-source/source-kit-css.spec.ts` (create) | Pure validator/emitter/file-wiring tests. |
| `apps/api/src/storefront-source/source-commerce-store-kit.spec.ts` (create) | Chromium cascade and contrast-guard tests. |
| `apps/api/src/storefront-source/source-next.ts` (modify) | Block extraction in `compileNextPreview`; kit link in compiled pages; prompt line 28. |
| `apps/api/src/storefront-source/source-generation.service.ts` (modify) | `applySourceKitCss` step with `autoRepairs`; `styles/kit.css` allowed path; prompt sections. |
| `apps/api/src/storefront-source/source-projects.service.ts` (modify) | `prepare`: normalize static `styles/kit.css`; drop a stale compiled `styles/kit.css`. |
| `packages/storefront-kit/kit/commerce.js` (modify) | Contrast guard. |

---

### Task 1: The validator

**Files:** create `source-kit-css.ts`, `source-kit-css.spec.ts`.

**Interfaces:**
- `validateStoreKitCss(css: string, path = 'styles/kit.css'): { css: string; repairs: string[] }`: the canonical served form, or `''` when nothing is left.
- `validateAuthoredCss(css: string, path: string): { css: string; repairs: string[] }`: the input unchanged (byte-identical) when there is nothing to repair.
- `SOURCE_MOTION_LIMITS`.

- [ ] **Step 1: Failing tests.** Allowed rules pass, one per allowed root, plus a `html[data-dna-cart=sheet] .cart-drawer` qualifier and a `:root{--kit-btn-radius;--motion-base}` token rule. Stripped, each with a note: `body .menu-add`, `button`, `:root{color:red}`. Each protected violation on `.menu-add`/`.order-total`/`.product-detail__price`/`[data-pagosya-status]`/`.pagosya-policies button` is stripped with a note: `display:none`, `visibility:hidden`, `opacity:.4`, `clip:rect(0 0 0 0)`, `clip-path:inset(50%)`, `font-size:10px|0.6rem|clamp(8px,2vw,14px)`, `transform:scale(.5)`, `scale:.8`, `left:-9999px`, `text-indent:-999em`, `transform:translateX(-200vw)`, `pointer-events:none`, `color` equal to `background` in the same rule, `color:transparent`. Survives: `:disabled{opacity:.5}`, `[data-pagosya-status]:empty{display:none}`, `.menu-add::before{display:none}`, `transform:scale(.96)`, `font-size:13px`, `.checkout-button svg{display:none}`. Stripped: `url(https://x/y.png)`, `url(data:…)`, `@import`, `@font-face`, `!important` (flag dropped, declaration kept). Kept: `url(assets/m.svg)` (rewritten to `../assets/m.svg`) and `url(motifs/lamp.svg)`. Size cap: 13 KB of rules is trimmed to ≤ 12 KB with a note. Motion: `--motion-base:3000ms` → `900ms`, `--motion-press-scale:0` → `0.85`, `--motion-distance:-4px` → `0px`, `--motion-parallax:9` → `2`, `--motion-stagger:1s` → `120ms`, `--motion-fast:var(--x)` dropped. The same clamps apply in `validateAuthoredCss`, which keeps non-kit selectors (`body .hero{…}`) untouched and returns the input byte-identical when clean. Canonical output: starts with the layer order statement, surface rules sit inside `@layer pagosya-store-kit`, product-page selectors (split out of mixed lists) are unlayered with `:root:not(#pagosya-store-kit)` (inserted after a leading `html[…]` compound), and `validateStoreKitCss(out.css)` returns `out.css` with no repairs. `SOURCE_MOTION_LIMITS` equals `MOTION_LIMITS` in `commerce.js`.
- [ ] **Step 2: Run, expect FAIL** (module missing).
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit** `feat(yapi): validate store kit CSS and every authored stylesheet's protected elements`.

### Task 2: The served layer in the browser

**Files:** create `source-commerce-store-kit.spec.ts` (Chromium, the harness of `source-commerce-cascade.spec.ts`: `<link rel=stylesheet data-pagosya-kit=store href=data:text/css;base64,…>` from `validateStoreKitCss`).

- [ ] **Step 1: Tests.** (a) Kit CSS `.cart-drawer{background:rgb(9, 8, 7)}` beats `shoppingStyle` and the DNA drawer background, and `html[data-dna-cart=sheet] .cart-drawer{border-top-left-radius:3px}` beats the DNA sheet radius. (b) Kit CSS `.product-detail__buy{border-radius:3px}` reaches the product page over the DNA pill form (999px). The same rule in the authored `<style>` is still released. (c) The store's unlayered `.cart-drawer{background:rgb(1, 2, 3)}` beats the kit CSS. (d) A store with no kit CSS keeps the kit drawer default. (e) `url(assets/…)` in the served sheet is `../assets/…`, checked through `sourcePreviewDocument` in the storefront-preview package test if it is reachable, else by the string test in Task 1. Expected: (a)–(d) pass on the first run if Task 1's emitter is right; they are recorded as guards. If one fails, fix the emitter.
- [ ] **Step 2–4:** Run; fix; PASS.
- [ ] **Step 5: Commit** `test(kit): store kit CSS outranks the kit and DNA, reaches the product page, yields to the store's own CSS`.

### Task 3: Wiring into saves and generation

**Files:** `source-kit-css.ts` (`applySourceKitCss`, `extractKitBlock`), `source-next.ts`, `source-generation.service.ts`, `source-projects.service.ts`, their specs.

**Interfaces:**
- `applySourceKitCss(files, { next }): { files; repairs }`. Static: `styles/kit.css` → canonical (dropped when empty); every other authored `.css` except `commerce-pages.css`/`brand.css` → `validateAuthoredCss`; links inserted or removed in every `.html`; forged `data-pagosya-kit` removed from authored tags. Next: the `globals.css` block → the plain validated rules (stays a block), the rest → `validateAuthoredCss`.
- `extractKitBlock(css): { rest: string; block: string }`.
- `compileNextPreview`: Tailwind gets `rest`; emits `styles/kit.css` = `validateStoreKitCss(block).css` when non-empty; compiled pages link it after `styles.css`.

- [ ] **Step 1: Failing tests.** `applySourceKitCss` inserts `<link rel="stylesheet" href="styles/kit.css" data-pagosya-kit="store">` after the `styles.css` link (and `../styles/kit.css` for `pages/x.html`), removes it when the file is absent, strips a forged `data-pagosya-kit` on an authored `<style>`, validates `styles.css` (strips `.menu-add{display:none}`), and is idempotent. `compileNextPreview` with a block → `styles/kit.css` canonical, compiled `index.html` links it, compiled `styles.css` does not contain the block's rule. Without a block → no `styles/kit.css`, no link. `validateGeneratedSource` accepts `styles/kit.css`. A generation (service spec, mocked provider) whose `styles.css` hides `.menu-add` and whose `styles/kit.css` has a `body` rule saves the repaired files and lists both repairs in `generation.autoRepairs`.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.** Insert the step in the attempt loop right after `relaxSourceTracking`. `prepare` normalizes the static kit file and drops a stale compiled `styles/kit.css`.
- [ ] **Step 4: Run** the specs plus `source-next`, `source-generation.service`, `source-projects.service`, `source-preflight`: PASS.
- [ ] **Step 5: Commit** `feat(yapi): the store kit CSS is validated on every save and linked after the store's styles`.

### Task 4: Runtime contrast guard

**Files:** `commerce.js`; tests in `source-commerce-store-kit.spec.ts`.

- [ ] **Step 1: Failing tests (Chromium).** A store whose `.checkout-button` in the cart is `background:#c2452e;color:#fff` (≈4.4:1) is guarded to ≥ 4.5:1: measured with the scorecard's `contrastRatio` over composited backgrounds, the element carries `data-pagosya-contrast-guard` and a console warning is logged. A kit-CSS rule `.menu-add{background:#777;color:#888}` is neutralised. An authored `.menu-add{color:#eee!important;background:#fff}` is neutralised. A readable `.menu-add` (`#111` on `#fff`) gets no attribute and keeps its colour. `.order-total` in the open cart, with grey text on grey, is fixed. After a re-render (quantity change) the guard still holds.
- [ ] **Step 2: Run, expect FAIL** (no guard).
- [ ] **Step 3: Implement** `guardContrast()` (reset, then measure, then fix), called from the `queueReadableText` timer after `readableText`, at the end of `renderCart()` via `queueReadableText()`, and on `load`. No ES2022+ APIs (browser-floor spec).
- [ ] **Step 4: Run** the spec plus `source-commerce-*`, `source-kit-browser-floor`, `pnpm --filter @pagosya/storefront-kit test`: PASS.
- [ ] **Step 5: Commit** `feat(kit): pay and buy buttons and totals are held at 4.5:1 at runtime`.

### Task 5: Prompt

**Files:** `source-kit-css.ts` (texts), `source-generation.service.ts`, `source-next.ts`, `source-generation.service.spec.ts`.

- [ ] **Step 1: Failing test:** the static prompt contains `styles/kit.css` and the protected-element sentence; the component prompt contains `pagosya-kit:start`. The line that asked to style `.product-detail__buy.checkout-button` in shared `styles.css` rules now points to the kit CSS.
- [ ] **Step 2–4:** RED, implement (≤ ~450 characters each), GREEN. The full `source-generation.service.spec.ts` (including the truncated-repair allowance) stays green.
- [ ] **Step 5: Commit** `feat(yapi): tell the build where kit-surface CSS goes and what it may not do`.

### Task 6: Verification and scorecard

- [ ] `cd apps/api && npx jest storefront-source --runInBand`; checkout vitest; storefront-preview; `pnpm --filter @pagosya/storefront-kit test`; Studio Playwright `cross-sell-kit` + `checkout-layout`; api tsc; eslint on touched TS.
- [ ] Scorecard on the 12 baseline ids (`--stores`, ids from `tmp/scorecard/after-kit-surfaces-review/scorecard.json`), out `../../tmp/scorecard/after-free-css`. Append an "After the free-CSS layer" note (quality section) to `docs/research/scorecard-after-kit-surfaces.md`. Record the result in the ledger.
