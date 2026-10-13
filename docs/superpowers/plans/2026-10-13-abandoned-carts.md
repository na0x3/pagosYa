# Abandoned Carts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merchants see who left their store without paying, with what, and how to reach them (Crecer › Carritos abandonados). Shoppers can ask for one reminder from the payment form ("Avísame"). The checkout steps have one definition, the analytics events, which feeds the insights, the Store Brain and this page.

**Architecture:** One SQL helper, `funnelSessions`, counts the sessions of each checkout step from `StoreAnalyticsEvent`. `StoreFunnelService.summary`, `loadStoreKnowledge` and the new abandoned-carts service all read it. `StoreFunnelVisit` keeps only the visit token that links a paid order to its session. `/funnel` still accepts the old step events and writes nothing for them. The store page and the kit stop sending those events. The "Avísame" box is offered when the checkout session says `reminderAvailable`. When the shopper ticks it and presses Pagar, `PaymentIntentsController.confirm` asks `RetentionService.saveCartFromPayment` to save the cart for one reminder. That call runs after the payment's own transaction and rail call have finished, and its errors are logged and skipped. `GET /v1/stores/:storeId/abandoned-carts` merges unpaid confirmed payments with saved carts in a pure, unit-tested builder. A new dashboard module renders the list.

**Tech Stack:** NestJS 11 + Prisma 5 (Postgres) with jest/ts-jest and supertest e2e on an embedded Postgres; the checkout app (Vite + TypeScript, vitest + jsdom); the storefront kit (`packages/storefront-kit/kit/commerce.js`, tested in jsdom from API jest specs); the merchant dashboard (plain ES modules, node:test and Playwright).

**Spec:** `docs/superpowers/specs/2026-10-13-abandoned-carts-design.md`

## Findings against the spec (the plan builds around these; it does not silently change the design)

1. **Analytics sessions cannot be joined to `StoreFunnelVisit` or orders.** `StoreAnalyticsEvent.sessionHash` is `HMAC(analyticsSessionSecret, 'store-analytics:' + sessionId)` (`apps/api/src/store-analytics/store-analytics.service.ts:82-84`, whose comment says "raw rows cannot be joined to funnel visits or orders"). `StoreFunnelVisit.sessionHash` is a plain `sha256(sessionId)` (`store-funnel.service.ts:16`). Two comments claim the opposite and are stale: the schema comment on `StoreAnalyticsEvent.sessionHash`, and `apps/checkout/src/store-funnel.ts:38`. This affects the plan in three ways:
   - The anonymous count cannot test "no paid order linked through `StoreFunnelVisit`". The plan counts sessions with an `add_to_cart` older than 24 h and **no `pay_click`**. Every paid session pressed Pagar, so the order condition adds nothing.
   - `summary().checkoutWithoutPayment` would need that join, and nothing reads it (only `store-growth.service.ts:106` reads the summary, and it uses `matureCartAdds`/`cartWithoutCheckout`), so the plan **drops that field**.
   - `paymentCompletions` stays a count of `StoreFunnelVisit` rows with a live paid order. That is not a per-session join, so `paymentFromCheckout` divides a funnel-visit count by an analytics count. Both sources are gated on the same analytics consent.
2. **`recoveryEnabled` does not reach the payment form today.** The store page reads it from `GET /v1/stores/public/:slug/retention` (`retention.controller.ts:30-34`). The payment form only loads the checkout session (`checkout-session.controller.ts:41-55`), which carries no retention data. The plan therefore adds **`reminderAvailable: boolean`** to the session response, computed on the server.
3. **`confirmationAttempts` exists** (`PaymentIntent.confirmationAttempts Int @default(0)`). `confirm()` increments it inside its transaction (`payment-intents.service.ts`, the `paymentIntent.update` in `confirm`).
4. **`metadata.cart` lines carry `extraIds`** (`store-checkout.service.ts:180`) and `variantId`. Subscription lines also carry `subscription.cadence`, which the spec's saved-item shape `{ paymentLinkId, variantId, extraIds, quantity }` drops, so a restored cart comes back as a one-time purchase. The plan keeps the spec's shape. **Open question for the owner:** should a reminder cart keep `subscriptionCadence`?
5. **`metadata.cart` is not only store carts.** Subscription renewals (`operations/subscriptions.service.ts:246`, `metadata.subscription`) and membership joins (`memberships/memberships.service.ts:54`, `metadata.membership`) write a cart too. The plan's `reminderCart()` excludes both, for the box and for the list. In the checkout, `isStoreCheckout` is only `Array.isArray(metadata.cart)` (`payment-result.ts:47`), so the box relies on the server's `reminderAvailable`.
6. **`metadata.storeId` is caller-supplied on API-created payments** (`createInTransaction` keeps `dto.metadata`). The plan therefore always checks that the store belongs to the payment's merchant before offering the box or saving a cart.
7. **The hook lives in `PaymentIntentsController.confirm`, not in `PaymentIntentsService`.** It runs after `service.confirm()` returns, outside every payment transaction. The result is that **`payment-intents.service.ts` is not edited at all** (see "Shared files with plan A"). `stores.service.ts:75`, the dashboard's quick QR, calls `service.confirm()` directly and is unaffected. A confirm that already `SUCCEEDED` skips the hook, because a paid cart needs no reminder.
8. **"Matches `RetentionService.cartPaid`" is approximate.** `cartPaid` (`retention.service.ts:219-221`) matches by email only, ignores `livemode`, and uses the payment's `updatedAt >= cart.createdAt`. The list drops a row when a **live** `SUCCEEDED` payment of this store with the same email *or phone* was updated at or after the row's time, or when the row's own linked payment succeeded (in any mode). That follows the spec's wording.
9. **When "Sin recordatorio" appears.** The API returns `reminder: 'none'` in two cases: a saved cart that was never sent while the store's reminders are off, and a kind-1 row with no saved cart. Following the spec, the UI shows the reminder pill on every saved-cart row, and on a payment row only when it has a saved cart (`recoverUrl`).
10. **The kit never calls `/funnel` itself.** It posts `pagosya:funnel` to the host page (`commerce.js:145`), and the host forwards it (`apps/checkout/src/source-storefront.ts:188`). Once the new host page ships, old kits in published stores stop producing step writes. After that, only a stale cached host bundle can still post steps to `/funnel`.
11. **Email subject.** The spec gives none, so the plan uses «Tu carrito en {tienda}».

## Global Constraints

- All paths are relative to the plan-B worktree root. Work only in that worktree. Never edit `/Users/saramia/pagosYaWeb`.
- **Never run `prisma migrate` (dev/deploy/diff/reset) or `prisma db push` against any database. Plan no migration: this feature needs none.** The `StoreFunnelVisit` step columns stay in the schema, unwritten. The API e2e global setup (`apps/api/test/global-setup.cjs`) runs `prisma migrate deploy` only against its own embedded throwaway Postgres, which is fine. **Do not run `apps/api` `npm test`, `jest --config jest.integration.config.js` or any `*.integration.spec.ts`**: those create databases on the dev Postgres server.
- API unit: `cd apps/api && npx jest <path>`. Never run the whole API suite with default workers; if needed, use `npx jest --maxWorkers=2`. API e2e: `cd apps/api && npx jest --config test/jest-e2e.json <path>`.
- Checkout: `cd apps/checkout && npx vitest run <file>`. Typecheck: `cd apps/checkout && npx tsc -p tsconfig.json`.
- API typecheck: `cd apps/api && npx tsc --noEmit -p tsconfig.json`.
- Dashboard unit: `cd apps/merchant-dashboard && node --test <file>` (all: `npm run test:unit`).
- **Dashboard Playwright runs only on port 4324** through the untracked config made in Task 9, Step 1. Port 4323 may be the owner's live dashboard or plan A's run, and `reuseExistingServer` would silently test the wrong checkout's code. Never stop a process you did not start.
- Test-mode payments (`livemode: false`) never count as sales, and the abandoned list shows only live payment attempts.
- Analytics event types, labels and checkout steps are pinned in three places and **must not change**: `apps/api/src/store-analytics/store-analytics.constants.ts`, the kit (`commerce.js` `ANALYTICS_LABELS`), and `apps/checkout/src/store-analytics.ts`.
- `/funnel` keeps accepting every event in `FUNNEL_EVENTS` with its current validation, and writes nothing for anything but `visit`.
- Do not touch `apps/merchant-studio/src/retention.ts`, or the receipt path in `apps/api/src/payment-intents/payment-intents.service.ts` (no line of that file changes in this plan).
- Copy is Spanish (Bolivia), exactly:
  - nav «Carritos abandonados»; view description «Quién dejó productos sin pagar y cómo escribirle.»
  - «N visitas dejaron su carrito sin dejar contacto» (singular «1 visita dejó su carrito sin dejar contacto»)
  - «Generó el QR / pulsó Pagar», «Guardó su carrito»
  - «Recordatorio programado», «Recordatorio enviado», «Sin recordatorio»
  - «Escribir por WhatsApp», «Escribir por correo»
  - message «Hola {nombre}, vimos que dejaste {producto ×n, …} en {tienda}. ¿Te ayudamos a terminar tu compra? {enlace}»; subject «Tu carrito en {tienda}»
  - «Todavía no hay carritos abandonados con contacto.»
  - checkbox «Avísame por correo si no termino la compra»
  - period buttons «7 días», «30 días»
- Code style: match the surrounding code (dense one-liners, comments that explain *why*). Every value interpolated into dashboard markup goes through `esc()`.
- Known pre-existing failures that this work does not cause (do not fix them; note them if they show up): 9 suites in `apps/api/src/storefront-source`: the jsdom `getComputedStyle` pseudoElt failure in kit specs, the product-card DNA tests, `source-email-direction`, `source-validation-error`, `source-next-pages`, the `source-dna` hash, `agent-tools.theme`, `product-card-distance` and `source-generation-agent`. `source-commerce-analytics.spec.ts` passed on 2026-10-13 and must stay green.

## Review Focus

Most likely to bite first. Each line has its test in the owning task.

1. **A spoofed API payment.** A merchant's API payment can carry another merchant's `storeId` and a cart. It must never get the box or save a reminder under that store. → Task 4, e2e «does nothing without …» (`spoof@example.com`).
2. **Ticking, then clearing the email.** If the shopper ticks «Avísame» and then clears the email, the box unticks and disables, and confirm sends no `reminderConsent`. → Task 6, test «disabled until there is an email … unticks when the email is cleared».
3. **One person in different spellings.** «+591 7000 0009» and «70000009», or «DORA@…» and «dora@…», are one person: one row, and a later payment by either spelling drops it. → Task 7, unit «drops a person who paid after leaving …» and e2e «drops paid people …».
4. **Renewal and membership pay links.** They carry `metadata.cart` but are not abandoned carts: they are never listed and never offered the box. → Task 4 unit `reminderCart`, Task 4 e2e (`renewal@example.com`), Task 7 e2e (`renewal@example.com`).
5. **Hostile shopper names.** A shopper-typed name with HTML renders as text, and the WhatsApp and mailto links are URL-encoded. → Task 9, Playwright «… hostile name stays text».

---

## Before you start (once, in the B worktree)

- [ ] **Step 1: Make sure the branch carries today's uncommitted work.** On 2026-10-13 the main checkout had uncommitted changes, including the `saveCart` fix in `retention.service.ts`, the store bulk-delete modules and their `server.mjs` allow-list entry. This plan's code and line numbers assume them. The worktree must branch from a commit that includes them. Check: `git log -1 --format=%H` matches the commit the controller named, and `grep -n '"/src/store-bulk-delete.mjs"' apps/merchant-dashboard/server.mjs` prints line 151. If not, stop and ask the controller.
- [ ] **Step 2: Install and generate.** From the worktree root, run `pnpm install`, then `cd apps/api && npx prisma generate`. Copy `.env`, `apps/api/.env`, `apps/api/.env.local` and `apps/checkout/.env` from `~/pagosYa` if they exist (they are gitignored). Do not start `pnpm dev` and do not start a database.
- [ ] **Step 3: Baseline.**
  - Run `cd apps/api && npx jest src/store-growth src/store-knowledge src/retention src/payment-intents/payment-intents.controller.spec.ts src/storefront-source/source-commerce-analytics.spec.ts`. Expected: all PASS.
  - Run `cd apps/checkout && npx vitest run test/store-funnel.test.ts test/payment-form.test.ts test/source-storefront-analytics.test.ts`. Expected: all PASS.

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `apps/api/src/store-growth/funnel-sessions.ts` | create | The one definition of each checkout step: one SQL count of sessions per step from `StoreAnalyticsEvent` |
| `apps/api/src/store-growth/store-funnel.service.ts` | modify | `/funnel` writes only the visit; `summary` reads `funnelSessions` |
| `apps/api/src/store-knowledge/store-knowledge.ts` | modify | Store Brain's 30-day funnel from `funnelSessions` |
| `apps/checkout/src/store-funnel.ts` and callers | modify | Store page sends only `visit`; host ignores old kit `pagosya:funnel` posts |
| `packages/storefront-kit/kit/commerce.js` | modify | Kit stops posting `pagosya:funnel`; merchant pixels unchanged |
| `apps/api/src/retention/reminder-cart.ts` | create | Pure: a payment's store-page cart as saved-cart items, or null |
| `apps/api/src/retention/retention.service.ts` | modify (add only) | `reminderAvailable(intent)`, `saveCartFromPayment(id)` |
| `apps/api/src/payment-intents/dto/confirm-payment-intent.dto.ts` | modify | `reminderConsent?: boolean` |
| `apps/api/src/payment-intents/payment-intents.controller.ts` | modify | Post-confirm hook, outside the payment |
| `apps/api/src/payment-intents/checkout-session.controller.ts` | modify | Session gains `reminderAvailable` |
| `apps/api/src/payment-intents/payment-intents.module.ts` | modify | Imports `RetentionModule` |
| `apps/checkout/src/checkout/reminder-consent.ts` | create | Pure: the box's markup |
| `apps/checkout/src/checkout/payment-form.ts`, `apps/checkout/src/api.ts`, `apps/checkout/src/style.css` | modify | Render the box, keep its state, send `reminderConsent` |
| `apps/api/src/store-growth/abandoned-carts.ts` | create | Pure: rows from attempts, saved carts and payments (merge, one per person, paid drops) |
| `apps/api/src/store-growth/abandoned-carts.service.ts` | create | Reads the rows' sources, owner-scoped |
| `apps/api/src/store-growth/abandoned-carts.controller.ts` | create | `GET /v1/stores/:storeId/abandoned-carts?days=7\|30` |
| `apps/api/src/store-growth/store-growth.module.ts` | modify | Registers controller and service |
| `apps/merchant-dashboard/src/abandoned-carts.mjs` | create | Pure: labels, message, WhatsApp/mailto links, relative time |
| `apps/merchant-dashboard/src/abandoned-carts-panel.mjs` | create | The page: period picker, anonymous line, rows, empty state |
| `apps/merchant-dashboard/index.html`, `src/dashboard.js`, `server.mjs`, `src/growth.css` | modify | Nav item, view section, registration, allow-list, styles |

---

### Task 1: One funnel, reads: steps come from the analytics events

**Files:**
- Create: `apps/api/src/store-growth/funnel-sessions.ts`
- Modify: `apps/api/src/store-growth/store-funnel.service.ts` (`summary`, lines 31-64)
- Modify: `apps/api/src/store-knowledge/store-knowledge.ts` (`loadStoreKnowledge`, lines 157-178)
- Test: `apps/api/src/store-growth/store-funnel.service.spec.ts`, `apps/api/src/store-knowledge/store-knowledge.spec.ts`, `apps/api/test/store-growth.e2e-spec.ts`

**Interfaces:**
- Produces: `export type FunnelSessions = { visitors: number; productViews: number; cartAdds: number; checkoutStarts: number; deliverySelections: number; matureCartAdds: number; cartWithoutCheckout: number; cartWithoutPay: number }` and `export async function funnelSessions(prisma: Pick<PrismaService, '$queryRaw'>, storeId: string, since: Date, now?: Date): Promise<FunnelSessions>`. Task 7 uses `cartWithoutPay`.
- Produces: `StoreFunnelService.summary(storeId: string, since: Date, now = new Date())` returns `{ visitors, productViews, cartAdds, checkoutStarts, deliverySelections, paymentCompletions, conversionRates: {…same five…}, matureCartAdds, cartWithoutCheckout }`. **`checkoutWithoutPayment` is removed** (Finding 1).

- [ ] **Step 1: Write the failing unit tests**

In `apps/api/src/store-growth/store-funnel.service.spec.ts`, replace the `mock` line (line 3) with:

```ts
  const steps = { visitors: 10, productViews: 6, cartAdds: 4, checkoutStarts: 2, deliverySelections: 1, matureCartAdds: 3, cartWithoutCheckout: 2, cartWithoutPay: 1 };
  const mock = () => ({ store: { findFirst: jest.fn().mockResolvedValue({ id: 's1' }) }, storeFunnelVisit: { upsert: jest.fn().mockResolvedValue({ id: 'v1', token: 't'.repeat(32), createdAt: new Date() }), updateMany: jest.fn().mockResolvedValue({ count: 1 }), count: jest.fn().mockResolvedValue(3) }, $queryRaw: jest.fn().mockResolvedValue([steps]) });
```

and replace the test `it('derives completed payment sessions from trusted live succeeded orders', …)` (lines 19-24) with:

```ts
  it('reads the steps from the analytics events, and paid sessions from trusted live succeeded orders', async () => {
    const prisma = mock(); const since = new Date('2026-09-01'); const now = new Date('2026-09-30T12:00:00Z');
    const summary = await new StoreFunnelService(prisma as any).summary('s1', since, now);
    expect(summary).toMatchObject({ visitors: 10, productViews: 6, cartAdds: 4, checkoutStarts: 2, deliverySelections: 1, paymentCompletions: 3, matureCartAdds: 3, cartWithoutCheckout: 2,
      conversionRates: { productViewFromVisitor: 60, cartAddFromProductView: 66.7, checkoutFromCartAdd: 50, deliverySelectionFromCheckout: 50, paymentFromCheckout: 150 } });
    expect(summary).not.toHaveProperty('checkoutWithoutPayment');
    // The step columns are never read again: one count, the order link.
    expect(prisma.storeFunnelVisit.count).toHaveBeenCalledTimes(1);
    expect(prisma.storeFunnelVisit.count).toHaveBeenCalledWith({ where: { storeId: 's1', createdAt: { gte: since }, orders: { some: { paymentIntent: { status: 'SUCCEEDED', livemode: true } } } } });
    const [sql, ...values] = prisma.$queryRaw.mock.calls[0];
    expect(sql.join('?')).toContain('"StoreAnalyticsEvent"');
    expect(values).toEqual(expect.arrayContaining(['s1', since.toISOString(), new Date(now.getTime() - 86_400_000).toISOString()]));
  });
```

In `apps/api/src/store-knowledge/store-knowledge.spec.ts`, change the import on line 1 to

```ts
import { buildStoreKnowledge, loadStoreKnowledge, storeKnowledgeForGeneration, type StoreKnowledgeInput } from './store-knowledge';
```

and append at the end of the file:

```ts
describe('loadStoreKnowledge', () => {
  it('reads the 30-day funnel from the analytics events, not the funnel visits', async () => {
    const prisma = {
      store: { findFirst: jest.fn().mockResolvedValue(input().store) },
      paymentLink: { findMany: jest.fn().mockResolvedValue([]) }, category: { findMany: jest.fn().mockResolvedValue([]) }, collection: { findMany: jest.fn().mockResolvedValue([]) },
      storeOrder: { findMany: jest.fn().mockResolvedValue([]) }, storeReview: { findMany: jest.fn().mockResolvedValue([]) }, merchantInvoicingProfile: { findFirst: jest.fn().mockResolvedValue(null) },
      $queryRaw: jest.fn().mockResolvedValue([{ visitors: 40, productViews: 20, cartAdds: 5, checkoutStarts: 2, deliverySelections: 1, matureCartAdds: 3, cartWithoutCheckout: 1, cartWithoutPay: 1 }]),
    };
    const knowledge = await loadStoreKnowledge(prisma as any, 'm1', 's1', now);
    expect(knowledge!.performance30d).toMatchObject({ visits: 40, productViews: 20, addedToCart: 5, checkoutsStarted: 2, paidOrders: 0 });
    expect(prisma.$queryRaw.mock.calls[0].slice(1)).toEqual(expect.arrayContaining(['s1', new Date(now.getTime() - 30 * 86_400_000).toISOString()]));
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd apps/api && npx jest src/store-growth/store-funnel.service.spec.ts src/store-knowledge/store-knowledge.spec.ts`
Expected: FAIL. The summary test fails on `expect(summary).toMatchObject` (it still counts `storeFunnelVisit`). `loadStoreKnowledge` throws `Cannot read properties of undefined (reading 'count')`.

- [ ] **Step 3: Create `apps/api/src/store-growth/funnel-sessions.ts`**

```ts
import type { PrismaService } from '../prisma/prisma.service';

/** Sessions per checkout step for one store and period: the one definition the insights, the Store Brain and Carritos abandonados share. */
export type FunnelSessions = {
  visitors: number; productViews: number; cartAdds: number; checkoutStarts: number; deliverySelections: number;
  /** Added to the cart more than 24 hours ago: old enough that not finishing means something. */
  matureCartAdds: number;
  /** …and never opened the order review. */
  cartWithoutCheckout: number;
  /** …and never pressed Pagar. Every paid session pressed it, so no order lookup is needed (and none could join, see below). */
  cartWithoutPay: number;
};
const EMPTY: FunnelSessions = { visitors: 0, productViews: 0, cartAdds: 0, checkoutStarts: 0, deliverySelections: 0, matureCartAdds: 0, cartWithoutCheckout: 0, cartWithoutPay: 0 };

/**
 * Steps come only from the G1 events (spec 2026-10-13-abandoned-carts): page_view, product_view, add_to_cart and the
 * review / delivery checkout steps, each counted once per session since `since`, read through the (storeId, createdAt)
 * index; only counts leave the query. createdAt is UTC wall time and the server's TimeZone is not UTC everywhere, so the
 * bounds are cast explicitly (as StoreGrowthService.deviceConversion does). The session hash is keyed with the
 * analytics secret: these sessions cannot be joined to StoreFunnelVisit or to orders, on purpose.
 */
export async function funnelSessions(prisma: Pick<PrismaService, '$queryRaw'>, storeId: string, since: Date, now = new Date()): Promise<FunnelSessions> {
  const matureBefore = new Date(now.getTime() - 86_400_000).toISOString();
  const [row] = await prisma.$queryRaw<FunnelSessions[]>`
    WITH s AS (
      SELECT "sessionHash",
             BOOL_OR("type" = 'page_view') AS "visited",
             BOOL_OR("type" = 'product_view') AS "viewed",
             BOOL_OR("type" = 'add_to_cart') AS "added",
             BOOL_OR("type" = 'add_to_cart' AND "createdAt" < (${matureBefore}::timestamptz AT TIME ZONE 'UTC')) AS "addedLongAgo",
             BOOL_OR("type" = 'checkout_step' AND "target" = 'review') AS "reviewed",
             BOOL_OR("type" = 'checkout_step' AND "target" = 'delivery') AS "delivery",
             BOOL_OR("type" = 'pay_click') AS "pressedPay"
      FROM "StoreAnalyticsEvent"
      WHERE "storeId" = ${storeId} AND "createdAt" >= (${since.toISOString()}::timestamptz AT TIME ZONE 'UTC')
      GROUP BY "sessionHash"
    )
    SELECT COUNT(*) FILTER (WHERE "visited")::int AS "visitors",
           COUNT(*) FILTER (WHERE "viewed")::int AS "productViews",
           COUNT(*) FILTER (WHERE "added")::int AS "cartAdds",
           COUNT(*) FILTER (WHERE "reviewed")::int AS "checkoutStarts",
           COUNT(*) FILTER (WHERE "delivery")::int AS "deliverySelections",
           COUNT(*) FILTER (WHERE "addedLongAgo")::int AS "matureCartAdds",
           COUNT(*) FILTER (WHERE "addedLongAgo" AND NOT "reviewed")::int AS "cartWithoutCheckout",
           COUNT(*) FILTER (WHERE "addedLongAgo" AND NOT "pressedPay")::int AS "cartWithoutPay"
    FROM s`;
  return row ?? EMPTY;
}
```

- [ ] **Step 4: Rewrite `summary` in `apps/api/src/store-growth/store-funnel.service.ts`**

Add `import { funnelSessions } from './funnel-sessions';` under the `PrismaService` import, then replace the whole `async summary(storeId: string, since: Date) { … }` method (lines 31-64) with:

```ts
  /**
   * Step counts come from the G1 analytics events (funnelSessions), with the 24-hour "mature" rule. Paid sessions still
   * come through the order link, the one thing StoreFunnelVisit records now. The two cannot be joined per session
   * (different hashes), so the old "checkout without payment" count is gone.
   */
  async summary(storeId: string, since: Date, now = new Date()) {
    const [steps, paymentCompletions] = await Promise.all([
      funnelSessions(this.prisma, storeId, since, now),
      // Only the server's confirmed live payment status counts; clients cannot submit success.
      this.prisma.storeFunnelVisit.count({ where: { storeId, createdAt: { gte: since }, orders: { some: { paymentIntent: { status: 'SUCCEEDED', livemode: true } } } } }),
    ]);
    const { visitors, productViews, cartAdds, checkoutStarts, deliverySelections, matureCartAdds, cartWithoutCheckout } = steps;
    const rate = (numerator: number, denominator: number) => denominator ? Math.round((numerator / denominator) * 1000) / 10 : 0;
    return {
      visitors,
      productViews,
      cartAdds,
      checkoutStarts,
      deliverySelections,
      paymentCompletions,
      conversionRates: {
        productViewFromVisitor: rate(productViews, visitors),
        cartAddFromProductView: rate(cartAdds, productViews),
        checkoutFromCartAdd: rate(checkoutStarts, cartAdds),
        deliverySelectionFromCheckout: rate(deliverySelections, checkoutStarts),
        paymentFromCheckout: rate(paymentCompletions, checkoutStarts),
      },
      matureCartAdds,
      cartWithoutCheckout,
    };
  }
```

(`store-growth.service.ts:105` keeps calling `summary(storeId, since)`, with no change.)

- [ ] **Step 5: Point the Store Brain at the same counts**

In `apps/api/src/store-knowledge/store-knowledge.ts`, add `import { funnelSessions } from '../store-growth/funnel-sessions';` after the `isPublicStore` import. In `loadStoreKnowledge`:

- delete the line `const visitsSince = { storeId, createdAt: { gte: since } };`;
- change the destructuring to `const [products, categories, collections, orders, steps, reviews, invoicing] = await Promise.all([`;
- replace the four `prisma.storeFunnelVisit.count(...)` lines with:

```ts
    // One definition of each step: the analytics events (spec 2026-10-13-abandoned-carts).
    funnelSessions(prisma, storeId, since, now),
```

- in the `buildStoreKnowledge({...})` call, replace `funnel: { visits, productViews, addedToCart, checkoutsStarted }` with:

```ts
    funnel: { visits: steps.visitors, productViews: steps.productViews, addedToCart: steps.cartAdds, checkoutsStarted: steps.checkoutStarts },
```

- [ ] **Step 6: Run the unit tests to verify they pass**

Run: `cd apps/api && npx jest src/store-growth src/store-knowledge`
Expected: PASS. The old record tests in `store-funnel.service.spec.ts` still pass, because `record` is unchanged until Task 2.

- [ ] **Step 7: Add the real-database test**

In `apps/api/test/store-growth.e2e-spec.ts`, add `import { loadStoreKnowledge } from '../src/store-knowledge/store-knowledge';` under the `EMAIL_PROVIDER` import, and append inside the `describe` (after the last `it`):

```ts
  it('counts each funnel step once per session from the analytics events, for the insights and the Store Brain', async () => {
    const ago = (hours: number) => new Date(Date.now() - hours * 3600000);
    const event = (session: string, type: string, hours: number, target: string | null = null, store = storeId) => ({ storeId: store, sessionHash: session, type, target, device: 'mobile', createdAt: ago(hours) });
    await prisma.storeAnalyticsEvent.createMany({ data: [
      event('A', 'page_view', 48), event('A', 'product_view', 48), event('A', 'add_to_cart', 47), event('A', 'checkout_step', 47, 'review'), event('A', 'checkout_step', 47, 'delivery'), event('A', 'pay_click', 47),
      // Two adds in one session count once; B is old enough and never reached the review.
      event('B', 'page_view', 30), event('B', 'add_to_cart', 30), event('B', 'add_to_cart', 29),
      // C added two hours ago: counted, but not yet "mature".
      event('C', 'page_view', 2), event('C', 'add_to_cart', 2),
      // Before the 30-day period, and another store.
      event('D', 'page_view', 40 * 24), event('E', 'page_view', 2, null, 'another-store'),
    ] });
    const funnel = (await request(app.getHttpServer()).get(`${route}/insights`).set(auth()).expect(200)).body.funnel;
    expect(funnel).toMatchObject({ visitors: 3, productViews: 1, cartAdds: 3, checkoutStarts: 1, deliverySelections: 1, paymentCompletions: 0, matureCartAdds: 2, cartWithoutCheckout: 1 });
    const merchantId = (await prisma.store.findUniqueOrThrow({ where: { id: storeId } })).merchantId;
    expect((await loadStoreKnowledge(prisma, merchantId, storeId))!.performance30d).toMatchObject({ visits: 3, productViews: 1, addedToCart: 3, checkoutsStarted: 1 });
  });
```

- [ ] **Step 8: Run the e2e test**

Run: `cd apps/api && npx jest --config test/jest-e2e.json test/store-growth.e2e-spec.ts`
Expected: PASS (3 tests). If the SQL is wrong, this is the test that catches it.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/store-growth/funnel-sessions.ts apps/api/src/store-growth/store-funnel.service.ts apps/api/src/store-growth/store-funnel.service.spec.ts apps/api/src/store-knowledge/store-knowledge.ts apps/api/src/store-knowledge/store-knowledge.spec.ts apps/api/test/store-growth.e2e-spec.ts
git commit -m "feat(api): funnel steps are counted from the analytics events only, for the insights and the Store Brain"
```

---

### Task 2: One funnel, writes: `/funnel` records only the visit

**Files:**
- Modify: `apps/api/src/store-growth/store-funnel.service.ts` (lines 6-30)
- Test: `apps/api/src/store-growth/store-funnel.service.spec.ts`, `apps/api/test/source-publishing.e2e-spec.ts` (lines 164-182)

**Interfaces:**
- Consumes: nothing new.
- Produces: `StoreFunnelService.record(slug, sessionId, event, method?)` returns `{ token }` for `visit` and `{}` for every other event in `FUNNEL_EVENTS`. `FUNNEL_EVENTS` and its validation are unchanged.

- [ ] **Step 1: Write the failing unit tests**

In `apps/api/src/store-growth/store-funnel.service.spec.ts`, replace the first test, `it('scopes and hashes sessions, and records only the first occurrence on retries', …)`, with these two:

```ts
  it('scopes and hashes the visit session and hands back its order-link token', async () => {
    const prisma = mock(); const service = new StoreFunnelService(prisma as any);
    await expect(service.record('shop', 'anonymous-session', 'visit')).resolves.toEqual({ token: 't'.repeat(32) });
    expect(prisma.storeFunnelVisit.upsert.mock.calls[0][0]).toMatchObject({ where: { storeId_sessionHash: { storeId: 's1', sessionHash: expect.stringMatching(/^[a-f0-9]{64}$/) } }, update: {} });
  });
  it('accepts the step events older stores still post and writes nothing for them', async () => {
    const prisma = mock(); const service = new StoreFunnelService(prisma as any);
    for (const event of ['product_view', 'add_to_cart', 'checkout_started'] as const) await expect(service.record('shop', 's', event)).resolves.toEqual({});
    await expect(service.record('shop', 's', 'delivery_selected', 'pickup')).resolves.toEqual({});
    expect(prisma.store.findFirst).not.toHaveBeenCalled();
    expect(prisma.storeFunnelVisit.upsert).not.toHaveBeenCalled();
    expect(prisma.storeFunnelVisit.updateMany).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/api && npx jest src/store-growth/store-funnel.service.spec.ts`
Expected: FAIL on «accepts the step events…»: `record` still upserts and returns `{ token }`.

- [ ] **Step 3: Implement**

In `apps/api/src/store-growth/store-funnel.service.ts`, delete line 8 (`const fields = { product_view: …, delivery_selected: 'deliverySelectedAt' } as const;`) and replace the whole `record` method with:

```ts
  /**
   * The store page sends only `visit`: its token links a paid order to the session (StoreCheckoutService). Every
   * checkout step is a G1 analytics event since 2026-10-13. A cached older host page still posts the old steps; they
   * are accepted, validated as before, and nothing is written for them. The step columns stay in the table, unwritten.
   */
  async record(slug: string, sessionId: string, event: FunnelEvent, method?: 'delivery' | 'pickup') {
    if (!FUNNEL_EVENTS.includes(event) || event === 'delivery_selected' && !method) throw new BadRequestException('Evento no válido');
    if (event !== 'visit') return {};
    const store = await this.prisma.store.findFirst({ where: { slug, status: 'ACTIVE', sourcePublicationPaused: false, publishedSourceRevision: { not: null } }, select: { id: true } });
    if (!store) throw new NotFoundException('Tienda no publicada');
    const sessionHash = createHash('sha256').update(sessionId).digest('hex');
    const visit = await this.prisma.storeFunnelVisit.upsert({ where: { storeId_sessionHash: { storeId: store.id, sessionHash } }, update: {}, create: { storeId: store.id, sessionHash, token: randomBytes(24).toString('base64url') } }).catch(async error => {
      // Prisma may implement an empty-update upsert as read/create. A concurrent
      // first event can win the unique key; reuse its session instead of failing.
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
      return this.prisma.storeFunnelVisit.findUniqueOrThrow({ where: { storeId_sessionHash: { storeId: store.id, sessionHash } } });
    });
    // A session expires after 24h.
    if (visit.createdAt.getTime() < Date.now() - 86400000) throw new BadRequestException('Sesión caducada');
    return { token: visit.token };
  }
```

- [ ] **Step 4: Run the unit tests to verify they pass**

Run: `cd apps/api && npx jest src/store-growth/store-funnel.service.spec.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Update the e2e test that relied on step writes**

In `apps/api/test/source-publishing.e2e-spec.ts`, replace the whole test `it('deduplicates funnel sessions and counts only server-confirmed live payment completions', …)` (lines 164-182) with:

```ts
  it('links an order to its visit, ignores the old step events, and counts only server-confirmed live payment completions', async () => {
    const sessionId = randomUUID(); const endpoint = `/v1/stores/public/${slug}/funnel`;
    const results = await Promise.all([1,2,3].map(() => request(app.getHttpServer()).post(endpoint).send({sessionId,event:'visit'}).expect(201)));
    expect(new Set(results.map(row=>row.body.token)).size).toBe(1);
    const funnelToken = results[0].body.token;
    // Stores published with an older kit still post steps: accepted, nothing written.
    expect((await request(app.getHttpServer()).post(endpoint).send({sessionId,event:'add_to_cart'}).expect(201)).body).toEqual({});
    await request(app.getHttpServer()).post(endpoint).send({sessionId,event:'checkout_started'}).expect(201);
    await request(app.getHttpServer()).post(endpoint).send({sessionId,event:'delivery_selected',method:'pickup'}).expect(201);
    expect(await prisma.storeFunnelVisit.findFirstOrThrow({where:{token:funnelToken}})).toMatchObject({productViewedAt:null,cartAddedAt:null,checkoutStartedAt:null,deliverySelectedAt:null,fulfillmentMethod:null});
    await request(app.getHttpServer()).post(endpoint).send({sessionId,event:'payment_completed'}).expect(400);
    await request(app.getHttpServer()).post(endpoint).send({sessionId,event:'delivery_selected',address:'Must never be stored'}).expect(400);
    const purchase = (await request(app.getHttpServer()).post(`/v1/stores/public/${slug}/cart-checkout`).send({funnelToken,items:[{paymentLinkId:productId,quantity:1}]}).expect(201)).body;
    const order = await prisma.storeOrder.findUniqueOrThrow({where:{paymentIntentId:purchase.id}});
    expect(order.funnelVisitId).not.toBeNull();
    const summary = async()=> (await request(app.getHttpServer()).get(`/v1/stores/${storeId}/growth/insights`).set(auth()).expect(200)).body.funnel;
    expect(await summary()).toMatchObject({paymentCompletions:0});
    await prisma.paymentIntent.update({where:{id:purchase.id},data:{status:'SUCCEEDED'}});
    expect((await summary()).paymentCompletions).toBe(0);
    await prisma.paymentIntent.update({where:{id:purchase.id},data:{livemode:true}});
    expect((await summary()).paymentCompletions).toBe(1);
    await request(app.getHttpServer()).get(`/v1/stores/${storeId}/growth/insights`).set(auth(foreign)).expect(404);
  });
```

- [ ] **Step 6: Run the e2e test**

Run: `cd apps/api && npx jest --config test/jest-e2e.json test/source-publishing.e2e-spec.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/store-growth/store-funnel.service.ts apps/api/src/store-growth/store-funnel.service.spec.ts apps/api/test/source-publishing.e2e-spec.ts
git commit -m "feat(api): /funnel records only the visit; old step events are accepted and write nothing"
```

---

### Task 3: The store page and the kit stop sending steps to `/funnel`

**Files:**
- Modify: `apps/checkout/src/store-funnel.ts`, `apps/checkout/src/source-storefront.ts:188`, `apps/checkout/src/storefront/product-page.ts:28`, `apps/checkout/src/cart/cart.ts:174-180`, `apps/checkout/src/cart/cart-review-dialog.ts:315,340`, `apps/checkout/src/state.ts:22`, `apps/checkout/src/main.ts:30,183`
- Modify: `packages/storefront-kit/kit/commerce.js:139-145`
- Test: `apps/checkout/test/store-funnel.test.ts`, `apps/checkout/test/source-storefront-analytics.test.ts`, `apps/api/src/storefront-source/source-commerce-analytics.spec.ts`

**Interfaces:**
- Produces: `createStoreFunnel(slug, preview)` returns `{ track(event: 'visit'): void; token(): string | undefined; sessionId(): string | undefined }`. `state.funnelCartCount` is removed.

- [ ] **Step 1: Write the failing checkout tests**

Replace the second and third tests of `apps/checkout/test/store-funnel.test.ts` (lines 12-31) with:

```ts
it('sends the visit once, with no customer fields and no step events, and discards attribution after withdrawal', async () => {
  privacy.save('shop', true);
  const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok:true, json:async()=>({token:'t'.repeat(32)}) } as Response);
  const funnel = createStoreFunnel('shop', false);
  funnel.track('visit'); funnel.track('visit');
  // The checkout steps are G1 analytics events now; a stray old call sends nothing.
  for (const event of ['add_to_cart', 'checkout_started', 'delivery_selected', 'payment_completed']) funnel.track(event as 'visit');
  await vi.waitFor(() => expect(funnel.token()).toBe('t'.repeat(32)));
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(JSON.parse(fetcher.mock.calls[0][1]!.body as string)).toEqual({ sessionId: expect.stringMatching(/^[a-f0-9-]{36}$/), event:'visit' });
  privacy.save('shop', false); expect(funnel.token()).toBeUndefined();
  expect(sessionStorage.getItem('pagosya:funnel:shop')).toBeNull();
});
it('analytics failures never reject or prevent a subsequent retry', async () => {
  privacy.save('offline', true);
  const fetcher = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
  const funnel = createStoreFunnel('offline', false); funnel.track('visit');
  await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
  await Promise.resolve(); funnel.track('visit');
  await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  expect(funnel.token()).toBeUndefined();
});
```

In `apps/checkout/test/source-storefront-analytics.test.ts`, replace line 7 with:

```ts
const funnel = vi.hoisted(() => ({ track: vi.fn(), token: () => undefined, sessionId: () => '3b241101-e2bb-4255-8caf-4136c566a962' }));
vi.mock('../src/store-funnel', () => ({ createStoreFunnel: () => funnel }));
```

and append:

```ts
it('ignores the funnel steps an older store kit still posts: only the visit reaches /funnel', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => site() }));
  funnel.track.mockClear();
  await mountPublishedSource(document.querySelector('#app')!, 'tienda', store, vi.fn(), false);
  const frame = document.querySelector('iframe')!;
  send(frame, { type: 'pagosya:funnel', event: 'add_to_cart' });
  send(frame, { type: 'pagosya:funnel', event: 'delivery_selected', method: 'pickup' });
  expect(funnel.track.mock.calls).toEqual([['visit']]);
});
```

- [ ] **Step 2: Write the failing kit test**

In `apps/api/src/storefront-source/source-commerce-analytics.spec.ts`, add `messages` to `boot`'s return object (`return { w, $, click, flush, events, messages, observed, … }`) and add inside `describe('kit analytics events (hosted stores)', …)`:

```ts
  it('hands the host page no funnel steps: the steps travel as analytics events only', async () => {
    const shop = boot();
    shop.click('[data-add="lamp"]'); shop.click('[data-cart-open]'); shop.click('.cart-drawer [data-checkout]');
    shop.w.dispatchEvent(new shop.w.HashChangeEvent('hashchange'));
    shop.click('[data-checkout-review] [data-pay]');
    await new Promise(resolve => setImmediate(resolve));
    expect(shop.messages.filter(message => message.type === 'pagosya:funnel')).toEqual([]);
    expect(shop.events().map(e => e.type)).toEqual(expect.arrayContaining(['add_to_cart', 'checkout_step', 'pay_click']));
  });
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd apps/checkout && npx vitest run test/store-funnel.test.ts test/source-storefront-analytics.test.ts`
Expected: FAIL. `fetcher` is called with `add_to_cart`, and `funnel.track` receives `['add_to_cart']`.

Run: `cd apps/api && npx jest src/storefront-source/source-commerce-analytics.spec.ts`
Expected: FAIL. `pagosya:funnel` messages for `add_to_cart` and `checkout_started` are present.

- [ ] **Step 4: Implement the checkout side**

Replace `apps/checkout/src/store-funnel.ts` with:

```ts
import { privacy } from './privacy';
import { API_BASE_URL } from './api';
/**
 * Hosted-store analytics stays outside authored pages and never receives customer fields. Only `visit` is sent: its
 * token links a paid order to the session. The checkout steps are G1 analytics events (store-analytics.ts), counted on
 * the server from those events alone (spec 2026-10-13-abandoned-carts).
 */
export function createStoreFunnel(slug: string, preview: boolean) {
  let token: string | undefined, activeId = '', queue = Promise.resolve();
  const sent = new Set<string>();
  const allowed = () => !preview && privacy.analyticsAllowed(slug);
  function session() {
    if (!allowed()) { token = undefined; return; }
    try {
      const key = `pagosya:funnel:${slug}`;
      let saved = JSON.parse(sessionStorage.getItem(key) || 'null');
      if (!saved || saved.expires <= Date.now() || !/^[a-f0-9-]{36}$/.test(saved.id)) saved = { id: crypto.randomUUID(), expires: Date.now() + 30 * 60000 };
      sessionStorage.setItem(key, JSON.stringify(saved));
      if (activeId !== saved.id) { activeId = saved.id; token = undefined; sent.clear(); }
      return saved.id as string;
    } catch { return; }
  }
  function track(event: 'visit') {
    if (event !== 'visit') return;
    const sessionId = session(); if (!sessionId || sent.has(event)) return;
    sent.add(event);
    queue = queue.then(async () => {
      if (!allowed() || sessionId !== activeId) { sent.delete(event); return; }
      try {
        const response = await fetch(`${API_BASE_URL}/stores/public/${encodeURIComponent(slug)}/funnel`, {
          method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId, event }),
          signal: AbortSignal.timeout(2500),
        });
        if (!response.ok) throw new Error();
        const result = await response.json();
        if (allowed() && sessionId === activeId && /^[\w-]{32}$/.test(result.token)) token = result.token;
      } catch { sent.delete(event); /* Analytics must never interrupt buying. */ }
    });
  }
  // The session id is shared with store analytics (G1); the server keys the two hashes differently, so they never join.
  return { track, token: () => { session(); return allowed() ? token : undefined; }, sessionId: () => session() };
}
```

Then remove the step calls:
- `apps/checkout/src/source-storefront.ts:188`: replace `if (data?.type === 'pagosya:funnel') { funnel.track(data.event, data.method); return; }` with `if (data?.type === 'pagosya:funnel') return; // Older kits still post steps; the steps arrive as pagosya:analytics.`
- `apps/checkout/src/storefront/product-page.ts:28`: replace the line with `  if (store.items.some(item => item.id === productId)) state.activeStoreAnalytics?.record({ type: 'product_view', productId, path: 'product.html' });`
- `apps/checkout/src/cart/cart.ts`: in `saveCart`, delete the line `const count = cartCount(); if (count > state.funnelCartCount) state.activeStoreFunnel?.track('add_to_cart');`, and replace `state.funnelCartCount = count; persistCart(store.storeId, cart);` with `persistCart(store.storeId, cart);`.
- `apps/checkout/src/cart/cart-review-dialog.ts:315`: replace with `      if (selectedFulfillment?.fulfillmentMethod) state.activeStoreAnalytics?.record({ type: 'checkout_step', step: 'delivery' });`
- `apps/checkout/src/cart/cart-review-dialog.ts:340`: replace with `  if (!options.preview) state.activeStoreAnalytics?.record({ type: 'checkout_step', step: 'review' });`
- `apps/checkout/src/state.ts`: delete the line `funnelCartCount: 0 as number,`.
- `apps/checkout/src/main.ts`: delete the line `      state.funnelCartCount = cartCount();`, and change line 30 to `import { loadCart, cart } from "./cart/cart";`.

- [ ] **Step 5: Implement the kit side**

In `packages/storefront-kit/kit/commerce.js`, replace lines 139-145, from `  // One moment, two audiences: pagosYa's own funnel (only while hosted in the studio)` through `    if (hosted) parent.postMessage({ type: 'pagosya:funnel', event, ...(method ? { method } : {}) }, '*');`, with:

```js
  // The merchant's measurement tags only: pagosYa's own checkout steps travel as G1 analytics events (analytics()
  // below; spec 2026-10-13-abandoned-carts). Those tags exist only after the shopper accepted statistics — see
  // privacy.js and the gate the API puts in the head — so a missing gtag/fbq/ttq here is that refusal, and the event
  // is dropped rather than queued.
  const PIXEL_EVENTS = { product_view: ['view_item', 'ViewContent'], add_to_cart: ['add_to_cart', 'AddToCart'], checkout_started: ['begin_checkout', 'InitiateCheckout'] };
  const track = (event, method, detail) => {
```

(The rest of `track`, starting at `const names = PIXEL_EVENTS[event];`, stays. Leave the callers alone, since they still feed the pixels.)

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd apps/checkout && npx vitest run test/store-funnel.test.ts test/source-storefront-analytics.test.ts test/source-storefront.test.ts test/source-cart.test.ts test/store-analytics.test.ts && npx tsc -p tsconfig.json`
Expected: PASS, with no type errors (TypeScript would flag any leftover `track('add_to_cart')` call).

Run: `cd apps/api && npx jest src/storefront-source/source-commerce-analytics.spec.ts src/storefront-source/source-commerce-cookies.spec.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/checkout/src/store-funnel.ts apps/checkout/src/source-storefront.ts apps/checkout/src/storefront/product-page.ts apps/checkout/src/cart/cart.ts apps/checkout/src/cart/cart-review-dialog.ts apps/checkout/src/state.ts apps/checkout/src/main.ts apps/checkout/test/store-funnel.test.ts apps/checkout/test/source-storefront-analytics.test.ts packages/storefront-kit/kit/commerce.js apps/api/src/storefront-source/source-commerce-analytics.spec.ts
git commit -m "feat(checkout): the store page sends only the visit to /funnel; steps are analytics events"
```

---

### Task 4: `RetentionService` saves a reminder cart from a payment

**Files:**
- Create: `apps/api/src/retention/reminder-cart.ts`, `apps/api/src/retention/reminder-cart.spec.ts`
- Modify (add only): `apps/api/src/retention/retention.service.ts`: one import line after line 15, and two methods inserted after `attachCheckout` (after line 218)
- Test: create `apps/api/test/reminder-consent.e2e-spec.ts`

**Interfaces:**
- Produces: `export function reminderCart(metadata: unknown): { storeId: string; items: CartItemDto[] } | null`. Task 7 uses it as the "is a store cart" test.
- Produces: `RetentionService.reminderAvailable(intent: { merchantId: string; metadata: unknown }): Promise<boolean>` and `RetentionService.saveCartFromPayment(paymentIntentId: string): Promise<{ saved: boolean; token?: string } | null>` (null when nothing applies). Task 5 calls both.

- [ ] **Step 1: Write the failing unit test** `apps/api/src/retention/reminder-cart.spec.ts`

```ts
import { reminderCart } from './reminder-cart';

const line = { paymentLinkId: 'p1', variantId: 'v1', variantName: 'Doble', extraIds: ['x1', 'x1'], extras: [{ id: 'x1', name: 'Queso', amount: 500 }], name: 'Burger', quantity: 2, unitAmount: 3000 };
describe('reminderCart', () => {
  it('keeps what a saved cart keeps from a store-page cart: ids and quantities, never names or prices', () => {
    expect(reminderCart({ storeId: 's1', cart: [line, { paymentLinkId: 'p2', name: 'Té', quantity: 1, unitAmount: 900 }] })).toEqual({
      storeId: 's1', items: [{ paymentLinkId: 'p1', variantId: 'v1', extraIds: ['x1', 'x1'], quantity: 2 }, { paymentLinkId: 'p2', quantity: 1 }],
    });
  });
  it('is null for anything that is not a store cart: renewals, memberships, cobros and malformed data', () => {
    for (const metadata of [null, [], 'x', { cart: [line] }, { storeId: 's1' }, { storeId: 's1', cart: [] },
      { storeId: 's1', cart: [line], subscription: { subscriptionId: 'sub_1' } }, { storeId: 's1', cart: [line], membership: { productId: 'p1' } },
      { storeId: 's1', businessDocument: { documentId: 'd1' } }, { storeId: 's1', cart: [{ name: 'sin id', quantity: 1 }] }]) expect(reminderCart(metadata)).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/api && npx jest src/retention/reminder-cart.spec.ts`
Expected: FAIL with "Cannot find module './reminder-cart'".

- [ ] **Step 3: Create `apps/api/src/retention/reminder-cart.ts`**

```ts
import type { CartItemDto } from '../payment-links/dto/cart-checkout.dto';

/**
 * The cart of a store-page payment, kept as a saved cart keeps it ({ paymentLinkId, variantId, extraIds, quantity }), or null.
 * Subscription renewals (metadata.subscription) and membership joins (metadata.membership) carry a one-line cart too,
 * but nobody "left" them: they are not store carts. Cobros, debts and appointments carry no cart at all.
 * metadata.storeId is caller-supplied on API payments: whoever uses this must also check the store's merchant.
 */
export function reminderCart(metadata: unknown): { storeId: string; items: CartItemDto[] } | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const value = metadata as Record<string, unknown>;
  if (typeof value.storeId !== 'string' || !Array.isArray(value.cart) || value.subscription || value.membership) return null;
  const items = value.cart.flatMap((entry): CartItemDto[] => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [];
    const line = entry as Record<string, unknown>;
    if (typeof line.paymentLinkId !== 'string' || !Number.isInteger(line.quantity) || (line.quantity as number) < 1) return [];
    const extraIds = Array.isArray(line.extraIds) ? line.extraIds.filter((id): id is string => typeof id === 'string') : [];
    return [{ paymentLinkId: line.paymentLinkId, ...(typeof line.variantId === 'string' ? { variantId: line.variantId } : {}), ...(extraIds.length ? { extraIds } : {}), quantity: line.quantity as number }];
  });
  return items.length ? { storeId: value.storeId, items: items.slice(0, 50) } : null;
}
```

- [ ] **Step 4: Run the unit test to verify it passes**

Run: `cd apps/api && npx jest src/retention/reminder-cart.spec.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing e2e test** `apps/api/test/reminder-consent.e2e-spec.ts`

```ts
import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request = require('supertest');
import { randomBytes } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { RetentionService } from '../src/retention/retention.service';
import { DEFAULT_RETENTION } from '../src/retention/retention.dto';
import { EMAIL_PROVIDER } from '../src/dashboard/tokens';

describe('«Avísame»: a reminder cart saved from the payment form', () => {
  let app: INestApplication, db: PrismaService, service: RetentionService, store: any, product: any, owner: string, otherMerchantId: string;
  const mail = { send: jest.fn(async () => {}) };
  const auth = (value = owner) => ({ Authorization: `Bearer ${value}` });
  const hex = () => randomBytes(8).toString('hex');
  const line = () => ({ paymentLinkId: product.id, name: 'Café', quantity: 2, unitAmount: 1000 });
  const recovery = async (recoveryEnabled: boolean) => {
    const settings = { ...DEFAULT_RETENTION, recoveryEnabled };
    await db.storeRetention.upsert({ where: { storeId: store.id }, create: { storeId: store.id, settings }, update: { settings } });
  };
  /** A store-page cart payment as cart-checkout makes it (cart-checkout itself is throttled to 10 a minute). */
  const cartPayment = (patch: Record<string, unknown> = {}) => db.paymentIntent.create({ data: {
    merchantId: store.merchantId, amount: 2000, currency: 'BOB', clientSecret: `pi_${hex()}_secret_${hex()}`, metadata: { storeId: store.id, cart: [line()] },
    storeOrder: { create: { merchantId: store.merchantId, storeId: store.id, storeName: store.name, amount: 2000, currency: 'BOB', items: [line()] } }, ...patch,
  } as any }); // Loose patches on purpose (status, merchantId, metadata): ts-jest type-checks e2e files.
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(EMAIL_PROVIDER).useValue(mail).compile();
    app = module.createNestApplication(); app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })); await app.init();
    db = app.get(PrismaService); service = app.get(RetentionService);
    for (const name of ['ReminderOwner', 'ReminderOther']) {
      const created = (await request(app.getHttpServer()).post('/v1/merchants').send({ name, email: `${name}@test.example`, settlementMode: 'AGGREGATOR' }).expect(201)).body;
      if (name === 'ReminderOwner') owner = created.testKeys.secretKey; else otherMerchantId = created.merchant.id;
    }
    store = (await request(app.getHttpServer()).post('/v1/stores').set(auth()).send({ name: 'Café Avísame' }).expect(201)).body;
    await db.store.update({ where: { id: store.id }, data: { publicVisibility: true } });
    product = (await request(app.getHttpServer()).post(`/v1/stores/${store.id}/payment_links`).set(auth()).send({ name: 'Café', amount: 1000, currency: 'BOB' }).expect(201)).body;
    await recovery(true);
  });
  afterAll(async () => { await app?.close(); });

  it('saves one cart for the payment’s email, linked to it, under saveCart’s rules', async () => {
    const pi = await cartPayment({ customerEmail: 'ana@example.com', status: 'FAILED' });
    const before = Date.now();
    await expect(service.saveCartFromPayment(pi.id)).resolves.toMatchObject({ saved: true, token: expect.stringMatching(/^[a-f0-9]{64}$/) });
    const carts = await db.storeSavedCart.findMany({ where: { storeId: store.id, email: 'ana@example.com' } });
    expect(carts).toHaveLength(1);
    expect(carts[0]).toMatchObject({ paymentIntentId: pi.id, items: [{ paymentLinkId: product.id, quantity: 2 }], sentAt: null, closedAt: null });
    expect(carts[0].dueAt.getTime()).toBeGreaterThanOrEqual(before + 24 * 3600000 - 1000);
    // Cart consent never subscribes to campaigns.
    expect((await db.storeNewsletterSubscriber.findUniqueOrThrow({ where: { storeId_email: { storeId: store.id, email: 'ana@example.com' } } })).isActive).toBe(false);
  });

  it('follows the one-reminder-a-week cap', async () => {
    await db.storeSavedCart.updateMany({ where: { storeId: store.id, email: 'ana@example.com' }, data: { sentAt: new Date() } });
    const again = await cartPayment({ customerEmail: 'ana@example.com', status: 'FAILED' });
    await expect(service.saveCartFromPayment(again.id)).resolves.toEqual({ saved: false });
    expect(await db.storeSavedCart.count({ where: { storeId: store.id, email: 'ana@example.com' } })).toBe(1);
  });

  it('does nothing without reminders on, an email, a store cart, an unpaid payment, or the store’s own merchant', async () => {
    const none = async (pi: { id: string }) => expect(await service.saveCartFromPayment(pi.id)).toBeNull();
    await none(await cartPayment({ status: 'FAILED' }));
    await none(await cartPayment({ customerEmail: 'paid@example.com', status: 'SUCCEEDED' }));
    await none(await cartPayment({ customerEmail: 'cobro@example.com', metadata: { storeId: store.id, businessDocument: { documentId: 'd1' } } }));
    await none(await cartPayment({ customerEmail: 'renewal@example.com', metadata: { storeId: store.id, cart: [line()], subscription: { subscriptionId: 'sub_1' } } }));
    await none(await cartPayment({ customerEmail: 'spoof@example.com', merchantId: otherMerchantId }));
    await expect(service.reminderAvailable({ merchantId: store.merchantId, metadata: { storeId: store.id, cart: [line()] } })).resolves.toBe(true);
    await expect(service.reminderAvailable({ merchantId: otherMerchantId, metadata: { storeId: store.id, cart: [line()] } })).resolves.toBe(false);
    await recovery(false);
    await none(await cartPayment({ customerEmail: 'off@example.com', status: 'FAILED' }));
    await expect(service.reminderAvailable({ merchantId: store.merchantId, metadata: { storeId: store.id, cart: [line()] } })).resolves.toBe(false);
    await recovery(true);
    expect(await db.storeSavedCart.count({ where: { storeId: store.id, email: { in: ['paid@example.com', 'cobro@example.com', 'renewal@example.com', 'spoof@example.com', 'off@example.com'] } } })).toBe(0);
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `cd apps/api && npx jest --config test/jest-e2e.json test/reminder-consent.e2e-spec.ts`
Expected: FAIL with `service.saveCartFromPayment is not a function`.

- [ ] **Step 7: Add the two methods**

In `apps/api/src/retention/retention.service.ts`, add after line 15 (`import { comebackCode, qualifyingDays, unusedDays } from './retention-policy';`):

```ts
import { reminderCart } from './reminder-cart';
```

and insert right after the `attachCheckout` method (after its closing `}`, before `private async cartPaid`):

```ts
  /** «Avísame» is offered only for a store-page cart of an active store owned by the payment's merchant, with reminders on. */
  async reminderAvailable(intent: { merchantId: string; metadata: unknown }) {
    const cart = reminderCart(intent.metadata);
    if (!cart) return false;
    const store = await this.prisma.store.findFirst({ where: { id: cart.storeId, merchantId: intent.merchantId, status: 'ACTIVE' }, select: { id: true } });
    return Boolean(store && (await this.settings(store.id)).recoveryEnabled);
  }
  /**
   * «Avísame» in the payment form, once the shopper pressed Pagar: remember that payment's cart for one reminder under
   * saveCart's own rules (reminders on, active products, one reminder a week, the subscriber row created inactive) and
   * link it to the payment, so its success closes the cart (cartPaid). A paid payment needs no reminder. Null when
   * nothing applies. The caller runs this outside the payment and never lets it fail the payment.
   */
  async saveCartFromPayment(paymentIntentId: string) {
    const intent = await this.prisma.paymentIntent.findUnique({ where: { id: paymentIntentId }, select: { merchantId: true, status: true, customerEmail: true, metadata: true } });
    const cart = intent ? reminderCart(intent.metadata) : null;
    if (!intent || !cart || !intent.customerEmail || intent.status === 'SUCCEEDED' || !(await this.reminderAvailable(intent))) return null;
    const result = await this.saveCart(cart.storeId, { email: intent.customerEmail, consent: true, items: cart.items } as RetentionCartDto);
    if (!result.saved) return result;
    // saveCart may have refreshed another session's open cart without naming it: link the open one it just wrote.
    const saved = await this.prisma.storeSavedCart.findFirst({ where: { storeId: cart.storeId, email: normalized(intent.customerEmail), sentAt: null, closedAt: null }, orderBy: { updatedAt: 'desc' }, select: { id: true } });
    if (saved) await this.prisma.storeSavedCart.update({ where: { id: saved.id }, data: { paymentIntentId } });
    return result;
  }
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `cd apps/api && npx jest --config test/jest-e2e.json test/reminder-consent.e2e-spec.ts && npx jest src/retention`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/retention/reminder-cart.ts apps/api/src/retention/reminder-cart.spec.ts apps/api/src/retention/retention.service.ts apps/api/test/reminder-consent.e2e-spec.ts
git commit -m "feat(api): retention saves a reminder cart from a store payment under saveCart's rules"
```

---

### Task 5: Confirm carries `reminderConsent`; the session says when to offer it

**Files:**
- Modify: `apps/api/src/payment-intents/dto/confirm-payment-intent.dto.ts` (append one field after `customerLocationAccuracy`, line 116)
- Modify: `apps/api/src/payment-intents/payment-intents.controller.ts` (lines 1-20 and 47-58)
- Modify: `apps/api/src/payment-intents/checkout-session.controller.ts` (lines 1-21 and 41-55)
- Modify: `apps/api/src/payment-intents/payment-intents.module.ts` (import line and `imports` array, line 25)
- Test: `apps/api/src/payment-intents/payment-intents.controller.spec.ts`, `apps/api/test/reminder-consent.e2e-spec.ts`

**Interfaces:**
- Consumes: `RetentionService.reminderAvailable`, `RetentionService.saveCartFromPayment` (Task 4).
- Produces: `ConfirmPaymentIntentDto.reminderConsent?: boolean`, and the checkout session response field `reminderAvailable: boolean`. Task 6 reads both.

- [ ] **Step 1: Write the failing controller tests**

In `apps/api/src/payment-intents/payment-intents.controller.spec.ts`, replace `setup` (lines 4-8) with:

```ts
function setup(documents: unknown = null, retention?: unknown) {
  const paymentIntents = { confirm: jest.fn().mockResolvedValue({ paymentIntent: {}, railResult: {} }) };
  const terms = { resolveBuyerDocuments: jest.fn().mockResolvedValue(documents) };
  return { paymentIntents, terms, controller: new PaymentIntentsController(paymentIntents as any, terms as any, retention as any) };
}
```

and append:

```ts
describe("PaymentIntentsController.confirm with «Avísame»", () => {
  const ticked = { ...dto, reminderConsent: true };

  it("saves the reminder cart after a confirm that did not pay, and only when the shopper ticked it", async () => {
    const retention = { saveCartFromPayment: jest.fn().mockResolvedValue({ saved: true }) };
    const { controller, paymentIntents } = setup(null, retention);
    paymentIntents.confirm.mockResolvedValue({ paymentIntent: { id: "pi_1", status: "REQUIRES_ACTION" }, railResult: {} });
    await controller.confirm("pi_1", dto as any, { headers: {} });
    expect(retention.saveCartFromPayment).not.toHaveBeenCalled();
    await controller.confirm("pi_1", ticked as any, { headers: {} });
    expect(retention.saveCartFromPayment).toHaveBeenCalledWith("pi_1");
    paymentIntents.confirm.mockResolvedValue({ paymentIntent: { id: "pi_1", status: "SUCCEEDED" }, railResult: {} });
    await controller.confirm("pi_1", ticked as any, { headers: {} });
    expect(retention.saveCartFromPayment).toHaveBeenCalledTimes(1);
  });

  it("answers with the payment even when saving the reminder fails", async () => {
    const retention = { saveCartFromPayment: jest.fn().mockRejectedValue(new Error("db down")) };
    const { controller, paymentIntents } = setup(null, retention);
    const outcome = { paymentIntent: { id: "pi_1", status: "REQUIRES_ACTION" }, railResult: { status: "requires_action" } };
    paymentIntents.confirm.mockResolvedValue(outcome);
    await expect(controller.confirm("pi_1", ticked as any, { headers: {} })).resolves.toBe(outcome);
  });
});
```

- [ ] **Step 2: Append the failing HTTP e2e tests** to `apps/api/test/reminder-consent.e2e-spec.ts`, inside the `describe`, after the last `it`:

```ts
  const confirm = (pi: { id: string; clientSecret: string }, body: Record<string, unknown>) => request(app.getHttpServer()).post(`/v1/payment_intents/${pi.id}/confirm`)
    .set({ Authorization: `Bearer ${pi.clientSecret}` }).send({ paymentMethod: { type: 'CARD', token: 'tok_visa_decline' }, customerName: 'Bea', customerEmail: 'Bea@Example.com', customerPhone: '+591 70000002', ...body });

  it('tells the payment form when to offer the box', async () => {
    const session = async (clientSecret: string) => (await request(app.getHttpServer()).post('/v1/checkout/session').send({ clientSecret }).expect(200)).body.reminderAvailable;
    const pi = await cartPayment();
    expect(await session(pi.clientSecret)).toBe(true);
    await recovery(false);
    expect(await session(pi.clientSecret)).toBe(false);
    await recovery(true);
    expect(await session((await cartPayment({ metadata: { storeId: store.id, businessDocument: { documentId: 'd1' } } })).clientSecret)).toBe(false);
  });

  it('saves the reminder when the shopper ticked it and pressed Pagar, and never fails the payment', async () => {
    const ticked = await cartPayment();
    expect((await confirm(ticked, { reminderConsent: true }).expect(201)).body.paymentIntent.status).toBe('FAILED');
    expect(await db.storeSavedCart.findFirst({ where: { storeId: store.id, email: 'bea@example.com' } })).toMatchObject({ paymentIntentId: ticked.id });
    await confirm(await cartPayment(), { customerEmail: 'carlos@example.com' }).expect(201);
    await confirm(await cartPayment(), { customerEmail: 'dora@example.com', reminderConsent: true, paymentMethod: { type: 'CARD', token: 'tok_visa_success' } }).expect(201);
    expect(await db.storeSavedCart.count({ where: { storeId: store.id, email: { in: ['carlos@example.com', 'dora@example.com'] } } })).toBe(0);
    const failing = jest.spyOn(service, 'saveCart').mockRejectedValueOnce(new Error('db down'));
    expect((await confirm(await cartPayment(), { customerEmail: 'eva@example.com', reminderConsent: true }).expect(201)).body.paymentIntent.status).toBe('FAILED');
    expect(failing).toHaveBeenCalled(); failing.mockRestore();
    expect(await db.storeSavedCart.count({ where: { storeId: store.id, email: 'eva@example.com' } })).toBe(0);
    await confirm(await cartPayment(), { reminderConsent: 'yes' }).expect(400);
  });
```

- [ ] **Step 3: Run them to verify they fail**

Run: `cd apps/api && npx jest src/payment-intents/payment-intents.controller.spec.ts`
Expected: FAIL. `saveCartFromPayment` is never called.

Run: `cd apps/api && npx jest --config test/jest-e2e.json test/reminder-consent.e2e-spec.ts`
Expected: FAIL. `reminderAvailable` is `undefined`, and `reminderConsent` gets a 400 ("property reminderConsent should not exist").

- [ ] **Step 4: Add the DTO field**

In `apps/api/src/payment-intents/dto/confirm-payment-intent.dto.ts`, append inside `ConfirmPaymentIntentDto`, after `customerLocationAccuracy?: number;`:

```ts

  @ApiPropertyOptional({ description: "The shopper ticked «Avísame por correo si no termino la compra»: one cart reminder by email if this payment is not completed." })
  @IsOptional()
  @IsBoolean()
  reminderConsent?: boolean;
```

- [ ] **Step 5: Add the hook to the controller**

In `apps/api/src/payment-intents/payment-intents.controller.ts`:
- change line 1 to `import { Body, Controller, Get, Logger, Optional, Param, Post, Query, Req, UseGuards } from "@nestjs/common";`;
- change `import { ApiKeyMode } from "@prisma/client";` to `import { ApiKeyMode, PaymentIntentStatus } from "@prisma/client";`;
- add `import { RetentionService } from "../retention/retention.service";` after the `request-context` import;
- replace the class head and constructor (lines 16-20) with:

```ts
export class PaymentIntentsController {
  private readonly logger = new Logger(PaymentIntentsController.name);
  constructor(
    private readonly paymentIntents: PaymentIntentsService,
    private readonly terms: TermsAcceptanceService,
    /** «Avísame». Optional so a confirm never depends on it. */
    @Optional() private readonly retention?: RetentionService,
  ) {}
```

- replace the body of `confirm` (lines 51-57) with:

```ts
    const documents = await this.terms.resolveBuyerDocuments({ terms: dto.buyerTermsVersion, privacy: dto.buyerPrivacyVersion });
    const context = requestContext(req);
    const outcome = await this.paymentIntents.confirm(
      id,
      dto,
      documents ? { ...documents, ipAddress: context.ipAddress ?? null, userAgent: context.userAgent ?? null } : undefined,
    );
    // «Avísame» (spec 2026-10-13-abandoned-carts): saved only after the payment's own transaction and rail call have
    // finished, and never able to fail it. A paid payment needs no reminder; an error is logged and skipped.
    if (dto.reminderConsent && outcome.paymentIntent.status !== PaymentIntentStatus.SUCCEEDED) {
      await this.retention?.saveCartFromPayment(id).catch((error: Error) => this.logger.warn(`Reminder cart for ${id} not saved: ${error.message}`));
    }
    return outcome;
```

- [ ] **Step 6: Add `reminderAvailable` to the checkout session**

In `apps/api/src/payment-intents/checkout-session.controller.ts`:
- change line 1 to `import { Body, Controller, HttpCode, Optional, Post, Req, UseGuards } from "@nestjs/common";`;
- add `import { RetentionService } from "../retention/retention.service";` after the `InternationalPaymentsService` import;
- replace the constructor with:

```ts
  constructor(
    private readonly paymentIntents: PaymentIntentsService,
    private readonly international: InternationalPaymentsService,
    @Optional() private readonly retention?: RetentionService,
  ) {}
```

- in `sessionResponse`, after the `international: { … },` line, add:

```ts
      // «Avísame» under the email field: a store-page cart of a store with cart reminders on (the form cannot know).
      reminderAvailable: intent.status !== "SUCCEEDED" && (await this.retention?.reminderAvailable(intent)) === true,
```

- [ ] **Step 7: Wire the module**

In `apps/api/src/payment-intents/payment-intents.module.ts`, add `import { RetentionModule } from "../retention/retention.module";` after the `StoreEmailModule` import, and append `RetentionModule` to the `imports` array (after `SettlementModule`). RetentionModule imports only DashboardModule and AuthModule, so this creates no cycle.

- [ ] **Step 8: Run the tests to verify they pass**

Run: `cd apps/api && npx jest src/payment-intents/payment-intents.controller.spec.ts && npx jest --config test/jest-e2e.json test/reminder-consent.e2e-spec.ts && npx tsc --noEmit -p tsconfig.json`
Expected: PASS, with no type errors.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/payment-intents/dto/confirm-payment-intent.dto.ts apps/api/src/payment-intents/payment-intents.controller.ts apps/api/src/payment-intents/payment-intents.controller.spec.ts apps/api/src/payment-intents/checkout-session.controller.ts apps/api/src/payment-intents/payment-intents.module.ts apps/api/test/reminder-consent.e2e-spec.ts
git commit -m "feat(api): confirm takes reminderConsent and saves the cart after the payment; the session says when to offer it"
```

---

### Task 6: The «Avísame» box in the payment form

**Files:**
- Create: `apps/checkout/src/checkout/reminder-consent.ts`, `apps/checkout/src/checkout/reminder-consent.test.ts`
- Modify: `apps/checkout/src/api.ts` (`CheckoutSession` lines 9-28; `CustomerContact` and `confirmPaymentIntent` ~515-555)
- Modify: `apps/checkout/src/checkout/payment-form.ts` (session reset ~123-129, the store email field ~164-169, the email listener ~273, the submit payload ~372-376)
- Modify: `apps/checkout/src/style.css` (after line 764)
- Test: `apps/checkout/test/payment-form.test.ts`

**Interfaces:**
- Consumes: the session's `reminderAvailable` and the API's `reminderConsent` (Task 5).
- Produces: `reminderConsentHtml(available: boolean, checked: boolean, email: string): string`, `REMINDER_CONSENT_LABEL`, and `CustomerContact.reminderConsent?: boolean`.

- [ ] **Step 1: Write the failing tests**

Create `apps/checkout/src/checkout/reminder-consent.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { REMINDER_CONSENT_LABEL, reminderConsentHtml } from "./reminder-consent";

describe("reminderConsentHtml", () => {
  it("renders nothing when it is not offered", () => {
    expect(reminderConsentHtml(false, true, "ana@example.com")).toBe("");
  });
  it("is unticked by default and disabled until there is an email", () => {
    const empty = reminderConsentHtml(true, false, " ");
    expect(empty).toContain('id="reminderConsent"'); expect(empty).toContain(" disabled"); expect(empty).not.toContain(" checked");
    expect(empty).toContain(REMINDER_CONSENT_LABEL);
    expect(reminderConsentHtml(true, true, " ")).not.toContain(" checked");
    const typed = reminderConsentHtml(true, true, "ana@example.com");
    expect(typed).not.toContain(" disabled"); expect(typed).toContain(" checked");
  });
});
```

Append to `apps/checkout/test/payment-form.test.ts`:

```ts
describe("«Avísame» reminder box", () => {
  beforeEach(() => { vi.restoreAllMocks(); });
  const cart = { storeId: "s1", cart: [{ paymentLinkId: "item_1", name: "Café", quantity: 1, unitAmount: 5000 }] };
  const type = (id: string, value: string) => { const input = document.querySelector<HTMLInputElement>(id)!; input.value = value; input.dispatchEvent(new Event("input")); };

  it("is offered only for a store cart whose store has reminders on", async () => {
    mockSession({ metadata: cart, reminderAvailable: false });
    await loadCheckout("/?client_secret=pi_1_secret_abc");
    expect(document.querySelector("#reminderConsent")).toBeNull();
    mockSession({ metadata: null, reminderAvailable: true });
    await loadCheckout("/?client_secret=pi_1_secret_abc");
    expect(document.querySelector("#reminderConsent")).toBeNull();
  });

  it("sits under the email, unticked, disabled until there is an email, and unticks when the email is cleared", async () => {
    mockSession({ metadata: cart, reminderAvailable: true });
    await loadCheckout("/?client_secret=pi_1_secret_abc");
    const box = document.querySelector<HTMLInputElement>("#reminderConsent")!;
    expect(box.closest(".field")?.querySelector("#customerEmail")).toBeTruthy();
    expect(box.closest("label")?.textContent).toContain("Avísame por correo si no termino la compra");
    expect(box.checked).toBe(false); expect(box.disabled).toBe(true);
    type("#customerEmail", "ana@example.com");
    expect(box.disabled).toBe(false);
    box.click(); expect(box.checked).toBe(true);
    type("#customerEmail", "");
    expect(box.disabled).toBe(true); expect(box.checked).toBe(false);
  });

  it("sends reminderConsent with the confirm only when ticked", async () => {
    const confirmBodies: Record<string, unknown>[] = [];
    vi.doMock("../src/api", async () => {
      const actual = await vi.importActual<typeof import("../src/api")>("../src/api");
      return { ...actual, assetUrl: (p: string | null) => p, fetchSession: vi.fn().mockResolvedValue({
        id: "pi_1", amount: 5000, currency: "BOB", status: "REQUIRES_PAYMENT_METHOD", description: "Café", merchantName: "Casa Luz",
        metadata: cart, recipient: null, trackingToken: null, reminderAvailable: true,
      } satisfies CheckoutSession) };
    });
    vi.stubGlobal("fetch", vi.fn((url: string, init?: RequestInit) => {
      if (String(url).endsWith("/payment_intents/pi_1/confirm")) confirmBodies.push(JSON.parse(String(init?.body)));
      return Promise.resolve(new Response(JSON.stringify({ statusCode: 500, message: "network down" }), { status: 500 }));
    }));
    for (const tick of [false, true]) {
      await loadCheckout("/?client_secret=pi_1_secret_abc");
      type("#customerName", "Ana Rojas"); type("#customerEmail", "ana@example.com"); type("#customerPhone", "+591 70000000");
      if (tick) document.querySelector<HTMLInputElement>("#reminderConsent")!.click();
      document.querySelector<HTMLButtonElement>("#pay")!.click();
      await vi.waitFor(() => { if (confirmBodies.length < (tick ? 2 : 1)) throw new Error("not sent yet"); });
    }
    expect(confirmBodies[0]).not.toHaveProperty("reminderConsent");
    expect(confirmBodies[1]).toMatchObject({ customerEmail: "ana@example.com", reminderConsent: true });
    vi.unstubAllGlobals();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd apps/checkout && npx vitest run src/checkout/reminder-consent.test.ts test/payment-form.test.ts`
Expected: FAIL. The module `./reminder-consent` is missing, there is no `#reminderConsent`, and `reminderAvailable` is not in `CheckoutSession` (vitest does not typecheck, so this last one fails at runtime only).

- [ ] **Step 3: Create `apps/checkout/src/checkout/reminder-consent.ts`**

```ts
/**
 * «Avísame» (spec 2026-10-13-abandoned-carts): under the email field of a store-cart payment whose store has cart
 * reminders on (the API decides: CheckoutSession.reminderAvailable). Unticked by default and disabled until there is
 * an email to write to; it takes effect when the shopper presses Pagar.
 */
export const REMINDER_CONSENT_LABEL = "Avísame por correo si no termino la compra";

export function reminderConsentHtml(available: boolean, checked: boolean, email: string): string {
  if (!available) return "";
  const enabled = Boolean(email.trim());
  return `<label class="reminder-consent" for="reminderConsent"><input id="reminderConsent" type="checkbox"${checked && enabled ? " checked" : ""}${enabled ? "" : " disabled"}><span>${REMINDER_CONSENT_LABEL}</span></label>`;
}
```

- [ ] **Step 4: Extend the API client**

In `apps/checkout/src/api.ts`:
- in `interface CheckoutSession`, after `international?: { available: boolean };`, add:

```ts
  /** «Avísame» may be offered: a store-cart payment of a store with cart reminders on. */
  reminderAvailable?: boolean;
```

- in `interface CustomerContact`, after `customerLocationAccuracy?: number;`, add:

```ts
  /** «Avísame»: one cart reminder by email if this payment is not completed. */
  reminderConsent?: boolean;
```

- in `confirmPaymentIntent`'s body, after `customerLocationAccuracy: customer.customerLocationAccuracy,`, add:

```ts
      ...(customer.reminderConsent && customerEmail ? { reminderConsent: true } : {}),
```

- [ ] **Step 5: Render the box and keep its state**

In `apps/checkout/src/checkout/payment-form.ts`:
- add `import { reminderConsentHtml } from "./reminder-consent";` after the `./customer-contact` import (line 14);
- inside `if (state.fulfillmentSessionId !== session.id) {` (line ~123), add as its first statement:

```ts
    customerContact.reminderConsent = false; // A new payment asks again.
```

- in the store-checkout email field, replace

```ts
            ${fieldError("customerEmail")}
          </div>
          <div class="field">
            <label for="customerPhone">
```

with

```ts
            ${fieldError("customerEmail")}
            ${reminderConsentHtml(Boolean(session.reminderAvailable), Boolean(customerContact.reminderConsent), customerContact.email)}
          </div>
          <div class="field">
            <label for="customerPhone">
```

- replace `  emailInput?.addEventListener("input", () => (customerContact.email = emailInput.value));` with:

```ts
  const reminderBox = app.querySelector<HTMLInputElement>("#reminderConsent");
  emailInput?.addEventListener("input", () => {
    customerContact.email = emailInput.value;
    // «Avísame» needs an address to write to.
    if (!reminderBox) return;
    reminderBox.disabled = !emailInput.value.trim();
    if (reminderBox.disabled) { reminderBox.checked = false; customerContact.reminderConsent = false; }
  });
  reminderBox?.addEventListener("change", () => (customerContact.reminderConsent = reminderBox.checked));
```

- in the `submitPayment(session, clientSecret, token, { … })` call, after `      phone: storeCheckout ? phone : recipient?.phone ?? "",`, add:

```ts
      ...(storeCheckout && session.reminderAvailable && customerContact.reminderConsent && email ? { reminderConsent: true } : {}),
```

- [ ] **Step 6: Style it**

In `apps/checkout/src/style.css`, after line 764 (`.delivery-request-toggle input { … }`), add:

```css
.reminder-consent { display: flex; align-items: center; gap: 8px; margin-top: 8px; font-size: .8rem; line-height: 1.35; cursor: pointer; }
.reminder-consent input { flex: none; width: 18px; height: 18px; accent-color: var(--debt-ink); }
.reminder-consent:has(input:disabled) { opacity: .55; cursor: default; }
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `cd apps/checkout && npx vitest run src/checkout/reminder-consent.test.ts test/payment-form.test.ts && npx tsc -p tsconfig.json`
Expected: PASS, with no type errors.

- [ ] **Step 8: Commit**

```bash
git add apps/checkout/src/checkout/reminder-consent.ts apps/checkout/src/checkout/reminder-consent.test.ts apps/checkout/src/api.ts apps/checkout/src/checkout/payment-form.ts apps/checkout/src/style.css apps/checkout/test/payment-form.test.ts
git commit -m "feat(checkout): «Avísame» under the email field sends reminderConsent with Pagar"
```

---

### Task 7: `GET /v1/stores/:storeId/abandoned-carts`

**Files:**
- Create: `apps/api/src/store-growth/abandoned-carts.ts`, `apps/api/src/store-growth/abandoned-carts.spec.ts`
- Create: `apps/api/src/store-growth/abandoned-carts.service.ts`, `apps/api/src/store-growth/abandoned-carts.controller.ts`
- Modify: `apps/api/src/store-growth/store-growth.module.ts`
- Test: create `apps/api/test/abandoned-carts.e2e-spec.ts`

**Interfaces:**
- Consumes: `funnelSessions(...).cartWithoutPay` (Task 1), `reminderCart` (Task 4).
- Produces: the response `{ anonymousSessions: number; carts: AbandonedCart[] }`, where `AbandonedCart = { key: string; source: 'payment' | 'saved'; name: string | null; email: string | null; phone: string | null; items: { name: string; variant: string | null; quantity: number }[]; total: number; currency: string; leftAt: string; reminder: 'scheduled' | 'sent' | 'none'; recoverUrl: string | null; storeUrl: string }`. Tasks 8 and 9 render it.

- [ ] **Step 1: Write the failing unit test** `apps/api/src/store-growth/abandoned-carts.spec.ts`

```ts
import { buildAbandonedCarts, orderLines, personKey, phoneKey, savedCartLines, type AttemptInput, type SavedInput } from './abandoned-carts';

const at = (hours: number) => new Date(Date.parse('2026-10-13T12:00:00Z') - hours * 3600000);
const attempt = (patch: Partial<AttemptInput>): AttemptInput => ({ paymentIntentId: 'pi', name: null, email: null, phone: null, items: [{ name: 'Café', variant: null, quantity: 2 }], total: 2000, currency: 'BOB', leftAt: at(3), ...patch });
const saved = (patch: Partial<SavedInput>): SavedInput => ({ id: 'c', token: 't', email: 'x@example.com', name: null, phone: null, paymentIntentId: null, items: [{ name: 'Té', variant: null, quantity: 1 }], total: 900, currency: 'BOB', leftAt: at(2), sentAt: null, paymentSucceeded: false, ...patch });
const build = (input: Partial<Parameters<typeof buildAbandonedCarts>[0]>) => buildAbandonedCarts({ attempts: [], saved: [], paid: [], recoveryOn: true, storeUrl: 'https://pay.test/s/luz', recoverUrl: token => `https://pay.test/s/luz?recover=${token}`, ...input });

describe('abandoned carts', () => {
  it('merges a saved cart into the payment it led to, and keeps one row per person: the latest, newest first', () => {
    const rows = build({
      attempts: [attempt({ paymentIntentId: 'pi_old', email: 'ana@example.com', leftAt: at(5) }), attempt({ paymentIntentId: 'pi_new', name: 'Ana', email: 'ANA@example.com', leftAt: at(3) }), attempt({ paymentIntentId: 'pi_carla', email: 'carla@example.com', leftAt: at(6) })],
      saved: [saved({ id: 'c1', token: 'tok1', email: 'carla@example.com', paymentIntentId: 'pi_carla', sentAt: at(1), leftAt: at(6) }), saved({ id: 'c2', token: 'tok2', email: 'bruno@example.com', leftAt: at(2) })],
    });
    expect(rows.map(row => [row.key, row.source, row.reminder, row.recoverUrl])).toEqual([
      ['email:bruno@example.com', 'saved', 'scheduled', 'https://pay.test/s/luz?recover=tok2'],
      ['email:ana@example.com', 'payment', 'none', null],
      ['email:carla@example.com', 'payment', 'sent', 'https://pay.test/s/luz?recover=tok1'],
    ]);
    expect(rows[1]).toMatchObject({ name: 'Ana', leftAt: at(3).toISOString(), storeUrl: 'https://pay.test/s/luz', total: 2000, currency: 'BOB' });
  });
  it('drops a person who paid after leaving, by email in any case or by phone with or without 591, and a saved cart whose own payment went through', () => {
    const rows = build({
      attempts: [attempt({ paymentIntentId: 'a', email: 'dora@example.com' }), attempt({ paymentIntentId: 'b', phone: '70000009' }), attempt({ paymentIntentId: 'c', email: 'before@example.com' })],
      saved: [saved({ id: 'own', email: 'own@example.com', paymentIntentId: 'paid_pi', paymentSucceeded: true })],
      paid: [{ email: 'DORA@example.com', phone: null, paidAt: at(1) }, { email: null, phone: '+591 7000 0009', paidAt: at(1) }, { email: 'before@example.com', phone: null, paidAt: at(5) }],
    });
    expect(rows.map(row => row.key)).toEqual(['email:before@example.com']);
  });
  it('says there is no reminder for an unsent cart while reminders are off', () => {
    expect(build({ saved: [saved({}), saved({ id: 'c2', email: 'y@example.com', sentAt: at(1), leftAt: at(4) })], recoveryOn: false }).map(row => row.reminder)).toEqual(['none', 'sent']);
  });
  it('leaves out a payment with no usable way to reach the person', () => {
    expect(build({ attempts: [attempt({ phone: '12' })] })).toEqual([]);
  });
});

describe('people and lines', () => {
  it('reads one person from an email in any case or a phone with or without 591', () => {
    expect(personKey(' Ana@Example.com ', '70000001')).toBe('email:ana@example.com');
    expect(personKey(null, '+591 7000-0001')).toBe('phone:70000001');
    expect(phoneKey('+54 9 11 5555 5555')).toBe('5491155555555');
    expect(personKey(null, '')).toBeNull();
  });
  it('shows an order line by name, option and quantity', () => {
    expect(orderLines([{ paymentLinkId: 'p1', name: 'Café', variantName: 'Grande', quantity: 2, unitAmount: 1000 }, { name: 'roto' }, 'x'])).toEqual([{ name: 'Café', variant: 'Grande', quantity: 2 }]);
    expect(orderLines(null)).toEqual([]);
  });
  it('prices a saved cart from today’s catalog with its option and extras, and survives a removed product', () => {
    const products = new Map([['p1', { id: 'p1', name: 'Burger', amount: 3000, currency: 'BOB', variants: [{ id: 'v1', name: 'Doble', amount: 4000 }], extras: [{ id: 'x1', name: 'Queso', amount: 500, required: false }] }]]);
    expect(savedCartLines([{ paymentLinkId: 'p1', variantId: 'v1', extraIds: ['x1', 'x1'], quantity: 2 }, { paymentLinkId: 'gone', quantity: 1 }], products)).toEqual({
      items: [{ name: 'Burger', variant: 'Doble', quantity: 2 }, { name: 'Producto', variant: null, quantity: 1 }], total: 10000, currency: 'BOB',
    });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/api && npx jest src/store-growth/abandoned-carts.spec.ts`
Expected: FAIL with "Cannot find module './abandoned-carts'".

- [ ] **Step 3: Create `apps/api/src/store-growth/abandoned-carts.ts`**

```ts
/**
 * Crecer › Carritos abandonados (spec 2026-10-13-abandoned-carts): the rows, from what the service read. Pure, so the
 * rules (merge, one row per person, who paid later) are unit-tested without a database.
 */
export type CartLine = { name: string; variant: string | null; quantity: number };
export type CartReminder = 'scheduled' | 'sent' | 'none';
export type AbandonedCart = {
  key: string; source: 'payment' | 'saved'; name: string | null; email: string | null; phone: string | null;
  items: CartLine[]; total: number; currency: string; leftAt: string; reminder: CartReminder; recoverUrl: string | null; storeUrl: string;
};
/** Kind 1: a live store-cart payment confirmed (Pagar pressed) at least an hour ago and not paid. */
export type AttemptInput = { paymentIntentId: string; name: string | null; email: string | null; phone: string | null; items: CartLine[]; total: number; currency: string; leftAt: Date };
/** Kind 2: an open saved cart. paymentSucceeded: the payment it was linked to went through (any mode). */
export type SavedInput = { id: string; token: string; email: string; name: string | null; phone: string | null; paymentIntentId: string | null; items: CartLine[]; total: number; currency: string; leftAt: Date; sentAt: Date | null; paymentSucceeded: boolean };
/** A live paid payment of this store. paidAt is the payment's updatedAt, as RetentionService.cartPaid reads it. */
export type PaidInput = { email: string | null; phone: string | null; paidAt: Date };
export type ProductPrice = { id: string; name: string; amount: number; currency: string; variants: unknown; extras: unknown };

const emailKey = (email: string | null | undefined) => email?.trim().toLowerCase() || null;
/** Digits without Bolivia's 591, so «+591 7000 0001» and «70000001» are one person. */
export function phoneKey(phone: string | null | undefined): string | null {
  let digits = String(phone || '').replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('591')) digits = digits.slice(3);
  return digits.length >= 7 ? digits : null;
}
/** One row per person: the lower-cased email, else the phone digits. */
export function personKey(email: string | null | undefined, phone: string | null | undefined): string | null {
  const byEmail = emailKey(email);
  if (byEmail) return `email:${byEmail}`;
  const byPhone = phoneKey(phone);
  return byPhone ? `phone:${byPhone}` : null;
}

const records = (value: unknown): Record<string, unknown>[] => Array.isArray(value) ? value.filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === 'object' && !Array.isArray(entry)) : [];

/** An order's cart snapshot as the merchant reads it: name, option and quantity. */
export function orderLines(items: unknown): CartLine[] {
  return records(items).flatMap((line): CartLine[] => typeof line.name === 'string' && Number.isInteger(line.quantity)
    ? [{ name: line.name, variant: typeof line.variantName === 'string' ? line.variantName : null, quantity: line.quantity as number }] : []);
}

type SavedItem = { paymentLinkId: string; variantId?: string; extraIds: string[]; quantity: number };
/** A saved cart's items as stored: { paymentLinkId, variantId?, extraIds?, quantity }. */
export function savedItems(items: unknown): SavedItem[] {
  return records(items).flatMap((item): SavedItem[] => typeof item.paymentLinkId === 'string' && Number.isInteger(item.quantity)
    ? [{ paymentLinkId: item.paymentLinkId, ...(typeof item.variantId === 'string' ? { variantId: item.variantId } : {}), extraIds: Array.isArray(item.extraIds) ? item.extraIds.filter((id): id is string => typeof id === 'string') : [], quantity: item.quantity as number }] : []);
}

/** A saved cart keeps ids only: names and today's prices come from the catalog; a removed product shows as «Producto». */
export function savedCartLines(items: unknown, products: Map<string, ProductPrice>): { items: CartLine[]; total: number; currency: string } {
  let total = 0, currency = 'BOB';
  const lines = savedItems(items).map((item): CartLine => {
    const product = products.get(item.paymentLinkId);
    if (!product) return { name: 'Producto', variant: null, quantity: item.quantity };
    currency = product.currency;
    const variant = records(product.variants).find(entry => entry.id === item.variantId);
    const extras = records(product.extras);
    const extrasAmount = item.extraIds.reduce((sum, id) => { const extra = extras.find(entry => entry.id === id); return sum + (typeof extra?.amount === 'number' ? extra.amount : 0); }, 0);
    total += ((typeof variant?.amount === 'number' ? variant.amount : product.amount) + extrasAmount) * item.quantity;
    return { name: product.name, variant: typeof variant?.name === 'string' ? variant.name : null, quantity: item.quantity };
  });
  return { items: lines, total, currency };
}

export function buildAbandonedCarts(input: { attempts: AttemptInput[]; saved: SavedInput[]; paid: PaidInput[]; recoveryOn: boolean; storeUrl: string; recoverUrl: (token: string) => string }): AbandonedCart[] {
  // An unsent cart is "programado" only while the store's reminders are on; the worker would close it otherwise.
  const reminder = (cart: SavedInput): CartReminder => cart.sentAt ? 'sent' : input.recoveryOn ? 'scheduled' : 'none';
  const byPayment = new Map(input.saved.flatMap(cart => cart.paymentIntentId ? [[cart.paymentIntentId, cart] as const] : []));
  const merged = new Set<string>();
  type Row = Omit<AbandonedCart, 'key' | 'leftAt' | 'storeUrl'> & { at: Date };
  const rows: Row[] = input.attempts.map((attempt): Row => {
    const cart = byPayment.get(attempt.paymentIntentId);
    if (cart) merged.add(cart.id);
    return { source: 'payment', name: attempt.name, email: attempt.email ?? cart?.email ?? null, phone: attempt.phone, items: attempt.items, total: attempt.total, currency: attempt.currency, at: attempt.leftAt, reminder: cart ? reminder(cart) : 'none', recoverUrl: cart ? input.recoverUrl(cart.token) : null };
  });
  for (const cart of input.saved) {
    if (merged.has(cart.id) || cart.paymentSucceeded) continue;
    rows.push({ source: 'saved', name: cart.name, email: cart.email, phone: cart.phone, items: cart.items, total: cart.total, currency: cart.currency, at: cart.leftAt, reminder: reminder(cart), recoverUrl: input.recoverUrl(cart.token) });
  }
  // Whoever paid in this store after leaving is not abandoned (cartPaid's rule, by email or phone).
  const paidLater = (row: Row) => input.paid.some(payment => payment.paidAt >= row.at && (
    (emailKey(row.email) !== null && emailKey(row.email) === emailKey(payment.email)) || (phoneKey(row.phone) !== null && phoneKey(row.phone) === phoneKey(payment.phone))));
  const people = new Map<string, Row>();
  for (const row of rows.filter(row => !paidLater(row)).sort((a, b) => b.at.getTime() - a.at.getTime())) {
    const key = personKey(row.email, row.phone);
    if (key && !people.has(key)) people.set(key, row);
  }
  return [...people].map(([key, { at, ...row }]) => ({ key, ...row, leftAt: at.toISOString(), storeUrl: input.storeUrl }));
}
```

- [ ] **Step 4: Run the unit test to verify it passes**

Run: `cd apps/api && npx jest src/store-growth/abandoned-carts.spec.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Write the failing e2e test** `apps/api/test/abandoned-carts.e2e-spec.ts`

```ts
import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request = require('supertest');
import { randomBytes, randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { DEFAULT_RETENTION } from '../src/retention/retention.dto';
import { EMAIL_PROVIDER } from '../src/dashboard/tokens';

describe('Crecer › Carritos abandonados', () => {
  let app: INestApplication, db: PrismaService, store: any, product: any, owner: string, other: string;
  const auth = (value = owner) => ({ Authorization: `Bearer ${value}` });
  const list = (days: number | string = 7, value = owner) => request(app.getHttpServer()).get(`/v1/stores/${store.id}/abandoned-carts?days=${days}`).set(auth(value));
  const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3600000);
  const items = () => [{ paymentLinkId: product.id, name: 'Café', variantName: 'Grande', quantity: 2, unitAmount: 1000 }];
  /** A live store-cart payment the shopper confirmed, `hours` ago. */
  const attempt = (hours: number, data: Record<string, unknown>) => {
    const at = hoursAgo(hours);
    return db.paymentIntent.create({ data: {
      merchantId: store.merchantId, amount: 2000, currency: 'BOB', clientSecret: randomUUID(), livemode: true, status: 'FAILED', confirmationAttempts: 1, createdAt: at, updatedAt: at,
      metadata: { storeId: store.id, cart: items() }, storeOrder: { create: { merchantId: store.merchantId, storeId: store.id, storeName: store.name, amount: 2000, currency: 'BOB', items: items(), createdAt: at } }, ...data,
    } as any }); // Loose patches on purpose: ts-jest type-checks e2e files.
  };
  const paid = (data: Record<string, unknown>) => db.paymentIntent.create({ data: {
    merchantId: store.merchantId, amount: 1000, currency: 'BOB', clientSecret: randomUUID(), livemode: true, status: 'SUCCEEDED', metadata: { storeId: store.id, cart: items() },
    storeOrder: { create: { merchantId: store.merchantId, storeId: store.id, storeName: store.name, amount: 1000, currency: 'BOB', items: items() } }, ...data,
  } as any });
  const saved = (hours: number, email: string, data: Record<string, unknown> = {}) => db.storeSavedCart.create({ data: {
    storeId: store.id, email, token: randomBytes(32).toString('hex'), items: [{ paymentLinkId: product.id, quantity: 1 }], dueAt: new Date(Date.now() + 86400000), createdAt: hoursAgo(hours), ...data,
  } as any });
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(EMAIL_PROVIDER).useValue({ send: jest.fn() }).compile();
    app = module.createNestApplication(); app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })); await app.init();
    db = app.get(PrismaService);
    for (const name of ['CartsOwner', 'CartsOther']) {
      const created = (await request(app.getHttpServer()).post('/v1/merchants').send({ name, email: `${name}@test.example`, settlementMode: 'AGGREGATOR' }).expect(201)).body;
      if (name === 'CartsOwner') owner = created.testKeys.secretKey; else other = created.testKeys.secretKey;
    }
    store = (await request(app.getHttpServer()).post('/v1/stores').set(auth()).send({ name: 'Casa Luz' }).expect(201)).body;
    product = (await request(app.getHttpServer()).post(`/v1/stores/${store.id}/payment_links`).set(auth()).send({ name: 'Café', amount: 1000, currency: 'BOB' }).expect(201)).body;
    await db.storeRetention.create({ data: { storeId: store.id, settings: { ...DEFAULT_RETENTION, recoveryEnabled: true } } });
  });
  afterAll(async () => { await app?.close(); });

  it('lists who pressed Pagar and who saved a cart, one row per person, newest first', async () => {
    await attempt(5, { customerName: 'Ana Rojas', customerEmail: 'ana@example.com', customerPhone: '70000001' });
    await attempt(3, { customerName: 'Ana Rojas', customerEmail: 'ana@example.com', customerPhone: '70000001' });
    const bruno = await saved(2, 'bruno@example.com');
    await attempt(4, { customerPhone: '+591 70000003' });
    const carla = await attempt(6, { customerName: 'Carla', customerEmail: 'carla@example.com' });
    const carlaCart = await saved(6, 'carla@example.com', { paymentIntentId: carla.id, sentAt: hoursAgo(1) });
    const body = (await list().expect(200)).body;
    expect(body.carts.map((c: any) => [c.source, c.name ?? c.email ?? c.phone, c.reminder])).toEqual([
      ['saved', 'bruno@example.com', 'scheduled'], ['payment', 'Ana Rojas', 'none'], ['payment', '+591 70000003', 'none'], ['payment', 'Carla', 'sent'],
    ]);
    expect(body.carts[0]).toMatchObject({ items: [{ name: 'Café', variant: null, quantity: 1 }], total: 1000, currency: 'BOB', recoverUrl: expect.stringContaining(`recover=${bruno.token}`), storeUrl: expect.stringContaining(`/s/${store.slug}`) });
    expect(body.carts[1]).toMatchObject({ phone: '70000001', items: [{ name: 'Café', variant: 'Grande', quantity: 2 }], total: 2000, recoverUrl: null });
    expect(body.carts[3].recoverUrl).toContain(`recover=${carlaCart.token}`);
  });

  it('drops paid people, test, unconfirmed or too recent payments, renewals, closed carts and anything past the period', async () => {
    await attempt(3, { customerEmail: 'test@example.com', livemode: false });
    await attempt(3, { customerEmail: 'unconfirmed@example.com', confirmationAttempts: 0 });
    await attempt(0.5, { customerEmail: 'recent@example.com' });
    await attempt(3, { customerEmail: 'renewal@example.com', metadata: { storeId: store.id, cart: items(), subscription: { subscriptionId: 'sub_1' } } });
    await attempt(3, { customerEmail: 'dora@example.com' }); await paid({ customerEmail: 'DORA@example.com' });
    await attempt(3, { customerPhone: '70000009' }); await paid({ customerPhone: '+591 7000 0009' });
    await attempt(3, { customerEmail: 'before@example.com' }); await paid({ customerEmail: 'before@example.com', updatedAt: hoursAgo(5) });
    const own = await paid({ livemode: false }); await saved(3, 'own@example.com', { paymentIntentId: own.id });
    await saved(3, 'closed@example.com', { closedAt: new Date() });
    await attempt(10 * 24, { customerEmail: 'tendays@example.com' });
    await attempt(40 * 24, { customerEmail: 'old@example.com' });
    const people = async (days: number) => (await list(days).expect(200)).body.carts.map((c: any) => c.email ?? c.phone);
    const week = await people(7);
    for (const gone of ['test@example.com', 'unconfirmed@example.com', 'recent@example.com', 'renewal@example.com', 'dora@example.com', '70000009', 'own@example.com', 'closed@example.com', 'tendays@example.com', 'old@example.com']) expect(week).not.toContain(gone);
    expect(week).toContain('before@example.com');
    const month = await people(30);
    expect(month).toContain('tendays@example.com'); expect(month).not.toContain('old@example.com');
  });

  it('counts anonymous sessions that added to the cart over a day ago and never pressed Pagar', async () => {
    const event = (session: string, type: string, hours: number, storeId = store.id) => ({ storeId, sessionHash: session, type, device: 'mobile', createdAt: hoursAgo(hours) });
    await db.storeAnalyticsEvent.createMany({ data: [
      event('a', 'page_view', 30), event('a', 'add_to_cart', 30),
      event('b', 'add_to_cart', 30), event('b', 'pay_click', 29),
      event('c', 'add_to_cart', 2),
      event('d', 'add_to_cart', 10 * 24),
      event('e', 'add_to_cart', 30, 'another-store'),
    ] });
    expect((await list(7).expect(200)).body.anonymousSessions).toBe(1);
    expect((await list(30).expect(200)).body.anonymousSessions).toBe(2);
  });

  it('refuses another merchant’s store and unknown periods', async () => {
    await request(app.getHttpServer()).get(`/v1/stores/${store.id}/abandoned-carts?days=7`).expect(401);
    await list(7, other).expect(404);
    await list(90).expect(400);
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `cd apps/api && npx jest --config test/jest-e2e.json test/abandoned-carts.e2e-spec.ts`
Expected: FAIL with 404 (route does not exist).

- [ ] **Step 7: Create the service** `apps/api/src/store-growth/abandoned-carts.service.ts`

```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { reminderCart } from '../retention/reminder-cart';
import { buildAbandonedCarts, orderLines, savedCartLines, savedItems } from './abandoned-carts';
import { funnelSessions } from './funnel-sessions';

export const ABANDONED_CART_PERIODS = [7, 30] as const;
export type AbandonedCartDays = typeof ABANDONED_CART_PERIODS[number];
const HOUR_MS = 3_600_000;
/** Enough for a busy month; the page is a to-do list, not an export. */
const ROWS = 500;

/** Crecer › Carritos abandonados: read-only, owner-scoped, nothing stored (a "Contactado" mark would need state). */
@Injectable()
export class AbandonedCartsService {
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService) {}

  async list(merchantId: string, storeId: string, days: AbandonedCartDays, now = new Date()) {
    const store = await this.prisma.store.findFirst({ where: { id: storeId, merchantId }, select: { id: true, slug: true, customDomains: { where: { status: 'ACTIVE' }, select: { hostname: true }, take: 1 } } });
    if (!store) throw new NotFoundException('Tienda no encontrada');
    const since = new Date(now.getTime() - days * 24 * HOUR_MS);
    const [orders, saved, paid, retention, sessions] = await Promise.all([
      // Kind 1: a live payment the shopper confirmed (pressed Pagar) at least an hour ago, unpaid, with a way to reach them.
      this.prisma.storeOrder.findMany({
        where: { storeId, merchantId, createdAt: { gte: since, lt: new Date(now.getTime() - HOUR_MS) }, paymentIntent: { livemode: true, confirmationAttempts: { gt: 0 }, status: { not: 'SUCCEEDED' }, OR: [{ customerEmail: { not: null } }, { customerPhone: { not: null } }] } },
        orderBy: { createdAt: 'desc' }, take: ROWS,
        select: { items: true, amount: true, currency: true, createdAt: true, paymentIntent: { select: { id: true, customerName: true, customerEmail: true, customerPhone: true, metadata: true } } },
      }),
      // Kind 2: carts saved with consent («¿Prefieres terminar después?» or «Avísame») and still open.
      this.prisma.storeSavedCart.findMany({ where: { storeId, closedAt: null, createdAt: { gte: since } }, orderBy: { createdAt: 'desc' }, take: ROWS, select: { id: true, token: true, email: true, items: true, paymentIntentId: true, createdAt: true, sentAt: true } }),
      // Whoever paid live in this store since: their earlier rows are not abandoned.
      this.prisma.storeOrder.findMany({ where: { storeId, merchantId, paymentIntent: { status: 'SUCCEEDED', livemode: true, updatedAt: { gte: since } } }, take: 5000, select: { paymentIntent: { select: { customerEmail: true, customerPhone: true, updatedAt: true } } } }),
      this.prisma.storeRetention.findUnique({ where: { storeId }, select: { settings: true } }),
      funnelSessions(this.prisma, storeId, since, now),
    ]);
    const linked = saved.flatMap(cart => cart.paymentIntentId ? [cart.paymentIntentId] : []);
    const productIds = [...new Set(saved.flatMap(cart => savedItems(cart.items).map(item => item.paymentLinkId)))];
    const emails = [...new Set(saved.map(cart => cart.email))];
    const [ownPaid, products, subscribers] = await Promise.all([
      linked.length ? this.prisma.paymentIntent.findMany({ where: { id: { in: linked }, status: 'SUCCEEDED' }, select: { id: true } }) : Promise.resolve([]),
      productIds.length ? this.prisma.paymentLink.findMany({ where: { storeId, id: { in: productIds } }, select: { id: true, name: true, amount: true, currency: true, variants: true, extras: true } }) : Promise.resolve([]),
      // A saved cart has only an email; a newsletter profile may add a name and a WhatsApp number.
      emails.length ? this.prisma.storeNewsletterSubscriber.findMany({ where: { storeId, email: { in: emails } }, select: { email: true, name: true, phone: true } }) : Promise.resolve([]),
    ]);
    const paidIds = new Set(ownPaid.map(payment => payment.id));
    const catalog = new Map(products.map(product => [product.id, product]));
    const profiles = new Map(subscribers.map(subscriber => [subscriber.email, subscriber]));
    const carts = buildAbandonedCarts({
      // Renewals and membership joins carry a cart too, but are not store carts.
      attempts: orders.filter(order => reminderCart(order.paymentIntent.metadata)).map(order => ({
        paymentIntentId: order.paymentIntent.id, name: order.paymentIntent.customerName, email: order.paymentIntent.customerEmail, phone: order.paymentIntent.customerPhone,
        items: orderLines(order.items), total: order.amount, currency: order.currency, leftAt: order.createdAt,
      })),
      saved: saved.map(cart => ({
        ...savedCartLines(cart.items, catalog), id: cart.id, token: cart.token, email: cart.email, name: profiles.get(cart.email)?.name ?? null, phone: profiles.get(cart.email)?.phone ?? null,
        paymentIntentId: cart.paymentIntentId, leftAt: cart.createdAt, sentAt: cart.sentAt, paymentSucceeded: paidIds.has(cart.paymentIntentId ?? ''),
      })),
      paid: paid.map(order => ({ email: order.paymentIntent.customerEmail, phone: order.paymentIntent.customerPhone, paidAt: order.paymentIntent.updatedAt })),
      recoveryOn: (retention?.settings as { recoveryEnabled?: unknown } | null | undefined)?.recoveryEnabled === true,
      storeUrl: store.customDomains[0] ? `https://${store.customDomains[0].hostname}` : this.link(store.slug),
      recoverUrl: token => this.link(store.slug, token),
    });
    return { anonymousSessions: sessions.cartWithoutPay, carts };
  }

  /** The same address the reminder email links to (RetentionService.link). */
  private link(slug: string, token?: string) {
    const url = new URL(`/s/${encodeURIComponent(slug)}`, this.config.get<string>('app.checkoutOrigin'));
    if (token) url.searchParams.set('recover', token);
    return url.href;
  }
}
```

- [ ] **Step 8: Create the controller** `apps/api/src/store-growth/abandoned-carts.controller.ts`

```ts
import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { IsIn, IsOptional } from 'class-validator';
import { CurrentMerchant } from '../auth/decorators/current-merchant.decorator';
import { MerchantAuthGuard } from '../dashboard/guards/merchant-auth.guard';
import { AbandonedCartsService, type AbandonedCartDays } from './abandoned-carts.service';

class AbandonedCartsQuery { @IsOptional() @IsIn(['7', '30']) days?: string; }

@Controller('v1/stores/:storeId/abandoned-carts')
@UseGuards(MerchantAuthGuard)
export class AbandonedCartsController {
  constructor(private readonly carts: AbandonedCartsService) {}
  /** Crecer › Carritos abandonados: who left with what, newest first, and how many anonymous sessions did too. */
  @Get() list(@CurrentMerchant() m: { id: string }, @Param('storeId') id: string, @Query() q: AbandonedCartsQuery) {
    return this.carts.list(m.id, id, Number(q.days || 7) as AbandonedCartDays);
  }
}
```

- [ ] **Step 9: Register them** in `apps/api/src/store-growth/store-growth.module.ts`

Add the imports:

```ts
import { AbandonedCartsController } from "./abandoned-carts.controller";
import { AbandonedCartsService } from "./abandoned-carts.service";
```

Change the comment to `/** Storefront visit funnel tracking, the merchant's growth view built on it, and the abandoned-carts list. */`, and change the module body to:

```ts
  controllers: [StoreFunnelController, StoreGrowthController, AbandonedCartsController],
  providers: [StoreFunnelService, StoreGrowthService, AbandonedCartsService],
```

- [ ] **Step 10: Run the tests to verify they pass**

Run: `cd apps/api && npx jest src/store-growth && npx jest --config test/jest-e2e.json test/abandoned-carts.e2e-spec.ts && npx tsc --noEmit -p tsconfig.json`
Expected: PASS, with no type errors.

- [ ] **Step 11: Commit**

```bash
git add apps/api/src/store-growth/abandoned-carts.ts apps/api/src/store-growth/abandoned-carts.spec.ts apps/api/src/store-growth/abandoned-carts.service.ts apps/api/src/store-growth/abandoned-carts.controller.ts apps/api/src/store-growth/store-growth.module.ts apps/api/test/abandoned-carts.e2e-spec.ts
git commit -m "feat(api): GET /stores/:id/abandoned-carts lists unpaid confirmed payments and saved carts, one per person"
```

---

### Task 8: Dashboard helpers for the page

**Files:**
- Create: `apps/merchant-dashboard/src/abandoned-carts.mjs`, `apps/merchant-dashboard/src/abandoned-carts.test.mjs`

**Interfaces:**
- Consumes: the `AbandonedCart` row shape (Task 7); `formatMoney` and `whatsAppShareUrl` from `./cobros.mjs`; `formatCount` from `./growth.mjs`.
- Produces: `SOURCE_LABEL`, `REMINDER_LABEL`, `cartPerson(cart)`, `cartItemsText(items)`, `timeAgo(iso, now?)`, `followUpMessage(cart, storeName)`, `followUpSubject(storeName)`, `whatsAppFollowUpUrl(cart, storeName)`, `mailtoFollowUpUrl(cart, storeName)`, `showsReminder(cart)`, `anonymousLine(count)`.

- [ ] **Step 1: Write the failing test** `apps/merchant-dashboard/src/abandoned-carts.test.mjs`

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { REMINDER_LABEL, SOURCE_LABEL, anonymousLine, cartItemsText, cartPerson, followUpMessage, followUpSubject, mailtoFollowUpUrl, showsReminder, timeAgo, whatsAppFollowUpUrl } from "./abandoned-carts.mjs";

const cart = { key: "email:ana@example.com", source: "payment", name: "Ana Rojas", email: "ana@example.com", phone: "70000001", items: [{ name: "Café", variant: null, quantity: 2 }, { name: "Té", variant: "Grande", quantity: 1 }], total: 2500, currency: "BOB", leftAt: "2026-10-13T09:00:00.000Z", reminder: "none", recoverUrl: null, storeUrl: "https://pay.test/s/casa-luz" };

test("a row is named by name, else email, else phone", () => {
  assert.equal(cartPerson(cart), "Ana Rojas");
  assert.equal(cartPerson({ ...cart, name: " " }), "ana@example.com");
  assert.equal(cartPerson({ ...cart, name: null, email: null }), "70000001");
});

test("items read as product ×n with the option", () => {
  assert.equal(cartItemsText(cart.items), "Café ×2, Té (Grande) ×1");
  assert.equal(cartItemsText(undefined), "");
});

test("time reads like «hace 3 h»", () => {
  const now = new Date("2026-10-13T12:00:00Z");
  assert.equal(timeAgo("2026-10-13T11:58:00Z", now), "hace 2 min");
  assert.equal(timeAgo("2026-10-13T09:00:00Z", now), "hace 3 h");
  assert.equal(timeAgo("2026-10-12T10:00:00Z", now), "hace 1 día");
  assert.equal(timeAgo("2026-10-08T12:00:00Z", now), "hace 5 días");
});

test("the follow-up names the shopper, the items and the store, and links the restore link or else the store", () => {
  assert.equal(followUpMessage(cart, "Casa Luz"), "Hola Ana, vimos que dejaste Café ×2, Té (Grande) ×1 en Casa Luz. ¿Te ayudamos a terminar tu compra? https://pay.test/s/casa-luz");
  assert.equal(followUpMessage({ ...cart, name: null, recoverUrl: "https://pay.test/s/casa-luz?recover=abc" }, "Casa Luz"), "Hola, vimos que dejaste Café ×2, Té (Grande) ×1 en Casa Luz. ¿Te ayudamos a terminar tu compra? https://pay.test/s/casa-luz?recover=abc");
  assert.equal(followUpSubject("Casa Luz"), "Tu carrito en Casa Luz");
});

test("WhatsApp gets 591 for a local number and the message; nothing without a phone", () => {
  const url = whatsAppFollowUpUrl(cart, "Casa Luz");
  assert.ok(url.startsWith("https://wa.me/59170000001?text="));
  assert.equal(decodeURIComponent(url.split("?text=")[1]), followUpMessage(cart, "Casa Luz"));
  assert.ok(whatsAppFollowUpUrl({ ...cart, phone: "+54 9 11 5555 5555" }, "Casa Luz").startsWith("https://wa.me/5491155555555?text="));
  assert.equal(whatsAppFollowUpUrl({ ...cart, phone: null }, "Casa Luz"), "");
});

test("the email link carries the same subject and message; nothing without an email", () => {
  const url = mailtoFollowUpUrl(cart, "Casa Luz");
  assert.ok(url.startsWith("mailto:ana@example.com?subject="));
  const params = new URLSearchParams(url.split("?")[1]);
  assert.equal(params.get("subject"), "Tu carrito en Casa Luz");
  assert.equal(params.get("body"), followUpMessage(cart, "Casa Luz"));
  assert.equal(mailtoFollowUpUrl({ ...cart, email: null }, "Casa Luz"), "");
});

test("labels, and the reminder pill only on saved carts and on payments that have one", () => {
  assert.equal(SOURCE_LABEL.payment, "Generó el QR / pulsó Pagar");
  assert.equal(SOURCE_LABEL.saved, "Guardó su carrito");
  assert.deepEqual(REMINDER_LABEL, { scheduled: "Recordatorio programado", sent: "Recordatorio enviado", none: "Sin recordatorio" });
  assert.equal(showsReminder(cart), false);
  assert.equal(showsReminder({ ...cart, recoverUrl: "https://pay.test/s/casa-luz?recover=abc", reminder: "sent" }), true);
  assert.equal(showsReminder({ ...cart, source: "saved", reminder: "none" }), true);
});

test("the anonymous line counts visits in Bolivian Spanish", () => {
  assert.equal(anonymousLine(1), "1 visita dejó su carrito sin dejar contacto");
  assert.equal(anonymousLine(0), "0 visitas dejaron su carrito sin dejar contacto");
  assert.equal(anonymousLine(1240), "1.240 visitas dejaron su carrito sin dejar contacto");
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/merchant-dashboard && node --test src/abandoned-carts.test.mjs`
Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Create `apps/merchant-dashboard/src/abandoned-carts.mjs`**

```js
import { whatsAppShareUrl } from "./cobros.mjs";
import { formatCount } from "./growth.mjs";

/**
 * Crecer › Carritos abandonados: pure helpers for the panel — labels, the follow-up the merchant edits before sending,
 * and its WhatsApp / email links. No DOM here, so node:test covers it. Nothing is sent from the dashboard.
 */
export const SOURCE_LABEL = { payment: "Generó el QR / pulsó Pagar", saved: "Guardó su carrito" };
export const REMINDER_LABEL = { scheduled: "Recordatorio programado", sent: "Recordatorio enviado", none: "Sin recordatorio" };

/** Name, else email, else phone. */
export const cartPerson = (cart) => cart.name?.trim() || cart.email || cart.phone || "Cliente";
/** «Café ×2, Té (Grande) ×1» */
export const cartItemsText = (items) => (items || []).map((item) => `${item.name}${item.variant ? ` (${item.variant})` : ""} ×${item.quantity}`).join(", ");

export function timeAgo(iso, now = new Date()) {
  const minutes = Math.max(1, Math.round((now.getTime() - Date.parse(iso)) / 60000));
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.round(hours / 24);
  return days === 1 ? "hace 1 día" : `hace ${days} días`;
}

/** The saved cart's restore link when there is one, else the store: the shopper lands where they can finish. */
export function followUpMessage(cart, storeName) {
  const first = cart.name?.trim().split(/\s+/)[0];
  return `Hola${first ? ` ${first}` : ""}, vimos que dejaste ${cartItemsText(cart.items)} en ${storeName}. ¿Te ayudamos a terminar tu compra? ${cart.recoverUrl || cart.storeUrl}`;
}
export const followUpSubject = (storeName) => `Tu carrito en ${storeName}`;

/** wa.me with the shopper's number (an 8-digit Bolivian mobile gets 591, see cobros.mjs). */
export const whatsAppFollowUpUrl = (cart, storeName) => cart.phone ? whatsAppShareUrl(cart.phone, followUpMessage(cart, storeName)) : "";
export const mailtoFollowUpUrl = (cart, storeName) => cart.email
  ? `mailto:${encodeURIComponent(cart.email).replace("%40", "@")}?subject=${encodeURIComponent(followUpSubject(storeName))}&body=${encodeURIComponent(followUpMessage(cart, storeName))}`
  : "";

/** The spec: saved-cart rows always say their reminder state; a payment row only when it led to a saved cart. */
export const showsReminder = (cart) => cart.source === "saved" || Boolean(cart.recoverUrl);

export const anonymousLine = (count) => count === 1
  ? "1 visita dejó su carrito sin dejar contacto"
  : `${formatCount(count)} visitas dejaron su carrito sin dejar contacto`;
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd apps/merchant-dashboard && node --test src/abandoned-carts.test.mjs`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/merchant-dashboard/src/abandoned-carts.mjs apps/merchant-dashboard/src/abandoned-carts.test.mjs
git commit -m "feat(dashboard): helpers for Carritos abandonados: labels, follow-up message, WhatsApp and email links"
```

---

### Task 9: Crecer › Carritos abandonados page

**Files:**
- Create: `apps/merchant-dashboard/src/abandoned-carts-panel.mjs`, `apps/merchant-dashboard/tests/abandoned-carts.spec.mjs`
- Create (untracked, **never commit**): `apps/merchant-dashboard/playwright.port-4324.config.mjs`
- Modify: `apps/merchant-dashboard/index.html`: one nav item in the Crecer group (lines 192-197), one view section after line 475
- Modify: `apps/merchant-dashboard/src/dashboard.js`: import (after line 12), mount (after the growth mount, ~line 424), `DASHBOARD_VIEW_COPY` (line 588), `setDashboardView` (after line 796), store reset (after line 1756)
- Modify: `apps/merchant-dashboard/server.mjs:151` (allow-list)
- Modify: `apps/merchant-dashboard/src/growth.css` (append)
- Modify: `apps/merchant-dashboard/tests/dashboard-smoke.spec.mjs` (`VIEWS` line 5, one route case)

**Interfaces:**
- Consumes: Task 8's helpers; `GET /stores/:id/abandoned-carts?days=7|30` (Task 7); `formatMoney` from `./cobros.mjs`; `escapeHtml` from `./html.mjs`.
- Produces: `mountAbandonedCartsPanel(deps: { api, storeId(), store(), signedIn() }) → { show(), reset() }`; dashboard view `abandoned-carts`.

- [ ] **Step 1: Make the isolated Playwright config (untracked)**

Create `apps/merchant-dashboard/playwright.port-4324.config.mjs`. Do not `git add` it, and delete it in Task 10:

```js
// Plan-B worktree only, never committed: port 4323 may be the owner's live dashboard or plan A's run, and
// reuseExistingServer would silently test that checkout's code instead of this one.
import base from "./playwright.config.mjs";
export default { ...base, use: { ...base.use, baseURL: "http://127.0.0.1:4324" }, webServer: { ...base.webServer, command: "PORT=4324 node server.mjs", url: "http://127.0.0.1:4324", reuseExistingServer: false } };
```

Check that nothing is already on 4324: `lsof -nP -iTCP:4324 -sTCP:LISTEN`. Expected: no output. If something is listening, pick 4325 in both places.

- [ ] **Step 2: Write the failing browser test** `apps/merchant-dashboard/tests/abandoned-carts.spec.mjs`

```js
import { expect, test } from "@playwright/test";

// Crecer › Carritos abandonados with a mocked API.
const store = { id: "store_1", merchantId: "m1", slug: "casa-luz", name: "Casa Luz", status: "ACTIVE", websiteRevision: 0, heroSlides: [], contentOrder: [], editorialGallery: [], links: [], locations: [], animations: [], customDomains: [], checkoutMode: "payment" };
const STORE_URL = "http://localhost:5174/s/casa-luz";
const hoursAgo = (hours) => new Date(Date.now() - hours * 3600000).toISOString();
const carts = () => [
  { key: "email:ana@example.com", source: "payment", name: "Ana Rojas", email: "ana@example.com", phone: "70000001", items: [{ name: "Café", variant: null, quantity: 2 }], total: 2000, currency: "BOB", leftAt: hoursAgo(3), reminder: "none", recoverUrl: null, storeUrl: STORE_URL },
  { key: "email:bruno@example.com", source: "saved", name: null, email: "bruno@example.com", phone: null, items: [{ name: "Té", variant: "Grande", quantity: 1 }], total: 1500, currency: "BOB", leftAt: hoursAgo(5), reminder: "scheduled", recoverUrl: `${STORE_URL}?recover=abc`, storeUrl: STORE_URL },
  { key: "phone:70000003", source: "payment", name: '<img src=x onerror="window.__xss=1">', email: null, phone: "+591 70000003", items: [{ name: "Café", variant: null, quantity: 1 }], total: 1000, currency: "BOB", leftAt: hoursAgo(26), reminder: "sent", recoverUrl: `${STORE_URL}?recover=def`, storeUrl: STORE_URL },
  { key: "email:eva@example.com", source: "saved", name: "Eva", email: "eva@example.com", phone: null, items: [{ name: "Café", variant: null, quantity: 3 }], total: 3000, currency: "BOB", leftAt: hoursAgo(30), reminder: "none", recoverUrl: `${STORE_URL}?recover=ghi`, storeUrl: STORE_URL },
];

async function open(page, answer) {
  const asked = [];
  await page.addInitScript(() => {
    sessionStorage.setItem("pagosya_merchant_session", "carts-test");
    sessionStorage.setItem("pagosya_merchant_email", "merchant@example.com");
  });
  await page.route("http://localhost:5175/**", (route) => route.fulfill({ contentType: "text/html", body: "<!doctype html><main>Tienda</main>" }));
  await page.route("http://localhost:3001/v1/**", (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace("/v1", "");
    let body = [];
    if (path === "/stores") body = [store];
    else if (path === "/stores/store_1/abandoned-carts") { asked.push(url.searchParams.get("days")); body = answer(Number(url.searchParams.get("days"))); }
    else if (path === "/merchants/balance") body = { payableBalance: 0 };
    else if (path === "/merchants/kyc") body = { status: "APPROVED" };
    else if (path === "/merchants/invoicing_profile") body = { status: "NOT_CONFIGURED" };
    else if (path === "/merchants/finances") body = { totalRevenue: 0, paymentCount: 0, inventoryValue: 0, totalStoreViews: 0, topProducts: [], revenueByPaymentMethod: [], currency: "BOB" };
    else if (path.endsWith("/visual-studio")) body = { proposals: [], versions: [] };
    else if (path.endsWith("/source-project")) body = { revision: 0, versions: [], nextBefore: null };
    return route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.goto("/#dashboard-overview");
  await expect(page.locator("body")).toHaveClass(/is-logged-in/);
  return asked;
}

test("Crecer › Carritos abandonados lists who left, with reminders and follow-up links; a hostile name stays text", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const asked = await open(page, (days) => ({ anonymousSessions: days === 30 ? 12 : 4, carts: carts() }));
  await page.locator('[data-nav-group="crecer"] > summary').click();
  await page.locator('[data-dashboard-view="abandoned-carts"]').click();
  await expect(page.locator("#workspaceTitle")).toHaveText("Carritos abandonados");
  await expect(page.locator(".carts-anonymous")).toHaveText("4 visitas dejaron su carrito sin dejar contacto");
  const rows = page.locator(".carts-row");
  await expect(rows).toHaveCount(4);
  for (const text of ["Ana Rojas", "Café ×2", "Bs 20,00", "hace 3 h", "Generó el QR / pulsó Pagar"]) await expect(rows.nth(0)).toContainText(text);
  await expect(rows.nth(0)).not.toContainText("Recordatorio");
  for (const text of ["bruno@example.com", "Té (Grande) ×1", "Guardó su carrito", "Recordatorio programado"]) await expect(rows.nth(1)).toContainText(text);
  for (const text of ["<img", "hace 1 día", "Recordatorio enviado"]) await expect(rows.nth(2)).toContainText(text);
  await expect(rows.nth(3)).toContainText("Sin recordatorio");
  await expect(page.locator(".carts-row img")).toHaveCount(0);
  expect(await page.evaluate(() => window.__xss)).toBeUndefined();

  const whatsapp = await rows.nth(0).getByRole("link", { name: "Escribir por WhatsApp" }).getAttribute("href");
  expect(whatsapp).toMatch(/^https:\/\/wa\.me\/59170000001\?text=/);
  expect(decodeURIComponent(whatsapp.split("?text=")[1])).toBe(`Hola Ana, vimos que dejaste Café ×2 en Casa Luz. ¿Te ayudamos a terminar tu compra? ${STORE_URL}`);
  await expect(rows.nth(1).getByRole("link", { name: "Escribir por WhatsApp" })).toHaveCount(0);
  const mail = await rows.nth(1).getByRole("link", { name: "Escribir por correo" }).getAttribute("href");
  expect(mail.startsWith("mailto:bruno@example.com?subject=")).toBe(true);
  expect(decodeURIComponent(mail)).toContain(`${STORE_URL}?recover=abc`);
  expect(decodeURIComponent((await rows.nth(2).getByRole("link", { name: "Escribir por WhatsApp" }).getAttribute("href")).split("?text=")[1])).toMatch(/^Hola <img/);

  await page.getByRole("button", { name: "30 días" }).click();
  await expect(page.locator(".carts-anonymous")).toHaveText("12 visitas dejaron su carrito sin dejar contacto");
  expect(asked[0]).toBe("7");
  expect(asked.at(-1)).toBe("30");
  expect(errors).toEqual([]);
});

test("with no contactable carts it says so and still counts anonymous sessions", async ({ page }) => {
  await open(page, () => ({ anonymousSessions: 1, carts: [] }));
  await page.evaluate(() => window.setDashboardView("abandoned-carts"));
  await expect(page.locator(".carts-empty")).toHaveText("Todavía no hay carritos abandonados con contacto.");
  await expect(page.locator(".carts-anonymous")).toHaveText("1 visita dejó su carrito sin dejar contacto");
});
```

In `apps/merchant-dashboard/tests/dashboard-smoke.spec.mjs`, add `"abandoned-carts"` to `VIEWS` (line 5, after `"integrations"`), and add this route case after the `domain-shop` line:

```js
    else if (path.endsWith("/abandoned-carts")) body = { anonymousSessions: 0, carts: [] };
```

- [ ] **Step 3: Run them to verify they fail**

Run: `cd apps/merchant-dashboard && npx playwright test --config playwright.port-4324.config.mjs tests/abandoned-carts.spec.mjs tests/dashboard-smoke.spec.mjs`
Expected: FAIL. The `[data-dashboard-view="abandoned-carts"]` element is missing, and the smoke run lands on "overview" instead of "abandoned-carts".

- [ ] **Step 4: Create the panel** `apps/merchant-dashboard/src/abandoned-carts-panel.mjs`

```js
import { escapeHtml as esc } from "./html.mjs";
import { formatMoney } from "./cobros.mjs";
import { REMINDER_LABEL, SOURCE_LABEL, anonymousLine, cartItemsText, cartPerson, mailtoFollowUpUrl, showsReminder, timeAgo, whatsAppFollowUpUrl } from "./abandoned-carts.mjs";

/**
 * Crecer › Carritos abandonados (spec 2026-10-13-abandoned-carts): shoppers who pressed Pagar or saved their cart and
 * did not pay, newest first, each with a WhatsApp and an email link the merchant edits before sending; anonymous
 * sessions only as a count. Read-only: nothing is sent or stored from here. Every interpolated value goes through esc().
 *
 * deps:
 *   api(path, options)   authenticated dashboard API call (throws Error with .status)
 *   storeId(), store()   the active store id and row
 *   signedIn()           whether a merchant session exists
 */
export function mountAbandonedCartsPanel(deps) {
  const root = document.getElementById("abandonedCartsRoot");
  if (!root) return { show() {}, reset() {} };

  const PERIODS = [7, 30];
  let days = 7;
  let data = null;
  let loadedFor = null;
  let loading = false;
  let failure = null;
  let request = 0;

  async function load() {
    if (!deps.storeId() || !deps.signedIn()) { data = null; render(); return; }
    const mine = ++request;
    const store = deps.storeId();
    loading = true; failure = null; render();
    try {
      const answer = await deps.api(`/stores/${encodeURIComponent(store)}/abandoned-carts?days=${days}`);
      if (mine !== request) return;
      // An unexpected body renders as the empty state, never as a broken page.
      data = { anonymousSessions: Number(answer?.anonymousSessions) || 0, carts: Array.isArray(answer?.carts) ? answer.carts : [] };
      loadedFor = store;
    } catch (error) {
      if (mine !== request) return;
      failure = error?.message || "No pudimos cargar los carritos abandonados.";
    } finally {
      if (mine === request) { loading = false; render(); }
    }
  }

  function render() {
    if (!deps.storeId()) {
      root.innerHTML = `<section class="growth-empty"><h3>Elige o crea una tienda</h3><p>Aquí verás quién dejó productos sin pagar en la tienda seleccionada.</p></section>`;
      return;
    }
    if (!data && loading) { root.innerHTML = `<div class="growth-skeleton" aria-busy="true" aria-label="Cargando carritos abandonados"><span></span><span></span></div>`; return; }
    if (!data && failure) { root.innerHTML = `<section class="growth-error" role="alert"><p>${esc(failure)}</p><button type="button" class="primary" data-carts-retry>Reintentar</button></section>`; return; }
    if (!data) { root.innerHTML = ""; return; }
    const storeName = deps.store()?.name || "nuestra tienda";
    root.innerHTML = `
      <div class="carts" ${loading ? 'aria-busy="true"' : ""}>
        <div class="growth-toolbar">
          <div class="growth-period" role="group" aria-label="Periodo">
            ${PERIODS.map((value) => `<button type="button" data-carts-days="${value}" aria-pressed="${value === days}">${value} días</button>`).join("")}
          </div>
          <p class="carts-anonymous">${esc(anonymousLine(data.anonymousSessions))}</p>
        </div>
        ${failure ? `<p class="growth-error" role="alert">${esc(failure)}</p>` : ""}
        ${data.carts.length ? `<ol class="carts-list">${data.carts.map((cart) => row(cart, storeName)).join("")}</ol>` : `<p class="carts-empty">Todavía no hay carritos abandonados con contacto.</p>`}
      </div>`;
  }

  function row(cart, storeName) {
    const whatsapp = whatsAppFollowUpUrl(cart, storeName);
    const mail = mailtoFollowUpUrl(cart, storeName);
    const reminder = REMINDER_LABEL[cart.reminder] ? cart.reminder : "none";
    return `<li class="carts-row">
      <div class="carts-who"><strong>${esc(cartPerson(cart))}</strong><span>${esc(timeAgo(cart.leftAt))}</span></div>
      <p class="carts-items">${esc(cartItemsText(cart.items))} · <strong>${esc(formatMoney(cart.total, cart.currency))}</strong></p>
      <p class="carts-tags"><span class="carts-tag">${esc(SOURCE_LABEL[cart.source] || "")}</span>${showsReminder(cart) ? `<span class="carts-tag is-${esc(reminder)}">${esc(REMINDER_LABEL[reminder])}</span>` : ""}</p>
      ${whatsapp || mail ? `<p class="carts-actions">${whatsapp ? `<a href="${esc(whatsapp)}" target="_blank" rel="noopener noreferrer">Escribir por WhatsApp</a>` : ""}${mail ? `<a href="${esc(mail)}">Escribir por correo</a>` : ""}</p>` : ""}
    </li>`;
  }

  root.addEventListener("click", (event) => {
    const target = event.target.closest("button");
    if (!target || !root.contains(target)) return;
    if (target.dataset.cartsDays) {
      const next = Number(target.dataset.cartsDays);
      if (next !== days) { days = next; void load(); }
      return;
    }
    if (target.hasAttribute("data-carts-retry")) void load();
  });

  return {
    /** The view became visible: load the active store's list for the chosen period. */
    show() {
      if (loadedFor !== deps.storeId()) data = null;
      void load();
    },
    /** The active store changed. */
    reset() {
      request++;
      data = null; loadedFor = null; failure = null; loading = false;
      if (document.body.dataset.dashboardView === "abandoned-carts") void load();
      else root.innerHTML = "";
    },
  };
}
```

- [ ] **Step 5: Add the nav item and the view section** in `apps/merchant-dashboard/index.html`

Replace

```html
Correos y marketing</a>
            <a class="dashboard-nav-button" href="#dashboard-experiments"
```

with

```html
Correos y marketing</a>
            <a class="dashboard-nav-button" href="#dashboard-abandoned-carts" data-dashboard-view="abandoned-carts"><span class="dashboard-nav-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.6 12.4a2 2 0 0 0 2 1.6h8.2a2 2 0 0 0 2-1.5L22 8H6"/></svg></span>Carritos abandonados</a>
            <a class="dashboard-nav-button" href="#dashboard-experiments"
```

After line 475 (`<section class="growth-view" id="growthSection" data-dashboard-page="growth" … </section>`), add:

```html
    <section class="growth-view abandoned-carts-view" id="abandonedCartsSection" data-dashboard-page="abandoned-carts" aria-label="Carritos abandonados" hidden><div id="abandonedCartsRoot"></div></section>
```

(`growth-view` lends this page the growth tokens, period picker, skeleton and error styles.)

- [ ] **Step 6: Register the view** in `apps/merchant-dashboard/src/dashboard.js`

- After `import { mountGrowthPanel } from "/src/growth-panel.mjs";`, add:

```js
import { mountAbandonedCartsPanel } from "/src/abandoned-carts-panel.mjs";
```

- Immediately before `  let lastTotalFinances = null;` (right after the growth mount's closing `  });`), add:

```js
  // Crecer › Carritos abandonados: who left without paying and how to reach them; read-only.
  const abandonedCarts = mountAbandonedCartsPanel({
    api,
    storeId: () => currentStoreId,
    store: () => lastStores.find((candidate) => candidate.id === currentStoreId) || null,
    signedIn: () => !!sessionToken,
  });
```

- In `DASHBOARD_VIEW_COPY`, after the `growth: [...]` entry, add:

```js
    "abandoned-carts": ["Carritos abandonados", "Quién dejó productos sin pagar y cómo escribirle."],
```

- In `setDashboardView`, after `    if (nextView === "growth") growth.show();`, add:

```js
    if (nextView === "abandoned-carts") abandonedCarts.show();
```

- In the `if (storeChanged) { … }` block, after `      growth.reset();`, add:

```js
      abandonedCarts.reset();
```

- [ ] **Step 7: Serve the modules** in `apps/merchant-dashboard/server.mjs:151`

In the one-line array, replace `"/src/growth.css", ` with `"/src/growth.css", "/src/abandoned-carts.mjs", "/src/abandoned-carts-panel.mjs", `. Plan A appends to this same line, so a textual conflict at merge time is expected; resolve it by keeping both sets of entries.

- [ ] **Step 8: Style the page** by appending to `apps/merchant-dashboard/src/growth.css`

```css

/* Crecer › Carritos abandonados (abandoned-carts-panel.mjs): reuses the growth tokens, period picker, skeleton and errors. */
.carts { display: grid; gap: 16px; }
.carts-anonymous { color: var(--pg-text-muted); font-size: 14px; line-height: 1.45; }
.carts-list { display: grid; gap: 10px; margin: 0; padding: 0; list-style: none; }
.carts-row { display: grid; gap: 8px; padding: 14px 16px; border: 2px solid var(--g-line); border-radius: 14px; background: var(--pg-surface, #fff); }
.carts-who { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 4px 12px; }
.carts-who strong { font-size: 16px; overflow-wrap: anywhere; }
.carts-who span, .carts-items { color: var(--pg-text-muted); font-size: 14px; line-height: 1.45; }
.carts-items strong { color: var(--pg-text); }
.carts-tags, .carts-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.carts-tag { display: inline-flex; align-items: center; min-height: 26px; padding: 0 10px; border-radius: 999px; background: var(--g-soft); font-size: 12.5px; font-weight: 700; }
.carts-tag.is-sent { background: var(--g-good-soft); color: var(--g-good); }
.carts-tag.is-scheduled { background: var(--g-accent-soft); color: var(--g-accent); }
.carts-actions a { display: inline-flex; align-items: center; min-height: 44px; padding: 0 14px; border: 2px solid var(--g-line); border-radius: 999px; color: var(--pg-text); font-weight: 700; text-decoration: none; }
.carts-actions a:focus-visible, .carts button:focus-visible { outline: 3px solid var(--g-accent); outline-offset: 2px; }
.carts-empty { padding: 18px 16px; border: 2px dashed var(--g-line); border-radius: 14px; color: var(--pg-text-muted); }
@media (min-width: 560px) { .carts-anonymous { text-align: right; } }
```

- [ ] **Step 9: Run the tests to verify they pass**

Run: `cd apps/merchant-dashboard && npm run test:unit`
Expected: PASS, including `unit/served-modules.test.mjs`.

Run: `cd apps/merchant-dashboard && npx playwright test --config playwright.port-4324.config.mjs tests/abandoned-carts.spec.mjs tests/dashboard-smoke.spec.mjs tests/growth.spec.mjs`
Expected: PASS.

- [ ] **Step 10: Commit** (the port-4324 config stays untracked)

```bash
git add apps/merchant-dashboard/src/abandoned-carts-panel.mjs apps/merchant-dashboard/tests/abandoned-carts.spec.mjs apps/merchant-dashboard/tests/dashboard-smoke.spec.mjs apps/merchant-dashboard/index.html apps/merchant-dashboard/src/dashboard.js apps/merchant-dashboard/server.mjs apps/merchant-dashboard/src/growth.css
git commit -m "feat(dashboard): Crecer › Carritos abandonados lists who left, with WhatsApp and email follow-ups"
```

---

### Task 10: Final verification

**Files:** none new.

- [ ] **Step 1: The touched suites, together**

Run: `cd apps/api && npx jest --maxWorkers=2 src/store-growth src/store-knowledge src/retention src/payment-intents src/storefront-source/source-commerce-analytics.spec.ts src/storefront-source/source-commerce-cookies.spec.ts src/storefront-source/source-commerce-pages.spec.ts`
Expected: PASS.

Run: `cd apps/api && npx jest --config test/jest-e2e.json test/store-growth.e2e-spec.ts test/source-publishing.e2e-spec.ts test/reminder-consent.e2e-spec.ts test/abandoned-carts.e2e-spec.ts test/retention.e2e-spec.ts`
Expected: PASS. `retention.e2e-spec.ts` proves `saveCart` is unchanged.

Run: `cd apps/api && npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

Run: `cd apps/checkout && npx vitest run && npx tsc -p tsconfig.json`
Expected: PASS.

Run: `cd apps/merchant-dashboard && npm run test:unit && npx playwright test --config playwright.port-4324.config.mjs`
Expected: PASS. Any failure must be reproduced on the base commit before you call it pre-existing.

- [ ] **Step 2: Nothing writes the step columns any more**

Run: `grep -rnE "productViewedAt|cartAddedAt|checkoutStartedAt|deliverySelectedAt" apps/api/src apps/checkout/src packages/storefront-kit/kit | grep -v "\.spec\.ts"`
Expected: no output. The columns stay only in `apps/api/prisma/schema.prisma` and its migrations.

Run: `git diff --stat <base>..HEAD -- apps/api/prisma apps/api/src/payment-intents/payment-intents.service.ts apps/merchant-studio/src/retention.ts`
Expected: empty: no schema change, no change to the receipt path, the Studio form untouched.

- [ ] **Step 3: Clean up**

Delete `apps/merchant-dashboard/playwright.port-4324.config.mjs`. Then run `git status --short`. Expected: clean.

- [ ] **Step 4: Report** the commit range and any test that was red before this work (with its name), the open owner question (Finding 4, subscription cadence in reminder carts), and the shared-file regions below for the merge.

---

## Shared files with plan A

Plan A (email settings merge) is merged first and B goes on top. B touches these files, and only the regions listed.

| File | What B edits | Plan A's region | Expected conflict |
|---|---|---|---|
| `apps/api/src/payment-intents/payment-intents.service.ts` | **Nothing.** The post-confirm hook lives in `payment-intents.controller.ts`, outside every payment transaction. `confirm()` (~348-460), `queueStoreEmail` ORDER_CONFIRMATION (~722) and `receiptQueued`/`sendReceiptEmail` (~785-905) are untouched. | receipt path | none |
| `apps/api/src/payment-intents/dto/confirm-payment-intent.dto.ts` | One optional field `reminderConsent` appended at the end of `ConfirmPaymentIntentDto` (after line 116) | — | none expected |
| `apps/api/src/payment-intents/payment-intents.controller.ts` | Imports (lines 1, 10, +1), constructor (16-20), `confirm` body (51-57) | — | none expected |
| `apps/api/src/payment-intents/checkout-session.controller.ts` | Import line 1, +1 import, constructor (18-21), one field in `sessionResponse` (after line 53) | — | none expected |
| `apps/api/src/payment-intents/payment-intents.module.ts` | +1 import line; `RetentionModule` appended to `imports` (line 25) | if A also adds a module import here, same line | trivial: keep both |
| `apps/api/src/retention/retention.service.ts` | **Adds only:** one import after line 15, and two new methods (`reminderAvailable`, `saveCartFromPayment`) after `attachCheckout` (~line 218). No existing line changes. | A edits `apps/merchant-studio/src/retention.ts` (B does not touch it) | none expected |
| `apps/merchant-dashboard/index.html` | One `<a>` in the Crecer group (inserted after the «Correos y marketing» item, lines 192-197); one `<section>` after line 475 | marketing page (~557-596), Ajustes tabs (~856-875) | none expected (separate regions) |
| `apps/merchant-dashboard/src/dashboard.js` | +1 import after line 12; mount block before `let lastTotalFinances` (~424); one `DASHBOARD_VIEW_COPY` entry (after line 588); one line after `growth.show()` (796); one line after `growth.reset()` (1756). All page logic is in `src/abandoned-carts-panel.mjs` / `src/abandoned-carts.mjs`. | marketing tab handling | adjacent-line conflict possible at the import block if A adds an import there: keep both |
| `apps/merchant-dashboard/server.mjs` | Line 151, the one-line `/src` allow-list: two entries added | A appends to the same line | **expected, trivial**: keep both sets of entries |
| `apps/merchant-dashboard/tests/dashboard-smoke.spec.mjs` | `VIEWS` (line 5) gains `"abandoned-carts"`; one route case | if A adds a view, same line | trivial: keep both |
| `apps/merchant-dashboard/src/growth.css` | Appended block at the end | — | none expected |
| `apps/checkout/src/checkout/payment-form.ts`, `apps/checkout/src/api.ts` | The store email field (~164-169), the email listener (~273), the per-session reset (~123), the submit payload (~372-376); `CheckoutSession` / `CustomerContact` / `confirmPaymentIntent` body | not expected to be touched by A | none expected |

After merging, re-run the commands in Task 10 Step 1 on the merged branch, plus `node --test unit/served-modules.test.mjs`. The latter checks that the merged allow-list kept both plans' modules.
