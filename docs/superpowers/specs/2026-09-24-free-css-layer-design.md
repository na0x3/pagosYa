# Validated free-CSS layer — sub-project 7 design

Date: 2026-09-24. Parent: `docs/superpowers/specs/2026-09-24-yapi-unique-stores-design.md` (§3 row 7, §5 gates 1–2).
Depends on: sub-project 5 (kit surface classes and `--kit-btn-*` tokens).
Status: written under the owner's instruction "build everything from 2-8".

## 1. What exists

- Generated CSS can already restyle kit surfaces, and the prompts ask it to
  (`source-next.ts:29`, `source-generation.service.ts:413-414`). Kit CSS sits in cascade layers, so
  unlayered authored CSS wins. The exception is `shoppingStyle` (unlayered, injected at runtime), which
  wins at equal specificity.
- `releaseProductPageStyles` (`commerce.js:571-597`) deletes authored rules that target the product page.
- There are no static guards against hiding or shrinking prices, buttons, totals or legal text. Only the
  Studio probe checks visibility at runtime, and it does not check `opacity:0`.

## 2. Design

1. **One place for surface CSS.** YAPI may write `styles/kit.css` (static) or a
   `/* pagosya-kit:start */ … /* pagosya-kit:end */` block in `globals.css` (component mode). The kit loads
   it in a dedicated cascade layer, `pagosya-store-kit`, ordered after the kit's own layers. Its rules
   therefore reliably override kit defaults, including `shoppingStyle`, which moves into a layer. The
   product-page stripping stays for rules outside this layer and is lifted for this layer only.
2. **The validator (`source-kit-css.ts`)** parses the CSS with postcss (already a dependency of the
   Tailwind build) and enforces these rules. Each violating declaration is removed and recorded in
   `autoRepairs`, not failed:
   - **Selectors must target kit surfaces:** allowed prefixes are `.cart-drawer`, `.cart-added`,
     `.order-item`, `.checkout-review`, `[data-pagosya-checkout]`, `[data-pagosya-product]`,
     `.product-detail__*`, `.menu-item`, `.menu-add`, `.checkout-button`, `.pagosya-contact-*`,
     `[data-pagosya-privacy]`, `.quantity`, plus `html[data-dna-*]` qualifiers.
   - **Protected elements** (price, total, buy/pay button, quantity, legal and privacy text, and the
     status line): no `display:none`, `visibility:hidden`, `opacity` below 1, `clip`/`clip-path` hiding,
     `font-size` under 12px, `transform: scale` under 0.9, `position` that moves them off-screen,
     `pointer-events:none`, and no text colour equal to its background.
   - **No external resources:** no `url()` except bundled `assets/` and `motifs/` paths, and no
     `@import`.
   - **Size cap:** 12 KB.
3. **Runtime contrast guard.** After render, `commerce.js` checks the computed contrast of the pay and
   buy buttons and the total. If it is below 4.5, it removes the store-kit layer's colour
   declarations for that element by setting a guard attribute that the kit's own highest layer
   answers. It also logs a console warning. Readability never depends on the model.
4. **Prompt.** A short section explains the layer, the allowed selectors, the `--kit-btn-*` and
   `--motion-*` tokens, and the protected elements.

## 3. Tests

- The validator: allowed rules pass; each protected-element violation is stripped, with a repair note;
  a selector outside the kit surfaces is stripped; external `url()` and `@import` are stripped; the size
  cap applies.
- Cascade: in jsdom (or the capture sandbox), a store-kit rule changes the cart drawer background, even
  though `shoppingStyle` also sets it.
- The contrast guard: a store-kit rule that makes the pay button low-contrast is neutralised at runtime.
- The scorecard's quality section shows no contrast failures on the benchmark stores after this
  sub-project.
