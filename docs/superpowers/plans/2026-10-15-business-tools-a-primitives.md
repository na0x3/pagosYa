# Business Tools (a): Server-Priced Selling Primitives Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A product can be sold by unit (0,5 L steps), with volume tiers and builder option groups, and a request form can carry validated answers and a deposit. The server prices every line from approved product rules in one shared function used by cart checkout, a new price-quote endpoint, leads and subscription repricing. The browser never sends an amount, and YAPI's `pricingProposal` never prices anything.

**Architecture:**
- `apps/api/src/stores/selling-rules.ts` is pure. It holds the readers for `PaymentLink.unit | tiers | optionGroups | pricingProposal`, unit math in thousandths, and `priceSellingLine()`, the one function that prices a cart quantity.
- `apps/api/src/stores/cart-pricing.ts` merges repeated cart items, resolves variants, extras, options and cadence, and returns line snapshots and quote lines.
- `createCartCheckout`, the new `priceQuote`, `submitLead` and `SubscribersService.lockedUnit` all call it.
- A cart quantity of a unit product counts **steps**. One step costs a whole number of cents, so every existing consumer that multiplies `unitAmount × quantity` (receipts, renewals, bundles, analytics) stays exact.
- Request forms get pure answer validation (`request-fields.ts`), a signed fill-time token, a honeypot and a per-visitor throttle (`tool-form-guard.ts`).
- The approved tool is looked up through an injected `RequestToolSource`, which sub-project b provides.

**Tech Stack:** NestJS and TypeScript (apps/api), Prisma and PostgreSQL (one migration), class-validator, Jest with mocked Prisma. Vitest is used in apps/checkout and `node --test` in apps/merchant-dashboard.

**Spec:** docs/superpowers/specs/2026-10-14-business-tools-design.md (part a). Plans b (`2026-10-15-business-tools-b-renderers.md`) and c (`2026-10-15-business-tools-c-authoring.md`) build on this one.

## Global Constraints

- **Order of plans.**
  - This plan runs after the store controls plan (`2026-10-14-store-controls.md`), the store voice plan and the big-file split plan (`2026-10-15-split-big-files.md`).
  - Code is anchored on today's files, with quoted surrounding lines. If the split plan moved `dashboard.js` code into modules, apply the quoted change to the function it names (`orderItemsLabel`) wherever it now lives.
- **Unit.** `PaymentLink.unit = { label, step, min, max }`.
  - `label` is 1–12 characters after trimming, with no control or bidi characters and no `<` or `>`.
  - `step`, `min` and `max` are positive. Each is a whole number of thousandths (at most 3 decimals).
  - `min` and `max` are multiples of `step`, and `min ≤ max`.
  - `max / step ≤ 999`, so the per-line cap `max / step` is an integer and never more than the DTO's existing `@Max(999)`.
  - `max ≤ 10 000`.
  - A product with `variants` is never sold by unit: `readSellingUnit` is not even called for it.
  - Anything malformed reads as no unit.
- **Unit math.**
  - Units are counted in thousandths: `UNIT_SCALE = 1000`, so `unitsMilli = quantity × round(step × 1000)`. Floats are never multiplied: `3 × 0.3 kg` is exactly `0.9 kg`.
  - One step costs `stepAmount = Math.round(unitAmount × stepMilli / 1000)` whole cents (half up). Line amount = `stepAmount × quantity`.
  - Proposal checks (plan c) only approve prices whose step price is exact, so then `lineAmount = unitAmount × units` with no rounding at all.
  - Stock of a unit product counts steps, as cart `quantity` does today. This is unchanged behaviour of `decrementStockForCart`.
- **Tiers.** `PaymentLink.tiers = [{ from, unitAmount }]`.
  - 1–6 entries. `from` is ascending and a multiple of `step`, with `from ≤ max`.
  - `unitAmount` is an integer that strictly decreases.
  - The first tier's `from` equals `unit.min`, and its `unitAmount` equals `PaymentLink.amount`: tiers derive from the real price.
  - A product whose `amount` changed after approval has stale tiers. **Stale tiers price nothing**: the line is priced at `amount` and the quote shows no tier.
  - The applied tier is the highest one with `fromMilli ≤ unitsMilli`. The first tier (the base price) is reported as `tier: null`.
- **Order of discounts.**
  1. The tier unit price, plus option deltas, becomes the step price.
  2. The time-windowed `discountPercent` applies (`discountedProductAmount`).
  3. The Subscribe & Save cadence applies through today's `subscriptionPrices`. The first order pays `min(sale price, cadence price)` and renewals pay the cadence price. Steps 2 and 3 never stack, exactly as today.
  4. Promo or bundle applies on the subtotal, and the best single offer wins.
  - Lines sold by unit, like subscription lines, never count toward a bundle.
- **Option groups.** `PaymentLink.optionGroups = [{ id, label, type: 'single'|'multi'|'text', required, choices?, maxLength? }]`.
  - At most 8 groups and 12 choices each.
  - Ids match `^[a-z0-9][a-z0-9-]{0,31}$`. Labels are at most 60 characters.
  - `amountDelta` is an integer ≥ 0. Deltas are per unit (per step price for a unit product).
  - Text is at most 140 characters (`maxLength` 1–140), checked with `SAFE_TEXT_PATTERN`.
  - The cart line's `options` maps a group id to choice ids (`single` and `multi`) or to a string (`text`).
  - A line with options cannot be a subscription.
- **Pending proposals.** `PaymentLink.pricingProposal` is read only by plan c's approval, through `readPricingProposal`. Nothing in this plan prices from it, and it is never sent to a browser (pinned in Tasks 4 and 5).
- **Request answers.**
  - `fields` holds at most 12 answers (`MAX_REQUEST_FIELDS`), each `{ id, value }`.
  - Text values are at most 400 characters (`REQUEST_TEXT_MAX`).
  - A number is at most 9 digits with up to 3 decimals (comma or dot).
  - A date is a real ISO calendar date, `YYYY-MM-DD`.
  - A choice must be one of the field's choices, exactly.
  - A phone has 7–15 digits, from the characters `+ ( ) - space`.
  - Unknown ids, duplicate ids and missing required fields are refused.
  - A missing phone-type answer is filled from the trusted `phone` field, because the hosted dialog collects the phone.
- **Abuse protection.**
  - **Honeypot `website`.** When it is filled, the server answers like a success (`{ submitted: true, leadId: null, deposit: null }`) and saves and sends nothing.
  - **Signed fill-time token.** It is `<issuedAtMs>.<hmac>`, HMAC-SHA256 over `tool-form:<storeId>:<toolId>:<issuedAt>` with `app.orderTrackingSecret`. It is refused under **3 s** (`TOOL_FORM_MIN_FILL_MS`) and over 2 h.
  - **Visitor throttle.** At most **3 per 10 minutes per visitor** (`TOOL_REQUESTS_PER_VISITOR`, `TOOL_REQUEST_WINDOW_MS`). The visitor is `sha256("tool-visitor:" + secret + ":" + ip)`, kept on `StoreLead.visitorHash`.
  - The existing route throttle (5 per minute) stays.
- **Deposit.** A request's deposit is a real product (`ApprovedRequestTool.depositProductId`).
  - The lead response carries `deposit: { productId, token }` only when that product is ACTIVE in the store and the store charges with pagosYa.
  - The token is HMAC-SHA256 over `tool-deposit:<leadId>:<productId>`.
  - Cart checkout accepts `leadDeposit: { leadId, token }` only when its cart contains that product. Then it links `StoreLead.depositOrderId` to the new order.
- **Never trusted from the browser:** an amount, a unit price, a tier, a choice's delta, a label, or a proposal. With `forbidNonWhitelisted`, extra keys such as `unitAmount` are refused (pinned in Task 4).
- **No auto-charge promise.** Subscription lines keep today's consent text: «… no se cobra nada automáticamente …».
- **Limits owned by plans b and c.** These are listed here for the reader and are not enforced in this plan:
  - at most 4 tools per store;
  - 0–2 tools per build;
  - each discount at most 30 %;
  - option deltas ≥ 0 and at most 3× the base price;
  - a deposit at most 50 % of the cheapest related product, unless the merchant set it;
  - at most 12 request fields, with no payment or ID fields.
- **Database.**
  - Task 1 adds exactly one migration, `20261015120000_business_tool_pricing`. Applying it is the **owner's step**: `cd apps/api && npx prisma migrate deploy`.
  - Tasks never apply it. Never run `prisma migrate dev`, `db push`, `migrate reset`, `migrate diff` or `migrate deploy`.
  - Task 1 runs `npx prisma generate` once. The generated client is shared with the owner's running API, so no other task regenerates it.
- **Live-stack check (run before any edit under `apps/api/src`).** The owner's `pnpm dev:chatgpt` runs `nest start --watch` from this working tree. Editing a file under `apps/api/src` restarts the API and kills running YAPI builds and background reviews. Continue only when this read-only command prints `[0,0]`:
  ```bash
  cd apps/api && node -e "const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();Promise.all([p.storeSourceChatJob.count({where:{status:'RUNNING'}}),p.storeSourceGeneration.count({where:{status:{in:['RUNNING','REVIEWING']},heartbeatAt:{gt:new Date(Date.now()-5*60e3)}}})]).then(r=>console.log(JSON.stringify(r))).finally(()=>p.\$disconnect())"
  ```
- **Tests.**
  - Run API tests one file at a time (`npx jest <file>`), or with `--maxWorkers=2` for more than one file.
  - **Never run the full api jest suite with default workers.**
  - Tests mock Prisma like `stores.service.spec.ts`.
- **Git.**
  - Commit on `feature/store-page-architecture` and never push.
  - Stage only the files a task lists.
  - Never stage or edit `apps/api/src/store-emails/*`: that is the owner's uncommitted work. This plan reads `store-email.service.ts` and does not change it.
  - Every commit ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Language.** Merchant- and buyer-facing text is Spanish.

## Review Focus

1. **Float rounding at tier boundaries.**
   - 29 steps of 0,5 L are 14,5 L and must not reach the «desde 15 L» tier. 30 steps must reach it.
   - 3 steps of 0,3 kg must reach a 0,9 kg tier, although `3 * 0.3 === 0.8999999999999999` in JavaScript.
   - Pinned in Task 2 (`selling-rules.spec.ts`: «14,5 L stays on the base price…», «3 × 0,3 kg reaches the 0,9 kg tier»).
2. **A product edited after approval, so its tiers no longer match its amount.**
   - The tiers are ignored and the line is charged at the new amount. A stale tier never gives a discount nobody approved.
   - Pinned in Task 2 («stale tiers price nothing») and Task 4 (the quote shows `tier: null` for the same product).
3. **Promo + tier + cadence stacking.**
   - The tier sets the step price; the sale and the cadence follow today's min rule; the promo applies to the subtotal; and a unit line never meets a bundle.
   - Pinned in Task 3 («tier, sale, cadence and promo apply in the spec's order») and Task 4 (quote equals checkout for the same cart).
4. **An approved tool whose product later gets variants.**
   - A calculator line (no `variantId`, a step count) must not be charged as 40 pieces. The unit is ignored on a product with variants, so checkout asks for an option.
   - Pinned in Task 3 («a unit product that gained variants refuses the old calculator line») and Task 5 (public `unit: null`).
5. **A request whose deposit product was deleted or archived.**
   - The lead is still saved and the merchant still emailed, with no deposit offered.
   - A deposit token can never pay for a different product.
   - Pinned in Task 9 («a deleted deposit product…») and Task 10 («a token for another product is refused»).

## File Structure

| File | Responsibility |
|---|---|
| `apps/api/prisma/migrations/20261015120000_business_tool_pricing/migration.sql` (new) | `PaymentLink.unit/tiers/optionGroups/pricingProposal`; `StoreLead.toolId/fields/visitorHash/depositOrderId` |
| `apps/api/prisma/schema.prisma` | The same columns, and the `LeadDeposit` relation |
| `apps/api/src/stores/business-tools-schema.spec.ts` (new) | Pins the migration and schema columns |
| `apps/api/src/stores/selling-rules.ts` (new) | Types, readers, unit and tier math, options, `priceSellingLine`, `readPricingProposal`, `sellingRulesPublic` |
| `apps/api/src/stores/selling-rules.spec.ts` (new) | Pure math and validation |
| `apps/api/src/stores/cart-pricing.ts` (new) | `cartItemKey`, `priceCartItems`, `CartLineSnapshot`, `PriceQuoteLine`, `PriceQuote` |
| `apps/api/src/payment-links/dto/chosen-options.validator.ts` (new) | `IsChosenOptions` for `CartItemDto.options` |
| `apps/api/src/payment-links/dto/cart-checkout.dto.ts` | `options`, `leadDeposit`, `PriceQuoteDto` |
| `apps/api/src/stores/store-checkout.service.ts` | Shared pricing, `cartDiscounts`, `priceQuote`, `toolFormToken`, tool requests, deposit link |
| `apps/api/src/stores/stores-public.controller.ts` | `POST :slug/price-quote`, `GET :slug/tools/:toolId/form-token`, IP to leads |
| `apps/api/src/stores/public-stores.service.ts` | Public items carry `unit`, `tiers` and `optionGroups` (never the proposal) |
| `apps/api/src/stores/request-fields.ts` (new) | `RequestField`, `readRequestFields`, `validateRequestAnswers`, `TOOL_ID_PATTERN`, `REQUEST_TOOLS`, `RequestToolSource` |
| `apps/api/src/stores/tool-form-guard.ts` (new) | Fill-time token, visitor hash, deposit token |
| `apps/api/src/stores/dto/submit-store-lead.dto.ts` | `toolId`, `fields`, `website`, `formToken` |
| `apps/api/src/operations/subscription-enrollment.ts` | Subscription item name carries «20 L» |
| `apps/api/src/operations/subscribers.service.ts` | `lockedUnit` prices through `priceSellingLine` |
| `apps/api/src/payment-intents/payment-intents.service.ts` | Receipt lines show «20 L» and the chosen options |
| `apps/checkout/src/checkout/payment-result.ts` | Receipt page shows «20 L» and options |
| `apps/merchant-dashboard/src/order-lines.mjs` (new), `orders-panel.mjs`, `server.mjs` | Order list label; the dev server serves the new module |
| Specs (new): `tool-checkout.spec.ts`, `tool-price-quote.spec.ts`, `request-fields.spec.ts`, `tool-form-guard.spec.ts`, `tool-leads.spec.ts`, `tool-deposit.spec.ts`, `subscription-units.spec.ts` (api); `test/receipt-units.test.ts` (checkout); `src/order-lines.test.mjs` (dashboard) | |

---

### Task 1: The columns (migration, schema, client)

**Files:**
- Create: `apps/api/prisma/migrations/20261015120000_business_tool_pricing/migration.sql`
- Modify: `apps/api/prisma/schema.prisma`, in three places:
  - `model PaymentLink`, after `discountEndsAt DateTime?`;
  - `model StoreLead`, after `currency String @default("BOB")`;
  - `model StoreOrder`, after `shipment Shipment?`.
- Create (test): `apps/api/src/stores/business-tools-schema.spec.ts`

**Interfaces:**
- Produces:
  - DB columns `PaymentLink.unit`, `.tiers`, `.optionGroups` and `.pricingProposal` (JSONB, nullable).
  - DB columns `StoreLead.toolId TEXT`, `.fields JSONB`, `.visitorHash TEXT` and `.depositOrderId TEXT UNIQUE`, with a foreign key to `StoreOrder(id)` `ON DELETE SET NULL`.
  - The Prisma relation `StoreLead.depositOrder` / `StoreOrder.depositLead` (`"LeadDeposit"`).
  - The index `StoreLead_storeId_visitorHash_createdAt_idx`.

- [ ] **Step 1: Write the failing static test.** Create `apps/api/src/stores/business-tools-schema.spec.ts`:

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Business tools part a (spec 2026-10-14): the columns the selling primitives read. Mocked Prisma cannot see the database, so the
 *  migration and the schema are read as text and must agree. Every column is nullable: no existing product or lead changes. */
const root = join(__dirname, '..', '..', 'prisma');
const sql = readFileSync(join(root, 'migrations', '20261015120000_business_tool_pricing', 'migration.sql'), 'utf8');
const schema = readFileSync(join(root, 'schema.prisma'), 'utf8');
const model = (name: string) => schema.match(new RegExp(`\\nmodel ${name} \\{([\\s\\S]*?)\\n\\}`))![1];

describe('business tools columns (spec 2026-10-14, part a)', () => {
  it('adds the four nullable selling-rule columns to PaymentLink', () => {
    for (const column of ['unit', 'tiers', 'optionGroups', 'pricingProposal']) {
      expect(sql).toContain(`ADD COLUMN "${column}" JSONB`);
      expect(model('PaymentLink')).toMatch(new RegExp(`\\n\\s+${column}\\s+Json\\?`));
    }
  });

  it('adds the request columns to StoreLead, with a unique deposit order that is cleared when the order goes', () => {
    for (const [column, type] of [['toolId', 'TEXT'], ['fields', 'JSONB'], ['visitorHash', 'TEXT'], ['depositOrderId', 'TEXT']]) expect(sql).toContain(`ADD COLUMN "${column}" ${type}`);
    expect(sql).toContain('CREATE UNIQUE INDEX "StoreLead_depositOrderId_key" ON "StoreLead"("depositOrderId");');
    expect(sql).toContain('CREATE INDEX "StoreLead_storeId_visitorHash_createdAt_idx" ON "StoreLead"("storeId", "visitorHash", "createdAt");');
    expect(sql).toContain('FOREIGN KEY ("depositOrderId") REFERENCES "StoreOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE');
    expect(model('StoreLead')).toMatch(/depositOrder\s+StoreOrder\?\s+@relation\("LeadDeposit", fields: \[depositOrderId\], references: \[id\], onDelete: SetNull\)/);
    expect(model('StoreLead')).toContain('@@index([storeId, visitorHash, createdAt])');
    expect(model('StoreOrder')).toMatch(/depositLead\s+StoreLead\?\s+@relation\("LeadDeposit"\)/);
  });

  it('never makes an existing row invalid', () => {
    expect(sql).not.toMatch(/NOT NULL|DEFAULT|UPDATE "|DELETE FROM/);
  });
});
```

- [ ] **Step 2: Run it and see it fail.**
  - Run: `cd apps/api && npx jest src/stores/business-tools-schema.spec.ts`
  - Expected: FAIL with `ENOENT: no such file or directory` for the migration.

- [ ] **Step 3: Write the migration.** Create `apps/api/prisma/migrations/20261015120000_business_tool_pricing/migration.sql`:

```sql
-- Business tools (spec 2026-10-14), part a: selling by unit, volume tiers, builder option groups and YAPI's pending
-- pricing proposal on products; request answers, a visitor hash for the per-visitor throttle and the deposit order on
-- leads. Every column is nullable, so no existing product, lead or order changes.
ALTER TABLE "PaymentLink" ADD COLUMN "unit" JSONB;
ALTER TABLE "PaymentLink" ADD COLUMN "tiers" JSONB;
ALTER TABLE "PaymentLink" ADD COLUMN "optionGroups" JSONB;
ALTER TABLE "PaymentLink" ADD COLUMN "pricingProposal" JSONB;

ALTER TABLE "StoreLead" ADD COLUMN "toolId" TEXT;
ALTER TABLE "StoreLead" ADD COLUMN "fields" JSONB;
ALTER TABLE "StoreLead" ADD COLUMN "visitorHash" TEXT;
ALTER TABLE "StoreLead" ADD COLUMN "depositOrderId" TEXT;
CREATE UNIQUE INDEX "StoreLead_depositOrderId_key" ON "StoreLead"("depositOrderId");
CREATE INDEX "StoreLead_storeId_visitorHash_createdAt_idx" ON "StoreLead"("storeId", "visitorHash", "createdAt");
ALTER TABLE "StoreLead" ADD CONSTRAINT "StoreLead_depositOrderId_fkey" FOREIGN KEY ("depositOrderId") REFERENCES "StoreOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

- [ ] **Step 4: Edit the schema.**

(a) In `model PaymentLink`, after:
```prisma
  discountPercent       Int?
  discountStartsAt      DateTime?
  discountEndsAt        DateTime?
```
insert:
```prisma
  // Business tools (spec 2026-10-14). Approved selling rules read by stores/selling-rules.ts: a unit with steps
  // { label, step, min, max }, volume tiers [{ from, unitAmount }] and builder option groups. Anything malformed or
  // stale prices nothing. pricingProposal is YAPI's pending proposal: the server never prices from it; approval copies it
  // into the live fields and clears it.
  unit                  Json?
  tiers                 Json?
  optionGroups          Json?
  pricingProposal       Json?
```

(b) In `model StoreLead`, after:
```prisma
  amount        Int
  currency      String   @default("BOB")
```
insert:
```prisma
  // Business tools (spec 2026-10-14): the approved request tool, its validated answers [{ id, label, value }], a salted
  // visitor hash for the 3-per-10-minutes throttle, and the deposit order paid after the request.
  toolId         String?
  fields         Json?
  visitorHash    String?
  depositOrderId String?     @unique
  depositOrder   StoreOrder? @relation("LeadDeposit", fields: [depositOrderId], references: [id], onDelete: SetNull)
```
and, after `@@index([storeId, createdAt])` inside the same model, add:
```prisma
  @@index([storeId, visitorHash, createdAt])
```

(c) In `model StoreOrder`, after:
```prisma
  parcel                  Json?
  shipment                Shipment?
```
insert:
```prisma
  depositLead             StoreLead?              @relation("LeadDeposit")
```

- [ ] **Step 5: Validate the schema and regenerate the client.** This is the only task that regenerates it.
  - Run: `cd apps/api && npx prisma validate && npx prisma generate`
  - Expected: `The schema at prisma/schema.prisma is valid`, then `Generated Prisma Client`.
  - **Do not** run any `migrate` command.

- [ ] **Step 6: Run the test and see it pass.**
  - Run: `cd apps/api && npx jest src/stores/business-tools-schema.spec.ts`
  - Expected: PASS (3 tests).

- [ ] **Step 7: Commit.**

```bash
git add apps/api/prisma/migrations/20261015120000_business_tool_pricing/migration.sql apps/api/prisma/schema.prisma apps/api/src/stores/business-tools-schema.spec.ts
git commit -m "feat(tools): columns for selling by unit, tiers, option groups, pricing proposals and request leads

Owner step: cd apps/api && npx prisma migrate deploy

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The selling rules (`selling-rules.ts`)

**Files:**
- Create: `apps/api/src/stores/selling-rules.ts`
- Create (test): `apps/api/src/stores/selling-rules.spec.ts`
- Create: `apps/api/src/stores/request-fields.ts` (only `TOOL_ID_PATTERN` in this task; Task 8 adds the rest)

**Interfaces:**
- Consumes:
  - `discountedProductAmount`, `readProductVariants` and `DiscountableProduct` from `./product-pricing`.
  - `subscriptionPrices`, `CADENCES` and `Cadence` from `../operations/subscription-pricing`.
  - `SAFE_TEXT_PATTERN` from `../common/validation/safe-text.decorator`.
- Produces (used by plans b and c with these exact names):
  ```ts
  export const UNIT_SCALE = 1000; export const UNIT_LABEL_MAX = 12; export const MAX_LINE_STEPS = 999; export const MAX_TIERS = 6;
  export const MAX_OPTION_GROUPS = 8; export const MAX_OPTION_CHOICES = 12; export const OPTION_TEXT_MAX = 140; export const MAX_AMOUNT = 100_000_000;
  export const OPTION_ID_PATTERN: RegExp; // /^[a-z0-9][a-z0-9-]{0,31}$/
  export type SellingUnit = { label: string; step: number; min: number; max: number };
  export type VolumeTier = { from: number; unitAmount: number };
  export type OptionChoice = { id: string; label: string; amountDelta: number };
  export type OptionGroup = { id: string; label: string; type: 'single' | 'multi' | 'text'; required: boolean; choices?: OptionChoice[]; maxLength?: number };
  export type ChosenOptions = Record<string, string[] | string>;
  export type ChosenOption = { groupId: string; group: string; values: string[] };
  export type LineUnit = { label: string; step: number; units: number };
  export type SellingProduct = DiscountableProduct & { name: string; amount: number; variants?: unknown; unit?: unknown; tiers?: unknown; optionGroups?: unknown };
  export type SellingLinePrice = { unitAmount: number; lockedUnitAmount: number | null; lineAmount: number; unit: LineUnit | null; tier: VolumeTier | null; nextTier: (VolumeTier & { unitsToGo: number }) | null; saving: number; options: ChosenOption[]; optionsKey: string; quantityLabel: string; optionsLabel: string };
  export type PricingProposal = { toolId: string; unit?: SellingUnit; tiers?: VolumeTier[]; optionGroups?: OptionGroup[]; subscription?: { cadences: Cadence[]; discountPercent: number }; deposit?: { amount: number; relatedProductIds: string[] }; merchantSet?: boolean };
  export function toMilli(value: number): number;
  export function readSellingUnit(value: unknown): SellingUnit | null;
  export function readVolumeTiers(value: unknown, unit: SellingUnit | null, baseAmount: number): VolumeTier[];
  export function readOptionGroups(value: unknown): OptionGroup[];
  export function stepAmount(unitAmount: number, unit: SellingUnit): number;
  export function tierFor(tiers: VolumeTier[], unitsMilli: number): VolumeTier | null;
  export function nextTierFor(tiers: VolumeTier[], unitsMilli: number, unit: SellingUnit): (VolumeTier & { unitsToGo: number }) | null;
  export function formatUnits(units: number): string;
  export function optionsKey(chosen: ChosenOptions | undefined): string;
  export function resolveOptions(productName: string, groups: OptionGroup[], chosen: ChosenOptions | undefined): { amountDelta: number; chosen: ChosenOption[]; key: string };
  export function priceSellingLine(input: { product: SellingProduct; variant?: ProductVariant; extrasAmount?: number; quantity: number; options?: ChosenOptions; cadenceDiscountPercent?: number | null; now?: Date }): SellingLinePrice;
  export function readPricingProposal(value: unknown, baseAmount: number): PricingProposal | null;
  export function sellingRulesPublic(product: { amount: number; variants?: unknown; unit?: unknown; tiers?: unknown; optionGroups?: unknown }): { unit: SellingUnit | null; tiers: VolumeTier[]; optionGroups: OptionGroup[] };
  ```
  - From `request-fields.ts`: `export const TOOL_ID_PATTERN = /^tl[a-f0-9]{18}$/;`

- [ ] **Step 1: Live-stack check.** Run the command from Global Constraints and continue only on `[0,0]`.

- [ ] **Step 2: Write the failing test.** Create `apps/api/src/stores/selling-rules.spec.ts`:

```ts
import { formatUnits, nextTierFor, optionsKey, priceSellingLine, readOptionGroups, readPricingProposal, readSellingUnit, readVolumeTiers, resolveOptions, sellingRulesPublic, stepAmount, tierFor, toMilli } from './selling-rules';

/** Business tools part a (spec 2026-10-14): unit and tier math to the cent, options, and the order of discounts. */
const NO_SALE = { discountPercent: null, discountStartsAt: null, discountEndsAt: null };
const LITRE = { label: 'L', step: 0.5, min: 1, max: 100 };
const LECHE = { name: 'Leche entera', amount: 720, variants: [], unit: LITRE, tiers: [{ from: 1, unitAmount: 720 }, { from: 15, unitAmount: 690 }, { from: 30, unitAmount: 650 }], ...NO_SALE };
const TORTA = { name: 'Torta', amount: 15000, variants: [], ...NO_SALE, optionGroups: [
  { id: 'size', label: 'Tamaño', type: 'single', required: true, choices: [{ id: 's', label: 'Chica', amountDelta: 0 }, { id: 'l', label: 'Grande', amountDelta: 6000 }] },
  { id: 'extras', label: 'Decoración', type: 'multi', required: false, choices: [{ id: 'fruit', label: 'Frutas', amountDelta: 1500 }, { id: 'gold', label: 'Dorado', amountDelta: 2500 }] },
  { id: 'note', label: 'Mensaje', type: 'text', required: false, maxLength: 40 },
] };
const SALE_20 = { discountPercent: 20, discountStartsAt: new Date('2000-01-01T00:00:00Z'), discountEndsAt: new Date('2100-01-01T00:00:00Z') };

describe('readSellingUnit', () => {
  it('keeps a valid unit', () => {
    expect(readSellingUnit({ label: ' L ', step: 0.5, min: 1, max: 100 })).toEqual({ label: 'L', step: 0.5, min: 1, max: 100 });
    expect(readSellingUnit({ label: 'persona', step: 1, min: 2, max: 40 })).toEqual({ label: 'persona', step: 1, min: 2, max: 40 });
  });
  it.each([
    ['a 13-character label', { label: 'litrosdeleche', step: 1, min: 1, max: 10 }],
    ['markup in the label', { label: '<b>L</b>', step: 1, min: 1, max: 10 }],
    ['a bidi override in the label', { label: 'L‮', step: 1, min: 1, max: 10 }],
    ['a zero step', { label: 'L', step: 0, min: 1, max: 10 }],
    ['a step finer than a thousandth', { label: 'kg', step: 0.0005, min: 0.001, max: 1 }],
    ['a minimum off the step', { label: 'L', step: 0.5, min: 0.75, max: 10 }],
    ['a maximum below the minimum', { label: 'L', step: 1, min: 5, max: 4 }],
    ['more than 999 steps', { label: 'L', step: 0.1, min: 0.1, max: 100 }],
    ['a string number', { label: 'L', step: '1', min: 1, max: 10 }],
    ['an array', [1, 2]],
  ])('refuses %s', (_name, value) => {
    expect(readSellingUnit(value)).toBeNull();
  });
});

describe('unit and tier math to the cent', () => {
  it('counts units in thousandths and prices one step in whole cents', () => {
    expect(toMilli(0.3) * 3).toBe(900);
    expect(stepAmount(720, LITRE)).toBe(360);
    expect(stepAmount(725, LITRE)).toBe(363); // 362,5 rounds half up
  });

  it('14,5 L stays on the base price; 15 L reaches the «desde 15 L» tier', () => {
    const below = priceSellingLine({ product: LECHE, quantity: 29 });
    expect(below).toMatchObject({ unitAmount: 360, lineAmount: 10440, tier: null, saving: 0, quantityLabel: '14,5 L', unit: { label: 'L', step: 0.5, units: 14.5 } });
    expect(below.nextTier).toEqual({ from: 15, unitAmount: 690, unitsToGo: 0.5 });
    const at = priceSellingLine({ product: LECHE, quantity: 30 });
    expect(at).toMatchObject({ unitAmount: 345, lineAmount: 10350, tier: { from: 15, unitAmount: 690 }, saving: 450, quantityLabel: '15 L' });
    expect(at.nextTier).toEqual({ from: 30, unitAmount: 650, unitsToGo: 15 });
  });

  it('20 L costs exactly unitAmount × units and shows the saving against the base price', () => {
    expect(priceSellingLine({ product: LECHE, quantity: 40 })).toMatchObject({ unitAmount: 345, lineAmount: 13800, saving: 600, quantityLabel: '20 L' });
    expect(priceSellingLine({ product: LECHE, quantity: 200 })).toMatchObject({ unitAmount: 325, lineAmount: 65000, tier: { from: 30, unitAmount: 650 }, nextTier: null });
  });

  it('3 × 0,3 kg reaches the 0,9 kg tier although 3 * 0.3 is 0.8999999999999999 in floats', () => {
    const quinua = { name: 'Quinua', amount: 1000, variants: [], unit: { label: 'kg', step: 0.3, min: 0.3, max: 30 }, tiers: [{ from: 0.3, unitAmount: 1000 }, { from: 0.9, unitAmount: 900 }], ...NO_SALE };
    expect(priceSellingLine({ product: quinua, quantity: 3 })).toMatchObject({ unitAmount: 270, lineAmount: 810, tier: { from: 0.9, unitAmount: 900 }, quantityLabel: '0,9 kg' });
    expect(priceSellingLine({ product: quinua, quantity: 2 })).toMatchObject({ unitAmount: 300, tier: null, nextTier: { from: 0.9, unitAmount: 900, unitsToGo: 0.3 } });
  });

  it('refuses units outside the product range, never clamps them', () => {
    expect(() => priceSellingLine({ product: LECHE, quantity: 1 })).toThrow('Elige entre 1 y 100 L de "Leche entera"');
    expect(() => priceSellingLine({ product: LECHE, quantity: 201 })).toThrow('Elige entre 1 y 100 L de "Leche entera"');
    expect(() => priceSellingLine({ product: LECHE, quantity: 0 })).toThrow('Revisa la cantidad de "Leche entera"');
    expect(() => priceSellingLine({ product: LECHE, quantity: 2.5 })).toThrow('Revisa la cantidad de "Leche entera"');
  });

  it('stale tiers price nothing: a product whose price changed after approval is charged its new price, with no tier', () => {
    const repriced = { ...LECHE, amount: 800 };
    expect(readVolumeTiers(repriced.tiers, LITRE, 800)).toEqual([]);
    expect(priceSellingLine({ product: repriced, quantity: 40 })).toMatchObject({ unitAmount: 400, lineAmount: 16000, tier: null, nextTier: null, saving: 0 });
  });

  it('a product with variants is never sold by unit, so a step count is plain pieces at the variant price', () => {
    const withVariants = { ...LECHE, variants: [{ id: 'v1', name: 'Deslactosada', amount: 900 }] };
    expect(priceSellingLine({ product: withVariants, variant: { id: 'v1', name: 'Deslactosada', amount: 900 }, quantity: 3 })).toMatchObject({ unit: null, unitAmount: 900, lineAmount: 2700, quantityLabel: '× 3', tier: null });
    expect(sellingRulesPublic(withVariants)).toEqual({ unit: null, tiers: [], optionGroups: [] });
  });

  it('refuses tiers that do not decrease, skip the minimum, fall off the step or the range', () => {
    expect(readVolumeTiers([{ from: 1, unitAmount: 720 }, { from: 15, unitAmount: 720 }], LITRE, 720)).toEqual([]);
    expect(readVolumeTiers([{ from: 2, unitAmount: 720 }, { from: 15, unitAmount: 690 }], LITRE, 720)).toEqual([]);
    expect(readVolumeTiers([{ from: 1, unitAmount: 720 }, { from: 15.25, unitAmount: 690 }], LITRE, 720)).toEqual([]);
    expect(readVolumeTiers([{ from: 1, unitAmount: 720 }, { from: 150, unitAmount: 690 }], LITRE, 720)).toEqual([]);
    expect(readVolumeTiers([{ from: 1, unitAmount: 720 }, { from: 15, unitAmount: 6.9 }], LITRE, 720)).toEqual([]);
    expect(readVolumeTiers(LECHE.tiers, null, 720)).toEqual([]);
    expect(tierFor(readVolumeTiers(LECHE.tiers, LITRE, 720), 2000)).toBeNull();
    expect(nextTierFor([], 2000, LITRE)).toBeNull();
  });
});

describe('the order of discounts on a line', () => {
  it('tier first, then the sale on the step price', () => {
    expect(priceSellingLine({ product: { ...LECHE, ...SALE_20 }, quantity: 30 })).toMatchObject({ unitAmount: 276, lineAmount: 8280, lockedUnitAmount: null });
  });
  it('a subscription pays min(sale, cadence) today and the cadence price on the tier from then on', () => {
    expect(priceSellingLine({ product: { ...LECHE, ...SALE_20 }, quantity: 30, cadenceDiscountPercent: 10 })).toMatchObject({ unitAmount: 276, lockedUnitAmount: 311 });
    expect(priceSellingLine({ product: LECHE, quantity: 30, cadenceDiscountPercent: 10 })).toMatchObject({ unitAmount: 311, lockedUnitAmount: 311, lineAmount: 9330 });
  });
  it('keeps every existing product priced exactly as discountedProductAmount + extras did', () => {
    const cafe = { name: 'Café', amount: 8000, variants: [], ...NO_SALE };
    expect(priceSellingLine({ product: cafe, quantity: 2, extrasAmount: 500 })).toMatchObject({ unitAmount: 8500, lineAmount: 17000, unit: null, quantityLabel: '× 2', options: [], optionsLabel: '' });
    expect(priceSellingLine({ product: { ...cafe, discountPercent: 25, discountStartsAt: SALE_20.discountStartsAt, discountEndsAt: SALE_20.discountEndsAt }, quantity: 1 })).toMatchObject({ unitAmount: 6000 });
    expect(priceSellingLine({ product: cafe, quantity: 1, cadenceDiscountPercent: 10 })).toMatchObject({ unitAmount: 7200, lockedUnitAmount: 7200 });
  });
});

describe('builder options', () => {
  const groups = readOptionGroups(TORTA.optionGroups);
  it('adds the deltas and keeps the chosen labels in the product order', () => {
    const price = priceSellingLine({ product: TORTA, quantity: 2, options: { size: ['l'], extras: ['gold', 'fruit'], note: '  Feliz día, Ana ' } });
    expect(price).toMatchObject({ unitAmount: 25000, lineAmount: 50000 });
    expect(price.options).toEqual([
      { groupId: 'size', group: 'Tamaño', values: ['Grande'] },
      { groupId: 'extras', group: 'Decoración', values: ['Frutas', 'Dorado'] },
      { groupId: 'note', group: 'Mensaje', values: ['Feliz día, Ana'] },
    ]);
    expect(price.optionsLabel).toBe('Tamaño: Grande · Decoración: Frutas, Dorado · Mensaje: Feliz día, Ana');
  });
  it.each([
    ['a missing required group', {}, 'Elige «Tamaño» para "Torta"'],
    ['an unknown choice', { size: ['xl'] }, 'Una opción de "Torta" ya no está disponible'],
    ['an unknown group', { size: ['s'], color: ['red'] }, 'Una opción de "Torta" ya no está disponible'],
    ['two choices in a single group', { size: ['s', 'l'] }, 'Revisa «Tamaño» en "Torta"'],
    ['a repeated choice', { size: ['s'], extras: ['gold', 'gold'] }, 'Revisa «Decoración» en "Torta"'],
    ['text over the limit', { size: ['s'], note: 'x'.repeat(41) }, 'Revisa «Mensaje» en "Torta"'],
    ['a control character in the text', { size: ['s'], note: 'hola‮' }, 'Revisa «Mensaje» en "Torta"'],
    ['a list for the text', { size: ['s'], note: ['hola'] }, 'Revisa «Mensaje» en "Torta"'],
  ])('refuses %s', (_name, chosen, message) => {
    expect(() => resolveOptions('Torta', groups, chosen as never)).toThrow(message);
  });
  it('refuses options on a product without option groups', () => {
    expect(() => priceSellingLine({ product: LECHE, quantity: 40, options: { size: ['l'] } })).toThrow('"Leche entera" no tiene opciones para elegir');
  });
  it('gives the same key whatever order the browser sent', () => {
    expect(optionsKey({ size: ['l'], extras: ['gold', 'fruit'] })).toBe(optionsKey({ extras: ['fruit', 'gold'], size: ['l'] }));
    expect(optionsKey({ size: ['l'], note: 'Ana' })).not.toBe(optionsKey({ size: ['l'], note: 'Luis' }));
    expect(optionsKey(undefined)).toBe('');
  });
  it('reads only well-formed groups', () => {
    expect(readOptionGroups([{ id: 'Size', label: 'Tamaño', type: 'single', required: true, choices: [{ id: 's', label: 'Chica', amountDelta: 0 }] }])).toEqual([]);
    expect(readOptionGroups([{ id: 'size', label: 'Tamaño', type: 'single', required: true, choices: [{ id: 's', label: 'Chica', amountDelta: -1 }] }])).toEqual([]);
    expect(readOptionGroups([{ id: 'note', label: 'Mensaje', type: 'text', required: false, maxLength: 141 }])).toEqual([]);
    expect(readOptionGroups(Array.from({ length: 9 }, (_, i) => ({ id: `g${i}`, label: 'G', type: 'text', required: false, maxLength: 10 })))).toEqual([]);
  });
});

describe('proposals and the public projection', () => {
  it('reads a proposal structurally and never needs it to price', () => {
    const proposal = { toolId: 'tl0123456789abcdef01', unit: LITRE, tiers: LECHE.tiers, subscription: { cadences: ['WEEKLY'], discountPercent: 10 } };
    expect(readPricingProposal(proposal, 720)).toEqual(proposal);
    expect(readPricingProposal({ ...proposal, toolId: 'nope' }, 720)).toBeNull();
    expect(readPricingProposal({ ...proposal, subscription: { cadences: ['DAILY'], discountPercent: 10 } }, 720)).toBeNull();
    const plain = { name: 'Leche entera', amount: 720, variants: [], pricingProposal: proposal, ...NO_SALE };
    expect(priceSellingLine({ product: plain, quantity: 40 })).toMatchObject({ unit: null, unitAmount: 720, lineAmount: 28800 });
  });
  it('shows the live rules only', () => {
    expect(sellingRulesPublic(LECHE)).toEqual({ unit: LITRE, tiers: LECHE.tiers, optionGroups: [] });
    expect(formatUnits(14.5)).toBe('14,5');
    expect(formatUnits(0.25)).toBe('0,25');
  });
});
```

- [ ] **Step 3: Run it and see it fail.**
  - Run: `cd apps/api && npx jest src/stores/selling-rules.spec.ts`
  - Expected: FAIL, `Cannot find module './selling-rules'`.

- [ ] **Step 4: Write `request-fields.ts` with the shared tool id pattern.** Create `apps/api/src/stores/request-fields.ts`:

```ts
/** Business tools (spec 2026-10-14): a tool id as StoreTool rows and the kit mount (data-pagosya-tool) carry it. */
export const TOOL_ID_PATTERN = /^tl[a-f0-9]{18}$/;
```

- [ ] **Step 5: Write the rules.** Create `apps/api/src/stores/selling-rules.ts`:

```ts
/**
 * Business tools, part a (spec 2026-10-14). The selling rules a product may carry beyond its price:
 * - a unit with steps (0,5 L);
 * - volume tiers;
 * - builder option groups;
 * and the one function that prices a cart quantity from them, priceSellingLine.
 *
 * Cart checkout, the price quote, leads and subscription repricing all call priceSellingLine, so a tool's total and the
 * charge cannot drift. The function is pure: no Prisma, and no clock except `now`.
 *
 * Money is whole cents. Units are counted in thousandths (UNIT_SCALE), so 3 × 0,3 kg is exactly 0,9 kg. A cart quantity
 * of a unit product counts steps, and one step costs stepAmount(), a whole number of cents. Every consumer that
 * multiplies unitAmount by quantity (receipts, renewals, bundles, analytics) therefore stays exact.
 */
import { BadRequestException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { SAFE_TEXT_PATTERN } from '../common/validation/safe-text.decorator';
import { CADENCES, subscriptionPrices, type Cadence } from '../operations/subscription-pricing';
import type { ProductVariant } from '../payment-links/product-variants';
import { discountedProductAmount, readProductVariants, type DiscountableProduct } from './product-pricing';
import { TOOL_ID_PATTERN } from './request-fields';

export const UNIT_SCALE = 1000;
export const UNIT_LABEL_MAX = 12;
export const MAX_LINE_STEPS = 999;
export const MAX_TIERS = 6;
export const MAX_OPTION_GROUPS = 8;
export const MAX_OPTION_CHOICES = 12;
export const OPTION_TEXT_MAX = 140;
/** Bs 1.000.000 in cents: no stored price or delta is ever above it. */
export const MAX_AMOUNT = 100_000_000;
export const OPTION_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,31}$/;
const OPTION_LABEL_MAX = 60;
const UNIT_MAX = 10_000;

export type SellingUnit = { label: string; step: number; min: number; max: number };
export type VolumeTier = { from: number; unitAmount: number };
export type OptionChoice = { id: string; label: string; amountDelta: number };
export type OptionGroup = { id: string; label: string; type: 'single' | 'multi' | 'text'; required: boolean; choices?: OptionChoice[]; maxLength?: number };
export type ChosenOptions = Record<string, string[] | string>;
export type ChosenOption = { groupId: string; group: string; values: string[] };
export type LineUnit = { label: string; step: number; units: number };
export type SellingProduct = DiscountableProduct & { name: string; amount: number; variants?: unknown; unit?: unknown; tiers?: unknown; optionGroups?: unknown };
export type SellingLinePrice = {
  /** What one cart quantity costs today (one step for a unit product), whole cents, after the sale and the cadence. */
  unitAmount: number;
  /** A subscription line's renewal price per quantity; null for one-time lines. */
  lockedUnitAmount: number | null;
  lineAmount: number;
  unit: LineUnit | null;
  /** The discounting tier that applies (never the first, base-price tier). */
  tier: VolumeTier | null;
  nextTier: (VolumeTier & { unitsToGo: number }) | null;
  /** What the tier saves on this line against the base price, before the sale and the cadence. */
  saving: number;
  options: ChosenOption[];
  optionsKey: string;
  /** «20 L» for a unit line, «× 2» otherwise. */
  quantityLabel: string;
  optionsLabel: string;
};
export type PricingProposal = {
  toolId: string; unit?: SellingUnit; tiers?: VolumeTier[]; optionGroups?: OptionGroup[];
  subscription?: { cadences: Cadence[]; discountPercent: number };
  deposit?: { amount: number; relatedProductIds: string[] };
  /** The merchant edited these numbers in «Herramientas por aprobar»; plan c lets a merchant-set deposit pass the 50 % rule. */
  merchantSet?: boolean;
};

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
export const toMilli = (value: number) => Math.round(value * UNIT_SCALE);
/** A positive amount of units with at most three decimals, in thousandths; null otherwise. */
function exactMilli(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  const scaled = value * UNIT_SCALE;
  return Math.abs(scaled - Math.round(scaled)) < 1e-6 ? Math.round(scaled) : null;
}
function cleanLabel(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text && text.length <= max && SAFE_TEXT_PATTERN.test(text) && !/[<>]/.test(text) ? text : null;
}
const amountOk = (value: unknown, min: number): value is number => Number.isSafeInteger(value) && (value as number) >= min && (value as number) <= MAX_AMOUNT;

export function readSellingUnit(value: unknown): SellingUnit | null {
  if (!isRecord(value)) return null;
  const label = cleanLabel(value.label, UNIT_LABEL_MAX);
  const step = exactMilli(value.step), min = exactMilli(value.min), max = exactMilli(value.max);
  if (!label || !step || !min || !max) return null;
  if (min % step || max % step || min > max || max / step > MAX_LINE_STEPS || max > UNIT_MAX * UNIT_SCALE) return null;
  return { label, step: step / UNIT_SCALE, min: min / UNIT_SCALE, max: max / UNIT_SCALE };
}

/** Tiers derive from the real price: the first starts at the unit minimum at the product's own amount. Any other shape, or
 *  a product whose amount changed since approval, reads as no tiers (Review Focus 2). */
export function readVolumeTiers(value: unknown, unit: SellingUnit | null, baseAmount: number): VolumeTier[] {
  if (!unit || !Array.isArray(value) || !value.length || value.length > MAX_TIERS) return [];
  const step = toMilli(unit.step), max = toMilli(unit.max);
  const tiers: VolumeTier[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) return [];
    const from = exactMilli(entry.from);
    if (from === null || from % step || from > max || !amountOk(entry.unitAmount, 1)) return [];
    const previous = tiers.at(-1);
    if (previous && (from <= toMilli(previous.from) || entry.unitAmount >= previous.unitAmount)) return [];
    tiers.push({ from: from / UNIT_SCALE, unitAmount: entry.unitAmount });
  }
  if (toMilli(tiers[0].from) !== toMilli(unit.min) || tiers[0].unitAmount !== baseAmount) return [];
  return tiers;
}

export function readOptionGroups(value: unknown): OptionGroup[] {
  if (!Array.isArray(value) || value.length > MAX_OPTION_GROUPS) return [];
  const groups: OptionGroup[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) return [];
    const id = typeof entry.id === 'string' && OPTION_ID_PATTERN.test(entry.id) ? entry.id : null;
    const label = cleanLabel(entry.label, OPTION_LABEL_MAX);
    if (!id || !label || groups.some(group => group.id === id) || typeof entry.required !== 'boolean') return [];
    if (entry.type === 'text') {
      if (!Number.isInteger(entry.maxLength) || (entry.maxLength as number) < 1 || (entry.maxLength as number) > OPTION_TEXT_MAX) return [];
      groups.push({ id, label, type: 'text', required: entry.required, maxLength: entry.maxLength as number });
      continue;
    }
    if ((entry.type !== 'single' && entry.type !== 'multi') || !Array.isArray(entry.choices) || !entry.choices.length || entry.choices.length > MAX_OPTION_CHOICES) return [];
    const choices: OptionChoice[] = [];
    for (const choice of entry.choices) {
      if (!isRecord(choice)) return [];
      const choiceId = typeof choice.id === 'string' && OPTION_ID_PATTERN.test(choice.id) ? choice.id : null;
      const choiceLabel = cleanLabel(choice.label, OPTION_LABEL_MAX);
      if (!choiceId || !choiceLabel || choices.some(known => known.id === choiceId) || !amountOk(choice.amountDelta, 0)) return [];
      choices.push({ id: choiceId, label: choiceLabel, amountDelta: choice.amountDelta });
    }
    groups.push({ id, label, type: entry.type, required: entry.required, choices });
  }
  return groups;
}

/** One step's price in whole cents, half up. */
export function stepAmount(unitAmount: number, unit: SellingUnit): number {
  return Math.round(unitAmount * toMilli(unit.step) / UNIT_SCALE);
}
/** The discounting tier for this many units; the first tier is the base price and reads as none. */
export function tierFor(tiers: VolumeTier[], unitsMilli: number): VolumeTier | null {
  const index = tiers.reduce((found, tier, at) => toMilli(tier.from) <= unitsMilli ? at : found, -1);
  return index > 0 ? tiers[index] : null;
}
export function nextTierFor(tiers: VolumeTier[], unitsMilli: number, unit: SellingUnit): (VolumeTier & { unitsToGo: number }) | null {
  const next = tiers.find(tier => toMilli(tier.from) > unitsMilli && toMilli(tier.from) <= toMilli(unit.max));
  return next ? { ...next, unitsToGo: (toMilli(next.from) - unitsMilli) / UNIT_SCALE } : null;
}
const UNITS_FORMAT = new Intl.NumberFormat('es-BO', { maximumFractionDigits: 3, useGrouping: false });
export function formatUnits(units: number): string { return UNITS_FORMAT.format(units); }

/** A stable key for a line's choices: the same cake asked twice merges, two different messages do not. */
export function optionsKey(chosen: ChosenOptions | undefined): string {
  if (!chosen) return '';
  const entries = Object.keys(chosen).sort().map(key => {
    const value = chosen[key];
    return [key, Array.isArray(value) ? [...value].sort() : String(value).trim()];
  });
  return entries.length ? JSON.stringify(entries) : '';
}

/** Checks what the buyer chose against the approved groups and adds up the deltas. Never trusts a label or an amount. */
export function resolveOptions(productName: string, groups: OptionGroup[], chosen: ChosenOptions | undefined): { amountDelta: number; chosen: ChosenOption[]; key: string } {
  const given: Record<string, unknown> = isRecord(chosen) ? chosen : {};
  const keys = Object.keys(given);
  if (keys.length && !groups.length) throw new BadRequestException(`"${productName}" no tiene opciones para elegir`);
  if (keys.some(key => !groups.some(group => group.id === key))) throw new BadRequestException(`Una opción de "${productName}" ya no está disponible`);
  let amountDelta = 0;
  const picked: ChosenOption[] = [];
  for (const group of groups) {
    const value = given[group.id];
    if (group.type === 'text') {
      const text = value === undefined ? '' : typeof value === 'string' ? value.trim() : null;
      if (text === null || text.length > (group.maxLength ?? OPTION_TEXT_MAX) || !SAFE_TEXT_PATTERN.test(text)) throw new BadRequestException(`Revisa «${group.label}» en "${productName}"`);
      if (!text) { if (group.required) throw new BadRequestException(`Completa «${group.label}» para "${productName}"`); continue; }
      picked.push({ groupId: group.id, group: group.label, values: [text] });
      continue;
    }
    const ids = value === undefined ? [] : Array.isArray(value) && value.every(id => typeof id === 'string') ? value as string[] : null;
    if (ids === null || new Set(ids).size !== ids.length || (group.type === 'single' && ids.length > 1)) throw new BadRequestException(`Revisa «${group.label}» en "${productName}"`);
    if (!ids.length) { if (group.required) throw new BadRequestException(`Elige «${group.label}» para "${productName}"`); continue; }
    if (ids.some(id => !group.choices!.some(choice => choice.id === id))) throw new BadRequestException(`Una opción de "${productName}" ya no está disponible`);
    const choices = group.choices!.filter(choice => ids.includes(choice.id));
    amountDelta += choices.reduce((sum, choice) => sum + choice.amountDelta, 0);
    picked.push({ groupId: group.id, group: group.label, values: choices.map(choice => choice.label) });
  }
  return { amountDelta, chosen: picked, key: optionsKey(chosen) };
}

/**
 * Prices one cart line. The order of discounts (spec part a.2):
 * 1. the tier unit price, plus option deltas, becomes the step price;
 * 2. the time-windowed sale;
 * 3. the Subscribe & Save cadence, through today's subscriptionPrices (the first order pays min(sale, cadence); renewals
 *    pay the cadence price);
 * 4. promo or bundle on the subtotal, done by the caller.
 */
export function priceSellingLine(input: { product: SellingProduct; variant?: ProductVariant; extrasAmount?: number; quantity: number; options?: ChosenOptions; cadenceDiscountPercent?: number | null; now?: Date }): SellingLinePrice {
  const { product, variant, quantity } = input;
  const extrasAmount = input.extrasAmount ?? 0;
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_LINE_STEPS) throw new BadRequestException(`Revisa la cantidad de "${product.name}"`);
  const variants = readProductVariants((product.variants ?? []) as Prisma.JsonValue);
  const unit = variants.length ? null : readSellingUnit(product.unit);
  const options = resolveOptions(product.name, readOptionGroups(product.optionGroups), input.options);
  const base = variant?.amount ?? product.amount;
  let perQuantity = base + options.amountDelta;
  let listPerQuantity = perQuantity;
  let lineUnit: LineUnit | null = null;
  let tier: VolumeTier | null = null;
  let nextTier: (VolumeTier & { unitsToGo: number }) | null = null;
  if (unit) {
    const units = quantity * toMilli(unit.step);
    if (units < toMilli(unit.min) || units > toMilli(unit.max)) throw new BadRequestException(`Elige entre ${formatUnits(unit.min)} y ${formatUnits(unit.max)} ${unit.label} de "${product.name}"`);
    const tiers = readVolumeTiers(product.tiers, unit, product.amount);
    tier = tierFor(tiers, units);
    nextTier = nextTierFor(tiers, units, unit);
    perQuantity = stepAmount((tier?.unitAmount ?? base) + options.amountDelta, unit);
    listPerQuantity = stepAmount(base + options.amountDelta, unit);
    lineUnit = { label: unit.label, step: unit.step, units: units / UNIT_SCALE };
  }
  const now = input.now ?? new Date();
  const sale = discountedProductAmount(product, perQuantity, now);
  let unitAmount = sale + extrasAmount;
  let lockedUnitAmount: number | null = null;
  if (input.cadenceDiscountPercent !== undefined && input.cadenceDiscountPercent !== null) {
    const prices = subscriptionPrices({ baseAmount: perQuantity, oneTimeAmount: sale, extrasAmount, discountPercent: input.cadenceDiscountPercent });
    unitAmount = prices.firstUnitAmount;
    lockedUnitAmount = prices.lockedUnitAmount;
  }
  return {
    unitAmount, lockedUnitAmount, lineAmount: unitAmount * quantity, unit: lineUnit, tier, nextTier,
    saving: (listPerQuantity - perQuantity) * quantity,
    options: options.chosen, optionsKey: options.key,
    quantityLabel: lineUnit ? `${formatUnits(lineUnit.units)} ${lineUnit.label}` : `× ${quantity}`,
    optionsLabel: options.chosen.map(option => `${option.group}: ${option.values.join(', ')}`).join(' · '),
  };
}

/** YAPI's pending proposal, read only to show and approve it (plan c). Never an input to priceSellingLine. */
export function readPricingProposal(value: unknown, baseAmount: number): PricingProposal | null {
  if (!isRecord(value) || typeof value.toolId !== 'string' || !TOOL_ID_PATTERN.test(value.toolId)) return null;
  const proposal: PricingProposal = { toolId: value.toolId };
  if (value.unit !== undefined) {
    const unit = readSellingUnit(value.unit);
    if (!unit) return null;
    proposal.unit = unit;
  }
  if (value.tiers !== undefined) {
    const tiers = readVolumeTiers(value.tiers, proposal.unit ?? null, baseAmount);
    if (!tiers.length) return null;
    proposal.tiers = tiers;
  }
  if (value.optionGroups !== undefined) {
    const groups = readOptionGroups(value.optionGroups);
    if (!groups.length) return null;
    proposal.optionGroups = groups;
  }
  if (value.subscription !== undefined) {
    const sub = value.subscription;
    if (!isRecord(sub) || !Array.isArray(sub.cadences) || !sub.cadences.length || sub.cadences.length > CADENCES.length || new Set(sub.cadences).size !== sub.cadences.length
      || !sub.cadences.every(cadence => (CADENCES as readonly unknown[]).includes(cadence)) || !Number.isInteger(sub.discountPercent) || (sub.discountPercent as number) < 0 || (sub.discountPercent as number) > 99) return null;
    proposal.subscription = { cadences: sub.cadences as Cadence[], discountPercent: sub.discountPercent as number };
  }
  if (value.deposit !== undefined) {
    const deposit = value.deposit;
    if (!isRecord(deposit) || !amountOk(deposit.amount, 1) || !Array.isArray(deposit.relatedProductIds) || deposit.relatedProductIds.length > 12 || !deposit.relatedProductIds.every(id => typeof id === 'string' && id.length <= 40)) return null;
    proposal.deposit = { amount: deposit.amount, relatedProductIds: deposit.relatedProductIds as string[] };
  }
  if (value.merchantSet === true) proposal.merchantSet = true;
  return proposal;
}

/** The live rules a storefront may show. A product with variants has no unit and no tiers; stale tiers are dropped. */
export function sellingRulesPublic(product: { amount: number; variants?: unknown; unit?: unknown; tiers?: unknown; optionGroups?: unknown }): { unit: SellingUnit | null; tiers: VolumeTier[]; optionGroups: OptionGroup[] } {
  const variants = readProductVariants((product.variants ?? []) as Prisma.JsonValue);
  const unit = variants.length ? null : readSellingUnit(product.unit);
  return { unit, tiers: readVolumeTiers(product.tiers, unit, product.amount), optionGroups: readOptionGroups(product.optionGroups) };
}
```

- [ ] **Step 6: Run it and see it pass.**
  - Run: `cd apps/api && npx jest src/stores/selling-rules.spec.ts`
  - Expected: PASS.
  - If `formatUnits` prints a non-breaking space or a dot, the runtime has no full ICU. Node 20+ ships it, so fix the environment, not the test.

- [ ] **Step 7: Commit.**

```bash
git add apps/api/src/stores/selling-rules.ts apps/api/src/stores/selling-rules.spec.ts apps/api/src/stores/request-fields.ts
git commit -m "feat(tools): selling rules — unit steps in thousandths, volume tiers, option groups, one line pricer

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Cart checkout prices through the shared rules

**Existing code this touches (`apps/api/src/stores/store-checkout.service.ts`, `createCartCheckout`):**
- The per-item pricing loop runs from `const linksById = new Map(links.map((link) => [link.id, link]));` (line 124) to the end of `for (const item of dto.items) { … }` (line 187).
- The subtotal and discounts are at lines 211-219. They start with `const cartLines = [...selectedLines.values()].map(({ optionStock: _optionStock, ...line }) => line);` and end with `const discountAmount = Math.max(promoDiscountAmount, bundle.amount);`.
- The description is built at lines 248-250: `let description = cartLines .map((line) => \`${line.name}… x${line.quantity}\`)`.

**Files:**
- Create: `apps/api/src/stores/cart-pricing.ts`
- Create: `apps/api/src/payment-links/dto/chosen-options.validator.ts`
- Modify: `apps/api/src/payment-links/dto/cart-checkout.dto.ts` (`CartItemDto` gets `options`)
- Modify: `apps/api/src/stores/store-checkout.service.ts` (imports; the loop; discounts; description)
- Create (test): `apps/api/src/stores/tool-checkout.spec.ts`

**Interfaces:**
- Consumes: `priceSellingLine`, `optionsKey` and the types from Task 2.
- Produces:
  ```ts
  // cart-pricing.ts
  export type CartLineSnapshot = { paymentLinkId: string; variantId?: string; name: string; variantName?: string; extraIds?: string[]; extras?: ProductExtra[]; quantity: number; unitAmount: number; digitalAssetIds?: string[]; subscription?: { cadence: Cadence; discountPercent: number; lockedUnitAmount: number }; unit?: LineUnit; quantityLabel?: string; options?: ChosenOption[]; optionsLabel?: string };
  export type PriceQuoteLine = { paymentLinkId: string; quantity: number; unitAmount: number; lineAmount: number; quantityLabel: string; unit: LineUnit | null; tier: VolumeTier | null; nextTier: (VolumeTier & { unitsToGo: number }) | null; saving: number; lockedUnitAmount: number | null; options: ChosenOption[] };
  export type PriceQuote = { currency: string; lines: PriceQuoteLine[]; subtotal: number; discountAmount: number; total: number };
  export type SubscriptionOffer = { paymentLinkId: string; cadence: string; discountPercent: number };
  export type PricedCartLine = { key: string; link: PaymentLink; variant?: ProductVariant; snapshot: CartLineSnapshot; quote: PriceQuoteLine };
  export function cartItemKey(item: Pick<CartItemDto, 'paymentLinkId' | 'variantId' | 'extraIds' | 'subscriptionCadence' | 'options'>): string;
  export function priceCartItems(items: CartItemDto[], linksById: Map<string, PaymentLink>, offers: SubscriptionOffer[], now?: Date): PricedCartLine[];
  // chosen-options.validator.ts
  export function isChosenOptions(value: unknown): boolean;
  export function IsChosenOptions(options?: ValidationOptions): PropertyDecorator;
  // StoreCheckoutService (private, used by Task 4)
  private cartDiscounts(store: { id: string; bundlesEnabled: boolean }, lines: CartLineSnapshot[], promoCode?: string): Promise<{ subtotal: number; promo: Awaited<ReturnType<PromoCodesService['resolveActiveForStore']>> | null; promoDiscountAmount: number; bundle: { id: string; name: string; amount: number }; discountAmount: number }>;
  ```
- `CartItemDto.options?: ChosenOptions`.

- [ ] **Step 1: Live-stack check.** Run the command from Global Constraints and continue only on `[0,0]`.

- [ ] **Step 2: Write the failing test.** Create `apps/api/src/stores/tool-checkout.spec.ts`:

```ts
import { BadRequestException } from '@nestjs/common';
import { MerchantStatus, PromoDiscountType, StoreStatus } from '@prisma/client';
import { makeStoreServices } from './testing-stores-services';

/** Business tools part a (spec 2026-10-14): cart checkout prices unit, tier, option and subscription lines on the server. */
const STORE = { id: 'store_1', merchantId: 'm_1', slug: 'lecheria', name: 'Lechería', status: StoreStatus.ACTIVE, sourcePublicationPaused: false, publicVisibility: true, checkoutMode: 'payment', subscriptionsEnabled: true, bundlesEnabled: false, locations: [] };
const NO_SALE = { discountPercent: null, discountStartsAt: null, discountEndsAt: null };
const LECHE = { id: 'leche', name: 'Leche entera', amount: 720, currency: 'BOB', status: 'ACTIVE', fulfillmentType: 'PHYSICAL', stock: null, locationStocks: {}, variants: [], extras: [], ...NO_SALE,
  unit: { label: 'L', step: 0.5, min: 1, max: 100 }, tiers: [{ from: 1, unitAmount: 720 }, { from: 15, unitAmount: 690 }, { from: 30, unitAmount: 650 }], optionGroups: null, pricingProposal: null };
const TORTA = { id: 'torta', name: 'Torta', amount: 15000, currency: 'BOB', status: 'ACTIVE', fulfillmentType: 'PHYSICAL', stock: null, locationStocks: {}, variants: [], extras: [], ...NO_SALE, unit: null, tiers: null, pricingProposal: null,
  optionGroups: [{ id: 'size', label: 'Tamaño', type: 'single', required: true, choices: [{ id: 's', label: 'Chica', amountDelta: 0 }, { id: 'l', label: 'Grande', amountDelta: 6000 }] }, { id: 'note', label: 'Mensaje', type: 'text', required: false, maxLength: 40 }] };
const SALE_20 = { discountPercent: 20, discountStartsAt: new Date('2000-01-01T00:00:00Z'), discountEndsAt: new Date('2100-01-01T00:00:00Z') };

function setup(links: any[], storeOverrides: Record<string, unknown> = {}, offers: any[] = []) {
  const prisma: any = {
    store: { findUnique: jest.fn().mockResolvedValue({ ...STORE, ...storeOverrides }) },
    merchant: { findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'm_1', status: MerchantStatus.ACTIVE }) },
    // Like Prisma: only the products the cart names (where.id.in), so a missing one is noticed.
    paymentLink: { findMany: jest.fn(async ({ where }: any) => links.filter(link => where.id.in.includes(link.id))) },
    productSubscriptionOption: { findMany: jest.fn().mockResolvedValue(offers) },
    storeBundle: { findMany: jest.fn().mockResolvedValue([]) },
    storeOrder: { create: jest.fn().mockResolvedValue({ id: 'order_1' }) },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation((fn: any) => fn(prisma));
  const create = jest.fn().mockResolvedValue({ id: 'pi_1', clientSecret: 'pi_1_secret' });
  const paymentIntents = { create, createInTransaction: jest.fn((_tx: unknown, ...args: unknown[]) => create(...args)) };
  const promoCodes = { resolveActiveForStore: jest.fn().mockResolvedValue({ code: 'LECHE10', discountType: PromoDiscountType.PERCENT, discountValue: 10 }), discountAmount: jest.fn((subtotal: number, _type: unknown, value: number) => Math.floor(subtotal * value / 100)) };
  const service = makeStoreServices(prisma, paymentIntents, { deleteFiles: jest.fn() }, undefined, promoCodes);
  return { prisma, create, service };
}
const intentOf = (create: jest.Mock) => create.mock.calls[0][2];

describe('cart checkout with selling rules (spec 2026-10-14, part a)', () => {
  it('prices 20 L of milk at the 15 L tier: 40 steps of Bs 3,45, labelled «20 L»', async () => {
    const { service, create } = setup([LECHE]);
    await service.createCartCheckout('lecheria', { items: [{ paymentLinkId: 'leche', quantity: 40 }] });
    const intent = intentOf(create);
    expect(intent.amount).toBe(13800);
    expect(intent.description).toBe('Leche entera 20 L');
    expect(intent.metadata.cart).toEqual([{ paymentLinkId: 'leche', name: 'Leche entera', quantity: 40, unitAmount: 345, unit: { label: 'L', step: 0.5, units: 20 }, quantityLabel: '20 L' }]);
  });

  it('merges repeated lines before pricing, so the tier sees the whole quantity', async () => {
    const { service, create } = setup([LECHE]);
    await service.createCartCheckout('lecheria', { items: [{ paymentLinkId: 'leche', quantity: 20 }, { paymentLinkId: 'leche', quantity: 20 }] });
    expect(intentOf(create).metadata.cart).toEqual([expect.objectContaining({ quantity: 40, unitAmount: 345 })]);
  });

  it('tier, sale, cadence and promo apply in the spec order, and a unit line never meets a bundle', async () => {
    const { service, create, prisma } = setup([{ ...LECHE, ...SALE_20 }], { bundlesEnabled: true }, [{ paymentLinkId: 'leche', cadence: 'WEEKLY', discountPercent: 10 }]);
    prisma.storeBundle.findMany.mockResolvedValue([{ id: 'b1', name: 'Mix', kind: 'MIX_MATCH', items: [{ productId: 'leche', quantity: 1 }], minimumQuantity: 2, discountPercent: 50 }]);
    await service.createCartCheckout('lecheria', { items: [{ paymentLinkId: 'leche', quantity: 30, subscriptionCadence: 'WEEKLY' }], subscriptionConsent: true, promoCode: 'LECHE10' });
    const intent = intentOf(create);
    // Tier 690/L → 345 per 0,5 L step; sale 20 % → 276; cadence 10 % → 311; first order min(276, 311) = 276; × 30 = 8280; promo 10 % = 828.
    expect(intent.metadata.cart[0]).toMatchObject({ unitAmount: 276, quantity: 30, subscription: { cadence: 'WEEKLY', discountPercent: 10, lockedUnitAmount: 311 } });
    expect(intent.metadata).toMatchObject({ subtotal: 8280, promoDiscountAmount: 828 });
    expect(intent.amount).toBe(7452);
    expect(intent.metadata.bundle).toBeUndefined();
  });

  it('adds builder deltas and stores the chosen labels on the order line', async () => {
    const { service, create, prisma } = setup([TORTA]);
    await service.createCartCheckout('lecheria', { items: [{ paymentLinkId: 'torta', quantity: 1, options: { size: ['l'], note: 'Feliz día, Ana' } }] });
    const intent = intentOf(create);
    expect(intent.amount).toBe(21000);
    expect(intent.description).toBe('Torta (Tamaño: Grande · Mensaje: Feliz día, Ana) x1');
    expect(intent.metadata.cart[0]).toEqual({ paymentLinkId: 'torta', name: 'Torta', quantity: 1, unitAmount: 21000, options: [{ groupId: 'size', group: 'Tamaño', values: ['Grande'] }, { groupId: 'note', group: 'Mensaje', values: ['Feliz día, Ana'] }], optionsLabel: 'Tamaño: Grande · Mensaje: Feliz día, Ana' });
    expect(prisma.storeOrder.create.mock.calls[0][0].data.items).toEqual(intent.metadata.cart);
  });

  it.each([
    ['an unknown option', { paymentLinkId: 'torta', quantity: 1, options: { size: ['xxl'] } }, 'Una opción de "Torta" ya no está disponible'],
    ['a missing required option', { paymentLinkId: 'torta', quantity: 1 }, 'Elige «Tamaño» para "Torta"'],
    ['units beyond the maximum', { paymentLinkId: 'leche', quantity: 201 }, 'Elige entre 1 y 100 L de "Leche entera"'],
    ['units below the minimum', { paymentLinkId: 'leche', quantity: 1 }, 'Elige entre 1 y 100 L de "Leche entera"'],
    ['options on a subscription', { paymentLinkId: 'torta', quantity: 1, options: { size: ['s'] }, subscriptionCadence: 'WEEKLY' }, 'armado a tu gusto no se puede comprar por suscripción'],
  ])('refuses a tampered cart with %s, and creates no payment', async (_name, item, message) => {
    const { service, create } = setup([LECHE, TORTA], {}, [{ paymentLinkId: 'torta', cadence: 'WEEKLY', discountPercent: 5 }]);
    await expect(service.createCartCheckout('lecheria', { items: [item as never], subscriptionConsent: true })).rejects.toThrow(message);
    expect(create).not.toHaveBeenCalled();
  });

  it('a unit product that gained variants refuses the old calculator line instead of charging 40 pieces', async () => {
    const { service, create } = setup([{ ...LECHE, variants: [{ id: 'v1', name: 'Deslactosada', amount: 900 }] }]);
    await expect(service.createCartCheckout('lecheria', { items: [{ paymentLinkId: 'leche', quantity: 40 }] })).rejects.toThrow('Elige una opción para "Leche entera"');
    expect(create).not.toHaveBeenCalled();
  });

  it('never prices from a pending proposal', async () => {
    const { service, create } = setup([{ ...LECHE, unit: null, tiers: null, pricingProposal: { toolId: 'tl0123456789abcdef01', unit: LECHE.unit, tiers: LECHE.tiers } }]);
    await service.createCartCheckout('lecheria', { items: [{ paymentLinkId: 'leche', quantity: 40 }] });
    expect(intentOf(create)).toMatchObject({ amount: 28800, description: 'Leche entera x40' });
  });

  it('keeps an ordinary cart exactly as before', async () => {
    const plain = { id: 'cafe', name: 'Café', amount: 8000, currency: 'BOB', stock: null, variants: [], extras: [], ...NO_SALE };
    const { service, create } = setup([plain]);
    await service.createCartCheckout('lecheria', { items: [{ paymentLinkId: 'cafe', quantity: 2 }] });
    expect(intentOf(create)).toMatchObject({ amount: 16000, description: 'Café x2', metadata: { storeId: 'store_1', cart: [{ paymentLinkId: 'cafe', name: 'Café', quantity: 2, unitAmount: 8000 }] } });
    await expect(service.createCartCheckout('lecheria', { items: [{ paymentLinkId: 'cafe', quantity: 1, variantId: 'x' }] })).rejects.toThrow(BadRequestException);
  });
});
```

- [ ] **Step 3: Run it and see it fail.**
  - Run: `cd apps/api && npx jest src/stores/tool-checkout.spec.ts`
  - Expected: FAIL. The unit test sees `amount: 28800` (40 × 720) and description `Leche entera x40`; the options test fails `forbid…`/type errors on `options`.

- [ ] **Step 4: The options validator.** Create `apps/api/src/payment-links/dto/chosen-options.validator.ts`:

```ts
import { buildMessage, ValidateBy, type ValidationOptions } from 'class-validator';
import { SAFE_TEXT_PATTERN } from '../../common/validation/safe-text.decorator';

/** A cart line's builder choices (spec 2026-10-14, part a): group id → choice ids, or → a short text. Only the shape is
 *  checked here; StoreCheckoutService checks them against the product's approved groups. Keys like __proto__ never pass. */
const ID = /^[a-z0-9][a-z0-9-]{0,31}$/;
export function isChosenOptions(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const entries = Object.entries(value as Record<string, unknown>);
  return entries.length <= 8 && entries.every(([key, choice]) => ID.test(key) && (typeof choice === 'string'
    ? choice.length <= 140 && SAFE_TEXT_PATTERN.test(choice)
    : Array.isArray(choice) && choice.length <= 12 && choice.every(id => typeof id === 'string' && ID.test(id))));
}
export function IsChosenOptions(options?: ValidationOptions): PropertyDecorator {
  return ValidateBy({ name: 'isChosenOptions', validator: { validate: isChosenOptions, defaultMessage: buildMessage(each => `${each}$property must map option ids to choice ids or a short text`, options) } }, options);
}
```

In `cart-checkout.dto.ts`:
- Add `import { IsChosenOptions } from "./chosen-options.validator";` and `import type { ChosenOptions } from "../../stores/selling-rules";` after the existing imports.
- In `class CartItemDto`, after the `subscriptionCadence` property, add:

```ts

  @ApiProperty({ required: false, description: "Builder choices: option group id → choice ids, or → a short text (spec 2026-10-14). Validated against the product's approved groups." })
  @IsOptional()
  @IsChosenOptions()
  options?: ChosenOptions;
```

- [ ] **Step 5: The shared cart pricer.** Create `apps/api/src/stores/cart-pricing.ts`:

```ts
/**
 * Cart pricing shared by cart checkout, the price quote and leads (spec 2026-10-14 business tools, part a). Repeated
 * lines merge before pricing, so a volume tier sees the whole quantity. Every amount comes from the product rows; the
 * browser's cart only names products, choices and quantities.
 */
import { BadRequestException } from '@nestjs/common';
import type { PaymentLink } from '@prisma/client';
import type { Cadence } from '../operations/subscription-pricing';
import type { CartItemDto } from '../payment-links/dto/cart-checkout.dto';
import { resolveSelectedExtras } from '../payment-links/product-extras';
import type { ProductVariant } from '../payment-links/product-variants';
import { readProductExtras, readProductVariants, selectedExtrasAmount, type ProductExtra } from './product-pricing';
import { optionsKey, priceSellingLine, type ChosenOption, type LineUnit, type VolumeTier } from './selling-rules';

export type CartLineSnapshot = {
  paymentLinkId: string; variantId?: string; name: string; variantName?: string; extraIds?: string[]; extras?: ProductExtra[];
  quantity: number; unitAmount: number; digitalAssetIds?: string[];
  subscription?: { cadence: Cadence; discountPercent: number; lockedUnitAmount: number };
  unit?: LineUnit; quantityLabel?: string; options?: ChosenOption[]; optionsLabel?: string;
};
export type PriceQuoteLine = {
  paymentLinkId: string; quantity: number; unitAmount: number; lineAmount: number; quantityLabel: string; unit: LineUnit | null;
  tier: VolumeTier | null; nextTier: (VolumeTier & { unitsToGo: number }) | null; saving: number; lockedUnitAmount: number | null; options: ChosenOption[];
};
export type PriceQuote = { currency: string; lines: PriceQuoteLine[]; subtotal: number; discountAmount: number; total: number };
export type SubscriptionOffer = { paymentLinkId: string; cadence: string; discountPercent: number };
export type PricedCartLine = { key: string; link: PaymentLink; variant?: ProductVariant; snapshot: CartLineSnapshot; quote: PriceQuoteLine };

export function cartItemKey(item: Pick<CartItemDto, 'paymentLinkId' | 'variantId' | 'extraIds' | 'subscriptionCadence' | 'options'>): string {
  return JSON.stringify([item.paymentLinkId, item.variantId ?? '', [...(item.extraIds ?? [])].sort(), item.subscriptionCadence ?? '', optionsKey(item.options)]);
}

export function priceCartItems(items: CartItemDto[], linksById: Map<string, PaymentLink>, offers: SubscriptionOffer[], now = new Date()): PricedCartLine[] {
  const groups = new Map<string, { item: CartItemDto; quantity: number }>();
  for (const item of items) {
    const key = cartItemKey(item);
    const group = groups.get(key);
    if (group) group.quantity += item.quantity;
    else groups.set(key, { item, quantity: item.quantity });
  }
  return [...groups].map(([key, { item, quantity }]) => {
    const link = linksById.get(item.paymentLinkId)!;
    const variants = readProductVariants(link.variants);
    let variant: ProductVariant | undefined;
    if (variants.length > 0) {
      if (!item.variantId) throw new BadRequestException(`Elige una opción para "${link.name}"`);
      variant = variants.find((candidate) => candidate.id === item.variantId);
      if (!variant) throw new BadRequestException(`Una opción de "${link.name}" ya no está disponible`);
    } else if (item.variantId) {
      throw new BadRequestException(`"${link.name}" no tiene opciones`);
    }
    const extras = resolveSelectedExtras(link.name, readProductExtras(link.extras), item.extraIds);
    const exhausted = extras.find((extra) => extra.stock === 0);
    if (exhausted) throw new BadRequestException(`"${exhausted.name}" está agotado`);
    const cadence = item.subscriptionCadence;
    let cadenceDiscountPercent: number | undefined;
    if (cadence) {
      if (link.fulfillmentType === 'DIGITAL') throw new BadRequestException(`"${link.name}" no se puede comprar por suscripción.`);
      if (item.options && Object.keys(item.options).length) throw new BadRequestException(`"${link.name}" armado a tu gusto no se puede comprar por suscripción.`);
      const offer = offers.find((option) => option.paymentLinkId === link.id && option.cadence === cadence);
      if (!offer) throw new BadRequestException(`Esa frecuencia no está disponible para "${link.name}".`);
      cadenceDiscountPercent = offer.discountPercent;
    }
    const price = priceSellingLine({ product: link, variant, extrasAmount: selectedExtrasAmount(extras), quantity, options: item.options, cadenceDiscountPercent, now });
    const snapshot: CartLineSnapshot = {
      paymentLinkId: link.id,
      ...(variant && { variantId: variant.id, variantName: variant.name }),
      ...(extras.length && { extraIds: extras.map((extra) => extra.id), extras }),
      ...(cadence && price.lockedUnitAmount !== null ? { subscription: { cadence, discountPercent: cadenceDiscountPercent!, lockedUnitAmount: price.lockedUnitAmount } } : {}),
      ...(price.unit ? { unit: price.unit, quantityLabel: price.quantityLabel } : {}),
      ...(price.options.length ? { options: price.options, optionsLabel: price.optionsLabel } : {}),
      name: link.name, quantity, unitAmount: price.unitAmount,
    };
    const quote: PriceQuoteLine = { paymentLinkId: link.id, quantity, unitAmount: price.unitAmount, lineAmount: price.lineAmount, quantityLabel: price.quantityLabel, unit: price.unit, tier: price.tier, nextTier: price.nextTier, saving: price.saving, lockedUnitAmount: price.lockedUnitAmount, options: price.options };
    return { key, link, variant, snapshot, quote };
  });
}
```

- [ ] **Step 6: Use it in `createCartCheckout`.**

(a) Imports. Add after `import { InboxService } from "../inbox/inbox.service";`:
```ts
import { priceCartItems, type CartLineSnapshot } from "./cart-pricing";
```
Replace `import { readProductExtras, readProductVariants, type ProductExtra, discountedProductAmount, selectedExtrasAmount } from "./product-pricing";` with:
```ts
import { readProductExtras, readProductVariants, discountedProductAmount, selectedExtrasAmount } from "./product-pricing";
```
`ProductExtra` was only used by the removed `selectedLines` type, and `discountedProductAmount` is still used by `submitLead` until Task 5. Remove `type ProductVariant` from the imports only if `tsc` reports it unused; `submitLead` still uses it.

(b) Replace the block from
```ts
    const linksById = new Map(links.map((link) => [link.id, link]));
    const selectedLines = new Map<
```
through the closing `}` of `for (const item of dto.items) { … }` (the loop that ends with `unitAmount,\n        });\n      }\n    }`) with:
```ts
    const linksById = new Map(links.map((link) => [link.id, link]));
    const selectedLines = new Map<string, CartLineSnapshot & { optionStock?: number | null }>();
    for (const priced of priceCartItems(dto.items, linksById, offers)) {
      selectedLines.set(priced.key, {
        ...priced.snapshot,
        ...(priced.link.fulfillmentType === 'DIGITAL' ? { digitalAssetIds: digitalAssets.filter(asset => asset.productId === priced.link.id).map(asset => asset.id) } : {}),
        ...(priced.variant && priced.variant.stock !== undefined && { optionStock: priced.variant.stock }),
      });
    }
```
The two loops that follow (`optionStock` and `requestedByExtraPool`) stay as they are.

(c) Replace:
```ts
    const subtotal = cartLines.reduce((sum, line) => sum + line.unitAmount * line.quantity, 0);
    const promo = dto.promoCode ? await this.promoCodes!.resolveActiveForStore(store.id, dto.promoCode) : null;
    const promoDiscountAmount = promo
      ? this.promoCodes!.discountAmount(subtotal, promo.discountType, promo.discountValue)
      : 0;
    const bundles = store.bundlesEnabled ? await this.prisma.storeBundle.findMany({ where: { storeId: store.id, active: true } }) : [];
    const bundle = bestBundleDiscount(bundles as unknown as Bundle[], cartLines.filter(line => !line.subscription));
    const discountAmount = Math.max(promoDiscountAmount, bundle.amount);
```
with:
```ts
    const { subtotal, promo, promoDiscountAmount, bundle, discountAmount } = await this.cartDiscounts(store, cartLines, dto.promoCode);
```

(d) Add this private method right after `pickedProductStock` (before the `/** Public — turns a cart …` comment):
```ts
  /** Subtotal, then promo or bundle on it (best single offer wins). Shared by checkout and the price quote. Subscription
   *  lines and lines sold by unit never count toward a bundle: a bundle counts pieces, not litres. */
  private async cartDiscounts(store: { id: string; bundlesEnabled: boolean }, lines: CartLineSnapshot[], promoCode?: string) {
    const subtotal = lines.reduce((sum, line) => sum + line.unitAmount * line.quantity, 0);
    const promo = promoCode ? await this.promoCodes!.resolveActiveForStore(store.id, promoCode) : null;
    const promoDiscountAmount = promo ? this.promoCodes!.discountAmount(subtotal, promo.discountType, promo.discountValue) : 0;
    const bundles = store.bundlesEnabled ? await this.prisma.storeBundle.findMany({ where: { storeId: store.id, active: true } }) : [];
    const bundle = bestBundleDiscount(bundles as unknown as Bundle[], lines.filter(line => !line.subscription && !line.unit));
    return { subtotal, promo, promoDiscountAmount, bundle, discountAmount: Math.max(promoDiscountAmount, bundle.amount) };
  }
```

(e) Replace the description builder:
```ts
    let description = cartLines
      .map((line) => `${line.name}${line.variantName ? ` (${line.variantName})` : ""}${line.extras?.length ? ` + ${selectedExtrasLabel(line.extras)}` : ""} x${line.quantity}`)
      .join(", ");
```
with:
```ts
    // «Leche entera 20 L», «Torta (Tamaño: Grande) x1»: the description is the invoice and the payment's text.
    let description = cartLines
      .map((line) => `${line.name}${line.variantName ? ` (${line.variantName})` : ""}${line.extras?.length ? ` + ${selectedExtrasLabel(line.extras)}` : ""}${line.optionsLabel ? ` (${line.optionsLabel})` : ""} ${line.unit ? line.quantityLabel : `x${line.quantity}`}`)
      .join(", ");
```

- [ ] **Step 7: Run the new test and the existing checkout tests, and see them pass.**
  - Run: `cd apps/api && npx jest src/stores/tool-checkout.spec.ts src/stores/stores.service.spec.ts src/stores/store-contact-lead.spec.ts --maxWorkers=2`
  - Expected: PASS. The existing exact-shape assertions (`cart: [{ paymentLinkId, variantId, variantName, name, quantity, unitAmount }]`) keep passing, because an ordinary line gets no new keys.

- [ ] **Step 8: Commit.**

```bash
git add apps/api/src/stores/cart-pricing.ts apps/api/src/payment-links/dto/chosen-options.validator.ts apps/api/src/payment-links/dto/cart-checkout.dto.ts apps/api/src/stores/store-checkout.service.ts apps/api/src/stores/tool-checkout.spec.ts
git commit -m "feat(tools): cart checkout prices unit, tier, option and subscription lines through one shared pricer

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The price-quote endpoint

**Files:**
- Modify: `apps/api/src/payment-links/dto/cart-checkout.dto.ts` (append `PriceQuoteDto`)
- Modify: `apps/api/src/stores/store-checkout.service.ts` (add `priceQuote`)
- Modify: `apps/api/src/stores/stores-public.controller.ts` (the route, after `shippingQuote`)
- Create (test): `apps/api/src/stores/tool-price-quote.spec.ts`

**Interfaces:**
- Consumes: `priceCartItems`, `PriceQuote` and `cartDiscounts` (Task 3).
- Produces:
  - `export class PriceQuoteDto { items: CartItemDto[]; promoCode?: string }`.
  - `StoreCheckoutService.priceQuote(slug: string, dto: PriceQuoteDto): Promise<PriceQuote>`.
  - The route `POST /v1/stores/public/:slug/price-quote`, throttled 30 per 60 s like shipping quotes.

- [ ] **Step 1: Live-stack check.** Run the command from Global Constraints and continue only on `[0,0]`.

- [ ] **Step 2: Write the failing test.** Create `apps/api/src/stores/tool-price-quote.spec.ts`:

```ts
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { MerchantStatus, PromoDiscountType, StoreStatus } from '@prisma/client';
import { CartCheckoutDto, PriceQuoteDto } from '../payment-links/dto/cart-checkout.dto';
import { makeStoreServices } from './testing-stores-services';

/** Business tools part a (spec 2026-10-14): the price quote shares checkout's pricing, and both refuse what a client cannot send. */
const STORE = { id: 'store_1', merchantId: 'm_1', slug: 'lecheria', name: 'Lechería', status: StoreStatus.ACTIVE, sourcePublicationPaused: false, publicVisibility: true, checkoutMode: 'payment', subscriptionsEnabled: true, bundlesEnabled: false, locations: [] };
const NO_SALE = { discountPercent: null, discountStartsAt: null, discountEndsAt: null };
const LECHE = { id: 'leche', name: 'Leche entera', amount: 720, currency: 'BOB', status: 'ACTIVE', fulfillmentType: 'PHYSICAL', stock: null, locationStocks: {}, variants: [], extras: [], ...NO_SALE,
  unit: { label: 'L', step: 0.5, min: 1, max: 100 }, tiers: [{ from: 1, unitAmount: 720 }, { from: 15, unitAmount: 690 }, { from: 30, unitAmount: 650 }] };
const TORTA = { id: 'torta', name: 'Torta', amount: 15000, currency: 'BOB', status: 'ACTIVE', fulfillmentType: 'PHYSICAL', stock: null, locationStocks: {}, variants: [], extras: [], ...NO_SALE,
  optionGroups: [{ id: 'size', label: 'Tamaño', type: 'single', required: true, choices: [{ id: 's', label: 'Chica', amountDelta: 0 }, { id: 'l', label: 'Grande', amountDelta: 6000 }] }] };
const CAFE = { id: 'cafe', name: 'Café', amount: 8000, currency: 'BOB', status: 'ACTIVE', fulfillmentType: 'PHYSICAL', stock: null, locationStocks: {}, variants: [], extras: [], ...NO_SALE };

function setup(links: any[]) {
  const prisma: any = {
    store: { findUnique: jest.fn().mockResolvedValue(STORE) },
    merchant: { findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'm_1', status: MerchantStatus.ACTIVE }) },
    // Like Prisma: only the products the cart names (where.id.in), so a missing one is noticed.
    paymentLink: { findMany: jest.fn(async ({ where }: any) => links.filter(link => where.id.in.includes(link.id))) },
    productSubscriptionOption: { findMany: jest.fn().mockResolvedValue([{ paymentLinkId: 'cafe', cadence: 'MONTHLY', discountPercent: 10 }]) },
    storeBundle: { findMany: jest.fn().mockResolvedValue([]) },
    storeOrder: { create: jest.fn().mockResolvedValue({ id: 'order_1' }) },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation((fn: any) => fn(prisma));
  const create = jest.fn().mockResolvedValue({ id: 'pi_1', clientSecret: 'pi_1_secret' });
  const promoCodes = { resolveActiveForStore: jest.fn().mockResolvedValue({ code: 'LECHE10', discountType: PromoDiscountType.PERCENT, discountValue: 10 }), discountAmount: jest.fn((subtotal: number, _type: unknown, value: number) => Math.floor(subtotal * value / 100)) };
  const service = makeStoreServices(prisma, { create, createInTransaction: jest.fn((_tx: unknown, ...args: unknown[]) => create(...args)) }, { deleteFiles: jest.fn() }, undefined, promoCodes);
  return { prisma, create, service };
}
const CART = [{ paymentLinkId: 'leche', quantity: 29 }, { paymentLinkId: 'torta', quantity: 1, options: { size: ['l'] } }, { paymentLinkId: 'cafe', quantity: 2, subscriptionCadence: 'MONTHLY' }];

describe('price quote (spec 2026-10-14, part a.7)', () => {
  it('returns each line with the tier and the next tier, and the totals', async () => {
    const quote = await setup([LECHE, TORTA, CAFE]).service.priceQuote('lecheria', { items: CART as never, promoCode: 'LECHE10' });
    expect(quote.lines[0]).toEqual({ paymentLinkId: 'leche', quantity: 29, unitAmount: 360, lineAmount: 10440, quantityLabel: '14,5 L', unit: { label: 'L', step: 0.5, units: 14.5 }, tier: null, nextTier: { from: 15, unitAmount: 690, unitsToGo: 0.5 }, saving: 0, lockedUnitAmount: null, options: [] });
    expect(quote.lines[1]).toMatchObject({ lineAmount: 21000, options: [{ groupId: 'size', group: 'Tamaño', values: ['Grande'] }] });
    expect(quote.lines[2]).toMatchObject({ unitAmount: 7200, lineAmount: 14400, lockedUnitAmount: 7200 });
    expect(quote).toMatchObject({ currency: 'BOB', subtotal: 45840, discountAmount: 4584, total: 41256 });
  });

  it('agrees with checkout for the same cart', async () => {
    const { service, create } = setup([LECHE, TORTA, CAFE]);
    const quote = await service.priceQuote('lecheria', { items: CART as never, promoCode: 'LECHE10' });
    await service.createCartCheckout('lecheria', { items: CART as never, promoCode: 'LECHE10', subscriptionConsent: true });
    const intent = create.mock.calls[0][2];
    expect(intent.amount).toBe(quote.total);
    expect(intent.metadata.cart.map((line: any) => line.unitAmount * line.quantity)).toEqual(quote.lines.map(line => line.lineAmount));
    expect(intent.metadata.subtotal).toBe(quote.subtotal);
  });

  it('shows no tier for a product whose price changed after approval', async () => {
    const quote = await setup([{ ...LECHE, amount: 800 }]).service.priceQuote('lecheria', { items: [{ paymentLinkId: 'leche', quantity: 40 }] as never });
    expect(quote.lines[0]).toMatchObject({ unitAmount: 400, lineAmount: 16000, tier: null, nextTier: null });
  });

  it('refuses a store that does not charge with pagosYa, and a product from another store', async () => {
    const { service, prisma } = setup([LECHE]);
    prisma.store.findUnique.mockResolvedValue({ ...STORE, checkoutMode: 'whatsapp' });
    await expect(service.priceQuote('lecheria', { items: [{ paymentLinkId: 'leche', quantity: 2 }] as never })).rejects.toThrow('Esta tienda no tiene habilitados los pagos integrados');
    prisma.store.findUnique.mockResolvedValue(STORE);
    prisma.paymentLink.findMany.mockResolvedValue([]);
    await expect(service.priceQuote('lecheria', { items: [{ paymentLinkId: 'otra', quantity: 2 }] as never })).rejects.toThrow('Uno o más productos del carrito ya no están disponibles');
  });
});

describe('a tampered client (spec 2026-10-14, testing)', () => {
  const errorsOf = async (cls: any, body: object) => (await validate(plainToInstance(cls, body), { whitelist: true, forbidNonWhitelisted: true, forbidUnknownValues: true })).flatMap(function all(error: any): string[] { return [error.property, ...(error.children ?? []).flatMap(all)]; });
  it('cannot send an amount, a unit price or a tier', async () => {
    expect(await errorsOf(CartCheckoutDto, { items: [{ paymentLinkId: 'leche', quantity: 40, unitAmount: 1 }] })).toContain('unitAmount');
    expect(await errorsOf(CartCheckoutDto, { items: [{ paymentLinkId: 'leche', quantity: 40 }], amount: 100 })).toContain('amount');
    expect(await errorsOf(PriceQuoteDto, { items: [{ paymentLinkId: 'leche', quantity: 40, tier: { from: 1, unitAmount: 1 } }] })).toContain('tier');
  });
  it('cannot send malformed choices or more than 999 steps', async () => {
    expect(await errorsOf(CartCheckoutDto, { items: [{ paymentLinkId: 'torta', quantity: 1, options: { __proto__x: ['a'] } }] })).toContain('options');
    expect(await errorsOf(CartCheckoutDto, { items: [{ paymentLinkId: 'torta', quantity: 1, options: { size: [{ amountDelta: 0 }] } }] })).toContain('options');
    expect(await errorsOf(CartCheckoutDto, { items: [{ paymentLinkId: 'torta', quantity: 1, options: { note: 'x'.repeat(141) } }] })).toContain('options');
    expect(await errorsOf(CartCheckoutDto, { items: [{ paymentLinkId: 'leche', quantity: 1000 }] })).toContain('quantity');
    expect(await errorsOf(CartCheckoutDto, { items: [{ paymentLinkId: 'torta', quantity: 1, options: { size: ['l'], note: 'Feliz día' } }] })).toEqual([]);
  });
});
```

- [ ] **Step 3: Run it and see it fail.**
  - Run: `cd apps/api && npx jest src/stores/tool-price-quote.spec.ts`
  - Expected: FAIL. `PriceQuoteDto` is not exported, and `service.priceQuote is not a function`.

- [ ] **Step 4: The DTO.** Append to `apps/api/src/payment-links/dto/cart-checkout.dto.ts`:

```ts

/** The price quote takes the same lines as cart checkout (spec 2026-10-14, part a.7) and never an amount. */
export class PriceQuoteDto {
  @ApiProperty({ type: [CartItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CartItemDto)
  items!: CartItemDto[];

  @ApiProperty({ required: false, example: "VERANO20" })
  @IsOptional()
  @Transform(({ value }) => String(value ?? "").trim().toUpperCase())
  @Matches(/^[A-Z0-9][A-Z0-9_-]{2,31}$/)
  promoCode?: string;
}
```

- [ ] **Step 5: The service method.** In `store-checkout.service.ts`:
- Change the dto import to `import { CartCheckoutDto, type PriceQuoteDto } from "../payment-links/dto/cart-checkout.dto";`.
- Change the cart-pricing import to `import { priceCartItems, type CartLineSnapshot, type PriceQuote } from "./cart-pricing";`.
- Add after `createCartCheckout` (before the `/** Public lead capture …` comment):

```ts
  /** Public — what a cart costs, line by line, with the tier applied and the next tier (spec 2026-10-14, part a.7). The
   *  same pricing as checkout (priceCartItems and cartDiscounts); no location, shipping or credit, and nothing is created. */
  async priceQuote(slug: string, dto: PriceQuoteDto): Promise<PriceQuote> {
    const store = await findActiveStoreBySlug(this.prisma, slug);
    if (store.checkoutMode === "whatsapp" || store.checkoutMode === "external") throw new BadRequestException("Esta tienda no tiene habilitados los pagos integrados");
    const ids = [...new Set(dto.items.map((item) => item.paymentLinkId))];
    const links = await this.prisma.paymentLink.findMany({ where: { id: { in: ids }, storeId: store.id, status: PaymentLinkStatus.ACTIVE } });
    if (links.length !== ids.length) throw new BadRequestException("Uno o más productos del carrito ya no están disponibles");
    if (links.some(link => link.fulfillmentType === "MEMBERSHIP")) throw new BadRequestException("Las membresías se compran con «Hacerme miembro», no en el carrito.");
    const currency = links[0].currency;
    if (links.some((link) => link.currency !== currency)) throw new BadRequestException("Todos los productos del carrito deben usar la misma moneda");
    const subscriptionItems = dto.items.filter(item => item.subscriptionCadence);
    if (subscriptionItems.length && !store.subscriptionsEnabled) throw new BadRequestException("Esta tienda no ofrece suscripciones.");
    const offers = subscriptionItems.length ? await this.prisma.productSubscriptionOption.findMany({ where: { paymentLinkId: { in: subscriptionItems.map(item => item.paymentLinkId) } } }) : [];
    const priced = priceCartItems(dto.items, new Map(links.map((link) => [link.id, link])), offers);
    const { subtotal, discountAmount } = await this.cartDiscounts(store, priced.map(line => line.snapshot), dto.promoCode);
    return { currency, lines: priced.map(line => line.quote), subtotal, discountAmount, total: subtotal - discountAmount };
  }
```

- [ ] **Step 6: The route.** In `stores-public.controller.ts`:
- Change the import to `import { CartCheckoutDto, PriceQuoteDto } from "../payment-links/dto/cart-checkout.dto";`.
- After the `shippingQuote` method, add:

```ts

  // Business tools (spec 2026-10-14): the tool's total is this server price, never the browser's. Throttled like shipping quotes.
  @Post(':slug/price-quote')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  priceQuote(@Param('slug') slug: string, @Body() dto: PriceQuoteDto) { return this.storeCheckout.priceQuote(slug, dto); }
```

- [ ] **Step 7: Run it and see it pass.**
  - Run: `cd apps/api && npx jest src/stores/tool-price-quote.spec.ts src/stores/tool-checkout.spec.ts --maxWorkers=2`
  - Expected: PASS.
  - The quote totals are:
    - 10 440 (milk) + 21 000 (cake) + 14 400 (coffee subscription) = 45 840;
    - promo 10 % = 4 584;
    - total 41 256.

- [ ] **Step 8: Commit.**

```bash
git add apps/api/src/payment-links/dto/cart-checkout.dto.ts apps/api/src/stores/store-checkout.service.ts apps/api/src/stores/stores-public.controller.ts apps/api/src/stores/tool-price-quote.spec.ts
git commit -m "feat(tools): price-quote endpoint sharing checkout's pricing; tampered clients are refused

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Public products carry their rules; leads price through them

**Existing code:**
- `getStorePublic` builds each item in `items: items.map((item) => ({ … amount: item.amount, currency: item.currency, discountPercent: item.discountPercent, … }))` (`public-stores.service.ts:353-404`).
- `submitLead` prices each line with `const unitAmount = discountedProductAmount(link, variant?.amount ?? link.amount) + selectedExtrasAmount(extras);` (`store-checkout.service.ts:425`). The label is ``label: `${link.name}${details ? ` (${details})` : ""} × ${item.quantity}` `` (line 434).

**Files:**
- Modify: `apps/api/src/stores/public-stores.service.ts` (import; the item map)
- Modify: `apps/api/src/stores/store-checkout.service.ts` (`submitLead`'s line pricing)
- Modify (test): `apps/api/src/stores/stores.service.spec.ts` (append a describe)

**Interfaces:**
- Consumes: `sellingRulesPublic` and `priceSellingLine` (Task 2).
- Produces: every public item gains `unit: SellingUnit | null`, `tiers: VolumeTier[]` and `optionGroups: OptionGroup[]`. It never gains `pricingProposal`.

- [ ] **Step 1: Live-stack check.** Run the command from Global Constraints and continue only on `[0,0]`.

- [ ] **Step 2: Write the failing test.** Append to `apps/api/src/stores/stores.service.spec.ts`:

```ts
describe("business tools on the public catalog and in leads (spec 2026-10-14, part a)", () => {
  const unit = { label: "L", step: 0.5, min: 1, max: 100 };
  const tiers = [{ from: 1, unitAmount: 720 }, { from: 15, unitAmount: 690 }];
  const proposal = { toolId: "tl0123456789abcdef01", unit, tiers };

  it("shows the live unit, tiers and option groups, never the pending proposal, and drops rules a product with variants cannot use", async () => {
    const prisma = makeFakePrisma();
    prisma.store.findUnique.mockResolvedValue(store);
    prisma.paymentLink.findMany.mockResolvedValue([
      { ...publicItem, id: "leche", name: "Leche", amount: 720, unit, tiers, optionGroups: null, pricingProposal: proposal, subscriptionOptions: [], membershipPeriods: [] },
      { ...publicItem, id: "queso", name: "Queso", amount: 4000, unit: null, tiers: null, optionGroups: null, pricingProposal: proposal, subscriptionOptions: [], membershipPeriods: [] },
      { ...publicItem, id: "yogur", name: "Yogur", amount: 900, variants: [{ id: "v1", name: "Frutilla", amount: 900 }], unit, tiers: [{ from: 1, unitAmount: 900 }], optionGroups: null, pricingProposal: null, subscriptionOptions: [], membershipPeriods: [] },
    ]);
    const service = makeStoreServices(prisma as any, makeFakePaymentIntents() as any, makeFakeUploads() as any);
    const { items } = await service.getStorePublic("abc123", { trackView: false });
    expect(items.map((item: any) => [item.id, item.unit, item.tiers, item.optionGroups])).toEqual([["leche", unit, tiers, []], ["queso", null, [], []], ["yogur", null, [], []]]);
    for (const item of items) expect(item).not.toHaveProperty("pricingProposal");
    expect(JSON.stringify(items)).not.toContain("tl0123456789abcdef01");
  });

  it("prices a lead's unit line from the same rules and labels it «20 L»", async () => {
    const prisma = makeFakePrisma();
    prisma.store.findUnique.mockResolvedValue({ ...store, name: "Lechería", checkoutMode: "external", locations: [], contactEmail: "hola@lecheria.bo" });
    prisma.merchant.findUniqueOrThrow.mockResolvedValue({ id: "m_1", email: "owner@lecheria.bo" });
    prisma.paymentLink.findMany.mockResolvedValue([{ id: "leche", name: "Leche entera", amount: 720, currency: "BOB", stock: null, variants: [], extras: [], unit, tiers, discountPercent: null, discountStartsAt: null, discountEndsAt: null }]);
    const emailProvider = { send: jest.fn().mockResolvedValue(undefined) };
    const service = makeStoreServices(prisma as any, makeFakePaymentIntents() as any, makeFakeUploads() as any, emailProvider as any);
    await service.submitLead("abc123", { items: [{ paymentLinkId: "leche", quantity: 40 }], email: "ana@mail.com" } as any);
    const lead = prisma.storeLead.create.mock.calls[0][0].data;
    expect(lead.items[0]).toMatchObject({ unitAmount: 345, amount: 13800, label: "Leche entera 20 L" });
    expect(lead.amount).toBe(13800);
    expect(emailProvider.send.mock.calls[0][0].body).toContain("- Leche entera 20 L");
  });
});
```

- [ ] **Step 3: Run it and see it fail.**
  - Run: `cd apps/api && npx jest src/stores/stores.service.spec.ts -t "business tools"`
  - Expected: FAIL. `item.unit` is `undefined`, and the lead's unit price is `720`.

- [ ] **Step 4: Publish the rules.** In `public-stores.service.ts`:
- Add `import { sellingRulesPublic } from "./selling-rules";` with the other `./` imports.
- In the item map, after `discountEndsAt: item.discountEndsAt?.toISOString() ?? null,`, add:

```ts
        // Business tools (spec 2026-10-14): the approved selling rules only. pricingProposal never leaves the server.
        ...sellingRulesPublic(item),
```

- [ ] **Step 5: Price leads with the shared rules.** In `submitLead`'s `const lines = dto.items.map((item) => { … })`:
- Replace:
```ts
      const unitAmount = discountedProductAmount(link, variant?.amount ?? link.amount) + selectedExtrasAmount(extras);
      const details = [variant?.name, selectedExtrasLabel(extras, " · ")].filter(Boolean).join(" · ");
```
with:
```ts
      const price = priceSellingLine({ product: link, variant, extrasAmount: selectedExtrasAmount(extras), quantity: item.quantity, options: item.options });
      const unitAmount = price.unitAmount;
      const details = [variant?.name, selectedExtrasLabel(extras, " · "), price.optionsLabel].filter(Boolean).join(" · ");
```
- Replace `` label: `${link.name}${details ? ` (${details})` : ""} × ${item.quantity}`, `` with:
```ts
        label: `${link.name}${details ? ` (${details})` : ""} ${price.quantityLabel}`,
```
- Add `import { priceSellingLine } from "./selling-rules";` next to the cart-pricing import.
- Remove `discountedProductAmount` from the `./product-pricing` import, since it is now unused.

- [ ] **Step 6: Run the store specs and see them pass.**
  - Run: `cd apps/api && npx jest src/stores/stores.service.spec.ts src/stores/store-contact-lead.spec.ts src/stores/tool-checkout.spec.ts --maxWorkers=2`
  - Expected: PASS. The earlier lead tests keep their «× 2» labels, because `quantityLabel` is `× 2` for an ordinary line.

- [ ] **Step 7: Commit.**

```bash
git add apps/api/src/stores/public-stores.service.ts apps/api/src/stores/store-checkout.service.ts apps/api/src/stores/stores.service.spec.ts
git commit -m "feat(tools): public products carry their approved unit, tiers and option groups; leads price through them

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Subscriptions renew exactly what the tool showed

**Existing code:**
- In `apps/api/src/operations/subscription-enrollment.ts`, `createSubscriptionsFromOrder` names each subscription `const itemName = [String(line.name ?? product.name), typeof line.variantName === "string" ? line.variantName : null].filter(Boolean).join(" · ");`. The `CartLine` type sits at the top of the file.
- In `apps/api/src/operations/subscribers.service.ts`, `private lockedUnit(product, subscription, discountPercent)` returns `subscriptionPrices({ baseAmount: base, oneTimeAmount: base, extrasAmount: …, discountPercent }).lockedUnitAmount`. A unit product's per-step tier price would be lost on a reprice or a cadence change.
- Renewals already charge `unitAmount × quantity` (`subscriptionTerms`). With a per-step `unitAmount` and a step `quantity`, nothing changes there.

**Files:**
- Modify: `apps/api/src/operations/subscription-enrollment.ts` (the `CartLine` type and `itemName`)
- Modify: `apps/api/src/operations/subscribers.service.ts` (`lockedUnit` and its import)
- Create (test): `apps/api/src/operations/subscription-units.spec.ts`

**Interfaces:**
- Consumes: `priceSellingLine` (Task 2).
- Produces: the subscription item name «Leche entera · 20 L», and `lockedUnit` priced through `priceSellingLine` (null when the line can no longer be priced).

- [ ] **Step 1: Live-stack check.** Run the command from Global Constraints and continue only on `[0,0]`.

- [ ] **Step 2: Write the failing test.** Create `apps/api/src/operations/subscription-units.spec.ts`:

```ts
import { Logger } from '@nestjs/common';
import { createSubscriptionsFromOrder } from './subscription-enrollment';
import { productSubscriptionKey, subscriptionTerms } from './subscription-pricing';
import { SubscribersService } from './subscribers.service';

/** Business tools part a (spec 2026-10-14): a weekly 20 L subscription renews at exactly 40 steps × the locked step price. */
const LECHE = { id: 'leche', amount: 720, variants: [], extras: [], status: 'ACTIVE', unit: { label: 'L', step: 0.5, min: 1, max: 100 }, tiers: [{ from: 1, unitAmount: 720 }, { from: 15, unitAmount: 690 }], discountPercent: null, discountStartsAt: null, discountEndsAt: null, name: 'Leche entera' };
const line = { paymentLinkId: 'leche', name: 'Leche entera', quantity: 40, unitAmount: 311, unit: { label: 'L', step: 0.5, units: 20 }, quantityLabel: '20 L', subscription: { cadence: 'WEEKLY', discountPercent: 10, lockedUnitAmount: 311 } };

describe('subscriptions of a unit product (spec 2026-10-14, part a)', () => {
  beforeEach(() => { jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined); });
  afterEach(() => jest.restoreAllMocks());

  it('names the subscription with its units and renews 40 steps at the locked step price', async () => {
    const tx: any = {
      paymentLink: { findMany: jest.fn().mockResolvedValue([{ id: 'leche', fulfillmentType: 'PHYSICAL', variants: [], name: 'Leche entera' }]) },
      productSubscriptionOption: { findMany: jest.fn().mockResolvedValue([{ paymentLinkId: 'leche', cadence: 'WEEKLY', discountPercent: 10 }]) },
      customerSubscription: { findMany: jest.fn().mockResolvedValueOnce([]).mockResolvedValue([{ id: 'cm1sub0000000000000000001', activeKey: productSubscriptionKey('store_1', { paymentLinkId: 'leche', variantId: null, extraIds: [] }, 'ana@mail.com') }]), createMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const result = await createSubscriptionsFromOrder(tx, { intent: { id: 'pi_1', livemode: true, currency: 'BOB', customerName: 'Ana', customerEmail: 'ana@mail.com', customerPhone: null, consumerUserId: null, metadata: { cart: [line] } }, order: { id: 'order_1', storeId: 'store_1', merchantId: 'm1', fulfillmentMethod: 'pickup', fulfillmentLocationId: null, fulfillmentLocationName: null }, manage: { checkoutOrigin: 'https://pagar.test', secret: 's' }, now: new Date('2026-10-15T12:00:00Z') });
    const row = tx.customerSubscription.createMany.mock.calls[0][0].data[0];
    expect(row).toMatchObject({ itemName: 'Leche entera · 20 L', quantity: 40, unitAmount: 311 });
    expect(subscriptionTerms({ planId: null, paymentLinkId: 'leche', cadence: 'WEEKLY', unitAmount: row.unitAmount, quantity: row.quantity }, null)!.amount).toBe(12440);
    expect(result.emailBlock).toContain('Leche entera · 20 L');
    expect(result.emailBlock).toContain('no se cobra nada automáticamente');
  });

  it('a reprice keeps the tier and the step: 40 steps at 690/L less 10 % is 311 per step', async () => {
    const subscription = { id: 'sub_1', paymentLinkId: 'leche', variantId: null, extraIds: [], quantity: 40, discountPercent: 10, unitAmount: 300, pendingUnitAmount: null, pendingFrom: null, customerEmail: 'ana@mail.com', customerName: 'Ana', itemName: 'Leche entera · 20 L', currency: 'BOB' };
    const prisma: any = {
      store: { findFirst: jest.fn().mockResolvedValue({ id: 'store_1', merchantId: 'merchant_1', name: 'Lechería' }) },
      paymentLink: { findFirst: jest.fn().mockResolvedValue(LECHE) },
      customerSubscription: { findMany: jest.fn().mockResolvedValue([subscription]), update: jest.fn().mockResolvedValue(subscription) },
    };
    const subscriptions: any = { sendSubscriptionNotice: jest.fn().mockResolvedValue(true), manageUrl: jest.fn().mockReturnValue('https://pagar.test/suscripcion/x') };
    const service = new SubscribersService(prisma, subscriptions, { get: () => 's' } as never);
    await service.reprice('merchant_1', 'store_1', 'leche');
    expect(prisma.customerSubscription.update).toHaveBeenCalledWith({ where: { id: 'sub_1' }, data: { pendingUnitAmount: 311, pendingFrom: expect.any(Date) } });
  });

  it('a reprice skips a subscription whose units the product no longer sells, instead of throwing', async () => {
    const subscription = { id: 'sub_1', paymentLinkId: 'leche', variantId: null, extraIds: [], quantity: 400, discountPercent: 10, unitAmount: 300, pendingUnitAmount: null, pendingFrom: null };
    const prisma: any = {
      store: { findFirst: jest.fn().mockResolvedValue({ id: 'store_1', merchantId: 'merchant_1', name: 'Lechería' }) },
      paymentLink: { findFirst: jest.fn().mockResolvedValue(LECHE) },
      customerSubscription: { findMany: jest.fn().mockResolvedValue([subscription]), update: jest.fn() },
    };
    const service = new SubscribersService(prisma, { sendSubscriptionNotice: jest.fn() } as any, { get: () => 's' } as never);
    await expect(service.reprice('merchant_1', 'store_1', 'leche')).resolves.toMatchObject({ affected: 0 });
    expect(prisma.customerSubscription.update).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run it and see it fail.**
  - Run: `cd apps/api && npx jest src/operations/subscription-units.spec.ts`
  - Expected: FAIL.
    - `itemName` is `'Leche entera'`.
    - The reprice sets `pendingUnitAmount: 648` (720 less 10 %, per litre).
    - The third test throws nothing but calls `update` with a per-litre price.

- [ ] **Step 4: Name the subscription with its units.** In `subscription-enrollment.ts`:
- In `type CartLine`, add `quantityLabel?: unknown; unit?: unknown;` after `quantity?: unknown;`.
- Replace:
```ts
    const itemName = [String(line.name ?? product.name), typeof line.variantName === "string" ? line.variantName : null].filter(Boolean).join(" · ");
```
with:
```ts
    // A unit line names its amount («Leche entera · 20 L»): its quantity counts steps, which mean nothing to the buyer.
    const unitLabel = line.unit && typeof line.quantityLabel === "string" ? line.quantityLabel : null;
    const itemName = [String(line.name ?? product.name), typeof line.variantName === "string" ? line.variantName : null, unitLabel].filter(Boolean).join(" · ");
```

- [ ] **Step 5: Reprice through the shared pricer.** In `subscribers.service.ts`:
- Add `import { priceSellingLine } from "../stores/selling-rules";`.
- Replace the body of `lockedUnit`:
```ts
  private lockedUnit(product: { amount: number; variants: Prisma.JsonValue; extras: Prisma.JsonValue }, subscription: CustomerSubscription, discountPercent: number): number | null {
    const variant = subscription.variantId ? readProductVariants(product.variants).find(entry => entry.id === subscription.variantId) : undefined;
    if (subscription.variantId && !variant) return null;
    const extras = readProductExtras(product.extras);
    const picked = subscription.extraIds.flatMap(id => extras.filter(extra => extra.id === id));
    const base = variant?.amount ?? product.amount;
    return subscriptionPrices({ baseAmount: base, oneTimeAmount: base, extrasAmount: selectedExtrasAmount(picked), discountPercent }).lockedUnitAmount;
  }
```
with:
```ts
  /** What a renewal's quantity costs now, priced by the same rules as checkout (spec 2026-10-14, part a): a unit product keeps
   *  its tier and its step. Null when the line can no longer be priced (a removed option, units the product no longer sells). */
  private lockedUnit(product: { name?: string; amount: number; variants: Prisma.JsonValue; extras: Prisma.JsonValue; unit?: Prisma.JsonValue; tiers?: Prisma.JsonValue; discountPercent?: number | null; discountStartsAt?: Date | null; discountEndsAt?: Date | null }, subscription: CustomerSubscription, discountPercent: number): number | null {
    const variant = subscription.variantId ? readProductVariants(product.variants).find(entry => entry.id === subscription.variantId) : undefined;
    if (subscription.variantId && !variant) return null;
    const extras = readProductExtras(product.extras);
    const picked = subscription.extraIds.flatMap(id => extras.filter(extra => extra.id === id));
    try {
      return priceSellingLine({ product: { name: product.name ?? subscription.itemName ?? 'Producto', amount: product.amount, variants: product.variants, unit: product.unit, tiers: product.tiers, discountPercent: product.discountPercent ?? null, discountStartsAt: product.discountStartsAt ?? null, discountEndsAt: product.discountEndsAt ?? null }, variant, extrasAmount: selectedExtrasAmount(picked), quantity: subscription.quantity ?? 1, cadenceDiscountPercent: discountPercent }).lockedUnitAmount;
    } catch {
      return null;
    }
  }
```
- If `subscriptionPrices` is now unused in this file, remove it from the import.

- [ ] **Step 6: Run the new and existing subscription specs, and see them pass.**
  - Run: `cd apps/api && npx jest src/operations/subscription-units.spec.ts src/operations/subscribers.service.spec.ts src/operations/subscription-enrollment.spec.ts src/operations/subscription-pricing.spec.ts --maxWorkers=2`
  - Expected: PASS. The existing reprice test still sees `pendingUnitAmount: 8100` (9000 less 10 %).

- [ ] **Step 7: Commit.**

```bash
git add apps/api/src/operations/subscription-enrollment.ts apps/api/src/operations/subscribers.service.ts apps/api/src/operations/subscription-units.spec.ts
git commit -m "feat(tools): unit subscriptions are named «20 L» and reprice through the shared pricer

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Orders, receipts and the order list show «20 L» and the chosen options

**Existing code:**
- **Receipt email text** (`payment-intents.service.ts`, in the method that builds `itemLines`):
  ```ts
  `- ${line.name}${line.variantName ? ` (${line.variantName})` : ""}${line.extras?.length ? ` + ${selectedExtrasLabel(line.extras)}` : ""} x${line.quantity}: ${formatAmount(line.unitAmount * line.quantity, lineCurrency)}`,
  ```
- **Receipt email HTML lines**, in the same method's `lines: (cart ?? []).map(line => ({ … variant: line.variantName ?? null, … quantity: line.quantity, … }))`. The store-email renderer prints `x${item.quantity}`. It is the owner's uncommitted module and is not edited, so a unit line passes its «20 L» in `variant` and `quantity: 1`.
- **Checkout receipt page** (`apps/checkout/src/checkout/payment-result.ts`, `renderSuccess`): `<span class="receipt-qty">x${line.quantity}</span>`.
- **Dashboard order list** (`apps/merchant-dashboard/src/orders-panel.mjs`, `orderItemsLabel`, moved there from `dashboard.js` by the split plan): `return \`${name}${option} × ${item.quantity || 1}\`;`. `orders-panel.mjs` opens with `import { escapeHtml as esc } from "./html.mjs";`. The dev server (`server.mjs`) serves only the `/src/` files in its allow-list array, which contains `"/src/orders-panel.mjs",`.

**Files:**
- Modify: `apps/api/src/payment-intents/payment-intents.service.ts` (`CartInventoryLine` type; `itemLines`; the receipt `lines`)
- Modify: `apps/checkout/src/checkout/payment-result.ts` (`CartLine`; `linesHtml`)
- Create: `apps/merchant-dashboard/src/order-lines.mjs`
- Modify: `apps/merchant-dashboard/src/orders-panel.mjs` (import; `orderItemsLabel`)
- Modify: `apps/merchant-dashboard/server.mjs` (serve `/src/order-lines.mjs`)
- Create (tests): `apps/api/src/payment-intents/receipt-units.spec.ts`, `apps/checkout/test/receipt-units.test.ts`, `apps/merchant-dashboard/src/order-lines.test.mjs`

**Interfaces:**
- Consumes: the cart line keys `unit`, `quantityLabel` and `optionsLabel` (Task 3).
- Produces:
  - `export function receiptLineText(line: CartInventoryLine, currency: string): string` (payment-intents.service.ts, exported for the test).
  - `export function orderLineLabel(item): string` (order-lines.mjs).

- [ ] **Step 1: Live-stack check.** Run the command from Global Constraints and continue only on `[0,0]`.

- [ ] **Step 2: Write the failing tests.**

(a) Create `apps/api/src/payment-intents/receipt-units.spec.ts`:
```ts
import { receiptLineText } from './payment-intents.service';

/** Business tools part a (spec 2026-10-14): receipts show «20 L» and the chosen options, never «x40». */
describe('receipt lines', () => {
  it('names the units of a unit line and the choices of a builder line', () => {
    expect(receiptLineText({ paymentLinkId: 'leche', name: 'Leche entera', quantity: 40, unitAmount: 345, unit: { label: 'L', step: 0.5, units: 20 }, quantityLabel: '20 L' } as never, 'BOB')).toBe('- Leche entera 20 L: 138.00 BOB');
    expect(receiptLineText({ paymentLinkId: 'torta', name: 'Torta', quantity: 1, unitAmount: 21000, optionsLabel: 'Tamaño: Grande' } as never, 'BOB')).toBe('- Torta (Tamaño: Grande) x1: 210.00 BOB');
  });
  it('keeps an ordinary line as before', () => {
    expect(receiptLineText({ paymentLinkId: 'cafe', name: 'Café', variantName: '500 g', quantity: 2, unitAmount: 8000 } as never, 'BOB')).toBe('- Café (500 g) x2: 160.00 BOB');
  });
});
```

(b) Create `apps/checkout/test/receipt-units.test.ts`:
```ts
import { beforeAll, expect, it } from "vitest";

/** Business tools part a (spec 2026-10-14): the buyer's receipt page shows «20 L» and the cake's choices. */
let renderSuccess: (order: never, preview?: boolean) => void;
beforeAll(async () => {
  document.body.innerHTML = '<div id="app"></div>';
  ({ renderSuccess } = await import("../src/checkout/payment-result"));
});

it("shows the units and the choices instead of a step count", () => {
  renderSuccess({ id: "pi_units", amount: 34800, currency: "BOB", metadata: { cart: [
    { paymentLinkId: "leche", name: "Leche entera", quantity: 40, unitAmount: 345, unit: { label: "L", step: 0.5, units: 20 }, quantityLabel: "20 L" },
    { paymentLinkId: "torta", name: "Torta", quantity: 1, unitAmount: 21000, optionsLabel: "Tamaño: Grande" },
  ] } } as never, true);
  const lines = [...document.querySelectorAll(".receipt-line")].map(line => line.textContent!.replace(/\s+/g, " ").trim());
  expect(lines[0]).toMatch(/^Leche entera 20 L .*138/);
  expect(lines[0]).not.toContain("x40");
  expect(lines[1]).toMatch(/^Torta · Tamaño: Grande x1 .*210/);
});
```

(c) Create `apps/merchant-dashboard/src/order-lines.test.mjs`:
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { orderLineLabel } from "./order-lines.mjs";

test("a unit line reads «20 L», a builder line its choices, an ordinary line as before", () => {
  assert.equal(orderLineLabel({ name: "Leche entera", quantity: 40, unit: { label: "L", step: 0.5, units: 20 }, quantityLabel: "20 L" }), "Leche entera 20 L");
  assert.equal(orderLineLabel({ name: "Torta", quantity: 1, optionsLabel: "Tamaño: Grande" }), "Torta (Tamaño: Grande) × 1");
  assert.equal(orderLineLabel({ name: "Café", variantName: "500 g", quantity: 2 }), "Café (500 g) × 2");
  assert.equal(orderLineLabel({ label: "Té" }), "Té × 1");
});
```

- [ ] **Step 3: Run them and see them fail.**
  - Run: `cd apps/api && npx jest src/payment-intents/receipt-units.spec.ts`. Expected: FAIL, `receiptLineText is not a function`.
  - Run: `cd apps/checkout && npx vitest run test/receipt-units.test.ts`. Expected: FAIL, the line contains `x40`.
  - Run: `cd apps/merchant-dashboard && node --test src/order-lines.test.mjs`. Expected: FAIL, `Cannot find module`.

- [ ] **Step 4: The API receipt.** In `payment-intents.service.ts`:
- In `type CartInventoryLine`, after `unitAmount: number;`, add:
```ts
  unit?: { label: string; step: number; units: number };
  quantityLabel?: string;
  optionsLabel?: string;
```
- After the `function readProductVariants(...)` helper near the top, add:
```ts
/** One receipt line (spec 2026-10-14 business tools): «Leche entera 20 L: Bs 138,00», «Torta (Tamaño: Grande) x1: …». */
export function receiptLineText(line: CartInventoryLine, currency: string): string {
  const quantity = line.unit && line.quantityLabel ? line.quantityLabel : `x${line.quantity}`;
  return `- ${line.name}${line.variantName ? ` (${line.variantName})` : ""}${line.extras?.length ? ` + ${selectedExtrasLabel(line.extras)}` : ""}${line.optionsLabel ? ` (${line.optionsLabel})` : ""} ${quantity}: ${formatAmount(line.unitAmount * line.quantity, currency)}`;
}
```
- Replace the `itemLines` mapper body:
```ts
              (line) =>
                `- ${line.name}${line.variantName ? ` (${line.variantName})` : ""}${line.extras?.length ? ` + ${selectedExtrasLabel(line.extras)}` : ""} x${line.quantity}: ${formatAmount(line.unitAmount * line.quantity, lineCurrency)}`,
```
with:
```ts
              (line) => receiptLineText(line, lineCurrency),
```
- In the `renderReceipt` lines mapper, replace `variant: line.variantName ?? null,` and `quantity: line.quantity,` with:
```ts
            // The store's email kit prints x{quantity}: a unit line sends its «20 L» with the option text and counts as one.
            variant: [line.variantName, line.optionsLabel, line.unit ? line.quantityLabel : null].filter(Boolean).join(' · ') || null,
```
and
```ts
            quantity: line.unit ? 1 : line.quantity,
```
`formatAmount` and `selectedExtrasLabel` are already imported in this file. Do not touch `apps/api/src/store-emails/*`.

- [ ] **Step 5: The checkout receipt page.** In `apps/checkout/src/checkout/payment-result.ts`:
- In `export interface CartLine`, after `unitAmount: number;`, add `quantityLabel?: string; optionsLabel?: string; unit?: { label: string; step: number; units: number };`.
- Replace:
```ts
          <span>${escapeHtml(line.name)}${line.variantName ? ` · ${escapeHtml(line.variantName)}` : ""} <span class="receipt-qty">x${line.quantity}</span></span>
```
with:
```ts
          <span>${escapeHtml(line.name)}${line.variantName ? ` · ${escapeHtml(line.variantName)}` : ""}${line.optionsLabel ? ` · ${escapeHtml(line.optionsLabel)}` : ""} <span class="receipt-qty">${line.unit && line.quantityLabel ? escapeHtml(line.quantityLabel) : `x${line.quantity}`}</span></span>
```

- [ ] **Step 6: The dashboard order list.** Create `apps/merchant-dashboard/src/order-lines.mjs`:
```js
/** One order line in the merchant's list (spec 2026-10-14 business tools): «Leche entera 20 L», «Torta (Tamaño: Grande) × 1». */
export function orderLineLabel(item) {
  const name = item.name || item.label || "Producto";
  const details = [item.variantName, item.optionsLabel].filter(Boolean).join(" · ");
  const quantity = item.unit && item.quantityLabel ? item.quantityLabel : `× ${item.quantity || 1}`;
  return `${name}${details ? ` (${details})` : ""} ${quantity}`;
}
```
In `orders-panel.mjs`:
- After `import { escapeHtml as esc } from "./html.mjs";`, add `import { orderLineLabel } from "./order-lines.mjs";`.
- Inside `function orderItemsLabel(order)`, replace:
```js
    return order.items.map((item) => {
      const name = item.name || item.label || "Producto";
      const option = item.variantName ? ` (${item.variantName})` : "";
      return `${name}${option} × ${item.quantity || 1}`;
    }).join(" · ");
```
with:
```js
    return order.items.map(orderLineLabel).join(" · ");
```
- In `apps/merchant-dashboard/server.mjs`, in the allow-list array of served `/src/` files, replace `"/src/orders-panel.mjs",` with `"/src/orders-panel.mjs", "/src/order-lines.mjs",`. Editing `server.mjs` restarts the owner's dashboard dev server, the same as any dashboard edit under `pnpm dev`.

- [ ] **Step 7: Run all three, and the receipt specs that already exist, and see them pass.**
  - Run: `cd apps/api && npx jest src/payment-intents/receipt-units.spec.ts src/payment-intents/payment-intents.service.spec.ts src/payment-intents/payment-intents.order-email.spec.ts --maxWorkers=2`. Expected: PASS. An ordinary line's receipt text is byte-identical.
  - Run: `cd apps/checkout && npx vitest run test/receipt-units.test.ts test/purchase-tracking.test.ts test/confirmation-motif.test.ts`. Expected: PASS.
  - Run: `cd apps/merchant-dashboard && node --test src/order-lines.test.mjs unit/served-modules.test.mjs unit/dashboard-panels.test.mjs`. Expected: PASS. `served-modules` fails until `server.mjs` serves `/src/order-lines.mjs`.

- [ ] **Step 8: Commit.**

```bash
git add apps/api/src/payment-intents/payment-intents.service.ts apps/api/src/payment-intents/receipt-units.spec.ts apps/checkout/src/checkout/payment-result.ts apps/checkout/test/receipt-units.test.ts apps/merchant-dashboard/src/order-lines.mjs apps/merchant-dashboard/src/order-lines.test.mjs apps/merchant-dashboard/src/orders-panel.mjs apps/merchant-dashboard/server.mjs
git commit -m "feat(tools): receipts, the receipt page and the order list show «20 L» and the chosen options

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Request answers and the form guard (pure)

**Files:**
- Modify: `apps/api/src/stores/request-fields.ts` (append to the Task 2 file)
- Create: `apps/api/src/stores/tool-form-guard.ts`
- Create (tests): `apps/api/src/stores/request-fields.spec.ts`, `apps/api/src/stores/tool-form-guard.spec.ts`

**Interfaces:**
- Produces (plan b's tool sanitizer uses `readRequestFields`, and `StoreToolsService` implements `RequestToolSource`):
  ```ts
  export const REQUEST_FIELD_TYPES = ['text', 'number', 'date', 'choice', 'phone'] as const;
  export type RequestFieldType = typeof REQUEST_FIELD_TYPES[number];
  export type RequestField = { id: string; label: string; type: RequestFieldType; required: boolean; choices?: string[] };
  export type RequestAnswer = { id: string; value: string };
  export type StoredRequestField = { id: string; label: string; value: string };
  export const MAX_REQUEST_FIELDS = 12; export const REQUEST_TEXT_MAX = 400; export const REQUEST_LABEL_MAX = 80; export const REQUEST_CHOICES_MAX = 12;
  export function readRequestFields(value: unknown): RequestField[];
  export function validateRequestAnswers(fields: RequestField[], answers: RequestAnswer[], trustedPhone?: string): StoredRequestField[];
  export const REQUEST_TOOLS = Symbol('REQUEST_TOOLS');
  export type ApprovedRequestTool = { id: string; title: string; fields: RequestField[]; depositProductId: string | null };
  export interface RequestToolSource { approvedRequestTool(storeId: string, toolId: string): Promise<ApprovedRequestTool | null> }
  // tool-form-guard.ts
  export const TOOL_FORM_MIN_FILL_MS = 3_000; export const TOOL_FORM_MAX_AGE_MS = 7_200_000;
  export const TOOL_REQUESTS_PER_VISITOR = 3; export const TOOL_REQUEST_WINDOW_MS = 600_000;
  export type ToolFormCheck = 'ok' | 'invalid' | 'too-fast' | 'expired';
  export function issueToolFormToken(secret: string, storeId: string, toolId: string, now?: number): string;
  export function checkToolFormToken(secret: string, token: string, storeId: string, toolId: string, now?: number): ToolFormCheck;
  export function visitorHash(secret: string, ip: string): string;
  export function depositToken(secret: string, leadId: string, productId: string): string;
  export function checkDepositToken(secret: string, token: string, leadId: string, productId: string): boolean;
  ```

- [ ] **Step 1: Live-stack check.** Run the command from Global Constraints and continue only on `[0,0]`.

- [ ] **Step 2: Write the failing tests.**

(a) Create `apps/api/src/stores/request-fields.spec.ts`:
```ts
import { readRequestFields, validateRequestAnswers, type RequestField } from './request-fields';

/** Business tools part a.4 (spec 2026-10-14): answers are checked against the approved tool's field list. */
const FIELDS: RequestField[] = [
  { id: 'empresa', label: 'Empresa', type: 'text', required: true },
  { id: 'personas', label: 'Personas en el equipo', type: 'number', required: false },
  { id: 'fecha', label: 'Fecha preferida', type: 'date', required: true },
  { id: 'area', label: 'Área', type: 'choice', required: true, choices: ['Finanzas', 'Ventas'] },
  { id: 'telefono', label: 'Teléfono', type: 'phone', required: true },
];
const ok = [{ id: 'empresa', value: ' Andes SRL ' }, { id: 'personas', value: '12' }, { id: 'fecha', value: '2026-11-02' }, { id: 'area', value: 'Ventas' }, { id: 'telefono', value: '+591 71234567' }];

describe('validateRequestAnswers', () => {
  it('keeps the labels with the trimmed values, in the field order', () => {
    expect(validateRequestAnswers(FIELDS, [...ok].reverse())).toEqual([
      { id: 'empresa', label: 'Empresa', value: 'Andes SRL' }, { id: 'personas', label: 'Personas en el equipo', value: '12' },
      { id: 'fecha', label: 'Fecha preferida', value: '2026-11-02' }, { id: 'area', label: 'Área', value: 'Ventas' }, { id: 'telefono', label: 'Teléfono', value: '+591 71234567' },
    ]);
  });
  it('drops an empty optional answer and fills a missing phone from the trusted dialog', () => {
    const answers = ok.filter(answer => answer.id !== 'telefono').map(answer => answer.id === 'personas' ? { ...answer, value: '  ' } : answer);
    expect(validateRequestAnswers(FIELDS, answers, '70000000').map(answer => answer.id)).toEqual(['empresa', 'fecha', 'area', 'telefono']);
  });
  it.each([
    ['an unknown id', [...ok, { id: 'tarjeta', value: '4111' }], 'Una respuesta no corresponde a este formulario.'],
    ['a repeated id', [...ok, { id: 'empresa', value: 'Otra' }], 'Una respuesta no corresponde a este formulario.'],
    ['a missing required answer', ok.filter(answer => answer.id !== 'empresa'), 'Completa «Empresa».'],
    ['text over 400 characters', ok.map(answer => answer.id === 'empresa' ? { ...answer, value: 'x'.repeat(401) } : answer), 'Revisa «Empresa».'],
    ['a word for a number', ok.map(answer => answer.id === 'personas' ? { ...answer, value: 'doce' } : answer), 'Revisa «Personas en el equipo».'],
    ['a date that does not exist', ok.map(answer => answer.id === 'fecha' ? { ...answer, value: '2026-02-30' } : answer), 'Revisa «Fecha preferida».'],
    ['a choice outside the list', ok.map(answer => answer.id === 'area' ? { ...answer, value: 'Legal' } : answer), 'Revisa «Área».'],
    ['a phone with letters', ok.map(answer => answer.id === 'telefono' ? { ...answer, value: 'llámame' } : answer), 'Revisa «Teléfono».'],
    ['a bidi override', ok.map(answer => answer.id === 'empresa' ? { ...answer, value: 'Andes‮' } : answer), 'Revisa «Empresa».'],
  ])('refuses %s', (_name, answers, message) => {
    expect(() => validateRequestAnswers(FIELDS, answers as never)).toThrow(message);
  });
  it('refuses more than 12 answers', () => {
    expect(() => validateRequestAnswers(FIELDS, Array.from({ length: 13 }, (_, i) => ({ id: `f${i}`, value: 'x' })))).toThrow('Una respuesta no corresponde a este formulario.');
  });
});

describe('readRequestFields', () => {
  it('keeps a well-formed list and refuses anything else whole', () => {
    expect(readRequestFields(FIELDS)).toEqual(FIELDS);
    expect(readRequestFields([...FIELDS, ...FIELDS.map(field => ({ ...field, id: `${field.id}2` })), ...FIELDS.map(field => ({ ...field, id: `${field.id}3` }))])).toEqual([]);
    expect(readRequestFields([{ id: 'area', label: 'Área', type: 'choice', required: true, choices: [] }])).toEqual([]);
    expect(readRequestFields([{ id: 'x', label: 'Correo', type: 'email', required: true }])).toEqual([]);
  });
});
```

(b) Create `apps/api/src/stores/tool-form-guard.spec.ts`:
```ts
import { checkDepositToken, checkToolFormToken, depositToken, issueToolFormToken, visitorHash } from './tool-form-guard';

/** Business tools part a.5 (spec 2026-10-14): a signed fill-time token and the deposit token. */
const T0 = Date.parse('2026-10-15T12:00:00Z');
describe('the fill-time token', () => {
  const token = issueToolFormToken('secret', 'store_1', 'tl0123456789abcdef01', T0);
  it('accepts the form after 3 s and before 2 h', () => {
    expect(checkToolFormToken('secret', token, 'store_1', 'tl0123456789abcdef01', T0 + 3_000)).toBe('ok');
    expect(checkToolFormToken('secret', token, 'store_1', 'tl0123456789abcdef01', T0 + 7_199_000)).toBe('ok');
  });
  it('refuses a form sent faster than a person can fill it, or kept open too long', () => {
    expect(checkToolFormToken('secret', token, 'store_1', 'tl0123456789abcdef01', T0 + 2_999)).toBe('too-fast');
    expect(checkToolFormToken('secret', token, 'store_1', 'tl0123456789abcdef01', T0 + 7_200_001)).toBe('expired');
  });
  it('refuses a forged time, another store, another tool or another secret', () => {
    const [, mac] = token.split('.');
    expect(checkToolFormToken('secret', `${T0 - 60_000}.${mac}`, 'store_1', 'tl0123456789abcdef01', T0 + 5_000)).toBe('invalid');
    expect(checkToolFormToken('secret', token, 'store_2', 'tl0123456789abcdef01', T0 + 5_000)).toBe('invalid');
    expect(checkToolFormToken('secret', token, 'store_1', 'tl0123456789abcdef02', T0 + 5_000)).toBe('invalid');
    expect(checkToolFormToken('other', token, 'store_1', 'tl0123456789abcdef01', T0 + 5_000)).toBe('invalid');
    expect(checkToolFormToken('secret', 'garbage', 'store_1', 'tl0123456789abcdef01', T0 + 5_000)).toBe('invalid');
  });
});

describe('the visitor hash and the deposit token', () => {
  it('hashes a visitor without keeping the address', () => {
    expect(visitorHash('secret', '10.0.0.1')).toMatch(/^[a-f0-9]{64}$/);
    expect(visitorHash('secret', '10.0.0.1')).not.toBe(visitorHash('secret', '10.0.0.2'));
    expect(visitorHash('secret', '10.0.0.1')).not.toContain('10.0.0.1');
  });
  it('binds a deposit to one lead and one product', () => {
    const token = depositToken('secret', 'lead_1', 'deposit_1');
    expect(checkDepositToken('secret', token, 'lead_1', 'deposit_1')).toBe(true);
    expect(checkDepositToken('secret', token, 'lead_2', 'deposit_1')).toBe(false);
    expect(checkDepositToken('secret', token, 'lead_1', 'other_product')).toBe(false);
    expect(checkDepositToken('secret', 'short', 'lead_1', 'deposit_1')).toBe(false);
  });
});
```

- [ ] **Step 3: Run them and see them fail.**
  - Run: `cd apps/api && npx jest src/stores/request-fields.spec.ts src/stores/tool-form-guard.spec.ts --maxWorkers=2`
  - Expected: FAIL. `validateRequestAnswers is not a function`, and `Cannot find module './tool-form-guard'`.

- [ ] **Step 4: Write the answers module.** Replace `apps/api/src/stores/request-fields.ts` with:

```ts
/**
 * Business tools, part a.4 (spec 2026-10-14). A request tool's field list, and the check of a buyer's answers against it.
 * The answers are stored as { id, label, value } so the inbox and the merchant's email read without the tool.
 */
import { BadRequestException } from '@nestjs/common';
import { SAFE_TEXT_PATTERN } from '../common/validation/safe-text.decorator';

/** Business tools (spec 2026-10-14): a tool id as StoreTool rows and the kit mount (data-pagosya-tool) carry it. */
export const TOOL_ID_PATTERN = /^tl[a-f0-9]{18}$/;
export const REQUEST_FIELD_TYPES = ['text', 'number', 'date', 'choice', 'phone'] as const;
export type RequestFieldType = typeof REQUEST_FIELD_TYPES[number];
export type RequestField = { id: string; label: string; type: RequestFieldType; required: boolean; choices?: string[] };
export type RequestAnswer = { id: string; value: string };
export type StoredRequestField = { id: string; label: string; value: string };
export const MAX_REQUEST_FIELDS = 12;
export const REQUEST_TEXT_MAX = 400;
export const REQUEST_LABEL_MAX = 80;
export const REQUEST_CHOICES_MAX = 12;
const FIELD_ID = /^[a-z0-9][a-z0-9-]{0,31}$/;

/** The approved request tool, as the leads endpoint needs it. Implemented by plan b's StoreToolsService. */
export const REQUEST_TOOLS = Symbol('REQUEST_TOOLS');
export type ApprovedRequestTool = { id: string; title: string; fields: RequestField[]; depositProductId: string | null };
export interface RequestToolSource { approvedRequestTool(storeId: string, toolId: string): Promise<ApprovedRequestTool | null> }

const cleanText = (value: unknown, max: number) => typeof value === 'string' && value.trim() && value.trim().length <= max && SAFE_TEXT_PATTERN.test(value) && !/[<>]/.test(value) ? value.trim() : null;

/** A field list as stored on a tool. Anything malformed, more than 12 fields, or a repeated id, reads as no fields. */
export function readRequestFields(value: unknown): RequestField[] {
  if (!Array.isArray(value) || !value.length || value.length > MAX_REQUEST_FIELDS) return [];
  const fields: RequestField[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [];
    const raw = entry as Record<string, unknown>;
    const id = typeof raw.id === 'string' && FIELD_ID.test(raw.id) ? raw.id : null;
    const label = cleanText(raw.label, REQUEST_LABEL_MAX);
    const type = (REQUEST_FIELD_TYPES as readonly unknown[]).includes(raw.type) ? raw.type as RequestFieldType : null;
    if (!id || !label || !type || typeof raw.required !== 'boolean' || fields.some(field => field.id === id)) return [];
    if (type === 'choice') {
      const choices = Array.isArray(raw.choices) ? raw.choices.map(choice => cleanText(choice, REQUEST_LABEL_MAX)) : [];
      if (!choices.length || choices.length > REQUEST_CHOICES_MAX || choices.some(choice => !choice) || new Set(choices).size !== choices.length) return [];
      fields.push({ id, label, type, required: raw.required, choices: choices as string[] });
    } else fields.push({ id, label, type, required: raw.required });
  }
  return fields;
}

function validDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.getUTCFullYear() === Number(match[1]) && date.getUTCMonth() === Number(match[2]) - 1 && date.getUTCDate() === Number(match[3]);
}
function valid(field: RequestField, value: string): boolean {
  if (value.length > REQUEST_TEXT_MAX || !SAFE_TEXT_PATTERN.test(value)) return false;
  if (field.type === 'number') return /^-?\d{1,9}(?:[.,]\d{1,3})?$/.test(value);
  if (field.type === 'date') return validDate(value);
  if (field.type === 'choice') return field.choices!.includes(value);
  if (field.type === 'phone') { const digits = value.replace(/\D/g, '').length; return /^[+\d\s()-]{7,24}$/.test(value) && digits >= 7 && digits <= 15; }
  return true;
}

/** Checks a buyer's answers against the approved field list (spec part a.4). Refuses unknown, repeated and missing
 *  required ids and wrong types; a missing phone-type answer takes the phone from pagosYa's trusted dialog. */
export function validateRequestAnswers(fields: RequestField[], answers: RequestAnswer[], trustedPhone?: string): StoredRequestField[] {
  if (answers.length > MAX_REQUEST_FIELDS) throw new BadRequestException('Una respuesta no corresponde a este formulario.');
  const byId = new Map<string, string>();
  for (const answer of answers) {
    if (typeof answer?.id !== 'string' || typeof answer.value !== 'string' || byId.has(answer.id) || !fields.some(field => field.id === answer.id)) throw new BadRequestException('Una respuesta no corresponde a este formulario.');
    byId.set(answer.id, answer.value.trim());
  }
  const stored: StoredRequestField[] = [];
  for (const field of fields) {
    let value = byId.get(field.id) ?? '';
    if (!value && field.type === 'phone' && trustedPhone?.trim()) value = trustedPhone.trim();
    if (!value) { if (field.required) throw new BadRequestException(`Completa «${field.label}».`); continue; }
    if (!valid(field, value)) throw new BadRequestException(`Revisa «${field.label}».`);
    stored.push({ id: field.id, label: field.label, value });
  }
  return stored;
}
```

- [ ] **Step 5: Write the guard.** Create `apps/api/src/stores/tool-form-guard.ts`:

```ts
/**
 * Business tools, part a.5 (spec 2026-10-14): abuse protection for request forms. The form carries a signed issue time; a
 * submission under 3 s is a script, one over 2 h a stale page. The visitor hash keeps a salted digest, never the address.
 * The deposit token ties one lead to one deposit product, so a token can never pay for something else.
 */
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export const TOOL_FORM_MIN_FILL_MS = 3_000;
export const TOOL_FORM_MAX_AGE_MS = 2 * 60 * 60_000;
export const TOOL_REQUESTS_PER_VISITOR = 3;
export const TOOL_REQUEST_WINDOW_MS = 10 * 60_000;
export type ToolFormCheck = 'ok' | 'invalid' | 'too-fast' | 'expired';

const mac = (secret: string, text: string) => createHmac('sha256', secret).update(text).digest('base64url');
function same(a: string, b: string): boolean {
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function issueToolFormToken(secret: string, storeId: string, toolId: string, now = Date.now()): string {
  return `${now}.${mac(secret, `tool-form:${storeId}:${toolId}:${now}`)}`;
}
export function checkToolFormToken(secret: string, token: string, storeId: string, toolId: string, now = Date.now()): ToolFormCheck {
  const match = /^(\d{13})\.([A-Za-z0-9_-]{43})$/.exec(token);
  if (!match || !same(match[2], mac(secret, `tool-form:${storeId}:${toolId}:${match[1]}`))) return 'invalid';
  const age = now - Number(match[1]);
  if (age < TOOL_FORM_MIN_FILL_MS) return 'too-fast';
  return age > TOOL_FORM_MAX_AGE_MS ? 'expired' : 'ok';
}
export function visitorHash(secret: string, ip: string): string {
  return createHash('sha256').update(`tool-visitor:${secret}:${ip}`).digest('hex');
}
export function depositToken(secret: string, leadId: string, productId: string): string {
  return mac(secret, `tool-deposit:${leadId}:${productId}`);
}
export function checkDepositToken(secret: string, token: string, leadId: string, productId: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(token) && same(token, depositToken(secret, leadId, productId));
}
```

- [ ] **Step 6: Run them and see them pass.**
  - Run: `cd apps/api && npx jest src/stores/request-fields.spec.ts src/stores/tool-form-guard.spec.ts src/stores/selling-rules.spec.ts --maxWorkers=2`
  - Expected: PASS.

- [ ] **Step 7: Commit.**

```bash
git add apps/api/src/stores/request-fields.ts apps/api/src/stores/tool-form-guard.ts apps/api/src/stores/request-fields.spec.ts apps/api/src/stores/tool-form-guard.spec.ts
git commit -m "feat(tools): request answers checked against the approved fields; signed fill time, visitor hash, deposit token

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Tool requests at the leads endpoint

**Existing code:**
- `submitLead(slug, dto)` (`store-checkout.service.ts:340`) begins `const store = await findActiveStoreBySlug(this.prisma, slug);`.
- The controller route `@Post(":slug/leads") … submitLead(@Param("slug") slug: string, @Body() dto: SubmitStoreLeadDto) { return this.storeCheckout.submitLead(slug, dto); }` (`stores-public.controller.ts:75-79`).
- The service constructor ends with `@Optional() private readonly inbox?: InboxService,`.

**Files:**
- Modify: `apps/api/src/stores/dto/submit-store-lead.dto.ts`
- Modify: `apps/api/src/stores/store-checkout.service.ts` (constructor; `submitLead` signature; new `submitToolRequest` and `toolFormToken`; a `formSecret` helper)
- Modify: `apps/api/src/stores/stores-public.controller.ts` (IP for leads; the form-token route)
- Create (test): `apps/api/src/stores/tool-leads.spec.ts`

**Interfaces:**
- Consumes: Task 8; `InboxService.threadForLead`; the `EmailProvider`.
- Produces:
  - `SubmitStoreLeadDto.toolId?`, `.fields?: RequestAnswerDto[]` (at most 12), `.website?` and `.formToken?`.
  - `StoreCheckoutService` constructor: a 7th optional parameter, `@Optional() @Inject(REQUEST_TOOLS) requestTools?: RequestToolSource`.
  - `submitLead(slug: string, dto: SubmitStoreLeadDto, ip?: string): Promise<{ submitted: true; leadId: string | null; deposit?: { productId: string; token: string } | null }>`.
  - `toolFormToken(slug: string, toolId: string): Promise<{ token: string }>`.
  - The route `GET /v1/stores/public/:slug/tools/:toolId/form-token`, throttled 30 per 60 s.

- [ ] **Step 1: Live-stack check.** Run the command from Global Constraints and continue only on `[0,0]`.

- [ ] **Step 2: Write the failing test.** Create `apps/api/src/stores/tool-leads.spec.ts`:

```ts
import { HttpException } from '@nestjs/common';
import { StoreStatus } from '@prisma/client';
import { StoreCheckoutService } from './store-checkout.service';
import { checkDepositToken, checkToolFormToken, issueToolFormToken, visitorHash } from './tool-form-guard';

/** Business tools parts a.4 and a.5 (spec 2026-10-14): a request form's answers reach the merchant, abuse does not. */
const SECRET = 'test-secret';
const TOOL_ID = 'tl0123456789abcdef01';
const TOOL = { id: TOOL_ID, title: 'Pide tu diagnóstico', depositProductId: 'deposit_1', fields: [
  { id: 'empresa', label: 'Empresa', type: 'text', required: true },
  { id: 'fecha', label: 'Fecha preferida', type: 'date', required: true },
  { id: 'telefono', label: 'Teléfono', type: 'phone', required: false },
] };
const STORE = { id: 'store_1', merchantId: 'm_1', slug: 'brujula', name: 'Brújula Consultores', status: StoreStatus.ACTIVE, sourcePublicationPaused: false, publicVisibility: true, contactFormEnabled: false, contactFormEmail: null, contactEmail: 'hola@brujula.bo', checkoutMode: 'payment', locations: [] };
const T0 = Date.parse('2026-10-15T12:00:00Z');

function setup(tool: unknown = TOOL) {
  const prisma: any = {
    store: { findUnique: jest.fn().mockResolvedValue(STORE) },
    merchant: { findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'm_1', email: 'owner@brujula.bo' }) },
    paymentLink: { findFirst: jest.fn().mockResolvedValue({ id: 'deposit_1', name: 'Anticipo de diagnóstico', amount: 15000, currency: 'BOB' }) },
    storeLead: { create: jest.fn().mockResolvedValue({ id: 'lead_1' }), count: jest.fn().mockResolvedValue(0) },
  };
  const email = { send: jest.fn().mockResolvedValue(undefined) };
  const inbox = { threadForLead: jest.fn().mockResolvedValue(undefined) };
  const config = { get: (key: string) => (key === 'app.orderTrackingSecret' ? SECRET : undefined) };
  const requestTools = { approvedRequestTool: jest.fn().mockResolvedValue(tool) };
  const service = new StoreCheckoutService(prisma, { create: jest.fn() } as any, email as any, undefined, config as any, inbox as any, requestTools);
  return { prisma, email, inbox, requestTools, service };
}
const dto = (over: Record<string, unknown> = {}) => ({ items: [], name: 'Lucía', email: 'Lucia@Gmail.com', phone: '+591 71234567', toolId: TOOL_ID, formToken: issueToolFormToken(SECRET, 'store_1', TOOL_ID, T0), fields: [{ id: 'empresa', value: 'Andes SRL' }, { id: 'fecha', value: '2026-11-02' }], ...over }) as any;

describe('tool requests at the leads endpoint (spec 2026-10-14, part a)', () => {
  beforeEach(() => { jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] }).setSystemTime(T0 + 4_000); });
  afterEach(() => jest.useRealTimers());

  it('saves the labelled answers even with the contact form off, emails the store, opens the inbox thread and offers the deposit', async () => {
    const { service, prisma, email, inbox } = setup();
    const result = await service.submitLead('brujula', dto(), '10.0.0.1');
    expect(prisma.storeLead.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      storeId: 'store_1', customerName: 'Lucía', customerEmail: 'lucia@gmail.com', customerPhone: '+591 71234567', items: [], amount: 0, toolId: TOOL_ID,
      fields: [{ id: 'empresa', label: 'Empresa', value: 'Andes SRL' }, { id: 'fecha', label: 'Fecha preferida', value: '2026-11-02' }, { id: 'telefono', label: 'Teléfono', value: '+591 71234567' }],
      visitorHash: visitorHash(SECRET, '10.0.0.1'),
    }), select: { id: true } });
    expect(email.send.mock.calls[0][0]).toMatchObject({ to: 'hola@brujula.bo', subject: 'Nueva solicitud en Brújula Consultores: Pide tu diagnóstico', replyTo: 'lucia@gmail.com' });
    expect(email.send.mock.calls[0][0].body).toContain('- Empresa: Andes SRL');
    expect(email.send.mock.calls[0][0].body).toContain('Anticipo: Anticipo de diagnóstico');
    expect(inbox.threadForLead).toHaveBeenCalledWith(expect.objectContaining({ id: 'lead_1', message: expect.stringContaining('- Fecha preferida: 2026-11-02') }));
    expect(result).toEqual({ submitted: true, leadId: 'lead_1', deposit: { productId: 'deposit_1', token: expect.any(String) } });
    expect(checkDepositToken(SECRET, result.deposit!.token, 'lead_1', 'deposit_1')).toBe(true);
  });

  it('a deleted deposit product: the request is still saved and sent, with no deposit offered', async () => {
    const { service, prisma, email } = setup();
    prisma.paymentLink.findFirst.mockResolvedValue(null);
    await expect(service.submitLead('brujula', dto(), '10.0.0.1')).resolves.toEqual({ submitted: true, leadId: 'lead_1', deposit: null });
    expect(prisma.paymentLink.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'deposit_1', storeId: 'store_1', status: 'ACTIVE' } }));
    expect(email.send.mock.calls[0][0].body).not.toContain('Anticipo');
  });

  it('a filled honeypot answers like a success and saves and sends nothing', async () => {
    const { service, prisma, email } = setup();
    await expect(service.submitLead('brujula', dto({ website: 'https://spam.example' }), '10.0.0.1')).resolves.toEqual({ submitted: true, leadId: null, deposit: null });
    expect(prisma.storeLead.create).not.toHaveBeenCalled();
    expect(email.send).not.toHaveBeenCalled();
  });

  it('refuses a form sent in under 3 s, a forged token and a token for another tool', async () => {
    const { service, prisma } = setup();
    await expect(service.submitLead('brujula', dto({ formToken: issueToolFormToken(SECRET, 'store_1', TOOL_ID, T0 + 2_000) }), '10.0.0.1')).rejects.toThrow('Revisa tus respuestas y vuelve a enviar en unos segundos.');
    await expect(service.submitLead('brujula', dto({ formToken: `${T0}.${'A'.repeat(43)}` }), '10.0.0.1')).rejects.toThrow('El formulario caducó. Recarga la página y vuelve a enviarlo.');
    await expect(service.submitLead('brujula', dto({ formToken: issueToolFormToken(SECRET, 'store_1', 'tl0123456789abcdef02', T0) }), '10.0.0.1')).rejects.toThrow('El formulario caducó.');
    expect(prisma.storeLead.create).not.toHaveBeenCalled();
  });

  it('refuses a fourth request from the same visitor within 10 minutes with 429', async () => {
    const { service, prisma } = setup();
    prisma.storeLead.count.mockResolvedValue(3);
    const error = await service.submitLead('brujula', dto(), '10.0.0.1').catch(caught => caught);
    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(429);
    expect(prisma.storeLead.count).toHaveBeenCalledWith({ where: { storeId: 'store_1', visitorHash: visitorHash(SECRET, '10.0.0.1'), createdAt: { gte: new Date(T0 + 4_000 - 600_000) } } });
  });

  it.each([
    ['an answer the tool does not ask for', { fields: [{ id: 'empresa', value: 'Andes' }, { id: 'fecha', value: '2026-11-02' }, { id: 'ci', value: '1234567' }] }, 'Una respuesta no corresponde a este formulario.'],
    ['a missing required answer', { fields: [{ id: 'empresa', value: 'Andes' }] }, 'Completa «Fecha preferida».'],
    ['cart products on a request', { items: [{ paymentLinkId: 'p1', quantity: 1 }] }, 'Una solicitud no lleva productos del carrito.'],
  ])('refuses %s', async (_name, over, message) => {
    await expect(setup().service.submitLead('brujula', dto(over), '10.0.0.1')).rejects.toThrow(message);
  });

  it('refuses a tool that is not approved (draft, hidden, another store)', async () => {
    const { service, requestTools } = setup(null);
    await expect(service.submitLead('brujula', dto(), '10.0.0.1')).rejects.toThrow('Este formulario ya no está disponible.');
    expect(requestTools.approvedRequestTool).toHaveBeenCalledWith('store_1', TOOL_ID);
  });

  it('issues a form token only for an approved request tool', async () => {
    const { service } = setup();
    const { token } = await service.toolFormToken('brujula', TOOL_ID);
    expect(checkToolFormToken(SECRET, token, 'store_1', TOOL_ID, T0 + 8_000)).toBe('ok');
    await expect(setup(null).service.toolFormToken('brujula', TOOL_ID)).rejects.toThrow('Este formulario ya no está disponible.');
  });
});
```

- [ ] **Step 3: Run it and see it fail.**
  - Run: `cd apps/api && npx jest src/stores/tool-leads.spec.ts`
  - Expected: FAIL. The contact-form path throws «El formulario de contacto no está habilitado para esta tienda», and `service.toolFormToken is not a function`.

- [ ] **Step 4: The DTO.** In `submit-store-lead.dto.ts`:
- Add `ArrayMaxSize` (already imported), `Matches` to the class-validator import, and `import { TOOL_ID_PATTERN } from "../request-fields";`.
- Before `export class SubmitStoreLeadDto`, add:

```ts
/** One answer of a request tool (spec 2026-10-14, part a.4). Checked against the approved tool's fields in the service. */
export class RequestAnswerDto {
  @ApiProperty() @IsString() @Matches(/^[a-z0-9][a-z0-9-]{0,31}$/) id!: string;
  @ApiProperty() @IsString() @IsSafeText() @MaxLength(400) value!: string;
}
```
- Inside `SubmitStoreLeadDto`, after the `origin` property, add:

```ts

  /** A business tool's request form (spec 2026-10-14): its approved tool, the answers, the honeypot and the signed fill time. */
  @ApiPropertyOptional() @IsOptional() @IsString() @Matches(TOOL_ID_PATTERN) toolId?: string;

  @ApiPropertyOptional({ type: [RequestAnswerDto] })
  @IsOptional() @IsArray() @ArrayMaxSize(12) @ValidateNested({ each: true }) @Type(() => RequestAnswerDto)
  fields?: RequestAnswerDto[];

  /** Honeypot: hidden from people; a filled value is a bot. */
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) website?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @Matches(/^\d{13}\.[A-Za-z0-9_-]{43}$/) formToken?: string;
```

- [ ] **Step 5: The service.** In `store-checkout.service.ts`:

(a) Imports. Add `HttpException, HttpStatus` to the `@nestjs/common` import, then add:
```ts
import { REQUEST_TOOLS, validateRequestAnswers, type RequestToolSource } from "./request-fields";
import { checkToolFormToken, depositToken, issueToolFormToken, TOOL_REQUEST_WINDOW_MS, TOOL_REQUESTS_PER_VISITOR, visitorHash } from "./tool-form-guard";
import type { Store } from "@prisma/client";
```

(b) In the constructor, after `@Optional() private readonly inbox?: InboxService,`, add:
```ts
    // Business tools (spec 2026-10-14): the approved request tools, provided by StoreToolsService (plan b). Without it no
    // tool request is accepted.
    @Optional() @Inject(REQUEST_TOOLS) private readonly requestTools?: RequestToolSource,
```

(c) Add these methods right before `/** Public lead capture …`:
```ts
  /** The secret that signs tool forms and deposits: the order-tracking secret, which production already requires. */
  private formSecret(): string {
    return this.config?.get<string>("app.orderTrackingSecret") ?? DEVELOPMENT_ORDER_TRACKING_SECRET;
  }

  /** Public — the signed fill time a request form carries (spec 2026-10-14, part a.5). Only for an approved request tool. */
  async toolFormToken(slug: string, toolId: string): Promise<{ token: string }> {
    const store = await findActiveStoreBySlug(this.prisma, slug);
    const tool = await this.requestTools?.approvedRequestTool(store.id, toolId);
    if (!tool) throw new BadRequestException("Este formulario ya no está disponible.");
    return { token: issueToolFormToken(this.formSecret(), store.id, tool.id) };
  }

  /**
   * A business tool's request (spec 2026-10-14, parts a.4 and a.5). The answers are checked against the approved tool's
   * fields. Abuse protection:
   * - a filled honeypot gets a success that saves and sends nothing;
   * - a form sent under 3 s, or with a bad token, is refused;
   * - a visitor may send 3 requests in 10 minutes.
   * The deposit product is offered only while it is on sale in this store.
   */
  private async submitToolRequest(store: Store, dto: SubmitStoreLeadDto, ip: string) {
    const secret = this.formSecret();
    if (dto.items.length) throw new BadRequestException("Una solicitud no lleva productos del carrito.");
    const tool = await this.requestTools?.approvedRequestTool(store.id, dto.toolId!);
    if (!tool) throw new BadRequestException("Este formulario ya no está disponible.");
    if (dto.website?.trim()) {
      this.logger.warn(JSON.stringify({ event: "tool_request_honeypot", storeId: store.id, toolId: tool.id }));
      return { submitted: true as const, leadId: null, deposit: null };
    }
    const form = checkToolFormToken(secret, dto.formToken ?? "", store.id, tool.id);
    if (form === "too-fast") throw new BadRequestException("Revisa tus respuestas y vuelve a enviar en unos segundos.");
    if (form !== "ok") throw new BadRequestException("El formulario caducó. Recarga la página y vuelve a enviarlo.");
    const visitor = visitorHash(secret, ip);
    const recent = await this.prisma.storeLead.count({ where: { storeId: store.id, visitorHash: visitor, createdAt: { gte: new Date(Date.now() - TOOL_REQUEST_WINDOW_MS) } } });
    if (recent >= TOOL_REQUESTS_PER_VISITOR) throw new HttpException("Ya enviaste varias solicitudes. Intenta de nuevo en unos minutos.", HttpStatus.TOO_MANY_REQUESTS);
    const customerPhone = dto.phone?.trim() || "";
    if (customerPhone) {
      const digitCount = customerPhone.replace(/\D/g, "").length;
      if (digitCount < 7 || digitCount > 15) throw new BadRequestException("Escribe un número de WhatsApp válido");
    }
    const answers = validateRequestAnswers(tool.fields, dto.fields ?? [], customerPhone || undefined);
    const customerName = dto.name?.trim() || "Cliente interesado";
    const customerEmail = dto.email.trim().toLowerCase();
    const [merchant, depositProduct] = await Promise.all([
      this.prisma.merchant.findUniqueOrThrow({ where: { id: store.merchantId } }),
      tool.depositProductId && store.checkoutMode === "payment"
        ? this.prisma.paymentLink.findFirst({ where: { id: tool.depositProductId, storeId: store.id, status: PaymentLinkStatus.ACTIVE }, select: { id: true, name: true, amount: true, currency: true } })
        : null,
    ]);
    const answersText = answers.map((answer) => `- ${answer.label}: ${answer.value}`).join("\n");
    const thread = [`Solicitud: ${tool.title}`, answersText, dto.message?.trim() ? `Mensaje: ${dto.message.trim()}` : ""].filter(Boolean).join("\n");
    const lead = await this.prisma.storeLead.create({
      data: {
        merchantId: store.merchantId, storeId: store.id, customerName, customerEmail, customerPhone,
        message: dto.message?.trim() || null, items: [], amount: 0, currency: depositProduct?.currency ?? "BOB",
        toolId: tool.id, fields: answers as unknown as Prisma.InputJsonValue, visitorHash: visitor,
      },
      select: { id: true },
    });
    const body = [
      `Nueva solicitud desde ${store.name}: ${tool.title}`, "",
      `Nombre: ${customerName}`, `Correo para responder: ${customerEmail}`, ...(customerPhone ? [`WhatsApp: ${customerPhone}`] : []), "",
      "Respuestas:", answersText,
      ...(dto.message?.trim() ? ["", `Mensaje: ${dto.message.trim()}`] : []),
      ...(depositProduct ? ["", `Anticipo: ${depositProduct.name} (${(depositProduct.amount / 100).toFixed(2)} ${depositProduct.currency}), pendiente hasta que el cliente pague.`] : []),
      "", "Este mensaje fue enviado por pagosYa. Responde al correo indicado por el cliente.",
    ].join("\n");
    await this.emailProvider?.send({ to: store.contactFormEmail || store.contactEmail || merchant.email, subject: `Nueva solicitud en ${store.name}: ${tool.title}`, body, replyTo: customerEmail, failLoudly: true })
      .catch(() => this.logger.warn("Tool request saved; email notification failed"));
    await this.inbox?.threadForLead({ ...lead, storeId: store.id, merchantId: store.merchantId, customerEmail, customerName, message: thread }).catch(() => undefined);
    return { submitted: true as const, leadId: lead.id, deposit: depositProduct ? { productId: depositProduct.id, token: depositToken(secret, lead.id, depositProduct.id) } : null };
  }
```

(d) Change the `submitLead` signature and first lines. Replace:
```ts
  async submitLead(slug: string, dto: SubmitStoreLeadDto) {
    const store = await findActiveStoreBySlug(this.prisma, slug);
```
with:
```ts
  async submitLead(slug: string, dto: SubmitStoreLeadDto, ip = "") {
    const store = await findActiveStoreBySlug(this.prisma, slug);
    if (dto.toolId !== undefined) return this.submitToolRequest(store, dto, ip);
```

- [ ] **Step 6: The controller.** In `stores-public.controller.ts`:
- Add `Req` to the `@nestjs/common` import and `import type { Request } from "express";`.
- Replace:
```ts
  submitLead(@Param("slug") slug: string, @Body() dto: SubmitStoreLeadDto) {
    return this.storeCheckout.submitLead(slug, dto);
  }
```
with:
```ts
  submitLead(@Param("slug") slug: string, @Body() dto: SubmitStoreLeadDto, @Req() req: Request) {
    // The address only feeds a salted hash for the tool-request throttle (spec 2026-10-14); it is never stored.
    return this.storeCheckout.submitLead(slug, dto, req.ip ?? "");
  }

  @Get(":slug/tools/:toolId/form-token")
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  toolFormToken(@Param("slug") slug: string, @Param("toolId") toolId: string) {
    return this.storeCheckout.toolFormToken(slug, toolId);
  }
```

- [ ] **Step 7: Run it and the existing lead tests, and see them pass.**
  - Run: `cd apps/api && npx jest src/stores/tool-leads.spec.ts src/stores/store-contact-lead.spec.ts src/stores/stores.service.spec.ts --maxWorkers=2`
  - Expected: PASS. A lead without `toolId` takes the old path unchanged.

- [ ] **Step 8: Commit.**

```bash
git add apps/api/src/stores/dto/submit-store-lead.dto.ts apps/api/src/stores/store-checkout.service.ts apps/api/src/stores/stores-public.controller.ts apps/api/src/stores/tool-leads.spec.ts
git commit -m "feat(tools): request forms at the leads endpoint — validated answers, honeypot, fill time, visitor throttle, deposit offer

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: The deposit checkout links the request to its order

**Existing code:**
- `createCartCheckout`'s transaction creates the order with `const order = await tx.storeOrder.create({ … });`.
- It then creates the shipment and returns `return { intent: created, orderId: order.id };`.
- The intent metadata object begins `metadata: { cart: cartLines, storeId: store.id, …`.

**Files:**
- Modify: `apps/api/src/payment-links/dto/cart-checkout.dto.ts` (`LeadDepositDto`; `CartCheckoutDto.leadDeposit`)
- Modify: `apps/api/src/stores/store-checkout.service.ts` (verify before the transaction; metadata; link inside it)
- Create (test): `apps/api/src/stores/tool-deposit.spec.ts`

**Interfaces:**
- Consumes: `checkDepositToken` (Task 8).
- Produces:
  - `export class LeadDepositDto { leadId: string; token: string }`.
  - `CartCheckoutDto.leadDeposit?: LeadDepositDto`.
  - Intent metadata `leadDeposit: { leadId }`.
  - `StoreLead.depositOrderId` set to the order.

- [ ] **Step 1: Live-stack check.** Run the command from Global Constraints and continue only on `[0,0]`.

- [ ] **Step 2: Write the failing test.** Create `apps/api/src/stores/tool-deposit.spec.ts`:

```ts
import { MerchantStatus, StoreStatus } from '@prisma/client';
import { makeStoreServices } from './testing-stores-services';
import { depositToken } from './tool-form-guard';

/** Business tools part a.4 (spec 2026-10-14): a request's deposit is paid through the normal checkout and links to the lead. */
const SECRET = 'test-secret';
const STORE = { id: 'store_1', merchantId: 'm_1', slug: 'brujula', name: 'Brújula', status: StoreStatus.ACTIVE, sourcePublicationPaused: false, publicVisibility: true, checkoutMode: 'payment', bundlesEnabled: false, locations: [] };
const DEPOSIT = { id: 'deposit_1', name: 'Anticipo de diagnóstico', amount: 15000, currency: 'BOB', status: 'ACTIVE', fulfillmentType: 'PHYSICAL', stock: null, variants: [], extras: [], discountPercent: null, discountStartsAt: null, discountEndsAt: null };
function setup(links: any[] = [DEPOSIT]) {
  const prisma: any = {
    store: { findUnique: jest.fn().mockResolvedValue(STORE) },
    merchant: { findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'm_1', status: MerchantStatus.ACTIVE }) },
    // Like Prisma: only the products the cart names (where.id.in), so a missing one is noticed.
    paymentLink: { findMany: jest.fn(async ({ where }: any) => links.filter(link => where.id.in.includes(link.id))) },
    storeOrder: { create: jest.fn().mockResolvedValue({ id: 'order_9' }) },
    storeLead: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation((fn: any) => fn(prisma));
  const create = jest.fn().mockResolvedValue({ id: 'pi_1', clientSecret: 'secret' });
  const service = makeStoreServices(prisma, { create, createInTransaction: jest.fn((_tx: unknown, ...args: unknown[]) => create(...args)) }, { deleteFiles: jest.fn() }, undefined, undefined, { get: (key: string) => (key === 'app.orderTrackingSecret' ? SECRET : undefined) });
  return { prisma, create, service };
}

describe('the deposit checkout (spec 2026-10-14, part a.4)', () => {
  it('links the lead to the deposit order and notes it on the payment', async () => {
    const { service, prisma, create } = setup();
    await service.createCartCheckout('brujula', { items: [{ paymentLinkId: 'deposit_1', quantity: 1 }], leadDeposit: { leadId: 'lead_1', token: depositToken(SECRET, 'lead_1', 'deposit_1') } } as never);
    expect(create.mock.calls[0][2].metadata.leadDeposit).toEqual({ leadId: 'lead_1' });
    expect(prisma.storeLead.updateMany).toHaveBeenCalledWith({ where: { id: 'lead_1', storeId: 'store_1' }, data: { depositOrderId: 'order_9' } });
  });

  it('a token for another product is refused, and nothing is created', async () => {
    const other = { ...DEPOSIT, id: 'curso', name: 'Curso', amount: 90000 };
    const { service, prisma, create } = setup([other]);
    await expect(service.createCartCheckout('brujula', { items: [{ paymentLinkId: 'curso', quantity: 1 }], leadDeposit: { leadId: 'lead_1', token: depositToken(SECRET, 'lead_1', 'deposit_1') } } as never))
      .rejects.toThrow('El anticipo ya no corresponde a tu solicitud.');
    expect(create).not.toHaveBeenCalled();
    expect(prisma.storeLead.updateMany).not.toHaveBeenCalled();
  });

  it('a forged token is refused', async () => {
    const { service, create } = setup();
    await expect(service.createCartCheckout('brujula', { items: [{ paymentLinkId: 'deposit_1', quantity: 1 }], leadDeposit: { leadId: 'lead_1', token: 'A'.repeat(43) } } as never))
      .rejects.toThrow('El anticipo ya no corresponde a tu solicitud.');
    expect(create).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run it and see it fail.**
  - Run: `cd apps/api && npx jest src/stores/tool-deposit.spec.ts`
  - Expected: FAIL. `metadata.leadDeposit` is `undefined`; the forged and wrong-product cases resolve.

- [ ] **Step 4: The DTO.** In `cart-checkout.dto.ts`, before `export class CartCheckoutDto`, add:
```ts
/** The deposit of a request form (spec 2026-10-14, part a.4): which lead it pays, signed by the server when the lead was saved. */
export class LeadDepositDto {
  @ApiProperty() @IsString() @Matches(/^[a-z0-9_]{6,40}$/) leadId!: string;
  @ApiProperty() @IsString() @Matches(/^[A-Za-z0-9_-]{43}$/) token!: string;
}
```
Inside `CartCheckoutDto`, after `partnerCode?: string;`, add:
```ts

  @ApiProperty({ required: false, type: () => LeadDepositDto })
  @IsOptional() @ValidateNested() @Type(() => LeadDepositDto)
  leadDeposit?: LeadDepositDto;
```

- [ ] **Step 5: Verify and link.** In `createCartCheckout`:

(a) Import `checkDepositToken` from `./tool-form-guard` (extend the Task 9 import).

(b) Right before `// Snapshot the server-owned rate on the order; later edits cannot change it.`, add:
```ts
    // A request's deposit (spec 2026-10-14): the token was signed for one lead and one product; this cart must carry that product.
    const leadDeposit = dto.leadDeposit
      ? cartLines.some(line => checkDepositToken(this.formSecret(), dto.leadDeposit!.token, dto.leadDeposit!.leadId, line.paymentLinkId)) ? { leadId: dto.leadDeposit.leadId } : null
      : null;
    if (dto.leadDeposit && !leadDeposit) throw new BadRequestException("El anticipo ya no corresponde a tu solicitud.");
```

(c) In the intent metadata, after `storeId: store.id,`, add:
```ts
          ...(leadDeposit ? { leadDeposit } : {}),
```

(d) After the `const order = await tx.storeOrder.create({ … });` statement, add:
```ts
      // The latest deposit attempt is the lead's order; an abandoned earlier attempt is simply replaced.
      if (leadDeposit) await tx.storeLead.updateMany({ where: { id: leadDeposit.leadId, storeId: store.id }, data: { depositOrderId: order.id } });
```

- [ ] **Step 6: Run the deposit, lead and checkout specs, and see them pass.**
  - Run: `cd apps/api && npx jest src/stores/tool-deposit.spec.ts src/stores/tool-leads.spec.ts src/stores/tool-checkout.spec.ts src/stores/stores.service.spec.ts --maxWorkers=2`
  - Expected: PASS.

- [ ] **Step 7: Commit.**

```bash
git add apps/api/src/payment-links/dto/cart-checkout.dto.ts apps/api/src/stores/store-checkout.service.ts apps/api/src/stores/tool-deposit.spec.ts
git commit -m "feat(tools): a request's deposit is paid through checkout and linked to its lead

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## After this plan

- **Owner step:** `cd apps/api && npx prisma migrate deploy` applies `20261015120000_business_tool_pricing`. Until then, every write that names a new column fails on the dev DB:
  - a lead with `toolId`;
  - a product with `unit` (only plan c writes these).

  Ordinary carts and leads are unaffected.
- Plan b (`2026-10-15-business-tools-b-renderers.md`) provides `REQUEST_TOOLS` and draws the four tools.
