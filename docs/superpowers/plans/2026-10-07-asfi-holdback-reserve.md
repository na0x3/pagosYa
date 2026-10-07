# ASFI Holdback, Reserve and Daily Payouts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hold each aggregator capture for a level-based delay plus a rolling reserve, pay out once a day, and cover refunds from the merchant's held money before pagosYa's — every step a ledger record.

**Architecture:** A new `apps/api/src/settlement/` module owns policy resolution, one `SettlementHold` row per AGGREGATOR capture, the daily release (MERCHANT_PENDING → MERCHANT_PAYABLE / RESERVE → MERCHANT_PAYABLE), the refund drawdown and the ops tools. Capture credits `MERCHANT_PENDING` instead of `MERCHANT_PAYABLE`; payouts keep reading `MERCHANT_PAYABLE` and now run from a 10:00 La Paz cron in `PayoutsModule`. Ops and merchant UIs read new endpoints.

**Tech Stack:** NestJS 11, Prisma 5 / PostgreSQL, `@nestjs/schedule` (`@Cron`), Jest (unit + `*.integration.spec.ts` on throwaway databases), vanilla JS ops console and merchant dashboard, Playwright, `node --test`.

**Spec:** `docs/superpowers/specs/2026-10-07-asfi-holdback-reserve-design.md`

## Global Constraints

- All amounts are integer centavos; never add amounts of different currencies.
- America/La_Paz is UTC−4 all year (no DST); day boundaries are 00:00 La Paz = 04:00Z.
- Reserve amount = `Math.floor(net × reserveBps / 10000)`.
- Placeholder policy per level: 0 → 7 d / 1000 bps / 60 d (no live payments anyway); 1 → 7 d / 1000 bps / 60 d; 2 → 3 d / 500 bps / 45 d; 3 → 1 d / 0 bps / 0 d.
- Strict fallback when a level has no policy row: 30 d / 1000 bps / 90 d.
- Daily batch: `@Cron("0 10 * * *", { timeZone: "America/La_Paz" })`.
- FACILITATOR merchants: capture, refund and payout behaviour unchanged.
- `payoutHoldReason` is internal: never in a merchant-facing response or email.
- Ops role rules: any ops user may place a hold and read; only `SUPPORT_ADMIN` lifts a hold, seizes reserve, sets overrides or edits policy columns.
- UI copy is Spanish, exactly as written in the tasks.
- **Dev DB guard:** never run `prisma migrate`, `prisma migrate diff`, `prisma migrate reset` or `prisma db push` against the dev database. Only `pnpm exec prisma generate` (no DB) is allowed. The migration SQL is hand-written in Task 1 and validated by the integration suites, which create and drop their own throwaway databases.
- This repo uses **pnpm**. Run API tests from `apps/api` with `pnpm exec jest <path>`.
- Never edit `/Users/saramia/pagosYaWeb`.

## Review Focus

1. A refund and the daily release touching the same merchant at the same moment must not spend the same pending money twice → Task 9 concurrency test.
2. A merchant whose level has no policy row, or with only some overrides set → each field resolves override-first, then policy, then strict fallback → Task 2 test.
3. A capture at 23:30 La Paz (already the next UTC day) must count from the La Paz calendar day → Task 1 test.
4. Placing a hold twice, or lifting one that isn't there → clear Spanish error, no second email → Task 8 tests.
5. The dashboard receiving an old-shape balance (no `pending`/`reserve`) or a failing schedule request → balance cards still render, the panel stays hidden → Task 11 test.

---

## Task 0: Worktree setup (main session, before any task)

The worktree has no `node_modules` and no `.env`.

- [ ] **Step 1: Install and copy env**

```bash
cd /Users/saramia/pagosYa/.claude/worktrees/asfi-holdback
pnpm install --frozen-lockfile
cp /Users/saramia/pagosYa/apps/api/.env apps/api/.env
git check-ignore -q apps/api/.env && echo "env ignored"
```
Expected: install succeeds, prints `env ignored`.

- [ ] **Step 2: Baseline**

```bash
cd apps/api && pnpm exec prisma generate && pnpm exec jest src/payouts src/ledger src/refunds src/limits
```
Expected: PASS (records the pre-change baseline).

---

## Task 1: Schema, migration and La Paz date helpers

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (enum `LedgerAccount` ~line 63, model `Merchant` ~line 240, model `MerchantLevelPolicy` ~line 554, append new models)
- Create: `apps/api/prisma/migrations/20261007120000_asfi_settlement_holds/migration.sql`
- Create: `apps/api/src/settlement/settlement-dates.ts`
- Test: `apps/api/src/settlement/settlement-dates.spec.ts`

**Interfaces:**
- Produces: Prisma models `SettlementHold`, `ReserveSeizure`, enum `SettlementHoldStatus { PENDING, RESERVE_HELD, CLOSED }`, `LedgerAccount.MERCHANT_PENDING`; `MerchantLevelPolicy.payoutDelayDays/reserveBps/reserveDays: number`; `Merchant.payoutDelayDaysOverride/reserveBpsOverride/reserveDaysOverride: number | null`, `payoutHoldReason: string | null`, `payoutHeldAt: Date | null`, `payoutHeldByLabel: string | null`.
- Produces: `laPazDayStart(at: Date, days: number): Date`, `nextPayoutBatch(now: Date): Date`, `laPazDateKey(at: Date): string` (`"YYYY-MM-DD"`), `PAYOUT_BATCH_HOUR_LA_PAZ = 10`.

- [ ] **Step 1: Write the failing date test**

`apps/api/src/settlement/settlement-dates.spec.ts`:
```ts
import { laPazDateKey, laPazDayStart, nextPayoutBatch } from "./settlement-dates";

describe("settlement dates (America/La_Paz, UTC-4)", () => {
  it("counts days from the La Paz calendar day of the capture", () => {
    // Monday 2026-10-05 15:00 La Paz = 19:00Z; 3 days -> Thursday 00:00 La Paz.
    expect(laPazDayStart(new Date("2026-10-05T19:00:00Z"), 3).toISOString()).toBe("2026-10-08T04:00:00.000Z");
  });

  it("treats 23:30 La Paz as the same La Paz day even though UTC has rolled over", () => {
    // 2026-10-05 23:30 La Paz = 2026-10-06T03:30Z, still October 5th in La Paz.
    expect(laPazDayStart(new Date("2026-10-06T03:30:00Z"), 1).toISOString()).toBe("2026-10-06T04:00:00.000Z");
  });

  it("returns the start of the same La Paz day for 0 days", () => {
    expect(laPazDayStart(new Date("2026-10-05T19:00:00Z"), 0).toISOString()).toBe("2026-10-05T04:00:00.000Z");
  });

  it("gives the next 10:00 La Paz batch strictly after now", () => {
    expect(nextPayoutBatch(new Date("2026-10-07T13:59:00Z")).toISOString()).toBe("2026-10-07T14:00:00.000Z");
    expect(nextPayoutBatch(new Date("2026-10-07T14:00:00Z")).toISOString()).toBe("2026-10-08T14:00:00.000Z");
    // 03:00Z is 23:00 La Paz the day before, so the next batch is that same UTC day at 14:00Z.
    expect(nextPayoutBatch(new Date("2026-10-07T03:00:00Z")).toISOString()).toBe("2026-10-07T14:00:00.000Z");
  });

  it("formats the La Paz date key", () => {
    expect(laPazDateKey(new Date("2026-10-06T03:30:00Z"))).toBe("2026-10-05");
    expect(laPazDateKey(new Date("2026-10-08T04:00:00Z"))).toBe("2026-10-08");
  });
});
```
- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/api && pnpm exec jest src/settlement/settlement-dates.spec.ts`
Expected: FAIL — `Cannot find module './settlement-dates'`.

- [ ] **Step 3: Implement the date helpers**

`apps/api/src/settlement/settlement-dates.ts`:
```ts
// America/La_Paz is UTC-4 all year (Bolivia has no daylight saving time).
const LA_PAZ_OFFSET_MS = 4 * 60 * 60_000;
const DAY_MS = 24 * 60 * 60_000;

export const PAYOUT_BATCH_HOUR_LA_PAZ = 10;

/** 00:00 La Paz on the calendar day `days` after `at`'s La Paz date. */
export function laPazDayStart(at: Date, days: number): Date {
  const localMidnight = Math.floor((at.getTime() - LA_PAZ_OFFSET_MS) / DAY_MS) * DAY_MS;
  return new Date(localMidnight + days * DAY_MS + LA_PAZ_OFFSET_MS);
}

/** The next daily payout batch (10:00 La Paz) strictly after `now`. */
export function nextPayoutBatch(now: Date): Date {
  const today = laPazDayStart(now, 0).getTime() + PAYOUT_BATCH_HOUR_LA_PAZ * 60 * 60_000;
  return new Date(today > now.getTime() ? today : today + DAY_MS);
}

/** "YYYY-MM-DD" of `at` in La Paz. */
export function laPazDateKey(at: Date): string {
  return new Date(at.getTime() - LA_PAZ_OFFSET_MS).toISOString().slice(0, 10);
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd apps/api && pnpm exec jest src/settlement/settlement-dates.spec.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Edit the Prisma schema**

In `enum LedgerAccount`, add after `MERCHANT_PAYABLE`:
```prisma
  MERCHANT_PENDING
```
In `model MerchantLevelPolicy`, add before `updatedAt`:
```prisma
  // ASFI fraud coverage (sub-project 3): days before a capture becomes
  // payable, and the share (bps) kept back as a rolling reserve for reserveDays.
  payoutDelayDays Int      @default(7)
  reserveBps      Int      @default(0)
  reserveDays     Int      @default(0)
```
In `model Merchant`, add after the existing limit override fields (next to `level`):
```prisma
  // Ops-set settlement overrides (null = use the level policy) and the manual
  // payout hold. payoutHoldReason is internal and never shown to the merchant.
  payoutDelayDaysOverride     Int?
  reserveBpsOverride          Int?
  reserveDaysOverride         Int?
  payoutHoldReason            String?
  payoutHeldAt                DateTime?
  payoutHeldByLabel           String?
  settlementHolds             SettlementHold[]
  reserveSeizures             ReserveSeizure[]
```
Append at the end of the file:
```prisma
enum SettlementHoldStatus {
  PENDING
  RESERVE_HELD
  CLOSED
}

// One row per AGGREGATOR capture: when its merchant net leaves MERCHANT_PENDING,
// and how much of it RESERVE keeps until reserveReleaseAt. The ledger holds the
// money; this row holds the schedule. Policy fields are a snapshot at capture.
model SettlementHold {
  id               String               @id @default(cuid())
  merchantId       String
  merchant         Merchant             @relation(fields: [merchantId], references: [id])
  paymentIntentId  String
  transactionId    String               @unique
  currency         String
  netAmount        Int
  pendingAmount    Int
  reserveAmount    Int
  availableAt      DateTime
  reserveReleaseAt DateTime
  status           SettlementHoldStatus @default(PENDING)
  delayDays        Int
  reserveBps       Int
  reserveDays      Int
  createdAt        DateTime             @default(now())
  updatedAt        DateTime             @updatedAt

  @@index([status, availableAt])
  @@index([status, reserveReleaseAt])
  @@index([merchantId, currency, status])
  @@index([paymentIntentId])
}

// Reserve money paid out as restitution to a buyer by ops (confirmed fraud).
model ReserveSeizure {
  id                String   @id @default(cuid())
  merchantId        String
  merchant          Merchant @relation(fields: [merchantId], references: [id])
  amount            Int
  currency          String
  reason            String
  externalReference String
  opsUserId         String
  opsLabel          String
  ledgerGroupId     String
  createdAt         DateTime @default(now())

  @@index([merchantId, createdAt])
}
```

- [ ] **Step 6: Write the migration SQL by hand**

`apps/api/prisma/migrations/20261007120000_asfi_settlement_holds/migration.sql`:
```sql
-- AlterEnum
ALTER TYPE "LedgerAccount" ADD VALUE 'MERCHANT_PENDING';

-- CreateEnum
CREATE TYPE "SettlementHoldStatus" AS ENUM ('PENDING', 'RESERVE_HELD', 'CLOSED');

-- AlterTable
ALTER TABLE "MerchantLevelPolicy" ADD COLUMN "payoutDelayDays" INTEGER NOT NULL DEFAULT 7,
ADD COLUMN "reserveBps" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "reserveDays" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Merchant" ADD COLUMN "payoutDelayDaysOverride" INTEGER,
ADD COLUMN "reserveBpsOverride" INTEGER,
ADD COLUMN "reserveDaysOverride" INTEGER,
ADD COLUMN "payoutHoldReason" TEXT,
ADD COLUMN "payoutHeldAt" TIMESTAMP(3),
ADD COLUMN "payoutHeldByLabel" TEXT;

-- CreateTable
CREATE TABLE "SettlementHold" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "paymentIntentId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "netAmount" INTEGER NOT NULL,
    "pendingAmount" INTEGER NOT NULL,
    "reserveAmount" INTEGER NOT NULL,
    "availableAt" TIMESTAMP(3) NOT NULL,
    "reserveReleaseAt" TIMESTAMP(3) NOT NULL,
    "status" "SettlementHoldStatus" NOT NULL DEFAULT 'PENDING',
    "delayDays" INTEGER NOT NULL,
    "reserveBps" INTEGER NOT NULL,
    "reserveDays" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SettlementHold_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReserveSeizure" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "externalReference" TEXT NOT NULL,
    "opsUserId" TEXT NOT NULL,
    "opsLabel" TEXT NOT NULL,
    "ledgerGroupId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReserveSeizure_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SettlementHold_transactionId_key" ON "SettlementHold"("transactionId");
CREATE INDEX "SettlementHold_status_availableAt_idx" ON "SettlementHold"("status", "availableAt");
CREATE INDEX "SettlementHold_status_reserveReleaseAt_idx" ON "SettlementHold"("status", "reserveReleaseAt");
CREATE INDEX "SettlementHold_merchantId_currency_status_idx" ON "SettlementHold"("merchantId", "currency", "status");
CREATE INDEX "SettlementHold_paymentIntentId_idx" ON "SettlementHold"("paymentIntentId");
CREATE INDEX "ReserveSeizure_merchantId_createdAt_idx" ON "ReserveSeizure"("merchantId", "createdAt");

-- AddForeignKey
ALTER TABLE "SettlementHold" ADD CONSTRAINT "SettlementHold_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReserveSeizure" ADD CONSTRAINT "ReserveSeizure_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Placeholder settlement policy (ops edits these; the bank's numbers replace them).
-- Level 0 cannot take live payments; it carries level 1's numbers in case ops enables it.
UPDATE "MerchantLevelPolicy" SET "payoutDelayDays" = 7, "reserveBps" = 1000, "reserveDays" = 60 WHERE "level" IN (0, 1);
UPDATE "MerchantLevelPolicy" SET "payoutDelayDays" = 3, "reserveBps" = 500, "reserveDays" = 45 WHERE "level" = 2;
UPDATE "MerchantLevelPolicy" SET "payoutDelayDays" = 1, "reserveBps" = 0, "reserveDays" = 0 WHERE "level" = 3;
```

- [ ] **Step 7: Generate the client (no database involved) and type-check**

Run: `cd apps/api && pnpm exec prisma generate && pnpm exec tsc --noEmit -p tsconfig.json`
Expected: generate succeeds; tsc exits 0. Do **not** run any `prisma migrate` command.

- [ ] **Step 8: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20261007120000_asfi_settlement_holds apps/api/src/settlement/settlement-dates.ts apps/api/src/settlement/settlement-dates.spec.ts
git commit -m "feat(settlement): schema for payout holds, reserve and La Paz settlement dates"
```

---

## Task 2: Settlement policy resolution

**Files:**
- Create: `apps/api/src/settlement/settlement-policy.service.ts`
- Test: `apps/api/src/settlement/settlement-policy.service.spec.ts`

**Interfaces:**
- Consumes: Task 1 Prisma fields.
- Produces:
  ```ts
  export interface SettlementPolicy { delayDays: number; reserveBps: number; reserveDays: number }
  export const STRICT_FALLBACK_POLICY: SettlementPolicy; // { delayDays: 30, reserveBps: 1000, reserveDays: 90 }
  export type SettlementDb = Prisma.TransactionClient | PrismaService;
  class SettlementPolicyService { resolve(db: SettlementDb, merchantId: string): Promise<SettlementPolicy> }
  ```

- [ ] **Step 1: Write the failing test**

`apps/api/src/settlement/settlement-policy.service.spec.ts`:
```ts
import { STRICT_FALLBACK_POLICY, SettlementPolicyService } from "./settlement-policy.service";

function db(merchant: Record<string, unknown>, policy: Record<string, unknown> | null) {
  return {
    merchant: { findUniqueOrThrow: jest.fn().mockResolvedValue(merchant) },
    merchantLevelPolicy: { findUnique: jest.fn().mockResolvedValue(policy) },
  };
}
const noOverrides = { level: 1, payoutDelayDaysOverride: null, reserveBpsOverride: null, reserveDaysOverride: null };
const level1 = { level: 1, payoutDelayDays: 7, reserveBps: 1000, reserveDays: 60 };

describe("SettlementPolicyService.resolve", () => {
  it("uses the level policy when the merchant has no overrides", async () => {
    await expect(new SettlementPolicyService().resolve(db(noOverrides, level1) as any, "m_1"))
      .resolves.toEqual({ delayDays: 7, reserveBps: 1000, reserveDays: 60 });
  });

  it("lets each override win field by field", async () => {
    const merchant = { ...noOverrides, reserveBpsOverride: 0 };
    await expect(new SettlementPolicyService().resolve(db(merchant, level1) as any, "m_1"))
      .resolves.toEqual({ delayDays: 7, reserveBps: 0, reserveDays: 60 });
  });

  it("fails closed to the strict fallback when the level has no policy row", async () => {
    await expect(new SettlementPolicyService().resolve(db(noOverrides, null) as any, "m_1"))
      .resolves.toEqual(STRICT_FALLBACK_POLICY);
  });

  it("still applies overrides on top of the fallback", async () => {
    const merchant = { ...noOverrides, payoutDelayDaysOverride: 2 };
    await expect(new SettlementPolicyService().resolve(db(merchant, null) as any, "m_1"))
      .resolves.toEqual({ delayDays: 2, reserveBps: 1000, reserveDays: 90 });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/api && pnpm exec jest src/settlement/settlement-policy.service.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`apps/api/src/settlement/settlement-policy.service.ts`:
```ts
import { Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

export interface SettlementPolicy {
  delayDays: number;
  reserveBps: number;
  reserveDays: number;
}

export type SettlementDb = Prisma.TransactionClient | PrismaService;

/** Used only if a level has no policy row: hold long and keep a reserve rather than pay out unchecked. */
export const STRICT_FALLBACK_POLICY: SettlementPolicy = { delayDays: 30, reserveBps: 1000, reserveDays: 90 };

@Injectable()
export class SettlementPolicyService {
  private readonly logger = new Logger(SettlementPolicyService.name);

  /** Override first, then the level's policy, then the strict fallback — field by field. Never throws for a missing policy: the buyer has already paid. */
  async resolve(db: SettlementDb, merchantId: string): Promise<SettlementPolicy> {
    const merchant = await db.merchant.findUniqueOrThrow({
      where: { id: merchantId },
      select: { level: true, payoutDelayDaysOverride: true, reserveBpsOverride: true, reserveDaysOverride: true },
    });
    const policy = await db.merchantLevelPolicy.findUnique({ where: { level: merchant.level } });
    if (!policy) this.logger.error(`No MerchantLevelPolicy for level ${merchant.level} (merchant ${merchantId}); using the strict settlement fallback`);
    const base = policy
      ? { delayDays: policy.payoutDelayDays, reserveBps: policy.reserveBps, reserveDays: policy.reserveDays }
      : STRICT_FALLBACK_POLICY;
    return {
      delayDays: merchant.payoutDelayDaysOverride ?? base.delayDays,
      reserveBps: merchant.reserveBpsOverride ?? base.reserveBps,
      reserveDays: merchant.reserveDaysOverride ?? base.reserveDays,
    };
  }
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd apps/api && pnpm exec jest src/settlement/settlement-policy.service.spec.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/settlement/settlement-policy.service.ts apps/api/src/settlement/settlement-policy.service.spec.ts
git commit -m "feat(settlement): resolve the payout delay and reserve per merchant"
```

---

## Task 3: Refund drawdown planner (pure)

**Files:**
- Create: `apps/api/src/settlement/settlement-drawdown.ts`
- Test: `apps/api/src/settlement/settlement-drawdown.spec.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface OpenHold { id: string; paymentIntentId: string; status: SettlementHoldStatus; pendingAmount: number; reserveAmount: number; createdAt: Date }
  export interface HoldUpdate { id: string; pendingAmount: number; reserveAmount: number; status: SettlementHoldStatus }
  export interface DrawdownPlan { debits: { account: LedgerAccount; amount: number }[]; holdUpdates: HoldUpdate[] }
  export function planRefundDrawdown(params: { net: number; available: number; paymentIntentId: string; holds: OpenHold[] }): DrawdownPlan
  export function takeFromReserve(amount: number, holds: OpenHold[]): HoldUpdate[] // oldest-first; used by seizure (Task 8)
  ```
  Debits are always in the order MERCHANT_PAYABLE, MERCHANT_PENDING, RESERVE, omitting zero amounts; the PAYABLE debit is (taken from positive available) + (any remainder that drives it negative).

- [ ] **Step 1: Write the failing test**

`apps/api/src/settlement/settlement-drawdown.spec.ts`:
```ts
import { LedgerAccount, SettlementHoldStatus } from "@prisma/client";
import { OpenHold, planRefundDrawdown, takeFromReserve } from "./settlement-drawdown";

const { PENDING, RESERVE_HELD, CLOSED } = SettlementHoldStatus;
const hold = (over: Partial<OpenHold>): OpenHold => ({
  id: "h", paymentIntentId: "pi_other", status: PENDING, pendingAmount: 0, reserveAmount: 0, createdAt: new Date("2026-10-01T00:00:00Z"), ...over,
});

describe("planRefundDrawdown", () => {
  it("takes everything from available when it covers the refund", () => {
    const plan = planRefundDrawdown({ net: 1000, available: 5000, paymentIntentId: "pi_1", holds: [hold({ id: "h1", pendingAmount: 900 })] });
    expect(plan.debits).toEqual([{ account: LedgerAccount.MERCHANT_PAYABLE, amount: 1000 }]);
    expect(plan.holdUpdates).toEqual([]);
  });

  it("then takes pending from the refunded payment's own hold first, then oldest-first", () => {
    const holds = [
      hold({ id: "older", pendingAmount: 400, reserveAmount: 40, createdAt: new Date("2026-09-01T00:00:00Z") }),
      hold({ id: "own", paymentIntentId: "pi_1", pendingAmount: 500, reserveAmount: 50, createdAt: new Date("2026-10-02T00:00:00Z") }),
    ];
    const plan = planRefundDrawdown({ net: 1000, available: 300, paymentIntentId: "pi_1", holds });
    expect(plan.debits).toEqual([
      { account: LedgerAccount.MERCHANT_PAYABLE, amount: 300 },
      { account: LedgerAccount.MERCHANT_PENDING, amount: 700 },
    ]);
    expect(plan.holdUpdates).toEqual([
      { id: "own", pendingAmount: 0, reserveAmount: 0, status: CLOSED },
      { id: "older", pendingAmount: 200, reserveAmount: 40, status: PENDING },
    ]);
  });

  it("then takes reserve oldest-first", () => {
    const holds = [
      hold({ id: "r2", status: RESERVE_HELD, reserveAmount: 300, createdAt: new Date("2026-09-10T00:00:00Z") }),
      hold({ id: "r1", status: RESERVE_HELD, reserveAmount: 200, createdAt: new Date("2026-09-01T00:00:00Z") }),
    ];
    const plan = planRefundDrawdown({ net: 400, available: 0, paymentIntentId: "pi_1", holds });
    expect(plan.debits).toEqual([{ account: LedgerAccount.RESERVE, amount: 400 }]);
    expect(plan.holdUpdates).toEqual([
      { id: "r1", pendingAmount: 0, reserveAmount: 0, status: CLOSED },
      { id: "r2", pendingAmount: 0, reserveAmount: 100, status: RESERVE_HELD },
    ]);
  });

  it("drives available negative for whatever is left, and ignores an already negative available", () => {
    const plan = planRefundDrawdown({ net: 1000, available: -200, paymentIntentId: "pi_1", holds: [hold({ id: "r", status: RESERVE_HELD, reserveAmount: 100 })] });
    expect(plan.debits).toEqual([
      { account: LedgerAccount.MERCHANT_PAYABLE, amount: 900 },
      { account: LedgerAccount.RESERVE, amount: 100 },
    ]);
  });

  it("returns no debits for a zero net", () => {
    expect(planRefundDrawdown({ net: 0, available: 0, paymentIntentId: "pi_1", holds: [] }).debits).toEqual([]);
  });
});

describe("takeFromReserve", () => {
  it("takes oldest-first and closes emptied holds", () => {
    const holds = [
      hold({ id: "new", status: RESERVE_HELD, reserveAmount: 500, createdAt: new Date("2026-09-20T00:00:00Z") }),
      hold({ id: "old", status: RESERVE_HELD, reserveAmount: 300, createdAt: new Date("2026-09-01T00:00:00Z") }),
      hold({ id: "pending", status: PENDING, pendingAmount: 999 }),
    ];
    expect(takeFromReserve(400, holds)).toEqual([
      { id: "old", pendingAmount: 0, reserveAmount: 0, status: CLOSED },
      { id: "new", pendingAmount: 0, reserveAmount: 400, status: RESERVE_HELD },
    ]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/api && pnpm exec jest src/settlement/settlement-drawdown.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`apps/api/src/settlement/settlement-drawdown.ts`:
```ts
import { LedgerAccount, SettlementHoldStatus } from "@prisma/client";

const { PENDING, RESERVE_HELD, CLOSED } = SettlementHoldStatus;

export interface OpenHold {
  id: string;
  paymentIntentId: string;
  status: SettlementHoldStatus;
  pendingAmount: number;
  reserveAmount: number;
  createdAt: Date;
}

export interface HoldUpdate {
  id: string;
  pendingAmount: number;
  reserveAmount: number;
  status: SettlementHoldStatus;
}

export interface DrawdownPlan {
  debits: { account: LedgerAccount; amount: number }[];
  holdUpdates: HoldUpdate[];
}

const byAge = (a: OpenHold, b: OpenHold) => a.createdAt.getTime() - b.createdAt.getTime();

/** Oldest-first out of RESERVE_HELD holds; a hold emptied of reserve is CLOSED. */
export function takeFromReserve(amount: number, holds: OpenHold[]): HoldUpdate[] {
  let remaining = amount;
  const updates: HoldUpdate[] = [];
  for (const hold of holds.filter((h) => h.status === RESERVE_HELD && h.reserveAmount > 0).sort(byAge)) {
    if (remaining === 0) break;
    const take = Math.min(remaining, hold.reserveAmount);
    remaining -= take;
    const left = hold.reserveAmount - take;
    updates.push({ id: hold.id, pendingAmount: 0, reserveAmount: left, status: left === 0 ? CLOSED : RESERVE_HELD });
  }
  return updates;
}

/**
 * Where a refund's merchant net comes from (spec: automatic drawdown):
 * available → pending (the refunded payment's own hold first, then oldest) →
 * reserve (oldest first) → available again, driving it negative.
 */
export function planRefundDrawdown(params: { net: number; available: number; paymentIntentId: string; holds: OpenHold[] }): DrawdownPlan {
  let remaining = params.net;
  const fromAvailable = Math.min(remaining, Math.max(params.available, 0));
  remaining -= fromAvailable;

  const updates: HoldUpdate[] = [];
  const own = (h: OpenHold) => (h.paymentIntentId === params.paymentIntentId ? 0 : 1);
  let fromPending = 0;
  for (const hold of params.holds.filter((h) => h.status === PENDING && h.pendingAmount > 0).sort((a, b) => own(a) - own(b) || byAge(a, b))) {
    if (remaining === 0) break;
    const take = Math.min(remaining, hold.pendingAmount);
    remaining -= take;
    fromPending += take;
    const left = hold.pendingAmount - take;
    // A PENDING hold's reserveAmount is only planned; with nothing pending there is nothing left to reserve.
    updates.push({ id: hold.id, pendingAmount: left, reserveAmount: left === 0 ? 0 : hold.reserveAmount, status: left === 0 ? CLOSED : PENDING });
  }

  const reserveUpdates = remaining > 0 ? takeFromReserve(remaining, params.holds) : [];
  const fromReserve = reserveUpdates.reduce((sum, u) => {
    const before = params.holds.find((h) => h.id === u.id)!.reserveAmount;
    return sum + (before - u.reserveAmount);
  }, 0);
  remaining -= fromReserve;

  const fromPayable = fromAvailable + remaining;
  const debits = [
    ...(fromPayable > 0 ? [{ account: LedgerAccount.MERCHANT_PAYABLE, amount: fromPayable }] : []),
    ...(fromPending > 0 ? [{ account: LedgerAccount.MERCHANT_PENDING, amount: fromPending }] : []),
    ...(fromReserve > 0 ? [{ account: LedgerAccount.RESERVE, amount: fromReserve }] : []),
  ];
  return { debits, holdUpdates: [...updates, ...reserveUpdates] };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd apps/api && pnpm exec jest src/settlement/settlement-drawdown.spec.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/settlement/settlement-drawdown.ts apps/api/src/settlement/settlement-drawdown.spec.ts
git commit -m "feat(settlement): plan where a refund's money comes from"
```

---

## Task 4: SettlementHoldService and module

**Files:**
- Create: `apps/api/src/settlement/settlement-balances.ts`
- Create: `apps/api/src/settlement/settlement-lock.ts`
- Create: `apps/api/src/settlement/settlement-hold.service.ts`
- Create: `apps/api/src/settlement/settlement.module.ts`
- Modify: `apps/api/src/app.module.ts` (add `SettlementModule` to `imports`, next to `LimitsModule`)
- Test: `apps/api/src/settlement/settlement-hold.service.spec.ts`

**Interfaces:**
- Consumes: `laPazDayStart` (Task 1), `SettlementPolicyService`, `SettlementDb` (Task 2), `planRefundDrawdown` (Task 3), `LedgerService.postJournalEntry/generateGroupId`, `JournalLine` from `../ledger/ledger.service`.
- Produces:
  ```ts
  // settlement-balances.ts
  export interface SettlementBalance { currency: string; available: number; pending: number; reserve: number }
  export function accountBalance(db: SettlementDb, merchantId: string, account: LedgerAccount, currency: string): Promise<number>
  export function merchantBalances(db: SettlementDb, merchantId: string): Promise<SettlementBalance[]>
  // settlement-lock.ts
  export function lockMerchantSettlement(tx: Prisma.TransactionClient, merchantId: string): Promise<void>
  // settlement-hold.service.ts
  class SettlementHoldService {
    recordCapture(tx: Prisma.TransactionClient, p: { merchantId: string; paymentIntentId: string; transactionId: string; currency: string; lines: JournalLine[]; capturedAt?: Date }): Promise<void>
    releaseDue(now?: Date): Promise<number>
    applyRefundDrawdown(tx: Prisma.TransactionClient, p: { merchantId: string; paymentIntentId: string; currency: string; settlementMode: SettlementMode; lines: JournalLine[] }): Promise<JournalLine[]>
  }
  // settlement.module.ts exports SettlementHoldService, SettlementPolicyService
  ```

- [ ] **Step 1: Write the failing test**

`apps/api/src/settlement/settlement-hold.service.spec.ts`:
```ts
import { LedgerAccount, LedgerDirection, SettlementHoldStatus, SettlementMode } from "@prisma/client";
import { LedgerService } from "../ledger/ledger.service";
import { SettlementHoldService } from "./settlement-hold.service";

const { CREDIT, DEBIT } = LedgerDirection;
const policy = { delayDays: 7, reserveBps: 1000, reserveDays: 60 };

function fakeTx() {
  return {
    $executeRaw: jest.fn().mockResolvedValue(0),
    settlementHold: { create: jest.fn(), findUniqueOrThrow: jest.fn(), update: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    ledgerEntry: { createMany: jest.fn(), groupBy: jest.fn().mockResolvedValue([]) },
  };
}

function service(tx = fakeTx(), dueRows: { pending?: unknown[]; reserve?: unknown[] } = {}) {
  const prisma = {
    $transaction: jest.fn(async (cb: (t: unknown) => unknown) => cb(tx)),
    settlementHold: {
      findMany: jest.fn()
        .mockResolvedValueOnce(dueRows.pending ?? [])
        .mockResolvedValueOnce(dueRows.reserve ?? []),
    },
  };
  const policies = { resolve: jest.fn().mockResolvedValue(policy) };
  return { svc: new SettlementHoldService(prisma as any, new LedgerService(), policies as any), tx, prisma, policies };
}

const captureLines = [
  { account: LedgerAccount.RAIL_CLEARING, direction: DEBIT, amount: 10000, merchantId: "m_1", transactionId: "t_1" },
  { account: LedgerAccount.MERCHANT_PENDING, direction: CREDIT, amount: 9750, merchantId: "m_1", transactionId: "t_1" },
  { account: LedgerAccount.PAGOSYA_FEE_REVENUE, direction: CREDIT, amount: 250, merchantId: "m_1", transactionId: "t_1" },
];

describe("SettlementHoldService.recordCapture", () => {
  it("writes a hold with the policy snapshot, La Paz dates and a floored reserve", async () => {
    const { svc, tx } = service();
    await svc.recordCapture(tx as any, {
      merchantId: "m_1", paymentIntentId: "pi_1", transactionId: "t_1", currency: "BOB", lines: captureLines,
      capturedAt: new Date("2026-10-01T15:00:00Z"),
    });
    expect(tx.settlementHold.create).toHaveBeenCalledWith({
      data: {
        merchantId: "m_1", paymentIntentId: "pi_1", transactionId: "t_1", currency: "BOB",
        netAmount: 9750, pendingAmount: 9750, reserveAmount: 975,
        availableAt: new Date("2026-10-08T04:00:00.000Z"), reserveReleaseAt: new Date("2026-11-30T04:00:00.000Z"),
        delayDays: 7, reserveBps: 1000, reserveDays: 60,
      },
    });
  });

  it("does nothing for a capture without a MERCHANT_PENDING credit (FACILITATOR)", async () => {
    const { svc, tx, policies } = service();
    const facilitator = [
      { account: LedgerAccount.RAIL_CLEARING, direction: DEBIT, amount: 1000 },
      { account: LedgerAccount.MERCHANT_PAYABLE, direction: CREDIT, amount: 1000 },
    ];
    await svc.recordCapture(tx as any, { merchantId: "m_1", paymentIntentId: "pi_1", transactionId: "t_1", currency: "BOB", lines: facilitator });
    expect(tx.settlementHold.create).not.toHaveBeenCalled();
    expect(policies.resolve).not.toHaveBeenCalled();
  });

  it("never schedules the reserve release before the delay ends", async () => {
    const { svc, tx, policies } = service();
    policies.resolve.mockResolvedValue({ delayDays: 7, reserveBps: 500, reserveDays: 2 });
    await svc.recordCapture(tx as any, { merchantId: "m_1", paymentIntentId: "pi_1", transactionId: "t_1", currency: "BOB", lines: captureLines, capturedAt: new Date("2026-10-01T15:00:00Z") });
    const data = tx.settlementHold.create.mock.calls[0][0].data;
    expect(data.reserveReleaseAt).toEqual(data.availableAt);
  });
});

describe("SettlementHoldService.releaseDue", () => {
  const now = new Date("2026-10-08T05:00:00Z");
  const pendingHold = {
    id: "h_1", merchantId: "m_1", transactionId: "t_1", currency: "BOB", status: SettlementHoldStatus.PENDING,
    pendingAmount: 9750, reserveAmount: 975, availableAt: new Date("2026-10-08T04:00:00Z"), reserveReleaseAt: new Date("2026-11-30T04:00:00Z"),
  };

  it("moves a due pending hold into available and reserve under the merchant lock", async () => {
    const tx = fakeTx();
    tx.settlementHold.findUniqueOrThrow.mockResolvedValue(pendingHold);
    const { svc } = service(tx, { pending: [{ id: "h_1", merchantId: "m_1" }] });
    await expect(svc.releaseDue(now)).resolves.toBe(1);
    expect(tx.$executeRaw).toHaveBeenCalled();
    expect(tx.ledgerEntry.createMany.mock.calls[0][0].data).toEqual([
      expect.objectContaining({ account: LedgerAccount.MERCHANT_PENDING, direction: DEBIT, amount: 9750, transactionId: "t_1" }),
      expect.objectContaining({ account: LedgerAccount.MERCHANT_PAYABLE, direction: CREDIT, amount: 8775 }),
      expect.objectContaining({ account: LedgerAccount.RESERVE, direction: CREDIT, amount: 975 }),
    ]);
    expect(tx.settlementHold.update).toHaveBeenCalledWith({ where: { id: "h_1" }, data: { pendingAmount: 0, reserveAmount: 975, status: SettlementHoldStatus.RESERVE_HELD } });
  });

  it("closes a hold straight away when it has no reserve", async () => {
    const tx = fakeTx();
    tx.settlementHold.findUniqueOrThrow.mockResolvedValue({ ...pendingHold, reserveAmount: 0 });
    const { svc } = service(tx, { pending: [{ id: "h_1", merchantId: "m_1" }] });
    await svc.releaseDue(now);
    expect(tx.settlementHold.update).toHaveBeenCalledWith({ where: { id: "h_1" }, data: { pendingAmount: 0, reserveAmount: 0, status: SettlementHoldStatus.CLOSED } });
  });

  it("releases a due reserve back to available", async () => {
    const tx = fakeTx();
    tx.settlementHold.findUniqueOrThrow.mockResolvedValue({ ...pendingHold, status: SettlementHoldStatus.RESERVE_HELD, pendingAmount: 0, reserveReleaseAt: new Date("2026-10-08T04:00:00Z") });
    const { svc } = service(tx, { reserve: [{ id: "h_1", merchantId: "m_1" }] });
    await expect(svc.releaseDue(now)).resolves.toBe(1);
    expect(tx.ledgerEntry.createMany.mock.calls[0][0].data).toEqual([
      expect.objectContaining({ account: LedgerAccount.RESERVE, direction: DEBIT, amount: 975 }),
      expect.objectContaining({ account: LedgerAccount.MERCHANT_PAYABLE, direction: CREDIT, amount: 975 }),
    ]);
    expect(tx.settlementHold.update).toHaveBeenCalledWith({ where: { id: "h_1" }, data: { reserveAmount: 0, status: SettlementHoldStatus.CLOSED } });
  });

  it("skips a hold another run or a refund already moved (idempotent)", async () => {
    const tx = fakeTx();
    tx.settlementHold.findUniqueOrThrow.mockResolvedValue({ ...pendingHold, status: SettlementHoldStatus.CLOSED });
    const { svc } = service(tx, { pending: [{ id: "h_1", merchantId: "m_1" }] });
    await expect(svc.releaseDue(now)).resolves.toBe(0);
    expect(tx.ledgerEntry.createMany).not.toHaveBeenCalled();
  });

  it("keeps going when one hold fails", async () => {
    const tx = fakeTx();
    tx.settlementHold.findUniqueOrThrow.mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce(pendingHold);
    const { svc } = service(tx, { pending: [{ id: "bad", merchantId: "m_1" }, { id: "h_1", merchantId: "m_1" }] });
    await expect(svc.releaseDue(now)).resolves.toBe(1);
  });
});

describe("SettlementHoldService.applyRefundDrawdown", () => {
  const refundLines = [
    { account: LedgerAccount.MERCHANT_PAYABLE, direction: DEBIT, amount: 975, merchantId: "m_1", transactionId: "r_1" },
    { account: LedgerAccount.PAGOSYA_FEE_REVENUE, direction: DEBIT, amount: 25, merchantId: "m_1", transactionId: "r_1" },
    { account: LedgerAccount.RAIL_CLEARING, direction: CREDIT, amount: 1000, merchantId: "m_1", transactionId: "r_1" },
  ];

  it("leaves FACILITATOR refunds untouched", async () => {
    const { svc, tx } = service();
    await expect(svc.applyRefundDrawdown(tx as any, { merchantId: "m_1", paymentIntentId: "pi_1", currency: "BOB", settlementMode: SettlementMode.FACILITATOR, lines: refundLines }))
      .resolves.toBe(refundLines);
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it("replaces the payable debit with the drawdown and updates the holds", async () => {
    const tx = fakeTx();
    tx.ledgerEntry.groupBy.mockResolvedValue([{ direction: CREDIT, _sum: { amount: 100 } }]); // available 100
    tx.settlementHold.findMany.mockResolvedValue([
      { id: "own", paymentIntentId: "pi_1", status: SettlementHoldStatus.PENDING, pendingAmount: 975, reserveAmount: 97, createdAt: new Date("2026-10-01T00:00:00Z") },
    ]);
    const { svc } = service(tx);
    const lines = await svc.applyRefundDrawdown(tx as any, { merchantId: "m_1", paymentIntentId: "pi_1", currency: "BOB", settlementMode: SettlementMode.AGGREGATOR, lines: refundLines });
    expect(tx.$executeRaw).toHaveBeenCalled();
    expect(lines).toEqual([
      refundLines[1],
      refundLines[2],
      { account: LedgerAccount.MERCHANT_PAYABLE, direction: DEBIT, amount: 100, merchantId: "m_1", transactionId: "r_1" },
      { account: LedgerAccount.MERCHANT_PENDING, direction: DEBIT, amount: 875, merchantId: "m_1", transactionId: "r_1" },
    ]);
    expect(tx.settlementHold.update).toHaveBeenCalledWith({ where: { id: "own" }, data: { pendingAmount: 100, reserveAmount: 97, status: SettlementHoldStatus.PENDING } });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/api && pnpm exec jest src/settlement/settlement-hold.service.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement balances and lock helpers**

`apps/api/src/settlement/settlement-balances.ts`:
```ts
import { LedgerAccount, LedgerDirection } from "@prisma/client";
import type { SettlementDb } from "./settlement-policy.service";

export interface SettlementBalance {
  currency: string;
  available: number;
  pending: number;
  reserve: number;
}

/** Credit minus debit: MERCHANT_PAYABLE, MERCHANT_PENDING and RESERVE are all money pagosYa owes the merchant. */
export async function accountBalance(db: SettlementDb, merchantId: string, account: LedgerAccount, currency: string): Promise<number> {
  const rows = await db.ledgerEntry.groupBy({ by: ["direction"], where: { merchantId, account, currency }, _sum: { amount: true } });
  const credit = rows.find((r) => r.direction === LedgerDirection.CREDIT)?._sum.amount ?? 0;
  const debit = rows.find((r) => r.direction === LedgerDirection.DEBIT)?._sum.amount ?? 0;
  return credit - debit;
}

const FIELD: Partial<Record<LedgerAccount, keyof Omit<SettlementBalance, "currency">>> = {
  [LedgerAccount.MERCHANT_PAYABLE]: "available",
  [LedgerAccount.MERCHANT_PENDING]: "pending",
  [LedgerAccount.RESERVE]: "reserve",
};

/** Per currency, never summed across currencies. */
export async function merchantBalances(db: SettlementDb, merchantId: string): Promise<SettlementBalance[]> {
  const rows = await db.ledgerEntry.groupBy({
    by: ["currency", "account", "direction"],
    where: { merchantId, account: { in: [LedgerAccount.MERCHANT_PAYABLE, LedgerAccount.MERCHANT_PENDING, LedgerAccount.RESERVE] } },
    _sum: { amount: true },
  });
  const byCurrency = new Map<string, SettlementBalance>();
  for (const row of rows) {
    const balance = byCurrency.get(row.currency) ?? { currency: row.currency, available: 0, pending: 0, reserve: 0 };
    const field = FIELD[row.account]!;
    balance[field] += (row._sum.amount ?? 0) * (row.direction === LedgerDirection.CREDIT ? 1 : -1);
    byCurrency.set(row.currency, balance);
  }
  return [...byCurrency.values()].sort((a, b) => a.currency.localeCompare(b.currency));
}
```

`apps/api/src/settlement/settlement-lock.ts`:
```ts
import { Prisma } from "@prisma/client";

/** Serialises release, refund drawdown and seizure per merchant, so two of them never spend the same held money. */
export async function lockMerchantSettlement(tx: Prisma.TransactionClient, merchantId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`settlement:${merchantId}`}))`;
}
```

- [ ] **Step 4: Implement the service**

`apps/api/src/settlement/settlement-hold.service.ts`:
```ts
import { Injectable, Logger } from "@nestjs/common";
import { LedgerAccount, LedgerDirection, Prisma, SettlementHoldStatus, SettlementMode } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { JournalLine, LedgerService } from "../ledger/ledger.service";
import { SettlementPolicyService } from "./settlement-policy.service";
import { laPazDayStart } from "./settlement-dates";
import { planRefundDrawdown } from "./settlement-drawdown";
import { accountBalance } from "./settlement-balances";
import { lockMerchantSettlement } from "./settlement-lock";

const { CREDIT, DEBIT } = LedgerDirection;
const { PENDING, RESERVE_HELD, CLOSED } = SettlementHoldStatus;

@Injectable()
export class SettlementHoldService {
  private readonly logger = new Logger(SettlementHoldService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly policies: SettlementPolicyService,
  ) {}

  /** Inside the capture transaction: an AGGREGATOR capture credits MERCHANT_PENDING, and this row says when it becomes payable. */
  async recordCapture(
    tx: Prisma.TransactionClient,
    params: { merchantId: string; paymentIntentId: string; transactionId: string; currency: string; lines: JournalLine[]; capturedAt?: Date },
  ): Promise<void> {
    const netAmount = params.lines
      .filter((l) => l.account === LedgerAccount.MERCHANT_PENDING && l.direction === CREDIT)
      .reduce((sum, l) => sum + l.amount, 0);
    if (netAmount <= 0) return; // FACILITATOR capture: the money never sits with pagosYa

    const capturedAt = params.capturedAt ?? new Date();
    const policy = await this.policies.resolve(tx, params.merchantId);
    const availableAt = laPazDayStart(capturedAt, policy.delayDays);
    const reserveReleaseAt = new Date(Math.max(availableAt.getTime(), laPazDayStart(capturedAt, policy.reserveDays).getTime()));
    await tx.settlementHold.create({
      data: {
        merchantId: params.merchantId,
        paymentIntentId: params.paymentIntentId,
        transactionId: params.transactionId,
        currency: params.currency,
        netAmount,
        pendingAmount: netAmount,
        reserveAmount: Math.floor((netAmount * policy.reserveBps) / 10_000),
        availableAt,
        reserveReleaseAt,
        delayDays: policy.delayDays,
        reserveBps: policy.reserveBps,
        reserveDays: policy.reserveDays,
      },
    });
  }

  /** Moves every due hold one stage. Each hold commits on its own, so one bad row never blocks the rest. Returns how many moved. */
  async releaseDue(now = new Date()): Promise<number> {
    const select = { id: true, merchantId: true } as const;
    const duePending = await this.prisma.settlementHold.findMany({ where: { status: PENDING, availableAt: { lte: now } }, orderBy: { availableAt: "asc" }, select });
    let moved = 0;
    for (const hold of duePending) if (await this.releaseOne(hold, now)) moved += 1;
    // Second pass after the first, so a hold whose reserve date equals its available date leaves in the same run.
    const dueReserve = await this.prisma.settlementHold.findMany({ where: { status: RESERVE_HELD, reserveReleaseAt: { lte: now } }, orderBy: { reserveReleaseAt: "asc" }, select });
    for (const hold of dueReserve) if (await this.releaseOne(hold, now)) moved += 1;
    return moved;
  }

  private async releaseOne(ref: { id: string; merchantId: string }, now: Date): Promise<boolean> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await lockMerchantSettlement(tx, ref.merchantId);
        const hold = await tx.settlementHold.findUniqueOrThrow({ where: { id: ref.id } });
        const line = (account: LedgerAccount, direction: LedgerDirection, amount: number): JournalLine => ({ account, direction, amount, merchantId: hold.merchantId, transactionId: hold.transactionId });

        if (hold.status === PENDING && hold.availableAt <= now) {
          const reserve = Math.min(hold.reserveAmount, hold.pendingAmount);
          const toAvailable = hold.pendingAmount - reserve;
          if (hold.pendingAmount > 0) {
            await this.ledger.postJournalEntry(tx, this.ledger.generateGroupId(), [
              line(LedgerAccount.MERCHANT_PENDING, DEBIT, hold.pendingAmount),
              ...(toAvailable > 0 ? [line(LedgerAccount.MERCHANT_PAYABLE, CREDIT, toAvailable)] : []),
              ...(reserve > 0 ? [line(LedgerAccount.RESERVE, CREDIT, reserve)] : []),
            ], hold.currency);
          }
          await tx.settlementHold.update({ where: { id: hold.id }, data: { pendingAmount: 0, reserveAmount: reserve, status: reserve > 0 ? RESERVE_HELD : CLOSED } });
          return true;
        }

        if (hold.status === RESERVE_HELD && hold.reserveReleaseAt <= now) {
          if (hold.reserveAmount > 0) {
            await this.ledger.postJournalEntry(tx, this.ledger.generateGroupId(), [
              line(LedgerAccount.RESERVE, DEBIT, hold.reserveAmount),
              line(LedgerAccount.MERCHANT_PAYABLE, CREDIT, hold.reserveAmount),
            ], hold.currency);
          }
          await tx.settlementHold.update({ where: { id: hold.id }, data: { reserveAmount: 0, status: CLOSED } });
          return true;
        }

        return false; // already moved by another run, a refund or a seizure
      });
    } catch (error) {
      this.logger.error(`Settlement hold ${ref.id} could not be released: ${(error as Error).message}`);
      return false;
    }
  }

  /**
   * Swaps a refund journal's single MERCHANT_PAYABLE debit for the drawdown
   * (available → pending → reserve → negative available). FACILITATOR
   * refunds pass through untouched.
   */
  async applyRefundDrawdown(
    tx: Prisma.TransactionClient,
    params: { merchantId: string; paymentIntentId: string; currency: string; settlementMode: SettlementMode; lines: JournalLine[] },
  ): Promise<JournalLine[]> {
    if (params.settlementMode !== SettlementMode.AGGREGATOR) return params.lines;
    const isPayableDebit = (l: JournalLine) => l.account === LedgerAccount.MERCHANT_PAYABLE && l.direction === DEBIT;
    const payableDebits = params.lines.filter(isPayableDebit);
    const net = payableDebits.reduce((sum, l) => sum + l.amount, 0);
    if (net <= 0) return params.lines;

    await lockMerchantSettlement(tx, params.merchantId);
    const available = await accountBalance(tx, params.merchantId, LedgerAccount.MERCHANT_PAYABLE, params.currency);
    const holds = await tx.settlementHold.findMany({
      where: { merchantId: params.merchantId, currency: params.currency, status: { in: [PENDING, RESERVE_HELD] } },
      select: { id: true, paymentIntentId: true, status: true, pendingAmount: true, reserveAmount: true, createdAt: true },
    });
    const plan = planRefundDrawdown({ net, available, paymentIntentId: params.paymentIntentId, holds });
    for (const update of plan.holdUpdates) {
      await tx.settlementHold.update({ where: { id: update.id }, data: { pendingAmount: update.pendingAmount, reserveAmount: update.reserveAmount, status: update.status } });
    }
    const fromPayable = plan.debits.find((d) => d.account === LedgerAccount.MERCHANT_PAYABLE)?.amount ?? 0;
    if (fromPayable > Math.max(available, 0)) {
      this.logger.warn(`Refund on ${params.paymentIntentId} drives merchant ${params.merchantId} available ${params.currency} balance negative by ${fromPayable - Math.max(available, 0)}`);
    }
    const transactionId = payableDebits[0].transactionId;
    return [
      ...params.lines.filter((l) => !isPayableDebit(l)),
      ...plan.debits.map((d) => ({ account: d.account, direction: DEBIT, amount: d.amount, merchantId: params.merchantId, transactionId })),
    ];
  }
}
```

- [ ] **Step 5: Create the module and register it**

`apps/api/src/settlement/settlement.module.ts`:
```ts
import { Module } from "@nestjs/common";
import { LedgerModule } from "../ledger/ledger.module";
import { SettlementPolicyService } from "./settlement-policy.service";
import { SettlementHoldService } from "./settlement-hold.service";

@Module({
  imports: [LedgerModule],
  providers: [SettlementPolicyService, SettlementHoldService],
  exports: [SettlementPolicyService, SettlementHoldService],
})
export class SettlementModule {}
```
In `apps/api/src/app.module.ts` add `import { SettlementModule } from "./settlement/settlement.module";` and put `SettlementModule,` in `imports` right after `LimitsModule,`.

- [ ] **Step 6: Run tests**

Run: `cd apps/api && pnpm exec jest src/settlement && pnpm exec tsc --noEmit -p tsconfig.json`
Expected: PASS; tsc exits 0.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/settlement apps/api/src/app.module.ts
git commit -m "feat(settlement): hold each aggregator capture, release it daily, draw refunds from it"
```

---

## Task 5: Capture credits MERCHANT_PENDING; capture and refund call the hold service

**Files:**
- Modify: `apps/api/src/ledger/ledger.service.ts:51-87` (`buildCaptureJournal` AGGREGATOR branch) and the comment on `buildPayoutJournal`
- Modify: `apps/api/src/ledger/ledger.service.spec.ts` (AGGREGATOR capture assertions)
- Modify: `apps/api/src/payment-intents/payment-intents.service.ts` (constructor ~line 129; capture block ~line 660)
- Modify: `apps/api/src/payment-intents/payment-intents.module.ts` (import `SettlementModule`)
- Modify: `apps/api/src/payment-intents/payment-intents.service.spec.ts`, `payment-intents-cobro.spec.ts`, `apps/api/src/email-workspace/email-workspace-events.spec.ts` (constructor arity)
- Modify: `apps/api/src/refunds/refunds.service.ts` (constructor line 22; `postSucceededRefund` ~line 283)
- Modify: `apps/api/src/refunds/refunds.module.ts`, `refunds.service.spec.ts:38`, `refunds.dlocal-notification.spec.ts:39`
- Modify: `apps/api/src/shipping/shipping-ledger.ts` (comment only)

**Interfaces:**
- Consumes: `SettlementHoldService.recordCapture`, `SettlementHoldService.applyRefundDrawdown` (Task 4).
- Produces: `buildCaptureJournal` for AGGREGATOR credits `LedgerAccount.MERCHANT_PENDING` with the merchant net (FACILITATOR unchanged).

- [ ] **Step 1: Update the ledger spec to the new behaviour (failing)**

In `apps/api/src/ledger/ledger.service.spec.ts`, change the first test to:
```ts
  it("builds a balanced capture journal for AGGREGATOR merchants, netting the fee out into MERCHANT_PENDING", () => {
    const lines = ledger.buildCaptureJournal({ ...base, settlementMode: SettlementMode.AGGREGATOR });
    expect(netsToZero(lines)).toBe(true);
    const fee = lines.find((l) => l.account === LedgerAccount.PAGOSYA_FEE_REVENUE);
    const pending = lines.find((l) => l.account === LedgerAccount.MERCHANT_PENDING);
    expect(fee?.amount).toBe(25); // 2.5% of 1000
    expect(pending).toMatchObject({ direction: LedgerDirection.CREDIT, amount: 975 });
    expect(lines.find((l) => l.account === LedgerAccount.MERCHANT_PAYABLE)).toBeUndefined();
  });
```
and in the international test replace the `MERCHANT_PAYABLE` expectation with:
```ts
    expect(find(LedgerAccount.MERCHANT_PENDING)).toMatchObject({ direction: LedgerDirection.CREDIT, amount: 9410 });
```
Leave the FACILITATOR, refund and payout tests as they are.

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/api && pnpm exec jest src/ledger/ledger.service.spec.ts`
Expected: FAIL — `pending` is undefined.

- [ ] **Step 3: Change the capture journal**

In `apps/api/src/ledger/ledger.service.ts`, in the AGGREGATOR return of `buildCaptureJournal`, replace
```ts
      { account: LedgerAccount.MERCHANT_PAYABLE, direction: LedgerDirection.CREDIT, amount: net, merchantId, transactionId },
```
with
```ts
      // Held until the merchant's payout delay ends — SettlementHoldService moves it to MERCHANT_PAYABLE/RESERVE.
      { account: LedgerAccount.MERCHANT_PENDING, direction: LedgerDirection.CREDIT, amount: net, merchantId, transactionId },
```
Update the doc comment above `buildCaptureJournal`: replace "(MERCHANT_PAYABLE is a liability paid out later)" with "(the net waits in MERCHANT_PENDING, then MERCHANT_PAYABLE and RESERVE — see SettlementHoldService)". Leave `buildRefundJournal` unchanged (its MERCHANT_PAYABLE debit is replaced by the drawdown in RefundsService).

- [ ] **Step 4: Run the ledger spec**

Run: `cd apps/api && pnpm exec jest src/ledger/ledger.service.spec.ts`
Expected: PASS.

- [ ] **Step 5: Wire the capture**

In `apps/api/src/payment-intents/payment-intents.service.ts`:
- add `import { SettlementHoldService } from "../settlement/settlement-hold.service";`
- in the constructor, insert after `private readonly limitsWarning: LimitsWarningService,`:
  ```ts
    private readonly settlement: SettlementHoldService,
  ```
  (it must stay before the `@Optional() inbox` parameter).
- in the `if (result.status === "succeeded")` block, directly after `await this.ledger.postJournalEntry(tx, this.ledger.generateGroupId(), lines, updated.currency);` add:
  ```ts
        await this.settlement.recordCapture(tx, { merchantId, paymentIntentId: updated.id, transactionId: transactionRow.id, currency: updated.currency, lines });
  ```
In `apps/api/src/payment-intents/payment-intents.module.ts` add `import { SettlementModule } from "../settlement/settlement.module";` and append `SettlementModule` to `imports`.

Update every direct construction (the 11th argument is now the settlement service):
```bash
cd apps/api
perl -0pi -e 's/(new PaymentIntentsService\((?:[^()]|\([^()]*\))*?\{ notify: jest\.fn\(\) \} as any)\)/$1, { recordCapture: jest.fn() } as any)/g' \
  src/payment-intents/payment-intents.service.spec.ts src/payment-intents/payment-intents-cobro.spec.ts src/email-workspace/email-workspace-events.spec.ts
grep -c "recordCapture: jest.fn()" src/payment-intents/payment-intents.service.spec.ts src/payment-intents/payment-intents-cobro.spec.ts src/email-workspace/email-workspace-events.spec.ts
```
Expected counts: 16, 1, 1. If a count is lower, open that file and add `, { recordCapture: jest.fn() } as any` as the last argument of each remaining `new PaymentIntentsService(` call by hand.

- [ ] **Step 6: Wire the refund**

In `apps/api/src/refunds/refunds.service.ts`:
- add `import { SettlementHoldService } from "../settlement/settlement-hold.service";`
- append to the constructor after `private readonly shipments: ShipmentsService,`:
  ```ts
    private readonly settlement: SettlementHoldService,
  ```
- in `postSucceededRefund`, replace
  ```ts
    const lines = this.ledger.buildRefundJournal({
  ```
  with
  ```ts
    const refundJournal = this.ledger.buildRefundJournal({
  ```
  and right after that call's closing `});` add:
  ```ts
    // AGGREGATOR: the merchant's share comes from available, then pending, then reserve (spec: automatic drawdown).
    const lines = await this.settlement.applyRefundDrawdown(tx, {
      merchantId,
      paymentIntentId: intent.id,
      currency: intent.currency,
      settlementMode: merchant.settlementMode,
      lines: refundJournal,
    });
  ```
In `apps/api/src/refunds/refunds.module.ts` import `SettlementModule` and add it to `imports`.
In `refunds.service.spec.ts:38` and `refunds.dlocal-notification.spec.ts:39`, add a 7th constructor argument:
```ts
{ applyRefundDrawdown: jest.fn(async (_tx: unknown, p: { lines: unknown[] }) => p.lines) } as any
```

- [ ] **Step 7: Leave the rule on the unwired shipping journal**

In `apps/api/src/shipping/shipping-ledger.ts`, above `shippingCollectedJournal`, extend the comment:
```ts
/**
 * Posted after the capture journal for platform-account shipments: the shipping line never becomes the merchant's money.
 * Not wired yet (shipments Phase 2). When it is, for AGGREGATOR captures it must debit MERCHANT_PENDING (where the
 * capture net now lands) and reduce that capture's SettlementHold.pendingAmount by the same amount.
 */
```
(replace the existing one-line comment).

- [ ] **Step 8: Run the affected suites and type-check**

Run: `cd apps/api && pnpm exec jest src/ledger src/payment-intents src/refunds src/email-workspace src/inbox src/shipping && pnpm exec tsc --noEmit -p tsconfig.json`
Expected: PASS; tsc exits 0. If `inbox-module-wiring.spec.ts` or `checkout-branding.spec.ts` fail on Nest DI for `SettlementHoldService`, provide it the same way those specs provide `LimitsService` (read the spec; add a `{ provide: SettlementHoldService, useValue: { recordCapture: jest.fn() } }` override next to the existing ones).

- [ ] **Step 9: Commit**

```bash
git add -A apps/api/src
git commit -m "feat(settlement): captures wait in MERCHANT_PENDING and refunds draw down held money"
```

---

## Task 6: Daily payout batch, held merchants skipped

**Files:**
- Create: `apps/api/src/payouts/payout-schedule.job.ts`
- Test: `apps/api/src/payouts/payout-schedule.job.spec.ts`
- Modify: `apps/api/src/payouts/payout-delivery.worker.ts:29-31` (stop creating payouts)
- Modify: `apps/api/src/payouts/payout-delivery.worker.spec.ts:36-45`
- Modify: `apps/api/src/payouts/payouts.service.ts` (`createDuePayouts`)
- Modify: `apps/api/src/payouts/payouts.service.spec.ts`
- Modify: `apps/api/src/payouts/payouts.module.ts`

**Interfaces:**
- Consumes: `SettlementHoldService.releaseDue(now)` (Task 4), `Merchant.payoutHeldAt` (Task 1).
- Produces: `PayoutScheduleJob.run(now?: Date): Promise<void>` registered as cron `daily-payout-batch`.

- [ ] **Step 1: Write the failing tests**

`apps/api/src/payouts/payout-schedule.job.spec.ts`:
```ts
import { PayoutScheduleJob } from "./payout-schedule.job";

describe("PayoutScheduleJob", () => {
  it("releases due holds before creating payouts", async () => {
    const order: string[] = [];
    const holds = { releaseDue: jest.fn(async () => { order.push("release"); return 2; }) };
    const payouts = { createDuePayouts: jest.fn(async () => { order.push("payouts"); }) };
    const now = new Date("2026-10-08T14:00:00Z");
    await new PayoutScheduleJob(holds as any, payouts as any).run(now);
    expect(holds.releaseDue).toHaveBeenCalledWith(now);
    expect(order).toEqual(["release", "payouts"]);
  });

  it("still pays out already-available money when the release fails", async () => {
    const holds = { releaseDue: jest.fn().mockRejectedValue(new Error("db down")) };
    const payouts = { createDuePayouts: jest.fn().mockResolvedValue(undefined) };
    await new PayoutScheduleJob(holds as any, payouts as any).run();
    expect(payouts.createDuePayouts).toHaveBeenCalled();
  });
});
```
Add to `payouts.service.spec.ts` inside `describe("PayoutsService.createDuePayouts")`:
```ts
  it("skips a merchant whose payouts ops has held", async () => {
    const prisma = makeFakePrisma();
    prisma.merchant.findMany.mockResolvedValue([{ ...aggregatorMerchant, payoutHeldAt: new Date() }]);
    prisma.payout.findFirst.mockResolvedValue(null);
    prisma.ledgerEntry.groupBy.mockResolvedValue([{ currency: "BOB", direction: LedgerDirection.CREDIT, _sum: { amount: 5000 } }]);
    prisma.merchantKycSubmission.findFirst.mockResolvedValue({ status: KycStatus.APPROVED, payoutBankAccount: "BNB 123" });

    await new PayoutsService(prisma as any, termsAccepted() as any).createDuePayouts();

    expect(prisma.payout.create).not.toHaveBeenCalled();
  });

  it("pays nothing while the available balance is negative", async () => {
    const prisma = makeFakePrisma();
    prisma.merchant.findMany.mockResolvedValue([aggregatorMerchant]);
    prisma.ledgerEntry.groupBy.mockResolvedValue([
      { currency: "BOB", direction: LedgerDirection.CREDIT, _sum: { amount: 1000 } },
      { currency: "BOB", direction: LedgerDirection.DEBIT, _sum: { amount: 4000 } },
    ]);

    await new PayoutsService(prisma as any, termsAccepted() as any).createDuePayouts();

    expect(prisma.payout.create).not.toHaveBeenCalled();
  });
```
In `payout-delivery.worker.spec.ts` replace the test `"runs createDuePayouts before delivering candidates"` with:
```ts
  it("only delivers existing payouts — creating them is the daily batch's job", async () => {
```
keeping its setup, and change its assertion to `expect(payoutsService.createDuePayouts).not.toHaveBeenCalled();`.

- [ ] **Step 2: Run them to verify they fail**

Run: `cd apps/api && pnpm exec jest src/payouts`
Expected: FAIL — `payout-schedule.job` missing; held merchant gets a payout; worker still calls `createDuePayouts`.

- [ ] **Step 3: Implement**

`apps/api/src/payouts/payout-schedule.job.ts`:
```ts
import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { SettlementHoldService } from "../settlement/settlement-hold.service";
import { PayoutsService } from "./payouts.service";

/** The one daily payout batch, 10:00 La Paz (ASFI sub-project 3). PayoutDeliveryWorker then delivers and retries what this creates. */
@Injectable()
export class PayoutScheduleJob {
  private readonly logger = new Logger(PayoutScheduleJob.name);

  constructor(
    private readonly holds: SettlementHoldService,
    private readonly payouts: PayoutsService,
  ) {}

  @Cron("0 10 * * *", { name: "daily-payout-batch", timeZone: "America/La_Paz" })
  async run(now = new Date()): Promise<void> {
    try {
      const moved = await this.holds.releaseDue(now);
      if (moved > 0) this.logger.log(`Released ${moved} settlement hold stage(s)`);
    } catch (error) {
      // Money already available must not wait a day because the release failed.
      this.logger.error(`Settlement release failed; paying out what is already available: ${(error as Error).message}`);
    }
    await this.payouts.createDuePayouts();
  }
}
```
In `payout-delivery.worker.ts` delete the line `await this.payouts.createDuePayouts();` from `tick()`, remove the now-unused `PayoutsService` constructor parameter and import **only if** nothing else in the file uses it, and update the class doc comment to: `/** Delivers due Payout rows (created by PayoutScheduleJob). Mirrors WebhookDeliveryWorker/InvoiceEmissionWorker's claim/backoff shape. */`. If you remove the constructor parameter, update the worker spec's constructor call to match.

In `payouts.service.ts` `createDuePayouts`, right after `for (const merchant of merchants) {` add:
```ts
      // Ops hold (ASFI sub-project 3): the balance keeps accruing; nothing leaves until an admin lifts it.
      if (merchant.payoutHeldAt) {
        this.logger.warn(`Payout held by ops: merchant ${merchant.id}`);
        continue;
      }
```
Update its doc comment's first sentence to: "Run once a day by PayoutScheduleJob: enqueues one PENDING Payout per (merchant, currency) with a positive available (MERCHANT_PAYABLE) balance and no payout of that currency already in flight."

In `payouts.module.ts` import `SettlementModule` and `PayoutScheduleJob`; add `SettlementModule` to `imports` and `PayoutScheduleJob` to `providers`.

- [ ] **Step 4: Run tests and type-check**

Run: `cd apps/api && pnpm exec jest src/payouts && pnpm exec tsc --noEmit -p tsconfig.json`
Expected: PASS; tsc exits 0.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/payouts
git commit -m "feat(payouts): one daily batch at 10:00 La Paz that skips held merchants"
```

---

## Task 7: Balances and schedule for the merchant

**Files:**
- Create: `apps/api/src/settlement/settlement-schedule.ts`
- Create: `apps/api/src/settlement/settlement-query.service.ts`
- Create: `apps/api/src/settlement/dashboard-settlement.controller.ts`
- Modify: `apps/api/src/settlement/settlement.module.ts`
- Modify: `apps/api/src/payouts/payouts.controller.ts` (`getBalance`)
- Test: `apps/api/src/settlement/settlement-schedule.spec.ts`, `apps/api/src/settlement/settlement-query.service.spec.ts`, `apps/api/src/payouts/payouts.controller.spec.ts`

**Interfaces:**
- Consumes: `merchantBalances` (Task 4), `SettlementPolicyService` (Task 2), `laPazDateKey`, `nextPayoutBatch` (Task 1).
- Produces:
  ```ts
  // settlement-schedule.ts
  export interface ScheduledRelease { date: string; currency: string; toAvailable: number; fromReserve: number }
  export function buildReleaseSchedule(holds: { status: SettlementHoldStatus; currency: string; pendingAmount: number; reserveAmount: number; availableAt: Date; reserveReleaseAt: Date }[], until: Date): ScheduledRelease[]
  // settlement-query.service.ts
  export interface MerchantSettlementPolicy { level: number; levelName: string; delayDays: number; reserveBps: number; reserveDays: number }
  export interface NextLevelPolicy { level: number; name: string; delayDays: number; reserveBps: number; reserveDays: number }
  export interface SettlementSchedule { policy: MerchantSettlementPolicy; nextLevel: NextLevelPolicy | null; releases: ScheduledRelease[] }
  class SettlementQueryService {
    balances(merchantId: string): Promise<SettlementBalance[]>
    payoutsHeld(merchantId: string): Promise<boolean>
    schedule(merchantId: string, now?: Date): Promise<SettlementSchedule>
  }
  ```
  `GET v1/merchants/balance` → `{ payableBalance, currency: "BOB", payoutsHeld, balances: [{ currency, payableBalance, available, pending, reserve, nextPayoutAt }] }`.
  `GET v1/merchants/settlement/schedule` → `SettlementSchedule`.

- [ ] **Step 1: Write the failing tests**

`apps/api/src/settlement/settlement-schedule.spec.ts`:
```ts
import { SettlementHoldStatus } from "@prisma/client";
import { buildReleaseSchedule } from "./settlement-schedule";

const base = { currency: "BOB", pendingAmount: 0, reserveAmount: 0 };

describe("buildReleaseSchedule", () => {
  it("groups by La Paz date and currency, splitting pending into available and reserve", () => {
    const releases = buildReleaseSchedule([
      { ...base, status: SettlementHoldStatus.PENDING, pendingAmount: 9750, reserveAmount: 975, availableAt: new Date("2026-10-08T04:00:00Z"), reserveReleaseAt: new Date("2026-11-30T04:00:00Z") },
      { ...base, status: SettlementHoldStatus.PENDING, pendingAmount: 1000, reserveAmount: 0, availableAt: new Date("2026-10-08T04:00:00Z"), reserveReleaseAt: new Date("2026-10-08T04:00:00Z") },
      { ...base, status: SettlementHoldStatus.RESERVE_HELD, reserveAmount: 500, availableAt: new Date("2026-09-01T04:00:00Z"), reserveReleaseAt: new Date("2026-10-08T04:00:00Z") },
    ], new Date("2026-12-31T00:00:00Z"));
    expect(releases).toEqual([
      { date: "2026-10-08", currency: "BOB", toAvailable: 9775, fromReserve: 500 },
      { date: "2026-11-30", currency: "BOB", toAvailable: 0, fromReserve: 975 },
    ]);
  });

  it("caps a planned reserve at what is still pending, and drops dates past the window", () => {
    const releases = buildReleaseSchedule([
      { ...base, status: SettlementHoldStatus.PENDING, pendingAmount: 100, reserveAmount: 975, availableAt: new Date("2026-10-08T04:00:00Z"), reserveReleaseAt: new Date("2027-02-01T04:00:00Z") },
    ], new Date("2026-12-07T00:00:00Z"));
    // 100 pending, planned reserve capped to 100 -> nothing to available; the reserve date is past the window.
    expect(releases).toEqual([]);
  });
});
```
`apps/api/src/settlement/settlement-query.service.spec.ts`:
```ts
import { SettlementQueryService } from "./settlement-query.service";

function prismaWith(merchant: Record<string, unknown>, policies: Record<number, Record<string, unknown>>) {
  return {
    merchant: { findUniqueOrThrow: jest.fn().mockResolvedValue(merchant), findUnique: jest.fn().mockResolvedValue(merchant) },
    merchantLevelPolicy: { findUnique: jest.fn(async ({ where }: { where: { level: number } }) => policies[where.level] ?? null) },
    settlementHold: { findMany: jest.fn().mockResolvedValue([]) },
    ledgerEntry: { groupBy: jest.fn().mockResolvedValue([]) },
  };
}
const levels = {
  1: { level: 1, name: "Persona", liveEnabled: true, payoutDelayDays: 7, reserveBps: 1000, reserveDays: 60 },
  2: { level: 2, name: "Negocio", liveEnabled: true, payoutDelayDays: 3, reserveBps: 500, reserveDays: 45 },
};
const plain = { level: 1, payoutDelayDaysOverride: null, reserveBpsOverride: null, reserveDaysOverride: null, payoutHeldAt: null };

describe("SettlementQueryService.schedule", () => {
  it("returns the effective policy and the next level's numbers", async () => {
    const policies = { resolve: jest.fn().mockResolvedValue({ delayDays: 7, reserveBps: 1000, reserveDays: 60 }) };
    const schedule = await new SettlementQueryService(prismaWith(plain, levels) as any, policies as any).schedule("m_1");
    expect(schedule.policy).toEqual({ level: 1, levelName: "Persona", delayDays: 7, reserveBps: 1000, reserveDays: 60 });
    expect(schedule.nextLevel).toEqual({ level: 2, name: "Negocio", delayDays: 3, reserveBps: 500, reserveDays: 45 });
    expect(schedule.releases).toEqual([]);
  });

  it("hides the next level for a merchant on custom conditions", async () => {
    const policies = { resolve: jest.fn().mockResolvedValue({ delayDays: 1, reserveBps: 0, reserveDays: 0 }) };
    const schedule = await new SettlementQueryService(prismaWith({ ...plain, payoutDelayDaysOverride: 1 }, levels) as any, policies as any).schedule("m_1");
    expect(schedule.nextLevel).toBeNull();
  });

  it("never exposes the internal hold reason", async () => {
    const policies = { resolve: jest.fn().mockResolvedValue({ delayDays: 7, reserveBps: 1000, reserveDays: 60 }) };
    const schedule = await new SettlementQueryService(prismaWith({ ...plain, payoutHoldReason: "fraude sospechado" }, levels) as any, policies as any).schedule("m_1");
    expect(JSON.stringify(schedule)).not.toContain("fraude");
  });
});
```

`apps/api/src/payouts/payouts.controller.spec.ts`:
```ts
import { PayoutsController } from "./payouts.controller";

describe("PayoutsController.getBalance", () => {
  const settlement = {
    balances: jest.fn().mockResolvedValue([{ currency: "BOB", available: 8775, pending: 9750, reserve: 975 }]),
    payoutsHeld: jest.fn().mockResolvedValue(false),
  };

  it("keeps the old fields and adds pending, reserve and the next batch", async () => {
    // Only the clock is faked; leaving the microtask queue real keeps the awaited mocks resolving.
    jest.useFakeTimers({ now: new Date("2026-10-08T13:00:00Z"), doNotFake: ["nextTick", "queueMicrotask", "setImmediate"] });
    const body = await new PayoutsController({} as any, settlement as any).getBalance({ id: "m_1" });
    jest.useRealTimers();
    expect(body).toEqual({
      payableBalance: 8775,
      currency: "BOB",
      payoutsHeld: false,
      balances: [{ currency: "BOB", payableBalance: 8775, available: 8775, pending: 9750, reserve: 975, nextPayoutAt: "2026-10-08T14:00:00.000Z" }],
    });
  });

  it("shows no next payout while payouts are held, and never the reason", async () => {
    settlement.payoutsHeld.mockResolvedValueOnce(true);
    const body = await new PayoutsController({} as any, settlement as any).getBalance({ id: "m_1" });
    expect(body.payoutsHeld).toBe(true);
    expect(body.balances[0].nextPayoutAt).toBeNull();
    expect(JSON.stringify(body)).not.toContain("Reason");
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd apps/api && pnpm exec jest src/settlement/settlement-schedule.spec.ts src/settlement/settlement-query.service.spec.ts src/payouts/payouts.controller.spec.ts`
Expected: FAIL — modules missing / controller arity.

- [ ] **Step 3: Implement the schedule builder**

`apps/api/src/settlement/settlement-schedule.ts`:
```ts
import { SettlementHoldStatus } from "@prisma/client";
import { laPazDateKey } from "./settlement-dates";

export interface ScheduledRelease {
  date: string;
  currency: string;
  toAvailable: number;
  fromReserve: number;
}

type ScheduleHold = { status: SettlementHoldStatus; currency: string; pendingAmount: number; reserveAmount: number; availableAt: Date; reserveReleaseAt: Date };

/** What becomes available on which La Paz day, per currency, up to `until`. Zero rows are dropped. */
export function buildReleaseSchedule(holds: ScheduleHold[], until: Date): ScheduledRelease[] {
  const rows = new Map<string, ScheduledRelease>();
  const add = (at: Date, currency: string, toAvailable: number, fromReserve: number) => {
    if (at > until || (toAvailable === 0 && fromReserve === 0)) return;
    const date = laPazDateKey(at);
    const key = `${date}|${currency}`;
    const row = rows.get(key) ?? { date, currency, toAvailable: 0, fromReserve: 0 };
    row.toAvailable += toAvailable;
    row.fromReserve += fromReserve;
    rows.set(key, row);
  };
  for (const hold of holds) {
    if (hold.status === SettlementHoldStatus.PENDING) {
      const reserve = Math.min(hold.reserveAmount, hold.pendingAmount);
      add(hold.availableAt, hold.currency, hold.pendingAmount - reserve, 0);
      add(hold.reserveReleaseAt, hold.currency, 0, reserve);
    } else if (hold.status === SettlementHoldStatus.RESERVE_HELD) {
      add(hold.reserveReleaseAt, hold.currency, 0, hold.reserveAmount);
    }
  }
  return [...rows.values()].sort((a, b) => a.date.localeCompare(b.date) || a.currency.localeCompare(b.currency));
}
```

- [ ] **Step 4: Implement the query service**

`apps/api/src/settlement/settlement-query.service.ts`:
```ts
import { Injectable } from "@nestjs/common";
import { SettlementHoldStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { SettlementPolicyService } from "./settlement-policy.service";
import { SettlementBalance, merchantBalances } from "./settlement-balances";
import { ScheduledRelease, buildReleaseSchedule } from "./settlement-schedule";

const SCHEDULE_WINDOW_DAYS = 60;

export interface MerchantSettlementPolicy { level: number; levelName: string; delayDays: number; reserveBps: number; reserveDays: number }
export interface NextLevelPolicy { level: number; name: string; delayDays: number; reserveBps: number; reserveDays: number }
export interface SettlementSchedule { policy: MerchantSettlementPolicy; nextLevel: NextLevelPolicy | null; releases: ScheduledRelease[] }

@Injectable()
export class SettlementQueryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policies: SettlementPolicyService,
  ) {}

  balances(merchantId: string): Promise<SettlementBalance[]> {
    return merchantBalances(this.prisma, merchantId);
  }

  async payoutsHeld(merchantId: string): Promise<boolean> {
    const merchant = await this.prisma.merchant.findUnique({ where: { id: merchantId }, select: { payoutHeldAt: true } });
    return Boolean(merchant?.payoutHeldAt);
  }

  /** Merchant-facing: the conditions in plain numbers and upcoming releases. Never includes the hold reason. */
  async schedule(merchantId: string, now = new Date()): Promise<SettlementSchedule> {
    const merchant = await this.prisma.merchant.findUniqueOrThrow({
      where: { id: merchantId },
      select: { level: true, payoutDelayDaysOverride: true, reserveBpsOverride: true, reserveDaysOverride: true },
    });
    const [effective, levelPolicy, next, holds] = await Promise.all([
      this.policies.resolve(this.prisma, merchantId),
      this.prisma.merchantLevelPolicy.findUnique({ where: { level: merchant.level } }),
      merchant.level < 3 ? this.prisma.merchantLevelPolicy.findUnique({ where: { level: merchant.level + 1 } }) : Promise.resolve(null),
      this.prisma.settlementHold.findMany({
        where: { merchantId, status: { in: [SettlementHoldStatus.PENDING, SettlementHoldStatus.RESERVE_HELD] } },
        select: { status: true, currency: true, pendingAmount: true, reserveAmount: true, availableAt: true, reserveReleaseAt: true },
      }),
    ]);
    const customConditions = merchant.payoutDelayDaysOverride != null || merchant.reserveBpsOverride != null || merchant.reserveDaysOverride != null;
    const until = new Date(now.getTime() + SCHEDULE_WINDOW_DAYS * 24 * 60 * 60_000);
    return {
      policy: { level: merchant.level, levelName: levelPolicy?.name ?? `Nivel ${merchant.level}`, ...effective },
      nextLevel: next && next.liveEnabled && !customConditions
        ? { level: next.level, name: next.name, delayDays: next.payoutDelayDays, reserveBps: next.reserveBps, reserveDays: next.reserveDays }
        : null,
      releases: buildReleaseSchedule(holds, until),
    };
  }
}
```

- [ ] **Step 5: Implement the merchant endpoint and balance changes**

`apps/api/src/settlement/dashboard-settlement.controller.ts`:
```ts
import { Controller, Get, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { MerchantAuthGuard } from "../dashboard/guards/merchant-auth.guard";
import { CurrentMerchant } from "../auth/decorators/current-merchant.decorator";
import { SettlementQueryService } from "./settlement-query.service";

@ApiTags("settlement")
@Controller("v1/merchants/settlement")
export class DashboardSettlementController {
  constructor(private readonly query: SettlementQueryService) {}

  @Get("schedule")
  @ApiBearerAuth()
  @UseGuards(MerchantAuthGuard)
  schedule(@CurrentMerchant() merchant: { id: string }) {
    return this.query.schedule(merchant.id);
  }
}
```
Update `settlement.module.ts`:
```ts
import { Module } from "@nestjs/common";
import { LedgerModule } from "../ledger/ledger.module";
import { AuthModule } from "../auth/auth.module";
import { DashboardModule } from "../dashboard/dashboard.module";
import { SettlementPolicyService } from "./settlement-policy.service";
import { SettlementHoldService } from "./settlement-hold.service";
import { SettlementQueryService } from "./settlement-query.service";
import { DashboardSettlementController } from "./dashboard-settlement.controller";

@Module({
  imports: [LedgerModule, AuthModule, DashboardModule],
  controllers: [DashboardSettlementController],
  providers: [SettlementPolicyService, SettlementHoldService, SettlementQueryService],
  exports: [SettlementPolicyService, SettlementHoldService, SettlementQueryService],
})
export class SettlementModule {}
```
In `apps/api/src/payouts/payouts.controller.ts`: add imports `import { SettlementQueryService } from "../settlement/settlement-query.service";` and `import { nextPayoutBatch } from "../settlement/settlement-dates";`, change the constructor to
```ts
  constructor(
    private readonly payouts: PayoutsService,
    private readonly settlement: SettlementQueryService,
  ) {}
```
and replace `getBalance`'s body with:
```ts
    const [balances, payoutsHeld] = await Promise.all([this.settlement.balances(merchant.id), this.settlement.payoutsHeld(merchant.id)]);
    const nextBatch = nextPayoutBatch(new Date()).toISOString();
    const rows = balances.map((b) => ({
      currency: b.currency,
      payableBalance: b.available, // existing dashboard clients read this
      available: b.available,
      pending: b.pending,
      reserve: b.reserve,
      nextPayoutAt: !payoutsHeld && b.available > 0 ? nextBatch : null,
    }));
    const payableBalance = rows.find((r) => r.currency === "BOB")?.payableBalance ?? 0;
    return { payableBalance, currency: "BOB", payoutsHeld, balances: rows };
```

- [ ] **Step 6: Run tests and type-check**

Run: `cd apps/api && pnpm exec jest src/settlement src/payouts && pnpm exec tsc --noEmit -p tsconfig.json`
Expected: PASS; tsc exits 0.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/settlement apps/api/src/payouts
git commit -m "feat(settlement): merchants see available, pending, reserve and when money is released"
```

---

## Task 8: Ops tools — overrides, hold, seizure, policy columns

**Files:**
- Create: `apps/api/src/settlement/settlement-admin.service.ts`
- Create: `apps/api/src/settlement/ops-settlement.controller.ts`
- Create: `apps/api/src/settlement/dto/settlement-overrides.dto.ts`, `dto/place-payout-hold.dto.ts`, `dto/reserve-seizure.dto.ts`
- Modify: `apps/api/src/settlement/settlement.module.ts`
- Modify: `apps/api/src/limits/dto/update-policy.dto.ts`, `apps/api/src/limits/limits-admin.service.ts` (`updatePolicy` data type)
- Test: `apps/api/src/settlement/settlement-admin.service.spec.ts`, `apps/api/src/limits/limits-admin.service.spec.ts` (one new case)

**Interfaces:**
- Consumes: `lockMerchantSettlement`, `accountBalance` (Task 4), `takeFromReserve` (Task 3), `SettlementQueryService` (Task 7), `AuditLogService.record`, `EMAIL_PROVIDER`/`EmailProvider` from `../dashboard/tokens` and `../dashboard/interfaces/email-provider.interface`.
- Produces:
  ```ts
  export type SettlementActor = { id: string; name: string; email: string; role: OpsRole };
  class SettlementAdminService {
    overview(merchantId: string): Promise<{ merchantId: string; overrides: { payoutDelayDaysOverride: number | null; reserveBpsOverride: number | null; reserveDaysOverride: number | null }; hold: { reason: string; heldAt: Date; heldBy: string } | null; policy: MerchantSettlementPolicy; balances: SettlementBalance[]; releases: ScheduledRelease[] }>
    updateOverrides(merchantId: string, data: { payoutDelayDaysOverride?: number | null; reserveBpsOverride?: number | null; reserveDaysOverride?: number | null }, actor: SettlementActor): Promise<unknown>
    placeHold(merchantId: string, reason: string, actor: SettlementActor): Promise<{ held: true }>
    liftHold(merchantId: string, actor: SettlementActor): Promise<{ held: false }>
    seize(merchantId: string, data: { amount: number; currency: string; reason: string; externalReference: string }, actor: SettlementActor): Promise<ReserveSeizure>
    listHolds(): Promise<{ id: string; name: string; email: string; payoutHoldReason: string | null; payoutHeldAt: Date | null; payoutHeldByLabel: string | null }[]>
  }
  ```
  Endpoints exactly as in the spec table, under `@Controller("internal")` with `@UseGuards(OpsAuthGuard)`.

- [ ] **Step 1: Write the failing tests**

`apps/api/src/settlement/settlement-admin.service.spec.ts`:
```ts
import { BadRequestException, ConflictException, ForbiddenException } from "@nestjs/common";
import { LedgerAccount, LedgerDirection, OpsRole, SettlementHoldStatus } from "@prisma/client";
import { LedgerService } from "../ledger/ledger.service";
import { SettlementAdminService } from "./settlement-admin.service";

const admin = { id: "ops_1", name: "Ana", email: "ana@pagosya.bo", role: OpsRole.SUPPORT_ADMIN };
const agent = { id: "ops_2", name: "Beto", email: "beto@pagosya.bo", role: OpsRole.SUPPORT_AGENT };

function setup(merchant: Record<string, unknown> = { id: "m_1", payoutHeldAt: null, payoutHoldReason: null, payoutHeldByLabel: null }) {
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(0),
    merchant: { findUnique: jest.fn().mockResolvedValue(merchant), update: jest.fn(async ({ data }: { data: object }) => ({ ...merchant, ...data })) },
    settlementHold: { findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
    ledgerEntry: { groupBy: jest.fn().mockResolvedValue([]), createMany: jest.fn() },
    reserveSeizure: { create: jest.fn(async ({ data }: { data: object }) => ({ id: "rs_1", ...data })) },
  };
  const prisma = {
    $transaction: jest.fn(async (cb: (t: unknown) => unknown) => cb(tx)),
    merchant: { findMany: jest.fn().mockResolvedValue([]) },
    merchantUser: { findMany: jest.fn().mockResolvedValue([{ email: "dueno@tienda.bo" }]) },
  };
  const auditLog = { record: jest.fn() };
  const email = { send: jest.fn().mockResolvedValue(undefined) };
  const query = { balances: jest.fn(), schedule: jest.fn() };
  const svc = new SettlementAdminService(prisma as any, new LedgerService(), auditLog as any, email as any, query as any);
  return { svc, tx, prisma, auditLog, email };
}

describe("SettlementAdminService holds", () => {
  it("lets any ops user place a hold, audits it and emails the merchant without the reason", async () => {
    const { svc, tx, auditLog, email } = setup();
    await expect(svc.placeHold("m_1", "Reclamos de compradores sin entrega", agent)).resolves.toEqual({ held: true });
    expect(tx.merchant.update).toHaveBeenCalledWith({
      where: { id: "m_1" },
      data: { payoutHoldReason: "Reclamos de compradores sin entrega", payoutHeldAt: expect.any(Date), payoutHeldByLabel: "Beto <beto@pagosya.bo>" },
    });
    expect(auditLog.record).toHaveBeenCalledWith(tx, expect.objectContaining({ action: "settlement.hold_placed", targetId: "m_1" }));
    expect(email.send).toHaveBeenCalledTimes(1);
    const mail = email.send.mock.calls[0][0];
    expect(mail.to).toBe("dueno@tienda.bo");
    expect(`${mail.subject} ${mail.body}`).not.toContain("Reclamos");
  });

  it("refuses a second hold without emailing again", async () => {
    const { svc, email } = setup({ id: "m_1", payoutHeldAt: new Date(), payoutHoldReason: "x", payoutHeldByLabel: "y" });
    await expect(svc.placeHold("m_1", "Otra razón suficiente", agent)).rejects.toBeInstanceOf(ConflictException);
    expect(email.send).not.toHaveBeenCalled();
  });

  it("only lets an admin lift a hold", async () => {
    const { svc } = setup({ id: "m_1", payoutHeldAt: new Date(), payoutHoldReason: "x", payoutHeldByLabel: "y" });
    await expect(svc.liftHold("m_1", agent)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(svc.liftHold("m_1", admin)).resolves.toEqual({ held: false });
  });

  it("explains when there is no hold to lift", async () => {
    const { svc } = setup();
    await expect(svc.liftHold("m_1", admin)).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe("SettlementAdminService overrides and seizure", () => {
  it("only lets an admin change overrides", async () => {
    const { svc } = setup();
    await expect(svc.updateOverrides("m_1", { reserveBpsOverride: 0 }, agent)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("refuses to seize more than the reserve", async () => {
    const { svc, tx } = setup();
    tx.ledgerEntry.groupBy.mockResolvedValue([{ direction: LedgerDirection.CREDIT, _sum: { amount: 500 } }]);
    await expect(svc.seize("m_1", { amount: 600, currency: "BOB", reason: "Fraude confirmado", externalReference: "TRX-1" }, admin))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(tx.ledgerEntry.createMany).not.toHaveBeenCalled();
  });

  it("seizes oldest reserve first, posts RESERVE -> RAIL_CLEARING and records it", async () => {
    const { svc, tx, auditLog } = setup();
    tx.ledgerEntry.groupBy.mockResolvedValue([{ direction: LedgerDirection.CREDIT, _sum: { amount: 800 } }]);
    tx.settlementHold.findMany.mockResolvedValue([
      { id: "new", paymentIntentId: "p2", status: SettlementHoldStatus.RESERVE_HELD, pendingAmount: 0, reserveAmount: 500, createdAt: new Date("2026-09-20") },
      { id: "old", paymentIntentId: "p1", status: SettlementHoldStatus.RESERVE_HELD, pendingAmount: 0, reserveAmount: 300, createdAt: new Date("2026-09-01") },
    ]);
    await svc.seize("m_1", { amount: 400, currency: "BOB", reason: "Fraude confirmado", externalReference: "TRX-1" }, admin);
    expect(tx.$executeRaw).toHaveBeenCalled();
    expect(tx.settlementHold.update).toHaveBeenNthCalledWith(1, { where: { id: "old" }, data: { reserveAmount: 0, status: SettlementHoldStatus.CLOSED } });
    expect(tx.settlementHold.update).toHaveBeenNthCalledWith(2, { where: { id: "new" }, data: { reserveAmount: 400, status: SettlementHoldStatus.RESERVE_HELD } });
    expect(tx.ledgerEntry.createMany.mock.calls[0][0].data).toEqual([
      expect.objectContaining({ account: LedgerAccount.RESERVE, direction: LedgerDirection.DEBIT, amount: 400, merchantId: "m_1" }),
      expect.objectContaining({ account: LedgerAccount.RAIL_CLEARING, direction: LedgerDirection.CREDIT, amount: 400, merchantId: "m_1" }),
    ]);
    expect(tx.reserveSeizure.create).toHaveBeenCalledWith({ data: expect.objectContaining({ merchantId: "m_1", amount: 400, currency: "BOB", externalReference: "TRX-1", opsUserId: "ops_1", opsLabel: "Ana <ana@pagosya.bo>" }) });
    expect(auditLog.record).toHaveBeenCalledWith(tx, expect.objectContaining({ action: "settlement.reserve_seized" }));
  });

  it("only lets an admin seize", async () => {
    const { svc } = setup();
    await expect(svc.seize("m_1", { amount: 1, currency: "BOB", reason: "Fraude confirmado", externalReference: "TRX-1" }, agent))
      .rejects.toBeInstanceOf(ForbiddenException);
  });
});
```
Append to `apps/api/src/limits/limits-admin.service.spec.ts` (it uses that file's top-level `setup()` and `admin`):
```ts
it("saves the settlement columns of a policy straight through", async () => {
  const { service, tx } = setup();
  await service.updatePolicy(1, { payoutDelayDays: 5, reserveBps: 800, reserveDays: 30 }, admin as any);
  expect(tx.merchantLevelPolicy.update).toHaveBeenCalledWith({ where: { level: 1 }, data: { payoutDelayDays: 5, reserveBps: 800, reserveDays: 30 } });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd apps/api && pnpm exec jest src/settlement/settlement-admin.service.spec.ts src/limits/limits-admin.service.spec.ts`
Expected: FAIL — module missing; type error on the new policy fields.

- [ ] **Step 3: Implement the DTOs**

`apps/api/src/settlement/dto/settlement-overrides.dto.ts`:
```ts
import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsInt, IsOptional, Max, Min, ValidateIf } from "class-validator";

export class SettlementOverridesDto {
  @ApiPropertyOptional({ nullable: true, description: "Días; null = usar el del nivel" }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsInt() @Min(0) @Max(90) payoutDelayDaysOverride?: number | null;
  @ApiPropertyOptional({ nullable: true, description: "Puntos básicos (1000 = 10%); null = usar el del nivel" }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsInt() @Min(0) @Max(10_000) reserveBpsOverride?: number | null;
  @ApiPropertyOptional({ nullable: true, description: "Días; null = usar el del nivel" }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsInt() @Min(0) @Max(365) reserveDaysOverride?: number | null;
}
```
`apps/api/src/settlement/dto/place-payout-hold.dto.ts`:
```ts
import { ApiProperty } from "@nestjs/swagger";
import { IsString, MaxLength, MinLength } from "class-validator";

export class PlacePayoutHoldDto {
  @ApiProperty({ description: "Motivo interno; nunca se muestra al comercio" }) @IsString() @MinLength(8) @MaxLength(500) reason!: string;
}
```
`apps/api/src/settlement/dto/reserve-seizure.dto.ts`:
```ts
import { ApiProperty } from "@nestjs/swagger";
import { IsIn, IsInt, IsString, Max, MaxLength, Min, MinLength } from "class-validator";

export class ReserveSeizureDto {
  @ApiProperty({ description: "Centavos" }) @IsInt() @Min(1) @Max(2_000_000_000) amount!: number;
  @ApiProperty({ enum: ["BOB", "USD"] }) @IsIn(["BOB", "USD"]) currency!: string;
  @ApiProperty() @IsString() @MinLength(8) @MaxLength(500) reason!: string;
  @ApiProperty({ description: "Referencia de la restitución, p. ej. la transferencia al comprador" }) @IsString() @MinLength(3) @MaxLength(200) externalReference!: string;
}
```
In `apps/api/src/limits/dto/update-policy.dto.ts` add:
```ts
  @ApiPropertyOptional({ description: "Días antes de que una venta pase a disponible" }) @IsOptional() @IsInt() @Min(0) @Max(90) payoutDelayDays?: number;
  @ApiPropertyOptional({ description: "Reserva en puntos básicos (1000 = 10%)" }) @IsOptional() @IsInt() @Min(0) @Max(10_000) reserveBps?: number;
  @ApiPropertyOptional({ description: "Días que se guarda la reserva" }) @IsOptional() @IsInt() @Min(0) @Max(365) reserveDays?: number;
```
In `limits-admin.service.ts` change the `updatePolicy` data type to:
```ts
data: { monthlyLimit?: number | null; perPaymentLimit?: number | null; liveEnabled?: boolean; payoutDelayDays?: number; reserveBps?: number; reserveDays?: number }
```

- [ ] **Step 4: Implement the admin service**

`apps/api/src/settlement/settlement-admin.service.ts`:
```ts
import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { LedgerAccount, LedgerDirection, OpsRole, Prisma, SettlementHoldStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { LedgerService } from "../ledger/ledger.service";
import { AuditLogService } from "../ops/audit-log.service";
import { EMAIL_PROVIDER } from "../dashboard/tokens";
import { EmailProvider } from "../dashboard/interfaces/email-provider.interface";
import { SettlementQueryService } from "./settlement-query.service";
import { accountBalance } from "./settlement-balances";
import { lockMerchantSettlement } from "./settlement-lock";
import { takeFromReserve } from "./settlement-drawdown";

export type SettlementActor = { id: string; name: string; email: string; role: OpsRole };

const label = (actor: SettlementActor) => `${actor.name} <${actor.email}>`;

@Injectable()
export class SettlementAdminService {
  private readonly logger = new Logger(SettlementAdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly auditLog: AuditLogService,
    @Inject(EMAIL_PROVIDER) private readonly email: EmailProvider,
    private readonly query: SettlementQueryService,
  ) {}

  private assertAdmin(actor: SettlementActor) {
    if (actor.role !== OpsRole.SUPPORT_ADMIN) throw new ForbiddenException("Solo un administrador puede hacer esto");
  }

  private audit(tx: Prisma.TransactionClient, actor: SettlementActor, action: string, merchantId: string, metadata: Record<string, unknown>) {
    return this.auditLog.record(tx, { actorType: "OPS_USER", actorId: actor.id, actorLabel: label(actor), action, targetType: "Merchant", targetId: merchantId, metadata });
  }

  async overview(merchantId: string) {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
      select: { id: true, payoutDelayDaysOverride: true, reserveBpsOverride: true, reserveDaysOverride: true, payoutHoldReason: true, payoutHeldAt: true, payoutHeldByLabel: true },
    });
    if (!merchant) throw new NotFoundException("Comercio no encontrado");
    const [balances, schedule] = await Promise.all([this.query.balances(merchantId), this.query.schedule(merchantId)]);
    return {
      merchantId,
      overrides: { payoutDelayDaysOverride: merchant.payoutDelayDaysOverride, reserveBpsOverride: merchant.reserveBpsOverride, reserveDaysOverride: merchant.reserveDaysOverride },
      hold: merchant.payoutHeldAt ? { reason: merchant.payoutHoldReason ?? "", heldAt: merchant.payoutHeldAt, heldBy: merchant.payoutHeldByLabel ?? "" } : null,
      policy: schedule.policy,
      balances,
      releases: schedule.releases,
    };
  }

  async updateOverrides(merchantId: string, data: { payoutDelayDaysOverride?: number | null; reserveBpsOverride?: number | null; reserveDaysOverride?: number | null }, actor: SettlementActor) {
    this.assertAdmin(actor);
    return this.prisma.$transaction(async (tx) => {
      const select = { id: true, payoutDelayDaysOverride: true, reserveBpsOverride: true, reserveDaysOverride: true } as const;
      const before = await tx.merchant.findUnique({ where: { id: merchantId }, select });
      if (!before) throw new NotFoundException("Comercio no encontrado");
      const after = await tx.merchant.update({ where: { id: merchantId }, data, select });
      await this.audit(tx, actor, "settlement.overrides_updated", merchantId, { before, after });
      return after;
    });
  }

  /** Any ops user: stopping money fast matters more than who does it. Lifting is admin-only. */
  async placeHold(merchantId: string, reason: string, actor: SettlementActor): Promise<{ held: true }> {
    const trimmed = reason.trim();
    if (trimmed.length < 8) throw new BadRequestException("Escribe el motivo de la retención (mínimo 8 caracteres).");
    await this.prisma.$transaction(async (tx) => {
      const before = await tx.merchant.findUnique({ where: { id: merchantId }, select: { id: true, payoutHeldAt: true } });
      if (!before) throw new NotFoundException("Comercio no encontrado");
      if (before.payoutHeldAt) throw new ConflictException("Los pagos de este comercio ya están retenidos.");
      await tx.merchant.update({ where: { id: merchantId }, data: { payoutHoldReason: trimmed, payoutHeldAt: new Date(), payoutHeldByLabel: label(actor) } });
      await this.audit(tx, actor, "settlement.hold_placed", merchantId, { reason: trimmed });
    });
    await this.notifyHold(merchantId);
    return { held: true };
  }

  async liftHold(merchantId: string, actor: SettlementActor): Promise<{ held: false }> {
    this.assertAdmin(actor);
    await this.prisma.$transaction(async (tx) => {
      const before = await tx.merchant.findUnique({ where: { id: merchantId }, select: { id: true, payoutHeldAt: true, payoutHoldReason: true, payoutHeldByLabel: true } });
      if (!before) throw new NotFoundException("Comercio no encontrado");
      if (!before.payoutHeldAt) throw new BadRequestException("Este comercio no tiene pagos retenidos.");
      await tx.merchant.update({ where: { id: merchantId }, data: { payoutHoldReason: null, payoutHeldAt: null, payoutHeldByLabel: null } });
      await this.audit(tx, actor, "settlement.hold_lifted", merchantId, { reason: before.payoutHoldReason, heldBy: before.payoutHeldByLabel, heldAt: before.payoutHeldAt });
    });
    return { held: false };
  }

  /** Restitution to a buyer for confirmed fraud, paid out of this merchant's reserve. */
  async seize(merchantId: string, data: { amount: number; currency: string; reason: string; externalReference: string }, actor: SettlementActor) {
    this.assertAdmin(actor);
    return this.prisma.$transaction(async (tx) => {
      await lockMerchantSettlement(tx, merchantId);
      const merchant = await tx.merchant.findUnique({ where: { id: merchantId }, select: { id: true } });
      if (!merchant) throw new NotFoundException("Comercio no encontrado");
      const reserve = await accountBalance(tx, merchantId, LedgerAccount.RESERVE, data.currency);
      if (data.amount > reserve) {
        throw new BadRequestException(`La reserva en ${data.currency} es ${(reserve / 100).toFixed(2)}; no puedes retirar más.`);
      }
      const holds = await tx.settlementHold.findMany({
        where: { merchantId, currency: data.currency, status: SettlementHoldStatus.RESERVE_HELD },
        select: { id: true, paymentIntentId: true, status: true, pendingAmount: true, reserveAmount: true, createdAt: true },
      });
      for (const update of takeFromReserve(data.amount, holds)) {
        await tx.settlementHold.update({ where: { id: update.id }, data: { reserveAmount: update.reserveAmount, status: update.status } });
      }
      const ledgerGroupId = this.ledger.generateGroupId();
      await this.ledger.postJournalEntry(tx, ledgerGroupId, [
        { account: LedgerAccount.RESERVE, direction: LedgerDirection.DEBIT, amount: data.amount, merchantId },
        { account: LedgerAccount.RAIL_CLEARING, direction: LedgerDirection.CREDIT, amount: data.amount, merchantId },
      ], data.currency);
      const seizure = await tx.reserveSeizure.create({
        data: { merchantId, amount: data.amount, currency: data.currency, reason: data.reason.trim(), externalReference: data.externalReference.trim(), opsUserId: actor.id, opsLabel: label(actor), ledgerGroupId },
      });
      await this.audit(tx, actor, "settlement.reserve_seized", merchantId, { amount: data.amount, currency: data.currency, reason: seizure.reason, externalReference: seizure.externalReference, ledgerGroupId });
      return seizure;
    });
  }

  listHolds() {
    return this.prisma.merchant.findMany({
      where: { payoutHeldAt: { not: null } },
      select: { id: true, name: true, email: true, payoutHoldReason: true, payoutHeldAt: true, payoutHeldByLabel: true },
      orderBy: { payoutHeldAt: "desc" },
    });
  }

  /** Best effort, after the hold commits. Never includes the internal reason. */
  private async notifyHold(merchantId: string): Promise<void> {
    try {
      const users = await this.prisma.merchantUser.findMany({ where: { merchantId, deletedAt: null, emailVerifiedAt: { not: null } }, select: { email: true } });
      for (const user of users) {
        await this.email.send({
          to: user.email,
          subject: "Tus pagos en pagosYa están en pausa",
          body: "Pausamos temporalmente los desembolsos a tu cuenta bancaria mientras revisamos tu cuenta. Tus ventas siguen registradas y no pierdes ningún saldo.\n\nEscríbenos a soporte desde tu panel para saber qué necesitamos.",
        }).catch((error) => this.logger.warn(`Payout hold email to ${user.email} failed: ${(error as Error).message}`));
      }
    } catch (error) {
      this.logger.warn(`Payout hold notification for ${merchantId} failed: ${(error as Error).message}`);
    }
  }
}
```

- [ ] **Step 5: Implement the ops controller and register**

`apps/api/src/settlement/ops-settlement.controller.ts`:
```ts
import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { OpsAuthGuard } from "../ops/guards/ops-auth.guard";
import { CurrentOpsUser } from "../ops/decorators/current-ops-user.decorator";
import { SettlementActor, SettlementAdminService } from "./settlement-admin.service";
import { SettlementOverridesDto } from "./dto/settlement-overrides.dto";
import { PlacePayoutHoldDto } from "./dto/place-payout-hold.dto";
import { ReserveSeizureDto } from "./dto/reserve-seizure.dto";

@ApiTags("ops")
@ApiBearerAuth()
@UseGuards(OpsAuthGuard)
@Controller("internal")
export class OpsSettlementController {
  constructor(private readonly admin: SettlementAdminService) {}

  @Get("merchants/:id/settlement") overview(@Param("id") id: string) { return this.admin.overview(id); }

  @Patch("merchants/:id/settlement")
  updateOverrides(@Param("id") id: string, @Body() dto: SettlementOverridesDto, @CurrentOpsUser() actor: SettlementActor) {
    return this.admin.updateOverrides(id, dto, actor);
  }

  @Post("merchants/:id/payout_hold")
  placeHold(@Param("id") id: string, @Body() dto: PlacePayoutHoldDto, @CurrentOpsUser() actor: SettlementActor) {
    return this.admin.placeHold(id, dto.reason, actor);
  }

  @Delete("merchants/:id/payout_hold")
  liftHold(@Param("id") id: string, @CurrentOpsUser() actor: SettlementActor) {
    return this.admin.liftHold(id, actor);
  }

  @Post("merchants/:id/reserve_seizures")
  seize(@Param("id") id: string, @Body() dto: ReserveSeizureDto, @CurrentOpsUser() actor: SettlementActor) {
    return this.admin.seize(id, dto, actor);
  }

  @Get("payout_holds") listHolds() { return this.admin.listHolds(); }
}
```
In `settlement.module.ts`: add `OpsModule` to `imports` (`import { OpsModule } from "../ops/ops.module";`), `OpsSettlementController` to `controllers`, `SettlementAdminService` to `providers`.

- [ ] **Step 6: Run tests and type-check**

Run: `cd apps/api && pnpm exec jest src/settlement src/limits && pnpm exec tsc --noEmit -p tsconfig.json`
Expected: PASS; tsc exits 0.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/settlement apps/api/src/limits
git commit -m "feat(settlement): ops can hold payouts, set custom conditions and seize reserve"
```

---

## Task 9: Ledger invariant on a real database

**Files:**
- Create: `apps/api/src/settlement/settlement.integration.spec.ts`

**Interfaces:**
- Consumes: `integrationDatabase` from `../common/testing/integration-database`, `LedgerService`, `SettlementPolicyService`, `SettlementHoldService`, `SettlementAdminService`, `SettlementQueryService`, `AuditLogService`.

This suite creates and drops its own database through the harness. It never migrates the dev database.

- [ ] **Step 1: Write the test**

`apps/api/src/settlement/settlement.integration.spec.ts`:
```ts
import { LedgerAccount, LedgerDirection, OpsRole, PrismaClient, SettlementHoldStatus, SettlementMode, TransactionStatus, TransactionType } from "@prisma/client";
import { integrationDatabase } from "../common/testing/integration-database";
import { LedgerService } from "../ledger/ledger.service";
import { AuditLogService } from "../ops/audit-log.service";
import { SettlementPolicyService } from "./settlement-policy.service";
import { SettlementHoldService } from "./settlement-hold.service";
import { SettlementQueryService } from "./settlement-query.service";
import { SettlementAdminService } from "./settlement-admin.service";
import { merchantBalances } from "./settlement-balances";

/**
 * The money invariant behind ASFI row 5: every journal balances, and for each
 * merchant PENDING + PAYABLE + RESERVE equals what pagosYa still owes them,
 * with hold rows agreeing with the ledger. Real Postgres because the advisory
 * lock only exists inside real transactions.
 */
const harness = integrationDatabase("settlement");

harness.describeDb("settlement holds (real Postgres)", () => {
  if (!harness.available) {
    harness.failIfUnavailable();
    return;
  }

  jest.setTimeout(120_000);
  let db: PrismaClient;
  let ledger: LedgerService;
  let holds: SettlementHoldService;
  let admin: SettlementAdminService;
  const opsAdmin = { id: "ops_it", name: "Ana", email: "ana@pagosya.bo", role: OpsRole.SUPPORT_ADMIN };

  beforeAll(async () => {
    db = await harness.create();
    ledger = new LedgerService();
    const policies = new SettlementPolicyService();
    holds = new SettlementHoldService(db as any, ledger, policies);
    const query = new SettlementQueryService(db as any, policies);
    admin = new SettlementAdminService(db as any, ledger, new AuditLogService(db as any), { send: jest.fn() } as any, query);
  });

  afterAll(async () => {
    await harness.drop();
  });

  async function merchant(label: string) {
    return db.merchant.create({ data: { name: label, email: `${label}-${harness.databaseName}@test.test`, level: 1, settlementMode: SettlementMode.AGGREGATOR } });
  }

  async function capture(merchantId: string, amount: number, capturedAt: Date) {
    const intent = await db.paymentIntent.create({ data: { merchantId, amount, clientSecret: `cs_${Math.random().toString(36).slice(2)}` } });
    const txn = await db.transaction.create({ data: { paymentIntentId: intent.id, type: TransactionType.CAPTURE, railId: "test", amount, status: TransactionStatus.SUCCEEDED } });
    await db.$transaction(async (tx) => {
      const lines = ledger.buildCaptureJournal({ merchantId, transactionId: txn.id, amount, settlementMode: SettlementMode.AGGREGATOR });
      await ledger.postJournalEntry(tx, ledger.generateGroupId(), lines, "BOB");
      await holds.recordCapture(tx, { merchantId, paymentIntentId: intent.id, transactionId: txn.id, currency: "BOB", lines, capturedAt });
    });
    return intent.id;
  }

  async function refund(merchantId: string, paymentIntentId: string, amount: number) {
    const txn = await db.transaction.create({ data: { paymentIntentId, type: TransactionType.REFUND, railId: "test", amount, status: TransactionStatus.SUCCEEDED } });
    await db.$transaction(async (tx) => {
      const journal = ledger.buildRefundJournal({ merchantId, transactionId: txn.id, amount, settlementMode: SettlementMode.AGGREGATOR });
      const lines = await holds.applyRefundDrawdown(tx, { merchantId, paymentIntentId, currency: "BOB", settlementMode: SettlementMode.AGGREGATOR, lines: journal });
      await ledger.postJournalEntry(tx, ledger.generateGroupId(), lines, "BOB");
    });
  }

  async function payout(merchantId: string, amount: number) {
    await db.$transaction((tx) => ledger.postJournalEntry(tx, ledger.generateGroupId(), ledger.buildPayoutJournal({ merchantId, amount }), "BOB"));
  }

  async function bob(merchantId: string) {
    return (await merchantBalances(db as any, merchantId)).find((b) => b.currency === "BOB") ?? { currency: "BOB", available: 0, pending: 0, reserve: 0 };
  }

  async function expectInvariant(merchantId: string, owed: number) {
    const groups = await db.ledgerEntry.groupBy({ by: ["transactionGroupId", "direction"], where: { merchantId }, _sum: { amount: true } });
    const net = new Map<string, number>();
    for (const g of groups) net.set(g.transactionGroupId, (net.get(g.transactionGroupId) ?? 0) + (g._sum.amount ?? 0) * (g.direction === LedgerDirection.CREDIT ? 1 : -1));
    for (const [group, value] of net) expect([group, value]).toEqual([group, 0]);

    const b = await bob(merchantId);
    expect(b.pending + b.available + b.reserve).toBe(owed);
    const open = await db.settlementHold.findMany({ where: { merchantId } });
    expect(open.filter((h) => h.status === SettlementHoldStatus.PENDING).reduce((s, h) => s + h.pendingAmount, 0)).toBe(b.pending);
    expect(open.filter((h) => h.status === SettlementHoldStatus.RESERVE_HELD).reduce((s, h) => s + h.reserveAmount, 0)).toBe(b.reserve);
  }

  it("keeps the money invariant through capture, release, payout, refund, seizure and reserve release", async () => {
    const m = await merchant("lifecycle");
    // Level 1 placeholder from the migration: 7 days, 10% reserve, 60 days.
    await capture(m.id, 10_000, new Date("2026-10-01T15:00:00Z")); // net 9750, reserve 975
    const piB = await capture(m.id, 20_000, new Date("2026-10-01T15:00:00Z")); // net 19500, reserve 1950
    expect(await bob(m.id)).toEqual({ currency: "BOB", available: 0, pending: 29_250, reserve: 0 });
    await expectInvariant(m.id, 29_250);

    expect(await holds.releaseDue(new Date("2026-10-08T03:59:00Z"))).toBe(0); // one minute before 00:00 La Paz
    expect(await holds.releaseDue(new Date("2026-10-08T05:00:00Z"))).toBe(2);
    expect(await bob(m.id)).toEqual({ currency: "BOB", available: 26_325, pending: 0, reserve: 2_925 });
    expect(await holds.releaseDue(new Date("2026-10-08T05:00:00Z"))).toBe(0); // idempotent

    await payout(m.id, 26_325);
    await refund(m.id, piB, 20_000); // net 19500: reserve 2925 (oldest first), then 16575 negative
    expect(await bob(m.id)).toEqual({ currency: "BOB", available: -16_575, pending: 0, reserve: 0 });
    await expectInvariant(m.id, -16_575);

    await capture(m.id, 30_000, new Date("2026-10-09T15:00:00Z")); // net 29250, reserve 2925
    await holds.releaseDue(new Date("2026-10-16T05:00:00Z"));
    expect(await bob(m.id)).toEqual({ currency: "BOB", available: 9_750, pending: 0, reserve: 2_925 });

    await expect(admin.seize(m.id, { amount: 3_000, currency: "BOB", reason: "Fraude confirmado", externalReference: "TRX-1" }, opsAdmin)).rejects.toThrow("no puedes retirar más");
    await admin.seize(m.id, { amount: 1_000, currency: "BOB", reason: "Fraude confirmado", externalReference: "TRX-1" }, opsAdmin);
    expect((await bob(m.id)).reserve).toBe(1_925);

    await holds.releaseDue(new Date("2026-12-08T05:00:00Z")); // Oct 9 + 60 days
    expect(await bob(m.id)).toEqual({ currency: "BOB", available: 11_675, pending: 0, reserve: 0 });
    // owed = 58500 nets - 26325 paid out - 19500 refunded - 1000 seized
    await expectInvariant(m.id, 11_675);
    expect(await db.auditLogEntry.count({ where: { action: "settlement.reserve_seized", targetId: m.id } })).toBe(1);
  });

  it("never spends the same pending money twice when a refund races the daily release", async () => {
    const m = await merchant("race");
    const pi = await capture(m.id, 10_000, new Date("2026-10-01T15:00:00Z")); // net 9750
    await Promise.all([holds.releaseDue(new Date("2026-10-08T05:00:00Z")), refund(m.id, pi, 10_000)]);
    const b = await bob(m.id);
    expect(b.pending).toBe(0);
    await expectInvariant(m.id, 0);
  });
});
```

- [ ] **Step 2: Run it**

Run: `cd apps/api && pnpm exec jest --config jest.integration.config.js src/settlement/settlement.integration.spec.ts`
Expected: PASS (2 tests). If the harness reports no database is reachable, stop and tell the main session (the dev Postgres from `~/pagosYa` must be running); do not try to start or migrate a database yourself.

If a numeric assertion fails, the defect is in Tasks 3–8, not in the expected numbers: re-derive by hand from the comments (fee 250 bps, reserve 1000 bps floor) before touching either side.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/settlement/settlement.integration.spec.ts
git commit -m "test(settlement): money invariant and refund/release race on real Postgres"
```

---

## Task 10: Ops console — Fondos card, policy columns, held list

**Files:**
- Modify: `apps/ops/index.html` (limits workspace markup ~line 605; `renderDossier` ~line 818; `openSupportCase` ~line 851; `policyRow`/`refreshLimits`/policy save ~lines 1187–1265; dossier listeners ~line 1410)
- Modify: `apps/ops/tests/ops-limits.spec.mjs`
- Create: `apps/ops/tests/ops-settlement.spec.mjs`

**Interfaces:**
- Consumes: `GET/PATCH /internal/merchants/:id/settlement`, `POST/DELETE /internal/merchants/:id/payout_hold`, `POST /internal/merchants/:id/reserve_seizures`, `GET /internal/payout_holds`, extended `PATCH /internal/limits/policies/:level` (Task 8). Overview shape from Task 8's `overview()`.

- [ ] **Step 1: Write the failing Playwright test**

`apps/ops/tests/ops-settlement.spec.mjs`:
```js
import { expect, test } from "@playwright/test";

const policies = [
  { level: 0, name: "Sin verificar", liveEnabled: false, monthlyLimit: null, perPaymentLimit: null, payoutDelayDays: 7, reserveBps: 1000, reserveDays: 60 },
  { level: 1, name: "Persona", liveEnabled: true, monthlyLimit: 1_000_000, perPaymentLimit: 200_000, payoutDelayDays: 7, reserveBps: 1000, reserveDays: 60 },
  { level: 2, name: "Negocio", liveEnabled: true, monthlyLimit: 10_000_000, perPaymentLimit: 2_000_000, payoutDelayDays: 3, reserveBps: 500, reserveDays: 45 },
  { level: 3, name: "Empresa", liveEnabled: true, monthlyLimit: null, perPaymentLimit: null, payoutDelayDays: 1, reserveBps: 0, reserveDays: 0 },
];
const supportCaseSummary = { id: "case_1", merchant: { id: "merchant_1", name: "Tienda Uno", email: "tienda@example.com" }, category: "PAYMENTS", status: "PENDING", priority: "NORMAL", updatedAt: "2026-10-07T12:00:00.000Z" };
const dossier = {
  merchant: { id: "merchant_1", name: "Tienda Uno", email: "tienda@example.com", status: "ACTIVE", settlementMode: "AGGREGATOR", level: 1, monthlyLimitOverride: null, perPaymentLimitOverride: null, createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z", users: [], stores: [], paymentIntents: [], payouts: [], invoices: [], kycSubmissions: [] },
  supportCase: { ...supportCaseSummary, notes: [], summary: "Compradores reclaman entregas." },
};
const settlement = (over = {}) => ({
  merchantId: "merchant_1",
  overrides: { payoutDelayDaysOverride: null, reserveBpsOverride: null, reserveDaysOverride: null },
  hold: null,
  policy: { level: 1, levelName: "Persona", delayDays: 7, reserveBps: 1000, reserveDays: 60 },
  balances: [{ currency: "BOB", available: -1_500, pending: 9_750, reserve: 975 }],
  releases: [{ date: "2026-10-08", currency: "BOB", toAvailable: 8_775, fromReserve: 0 }],
  ...over,
});

async function openOps(page, { onRequest, settlementBody = settlement(), holds = [] } = {}) {
  await page.addInitScript(() => {
    sessionStorage.setItem("pagosya_ops_api_origin", "http://localhost:3001");
    sessionStorage.setItem("pagosya_ops_token", "ops_test");
  });
  await page.route("http://localhost:3001/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    if (onRequest && (await onRequest(route, { path, method, request }))) return;
    if (path === "/internal/ops_users/me") return route.fulfill({ json: { name: "Ana Ops", email: "ana@pagosya.bo", role: "SUPPORT_ADMIN" } });
    if (path === "/v1/merchants/kyc/pending") return route.fulfill({ json: [] });
    if (path === "/internal/delivery_failures") return route.fulfill({ json: { payouts: { exhausted: [], retrying: [] }, invoices: { exhausted: [], retrying: [] }, webhookEvents: { exhausted: [], retrying: [] } } });
    if (path === "/internal/audit_log") return route.fulfill({ json: [] });
    if (path === "/internal/support/cases") return route.fulfill({ json: [supportCaseSummary] });
    if (path === "/internal/domain_orders") return route.fulfill({ json: [] });
    if (path === "/internal/international_payments") return route.fulfill({ json: [] });
    if (path === "/internal/limits/policies") return route.fulfill({ json: policies });
    if (path === "/internal/limits/settings") return route.fulfill({ json: { usdToBobRate: "6.96" } });
    if (path === "/internal/limits/near_limit") return route.fulfill({ json: [] });
    if (path === "/internal/payout_holds") return route.fulfill({ json: holds });
    if (path === "/internal/support/merchants/merchant_1") return route.fulfill({ json: dossier });
    if (path === "/internal/merchants/merchant_1/settlement" && method === "GET") return route.fulfill({ json: settlementBody });
    return route.fulfill({ status: 404, json: { message: "no mock for " + path } });
  });
  await page.goto("/");
  await expect(page.locator("#whoami")).toContainText("Ana Ops");
}

async function openCase(page) {
  await page.locator('#supportCases button[data-case-id="case_1"]').click();
  await expect(page.locator("#settlementSection h4").first()).toHaveText("Fondos");
}

test("the Fondos card shows balances, the policy and highlights a negative available balance", async ({ page }) => {
  await openOps(page);
  await openCase(page);
  const section = page.locator("#settlementSection");
  await expect(section).toContainText("7 días de demora · reserva 10% por 60 días");
  await expect(section.locator('.settlement-balance[data-currency="BOB"] .negative')).toContainText("Disponible");
  await expect(section).toContainText("En espera");
});

test("placing a hold sends the reason and lifting it calls DELETE", async ({ page }) => {
  const calls = [];
  let held = false;
  await openOps(page, {
    onRequest: async (route, { path, method, request }) => {
      if (path === "/internal/merchants/merchant_1/payout_hold") {
        calls.push({ method, body: request.postData() ? JSON.parse(request.postData()) : null });
        held = method === "POST";
        await route.fulfill({ json: { held } });
        return true;
      }
      if (path === "/internal/merchants/merchant_1/settlement" && method === "GET") {
        await route.fulfill({ json: settlement(held ? { hold: { reason: "Reclamos sin entrega", heldAt: "2026-10-07T12:00:00.000Z", heldBy: "Ana Ops <ana@pagosya.bo>" } } : {}) });
        return true;
      }
      return false;
    },
  });
  await openCase(page);
  await page.fill("#payoutHoldReason", "Reclamos sin entrega");
  await page.locator('[data-settlement-action="place-hold"]').click();
  await expect(page.locator('.settlement-hold[data-state="held"]')).toContainText("Reclamos sin entrega");
  await page.locator('[data-settlement-action="lift-hold"]').click();
  await expect(page.locator('.settlement-hold[data-state="free"]')).toBeVisible();
  expect(calls).toEqual([{ method: "POST", body: { reason: "Reclamos sin entrega" } }, { method: "DELETE", body: null }]);
});

test("overrides save as days and basis points, blank as null", async ({ page }) => {
  let body = null;
  await openOps(page, {
    onRequest: async (route, { path, method, request }) => {
      if (path === "/internal/merchants/merchant_1/settlement" && method === "PATCH") {
        body = JSON.parse(request.postData());
        await route.fulfill({ json: {} });
        return true;
      }
      return false;
    },
  });
  await openCase(page);
  await page.fill("#overrideDelayDays", "2");
  await page.fill("#overrideReservePct", "2.5");
  await page.locator("#settlementOverridesForm button[type=submit]").click();
  await expect.poll(() => body).toEqual({ payoutDelayDaysOverride: 2, reserveBpsOverride: 250, reserveDaysOverride: null });
});

test("a seizure needs a second click to confirm and sends centavos", async ({ page }) => {
  let body = null;
  await openOps(page, {
    onRequest: async (route, { path, method, request }) => {
      if (path === "/internal/merchants/merchant_1/reserve_seizures" && method === "POST") {
        body = JSON.parse(request.postData());
        await route.fulfill({ json: { id: "rs_1" } });
        return true;
      }
      return false;
    },
  });
  await openCase(page);
  await page.fill("#seizureAmount", "5");
  await page.fill("#seizureReason", "Fraude confirmado por el banco");
  await page.fill("#seizureReference", "TRX-991");
  const submit = page.locator("#reserveSeizureForm button[type=submit]");
  await submit.click();
  await expect(submit).toContainText("Confirmar retiro");
  expect(body).toBeNull();
  await submit.click();
  await expect.poll(() => body).toEqual({ amount: 500, currency: "BOB", reason: "Fraude confirmado por el banco", externalReference: "TRX-991" });
});

test("the limits page lists merchants with held payouts", async ({ page }) => {
  await openOps(page, { holds: [{ id: "merchant_1", name: "Tienda Uno", email: "tienda@example.com", payoutHoldReason: "Reclamos sin entrega", payoutHeldAt: "2026-10-07T12:00:00.000Z", payoutHeldByLabel: "Ana Ops <ana@pagosya.bo>" }] });
  await expect(page.locator("#payoutHoldsRows tr")).toContainText("Reclamos sin entrega");
  await expect(page.locator("#payoutHoldsEmpty")).toBeHidden();
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/ops && pnpm exec playwright test tests/ops-settlement.spec.mjs`
Expected: FAIL — `#settlementSection` not found.

- [ ] **Step 3: Policy columns and held list markup**

In the `#policiesTable` header add, after `<th>Límite por pago (Bs)</th>`:
```html
              <th>Demora (días)</th>
              <th>Reserva (%)</th>
              <th>Días de reserva</th>
```
After the "Cerca del límite" table (before the closing `</div>` of `#limitsWorkspace`) add:
```html
        <h3 style="margin-top:24px">Pagos retenidos</h3>
        <div id="payoutHoldsEmpty" class="empty-state" style="display:none">Ningún comercio tiene pagos retenidos.</div>
        <div class="table-wrap"><table id="payoutHoldsTable" style="display:none">
          <thead>
            <tr>
              <th>Comercio</th>
              <th>Motivo</th>
              <th>Retenido por</th>
              <th>Desde</th>
            </tr>
          </thead>
          <tbody id="payoutHoldsRows"></tbody>
        </table></div>
```
In `policyRow(p)`, add after the per-payment `<td>`:
```js
        <td><input type="number" class="policy-delay" step="1" min="0" max="90" value="${esc(p.payoutDelayDays ?? "")}"></td>
        <td><input type="number" class="policy-reserve-pct" step="0.01" min="0" max="100" value="${esc(p.reserveBps == null ? "" : p.reserveBps / 100)}"></td>
        <td><input type="number" class="policy-reserve-days" step="1" min="0" max="365" value="${esc(p.reserveDays ?? "")}"></td>
```
In the policy save click handler, extend the PATCH body:
```js
        body: JSON.stringify({
          monthlyLimit: monthlyRaw === "" ? null : Math.round(Number(monthlyRaw) * 100),
          perPaymentLimit: perPaymentRaw === "" ? null : Math.round(Number(perPaymentRaw) * 100),
          liveEnabled,
          payoutDelayDays: Number(row.querySelector(".policy-delay").value || 0),
          reserveBps: Math.round(Number(row.querySelector(".policy-reserve-pct").value || 0) * 100),
          reserveDays: Number(row.querySelector(".policy-reserve-days").value || 0),
        }),
```
Add next to `nearLimitRow`:
```js
  function payoutHoldRow(row) {
    return `
      <tr>
        <td><strong>${esc(row.name)}</strong><br><span class="muted">${esc(row.email)}</span></td>
        <td>${esc(row.payoutHoldReason)}</td>
        <td>${esc(row.payoutHeldByLabel)}</td>
        <td>${dateTime(row.payoutHeldAt)}</td>
      </tr>`;
  }
```
In `refreshLimits`, fetch and render holds:
```js
    const [policies, settings, nearLimit, payoutHolds] = await Promise.all([
      api("/internal/limits/policies"),
      api("/internal/limits/settings"),
      api("/internal/limits/near_limit"),
      api("/internal/payout_holds"),
    ]);
```
and at the end of the function:
```js
    const holdsTable = document.getElementById("payoutHoldsTable");
    document.getElementById("payoutHoldsEmpty").style.display = payoutHolds.length ? "none" : "block";
    holdsTable.style.display = payoutHolds.length ? "table" : "none";
    document.getElementById("payoutHoldsRows").innerHTML = payoutHolds.map(payoutHoldRow).join("");
```

- [ ] **Step 4: Fondos card**

In `renderDossier`, directly after the closing `</section>` of the "Límites de pago" section, add:
```js
      <section class="dossier-section" id="settlementSection"><h4>Fondos</h4><p class="muted">Cargando fondos…</p></section>
```
Add these functions next to `openSupportCase`:
```js
  function settlementBalancesHtml(balances) {
    if (!balances.length) return `<p class="muted">Sin saldo registrado.</p>`;
    return `<div class="compact-list">${balances.map((b) => `
      <div class="compact-row settlement-balance" data-currency="${esc(b.currency)}">
        <strong>${esc(b.currency)}</strong>
        <span>En espera ${money(b.pending, b.currency)}</span>
        <span class="${b.available < 0 ? "negative" : ""}">Disponible ${money(b.available, b.currency)}</span>
        <span>Reserva ${money(b.reserve, b.currency)}</span>
      </div>`).join("")}</div>`;
  }

  function renderSettlement(data) {
    const section = document.getElementById("settlementSection");
    if (!section) return;
    const o = data.overrides;
    const releases = data.releases.slice(0, 5).map((r) => `
      <div class="compact-row"><strong>${esc(r.date)}</strong><span>${r.toAvailable ? "A disponible " + money(r.toAvailable, r.currency) : ""}</span><span>${r.fromReserve ? "Desde reserva " + money(r.fromReserve, r.currency) : ""}</span><span></span></div>`).join("");
    const currencies = (data.balances.length ? data.balances : [{ currency: "BOB" }]).map((b) => `<option value="${esc(b.currency)}">${esc(b.currency)}</option>`).join("");
    section.innerHTML = `
      <h4>Fondos</h4>
      <p class="muted">Política vigente: ${esc(data.policy.delayDays)} días de demora · reserva ${esc(data.policy.reserveBps / 100)}% por ${esc(data.policy.reserveDays)} días.</p>
      ${settlementBalancesHtml(data.balances)}
      ${releases ? `<div class="compact-list">${releases}</div>` : `<p class="muted">No hay liberaciones programadas.</p>`}
      ${data.hold
        ? `<div class="support-action-zone settlement-hold" data-state="held"><p><strong>Pagos retenidos</strong> desde ${dateTime(data.hold.heldAt)} por ${esc(data.hold.heldBy)}.</p><p class="muted">Motivo interno: ${esc(data.hold.reason)}</p><div class="action-buttons"><button type="button" data-settlement-action="lift-hold">Levantar retención</button></div></div>`
        : `<div class="support-action-zone settlement-hold" data-state="free"><label for="payoutHoldReason">Motivo de la retención (interno)</label><input id="payoutHoldReason" minlength="8" maxlength="500" placeholder="Reclamos de compradores sin entrega"><div class="action-buttons"><button type="button" class="danger" data-settlement-action="place-hold">Retener pagos</button></div></div>`}
      <form id="settlementOverridesForm">
        <div class="field-row">
          <div><label for="overrideDelayDays">Demora (días)</label><input id="overrideDelayDays" type="number" min="0" max="90" step="1" value="${o.payoutDelayDaysOverride ?? ""}" placeholder="Usar el del nivel"></div>
          <div><label for="overrideReservePct">Reserva (%)</label><input id="overrideReservePct" type="number" min="0" max="100" step="0.01" value="${o.reserveBpsOverride != null ? o.reserveBpsOverride / 100 : ""}" placeholder="Usar el del nivel"></div>
        </div>
        <div class="field-row">
          <div><label for="overrideReserveDays">Días de reserva</label><input id="overrideReserveDays" type="number" min="0" max="365" step="1" value="${o.reserveDaysOverride ?? ""}" placeholder="Usar el del nivel"></div>
          <div></div>
        </div>
        <div class="action-buttons"><button class="primary" type="submit">Guardar condiciones</button></div>
      </form>
      <form id="reserveSeizureForm" class="support-action-zone">
        <h4>Retirar de la reserva</h4>
        <p class="muted">Solo para restituir a un comprador por un fraude confirmado. Queda auditado.</p>
        <div class="field-row">
          <div><label for="seizureAmount">Monto</label><input id="seizureAmount" type="number" min="0.01" step="0.01" required></div>
          <div><label for="seizureCurrency">Moneda</label><select id="seizureCurrency">${currencies}</select></div>
        </div>
        <div class="field-row">
          <div><label for="seizureReason">Motivo</label><input id="seizureReason" minlength="8" maxlength="500" required></div>
          <div><label for="seizureReference">Referencia externa</label><input id="seizureReference" minlength="3" maxlength="200" required placeholder="Transferencia al comprador"></div>
        </div>
        <div class="action-buttons"><button type="submit" class="danger">Retirar de la reserva</button></div>
      </form>`;
  }

  async function refreshSettlement(merchantId) {
    try {
      renderSettlement(await api(`/internal/merchants/${encodeURIComponent(merchantId)}/settlement`));
    } catch (err) {
      const section = document.getElementById("settlementSection");
      if (section) section.innerHTML = `<h4>Fondos</h4><p class="muted">No pudimos cargar los fondos: ${esc(err.message)}</p>`;
    }
  }

  async function afterSettlementChange() {
    await refreshSettlement(selectedMerchant.id);
    await refreshAuditLog();
    if (limitsWorkspaceEl.style.display !== "none") await refreshLimits();
  }
```
In `openSupportCase`, after `renderDossier(data);` add `await refreshSettlement(merchantId);`.

Add listeners next to the existing `supportDossierEl` listeners:
```js
  supportDossierEl.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-settlement-action]");
    if (!button || !selectedMerchant) return;
    const base = `/internal/merchants/${encodeURIComponent(selectedMerchant.id)}/payout_hold`;
    errorEl.textContent = "";
    button.disabled = true;
    try {
      if (button.dataset.settlementAction === "place-hold") {
        await api(base, { method: "POST", body: JSON.stringify({ reason: document.getElementById("payoutHoldReason").value.trim() }) });
      } else {
        await api(base, { method: "DELETE" });
      }
      await afterSettlementChange();
    } catch (err) {
      errorEl.textContent = "No pudimos actualizar la retención: " + err.message;
      button.disabled = false;
    }
  });

  supportDossierEl.addEventListener("submit", async (event) => {
    const form = event.target;
    if (form.id !== "settlementOverridesForm" && form.id !== "reserveSeizureForm") return;
    event.preventDefault();
    const button = form.querySelector("button[type=submit]");
    const merchantPath = `/internal/merchants/${encodeURIComponent(selectedMerchant.id)}`;
    errorEl.textContent = "";
    try {
      if (form.id === "settlementOverridesForm") {
        const raw = (id) => document.getElementById(id).value.trim();
        button.disabled = true;
        await api(`${merchantPath}/settlement`, {
          method: "PATCH",
          body: JSON.stringify({
            payoutDelayDaysOverride: raw("overrideDelayDays") === "" ? null : Number(raw("overrideDelayDays")),
            reserveBpsOverride: raw("overrideReservePct") === "" ? null : Math.round(Number(raw("overrideReservePct")) * 100),
            reserveDaysOverride: raw("overrideReserveDays") === "" ? null : Number(raw("overrideReserveDays")),
          }),
        });
      } else {
        const amount = Math.round(Number(document.getElementById("seizureAmount").value) * 100);
        const currency = document.getElementById("seizureCurrency").value;
        // Two clicks instead of confirm(): a browser dialog would block automation and is easy to dismiss by reflex.
        if (!form.dataset.confirmed) {
          form.dataset.confirmed = "1";
          button.textContent = `Confirmar retiro de ${money(amount, currency)}`;
          return;
        }
        button.disabled = true;
        await api(`${merchantPath}/reserve_seizures`, {
          method: "POST",
          body: JSON.stringify({
            amount,
            currency,
            reason: document.getElementById("seizureReason").value.trim(),
            externalReference: document.getElementById("seizureReference").value.trim(),
          }),
        });
      }
      await afterSettlementChange();
    } catch (err) {
      errorEl.textContent = "No pudimos guardar: " + err.message;
      button.disabled = false;
    }
  });
```
Add CSS in the page's `<style>` block, next to other dossier styles:
```css
    .settlement-balance .negative { color: #b42318; font-weight: 600; }
```

- [ ] **Step 5: Update the existing limits tests for the wider policy body**

In `apps/ops/tests/ops-limits.spec.mjs`:
- add `payoutDelayDays`, `reserveBps`, `reserveDays` to each `policies` fixture row with the placeholder numbers (0/1: 7, 1000, 60; 2: 3, 500, 45; 3: 1, 0, 0);
- add `if (path === "/internal/payout_holds") return route.fulfill({ json: [] });` and `if (path === "/internal/merchants/merchant_1/settlement") return route.fulfill({ json: { merchantId: "merchant_1", overrides: { payoutDelayDaysOverride: null, reserveBpsOverride: null, reserveDaysOverride: null }, hold: null, policy: { level: 1, levelName: "Persona", delayDays: 7, reserveBps: 1000, reserveDays: 60 }, balances: [], releases: [] } });` to `openOps` before the 404 fallback;
- the two policy-save assertions become:
```js
  await expect.poll(() => patchBody).toEqual({ monthlyLimit: 2_000_000, perPaymentLimit: 300_000, liveEnabled: true, payoutDelayDays: 7, reserveBps: 1000, reserveDays: 60 });
```
```js
  await expect.poll(() => patchBody).toEqual({ monthlyLimit: null, perPaymentLimit: null, liveEnabled: true, payoutDelayDays: 1, reserveBps: 0, reserveDays: 0 });
```

- [ ] **Step 6: Run the ops suites**

Run: `cd apps/ops && pnpm test && pnpm exec playwright test`
Expected: PASS (all ops specs, including the 5 new ones).

- [ ] **Step 7: Commit**

```bash
git add apps/ops
git commit -m "feat(ops): Fondos card, payout holds, reserve seizure and settlement policy columns"
```

---

## Task 11: Merchant dashboard — balance cards, schedule panel, hold banner

**Files:**
- Create: `apps/merchant-dashboard/src/settlement.mjs`
- Test: `apps/merchant-dashboard/src/settlement.test.mjs`
- Modify: `apps/merchant-dashboard/index.html` (overview account section ~line 252; payouts section ~line 931)
- Modify: `apps/merchant-dashboard/src/dashboard.js` (imports at top; `renderBalanceCards` ~line 2156; money-visibility re-render ~line 2249; `overviewPromise` ~line 3643; post-fetch rendering ~line 3677)
- Modify: `apps/merchant-dashboard/src/dashboard.css`
- Create: `apps/merchant-dashboard/tests/settlement.spec.mjs`

**Interfaces:**
- Consumes: `GET /v1/merchants/balance` (Task 7 shape), `GET /v1/merchants/settlement/schedule` (Task 7 `SettlementSchedule`).
- Produces (settlement.mjs): `settlementPolicySentence(policy)`, `nextLevelSentence(nextLevel)`, `nextPayoutLabel(iso, now?)`, `releaseDateLabel(day)`.

- [ ] **Step 1: Write the failing unit test**

`apps/merchant-dashboard/src/settlement.test.mjs`:
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { nextLevelSentence, nextPayoutLabel, releaseDateLabel, settlementPolicySentence } from "./settlement.mjs";

test("describes the policy in plain words", () => {
  assert.equal(
    settlementPolicySentence({ level: 1, delayDays: 7, reserveBps: 1000, reserveDays: 60 }),
    "Nivel 1: tus ventas están disponibles a los 7 días; guardamos el 10% por 60 días como reserva de protección.",
  );
  assert.equal(settlementPolicySentence({ level: 3, delayDays: 1, reserveBps: 0, reserveDays: 0 }), "Nivel 3: tus ventas están disponibles al día siguiente.");
  assert.equal(settlementPolicySentence({ level: 2, delayDays: 3, reserveBps: 250, reserveDays: 45 }), "Nivel 2: tus ventas están disponibles a los 3 días; guardamos el 2,5% por 45 días como reserva de protección.");
});

test("tells the merchant what the next level gives them", () => {
  assert.equal(nextLevelSentence({ level: 2, name: "Negocio", delayDays: 3, reserveBps: 500, reserveDays: 45 }), "En el nivel 2 (Negocio) recibes tu dinero a los 3 días y con 5% de reserva.");
  assert.equal(nextLevelSentence({ level: 3, name: "Empresa", delayDays: 1, reserveBps: 0, reserveDays: 0 }), "En el nivel 3 (Empresa) recibes tu dinero al día siguiente y sin reserva.");
  assert.equal(nextLevelSentence(null), "");
});

test("labels the next payout in La Paz time", () => {
  const now = new Date("2026-10-08T13:00:00Z"); // 09:00 La Paz
  assert.equal(nextPayoutLabel("2026-10-08T14:00:00.000Z", now), "Próximo pago: hoy 10:00");
  assert.equal(nextPayoutLabel("2026-10-09T14:00:00.000Z", now), "Próximo pago: 09/10/2026 10:00");
  assert.equal(nextPayoutLabel(null, now), "");
});

test("formats a release day", () => {
  assert.equal(releaseDateLabel("2026-11-30"), "30/11/2026");
});
```
- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/merchant-dashboard && node --test src/settlement.test.mjs`
Expected: FAIL — cannot find module `./settlement.mjs`.

- [ ] **Step 3: Implement the copy helpers**

`apps/merchant-dashboard/src/settlement.mjs`:
```js
// America/La_Paz is UTC-4 all year; formatting by hand keeps output identical in every browser and in node --test.
const LA_PAZ_OFFSET_MS = 4 * 60 * 60 * 1000;

const percent = (bps) => String(bps / 100).replace(".", ",");
const when = (days) => (days === 0 ? "el mismo día" : days === 1 ? "al día siguiente" : `a los ${days} días`);
const dayCount = (days) => (days === 1 ? "1 día" : `${days} días`);

export function settlementPolicySentence(policy) {
  const reserve = policy.reserveBps > 0 ? `; guardamos el ${percent(policy.reserveBps)}% por ${dayCount(policy.reserveDays)} como reserva de protección` : "";
  return `Nivel ${policy.level}: tus ventas están disponibles ${when(policy.delayDays)}${reserve}.`;
}

export function nextLevelSentence(nextLevel) {
  if (!nextLevel) return "";
  const reserve = nextLevel.reserveBps > 0 ? `con ${percent(nextLevel.reserveBps)}% de reserva` : "sin reserva";
  return `En el nivel ${nextLevel.level} (${nextLevel.name}) recibes tu dinero ${when(nextLevel.delayDays)} y ${reserve}.`;
}

function laPaz(date) {
  const iso = new Date(date.getTime() - LA_PAZ_OFFSET_MS).toISOString();
  return { day: iso.slice(0, 10), time: iso.slice(11, 16) };
}

export function releaseDateLabel(day) {
  const [y, m, d] = day.split("-");
  return `${d}/${m}/${y}`;
}

export function nextPayoutLabel(iso, now = new Date()) {
  if (!iso) return "";
  const at = laPaz(new Date(iso));
  return at.day === laPaz(now).day ? `Próximo pago: hoy ${at.time}` : `Próximo pago: ${releaseDateLabel(at.day)} ${at.time}`;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd apps/merchant-dashboard && node --test src/settlement.test.mjs`
Expected: PASS (4 tests).

- [ ] **Step 5: Write the failing Playwright test**

`apps/merchant-dashboard/tests/settlement.spec.mjs`:
```js
import { expect, test } from "@playwright/test";

const store = {
  id: "store_1", merchantId: "merchant_1", slug: "store_1", name: "Primera", websiteRevision: 0, websitePublishedRevision: 0, websiteDraft: null, status: "ACTIVE",
  backgroundColor: "#f8fafc", backgroundMode: "solid", backgroundGradientStart: "#f8fafc", backgroundGradientEnd: "#e0e7ff", backgroundGradientAngle: 135,
  heroSlides: [], contentOrder: ["hero", "about", "gallery", "products", "links"], experienceStyle: "editorial-grid", motionDuoEnabled: false,
  motionExperience: "clarity-marquee", motionExperiences: ["clarity-marquee"], animations: [], editorialGallery: [], links: [], customDomains: [],
  checkoutMode: "payment", contactPhone: null, contactEmail: null, contactFormEnabled: false, contactFormEmail: null, locationMapUrl: null,
  locationDescription: null, locationHighlight: null, locations: [], leadCaptureUrl: null, cartRecommendationsEnabled: true, cartRecommendationProductIds: [], showLowStockToCustomers: false,
};

const schedule = {
  policy: { level: 1, levelName: "Persona", delayDays: 7, reserveBps: 1000, reserveDays: 60 },
  nextLevel: { level: 2, name: "Negocio", delayDays: 3, reserveBps: 500, reserveDays: 45 },
  releases: [{ date: "2026-10-08", currency: "BOB", toAvailable: 8_775, fromReserve: 0 }, { date: "2026-11-30", currency: "BOB", toAvailable: 0, fromReserve: 975 }],
};

async function openDashboard(page, { balance, scheduleResponse = { status: 200, body: schedule } }) {
  await page.addInitScript(() => {
    sessionStorage.setItem("pagosya_merchant_session", "dash_test");
    sessionStorage.setItem("pagosya_merchant_email", "merchant@example.com");
  });
  await page.route("http://localhost:3001/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace("/v1", "");
    const json = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (path === "/merchants/settlement/schedule") return json(scheduleResponse.body, scheduleResponse.status);
    if (path === "/merchants/balance") return json(balance);
    if (path === "/stores") return json([store]);
    if (path.endsWith("/visual-studio")) return json({ proposals: [], versions: [] });
    if (path === "/merchants/kyc") return json({ status: "APPROVED" });
    if (path === "/merchants/invoicing_profile") return json({ status: "NOT_CONFIGURED" });
    if (path === "/merchants/international_payments") return json({ status: "OFF", settlementMode: "AGGREGATOR", feeBps: 590, fxRateAvailable: true, usdPayoutAccountOnFile: false, note: null });
    if (path.startsWith("/dashboard/terms")) return json({ current: null, upcoming: null, acceptedVersion: null, needsAcceptance: false });
    if (path.startsWith("/dashboard/limits")) return json({ level: 1, levelName: "Persona", liveEnabled: true, monthlyLimit: 1_000_000, perPaymentLimit: 200_000, used: 0, month: "2026-10", resetsAt: "2026-11-01T04:00:00.000Z" });
    if (path === "/merchants/finances") return json({ totalRevenue: 0, paymentCount: 0, inventoryValue: 0, totalStoreViews: 0, topProducts: [], revenueByPaymentMethod: [], currency: "BOB" });
    return json([]);
  });
  await page.goto("/");
  await expect(page.locator("#app")).toBeVisible();
}

test("balance cards show pending and reserve, and the payouts page explains the timing", async ({ page }) => {
  await openDashboard(page, {
    balance: { payableBalance: 8_775, currency: "BOB", payoutsHeld: false, balances: [{ currency: "BOB", payableBalance: 8_775, available: 8_775, pending: 19_500, reserve: 975, nextPayoutAt: null }] },
  });
  const card = page.locator('#balanceCards .overview-balance[data-currency="BOB"]');
  await expect(card).toContainText("87.75 BOB");
  await expect(card).toContainText("En espera 195.00 BOB · Reserva 9.75 BOB");
  await expect(page.locator("#payoutHoldBanner")).toBeHidden();

  await page.goto("/#dashboard-payouts");
  await expect(page.locator("#settlementPolicy")).toHaveText("Nivel 1: tus ventas están disponibles a los 7 días; guardamos el 10% por 60 días como reserva de protección.");
  await expect(page.locator("#settlementReleases li")).toHaveCount(2);
  await expect(page.locator("#settlementReleases li").first()).toContainText("08/10/2026");
  await expect(page.locator("#settlementNextLevel")).toHaveText("En el nivel 2 (Negocio) recibes tu dinero a los 3 días y con 5% de reserva.");
});

test("a held account shows the pause banner", async ({ page }) => {
  await openDashboard(page, { balance: { payableBalance: 100, currency: "BOB", payoutsHeld: true, balances: [{ currency: "BOB", payableBalance: 100, available: 100, pending: 0, reserve: 0, nextPayoutAt: null }] } });
  await expect(page.locator("#payoutHoldBanner")).toBeVisible();
  await expect(page.locator("#payoutHoldBanner")).toHaveText("Tus pagos están en pausa. Escríbenos a soporte.");
});

test("an old-shape balance and a failing schedule still render the card, without the panel", async ({ page }) => {
  await openDashboard(page, { balance: { payableBalance: 5_000 }, scheduleResponse: { status: 500, body: { message: "boom" } } });
  await expect(page.locator("#balanceCards")).toContainText("Saldo por desembolsar (BOB)");
  await expect(page.locator("#balanceCards")).toContainText("50.00 BOB");
  await page.goto("/#dashboard-payouts");
  await expect(page.locator("#settlementPanel")).toBeHidden();
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `cd apps/merchant-dashboard && pnpm exec playwright test tests/settlement.spec.mjs`
Expected: FAIL — `#payoutHoldBanner` / `#settlementPolicy` not found.

- [ ] **Step 7: Markup**

In `index.html`, inside `<section class="panel overview-account" …>` directly after `<h2 id="overviewAccountTitle">Tu cuenta</h2>` add:
```html
        <p class="payout-hold-banner" id="payoutHoldBanner" role="status" hidden>Tus pagos están en pausa. Escríbenos a soporte.</p>
```
Inside `<section class="block" id="payoutsSection" …>`, before its existing `<div class="panel">`, add:
```html
      <div class="panel settlement-panel" id="settlementPanel" hidden>
        <h2>Cuándo recibes tu dinero</h2>
        <p id="settlementPolicy"></p>
        <ul class="settlement-releases" id="settlementReleases"></ul>
        <p class="muted" id="settlementNextLevel"></p>
      </div>
```

- [ ] **Step 8: Dashboard logic**

In `src/dashboard.js`:
- add to the imports: `import { nextLevelSentence, nextPayoutLabel, releaseDateLabel, settlementPolicySentence } from "/src/settlement.mjs";`
- next to `let lastBalances = null;` add `let lastSettlement = null;`
- replace `renderBalanceCards` with:
```js
  // One row per currency in the "Tu cuenta" list on Resumen. available/pending/reserve
  // come from the settlement split; older responses only carry payableBalance.
  function renderBalanceCards(balances) {
    document.getElementById("balanceCards").innerHTML = balances
      .map((entry) => {
        const currency = esc(entry.currency);
        const held = [
          entry.pending ? `En espera ${money(entry.pending, currency)}` : "",
          entry.reserve ? `Reserva ${money(entry.reserve, currency)}` : "",
        ].filter(Boolean).join(" · ");
        return `<div class="overview-balance" data-currency="${currency}">
          <dt>Saldo por desembolsar (${currency})</dt>
          <dd>${money(entry.available ?? entry.payableBalance, currency)}</dd>
          ${held ? `<p class="balance-held">${held}</p>` : ""}
          <p>${esc(nextPayoutLabel(entry.nextPayoutAt) || "Se transfiere a tu cuenta bancaria en el próximo desembolso.")}</p>
        </div>`;
      })
      .join("");
  }

  function renderSettlementPanel(schedule) {
    lastSettlement = schedule;
    const panel = document.getElementById("settlementPanel");
    panel.hidden = !schedule?.policy;
    if (panel.hidden) return;
    document.getElementById("settlementPolicy").textContent = settlementPolicySentence(schedule.policy);
    document.getElementById("settlementReleases").innerHTML = (schedule.releases || [])
      .map((r) => {
        const currency = esc(r.currency);
        const parts = [
          r.toAvailable ? `${money(r.toAvailable, currency)} pasan a disponible` : "",
          r.fromReserve ? `${money(r.fromReserve, currency)} vuelven de la reserva` : "",
        ].filter(Boolean).join(" · ");
        return `<li><strong>${esc(releaseDateLabel(r.date))}</strong> ${parts}</li>`;
      })
      .join("") || `<li class="muted">No tienes dinero en espera.</li>`;
    document.getElementById("settlementNextLevel").textContent = nextLevelSentence(schedule.nextLevel);
  }
```
- where the money-visibility toggle re-renders (`if (lastBalances) renderBalanceCards(lastBalances);`), add on the next line: `if (lastSettlement) renderSettlementPanel(lastSettlement);`
- in `overviewPromise`, append a ninth request after `api("/dashboard/limits").catch(() => null),`:
```js
        api("/merchants/settlement/schedule").catch(() => null),
```
- update the destructuring to `const [[balance, kyc, invoicing, payouts, totalFinances, international, terms, limits, settlementSchedule], payments, …] = await Promise.all([` (keep the rest of that line unchanged).
- right after `renderBalanceCards(lastBalances);` add:
```js
      document.getElementById("payoutHoldBanner").hidden = !balance.payoutsHeld;
      renderSettlementPanel(settlementSchedule);
```

In `src/dashboard.css` add:
```css
.payout-hold-banner {
  margin: 0 0 12px;
  padding: 10px 12px;
  border-radius: 10px;
  background: #fef3f2;
  color: #b42318;
  font-weight: 600;
}

.overview-balance .balance-held {
  color: var(--muted, #667085);
}

.settlement-releases {
  margin: 8px 0;
  padding-left: 18px;
  display: grid;
  gap: 4px;
}
```

- [ ] **Step 9: Run the dashboard suites**

Run: `cd apps/merchant-dashboard && pnpm run test:unit && pnpm exec playwright test`
Expected: PASS, including `international-payments.spec.mjs` (the "Saldo por desembolsar" label is unchanged).

- [ ] **Step 10: Commit**

```bash
git add apps/merchant-dashboard
git commit -m "feat(dashboard): merchants see held money, release dates and a payout pause banner"
```

---

## Task 12: Terms clause draft and full verification

**Files:**
- Create: `docs/asfi/2026-10-07-clausula-retencion-reserva.md`

- [ ] **Step 1: Write the draft clause for the lawyer**

`docs/asfi/2026-10-07-clausula-retencion-reserva.md`:
```markdown
# Borrador — Cláusula de plazos de liquidación, reserva y retención de pagos

> Borrador técnico para revisión legal. Describe lo que el sistema hace hoy; el texto final lo aprueba el asesor legal antes de publicarse como nueva versión de los Términos para comercios.

**X. Liquidación de fondos, reserva de protección y retenciones**

X.1. Los cobros que pagosYa recibe por cuenta del Comercio quedan **en espera** durante un plazo que depende de su nivel de verificación. Al vencer ese plazo pasan a **saldo disponible**, salvo la parte que se guarda como reserva.

X.2. pagosYa guarda un **porcentaje de cada cobro como reserva de protección** durante un plazo determinado, contado desde la fecha del cobro. Al vencer ese plazo, la reserva pasa al saldo disponible.

X.3. Los plazos y porcentajes vigentes para cada nivel se muestran en el panel del Comercio ("Cuándo recibes tu dinero"). pagosYa puede fijar condiciones particulares para un Comercio según su riesgo. Los cambios aplican solo a los cobros posteriores al cambio.

X.4. El saldo disponible se transfiere **una vez al día** a la cuenta bancaria registrada a nombre del Comercio.

X.5. Cuando un comprador recibe un **reembolso**, su importe se cubre, en este orden, con: (a) el saldo disponible; (b) los cobros en espera; (c) la reserva; y (d) si no alcanza, el saldo disponible queda negativo y se compensa con los cobros futuros del Comercio antes de cualquier nueva transferencia.

X.6. pagosYa puede **retener las transferencias** al Comercio mientras revisa reclamos de compradores, indicios de fraude o incumplimientos de estos Términos. Los cobros siguen registrados durante la retención.

X.7. Ante un **fraude confirmado** o una falta de entrega que deba restituirse a un comprador, pagosYa puede usar la reserva del Comercio para devolver el dinero al comprador, dejando constancia de cada movimiento.

---

Números vigentes en el sistema (marcadores, editables por operaciones; confirmar con el banco):

| Nivel | En espera | Reserva | Plazo de la reserva |
|---|---|---|---|
| 1 Persona | 7 días | 10% | 60 días |
| 2 Negocio | 3 días | 5% | 45 días |
| 3 Empresa | 1 día | 0% | — |
```

- [ ] **Step 2: Full API, ops and dashboard verification**

Run:
```bash
cd /Users/saramia/pagosYa/.claude/worktrees/asfi-holdback/apps/api && pnpm exec tsc --noEmit -p tsconfig.json && pnpm test
cd ../ops && pnpm test && pnpm exec playwright test
cd ../merchant-dashboard && pnpm run test:unit && pnpm exec playwright test
```
Expected: all PASS. Report any failure verbatim; do not mark the task complete with failures.

- [ ] **Step 3: Schema/migration agreement (main session only — not a subagent)**

The main session checks that the hand-written SQL matches `schema.prisma`, using a throwaway shadow database on the dev Postgres server — never the dev database itself:
```bash
cd /Users/saramia/pagosYa/.claude/worktrees/asfi-holdback/apps/api
ADMIN=$(node -e 'const u=new URL(require("fs").readFileSync(".env","utf8").match(/^DATABASE_URL=(.*)$/m)[1].replace(/^["\x27]|["\x27]$/g,""));u.pathname="/postgres";u.search="";console.log(u.href)')
SHADOW=$(node -e 'const u=new URL(process.argv[1]);u.pathname="/settlement_shadow_check";console.log(u.href)' "$ADMIN")
psql "$ADMIN" -c 'CREATE DATABASE settlement_shadow_check'
pnpm exec prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url "$SHADOW" --exit-code; echo "diff exit: $?"
psql "$ADMIN" -c 'DROP DATABASE settlement_shadow_check'
```
Expected: `diff exit: 0` (no difference). Exit 2 means the SQL and schema disagree: fix the migration SQL, rerun the integration suite, recheck.

- [ ] **Step 4: Commit**

```bash
git add docs/asfi/2026-10-07-clausula-retencion-reserva.md
git commit -m "docs(asfi): draft terms clause for payout delay, reserve and holds"
```
