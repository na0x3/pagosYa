# Domain purchases inside the merchant dashboard

Store settings → “Publica con tu propio dominio” now includes a domain shop. A merchant searches a name, reviews the first-year and estimated renewal prices in BOB, supplies the registrant's contact information, accepts the purchase, and opens the existing QR checkout. The selected store retains the purchase and connection status after reloads. Draft contact information stays in memory separately for each store.

The first version supports ordinary ASCII registrations of `.com`, `.net`, `.org`, `.store`, and `.shop`, for one year. Premium, aftermarket, IDN, and country-specific registrations are excluded. Existing externally purchased domains still use the manual connection flow.

## Providers and activation

Registration uses the [Name.com Core API](https://docs.name.com/guides/quickstart), including a persistent idempotency key, explicit purchase price, merchant registrant contacts, domain details, and DNS records. HTTPS uses [Cloudflare for SaaS custom hostnames](https://developers.cloudflare.com/api/resources/custom_hostnames/methods/create/). The registrar's ANAME record routes the apex and a CNAME routes `www`; both hostnames map to the same store. The worker writes ownership and certificate-validation TXT records. A managed domain becomes public only when both Cloudflare hostnames and both certificates report active. Expired purchases do not resolve through the public domain endpoint.

Before enabling live purchases:

1. Create and fund a Name.com reseller account, enable Core API access, and configure registrant verification/renewal communications. Use Name.com's default DNS nameservers for newly registered domains. The dashboard warns the owner to complete emailed contact verification; it does not verify someone else's email on their behalf.
2. Configure a Cloudflare for SaaS zone, its fallback origin, and its CNAME target to serve the checkout storefront while preserving the merchant Host header. The origin must handle both the domain root and the existing storefront product/category paths. Use an API token scoped to this zone with custom-hostname/SSL permissions. Verify apex ANAME routing and HTTPS against this deployment before enabling purchases.
3. Set `NAMECOM_USERNAME`, `NAMECOM_API_TOKEN`, `DOMAIN_CLOUDFLARE_API_TOKEN`, `DOMAIN_CLOUDFLARE_ZONE_ID`, and `CUSTOM_DOMAIN_CNAME_TARGET` on the API server.
4. Set `DOMAIN_PLATFORM_MERCHANT_ID` to the platform's active merchant account. This account receives domain payments; the buying store does not receive its own purchase money. Configure the live Baneco QR rail.
5. Set the operator's pricing policy using `DOMAIN_BOB_PER_USD` and `DOMAIN_MARKUP_PERCENT`. There is no assumed exchange rate. The platform sells at the quoted BOB amount and must account for its own registrar fees/taxes within its pricing policy.
6. After provider verification, set `DOMAIN_REGISTRAR_SANDBOX=false` and `DOMAIN_COMMERCE_ENABLED=true`.

Without this configuration, merchants see that purchasing is unavailable and can still connect an existing domain. Credentials stay on the server. No registrar account, provider subscription, real domain registration, or production deployment was created during implementation.

## Payments, recovery, and renewal

Quotes expire after 15 minutes. Checkout freezes the accepted quote/contact data and reserves the root plus `www` atomically with the platform payment. Repeating checkout returns the same payment. Hostname uniqueness and a per-store PostgreSQL lock prevent competing claims and overfilling the three-hostname limit.

The 30-second worker uses persisted leases and processes up to five due orders per pass. Unpaid orders never register. A live registration requires the exact quoted payment, platform recipient, live mode, and Baneco rail. Sandbox purchases accept only the mock QR rail and use Name.com's sandbox; Cloudflare and live DNS activation are skipped. Sandbox mode is unavailable if the live QR rail is enabled, preventing accidental real payment for a test registration.

Before registration, availability and price are checked again. A changed price, unavailable domain, or inconsistent payment creates a merchant support case and marks the purchase for review. Registration retries use the original order UUID and payload. An uncertain registration older than 24 hours requires operator reconciliation instead of another automatic purchase. DNS retries inspect existing records before writing. Routine connection attempts resume after process restarts; already registered domains are not purchased again.

Refund reservation and registration initiation lock the same payment row. Pending/successful refunds prevent registration; once registration starts, generic refunds require operator reconciliation. A support case does not itself refund the buyer. The current Baneco integration has no automatic bank refund endpoint, so support must reconcile the registrar order and arrange any required bank refund. Do not clear registration timestamps or retry with a new registrar key without verifying the original order.

Registration auto-renew is explicitly **off**. The dashboard shows the expiry date and estimated annual renewal cost. Renewal and transfer are currently handled through support; automatic renewal billing is not implemented. Purchased domains cannot be removed using the ordinary “disconnect” button, and stores with domain purchase records must be archived instead of deleted to preserve the purchase history.

## Local validation

Migration `20260914190000_domain_orders` was applied to the local development database and exercised from scratch in disposable PostgreSQL. API tests cover validation, payment mode/recipient/amount, idempotent checkout, registrar timeout recovery, HTTPS gating, refund blocking, cancellation, stale pricing, and tenant boundaries. Browser tests cover price/contact review, save failure and retry, payment links, separate drafts on store switches, and a 390px layout. Provider calls in tests are mocked; a funded sandbox/live provider smoke test remains required before launch.

Relevant API routes: `GET /v1/stores/:storeId/domain-shop`, `POST .../search`, `POST .../quotes`, `POST .../checkout`, and `POST .../orders/:orderId/cancel`.
