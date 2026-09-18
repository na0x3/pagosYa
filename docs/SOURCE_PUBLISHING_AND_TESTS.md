# Publishing custom designs and comparing sales

The source editor now distinguishes **Borrador guardado**, **Publicado · revisión N**, and **Prueba activa · A / B**. Saving, generating, restoring, editing files, changing motion, and downloading a ZIP never publish a design. **Publicar este diseño / Publicar este borrador** changes the canonical `/s/:slug` store to that selected revision. Before the first source publication, the previous hosted storefront continues to serve customers. Store activation and real-payment activation are separate; the editor explains disabled stores and test payments.

## Merchant flow

1. Generate and review a design. Automatic desktop/mobile checks must finish without errors before the editor enables publishing.
2. Publish it. The public link shows the chosen design inside an isolated storefront frame; the trusted parent handles catalog images, inquiries and payments.
3. Open **Comparar dos diseños**, then **Crear alternativa con YAPI**. Generation uses the published revision as its design base, preserves prior drafts in history, and uses the selected model/credit cap. It does not publish the result.
4. Review the alternative or choose a different saved revision. **Probar este borrador contra el publicado** starts a 50/50 test. A and B are immutable source revisions sharing live catalog, inventory and payments.
5. Inspect the report. **Detener y conservar A** ends traffic splitting. **Aplicar ganador** becomes available only with sufficient evidence and publishes the selected winner. No automatic promotion occurs.

Only one test can run per store. Publishing, starting, stopping and applying use a shared optimistic publication version and a database transaction. A stale tab gets a conflict and must refresh. Edits may continue during a test but do not change either tested revision.

## Attribution and interpretation

The public source endpoint assigns an opaque visitor UUID to A or B using server randomness and a unique experiment/visitor constraint. Concurrent requests recover the existing assignment. Local storage keeps the browser identity; unavailable storage yields an untracked control view. Editor previews and the public-link owner view omit visitor assignment. Direct product-only entry is outside the storefront experiment; a visitor who proceeds from an assigned storefront to a product with options retains checkout attribution.

The server issues an unpredictable visit token. Checkout attaches only a token validated against the same store and a 30-day age limit. Purchases are derived from actual `StoreOrder` and `PaymentIntent` records, never a client-reported success event. Only live, successful payments count. Successful refunds reduce net revenue; fully refunded orders no longer count as purchases. Multiple orders from the same assigned visitor count as one buyer. Currency totals stay separate. Anonymous browser counts are not unique people and do not provide bot detection.

The recommendation requires seven days, at least 200 visitors and 20 buyers per arm, and non-overlapping 95% Wilson intervals for buyer conversion. This is a conservative decision aid, not a guarantee of increased sales or an always-valid sequential statistical test. Repeated inspection, traffic quality and delayed payments require merchant judgment. Results continue reflecting delayed payments/refunds; an already applied decision is not automatically reversed. Reports currently cap the order scan at 10,000; exceeding the cap is stated and disables winner recommendations.

## Runtime and deployment

Migration: `20260907030000_source_publishing_experiments`. API, checkout and embedded Studio must ship together. No new frontend package was added. The public renderer loads on demand and loads only the assigned revision. Source JavaScript remains inside an opaque sandbox with network access blocked; the parent accepts only store-scoped catalog, inquiry and checkout operations. Payment credentials are never sent to generated code. This release uses an iframe storefront rather than server-rendered product SEO pages.

No existing merchant design is automatically published or enrolled in an experiment by the migration. The new controls make those changes explicitly.

## Publication switch

After first publication, the top **Publicado / Sin publicar** switch hides or restores the public store while preserving its pinned revision. Hiding also stops a running comparison; resuming shows the retained control design. A newer draft has its own **Publicar este borrador** action. Visibility writes use the same publication version lock, so stale tabs cannot overwrite each other. Private owner catalog and preview endpoints continue to work while hidden. The flag is separate from archiving the store or activating real payments. Migration `20260907050000_optional_contact_form` adds this flag and changes only the default for new contact-form preferences.
