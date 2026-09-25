# AI Contracts with e-signature (D3) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Update `.superpowers/sdd/2026-09-25-contracts/progress.md` after every task.

**Goal:** A merchant picks a contract type, fills (or reuses) the parties and the deal terms, YAPI drafts Bolivian-Spanish clauses, the merchant edits them, and both parties sign electronically (customer: email code + name/drawing; merchant: dashboard), ending in a signed PDF with an evidence page emailed to both.

**Architecture:** No schema change. Contract meta (type, city, signing order, issuer + customer party) is a leading `contract` block in D0's `content`, moved into a hashed `snapshot.contract` on send. Codes/verifications are events; signatures use `BusinessDocumentSignature`. A `ContractsService` adds draft/regenerate/sign/codes on top of D0; D0 gets small CONTRACT branches (sendable check, edit lock after the customer signed, public view fields, contract PDF, cap counts codes, list states).

**Tech Stack:** NestJS + Prisma (mocked in tests via `testing/fake-document-prisma.ts`), pdfkit, Jest; checkout Vite + vitest (jsdom); dashboard vanilla ES modules + `node --test` + Playwright.

**Spec:** `docs/superpowers/specs/2026-09-25-contracts-design.md`.

## Global Constraints

- Never run prisma migrate/db push/reset, psql, or anything touching a database. No schema change is planned.
- AI is always mocked (StructuredCompletionService stub); no paid calls.
- Party details never come from the model: Partes/Domicilios/firmas are server-built; missing data → `{{…}}` placeholders that block the send.
- Money: typed price allowed; merchant-written amounts need a confirm tap (`{{confirmar monto}}`); anything else → `{{precio}}`.
- Lock order: the document row (`FOR UPDATE`) first, inside the transaction, before reading signatures/events.
- Commit only own paths with `git commit -m … -- <paths>`; never touch `apps/api/src/store-growth/**`, `apps/merchant-dashboard/src/growth*`, `apps/merchant-studio/**`.
- Jest paths relative to `apps/api`: `npx jest src/business-documents`.

## Review Focus

1. Hashes of existing cobros/proposals must not change (the snapshot gains `contract` only for CONTRACT) → Task 1 test.
2. A code is never stored in clear, expires after 10 min, dies after 5 wrong attempts, and the 6th verify fails even with the right code → Task 3/4 tests.
3. Signing a stale version (merchant re-sent meanwhile) is refused with 409 for both roles → Task 4 test.
4. A merchant cannot silently change a contract the customer already signed (update and changed send refused) → Task 4 test.
5. SIGNED only when both roles signed the same current version; copies emailed once each → Task 4 test.
6. The model's clause text cannot introduce party names, IDs or amounts (Partes rebuilt, money guarded) → Task 2 test.
7. Drawn signature: only a real PNG data URL under the size cap is stored → Task 3 test.

---

## File Structure

| File | Responsibility |
|---|---|
| `apps/api/src/business-documents/contract-terms.ts` (+ spec) | Types, roles, outlines, meta clean, prefill, placeholders, templates, Partes/Domicilios. |
| `apps/api/src/business-documents/contract-draft.ts` (+ spec) | AI schema/prompt, guarded clause assembly. |
| `apps/api/src/business-documents/contract-signing.ts` (+ spec) | Code + HMAC, email mask, PNG check, Bolivia time. |
| `apps/api/src/business-documents/contract-pdf.ts` (+ spec) | Contract PDF + evidence page. |
| `apps/api/src/business-documents/contracts.service.ts` (+ spec) | Service. |
| `apps/api/src/business-documents/contracts.controller.ts` (+ spec), `contracts.worker.ts` | Routes, expiry. |
| `business-document-snapshot.ts`, `business-documents.service.ts`, `business-documents-public.controller.ts`, `business-documents.module.ts`, `dto/business-document.dto.ts`, `testing/fake-document-prisma.ts` (modify) | D0 glue. |
| `apps/checkout/src/documents/contract-page.ts` + `.css` + test, `cobro-page.ts` (dispatch) | Public page. |
| `apps/merchant-dashboard/src/contracts.mjs` + `unit` test, `contracts-panel.mjs`, `contracts.css`, `tests/contracts.spec.mjs`; glue `index.html`, `dashboard.js`, `server.mjs`, `proposals-panel.mjs` | Dashboard. |

## Task 1 — contract terms + snapshot

- [ ] RED: `contract-terms.spec.ts` (outline per type, role labels, `cleanContractMeta` trims/limits, `prefillMerchantParty` precedence invoicing → KYC → store and placeholders for missing, `partesClause`/`domiciliosClause` use only party data, templates carry `{{…}}` for objeto/precio/plazo); `business-document-snapshot.spec.ts` additions (CONTRACT snapshot has `contract` and clause-only blocks; an INVOICE snapshot/hash is unchanged by a stray `contract` block; `findPlaceholders` sees party placeholders).
- [ ] GREEN: implement; run `npx jest src/business-documents/contract-terms src/business-documents/business-document-snapshot`.
- [ ] Commit.

## Task 2 — AI draft rules

- [ ] RED: `contract-draft.spec.ts` — schema has only outline keys; user message carries terms as JSON data; `assembleContract` keeps typed price, marks merchant-written amounts with `{{confirmar monto}}`, replaces others with `{{precio}}`, drops model clauses for partes/domicilios/firmas and inserts server ones, clamps lengths.
- [ ] GREEN; commit.

## Task 3 — signing rules + PDF

- [ ] RED: `contract-signing.spec.ts` (6 digits, HMAC differs per nonce, constant-time compare, mask `a***@gmail.com`, PNG data URL accepted/rejected by magic bytes and size, `boliviaTime`); `contract-pdf.spec.ts` (parties, clauses, "Registro de firma electrónica", names, IP, full sha256, "Pendiente de firma" when unsigned).
- [ ] GREEN; commit.

## Task 4 — service + D0 glue

- [ ] RED: `contracts.service.spec.ts` — draft (AI mocked; template when `ai:false`; fromProposal), regenerate, send blocked by placeholders / missing email, codes (cooldown, 5/day, cap, hashed), verify (expiry, attempts), customer sign (version 409, order, verified required, idempotent, evidence), merchant sign, fully signed + copies once, edit/send lock after customer signature, void partly signed, expiry on read, public view fields, list states + summary.
- [ ] GREEN; `npx jest src/business-documents`; commit.

## Task 5 — routes, module, worker

- [ ] RED: `contracts.controller.spec.ts` (routes delegate, merchantUser + sessionRef passed; public sign routes pass request context).
- [ ] GREEN; `npx tsc --noEmit -p apps/api`; commit.

## Task 6 — checkout contract page

- [ ] RED: `contract-page.test.ts` — renders; read gate; code request/verify; sign posts `{version,name,method,image?,readConfirmed}`; 409 stale message; waiting-for-merchant; signed; voided; expired; preview.
- [ ] GREEN; screenshots `tmp/contracts-shots/public-*`; commit.

## Task 7 — dashboard helpers

- [ ] RED: `unit/contracts.test.mjs` — chip for each state, pending list from meta + clauses, draft payload, confirm-marker removal, clause move.
- [ ] GREEN; commit.

## Task 8 — dashboard view + glue + Playwright

- [ ] RED: `tests/contracts.spec.mjs` at 390/1280 — empty → example → composer → AI draft → edit/regenerate clause, fill pending party data → Firmar y enviar → list chip; accepted proposal → Crear contrato prefilled.
- [ ] GREEN; screenshots `tmp/contracts-shots/dashboard-*`; commit.

## Task 9 — verify

- [ ] API jest (business-documents, ai, legal), tsc, eslint touched; checkout vitest; dashboard unit + full Playwright `--workers=2`; PDF evidence page → PNG via `pdftoppm`; ledger final.
