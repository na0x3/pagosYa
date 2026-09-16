# dLocal International Payments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let foreign shoppers pay approved Bolivian pagosYa merchants in USD through dLocal (cards and redirect local methods), with correct per-currency ledger balances and payouts.

**Architecture:** A new `dlocal` rail (client + adapter) plugs into the existing `RailRegistry`, but it is picked only when checkout explicitly asks for it (`rail: "dlocal"`), never by payment method type. `PaymentIntentsService.confirm` converts the BOB amount to USD from a configured rate, and the dLocal webhook plus a reconciliation worker drive the final status through the existing `applyCallbackResult`. No dLocal credentials exist yet, so the client has a fixture transport that runs everything offline. The HTTP transport switches on with `DLOCAL_ENABLED=true`.

**Tech Stack:** NestJS 11, Prisma 5 / PostgreSQL, Jest (api), Vite + Vitest (checkout), no-build HTML apps (merchant dashboard, ops), `@nestjs/schedule`.

**Spec:** `docs/superpowers/specs/2026-09-16-dlocal-international-payments-design.md`

## Global Constraints

- Rail id is exactly `"dlocal"`. Currency charged through dLocal is exactly `"USD"`.
- Amounts are integer minor units (cents) everywhere in the API. dLocal's API uses decimal major units; convert only inside `DlocalClientService`.
- BOB→USD: `usdCents = Math.ceil(bobCents / bobPerUsd)`. If `bobPerUsd` is missing or ≤ 0, international payments are unavailable (409 `intl_fx_rate_unavailable`).
- The fee rate for `dlocal` is `INTL_FEE_BPS` (default 590) and the estimated dLocal cost is `DLOCAL_COST_BPS` (default 0). Every other rail keeps `PAGOSYA_FEE_BPS` = 250.
- Only `AGGREGATOR` merchants with `internationalPaymentsStatus = ENABLED` may use `dlocal`.
- Raw card data never touches pagosYa servers (SAQ-A). Cards go through REDIRECT until Smart Fields is enabled (Task 13).
- Secrets live only in `.env`: `DLOCAL_LOGIN`, `DLOCAL_TRANS_KEY`, `DLOCAL_SECRET_KEY`, `DLOCAL_SMART_FIELDS_KEY`.
- Shopper-facing copy is Spanish.
- Commit messages follow repo style: a plain sentence describing the outcome (e.g. "Keep BOB and USD balances apart"), no `feat:` prefixes.
- Every commit stages only the files that task touched (the branch has unrelated uncommitted work).

API test command used throughout: `pnpm -C apps/api exec jest <path>`
API typecheck: `pnpm -C apps/api exec tsc --noEmit -p tsconfig.json`

---

### Task 1: Verify dLocal's contract, record fixtures, amend the spec

The dLocal details in the spec were written from memory. Everything after this task codes against the fixtures this task produces.

**Files:**
- Create: `apps/api/src/rails/adapters/dlocal/fixtures/payment-paid.json`
- Create: `apps/api/src/rails/adapters/dlocal/fixtures/payment-pending-redirect.json`
- Create: `apps/api/src/rails/adapters/dlocal/fixtures/payment-rejected.json`
- Create: `apps/api/src/rails/adapters/dlocal/fixtures/payment-methods-br.json`
- Create: `apps/api/src/rails/adapters/dlocal/fixtures/README.md`
- Modify: `docs/superpowers/specs/2026-09-16-dlocal-international-payments-design.md`

**Interfaces:**
- Produces: fixture JSON shapes used by Tasks 5, 6, 8. Field names below are the assumed ones. If the docs differ, change the fixtures **and** the field names in Tasks 5, 6 and 8 before starting them.

- [ ] **Step 1: Check each assumption against https://docs.dlocal.com** (Payins API reference, Security/Authentication, Notifications, Payment Methods, Refunds)

| Assumption | Where used |
|---|---|
| Base URLs `https://sandbox.dlocal.com` / `https://api.dlocal.com` | Task 5 config |
| Headers `X-Date` (ISO-8601), `X-Login`, `X-Trans-Key`, `X-Version: 2.1`, `Content-Type: application/json`, `Authorization: V2-HMAC-SHA256, Signature: <hex>` | Task 5 |
| Signature = hex HMAC-SHA256(secretKey, `X-Login + X-Date + body`) (body `""` for GET) | Tasks 5, 8 |
| `POST /payments` body: `amount` (decimal), `currency`, `country`, `payment_method_id`, `payment_method_flow` (`DIRECT`/`REDIRECT`), `payer {name,email,document}`, `order_id`, `notification_url`, `callback_url`, `card {token}` for DIRECT | Task 5 |
| Payment response: `id`, `amount`, `currency`, `status` (`PENDING`,`PAID`,`AUTHORIZED`,`REJECTED`,`CANCELLED`,`EXPIRED`), `status_detail`, `redirect_url`, `order_id` | Tasks 6, 8 |
| `GET /payments/{id}` returns the same shape | Tasks 6, 9 |
| `GET /payments-methods?country=XX` returns `[{id, type, name, logo, allowed_flows}]` | Task 10 |
| `POST /refunds` body `{payment_id, amount, currency, notification_url}` returns `{id, status}` | Task 6 |
| Notifications are POSTed to `notification_url` with the payment object as body and the same signature headers | Task 8 |
| Webhook `amount`/`currency` echo the requested USD values (not the shopper's local currency) | Task 8 |

- [ ] **Step 2: Write the fixtures** (adjust fields to what Step 1 found)

`payment-paid.json`:
```json
{ "id": "D-4-fixture-paid", "amount": 100.58, "currency": "USD", "country": "BR", "payment_method_id": "CARD", "payment_method_flow": "REDIRECT", "status": "PAID", "status_detail": "The payment was paid.", "status_code": "200", "order_id": "pi_fixture" }
```
`payment-pending-redirect.json`:
```json
{ "id": "D-4-fixture-pending", "amount": 100.58, "currency": "USD", "country": "BR", "payment_method_id": "PX", "payment_method_flow": "REDIRECT", "status": "PENDING", "status_detail": "The payment is pending.", "status_code": "100", "redirect_url": "https://sandbox.dlocal.com/collect/pay/fixture", "order_id": "pi_fixture" }
```
`payment-rejected.json`:
```json
{ "id": "D-4-fixture-rejected", "amount": 100.58, "currency": "USD", "country": "BR", "payment_method_id": "CARD", "payment_method_flow": "REDIRECT", "status": "REJECTED", "status_detail": "The payment was rejected.", "status_code": "300", "order_id": "pi_fixture" }
```
`payment-methods-br.json`:
```json
[
  { "id": "CARD", "type": "CARD", "name": "Tarjeta de crédito o débito", "logo": "https://static.dlocal.com/images/providers/card.png", "allowed_flows": ["DIRECT", "REDIRECT"] },
  { "id": "PX", "type": "BANK_TRANSFER", "name": "Pix", "logo": "https://static.dlocal.com/images/providers/pix.png", "allowed_flows": ["REDIRECT"] }
]
```
`README.md`:
```markdown
Recorded/hand-written dLocal payloads used by DlocalFixtureTransport and specs.
Verified against docs.dlocal.com on <date you checked>. Re-record from sandbox once DLOCAL_* keys exist.
```

- [ ] **Step 3: Amend the spec.** Apply these changes to the spec file:
  1. **Journal fix:** the capture table does not balance. Replace it with: `RAIL_CLEARING DEBIT amount − railCost`, `RAIL_COST DEBIT railCost`, `MERCHANT_PAYABLE CREDIT amount − fee`, `PAGOSYA_FEE_REVENUE CREDIT fee`. Margin is `PAGOSYA_FEE_REVENUE − RAIL_COST` in reporting. Delete the "dlocalCost > intlFee" paragraph. v1 always uses the `DLOCAL_COST_BPS` estimate with `metadata.dlocalCostEstimated = true`. Refund reverses fee and payable and credits `RAIL_CLEARING` for the full amount. dLocal's cost is not recovered, which matches domestic refund behavior.
  2. **Method type:** instead of `VOUCHER` and `WALLET`, add one enum value `LOCAL_METHOD`. The dLocal method id (`PX`, `OX`…) travels in `paymentMethod.metadata.dlocalPaymentMethodId`.
  3. **Rail selection:** `ConfirmPaymentIntentDto` gains `rail?: "dlocal"` and `country?: string` (ISO-3166 alpha-2). `RailRegistry.getForMethodType` ignores adapters marked `explicitOnly`.
  4. **Cards v1:** REDIRECT flow. Smart Fields (DIRECT) is Task 13, gated on `DLOCAL_SMART_FIELDS_KEY`.
  5. **Eligibility:** international payments require `settlementMode = AGGREGATOR`.
  6. **Invoice:** the Factura is emitted in the original BOB amount from `metadata.fx`.
  7. **Timeouts:** on a dLocal timeout/5xx the adapter returns `pending` with `railReference = "order:<paymentIntentId>"`. The intent moves to `REQUIRES_ACTION` and the webhook (keyed by `order_id`) resolves it. Reconciliation polls intents with a real dLocal id that have been `REQUIRES_ACTION` > 1h or `PROCESSING` > 15 min.
  8. **Return page:** the client secret is kept in `sessionStorage` before redirecting and is never put in the URL sent to dLocal.
  9. **Scope trims for v1:** chargeback notifications are logged only (no `SupportCase` creation). Of the finances screens, only the payable balance is split by currency (`finances.service.ts` still reports BOB-only totals). Both are listed under "Out of scope".
  10. **Status line:** change `**Status:** Draft, awaiting review` to `**Status:** Approved 2026-09-16, amended during Task 1`.

- [ ] **Step 4: Commit**
```bash
git add apps/api/src/rails/adapters/dlocal/fixtures docs/superpowers/specs/2026-09-16-dlocal-international-payments-design.md
git commit -m "Pin down the dLocal contract the integration codes against"
```

---

### Task 2: Schema, shared types, config

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (enums at lines 31-36 and 61-66, `Merchant` at 215, `MerchantKycSubmission` at 480, `PaymentIntent` indexes at ~553)
- Create: `apps/api/prisma/migrations/20260917090000_international_payments/migration.sql`
- Modify: `packages/shared-types/src/enums.ts:22-27,70`
- Modify: `apps/api/src/config/configuration.ts` (type near line 50, validation near line 150, values near line 239)
- Test: `apps/api/src/config/dlocal-config.spec.ts`

**Interfaces:**
- Produces:
  - Prisma: `PaymentMethodType.LOCAL_METHOD`, `LedgerAccount.RAIL_COST`, `enum InternationalPaymentsStatus { OFF REQUESTED ENABLED REJECTED }`, `Merchant.internationalPaymentsStatus`, `Merchant.internationalPaymentsNote String?`, `MerchantKycSubmission.payoutUsdBankAccount String?`
  - shared-types: `PaymentMethodType.LOCAL_METHOD`, `RailId` includes `"dlocal"`
  - Config type `DlocalConfig` at `app.dlocal`:
    ```ts
    export interface DlocalConfig {
      enabled: boolean; baseUrl: string; login: string; transKey: string; secretKey: string;
      smartFieldsKey: string; notificationUrl: string; returnUrl: string;
      bobPerUsd: number; intlFeeBps: number; costBps: number; timeoutMs: number;
    }
    ```
  - `export function parseDlocalConfig(env: NodeJS.ProcessEnv): DlocalConfig` (exported from `configuration.ts`)

- [ ] **Step 1: Write the failing config test**

`apps/api/src/config/dlocal-config.spec.ts`:
```ts
import { parseDlocalConfig } from "./configuration";

describe("parseDlocalConfig", () => {
  it("defaults to fixture mode with the international fee and no FX rate", () => {
    const cfg = parseDlocalConfig({});
    expect(cfg.enabled).toBe(false);
    expect(cfg.baseUrl).toBe("https://sandbox.dlocal.com");
    expect(cfg.intlFeeBps).toBe(590);
    expect(cfg.costBps).toBe(0);
    expect(cfg.bobPerUsd).toBe(0);
    expect(cfg.timeoutMs).toBe(15000);
  });

  it("reads explicit values", () => {
    const cfg = parseDlocalConfig({
      DLOCAL_ENABLED: "true", DLOCAL_BASE_URL: "https://api.dlocal.com", DLOCAL_LOGIN: "l", DLOCAL_TRANS_KEY: "t",
      DLOCAL_SECRET_KEY: "s", INTL_BOB_PER_USD: "6.96", INTL_FEE_BPS: "650", DLOCAL_COST_BPS: "420",
    });
    expect(cfg).toMatchObject({ enabled: true, baseUrl: "https://api.dlocal.com", login: "l", bobPerUsd: 6.96, intlFeeBps: 650, costBps: 420 });
  });

  it("treats a non-numeric rate as unavailable", () => {
    expect(parseDlocalConfig({ INTL_BOB_PER_USD: "abc" }).bobPerUsd).toBe(0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm -C apps/api exec jest src/config/dlocal-config.spec.ts`
Expected: FAIL, `parseDlocalConfig` is not exported.

- [ ] **Step 3: Implement config**

In `configuration.ts`, add after the `BanecoQrConfig` export:
```ts
export interface DlocalConfig {
  enabled: boolean;
  baseUrl: string;
  login: string;
  transKey: string;
  secretKey: string;
  smartFieldsKey: string;
  notificationUrl: string;
  returnUrl: string;
  bobPerUsd: number;
  intlFeeBps: number;
  costBps: number;
  timeoutMs: number;
}

function positiveNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function nonNegativeNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return value !== undefined && Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export function parseDlocalConfig(env: NodeJS.ProcessEnv): DlocalConfig {
  return {
    enabled: env.DLOCAL_ENABLED === "true",
    baseUrl: env.DLOCAL_BASE_URL ?? "https://sandbox.dlocal.com",
    login: env.DLOCAL_LOGIN ?? "",
    transKey: env.DLOCAL_TRANS_KEY ?? "",
    secretKey: env.DLOCAL_SECRET_KEY ?? "",
    smartFieldsKey: env.DLOCAL_SMART_FIELDS_KEY ?? "",
    notificationUrl: env.DLOCAL_NOTIFICATION_URL ?? "http://localhost:3000/v1/webhooks/dlocal/payments",
    returnUrl: env.DLOCAL_RETURN_URL ?? "http://localhost:5173/",
    bobPerUsd: positiveNumber(env.INTL_BOB_PER_USD, 0),
    intlFeeBps: positiveNumber(env.INTL_FEE_BPS, 590),
    costBps: nonNegativeNumber(env.DLOCAL_COST_BPS, 0),
    timeoutMs: positiveNumber(env.DLOCAL_TIMEOUT_MS, 15000),
  };
}
```
Add `dlocal: DlocalConfig;` to the app config interface next to `banecoQr: BanecoQrConfig;`. In the config values object add `dlocal: parseDlocalConfig(process.env),` next to `banecoQr: {...}`. In the production validation block after the Baneco check, add:
```ts
  if (app.dlocal.enabled) {
    if (!app.dlocal.login || !app.dlocal.transKey || !app.dlocal.secretKey) {
      failures.push("DLOCAL_LOGIN, DLOCAL_TRANS_KEY and DLOCAL_SECRET_KEY are required when DLOCAL_ENABLED=true");
    }
    requireHttps("DLOCAL_NOTIFICATION_URL", app.dlocal.notificationUrl);
    requireHttps("DLOCAL_RETURN_URL", app.dlocal.returnUrl);
  }
```

- [ ] **Step 4: Run the test**

Run: `pnpm -C apps/api exec jest src/config/dlocal-config.spec.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Schema changes**

In `schema.prisma`:
```prisma
enum PaymentMethodType {
  CARD
  TIGO_MONEY
  BANK_TRANSFER
  QR
  LOCAL_METHOD
}

enum LedgerAccount {
  RAIL_CLEARING
  MERCHANT_PAYABLE
  PAGOSYA_FEE_REVENUE
  RESERVE
  RAIL_COST
}

enum InternationalPaymentsStatus {
  OFF
  REQUESTED
  ENABLED
  REJECTED
}
```
In `model Merchant` add:
```prisma
  internationalPaymentsStatus InternationalPaymentsStatus @default(OFF)
  internationalPaymentsNote   String?
```
In `model MerchantKycSubmission` after `payoutBankAccount` add:
```prisma
  payoutUsdBankAccount String?
```
In `model PaymentIntent` next to the existing `@@index` lines add:
```prisma
  @@index([railId, status, updatedAt])
```

- [ ] **Step 6: Create the migration**

Run: `pnpm -C apps/api exec prisma migrate dev --create-only --name international_payments`
Then rename the generated folder to `20260917090000_international_payments` if its timestamp sorts before `20260916150000_domain_order_expiry_warning`. Confirm the SQL contains exactly:
```sql
ALTER TYPE "PaymentMethodType" ADD VALUE 'LOCAL_METHOD';
ALTER TYPE "LedgerAccount" ADD VALUE 'RAIL_COST';
CREATE TYPE "InternationalPaymentsStatus" AS ENUM ('OFF', 'REQUESTED', 'ENABLED', 'REJECTED');
ALTER TABLE "Merchant" ADD COLUMN "internationalPaymentsNote" TEXT,
ADD COLUMN "internationalPaymentsStatus" "InternationalPaymentsStatus" NOT NULL DEFAULT 'OFF';
ALTER TABLE "MerchantKycSubmission" ADD COLUMN "payoutUsdBankAccount" TEXT;
CREATE INDEX "PaymentIntent_railId_status_updatedAt_idx" ON "PaymentIntent"("railId", "status", "updatedAt");
```
Then run: `pnpm -C apps/api exec prisma migrate dev` and `pnpm -C apps/api exec prisma generate`
Expected: migration applied, client generated.

- [ ] **Step 7: Shared types**

`packages/shared-types/src/enums.ts`:
```ts
export enum PaymentMethodType {
  CARD = "CARD",
  TIGO_MONEY = "TIGO_MONEY",
  BANK_TRANSFER = "BANK_TRANSFER",
  QR = "QR",
  LOCAL_METHOD = "LOCAL_METHOD",
}
```
and
```ts
export type RailId = "mock_card" | "mock_tigo_money" | "mock_bank_transfer" | "mock_qr" | "baneco_qr" | "dlocal";
```
Run: `pnpm -C packages/shared-types build`

- [ ] **Step 8: Keep checkout's domestic tabs domestic**

`apps/checkout/src/main.ts` has three exhaustive `Record<PaymentMethodType, …>` maps (`TEST_TOKENS`, `TAB_LABELS`, `TAB_ICONS`, ~lines 154-205) and renders tabs from `Object.values(PaymentMethodType)` (~line 9415). Add above `TEST_TOKENS`:
```ts
type DomesticMethodType = Exclude<PaymentMethodType, PaymentMethodType.LOCAL_METHOD>;
const DOMESTIC_METHOD_TYPES: DomesticMethodType[] = [
  PaymentMethodType.CARD,
  PaymentMethodType.TIGO_MONEY,
  PaymentMethodType.BANK_TRANSFER,
  PaymentMethodType.QR,
];
```
Change the three maps to `Record<DomesticMethodType, …>`, and replace `Object.values(PaymentMethodType)` in the tab render with `DOMESTIC_METHOD_TYPES`. Change `let selectedType: PaymentMethodType` to `let selectedType: DomesticMethodType`. Fix any resulting type errors by indexing with `selectedType`.

- [ ] **Step 9: Typecheck everything touched**

Run: `pnpm -C apps/api exec tsc --noEmit -p tsconfig.json && pnpm -C apps/checkout exec tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 10: Commit**
```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20260917090000_international_payments packages/shared-types/src/enums.ts apps/api/src/config/configuration.ts apps/api/src/config/dlocal-config.spec.ts apps/checkout/src/main.ts
git commit -m "Add the data and config international payments need"
```

---

### Task 3: Keep BOB and USD balances and payouts apart

Fixes the existing defect, where the payable balance adds every currency together. This task is independent of dLocal and safe to ship alone.

**Files:**
- Modify: `apps/api/src/payouts/payouts.service.ts:16-63`
- Modify: `apps/api/src/payouts/payouts.controller.ts:14-19`
- Test: `apps/api/src/payouts/payouts.service.spec.ts`

**Interfaces:**
- Consumes: `MerchantKycSubmission.payoutUsdBankAccount` (Task 2)
- Produces:
  - `PayoutsService.getPayableBalance(merchantId: string, currency?: string): Promise<number>` (default `"BOB"`)
  - `PayoutsService.getPayableBalances(merchantId: string): Promise<{ currency: string; payableBalance: number }[]>`
  - `GET /v1/merchants/balance` → `{ payableBalance: number; currency: "BOB"; balances: { currency: string; payableBalance: number }[] }`

- [ ] **Step 1: Write the failing tests.** Append to `payouts.service.spec.ts`:
```ts
describe("PayoutsService multi-currency", () => {
  const aggregatorMerchant = { id: "m_1", settlementMode: SettlementMode.AGGREGATOR, status: MerchantStatus.ACTIVE };

  it("filters the single-currency balance by currency, defaulting to BOB", async () => {
    const prisma = makeFakePrisma();
    prisma.ledgerEntry.groupBy.mockResolvedValue([]);
    const service = new PayoutsService(prisma as any);

    await service.getPayableBalance("m_1");
    expect(prisma.ledgerEntry.groupBy).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ merchantId: "m_1", currency: "BOB" }),
    }));
  });

  it("returns one balance per currency without summing across them", async () => {
    const prisma = makeFakePrisma();
    prisma.ledgerEntry.groupBy.mockResolvedValue([
      { currency: "BOB", direction: LedgerDirection.CREDIT, _sum: { amount: 70000 } },
      { currency: "USD", direction: LedgerDirection.CREDIT, _sum: { amount: 9500 } },
      { currency: "USD", direction: LedgerDirection.DEBIT, _sum: { amount: 500 } },
    ]);
    const service = new PayoutsService(prisma as any);

    await expect(service.getPayableBalances("m_1")).resolves.toEqual([
      { currency: "BOB", payableBalance: 70000 },
      { currency: "USD", payableBalance: 9000 },
    ]);
  });

  it("creates separate BOB and USD payouts to the matching bank accounts", async () => {
    const prisma = makeFakePrisma();
    prisma.merchant.findMany.mockResolvedValue([aggregatorMerchant]);
    prisma.payout.findFirst.mockResolvedValue(null);
    prisma.ledgerEntry.groupBy.mockResolvedValue([
      { currency: "BOB", direction: LedgerDirection.CREDIT, _sum: { amount: 5000 } },
      { currency: "USD", direction: LedgerDirection.CREDIT, _sum: { amount: 900 } },
    ]);
    prisma.merchantKycSubmission.findFirst.mockResolvedValue({ status: KycStatus.APPROVED, payoutBankAccount: "BNB 123", payoutUsdBankAccount: "US 987" });
    const service = new PayoutsService(prisma as any);

    await service.createDuePayouts();

    expect(prisma.payout.create).toHaveBeenCalledWith({ data: expect.objectContaining({ amount: 5000, currency: "BOB", bankAccount: "BNB 123" }) });
    expect(prisma.payout.create).toHaveBeenCalledWith({ data: expect.objectContaining({ amount: 900, currency: "USD", bankAccount: "US 987" }) });
    expect(prisma.payout.findFirst).toHaveBeenCalledWith({ where: expect.objectContaining({ merchantId: "m_1", currency: "USD" }) });
  });

  it("holds a USD balance when no USD bank account is on file", async () => {
    const prisma = makeFakePrisma();
    prisma.merchant.findMany.mockResolvedValue([aggregatorMerchant]);
    prisma.payout.findFirst.mockResolvedValue(null);
    prisma.ledgerEntry.groupBy.mockResolvedValue([{ currency: "USD", direction: LedgerDirection.CREDIT, _sum: { amount: 900 } }]);
    prisma.merchantKycSubmission.findFirst.mockResolvedValue({ status: KycStatus.APPROVED, payoutBankAccount: "BNB 123", payoutUsdBankAccount: null });
    const service = new PayoutsService(prisma as any);

    await service.createDuePayouts();

    expect(prisma.payout.create).not.toHaveBeenCalled();
  });
});
```
Existing tests in this file that mock `groupBy` without a `currency` field need updating:
- "creates a payout for an eligible merchant…": set the mock to `[{ currency: "BOB", direction: LedgerDirection.CREDIT, _sum: { amount: 5000 } }]`.
- "skips a merchant with a payout already in flight": add `prisma.ledgerEntry.groupBy.mockResolvedValue([{ currency: "BOB", direction: LedgerDirection.CREDIT, _sum: { amount: 5000 } }])` and `prisma.merchantKycSubmission.findFirst.mockResolvedValue({ status: KycStatus.APPROVED, payoutBankAccount: "BNB 123" })`, so the in-flight branch is actually reached.

- [ ] **Step 2: Run to verify failure**

Run: `pnpm -C apps/api exec jest src/payouts/payouts.service.spec.ts`
Expected: FAIL. `getPayableBalances` is not a function, and the currency filter is missing.

- [ ] **Step 3: Implement.** Replace `getPayableBalance` and `createDuePayouts` in `payouts.service.ts`:
```ts
  /**
   * Sum of MERCHANT_PAYABLE ledger entries for this merchant in one currency.
   * Credits from captures, debits from refunds and prior payouts (see
   * LedgerService.buildPayoutJournal), so this is the currently-unpaid balance.
   * Never sum across currencies: a USD cent is not a boliviano cent.
   */
  async getPayableBalance(merchantId: string, currency = "BOB"): Promise<number> {
    const rows = await this.prisma.ledgerEntry.groupBy({
      by: ["direction"],
      where: { merchantId, account: LedgerAccount.MERCHANT_PAYABLE, currency },
      _sum: { amount: true },
    });
    const credit = rows.find((r) => r.direction === LedgerDirection.CREDIT)?._sum.amount ?? 0;
    const debit = rows.find((r) => r.direction === LedgerDirection.DEBIT)?._sum.amount ?? 0;
    return credit - debit;
  }

  async getPayableBalances(merchantId: string): Promise<{ currency: string; payableBalance: number }[]> {
    const rows = await this.prisma.ledgerEntry.groupBy({
      by: ["currency", "direction"],
      where: { merchantId, account: LedgerAccount.MERCHANT_PAYABLE },
      _sum: { amount: true },
    });
    const byCurrency = new Map<string, number>();
    for (const row of rows) {
      const signed = (row._sum.amount ?? 0) * (row.direction === LedgerDirection.CREDIT ? 1 : -1);
      byCurrency.set(row.currency, (byCurrency.get(row.currency) ?? 0) + signed);
    }
    return [...byCurrency.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([currency, payableBalance]) => ({ currency, payableBalance }));
  }

  /**
   * Enqueues one PENDING Payout per (merchant, currency) with a positive unpaid
   * balance and no payout of that currency already in flight. USD balances
   * wait until the merchant's approved KYC has a USD bank account.
   */
  async createDuePayouts(): Promise<void> {
    const merchants = await this.prisma.merchant.findMany({
      where: { settlementMode: SettlementMode.AGGREGATOR, status: MerchantStatus.ACTIVE },
    });

    for (const merchant of merchants) {
      const balances = (await this.getPayableBalances(merchant.id)).filter((b) => b.payableBalance > 0);
      if (!balances.length) continue;

      const approvedKyc = await this.prisma.merchantKycSubmission.findFirst({
        where: { merchantId: merchant.id, status: KycStatus.APPROVED },
        orderBy: { createdAt: "desc" },
      });
      if (!approvedKyc) continue; // shouldn't happen for an ACTIVE merchant, but never guess a bank account

      for (const { currency, payableBalance } of balances) {
        const bankAccount =
          currency === "BOB" ? approvedKyc.payoutBankAccount : currency === "USD" ? approvedKyc.payoutUsdBankAccount : null;
        if (!bankAccount) continue;

        const inFlight = await this.prisma.payout.findFirst({
          where: { merchantId: merchant.id, currency, status: PayoutStatus.PENDING },
        });
        if (inFlight) continue;

        await this.prisma.payout.create({
          data: { merchantId: merchant.id, amount: payableBalance, currency, bankAccount, nextRetryAt: new Date() },
        });
      }
    }
  }
```
In `payouts.controller.ts` replace `getBalance`:
```ts
  async getBalance(@CurrentMerchant() merchant: { id: string }) {
    const balances = await this.payouts.getPayableBalances(merchant.id);
    const payableBalance = balances.find((b) => b.currency === "BOB")?.payableBalance ?? 0;
    // payableBalance/currency stay for existing dashboard clients; balances is the source of truth.
    return { payableBalance, currency: "BOB", balances };
  }
```

- [ ] **Step 4: Run tests**

Run: `pnpm -C apps/api exec jest src/payouts`
Expected: PASS (all payouts specs; `payout-delivery.worker.ts:79` already posts in `payout.currency`)

- [ ] **Step 5: Commit**
```bash
git add apps/api/src/payouts/payouts.service.ts apps/api/src/payouts/payouts.controller.ts apps/api/src/payouts/payouts.service.spec.ts
git commit -m "Keep BOB and USD balances and payouts apart"
```

---

### Task 4: International fee and rail cost in the ledger

**Files:**
- Modify: `apps/api/src/ledger/ledger.constants.ts`
- Modify: `apps/api/src/ledger/ledger.service.ts:61-107`
- Test: `apps/api/src/ledger/ledger.service.spec.ts`

**Interfaces:**
- Produces:
  - `export interface FeePricing { feeBps: number; railCostBps: number }`
  - `export const DOMESTIC_PRICING: FeePricing = { feeBps: PAGOSYA_FEE_BPS, railCostBps: 0 }`
  - `computeFee(amount: number, feeBps = PAGOSYA_FEE_BPS): number`
  - `buildCaptureJournal({ merchantId, transactionId, amount, settlementMode, pricing? }: {...; pricing?: FeePricing })`
  - `buildRefundJournal({ merchantId, transactionId, amount, settlementMode, pricing? })`

- [ ] **Step 1: Write failing tests.** Append inside `describe("LedgerService", …)` in `ledger.service.spec.ts`:
```ts
  it("books the international fee and dLocal's estimated cost as separate accounts, balanced", () => {
    const lines = ledger.buildCaptureJournal({
      ...base, amount: 10000, settlementMode: SettlementMode.AGGREGATOR, pricing: { feeBps: 590, railCostBps: 420 },
    });
    expect(netsToZero(lines)).toBe(true);
    const find = (account: LedgerAccount) => lines.find((l) => l.account === account);
    expect(find(LedgerAccount.RAIL_CLEARING)).toMatchObject({ direction: LedgerDirection.DEBIT, amount: 9580 });
    expect(find(LedgerAccount.RAIL_COST)).toMatchObject({ direction: LedgerDirection.DEBIT, amount: 420 });
    expect(find(LedgerAccount.MERCHANT_PAYABLE)).toMatchObject({ direction: LedgerDirection.CREDIT, amount: 9410 });
    expect(find(LedgerAccount.PAGOSYA_FEE_REVENUE)).toMatchObject({ direction: LedgerDirection.CREDIT, amount: 590 });
  });

  it("omits the RAIL_COST line when the rail has no cost (domestic journals unchanged)", () => {
    const lines = ledger.buildCaptureJournal({ ...base, settlementMode: SettlementMode.AGGREGATOR });
    expect(lines.some((l) => l.account === LedgerAccount.RAIL_COST)).toBe(false);
  });

  it("reverses the international fee on refund and credits clearing for the full amount", () => {
    const lines = ledger.buildRefundJournal({
      ...base, amount: 10000, settlementMode: SettlementMode.AGGREGATOR, pricing: { feeBps: 590, railCostBps: 420 },
    });
    expect(netsToZero(lines)).toBe(true);
    expect(lines.find((l) => l.account === LedgerAccount.MERCHANT_PAYABLE)).toMatchObject({ direction: LedgerDirection.DEBIT, amount: 9410 });
    expect(lines.find((l) => l.account === LedgerAccount.PAGOSYA_FEE_REVENUE)).toMatchObject({ direction: LedgerDirection.DEBIT, amount: 590 });
    expect(lines.find((l) => l.account === LedgerAccount.RAIL_CLEARING)).toMatchObject({ direction: LedgerDirection.CREDIT, amount: 10000 });
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm -C apps/api exec jest src/ledger/ledger.service.spec.ts`
Expected: FAIL. `pricing` is ignored, so the fee is 25 instead of 590.

- [ ] **Step 3: Implement.** `ledger.constants.ts`:
```ts
/** pagosYa's gateway fee, in basis points (250 = 2.5%), matching the incumbent's published rate. */
export const PAGOSYA_FEE_BPS = 250;

/** What a capture charges the merchant, and what the rail is estimated to charge pagosYa, in bps. */
export interface FeePricing {
  feeBps: number;
  railCostBps: number;
}

export const DOMESTIC_PRICING: FeePricing = { feeBps: PAGOSYA_FEE_BPS, railCostBps: 0 };

export function computeFee(amount: number, feeBps = PAGOSYA_FEE_BPS): number {
  return Math.floor((amount * feeBps) / 10000);
}
```
In `ledger.service.ts` import `DOMESTIC_PRICING, FeePricing` alongside `computeFee`, and add `pricing?: FeePricing` to both `buildCaptureJournal` and `buildRefundJournal` param types. Replace the AGGREGATOR branch of `buildCaptureJournal`:
```ts
    const { feeBps, railCostBps } = params.pricing ?? DOMESTIC_PRICING;
    const fee = computeFee(amount, feeBps);
    const railCost = computeFee(amount, railCostBps);
    const net = amount - fee;
    return [
      { account: LedgerAccount.RAIL_CLEARING, direction: LedgerDirection.DEBIT, amount: amount - railCost, merchantId, transactionId },
      ...(railCost > 0
        ? [{ account: LedgerAccount.RAIL_COST, direction: LedgerDirection.DEBIT, amount: railCost, merchantId, transactionId }]
        : []),
      { account: LedgerAccount.MERCHANT_PAYABLE, direction: LedgerDirection.CREDIT, amount: net, merchantId, transactionId },
      { account: LedgerAccount.PAGOSYA_FEE_REVENUE, direction: LedgerDirection.CREDIT, amount: fee, merchantId, transactionId },
    ];
```
Replace the AGGREGATOR branch of `buildRefundJournal`:
```ts
    const fee = computeFee(amount, (params.pricing ?? DOMESTIC_PRICING).feeBps);
    const net = amount - fee;
    return [
      { account: LedgerAccount.MERCHANT_PAYABLE, direction: LedgerDirection.DEBIT, amount: net, merchantId, transactionId },
      { account: LedgerAccount.PAGOSYA_FEE_REVENUE, direction: LedgerDirection.DEBIT, amount: fee, merchantId, transactionId },
      { account: LedgerAccount.RAIL_CLEARING, direction: LedgerDirection.CREDIT, amount, merchantId, transactionId },
    ];
```

- [ ] **Step 4: Run tests**

Run: `pnpm -C apps/api exec jest src/ledger`
Expected: PASS, including the original four tests.

- [ ] **Step 5: Commit**
```bash
git add apps/api/src/ledger/ledger.constants.ts apps/api/src/ledger/ledger.service.ts apps/api/src/ledger/ledger.service.spec.ts
git commit -m "Book the international fee and the rail's cost separately"
```

---

### Task 5: dLocal client with signing and fixture transport

**Files:**
- Create: `apps/api/src/rails/adapters/dlocal/dlocal.types.ts`
- Create: `apps/api/src/rails/adapters/dlocal/dlocal-signature.ts`
- Create: `apps/api/src/rails/adapters/dlocal/dlocal-fixture-transport.ts`
- Create: `apps/api/src/rails/adapters/dlocal/dlocal-client.service.ts`
- Test: `apps/api/src/rails/adapters/dlocal/dlocal-signature.spec.ts`
- Test: `apps/api/src/rails/adapters/dlocal/dlocal-client.service.spec.ts`

**Interfaces:**
- Consumes: `DlocalConfig` at `app.dlocal` (Task 2), fixtures (Task 1)
- Produces:
  ```ts
  // dlocal.types.ts
  export type DlocalPaymentStatus = "PENDING" | "PAID" | "AUTHORIZED" | "REJECTED" | "CANCELLED" | "EXPIRED";
  export interface DlocalPayment { id: string; amount: number; currency: string; country?: string; payment_method_id?: string; status: DlocalPaymentStatus; status_detail?: string; status_code?: string; redirect_url?: string; order_id?: string }
  export interface DlocalPaymentMethod { id: string; type: string; name: string; logo?: string; allowed_flows?: string[] }
  export interface CreateDlocalPayment { orderId: string; amountCents: number; currency: "USD"; country: string; paymentMethodId: string; flow: "DIRECT" | "REDIRECT"; payer: { name: string; email: string; document?: string }; cardToken?: string; callbackUrl: string }
  export interface DlocalRefund { id: string; status: string }
  export interface DlocalTransport { request<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> }
  export class DlocalApiError extends Error { readonly httpStatus: number; readonly retryable: boolean }
  // dlocal-signature.ts
  export function signDlocal(secretKey: string, login: string, xDate: string, body: string): string
  export function verifyDlocalSignature(secretKey: string, login: string, xDate: string, body: string, authorization: string | undefined): boolean
  // dlocal-client.service.ts
  class DlocalClientService {
    createPayment(p: CreateDlocalPayment): Promise<DlocalPayment>;
    getPayment(id: string): Promise<DlocalPayment>;
    refund(paymentId: string, amountCents: number, currency: string): Promise<DlocalRefund>;
    listPaymentMethods(country: string): Promise<DlocalPaymentMethod[]>;
    verifyWebhook(login: string | undefined, xDate: string | undefined, rawBody: string, authorization: string | undefined): boolean;
  }
  ```

- [ ] **Step 1: Write failing signature tests**

`dlocal-signature.spec.ts`:
```ts
import { createHmac } from "node:crypto";
import { signDlocal, verifyDlocalSignature } from "./dlocal-signature";

describe("dLocal signature", () => {
  const secret = "secret_fixture";
  const login = "login_fixture";
  const xDate = "2026-09-17T12:00:00.000Z";
  const body = '{"amount":100.58}';
  const expected = createHmac("sha256", secret).update(login + xDate + body).digest("hex");

  it("signs login + date + body with HMAC-SHA256 hex", () => {
    expect(signDlocal(secret, login, xDate, body)).toBe(expected);
  });

  it("accepts the V2 authorization header it would produce", () => {
    expect(verifyDlocalSignature(secret, login, xDate, body, `V2-HMAC-SHA256, Signature: ${expected}`)).toBe(true);
  });

  it("rejects a tampered body, a missing header, and a wrong-length signature", () => {
    expect(verifyDlocalSignature(secret, login, xDate, body + " ", `V2-HMAC-SHA256, Signature: ${expected}`)).toBe(false);
    expect(verifyDlocalSignature(secret, login, xDate, body, undefined)).toBe(false);
    expect(verifyDlocalSignature(secret, login, xDate, body, "V2-HMAC-SHA256, Signature: abc")).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm -C apps/api exec jest src/rails/adapters/dlocal/dlocal-signature.spec.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement types and signature**

`dlocal.types.ts`:
```ts
export type DlocalPaymentStatus = "PENDING" | "PAID" | "AUTHORIZED" | "REJECTED" | "CANCELLED" | "EXPIRED";

export interface DlocalPayment {
  id: string;
  amount: number;
  currency: string;
  country?: string;
  payment_method_id?: string;
  status: DlocalPaymentStatus;
  status_detail?: string;
  status_code?: string;
  redirect_url?: string;
  order_id?: string;
}

export interface DlocalPaymentMethod {
  id: string;
  type: string;
  name: string;
  logo?: string;
  allowed_flows?: string[];
}

export interface CreateDlocalPayment {
  orderId: string;
  amountCents: number;
  currency: "USD";
  country: string;
  paymentMethodId: string;
  flow: "DIRECT" | "REDIRECT";
  payer: { name: string; email: string; document?: string };
  cardToken?: string;
  callbackUrl: string;
}

export interface DlocalRefund {
  id: string;
  status: string;
}

export interface DlocalTransport {
  request<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T>;
}

/** retryable = the outcome is unknown (timeout/5xx), so a payment must not be marked failed. */
export class DlocalApiError extends Error {
  constructor(
    message: string,
    readonly httpStatus: number,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "DlocalApiError";
  }
}
```
`dlocal-signature.ts`:
```ts
import { createHmac, timingSafeEqual } from "node:crypto";

export function signDlocal(secretKey: string, login: string, xDate: string, body: string): string {
  return createHmac("sha256", secretKey).update(login + xDate + body).digest("hex");
}

export function verifyDlocalSignature(
  secretKey: string,
  login: string,
  xDate: string,
  body: string,
  authorization: string | undefined,
): boolean {
  const presented = authorization?.match(/Signature:\s*([0-9a-f]+)\s*$/i)?.[1];
  if (!secretKey || !presented) return false;
  const expected = Buffer.from(signDlocal(secretKey, login, xDate, body), "utf8");
  const given = Buffer.from(presented.toLowerCase(), "utf8");
  return given.length === expected.length && timingSafeEqual(given, expected);
}
```

- [ ] **Step 4: Run signature tests**

Run: `pnpm -C apps/api exec jest src/rails/adapters/dlocal/dlocal-signature.spec.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Write failing client tests**

`dlocal-client.service.spec.ts`:
```ts
import { DlocalClientService } from "./dlocal-client.service";
import { DlocalApiError } from "./dlocal.types";

function makeClient(overrides: Record<string, unknown> = {}) {
  const cfg = {
    enabled: false, baseUrl: "https://sandbox.dlocal.com", login: "l", transKey: "t", secretKey: "s",
    smartFieldsKey: "", notificationUrl: "https://api.test/v1/webhooks/dlocal/payments", returnUrl: "https://checkout.test/",
    bobPerUsd: 6.96, intlFeeBps: 590, costBps: 0, timeoutMs: 50, ...overrides,
  };
  const config = { get: jest.fn().mockReturnValue(cfg) };
  return new DlocalClientService(config as any);
}

const basePayment = {
  orderId: "pi_1", amountCents: 10058, currency: "USD" as const, country: "BR", flow: "REDIRECT" as const,
  payer: { name: "Ana", email: "ana@example.com", document: "12345678909" }, callbackUrl: "https://checkout.test/?intl_return=1&pi=pi_1",
};

describe("DlocalClientService (fixture mode)", () => {
  afterEach(() => jest.restoreAllMocks());

  it("returns a pending redirect for local methods, echoing order and amount", async () => {
    const payment = await makeClient().createPayment({ ...basePayment, paymentMethodId: "PX" });
    expect(payment).toMatchObject({ status: "PENDING", order_id: "pi_1", amount: 100.58, currency: "USD" });
    expect(payment.redirect_url).toContain("intl_return=1");
  });

  it("returns fixture methods for a country", async () => {
    const methods = await makeClient().listPaymentMethods("BR");
    expect(methods.map((m) => m.id)).toEqual(["CARD", "PX"]);
  });

  it("never verifies webhooks in fixture mode", () => {
    expect(makeClient().verifyWebhook("l", "d", "{}", "V2-HMAC-SHA256, Signature: 00")).toBe(false);
  });
});

describe("DlocalClientService (http mode)", () => {
  afterEach(() => jest.restoreAllMocks());

  it("sends signed headers and a decimal amount", async () => {
    const fetchMock = jest.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "D-1", status: "PENDING", amount: 100.58, currency: "USD" }), { status: 200 }),
    );
    await makeClient({ enabled: true }).createPayment({ ...basePayment, paymentMethodId: "PX" });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://sandbox.dlocal.com/payments");
    const headers = init.headers as Record<string, string>;
    expect(headers["X-Login"]).toBe("l");
    expect(headers["X-Trans-Key"]).toBe("t");
    expect(headers.Authorization).toMatch(/^V2-HMAC-SHA256, Signature: [0-9a-f]{64}$/);
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({
      amount: 100.58, currency: "USD", country: "BR", payment_method_id: "PX", payment_method_flow: "REDIRECT",
      order_id: "pi_1", notification_url: "https://api.test/v1/webhooks/dlocal/payments",
    });
  });

  it("marks 5xx as retryable and 4xx as final", async () => {
    jest.spyOn(global, "fetch").mockResolvedValueOnce(new Response("{}", { status: 503 }));
    await expect(makeClient({ enabled: true }).getPayment("D-1")).rejects.toMatchObject({ retryable: true, httpStatus: 503 });
    jest.spyOn(global, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({ message: "Invalid country" }), { status: 400 }));
    await expect(makeClient({ enabled: true }).getPayment("D-1")).rejects.toMatchObject({ retryable: false, httpStatus: 400, message: "Invalid country" });
  });

  it("treats a timeout as retryable", async () => {
    jest.spyOn(global, "fetch").mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      (init as RequestInit).signal!.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
    }));
    const error = await makeClient({ enabled: true, timeoutMs: 10 }).getPayment("D-1").catch((e) => e);
    expect(error).toBeInstanceOf(DlocalApiError);
    expect(error.retryable).toBe(true);
  });
});
```

- [ ] **Step 6: Run to verify failure**

Run: `pnpm -C apps/api exec jest src/rails/adapters/dlocal/dlocal-client.service.spec.ts`
Expected: FAIL, module not found.

- [ ] **Step 7: Implement the fixture transport**

`dlocal-fixture-transport.ts`:
```ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { DlocalPayment, DlocalPaymentMethod, DlocalTransport } from "./dlocal.types";

const fixture = <T>(name: string): T => JSON.parse(readFileSync(path.join(__dirname, "fixtures", name), "utf8")) as T;

/**
 * Offline stand-in for dLocal until sandbox keys exist (DLOCAL_ENABLED=false).
 * Deterministic by input: card token "tok_dlocal_decline" is rejected,
 * a DIRECT card is paid, and everything else is a pending redirect back to
 * the callback URL so the return page and dev "simulate" button can be exercised.
 */
export class DlocalFixtureTransport implements DlocalTransport {
  private readonly payments = new Map<string, DlocalPayment>();

  async request<T>(method: "GET" | "POST", requestPath: string, body?: unknown): Promise<T> {
    if (method === "GET" && requestPath.startsWith("/payments-methods")) return fixture<DlocalPaymentMethod[]>("payment-methods-br.json") as T;
    if (method === "POST" && requestPath === "/payments") return this.createPayment(body as Record<string, any>) as T;
    if (method === "GET" && requestPath.startsWith("/payments/")) {
      const id = decodeURIComponent(requestPath.slice("/payments/".length));
      return (this.payments.get(id) ?? { ...fixture<DlocalPayment>("payment-pending-redirect.json"), id }) as T;
    }
    if (method === "POST" && requestPath === "/refunds") return { id: `R-fixture-${this.payments.size}`, status: "SUCCESS" } as T;
    throw new Error(`DlocalFixtureTransport has no fixture for ${method} ${requestPath}`);
  }

  private createPayment(body: Record<string, any>): DlocalPayment {
    const common = { amount: body.amount, currency: body.currency, country: body.country, payment_method_id: body.payment_method_id, order_id: body.order_id };
    const id = `D-fixture-${body.order_id}-${this.payments.size + 1}`;
    const payment: DlocalPayment =
      body.card?.token === "tok_dlocal_decline"
        ? { ...fixture<DlocalPayment>("payment-rejected.json"), ...common, id }
        : body.payment_method_flow === "DIRECT"
          ? { ...fixture<DlocalPayment>("payment-paid.json"), ...common, id }
          : { ...fixture<DlocalPayment>("payment-pending-redirect.json"), ...common, id, redirect_url: body.callback_url };
    this.payments.set(id, payment);
    return payment;
  }
}
```
Fixtures are read from `__dirname`, so the build must copy them. Check `apps/api/nest-cli.json` `compilerOptions.assets`, and add `{ "include": "rails/adapters/dlocal/fixtures/*.json", "watchAssets": true }` if JSON files aren't already copied. Verify with `pnpm -C apps/api build && ls apps/api/dist/src/rails/adapters/dlocal/fixtures`.

- [ ] **Step 8: Implement the client**

`dlocal-client.service.ts`:
```ts
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { DlocalConfig } from "../../../config/configuration";
import { signDlocal, verifyDlocalSignature } from "./dlocal-signature";
import { DlocalFixtureTransport } from "./dlocal-fixture-transport";
import {
  CreateDlocalPayment, DlocalApiError, DlocalPayment, DlocalPaymentMethod, DlocalRefund, DlocalTransport,
} from "./dlocal.types";

/**
 * Thin client for dLocal's Payins API. Signing and major/minor unit
 * conversion live here so DlocalAdapter only speaks RailResult.
 */
@Injectable()
export class DlocalClientService {
  private readonly logger = new Logger(DlocalClientService.name);
  private readonly fixture = new DlocalFixtureTransport();

  constructor(private readonly config: ConfigService) {}

  private get cfg(): DlocalConfig {
    return this.config.get<DlocalConfig>("app.dlocal")!;
  }

  private get transport(): DlocalTransport {
    return this.cfg.enabled ? { request: (m, p, b) => this.http(m, p, b) } : this.fixture;
  }

  createPayment(p: CreateDlocalPayment): Promise<DlocalPayment> {
    return this.transport.request<DlocalPayment>("POST", "/payments", {
      amount: p.amountCents / 100,
      currency: p.currency,
      country: p.country,
      payment_method_id: p.paymentMethodId,
      payment_method_flow: p.flow,
      payer: p.payer,
      order_id: p.orderId,
      notification_url: this.cfg.notificationUrl,
      callback_url: p.callbackUrl,
      ...(p.cardToken ? { card: { token: p.cardToken } } : {}),
    });
  }

  getPayment(id: string): Promise<DlocalPayment> {
    return this.transport.request<DlocalPayment>("GET", `/payments/${encodeURIComponent(id)}`);
  }

  refund(paymentId: string, amountCents: number, currency: string): Promise<DlocalRefund> {
    return this.transport.request<DlocalRefund>("POST", "/refunds", {
      payment_id: paymentId,
      amount: amountCents / 100,
      currency,
      notification_url: this.cfg.notificationUrl,
    });
  }

  listPaymentMethods(country: string): Promise<DlocalPaymentMethod[]> {
    return this.transport.request<DlocalPaymentMethod[]>("GET", `/payments-methods?country=${encodeURIComponent(country)}`);
  }

  /** In fixture mode there is no secret, so real inbound webhooks are always rejected. */
  verifyWebhook(login: string | undefined, xDate: string | undefined, rawBody: string, authorization: string | undefined): boolean {
    if (!this.cfg.enabled || !login || !xDate || login !== this.cfg.login) return false;
    return verifyDlocalSignature(this.cfg.secretKey, login, xDate, rawBody, authorization);
  }

  private async http<T>(method: "GET" | "POST", requestPath: string, body?: unknown): Promise<T> {
    const payload = body === undefined ? "" : JSON.stringify(body);
    const xDate = new Date().toISOString();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.cfg.timeoutMs);
    try {
      const response = await fetch(`${this.cfg.baseUrl}${requestPath}`, {
        method,
        signal: controller.signal,
        headers: {
          "X-Date": xDate,
          "X-Login": this.cfg.login,
          "X-Trans-Key": this.cfg.transKey,
          "X-Version": "2.1",
          "Content-Type": "application/json",
          Authorization: `V2-HMAC-SHA256, Signature: ${signDlocal(this.cfg.secretKey, this.cfg.login, xDate, payload)}`,
        },
        ...(method === "POST" ? { body: payload } : {}),
      });
      const text = await response.text();
      const parsed = (text ? JSON.parse(text) : {}) as T & { message?: string };
      if (!response.ok) {
        throw new DlocalApiError(parsed.message ?? `dLocal ${method} ${requestPath} failed: HTTP ${response.status}`, response.status, response.status >= 500);
      }
      return parsed;
    } catch (error) {
      if (error instanceof DlocalApiError) throw error;
      const aborted = (error as Error).name === "AbortError";
      this.logger.warn(`dLocal ${method} ${requestPath} ${aborted ? "timed out" : "network error"}: ${(error as Error).message}`);
      throw new DlocalApiError(aborted ? "dLocal request timed out" : "dLocal network error", 0, true);
    } finally {
      clearTimeout(timer);
    }
  }
}
```

- [ ] **Step 9: Run client tests**

Run: `pnpm -C apps/api exec jest src/rails/adapters/dlocal`
Expected: PASS (signature + client specs)

- [ ] **Step 10: Commit**
```bash
git add apps/api/src/rails/adapters/dlocal apps/api/nest-cli.json
git commit -m "Talk to dLocal with signed requests, or fixtures until keys exist"
```

---

### Task 6: dLocal rail adapter, registered as explicit-only

**Files:**
- Modify: `apps/api/src/rails/interfaces/payment-rail-adapter.interface.ts`
- Modify: `apps/api/src/rails/rail-registry.service.ts:24-28`
- Create: `apps/api/src/rails/adapters/dlocal/dlocal.adapter.ts`
- Modify: `apps/api/src/rails/rails.module.ts`
- Test: `apps/api/src/rails/adapters/dlocal/dlocal.adapter.spec.ts`
- Test: `apps/api/src/rails/rail-registry.service.spec.ts`

**Interfaces:**
- Consumes: `DlocalClientService` (Task 5)
- Produces:
  - `PaymentRailAdapter.explicitOnly?: boolean`
  - `RailAuthorizeRequest` gains optional `country?: string; payer?: { name: string; email: string; document?: string }`
  - `DlocalAdapter` (`railId: "dlocal"`, `explicitOnly: true`, `supportedMethodTypes: [CARD, LOCAL_METHOD]`)
  - `DlocalAdapter.toRailResult(payment: DlocalPayment): RailResult` (public, reused by webhook and reconciliation)
  - Card tokens prefixed `dlsf_` are Smart Fields tokens and use the `DIRECT` flow (used by Task 13)
  - `RailsModule` exports `DlocalAdapter` and `DlocalClientService`

- [ ] **Step 1: Write failing tests**

`dlocal.adapter.spec.ts`:
```ts
import { PaymentMethodType } from "@prisma/client";
import { DlocalAdapter } from "./dlocal.adapter";
import { DlocalApiError } from "./dlocal.types";

function makeAdapter(client: Record<string, jest.Mock> = {}) {
  const config = { get: jest.fn().mockReturnValue({ returnUrl: "https://checkout.test/" }) };
  return new DlocalAdapter(client as any, config as any);
}

const request = {
  paymentIntentId: "pi_1", amount: 10058, currency: "USD", idempotencyKey: "confirm_pi_1", country: "BR",
  payer: { name: "Ana", email: "ana@example.com", document: "12345678909" },
  paymentMethod: { type: PaymentMethodType.LOCAL_METHOD, token: "dlocal:PX", metadata: { dlocalPaymentMethodId: "PX" } },
};

describe("DlocalAdapter.toRailResult", () => {
  const adapter = makeAdapter();
  it.each([
    [{ status: "PAID" }, "succeeded"],
    [{ status: "AUTHORIZED" }, "succeeded"],
    [{ status: "PENDING", redirect_url: "https://x" }, "requires_action"],
    [{ status: "PENDING" }, "pending"],
    [{ status: "REJECTED", status_detail: "Insufficient funds" }, "failed"],
    [{ status: "CANCELLED" }, "failed"],
    [{ status: "EXPIRED" }, "failed"],
  ])("maps %o to %s", (partial, expected) => {
    const result = adapter.toRailResult({ id: "D-1", amount: 1, currency: "USD", ...partial } as any);
    expect(result.status).toBe(expected);
    expect(result.railReference).toBe("D-1");
  });

  it("carries the redirect URL and the decline reason", () => {
    expect(adapter.toRailResult({ id: "D-1", amount: 1, currency: "USD", status: "PENDING", redirect_url: "https://pay" } as any).actionRequired)
      .toEqual({ type: "redirect", data: { redirectUrl: "https://pay" } });
    expect(adapter.toRailResult({ id: "D-1", amount: 1, currency: "USD", status: "REJECTED", status_detail: "Insufficient funds" } as any).failureReason)
      .toBe("Insufficient funds");
  });
});

describe("DlocalAdapter.authorize", () => {
  it("creates a REDIRECT payment with the method id, country, payer and a return URL without secrets", async () => {
    const createPayment = jest.fn().mockResolvedValue({ id: "D-1", amount: 100.58, currency: "USD", status: "PENDING", redirect_url: "https://pay" });
    const result = await makeAdapter({ createPayment }).authorize(request);

    expect(createPayment).toHaveBeenCalledWith(expect.objectContaining({
      orderId: "pi_1", amountCents: 10058, currency: "USD", country: "BR", paymentMethodId: "PX", flow: "REDIRECT",
      payer: request.payer, callbackUrl: "https://checkout.test/?intl_return=1&pi=pi_1",
    }));
    expect(result.status).toBe("requires_action");
  });

  it("charges a Smart Fields token with the DIRECT flow", async () => {
    const createPayment = jest.fn().mockResolvedValue({ id: "D-9", amount: 100.58, currency: "USD", status: "PAID" });
    const result = await makeAdapter({ createPayment }).authorize({
      ...request,
      paymentMethod: { type: PaymentMethodType.CARD, token: "dlsf_CV-abc", metadata: { dlocalPaymentMethodId: "CARD" } },
    });
    expect(createPayment).toHaveBeenCalledWith(expect.objectContaining({ flow: "DIRECT", cardToken: "CV-abc" }));
    expect(result.status).toBe("succeeded");
  });

  it("fails without calling dLocal for non-USD, missing country, or missing method id", async () => {
    const createPayment = jest.fn();
    const adapter = makeAdapter({ createPayment });
    await expect(adapter.authorize({ ...request, currency: "BOB" })).resolves.toMatchObject({ status: "failed" });
    await expect(adapter.authorize({ ...request, country: undefined })).resolves.toMatchObject({ status: "failed" });
    await expect(adapter.authorize({ ...request, paymentMethod: { ...request.paymentMethod, metadata: {} } })).resolves.toMatchObject({ status: "failed" });
    expect(createPayment).not.toHaveBeenCalled();
  });

  it("returns pending keyed by order when dLocal's outcome is unknown", async () => {
    const createPayment = jest.fn().mockRejectedValue(new DlocalApiError("timed out", 0, true));
    await expect(makeAdapter({ createPayment }).authorize(request)).resolves.toMatchObject({ status: "pending", railReference: "order:pi_1" });
  });

  it("fails on a final dLocal error", async () => {
    const createPayment = jest.fn().mockRejectedValue(new DlocalApiError("Invalid document", 400, false));
    await expect(makeAdapter({ createPayment }).authorize(request)).resolves.toMatchObject({ status: "failed", failureReason: "Invalid document" });
  });
});
```
Append to `rail-registry.service.spec.ts` (add `import { RailRegistry } from "./rail-registry.service";` at the top if it isn't imported already):
```ts
describe("RailRegistry explicit-only adapters", () => {
  it("never resolves an explicit-only adapter by method type, but resolves it by id", () => {
    const mockCard = { railId: "mock_card", supportedMethodTypes: ["CARD"] } as any;
    const dlocal = { railId: "dlocal", explicitOnly: true, supportedMethodTypes: ["CARD", "LOCAL_METHOD"] } as any;
    const registry = new RailRegistry([dlocal, mockCard]);
    expect(registry.getForMethodType("CARD" as any)).toBe(mockCard);
    expect(() => registry.getForMethodType("LOCAL_METHOD" as any)).toThrow();
    expect(registry.get("dlocal")).toBe(dlocal);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm -C apps/api exec jest src/rails`
Expected: FAIL. The adapter module is missing, and the registry returns `dlocal` for CARD.

- [ ] **Step 3: Implement interface and registry changes**

In `payment-rail-adapter.interface.ts`, add to `RailAuthorizeRequest`:
```ts
  /** ISO-3166 alpha-2 shopper country; required by cross-border rails. */
  country?: string;
  payer?: { name: string; email: string; document?: string };
```
and to `PaymentRailAdapter`:
```ts
  /** Explicit-only rails are chosen by id (e.g. confirm with rail: "dlocal"), never by payment method type. */
  readonly explicitOnly?: boolean;
```
In `rail-registry.service.ts` `getForMethodType`:
```ts
    const adapter = [...this.byId.values()].find((a) => !a.explicitOnly && a.supportedMethodTypes.includes(type));
```

- [ ] **Step 4: Implement the adapter**

`dlocal.adapter.ts`:
```ts
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PaymentMethodType } from "@prisma/client";
import type { DlocalConfig } from "../../../config/configuration";
import {
  PaymentRailAdapter, RailAuthorizeRequest, RailCaptureRequest, RailRefundRequest, RailResult,
} from "../../interfaces/payment-rail-adapter.interface";
import { DlocalClientService } from "./dlocal-client.service";
import { DlocalApiError, DlocalPayment } from "./dlocal.types";

const SMART_FIELDS_PREFIX = "dlsf_";

@Injectable()
export class DlocalAdapter implements PaymentRailAdapter {
  readonly railId = "dlocal" as const;
  readonly explicitOnly = true;
  readonly supportedMethodTypes: PaymentMethodType[] = [PaymentMethodType.CARD, PaymentMethodType.LOCAL_METHOD];
  private readonly logger = new Logger(DlocalAdapter.name);

  constructor(
    private readonly client: DlocalClientService,
    private readonly config: ConfigService,
  ) {}

  toRailResult(payment: DlocalPayment): RailResult {
    const raw = { ...payment } as Record<string, unknown>;
    switch (payment.status) {
      case "PAID":
      case "AUTHORIZED":
        return { status: "succeeded", railReference: payment.id, raw };
      case "PENDING":
        return payment.redirect_url
          ? { status: "requires_action", railReference: payment.id, raw, actionRequired: { type: "redirect", data: { redirectUrl: payment.redirect_url } } }
          : { status: "pending", railReference: payment.id, raw };
      default:
        return { status: "failed", railReference: payment.id, raw, failureReason: payment.status_detail ?? `dlocal_${String(payment.status).toLowerCase()}` };
    }
  }

  async authorize(req: RailAuthorizeRequest): Promise<RailResult> {
    const methodId = req.paymentMethod.metadata?.dlocalPaymentMethodId;
    const invalid =
      req.currency !== "USD" ? `dLocal charges USD only, got ${req.currency}`
      : !req.country || !/^[A-Z]{2}$/.test(req.country) ? "Falta el país del comprador"
      : typeof methodId !== "string" || !methodId ? "Falta el método de pago internacional"
      : null;
    if (invalid) return { status: "failed", railReference: req.idempotencyKey, raw: {}, failureReason: invalid };

    const cfg = this.config.get<DlocalConfig>("app.dlocal")!;
    const callbackUrl = new URL(cfg.returnUrl);
    callbackUrl.searchParams.set("intl_return", "1");
    callbackUrl.searchParams.set("pi", req.paymentIntentId);
    const cardToken =
      req.paymentMethod.type === PaymentMethodType.CARD && req.paymentMethod.token.startsWith(SMART_FIELDS_PREFIX)
        ? req.paymentMethod.token.slice(SMART_FIELDS_PREFIX.length)
        : undefined;

    try {
      const payment = await this.client.createPayment({
        orderId: req.paymentIntentId,
        amountCents: req.amount,
        currency: "USD",
        country: req.country!,
        paymentMethodId: methodId as string,
        flow: cardToken ? "DIRECT" : "REDIRECT",
        payer: req.payer ?? { name: "", email: "" },
        cardToken,
        callbackUrl: callbackUrl.toString(),
      });
      return this.toRailResult(payment);
    } catch (error) {
      if (error instanceof DlocalApiError && error.retryable) {
        this.logger.warn(`dLocal outcome unknown for ${req.paymentIntentId}; waiting for webhook`);
        return { status: "pending", railReference: `order:${req.paymentIntentId}`, raw: { error: error.message } };
      }
      return { status: "failed", railReference: req.idempotencyKey, raw: { error: (error as Error).message }, failureReason: (error as Error).message };
    }
  }

  /** dLocal captures on payment; capture only reports the current state. */
  async capture(req: RailCaptureRequest): Promise<RailResult> {
    return this.getStatus(req.railReference);
  }

  async refund(req: RailRefundRequest): Promise<RailResult> {
    try {
      const refund = await this.client.refund(req.railReference, req.amount, "USD");
      const status = refund.status === "SUCCESS" ? "succeeded" : refund.status === "REJECTED" ? "failed" : "pending";
      return { status, railReference: refund.id, raw: { ...refund } };
    } catch (error) {
      return { status: "failed", railReference: req.idempotencyKey, raw: { error: (error as Error).message }, failureReason: (error as Error).message };
    }
  }

  async getStatus(railReference: string): Promise<RailResult> {
    return this.toRailResult(await this.client.getPayment(railReference));
  }
}
```
Use the refund statuses confirmed in Task 1 (`SUCCESS`/`PENDING`/`REJECTED` assumed).

- [ ] **Step 5: Register in RailsModule.** In `rails.module.ts`:
  - Import `DlocalClientService` and `DlocalAdapter`, and add both to `providers`.
  - Add `dlocal: DlocalAdapter` as a factory param (before `config`), with `DlocalAdapter` in `inject` before `ConfigService`.
  - Return `[card, tigo, bank, qr, dlocal]`.
  - Change `exports` to `[RailRegistry, DlocalAdapter, DlocalClientService]`.

- [ ] **Step 6: Run tests and typecheck**

Run: `pnpm -C apps/api exec jest src/rails && pnpm -C apps/api exec tsc --noEmit -p tsconfig.json`
Expected: PASS, no type errors.

- [ ] **Step 7: Commit**
```bash
git add apps/api/src/rails
git commit -m "Add a dLocal rail that is only used when asked for by name"
```

---

### Task 7: Confirm through dLocal (eligibility, FX, pricing, invoice)

**Files:**
- Create: `apps/api/src/international/fx.ts`
- Test: `apps/api/src/international/fx.spec.ts`
- Modify: `apps/api/src/payment-intents/dto/confirm-payment-intent.dto.ts`
- Modify: `apps/api/src/payment-intents/payment-intents.service.ts` (constructor ~line 108; `confirm` 292-400; capture journal ~498; `enqueueInvoice` ~509)
- Modify: `apps/api/src/refunds/refunds.service.ts:118-124` (and its constructor)
- Test: `apps/api/src/payment-intents/payment-intents.service.spec.ts`

**Interfaces:**
- Consumes: `DlocalConfig` (Task 2), `FeePricing`/`DOMESTIC_PRICING` (Task 4), `RailAuthorizeRequest.country/payer` and `explicitOnly` (Task 6)
- Produces:
  ```ts
  // fx.ts
  export interface FxSnapshot { originalAmount: number; originalCurrency: "BOB"; rate: number; convertedAt: string }
  export class FxRateUnavailableError extends Error {}
  export function resolveChargeAmount(current: { amount: number; currency: string; metadata: unknown }, international: boolean, bobPerUsd: number, now: Date): { amount: number; currency: string; fx: FxSnapshot | null }
  export function pricingForRail(railId: string, cfg: Pick<DlocalConfig, "intlFeeBps" | "costBps">): FeePricing
  export function invoiceAmountFor(intent: { amount: number; currency: string; metadata: unknown }): { amount: number; currency: string }
  ```
  - `ConfirmPaymentIntentDto.rail?: "dlocal"`, `ConfirmPaymentIntentDto.country?: string`
  - `PaymentIntentsService` constructor gains a last param `config: ConfigService`
  - `RefundsService` constructor gains a last param `config: ConfigService`

- [ ] **Step 1: Write failing FX tests**

`apps/api/src/international/fx.spec.ts`:
```ts
import { FxRateUnavailableError, invoiceAmountFor, pricingForRail, resolveChargeAmount } from "./fx";

const now = new Date("2026-09-17T12:00:00.000Z");

describe("resolveChargeAmount", () => {
  it("converts BOB cents to USD cents, rounding up, and snapshots the rate", () => {
    expect(resolveChargeAmount({ amount: 70000, currency: "BOB", metadata: {} }, true, 6.96, now)).toEqual({
      amount: 10058, currency: "USD",
      fx: { originalAmount: 70000, originalCurrency: "BOB", rate: 6.96, convertedAt: "2026-09-17T12:00:00.000Z" },
    });
  });

  it("re-converts from the original BOB amount on a retry, never from the already-converted USD", () => {
    const retried = { amount: 10058, currency: "USD", metadata: { fx: { originalAmount: 70000, originalCurrency: "BOB", rate: 6.96, convertedAt: "x" } } };
    expect(resolveChargeAmount(retried, true, 7, now)).toMatchObject({ amount: 10000, currency: "USD", fx: { originalAmount: 70000, rate: 7 } });
  });

  it("restores the BOB amount when a converted intent is retried domestically", () => {
    const retried = { amount: 10058, currency: "USD", metadata: { fx: { originalAmount: 70000, originalCurrency: "BOB", rate: 6.96, convertedAt: "x" } } };
    expect(resolveChargeAmount(retried, false, 6.96, now)).toEqual({ amount: 70000, currency: "BOB", fx: null });
  });

  it("leaves USD intents unconverted and domestic intents untouched", () => {
    expect(resolveChargeAmount({ amount: 500, currency: "USD", metadata: null }, true, 6.96, now)).toEqual({ amount: 500, currency: "USD", fx: null });
    expect(resolveChargeAmount({ amount: 500, currency: "BOB", metadata: null }, false, 0, now)).toEqual({ amount: 500, currency: "BOB", fx: null });
  });

  it("refuses to convert without a rate", () => {
    expect(() => resolveChargeAmount({ amount: 500, currency: "BOB", metadata: null }, true, 0, now)).toThrow(FxRateUnavailableError);
  });
});

describe("pricingForRail / invoiceAmountFor", () => {
  it("uses international pricing only for dlocal", () => {
    expect(pricingForRail("dlocal", { intlFeeBps: 590, costBps: 420 })).toEqual({ feeBps: 590, railCostBps: 420 });
    expect(pricingForRail("mock_card", { intlFeeBps: 590, costBps: 420 })).toEqual({ feeBps: 250, railCostBps: 0 });
  });

  it("invoices converted intents in the original BOB amount", () => {
    expect(invoiceAmountFor({ amount: 10058, currency: "USD", metadata: { fx: { originalAmount: 70000, originalCurrency: "BOB" } } })).toEqual({ amount: 70000, currency: "BOB" });
    expect(invoiceAmountFor({ amount: 500, currency: "BOB", metadata: {} })).toEqual({ amount: 500, currency: "BOB" });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm -C apps/api exec jest src/international/fx.spec.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `fx.ts`**
```ts
import type { DlocalConfig } from "../config/configuration";
import { DOMESTIC_PRICING, FeePricing } from "../ledger/ledger.constants";

export interface FxSnapshot {
  originalAmount: number;
  originalCurrency: "BOB";
  rate: number;
  convertedAt: string;
}

export class FxRateUnavailableError extends Error {
  constructor() {
    super("intl_fx_rate_unavailable");
    this.name = "FxRateUnavailableError";
  }
}

function fxOf(metadata: unknown): FxSnapshot | null {
  const fx = (metadata as { fx?: FxSnapshot } | null)?.fx;
  return fx && typeof fx.originalAmount === "number" && fx.originalCurrency === "BOB" ? fx : null;
}

/**
 * The amount/currency a confirm attempt should charge. Always starts from the
 * merchant's original price, so retries never compound a conversion.
 */
export function resolveChargeAmount(
  current: { amount: number; currency: string; metadata: unknown },
  international: boolean,
  bobPerUsd: number,
  now: Date,
): { amount: number; currency: string; fx: FxSnapshot | null } {
  const previous = fxOf(current.metadata);
  const base = previous ? { amount: previous.originalAmount, currency: "BOB" } : { amount: current.amount, currency: current.currency };
  if (!international || base.currency !== "BOB") return { ...base, fx: null };
  if (!(bobPerUsd > 0)) throw new FxRateUnavailableError();
  return {
    amount: Math.ceil(base.amount / bobPerUsd),
    currency: "USD",
    fx: { originalAmount: base.amount, originalCurrency: "BOB", rate: bobPerUsd, convertedAt: now.toISOString() },
  };
}

export function pricingForRail(railId: string, cfg: Pick<DlocalConfig, "intlFeeBps" | "costBps">): FeePricing {
  return railId === "dlocal" ? { feeBps: cfg.intlFeeBps, railCostBps: cfg.costBps } : DOMESTIC_PRICING;
}

/** The Factura is a Bolivian tax document: emit it in the price the merchant set. */
export function invoiceAmountFor(intent: { amount: number; currency: string; metadata: unknown }): { amount: number; currency: string } {
  const fx = fxOf(intent.metadata);
  return fx ? { amount: fx.originalAmount, currency: "BOB" } : { amount: intent.amount, currency: intent.currency };
}
```

- [ ] **Step 4: Run FX tests**

Run: `pnpm -C apps/api exec jest src/international/fx.spec.ts`
Expected: PASS

- [ ] **Step 5: Extend the confirm DTO.** In `confirm-payment-intent.dto.ts` add `IsIn, Matches` to the class-validator import and, in `ConfirmPaymentIntentDto`:
```ts
  @ApiPropertyOptional({ enum: ["dlocal"], description: "Route this payment through an international rail instead of the domestic one for the method type." })
  @IsOptional()
  @IsIn(["dlocal"])
  rail?: "dlocal";

  @ApiPropertyOptional({ description: "Shopper's ISO-3166 alpha-2 country, required with rail=dlocal.", example: "BR" })
  @IsOptional()
  @Matches(/^[A-Z]{2}$/)
  country?: string;
```

- [ ] **Step 6: Write failing service tests.** First read the `PaymentIntentsService` constructor (~line 108) to learn the real parameter order. Then append to `payment-intents.service.spec.ts`, placing `prisma`, `railRegistry` and `paymentMethods` in their real positions and `{} as any` elsewhere, with `config` last:
```ts
describe("PaymentIntentsService.confirm via dLocal", () => {
  const dlocalCfg = { bobPerUsd: 6.96, intlFeeBps: 590, costBps: 420 };

  function setup(merchant: Record<string, unknown>, intent: Record<string, unknown> = {}) {
    const row = { id: "pi_1", status: "REQUIRES_PAYMENT_METHOD", confirmationAttempts: 0, merchantId: "m_1", consumerUserId: null, metadata: {}, amount: 70000, currency: "BOB", ...intent };
    const update = jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...row, ...data, id: "pi_1", merchantId: "m_1" }));
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([row]),
      paymentIntent: { update },
      merchant: { findUniqueOrThrow: jest.fn().mockResolvedValue({ id: "m_1", settlementMode: "AGGREGATOR", internationalPaymentsStatus: "ENABLED", ...merchant }) },
      consumerUser: { findFirst: jest.fn().mockResolvedValue(null) },
      storeOrder: { updateMany: jest.fn() },
    };
    const prisma = { $transaction: jest.fn((cb) => cb(tx)) };
    const dlocal = { railId: "dlocal", authorize: jest.fn().mockResolvedValue({ status: "requires_action", railReference: "D-1", raw: {} }) };
    const railRegistry = { get: jest.fn().mockReturnValue(dlocal), getForMethodType: jest.fn() };
    const paymentMethods = { findOrCreate: jest.fn().mockResolvedValue({ id: "pm_1", type: "LOCAL_METHOD" }) };
    const config = { get: jest.fn().mockReturnValue(dlocalCfg) };
    // Reorder to the real constructor signature; config is always last.
    const service = new PaymentIntentsService(prisma as any, railRegistry as any, paymentMethods as any, {} as any, {} as any, {} as any, {} as any, config as any);
    jest.spyOn(service as any, "assertCartStillAvailable").mockResolvedValue(undefined);
    jest.spyOn(service as any, "reserveLocationStockForCart").mockResolvedValue(false);
    jest.spyOn(service as any, "applyRailResult").mockResolvedValue({ paymentIntent: {}, railResult: {} });
    return { service, update, dlocal, railRegistry };
  }

  const dto = {
    rail: "dlocal" as const, country: "BR", customerName: "Ana", customerEmail: "ana@example.com", customerDocument: "12345678909",
    paymentMethod: { type: "LOCAL_METHOD" as any, token: "dlocal:PX", metadata: { dlocalPaymentMethodId: "PX" } },
  };

  it("converts to USD, stores the FX snapshot, and authorizes on the dlocal rail with country and payer", async () => {
    const { service, update, dlocal, railRegistry } = setup({});
    await service.confirm("pi_1", dto as any);

    expect(railRegistry.getForMethodType).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        amount: 10058, currency: "USD", railId: "dlocal",
        metadata: expect.objectContaining({ fx: expect.objectContaining({ originalAmount: 70000, rate: 6.96 }) }),
      }),
    }));
    expect(dlocal.authorize).toHaveBeenCalledWith(expect.objectContaining({
      amount: 10058, currency: "USD", country: "BR", payer: { name: "Ana", email: "ana@example.com", document: "12345678909" },
    }));
  });

  it("rejects merchants that are not enabled, or not AGGREGATOR", async () => {
    await expect(setup({ internationalPaymentsStatus: "REQUESTED" }).service.confirm("pi_1", dto as any)).rejects.toThrow("pagos internacionales");
    await expect(setup({ settlementMode: "FACILITATOR" }).service.confirm("pi_1", dto as any)).rejects.toThrow("pagos internacionales");
  });

  it("requires a country and a shopper email", async () => {
    await expect(setup({}).service.confirm("pi_1", { ...dto, country: undefined } as any)).rejects.toThrow("país");
    await expect(setup({}).service.confirm("pi_1", { ...dto, customerEmail: undefined } as any)).rejects.toThrow("correo");
  });
});
```

- [ ] **Step 7: Run to verify failure**

Run: `pnpm -C apps/api exec jest src/payment-intents/payment-intents.service.spec.ts -t "via dLocal"`
Expected: FAIL. `railRegistry.getForMethodType` is called, and there is no conversion.

- [ ] **Step 8: Implement in `payment-intents.service.ts`**

1. Imports: `ConfigService` from `@nestjs/config`; add `ForbiddenException`, `ConflictException` to the `@nestjs/common` import; `type { DlocalConfig }` from `../config/configuration`; `FxRateUnavailableError, invoiceAmountFor, pricingForRail, resolveChargeAmount` from `../international/fx`.
2. Constructor: append `private readonly config: ConfigService,` as the last parameter.
3. In `confirm`, extend the `SELECT` to `SELECT id, status, "confirmationAttempts", "merchantId", "consumerUserId", metadata, amount, currency FROM …` and add `amount: number; currency: string` to the row type.
4. Replace `const rail = this.railRegistry.getForMethodType(paymentMethod.type);` with:
```ts
      const international = dto.rail === "dlocal";
      if (international) {
        const merchant = await tx.merchant.findUniqueOrThrow({ where: { id: current.merchantId } });
        if (merchant.internationalPaymentsStatus !== "ENABLED" || merchant.settlementMode !== "AGGREGATOR") {
          throw new ForbiddenException("Este comercio no tiene habilitados los pagos internacionales.");
        }
        if (!dto.country) throw new BadRequestException("Elige el país desde el que pagas.");
        if (!dto.customerEmail) throw new BadRequestException("Ingresa tu correo para pagar desde el exterior.");
      }
      const rail = international ? this.railRegistry.get("dlocal") : this.railRegistry.getForMethodType(paymentMethod.type);
      let charge: ReturnType<typeof resolveChargeAmount>;
      try {
        charge = resolveChargeAmount(current, international, this.config.get<DlocalConfig>("app.dlocal")!.bobPerUsd, new Date());
      } catch (error) {
        if (error instanceof FxRateUnavailableError) throw new ConflictException("intl_fx_rate_unavailable");
        throw error;
      }
```
5. In the `tx.paymentIntent.update` data, add `amount: charge.amount, currency: charge.currency,` and change the metadata line to:
```ts
          metadata: {
            ...currentMetadata,
            delivery,
            ...(locationStockReserved ? { locationStockReserved: true } : {}),
            fx: charge.fx,
            ...(international ? { dlocalCostEstimated: true, intlCountry: dto.country } : {}),
          } as Prisma.InputJsonValue,
```
6. Add these fields to the transaction's return value, and destructure them next to `intentId, railId, amount, currency, merchantId`:
```ts
        country: dto.country,
        payer: international
          ? { name: updated.customerName ?? "", email: updated.customerEmail ?? "", document: updated.customerDocument ?? undefined }
          : undefined,
```
Pass `country, payer` into `rail.authorize({ … })`.
7. In `applyRailResult`, change the capture journal call to:
```ts
        const lines = this.ledger.buildCaptureJournal({
          merchantId,
          transactionId: transactionRow.id,
          amount: current.amount,
          settlementMode: merchant.settlementMode,
          pricing: pricingForRail(railId, this.config.get<DlocalConfig>("app.dlocal")!),
        });
```
and the invoice call to:
```ts
        const invoiceAmount = invoiceAmountFor({ amount: updated.amount, currency: updated.currency, metadata: current.metadata });
        await this.invoicing.enqueueInvoice(tx, merchantId, {
          paymentIntentId: updated.id,
          amount: Number((currentMetadata.storeCredit as Prisma.JsonObject)?.orderTotal) || invoiceAmount.amount,
          currency: invoiceAmount.currency,
          customerName: current.customerName,
          customerDocument: current.customerDocument,
        });
```
8. Update every other `new PaymentIntentsService(...)` in specs to pass a final argument `{ get: jest.fn().mockReturnValue({ bobPerUsd: 0, intlFeeBps: 590, costBps: 0 }) } as any`. Find them with `grep -rn "new PaymentIntentsService" apps/api/src apps/api/test`.

- [ ] **Step 9: Refund pricing.** In `refunds.service.ts` add `private readonly config: ConfigService` as the last constructor param, import `pricingForRail` and `DlocalConfig`, and change the journal call at ~line 118 to:
```ts
        const lines = this.ledger.buildRefundJournal({
          merchantId,
          transactionId: refundTransaction.id,
          amount: refundTransaction.amount,
          settlementMode: merchant.settlementMode,
          pricing: pricingForRail(reservation.originalTransaction.railId, this.config.get<DlocalConfig>("app.dlocal")!),
        });
```
Update `new RefundsService(` calls in specs the same way (`grep -rn "new RefundsService" apps/api/src apps/api/test`).

- [ ] **Step 10: Run tests and typecheck**

Run: `pnpm -C apps/api exec jest src/payment-intents src/refunds src/international && pnpm -C apps/api exec tsc --noEmit -p tsconfig.json`
Expected: PASS, no type errors.

- [ ] **Step 11: Commit**
```bash
git add apps/api/src/international/fx.ts apps/api/src/international/fx.spec.ts apps/api/src/payment-intents/dto/confirm-payment-intent.dto.ts apps/api/src/payment-intents/payment-intents.service.ts apps/api/src/payment-intents/payment-intents.service.spec.ts apps/api/src/refunds
git commit -m "Charge approved merchants' foreign shoppers in USD through dLocal"
```

---

### Task 8: dLocal webhook

**Files:**
- Modify: `apps/api/src/main.ts:78`
- Create: `apps/api/src/payment-intents/dlocal-webhook.controller.ts`
- Modify: `apps/api/src/payment-intents/payment-intents.module.ts`
- Test: `apps/api/src/payment-intents/dlocal-webhook.controller.spec.ts`

**Interfaces:**
- Consumes: `DlocalClientService.verifyWebhook`, `DlocalAdapter.toRailResult` (Tasks 5, 6), `PaymentIntentsService.applyCallbackResult` (existing)
- Produces: `POST /v1/webhooks/dlocal/payments` → `200 { received: true }` | `401`

- [ ] **Step 1: Write failing tests**

`dlocal-webhook.controller.spec.ts`:
```ts
import { NotFoundException, UnauthorizedException } from "@nestjs/common";
import { DlocalWebhookController } from "./dlocal-webhook.controller";
import { IllegalStateTransitionError } from "./payment-intent.state-machine";

const paidBody = JSON.stringify({ id: "D-1", order_id: "pi_1", amount: 100.58, currency: "USD", status: "PAID" });

function setup(verify = true) {
  const client = { verifyWebhook: jest.fn().mockReturnValue(verify) };
  const adapter = {
    toRailResult: jest.fn((p) => ({ status: p.status === "PAID" ? "succeeded" : p.status === "PENDING" ? "pending" : "failed", railReference: p.id, raw: p })),
  };
  const paymentIntents = { applyCallbackResult: jest.fn().mockResolvedValue({}) };
  const controller = new DlocalWebhookController(client as any, adapter as any, paymentIntents as any);
  const req = (body: string) => ({ rawBody: Buffer.from(body) }) as any;
  return { controller, client, paymentIntents, req };
}

describe("DlocalWebhookController", () => {
  it("rejects an invalid signature without touching the payment", async () => {
    const { controller, paymentIntents, req } = setup(false);
    await expect(controller.payment(req(paidBody), "l", "d", "sig")).rejects.toBeInstanceOf(UnauthorizedException);
    expect(paymentIntents.applyCallbackResult).not.toHaveBeenCalled();
  });

  it("rejects a request without raw bytes", async () => {
    const { controller } = setup();
    await expect(controller.payment({} as any, "l", "d", "sig")).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("applies a paid notification with rail, amount in cents and currency expectations", async () => {
    const { controller, paymentIntents, req, client } = setup();
    await expect(controller.payment(req(paidBody), "l", "d", "sig")).resolves.toEqual({ received: true });
    expect(client.verifyWebhook).toHaveBeenCalledWith("l", "d", paidBody, "sig");
    expect(paymentIntents.applyCallbackResult).toHaveBeenCalledWith(
      "pi_1", expect.objectContaining({ status: "succeeded", railReference: "D-1" }), { railId: "dlocal", amount: 10058, currency: "USD" },
    );
  });

  it("acknowledges pending notifications and notifications without order_id, without a state change", async () => {
    const { controller, paymentIntents, req } = setup();
    await controller.payment(req(JSON.stringify({ id: "D-1", order_id: "pi_1", amount: 1, currency: "USD", status: "PENDING" })), "l", "d", "sig");
    await controller.payment(req(JSON.stringify({ id: "D-1", status: "PAID" })), "l", "d", "sig");
    expect(paymentIntents.applyCallbackResult).not.toHaveBeenCalled();
  });

  it("acknowledges unknown intents and impossible transitions so dLocal stops retrying", async () => {
    const { controller, paymentIntents, req } = setup();
    paymentIntents.applyCallbackResult.mockRejectedValueOnce(new NotFoundException());
    await expect(controller.payment(req(paidBody), "l", "d", "sig")).resolves.toEqual({ received: true });
    paymentIntents.applyCallbackResult.mockRejectedValueOnce(new IllegalStateTransitionError("SUCCEEDED" as any, "RAIL_CALLBACK_FAILED" as any));
    await expect(controller.payment(req(paidBody), "l", "d", "sig")).resolves.toEqual({ received: true });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm -C apps/api exec jest src/payment-intents/dlocal-webhook.controller.spec.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Capture raw bytes for this route only.** In `main.ts` replace `app.use(json({ limit: "1mb", strict: true, reviver: safeJsonReviver }));` with:
```ts
  app.use(json({
    limit: "1mb",
    strict: true,
    reviver: safeJsonReviver,
    // Signed webhooks are verified over the exact bytes received, not a re-serialization.
    verify: (req: Request & { rawBody?: Buffer }, _res, buf) => {
      if (req.url?.startsWith("/v1/webhooks/dlocal/")) req.rawBody = Buffer.from(buf);
    },
  }));
```

- [ ] **Step 4: Implement the controller**

`dlocal-webhook.controller.ts`:
```ts
import { Controller, Headers, HttpCode, Logger, NotFoundException, Post, Req, UnauthorizedException } from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import { DlocalClientService } from "../rails/adapters/dlocal/dlocal-client.service";
import { DlocalAdapter } from "../rails/adapters/dlocal/dlocal.adapter";
import type { DlocalPayment } from "../rails/adapters/dlocal/dlocal.types";
import { IllegalStateTransitionError } from "./payment-intent.state-machine";
import { PaymentIntentsService } from "./payment-intents.service";

/**
 * dLocal's payment notifications. The webhook is the source of truth for
 * redirect and voucher payments; the checkout return page only reads status.
 * order_id is always the PaymentIntent id we sent, so no mapping table is needed.
 */
@ApiExcludeController()
@Controller("v1/webhooks/dlocal")
export class DlocalWebhookController {
  private readonly logger = new Logger(DlocalWebhookController.name);

  constructor(
    private readonly client: DlocalClientService,
    private readonly adapter: DlocalAdapter,
    private readonly paymentIntents: PaymentIntentsService,
  ) {}

  @Post("payments")
  @HttpCode(200)
  async payment(
    @Req() req: { rawBody?: Buffer },
    @Headers("x-login") login: string | undefined,
    @Headers("x-date") xDate: string | undefined,
    @Headers("authorization") authorization: string | undefined,
  ) {
    const raw = req.rawBody?.toString("utf8");
    if (!raw || !this.client.verifyWebhook(login, xDate, raw, authorization)) {
      throw new UnauthorizedException("Invalid dLocal signature");
    }

    const payment = JSON.parse(raw) as DlocalPayment;
    if (!payment.order_id) {
      this.logger.warn(`dLocal notification ${payment.id} has no order_id; ignoring`);
      return { received: true };
    }

    const result = this.adapter.toRailResult(payment);
    if (result.status === "pending" || result.status === "requires_action") return { received: true };

    try {
      await this.paymentIntents.applyCallbackResult(payment.order_id, result, {
        railId: "dlocal",
        amount: Math.round(Number(payment.amount) * 100),
        currency: payment.currency,
      });
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof IllegalStateTransitionError) {
        this.logger.warn(`dLocal notification ${payment.id} for ${payment.order_id} not applied: ${(error as Error).message}`);
        return { received: true };
      }
      throw error;
    }
    return { received: true };
  }
}
```
In `payment-intents.module.ts`, import `DlocalWebhookController` and add it to `controllers`. `RailsModule` is already imported and now exports the adapter and client.

- [ ] **Step 5: Run tests and typecheck**

Run: `pnpm -C apps/api exec jest src/payment-intents/dlocal-webhook.controller.spec.ts && pnpm -C apps/api exec tsc --noEmit -p tsconfig.json`
Expected: PASS

- [ ] **Step 6: Commit**
```bash
git add apps/api/src/main.ts apps/api/src/payment-intents/dlocal-webhook.controller.ts apps/api/src/payment-intents/dlocal-webhook.controller.spec.ts apps/api/src/payment-intents/payment-intents.module.ts
git commit -m "Let dLocal's signed notifications settle international payments"
```

---

### Task 9: Reconciliation worker

**Files:**
- Create: `apps/api/src/payment-intents/dlocal-reconciliation.worker.ts`
- Modify: `apps/api/src/payment-intents/payment-intents.module.ts`
- Test: `apps/api/src/payment-intents/dlocal-reconciliation.worker.spec.ts`

**Interfaces:**
- Consumes: `DlocalAdapter.getStatus` (Task 6), `PaymentIntentsService.applyCallbackResult`
- Produces: `DlocalReconciliationWorker.tick(now?: Date): Promise<void>` (`@Interval("dlocal-reconciliation", 15 * 60_000)`)

- [ ] **Step 1: Write failing tests**

`dlocal-reconciliation.worker.spec.ts`:
```ts
import { DlocalReconciliationWorker } from "./dlocal-reconciliation.worker";

function setup(intents: unknown[]) {
  const prisma = { paymentIntent: { findMany: jest.fn().mockResolvedValue(intents) } };
  const adapter = { getStatus: jest.fn() };
  const paymentIntents = { applyCallbackResult: jest.fn().mockResolvedValue({}) };
  return { worker: new DlocalReconciliationWorker(prisma as any, adapter as any, paymentIntents as any), prisma, adapter, paymentIntents };
}

describe("DlocalReconciliationWorker", () => {
  const now = new Date("2026-09-17T12:00:00.000Z");

  it("queries stale dlocal intents with the right cutoffs", async () => {
    const { worker, prisma } = setup([]);
    await worker.tick(now);
    expect(prisma.paymentIntent.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        railId: "dlocal",
        OR: [
          { status: "PROCESSING", updatedAt: { lt: new Date("2026-09-17T11:45:00.000Z") } },
          { status: "REQUIRES_ACTION", updatedAt: { lt: new Date("2026-09-17T11:00:00.000Z") } },
        ],
      },
      take: 50,
    }));
  });

  it("applies final statuses, skips pending ones and order: references", async () => {
    const { worker, adapter, paymentIntents } = setup([
      { id: "pi_paid", transactions: [{ railReference: "D-1" }] },
      { id: "pi_wait", transactions: [{ railReference: "D-2" }] },
      { id: "pi_unknown", transactions: [{ railReference: "order:pi_unknown" }] },
      { id: "pi_none", transactions: [] },
    ]);
    adapter.getStatus.mockImplementation(async (ref: string) =>
      ref === "D-1" ? { status: "succeeded", railReference: "D-1", raw: {} } : { status: "pending", railReference: ref, raw: {} });

    await worker.tick(now);

    expect(adapter.getStatus).toHaveBeenCalledTimes(2);
    expect(paymentIntents.applyCallbackResult).toHaveBeenCalledTimes(1);
    expect(paymentIntents.applyCallbackResult).toHaveBeenCalledWith("pi_paid", expect.objectContaining({ status: "succeeded" }), { railId: "dlocal" });
  });

  it("keeps going when one intent fails", async () => {
    const { worker, adapter, paymentIntents } = setup([
      { id: "pi_a", transactions: [{ railReference: "D-a" }] },
      { id: "pi_b", transactions: [{ railReference: "D-b" }] },
    ]);
    adapter.getStatus.mockRejectedValueOnce(new Error("dLocal down")).mockResolvedValueOnce({ status: "failed", railReference: "D-b", raw: {} });
    await worker.tick(now);
    expect(paymentIntents.applyCallbackResult).toHaveBeenCalledWith("pi_b", expect.anything(), { railId: "dlocal" });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm -C apps/api exec jest src/payment-intents/dlocal-reconciliation.worker.spec.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

`dlocal-reconciliation.worker.ts`:
```ts
import { Injectable, Logger } from "@nestjs/common";
import { Interval } from "@nestjs/schedule";
import { PrismaService } from "../prisma/prisma.service";
import { DlocalAdapter } from "../rails/adapters/dlocal/dlocal.adapter";
import { PaymentIntentsService } from "./payment-intents.service";

const PROCESSING_STALE_MS = 15 * 60_000;
const ACTION_STALE_MS = 60 * 60_000;

/**
 * Safety net for missed dLocal webhooks. Intents whose authorize call timed out
 * carry "order:<id>" instead of a dLocal id and can only be resolved by the
 * webhook, so they're skipped here.
 */
@Injectable()
export class DlocalReconciliationWorker {
  private readonly logger = new Logger(DlocalReconciliationWorker.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly adapter: DlocalAdapter,
    private readonly paymentIntents: PaymentIntentsService,
  ) {}

  @Interval("dlocal-reconciliation", 15 * 60_000)
  async tick(now: Date = new Date()): Promise<void> {
    const intents = await this.prisma.paymentIntent.findMany({
      where: {
        railId: "dlocal",
        OR: [
          { status: "PROCESSING", updatedAt: { lt: new Date(now.getTime() - PROCESSING_STALE_MS) } },
          { status: "REQUIRES_ACTION", updatedAt: { lt: new Date(now.getTime() - ACTION_STALE_MS) } },
        ],
      },
      select: { id: true, transactions: { orderBy: { createdAt: "desc" }, take: 1, select: { railReference: true } } },
      orderBy: { updatedAt: "asc" },
      take: 50,
    });

    for (const intent of intents) {
      const reference = intent.transactions[0]?.railReference;
      if (!reference || reference.startsWith("order:")) continue;
      try {
        const result = await this.adapter.getStatus(reference);
        if (result.status === "pending" || result.status === "requires_action") continue;
        await this.paymentIntents.applyCallbackResult(intent.id, result, { railId: "dlocal" });
      } catch (error) {
        this.logger.warn(`dLocal reconciliation for ${intent.id} failed: ${(error as Error).message}`);
      }
    }
  }
}
```
Add `DlocalReconciliationWorker` to `providers` in `payment-intents.module.ts`. If `PrismaService` isn't globally provided (`grep -n "Global" apps/api/src/prisma/prisma.module.ts`), add `PrismaModule` to `imports`.

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm -C apps/api exec jest src/payment-intents/dlocal-reconciliation.worker.spec.ts && pnpm -C apps/api exec tsc --noEmit -p tsconfig.json`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add apps/api/src/payment-intents/dlocal-reconciliation.worker.ts apps/api/src/payment-intents/dlocal-reconciliation.worker.spec.ts apps/api/src/payment-intents/payment-intents.module.ts
git commit -m "Recover international payments whose notification never arrived"
```

---

### Task 10: Opt-in, ops approval, USD payout account, checkout methods API

**Files:**
- Create: `apps/api/src/international/international-payments.service.ts`
- Create: `apps/api/src/international/international-payments.controller.ts` (merchant + checkout routes)
- Create: `apps/api/src/international/ops-international-payments.controller.ts`
- Create: `apps/api/src/international/dto/international-action.dto.ts`
- Create: `apps/api/src/international/dto/international-methods.dto.ts`
- Create: `apps/api/src/international/international.module.ts`
- Modify: `apps/api/src/app.module.ts` (register module)
- Modify: `apps/api/src/merchants/dto/submit-kyc.dto.ts` and `apps/api/src/merchants/kyc.service.ts` (`payoutUsdBankAccount`)
- Modify: `apps/api/src/payment-intents/checkout-session.controller.ts` and `payment-intents.module.ts` (session `international` flag)
- Modify: `apps/checkout/src/api.ts` (`CheckoutSession.international`)
- Test: `apps/api/src/international/international-payments.service.spec.ts`

**Interfaces:**
- Consumes: `DlocalClientService.listPaymentMethods` (Task 5), `resolveChargeAmount` (Task 7), `AuditLogService.record`, `actorLabel`, `SupportActor` (existing ops)
- Produces:
  - `InternationalPaymentsService.statusFor(merchantId): Promise<{ status; settlementMode; feeBps: number; fxRateAvailable: boolean; usdPayoutAccountOnFile: boolean; note: string | null }>`
  - `.request(merchantId): Promise<{ status: "REQUESTED" }>` (400 unless AGGREGATOR, 409 if already ENABLED/REQUESTED)
  - `.listRequests()`
  - `.decide(merchantId, decision: "approve" | "reject", reason: string, actor: SupportActor): Promise<{ status: "ENABLED" | "REJECTED" }>`
  - `.availableForIntent(intent: { merchantId: string }): Promise<boolean>`
  - `.methodsForIntent(intent, country): Promise<InternationalMethodsResponse>`, where `InternationalMethodsResponse = { country: string; quote: { amount: number; currency: "USD"; originalAmount: number; originalCurrency: string; rate: number }; methods: { id: string; kind: "CARD" | "LOCAL_METHOD"; name: string; logo: string | null }[] }`
  - Routes: `GET /v1/merchants/international_payments`, `POST /v1/merchants/international_payments/request` (MerchantAuthGuard); `POST /v1/checkout/international_methods` body `{ country }` (ClientSecretGuard); `GET /internal/international_payments`, `POST /internal/international_payments/:merchantId/approve|reject` body `{ reason }` (OpsAuthGuard)
  - Checkout session response gains `international: { available: boolean }`

- [ ] **Step 1: Write failing service tests**

`international-payments.service.spec.ts`:
```ts
import { BadRequestException, ConflictException } from "@nestjs/common";
import { InternationalPaymentsService } from "./international-payments.service";

function setup(merchant: Record<string, unknown> = {}, rate = 6.96) {
  const tx = { merchant: { update: jest.fn().mockResolvedValue({}) } };
  const prisma = {
    merchant: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({ id: "m_1", settlementMode: "AGGREGATOR", internationalPaymentsStatus: "OFF", internationalPaymentsNote: null, ...merchant }),
      update: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([]),
    },
    merchantKycSubmission: { findFirst: jest.fn().mockResolvedValue({ payoutUsdBankAccount: null }) },
    $transaction: jest.fn((cb) => cb(tx)),
  };
  const client = { listPaymentMethods: jest.fn().mockResolvedValue([
    { id: "CARD", type: "CARD", name: "Tarjeta", logo: "c.png" },
    { id: "PX", type: "BANK_TRANSFER", name: "Pix" },
  ]) };
  const auditLog = { record: jest.fn() };
  const config = { get: jest.fn().mockReturnValue({ bobPerUsd: rate, intlFeeBps: 590, costBps: 0 }) };
  const service = new InternationalPaymentsService(prisma as any, client as any, auditLog as any, config as any);
  return { service, prisma, tx, client, auditLog };
}

const actor = { id: "ops_1", name: "Ops", email: "ops@pagosya.bo", role: "ADMIN" } as any;

describe("InternationalPaymentsService", () => {
  it("lets an AGGREGATOR merchant request access", async () => {
    const { service, prisma } = setup();
    await expect(service.request("m_1")).resolves.toEqual({ status: "REQUESTED" });
    expect(prisma.merchant.update).toHaveBeenCalledWith({ where: { id: "m_1" }, data: { internationalPaymentsStatus: "REQUESTED", internationalPaymentsNote: null } });
  });

  it("refuses FACILITATOR merchants and duplicate requests", async () => {
    await expect(setup({ settlementMode: "FACILITATOR" }).service.request("m_1")).rejects.toBeInstanceOf(BadRequestException);
    await expect(setup({ internationalPaymentsStatus: "ENABLED" }).service.request("m_1")).rejects.toBeInstanceOf(ConflictException);
  });

  it("approves only REQUESTED merchants and writes an audit entry in the same transaction", async () => {
    const { service, tx, auditLog } = setup({ internationalPaymentsStatus: "REQUESTED" });
    await expect(service.decide("m_1", "approve", "KYC y cuenta USD verificadas", actor)).resolves.toEqual({ status: "ENABLED" });
    expect(tx.merchant.update).toHaveBeenCalledWith({ where: { id: "m_1" }, data: { internationalPaymentsStatus: "ENABLED", internationalPaymentsNote: "KYC y cuenta USD verificadas" } });
    expect(auditLog.record).toHaveBeenCalledWith(tx, expect.objectContaining({ action: "international_payments.approve", targetType: "Merchant", targetId: "m_1" }));
    await expect(setup({ internationalPaymentsStatus: "OFF" }).service.decide("m_1", "approve", "motivo largo", actor)).rejects.toBeInstanceOf(ConflictException);
  });

  it("is available for an intent only when enabled and a rate exists", async () => {
    await expect(setup({ internationalPaymentsStatus: "ENABLED" }).service.availableForIntent({ merchantId: "m_1" })).resolves.toBe(true);
    await expect(setup({ internationalPaymentsStatus: "ENABLED" }, 0).service.availableForIntent({ merchantId: "m_1" })).resolves.toBe(false);
    await expect(setup({ internationalPaymentsStatus: "REQUESTED" }).service.availableForIntent({ merchantId: "m_1" })).resolves.toBe(false);
  });

  it("quotes USD and lists methods, caching per country", async () => {
    const { service, client } = setup({ internationalPaymentsStatus: "ENABLED" });
    const intent = { merchantId: "m_1", amount: 70000, currency: "BOB", metadata: {} };
    const first = await service.methodsForIntent(intent, "BR");
    await service.methodsForIntent(intent, "BR");
    expect(client.listPaymentMethods).toHaveBeenCalledTimes(1);
    expect(first).toEqual({
      country: "BR",
      quote: { amount: 10058, currency: "USD", originalAmount: 70000, originalCurrency: "BOB", rate: 6.96 },
      methods: [
        { id: "CARD", kind: "CARD", name: "Tarjeta", logo: "c.png" },
        { id: "PX", kind: "LOCAL_METHOD", name: "Pix", logo: null },
      ],
    });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm -C apps/api exec jest src/international/international-payments.service.spec.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement the service.** First check the `actorType` string other ops audit writes use (`grep -n "actorType" apps/api/src/ops/*.ts`) and use that value below.

`international-payments.service.ts`:
```ts
import { BadRequestException, ConflictException, ForbiddenException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";
import type { DlocalConfig } from "../config/configuration";
import { DlocalClientService } from "../rails/adapters/dlocal/dlocal-client.service";
import type { DlocalPaymentMethod } from "../rails/adapters/dlocal/dlocal.types";
import { AuditLogService } from "../ops/audit-log.service";
import { SupportActor, actorLabel } from "../ops/support.service";
import { FxRateUnavailableError, resolveChargeAmount } from "./fx";

const METHODS_TTL_MS = 60 * 60_000;

@Injectable()
export class InternationalPaymentsService {
  private readonly methodsCache = new Map<string, { at: number; methods: DlocalPaymentMethod[] }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly client: DlocalClientService,
    private readonly auditLog: AuditLogService,
    private readonly config: ConfigService,
  ) {}

  private get cfg(): DlocalConfig {
    return this.config.get<DlocalConfig>("app.dlocal")!;
  }

  async statusFor(merchantId: string) {
    const merchant = await this.prisma.merchant.findUniqueOrThrow({ where: { id: merchantId } });
    const kyc = await this.prisma.merchantKycSubmission.findFirst({
      where: { merchantId, status: "APPROVED" },
      orderBy: { createdAt: "desc" },
      select: { payoutUsdBankAccount: true },
    });
    return {
      status: merchant.internationalPaymentsStatus,
      settlementMode: merchant.settlementMode,
      feeBps: this.cfg.intlFeeBps,
      fxRateAvailable: this.cfg.bobPerUsd > 0,
      usdPayoutAccountOnFile: Boolean(kyc?.payoutUsdBankAccount),
      note: merchant.internationalPaymentsNote,
    };
  }

  async request(merchantId: string) {
    const merchant = await this.prisma.merchant.findUniqueOrThrow({ where: { id: merchantId } });
    if (merchant.settlementMode !== "AGGREGATOR") {
      throw new BadRequestException("Los pagos internacionales requieren que pagosYa liquide tus cobros (modo agregador).");
    }
    if (merchant.internationalPaymentsStatus === "ENABLED" || merchant.internationalPaymentsStatus === "REQUESTED") {
      throw new ConflictException("La solicitud ya existe.");
    }
    await this.prisma.merchant.update({
      where: { id: merchantId },
      data: { internationalPaymentsStatus: "REQUESTED", internationalPaymentsNote: null },
    });
    return { status: "REQUESTED" as const };
  }

  listRequests() {
    return this.prisma.merchant.findMany({
      where: { internationalPaymentsStatus: "REQUESTED" },
      select: { id: true, name: true, email: true, settlementMode: true, internationalPaymentsStatus: true, updatedAt: true },
      orderBy: { updatedAt: "asc" },
      take: 200,
    });
  }

  async decide(merchantId: string, decision: "approve" | "reject", reason: string, actor: SupportActor) {
    const merchant = await this.prisma.merchant.findUniqueOrThrow({ where: { id: merchantId } });
    if (merchant.internationalPaymentsStatus !== "REQUESTED") throw new ConflictException("Solo se deciden solicitudes pendientes.");
    const status = decision === "approve" ? ("ENABLED" as const) : ("REJECTED" as const);
    await this.prisma.$transaction(async (tx) => {
      await tx.merchant.update({ where: { id: merchantId }, data: { internationalPaymentsStatus: status, internationalPaymentsNote: reason } });
      await this.auditLog.record(tx, {
        actorType: "ops_user",
        actorId: actor.id,
        actorLabel: actorLabel(actor),
        action: `international_payments.${decision}`,
        targetType: "Merchant",
        targetId: merchantId,
        metadata: { reason },
      });
    });
    return { status };
  }

  async availableForIntent(intent: { merchantId: string }): Promise<boolean> {
    if (!(this.cfg.bobPerUsd > 0)) return false;
    const merchant = await this.prisma.merchant.findUniqueOrThrow({ where: { id: intent.merchantId } });
    return merchant.internationalPaymentsStatus === "ENABLED" && merchant.settlementMode === "AGGREGATOR";
  }

  async methodsForIntent(intent: { merchantId: string; amount: number; currency: string; metadata: unknown }, country: string) {
    if (!(await this.availableForIntent(intent))) throw new ForbiddenException("Pagos internacionales no disponibles para este cobro.");
    let charge: ReturnType<typeof resolveChargeAmount>;
    try {
      charge = resolveChargeAmount(intent, true, this.cfg.bobPerUsd, new Date());
    } catch (error) {
      if (error instanceof FxRateUnavailableError) throw new ConflictException("intl_fx_rate_unavailable");
      throw error;
    }
    const methods = await this.cachedMethods(country);
    return {
      country,
      quote: {
        amount: charge.amount,
        currency: "USD" as const,
        originalAmount: charge.fx?.originalAmount ?? charge.amount,
        originalCurrency: charge.fx?.originalCurrency ?? charge.currency,
        rate: this.cfg.bobPerUsd,
      },
      methods: methods.map((m) => ({
        id: m.id,
        kind: m.type === "CARD" ? ("CARD" as const) : ("LOCAL_METHOD" as const),
        name: m.name,
        logo: m.logo ?? null,
      })),
    };
  }

  private async cachedMethods(country: string): Promise<DlocalPaymentMethod[]> {
    const cached = this.methodsCache.get(country);
    if (cached && Date.now() - cached.at < METHODS_TTL_MS) return cached.methods;
    const methods = await this.client.listPaymentMethods(country);
    this.methodsCache.set(country, { at: Date.now(), methods });
    return methods;
  }
}
```

- [ ] **Step 4: Run service tests**

Run: `pnpm -C apps/api exec jest src/international/international-payments.service.spec.ts`
Expected: PASS

- [ ] **Step 5: DTOs, controllers, module**

`dto/international-action.dto.ts`:
```ts
import { ApiProperty } from "@nestjs/swagger";
import { IsString, MaxLength, MinLength } from "class-validator";

export class InternationalActionDto {
  @ApiProperty({ example: "KYC aprobado y cuenta USD verificada." })
  @IsString()
  @MinLength(8)
  @MaxLength(500)
  reason!: string;
}
```
`dto/international-methods.dto.ts`:
```ts
import { ApiProperty } from "@nestjs/swagger";
import { Matches } from "class-validator";

export class InternationalMethodsDto {
  @ApiProperty({ example: "BR" })
  @Matches(/^[A-Z]{2}$/)
  country!: string;
}
```
`international-payments.controller.ts`:
```ts
import { Body, Controller, Get, HttpCode, Post, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { PaymentIntent } from "@prisma/client";
import { MerchantAuthGuard } from "../dashboard/guards/merchant-auth.guard";
import { CurrentMerchant } from "../auth/decorators/current-merchant.decorator";
import { ClientSecretGuard } from "../auth/guards/client-secret.guard";
import { InternationalPaymentsService } from "./international-payments.service";
import { InternationalMethodsDto } from "./dto/international-methods.dto";

@ApiTags("international")
@Controller("v1")
export class InternationalPaymentsController {
  constructor(private readonly international: InternationalPaymentsService) {}

  @Get("merchants/international_payments")
  @ApiBearerAuth()
  @UseGuards(MerchantAuthGuard)
  status(@CurrentMerchant() merchant: { id: string }) {
    return this.international.statusFor(merchant.id);
  }

  @Post("merchants/international_payments/request")
  @ApiBearerAuth()
  @UseGuards(MerchantAuthGuard)
  request(@CurrentMerchant() merchant: { id: string }) {
    return this.international.request(merchant.id);
  }

  @Post("checkout/international_methods")
  @HttpCode(200)
  @UseGuards(ClientSecretGuard)
  methods(@Req() req: { paymentIntent: PaymentIntent }, @Body() dto: InternationalMethodsDto) {
    return this.international.methodsForIntent(req.paymentIntent, dto.country);
  }
}
```
`ops-international-payments.controller.ts`:
```ts
import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentOpsUser } from "../ops/decorators/current-ops-user.decorator";
import { OpsAuthGuard } from "../ops/guards/ops-auth.guard";
import { SupportActor } from "../ops/support.service";
import { InternationalActionDto } from "./dto/international-action.dto";
import { InternationalPaymentsService } from "./international-payments.service";

@ApiTags("ops")
@ApiBearerAuth()
@UseGuards(OpsAuthGuard)
@Controller("internal/international_payments")
export class OpsInternationalPaymentsController {
  constructor(private readonly international: InternationalPaymentsService) {}

  @Get()
  list() {
    return this.international.listRequests();
  }

  @Post(":merchantId/approve")
  approve(@Param("merchantId") merchantId: string, @Body() dto: InternationalActionDto, @CurrentOpsUser() actor: SupportActor) {
    return this.international.decide(merchantId, "approve", dto.reason, actor);
  }

  @Post(":merchantId/reject")
  reject(@Param("merchantId") merchantId: string, @Body() dto: InternationalActionDto, @CurrentOpsUser() actor: SupportActor) {
    return this.international.decide(merchantId, "reject", dto.reason, actor);
  }
}
```
`international.module.ts`:
```ts
import { Module } from "@nestjs/common";
import { RailsModule } from "../rails/rails.module";
import { OpsModule } from "../ops/ops.module";
import { AuthModule } from "../auth/auth.module";
import { DashboardModule } from "../dashboard/dashboard.module";
import { InternationalPaymentsService } from "./international-payments.service";
import { InternationalPaymentsController } from "./international-payments.controller";
import { OpsInternationalPaymentsController } from "./ops-international-payments.controller";

@Module({
  imports: [RailsModule, OpsModule, AuthModule, DashboardModule],
  controllers: [InternationalPaymentsController, OpsInternationalPaymentsController],
  providers: [InternationalPaymentsService],
  exports: [InternationalPaymentsService],
})
export class InternationalModule {}
```
Add `InternationalModule` to `imports` in `app.module.ts`. If Nest reports a circular dependency through `OpsModule` or `DashboardModule` at boot (Step 8), wrap that import in `forwardRef(() => …)` on both sides.

- [ ] **Step 6: Session flag.** Add `InternationalModule` to `PaymentIntentsModule.imports`. In `checkout-session.controller.ts`, inject `private readonly international: InternationalPaymentsService`, and in `sessionResponse` add:
```ts
      international: { available: await this.international.availableForIntent(intent) },
```
In `apps/checkout/src/api.ts`, add `international?: { available: boolean };` to the `CheckoutSession` interface.

- [ ] **Step 7: USD payout account in KYC.** In `submit-kyc.dto.ts` add (importing `ApiPropertyOptional`, `IsOptional`, `IsString`, `MaxLength` if they aren't imported already):
```ts
  @ApiPropertyOptional({ description: "USD account (bank, account number, SWIFT/ABA) for international payouts." })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  payoutUsdBankAccount?: string;
```
In `kyc.service.ts` `submit`, add `payoutUsdBankAccount: dto.payoutUsdBankAccount?.trim() || null,` to the created row's data.

- [ ] **Step 8: Run tests and typecheck, then boot**

Run: `pnpm -C apps/api exec jest src/international src/merchants src/payment-intents && pnpm -C apps/api exec tsc --noEmit -p tsconfig.json`
Expected: PASS
Run: `pnpm -C apps/api start:dev` and wait for "Nest application successfully started"; then stop it.
Expected: no dependency-injection resolution errors.

- [ ] **Step 9: Commit**
```bash
git add apps/api/src/international apps/api/src/app.module.ts apps/api/src/merchants/dto/submit-kyc.dto.ts apps/api/src/merchants/kyc.service.ts apps/api/src/payment-intents/checkout-session.controller.ts apps/api/src/payment-intents/payment-intents.module.ts apps/checkout/src/api.ts
git commit -m "Let merchants request international payments and ops approve them"
```

---

### Task 11: Checkout: pay from abroad, redirect, return page

**Files:**
- Create: `apps/checkout/src/international.ts`
- Test: `apps/checkout/src/international.test.ts`
- Modify: `apps/checkout/src/api.ts` (`confirmPaymentIntent` ~line 496; new `fetchInternationalMethods`)
- Modify: `apps/checkout/src/main.ts` (form render ~9414, `submitPayment` ~9569, `renderRequiresAction` ~9954, boot routing)
- Modify: `apps/checkout/src/style.css`

**Interfaces:**
- Consumes: `POST /v1/checkout/international_methods`, confirm with `rail`/`country` (Tasks 7, 10), session `international.available`
- Produces:
  ```ts
  // international.ts
  export const INTERNATIONAL_COUNTRIES: { code: string; name: string }[]
  export function formatDualAmount(originalAmount: number, originalCurrency: string, usdAmount: number): string
  export function rememberReturn(storage: Pick<Storage, "setItem">, paymentIntentId: string, clientSecret: string): void
  export function recallReturn(storage: Pick<Storage, "getItem" | "removeItem">, paymentIntentId: string): string | null
  export function parseReturnParams(search: string): { paymentIntentId: string } | null
  export function tokenForMethod(method: { id: string; kind: "CARD" | "LOCAL_METHOD" }): { type: "CARD" | "LOCAL_METHOD"; token: string; metadata: { dlocalPaymentMethodId: string } }
  // api.ts
  export interface InternationalMethods { country: string; quote: {...}; methods: {...}[] }
  export function fetchInternationalMethods(clientSecret: string, country: string): Promise<InternationalMethods>
  ```

- [ ] **Step 1: Write failing tests**

`international.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { INTERNATIONAL_COUNTRIES, formatDualAmount, parseReturnParams, recallReturn, rememberReturn, tokenForMethod } from "./international";

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    setItem: (k: string, v: string) => void data.set(k, v),
    getItem: (k: string) => data.get(k) ?? null,
    removeItem: (k: string) => void data.delete(k),
  };
}

describe("international checkout helpers", () => {
  it("never offers Bolivia as a foreign country and lists countries alphabetically", () => {
    expect(INTERNATIONAL_COUNTRIES.some((c) => c.code === "BO")).toBe(false);
    const names = INTERNATIONAL_COUNTRIES.map((c) => c.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, "es")));
  });

  it("formats both amounts", () => {
    expect(formatDualAmount(70000, "BOB", 10058)).toBe("Bs 700,00 ≈ USD 100,58");
  });

  it("keeps the client secret in storage, not the URL, and forgets it after reading", () => {
    const storage = memoryStorage();
    rememberReturn(storage, "pi_1", "cs_secret");
    expect(recallReturn(storage, "pi_1")).toBe("cs_secret");
    expect(recallReturn(storage, "pi_1")).toBeNull();
  });

  it("parses the dLocal return URL", () => {
    expect(parseReturnParams("?intl_return=1&pi=pi_1")).toEqual({ paymentIntentId: "pi_1" });
    expect(parseReturnParams("?pi=pi_1")).toBeNull();
    expect(parseReturnParams("?intl_return=1")).toBeNull();
  });

  it("builds confirm payment methods for cards and local methods", () => {
    expect(tokenForMethod({ id: "CARD", kind: "CARD" })).toEqual({ type: "CARD", token: "dlocal:CARD", metadata: { dlocalPaymentMethodId: "CARD" } });
    expect(tokenForMethod({ id: "PX", kind: "LOCAL_METHOD" })).toEqual({ type: "LOCAL_METHOD", token: "dlocal:PX", metadata: { dlocalPaymentMethodId: "PX" } });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm -C apps/checkout test -- src/international.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement helpers**

`international.ts`:
```ts
const COUNTRIES: { code: string; name: string }[] = [
  { code: "AR", name: "Argentina" },
  { code: "BR", name: "Brasil" },
  { code: "CL", name: "Chile" },
  { code: "CO", name: "Colombia" },
  { code: "CR", name: "Costa Rica" },
  { code: "EC", name: "Ecuador" },
  { code: "GT", name: "Guatemala" },
  { code: "MX", name: "México" },
  { code: "PA", name: "Panamá" },
  { code: "PY", name: "Paraguay" },
  { code: "PE", name: "Perú" },
  { code: "DO", name: "República Dominicana" },
  { code: "UY", name: "Uruguay" },
];

/** Countries offered to foreign shoppers. Trim to what the dLocal contract actually covers. */
export const INTERNATIONAL_COUNTRIES = [...COUNTRIES].sort((a, b) => a.name.localeCompare(b.name, "es"));

const money = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");

export function formatDualAmount(originalAmount: number, originalCurrency: string, usdAmount: number): string {
  const original = originalCurrency === "BOB" ? `Bs ${money(originalAmount)}` : `${originalCurrency} ${money(originalAmount)}`;
  return `${original} ≈ USD ${money(usdAmount)}`;
}

const storageKey = (paymentIntentId: string) => `pagosya:intl-return:${paymentIntentId}`;

export function rememberReturn(storage: Pick<Storage, "setItem">, paymentIntentId: string, clientSecret: string): void {
  try {
    storage.setItem(storageKey(paymentIntentId), clientSecret);
  } catch {
    // Private mode: the return page falls back to the "we'll email you" state.
  }
}

export function recallReturn(storage: Pick<Storage, "getItem" | "removeItem">, paymentIntentId: string): string | null {
  try {
    const secret = storage.getItem(storageKey(paymentIntentId));
    storage.removeItem(storageKey(paymentIntentId));
    return secret;
  } catch {
    return null;
  }
}

export function parseReturnParams(search: string): { paymentIntentId: string } | null {
  const params = new URLSearchParams(search);
  const paymentIntentId = params.get("pi");
  return params.get("intl_return") === "1" && paymentIntentId ? { paymentIntentId } : null;
}

export function tokenForMethod(method: { id: string; kind: "CARD" | "LOCAL_METHOD" }) {
  return { type: method.kind, token: `dlocal:${method.id}`, metadata: { dlocalPaymentMethodId: method.id } };
}
```

- [ ] **Step 4: Run helper tests**

Run: `pnpm -C apps/checkout test -- src/international.test.ts`
Expected: PASS

- [ ] **Step 5: API client.** In `api.ts`:
  - Change `confirmPaymentIntent`'s `paymentMethod` parameter type to `{ type: PaymentMethodType; token: string; metadata?: Record<string, unknown> }`. Add a trailing optional parameter `international?: { rail: "dlocal"; country: string }`, and add `...(international ?? {}),` to the JSON body object.
  - Add:
```ts
export interface InternationalMethods {
  country: string;
  quote: { amount: number; currency: "USD"; originalAmount: number; originalCurrency: string; rate: number };
  methods: { id: string; kind: "CARD" | "LOCAL_METHOD"; name: string; logo: string | null }[];
}

export async function fetchInternationalMethods(clientSecret: string, country: string): Promise<InternationalMethods> {
  const response = await fetch(`${API_BASE_URL}/checkout/international_methods`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${clientSecret}` },
    body: JSON.stringify({ country }),
  });
  return parseOrThrow(response);
}
```

- [ ] **Step 6: Checkout UI in `main.ts`.** First locate the form render function and `fetchSession`'s signature:
`grep -n "function renderForm\|export async function fetchSession" apps/checkout/src/main.ts apps/checkout/src/api.ts`. The snippets below call them `renderForm(session, clientSecret)` and `fetchSession(clientSecret, checkoutPublishableKey)` (the latter as used in `renderRequiresAction`); adapt the argument lists to the real signatures.

Imports:
```ts
import { INTERNATIONAL_COUNTRIES, formatDualAmount, parseReturnParams, recallReturn, rememberReturn, tokenForMethod } from "./international";
```
and add `fetchInternationalMethods, type InternationalMethods` to the existing `./api` import.

State, next to `let selectedType`:
```ts
let internationalMode = false;
let internationalCountry = "";
let internationalMethods: InternationalMethods | null = null;
let internationalMethodId = "";
```
In the form template, directly **before** `<div class="tabs">`, insert:
```ts
      ${session.international?.available && !domainPurchase && !sourcePaymentPreview ? `
        <div class="intl-entry">
          <label class="intl-toggle"><input type="checkbox" id="intlToggle" ${internationalMode ? "checked" : ""}> ¿Pagas desde fuera de Bolivia?</label>
          ${internationalMode ? `
            <div class="field">
              <label for="intlCountry">País desde el que pagas</label>
              <select id="intlCountry">
                <option value="">Elige tu país</option>
                ${INTERNATIONAL_COUNTRIES.map((c) => `<option value="${c.code}" ${c.code === internationalCountry ? "selected" : ""}>${escapeHtml(c.name)}</option>`).join("")}
              </select>
            </div>
            ${internationalMethods ? `
              <p class="intl-quote">${escapeHtml(formatDualAmount(internationalMethods.quote.originalAmount, internationalMethods.quote.originalCurrency, internationalMethods.quote.amount))}</p>
              <div class="intl-methods" role="radiogroup" aria-label="Método de pago internacional">
                ${internationalMethods.methods.map((m) => `
                  <label class="intl-method">
                    <input type="radio" name="intlMethod" value="${escapeHtml(m.id)}" ${m.id === internationalMethodId ? "checked" : ""}>
                    ${m.logo ? `<img src="${escapeHtml(m.logo)}" alt="" width="32" height="20" loading="lazy">` : ""}
                    <span>${escapeHtml(m.name)}</span>
                  </label>`).join("")}
              </div>
              <p class="hint">Serás redirigido para completar el pago de forma segura. Allí verás el monto final en tu moneda.</p>` : ""}
          ` : ""}
        </div>` : ""}
```
Wrap the existing `<div class="tabs">…</div>` block and the dev token `<div class="field">…</div>` block each in `${internationalMode ? "" : `…`}`. Change the pay button amount from `formatAmount(session.amount, session.currency)` to:
```ts
${internationalMode && internationalMethods ? `USD ${(internationalMethods.quote.amount / 100).toFixed(2)}` : formatAmount(session.amount, session.currency)}
```
After the form HTML is assigned (next to where the `.tab` click listeners are bound), add:
```ts
  app.querySelector<HTMLInputElement>("#intlToggle")?.addEventListener("change", (event) => {
    internationalMode = (event.target as HTMLInputElement).checked;
    renderForm(session, clientSecret);
  });
  app.querySelector<HTMLSelectElement>("#intlCountry")?.addEventListener("change", async (event) => {
    internationalCountry = (event.target as HTMLSelectElement).value;
    internationalMethods = null;
    internationalMethodId = "";
    if (internationalCountry) {
      try {
        internationalMethods = await fetchInternationalMethods(clientSecret, internationalCountry);
        internationalMethodId = internationalMethods.methods[0]?.id ?? "";
      } catch (err) {
        renderFailed(session.id, (err as Error).message);
        return;
      }
    }
    renderForm(session, clientSecret);
  });
  app.querySelectorAll<HTMLInputElement>('input[name="intlMethod"]').forEach((input) =>
    input.addEventListener("change", () => {
      internationalMethodId = input.value;
    }),
  );
```
In the form's submit validation (where `contactFieldErrors.customerEmail` is set), add: when `internationalMode` is true and the email is empty, set `contactFieldErrors.customerEmail = "Ingresa tu correo para pagar desde el exterior."` and stop the submit.

In `submitPayment`, replace the `confirmPaymentIntent(...)` call with:
```ts
    const selectedIntl = internationalMode ? internationalMethods?.methods.find((m) => m.id === internationalMethodId) : undefined;
    if (internationalMode && (!internationalCountry || !selectedIntl)) {
      renderFailed(session.id, "Elige tu país y un método de pago.");
      return;
    }
    const { paymentIntent, railResult } = await confirmPaymentIntent(
      session.id,
      clientSecret,
      selectedIntl ? tokenForMethod(selectedIntl) : { type: selectedType, token },
      customer,
      selectedIntl ? { rail: "dlocal", country: internationalCountry } : undefined,
    );
```
In `renderRequiresAction`, right after `const action = …`, add:
```ts
  if (action?.type === "redirect" && action.data.redirectUrl) {
    rememberReturn(window.sessionStorage, paymentIntentId, clientSecret);
    app.innerHTML = `<div class="payment-outcome-panel payment-action-panel"><div class="status action">${ICON_CLOCK}<span>Te estamos llevando a la página de pago segura…</span></div></div>`;
    try {
      window.top!.location.href = action.data.redirectUrl;
    } catch {
      window.location.href = action.data.redirectUrl;
    }
    return;
  }
```
The existing `Confirme en:` text stays as the fallback for a redirect action without a URL.

Return page: find the boot routing (`grep -n "URLSearchParams(window.location.search)" apps/checkout/src/main.ts | head -3`). Before any other routing, add an early branch:
```ts
const intlReturn = parseReturnParams(window.location.search);
if (intlReturn) {
  void renderInternationalReturn(intlReturn.paymentIntentId);
} else {
  // …existing boot code moves inside this else, or the existing code returns early the same way it does for other routes
}
```
and the function:
```ts
async function renderInternationalReturn(paymentIntentId: string) {
  const clientSecret = recallReturn(window.sessionStorage, paymentIntentId);
  const pendingNotice = (text: string) => {
    app.innerHTML = `<div class="payment-outcome-panel"><div class="status action">${ICON_CLOCK}<span>${text}</span></div></div>`;
  };
  if (!clientSecret) {
    pendingNotice("Recibimos tu regreso. Cuando se confirme el pago, te llegará el comprobante por correo.");
    return;
  }
  const deadline = Date.now() + 2 * 60_000;
  for (;;) {
    const session = await fetchSession(clientSecret, checkoutPublishableKey);
    if (session.status === "SUCCEEDED") return renderSuccess(session);
    if (session.status === "FAILED" || session.status === "CANCELED") {
      return renderFailed(session.id, "El pago no se completó. Puedes intentar con otro método.");
    }
    if (Date.now() > deadline) {
      pendingNotice("Tu pago está pendiente. Si pagaste con comprobante o transferencia puede tardar; te avisaremos por correo.");
      return;
    }
    pendingNotice("Confirmando tu pago…");
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
}
```

`style.css`, appended. First check the checkout's custom properties (`grep -n "^:root" -A25 apps/checkout/src/style.css`) and replace `--border`/`--accent` with the real token names:
```css
.intl-entry { display: grid; gap: 12px; margin: 16px 0; }
.intl-toggle { display: flex; align-items: center; gap: 8px; font-weight: 600; cursor: pointer; min-height: 44px; }
.intl-quote { margin: 0; font-variant-numeric: tabular-nums; }
.intl-methods { display: grid; gap: 8px; }
.intl-method { display: flex; align-items: center; gap: 10px; min-height: 44px; padding: 10px 12px; border: 1px solid var(--border); border-radius: 10px; cursor: pointer; }
.intl-method:has(input:checked) { border-color: var(--accent); }
.intl-method img { object-fit: contain; flex: none; }
```

- [ ] **Step 7: Build and test**

Run: `pnpm -C apps/checkout test && pnpm -C apps/checkout build`
Expected: tests PASS, build succeeds.

- [ ] **Step 8: Manual check in fixture mode.** Set `INTL_BOB_PER_USD=6.96` in the API `.env`, then run the API and checkout. Put a test merchant through `POST /v1/merchants/international_payments/request` (dashboard session) and `POST /internal/international_payments/<id>/approve` (ops token), then open one of its store checkouts. Verify:
  1. "¿Pagas desde fuera de Bolivia?" appears. Checking it hides the domestic tabs.
  2. Choosing Brasil shows "Bs … ≈ USD …" with Tarjeta and Pix.
  3. Paying goes to `/?intl_return=1&pi=…` (the fixture redirect) and shows "Confirmando tu pago…".
  4. `POST /internal/rails/dlocal/callback` with `{ "paymentIntentId": "<id>", "status": "succeeded", "railReference": "D-fixture" }` (internal secret) flips the return page to the success screen. In the database: 4 ledger lines in USD, and an invoice queued in BOB.
  5. At 375px width there is no horizontal scroll, and method rows are at least 44px tall.

- [ ] **Step 9: Commit**
```bash
git add apps/checkout/src/international.ts apps/checkout/src/international.test.ts apps/checkout/src/api.ts apps/checkout/src/main.ts apps/checkout/src/style.css
git commit -m "Let shoppers abroad pick their country and pay through dLocal"
```

---

### Task 12: Merchant dashboard and ops console

**Files:**
- Modify: `apps/merchant-dashboard/index.html` (overview loader ~line 19485, balance rendering, KYC form)
- Modify: `apps/ops/index.html` (new queue section next to the domain queue ~line 564)
- Test: `apps/merchant-dashboard/tests/international-payments.spec.mjs`

**Interfaces:**
- Consumes: `GET /v1/merchants/balance` `balances` (Task 3), `GET/POST /v1/merchants/international_payments[/request]`, KYC `payoutUsdBankAccount`, `GET/POST /internal/international_payments…` (Task 10)

- [ ] **Step 1: Write the failing Playwright test.** Open `apps/merchant-dashboard/tests/domain-shop.spec.mjs` and copy its imports, login/route-mocking setup and navigation to the overview into the new file. Then add this test body after that setup:
```js
test("merchant sees separate BOB and USD balances and can request international payments", async ({ page }) => {
  await page.route("**/v1/merchants/balance", (route) => route.fulfill({ json: {
    payableBalance: 70000, currency: "BOB",
    balances: [{ currency: "BOB", payableBalance: 70000 }, { currency: "USD", payableBalance: 9000 }],
  } }));
  let requested = false;
  await page.route("**/v1/merchants/international_payments", (route) => route.fulfill({ json: {
    status: requested ? "REQUESTED" : "OFF", settlementMode: "AGGREGATOR", feeBps: 590,
    fxRateAvailable: true, usdPayoutAccountOnFile: false, note: null,
  } }));
  await page.route("**/v1/merchants/international_payments/request", (route) => {
    requested = true;
    return route.fulfill({ json: { status: "REQUESTED" } });
  });

  // …log in and open the overview exactly as domain-shop.spec.mjs does…

  await expect(page.getByText("Saldo por desembolsar (BOB)")).toBeVisible();
  await expect(page.getByText("Saldo por desembolsar (USD)")).toBeVisible();
  const card = page.getByRole("region", { name: "Pagos internacionales" });
  await expect(card.getByText("5,9%")).toBeVisible();
  await card.getByRole("button", { name: "Solicitar activación" }).click();
  await expect(card.getByText("Solicitud en revisión.")).toBeVisible();
  await expect(card.getByText("Agrega una cuenta en USD")).toBeVisible();
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm -C apps/merchant-dashboard exec playwright test tests/international-payments.spec.mjs`
Expected: FAIL, the USD label and the region are missing.

- [ ] **Step 3: Dashboard changes.** First find the helpers: `grep -n "function api(\|function escapeHtml\|payableBalance" apps/merchant-dashboard/index.html`.
  1. Where the overview renders `payableBalance`, render one figure per entry of `balance.balances ?? [{ currency: balance.currency, payableBalance: balance.payableBalance }]`. Label each one `Saldo por desembolsar (${currency})` and format it with the existing money formatter. Never sum them.
  2. Add `api("/merchants/international_payments").catch(() => null)` to the overview `Promise.all` at ~19485, capture it as `international`, and render `renderInternationalCard(international)` after the balance block:
```js
function renderInternationalCard(intl) {
  if (!intl) return "";
  const fee = `${(intl.feeBps / 100).toFixed(1).replace(".", ",")}%`;
  const states = {
    OFF: `<p>Recibe pagos de compradores fuera de Bolivia con tarjeta y métodos locales. Se cobra en USD con una comisión de ${fee}.</p>
          <button type="button" class="primary" data-intl-request ${intl.settlementMode !== "AGGREGATOR" ? "disabled" : ""}>Solicitar activación</button>
          ${intl.settlementMode !== "AGGREGATOR" ? '<p class="hint">Disponible solo cuando pagosYa liquida tus cobros.</p>' : ""}`,
    REQUESTED: `<p><strong>Solicitud en revisión.</strong> Te avisaremos cuando esté activo. Comisión: ${fee}.</p>`,
    ENABLED: `<p><strong>Activo.</strong> Comisión internacional: ${fee}.</p>`,
    REJECTED: `<p><strong>No aprobado.</strong> ${escapeHtml(intl.note || "")}</p><button type="button" data-intl-request>Volver a solicitar</button>`,
  };
  const usdHint = intl.status !== "OFF" && !intl.usdPayoutAccountOnFile
    ? '<p class="hint">Agrega una cuenta en USD en tus datos de verificación para recibir desembolsos en dólares.</p>'
    : "";
  return `<section class="panel" role="region" aria-label="Pagos internacionales"><h3>Pagos internacionales</h3>${states[intl.status] ?? ""}${usdHint}</section>`;
}
```
  After the overview HTML is inserted, bind every `[data-intl-request]` button to call `api("/merchants/international_payments/request", { method: "POST" })` (adapt to the file's `api()` signature for POST), and then call the existing dashboard refresh function. Disable the button while the request is in flight.
  3. In the KYC form, add an optional input `payoutUsdBankAccount` labelled "Cuenta en USD para desembolsos internacionales (opcional)" (`maxlength="300"`), and include it in the submitted JSON.

- [ ] **Step 4: Run the test**

Run: `pnpm -C apps/merchant-dashboard exec playwright test tests/international-payments.spec.mjs`
Expected: PASS

- [ ] **Step 5: Ops console.** In `apps/ops/index.html`, find the domain queue (`grep -n "domainSearchForm\|domain_orders" apps/ops/index.html`) and add a sibling "Pagos internacionales" section using the same markup classes and navigation registration:
  - On open: `GET /internal/international_payments`, rendering one row per merchant with name, email, settlement mode and requested date (`updatedAt`).
  - Selecting a row shows a form with a required `reason` textarea (`minlength="8"`, `maxlength="500"`) and two buttons, **Aprobar** and **Rechazar**. Each POSTs `{ reason }` to `/internal/international_payments/<merchantId>/approve` or `/reject` through the console's existing authenticated fetch helper, shows the API error text on failure, and reloads the list on success.

- [ ] **Step 6: Manual ops check.** Start the ops console using the command in `apps/ops/package.json` and sign in with an ops token. Request access from a test merchant's dashboard, approve it in ops, and confirm that the dashboard card shows "Activo" and that the audit log view lists `international_payments.approve`.

- [ ] **Step 7: Commit**
```bash
git add apps/merchant-dashboard/index.html apps/merchant-dashboard/tests/international-payments.spec.mjs apps/ops/index.html
git commit -m "Show USD balances and the international payments request in the dashboards"
```

---

### Task 13: Smart Fields card capture (BLOCKED until `DLOCAL_SMART_FIELDS_KEY` exists)

Do not start this task until dLocal has issued a Smart Fields key and confirmed it is enabled for the account. Until then, cards use REDIRECT from Task 11. The adapter side (`dlsf_` tokens → DIRECT) is already built and tested in Task 6.

**Files:**
- Create: `apps/checkout/src/dlocal-smart-fields.ts`
- Modify: `apps/checkout/src/main.ts` (card method in international mode)
- Modify: `apps/checkout/src/api.ts` (`InternationalMethods.smartFieldsKey`)
- Modify: `apps/api/src/international/international-payments.service.ts` (expose `smartFieldsKey`)
- Test: `apps/api/src/international/international-payments.service.spec.ts`

**Interfaces:**
- Consumes: the `dlsf_` token convention (Task 6), `methodsForIntent` (Task 10)
- Produces: `mountDlocalCard(container: HTMLElement, key: string, country: string): Promise<{ tokenize(name: string): Promise<string>; destroy(): void }>`, where `tokenize` returns `dlsf_<token>`

- [ ] **Step 1: Check the Smart Fields docs** (docs.dlocal.com → Smart Fields) for the script URL, init call, field creation, mounting and tokenization. The code below assumes `const dl = dlocal(key); const fields = dl.fields({ locale: "es", country }); const card = fields.create("card", {}); card.mount(el); const result = await dl.createToken(card, { name });` with the script at `https://js-sandbox.dlocal.com/` (sandbox) / `https://js.dlocal.com/` (live). Fix Steps 3-4 to match the docs.

- [ ] **Step 2: Write the failing API test.** Append to `international-payments.service.spec.ts`:
```ts
it("exposes the Smart Fields key only when configured", async () => {
  const { service } = setup({ internationalPaymentsStatus: "ENABLED" });
  const intent = { merchantId: "m_1", amount: 70000, currency: "BOB", metadata: {} };
  await expect(service.methodsForIntent(intent, "BR")).resolves.toMatchObject({ smartFieldsKey: null });
});
```
Run: `pnpm -C apps/api exec jest src/international/international-payments.service.spec.ts -t "Smart Fields"`
Expected: FAIL, `smartFieldsKey` is undefined.

- [ ] **Step 3: Implement API + loader.** In `methodsForIntent`'s return object add `smartFieldsKey: this.cfg.smartFieldsKey || null,`. Also add `smartFieldsKey` to the test's config mock default (`smartFieldsKey: ""`) and to `InternationalMethods` in `apps/checkout/src/api.ts` (`smartFieldsKey: string | null;`).

`apps/checkout/src/dlocal-smart-fields.ts`:
```ts
declare global {
  interface Window {
    dlocal?: (key: string) => any;
  }
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const script = document.createElement("script");
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("No se pudo cargar el formulario de tarjeta."));
    document.head.appendChild(script);
  });
}

export async function mountDlocalCard(container: HTMLElement, key: string, country: string) {
  await loadScript(import.meta.env.VITE_DLOCAL_JS_URL ?? "https://js-sandbox.dlocal.com/");
  if (!window.dlocal) throw new Error("No se pudo cargar el formulario de tarjeta.");
  const dl = window.dlocal(key);
  const card = dl.fields({ locale: "es", country }).create("card", {});
  card.mount(container);
  return {
    async tokenize(name: string): Promise<string> {
      const result = await dl.createToken(card, { name });
      if (!result?.token) throw new Error(result?.error?.message ?? "No se pudo validar la tarjeta.");
      return `dlsf_${result.token}`;
    },
    destroy() {
      card.destroy?.();
    },
  };
}
```

- [ ] **Step 4: Wire checkout.** In `main.ts`:
  - Keep `let dlocalCard: Awaited<ReturnType<typeof mountDlocalCard>> | null = null;` in state.
  - When `internationalMode` is on, the selected method's `kind` is `"CARD"` and `internationalMethods.smartFieldsKey` is set: render `<div id="dlocalCard" class="field" aria-label="Datos de la tarjeta"></div>` below the method list. After render, `dlocalCard?.destroy(); dlocalCard = await mountDlocalCard(el, key, internationalCountry)` (catch errors and show them via `renderFailed`), and change the redirect hint to "Tu tarjeta se procesa de forma segura por dLocal."
  - In `submitPayment`, when `selectedIntl?.kind === "CARD" && dlocalCard`, confirm with `{ type: "CARD", token: await dlocalCard.tokenize(customer.name), metadata: { dlocalPaymentMethodId: "CARD" } }` instead of `tokenForMethod(selectedIntl)`.
  - Allow the dLocal script and frame origins wherever the checkout's Content-Security-Policy is defined (`grep -rn "Content-Security-Policy" apps/checkout`).

- [ ] **Step 5: Run tests and build**

Run: `pnpm -C apps/api exec jest src/international && pnpm -C apps/checkout test && pnpm -C apps/checkout build`
Expected: PASS, build succeeds.

- [ ] **Step 6: Sandbox verification** with dLocal's documented test cards: approved → success screen with no redirect. Declined → failure showing dLocal's reason. 3-D Secure card → redirect → return page → success after the webhook.

- [ ] **Step 7: Commit**
```bash
git add apps/checkout/src/dlocal-smart-fields.ts apps/checkout/src/main.ts apps/checkout/src/api.ts apps/api/src/international/international-payments.service.ts apps/api/src/international/international-payments.service.spec.ts
git commit -m "Take cards inside checkout with dLocal Smart Fields"
```

---

## Sandbox go-live checklist (after dLocal keys arrive)

- [ ] Set `DLOCAL_ENABLED=true`, `DLOCAL_BASE_URL=https://sandbox.dlocal.com`, the three keys, and public HTTPS `DLOCAL_NOTIFICATION_URL` / `DLOCAL_RETURN_URL`.
- [ ] Re-record the Task 1 fixtures from real sandbox responses and rerun `pnpm -C apps/api exec jest src/rails/adapters/dlocal src/payment-intents`.
- [ ] Run one payment each for BR card (redirect), BR Pix, MX OXXO and CO PSE. For each, confirm the webhook arrives, signature verification passes, the ledger has 4 balanced USD lines, and the Factura is queued in BOB.
- [ ] Refund one paid payment and confirm the refund journal and the dLocal refund status.
- [ ] Set `INTL_FEE_BPS` and `DLOCAL_COST_BPS` from the signed dLocal pricing.
