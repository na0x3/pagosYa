# Domain shop readiness

Audit of the in-product domain purchase feature described in `docs/domain-shop.md`. This file records what the
code actually does, verified against the source, and what remains before a merchant can buy a domain.

Summary: the API, the database schema, the registrar client, the Cloudflare client, the fulfilment worker and the
merchant-dashboard UI are all real and wired. Nothing has ever run against a funded registrar account. Every
provider credential is absent locally, so the feature reports itself unavailable in every environment in this
repository.

**Updated 2026-09-16.** Five items from §5(a) are now built: the Merchant Studio entry point (§5a.1), the
paid-but-stalled escalation (§5a.2), the abandoned-checkout reaper (§5a.3), the fail-closed CNAME target
(§5a.4) and the operator surface for `DomainOrder` (§5a.5). Everything in §5(b) is unchanged and still
owner-only. Sections below are marked where they no longer describe current code.

## 1. End-to-end reality, hop by hop

| Hop | State | Evidence |
| --- | --- | --- |
| Search a name | Real | `apps/api/src/stores/domains/domain-commerce.controller.ts:14` → `domain-commerce.service.ts:62-73` → `namecom.provider.ts:33-37`. Live `POST https://api.name.com/core/v1/domains:checkAvailability`, sandbox host swapped at `namecom.provider.ts:24`. |
| See a price | Real, operator-defined | `domain-commerce.config.ts:26-32`. `usd × DOMAIN_BOB_PER_USD × (1 + DOMAIN_MARKUP_PERCENT/100)`, rounded up to centavos. There is no exchange-rate feed and no registrar-fee/tax line; both are absorbed by the operator's markup. |
| Hold a quote | Real | `domain-commerce.service.ts:74-82`. Persists a `DomainOrder` in `QUOTED` with a 15-minute `quoteExpiresAt`. |
| Supply registrant contact | Real | Validated at `domain-commerce.dto.ts:10-20`; collected by `apps/merchant-dashboard/src/domain-shop.mjs:4-9` and rendered at `domain-shop.mjs:33`. Frozen onto the order at `domain-commerce.service.ts:104`. |
| Pay | Real, indirect | `domain-commerce.service.ts:83-111`. Reserves both hostnames and creates a `PaymentIntent` on the platform merchant (`:99`). The merchant pays in the checkout app through the `client_secret` link built at `:47-53`. QR-only is enforced at `apps/api/src/payment-intents/payment-intents.service.ts:302-304`, the rail is pinned at `:313-317`, and the checkout UI forces QR at `apps/checkout/src/main.ts:9328-9329` and `:9416`. |
| Register | Real code, never executed live | `domain-commerce.service.ts:167-193` → `namecom.provider.ts:38-44`. One year, `autorenewEnabled: false`, `locked: true`, `privacyEnabled: true`, `X-Idempotency-Key` = the order UUID. Availability and price are re-checked before purchase (`:169-173`). |
| Write DNS | Real code, never executed live | `domain-commerce.service.ts:131-149` → `namecom.provider.ts:46-53`. Apex `ANAME` and `www` `CNAME` to `CUSTOM_DOMAIN_CNAME_TARGET`, plus `_pagosya` ownership TXT and the Cloudflare DV validation TXT records. Reads before writing, so retries are safe and unrelated MX/TXT records survive. This only works if the registered domain uses Name.com's own nameservers; no code checks that. |
| Issue HTTPS | Real code, never executed live | `cloudflare-hosting.provider.ts:25-30` creates a Cloudflare for SaaS custom hostname with `ssl.method: 'txt'`, `type: 'dv'`. The order only reaches `ACTIVE` when both hostnames and both certificates report `active` (`domain-commerce.service.ts:202`). |
| Serve the storefront | Real, and shipped independently of this feature | `apps/api/src/stores/custom-domains.service.ts:239-266` (`resolve`), exposed at `apps/api/src/stores/stores-public.controller.ts:37-40`, consumed by `apps/checkout/src/main.ts:913-918` and server-rendered at `apps/checkout/storefront-seo.mjs:25-42`. Expired or sandbox purchases are refused at `custom-domains.service.ts:259`. TLS termination and `Host` preservation belong to the production edge, which does not exist in this repository. |

The fulfilment loop itself is real: `domain-commerce.service.ts:211-235` runs every 30 seconds, claims up to five
due orders with a 15-minute lease and an optimistic `updatedAt` check, and backs off to 60 seconds (one hour once
`ACTIVE`). `@Interval` works because `ScheduleModule.forRoot()` is registered in
`apps/api/src/webhooks/webhooks.module.ts:11`, which `apps/api/src/app.module.ts:64` imports.

Test coverage is genuine but entirely provider-mocked. `apps/api/test/domain-commerce.e2e-spec.ts` (119 lines) runs
the real HTTP surface and a real PostgreSQL database with `NamecomProvider` and `CloudflareHostingProvider`
replaced (`:26-27`); `apps/api/src/stores/domains/domain-commerce.spec.ts` covers hostname validation, pricing,
payment matching and provider-retry behaviour; `apps/merchant-dashboard/tests/domain-shop.spec.mjs` drives the UI
against a stub API. No test touches a registrar.

## 2. The merchant-facing entry point

The UI exists, in the merchant dashboard only.

- Mount point: `apps/merchant-dashboard/index.html:4662` (`<section id="domainShop">`), inside the
  `customDomainStudio` section at `:4651`.
- Wiring: `apps/merchant-dashboard/index.html:16355-16359` imports `mountDomainShop`, passes the dashboard `api`
  helper, and follows store switches.
- Implementation: `apps/merchant-dashboard/src/domain-shop.mjs` (123 lines) — search, results, quote, registrant
  form, consent checkbox, checkout, order list, cancel, 15-second polling, per-store drafts.
- Served in production by `apps/merchant-dashboard/server.mjs:119`.

It is reachable in the standalone dashboard, but it is buried. The path is: dashboard → **Apariencia**
(`data-dashboard-page="appearance"`, `index.html:4563`) → leave the store preview, which auto-expands to fullscreen
on entering that view (`index.html:7193-7195`) → **Publica con tu propio dominio** → the **Mostrar** toggle, which
defaults to collapsed (`index.html:7304`, last argument `false`). Nothing in the dashboard navigation names domains.

**~~Merchant Studio has no entry point whatsoever.~~ Built on 2026-09-16** — see the note at the end of this section.

- No file under `apps/merchant-studio/src/` references `domain-shop`, `/domain-shop/search`, `/quotes` or
  `/checkout`. `apps/merchant-studio/src/api.ts` has no domain method.
- The Studio "Mi tienda" toolbar (`apps/merchant-studio/src/source-studio.ts:410-420`) has no domain button.
- The Studio tool grid (`apps/merchant-studio/src/source-business-workspace.ts:189-200`) has no domain entry.
- The only thing in Studio called `domain` is the **email sender** domain at
  `source-business-workspace.ts:131-135`, which configures DKIM/SPF records for outbound mail. It is unrelated and
  will be mistaken for this feature by anyone searching the codebase.

This is worse than the bug already found in `source-business-workspace.ts`, where a button routed to a grid that
did not contain the tool. Here there is no button, in embedded mode or standalone. A merchant who works in Studio —
the surface the product is moving toward — cannot buy a domain, and cannot see the purchase they made in the
dashboard. See §6 for a specification.

**Resolved.** `apps/merchant-studio/src/domain-shop.ts` implements the §6 specification, with five API methods on
`MerchantStudioApi` and both entry points wired: the `#source-domain` toolbar button in the "Configuración" section
of `source-studio.ts`, and the `id: 'domain'` catalog entry in `source-business-workspace.ts` (category `Diseño`,
grouped with the other storefront-address tool). Three tests in `source-business-workspace.test.ts` cover the
embedded route, the configured badge and a domain-shop outage; the badge test was confirmed to fail when the
catalog entry's `connected` expression is broken. The panel renders the unavailable state until credentials exist,
so this is live-safe with the feature off.

## 3. Activation gap: environment variables

All ten documented variables are read. `CUSTOM_DOMAIN_CNAME_TARGET` is the only one with a behaviour that does not
match the documentation.

| Variable | Read at | Effect if absent |
| --- | --- | --- |
| `DOMAIN_COMMERCE_ENABLED` | `apps/api/src/config/configuration.ts:213` | `enabled` false. `assertDomainCommerceReady` (`domain-commerce.config.ts:16`) throws 503; the UI shows "estará disponible pronto" (`domain-shop.mjs:55`) and hides the search form. The fulfilment loop also no-ops (`domain-commerce.service.ts:213`) — see risk A. |
| `DOMAIN_REGISTRAR_SANDBOX` | `configuration.ts:214` | Defaults to sandbox. Only the exact string `false` selects live mode. Sandbox uses `api.dev.name.com` (`namecom.provider.ts:24`), skips Cloudflare and DNS entirely (`domain-commerce.service.ts:195`), and requires the mock QR rail. |
| `NAMECOM_USERNAME` | `configuration.ts:215` | Blocks activation at `domain-commerce.config.ts:16`; the provider also refuses at `namecom.provider.ts:23`. |
| `NAMECOM_API_TOKEN` | `configuration.ts:216` | Same as above. |
| `DOMAIN_PLATFORM_MERCHANT_ID` | `configuration.ts:217` | Blocks activation. Even when set, checkout requires a matching `ACTIVE` `Merchant` row that is not the buyer (`domain-commerce.service.ts:86-87`), and payment matching requires it (`:28`). |
| `DOMAIN_BOB_PER_USD` | `configuration.ts:218` | `Number(undefined ?? 0)` → 0 → blocked by the `> 0` check at `domain-commerce.config.ts:17`. |
| `DOMAIN_MARKUP_PERCENT` | `configuration.ts:219` | Defaults to 0, which passes the `>= 0` check. **The platform sells at cost, silently.** Absence is not an error. |
| `DOMAIN_CLOUDFLARE_API_TOKEN` | `configuration.ts:220` | Required only in live mode (`domain-commerce.config.ts:20`). Absent in live mode → 503 on every call. |
| `DOMAIN_CLOUDFLARE_ZONE_ID` | `configuration.ts:221` | Same as above; also interpolated into every Cloudflare URL (`cloudflare-hosting.provider.ts:16`). |
| `CUSTOM_DOMAIN_CNAME_TARGET` | `configuration.ts` (both `domainCommerce.target` and `customDomains.target`) | **Fixed 2026-09-16.** `domainCommerce.target` no longer defaults, so the `!c.target` guard at `domain-commerce.config.ts:20` fires and live purchases are refused until it is set. `customDomains.target` keeps its `stores.pagosya.bo` default deliberately — that path serves the already-live manual connect flow. Covered by `configuration.spec.ts`. |

One requirement is missing from the documented list: **`BANECO_QR_ENABLED`**. `domain-commerce.config.ts:19-20`
requires the live Baneco rail to be enabled for live purchases and requires it to be *disabled* for sandbox
purchases, so the two modes cannot share an environment.

Local state (names checked, values never read):

- `/Users/saramia/pagosYa/.env` — none of `NAMECOM_*`, `DOMAIN_*` or `CUSTOM_DOMAIN_CNAME_TARGET` present.
- `/Users/saramia/pagosYa/apps/api/.env` — none present. `BANECO_QR_*` keys are present.
- `.env.example` documents all of them: `:132-143` for the domain block, `:42` for `CUSTOM_DOMAIN_CNAME_TARGET`.

Consequence: in this checkout, `domainCommerce.enabled` is false, so a merchant sees "La compra de dominios estará
disponible pronto" and can only use the manual connect flow. No domain can be bought today in any environment
reachable from this repository.

## 4. Money and risk

Verified as documented:

- **Payments go to the platform account.** `domain-commerce.service.ts:99` creates the intent on
  `c.platformMerchantId`; `:86-87` refuses if that merchant is missing, inactive, or is the buyer.
  `paidDomainOrder` (`:26-30`) will not accept a payment whose `merchantId` is anyone else. The buying store never
  receives the money.
- **Auto-renew is off.** `namecom.provider.ts:41` sends `autorenewEnabled: false`; the API always reports
  `autoRenew: false` (`domain-commerce.service.ts:51`).
- **Refunds after registration need manual reconciliation.** `apps/api/src/refunds/refunds.service.ts:37-41`
  rejects any refund on a domain payment once `registrationStartedAt` is set. Before that point, a reserved or
  succeeded refund blocks registration under the same `PaymentIntent` row lock
  (`domain-commerce.service.ts:174-181`), and the order is routed to support instead.
- **Purchased domains cannot be disconnected.** `custom-domains.service.ts:234-235` rejects `remove` for any
  domain with a `domainOrderId`; `:195` rejects manual `verify`; `:218` excludes managed domains from the manual
  reconciliation sweep. Stores with non-`QUOTED` domain orders cannot be deleted
  (`apps/api/src/stores/stores.service.ts:1328-1329`) and the schema uses `onDelete: Restrict`
  (`apps/api/prisma/schema.prisma:836`, `:846`, `:821`).

Risks found:

**A. ~~A paid order can stall forever with no support case.~~ Fixed 2026-09-16.** If `DOMAIN_COMMERCE_ENABLED` is
turned off, or any credential goes missing, after a merchant has paid: `reconcile` returns immediately at
`domain-commerce.service.ts:213`, or `advance` throws at `:151` and is swallowed by the catch at `:224`. The
escalation at `:226` explicitly skips orders whose status is `AWAITING_PAYMENT` — which is exactly the status a
paid-but-not-yet-registered order still carries, because the status only advances to `REGISTERING` at `:179`,
after the config check. Result: the merchant has paid, no domain is registered, no `SupportCase` is opened, and the
loop retries silently forever. The only visible signal is a `logger.warn` line.

*Fix:* `escalateStalledPayments` in `domain-commerce.service.ts` runs at the top of `reconcile`, **before** the
`enabled` gate, so it fires even when the feature is switched off and the fulfilment loop never runs. It escalates
any `AWAITING_PAYMENT` order whose `PaymentIntent` has been `SUCCEEDED` for more than an hour. The clock is on the
payment, not the order, because the fulfilment loop rewrites the order's `updatedAt` on every pass — an order-based
timer would never run out while the loop is running and failing. A healthy paid order leaves `AWAITING_PAYMENT`
within one 30-second pass, so the margin is wide. Covered by the e2e test "escalates a paid order that cannot be
fulfilled, even with the feature switched off", which asserts both that a freshly paid order is left alone and that
an hour-old one opens a `SupportCase`.

*Accepted consequence:* `REVIEW_REQUIRED` is not in `RUNNABLE`, so an escalated order stops retrying and needs an
operator even if the missing credential returns. That is deliberate for money that has already moved, but it means
a config slip lasting over an hour parks every paid order into support. §5a.5's operator tooling is what makes
those recoverable; it is now built (§4H), and an operator retry gets its own one-hour window through `retriedAt`
rather than being escalated again on the next pass.

**B. ~~An abandoned checkout locks a hostname indefinitely.~~ Fixed 2026-09-16.** `domain-commerce.service.ts:98` creates both
`CustomDomain` rows before any money arrives. `hostname` is globally unique (`schema.prisma:817`), so the name is
blocked for every other store, and the two rows consume the store's free slots (checkout requires at most one
existing domain, `:97`; the manual path caps at three, `custom-domains.service.ts:168-171`). The rows are released
only by the merchant's own cancel (`:113-121`) or by the `PaymentIntent` reaching `CANCELED`/`FAILED` (`:155-158`).
Nothing cancels an abandoned domain `PaymentIntent`: the only abandoned-intent sweeper is
`apps/api/src/commerce-platform/credit-expiry.service.ts:9-24`, which joins `StoreCreditReservation` and never sees
domain orders.

*Fix:* `releaseAbandonedCheckouts` in `domain-commerce.service.ts`, an hourly `@Interval` shaped like
`credit-expiry.service.ts`. After 24 hours it cancels the `PaymentIntent` and deletes both `CustomDomain` rows in
one transaction. It is **ungated** and releases the rows itself rather than leaving that to `advance`, because the
configuration `advance` needs may be the very reason an order is stuck. `cancelById` re-checks age and status under
a row lock, so a payment that succeeds between the query and the cancel is left alone; the reaper only releases
rows once the intent actually reports `CANCELED`. Covered by the e2e test "releases an abandoned checkout so the
hostname is free for another store", which also asserts that an in-flight checkout survives and that another store
can claim the name afterwards.

**C. Platform-side exposure is bounded but not zero.** Registration cannot start without a matching payment
(`domain-commerce.service.ts:160`), so the ordinary "platform pays, merchant doesn't" case cannot occur. The
remaining exposure is a registrar charge that commits while the local write fails. Recovery reuses the same
idempotency key and payload (`:188`), and after 24 hours the order stops retrying and becomes an operator task
(`:184-186`). This behaviour has never been exercised against a real registrar, where idempotency-key semantics and
error shapes are unverified.

**D. There is no operator tooling for a stuck domain order.** `needsReview` (`:123-130`) writes a `SupportCase` with
`category: 'OTHER'` and a free-text summary. Support cases surface in the ops console
(`apps/api/src/ops/support.controller.ts`), but there is no way from any UI to inspect a `DomainOrder`, retry it,
record that a registrar order was reconciled, or safely clear `registrationStartedAt`. Every recovery is a manual
database edit.

**E. No renewal path, and no warning before expiry.** Nothing in the codebase renews a domain or bills for renewal.
One year after registration, `custom-domains.service.ts:259` stops resolving the hostname and the merchant's
storefront goes dark on their own domain. There is no scheduled job that notices an approaching `expiresAt`, no
email, and no dashboard warning beyond the expiry date printed in the order card (`domain-shop.mjs:42`).

**F. Registrant email verification is displayed but not enforced.** `contactVerified` is read from the registrar
(`domain-commerce.service.ts:192`, `:207`) and shown as a nudge (`domain-shop.mjs:43`). ICANN suspends a domain
whose registrant email is never verified; nothing escalates, retries, or blocks on this.

**G. Abandoned `QUOTED` rows accumulate.** Every "Elegir" click writes a row (`:79`). They are excluded from the
listing (`:59`) and only deleted when the whole store is deleted (`stores.service.ts:1331`).

**H. ~~An escalated order was recoverable only through `psql`.~~ Fixed 2026-09-16.** `needsReview` opens a
`SupportCase`, but nothing let the person reading that case see the order, restart it, or close it. Operators had
to edit `DomainOrder` rows by hand — on the money path, with no audit trail.

*Fix:* `apps/api/src/ops/domain-orders.service.ts` and `domain-orders.controller.ts`, on `internal/domain_orders`
behind `OpsAuthGuard`, and a "Dominios" tab in the ops console (`apps/ops/index.html`). Four operations:

- `GET /internal/domain_orders` lists the in-flight queue with escalated orders first; `?query=` searches any
  non-`QUOTED` order by hostname or id. A `QUOTED` row is never in the queue — nobody paid for it.
- `GET /internal/domain_orders/:id` returns the order with its payment intent and refund transactions, both
  `CustomDomain` rows, the linked `SupportCase` and the recent audit entries. This is the read that replaces the
  psql joins. The case is found by the order id that `needsReview` writes into the summary; that string is the
  only link between the two rows.
- `POST /internal/domain_orders/:id/retry` returns the order to the fulfilment loop. The stage it resumes at is
  derived the way `advance` derives its own — `providerOrderId` present → `CONNECTING`, otherwise
  `AWAITING_PAYMENT` with `registrationStartedAt` cleared so the 24-hour conciliation guard re-arms. It also sets
  `retriedAt`, which `escalateStalledPayments` measures from: without it the payment is already hours old when the
  order returns to `AWAITING_PAYMENT`, so the next 30-second pass would escalate it again and the retry would
  never get a turn.
- `POST /internal/domain_orders/:id/reconcile` records that a person settled the order outside the system: status
  `CANCELED`, both `CustomDomain` rows deleted so the hostname is free, the linked case resolved with the
  operator's reason. **It moves no money** — refunds keep their own path, and the reason stays out of the
  merchant-facing `message`, which gets a fixed line instead.

Both actions require a reason of at least 8 characters, write an `AuditLogEntry` in the same transaction, and
refuse any order that is not `REVIEW_REQUIRED`. Covered by seven unit tests in `domain-orders.service.spec.ts` and
four e2e tests in `domain-commerce.e2e-spec.ts`, including "keeps a retried order out of the escalation sweep
until its own hour is up", which is the regression `retriedAt` exists to prevent.

*Still manual:* the reconcile action does not issue the refund. Whoever settles the order has to have done that
first, through the ordinary refund path.

## 5. What is genuinely missing

### (a) Buildable without the owner

1. ~~Merchant Studio entry point for the domain shop (specified in §6).~~ **Done 2026-09-16** — see §2.
2. ~~Fix risk A: escalate a paid order that cannot be fulfilled.~~ **Done 2026-09-16** — see §4A. Implemented as a
   time-since-payment sweep ahead of the `enabled` gate rather than by relaxing the `attempts >= 30` branch: that
   branch never runs at all when the feature is switched off, which is one of the two ways an order stalls.
3. ~~Fix risk B: expire abandoned domain checkouts.~~ **Done 2026-09-16** — see §4B.
4. ~~Make `CUSTOM_DOMAIN_CNAME_TARGET` a required value in live mode.~~ **Done 2026-09-16** — see §3.
5. ~~Operator surface for `DomainOrder`: list, inspect, mark reconciled, retry.~~ **Done 2026-09-16** — see §4H.
6. **Still open.** Expiry warning job and merchant notification, plus a documented support-driven renewal procedure.
7. **Still open.** Reap stale `QUOTED` rows. The new reaper releases abandoned *checkouts*; a `QUOTED` row that was
   never checked out still only disappears when its store is deleted.
8. **Still open, and now lower priority.** Raise the domain shop out of a collapsed section inside a
   fullscreen-preview view in the dashboard (`index.html:7193-7195`, `:7304`). Studio now has a first-class entry
   point, so the dashboard's burial is no longer the only path a merchant has.

### (b) Needs the owner's accounts, credentials or a business decision

1. Create and fund a Name.com reseller account; enable Core API access; obtain `NAMECOM_USERNAME` and
   `NAMECOM_API_TOKEN` for both sandbox and production. Confirm new registrations default to Name.com nameservers —
   `namecom.provider.ts:46-53` writes records through Name.com's DNS API and silently does nothing useful otherwise.
2. Set up the Cloudflare for SaaS zone, its fallback origin and its CNAME target; issue a zone-scoped API token
   with custom-hostname and SSL permissions. Supply `DOMAIN_CLOUDFLARE_API_TOKEN`, `DOMAIN_CLOUDFLARE_ZONE_ID` and
   the real `CUSTOM_DOMAIN_CNAME_TARGET`. The origin must serve `/`, `/productos`, `/p/:id` and `/c/:slug` while
   preserving the merchant `Host` (`apps/checkout/storefront-seo.mjs:25-42`).
3. Decide and create the platform merchant account that receives domain money, and set
   `DOMAIN_PLATFORM_MERCHANT_ID`. This account must be `ACTIVE` (`domain-commerce.service.ts:86`).
4. Set the pricing policy: `DOMAIN_BOB_PER_USD` and `DOMAIN_MARKUP_PERCENT`. The markup must cover registrar cost,
   ICANN fees, card/QR settlement cost, currency movement over a full year, and the renewal price drift the UI
   already warns about. `DOMAIN_MARKUP_PERCENT` absent means selling at cost with no error.
5. Confirm the live Baneco QR rail is enabled in the production API, since live purchases require it
   (`domain-commerce.config.ts:20`).
6. Decide the renewal and transfer policy, including what happens at expiry and who pays. The current answer is
   that the storefront stops resolving.
7. Decide the refund policy for a registration that has already committed at the registrar, given that Baneco has
   no automatic refund endpoint.
8. Legal and consumer-facing terms for reselling registrations under a Bolivian entity, and the registrant-data
   handling that `registrant` JSON in `DomainOrder` implies.

### (c) Needs a funded sandbox or a live smoke test

1. Name.com sandbox registration of a throwaway name: confirm the response shape assumed at
   `domain-commerce.service.ts:189` (`domain.domainName`, integer `order`, parseable `expireDate`), and confirm
   `X-Idempotency-Key` genuinely deduplicates a retried purchase.
2. One real, paid, low-cost live registration end to end: pricing match at `:170`, DNS write through
   `ensureRecord`, Cloudflare custom hostname creation, both DV certificates reaching `active`, and the domain
   serving the storefront over HTTPS.
3. Apex `ANAME` behaviour at Name.com against the real Cloudflare for SaaS target — the apex path is the part most
   likely to differ from the `www` path and is untested outside mocks.
4. A deliberate timeout during `register` on a funded account, to prove the idempotent recovery at `:188` does not
   double-charge.
5. The registrant verification email actually arriving and `contacts.registrant.isVerified` flipping true
   (`:192`).
6. Expiry behaviour: confirm `resolve` refuses an expired managed domain in production
   (`custom-domains.service.ts:259`) before a merchant discovers it.

## 6. Specification: domain shop in Merchant Studio

Modelled on `apps/merchant-studio/src/shipping-settings.ts`, the simplest existing panel.

**Entry points.** Add a button to the "Configuración" section of the Studio toolbar
(`apps/merchant-studio/src/source-studio.ts:415`), labelled "Tu propio dominio", next to "Envíos y retiro". Follow
the pattern at `source-studio.ts:542`: standalone opens the panel directly, embedded posts
`{type:'pagosya:workspace', view:'integrations'}` to the parent. Also add a matching entry to the tool catalog at
`source-business-workspace.ts:189-200`:

```
{ id: 'domain', name: 'Tu propio dominio', category: 'Configuración', icon: 'link',
  description: 'Compra un dominio o conecta el que ya tienes.',
  connected: <store has an ACTIVE CustomDomain>,
  open: () => openDomainShop(api, storeId) }
```

Both halves are required. Adding only the toolbar button reproduces the bug already found in
`source-business-workspace.ts`, where the embedded route landed on a grid that did not contain the tool. The
catalog `category` string must be one that already appears in the grid's category filter, since the filter is
derived from the catalog itself (`source-business-workspace.ts:202`).

**New file** `apps/merchant-studio/src/domain-shop.ts`, exporting
`openDomainShop(api: MerchantStudioApi, storeId: string, onConnected?: () => void)`:

- Create a `<dialog class="brand-dialog">`, append it, `showModal()`, remove on close, and block `cancel` while
  busy — `shipping-settings.ts:7-10` verbatim.
- Use the `run(task)` helper from `shipping-settings.ts:12`, including `preserveDialogForms(dialog)` from
  `./dialog-form-state`, which restores in-progress registrant fields after a failed checkout. The dashboard
  already treats that behaviour as required (`apps/merchant-dashboard/tests/domain-shop.spec.mjs:33-35`).
- Escape all interpolated values with `escapeHtml` from `./studio-ui`.

**API methods** on `MerchantStudioApi` (`apps/merchant-studio/src/api.ts`, alongside `shippingSettings` at `:181`),
all thin wrappers over `this.request`:

```
domainShop(storeId)                      GET  /stores/:id/domain-shop
searchDomains(storeId, query)            POST /stores/:id/domain-shop/search
quoteDomain(storeId, hostname)           POST /stores/:id/domain-shop/quotes
checkoutDomain(storeId, body)            POST /stores/:id/domain-shop/checkout
cancelDomainOrder(storeId, orderId)      POST /stores/:id/domain-shop/orders/:orderId/cancel
```

**Panel states**, in one scrolling dialog:

1. *Unavailable.* When `available` is false, show only the explanation and a link to the dashboard's manual connect
   flow. The API returns this whenever `assertDomainCommerceReady` fails, which is the current state everywhere.
2. *Search.* One text input and a submit button. Render each result as hostname, first-year price, estimated annual
   renewal, and an "Elegir" button disabled when `available` is false.
3. *Review.* On "Elegir", call `quoteDomain`, then render the nine registrant fields from
   `domain-shop.mjs:4-9` with the same `autocomplete`, `maxlength` and `pattern` attributes — `country` defaults to
   `BO` and is `[A-Z]{2}`, `phone` is `\+[1-9][0-9]{6,14}`. Include the explicit consent checkbox naming the price;
   the API rejects `accepted !== true` (`domain-commerce.service.ts:88`). State plainly that auto-renew is off and
   that renewal goes through support.
4. *Orders.* List orders with the status labels from `domain-shop.mjs:3`, the payment link, a cancel button while
   `checkoutUrl` is present, the expiry date, and the registrant-verification reminder when
   `expiresAt && !sandbox && !contactVerified`.

**Behaviour.** Poll `domainShop` every 15 seconds while the dialog is open and not busy, matching
`domain-shop.mjs:119`. Call `onConnected` when any order reaches `ACTIVE`. Show the sandbox badge when
`sandbox` is true. Prices are integer centavos; format with `Intl.NumberFormat('es-BO', {style:'currency'})`.

**Do not** reimplement the manual connect flow in Studio. Point at the dashboard for that until the manual path
moves too, so there is one place where a hostname is claimed.

## 7. Activation checklist

Owner-only steps are marked **[owner]**. Nothing below can be skipped for a live launch.

1. **[owner]** Create and fund the Name.com reseller account; enable Core API; record sandbox and production
   credentials; confirm new registrations use Name.com nameservers; configure registrant verification and renewal
   notices.
2. **[owner]** Create the Cloudflare for SaaS zone, set its fallback origin to the storefront edge, and verify the
   origin serves `/`, `/productos`, `/p/:id` and `/c/:slug` with the merchant `Host` preserved.
3. **[owner]** Issue a Cloudflare API token scoped to that zone with custom-hostname and SSL permissions.
4. **[owner]** Create or designate the platform merchant account that receives domain payments and confirm it is
   `ACTIVE`.
5. **[owner]** Decide the pricing policy: BOB per USD, and a markup that covers registrar cost, ICANN fees,
   settlement cost and a year of currency movement.
6. **[owner]** Decide the renewal, transfer, expiry and refund policies, and publish the merchant-facing terms.
7. ~~Build the Merchant Studio entry point per §6.~~ **Done 2026-09-16.**
8. ~~Build the paid-but-stalled escalation (§5a.2) and the abandoned-checkout reaper (§5a.3).~~ **Done 2026-09-16.**
9. ~~Make `CUSTOM_DOMAIN_CNAME_TARGET` required in live mode (§5a.4).~~ **Done 2026-09-16.** Note the consequence:
   the API now refuses live domain purchases until this variable is set, so step 13 is no longer optional.
10. ~~Build the operator view for `DomainOrder` (§5a.5).~~ **Done 2026-09-16.** The expiry warning job (§5a.6) is
    still open; it only matters once a real domain has been registered.
11. Set `NAMECOM_USERNAME`, `NAMECOM_API_TOKEN`, `DOMAIN_PLATFORM_MERCHANT_ID`, `DOMAIN_BOB_PER_USD`,
    `DOMAIN_MARKUP_PERCENT` on the API server. Leave `DOMAIN_REGISTRAR_SANDBOX=true`, `DOMAIN_COMMERCE_ENABLED=true`
    and `BANECO_QR_ENABLED=false` for the sandbox pass.
12. Run the sandbox smoke test (§5c.1): quote, mock-QR payment, registration, and confirm the order reaches
    `TEST_COMPLETE` without touching Cloudflare.
13. Set `DOMAIN_CLOUDFLARE_API_TOKEN`, `DOMAIN_CLOUDFLARE_ZONE_ID` and the real `CUSTOM_DOMAIN_CNAME_TARGET`.
14. **[owner]** Enable the live Baneco QR rail on the production API.
15. Set `DOMAIN_REGISTRAR_SANDBOX=false` and `DOMAIN_COMMERCE_ENABLED=true`.
16. Run one real paid registration on a throwaway name (§5c.2–5c.5): confirm DNS, both certificates, HTTPS, the
    storefront serving on the apex and on `www`, and the registrant verification email.
17. Only then expose the Studio entry point to merchants.
