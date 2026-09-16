# dLocal international payments — design

**Date:** 2026-09-16
**Status:** Approved 2026-09-16, amended during Task 1
**Scope:** Let foreign shoppers pay Bolivian pagosYa merchants with international cards and local methods through dLocal. Paddle billing for pagosYa's own subscriptions is a separate, later spec.

## Decisions

| Topic | Decision |
|---|---|
| Provider | dLocal (Payins API) |
| Credentials | None yet. Build against dLocal's public docs with recorded fixtures; the user applies to dLocal in parallel. |
| Methods (v1) | International cards **and** redirect/voucher local methods (Pix, OXXO, PSE, …) |
| Currency | Convert the merchant's BOB price to USD at checkout; charge USD; dLocal settles USD; the merchant accrues a USD balance |
| Rollout | Merchant requests it in the dashboard, ops approves; the shopper opts in at checkout and picks a country |
| Card capture | v1 uses the REDIRECT flow for cards, same as other local methods. Smart Fields (DIRECT, inside the pagosYa checkout iframe, SAQ-A) is Task 13, gated on `DLOCAL_SMART_FIELDS_KEY`. |
| Fees | A separate international fee in bps (`INTL_FEE_BPS`, placeholder 590) instead of the 250 bps domestic fee. dLocal's cost goes to a new `RAIL_COST` ledger account. |

Rejected: charging raw card numbers through the API (full PCI scope, contradicts `docs/SECURITY_HARDENING.md` §7); keeping balances in BOB (pagosYa would carry FX conversion and repatriation risk).

> dLocal endpoint names, headers, status values and webhook signature format are taken from its public docs **from memory**. Verify each against the current docs at <https://docs.dlocal.com> as the first implementation task and correct this spec wherever they differ.

## Architecture

All new rail code lives in `apps/api/src/rails/adapters/dlocal/`.

1. **`DlocalClientService`**: an HTTP client that signs each request (`X-Date`, `X-Login`, `X-Trans-Key`, `Authorization: V2-HMAC-SHA256, Signature: <hmac>`). It wraps create payment, get payment, create refund, and list payment methods by country. Config: `DLOCAL_LOGIN`, `DLOCAL_TRANS_KEY`, `DLOCAL_SECRET_KEY`, `DLOCAL_BASE_URL` (sandbox or live), `DLOCAL_SMART_FIELDS_KEY`. If credentials are missing and the API is not live, it reads recorded fixtures.
2. **`DlocalAdapter`** implements `PaymentRailAdapter` with `railId: "dlocal"` and `supportedMethodTypes: [CARD, BANK_TRANSFER, LOCAL_METHOD]`. The dLocal method id (`PX`, `OX`…) travels in `paymentMethod.metadata.dlocalPaymentMethodId`.
   - `authorize`: v1 always uses `REDIRECT`, including for `CARD`. `DIRECT` (a CARD payment with a Smart Fields token) is Task 13, gated on `DLOCAL_SMART_FIELDS_KEY`.
   - Status mapping: `PAID → succeeded`, `AUTHORIZED → succeeded` (auto-capture), `PENDING` with a redirect URL `→ requires_action{type:"redirect"}`, `PENDING` without one `→ pending`, `REJECTED`/`CANCELLED`/`EXPIRED → failed`. dLocal's `status_detail` becomes `failureReason`.
   - `capture`: dLocal auto-captures, so this returns the current status and makes no new charge.
   - `refund` and `getStatus` map directly to dLocal's endpoints.
3. **`dlocal-webhook.controller.ts`** (in `payment-intents/`, next to `baneco-qr-webhook.controller.ts`) checks the signature and then applies the status change through the existing state machine, idempotently.
4. **`DlocalReconciliationWorker`** runs every 15 min. It calls `getStatus` on `dlocal` payment intents that have a real dLocal id and have been `REQUIRES_ACTION` for more than 1h or `PROCESSING` for more than 15 min.
5. **Shared types:** add `"dlocal"` to `RailId` in `packages/shared-types/src/enums.ts`. Add `LOCAL_METHOD` to `PaymentMethodType` and `RAIL_COST` to `LedgerAccount` in one migration.

### Rail selection

- `ConfirmPaymentIntentDto` gains `rail?: "dlocal"` and `country?: string` (ISO-3166 alpha-2).
- `RailRegistry.getForMethodType` ignores adapters marked `explicitOnly`, so `dlocal` is only ever selected when the caller passes `rail: "dlocal"` explicitly, never picked as a default for a method type it shares with a domestic adapter.

### Merchant opt-in

- New enum `InternationalPaymentsStatus { OFF, REQUESTED, ENABLED, REJECTED }` and field `Merchant.internationalPaymentsStatus` (default `OFF`).
- Merchant dashboard: an "Aceptar pagos internacionales" card. A button moves the status to `REQUESTED`, and the card shows the fee and USD payout requirements.
- Ops console: a queue for `REQUESTED` merchants with approve and reject actions. Both are written to `AuditLogEntry`.
- The API returns 403 for rail `dlocal` unless the status is `ENABLED`.
- **Eligibility:** international payments additionally require `Merchant.settlementMode === SettlementMode.AGGREGATOR`. A `FACILITATOR` merchant cannot enable international payments regardless of `internationalPaymentsStatus`.

### Currency conversion

- Config `INTL_BOB_PER_USD` (a positive number). If it is missing or ≤ 0, international checkout is hidden and the API rejects `dlocal` payments.
- At confirmation, `usdAmount = ceil(bobAmount / rate)` in cents. The payment's `amount` and `currency` become the USD values. `metadata.fx = { originalAmount, originalCurrency: "BOB", rate, convertedAt }` is recorded.
- Checkout shows both amounts: "Bs 700,00 ≈ USD 100,58". dLocal shows the shopper their local-currency amount on its own pages.
- **Invoice:** the Factura is emitted in the original BOB amount, read from `metadata.fx.originalAmount`, never in the USD amount the payment was actually processed in.

### Checkout (`apps/checkout`)

- A "¿Pagas desde fuera de Bolivia?" entry appears only when the merchant has `ENABLED` and a rate is configured.
- A country picker. The payment methods come from `GET /v1/checkout/international-methods?country=XX`, which proxies dLocal and caches for 1h per country.
- Cards: v1 uses the REDIRECT flow, same as other local methods. Smart Fields (mount, get a token, confirm via `DIRECT`) is Task 13, gated on `DLOCAL_SMART_FIELDS_KEY`.
- `requires_action` redirect: do a real `window.top.location` redirect instead of today's "Confirme en: <url>" text (`apps/checkout/src/main.ts:9969`).
- A return page `/international/return?pi=<id>` polls the payment's status. It never treats the return itself as proof of payment. It shows paid, awaiting payment (vouchers) or failed-with-retry.
- Before redirecting to dLocal, the client secret is kept in `sessionStorage` and is never put in the URL (`callback_url`) sent to dLocal — only the bare `paymentIntentId` goes in that URL. The return page reads the secret back out of `sessionStorage` to poll status.

## Ledger and payouts

**Existing defect this work must fix:** `PayoutsService.getPayableBalance` sums `MERCHANT_PAYABLE` across all currencies, and `Payout.currency` defaults to BOB. The first USD sale would mix currencies.

- `getPayableBalance(merchantId, currency)` filters by `currency`. `payouts.controller.ts` returns one balance per currency.
- `createDuePayouts` loops over each currency with a positive balance and creates one payout per `(merchant, currency)`. The in-flight check is also per currency.
- USD payouts need `MerchantKycSubmission.payoutUsdBankAccount` (new, optional, reviewed by ops). Without it, the USD balance keeps growing but no payout is created, and the dashboard explains why.
- Fee: `computeFee(amount, railId)` uses `INTL_FEE_BPS` for `dlocal` and `PAGOSYA_FEE_BPS` otherwise. The capture journal (AGGREGATOR) looks like this:

  | Account | Direction | Amount |
  |---|---|---|
  | RAIL_CLEARING | DEBIT | amount − railCost |
  | RAIL_COST | DEBIT | railCost |
  | MERCHANT_PAYABLE | CREDIT | amount − fee |
  | PAGOSYA_FEE_REVENUE | CREDIT | fee |

  Margin (`PAGOSYA_FEE_REVENUE − RAIL_COST`) is computed in reporting, not in the journal itself. v1 always uses the `DLOCAL_COST_BPS` estimate for `railCost` and flags `metadata.dlocalCostEstimated = true` for monthly reconciliation against dLocal's actual settlement cost.
  A refund reverses the fee and payable lines and credits `RAIL_CLEARING` for the full `amount` (debit `MERCHANT_PAYABLE` for `amount − fee`, debit `PAGOSYA_FEE_REVENUE` for `fee`, credit `RAIL_CLEARING` for `amount`). `RAIL_COST` is not touched on refund — dLocal's cost is not recovered, which matches domestic refund behavior.
- Every journal is posted in the payment's currency (USD). The four lines must still net to zero, which `postJournalEntry` already checks.
- Of the finances screens, only the payable balance is split by currency for v1; `finances.service.ts` still reports BOB-only totals elsewhere (see "Out of scope").

## Error handling

| Case | Behavior |
|---|---|
| Card declined / rejected | `failed` with a Spanish reason; shopper can retry with another method |
| dLocal timeout or 5xx | The adapter returns `pending` with `railReference = "order:<paymentIntentId>"` (no real dLocal id yet). The intent moves to `REQUIRES_ACTION`; the webhook (keyed by `order_id`) resolves it, or reconciliation picks it up once it has a real dLocal id and has been `REQUIRES_ACTION` > 1h or `PROCESSING` > 15 min. Never marked failed on a guess |
| Webhook with a bad signature | 401, logged, no state change |
| Webhook for an unknown payment | 200 + log, so dLocal stops retrying |
| Duplicate or out-of-order webhook | No-op through the state machine's allowed transitions |
| Merchant not `ENABLED` | 403 on `dlocal` rail |
| Missing FX rate | International option hidden; API 409 `intl_fx_rate_unavailable` |
| Voucher never paid | dLocal `EXPIRED` → `failed`; the linked store order follows the same path as any other failed payment |

## Testing

- **Unit:** request signing (fixed date and key → known signature), status mapping table, BOB→USD rounding, `computeFee` per rail, the capture and refund journals balance to zero.
- **Ledger/payouts:** a merchant with BOB and USD entries gets separate balances and separate payouts. USD is skipped when there is no USD bank account.
- **Webhook:** a recorded payload with a valid signature → succeeded. The same payload again → no-op. Bad signature → 401.
- **Checkout end-to-end:** fixture mode; card REDIRECT success; redirect → return page → webhook → paid; voucher pending state. (Smart Fields/DIRECT success is Task 13.)
- **Sandbox:** once dLocal keys exist, run a manual checklist against sandbox test cards and a sample of redirect methods (BR Pix, MX OXXO, CO PSE).

## Out of scope

- Paddle subscription billing (next spec).
- Shoppers paying in BOB from abroad, per-product USD prices, and choosing the rail by IP geolocation.
- Automatic FX rates. The rate is set manually in config for v1.
- Ops tooling for disputes and chargebacks: v1 only logs dLocal chargeback notifications, it does not create a `SupportCase`.
- `finances.service.ts`'s non-payable-balance totals: they remain BOB-only in v1; see the Ledger and payouts section.

## External prerequisites (user)

1. Apply for a dLocal merchant account and confirm that a Bolivian APP can be onboarded and settled in USD.
2. Get the contracted dLocal fee to set `INTL_FEE_BPS` and `DLOCAL_COST_BPS`.
3. Open a USD account that can receive dLocal settlements.
4. Get legal review of cross-border collection under the ASFI/BCB rules.
