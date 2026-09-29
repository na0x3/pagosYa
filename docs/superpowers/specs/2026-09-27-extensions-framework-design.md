# Extensions framework — design

Date: 2026-09-27 · Sub-project 0 of the "specialized ecommerce" program · Status: awaiting owner review

## 1. Why

pagosYa should offer the integrations a Bolivian merchant actually uses (analytics, ad pixels, search-engine
verification, product catalogs, and next WhatsApp, server-side conversions, FedEx and other countries' payment
providers) without building each one by hand. Today the Studio "Integraciones" page is a fixed list of eight
services (`apps/merchant-studio/src/integration-catalog.ts`); four of them write an ID into a `Store` column
(`analyticsGa4Id`, `analyticsGtmId`, `analyticsMetaPixelId`, `analyticsTiktokPixelId`) and the rest are links.

Success: adding an extension means writing one module under `apps/api/src/extensions/catalog/<id>/`. Its
settings form, secret storage, storefront loading, catalog feed and event delivery come from the framework.

## 2. Decisions taken with the owner

| Question | Decision |
|---|---|
| Who builds extensions | **Only pagosYa.** Extensions live in this repository. No third-party code runs inside the payment platform. Outside developers keep using the public API and merchant webhooks. |
| Paid extensions | **Every extension carries a tier (`free` \| `pro`) now; charging comes with the billing sub-project.** Until then a Pro extension installs for free and shows "Pro · gratis por ahora". |
| Architecture | **Code modules plus their own event queue** (not the merchant webhook queue, not synchronous calls). |
| FedEx | Its own sub-project right after this one ("Ventas internacionales con FedEx"), because it needs international addresses, customs data and duties. This framework only adds the optional quote step it will need. |

## 3. Non-goals

- Third-party extensions, OAuth app installs, an app store.
- Billing or enforcing Pro.
- WhatsApp, Meta/TikTok server-side conversions, FedEx, per-merchant payment providers (later sub-projects;
  this one gives them the capabilities they need).
- A `product.changed` event. Products are written in 24 places; feeds are generated from live data on request
  instead (§7.3), so no event can be missed.

## 4. The extension module

```ts
// apps/api/src/extensions/extension.ts
export type ExtensionField = {
  key: string; label: string; help?: string; where?: string;   // Spanish copy shown in the form
  type: 'text' | 'select' | 'toggle';
  pattern?: RegExp; normalize?: (value: string) => string;       // e.g. upper-case pixel IDs
  options?: Array<{ value: string; label: string }>; required?: boolean; placeholder?: string;
};
export type ExtensionSecret = { key: string; label: string; help?: string; pattern?: RegExp };

export interface ExtensionManifest {
  id: string;                      // stable, kebab-case: 'meta-pixel'
  name: string; category: ExtensionCategory; tier: 'free' | 'pro';
  logo: string;                    // file in merchant-studio public/integrations/
  summary: string; description: string; docsUrl?: string;
  settings: ExtensionField[];
  secrets?: ExtensionSecret[];
  storefrontScript?(settings: Settings): ConsentScript | null;     // §7.1, loads only after consent
  siteVerification?(settings: Settings): VerificationTag[];        // §7.2, <meta> tags, no consent needed
  productFeed?: FeedFormat;                                        // §7.3
  shippingCarrier?: CarrierAdapter;                                // §7.4
  onEvent?(event: StoreEventRecord, context: ExtensionContext): Promise<void>; // §6
}
```

`ExtensionCategory` = `analytics | ads | seo | catalogs | shipping | messaging | payments`.

A registry (`extension-registry.ts`) lists every manifest and refuses duplicate ids at boot. A unit test checks
every manifest: unique id, a logo file exists, every `pattern` accepts its `placeholder`, Spanish copy present.

`ExtensionContext` gives `onEvent` the store, its decrypted settings and secrets, and a logger. It gives no
Prisma client: an extension reads what the event carries and calls its provider.

## 5. Data

```prisma
model StoreExtension {
  id            String    @id @default(cuid())
  storeId       String
  store         Store     @relation(fields: [storeId], references: [id], onDelete: Cascade)
  extensionId   String    // manifest id
  enabled       Boolean   @default(true)
  settings      Json      @default("{}")
  secrets       String?   // AES-256-GCM, base64url "keyId.iv.tag.ciphertext" of a JSON object; never returned
  installedById String?   // MerchantUser who installed it
  lastError     String?   // last delivery or validation failure, Spanish, shown on the card
  lastErrorAt   DateTime?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  @@unique([storeId, extensionId])
}

model StoreEvent {
  id         String   @id @default(cuid())
  storeId    String
  type       String   // order.paid | order.status_changed | refund.succeeded
  payload    Json
  createdAt  DateTime @default(now())
  deliveries ExtensionDelivery[]
  @@index([storeId, createdAt])
}

model ExtensionDelivery {
  id            String     @id @default(cuid())
  eventId       String
  event         StoreEvent @relation(fields: [eventId], references: [id], onDelete: Cascade)
  storeId       String
  extensionId   String
  status        String     @default("PENDING") // PENDING | RUNNING | DONE | FAILED
  attempts      Int        @default(0)
  nextAttemptAt DateTime   @default(now())
  leaseToken    String?
  leaseUntil    DateTime?
  lastError     String?
  doneAt        DateTime?
  @@unique([eventId, extensionId])
  @@index([status, nextAttemptAt])
}
```

Secrets: a new `EXTENSIONS_ENCRYPTION_KEY` (required in production by `requireSecret`, with a development
default like `OPERATIONS_ENCRYPTION_KEY`). A small `SecretBox` (`extensions/secret-box.ts`) encrypts and
decrypts, with the key id in the envelope so the key can be rotated later. Uninstalling deletes the row,
secrets included.

The migration is hand-written SQL in `apps/api/prisma/migrations/20260928120000_store_extensions/`. It creates
the three tables and copies the four existing analytics columns into `StoreExtension` rows
(`google-analytics`, `google-tag-manager`, `meta-pixel`, `tiktok-pixel`), only where the column is set. The
`Store` columns stay, no longer read, and are dropped in a later migration. Applying it is the owner's call:
nothing in this work runs `migrate dev`, `reset` or `diff` against the development database.

## 6. Events

**Emitting.** `StoreEventsService.emit(tx, storeId, type, payload)` runs inside the transaction of the change,
so a crash after commit never loses an event (the same guarantee the merchant webhook outbox gives). It writes
the `StoreEvent` and one `ExtensionDelivery` per enabled installation whose manifest has `onEvent`. If there is
none, it writes nothing.

| Event | Emitted in | Payload |
|---|---|---|
| `order.paid` | `payment-intents.service.ts`, where the store order becomes `PAID` | order id, number, amount, currency, lines (name, variant, qty, unit price), buyer name/email/phone as given at checkout, fulfillment method, delivery address |
| `order.status_changed` | `shipments.service.ts` (`updateMany` on status) and `consumer.service.ts` (merchant moves the order) | order id, from, to, tracking number and carrier when known |
| `refund.succeeded` | `refunds.service.ts`, beside its existing webhook | order id, refund id, amount |

**Delivering.** `ExtensionDeliveryWorker` (`@Interval(2000)`, one batch at a time per process) claims up to 20
due deliveries with a lease (`leaseToken`, 2 minutes), the pattern `store-import` uses. For each it calls the
extension's `onEvent` with the event id, so a handler can make its provider call idempotent.
- Success → `DONE`.
- Failure → retry after 1 min, 5 min, 30 min, 2 h, 12 h. After the 6th attempt → `FAILED`, and the error is
  written to `StoreExtension.lastError` so the card says what went wrong.
- A disabled or uninstalled extension's pending deliveries are closed as `DONE` without calling it.
- An expired lease is claimable again; `attempts` counts it.

Events whose deliveries are all finished and that are older than 30 days are deleted by the same worker once a
day.

No initial extension uses events. The machinery is tested with a test-only extension, and WhatsApp
(sub-project 1) is its first real user.

## 7. Capabilities

### 7.1 Storefront scripts (with consent)

`analyticsHead()` in `apps/api/src/store-seo/store-analytics.ts` becomes `extensionsHead(store, installations)`.
It keeps the one gate that waits for `PAGOSYA_PRIVACY.analyticsAllowed(slug)` and the `pagosya:privacy-change`
event. Each enabled extension's `storefrontScript` returns `{ id, loader }`, where `loader` is first-party JS
that receives only its already-validated settings (the gate embeds them with the existing `embed()`). A value
that fails its field pattern means "not configured", never escaped-and-injected.

The gate also defines `window.PAGOSYA_TRACK(name, data)`. Loaders register handlers with
`PAGOSYA_TRACK.on('purchase', fn)`. `reportPurchase()` in `apps/checkout/src/checkout/payment-result.ts` calls
`PAGOSYA_TRACK('purchase', { orderId, value, currency })` instead of reaching for `gtag`, `fbq` and `ttq`
itself. New pixels then report purchases without checkout changes. The existing ones keep sending the same
events: `purchase` for GA4, `Purchase` for Meta, `CompletePayment` for TikTok.

A golden test: a store with the four current IDs loads the same provider tags with the same calls it gets today
(plus `PAGOSYA_TRACK`), before and after migration.

### 7.2 Site verification

`siteVerification` returns `<meta name="…" content="…">` pairs, rendered outside the consent gate beside the
SEO head. Values must match a strict pattern and are HTML-escaped.

### 7.3 Product feeds

`GET /v1/stores/public/:slug/feeds/:extensionId.xml`, served only when that extension is installed and
enabled; any other request gets 404. Built on request from active products, cached for 1 hour per store and
extension, public (it only shows what the storefront already shows).
- Format: RSS 2.0 with the `g:` namespace, read by both Google Merchant Center and Meta Commerce Manager.
- One item per product, or per variant with a shared `item_group_id` when the product has options.
- Fields: `id`, `title`, `description` (plain text, 5,000 characters max), `link` (the store's verified custom
  domain if it has one, else the pagosYa store URL), `image_link` plus up to 10 `additional_image_link`,
  `availability` (`in_stock` / `out_of_stock` from stock, where null stock means unlimited), `price`
  ("123.45 BOB" from centavos, integer math), `condition` new, `brand` (the store name),
  `identifier_exists` no.
- Products without a photo or a price are left out, and the extension card lists how many and why.
- The feed URL is shown on the extension card with the steps to paste it into Merchant Center or Commerce
  Manager.

### 7.4 Shipping carriers

`CarrierAdapter` (`apps/api/src/shipping/carriers/carrier.ts`) gains an optional
`quote(input, creds): Promise<Array<{ service: string; label: string; amount: number; currency: string; days?: { min: number; max: number } }>>`.
An extension with `shippingCarrier` registers its adapter with the existing `carrier-registry.ts`, and its
credentials come from its `StoreExtension` secrets rather than `StoreCarrierAccount`. Manual shipping stays a
built-in default, not a catalog entry. No carrier extension ships in this sub-project; FedEx is the first.

## 8. API

All under `MerchantAuthGuard`, scoped to a store the merchant owns:
- `GET /v1/stores/:storeId/extensions`: every manifest merged with this store's installation. It shows
  settings, a `configured: true` flag per secret (never the value), `lastError`, and the feed URL for feed
  extensions. Guides (§9) are included with `kind: 'guide'`.
- `PUT /v1/stores/:storeId/extensions/:extensionId`: install or update. Every field is validated against the
  manifest; an empty secret keeps the stored one. Unknown keys are refused.
- `PATCH /v1/stores/:storeId/extensions/:extensionId` `{ enabled }`: pause or resume.
- `DELETE /v1/stores/:storeId/extensions/:extensionId`: uninstall, which deletes settings and secrets.

The old analytics fields in store settings stop being writable; the Studio page moves to these endpoints.

## 9. Studio page

`apps/merchant-studio/src/source-business-workspace.ts`, `kind === 'integrations'`:
- Two sections, **Extensiones** (installable) and **Guías** (links to external tools, e.g. Meta Business Suite,
  Instagram Ads, the WhatsApp Business app), clearly apart. The existing search, category filter and
  "Configuradas" switch stay.
- Each extension's form is generated from its manifest fields: text with placeholder and pattern hint, select,
  toggle. Secrets show "Configurado ✓" and a "Reemplazar" action, never the value.
- Badges: "Gratis", "Pro · gratis por ahora", "Configurada", and "Con error" with the Spanish error.
- Feed extensions show the feed URL with a copy button and the steps for the platform.
- pagosYa's own features that already appear there (contact form, inventory connections) keep working
  unchanged.
- After changing Studio, rebuild it: the dashboard serves the pre-built copy in
  `apps/merchant-dashboard/public/studio`.

## 10. Initial catalog (13)

| id | Name | Category | Tier | Capability | Setting (pattern) |
|---|---|---|---|---|---|
| `google-analytics` | Google Analytics 4 | analytics | free | script + purchase | Measurement ID `G-…` (existing pattern) |
| `google-tag-manager` | Google Tag Manager | analytics | free | script | Container `GTM-…` (existing) |
| `microsoft-clarity` | Microsoft Clarity | analytics | free | script | Project ID `^[a-z0-9]{6,20}$` |
| `hotjar` | Hotjar | analytics | free | script | Site ID `^[0-9]{5,12}$` |
| `meta-pixel` | Meta Pixel | ads | free | script + purchase | Pixel ID `^[0-9]{8,20}$` (existing) |
| `tiktok-pixel` | TikTok Pixel | ads | free | script + purchase | Pixel ID (existing) |
| `pinterest-tag` | Pinterest Tag | ads | free | script + purchase (`checkout`) | Tag ID `^[0-9]{10,20}$` |
| `google-ads` | Google Ads | ads | free | script + purchase conversion | `AW-[0-9]{6,15}`, optional purchase label `^[A-Za-z0-9_-]{6,40}$` |
| `google-search-console` | Google Search Console | seo | free | verification | `google-site-verification` token `^[A-Za-z0-9_-]{20,100}$` |
| `bing-webmaster` | Bing Webmaster Tools | seo | free | verification | `msvalidate.01` `^[A-F0-9]{32}$` |
| `pinterest-verification` | Pinterest (verificación) | seo | free | verification | `p:domain_verify` `^[a-f0-9]{32}$` |
| `google-shopping` | Google Shopping | catalogs | pro | feed | none (toggle) |
| `meta-catalog` | Facebook e Instagram Shop | catalogs | pro | feed | none (toggle) |

## 11. Errors and edge cases

- An invalid setting is refused on save with a Spanish message naming the field; it is never stored.
- A stored value that no longer matches its pattern (pattern tightened later) is treated as not configured, and
  the card says so.
- A missing `EXTENSIONS_ENCRYPTION_KEY` in production stops boot (`requireSecret`). Undecryptable secrets
  (rotated key) mark the extension "Con error: vuelve a pegar tu clave" without breaking the store.
- Feeds for a paused, archived or unpublished store return 404.
- An extension removed from the registry while installed: its rows are ignored and listed nowhere.

## 12. Tests

- Registry and manifest unit tests (§4); `SecretBox` round-trip, tampering and wrong key.
- `extensionsHead`: golden test for the four migrated IDs; consent gate still closed without `PAGOSYA_PRIVACY`;
  invalid values dropped; `PAGOSYA_TRACK('purchase')` reaches every registered handler once per order.
- Verification tags escaped and pattern-checked.
- Feeds: XML against Google's required fields; variants grouped; prices from centavos; custom domain links;
  404 when not installed.
- Events and worker against real Postgres (`integrationDatabase`, throwaway database): emitted in the same
  transaction (a rolled-back change leaves no event), delivery retries and back-off, lease expiry, disabled
  extension skipped, 30-day cleanup.
- The migration SQL runs in the integration harness and copies the four columns.
- API: ownership, validation, secrets never returned, empty secret keeps the stored one.
- Studio: form generated from a manifest, secret masking, Guías section, badges; `apps/checkout` purchase test
  through `PAGOSYA_TRACK`.

## 13. Owner actions

1. Set `EXTENSIONS_ENCRYPTION_KEY` (32+ random characters) in every environment.
2. Apply the migration when ready; the new code reads the new tables, so deploy it only after the migration.
3. For the catalogs, each merchant pastes their feed URL into Google Merchant Center or Meta Commerce Manager
   (the card explains how).
