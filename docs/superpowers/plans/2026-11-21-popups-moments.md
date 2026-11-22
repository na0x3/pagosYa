# Popups 2.0 Part 2 — Four Moments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every store gets a family of four YAPI popups (welcome, cart rescue, interest, returning shopper); the shopper's browser opens at most the one that fits each visit, and the server records shown / closed / completed.

**Architecture:** `StorePopupDesign` rows gain a `moment` and a `family`. YAPI writes the missing moments in one model call (shared CSS + one entry per moment); each moment is cleaned, shape-checked and browser-checked on its own and repaired alone. `retention.js` gains a pure rule set (`window.PAGOSYA_POPUP_RULES`) and a watcher that turns page signals (leave intent, product views, cart, return visit) into at most one popup per visit; new step kinds (`cart`, `remind`) and `pick` sources are played by the existing flow runtime.

**Tech Stack:** NestJS + Prisma (Postgres), class-validator, Jest (+ Playwright Chromium for runtime checks), plain browser JS in `packages/storefront-kit/kit`, Vitest (jsdom) for the Studio panel.

**Spec:** `docs/superpowers/specs/2026-11-21-popups-moments-design.md` (Part 1: `docs/superpowers/specs/2026-11-18-popups-engine-design.md`)

## Global Constraints

- Moments are exactly `welcome | rescue | interest | return`; priority rescue > interest > return > welcome.
- At most one popup per visit; a visit starts after 30 min without a page view.
- 24 h gap between popups; `rescue` skips the gap but still counts as the visit's popup.
- Closing a popup without acting hides that moment 7 days; a completed welcome never shows again.
- Phone leave intent: scroll up ≥ 60 % of the screen height within 400 ms after 10 s on the page, or the tab visible again after ≥ 20 s hidden. Never hijack the back button.
- Interest: 3 different products of one category in this visit, or 40 s on one product.
- Return: contact saved in this browser, visit 2 or later, 6 s after the visit starts; no contact step.
- One code per shopper: later moments remind the existing code, never issue a second one; a used/expired code is never reminded.
- Events are sent only when the shopper allowed analytics (`PAGOSYA_PRIVACY.choice(slug) === true`); no IP, no user agent; rows deleted after 180 days.
- Family CSS: shared ≤ 24 KB, per-moment own CSS ≤ 6 KB (scoped per design by the existing `scopePopupCss`).
- A failing moment gets up to 2 repairs, alone; it is stored FAILED and stays off, the others go LIVE.
- Stores without a family keep today's single popup and its 30-day rule, untouched.
- Merchant-facing words in Spanish (Bolivia), as the existing popup code.
- Owner rules for this repo: run ONE spec file per test command (`npx jest <file>`), never full `tsc` or multi-suite jest; never `sed -i` on `apps/api` files (use the Edit tool); saving `apps/api` files restarts the dev API — do not edit API files while a YAPI run is going; migrations are applied by the main session only, after `pnpm dev:doctor --backup` (never by a subagent).

## Review Focus

- **Cart emptied or changed while the rescue popup is open** — the cart step must show the current lines (or an empty line and the close), never reveal a code for an empty cart. Pinned in Task 4 (`cart step with an empty cart`).
- **Shopper with a contact but a used code** — rescue/interest must skip both capture and remind, and a flow left with nothing but `cart`/`pick` still opens; `return` with no code just shows products. Pinned in Task 4 (`contact without a code`).
- **localStorage blocked (private mode / sandboxed frame)** — rules must not throw; at most one popup per page view. Pinned in Task 3 (`blocked storage`).
- **Old 30-day key on upgrade** — a shopper who saw today's popup last week must not get the new welcome again. Pinned in Task 3 (`upgrade from the old key`).
- **Another store's code or a code that is not a popup code sent to code-status** — must answer `{ active: false }` without saying whether it exists. Pinned in Task 6 (`code-status refuses foreign and plain codes`).

---

## File Structure

| File | Responsibility |
|---|---|
| `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/20261121120000_popup_moments/migration.sql` | `moment`, `family` on `StorePopupDesign`; new `StorePopupEvent` |
| `apps/api/src/store-popups/popup-flow.ts` (+ spec) | moment types, new step kinds, per-moment shape rules |
| `apps/api/src/store-popups/popup-html.ts` (+ spec) | hooks for `cart` and `remind` |
| `packages/storefront-kit/kit/retention.js` | `PAGOSYA_POPUP_RULES` (pure), flow runtime additions, moments watcher |
| `packages/storefront-kit/kit/commerce.js` | `pagosya:product-viewed` event |
| `apps/api/src/retention/popup-moment-rules.spec.ts` | rule table tests (vm, no browser) |
| `apps/api/src/store-popups/popup-flow-render.ts` (+ spec) | browser check with a moment context |
| `apps/api/src/retention/popup-moments-runtime.spec.ts` | watcher end to end in Chromium (fake clock, fake API) |
| `apps/api/src/retention/retention.service.ts`, `retention.controller.ts`, `retention.dto.ts` (+ `retention-popup-design.spec.ts`) | serve the family, events, code-status |
| `apps/api/src/store-popups/popup-events-cleanup.job.ts` (+ spec) | nightly 180-day delete |
| `apps/api/src/store-popups/popup-design-prompt.ts` (+ spec) | family prompt + schema; moment-aware single prompt |
| `apps/api/src/store-popups/popup-design.service.ts` (+ spec) | `designFamily`; per-moment retire/restore/overview/settings |
| `apps/api/src/store-popups/popup-chat.ts` (+ spec), `popup-design.controller.ts` | moment words in chat; moment in settings |
| `apps/api/scripts/design-popups.ts` | `--moments` |
| `apps/merchant-studio/src/popup-designs-panel.ts` (+ test), `src/api.ts` | four cards |

---

### Task 1: Data — moments, families, events

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (model `StorePopupDesign` ~line 3935; model `Store` relation list ~line 1260)
- Create: `apps/api/prisma/migrations/20261121120000_popup_moments/migration.sql`

**Interfaces:**
- Produces: Prisma fields `StorePopupDesign.moment: string` (default `"welcome"`), `StorePopupDesign.family: string | null`; model `StorePopupEvent { id, storeId, designId, moment, visitor, kind, step, createdAt }`; client accessor `prisma.storePopupEvent`.

- [ ] **Step 1: Edit the schema**

In `model StorePopupDesign` add after `previews`:

```prisma
  /// Popups 2.0 part 2 (spec 2026-11-21): welcome | rescue | interest | return; one LIVE row per store and moment.
  moment      String            @default("welcome")
  /// The run that wrote this design; the moments written together share it.
  family      String?
```

and add `@@index([storeId, moment, status])` next to the existing indexes. In `model Store` next to `popupDesigns StorePopupDesign[]` add `popupEvents StorePopupEvent[]`. Add the new model after `StorePopupDesign`:

```prisma
/// Popups 2.0 part 2 (spec 2026-11-21 §4): what shoppers did with each popup — sent only with analytics consent; no IP, no
/// user agent, never a contact. Deleted after 180 days (popup-events-cleanup).
model StorePopupEvent {
  id        String   @id @default(cuid())
  storeId   String
  store     Store    @relation(fields: [storeId], references: [id], onDelete: Cascade)
  designId  String
  moment    String
  visitor   String
  kind      String
  step      String?
  createdAt DateTime @default(now())

  @@index([storeId, createdAt])
  @@index([designId, kind])
}
```

- [ ] **Step 2: Write the migration**

`apps/api/prisma/migrations/20261121120000_popup_moments/migration.sql`:

```sql
-- Popups 2.0 part 2 (spec 2026-11-21): a popup per moment of the visit, written together as a family, and what shoppers did.
ALTER TABLE "StorePopupDesign" ADD COLUMN "moment" TEXT NOT NULL DEFAULT 'welcome';
ALTER TABLE "StorePopupDesign" ADD COLUMN "family" TEXT;
CREATE INDEX "StorePopupDesign_storeId_moment_status_idx" ON "StorePopupDesign"("storeId", "moment", "status");

CREATE TABLE "StorePopupEvent" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "designId" TEXT NOT NULL,
    "moment" TEXT NOT NULL,
    "visitor" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "step" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StorePopupEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "StorePopupEvent_storeId_createdAt_idx" ON "StorePopupEvent"("storeId", "createdAt");
CREATE INDEX "StorePopupEvent_designId_kind_idx" ON "StorePopupEvent"("designId", "kind");
ALTER TABLE "StorePopupEvent" ADD CONSTRAINT "StorePopupEvent_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

- [ ] **Step 3: Check the schema and generate the client (no DB writes)**

Run: `cd apps/api && npx prisma validate && npx prisma generate`
Expected: `The schema at prisma/schema.prisma is valid` and `Generated Prisma Client`.

- [ ] **Step 4: Main session only — back up, then apply**

Run: `pnpm dev:doctor --backup` then `cd apps/api && npx prisma migrate deploy`
Expected: `Applying migration 20261121120000_popup_moments` … `All migrations have been successfully applied.` A subagent stops after Step 3 and reports; the main session does Step 4.

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20261121120000_popup_moments
git commit -m "feat(popups): moments, families and shopper events in the data (part 2)"
```

---

### Task 2: Flow rules and hooks per moment

**Files:**
- Modify: `apps/api/src/store-popups/popup-flow.ts`
- Modify: `apps/api/src/store-popups/popup-html.ts:70-95` (`hookProblem`)
- Test: `apps/api/src/store-popups/popup-flow.spec.ts`, `apps/api/src/store-popups/popup-html.spec.ts`

**Interfaces:**
- Produces: `POPUP_MOMENTS`, `type PopupMoment`, `isPopupMoment(value)`, `type PickSource`, `PopupStep` with `{ kind: 'cart' }`, `{ kind: 'remind' }`, `pick.source?: PickSource`, `land.to: 'product' | 'scroll' | 'checkout'`; `validateFlow(raw, products, moment: PopupMoment = 'welcome')`; `cleanStepHtml(html, kind)` accepts `'cart' | 'remind'`.

- [ ] **Step 1: Write the failing tests** (append to `popup-flow.spec.ts`)

```ts
describe('flow shape per moment (spec 2026-11-21 §5)', () => {
  const rescue = [{ id: 'k', kind: 'cart' }, { id: 'c', kind: 'capture' }, { id: 'r', kind: 'reveal' }, { id: 'm', kind: 'remind' }, { id: 'l', kind: 'land', to: 'checkout' }];
  it('accepts a rescue flow: the cart first, both branches, checkout last', () => {
    const result = validateFlow(rescue, products, 'rescue');
    expect('flow' in result && result.flow.map(s => s.kind)).toEqual(['cart', 'capture', 'reveal', 'remind', 'land']);
    expect('flow' in result && result.flow[4]).toEqual({ id: 'l', kind: 'land', to: 'checkout' });
  });
  it('names what a rescue flow misses', () => {
    const problems = (validateFlow([rescue[1], rescue[2], rescue[4]], products, 'rescue') as { problems: string[] }).problems.join(' ');
    expect(problems).toMatch(/cart va primero/);
    expect(problems).toMatch(/remind/);
  });
  it('accepts an interest flow that starts with the viewed product, with no fixed products', () => {
    const flow = [{ id: 'p', kind: 'pick', source: 'context', products: [] }, rescue[1], rescue[2], rescue[3], { id: 'l', kind: 'land', to: 'product' }];
    const result = validateFlow(flow, products, 'interest');
    expect('flow' in result && result.flow[0]).toEqual({ id: 'p', kind: 'pick', products: [], source: 'context' });
  });
  it('a return flow has no contact step and picks the favourite or the newest', () => {
    expect('flow' in validateFlow([{ id: 'p', kind: 'pick', source: 'favourite', products: [] }, { id: 'm', kind: 'remind' }, { id: 'l', kind: 'land', to: 'product' }], products, 'return')).toBe(true);
    const problems = (validateFlow([{ id: 'p', kind: 'pick', source: 'new', products: [] }, { id: 'c', kind: 'capture' }], products, 'return') as { problems: string[] }).problems.join(' ');
    expect(problems).toMatch(/regreso va sin capture/);
  });
  it('keeps the welcome rules unchanged when no moment is given', () => {
    expect('flow' in validateFlow(ok, products)).toBe(true);
    expect((validateFlow([{ id: 'a', kind: 'cart' }, { id: 'c', kind: 'capture' }], products) as { problems: string[] }).problems.join(' ')).toMatch(/cart y remind son de los popups de carrito/);
  });
});
```

Append to `popup-html.spec.ts`:

```ts
describe('hooks for the moment steps (spec 2026-11-21 §5)', () => {
  const close = '<button data-close aria-label="Cerrar">×</button>';
  it('a cart step needs one tile with photo and name', () => {
    expect(cleanStepHtml(`<div>${close}<ul><li data-tile><img data-slot="photo" alt=""><b data-slot="name"></b><i data-slot="qty"></i></li></ul><button data-next>Seguir</button></div>`, 'cart')).toHaveProperty('html');
    expect(cleanStepHtml(`<div>${close}<p>Tu carrito</p></div>`, 'cart')).toEqual({ problem: expect.stringMatching(/data-tile/) });
  });
  it('a remind step needs the code slot and an apply button', () => {
    expect(cleanStepHtml(`<div>${close}<b data-slot="code"></b><button data-apply>Usar</button></div>`, 'remind')).toHaveProperty('html');
    expect(cleanStepHtml(`<div>${close}<b data-slot="code"></b></div>`, 'remind')).toEqual({ problem: expect.stringMatching(/data-apply/) });
  });
});
```

(If `cleanStepHtml` is not already imported at the top of `popup-html.spec.ts`, add `import { cleanStepHtml } from './popup-html';`.)

- [ ] **Step 2: Run to see them fail**

Run: `cd apps/api && npx jest src/store-popups/popup-flow.spec.ts` then `npx jest src/store-popups/popup-html.spec.ts`
Expected: FAIL (`Paso desconocido: cart`; `cart`/`remind` hooks not checked).

- [ ] **Step 3: Implement in `popup-flow.ts`**

Replace the head types:

```ts
export const POPUP_STEP_KINDS = ['offer', 'game', 'pick', 'quiz', 'capture', 'reveal', 'land', 'cart', 'remind'] as const;
export type PopupStepKind = (typeof POPUP_STEP_KINDS)[number];
/** Popups 2.0 part 2 (spec 2026-11-21): the moment of the visit a design is for. */
export const POPUP_MOMENTS = ['welcome', 'rescue', 'interest', 'return'] as const;
export type PopupMoment = (typeof POPUP_MOMENTS)[number];
export const isPopupMoment = (value: unknown): value is PopupMoment => POPUP_MOMENTS.includes(value as PopupMoment);
export type PickSource = 'context' | 'favourite' | 'new';
export type QuizQuestion = { id: string; text: string; answers: Array<{ id: string; text: string; products: string[] }> };
export type PopupStep =
  | { id: string; kind: 'offer' }
  | { id: string; kind: 'game'; game: 'scratch' | 'wheel' }
  | { id: string; kind: 'pick'; products: string[]; source?: PickSource }
  | { id: string; kind: 'quiz'; questions: QuizQuestion[] }
  | { id: string; kind: 'capture' }
  | { id: string; kind: 'reveal' }
  | { id: string; kind: 'cart' }
  | { id: string; kind: 'remind' }
  | { id: string; kind: 'land'; to: 'product' | 'scroll' | 'checkout' };
```

Change the signature to `export function validateFlow(raw: unknown, products: readonly string[], moment: PopupMoment = 'welcome')`. In the `switch`:

```ts
      case 'offer': case 'capture': case 'reveal': case 'cart': case 'remind': flow.push({ id, kind: item.kind }); break;
      case 'land': flow.push({ id, kind: 'land', to: item.to === 'scroll' ? 'scroll' : item.to === 'checkout' ? 'checkout' : 'product' }); break;
      case 'pick': {
        const source = ['context', 'favourite', 'new'].includes(item.source) ? item.source as PickSource : undefined;
        flow.push({ id, kind: 'pick', products: (Array.isArray(item.products) ? item.products : []).map(String).filter((p: string) => known.has(p)).slice(0, 6), ...(source ? { source } : {}) });
        break;
      }
```

Replace everything from `const capture = kinds.indexOf('capture')` down to (and including) the `for (const step of flow) if (step.kind === 'pick' …` line with:

```ts
  const capture = kinds.indexOf('capture'), reveal = kinds.indexOf('reveal');
  const shown = flow.filter(step => step.kind !== 'land');
  const land = flow.find(step => step.kind === 'land') as { to: string } | undefined;
  const sourceOf = (step: PopupStep | undefined) => (step && step.kind === 'pick' ? step.source ?? '' : '');
  if (reveal >= 0 && (capture < 0 || capture > reveal)) problems.push('El paso capture va antes que reveal.');
  if (kinds.includes('land') && kinds.indexOf('land') !== kinds.length - 1) problems.push('El paso land va último.');
  if (moment === 'welcome') {
    if (capture < 0) problems.push('Falta el paso capture (WhatsApp o email).');
    if (kinds.includes('cart') || kinds.includes('remind')) problems.push('Los pasos cart y remind son de los popups de carrito, interés y regreso.');
  }
  if (moment === 'rescue') {
    if (shown[0]?.kind !== 'cart') problems.push('En el popup de carrito el paso cart va primero (muestra lo que el comprador eligió).');
    if (land && land.to !== 'checkout') problems.push('En el popup de carrito el paso land lleva to: checkout.');
  }
  if (moment === 'interest' && sourceOf(shown[0]) !== 'context') problems.push('En el popup de interés el primer paso es pick con source: context (el producto que mira).');
  if (moment === 'rescue' || moment === 'interest') {
    if (capture < 0 || reveal < 0) problems.push('Lleva capture y reveal (para quien aún no dejó su contacto).');
    if (!kinds.includes('remind')) problems.push('Lleva un paso remind (para quien ya tiene su código).');
  }
  if (moment === 'return') {
    if (capture >= 0 || reveal >= 0) problems.push('El popup de regreso va sin capture ni reveal: ya tenemos su contacto.');
    if (!shown.some(step => ['favourite', 'new'].includes(sourceOf(step)))) problems.push('El popup de regreso lleva un pick con source: favourite o new.');
  }
  const productSteps = flow.filter(step => (step.kind === 'pick' && !step.source) || step.kind === 'quiz');
  if (productSteps.length && known.size < 2) problems.push('Los pasos de productos necesitan al menos 2 productos en la tienda.');
  for (const step of flow) if (step.kind === 'pick' && !step.source && step.products.length < 2 && known.size >= 2) problems.push(`El paso ${step.id} necesita al menos 2 productos.`);
```

- [ ] **Step 4: Implement the hooks in `popup-html.ts` `hookProblem`**

Read lines 78–83 first: the `pick` block finds the single `[data-tile]` and lists what is inside it. Add, right after the `pick` block, the same check for `cart` (use the exact helper the `pick` block uses for the tile's descendants — named `inside` below):

```ts
  if (kind === 'cart') {
    const tiles = all.filter(el => hasAttr(el, 'data-tile'));
    if (tiles.length !== 1) return 'Hace falta exactamente un [data-tile] (la plantilla de cada producto del carrito).';
    const inside = /* same expression the pick block uses for tiles[0]'s descendants */;
    for (const slot of ['photo', 'name']) if (!inside.some(el => attr(el, 'data-slot') === slot)) return `Falta data-slot="${slot}" dentro de [data-tile].`;
  }
  if (kind === 'remind' && !some('data-slot', 'code')) return 'Falta data-slot="code" (dónde va su código).';
  if (kind === 'remind' && !some('data-apply')) return 'Falta un botón data-apply en remind (usa el código).';
```

Better still: lift the pick block's tile check into a local `const tileProblem = (what: string) => …` and call it from both `pick` and `cart`, so the two can never drift.

- [ ] **Step 5: Run both specs**

Run: `cd apps/api && npx jest src/store-popups/popup-flow.spec.ts` then `npx jest src/store-popups/popup-html.spec.ts`
Expected: PASS, including the old tests.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/store-popups/popup-flow.ts apps/api/src/store-popups/popup-flow.spec.ts apps/api/src/store-popups/popup-html.ts apps/api/src/store-popups/popup-html.spec.ts
git commit -m "feat(popups): cart and remind steps, pick sources and a flow shape per moment"
```

---

### Task 3: Moment rules in the shopper's browser (pure)

**Files:**
- Modify: `packages/storefront-kit/kit/retention.js` (add a block right after the `escape` helper near the top)
- Create: `apps/api/src/retention/popup-moment-rules.spec.ts`

**Interfaces:**
- Produces: `window.PAGOSYA_POPUP_RULES = { visitMemory, chooseMoment, markShown, markClosed, markDone, noteView, loadMemory, saveMemory }`:
  - `visitMemory(raw: object | null, now: number, legacySeen: number): Memory` — normalises and starts a new visit after 30 min.
  - `chooseMoment(memory, { available: string[], signals: string[], cartLines: number }, now): string | null` — signals are any of `welcome | leave | interest | return`.
  - `markShown(memory, moment, now)`, `markClosed(memory, moment, now)`, `markDone(memory, moment, now)` — mutate and return memory.
  - `noteView(memory, { id, categoryId }): boolean` — true when this view is the 3rd different product of one category in the visit.
  - `loadMemory(slug): object | null`, `saveMemory(slug, memory): void` — localStorage key `pagosya:popups:<slug>`, never throw.
  - `Memory = { visitor: string, visits: number, visitStart: number, lastSeenAt: number, visitShown: boolean, lastShownAt: number, closed: Record<string, number>, done: Record<string, number>, contact: boolean, code: string, favourite: string, views: Record<string, string[]> }`

- [ ] **Step 1: Write the failing test** `apps/api/src/retention/popup-moment-rules.spec.ts`

```ts
import { readKitFileSync } from '@pagosya/storefront-kit';
import { Script } from 'node:vm';

/** Popups 2.0 part 2 (spec 2026-11-21 §3, §7): which popup a shopper may see, decided in the browser. */
type Rules = { visitMemory: any; chooseMoment: any; markShown: any; markClosed: any; markDone: any; noteView: any; loadMemory: any; saveMemory: any };
function load(storage?: Record<string, string> | 'blocked'): Rules {
  const store = storage === 'blocked' ? null : storage ?? {};
  const localStorage = {
    getItem: (k: string) => { if (!store) throw new Error('blocked'); return k in store ? store[k] : null; },
    setItem: (k: string, v: string) => { if (!store) throw new Error('blocked'); store[k] = v; },
    removeItem: (k: string) => { if (store) delete store[k]; },
  };
  const window: any = {};
  new Script(readKitFileSync('retention.js')).runInNewContext({ window, localStorage, document: { addEventListener() {}, querySelector: () => null }, crypto: { getRandomValues: (a: Uint8Array) => a.fill(7) } });
  return window.PAGOSYA_POPUP_RULES;
}
const H = 3_600_000, D = 24 * H, T0 = Date.UTC(2026, 10, 21, 15);
const all = ['welcome', 'rescue', 'interest', 'return'];

describe('popup moment rules', () => {
  const R = load();
  const fresh = () => R.visitMemory(null, T0, 0);
  it('a first visitor gets the welcome, and only one popup in the visit', () => {
    const m = fresh();
    expect(m.visits).toBe(1);
    expect(R.chooseMoment(m, { available: all, signals: ['welcome'], cartLines: 0 }, T0)).toBe('welcome');
    R.markShown(m, 'welcome', T0);
    expect(R.chooseMoment(m, { available: all, signals: ['leave'], cartLines: 2 }, T0 + 60_000)).toBeNull();
  });
  it('rescue wins over welcome on leave with a full cart, and skips the 24 h gap in a new visit', () => {
    const m = fresh();
    expect(R.chooseMoment(m, { available: all, signals: ['leave', 'welcome'], cartLines: 1 }, T0)).toBe('rescue');
    R.markShown(m, 'welcome', T0);
    const later = R.visitMemory(m, T0 + 2 * H, 0);
    expect(later.visits).toBe(2);
    expect(R.chooseMoment(later, { available: all, signals: ['leave'], cartLines: 1 }, T0 + 2 * H)).toBe('rescue');
    expect(R.chooseMoment(later, { available: all, signals: ['interest'], cartLines: 1 }, T0 + 2 * H)).toBeNull();
  });
  it('no rescue for an empty cart, nor for a moment the store does not have', () => {
    expect(R.chooseMoment(fresh(), { available: all, signals: ['leave'], cartLines: 0 }, T0)).toBeNull();
    expect(R.chooseMoment(fresh(), { available: ['welcome'], signals: ['leave'], cartLines: 3 }, T0)).toBeNull();
  });
  it('a closed moment stays away 7 days; a completed welcome never comes back', () => {
    const m = fresh(); R.markShown(m, 'interest', T0); R.markClosed(m, 'interest', T0);
    expect(R.chooseMoment(R.visitMemory(m, T0 + 3 * D, 0), { available: all, signals: ['interest'], cartLines: 0 }, T0 + 3 * D)).toBeNull();
    expect(R.chooseMoment(R.visitMemory(m, T0 + 8 * D, 0), { available: all, signals: ['interest'], cartLines: 0 }, T0 + 8 * D)).toBe('interest');
    const w = fresh(); R.markShown(w, 'welcome', T0); R.markDone(w, 'welcome', T0);
    expect(R.chooseMoment(R.visitMemory(w, T0 + 30 * D, 0), { available: all, signals: ['welcome'], cartLines: 0 }, T0 + 30 * D)).toBeNull();
  });
  it('return needs a saved contact and a second visit; welcome never shows to a known contact', () => {
    const m = fresh(); m.contact = true;
    expect(R.chooseMoment(m, { available: all, signals: ['return', 'welcome'], cartLines: 0 }, T0)).toBeNull();
    const back = R.visitMemory(m, T0 + 2 * D, 0);
    expect(R.chooseMoment(back, { available: all, signals: ['return', 'welcome'], cartLines: 0 }, T0 + 2 * D)).toBe('return');
  });
  it('a visit ends after 30 minutes without a page view', () => {
    const m = fresh(); R.markShown(m, 'welcome', T0);
    expect(R.visitMemory(m, T0 + 29 * 60_000, 0).visitShown).toBe(true);
    expect(R.visitMemory(m, T0 + 31 * 60_000, 0).visitShown).toBe(false);
  });
  it('three different products of one category in a visit make an interest signal', () => {
    const m = fresh();
    expect(R.noteView(m, { id: 'p1', categoryId: 'c1' })).toBe(false);
    expect(R.noteView(m, { id: 'p1', categoryId: 'c1' })).toBe(false);
    expect(R.noteView(m, { id: 'p2', categoryId: 'c1' })).toBe(false);
    expect(R.noteView(m, { id: 'p3', categoryId: 'c1' })).toBe(true);
    expect(R.noteView(m, { id: 'p9', categoryId: '' })).toBe(false);
  });
  it('upgrade from the old key: a popup seen last week counts as the welcome done', () => {
    const m = R.visitMemory(null, T0, T0 - 7 * D);
    expect(m.lastShownAt).toBe(T0 - 7 * D);
    expect(R.chooseMoment(m, { available: all, signals: ['welcome'], cartLines: 0 }, T0)).toBeNull();
    expect(R.chooseMoment(m, { available: all, signals: ['interest'], cartLines: 0 }, T0)).toBe('interest');
  });
  it('blocked storage: load gives nothing, save never throws', () => {
    const blocked = load('blocked');
    expect(blocked.loadMemory('calima')).toBeNull();
    expect(() => blocked.saveMemory('calima', blocked.visitMemory(null, T0, 0))).not.toThrow();
  });
  it('memory round-trips through localStorage per store', () => {
    const storage: Record<string, string> = {}; const r = load(storage);
    const m = r.visitMemory(null, T0, 0); m.code = 'POPABC234'; r.saveMemory('calima', m);
    expect(JSON.parse(storage['pagosya:popups:calima']).code).toBe('POPABC234');
    expect(r.loadMemory('calima').code).toBe('POPABC234');
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `cd apps/api && npx jest src/retention/popup-moment-rules.spec.ts`
Expected: FAIL with `Cannot read properties of undefined (reading 'visitMemory')`. If it fails earlier because retention.js touches another global at load time, add that global as a stub to the `runInNewContext` object (at load, with `window.PAGOSYA_CONFIG` unset, the script must only define things).

- [ ] **Step 3: Implement in `retention.js`** (right after `const escape = …`)

```js
  // Popups 2.0 part 2 (spec 2026-11-21 §3, §7): which of the store's popups (welcome, rescue, interest, return) this shopper may
  // see now — at most one a visit, 24 h apart (rescue may skip the gap), a closed one away 7 days, a finished welcome never again.
  window.PAGOSYA_POPUP_RULES = (() => {
    const HOUR = 3_600_000, DAY = 24 * HOUR, VISIT_GAP = 30 * 60_000, CLOSED_FOR = 7 * DAY;
    const RANK = ['rescue', 'interest', 'return', 'welcome'];
    const visitorId = () => { const bytes = new Uint8Array(12); try { crypto.getRandomValues(bytes); } catch { for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256); } return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join(''); };
    const number = value => (Number.isFinite(Number(value)) ? Number(value) : 0);
    const times = value => Object.fromEntries(Object.entries(value && typeof value === 'object' ? value : {}).filter(([key]) => RANK.includes(key)).map(([key, at]) => [key, number(at)]));
    function visitMemory(raw, now, legacySeen) {
      const saved = raw && typeof raw === 'object' ? raw : null;
      const memory = {
        visitor: typeof saved?.visitor === 'string' && /^[a-f0-9]{16,32}$/.test(saved.visitor) ? saved.visitor : visitorId(),
        visits: Math.max(0, number(saved?.visits)), visitStart: number(saved?.visitStart), lastSeenAt: number(saved?.lastSeenAt),
        visitShown: saved?.visitShown === true, lastShownAt: number(saved?.lastShownAt), closed: times(saved?.closed), done: times(saved?.done),
        contact: saved?.contact === true, code: typeof saved?.code === 'string' ? saved.code.slice(0, 40) : '', favourite: typeof saved?.favourite === 'string' ? saved.favourite.slice(0, 40) : '',
        views: saved?.views && typeof saved.views === 'object' ? saved.views : {},
      };
      // Today's single popup remembered its last showing for 30 days: that counts as the welcome shown and done.
      if (!saved && legacySeen && now - legacySeen < 30 * DAY) { memory.lastShownAt = legacySeen; memory.done.welcome = legacySeen; }
      if (!memory.visits || now - memory.lastSeenAt > VISIT_GAP) { memory.visits += 1; memory.visitStart = now; memory.visitShown = false; memory.views = {}; }
      memory.lastSeenAt = now;
      return memory;
    }
    function allowed(memory, moment, context, now) {
      if (!context.available.includes(moment) || memory.visitShown) return false;
      if (memory.closed[moment] && now - memory.closed[moment] < CLOSED_FOR) return false;
      if (moment !== 'rescue' && memory.lastShownAt && now - memory.lastShownAt < DAY) return false;
      const signals = context.signals;
      if (moment === 'welcome') return signals.includes('welcome') && !memory.contact && !memory.done.welcome;
      if (moment === 'rescue') return signals.includes('leave') && context.cartLines > 0;
      if (moment === 'interest') return signals.includes('interest');
      return signals.includes('return') && memory.contact && memory.visits >= 2;
    }
    const chooseMoment = (memory, context, now) => RANK.find(moment => allowed(memory, moment, context, now)) || null;
    const markShown = (memory, moment, now) => { memory.visitShown = true; memory.lastShownAt = now; return memory; };
    const markClosed = (memory, moment, now) => { memory.closed[moment] = now; return memory; };
    const markDone = (memory, moment, now) => { memory.done[moment] = now; return memory; };
    function noteView(memory, product) {
      const category = String(product?.categoryId || ''), id = String(product?.id || '');
      if (!category || !id) return false;
      const seen = Array.isArray(memory.views[category]) ? memory.views[category] : [];
      if (seen.includes(id)) return false;
      memory.views[category] = [...seen, id].slice(-12);
      return memory.views[category].length === 3;
    }
    const key = slug => `pagosya:popups:${slug}`;
    const loadMemory = slug => { try { return JSON.parse(localStorage.getItem(key(slug)) || 'null'); } catch { return null; } };
    const saveMemory = (slug, memory) => { try { localStorage.setItem(key(slug), JSON.stringify(memory)); } catch {} };
    return { visitMemory, chooseMoment, markShown, markClosed, markDone, noteView, loadMemory, saveMemory };
  })();
```

- [ ] **Step 4: Run the test and the runtime parse check**

Run: `cd apps/api && npx jest src/retention/popup-moment-rules.spec.ts` then `cd ../../packages/storefront-kit && node kit/check-runtimes.mjs`
Expected: PASS; the parse check reports no failures.

- [ ] **Step 5: Commit**

```bash
git add packages/storefront-kit/kit/retention.js apps/api/src/retention/popup-moment-rules.spec.ts
git commit -m "feat(popups): the browser's rules for which popup a shopper may see (one a visit, 24 h, 7-day close)"
```

---

### Task 4: The flow runtime plays cart, remind, pick sources and the shopper's branch

**Files:**
- Modify: `packages/storefront-kit/kit/retention.js` — `mountFlow` (~line 398–557), the `mountFlow(...)` call in `mountSignup` (~line 666), `PAGOSYA_POPUP_PREVIEW` (~line 901)
- Modify: `apps/api/src/store-popups/popup-flow-render.ts` (`FlowRenderInput`, `measureFlow`)
- Test: `apps/api/src/store-popups/popup-flow-render.spec.ts`

**Interfaces:**
- Consumes: step kinds and `pick.source` from Task 2.
- Produces:
  - `mountFlow(dialog, design, { …existing, context, hooks })` where `context = { moment?, contact?: boolean, code?: string, favourite?: string, product?: { id, name, categoryId, categoryName? }, cart?: Array<{ id, name, price, quantity, photo }> }` and `hooks = { closed?(stepId), done?(), contact?(code) }`. Returns `false` when nothing can be played.
  - `window.PAGOSYA_POPUP_PREVIEW(settings, config, stepId, context?)`.
  - `export type FlowContext` (same shape as `context`) and `FlowRenderInput.context?: FlowContext`.

- [ ] **Step 1: Write the failing tests** (append to `popup-flow-render.spec.ts`)

```ts
import { chromium } from 'playwright';
import { readKitFileSync } from '@pagosya/storefront-kit';

describe('moment steps in the browser check (spec 2026-11-21 §5–6)', () => {
  const CARD = '.card{background:#fff;color:#111;padding:24px;width:min(420px,100%)}.card [data-close]{width:44px;height:44px}.card [data-tile] img{width:60px;height:60px}';
  const cartHtml = '<div class="card"><button data-close aria-label="Cerrar">×</button><h2>Tu carrito</h2><ul><li data-tile><img data-slot="photo" alt=""><b data-slot="name"></b><i data-slot="qty"></i></li></ul><p data-slot="total"></p><button data-next>Seguir</button></div>';
  const remindHtml = '<div class="card"><button data-close aria-label="Cerrar">×</button><p>Tu <b data-slot="percent"></b> sigue esperando: <b data-slot="code"></b></p><button data-apply>Usar mi código</button></div>';
  const captureHtml = '<div class="card"><button data-close aria-label="Cerrar">×</button><input data-field><button data-submit>Enviar</button></div>';
  const revealHtml = '<div class="card"><button data-close aria-label="Cerrar">×</button><b data-slot="code"></b><button data-next>Ir</button></div>';
  const rescueFlow = [{ id: 'k', kind: 'cart' }, { id: 'c', kind: 'capture' }, { id: 'r', kind: 'reveal' }, { id: 'm', kind: 'remind' }, { id: 'l', kind: 'land', to: 'checkout' }];
  const steps = { k: cartHtml, c: captureHtml, r: revealHtml, m: remindHtml };
  const cart = [{ id: 'p1', name: 'Habanero', price: 4500, quantity: 2, photo: '/v1/uploads/a.png' }, { id: 'p2', name: 'Serrano', price: 4000, quantity: 1, photo: '/v1/uploads/b.png' }];

  it('fills the cart tiles from the shopper\'s cart and shows a reminder with the code', async () => {
    const measures = await measureFlow({ ...base(CARD, steps, rescueFlow), context: { moment: 'rescue', cart } }, [{ width: 390, height: 844 }]);
    expect(measures!.map(m => m.stepId)).toEqual(['k', 'c', 'r', 'm']);
    expect(measures!.find(m => m.stepId === 'k')!.tiles).toBe(2);
    expect(checkFlowRender(measures!)).toEqual([]);
  });

  it('cart step with an empty cart: the check fails it', async () => {
    const measures = await measureFlow({ ...base(CARD, steps, rescueFlow), context: { moment: 'rescue', cart: [] } }, [{ width: 390, height: 844 }]);
    expect(checkFlowRender(measures!).join(' ')).toMatch(/paso k.*fichas/);
  });

  it('contact without a code: rescue skips capture, reveal and remind, and still opens on the cart', async () => {
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      await page.setContent('<!doctype html><body></body>');
      await page.addScriptTag({ content: readKitFileSync('retention.js') });
      const shown = await page.evaluate(([flow, html, lines]) => {
        (window as any).PAGOSYA_POPUP_PREVIEW({ signupEnabled: true, popupDesign: { id: 'cx', flow, steps: html, css: '', capture: 'whatsapp', percent: 10 } }, { slug: 'x', data: { items: [] } }, '', { moment: 'rescue', contact: true, code: '', cart: lines });
        return document.querySelector('[data-pya-popup]')?.getAttribute('data-step');
      }, [rescueFlow, steps, cart] as const);
      expect(shown).toBe('cart');
    } finally { await browser.close(); }
  });
});
```

(`base`, `measureFlow` and `checkFlowRender` are already imported/defined at the top of the spec.)

- [ ] **Step 2: Run to see them fail**

Run: `cd apps/api && npx jest src/store-popups/popup-flow-render.spec.ts -t "moment steps"`
Expected: FAIL (cart tiles `null`, preview ignores the context).

- [ ] **Step 3: Implement in `retention.js` `mountFlow`**

3a. Change the options destructuring to `{ api, demo, remember, slug, items, startAt, apiBaseUrl, context = {}, hooks = {} }`. Right after `const product = id => …` add:

```js
    // Part 2 (spec 2026-11-21 §5): the moment's own data — the shopper's cart, the product they keep looking at, their favourite,
    // and whether they already left a contact (then the contact steps are skipped and their code is reminded instead).
    const known = Boolean(context.contact), held = String(context.code || '');
    const cartLines = (Array.isArray(context.cart) ? context.cart : []).filter(line => line && line.id).slice(0, 12);
    const viewed = context.product && context.product.id ? context.product : null;
    const pickIds = step => {
      if (step.source === 'context') { if (!viewed) return []; return [viewed.id, ...(items || []).filter(item => item && item.id !== viewed.id && viewed.categoryId && item.categoryId === viewed.categoryId).map(item => item.id)].filter(product).slice(0, 4); }
      if (step.source === 'favourite') return [context.favourite, ...(items || []).map(item => item && item.id)].filter((id, i, list) => id && product(id) && list.indexOf(id) === i).slice(0, 4);
      if (step.source === 'new') return (items || []).map(item => item && item.id).filter(product).slice(0, 4);
      return (step.products || []).filter(product);
    };
    const slotFilled = step => !/data-slot=["']?product-name/.test(design.steps?.[step.id] || '') || Boolean(viewed && viewed.name);
    // The check (popup-flow-render) asks for a cart step even with an empty cart, so it can fail it; a store page never does.
    const branch = step => step.kind === 'capture' || step.kind === 'reveal' ? !known : step.kind === 'remind' ? known && Boolean(held) : step.kind === 'cart' ? cartLines.length > 0 || step.id === startAt : true;
```

3b. Replace the `live` and `shown` lines and the guard after them:

```js
    const live = step => step.kind === 'pick' ? pickIds(step).length >= (step.source ? 1 : 2)
      : step.kind === 'quiz' ? (step.questions || []).some(question => (question.answers || []).some(answer => (answer.products || []).some(product))) : true;
    const shown = steps.filter(step => step.kind !== 'land' && typeof design.steps?.[step.id] === 'string' && live(step) && branch(step) && slotFilled(step));
    // A welcome design with no step this page can play leaves the classic popup in place; a moment design simply does not open.
    const welcome = !context.moment || context.moment === 'welcome';
    if (!shown.length || (welcome && !shown.some(step => step.kind === 'capture'))) return false;
```

3c. `const memory = { answers: [], favourite: '', code: held, busy: false };`

3d. In `finish()`, after `applyCode();` add the checkout landing; then call the done hook before `dialog.close()`:

```js
      if (land && land.to === 'checkout') { if (hostedPage) { try { parent.postMessage({ type: 'pagosya:open-cart' }, '*'); } catch {} } document.querySelector('[data-cart-open]')?.click(); }
      hooks.done?.();
```

3e. In `draw()`: the `[data-close]` handler becomes `() => { hooks.closed?.(step.id); remember(); if (memory.code) applyCode(); dialog.close(); }`. Right after `root.setAttribute('data-step', step.kind);` fill the text slots:

```js
      root.querySelectorAll('[data-slot=product-name]').forEach(el => { el.textContent = viewed?.name || ''; });
      root.querySelectorAll('[data-slot=collection-name]').forEach(el => { el.textContent = viewed?.categoryName || ''; });
```

3f. In the `pick` branch replace `for (const id of (step.products || []).filter(product))` with `for (const id of pickIds(step))`.

3g. After the `reveal` branch add:

```js
      if (step.kind === 'cart') {
        const tile = root.querySelector('[data-tile]');
        if (tile) {
          for (const line of cartLines.slice(0, 4)) {
            const copy = tile.cloneNode(true);
            const photo = copy.querySelector('[data-slot=photo]'); if (photo) { photo.setAttribute('src', upload(line.photo || '')); photo.setAttribute('alt', line.name || ''); }
            const nameSlot = copy.querySelector('[data-slot=name]'); if (nameSlot) nameSlot.textContent = line.name || '';
            const priceSlot = copy.querySelector('[data-slot=price]'); if (priceSlot) priceSlot.textContent = money(line.price);
            const qtySlot = copy.querySelector('[data-slot=qty]'); if (qtySlot) qtySlot.textContent = `× ${Math.max(1, Number(line.quantity) || 1)}`;
            tile.before(copy);
          }
          const note = cartLines.length > 4 ? `+${cartLines.length - 4} más` : cartLines.length ? '' : 'Tu carrito está vacío.';
          if (note) { const line = document.createElement('p'); line.className = 'pagosya-flow-more'; line.textContent = note; tile.after(line); }
          tile.remove();
        }
        const total = cartLines.reduce((sum, line) => sum + (Number(line.price) || 0) * Math.max(1, Number(line.quantity) || 1), 0);
        root.querySelectorAll('[data-slot=total]').forEach(el => { el.textContent = money(total); });
      }
      if (step.kind === 'remind') {
        root.querySelectorAll('[data-slot=code]').forEach(el => { el.textContent = memory.code || (demo ? 'POPDEMO10' : ''); });
        root.querySelectorAll('[data-slot=percent]').forEach(el => { el.textContent = `${design.percent}%`; });
        root.querySelectorAll('[data-apply]').forEach(el => el.addEventListener('click', () => { if (!memory.code && demo) memory.code = 'POPDEMO10'; applyCode(); next(); }));
      }
```

The tile count the check reads must be the drawn copies only: the cart branch removes the template, so an empty cart leaves 0 tiles.

3h. In the capture `send()`, after `memory.code = answer?.code || '';` add `hooks.contact?.(memory.code);`.

3i. `mountSignup`'s `mountFlow(...)` call passes `context: settings.popupDesignContext || {}`. In `PAGOSYA_POPUP_PREVIEW(settings, config, stepId, context)` add `if (context) settings = { ...(settings || {}), popupDesignContext: context };` next to the `stepId` line.

- [ ] **Step 4: Implement the check context in `popup-flow-render.ts`**

```ts
export type FlowContext = { moment?: string; contact?: boolean; code?: string; favourite?: string; product?: { id: string; name: string; categoryId?: string; categoryName?: string };
  cart?: Array<{ id: string; name: string; price: number; quantity: number; photo: string }> };
```

Add `context?: FlowContext` to `FlowRenderInput`. In `measureFlow`, each step is opened with a context in which that step is shown (the reminder needs a known contact with a code; everything else a new shopper):

```ts
        const context = step.kind === 'remind' ? { ...(input.context ?? {}), contact: true, code: 'POPDEMO10' } : { ...(input.context ?? {}), contact: false };
        await page.evaluate(([design, items, stepId, ctx]) => {
          (window as unknown as { PAGOSYA_POPUP_PREVIEW: (s: unknown, c: unknown, id: string, x: unknown) => void }).PAGOSYA_POPUP_PREVIEW({ signupEnabled: true, popupDesign: design }, { slug: 'popup-check', apiBaseUrl: `${location.origin}/v1`, data: { items } }, stepId, ctx);
        }, [input.design, input.items, step.id, context] as const);
```

After `const measured = await page.evaluate(measureInPage);`, a cart step that drew no tile must still be reported: `if (step.kind === 'cart' && measured.tiles === null) measured.tiles = 0;` (and keep `tileImages` as 0), so `checkFlowRender` says «las fichas de productos no muestran sus fotos» for it. Check how `measureInPage` counts `tiles` (read the lines that set `tiles` near the `hiddenArt` code) — it must count the drawn `[data-tile]` copies in the open step; if it only looks inside `pick` steps, widen it to `cart` too.

- [ ] **Step 5: Run the spec and the parse check**

Run: `cd apps/api && npx jest src/store-popups/popup-flow-render.spec.ts` then `cd ../../packages/storefront-kit && node kit/check-runtimes.mjs`
Expected: PASS (old and new tests).

- [ ] **Step 6: Commit**

```bash
git add packages/storefront-kit/kit/retention.js apps/api/src/store-popups/popup-flow-render.ts apps/api/src/store-popups/popup-flow-render.spec.ts
git commit -m "feat(popups): the runtime plays the cart, the reminder, picks from context and the shopper's own branch"
```

---

### Task 5: The moments watcher on the store page

**Files:**
- Modify: `packages/storefront-kit/kit/retention.js` — `mountSignup` timing block (~line 695–716) and a new `watchMoments` function
- Modify: `packages/storefront-kit/kit/commerce.js` — where a product opens (~line 2866, `selectedProduct = p; …`)
- Create: `apps/api/src/retention/popup-moments-runtime.spec.ts`

**Interfaces:**
- Consumes: `PAGOSYA_POPUP_RULES` (Task 3); `mountFlow(..., { context, hooks })` (Task 4); public settings field `popupMoments: { rescue?, interest?, return? }` (served in Task 6; this task's test fakes the API).
- Produces: browser event `pagosya:product-viewed` `{ id, categoryId }`; API calls `api('popup-events', { visitor, designId, moment, kind, step? })` and `api('code-status', { code })`.

- [ ] **Step 1: commerce.js — announce every product opened**

Right after the line `selectedProduct = p; selectedImage = 0; selectedQuantity = 1; …` add:

```js
    document.dispatchEvent(new CustomEvent("pagosya:product-viewed", { detail: { id: p.id, categoryId: p.categoryId || "" } }));
```

Check that full product pages go through the same function (search for where `fullProductPage` sets `selectedProduct`); if a full page sets it elsewhere, dispatch there too.

- [ ] **Step 2: Write the failing test** `apps/api/src/retention/popup-moments-runtime.spec.ts`

```ts
import { chromium, type Browser, type Page } from 'playwright';
import { readKitFileSync } from '@pagosya/storefront-kit';

/** Popups 2.0 part 2 (spec 2026-11-21 §3, §7): the store page opens at most the one popup that fits, at its moment. */
jest.setTimeout(120_000);
const ORIGIN = 'https://moments.invalid';
const T = Date.UTC(2026, 10, 21, 15);
const step = (inner: string) => `<div class="card"><button data-close aria-label="Cerrar">×</button>${inner}</div>`;
const design = (id: string, moment: string, flow: unknown[], steps: Record<string, string>) => ({ id, moment, flow, steps, css: '.card{background:#fff;color:#111;padding:20px}', launcher: null, capture: 'whatsapp', percent: 10 });
const tile = '<ul><li data-tile><img data-slot="photo" alt=""><b data-slot="name"></b></li></ul>';
const capture = step('<input data-field><button data-submit>Enviar</button>'), reveal = step('<b data-slot="code"></b><button data-next>Ir</button>'), remind = step('<b data-slot="code"></b><button data-apply>Usar</button>');
const welcome = design('cwelcome00000000000000001', 'welcome', [{ id: 'o', kind: 'offer' }, { id: 'c', kind: 'capture' }, { id: 'r', kind: 'reveal' }], { o: step('<h2>Hola</h2><button data-next>Sí</button>'), c: capture, r: reveal });
const rescue = design('crescue000000000000000001', 'rescue', [{ id: 'k', kind: 'cart' }, { id: 'c', kind: 'capture' }, { id: 'r', kind: 'reveal' }, { id: 'm', kind: 'remind' }, { id: 'l', kind: 'land', to: 'checkout' }], { k: step(`<h2>Tu carrito</h2>${tile}<button data-next>Guardar</button>`), c: capture, r: reveal, m: remind });
const interest = design('cinterest0000000000000001', 'interest', [{ id: 'p', kind: 'pick', source: 'context', products: [] }, { id: 'c', kind: 'capture' }, { id: 'r', kind: 'reveal' }, { id: 'm', kind: 'remind' }], { p: step(`<h2>¿Te gustó <span data-slot="product-name"></span>?</h2>${tile}`), c: capture, r: reveal, m: remind });
const back = design('creturn000000000000000001', 'return', [{ id: 'p', kind: 'pick', source: 'new', products: [] }, { id: 'm', kind: 'remind' }], { p: step(`<h2>Hola de nuevo</h2>${tile}`), m: remind });
const items = ['p1', 'p2', 'p3', 'p4'].map((id, i) => ({ id, name: `Producto ${i + 1}`, price: 3000, categoryId: 'c1', imageUrls: [`/v1/uploads/${id}.png`] }));
const settings = { signupEnabled: true, popupTrigger: 'delay', popupDelaySeconds: 8, popupDesign: welcome, popupMoments: { rescue, interest, return: back } };

let browser: Browser;
beforeAll(async () => { browser = await chromium.launch(); });
afterAll(async () => { await browser.close(); });

async function open(opts: { storage?: Record<string, string>; analytics?: boolean; cart?: Array<{ id: string; quantity: number }> } = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const posts: Array<{ path: string; body: any }> = [];
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== ORIGIN) return route.abort();
    if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body><main style="height:4000px"><button data-cart-open>Carrito</button></main></body></html>' });
    const path = url.pathname.replace('/v1/stores/public/calima/retention', '').replace(/^\//, '');
    if (route.request().method() === 'POST') {
      posts.push({ path, body: route.request().postDataJSON() });
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(path === 'code-status' ? { active: true, percent: 10 } : path === 'subscribe' ? { subscribed: true, code: 'POPABC234' } : { ok: true }) });
    }
    if (path === '') return route.fulfill({ contentType: 'application/json', body: JSON.stringify(settings) });
    return route.fulfill({ contentType: 'application/json', body: '{}' });
  });
  const page = await context.newPage();
  await page.clock.install({ time: T });
  await page.goto(`${ORIGIN}/`);
  await page.evaluate(([storage, analytics, cart, list]) => {
    for (const [k, v] of Object.entries(storage as Record<string, string>)) localStorage.setItem(k, v);
    (window as any).PAGOSYA_PRIVACY = { choice: () => analytics };
    document.addEventListener('pagosya:serialize-cart', (e: any) => { e.detail.items.push(...(cart as any[])); });
    (window as any).PAGOSYA_CONFIG = { slug: 'calima', apiBaseUrl: `${location.origin}/v1`, data: { items: list } };
  }, [opts.storage ?? {}, opts.analytics ?? false, opts.cart ?? [], items] as const);
  await page.addScriptTag({ content: readKitFileSync('retention.js') });
  await page.clock.runFor(100);
  return { page, posts, context };
}
const openStep = (page: Page) => page.evaluate(() => document.querySelector('dialog[open] [data-pya-popup]')?.getAttribute('data-step') ?? null);
const memory = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('pagosya:popups:calima') || 'null'));
const leaveTop = (page: Page) => page.evaluate(() => document.dispatchEvent(new MouseEvent('mouseout', { clientY: -1, relatedTarget: null })));

describe('popup moments on the store page', () => {
  it('a first visit gets the welcome after the store delay, and nothing else that visit', async () => {
    const { page, context } = await open({ cart: [{ id: 'p1', quantity: 1 }] });
    await page.clock.runFor(9_000);
    expect(await openStep(page)).toBe('offer');
    await page.click('dialog[open] [data-close]');
    await leaveTop(page);
    expect(await openStep(page)).toBeNull();
    expect((await memory(page)).closed.welcome).toBeGreaterThan(0);
    await context.close();
  });
  it('leaving with a full cart opens the rescue first, with the cart drawn', async () => {
    const { page, context } = await open({ cart: [{ id: 'p1', quantity: 2 }, { id: 'p2', quantity: 1 }] });
    await leaveTop(page);
    expect(await openStep(page)).toBe('cart');
    expect(await page.locator('dialog[open] [data-slot=name]').allTextContents()).toEqual(['Producto 1', 'Producto 2']);
    await context.close();
  });
  it('three products of one category open the interest popup naming the last one', async () => {
    const { page, context } = await open();
    for (const id of ['p1', 'p2', 'p3']) await page.evaluate(pid => document.dispatchEvent(new CustomEvent('pagosya:product-viewed', { detail: { id: pid, categoryId: 'c1' } })), id);
    await page.clock.runFor(100);
    expect(await openStep(page)).toBe('pick');
    expect(await page.locator('dialog[open] [data-slot=product-name]').textContent()).toBe('Producto 3');
    await context.close();
  });
  it('a returning contact gets the return popup 6 s in, with the code checked first', async () => {
    const saved = { visitor: 'a'.repeat(24), visits: 1, visitStart: T - 3 * 86_400_000, lastSeenAt: T - 3 * 86_400_000, visitShown: true, lastShownAt: T - 3 * 86_400_000, closed: {}, done: { welcome: T - 3 * 86_400_000 }, contact: true, code: 'POPABC234', favourite: '', views: {} };
    const { page, posts, context } = await open({ storage: { 'pagosya:popups:calima': JSON.stringify(saved) } });
    await page.clock.runFor(7_000);
    expect(await openStep(page)).toBe('pick');
    expect(posts.some(p => p.path === 'code-status' && p.body.code === 'POPABC234')).toBe(true);
    await context.close();
  });
  it('events reach the server only with analytics consent', async () => {
    const without = await open({ analytics: false });
    await without.page.clock.runFor(9_000);
    expect(without.posts.filter(p => p.path === 'popup-events')).toEqual([]);
    await without.context.close();
    const withConsent = await open({ analytics: true });
    await withConsent.page.clock.runFor(9_000);
    expect(withConsent.posts.filter(p => p.path === 'popup-events').map(p => [p.body.moment, p.body.kind])).toEqual([['welcome', 'shown']]);
    await withConsent.context.close();
  });
});
```

- [ ] **Step 3: Run to see it fail**

Run: `cd apps/api && npx jest src/retention/popup-moments-runtime.spec.ts`
Expected: FAIL — rescue/interest/return never open (only today's single-popup timing runs).

- [ ] **Step 4: Implement the watcher**

In `mountSignup`, just before `let dismissed = state.signupDismissed;`, insert:

```js
    // Part 2 (spec 2026-11-21 §3, §7): a store with a family of popups — the page's signals pick at most one a visit.
    const family = settings.popupMoments && typeof settings.popupMoments === 'object' && settings.popupDesign?.steps ? { welcome: settings.popupDesign, ...settings.popupMoments } : null;
    if (family && !(preview && !demo)) {
      watchMoments({ dialog, family, settings, config, api, demo, query, open, waitingForCookies, legacyKey: popupKey });
      return open;
    }
```

(`open` already skips while another dialog is open and waits for the cookie answer.) Add `watchMoments` as a sibling function just above `mountSignup`:

```js
  function watchMoments({ dialog, family, settings, config, api, demo, query, open, waitingForCookies, legacyKey }) {
    const R = window.PAGOSYA_POPUP_RULES, slug = config.slug, items = (config.data && config.data.items) || [];
    let legacy = 0; try { legacy = Number(localStorage.getItem(legacyKey)) || 0; } catch {}
    const memory = R.visitMemory(R.loadMemory(slug), Date.now(), legacy); R.saveMemory(slug, memory);
    const available = Object.keys(family).filter(moment => family[moment] && family[moment].steps);
    const consent = () => window.PAGOSYA_PRIVACY?.choice?.(slug) === true;
    const event = (design, moment, kind, step) => { if (demo || !consent()) return; api('popup-events', { visitor: memory.visitor, designId: design.id, moment, kind, ...(step ? { step } : {}) }).catch(() => undefined); };
    const cart = () => {
      const detail = { items: [] }; document.dispatchEvent(new CustomEvent('pagosya:serialize-cart', { detail }));
      return detail.items.map(line => {
        const item = items.find(i => i && i.id === (line.paymentLinkId || line.id));
        return item ? { id: item.id, name: item.name, price: item.price, quantity: line.quantity || 1, photo: (item.imageUrls || []).find(url => !/\.(mp4|webm|mov)(\?|$)/i.test(url)) || '' } : null;
      }).filter(Boolean);
    };
    const favourite = () => { if (memory.favourite) return memory.favourite; try { return localStorage.getItem(`pagosya:fav:${slug}`) || ''; } catch { return ''; } };
    const blocked = () => ['comeback', 'recover', 'unsubscribe'].some(key => query.has(key)) || document.querySelector('[data-pagosya-checkout-page], .pya-checkout:not([hidden]), dialog[open]');
    let lastViewed = null, viewTimer = 0, busy = false;
    async function consider(signals) {
      if (busy || blocked() || waitingForCookies()) return;
      const lines = cart();
      const moment = R.chooseMoment(memory, { available, signals, cartLines: lines.length }, Date.now());
      if (!moment) return;
      busy = true;
      try {
        // Never remind a code the shopper can no longer use.
        if (memory.code && moment !== 'welcome') {
          const status = demo ? { active: true } : await api('code-status', { code: memory.code }).catch(() => ({ active: false }));
          if (!status.active) { memory.code = ''; R.saveMemory(slug, memory); }
        }
        const design = family[moment];
        const hooks = {
          closed: step => { R.markClosed(memory, moment, Date.now()); R.saveMemory(slug, memory); event(design, moment, 'closed', step); },
          done: () => { R.markDone(memory, moment, Date.now()); R.saveMemory(slug, memory); event(design, moment, 'completed'); },
          contact: code => { memory.contact = true; if (code) memory.code = code; R.markDone(memory, moment, Date.now()); R.saveMemory(slug, memory); },
        };
        const context = { moment, contact: memory.contact, code: memory.code, favourite: favourite(), product: lastViewed, cart: lines };
        if (!mountFlow(dialog, design, { api, demo, remember: () => {}, slug, items, apiBaseUrl: config.apiBaseUrl, context, hooks })) return;
        R.markShown(memory, moment, Date.now()); R.saveMemory(slug, memory);
        open();
        if (dialog.open) event(design, moment, 'shown');
      } finally { busy = false; }
    }
    // Welcome keeps the store's own timing setting.
    const trigger = ['load', 'delay', 'exit', 'both'].includes(settings.popupTrigger) ? settings.popupTrigger : 'load';
    const touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    const exitWelcome = trigger === 'exit' || trigger === 'both';
    if (trigger === 'load') void consider(['welcome']);
    if (trigger === 'delay' || trigger === 'both') setTimeout(() => void consider(['welcome']), Math.min(60, Math.max(0, Number(settings.popupDelaySeconds ?? 8))) * 1000);
    // Leave intent: the pointer leaving at the top (desktop); a fast scroll up after 10 s, or coming back to the tab after 20 s (phone).
    const leave = () => void consider(exitWelcome ? ['leave', 'welcome'] : ['leave']);
    if (!touch) document.addEventListener('mouseout', e => { if (!e.relatedTarget && e.clientY <= 0) leave(); });
    const started = Date.now();
    let samples = [];
    window.addEventListener('scroll', () => {
      const now = Date.now(); samples = [...samples.filter(s => now - s.t <= 400), { t: now, y: scrollY }];
      if (touch && now - started >= 10_000 && samples[0].y - scrollY >= innerHeight * 0.6) { samples = []; leave(); }
    }, { passive: true });
    let hiddenAt = 0;
    document.addEventListener('visibilitychange', () => { if (document.hidden) hiddenAt = Date.now(); else if (hiddenAt && Date.now() - hiddenAt >= 20_000) { hiddenAt = 0; leave(); } });
    // Interest: 3 different products of one category in this visit, or 40 s on one product.
    document.addEventListener('pagosya:product-viewed', e => {
      const item = items.find(i => i && i.id === e.detail?.id);
      if (!item) return;
      lastViewed = { id: item.id, name: item.name, categoryId: item.categoryId || '', categoryName: '' };
      const third = R.noteView(memory, { id: item.id, categoryId: item.categoryId || '' }); R.saveMemory(slug, memory);
      clearTimeout(viewTimer);
      if (third) void consider(['interest']);
      else viewTimer = setTimeout(() => { if (lastViewed?.id === item.id) void consider(['interest']); }, 40_000);
    });
    // Return: a known contact, visit 2 or later, 6 s in.
    setTimeout(() => void consider(['return']), 6_000);
    // The cookie answer clears the way for a welcome that was waiting.
    window.addEventListener('pagosya:privacy-change', () => setTimeout(() => void consider(['welcome']), 800));
  }
```

`mountFlow` replaces the dialog's children each time, so the one dialog is reused. In the first test, the welcome's close button calls `hooks.closed` (Task 4 3e), which sets `closed.welcome`.

- [ ] **Step 5: Run the test and the parse check**

Run: `cd apps/api && npx jest src/retention/popup-moments-runtime.spec.ts` then `cd ../../packages/storefront-kit && node kit/check-runtimes.mjs`
Expected: PASS (5 tests); no parse failures.

- [ ] **Step 6: Commit**

```bash
git add packages/storefront-kit/kit/retention.js packages/storefront-kit/kit/commerce.js apps/api/src/retention/popup-moments-runtime.spec.ts
git commit -m "feat(popups): the store page watches leave intent, product views, the cart and return visits to open one popup a visit"
```

---

### Task 6: Serve the family, record events, check codes, clean up

**Files:**
- Modify: `apps/api/src/retention/retention.service.ts` (`KEPT_SETTINGS` line 62; next to `liveDesign` ~line 212)
- Modify: `apps/api/src/retention/retention.controller.ts` (`RetentionPublicController`, ~line 40–80)
- Modify: `apps/api/src/retention/retention.dto.ts`
- Create: `apps/api/src/store-popups/popup-events-cleanup.job.ts`, `apps/api/src/store-popups/popup-events-cleanup.job.spec.ts`
- Modify: `apps/api/src/store-popups/store-popup.module.ts`
- Test: `apps/api/src/retention/retention-popup-design.spec.ts`

**Interfaces:**
- Consumes: `StorePopupEvent`, `StorePopupDesign.moment` (Task 1).
- Produces:
  - `RetentionService.liveMoments(storeId, settings): Promise<Record<string, LiveDesign & { moment: string }>>` (only `rescue | interest | return`)
  - `RetentionService.recordPopupEvent(storeId, dto: PopupEventDto): Promise<{ ok: true }>`
  - `RetentionService.popupCodeStatus(storeId, code: string): Promise<{ active: boolean; percent?: number }>`
  - Public routes `POST /stores/public/:slug/retention/popup-events`, `POST …/retention/code-status`; the settings answer gains `popupMoments`.
  - `PopupEventsCleanupJob.run(now?): Promise<number>`

- [ ] **Step 1: Write the failing tests**

In `retention-popup-design.spec.ts`: add `moment: 'welcome'` to the `design` fixture; make `setup()`'s `storePopupDesign.findFirst` fake ignore `status` when it is not asked (`(where.status === undefined || row.status === where.status)`); add `storePopupEvent: { create: jest.fn(async ({ data }: any) => data) }` and `storePopupDesign.findMany: jest.fn(async () => [])` to its `prisma`. Then append:

```ts
describe('popup moments in retention (spec 2026-11-21 §4, §7)', () => {
  const rescueRow = { ...design, id: 'crescue00000000000000001', moment: 'rescue' };
  it('serves the LIVE moments the store has switched on, never an off one or another store\'s', async () => {
    const { service, prisma } = setup();
    prisma.storePopupDesign.findMany = jest.fn(async ({ where }: any) => [rescueRow].filter(r => where.id.in.includes(r.id) && r.storeId === where.storeId && r.status === where.status));
    await expect(service.liveMoments('s1', { popupMoments: { rescue: { id: rescueRow.id }, interest: { id: 'cgone', off: true } } } as any)).resolves.toEqual({ rescue: expect.objectContaining({ id: rescueRow.id, moment: 'rescue' }) });
    await expect(service.liveMoments('s2', { popupMoments: { rescue: { id: rescueRow.id } } } as any)).resolves.toEqual({});
  });
  it('records an event only for this store\'s own design', async () => {
    const { service, prisma } = setup();
    await service.recordPopupEvent('s1', { visitor: 'a'.repeat(24), designId: design.id, moment: 'welcome', kind: 'shown' } as any);
    expect(prisma.storePopupEvent.create).toHaveBeenCalledWith({ data: { storeId: 's1', designId: design.id, moment: 'welcome', visitor: 'a'.repeat(24), kind: 'shown', step: null } });
    await expect(service.recordPopupEvent('s2', { visitor: 'a'.repeat(24), designId: design.id, moment: 'welcome', kind: 'shown' } as any)).resolves.toEqual({ ok: true });
    expect(prisma.storePopupEvent.create).toHaveBeenCalledTimes(1);
  });
  it('code-status refuses foreign and plain codes, and says a used code is not active', async () => {
    const { service, codes } = setup();
    codes.push({ storeId: 's1', code: 'POPAAA234', isActive: true, popupDesignId: design.id, discountValue: 15, maxUses: 1 }, { storeId: 's1', code: 'PEPPA10', isActive: true, popupDesignId: null, discountValue: 10 }, { storeId: 's1', code: 'POPUSED22', isActive: true, popupDesignId: design.id, discountValue: 15, maxUses: 1 });
    (service as any).promoCodes = { resolveActiveForStore: jest.fn(async (_s: string, code: string) => { if (code === 'POPUSED22') throw new Error('Este código ya se usó'); return codes.find(c => c.code === code); }) };
    await expect(service.popupCodeStatus('s1', 'popaaa234')).resolves.toEqual({ active: true, percent: 15 });
    await expect(service.popupCodeStatus('s1', 'PEPPA10')).resolves.toEqual({ active: false });
    await expect(service.popupCodeStatus('s2', 'POPAAA234')).resolves.toEqual({ active: false });
    await expect(service.popupCodeStatus('s1', 'POPUSED22')).resolves.toEqual({ active: false });
  });
  it('keeps the family pointers when the other retention settings are saved', () => {
    expect(KEPT_SETTINGS).toEqual(expect.arrayContaining(['popupMoments']));
  });
});
```

`apps/api/src/store-popups/popup-events-cleanup.job.spec.ts`:

```ts
import { PopupEventsCleanupJob } from './popup-events-cleanup.job';

describe('popup events cleanup', () => {
  it('deletes events older than 180 days', async () => {
    const deleteMany = jest.fn(async () => ({ count: 3 }));
    const job = new PopupEventsCleanupJob({ storePopupEvent: { deleteMany } } as any);
    const now = Date.UTC(2026, 10, 21);
    await expect(job.run(now)).resolves.toBe(3);
    expect(deleteMany).toHaveBeenCalledWith({ where: { createdAt: { lt: new Date(now - 180 * 86_400_000) } } });
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `cd apps/api && npx jest src/retention/retention-popup-design.spec.ts` then `npx jest src/store-popups/popup-events-cleanup.job.spec.ts`
Expected: FAIL (`service.liveMoments is not a function`; module not found).

- [ ] **Step 3: DTOs** (append to `retention.dto.ts`; add any missing `class-validator` imports)

```ts
/** Popups 2.0 part 2 (spec 2026-11-21 §7): what a shopper did with a popup — a random browser id, never a contact. */
export class PopupEventDto {
  @Matches(/^[a-f0-9]{16,32}$/) visitor!: string;
  @Matches(/^c[a-z0-9]{20,30}$/) designId!: string;
  @IsIn(['welcome', 'rescue', 'interest', 'return']) moment!: string;
  @IsIn(['shown', 'closed', 'completed']) kind!: string;
  @IsOptional() @Matches(/^[a-z][a-z0-9-]{0,23}$/) step?: string;
}
export class PopupCodeStatusDto { @IsString() @MaxLength(40) code!: string; }
```

- [ ] **Step 4: Service** (`retention.service.ts`)

Add `'popupMoments'` to `KEPT_SETTINGS`. Next to `liveDesign`:

```ts
  /** Part 2 (spec 2026-11-21 §4): the store's LIVE rescue / interest / return designs that are switched on. */
  async liveMoments(storeId: string, settings: { popupMoments?: unknown }) {
    const wanted = Object.entries((settings.popupMoments ?? {}) as Record<string, { id?: unknown; off?: unknown }>)
      .filter(([moment, entry]) => ['rescue', 'interest', 'return'].includes(moment) && typeof entry?.id === 'string' && entry.off !== true)
      .map(([moment, entry]) => ({ moment, id: entry.id as string }));
    if (!wanted.length) return {};
    const rows = await this.prisma.storePopupDesign.findMany({ where: { id: { in: wanted.map(w => w.id) }, storeId, status: 'LIVE' } });
    const out: Record<string, unknown> = {};
    for (const { moment, id } of wanted) {
      const row = rows.find(r => r.id === id && r.moment === moment);
      if (row) out[moment] = { id: row.id, moment, flow: row.flow, steps: row.steps, css: row.css, launcher: row.launcher, capture: row.capture, percent: row.percent };
    }
    return out;
  }
  async recordPopupEvent(storeId: string, dto: PopupEventDto) {
    const owned = await this.prisma.storePopupDesign.findFirst({ where: { id: dto.designId, storeId } });
    if (owned) await this.prisma.storePopupEvent.create({ data: { storeId, designId: dto.designId, moment: dto.moment, visitor: dto.visitor, kind: dto.kind, step: dto.step ?? null } });
    return { ok: true as const };
  }
  /** A reminder never shows a code the shopper can't use: only this store's own popup codes, still active and unused. */
  async popupCodeStatus(storeId: string, raw: string) {
    const code = String(raw ?? '').trim().toUpperCase();
    const row = await this.prisma.promoCode.findFirst({ where: { storeId, code } });
    if (!row || !row.popupDesignId) return { active: false };
    try { await this.promoCodes!.resolveActiveForStore(storeId, code); } catch { return { active: false }; }
    return { active: true, percent: row.discountValue };
  }
```

`liveDesign` also returns `moment: 'welcome'` in its object (update its existing test expectation). Inject `PromoCodesService` into `RetentionService` as `@Optional() private readonly promoCodes?: PromoCodesService` (last constructor argument); if `RetentionModule` does not import the module that exports `PromoCodesService`, add it to `imports`.

- [ ] **Step 5: Routes** (`RetentionPublicController`)

In `settings()`, after `if (popupDesign) shown.popupDesign = popupDesign;`:

```ts
    // Part 2 (spec 2026-11-21): the other moments ride along only with a welcome design (the family starts from it).
    if (popupDesign) { const moments = await this.retention.liveMoments(store.id, s as { popupMoments?: unknown }); if (Object.keys(moments).length) shown.popupMoments = moments; }
```

New routes:

```ts
  @Post('popup-events') @Header('Cache-Control', 'no-store') @Throttle({ default: { limit: 30, ttl: 60000 } })
  async popupEvent(@Param('slug') slug: string, @Body() dto: PopupEventDto) { return this.retention.recordPopupEvent((await findActiveStoreBySlug(this.prisma, slug)).id, dto); }
  @Post('code-status') @Header('Cache-Control', 'no-store') @Throttle({ default: { limit: 20, ttl: 60000 } })
  async codeStatus(@Param('slug') slug: string, @Body() dto: PopupCodeStatusDto) { return this.retention.popupCodeStatus((await findActiveStoreBySlug(this.prisma, slug)).id, dto.code); }
```

Published stores reach these through `PAGOSYA_HOSTED_REQUEST('retention', { path, payload })`: check that the hosted relay (search `HOSTED_REQUEST` handling in `apps/api/src/storefront-source` or the published shell) forwards any `path` under retention; if it allow-lists paths, add `popup-events` and `code-status`.

- [ ] **Step 6: Cleanup job** `apps/api/src/store-popups/popup-events-cleanup.job.ts`

```ts
import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

/** Popups 2.0 part 2 (spec 2026-11-21 §4): shopper events are kept 180 days. */
@Injectable()
export class PopupEventsCleanupJob {
  constructor(private readonly prisma: PrismaService) {}
  @Cron('45 3 * * *', { name: 'popup-events-cleanup', timeZone: 'America/La_Paz' })
  async nightly() { await this.run(); }
  async run(now = Date.now()) {
    const { count } = await this.prisma.storePopupEvent.deleteMany({ where: { createdAt: { lt: new Date(now - 180 * 86_400_000) } } });
    return count;
  }
}
```

Add `PopupEventsCleanupJob` to `StorePopupModule`'s `providers`.

- [ ] **Step 7: Run the specs**

Run: `cd apps/api && npx jest src/retention/retention-popup-design.spec.ts` then `npx jest src/store-popups/popup-events-cleanup.job.spec.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/retention apps/api/src/store-popups/popup-events-cleanup.job.ts apps/api/src/store-popups/popup-events-cleanup.job.spec.ts apps/api/src/store-popups/store-popup.module.ts
git commit -m "feat(popups): store pages get the family; shopper events and code checks; events kept 180 days"
```

---

### Task 7: YAPI writes the family in one call

**Files:**
- Modify: `apps/api/src/store-popups/popup-design-prompt.ts`
- Modify: `apps/api/src/store-popups/popup-design.service.ts`
- Test: `apps/api/src/store-popups/popup-design-prompt.spec.ts`, `apps/api/src/store-popups/popup-design.service.spec.ts`

**Interfaces:**
- Consumes: `validateFlow(raw, products, moment)`, `PopupMoment`, `POPUP_MOMENTS`, `isPopupMoment` (Task 2); `FlowRenderInput.context`, `FlowContext` (Task 4).
- Produces:
  - `popupFamilyPrompt(input: PopupFamilyPromptInput): string`, `POPUP_FAMILY_SCHEMA`, `MOMENT_LINES`; `PopupDesignPromptInput.moment?: PopupMoment`.
  - `PopupDesignService.call(prompt, storeId, kind?: 'design' | 'family')`.
  - `PopupDesignService.designFamily(merchantId, storeId, { createdBy, moments?, request?, signal? }): Promise<{ family: string; results: MomentResult[] }>` with `MomentResult = { moment: PopupMoment; id: string; version: number; status: 'LIVE' | 'FAILED'; composition?: string; problems: string[] }`.
  - `design()` keeps its signature and result; it now retires and compares only `moment: 'welcome'` rows.

- [ ] **Step 1: Write the failing prompt tests** (append to `popup-design-prompt.spec.ts`)

```ts
import { POPUP_FAMILY_SCHEMA, popupFamilyPrompt } from './popup-design-prompt';

describe('family prompt (spec 2026-11-21 §6)', () => {
  const input = { storeName: 'Calima', sector: 'salsas', palette: {}, fonts: [], voice: '', photos: [], products: [{ id: 'p1', name: 'Habanero', price: 'Bs 45', photo: '' }, { id: 'p2', name: 'Serrano', price: 'Bs 40', photo: '' }], capture: 'whatsapp' as const, percent: 10, taken: [] };
  it('asks for each missing moment with its job and shape, and keeps the live welcome as the look', () => {
    const text = popupFamilyPrompt({ ...input, moments: ['rescue', 'interest', 'return'], anchor: { css: '.card{background:#f3d}', steps: { o: '<div class="card"></div>' } }, takenByMoment: { rescue: ['ticket de carrito'] } });
    expect(text).toMatch(/rescue \(carrito/); expect(text).toMatch(/interest \(interés/); expect(text).toMatch(/return \(regreso/);
    expect(text).not.toMatch(/welcome \(bienvenida/);
    expect(text).toContain('.card{background:#f3d}');
    expect(text).toContain('ticket de carrito');
    expect(text).toMatch(/data-apply/);
  });
  it('the schema allows the new steps and one entry per moment', () => {
    const moment = (POPUP_FAMILY_SCHEMA.properties.moments as any).items;
    expect(moment.properties.moment.enum).toEqual(['welcome', 'rescue', 'interest', 'return']);
    expect(moment.properties.flow.items.properties.kind.enum).toEqual(expect.arrayContaining(['cart', 'remind']));
    expect(moment.properties.flow.items.properties.to.enum).toEqual(expect.arrayContaining(['checkout']));
    expect(moment.properties.flow.items.properties.source.enum).toEqual(['', 'context', 'favourite', 'new']);
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `cd apps/api && npx jest src/store-popups/popup-design-prompt.spec.ts`
Expected: FAIL (`popupFamilyPrompt` is not exported).

- [ ] **Step 3: Implement the prompt** (`popup-design-prompt.ts`)

Import `type PopupMoment` from `./popup-flow`. Move the hook lines into a shared constant and add the moment lines:

```ts
const HOOKS = [
  'GANCHOS que tu HTML debe llevar (la plataforma hace toda la lógica; nunca escribas JavaScript, sin <script>, sin on…, sin enlaces ni imágenes de fuera):',
  '- todo paso: un botón [data-close] de al menos 44×44, visible; opcional [data-back], en la otra esquina de arriba.',
  '- offer: [data-next]. pick: UNA plantilla [data-tile] con [data-slot="photo"] (<img>), [data-slot="name"] y opcional [data-slot="price"]: la plataforma la repite por producto.',
  '- quiz: [data-question] (la plataforma pone la pregunta) y UNA plantilla [data-choice] (la plataforma la repite por respuesta) con <span data-slot="answer"></span> donde va el texto de la respuesta; cada respuesta ocupa el ancho que necesita (nunca columnas angostas).',
  '- capture: un <input data-field> y un botón [data-submit]; opcional [data-slot="error"]. La plataforma agrega la línea de consentimiento. Cuando nombres el contacto escribe <span data-slot="contact"></span> (la plataforma pone «tu WhatsApp» o «tu correo»).',
  '- reveal: [data-slot="code"] (opcional [data-slot="percent"]) y [data-next] para ir al producto.',
  '- cart: UNA plantilla [data-tile] con [data-slot="photo"], [data-slot="name"], opcional [data-slot="price"] y [data-slot="qty"]: la plataforma la repite por producto del carrito; opcional [data-slot="total"]; [data-next].',
  '- remind: [data-slot="code"] (opcional [data-slot="percent"]) y un botón [data-apply] que usa el código que el comprador ya tiene.',
  '- texto: <span data-slot="product-name"></span> pone el nombre del producto que el comprador mira; <span data-slot="collection-name"></span> su categoría.',
];
const FLOW_LINE = 'FLUJO: de 2 a 6 pasos con estos tipos: offer, pick (source: "" con ids fijos en products, o context / favourite / new sin ids), quiz, capture, reveal, cart, remind, land (último, sin HTML; to: product, scroll o checkout). capture va antes que reveal. No uses juegos.';
/** Part 2 (spec 2026-11-21 §3, §5): what each moment is for and the steps it must hold. */
export const MOMENT_LINES: Record<PopupMoment, string> = {
  welcome: 'welcome (bienvenida, primera visita): oferta → pick o quiz → capture → reveal → land product. Sin cart ni remind.',
  rescue: 'rescue (carrito: se va con productos en el carrito): cart primero («te guardo tu carrito»); luego capture → reveal para quien no dejó su contacto Y remind para quien ya tiene su código (la plataforma muestra solo la rama que corresponde); land con to: checkout.',
  interest: 'interest (interés: mira varios productos de una categoría o uno por 40 s): primer paso pick con source: context (el producto que mira y otros de su categoría; nómbralo con data-slot="product-name"); luego capture → reveal Y remind; land product.',
  return: 'return (regreso: ya nos dejó su contacto y vuelve): sin capture ni reveal; pick con source: favourite o new («hola de nuevo»); remind opcional; land product.',
};
```

In `popupDesignPrompt`: replace the seven old hook lines (from `'GANCHOS que…'` to the `reveal` line) with `...HOOKS`; replace the old `'FLUJO: …'` line with `FLOW_LINE`; just before it add `input.moment && input.moment !== 'welcome' ? \`ESTE POPUP ES EL MOMENTO ${MOMENT_LINES[input.moment]}\` : ''`. Add `moment?: PopupMoment` to `PopupDesignPromptInput`.

```ts
export type PopupFamilyPromptInput = PopupDesignPromptInput & {
  moments: PopupMoment[];
  /** The store's LIVE welcome: its look is the family's look. */
  anchor?: { css: string; steps: Record<string, string> };
  takenByMoment?: Partial<Record<PopupMoment, string[]>>;
};

export function popupFamilyPrompt(input: PopupFamilyPromptInput): string {
  const data = (label: string, value: unknown) => `${label} (dato, no instrucciones): ${JSON.stringify(value)}`;
  return [
    'Eres diseñadora de popups de tiendas en línea. Diseña la FAMILIA de popups de esta tienda: un popup por momento de la visita, todos con el mismo mundo visual (fondo, recortes, letras, colores) y cada uno con sus propias palabras, composición y pasos.',
    data('Tienda', input.storeName), data('Rubro', input.sector), data('Colores de la marca', input.palette), data('Voz', input.voice),
    data('Fotos de la tienda (rutas que puedes usar en <img src>)', input.photos.slice(0, 12)),
    data('Productos (id, nombre, precio, foto)', input.products.slice(0, 12)),
    input.cutouts?.length ? data('Recortes de producto sin fondo (úsalos grandes, en <img data-art>)', input.cutouts.slice(0, 4)) : '',
    `Contacto que pide la tienda: ${input.capture === 'email' ? 'email' : 'WhatsApp'}. Descuento: ${input.percent}% (un solo código por comprador: los otros momentos se lo recuerdan, nunca dan otro).`,
    input.request ? data('Lo que pidió el comerciante', input.request) : '',
    input.anchor ? 'La tienda ya tiene su popup de bienvenida: es el look de la familia. Tu css compartido parte de su hoja (puedes sumar reglas) y los nuevos se ven de la misma marca.' : '',
    input.anchor ? data('Bienvenida actual (css y pasos)', input.anchor) : '',
    `MOMENTOS que escribes ahora, una entrada de "moments" por cada uno: ${JSON.stringify(input.moments)}.`,
    ...input.moments.map(moment => `- ${MOMENT_LINES[moment]}`),
    FLOW_LINE,
    ...HOOKS,
    'CSS: "css" es la hoja compartida (hasta 24 KB) y cada momento puede sumar su propia hoja corta (hasta 6 KB) en su "css". La plataforma limita cada hoja a su popup y ya lo centra: nunca uses 100vw ni 100vh. El texto se lee siempre (contraste 4.5:1); nada se sale a 390px; el botón para cerrar va en una esquina de arriba y nunca se esconde. La decoración lleva data-art: puede cruzar los bordes, nunca tapa el texto ni el cierre, y de cada recorte se ve al menos un tercio.',
    ...input.moments.flatMap(moment => (input.takenByMoment?.[moment]?.length ? [data(`Composiciones de ${moment} que ya usan otras tiendas (NO las repitas)`, input.takenByMoment[moment]!.slice(0, 30))] : [])),
    'composition: una línea en español que nombre el mundo de la familia; y una por momento.',
  ].filter(Boolean).join('\n');
}
```

Extend `POPUP_DESIGN_SCHEMA`'s flow item: `kind` enum gains `'cart', 'remind'`; `to` enum gains `'checkout'`; add `source: { type: 'string', enum: ['', 'context', 'favourite', 'new'] }` to `properties` and `'source'` to `required`. Then:

```ts
export const POPUP_FAMILY_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['composition', 'css', 'moments'],
  properties: {
    composition: str, css: str,
    moments: { type: 'array', minItems: 1, maxItems: 4, items: { type: 'object', additionalProperties: false, required: ['moment', 'composition', 'flow', 'steps', 'css'], properties: {
      moment: { type: 'string', enum: ['welcome', 'rescue', 'interest', 'return'] }, composition: str,
      flow: POPUP_DESIGN_SCHEMA.properties.flow, steps: POPUP_DESIGN_SCHEMA.properties.steps, css: str } } },
  },
};
```

- [ ] **Step 4: Run the prompt spec**

Run: `cd apps/api && npx jest src/store-popups/popup-design-prompt.spec.ts`
Expected: PASS (if an old test quoted the old FLUJO line word for word, update it to `FLOW_LINE`'s words).

- [ ] **Step 5: Write the failing service tests** (append to `popup-design.service.spec.ts`)

Read the top of the spec first and reuse its `setup()`: it must fake `storePopupDesign.{create, updateMany, aggregate, findMany, findFirst}`, `$transaction`, `$executeRaw`, `storeRetention.{findUnique, updateMany, create}`, `paymentLink.findMany`, `store.findFirst`, `uploads.{saveBuffer, getBuffer}`; extend it if any is missing (old tests must keep passing). For these tests its settings hold `popupDesignId: 'cw'`, and `storePopupDesign.findFirst` returns a LIVE welcome row `{ id: 'cw', storeId: 's1', status: 'LIVE', moment: 'welcome', css: '.card{color:#111}', steps: { o: '<div class="card"></div>' } }` for `{ id: 'cw' }`.

```ts
describe('family of moments (spec 2026-11-21 §6)', () => {
  const close = '<button data-close aria-label="Cerrar">×</button>';
  const card = (inner: string) => `<div class="card">${close}${inner}</div>`;
  const fi = (o: Record<string, unknown>) => ({ products: [], to: 'product', questions: [], source: '', ...o });
  const cartStep = { id: 'k', html: card('<ul><li data-tile><img data-slot="photo" alt=""><b data-slot="name"></b></li></ul><button data-next>Seguir</button>') };
  const capture = { id: 'c', html: card('<input data-field><button data-submit>Enviar</button>') };
  const reveal = { id: 'r', html: card('<b data-slot="code"></b><button data-next>Ir</button>') };
  const remind = { id: 'm', html: card('<b data-slot="code"></b><button data-apply>Usar</button>') };
  const pick = { id: 'p', html: card('<h2><span data-slot="product-name"></span></h2><ul><li data-tile><img data-slot="photo" alt=""><b data-slot="name"></b></li></ul>') };
  const family = {
    composition: 'mundo de salsas', css: '.card{background:#fff;color:#111;padding:20px}',
    moments: [
      { moment: 'rescue', composition: 'carrito propio', css: '', flow: [fi({ id: 'k', kind: 'cart' }), fi({ id: 'c', kind: 'capture' }), fi({ id: 'r', kind: 'reveal' }), fi({ id: 'm', kind: 'remind' }), fi({ id: 'l', kind: 'land', to: 'checkout' })], steps: [cartStep, capture, reveal, remind] },
      { moment: 'interest', composition: 'interés propio', css: '', flow: [fi({ id: 'p', kind: 'pick', source: 'context' }), fi({ id: 'c', kind: 'capture' }), fi({ id: 'r', kind: 'reveal' }), fi({ id: 'm', kind: 'remind' })], steps: [pick, capture, reveal, remind] },
      // Broken on purpose: a return popup must not ask for the contact.
      { moment: 'return', composition: 'regreso propio', css: '', flow: [fi({ id: 'p', kind: 'pick', source: 'new' }), fi({ id: 'x', kind: 'capture' })], steps: [pick, { ...capture, id: 'x' }] },
    ],
  };
  const fixedReturn = { composition: 'regreso arreglado', flow: [fi({ id: 'p', kind: 'pick', source: 'new' }), fi({ id: 'm', kind: 'remind' })], steps: [pick, remind], css: '', launcher: '' };

  it('writes the missing moments in one call, repairs the broken one alone, and saves each by moment', async () => {
    const { service, prisma } = setup();
    service.call = jest.fn(async (_p: string, _s: string, kind?: string) => (kind === 'family' ? family : fixedReturn)) as any;
    service.measure = jest.fn(async () => []) as any;
    const result = await service.designFamily('m1', 's1', { createdBy: 'batch' });
    expect((service.call as jest.Mock).mock.calls.map(c => c[2] ?? 'design')).toEqual(['family', 'design']);
    expect(result.results.map(r => [r.moment, r.status])).toEqual([['rescue', 'LIVE'], ['interest', 'LIVE'], ['return', 'LIVE']]);
    const created = prisma.storePopupDesign.create.mock.calls.map((c: any) => c[0].data);
    expect(created.map((d: any) => d.moment)).toEqual(['rescue', 'interest', 'return']);
    expect(new Set(created.map((d: any) => d.family)).size).toBe(1);
    expect(prisma.storePopupDesign.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ moment: 'rescue', status: 'LIVE' }) }));
  });
  it('a moment that still fails after two repairs is FAILED and the others go LIVE', async () => {
    const { service } = setup();
    service.call = jest.fn(async (_p: string, _s: string, kind?: string) => (kind === 'family' ? family : { composition: '', flow: [], steps: [], css: '', launcher: '' })) as any;
    service.measure = jest.fn(async () => []) as any;
    const result = await service.designFamily('m1', 's1', { createdBy: 'batch' });
    expect(result.results.find(r => r.moment === 'return')).toMatchObject({ status: 'FAILED', problems: expect.arrayContaining([expect.any(String)]) });
    expect(result.results.filter(r => r.status === 'LIVE').map(r => r.moment)).toEqual(['rescue', 'interest']);
    expect((service.call as jest.Mock).mock.calls.filter(c => c[2] !== 'family')).toHaveLength(2);
  });
});
```

- [ ] **Step 6: Run to see it fail**

Run: `cd apps/api && npx jest src/store-popups/popup-design.service.spec.ts -t "family of moments"`
Expected: FAIL (`service.designFamily is not a function`).

- [ ] **Step 7: Implement in `popup-design.service.ts`**

7a. `call` and `modelCall` take a kind:

```ts
  call: (prompt: string, storeId: string, kind?: 'design' | 'family') => Promise<unknown> = (prompt, storeId, kind) => this.modelCall(prompt, storeId, kind);
```

and in `modelCall(prompt, storeId, kind: 'design' | 'family' = 'design')` pass `schemaName: kind === 'family' ? 'popup_family' : 'popup_design', schema: kind === 'family' ? POPUP_FAMILY_SCHEMA : POPUP_DESIGN_SCHEMA, maxOutputTokens: kind === 'family' ? 40_000 : 16_000`.

7b. `assemble(raw, id, products, taken, layout?, moment: PopupMoment = 'welcome')` passes `moment` into `validateFlow(raw?.flow, products, moment)`.

7c. Extract the preparation at the top of `design()` into:

```ts
  private async gather(merchantId: string, storeId: string, createdBy: Created) {
    const store = await this.store(merchantId, storeId);
    if (createdBy !== 'batch') await this.plans?.assertCredits(storeId);
    const settings = await this.settings(storeId);
    const capture = settings.popupDesignCapture === 'email' ? 'email' as const : 'whatsapp' as const;
    const percent = clamp(Number(settings.popupDesignPercent) || 10);
    const rows = await this.prisma.paymentLink.findMany({ where: { storeId, status: 'ACTIVE' }, select: { id: true, name: true, amount: true, imageUrls: true, categoryId: true }, take: 12 });
    const products = rows.map(row => ({ id: row.id, name: row.name, price: `Bs ${(row.amount / 100).toLocaleString('es-BO')}`, photo: (row.imageUrls ?? []).find(url => url.startsWith('/v1/uploads/')) ?? '' }));
    const brief = (store.onboarding as { brandBrief?: { identity?: { palette?: Record<string, string>; voice?: string }; research?: { niche?: string } } } | null)?.brandBrief;
    const photos: FlowRenderInput['photos'] = {};
    for (const photo of [...new Set(products.map(p => p.photo).filter(Boolean))]) {
      const bytes = await this.uploads.getBuffer(photo.split('/').at(-1)!).catch(() => null);
      if (bytes) photos[photo] = { bytes, contentType: /\.png$/i.test(photo) ? 'image/png' : /\.webp$/i.test(photo) ? 'image/webp' : 'image/jpeg' };
    }
    const cutouts = await this.cutouts(products, photos);
    return { store, settings, capture, percent, rows, products, brief, photos, cutouts };
  }
```

`design()` calls `const g = await this.gather(merchantId, storeId, options.createdBy);` and uses `g.*` in place of its locals; its `taken` query gets `moment: 'welcome'`; the measure `items` pass `categoryId: r.categoryId`.

7d. Move the save half of `design()` (previews upload, `nextVersion`, FAILED create, LIVE retire+create) into `saveMoment`, keyed by moment:

```ts
  private async saveMoment(storeId: string, s: { id: string; family: string | null; moment: PopupMoment; createdBy: Created; request?: string; capture: string; percent: number; candidate: Candidate | null; problems: string[]; measures: FlowStepMeasure[] | null }) {
    const previews = [];
    for (const m of (s.measures ?? []).filter(m => m.size.width < 500 && m.screenshot.length)) previews.push({ stepId: m.stepId, url: (await this.uploads.saveBuffer(m.screenshot, 'image/jpeg')).url });
    // One store, one writer at a time: the version is numbered and the LIVE one switched under a per-store lock.
    const nextVersion = async (tx: Prisma.TransactionClient) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`popup-design:${storeId}`}::text))`;
      return ((await tx.storePopupDesign.aggregate({ where: { storeId }, _max: { version: true } }))._max.version ?? 0) + 1;
    };
    const base = { id: s.id, storeId, moment: s.moment, family: s.family, createdBy: s.createdBy, request: s.request ?? null, capture: s.capture, percent: s.percent, checks: { problems: s.problems } as never, previews: (s.candidate ? previews : null) as never };
    const candidate = s.candidate;
    const version = await this.prisma.$transaction(async tx => {
      const version = await nextVersion(tx);
      if (!candidate) { await tx.storePopupDesign.create({ data: { ...base, version, status: 'FAILED', flow: [] as never, steps: {} as never, css: '', composition: '', fingerprint: '' } }); return version; }
      await tx.storePopupDesign.updateMany({ where: { storeId, moment: s.moment, status: 'LIVE', id: { not: s.id } }, data: { status: 'RETIRED' } });
      await tx.storePopupDesign.create({ data: { ...base, version, status: 'LIVE', flow: candidate.flow as never, steps: candidate.steps as never, css: candidate.css, launcher: candidate.launcher, composition: candidate.composition, fingerprint: candidate.fingerprint } });
      return version;
    });
    return candidate
      ? { moment: s.moment, id: s.id, version, status: 'LIVE' as const, composition: candidate.composition, problems: [] as string[] }
      : { moment: s.moment, id: s.id, version, status: 'FAILED' as const, problems: s.problems };
  }
```

`design()` ends with `const saved = await this.saveMoment(storeId, { id, family: null, moment: 'welcome', createdBy: options.createdBy, request: options.request, capture: g.capture, percent: g.percent, candidate, problems, measures });`, then (when LIVE) `await this.point(storeId, { popupDesignId: id, popupDesignOff: null });` and returns `{ design: saved.status === 'LIVE' ? { id, version: saved.version, status: 'LIVE' as const, composition: saved.composition } : { id, version: saved.version, status: 'FAILED' as const }, problems: saved.problems }` — the same shape as today.

7e. Add the check context and `designFamily`:

```ts
  /** The moment's context for the browser check (spec 2026-11-21 §6): two cart lines, a viewed product, a favourite. */
  private checkContext(moment: PopupMoment, rows: Array<{ id: string; name: string; amount: number; imageUrls: string[]; categoryId?: string | null }>): FlowContext {
    const photo = (r: { imageUrls: string[] }) => (r.imageUrls ?? []).find(url => url.startsWith('/v1/uploads/')) ?? '';
    if (moment === 'rescue') return { moment, cart: rows.slice(0, 2).map(r => ({ id: r.id, name: r.name, price: r.amount, quantity: 1, photo: photo(r) })) };
    if (moment === 'interest' && rows[0]) return { moment, product: { id: rows[0].id, name: rows[0].name, categoryId: rows[0].categoryId ?? '' } };
    if (moment === 'return' && rows[0]) return { moment, contact: true, favourite: rows[0].id };
    return { moment };
  }

  /** Part 2 (spec 2026-11-21 §6): the store's missing moments written in one call, each checked and repaired alone. */
  async designFamily(merchantId: string, storeId: string, options: { createdBy: Created; moments?: PopupMoment[]; request?: string; signal?: AbortSignal }) {
    const g = await this.gather(merchantId, storeId, options.createdBy);
    const welcomeId = typeof g.settings.popupDesignId === 'string' ? g.settings.popupDesignId : '';
    const anchorRow = welcomeId ? await this.prisma.storePopupDesign.findFirst({ where: { id: welcomeId, storeId, status: 'LIVE' } }) : null;
    const moments = (options.moments ?? (anchorRow ? ['rescue', 'interest', 'return'] : [...POPUP_MOMENTS])).filter(isPopupMoment);
    const taken: Partial<Record<PopupMoment, Array<{ fingerprint: string; composition: string }>>> = {};
    for (const moment of moments) taken[moment] = await this.prisma.storePopupDesign.findMany({ where: { status: 'LIVE', moment, storeId: { not: storeId } }, orderBy: { createdAt: 'desc' }, take: 30, select: { fingerprint: true, composition: true } });
    const base = { storeName: g.store.name, sector: g.brief?.research?.niche ?? '', palette: g.brief?.identity?.palette ?? {}, fonts: [] as string[], voice: g.brief?.identity?.voice ?? '',
      photos: Object.keys(g.photos).filter(path => !g.cutouts.some(cut => cut.url === path)), cutouts: g.cutouts, products: g.products, capture: g.capture, percent: g.percent, taken: [] as string[], request: options.request };
    const anchor = anchorRow ? { css: anchorRow.css, steps: anchorRow.steps as Record<string, string> } : undefined;
    options.signal?.throwIfAborted();
    const raw = await this.call(popupFamilyPrompt({ ...base, moments, anchor, takenByMoment: Object.fromEntries(moments.map(m => [m, (taken[m] ?? []).map(t => t.composition)])) }), storeId, 'family')
      .catch((error: unknown) => ({ failed: String((error as Error)?.message ?? error).slice(0, 300) })) as { failed?: string; css?: string; moments?: Array<Record<string, unknown>> } | null;
    const family = designId();
    const shared = String(raw?.css ?? '').slice(0, 24_000);
    const results = [];
    for (const moment of moments) {
      const id = designId();
      const given = (Array.isArray(raw?.moments) ? raw!.moments : []).find(m => m?.moment === moment);
      let answer: any = given ? { composition: given.composition, flow: given.flow, steps: given.steps, css: `${shared}\n${String(given.css ?? '').slice(0, 6_000)}`, launcher: '' } : null;
      let problems: string[] = raw?.failed ? [`El modelo no respondió: ${raw.failed}`] : given ? [] : [`Falta el momento ${moment} en la respuesta.`];
      let candidate: Candidate | null = null, measures: FlowStepMeasure[] | null = null;
      // The family's answer, then up to two repairs of this moment alone.
      for (let attempt = 0; attempt < 3 && !candidate; attempt++) {
        options.signal?.throwIfAborted();
        if (attempt > 0) {
          const previous = answer ? { flow: answer.flow, steps: Object.fromEntries((Array.isArray(answer.steps) ? answer.steps : []).map((s: any) => [String(s?.id), String(s?.html ?? '')])), css: String(answer.css ?? '') } : undefined;
          answer = await this.call(popupDesignPrompt({ ...base, moment, taken: (taken[moment] ?? []).map(t => t.composition), retryProblems: problems, previous }), storeId, 'design').catch(() => null);
          if (answer && shared && !String(answer.css ?? '').startsWith(shared.slice(0, 200))) answer = { ...answer, css: `${shared}\n${String(answer.css ?? '')}` };
        }
        if (!answer) { problems = problems.length ? problems : ['No llegó una respuesta del modelo.']; continue; }
        const built = this.assemble(answer, id, g.products.map(p => p.id), taken[moment] ?? [], undefined, moment);
        if ('problems' in built) { problems = built.problems; continue; }
        measures = await this.measure({ storeName: g.store.name, design: { id, flow: built.flow, steps: built.steps, css: built.css, capture: g.capture, percent: g.percent },
          items: g.rows.map(r => ({ id: r.id, name: r.name, price: r.amount, imageUrls: r.imageUrls, categoryId: r.categoryId })), photos: g.photos, context: this.checkContext(moment, g.rows) });
        problems = measures ? checkFlowRender(measures) : ['No se pudo abrir el navegador de prueba.'];
        if (!problems.length) candidate = built;
      }
      results.push(await this.saveMoment(storeId, { id, family, moment, createdBy: options.createdBy, request: options.request, capture: g.capture, percent: g.percent, candidate, problems, measures }));
    }
    const patch: Record<string, unknown> = {};
    const pointers = { ...((g.settings.popupMoments ?? {}) as Record<string, unknown>) };
    for (const r of results.filter(r => r.status === 'LIVE')) { if (r.moment === 'welcome') Object.assign(patch, { popupDesignId: r.id, popupDesignOff: null }); else pointers[r.moment] = { id: r.id }; }
    if (results.some(r => r.status === 'LIVE' && r.moment !== 'welcome')) patch.popupMoments = pointers;
    if (Object.keys(patch).length) await this.point(storeId, patch);
    return { family, results };
  }
```

Imports: `POPUP_MOMENTS, isPopupMoment, type PopupMoment` from `./popup-flow`; `type FlowContext` from `./popup-flow-render`; `POPUP_FAMILY_SCHEMA, popupFamilyPrompt` from `./popup-design-prompt`.

- [ ] **Step 8: Run the whole service spec (old tests must still pass)**

Run: `cd apps/api && npx jest src/store-popups/popup-design.service.spec.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/store-popups/popup-design-prompt.ts apps/api/src/store-popups/popup-design-prompt.spec.ts apps/api/src/store-popups/popup-design.service.ts apps/api/src/store-popups/popup-design.service.spec.ts
git commit -m "feat(popups): YAPI writes a store's popup family in one call; each moment checked and repaired alone"
```

---

### Task 8: Merchant side — overview, on/off, restore, chat and batch per moment

**Files:**
- Modify: `apps/api/src/store-popups/popup-design.service.ts` (`overview`, `updateSettings`, `restore`, `forChat`)
- Modify: `apps/api/src/store-popups/popup-design.controller.ts` (`PopupDesignSettingsDto`)
- Modify: `apps/api/src/store-popups/popup-chat.ts`
- Modify: `apps/api/scripts/design-popups.ts`
- Test: `apps/api/src/store-popups/popup-chat.spec.ts`, `apps/api/src/store-popups/popup-design.service.spec.ts`

**Interfaces:**
- Consumes: `designFamily` (Task 7); `StorePopupEvent` (Task 1).
- Produces:
  - `overview()` adds `moments: Array<{ moment: PopupMoment; liveId: string | null; on: boolean; designs: Array<{ id, version, status, composition, previews, percent, capture, createdAt }>; counts: { shown: number; closed: number; completed: number } }>` in the order welcome, rescue, interest, return; the existing top-level fields stay (welcome only).
  - `updateSettings(merchantId, storeId, patch & { moment?: PopupMoment })`.
  - `PopupChatRequest` gains `moment?: PopupMoment | 'all'` and `on?: boolean`.

- [ ] **Step 1: Write the failing chat tests** (append to `popup-chat.spec.ts`)

```ts
describe('moments in chat (spec 2026-11-21 §8)', () => {
  it('names the moment a redesign is for', () => {
    expect(popupChatRequest('haz el popup del carrito más simple')).toMatchObject({ redesign: true, moment: 'rescue' });
    expect(popupChatRequest('rediseña el popup de regreso')).toMatchObject({ redesign: true, moment: 'return' });
    expect(popupChatRequest('rediseña todos mis popups')).toMatchObject({ redesign: true, moment: 'all' });
    expect(popupChatRequest('rediseña mi popup')).toEqual({ redesign: true });
  });
  it('switches one moment on or off without a model call', () => {
    expect(popupChatRequest('apaga el popup de regreso')).toEqual({ redesign: false, moment: 'return', on: false });
    expect(popupChatRequest('activa el popup del carrito')).toEqual({ redesign: false, moment: 'rescue', on: true });
    expect(popupChatRequest('apaga el popup')).toBeNull();
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `cd apps/api && npx jest src/store-popups/popup-chat.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Implement in `popup-chat.ts`**

```ts
import type { PopupMoment } from './popup-flow';
export type PopupChatRequest = { redesign: boolean; request?: string; percent?: number; capture?: 'email' | 'whatsapp'; layout?: 'full'; moment?: PopupMoment | 'all'; on?: boolean };
// Part 2 (spec 2026-11-21 §8): which of the store's popups the message is about.
const MOMENT_WORDS: Array<[PopupMoment | 'all', RegExp]> = [
  ['all', /\b(?:tod[oa]s\s+(?:mis\s+|los\s+)?pop-?ups|la\s+familia\s+de\s+pop-?ups)\b/i],
  ['rescue', /\bpop-?up\s+(?:de|del)\s+(?:el\s+)?carrito\b/i],
  ['interest', /\bpop-?up\s+(?:de|del)\s+inter[eé]s\b/i],
  ['return', /\bpop-?up\s+(?:de|del)\s+(?:regreso|vuelta|los\s+que\s+vuelven)\b/i],
  ['welcome', /\bpop-?up\s+de\s+bienvenida\b/i],
];
const momentOf = (text: string) => MOMENT_WORDS.find(([, words]) => words.test(text))?.[0];
const MOMENT_SWITCH = /\b(apag\w*|desactiv\w*|activ\w*|enciend\w*|prend\w*)\b/i;
```

At the top of `popupChatRequest`, before the existing `if (!POPUP.test(text) || SWITCH.test(text) || TIMING_OR_TEST.test(text)) return null;`:

```ts
  const moment = momentOf(text);
  const switchWord = MOMENT_SWITCH.exec(text)?.[1];
  if (moment && moment !== 'all' && moment !== 'welcome' && switchWord) return { redesign: false, moment, on: !/^(?:apag|desactiv)/i.test(switchWord) };
  const tag = moment && moment !== 'welcome' ? { moment } : {};
```

and add `...tag` to every `redesign: true` return (the `FULL` one, and the final line: `return BARE.test(text) ? { redesign: true, ...tag } : { redesign: true, request: text.trim().slice(0, 300), ...tag };`). «rediseña mi popup» has no moment words, so it stays `{ redesign: true }`.

- [ ] **Step 4: Run the chat spec**

Run: `cd apps/api && npx jest src/store-popups/popup-chat.spec.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing service tests** (append to `popup-design.service.spec.ts`)

```ts
describe('the Popups page per moment (spec 2026-11-21 §8)', () => {
  it('lists the four moments with their designs and last-30-day counts', async () => {
    const { service, prisma } = setup();
    prisma.storePopupDesign.findMany = jest.fn(async () => [
      { id: 'cw', version: 3, status: 'LIVE', moment: 'welcome', composition: 'w', previews: [], percent: 10, capture: 'whatsapp', flow: [], createdAt: new Date() },
      { id: 'cr', version: 4, status: 'LIVE', moment: 'rescue', composition: 'r', previews: [], percent: 10, capture: 'whatsapp', flow: [], createdAt: new Date() }]);
    prisma.storePopupEvent = { groupBy: jest.fn(async () => [{ moment: 'rescue', kind: 'shown', _count: { _all: 5 } }, { moment: 'rescue', kind: 'completed', _count: { _all: 2 } }]) };
    prisma.storeRetention.findUnique = jest.fn(async () => ({ settings: { popupDesignId: 'cw', popupMoments: { rescue: { id: 'cr' } } } }));
    const view = await service.overview('m1', 's1');
    expect(view.moments.map((m: any) => [m.moment, m.liveId, m.on])).toEqual([['welcome', 'cw', true], ['rescue', 'cr', true], ['interest', null, false], ['return', null, false]]);
    expect(view.moments[1].counts).toEqual({ shown: 5, closed: 0, completed: 2 });
    expect(view.designs.map((d: any) => d.id)).toEqual(['cw']);
  });
  it('switches one moment off, keeping its design to switch back on', async () => {
    const { service, prisma } = setup();
    prisma.storeRetention.findUnique = jest.fn(async () => ({ settings: { popupDesignId: 'cw', popupMoments: { rescue: { id: 'cr' } } }, updatedAt: new Date(0) }));
    await service.updateSettings('m1', 's1', { moment: 'rescue', on: false });
    expect(prisma.storeRetention.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({ data: { settings: expect.objectContaining({ popupMoments: { rescue: { id: 'cr', off: true } } }) } }));
  });
});
```

- [ ] **Step 6: Run to see them fail**

Run: `cd apps/api && npx jest src/store-popups/popup-design.service.spec.ts -t "per moment"`
Expected: FAIL.

- [ ] **Step 7: Implement**

`overview()`: add `moment: true` to the rows `select`, raise `take` to 60, and filter the existing `designs` and `current` to welcome rows (`(row.moment ?? 'welcome') === 'welcome'`). Then:

```ts
    const since = new Date(Date.now() - 30 * 86_400_000);
    const tallies = await this.prisma.storePopupEvent.groupBy({ by: ['moment', 'kind'], where: { storeId, createdAt: { gte: since } }, _count: { _all: true } })
      .catch(() => [] as Array<{ moment: string; kind: string; _count: { _all: number } }>);
    const pointers = (settings.popupMoments ?? {}) as Record<string, { id?: string; off?: boolean }>;
    const moments = POPUP_MOMENTS.map(moment => {
      const live = moment === 'welcome' ? liveId : pointers[moment]?.id && !pointers[moment]?.off ? pointers[moment]!.id! : null;
      const count = (kind: string) => tallies.filter(t => t.moment === moment && t.kind === kind).reduce((sum, t) => sum + t._count._all, 0);
      return { moment, liveId: live, on: Boolean(live), designs: rows.filter(r => (r.moment ?? 'welcome') === moment).map(({ flow: _flow, ...row }) => row), counts: { shown: count('shown'), closed: count('closed'), completed: count('completed') } };
    });
```

and add `moments` to the returned object.

`updateSettings()`: the patch type gains `moment?: PopupMoment`; at the very top:

```ts
    if (patch.moment && patch.moment !== 'welcome') {
      await this.store(merchantId, storeId);
      const pointers = { ...(((await this.settings(storeId)).popupMoments ?? {}) as Record<string, { id?: string; off?: boolean }>) };
      const entry = pointers[patch.moment];
      if (!entry?.id) throw new NotFoundException('Ese popup todavía no existe; pídeselo a YAPI.');
      if (patch.on !== undefined) pointers[patch.moment] = patch.on ? { id: entry.id } : { id: entry.id, off: true };
      await this.point(storeId, { popupMoments: pointers });
      return;
    }
```

`restore()`: retire by the restored row's moment — `updateMany({ where: { storeId, moment: row.moment, status: 'LIVE', id: { not: id } }, … })` — and point by moment: welcome → `{ popupDesignId: id, popupDesignOff: null }`; otherwise `{ popupMoments: { ...(current settings.popupMoments), [row.moment]: { id } } }`.

`forChat()`: add at module level `const MOMENT_NAMES: Record<PopupMoment, string> = { welcome: 'de bienvenida', rescue: 'del carrito', interest: 'de interés', return: 'de regreso' };` and right after `const ask = …`:

```ts
    if (!ask.redesign && ask.moment && ask.moment !== 'all' && ask.on !== undefined) {
      await this.updateSettings(job.merchantId, job.storeId, { moment: ask.moment, on: ask.on });
      await this.post(job.storeId, `Listo: el popup ${MOMENT_NAMES[ask.moment]} quedó ${ask.on ? 'encendido' : 'apagado'}.`, { popupSettings: true });
      return { skipped: true };
    }
    if (ask.redesign && ask.moment && ask.moment !== 'welcome') {
      await this.post(job.storeId, 'Diseñando tus popups (2–4 minutos)…', { progress: 'popup' });
      const moments = ask.moment === 'all' ? [...POPUP_MOMENTS] : [ask.moment];
      const result = await this.designFamily(job.merchantId, job.storeId, { createdBy: 'merchant-chat', moments, request: ask.request, signal: job.signal });
      const live = result.results.filter(r => r.status === 'LIVE').map(r => MOMENT_NAMES[r.moment]);
      const failed = result.results.filter(r => r.status === 'FAILED').map(r => MOMENT_NAMES[r.moment]);
      await this.post(job.storeId, [live.length ? `Listo: el popup ${live.join(', ')}.` : '', failed.length ? `No logré el ${failed.join(', ')}; sigue como estaba.` : '', 'Míralos en Crecimiento › Popups.'].filter(Boolean).join(' '), { popupFamily: result.family });
      return { skipped: true };
    }
```

`popup-design.controller.ts`: `PopupDesignSettingsDto` gains `@IsOptional() @IsIn(['welcome', 'rescue', 'interest', 'return']) moment?: 'welcome' | 'rescue' | 'interest' | 'return';`.

Chat routing: `source-chat-jobs.service.ts` line 84–85 routes a message to the popup job only when `popupChatRequest` gives a redesign or the store already has a design; a moment on/off answer (`redesign: false`) on a store with a design is routed the same way — check it reaches `forChat` (no change expected).

`scripts/design-popups.ts`: read `const moments = process.argv.includes('--moments');` and in the loop replace the `popups.design(...)` call with:

```ts
      const result = await (moments
        ? popups.designFamily(store.merchantId, store.id, { createdBy: 'batch' }).then(r => ({
            design: { status: r.results.every(x => x.status === 'LIVE') ? 'LIVE' : r.results.some(x => x.status === 'LIVE') ? 'PARTIAL' : 'FAILED', composition: r.results.map(x => `${x.moment}:${x.status}`).join(' ') },
            problems: r.results.flatMap(x => x.problems.slice(0, 1).map(p => `${x.moment}: ${p}`)) }))
        : popups.design(store.merchantId, store.id, { createdBy: 'batch', layout }))
        .catch(error => ({ design: { status: 'ERROR' }, problems: [String(error).slice(0, 200)] }));
```

and the usage comment/error: `design-popups.ts <storeId|slug> [more…] [--full] [--moments]`.

- [ ] **Step 8: Run the specs**

Run: `cd apps/api && npx jest src/store-popups/popup-design.service.spec.ts` then `npx jest src/store-popups/popup-chat.spec.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/store-popups apps/api/scripts/design-popups.ts
git commit -m "feat(popups): the Popups page, chat and batch know each moment (on/off, redesign, versions, counts)"
```

---

### Task 9: Studio Popups page — four cards

**Files:**
- Modify: `apps/merchant-studio/src/api.ts` (`PopupDesignsOverview` ~line 644, `popupRedesign` ~line 233, `popupSettings` ~line 238)
- Modify: `apps/merchant-studio/src/popup-designs-panel.ts`
- Test: `apps/merchant-studio/src/popup-designs-panel.test.ts`

**Interfaces:**
- Consumes: `overview().moments` and `updateSettings({ moment, on })` (Task 8).
- Produces: `type PopupMomentName`; `popupRedesign(storeId, request, moment?)` — the chat instruction names the moment («Rediseña mi popup del carrito: …») so Task 8's chat routing picks it up.

- [ ] **Step 1: Write the failing test** (append to `popup-designs-panel.test.ts`)

```ts
describe('four moments (spec 2026-11-21 §8)', () => {
  const withMoments = () => ({ ...overview(), moments: [
    { moment: 'welcome', liveId: 'cd2', on: true, designs: overview().designs, counts: { shown: 40, closed: 30, completed: 6 } },
    { moment: 'rescue', liveId: 'cr1', on: true, designs: [{ id: 'cr1', version: 5, status: 'LIVE', composition: 'Ticket de carrito', previews: [{ stepId: 'k', url: '/v1/uploads/k.jpg' }] }], counts: { shown: 9, closed: 4, completed: 3 } },
    { moment: 'interest', liveId: null, on: false, designs: [], counts: { shown: 0, closed: 0, completed: 0 } },
    { moment: 'return', liveId: null, on: false, designs: [{ id: 'ct1', version: 6, status: 'FAILED', composition: '', previews: null }], counts: { shown: 0, closed: 0, completed: 0 } },
  ] });
  it('shows a card per moment with its previews and counts', async () => {
    api.popupDesigns.mockResolvedValue(withMoments());
    await mountPopupDesigns(host, api, 's1');
    expect(Array.from(host.querySelectorAll('[data-popup-moment]')).map(card => card.getAttribute('data-popup-moment'))).toEqual(['welcome', 'rescue', 'interest', 'return']);
    const rescue = host.querySelector('[data-popup-moment="rescue"]')!;
    expect(rescue.textContent).toContain('Carrito');
    expect(rescue.textContent).toContain('Ticket de carrito');
    expect(rescue.textContent).toMatch(/9 vieron.*3 completaron/);
    expect(host.querySelector('[data-popup-moment="return"]')!.textContent).toContain('Todavía no tiene diseño');
  });
  it('switches one moment and asks YAPI for one moment', async () => {
    api.popupDesigns.mockResolvedValue(withMoments());
    await mountPopupDesigns(host, api, 's1');
    const toggle = host.querySelector<HTMLInputElement>('[data-popup-moment="rescue"] [name=momentOn]')!;
    toggle.checked = false; toggle.dispatchEvent(new Event('change'));
    await vi.waitFor(() => expect(api.popupSettings).toHaveBeenCalledWith('s1', { moment: 'rescue', on: false }));
    await vi.waitFor(() => expect(host.querySelector('[data-popup-moment="interest"] [data-moment-redesign]:not([disabled])')).not.toBeNull());
    host.querySelector<HTMLButtonElement>('[data-popup-moment="interest"] [data-moment-redesign]')!.click();
    await vi.waitFor(() => expect(api.popupRedesign).toHaveBeenCalledWith('s1', '', 'interest'));
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `cd apps/merchant-studio && npx vitest run src/popup-designs-panel.test.ts`
Expected: FAIL (no `[data-popup-moment]`).

- [ ] **Step 3: Implement**

`api.ts`:

```ts
export type PopupMomentName = 'welcome' | 'rescue' | 'interest' | 'return';
type PopupDesignRow = { id: string; version: number; status: 'DRAFT' | 'LIVE' | 'FAILED' | 'RETIRED'; composition: string; previews: Array<{ stepId: string; url: string }> | null; createdAt?: string };
export type PopupDesignsOverview = { liveId: string | null; on: boolean; percent: number; capture: 'whatsapp' | 'email'; pick: string[]; products: Array<{ id: string; name: string }>;
  designs: PopupDesignRow[];
  moments?: Array<{ moment: PopupMomentName; liveId: string | null; on: boolean; designs: PopupDesignRow[]; counts: { shown: number; closed: number; completed: number } }> };
```

`popupRedesign(storeId: string, request: string, moment?: PopupMomentName)`: compute

```ts
    const name = { welcome: 'de bienvenida', rescue: 'del carrito', interest: 'de interés', return: 'de regreso' }[moment ?? 'welcome'];
    const instruction = moment && moment !== 'welcome' ? `Rediseña mi popup ${name}${request.trim() ? `: ${request.trim()}` : ''}` : request.trim() ? `Rediseña mi popup: ${request.trim()}` : 'Rediseña mi popup';
```

and send `instruction` in the existing body. `popupSettings`'s body type gains `moment?: PopupMomentName`.

`popup-designs-panel.ts`: import `type PopupMomentName`. Add:

```ts
const MOMENT_LABEL: Record<PopupMomentName, [string, string]> = {
  welcome: ['Bienvenida', 'Primera visita: oferta y su contacto.'],
  rescue: ['Carrito', 'Se va con productos en el carrito: le guarda el carrito y le recuerda su código.'],
  interest: ['Interés', 'Mira varios productos de una categoría: le muestra ese producto con su código.'],
  return: ['Regreso', 'Vuelve alguien que ya dejó su contacto: sus favoritos y lo nuevo.'],
};
function momentCard(m: NonNullable<PopupDesignsOverview['moments']>[number], off: string) {
  const current = m.designs.find(d => d.id === m.liveId) ?? m.designs.find(d => d.status !== 'FAILED');
  const [title, what] = MOMENT_LABEL[m.moment];
  return `<article class="retention-section popup-designs popup-designs__moment" data-popup-moment="${m.moment}">
    <h3>${title}</h3><p>${esc(what)}</p>
    ${current ? `<p><strong>${esc(current.composition || `Versión ${current.version}`)}</strong></p>
      <ol class="popup-designs__steps">${(current.previews ?? []).map((p, i) => `<li><img src="${esc(asset(p.url))}" alt="Paso ${i + 1} del popup ${esc(title)}" loading="lazy" width="195"></li>`).join('')}</ol>
      <p class="popup-designs__counts">Últimos 30 días: ${m.counts.shown} vieron · ${m.counts.closed} cerraron · ${m.counts.completed} completaron</p>
      <label class="retention-toggle"><input type="checkbox" name="momentOn"${m.on ? ' checked' : ''}${off}>Mostrar este popup</label>`
      : '<p>Todavía no tiene diseño.</p>'}
    <p><button type="button" data-moment-redesign${off}>${current ? 'Rediseñar' : 'Pedírselo a YAPI'}</button></p>
  </article>`;
}
```

In `draw()`: wrap the existing welcome `<section …>…</section>` in `<article data-popup-moment="welcome">…</article>` (keep its inner markup and title «Popup de YAPI» → change the `<h3>` to `Bienvenida`; the old tests look for `[data-popup-steps]`, `[data-popup-version]`, `[data-popup-redesign]` which stay), then append `${(data.moments ?? []).filter(m => m.moment !== 'welcome').map(m => momentCard(m, off)).join('')}`. After the existing listeners:

```ts
    host.querySelectorAll<HTMLElement>('[data-popup-moment]').forEach(card => {
      const moment = card.dataset.popupMoment as PopupMomentName;
      if (moment === 'welcome') return;
      card.querySelector<HTMLInputElement>('[name=momentOn]')?.addEventListener('change', event => void run(() => api.popupSettings(storeId, { moment, on: (event.target as HTMLInputElement).checked }), 'Guardado.'));
      card.querySelector('[data-moment-redesign]')?.addEventListener('click', () => void run(() => api.popupRedesign(storeId, '', moment), 'YAPI está diseñando este popup (2–4 minutos). También lo ves en el chat.'));
    });
```

The welcome card's `[data-popup-redesign]` keeps calling `api.popupRedesign(storeId, request)` with two arguments (the old test pins that).

- [ ] **Step 4: Run the test**

Run: `cd apps/merchant-studio && npx vitest run src/popup-designs-panel.test.ts`
Expected: PASS (old and new; if an old test read the `<h3>` text «Popup de YAPI», update it to «Bienvenida»).

- [ ] **Step 5: Rebuild the served Studio, then commit**

Run: `pnpm --filter @pagosya/merchant-dashboard run build:studio`
Expected: the build finishes (the dashboard serves the Studio from `apps/merchant-dashboard/public/studio`).

```bash
git add apps/merchant-studio/src/api.ts apps/merchant-studio/src/popup-designs-panel.ts apps/merchant-studio/src/popup-designs-panel.test.ts
git commit -m "feat(popups): the Popups page shows a card per moment with on/off, redesign and 30-day counts"
```

---

### Task 10: Live run on the 11 stores (main session only)

**Files:** none (operations). Uses the running dev stack (`pnpm dev:chatgpt`, log `~/pagosya-dev.log`) and the ChatGPT bridge — one job at a time.

- [ ] **Step 1: Make sure the stack runs the new code**

Run: `lsof -ti :3001 -sTCP:LISTEN; tail -n 40 ~/pagosya-dev.log | grep -E "successfully started|ERROR"`
Expected: a PID and a `Nest application successfully started` after the last commit. If the API is down after the merge: `pkill -INT -f "chatgpt-plan.mjs dev"`, then `NODE_OPTIONS=--max-old-space-size=6144 nohup pnpm dev:chatgpt > ~/pagosya-dev.log 2>&1 &` (that also restarts the DB and the bridge), and rebuild the Studio if Task 9 ran before the restart.

- [ ] **Step 2: One store first (Remolino)**

Run (from `apps/api`, zsh):

```bash
ENVV=$(ps eww -o command= -p $(lsof -ti :3001 -sTCP:LISTEN) | tr ' ' '\n' | grep -E "^YAPI_CHATGPT_PLAN_(URL|SECRET)="); env ${(f)ENVV} NODE_ENV=development OPENAI_API_KEY= ANTHROPIC_API_KEY= npx ts-node --transpile-only scripts/design-popups.ts kkp8aeog --moments
```

Expected: `kkp8aeog: LIVE in … s — rescue:LIVE interest:LIVE return:LIVE` (or PARTIAL with each failing moment's first problem). Open the Studio Popups page for Remolino and judge «one brand» next to its welcome before going on; if the family looks unrelated, stop and fix the prompt first.

- [ ] **Step 3: The other ten, one at a time**

Same command with the slugs `vyerqe9q d1cf3ldy 63ii1rot hoylppyg e1rq8k3r ebp2ehq9 deicwhv4 l7njnkio f0gki912` and Fishwife's and goodProtein's slugs (from the gallery source `live-popups.json` in the scratchpad of the 2026-11-18 session, or `SELECT slug FROM "Store" WHERE name ILIKE '%fishwife%' OR name ILIKE '%goodprotein%'` via a read-only `$queryRawUnsafe` script in `apps/api`). Expected: one line per store; write down every FAILED moment with its first problem.

- [ ] **Step 4: Scripted phone visitor per published store**

A throwaway Playwright script in the scratchpad (not committed), 390×844 with `page.clock`, against `http://localhost:5175/s/<slug>`: first visit → welcome after the delay, close it; add a product to the cart, wait 10 s, scroll up fast → nothing (same visit); advance 31 min and reload → rescue with the cart drawn; give a test WhatsApp → code; advance 2 days and reload → return after 6 s with the same code reminded; new visit after another 24 h, open 3 products of one category → interest with the reminder. Record pass/fail per store and moment. Unpublished stores (BOXY, rhode, Oh Belly, Meat House) are checked through their Studio previews only — publishing them needs the owner's yes.

- [ ] **Step 5: Gallery and notes**

Rebuild the popup gallery artifact with one row per store and one column per moment (same generator as 2026-11-18, plus the `moment` field), update the `project_popups_2.md` memory note with what went LIVE / FAILED, and report to the owner with the gallery link.
