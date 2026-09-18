# Store marketing workspace — September 14, 2026

The dashboard has three dedicated, store-scoped destinations: **Correos y marketing**, **Integraciones**, and **Pruebas A/B**. They use the dashboard's Pagosnet palette, responsive layouts and inherited light/dark preference. The source editor links to these destinations. Existing promotion-code forms and endpoints remain intact under Marketing → Códigos promocionales; old `#dashboard-discounts` links open that tab.

Marketing contains Plantillas, Flujos, Equipo, Dominio, Registros, Comeback, Campañas, Clientes and Códigos promocionales. Comeback, campaigns and customer rewards reuse the existing retention interface embedded in the page. Template editing includes a local example preview and preserves drafts after failed saves. On a revision conflict, the latest revision is loaded while keeping the merchant's draft, and the merchant must review and submit again. Store switches and marketing-tab changes check unfinished work.

## Email behavior

- Authenticated `/v1/stores/:storeId/email-workspace` routes enforce store ownership. Settings live in `StoreRetention.settings.emailWorkspace`; updates use the existing optimistic revision. Legacy Comeback saves preserve this JSON. No database migration is required for these additions.
- Paid-order confirmations, refunds, shipped/delivered/canceled orders, failed subscription charges, and gift-card issuance enqueue into `StoreEmailDelivery` in the same transaction as their event. Keys include store, event and recipient to prevent duplicate sends. Subscription charge notices distinguish separate payment attempts on the same invoice.
- Order confirmations retain the ordered variant, paid total and private tracking link. A queued custom confirmation replaces the default receipt. Once queued, a paid receipt remains due if its template is subsequently disabled.
- Gift-card issuance accepts an optional recipient email/name. Requested delivery requires the gift-card template and email provider to be enabled; failures abort issuance. The code is appended to the queued message and is excluded from the email log API response.
- Welcome, abandoned-cart and review messages reuse existing consent, scheduling, paid-cart exclusion and delivery eligibility rules. Recovery/review links remain in the outgoing message. Campaign sending remains an explicit action in the existing draft-review interface.
- Staff recipients opt into new-order, refund and weekly-summary messages. A scheduler queues weekly paid-order counts on Mondays after 08:00 in the store's time zone, with per-week deduplication. Adding a recipient does not grant dashboard access.
- Sending domains use the existing server-side Resend key and the provider's create/verify/get APIs. PostgreSQL advisory locks serialize store/domain claims. A database conflict after provisioning triggers provider-domain cleanup. Only provider-verified domains become custom senders. DNS records are shown for the owner to configure.
- Logs paginate by store and report queue/failure states. “Aceptado por el proveedor” describes a successful provider response; it does not claim confirmed inbox delivery.

**Remaining availability constraint:** the subscription-delivery-skipped template can be prepared but cannot be enabled. The application has no subscription delivery schedule or skip event. Other configured emails still require the server's email provider; custom senders require verified DNS. No customer messages, campaigns or domain registrations were triggered while implementing or testing this change.

## Integrations and A/B tests

The integration gallery exposes existing Comeback, email, contact, shipping, reviews, gift-card, digital-file, brand and article/redirection tools. Search/category/configured filters operate on actual capabilities. Inventory connections use the existing API and distinguish a newly created connection from one that has received synchronization data. The creation secret is shown once. Shopify/WooCommerce options describe API connections, not a fabricated OAuth installation.

The A/B page reuses SourcePublishingService: a published design A and saved alternative B share one catalog, inventory and checkout. Both have read-only design thumbnails. YAPI can create a draft alternative with a model and credit limit. Starting a live test requires storefront checks and existing backend compatibility/concurrency checks. Results show measured visitors, buyers, conversion and revenue. The merchant can apply a winner only after the existing evidence policy permits it, or stop while retaining A. The workspace does not generate multiple independent inventories or automatically publish a winner.

## Collaboration and validation

The implementation was completed by Codex with three read-only reviews from the locally installed Claude CLI. Claude reviewed reuse of the existing outbox/A/B services, domain claim concurrency, event bindings and draft recovery; it did not edit files.

Validation: 52 API tests and 15 Studio DOM tests passed. API/Studio TypeScript checks, embedded dashboard build, dashboard inline-script syntax, and whitespace checks passed. The new API route was also confirmed to reject unauthenticated requests locally. Live visual checks were not completed because the Chrome automation connection timed out. Provider calls are mocked in tests; real DNS verification, outbound email delivery and live sales experiments were not exercised.
