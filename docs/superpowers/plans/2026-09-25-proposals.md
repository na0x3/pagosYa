# AI Proposals (D2) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A merchant describes a job in one box, YAPI drafts a professional proposal (scope, deliverables, timeline, priced items that never invent a price, validity, terms), the merchant edits it block by block and sends it, the customer accepts or asks for changes on a branded page, and an accepted proposal becomes a cobro in one tap.

**Architecture:** No schema change: D0's `BusinessDocument` (kind `PROPOSAL`) and its events carry everything. A pure module (`proposal-draft.ts`) owns the prompt, the JSON schema and the server-side price guard; `ProposalsService` calls the D0 AI helper (mocked in tests), and adds accept / request changes / expiry / create-cobro on top of D0 and D1. The checkout's `/d/:token` dispatches to a proposal page by kind. The dashboard gets a `Propuestas` module beside `Cobros`.

**Tech Stack:** NestJS + Prisma (jest, in-memory `FakePrisma`), checkout Vite + vitest (jsdom), merchant dashboard vanilla ES modules (`node --test`, Playwright).

**Spec:** `docs/superpowers/specs/2026-09-25-proposals-design.md`.

## Global Constraints

- Never make a paid AI call: every test mocks `StructuredCompletionService` (API) or the draft route (Playwright).
- Do not touch G1's paths: `apps/api/src/store-analytics/**`, `apps/api/src/store-growth/**`, `packages/storefront-kit/**`, `apps/checkout/src/store-funnel.ts`, `apps/checkout/src/source-storefront.ts`, `apps/api/prisma/schema.prisma`.
- Commit only this plan's paths with `git commit -m … -- <paths>`; never `git add -A`.
- Money is integer minor units; prices never come from the model (spec §2.3).
- Every merchant or customer string rendered in HTML goes through the escaper (`esc` / `escapeHtml`).
- Lock order (D1): the document row first (`FOR UPDATE`), never wait for another row.
- Jest paths are relative to `apps/api/src`: `cd apps/api && npx jest business-documents`.

## Review Focus

1. A model that writes a price for an unknown item, or a catalog item with a wrong price, must not change what the customer is charged → Task 1 tests (catalog price wins; unknown → `{{precio}}` + 0; money in text replaced).
2. An accept for a version the customer did not see (the merchant re-sent meanwhile) must be refused → Task 3 "refuses a stale version".
3. A proposal past its validity must not be acceptable even if the worker has not run → Task 3 "expires on read".
4. Two taps on "Crear cobro" (or a retry after a failed send) must never make two cobros → Task 4 "is idempotent".
5. "Pedir cambios" must not become a spam relay: 5 per proposal per day, merchant emails inside the store cap → Task 3.
6. The public page must escape everything the merchant and the AI wrote → Task 6 XSS test.

---

## File Structure

| File | Responsibility |
|---|---|
| `apps/api/src/business-documents/proposal-draft.ts` (create) | `proposalDraftSchema`, `proposalSectionSchema`, `buildProposalContext`, `proposalSystemPrompt`, `proposalUserMessage`, `allowedAmounts`, `guardMoneyText`, `draftToDocument`, `PROPOSAL_SECTIONS`. |
| `apps/api/src/business-documents/proposal-draft.spec.ts` (create) | Pure tests. |
| `apps/api/src/business-documents/proposals.service.ts` (create) | `draft`, `regenerateSection`, `summary`, `accept`, `requestChanges`, `expireOverdue`, `createCobro`. |
| `apps/api/src/business-documents/proposals.service.spec.ts` (create) | Service tests on `FakePrisma`. |
| `apps/api/src/business-documents/proposal-email.ts` (create) | Merchant notification email. |
| `apps/api/src/business-documents/proposals.controller.ts` (+ spec) (create) | Merchant routes. |
| `apps/api/src/business-documents/proposals.worker.ts` (create) | 15-min expiry. |
| `apps/api/src/business-documents/business-documents-public.controller.ts` (modify) | `accept`, `changes`. |
| `apps/api/src/business-documents/business-documents.service.ts` (modify) | Proposal states in `list`, public view fields + expiry on read, cap counts `merchant_notified`. |
| `apps/api/src/business-documents/dto/business-document.dto.ts` (modify) | New DTOs. |
| `apps/api/src/business-documents/business-documents.module.ts` (modify) | `AiModule`, new providers/controller. |
| `apps/api/src/business-documents/testing/fake-document-prisma.ts` (modify) | Inbox tables, users, `type: { in }` counts. |
| `apps/checkout/src/documents/proposal-page.ts` + `.css` (create), `cobro-page.ts` (modify) | Public page. |
| `apps/checkout/test/proposal-page.test.ts` (create) | vitest. |
| `apps/merchant-dashboard/src/proposals.mjs` + `.test.mjs` (create) | Pure helpers. |
| `apps/merchant-dashboard/src/proposals-panel.mjs`, `src/proposals.css` (create) | The view. |
| `apps/merchant-dashboard/index.html`, `src/dashboard.js`, `server.mjs`, `src/cobros-panel.mjs` (modify) | Glue; `cobros.open(id, { share })`. |
| `apps/merchant-dashboard/tests/proposals.spec.mjs` (create), `tests/dashboard-smoke.spec.mjs` (modify) | Playwright. |

---

### Task 1: Draft rules — prompt, schema and the price guard

**Files:** Create `proposal-draft.ts`, `proposal-draft.spec.ts`.

**Interfaces:**
- `buildProposalContext(store, categories, products)` → `{ storeName, tagline, about, categories[], catalog: [{ id, name, price, currency, category }] }` (≤60 products, ≤20 categories, about ≤400).
- `allowedAmounts(texts: string[])` → `Set<number>` of centavos found in the brief/budget.
- `guardMoneyText(text, allowed)` → text with disallowed money mentions replaced by `{{precio}}`.
- `draftToDocument(data, { catalog, allowed })` → `{ title, content: DocumentBlock[], items: { description, quantity, unitAmount, paymentLinkId? }[] }`.

- [ ] **Step 1: Failing tests** — catalog price wins over the model's number; unknown catalog id → unknown; merchant amount only when in the brief (`1.500` = `1500` = `Bs 1500,00`); unknown → `{{precio}}` + 0; money in blocks replaced unless allowed (item amounts and total allowed); nine blocks in order with the right types; quantities clamped; user message is JSON data holding the brief; system prompt names the tone and the untrusted-input rule.
- [ ] **Step 2: Run** `npx jest business-documents/proposal-draft` → FAIL (module missing).
- [ ] **Step 3: Implement** `proposal-draft.ts`.
- [ ] **Step 4: Run** → PASS. **Step 5: Commit.**

### Task 2: Draft and regenerate (service, AI mocked), list states and summary

**Files:** Create `proposals.service.ts` (+ spec). Modify `business-documents.service.ts` (list states), DTOs, `fake-document-prisma.ts`.

**Interfaces:**
- `draft(merchantId, storeId, dto: DraftProposalDto)` → D0 document view (DRAFT, kind PROPOSAL) + `ai: { model }`.
- `regenerateSection(merchantId, storeId, id, dto)` → `{ block }`.
- `summary(merchantId, storeId)` → spec §2.11.

- [ ] Failing tests: draft calls the helper with stage `proposal-draft`, no model override (luna), the catalog in the user message; persists nine blocks, `{{precio}}` items, validity 15 days, merchant customer, `ai_drafted` event; another store 404 and no AI call; regenerate same type/title, guarded, 409 on final, 404 on a cobro; `state=open|accepted|draft|closed` for proposals; summary counts and values; send blocked by `{{precio}}` (422).
- [ ] Run → FAIL. Implement. Run → PASS. Commit.

### Task 3: Accept, request changes, expiry (public) and merchant notifications

**Files:** Modify `proposals.service.ts`, `business-documents.service.ts` (public view fields, expire on read, cap), create `proposal-email.ts`, `proposals.worker.ts`.

- [ ] Failing tests: accept records evidence (IP, UA, version, sha256, name, email) once and sets ACCEPTED; stale version 409; expired 409 and status EXPIRED; voided 409; double accept returns the acceptance without a second event; changes sets CHANGES_REQUESTED, writes an inbox thread + INBOUND message, emails the merchant with replyTo the customer and a `merchant_notified` event; over the cap no email but the event and inbox stay; 6th request in 24 h → 429; public view shows `validUntil`, `acceptance`, `acceptable` and expires on read (once); worker expires only open proposals past validity, once.
- [ ] Run → FAIL. Implement. Run → PASS. Commit.

### Task 4: Crear cobro from an accepted proposal

- [ ] Failing tests: refuses a non-accepted proposal (409) and a cobro/other store (404); creates an INVOICE from the accepted version's frozen items (not the working copy), discount and customer (fallback to the accepter), sends it (`COB-0001`), links both ways; a second call returns the same cobro; a proposal with no priced items → 422.
- [ ] Run → FAIL. Implement. Run → PASS. Commit.

### Task 5: Routes and module wiring

- [ ] Failing controller specs: merchant routes scope `merchant.id` + `storeId`; public `accept`/`changes` pass the request context. Implement `proposals.controller.ts`, public routes (throttled, no-store), module imports `AiModule`, providers `ProposalsService`, `ProposalsWorker`. `tsc --noEmit`. Commit.

### Task 6: Checkout proposal page

- [ ] Failing vitest (`test/proposal-page.test.ts`): renders sections, items, total, validity countdown; escapes an XSS title; Aceptar posts `{ name, email, version }` then shows "Aceptada"; Pedir cambios posts the message and confirms; accepted/expired/voided/preview states have no active buttons. Implement `proposal-page.ts` + css, dispatch in `cobro-page.ts`. Commit.

### Task 7: Dashboard helpers

- [ ] Failing `node --test src/proposals.test.mjs`: status labels/tones, `placeholdersIn(draft)`, `setItemPrice` removes `{{precio}}`, `proposalTotal`, `validityFromPreset`, `validityLine`, `proposalPayload`, `timelineEntries`, `whatsAppProposalMessage`, `blankProposalBlocks`. Implement. Commit.

### Task 8: Dashboard view

- [ ] Failing Playwright `tests/proposals.spec.mjs` at 390 and 1280 (API + AI mocked). Implement `proposals-panel.mjs`, `proposals.css`, glue (`index.html` nav + section, `dashboard.js` mount/show/reset/copy, `server.mjs` whitelist, `cobros-panel.mjs` `open`). Smoke VIEWS gains `proposals`. Commit.

### Task 9: Verify

- [ ] API jest `business-documents ai`, checkout vitest, dashboard unit + full Playwright `--workers=2`, `tsc --noEmit` (API, checkout), eslint on touched TS. Screenshots under `tmp/proposals-shots/` (draft, edit, share, public open/accepted/changes/expired at 390 and 1280), looked at and fixed. Ledger updated.
