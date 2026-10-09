# Sellable Memberships Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store owners sell memberships as a product type with several priced periods; buyers join with "Hacerme miembro" through their store account, renew through pay links, and lapse after a grace period.

**Architecture:** A membership is a `PaymentLink` with `fulfillmentType: "MEMBERSHIP"` and `MembershipPeriod` rows. Members are `CustomerSubscription` rows carrying `membershipPeriodId`, `storeCustomerId` and `accessUntil`, so the existing renewal engine (`SubscriptionInvoice` + pay links + renewal `StoreOrder`) bills them through a membership branch. Joining happens in the checkout app at `/cuenta/<slug>/unirme`, which creates a payment intent with `metadata.membership`; the payment-success transaction enrolls the member.

**Tech Stack:** NestJS + Prisma (Postgres) in `apps/api` (jest), vanilla TS checkout app `apps/checkout` (vitest), Studio `apps/merchant-studio` (vitest), dashboard `apps/merchant-dashboard` (`node --test`), storefront runtime `packages/storefront-kit/kit/commerce.js` (tested from `apps/api` with jsdom).

**Spec:** `docs/superpowers/specs/2026-10-09-sellable-memberships-design.md`

## Global Constraints

- Nothing is ever charged automatically. No copy, email or YAPI prompt may say or imply automatic charging. Consent line, verbatim: `Cada período te enviaremos un enlace para pagar; no se cobra nada automáticamente.`
- Period lengths: 1, 3, 6 or 12 months; 1–4 periods per membership; each length once; price is an integer in minor units, > 0 and ≤ 2147483647.
- Grace days: store setting `membershipGraceDays`, integer 0–30, default 7.
- Renewal notice: 120 hours (5 days) before `accessUntil`.
- Buyer copy is Spanish (es-BO). Labels: Mensual / Trimestral / Semestral / Anual; states Activa / En gracia / Vencida / Cancelada.
- No agent runs `prisma migrate`, `prisma db push`, `prisma migrate diff` or `prisma migrate reset`. The migration SQL is written by hand; the owner applies it (Task 15). `npx prisma generate` and `npx prisma validate` are allowed.
- Never interpolate untrusted text into HTML without the file's existing escape helper (`escape`, `escapeHtml`, `esc`).
- Commit only the files a task names (`git add <paths>`), never `git add -A` / `git add .`.

## Preconditions (before Task 1)

The owner's working tree on `feature/store-page-architecture` has uncommitted work in files this plan edits: `payment-links.service.ts` (+ spec), `dto/create-payment-link.dto.ts`, `payment-links.module.ts`, `store-customers.service.ts` (+ spec), `source-generation.service.ts`, `merchant-studio/src/api.ts`, `source-create-product.ts` (+ test), `storefront-kit/kit/commerce.js`. That work must be committed (owner's call) before Task 1, so each task's commit contains only membership changes. Execution stays on the checked-out branch: the owner's dev servers read this working tree.

## Review Focus

1. **Month-end dates.** Joining on 31 January with a monthly period must give access until 28/29 February, not 3 March (today's `advanceBillingDate` overflows). Pinned in Task 2.
2. **Period archived or repriced between page view and payment.** The buyer pays the price shown when they started; enrollment uses the paid line's amount and the period row even if it was archived meanwhile. Pinned in Task 6.
3. **Test-mode memberships.** A membership joined while the store was in test mode must never get a live renewal link (existing origin rule). Pinned in Task 7.
4. **A membership left in an old cart.** A saved/recovered cart that contains a membership product must not reach checkout; the server answers with a clear message. Pinned in Tasks 4, 12 and 13.
5. **Session ends mid-join.** A buyer who must sign in, register or confirm their email returns to the same membership and period afterwards. Pinned in Task 13.

---

### Task 1: Schema and migration

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (models `PaymentLink`, `Store`, `CustomerSubscription`; new `MembershipPeriod`)
- Create: `apps/api/prisma/migrations/20261009120000_sellable_memberships/migration.sql`

**Interfaces:**
- Produces: Prisma model `MembershipPeriod { id, paymentLinkId, months, amount, position, archivedAt, createdAt, updatedAt }`, `PaymentLink.membershipPeriods`, `Store.membershipGraceDays: number`, `CustomerSubscription.{ membershipPeriodId, storeCustomerId, accessUntil, pendingPeriodId }`.

- [ ] **Step 1: Edit the schema**

In `model PaymentLink`, add next to `subscriptionOptions`:

```prisma
  membershipPeriods     MembershipPeriod[]
```

and put this comment line directly above the existing `fulfillmentType` field (leave the field and its default unchanged):

```prisma
  // PHYSICAL | DIGITAL | MEMBERSHIP (spec 2026-10-09-sellable-memberships-design).
```

After `model ProductSubscriptionOption { … }` add:

```prisma
// One purchasable length of a membership product (spec 2026-10-09). Price changes apply to new members only;
// a removed period that members ever used is archived, not deleted.
model MembershipPeriod {
  id            String      @id @default(cuid())
  paymentLinkId String
  paymentLink   PaymentLink @relation(fields: [paymentLinkId], references: [id], onDelete: Cascade)
  months        Int
  amount        Int
  position      Int         @default(0)
  archivedAt    DateTime?
  createdAt     DateTime    @default(now())
  updatedAt     DateTime    @updatedAt

  @@unique([paymentLinkId, months])
  @@index([paymentLinkId, archivedAt])
}
```

In `model Store`, next to `subscriptionsEnabled`, add:

```prisma
  // Days a membership stays usable after an unpaid renewal before it lapses (0–30).
  membershipGraceDays     Int      @default(7)
```

In `model CustomerSubscription`, after `pausedAt`, add:

```prisma
  // Memberships (spec 2026-10-09): non-null membershipPeriodId marks a membership row.
  membershipPeriodId String?
  storeCustomerId    String?
  // "Activa hasta": paid access ends here; grace days are added on top while status is ACTIVE.
  accessUntil        DateTime?
  // Period switch applied when the next renewal is created.
  pendingPeriodId    String?
```

and add indexes inside the same model:

```prisma
  @@index([storeCustomerId, paymentLinkId])
  @@index([storeId, membershipPeriodId, status])
```

- [ ] **Step 2: Write the migration SQL**

`apps/api/prisma/migrations/20261009120000_sellable_memberships/migration.sql`:

```sql
-- Sellable memberships (spec 2026-10-09).
CREATE TABLE "MembershipPeriod" (
    "id" TEXT NOT NULL,
    "paymentLinkId" TEXT NOT NULL,
    "months" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MembershipPeriod_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MembershipPeriod_paymentLinkId_months_key" ON "MembershipPeriod"("paymentLinkId", "months");
CREATE INDEX "MembershipPeriod_paymentLinkId_archivedAt_idx" ON "MembershipPeriod"("paymentLinkId", "archivedAt");
ALTER TABLE "MembershipPeriod" ADD CONSTRAINT "MembershipPeriod_paymentLinkId_fkey" FOREIGN KEY ("paymentLinkId") REFERENCES "PaymentLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Store" ADD COLUMN "membershipGraceDays" INTEGER NOT NULL DEFAULT 7;

ALTER TABLE "CustomerSubscription" ADD COLUMN "membershipPeriodId" TEXT,
ADD COLUMN "storeCustomerId" TEXT,
ADD COLUMN "accessUntil" TIMESTAMP(3),
ADD COLUMN "pendingPeriodId" TEXT;
CREATE INDEX "CustomerSubscription_storeCustomerId_paymentLinkId_idx" ON "CustomerSubscription"("storeCustomerId", "paymentLinkId");
CREATE INDEX "CustomerSubscription_storeId_membershipPeriodId_status_idx" ON "CustomerSubscription"("storeId", "membershipPeriodId", "status");
```

- [ ] **Step 3: Validate and generate the client (no database access)**

Run: `cd apps/api && npx prisma validate && npx prisma generate`
Expected: "The schema at prisma/schema.prisma is valid" and "Generated Prisma Client".

- [ ] **Step 4: Typecheck**

Run: `cd apps/api && npx tsc --noEmit -p tsconfig.json`
Expected: no errors mentioning the new fields (pre-existing errors, if any, are unchanged — record them before Step 1 to compare).

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20261009120000_sellable_memberships/migration.sql
git commit -m "feat(memberships): schema — membership periods, grace days, member fields on CustomerSubscription"
```

---

### Task 2: Membership rules (pure functions) and month-end dates

**Files:**
- Create: `apps/api/src/memberships/membership-rules.ts`
- Create: `apps/api/src/memberships/membership-rules.spec.ts`
- Modify: `apps/api/src/operations/subscription-pricing.ts` (`advanceBillingDate` clamps month ends)
- Modify: `apps/api/src/operations/subscription-pricing.spec.ts`

**Interfaces:**
- Produces (all exported from `membership-rules.ts`):
  - `MEMBERSHIP_MONTHS: readonly [1, 3, 6, 12]`, `MEMBERSHIP_NOTICE_HOURS = 120`, `MAX_MEMBERSHIP_PERIODS = 4`, `MEMBERSHIP_CONSENT_TEXT: string`
  - `type MembershipPeriodInput = { months: number; amount: number }`
  - `normalizeMembershipPeriods(value: unknown): MembershipPeriodInput[]` (throws `BadRequestException`)
  - `periodLabel(months: number): string`, `periodSuffix(months: number): string`
  - `membershipKey(storeId: string, paymentLinkId: string, storeCustomerId: string): string`
  - `accessAfterPayment(periodStart: Date, months: number, current: Date | null): Date`
  - `type MembershipState = "ACTIVE" | "GRACE" | "LAPSED" | "CANCELED_ACTIVE" | "CANCELED"`
  - `membershipState(row: { status: string; accessUntil: Date | null }, graceDays: number, now?: Date): MembershipState`
  - `hasMembershipAccess(row, graceDays, now?): boolean`, `blocksRejoin(row, graceDays, now?): boolean`
  - `MEMBERSHIP_STATE_LABEL: Record<MembershipState, string>`
  - `membershipTermsPeriod(subscription: { membershipPeriodId: string | null; pendingPeriodId: string | null; unitAmount: number | null }, periods: Map<string, { months: number; amount: number }>): { months: number; amount: number; switching: boolean } | null`

- [ ] **Step 1: Write the failing tests**

`apps/api/src/memberships/membership-rules.spec.ts`:

```ts
import { BadRequestException } from "@nestjs/common";
import {
  accessAfterPayment, blocksRejoin, hasMembershipAccess, membershipKey, membershipState, membershipTermsPeriod,
  normalizeMembershipPeriods, periodLabel, periodSuffix,
} from "./membership-rules";

const day = (iso: string) => new Date(`${iso}T12:00:00Z`);

describe("normalizeMembershipPeriods", () => {
  it("keeps up to four distinct lengths with positive integer prices, in the order given", () => {
    expect(normalizeMembershipPeriods([{ months: 12, amount: 48000 }, { months: 1, amount: 5000 }])).toEqual([{ months: 12, amount: 48000 }, { months: 1, amount: 5000 }]);
  });
  it.each([
    [[]],
    [[{ months: 2, amount: 100 }]],
    [[{ months: 1, amount: 0 }]],
    [[{ months: 1, amount: 10.5 }]],
    [[{ months: 1, amount: 100 }, { months: 1, amount: 200 }]],
    [[{ months: 1, amount: 1 }, { months: 3, amount: 1 }, { months: 6, amount: 1 }, { months: 12, amount: 1 }, { months: 1, amount: 2 }]],
    ["mensual"],
  ])("rejects %j", (value) => {
    expect(() => normalizeMembershipPeriods(value)).toThrow(BadRequestException);
  });
});

describe("labels", () => {
  it("names the four lengths", () => {
    expect([1, 3, 6, 12].map(periodLabel)).toEqual(["Mensual", "Trimestral", "Semestral", "Anual"]);
    expect([1, 3, 6, 12].map(periodSuffix)).toEqual(["/ mes", "/ 3 meses", "/ 6 meses", "/ año"]);
  });
});

describe("accessAfterPayment", () => {
  it("extends from the old end date, never from the payment date", () => {
    expect(accessAfterPayment(day("2026-11-12"), 1, day("2026-11-12"))).toEqual(day("2026-12-12"));
  });
  it("never shortens access already granted", () => {
    expect(accessAfterPayment(day("2026-11-12"), 1, day("2027-01-12"))).toEqual(day("2027-01-12"));
  });
  it("clamps month ends: 31 January + 1 month is the last day of February", () => {
    expect(accessAfterPayment(day("2027-01-31"), 1, null)).toEqual(day("2027-02-28"));
    expect(accessAfterPayment(day("2028-01-31"), 1, null)).toEqual(day("2028-02-29"));
  });
});

describe("membershipState", () => {
  const now = day("2026-11-15");
  it("is ACTIVE before accessUntil, GRACE inside the grace days, LAPSED after", () => {
    expect(membershipState({ status: "ACTIVE", accessUntil: day("2026-11-20") }, 7, now)).toBe("ACTIVE");
    expect(membershipState({ status: "ACTIVE", accessUntil: day("2026-11-10") }, 7, now)).toBe("GRACE");
    expect(membershipState({ status: "ACTIVE", accessUntil: day("2026-11-01") }, 7, now)).toBe("LAPSED");
    expect(membershipState({ status: "LAPSED", accessUntil: day("2026-11-20") }, 7, now)).toBe("LAPSED");
  });
  it("keeps a canceled member's paid access until accessUntil", () => {
    expect(membershipState({ status: "CANCELED", accessUntil: day("2026-11-20") }, 7, now)).toBe("CANCELED_ACTIVE");
    expect(membershipState({ status: "CANCELED", accessUntil: day("2026-11-10") }, 7, now)).toBe("CANCELED");
  });
  it("derives access and rejoin rules from the state", () => {
    expect(hasMembershipAccess({ status: "ACTIVE", accessUntil: day("2026-11-10") }, 7, now)).toBe(true);
    expect(hasMembershipAccess({ status: "CANCELED", accessUntil: day("2026-11-10") }, 7, now)).toBe(false);
    expect(blocksRejoin({ status: "CANCELED", accessUntil: day("2026-11-20") }, 7, now)).toBe(true);
    expect(blocksRejoin({ status: "LAPSED", accessUntil: day("2026-11-20") }, 7, now)).toBe(false);
  });
});

describe("membershipKey and membershipTermsPeriod", () => {
  it("is stable per store, product and account", () => {
    expect(membershipKey("s", "p", "c")).toBe(membershipKey("s", "p", "c"));
    expect(membershipKey("s", "p", "c")).not.toBe(membershipKey("s", "p", "d"));
    expect(membershipKey("s", "p", "c")).toMatch(/^[a-f0-9]{64}$/);
  });
  it("bills the locked price, or the pending period's current price when switching", () => {
    const periods = new Map([["m1", { months: 1, amount: 5000 }], ["m12", { months: 12, amount: 48000 }]]);
    expect(membershipTermsPeriod({ membershipPeriodId: "m1", pendingPeriodId: null, unitAmount: 4500 }, periods)).toEqual({ months: 1, amount: 4500, switching: false });
    expect(membershipTermsPeriod({ membershipPeriodId: "m1", pendingPeriodId: "m12", unitAmount: 4500 }, periods)).toEqual({ months: 12, amount: 48000, switching: true });
    expect(membershipTermsPeriod({ membershipPeriodId: "gone", pendingPeriodId: null, unitAmount: 4500 }, periods)).toBeNull();
  });
});
```

Add to `apps/api/src/operations/subscription-pricing.spec.ts` (import `advanceBillingDate` if the file does not already):

```ts
describe("advanceBillingDate month ends", () => {
  it("clamps to the last day of the target month instead of overflowing", () => {
    expect(advanceBillingDate(new Date("2027-01-31T15:00:00Z"), "MONTHLY", 1)).toEqual(new Date("2027-02-28T15:00:00Z"));
    expect(advanceBillingDate(new Date("2026-08-31T15:00:00Z"), "MONTHLY", 3)).toEqual(new Date("2026-11-30T15:00:00Z"));
    expect(advanceBillingDate(new Date("2028-02-29T15:00:00Z"), "YEARLY", 1)).toEqual(new Date("2029-02-28T15:00:00Z"));
    expect(advanceBillingDate(new Date("2026-10-01T15:00:00Z"), "MONTHLY", 1)).toEqual(new Date("2026-11-01T15:00:00Z"));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/api && npx jest src/memberships/membership-rules.spec.ts src/operations/subscription-pricing.spec.ts`
Expected: FAIL — "Cannot find module './membership-rules'" and the month-end case returns 2027-03-03.

- [ ] **Step 3: Clamp month ends in `advanceBillingDate`**

Replace the function in `apps/api/src/operations/subscription-pricing.ts`:

```ts
export function advanceBillingDate(date: Date, interval: string, count: number): Date {
  const next = new Date(date);
  if (interval === "WEEKLY") { next.setUTCDate(next.getUTCDate() + count * 7); return next; }
  const months = interval === "YEARLY" ? count * 12 : count;
  // 31 January + 1 month is the last day of February, never 3 March.
  const day = next.getUTCDate();
  next.setUTCDate(1);
  next.setUTCMonth(next.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
  next.setUTCDate(Math.min(day, lastDay));
  return next;
}
```

- [ ] **Step 4: Write `membership-rules.ts`**

```ts
import { BadRequestException } from "@nestjs/common";
import { createHash } from "crypto";
import { advanceBillingDate } from "../operations/subscription-pricing";

/** Membership arithmetic shared by the owner API, checkout, enrollment and the renewal engine (spec 2026-10-09). */
export const MEMBERSHIP_MONTHS = [1, 3, 6, 12] as const;
export const MEMBERSHIP_NOTICE_HOURS = 120;
export const MAX_MEMBERSHIP_PERIODS = 4;
export const MEMBERSHIP_CONSENT_TEXT = "Cada período te enviaremos un enlace para pagar; no se cobra nada automáticamente.";
const MAX_AMOUNT = 2_147_483_647;
const DAY_MS = 86_400_000;

export type MembershipPeriodInput = { months: number; amount: number };

export function normalizeMembershipPeriods(value: unknown): MembershipPeriodInput[] {
  const problem = "Indica de uno a cuatro períodos distintos (1, 3, 6 o 12 meses), cada uno con un precio mayor que cero.";
  if (!Array.isArray(value) || !value.length || value.length > MAX_MEMBERSHIP_PERIODS) throw new BadRequestException(problem);
  const periods = value.map(entry => ({ months: Number((entry as MembershipPeriodInput)?.months), amount: Number((entry as MembershipPeriodInput)?.amount) }));
  if (periods.some(p => !(MEMBERSHIP_MONTHS as readonly number[]).includes(p.months) || !Number.isSafeInteger(p.amount) || p.amount <= 0 || p.amount > MAX_AMOUNT)
    || new Set(periods.map(p => p.months)).size !== periods.length) throw new BadRequestException(problem);
  return periods;
}

const LABEL: Record<number, string> = { 1: "Mensual", 3: "Trimestral", 6: "Semestral", 12: "Anual" };
const SUFFIX: Record<number, string> = { 1: "/ mes", 3: "/ 3 meses", 6: "/ 6 meses", 12: "/ año" };
export const periodLabel = (months: number) => LABEL[months] ?? `Cada ${months} meses`;
export const periodSuffix = (months: number) => SUFFIX[months] ?? `/ ${months} meses`;

export function membershipKey(storeId: string, paymentLinkId: string, storeCustomerId: string): string {
  return createHash("sha256").update(`${storeId}:membership:${paymentLinkId}:${storeCustomerId}`).digest("hex");
}

/** A paid period starts where the previous one ended; paying early or late never moves the end date. */
export function accessAfterPayment(periodStart: Date, months: number, current: Date | null): Date {
  const next = advanceBillingDate(periodStart, "MONTHLY", months);
  return current && current > next ? current : next;
}

export type MembershipState = "ACTIVE" | "GRACE" | "LAPSED" | "CANCELED_ACTIVE" | "CANCELED";
export const MEMBERSHIP_STATE_LABEL: Record<MembershipState, string> = { ACTIVE: "Activa", GRACE: "En gracia", LAPSED: "Vencida", CANCELED_ACTIVE: "Cancelada", CANCELED: "Cancelada" };
type Row = { status: string; accessUntil: Date | null };

export function membershipState(row: Row, graceDays: number, now = new Date()): MembershipState {
  const until = row.accessUntil?.getTime() ?? 0;
  if (row.status === "LAPSED") return "LAPSED";
  if (row.status !== "ACTIVE") return now.getTime() < until ? "CANCELED_ACTIVE" : "CANCELED";
  if (now.getTime() < until) return "ACTIVE";
  return now.getTime() < until + graceDays * DAY_MS ? "GRACE" : "LAPSED";
}
export const hasMembershipAccess = (row: Row, graceDays: number, now = new Date()) => ["ACTIVE", "GRACE", "CANCELED_ACTIVE"].includes(membershipState(row, graceDays, now));
export const blocksRejoin = hasMembershipAccess;

/** What the next renewal bills: the member's locked price, or the pending period's current price when a switch is due. */
export function membershipTermsPeriod(
  subscription: { membershipPeriodId: string | null; pendingPeriodId: string | null; unitAmount: number | null },
  periods: Map<string, { months: number; amount: number }>,
): { months: number; amount: number; switching: boolean } | null {
  const pending = subscription.pendingPeriodId ? periods.get(subscription.pendingPeriodId) : undefined;
  if (pending) return { months: pending.months, amount: pending.amount, switching: true };
  const current = subscription.membershipPeriodId ? periods.get(subscription.membershipPeriodId) : undefined;
  if (!current || !subscription.unitAmount) return null;
  return { months: current.months, amount: subscription.unitAmount, switching: false };
}
```

- [ ] **Step 5: Run tests to verify they pass, plus the existing renewal suites**

Run: `cd apps/api && npx jest src/memberships src/operations/subscription-pricing.spec.ts src/operations/subscription-renewals.spec.ts src/operations/subscription-enrollment.spec.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/memberships/membership-rules.ts apps/api/src/memberships/membership-rules.spec.ts apps/api/src/operations/subscription-pricing.ts apps/api/src/operations/subscription-pricing.spec.ts
git commit -m "feat(memberships): pure membership rules; billing dates clamp to month ends"
```

---

### Task 3: Owner product API — membership type and periods

**Files:**
- Create: `apps/api/src/payment-links/membership-periods.ts`
- Create: `apps/api/src/payment-links/membership-periods.spec.ts`
- Modify: `apps/api/src/payment-links/dto/create-payment-link.dto.ts` (nested DTO + two optional fields on `CreatePaymentLinkDto`)
- Modify: `apps/api/src/payment-links/payment-links.service.ts` (`create`, `update`, `listForStore`)
- Modify: `apps/api/src/payment-links/payment-links.service.spec.ts`

**Interfaces:**
- Consumes: `normalizeMembershipPeriods`, `MembershipPeriodInput` (Task 2).
- Produces:
  - `MEMBERSHIP_PRODUCT_FIELDS` — `{ fulfillmentType: "MEMBERSHIP", stock: null, shippingWeightGrams: 0, variants: [], extras: [] }`
  - `membershipRequest(dto, required: boolean): MembershipPeriodInput[] | null`, `cheapestPeriod(periods): number`
  - `syncMembershipPeriods(tx: Prisma.TransactionClient, paymentLinkId: string, periods: MembershipPeriodInput[]): Promise<void>`
  - `CreatePaymentLinkDto.fulfillmentType?: "PHYSICAL" | "MEMBERSHIP"`, `CreatePaymentLinkDto.membershipPeriods?: { months: number; amount: number }[]`
  - `listForStore` rows include `membershipPeriods: { id, months, amount, position }[]` (active only, by position).

- [ ] **Step 1: Write the failing tests for the period sync**

`apps/api/src/payment-links/membership-periods.spec.ts`:

```ts
import { syncMembershipPeriods } from "./membership-periods";

function makeTx(existing: Array<{ id: string; months: number; amount: number; archivedAt: Date | null }>, used: string[] = []) {
  return {
    membershipPeriod: {
      findMany: jest.fn().mockResolvedValue(existing),
      update: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockResolvedValue({}),
      delete: jest.fn().mockResolvedValue({}),
    },
    customerSubscription: {
      count: jest.fn(async ({ where }: any) => (used.includes(where.OR[0].membershipPeriodId) ? 1 : 0)),
    },
  };
}

describe("syncMembershipPeriods", () => {
  it("updates kept lengths, creates new ones and orders them as given", async () => {
    const tx = makeTx([{ id: "m1", months: 1, amount: 5000, archivedAt: null }]);
    await syncMembershipPeriods(tx as never, "p1", [{ months: 12, amount: 48000 }, { months: 1, amount: 5500 }]);
    expect(tx.membershipPeriod.create).toHaveBeenCalledWith({ data: { paymentLinkId: "p1", months: 12, amount: 48000, position: 0 } });
    expect(tx.membershipPeriod.update).toHaveBeenCalledWith({ where: { id: "m1" }, data: { amount: 5500, position: 1, archivedAt: null } });
  });

  it("archives a removed length that members used and deletes one nobody used", async () => {
    const tx = makeTx([
      { id: "m1", months: 1, amount: 5000, archivedAt: null },
      { id: "m3", months: 3, amount: 13500, archivedAt: null },
      { id: "m6", months: 6, amount: 25000, archivedAt: null },
    ], ["m3"]);
    await syncMembershipPeriods(tx as never, "p1", [{ months: 1, amount: 5000 }]);
    expect(tx.membershipPeriod.update).toHaveBeenCalledWith({ where: { id: "m3" }, data: { archivedAt: expect.any(Date) } });
    expect(tx.membershipPeriod.delete).toHaveBeenCalledWith({ where: { id: "m6" } });
  });

  it("brings an archived length back when the owner offers it again", async () => {
    const tx = makeTx([{ id: "m3", months: 3, amount: 13500, archivedAt: new Date("2026-10-01") }]);
    await syncMembershipPeriods(tx as never, "p1", [{ months: 3, amount: 14000 }]);
    expect(tx.membershipPeriod.update).toHaveBeenCalledWith({ where: { id: "m3" }, data: { amount: 14000, position: 0, archivedAt: null } });
    expect(tx.membershipPeriod.create).not.toHaveBeenCalled();
  });
});
```

Add to `apps/api/src/payment-links/payment-links.service.spec.ts`, reusing that file's existing service/prisma factory (read its top first). Make sure the mock prisma has `membershipPeriod: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn(), update: jest.fn(), delete: jest.fn() }`, `customerSubscription: { count: jest.fn().mockResolvedValue(0) }`, and a `$transaction` that runs callbacks with the same mock. Then:

```ts
describe("membership products", () => {
  it("creates a membership with its periods and the cheapest period as the product price", async () => {
    await service.create("merchant_1", "store_1", { name: "Club del café", amount: 0, fulfillmentType: "MEMBERSHIP", membershipPeriods: [{ months: 12, amount: 48000 }, { months: 1, amount: 5000 }] } as never);
    expect(prisma.paymentLink.create).toHaveBeenCalledWith({ data: expect.objectContaining({ fulfillmentType: "MEMBERSHIP", amount: 5000, stock: null, variants: [], extras: [] }) });
    expect(prisma.membershipPeriod.create).toHaveBeenCalledTimes(2);
  });

  it("rejects a membership without periods, or with options", async () => {
    await expect(service.create("merchant_1", "store_1", { name: "Club", amount: 0, fulfillmentType: "MEMBERSHIP" } as never)).rejects.toThrow("Indica de uno a cuatro períodos");
    await expect(service.create("merchant_1", "store_1", { name: "Club", amount: 0, fulfillmentType: "MEMBERSHIP", membershipPeriods: [{ months: 1, amount: 5000 }], variants: [{ name: "A", amount: 1 }] } as never)).rejects.toThrow("Las membresías no tienen opciones ni extras.");
  });

  it("refuses to change the type of a membership that has members", async () => {
    prisma.paymentLink.findFirst.mockResolvedValue({ id: "p1", storeId: "store_1", fulfillmentType: "MEMBERSHIP", variants: [], extras: [], imageUrls: [], imagePositions: [], contentBlocks: [] });
    prisma.customerSubscription.count.mockResolvedValue(3);
    await expect(service.update("merchant_1", "store_1", "p1", { fulfillmentType: "PHYSICAL" } as never)).rejects.toThrow("Esta membresía ya tiene miembros");
  });

  it("resyncs periods and the shown price on update", async () => {
    prisma.paymentLink.findFirst.mockResolvedValue({ id: "p1", storeId: "store_1", fulfillmentType: "MEMBERSHIP", variants: [], extras: [], imageUrls: [], imagePositions: [], contentBlocks: [] });
    await service.update("merchant_1", "store_1", "p1", { membershipPeriods: [{ months: 3, amount: 13500 }] } as never);
    expect(prisma.paymentLink.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ amount: 13500 }) }));
    expect(prisma.membershipPeriod.create).toHaveBeenCalledWith({ data: { paymentLinkId: "p1", months: 3, amount: 13500, position: 0 } });
  });
});
```

(If the spec's factory variable names differ from `service`/`prisma`, use its names; keep the assertions.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/api && npx jest src/payment-links/membership-periods.spec.ts src/payment-links/payment-links.service.spec.ts -t "membership"`
Expected: FAIL — module `./membership-periods` not found; create ignores `fulfillmentType`.

- [ ] **Step 3: Implement `membership-periods.ts`**

```ts
import { BadRequestException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { normalizeMembershipPeriods, type MembershipPeriodInput } from "../memberships/membership-rules";

/** Fields a membership product always has: nothing to ship, no stock, no options (spec 2026-10-09 §1). */
export const MEMBERSHIP_PRODUCT_FIELDS = {
  fulfillmentType: "MEMBERSHIP", stock: null, shippingWeightGrams: 0,
  variants: [] as unknown as Prisma.InputJsonValue, extras: [] as unknown as Prisma.InputJsonValue,
};

/** Validates the request side of a membership edit; returns the periods to save, or null when none were sent. */
export function membershipRequest(dto: { membershipPeriods?: unknown; variants?: unknown[]; extras?: unknown[] }, required: boolean): MembershipPeriodInput[] | null {
  if (dto.variants?.length || dto.extras?.length) throw new BadRequestException("Las membresías no tienen opciones ni extras.");
  if (dto.membershipPeriods === undefined && !required) return null;
  return normalizeMembershipPeriods(dto.membershipPeriods);
}

export const cheapestPeriod = (periods: Array<{ amount: number }>) => Math.min(...periods.map(p => p.amount));

/** Call inside a transaction. Prices change for new members only; a removed length that any member used is archived. */
export async function syncMembershipPeriods(tx: Prisma.TransactionClient, paymentLinkId: string, periods: MembershipPeriodInput[]): Promise<void> {
  const existing = await tx.membershipPeriod.findMany({ where: { paymentLinkId } });
  for (const [position, period] of periods.entries()) {
    const row = existing.find(entry => entry.months === period.months);
    if (row) await tx.membershipPeriod.update({ where: { id: row.id }, data: { amount: period.amount, position, archivedAt: null } });
    else await tx.membershipPeriod.create({ data: { paymentLinkId, months: period.months, amount: period.amount, position } });
  }
  for (const row of existing) {
    if (row.archivedAt || periods.some(period => period.months === row.months)) continue;
    const used = await tx.customerSubscription.count({ where: { OR: [{ membershipPeriodId: row.id }, { pendingPeriodId: row.id }] } });
    if (used) await tx.membershipPeriod.update({ where: { id: row.id }, data: { archivedAt: new Date() } });
    else await tx.membershipPeriod.delete({ where: { id: row.id } });
  }
}
```

- [ ] **Step 4: Add the DTO fields**

In `dto/create-payment-link.dto.ts`, add a nested DTO above `CreatePaymentLinkDto` and two fields inside it. Reuse the file's existing `class-validator` / `class-transformer` / swagger imports and add any that are missing (`IsIn`, `IsArray`, `ArrayMinSize`, `ArrayMaxSize`, `ValidateNested`, `Type`, `IsInt`, `Min`, `Max`, `IsOptional`, `ApiProperty`, `ApiPropertyOptional`):

```ts
export class MembershipPeriodDto {
  @ApiProperty({ enum: [1, 3, 6, 12], description: "Length of one period in months." })
  @IsInt() @IsIn([1, 3, 6, 12])
  months!: number;

  @ApiProperty({ description: "Price of one period in minor units (centavos).", example: 5000 })
  @IsInt() @Min(1) @Max(2147483647)
  amount!: number;
}
```

```ts
  @ApiPropertyOptional({ enum: ["PHYSICAL", "MEMBERSHIP"], description: "MEMBERSHIP sells renewable periods (spec 2026-10-09). Digital products are set by uploading a file." })
  @IsOptional() @IsIn(["PHYSICAL", "MEMBERSHIP"])
  fulfillmentType?: "PHYSICAL" | "MEMBERSHIP";

  @ApiPropertyOptional({ type: [MembershipPeriodDto], description: "Required for memberships: 1–4 distinct lengths." })
  @IsOptional() @IsArray() @ArrayMinSize(1) @ArrayMaxSize(4)
  @ValidateNested({ each: true }) @Type(() => MembershipPeriodDto)
  membershipPeriods?: MembershipPeriodDto[];
```

- [ ] **Step 5: Wire `create`, `update`, `listForStore`**

In `payment-links.service.ts`, import:

```ts
import { cheapestPeriod, MEMBERSHIP_PRODUCT_FIELDS, membershipRequest, syncMembershipPeriods } from "./membership-periods";
```

In `create`, before `const variants = …`:

```ts
    const membershipPeriods = dto.fulfillmentType === "MEMBERSHIP" ? membershipRequest(dto, true)! : null;
```

Replace `const created = await this.prisma.paymentLink.create({ data: { … } });` by moving the existing object literal, unchanged, into `const data: Prisma.PaymentLinkUncheckedCreateInput = { … };` and then:

```ts
    const created = membershipPeriods
      ? await this.prisma.$transaction(async (tx) => {
        const row = await tx.paymentLink.create({ data: { ...data, ...MEMBERSHIP_PRODUCT_FIELDS, amount: cheapestPeriod(membershipPeriods) } });
        await syncMembershipPeriods(tx, row.id, membershipPeriods);
        return row;
      })
      : await this.prisma.paymentLink.create({ data });
```

In `update`, right after the `if (!link) throw …` line:

```ts
    const targetType = dto.fulfillmentType ?? link.fulfillmentType;
    if (targetType !== link.fulfillmentType) {
      if (link.fulfillmentType === "DIGITAL") throw new BadRequestException("Archiva el producto digital para conservar los archivos de pedidos pagados.");
      if (link.fulfillmentType === "MEMBERSHIP" && await this.prisma.customerSubscription.count({ where: { paymentLinkId: id, membershipPeriodId: { not: null } } })) {
        throw new BadRequestException("Esta membresía ya tiene miembros; no puede cambiar de tipo.");
      }
    }
    const membershipPeriods = targetType === "MEMBERSHIP" ? membershipRequest(dto, link.fulfillmentType !== "MEMBERSHIP") : null;
```

Replace `const updated = await this.prisma.paymentLink.update({ where: { id }, data: { … } });` by moving the existing object literal, unchanged, into `const data: Prisma.PaymentLinkUncheckedUpdateInput = { … };` and then:

```ts
    const updated = targetType === "MEMBERSHIP"
      ? await this.prisma.$transaction(async (tx) => {
        if (membershipPeriods) await syncMembershipPeriods(tx, id, membershipPeriods);
        const active = membershipPeriods ?? (await tx.membershipPeriod.findMany({ where: { paymentLinkId: id, archivedAt: null } }));
        return tx.paymentLink.update({ where: { id }, data: { ...data, ...MEMBERSHIP_PRODUCT_FIELDS, ...(active.length ? { amount: cheapestPeriod(active) } : {}) } });
      })
      : await this.prisma.paymentLink.update({ where: { id }, data: { ...data, ...(dto.fulfillmentType === "PHYSICAL" && link.fulfillmentType === "MEMBERSHIP" ? { fulfillmentType: "PHYSICAL" } : {}) } });
```

Replace `listForStore`'s return:

```ts
    return this.prisma.paymentLink.findMany({
      where: { storeId }, orderBy: { createdAt: "desc" },
      include: { membershipPeriods: { where: { archivedAt: null }, orderBy: { position: "asc" }, select: { id: true, months: true, amount: true, position: true } } },
    });
```

- [ ] **Step 6: Run tests**

Run: `cd apps/api && npx jest src/payment-links`
Expected: PASS (all payment-links suites).

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/payment-links/membership-periods.ts apps/api/src/payment-links/membership-periods.spec.ts apps/api/src/payment-links/dto/create-payment-link.dto.ts apps/api/src/payment-links/payment-links.service.ts apps/api/src/payment-links/payment-links.service.spec.ts
git commit -m "feat(memberships): owner API creates and edits membership products with priced periods"
```

---

### Task 4: Public catalog data and the cart guard

**Files:**
- Modify: `apps/api/src/stores/public-stores.service.ts` (item serialization + the items query's `include`)
- Modify: `apps/api/src/stores/store-checkout.service.ts` (`createCartCheckout`)
- Modify: `apps/api/src/payment-links/payment-links.service.ts` (`listPublicSubscriptions`, `updateSubscriptions`)
- Test: `apps/api/src/stores/store-checkout.service.spec.ts`, `apps/api/src/stores/public-stores.service.spec.ts` (existing files; add cases)

**Interfaces:**
- Produces: public items gain `membershipPeriods: { id: string; months: number; amount: number }[]` (empty for non-memberships); memberships always have `subscriptionOptions: []`.
- Cart checkout error text, verbatim: `Las membresías se compran con «Hacerme miembro», no en el carrito.`

- [ ] **Step 1: Write the failing tests**

In `store-checkout.service.spec.ts` (reuse its existing factory that mocks the store lookup and `paymentLink.findMany`):

```ts
  it("refuses a membership product in a cart, even from a saved cart", async () => {
    prisma.paymentLink.findMany.mockResolvedValue([{ id: "club", storeId: "store_1", status: "ACTIVE", fulfillmentType: "MEMBERSHIP", name: "Club", amount: 5000, currency: "BOB", variants: [], extras: [], stock: null }]);
    await expect(service.createCartCheckout("cafe", { items: [{ paymentLinkId: "club", quantity: 1 }] } as never)).rejects.toThrow("Las membresías se compran con «Hacerme miembro», no en el carrito.");
  });
```

In `public-stores.service.spec.ts` (reuse its store fixture builder; give one item `id: "club"`, `fulfillmentType: "MEMBERSHIP"`, `membershipPeriods: [{ id: "m1", months: 1, amount: 5000 }]`, `subscriptionOptions: [{ cadence: "MONTHLY", discountPercent: 5 }]`, and the store `subscriptionsEnabled: true`):

```ts
  it("publishes a membership's active periods and never subscription options for it", async () => {
    const result = await service.findActiveBySlugPublic("cafe");
    const club = result.items.find((item: any) => item.id === "club");
    expect(club.membershipPeriods).toEqual([{ id: "m1", months: 1, amount: 5000 }]);
    expect(club.subscriptionOptions).toEqual([]);
  });
```

(Use the public method in that file that returns `items` — the serialization block `items: items.map((item) => ({` lives in it.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/api && npx jest src/stores/store-checkout.service.spec.ts src/stores/public-stores.service.spec.ts -t "membership"`
Expected: FAIL.

- [ ] **Step 3: Implement**

In `createCartCheckout`, right after the `if (links.length !== quantityByLinkId.size) { … }` block:

```ts
    if (links.some(link => link.fulfillmentType === "MEMBERSHIP")) throw new BadRequestException("Las membresías se compran con «Hacerme miembro», no en el carrito.");
```

In `public-stores.service.ts`, add to the items query's `include` (next to `subscriptionOptions`):

```ts
          membershipPeriods: { where: { archivedAt: null }, orderBy: { position: "asc" }, select: { id: true, months: true, amount: true } },
```

and in the item serialization replace the `subscriptionOptions` line with:

```ts
        subscriptionOptions: store.subscriptionsEnabled && item.fulfillmentType !== "DIGITAL" && item.fulfillmentType !== "MEMBERSHIP" ? item.subscriptionOptions : [],
        membershipPeriods: item.fulfillmentType === "MEMBERSHIP" ? item.membershipPeriods : [],
```

In `payment-links.service.ts`: in `listPublicSubscriptions` change `fulfillmentType: { not: "DIGITAL" }` to `fulfillmentType: { notIn: ["DIGITAL", "MEMBERSHIP"] }`; in `updateSubscriptions`, after `ownedStoreOrThrow`:

```ts
    const product = await this.prisma.paymentLink.findFirst({ where: { id, storeId }, select: { fulfillmentType: true } });
    if (product?.fulfillmentType === "MEMBERSHIP") throw new BadRequestException("Las membresías ya se renuevan por período; no usan Suscríbete y ahorra.");
```

- [ ] **Step 4: Run tests**

Run: `cd apps/api && npx jest src/stores src/payment-links`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/stores/public-stores.service.ts apps/api/src/stores/store-checkout.service.ts apps/api/src/payment-links/payment-links.service.ts apps/api/src/stores/store-checkout.service.spec.ts apps/api/src/stores/public-stores.service.spec.ts
git commit -m "feat(memberships): publish membership periods; carts and Subscribe & Save refuse memberships"
```

---

### Task 5: Membership checkout API (join and list)

**Files:**
- Create: `apps/api/src/memberships/memberships.service.ts`
- Create: `apps/api/src/memberships/memberships.controller.ts`
- Create: `apps/api/src/memberships/memberships.module.ts`
- Create: `apps/api/src/memberships/dto/join-membership.dto.ts`
- Create: `apps/api/src/memberships/memberships.service.spec.ts`
- Modify: `apps/api/src/app.module.ts` (import `MembershipsModule`)

**Interfaces:**
- Consumes: `StoreCustomersService.authenticate(slug, token): Promise<CustomerProfile>` (`{ id, storeId, email, name, phone, … }`), `PaymentIntentsService.createInTransaction(tx, merchantId, livemode, input)`, `findActiveStoreBySlug(prisma, slug)` (`apps/api/src/stores/active-store.ts`), `paymentCheckoutUrl(config, clientSecret)` (`operations-helpers.ts`), Task 2 rules.
- Produces:
  - `POST v1/stores/public/:slug/customers/me/memberships` body `{ productId: string; periodId: string; consent: true }` → `{ checkoutUrl: string }`; 409 body `{ code: "ALREADY_MEMBER", message, accessUntil }`.
  - `GET v1/stores/public/:slug/customers/me/memberships` → `MemberView[]`:
    ```ts
    type MemberView = { id: string; productId: string; name: string; state: MembershipState; stateLabel: string;
      accessUntil: string | null; nextBillingAt: string | null; amount: number; currency: string;
      period: { id: string; months: number; label: string } | null; pendingPeriod: { id: string; months: number; label: string } | null;
      periods: Array<{ id: string; months: number; amount: number; label: string }>; renewalUrl: string | null };
    ```
  - Intent metadata: `{ storeId, cart: [{ paymentLinkId, name, quantity: 1, unitAmount }], membership: { productId, periodId, storeCustomerId, consentText, consentAt } }`.
  - `MembershipsService.bearer(header?: string): string` (strips `Bearer `).

- [ ] **Step 1: Write the failing tests**

`apps/api/src/memberships/memberships.service.spec.ts`:

```ts
import { ConflictException } from "@nestjs/common";
import { MembershipsService } from "./memberships.service";

const store = { id: "store_1", slug: "cafe", name: "Café Norte", merchantId: "merchant_1", status: "ACTIVE", checkoutMode: "payment", membershipGraceDays: 7, sourcePublicationPaused: false };
function setup() {
  const prisma: any = {
    store: { findFirst: jest.fn().mockResolvedValue(store), findUnique: jest.fn().mockResolvedValue(store) },
    merchant: { findUniqueOrThrow: jest.fn().mockResolvedValue({ status: "ACTIVE" }) },
    paymentLink: { findFirst: jest.fn().mockResolvedValue({ id: "club", name: "Club del café", currency: "BOB", fulfillmentType: "MEMBERSHIP" }) },
    membershipPeriod: { findFirst: jest.fn().mockResolvedValue({ id: "m1", paymentLinkId: "club", months: 1, amount: 5000 }), findMany: jest.fn().mockResolvedValue([]) },
    customerSubscription: { findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]) },
    subscriptionInvoice: { findMany: jest.fn().mockResolvedValue([]) },
    paymentIntent: { findMany: jest.fn().mockResolvedValue([]) },
    storeOrder: { create: jest.fn().mockResolvedValue({ id: "order_1" }) },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation((callback: (tx: unknown) => unknown) => callback(prisma));
  const customers = { authenticate: jest.fn().mockResolvedValue({ id: "cust_1", storeId: "store_1", email: "ana@mail.com", name: "Ana", phone: null }) };
  const paymentIntents = { createInTransaction: jest.fn().mockResolvedValue({ id: "pi_1", clientSecret: "pi_1_secret" }) };
  const config = { get: (key: string) => (key === "app.checkoutOrigin" ? "https://pagar.test" : undefined) };
  return { prisma, customers, paymentIntents, service: new MembershipsService(prisma, customers as never, paymentIntents as never, config as never) };
}

describe("MembershipsService.startJoin", () => {
  it("creates one intent and an order with nothing to ship, priced from the database", async () => {
    const { service, paymentIntents, prisma } = setup();
    const result = await service.startJoin("cafe", "token", { productId: "club", periodId: "m1", consent: true });
    expect(paymentIntents.createInTransaction).toHaveBeenCalledWith(expect.anything(), "merchant_1", true, expect.objectContaining({
      amount: 5000, currency: "BOB", customerEmail: "ana@mail.com",
      metadata: expect.objectContaining({
        cart: [{ paymentLinkId: "club", name: "Club del café · Mensual", quantity: 1, unitAmount: 5000 }],
        membership: expect.objectContaining({ productId: "club", periodId: "m1", storeCustomerId: "cust_1", consentText: expect.stringContaining("no se cobra nada automáticamente") }),
      }),
    }));
    expect(prisma.storeOrder.create.mock.calls[0][0].data).not.toHaveProperty("fulfillmentMethod");
    expect(result).toEqual({ checkoutUrl: "https://pagar.test/#client_secret=pi_1_secret" });
  });

  it("answers 'Ya eres miembro' while the account still has access", async () => {
    const { service, prisma } = setup();
    prisma.customerSubscription.findFirst.mockResolvedValue({ status: "CANCELED", accessUntil: new Date(Date.now() + 5 * 86400000) });
    await expect(service.startJoin("cafe", "token", { productId: "club", periodId: "m1", consent: true })).rejects.toBeInstanceOf(ConflictException);
  });

  it("lets a lapsed member rejoin", async () => {
    const { service, prisma, paymentIntents } = setup();
    prisma.customerSubscription.findFirst.mockResolvedValue({ status: "LAPSED", accessUntil: new Date(Date.now() - 20 * 86400000) });
    await service.startJoin("cafe", "token", { productId: "club", periodId: "m1", consent: true });
    expect(paymentIntents.createInTransaction).toHaveBeenCalled();
  });

  it("refuses a missing consent, an archived period and a store without integrated payments", async () => {
    const { service, prisma } = setup();
    await expect(service.startJoin("cafe", "token", { productId: "club", periodId: "m1", consent: false as never })).rejects.toThrow("Acepta las condiciones de la membresía para continuar.");
    prisma.membershipPeriod.findFirst.mockResolvedValue(null);
    await expect(service.startJoin("cafe", "token", { productId: "club", periodId: "m1", consent: true })).rejects.toThrow("Elige un período disponible.");
    prisma.store.findFirst.mockResolvedValue({ ...store, checkoutMode: "whatsapp" });
    prisma.store.findUnique.mockResolvedValue({ ...store, checkoutMode: "whatsapp" });
    await expect(service.startJoin("cafe", "token", { productId: "club", periodId: "m1", consent: true })).rejects.toThrow("Esta tienda no tiene habilitados los pagos integrados");
  });
});

describe("MembershipsService.list", () => {
  it("shows state, dates, the open renewal link and the periods the member can switch to", async () => {
    const { service, prisma } = setup();
    const accessUntil = new Date(Date.now() + 3 * 86400000);
    prisma.customerSubscription.findMany.mockResolvedValue([{ id: "sub_1", paymentLinkId: "club", itemName: "Club del café", status: "ACTIVE", accessUntil, nextBillingAt: new Date(accessUntil.getTime() + 30 * 86400000), unitAmount: 5000, currency: "BOB", membershipPeriodId: "m1", pendingPeriodId: null }]);
    prisma.membershipPeriod.findMany.mockResolvedValue([{ id: "m1", paymentLinkId: "club", months: 1, amount: 5000, archivedAt: null, position: 0 }, { id: "m12", paymentLinkId: "club", months: 12, amount: 48000, archivedAt: null, position: 1 }]);
    prisma.subscriptionInvoice.findMany.mockResolvedValue([{ subscriptionId: "sub_1", paymentIntentId: "pi_r1" }]);
    prisma.paymentIntent.findMany.mockResolvedValue([{ id: "pi_r1", clientSecret: "pi_r1_secret", status: "REQUIRES_PAYMENT_METHOD" }]);
    const [row] = await service.list("cafe", "token");
    expect(row).toEqual(expect.objectContaining({ state: "ACTIVE", stateLabel: "Activa", amount: 5000, renewalUrl: "https://pagar.test/#client_secret=pi_r1_secret" }));
    expect(row.periods.map((p: any) => p.label)).toEqual(["Mensual", "Anual"]);
  });
});
```

(If `findActiveStoreBySlug` reads a different prisma delegate than `store.findFirst` / `findUnique`, mock that one instead — check `apps/api/src/stores/active-store.ts`.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/api && npx jest src/memberships/memberships.service.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the DTO**

`apps/api/src/memberships/dto/join-membership.dto.ts`:

```ts
import { Equals, IsString, MaxLength } from "class-validator";

export class JoinMembershipDto {
  @IsString() @MaxLength(40) productId!: string;
  @IsString() @MaxLength(40) periodId!: string;
  @Equals(true, { message: "Acepta las condiciones de la membresía para continuar." }) consent!: true;
}
```

- [ ] **Step 4: Write the service**

`apps/api/src/memberships/memberships.service.ts`:

```ts
import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { MerchantStatus, OrderFulfillmentStatus, PaymentIntentStatus, PaymentLinkStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { StoreCustomersService } from "../store-customers/store-customers.service";
import { PaymentIntentsService } from "../payment-intents/payment-intents.service";
import { findActiveStoreBySlug } from "../stores/active-store";
import { paymentCheckoutUrl } from "../operations/operations-helpers";
import { blocksRejoin, MEMBERSHIP_CONSENT_TEXT, MEMBERSHIP_STATE_LABEL, membershipState, periodLabel, type MembershipState } from "./membership-rules";
import type { JoinMembershipDto } from "./dto/join-membership.dto";

export type MemberView = {
  id: string; productId: string; name: string; state: MembershipState; stateLabel: string;
  accessUntil: string | null; nextBillingAt: string | null; amount: number; currency: string;
  period: { id: string; months: number; label: string } | null; pendingPeriod: { id: string; months: number; label: string } | null;
  periods: Array<{ id: string; months: number; amount: number; label: string }>; renewalUrl: string | null;
};
const dayEs = (date: Date) => date.toLocaleDateString("es-BO", { day: "numeric", month: "long", year: "numeric" });

/** A shopper joining and managing memberships from their store account (spec 2026-10-09 §2). */
@Injectable()
export class MembershipsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly customers: StoreCustomersService,
    private readonly paymentIntents: PaymentIntentsService,
    private readonly config: ConfigService,
  ) {}

  bearer(header?: string): string { return typeof header === "string" ? header.replace(/^Bearer\s+/i, "") : ""; }

  async startJoin(slug: string, token: unknown, dto: JoinMembershipDto): Promise<{ checkoutUrl: string }> {
    const me = await this.customers.authenticate(slug, token);
    const store = await findActiveStoreBySlug(this.prisma, slug);
    if (store.checkoutMode !== "payment") throw new BadRequestException("Esta tienda no tiene habilitados los pagos integrados");
    if (dto.consent !== true) throw new BadRequestException("Acepta las condiciones de la membresía para continuar.");
    const product = await this.prisma.paymentLink.findFirst({ where: { id: dto.productId, storeId: store.id, status: PaymentLinkStatus.ACTIVE, fulfillmentType: "MEMBERSHIP" } });
    if (!product) throw new NotFoundException("Esta membresía ya no está disponible");
    const period = await this.prisma.membershipPeriod.findFirst({ where: { id: dto.periodId, paymentLinkId: product.id, archivedAt: null } });
    if (!period) throw new BadRequestException("Elige un período disponible.");
    const now = new Date();
    const current = await this.prisma.customerSubscription.findFirst({ where: { storeId: store.id, paymentLinkId: product.id, storeCustomerId: me.id, membershipPeriodId: { not: null } }, orderBy: { startedAt: "desc" } });
    if (current && blocksRejoin(current, store.membershipGraceDays, now)) {
      throw new ConflictException({ code: "ALREADY_MEMBER", message: `Ya eres miembro hasta el ${dayEs(current.accessUntil!)}.`, accessUntil: current.accessUntil!.toISOString() });
    }
    const merchant = await this.prisma.merchant.findUniqueOrThrow({ where: { id: store.merchantId } });
    const name = `${product.name} · ${periodLabel(period.months)}`;
    const line = { paymentLinkId: product.id, name, quantity: 1, unitAmount: period.amount };
    const intent = await this.prisma.$transaction(async (tx) => {
      const created = await this.paymentIntents.createInTransaction(tx, store.merchantId, merchant.status === MerchantStatus.ACTIVE, {
        amount: period.amount, currency: product.currency, description: `${name} · ${store.name}`.slice(0, 480),
        customerName: me.name, customerEmail: me.email, ...(me.phone ? { customerPhone: me.phone } : {}),
        metadata: { storeId: store.id, cart: [line], membership: { productId: product.id, periodId: period.id, storeCustomerId: me.id, consentText: MEMBERSHIP_CONSENT_TEXT, consentAt: now.toISOString() } },
      });
      await tx.storeOrder.create({ data: {
        paymentIntentId: created.id, merchantId: store.merchantId, storeId: store.id, storeName: store.name,
        items: [line], amount: period.amount, currency: product.currency,
        status: OrderFulfillmentStatus.AWAITING_PAYMENT, statusEvents: { create: { status: OrderFulfillmentStatus.AWAITING_PAYMENT } },
      } });
      return created;
    });
    return { checkoutUrl: paymentCheckoutUrl(this.config, intent.clientSecret) };
  }

  async list(slug: string, token: unknown): Promise<MemberView[]> {
    const me = await this.customers.authenticate(slug, token);
    const store = await findActiveStoreBySlug(this.prisma, slug);
    const rows = await this.prisma.customerSubscription.findMany({ where: { storeId: store.id, storeCustomerId: me.id, membershipPeriodId: { not: null } }, orderBy: { startedAt: "desc" }, take: 50 });
    if (!rows.length) return [];
    const productIds = [...new Set(rows.map(row => row.paymentLinkId!))];
    const periods = await this.prisma.membershipPeriod.findMany({ where: { paymentLinkId: { in: productIds } }, orderBy: { position: "asc" } });
    const open = await this.prisma.subscriptionInvoice.findMany({ where: { subscriptionId: { in: rows.map(row => row.id) }, status: "DUE", paymentIntentId: { not: null } } });
    const intents = open.length ? await this.prisma.paymentIntent.findMany({ where: { id: { in: open.map(invoice => invoice.paymentIntentId!) } }, select: { id: true, clientSecret: true, status: true } }) : [];
    const now = new Date();
    const view = (id: string | null) => { const p = periods.find(entry => entry.id === id); return p ? { id: p.id, months: p.months, label: periodLabel(p.months) } : null; };
    return rows.map(row => {
      const state = membershipState(row, store.membershipGraceDays, now);
      const invoice = open.find(entry => entry.subscriptionId === row.id);
      const intent = invoice && intents.find(entry => entry.id === invoice.paymentIntentId);
      const payable = !!intent && intent.status !== PaymentIntentStatus.SUCCEEDED && intent.status !== PaymentIntentStatus.CANCELED;
      return {
        id: row.id, productId: row.paymentLinkId!, name: row.itemName ?? "Membresía", state, stateLabel: MEMBERSHIP_STATE_LABEL[state],
        accessUntil: row.accessUntil?.toISOString() ?? null, nextBillingAt: row.status === "ACTIVE" ? row.nextBillingAt.toISOString() : null,
        amount: row.unitAmount ?? 0, currency: row.currency ?? "BOB",
        period: view(row.membershipPeriodId), pendingPeriod: view(row.pendingPeriodId),
        periods: periods.filter(p => p.paymentLinkId === row.paymentLinkId && !p.archivedAt).map(p => ({ id: p.id, months: p.months, amount: p.amount, label: periodLabel(p.months) })),
        renewalUrl: payable ? paymentCheckoutUrl(this.config, intent!.clientSecret) : null,
      };
    });
  }
}
```

- [ ] **Step 5: Controller and module**

`apps/api/src/memberships/memberships.controller.ts` (same throttle/header style as `store-customers.controller.ts`; read that file's imports and copy them):

```ts
import { Body, Controller, Get, Header, Headers, Param, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { JoinMembershipDto } from "./dto/join-membership.dto";
import { MembershipsService } from "./memberships.service";

@Controller("v1/stores/public/:slug/customers/me/memberships")
export class MembershipsController {
  constructor(private readonly memberships: MembershipsService) {}

  @Get() @Header("Cache-Control", "no-store") @Throttle({ default: { limit: 60, ttl: 60_000 } })
  list(@Param("slug") slug: string, @Headers("authorization") auth?: string) { return this.memberships.list(slug, this.memberships.bearer(auth)); }

  @Post() @Header("Cache-Control", "no-store") @Throttle({ default: { limit: 10, ttl: 60_000 } })
  join(@Param("slug") slug: string, @Body() dto: JoinMembershipDto, @Headers("authorization") auth?: string) { return this.memberships.startJoin(slug, this.memberships.bearer(auth), dto); }
}
```

If `store-customers.controller.ts` reads the token through a decorator or helper instead of `@Headers("authorization")`, use that same mechanism here and drop `bearer()`.

`apps/api/src/memberships/memberships.module.ts`:

```ts
import { Module } from "@nestjs/common";
import { StoreCustomersModule } from "../store-customers/store-customers.module";
import { PaymentIntentsModule } from "../payment-intents/payment-intents.module";
import { MembershipsController } from "./memberships.controller";
import { MembershipsService } from "./memberships.service";

@Module({ imports: [StoreCustomersModule, PaymentIntentsModule], controllers: [MembershipsController], providers: [MembershipsService], exports: [MembershipsService] })
export class MembershipsModule {}
```

(If sibling modules import `PrismaModule` / `ConfigModule` explicitly, do the same.) Add `MembershipsModule` to the `imports` array of `apps/api/src/app.module.ts`.

- [ ] **Step 6: Run tests and typecheck**

Run: `cd apps/api && npx jest src/memberships && npx tsc --noEmit -p tsconfig.json`
Expected: PASS, no new type errors.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/memberships apps/api/src/app.module.ts
git commit -m "feat(memberships): account-tied join checkout and Mis membresías API"
```

---

### Task 6: Enrollment on payment

**Files:**
- Create: `apps/api/src/memberships/membership-enrollment.ts`
- Create: `apps/api/src/memberships/membership-enrollment.spec.ts`
- Modify: `apps/api/src/payment-intents/payment-intents.service.ts` (success branch, around the `createSubscriptionsFromOrder` and `applyRenewalPaid` calls)

**Interfaces:**
- Consumes: Task 2 rules; intent metadata from Task 5.
- Produces:
  - `applyMembershipJoin(tx, input: { intent: { id: string; currency: string; metadata: Prisma.JsonValue }; order: { id: string; storeId: string; merchantId: string }; checkoutOrigin: string; now?: Date }): Promise<{ emailBlock: string; duplicate: boolean }>`
  - `applyMembershipRenewalPaid(tx, paymentIntentId: string): Promise<void>`

- [ ] **Step 1: Write the failing tests**

`apps/api/src/memberships/membership-enrollment.spec.ts`:

```ts
import { applyMembershipJoin, applyMembershipRenewalPaid } from "./membership-enrollment";
import { membershipKey } from "./membership-rules";

const now = new Date("2027-01-31T15:00:00Z");
const order = { id: "order_1", storeId: "store_1", merchantId: "m1" };
const metadata = (extra: object = {}) => ({ storeId: "store_1", cart: [{ paymentLinkId: "club", name: "Club del café · Mensual", quantity: 1, unitAmount: 5000 }],
  membership: { productId: "club", periodId: "m1", storeCustomerId: "cust_1", consentText: "Cada período…", consentAt: now.toISOString() }, ...extra });
function makeTx() {
  return {
    $queryRaw: jest.fn().mockResolvedValue([{ id: "cust_1" }]),
    storeCustomer: { findUnique: jest.fn().mockResolvedValue({ id: "cust_1", storeId: "store_1", name: "Ana", email: "ana@mail.com", phone: null, deletedAt: null }) },
    store: { findUnique: jest.fn().mockResolvedValue({ id: "store_1", slug: "cafe", name: "Café Norte", membershipGraceDays: 7 }) },
    paymentLink: { findFirst: jest.fn().mockResolvedValue({ id: "club", name: "Club del café" }) },
    // archived and repriced since the buyer started: enrollment still honours the price paid
    membershipPeriod: { findUnique: jest.fn().mockResolvedValue({ id: "m1", paymentLinkId: "club", months: 1, amount: 5500, archivedAt: new Date("2027-01-20") }) },
    customerSubscription: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({}), update: jest.fn().mockResolvedValue({}), findUnique: jest.fn() },
    storeOrder: { findUnique: jest.fn().mockResolvedValue({ items: [{ name: "Club del café · Mensual", quantity: 1, unitAmount: 5000 }] }), update: jest.fn() },
    subscriptionInvoice: { findFirst: jest.fn() },
  };
}

describe("applyMembershipJoin", () => {
  it("creates the membership at the price paid, with access to the end of February", async () => {
    const tx = makeTx();
    const result = await applyMembershipJoin(tx as never, { intent: { id: "pi_1", currency: "BOB", metadata: metadata() }, order, checkoutOrigin: "https://pagar.test", now });
    expect(tx.$queryRaw).toHaveBeenCalled();
    expect(tx.customerSubscription.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      merchantId: "m1", storeId: "store_1", paymentLinkId: "club", storeCustomerId: "cust_1", membershipPeriodId: "m1",
      status: "ACTIVE", activeKey: membershipKey("store_1", "club", "cust_1"), unitAmount: 5000, quantity: 1,
      accessUntil: new Date("2027-02-28T15:00:00Z"), nextBillingAt: new Date("2027-02-28T15:00:00Z"),
      customerEmail: "ana@mail.com", sourceOrderId: "order_1", consentText: "Cada período…",
    }) });
    expect(result.emailBlock).toContain("Membresía: Club del café · Mensual");
    expect(result.emailBlock).toContain("https://pagar.test/cuenta/cafe/membresias");
    expect(result.emailBlock).toContain("no se cobra nada automáticamente");
  });

  it("reactivates the same row for a lapsed member", async () => {
    const tx = makeTx();
    tx.customerSubscription.findFirst.mockResolvedValue({ id: "sub_old", status: "LAPSED", accessUntil: new Date("2026-11-01T00:00:00Z") });
    await applyMembershipJoin(tx as never, { intent: { id: "pi_1", currency: "BOB", metadata: metadata() }, order, checkoutOrigin: "https://pagar.test", now });
    expect(tx.customerSubscription.update).toHaveBeenCalledWith({ where: { id: "sub_old" }, data: expect.objectContaining({ status: "ACTIVE", canceledAt: null, missedCount: 0, accessUntil: new Date("2027-02-28T15:00:00Z") }) });
    expect(tx.customerSubscription.create).not.toHaveBeenCalled();
  });

  it("records a second payment by a current member as a duplicate instead of a second membership", async () => {
    const tx = makeTx();
    tx.customerSubscription.findFirst.mockResolvedValue({ id: "sub_1", status: "ACTIVE", accessUntil: new Date("2027-02-15T00:00:00Z") });
    const result = await applyMembershipJoin(tx as never, { intent: { id: "pi_2", currency: "BOB", metadata: metadata() }, order, checkoutOrigin: "https://pagar.test", now });
    expect(result.duplicate).toBe(true);
    expect(tx.customerSubscription.create).not.toHaveBeenCalled();
    expect(tx.storeOrder.update).toHaveBeenCalledWith({ where: { id: "order_1" }, data: { items: [expect.objectContaining({ name: "Club del café · Mensual · pago duplicado (ya era miembro)" })] } });
    expect(result.emailBlock).toContain("Ya eras miembro");
  });

  it("does nothing for an intent without membership metadata, or a deleted account", async () => {
    const tx = makeTx();
    await expect(applyMembershipJoin(tx as never, { intent: { id: "pi", currency: "BOB", metadata: { cart: [] } }, order, checkoutOrigin: "x" })).resolves.toEqual({ emailBlock: "", duplicate: false });
    tx.storeCustomer.findUnique.mockResolvedValue({ id: "cust_1", storeId: "store_1", deletedAt: new Date() });
    await expect(applyMembershipJoin(tx as never, { intent: { id: "pi", currency: "BOB", metadata: metadata() }, order, checkoutOrigin: "x" })).resolves.toEqual({ emailBlock: "", duplicate: false });
    expect(tx.customerSubscription.create).not.toHaveBeenCalled();
  });
});

describe("applyMembershipRenewalPaid", () => {
  it("extends access by one period from the renewal's period start", async () => {
    const tx = makeTx();
    tx.subscriptionInvoice.findFirst.mockResolvedValue({ subscriptionId: "sub_1", periodStart: new Date("2027-02-28T15:00:00Z") });
    tx.customerSubscription.findUnique.mockResolvedValue({ id: "sub_1", membershipPeriodId: "m1", accessUntil: new Date("2027-02-28T15:00:00Z") });
    await applyMembershipRenewalPaid(tx as never, "pi_r1");
    expect(tx.customerSubscription.update).toHaveBeenCalledWith({ where: { id: "sub_1" }, data: { accessUntil: new Date("2027-03-28T15:00:00Z"), missedCount: 0 } });
  });
  it("ignores product subscriptions", async () => {
    const tx = makeTx();
    tx.subscriptionInvoice.findFirst.mockResolvedValue({ subscriptionId: "sub_p", periodStart: now });
    tx.customerSubscription.findUnique.mockResolvedValue({ id: "sub_p", membershipPeriodId: null, accessUntil: null });
    await applyMembershipRenewalPaid(tx as never, "pi_r1");
    expect(tx.customerSubscription.update).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/api && npx jest src/memberships/membership-enrollment.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `membership-enrollment.ts`**

```ts
import { Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { accessAfterPayment, blocksRejoin, membershipKey, periodLabel } from "./membership-rules";

/**
 * Runs inside the payment's success transaction, like createSubscriptionsFromOrder: it validates instead of throwing,
 * because a failed statement would abort the payment. The buyer's StoreCustomer row is locked first, so two payments
 * for the same account are serialized and the second one becomes a recorded duplicate.
 */
const logger = new Logger("MembershipEnrollment");
const NONE = { emailBlock: "", duplicate: false };
const objectOf = (value: unknown): Record<string, unknown> => (value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {});
const text = (value: unknown) => (typeof value === "string" && value.length <= 200 ? value : "");
const dayEs = (date: Date) => date.toLocaleDateString("es-BO", { day: "numeric", month: "long", year: "numeric", timeZone: "America/La_Paz" });

export type MembershipJoinInput = {
  intent: { id: string; currency: string; metadata: Prisma.JsonValue };
  order: { id: string; storeId: string; merchantId: string };
  checkoutOrigin: string;
  now?: Date;
};

export async function applyMembershipJoin(tx: Prisma.TransactionClient, input: MembershipJoinInput): Promise<{ emailBlock: string; duplicate: boolean }> {
  const metadata = objectOf(input.intent.metadata);
  const membership = objectOf(metadata.membership);
  const productId = text(membership.productId), periodId = text(membership.periodId), storeCustomerId = text(membership.storeCustomerId);
  if (!productId || !periodId || !storeCustomerId) return NONE;
  const now = input.now ?? new Date();
  await tx.$queryRaw`SELECT id FROM "StoreCustomer" WHERE id = ${storeCustomerId} FOR UPDATE`;
  const [customer, store, product, period] = await Promise.all([
    tx.storeCustomer.findUnique({ where: { id: storeCustomerId } }),
    tx.store.findUnique({ where: { id: input.order.storeId }, select: { id: true, slug: true, name: true, membershipGraceDays: true } }),
    tx.paymentLink.findFirst({ where: { id: productId, storeId: input.order.storeId }, select: { id: true, name: true } }),
    tx.membershipPeriod.findUnique({ where: { id: periodId } }),
  ]);
  const line = objectOf((Array.isArray(metadata.cart) ? metadata.cart : [])[0]);
  const unitAmount = Number(line.unitAmount);
  if (!customer || customer.deletedAt || customer.storeId !== input.order.storeId || !store || !product || !period || period.paymentLinkId !== product.id
    || !Number.isSafeInteger(unitAmount) || unitAmount <= 0) {
    logger.warn(`Skipped membership enrollment on ${input.intent.id}`);
    return NONE;
  }
  const accountUrl = `${input.checkoutOrigin.replace(/\/$/, "")}/cuenta/${encodeURIComponent(store.slug)}/membresias`;
  const existing = await tx.customerSubscription.findFirst({ where: { storeId: store.id, paymentLinkId: product.id, storeCustomerId, membershipPeriodId: { not: null } }, orderBy: { startedAt: "desc" } });
  if (existing && blocksRejoin(existing, store.membershipGraceDays, now)) {
    const placed = await tx.storeOrder.findUnique({ where: { id: input.order.id }, select: { items: true } });
    const items = Array.isArray(placed?.items) ? (placed!.items as unknown[]).map(item => ({ ...objectOf(item), name: `${String(objectOf(item).name ?? product.name)} · pago duplicado (ya era miembro)` })) : [];
    if (items.length) await tx.storeOrder.update({ where: { id: input.order.id }, data: { items: items as Prisma.InputJsonValue } });
    logger.warn(`Duplicate membership payment ${input.intent.id} for ${existing.id}`);
    return { duplicate: true, emailBlock: `Ya eras miembro de ${product.name} hasta el ${dayEs(existing.accessUntil!)}. Este pago quedó registrado y ${store.name} puede devolvértelo.` };
  }
  const accessUntil = accessAfterPayment(now, period.months, null);
  const data = {
    status: "ACTIVE", activeKey: membershipKey(store.id, product.id, storeCustomerId), membershipPeriodId: period.id, pendingPeriodId: null,
    unitAmount, quantity: 1, currency: input.intent.currency, itemName: product.name, accessUntil, nextBillingAt: accessUntil,
    canceledAt: null, pausedAt: null, missedCount: 0, sourceOrderId: input.order.id,
    customerName: customer.name, customerEmail: customer.email, customerPhone: customer.phone,
    consentText: text(membership.consentText) || null, consentAt: now,
  };
  if (existing) await tx.customerSubscription.update({ where: { id: existing.id }, data });
  else await tx.customerSubscription.create({ data: { ...data, merchantId: input.order.merchantId, storeId: store.id, paymentLinkId: product.id, storeCustomerId, startedAt: now } });
  return {
    duplicate: false,
    emailBlock: `Membresía: ${product.name} · ${periodLabel(period.months)}\nActiva hasta: ${dayEs(accessUntil)}\nAntes de cada vencimiento te enviaremos un enlace para renovar; no se cobra nada automáticamente.\nAdministra tu membresía en tu cuenta: ${accountUrl}`,
  };
}

/** A membership renewal was paid: access runs one more period from where the paid period started. Never throws. */
export async function applyMembershipRenewalPaid(tx: Prisma.TransactionClient, paymentIntentId: string): Promise<void> {
  const invoice = await tx.subscriptionInvoice.findFirst({ where: { paymentIntentId, status: "PAID" }, select: { subscriptionId: true, periodStart: true } });
  if (!invoice) return;
  const subscription = await tx.customerSubscription.findUnique({ where: { id: invoice.subscriptionId }, select: { id: true, membershipPeriodId: true, accessUntil: true } });
  if (!subscription?.membershipPeriodId) return;
  const period = await tx.membershipPeriod.findUnique({ where: { id: subscription.membershipPeriodId }, select: { months: true } });
  if (!period) return;
  await tx.customerSubscription.update({ where: { id: subscription.id }, data: { accessUntil: accessAfterPayment(invoice.periodStart, period.months, subscription.accessUntil), missedCount: 0 } });
}
```

(The renewal test's `membershipPeriod.findUnique` mock returns `months: 1` for any id, which is what the extension needs.)

- [ ] **Step 4: Hook into the payment success path**

In `payment-intents.service.ts`, import:

```ts
import { applyMembershipJoin, applyMembershipRenewalPaid } from "../memberships/membership-enrollment";
```

Right after `subscriptionBlock = enrollment?.emailBlock ?? "";` add:

```ts
        const membership = order && typeof tx.membershipPeriod?.findUnique === "function" ? await applyMembershipJoin(tx, {
          intent: { id: updated.id, currency: updated.currency, metadata: updated.metadata },
          order: { id: order.id, storeId: order.storeId, merchantId: order.merchantId },
          checkoutOrigin: this.config?.get<string>('app.checkoutOrigin') ?? 'http://localhost:5174',
        }) : null;
        if (membership?.emailBlock) subscriptionBlock = [subscriptionBlock, membership.emailBlock].filter(Boolean).join("\n\n");
```

In the `queueStoreEmail(tx, order.storeId, 'ORDER_CONFIRMATION', …)` details string, replace `${enrollment?.emailBlock ? `\n\n${enrollment.emailBlock}` : ''}` with `${subscriptionBlock ? `\n\n${subscriptionBlock}` : ''}`.

Right after the existing `applyRenewalPaid` line add:

```ts
        if (typeof tx.membershipPeriod?.findUnique === "function") await applyMembershipRenewalPaid(tx, paymentIntentId);
```

- [ ] **Step 5: Run tests**

Run: `cd apps/api && npx jest src/memberships src/payment-intents`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/memberships/membership-enrollment.ts apps/api/src/memberships/membership-enrollment.spec.ts apps/api/src/payment-intents/payment-intents.service.ts
git commit -m "feat(memberships): enroll, reactivate and extend members inside the payment transaction"
```

---

### Task 7: Renewal engine — membership branch, lapse and worker

**Files:**
- Modify: `apps/api/src/operations/subscription-pricing.ts` (`SubscriptionTerms`, `TermsSubscription`, `subscriptionTerms`)
- Modify: `apps/api/src/operations/subscriptions.service.ts` (`termsFor`, `generateSubscriptionInvoices`, `sendChargeNotice`, `expireMissedRenewals`, new `membershipPeriodsFor`, `endGoneMembership`, `expireLapsedMemberships`)
- Modify: `apps/api/src/operations/operations.worker.ts`
- Create: `apps/api/src/operations/membership-renewals.spec.ts`

**Interfaces:**
- Consumes: `membershipTermsPeriod`, `MEMBERSHIP_NOTICE_HOURS` (Task 2).
- Produces:
  - `SubscriptionTerms.membership: boolean` (false for every existing kind).
  - `subscriptionTerms(subscription, plan, now?, membershipPeriod?: { months: number; amount: number } | null)`.
  - `SubscriptionsService.membershipPeriodsFor(subscriptions): Promise<Map<string, { months: number; amount: number }>>` (public, reused by Task 9).
  - `SubscriptionsService.expireLapsedMemberships(merchantId, storeId): Promise<{ lapsed: number }>`.

- [ ] **Step 1: Write the failing tests**

`apps/api/src/operations/membership-renewals.spec.ts`:

```ts
import { SubscriptionsService } from "./subscriptions.service";

function makePrisma() {
  const prisma: any = {
    store: { findFirst: jest.fn().mockResolvedValue({ id: "store_1", merchantId: "merchant_1", name: "Café Norte", status: "ACTIVE", contactEmail: "tienda@mail.com", membershipGraceDays: 7 }) },
    merchant: { findUniqueOrThrow: jest.fn().mockResolvedValue({ status: "ACTIVE" }) },
    subscriptionPlan: { findFirst: jest.fn() },
    membershipPeriod: { findMany: jest.fn().mockResolvedValue([{ id: "m1", months: 1, amount: 5500 }, { id: "m12", months: 12, amount: 48000 }]) },
    customerSubscription: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn(), update: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    subscriptionInvoice: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn().mockResolvedValue(null), findFirst: jest.fn(), upsert: jest.fn(), update: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    paymentLink: { findFirst: jest.fn().mockResolvedValue({ id: "club", status: "ACTIVE", fulfillmentType: "MEMBERSHIP" }) },
    paymentIntent: { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    storeOrder: { create: jest.fn().mockResolvedValue({ id: "order_r1" }), findMany: jest.fn().mockResolvedValue([{ id: "order_1", paymentIntent: { livemode: true } }]), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    storeOrderStatusEvent: { create: jest.fn() },
    deliveryAssignment: { create: jest.fn() },
    $queryRaw: jest.fn().mockResolvedValue([{ paymentIntentId: null, orderId: null }]),
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation((callback: (tx: unknown) => unknown) => callback(prisma));
  return prisma;
}
const config = { get: (key: string) => (key === "app.orderTrackingSecret" ? "s" : "http://localhost:5174") };
const accessUntil = new Date(Date.now() + 96 * 3_600_000); // inside the 120 h notice window
const member = {
  id: "cm1mem0000000000000000001", merchantId: "merchant_1", storeId: "store_1", planId: null, paymentLinkId: "club", variantId: null, extraIds: [],
  itemName: "Club del café", quantity: 1, cadence: null, discountPercent: null, unitAmount: 5000, currency: "BOB", pendingUnitAmount: null, pendingFrom: null,
  fulfillment: null, customerName: "Ana", customerEmail: "ana@mail.com", customerPhone: null, status: "ACTIVE", missedCount: 0, amountOverride: null, nextAmountOverride: null,
  nextBillingAt: accessUntil, accessUntil, membershipPeriodId: "m1", pendingPeriodId: null, storeCustomerId: "cust_1", sourceOrderId: "order_1",
};

describe("membership renewals", () => {
  let prisma: any, paymentIntents: any, email: any, service: SubscriptionsService;
  beforeEach(() => {
    prisma = makePrisma();
    paymentIntents = { createInTransaction: jest.fn().mockResolvedValue({ id: "pi_r1", clientSecret: "pi_r1_secret" }), resolveStaleBanecoQr: jest.fn().mockResolvedValue("unpaid") };
    email = { send: jest.fn().mockResolvedValue(undefined) };
    service = new SubscriptionsService(prisma, email, paymentIntents, config as never);
    prisma.customerSubscription.findMany.mockResolvedValue([member]);
    prisma.subscriptionInvoice.upsert.mockResolvedValue({ id: "inv_1", periodStart: accessUntil, dueAt: accessUntil, amount: 5000, currency: "BOB" });
  });

  it("bills the locked price 5 days ahead with an order that ships nothing, and emails a membership notice", async () => {
    await service.generateSubscriptionInvoices("merchant_1", "store_1");
    expect(paymentIntents.createInTransaction).toHaveBeenCalledWith(expect.anything(), "merchant_1", true, expect.objectContaining({
      amount: 5000, metadata: expect.objectContaining({ cart: [expect.objectContaining({ paymentLinkId: "club", quantity: 1, unitAmount: 5000 })] }),
    }));
    expect(prisma.storeOrder.create.mock.calls[0][0].data).not.toHaveProperty("fulfillmentMethod");
    expect(prisma.deliveryAssignment.create).not.toHaveBeenCalled();
    const sent = email.send.mock.calls[0][0];
    expect(sent.subject).toContain("Tu membresía Club del café vence el");
    expect(sent.body).toContain("No se cobra nada automáticamente.");
    expect(sent.body).not.toContain("/suscripcion/");
  });

  it("waits until 5 days before accessUntil", async () => {
    prisma.customerSubscription.findMany.mockResolvedValue([{ ...member, nextBillingAt: new Date(Date.now() + 130 * 3_600_000) }]);
    await service.generateSubscriptionInvoices("merchant_1", "store_1");
    expect(paymentIntents.createInTransaction).not.toHaveBeenCalled();
  });

  it("applies a pending period switch when the renewal is created", async () => {
    prisma.customerSubscription.findMany.mockResolvedValue([{ ...member, pendingPeriodId: "m12" }]);
    prisma.subscriptionInvoice.upsert.mockResolvedValue({ id: "inv_1", periodStart: accessUntil, dueAt: accessUntil, amount: 48000, currency: "BOB" });
    await service.generateSubscriptionInvoices("merchant_1", "store_1");
    expect(prisma.subscriptionInvoice.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ amount: 48000 }) }));
    expect(prisma.customerSubscription.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ membershipPeriodId: "m12", unitAmount: 48000, pendingPeriodId: null }) }));
  });

  it("ends renewals when the owner archived the membership, keeping paid access", async () => {
    prisma.paymentLink.findFirst.mockResolvedValue(null);
    await service.generateSubscriptionInvoices("merchant_1", "store_1");
    expect(paymentIntents.createInTransaction).not.toHaveBeenCalled();
    expect(prisma.customerSubscription.updateMany).toHaveBeenCalledWith({ where: { id: member.id, status: "ACTIVE" }, data: expect.objectContaining({ status: "CANCELED", activeKey: null }) });
    expect(email.send.mock.calls[0][0].body).toContain("Tu acceso sigue hasta");
  });

  it("never sends a live renewal link for a membership joined in test mode", async () => {
    prisma.storeOrder.findMany.mockResolvedValue([{ id: "order_1", paymentIntent: { livemode: false } }]);
    await service.generateSubscriptionInvoices("merchant_1", "store_1");
    expect(paymentIntents.createInTransaction).not.toHaveBeenCalled();
  });

  it("lapses a member whose renewal is unpaid after the grace days and closes the link", async () => {
    prisma.subscriptionInvoice.findMany.mockResolvedValue([{ id: "inv_1", subscriptionId: member.id, merchantId: "merchant_1", storeId: "store_1", status: "DUE", paymentIntentId: "pi_r1", orderId: "order_r1", dueAt: new Date(Date.now() - 8 * 86_400_000) }]);
    prisma.customerSubscription.findMany.mockResolvedValue([member]);
    prisma.paymentIntent.findUnique.mockResolvedValue({ id: "pi_r1", status: "REQUIRES_PAYMENT_METHOD", railId: null, updatedAt: new Date() });
    const result = await service.expireLapsedMemberships("merchant_1", "store_1");
    expect(result).toEqual({ lapsed: 1 });
    expect(prisma.subscriptionInvoice.updateMany).toHaveBeenCalledWith({ where: { id: "inv_1", status: "DUE" }, data: { status: "MISSED" } });
    expect(prisma.customerSubscription.updateMany).toHaveBeenCalledWith({ where: { id: member.id, status: "ACTIVE" }, data: expect.objectContaining({ status: "LAPSED", activeKey: null }) });
    expect(email.send.mock.calls[0][0].body).toContain("puedes reactivarla cuando quieras");
  });

  it("leaves memberships out of the product-subscription missed/pause rule", async () => {
    prisma.subscriptionInvoice.findMany.mockResolvedValue([{ id: "inv_1", subscriptionId: member.id, status: "DUE", paymentIntentId: null, orderId: "order_r1", dueAt: new Date(Date.now() - 8 * 86_400_000) }]);
    prisma.customerSubscription.findMany.mockResolvedValue([member]);
    await service.expireMissedRenewals("merchant_1", "store_1");
    expect(prisma.subscriptionInvoice.updateMany).not.toHaveBeenCalled();
  });
});
```

(`cancelUnpaidIntent` is internal; if the lapse test needs more mocks for it, mirror the ones `subscription-renewals.spec.ts` sets up for its missed-renewal test.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/api && npx jest src/operations/membership-renewals.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Terms**

In `subscription-pricing.ts`:
- `SubscriptionTerms` gains `membership: boolean`.
- `TermsSubscription` gains `membershipPeriodId?: string | null`.
- Every existing returned terms object in `subscriptionTerms` gains `membership: false`.
- Change the signature and put the membership branch first:

```ts
export function subscriptionTerms(subscription: TermsSubscription, plan: TermsPlan | null, now = new Date(), membershipPeriod: { months: number; amount: number } | null = null): SubscriptionTerms | null {
  if (subscription.membershipPeriodId) {
    if (!membershipPeriod) return null;
    return { name: subscription.itemName ?? "Membresía", interval: "MONTHLY", count: membershipPeriod.months, amount: membershipPeriod.amount, currency: subscription.currency ?? "BOB", noticeHours: MEMBERSHIP_NOTICE_HOURS, product: false, membership: true };
  }
  // …existing body unchanged…
```

Define `export const MEMBERSHIP_NOTICE_HOURS = 120;` in `subscription-pricing.ts` next to `PRODUCT_NOTICE_HOURS`, and in `membership-rules.ts` replace its own constant with `export { MEMBERSHIP_NOTICE_HOURS } from "../operations/subscription-pricing";` (avoids an import cycle; `membership-rules.spec.ts` does not import it).

- [ ] **Step 4: Engine changes in `subscriptions.service.ts`**

Import `membershipTermsPeriod` from `../memberships/membership-rules`.

Add a public helper and use it in `termsFor`:

```ts
  async membershipPeriodsFor(subscriptions: Array<Pick<CustomerSubscription, "membershipPeriodId" | "pendingPeriodId">>) {
    const ids = [...new Set(subscriptions.flatMap(s => [s.membershipPeriodId, s.pendingPeriodId]).filter((id): id is string => !!id))];
    const rows = ids.length ? await this.prisma.membershipPeriod.findMany({ where: { id: { in: ids } }, select: { id: true, months: true, amount: true } }) : [];
    return new Map(rows.map(row => [row.id, { months: row.months, amount: row.amount }]));
  }

  private async termsFor(subscription: CustomerSubscription, storeId: string, now = new Date()) {
    if (subscription.membershipPeriodId) {
      const period = membershipTermsPeriod(subscription, await this.membershipPeriodsFor([subscription]));
      return subscriptionTerms(subscription, null, now, period);
    }
    const plan = subscription.planId ? await this.prisma.subscriptionPlan.findFirst({ where: { id: subscription.planId, storeId } }) : null;
    return subscriptionTerms(subscription, plan, now);
  }
```

In `generateSubscriptionInvoices`, inside the candidates loop:
1. Change the overdue-skip condition to `if (subscription.paymentLinkId && !terms.membership && advanceBillingDate(subscription.nextBillingAt, terms.interval, terms.count) <= now) {`.
2. After `if (generationAt > now) continue;` add:

```ts
        if (terms.membership) {
          const product = await this.prisma.paymentLink.findFirst({ where: { id: subscription.paymentLinkId!, storeId, status: "ACTIVE", fulfillmentType: "MEMBERSHIP" } });
          if (!product) { await this.endGoneMembership(store.name, subscription); continue; }
        }
```

3. In the transaction's `customerSubscription.updateMany` `data`, add:

```ts
              ...(terms.membership && subscription.pendingPeriodId ? { membershipPeriodId: subscription.pendingPeriodId, unitAmount: terms.amount, pendingPeriodId: null } : {}),
```

Add next to `endGoneSubscription`:

```ts
  private async endGoneMembership(storeName: string, subscription: CustomerSubscription) {
    const ended = await this.prisma.customerSubscription.updateMany({ where: { id: subscription.id, status: "ACTIVE" }, data: { status: "CANCELED", activeKey: null, canceledAt: new Date() } });
    const until = subscription.accessUntil ? subscription.accessUntil.toLocaleDateString("es-BO", { day: "numeric", month: "long", year: "numeric" }) : "";
    if (ended.count) await this.sendSubscriptionNotice(subscription.customerEmail, `Tu membresía terminó · ${storeName}`,
      `Hola ${subscription.customerName}, ${storeName} dejó de ofrecer ${subscription.itemName ?? "esta membresía"}, así que no habrá más renovaciones.${until ? ` Tu acceso sigue hasta el ${until}.` : ""} No se hizo ningún cobro.`);
  }
```

In `sendChargeNotice`, add before `if (!terms.product) {`:

```ts
    if (terms.membership) {
      const due = invoice.dueAt ?? invoice.periodStart;
      const date = due ? due.toLocaleDateString("es-BO", { day: "numeric", month: "long" }) : "";
      const subject = kind === "first" ? `Tu membresía ${terms.name} vence el ${date} · ${storeName}`
        : kind === "reminder" ? `Recordatorio: renueva tu membresía ${terms.name} · ${storeName}`
        : `Último recordatorio: tu membresía ${terms.name} · ${storeName}`;
      return this.sendSubscriptionNotice(subscription.customerEmail, subject,
        `Hola ${subscription.customerName}, ${kind === "first" ? `tu membresía ${terms.name} vence el ${date}.` : `la renovación de tu membresía ${terms.name} sigue pendiente.`}\nTotal: ${amount}\nRenueva con un toque: ${checkoutUrl}\n\nNo se cobra nada automáticamente. Puedes cambiar de período o cancelar desde tu cuenta en ${storeName}.`);
    }
```

In `expireMissedRenewals`, as the first statement inside the loop's `try {`:

```ts
        if (ownerById.get(invoice.subscriptionId)?.membershipPeriodId) continue; // memberships lapse on their own grace days
```

Add the lapse job:

```ts
  async expireLapsedMemberships(merchantId: string, storeId: string) {
    const store = await ownedStore(this.prisma, merchantId, storeId);
    const cutoff = new Date(Date.now() - store.membershipGraceDays * DAY_MS);
    const invoices = await this.prisma.subscriptionInvoice.findMany({ where: { merchantId, storeId, status: "DUE", dueAt: { lte: cutoff } }, orderBy: { dueAt: "asc" }, take: 200 });
    const owners = invoices.length ? await this.prisma.customerSubscription.findMany({ where: { id: { in: [...new Set(invoices.map(invoice => invoice.subscriptionId))] }, membershipPeriodId: { not: null } } }) : [];
    const ownerById = new Map(owners.map(owner => [owner.id, owner]));
    const origins = await originLivemodes(this.prisma, owners, this.logger);
    const livemode = await this.storeLivemode(merchantId, store);
    let lapsed = 0;
    for (const invoice of invoices) {
      const owner = ownerById.get(invoice.subscriptionId);
      if (!owner) continue;
      try {
        if (!originMatchesStore(owner, origins, livemode)) { this.logOriginSkip(owner.id, livemode); continue; }
        const outcome = await this.staleQrOutcome(invoice.paymentIntentId); // bank call, before the transaction
        if (outcome === "paid" || outcome === "unknown") continue;
        const done = await this.prisma.$transaction(async (tx) => {
          if (invoice.paymentIntentId && !(await this.cancelUnpaidIntent(tx, invoice.paymentIntentId, outcome))) return false;
          if (!(await tx.subscriptionInvoice.updateMany({ where: { id: invoice.id, status: "DUE" }, data: { status: "MISSED" } })).count) return false;
          if (invoice.orderId) {
            const order = await tx.storeOrder.updateMany({ where: { id: invoice.orderId, status: OrderFulfillmentStatus.AWAITING_PAYMENT }, data: { status: OrderFulfillmentStatus.CANCELED } });
            if (order.count) await tx.storeOrderStatusEvent.create({ data: { orderId: invoice.orderId, status: OrderFulfillmentStatus.CANCELED } });
          }
          return (await tx.customerSubscription.updateMany({ where: { id: owner.id, status: "ACTIVE" }, data: { status: "LAPSED", activeKey: null, missedCount: { increment: 1 } } })).count === 1;
        });
        if (!done) continue;
        lapsed += 1;
        await this.sendSubscriptionNotice(owner.customerEmail, `Tu membresía venció · ${store.name}`,
          `Hola ${owner.customerName}, no recibimos la renovación de ${owner.itemName ?? "tu membresía"}. Tu membresía venció — puedes reactivarla cuando quieras desde tu cuenta en ${store.name}. No se hizo ningún cobro.`);
      } catch (error) {
        this.logger.error(`Membership lapse failed for invoice ${invoice.id}: ${(error as Error).message}`);
      }
    }
    return { lapsed };
  }
```

- [ ] **Step 5: Worker**

In `operations.worker.ts`, after the `expireMissedRenewals(...).catch(...)` statement add a call of the same shape (match its logger usage exactly):

```ts
        await this.subscriptions.expireLapsedMemberships(store.merchantId, store.id).catch((error: Error) => {
          this.logger.error(`Membership lapse failed for store ${store.id}: ${error.message}`);
        });
```

- [ ] **Step 6: Run tests**

Run: `cd apps/api && npx jest src/operations src/memberships`
Expected: PASS (new suite and all existing renewal suites).

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/operations/subscription-pricing.ts apps/api/src/operations/subscriptions.service.ts apps/api/src/operations/operations.worker.ts apps/api/src/operations/membership-renewals.spec.ts apps/api/src/memberships/membership-rules.ts
git commit -m "feat(memberships): renewal engine bills members 5 days ahead, applies switches, lapses after grace"
```

---

### Task 8: Member self-service — cancel, resume, switch period

**Files:**
- Modify: `apps/api/src/memberships/memberships.service.ts` (`act`, new constructor dependency)
- Modify: `apps/api/src/memberships/memberships.controller.ts` (`POST :id/:action`)
- Create: `apps/api/src/memberships/dto/member-action.dto.ts`
- Modify: `apps/api/src/memberships/memberships.service.spec.ts`
- Modify: `apps/api/src/memberships/memberships.module.ts` (import the module that provides `SubscriptionsService`; if it does not export it, add it to that module's `exports`)
- Modify: `apps/api/src/store-customers/store-customers.service.ts` (`subscriptions(me)` excludes memberships) + its spec

**Interfaces:**
- Consumes: `SubscriptionsService.precheckOpenRenewal(subscriptionId)`, `SubscriptionsService.cancelOpenRenewal(tx, subscriptionId, precheck)`, Task 2 rules.
- Produces: `POST v1/stores/public/:slug/customers/me/memberships/:id/(cancel|resume|period)` (body for `period`: `{ periodId: string }`) → the updated `MemberView`; `MembershipsService.act(slug, token, id, action, periodId?)`.

- [ ] **Step 1: Write the failing tests**

In `memberships.service.spec.ts`, change `setup()` so the service is built with a 5th argument `subscriptions = { precheckOpenRenewal: jest.fn().mockResolvedValue({}), cancelOpenRenewal: jest.fn().mockResolvedValue(true) }` (return it from `setup()` too), and add to the prisma mock `customerSubscription.update: jest.fn().mockResolvedValue({})`, `subscriptionInvoice.updateMany: jest.fn().mockResolvedValue({ count: 1 })`, `$queryRaw: jest.fn().mockResolvedValue([])`. Then:

```ts
describe("MembershipsService.act", () => {
  const row = (extra: object = {}) => ({ id: "sub_1", storeId: "store_1", storeCustomerId: "cust_1", paymentLinkId: "club", membershipPeriodId: "m1", pendingPeriodId: null, status: "ACTIVE", accessUntil: new Date(Date.now() + 10 * 86400000), nextBillingAt: new Date(Date.now() + 10 * 86400000), unitAmount: 5000, currency: "BOB", itemName: "Club del café", ...extra });

  it("cancels: stops renewals now, keeps access until accessUntil", async () => {
    const { service, prisma, subscriptions } = setup();
    prisma.customerSubscription.findFirst.mockResolvedValue(row());
    await service.act("cafe", "token", "sub_1", "cancel");
    expect(subscriptions.cancelOpenRenewal).toHaveBeenCalled();
    expect(prisma.customerSubscription.update).toHaveBeenCalledWith({ where: { id: "sub_1" }, data: expect.objectContaining({ status: "CANCELED", activeKey: null }) });
  });

  it("resumes a canceled membership that still has access, reopening a skipped renewal for the same period", async () => {
    const { service, prisma } = setup();
    const accessUntil = new Date(Date.now() + 3 * 86400000);
    prisma.customerSubscription.findFirst.mockResolvedValueOnce(row({ status: "CANCELED", accessUntil })).mockResolvedValueOnce(null);
    await service.act("cafe", "token", "sub_1", "resume");
    expect(prisma.subscriptionInvoice.updateMany).toHaveBeenCalledWith({ where: { subscriptionId: "sub_1", periodStart: accessUntil, status: "SKIPPED" }, data: { status: "DUE", paymentIntentId: null, orderId: null } });
    expect(prisma.customerSubscription.update).toHaveBeenCalledWith({ where: { id: "sub_1" }, data: expect.objectContaining({ status: "ACTIVE", canceledAt: null, nextBillingAt: accessUntil }) });
  });

  it("refuses to resume once access ended (rejoin instead)", async () => {
    const { service, prisma } = setup();
    prisma.customerSubscription.findFirst.mockResolvedValue(row({ status: "CANCELED", accessUntil: new Date(Date.now() - 86400000) }));
    await expect(service.act("cafe", "token", "sub_1", "resume")).rejects.toThrow("Tu acceso ya terminó; vuelve a hacerte miembro.");
  });

  it("schedules a period switch for the next renewal, and refuses archived periods", async () => {
    const { service, prisma } = setup();
    prisma.customerSubscription.findFirst.mockResolvedValue(row());
    prisma.membershipPeriod.findFirst.mockResolvedValueOnce({ id: "m12", paymentLinkId: "club", months: 12, amount: 48000 }).mockResolvedValueOnce(null);
    await service.act("cafe", "token", "sub_1", "period", "m12");
    expect(prisma.customerSubscription.update).toHaveBeenCalledWith({ where: { id: "sub_1" }, data: { pendingPeriodId: "m12" } });
    await expect(service.act("cafe", "token", "sub_1", "period", "m6")).rejects.toThrow("Elige un período disponible.");
  });

  it("only touches the signed-in account's memberships", async () => {
    const { service, prisma } = setup();
    prisma.customerSubscription.findFirst.mockResolvedValue(null);
    await expect(service.act("cafe", "token", "sub_other", "cancel")).rejects.toThrow("Membresía no encontrada");
    expect(prisma.customerSubscription.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ storeCustomerId: "cust_1", membershipPeriodId: { not: null } }) }));
  });
});
```

In `store-customers.service.spec.ts`, in the existing test of `subscriptions(me)` (or a new one built the same way), assert `customerSubscription.findMany` is called with `where: expect.objectContaining({ membershipPeriodId: null })`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/api && npx jest src/memberships/memberships.service.spec.ts src/store-customers`
Expected: FAIL.

- [ ] **Step 3: Implement**

`dto/member-action.dto.ts`:

```ts
import { IsOptional, IsString, MaxLength } from "class-validator";
export class MemberActionDto { @IsOptional() @IsString() @MaxLength(40) periodId?: string; }
```

In `MembershipsService`, add `private readonly subscriptions: SubscriptionsService` as the 5th constructor parameter (import from `../operations/subscriptions.service`), add `membershipKey` to the rules import, and:

```ts
  async act(slug: string, token: unknown, id: string, action: "cancel" | "resume" | "period", periodId?: string): Promise<MemberView> {
    const me = await this.customers.authenticate(slug, token);
    const store = await findActiveStoreBySlug(this.prisma, slug);
    const row = await this.prisma.customerSubscription.findFirst({ where: { id, storeId: store.id, storeCustomerId: me.id, membershipPeriodId: { not: null } } });
    if (!row) throw new NotFoundException("Membresía no encontrada");
    const now = new Date();
    if (action === "cancel") {
      if (row.status !== "ACTIVE") throw new BadRequestException("Esta membresía ya no se renueva.");
      const precheck = await this.subscriptions.precheckOpenRenewal(row.id); // bank call, before the transaction
      await this.prisma.$transaction(async (tx) => {
        await this.subscriptions.cancelOpenRenewal(tx, row.id, precheck);
        await tx.customerSubscription.update({ where: { id: row.id }, data: { status: "CANCELED", activeKey: null, canceledAt: now } });
      });
    } else if (action === "resume") {
      if (row.status !== "CANCELED") throw new BadRequestException("Solo puedes reanudar una membresía cancelada.");
      if (!row.accessUntil || row.accessUntil <= now) throw new BadRequestException("Tu acceso ya terminó; vuelve a hacerte miembro.");
      const key = membershipKey(store.id, row.paymentLinkId!, me.id);
      await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "StoreCustomer" WHERE id = ${me.id} FOR UPDATE`;
        if (await tx.customerSubscription.findFirst({ where: { activeKey: key, id: { not: row.id } } })) throw new ConflictException("Ya tienes esta membresía activa.");
        await tx.subscriptionInvoice.updateMany({ where: { subscriptionId: row.id, periodStart: row.accessUntil!, status: "SKIPPED" }, data: { status: "DUE", paymentIntentId: null, orderId: null } });
        await tx.customerSubscription.update({ where: { id: row.id }, data: { status: "ACTIVE", activeKey: key, canceledAt: null, nextBillingAt: row.accessUntil! } });
      });
    } else {
      if (row.status !== "ACTIVE") throw new BadRequestException("Solo puedes cambiar el período de una membresía activa.");
      const period = periodId ? await this.prisma.membershipPeriod.findFirst({ where: { id: periodId, paymentLinkId: row.paymentLinkId!, archivedAt: null } }) : null;
      if (!period) throw new BadRequestException("Elige un período disponible.");
      await this.prisma.customerSubscription.update({ where: { id: row.id }, data: { pendingPeriodId: period.id === row.membershipPeriodId ? null : period.id } });
    }
    return (await this.list(slug, token)).find(view => view.id === row.id)!;
  }
```

Controller (import `NotFoundException` and `MemberActionDto`):

```ts
  @Post(":id/:action") @Header("Cache-Control", "no-store") @Throttle({ default: { limit: 20, ttl: 60_000 } })
  act(@Param("slug") slug: string, @Param("id") id: string, @Param("action") action: string, @Body() dto: MemberActionDto, @Headers("authorization") auth?: string) {
    if (!["cancel", "resume", "period"].includes(action)) throw new NotFoundException();
    return this.memberships.act(slug, this.memberships.bearer(auth), id, action as "cancel" | "resume" | "period", dto.periodId);
  }
```

In `store-customers.service.ts` `subscriptions(me)`, add `membershipPeriodId: null` to the `where`.

- [ ] **Step 4: Run tests**

Run: `cd apps/api && npx jest src/memberships src/store-customers && npx tsc --noEmit -p tsconfig.json`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/memberships apps/api/src/store-customers/store-customers.service.ts apps/api/src/store-customers/store-customers.service.spec.ts
git commit -m "feat(memberships): members cancel, resume and switch period from their account"
```

(Also add the operations module file if Step 3 changed its `exports`.)

---

### Task 9: Owner API — Miembros list, summary and grace setting

**Files:**
- Modify: `apps/api/src/operations/dto/subscribers.dto.ts`
- Modify: `apps/api/src/operations/subscribers.service.ts` (`terms`, `apply`, `list`, `rows`, `summary`, `setEnabled`)
- Modify: `apps/api/src/operations/subscribers.controller.ts` (`settings`)
- Modify: `apps/api/src/operations/subscribers.service.spec.ts`

**Interfaces:**
- Consumes: `SubscriptionsService.membershipPeriodsFor` (Task 7), `membershipTermsPeriod`, `membershipState`, `MEMBERSHIP_STATE_LABEL`, `periodLabel` (Task 2).
- Produces:
  - `GET v1/stores/:storeId/subscriptions?kind=membership&status=…` → rows with `kind: "membership"`, `periodLabel`, `accessUntil`, `membershipState`, `membershipStateLabel`; without `kind=membership`, memberships are excluded (Suscripciones looks as today).
  - `GET …/summary` gains `members: { active: number; monthlyRecurring: number; currency: string }` and `membershipGraceDays: number`; existing figures exclude memberships.
  - `PUT …/settings` accepts `{ enabled: boolean; membershipGraceDays?: number }` and returns `{ enabled, activeSubscribers, membershipGraceDays }`.
  - Owner actions on a membership: only `cancel` (and resend). Error text: `Las membresías solo se pueden cancelar desde aquí.`

- [ ] **Step 1: Write the failing tests** (in `subscribers.service.spec.ts`, using its existing factory; add `membershipPeriod.findMany` and `store.update` mocks, and give the store fixture `membershipGraceDays: 7`)

```ts
describe("members", () => {
  const member = { id: "sub_m", merchantId: "merchant_1", storeId: "store_1", planId: null, paymentLinkId: "club", membershipPeriodId: "m12", pendingPeriodId: null, unitAmount: 48000, quantity: 1, currency: "BOB", itemName: "Club del café", status: "ACTIVE", accessUntil: new Date(Date.now() + 40 * 86400000), nextBillingAt: new Date(Date.now() + 40 * 86400000), customerName: "Ana", customerEmail: "ana@mail.com", customerPhone: null, cadence: null, sourceOrderId: "order_1" };

  it("lists only memberships with kind=membership, and only subscriptions otherwise", async () => {
    prisma.customerSubscription.findMany.mockResolvedValue([]);
    await service.list("merchant_1", "store_1", { kind: "membership" } as never);
    expect(prisma.customerSubscription.findMany.mock.calls.at(-1)[0].where).toEqual(expect.objectContaining({ membershipPeriodId: { not: null } }));
    await service.list("merchant_1", "store_1", {} as never);
    expect(prisma.customerSubscription.findMany.mock.calls.at(-1)[0].where).toEqual(expect.objectContaining({ membershipPeriodId: null }));
  });

  it("shows the period, activa hasta and state for a member row", async () => {
    prisma.customerSubscription.findMany.mockResolvedValue([member]);
    prisma.membershipPeriod.findMany.mockResolvedValue([{ id: "m12", months: 12, amount: 48000 }]);
    const { items } = await service.list("merchant_1", "store_1", { kind: "membership" } as never);
    expect(items[0]).toEqual(expect.objectContaining({ kind: "membership", periodLabel: "Anual", membershipState: "ACTIVE", membershipStateLabel: "Activa", amount: 48000 }));
  });

  it("counts members and their monthly-equivalent revenue apart from subscriptions", async () => {
    prisma.customerSubscription.findMany.mockImplementation(async ({ where }: any) => (where.membershipPeriodId ? [member] : []));
    prisma.membershipPeriod.findMany.mockResolvedValue([{ id: "m12", months: 12, amount: 48000 }]);
    const summary = await service.summary("merchant_1", "store_1");
    expect(summary.members).toEqual({ active: 1, monthlyRecurring: 4000, currency: "BOB" });
    expect(summary.membershipGraceDays).toBe(7);
  });

  it("lets the owner only cancel a membership", async () => {
    prisma.customerSubscription.findFirst.mockResolvedValue(member);
    await expect(service.act("merchant_1", "store_1", "sub_m", "pause")).rejects.toThrow("Las membresías solo se pueden cancelar desde aquí.");
  });

  it("saves the grace days", async () => {
    await service.setEnabled("merchant_1", "store_1", true, 10);
    expect(prisma.store.update).toHaveBeenCalledWith({ where: { id: "store_1" }, data: { subscriptionsEnabled: true, membershipGraceDays: 10 } });
  });
});
```

(`summary` filters to live rows via `liveIds`; set `storeOrder.findMany` the way the file's other summary tests do so the member's order counts as live.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/api && npx jest src/operations/subscribers.service.spec.ts -t "members"`
Expected: FAIL.

- [ ] **Step 3: Implement**

DTOs (add `IsInt, Min, Max` to the import):

```ts
export class SubscriptionSettingsDto {
  @IsBoolean() enabled!: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(30) membershipGraceDays?: number;
}
export class ListSubscribersQuery {
  @IsOptional() @IsIn(["ACTIVE", "PAUSED", "CANCELED", "PENDING", "LAPSED"]) status?: "ACTIVE" | "PAUSED" | "CANCELED" | "PENDING" | "LAPSED";
  @IsOptional() @IsIn(["subscription", "membership"]) kind?: "subscription" | "membership";
  @IsOptional() @IsString() @MaxLength(40) productId?: string;
  @IsOptional() @IsString() @MaxLength(80) q?: string;
  @IsOptional() @IsString() @MaxLength(40) cursor?: string;
}
```

`subscribers.service.ts` (import `membershipState, membershipTermsPeriod, MEMBERSHIP_STATE_LABEL, periodLabel` from `../memberships/membership-rules`):
- `terms(subscription)`: if `subscription.membershipPeriodId`, return `subscriptionTerms(subscription, null, new Date(), membershipTermsPeriod(subscription, await this.subscriptions.membershipPeriodsFor([subscription])))`.
- `apply`: first line `if (subscription.membershipPeriodId && action !== "cancel") throw new BadRequestException("Las membresías solo se pueden cancelar desde aquí.");`
- `list`: keep the store returned by `ownedStore` (`const store = await ownedStore(…)`), add `...(query.kind === "membership" ? { membershipPeriodId: { not: null } } : { membershipPeriodId: null })` to `where`, and call `this.rows(page.slice(0, 50), store.membershipGraceDays)`.
- `rows(subscriptions, graceDays = 7)`: load `const periods = await this.subscriptions.membershipPeriodsFor(subscriptions);`; compute `const terms = subscription.membershipPeriodId ? subscriptionTerms(subscription, null, now, membershipTermsPeriod(subscription, periods)) : subscriptionTerms(subscription, plan, now);`; spread into the returned object, after the existing fields:

```ts
        ...(subscription.membershipPeriodId ? (() => {
          const state = membershipState(subscription, graceDays, now);
          const months = periods.get(subscription.membershipPeriodId!)?.months ?? 1;
          return { kind: "membership" as const, periodLabel: periodLabel(months), cadenceLabel: periodLabel(months), accessUntil: subscription.accessUntil?.toISOString() ?? null, membershipState: state, membershipStateLabel: MEMBERSHIP_STATE_LABEL[state] };
        })() : {}),
```

- `summary`: change the first query to `where: { storeId, status: "ACTIVE", membershipPeriodId: null }`, then before the `return` add:

```ts
    const memberRows = await this.prisma.customerSubscription.findMany({ where: { storeId, status: "ACTIVE", membershipPeriodId: { not: null } } });
    const liveMembers = await this.liveIds(memberRows);
    const memberPeriods = await this.subscriptions.membershipPeriodsFor(memberRows);
    let memberMonthly = 0;
    for (const row of memberRows) {
      if (!liveMembers.has(row.id)) continue;
      const months = memberPeriods.get(row.membershipPeriodId!)?.months;
      if (months && row.unitAmount) memberMonthly += Math.round(row.unitAmount / months);
    }
```

and add to the returned object: `members: { active: memberRows.filter(row => liveMembers.has(row.id)).length, monthlyRecurring: memberMonthly, currency }, membershipGraceDays: store.membershipGraceDays`.
- `setEnabled(merchantId, storeId, enabled, membershipGraceDays?: number)`: `data: { subscriptionsEnabled: enabled, ...(membershipGraceDays !== undefined ? { membershipGraceDays } : {}) }`; add `membershipPeriodId: null` to the `activeSubscribers` count; read the store back (`findUniqueOrThrow({ where: { id: storeId }, select: { membershipGraceDays: true } })`) and return `{ enabled, activeSubscribers, membershipGraceDays }`.

Controller `settings`: `return this.subscribers.setEnabled(req.merchant.id, storeId, dto.enabled, dto.membershipGraceDays);`

- [ ] **Step 4: Run tests**

Run: `cd apps/api && npx jest src/operations`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/operations/dto/subscribers.dto.ts apps/api/src/operations/subscribers.service.ts apps/api/src/operations/subscribers.controller.ts apps/api/src/operations/subscribers.service.spec.ts
git commit -m "feat(memberships): owner Miembros list, member revenue summary and grace-days setting"
```

---

### Task 10: Dashboard — Miembros tab and grace days

**Files:**
- Modify: `apps/merchant-dashboard/src/subscriptions.mjs` (pure helpers)
- Modify: `apps/merchant-dashboard/src/subscriptions.test.mjs`
- Modify: `apps/merchant-dashboard/src/subscriptions-panel.mjs`

**Interfaces:**
- Consumes: Task 9 endpoints.
- Produces: `MEMBER_STATUS_FILTERS`, `MEMBER_STATE_TONE`, `memberFigures(summary)`, `validateGraceDays(value)` in `subscriptions.mjs`.

- [ ] **Step 1: Write the failing tests** (append to `subscriptions.test.mjs`; it uses `node:test` + `node:assert/strict` — add the new names to its existing import from `./subscriptions.mjs`)

```js
test("memberFigures shows active members and monthly-equivalent revenue", () => {
  const figures = memberFigures({ members: { active: 32, monthlyRecurring: 184000, currency: "BOB" } });
  assert.deepEqual(figures.map(f => f.label), ["Miembros activos", "Ingreso mensual de membresías"]);
  assert.equal(figures[0].value, "32");
});

test("validateGraceDays accepts whole days from 0 to 30", () => {
  assert.equal(validateGraceDays("7"), null);
  assert.equal(validateGraceDays("0"), null);
  assert.equal(validateGraceDays("31"), "Los días de gracia van de 0 a 30.");
  assert.equal(validateGraceDays("2.5"), "Los días de gracia van de 0 a 30.");
  assert.equal(validateGraceDays(""), "Los días de gracia van de 0 a 30.");
});

test("member states have tones", () => {
  assert.equal(MEMBER_STATE_TONE.GRACE, "warn");
  assert.equal(MEMBER_STATE_TONE.LAPSED, "muted");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/merchant-dashboard && node --test src/subscriptions.test.mjs`
Expected: FAIL — exports missing.

- [ ] **Step 3: Helpers in `subscriptions.mjs`**

```js
export const MEMBER_STATUS_FILTERS = [["", "Todos"], ["ACTIVE", "Activos"], ["LAPSED", "Vencidos"], ["CANCELED", "Cancelados"]];
export const MEMBER_STATE_TONE = { ACTIVE: "ok", GRACE: "warn", LAPSED: "muted", CANCELED_ACTIVE: "muted", CANCELED: "muted" };

export function memberFigures(summary) {
  const members = summary.members || { active: 0, monthlyRecurring: 0, currency: summary.currency || "BOB" };
  return [
    { label: "Miembros activos", value: String(members.active) },
    { label: "Ingreso mensual de membresías", value: formatMoney(members.monthlyRecurring, members.currency) },
  ];
}

export function validateGraceDays(value) {
  const days = Number(value);
  return String(value).trim() !== "" && Number.isInteger(days) && days >= 0 && days <= 30 ? null : "Los días de gracia van de 0 a 30.";
}
```

- [ ] **Step 4: Panel changes in `subscriptions-panel.mjs`**

1. Import `MEMBER_STATUS_FILTERS, MEMBER_STATE_TONE, memberFigures, validateGraceDays`.
2. `fresh()` gains `memberItems: [], memberCursor: null, memberFilters: { status: "", productId: "", q: "" }`.
3. `headHtml()`: add `${tab("members", "Miembros")}` between the Suscriptores and Configuración tabs, and change the intro sentence to `Clientes que reciben tus productos cada semana, quincena o mes, y tus miembros.`
4. Add after `loadOffers`:

```js
  async function loadMembers(append = false) {
    const mine = ++generation;
    const params = new URLSearchParams(Object.entries({ kind: "membership", ...state.memberFilters, ...(append && state.memberCursor ? { cursor: state.memberCursor } : {}) }).filter(([, value]) => value));
    const [summary, page] = await Promise.all([append && state.summary ? state.summary : deps.api(base("/summary")), deps.api(base(`?${params}`))]);
    if (mine !== generation) return;
    state = { ...state, loading: false, summary, memberItems: append ? [...state.memberItems, ...page.items] : page.items, memberCursor: page.nextCursor };
    render();
  }
  const membershipProducts = () => deps.products().filter((product) => product.fulfillmentType === "MEMBERSHIP");
```

5. `render()`: `${state.tab === "settings" ? settingsHtml() : state.tab === "members" ? membersHtml() : subscribersHtml()}`.
6. Add:

```js
  function membersHtml() {
    const { summary, memberItems } = state;
    if (!summary) return `<div class="subs-card subs-empty"><p>${state.loading ? "Cargando miembros…" : "Elige una tienda para ver sus miembros."}</p></div>`;
    if (!membershipProducts().length && !memberItems.length) {
      return `<div class="subs-card subs-empty"><h3>Aún no vendes membresías</h3><p>Crea un producto de tipo Membresía con sus períodos y precios. Tus clientes se unen con «Hacerme miembro» y reciben un enlace para pagar cada renovación.</p></div>`;
    }
    const figures = memberFigures(summary).map((figure) => `<div><dt>${esc(figure.label)}</dt><dd>${esc(figure.value)}</dd></div>`).join("");
    const statusOptions = MEMBER_STATUS_FILTERS.map(([value, label]) => `<option value="${value}" ${state.memberFilters.status === value ? "selected" : ""}>${label}</option>`).join("");
    const productOptions = `<option value="">Todas las membresías</option>${membershipProducts().map((product) => `<option value="${esc(product.id)}" ${state.memberFilters.productId === product.id ? "selected" : ""}>${esc(product.name)}</option>`).join("")}`;
    const table = memberItems.length
      ? `<div class="subs-table-wrap"><table class="subs-table"><thead><tr><th>Miembro</th><th>Membresía</th><th>Período</th><th>Activa hasta</th><th>Último pago</th><th>Estado</th><th><span class="sr-only">Acciones</span></th></tr></thead><tbody>${memberItems.map(memberRowHtml).join("")}</tbody></table></div>`
      : `<p class="subs-card subs-empty">No hay miembros con estos filtros.</p>`;
    return `<dl class="subs-figures">${figures}</dl>
      <div class="subs-filters">
        <label><span class="sr-only">Estado</span><select name="memberStatus">${statusOptions}</select></label>
        <label><span class="sr-only">Membresía</span><select name="memberProductId">${productOptions}</select></label>
        <label><span class="sr-only">Buscar</span><input type="search" name="memberQ" placeholder="Buscar por nombre o correo" value="${esc(state.memberFilters.q)}" autocomplete="off"></label>
      </div>
      ${table}
      ${state.memberCursor ? `<button type="button" class="subs-quiet subs-more" data-more-members>Cargar más</button>` : ""}`;
  }

  function memberRowHtml(row) {
    const id = esc(row.id);
    const buttons = [];
    if (row.displayStatus === "PENDING_PAYMENT") buttons.push(`<button type="button" class="subs-quiet" data-resend="${id}">Reenviar enlace</button>`);
    if (row.status === "ACTIVE") buttons.push(`<button type="button" class="subs-quiet is-danger" data-act="cancel" data-id="${id}">Cancelar</button>`);
    const confirm = state.confirming === row.id
      ? `<tr class="subs-confirm-row"><td colspan="7">${confirmRow(`¿Cancelar la membresía de ${row.customerName}? No habrá más renovaciones; su acceso sigue hasta la fecha pagada.`, `data-act="cancel" data-confirmed data-id="${id}"`, "Sí, cancelar")}</td></tr>`
      : "";
    const until = row.accessUntil ? new Date(row.accessUntil).toLocaleDateString("es-BO") : "—";
    const paid = row.lastPaidAt ? new Date(row.lastPaidAt).toLocaleDateString("es-BO") : "—";
    return `<tr>
      <td><strong>${esc(row.customerName)}</strong><small>${esc(row.customerEmail)}</small></td>
      <td>${esc(row.itemName)}<small>${esc(formatMoney(row.amount, row.currency))}</small></td>
      <td>${esc(row.periodLabel)}</td>
      <td>${esc(until)}</td>
      <td>${esc(paid)}</td>
      <td><span class="pill pill--${esc(MEMBER_STATE_TONE[row.membershipState] || "muted")}">${esc(row.membershipStateLabel)}</span>${row.livemode ? "" : ` <span class="pill pill--muted">Prueba</span>`}</td>
      <td class="subs-actions">${buttons.join("")}</td></tr>${confirm}`;
  }
```

7. `settingsHtml()`: as the first line inside `deps.products().map((product) => {` add `if (product.fulfillmentType === "MEMBERSHIP") return \`<tr class="is-disabled"><td>${esc(product.name)}</td><td><small>Membresía: se renueva por período</small></td><td></td></tr>\`;`. After the switch `<section>` add:

```js
      <section class="subs-card">
        <h3>Membresías</h3>
        <label>Días de gracia para renovar <input type="number" name="graceDays" min="0" max="30" step="1" value="${esc(summary?.membershipGraceDays ?? 7)}"></label>
        <p>Si un miembro no paga su renovación, sigue activo estos días. Después, su membresía vence.</p>
        <button type="button" class="primary" data-save-grace>Guardar</button>
      </section>
```

8. `setEnabled(enabled)` sends `JSON.stringify({ enabled, membershipGraceDays: state.summary?.membershipGraceDays ?? 7 })` and merges `membershipGraceDays: result.membershipGraceDays` into `state.summary`.
9. Click handler (inside the `try`): in the `data-tab` branch, after `if (state.tab === "settings") await loadOffers();` add `if (state.tab === "members") await loadMembers();`. Add branches:

```js
      if (target.hasAttribute("data-more-members")) { await loadMembers(true); return; }
      if (target.hasAttribute("data-save-grace")) {
        const value = root.querySelector('[name="graceDays"]').value;
        const problem = validateGraceDays(value);
        if (problem) { state.message = problem; render(); return; }
        const result = await deps.api(base("/settings"), { method: "PUT", body: JSON.stringify({ enabled: Boolean(state.summary?.enabled), membershipGraceDays: Number(value) }) });
        state.summary = { ...state.summary, membershipGraceDays: result.membershipGraceDays };
        state.message = "Guardamos los días de gracia.";
        render();
        return;
      }
```

In the existing `data-act` branch replace `await loadSubscribers();` with `await (state.tab === "members" ? loadMembers() : loadSubscribers());`; in the `data-resend` branch nothing changes (it works for member rows).
10. Change handler, add:

```js
      if (input.name === "memberStatus" || input.name === "memberProductId") {
        state.memberFilters[input.name === "memberStatus" ? "status" : "productId"] = input.value;
        state.confirming = null;
        await loadMembers();
      }
```

Input handler, before the existing `q` check:

```js
    if (event.target.name === "memberQ") {
      clearTimeout(searchTimer);
      const value = event.target.value.trim();
      searchTimer = setTimeout(() => { state.memberFilters.q = value; void loadMembers().catch((error) => failure(error, "No pudimos buscar.")); }, 300);
      return;
    }
```

11. `show()`: `const loading = state.tab === "settings" ? Promise.all([loadSubscribers(), loadOffers()]) : state.tab === "members" ? loadMembers() : loadSubscribers();`
12. `eligibleProducts()` becomes `deps.products().filter((product) => product.fulfillmentType !== "DIGITAL" && product.fulfillmentType !== "MEMBERSHIP")`.

- [ ] **Step 5: Run tests**

Run: `cd apps/merchant-dashboard && node --test src/subscriptions.test.mjs`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/merchant-dashboard/src/subscriptions.mjs apps/merchant-dashboard/src/subscriptions.test.mjs apps/merchant-dashboard/src/subscriptions-panel.mjs
git commit -m "feat(memberships): dashboard Miembros tab and grace-days setting"
```

---

### Task 11: Studio product wizard — Membresía type and periods

**Files:**
- Create: `apps/merchant-studio/src/membership-periods-editor.ts`
- Create: `apps/merchant-studio/src/membership-periods-editor.test.ts`
- Modify: `apps/merchant-studio/src/source-create-product.ts`
- Modify: `apps/merchant-studio/src/source-create-product.test.ts`
- Modify: `apps/merchant-studio/src/api.ts` (`createProduct` input type)

**Interfaces:**
- Produces:
  - `type MembershipPeriodDraft = { months: 1 | 3 | 6 | 12; price: string }`
  - `parseMembershipPeriods(rows: MembershipPeriodDraft[]): { periods: Array<{ months: number; amount: number }>; problem: string }`
  - `membershipPeriodsHtml(rows: MembershipPeriodDraft[]): string`, `readMembershipRows(host: HTMLElement): MembershipPeriodDraft[]`, `periodsSummary(rows: MembershipPeriodDraft[]): string`
  - `ProductGuideRecord` gains `fulfillmentType?: string; membershipPeriods?: Array<{ id: string; months: number; amount: number }>`
  - `createProduct` input gains `fulfillmentType?: 'PHYSICAL' | 'MEMBERSHIP'; membershipPeriods?: Array<{ months: number; amount: number }>`

- [ ] **Step 1: Write the failing tests**

`apps/merchant-studio/src/membership-periods-editor.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { membershipPeriodsHtml, parseMembershipPeriods, periodsSummary } from './membership-periods-editor';

describe('parseMembershipPeriods', () => {
  it('turns Bs prices into centavos and keeps the order', () => {
    expect(parseMembershipPeriods([{ months: 1, price: '50' }, { months: 12, price: '480.50' }])).toEqual({ periods: [{ months: 1, amount: 5000 }, { months: 12, amount: 48050 }], problem: '' });
  });
  it('explains what is wrong', () => {
    expect(parseMembershipPeriods([]).problem).toBe('Agrega al menos un período con su precio.');
    expect(parseMembershipPeriods([{ months: 1, price: '0' }]).problem).toBe('Cada período necesita un precio mayor que cero.');
    expect(parseMembershipPeriods([{ months: 1, price: '50' }, { months: 1, price: '60' }]).problem).toBe('Cada duración puede aparecer una sola vez.');
  });
});

describe('membershipPeriodsHtml', () => {
  it('draws one row per period with a length select, a price and a remove button, and hides "add" at four', () => {
    const html = membershipPeriodsHtml([{ months: 1, price: '50' }, { months: 3, price: '135' }, { months: 6, price: '250' }, { months: 12, price: '480' }]);
    expect(html.match(/data-period-row=/g)).toHaveLength(4);
    expect(html).toContain('<option value="12" selected>Anual</option>');
    expect(html).not.toContain('data-period-add');
  });
  it('summarises the periods for the review step', () => {
    expect(periodsSummary([{ months: 1, price: '50' }, { months: 12, price: '480' }])).toBe('Mensual Bs 50 · Anual Bs 480');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/merchant-studio && npx vitest run src/membership-periods-editor.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement the editor module**

```ts
import { escapeHtml as escape } from './studio-ui';

/** Period rows of a membership product (spec 2026-10-09 §1): 1–4 distinct lengths, each with its own price. */
export type MembershipPeriodDraft = { months: 1 | 3 | 6 | 12; price: string };
const LENGTHS: Array<[MembershipPeriodDraft['months'], string]> = [[1, 'Mensual'], [3, 'Trimestral'], [6, 'Semestral'], [12, 'Anual']];
const labelOf = (months: number) => LENGTHS.find(([value]) => value === months)?.[1] ?? `Cada ${months} meses`;

export function parseMembershipPeriods(rows: MembershipPeriodDraft[]): { periods: Array<{ months: number; amount: number }>; problem: string } {
  if (!rows.length) return { periods: [], problem: 'Agrega al menos un período con su precio.' };
  if (new Set(rows.map(row => row.months)).size !== rows.length) return { periods: [], problem: 'Cada duración puede aparecer una sola vez.' };
  const periods = rows.map(row => ({ months: row.months, amount: Math.round(Number(row.price) * 100) }));
  if (periods.some(period => !Number.isSafeInteger(period.amount) || period.amount <= 0)) return { periods: [], problem: 'Cada período necesita un precio mayor que cero.' };
  return { periods, problem: '' };
}

export function membershipPeriodsHtml(rows: MembershipPeriodDraft[]): string {
  const row = (draft: MembershipPeriodDraft, index: number) => `<div class="membership-period" data-period-row="${index}">
    <label>Duración<select name="periodMonths">${LENGTHS.map(([months, label]) => `<option value="${months}"${months === draft.months ? ' selected' : ''}>${label}</option>`).join('')}</select></label>
    <label>Precio (Bs)<input name="periodPrice" type="number" min="0.01" step="0.01" inputmode="decimal" value="${escape(draft.price)}" required></label>
    ${rows.length > 1 ? `<button type="button" class="button" data-period-remove="${index}" aria-label="Quitar período ${index + 1}">Quitar</button>` : ''}
  </div>`;
  return `${rows.map(row).join('')}${rows.length < 4 ? '<button type="button" class="button" data-period-add>Añadir período</button>' : ''}`;
}

/** Reads the rows currently in the DOM, so typed prices survive a re-render. */
export function readMembershipRows(host: HTMLElement): MembershipPeriodDraft[] {
  return [...host.querySelectorAll<HTMLElement>('[data-period-row]')].map(row => ({
    months: Number(row.querySelector<HTMLSelectElement>('[name=periodMonths]')!.value) as MembershipPeriodDraft['months'],
    price: row.querySelector<HTMLInputElement>('[name=periodPrice]')!.value,
  }));
}

export const periodsSummary = (rows: MembershipPeriodDraft[]) => rows.map(row => `${labelOf(row.months)} Bs ${row.price}`).join(' · ');
```

- [ ] **Step 4: Wire the wizard (`source-create-product.ts`)**

1. Import `membershipPeriodsHtml, parseMembershipPeriods, periodsSummary, readMembershipRows, type MembershipPeriodDraft` from `./membership-periods-editor`; extend `ProductGuideRecord` with `fulfillmentType?: string; membershipPeriods?: Array<{ id: string; months: number; amount: number }>`.
2. Replace step 3's section (`<section data-guide-step="3" hidden><label>Precio (Bs)<input name="price" …></label></section>`) with the following, keeping the `<input name="price" …>` element byte-for-byte as it is today:

```html
<section data-guide-step="3" hidden><fieldset class="product-type"><legend>Tipo</legend><label><input type="radio" name="productType" value="PHYSICAL" checked> Producto</label><label><input type="radio" name="productType" value="MEMBERSHIP"> Membresía</label></fieldset><label data-price-field>Precio (Bs)<input name="price" required type="number" min="0" max="21474836.47" step="0.01" inputmode="decimal" placeholder="0.00"></label><div data-membership-periods hidden></div><p class="product-step-help" data-membership-help hidden>Tus miembros eligen un período y reciben un enlace para pagar cada renovación. No se cobra nada automáticamente.</p></section>
```

3. After the form's elements are queried (near where `nameInput` is defined), add:

```ts
  const priceInput = form.elements.namedItem('price') as HTMLInputElement;
  const typeInputs = dialog.querySelectorAll<HTMLInputElement>('[name=productType]');
  const periodsHost = dialog.querySelector<HTMLElement>('[data-membership-periods]')!;
  let periodRows: MembershipPeriodDraft[] = initial?.membershipPeriods?.length
    ? initial.membershipPeriods.map(period => ({ months: period.months as MembershipPeriodDraft['months'], price: (period.amount / 100).toFixed(2) }))
    : [{ months: 1, price: '' }];
  const isMembership = () => dialog.querySelector<HTMLInputElement>('[name=productType]:checked')?.value === 'MEMBERSHIP';
  function drawPeriods() { periodsHost.innerHTML = membershipPeriodsHtml(periodRows); }
  function applyType() {
    const membership = isMembership();
    dialog.querySelector<HTMLElement>('[data-price-field]')!.hidden = membership;
    priceInput.required = !membership;
    periodsHost.hidden = !membership;
    dialog.querySelector<HTMLElement>('[data-membership-help]')!.hidden = !membership;
    if (membership) drawPeriods();
  }
  typeInputs.forEach(input => input.addEventListener('change', applyType));
  periodsHost.addEventListener('click', event => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-period-add],[data-period-remove]');
    if (!button || busy) return;
    periodRows = readMembershipRows(periodsHost);
    if (button.hasAttribute('data-period-add')) {
      const free = ([1, 3, 6, 12] as const).find(months => !periodRows.some(row => row.months === months));
      if (free) periodRows.push({ months: free, price: '' });
    } else periodRows.splice(Number(button.dataset.periodRemove), 1);
    drawPeriods();
  });
  if (initial?.fulfillmentType === 'MEMBERSHIP') typeInputs.forEach(input => { input.checked = input.value === 'MEMBERSHIP'; });
  if (initial?.fulfillmentType === 'DIGITAL') typeInputs.forEach(input => { input.disabled = true; });
  applyType();
```

(If the file already has a variable bound to the price input, reuse it instead of declaring `priceInput`.)
4. Skip steps 6 (options) and 7 (stock) for memberships: in the submit handler change `if (step < 8) { step++; updateStep(); return; }` to `if (step < 8) { step++; if (isMembership() && (step === 6 || step === 7)) step = 8; updateStep(); return; }`, and in the `back` handler change `if (step > 1) { step--; updateStep(); }` to `if (step > 1) { step--; if (isMembership() && (step === 6 || step === 7)) step = 5; updateStep(); }`.
5. In `validateStep()`, add:

```ts
    if (step === 3 && isMembership()) {
      periodRows = readMembershipRows(periodsHost);
      const { problem } = parseMembershipPeriods(periodRows);
      if (problem) { showError(problem); return false; }
    }
```

and make sure the existing step-3 price validation (the loop over `fields` with `reportValidity`) does not fail on the hidden price input: it reads `[data-guide-step="3"] input:not([type=file])`, so exclude hidden ones by changing that selector's `input:not([type=file])` to `input:not([type=file]):not([type=radio])` and skipping inputs inside a `[hidden]` ancestor (`if (field.closest('[hidden]')) continue;`).
6. In the submit handler, right after `const input = { … };` add:

```ts
    if (isMembership()) {
      const { periods, problem } = parseMembershipPeriods(readMembershipRows(periodsHost));
      if (problem) { showError(problem); step = 3; updateStep(); return; }
      Object.assign(input, { fulfillmentType: 'MEMBERSHIP', membershipPeriods: periods, amount: Math.min(...periods.map(period => period.amount)), stock: null });
      delete (input as { variants?: unknown }).variants;
    } else if (initial?.fulfillmentType === 'MEMBERSHIP') Object.assign(input, { fulfillmentType: 'PHYSICAL' });
```

and in the `if (initial) {` branch use `const update: Partial<typeof input> = isMembership() ? { ...input } : { ...input, variants: variants || [] };`.
7. The answer history (`answers()`): where it produces the price answer, return `periodsSummary(readMembershipRows(periodsHost))` when `isMembership()`.
8. `api.ts`: add `fulfillmentType?: 'PHYSICAL' | 'MEMBERSHIP'; membershipPeriods?: Array<{ months: number; amount: number }>` to the `createProduct` input type.
9. Where the Studio builds a `ProductGuideRecord` from the catalog rows to edit a product (`grep -n "createProductForm(" apps/merchant-studio/src/*.ts`), pass `fulfillmentType` and `membershipPeriods` through from the `listForStore` row.

- [ ] **Step 5: Add a wizard test** (append to `source-create-product.test.ts`, reusing its existing `api` mock and the DOM helpers its "creates a product" test uses)

```ts
  it('creates a membership with its periods and skips options and stock', async () => {
    const { dialog, submit, flush } = openCreateForm(); // the file's helper; use its real name
    (dialog.querySelector('[name=name]') as HTMLInputElement).value = 'Club del café';
    submit.click(); await flush();                       // → step 2
    submit.click(); await flush();                       // → step 3
    (dialog.querySelector('[name=productType][value=MEMBERSHIP]') as HTMLInputElement).click();
    (dialog.querySelector('[name=periodPrice]') as HTMLInputElement).value = '50';
    (dialog.querySelector('[data-period-add]') as HTMLButtonElement).click();
    const rows = dialog.querySelectorAll('[data-period-row]');
    (rows[1].querySelector('[name=periodMonths]') as HTMLSelectElement).value = '12';
    (rows[1].querySelector('[name=periodPrice]') as HTMLInputElement).value = '480';
    for (let i = 0; i < 3; i++) { submit.click(); await flush(); } // 3 → 4 → 5 → 8
    expect(dialog.querySelector('[data-product-step]')!.textContent).toBe('Paso 8 de 8');
    submit.click(); await flush();
    expect(api.createProduct).toHaveBeenCalledWith('store_1', expect.objectContaining({ fulfillmentType: 'MEMBERSHIP', membershipPeriods: [{ months: 1, amount: 5000 }, { months: 12, amount: 48000 }], amount: 5000, stock: null }));
  });
```

(Adapt the first line to how the file opens the form and to its store id; step 4 may trigger a YAPI highlights call — the file's existing mock for it applies.)

- [ ] **Step 6: Run tests**

Run: `cd apps/merchant-studio && npx vitest run src/membership-periods-editor.test.ts src/source-create-product.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/merchant-studio/src/membership-periods-editor.ts apps/merchant-studio/src/membership-periods-editor.test.ts apps/merchant-studio/src/source-create-product.ts apps/merchant-studio/src/source-create-product.test.ts apps/merchant-studio/src/api.ts
git commit -m "feat(memberships): Studio product wizard sells memberships with priced periods"
```

(Also add the file changed in step 4.9.)

---

### Task 12: Storefront runtime — membership mode

**Files:**
- Modify: `packages/storefront-kit/kit/commerce.js`
- Create: `apps/api/src/storefront-source/source-commerce-membership.spec.ts`

**Interfaces:**
- Consumes: public items with `fulfillmentType: "MEMBERSHIP"` and `membershipPeriods` (Task 4).
- Produces: membership cards show "Hacerme miembro" (opens the product) and a "Desde … / mes" price; the product view shows period radios and `a[data-membership-join]` → `${checkoutOrigin}/cuenta/<slug>/unirme?producto=<id>&periodo=<periodId>`; memberships never become cart lines (also when restored).

- [ ] **Step 1: Write the failing tests**

`apps/api/src/storefront-source/source-commerce-membership.spec.ts` (harness copied from `source-commerce-product-card.spec.ts`):

```ts
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { kitPath } from '@pagosya/storefront-kit';

const { JSDOM, VirtualConsole } = createRequire(join(__dirname, '../../../checkout/package.json'))('jsdom');
const commerce = readFileSync(kitPath('commerce.js'), 'utf8');
const club = { id: 'club', name: 'Club del café', amount: 5000, currency: 'BOB', stock: null, imageUrls: [], fulfillmentType: 'MEMBERSHIP', variants: [], extras: [],
  membershipPeriods: [{ id: 'm1', months: 1, amount: 5000 }, { id: 'm12', months: 12, amount: 48000 }] };
const windows: any[] = [];
const errors: Error[] = [];
async function open(items: any[] = [club], seed?: (w: any) => void) {
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (error: Error) => { if (!error.message.includes('Could not parse CSS stylesheet')) errors.push(error); });
  const dom = new JSDOM('<html><head></head><body><button data-cart-open>Pedido <span data-cart-count></span></button><section data-pagosya-catalog></section><section data-pagosya-cart></section></body></html>', { url: 'https://shop.test/', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole });
  const w = dom.window; windows.push(w);
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new w.Event('close')); };
  w.HTMLElement.prototype.scrollIntoView = () => {};
  w.matchMedia = () => ({ matches: true });
  seed?.(w);
  const data = { storeName: 'Marca', checkoutMode: 'payment', items };
  w.PAGOSYA_CONFIG = { slug: 'marca', apiBaseUrl: 'https://api.test', checkoutOrigin: 'https://pay.test', data };
  w.fetch = jest.fn(async () => ({ ok: true, json: async () => data }));
  w.eval(commerce);
  await new Promise(resolve => setImmediate(resolve));
  return { w, query: (s: string) => w.document.querySelector(s) };
}
afterEach(() => { windows.splice(0).forEach(w => w.close()); expect(errors.splice(0)).toEqual([]); });

describe('memberships in the kit', () => {
  it('shows "Hacerme miembro" and a "desde" price on the card instead of an add button', async () => {
    const { query } = await open();
    const button = query('.menu-add');
    expect(button.textContent).toContain('Hacerme miembro');
    expect(button.hasAttribute('data-add')).toBe(false);
    expect(query('.menu-item__price').textContent).toContain('/ mes');
  });

  it('lists the periods and links the join button to the account checkout with the chosen period', async () => {
    const { query, w } = await open();
    query('.menu-add').click();
    const radios = w.document.querySelectorAll('[name=membershipPeriod]');
    expect(radios).toHaveLength(2);
    expect(query('[data-membership-join]').getAttribute('href')).toBe('https://pay.test/cuenta/marca/unirme?producto=club&periodo=m1');
    radios[1].checked = true; radios[1].dispatchEvent(new w.Event('change', { bubbles: true }));
    expect(query('[data-membership-join]').getAttribute('href')).toBe('https://pay.test/cuenta/marca/unirme?producto=club&periodo=m12');
    expect(query('[data-pagosya-product]').textContent).toContain('no se cobra nada automáticamente');
    expect(query('[data-pagosya-product] [data-add]')).toBeNull();
  });

  it('drops a membership from a restored cart', async () => {
    const { query } = await open([club], w => w.localStorage.setItem(CART_KEY, JSON.stringify([{ id: 'club', quantity: 1 }])));
    expect(query('[data-cart-count]').textContent.trim()).toMatch(/^0?$/);
  });
});
```

Set `const CART_KEY = '…'` at the top to the key the runtime saves the cart under (search `localStorage.setItem` in `commerce.js`; if the key includes the slug, build it for `marca`), and match the saved shape to what `restoreCart(items)` reads (`[{ id, quantity, … }]`).

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/api && npx jest src/storefront-source/source-commerce-membership.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Implement in `commerce.js`**

Near `subscriptionsAvailable` (≈ line 272) add:

```js
  /* Memberships (spec 2026-10-09): chosen by period and joined on the trusted checkout origin, never added to the cart. */
  const MEMBERSHIP_LABEL = { 1: 'Mensual', 3: 'Trimestral', 6: 'Semestral', 12: 'Anual' };
  const MEMBERSHIP_SUFFIX = { 1: '/ mes', 3: '/ 3 meses', 6: '/ 6 meses', 12: '/ año' };
  const isMembership = p => p?.fulfillmentType === 'MEMBERSHIP' && Array.isArray(p.membershipPeriods) && p.membershipPeriods.length > 0;
  const cheapestPeriod = p => p.membershipPeriods.reduce((best, period) => (period.amount < best.amount ? period : best));
  const membershipJoinUrl = (p, periodId) => { try { return new URL(`/cuenta/${encodeURIComponent(config.slug)}/unirme?producto=${encodeURIComponent(p.id)}&periodo=${encodeURIComponent(periodId)}`, config.checkoutOrigin).href; } catch { return ''; } };
  const membershipPriceText = p => { const period = cheapestPeriod(p); return `Desde ${money(period.amount, p.currency)} ${MEMBERSHIP_SUFFIX[period.months] || ''}`.trim(); };
  function membershipMarkup(p) {
    const first = p.membershipPeriods[0];
    const join = membershipJoinUrl(p, first.id);
    return `<fieldset class="product-detail__membership" data-membership-choice><legend>Elige tu período</legend>${p.membershipPeriods.map((period, index) => `<label><input type="radio" name="membershipPeriod" value="${escape(period.id)}"${index ? '' : ' checked'}><span>${escape(MEMBERSHIP_LABEL[period.months] || `Cada ${period.months} meses`)}</span><strong>${money(period.amount, p.currency)}</strong></label>`).join('')}</fieldset>`
      + (preview || config.demo || !join ? '<button class="product-detail__buy checkout-button" disabled>Hacerme miembro</button>' : `<a class="product-detail__buy checkout-button" data-membership-join href="${escape(join)}">Hacerme miembro</a>`)
      + '<p class="product-detail__membership-note">Cada período te enviaremos un enlace para pagar; no se cobra nada automáticamente.</p>';
  }
```

(`preview`, `money`, `escape` are existing runtime identifiers used by the default card; if `preview` is not in scope at this point, use the same expression the default card uses.)

`cartLine(key)`: after `p` has been resolved in both branches (plain id and JSON key) and before the function's first `return` that uses `p`, add `if (isMembership(p)) return null;`.

Default card (`return \`<article class="menu-item">…`): change the price to `<strong class="menu-item__price">${isMembership(p) ? escape(membershipPriceText(p)) : money(price(p), p.currency)}</strong>` and put a membership case in front of the buy-button ternary:

```js
${isMembership(p) ? `<button class="menu-add" type="button" data-product="${escape(p.id)}" aria-label="Hacerme miembro de ${escape(p.name)}">Hacerme miembro</button>` : soldOut(p) && complex ? …the existing chain unchanged… }
```

`customProductCard`: change `fill('price', money(price(p), p.currency), 'menu-item__price');` to `fill('price', isMembership(p) ? membershipPriceText(p) : money(price(p), p.currency), 'menu-item__price');`. After `buy.classList.add('menu-add'); buy.type = 'button';` insert:

```js
    if (isMembership(p)) {
      buy.dataset.product = p.id; buy.disabled = false; buy.textContent = 'Hacerme miembro';
      buy.setAttribute('aria-label', `Hacerme miembro de ${p.name}`);
    } else {
```

and close this `else {` right after the existing chain that sets `buy.dataset.add`, `buy.disabled`, `aria-label`, the sold-out text and the "Elegir opciones" cases, so those lines only run for non-memberships.

`openProduct`: change `<div class="product-detail__pricing" data-product-pricing>${priceMarkup(p)}</div>` to `<div class="product-detail__pricing" data-product-pricing>${isMembership(p) ? `<strong class="product-detail__price">${escape(membershipPriceText(p))}</strong>` : priceMarkup(p)}</div>`; wrap the purchase expression — the `${groups ? \`${optionsMarkup(groups)}…` ternary that ends right before `<p class="product-detail__status"` — as `${isMembership(p) ? membershipMarkup(p) : (THE_EXISTING_TERNARY)}`; change the sticky bar's `<button type="button" data-product-jump>Añadir</button>` to `<button type="button" data-product-jump>${isMembership(p) ? 'Hacerme miembro' : 'Añadir'}</button>`.

Where `detail` is set up once (search `const detail =`), add a single listener:

```js
  detail.addEventListener('change', event => {
    const input = event.target;
    if (!input?.matches?.('[name=membershipPeriod]') || !selectedProduct) return;
    const join = detail.querySelector('[data-membership-join]');
    if (join) join.href = membershipJoinUrl(selectedProduct, input.value);
  });
```

Hosted stores: the runtime's existing link handler (≈ line 372) already posts `pagosya:source-external` for absolute http(s) links when hosted; Task 13 allows `/cuenta/<slug>/unirme` in `isAccountDestination`, so no runtime change is needed for navigation.

CSS — add next to the `.product-detail__subscription` rules:

```css
    [data-pagosya-product][data-style] .product-detail__membership{display:grid;gap:8px;min-width:0;margin:0 0 18px;padding:14px 16px;border:1px solid var(--pd-line);border-radius:var(--pd-radius);background:var(--pd-tint)}
    [data-pagosya-product][data-style] .product-detail__membership legend{padding:0;font-size:12px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:var(--pd-muted)}
    [data-pagosya-product][data-style] .product-detail__membership label{display:flex;align-items:center;gap:10px;min-height:44px;margin:0;font-size:15px;cursor:pointer}
    [data-pagosya-product][data-style] .product-detail__membership label strong{margin-left:auto;font-variant-numeric:tabular-nums}
    [data-pagosya-product][data-style] .product-detail__membership input[type=radio]{flex:none;width:18px;height:18px;margin:0;accent-color:var(--pd-accent)}
    [data-pagosya-product][data-style] .product-detail__membership-note{margin:10px 0 0;font-size:13px;line-height:1.5;color:var(--pd-muted)}
```

- [ ] **Step 4: Run tests, the kit checks and the existing kit suites**

Run: `cd apps/api && npx jest src/storefront-source/source-commerce && cd ../../packages/storefront-kit && node kit/check-runtimes.mjs`
Expected: PASS; check-runtimes reports no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/storefront-kit/kit/commerce.js apps/api/src/storefront-source/source-commerce-membership.spec.ts
git commit -m "feat(memberships): store runtime shows periods and Hacerme miembro, never a cart button"
```

---

### Task 13: Checkout app — join page, Mis membresías, built-in store pages

**Files:**
- Create: `apps/checkout/src/account/membership-views.ts`
- Create: `apps/checkout/src/account/membership-views.test.ts`
- Modify: `apps/checkout/src/account/account-api.ts`
- Modify: `apps/checkout/src/account/account-page.ts`
- Modify: `apps/checkout/src/account-destinations.ts` (+ `account-destinations.test.ts`)
- Modify: `apps/checkout/src/api.ts` (`StoreItem`)
- Modify: `apps/checkout/src/storefront/product-page.ts`
- Modify: `apps/checkout/src/cart-state.ts` (`restoreCart`) (+ `cart-state.test.ts`)
- Modify: `apps/checkout/src/stores.ts` (catalog card button for memberships)

**Interfaces:**
- Consumes: Task 5/8 endpoints, `MemberView` shape.
- Produces:
  - `accountApi.memberships(slug, token)`, `accountApi.joinMembership(slug, token, body)`, `accountApi.membershipAction(slug, token, id, action, periodId?)`
  - `rememberJoin(slug, query)`, `takePendingJoin(slug): string | null` (sessionStorage key `pagosya:join:<slug>`)
  - `joinHtml(context, product, periodId, error?)`, `alreadyMemberHtml(context, message)`, `membershipsHtml(context, rows)`, `membershipPurchaseHtml(slug, product)` in `membership-views.ts`
  - Account views `"unirme"` and `"membresias"`.

- [ ] **Step 1: Write the failing tests**

`apps/checkout/src/account/membership-views.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { joinHtml, membershipPurchaseHtml, membershipsHtml, rememberJoin, takePendingJoin } from './membership-views';

const context = { slug: 'cafe', storeName: 'Café Norte', signedIn: true };
const club = { id: 'club', name: 'Club del café', currency: 'BOB', fulfillmentType: 'MEMBERSHIP', membershipPeriods: [{ id: 'm1', months: 1, amount: 5000 }, { id: 'm12', months: 12, amount: 48000 }] } as any;

describe('pending join', () => {
  beforeEach(() => sessionStorage.clear());
  it('survives sign-in, registration and email confirmation, and is read once', () => {
    rememberJoin('cafe', '?producto=club&periodo=m12');
    expect(takePendingJoin('cafe')).toBe('?producto=club&periodo=m12');
    expect(takePendingJoin('cafe')).toBeNull();
  });
  it('ignores anything that is not a membership query', () => {
    rememberJoin('cafe', 'javascript:alert(1)');
    expect(takePendingJoin('cafe')).toBeNull();
  });
});

describe('joinHtml', () => {
  it('shows the chosen period, the price, the consent and a pay button', () => {
    const html = joinHtml(context, club, 'm12');
    expect(html).toContain('Club del café');
    expect(html).toMatch(/value="m12" checked/);
    expect(html).toContain('Cada período te enviaremos un enlace para pagar; no se cobra nada automáticamente.');
    expect(html).toContain('data-form="join"');
  });
});

describe('membershipsHtml', () => {
  it('shows state, activa hasta and only the actions that apply', () => {
    const html = membershipsHtml(context, [
      { id: 's1', productId: 'club', name: 'Club del café', state: 'ACTIVE', stateLabel: 'Activa', accessUntil: '2026-12-12T12:00:00Z', nextBillingAt: '2026-12-12T12:00:00Z', amount: 5000, currency: 'BOB', period: { id: 'm1', months: 1, label: 'Mensual' }, pendingPeriod: null, periods: [{ id: 'm1', months: 1, amount: 5000, label: 'Mensual' }, { id: 'm12', months: 12, amount: 48000, label: 'Anual' }], renewalUrl: 'https://pagar.test/#client_secret=x' },
      { id: 's2', productId: 'yoga', name: 'Yoga', state: 'LAPSED', stateLabel: 'Vencida', accessUntil: '2026-09-01T12:00:00Z', nextBillingAt: null, amount: 9000, currency: 'BOB', period: { id: 'y1', months: 1, label: 'Mensual' }, pendingPeriod: null, periods: [], renewalUrl: null },
    ] as any);
    expect(html).toContain('Activa hasta');
    expect(html).toContain('href="https://pagar.test/#client_secret=x"');
    expect(html).toContain('data-member-action="cancel" data-id="s1"');
    expect(html).toContain('href="/cuenta/cafe/unirme?producto=yoga&amp;periodo=y1"');
    expect(html).not.toContain('data-member-action="cancel" data-id="s2"');
  });
});

describe('membershipPurchaseHtml', () => {
  it('sends the built-in product page to the account join page with the period', () => {
    const html = membershipPurchaseHtml('cafe', club);
    expect(html).toContain('action="/cuenta/cafe/unirme"');
    expect(html.match(/name="periodo"/g)).toHaveLength(2);
  });
});
```

Append to `account-destinations.test.ts`:

```ts
  it('lets a store send the shopper to the membership checkout and Mis membresías', () => {
    expect(isAccountDestination(new URL('https://pay.test/cuenta/cafe/unirme?producto=club&periodo=m1'), 'https://pay.test', 'cafe')).toBe(true);
    expect(isAccountDestination(new URL('https://pay.test/cuenta/cafe/membresias'), 'https://pay.test', 'cafe')).toBe(true);
  });
```

Append to `cart-state.test.ts`, using the file's store fixture helper and its saved-cart key; give the store an item `{ id: 'club', fulfillmentType: 'MEMBERSHIP', … }` and save one `club` line:

```ts
  it('drops a membership product from a restored cart', () => {
    const cart = restoreCart(store, () => null, () => null);
    expect([...cart.keys()].some(key => key.includes('club'))).toBe(false);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/checkout && npx vitest run src/account/membership-views.test.ts src/account-destinations.test.ts src/cart-state.test.ts`
Expected: FAIL.

- [ ] **Step 3: API client, types and destinations**

`account-api.ts`:

```ts
export type MemberPeriod = { id: string; months: number; label: string; amount?: number };
export type MemberView = { id: string; productId: string; name: string; state: "ACTIVE" | "GRACE" | "LAPSED" | "CANCELED_ACTIVE" | "CANCELED"; stateLabel: string;
  accessUntil: string | null; nextBillingAt: string | null; amount: number; currency: string; period: MemberPeriod | null; pendingPeriod: MemberPeriod | null;
  periods: Array<MemberPeriod & { amount: number }>; renewalUrl: string | null };
```

and in `accountApi`:

```ts
  memberships: (slug: string, token: string) => call<MemberView[]>(slug, "me/memberships", { token }),
  joinMembership: (slug: string, token: string, body: { productId: string; periodId: string; consent: true }) => call<{ checkoutUrl: string }>(slug, "me/memberships", { method: "POST", token, body }),
  membershipAction: (slug: string, token: string, id: string, action: "cancel" | "resume" | "period", periodId?: string) => call<MemberView>(slug, `me/memberships/${encodeURIComponent(id)}/${action}`, { method: "POST", token, body: periodId ? { periodId } : {} }),
```

`api.ts` `StoreItem`: `fulfillmentType?: 'PHYSICAL' | 'DIGITAL' | 'MEMBERSHIP';` and `membershipPeriods?: Array<{ id: string; months: number; amount: number }>;`.

`account-destinations.ts`: add `'unirme', 'membresias'` to `VIEWS`.

- [ ] **Step 4: `membership-views.ts`**

```ts
import type { StoreItem } from "../api";
import { escapeHtml, formatAmount } from "../ui/html";
import type { MemberView } from "./account-api";

/** Membership pages of a shopper's account (spec 2026-10-09 §2). Pure markup; account-page.ts owns events. */
const CONSENT = "Cada período te enviaremos un enlace para pagar; no se cobra nada automáticamente.";
const LABEL: Record<number, string> = { 1: "Mensual", 3: "Trimestral", 6: "Semestral", 12: "Anual" };
const label = (months: number) => LABEL[months] ?? `Cada ${months} meses`;
type Context = { slug: string; storeName: string; signedIn: boolean; preview?: boolean };
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("es-BO", { day: "numeric", month: "long", year: "numeric" }) : "");
const joinPath = (slug: string, productId: string, periodId: string) => `/cuenta/${encodeURIComponent(slug)}/unirme?producto=${encodeURIComponent(productId)}&periodo=${encodeURIComponent(periodId)}`;
const JOIN_QUERY = /^\?producto=[\w-]{1,40}&periodo=[\w-]{1,40}$/;
const key = (slug: string) => `pagosya:join:${slug}`;

export function rememberJoin(slug: string, query: string) {
  if (!JOIN_QUERY.test(query)) return;
  try { sessionStorage.setItem(key(slug), query); } catch {}
}
export function takePendingJoin(slug: string): string | null {
  try {
    const value = sessionStorage.getItem(key(slug));
    sessionStorage.removeItem(key(slug));
    return value && JOIN_QUERY.test(value) ? value : null;
  } catch { return null; }
}

export function joinHtml(context: Context, product: StoreItem, periodId: string, error = ""): string {
  const periods = product.membershipPeriods ?? [];
  const chosen = periods.some(period => period.id === periodId) ? periodId : periods[0]?.id;
  return `<h1>Hazte miembro</h1><section class="card"><h2>${escapeHtml(product.name)}</h2>
    <form data-form="join" data-product="${escapeHtml(product.id)}" novalidate><fieldset><legend>Período</legend>${periods.map(period => `<label><input type="radio" name="periodId" value="${escapeHtml(period.id)}"${period.id === chosen ? " checked" : ""}> ${escapeHtml(label(period.months))} · <strong>${escapeHtml(formatAmount(period.amount, product.currency))}</strong></label>`).join("")}</fieldset>
    <label><input type="checkbox" name="consent" required> ${escapeHtml(CONSENT)}</label>
    ${error ? `<p role="alert">${escapeHtml(error)}</p>` : ""}<button type="submit" class="primary">Pagar y hacerme miembro</button></form></section>`;
}

export function alreadyMemberHtml(context: Context, message: string): string {
  return `<h1>Ya eres miembro</h1><p>${escapeHtml(message)}</p><p><a class="primary" href="/cuenta/${encodeURIComponent(context.slug)}/membresias">Ver mis membresías</a></p>`;
}

export function membershipsHtml(context: Context, rows: MemberView[]): string {
  if (!rows.length) return `<h1>Mis membresías</h1><p>Aún no eres miembro en esta tienda.</p>`;
  const item = (row: MemberView) => {
    const actions: string[] = [];
    if (row.renewalUrl) actions.push(`<a class="primary" href="${escapeHtml(row.renewalUrl)}">Pagar renovación</a>`);
    if (row.state === "ACTIVE" || row.state === "GRACE") {
      if (row.periods.length > 1) actions.push(`<label>Cambiar período<select data-member-period data-id="${escapeHtml(row.id)}">${row.periods.map(period => `<option value="${escapeHtml(period.id)}"${period.id === (row.pendingPeriod ?? row.period)?.id ? " selected" : ""}>${escapeHtml(period.label)} · ${escapeHtml(formatAmount(period.amount, row.currency))}</option>`).join("")}</select></label>`);
      actions.push(`<button type="button" class="quiet" data-member-action="cancel" data-id="${escapeHtml(row.id)}">Cancelar</button>`);
    }
    if (row.state === "CANCELED_ACTIVE") actions.push(`<button type="button" data-member-action="resume" data-id="${escapeHtml(row.id)}">Reanudar</button>`);
    if ((row.state === "LAPSED" || row.state === "CANCELED") && row.period) actions.push(`<a class="primary" href="${escapeHtml(joinPath(context.slug, row.productId, row.period.id))}">Reactivar</a>`);
    const until = row.accessUntil && row.state !== "CANCELED" && row.state !== "LAPSED" ? ` · Activa hasta ${escapeHtml(day(row.accessUntil))}` : "";
    const next = row.nextBillingAt && row.state === "ACTIVE" ? ` · próximo cobro ${escapeHtml(day(row.nextBillingAt))}` : "";
    return `<li class="card"><strong>${escapeHtml(row.name)}</strong> · <span class="badge">${escapeHtml(row.stateLabel)}</span>
      <p>${row.period ? `${escapeHtml(row.period.label)} · ${escapeHtml(formatAmount(row.amount, row.currency))}` : ""}${until}${next}</p>
      ${row.pendingPeriod ? `<p class="faint">Desde la próxima renovación: ${escapeHtml(row.pendingPeriod.label)}.</p>` : ""}
      <div class="account__actions">${actions.join("")}</div></li>`;
  };
  return `<h1>Mis membresías</h1><ul class="account__list">${rows.map(item).join("")}</ul><p class="faint">${escapeHtml(CONSENT)}</p>`;
}

export function membershipPurchaseHtml(slug: string, product: StoreItem): string {
  const periods = product.membershipPeriods ?? [];
  if (!periods.length) return "";
  return `<form class="product-detail-purchase" data-membership-purchase action="/cuenta/${encodeURIComponent(slug)}/unirme" method="get"><input type="hidden" name="producto" value="${escapeHtml(product.id)}"><fieldset><legend>Elige tu período</legend>${periods.map((period, index) => `<label><input type="radio" name="periodo" value="${escapeHtml(period.id)}"${index ? "" : " checked"}> ${escapeHtml(label(period.months))} · <strong>${escapeHtml(formatAmount(period.amount, product.currency))}</strong></label>`).join("")}</fieldset><button type="submit" class="primary">Hacerme miembro</button><p class="faint">${escapeHtml(CONSENT)}</p></form>`;
}
```

- [ ] **Step 5: Account page wiring (`account-page.ts`)**

1. `ACCOUNT_VIEWS` gains `"unirme", "membresias"`; `SIGNED_IN_VIEWS` gains `"membresias"`; `NAV_LABEL` gains `membresias: "Membresías"`.
2. Import `alreadyMemberHtml, joinHtml, membershipsHtml, rememberJoin, takePendingJoin` from `./membership-views`.
3. In `show(view)`, before `if (accountPreview()) { app.innerHTML = accountPreviewHtml(context, view); return; }`, add:

```ts
  if (view === "unirme" && !accountPreview()) {
    const query = window.location.search;
    if (!token) { rememberJoin(slug, query); app.innerHTML = loginHtml(context, "Ingresa o crea tu cuenta para hacerte miembro."); return; }
    const params = new URLSearchParams(query);
    const store = await fetchStore(slug).catch(() => null);
    const product = store?.items.find(item => item.id === params.get("producto") && item.fulfillmentType === "MEMBERSHIP");
    if (!product) { app.innerHTML = shell(context, `<h1>Membresía no disponible</h1><p>Esta membresía ya no está disponible.</p><p><a href="/s/${encodeURIComponent(slug)}">Volver a la tienda</a></p>`); return; }
    const mine = await accountApi.memberships(slug, token).catch(() => []);
    const current = mine.find(row => row.productId === product.id && ["ACTIVE", "GRACE", "CANCELED_ACTIVE"].includes(row.state));
    app.innerHTML = shell(context, current
      ? alreadyMemberHtml(context, `Ya eres miembro hasta el ${new Date(current.accessUntil!).toLocaleDateString("es-BO", { day: "numeric", month: "long", year: "numeric" })}.`)
      : joinHtml(context, product, params.get("periodo") ?? ""));
    return;
  }
```

4. In the signed-in `try`, add `else if (view === "membresias") app.innerHTML = shell(context, membershipsHtml(context, await accountApi.memberships(slug, token)));`.
5. A helper next to `go`:

```ts
async function afterSignIn(slug: string) {
  const pending = takePendingJoin(slug);
  if (pending) { window.history.pushState({}, "", `${path(slug, "unirme")}${pending}`); await show("unirme"); }
  else await go("pedidos");
}
```

In `onSubmit`'s `login` branch replace `await go("pedidos");` with `await afterSignIn(slug);`, and in `show`'s `ingresar` branch replace `if (token) { await go("pedidos"); return; }` with `if (token) { await afterSignIn(slug); return; }`.
6. In `onSubmit`, before the `profile` branch:

```ts
    } else if (token && name === "join") {
      const periodId = form.querySelector<HTMLInputElement>('[name=periodId]:checked')?.value ?? "";
      if (!(form.elements.namedItem("consent") as HTMLInputElement).checked) { say("Acepta las condiciones de la membresía para continuar.", true); return; }
      try {
        const { checkoutUrl } = await accountApi.joinMembership(slug, token, { productId: form.dataset.product!, periodId, consent: true });
        window.location.assign(checkoutUrl);
      } catch (error) {
        if (error instanceof AccountError && error.status === 409) { app.innerHTML = shell({ slug, storeName: state.storeName, signedIn: true }, alreadyMemberHtml({ slug, storeName: state.storeName, signedIn: true }, error.message)); return; }
        throw error;
      }
```

7. In `onClick`, extend the target selector with `[data-member-action]` and handle it (after the `data-retry`/`data-logout` checks, inside the `try`):

```ts
    if (target.hasAttribute("data-member-action")) {
      const action = target.dataset.memberAction as "cancel" | "resume";
      await accountApi.membershipAction(slug, token, target.dataset.id!, action);
      await show("membresias");
      say(action === "cancel" ? "Cancelamos las renovaciones. Tu acceso sigue hasta la fecha pagada." : "Tu membresía vuelve a renovarse.");
    }
```

8. Add a change handler and bind it in `renderAccount` next to submit/click (`app.addEventListener("change", onChange);`):

```ts
async function onChange(event: Event) {
  const select = (event.target as HTMLElement).closest<HTMLSelectElement>("[data-member-period]");
  const token = readSession(state.slug);
  if (!select || !token || accountPreview()) return;
  try {
    await accountApi.membershipAction(state.slug, token, select.dataset.id!, "period", select.value);
    await show("membresias");
    say("Listo: el nuevo período aplica desde la próxima renovación.");
  } catch (error) { say(messageOf(error), true); }
}
```

- [ ] **Step 6: Built-in store pages and cart**

- `cart-state.ts` `restoreCart`: where each saved line's item is looked up, treat `item.fulfillmentType === 'MEMBERSHIP'` like a missing product (skip the line).
- `storefront/product-page.ts`: import `membershipPurchaseHtml` from `../account/membership-views` and wrap the `<div class="product-detail-purchase">…</div>` element (it starts right after the `data-subscription-slot` line) as `${item.fulfillmentType === "MEMBERSHIP" ? membershipPurchaseHtml(slug, item) : \`<div class="product-detail-purchase">…existing…</div>\`}`, using the slug variable already in scope in that render function.
- `stores.ts`: find the catalog card's add button (`grep -n "data-add" apps/checkout/src/stores.ts`); for `item.fulfillmentType === "MEMBERSHIP"` render `<a class="<the add button's existing class>" href="/s/${encodeURIComponent(slug)}/p/${encodeURIComponent(item.id)}">Hacerme miembro</a>` instead.

- [ ] **Step 7: Run tests and typecheck**

Run: `cd apps/checkout && npx vitest run && npx tsc --noEmit -p tsconfig.json`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/checkout/src/account/membership-views.ts apps/checkout/src/account/membership-views.test.ts apps/checkout/src/account/account-api.ts apps/checkout/src/account/account-page.ts apps/checkout/src/account-destinations.ts apps/checkout/src/account-destinations.test.ts apps/checkout/src/api.ts apps/checkout/src/storefront/product-page.ts apps/checkout/src/cart-state.ts apps/checkout/src/cart-state.test.ts apps/checkout/src/stores.ts
git commit -m "feat(memberships): join checkout and Mis membresías in the store account; built-in pages sell memberships"
```

---

### Task 14: YAPI knows memberships

**Files:**
- Modify: `apps/api/src/storefront-source/source-generation.service.ts` (the runtime-classes paragraph that mentions `product-detail__subscription`, ≈ line 544)
- Modify: the spec that asserts that paragraph (`grep -rln "product-detail__subscription" apps/api/src/storefront-source/*.spec.ts`)

**Interfaces:**
- Produces: the store-writing prompt states the membership contract.

- [ ] **Step 1: Write the failing test** (in the spec found above, next to its subscription-paragraph assertion, reading the prompt text the same way it does)

```ts
  it('tells the author how membership products render', () => {
    expect(promptText).toContain('A membership product (fulfillmentType MEMBERSHIP) renders product-detail__membership');
    expect(promptText).toContain('never add a cart button for it');
    expect(promptText).not.toMatch(/cobro automático|automatic(ally)? charg/i);
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/api && npx jest src/storefront-source -t "membership products render"`
Expected: FAIL.

- [ ] **Step 3: Add the sentence**

In the paragraph containing `…style that group in the store’s own language.`, insert right after that sentence:

```
 A membership product (fulfillmentType MEMBERSHIP) renders product-detail__membership (a fieldset of period radios with prices), a "Hacerme miembro" link (product-detail__buy) and product-detail__membership-note; its card button reads "Hacerme miembro" and opens the product. Style them in the same language as the subscription group, and never add a cart button for it.
```

- [ ] **Step 4: Run tests**

Run: `cd apps/api && npx jest src/storefront-source`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/storefront-source/source-generation.service.ts <the spec file edited in Step 1>
git commit -m "feat(memberships): YAPI's store contract covers membership products"
```

---

### Task 15: Owner applies the migration; live walk-through on dev

**Files:** none (verification only). Report results in the final summary.

- [ ] **Step 1: Owner applies the migration.** Ask the owner to run in their terminal: `! cd apps/api && npx prisma migrate deploy`. Do not run it yourself. Then confirm read-only: `cd apps/api && echo "SELECT migration_name FROM _prisma_migrations WHERE migration_name = '20261009120000_sellable_memberships';" | npx prisma db execute --stdin` (a SELECT changes nothing).

- [ ] **Step 2: Rebuild what the owner's dev servers serve.** The dashboard serves a pre-built Studio: rebuild it the way the last Studio change did (`git log -3 --format='%h %s' -- apps/merchant-studio` and that commit's notes; typically `cd apps/merchant-studio && npm run build`), and restart the API process the owner uses.

- [ ] **Step 3: Walk through** with the browser tools on a test store, recording `memberships_join.gif` for steps 1–3:
  1. Studio → Nuevo producto → Membresía; periods Mensual Bs 50 + Anual Bs 480 → saved; the store card shows "Desde Bs 50,00 / mes" and "Hacerme miembro".
  2. Store → product → Anual → "Hacerme miembro" → `/cuenta/<slug>/unirme?…` → sign in → review shows Anual Bs 480 and the consent line → pay with the test rail → Mi cuenta → Membresías shows Activa, activa hasta one year ahead.
  3. "Hacerme miembro" again → "Ya eres miembro hasta …".
  4. With the owner's approval, move that member's `accessUntil`/`nextBillingAt` to 4 days ahead and run the worker once → renewal email and "Pagar renovación" in Mi cuenta.
  5. With the owner's approval, move the renewal's `dueAt` back past the grace days and run the worker → Vencida; "Reactivar" opens the join page.
  6. Dashboard → Suscripciones → Miembros lists the member with period and state; grace days save.

- [ ] **Step 4: Report** what passed and what did not, with the GIF path.

---

## Self-Review Notes

- Spec coverage: §1 (type, periods, archive, grace, data) → Tasks 1, 3, 9, 10, 11; §2 (store pages, checkout, already-member, after payment, Mi cuenta) → Tasks 4, 5, 6, 8, 12, 13; §3 (notice, reminders, paid, missed, reactivation, archive, cancel, derived state) → Tasks 2, 6, 7, 8; §4 (Miembros tab, YAPI, guards, testing) → Tasks 4, 9, 10, 12, 14, 15.
- Reminders reuse `sendDueSubscriptionReminders` unchanged (due date, then 3 days later); `sendChargeNotice`'s membership branch gives them membership copy, and LAPSED rows are skipped because that loop requires `status === "ACTIVE"`.
- Names used across tasks are consistent: `MembershipState`, `MemberView`, `membershipTermsPeriod`, `membershipPeriodsFor`, `applyMembershipJoin`, `applyMembershipRenewalPaid`, `expireLapsedMemberships`, `syncMembershipPeriods`, `MEMBERSHIP_PRODUCT_FIELDS`, `MEMBERSHIP_NOTICE_HOURS`.
