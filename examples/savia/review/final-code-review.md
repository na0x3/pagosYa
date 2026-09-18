I found 5 bugs worth fixing. The variant checks in checkout and the runtime match, and extras correctly stay in standard checkout. Nothing was modified.

## 1. The runtime reads `--brand-*` before the site's own `--store-*` values, so shop screens can drift from the site's pages
**`commerce.js`** wraps every shared value brand-first, for example:
- `:146` `color:var(--brand-foreground,var(--store-foreground,…))`
- `:185` `--product-accent:var(--brand-accent,var(--store-accent,…))`
- `:509`, `:526` and `:544` for the cart drawer, cart button and checkout inputs
- `:194` the heading font

The manifest does the same (`source-style-tokens.ts:40`): `const raw = brand?.value || own?.value || '';`

The contract only has `--store-*` point at the brand during new design work. `validateSourceStyleTokens` says: *"Legacy local edits are not forced to migrate…"* (`:48-49`). `source-visual-system.ts:44` allows *"explicit current requests may change any requested visual property"*.

So a local edit like "make the buttons green" sets `--store-accent:#2a7`. The site's pages turn green, but the product page, cart and checkout stay the brand colour. The manifest's `resolved` value also reports the brand value, not what the pages use.

**Fix:** read `--store-*` first: `var(--store-accent,var(--brand-accent,…))`. For projects that follow the contract, `--store-accent` already points at the brand, so nothing changes for them. In `sourceStyleTokens`, resolve from `own` when it exists, and use the brand value only when there is no `own` or `own` just references the brand.

## 2. The checkout overlay still uses the old `--paper`/`--ink` variables, while its inputs use the new tokens
- `commerce.js:398`: `[data-pagosya-checkout]:not([hidden]){…background:var(--paper,#fffaf0);color:var(--ink,#20211d)…}`
- `:544`: `[data-pagosya-checkout] input…,textarea{…color:inherit;background:var(--brand-background,var(--store-background,var(--paper,Canvas)));…}`
- `:413` (`select` background `var(--paper,#fffaf0)`), `:408` and `:411` (`--line`) also skip the tokens.

A new design defines `--store-*` as the contract asks, and doesn't define `--paper`/`--ink`. Take a dark store and open the checkout overlay (no `config.checkoutPage`):
- The panel is light (`#fffaf0`) with dark text.
- The address, postal code and credit inputs get a dark background and inherit the dark text, so they are unreadable.
- The selects stay light.

This breaks the rule to *"Use these same --store-\* values across homepage, product, cart and checkout"*. The full-page checkout avoids it because `:423` (`background:inherit;color:inherit`) is outside the layer and wins.

**Fix:** use the same token chain at `:398`, `:405`, `:408`, `:411` and `:413` as the drawer uses at `:509`/`:513`.

## 3. The review form isn't tied to the product being viewed
- `commerce.js:1060`: `<select name="productId">${products().map(p => \`<option value="${escape(p.id)}">…\`)}</select>`

There are three problems:
- **Wrong default:** the select has no `selected` option. On the product page for product B, the form defaults to the first catalog product. A buyer who doesn't notice sends a verified review for the wrong product.
- **Stale list:** the form is built once at script start, before `load()` fetches the live catalog (`:1039`), and never rebuilt. On standalone published pages the list can be stale or empty.
- **Race in the reviews list:** `:1054` filters with `review.productId === selectedProduct?.id`. `selectedProduct` is only set when `render()` → `openProduct` finds the product. If the content request finishes while `openProduct` hasn't found it (for example, `config.data` doesn't include it yet), every review is filtered out. The list is never filtered again, so the page shows "Todavía no hay reseñas publicadas."

**Fix:**
- Get the product ID once from `new URLSearchParams(window.PAGOSYA_PREVIEW_QUERY || location.search).get('id')`.
- Use that ID in the reviews filter.
- On the product page, preselect or lock the select to that ID.
- Rebuild the options after `load()`.

## 4. Visual review reports catalog problems as a Chromium failure
- `source-visual-capture.ts:14`: `sourceVisualState(...)` throws `'Selecciona un producto real del catálogo para revisar esta página.'` when the product page has no items or the `productId` is wrong.
- `source-visual-review.service.ts:72-73`:
  ```ts
  try { captures = await captureSourceVisuals(...); }
  catch { throw new ServiceUnavailableException('No se pudieron capturar las vistas. Comprueba que Chromium esté instalado…'); }
  ```

That input error becomes a 503 telling the merchant to check Chromium, so they can't tell they need to pick a product. It also happens after `this.running` is set and the review has been hydrated, which wastes work.

**Fix:** in `review()`, call `sourceVisualState(snapshot, input.page, input.productId)` before `hydrate` and the capture. Turn its error into a `BadRequestException` with the same message, and keep the Chromium message for real browser failures.

## 5. The brand-reference check matches on a prefix
- `source-style-tokens.ts:59`: `!declaration.value.trim().startsWith(\`var(--brand-${name}\`)`

For `name === 'accent'`, `--store-accent: var(--brand-accent-foreground, #fff)` passes. That swaps the accent for the text-on-accent colour and breaks the confirmed identity without an error. It also rejects `var( --brand-accent)` with a space.

**Fix:** match the full name, e.g. `/^var\(\s*--brand-${name}\s*[,)]/`.

## Also noticed on mobile checkout (not a blocker)
The step order is fine. The review step appends the order summary before the delivery fields and pay button (`:764` `el.append(summary, fields)`), so at 390px the pay button is well below the fold.

Errors from the pay button (`:947`, `:949`, `:950`) only go to `message()`. It writes to `[data-pagosya-status]`, which sits in the header at the top of the overlay (`:570`). On a phone, tapping pay seems to do nothing and focus doesn't move. Consider putting a status line next to the pay button in `fields`, or scrolling to or focusing the status.

## Key missing tests
1. **Token precedence:** brand.css sets `--brand-accent:#111` and the site sets `--store-accent:#2a7`. The PDP buy button, cart button and checkout button should all show `#2a7`, and the manifest's `resolved` should too.
2. **Dark checkout overlay:** with only dark `--store-background`/`--store-foreground`, inputs, selects and panel text should be readable (compare computed colours).
3. **Brand-reference check:** it rejects `--store-accent: var(--brand-accent-foreground)` and accepts `var( --brand-accent , #x)`.
4. **Review identity:**
   - On `product.html?id=B`, the form defaults to B.
   - Reviews are filtered by B even when content loads before the catalog.
   - The select lists the live catalog after `load()`.
5. **Visual review:** a product page with an empty catalog or unknown `productId` returns 400 with the product message. Chromium and the provider should not be called, and `running` should be reset.
6. **Variant parity:** one set of test cases run through both `sourceCanConfigureProduct` and `commerce.js` `buildOptionGroups`: extras, duplicate IDs, mismatched group names, 65 variants, legacy named variants and empty variants. The logic is copied in two places and has no guard against drift.
7. **Storefront routing (`source-storefront.ts:20`):** a routed variant product returns `false` when the snapshot's `commerce.js` lacks the marker, and a routed extras product always returns `false`.
8. **Snapshot vs. review:** `review()` captures `currentSourceRuntime(saved.snapshot)`, but routing checks the snapshot's own `commerce.js` marker. Add a test that an older snapshot without the marker is reviewed with the runtime shoppers actually get, or document that the review uses the current runtime on purpose. I didn't read `currentSourceRuntime`, so I can't confirm this is a bug.
9. **Mobile checkout:** at 390px, a failed pay tap puts a visible or focused error near the button.