# Popups 2.0 Part 1 — the engine — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every store's popup is a YAPI-written design — free HTML per step plus one CSS sheet — played by one runtime through a
flow (offer/game → pick/quiz → capture → reveal → land on the product with the code in the cart), gated by a real-browser check
and a variety check.

**Architecture:** API module `apps/api/src/store-popups/` gains pure modules (flow rules, HTML cleaner, CSS scoper, fingerprint)
and a `PopupDesignService` (model call → clean → check → save). Designs live in a new `StorePopupDesign` table; the store's
`StoreRetention.settings.popupDesignId` points at the LIVE one. The storefront runtime `packages/storefront-kit/kit/retention.js`
gains a `mountFlow` branch; commerce.js gains a `pagosya:apply-promo` event. The existing subscribe endpoint saves contacts and
returns a personal code tagged with the design.

**Tech Stack:** NestJS + Prisma 5 (jest), parse5 + postcss (already in apps/api), Playwright (popup-render), storefront kit plain JS
(apps/checkout vitest tests), Studio TypeScript (vitest).

**Spec:** `docs/superpowers/specs/2026-11-18-popups-engine-design.md` (corrected d5a5d1a0)

## Global Constraints

- YAPI writes HTML + CSS only; **no YAPI JavaScript**; the platform owns prizes, codes, contacts, cart, navigation.
- HTML allowlist; images only the store's own `/v1/uploads/<file>` or `assets/…`; no `on…`, script, iframe/object/embed, form action, outside links.
- CSS scoped under `[data-pya-popup="<designId>"]`, ≤ 24 KB, no `@import`, no outside `url()`, never hides `[data-close]`, `[data-field]`, `[data-submit]`.
- Steps per flow 2–6; `capture` before `reveal`; `land` last; ≤ 1 `game`; every rendered step has `[data-close]`.
- Capture channel per design: `whatsapp` (default) or `email`; percent 5–30.
- Browser check at 390×844 and 1280×800, reduced motion: close ≥ 40×40 inside the viewport, text contrast ≥ 4.5, no sideways scroll, fields typeable, pick tiles filled.
- Variety: fingerprint differs from the merchant's other stores' LIVE designs and the last 30 designs; `composition` line not repeated.
- A store without a LIVE design keeps today's popup (looks/games/«Rasca y elige» unchanged).
- Light checks: one spec file per run; never prisma migrate/diff/reset against the dev DB (54329) — migrations are hand-written, validated on a scratch Postgres (scratchpad initdb, port 54399).
- Work in worktree `.claude/worktrees/popups-engine` on branch `feature/popups-engine` off `oct24-clean`; merge back only with the owner's go-ahead and no running YAPI job.
- Spanish, tú, for merchant- and shopper-facing words.

## Review Focus

- **A product used in `pick`/`quiz` is archived after the design was saved:** the runtime drops it; with fewer than 2 left the step is skipped — test in Task 6.
- **The shopper double-taps «submit» / the network fails on capture:** one subscriber, one code; the code is not shown until the contact is saved — test in Task 7.
- **A design whose CSS hides the close button through a parent (`.wrap{display:none}` around it):** caught by the browser check, not only by the CSS scoper — test in Task 8.
- **Hosted store pages (iframe, `PAGOSYA_HOSTED`):** the apply-promo + favourite land works through the parent like the favourite does today — test in Task 6.
- **A store with 0–1 products:** YAPI is told; `pick`/`quiz` are refused by the flow rules for it — test in Task 2.

---

## File Structure

| File | Responsibility |
|---|---|
| `apps/api/prisma/migrations/20261119120000_popup_designs/migration.sql` (+ schema) | `StorePopupDesign`; `popupDesignId` on subscribers (both tables) and `PromoCode` |
| `apps/api/src/store-popups/popup-flow.ts` | Flow types and rules (pure) |
| `apps/api/src/store-popups/popup-html.ts` | Clean one step's HTML; check its hooks (pure, parse5) |
| `apps/api/src/store-popups/popup-css.ts` | Scope and guard the design CSS (pure, postcss) |
| `apps/api/src/store-popups/popup-fingerprint.ts` | Layout fingerprint + variety decision (pure) |
| `packages/storefront-kit/kit/retention.js` | `mountFlow` plays a LIVE design |
| `packages/storefront-kit/commerce-src/catalog/favourite.js` (built into commerce.js) | `pagosya:apply-promo` listener |
| `apps/api/src/retention/retention.service.ts` + dto | Serve the LIVE design; subscribe with `popupDesignId`; tagged personal code |
| `apps/api/src/store-popups/popup-render.ts` | `measureFlow` + `checkFlowRender` (every step, both sizes) |
| `apps/api/src/store-popups/popup-design-prompt.ts` | Prompt + output schema for YAPI (pure) |
| `apps/api/src/store-popups/popup-design.service.ts` | design / redesign / restore / list |
| `apps/api/src/store-popups/popup-design.controller.ts` | Merchant endpoints |
| `apps/api/scripts/design-popups.ts` | Batch for owner-named stores |
| `apps/merchant-studio/src/retention.ts` (+ api.ts) | Popups page: previews, settings, versions, Rediseñar |

---

### Task 0: Worktree and scratch database

- [ ] **Step 1:** `cd ~/pagosYa && git worktree add .claude/worktrees/popups-engine -b feature/popups-engine oct24-clean`; copy `.env`, `apps/api/.env`, `apps/api/.env.local`, `apps/checkout/.env`; `nice pnpm install --frozen-lockfile --prefer-offline`; `(cd apps/api && npx prisma generate)`; `pnpm --filter @pagosya/shared-types run build`.
- [ ] **Step 2:** Scratch Postgres (if not running): `B=$(find node_modules/.pnpm -path "*embedded-postgres*/native/bin" -type d | head -1); $B/initdb -D <scratchpad>/pgdata -U postgres --auth=trust; $B/pg_ctl -D <scratchpad>/pgdata -o "-p 54399 -k '' -c listen_addresses=localhost" start`. Expected: «ready to accept connections».

---

### Task 1: Data

**Files:** Modify `apps/api/prisma/schema.prisma`; Create `apps/api/prisma/migrations/20261119120000_popup_designs/migration.sql`.

**Interfaces — Produces:** model `StorePopupDesign`; enum `PopupDesignStatus { DRAFT LIVE FAILED RETIRED }`; nullable `popupDesignId` on `StoreNewsletterSubscriber`, `StoreWhatsappSubscriber`, `PromoCode`.

- [ ] **Step 1: Schema**

```prisma
enum PopupDesignStatus {
  DRAFT
  LIVE
  FAILED
  RETIRED
}

// Popups 2.0 (spec 2026-11-18): one YAPI-written popup per row; StoreRetention.settings.popupDesignId points at the LIVE one.
model StorePopupDesign {
  id          String            @id @default(cuid())
  storeId     String
  store       Store             @relation(fields: [storeId], references: [id], onDelete: Cascade)
  version     Int
  status      PopupDesignStatus @default(DRAFT)
  createdBy   String
  request     String?
  flow        Json
  steps       Json
  css         String
  launcher    String?
  capture     String            @default("whatsapp")
  percent     Int               @default(10)
  composition String
  fingerprint String
  checks      Json?
  previews    Json?
  createdAt   DateTime          @default(now())

  @@unique([storeId, version])
  @@index([storeId, status])
  @@index([createdAt])
}
```

Add `popupDesigns StorePopupDesign[]` to `Store`; add `popupDesignId String?` (with `@@index([popupDesignId])`) to `StoreNewsletterSubscriber`, `StoreWhatsappSubscriber` and `PromoCode`.

- [ ] **Step 2: Migration** — hand-written SQL: `CREATE TYPE "PopupDesignStatus"`, `CREATE TABLE "StorePopupDesign"` (columns above, `flow`/`steps` JSONB NOT NULL, `checks`/`previews` JSONB, FK to Store ON DELETE CASCADE), unique index `(storeId, version)`, indexes `(storeId, status)` and `(createdAt)`; `ALTER TABLE` the three tables `ADD COLUMN "popupDesignId" TEXT` + one index each.
- [ ] **Step 3: Validate on scratch** — `createdb -h localhost -p 54399 -U postgres popups_check`; `DATABASE_URL=postgresql://postgres@localhost:54399/popups_check npx prisma migrate deploy` → «All migrations have been successfully applied»; `npx prisma migrate diff --from-url <that url> --to-schema-datamodel prisma/schema.prisma` → no line mentioning StorePopupDesign / popupDesignId.
- [ ] **Step 4: Commit** — `feat(popups): StorePopupDesign and design tags on subscribers and codes`.

---

### Task 2: Flow rules

**Files:** Create `apps/api/src/store-popups/popup-flow.ts`, `popup-flow.spec.ts`.

**Interfaces — Produces:**
```ts
export const POPUP_STEP_KINDS = ['offer', 'game', 'pick', 'quiz', 'capture', 'reveal', 'land'] as const;
export type PopupStepKind = (typeof POPUP_STEP_KINDS)[number];
export type QuizQuestion = { id: string; text: string; answers: Array<{ id: string; text: string; products: string[] }> };
export type PopupStep =
  | { id: string; kind: 'offer' }
  | { id: string; kind: 'game'; game: 'scratch' | 'wheel' }
  | { id: string; kind: 'pick'; products: string[] }
  | { id: string; kind: 'quiz'; questions: QuizQuestion[] }
  | { id: string; kind: 'capture' }
  | { id: string; kind: 'reveal' }
  | { id: string; kind: 'land'; to: 'product' | 'scroll' };
export type PopupFlow = PopupStep[];
export function validateFlow(raw: unknown, products: readonly string[]): { flow: PopupFlow } | { problems: string[] };
export const renderedSteps = (flow: PopupFlow) => flow.filter(step => step.kind !== 'land');
```

- [ ] **Step 1: Failing test**

```ts
import { renderedSteps, validateFlow } from './popup-flow';

const products = ['p1', 'p2', 'p3'];
const ok = [{ id: 'a', kind: 'offer' }, { id: 'b', kind: 'pick', products: ['p1', 'p2'] }, { id: 'c', kind: 'capture' }, { id: 'd', kind: 'reveal' }, { id: 'e', kind: 'land', to: 'product' }];

describe('popup flow rules', () => {
  it('accepts a sound flow and drops unknown products', () => {
    const result = validateFlow([...ok.slice(0, 1), { id: 'b', kind: 'pick', products: ['p1', 'gone', 'p2'] }, ...ok.slice(2)], products);
    expect('flow' in result && result.flow[1]).toEqual({ id: 'b', kind: 'pick', products: ['p1', 'p2'] });
    expect('flow' in result && renderedSteps(result.flow).map(s => s.kind)).toEqual(['offer', 'pick', 'capture', 'reveal']);
  });

  it('names every broken rule', () => {
    const result = validateFlow([{ id: 'a', kind: 'reveal' }, { id: 'b', kind: 'capture' }, { id: 'c', kind: 'land', to: 'product' }, { id: 'd', kind: 'offer' }], products) as { problems: string[] };
    expect(result.problems).toEqual(expect.arrayContaining([expect.stringMatching(/capture.*antes.*reveal/), expect.stringMatching(/land.*último/)]));
    expect((validateFlow([{ id: 'a', kind: 'offer' }], products) as { problems: string[] }).problems.join()).toMatch(/2 a 6/);
    expect((validateFlow([{ id: 'a', kind: 'game', game: 'scratch' }, { id: 'b', kind: 'game', game: 'wheel' }, { id: 'c', kind: 'capture' }], products) as any).problems.join()).toMatch(/un solo juego/);
  });

  it('refuses product steps for a store with fewer than 2 products, and quiz answers without products', () => {
    expect((validateFlow(ok, ['p1']) as any).problems.join()).toMatch(/al menos 2 productos/);
    const quiz = { id: 'q', kind: 'quiz', questions: [{ id: 'q1', text: '¿Para quién?', answers: [{ id: 'a1', text: 'Para mí', products: [] }, { id: 'a2', text: 'Regalo', products: ['p2'] }] }] };
    expect((validateFlow([quiz, ...ok.slice(2)], products) as any).problems.join()).toMatch(/respuesta sin productos/);
  });
});
```

- [ ] **Step 2:** `npx jest src/store-popups/popup-flow.spec.ts --maxWorkers=2` → FAIL (module not found).
- [ ] **Step 3: Implement**

```ts
/** Popups 2.0 (spec 2026-11-18 §4): the steps the platform understands and the rules a YAPI flow must follow. */
export const POPUP_STEP_KINDS = ['offer', 'game', 'pick', 'quiz', 'capture', 'reveal', 'land'] as const;
export type PopupStepKind = (typeof POPUP_STEP_KINDS)[number];
export type QuizQuestion = { id: string; text: string; answers: Array<{ id: string; text: string; products: string[] }> };
export type PopupStep =
  | { id: string; kind: 'offer' }
  | { id: string; kind: 'game'; game: 'scratch' | 'wheel' }
  | { id: string; kind: 'pick'; products: string[] }
  | { id: string; kind: 'quiz'; questions: QuizQuestion[] }
  | { id: string; kind: 'capture' }
  | { id: string; kind: 'reveal' }
  | { id: string; kind: 'land'; to: 'product' | 'scroll' };
export type PopupFlow = PopupStep[];

const ID = /^[a-z][a-z0-9-]{0,23}$/;
const line = (value: unknown, max: number) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

export const renderedSteps = (flow: PopupFlow) => flow.filter(step => step.kind !== 'land');

export function validateFlow(raw: unknown, products: readonly string[]): { flow: PopupFlow } | { problems: string[] } {
  const problems: string[] = [];
  const known = new Set(products);
  const list = Array.isArray(raw) ? raw : [];
  if (list.length < 2 || list.length > 6) problems.push('El flujo necesita de 2 a 6 pasos.');
  const flow: PopupFlow = [];
  for (const item of list as Array<Record<string, any>>) {
    const id = String(item?.id ?? '');
    if (!ID.test(id) || flow.some(step => step.id === id)) { problems.push(`Paso con id inválido o repetido: ${id || '(vacío)'}.`); continue; }
    switch (item?.kind) {
      case 'offer': case 'capture': case 'reveal': flow.push({ id, kind: item.kind }); break;
      case 'game': flow.push({ id, kind: 'game', game: item.game === 'wheel' ? 'wheel' : 'scratch' }); break;
      case 'land': flow.push({ id, kind: 'land', to: item.to === 'scroll' ? 'scroll' : 'product' }); break;
      case 'pick': flow.push({ id, kind: 'pick', products: (Array.isArray(item.products) ? item.products : []).map(String).filter((p: string) => known.has(p)).slice(0, 6) }); break;
      case 'quiz': {
        const questions: QuizQuestion[] = (Array.isArray(item.questions) ? item.questions : []).slice(0, 3).map((q: any, qi: number) => ({
          id: ID.test(String(q?.id)) ? String(q.id) : `q${qi + 1}`, text: line(q?.text, 120),
          answers: (Array.isArray(q?.answers) ? q.answers : []).slice(0, 6).map((a: any, ai: number) => ({
            id: ID.test(String(a?.id)) ? String(a.id) : `a${ai + 1}`, text: line(a?.text, 60),
            products: (Array.isArray(a?.products) ? a.products : []).map(String).filter((p: string) => known.has(p)).slice(0, 3) })) }));
        if (!questions.length || questions.some(q => !q.text || q.answers.length < 2)) problems.push('Cada pregunta del quiz necesita texto y al menos 2 respuestas.');
        if (questions.some(q => q.answers.some(a => !a.products.length))) problems.push('Hay una respuesta sin productos.');
        flow.push({ id, kind: 'quiz', questions });
        break;
      }
      default: problems.push(`Paso desconocido: ${String(item?.kind)}.`);
    }
  }
  const kinds = flow.map(step => step.kind);
  if (kinds.filter(k => k === 'game').length > 1) problems.push('Un flujo lleva un solo juego.');
  const capture = kinds.indexOf('capture'), reveal = kinds.indexOf('reveal');
  if (capture < 0) problems.push('Falta el paso capture (WhatsApp o email).');
  if (reveal >= 0 && (capture < 0 || capture > reveal)) problems.push('El paso capture va antes que reveal.');
  if (kinds.includes('land') && kinds.indexOf('land') !== kinds.length - 1) problems.push('El paso land va último.');
  const productSteps = flow.filter(step => step.kind === 'pick' || step.kind === 'quiz');
  if (productSteps.length && known.size < 2) problems.push('Los pasos de productos necesitan al menos 2 productos en la tienda.');
  for (const step of flow) if (step.kind === 'pick' && step.products.length < 2 && known.size >= 2) problems.push(`El paso ${step.id} necesita al menos 2 productos.`);
  return problems.length ? { problems } : { flow };
}
```

- [ ] **Step 4:** run → PASS (3 tests). **Step 5: Commit** `feat(popups): flow rules`.

---

### Task 3: Step HTML cleaner

**Files:** Create `apps/api/src/store-popups/popup-html.ts`, `popup-html.spec.ts`.

**Interfaces — Consumes:** `PopupStepKind` (Task 2). **Produces:** `cleanStepHtml(html: string, kind: PopupStepKind): { html: string } | { problem: string }`; `MAX_STEP_HTML = 12_000`.

Rules: parse5 fragment, allowlist rebuild (pattern of `design-engine/style-hero.ts` `cleanNode`); tags `div section header footer p h1 h2 h3 h4 span strong em small br hr img picture source button ul ol li figure figcaption label input svg g path circle rect ellipse line polyline polygon`; attributes `class id role alt src srcset width height loading viewBox d fill stroke stroke-width stroke-linecap stroke-linejoin cx cy r rx ry x y x1 y1 x2 y2 points transform opacity type placeholder autocomplete inputmode for aria-* data-*`; `style` attribute only `--custom: value` pairs; `src`/`srcset` only `/v1/uploads/<name>` or `assets/<name>`; input `type` only email|tel|text; parse→serialise fixed point; no `https?:`/`//` left. Hooks: every kind needs `[data-close]`; `offer` needs `[data-next]`; `pick` needs exactly one `[data-tile]` containing `[data-slot="photo"]` and `[data-slot="name"]`; `quiz` needs `[data-question]` with one `[data-choice]` template; `capture` needs `[data-field]` + `[data-submit]`; `reveal` needs `[data-slot="code"]`; `game` needs `[data-game-surface]`.

- [ ] **Step 1: Failing test**

```ts
import { cleanStepHtml } from './popup-html';

const offer = '<section class="o"><button data-close aria-label="Cerrar">×</button><h2>10% para ti</h2><img src="/v1/uploads/abc.webp" alt=""><button data-next>Quiero</button></section>';

describe('popup step html', () => {
  it('keeps a good step', () => {
    expect(cleanStepHtml(offer, 'offer')).toEqual({ html: expect.stringContaining('data-next') });
  });
  it('removes scripts, handlers, outside images and links, and keeps only custom properties in style', () => {
    const out = cleanStepHtml(offer.replace('<h2>', '<script>alert(1)</script><a href="https://x.y">x</a><h2 onclick="x()" style="--tilt:3deg;color:red">').replace('/v1/uploads/abc.webp', 'https://evil/x.png'), 'offer') as { html: string };
    expect(out.html).not.toMatch(/script|onclick|https?:|<a |color:red|evil/);
    expect(out.html).toContain('--tilt:3deg');
  });
  it('names the missing hook per kind', () => {
    expect(cleanStepHtml('<div><h2>Hola</h2></div>', 'offer')).toEqual({ problem: expect.stringMatching(/data-close/) });
    expect(cleanStepHtml('<div><button data-close></button><div data-tile><span data-slot="name"></span></div></div>', 'pick')).toEqual({ problem: expect.stringMatching(/data-slot="photo"/) });
    expect(cleanStepHtml('<div><button data-close></button><input data-field="email"></div>', 'capture')).toEqual({ problem: expect.stringMatching(/data-submit/) });
  });
  it('allows only text, email and tel inputs', () => {
    const out = cleanStepHtml('<div><button data-close></button><input type="file" data-field="whatsapp"><input type="tel" data-field="whatsapp"><button data-submit>Ok</button></div>', 'capture') as { html: string };
    expect(out.html).not.toContain('type="file"');
    expect(out.html).toContain('type="tel"');
  });
  it('refuses oversized markup', () => {
    expect(cleanStepHtml(`<div>${'x'.repeat(13_000)}</div>`, 'offer')).toEqual({ problem: expect.stringMatching(/grande/) });
  });
});
```

- [ ] **Step 2:** run → FAIL. **Step 3:** implement `popup-html.ts` with the rules above (copy the `cleanNode` + fixed-point structure from `style-hero.ts`, swap its tag/attribute sets for the ones listed, drop `<style>` entirely, and add `hookProblem(html, kind)` that parses the cleaned fragment and checks the hooks — return `{ problem: 'Falta [data-close] …' }` naming the first missing hook). **Step 4:** run → PASS (5). **Step 5: Commit** `feat(popups): step HTML cleaner`.

---

### Task 4: Design CSS scoper

**Files:** Create `apps/api/src/store-popups/popup-css.ts`, `popup-css.spec.ts`.

**Interfaces — Produces:** `scopePopupCss(css: string, designId: string): { css: string; dropped: string[] } | { problem: string }`; `MAX_POPUP_CSS = 24_000`.

Rules (postcss): drop `@import`, `@charset`, `@font-face` with outside `src`, `@namespace`; keep `@media`, `@supports`, `@keyframes` (renamed `pp-<designId8>-<name>`, `animation`/`animation-name` rewritten); every selector becomes `[data-pya-popup="<id>"] <selector>` (`:root`/`html`/`body` → `[data-pya-popup="<id>"]`); `url(…)` only `/v1/uploads/…` or `assets/…` else the declaration is dropped; on selectors that target `[data-close]`, `[data-field]`, `[data-submit]` (or `button`/`input` generally) drop `display:none`, `visibility:hidden`, `opacity:0`, `pointer-events:none`, `clip`, `clip-path`, `width:0`, `height:0`, `transform: scale(0)`; drop `position:fixed` everywhere except a selector equal to the root; size cap after rewriting. `dropped` lists what was removed (fed back to YAPI on a retry).

- [ ] **Step 1: Failing test**

```ts
import { scopePopupCss } from './popup-css';

describe('popup css', () => {
  it('scopes every selector and renames keyframes', () => {
    const out = scopePopupCss('.card{color:#111}h2,p{margin:0}@keyframes pop{from{opacity:0}to{opacity:1}}.card{animation:pop .4s}', 'd123456789') as { css: string };
    expect(out.css).toContain('[data-pya-popup="d123456789"] .card');
    expect(out.css).toContain('[data-pya-popup="d123456789"] h2,[data-pya-popup="d123456789"] p');
    expect(out.css).toContain('@keyframes pp-d1234567-pop');
    expect(out.css).toMatch(/animation:\s*pp-d1234567-pop/);
  });
  it('drops imports, outside urls and fixed positioning, never hides the close or the fields', () => {
    const out = scopePopupCss('@import url(x.css);.bg{background:url(https://e/x.png)}.bar{position:fixed}[data-close]{display:none;color:red}input{opacity:0}', 'd1') as { css: string; dropped: string[] };
    expect(out.css).not.toMatch(/@import|https|position:\s*fixed|display:\s*none|opacity:\s*0/);
    expect(out.css).toContain('color:red');
    expect(out.dropped.length).toBeGreaterThanOrEqual(4);
  });
  it('maps :root and body to the popup root and refuses oversized sheets', () => {
    expect((scopePopupCss(':root{--a:1}body{--b:2}', 'd1') as { css: string }).css).toMatch(/^\[data-pya-popup="d1"\]\{--a:1\}/);
    expect(scopePopupCss(`.a{color:red}`.repeat(3000), 'd1')).toEqual({ problem: expect.stringMatching(/24/) });
  });
});
```

- [ ] **Step 2:** run → FAIL. **Step 3:** implement with `postcss.parse`, `root.walkAtRules`, `root.walkRules` (prefix via `rule.selectors = rule.selectors.map(...)`, skipping rules inside `@keyframes`), `root.walkDecls` for the url/position/hiding rules; output `root.toString()` minified by removing comments. **Step 4:** run → PASS (3). **Step 5: Commit** `feat(popups): design CSS scoper`.

---

### Task 5: Fingerprint and variety

**Files:** Create `apps/api/src/store-popups/popup-fingerprint.ts`, `popup-fingerprint.spec.ts`.

**Interfaces — Produces:** `popupFingerprint(steps: Record<string, string>, css: string): string` (sha256 hex 16 of: per rendered step, the tag/depth skeleton of the first two levels + whether an `img` comes before the first heading + `[data-tile]` count; plus from CSS the set of `display:grid|flex`, `flex-direction`, `grid-template-columns` column counts and `position:absolute` usage on the root's direct children); `varietyProblem(candidate: { fingerprint: string; composition: string }, taken: Array<{ fingerprint: string; composition: string }>): string | null` (same fingerprint, or the same composition after lower-casing, removing accents and stop words, → `'Composición repetida: …'`).

- [ ] **Step 1: Failing test**

```ts
import { popupFingerprint, varietyProblem } from './popup-fingerprint';

const a = { o: '<section><img src="assets/a.webp"><h2>Hola</h2><button data-next>Ok</button></section>' };
const b = { o: '<section><h2>Hola</h2><div><img src="assets/b.webp"></div><button data-next>Ok</button></section>' };

describe('popup fingerprint', () => {
  it('ignores words and images, sees structure', () => {
    expect(popupFingerprint(a, '.x{display:grid}')).toBe(popupFingerprint({ o: a.o.replace('Hola', 'Chau').replace('a.webp', 'z.webp') }, '.x{display:grid}'));
    expect(popupFingerprint(a, '.x{display:grid}')).not.toBe(popupFingerprint(b, '.x{display:grid}'));
    expect(popupFingerprint(a, '.x{display:grid}')).not.toBe(popupFingerprint(a, '.x{display:flex;flex-direction:column}'));
  });
  it('refuses a repeated fingerprint or composition line', () => {
    const fp = popupFingerprint(a, '');
    expect(varietyProblem({ fingerprint: fp, composition: 'Ticket de cupón' }, [{ fingerprint: fp, composition: 'otra' }])).toMatch(/repetida/);
    expect(varietyProblem({ fingerprint: 'x', composition: 'Ticket de cupón a la izquierda' }, [{ fingerprint: 'y', composition: 'ticket de cupon a la izquierda' }])).toMatch(/repetida/);
    expect(varietyProblem({ fingerprint: 'x', composition: 'Póster con botella' }, [{ fingerprint: 'y', composition: 'Hoja inferior' }])).toBeNull();
  });
});
```

- [ ] **Step 2:** FAIL. **Step 3:** implement (parse5 `parseFragment`; walk two levels; `createHash('sha256')`). **Step 4:** PASS (2). **Step 5: Commit** `feat(popups): layout fingerprint and variety check`.

---

### Task 6: The runtime plays a design (storefront)

**Files:** Modify `packages/storefront-kit/kit/retention.js` (new `mountFlow`, branch at `mountSignup` start); Modify `packages/storefront-kit/commerce-src/catalog/favourite.js` (+ rebuild commerce.js with the kit's existing build script); Test `apps/checkout/test/retention-flow.test.ts` (copy the harness of `apps/checkout/test/retention-popup.test.ts`).

**Interfaces — Consumes:** settings field `popupDesign` (Task 7): `{ id, flow, steps, css, launcher?, capture, percent }`; `data.items` (products with `id`, `name`, `images`, `price`, `active`). **Produces:** `mountFlow(dialog, { design, items, api, remember, slug, demo })`; window event `pagosya:apply-promo` `{ code }`; preview hook `window.PAGOSYA_POPUP_PREVIEW(settings, config, stepId?)` opens the design at a given step (used by Task 8).

Behaviour:
- `mountSignup`: when `settings.popupDesign` is present, render `<div data-pya-popup="<id>">` + `<style>` with the design CSS and hand over to `mountFlow`; the old paths stay for stores without a design.
- Steps play in `flow` order; `land` is not drawn. `[data-close]` closes and `remember()`s; `[data-back]` goes back; Escape closes; focus trap inside the dialog; `prefers-reduced-motion` adds `data-reduced`.
- `pick`: clone the single `[data-tile]` per product in `step.products` that is still in `items` and active (fill `[data-slot=photo]` `<img src>` + alt, `name`, `price`), remove the template; fewer than 2 → skip the step. Tap = choice → next.
- `quiz`: per question, clone the `[data-choice]` template per answer (text); choices → products (first answer's products, then later answers narrow); the chosen product = first of the result.
- `game`: reuse `mountGame`'s scratch/wheel drawing on `[data-game-surface]` with the design's percent.
- `capture`: `[data-field]` value; validate (WhatsApp: 8+ digits; email: `@`); disable `[data-submit]` while sending; `api('subscribe', { [capture]: value, consent: true, source: 'popup', popupDesignId, answers, favourite })`; on error show the message in `[data-slot="error"]` if present (else a small platform line) and stay; on success keep `code`.
- `reveal`: write the code into `[data-slot=code]` (and percent into `[data-slot=percent]`).
- `land`: `dispatchEvent(new CustomEvent('pagosya:apply-promo', { detail: { code } }))`, then the existing favourite path (`goFavourite(id)` → `pagosya:favourite` `{ id, go: true }`); hosted: `parent.postMessage({ type: 'pagosya:apply-promo', code })` before the favourite message.
- commerce `favourite.js`: `window.addEventListener('pagosya:apply-promo', e => rememberPromo(String(e.detail?.code || '')))` — expose `rememberPromo` to that module the same way the favourite handler reaches commerce internals.

- [ ] **Step 1: Failing tests** (`retention-flow.test.ts`) — with a fixture design (offer → pick → capture → reveal → land) and 3 items (one archived):
  1. opens the offer step inside `[data-pya-popup]`, CSS present in a `<style>`;
  2. pick shows 2 tiles (archived dropped) with real photo/name/price; with only 1 active item the pick step is skipped;
  3. capture posts `{ whatsapp: '76543210', consent: true, source: 'popup', popupDesignId, favourite: 'p1' }` once even on a double click; an API error keeps the step and shows the message;
  4. reveal shows the returned code; land fires `pagosya:apply-promo` with it and then `pagosya:favourite` `{ id: 'p1', go: true }`;
  5. hosted (`window.PAGOSYA_HOSTED = true`): `parent.postMessage` gets the apply-promo message before the favourite one;
  6. `PAGOSYA_POPUP_PREVIEW(settings, config, 'c')` opens the capture step directly.
- [ ] **Step 2:** `cd apps/checkout && npx vitest run test/retention-flow.test.ts` → FAIL.
- [ ] **Step 3:** implement as described. **Step 4:** run the new test and `test/retention-popup.test.ts` (old paths untouched) → PASS. Rebuild commerce.js; run `apps/api/src/storefront-source/source-commerce-favourite.spec.ts` → PASS.
- [ ] **Step 5: Commit** `feat(popups): the runtime plays YAPI designs and lands with the code in the cart`.

---

### Task 7: API — serve the design, subscribe, tagged codes

**Files:** Modify `apps/api/src/retention/retention.service.ts` (`publicRetentionSettings`, `subscribe`, `subscribeWhatsapp`), `apps/api/src/retention/retention.dto.ts`; Test `apps/api/src/retention/retention.service.spec.ts`.

**Interfaces — Produces:** settings payload gains `popupDesign` when `settings.popupDesignId` points at a LIVE row of that store; `RetentionSubscribeDto.popupDesignId?: string` (`@IsOptional() @Matches(/^c[a-z0-9]{20,30}$/)`); subscribe with a valid design id: saves `popupDesignId` on the subscriber (email or WhatsApp table), WhatsApp allowed when the design's `capture` is whatsapp, issues a personal single-use code `PROMO-XXXXXX` at the design's percent tagged `popupDesignId` (same `promoCode.create` shape as `PopupGameService.claim`, P2002 retry), returns `{ code }`; a repeat subscribe of the same contact for the same design returns the same code (look up the tagged code by subscriber) — one subscriber, one code.

- [ ] **Step 1: Failing tests** — (a) public settings include `popupDesign` only for a LIVE design of this store (a FAILED one or another store's id → absent); (b) subscribe by WhatsApp with a whatsapp design creates the WhatsApp subscriber with `popupDesignId` and a PERCENT code tagged; (c) the same contact twice → one subscriber, same code; (d) an email to a whatsapp design is refused with «Esta tienda pide tu WhatsApp»; (e) without `popupDesignId` the old behaviour is unchanged (existing tests stay green).
- [ ] **Step 2:** `npx jest src/retention/retention.service.spec.ts --maxWorkers=2` → FAIL. **Step 3:** implement. **Step 4:** PASS. **Step 5: Commit** `feat(popups): serve LIVE designs, subscribe with a design, tagged personal codes`.

---

### Task 8: Browser check for every step

**Files:** Modify `apps/api/src/store-popups/popup-render.ts`; Test `apps/api/src/store-popups/popup-render.spec.ts` (extend; it already runs Playwright).

**Interfaces — Consumes:** `PAGOSYA_POPUP_PREVIEW(settings, config, stepId)` (Task 6). **Produces:**
```ts
export type FlowStepMeasure = { stepId: string; size: { width: number; height: number }; close: PopupBox | null; scrollWidth: number; dialog: PopupBox | null; contrastFails: string[]; fieldsTypeable: boolean | null; tiles: number | null; screenshot: Buffer };
export async function measureFlow(input: { storeName: string; design: { id: string; flow: unknown; steps: Record<string, string>; css: string; capture: string; percent: number }; items: unknown[]; photos: Record<string, { bytes: Buffer; contentType: string }> }, sizes?: typeof POPUP_SIZES): Promise<FlowStepMeasure[] | null>;
export function checkFlowRender(measures: FlowStepMeasure[]): string[];   // Spanish problems, '' none
```
Checks per measure: close present, inside the viewport, ≥ 40×40 and actually hit-testable (`document.elementFromPoint` at its centre is the close or inside it); `scrollWidth <= width`; dialog inside the viewport or scrollable inside; every text node's computed colour vs its background ≥ 4.5 (sample of visible elements with text); capture step: the field accepts typed input; pick step: tiles ≥ 2 and each `img` naturalWidth > 0. Screenshots kept (JPEG 70) for the Popups page. Same offline routing as `measurePopup` (store images served from `photos`).

- [ ] **Step 1: Failing tests** — fixture designs: good (pass, no problems); close hidden by a parent `display:none` → «cerrar»; 900px-wide box at 390 → «se sale»; light grey text on white → «contraste»; pick with images → tiles 2.
- [ ] **Step 2:** `npx jest src/store-popups/popup-render.spec.ts --maxWorkers=1` → FAIL. **Step 3:** implement. **Step 4:** PASS. **Step 5: Commit** `feat(popups): real-browser check for every step of a design`.

---

### Task 9: YAPI writes a design

**Files:** Create `apps/api/src/store-popups/popup-design-prompt.ts` (+ spec), `apps/api/src/store-popups/popup-design.service.ts` (+ spec); Modify `store-popup.module.ts`.

**Interfaces — Consumes:** Tasks 2–5, 8; `brandCall` (`../storefront-source/brand/brand-model-call`, no web search); `sourceProvider`; `BrandProfileService`; `UploadsService` (save previews); `PlansService.assertCredits`; `briefForRun`-style read of `Store.onboarding.brandBrief` when present. **Produces:**
```ts
export const POPUP_DESIGN_SCHEMA: object;   // { composition: string, flow: [...], steps: [{ id, html }], css: string, launcher: string }
export function popupDesignPrompt(input: { storeName: string; sector: string; palette: Record<string, string>; fonts: string[]; voice: string; photos: string[]; products: Array<{ id: string; name: string; price: string; photo: string }>; capture: 'whatsapp' | 'email'; percent: number; taken: string[]; request?: string; retryProblems?: string[] }): string;
export class PopupDesignService {
  design(merchantId: string, storeId: string, options: { createdBy: 'yapi' | 'merchant-chat' | 'batch'; request?: string; signal?: AbortSignal }): Promise<{ design: { id: string; version: number; status: 'LIVE' | 'FAILED' }; problems: string[] }>;
  restore(merchantId: string, storeId: string, designId: string): Promise<void>;
  list(merchantId: string, storeId: string): Promise<Array<{ id: string; version: number; status: string; composition: string; previews: unknown; createdAt: Date }>>;
  updateSettings(merchantId: string, storeId: string, patch: { percent?: number; capture?: 'whatsapp' | 'email'; products?: string[]; on?: boolean }): Promise<void>;
}
```
`design()`: `assertCredits` (unless batch) → read brand + products (active, with photo) + taken (fingerprints/compositions of the merchant's other stores' LIVE designs + last 30) → model call (prompt + schema; the six looks described in words as examples) → `validateFlow` → `cleanStepHtml` per rendered step → `scopePopupCss` → `popupFingerprint` + `varietyProblem` → `measureFlow` + `checkFlowRender` → on any problem one retry with `retryProblems` → save the row (version = max+1) as LIVE (previous LIVE → RETIRED, `settings.popupDesignId` = new id) or FAILED (pointer unchanged) → previews: the 390 screenshots saved as uploads, paths in `previews`. `restore()`: a RETIRED/LIVE row of the store becomes LIVE and the pointer moves. `updateSettings()`: percent (5–30), capture, `pick` products, on/off (`settings.popupOn`) without a model call.

- [ ] **Step 1: Failing tests** (`popup-design.service.spec.ts`, fakes for model/render/uploads/prisma): good answer → LIVE, pointer moved, previous LIVE retired, previews saved; first answer hides the close (CSS) → retry with problems → LIVE; both answers fail the browser check → FAILED, pointer unchanged; a repeated composition → retry names «Composición repetida»; restore moves the pointer; updateSettings clamps percent 5–30 and refuses products not in the store. Prompt spec: lists products as data, forbids `<script>`, includes the taken compositions and the hooks table.
- [ ] **Step 2:** FAIL. **Step 3:** implement. **Step 4:** PASS. **Step 5: Commit** `feat(popups): YAPI writes, checks and saves a popup design`.

---

### Task 10: First build, chat and batch

**Files:** Modify `apps/api/src/store-popups/popup-look.service.ts` (`designAfterBuild` also queues `popupDesigns.design(..., { createdBy: 'yapi' })` without awaiting the chat), `apps/api/src/storefront-source/source-store-edit.ts` (new op `popupDesign: 'redesign' | { percent?, capture?, products? }` parsed from «rediseña mi popup», «otro popup», «hazlo más divertido» (popup context), «descuento 15 %» (popup context), «pide email/WhatsApp», «agrega una pregunta …»), `apps/api/src/storefront-source/source-chat.service.ts` `writeStoreChange` (apply via `PopupDesignService`), Create `apps/api/scripts/design-popups.ts`; Tests: `source-store-edit.spec.ts`, `popup-look.service.spec.ts`, a script test-free run on scratch.

- [ ] **Step 1: Failing tests** — store-edit parses the six phrases into the new op (and leaves «cambia el color del botón» alone); `designAfterBuild` calls `design()` once for a store with products; chat reply after a redesign: «Listo: tu popup nuevo…» with the composition, or «No pude… tu popup sigue igual» on FAILED.
- [ ] **Step 2:** FAIL. **Step 3:** implement; the batch script takes `--stores id1,id2,…` (required) and runs `design()` serially with `createdBy: 'batch'`, printing composition / LIVE|FAILED / problems per store. **Step 4:** PASS. **Step 5: Commit** `feat(popups): designs on first build, by chat and in owner-named batches`.

---

### Task 11: Popups page

**Files:** Create `apps/api/src/store-popups/popup-design.controller.ts` (merchant, `MerchantAuthGuard`): `GET v1/stores/:storeId/popup-designs` (list), `POST …/redesign` (`{ request? }`), `POST …/:id/restore`, `PUT …/settings`; Modify `apps/merchant-studio/src/api.ts` (`popupDesigns`, `popupRedesign`, `popupRestore`, `popupSettings`) and `apps/merchant-studio/src/retention.ts` (`openRetention`: a «Popup» section at the top when the store has a design: step previews in order, «Rediseñar» with an optional request field, percent, WhatsApp/email, products for «¿qué buscas?», on/off, versions with «Volver a esta»); Tests: controller spec (ownership), `apps/merchant-studio/src/retention.test.ts` (or the file that tests `openRetention`).

- [ ] **Step 1: Failing tests** — controller refuses another merchant's store; Studio renders previews in step order, «Rediseñar» posts the request, a version's «Volver a esta» posts restore, percent outside 5–30 is clamped in the field.
- [ ] **Step 2:** FAIL. **Step 3:** implement. **Step 4:** PASS; `npx tsc --noEmit -p apps/merchant-studio/tsconfig.json` clean; `pnpm --filter @pagosya/merchant-dashboard run build:studio`. **Step 5: Commit** `feat(popups): Popups page — previews, settings, versions, Rediseñar`.

---

### Task 12: Compile, review, merge, live batch

- [ ] **Step 1:** `cd apps/api && nice npx tsc --noEmit -p tsconfig.json --incremental false` → no output. Build + boot the API on port 3903 against the scratch DB (as in the brand plan) → `/ready` ok, no Nest dependency error.
- [ ] **Step 2:** Final whole-branch review (one fresh reviewer, Review Focus above); one fix pass, each fix RED→GREEN.
- [ ] **Step 3:** Merge into `oct24-clean` only with the owner's go-ahead: full `pg_dump` first (`PATH=/opt/homebrew/opt/libpq/bin:$PATH node scripts/dev-doctor.mjs --backup`), no running YAPI job, `prisma migrate deploy`, `prisma generate`, then restart the stack (`nohup pnpm dev:chatgpt`) — a watcher nudge after new models takes the stack down.
- [ ] **Step 4:** Live: `npx ts-node --transpile-only scripts/design-popups.ts --stores <10 owner-named ids>`; open each store on a phone width; walk one flow end to end (contact saved, code in the cart, product page «Tu favorito»); screenshots beside Alia's examples for the owner.
- [ ] **Step 5:** Memory note `project_popups_2.md` updated (what shipped, live results, cost per design from `AiUsage`).
