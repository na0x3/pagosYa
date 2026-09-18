# Complete generated stores

The source builder now prepares a storefront with product and checkout pages on the first successful generation. This extends **Sitio a medida** without changing the existing editor’s visual system. Model controls, guided setup, image limits, and usage-credit behavior are documented in [Source generation controls](SOURCE_GENERATION_CONTROLS.md).

## First generation and later revisions

The generation prompt requests working navigation, an introduction, catalog, business information, delivery and purchase guidance, contact, and a footer. It directs the model to use supplied facts and avoid invented products, prices, claims, or policies. These are generation instructions, not a guarantee of visual or editorial quality for every response.

The first-generation prompt now requests authored `product.html` and `checkout.html` with the same navigation and visual identity as the homepage. Their runtime hooks and shared script/style connections are validated. The platform supplies `commerce-pages.css` and fallback page shells if those pages are omitted. The base stylesheet loads before the authored stylesheet. Both supplied pages load the site’s shared CSS and JavaScript, and their commerce structure renders the actual catalog through the platform runtime. The generated shared script must tolerate elements that exist only on the homepage. The saved brief retains collected setup answers in `businessInformation`; individual answers and the serialized brief have length limits, so it is not an unlimited document store.

On the first successful generation from revision zero, the revision, completed usage record, and store’s `checkoutMode: "payment"` are saved in one database transaction. A failed generation does not enable that mode through this path. This setting enables the payment route; it does not itself execute a payment or bypass the platform’s existing eligibility requirements.

Legacy revisions keep the prior product-detail and checkout overlay behavior unless their edited file set contains both `product.html` and `checkout.html`. Later edits are instructed to preserve unrelated source and visual choices. Adding commerce pages is not treated as permission to redesign the homepage.

## Customer flow

The conversation agent and source generator share `SOURCE_SHOPPING_FLOW` in `apps/api/src/stores/source-shopping-flow.ts`. Every generation and revision receives the same default: **Pedido → right-side cart drawer → full-page fulfillment → full-screen pagosYa payment**. Unrelated edits preserve the current visual identity. The AI must use `data-cart-open` and a hidden `data-pagosya-cart` slot, rather than implement another cart or payment modal.

The native dialog drawer is the smaller of 600 px and 48% of the viewport on desktop, and the full viewport width at 700 px and below. It supports empty state, quantity edits, Escape, backdrop dismissal and focus return. Successful adds update the count and show a visible confirmation with brief feedback motion; reduced-motion and motion-off settings retain the text confirmation. Checkout puts fulfillment questions in the main column and order totals in a secondary column, stacked on phones. Delivery uses enabled store options, requires an address, and carries that address into payment; pickup shows the configured branch address. Store payment and the isolated Studio payment preview use the full screen. Current location remains optional in the payment form and is requested only after pressing the location button. Manual address entry works without permission. Map-pin selection is not bundled: the AI is told to offer it only when a working supported map integration exists.

Catalog product links open `product.html?id=…`. Product pages include the real name and price, stock state, image gallery, description, and configured delivery/pickup information. Description and delivery appear in separate tabs. Missing descriptions and delivery configuration have explicit empty states. Simple products can be added to the cart; the cart survives local page navigation.

`checkout.html` lets customers review quantities and available branch and fulfillment choices. It shows a subtotal and states that the final total is confirmed in checkout. In a live payment-mode storefront, continuing creates a cart-checkout session through the pagosYa API and redirects to hosted pagosYa checkout to complete payment. Payment entry is not implemented inside the generated static page.

In Studio and its browser preview, the payment button opens the existing pagosYa customer-details and payment-method form in a trusted dialog outside the authored site's sandbox. The form uses a dedicated display-only preview route, recalculates its displayed amount from catalog prices and quantities, and labels submission **Simular pago**. It does not fetch, create, confirm, or cancel real payment sessions. Canceling returns to the preserved order. `VITE_CHECKOUT_ORIGIN` must point to the checkout app (the full local stack uses `http://localhost:5175`). Authored checkout pages mark their cart `data-checkout-review="review"` to avoid a second order-review step. Standalone demo exports retain the portable simulated screen. Products with variants or extras retain an existing limitation: live sites send customers to hosted pagosYa product options; those option controls are disabled in preview/demo. The local cart handles simple products only.

## Accessibility and presentation

The supplied pages include a skip link, named store navigation, semantic main content, live status messages, and visible keyboard focus. Product tabs expose tab/panel relationships, selected state, and roving focus with Left/Right, Home, and End keys. Gallery controls have accessible names and selected thumbnail state. Checkout moves focus to its heading; the legacy overlay also restores the invoking control’s focus on close.

Commerce CSS uses the storefront’s existing variables with local fallback values, wraps navigation, and adapts at 640 px. It provides reduced-motion overrides and generous purchase and quantity targets. This is a supplied commerce-page treatment, not a new root token system. Generated homepage styling still needs visual and accessibility review.

## Performance changes and boundaries

- Revision checks use a current-project query without fetching revision history. Estimate sizing aggregates authored HTML/CSS/JS lengths in PostgreSQL instead of transferring the snapshot’s bundled base64 images.
- Image ownership is checked in one bulk query; asset reads use up to four concurrent workers. The composer uploads up to three prepared images at once.
- The generation prompt includes at most the first 60 catalog items plus the full count. Runtime configuration still contains the complete catalog. Static prompt instructions precede changing business data and previous source; this ordering does not promise a cache hit or a fixed latency.
- `?source=1` loads the source builder lazily, and `?browser=1` loads its standalone preview. The existing connected editor remains reachable at `/`, and `?demo=1` retains the demo. Opening the source builder does not load either older editor’s JavaScript.

The export includes static source, local build/server helpers, and selected uploaded assets. Live catalog refresh, orders, stock, payments, and customer data still depend on pagosYa services; other catalog image URLs may also depend on the API. Hosting and origin configuration remain separate deployment work.

## Verification evidence

The local synthetic Auto-generation run was reported at approximately 50.8 seconds and 7 usage credits. Its first browser pass failed to identify a custom cart-drawer button. Expanding the test selector and rerunning against the saved source passed without another model request or changes to the generated site. This is one observed run, not a latency guarantee or model ranking.

The saved-source rerun is recorded in `/tmp/pagosya-complete-store/VERIFICATION.md` and `verification.json`; its zero-credit entry describes that verification pass, not the original generation cost. These are temporary local artifacts. Visual quality remains subject to human review. No deployment, real payment, or real-money checkout was performed in this verification.

## Source of truth

- `apps/api/src/stores/source-setup.ts`, `source-chat.service.ts`: onboarding and brief persistence.
- `apps/api/src/stores/source-generation.service.ts`, `source-projects.service.ts`: prompts, asset preparation, estimates, supplied files, and transactional save.
- `apps/api/src/stores/source-kit/commerce.js`, `product.html`, `checkout.html`, `commerce-pages.css`: customer navigation, product details, cart, checkout, and accessibility.
- `apps/merchant-studio/src/source-images.ts`, `source-studio.ts`, `main.ts`: prepared references, builder interaction, and lazy entry points.

## Optional forms, parity, and product creation

New stores default to no contact form. The merchant can opt in through Studio’s **Publicación y pruebas** menu or an explicit chat command such as **Activa el formulario de contacto**. Disabling it hides the form and rejects new contact submissions. Enabling it adds a section hook to legacy homepages that lack one. Form defaults use a CSS layer so authored styles win. Published and editor endpoints apply the same current commerce runtime and current public catalog data without altering stored revision history.

YAPI can create up to six simple products in a generation, e.g. **Crea el producto Café frío por Bs 35**. Product output is distinct from authored source, validated against the existing product DTO, restricted to attached owned images, and requires an exact price/currency quote from the current request. Prices cannot be estimated and existing products are not overwritten. Product inserts, source revision, and usage settlement share one transaction; failed or stale saves leave no products behind. Created items immediately enter the actual catalog, including published stores, and can be edited in Productos. Source edits still require explicit publication. Restoring a design revision does not remove catalog records.

Legacy checkout routing is recovered from an unambiguous authored HTML page carrying `data-pagosya-cart` plus `data-checkout-review`, or `data-pagosya-checkout-page`. This prevents homepage and product cart buttons from opening the generic order overlay when a designed checkout already exists. Explicit valid routes survive later generations; custom product pages with their own query conventions are not guessed. The same route recovery runs for owner preview and published pages.
