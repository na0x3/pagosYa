# Credit, digital delivery, shipping destinations and article publishing

This extends the brand-memory, shipping and content work. It does not establish complete Amboras parity or activate third-party providers.

## Merchant workflow

Open **Saldos y archivos digitales** above the source editor composer.

- Issue a gift-card or store-credit code in BOB or USD. Amounts in the interface are decimal currency amounts; API amounts are integer minor units. Issuance creates a merchant liability without charging a recipient. Codes are bearer credentials. Copy and privately retain the code before closing the dialog. The issuance reference is idempotent; the API never lists code hashes or plaintext codes alongside balances.
- Pause/reactivate codes and return the credit-paid part of an order using its order ID. Payment-rail refunds remain separate. Retrying the same refund reference for the same order does not refund twice.
- Attach PDF, ZIP, EPUB, MP3 or MP4 files (up to 50 MB each) to an existing product. Uploading changes its fulfillment type to digital. Pausing files affects future carts; paid orders retain their original file snapshots. Adding a later file does not grant it to earlier orders. Archive digital products instead of hard-deleting them.
- Manage article redirects within this store's article URL namespace. External URLs, redirect loops and chains over 20 hops are rejected. Article writing remains under **Contenido y ofertas**.

In **Envíos y retiro**, rates can now restrict countries and postal prefixes. Use two-letter country codes and comma-separated postal prefixes. Empty lists allow every destination. Postal matching ignores spaces/hyphens and letter case. The quote and final checkout both enforce these rules; the selected destination is recorded in payment metadata. These rules filter the buyer's supplied destination; they do not geocode or verify a street address and do not obtain live carrier prices.

## Payment and delivery behavior

Credit is reserved under a database row lock. Quotes do not reserve credit or create orders. Checkout rechecks the balance and stores the gross order total separately from the amount due on the payment rail. Full credit coverage marks the order paid within the transaction and does not create a cash-capture transaction or bank ledger entry. Partial coverage sends only the remainder to the rail.

Successful rail payments commit the reservation. Cancellation or a failed rail attempt releases it. A retry must reacquire the same amount before contacting the rail. Every minute, a worker cancels credit checkouts created over 30 minutes ago that have not begun payment. Processing and pending-QR payments retain reservations until their payment lifecycle resolves. The worker compares UTC timestamps explicitly, independent of the database server timezone.

Digital-only carts skip physical delivery and branch selection. Mixed carts keep delivery for physical products. A signed order-tracking link grants access only after successful payment. Each download link lasts 15 minutes; the API checks the signature, expiration, paid-order state, original asset snapshot and full-refund status on every download. Full combined cash/credit refunds revoke access. Partial refunds currently retain order-level downloads; per-item revocation is not implemented. Buyers can renew links on the receipt or tracking page. There is no automatic download-resend email campaign.

## Storage configuration

Local development stores private bytes under `UPLOADS_DIR/private/` with mode 0600. The public upload controller does not serve this path or these keys.

Production digital uploads require `PRIVATE_DOWNLOAD_BUCKET`, separate from `OBJECT_STORAGE_BUCKET`, with public access disabled by its storage policy. It uses the existing object-storage endpoint and credentials. Configure access policies and durability on the storage provider; local tests do not verify a production bucket policy. The API streams files after authorization instead of returning a storage URL.

`ORDER_TRACKING_SECRET` signs download tokens and deterministically derives idempotent credit codes. Rotating it invalidates existing tracking/download signatures and prevents recovering previously derived gift codes through an issuance replay. Plan key rotation before operating issued balances in production; multi-key rotation is not implemented.

## Published articles

Public routes on the API:

- `GET /v1/stores/public/:slug/pages` — paginated article archive, 50 per page.
- `GET /v1/stores/public/:slug/pages/:locale/:articleSlug` — server-rendered article or stored 301 redirect.
- `GET /v1/stores/public/:slug/rss.xml` — latest 100 published articles.
- `GET /v1/stores/public/:slug/sitemap.xml` — archive plus up to 49,000 published article URLs.

Pages include escaped content, canonical and Open Graph metadata, BlogPosting structured data and language alternates for translations sharing a slug. Confirmed brand background/foreground and uploaded fonts are reused. Draft/future articles and paused/archived stores are excluded. Set `PUBLIC_API_URL` to the public API URL so canonical/feed URLs are correct. These routes currently live on the API host; no custom-domain edge routing, product sitemap, Atom feed, or store-root robots configuration is implied. The hosted iframe allows article navigation only to the same store's API article namespace.

## Deployment and verification

Additive migrations `20260907150000_commerce_parity` and `20260907160000_shipping_destinations` were applied to the local development database on 2026-09-07. Apply them to other environments before starting this API version. Do not reset merchant data. Generate Prisma and build the API, checkout and merchant studio.

Coverage includes concurrent balance use, issuance/refund replay, failed-payment retry, cancellation/abandonment, cash-versus-credit separation, private download authorization, signature expiry/tampering, file-version snapshots, full-refund revocation, article escaping/scheduling, redirect isolation/cycles, country/postal rejection and accepted destination snapshots. Browser coverage exercises the merchant controls, failed-save preservation, exported digital checkout, standard credit selection and download-link renewal, plus existing shipping/brand/content/hosted checkout flows.

Provider payments in integration tests use the repository's mock rail. Tests do not establish live carrier/payment availability, production file policy, compliance, API savings or brand-recognition quality.
