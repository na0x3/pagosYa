# Subscribe & Save Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merchants offer Subscribe & Save on products; buyers subscribe on the product page, pay the first order in the normal checkout, get a one-tap pay link before every renewal, and manage their subscription from a public page.

**Architecture:** Product subscriptions reuse `CustomerSubscription` / `SubscriptionInvoice` and the 15-minute renewal engine in `apps/api/src/operations/subscriptions.service.ts`. Pure helpers (pricing, cadence, terms, token) live in small files next to it. Enrollment runs inside the payment's success transaction and never throws. Each renewal creates a `StoreOrder` in `AWAITING_PAYMENT` whose intent carries `metadata.cart`, so the existing paid hook moves it to Pedidos, decrements stock and sends the receipt. Both storefront runtimes (the checkout app's product page and the kit `commerce.js`) get the choice; the dashboard gets a Suscripciones page with a settings tab; the checkout app gets `/suscripcion/:token`.

**Tech Stack:** NestJS + Prisma (Postgres), Jest (`apps/api`), Vitest (`apps/checkout`), vanilla JS + `node --test` (`apps/merchant-dashboard`), kit runtime JS (`packages/storefront-kit`).

**Spec:** `docs/superpowers/specs/2026-09-28-subscribe-and-save-design.md`

**Spec clarifications found while planning (the plan follows these):**
1. `/s/…` is already the storefront path in `apps/checkout/server.mjs`; the manage page is **`/suscripcion/:token`**.
2. One order can start several subscriptions, so `sourceOrderId` is indexed, **not unique**.
3. No `manageToken` column: the public token is an HMAC of the subscription id, exactly like `apps/api/src/consumer/order-tracking-token.ts` (context `pagosya-subscription-manage-v1`, secret `app.orderTrackingSecret`).
4. There is no generic store-settings PATCH; feature toggles have their own endpoints. The switch is **`PUT v1/stores/:storeId/subscriptions/settings { enabled }`**.
5. There are two product pages: `apps/checkout/src/storefront/product-page.ts` (checkout-app stores) and `packages/storefront-kit/kit/commerce.js` (kit/YAPI stores). Both get the choice.
6. The buyer's email arrives at payment confirm (`ConfirmPaymentIntentDto.customerEmail`), not with the cart. Consent is sent with the cart (`subscriptionConsent: true`); confirm rejects a subscription cart without an email.
7. Renewal intents carry `metadata.cart` (so stock, sales stats and the receipt work unchanged) **and** `metadata.subscription`; enrollment ignores intents that have `metadata.subscription`.
8. The "manage" and "subscription started" text rides in the existing `ORDER_CONFIRMATION` receipt's `details` (as the spec says); renewal notices use `EmailService` directly like today's subscription charge emails, so they are sent even when the merchant disabled workspace templates.

## Global Constraints

- Cadences: `WEEKLY` = 7 days, `BIWEEKLY` = 14 days, `MONTHLY` = one calendar month (UTC month arithmetic, as today's `advanceBilling`).
- Subscription line price: `min(oneTimeUnit, round(base × (100 − d) / 100)) + extras`; locked renewal unit: `round(base × (100 − d) / 100) + extras`. *base* = variant (or product) amount before scheduled discounts; *oneTimeUnit* = `discountedProductAmount(link, base)`.
- Subscription lines never enter bundle matching; promo codes and store credit apply to the first order only.
- Eligible: product ACTIVE, not `DIGITAL`, has an option for the cadence, `Store.subscriptionsEnabled = true`. Carrier shipping (`shipping.carrierId`) with a subscription line → 400 `Las suscripciones todavía no se envían por courier. Elige retiro o entrega local.`
- Consent text (exact): `Acepto que este pedido se repita {cadenceLabel}. Antes de cada entrega recibiré un enlace para pagar; no se cobra nada automáticamente. Puedo saltar, pausar o cancelar cuando quiera.` where cadenceLabel ∈ `cada semana` | `cada dos semanas` | `cada mes`.
- Renewal timeline: order + intent at D − 72 h; reminder at D; last reminder at D + 3 days; unpaid at D + 7 days → order CANCELED, intent CANCELED (only from `REQUIRES_PAYMENT_METHOD`/`FAILED`), invoice `MISSED`, `missedCount + 1`; two consecutive misses → `PAUSED`. A paid renewal sets `missedCount = 0`.
- Price change: pending price effective for renewals generated ≥ 7 days after "Aplicar precio actual".
- Livemode rule: `merchant.status === ACTIVE && store.status === "ACTIVE"`.
- Paid-hook code never throws on data it reads (a failed statement aborts the payment's transaction); duplicates use `createMany … skipDuplicates`.
- Copy is Spanish (Bolivia); never promise an automatic charge.
- **Dev database:** no subagent runs `prisma migrate dev|reset|diff` or `db push`. The migration is written by hand as SQL; the main session applies it with `pnpm --filter api exec prisma migrate deploy` only after the owner agrees.
- `apps/merchant-dashboard/server.mjs` must whitelist every new `/src/*` file; `apps/checkout/server.mjs` must route and noindex `/suscripcion/:token`.

## Review Focus

- A subscription line whose product is archived (or offer removed) between checkout and payment: the payment still succeeds as a normal order; no subscription, no throw. → Task 6 test "skips lines whose product changed".
- The buyer opens an old renewal pay link after the period was marked MISSED: the intent is CANCELED, so it cannot be paid. → Task 7 test "expires unpaid renewals at D+7 and cancels intent and order".
- The worker runs twice for the same period: exactly one invoice, one intent, one order. → Task 7 test "reuses the renewal order on a second run".
- The same product once and on subscription in one cart: two lines, two prices, only the subscription line enrolls. → Task 5 test "prices a mixed cart", Task 6 first test, Task 10 test "keeps one-time and subscription lines apart".
- The buyer switches to a frequency the merchant has since removed: 400 `Esa frecuencia ya no está disponible.` → Task 8 test "rejects a removed cadence".

---

### Task 1: Schema and migration

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (model `Store` ~line 686, `CustomerSubscription` ~2196, `SubscriptionInvoice` ~2219)
- Create: `apps/api/prisma/migrations/20260928140000_subscribe_and_save/migration.sql`

**Interfaces:**
- Produces: `Store.subscriptionsEnabled`; `CustomerSubscription.{planId?, paymentLinkId, variantId, extraIds, itemName, quantity, cadence, discountPercent, unitAmount, currency, pendingUnitAmount, pendingFrom, fulfillment, sourceOrderId, consumerUserId, consentText, consentAt, missedCount, pausedAt}`; `SubscriptionInvoice.orderId`.

- [ ] **Step 1: Edit the schema**

In `model Store` add next to `bundlesEnabled`:

```prisma
  subscriptionsEnabled         Boolean   @default(false)
```

Replace `model CustomerSubscription` with:

```prisma
model CustomerSubscription {
  id                 String                      @id @default(cuid())
  merchantId         String
  storeId            String
  // Exactly one of planId (plan subscription) or paymentLinkId (product subscription).
  planId             String?
  customerId         String?
  customerName       String
  customerEmail      String?
  customerPhone      String?
  amountOverride     Int?
  nextAmountOverride Int?
  activeKey          String?                     @unique
  status             String                      @default("ACTIVE")
  startedAt          DateTime                    @default(now())
  nextBillingAt      DateTime
  canceledAt         DateTime?
  paymentLinkId      String?
  variantId          String?
  extraIds           String[]                    @default([])
  itemName           String?
  quantity           Int?
  cadence            ProductSubscriptionCadence?
  discountPercent    Int?
  // Locked unit price including extras, in minor units.
  unitAmount         Int?
  currency           String?
  pendingUnitAmount  Int?
  pendingFrom        DateTime?
  // { method, locationId, locationName, zoneId, zoneName, fee, address }
  fulfillment        Json?
  sourceOrderId      String?
  consumerUserId     String?
  consentText        String?
  consentAt          DateTime?
  missedCount        Int                         @default(0)
  pausedAt           DateTime?
  createdAt          DateTime                    @default(now())
  updatedAt          DateTime                    @updatedAt

  @@index([storeId, status, nextBillingAt])
  @@index([planId, status])
  @@index([paymentLinkId, status])
  @@index([sourceOrderId])
}
```

In `model SubscriptionInvoice` add below `paymentIntentId`:

```prisma
  // Renewal StoreOrder for product subscriptions. status also takes "MISSED" and "SKIPPED".
  orderId         String?   @unique
```

- [ ] **Step 2: Write the migration SQL**

```sql
-- Subscribe & Save (spec 2026-09-28)
ALTER TABLE "Store" ADD COLUMN "subscriptionsEnabled" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "CustomerSubscription" ALTER COLUMN "planId" DROP NOT NULL;
ALTER TABLE "CustomerSubscription"
  ADD COLUMN "paymentLinkId" TEXT,
  ADD COLUMN "variantId" TEXT,
  ADD COLUMN "extraIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "itemName" TEXT,
  ADD COLUMN "quantity" INTEGER,
  ADD COLUMN "cadence" "ProductSubscriptionCadence",
  ADD COLUMN "discountPercent" INTEGER,
  ADD COLUMN "unitAmount" INTEGER,
  ADD COLUMN "currency" TEXT,
  ADD COLUMN "pendingUnitAmount" INTEGER,
  ADD COLUMN "pendingFrom" TIMESTAMP(3),
  ADD COLUMN "fulfillment" JSONB,
  ADD COLUMN "sourceOrderId" TEXT,
  ADD COLUMN "consumerUserId" TEXT,
  ADD COLUMN "consentText" TEXT,
  ADD COLUMN "consentAt" TIMESTAMP(3),
  ADD COLUMN "missedCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "pausedAt" TIMESTAMP(3);
CREATE INDEX "CustomerSubscription_paymentLinkId_status_idx" ON "CustomerSubscription"("paymentLinkId", "status");
CREATE INDEX "CustomerSubscription_sourceOrderId_idx" ON "CustomerSubscription"("sourceOrderId");

ALTER TABLE "SubscriptionInvoice" ADD COLUMN "orderId" TEXT;
CREATE UNIQUE INDEX "SubscriptionInvoice_orderId_key" ON "SubscriptionInvoice"("orderId");
```

- [ ] **Step 3: Validate and generate**

Run: `cd apps/api && npx prisma validate && npx prisma generate`
Expected: `The schema at prisma/schema.prisma is valid` and `Generated Prisma Client`.

- [ ] **Step 4: Fix code that assumed `planId: string`**

Run: `cd apps/api && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -n "planId" | head -20`
For each error outside `subscriptions.service.ts`: inside loops that only handle plans (`operations.service.ts` hub/calendar mapping, `integrations.service.ts`) add `if (!subscription.planId) continue;` before the plan lookup; where `planId` is only a display map key, use `subscription.planId ?? ""`. In `subscriptions.service.ts` narrow the same way for now (`if (!subscription.planId) continue;` at the top of both loops in `generateSubscriptionInvoices`, and `if (!subscription.planId) throw new NotFoundException("Subscription plan not found")` in `remindSubscriptionInvoice`); Task 7 replaces this. Re-run until the grep prints nothing.

- [ ] **Step 5: Run the existing API tests**

Run: `cd apps/api && npx jest src/operations src/payment-intents src/payment-links`
Expected: PASS (no behaviour changed).

- [ ] **Step 6: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20260928140000_subscribe_and_save apps/api/src
git commit -m "feat(subscriptions): schema for product subscriptions — store switch, product fields on CustomerSubscription, renewal order on SubscriptionInvoice"
```

---

### Task 2: Pricing, cadence and terms helpers

**Files:**
- Create: `apps/api/src/operations/subscription-pricing.ts`
- Create: `apps/api/src/operations/subscription-pricing.spec.ts`

**Interfaces:**
- Produces:
  - `type Cadence = "WEEKLY" | "BIWEEKLY" | "MONTHLY"`; `isCadence(v: unknown): v is Cadence`
  - `cadenceLabel(c: Cadence): string` → `"cada semana" | "cada dos semanas" | "cada mes"`
  - `cadenceInterval(c: Cadence): { interval: "WEEKLY" | "MONTHLY"; count: number }`
  - `advanceBillingDate(date: Date, interval: string, count: number): Date`
  - `subscriptionPrices(i: { baseAmount; oneTimeAmount; extrasAmount; discountPercent }): { firstUnitAmount: number; lockedUnitAmount: number }`
  - `subscriptionConsentText(c: Cadence): string`
  - `productSubscriptionKey(storeId: string, line: { paymentLinkId: string; variantId?: string | null; extraIds?: string[] }, email: string): string`
  - `type SubscriptionTerms = { name: string; interval: string; count: number; amount: number; currency: string; noticeHours: number; product: boolean }`
  - `subscriptionTerms(subscription: TermsSubscription, plan: TermsPlan | null, now?: Date): SubscriptionTerms | null`
  - `monthlyFactor(interval: string, count: number): number` (30-day normalisation)
  - constants `PRODUCT_NOTICE_HOURS = 72`, `LAST_REMINDER_AFTER_DAYS = 3`, `MISSED_AFTER_DAYS = 7`, `REPRICE_NOTICE_DAYS = 7`

- [ ] **Step 1: Write the failing tests**

```ts
import {
  advanceBillingDate, cadenceInterval, cadenceLabel, isCadence, monthlyFactor, productSubscriptionKey,
  subscriptionConsentText, subscriptionPrices, subscriptionTerms,
} from "./subscription-pricing";

describe("subscription pricing", () => {
  it("discounts the base price and keeps extras at full price", () => {
    expect(subscriptionPrices({ baseAmount: 8000, oneTimeAmount: 8000, extrasAmount: 500, discountPercent: 10 }))
      .toEqual({ firstUnitAmount: 7700, lockedUnitAmount: 7700 });
  });
  it("uses a lower sale price for the first order but locks the subscription price", () => {
    expect(subscriptionPrices({ baseAmount: 8000, oneTimeAmount: 6000, extrasAmount: 0, discountPercent: 10 }))
      .toEqual({ firstUnitAmount: 6000, lockedUnitAmount: 7200 });
  });
  it("rounds to the nearest minor unit", () => {
    expect(subscriptionPrices({ baseAmount: 999, oneTimeAmount: 999, extrasAmount: 0, discountPercent: 15 }).lockedUnitAmount).toBe(849);
  });
  it("labels and maps cadences", () => {
    expect(isCadence("BIWEEKLY")).toBe(true);
    expect(isCadence("DAILY")).toBe(false);
    expect(cadenceLabel("BIWEEKLY")).toBe("cada dos semanas");
    expect(cadenceInterval("BIWEEKLY")).toEqual({ interval: "WEEKLY", count: 2 });
    expect(cadenceInterval("MONTHLY")).toEqual({ interval: "MONTHLY", count: 1 });
  });
  it("advances weekly, monthly and yearly in UTC", () => {
    const start = new Date("2026-01-15T12:00:00Z");
    expect(advanceBillingDate(start, "WEEKLY", 2).toISOString()).toBe("2026-01-29T12:00:00.000Z");
    expect(advanceBillingDate(start, "MONTHLY", 1).toISOString()).toBe("2026-02-15T12:00:00.000Z");
    expect(advanceBillingDate(start, "YEARLY", 1).toISOString()).toBe("2027-01-15T12:00:00.000Z");
  });
  it("normalises to 30 days", () => {
    expect(monthlyFactor("WEEKLY", 1)).toBeCloseTo(30 / 7);
    expect(monthlyFactor("WEEKLY", 2)).toBeCloseTo(30 / 14);
    expect(monthlyFactor("MONTHLY", 1)).toBe(1);
    expect(monthlyFactor("YEARLY", 1)).toBeCloseTo(1 / 12);
  });
  it("writes the exact consent text", () => {
    expect(subscriptionConsentText("MONTHLY")).toBe("Acepto que este pedido se repita cada mes. Antes de cada entrega recibiré un enlace para pagar; no se cobra nada automáticamente. Puedo saltar, pausar o cancelar cuando quiera.");
  });
  it("keys a product subscription by line and email regardless of extras order or email case", () => {
    const a = productSubscriptionKey("s1", { paymentLinkId: "p1", variantId: "v1", extraIds: ["b", "a"] }, "Ana@Mail.com");
    const b = productSubscriptionKey("s1", { paymentLinkId: "p1", variantId: "v1", extraIds: ["a", "b"] }, "ana@mail.com");
    expect(a).toBe(b);
    expect(productSubscriptionKey("s1", { paymentLinkId: "p1" }, "ana@mail.com")).not.toBe(a);
  });
});

describe("subscriptionTerms", () => {
  const now = new Date("2026-10-01T00:00:00Z");
  it("reads a plan subscription from its plan", () => {
    expect(subscriptionTerms({ planId: "plan_1", paymentLinkId: null, amountOverride: null, nextAmountOverride: 1200 },
      { id: "plan_1", name: "Café mensual", amount: 1000, currency: "BOB", interval: "MONTHLY", intervalCount: 1, reminderHoursBefore: 24 }, now))
      .toEqual({ name: "Café mensual", interval: "MONTHLY", count: 1, amount: 1200, currency: "BOB", noticeHours: 24, product: false });
  });
  it("reads a product subscription from its locked price, quantity and delivery fee", () => {
    expect(subscriptionTerms({ planId: null, paymentLinkId: "p1", itemName: "Café 500 g", cadence: "BIWEEKLY", unitAmount: 7200, quantity: 2, currency: "BOB",
      pendingUnitAmount: null, pendingFrom: null, fulfillment: { fee: 1500 } }, null, now))
      .toEqual({ name: "Café 500 g", interval: "WEEKLY", count: 2, amount: 15900, currency: "BOB", noticeHours: 72, product: true });
  });
  it("applies a pending price only once it is effective", () => {
    const sub = { planId: null, paymentLinkId: "p1", itemName: "Café", cadence: "MONTHLY", unitAmount: 7200, quantity: 1, currency: "BOB",
      pendingUnitAmount: 8000, pendingFrom: new Date("2026-10-05T00:00:00Z"), fulfillment: null };
    expect(subscriptionTerms(sub, null, now)!.amount).toBe(7200);
    expect(subscriptionTerms(sub, null, new Date("2026-10-06T00:00:00Z"))!.amount).toBe(8000);
  });
  it("returns null for a plan subscription without its plan or a broken product subscription", () => {
    expect(subscriptionTerms({ planId: "plan_1", paymentLinkId: null }, null, now)).toBeNull();
    expect(subscriptionTerms({ planId: null, paymentLinkId: "p1", cadence: null, unitAmount: null }, null, now)).toBeNull();
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `cd apps/api && npx jest src/operations/subscription-pricing.spec.ts`
Expected: FAIL — `Cannot find module './subscription-pricing'`.

- [ ] **Step 3: Implement**

```ts
import { createHash } from "crypto";

/** Product-subscription arithmetic shared by checkout, enrollment and the renewal engine (spec 2026-09-28). */
export const CADENCES = ["WEEKLY", "BIWEEKLY", "MONTHLY"] as const;
export type Cadence = typeof CADENCES[number];
export const PRODUCT_NOTICE_HOURS = 72;
export const LAST_REMINDER_AFTER_DAYS = 3;
export const MISSED_AFTER_DAYS = 7;
export const REPRICE_NOTICE_DAYS = 7;

export function isCadence(value: unknown): value is Cadence {
  return typeof value === "string" && (CADENCES as readonly string[]).includes(value);
}

export function cadenceLabel(cadence: Cadence): string {
  return cadence === "WEEKLY" ? "cada semana" : cadence === "BIWEEKLY" ? "cada dos semanas" : "cada mes";
}

export function cadenceInterval(cadence: Cadence): { interval: "WEEKLY" | "MONTHLY"; count: number } {
  return cadence === "MONTHLY" ? { interval: "MONTHLY", count: 1 } : { interval: "WEEKLY", count: cadence === "BIWEEKLY" ? 2 : 1 };
}

export function advanceBillingDate(date: Date, interval: string, count: number): Date {
  const next = new Date(date);
  if (interval === "WEEKLY") next.setUTCDate(next.getUTCDate() + count * 7);
  else if (interval === "YEARLY") next.setUTCFullYear(next.getUTCFullYear() + count);
  else next.setUTCMonth(next.getUTCMonth() + count);
  return next;
}

export function monthlyFactor(interval: string, count: number): number {
  if (interval === "WEEKLY") return 30 / (7 * count);
  if (interval === "YEARLY") return 1 / (12 * count);
  return 1 / count;
}

export function subscriptionPrices(input: { baseAmount: number; oneTimeAmount: number; extrasAmount: number; discountPercent: number }) {
  const discounted = Math.round(input.baseAmount * (100 - input.discountPercent) / 100);
  return {
    firstUnitAmount: Math.min(input.oneTimeAmount, discounted) + input.extrasAmount,
    lockedUnitAmount: discounted + input.extrasAmount,
  };
}

export function subscriptionConsentText(cadence: Cadence): string {
  return `Acepto que este pedido se repita ${cadenceLabel(cadence)}. Antes de cada entrega recibiré un enlace para pagar; no se cobra nada automáticamente. Puedo saltar, pausar o cancelar cuando quiera.`;
}

export function productSubscriptionKey(storeId: string, line: { paymentLinkId: string; variantId?: string | null; extraIds?: string[] }, email: string): string {
  const extras = [...(line.extraIds ?? [])].sort().join(",");
  return createHash("sha256").update(`${storeId}:product:${line.paymentLinkId}:${line.variantId ?? ""}:${extras}:${email.trim().toLowerCase()}`).digest("hex");
}

export type SubscriptionTerms = { name: string; interval: string; count: number; amount: number; currency: string; noticeHours: number; product: boolean };
export type TermsPlan = { id: string; name: string; amount: number; currency: string; interval: string; intervalCount: number; reminderHoursBefore: number };
export type TermsSubscription = {
  planId: string | null; paymentLinkId: string | null; amountOverride?: number | null; nextAmountOverride?: number | null;
  itemName?: string | null; cadence?: string | null; unitAmount?: number | null; quantity?: number | null; currency?: string | null;
  pendingUnitAmount?: number | null; pendingFrom?: Date | null; fulfillment?: unknown;
};

/** What one period of this subscription costs and when its notice goes out; null when it cannot be billed. */
export function subscriptionTerms(subscription: TermsSubscription, plan: TermsPlan | null, now = new Date()): SubscriptionTerms | null {
  if (subscription.paymentLinkId) {
    if (!isCadence(subscription.cadence) || !subscription.unitAmount || !subscription.quantity) return null;
    const { interval, count } = cadenceInterval(subscription.cadence);
    const unit = subscription.pendingUnitAmount && subscription.pendingFrom && subscription.pendingFrom <= now ? subscription.pendingUnitAmount : subscription.unitAmount;
    const fee = Number((subscription.fulfillment as { fee?: unknown } | null)?.fee) || 0;
    return { name: subscription.itemName ?? "Suscripción", interval, count, amount: unit * subscription.quantity + fee, currency: subscription.currency ?? "BOB", noticeHours: PRODUCT_NOTICE_HOURS, product: true };
  }
  if (!plan || subscription.planId !== plan.id) return null;
  return {
    name: plan.name, interval: plan.interval, count: plan.intervalCount,
    amount: subscription.nextAmountOverride ?? subscription.amountOverride ?? plan.amount,
    currency: plan.currency, noticeHours: plan.reminderHoursBefore, product: false,
  };
}
```

- [ ] **Step 4: Run to see it pass**

Run: `cd apps/api && npx jest src/operations/subscription-pricing.spec.ts`
Expected: PASS (12 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/operations/subscription-pricing.ts apps/api/src/operations/subscription-pricing.spec.ts
git commit -m "feat(subscriptions): pricing, cadence, consent text and billing terms helpers"
```

---

### Task 3: Manage-link token

**Files:**
- Create: `apps/api/src/operations/subscription-manage-token.ts`
- Create: `apps/api/src/operations/subscription-manage-token.spec.ts`

**Interfaces:**
- Produces: `createSubscriptionManageToken(subscriptionId: string, secret: string): string`, `readSubscriptionManageToken(token: string, secret: string): string | null`, `subscriptionManageUrl(checkoutOrigin: string, subscriptionId: string, secret: string): string` → `${origin}/suscripcion/${token}`.

- [ ] **Step 1: Write the failing test**

```ts
import { createOrderTrackingToken } from "../consumer/order-tracking-token";
import { createSubscriptionManageToken, readSubscriptionManageToken, subscriptionManageUrl } from "./subscription-manage-token";

describe("subscription manage token", () => {
  const id = "cm1abcdefghijklmnopqrstu";
  it("round-trips", () => {
    expect(readSubscriptionManageToken(createSubscriptionManageToken(id, "s"), "s")).toBe(id);
  });
  it("rejects another secret, tampering, garbage and an order-tracking token for the same id", () => {
    const token = createSubscriptionManageToken(id, "s");
    expect(readSubscriptionManageToken(token, "other")).toBeNull();
    expect(readSubscriptionManageToken(`${token.split(".")[0]}.AAAA`, "s")).toBeNull();
    expect(readSubscriptionManageToken(createOrderTrackingToken(id, "s"), "s")).toBeNull();
    expect(readSubscriptionManageToken("garbage", "s")).toBeNull();
  });
  it("builds the public URL", () => {
    expect(subscriptionManageUrl("https://pagar.pagosya.bo/", id, "s")).toMatch(/^https:\/\/pagar\.pagosya\.bo\/suscripcion\/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `cd apps/api && npx jest src/operations/subscription-manage-token.spec.ts`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement**

```ts
import { createHmac, timingSafeEqual } from "crypto";

/** Public "manage my subscription" link: same scheme as order tracking, its own context. */
const TOKEN_CONTEXT = "pagosya-subscription-manage-v1";

function signature(subscriptionId: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(`${TOKEN_CONTEXT}:${subscriptionId}`).digest();
}

export function createSubscriptionManageToken(subscriptionId: string, secret: string): string {
  return `${Buffer.from(subscriptionId, "utf8").toString("base64url")}.${signature(subscriptionId, secret).toString("base64url")}`;
}

export function readSubscriptionManageToken(token: string, secret: string): string | null {
  const [encodedId, encodedSignature, ...rest] = token.split(".");
  if (!encodedId || !encodedSignature || rest.length) return null;
  try {
    const subscriptionId = Buffer.from(encodedId, "base64url").toString("utf8");
    if (!/^c[a-z0-9]{20,40}$/i.test(subscriptionId)) return null;
    const supplied = Buffer.from(encodedSignature, "base64url");
    const expected = signature(subscriptionId, secret);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;
    return subscriptionId;
  } catch {
    return null;
  }
}

export function subscriptionManageUrl(checkoutOrigin: string, subscriptionId: string, secret: string): string {
  return `${checkoutOrigin.replace(/\/$/, "")}/suscripcion/${createSubscriptionManageToken(subscriptionId, secret)}`;
}
```

- [ ] **Step 4: Run to see it pass**

Run: `cd apps/api && npx jest src/operations/subscription-manage-token.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/operations/subscription-manage-token.ts apps/api/src/operations/subscription-manage-token.spec.ts
git commit -m "feat(subscriptions): signed manage-link token"
```

---

### Task 4: Public store payload exposes the offers

**Files:**
- Modify: `apps/api/src/stores/public-stores.service.ts` (`getStorePublic`: product query ~line 176, store flags ~line 234, `items: items.map` ~line 322)
- Modify: `apps/api/src/payment-links/payment-links.service.ts` (`listPublicSubscriptions` ~line 548)
- Modify: `apps/api/src/storefront-source/source-store-config.ts:22`, `apps/api/src/storefront-source/source-generation.service.ts:215`, `apps/api/src/storefront-source/source-templates.ts:124`
- Test: `apps/api/src/stores/public-stores.service.spec.ts`, `apps/api/src/payment-links/product-subscriptions.spec.ts`

**Interfaces:**
- Produces: public store JSON gains `subscriptionsEnabled: boolean`; each item gains `subscriptionOptions: Array<{ cadence: Cadence; discountPercent: number }>` — empty unless the switch is on and the item is not `DIGITAL`.

- [ ] **Step 1: Write the failing tests**

In `public-stores.service.spec.ts`, using the file's existing Prisma mock and `getStorePublic` fixture (a store row and a physical product row):

```ts
describe("subscription offers", () => {
  it("publishes offers only when the store switch is on and never for digital items", async () => {
    prisma.store.findFirst.mockResolvedValue({ ...storeRow, subscriptionsEnabled: true });
    prisma.paymentLink.findMany.mockResolvedValue([
      { ...productRow, id: "p1", subscriptionOptions: [{ cadence: "MONTHLY", discountPercent: 10 }] },
      { ...productRow, id: "p2", fulfillmentType: "DIGITAL", subscriptionOptions: [{ cadence: "WEEKLY", discountPercent: 5 }] },
    ]);
    const result = await service.getStorePublic(storeRow.slug);
    expect(result.subscriptionsEnabled).toBe(true);
    expect(result.items.find((item: { id: string }) => item.id === "p1")!.subscriptionOptions).toEqual([{ cadence: "MONTHLY", discountPercent: 10 }]);
    expect(result.items.find((item: { id: string }) => item.id === "p2")!.subscriptionOptions).toEqual([]);
  });

  it("hides every offer while the switch is off", async () => {
    prisma.store.findFirst.mockResolvedValue({ ...storeRow, subscriptionsEnabled: false });
    prisma.paymentLink.findMany.mockResolvedValue([{ ...productRow, id: "p1", subscriptionOptions: [{ cadence: "MONTHLY", discountPercent: 10 }] }]);
    const result = await service.getStorePublic(storeRow.slug);
    expect(result.subscriptionsEnabled).toBe(false);
    expect(result.items[0].subscriptionOptions).toEqual([]);
  });
});
```

(`storeRow` / `productRow` / the store lookup mock are whatever the file's existing `getStorePublic` tests use — `findActiveBySlugPublic` may read `store.findFirst` or `findUnique`; mock the same one.)

In `product-subscriptions.spec.ts`:

```ts
it("serves public offers only for stores with the switch on", async () => {
  prisma.paymentLink.findFirst.mockResolvedValue(null);
  await expect(service.listPublicSubscriptions("cafe", "p1")).rejects.toThrow("Este producto ya no está disponible");
  expect(prisma.paymentLink.findFirst).toHaveBeenCalledWith(expect.objectContaining({
    where: expect.objectContaining({ fulfillmentType: { not: "DIGITAL" }, store: expect.objectContaining({ subscriptionsEnabled: true }) }),
  }));
});
```

- [ ] **Step 2: Run to see them fail**

Run: `cd apps/api && npx jest src/stores/public-stores.service.spec.ts src/payment-links/product-subscriptions.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`public-stores.service.ts` product query:

```ts
      this.prisma.paymentLink.findMany({
        where: { storeId: store.id, status: PaymentLinkStatus.ACTIVE },
        orderBy: { createdAt: "asc" },
        include: { subscriptionOptions: { orderBy: { cadence: "asc" }, select: { cadence: true, discountPercent: true } } },
      }),
```

Store flags: after `shippingCarriersEnabled: store.shippingCarriersEnabled,` add `subscriptionsEnabled: store.subscriptionsEnabled,`.

In `items: items.map((item) => ({ … }))` add:

```ts
        subscriptionOptions: store.subscriptionsEnabled && item.fulfillmentType !== "DIGITAL" ? item.subscriptionOptions : [],
```

`payment-links.service.ts` `listPublicSubscriptions` where clause:

```ts
      where: { id, status: PaymentLinkStatus.ACTIVE, fulfillmentType: { not: "DIGITAL" }, store: { slug, status: "ACTIVE", sourcePublicationPaused: false, subscriptionsEnabled: true } },
```

Storefront-source forwarding: in `source-store-config.ts:22` add `subscriptionsEnabled: publicStore.subscriptionsEnabled,` after `bundlesEnabled: publicStore.bundlesEnabled,`; in `source-generation.service.ts:215` add `subscriptionsEnabled: data.subscriptionsEnabled,` after `bundlesEnabled: data.bundlesEnabled,`; in `source-templates.ts:124` add `subscriptionsEnabled: false,` after `bundlesEnabled: false,`.

- [ ] **Step 4: Run to see them pass**

Run: `cd apps/api && npx jest src/stores src/payment-links src/storefront-source`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/stores apps/api/src/payment-links apps/api/src/storefront-source
git commit -m "feat(subscriptions): public store payload carries the switch and each product's offers"
```

---

### Task 5: Checkout accepts subscription lines

**Files:**
- Modify: `apps/api/src/payment-links/dto/cart-checkout.dto.ts`
- Modify: `apps/api/src/stores/store-checkout.service.ts` (`createCartCheckout`: after `links` load ~line 78, line assembly ~130–162, bundles ~193, shipping ~208, metadata ~239)
- Modify: `apps/api/src/payment-intents/payment-intents.service.ts` (`confirm`, after `effectiveEmail` ~line 399)
- Test: `apps/api/src/stores/store-checkout.service.spec.ts`, `apps/api/src/payment-intents/payment-intents.service.spec.ts`

**Interfaces:**
- Consumes: `Cadence`, `subscriptionPrices`, `subscriptionConsentText` (Task 2).
- Produces: `CartItemDto.subscriptionCadence?: Cadence`; `CartCheckoutDto.subscriptionConsent?: boolean`; cart line metadata `subscription: { cadence; discountPercent; lockedUnitAmount }`; intent metadata `subscriptionConsent: { text: string; at: string }`.

- [ ] **Step 1: Write the failing tests** (in `store-checkout.service.spec.ts`, reusing its mock factory: a `store` row object the lookup returns, `prisma.paymentLink.findMany`, `paymentIntents.createInTransaction`)

```ts
describe("subscription lines", () => {
  let product: Record<string, unknown>;
  beforeEach(() => {
    product = { id: "p1", storeId: store.id, name: "Café 500 g", amount: 8000, currency: "BOB", status: "ACTIVE", fulfillmentType: "PHYSICAL",
      variants: [], extras: [], stock: null, locationStocks: {}, discountPercent: null, discountStartsAt: null, discountEndsAt: null };
    Object.assign(store, { subscriptionsEnabled: true, bundlesEnabled: false });
    prisma.paymentLink.findMany.mockResolvedValue([product]);
    prisma.productSubscriptionOption = { findMany: jest.fn().mockResolvedValue([{ paymentLinkId: "p1", cadence: "MONTHLY", discountPercent: 10 }]) };
  });

  it("prices a mixed cart: one line once, one line on subscription", async () => {
    const quote = await service.createCartCheckout(store.slug, { items: [
      { paymentLinkId: "p1", quantity: 1 },
      { paymentLinkId: "p1", quantity: 1, subscriptionCadence: "MONTHLY" },
    ], subscriptionConsent: true } as never, true);
    expect(quote.subtotal).toBe(8000 + 7200);
  });

  it("stores the locked price and the consent on the intent", async () => {
    await service.createCartCheckout(store.slug, { items: [{ paymentLinkId: "p1", quantity: 2, subscriptionCadence: "MONTHLY" }], subscriptionConsent: true } as never);
    const metadata = paymentIntents.createInTransaction.mock.calls[0][3].metadata;
    expect(metadata.cart[0]).toMatchObject({ unitAmount: 7200, quantity: 2, subscription: { cadence: "MONTHLY", discountPercent: 10, lockedUnitAmount: 7200 } });
    expect(metadata.subscriptionConsent.text).toContain("cada mes");
  });

  it("rejects subscriptions while the store switch is off", async () => {
    store.subscriptionsEnabled = false;
    await expect(service.createCartCheckout(store.slug, { items: [{ paymentLinkId: "p1", quantity: 1, subscriptionCadence: "MONTHLY" }], subscriptionConsent: true } as never))
      .rejects.toThrow("Esta tienda no ofrece suscripciones.");
  });

  it("rejects a cadence the product does not offer", async () => {
    await expect(service.createCartCheckout(store.slug, { items: [{ paymentLinkId: "p1", quantity: 1, subscriptionCadence: "WEEKLY" }], subscriptionConsent: true } as never))
      .rejects.toThrow('Esa frecuencia no está disponible para "Café 500 g".');
  });

  it("rejects a digital product on subscription", async () => {
    product.fulfillmentType = "DIGITAL";
    await expect(service.createCartCheckout(store.slug, { items: [{ paymentLinkId: "p1", quantity: 1, subscriptionCadence: "MONTHLY" }], subscriptionConsent: true } as never))
      .rejects.toThrow('"Café 500 g" no se puede comprar por suscripción.');
  });

  it("requires consent to create the payment but not to quote", async () => {
    await expect(service.createCartCheckout(store.slug, { items: [{ paymentLinkId: "p1", quantity: 1, subscriptionCadence: "MONTHLY" }] } as never))
      .rejects.toThrow("Acepta las condiciones de la suscripción para continuar.");
    await expect(service.createCartCheckout(store.slug, { items: [{ paymentLinkId: "p1", quantity: 1, subscriptionCadence: "MONTHLY" }] } as never, true))
      .resolves.toMatchObject({ subtotal: 7200 });
  });

  it("keeps subscription lines out of bundle matching", async () => {
    store.bundlesEnabled = true;
    prisma.storeBundle.findMany.mockResolvedValue([{ id: "b1", name: "Dúo", kind: "FIXED", items: [{ productId: "p1", quantity: 2 }], minimumQuantity: null, discountPercent: 20 }]);
    const quote = await service.createCartCheckout(store.slug, { items: [{ paymentLinkId: "p1", quantity: 2, subscriptionCadence: "MONTHLY" }], subscriptionConsent: true } as never, true);
    expect(quote.discountAmount).toBe(0);
  });
});
```

For the carrier case, copy the file's existing carrier-checkout test setup (a `deliveryZone` with `carrierId`, `store.shippingEnabled = true`, `shippingCarriersEnabled = true`, `fulfillmentMethod: "delivery"`, `shippingZoneId`, `shippingAddress`, `shippingDestination`) and add `subscriptionCadence: "MONTHLY"` to its item and `subscriptionConsent: true`:

```ts
  it("rejects carrier shipping for a subscription", async () => {
    // …the file's carrier fixture…
    await expect(service.createCartCheckout(store.slug, carrierDto)).rejects.toThrow("Las suscripciones todavía no se envían por courier. Elige retiro o entrega local.");
  });
```

In `payment-intents.service.spec.ts`, next to the existing `confirm` tests (reuse their `$queryRaw` row fixture):

```ts
it("asks for an email before paying a cart with a subscription", async () => {
  prisma.$queryRaw.mockResolvedValue([{ ...confirmRow, metadata: { storeId: "store_1", cart: [{ paymentLinkId: "p1", quantity: 1, unitAmount: 7200, subscription: { cadence: "MONTHLY", discountPercent: 10, lockedUnitAmount: 7200 } }] } }]);
  await expect(service.confirm("pi_1", { paymentMethod: { type: "QR" } } as never))
    .rejects.toThrow("Ingresa tu correo para recibir los enlaces de tus próximas entregas.");
});
```

(`createInTransaction`'s 4th argument is the dto: `(tx, merchantId, livemode, dto)`. If the existing spec calls it differently, read the call index from the file's other checkout assertions.)

- [ ] **Step 2: Run to see them fail**

Run: `cd apps/api && npx jest src/stores/store-checkout.service.spec.ts src/payment-intents/payment-intents.service.spec.ts -t "subscription"`
Expected: FAIL.

- [ ] **Step 3: Implement**

`cart-checkout.dto.ts`, in `CartItemDto`:

```ts
  @ApiProperty({ required: false, enum: ["WEEKLY", "BIWEEKLY", "MONTHLY"], description: "Buy this line as a subscription with this frequency." })
  @IsOptional()
  @IsIn(["WEEKLY", "BIWEEKLY", "MONTHLY"])
  subscriptionCadence?: "WEEKLY" | "BIWEEKLY" | "MONTHLY";
```

In `CartCheckoutDto` (add `IsBoolean` to the import):

```ts
  @ApiProperty({ required: false, description: "The buyer ticked the subscription terms. Required when any line has subscriptionCadence." })
  @IsOptional() @IsBoolean() subscriptionConsent?: boolean;
```

`store-checkout.service.ts` — import `{ type Cadence, subscriptionConsentText, subscriptionPrices } from "../operations/subscription-pricing"`.

1. Right after the `links.length !== quantityByLinkId.size` check:

```ts
    const subscriptionItems = dto.items.filter(item => item.subscriptionCadence);
    if (subscriptionItems.length && !store.subscriptionsEnabled) throw new BadRequestException("Esta tienda no ofrece suscripciones.");
    if (subscriptionItems.length && !quoteOnly && dto.subscriptionConsent !== true) throw new BadRequestException("Acepta las condiciones de la suscripción para continuar.");
    const offers = subscriptionItems.length
      ? await this.prisma.productSubscriptionOption.findMany({ where: { paymentLinkId: { in: subscriptionItems.map(item => item.paymentLinkId) } } })
      : [];
```

2. Add `subscription?: { cadence: Cadence; discountPercent: number; lockedUnitAmount: number };` to the `selectedLines` value type. In the loop, replace from `const lineKey = …` through the end of the `else { selectedLines.set(…) }` block with:

```ts
      const cadence = item.subscriptionCadence;
      let subscription: { cadence: Cadence; discountPercent: number; lockedUnitAmount: number } | undefined;
      let unitAmount = discountedProductAmount(link, variant?.amount ?? link.amount) + selectedExtrasAmount(selectedExtras);
      if (cadence) {
        if (link.fulfillmentType === 'DIGITAL') throw new BadRequestException(`"${link.name}" no se puede comprar por suscripción.`);
        const offer = offers.find(option => option.paymentLinkId === link.id && option.cadence === cadence);
        if (!offer) throw new BadRequestException(`Esa frecuencia no está disponible para "${link.name}".`);
        const baseAmount = variant?.amount ?? link.amount;
        const prices = subscriptionPrices({ baseAmount, oneTimeAmount: discountedProductAmount(link, baseAmount), extrasAmount: selectedExtrasAmount(selectedExtras), discountPercent: offer.discountPercent });
        unitAmount = prices.firstUnitAmount;
        subscription = { cadence, discountPercent: offer.discountPercent, lockedUnitAmount: prices.lockedUnitAmount };
      }
      const lineKey = `${link.id}:${variant?.id ?? "base"}:${selectedExtraIds.join("+")}${cadence ? `:sub:${cadence}` : ""}`;
      const existing = selectedLines.get(lineKey);
      if (existing) existing.quantity += item.quantity;
      else {
        selectedLines.set(lineKey, {
          paymentLinkId: link.id,
          ...(link.fulfillmentType === 'DIGITAL' ? { digitalAssetIds: digitalAssets.filter(asset => asset.productId === link.id).map(asset => asset.id) } : {}),
          ...(variant && { variantId: variant.id, variantName: variant.name }),
          ...(variant && variant.stock !== undefined && { optionStock: variant.stock }),
          ...(selectedExtraIds.length && { extraIds: selectedExtraIds, extras: selectedExtras }),
          ...(subscription ? { subscription } : {}),
          name: link.name,
          quantity: item.quantity,
          unitAmount,
        });
      }
```

3. Bundles: `bestBundleDiscount(bundles as unknown as Bundle[], cartLines)` → `bestBundleDiscount(bundles as unknown as Bundle[], cartLines.filter(line => !line.subscription))`.

4. Shipping: right after `shipping = quote.selected;`:

```ts
        if (!quoteOnly && shipping?.carrierId && subscriptionItems.length) throw new BadRequestException('Las suscripciones todavía no se envían por courier. Elige retiro o entrega local.');
```

5. Intent metadata: inside the `metadata: { … }` object add

```ts
          ...(subscriptionItems.length ? { subscriptionConsent: { text: subscriptionConsentText(subscriptionItems[0].subscriptionCadence!), at: new Date().toISOString() } } : {}),
```

`payment-intents.service.ts`, in `confirm` right after `const effectiveEmail = …`:

```ts
      const confirmCart = (current.metadata as { cart?: unknown } | null)?.cart;
      if (!effectiveEmail && Array.isArray(confirmCart) && confirmCart.some(line => !!line && typeof line === "object" && "subscription" in line)) {
        throw new BadRequestException("Ingresa tu correo para recibir los enlaces de tus próximas entregas.");
      }
```

- [ ] **Step 4: Run to see them pass**

Run: `cd apps/api && npx jest src/stores src/payment-intents`
Expected: PASS (new and existing).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/payment-links/dto/cart-checkout.dto.ts apps/api/src/stores apps/api/src/payment-intents
git commit -m "feat(subscriptions): checkout prices subscription lines, records consent and requires an email to pay them"
```

---

### Task 6: Enrollment when the first order is paid

**Files:**
- Create: `apps/api/src/operations/subscription-enrollment.ts`
- Create: `apps/api/src/operations/subscription-enrollment.spec.ts`
- Modify: `apps/api/src/payment-intents/payment-intents.service.ts` (success branch ~lines 649–690)
- Test: `apps/api/src/payment-intents/payment-intents.service.spec.ts`

**Interfaces:**
- Consumes: `isCadence`, `productSubscriptionKey`, `advanceBillingDate`, `cadenceInterval`, `cadenceLabel` (Task 2); `subscriptionManageUrl` (Task 3).
- Produces:
  - `createSubscriptionsFromOrder(tx: Prisma.TransactionClient, input: EnrollmentInput): Promise<EnrollmentResult>`
  - `type EnrollmentInput = { intent: { id; livemode; currency; customerName; customerEmail; customerPhone; consumerUserId; metadata }; order: { id; storeId; merchantId; fulfillmentMethod; fulfillmentLocationId; fulfillmentLocationName }; manage: { checkoutOrigin: string; secret: string }; now?: Date }`
  - `type EnrollmentResult = { created: number; duplicates: string[]; emailBlock: string }`
  - `applyRenewalPaid(tx, paymentIntentId: string): Promise<void>`

- [ ] **Step 1: Write the failing tests**

```ts
import { createSubscriptionsFromOrder } from "./subscription-enrollment";
import { productSubscriptionKey } from "./subscription-pricing";

function makeTx() {
  return {
    paymentLink: { findMany: jest.fn().mockResolvedValue([{ id: "p1", fulfillmentType: "PHYSICAL", variants: [], name: "Café 500 g" }]) },
    productSubscriptionOption: { findMany: jest.fn().mockResolvedValue([{ paymentLinkId: "p1", cadence: "MONTHLY", discountPercent: 10 }]) },
    customerSubscription: {
      findMany: jest.fn().mockResolvedValueOnce([]).mockResolvedValue([{ id: "cm1sub0000000000000000001", activeKey: productSubscriptionKey("store_1", { paymentLinkId: "p1", variantId: null, extraIds: [] }, "ana@mail.com") }]),
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
}
const order = { id: "order_1", storeId: "store_1", merchantId: "m1", fulfillmentMethod: "pickup", fulfillmentLocationId: "loc_1", fulfillmentLocationName: "Centro" };
const manage = { checkoutOrigin: "https://pagar.test", secret: "s" };
const subscriptionLine = { paymentLinkId: "p1", name: "Café 500 g", quantity: 2, unitAmount: 7200, subscription: { cadence: "MONTHLY", discountPercent: 10, lockedUnitAmount: 7200 } };
const oneTimeLine = { paymentLinkId: "p1", name: "Café 500 g", quantity: 1, unitAmount: 8000 };
const intent = (metadata: object) => ({ id: "pi_1", livemode: true, currency: "BOB", customerName: "Ana", customerEmail: "Ana@Mail.com", customerPhone: "70000000", consumerUserId: null, metadata });
const now = new Date("2026-10-01T15:00:00Z");

describe("createSubscriptionsFromOrder", () => {
  it("creates one subscription per subscription line with the locked price, consent and first renewal date", async () => {
    const tx = makeTx();
    const result = await createSubscriptionsFromOrder(tx as never, { intent: intent({ cart: [subscriptionLine, oneTimeLine], subscriptionConsent: { text: "Acepto…", at: now.toISOString() } }), order, manage, now });
    expect(tx.customerSubscription.createMany).toHaveBeenCalledWith({ skipDuplicates: true, data: [expect.objectContaining({
      storeId: "store_1", merchantId: "m1", paymentLinkId: "p1", quantity: 2, cadence: "MONTHLY", discountPercent: 10, unitAmount: 7200,
      currency: "BOB", customerEmail: "ana@mail.com", sourceOrderId: "order_1", consentText: "Acepto…",
      nextBillingAt: new Date("2026-11-01T15:00:00Z"), fulfillment: expect.objectContaining({ method: "pickup", locationId: "loc_1", fee: 0 }),
    })] });
    expect(result.created).toBe(1);
    expect(result.emailBlock).toContain("Suscripción: Café 500 g · cada mes");
    expect(result.emailBlock).toContain("https://pagar.test/suscripcion/");
    expect(result.emailBlock).toContain("no se cobra nada automáticamente");
  });

  it("does nothing for a renewal intent or a cart without subscription lines", async () => {
    const tx = makeTx();
    await expect(createSubscriptionsFromOrder(tx as never, { intent: intent({ cart: [subscriptionLine], subscription: { invoiceId: "inv_1" } }), order, manage, now })).resolves.toEqual({ created: 0, duplicates: [], emailBlock: "" });
    await expect(createSubscriptionsFromOrder(tx as never, { intent: intent({ cart: [oneTimeLine] }), order, manage, now })).resolves.toEqual({ created: 0, duplicates: [], emailBlock: "" });
    expect(tx.customerSubscription.createMany).not.toHaveBeenCalled();
  });

  it("skips lines whose product changed between checkout and payment, without throwing", async () => {
    const tx = makeTx();
    tx.paymentLink.findMany.mockResolvedValue([]);
    await expect(createSubscriptionsFromOrder(tx as never, { intent: intent({ cart: [subscriptionLine] }), order, manage, now })).resolves.toMatchObject({ created: 0 });
    tx.paymentLink.findMany.mockResolvedValue([{ id: "p1", fulfillmentType: "PHYSICAL", variants: [], name: "Café 500 g" }]);
    tx.productSubscriptionOption.findMany.mockResolvedValue([]);
    await expect(createSubscriptionsFromOrder(tx as never, { intent: intent({ cart: [subscriptionLine] }), order, manage, now })).resolves.toMatchObject({ created: 0 });
    expect(tx.customerSubscription.createMany).not.toHaveBeenCalled();
  });

  it("reports a subscription the buyer already has instead of creating a second one", async () => {
    const tx = makeTx();
    tx.customerSubscription.findMany.mockReset().mockResolvedValue([{ activeKey: productSubscriptionKey("store_1", { paymentLinkId: "p1", variantId: null, extraIds: [] }, "ana@mail.com") }]);
    const result = await createSubscriptionsFromOrder(tx as never, { intent: intent({ cart: [subscriptionLine] }), order, manage, now });
    expect(tx.customerSubscription.createMany).not.toHaveBeenCalled();
    expect(result.duplicates).toEqual(["Café 500 g"]);
    expect(result.emailBlock).toContain("Ya tenías una suscripción a Café 500 g");
  });

  it("skips everything without an email", async () => {
    const tx = makeTx();
    await expect(createSubscriptionsFromOrder(tx as never, { intent: { ...intent({ cart: [subscriptionLine] }), customerEmail: null }, order, manage, now })).resolves.toMatchObject({ created: 0 });
  });

  it("snapshots zone delivery with its fee", async () => {
    const tx = makeTx();
    await createSubscriptionsFromOrder(tx as never, { intent: intent({ cart: [subscriptionLine], shipping: { id: "zone_1", name: "Centro", amount: 1500, address: "Calle 1" } }), order: { ...order, fulfillmentMethod: "delivery", fulfillmentLocationId: null, fulfillmentLocationName: null }, manage, now });
    expect(tx.customerSubscription.createMany.mock.calls[0][0].data[0].fulfillment).toEqual(expect.objectContaining({ method: "delivery", zoneId: "zone_1", fee: 1500, address: "Calle 1" }));
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `cd apps/api && npx jest src/operations/subscription-enrollment.spec.ts`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement `subscription-enrollment.ts`**

```ts
import { Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { advanceBillingDate, cadenceInterval, cadenceLabel, isCadence, productSubscriptionKey, type Cadence } from "./subscription-pricing";
import { subscriptionManageUrl } from "./subscription-manage-token";

/**
 * Runs inside the payment's success transaction (applyRailResult). It must never throw on the data it reads:
 * a failed statement would abort the payment. Unknown or changed lines are skipped and logged, duplicates are
 * skipped by activeKey. The order itself always stays a normal paid order.
 */
const logger = new Logger("SubscriptionEnrollment");

type CartLine = { paymentLinkId?: unknown; variantId?: unknown; extraIds?: unknown; name?: unknown; variantName?: unknown; quantity?: unknown;
  subscription?: { cadence?: unknown; discountPercent?: unknown; lockedUnitAmount?: unknown } };
export type EnrollmentInput = {
  intent: { id: string; livemode: boolean; currency: string; customerName: string | null; customerEmail: string | null; customerPhone: string | null; consumerUserId: string | null; metadata: Prisma.JsonValue };
  order: { id: string; storeId: string; merchantId: string; fulfillmentMethod: string | null; fulfillmentLocationId: string | null; fulfillmentLocationName: string | null };
  manage: { checkoutOrigin: string; secret: string };
  now?: Date;
};
export type EnrollmentResult = { created: number; duplicates: string[]; emailBlock: string };
const NONE: EnrollmentResult = { created: 0, duplicates: [], emailBlock: "" };

function objectOf(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export async function createSubscriptionsFromOrder(tx: Prisma.TransactionClient, input: EnrollmentInput): Promise<EnrollmentResult> {
  const now = input.now ?? new Date();
  const metadata = objectOf(input.intent.metadata);
  if (metadata.subscription) return NONE; // a renewal payment, not a first order
  const lines = (Array.isArray(metadata.cart) ? metadata.cart : []).filter(line => !!objectOf(line).subscription) as CartLine[];
  const email = input.intent.customerEmail?.trim().toLowerCase();
  if (!lines.length || !email) return NONE;

  const productIds = [...new Set(lines.map(line => String(line.paymentLinkId)))];
  const [products, offers] = await Promise.all([
    tx.paymentLink.findMany({ where: { id: { in: productIds }, storeId: input.order.storeId, status: "ACTIVE" }, select: { id: true, fulfillmentType: true, variants: true, name: true } }),
    tx.productSubscriptionOption.findMany({ where: { paymentLinkId: { in: productIds } } }),
  ]);
  const shipping = objectOf(metadata.shipping);
  const fulfillmentMeta = objectOf(metadata.fulfillment);
  const consent = objectOf(metadata.subscriptionConsent);
  const fulfillment = {
    method: input.order.fulfillmentMethod ?? (typeof fulfillmentMeta.method === "string" ? fulfillmentMeta.method : null),
    locationId: input.order.fulfillmentLocationId, locationName: input.order.fulfillmentLocationName,
    zoneId: typeof shipping.id === "string" ? shipping.id : null, zoneName: typeof shipping.name === "string" ? shipping.name : null,
    fee: Number.isSafeInteger(shipping.amount) ? shipping.amount as number : 0,
    address: typeof shipping.address === "string" ? shipping.address : typeof fulfillmentMeta.address === "string" ? fulfillmentMeta.address : null,
  };

  const rows: Prisma.CustomerSubscriptionCreateManyInput[] = [];
  const info = new Map<string, { name: string; cadence: Cadence; amount: number; next: Date }>();
  for (const line of lines) {
    const cadence = line.subscription?.cadence;
    const product = products.find(candidate => candidate.id === line.paymentLinkId);
    const lockedUnitAmount = Number(line.subscription?.lockedUnitAmount);
    const quantity = Number(line.quantity);
    if (!isCadence(cadence) || !product || product.fulfillmentType === "DIGITAL" || !offers.some(offer => offer.paymentLinkId === product.id && offer.cadence === cadence)
      || !Number.isSafeInteger(lockedUnitAmount) || lockedUnitAmount <= 0 || !Number.isInteger(quantity) || quantity < 1) {
      logger.warn(`Skipped subscription line ${String(line.paymentLinkId)} on ${input.intent.id}`);
      continue;
    }
    const variantId = typeof line.variantId === "string" ? line.variantId : null;
    const extraIds = Array.isArray(line.extraIds) ? line.extraIds.filter((id): id is string => typeof id === "string") : [];
    const itemName = [String(line.name ?? product.name), typeof line.variantName === "string" ? line.variantName : null].filter(Boolean).join(" · ");
    const { interval, count } = cadenceInterval(cadence);
    const activeKey = productSubscriptionKey(input.order.storeId, { paymentLinkId: product.id, variantId, extraIds }, email);
    if (info.has(activeKey)) continue; // two identical subscription lines collapse into one subscription
    const nextBillingAt = advanceBillingDate(now, interval, count);
    info.set(activeKey, { name: itemName, cadence, amount: lockedUnitAmount * quantity + fulfillment.fee, next: nextBillingAt });
    rows.push({
      merchantId: input.order.merchantId, storeId: input.order.storeId, paymentLinkId: product.id, variantId, extraIds, itemName, quantity, cadence,
      discountPercent: Number(line.subscription?.discountPercent) || 0, unitAmount: lockedUnitAmount, currency: input.intent.currency,
      customerName: input.intent.customerName?.trim() || "Cliente", customerEmail: email, customerPhone: input.intent.customerPhone,
      consumerUserId: input.intent.consumerUserId, activeKey, status: "ACTIVE", startedAt: now, nextBillingAt,
      fulfillment, sourceOrderId: input.order.id,
      consentText: typeof consent.text === "string" ? consent.text : null, consentAt: typeof consent.at === "string" ? new Date(consent.at) : now,
    });
  }
  if (!rows.length) return NONE;

  const keys = rows.map(row => row.activeKey!);
  const existing = new Set((await tx.customerSubscription.findMany({ where: { activeKey: { in: keys } }, select: { activeKey: true } })).map(row => row.activeKey));
  const fresh = rows.filter(row => !existing.has(row.activeKey!));
  const duplicates = rows.filter(row => existing.has(row.activeKey!)).map(row => info.get(row.activeKey!)!.name);
  const created = fresh.length ? (await tx.customerSubscription.createMany({ data: fresh, skipDuplicates: true })).count : 0;
  const createdRows = fresh.length
    ? await tx.customerSubscription.findMany({ where: { sourceOrderId: input.order.id, activeKey: { in: fresh.map(row => row.activeKey!) } }, select: { id: true, activeKey: true } })
    : [];

  const money = (amount: number) => `${(amount / 100).toFixed(2)} ${input.intent.currency}`;
  const blocks = createdRows.map(row => {
    const entry = info.get(row.activeKey!)!;
    return `Suscripción: ${entry.name} · ${cadenceLabel(entry.cadence)}\nPróxima entrega: ${entry.next.toISOString().slice(0, 10)} · ${money(entry.amount)}\nTe enviaremos un enlace para pagar antes de cada entrega; no se cobra nada automáticamente.\nAdministra tu suscripción: ${subscriptionManageUrl(input.manage.checkoutOrigin, row.id, input.manage.secret)}`;
  });
  for (const name of duplicates) blocks.push(`Ya tenías una suscripción a ${name}; este pedido se registró como compra única.`);
  return { created, duplicates, emailBlock: blocks.join("\n\n") };
}

/** A renewal was paid: the next miss starts counting from zero. Never throws. */
export async function applyRenewalPaid(tx: Prisma.TransactionClient, paymentIntentId: string): Promise<void> {
  const invoice = await tx.subscriptionInvoice.findFirst({ where: { paymentIntentId, status: "PAID" }, select: { subscriptionId: true } });
  if (invoice) await tx.customerSubscription.updateMany({ where: { id: invoice.subscriptionId }, data: { missedCount: 0 } });
}
```

- [ ] **Step 4: Run to see the unit tests pass**

Run: `cd apps/api && npx jest src/operations/subscription-enrollment.spec.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Wire it into `applyRailResult`**

In `payment-intents.service.ts` import `{ applyRenewalPaid, createSubscriptionsFromOrder } from "../operations/subscription-enrollment"`. In the success branch change

```ts
        const order = await tx.storeOrder.findUnique({ where: { paymentIntentId }, select: { id: true, storeId: true, status: true } });
```

to

```ts
        const order = await tx.storeOrder.findUnique({ where: { paymentIntentId }, select: { id: true, storeId: true, status: true, merchantId: true, fulfillmentMethod: true, fulfillmentLocationId: true, fulfillmentLocationName: true } });
        const enrollment = order && tx.productSubscriptionOption?.findMany ? await createSubscriptionsFromOrder(tx, {
          intent: { id: updated.id, livemode: updated.livemode, currency: updated.currency, customerName: updated.customerName, customerEmail: updated.customerEmail, customerPhone: updated.customerPhone, consumerUserId: updated.consumerUserId, metadata: updated.metadata },
          order: { id: order.id, storeId: order.storeId, merchantId: order.merchantId, fulfillmentMethod: order.fulfillmentMethod, fulfillmentLocationId: order.fulfillmentLocationId, fulfillmentLocationName: order.fulfillmentLocationName },
          manage: { checkoutOrigin: this.config?.get<string>('app.checkoutOrigin') ?? 'http://localhost:5174', secret: this.config?.get<string>('app.orderTrackingSecret') ?? DEVELOPMENT_ORDER_TRACKING_SECRET },
        }) : null;
```

(the `tx.productSubscriptionOption?.findMany` guard keeps existing specs whose `tx` mock lacks the model working — same pattern the file already uses for `tx.subscriptionInvoice?.findFirst`).

In the `ORDER_CONFIRMATION` `details` string, after `Sigue tu pedido: ${tracking}` append `${enrollment?.emailBlock ? `\n\n${enrollment.emailBlock}` : ''}`.

After `await tx.subscriptionInvoice.updateMany({ where: { paymentIntentId, status: "DUE" }, data: { status: "PAID", paidAt: new Date() } });` add:

```ts
        if (tx.subscriptionInvoice?.findFirst && tx.customerSubscription?.updateMany) await applyRenewalPaid(tx, paymentIntentId);
```

Add a service-level test in `payment-intents.service.spec.ts`, built on the file's existing successful-cart `applyRailResult` test (copy its arrangement):

```ts
it("starts the buyer's subscription when the first order is paid and puts the manage link in the receipt", async () => {
  // …the file's successful-cart arrangement, with metadata.cart[0].subscription = { cadence: "MONTHLY", discountPercent: 10, lockedUnitAmount: 7200 }
  // and customerEmail "ana@mail.com" on the intent row…
  prisma.productSubscriptionOption = { findMany: jest.fn().mockResolvedValue([{ paymentLinkId: "p1", cadence: "MONTHLY", discountPercent: 10 }]) };
  prisma.paymentLink.findMany.mockResolvedValue([{ id: "p1", fulfillmentType: "PHYSICAL", variants: [], name: "Café 500 g" }]);
  prisma.customerSubscription = { findMany: jest.fn().mockResolvedValueOnce([]).mockResolvedValue([{ id: "cm1sub0000000000000000001", activeKey: expect.any(String) }]), createMany: jest.fn().mockResolvedValue({ count: 1 }), updateMany: jest.fn() };
  // …act as the existing test does…
  expect(prisma.customerSubscription.createMany).toHaveBeenCalledWith(expect.objectContaining({ skipDuplicates: true }));
});
```

(If the existing mock factory shares one object for `prisma` and `tx`, assign the models on it before acting. If `findMany`'s second resolved row must carry the real activeKey, compute it with `productSubscriptionKey("store_1", { paymentLinkId: "p1", variantId: null, extraIds: [] }, "ana@mail.com")` and also assert the receipt `storeEmailDelivery.upsert` body contains `"Administra tu suscripción"`.)

- [ ] **Step 6: Run to see everything pass**

Run: `cd apps/api && npx jest src/operations src/payment-intents`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/operations/subscription-enrollment.ts apps/api/src/operations/subscription-enrollment.spec.ts apps/api/src/payment-intents
git commit -m "feat(subscriptions): the first paid order starts the buyer's subscriptions and the receipt carries the manage link"
```

---

### Task 7: Renewal engine for product subscriptions

**Files:**
- Modify: `apps/api/src/operations/subscriptions.service.ts`
- Modify: `apps/api/src/operations/operations.worker.ts`
- Create: `apps/api/src/operations/subscription-renewals.spec.ts`

**Interfaces:**
- Consumes: `subscriptionTerms`, `advanceBillingDate`, `SubscriptionTerms`, `LAST_REMINDER_AFTER_DAYS`, `MISSED_AFTER_DAYS` (Task 2); `subscriptionManageUrl` (Task 3).
- Produces (on `SubscriptionsService`):
  - `generateSubscriptionInvoices(merchantId, storeId)` — handles product subscriptions; same return shape.
  - `sendDueSubscriptionReminders(merchantId, storeId)` — adds the D + 3 reminder for product renewals.
  - `expireMissedRenewals(merchantId: string, storeId: string): Promise<{ missed: number; paused: number }>`
  - `cancelOpenRenewal(tx: Prisma.TransactionClient, subscriptionId: string): Promise<boolean>` (public; Task 8)
  - `sendSubscriptionNotice(to: string | null, subject: string, body: string): Promise<boolean>` (public; Task 8)
  - `manageUrl(subscriptionId: string): string` (public; Task 8)

- [ ] **Step 1: Write the failing tests** (`subscription-renewals.spec.ts`)

```ts
import { SubscriptionsService } from "./subscriptions.service";

function makePrisma() {
  const prisma: any = {
    store: { findFirst: jest.fn().mockResolvedValue({ id: "store_1", merchantId: "merchant_1", name: "Café Norte", status: "ACTIVE", contactEmail: "tienda@mail.com" }) },
    merchant: { findUniqueOrThrow: jest.fn().mockResolvedValue({ status: "ACTIVE" }) },
    subscriptionPlan: { findFirst: jest.fn() },
    customerSubscription: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn(), update: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    subscriptionInvoice: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn(), findFirst: jest.fn(), upsert: jest.fn(), update: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    paymentLink: { findFirst: jest.fn() },
    paymentIntent: { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    storeOrder: { create: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    storeOrderStatusEvent: { create: jest.fn() },
    deliveryAssignment: { create: jest.fn() },
    $queryRaw: jest.fn().mockResolvedValue([{ paymentIntentId: null, orderId: null }]),
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation((callback: (tx: unknown) => unknown) => callback(prisma));
  return prisma;
}
const config = { get: (key: string) => (key === "app.orderTrackingSecret" ? "s" : "http://localhost:5174") };
const productSubscription = {
  id: "cm1sub0000000000000000001", merchantId: "merchant_1", storeId: "store_1", planId: null, paymentLinkId: "p1", variantId: null, extraIds: [],
  itemName: "Café 500 g", quantity: 2, cadence: "MONTHLY", discountPercent: 10, unitAmount: 7200, currency: "BOB", pendingUnitAmount: null, pendingFrom: null,
  fulfillment: { method: "delivery", zoneId: "zone_1", zoneName: "Centro", fee: 1500, address: "Calle 1" }, customerName: "Ana", customerEmail: "ana@mail.com",
  customerPhone: "70000000", status: "ACTIVE", missedCount: 0, amountOverride: null, nextAmountOverride: null,
  nextBillingAt: new Date(Date.now() + 48 * 3_600_000),
};

describe("product subscription renewals", () => {
  let prisma: any, paymentIntents: any, email: any, service: SubscriptionsService;
  beforeEach(() => {
    prisma = makePrisma();
    paymentIntents = { createInTransaction: jest.fn().mockResolvedValue({ id: "pi_r1", clientSecret: "pi_r1_secret" }) };
    email = { send: jest.fn().mockResolvedValue(undefined) };
    service = new SubscriptionsService(prisma, email, paymentIntents, config as never);
    prisma.customerSubscription.findMany.mockResolvedValue([productSubscription]);
    prisma.paymentLink.findFirst.mockResolvedValue({ id: "p1", status: "ACTIVE", fulfillmentType: "PHYSICAL", stock: null, variants: [] });
    prisma.subscriptionInvoice.findUnique.mockResolvedValue(null);
    prisma.subscriptionInvoice.upsert.mockResolvedValue({ id: "inv_1", periodStart: productSubscription.nextBillingAt, dueAt: productSubscription.nextBillingAt, amount: 15900, currency: "BOB" });
    prisma.storeOrder.create.mockResolvedValue({ id: "order_r1" });
  });

  it("creates the renewal order, its intent with metadata.cart, and emails the pay and manage links 72 h ahead", async () => {
    await service.generateSubscriptionInvoices("merchant_1", "store_1");
    expect(paymentIntents.createInTransaction).toHaveBeenCalledWith(expect.anything(), "merchant_1", true, expect.objectContaining({
      amount: 15900, customerEmail: "ana@mail.com",
      metadata: expect.objectContaining({
        cart: [expect.objectContaining({ paymentLinkId: "p1", quantity: 2, unitAmount: 7200 })],
        shipping: expect.objectContaining({ id: "zone_1", amount: 1500 }),
        subscription: expect.objectContaining({ subscriptionId: productSubscription.id, invoiceId: "inv_1" }),
      }),
    }));
    expect(prisma.storeOrder.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ paymentIntentId: "pi_r1", status: "AWAITING_PAYMENT", amount: 15900, fulfillmentMethod: "delivery" }) }));
    expect(prisma.deliveryAssignment.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ orderId: "order_r1", zoneId: "zone_1", fee: 1500 }) }));
    expect(prisma.subscriptionInvoice.update).toHaveBeenCalledWith({ where: { id: "inv_1" }, data: { orderId: "order_r1" } });
    const sent = email.send.mock.calls[0][0];
    expect(sent.subject).toContain("Tu pedido de Café 500 g está listo");
    expect(sent.body).toContain("/suscripcion/");
    expect(sent.body).toContain("No se cobra nada automáticamente.");
  });

  it("waits until 72 h before the renewal date", async () => {
    prisma.customerSubscription.findMany.mockResolvedValue([{ ...productSubscription, nextBillingAt: new Date(Date.now() + 80 * 3_600_000) }]);
    await service.generateSubscriptionInvoices("merchant_1", "store_1");
    expect(paymentIntents.createInTransaction).not.toHaveBeenCalled();
  });

  it("reuses the renewal order on a second run", async () => {
    prisma.subscriptionInvoice.findUnique.mockResolvedValue({ id: "inv_1", periodStart: productSubscription.nextBillingAt, dueAt: productSubscription.nextBillingAt, amount: 15900, currency: "BOB", paymentIntentId: "pi_r1", orderId: "order_r1" });
    prisma.$queryRaw.mockResolvedValue([{ paymentIntentId: "pi_r1", orderId: "order_r1" }]);
    prisma.paymentIntent.findUnique.mockResolvedValue({ id: "pi_r1", status: "REQUIRES_PAYMENT_METHOD", clientSecret: "pi_r1_secret" });
    await service.generateSubscriptionInvoices("merchant_1", "store_1");
    expect(paymentIntents.createInTransaction).not.toHaveBeenCalled();
    expect(prisma.storeOrder.create).not.toHaveBeenCalled();
    expect(email.send).not.toHaveBeenCalled();
  });

  it("skips the period and tells the buyer when the product is out of stock", async () => {
    prisma.paymentLink.findFirst.mockResolvedValue({ id: "p1", status: "ACTIVE", fulfillmentType: "PHYSICAL", stock: 1, variants: [] });
    await service.generateSubscriptionInvoices("merchant_1", "store_1");
    expect(prisma.subscriptionInvoice.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ status: "SKIPPED" }) }));
    expect(prisma.customerSubscription.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { nextBillingAt: expect.any(Date) } }));
    expect(paymentIntents.createInTransaction).not.toHaveBeenCalled();
    expect(email.send).toHaveBeenCalledWith(expect.objectContaining({ subject: expect.stringContaining("no está disponible") }));
  });

  it("cancels the subscription when the product was archived", async () => {
    prisma.paymentLink.findFirst.mockResolvedValue(null);
    await service.generateSubscriptionInvoices("merchant_1", "store_1");
    expect(prisma.customerSubscription.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: productSubscription.id, status: "ACTIVE" }, data: expect.objectContaining({ status: "CANCELED", activeKey: null }) }));
    expect(paymentIntents.createInTransaction).not.toHaveBeenCalled();
  });

  it("expires unpaid renewals at D+7 and cancels intent and order", async () => {
    prisma.subscriptionInvoice.findMany.mockResolvedValue([{ id: "inv_1", subscriptionId: productSubscription.id, orderId: "order_r1", paymentIntentId: "pi_r1", status: "DUE", dueAt: new Date(Date.now() - 8 * 86_400_000) }]);
    prisma.customerSubscription.update.mockResolvedValue({ ...productSubscription, missedCount: 1 });
    const result = await service.expireMissedRenewals("merchant_1", "store_1");
    expect(prisma.subscriptionInvoice.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ status: "DUE", orderId: { not: null } }) }));
    expect(prisma.paymentIntent.updateMany).toHaveBeenCalledWith({ where: { id: "pi_r1", status: { in: ["REQUIRES_PAYMENT_METHOD", "FAILED"] } }, data: { status: "CANCELED" } });
    expect(prisma.storeOrder.updateMany).toHaveBeenCalledWith({ where: { id: "order_r1", status: "AWAITING_PAYMENT" }, data: { status: "CANCELED" } });
    expect(prisma.subscriptionInvoice.updateMany).toHaveBeenCalledWith({ where: { id: "inv_1", status: "DUE" }, data: { status: "MISSED" } });
    expect(result).toEqual({ missed: 1, paused: 0 });
  });

  it("pauses after two consecutive misses and tells buyer and merchant", async () => {
    prisma.subscriptionInvoice.findMany.mockResolvedValue([{ id: "inv_2", subscriptionId: productSubscription.id, orderId: "order_r2", paymentIntentId: "pi_r2", status: "DUE", dueAt: new Date(Date.now() - 8 * 86_400_000) }]);
    prisma.customerSubscription.update.mockResolvedValue({ ...productSubscription, missedCount: 2 });
    const result = await service.expireMissedRenewals("merchant_1", "store_1");
    expect(prisma.customerSubscription.updateMany).toHaveBeenCalledWith({ where: { id: productSubscription.id, status: "ACTIVE" }, data: { status: "PAUSED", pausedAt: expect.any(Date) } });
    expect(result.paused).toBe(1);
    expect(email.send).toHaveBeenCalledTimes(2);
  });

  it("sends the last reminder three days after the renewal date, only for product renewals", async () => {
    prisma.subscriptionInvoice.findMany.mockResolvedValue([{ id: "inv_1", subscriptionId: productSubscription.id, orderId: "order_r1", paymentIntentId: "pi_r1", status: "DUE", reminderCount: 1, dueAt: new Date(Date.now() - 4 * 86_400_000), amount: 15900, currency: "BOB" }]);
    prisma.customerSubscription.findFirst.mockResolvedValue(productSubscription);
    prisma.paymentIntent.findUnique.mockResolvedValue({ id: "pi_r1", status: "REQUIRES_PAYMENT_METHOD", clientSecret: "x" });
    await service.sendDueSubscriptionReminders("merchant_1", "store_1");
    expect(prisma.subscriptionInvoice.findMany.mock.calls[0][0].where.OR).toEqual(expect.arrayContaining([expect.objectContaining({ orderId: { not: null }, reminderCount: 1 })]));
    expect(email.send).toHaveBeenCalledWith(expect.objectContaining({ subject: expect.stringContaining("Último recordatorio") }));
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `cd apps/api && npx jest src/operations/subscription-renewals.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Implement in `subscriptions.service.ts`**

Imports to add: `CustomerSubscription, OrderFulfillmentStatus` from `@prisma/client`; `readStockVariants, DAY_MS` from `./operations-helpers` (`DAY_MS` is already imported); `advanceBillingDate, LAST_REMINDER_AFTER_DAYS, MISSED_AFTER_DAYS, subscriptionTerms, type SubscriptionTerms` from `./subscription-pricing`; `subscriptionManageUrl` from `./subscription-manage-token`; `DEVELOPMENT_ORDER_TRACKING_SECRET` from the module `payment-intents.service.ts` imports it from (grep `DEVELOPMENT_ORDER_TRACKING_SECRET =` to find it).

a) Delete the private `advanceBilling`; use `advanceBillingDate` everywhere.

b) Module-level helpers (below the imports):

```ts
type RenewalFulfillment = { method?: string; locationId?: string; locationName?: string; zoneId?: string; zoneName?: string; fee?: number; address?: string };
const renewalFulfillment = (subscription: { fulfillment: Prisma.JsonValue }) => (subscription.fulfillment ?? {}) as RenewalFulfillment;
function renewalFulfillmentMetadata(f: RenewalFulfillment) {
  if (f.zoneId) return { shipping: { id: f.zoneId, name: f.zoneName, amount: f.fee ?? 0, address: f.address } };
  if (f.locationId) return { fulfillment: { locationId: f.locationId, locationName: f.locationName, method: f.method, ...(f.address ? { address: f.address } : {}) } };
  return {};
}
```

c) Public helpers on the class:

```ts
  manageUrl(subscriptionId: string): string {
    return subscriptionManageUrl(this.config.get<string>("app.checkoutOrigin") ?? "http://localhost:5174", subscriptionId, this.config.get<string>("app.orderTrackingSecret") ?? DEVELOPMENT_ORDER_TRACKING_SECRET);
  }

  async sendSubscriptionNotice(to: string | null, subject: string, body: string): Promise<boolean> {
    if (!to) return false;
    try { await this.email.send({ to, subject, body }); return true; }
    catch (error) { this.logger.warn(`Subscription notice failed for ${to}: ${(error as Error).message}`); return false; }
  }

  /** Cancels the open (unpaid) renewal of a subscription; paid orders are never touched. */
  async cancelOpenRenewal(tx: Prisma.TransactionClient, subscriptionId: string): Promise<boolean> {
    const open = await tx.subscriptionInvoice.findFirst({ where: { subscriptionId, status: "DUE" }, orderBy: { periodStart: "desc" } });
    if (!open) return false;
    if (open.paymentIntentId) await tx.paymentIntent.updateMany({ where: { id: open.paymentIntentId, status: { in: [PaymentIntentStatus.REQUIRES_PAYMENT_METHOD, PaymentIntentStatus.FAILED] } }, data: { status: PaymentIntentStatus.CANCELED } });
    if (open.orderId) {
      const order = await tx.storeOrder.updateMany({ where: { id: open.orderId, status: OrderFulfillmentStatus.AWAITING_PAYMENT }, data: { status: OrderFulfillmentStatus.CANCELED } });
      if (order.count) await tx.storeOrderStatusEvent.create({ data: { orderId: open.orderId, status: OrderFulfillmentStatus.CANCELED } });
    }
    return (await tx.subscriptionInvoice.updateMany({ where: { id: open.id, status: "DUE" }, data: { status: "SKIPPED" } })).count === 1;
  }
```

d) Replace `ensureSubscriptionPaymentIntent` with:

```ts
  private async ensureSubscriptionPaymentIntent(
    tx: Prisma.TransactionClient,
    livemode: boolean,
    storeName: string,
    subscription: CustomerSubscription,
    terms: SubscriptionTerms,
    invoice: { id: string; periodStart: Date; amount: number; currency: string },
    merchantId: string,
    storeId: string,
    forceNew = false,
  ) {
    const rows = await tx.$queryRaw<Array<{ paymentIntentId: string | null; orderId: string | null }>>`
      SELECT "paymentIntentId", "orderId" FROM "SubscriptionInvoice" WHERE id = ${invoice.id} FOR UPDATE
    `;
    const existingIntentId = rows[0]?.paymentIntentId;
    if (existingIntentId) {
      const existingIntent = await tx.paymentIntent.findUnique({ where: { id: existingIntentId } });
      if (existingIntent && (!forceNew || (existingIntent.status !== PaymentIntentStatus.FAILED && existingIntent.status !== PaymentIntentStatus.CANCELED))) return { intent: existingIntent, created: false };
      if (existingIntent?.status === PaymentIntentStatus.FAILED) {
        await tx.paymentIntent.update({ where: { id: existingIntent.id }, data: { status: PaymentIntentStatus.CANCELED } });
      }
      if (rows[0]?.orderId) await tx.storeOrder.updateMany({ where: { id: rows[0].orderId, status: OrderFulfillmentStatus.AWAITING_PAYMENT }, data: { status: OrderFulfillmentStatus.CANCELED } });
    }
    const f = renewalFulfillment(subscription);
    const productLine = subscription.paymentLinkId && subscription.quantity ? {
      paymentLinkId: subscription.paymentLinkId,
      ...(subscription.variantId ? { variantId: subscription.variantId } : {}),
      ...(subscription.extraIds.length ? { extraIds: subscription.extraIds } : {}),
      name: subscription.itemName ?? terms.name,
      quantity: subscription.quantity,
      unitAmount: Math.round((invoice.amount - (f.fee ?? 0)) / subscription.quantity),
    } : null;
    const intent = await this.paymentIntents.createInTransaction(tx, merchantId, livemode, {
      amount: invoice.amount,
      currency: invoice.currency,
      description: `${terms.name} · ${subscription.customerName} · ${storeName}`,
      customerName: subscription.customerName,
      customerEmail: subscription.customerEmail ?? undefined,
      customerPhone: subscription.customerPhone ?? undefined,
      metadata: {
        storeId,
        ...(productLine ? { cart: [productLine], ...renewalFulfillmentMetadata(f) } : {}),
        subscription: {
          invoiceId: invoice.id, subscriptionId: subscription.id, planId: subscription.planId, planName: terms.name,
          periodStart: invoice.periodStart.toISOString(), customerName: subscription.customerName,
          customerEmail: subscription.customerEmail, customerPhone: subscription.customerPhone,
        },
      },
    });
    await tx.subscriptionInvoice.update({ where: { id: invoice.id }, data: { paymentIntentId: intent.id } });
    if (productLine) {
      const order = await tx.storeOrder.create({ data: {
        paymentIntentId: intent.id, merchantId, storeId, storeName,
        ...(f.method ? { fulfillmentMethod: f.method } : {}),
        ...(f.locationId ? { fulfillmentLocationId: f.locationId, fulfillmentLocationName: f.locationName ?? null } : {}),
        items: [productLine] as Prisma.InputJsonValue, amount: invoice.amount, currency: invoice.currency,
        status: OrderFulfillmentStatus.AWAITING_PAYMENT,
        statusEvents: { create: { status: OrderFulfillmentStatus.AWAITING_PAYMENT } },
      } });
      if (f.zoneId && f.address) await tx.deliveryAssignment.create({ data: { merchantId, storeId, orderId: order.id, zoneId: f.zoneId, fee: f.fee ?? 0, address: f.address } });
      await tx.subscriptionInvoice.update({ where: { id: invoice.id }, data: { orderId: order.id } });
    }
    return { intent, created: true };
  }
```

(Check `createInTransaction`'s dto type accepts `customerName/customerEmail/customerPhone` — it does per `CreatePaymentIntentDto`; if its TS type is narrower, widen it to `CreatePaymentIntentDto`.)

e) Replace `sendSubscriptionChargeEmail` with `sendChargeNotice`:

```ts
  private async sendChargeNotice(storeName: string, subscription: CustomerSubscription, terms: SubscriptionTerms, invoice: { amount: number; currency: string; dueAt?: Date; periodStart?: Date }, checkoutUrl: string, kind: "first" | "reminder" | "last"): Promise<boolean> {
    const amount = `${(invoice.amount / 100).toFixed(2)} ${invoice.currency}`;
    if (!terms.product) {
      return this.sendSubscriptionNotice(subscription.customerEmail,
        kind === "first" ? `Tu cobro de ${terms.name} en ${storeName}` : `Recordatorio: ${terms.name} en ${storeName}`,
        kind === "first"
          ? `Hola ${subscription.customerName}, tu cobro de ${amount} por ${terms.name} está listo. Págalo de forma segura aquí: ${checkoutUrl}`
          : `Hola ${subscription.customerName}, tu cobro de ${amount} por ${terms.name} sigue pendiente. Puedes pagarlo aquí: ${checkoutUrl}`);
    }
    const date = (invoice.dueAt ?? invoice.periodStart)?.toISOString().slice(0, 10) ?? "";
    const subject = kind === "first" ? `Tu pedido de ${terms.name} está listo · ${storeName}`
      : kind === "reminder" ? `Recordatorio: tu pedido de ${terms.name} · ${storeName}`
      : `Último recordatorio: tu pedido de ${terms.name} · ${storeName}`;
    const lead = kind === "first" ? `tu próxima entrega de ${terms.name} (${date}) está lista.`
      : kind === "reminder" ? `tu entrega de ${terms.name} sigue pendiente de pago.`
      : `si no pagas en los próximos 4 días, saltaremos esta entrega de ${terms.name}.`;
    return this.sendSubscriptionNotice(subscription.customerEmail, subject,
      `Hola ${subscription.customerName}, ${lead}\nTotal: ${amount}\nPágalo con un toque: ${checkoutUrl}\n\nNo se cobra nada automáticamente. Puedes saltar, pausar o cancelar aquí: ${this.manageUrl(subscription.id)}`);
  }
```

The plan-subscription wording is exactly today's, so existing specs keep passing.

f) A small loader used by the loops:

```ts
  private async termsFor(subscription: CustomerSubscription, storeId: string, now = new Date()) {
    const plan = subscription.planId ? await this.prisma.subscriptionPlan.findFirst({ where: { id: subscription.planId, storeId } }) : null;
    return subscriptionTerms(subscription, plan, now);
  }
```

g) `generateSubscriptionInvoices` candidate loop becomes:

```ts
    for (const subscription of candidates) {
      const terms = await this.termsFor(subscription, storeId, now);
      if (!terms) continue;
      const generationAt = new Date(subscription.nextBillingAt.getTime() - terms.noticeHours * 3_600_000);
      if (generationAt > now) continue;
      if (terms.product) {
        const availability = await this.renewalAvailability(subscription);
        if (availability === "gone") { await this.endGoneSubscription(store.name, subscription); continue; }
        if (availability === "out_of_stock") { await this.skipOutOfStockPeriod(store.name, subscription, terms); continue; }
      }
      const pendingApplies = !!subscription.pendingFrom && subscription.pendingFrom <= now && !!subscription.pendingUnitAmount;
      const outcome = await this.prisma.$transaction(async (tx) => {
        const existing = await tx.subscriptionInvoice.findUnique({ where: { subscriptionId_periodStart: { subscriptionId: subscription.id, periodStart: subscription.nextBillingAt } } });
        const invoice = existing ?? await tx.subscriptionInvoice.upsert({
          where: { subscriptionId_periodStart: { subscriptionId: subscription.id, periodStart: subscription.nextBillingAt } },
          create: { subscriptionId: subscription.id, merchantId, storeId, periodStart: subscription.nextBillingAt, amount: terms.amount, currency: terms.currency, dueAt: subscription.nextBillingAt },
          update: {},
        });
        const ensured = await this.ensureSubscriptionPaymentIntent(tx, livemode, store.name, subscription, terms, invoice, merchantId, storeId);
        await tx.customerSubscription.updateMany({
          where: { id: subscription.id, status: "ACTIVE", nextBillingAt: subscription.nextBillingAt },
          data: {
            nextBillingAt: advanceBillingDate(subscription.nextBillingAt, terms.interval, terms.count), nextAmountOverride: null,
            ...(pendingApplies ? { unitAmount: subscription.pendingUnitAmount, pendingUnitAmount: null, pendingFrom: null } : {}),
          },
        });
        return { invoice, intent: ensured.intent, invoiceCreated: !existing, paymentLinkCreated: ensured.created };
      });
      if (outcome.invoiceCreated) created += 1;
      if (outcome.paymentLinkCreated) paymentLinksCreated += 1;
      const checkoutUrl = paymentCheckoutUrl(this.config, outcome.intent.clientSecret);
      charges.push({ invoiceId: outcome.invoice.id, paymentIntentId: outcome.intent.id, checkoutUrl, amount: outcome.invoice.amount, currency: outcome.invoice.currency });
      if (outcome.paymentLinkCreated && await this.sendChargeNotice(store.name, subscription, terms, outcome.invoice, checkoutUrl, "first")) {
        emailsSent += 1;
        await this.prisma.subscriptionInvoice.update({ where: { id: outcome.invoice.id }, data: { initialNoticeAt: new Date() } });
      }
    }
```

In the `invoicesWithoutLinks` loop replace the plan lookup with `const terms = await this.termsFor(subscription, storeId, now); if (!terms) continue;` and pass `terms` to `ensureSubscriptionPaymentIntent` and `sendChargeNotice(…, "first")`. Remove the Task 1 temporary `if (!subscription.planId) continue;` lines.

h) `sendDueSubscriptionReminders` — query and kind:

```ts
    const lastCutoff = new Date(now.getTime() - LAST_REMINDER_AFTER_DAYS * DAY_MS);
    const invoices = await this.prisma.subscriptionInvoice.findMany({
      where: {
        merchantId, storeId, status: "DUE",
        OR: [
          { dueAt: { lte: now }, lastReminderAt: null, AND: [{ OR: [{ initialNoticeAt: null }, { initialNoticeAt: { lte: initialCutoff } }] }] },
          { orderId: { not: null }, reminderCount: 1, dueAt: { lte: lastCutoff } },
        ],
      },
      orderBy: { dueAt: "asc" },
      take: 200,
    });
```

In the loop: `const terms = await this.termsFor(subscription, storeId, now);` (skip when null, replacing the plan lookup), then `this.sendChargeNotice(store.name, subscription, terms, invoice, paymentCheckoutUrl(this.config, intent.clientSecret), invoice.reminderCount >= 1 ? "last" : "reminder")`.

`remindSubscriptionInvoice`: replace the plan lookup with `const terms = await this.termsFor(subscription, storeId); if (!terms) throw new NotFoundException("Subscription plan not found");`, pass `terms` to `ensureSubscriptionPaymentIntent`, and send with `sendChargeNotice(…, "reminder")`.

i) Availability, gone, out-of-stock and missed:

```ts
  private async renewalAvailability(subscription: CustomerSubscription): Promise<"ok" | "gone" | "out_of_stock"> {
    const product = await this.prisma.paymentLink.findFirst({ where: { id: subscription.paymentLinkId!, storeId: subscription.storeId, status: "ACTIVE" } });
    if (!product || product.fulfillmentType === "DIGITAL") return "gone";
    const variant = subscription.variantId ? readStockVariants(product.variants).find(entry => entry.id === subscription.variantId) : undefined;
    if (subscription.variantId && !variant) return "gone";
    const quantity = subscription.quantity ?? 1;
    if (product.stock !== null && product.stock < quantity) return "out_of_stock";
    if (variant && typeof variant.stock === "number" && variant.stock < quantity) return "out_of_stock";
    return "ok";
  }

  private async endGoneSubscription(storeName: string, subscription: CustomerSubscription) {
    const ended = await this.prisma.customerSubscription.updateMany({ where: { id: subscription.id, status: "ACTIVE" }, data: { status: "CANCELED", activeKey: null, canceledAt: new Date() } });
    if (ended.count) await this.sendSubscriptionNotice(subscription.customerEmail, `Tu suscripción terminó · ${storeName}`,
      `Hola ${subscription.customerName}, ${subscription.itemName ?? "este producto"} ya no está disponible en ${storeName}, así que tu suscripción terminó. No se hizo ningún cobro.`);
  }

  private async skipOutOfStockPeriod(storeName: string, subscription: CustomerSubscription, terms: SubscriptionTerms) {
    await this.prisma.$transaction(async (tx) => {
      await tx.subscriptionInvoice.upsert({
        where: { subscriptionId_periodStart: { subscriptionId: subscription.id, periodStart: subscription.nextBillingAt } },
        create: { subscriptionId: subscription.id, merchantId: subscription.merchantId, storeId: subscription.storeId, periodStart: subscription.nextBillingAt, amount: terms.amount, currency: terms.currency, dueAt: subscription.nextBillingAt, status: "SKIPPED" },
        update: {},
      });
      await tx.customerSubscription.updateMany({ where: { id: subscription.id, status: "ACTIVE", nextBillingAt: subscription.nextBillingAt }, data: { nextBillingAt: advanceBillingDate(subscription.nextBillingAt, terms.interval, terms.count) } });
    });
    await this.sendSubscriptionNotice(subscription.customerEmail, `Tu entrega de ${terms.name} no está disponible · ${storeName}`,
      `Hola ${subscription.customerName}, esta vez no hay stock de ${terms.name}, así que saltamos esta entrega sin cobrarte nada. Tu suscripción sigue activa: ${this.manageUrl(subscription.id)}`);
  }

  async expireMissedRenewals(merchantId: string, storeId: string) {
    const store = await ownedStore(this.prisma, merchantId, storeId);
    const cutoff = new Date(Date.now() - MISSED_AFTER_DAYS * DAY_MS);
    const invoices = await this.prisma.subscriptionInvoice.findMany({ where: { merchantId, storeId, status: "DUE", orderId: { not: null }, dueAt: { lte: cutoff } }, take: 200 });
    let missed = 0;
    let paused = 0;
    for (const invoice of invoices) {
      const result = await this.prisma.$transaction(async (tx) => {
        const marked = await tx.subscriptionInvoice.updateMany({ where: { id: invoice.id, status: "DUE" }, data: { status: "MISSED" } });
        if (!marked.count) return null;
        if (invoice.paymentIntentId) await tx.paymentIntent.updateMany({ where: { id: invoice.paymentIntentId, status: { in: [PaymentIntentStatus.REQUIRES_PAYMENT_METHOD, PaymentIntentStatus.FAILED] } }, data: { status: PaymentIntentStatus.CANCELED } });
        const order = await tx.storeOrder.updateMany({ where: { id: invoice.orderId!, status: OrderFulfillmentStatus.AWAITING_PAYMENT }, data: { status: OrderFulfillmentStatus.CANCELED } });
        if (order.count) await tx.storeOrderStatusEvent.create({ data: { orderId: invoice.orderId!, status: OrderFulfillmentStatus.CANCELED } });
        const subscription = await tx.customerSubscription.update({ where: { id: invoice.subscriptionId }, data: { missedCount: { increment: 1 } } });
        const pause = subscription.missedCount >= 2
          && (await tx.customerSubscription.updateMany({ where: { id: subscription.id, status: "ACTIVE" }, data: { status: "PAUSED", pausedAt: new Date() } })).count === 1;
        return { subscription, pause };
      });
      if (!result) continue;
      missed += 1;
      if (!result.pause) continue;
      paused += 1;
      const name = result.subscription.itemName ?? "tu suscripción";
      await this.sendSubscriptionNotice(result.subscription.customerEmail, `Pausamos tu suscripción · ${store.name}`,
        `Hola ${result.subscription.customerName}, no recibimos el pago de las dos últimas entregas de ${name}, así que pausamos la suscripción. Puedes reanudarla cuando quieras: ${this.manageUrl(result.subscription.id)}`);
      await this.sendSubscriptionNotice(store.contactEmail, `Suscripción pausada: ${result.subscription.customerName}`,
        `La suscripción de ${result.subscription.customerName} a ${name} se pausó tras dos entregas sin pagar. Revísala en Suscripciones.`);
    }
    return { missed, paused };
  }
```

j) `operations.worker.ts`, after the reminders call inside `if (generation[1].status === "fulfilled")`:

```ts
          await this.subscriptions.expireMissedRenewals(store.merchantId, store.id).catch((error: Error) => {
            this.logger.warn(`Missed renewals failed for ${store.id}: ${error.message}`);
          });
```

- [ ] **Step 4: Run the new tests and the regression suite**

Run: `cd apps/api && npx jest src/operations src/payment-intents && npx tsc --noEmit -p tsconfig.json`
Expected: PASS — including every pre-existing plan-subscription test in `operations.service.spec.ts` unchanged (add `storeOrder.create/updateMany`, `storeOrderStatusEvent.create`, `deliveryAssignment.create`, `subscriptionInvoice.findFirst/updateMany` to its `makePrisma` only if a test reaches them; plan subscriptions should not).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/operations
git commit -m "feat(subscriptions): renewals create a real order with a one-tap pay link, remind twice, skip when out of stock and pause after two misses"
```

---

### Task 8: Merchant and public subscription APIs

**Files:**
- Create: `apps/api/src/operations/dto/subscribers.dto.ts`
- Create: `apps/api/src/operations/subscribers.service.ts`
- Create: `apps/api/src/operations/subscribers.service.spec.ts`
- Create: `apps/api/src/operations/subscribers.controller.ts`
- Create: `apps/api/src/operations/subscription-manage.controller.ts`
- Modify: `apps/api/src/operations/operations.module.ts`

**Interfaces:**
- Consumes: `SubscriptionsService.cancelOpenRenewal`, `.sendSubscriptionNotice`, `.manageUrl`, `.remindSubscriptionInvoice` (Task 7); `readSubscriptionManageToken` (Task 3); `advanceBillingDate`, `cadenceLabel`, `monthlyFactor`, `REPRICE_NOTICE_DAYS`, `subscriptionPrices`, `subscriptionTerms` (Task 2); `readProductVariants`, `readProductExtras`, `selectedExtrasAmount` (`apps/api/src/stores/product-pricing.ts`).
- Produces (HTTP):
  - Merchant (`MerchantAuthGuard`, prefix `v1/stores/:storeId/subscriptions`):
    - `GET /` `?status=ACTIVE|PAUSED|CANCELED|PENDING&productId&q&cursor` → `{ items: SubscriberRow[]; nextCursor: string | null }`
    - `GET /summary` → `{ active: number; monthlyRecurring: number; currency: string; renewalsThisWeek: number; renewalPayRate: number | null; enabled: boolean }`
    - `PUT /settings` `{ enabled: boolean }` → `{ enabled: boolean; activeSubscribers: number }`
    - `POST /products/:productId/reprice` → `{ affected: number; effectiveFrom: string }`
    - `PATCH /:id` `{ action: "skip" | "pause" | "resume" | "cancel" }` → `SubscriberRow`
    - `POST /:id/resend` → `{ checkoutUrl: string; sent: boolean; whatsappText: string }`
  - Public (throttled 30/min, `Cache-Control: no-store`, prefix `v1/subscriptions/public/:token`):
    - `GET /` → `ManageView`
    - `POST /actions` `{ action: "skip" | "pause" | "resume" | "cancel" | "change_cadence"; cadence? }` → `ManageView`
  - `type SubscriberRow = { id: string; kind: "product" | "plan"; customerName: string; customerEmail: string | null; customerPhone: string | null; itemName: string; productId: string | null; cadence: string | null; cadenceLabel: string; amount: number; currency: string; nextBillingAt: string; status: string; displayStatus: "ACTIVE" | "PAUSED" | "CANCELED" | "PENDING_PAYMENT"; lastPaidAt: string | null; livemode: boolean }`
  - `type ManageView = { storeName: string; itemName: string; cadence: string; cadenceLabel: string; amount: number; currency: string; nextBillingAt: string; status: string; openPayment: { checkoutUrl: string; amount: number; dueAt: string } | null; history: Array<{ periodStart: string; status: string; amount: number }>; cadenceOptions: Array<{ cadence: string; label: string; discountPercent: number }> }`

- [ ] **Step 1: Write the failing tests** (`subscribers.service.spec.ts`)

```ts
import { createSubscriptionManageToken } from "./subscription-manage-token";
import { SubscribersService } from "./subscribers.service";

const productSubscription = {
  id: "cm1sub0000000000000000001", merchantId: "merchant_1", storeId: "store_1", planId: null, paymentLinkId: "p1", variantId: null, extraIds: [],
  itemName: "Café 500 g", quantity: 1, cadence: "MONTHLY", discountPercent: 10, unitAmount: 7200, currency: "BOB", pendingUnitAmount: null, pendingFrom: null,
  fulfillment: null, customerName: "Ana", customerEmail: "ana@mail.com", customerPhone: "70000000", status: "ACTIVE", missedCount: 0,
  nextBillingAt: new Date(Date.now() + 10 * 86_400_000), sourceOrderId: "order_1", amountOverride: null, nextAmountOverride: null,
};

function setup() {
  const prisma: any = {
    store: { findFirst: jest.fn().mockResolvedValue({ id: "store_1", merchantId: "merchant_1", name: "Café Norte", status: "ACTIVE", subscriptionsEnabled: true }), findUnique: jest.fn().mockResolvedValue({ name: "Café Norte" }), update: jest.fn() },
    customerSubscription: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(productSubscription), findUnique: jest.fn().mockResolvedValue(productSubscription), findUniqueOrThrow: jest.fn().mockResolvedValue(productSubscription), update: jest.fn().mockResolvedValue(productSubscription), updateMany: jest.fn().mockResolvedValue({ count: 1 }), count: jest.fn().mockResolvedValue(0) },
    subscriptionPlan: { findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    subscriptionInvoice: { findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
    productSubscriptionOption: { findMany: jest.fn().mockResolvedValue([{ cadence: "MONTHLY", discountPercent: 10 }]) },
    paymentLink: { findFirst: jest.fn().mockResolvedValue({ id: "p1", amount: 8000, variants: [], extras: [], status: "ACTIVE" }) },
    paymentIntent: { findUnique: jest.fn() },
    storeOrder: { findMany: jest.fn().mockResolvedValue([{ id: "order_1", paymentIntent: { livemode: true } }]) },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation((callback: (tx: unknown) => unknown) => callback(prisma));
  const email = { send: jest.fn() };
  const subscriptions: any = {
    cancelOpenRenewal: jest.fn().mockResolvedValue(false),
    sendSubscriptionNotice: jest.fn().mockImplementation((to: string, subject: string, body: string) => email.send({ to, subject, body }).then(() => true)),
    manageUrl: jest.fn().mockReturnValue("https://pagar.test/suscripcion/x"),
    remindSubscriptionInvoice: jest.fn(),
  };
  const config = { get: (key: string) => (key === "app.orderTrackingSecret" ? "s" : "http://localhost:5174") };
  return { prisma, email, subscriptions, service: new SubscribersService(prisma, subscriptions, config as never) };
}
const token = createSubscriptionManageToken(productSubscription.id, "s");

describe("SubscribersService", () => {
  it("skips the next renewal by moving the date when nothing is open", async () => {
    const { prisma, service } = setup();
    await service.act("merchant_1", "store_1", productSubscription.id, "skip");
    expect(prisma.customerSubscription.updateMany).toHaveBeenCalledWith({ where: { id: productSubscription.id, status: "ACTIVE", nextBillingAt: productSubscription.nextBillingAt }, data: { nextBillingAt: expect.any(Date) } });
  });

  it("skips an open renewal by canceling it", async () => {
    const { prisma, subscriptions, service } = setup();
    subscriptions.cancelOpenRenewal.mockResolvedValue(true);
    await service.act("merchant_1", "store_1", productSubscription.id, "skip");
    expect(prisma.customerSubscription.updateMany).not.toHaveBeenCalled();
  });

  it("answers 409 when a renewal was generated at the same moment", async () => {
    const { prisma, service } = setup();
    prisma.customerSubscription.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.act("merchant_1", "store_1", productSubscription.id, "skip")).rejects.toThrow("Tu renovación ya se generó; puedes pagarla o saltarla");
  });

  it("cancel cancels the open renewal and frees the active key", async () => {
    const { prisma, subscriptions, service } = setup();
    await service.act("merchant_1", "store_1", productSubscription.id, "cancel");
    expect(subscriptions.cancelOpenRenewal).toHaveBeenCalledWith(prisma, productSubscription.id);
    expect(prisma.customerSubscription.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "CANCELED", activeKey: null }) }));
  });

  it("resume after a pause moves the next date past the notice window and resets misses", async () => {
    const { prisma, service } = setup();
    prisma.customerSubscription.findFirst.mockResolvedValue({ ...productSubscription, status: "PAUSED", missedCount: 2, nextBillingAt: new Date("2026-01-01T00:00:00Z") });
    await service.act("merchant_1", "store_1", productSubscription.id, "resume");
    const data = prisma.customerSubscription.update.mock.calls[0][0].data;
    expect(data).toMatchObject({ status: "ACTIVE", missedCount: 0, pausedAt: null });
    expect(data.nextBillingAt.getTime()).toBeGreaterThan(Date.now() + 72 * 3_600_000);
  });

  it("rejects a removed cadence", async () => {
    const { service } = setup();
    await expect(service.publicAct(token, { action: "change_cadence", cadence: "WEEKLY" })).rejects.toThrow("Esa frecuencia ya no está disponible.");
  });

  it("changes cadence and locks the new discount's price", async () => {
    const { prisma, service } = setup();
    prisma.productSubscriptionOption.findMany.mockResolvedValue([{ cadence: "WEEKLY", discountPercent: 5 }, { cadence: "MONTHLY", discountPercent: 10 }]);
    await service.publicAct(token, { action: "change_cadence", cadence: "WEEKLY" });
    expect(prisma.customerSubscription.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ cadence: "WEEKLY", discountPercent: 5, unitAmount: 7600 }) }));
  });

  it("returns 404 for a bad token", async () => {
    const { service } = setup();
    await expect(service.publicView("nope")).rejects.toThrow("Suscripción no encontrada");
  });

  it("reprices a product's subscribers from a date seven days out and emails each", async () => {
    const { prisma, email, service } = setup();
    prisma.paymentLink.findFirst.mockResolvedValue({ id: "p1", amount: 9000, variants: [], extras: [], status: "ACTIVE" });
    prisma.customerSubscription.findMany.mockResolvedValue([productSubscription]);
    const result = await service.reprice("merchant_1", "store_1", "p1");
    expect(prisma.customerSubscription.update).toHaveBeenCalledWith({ where: { id: productSubscription.id }, data: { pendingUnitAmount: 8100, pendingFrom: expect.any(Date) } });
    expect(new Date(result.effectiveFrom).getTime()).toBeGreaterThan(Date.now() + 6.9 * 86_400_000);
    expect(result.affected).toBe(1);
    expect(email.send).toHaveBeenCalledTimes(1);
  });

  it("summarises live subscriptions normalised to 30 days", async () => {
    const { prisma, service } = setup();
    prisma.customerSubscription.findMany.mockResolvedValue([
      { ...productSubscription, id: "a", cadence: "WEEKLY", unitAmount: 1000 },
      { ...productSubscription, id: "b", cadence: "MONTHLY", unitAmount: 3000 },
    ]);
    const summary = await service.summary("merchant_1", "store_1");
    expect(summary.active).toBe(2);
    expect(summary.monthlyRecurring).toBe(Math.round(1000 * 30 / 7) + 3000);
    expect(summary.enabled).toBe(true);
  });

  it("turns the switch off and reports who keeps renewing", async () => {
    const { prisma, service } = setup();
    prisma.customerSubscription.count.mockResolvedValue(4);
    await expect(service.setEnabled("merchant_1", "store_1", false)).resolves.toEqual({ enabled: false, activeSubscribers: 4 });
    expect(prisma.store.update).toHaveBeenCalledWith({ where: { id: "store_1" }, data: { subscriptionsEnabled: false } });
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `cd apps/api && npx jest src/operations/subscribers.service.spec.ts`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement**

`dto/subscribers.dto.ts`:

```ts
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from "class-validator";

export class SubscriberActionDto {
  @IsIn(["skip", "pause", "resume", "cancel"]) action!: "skip" | "pause" | "resume" | "cancel";
}
export class PublicSubscriptionActionDto {
  @IsIn(["skip", "pause", "resume", "cancel", "change_cadence"]) action!: "skip" | "pause" | "resume" | "cancel" | "change_cadence";
  @IsOptional() @IsIn(["WEEKLY", "BIWEEKLY", "MONTHLY"]) cadence?: "WEEKLY" | "BIWEEKLY" | "MONTHLY";
}
export class SubscriptionSettingsDto {
  @IsBoolean() enabled!: boolean;
}
export class ListSubscribersQuery {
  @IsOptional() @IsIn(["ACTIVE", "PAUSED", "CANCELED", "PENDING"]) status?: "ACTIVE" | "PAUSED" | "CANCELED" | "PENDING";
  @IsOptional() @IsString() @MaxLength(40) productId?: string;
  @IsOptional() @IsString() @MaxLength(80) q?: string;
  @IsOptional() @IsString() @MaxLength(40) cursor?: string;
}
```

`subscribers.service.ts`:

```ts
import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { CustomerSubscription, PaymentIntentStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { readProductExtras, readProductVariants, selectedExtrasAmount } from "../stores/product-pricing";
import { ownedStore, paymentCheckoutUrl, DAY_MS } from "./operations-helpers";
import { SubscriptionsService } from "./subscriptions.service";
import { readSubscriptionManageToken } from "./subscription-manage-token";
import { advanceBillingDate, cadenceLabel, isCadence, monthlyFactor, REPRICE_NOTICE_DAYS, subscriptionPrices, subscriptionTerms } from "./subscription-pricing";
import type { ListSubscribersQuery, PublicSubscriptionActionDto } from "./dto/subscribers.dto";
// DEVELOPMENT_ORDER_TRACKING_SECRET: import from the same module subscriptions.service.ts uses (Task 7).

type Action = "skip" | "pause" | "resume" | "cancel";

@Injectable()
export class SubscribersService {
  constructor(private readonly prisma: PrismaService, private readonly subscriptions: SubscriptionsService, private readonly config: ConfigService) {}

  private secret() { return this.config.get<string>("app.orderTrackingSecret") ?? DEVELOPMENT_ORDER_TRACKING_SECRET; }

  private async owned(merchantId: string, storeId: string, id: string) {
    await ownedStore(this.prisma, merchantId, storeId);
    const subscription = await this.prisma.customerSubscription.findFirst({ where: { id, merchantId, storeId } });
    if (!subscription) throw new NotFoundException("Suscripción no encontrada");
    return subscription;
  }

  private async fromToken(token: string) {
    const id = readSubscriptionManageToken(token, this.secret());
    const subscription = id ? await this.prisma.customerSubscription.findUnique({ where: { id } }) : null;
    if (!subscription || !subscription.paymentLinkId) throw new NotFoundException("Suscripción no encontrada");
    return subscription;
  }

  private async terms(subscription: CustomerSubscription) {
    const plan = subscription.planId ? await this.prisma.subscriptionPlan.findFirst({ where: { id: subscription.planId, storeId: subscription.storeId } }) : null;
    return subscriptionTerms(subscription, plan);
  }

  /** One state machine for the dashboard and the public page. */
  private async apply(subscription: CustomerSubscription, action: Action): Promise<CustomerSubscription> {
    const terms = await this.terms(subscription);
    if (!terms) throw new BadRequestException("Esta suscripción no se puede modificar");
    if (subscription.status === "CANCELED") throw new BadRequestException("Esta suscripción ya fue cancelada");
    if (action === "cancel") {
      return this.prisma.$transaction(async (tx) => {
        await this.subscriptions.cancelOpenRenewal(tx, subscription.id);
        return tx.customerSubscription.update({ where: { id: subscription.id }, data: { status: "CANCELED", activeKey: null, canceledAt: new Date() } });
      });
    }
    if (action === "pause") {
      if (subscription.status !== "ACTIVE") throw new BadRequestException("Solo puedes pausar una suscripción activa");
      return this.prisma.$transaction(async (tx) => {
        await this.subscriptions.cancelOpenRenewal(tx, subscription.id);
        return tx.customerSubscription.update({ where: { id: subscription.id }, data: { status: "PAUSED", pausedAt: new Date() } });
      });
    }
    if (action === "resume") {
      if (subscription.status !== "PAUSED") throw new BadRequestException("Esta suscripción no está pausada");
      const earliest = new Date(Date.now() + (terms.noticeHours + 1) * 3_600_000);
      let next = subscription.nextBillingAt;
      while (next < earliest) next = advanceBillingDate(next, terms.interval, terms.count);
      return this.prisma.customerSubscription.update({ where: { id: subscription.id }, data: { status: "ACTIVE", pausedAt: null, missedCount: 0, nextBillingAt: next } });
    }
    if (subscription.status !== "ACTIVE") throw new BadRequestException("Solo puedes saltar entregas de una suscripción activa");
    const canceledOpen = await this.prisma.$transaction(tx => this.subscriptions.cancelOpenRenewal(tx, subscription.id));
    if (canceledOpen) return this.prisma.customerSubscription.findUniqueOrThrow({ where: { id: subscription.id } });
    const moved = await this.prisma.customerSubscription.updateMany({
      where: { id: subscription.id, status: "ACTIVE", nextBillingAt: subscription.nextBillingAt },
      data: { nextBillingAt: advanceBillingDate(subscription.nextBillingAt, terms.interval, terms.count) },
    });
    if (!moved.count) throw new ConflictException("Tu renovación ya se generó; puedes pagarla o saltarla");
    return this.prisma.customerSubscription.findUniqueOrThrow({ where: { id: subscription.id } });
  }

  async act(merchantId: string, storeId: string, id: string, action: Action) {
    const updated = await this.apply(await this.owned(merchantId, storeId, id), action);
    return (await this.rows([updated]))[0];
  }

  async setEnabled(merchantId: string, storeId: string, enabled: boolean) {
    await ownedStore(this.prisma, merchantId, storeId);
    await this.prisma.store.update({ where: { id: storeId }, data: { subscriptionsEnabled: enabled } });
    const activeSubscribers = await this.prisma.customerSubscription.count({ where: { storeId, paymentLinkId: { not: null }, status: { in: ["ACTIVE", "PAUSED"] } } });
    return { enabled, activeSubscribers };
  }

  async reprice(merchantId: string, storeId: string, productId: string) {
    const store = await ownedStore(this.prisma, merchantId, storeId);
    const product = await this.prisma.paymentLink.findFirst({ where: { id: productId, storeId } });
    if (!product) throw new NotFoundException("Producto no encontrado");
    const effectiveFrom = new Date(Date.now() + REPRICE_NOTICE_DAYS * DAY_MS);
    const subscribers = await this.prisma.customerSubscription.findMany({ where: { storeId, paymentLinkId: productId, status: { in: ["ACTIVE", "PAUSED"] } } });
    let affected = 0;
    for (const subscription of subscribers) {
      const unit = this.lockedUnit(product, subscription, subscription.discountPercent ?? 0);
      if (unit === subscription.unitAmount) continue;
      await this.prisma.customerSubscription.update({ where: { id: subscription.id }, data: { pendingUnitAmount: unit, pendingFrom: effectiveFrom } });
      affected += 1;
      const money = `${((unit * (subscription.quantity ?? 1)) / 100).toFixed(2)} ${subscription.currency ?? "BOB"}`;
      await this.subscriptions.sendSubscriptionNotice(subscription.customerEmail, `Nuevo precio de tu suscripción · ${store.name}`,
        `Hola ${subscription.customerName}, desde el ${effectiveFrom.toISOString().slice(0, 10)} tu entrega de ${subscription.itemName ?? product.name} costará ${money}. Si no estás de acuerdo, puedes cancelar aquí: ${this.subscriptions.manageUrl(subscription.id)}`);
    }
    return { affected, effectiveFrom: effectiveFrom.toISOString() };
  }

  private lockedUnit(product: { amount: number; variants: Prisma.JsonValue; extras: Prisma.JsonValue }, subscription: CustomerSubscription, discountPercent: number) {
    const variant = readProductVariants(product.variants).find(entry => entry.id === subscription.variantId);
    const extras = readProductExtras(product.extras);
    const picked = subscription.extraIds.flatMap(id => extras.filter(extra => extra.id === id));
    const base = variant?.amount ?? product.amount;
    return subscriptionPrices({ baseAmount: base, oneTimeAmount: base, extrasAmount: selectedExtrasAmount(picked), discountPercent }).lockedUnitAmount;
  }

  async publicView(token: string) {
    return this.view(await this.fromToken(token));
  }

  async publicAct(token: string, dto: PublicSubscriptionActionDto) {
    const subscription = await this.fromToken(token);
    if (dto.action !== "change_cadence") return this.view(await this.apply(subscription, dto.action));
    if (subscription.status === "CANCELED") throw new BadRequestException("Esta suscripción ya fue cancelada");
    const offers = await this.prisma.productSubscriptionOption.findMany({ where: { paymentLinkId: subscription.paymentLinkId! } });
    const offer = offers.find(option => option.cadence === dto.cadence);
    if (!dto.cadence || !offer) throw new BadRequestException("Esa frecuencia ya no está disponible.");
    const product = await this.prisma.paymentLink.findFirst({ where: { id: subscription.paymentLinkId!, status: "ACTIVE" } });
    if (!product) throw new BadRequestException("Este producto ya no está disponible.");
    const updated = await this.prisma.customerSubscription.update({ where: { id: subscription.id }, data: {
      cadence: dto.cadence, discountPercent: offer.discountPercent, unitAmount: this.lockedUnit(product, subscription, offer.discountPercent), pendingUnitAmount: null, pendingFrom: null,
    } });
    return this.view(updated);
  }

  private async view(subscription: CustomerSubscription) {
    const [store, offers, open, history] = await Promise.all([
      this.prisma.store.findUnique({ where: { id: subscription.storeId }, select: { name: true } }),
      this.prisma.productSubscriptionOption.findMany({ where: { paymentLinkId: subscription.paymentLinkId! } }),
      this.prisma.subscriptionInvoice.findFirst({ where: { subscriptionId: subscription.id, status: "DUE" }, orderBy: { periodStart: "desc" } }),
      this.prisma.subscriptionInvoice.findMany({ where: { subscriptionId: subscription.id }, orderBy: { periodStart: "desc" }, take: 5 }),
    ]);
    const intent = open?.paymentIntentId ? await this.prisma.paymentIntent.findUnique({ where: { id: open.paymentIntentId } }) : null;
    const terms = subscriptionTerms(subscription, null);
    const cadence = isCadence(subscription.cadence) ? subscription.cadence : "MONTHLY";
    return {
      storeName: store?.name ?? "",
      itemName: subscription.itemName ?? "",
      cadence, cadenceLabel: cadenceLabel(cadence),
      amount: terms?.amount ?? 0, currency: terms?.currency ?? "BOB",
      nextBillingAt: subscription.nextBillingAt.toISOString(),
      status: subscription.status,
      openPayment: open && intent?.status === PaymentIntentStatus.REQUIRES_PAYMENT_METHOD
        ? { checkoutUrl: paymentCheckoutUrl(this.config, intent.clientSecret), amount: open.amount, dueAt: open.dueAt.toISOString() } : null,
      history: history.map(entry => ({ periodStart: entry.periodStart.toISOString(), status: entry.status, amount: entry.amount })),
      cadenceOptions: offers.filter(offer => isCadence(offer.cadence)).map(offer => ({ cadence: offer.cadence, label: cadenceLabel(offer.cadence as never), discountPercent: offer.discountPercent })),
    };
  }

  async list(merchantId: string, storeId: string, query: ListSubscribersQuery) {
    await ownedStore(this.prisma, merchantId, storeId);
    const now = new Date();
    const where: Prisma.CustomerSubscriptionWhereInput = {
      storeId,
      ...(query.status === "PENDING" ? { status: "ACTIVE", id: { in: (await this.prisma.subscriptionInvoice.findMany({ where: { storeId, status: "DUE", dueAt: { lte: now } }, select: { subscriptionId: true } })).map(row => row.subscriptionId) } }
        : query.status ? { status: query.status } : {}),
      ...(query.productId ? { paymentLinkId: query.productId } : {}),
      ...(query.q ? { OR: [{ customerName: { contains: query.q, mode: "insensitive" } }, { customerEmail: { contains: query.q, mode: "insensitive" } }] } : {}),
    };
    const page = await this.prisma.customerSubscription.findMany({ where, orderBy: [{ nextBillingAt: "asc" }, { id: "asc" }], take: 51, ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}) });
    const items = await this.rows(page.slice(0, 50));
    return { items, nextCursor: page.length > 50 ? page[49].id : null };
  }

  async summary(merchantId: string, storeId: string) {
    const store = await ownedStore(this.prisma, merchantId, storeId);
    const now = new Date();
    const active = await this.prisma.customerSubscription.findMany({ where: { storeId, status: "ACTIVE" } });
    const live = await this.liveIds(active);
    const liveActive = active.filter(subscription => live.has(subscription.id));
    let monthlyRecurring = 0;
    let currency = "BOB";
    for (const subscription of liveActive) {
      const terms = await this.terms(subscription);
      if (!terms) continue;
      currency = terms.currency;
      monthlyRecurring += Math.round(terms.amount * monthlyFactor(terms.interval, terms.count));
    }
    const weekAhead = new Date(now.getTime() + 7 * DAY_MS);
    const since = new Date(now.getTime() - 30 * DAY_MS);
    const [paid, missed] = await Promise.all([
      this.prisma.subscriptionInvoice.count({ where: { storeId, orderId: { not: null }, status: "PAID", dueAt: { gte: since } } }),
      this.prisma.subscriptionInvoice.count({ where: { storeId, orderId: { not: null }, status: "MISSED", dueAt: { gte: since } } }),
    ]);
    return {
      active: liveActive.length, monthlyRecurring, currency,
      renewalsThisWeek: liveActive.filter(subscription => subscription.nextBillingAt >= now && subscription.nextBillingAt <= weekAhead).length,
      renewalPayRate: paid + missed ? paid / (paid + missed) : null,
      enabled: store.subscriptionsEnabled,
    };
  }

  /** Plan subscriptions count as live; product subscriptions are live when their first order was paid in live mode. */
  private async liveIds(subscriptions: CustomerSubscription[]) {
    const orderIds = [...new Set(subscriptions.map(subscription => subscription.sourceOrderId).filter((id): id is string => !!id))];
    const orders = orderIds.length ? await this.prisma.storeOrder.findMany({ where: { id: { in: orderIds } }, select: { id: true, paymentIntent: { select: { livemode: true } } } }) : [];
    const liveOrders = new Set(orders.filter(order => order.paymentIntent.livemode).map(order => order.id));
    return new Set(subscriptions.filter(subscription => !subscription.sourceOrderId || liveOrders.has(subscription.sourceOrderId)).map(subscription => subscription.id));
  }

  private async rows(subscriptions: CustomerSubscription[]) {
    const now = new Date();
    const live = await this.liveIds(subscriptions);
    const planIds = [...new Set(subscriptions.map(subscription => subscription.planId).filter((id): id is string => !!id))];
    const plans = planIds.length ? await this.prisma.subscriptionPlan.findMany({ where: { id: { in: planIds } } }) : [];
    const ids = subscriptions.map(subscription => subscription.id);
    const invoices = ids.length ? await this.prisma.subscriptionInvoice.findMany({ where: { subscriptionId: { in: ids }, status: { in: ["DUE", "PAID"] } }, orderBy: { periodStart: "desc" } }) : [];
    return subscriptions.map(subscription => {
      const plan = plans.find(entry => entry.id === subscription.planId) ?? null;
      const terms = subscriptionTerms(subscription, plan, now);
      const pending = invoices.some(invoice => invoice.subscriptionId === subscription.id && invoice.status === "DUE" && invoice.dueAt <= now);
      const lastPaid = invoices.find(invoice => invoice.subscriptionId === subscription.id && invoice.status === "PAID");
      const cadence = isCadence(subscription.cadence) ? subscription.cadence : null;
      return {
        id: subscription.id, kind: subscription.paymentLinkId ? "product" as const : "plan" as const,
        customerName: subscription.customerName, customerEmail: subscription.customerEmail, customerPhone: subscription.customerPhone,
        itemName: subscription.itemName ?? plan?.name ?? "", productId: subscription.paymentLinkId,
        cadence, cadenceLabel: cadence ? cadenceLabel(cadence) : plan?.interval === "WEEKLY" ? "cada semana" : plan?.interval === "YEARLY" ? "cada año" : "cada mes",
        amount: terms?.amount ?? 0, currency: terms?.currency ?? "BOB",
        nextBillingAt: subscription.nextBillingAt.toISOString(), status: subscription.status,
        displayStatus: (subscription.status === "ACTIVE" && pending ? "PENDING_PAYMENT" : subscription.status) as "ACTIVE" | "PAUSED" | "CANCELED" | "PENDING_PAYMENT",
        lastPaidAt: lastPaid?.paidAt?.toISOString() ?? null,
        livemode: live.has(subscription.id),
      };
    });
  }

  async resend(merchantId: string, storeId: string, id: string) {
    const subscription = await this.owned(merchantId, storeId, id);
    const open = await this.prisma.subscriptionInvoice.findFirst({ where: { subscriptionId: subscription.id, status: "DUE" }, orderBy: { periodStart: "desc" } });
    if (!open) throw new NotFoundException("No hay una entrega pendiente de pago");
    const result = await this.subscriptions.remindSubscriptionInvoice(merchantId, storeId, open.id, false);
    const item = subscription.itemName ?? "tu suscripción";
    return { checkoutUrl: result.checkoutUrl, sent: result.sent, whatsappText: `Hola ${subscription.customerName}, tu pedido de ${item} está listo. Págalo con un toque: ${result.checkoutUrl}` };
  }
}
```

`subscribers.controller.ts`:

```ts
import { Body, Controller, Get, Param, Patch, Post, Put, Query, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { MerchantAuthGuard } from "../dashboard/guards/merchant-auth.guard";
import { ListSubscribersQuery, SubscriberActionDto, SubscriptionSettingsDto } from "./dto/subscribers.dto";
import { SubscribersService } from "./subscribers.service";

type MerchantRequest = { merchant: { id: string } };

@ApiTags("subscriptions")
@ApiBearerAuth()
@UseGuards(MerchantAuthGuard)
@Controller("v1/stores/:storeId/subscriptions")
export class SubscribersController {
  constructor(private readonly subscribers: SubscribersService) {}
  @Get() list(@Req() req: MerchantRequest, @Param("storeId") storeId: string, @Query() query: ListSubscribersQuery) { return this.subscribers.list(req.merchant.id, storeId, query); }
  @Get("summary") summary(@Req() req: MerchantRequest, @Param("storeId") storeId: string) { return this.subscribers.summary(req.merchant.id, storeId); }
  @Put("settings") settings(@Req() req: MerchantRequest, @Param("storeId") storeId: string, @Body() dto: SubscriptionSettingsDto) { return this.subscribers.setEnabled(req.merchant.id, storeId, dto.enabled); }
  @Post("products/:productId/reprice") reprice(@Req() req: MerchantRequest, @Param("storeId") storeId: string, @Param("productId") productId: string) { return this.subscribers.reprice(req.merchant.id, storeId, productId); }
  @Patch(":id") act(@Req() req: MerchantRequest, @Param("storeId") storeId: string, @Param("id") id: string, @Body() dto: SubscriberActionDto) { return this.subscribers.act(req.merchant.id, storeId, id, dto.action); }
  @Post(":id/resend") resend(@Req() req: MerchantRequest, @Param("storeId") storeId: string, @Param("id") id: string) { return this.subscribers.resend(req.merchant.id, storeId, id); }
}
```

`subscription-manage.controller.ts`:

```ts
import { Body, Controller, Get, Header, Param, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { PublicSubscriptionActionDto } from "./dto/subscribers.dto";
import { SubscribersService } from "./subscribers.service";

@ApiTags("subscriptions")
@Controller("v1/subscriptions/public/:token")
export class SubscriptionManageController {
  constructor(private readonly subscribers: SubscribersService) {}
  @Get() @Throttle({ default: { limit: 30, ttl: 60_000 } }) @Header("Cache-Control", "no-store")
  view(@Param("token") token: string) { return this.subscribers.publicView(token); }
  @Post("actions") @Throttle({ default: { limit: 30, ttl: 60_000 } }) @Header("Cache-Control", "no-store")
  act(@Param("token") token: string, @Body() dto: PublicSubscriptionActionDto) { return this.subscribers.publicAct(token, dto); }
}
```

`operations.module.ts`: add `SubscribersController, SubscriptionManageController` to `controllers` and `SubscribersService` to `providers`.

- [ ] **Step 4: Run to see them pass**

Run: `cd apps/api && npx jest src/operations && npx tsc --noEmit -p tsconfig.json`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/operations
git commit -m "feat(subscriptions): merchant list, summary, actions, resend, reprice and switch; public manage view and actions"
```

---

### Task 9: Dashboard — the Suscripciones page with its settings tab

**Files:**
- Create: `apps/merchant-dashboard/src/subscriptions.mjs` (pure helpers)
- Create: `apps/merchant-dashboard/src/subscriptions.test.mjs`
- Create: `apps/merchant-dashboard/src/subscriptions-panel.mjs` (`mountSubscriptionsPanel(deps)`, both tabs)
- Create: `apps/merchant-dashboard/src/subscriptions.css`
- Modify: `apps/merchant-dashboard/index.html` (stylesheet link near line 14; nav button after the Pedidos entries; section next to `cobrosSection` ~line 447)
- Modify: `apps/merchant-dashboard/src/dashboard.js` (import + mount next to `mountCobrosPanel` ~line 350; titles map ~line 621; show hook ~line 785; reset ~line 1644)
- Modify: `apps/merchant-dashboard/server.mjs:151` (whitelist)

**Interfaces:**
- Consumes: Task 8 endpoints; existing `GET|PATCH|DELETE v1/stores/:storeId/payment_links/:id/subscriptions` (`PATCH` body `{ options: [{ cadence, discountPercent }] }`, `DELETE` body `{ cadences: [...] }`); the dashboard's loaded catalog.
- Produces: `mountSubscriptionsPanel({ api, storeId, store, signedIn, products }) → { show(), reset() }` where `products()` returns the loaded catalog rows (`{ id, name, fulfillmentType }`).

- [ ] **Step 1: Write the failing tests** (`subscriptions.test.mjs`)

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { CADENCE_LABEL, STATUS_LABEL, formatMoney, offersPayload, summaryFigures, subscriberWhatsAppUrl, validateOffers } from "./subscriptions.mjs";

test("labels", () => {
  assert.equal(CADENCE_LABEL.BIWEEKLY, "Quincenal");
  assert.equal(STATUS_LABEL.PENDING_PAYMENT, "Pago pendiente");
});

test("money in bolivianos", () => {
  assert.equal(formatMoney(15900, "BOB"), "Bs 159,00");
});

test("summary figures show a dash when there is no pay rate yet", () => {
  const figures = summaryFigures({ active: 3, monthlyRecurring: 45000, currency: "BOB", renewalsThisWeek: 1, renewalPayRate: null, enabled: true });
  assert.deepEqual(figures.map(f => f.value), ["3", "Bs 450,00", "1", "—"]);
  assert.equal(summaryFigures({ active: 0, monthlyRecurring: 0, currency: "BOB", renewalsThisWeek: 0, renewalPayRate: 0.75, enabled: true })[3].value, "75%");
});

test("WhatsApp link needs a usable phone and carries the message", () => {
  assert.equal(subscriberWhatsAppUrl("", "hola"), null);
  assert.equal(subscriberWhatsAppUrl("7000 0000", "hola que tal"), "https://wa.me/59170000000?text=hola%20que%20tal");
});

test("offer form: at least one cadence, integer discount 0–99", () => {
  assert.equal(validateOffers([]), "Elige al menos una frecuencia.");
  assert.equal(validateOffers([{ cadence: "MONTHLY", discountPercent: 100 }]), "El descuento debe ser un número entero entre 0 y 99.");
  assert.equal(validateOffers([{ cadence: "MONTHLY", discountPercent: 10 }]), null);
});

test("offer form turns into an upsert and a removal", () => {
  assert.deepEqual(
    offersPayload([{ cadence: "WEEKLY", checked: true, discountPercent: 5 }, { cadence: "BIWEEKLY", checked: false, discountPercent: 0 }, { cadence: "MONTHLY", checked: false, discountPercent: 10 }], ["MONTHLY"]),
    { upsert: [{ cadence: "WEEKLY", discountPercent: 5 }], remove: ["MONTHLY"] },
  );
});
```

- [ ] **Step 2: Run to see it fail**

Run: `cd apps/merchant-dashboard && node --test src/subscriptions.test.mjs`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement `subscriptions.mjs`**

```js
/** Pure helpers for the Suscripciones page (spec 2026-09-28 §4). */
export const CADENCES = ["WEEKLY", "BIWEEKLY", "MONTHLY"];
export const CADENCE_LABEL = { WEEKLY: "Semanal", BIWEEKLY: "Quincenal", MONTHLY: "Mensual" };
export const STATUS_LABEL = { ACTIVE: "Activa", PAUSED: "Pausada", CANCELED: "Cancelada", PENDING_PAYMENT: "Pago pendiente" };
export const STATUS_TONE = { ACTIVE: "ok", PAUSED: "muted", CANCELED: "muted", PENDING_PAYMENT: "warn" };

export function formatMoney(minor, currency) {
  const value = (minor / 100).toLocaleString("es-BO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${currency === "BOB" ? "Bs" : currency} ${value}`;
}

export function summaryFigures(summary) {
  return [
    { label: "Suscriptores activos", value: String(summary.active) },
    { label: "Ingreso mensual recurrente", value: formatMoney(summary.monthlyRecurring, summary.currency) },
    { label: "Renovaciones esta semana", value: String(summary.renewalsThisWeek) },
    { label: "Tasa de pago de renovaciones", value: summary.renewalPayRate === null ? "—" : `${Math.round(summary.renewalPayRate * 100)}%` },
  ];
}

export function subscriberWhatsAppUrl(phone, text) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.length < 8) return null;
  return `https://wa.me/${digits.length === 8 ? `591${digits}` : digits}?text=${encodeURIComponent(text)}`;
}

export function validateOffers(offers) {
  if (!offers.length) return "Elige al menos una frecuencia.";
  if (offers.some(offer => !Number.isInteger(offer.discountPercent) || offer.discountPercent < 0 || offer.discountPercent > 99)) return "El descuento debe ser un número entero entre 0 y 99.";
  return null;
}

/** Form rows ({ cadence, checked, discountPercent }) and the cadences saved today → what to PATCH and what to DELETE. */
export function offersPayload(rows, savedCadences) {
  return {
    upsert: rows.filter(row => row.checked).map(row => ({ cadence: row.cadence, discountPercent: row.discountPercent })),
    remove: rows.filter(row => !row.checked && savedCadences.includes(row.cadence)).map(row => row.cadence),
  };
}
```

If `es-BO` locale formatting on the test machine doesn't yield `159,00`, match whatever `cobros.mjs formatMoney` produces and reuse it (import from `./cobros.mjs`) instead — the test asserts the dashboard's existing money format.

- [ ] **Step 4: Run to see it pass**

Run: `cd apps/merchant-dashboard && node --test src/subscriptions.test.mjs`
Expected: PASS (6 tests).

- [ ] **Step 5: Build `subscriptions-panel.mjs`**

Follow `cobros-panel.mjs` conventions: a doc comment listing `deps`, everything interpolated through `esc()` from `./html.mjs`, errors shown in a `role="status"` line, no `window.confirm` (use an inline confirm row with "Sí, …" / "No" buttons). Structure:

```js
import { escapeHtml as esc } from "./html.mjs";
import { CADENCES, CADENCE_LABEL, STATUS_LABEL, STATUS_TONE, formatMoney, offersPayload, subscriberWhatsAppUrl, summaryFigures, validateOffers } from "./subscriptions.mjs";

/**
 * Suscripciones: subscribers (key figures, filters, table, row actions) and a Configuración tab
 * (store switch + per-product frequencies and discounts). Spec 2026-09-28 §4.
 *
 * deps:
 *   api(path, options)  authenticated dashboard API call (throws Error with .status and .message)
 *   storeId()           active store id
 *   signedIn()          whether a merchant session exists
 *   products()          loaded catalog rows [{ id, name, fulfillmentType }]
 */
export function mountSubscriptionsPanel(deps) {
  const root = document.getElementById("subscriptionsRoot");
  let state = { tab: "subscribers", summary: null, items: [], nextCursor: null, filters: { status: "", productId: "", q: "" }, offers: new Map(), editing: null, confirming: null, message: "" };
  const base = () => `/stores/${encodeURIComponent(deps.storeId())}/subscriptions`;

  async function loadSubscribers(append = false) {
    const params = new URLSearchParams(Object.entries({ ...state.filters, ...(append && state.nextCursor ? { cursor: state.nextCursor } : {}) }).filter(([, v]) => v));
    const [summary, page] = await Promise.all([append ? state.summary : deps.api(`${base()}/summary`), deps.api(`${base()}?${params}`)]);
    state = { ...state, summary, items: append ? [...state.items, ...page.items] : page.items, nextCursor: page.nextCursor };
    render();
  }

  async function loadOffers() {
    const rows = deps.products().filter(product => product.fulfillmentType !== "DIGITAL");
    const results = await Promise.all(rows.map(product => deps.api(`/stores/${encodeURIComponent(deps.storeId())}/payment_links/${encodeURIComponent(product.id)}/subscriptions`).catch(() => [])));
    state.offers = new Map(rows.map((product, index) => [product.id, results[index]]));
    render();
  }

  function render() { root.innerHTML = state.tab === "settings" ? settingsHtml() : subscribersHtml(); }
  // subscribersHtml(): header (title, subtitle "Clientes que reciben tus productos cada semana, quincena o mes.",
  //   tabs "Suscriptores" / "Configuración"); if (!summary.enabled && !items.length) the empty state card
  //   "Aún no ofreces suscripciones" + button data-go-settings "Activar en Configuración"; else four
  //   figure cards from summaryFigures(summary); filters (status select: Todas/Activa/Pausada/Pago pendiente/
  //   Cancelada; product select from deps.products(); search input); when a product is selected, a quiet
  //   button data-reprice "Aplicar precio actual"; the table (Cliente with email under it, Producto,
  //   Frecuencia, Próxima renovación toLocaleDateString("es-BO"), Último pago, Estado pill class
  //   `pill pill--${STATUS_TONE[row.displayStatus]}` + "Prueba" pill when !row.livemode, and row actions
  //   buttons data-act="skip|pause|resume|cancel" data-id, data-resend, data-whatsapp); "Cargar más" when
  //   nextCursor; the status line.
  // settingsHtml(): switch input[data-switch] checked=summary.enabled with the help text
  //   "Tus clientes reciben un enlace de pago antes de cada entrega. No se cobra automáticamente.";
  //   product table (Producto, Frecuencias as chips `${CADENCE_LABEL[c]} −${d}%`, button data-edit);
  //   digital products listed disabled with "No disponible para productos digitales"; when editing, an
  //   inline form with one row per CADENCES entry (checkbox + number input 0–99) and "Guardar"/"Cancelar".

  root.addEventListener("click", async (event) => {
    const target = event.target.closest("button");
    if (!target) return;
    try {
      if (target.dataset.tab) { state.tab = target.dataset.tab; if (state.tab === "settings") await loadOffers(); else render(); return; }
      if (target.hasAttribute("data-go-settings")) { state.tab = "settings"; await loadOffers(); return; }
      if (target.dataset.act) {
        const { act, id } = target.dataset;
        if (act === "cancel" && state.confirming !== id) { state.confirming = id; render(); return; }
        state.confirming = null;
        await deps.api(`${base()}/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ action: act }) });
        state.message = "Listo."; await loadSubscribers(); return;
      }
      if (target.dataset.resend || target.dataset.whatsapp) {
        const id = target.dataset.resend || target.dataset.whatsapp;
        const result = await deps.api(`${base()}/${encodeURIComponent(id)}/resend`, { method: "POST" });
        if (target.dataset.whatsapp) {
          const row = state.items.find(item => item.id === id);
          const url = subscriberWhatsAppUrl(row?.customerPhone, result.whatsappText);
          if (url) window.open(url, "_blank", "noopener"); else state.message = "Este cliente no tiene un teléfono válido.";
        } else state.message = result.sent ? "Enviamos el enlace por correo." : "No pudimos enviar el correo; copia el enlace desde WhatsApp.";
        render(); return;
      }
      if (target.hasAttribute("data-reprice")) {
        if (state.confirming !== "reprice") { state.confirming = "reprice"; render(); return; }
        state.confirming = null;
        const result = await deps.api(`${base()}/products/${encodeURIComponent(state.filters.productId)}/reprice`, { method: "POST" });
        state.message = `Avisamos a ${result.affected} suscriptores. El nuevo precio aplica desde el ${new Date(result.effectiveFrom).toLocaleDateString("es-BO")}.`;
        render(); return;
      }
      if (target.hasAttribute("data-more")) { await loadSubscribers(true); return; }
      if (target.dataset.edit) { state.editing = target.dataset.edit; render(); return; }
      if (target.hasAttribute("data-save-offers")) {
        const productId = state.editing;
        const rows = CADENCES.map(cadence => ({ cadence, checked: root.querySelector(`[name="offer-${cadence}"]`).checked, discountPercent: Number(root.querySelector(`[name="discount-${cadence}"]`).value) }));
        const saved = (state.offers.get(productId) || []).map(offer => offer.cadence);
        const { upsert, remove } = offersPayload(rows, saved);
        const problem = upsert.length || remove.length ? (upsert.length ? validateOffers(upsert) : null) : validateOffers(upsert);
        if (problem) { state.message = problem; render(); return; }
        const path = `/stores/${encodeURIComponent(deps.storeId())}/payment_links/${encodeURIComponent(productId)}/subscriptions`;
        if (upsert.length) await deps.api(path, { method: "PATCH", body: JSON.stringify({ options: upsert }) });
        if (remove.length) await deps.api(path, { method: "DELETE", body: JSON.stringify({ cadences: remove }) });
        state.editing = null; state.message = "Guardamos las frecuencias."; await loadOffers(); return;
      }
    } catch (error) { state.message = error.message || "No pudimos completar la acción."; render(); }
  });

  root.addEventListener("change", async (event) => {
    const input = event.target;
    try {
      if (input.matches("[data-switch]")) {
        const enabled = input.checked;
        if (!enabled && state.summary?.active && state.confirming !== "switch") { state.confirming = "switch"; input.checked = true; render(); return; }
        state.confirming = null;
        const result = await deps.api(`${base()}/settings`, { method: "PUT", body: JSON.stringify({ enabled }) });
        state.summary = { ...state.summary, enabled: result.enabled };
        state.message = enabled ? "Tu tienda ya ofrece suscripciones." : result.activeSubscribers ? `${result.activeSubscribers} suscriptores seguirán recibiendo sus renovaciones. Puedes cancelarlas desde Suscripciones.` : "Desactivamos las suscripciones.";
        render(); return;
      }
      if (input.name === "status" || input.name === "productId") { state.filters[input.name] = input.value; await loadSubscribers(); }
    } catch (error) { state.message = error.message || "No pudimos guardar el cambio."; render(); }
  });

  let searchTimer;
  root.addEventListener("input", (event) => {
    if (event.target.name !== "q") return;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { state.filters.q = event.target.value.trim(); void loadSubscribers(); }, 300);
  });

  return {
    show() { if (deps.signedIn()) void loadSubscribers().catch(error => { state.message = error.message; render(); }); },
    reset() { state = { ...state, summary: null, items: [], nextCursor: null, offers: new Map(), editing: null, confirming: null, message: "" }; root.innerHTML = ""; },
  };
}
```

Write `subscribersHtml()` and `settingsHtml()` as described in the comment above, using the calm-workspace classes already in `calm.css` (`calm-card`, `calm-table`, `pill`, primary/quiet buttons — copy the class names `cobros-panel.mjs` uses for the same elements). The inline confirm rows read: cancel → "¿Cancelar la suscripción de {name}? No se cobrará nada más." [Sí, cancelar] [No]; reprice → "Los suscriptores de {product} pagarán el precio actual desde dentro de 7 días. Les avisaremos por correo." [Sí, aplicar] [No]; switch off → "{n} suscriptores seguirán recibiendo sus renovaciones. Puedes cancelarlas desde Suscripciones." [Sí, desactivar] [No] (the "Sí" button re-sends `PUT settings { enabled: false }`). `subscriptions.css` holds only layout the calm classes don't cover (filter row wrap at < 640 px, table horizontal scroll inside its card, the offer form grid).

- [ ] **Step 6: Wire it up**

`index.html`:
- `<link rel="stylesheet" href="/src/subscriptions.css">` next to `cobros.css`.
- Nav button after the Pedidos entries:
  `<a class="dashboard-nav-button" href="#dashboard-subscriptions" data-dashboard-view="subscriptions"><span class="dashboard-nav-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 2l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg></span>Suscripciones</a>`
- Section: `<section class="subscriptions-view" id="subscriptionsSection" data-dashboard-page="subscriptions" aria-label="Suscripciones" hidden><div id="subscriptionsRoot"></div></section>`

`dashboard.js`:
- `import { mountSubscriptionsPanel } from "/src/subscriptions-panel.mjs";`
- next to `const cobros = mountCobrosPanel({ … })`: `const subscriptionsPanel = mountSubscriptionsPanel({ api, storeId, signedIn, products: () => <the catalog array dashboard.js already keeps for Productos> });` — pass the same `api`/`storeId`/`signedIn` functions cobros receives.
- titles map: `subscriptions: ["Suscripciones", "Clientes que compran tus productos de forma recurrente."],`
- `setDashboardView`: `if (nextView === "subscriptions") subscriptionsPanel.show();`
- store switch reset (next to `cobros.reset();`): `subscriptionsPanel.reset();`

`server.mjs:151`: append `"/src/subscriptions.mjs", "/src/subscriptions-panel.mjs", "/src/subscriptions.css"` to the whitelist array.

- [ ] **Step 7: Run the dashboard unit tests**

Run: `cd apps/merchant-dashboard && npm run test:unit`
Expected: PASS (all existing + new).

- [ ] **Step 8: Commit**

```bash
git add apps/merchant-dashboard/src/subscriptions.mjs apps/merchant-dashboard/src/subscriptions.test.mjs apps/merchant-dashboard/src/subscriptions-panel.mjs apps/merchant-dashboard/src/subscriptions.css apps/merchant-dashboard/index.html apps/merchant-dashboard/src/dashboard.js apps/merchant-dashboard/server.mjs
git commit -m "feat(dashboard): Suscripciones — subscribers with key figures and quiet row actions, and a settings tab to offer frequencies and discounts per product"
```

---

### Task 10: Checkout-app storefront — the choice, the cart and consent

**Files:**
- Modify: `apps/checkout/src/api.ts` (`StoreItem.subscriptionOptions?`, `Store.subscriptionsEnabled?`, `quoteCart`/`checkoutCart` item type + `subscriptionConsent`)
- Modify: `apps/checkout/src/cart-state.ts` (`cartItemKey` / `parseCartItemKey` / `restoreCart`)
- Create: `apps/checkout/src/cart/subscription-choice.ts`
- Create: `apps/checkout/src/cart/subscription-choice.test.ts`
- Modify: `apps/checkout/src/cart/cart.ts` (`cartTotal`)
- Modify: `apps/checkout/src/storefront/product-page.ts` (~line 237 and the add handler)
- Modify: `apps/checkout/src/cart/cart-review.ts`, `apps/checkout/src/cart/cart-review-dialog.ts` (~lines 126, 305)

**Interfaces:**
- Produces: `cartItemKey(paymentLinkId, variantId?, extraIds?, cadence?)`; `parseCartItemKey(key) → { paymentLinkId; variantId?; extraIds; cadence? }` (separator `@@`); `type CartCadence`; `subscriptionUnitAmount(item, variant, extras, cadence): number`; `subscriptionChoiceHtml(item, selected: CartCadence | null): string`; `subscriptionConsentText(cadence)`; `cadenceLabel(cadence)`.

- [ ] **Step 1: Write the failing tests** (`subscription-choice.test.ts`)

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { cartItemKey, parseCartItemKey } from "../cart-state";
import { cart, cartTotal } from "./cart";
import { subscriptionChoiceHtml, subscriptionConsentText, subscriptionUnitAmount } from "./subscription-choice";

const item = { id: "p1", name: "Café", amount: 8000, currency: "BOB", discountPercent: null, discountStartsAt: null, discountEndsAt: null, variants: [], extras: [],
  subscriptionOptions: [{ cadence: "WEEKLY", discountPercent: 5 }, { cadence: "MONTHLY", discountPercent: 10 }] } as never;

describe("subscription cart keys", () => {
  it("keeps one-time and subscription lines apart", () => {
    expect(cartItemKey("p1")).not.toBe(cartItemKey("p1", undefined, [], "MONTHLY"));
    expect(parseCartItemKey(cartItemKey("p1", undefined, [], "MONTHLY"))).toEqual({ paymentLinkId: "p1", extraIds: [], cadence: "MONTHLY" });
    expect(parseCartItemKey(cartItemKey("p1", "v1", ["b", "a"], "WEEKLY"))).toEqual({ paymentLinkId: "p1", variantId: "v1", extraIds: ["a", "b"], cadence: "WEEKLY" });
  });
  it("still reads keys saved before this change", () => {
    expect(parseCartItemKey("p1::v1~~a,b")).toEqual({ paymentLinkId: "p1", variantId: "v1", extraIds: ["a", "b"] });
  });
});

describe("subscription prices", () => {
  it("match the server rule", () => {
    expect(subscriptionUnitAmount(item, undefined, [], "MONTHLY")).toBe(7200);
    expect(subscriptionUnitAmount({ ...(item as object), discountPercent: 30, discountStartsAt: null, discountEndsAt: null } as never, undefined, [], "MONTHLY")).toBe(5600);
  });
  beforeEach(() => cart.clear());
  it("totals a mixed cart", () => {
    cart.set(cartItemKey("p1"), 1);
    cart.set(cartItemKey("p1", undefined, [], "MONTHLY"), 1);
    expect(cartTotal([item])).toBe(8000 + 7200);
  });
});

describe("subscriptionChoiceHtml", () => {
  it("shows both choices, the best saving, a frequency select and the no-automatic-charge note", () => {
    const html = subscriptionChoiceHtml(item, null);
    expect(html).toContain("Compra única");
    expect(html).toContain("Suscríbete y ahorra hasta 10%");
    expect(html).toContain('name="subscriptionCadence"');
    expect(html).toContain("No se cobra automáticamente");
  });
  it("renders nothing without offers", () => {
    expect(subscriptionChoiceHtml({ ...(item as object), subscriptionOptions: [] } as never, null)).toBe("");
  });
  it("uses the same consent text as the API", () => {
    expect(subscriptionConsentText("MONTHLY")).toBe("Acepto que este pedido se repita cada mes. Antes de cada entrega recibiré un enlace para pagar; no se cobra nada automáticamente. Puedo saltar, pausar o cancelar cuando quiera.");
  });
});
```

(`activeProductDiscount` in `cart.ts` treats a `discountPercent` with null start/end as active; if it requires dates, set `discountStartsAt` to the past and `discountEndsAt` to the future in the second price assertion.)

- [ ] **Step 2: Run to see it fail**

Run: `cd apps/checkout && npx vitest run src/cart/subscription-choice.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`api.ts`: in `StoreItem` add `subscriptionOptions?: Array<{ cadence: "WEEKLY" | "BIWEEKLY" | "MONTHLY"; discountPercent: number }>;`; in `Store` add `subscriptionsEnabled?: boolean;`; extend the `items` element type of `quoteCart` and `checkoutCart` with `subscriptionCadence?: "WEEKLY" | "BIWEEKLY" | "MONTHLY"`; give `checkoutCart` a trailing optional `subscriptionConsent?: boolean` parameter and send `...(subscriptionConsent ? { subscriptionConsent: true } : {})` in its body.

`cart-state.ts`:

```ts
const CART_CADENCE_SEPARATOR = "@@";
export type CartCadence = "WEEKLY" | "BIWEEKLY" | "MONTHLY";
const isCartCadence = (value: unknown): value is CartCadence => value === "WEEKLY" || value === "BIWEEKLY" || value === "MONTHLY";

export function cartItemKey(paymentLinkId: string, variantId?: string, extraIds: string[] = [], cadence?: CartCadence): string {
  const base = variantId ? `${paymentLinkId}${CART_VARIANT_SEPARATOR}${variantId}` : paymentLinkId;
  const normalizedExtras = [...extraIds].sort();
  const withExtras = normalizedExtras.length ? `${base}${CART_EXTRAS_SEPARATOR}${normalizedExtras.join(",")}` : base;
  return cadence ? `${withExtras}${CART_CADENCE_SEPARATOR}${cadence}` : withExtras;
}

export function parseCartItemKey(key: string): { paymentLinkId: string; variantId?: string; extraIds: string[]; cadence?: CartCadence } {
  const [withExtras, cadence] = key.split(CART_CADENCE_SEPARATOR, 2);
  const [base, encodedExtras = ""] = withExtras.split(CART_EXTRAS_SEPARATOR, 2);
  const [paymentLinkId, variantId] = base.split(CART_VARIANT_SEPARATOR, 2);
  const extraIds = encodedExtras.split(",").filter(Boolean);
  return { paymentLinkId, ...(variantId ? { variantId } : {}), extraIds, ...(isCartCadence(cadence) ? { cadence } : {}) };
}
```

In `restoreCart`, after a saved key is parsed and its product found, skip it when `parsed.cadence && !(store.subscriptionsEnabled && item.subscriptionOptions?.some(option => option.cadence === parsed.cadence))`.

`cart/subscription-choice.ts`:

```ts
import type { StoreItem } from "../api";
import type { CartCadence } from "../cart-state";
import { discountedProductAmount, selectedExtrasAmount } from "./cart";
import { escapeHtml, formatAmount } from "../ui/html";

const LABEL: Record<CartCadence, string> = { WEEKLY: "cada semana", BIWEEKLY: "cada dos semanas", MONTHLY: "cada mes" };
export const cadenceLabel = (cadence: CartCadence) => LABEL[cadence];

export function subscriptionConsentText(cadence: CartCadence): string {
  return `Acepto que este pedido se repita ${LABEL[cadence]}. Antes de cada entrega recibiré un enlace para pagar; no se cobra nada automáticamente. Puedo saltar, pausar o cancelar cuando quiera.`;
}

/** Same rule as the API (subscriptionPrices): min(one-time, base − discount) + extras at full price. */
export function subscriptionUnitAmount(item: StoreItem, variant: StoreItem["variants"][number] | undefined, extras: StoreItem["extras"], cadence: CartCadence): number {
  const offer = item.subscriptionOptions?.find(option => option.cadence === cadence);
  const base = variant?.amount ?? item.amount;
  const oneTime = discountedProductAmount(item, base);
  const unit = offer ? Math.min(oneTime, Math.round(base * (100 - offer.discountPercent) / 100)) : oneTime;
  return unit + selectedExtrasAmount(extras);
}

export function subscriptionChoiceHtml(item: StoreItem, selected: CartCadence | null, variant?: StoreItem["variants"][number], extras: StoreItem["extras"] = []): string {
  const offers = item.subscriptionOptions ?? [];
  if (!offers.length) return "";
  const best = Math.max(...offers.map(offer => offer.discountPercent));
  const current = offers.find(offer => offer.cadence === selected) ?? offers[offers.length - 1];
  const oneTime = discountedProductAmount(item, variant?.amount ?? item.amount) + selectedExtrasAmount(extras);
  const subscribed = subscriptionUnitAmount(item, variant, extras, current.cadence);
  return `<fieldset class="subscription-choice">
    <legend class="sr-only">Cómo quieres comprarlo</legend>
    <label><input type="radio" name="purchaseMode" value="once" ${selected ? "" : "checked"}> <span>Compra única</span> <strong>${formatAmount(oneTime, item.currency)}</strong></label>
    <label><input type="radio" name="purchaseMode" value="subscribe" ${selected ? "checked" : ""}> <span>${best > 0 ? `Suscríbete y ahorra hasta ${best}%` : "Suscríbete"}</span> <strong>${formatAmount(subscribed, item.currency)} / ${escapeHtml(LABEL[current.cadence])}</strong></label>
    ${offers.length > 1 ? `<select name="subscriptionCadence" aria-label="Frecuencia" ${selected ? "" : "disabled"}>${offers.map(offer => `<option value="${offer.cadence}" ${offer.cadence === current.cadence ? "selected" : ""}>${escapeHtml(LABEL[offer.cadence])}${offer.discountPercent ? ` · −${offer.discountPercent}%` : ""}</option>`).join("")}</select>` : `<input type="hidden" name="subscriptionCadence" value="${current.cadence}">`}
    <p class="subscription-choice__note">Te enviamos un enlace para pagar antes de cada entrega. No se cobra automáticamente. Cancela cuando quieras.</p>
  </fieldset>`;
}
```

(Use the real export names of `../ui/html` — `formatAmount` is already imported by `cart.ts` from there; if the escape helper is named differently, import that name. `discountedProductAmount` and `selectedExtrasAmount` are exported by `cart.ts`.)

`cart.ts` `cartTotal`: `const { paymentLinkId, variantId, extraIds, cadence } = parseCartItemKey(key);` and `total += (cadence ? subscriptionUnitAmount(item, variant, extras, cadence) : selectedUnitAmount(item, variant, extras)) * quantity;` (import `subscriptionUnitAmount` from `./subscription-choice`; the two modules import each other's functions only at call time, which ES modules allow).

`product-page.ts`:
- Keep `let selectedCadence: CartCadence | null = null;` in `renderProductPage`'s closure.
- Before the add-button markup (~line 237), when `store.subscriptionsEnabled`: `${subscriptionChoiceHtml(item, selectedCadence, selectedVariantFor(item), selectedExtrasFor(item))}` wrapped in `<div data-subscription-slot>`.
- On `change` of `[name=purchaseMode]` / `[name=subscriptionCadence]` inside the page: `selectedCadence = mode === "subscribe" ? (select.value as CartCadence) : null;` then re-render just `[data-subscription-slot]` (and the add button's price if the page shows one).
- Where the add handler builds the key with `cartItemKey(item.id, variant?.id, extraIds)`, pass `selectedCadence ?? undefined` as the 4th argument.

`cart-review.ts`: `cartLineEntries` reads `cadence` from `parseCartItemKey(key)`; the unit price uses `subscriptionUnitAmount` when `cadence`; add `cadence` to the entry and a sub-label `${capitalise(cadenceLabel(cadence))} · puedes cancelar cuando quieras`.

`cart-review-dialog.ts`:
- Both item mappings (~line 126 and the one passed to `checkoutCart` ~305) add `...(line.cadence ? { subscriptionCadence: line.cadence } : {})`.
- When any line has a cadence, render above the pay button: `<label class="subscription-consent"><input type="checkbox" name="subscriptionConsent"> <span>${escapeHtml(subscriptionConsentText(firstCadence))}</span></label>`; the pay button stays disabled until it is ticked; pass `true` as `subscriptionConsent` to `checkoutCart`.
- Before redirecting to payment, `try { sessionStorage.setItem("pagosya_subscription_checkout", "1") } catch {}` when the cart has a subscription line; in the payment page's email input setup (search `customerEmail` in `apps/checkout/src/checkout/`), when that flag is `"1"` mark the input `required` and show the hint "Te enviaremos aquí los enlaces de tus próximas entregas."; clear the flag on the payment-success render.

- [ ] **Step 4: Run tests and types**

Run: `cd apps/checkout && npx vitest run && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add apps/checkout/src
git commit -m "feat(checkout): product pages offer Compra única or Suscríbete y ahorra; the cart keeps them apart and asks for consent"
```

---

### Task 11: Kit storefront (`commerce.js`) — the same choice for kit and YAPI stores

**Files:**
- Modify: `packages/storefront-kit/kit/commerce.js` (`lineKey` ~line 266, `cartLine` ~282, `cartItems` ~321, `restoreCart` ~335, variant buy key ~1043, product detail markup ~1083, click handler ~3316, `checkout()` ~3202–3233, the cart panel markup around the `data-pay` button)
- Modify: `apps/checkout/src/source-storefront.ts` (`validatedCart` ~line 19, `StoredCartItem`)
- Test: `apps/checkout/src/source-storefront.test.ts` (create if missing); `packages/storefront-kit` `npm test`

**Interfaces:**
- Consumes: public store JSON from Task 4 (`store.subscriptionsEnabled`, `item.subscriptionOptions`).
- Produces: kit cart item `{ id, variantId?, extraIds?, subscriptionCadence?, quantity }`; checkout body items `{ paymentLinkId, variantId?, extraIds?, subscriptionCadence?, quantity }` and top-level `subscriptionConsent: true`.

- [ ] **Step 1: Write the failing test** (`apps/checkout/src/source-storefront.test.ts`)

```ts
import { describe, expect, it } from "vitest";
import { validatedCart } from "./source-storefront";

describe("hosted cart validation", () => {
  it("keeps a valid subscription cadence", () => {
    expect(validatedCart([{ id: "p1", quantity: 1, subscriptionCadence: "MONTHLY" }], "extraIds")).toEqual([{ id: "p1", quantity: 1, subscriptionCadence: "MONTHLY" }]);
  });
  it("rejects an unknown cadence", () => {
    expect(validatedCart([{ id: "p1", quantity: 1, subscriptionCadence: "DAILY" }], "extraIds")).toBeNull();
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `cd apps/checkout && npx vitest run src/source-storefront.test.ts`
Expected: FAIL (`validatedCart` not exported / cadence dropped).

- [ ] **Step 3: Implement**

`source-storefront.ts`: `export function validatedCart(…)`; add `subscriptionCadence?: "WEEKLY" | "BIWEEKLY" | "MONTHLY"` to `StoredCartItem`; inside the loop before `items.push`:

```ts
    if (item.subscriptionCadence !== undefined && !["WEEKLY", "BIWEEKLY", "MONTHLY"].includes(item.subscriptionCadence)) return null;
```

and add `...(item.subscriptionCadence !== undefined ? { subscriptionCadence: item.subscriptionCadence } : {})` to the pushed object. Wherever this file maps stored items back to the checkout API (`paymentLinkId: item.id …`), forward `subscriptionCadence` too.

`commerce.js`:

1. Keys, labels, prices — replace the `lineKey` const:

```js
  const lineKey = (id, variantId, cadence) => cadence ? JSON.stringify([id, variantId || '', null, cadence]) : variantId ? JSON.stringify([id, variantId]) : id;
  const CADENCE_TEXT = { WEEKLY: 'cada semana', BIWEEKLY: 'cada dos semanas', MONTHLY: 'cada mes' };
  const offerFor = (p, cadence) => store?.subscriptionsEnabled ? (p?.subscriptionOptions || []).find(o => o.cadence === cadence) : undefined;
  /* Same rule as the API: min(one-time price, base − discount). */
  const subscriptionPrice = (p, variant, cadence) => {
    const offer = offerFor(p, cadence), base = variant ? variant.amount : p.amount, oneTime = price(variant ? { ...p, amount: variant.amount } : p);
    return offer ? Math.min(oneTime, Math.round(base * (100 - offer.discountPercent) / 100)) : oneTime;
  };
```

(`store` is the loaded public store object this file already uses for `store.shippingEnabled`; if it is declared after this point, move these consts below its declaration or read it lazily as written.)

2. `cartLine(key)` — replace the `try { … } catch {}` line with:

```js
      try {
        const [id, variantId, keyPicks, cadence] = JSON.parse(key);
        p = products().find(p => p.id === id);
        if (cadence) {
          variant = variantId ? p?.variants?.find(v => v.id === variantId) : undefined;
          if (!p || !offerFor(p, cadence) || p.extras?.length || (variantId && !variant) || (p.variants?.length && !variant)) return null;
          return { p, variant, cadence, name: `${variant ? `${p.name} · ${variant.name}` : p.name} · ${CADENCE_TEXT[cadence]}`, amount: subscriptionPrice(p, variant, cadence) };
        }
        if (Array.isArray(keyPicks)) picks = keyPicks; else variant = p?.variants?.find(v => v.id === variantId);
      } catch {}
```

3. `cartItems`: add `...(line.cadence ? { subscriptionCadence: line.cadence } : {})` to the returned object. `checkoutItems` forwards it unchanged. In `restoreCart(items)`, compute the key as `item.subscriptionCadence ? lineKey(item.id, item.variantId, item.subscriptionCadence) : (existing expression)`.

4. Product detail: add

```js
  function subscriptionChoice(p) {
    const offers = store?.subscriptionsEnabled ? (p.subscriptionOptions || []) : [];
    if (!offers.length || p.extras?.length) return '';
    const best = Math.max(...offers.map(o => o.discountPercent));
    return `<fieldset class="product-detail__subscription" data-subscription-choice><legend>Cómo lo quieres</legend>`
      + `<label><input type="radio" name="purchaseMode" value="once" checked> Compra única</label>`
      + `<label><input type="radio" name="purchaseMode" value="subscribe"> ${best ? `Suscríbete y ahorra hasta ${best}%` : 'Suscríbete'}</label>`
      + (offers.length > 1
        ? `<select name="subscriptionCadence" aria-label="Frecuencia" disabled>${offers.map(o => `<option value="${escape(o.cadence)}">${escape(CADENCE_TEXT[o.cadence])}${o.discountPercent ? ` · −${o.discountPercent}%` : ''}</option>`).join('')}</select>`
        : `<input type="hidden" name="subscriptionCadence" value="${escape(offers[0].cadence)}">`)
      + `<p>Te enviamos un enlace para pagar antes de cada entrega. No se cobra automáticamente.</p></fieldset>`;
  }
  function selectedCadence(scope) {
    const choice = scope?.querySelector('[data-subscription-choice]');
    if (!choice || choice.querySelector('[name=purchaseMode]:checked')?.value !== 'subscribe') return undefined;
    return choice.querySelector('[name=subscriptionCadence]')?.value;
  }
```

In the product-detail template (~line 1083), insert `${subscriptionChoice(p)}` immediately before the `quantityMarkup(` call of the variant (`groups ?`) branch and of the final simple-product branch. At ~line 1043 (`if (variant) buy.dataset.add = lineKey(p.id, variant.id);`) pass `selectedCadence(detail)` as the third argument. Add one listener on the detail element:

```js
  detail.addEventListener('change', event => {
    if (!event.target.matches('[name=purchaseMode],[name=subscriptionCadence]')) return;
    const choice = event.target.closest('[data-subscription-choice]'), select = choice?.querySelector('select[name=subscriptionCadence]');
    if (select) select.disabled = choice.querySelector('[name=purchaseMode]:checked')?.value !== 'subscribe';
    const buy = detail.querySelector('.product-detail__buy[data-add], .product-detail__buy[data-variant-add]');
    const p = selectedProduct, variant = p?.variants?.find(v => buy?.dataset.add?.includes(v.id));
    if (buy && p && (buy.dataset.add || !p.variants?.length)) buy.dataset.add = lineKey(p.id, variant?.id, selectedCadence(detail));
    renderCart();
  });
```

(`selectedProduct` and `detail` are the names this file already uses for the open product and its container.)

5. Consent and checkout. Where the cart panel renders the `data-pay` button, first compute `const subscriptionLine = [...cart.keys()].map(cartLine).find(line => line?.cadence);` and render before the button:

```js
${subscriptionLine ? `<label class="commerce-consent"><input type="checkbox" name="subscriptionConsent"> Acepto que este pedido se repita ${escape(CADENCE_TEXT[subscriptionLine.cadence])}. Antes de cada entrega recibiré un enlace para pagar; no se cobra nada automáticamente. Puedo saltar, pausar o cancelar cuando quiera.</label>` : ''}
```

In `checkout(button)`, after `if (!validateDelivery(panel)) return;`:

```js
    const subscriptionLine = [...cart.keys()].map(cartLine).find(line => line?.cadence);
    if (subscriptionLine && !panel.querySelector('[name=subscriptionConsent]')?.checked) { message('Acepta las condiciones de la suscripción para continuar.'); return; }
```

and add `...(subscriptionLine ? { subscriptionConsent: true } : {})` to the request body object next to `items: checkoutItems()`.

- [ ] **Step 4: Run tests**

Run: `cd apps/checkout && npx vitest run src/source-storefront.test.ts && cd ../../packages/storefront-kit && npm test`
Expected: PASS; `check-runtimes.mjs` reports no errors; `tsc` passes.

- [ ] **Step 5: Commit**

```bash
git add packages/storefront-kit/kit/commerce.js apps/checkout/src/source-storefront.ts apps/checkout/src/source-storefront.test.ts
git commit -m "feat(storefront-kit): kit and YAPI product pages offer the subscription choice and the cart carries it to checkout"
```

---

### Task 12: Manage page `/suscripcion/:token`

**Files:**
- Create: `apps/checkout/src/subscriptions/manage-page.ts`
- Create: `apps/checkout/src/subscriptions/manage-page.test.ts`
- Modify: `apps/checkout/src/api.ts` (`SubscriptionManageView`, `fetchSubscription`, `actOnSubscription`)
- Modify: `apps/checkout/src/main.ts` (~lines 87 and 121)
- Modify: `apps/checkout/server.mjs` (lines 28 and 57)

**Interfaces:**
- Consumes: Task 8 public endpoints and `ManageView`.
- Produces: `renderSubscriptionManage(token: string): Promise<void>`; pure `manageViewHtml(view: SubscriptionManageView): string`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { manageViewHtml } from "./manage-page";

const view = {
  storeName: "Café Norte", itemName: "Café 500 g", cadence: "MONTHLY", cadenceLabel: "cada mes", amount: 15900, currency: "BOB",
  nextBillingAt: "2026-11-01T15:00:00.000Z", status: "ACTIVE",
  openPayment: { checkoutUrl: "https://pagar.test/#client_secret=x", amount: 15900, dueAt: "2026-11-01T15:00:00.000Z" },
  history: [{ periodStart: "2026-10-01T15:00:00.000Z", status: "PAID", amount: 15900 }],
  cadenceOptions: [{ cadence: "MONTHLY", label: "cada mes", discountPercent: 10 }, { cadence: "WEEKLY", label: "cada semana", discountPercent: 5 }],
};

describe("manageViewHtml", () => {
  it("shows product, frequency, pay button and actions for an active subscription", () => {
    const html = manageViewHtml(view as never);
    expect(html).toContain("Café 500 g");
    expect(html).toContain("cada mes");
    expect(html).toContain('href="https://pagar.test/#client_secret=x"');
    for (const action of ["skip", "pause", "cancel", "change_cadence"]) expect(html).toContain(`data-action="${action}"`);
    expect(html).not.toContain('data-action="resume"');
    expect(html).toContain("Pagado");
    expect(html).toContain("No se cobra nada automáticamente.");
  });
  it("offers resume for a paused one and nothing for a canceled one", () => {
    expect(manageViewHtml({ ...view, status: "PAUSED", openPayment: null } as never)).toContain('data-action="resume"');
    expect(manageViewHtml({ ...view, status: "CANCELED", openPayment: null } as never)).not.toContain("data-action=");
  });
  it("escapes store-provided text", () => {
    expect(manageViewHtml({ ...view, itemName: "<img src=x onerror=alert(1)>" } as never)).not.toContain("<img src=x");
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `cd apps/checkout && npx vitest run src/subscriptions/manage-page.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`api.ts`:

```ts
export interface SubscriptionManageView {
  storeName: string; itemName: string; cadence: string; cadenceLabel: string; amount: number; currency: string;
  nextBillingAt: string; status: "ACTIVE" | "PAUSED" | "CANCELED";
  openPayment: { checkoutUrl: string; amount: number; dueAt: string } | null;
  history: Array<{ periodStart: string; status: string; amount: number }>;
  cadenceOptions: Array<{ cadence: string; label: string; discountPercent: number }>;
}

export async function fetchSubscription(token: string): Promise<SubscriptionManageView> {
  const response = await fetch(`${API_BASE_URL}/subscriptions/public/${encodeURIComponent(token)}`, { credentials: "omit", cache: "no-store" });
  if (!response.ok) throw new Error(response.status === 404 ? "Este enlace no es válido o la suscripción ya no existe." : "No pudimos cargar tu suscripción.");
  return response.json();
}

export async function actOnSubscription(token: string, body: { action: string; cadence?: string }): Promise<SubscriptionManageView> {
  const response = await fetch(`${API_BASE_URL}/subscriptions/public/${encodeURIComponent(token)}/actions`, { method: "POST", credentials: "omit", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof data.message === "string" ? data.message : "No pudimos guardar el cambio.");
  return data;
}
```

(`API_BASE_URL` already ends in `/v1` if the other calls in this file use `${API_BASE_URL}/stores/…`; match them.)

`subscriptions/manage-page.ts`:

```ts
import { actOnSubscription, fetchSubscription, type SubscriptionManageView } from "../api";
import { escapeHtml, formatAmount } from "../ui/html";

const HISTORY_LABEL: Record<string, string> = { PAID: "Pagado", MISSED: "Sin pagar", SKIPPED: "Saltado", DUE: "Pendiente", CANCELED: "Cancelado" };
const day = (iso: string) => new Date(iso).toLocaleDateString("es-BO", { day: "numeric", month: "long" });

export function manageViewHtml(view: SubscriptionManageView, confirmingCancel = false): string {
  const status = view.status === "ACTIVE" ? `Próxima entrega: ${escapeHtml(day(view.nextBillingAt))}` : view.status === "PAUSED" ? "Pausada" : "Cancelada";
  const pay = view.openPayment ? `<a class="primary" href="${escapeHtml(view.openPayment.checkoutUrl)}">Pagar ${escapeHtml(formatAmount(view.openPayment.amount, view.currency))}</a><p class="faint">Vence el ${escapeHtml(day(view.openPayment.dueAt))}</p>` : "";
  const cancel = confirmingCancel
    ? `<p>¿Cancelar tu suscripción? No se cobrará nada más.</p><button type="button" data-action="cancel" data-confirmed="1">Sí, cancelar</button><button type="button" data-keep>No</button>`
    : `<button type="button" class="quiet" data-action="cancel">Cancelar suscripción</button>`;
  const actions = view.status === "ACTIVE"
    ? `<button type="button" data-action="skip">Saltar la próxima</button>
       <label>Frecuencia <select name="cadence">${view.cadenceOptions.map(option => `<option value="${escapeHtml(option.cadence)}" ${option.cadence === view.cadence ? "selected" : ""}>${escapeHtml(option.label)}${option.discountPercent ? ` · −${option.discountPercent}%` : ""}</option>`).join("")}</select></label>
       <button type="button" data-action="change_cadence">Cambiar frecuencia</button>
       <button type="button" data-action="pause">Pausar</button>${cancel}`
    : view.status === "PAUSED" ? `<button type="button" class="primary" data-action="resume">Reanudar</button>${cancel}` : "";
  return `<main class="subscription-manage">
    <h1>Tu suscripción en ${escapeHtml(view.storeName)}</h1>
    <section class="card"><h2>${escapeHtml(view.itemName)}</h2><p>${escapeHtml(formatAmount(view.amount, view.currency))} · ${escapeHtml(view.cadenceLabel)}</p><p>${status}</p>${pay}</section>
    ${actions ? `<section class="card subscription-manage__actions">${actions}</section>` : ""}
    <section class="card"><h2>Historial</h2><ul>${view.history.map(entry => `<li>${escapeHtml(day(entry.periodStart))} · ${escapeHtml(HISTORY_LABEL[entry.status] ?? entry.status)} · ${escapeHtml(formatAmount(entry.amount, view.currency))}</li>`).join("")}</ul></section>
    <p class="faint">No se cobra nada automáticamente.</p>
    <p role="status" data-manage-status></p>
  </main>`;
}

export async function renderSubscriptionManage(token: string): Promise<void> {
  document.body.classList.remove("store-page", "product-detail-page", "payment-page", "payment-success-page", "debt-collection-page");
  document.body.classList.add("subscription-manage-page");
  document.title = "Tu suscripción — pagosYa";
  const app = document.getElementById("app")!;
  let view: SubscriptionManageView;
  let confirmingCancel = false;
  const paint = (status = "") => { app.innerHTML = manageViewHtml(view, confirmingCancel); const line = app.querySelector("[data-manage-status]"); if (line) line.textContent = status; };
  app.innerHTML = `<main class="subscription-manage"><p role="status">Cargando tu suscripción…</p></main>`;
  try { view = await fetchSubscription(token); paint(); }
  catch (error) {
    app.innerHTML = `<main class="subscription-manage"><p role="alert">${escapeHtml((error as Error).message)}</p><button type="button" id="manage-retry">Reintentar</button></main>`;
    app.querySelector("#manage-retry")?.addEventListener("click", () => renderSubscriptionManage(token));
    return;
  }
  app.addEventListener("click", async (event) => {
    const button = (event.target as HTMLElement).closest("button");
    if (!button) return;
    if (button.hasAttribute("data-keep")) { confirmingCancel = false; paint(); return; }
    const action = button.dataset.action;
    if (!action) return;
    if (action === "cancel" && !button.dataset.confirmed) { confirmingCancel = true; paint(); return; }
    button.disabled = true;
    try {
      const cadence = action === "change_cadence" ? (app.querySelector<HTMLSelectElement>("select[name=cadence]")?.value) : undefined;
      view = await actOnSubscription(token, { action, ...(cadence ? { cadence } : {}) });
      confirmingCancel = false;
      paint("Listo, guardamos el cambio.");
    } catch (error) { paint((error as Error).message); }
  });
}
```

(Use the checkout app's real mount element id — `renderOrderTracking` shows which one; replace `"app"` if it differs.)

`main.ts`: next to `const trackingMatch = …` add

```ts
  const subscriptionMatch = window.location.pathname.match(/^\/suscripcion\/([^/]+)\/?$/);
  let subscriptionToken: string | null = null;
  try { subscriptionToken = subscriptionMatch?.[1] ? decodeURIComponent(subscriptionMatch[1]) : null; } catch { subscriptionToken = null; }
```

and before `if (trackingToken) {`: `if (subscriptionToken) { await renderSubscriptionManage(subscriptionToken); return; }` (import from `./subscriptions/manage-page`).

`server.mjs`: line 28 add `|| /^\/suscripcion\/[^/]+\/?$/.test(pathname)` to the condition; line 57 add `|| url.pathname.startsWith("/suscripcion/")` to the noindex condition.

- [ ] **Step 4: Run tests and types**

Run: `cd apps/checkout && npx vitest run && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/checkout/src/subscriptions apps/checkout/src/api.ts apps/checkout/src/main.ts apps/checkout/server.mjs
git commit -m "feat(checkout): /suscripcion/:token lets the buyer pay the next delivery, skip, pause, change frequency or cancel"
```

---

### Task 13: YAPI note, help article, full suites and browser QA

**Files:**
- Modify: `apps/api/src/storefront-source/source-product-options.ts:119` (`SOURCE_PRODUCT_SUBSCRIPTIONS`)
- Create: `docs/help/suscripciones.md`
- Test: `apps/api/src/storefront-source/source-product-options.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { SOURCE_PRODUCT_SUBSCRIPTIONS } from "./source-product-options";

it("describes subscriptions as pay-link renewals, never automatic charges", () => {
  expect(SOURCE_PRODUCT_SUBSCRIPTIONS).toContain("renewals are pay links");
  expect(SOURCE_PRODUCT_SUBSCRIPTIONS).toContain("Never claim or imply automatic charging");
  expect(SOURCE_PRODUCT_SUBSCRIPTIONS).not.toContain("customer enrollment, recurring orders and automatic charging are not implemented");
});
```

(Export the constant if it is module-private.)

- [ ] **Step 2: Run to see it fail**

Run: `cd apps/api && npx jest src/storefront-source/source-product-options.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Update the note and write the article**

In `SOURCE_PRODUCT_SUBSCRIPTIONS`, replace the final two sentences ("The backend configures offers only: … Never hardcode cadence selectors or claim a subscription is enrolled or a recurring charge is scheduled.") with:

`When the store's Suscripciones switch is on, the shared product page shows "Compra única / Suscríbete y ahorra" for products with offers, checkout enrolls the buyer, and each renewal creates an order; renewals are pay links sent by email before each delivery, and the buyer can skip, pause or cancel from their link. Never claim or imply automatic charging. Never hardcode cadence selectors in source files: the kit renders them. If the merchant asks whether subscriptions work, tell them to turn them on in Suscripciones → Configuración.`

`docs/help/suscripciones.md`:

```markdown
# Suscripciones

**Qué es:** tus clientes compran un producto para recibirlo cada semana, cada dos semanas o cada mes, con el descuento que tú elijas.

**Cómo funciona:**
- Activa "Ofrecer suscripciones en tu tienda" en Suscripciones → Configuración y elige qué productos, con qué frecuencias y descuentos.
- En la página del producto, el cliente elige "Compra única" o "Suscríbete y ahorra" y paga el primer pedido normalmente.
- Tres días antes de cada entrega le enviamos un correo con un enlace para pagar con QR o tarjeta. Al pagar, el pedido aparece en Pedidos.
- El cliente puede saltar una entrega, pausar, cambiar la frecuencia o cancelar desde el enlace de su correo.

**Lo que no hace (todavía):**
- No cobra automáticamente: cada entrega se paga con un enlace.
- No funciona con envíos por courier; sí con retiro, entrega en sucursal y zonas de envío.
- No aplica a productos digitales.

**Si alguien no paga:** a los 7 días la entrega se marca "Sin pagar" y el pedido se cancela. Tras dos entregas seguidas sin pagar, la suscripción se pausa y te avisamos.

**Precios:** cada suscriptor mantiene el precio con el que se suscribió. Si cambias el precio, usa "Aplicar precio actual"; les avisamos y el nuevo precio aplica desde 7 días después.
```

- [ ] **Step 4: Run to see it pass**

Run: `cd apps/api && npx jest src/storefront-source`
Expected: PASS.

- [ ] **Step 5: Full suites**

Run:
```bash
cd apps/api && npx jest && npx tsc --noEmit -p tsconfig.json
cd ../checkout && npx vitest run && npx tsc --noEmit
cd ../merchant-dashboard && npm run test:unit
cd ../../packages/storefront-kit && npm test
```
Expected: all PASS. Report any failure with its output; do not skip or weaken tests.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/storefront-source docs/help/suscripciones.md
git commit -m "docs(subscriptions): YAPI knows renewals are pay links; first help-centre article"
```

- [ ] **Step 7: Browser QA (main session only, after the owner agrees to apply the migration)**

Apply: `pnpm --filter api exec prisma migrate deploy`. Then, with the `visual-qa` skill and `pnpm dev` running (remember the dashboard may serve a pre-built Studio and an orphan API may hold :3001 — restart cleanly), on a test-mode store:
1. Dashboard → Suscripciones → Configuración: turn the switch on; give a product Mensual −10% and Semanal −5%.
2. Checkout-app store product page: both choices show; choose Suscríbete · Semanal; add; the cart shows "· cada semana" at the discounted price next to a one-time line of the same product.
3. Checkout: the consent box blocks paying until ticked; the email field is required; pay with the mock QR.
4. Dashboard → Suscripciones: the subscriber appears with "Prueba", next date one week out.
5. The receipt (dev mail log or `StoreEmailDelivery` row) carries the manage link; open it: skip → date moves; change frequency → Mensual; pause → Reanudar appears; cancel (with the inline confirm) → no actions left.
6. Set a live subscription's `nextBillingAt` to 2 days ahead in Prisma Studio and wait for (or trigger) the worker: a renewal order appears in Pedidos as awaiting payment and its pay link opens the checkout.
7. Repeat 2–3 on a kit/YAPI store product page.
8. All of the above at 390 px width: no horizontal page scroll, every control reachable.

Record what passed and anything that didn't, with screenshots, in the final report.
