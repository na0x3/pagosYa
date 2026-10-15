# Business Tools (b): The Tool Record and the Kit's Four Renderers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A store can carry up to 4 business tools as data (`StoreTool` rows). The storefront kit draws them with four tested renderers: quantity calculator, subscription sign-up, builder and request form. Each is mounted by `<div data-pagosya-tool="<id>">`, styled by the store's look and controls, and totalled by the server's price quote. Unit, builder and deposit lines then flow through the kit cart, the hosted (published) checkout bridge and the server checkout from plan a.

**Architecture:**
- **Server side.**
  - `apps/api/src/store-tools/store-tool.ts` defines `StoreToolDefinition` and its sanitizer.
  - `StoreToolsService` reads the rows, enforces the cap of 4, and implements plan a's `RequestToolSource`.
  - The public store payload carries `tools`: approved ones only, or approved and draft for the owner's Studio catalog. The owner's catalog also carries each product's pending `proposal`, so a draft previews its numbers.
  - Generation saves copy the tools into `config.tools`.
- **Kit side.** After the split plan, `kit/commerce.js` is generated from parts in `packages/storefront-kit/commerce-src/`, all sharing one IIFE scope (`tools/build-commerce.mjs`). The business tools are new parts in `commerce-src/business-tools/`, one file per concern:
  - `selling.js` mirrors the server's selling rules for instant estimates;
  - `shared.js` holds the panel, the stylesheet and the quote loop;
  - one file per renderer: `calculator.js`, `subscribe.js`, `builder.js`, `request.js`;
  - `mount.js` mounts `[data-pagosya-tool]` and builds each renderer's context.

  Existing parts gain the unit, builder and deposit cart lines. No new runtime file is shipped, so published runtime bundles keep their shape.
- `apps/checkout` (the published store's trusted parent) passes builder choices, deposits, quotes, form tokens and request answers across the sandbox boundary.

**Tech Stack:**
- API: NestJS, TypeScript, Prisma (one migration), Jest.
- Kit: plain browser JS (ES2020 floor) in commerce-src parts, with jsdom and Playwright Chromium specs in `apps/api`, and `node --test` for the build.
- apps/checkout: Vitest. apps/merchant-studio: Vitest.

**Spec:** docs/superpowers/specs/2026-10-14-business-tools-design.md (part b). It depends on `2026-10-15-business-tools-a-primitives.md`. Plan c (`2026-10-15-business-tools-c-authoring.md`) builds on this one.

## Global Constraints

- **Order of plans.** This plan runs after:
  - plan a;
  - the store controls plan;
  - the store voice plan;
  - the big-file split plan (`2026-10-15-split-big-files.md`, commits from `5ac50e44` on).
- **Shared values (spec 2026-10-14; the same in plans a, b and c).**
  - Unit label 1–12 characters. `step`, `min` and `max` are positive with at most 3 decimals; `min` and `max` are multiples of `step`; `max / step ≤ 999` (plan a `readSellingUnit`).
  - Money is whole cents. One step costs `Math.round(unitAmount × stepMilli / 1000)` cents, and a line costs step price × steps (plan a).
  - Tiers strictly decrease, and the first starts at `unit.min` at the product's own price (plan a `readVolumeTiers`).
  - Discount order: tier → time-windowed sale → Subscribe & Save cadence (the first order pays the lower of the two) → promo or bundle, best single offer.
  - Option text at most 140 characters. Option deltas ≥ 0 and at most 3 × the base price (plan c checks).
  - Request forms: at most 12 fields, answers at most 400 characters, fill time at least 3 s, at most 3 requests per 10 minutes per visitor (plan a).
  - At most 4 tools per store that are not hidden (this plan); 0–2 tools per build, each proposed discount at most 30 %, a deposit at most 50 % of the cheapest related product unless the merchant set it (plan c).
  - Nothing ever promises an automatic charge: renewals are paid through the link sent before each delivery.
- **Anchors.** Every anchor is a quoted line inside a named part or module: a commerce-src part, `source-save-assembly.ts`, or `generate()`. When a quote and a line number disagree, trust the quote. If a quoted line cannot be found because the controls or voice plan edited it, apply the same change to the line that now plays that role, and say so in the task notes.
- **commerce.js is generated.** Never edit `packages/storefront-kit/kit/commerce.js` by hand.
  - Edit the part, then run `node packages/storefront-kit/tools/build-commerce.mjs`.
  - Verify with `node --test packages/storefront-kit/tools/build-commerce.test.mjs`, which checks equality, that every part is listed once, and that the build parses.
  - A new part is added to `PARTS` in `tools/build-commerce.mjs` where its code must run.
  - Stage the parts, `kit/commerce.js`, and `build-commerce.mjs` whenever `PARTS` changes.
- **Tool record.** A `StoreToolDefinition` is the spec's type plus an optional `placement`.
  - `id` matches `TOOL_ID_PATTERN` (`^tl[a-f0-9]{18}$`, plan a) and equals the row id.
  - `kind` is `calculator | subscribe | builder | request`, and exactly that kind's block is kept.
  - `title` is 1–80 characters and `intro` at most 240.
  - `words.cta` is 1–32 characters; `words.total`, `words.saving` and `words.done` are at most 60 each.
  - `layout` is `inline | card | split | steps`. `placement` matches `^[a-z][a-z0-9-]{0,47}$`.
  - **calculator:** `presets` are 0–6 distinct positive unit amounts, and `showTiers` is a boolean.
  - **subscribe:** `cadences` are 1–3 distinct values from `weekly | biweekly | monthly`. `defaultUnits` is optional and positive.
  - **builder:** `steps` are 1–8 distinct option-group ids, and `summary` is a boolean.
  - **request:** `fields` come from `readRequestFields`: 1–12 fields, text answers at most 400 characters. `deposit` is an optional product id, and `reply` is 1–240 characters.
  - All text is trimmed and safe (`SAFE_TEXT_PATTERN`, no `<` or `>`). Anything else drops the whole definition.
- **Status.**
  - `draft` renders only in previews (Studio, «Ver en navegador»), with the merchant-only banner «Números por aprobar · solo tú ves esta herramienta». Its add or pay button is disabled with «Disponible al aprobar», so no tool takes a payment before approval.
  - `approved` renders on the live store.
  - `hidden` renders nothing.
  - At most 4 tools per store that are not hidden (`MAX_STORE_TOOLS = 4`, checked under a row lock on `Store`).
- **Where a live store reads its tools.** The live and hosted store reads `store.tools` from the public store payload, which holds approved definitions only. An approval or a hide therefore reaches the live store at once, with no new revision. `config.tools` is a copy for exports and older payloads; the kit uses it only when the payload has no `tools`.
- **A tool hides itself, together with the `[data-pagosya-tool-section]` around it, when:**
  - its product is missing, unpublished, a membership or sold out (`limit(p) === 0`);
  - a calculator's product is not sold by unit (for example, it gained variants);
  - a subscribe tool's cadences are not offered, or subscriptions are off (drafts excepted);
  - a builder's steps are not all among the product's option groups;
  - the store does not charge with pagosYa (selling kinds only).

  A request tool always renders. Its deposit is offered only when the server returns one.
- **Totals.**
  - The tool shows a local estimate from `business-tools/selling.js` at once, then replaces it with `POST /price-quote` after a 200 ms pause.
  - A newer change cancels an older quote.
  - A failed quote disables the add button and announces «No pudimos confirmar el precio. Revisa tu conexión y vuelve a intentarlo.».
  - Previews and demo stores never call the API and keep the estimate.
  - `selling.js` is pinned to the server's `priceSellingLine` by `kit-selling-parity.spec.ts`.
- **Cart.**
  - A unit line's quantity counts steps. It counts as one item in the header badge and shows «20 L».
  - Its − button removes one step and the line at `unit.minSteps`.
  - The calculator *sets* the line to the chosen amount rather than adding to it.
  - The kit's per-line cap for a unit product is `min(maxSteps, stock, purchaseLimit)`, not 99.
  - Builder lines carry `options`. Deposit lines carry `leadDeposit`, which checkout hoists to the request's top level.
- **Styling.**
  - Panels use the look tokens (`--lk-rc`, `--lk-ink`, `--lk-paper`, `data-look-edge`) with kit fallbacks.
  - Buttons carry `checkout-button`, so the DNA and look button rules apply.
  - Steppers are `<div class="quantity">`, so the store controls plan's `decorateControls` draws them in the store's control language.
  - Every rule keys on `[data-pagosya-tool]`, so a page without a tool is unchanged.
- **Accessibility.**
  - Every input has a `<label>`, and every group a `<legend>` or `aria-label`.
  - Hit targets are at least 44 px. Everything works by keyboard.
  - Errors go to a `role="alert"` paragraph, with `aria-invalid` on the field.
  - Status text goes to `role="status"`.
  - No horizontal scroll at 390 px or 1440 px.
- **Kit browser floor.** No ES2022+ built-ins (`.at()`, `Object.hasOwn`, `structuredClone`, `findLast`, `toSorted`, `AbortSignal.timeout/any`). `source-kit-browser-floor.spec.ts` already covers `commerce.js`, the built file.
- **Kit edits are live at once.**
  - `currentSourceRuntime` reads the current `kit/commerce.js` for every preview and publication. A store without tools, units or builder products must render exactly as before.
  - The Studio embeds `commerce.js` through a `?raw` import into a **pre-built** bundle. Task 10 rebuilds it once (`pnpm run build:studio`), as the split plan's Task 9 does.
- **Trust boundary.** The sandboxed store frame never supplies personal fields:
  - Name, email and phone of a hosted request are collected by pagosYa's trusted dialog.
  - Phone-type tool fields are not drawn in hosted mode; plan a fills them from the trusted phone.
  - The parent re-validates choices, deposits and answers by shape and passes nothing else.
- **Database.**
  - Task 1 adds exactly one migration, `20261015130000_store_tools`. Applying it is the **owner's step**: `cd apps/api && npx prisma migrate deploy`.
  - Never run `prisma migrate dev`, `db push`, `migrate reset`, `migrate diff` or `migrate deploy`.
  - Task 1 runs `npx prisma generate` once. The generated client is shared with the owner's running API.
- **Live-stack check (run before any edit under `apps/api/src`).** Editing `apps/api/src` restarts the owner's API and kills running YAPI builds. Continue only when this prints `[0,0]`:
  ```bash
  cd apps/api && node -e "const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();Promise.all([p.storeSourceChatJob.count({where:{status:'RUNNING'}}),p.storeSourceGeneration.count({where:{status:{in:['RUNNING','REVIEWING']},heartbeatAt:{gt:new Date(Date.now()-5*60e3)}}})]).then(r=>console.log(JSON.stringify(r))).finally(()=>p.\$disconnect())"
  ```
- **Tests.**
  - Run API tests one file at a time, or with `--maxWorkers=2`. **Never run the full api jest suite with default workers.**
  - Kit browser tests are Jest + Playwright Chromium specs in `apps/api` (`page.setContent`), not the merchant-studio Playwright suite.
- **Git.**
  - Commit on `feature/store-page-architecture` and never push.
  - Stage only the listed files.
  - Never stage or edit `apps/api/src/store-emails/*`.
  - Trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Language.** Merchant- and buyer-facing text is Spanish.
- **Out of scope.**
  - YAPI-written markup around a tool (a later round).
  - Next/TSX stores.
  - Tools in the checkout app's own template storefront. A unit or builder line there is refused by the server (plan a), never mispriced.
  - Saved-card auto-charge. The subscribe tool says «Te enviamos el link de pago antes de cada entrega» and never promises an automatic charge.

## Review Focus

1. **A draft leaking onto the live store.**
   - Live and hosted stores read `store.tools`, which holds approved definitions only. Even a `config.tools` copy with a draft renders nothing outside a preview.
   - In a preview, the draft's add button is disabled.
   - Pinned in Task 6 («a draft renders only in preview, with the banner and no add»; «never a draft from config.tools on the live store») and Task 2 (`tools` holds only approved definitions on the public payload, and `proposal` only for the owner).
2. **The kit's instant estimate disagreeing with the charge.**
   - Float units, tier boundaries, sale + cadence and option deltas must round to the same cent as the server.
   - Pinned in Task 4 (`kit-selling-parity.spec.ts`: 14,5 L vs 15 L, 3 × 0,3 kg, a stale tier, sale + cadence and a cake with three options all equal `priceSellingLine`). Task 6 pins that the server's quote replaces the estimate.
3. **A unit line breaking the cart's counting.**
   - 40 steps must not show «40» in the badge, cap at 99 or lose 0,5 L per tap.
   - Pinned in Task 5 («20 L counts as one item, shows 20 L…», «steps by 0,5 L and leaves at the minimum», «the cap is max/step, not 99»).
4. **An approved tool whose product gets variants, sells out or is archived.**
   - The tool hides itself and never adds a step count as pieces.
   - Pinned in Task 6 (the hide matrix, including «its product now with variants»).
5. **A request whose deposit product was deleted, and the hosted bridge.**
   - With no deposit returned, the form shows the reply and offers no payment.
   - In hosted mode, the parent passes `toolId`, `fields`, `website`, `formToken` and `leadDeposit` and nothing personal from the frame. Quotes are never refused as «Ya hay una solicitud en curso».
   - Pinned in Task 9 (renderer, jsdom, and the checkout bridge test) and Task 6 (parallel quotes).

## File Structure

| File | Responsibility |
|---|---|
| `apps/api/prisma/migrations/20261015130000_store_tools/migration.sql` (new), `schema.prisma` | `StoreTool` table with kind and status CHECKs |
| `apps/api/src/store-tools/store-tool.ts` (new) | Types, constants, `sanitizeToolDefinition`, `newToolId`, `toolProductIds`, `storeToolsForCatalog` |
| `apps/api/src/store-tools/store-tools.service.ts` (new) | `StoreToolsService`: `approvedRequestTool`, `configTools`, `createInTransaction` |
| `apps/api/src/stores/stores.module.ts` | Provides `StoreToolsService` and `REQUEST_TOOLS` |
| `apps/api/src/stores/public-stores.service.ts` | `tools` on the payload; owner-only `proposal` on items |
| `apps/api/src/storefront-source/source-store-config.ts` | Saved catalog data never carries a proposal |
| `apps/api/src/storefront-source/source-save-assembly.ts` | `config.tools` on every generation save (`SaveAssemblyContext.tools`) |
| `apps/api/src/storefront-source/source-generation.service.ts` | `catalog()` carries tools; `generate()` passes the store's tools to the save |
| `packages/storefront-kit/commerce-src/business-tools/selling.js` (new part) | Estimator mirroring `priceSellingLine` (`SELLING`) |
| `packages/storefront-kit/commerce-src/business-tools/shared.js` (new part) | `TOOL_RENDERERS`, panel, stylesheet, quote loop |
| `packages/storefront-kit/commerce-src/business-tools/calculator.js`, `subscribe.js`, `builder.js`, `request.js` (new parts) | The four renderers |
| `packages/storefront-kit/commerce-src/business-tools/mount.js` (new part) | Definitions, hiding, context, `mountTools`, `mountInlineTool` |
| `packages/storefront-kit/commerce-src/shared/state.js`, `cart/lines.js`, `cart/render.js`, `templates/kit-templates.js`, `shared/click-actions.js`, `checkout/submit.js`, `catalog/render.js`, `catalog/cards.js`, `product/bundles-related.js`, `product/page.js` | Unit, builder and deposit lines; mount call; cards and product page |
| `packages/storefront-kit/tools/build-commerce.mjs` | `PARTS` gains the business-tools parts |
| `packages/storefront-kit/kit/commerce.js` | Rebuilt from the parts |
| `apps/checkout/src/source-storefront.ts`, `apps/checkout/src/trusted-form.ts` | Hosted cart and request bridge for tools |
| `apps/merchant-studio/src/source-checks.ts` | The publish probe never picks a tool product as its simple product |
| `apps/api/src/store-tools/kit-runtime.testing.ts` (new) | jsdom kit harness shared by the kit specs |
| `apps/api/src/storefront-source/generation-harness.testing.ts` (new) | Generation harness shared with plan c |
| Specs (new): `store-tools-schema.spec.ts`, `store-tool.spec.ts`, `store-tools.service.spec.ts`, `source-generation-tools-config.spec.ts`, `kit-selling-parity.spec.ts`, `kit-tool-cart.spec.ts`, `kit-tools-mount.spec.ts`, `kit-tool-subscribe.spec.ts`, `kit-tool-builder.spec.ts`, `kit-tool-request.spec.ts`, `kit-tool-pages.spec.ts`, `store-tools-browser.spec.ts` (api); `test/source-storefront-tools.test.ts` (checkout); `src/source-checks-tools.test.ts` (studio) | |
| Specs (modified): `stores.service.spec.ts`, `public-stores.service.spec.ts`, `public-visibility.spec.ts` | Fake Prisma gains `storeTool` |

---


### Task 1: The `StoreTool` table and the definition sanitizer

**Files:**
- Create: `apps/api/prisma/migrations/20261015130000_store_tools/migration.sql`
- Modify: `apps/api/prisma/schema.prisma`:
  - add `model StoreTool` after `model StoreLead { … }`;
  - add `tools StoreTool[]` to `model Store`, after `leads StoreLead[]`.
- Create: `apps/api/src/store-tools/store-tool.ts`
- Create (tests): `apps/api/src/store-tools/store-tools-schema.spec.ts`, `apps/api/src/store-tools/store-tool.spec.ts`

**Interfaces:**
- Consumes: `TOOL_ID_PATTERN`, `readRequestFields`, `RequestField` (plan a `request-fields.ts`); `OPTION_ID_PATTERN` (plan a `selling-rules.ts`).
- Produces:
  ```ts
  export const TOOL_KINDS: readonly ['calculator', 'subscribe', 'builder', 'request']; export type ToolKind;
  export const TOOL_STATUSES: readonly ['draft', 'approved', 'hidden']; export type ToolStatus;
  export const TOOL_LAYOUTS: readonly ['inline', 'card', 'split', 'steps']; export type ToolLayout;
  export const TOOL_CADENCES: readonly ['weekly', 'biweekly', 'monthly']; export type ToolCadence;
  export const MAX_STORE_TOOLS = 4; export const TOOL_PLACEMENT_PATTERN: RegExp;
  export type StoreToolDefinition = { id: string; kind: ToolKind; title: string; intro?: string; words: { cta: string; total?: string; saving?: string; done?: string }; layout: ToolLayout; placement?: string;
    calculator?: { productId: string; presets: number[]; showTiers: boolean }; subscribe?: { productId: string; cadences: ToolCadence[]; defaultUnits?: number };
    builder?: { productId: string; steps: string[]; summary: boolean }; request?: { fields: RequestField[]; deposit?: string; reply: string } };
  export type ConfigTool = StoreToolDefinition & { status: 'draft' | 'approved' };
  export function newToolId(): string;
  export function sanitizeToolDefinition(raw: unknown): StoreToolDefinition | null;
  export function toolProductIds(definition: StoreToolDefinition): string[];
  ```

- [ ] **Step 1: Live-stack check.** Run the command from Global Constraints and continue only on `[0,0]`.

- [ ] **Step 2: Write the failing tests.**

(a) Create `apps/api/src/store-tools/store-tools-schema.spec.ts`:
```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TOOL_KINDS, TOOL_STATUSES } from './store-tool';

/** Business tools part b (spec 2026-10-14): the StoreTool table. The CHECKs must list exactly what the code writes. */
const root = join(__dirname, '..', '..', 'prisma');
const sql = readFileSync(join(root, 'migrations', '20261015130000_store_tools', 'migration.sql'), 'utf8');
const schema = readFileSync(join(root, 'schema.prisma'), 'utf8');
const listed = (name: string) => [...sql.match(new RegExp(`"${name}" IN \\(([^)]*)\\)`))![1].matchAll(/'([a-z]+)'/g)].map(match => match[1]);

it('creates StoreTool with kind and status checks that match the code, cascading with its store', () => {
  expect(sql).toContain('CREATE TABLE "StoreTool"');
  expect(listed('kind')).toEqual([...TOOL_KINDS]);
  expect(listed('status')).toEqual([...TOOL_STATUSES]);
  expect(sql).toContain('"status" TEXT NOT NULL DEFAULT \'draft\'');
  expect(sql).toContain('CREATE INDEX "StoreTool_storeId_status_idx" ON "StoreTool"("storeId", "status");');
  expect(sql).toContain('REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE');
  const model = schema.match(/\nmodel StoreTool \{([\s\S]*?)\n\}/)![1];
  for (const field of [/\n\s+id\s+String\s+@id\n/, /\n\s+definition\s+Json\n/, /\n\s+approvedAt\s+DateTime\?/, /@@index\(\[storeId, status\]\)/]) expect(model).toMatch(field);
  expect(schema).toMatch(/\n\s+tools\s+StoreTool\[\]\n/);
});
```

(b) Create `apps/api/src/store-tools/store-tool.spec.ts`:
```ts
import { MAX_STORE_TOOLS, newToolId, sanitizeToolDefinition, toolProductIds, type StoreToolDefinition } from './store-tool';

/** Business tools part b (spec 2026-10-14): the tool definition sanitizer. */
const ID = 'tl0123456789abcdef01';
const CALC: StoreToolDefinition = { id: ID, kind: 'calculator', title: 'Calcula tu leche', intro: 'Pide por litro; desde 15 L baja el precio.', words: { cta: 'Añadir', total: 'Total', saving: 'ahorras' }, layout: 'card', placement: 'leche', calculator: { productId: 'leche', presets: [10, 20, 30], showTiers: true } };
const REQUEST: StoreToolDefinition = { id: 'tlaaaaaaaaaaaaaaaaaa', kind: 'request', title: 'Pide tu diagnóstico', words: { cta: 'Enviar solicitud' }, layout: 'steps', request: { fields: [{ id: 'empresa', label: 'Empresa', type: 'text', required: true }, { id: 'area', label: 'Área', type: 'choice', required: true, choices: ['Finanzas', 'Ventas'] }], deposit: 'deposit_1', reply: 'Te escribimos en un día hábil.' } };

describe('sanitizeToolDefinition (spec 2026-10-14, part b)', () => {
  it('keeps a valid definition and only its own kind block', () => {
    expect(sanitizeToolDefinition(CALC)).toEqual(CALC);
    expect(sanitizeToolDefinition({ ...CALC, builder: { productId: 'x', steps: ['a'], summary: true } })).toEqual(CALC);
    expect(sanitizeToolDefinition(REQUEST)).toEqual(REQUEST);
    expect(sanitizeToolDefinition({ id: 'tlbbbbbbbbbbbbbbbbbb', kind: 'subscribe', title: 'Leche cada semana', words: { cta: 'Suscribirme' }, layout: 'inline', subscribe: { productId: 'leche', cadences: ['weekly', 'monthly'], defaultUnits: 10 } }))
      .toEqual({ id: 'tlbbbbbbbbbbbbbbbbbb', kind: 'subscribe', title: 'Leche cada semana', words: { cta: 'Suscribirme' }, layout: 'inline', subscribe: { productId: 'leche', cadences: ['weekly', 'monthly'], defaultUnits: 10 } });
  });
  it.each([
    ['a bad id', { ...CALC, id: 'tool-1' }],
    ['an unknown kind', { ...CALC, kind: 'quiz' }],
    ['a missing block', { ...CALC, calculator: undefined }],
    ['markup in the title', { ...CALC, title: '<img src=x onerror=alert(1)>' }],
    ['a 33-character button', { ...CALC, words: { cta: 'x'.repeat(33) } }],
    ['an unknown layout', { ...CALC, layout: 'modal' }],
    ['a bad placement', { ...CALC, placement: '../index' }],
    ['seven presets', { ...CALC, calculator: { ...CALC.calculator!, presets: [1, 2, 3, 4, 5, 6, 7] } }],
    ['a negative preset', { ...CALC, calculator: { ...CALC.calculator!, presets: [-1] } }],
    ['a daily cadence', { ...CALC, kind: 'subscribe', calculator: undefined, subscribe: { productId: 'leche', cadences: ['daily'] } }],
    ['nine builder steps', { ...CALC, kind: 'builder', calculator: undefined, builder: { productId: 'torta', steps: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'], summary: true } }],
    ['thirteen request fields', { ...REQUEST, request: { ...REQUEST.request!, fields: Array.from({ length: 13 }, (_, i) => ({ id: `f${i}`, label: 'Campo', type: 'text', required: false })) } }],
    ['a reply over 240 characters', { ...REQUEST, request: { ...REQUEST.request!, reply: 'x'.repeat(241) } }],
  ])('drops %s', (_name, raw) => {
    expect(sanitizeToolDefinition(raw)).toBeNull();
  });
  it('makes ids the mount accepts and lists a tool\'s products', () => {
    expect(newToolId()).toMatch(/^tl[a-f0-9]{18}$/);
    expect(newToolId()).not.toBe(newToolId());
    expect(toolProductIds(CALC)).toEqual(['leche']);
    expect(toolProductIds(REQUEST)).toEqual(['deposit_1']);
    expect(MAX_STORE_TOOLS).toBe(4);
  });
});
```

- [ ] **Step 3: Run them and see them fail.**
  - Run: `cd apps/api && npx jest src/store-tools/store-tools-schema.spec.ts src/store-tools/store-tool.spec.ts --maxWorkers=2`
  - Expected: FAIL, `Cannot find module './store-tool'`.

- [ ] **Step 4: The migration.** Create `apps/api/prisma/migrations/20261015130000_store_tools/migration.sql`:
```sql
-- Business tools (spec 2026-10-14), part b: a selling tool YAPI designed for one store. definition is a sanitized
-- StoreToolDefinition (store-tools/store-tool.ts) whose id is the row id. draft renders only in previews until the
-- merchant approves its numbers; hidden renders nowhere. At most 4 tools per store that are not hidden (enforced in code).
CREATE TABLE "StoreTool" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "definition" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "approvedAt" TIMESTAMP(3),
  CONSTRAINT "StoreTool_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StoreTool_kind_check" CHECK ("kind" IN ('calculator', 'subscribe', 'builder', 'request')),
  CONSTRAINT "StoreTool_status_check" CHECK ("status" IN ('draft', 'approved', 'hidden'))
);
CREATE INDEX "StoreTool_storeId_status_idx" ON "StoreTool"("storeId", "status");
ALTER TABLE "StoreTool" ADD CONSTRAINT "StoreTool_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

- [ ] **Step 5: The schema.**
- In `model Store`, after `leads                        StoreLead[]`, add:
```prisma
  tools                        StoreTool[]
```
- After the closing `}` of `model StoreLead`, add:
```prisma

/// Business tools (spec 2026-10-14): a calculator, subscribe, builder or request tool YAPI designed for one store.
/// `definition` is a sanitized StoreToolDefinition (store-tools/store-tool.ts) whose id is this row's id. draft renders only
/// in previews until the merchant approves its numbers; hidden renders nowhere. At most 4 not hidden per store (code).
model StoreTool {
  id         String    @id
  storeId    String
  store      Store     @relation(fields: [storeId], references: [id], onDelete: Cascade)
  kind       String
  status     String    @default("draft")
  definition Json
  createdAt  DateTime  @default(now())
  updatedAt  DateTime  @updatedAt
  approvedAt DateTime?

  @@index([storeId, status])
}
```
- Run: `cd apps/api && npx prisma validate && npx prisma generate`. Expected: valid, then `Generated Prisma Client`. Do not run any `migrate` command.

- [ ] **Step 6: The sanitizer.** Create `apps/api/src/store-tools/store-tool.ts`:
```ts
/**
 * Business tools, part b (spec 2026-10-14): a tool is data, drawn by the kit's tested renderers (commerce-src/business-tools/). This file
 * is the one place a definition is checked:
 * - YAPI's answer (plan c);
 * - StoreTool rows;
 * - config.tools;
 * - the public payload.
 * Anything outside the limits drops the whole definition, never a field.
 */
import { randomBytes } from 'node:crypto';
import { SAFE_TEXT_PATTERN } from '../common/validation/safe-text.decorator';
import { readRequestFields, TOOL_ID_PATTERN, type RequestField } from '../stores/request-fields';
import { OPTION_ID_PATTERN } from '../stores/selling-rules';

export const TOOL_KINDS = ['calculator', 'subscribe', 'builder', 'request'] as const;
export type ToolKind = typeof TOOL_KINDS[number];
export const TOOL_STATUSES = ['draft', 'approved', 'hidden'] as const;
export type ToolStatus = typeof TOOL_STATUSES[number];
export const TOOL_LAYOUTS = ['inline', 'card', 'split', 'steps'] as const;
export type ToolLayout = typeof TOOL_LAYOUTS[number];
export const TOOL_CADENCES = ['weekly', 'biweekly', 'monthly'] as const;
export type ToolCadence = typeof TOOL_CADENCES[number];
export const MAX_STORE_TOOLS = 4;
export const TOOL_PLACEMENT_PATTERN = /^[a-z][a-z0-9-]{0,47}$/;
const PRODUCT_ID = /^[A-Za-z0-9_-]{1,40}$/;

export type StoreToolDefinition = {
  id: string; kind: ToolKind; title: string; intro?: string;
  words: { cta: string; total?: string; saving?: string; done?: string };
  layout: ToolLayout;
  /** The section id the mount follows (plan c places it). */
  placement?: string;
  calculator?: { productId: string; presets: number[]; showTiers: boolean };
  subscribe?: { productId: string; cadences: ToolCadence[]; defaultUnits?: number };
  builder?: { productId: string; steps: string[]; summary: boolean };
  request?: { fields: RequestField[]; deposit?: string; reply: string };
};
export type ConfigTool = StoreToolDefinition & { status: 'draft' | 'approved' };

export function newToolId(): string { return `tl${randomBytes(9).toString('hex')}`; }

const record = (value: unknown): value is Record<string, any> => !!value && typeof value === 'object' && !Array.isArray(value);
function text(value: unknown, max: number, min = 1): string | null | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') return null;
  const clean = value.trim();
  return clean.length >= min && clean.length <= max && SAFE_TEXT_PATTERN.test(clean) && !/[<>]/.test(clean) ? clean : null;
}
const positive = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 10_000;
const productId = (value: unknown): string | null => typeof value === 'string' && PRODUCT_ID.test(value) ? value : null;

export function sanitizeToolDefinition(raw: unknown): StoreToolDefinition | null {
  if (!record(raw) || typeof raw.id !== 'string' || !TOOL_ID_PATTERN.test(raw.id) || !(TOOL_KINDS as readonly unknown[]).includes(raw.kind)) return null;
  const title = text(raw.title, 80), intro = text(raw.intro, 240);
  if (!title || intro === null || !record(raw.words)) return null;
  const words = { cta: text(raw.words.cta, 32), total: text(raw.words.total, 60), saving: text(raw.words.saving, 60), done: text(raw.words.done, 60) };
  if (!words.cta || words.total === null || words.saving === null || words.done === null) return null;
  if (!(TOOL_LAYOUTS as readonly unknown[]).includes(raw.layout)) return null;
  if (raw.placement !== undefined && (typeof raw.placement !== 'string' || !TOOL_PLACEMENT_PATTERN.test(raw.placement))) return null;
  const base: StoreToolDefinition = {
    id: raw.id, kind: raw.kind, title, ...(intro ? { intro } : {}),
    words: { cta: words.cta, ...(words.total ? { total: words.total } : {}), ...(words.saving ? { saving: words.saving } : {}), ...(words.done ? { done: words.done } : {}) },
    layout: raw.layout, ...(raw.placement ? { placement: raw.placement } : {}),
  };
  const block = raw[raw.kind];
  if (!record(block)) return null;
  if (raw.kind === 'calculator') {
    const id = productId(block.productId);
    const presets = block.presets ?? [];
    if (!id || !Array.isArray(presets) || presets.length > 6 || !presets.every(positive) || new Set(presets).size !== presets.length || typeof block.showTiers !== 'boolean') return null;
    return { ...base, calculator: { productId: id, presets: [...presets], showTiers: block.showTiers } };
  }
  if (raw.kind === 'subscribe') {
    const id = productId(block.productId);
    const cadences = block.cadences;
    if (!id || !Array.isArray(cadences) || !cadences.length || cadences.length > 3 || new Set(cadences).size !== cadences.length || !cadences.every(cadence => (TOOL_CADENCES as readonly unknown[]).includes(cadence))) return null;
    if (block.defaultUnits !== undefined && !positive(block.defaultUnits)) return null;
    return { ...base, subscribe: { productId: id, cadences: [...cadences], ...(block.defaultUnits !== undefined ? { defaultUnits: block.defaultUnits } : {}) } };
  }
  if (raw.kind === 'builder') {
    const id = productId(block.productId);
    const steps = block.steps;
    if (!id || !Array.isArray(steps) || !steps.length || steps.length > 8 || new Set(steps).size !== steps.length || !steps.every(step => typeof step === 'string' && OPTION_ID_PATTERN.test(step)) || typeof block.summary !== 'boolean') return null;
    return { ...base, builder: { productId: id, steps: [...steps], summary: block.summary } };
  }
  const fields = readRequestFields(block.fields);
  const reply = text(block.reply, 240);
  const deposit = block.deposit === undefined ? undefined : productId(block.deposit);
  if (!fields.length || !reply || deposit === null) return null;
  return { ...base, request: { fields, ...(deposit ? { deposit } : {}), reply } };
}

export function toolProductIds(definition: StoreToolDefinition): string[] {
  const id = definition.calculator?.productId ?? definition.subscribe?.productId ?? definition.builder?.productId ?? definition.request?.deposit;
  return id ? [id] : [];
}
```

- [ ] **Step 7: Run them and see them pass.**
  - Run: `cd apps/api && npx jest src/store-tools/store-tools-schema.spec.ts src/store-tools/store-tool.spec.ts --maxWorkers=2`
  - Expected: PASS.

- [ ] **Step 8: Commit.**
```bash
git add apps/api/prisma/migrations/20261015130000_store_tools/migration.sql apps/api/prisma/schema.prisma apps/api/src/store-tools/store-tool.ts apps/api/src/store-tools/store-tools-schema.spec.ts apps/api/src/store-tools/store-tool.spec.ts
git commit -m "feat(tools): StoreTool table and the tool definition sanitizer

Owner step: cd apps/api && npx prisma migrate deploy

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `StoreToolsService`, the leads hook, and tools on the store payload

**Existing code:**
- `stores.module.ts`: `providers: [StoresService, PublicStoresService, StoreCheckoutService], exports: [StoresService, PublicStoresService, StoreCheckoutService]`.
- `getStorePublic` (`public-stores.service.ts`):
  - It fetches in `const [items, categories, links, productStats, appointmentOfferings, collections, look, paidOrders] = await Promise.all([`.
  - It returns `return { storeId: store.id, …, items: items.map((item) => ({ … ...sellingRulesPublic(item), … })) }`. The `sellingRulesPublic` spread is from plan a Task 5.
- `stores.service.spec.ts` `makeFakePrisma()` has no `storeTool` delegate.

**Files:**
- Create: `apps/api/src/store-tools/store-tools.service.ts`
- Modify: `apps/api/src/store-tools/store-tool.ts` (append `storeToolsForCatalog`)
- Modify: `apps/api/src/stores/stores.module.ts`
- Modify: `apps/api/src/stores/public-stores.service.ts`
- Modify (test): `apps/api/src/stores/stores.service.spec.ts` (`makeFakePrisma` gains `storeTool`; one describe appended)
- Modify (test): `apps/api/src/stores/public-stores.service.spec.ts` and `apps/api/src/stores/public-visibility.spec.ts` (their fake Prisma gains `storeTool`; `getStorePublic` now reads it)
- Create (test): `apps/api/src/store-tools/store-tools.service.spec.ts`

**Interfaces:**
- Consumes: `RequestToolSource`, `ApprovedRequestTool` and `REQUEST_TOOLS` (plan a); `readPricingProposal` (plan a).
- Produces:
  ```ts
  export async function storeToolsForCatalog(prisma: { storeTool: { findMany: (args: any) => Promise<Array<{ id: string; kind: string; status: string; definition: unknown }>> } }, storeId: string, owner: boolean): Promise<ConfigTool[]>;
  @Injectable() export class StoreToolsService implements RequestToolSource {
    approvedRequestTool(storeId: string, toolId: string): Promise<ApprovedRequestTool | null>;
    configTools(storeId: string): Promise<ConfigTool[]>;
    createInTransaction(tx: Prisma.TransactionClient, storeId: string, definition: StoreToolDefinition): Promise<void>; // throws ConflictException over the cap
  }
  ```
  - The public payload gains `tools: ConfigTool[]`. Public callers get approved tools only; the owner gets approved and draft.
  - Owner items gain `proposal: PricingProposal | null`.

- [ ] **Step 1: Live-stack check.** Run the command from Global Constraints and continue only on `[0,0]`.

- [ ] **Step 2: Write the failing tests.**

(a) Create `apps/api/src/store-tools/store-tools.service.spec.ts`:
```ts
import { ConflictException } from '@nestjs/common';
import { REQUEST_TOOLS } from '../stores/request-fields';
import { StoresModule } from '../stores/stores.module';
import { StoreToolsService } from './store-tools.service';

/** Business tools part b (spec 2026-10-14): tool rows, the request-tool lookup plan a's leads endpoint uses, and the cap of 4. */
const REQUEST_DEF = { id: 'tlaaaaaaaaaaaaaaaaaa', kind: 'request', title: 'Pide tu diagnóstico', words: { cta: 'Enviar' }, layout: 'card', request: { fields: [{ id: 'empresa', label: 'Empresa', type: 'text', required: true }], deposit: 'deposit_1', reply: 'Te escribimos pronto.' } };
const CALC_DEF = { id: 'tl0123456789abcdef01', kind: 'calculator', title: 'Calcula', words: { cta: 'Añadir' }, layout: 'card', calculator: { productId: 'leche', presets: [], showTiers: true } };

describe('StoreToolsService (spec 2026-10-14, part b)', () => {
  it('finds an approved request tool of this store only', async () => {
    const prisma: any = { storeTool: { findFirst: jest.fn().mockResolvedValue({ id: REQUEST_DEF.id, kind: 'request', status: 'approved', definition: REQUEST_DEF }) } };
    const service = new StoreToolsService(prisma);
    await expect(service.approvedRequestTool('store_1', REQUEST_DEF.id)).resolves.toEqual({ id: REQUEST_DEF.id, title: 'Pide tu diagnóstico', fields: REQUEST_DEF.request.fields, depositProductId: 'deposit_1' });
    expect(prisma.storeTool.findFirst).toHaveBeenCalledWith({ where: { id: REQUEST_DEF.id, storeId: 'store_1', status: 'approved', kind: 'request' } });
    await expect(service.approvedRequestTool('store_1', 'not-a-tool')).resolves.toBeNull();
    prisma.storeTool.findFirst.mockResolvedValue({ id: REQUEST_DEF.id, kind: 'request', status: 'approved', definition: { ...REQUEST_DEF, request: { ...REQUEST_DEF.request, fields: [] } } });
    await expect(service.approvedRequestTool('store_1', REQUEST_DEF.id)).resolves.toBeNull();
  });

  it('lists approved and draft tools for config, sanitized, and skips a row whose definition does not match it', async () => {
    const prisma: any = { storeTool: { findMany: jest.fn().mockResolvedValue([
      { id: CALC_DEF.id, kind: 'calculator', status: 'draft', definition: CALC_DEF },
      { id: REQUEST_DEF.id, kind: 'request', status: 'approved', definition: REQUEST_DEF },
      { id: 'tlbbbbbbbbbbbbbbbbbb', kind: 'calculator', status: 'approved', definition: CALC_DEF },
    ]) } };
    await expect(new StoreToolsService(prisma).configTools('store_1')).resolves.toEqual([{ ...CALC_DEF, status: 'draft' }, { ...REQUEST_DEF, status: 'approved' }]);
    expect(prisma.storeTool.findMany).toHaveBeenCalledWith({ where: { storeId: 'store_1', status: { in: ['draft', 'approved'] } }, orderBy: { createdAt: 'asc' }, take: 4 });
  });

  it('creates a draft under the store lock and refuses a fifth tool', async () => {
    const tx: any = { $queryRaw: jest.fn().mockResolvedValue([{ id: 'store_1' }]), storeTool: { count: jest.fn().mockResolvedValue(3), create: jest.fn().mockResolvedValue({}) } };
    const service = new StoreToolsService({} as any);
    await service.createInTransaction(tx, 'store_1', CALC_DEF as any);
    expect(tx.$queryRaw.mock.calls[0][0].strings.join('?')).toContain('FOR UPDATE');
    expect(tx.storeTool.count).toHaveBeenCalledWith({ where: { storeId: 'store_1', status: { not: 'hidden' } } });
    expect(tx.storeTool.create).toHaveBeenCalledWith({ data: { id: CALC_DEF.id, storeId: 'store_1', kind: 'calculator', status: 'draft', definition: CALC_DEF } });
    tx.storeTool.count.mockResolvedValue(4);
    await expect(service.createInTransaction(tx, 'store_1', CALC_DEF as any)).rejects.toThrow(ConflictException);
  });

  it('is the request-tool source the leads endpoint is given', () => {
    const providers: any[] = Reflect.getMetadata('providers', StoresModule);
    expect(providers).toContainEqual({ provide: REQUEST_TOOLS, useExisting: StoreToolsService });
    expect(Reflect.getMetadata('exports', StoresModule)).toContain(StoreToolsService);
  });
});
```

(b) In `stores.service.spec.ts`:
- In `makeFakePrisma()`, after `collection: { findMany: jest.fn().mockResolvedValue([]) },`, add:
```ts
    storeTool: { findMany: jest.fn().mockResolvedValue([]) },
```
- In `public-stores.service.spec.ts` `setup()`, after `storeOrder: { findMany: jest.fn().mockResolvedValue([]) },`, add the same `storeTool` line.
- In `public-visibility.spec.ts`, after `collection: { findMany: jest.fn(async () => []) },`, add `storeTool: { findMany: jest.fn(async () => []) },`.
- Append to `stores.service.spec.ts`:
```ts
describe("business tools on the store payload (spec 2026-10-14, part b)", () => {
  const CALC = { id: "tl0123456789abcdef01", kind: "calculator", title: "Calcula", words: { cta: "Añadir" }, layout: "card", calculator: { productId: "leche", presets: [], showTiers: true } };
  const proposal = { toolId: "tl0123456789abcdef01", unit: { label: "L", step: 0.5, min: 1, max: 100 } };
  function setup() {
    const prisma = makeFakePrisma();
    prisma.store.findUnique.mockResolvedValue(store);
    prisma.store.findFirst.mockResolvedValue(store);
    prisma.paymentLink.findMany.mockResolvedValue([{ ...publicItem, id: "leche", name: "Leche", amount: 720, unit: null, tiers: null, optionGroups: null, pricingProposal: proposal, subscriptionOptions: [], membershipPeriods: [] }]);
    prisma.storeTool.findMany.mockImplementation(async ({ where }: any) => [{ id: CALC.id, kind: "calculator", status: "draft", definition: CALC }].filter(row => where.status.in.includes(row.status)));
    return { prisma, service: makeStoreServices(prisma as any, makeFakePaymentIntents() as any, makeFakeUploads() as any) };
  }
  it("shows shoppers approved tools only and never a proposal", async () => {
    const { service, prisma } = setup();
    const result = await service.getStorePublic("abc123", { trackView: false });
    expect(result.tools).toEqual([]);
    expect(result.items[0]).not.toHaveProperty("proposal");
    expect(prisma.storeTool.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { storeId: "store_1", status: { in: ["approved"] } } }));
  });
  it("gives the owner's preview the drafts and each product's pending numbers", async () => {
    const result = await setup().service.getStorePublic("abc123", { trackView: false, ownerMerchantId: "m_1" });
    expect(result.tools).toEqual([{ ...CALC, status: "draft" }]);
    expect(result.items[0].proposal).toEqual(proposal);
  });
});
```

- [ ] **Step 3: Run them and see them fail.**
  - Run: `cd apps/api && npx jest src/store-tools/store-tools.service.spec.ts src/stores/stores.service.spec.ts --maxWorkers=2`
  - Expected: FAIL. `Cannot find module './store-tools.service'`, and `result.tools` is `undefined`.

- [ ] **Step 4: The catalog helper.** Append to `store-tool.ts`:
```ts
/** The tools a store payload carries: approved for shoppers; approved and draft for the owner's preview (spec part b). */
export async function storeToolsForCatalog(prisma: { storeTool: { findMany: (args: any) => Promise<Array<{ id: string; kind: string; status: string; definition: unknown }>> } }, storeId: string, owner: boolean): Promise<ConfigTool[]> {
  const rows = await prisma.storeTool.findMany({ where: { storeId, status: { in: owner ? ['draft', 'approved'] : ['approved'] } }, orderBy: { createdAt: 'asc' }, take: MAX_STORE_TOOLS });
  return rows.flatMap(row => {
    const definition = sanitizeToolDefinition(row.definition);
    return definition && definition.id === row.id && definition.kind === row.kind && (row.status === 'draft' || row.status === 'approved') ? [{ ...definition, status: row.status }] : [];
  });
}
```

- [ ] **Step 5: The service.** Create `apps/api/src/store-tools/store-tools.service.ts`:
```ts
import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TOOL_ID_PATTERN, type ApprovedRequestTool, type RequestToolSource } from '../stores/request-fields';
import { MAX_STORE_TOOLS, sanitizeToolDefinition, storeToolsForCatalog, type ConfigTool, type StoreToolDefinition } from './store-tool';

/** Business tools (spec 2026-10-14): a store's tool rows. The leads endpoint asks it for approved request tools (plan a). */
@Injectable()
export class StoreToolsService implements RequestToolSource {
  constructor(private readonly prisma: PrismaService) {}

  async approvedRequestTool(storeId: string, toolId: string): Promise<ApprovedRequestTool | null> {
    if (!TOOL_ID_PATTERN.test(toolId)) return null;
    const row = await this.prisma.storeTool.findFirst({ where: { id: toolId, storeId, status: 'approved', kind: 'request' } });
    const definition = row ? sanitizeToolDefinition(row.definition) : null;
    if (!row || !definition?.request || definition.id !== row.id) return null;
    return { id: row.id, title: definition.title, fields: definition.request.fields, depositProductId: definition.request.deposit ?? null };
  }

  /** Approved and draft tools for config.tools and the owner's preview. */
  configTools(storeId: string): Promise<ConfigTool[]> {
    return storeToolsForCatalog(this.prisma, storeId, true);
  }

  /** A new draft, under a lock on the store row so two saves cannot both make a fifth tool. */
  async createInTransaction(tx: Prisma.TransactionClient, storeId: string, definition: StoreToolDefinition): Promise<void> {
    await tx.$queryRaw`SELECT id FROM "Store" WHERE id = ${storeId} FOR UPDATE`;
    const count = await tx.storeTool.count({ where: { storeId, status: { not: 'hidden' } } });
    if (count >= MAX_STORE_TOOLS) throw new ConflictException(`Esta tienda ya tiene ${MAX_STORE_TOOLS} herramientas. Oculta una antes de agregar otra.`);
    await tx.storeTool.create({ data: { id: definition.id, storeId, kind: definition.kind, status: 'draft', definition: definition as unknown as Prisma.InputJsonValue } });
  }
}
```

- [ ] **Step 6: Wire the module.** In `stores.module.ts`:
- Add the imports:
```ts
import { StoreToolsService } from "../store-tools/store-tools.service";
import { REQUEST_TOOLS } from "./request-fields";
```
- Replace:
```ts
  providers: [StoresService, PublicStoresService, StoreCheckoutService],
  exports: [StoresService, PublicStoresService, StoreCheckoutService],
```
with:
```ts
  // StoreToolsService answers plan a's leads endpoint (REQUEST_TOOLS) with a store's approved request tools.
  providers: [StoresService, PublicStoresService, StoreCheckoutService, StoreToolsService, { provide: REQUEST_TOOLS, useExisting: StoreToolsService }],
  exports: [StoresService, PublicStoresService, StoreCheckoutService, StoreToolsService],
```

- [ ] **Step 7: The payload.** In `public-stores.service.ts`:
- Change the plan a import to `import { readPricingProposal, sellingRulesPublic } from "./selling-rules";`.
- Add `import { storeToolsForCatalog } from "../store-tools/store-tool";`.
- After `if (trackView) this.queueStoreView(store.id);`, add:
```ts
    // Business tools (spec 2026-10-14): shoppers get approved tools; the owner's Studio preview also gets drafts.
    const tools = await storeToolsForCatalog(this.prisma, store.id, Boolean(options.ownerMerchantId));
```
- In the returned object, before `items: items.map((item) => ({`, add `tools,`.
- In the item map, after the plan a line `...sellingRulesPublic(item),`, add:
```ts
        // The pending numbers, only for the owner's preview of a draft tool. Never priced from, never sent to shoppers.
        ...(options.ownerMerchantId ? { proposal: readPricingProposal(item.pricingProposal, item.amount) } : {}),
```

- [ ] **Step 8: Run them and see them pass.**
  - Run: `cd apps/api && npx jest src/store-tools/store-tools.service.spec.ts src/stores/stores.service.spec.ts src/stores/public-stores.service.spec.ts src/stores/public-visibility.spec.ts src/stores/tool-leads.spec.ts --maxWorkers=2`
  - Expected: PASS.

- [ ] **Step 9: Commit.**
```bash
git add apps/api/src/store-tools/store-tools.service.ts apps/api/src/store-tools/store-tool.ts apps/api/src/store-tools/store-tools.service.spec.ts apps/api/src/stores/stores.module.ts apps/api/src/stores/public-stores.service.ts apps/api/src/stores/stores.service.spec.ts apps/api/src/stores/public-stores.service.spec.ts apps/api/src/stores/public-visibility.spec.ts
git commit -m "feat(tools): StoreToolsService, approved request tools for leads, tools and owner proposals on the store payload

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---


### Task 3: Saves copy the tools into `config.tools`; previews get them live

**Existing code (after the split plan):**
- **`source-generation.service.ts`, `catalog(merchantId, storeId)`.** Its return literal ends `cartRecommendationsEnabled: data.cartRecommendationsEnabled, cartRecommendationProductIds: data.cartRecommendationProductIds, bundles: data.bundles };`.
- **`source-generation.service.ts`, `generate()`.**
  - `const publicStore = await this.publicStores.getStorePublic(owner.slug, { trackView: false, ownerMerchantId: merchantId });`
  - `const data = sourceStoreConfigData(publicStore, apiUrl, dto.revision === 0);`
  - `const saveContext: SaveAssemblyContext = { facts, live, platformHeader, agentPolicyChange };`. The controls and voice plans may have added fields; keep them.
- **`source-save-assembly.ts`.**
  - `export type SaveAssemblyContext = { facts: …; live: …; platformHeader: …; agentPolicyChange: boolean; };`
  - `assembleSourceSave` opens with `const { facts, live, platformHeader, agentPolicyChange } = context;`.
  - Its config literal ends `checkoutOrigin: appConfig.get<string>("app.checkoutOrigin"), data };`.
- **`source-store-config.ts`.** `sourceStoreConfigData` maps `items: publicStore.items.map((item) => ({ ...item, imageUrls: …`.

**Files:**
- Modify: `apps/api/src/storefront-source/source-store-config.ts`
- Modify: `apps/api/src/storefront-source/source-save-assembly.ts`
- Modify: `apps/api/src/storefront-source/source-generation.service.ts`
- Create: `apps/api/src/storefront-source/generation-harness.testing.ts`
- Create (test): `apps/api/src/storefront-source/source-generation-tools-config.spec.ts`

**Interfaces:**
- Consumes: `ConfigTool` (Task 1); the payload `tools` (Task 2).
- Produces:
  - `SaveAssemblyContext.tools?: ConfigTool[]`. A live array: plan c pushes this run's new drafts into it before the save, and the save reads it when called.
  - In `generate()`, `const storeTools: ConfigTool[]`.
  - `config.tools` on every generation save that has tools.
  - `catalog().tools`.
  - `generationHarness(options?)` in `generation-harness.testing.ts`, reused by plan c, returning `{ service, prisma, stores, projects, config, revision }`. It also exports `threeConceptDesign`, `files`, `dto`, `answer` and `configOf`.

- [ ] **Step 1: Live-stack check.** Run the command from Global Constraints and continue only on `[0,0]`.

- [ ] **Step 2: The shared generation harness.** Create `apps/api/src/storefront-source/generation-harness.testing.ts`. It is not a spec and holds no `jest.mock`; each spec still declares the mocks it needs.
```ts
import { ConflictException } from '@nestjs/common';
import * as designModule from './source-design';
import { validDna } from './fixtures/dna';
import { SourceGenerationService } from './source-generation.service';
import { sourceProjectSnapshot } from './source-project';

/** The Sep-5 generation harness of source-generation-review.spec.ts, shared by the business-tools specs (plans b and c). */
const concept = (name: string) => ({ name, premise: `${name} premise`, opening: `${name} opening`, flow: `${name} flow`, typography: 'Instrument', imagery: 'No photos', mobile: 'Keep order visible',
  composition: { family: 'menu-led', rationale: 'The dairy needs a clear catalog for quick ordering.', pages: [{ page: 'index.html', purpose: 'shopping', rationale: 'Choose from the real catalog.', sections: [{ id: 'menu', intent: 'Choose products and order.', layout: 'product-grid', geometry: 'grid', media: [], mobile: 'grid', primaryAction: 'Order' }] }] },
  layout: { sections: ['menu'], catalogSection: 'menu', standaloneIntro: false, productsInOpening: true },
  story: { promise: `${name} promise`, eyebrow: '', headline: `${name} para compartir`, support: 'Una selección breve y clara.', primaryAction: 'Ver productos', beats: [{ section: 'menu', role: 'offer', headline: 'Productos', media: 'product' }] },
  motion: { mode: 'subtle', scrollFeel: 'soft', entrance: 'none', scenes: [] }, dna: validDna() });
export const threeConceptDesign = designModule.validateSourceDesign({ concepts: ['Menu', 'Window', 'Counter'].map(concept), selected: 0 }, 0, true, true);
export const files = () => [
  { path: 'index.html', content: '<!doctype html><html lang="es"><body><main><section id="hero"><h1>Lechería del Valle</h1></section><section id="menu"><h2>Productos</h2><div data-pagosya-catalog></div></section></main><div data-pagosya-cart></div><p data-pagosya-status></p><script src="config.js" defer></script><script src="commerce.js" defer></script></body></html>' },
  { path: 'styles.css', content: 'body { color: #222; }' }, { path: 'site.js', content: 'globalThis.__generatedSourceExecuted = true;' },
];
export const dto = { revision: 0, brief: { businessType: 'Lechería', audience: 'Familias', primaryAction: 'Pedir', visualDirection: 'Fresco' }, instruction: 'Crea la tienda de mi lechería', assetUrls: [] } as any;
export const answer = (value: unknown) => new Response(JSON.stringify({ status: 'completed', output: [{ content: [{ type: 'output_text', text: typeof value === 'string' ? value : JSON.stringify(value) }] }], usage: { input_tokens: 1000, output_tokens: 1000 } }));
export const configOf = (call: any[]) => JSON.parse(call[2].files.find((f: any) => f.path === 'config.js').content.replace(/^window\.PAGOSYA_CONFIG = /, '').replace(/;\s*$/, ''));

export function generationHarness(options: { publicStore?: Record<string, unknown>; storeTools?: unknown } = {}) {
  const revision = { current: 0 };
  const prisma: any = {
    storeRetention: { findUnique: jest.fn().mockResolvedValue(null) },
    storeSourceGeneration: { create: jest.fn().mockResolvedValueOnce({ id: 'run-1' }).mockResolvedValue({ id: 'review-1' }), updateMany: jest.fn().mockResolvedValue({ count: 1 }), findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null) },
    store: { findFirst: jest.fn().mockResolvedValue({ slug: 'lecheria' }), findUnique: jest.fn().mockResolvedValue(null) },
    mediaAsset: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null) },
    storeAgentThread: { findUnique: jest.fn().mockResolvedValue({ id: 't1' }) },
    storeAgentMessage: { create: jest.fn().mockResolvedValue({ id: 'msg-1' }), findFirst: jest.fn().mockResolvedValue(null) },
  };
  const stores: any = { getStorePublic: jest.fn().mockResolvedValue({ storeName: 'Lechería del Valle', checkoutMode: 'payment', items: [], categories: [], locations: [], tools: [], ...options.publicStore }) };
  const projects: any = {
    prepare: jest.fn(async value => sourceProjectSnapshot(value)),
    current: jest.fn(async () => ({ revision: revision.current, slug: 'lecheria' })),
    version: jest.fn(),
    save: jest.fn(async (_m: string, _s: string, value: any, _generation: unknown, fence?: (tx: unknown) => Promise<void>) => {
      if (value.revision !== revision.current) throw new ConflictException('El proyecto cambió en otra sesión. Recarga la revisión antes de guardar.');
      if (fence) await fence(prisma);
      revision.current += 1;
      return { revision: revision.current, label: value.label, digest: 'd', createdAt: new Date(), restoredFrom: null, createdProducts: [], updatedProducts: [], deletedProducts: [] };
    }),
    recentFrameDraws: jest.fn().mockResolvedValue([]), recentDesignFingerprints: jest.fn().mockResolvedValue([]), recentCompositionFingerprints: jest.fn().mockResolvedValue([]),
  };
  const values = new Map<string, unknown>(Object.entries({ 'app.openAi.apiKey': 'test-server-key', 'app.openAi.enabled': true, 'app.checkoutOrigin': 'http://localhost:5174', 'app.environment': 'test', 'app.sourceFramework': 'static', 'app.sep5Author': true, 'app.sep5SelfReview': false }));
  const config: any = { get: jest.fn((key: string) => values.get(key)), set: (key: string, value: unknown) => values.set(key, value) };
  const uploads: any = { getBuffer: jest.fn(), contentTypeFor: jest.fn().mockReturnValue('image/png') };
  const metering: any = { record: jest.fn().mockResolvedValue(undefined) };
  const service = new SourceGenerationService(prisma, stores, projects, uploads, config, undefined, metering);
  // Plan c's optional StoreToolsService, set by name so the harness does not depend on the constructor's argument order.
  if (options.storeTools) Object.assign(service, { storeTools: options.storeTools });
  return { service, prisma, stores, projects, config, revision };
}
```

- [ ] **Step 3: Write the failing test.** Create `apps/api/src/storefront-source/source-generation-tools-config.spec.ts`:
```ts
jest.setTimeout(60_000);
import { Logger } from '@nestjs/common';
import * as designModule from './source-design';
import { SourceDesignPlanner } from './source-design-planner';
import { SourceRequestBudget } from './source-request-budget';
import { sourceStoreConfigData } from './source-store-config';
import { answer, configOf, dto, files, generationHarness, threeConceptDesign } from './generation-harness.testing';
jest.mock('./store-look-measure', () => ({ ...jest.requireActual('./store-look-measure'), measureStoreLook: jest.fn().mockResolvedValue(null) }));
jest.mock('./product-theme-check', () => ({ ...jest.requireActual('./product-theme-check'), checkProductThemeOnSnapshot: jest.fn().mockResolvedValue([]) }));
jest.mock('./kit-surface-check', () => ({ checkKitSurfacesOnSnapshot: jest.fn().mockResolvedValue({ catalog: [], card: [], cart: [] }) }));
jest.mock('./source-photo-sampler', () => ({ samplePhotoColours: jest.fn().mockResolvedValue(new Map()) }));
jest.mock('./design-engine/header-clickable', () => ({ ...jest.requireActual('./design-engine/header-clickable'), captureHeaderCovers: jest.fn().mockResolvedValue([]) }));

/** Business tools part b (spec 2026-10-14): saves copy approved and draft tools into config.tools; saved catalog data never
 *  carries a pending proposal. */
const CALC = { id: 'tl0123456789abcdef01', kind: 'calculator', title: 'Calcula tu leche', words: { cta: 'Añadir' }, layout: 'card', calculator: { productId: 'leche', presets: [10], showTiers: true }, status: 'draft' };
const LECHE = { id: 'leche', name: 'Leche', amount: 720, currency: 'BOB', imageUrls: [], variants: [], extras: [], unit: null, tiers: [], optionGroups: [], proposal: { toolId: CALC.id, unit: { label: 'L', step: 0.5, min: 1, max: 100 } } };

describe('config.tools (spec 2026-10-14, part b)', () => {
  beforeEach(() => {
    jest.spyOn(SourceDesignPlanner.prototype, 'explore').mockResolvedValue(threeConceptDesign);
    jest.spyOn(designModule, 'sourceDesignExploration').mockReturnValue(designModule.sourceDesignExploration(0));
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(globalThis, 'fetch').mockImplementation((async () => answer({ label: 'Lechería', files: files(), products: [] })) as any);
  });
  afterEach(() => jest.restoreAllMocks());

  it('writes the store tools into config.js and leaves the proposal out of the saved catalog', async () => {
    const { service, projects } = generationHarness({ publicStore: { tools: [CALC], items: [LECHE] } });
    await service.generate('m1', 's1', dto, new SourceRequestBudget(25), []);
    const saved = configOf(projects.save.mock.calls[0]);
    expect(saved.tools).toEqual([CALC]);
    expect(saved.data.items[0]).not.toHaveProperty('proposal');
  });

  it('writes no tools key for a store without tools', async () => {
    const { service, projects } = generationHarness();
    await service.generate('m1', 's1', dto, new SourceRequestBudget(25), []);
    expect(configOf(projects.save.mock.calls[0])).not.toHaveProperty('tools');
  });

  it('strips the proposal from saved catalog data', () => {
    const data = sourceStoreConfigData({ storeName: 'L', items: [LECHE], categories: [], locations: [] } as any, new URL('https://api.test/v1/'), false);
    expect(data.items[0]).not.toHaveProperty('proposal');
  });
});
```

- [ ] **Step 4: Run it and see it fail.**
  - Run: `cd apps/api && npx jest src/storefront-source/source-generation-tools-config.spec.ts`
  - Expected: FAIL. `saved.tools` is `undefined`, and the saved item has `proposal`.

- [ ] **Step 5: Implement.**

(a) `source-store-config.ts`, in `sourceStoreConfigData`: replace `items: publicStore.items.map((item) => ({ ...item, imageUrls:` with:
```ts
    // A draft tool's pending numbers (the owner's `proposal`) never reach a saved, publishable config.js (spec 2026-10-14).
    items: publicStore.items.map(({ proposal: _proposal, ...item }: typeof publicStore.items[number] & { proposal?: unknown }) => ({ ...item, imageUrls:
```
The rest of that line stays.

(b) `source-save-assembly.ts`:
- Add `import type { ConfigTool } from '../store-tools/store-tool';`.
- Inside `export type SaveAssemblyContext = { … }`, before its closing `};`, add:
```ts
  /** Business tools (spec 2026-10-14): the store's approved and draft tools, written as config.tools. A live array: a build
   *  or chat request that creates a tool pushes its draft before the save. */
  tools?: ConfigTool[];
```
- Replace `const { facts, live, platformHeader, agentPolicyChange } = context;` with `const { facts, live, platformHeader, agentPolicyChange, tools } = context;`. Keep any field the controls or voice plan added to that destructuring.
- Replace the config literal's tail `checkoutOrigin: appConfig.get<string>("app.checkoutOrigin"), data };` with:
```ts
checkoutOrigin: appConfig.get<string>("app.checkoutOrigin"), ...(tools?.length ? { tools } : {}), data };
```

(c) `source-generation.service.ts`:
- In `catalog()`, replace `bundles: data.bundles };` (the end of its return literal) with `bundles: data.bundles, tools: data.tools };`.
- In `generate()`, after `const data = sourceStoreConfigData(publicStore, apiUrl, dto.revision === 0);`, add:
```ts
    // Business tools (spec 2026-10-14): the store's approved and draft tools travel in config.tools on every save; plan c adds
    // the drafts a build or a chat request creates to this same array before the save.
    const storeTools: ConfigTool[] = Array.isArray((publicStore as { tools?: ConfigTool[] }).tools) ? [...(publicStore as { tools: ConfigTool[] }).tools] : [];
```
- Replace `const saveContext: SaveAssemblyContext = { facts, live, platformHeader, agentPolicyChange };` with `const saveContext: SaveAssemblyContext = { facts, live, platformHeader, agentPolicyChange, tools: storeTools };`, keeping any field the earlier plans added.
- Add `import type { ConfigTool } from '../store-tools/store-tool';` to the imports.

- [ ] **Step 6: Run it and the review spec, and see them pass.**
  - Run: `cd apps/api && npx jest src/storefront-source/source-generation-tools-config.spec.ts src/storefront-source/source-generation-review.spec.ts --maxWorkers=2`
  - Expected: PASS. The review spec's catalog mock has no `tools`, so its saves have no `tools` key.

- [ ] **Step 7: Commit.**
```bash
git add apps/api/src/storefront-source/source-store-config.ts apps/api/src/storefront-source/source-save-assembly.ts apps/api/src/storefront-source/source-generation.service.ts apps/api/src/storefront-source/generation-harness.testing.ts apps/api/src/storefront-source/source-generation-tools-config.spec.ts
git commit -m "feat(tools): saves copy store tools into config.tools; previews get them from the live catalog

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The kit's selling estimator (`business-tools/selling.js`)

**Existing code:** In `packages/storefront-kit/tools/build-commerce.mjs`, `export const PARTS = [ … 'shared/analytics.js',\n  'shared/state.js', … ]`.

**Files:**
- Create: `packages/storefront-kit/commerce-src/business-tools/selling.js`
- Modify: `packages/storefront-kit/tools/build-commerce.mjs` (`PARTS`)
- Modify (generated): `packages/storefront-kit/kit/commerce.js`
- Create (test): `apps/api/src/store-tools/kit-selling-parity.spec.ts`

**Interfaces:**
- Produces, in the commerce IIFE scope: `const SELLING = { unit(p), tiers(p, unit), groups(p), resolve(p, options), optionsKey(options), estimateLine(p, quantity, options, cadencePercent, now?), unitsText(units) }`.
  - `estimateLine` returns the fields of `SellingLinePrice` (plan a) minus `optionsKey`, or `null` where the server would refuse.
  - `unit(p)` adds `stepMilli`, `minSteps` and `maxSteps`.

- [ ] **Step 1: Write the failing parity test.** Create `apps/api/src/store-tools/kit-selling-parity.spec.ts`:
```ts
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { kitPath } from '@pagosya/storefront-kit';
import { priceSellingLine } from '../stores/selling-rules';

/** Business tools part b (spec 2026-10-14): the kit's instant estimate equals the server's price, to the cent, for every line
 *  a tool can make. A drift here is a total that changes at checkout. The part runs alone: it reads nothing else. */
const kit = runInNewContext(`${readFileSync(kitPath('..', 'commerce-src', 'business-tools', 'selling.js'), 'utf8')}\nSELLING;`, {});
const NOW = Date.parse('2026-10-15T12:00:00Z');
const NO_SALE = { discountPercent: null, discountStartsAt: null, discountEndsAt: null };
const SALE = { discountPercent: 20, discountStartsAt: new Date('2026-10-01T00:00:00Z'), discountEndsAt: new Date('2026-11-01T00:00:00Z') };
const LECHE = { name: 'Leche entera', amount: 720, variants: [], unit: { label: 'L', step: 0.5, min: 1, max: 100 }, tiers: [{ from: 1, unitAmount: 720 }, { from: 15, unitAmount: 690 }, { from: 30, unitAmount: 650 }], ...NO_SALE };
const QUINUA = { name: 'Quinua', amount: 1000, variants: [], unit: { label: 'kg', step: 0.3, min: 0.3, max: 30 }, tiers: [{ from: 0.3, unitAmount: 1000 }, { from: 0.9, unitAmount: 900 }], ...NO_SALE };
const TORTA = { name: 'Torta', amount: 15000, variants: [], ...NO_SALE, optionGroups: [
  { id: 'size', label: 'Tamaño', type: 'single', required: true, choices: [{ id: 's', label: 'Chica', amountDelta: 0 }, { id: 'l', label: 'Grande', amountDelta: 6000 }] },
  { id: 'extras', label: 'Decoración', type: 'multi', required: false, choices: [{ id: 'fruit', label: 'Frutas', amountDelta: 1500 }, { id: 'gold', label: 'Dorado', amountDelta: 2500 }] },
  { id: 'note', label: 'Mensaje', type: 'text', required: false, maxLength: 40 },
] };
/** What the storefront receives: dates as ISO strings (getStorePublic). */
const asPublic = (p: any) => ({ ...p, discountStartsAt: p.discountStartsAt?.toISOString() ?? null, discountEndsAt: p.discountEndsAt?.toISOString() ?? null });
const plain = (value: unknown) => JSON.parse(JSON.stringify(value));
/** jest-each passes a `done` callback when a row is shorter than the test's parameters, so every row has all five. */
const ROWS: Array<[string, any, number, any?, number?]> = [
  ['14,5 L stays on the base price', LECHE, 29],
  ['15 L reaches the tier', LECHE, 30],
  ['20 L', LECHE, 40],
  ['100 L, the last tier', LECHE, 200],
  ['3 × 0,3 kg reaches 0,9 kg', QUINUA, 3],
  ['a stale tier after a price change', { ...LECHE, amount: 800 }, 40],
  ['tier, sale and weekly cadence', { ...LECHE, ...SALE }, 30, undefined, 10],
  ['tier and monthly cadence without a sale', LECHE, 40, undefined, 15],
  ['a cake with three options', TORTA, 2, { size: ['l'], extras: ['gold', 'fruit'], note: 'Feliz día, Ana' }],
  ['a cake on sale', { ...TORTA, ...SALE }, 1, { size: ['s'] }],
];
const CASES = ROWS.map(([name, product, quantity, options, cadence]) => [name, product, quantity, options, cadence] as [string, any, number, any, number | undefined]);

describe('kit selling estimate equals the server (spec 2026-10-14, part b)', () => {
  it.each(CASES)('%s', (_name, product, quantity, options, cadence) => {
    const { optionsKey: _key, ...server } = priceSellingLine({ product, quantity, options, cadenceDiscountPercent: cadence, now: new Date(NOW) });
    expect(plain(kit.estimateLine(asPublic(product), quantity, options, cadence, NOW))).toEqual(plain(server));
  });

  it('refuses what the server refuses, instead of guessing a price', () => {
    expect(kit.estimateLine(LECHE, 1, undefined, undefined, NOW)).toBeNull();
    expect(kit.estimateLine(LECHE, 201, undefined, undefined, NOW)).toBeNull();
    expect(kit.estimateLine(TORTA, 1, {}, undefined, NOW)).toBeNull();
    expect(kit.estimateLine(TORTA, 1, { size: ['xl'] }, undefined, NOW)).toBeNull();
    expect(kit.estimateLine({ ...LECHE, variants: [{ id: 'v', name: 'V', amount: 1 }] }, 40, undefined, undefined, NOW).unit).toBeNull();
    expect(kit.optionsKey({ size: ['l'], extras: ['gold', 'fruit'] })).toBe(kit.optionsKey({ extras: ['fruit', 'gold'], size: ['l'] }));
    expect(kit.unitsText(14.5)).toBe('14,5');
    expect(kit.unit(LECHE)).toEqual({ label: 'L', step: 0.5, min: 1, max: 100, stepMilli: 500, minSteps: 2, maxSteps: 200 });
  });
});
```

- [ ] **Step 2: Run it and see it fail.**
  - Run: `cd apps/api && npx jest src/store-tools/kit-selling-parity.spec.ts`
  - Expected: FAIL, `ENOENT … commerce-src/business-tools/selling.js`.

- [ ] **Step 3: Write the part.** Create `packages/storefront-kit/commerce-src/business-tools/selling.js`. A part is a run of lines inside the commerce IIFE, at its two-space indent, and must end with a newline:
```js
  // Business tools (spec 2026-10-14, part b): the storefront's copy of the server's selling rules
  // (apps/api/src/stores/selling-rules.ts), for instant estimates in the cart and the tools. The server prices every line
  // again, and a tool's total is replaced by the server's price quote. kit-selling-parity.spec.ts pins this part to the
  // server for a table of lines. It reads nothing else in the runtime, so that spec runs it alone.
  const SELLING = (() => {
    const SCALE = 1000;
    const ID = /^[a-z0-9][a-z0-9-]{0,31}$/;
    const milli = value => Math.round(value * SCALE);
    const exact = value => typeof value === 'number' && Number.isFinite(value) && value > 0 && Math.abs(value * SCALE - Math.round(value * SCALE)) < 1e-6 ? Math.round(value * SCALE) : null;
    const record = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
    const UNITS = new Intl.NumberFormat('es-BO', { maximumFractionDigits: 3, useGrouping: false });
    const unitsText = units => UNITS.format(units);
    /** The product's unit with its step counts, or null (a product with variants is never sold by unit). */
    function unit(p) {
      if (!record(p) || (Array.isArray(p.variants) && p.variants.length) || !record(p.unit)) return null;
      const label = typeof p.unit.label === 'string' ? p.unit.label.trim() : '';
      const step = exact(p.unit.step), min = exact(p.unit.min), max = exact(p.unit.max);
      if (!label || label.length > 12 || !step || !min || !max || min % step || max % step || min > max || max / step > 999) return null;
      return { label, step: step / SCALE, min: min / SCALE, max: max / SCALE, stepMilli: step, minSteps: min / step, maxSteps: max / step };
    }
    /** Tiers that derive from the product's real price; stale or malformed tiers read as none, like the server. */
    function tiers(p, u) {
      const list = u && Array.isArray(p.tiers) ? p.tiers : [];
      if (!list.length || list.length > 6) return [];
      const out = [];
      for (const tier of list) {
        const from = exact(record(tier) ? tier.from : null);
        if (from === null || from % u.stepMilli || from > milli(u.max) || !Number.isSafeInteger(tier.unitAmount) || tier.unitAmount < 1) return [];
        const previous = out[out.length - 1];
        if (previous && (from <= milli(previous.from) || tier.unitAmount >= previous.unitAmount)) return [];
        out.push({ from: from / SCALE, unitAmount: tier.unitAmount });
      }
      return milli(out[0].from) === milli(u.min) && out[0].unitAmount === p.amount ? out : [];
    }
    const groups = p => record(p) && Array.isArray(p.optionGroups) ? p.optionGroups.filter(group => record(group) && ID.test(group.id || '')) : [];
    function optionsKey(chosen) {
      if (!record(chosen)) return '';
      const entries = Object.keys(chosen).sort().map(key => [key, Array.isArray(chosen[key]) ? chosen[key].slice().sort() : String(chosen[key]).trim()]);
      return entries.length ? JSON.stringify(entries) : '';
    }
    /** The chosen labels and the sum of deltas, or null for a choice the server would refuse. */
    function resolve(p, chosen) {
      const list = groups(p), given = record(chosen) ? chosen : {};
      if (Object.keys(given).some(key => !list.some(group => group.id === key))) return null;
      let delta = 0;
      const picked = [];
      for (const group of list) {
        const value = given[group.id];
        if (group.type === 'text') {
          const text = value === undefined ? '' : typeof value === 'string' ? value.trim() : null;
          if (text === null || text.length > (group.maxLength || 140)) return null;
          if (!text) { if (group.required) return null; continue; }
          picked.push({ groupId: group.id, group: group.label, values: [text] });
          continue;
        }
        const ids = value === undefined ? [] : Array.isArray(value) ? value : null;
        if (!ids || new Set(ids).size !== ids.length || (group.type === 'single' && ids.length > 1)) return null;
        if (!ids.length) { if (group.required) return null; continue; }
        const choices = (group.choices || []).filter(choice => ids.includes(choice.id));
        if (choices.length !== ids.length) return null;
        delta += choices.reduce((sum, choice) => sum + choice.amountDelta, 0);
        picked.push({ groupId: group.id, group: group.label, values: choices.map(choice => choice.label) });
      }
      return { delta, picked };
    }
    function sale(p, amount, now) {
      const percent = p.discountPercent;
      const on = Number.isInteger(percent) && percent >= 1 && percent <= 99 && p.discountStartsAt && p.discountEndsAt && now >= Date.parse(p.discountStartsAt) && now < Date.parse(p.discountEndsAt);
      return on ? Math.max(0, Math.round(amount * (100 - percent) / 100)) : amount;
    }
    /** What `quantity` costs (steps for a unit product), mirroring priceSellingLine; null where the server would refuse it. */
    function estimateLine(p, quantity, chosen, cadencePercent, now) {
      if (!record(p) || !Number.isInteger(quantity) || quantity < 1 || quantity > 999) return null;
      const when = now === undefined ? Date.now() : now;
      const options = resolve(p, chosen);
      if (!options) return null;
      const u = unit(p);
      let perQuantity = p.amount + options.delta, listPerQuantity = perQuantity, tier = null, nextTier = null, lineUnit = null;
      if (u) {
        const units = quantity * u.stepMilli;
        if (units < milli(u.min) || units > milli(u.max)) return null;
        const list = tiers(p, u);
        let index = -1;
        list.forEach((entry, at) => { if (milli(entry.from) <= units) index = at; });
        tier = index > 0 ? list[index] : null;
        const next = list.find(entry => milli(entry.from) > units);
        nextTier = next ? { from: next.from, unitAmount: next.unitAmount, unitsToGo: (milli(next.from) - units) / SCALE } : null;
        const step = perUnit => Math.round(perUnit * u.stepMilli / SCALE);
        perQuantity = step((tier ? tier.unitAmount : p.amount) + options.delta);
        listPerQuantity = step(p.amount + options.delta);
        lineUnit = { label: u.label, step: u.step, units: units / SCALE };
      }
      const today = sale(p, perQuantity, when);
      let unitAmount = today, lockedUnitAmount = null;
      if (typeof cadencePercent === 'number') {
        const discounted = Math.round(perQuantity * (100 - cadencePercent) / 100);
        unitAmount = Math.min(today, discounted);
        lockedUnitAmount = discounted;
      }
      return {
        unitAmount, lockedUnitAmount, lineAmount: unitAmount * quantity, unit: lineUnit, tier, nextTier,
        saving: (listPerQuantity - perQuantity) * quantity, options: options.picked,
        quantityLabel: lineUnit ? unitsText(lineUnit.units) + ' ' + lineUnit.label : '× ' + quantity,
        optionsLabel: options.picked.map(option => option.group + ': ' + option.values.join(', ')).join(' · '),
      };
    }
    return Object.freeze({ unit, tiers, groups, resolve, optionsKey, estimateLine, unitsText });
  })();
```

- [ ] **Step 4: List the part and rebuild.**
- In `tools/build-commerce.mjs`, replace:
```js
  'shared/analytics.js',
  'shared/state.js',
```
with:
```js
  'shared/analytics.js',
  // Business tools (spec 2026-10-14): read by the cart lines and the tools, so it runs before them.
  'business-tools/selling.js',
  'shared/state.js',
```
- Run: `node packages/storefront-kit/tools/build-commerce.mjs`. Expected: `Wrote kit/commerce.js from 32 commerce-src parts.`

- [ ] **Step 5: Run the tests and see them pass.**
  - Run: `cd apps/api && npx jest src/store-tools/kit-selling-parity.spec.ts`. Expected: PASS.
  - Run: `node --test packages/storefront-kit/tools/build-commerce.test.mjs && node packages/storefront-kit/kit/check-runtimes.mjs`. Expected: 3 tests pass, and every runtime parses.
  - Run: `cd apps/api && npx jest src/storefront-source/source-kit-browser-floor.spec.ts`. Expected: PASS.

- [ ] **Step 6: Commit.**
```bash
git add packages/storefront-kit/commerce-src/business-tools/selling.js packages/storefront-kit/tools/build-commerce.mjs packages/storefront-kit/kit/commerce.js apps/api/src/store-tools/kit-selling-parity.spec.ts
git commit -m "feat(tools): the kit's selling estimator, pinned to the server's prices

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The kit cart carries unit, builder and deposit lines

**Existing code (commerce-src parts):**
- **`shared/state.js`:**
  - `const products = () => Array.isArray(store.items) ? store.items : [];`
  - `const limit = (p) => Math.max(0, Math.min(99, p.purchaseLimit ?? 99, p.stock ?? 99));`
  - `const lineKey = (id, variantId, cadence) => …;`
- **`cart/lines.js`:**
  - `function cartLine(key) { … }`: its parse line `const [id, variantId, keyPicks, cadence] = JSON.parse(key);`, its cadence return `return { p, variant, cadence, name: …, amount: subscriptionPrice(p, variant, cadence) };`, and its last guard `if (!p || p.extras?.length || (p.variants?.length && (!variant || !optionGroups(p)))) return null;`.
  - `function cartValue()`, `const cartItems = () => …`, `const checkoutItems = () => …` and `function restoreCart(items)`, whose key line starts `const key = item?.subscriptionCadence ?`.
  - `function notifyHostedCart()`, with its `if (items.length > 100 || items.some(item => …` and `pendingHostedCart = items.map(…)`.
- **`cart/render.js`:** `function renderCart()`'s per-line code: `total += amount * quantity; count += quantity;`, `const option = …`, `const saved = …`, `const unitCopy = …`, `rows.push(…)` and `lineViews.push(…)`.
- **`templates/kit-templates.js`:** `applyLineTemplate`'s `text('line-total', money(view.amount * view.quantity, view.p.currency));`.
- **`shared/click-actions.js`:** the `data-remove` branch.
- **`checkout/submit.js`:** `checkout(button)`'s body `items: checkoutItems(), ...(subscriptionLine ? { subscriptionConsent: true } : {})`.
- **`apps/checkout/src/source-storefront.ts`:** `type StoredCartItem = { … }`, `validatedCart(value, extrasKey)`, and the hosted `checkout` payload `items: body.items, recoveryToken: …`.

**Files:**
- Modify (parts): `packages/storefront-kit/commerce-src/shared/state.js`, `cart/lines.js`, `cart/render.js`, `templates/kit-templates.js`, `shared/click-actions.js`, `checkout/submit.js`
- Modify (generated): `packages/storefront-kit/kit/commerce.js`
- Modify: `apps/checkout/src/source-storefront.ts`
- Create: `apps/api/src/store-tools/kit-runtime.testing.ts`
- Create (tests): `apps/api/src/store-tools/kit-tool-cart.spec.ts`, `apps/checkout/test/source-storefront-tools.test.ts`

**Interfaces:**
- Consumes: `SELLING` (Task 4); plan a's `CartItemDto.options` and `CartCheckoutDto.leadDeposit`.
- Produces (in the commerce IIFE scope; Tasks 6–10 use them):
  ```js
  const sellingUnit = p => unit|null;   const builderGroups = p => group[];   const toolProduct = p => boolean;
  const optionLineKey = (id, options) => string;   const depositLineKey = (id, deposit) => string;
  const lineTotal = (line, quantity) => number;    // unit and builder lines price through SELLING
  function unitLine(p, unit, extra) → line         // { p, unit, name, amount, total(q), quantityText(q), stepText, unitText(q), … }
  // cartLine(key) for a builder line: { p, options, optionsLabel, name, amount }; for a deposit line: { p, deposit: { leadId, token }, name, amount }
  // cartItems() items may carry options and leadDeposit; checkoutItems() never carries leadDeposit; cartDeposit() hoists it.
  ```
- `apps/checkout`: `validatedCart` keeps `options` and `leadDeposit` by shape, and the hosted `checkout` payload carries `leadDeposit`. It exports `toolOptions(value)` and `leadDeposit(value)`.

- [ ] **Step 1: The jsdom kit harness.** Create `apps/api/src/store-tools/kit-runtime.testing.ts`:
```ts
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { kitPath } from '@pagosya/storefront-kit';

/** The built kit runtime (kit/commerce.js, business tools included), booted in jsdom for the business-tools specs. jsdom has no
 *  layout; store-tools-browser.spec.ts measures in Chromium. */
const { JSDOM, VirtualConsole } = createRequire(join(__dirname, '../../../checkout/package.json'))('jsdom');
export const KIT = readFileSync(kitPath('commerce.js'), 'utf8');
export type Route = (url: string, init?: any) => Promise<{ ok: boolean; status?: number; body: unknown }>;
/** `query` is the preview page query (?id=…), read by the kit when it boots. */
export type KitOptions = { body?: string; preview?: boolean; cart?: unknown[]; route?: Route; query?: string };
const opened: any[] = [];
export const settle = (ms = 120) => new Promise(resolve => setTimeout(resolve, ms));
export async function closeKits() { await settle(60); while (opened.length) opened.pop().close(); }
export function bootKit(data: Record<string, unknown>, settings: Record<string, unknown> = {}, options: KitOptions = {}) {
  const body = options.body ?? '<section data-pagosya-catalog></section><section data-pagosya-cart></section><p data-pagosya-status></p>';
  const dom = new JSDOM(`<html lang="es"><head></head><body>${body}</body></html>`, { url: 'https://shop.test/', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: new VirtualConsole() });
  const w = dom.window;
  opened.push(w);
  w.HTMLElement.prototype.scrollIntoView = () => {};
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  w.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  w.HTMLDialogElement.prototype.show = function () { this.setAttribute('open', ''); };
  w.HTMLDialogElement.prototype.close = function () { if (!this.hasAttribute('open')) return; this.removeAttribute('open'); this.dispatchEvent(new w.Event('close')); };
  if (options.preview) w.PAGOSYA_PREVIEW = true;
  if (options.cart) w.PAGOSYA_PREVIEW_CART = options.cart;
  if (options.query) w.PAGOSYA_PREVIEW_QUERY = options.query;
  const calls: Array<{ url: string; method: string; body: any }> = [];
  const route: Route = options.route ?? (async url => url.endsWith('/store') ? { ok: true, body: data } : { ok: false, status: 404, body: { message: 'No encontrado' } });
  w.fetch = jest.fn(async (url: string, init?: any) => {
    calls.push({ url, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(init.body) : undefined });
    const result = await route(url, init);
    return { ok: result.ok, status: result.status ?? (result.ok ? 200 : 400), json: async () => result.body };
  });
  w.PAGOSYA_CONFIG = { slug: 'lecheria', apiBaseUrl: 'https://api.test', checkoutOrigin: 'https://pay.test', data, ...settings };
  w.eval(KIT);
  return { w, doc: w.document as Document, calls };
}
export const serialized = (w: any) => { const detail = { items: [] as unknown[] }; w.document.dispatchEvent(new w.CustomEvent('pagosya:serialize-cart', { detail })); return detail.items; };
```

- [ ] **Step 2: Write the failing kit test.** Create `apps/api/src/store-tools/kit-tool-cart.spec.ts`:
```ts
import { bootKit, closeKits, serialized, settle } from './kit-runtime.testing';

/** Business tools part b (spec 2026-10-14): the kit cart counts, shows, steps, caps and serializes unit, builder and deposit lines. */
const LECHE = { id: 'leche', name: 'Leche entera', amount: 720, currency: 'BOB', stock: null, purchaseLimit: null, imageUrls: [], variants: [], extras: [], unit: { label: 'L', step: 0.5, min: 1, max: 100 }, tiers: [{ from: 1, unitAmount: 720 }, { from: 15, unitAmount: 690 }], optionGroups: [] };
const TORTA = { id: 'torta', name: 'Torta', amount: 15000, currency: 'BOB', stock: null, purchaseLimit: null, imageUrls: [], variants: [], extras: [], unit: null, tiers: [], optionGroups: [{ id: 'size', label: 'Tamaño', type: 'single', required: true, choices: [{ id: 's', label: 'Chica', amountDelta: 0 }, { id: 'l', label: 'Grande', amountDelta: 6000 }] }] };
const ANTICIPO = { id: 'deposit_1', name: 'Anticipo', amount: 15000, currency: 'BOB', stock: null, purchaseLimit: null, imageUrls: [], variants: [], extras: [] };
const DATA = { storeName: 'Lechería', checkoutMode: 'payment', items: [LECHE, TORTA, ANTICIPO] };
const DEPOSIT = { leadId: 'lead_1', token: 'A'.repeat(43) };
afterEach(closeKits);
const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

describe('the kit cart with tool lines (spec 2026-10-14, part b)', () => {
  it('20 L counts as one item, shows «20 L» and the tier total, and serializes 40 steps', async () => {
    const { w, doc } = bootKit(DATA, {}, { preview: true, cart: [{ id: 'leche', quantity: 40 }], body: '<a href="#pedido">Mi pedido (<span data-cart-count></span>)</a><section data-pagosya-catalog></section><section data-pagosya-cart></section><p data-pagosya-status></p>' });
    await settle();
    expect(serialized(w)).toEqual([{ id: 'leche', quantity: 40 }]);
    const line = doc.querySelector('[data-pagosya-cart] .order-item')!;
    expect(text(line.querySelector('.quantity output'))).toBe('20 L');
    expect(text(line.querySelector('.order-item__head span'))).toMatch(/Bs\s?138,00/);
    expect(text(line.querySelector('.order-item__unit'))).toMatch(/^20 L · Bs\s?6,90\/L$/);
    expect(line.querySelector('[data-remove]')!.getAttribute('aria-label')).toBe('Quitar 0,5 L de Leche entera');
    expect(doc.querySelector('[data-cart-count]')!.textContent).toBe('1');
  });

  it('steps by 0,5 L and leaves the line at the unit minimum', async () => {
    const { w, doc } = bootKit(DATA, {}, { preview: true, cart: [{ id: 'leche', quantity: 3 }] });
    await settle();
    (doc.querySelector('[data-pagosya-cart] [data-remove]') as HTMLButtonElement).click();
    expect(serialized(w)).toEqual([{ id: 'leche', quantity: 2 }]);
    (doc.querySelector('[data-pagosya-cart] [data-remove]') as HTMLButtonElement).click();
    expect(serialized(w)).toEqual([]);
  });

  it('caps a unit line at max/step, not 99, and below stock counted in steps', async () => {
    const { w } = bootKit(DATA, {}, { preview: true, cart: [{ id: 'leche', quantity: 180 }] });
    await settle();
    expect(serialized(w)).toEqual([{ id: 'leche', quantity: 180 }]);
    const stocked = bootKit({ ...DATA, items: [{ ...LECHE, stock: 50, purchaseLimit: 50 }] }, {}, { preview: true, cart: [{ id: 'leche', quantity: 180 }] });
    await settle();
    expect(serialized(stocked.w)).toEqual([{ id: 'leche', quantity: 50 }]);
  });

  it('keeps a builder line with its choices and drops one the product no longer offers', async () => {
    const { w, doc } = bootKit(DATA, {}, { preview: true, cart: [{ id: 'torta', quantity: 1, options: { size: ['l'] } }, { id: 'torta', quantity: 1, options: { size: ['xl'] } }, { id: 'torta', quantity: 1 }] });
    await settle();
    expect(serialized(w)).toEqual([{ id: 'torta', quantity: 1, options: { size: ['l'] } }]);
    expect(text(doc.querySelector('[data-pagosya-cart] .order-item__option'))).toBe('Tamaño: Grande');
    expect(text(doc.querySelector('[data-pagosya-cart] .order-item__head span'))).toMatch(/Bs\s?210,00/);
  });

  it('keeps a deposit line with its lead, and drops one without a token', async () => {
    const { w, doc } = bootKit(DATA, {}, { preview: true, cart: [{ id: 'deposit_1', quantity: 1, leadDeposit: DEPOSIT }, { id: 'deposit_1', quantity: 1, leadDeposit: { leadId: 'lead_1' } }] });
    await settle();
    expect(serialized(w)).toEqual([{ id: 'deposit_1', quantity: 1, leadDeposit: DEPOSIT }]);
    expect(text(doc.querySelector('[data-pagosya-cart] .order-item__option'))).toBe('Anticipo de tu solicitud');
  });
});
```

- [ ] **Step 3: Run it and see it fail.**
  - Run: `cd apps/api && npx jest src/store-tools/kit-tool-cart.spec.ts`
  - Expected: FAIL. `output` reads `40`, the cap clamps to 99, and the builder and deposit lines are dropped.

- [ ] **Step 4: Edit the parts.**

(a) **`shared/state.js`.**
- After `const products = () => Array.isArray(store.items) ? store.items : [];`, insert:
```js
  // Business tools (spec 2026-10-14): a product sold by unit counts steps in the cart (0,5 L each); a builder product's line
  // carries its choices; a request's deposit line carries its lead. SELLING (business-tools/selling.js) mirrors the
  // server's rules for instant estimates; the server prices every line again.
  const sellingUnit = p => SELLING.unit(p);
  const builderGroups = p => SELLING.groups(p);
  const toolProduct = p => Boolean(p && (p.unit || (Array.isArray(p.optionGroups) && p.optionGroups.length)));
```
- Replace `const limit = (p) => Math.max(0, Math.min(99, p.purchaseLimit ?? 99, p.stock ?? 99));` with:
```js
  // A unit product's cap is its maximum in steps (max/step ≤ 999), not 99; its stock also counts steps.
  const limit = (p) => { const unit = sellingUnit(p), cap = unit ? unit.maxSteps : 99; return Math.max(0, Math.min(cap, p.purchaseLimit ?? cap, p.stock ?? cap)); };
```
- After the `const lineKey = (id, variantId, cadence) => …;` line, insert:
```js
  const optionLineKey = (id, options) => JSON.stringify([id, '', null, null, JSON.parse(SELLING.optionsKey(options) || '[]')]);
  const depositLineKey = (id, deposit) => JSON.stringify([id, '', null, null, null, { leadId: deposit.leadId, token: deposit.token }]);
  const lineTotal = (line, quantity) => line.total ? line.total(quantity) : line.amount * quantity;
  /** A unit line and its words: «20 L», «0,5 L», «20 L · Bs 6,90/L». */
  function unitLine(p, unit, extra) {
    const estimate = quantity => SELLING.estimateLine(p, quantity, null, extra.cadencePercent);
    const units = quantity => `${SELLING.unitsText(quantity * unit.step)} ${unit.label}`;
    return Object.assign({
      p, unit, amount: estimate(unit.minSteps)?.unitAmount ?? price(p),
      total: quantity => estimate(quantity)?.lineAmount ?? 0,
      quantityText: units, stepText: `${SELLING.unitsText(unit.step)} ${unit.label}`,
      unitText: quantity => { const line = estimate(quantity); return `${units(quantity)} · ${money(line?.tier ? line.tier.unitAmount : p.amount, p.currency)}/${unit.label}`; },
    }, extra);
  }
```

(b) **`cart/lines.js`, `cartLine(key)`.**
- Replace `const [id, variantId, keyPicks, cadence] = JSON.parse(key);` with `const [id, variantId, keyPicks, cadence, optionEntries, deposit] = JSON.parse(key);`.
- Right after the next line, `p = products().find(p => p.id === id);`, insert:
```js
        if (Array.isArray(optionEntries)) {
          const options = Object.fromEntries(optionEntries);
          const estimate = p && !p.variants?.length && !sellingUnit(p) ? SELLING.estimateLine(p, 1, options, null) : null;
          if (!estimate || !estimate.options.length) return null;
          return { p, options, optionsLabel: estimate.optionsLabel, name: `${p.name} · ${estimate.optionsLabel}`, amount: estimate.unitAmount };
        }
        if (deposit && typeof deposit === 'object') {
          if (!p || p.variants?.length || p.extras?.length || toolProduct(p) || isMembership(p) || typeof deposit.leadId !== 'string' || typeof deposit.token !== 'string') return null;
          return { p, deposit: { leadId: deposit.leadId, token: deposit.token }, name: `${p.name} · anticipo`, amount: price(p) };
        }
```
- Replace the cadence branch's return:
```js
          return { p, variant, cadence, name: `${variant ? `${p.name} · ${variant.name}` : p.name} · ${CADENCE_TEXT[cadence]}`, amount: subscriptionPrice(p, variant, cadence) };
```
with:
```js
          const unit = sellingUnit(p);
          if (unit) return unitLine(p, unit, { cadence, cadencePercent: offerFor(p, cadence).discountPercent, name: `${p.name} · ${CADENCE_TEXT[cadence]}` });
          if (builderGroups(p).length || p.unit) return null;
          return { p, variant, cadence, name: `${variant ? `${p.name} · ${variant.name}` : p.name} · ${CADENCE_TEXT[cadence]}`, amount: subscriptionPrice(p, variant, cadence) };
```
- After the last guard `if (!p || p.extras?.length || (p.variants?.length && (!variant || !optionGroups(p)))) return null;`, insert:
```js
    const unit = sellingUnit(p);
    if (unit && !variant) return unitLine(p, unit, { name: p.name });
    // A builder product, or a unit product this kit cannot read, is sold only through its tool.
    if (toolProduct(p) && !variant) return null;
```

(c) **`cart/lines.js`, the rest.**
- In `function remaining(p, variant, picks)`, replace `variant ? limit(variant) - variantUnits : 99));` with `variant ? limit(variant) - variantUnits : Infinity));`. `limit(p)` already caps every line, and a unit line may hold up to `maxSteps` (200 for 0,5 L up to 100 L).
- Replace `function cartValue() { return [...cart].reduce((sum, [key, quantity]) => { const line = cartLine(key); return sum + (line?.amount || 0) * quantity; }, 0); }` with:
```js
  function cartValue() { return [...cart].reduce((sum, [key, quantity]) => { const line = cartLine(key); return sum + (line ? lineTotal(line, quantity) : 0); }, 0); }
```
- Replace the `cartItems` and `checkoutItems` definitions:
```js
  const cartItems = () => [...cart].flatMap(([key, quantity]) => {
    const line = cartLine(key);
    return line ? [{ id: line.p.id, ...(line.variant ? { variantId: line.variant.id } : {}), ...(line.picks ? { extraIds: line.picks } : {}), ...(line.cadence ? { subscriptionCadence: line.cadence } : {}), quantity }] : [];
  });
  const checkoutItems = () => cartItems().map(({ id, ...item }) => ({ paymentLinkId: id, ...item }));
```
with:
```js
  const cartItems = () => [...cart].flatMap(([key, quantity]) => {
    const line = cartLine(key);
    return line ? [{ id: line.p.id, ...(line.variant ? { variantId: line.variant.id } : {}), ...(line.picks ? { extraIds: line.picks } : {}), ...(line.cadence ? { subscriptionCadence: line.cadence } : {}), ...(line.options ? { options: line.options } : {}), ...(line.deposit ? { leadDeposit: line.deposit } : {}), quantity }] : [];
  });
  // A deposit's lead travels at the top of the checkout request (plan a), never inside an item.
  const checkoutItems = () => cartItems().map(({ id, leadDeposit: _deposit, ...item }) => ({ paymentLinkId: id, ...item }));
  const cartDeposit = () => cartItems().find(item => item.leadDeposit)?.leadDeposit;
```
- In `restoreCart(items)`, replace the line that starts `const key = item?.subscriptionCadence ?` with:
```js
      const key = item?.leadDeposit && typeof item.leadDeposit === 'object' ? depositLineKey(item.id, item.leadDeposit)
        : item?.options && typeof item.options === 'object' && !Array.isArray(item.options) ? optionLineKey(item.id, item.options)
        : item?.subscriptionCadence ? Array.isArray(item.extraIds) ? '' : lineKey(item.id, item.variantId, item.subscriptionCadence) : Array.isArray(item?.extraIds) ? boxKey(item.id, item.extraIds) : lineKey(item?.id, item?.variantId), line = cartLine(key);
```
- In the same function, replace `if (quantity > 0) cart.set(key, quantity);` with `if (quantity > 0 && quantity >= (line.unit?.minSteps || 1)) cart.set(key, quantity);`. A restored unit line below its minimum (one step of «desde 1 L») would be refused at checkout, so it is dropped.
- In `notifyHostedCart()`, before `if (items.length > 100 || items.some(item => …`, insert:
```js
    const validChoice = options => options && typeof options === 'object' && !Array.isArray(options) && Object.keys(options).length <= 8 && Object.entries(options).every(([key, value]) => /^[a-z0-9][a-z0-9-]{0,31}$/.test(key) && (typeof value === 'string' ? value.length <= 140 : Array.isArray(value) && value.length <= 12 && value.every(id => typeof id === 'string' && /^[a-z0-9][a-z0-9-]{0,31}$/.test(id))));
    const validDeposit = deposit => deposit && typeof deposit === 'object' && /^[a-z0-9_]{6,40}$/.test(deposit.leadId) && /^[A-Za-z0-9_-]{43}$/.test(deposit.token);
```
and inside that `items.some(item => …)` predicate, after `![...item.extraIds].every(validId)))`, add `|| (item.options !== undefined && !validChoice(item.options)) || (item.leadDeposit !== undefined && !validDeposit(item.leadDeposit))`.

(d) **`cart/render.js`, `renderCart()`'s per-line loop.**
- Replace `total += amount * quantity; count += quantity;` with:
```js
      const lineAmount = lineTotal(line, quantity);
      // A unit line is one item in the badge however many litres it holds.
      total += lineAmount; count += line.unit ? 1 : quantity;
```
- Replace:
```js
      const option = [variant ? variant.name : line.extras ? pickLabel(line.extras) : '', line.cadence ? `Suscripción · ${CADENCE_TEXT[line.cadence]}` : ''].filter(Boolean).join(' · ');
```
with:
```js
      const option = [variant ? variant.name : line.extras ? pickLabel(line.extras) : '', line.optionsLabel || '', line.deposit ? 'Anticipo de tu solicitud' : '', line.cadence ? `Suscripción · ${CADENCE_TEXT[line.cadence]}` : ''].filter(Boolean).join(' · ');
```
- Replace `const saved = listUnit > amount ? (listUnit - amount) * quantity : 0;` with `const saved = !line.unit && listUnit > amount ? (listUnit - amount) * quantity : 0;`.
- At the start of `const unitCopy = quantity > 1 || saved || later ?`, replace `const unitCopy = ` with `const unitCopy = line.unit ? \`<p class="order-item__unit">${escape(line.unitText(quantity))}</p>\` : `. The rest of that line stays.
- In `rows.push(…)`:
  - replace `<span>${money(amount * quantity, p.currency)}</span>` with `<span>${money(lineAmount, p.currency)}</span>`;
  - replace `aria-label="Quitar una unidad de ${escape(name)}">−</button><output>${quantity}</output>` with `aria-label="${line.unit ? `Quitar ${escape(line.stepText)} de` : 'Quitar una unidad de'} ${escape(name)}">−</button><output>${line.unit ? escape(line.quantityText(quantity)) : quantity}</output>`;
  - replace `aria-label="Añadir una unidad de ${escape(name)}"` with `aria-label="${line.unit ? `Añadir ${escape(line.stepText)} a` : 'Añadir una unidad de'} ${escape(name)}"`.
- In `lineViews.push({ id, p, name, amount, quantity, image, option,`:
  - add `lineAmount,` after `quantity,`;
  - prefix its `unit:` value with `line.unit ? line.unitText(quantity) : `, so it reads `unit: line.unit ? line.unitText(quantity) : quantity > 1 || saved || later ? …`.

(e) **`templates/kit-templates.js`, `applyLineTemplate`.** Replace `text('line-total', money(view.amount * view.quantity, view.p.currency));` with `text('line-total', money(view.lineAmount ?? view.amount * view.quantity, view.p.currency));`.

(f) **`shared/click-actions.js`.** Replace:
```js
    if (button.hasAttribute("data-remove")) { const id = button.dataset.remove; const quantity = cart.get(id) || 0; if (quantity > 1) cart.set(id, quantity - 1); else cart.delete(id); renderCart(); message("Pedido actualizado."); }
```
with:
```js
    // A unit line steps down to its minimum (2 steps for «desde 1 L» at 0,5 L), then leaves the cart.
    if (button.hasAttribute("data-remove")) { const id = button.dataset.remove; const quantity = cart.get(id) || 0; const floor = cartLine(id)?.unit?.minSteps || 1; if (quantity > floor) cart.set(id, quantity - 1); else cart.delete(id); renderCart(); message("Pedido actualizado."); }
```

(g) **`checkout/submit.js`, `checkout(button)`.** In the cart-checkout `body: JSON.stringify({ … })`, replace `items: checkoutItems(), ...(subscriptionLine ? { subscriptionConsent: true } : {})` with `items: checkoutItems(), ...(cartDeposit() ? { leadDeposit: cartDeposit() } : {}), ...(subscriptionLine ? { subscriptionConsent: true } : {})`.

(h) **Rebuild.** Run `node packages/storefront-kit/tools/build-commerce.mjs`.

- [ ] **Step 5: The hosted parent keeps the choices and the deposit.** In `apps/checkout/src/source-storefront.ts`:
- Replace `type StoredCartItem = { id: string; variantId?: string; quantity: number; extras?: string[]; subscriptionCadence?: Cadence };` with:
```ts
type ToolOptions = Record<string, string[] | string>;
type LeadDeposit = { leadId: string; token: string };
type StoredCartItem = { id: string; variantId?: string; quantity: number; extras?: string[]; subscriptionCadence?: Cadence; options?: ToolOptions; leadDeposit?: LeadDeposit };
const TOOL_ID = /^[a-z0-9][a-z0-9-]{0,31}$/;
/** Builder choices and a request's deposit, by shape only (spec 2026-10-14): the API checks them against the product. */
export const toolOptions = (value: unknown): value is ToolOptions => !!value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length <= 8
  && Object.entries(value as Record<string, unknown>).every(([key, choice]) => TOOL_ID.test(key) && (typeof choice === 'string' ? choice.length <= 140 : Array.isArray(choice) && choice.length <= 12 && choice.every(id => typeof id === 'string' && TOOL_ID.test(id))));
export const leadDeposit = (value: unknown): value is LeadDeposit => !!value && typeof value === 'object' && /^[a-z0-9_]{6,40}$/.test(String((value as LeadDeposit).leadId)) && /^[A-Za-z0-9_-]{43}$/.test(String((value as LeadDeposit).token));
```
- In `validatedCart`, after `if (item.subscriptionCadence !== undefined && !CADENCES.includes(item.subscriptionCadence)) return null;`, add:
```ts
    if (item.options !== undefined && !toolOptions(item.options)) return null;
    if (item.leadDeposit !== undefined && !leadDeposit(item.leadDeposit)) return null;
```
and in its `items.push({ … })`, before the closing `});`, add `...(item.options !== undefined ? { options: item.options } : {}), ...(item.leadDeposit !== undefined ? { leadDeposit: { leadId: item.leadDeposit.leadId, token: item.leadDeposit.token } } : {})`.
- In the hosted request handler's `const payload = checkout || shipping ? { funnelToken: …`, after `items: body.items,`, add `leadDeposit: checkout && leadDeposit(body.leadDeposit) ? { leadId: body.leadDeposit.leadId, token: body.leadDeposit.token } : undefined,`.

- [ ] **Step 6: Write the checkout-side test.** Create `apps/checkout/test/source-storefront-tools.test.ts`:
```ts
import { readFileSync } from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { kitPath } from '@pagosya/storefront-kit';
import { mountPublishedSource, validatedCart } from '../src/source-storefront';
import type { Store } from '../src/api';

vi.mock('../src/privacy', () => ({ privacy: { mount: vi.fn(), analyticsAllowed: () => false } }));
vi.mock('../src/store-funnel', () => ({ createStoreFunnel: () => ({ track: vi.fn(), token: () => undefined, sessionId: () => undefined }) }));
vi.mock('../src/trusted-form', () => ({ collectPersonalFields: vi.fn(async () => ({ name: 'Ana', email: 'ana@mail.com' })), withoutPersonalFields: (_action: string, body: Record<string, unknown>) => { const { name: _n, email: _e, phone: _p, message: _m, ...rest } = body; return rest; } }));
vi.mock('@pagosya/storefront-preview', async importOriginal => ({ ...await importOriginal<typeof import('@pagosya/storefront-preview')>(), createPreviewImageLoader: () => async (snapshot: unknown) => snapshot }));

/** Business tools part b (spec 2026-10-14): the published store's trusted parent passes tool data by shape, nothing personal. */
const DEPOSIT = { leadId: 'lead_1', token: 'A'.repeat(43) };
const store = { storeName: 'Lechería', items: [], categories: [] } as unknown as Store;
const site = () => ({ published: true, snapshot: { schemaVersion: 1, brief: {}, files: [{ path: 'index.html', content: '<h1>Lechería</h1>' }, { path: 'config.js', content: 'window.PAGOSYA_CONFIG = {};' }] } });
const send = (frame: HTMLIFrameElement, data: unknown) => window.dispatchEvent(new MessageEvent('message', { source: frame.contentWindow, origin: 'null', data }));
beforeEach(() => { document.body.innerHTML = '<main id="app"></main>'; window.history.replaceState({}, '', '/s/lecheria'); });
afterEach(() => { window.dispatchEvent(new Event('pagehide')); vi.unstubAllGlobals(); });

describe('hosted cart validation with tool lines', () => {
  it('keeps builder choices and a deposit, and refuses malformed ones', () => {
    expect(validatedCart([{ id: 'torta', quantity: 1, options: { size: ['l'], note: 'Feliz día' } }], 'extraIds')).toEqual([{ id: 'torta', quantity: 1, options: { size: ['l'], note: 'Feliz día' } }]);
    expect(validatedCart([{ id: 'deposit_1', quantity: 1, leadDeposit: DEPOSIT }], 'extraIds')).toEqual([{ id: 'deposit_1', quantity: 1, leadDeposit: DEPOSIT }]);
    expect(validatedCart([{ id: 'torta', quantity: 1, options: { __proto__x: ['a'] } }], 'extraIds')).toBeNull();
    expect(validatedCart([{ id: 'torta', quantity: 1, options: { size: [{ amountDelta: 0 }] } }], 'extraIds')).toBeNull();
    expect(validatedCart([{ id: 'deposit_1', quantity: 1, leadDeposit: { leadId: 'lead_1', token: 'short', amount: 1 } }], 'extraIds')).toBeNull();
  });

  it('the published kit sends a deposit line\'s lead at the top of the checkout, never inside an item', async () => {
    const virtualConsole = new VirtualConsole();
    virtualConsole.on('jsdomError', error => { if (!error.message.includes('Could not parse CSS stylesheet')) throw error; });
    const dom = new JSDOM('<body><section data-pagosya-cart data-checkout-review></section><p data-pagosya-status></p></body>', { runScripts: 'outside-only', virtualConsole });
    const w = dom.window as any;
    const anticipo = { id: 'deposit_1', name: 'Anticipo', amount: 15000, currency: 'BOB', variants: [], extras: [] };
    Object.assign(w, { PAGOSYA_HOSTED: true, PAGOSYA_PREVIEW_CART: [{ id: 'deposit_1', quantity: 1, leadDeposit: DEPOSIT }], PAGOSYA_CONFIG: { slug: 'brujula', data: { storeName: 'Brújula', checkoutMode: 'payment', items: [anticipo], categories: [] }, apiBaseUrl: 'https://api.test' }, PAGOSYA_HOSTED_REQUEST: vi.fn(async () => ({ ok: true, body: {} })), matchMedia: () => ({ matches: true }) });
    w.HTMLElement.prototype.scrollIntoView = () => {};
    w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
    w.HTMLDialogElement.prototype.close = function () { this.open = false; };
    Object.defineProperty(w, 'parent', { value: { postMessage: vi.fn() } });
    w.eval(readFileSync(kitPath('commerce.js'), 'utf8'));
    w.document.querySelector('[data-pay]').click();
    await new Promise(resolve => setTimeout(resolve));
    const [action, body] = w.PAGOSYA_HOSTED_REQUEST.mock.calls[0];
    expect(action).toBe('checkout');
    expect(body.leadDeposit).toEqual(DEPOSIT);
    expect(body.items).toEqual([{ paymentLinkId: 'deposit_1', quantity: 1 }]);
    dom.window.close();
  });

  it('the parent sends the deposit with the checkout and nothing else the frame added', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => site() }));
    const onPayment = vi.fn(async () => {});
    await mountPublishedSource(document.querySelector('#app')!, 'lecheria', store, onPayment, false);
    const frame = document.querySelector('iframe')!;
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ clientSecret: 'secret' }) } as Response);
    send(frame, { type: 'pagosya:hosted-request', id: 1, action: 'checkout', body: { items: [{ paymentLinkId: 'deposit_1', quantity: 1 }], leadDeposit: DEPOSIT, amount: 1 } });
    await vi.waitFor(() => expect(onPayment).toHaveBeenCalledWith('secret'));
    const body = JSON.parse(vi.mocked(fetch).mock.calls.at(-1)![1]!.body as string);
    expect(body.leadDeposit).toEqual(DEPOSIT);
    expect(body).not.toHaveProperty('amount');
  });
});
```

- [ ] **Step 7: Run everything and see it pass.**
  - Run: `cd apps/api && npx jest src/store-tools/kit-tool-cart.spec.ts src/storefront-source/source-commerce-surfaces-draw.spec.ts src/storefront-source/source-commerce-cascade.spec.ts --maxWorkers=2`. Expected: PASS. The existing kit specs set no unit, builder or deposit products.
  - Run: `cd apps/checkout && npx vitest run test/source-storefront-tools.test.ts test/source-storefront-subscription.test.ts test/source-cart.test.ts`. Expected: PASS.
  - Run: `node --test packages/storefront-kit/tools/build-commerce.test.mjs && node packages/storefront-kit/kit/check-runtimes.mjs`. Expected: PASS, and every runtime parses.

- [ ] **Step 8: Commit.**
```bash
git add packages/storefront-kit/commerce-src/shared/state.js packages/storefront-kit/commerce-src/cart/lines.js packages/storefront-kit/commerce-src/cart/render.js packages/storefront-kit/commerce-src/templates/kit-templates.js packages/storefront-kit/commerce-src/shared/click-actions.js packages/storefront-kit/commerce-src/checkout/submit.js packages/storefront-kit/kit/commerce.js apps/checkout/src/source-storefront.ts apps/api/src/store-tools/kit-runtime.testing.ts apps/api/src/store-tools/kit-tool-cart.spec.ts apps/checkout/test/source-storefront-tools.test.ts
git commit -m "feat(tools): the kit cart carries unit, builder and deposit lines; the hosted parent passes them by shape

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The mount, the shared rules, and the quantity calculator

**Existing code:**
- **`shared/state.js`, `const request = async (url, options) => {`.** Its two lines:
  ```js
    const action = url.endsWith('/cart-checkout') ? 'checkout' : url.endsWith('/leads') ? 'lead' : url.endsWith('/shipping/quote') ? 'shipping' : url.includes('/content/reviews') ? 'review' : url.includes('/content') ? 'content' : 'catalog';
    const result = await window.PAGOSYA_HOSTED_REQUEST(action, options?.body ? JSON.parse(options.body) : url.includes('/content') ? { locale: document.documentElement.lang || 'es' } : {});
  ```
- **`catalog/render.js`, `render()`.** Calls `renderCart();` then `renderContact();`.
- **`build-commerce.mjs` `PARTS`.** Has `'cart/lines.js',\n  'product/dialog-style.js',`.
- **`apps/checkout/src/source-storefront.ts`.**
  - The action whitelist `['checkout', 'lead', 'catalog', 'shipping', 'content', 'review', 'retention', 'assistant'].includes(data.action)`.
  - The line `const reply = (ok: boolean, body: unknown) => target.postMessage(…);` before the `pending` guard.

**Files:**
- Create (parts): `packages/storefront-kit/commerce-src/business-tools/shared.js`, `calculator.js`, `mount.js`
- Modify (parts): `packages/storefront-kit/commerce-src/shared/state.js`, `catalog/render.js`
- Modify: `packages/storefront-kit/tools/build-commerce.mjs`, then (generated) `kit/commerce.js`
- Modify: `apps/checkout/src/source-storefront.ts`
- Create (tests): `apps/api/src/store-tools/kit-tools-mount.spec.ts`, `apps/api/src/store-tools/store-tools-browser.spec.ts`
- Modify (test): `apps/checkout/test/source-storefront-tools.test.ts` (append)

**Interfaces:**
- Produces (commerce IIFE scope):
  ```js
  const TOOL_RENDERERS = {};                          // kind → renderer(host, tool, ctx); each renderer part registers itself
  function toolFrame(host, tool, ctx) → { id, body, status(text), error(text) }
  function toolQuoteLoop(ctx, view, button) → update(items|null, estimate, paint)
  function calculatorTool(host, tool, ctx)            // TOOL_RENDERERS.calculator
  function mountTools()                               // called from render()
  function toolContext(tool) → ctx                    // { live, preview, hosted, locked, money, escape, limit, product(id), subscriptionsOn, quote(items), addLine(item, button), formToken(id), submitRequest(body), startDeposit(deposit, leadId, button) }
  ```
- DOM hooks:
  - `[data-tool-units]`, `[data-tool-step="-1"|"1"]` and `[data-tool-preset]`;
  - `[data-tool-total]`, `[data-tool-tier]`, `[data-tool-next]` and `[data-tool-tiers]`;
  - `[data-tool-add]`, `[data-tool-draft]`, `[data-tool-status]` and `[data-tool-error]`.
- Hosted actions:
  - `quote` (POST `price-quote`) and `tool-form` (GET `tools/:id/form-token`).
  - Both are answered without the trusted dialog and without the one-at-a-time guard.

- [ ] **Step 1: Write the failing jsdom tests.** Create `apps/api/src/store-tools/kit-tools-mount.spec.ts`:
```ts
import { bootKit, closeKits, serialized, settle } from './kit-runtime.testing';

/** Business tools part b (spec 2026-10-14): where tools render, the draft banner, hiding, quote replacement, and the calculator. */
const LECHE = { id: 'leche', name: 'Leche entera', amount: 720, currency: 'BOB', stock: null, purchaseLimit: null, imageUrls: [], variants: [], extras: [], unit: { label: 'L', step: 0.5, min: 1, max: 100 }, tiers: [{ from: 1, unitAmount: 720 }, { from: 15, unitAmount: 690 }, { from: 30, unitAmount: 650 }], optionGroups: [] };
const TOOL = { id: 'tl0123456789abcdef01', kind: 'calculator', status: 'approved', title: 'Calcula tu leche', words: { cta: 'Añadir', total: 'Total', saving: 'ahorras' }, layout: 'card', calculator: { productId: 'leche', presets: [10, 20, 30], showTiers: true } };
const MOUNT = '<main><section data-pagosya-tool-section><div data-pagosya-tool="tl0123456789abcdef01"></div></section></main><section data-pagosya-cart></section><p data-pagosya-status></p>';
afterEach(closeKits);
const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
const data = (tools: unknown[], items: unknown[] = [LECHE], extra: Record<string, unknown> = {}) => ({ storeName: 'Lechería', checkoutMode: 'payment', items, tools, ...extra });
/** The server's quote for one milk line of `steps` (690/L from 15 L, 650/L from 30 L). */
const quoteOf = (steps: number) => { const per = steps >= 60 ? 325 : steps >= 30 ? 345 : 360; return { currency: 'BOB', subtotal: per * steps, discountAmount: 0, total: per * steps, lines: [{ paymentLinkId: 'leche', quantity: steps, unitAmount: per, lineAmount: per * steps, quantityLabel: `${steps / 2} L`, unit: { label: 'L', step: 0.5, units: steps / 2 }, tier: steps >= 60 ? { from: 30, unitAmount: 650 } : steps >= 30 ? { from: 15, unitAmount: 690 } : null, nextTier: steps >= 60 ? null : steps >= 30 ? { from: 30, unitAmount: 650, unitsToGo: 30 - steps / 2 } : { from: 15, unitAmount: 690, unitsToGo: 15 - steps / 2 }, saving: (360 - per) * steps, lockedUnitAmount: null, options: [] }] }; };
function boot(payload: Record<string, unknown>, options: { preview?: boolean; failQuote?: boolean } = {}) {
  return bootKit(payload, {}, { body: MOUNT, preview: options.preview, route: async (url: string, init: any) => url.endsWith('/store') ? { ok: true, body: payload }
    : url.endsWith('/price-quote') ? options.failQuote ? { ok: false, status: 503, body: { message: 'caído' } } : { ok: true, body: quoteOf(JSON.parse(init.body).items[0].quantity) } : { ok: false, body: {} } });
}
const host = (doc: Document) => doc.querySelector('[data-pagosya-tool]') as HTMLElement;

describe('tool mounts (spec 2026-10-14, part b)', () => {
  it('an approved tool renders on the live store; the server quote replaces the estimate', async () => {
    const { doc, calls } = boot(data([TOOL]));
    await settle(500);
    expect(host(doc).hidden).toBe(false);
    expect(text(host(doc).querySelector('.pyt-title'))).toBe('Calcula tu leche');
    expect(host(doc).querySelector('[data-tool-draft]')).toBeNull();
    expect(text(host(doc).querySelector('[data-tool-total]'))).toMatch(/Bs\s?72,00/);
    expect(calls.find(call => call.url.endsWith('/price-quote'))!.body).toEqual({ items: [{ paymentLinkId: 'leche', quantity: 20 }] });
  });

  it('a failed quote disables the add button with a plain message', async () => {
    const { doc } = boot(data([TOOL]), { failQuote: true });
    await settle(500);
    expect((host(doc).querySelector('[data-tool-add]') as HTMLButtonElement).disabled).toBe(true);
    expect(text(host(doc).querySelector('[role=alert]'))).toBe('No pudimos confirmar el precio. Revisa tu conexión y vuelve a intentarlo.');
  });

  it('a draft renders only in preview, with the banner and no add, and never calls the API there', async () => {
    const live = boot(data([{ ...TOOL, status: 'draft' }]));
    await settle(400);
    expect(host(live.doc).hidden).toBe(true);
    expect(host(live.doc).innerHTML).toBe('');
    const preview = boot(data([{ ...TOOL, status: 'draft' }]), { preview: true });
    await settle(400);
    expect(text(host(preview.doc).querySelector('[data-tool-draft]'))).toBe('Números por aprobar · solo tú ves esta herramienta');
    expect((host(preview.doc).querySelector('[data-tool-add]') as HTMLButtonElement).disabled).toBe(true);
    expect(text(host(preview.doc).querySelector('[data-tool-add]'))).toBe('Disponible al aprobar');
    expect(text(host(preview.doc).querySelector('[data-tool-total]'))).toMatch(/Bs\s?72,00/);
    expect(preview.calls.some(call => call.url.endsWith('/price-quote'))).toBe(false);
  });

  it('a draft previews the proposed numbers the owner\'s catalog carries', async () => {
    const proposed = { ...LECHE, unit: null, tiers: [], proposal: { toolId: TOOL.id, unit: LECHE.unit, tiers: LECHE.tiers } };
    const { doc } = boot(data([{ ...TOOL, status: 'draft' }], [proposed]), { preview: true });
    await settle(300);
    expect(host(doc).hidden).toBe(false);
    expect((host(doc).querySelector('[data-tool-units]') as HTMLInputElement).value).toBe('10');
  });

  it.each([
    ['hidden', data([{ ...TOOL, status: 'hidden' }])],
    ['missing from the payload', data([])],
    ['its product gone', data([TOOL], [])],
    ['its product sold out', data([TOOL], [{ ...LECHE, stock: 0, purchaseLimit: 0 }])],
    ['its product now with variants', data([TOOL], [{ ...LECHE, variants: [{ id: 'v', name: 'V', amount: 720 }] }])],
    ['a store that does not charge with pagosYa', data([TOOL], [LECHE], { checkoutMode: 'whatsapp' })],
  ])('renders nothing, and hides its section, when %s', async (_name, payload) => {
    const { doc } = boot(payload);
    await settle(200);
    expect(host(doc).hidden).toBe(true);
    expect(host(doc).childElementCount).toBe(0);
    expect((doc.querySelector('[data-pagosya-tool-section]') as HTMLElement).hidden).toBe(true);
  });

  it('uses config.tools only when the payload has no tools, and never a draft from it on the live store', async () => {
    const payload = { storeName: 'Lechería', checkoutMode: 'payment', items: [LECHE] };
    const kit = bootKit(payload, { tools: [{ ...TOOL, status: 'draft' }] }, { body: MOUNT });
    await settle(200);
    expect(host(kit.doc).hidden).toBe(true);
  });
});

describe('calculator (spec 2026-10-14, part b)', () => {
  it('starts at the first preset with the tiers listed and the next tier', async () => {
    const { doc } = boot(data([TOOL]));
    await settle(500);
    expect((doc.querySelector('[data-tool-units]') as HTMLInputElement).value).toBe('10');
    expect((doc.querySelector('[data-tool-tier]') as HTMLElement).hidden).toBe(true);
    expect(text(doc.querySelector('[data-tool-next]'))).toMatch(/^5 L más para Bs\s?6,90\/L$/);
    expect([...doc.querySelectorAll('[data-tool-tiers] li')].map(text)).toEqual([expect.stringMatching(/^Desde 1 L · Bs\s?7,20\/L$/), expect.stringMatching(/^Desde 15 L · Bs\s?6,90\/L$/), expect.stringMatching(/^Desde 30 L · Bs\s?6,50\/L$/)]);
    expect(text(doc.querySelector('[data-tool-add]'))).toBe('Añadir 10 L');
  });

  it('a preset moves to 20 L: «Desde 15 L: Bs 6,90/L — ahorras Bs 6,00», «10 L más para Bs 6,50/L»; the button sets the line', async () => {
    const { w, doc } = boot(data([TOOL]));
    await settle(400);
    (doc.querySelector('[data-tool-preset="40"]') as HTMLButtonElement).click();
    await settle(400);
    expect(doc.querySelector('[data-tool-preset="40"]')!.getAttribute('aria-pressed')).toBe('true');
    expect(text(doc.querySelector('[data-tool-total]'))).toMatch(/Bs\s?138,00/);
    expect(text(doc.querySelector('[data-tool-tier]'))).toMatch(/^Desde 15 L: Bs\s?6,90\/L — ahorras Bs\s?6,00$/);
    expect(text(doc.querySelector('[data-tool-next]'))).toMatch(/^10 L más para Bs\s?6,50\/L$/);
    (doc.querySelector('[data-tool-add]') as HTMLButtonElement).click();
    expect(serialized(w)).toEqual([{ id: 'leche', quantity: 40 }]);
    expect(text(doc.querySelector('[data-tool-status]'))).toBe('20 L de Leche entera añadido a tu pedido.');
    (doc.querySelector('[data-tool-preset="20"]') as HTMLButtonElement).click();
    (doc.querySelector('[data-tool-add]') as HTMLButtonElement).click();
    expect(serialized(w)).toEqual([{ id: 'leche', quantity: 20 }]);
  });

  it('the steppers move 0,5 L and stop at the limits; a typed amount off the range is refused and announced', async () => {
    const { w, doc } = boot(data([{ ...TOOL, calculator: { productId: 'leche', presets: [], showTiers: false } }]));
    await settle(400);
    const input = doc.querySelector('[data-tool-units]') as HTMLInputElement;
    expect(input.value).toBe('1');
    expect((doc.querySelector('[data-tool-step="-1"]') as HTMLButtonElement).disabled).toBe(true);
    (doc.querySelector('[data-tool-step="1"]') as HTMLButtonElement).click();
    expect(input.value).toBe('1,5');
    input.value = '250';
    input.dispatchEvent(new (w as any).Event('change'));
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(text(doc.querySelector('[data-tool-error]'))).toBe('Elige entre 1 y 100 L.');
    expect((doc.querySelector('[data-tool-add]') as HTMLButtonElement).disabled).toBe(true);
    input.value = '14,5';
    input.dispatchEvent(new (w as any).Event('change'));
    expect(input.getAttribute('aria-invalid')).toBe('false');
    expect(text(doc.querySelector('[data-tool-add]'))).toBe('Añadir 14,5 L');
  });
});
```

- [ ] **Step 2: Run it and see it fail.**
  - Run: `cd apps/api && npx jest src/store-tools/kit-tools-mount.spec.ts`
  - Expected: FAIL. Nothing is mounted (`.pyt-title` is null) and the host stays visible and empty.

- [ ] **Step 3: Write the shared part.** Create `packages/storefront-kit/commerce-src/business-tools/shared.js`:
```js
  // Business tools (spec 2026-10-14, part b): what the four tool renderers share. Each renderer part registers itself in
  // TOOL_RENDERERS; mount.js draws [data-pagosya-tool] and gives a renderer its context (ctx). Styling comes from the store's
  // look (--lk-*, data-look-edge) and DNA buttons (.checkout-button); steppers are .quantity groups, so the store's control
  // language draws them. Every rule keys on [data-pagosya-tool].
  const TOOL_RENDERERS = {};
  const TOOL_CSS = [
    '[data-pagosya-tool]{display:block;margin:clamp(24px,4vw,48px) auto;max-width:960px;color:inherit;font:inherit}',
    '[data-pagosya-tool][hidden]{display:none}',
    '[data-pagosya-tool] .pyt-panel{box-sizing:border-box;display:grid;gap:16px;max-width:720px;min-width:0;padding:clamp(18px,3vw,32px);border-radius:var(--lk-rc,var(--kit-radius-panel,16px));background:var(--lk-paper,var(--kit-paper,transparent));color:var(--lk-ink,var(--kit-ink,inherit))}',
    '[data-tool-layout=card] .pyt-panel{border:1px solid var(--kit-line,currentColor);box-shadow:0 18px 40px -28px rgba(0,0,0,.45)}',
    '[data-tool-layout=inline] .pyt-panel{padding-inline:0;background:transparent;box-shadow:none}',
    '[data-tool-layout=split] .pyt-panel{grid-template-columns:minmax(0,1fr) minmax(0,1fr);max-width:960px;align-items:start}',
    '[data-tool-layout=split] .pyt-head,[data-tool-layout=split] .pyt-status,[data-tool-layout=split] .pyt-error{grid-column:1/-1}',
    ':root[data-look-edge=hairline] [data-pagosya-tool] .pyt-panel,:root[data-look-edge=outline] [data-pagosya-tool] .pyt-panel{border:1px solid var(--lk-ink,currentColor)}',
    ':root[data-look-edge=offset] [data-pagosya-tool] .pyt-panel{box-shadow:6px 6px 0 var(--lk-ink,currentColor)}',
    '[data-pagosya-tool] .pyt-head{display:grid;gap:8px}',
    '[data-pagosya-tool] .pyt-body{display:grid;gap:14px;min-width:0}',
    '[data-pagosya-tool] .pyt-title{margin:0;font-family:var(--lk-hf,var(--store-heading-font,inherit));font-weight:var(--lk-hw,700);font-size:clamp(22px,3vw,30px);line-height:1.15}',
    '[data-pagosya-tool] .pyt-intro,[data-pagosya-tool] .pyt-note{margin:0;line-height:1.55;max-width:60ch}',
    '[data-pagosya-tool] .pyt-draft{margin:0;padding:8px 12px;border:1px dashed currentColor;border-radius:8px;font-size:14px;font-weight:600}',
    '[data-pagosya-tool] label,[data-pagosya-tool] legend{font-weight:600}',
    '[data-pagosya-tool] fieldset{display:grid;gap:8px;min-width:0;margin:0;padding:0;border:0}',
    '[data-pagosya-tool] .pyt-field{display:grid;gap:6px;min-width:0}',
    '[data-pagosya-tool] .pyt-choice{display:flex;align-items:center;gap:10px;min-height:44px;font-weight:400}',
    '[data-pagosya-tool] .pyt-choice input{width:20px;height:20px;min-height:0;margin:0}',
    '[data-pagosya-tool] input:not([type=radio]):not([type=checkbox]),[data-pagosya-tool] select,[data-pagosya-tool] textarea{box-sizing:border-box;width:100%;min-width:0;min-height:44px;padding:10px 12px;border:1px solid currentColor;border-radius:var(--lk-rb,var(--kit-radius,8px));background:transparent;color:inherit;font:inherit}',
    '[data-pagosya-tool] [aria-invalid=true]{outline:2px solid #b42318;outline-offset:2px}',
    '[data-pagosya-tool] .pyt-stepper{display:grid;grid-template-columns:44px minmax(72px,140px) 44px;align-items:center;gap:6px;max-width:100%}',
    '[data-pagosya-tool] .pyt-stepper>button,[data-pagosya-tool] .pyt-chip,[data-pagosya-tool] .pyt-nav button{min-width:44px;min-height:44px;font:inherit;cursor:pointer}',
    '[data-pagosya-tool] .pyt-stepper input{text-align:center}',
    '[data-pagosya-tool] .pyt-chips{display:flex;flex-wrap:wrap;gap:8px}',
    '[data-pagosya-tool] .pyt-chip{padding:8px 14px;border:1px solid currentColor;border-radius:999px;background:transparent;color:inherit}',
    '[data-pagosya-tool] .pyt-chip[aria-pressed=true]{background:var(--store-accent,var(--kit-accent,currentColor));color:var(--store-accent-foreground,var(--kit-on-accent,#fff));border-color:transparent}',
    '[data-pagosya-tool] .pyt-total{display:flex;justify-content:space-between;align-items:baseline;gap:12px;margin:0;font-size:clamp(20px,2.6vw,26px);font-variant-numeric:tabular-nums}',
    '[data-pagosya-tool] .pyt-summary{display:grid;gap:6px;margin:0;padding:12px;border:1px solid var(--kit-line,currentColor);border-radius:var(--lk-rc,12px)}',
    '[data-pagosya-tool] .pyt-summary div{display:flex;justify-content:space-between;gap:12px}',
    '[data-pagosya-tool] .pyt-summary dt{font-weight:600}',
    '[data-pagosya-tool] .pyt-summary dd{margin:0;text-align:right;overflow-wrap:anywhere}',
    '[data-pagosya-tool] .pyt-nav{display:flex;gap:10px;justify-content:space-between}',
    '[data-pagosya-tool] .pyt-add{width:100%;min-height:48px}',
    '[data-pagosya-tool] .pyt-error,[data-pagosya-tool] .pyt-status{margin:0}',
    '[data-pagosya-tool] .pyt-error{color:#b42318;font-weight:600}',
    '[data-pagosya-tool] .pyt-error:empty,[data-pagosya-tool] .pyt-status:empty{display:none}',
    '[data-pagosya-tool] .pyt-hp{position:absolute;left:-10000px;top:auto;width:1px;height:1px;overflow:hidden}',
    '[data-pagosya-tool] :focus-visible{outline:3px solid currentColor;outline-offset:3px}',
    '@media (max-width:640px){[data-tool-layout=split] .pyt-panel{grid-template-columns:minmax(0,1fr)}[data-pagosya-tool] .pyt-stepper{grid-template-columns:44px minmax(0,1fr) 44px;width:100%}}',
    '@media (prefers-reduced-motion:reduce){[data-pagosya-tool] *{transition:none!important;animation:none!important}}',
  ].join('');
  let toolSerial = 0;
  /** The panel every tool draws into: heading, intro, the merchant-only draft banner, a polite status and an alert. */
  function toolFrame(host, tool, ctx) {
    if (!document.getElementById('pagosya-tools-style')) {
      const style = document.createElement('style');
      style.id = 'pagosya-tools-style';
      style.textContent = TOOL_CSS;
      document.head.appendChild(style);
    }
    const id = 'pyt-' + (++toolSerial);
    host.setAttribute('data-tool-kind', tool.kind);
    host.setAttribute('data-tool-layout', tool.layout || 'card');
    const named = tool.title ? `aria-labelledby="${id}-title"` : `aria-label="${ctx.escape(tool.words.cta)}"`;
    host.innerHTML = `<section class="pyt-panel" ${named}><div class="pyt-head">`
      + (tool.status === 'draft' ? '<p class="pyt-draft" data-tool-draft>Números por aprobar · solo tú ves esta herramienta</p>' : '')
      + (tool.title ? `<h2 class="pyt-title" id="${id}-title">${ctx.escape(tool.title)}</h2>` : '')
      + (tool.intro ? `<p class="pyt-intro">${ctx.escape(tool.intro)}</p>` : '')
      + `</div><div class="pyt-body" data-tool-body></div><p class="pyt-status" role="status" aria-live="polite" data-tool-status></p><p class="pyt-error" role="alert" id="${id}-error" data-tool-error></p></section>`;
    const status = host.querySelector('[data-tool-status]'), error = host.querySelector('[data-tool-error]');
    return { id, body: host.querySelector('[data-tool-body]'), status: value => { status.textContent = value || ''; }, error: value => { error.textContent = value || ''; } };
  }
  /** The shown total (spec part b, shared rules): the local estimate at once, then the server's price quote after 200 ms.
   *  A newer change cancels an older quote; a failed quote disables the button with a plain message. `items` null means the
   *  choice is not complete yet: no quote, and the button stays as it is. */
  function toolQuoteLoop(ctx, view, button) {
    let timer = 0, round = 0;
    return function update(items, estimate, paint) {
      round += 1;
      const mine = round;
      clearTimeout(timer);
      view.error('');
      if (estimate) paint(estimate);
      if (!items) return;
      button.disabled = Boolean(ctx.locked);
      if (!ctx.live) return;
      timer = setTimeout(() => {
        ctx.quote(items).then(quote => { if (mine === round) paint(quote); }, () => {
          if (mine !== round) return;
          button.disabled = true;
          view.error('No pudimos confirmar el precio. Revisa tu conexión y vuelve a intentarlo.');
        });
      }, 200);
    };
  }
```

- [ ] **Step 4: Write the calculator part.** Create `packages/storefront-kit/commerce-src/business-tools/calculator.js`:
```js
  // Business tools (spec 2026-10-14, part b): the quantity calculator. A unit stepper and preset chips, a live total, the
  // tier that applies («Desde 15 L: Bs 6,90/L — ahorras Bs 6,00») and the next one («10 L más para Bs 6,50/L»), and a button
  // that sets the cart line to the chosen amount («Añadir 20 L»).
  function calculatorTool(host, tool, ctx) {
    const p = ctx.product(tool.calculator.productId), unit = SELLING.unit(p);
    if (!unit) { host.hidden = true; return; }
    const view = toolFrame(host, tool, ctx);
    const esc = ctx.escape, label = unit.label, unitsOf = steps => SELLING.unitsText(steps * unit.step);
    const maxSteps = Math.min(unit.maxSteps, ctx.limit(p));
    const presets = (tool.calculator.presets || []).map(units => Math.round(units / unit.step)).filter(steps => steps >= unit.minSteps && steps <= maxSteps);
    const tiers = SELLING.tiers(p, unit);
    const inputId = view.id + '-units';
    view.body.innerHTML = `<div class="pyt-field"><label for="${inputId}">Cantidad (${esc(label)})</label>`
      + `<div class="quantity pyt-stepper" role="group" aria-label="Cantidad en ${esc(label)}">`
      + `<button type="button" data-tool-step="-1" aria-label="Quitar ${esc(unitsOf(1) + ' ' + label)}">−</button>`
      + `<input id="${inputId}" type="text" inputmode="decimal" autocomplete="off" aria-describedby="${view.id}-error" data-tool-units>`
      + `<button type="button" data-tool-step="1" aria-label="Añadir ${esc(unitsOf(1) + ' ' + label)}">+</button></div></div>`
      + (presets.length ? `<div class="pyt-chips" role="group" aria-label="Cantidades sugeridas">${presets.map(steps => `<button type="button" class="pyt-chip" data-tool-preset="${steps}" aria-pressed="false">${esc(unitsOf(steps) + ' ' + label)}</button>`).join('')}</div>` : '')
      + `<p class="pyt-total"><span>${esc(tool.words.total || 'Total')}</span><strong data-tool-total></strong></p>`
      + '<p class="pyt-note" data-tool-tier hidden></p><p class="pyt-note" data-tool-next hidden></p>'
      + (tool.calculator.showTiers && tiers.length > 1 ? `<ul class="pyt-note pyt-tiers" data-tool-tiers>${tiers.map(tier => `<li>Desde ${esc(SELLING.unitsText(tier.from) + ' ' + label)} · ${esc(ctx.money(tier.unitAmount, p.currency))}/${esc(label)}</li>`).join('')}</ul>` : '')
      + '<button type="button" class="checkout-button pyt-add" data-tool-add></button>';
    const input = view.body.querySelector('[data-tool-units]'), add = view.body.querySelector('[data-tool-add]');
    const down = view.body.querySelector('[data-tool-step="-1"]'), up = view.body.querySelector('[data-tool-step="1"]');
    const total = view.body.querySelector('[data-tool-total]'), tierNote = view.body.querySelector('[data-tool-tier]'), nextNote = view.body.querySelector('[data-tool-next]');
    const requote = toolQuoteLoop(ctx, view, add);
    let steps = presets.length ? presets[0] : unit.minSteps;
    function paint(result) {
      const line = result.lines ? result.lines[0] : result;
      total.textContent = ctx.money(result.lines ? result.total : result.lineAmount, p.currency);
      tierNote.hidden = !line.tier;
      tierNote.textContent = line.tier ? `Desde ${SELLING.unitsText(line.tier.from)} ${label}: ${ctx.money(line.tier.unitAmount, p.currency)}/${label}${line.saving > 0 ? ` — ${tool.words.saving || 'ahorras'} ${ctx.money(line.saving, p.currency)}` : ''}` : '';
      nextNote.hidden = !line.nextTier;
      nextNote.textContent = line.nextTier ? `${SELLING.unitsText(line.nextTier.unitsToGo)} ${label} más para ${ctx.money(line.nextTier.unitAmount, p.currency)}/${label}` : '';
    }
    function update() {
      input.value = unitsOf(steps);
      input.setAttribute('aria-invalid', 'false');
      down.disabled = steps <= unit.minSteps;
      up.disabled = steps >= maxSteps;
      host.querySelectorAll('[data-tool-preset]').forEach(chip => chip.setAttribute('aria-pressed', String(Number(chip.getAttribute('data-tool-preset')) === steps)));
      add.textContent = ctx.locked ? 'Disponible al aprobar' : `${tool.words.cta} ${unitsOf(steps)} ${label}`;
      requote([{ productId: p.id, quantity: steps }], SELLING.estimateLine(p, steps, null, null), paint);
      if (ctx.locked) add.disabled = true;
    }
    function refuse() {
      input.setAttribute('aria-invalid', 'true');
      add.disabled = true;
      view.error(`Elige entre ${SELLING.unitsText(unit.min)} y ${SELLING.unitsText(Math.min(unit.max, maxSteps * unit.step))} ${label}.`);
    }
    down.addEventListener('click', () => { if (steps > unit.minSteps) { steps -= 1; update(); } });
    up.addEventListener('click', () => { if (steps < maxSteps) { steps += 1; update(); } });
    input.addEventListener('keydown', event => {
      if (event.key === 'ArrowUp' && steps < maxSteps) { event.preventDefault(); steps += 1; update(); }
      if (event.key === 'ArrowDown' && steps > unit.minSteps) { event.preventDefault(); steps -= 1; update(); }
    });
    input.addEventListener('change', () => {
      const units = Number(String(input.value).trim().replace(',', '.'));
      const wanted = Math.round(units / unit.step);
      if (!Number.isFinite(units) || Math.abs(wanted * unit.step - units) > 1e-9 || wanted < unit.minSteps || wanted > maxSteps) { refuse(); return; }
      steps = wanted;
      update();
    });
    host.querySelectorAll('[data-tool-preset]').forEach(chip => chip.addEventListener('click', () => { steps = Number(chip.getAttribute('data-tool-preset')); update(); }));
    add.addEventListener('click', () => {
      if (ctx.locked) return;
      const result = ctx.addLine({ productId: p.id, quantity: steps }, add);
      if (result.ok) view.status(result.message); else view.error(result.message);
    });
    update();
  }
  TOOL_RENDERERS.calculator = calculatorTool;
```

- [ ] **Step 5: Write the mount part.** Create `packages/storefront-kit/commerce-src/business-tools/mount.js`:
```js
  // Business tools (spec 2026-10-14, part b). [data-pagosya-tool="<id>"] mounts one of the four renderers. Live and hosted
  // stores take approved definitions from the store payload (store.tools); previews also show drafts, with a merchant-only
  // banner and no way to add. A missing, unpublished or sold-out product hides its tool, and the section around it.
  const toolsLive = () => !preview && !config.demo;
  const mountedTools = new WeakMap();
  function toolDefinitions() {
    const list = Array.isArray(store.tools) ? store.tools : Array.isArray(config.tools) ? config.tools : [];
    return list.filter(tool => tool && typeof tool.id === 'string' && typeof TOOL_RENDERERS[tool.kind] === 'function' && (tool.status === 'approved' || (tool.status === 'draft' && preview)));
  }
  const toolProductId = tool => tool.calculator?.productId || tool.subscribe?.productId || tool.builder?.productId || '';
  /** A draft previews the proposed numbers (the owner's catalog carries them as `proposal`); a live tool uses the live rules. */
  function toolProductFor(tool, id) {
    const p = products().find(item => item.id === id);
    if (!p || tool.status !== 'draft' || !p.proposal) return p;
    const proposal = p.proposal;
    return { ...p, unit: proposal.unit || p.unit, tiers: proposal.tiers || p.tiers, optionGroups: proposal.optionGroups || p.optionGroups,
      subscriptionOptions: proposal.subscription ? proposal.subscription.cadences.map(cadence => ({ cadence, discountPercent: proposal.subscription.discountPercent })) : p.subscriptionOptions };
  }
  function toolUsable(tool) {
    if (tool.kind === 'request') return Boolean(tool.request?.fields?.length);
    const p = toolProductFor(tool, toolProductId(tool));
    if (!p || isMembership(p) || store.checkoutMode !== 'payment' || limit(p) <= 0) return false;
    if (tool.kind === 'calculator') return Boolean(sellingUnit(p));
    if (tool.kind === 'subscribe') return (tool.status === 'draft' || subscriptionsAvailable()) && p.fulfillmentType !== 'DIGITAL' && (p.subscriptionOptions || []).some(option => tool.subscribe.cadences.includes(String(option.cadence).toLowerCase()));
    const groups = builderGroups(p);
    return !sellingUnit(p) && tool.builder.steps.length > 0 && tool.builder.steps.every(id => groups.some(group => group.id === id));
  }
  async function toolQuote(items) {
    const response = await request(`${config.apiBaseUrl}/stores/public/${encodeURIComponent(config.slug)}/price-quote`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'omit', body: JSON.stringify({ items: items.map(({ productId, ...item }) => ({ paymentLinkId: productId, ...item })) }) });
    const result = await response.json();
    if (!response.ok || !Array.isArray(result?.lines)) throw new Error(Array.isArray(result?.message) ? result.message.join(' ') : result?.message || 'No pudimos calcular el precio.');
    return result;
  }
  /** Puts a tool's line in the cart. A unit line is set to the chosen amount; any other line adds to what is there. */
  function addToolLine(item, button) {
    const p = products().find(entry => entry.id === item.productId);
    if (!ready || !p) return { ok: false, message: 'Este producto ya no está disponible.' };
    const key = item.options ? optionLineKey(p.id, item.options) : lineKey(p.id, '', item.cadence);
    const line = cartLine(key);
    if (!line) return { ok: false, message: 'Revisa tu elección.' };
    const conflict = cadenceConflict(line.cadence);
    if (conflict) return { ok: false, message: conflict };
    const current = cart.get(key) || 0;
    const next = line.unit ? item.quantity : current + item.quantity;
    if (next > remaining(p) + current) return { ok: false, message: 'Ya añadiste la cantidad disponible.' };
    cart.set(key, next);
    track('add_to_cart', undefined, { value: lineTotal(line, next), currency: p.currency });
    analytics('add_to_cart', { productId: p.id });
    renderCart();
    const name = line.unit ? `${line.quantityText(next)} de ${p.name}` : line.name;
    message(`${name} añadido a tu pedido.`);
    if (button) addedFeedback({ ...p, name }, button, false);
    return { ok: true, message: `${name} añadido a tu pedido.` };
  }
  async function toolFormToken(id) {
    const response = await request(`${config.apiBaseUrl}/stores/public/${encodeURIComponent(config.slug)}/tools/${encodeURIComponent(id)}/form-token`, { credentials: 'omit' });
    const result = await response.json();
    if (!response.ok || typeof result?.token !== 'string') throw new Error('Este formulario no está disponible ahora.');
    return result.token;
  }
  async function submitToolRequest(body) {
    const response = await request(`${config.apiBaseUrl}/stores/public/${encodeURIComponent(config.slug)}/leads`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'omit', body: JSON.stringify(body) });
    const result = await response.json();
    if (!response.ok || !result?.submitted) throw new Error(Array.isArray(result?.message) ? result.message.join(' ') : result?.message || 'No se pudo enviar. Inténtalo otra vez.');
    return result;
  }
  /** A request's deposit (plan a): its product goes in the cart with the signed lead, then checkout opens. */
  function startToolDeposit(deposit, leadId, button) {
    const p = products().find(item => item.id === deposit?.productId);
    if (!p || typeof leadId !== 'string' || typeof deposit.token !== 'string') return false;
    cart.set(depositLineKey(p.id, { leadId, token: deposit.token }), 1);
    renderCart();
    openCheckout(button);
    return true;
  }
  function toolContext(tool) {
    return {
      live: toolsLive(), preview, hosted, locked: tool.status === 'draft',
      money, escape, limit, product: id => toolProductFor(tool, id),
      subscriptionsOn: subscriptionsAvailable() || tool.status === 'draft',
      quote: toolQuote, addLine: addToolLine, formToken: toolFormToken, submitRequest: submitToolRequest, startDeposit: startToolDeposit,
    };
  }
  function mountTools() {
    document.querySelectorAll('[data-pagosya-tool]').forEach(host => {
      const tool = toolDefinitions().find(candidate => candidate.id === host.getAttribute('data-pagosya-tool'));
      const usable = Boolean(tool && toolUsable(tool));
      const section = host.closest('[data-pagosya-tool-section]');
      host.hidden = !usable;
      if (section) section.hidden = !usable;
      if (!usable) { host.replaceChildren(); mountedTools.delete(host); return; }
      // The shopper's input survives a re-render; a new definition or a refreshed product redraws the tool.
      const product = products().find(item => item.id === toolProductId(tool)) || null;
      const before = mountedTools.get(host);
      if (before && before.tool === tool && before.product === product) return;
      mountedTools.set(host, { tool, product });
      TOOL_RENDERERS[tool.kind](host, tool, toolContext(tool));
    });
  }
```

- [ ] **Step 6: Wire the parts.**
- In `tools/build-commerce.mjs`, replace:
```js
  'cart/lines.js',
  'product/dialog-style.js',
```
with:
```js
  'cart/lines.js',
  // Business tools (spec 2026-10-14): the renderers register in TOOL_RENDERERS; mount.js is read by render().
  'business-tools/shared.js',
  'business-tools/calculator.js',
  'business-tools/mount.js',
  'product/dialog-style.js',
```
- In `shared/state.js`, `request`, replace the `const action = …` and `const result = …` lines quoted above with:
```js
    // Business tools (spec 2026-10-14): price quotes and a request form's token also go through the trusted parent.
    const toolForm = /\/tools\/(tl[a-f0-9]{18})\/form-token$/.exec(url);
    const action = url.endsWith('/cart-checkout') ? 'checkout' : url.endsWith('/leads') ? 'lead' : url.endsWith('/shipping/quote') ? 'shipping' : url.endsWith('/price-quote') ? 'quote' : toolForm ? 'tool-form' : url.includes('/content/reviews') ? 'review' : url.includes('/content') ? 'content' : 'catalog';
    const result = await window.PAGOSYA_HOSTED_REQUEST(action, options?.body ? JSON.parse(options.body) : toolForm ? { toolId: toolForm[1] } : url.includes('/content') ? { locale: document.documentElement.lang || 'es' } : {});
```
- In `catalog/render.js`, `render()`, replace:
```js
    renderCart();
    renderContact();
```
with:
```js
    renderCart();
    renderContact();
    mountTools();
```
- Run: `node packages/storefront-kit/tools/build-commerce.mjs`. Expected: `Wrote kit/commerce.js from 35 commerce-src parts.`

- [ ] **Step 7: The hosted parent answers quotes and form tokens.** In `apps/checkout/src/source-storefront.ts`, in `receive`:
- Replace `['checkout', 'lead', 'catalog', 'shipping', 'content', 'review', 'retention', 'assistant'].includes(data.action)` with `['checkout', 'lead', 'catalog', 'shipping', 'content', 'review', 'retention', 'assistant', 'quote', 'tool-form'].includes(data.action)`.
- Right after the line `const reply = (ok: boolean, body: unknown) => target.postMessage({ type: 'pagosya:hosted-response', id: data.id, result: { ok, body } }, '*');`, insert:
```ts
    // Business tools (spec 2026-10-14): a price quote and a request form's token carry nothing personal and run as often as
    // the shopper changes a tool, so they skip the one-at-a-time guard and the trusted dialog.
    if (data.action === 'quote' || data.action === 'tool-form') {
      try {
        const body = data.body && typeof data.body === 'object' ? data.body as Record<string, unknown> : {};
        const toolId = typeof body.toolId === 'string' && /^tl[a-f0-9]{18}$/.test(body.toolId) ? body.toolId : null;
        if (data.action === 'tool-form' && !toolId) { reply(false, { message: 'Solicitud no válida.' }); return; }
        const result = data.action === 'quote'
          ? await fetch(`${API_BASE_URL}/stores/public/${encodeURIComponent(slug)}/price-quote`, { method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: Array.isArray(body.items) ? body.items : [] }), signal: AbortSignal.timeout(18000) })
          : await fetch(`${API_BASE_URL}/stores/public/${encodeURIComponent(slug)}/tools/${toolId}/form-token`, { credentials: 'omit', signal: AbortSignal.timeout(18000) });
        reply(result.ok, await result.json());
      } catch { reply(false, { message: 'No pudimos calcular el precio.' }); }
      return;
    }
```
- Append to `apps/checkout/test/source-storefront-tools.test.ts`:
```ts
describe('hosted tool requests', () => {
  it('answers price quotes in parallel, never as «Ya hay una solicitud en curso»', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => site() }));
    await mountPublishedSource(document.querySelector('#app')!, 'lecheria', store, vi.fn(), false);
    const frame = document.querySelector('iframe')!;
    const reply = vi.spyOn(frame.contentWindow!, 'postMessage');
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ total: 13800, lines: [] }) } as Response);
    send(frame, { type: 'pagosya:hosted-request', id: 1, action: 'quote', body: { items: [{ paymentLinkId: 'leche', quantity: 40 }], name: 'x' } });
    send(frame, { type: 'pagosya:hosted-request', id: 2, action: 'quote', body: { items: [{ paymentLinkId: 'leche', quantity: 41 }] } });
    await vi.waitFor(() => expect(reply).toHaveBeenCalledTimes(2));
    expect(reply.mock.calls.map(([message]: any[]) => message.result.ok)).toEqual([true, true]);
    const quoteCall = vi.mocked(fetch).mock.calls.find(([url]) => String(url).endsWith('/stores/public/lecheria/price-quote'))!;
    expect(JSON.parse(quoteCall[1]!.body as string)).toEqual({ items: [{ paymentLinkId: 'leche', quantity: 40 }] });
  });

  it('asks for a form token only for a well-formed tool id', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => site() }));
    await mountPublishedSource(document.querySelector('#app')!, 'lecheria', store, vi.fn(), false);
    const frame = document.querySelector('iframe')!;
    const reply = vi.spyOn(frame.contentWindow!, 'postMessage');
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ token: 't' }) } as Response);
    send(frame, { type: 'pagosya:hosted-request', id: 3, action: 'tool-form', body: { toolId: '../../admin' } });
    send(frame, { type: 'pagosya:hosted-request', id: 4, action: 'tool-form', body: { toolId: 'tl0123456789abcdef01' } });
    await vi.waitFor(() => expect(reply).toHaveBeenCalledTimes(2));
    expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes('/admin'))).toBe(false);
    expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).endsWith('/tools/tl0123456789abcdef01/form-token'))).toBe(true);
  });
});
```

- [ ] **Step 8: Write the browser test.** Create `apps/api/src/store-tools/store-tools-browser.spec.ts`:
```ts
/// <reference lib="dom" />
jest.setTimeout(300_000);
import { chromium, type Browser, type Page } from 'playwright';
import { KIT } from './kit-runtime.testing';

/** Business tools part b (spec 2026-10-14): each renderer at 1440 and 390 in Chromium. Every control is labelled and at least
 *  44 px; nothing scrolls sideways; a keyboard alone can use the tool. Previews only (no network). */
const TOKENS = ':root{--store-background:#f6f1e7;--store-foreground:#1d1b18;--store-accent:#2f6b3a;--store-accent-foreground:#fff}body{margin:0;font-family:Georgia,serif;background:#f6f1e7;color:#1d1b18}';
let browser: Browser;
beforeAll(async () => { browser = await chromium.launch({ headless: true }); });
afterAll(async () => { await browser?.close(); });
async function openTool(data: Record<string, unknown>, toolId: string, width: number): Promise<Page> {
  const page = await browser.newPage({ viewport: { width, height: width === 390 ? 844 : 900 } });
  await page.setContent(`<!doctype html><html lang="es"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${TOKENS}</style></head><body><main><section data-pagosya-tool-section><div data-pagosya-tool="${toolId}"></div></section></main><section data-pagosya-cart></section><p data-pagosya-status></p></body></html>`);
  await page.addScriptTag({ content: `window.PAGOSYA_PREVIEW=true;window.PAGOSYA_CONFIG=${JSON.stringify({ slug: 'lecheria', apiBaseUrl: 'https://api.test', checkoutOrigin: 'https://pay.test', data })};` });
  await page.addScriptTag({ content: KIT });
  await page.locator(`[data-pagosya-tool="${toolId}"] .pyt-panel`).waitFor();
  return page;
}
/** Every visible control in the tool: its size, whether it has an accessible label, and the page width. */
const audit = (page: Page) => page.evaluate(() => {
  const tool = document.querySelector('[data-pagosya-tool]')!;
  const controls = [...tool.querySelectorAll('button,input:not([name=website]),select,textarea')].filter(el => (el as any).checkVisibility());
  return {
    small: controls.filter(el => { const box = el.getBoundingClientRect(); const tiny = (el as HTMLInputElement).type === 'radio' || (el as HTMLInputElement).type === 'checkbox'; return !tiny && (box.height < 44 || box.width < 44); }).map(el => el.outerHTML.slice(0, 80)),
    unlabelled: controls.filter(el => !(el.getAttribute('aria-label') || (el as HTMLInputElement).labels?.length || (el.textContent || '').trim())).map(el => el.outerHTML.slice(0, 80)),
    wide: document.documentElement.scrollWidth > innerWidth + 1,
  };
});

const LECHE = { id: 'leche', name: 'Leche entera', amount: 720, currency: 'BOB', stock: null, purchaseLimit: null, fulfillmentType: 'PHYSICAL', imageUrls: [], variants: [], extras: [], unit: { label: 'L', step: 0.5, min: 1, max: 100 }, tiers: [{ from: 1, unitAmount: 720 }, { from: 15, unitAmount: 690 }, { from: 30, unitAmount: 650 }], optionGroups: [] };
const CALC = { id: 'tl0123456789abcdef01', kind: 'calculator', status: 'approved', title: 'Calcula tu leche de la semana', intro: 'Desde 15 L baja el precio por litro.', words: { cta: 'Añadir' }, layout: 'split', calculator: { productId: 'leche', presets: [10, 20, 30, 50], showTiers: true } };

describe.each([1440, 390])('calculator at %ipx (spec 2026-10-14, part b)', width => {
  it('is labelled, 44 px, inside the page, and fully usable by keyboard', async () => {
    const page = await openTool({ storeName: 'Lechería', checkoutMode: 'payment', items: [LECHE], tools: [CALC] }, CALC.id, width);
    try {
      expect(await audit(page)).toEqual({ small: [], unlabelled: [], wide: false });
      await page.focus('[data-tool-units]');
      await page.keyboard.press('ArrowUp');
      expect(await page.inputValue('[data-tool-units]')).toBe('10,5');
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');
      await page.keyboard.press('Enter');
      expect(await page.inputValue('[data-tool-units]')).toBe('10');
      await page.locator('[data-tool-add]').focus();
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => document.querySelector('[data-tool-status]')?.textContent?.includes('10 L de Leche entera'));
    } finally { await page.close(); }
  });
});
```
The two `Tab` presses go from the input past the + button to the first chip (10 L). `Enter` presses it.

- [ ] **Step 9: Run them and see them pass.**
  - Run: `cd apps/api && npx jest src/store-tools/kit-tools-mount.spec.ts src/store-tools/kit-tool-cart.spec.ts --maxWorkers=2`. Expected: PASS.
  - Run: `cd apps/api && npx jest src/store-tools/store-tools-browser.spec.ts`. Expected: PASS at 1440 and 390. A failure names the element: fix `business-tools/shared.js`'s CSS, never the test.
  - Run: `cd apps/checkout && npx vitest run test/source-storefront-tools.test.ts`. Expected: PASS.
  - Run: `node --test packages/storefront-kit/tools/build-commerce.test.mjs && node packages/storefront-kit/kit/check-runtimes.mjs`. Expected: PASS.

- [ ] **Step 10: Commit.**
```bash
git add packages/storefront-kit/commerce-src/business-tools/shared.js packages/storefront-kit/commerce-src/business-tools/calculator.js packages/storefront-kit/commerce-src/business-tools/mount.js packages/storefront-kit/commerce-src/shared/state.js packages/storefront-kit/commerce-src/catalog/render.js packages/storefront-kit/tools/build-commerce.mjs packages/storefront-kit/kit/commerce.js apps/checkout/src/source-storefront.ts apps/checkout/test/source-storefront-tools.test.ts apps/api/src/store-tools/kit-tools-mount.spec.ts apps/api/src/store-tools/store-tools-browser.spec.ts
git commit -m "feat(tools): the kit mounts tools by status and totals them with the server quote; the quantity calculator

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The subscription sign-up

**Files:**
- Create (part): `packages/storefront-kit/commerce-src/business-tools/subscribe.js`
- Modify: `packages/storefront-kit/tools/build-commerce.mjs`, then (generated) `kit/commerce.js`
- Create (test): `apps/api/src/store-tools/kit-tool-subscribe.spec.ts`
- Modify (test): `apps/api/src/store-tools/store-tools-browser.spec.ts` (append)

**Interfaces:**
- Produces: `function subscribeTool(host, tool, ctx)`, registered as `TOOL_RENDERERS.subscribe`.
- DOM hooks:
  - `[data-tool-units]` (unit product) or `[data-tool-quantity]`, with `[data-tool-step]`;
  - `input[name=cadence]` radios;
  - `[data-tool-per-delivery]`, `[data-tool-today]`, `[data-tool-renewal]` and `[data-tool-add]`.
- It adds a line `{ productId, quantity, cadence: 'WEEKLY'|'BIWEEKLY'|'MONTHLY' }`.

- [ ] **Step 1: Write the failing jsdom test.** Create `apps/api/src/store-tools/kit-tool-subscribe.spec.ts`:
```ts
import { bootKit, closeKits, serialized, settle } from './kit-runtime.testing';

/** Business tools part b (spec 2026-10-14): the subscription sign-up. Never promises an automatic charge. */
const LECHE = { id: 'leche', name: 'Leche entera', amount: 720, currency: 'BOB', stock: null, purchaseLimit: null, fulfillmentType: 'PHYSICAL', imageUrls: [], variants: [], extras: [], unit: { label: 'L', step: 0.5, min: 1, max: 100 }, tiers: [{ from: 1, unitAmount: 720 }, { from: 15, unitAmount: 690 }], optionGroups: [], subscriptionOptions: [{ cadence: 'WEEKLY', discountPercent: 10 }, { cadence: 'MONTHLY', discountPercent: 5 }] };
const TOOL = { id: 'tlbbbbbbbbbbbbbbbbbb', kind: 'subscribe', status: 'approved', title: 'Leche fresca cada semana', words: { cta: 'Suscribirme' }, layout: 'card', subscribe: { productId: 'leche', cadences: ['weekly', 'monthly'], defaultUnits: 20 } };
const DATA = { storeName: 'Lechería', checkoutMode: 'payment', subscriptionsEnabled: true, items: [LECHE], tools: [TOOL] };
const MOUNT = '<main><div data-pagosya-tool="tlbbbbbbbbbbbbbbbbbb"></div></main><section data-pagosya-cart></section><p data-pagosya-status></p>';
afterEach(closeKits);
const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

describe('subscribe (spec 2026-10-14, part b)', () => {
  it('shows the price per delivery with the cadence discount and the payment-link renewal line', async () => {
    const { doc } = bootKit(DATA, {}, { body: MOUNT, preview: true });
    await settle(300);
    const tool = doc.querySelector('[data-pagosya-tool]')!;
    expect((tool.querySelector('[data-tool-units]') as HTMLInputElement).value).toBe('20 L');
    expect([...tool.querySelectorAll('input[name=cadence]')].map(radio => (radio as HTMLInputElement).value)).toEqual(['WEEKLY', 'MONTHLY']);
    // 20 L at 690/L → 345 per 0,5 L step, less 10 % → 311 × 40 = 12 440.
    expect(text(tool.querySelector('[data-tool-per-delivery]'))).toMatch(/^Bs\s?124,40 por entrega, cada semana$/);
    expect(text(tool.querySelector('[data-tool-renewal]'))).toBe('Te enviamos el link de pago antes de cada entrega. Puedes saltar, pausar o cancelar cuando quieras.');
    expect(tool.textContent).not.toMatch(/autom[aá]tic/i);
  });

  it('adds a subscription line with the chosen cadence', async () => {
    const { w, doc } = bootKit(DATA, {}, { body: MOUNT, preview: true });
    await settle(300);
    (doc.querySelector('input[name=cadence][value=MONTHLY]') as HTMLInputElement).click();
    expect(text(doc.querySelector('[data-tool-per-delivery]'))).toMatch(/cada mes$/);
    (doc.querySelector('[data-tool-add]') as HTMLButtonElement).click();
    expect(serialized(w)).toEqual([{ id: 'leche', quantity: 40, subscriptionCadence: 'MONTHLY' }]);
  });

  it('hides itself when subscriptions are off or the cadences are not offered', async () => {
    for (const payload of [{ ...DATA, subscriptionsEnabled: false }, { ...DATA, items: [{ ...LECHE, subscriptionOptions: [{ cadence: 'BIWEEKLY', discountPercent: 5 }] }] }]) {
      const { doc } = bootKit(payload, {}, { body: MOUNT, preview: true });
      await settle(200);
      expect((doc.querySelector('[data-pagosya-tool]') as HTMLElement).hidden).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run it and see it fail.**
  - Run: `cd apps/api && npx jest src/store-tools/kit-tool-subscribe.spec.ts`
  - Expected: FAIL. The tool stays hidden, because no `subscribe` renderer is registered.

- [ ] **Step 3: Write the part.** Create `packages/storefront-kit/commerce-src/business-tools/subscribe.js`:
```js
  // Business tools (spec 2026-10-14, part b): the subscription sign-up. The product, how much and how often; the price per
  // delivery with the cadence discount; and the renewal line, which never promises an automatic charge: «Te enviamos el link
  // de pago antes de cada entrega». The button adds a subscription line («Suscribirme»).
  function subscribeTool(host, tool, ctx) {
    const p = ctx.product(tool.subscribe.productId);
    const offers = (p?.subscriptionOptions || []).filter(offer => tool.subscribe.cadences.includes(String(offer.cadence).toLowerCase()));
    if (!p || !offers.length || !ctx.subscriptionsOn) { host.hidden = true; return; }
    const view = toolFrame(host, tool, ctx);
    const esc = ctx.escape, unit = SELLING.unit(p);
    const minSteps = unit ? unit.minSteps : 1, maxSteps = Math.min(unit ? unit.maxSteps : 99, ctx.limit(p));
    const amountOf = steps => unit ? `${SELLING.unitsText(steps * unit.step)} ${unit.label}` : String(steps);
    let steps = unit ? Math.min(maxSteps, Math.max(minSteps, Math.round((tool.subscribe.defaultUnits || unit.min) / unit.step))) : Math.max(1, Math.min(maxSteps, Math.round(tool.subscribe.defaultUnits || 1)));
    let cadence = offers[0].cadence;
    const inputId = view.id + '-amount';
    view.body.innerHTML = `<p class="pyt-note"><strong>${esc(p.name)}</strong></p>`
      + `<div class="pyt-field"><label for="${inputId}">${unit ? `Cantidad por entrega (${esc(unit.label)})` : 'Unidades por entrega'}</label>`
      + `<div class="quantity pyt-stepper" role="group" aria-label="Cantidad por entrega"><button type="button" data-tool-step="-1" aria-label="Menos">−</button>`
      + `<input id="${inputId}" type="text" readonly ${unit ? 'data-tool-units' : 'data-tool-quantity'}>`
      + '<button type="button" data-tool-step="1" aria-label="Más">+</button></div></div>'
      + `<fieldset><legend>¿Cada cuánto?</legend>${offers.map(offer => `<label class="pyt-choice"><input type="radio" name="cadence" value="${esc(offer.cadence)}"${offer.cadence === cadence ? ' checked' : ''}><span>${esc(CADENCE_TEXT[offer.cadence] || offer.cadence)}${offer.discountPercent ? ` · ${offer.discountPercent} % menos` : ''}</span></label>`).join('')}</fieldset>`
      + '<p class="pyt-total"><span>Por entrega</span><strong data-tool-per-delivery></strong></p>'
      + '<p class="pyt-note" data-tool-today hidden></p>'
      + '<p class="pyt-note" data-tool-renewal>Te enviamos el link de pago antes de cada entrega. Puedes saltar, pausar o cancelar cuando quieras.</p>'
      + '<button type="button" class="checkout-button pyt-add" data-tool-add></button>';
    const input = view.body.querySelector('input[type=text]'), add = view.body.querySelector('[data-tool-add]');
    const down = view.body.querySelector('[data-tool-step="-1"]'), up = view.body.querySelector('[data-tool-step="1"]');
    const perDelivery = view.body.querySelector('[data-tool-per-delivery]'), today = view.body.querySelector('[data-tool-today]');
    const requote = toolQuoteLoop(ctx, view, add);
    const percent = () => (offers.find(offer => offer.cadence === cadence) || offers[0]).discountPercent;
    function paint(result) {
      const line = result.lines ? result.lines[0] : result;
      const locked = (line.lockedUnitAmount ?? line.unitAmount) * steps;
      perDelivery.textContent = `${ctx.money(locked, p.currency)} por entrega, ${CADENCE_TEXT[cadence] || ''}`;
      const first = line.unitAmount * steps;
      today.hidden = first === locked;
      today.textContent = first === locked ? '' : `Hoy pagas ${ctx.money(first, p.currency)}.`;
    }
    function update() {
      input.value = amountOf(steps);
      down.disabled = steps <= minSteps;
      up.disabled = steps >= maxSteps;
      add.textContent = ctx.locked ? 'Disponible al aprobar' : tool.words.cta;
      requote([{ productId: p.id, quantity: steps, subscriptionCadence: cadence }], SELLING.estimateLine(p, steps, null, percent()), paint);
      if (ctx.locked) add.disabled = true;
    }
    down.addEventListener('click', () => { if (steps > minSteps) { steps -= 1; update(); } });
    up.addEventListener('click', () => { if (steps < maxSteps) { steps += 1; update(); } });
    view.body.querySelectorAll('input[name=cadence]').forEach(radio => radio.addEventListener('change', () => { cadence = radio.value; update(); }));
    add.addEventListener('click', () => {
      if (ctx.locked) return;
      const result = ctx.addLine({ productId: p.id, quantity: steps, cadence }, add);
      if (result.ok) view.status(result.message); else view.error(result.message);
    });
    update();
  }
  TOOL_RENDERERS.subscribe = subscribeTool;
```
- In `tools/build-commerce.mjs`, insert `'business-tools/subscribe.js',` after `'business-tools/calculator.js',`.
- Run: `node packages/storefront-kit/tools/build-commerce.mjs`.

- [ ] **Step 4: Append the browser test.** Append to `store-tools-browser.spec.ts`:
```ts
const SUB = { id: 'tlbbbbbbbbbbbbbbbbbb', kind: 'subscribe', status: 'approved', title: 'Leche fresca cada semana', words: { cta: 'Suscribirme' }, layout: 'card', subscribe: { productId: 'leche', cadences: ['weekly', 'monthly'], defaultUnits: 20 } };
describe.each([1440, 390])('subscribe at %ipx (spec 2026-10-14, part b)', width => {
  it('is labelled, 44 px, inside the page, and usable by keyboard', async () => {
    const page = await openTool({ storeName: 'Lechería', checkoutMode: 'payment', subscriptionsEnabled: true, items: [{ ...LECHE, subscriptionOptions: [{ cadence: 'WEEKLY', discountPercent: 10 }, { cadence: 'MONTHLY', discountPercent: 5 }] }], tools: [SUB] }, SUB.id, width);
    try {
      expect(await audit(page)).toEqual({ small: [], unlabelled: [], wide: false });
      await page.focus('input[name=cadence][value=WEEKLY]');
      await page.keyboard.press('ArrowDown');
      expect(await page.isChecked('input[name=cadence][value=MONTHLY]')).toBe(true);
      await page.locator('[data-tool-add]').focus();
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => document.querySelector('[data-tool-status]')?.textContent?.includes('añadido'));
    } finally { await page.close(); }
  });
});
```

- [ ] **Step 5: Run them and see them pass.**
  - Run: `cd apps/api && npx jest src/store-tools/kit-tool-subscribe.spec.ts src/store-tools/kit-tools-mount.spec.ts --maxWorkers=2`. Expected: PASS.
  - Run: `cd apps/api && npx jest src/store-tools/store-tools-browser.spec.ts`. Expected: PASS.
  - Run: `node --test packages/storefront-kit/tools/build-commerce.test.mjs`. Expected: PASS.

- [ ] **Step 6: Commit.**
```bash
git add packages/storefront-kit/commerce-src/business-tools/subscribe.js packages/storefront-kit/tools/build-commerce.mjs packages/storefront-kit/kit/commerce.js apps/api/src/store-tools/kit-tool-subscribe.spec.ts apps/api/src/store-tools/store-tools-browser.spec.ts
git commit -m "feat(tools): the subscription sign-up — amount, cadence, price per delivery, payment-link renewal line

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: The builder

**Files:**
- Create (part): `packages/storefront-kit/commerce-src/business-tools/builder.js`
- Modify: `packages/storefront-kit/tools/build-commerce.mjs`, then (generated) `kit/commerce.js`
- Create (test): `apps/api/src/store-tools/kit-tool-builder.spec.ts`
- Modify (test): `apps/api/src/store-tools/store-tools-browser.spec.ts` (append)

**Interfaces:**
- Produces: `function builderTool(host, tool, ctx)`, registered as `TOOL_RENDERERS.builder`.
- DOM hooks:
  - `fieldset[data-tool-group="<id>"]` (radios, checkboxes or a text input);
  - `[data-tool-back]` and `[data-tool-next-step]` in the `steps` layout;
  - `[data-tool-total]`, `[data-tool-summary]` and `[data-tool-add]`.
- It adds a line `{ productId, quantity: 1, options }`.

- [ ] **Step 1: Write the failing jsdom test.** Create `apps/api/src/store-tools/kit-tool-builder.spec.ts`:
```ts
import { bootKit, closeKits, serialized, settle } from './kit-runtime.testing';

/** Business tools part b (spec 2026-10-14): the builder steps through the option groups, keeps a running total and a summary. */
const TORTA = { id: 'torta', name: 'Torta de cumpleaños', amount: 15000, currency: 'BOB', stock: null, purchaseLimit: null, imageUrls: [], variants: [], extras: [], unit: null, tiers: [], optionGroups: [
  { id: 'size', label: 'Tamaño', type: 'single', required: true, choices: [{ id: 's', label: 'Chica', amountDelta: 0 }, { id: 'l', label: 'Grande', amountDelta: 6000 }] },
  { id: 'extras', label: 'Decoración', type: 'multi', required: false, choices: [{ id: 'fruit', label: 'Frutas', amountDelta: 1500 }, { id: 'gold', label: 'Dorado', amountDelta: 2500 }] },
  { id: 'note', label: 'Mensaje', type: 'text', required: false, maxLength: 40 },
] };
const TOOL = { id: 'tlcccccccccccccccccc', kind: 'builder', status: 'approved', title: 'Arma tu torta', words: { cta: 'Añadir al pedido', total: 'Tu torta' }, layout: 'steps', builder: { productId: 'torta', steps: ['size', 'extras', 'note'], summary: true } };
const DATA = { storeName: 'Panadería', checkoutMode: 'payment', items: [TORTA], tools: [TOOL] };
const MOUNT = '<main><div data-pagosya-tool="tlcccccccccccccccccc"></div></main><section data-pagosya-cart></section><p data-pagosya-status></p>';
afterEach(closeKits);
const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
const visibleGroups = (doc: Document) => [...doc.querySelectorAll('fieldset[data-tool-group]')].filter(group => !(group as HTMLElement).hidden).map(group => group.getAttribute('data-tool-group'));

describe('builder (spec 2026-10-14, part b)', () => {
  it('steps through the groups, refusing to move on without a required choice', async () => {
    const { doc } = bootKit(DATA, {}, { body: MOUNT, preview: true });
    await settle(300);
    expect(visibleGroups(doc)).toEqual(['size']);
    (doc.querySelector('[data-tool-next-step]') as HTMLButtonElement).click();
    expect(visibleGroups(doc)).toEqual(['size']);
    expect(text(doc.querySelector('[data-tool-error]'))).toBe('Elige «Tamaño».');
    expect(doc.querySelector('fieldset[data-tool-group=size]')!.getAttribute('aria-invalid')).toBe('true');
    (doc.querySelector('input[name=size][value=l]') as HTMLInputElement).click();
    expect(text(doc.querySelector('[data-tool-total]'))).toMatch(/Bs\s?210,00/);
    (doc.querySelector('[data-tool-next-step]') as HTMLButtonElement).click();
    expect(visibleGroups(doc)).toEqual(['extras']);
    (doc.querySelector('[data-tool-back]') as HTMLButtonElement).click();
    expect(visibleGroups(doc)).toEqual(['size']);
  });

  it('keeps a running total and a summary, then adds the cake with its choices', async () => {
    const { w, doc } = bootKit(DATA, {}, { body: MOUNT, preview: true });
    await settle(300);
    (doc.querySelector('input[name=size][value=l]') as HTMLInputElement).click();
    (doc.querySelector('[data-tool-next-step]') as HTMLButtonElement).click();
    (doc.querySelector('input[name=extras][value=gold]') as HTMLInputElement).click();
    (doc.querySelector('input[name=extras][value=fruit]') as HTMLInputElement).click();
    (doc.querySelector('[data-tool-next-step]') as HTMLButtonElement).click();
    const note = doc.querySelector('input[name=note]') as HTMLInputElement;
    note.value = 'Feliz día, Ana';
    note.dispatchEvent(new (w as any).Event('input'));
    expect(text(doc.querySelector('[data-tool-total]'))).toMatch(/Bs\s?250,00/);
    expect([...doc.querySelectorAll('[data-tool-summary] div')].map(text)).toEqual(['Tamaño Grande', 'Decoración Frutas, Dorado', 'Mensaje Feliz día, Ana']);
    (doc.querySelector('[data-tool-add]') as HTMLButtonElement).click();
    expect(serialized(w)).toEqual([{ id: 'torta', quantity: 1, options: { size: ['l'], extras: ['fruit', 'gold'], note: 'Feliz día, Ana' } }]);
  });

  it('shows every group at once outside the steps layout, and is gone when a step is no longer one of the product groups', async () => {
    const open = bootKit({ ...DATA, tools: [{ ...TOOL, layout: 'card' }] }, {}, { body: MOUNT, preview: true });
    await settle(300);
    expect(visibleGroups(open.doc)).toEqual(['size', 'extras', 'note']);
    const stale = bootKit({ ...DATA, items: [{ ...TORTA, optionGroups: TORTA.optionGroups.slice(0, 1) }] }, {}, { body: MOUNT, preview: true });
    await settle(300);
    expect((stale.doc.querySelector('[data-pagosya-tool]') as HTMLElement).hidden).toBe(true);
  });
});
```

- [ ] **Step 2: Run it and see it fail.**
  - Run: `cd apps/api && npx jest src/store-tools/kit-tool-builder.spec.ts`
  - Expected: FAIL. The tool is hidden, because no `builder` renderer is registered.

- [ ] **Step 3: Write the part.** Create `packages/storefront-kit/commerce-src/business-tools/builder.js`:
```js
  // Business tools (spec 2026-10-14, part b): the builder. It steps through the product's option groups (one at a time in the
  // `steps` layout, all at once otherwise), keeps a running total and a summary card, and adds the configured product
  // («Añadir al pedido»). The server re-checks every choice and prices the deltas.
  function builderTool(host, tool, ctx) {
    const p = ctx.product(tool.builder.productId);
    const groups = tool.builder.steps.map(id => SELLING.groups(p).find(group => group.id === id));
    if (!p || groups.some(group => !group)) { host.hidden = true; return; }
    const view = toolFrame(host, tool, ctx);
    const esc = ctx.escape, stepped = tool.layout === 'steps';
    const chosen = {};
    let current = 0;
    const control = group => {
      if (group.type === 'text') {
        const id = `${view.id}-${group.id}`;
        return `<div class="pyt-field"><label for="${id}">${esc(group.label)}${group.required ? '' : ' (opcional)'}</label><input id="${id}" name="${esc(group.id)}" type="text" maxlength="${group.maxLength || 140}" autocomplete="off"${group.required ? ' required' : ''}></div>`;
      }
      const type = group.type === 'multi' ? 'checkbox' : 'radio';
      return group.choices.map(choice => `<label class="pyt-choice"><input type="${type}" name="${esc(group.id)}" value="${esc(choice.id)}"><span>${esc(choice.label)}${choice.amountDelta ? ` (+${esc(ctx.money(choice.amountDelta, p.currency))})` : ''}</span></label>`).join('');
    };
    view.body.innerHTML = groups.map(group => `<fieldset data-tool-group="${esc(group.id)}"${group.type === 'text' ? ` aria-label="${esc(group.label)}"` : ''}>${group.type === 'text' ? '' : `<legend>${esc(group.label)}${group.required ? '' : ' (opcional)'}</legend>`}${control(group)}</fieldset>`).join('')
      + (stepped ? '<div class="pyt-nav"><button type="button" class="checkout-button" data-tool-back>Atrás</button><button type="button" class="checkout-button" data-tool-next-step>Siguiente</button></div>' : '')
      + `<p class="pyt-total"><span>${esc(tool.words.total || 'Total')}</span><strong data-tool-total></strong></p>`
      + (tool.builder.summary ? '<dl class="pyt-summary" data-tool-summary aria-label="Tu elección"></dl>' : '')
      + '<button type="button" class="checkout-button pyt-add" data-tool-add></button>';
    const add = view.body.querySelector('[data-tool-add]'), total = view.body.querySelector('[data-tool-total]'), summary = view.body.querySelector('[data-tool-summary]');
    const back = view.body.querySelector('[data-tool-back]'), next = view.body.querySelector('[data-tool-next-step]');
    const requote = toolQuoteLoop(ctx, view, add);
    const filled = group => Array.isArray(chosen[group.id]) ? chosen[group.id].length > 0 : Boolean(chosen[group.id]);
    const options = () => { const out = {}; groups.forEach(group => { if (filled(group)) out[group.id] = chosen[group.id]; }); return out; };
    const missing = () => groups.find(group => group.required && !filled(group));
    /** A running total of what is chosen so far, even before the required groups are complete. */
    const partial = () => groups.reduce((sum, group) => sum + (Array.isArray(chosen[group.id]) ? group.choices.filter(choice => chosen[group.id].includes(choice.id)).reduce((s, choice) => s + choice.amountDelta, 0) : 0), p.amount);
    function paint(result) { total.textContent = ctx.money(result.lines ? result.total : result.lineAmount, p.currency); }
    function show() {
      view.body.querySelectorAll('fieldset[data-tool-group]').forEach((fieldset, index) => { fieldset.hidden = stepped && index !== current; });
      if (stepped) { back.hidden = current === 0; next.hidden = current === groups.length - 1; }
    }
    function update() {
      if (summary) summary.innerHTML = groups.filter(filled).map(group => `<div><dt>${esc(group.label)}</dt> <dd>${esc(Array.isArray(chosen[group.id]) ? group.choices.filter(choice => chosen[group.id].includes(choice.id)).map(choice => choice.label).join(', ') : chosen[group.id])}</dd></div>`).join('');
      add.textContent = ctx.locked ? 'Disponible al aprobar' : tool.words.cta;
      const complete = !missing();
      requote(complete ? [{ productId: p.id, quantity: 1, options: options() }] : null, complete ? SELLING.estimateLine(p, 1, options(), null) : { lineAmount: partial() }, paint);
      if (ctx.locked) add.disabled = true;
    }
    function flag(group) {
      const fieldset = view.body.querySelector(`fieldset[data-tool-group="${group.id}"]`);
      view.body.querySelectorAll('fieldset[data-tool-group]').forEach(other => other.removeAttribute('aria-invalid'));
      fieldset.setAttribute('aria-invalid', 'true');
      view.error(`Elige «${group.label}».`);
      if (stepped) { current = groups.indexOf(group); show(); }
      const first = fieldset.querySelector('input');
      if (first) first.focus();
    }
    view.body.querySelectorAll('fieldset[data-tool-group] input').forEach(input => input.addEventListener(input.type === 'text' ? 'input' : 'change', () => {
      const group = groups.find(entry => entry.id === input.name);
      if (group.type === 'text') chosen[group.id] = input.value.trim();
      else chosen[group.id] = [...view.body.querySelectorAll(`input[name="${group.id}"]:checked`)].map(box => box.value).sort();
      input.closest('fieldset').removeAttribute('aria-invalid');
      view.error('');
      update();
    }));
    if (stepped) {
      back.addEventListener('click', () => { if (current > 0) { current -= 1; show(); } });
      next.addEventListener('click', () => {
        const group = groups[current];
        if (group.required && !filled(group)) { flag(group); return; }
        current = Math.min(groups.length - 1, current + 1);
        show();
        const first = view.body.querySelector(`fieldset[data-tool-group="${groups[current].id}"] input`);
        if (first) first.focus();
      });
    }
    add.addEventListener('click', () => {
      if (ctx.locked) return;
      const gap = missing();
      if (gap) { flag(gap); return; }
      const result = ctx.addLine({ productId: p.id, quantity: 1, options: options() }, add);
      if (result.ok) view.status(result.message); else view.error(result.message);
    });
    show();
    update();
  }
  TOOL_RENDERERS.builder = builderTool;
```
- In `tools/build-commerce.mjs`, insert `'business-tools/builder.js',` after `'business-tools/subscribe.js',`.
- Run: `node packages/storefront-kit/tools/build-commerce.mjs`.

- [ ] **Step 4: Append the browser test.** Append to `store-tools-browser.spec.ts`:
```ts
const TORTA = { id: 'torta', name: 'Torta de cumpleaños', amount: 15000, currency: 'BOB', stock: null, purchaseLimit: null, imageUrls: [], variants: [], extras: [], unit: null, tiers: [], optionGroups: [
  { id: 'size', label: 'Tamaño', type: 'single', required: true, choices: [{ id: 's', label: 'Chica', amountDelta: 0 }, { id: 'l', label: 'Grande', amountDelta: 6000 }] },
  { id: 'note', label: 'Mensaje', type: 'text', required: false, maxLength: 40 },
] };
const BUILDER = { id: 'tlcccccccccccccccccc', kind: 'builder', status: 'approved', title: 'Arma tu torta', words: { cta: 'Añadir al pedido' }, layout: 'steps', builder: { productId: 'torta', steps: ['size', 'note'], summary: true } };
describe.each([1440, 390])('builder at %ipx (spec 2026-10-14, part b)', width => {
  it('is labelled, 44 px, inside the page, announces a missing choice, and is usable by keyboard', async () => {
    const page = await openTool({ storeName: 'Panadería', checkoutMode: 'payment', items: [TORTA], tools: [BUILDER] }, BUILDER.id, width);
    try {
      expect(await audit(page)).toEqual({ small: [], unlabelled: [], wide: false });
      await page.locator('[data-tool-next-step]').focus();
      await page.keyboard.press('Enter');
      expect(await page.locator('[role=alert]').textContent()).toBe('Elige «Tamaño».');
      await page.keyboard.press('Space');
      await page.locator('[data-tool-next-step]').focus();
      await page.keyboard.press('Enter');
      expect(await page.locator('fieldset[data-tool-group=note]').isVisible()).toBe(true);
    } finally { await page.close(); }
  });
});
```
After the missing-choice alert, focus is on the first radio, and `Space` selects it.

- [ ] **Step 5: Run them and see them pass.**
  - Run: `cd apps/api && npx jest src/store-tools/kit-tool-builder.spec.ts`. Expected: PASS.
  - Run: `cd apps/api && npx jest src/store-tools/store-tools-browser.spec.ts`. Expected: PASS.
  - Run: `node --test packages/storefront-kit/tools/build-commerce.test.mjs`. Expected: PASS.

- [ ] **Step 6: Commit.**
```bash
git add packages/storefront-kit/commerce-src/business-tools/builder.js packages/storefront-kit/tools/build-commerce.mjs packages/storefront-kit/kit/commerce.js apps/api/src/store-tools/kit-tool-builder.spec.ts apps/api/src/store-tools/store-tools-browser.spec.ts
git commit -m "feat(tools): the builder — steps through option groups, running total, summary, «Añadir al pedido»

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: The request form, its deposit, and the hosted bridge

**Existing code:**
- **`apps/checkout/src/source-storefront.ts`, the hosted handler.**
  - The lead payload: `: { items: [], name: body.name, email: body.email, phone: body.phone, message: body.message, ...leadOrigin(frameBody) };`
  - The reply: `} else reply(true, shipping || content ? json : { submitted: true });`
- **`apps/checkout/src/trusted-form.ts`, `collectPersonalFields`.** `if (action === 'lead') { const values = await trustedForm({ title: \`Escribe a ${name}\`, …` asks for a message.

**Files:**
- Create (part): `packages/storefront-kit/commerce-src/business-tools/request.js`
- Modify: `packages/storefront-kit/tools/build-commerce.mjs`, then (generated) `kit/commerce.js`
- Modify: `apps/checkout/src/source-storefront.ts`, `apps/checkout/src/trusted-form.ts`
- Create (test): `apps/api/src/store-tools/kit-tool-request.spec.ts`
- Modify (tests): `apps/api/src/store-tools/store-tools-browser.spec.ts`, `apps/checkout/test/source-storefront-tools.test.ts` (append both)

**Interfaces:**
- Consumes: plan a's leads endpoint (`toolId`, `fields`, `website`, `formToken`) and its response `{ submitted, leadId, deposit }`; plan a's form-token route.
- Produces:
  - `function requestTool(host, tool, ctx)`, registered as `TOOL_RENDERERS.request`.
  - DOM hooks: `form[data-tool-form]`, `[name="field:<id>"]`, `input[name=website]` (the honeypot), `[data-tool-submit]` and `[data-tool-deposit]`.
  - `collectPersonalFields('lead', { toolId })` asks for name, email and phone only.
  - The hosted lead reply to the frame is `{ submitted, leadId, deposit }`.
  - `export function toolLeadFields(body)` (source-storefront.ts).

- [ ] **Step 1: Write the failing jsdom test.** Create `apps/api/src/store-tools/kit-tool-request.spec.ts`:
```ts
import { bootKit, closeKits, serialized, settle } from './kit-runtime.testing';

/** Business tools part b (spec 2026-10-14): the request form sends answers to the leads endpoint with its tool and signed
 *  fill time, shows the reply, and continues to the deposit only when the server offers one. */
const TOOL = { id: 'tlaaaaaaaaaaaaaaaaaa', kind: 'request', status: 'approved', title: 'Pide tu diagnóstico', words: { cta: 'Enviar solicitud' }, layout: 'card', request: { fields: [
  { id: 'empresa', label: 'Empresa', type: 'text', required: true },
  { id: 'fecha', label: 'Fecha preferida', type: 'date', required: true },
  { id: 'area', label: 'Área', type: 'choice', required: true, choices: ['Finanzas', 'Ventas'] },
  { id: 'telefono', label: 'Teléfono', type: 'phone', required: false },
], deposit: 'deposit_1', reply: 'Recibimos tu solicitud. Te escribimos en un día hábil.' } };
const ANTICIPO = { id: 'deposit_1', name: 'Anticipo de diagnóstico', amount: 15000, currency: 'BOB', stock: null, purchaseLimit: null, imageUrls: [], variants: [], extras: [] };
const DATA = { storeName: 'Brújula', checkoutMode: 'payment', items: [ANTICIPO], tools: [TOOL] };
const MOUNT = '<main><div data-pagosya-tool="tlaaaaaaaaaaaaaaaaaa"></div></main><section data-pagosya-cart></section><p data-pagosya-status></p>';
const TOKEN = '1760529600000.' + 'A'.repeat(43);
afterEach(closeKits);
const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
function fill(doc: Document, w: any) {
  const set = (name: string, value: string) => { const field = doc.querySelector(`[name="${name}"]`) as HTMLInputElement; field.value = value; field.dispatchEvent(new w.Event('input')); };
  set('name', 'Lucía'); set('email', 'lucia@gmail.com'); set('field:empresa', 'Andes SRL'); set('field:fecha', '2026-11-02'); set('field:area', 'Ventas');
}
function boot(lead: unknown, options: { preview?: boolean } = {}) {
  return bootKit(DATA, {}, { body: MOUNT, preview: options.preview, route: async (url: string) => url.endsWith('/store') ? { ok: true, body: DATA } : url.endsWith('/form-token') ? { ok: true, body: { token: TOKEN } } : url.endsWith('/leads') ? { ok: true, body: lead } : { ok: false, body: {} } });
}

describe('request (spec 2026-10-14, part b)', () => {
  it('labels every field, keeps the honeypot out of reach, and sends answers with the tool and its token', async () => {
    const { w, doc, calls } = boot({ submitted: true, leadId: 'lead_1', deposit: null });
    await settle(300);
    for (const field of doc.querySelectorAll('[data-tool-form] input:not([name=website]),[data-tool-form] select')) expect((field as HTMLInputElement).labels!.length).toBe(1);
    const honeypot = doc.querySelector('input[name=website]') as HTMLInputElement;
    expect([honeypot.tabIndex, honeypot.closest('[aria-hidden=true]') !== null]).toEqual([-1, true]);
    fill(doc, w);
    (doc.querySelector('[data-tool-form]') as HTMLFormElement).requestSubmit();
    await settle(200);
    expect(calls.find(call => call.url.endsWith('/leads'))!.body).toEqual({ items: [], toolId: TOOL.id, formToken: TOKEN, website: '', name: 'Lucía', email: 'lucia@gmail.com',
      fields: [{ id: 'empresa', value: 'Andes SRL' }, { id: 'fecha', value: '2026-11-02' }, { id: 'area', value: 'Ventas' }] });
    expect(text(doc.querySelector('[data-tool-status]'))).toBe('Recibimos tu solicitud. Te escribimos en un día hábil.');
    expect(doc.querySelector('[data-tool-deposit]')).toBeNull();
  });

  it('with a deposit, offers it and continues to checkout with the deposit product and its lead', async () => {
    const { w, doc } = boot({ submitted: true, leadId: 'lead_1', deposit: { productId: 'deposit_1', token: 'B'.repeat(43) } });
    await settle(300);
    fill(doc, w);
    (doc.querySelector('[data-tool-form]') as HTMLFormElement).requestSubmit();
    await settle(200);
    const pay = doc.querySelector('[data-tool-deposit]') as HTMLButtonElement;
    expect(text(pay)).toMatch(/^Pagar el anticipo · Bs\s?150,00$/);
    pay.click();
    expect(serialized(w)).toEqual([{ id: 'deposit_1', quantity: 1, leadDeposit: { leadId: 'lead_1', token: 'B'.repeat(43) } }]);
  });

  it('a deposit product that was deleted: the reply shows and no payment is offered', async () => {
    const { w, doc } = boot({ submitted: true, leadId: 'lead_1', deposit: { productId: 'gone', token: 'B'.repeat(43) } });
    await settle(300);
    fill(doc, w);
    (doc.querySelector('[data-tool-form]') as HTMLFormElement).requestSubmit();
    await settle(200);
    expect(text(doc.querySelector('[data-tool-status]'))).toContain('Recibimos tu solicitud');
    expect(doc.querySelector('[data-tool-deposit]')).toBeNull();
  });

  it('announces a missing required answer and sends nothing; a preview never sends', async () => {
    const live = boot({ submitted: true, leadId: 'lead_1', deposit: null });
    await settle(300);
    (live.doc.querySelector('[data-tool-form]') as HTMLFormElement).requestSubmit();
    expect(text(live.doc.querySelector('[data-tool-error]'))).toBe('Completa «Nombre».');
    expect(live.calls.some(call => call.url.endsWith('/leads'))).toBe(false);
    const preview = boot({ submitted: true }, { preview: true });
    await settle(300);
    fill(preview.doc, preview.w);
    (preview.doc.querySelector('[data-tool-form]') as HTMLFormElement).requestSubmit();
    await settle(100);
    expect(text(preview.doc.querySelector('[data-tool-status]'))).toBe('Prueba completada. Tu solicitud no se envió al comercio.');
    expect(preview.calls.some(call => call.url.endsWith('/leads') || call.url.endsWith('/form-token'))).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and see it fail.**
  - Run: `cd apps/api && npx jest src/store-tools/kit-tool-request.spec.ts`
  - Expected: FAIL. No `form[data-tool-form]` is drawn.

- [ ] **Step 3: Write the part.** Create `packages/storefront-kit/commerce-src/business-tools/request.js`:
```js
  // Business tools (spec 2026-10-14, part b): the quote or booking request.
  // - The approved fields, a hidden honeypot and the signed fill time (plan a) go to the leads endpoint with the tool's id.
  // - The reply is shown; with a deposit the shopper continues to checkout for the deposit product.
  // - On a published store pagosYa's own dialog asks for name, email and phone, so the frame never draws them, nor any
  //   phone-type field.
  function requestTool(host, tool, ctx) {
    const view = toolFrame(host, tool, ctx);
    const esc = ctx.escape;
    const fields = tool.request.fields.filter(field => !(ctx.hosted && field.type === 'phone'));
    const contact = ctx.hosted ? [] : [
      { name: 'name', label: 'Nombre', type: 'text', required: true, autocomplete: 'name', max: 120 },
      { name: 'email', label: 'Correo', type: 'email', required: true, autocomplete: 'email', max: 254 },
      { name: 'phone', label: 'WhatsApp (opcional)', type: 'tel', required: false, autocomplete: 'tel', max: 40 },
    ];
    const field = (id, label, inner) => `<div class="pyt-field"><label for="${id}">${esc(label)}</label>${inner}</div>`;
    const control = item => {
      const id = `${view.id}-${item.id}`, name = `field:${item.id}`, required = item.required ? ' required aria-required="true"' : '';
      if (item.type === 'choice') return field(id, item.label, `<select id="${id}" name="${esc(name)}"${required}><option value="">Elige…</option>${item.choices.map(choice => `<option>${esc(choice)}</option>`).join('')}</select>`);
      const type = item.type === 'date' ? 'date' : item.type === 'phone' ? 'tel' : 'text';
      return field(id, item.label, `<input id="${id}" name="${esc(name)}" type="${type}"${item.type === 'number' ? ' inputmode="decimal"' : ''} maxlength="400" autocomplete="off"${required}>`);
    };
    view.body.innerHTML = '<form data-tool-form novalidate>'
      + contact.map(item => field(`${view.id}-${item.name}`, item.label, `<input id="${view.id}-${item.name}" name="${item.name}" type="${item.type}" autocomplete="${item.autocomplete}" maxlength="${item.max}"${item.required ? ' required aria-required="true"' : ''}>`)).join('')
      + fields.map(control).join('')
      + '<div class="pyt-hp" aria-hidden="true"><label>No completes este campo<input name="website" type="text" tabindex="-1" autocomplete="off"></label></div>'
      + (ctx.hosted ? '<p class="pyt-note">Tus datos de contacto se escriben en un formulario seguro de pagosYa.</p>' : '')
      + `<button type="submit" class="checkout-button pyt-add" data-tool-submit>${esc(ctx.locked ? 'Disponible al aprobar' : tool.words.cta)}</button></form>`;
    const form = view.body.querySelector('[data-tool-form]'), submit = view.body.querySelector('[data-tool-submit]');
    let token = '';
    if (ctx.locked) submit.disabled = true;
    else if (ctx.live) ctx.formToken(tool.id).then(value => { token = value; }, () => { submit.disabled = true; view.error('Este formulario no está disponible ahora. Intenta más tarde.'); });
    const labelOf = item => (item.labels && item.labels[0] ? item.labels[0].textContent : item.name).replace(/ \(opcional\)$/, '');
    function invalid() {
      for (const item of form.querySelectorAll('input:not([name=website]),select')) {
        const value = item.value.trim();
        const wrong = (item.required && !value) || (value && item.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) || (value && item.type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(value));
        item.setAttribute('aria-invalid', String(Boolean(wrong)));
        if (wrong) return { item, message: `${item.required && !value ? 'Completa' : 'Revisa'} «${labelOf(item)}».` };
      }
      return null;
    }
    form.addEventListener('input', event => { if (event.target.matches('[aria-invalid=true]')) event.target.setAttribute('aria-invalid', 'false'); });
    form.addEventListener('submit', event => {
      event.preventDefault();
      if (submit.disabled) return;
      view.error('');
      const problem = invalid();
      if (problem) { view.error(problem.message); problem.item.setAttribute('aria-describedby', `${view.id}-error`); problem.item.focus(); return; }
      if (!ctx.live) { view.status('Prueba completada. Tu solicitud no se envió al comercio.'); return; }
      const value = name => (form.querySelector(`[name="${name}"]`) || {}).value || '';
      const body = { items: [], toolId: tool.id, formToken: token, website: value('website'),
        ...(ctx.hosted ? {} : { name: value('name').trim(), email: value('email').trim(), ...(value('phone').trim() ? { phone: value('phone').trim() } : {}) }),
        fields: fields.map(item => ({ id: item.id, value: value(`field:${item.id}`).trim() })).filter(answer => answer.value) };
      submit.disabled = true;
      view.status('Enviando…');
      ctx.submitRequest(body).then(result => {
        form.hidden = true;
        view.status(tool.request.reply);
        const deposit = result && result.deposit;
        const product = deposit ? ctx.product(deposit.productId) : null;
        if (!product || typeof result.leadId !== 'string') return;
        const pay = document.createElement('button');
        pay.type = 'button';
        pay.className = 'checkout-button pyt-add';
        pay.setAttribute('data-tool-deposit', '');
        pay.textContent = `Pagar el anticipo · ${ctx.money(product.amount, product.currency)}`;
        pay.addEventListener('click', () => { if (!ctx.startDeposit(deposit, result.leadId, pay)) view.error('El anticipo ya no está disponible. La tienda te contactará.'); });
        view.body.appendChild(pay);
      }, error => { submit.disabled = false; view.status(''); view.error(error && error.message ? error.message : 'No se pudo enviar. Inténtalo otra vez.'); });
    });
  }
  TOOL_RENDERERS.request = requestTool;
```
- In `tools/build-commerce.mjs`, insert `'business-tools/request.js',` after `'business-tools/builder.js',`.
- Run: `node packages/storefront-kit/tools/build-commerce.mjs`.

- [ ] **Step 4: The hosted bridge.**

(a) In `apps/checkout/src/trusted-form.ts`, `collectPersonalFields`, before `if (action === 'lead') {`, add:
```ts
  // A business tool's request (spec 2026-10-14): its answers come from the tool; this dialog only asks who is asking.
  if (action === 'lead' && typeof body.toolId === 'string') {
    const values = await trustedForm({ title: `Tus datos para ${name}`, intro: 'Se envían solo a la tienda, con tu solicitud.', submitLabel: 'Enviar solicitud', ...previous, fields: [
      { name: 'name', label: 'Nombre', type: 'text', required: true, maxLength: 120, autocomplete: 'name' },
      { name: 'email', label: 'Correo', type: 'email', required: true, maxLength: 254, autocomplete: 'email' },
      { name: 'phone', label: 'WhatsApp / Teléfono', type: 'tel', maxLength: 40, autocomplete: 'tel' },
    ] });
    return values && { name: values.name, email: values.email, phone: values.phone || undefined };
  }
```

(b) In `apps/checkout/src/source-storefront.ts`:
- After the `leadDeposit` guard from Task 5, add:
```ts
/** A tool request's own fields, by shape (spec 2026-10-14); the API checks them against the approved tool. */
export function toolLeadFields(body: Record<string, unknown>) {
  const toolId = typeof body.toolId === 'string' && /^tl[a-f0-9]{18}$/.test(body.toolId) ? body.toolId : undefined;
  if (!toolId) return {};
  const answers = Array.isArray(body.fields) ? body.fields.slice(0, 12) : [];
  const fields = answers.flatMap(answer => {
    const entry = answer && typeof answer === 'object' ? answer as { id?: unknown; value?: unknown } : {};
    return typeof entry.id === 'string' && /^[a-z0-9][a-z0-9-]{0,31}$/.test(entry.id) && typeof entry.value === 'string' && entry.value.length <= 400 ? [{ id: entry.id, value: entry.value }] : [];
  });
  return { toolId, fields, website: typeof body.website === 'string' ? body.website.slice(0, 200) : '', formToken: typeof body.formToken === 'string' && /^\d{13}\.[A-Za-z0-9_-]{43}$/.test(body.formToken) ? body.formToken : undefined };
}
```
- In the payload expression, replace `: { items: [], name: body.name, email: body.email, phone: body.phone, message: body.message, ...leadOrigin(frameBody) };` with:
```ts
        : { items: [], name: body.name, email: body.email, phone: body.phone, message: body.message, ...leadOrigin(frameBody), ...toolLeadFields(frameBody) };
```
- Replace `} else reply(true, shipping || content ? json : { submitted: true });` with:
```ts
      } else reply(true, shipping || content ? json : frameBody.toolId ? { submitted: true, leadId: json.leadId ?? null, deposit: json.deposit ?? null } : { submitted: true });
```

- [ ] **Step 5: Append the bridge test.** Append to `apps/checkout/test/source-storefront-tools.test.ts`:
```ts
describe('hosted tool request', () => {
  it('sends the tool fields with the trusted contact, nothing personal from the frame, and returns the deposit to the frame', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => site() }));
    await mountPublishedSource(document.querySelector('#app')!, 'lecheria', store, vi.fn(), false);
    const frame = document.querySelector('iframe')!;
    const reply = vi.spyOn(frame.contentWindow!, 'postMessage');
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ submitted: true, leadId: 'lead_1', deposit: { productId: 'deposit_1', token: 'B'.repeat(43) } }) } as Response);
    send(frame, { type: 'pagosya:hosted-request', id: 5, action: 'lead', body: { items: [], toolId: 'tlaaaaaaaaaaaaaaaaaa', formToken: '1760529600000.' + 'A'.repeat(43), website: '', name: 'Frame name', email: 'frame@evil.test', fields: [{ id: 'empresa', value: 'Andes SRL' }, { id: 'x', value: 'y'.repeat(401) }], amount: 1 } });
    await vi.waitFor(() => expect(reply).toHaveBeenCalled());
    const lead = JSON.parse(vi.mocked(fetch).mock.calls.at(-1)![1]!.body as string);
    expect(lead).toEqual({ items: [], name: 'Ana', email: 'ana@mail.com', toolId: 'tlaaaaaaaaaaaaaaaaaa', fields: [{ id: 'empresa', value: 'Andes SRL' }], website: '', formToken: '1760529600000.' + 'A'.repeat(43) });
    expect(reply.mock.calls[0][0]).toMatchObject({ result: { ok: true, body: { submitted: true, leadId: 'lead_1', deposit: { productId: 'deposit_1', token: 'B'.repeat(43) } } } });
  });
});
```

- [ ] **Step 6: Append the browser test.** Append to `store-tools-browser.spec.ts`:
```ts
const REQ = { id: 'tlaaaaaaaaaaaaaaaaaa', kind: 'request', status: 'approved', title: 'Pide tu diagnóstico', words: { cta: 'Enviar solicitud' }, layout: 'card', request: { fields: [{ id: 'empresa', label: 'Empresa', type: 'text', required: true }, { id: 'area', label: 'Área', type: 'choice', required: true, choices: ['Finanzas', 'Ventas'] }], reply: 'Recibimos tu solicitud.' } };
describe.each([1440, 390])('request at %ipx (spec 2026-10-14, part b)', width => {
  it('is labelled, 44 px, inside the page, and the keyboard never reaches the honeypot', async () => {
    const page = await openTool({ storeName: 'Brújula', checkoutMode: 'payment', items: [], tools: [REQ] }, REQ.id, width);
    try {
      expect(await audit(page)).toEqual({ small: [], unlabelled: [], wide: false });
      const order: string[] = [];
      await page.locator('[name=name]').focus();
      for (let i = 0; i < 6; i++) { order.push(await page.evaluate(() => (document.activeElement as HTMLInputElement | null)?.name || '')); await page.keyboard.press('Tab'); }
      expect(order).toEqual(['name', 'email', 'phone', 'field:empresa', 'field:area', '']);
      await page.keyboard.press('Shift+Tab');
      await page.keyboard.press('Enter');
      expect(await page.locator('[role=alert]').textContent()).toBe('Completa «Nombre».');
    } finally { await page.close(); }
  });
});
```
The submit button has no `name`, so the last focused element reads `''`.

- [ ] **Step 7: Run them and see them pass.**
  - Run: `cd apps/api && npx jest src/store-tools/kit-tool-request.spec.ts`. Expected: PASS.
  - Run: `cd apps/api && npx jest src/store-tools/store-tools-browser.spec.ts`. Expected: PASS.
  - Run: `cd apps/checkout && npx vitest run test/source-storefront-tools.test.ts test/source-storefront.test.ts`. Expected: PASS.
  - Run: `node --test packages/storefront-kit/tools/build-commerce.test.mjs`. Expected: PASS.

- [ ] **Step 8: Commit.**
```bash
git add packages/storefront-kit/commerce-src/business-tools/request.js packages/storefront-kit/tools/build-commerce.mjs packages/storefront-kit/kit/commerce.js apps/checkout/src/source-storefront.ts apps/checkout/src/trusted-form.ts apps/api/src/store-tools/kit-tool-request.spec.ts apps/api/src/store-tools/store-tools-browser.spec.ts apps/checkout/test/source-storefront-tools.test.ts
git commit -m "feat(tools): the request form — approved fields, honeypot, signed fill time, reply and deposit; hosted bridge

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Catalog cards, the product page, deposit products, the publish probe, and the Studio rebuild

**Existing code (commerce-src parts):**
- **`catalog/cards.js`, `productCard(p)`.**
  - `const complex = p.variants?.length || p.extras?.length;`
  - The price `<strong class="menu-item__price">${isMembership(p) ? escape(membershipPriceText(p)) : money(price(p), p.currency)}</strong>`.
  - The button chain `… : soldOut(p) && complex ? … : complex ? optionGroups(p) ? …`.
- **`product/bundles-related.js`.** `const simpleProduct = (item) => !item.variants?.length && !item.extras?.length;`
- **`product/page.js`, `openProduct(id, trigger)`.**
  - The purchase chain inside `detail.innerHTML` begins `${isMembership(p) ? membershipMarkup(p) : groups ? …`.
  - After it come `detail.removeAttribute('data-page-template');` and `applyProductPageTemplate();`.
  - The buybox classifier `child.matches('.product-detail__pricing,…,.product-detail__purchase,.product-detail__buy,…')`.
- **`catalog/render.js`, `render()`.** `const selected = products().filter((p) => category === "all" || p.categoryId === category);`
- **`apps/merchant-studio/src/source-checks.ts`, `checkSourceWebsite`.** `productId = items?.find((p: any) => available(p) && !p.variants?.length && !p.extras?.length)?.id`, followed by its `||` fallback line.

**Files:**
- Modify (parts):
  - `packages/storefront-kit/commerce-src/catalog/cards.js`
  - `product/bundles-related.js`
  - `product/page.js`
  - `catalog/render.js`
  - `business-tools/mount.js`
- Modify (generated): `packages/storefront-kit/kit/commerce.js`
- Modify: `apps/merchant-studio/src/source-checks.ts`
- Create (tests): `apps/api/src/store-tools/kit-tool-pages.spec.ts`, `apps/merchant-studio/src/source-checks-tools.test.ts`

**Interfaces:**
- Produces:
  - `function mountInlineTool(host, p)` (mount.js). The product page of a unit or builder product mounts a calculator or builder (layout `inline`, no heading) in place of the buy button.
  - Catalog cards of those products open their page («Elegir cantidad», «Armar»).
  - Deposit products of request tools never show in catalog listings.
  - `export function sourceProbeProductId(items: any[]): string` (source-checks.ts).

- [ ] **Step 1: Write the failing tests.**

(a) Create `apps/api/src/store-tools/kit-tool-pages.spec.ts`:
```ts
import { bootKit, closeKits, serialized, settle } from './kit-runtime.testing';

/** Business tools part b (spec 2026-10-14): unit and builder products sell through their tools everywhere the kit shows them. */
const LECHE = { id: 'leche', name: 'Leche entera', amount: 720, currency: 'BOB', stock: null, purchaseLimit: null, imageUrls: [], variants: [], extras: [], unit: { label: 'L', step: 0.5, min: 1, max: 100 }, tiers: [{ from: 1, unitAmount: 720 }, { from: 15, unitAmount: 690 }], optionGroups: [] };
const TORTA = { id: 'torta', name: 'Torta', amount: 15000, currency: 'BOB', stock: null, purchaseLimit: null, imageUrls: [], variants: [], extras: [], unit: null, tiers: [], optionGroups: [{ id: 'size', label: 'Tamaño', type: 'single', required: true, choices: [{ id: 's', label: 'Chica', amountDelta: 0 }] }] };
const ANTICIPO = { id: 'deposit_1', name: 'Anticipo de diagnóstico', amount: 15000, currency: 'BOB', stock: null, purchaseLimit: null, imageUrls: [], variants: [], extras: [] };
const CAFE = { id: 'cafe', name: 'Café', amount: 8000, currency: 'BOB', stock: null, purchaseLimit: null, imageUrls: [], variants: [], extras: [] };
const REQ = { id: 'tlaaaaaaaaaaaaaaaaaa', kind: 'request', status: 'approved', title: 'Pide', words: { cta: 'Enviar' }, layout: 'card', request: { fields: [{ id: 'empresa', label: 'Empresa', type: 'text', required: true }], deposit: 'deposit_1', reply: 'Gracias.' } };
const DATA = { storeName: 'Tienda', checkoutMode: 'payment', items: [LECHE, TORTA, ANTICIPO, CAFE], tools: [REQ] };
afterEach(closeKits);
const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

describe('tool products in the catalog and on the product page (spec 2026-10-14, part b)', () => {
  it('cards open the product instead of adding a piece, show the price per unit, and hide deposit products', async () => {
    const { doc } = bootKit(DATA, {}, { preview: true });
    await settle(300);
    const card = (id: string) => [...doc.querySelectorAll('[data-pagosya-catalog] .menu-item')].find(item => item.querySelector(`[data-product="${id}"],[data-add="${id}"]`));
    expect(text(card('leche')!.querySelector('.menu-add'))).toBe('Elegir cantidad');
    expect(text(card('leche')!.querySelector('.menu-item__price'))).toMatch(/^Bs\s?7,20\/L$/);
    expect(text(card('torta')!.querySelector('.menu-add'))).toBe('Armar');
    expect(card('deposit_1')).toBeUndefined();
    expect(card('cafe')!.querySelector('[data-add="cafe"]')).not.toBeNull();
    expect(doc.querySelector('[data-pagosya-catalog] [data-add="leche"]')).toBeNull();
  });

  it('the product page of a unit product sells through an inline calculator', async () => {
    const { w, doc } = bootKit(DATA, { productPage: 'product.html' }, { preview: true, query: '?id=leche', body: '<main><div data-pagosya-product data-pagosya-product-page></div></main><section data-pagosya-cart></section><p data-pagosya-status></p>' });
    await settle(300);
    const host = doc.querySelector('[data-pagosya-tool-inline]')!;
    expect(host.querySelector('.pyt-title')).toBeNull();
    expect(host.querySelector('[data-tool-units]')).not.toBeNull();
    expect(doc.querySelector('.product-detail__buy[data-add]')).toBeNull();
    (host.querySelector('[data-tool-add]') as HTMLButtonElement).click();
    expect(serialized(w)).toEqual([{ id: 'leche', quantity: 2 }]);
  });
});
```

(b) Create `apps/merchant-studio/src/source-checks-tools.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { sourceProbeProductId } from './source-checks';

/** Business tools part b (spec 2026-10-14): the publish probe buys a plain product, never one sold through a tool. */
describe('sourceProbeProductId', () => {
  it('skips unit and builder products and sold-out ones', () => {
    expect(sourceProbeProductId([
      { id: 'leche', stock: null, unit: { label: 'L', step: 0.5, min: 1, max: 100 }, variants: [], extras: [] },
      { id: 'torta', stock: null, optionGroups: [{ id: 'size' }], variants: [], extras: [] },
      { id: 'agotado', stock: 0, variants: [], extras: [] },
      { id: 'cafe', stock: null, variants: [], extras: [] },
    ])).toBe('cafe');
    expect(sourceProbeProductId([{ id: 'leche', unit: { label: 'L' }, variants: [], extras: [] }])).toBe('');
  });
});
```

- [ ] **Step 2: Run them and see them fail.**
  - Run: `cd apps/api && npx jest src/store-tools/kit-tool-pages.spec.ts`. Expected: FAIL; the unit card still shows the "+" button.
  - Run: `cd apps/merchant-studio && npx vitest run src/source-checks-tools.test.ts`. Expected: FAIL, because `sourceProbeProductId` is not exported.

- [ ] **Step 3: The parts.**

(a) **`catalog/cards.js`, `productCard(p)`.**
- Replace `const complex = p.variants?.length || p.extras?.length;` with `const complex = p.variants?.length || p.extras?.length || toolProduct(p);`.
- Replace `<strong class="menu-item__price">${isMembership(p) ? escape(membershipPriceText(p)) : money(price(p), p.currency)}</strong>` with:
```js
<strong class="menu-item__price">${isMembership(p) ? escape(membershipPriceText(p)) : money(price(p), p.currency) + (sellingUnit(p) ? '/' + escape(sellingUnit(p).label) : '')}</strong>
```
- In the same template, replace the first ` : soldOut(p) && complex ? ` with:
```js
 : soldOut(p) && complex ? `<button class="menu-add" type="button" disabled aria-label="${escape(p.name)} agotado">Agotado</button>` : toolProduct(p) ? `<button class="menu-add" type="button" data-product="${escape(p.id)}" aria-label="${escape((sellingUnit(p) ? 'Elegir cantidad de ' : 'Armar ') + p.name)}">${sellingUnit(p) ? 'Elegir cantidad' : 'Armar'}</button>` : soldOut(p) && complex ? 
```
The old `soldOut(p) && complex ?` branch stays after it. It is unreachable for tool products and unchanged for every other product.

(b) **`product/bundles-related.js`.** Replace `const simpleProduct = (item) => !item.variants?.length && !item.extras?.length;` with:
```js
  const simpleProduct = (item) => !item.variants?.length && !item.extras?.length && !toolProduct(item);
```

(c) **`product/page.js`, `openProduct`.**
- In the `detail.innerHTML` template, replace `${isMembership(p) ? membershipMarkup(p) : groups ?` with:
```js
${isMembership(p) ? membershipMarkup(p) : toolProduct(p) ? (limit(p) === 0 ? '<p>Agotado</p>' : '<div class="product-detail__tool" data-pagosya-tool-inline></div>') : groups ?
```
- After `detail.removeAttribute('data-page-template');` and `applyProductPageTemplate();`, add:
```js
    mountInlineTool(detail.querySelector('[data-pagosya-tool-inline]'), p);
```
- In the buybox classifier selector, add `.product-detail__tool` right after `.product-detail__purchase`.

(d) **`catalog/render.js`, `render()`.** Replace `const selected = products().filter((p) => category === "all" || p.categoryId === category);` with:
```js
      // A request tool's deposit product is paid after the request, never browsed (spec 2026-10-14).
      const deposits = new Set(toolDefinitions().map(tool => tool.request?.deposit).filter(Boolean));
      const selected = products().filter((p) => (category === "all" || p.categoryId === category) && !deposits.has(p.id));
```

(e) **`business-tools/mount.js`.** Append:
```js
  /** The product page of a unit or builder product sells through its tool: a calculator or a builder in place of the buy
   *  button, under the page's own heading. */
  function mountInlineTool(host, p) {
    if (!host) return;
    const unit = sellingUnit(p);
    const tool = unit
      ? { id: `inline-${p.id}`, kind: 'calculator', status: 'approved', title: '', words: { cta: 'Añadir' }, layout: 'inline', calculator: { productId: p.id, presets: [], showTiers: true } }
      : { id: `inline-${p.id}`, kind: 'builder', status: 'approved', title: '', words: { cta: 'Añadir al pedido' }, layout: 'inline', builder: { productId: p.id, steps: builderGroups(p).map(group => group.id), summary: true } };
    if (!toolUsable(tool)) { host.innerHTML = `<p>${store.checkoutMode === 'payment' ? 'Agotado' : 'Consulta este producto con la tienda.'}</p>`; return; }
    TOOL_RENDERERS[tool.kind](host, tool, toolContext(tool));
  }
```

(f) Run: `node packages/storefront-kit/tools/build-commerce.mjs`.

- [ ] **Step 4: The publish probe.** In `apps/merchant-studio/src/source-checks.ts`:
- Add above `checkSourceWebsite`:
```ts
/** The product the publish check buys: a plain one in stock. A product sold by unit or built from options is sold through
 *  its business tool (spec 2026-10-14), not a "+" button, so the probe never picks it. */
export function sourceProbeProductId(items: any[]): string {
  const available = (p: any) => p.stock !== 0 && p.purchaseLimit !== 0;
  const tool = (p: any) => Boolean(p.unit || p.optionGroups?.length);
  return items?.find((p: any) => available(p) && !tool(p) && !p.variants?.length && !p.extras?.length)?.id
    || items?.find((p: any) => available(p) && !tool(p) && p.variants?.length && !p.extras?.length && p.variants.some((v: any) => v?.stock !== 0))?.id || '';
}
```
- In `checkSourceWebsite`, replace:
```ts
    productId = items?.find((p: any) => available(p) && !p.variants?.length && !p.extras?.length)?.id
      || items?.find((p: any) => available(p) && p.variants?.length && !p.extras?.length && p.variants.some((v: any) => v?.stock !== 0))?.id || '';
```
with:
```ts
    productId = sourceProbeProductId(items);
```
Leave the local `available` constant in place; the next lines still use it.

- [ ] **Step 5: Run them and the kit specs, and see them pass.**
  - Run: `cd apps/api && npx jest src/store-tools/kit-tool-pages.spec.ts src/store-tools/kit-tool-cart.spec.ts src/store-tools/kit-tools-mount.spec.ts src/storefront-source/source-commerce-surfaces-draw.spec.ts --maxWorkers=2`. Expected: PASS.
  - Run: `cd apps/merchant-studio && npx vitest run src/source-checks-tools.test.ts src/source-checks.test.ts`. Expected: PASS.
  - Run: `node --test packages/storefront-kit/tools/build-commerce.test.mjs && node packages/storefront-kit/kit/check-runtimes.mjs`. Expected: PASS.

- [ ] **Step 6: Commit.**
```bash
git add packages/storefront-kit/commerce-src/catalog/cards.js packages/storefront-kit/commerce-src/product/bundles-related.js packages/storefront-kit/commerce-src/product/page.js packages/storefront-kit/commerce-src/catalog/render.js packages/storefront-kit/commerce-src/business-tools/mount.js packages/storefront-kit/kit/commerce.js apps/merchant-studio/src/source-checks.ts apps/api/src/store-tools/kit-tool-pages.spec.ts apps/merchant-studio/src/source-checks-tools.test.ts
git commit -m "feat(tools): tool products sell through their tools on cards and product pages; deposits stay out of the catalog

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 7: Rebuild the embedded Studio.** The dashboard serves a pre-built Studio that carries `commerce.js` through a `?raw` import. Without a rebuild, the owner's Studio previews never show a tool.
  - Run: `cd apps/merchant-dashboard && pnpm run build:studio 2>&1 | tail -3 && grep -l "data-pagosya-tool" public/studio/assets/*.js | head -1`
  - Expected: the build ends without errors, and `grep` prints one `public/studio/assets/*.js`.
  - `public/studio/` is git-ignored, so there is nothing to commit.

---

## After this plan

- **Owner step:** `cd apps/api && npx prisma migrate deploy` applies `20261015130000_store_tools`. Until then:
  - `GET /stores/public/:slug/store` fails on `storeTool.findMany`;
  - **apply it before restarting the API with this plan's code**;
  - plan a's migration comes first.
- Plan c (`2026-10-15-business-tools-c-authoring.md`) writes the tools: YAPI's design call, proposal checks, placement, approval.
