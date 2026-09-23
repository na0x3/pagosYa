# ASFI Merchant Levels and Limits Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Four merchant verification levels with ops-editable monthly and per-payment limits, enforced at checkout by a race-safe monthly counter, with private identity documents for the new informal-seller level.

**Architecture:** A new NestJS `limits` module owns the level policy, settings and monthly counter (`LimitsService`), and is called by `PaymentIntentsService` at create (per-payment max), confirm (reserve, inside the existing confirm transaction before any rail call) and at every status outcome (settle/release). KYC gains a `targetLevel` and private document slots stored through the existing `PrivateFilesService`. The merchant dashboard and ops single-page apps read new endpoints.

**Tech Stack:** NestJS 11, Prisma 5 (PostgreSQL), Jest unit specs (mocked Prisma) and Jest e2e specs (embedded Postgres, `apps/api/test/*.e2e-spec.ts`), Vitest (checkout), Playwright (merchant-dashboard), plain HTML/JS (ops).

**Spec:** `docs/superpowers/specs/2026-09-23-asfi-merchant-levels-design.md`

## Global Constraints

- All amounts are integer centavos of BOB, like `PaymentIntent.amount`.
- Placeholders (seeded by the migration): level 0 `liveEnabled=false`; level 1 monthly 1 000 000 / per-payment 200 000; level 2 monthly 10 000 000 / per-payment 2 000 000; level 3 `liveEnabled=true` with both limits null (must come from merchant overrides). `usdToBobRate` = 6.96.
- Month key = `YYYY-MM` in `America/La_Paz`, taken when the amount is reserved.
- Limits apply to live payments only (`livemode = true`). TEST mode is never checked, reserved or counted.
- Refunds never change the counter.
- Fail closed: missing policy, or a live level whose limit resolves to null → live payments refused + one ops case (`openOpsCaseOnce`, dedupe key `limits-misconfigured:<merchantId>`).
- Buyer-facing refusal copy, exactly: `Este comercio no puede recibir pagos en este momento.` Never include amounts or limits in buyer-facing errors.
- Merchant-facing per-payment copy, exactly: `Este cobro supera el máximo por pago de tu nivel.`
- Error codes in response bodies: `limit_exceeded`, `per_payment_limit_exceeded` (HTTP 403, body `{ code, message }`).
- Only `OpsRole.SUPPORT_ADMIN` edits policies, settings, overrides or sets a level directly; every such write goes through `AuditLogService.record` in the same transaction.
- Identity documents are stored only through `PrivateFilesService` (never `UploadsService`), images only (png/jpeg/webp), max 8 MB.
- User-facing copy is Spanish.
- Route prefixes follow existing code: merchant `v1/merchants/*` (MerchantAuthGuard), dashboard `v1/dashboard/*` (MerchantSessionGuard), ops `internal/*` (OpsAuthGuard).

## Review Focus

- **A merchant that is ACTIVE without an approved KYC** (ops-activated or seeded) must not be locked out on deploy → the migration puts ACTIVE merchants at level 2 as well (Task 1, Step 4 check).
- **A FAILED payment retried by the buyer** (FAILED → CONFIRM is legal) must reserve again after its release, and must not double-reserve on a plain retried confirm → `limitStatus` guards both (Task 2 tests).
- **A merchant at level 1 upgrading while already ACTIVE** must be able to submit KYC (today `submit` rejects ACTIVE merchants) → allowed when `targetLevel > level` (Task 6 test).
- **A live payment intent in a currency other than BOB/USD** → refused with `limit_exceeded` rather than counted as zero (Task 2 test).
- **A buyer paying a product priced over the per-payment max through a store** sees the neutral buyer message, not the merchant one (Task 3 e2e test).

---

## File Structure

| File | Responsibility |
|---|---|
| `apps/api/prisma/schema.prisma` | New models/columns (Task 1) |
| `apps/api/prisma/migrations/20260924120000_merchant_levels_and_limits/migration.sql` | DDL + placeholder rows + level backfill |
| `apps/api/src/limits/limits.service.ts` | Effective limits, month key, BOB conversion, per-payment check, reserve/settle/release, 80% flag |
| `apps/api/src/limits/limit-errors.ts` | `limitExceeded()`, `perPaymentLimitExceeded(audience)` exception factories |
| `apps/api/src/limits/limits-warning.service.ts` | 80% email |
| `apps/api/src/limits/limits-admin.service.ts` | Ops edits of policies, settings, merchant overrides; near-limit list |
| `apps/api/src/limits/ops-limits.controller.ts` | `internal/limits/*`, `internal/merchants/:id/limits` |
| `apps/api/src/limits/dashboard-limits.controller.ts` | `v1/dashboard/limits` + level-3 request |
| `apps/api/src/limits/limits.module.ts` | Wiring |
| `apps/api/src/merchants/identity-documents.service.ts` | Validate + store + own KYC images |
| `apps/api/src/merchants/kyc.service.ts` | `targetLevel`, doc checks, approve sets level |
| `apps/api/src/merchants/merchants.controller.ts` | Upload + ops view routes |
| `apps/api/src/payment-intents/payment-intents.service.ts` | Calls into `LimitsService` |
| `apps/api/test/merchant-limits.e2e-spec.ts` | Real-DB enforcement, concurrency, KYC docs, ops auth |
| `apps/checkout/test/payment-form.test.ts` | Neutral message shown |
| `apps/merchant-dashboard/index.html`, `tests/merchant-levels.spec.mjs` | Level card, banners, upgrade form |
| `apps/ops/index.html` | KYC photos + level, limits page, overrides |

---

### Task 1: Schema, migration, placeholders and backfill

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20260924120000_merchant_levels_and_limits/migration.sql`
- Modify: `apps/api/prisma/seed.ts`

**Interfaces:**
- Produces: Prisma models `MerchantLevelPolicy`, `LimitSettings`, `MerchantMonthlyVolume`, `MerchantKycDocument`; enum `LimitReservationStatus { RESERVED SETTLED RELEASED }`; enum `KycDocumentSlot { CI_FRONT CI_BACK SELFIE }`; new columns listed below.

- [ ] **Step 1: Edit the schema**

```prisma
enum LimitReservationStatus {
  RESERVED
  SETTLED
  RELEASED
}

enum KycDocumentSlot {
  CI_FRONT
  CI_BACK
  SELFIE
}

// In model Merchant, add:
  level                   Int                     @default(0)
  monthlyLimitOverride    Int?
  perPaymentLimitOverride Int?
  monthlyVolumes          MerchantMonthlyVolume[]
  kycDocuments            MerchantKycDocument[]

// Ops-editable limits per verification level (ASFI afiliación). Amounts in centavos BOB.
model MerchantLevelPolicy {
  level           Int      @id
  name            String
  liveEnabled     Boolean
  monthlyLimit    Int?
  perPaymentLimit Int?
  updatedAt       DateTime @updatedAt
}

model LimitSettings {
  id           String   @id @default("singleton")
  usdToBobRate Decimal  @db.Decimal(10, 4)
  updatedAt    DateTime @updatedAt
}

// Running live volume per merchant per America/La_Paz calendar month.
model MerchantMonthlyVolume {
  merchantId String
  merchant   Merchant  @relation(fields: [merchantId], references: [id])
  month      String
  reserved   Int       @default(0)
  settled    Int       @default(0)
  warnedAt   DateTime?

  @@id([merchantId, month])
}

// A private identity image uploaded by a merchant for KYC; the key lives in PrivateFilesService.
model MerchantKycDocument {
  id         String          @id @default(cuid())
  merchantId String
  merchant   Merchant        @relation(fields: [merchantId], references: [id])
  slot       KycDocumentSlot
  storageKey String          @unique
  mimeType   String
  byteSize   Int
  createdAt  DateTime        @default(now())

  @@index([merchantId, createdAt])
}

// In model PaymentIntent, add:
  limitMonth     String?
  limitAmountBob Int?
  limitFxRate    Decimal?                @db.Decimal(10, 4)
  limitStatus    LimitReservationStatus?

// In model MerchantKycSubmission: make taxId, legalRepName, legalRepDocumentId optional (String?) and add:
  targetLevel  Int     @default(2)
  ciFrontDocId String?
  ciBackDocId  String?
  selfieDocId  String?
```

- [ ] **Step 2: Generate the migration SQL**

Run from `apps/api`:
```bash
mkdir -p prisma/migrations/20260924120000_merchant_levels_and_limits
git show HEAD:apps/api/prisma/schema.prisma > "$CLAUDE_JOB_DIR/tmp/schema-head.prisma"
npx prisma migrate diff --from-schema-datamodel "$CLAUDE_JOB_DIR/tmp/schema-head.prisma" --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/20260924120000_merchant_levels_and_limits/migration.sql
```
Expected: only the new enums, tables, columns, `DROP NOT NULL` on the three KYC columns, indexes and FKs.

- [ ] **Step 3: Append placeholders and backfill to the migration**

```sql
-- Placeholder limits (centavos BOB). Ops edits these; the bank's numbers replace them.
INSERT INTO "MerchantLevelPolicy" ("level", "name", "liveEnabled", "monthlyLimit", "perPaymentLimit", "updatedAt") VALUES
  (0, 'Sin verificar', false, NULL, NULL, CURRENT_TIMESTAMP),
  (1, 'Persona', true, 1000000, 200000, CURRENT_TIMESTAMP),
  (2, 'Negocio', true, 10000000, 2000000, CURRENT_TIMESTAMP),
  (3, 'Empresa', true, NULL, NULL, CURRENT_TIMESTAMP);

INSERT INTO "LimitSettings" ("id", "usdToBobRate", "updatedAt") VALUES ('singleton', 6.96, CURRENT_TIMESTAMP);

-- Merchants already live keep collecting: approved KYC or already ACTIVE -> level 2.
UPDATE "Merchant" SET "level" = 2
WHERE "status" = 'ACTIVE'
   OR "id" IN (SELECT "merchantId" FROM "MerchantKycSubmission" WHERE "status" = 'APPROVED');
```

- [ ] **Step 4: Apply and verify**

Run: `npx prisma migrate deploy && npx prisma generate && npx tsc --noEmit -p tsconfig.json`
Expected: the migration applies. tsc fails only where `taxId`/`legalRepName`/`legalRepDocumentId` are now `string | null`; fix those call sites (render `?? ""` or skip when null), then tsc passes.
Then check the backfill on the local DB: `SELECT level, status, count(*) FROM "Merchant" GROUP BY 1, 2;` — no `ACTIVE` merchant at level 0.

- [ ] **Step 5: Dev seed**

In `apps/api/prisma/seed.ts`, where the aggregator demo merchant is created/updated, set `level: 2`.

- [ ] **Step 6: Commit**

```bash
git add apps/api/prisma apps/api/src
git commit -m "feat(limits): store merchant levels, limit policies and monthly volume"
```

---

### Task 2: `LimitsService` core

**Files:**
- Create: `apps/api/src/limits/limits.service.ts`, `apps/api/src/limits/limit-errors.ts`, `apps/api/src/limits/limits.module.ts`
- Test: `apps/api/src/limits/limits.service.spec.ts`
- Modify: `apps/api/src/app.module.ts` (import `LimitsModule`)

**Interfaces:**
- Produces:
  - `laPazMonth(at: Date): string`
  - `class LimitsService { effectiveLimits(merchantId): Promise<EffectiveLimits>; amountInBob(intent: { amount: number; currency: string; metadata: unknown }): Promise<{ amountBob: number; fxRate: Prisma.Decimal | null }>; assertPerPayment(merchantId, intent, audience: "merchant" | "buyer"): Promise<void>; reserve(tx, intent: ReservableIntent, now?: Date): Promise<{ crossedWarning: boolean }>; settle(tx, paymentIntentId): Promise<void>; release(tx, paymentIntentId): Promise<void>; usage(merchantId, now?: Date): Promise<LimitUsage> }`
  - `type EffectiveLimits = { level: number; levelName: string; liveEnabled: boolean; monthlyLimit: number | null; perPaymentLimit: number | null; misconfigured: boolean }`
  - `type ReservableIntent = { id: string; merchantId: string; amount: number; currency: string; metadata: unknown; livemode: boolean; limitStatus: LimitReservationStatus | null }`
  - `type LimitUsage = EffectiveLimits & { month: string; used: number; resetsAt: string }`
  - `limitExceeded(): ForbiddenException`, `perPaymentLimitExceeded(audience): ForbiddenException`, `BUYER_REFUSAL`

- [ ] **Step 1: Write the failing spec**

```ts
import { ForbiddenException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { LimitsService, laPazMonth } from "./limits.service";

const policies = [
  { level: 0, name: "Sin verificar", liveEnabled: false, monthlyLimit: null, perPaymentLimit: null },
  { level: 1, name: "Persona", liveEnabled: true, monthlyLimit: 1_000_000, perPaymentLimit: 200_000 },
  { level: 3, name: "Empresa", liveEnabled: true, monthlyLimit: null, perPaymentLimit: null },
];

function setup(merchant: Record<string, unknown> = { id: "m_1", level: 1, monthlyLimitOverride: null, perPaymentLimitOverride: null }, updated = 1) {
  const tx = {
    merchantMonthlyVolume: {
      upsert: jest.fn().mockResolvedValue({}),
      findUniqueOrThrow: jest.fn().mockResolvedValue({ reserved: 850_000, settled: 0, warnedAt: null }),
      update: jest.fn(),
    },
    $executeRaw: jest.fn().mockResolvedValue(updated),
    paymentIntent: { update: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 1 }), findUnique: jest.fn() },
  };
  const prisma = {
    merchant: { findUniqueOrThrow: jest.fn().mockResolvedValue(merchant) },
    merchantLevelPolicy: { findUnique: jest.fn(({ where }) => Promise.resolve(policies.find((p) => p.level === where.level) ?? null)) },
    limitSettings: { findUnique: jest.fn().mockResolvedValue({ usdToBobRate: new Prisma.Decimal("6.96") }) },
    merchantMonthlyVolume: { findUnique: jest.fn().mockResolvedValue(null) },
    supportCase: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: "c1" }) },
  };
  return { tx, prisma, service: new LimitsService(prisma as any) };
}

const intent = (over: Record<string, unknown> = {}) => ({ id: "pi_1", merchantId: "m_1", amount: 100_000, currency: "BOB", metadata: {}, livemode: true, limitStatus: null, ...over });

describe("laPazMonth", () => {
  it("uses La Paz time at the month boundary", () => {
    expect(laPazMonth(new Date("2026-10-01T03:59:00Z"))).toBe("2026-09");
    expect(laPazMonth(new Date("2026-10-01T04:00:00Z"))).toBe("2026-10");
  });
});

describe("LimitsService.effectiveLimits", () => {
  it("prefers merchant overrides", async () => {
    const { service } = setup({ id: "m_1", level: 1, monthlyLimitOverride: 5_000_000, perPaymentLimitOverride: null });
    await expect(service.effectiveLimits("m_1")).resolves.toMatchObject({ monthlyLimit: 5_000_000, perPaymentLimit: 200_000, misconfigured: false });
  });

  it("fails closed and opens one ops case when a live level has no limit", async () => {
    const { service, prisma } = setup({ id: "m_1", level: 3, monthlyLimitOverride: null, perPaymentLimitOverride: null });
    await expect(service.effectiveLimits("m_1")).resolves.toMatchObject({ liveEnabled: false, misconfigured: true });
    expect(prisma.supportCase.create).toHaveBeenCalledTimes(1);
  });
});

describe("LimitsService.amountInBob", () => {
  it("counts an international charge at its original BOB amount", async () => {
    const { service } = setup();
    await expect(service.amountInBob(intent({ amount: 1_437, currency: "USD", metadata: { fx: { originalAmount: 10_000, originalCurrency: "BOB", rate: 6.96 } } })))
      .resolves.toEqual({ amountBob: 10_000, fxRate: null });
  });

  it("converts a USD-priced intent at the ops rate, rounding up", async () => {
    const { service } = setup();
    const result = await service.amountInBob(intent({ amount: 1_000, currency: "USD" }));
    expect(result.amountBob).toBe(6_960);
    expect(result.fxRate?.toString()).toBe("6.96");
  });

  it("refuses other currencies", async () => {
    const { service } = setup();
    await expect(service.amountInBob(intent({ currency: "EUR" }))).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe("LimitsService.assertPerPayment", () => {
  it("allows exactly the maximum and refuses one centavo more", async () => {
    const { service } = setup();
    await expect(service.assertPerPayment("m_1", intent({ amount: 200_000 }), "buyer")).resolves.toBeUndefined();
    await expect(service.assertPerPayment("m_1", intent({ amount: 200_001 }), "merchant"))
      .rejects.toMatchObject({ response: { code: "per_payment_limit_exceeded", message: "Este cobro supera el máximo por pago de tu nivel." } });
  });

  it("shows buyers the neutral message", async () => {
    const { service } = setup();
    await expect(service.assertPerPayment("m_1", intent({ amount: 200_001 }), "buyer"))
      .rejects.toMatchObject({ response: { code: "per_payment_limit_exceeded", message: "Este comercio no puede recibir pagos en este momento." } });
  });
});

describe("LimitsService.reserve", () => {
  const now = new Date("2026-09-15T12:00:00Z");

  it("never touches TEST payments", async () => {
    const { service, tx } = setup();
    await service.reserve(tx as any, intent({ livemode: false }), now);
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it("does not reserve twice for a retried confirm", async () => {
    const { service, tx } = setup();
    await service.reserve(tx as any, intent({ limitStatus: "RESERVED" }), now);
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it("reserves again after a failed attempt released", async () => {
    const { service, tx } = setup();
    await service.reserve(tx as any, intent({ limitStatus: "RELEASED" }), now);
    expect(tx.$executeRaw).toHaveBeenCalledTimes(2); // row insert + conditional reserve
  });

  it("refuses with limit_exceeded when the conditional update matches nothing", async () => {
    const { service, tx } = setup(undefined, 0); // both raw statements report 0 rows
    await expect(service.reserve(tx as any, intent(), now))
      .rejects.toMatchObject({ response: { code: "limit_exceeded", message: "Este comercio no puede recibir pagos en este momento." } });
    expect(tx.paymentIntent.update).not.toHaveBeenCalled();
  });

  it("records the month and amount and reports crossing 80% once", async () => {
    const { service, tx } = setup();
    await expect(service.reserve(tx as any, intent(), now)).resolves.toEqual({ crossedWarning: true });
    expect(tx.paymentIntent.update).toHaveBeenCalledWith({ where: { id: "pi_1" }, data: { limitMonth: "2026-09", limitAmountBob: 100_000, limitFxRate: null, limitStatus: "RESERVED" } });
    expect(tx.merchantMonthlyVolume.update).toHaveBeenCalledWith({ where: { merchantId_month: { merchantId: "m_1", month: "2026-09" } }, data: { warnedAt: now } });
  });
});

describe("LimitsService.settle/release", () => {
  it("moves the amount only while the intent is still RESERVED", async () => {
    const { service, tx } = setup();
    tx.paymentIntent.findUnique.mockResolvedValue({ merchantId: "m_1", limitMonth: "2026-09", limitAmountBob: 100_000, limitStatus: "RESERVED" });
    await service.settle(tx as any, "pi_1");
    expect(tx.paymentIntent.updateMany).toHaveBeenCalledWith({ where: { id: "pi_1", limitStatus: "RESERVED" }, data: { limitStatus: "SETTLED" } });
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);

    tx.paymentIntent.updateMany.mockResolvedValue({ count: 0 });
    await service.release(tx as any, "pi_1");
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it("does nothing for an intent that was never reserved", async () => {
    const { service, tx } = setup();
    tx.paymentIntent.findUnique.mockResolvedValue({ merchantId: "m_1", limitMonth: null, limitAmountBob: null, limitStatus: null });
    await service.release(tx as any, "pi_1");
    expect(tx.paymentIntent.updateMany).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx jest src/limits/limits.service.spec.ts`
Expected: FAIL, cannot find module `./limits.service`.

- [ ] **Step 3: Implement**

`apps/api/src/limits/limit-errors.ts`:
```ts
import { ForbiddenException } from "@nestjs/common";

export const BUYER_REFUSAL = "Este comercio no puede recibir pagos en este momento.";

export function limitExceeded() {
  return new ForbiddenException({ code: "limit_exceeded", message: BUYER_REFUSAL });
}

export function perPaymentLimitExceeded(audience: "merchant" | "buyer") {
  return new ForbiddenException({
    code: "per_payment_limit_exceeded",
    message: audience === "merchant" ? "Este cobro supera el máximo por pago de tu nivel." : BUYER_REFUSAL,
  });
}
```

`apps/api/src/limits/limits.service.ts`:
```ts
import { Injectable, Logger } from "@nestjs/common";
import { LimitReservationStatus, Prisma, SupportCaseCategory } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { openOpsCaseOnce } from "../ops/ops-escalation";
import { limitExceeded, perPaymentLimitExceeded } from "./limit-errors";

export type EffectiveLimits = { level: number; levelName: string; liveEnabled: boolean; monthlyLimit: number | null; perPaymentLimit: number | null; misconfigured: boolean };
export type ReservableIntent = { id: string; merchantId: string; amount: number; currency: string; metadata: unknown; livemode: boolean; limitStatus: LimitReservationStatus | null };
export type LimitUsage = EffectiveLimits & { month: string; used: number; resetsAt: string };

const LA_PAZ = new Intl.DateTimeFormat("en-CA", { timeZone: "America/La_Paz", year: "numeric", month: "2-digit" });

/** Month key the limit counts in: the calendar month in La Paz (UTC-4, no DST). */
export function laPazMonth(at: Date): string {
  const parts = Object.fromEntries(LA_PAZ.formatToParts(at).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}`;
}

function nextMonthStart(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  return `${next}-01T04:00:00.000Z`;
}

/**
 * ASFI afiliación: how much each merchant may collect live, by verification
 * level. Reservation happens inside the confirm transaction before any rail
 * call, with one conditional UPDATE so concurrent confirms can't overshoot.
 */
@Injectable()
export class LimitsService {
  private readonly logger = new Logger(LimitsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async effectiveLimits(merchantId: string): Promise<EffectiveLimits> {
    const merchant = await this.prisma.merchant.findUniqueOrThrow({
      where: { id: merchantId },
      select: { id: true, level: true, monthlyLimitOverride: true, perPaymentLimitOverride: true },
    });
    const policy = await this.prisma.merchantLevelPolicy.findUnique({ where: { level: merchant.level } });
    const monthlyLimit = merchant.monthlyLimitOverride ?? policy?.monthlyLimit ?? null;
    const perPaymentLimit = merchant.perPaymentLimitOverride ?? policy?.perPaymentLimit ?? null;
    const misconfigured = !policy || (policy.liveEnabled && (monthlyLimit === null || perPaymentLimit === null));
    if (misconfigured) {
      this.logger.error(`Merchant ${merchantId} has no usable limits at level ${merchant.level}; live payments refused`);
      await openOpsCaseOnce(this.prisma, {
        merchantId,
        dedupeKey: `limits-misconfigured:${merchantId}`,
        summary: `Límites sin configurar para el nivel ${merchant.level} (limits-misconfigured:${merchantId}). Los cobros en vivo están bloqueados hasta que ops defina montos.`,
        category: SupportCaseCategory.PAYMENTS,
      });
    }
    return {
      level: merchant.level,
      levelName: policy?.name ?? `Nivel ${merchant.level}`,
      liveEnabled: Boolean(policy?.liveEnabled) && !misconfigured,
      monthlyLimit,
      perPaymentLimit,
      misconfigured,
    };
  }

  async amountInBob(intent: { amount: number; currency: string; metadata: unknown }): Promise<{ amountBob: number; fxRate: Prisma.Decimal | null }> {
    const fx = (intent.metadata as { fx?: { originalAmount?: number; originalCurrency?: string } } | null)?.fx;
    if (fx?.originalCurrency === "BOB" && typeof fx.originalAmount === "number") return { amountBob: fx.originalAmount, fxRate: null };
    if (intent.currency === "BOB") return { amountBob: intent.amount, fxRate: null };
    if (intent.currency === "USD") {
      const settings = await this.prisma.limitSettings.findUnique({ where: { id: "singleton" } });
      if (!settings) throw limitExceeded();
      return { amountBob: Math.ceil(intent.amount * Number(settings.usdToBobRate)), fxRate: settings.usdToBobRate };
    }
    throw limitExceeded();
  }

  async assertPerPayment(merchantId: string, intent: { amount: number; currency: string; metadata: unknown }, audience: "merchant" | "buyer") {
    const limits = await this.effectiveLimits(merchantId);
    if (!limits.liveEnabled) throw audience === "merchant" ? perPaymentLimitExceeded("merchant") : limitExceeded();
    const { amountBob } = await this.amountInBob(intent);
    if (amountBob > limits.perPaymentLimit!) throw perPaymentLimitExceeded(audience);
  }

  async reserve(tx: Prisma.TransactionClient, intent: ReservableIntent, now = new Date()): Promise<{ crossedWarning: boolean }> {
    if (!intent.livemode || intent.amount === 0) return { crossedWarning: false };
    if (intent.limitStatus === LimitReservationStatus.RESERVED || intent.limitStatus === LimitReservationStatus.SETTLED) return { crossedWarning: false };
    const limits = await this.effectiveLimits(intent.merchantId);
    if (!limits.liveEnabled) throw limitExceeded();
    const { amountBob, fxRate } = await this.amountInBob(intent);
    if (amountBob > limits.perPaymentLimit!) throw limitExceeded();
    const month = laPazMonth(now);
    const key = { merchantId_month: { merchantId: intent.merchantId, month } };
    // Not prisma upsert: two first-of-month confirms can race to create the row.
    await tx.$executeRaw`INSERT INTO "MerchantMonthlyVolume" ("merchantId", month) VALUES (${intent.merchantId}, ${month}) ON CONFLICT DO NOTHING`;
    const updated = await tx.$executeRaw`
      UPDATE "MerchantMonthlyVolume" SET reserved = reserved + ${amountBob}
      WHERE "merchantId" = ${intent.merchantId} AND month = ${month}
        AND reserved + settled + ${amountBob} <= ${limits.monthlyLimit!}
    `;
    if (updated === 0) throw limitExceeded();
    await tx.paymentIntent.update({
      where: { id: intent.id },
      data: { limitMonth: month, limitAmountBob: amountBob, limitFxRate: fxRate, limitStatus: LimitReservationStatus.RESERVED },
    });
    const volume = await tx.merchantMonthlyVolume.findUniqueOrThrow({ where: key });
    const crossedWarning = !volume.warnedAt && (volume.reserved + volume.settled) * 10 >= limits.monthlyLimit! * 8;
    if (crossedWarning) await tx.merchantMonthlyVolume.update({ where: key, data: { warnedAt: now } });
    return { crossedWarning };
  }

  settle(tx: Prisma.TransactionClient, paymentIntentId: string) {
    return this.finish(tx, paymentIntentId, LimitReservationStatus.SETTLED);
  }

  release(tx: Prisma.TransactionClient, paymentIntentId: string) {
    return this.finish(tx, paymentIntentId, LimitReservationStatus.RELEASED);
  }

  /** Moves a reservation exactly once: the conditional status flip is the guard. */
  private async finish(tx: Prisma.TransactionClient, paymentIntentId: string, to: LimitReservationStatus) {
    const intent = await tx.paymentIntent.findUnique({
      where: { id: paymentIntentId },
      select: { merchantId: true, limitMonth: true, limitAmountBob: true, limitStatus: true },
    });
    if (!intent || intent.limitStatus !== LimitReservationStatus.RESERVED || !intent.limitMonth || intent.limitAmountBob === null) return;
    const flipped = await tx.paymentIntent.updateMany({ where: { id: paymentIntentId, limitStatus: LimitReservationStatus.RESERVED }, data: { limitStatus: to } });
    if (flipped.count === 0) return;
    const amount = intent.limitAmountBob;
    if (to === LimitReservationStatus.SETTLED) {
      await tx.$executeRaw`UPDATE "MerchantMonthlyVolume" SET reserved = reserved - ${amount}, settled = settled + ${amount} WHERE "merchantId" = ${intent.merchantId} AND month = ${intent.limitMonth}`;
    } else {
      await tx.$executeRaw`UPDATE "MerchantMonthlyVolume" SET reserved = reserved - ${amount} WHERE "merchantId" = ${intent.merchantId} AND month = ${intent.limitMonth}`;
    }
  }

  async usage(merchantId: string, now = new Date()): Promise<LimitUsage> {
    const limits = await this.effectiveLimits(merchantId);
    const month = laPazMonth(now);
    const volume = await this.prisma.merchantMonthlyVolume.findUnique({ where: { merchantId_month: { merchantId, month } } });
    return { ...limits, month, used: (volume?.reserved ?? 0) + (volume?.settled ?? 0), resetsAt: nextMonthStart(month) };
  }
}
```

`apps/api/src/limits/limits.module.ts`:
```ts
import { Module } from "@nestjs/common";
import { LimitsService } from "./limits.service";

@Module({ providers: [LimitsService], exports: [LimitsService] })
export class LimitsModule {}
```
Add `LimitsModule` to `AppModule` imports.

- [ ] **Step 4: Run it to see it pass**

Run: `npx jest src/limits/limits.service.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/limits apps/api/src/app.module.ts
git commit -m "feat(limits): compute merchant limits and reserve monthly volume atomically"
```

---

### Task 3: Enforce limits in payment intents

**Files:**
- Modify: `apps/api/src/payment-intents/payment-intents.service.ts` (constructor; `create`/`createInTransaction` ~L134–165; `confirm` ~L306; `applyRailResult` ~L530–600; `cancelById` ~L262)
- Modify: `apps/api/src/payment-intents/payment-intents.module.ts` (import `LimitsModule`)
- Modify: every `new PaymentIntentsService(` in `apps/api/src/**/*.spec.ts` (13 sites)
- Create: `apps/api/test/merchant-limits.e2e-spec.ts`

**Interfaces:**
- Consumes: `LimitsService.assertPerPayment/reserve/settle/release` (Task 2).
- Produces: `createInTransaction(tx, merchantId, livemode, dto, limitAudience: "merchant" | "buyer" = "buyer")`; `create(...)` passes `"merchant"`. The confirm transaction callback additionally returns `crossedWarning: boolean` (consumed in Task 4).

- [ ] **Step 1: Write the failing e2e spec**

`apps/api/test/merchant-limits.e2e-spec.ts` (bootstrapping copied from `test/shipping-carriers.e2e-spec.ts`). Before writing, look up three things and use them verbatim: the mock rail's decline token in `apps/api/src/rails` (used as `DECLINE_TOKEN`), the refund route/body in `apps/api/src/refunds/*.controller.ts`, and how `MerchantsService.issueLiveKeys` returns the secret.

```ts
import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request = require('supertest');
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { MerchantsService } from '../src/merchants/merchants.service';

const DECLINE_TOKEN = 'tok_card_declined'; // replace with the mock rail's decline token

describe('Merchant levels and limits', () => {
  let app: INestApplication, prisma: PrismaService, merchantId: string, liveKey: string;
  const http = () => request(app.getHttpServer());
  const createIntent = (amount: number, currency = 'BOB') => http().post('/v1/payment_intents').set({ Authorization: `Bearer ${liveKey}` }).send({ amount, currency });
  const confirm = (pi: any, token = 'tok_visa_success') => http().post(`/v1/payment_intents/${pi.id}/confirm`).set({ Authorization: `Bearer ${pi.clientSecret}` }).send({ paymentMethod: { type: 'CARD', token } });
  const volume = () => prisma.merchantMonthlyVolume.findFirst({ where: { merchantId } });

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication(); app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init(); prisma = app.get(PrismaService);
    merchantId = (await http().post('/v1/merchants').send({ name: 'Limits', email: 'limits@test.example', settlementMode: 'AGGREGATOR' }).expect(201)).body.merchant.id;
    await prisma.merchant.update({ where: { id: merchantId }, data: { status: 'ACTIVE', level: 1 } });
    liveKey = (await app.get(MerchantsService).issueLiveKeys(merchantId)).secretKey;
  });
  afterAll(async () => { await app?.close(); });
  beforeEach(async () => {
    await prisma.merchantMonthlyVolume.deleteMany({ where: { merchantId } });
    await prisma.merchant.update({ where: { id: merchantId }, data: { level: 1, monthlyLimitOverride: null, perPaymentLimitOverride: null } });
  });

  it('refuses a live intent over the per-payment max with the merchant message', async () => {
    const res = await createIntent(200_001).expect(403);
    expect(res.body).toMatchObject({ code: 'per_payment_limit_exceeded', message: 'Este cobro supera el máximo por pago de tu nivel.' });
    await createIntent(200_000).expect(201);
  });

  it('settles a successful payment and releases a failed one', async () => {
    await confirm((await createIntent(100_000).expect(201)).body).expect(201);
    expect(await volume()).toMatchObject({ reserved: 0, settled: 100_000 });
    const bad = (await createIntent(50_000).expect(201)).body;
    await confirm(bad, DECLINE_TOKEN);
    expect(await volume()).toMatchObject({ reserved: 0, settled: 100_000 });
    expect(await prisma.paymentIntent.findUniqueOrThrow({ where: { id: bad.id } })).toMatchObject({ status: 'FAILED', limitStatus: 'RELEASED' });
  });

  it('reserves again when the buyer retries a failed payment', async () => {
    const pi = (await createIntent(50_000).expect(201)).body;
    await confirm(pi, DECLINE_TOKEN);
    await confirm(pi).expect(201);
    expect(await volume()).toMatchObject({ reserved: 0, settled: 50_000 });
  });

  it('refuses at the monthly limit with the neutral message and never calls the rail', async () => {
    await prisma.merchant.update({ where: { id: merchantId }, data: { monthlyLimitOverride: 150_000 } });
    await confirm((await createIntent(100_000).expect(201)).body).expect(201);
    const over = (await createIntent(50_001).expect(201)).body;
    const res = await confirm(over).expect(403);
    expect(res.body).toMatchObject({ code: 'limit_exceeded', message: 'Este comercio no puede recibir pagos en este momento.' });
    expect(await prisma.transaction.count({ where: { paymentIntentId: over.id } })).toBe(0);
    await confirm((await createIntent(50_000).expect(201)).body).expect(201);
  });

  it('lets only one of two concurrent confirms through when both would exceed the limit', async () => {
    await prisma.merchant.update({ where: { id: merchantId }, data: { monthlyLimitOverride: 150_000 } });
    const a = (await createIntent(100_000).expect(201)).body;
    const b = (await createIntent(100_000).expect(201)).body;
    const results = await Promise.all([confirm(a), confirm(b)]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 403]);
    expect(await volume()).toMatchObject({ reserved: 0, settled: 100_000 });
  });

  it('does not free room on refund', async () => {
    const paid = (await createIntent(100_000).expect(201)).body;
    await confirm(paid).expect(201);
    await http().post('/v1/refunds').set({ Authorization: `Bearer ${liveKey}` }).send({ paymentIntentId: paid.id, amount: 100_000 }).expect(201);
    expect(await volume()).toMatchObject({ settled: 100_000 });
  });

  it('refuses live payments at level 0', async () => {
    await prisma.merchant.update({ where: { id: merchantId }, data: { level: 0 } });
    await createIntent(1_000).expect(403);
    expect(await volume()).toBeNull();
  });

  it('shows the buyer the neutral message when a store product is over the per-payment max', async () => {
    await prisma.merchant.update({ where: { id: merchantId }, data: { perPaymentLimitOverride: 5_000 } });
    const store = (await http().post('/v1/stores').set({ Authorization: `Bearer ${liveKey}` }).send({ name: 'Tienda Límite' }).expect(201)).body;
    const product = (await http().post(`/v1/stores/${store.id}/payment_links`).set({ Authorization: `Bearer ${liveKey}` }).send({ name: 'Caro', amount: 10_000, currency: 'BOB' }).expect(201)).body;
    const res = await http().post(`/v1/stores/public/${store.slug}/cart-checkout`).send({ items: [{ paymentLinkId: product.id, quantity: 1 }], fulfillmentMethod: 'pickup' }).expect(403);
    expect(res.body.message).toBe('Este comercio no puede recibir pagos en este momento.');
  });
});
```
Add one TEST-mode test using the merchant's test secret key from `POST /v1/merchants` (`body.testKeys.secretKey`): create and confirm a 10 000 000 intent → 201 and `volume()` stays `null`.

- [ ] **Step 2: Run to see it fail**

Run: `npx jest --config test/jest-e2e.json test/merchant-limits.e2e-spec.ts`
Expected: FAIL — creating over the max returns 201, no volume rows.

- [ ] **Step 3: Wire `LimitsService` into `PaymentIntentsService`**

Constructor: append `private readonly limits: LimitsService` as the last parameter. In `payment-intents.module.ts` add `LimitsModule` to imports.

`create` and `createInTransaction`:
```ts
  async create(merchantId: string, livemode: boolean, dto: CreatePaymentIntentDto) {
    return this.createInTransaction(this.prisma, merchantId, livemode, dto, "merchant");
  }

  async createInTransaction(
    tx: Pick<Prisma.TransactionClient, "paymentIntent">,
    merchantId: string,
    livemode: boolean,
    dto: CreatePaymentIntentDto,
    limitAudience: "merchant" | "buyer" = "buyer",
  ) {
    if (livemode && dto.amount > 0) {
      await this.limits.assertPerPayment(merchantId, { amount: dto.amount, currency: dto.currency ?? "BOB", metadata: dto.metadata ?? null }, limitAudience);
    }
    // ...existing body unchanged
```
Check that `PaymentIntentsController`'s create route is the only caller of `create(...)`; any other caller of `create` that is buyer-facing must call `createInTransaction` with `"buyer"` instead.

`confirm` — extend the `FOR UPDATE` query:
```ts
        SELECT id, status, "confirmationAttempts", "merchantId", "consumerUserId", metadata, amount, currency, livemode, "limitStatus" FROM "PaymentIntent" WHERE id = ${paymentIntentId} FOR UPDATE
```
(and add `livemode: boolean; limitStatus: LimitReservationStatus | null` to the row type). Right after `const confirmedStatus = transition(current.status, PaymentIntentEvent.CONFIRM);` insert:
```ts
      const reservation = await this.limits.reserve(tx, {
        id: paymentIntentId,
        merchantId: current.merchantId,
        amount: current.amount,
        currency: current.currency,
        metadata: current.metadata,
        livemode: current.livemode,
        limitStatus: current.limitStatus,
      });
```
Add `crossedWarning: reservation.crossedWarning` to the object the transaction callback returns, and to the destructuring at the top of `confirm`.

`applyRailResult` — inside its transaction, right after `const updated = await tx.paymentIntent.update(...)`:
```ts
      if (nextStatus === PaymentIntentStatus.SUCCEEDED) await this.limits.settle(tx, paymentIntentId);
      if (nextStatus === PaymentIntentStatus.FAILED) await this.limits.release(tx, paymentIntentId);
```

`cancelById` — right after its `tx.paymentIntent.update(...)`:
```ts
      await this.limits.release(tx, id);
```

No change at `apps/api/src/operations/operations.service.ts:1388` (FAILED → CANCELED; FAILED already released) or at `completeCreditPaymentInTransaction` (amount 0, never reserved).

- [ ] **Step 4: Fix unit specs**

In each spec that constructs the service, add:
```ts
const inertLimits = () => ({ assertPerPayment: jest.fn(), reserve: jest.fn().mockResolvedValue({ crossedWarning: false }), settle: jest.fn(), release: jest.fn() });
```
and append `inertLimits() as any` to every `new PaymentIntentsService(...)` (find them with `grep -rn "new PaymentIntentsService(" apps/api/src`).

- [ ] **Step 5: Run tests**

Run: `npx jest src/payment-intents src/limits && npx jest --config test/jest-e2e.json test/merchant-limits.e2e-spec.ts && npx tsc --noEmit -p tsconfig.json`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src apps/api/test/merchant-limits.e2e-spec.ts
git commit -m "feat(limits): enforce per-payment and monthly limits on live payments"
```

---

### Task 4: One 80% warning email per month

**Files:**
- Create: `apps/api/src/limits/limits-warning.service.ts`, `apps/api/src/limits/limits-warning.service.spec.ts`
- Modify: `apps/api/src/limits/limits.module.ts` (import `DashboardModule` for `EMAIL_PROVIDER`; provide and export `LimitsWarningService`)
- Modify: `apps/api/src/payment-intents/payment-intents.service.ts` (`confirm`, after the transaction)

**Interfaces:**
- Consumes: `crossedWarning` (Task 3), `LimitsService.usage` (Task 2), `EmailProvider.send` (`apps/api/src/dashboard/interfaces/email-provider.interface.ts` — check the real `SendEmailRequest` field names and use them in both the code and the spec).
- Produces: `LimitsWarningService.notify(merchantId: string): Promise<void>` — never throws.

- [ ] **Step 1: Failing spec**

```ts
import { LimitsWarningService } from "./limits-warning.service";

it("emails every verified, active user of the merchant and survives provider errors", async () => {
  const prisma = { merchantUser: { findMany: jest.fn().mockResolvedValue([{ email: "a@x.bo" }, { email: "b@x.bo" }]) } };
  const email = { send: jest.fn().mockRejectedValueOnce(new Error("down")).mockResolvedValue(undefined) };
  const limits = { usage: jest.fn().mockResolvedValue({ levelName: "Persona", used: 800_000, monthlyLimit: 1_000_000, resetsAt: "2026-10-01T04:00:00.000Z" }) };
  await expect(new LimitsWarningService(prisma as any, email as any, limits as any).notify("m_1")).resolves.toBeUndefined();
  expect(prisma.merchantUser.findMany).toHaveBeenCalledWith({ where: { merchantId: "m_1", deletedAt: null, emailVerifiedAt: { not: null } }, select: { email: true } });
  expect(email.send).toHaveBeenCalledTimes(2);
  expect(email.send.mock.calls[1][0]).toMatchObject({ to: "b@x.bo", subject: "Llegaste al 80% de tu límite mensual en pagosYa" });
});
```

- [ ] **Step 2: Run** `npx jest src/limits/limits-warning.service.spec.ts` → FAIL (module missing).

- [ ] **Step 3: Implement**

```ts
import { Inject, Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { EMAIL_PROVIDER, EmailProvider } from "../dashboard/interfaces/email-provider.interface";
import { LimitsService } from "./limits.service";

const bob = (centavos: number) => `Bs ${(centavos / 100).toLocaleString("es-BO", { maximumFractionDigits: 0 })}`;

@Injectable()
export class LimitsWarningService {
  private readonly logger = new Logger(LimitsWarningService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(EMAIL_PROVIDER) private readonly email: EmailProvider,
    private readonly limits: LimitsService,
  ) {}

  /** Best effort, after the confirm commits: a mail outage must never affect a payment. */
  async notify(merchantId: string): Promise<void> {
    try {
      const usage = await this.limits.usage(merchantId);
      const users = await this.prisma.merchantUser.findMany({ where: { merchantId, deletedAt: null, emailVerifiedAt: { not: null } }, select: { email: true } });
      const resets = new Date(usage.resetsAt).toLocaleDateString("es-BO", { timeZone: "America/La_Paz" });
      for (const user of users) {
        await this.email.send({
          to: user.email,
          subject: "Llegaste al 80% de tu límite mensual en pagosYa",
          body: `Este mes ya cobraste ${bob(usage.used)} de ${bob(usage.monthlyLimit ?? 0)} permitidos para tu nivel ${usage.levelName}.\n\nAl llegar al 100% pausaremos los cobros en vivo hasta el ${resets} o hasta que subas de nivel desde tu panel (Verificación).`,
        }).catch((error) => this.logger.warn(`80% limit email to ${user.email} failed: ${(error as Error).message}`));
      }
    } catch (error) {
      this.logger.warn(`80% limit warning for ${merchantId} failed: ${(error as Error).message}`);
    }
  }
}
```
Inject `LimitsWarningService` into `PaymentIntentsService` as another trailing constructor parameter (extend the spec stubs with `{ notify: jest.fn() } as any`). In `confirm`, after the `$transaction` resolves and before the rail call:
```ts
    if (crossedWarning) void this.limitsWarning.notify(merchantId);
```

- [ ] **Step 4: Run** `npx jest src/limits src/payment-intents` → PASS.

- [ ] **Step 5: Commit** — `git commit -m "feat(limits): email merchants once when they reach 80% of their monthly limit"`

---

### Task 5: Private identity documents

**Files:**
- Create: `apps/api/src/merchants/identity-documents.service.ts`, `apps/api/src/merchants/identity-documents.service.spec.ts`, `apps/api/src/merchants/dto/upload-kyc-document.dto.ts`
- Modify: `apps/api/src/merchants/merchants.module.ts` (provide `PrivateFilesService`, `IdentityDocumentsService`, as `shipping.module.ts` does)
- Modify: `apps/api/src/merchants/merchants.controller.ts`
- Modify: `apps/api/src/uploads/uploads.service.ts` (export `assertSafeImageDimensions` if it isn't)
- Modify: `apps/api/src/main.ts:70` (multipart body exception)
- Test (e2e): extend `apps/api/test/merchant-limits.e2e-spec.ts`

**Interfaces:**
- Consumes: `PrivateFilesService.put(bytes, mime): Promise<string>` and `.get(key): Promise<Buffer>` (`apps/api/src/commerce-platform/private-files.service.ts`); `detectedMediaMime`, `assertSafeImageDimensions`, `MAX_IMAGE_UPLOAD_BYTES` (`apps/api/src/uploads/uploads.service.ts`).
- Produces:
  - `IdentityDocumentsService.upload(merchantId, slot: KycDocumentSlot, file: { buffer: Buffer; mimetype: string }): Promise<{ id: string; slot: KycDocumentSlot }>`
  - `IdentityDocumentsService.assertOwned(merchantId, ids: { ciFrontDocId?: string; ciBackDocId?: string; selfieDocId?: string }): Promise<void>` — 400 unless each given id exists, belongs to the merchant and matches its slot.
  - `IdentityDocumentsService.readForOps(submissionId, slot: KycDocumentSlot, actor: OpsActor): Promise<{ bytes: Buffer; mimeType: string }>` — writes a `kyc.document_viewed` audit entry.
  - Routes: `POST v1/merchants/kyc/documents` (multipart `file` + field `slot`; MerchantAuthGuard) → `{ id, slot }`; `GET v1/merchants/kyc/:submissionId/documents/:slot` (OpsAuthGuard) → image bytes with `Cache-Control: no-store`.

- [ ] **Step 1: Failing unit spec**

```ts
import { BadRequestException } from "@nestjs/common";
import { IdentityDocumentsService } from "./identity-documents.service";

// 1x1 transparent PNG
const png = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8cfc0f01f0005000201a5f1a1f60000000049454e44ae426082", "hex");
const key = "0f8fad5b-d9cb-469f-a165-70867728950e";

function setup() {
  const prisma: any = {
    merchantKycDocument: { create: jest.fn().mockResolvedValue({ id: "doc_1", slot: "CI_FRONT" }), findMany: jest.fn(), findUnique: jest.fn() },
    merchantKycSubmission: { findUnique: jest.fn() },
  };
  prisma.$transaction = jest.fn((fn) => fn(prisma));
  const files = { put: jest.fn().mockResolvedValue(key), get: jest.fn().mockResolvedValue(png) };
  const audit = { record: jest.fn() };
  return { prisma, files, audit, service: new IdentityDocumentsService(prisma, files as any, audit as any) };
}

it("stores an image privately and binds it to the merchant", async () => {
  const { service, files, prisma } = setup();
  await expect(service.upload("m_1", "CI_FRONT", { buffer: png, mimetype: "image/png" })).resolves.toEqual({ id: "doc_1", slot: "CI_FRONT" });
  expect(files.put).toHaveBeenCalledWith(png, "image/png");
  expect(prisma.merchantKycDocument.create).toHaveBeenCalledWith({
    data: { merchantId: "m_1", slot: "CI_FRONT", storageKey: key, mimeType: "image/png", byteSize: png.length },
    select: { id: true, slot: true },
  });
});

it("rejects non-images and mislabeled files", async () => {
  const { service } = setup();
  await expect(service.upload("m_1", "SELFIE", { buffer: Buffer.from("%PDF-1.7"), mimetype: "application/pdf" })).rejects.toBeInstanceOf(BadRequestException);
  await expect(service.upload("m_1", "SELFIE", { buffer: Buffer.from("not a png"), mimetype: "image/png" })).rejects.toBeInstanceOf(BadRequestException);
});

it("rejects another merchant's document or a wrong slot", async () => {
  const { service, prisma } = setup();
  prisma.merchantKycDocument.findMany.mockResolvedValue([{ id: "doc_1", merchantId: "m_2", slot: "CI_FRONT" }]);
  await expect(service.assertOwned("m_1", { ciFrontDocId: "doc_1" })).rejects.toBeInstanceOf(BadRequestException);
  prisma.merchantKycDocument.findMany.mockResolvedValue([{ id: "doc_1", merchantId: "m_1", slot: "SELFIE" }]);
  await expect(service.assertOwned("m_1", { ciFrontDocId: "doc_1" })).rejects.toBeInstanceOf(BadRequestException);
  prisma.merchantKycDocument.findMany.mockResolvedValue([{ id: "doc_1", merchantId: "m_1", slot: "CI_FRONT" }]);
  await expect(service.assertOwned("m_1", { ciFrontDocId: "doc_1" })).resolves.toBeUndefined();
});

it("audits every ops view", async () => {
  const { service, prisma, audit } = setup();
  prisma.merchantKycSubmission.findUnique.mockResolvedValue({ id: "kyc_1", merchantId: "m_1", selfieDocId: "doc_9" });
  prisma.merchantKycDocument.findUnique.mockResolvedValue({ id: "doc_9", merchantId: "m_1", storageKey: key, mimeType: "image/png" });
  await expect(service.readForOps("kyc_1", "SELFIE", { id: "ops_1", name: "Ana", email: "ana@pagosya.bo" })).resolves.toEqual({ bytes: png, mimeType: "image/png" });
  expect(audit.record).toHaveBeenCalledWith(prisma, expect.objectContaining({ action: "kyc.document_viewed", targetId: "kyc_1", metadata: { slot: "SELFIE", documentId: "doc_9" } }));
});
```

- [ ] **Step 2: Run** `npx jest src/merchants/identity-documents.service.spec.ts` → FAIL.

- [ ] **Step 3: Implement**

```ts
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { KycDocumentSlot } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { PrivateFilesService } from "../commerce-platform/private-files.service";
import { AuditLogService } from "../ops/audit-log.service";
import { assertSafeImageDimensions, detectedMediaMime, MAX_IMAGE_UPLOAD_BYTES } from "../uploads/uploads.service";
import type { OpsActor } from "./kyc.service";

const IMAGE_MIMES = new Set(["image/png", "image/jpeg", "image/webp"]);
const SLOT_FIELD = { CI_FRONT: "ciFrontDocId", CI_BACK: "ciBackDocId", SELFIE: "selfieDocId" } as const;
type DocIds = Partial<Record<(typeof SLOT_FIELD)[KycDocumentSlot], string>>;

/** CI photos and selfies: private storage only, never the public /v1/uploads path. */
@Injectable()
export class IdentityDocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly files: PrivateFilesService,
    private readonly auditLog: AuditLogService,
  ) {}

  async upload(merchantId: string, slot: KycDocumentSlot, file: { buffer: Buffer; mimetype: string }) {
    if (!IMAGE_MIMES.has(file.mimetype)) throw new BadRequestException("Sube una foto en JPG, PNG o WEBP.");
    if (file.buffer.length > MAX_IMAGE_UPLOAD_BYTES) throw new BadRequestException("La foto supera los 8 MB.");
    if (detectedMediaMime(file.buffer) !== file.mimetype) throw new BadRequestException("El archivo no es una imagen válida.");
    assertSafeImageDimensions(file.buffer, file.mimetype);
    const storageKey = await this.files.put(file.buffer, file.mimetype);
    return this.prisma.merchantKycDocument.create({
      data: { merchantId, slot, storageKey, mimeType: file.mimetype, byteSize: file.buffer.length },
      select: { id: true, slot: true },
    });
  }

  async assertOwned(merchantId: string, ids: DocIds) {
    const wanted = (Object.keys(SLOT_FIELD) as KycDocumentSlot[]).flatMap((slot) => {
      const id = ids[SLOT_FIELD[slot]];
      return id ? [{ slot, id }] : [];
    });
    if (!wanted.length) return;
    const docs = await this.prisma.merchantKycDocument.findMany({ where: { id: { in: wanted.map((w) => w.id) } }, select: { id: true, merchantId: true, slot: true } });
    for (const w of wanted) {
      const doc = docs.find((d) => d.id === w.id);
      if (!doc || doc.merchantId !== merchantId || doc.slot !== w.slot) throw new BadRequestException("Vuelve a subir las fotos de tu CI.");
    }
  }

  async readForOps(submissionId: string, slot: KycDocumentSlot, actor: OpsActor) {
    const submission = await this.prisma.merchantKycSubmission.findUnique({ where: { id: submissionId } });
    const documentId = submission?.[SLOT_FIELD[slot]];
    if (!submission || !documentId) throw new NotFoundException("Documento no encontrado");
    const doc = await this.prisma.merchantKycDocument.findUnique({ where: { id: documentId } });
    if (!doc || doc.merchantId !== submission.merchantId) throw new NotFoundException("Documento no encontrado");
    const bytes = await this.files.get(doc.storageKey);
    await this.prisma.$transaction((tx) => this.auditLog.record(tx, {
      actorType: "OPS_USER",
      actorId: actor.id,
      actorLabel: `${actor.name} <${actor.email}>`,
      action: "kyc.document_viewed",
      targetType: "MerchantKycSubmission",
      targetId: submissionId,
      metadata: { slot, documentId },
    }));
    return { bytes, mimeType: doc.mimeType };
  }
}
```

`dto/upload-kyc-document.dto.ts`:
```ts
import { ApiProperty } from "@nestjs/swagger";
import { KycDocumentSlot } from "@prisma/client";
import { IsEnum } from "class-validator";

export class UploadKycDocumentDto {
  @ApiProperty({ enum: KycDocumentSlot })
  @IsEnum(KycDocumentSlot)
  slot!: KycDocumentSlot;
}
```

Routes in `merchants.controller.ts` (declare both **before** `@Post("kyc/:submissionId/review")` so `kyc/documents` isn't read as a submission id):
```ts
  @Post("kyc/documents")
  @ApiBearerAuth()
  @ApiConsumes("multipart/form-data")
  @UseGuards(MerchantAuthGuard)
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 8_000_000 } }))
  uploadKycDocument(@CurrentMerchant() merchant: { id: string }, @UploadedFile() file: Express.Multer.File, @Body() dto: UploadKycDocumentDto) {
    if (!file) throw new BadRequestException("Selecciona una foto");
    return this.identityDocuments.upload(merchant.id, dto.slot, file);
  }

  @Get("kyc/:submissionId/documents/:slot")
  @ApiBearerAuth()
  @UseGuards(OpsAuthGuard)
  async viewKycDocument(
    @CurrentOpsUser() opsUser: OpsActor,
    @Param("submissionId") submissionId: string,
    @Param("slot", new ParseEnumPipe(KycDocumentSlot)) slot: KycDocumentSlot,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { bytes, mimeType } = await this.identityDocuments.readForOps(submissionId, slot, opsUser);
    res.set({ "Content-Type": mimeType, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
    return new StreamableFile(bytes);
  }
```
In `apps/api/src/main.ts:70` extend the multipart condition so `/v1/merchants/kyc/documents` is handled the same way as `/v1/uploads`.

- [ ] **Step 4: e2e additions** (in `merchant-limits.e2e-spec.ts`)

```ts
  it('keeps KYC photos out of the public uploads route', async () => {
    const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8cfc0f01f0005000201a5f1a1f60000000049454e44ae426082', 'hex');
    const doc = (await http().post('/v1/merchants/kyc/documents').set({ Authorization: `Bearer ${liveKey}` }).field('slot', 'CI_FRONT').attach('file', png, { filename: 'ci.png', contentType: 'image/png' }).expect(201)).body;
    const stored = await prisma.merchantKycDocument.findUniqueOrThrow({ where: { id: doc.id } });
    await http().get(`/v1/uploads/${stored.storageKey}`).expect(404);
    await http().get(`/v1/uploads/private%2F${stored.storageKey}`).expect(404);
  });
```
Ops-only viewing is covered in Task 7's e2e additions (they mint ops tokens).

- [ ] **Step 5: Run** `npx jest src/merchants && npx jest --config test/jest-e2e.json test/merchant-limits.e2e-spec.ts` → PASS.

- [ ] **Step 6: Commit** — `git commit -m "feat(kyc): store CI photos and selfies privately, viewable only by ops"`

---

### Task 6: KYC by level

**Files:**
- Modify: `apps/api/src/merchants/dto/submit-kyc.dto.ts`, `apps/api/src/merchants/kyc.service.ts`, `apps/api/src/merchants/kyc.service.spec.ts`

**Interfaces:**
- Consumes: `IdentityDocumentsService.assertOwned` (Task 5).
- Produces: `SubmitKycDto` gains `targetLevel?: 1 | 2` (default 2), `ciFrontDocId?`, `ciBackDocId?`, `selfieDocId?`; `taxId`, `legalRepName`, `legalRepDocumentId` become optional in the DTO and are enforced in the service. `KycService` constructor gains `IdentityDocumentsService` as its 4th parameter. Approve sets `Merchant.level = targetLevel`. `listPending` includes `merchant.level`.

- [ ] **Step 1: Failing tests** (add to `kyc.service.spec.ts`; pass `docsOk() as any` as the new 4th argument in all existing tests)

```ts
const docsOk = () => ({ assertOwned: jest.fn().mockResolvedValue(undefined) });
const person = { targetLevel: 1, legalName: "Juana Mamani", legalRepDocumentId: "7654321 LP", payoutBankAccount: "BNB 4012345678", ciFrontDocId: "d1", ciBackDocId: "d2", selfieDocId: "d3" };
const kycPrisma = (merchant: Record<string, unknown>) => ({
  merchant: { findUniqueOrThrow: jest.fn().mockResolvedValue(merchant) },
  merchantKycSubmission: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: "kyc_1" }) },
});

it("accepts a level 1 submission without NIT when all three photos are there", async () => {
  const prisma = kycPrisma({ id: "m_1", status: "PENDING", level: 0 });
  const service = new KycService(prisma as any, makeFakeAuditLog() as any, termsAccepted() as any, docsOk() as any);
  await service.submit("m_1", person as any);
  expect(prisma.merchantKycSubmission.create).toHaveBeenCalledWith({ data: expect.objectContaining({ targetLevel: 1, taxId: null, ciFrontDocId: "d1" }) });
});

it("rejects level 1 without the photos and level 2 without NIT", async () => {
  const service = new KycService(kycPrisma({ id: "m_1", status: "PENDING", level: 0 }) as any, makeFakeAuditLog() as any, termsAccepted() as any, docsOk() as any);
  await expect(service.submit("m_1", { ...person, selfieDocId: undefined } as any)).rejects.toThrow("Sube las dos caras de tu CI y una selfie con tu CI");
  await expect(service.submit("m_1", { ...person, targetLevel: 2 } as any)).rejects.toThrow("Para el nivel Negocio necesitamos NIT, razón social y representante legal");
});

it("lets an ACTIVE level 1 merchant apply for level 2 but not re-apply for level 1", async () => {
  const prisma = kycPrisma({ id: "m_1", status: "ACTIVE", level: 1 });
  const service = new KycService(prisma as any, makeFakeAuditLog() as any, termsAccepted() as any, docsOk() as any);
  await expect(service.submit("m_1", person as any)).rejects.toThrow("Ya tienes este nivel");
  await service.submit("m_1", { ...person, targetLevel: 2, taxId: "1023456028", legalRepName: "Juana Mamani" } as any);
  expect(prisma.merchantKycSubmission.create).toHaveBeenCalledTimes(1);
});

it("lets a grandfathered level 2 merchant apply for nothing lower", async () => {
  const service = new KycService(kycPrisma({ id: "m_1", status: "ACTIVE", level: 2 }) as any, makeFakeAuditLog() as any, termsAccepted() as any, docsOk() as any);
  await expect(service.submit("m_1", { ...person, targetLevel: 2, taxId: "1023456028", legalRepName: "X" } as any)).rejects.toThrow("Ya tienes este nivel");
});
```
Also copy the existing "approves" test in the file into a new test whose pending submission has `targetLevel: 1`, and assert `tx.merchant.update` was called with `{ where: { id: <merchantId> }, data: { status: MerchantStatus.ACTIVE, level: 1 } }`.

- [ ] **Step 2: Run** `npx jest src/merchants/kyc.service.spec.ts` → FAIL.

- [ ] **Step 3: Implement**

DTO additions:
```ts
  @ApiPropertyOptional({ enum: [1, 2], default: 2 })
  @IsOptional()
  @IsIn([1, 2])
  targetLevel?: 1 | 2;

  @ApiPropertyOptional() @IsOptional() @IsString() ciFrontDocId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() ciBackDocId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() selfieDocId?: string;
```
Mark `taxId`, `legalRepName`, `legalRepDocumentId` `@IsOptional()` and `?:` (keep their `@MinLength`). `legalName` stays required (for level 1 it holds the person's full name).

`KycService.submit`:
```ts
  async submit(merchantId: string, dto: SubmitKycDto) {
    const merchant = await this.prisma.merchant.findUniqueOrThrow({ where: { id: merchantId } });
    const targetLevel = dto.targetLevel ?? 2;
    if (targetLevel <= merchant.level) throw new BadRequestException("Ya tienes este nivel");
    if (await this.terms.needsMerchantAcceptance(merchantId)) {
      throw new BadRequestException("Debes aceptar los Términos y Condiciones vigentes antes de enviar tu verificación");
    }
    if (!dto.ciFrontDocId || !dto.ciBackDocId || !dto.selfieDocId) {
      throw new BadRequestException("Sube las dos caras de tu CI y una selfie con tu CI");
    }
    if (targetLevel >= 2 && (!dto.taxId || !dto.legalRepName || !dto.legalRepDocumentId)) {
      throw new BadRequestException("Para el nivel Negocio necesitamos NIT, razón social y representante legal");
    }
    if (targetLevel === 1 && !dto.legalRepDocumentId) throw new BadRequestException("Ingresa tu número de CI");
    await this.identityDocuments.assertOwned(merchantId, dto);

    const pending = await this.prisma.merchantKycSubmission.findFirst({ where: { merchantId, status: KycStatus.PENDING_REVIEW } });
    if (pending) throw new BadRequestException("A KYC submission is already pending review");

    return this.prisma.merchantKycSubmission.create({
      data: {
        merchantId,
        targetLevel,
        legalName: dto.legalName,
        taxId: dto.taxId?.trim() || null,
        legalRepName: dto.legalRepName?.trim() || (targetLevel === 1 ? dto.legalName : null),
        legalRepDocumentId: dto.legalRepDocumentId?.trim() || null,
        payoutBankAccount: dto.payoutBankAccount,
        payoutUsdBankAccount: dto.payoutUsdBankAccount?.trim() || null,
        ciFrontDocId: dto.ciFrontDocId,
        ciBackDocId: dto.ciBackDocId,
        selfieDocId: dto.selfieDocId,
      },
    });
  }
```
(Every new submission needs photos. Grandfathered level 2 merchants only submit again to reach level 3, which goes through ops, not this form.)

`review` approve branch:
```ts
      if (dto.decision === KycStatus.APPROVED) {
        await tx.merchant.update({ where: { id: submission.merchantId }, data: { status: MerchantStatus.ACTIVE, level: submission.targetLevel } });
      }
```
Add `level: submission.targetLevel` to the audit metadata. In `listPending`, select `level: true` in the merchant include.

- [ ] **Step 4: Run** `npx jest src/merchants && npx tsc --noEmit -p tsconfig.json` → PASS.

- [ ] **Step 5: Commit** — `git commit -m "feat(kyc): verify informal sellers at level 1 and raise the level on approval"`

---

### Task 7: Ops and dashboard limits API

**Files:**
- Create: `apps/api/src/limits/limits-admin.service.ts`, `apps/api/src/limits/limits-admin.service.spec.ts`, `apps/api/src/limits/ops-limits.controller.ts`, `apps/api/src/limits/dashboard-limits.controller.ts`, `apps/api/src/limits/dto/update-policy.dto.ts`, `apps/api/src/limits/dto/update-settings.dto.ts`, `apps/api/src/limits/dto/merchant-limits.dto.ts`
- Modify: `apps/api/src/limits/limits.module.ts` (import `OpsModule`, `DashboardModule`; register controllers; provide `LimitsAdminService`)

**Interfaces:**
- Consumes: `LimitsService.usage`, `laPazMonth` (Task 2), `AuditLogService.record`, `openOpsCaseOnce`.
- Produces routes:
  - `GET v1/dashboard/limits` (MerchantSessionGuard) → `LimitUsage`
  - `POST v1/dashboard/limits/level3_request` (MerchantSessionGuard) → `{ requested: true }`; one ops case (`category: KYC`, dedupe `level3-request:<merchantId>`)
  - `GET internal/limits/policies` → policies ordered by level
  - `PATCH internal/limits/policies/:level` body `{ monthlyLimit?: number | null; perPaymentLimit?: number | null; liveEnabled?: boolean }`
  - `GET internal/limits/settings`, `PATCH internal/limits/settings` body `{ usdToBobRate: number }`
  - `PATCH internal/merchants/:id/limits` body `{ level?: 0 | 1 | 2 | 3; monthlyLimitOverride?: number | null; perPaymentLimitOverride?: number | null }`
  - `GET internal/limits/near_limit` → `{ merchantId, name, email, level, used, monthlyLimit, percent }[]` (≥ 80%, current La Paz month, highest first)
- Audit actions: `limits.policy_updated`, `limits.settings_updated`, `limits.merchant_updated` with `metadata: { before, after }`.

- [ ] **Step 1: Failing spec**

```ts
import { ForbiddenException } from "@nestjs/common";
import { LimitsAdminService } from "./limits-admin.service";

const admin = { id: "ops_1", name: "Ana", email: "ana@pagosya.bo", role: "SUPPORT_ADMIN" };
const agent = { ...admin, role: "SUPPORT_AGENT" };

function setup() {
  const tx = {
    merchantLevelPolicy: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({ level: 1, monthlyLimit: 1_000_000, perPaymentLimit: 200_000, liveEnabled: true }),
      update: jest.fn().mockResolvedValue({ level: 1, monthlyLimit: 2_000_000, perPaymentLimit: 200_000, liveEnabled: true }),
    },
    merchant: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({ id: "m_1", level: 1, monthlyLimitOverride: null, perPaymentLimitOverride: null }),
      update: jest.fn().mockResolvedValue({}),
    },
    limitSettings: { findUniqueOrThrow: jest.fn().mockResolvedValue({ usdToBobRate: "6.96" }), update: jest.fn().mockResolvedValue({ usdToBobRate: "6.97" }) },
  };
  const prisma = { $transaction: jest.fn((fn) => fn(tx)), $queryRaw: jest.fn().mockResolvedValue([]) };
  const audit = { record: jest.fn() };
  return { tx, audit, service: new LimitsAdminService(prisma as any, audit as any) };
}

it("only admins change policies, and the change is audited with before and after", async () => {
  const { service, audit } = setup();
  await expect(service.updatePolicy(1, { monthlyLimit: 2_000_000 }, agent as any)).rejects.toBeInstanceOf(ForbiddenException);
  await service.updatePolicy(1, { monthlyLimit: 2_000_000 }, admin as any);
  expect(audit.record).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
    action: "limits.policy_updated",
    targetId: "1",
    metadata: { before: expect.objectContaining({ monthlyLimit: 1_000_000 }), after: expect.objectContaining({ monthlyLimit: 2_000_000 }) },
  }));
});

it("sets a merchant to level 3 with custom limits", async () => {
  const { service, tx } = setup();
  await service.updateMerchant("m_1", { level: 3, monthlyLimitOverride: 50_000_000, perPaymentLimitOverride: 5_000_000 }, admin as any);
  expect(tx.merchant.update).toHaveBeenCalledWith({ where: { id: "m_1" }, data: { level: 3, monthlyLimitOverride: 50_000_000, perPaymentLimitOverride: 5_000_000 } });
});

it("only admins change the USD rate", async () => {
  const { service, audit } = setup();
  await expect(service.updateSettings(6.97, agent as any)).rejects.toBeInstanceOf(ForbiddenException);
  await service.updateSettings(6.97, admin as any);
  expect(audit.record).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: "limits.settings_updated" }));
});
```

- [ ] **Step 2: Run** `npx jest src/limits/limits-admin.service.spec.ts` → FAIL.

- [ ] **Step 3: Implement**

`limits-admin.service.ts`:
```ts
import { ForbiddenException, Injectable } from "@nestjs/common";
import { OpsRole, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuditLogService } from "../ops/audit-log.service";
import { laPazMonth } from "./limits.service";

export type LimitsAdmin = { id: string; name: string; email: string; role: OpsRole };
export type NearLimitRow = { merchantId: string; name: string; email: string; level: number; used: number; monthlyLimit: number; percent: number };

@Injectable()
export class LimitsAdminService {
  constructor(private readonly prisma: PrismaService, private readonly auditLog: AuditLogService) {}

  private assertAdmin(actor: LimitsAdmin) {
    if (actor.role !== OpsRole.SUPPORT_ADMIN) throw new ForbiddenException("Solo un administrador puede cambiar límites");
  }

  private audit(tx: Prisma.TransactionClient, actor: LimitsAdmin, action: string, targetType: string, targetId: string, before: unknown, after: unknown) {
    return this.auditLog.record(tx, {
      actorType: "OPS_USER",
      actorId: actor.id,
      actorLabel: `${actor.name} <${actor.email}>`,
      action,
      targetType,
      targetId,
      metadata: { before, after },
    });
  }

  listPolicies() {
    return this.prisma.merchantLevelPolicy.findMany({ orderBy: { level: "asc" } });
  }

  async updatePolicy(level: number, data: { monthlyLimit?: number | null; perPaymentLimit?: number | null; liveEnabled?: boolean }, actor: LimitsAdmin) {
    this.assertAdmin(actor);
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.merchantLevelPolicy.findUniqueOrThrow({ where: { level } });
      const after = await tx.merchantLevelPolicy.update({ where: { level }, data });
      await this.audit(tx, actor, "limits.policy_updated", "MerchantLevelPolicy", String(level), before, after);
      return after;
    });
  }

  getSettings() {
    return this.prisma.limitSettings.findUniqueOrThrow({ where: { id: "singleton" } });
  }

  async updateSettings(usdToBobRate: number, actor: LimitsAdmin) {
    this.assertAdmin(actor);
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.limitSettings.findUniqueOrThrow({ where: { id: "singleton" } });
      const after = await tx.limitSettings.update({ where: { id: "singleton" }, data: { usdToBobRate } });
      await this.audit(tx, actor, "limits.settings_updated", "LimitSettings", "singleton", before, after);
      return after;
    });
  }

  async updateMerchant(merchantId: string, data: { level?: number; monthlyLimitOverride?: number | null; perPaymentLimitOverride?: number | null }, actor: LimitsAdmin) {
    this.assertAdmin(actor);
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.merchant.findUniqueOrThrow({ where: { id: merchantId }, select: { id: true, level: true, monthlyLimitOverride: true, perPaymentLimitOverride: true } });
      await tx.merchant.update({ where: { id: merchantId }, data });
      const after = { ...before, ...data };
      await this.audit(tx, actor, "limits.merchant_updated", "Merchant", merchantId, before, after);
      return after;
    });
  }

  nearLimit(now = new Date()) {
    const month = laPazMonth(now);
    return this.prisma.$queryRaw<NearLimitRow[]>`
      SELECT m.id AS "merchantId", m.name, m.email, m.level,
             (v.reserved + v.settled)::int AS used,
             COALESCE(m."monthlyLimitOverride", p."monthlyLimit")::int AS "monthlyLimit",
             FLOOR(100.0 * (v.reserved + v.settled) / NULLIF(COALESCE(m."monthlyLimitOverride", p."monthlyLimit"), 0))::int AS percent
      FROM "MerchantMonthlyVolume" v
      JOIN "Merchant" m ON m.id = v."merchantId"
      LEFT JOIN "MerchantLevelPolicy" p ON p.level = m.level
      WHERE v.month = ${month}
        AND (v.reserved + v.settled) * 10 >= COALESCE(m."monthlyLimitOverride", p."monthlyLimit") * 8
      ORDER BY percent DESC
    `;
  }
}
```

DTOs:
```ts
// dto/update-policy.dto.ts
import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsInt, IsOptional, Min, ValidateIf } from "class-validator";

export class UpdatePolicyDto {
  @ApiPropertyOptional({ nullable: true, description: "Centavos BOB" }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsInt() @Min(1) monthlyLimit?: number | null;
  @ApiPropertyOptional({ nullable: true, description: "Centavos BOB" }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsInt() @Min(1) perPaymentLimit?: number | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() liveEnabled?: boolean;
}

// dto/update-settings.dto.ts
import { ApiProperty } from "@nestjs/swagger";
import { IsNumber, Max, Min } from "class-validator";

export class UpdateLimitSettingsDto {
  @ApiProperty({ example: 6.96 }) @IsNumber({ maxDecimalPlaces: 4 }) @Min(0.0001) @Max(100) usdToBobRate!: number;
}

// dto/merchant-limits.dto.ts
import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsInt, IsOptional, Min, ValidateIf } from "class-validator";

export class MerchantLimitsDto {
  @ApiPropertyOptional({ enum: [0, 1, 2, 3] }) @IsOptional() @IsIn([0, 1, 2, 3]) level?: number;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsInt() @Min(1) monthlyLimitOverride?: number | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsInt() @Min(1) perPaymentLimitOverride?: number | null;
}
```

`ops-limits.controller.ts`:
```ts
import { Body, Controller, Get, Param, ParseIntPipe, Patch, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { OpsAuthGuard } from "../ops/guards/ops-auth.guard";
import { CurrentOpsUser } from "../ops/decorators/current-ops-user.decorator";
import { LimitsAdmin, LimitsAdminService } from "./limits-admin.service";
import { UpdatePolicyDto } from "./dto/update-policy.dto";
import { UpdateLimitSettingsDto } from "./dto/update-settings.dto";
import { MerchantLimitsDto } from "./dto/merchant-limits.dto";

@ApiTags("ops")
@ApiBearerAuth()
@UseGuards(OpsAuthGuard)
@Controller("internal")
export class OpsLimitsController {
  constructor(private readonly admin: LimitsAdminService) {}

  @Get("limits/policies") policies() { return this.admin.listPolicies(); }

  @Patch("limits/policies/:level")
  updatePolicy(@Param("level", ParseIntPipe) level: number, @Body() dto: UpdatePolicyDto, @CurrentOpsUser() actor: LimitsAdmin) {
    return this.admin.updatePolicy(level, dto, actor);
  }

  @Get("limits/settings") settings() { return this.admin.getSettings(); }

  @Patch("limits/settings")
  updateSettings(@Body() dto: UpdateLimitSettingsDto, @CurrentOpsUser() actor: LimitsAdmin) {
    return this.admin.updateSettings(dto.usdToBobRate, actor);
  }

  @Get("limits/near_limit") nearLimit() { return this.admin.nearLimit(); }

  @Patch("merchants/:id/limits")
  updateMerchant(@Param("id") id: string, @Body() dto: MerchantLimitsDto, @CurrentOpsUser() actor: LimitsAdmin) {
    return this.admin.updateMerchant(id, dto, actor);
  }
}
```

`dashboard-limits.controller.ts`:
```ts
import { Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { SupportCaseCategory, SupportCasePriority } from "@prisma/client";
import { MerchantSessionGuard } from "../dashboard/guards/merchant-session.guard";
import { PrismaService } from "../prisma/prisma.service";
import { openOpsCaseOnce } from "../ops/ops-escalation";
import { LimitsService } from "./limits.service";

@ApiTags("dashboard")
@ApiBearerAuth()
@UseGuards(MerchantSessionGuard)
@Controller("v1/dashboard/limits")
export class DashboardLimitsController {
  constructor(private readonly limits: LimitsService, private readonly prisma: PrismaService) {}

  @Get()
  usage(@Req() req: { merchant: { id: string } }) {
    return this.limits.usage(req.merchant.id);
  }

  @Post("level3_request")
  async requestLevel3(@Req() req: { merchant: { id: string } }) {
    const merchantId = req.merchant.id;
    await openOpsCaseOnce(this.prisma, {
      merchantId,
      dedupeKey: `level3-request:${merchantId}`,
      summary: `El comercio pide pasar al nivel Empresa (level3-request:${merchantId}). Pedir documentos de la empresa y fijar límites.`,
      category: SupportCaseCategory.KYC,
      priority: SupportCasePriority.NORMAL,
    });
    return { requested: true };
  }
}
```

`limits.module.ts` final:
```ts
import { Module } from "@nestjs/common";
import { OpsModule } from "../ops/ops.module";
import { DashboardModule } from "../dashboard/dashboard.module";
import { LimitsService } from "./limits.service";
import { LimitsWarningService } from "./limits-warning.service";
import { LimitsAdminService } from "./limits-admin.service";
import { OpsLimitsController } from "./ops-limits.controller";
import { DashboardLimitsController } from "./dashboard-limits.controller";

@Module({
  imports: [OpsModule, DashboardModule],
  controllers: [OpsLimitsController, DashboardLimitsController],
  providers: [LimitsService, LimitsWarningService, LimitsAdminService],
  exports: [LimitsService, LimitsWarningService],
})
export class LimitsModule {}
```
If importing `OpsModule`/`DashboardModule` here creates a circular import with `PaymentIntentsModule`, wrap the offending side with `forwardRef(() => ...)` and note it in the commit message.

- [ ] **Step 4: e2e additions** — in `merchant-limits.e2e-spec.ts`, mint an ops admin, an ops agent and a dashboard session the way `test/security.e2e-spec.ts` does, then:
  - agent `PATCH /internal/limits/policies/1` → 403; admin → 200 and an `AuditLogEntry` with `action: 'limits.policy_updated'` exists.
  - `GET /v1/dashboard/limits` with the session → `used` equals the settled volume from an earlier confirm.
  - Submit a KYC with the uploaded photos, then agent `GET /v1/merchants/kyc/:id/documents/CI_FRONT` → 200 `image/png`, and an `AuditLogEntry` with `action: 'kyc.document_viewed'`; the same route with the merchant's secret key → 401/403.

- [ ] **Step 5: Run** `npx jest src/limits && npx jest --config test/jest-e2e.json test/merchant-limits.e2e-spec.ts && npx tsc --noEmit -p tsconfig.json` → PASS.

- [ ] **Step 6: Commit** — `git commit -m "feat(limits): let ops edit level limits and merchants see their usage"`

---

### Task 8: Checkout shows the neutral refusal

**Files:**
- Test: `apps/checkout/test/payment-form.test.ts`
- Possibly modify: `apps/checkout/src/main.ts` (confirm error branch near the `confirmPaymentIntent(` call, ~L9793)

**Interfaces:**
- Consumes: API 403 body `{ code: "limit_exceeded", message: "Este comercio no puede recibir pagos en este momento." }`. `parseOrThrow` (`apps/checkout/src/api.ts:28`) already turns `body.message` into the thrown `Error`'s message.

- [ ] **Step 1: Add the test** — copy the existing confirm-failure test in `test/payment-form.test.ts`, make the mocked `/confirm` response `new Response(JSON.stringify({ statusCode: 403, code: "limit_exceeded", message: "Este comercio no puede recibir pagos en este momento." }), { status: 403 })`, submit the form, and assert the payment status element's text is exactly `Este comercio no puede recibir pagos en este momento.` and does not match `/Bs|\d/`.

- [ ] **Step 2: Run** `cd apps/checkout && npx vitest run test/payment-form.test.ts`.
Expected: PASS. If it fails because the error branch shows a generic string, change only that branch to show `err.message`, then rerun.

- [ ] **Step 3: Commit** — `git commit -m "test(checkout): show buyers a neutral message when a merchant is over its limit"`

---

### Task 9: Merchant dashboard — level card, banners, upgrade form

**Files:**
- Modify: `apps/merchant-dashboard/index.html` (CSS near `.terms-prompt` ~L1044; KYC panel ~L5160–5176; overview loader ~L19548–19595; KYC submit handler ~L19820)
- Test: `apps/merchant-dashboard/tests/merchant-levels.spec.mjs`

**Interfaces:**
- Consumes: `GET /v1/dashboard/limits`, `POST /v1/dashboard/limits/level3_request` (Task 7), `POST /v1/merchants/kyc/documents` (Task 5), `POST /v1/merchants/kyc` with `targetLevel` (Task 6).
- Produces DOM ids: `#levelCard`, `#levelName`, `#levelUsage`, `#levelPerPayment`, `#levelResets`, `#limitBanner` (`data-state="warn" | "blocked"`), `#levelUpgradeButton`, `#level3RequestButton`, `#kycTargetLevel`, `#kycNameLabel`, `#kycBusinessFields`, `#kycDocFront`, `#kycDocBack`, `#kycDocSelfie`.

- [ ] **Step 1: Write the Playwright spec**

Copy `store`, and the `openCompliance` route-mocking helper from `tests/terms-acceptance.spec.mjs`, changing its signature to `openCompliance(page, limits, posted = [])`: answer `/dashboard/limits` with `limits`, `/dashboard/terms` with `{ current: null, upcoming: null, acceptedVersion: null, needsAcceptance: false }`, push `{ path, body }` for every POST into `posted` (JSON-parse the body when possible), answer `/merchants/kyc/documents` with `{ id: "doc_" + slot, slot }` where `slot` is read from the multipart body with `/name="slot"\r\n\r\n(\w+)/`, and `/merchants/kyc` POST with `{ status: "PENDING_REVIEW" }`.

```js
const usage = (over = {}) => ({ level: 1, levelName: "Persona", liveEnabled: true, monthlyLimit: 1_000_000, perPaymentLimit: 200_000, used: 620_000, month: "2026-09", resetsAt: "2026-10-01T04:00:00.000Z", ...over });

test("shows the level, usage and reset date", async ({ page }) => {
  await openCompliance(page, usage());
  await expect(page.locator("#levelName")).toHaveText("Nivel 1 · Persona");
  await expect(page.locator("#levelUsage")).toHaveText("Bs 6.200 de Bs 10.000 este mes");
  await expect(page.locator("#levelPerPayment")).toHaveText("Máximo por pago: Bs 2.000");
  await expect(page.locator("#limitBanner")).toBeHidden();
});

test("warns at 80% and blocks at 100%", async ({ page }) => {
  await openCompliance(page, usage({ used: 800_000 }));
  await expect(page.locator("#limitBanner")).toHaveAttribute("data-state", "warn");
  await page.unrouteAll();
  await openCompliance(page, usage({ used: 1_000_000 }));
  await page.reload();
  await expect(page.locator("#limitBanner")).toHaveAttribute("data-state", "blocked");
});

test("uploads three photos and submits a level 1 application without NIT", async ({ page }) => {
  const posted = [];
  await openCompliance(page, usage({ level: 0, levelName: "Sin verificar", liveEnabled: false, monthlyLimit: null, perPaymentLimit: null, used: 0 }), posted);
  await expect(page.locator("#kycTargetLevel")).toHaveValue("1");
  await expect(page.locator("#kycBusinessFields")).toBeHidden();
  const photo = { name: "ci.png", mimeType: "image/png", buffer: Buffer.from("89504e47", "hex") };
  for (const id of ["#kycDocFront", "#kycDocBack", "#kycDocSelfie"]) await page.setInputFiles(id, photo);
  await page.fill("#kycForm [name=legalName]", "Juana Mamani");
  await page.fill("#kycForm [name=legalRepDocumentId]", "7654321 LP");
  await page.fill("#kycForm [name=payoutBankAccount]", "BNB 4012345678");
  await page.click("#kycForm button[type=submit]");
  await expect.poll(() => posted.find((p) => p.path === "/merchants/kyc")?.body)
    .toMatchObject({ targetLevel: 1, ciFrontDocId: "doc_CI_FRONT", ciBackDocId: "doc_CI_BACK", selfieDocId: "doc_SELFIE" });
  expect(posted.find((p) => p.path === "/merchants/kyc").body.taxId).toBeUndefined();
});

test("asks for NIT when applying for level 2", async ({ page }) => {
  await openCompliance(page, usage());
  await expect(page.locator("#kycTargetLevel")).toHaveValue("2");
  await expect(page.locator("#kycBusinessFields")).toBeVisible();
  await expect(page.locator("#kycForm [name=taxId]")).toHaveAttribute("required", "");
});
```

- [ ] **Step 2: Run** `cd apps/merchant-dashboard && npx playwright test tests/merchant-levels.spec.mjs` → FAIL.

- [ ] **Step 3: Implement in `index.html`**

CSS next to `.terms-prompt`:
```css
  .level-card { margin: 0 0 14px; padding: 14px 16px; border: 1px solid var(--pg-border, rgba(15, 23, 42, .12)); border-radius: 10px; }
  .level-card p { margin: 0 0 6px; line-height: 1.5; }
  .limit-banner { padding: 10px 12px; border-radius: 8px; font-size: .8rem; }
  .limit-banner[data-state="warn"] { background: #fff7e6; color: #8a5300; }
  .limit-banner[data-state="blocked"] { background: #fdecec; color: #9b1c1c; }
```
Markup at the top of the KYC panel, above `#termsPrompt`:
```html
<div class="level-card" id="levelCard" hidden>
  <p><strong id="levelName"></strong></p>
  <p class="muted" id="levelUsage"></p>
  <p class="muted"><span id="levelPerPayment"></span> <span id="levelResets"></span></p>
  <p class="limit-banner" id="limitBanner" hidden></p>
  <button class="secondary" type="button" id="levelUpgradeButton">Subir de nivel</button>
  <button class="secondary" type="button" id="level3RequestButton" hidden>Solicitar nivel Empresa</button>
</div>
```
Replace the fields inside `#kycForm` with:
```html
<div><label>Nivel que solicitas</label>
  <select name="targetLevel" id="kycTargetLevel">
    <option value="1">Nivel 1 · Persona (sin NIT)</option>
    <option value="2">Nivel 2 · Negocio (con NIT)</option>
  </select></div>
<div><label id="kycNameLabel">Nombre completo</label><input name="legalName" required></div>
<div><label>Número de CI</label><input name="legalRepDocumentId" required></div>
<div id="kycBusinessFields" hidden>
  <div><label>NIT</label><input name="taxId"></div>
  <div><label>Nombre del representante legal</label><input name="legalRepName"></div>
</div>
<div><label>Foto del CI (anverso)</label><input type="file" accept="image/png,image/jpeg,image/webp" id="kycDocFront" data-slot="CI_FRONT" required></div>
<div><label>Foto del CI (reverso)</label><input type="file" accept="image/png,image/jpeg,image/webp" id="kycDocBack" data-slot="CI_BACK" required></div>
<div><label>Selfie sosteniendo tu CI</label><input type="file" accept="image/png,image/jpeg,image/webp" id="kycDocSelfie" data-slot="SELFIE" required></div>
<div><label>Cuenta bancaria a tu nombre para pagos</label><input name="payoutBankAccount" required></div>
<div><label>Cuenta en USD para desembolsos internacionales (opcional)</label><input name="payoutUsdBankAccount" maxlength="300"></div>
<button class="primary" type="submit">Enviar verificación</button>
```
Script (next to `renderTermsPrompt`):
```js
  const bobFmt = (centavos) => `Bs ${(centavos / 100).toLocaleString("es-BO", { maximumFractionDigits: 0 })}`;

  // ASFI afiliación: level, monthly usage and the path to the next level.
  function renderLevel(limits) {
    const card = document.getElementById("levelCard");
    card.hidden = !limits;
    if (!limits) return;
    document.getElementById("levelName").textContent = `Nivel ${limits.level} · ${limits.levelName}`;
    document.getElementById("levelUsage").textContent = limits.monthlyLimit
      ? `${bobFmt(limits.used)} de ${bobFmt(limits.monthlyLimit)} este mes`
      : "Aún no puedes cobrar en vivo. Verifícate para empezar.";
    document.getElementById("levelPerPayment").textContent = limits.perPaymentLimit ? `Máximo por pago: ${bobFmt(limits.perPaymentLimit)}` : "";
    document.getElementById("levelResets").textContent = limits.monthlyLimit
      ? `· Se reinicia el ${new Date(limits.resetsAt).toLocaleDateString("es-BO", { timeZone: "America/La_Paz" })}`
      : "";
    const banner = document.getElementById("limitBanner");
    const ratio = limits.monthlyLimit ? limits.used / limits.monthlyLimit : 0;
    banner.hidden = ratio < 0.8;
    banner.dataset.state = ratio >= 1 ? "blocked" : "warn";
    banner.textContent = ratio >= 1
      ? "Llegaste a tu límite mensual: los cobros en vivo están pausados hasta el inicio del próximo mes o hasta que subas de nivel."
      : "Ya usaste el 80% de tu límite mensual. Sube de nivel para seguir cobrando sin pausas.";
    document.getElementById("levelUpgradeButton").hidden = limits.level >= 2;
    document.getElementById("level3RequestButton").hidden = limits.level !== 2;
    const select = document.getElementById("kycTargetLevel");
    select.querySelector('option[value="1"]').disabled = limits.level >= 1;
    select.value = limits.level >= 1 ? "2" : "1";
    syncKycLevelFields();
  }

  function syncKycLevelFields() {
    const business = document.getElementById("kycTargetLevel").value === "2";
    document.getElementById("kycBusinessFields").hidden = !business;
    document.getElementById("kycNameLabel").textContent = business ? "Razón social" : "Nombre completo";
    for (const name of ["taxId", "legalRepName"]) document.querySelector(`#kycForm [name=${name}]`).required = business;
  }
  document.getElementById("kycTargetLevel").addEventListener("change", syncKycLevelFields);
  document.getElementById("levelUpgradeButton").addEventListener("click", () => document.getElementById("kycForm").scrollIntoView({ behavior: "smooth" }));
  document.getElementById("level3RequestButton").addEventListener("click", async () => {
    errorEl.textContent = "";
    try {
      await api("/dashboard/limits/level3_request", { method: "POST" });
      infoEl.textContent = "Recibimos tu solicitud. El equipo de pagosYa te escribirá para pedir los documentos de tu empresa.";
    } catch (err) {
      errorEl.textContent = "Error: " + err.message;
    }
  });

  async function uploadKycPhoto(input) {
    const file = input.files?.[0];
    if (!file) return undefined;
    const form = new FormData();
    form.append("slot", input.dataset.slot);
    form.append("file", file);
    const doc = await api("/merchants/kyc/documents", { method: "POST", body: form });
    return doc.id;
  }
```
Replace the body of the `#kycForm` submit handler's `try`:
```js
      const [ciFrontDocId, ciBackDocId, selfieDocId] = await Promise.all(
        ["kycDocFront", "kycDocBack", "kycDocSelfie"].map((id) => uploadKycPhoto(document.getElementById(id))),
      );
      const payload = { ...data, targetLevel: Number(data.targetLevel), ciFrontDocId, ciBackDocId, selfieDocId };
      for (const key of Object.keys(payload)) if (payload[key] === "" || payload[key] === undefined) delete payload[key];
      await api("/merchants/kyc", { method: "POST", body: JSON.stringify(payload) });
      await refresh();
      infoEl.textContent = "Verificación enviada — te avisaremos cuando sea revisada.";
```
(`new FormData(e.target)` includes the file inputs as `File` objects under no name — they have no `name` attribute, so they are not in `data`.) Check the dashboard `api()` helper: if it always sets `Content-Type: application/json`, make it skip that header when `options.body instanceof FormData`.

Overview loader: add `api("/dashboard/limits").catch(() => null)` to the first `Promise.all` after `/dashboard/terms`, destructure it as `limits` after `terms`, and call `renderLevel(limits);` right after `renderTermsPrompt(terms);`.

- [ ] **Step 4: Run** `npx playwright test tests/merchant-levels.spec.mjs tests/terms-acceptance.spec.mjs` → PASS. (Update `terms-acceptance.spec.mjs` only if its KYC-form selectors changed; the submit button is still `#kycForm button[type=submit]`.)

- [ ] **Step 5: Commit** — `git commit -m "feat(dashboard): show merchants their level and limits and let them level up"`

---

### Task 10: Ops app — KYC photos and level, limits page

**Files:**
- Modify: `apps/ops/index.html` (merchant detail ~L758–778, KYC queue ~L805, review action ~L1282)

**Interfaces:**
- Consumes: `GET /v1/merchants/kyc/pending` (now with `targetLevel`, doc ids, `merchant.level`), `GET /v1/merchants/kyc/:id/documents/:slot` (Task 5), `internal/limits/*`, `PATCH internal/merchants/:id/limits` (Task 7). Reuse the page's existing `api()` helper, auth header and HTML-escaping helper (`esc`).

- [ ] **Step 1: KYC queue** — for each pending submission render `Nivel solicitado: ${targetLevel}` (and `Nivel actual: ${merchant.level}`), show `taxId`/`legalRepName` only when not null, and add three `<img class="kyc-photo" data-submission="…" data-slot="CI_FRONT|CI_BACK|SELFIE">` for present doc ids, filled after render by:
```js
async function loadKycImages(root) {
  for (const img of root.querySelectorAll("img.kyc-photo")) {
    const res = await fetch(`${API_BASE}/v1/merchants/kyc/${encodeURIComponent(img.dataset.submission)}/documents/${img.dataset.slot}`, { headers: authHeaders() });
    if (!res.ok) { img.alt = "No disponible"; continue; }
    img.src = URL.createObjectURL(await res.blob());
  }
}
```
Rename `API_BASE`/`authHeaders` to whatever the file already uses for its `api()` helper. Label the approve button `Aprobar nivel ${targetLevel}`.

- [ ] **Step 2: Limits page** — add a "Límites" nav entry and section:
  - Policies table from `GET /internal/limits/policies`: per level, inputs in Bs (`value = centavos / 100`), a live checkbox, and "Guardar" calling `PATCH /internal/limits/policies/:level` with centavos (`Math.round(bs * 100)`, empty → `null`).
  - USD rate input from `GET /internal/limits/settings` with "Guardar" → `PATCH /internal/limits/settings`.
  - "Cerca del límite" table from `GET /internal/limits/near_limit`: merchant name/email, level, `Bs used / Bs limit`, percent.
  - Show API errors (e.g. the 403 for non-admins) in the page's existing error element.

- [ ] **Step 3: Merchant detail** — show `Nivel N` and the current overrides, plus a form (level select 0–3; monthly and per-payment override inputs in Bs, empty = use the level's value) calling `PATCH /internal/merchants/:id/limits`.

- [ ] **Step 4: Verify by hand** — start the API and ops app locally, log in as the seeded ops admin, then check: a pending level 1 submission shows its three photos; changing the level 1 monthly limit persists after reload and appears in the audit log view; the near-limit table renders (empty is fine) without console errors.

- [ ] **Step 5: Commit** — `git commit -m "feat(ops): review KYC photos by level and edit merchant limits"`

---

### Task 11: Docs and full verification

**Files:**
- Modify: `docs/DEVELOPER_API.md`

- [ ] **Step 1: Update docs** — add a "Límites por nivel" section: `per_payment_limit_exceeded` on `POST /v1/payment_intents` and `limit_exceeded` on confirm, both 403 with `{ code, message }`, live mode only; TEST mode is never limited; merchants see their level and usage in the dashboard.

- [ ] **Step 2: Full verification**

```bash
cd apps/api && npx tsc --noEmit -p tsconfig.json && npx jest && npx jest --config test/jest-e2e.json test/merchant-limits.e2e-spec.ts test/security.e2e-spec.ts test/shipping-carriers.e2e-spec.ts
cd ../checkout && npx tsc --noEmit && npx vitest run
cd ../merchant-dashboard && npx playwright test tests/merchant-levels.spec.mjs tests/terms-acceptance.spec.mjs tests/international-payments.spec.mjs
```
Expected: all pass. Report any failure with its output. Known failures from sub-project 1 (storefront-generation suite timeouts under full-suite load; 40 store-editor/settings Playwright tests that also fail on the pre-change page) are not in these commands.

- [ ] **Step 3: Apply to the local dev DB** — `cd apps/api && npx prisma migrate deploy`.

- [ ] **Step 4: Commit** — `git commit -m "docs(api): document merchant level limits on create and confirm"`

---

## Rollout note (for whoever merges)

- Production needs `PRIVATE_DOWNLOAD_BUCKET` set to a private bucket separate from the public one; `PrivateFilesService` refuses uploads otherwise, so level 1 applications would fail.
- Before deploying, find merchants who would hit the level 2 placeholder:
  ```sql
  SELECT "merchantId", SUM(amount) AS centavos FROM "PaymentIntent"
  WHERE livemode AND status = 'SUCCEEDED'
    AND "createdAt" >= date_trunc('month', (now() AT TIME ZONE 'America/La_Paz') - interval '1 month')
  GROUP BY 1 HAVING SUM(amount) > 8000000;
  ```
  and give them a `monthlyLimitOverride` via `PATCH /internal/merchants/:id/limits` right after deploy.
