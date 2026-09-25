# Document Foundations — Implementation Plan (sub-project D0)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the base that cobros (D1), AI proposals (D2) and AI contracts (D3) stand on:
- a `BusinessDocument` with line items, a customer snapshot, a timeline and immutable sent versions (sha256);
- an HMAC public link that records "viewed" once per version;
- an HTML email with a PDF attachment;
- a shared PDF renderer;
- a shared, metered AI structured-output helper.

**Architecture:** A new Nest module, `apps/api/src/business-documents`. Pure functions (totals, snapshot, canonical JSON, placeholders, number label, link token) are kept separate from the service. The service uses Prisma, `EMAIL_PROVIDER` and the PDF renderer. The merchant controller sits behind `MerchantAuthGuard`. The public controller is throttled and `no-store`. `EmailProvider` gains optional `html`/`attachments`. The finance-pdf helpers are exported and take an optional header callback. The AI helper is its own `AiModule` in `apps/api/src/ai`.

**Tech Stack:** NestJS, Prisma 5 (PostgreSQL), pdfkit 0.19, Resend 6, OpenAI Responses API (mocked), Jest (ts-jest, `rootDir: src`).

**Spec:** `docs/superpowers/specs/2026-09-25-document-foundations-design.md`. Umbrella: `docs/superpowers/specs/2026-09-25-business-documents-and-guided-growth-design.md` §2 D0, §3, §4.

## Global Constraints

- Money is integer minor units. Totals above 2,000,000,000 are rejected: the columns are Postgres `integer`.
- The migration only creates things: no `ALTER`/`DROP` of existing tables. Generate it with `npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script`. Apply it to the local database with `npx prisma migrate deploy`, then run `npx prisma generate`.
- The public view and the PDF read the frozen version snapshot only, never the working copy.
- The public view returns no ids (`storeId`, `merchantId`, customer or payment-link ids) and nothing from another store.
- Existing `EmailProvider` callers compile and behave unchanged.
- Tests make no paid AI calls: `fetch` is mocked.
- Do not edit `packages/storefront-kit/**`, `apps/api/src/storefront-source/**` or `apps/checkout/src/source-*` (other agents own them).
- Commit only your own paths with `git commit -m … -- <paths>`.

## Review Focus

1. A view of version 1 must not stop version 2 from recording its own `viewed` event, and two concurrent opens must record only one → Task 8 tests (the unique `dedupeKey` plus P2002 is swallowed).
2. A PAID or VOIDED document opened by the customer must keep its status (a conditional `updateMany` on `status: SENT`) → Task 8 test.
3. A re-send with no edits must not create a new version or a new number → Task 7 test.
4. Canonical JSON must not depend on key order, or the stored sha stops being reproducible from the stored content → Task 3 test.
5. HTML email must escape every merchant-typed string (title, customer name, message) → Task 7 test.
6. Production must refuse to start without `DOCUMENT_LINK_SECRET` → Task 1 test. **Deploy risk:** the variable must be set before this ships.

---

## File Structure

| File | Responsibility |
|---|---|
| `apps/api/src/config/configuration.ts` (modify) | `documentLinkSecret` plus the production check. |
| `apps/api/src/config/configuration.spec.ts` (modify) | Strong env sets it; a missing one fails. |
| `.env.example` (modify) | `DOCUMENT_LINK_SECRET` line. |
| `apps/api/src/business-documents/document-link-token.ts` (+spec) | HMAC token. |
| `apps/api/prisma/schema.prisma` (modify, append) | 4 enums, 5 models. |
| `apps/api/prisma/migrations/20260925120000_business_documents/migration.sql` (create) | Additive SQL. |
| `apps/api/src/business-documents/business-document-snapshot.ts` (+spec) | Totals, snapshot, canonical JSON, sha, placeholders, labels. |
| `apps/api/src/dashboard/interfaces/email-provider.interface.ts`, `adapters/*.ts` (+spec) | `html`, `attachments`. |
| `apps/api/src/reports/finance-pdfs.ts` (modify) | Export the helpers; header callback. |
| `apps/api/src/business-documents/business-document-pdf.ts` (+spec) | Document renderer. |
| `apps/api/src/ai/structured-completion.ts`, `ai.module.ts` (+spec) | AI helper. |
| `apps/api/src/business-documents/business-document-email.ts` | HTML and text body. |
| `apps/api/src/business-documents/dto/*.ts` | Validation. |
| `apps/api/src/business-documents/business-documents.service.ts` (+spec) | Workflow. |
| `apps/api/src/business-documents/business-documents.controller.ts`, `business-documents-public.controller.ts` (+spec), `business-documents.module.ts` | HTTP. |
| `apps/api/src/app.module.ts` (modify) | Register the module. |

Jest paths are relative to `apps/api/src`: `cd apps/api && npx jest business-documents/<file>`.

---

### Task 1: Document link secret and HMAC token

**Files:** `config/configuration.ts`, `config/configuration.spec.ts`, `.env.example`, create `business-documents/document-link-token.ts` + `.spec.ts`.

**Interfaces:** Produces `createDocumentLinkToken(documentId, secret): string`, `readDocumentLinkToken(token, secret): string | null`, `DEVELOPMENT_DOCUMENT_LINK_SECRET`, and `app.documentLinkSecret`.

- [ ] **Step 1: Write the failing tests**

```ts
// document-link-token.spec.ts
import { createOrderTrackingToken } from "../consumer/order-tracking-token";
import { createDocumentLinkToken, readDocumentLinkToken } from "./document-link-token";

describe("document link tokens", () => {
  const secret = "test-document-link-secret-with-at-least-32-chars";
  const id = "cmt3sw7rs000h45900a1woug3";
  it("round-trips a signed document id", () => {
    expect(readDocumentLinkToken(createDocumentLinkToken(id, secret), secret)).toBe(id);
  });
  it("rejects tampered, differently-signed and malformed tokens", () => {
    const token = createDocumentLinkToken(id, secret);
    expect(readDocumentLinkToken(`${token}x`, secret)).toBeNull();
    expect(readDocumentLinkToken(token, "another-secret-with-at-least-32-characters")).toBeNull();
    expect(readDocumentLinkToken("a.b.c", secret)).toBeNull();
    expect(readDocumentLinkToken("", secret)).toBeNull();
  });
  it("does not accept an order-tracking token signed with the same secret", () => {
    expect(readDocumentLinkToken(createOrderTrackingToken(id, secret), secret)).toBeNull();
  });
});
```

In `configuration.spec.ts`:
- add `DOCUMENT_LINK_SECRET` to `SECURITY_ENV_KEYS`;
- set a strong value in `setStrongProductionEnv` and in the "accepts explicit strong production settings" test;
- add:

```ts
  it("refuses production without a strong document link secret", () => {
    setStrongProductionEnv();
    delete process.env.DOCUMENT_LINK_SECRET;
    expect(configuration).toThrow("DOCUMENT_LINK_SECRET");
  });
```

- [ ] **Step 2: Run, expect FAIL** — `npx jest business-documents/document-link-token config/configuration`: the module cannot be found, and the config does not throw.
- [ ] **Step 3: Implement.** Copy the order-tracking approach with the context `pagosya-business-document-link-v1`. Add `documentLinkSecret: process.env.DOCUMENT_LINK_SECRET ?? DEVELOPMENT_DOCUMENT_LINK_SECRET`, `requireSecret("DOCUMENT_LINK_SECRET", …)` and an `.env.example` line.
- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit** `feat(documents): signed public document links with their own secret`.

### Task 2: Schema and additive migration

**Files:** `prisma/schema.prisma` (append at the end), create `prisma/migrations/20260925120000_business_documents/migration.sql`.

- [ ] **Step 1: Append the models.** Enums `BusinessDocumentKind`, `BusinessDocumentStatus`, `BusinessDocumentSignerRole` (MERCHANT, CUSTOMER) and `BusinessDocumentSignatureMethod` (TYPED, DRAWN). Models:
  - `BusinessDocument` (unique `[storeId, kind, number]`, indexes `[storeId, kind, status, createdAt]` and `[merchantId, createdAt]`);
  - `BusinessDocumentItem` (`position`, `description`, `quantity`, `unitAmount`, `amount`, `paymentLinkId?`);
  - `BusinessDocumentVersion` (unique `[documentId, version]`, `sha256`, `content Json`, `createdAt`, `sentAt?`);
  - `BusinessDocumentEvent` (`type`, `version?`, `at`, `ipAddress?`, `userAgent?`, `data Json?`, `dedupeKey?`, unique `[documentId, dedupeKey]`);
  - `BusinessDocumentSignature` (`role`, `name`, `method`, `imageUrl?`, `email`, `codeVerifiedAt?`, `ipAddress?`, `userAgent?`, `version`, `versionSha256`, `signedAt`, unique `[documentId, version, role]`).

  Children use `onDelete: Cascade`. There are no relations to existing models.
- [ ] **Step 2: Generate the SQL** with `migrate diff` (see Global Constraints) into the migration file. Check it contains only `CREATE TYPE`, `CREATE TABLE`, `CREATE INDEX` and `ADD CONSTRAINT … FOREIGN KEY` on the new tables.
- [ ] **Step 3: Apply and generate.** Run `npx prisma migrate deploy && npx prisma generate`, then `npx prisma migrate status` should say "up to date".
- [ ] **Step 4: Commit** `feat(documents): business document tables (additive migration)`.

### Task 3: Totals, snapshot, canonical hash, placeholders

**Files:** create `business-documents/business-document-snapshot.ts` + `.spec.ts`.

**Interfaces:** Produces
- `computeTotals(items, discountAmount) → { items: (item & { amount })[], subtotalAmount, discountAmount, totalAmount }`, which throws `BadRequestException` above `MAX_AMOUNT = 2_000_000_000` or when the discount is greater than the subtotal;
- `buildSnapshot(document) → DocumentSnapshot`;
- `canonicalJson(value)`, `snapshotSha256(snapshot)`, `findPlaceholders(snapshot) → string[]`;
- `documentNumberLabel(kind, number)`: `COB-0001` / `PRO-0001` / `CON-0001`, or `Borrador` when there is no number.

- [ ] **Step 1: Tests.**
  - Totals: 2×1500 + 1×250 = 3250, and a discount of 250 gives 3000.
  - A discount greater than the subtotal throws.
  - `quantity 100000 × 1_000_000_000` throws.
  - `canonicalJson({b:1,a:{d:2,c:[{f:1,e:2}]}})` equals `canonicalJson({a:{c:[{e:2,f:1}],d:2},b:1})`.
  - The same snapshot built from the same input gives the same sha, and a different title gives a different sha.
  - `findPlaceholders` finds `{{cliente}}` in a block, an item and the title, deduplicated.
  - `documentNumberLabel("INVOICE", 7) === "COB-0007"`, and `documentNumberLabel("CONTRACT", null) === "Borrador"`.
- [ ] **Step 2: FAIL** (module missing). **Step 3: Implement.** **Step 4: PASS.** **Step 5: Commit** `feat(documents): totals, frozen snapshot hash and placeholder check`.

### Task 4: Email carries HTML and attachments

**Files:** `dashboard/interfaces/email-provider.interface.ts`, `dashboard/adapters/resend-email.provider.ts`, `dashboard/adapters/mock-email.provider.ts`, create `dashboard/adapters/email-providers.spec.ts`.

**Interfaces:** Produces `EmailAttachment { filename; contentType; content /* base64 */ }`, plus `SendEmailRequest.html?` and `.attachments?`. `MockEmailProvider.recent: SendEmailRequest[]` keeps the last 20.

- [ ] **Step 1: Tests.** `jest.mock("resend")` and capture `emails.send`.
  - A request with `html` and one attachment reaches Resend as `html` plus `attachments: [{ filename, content, contentType }]`, with `text` kept.
  - A text-only request has no `html`/`attachments` keys.
  - The mock keeps the request (with attachments) in `recent` and caps it at 20.
- [ ] **Step 2: FAIL** (TypeScript: unknown property `html`). **Step 3: Implement.** **Step 4: PASS**, together with `npx jest dashboard`. **Step 5: Commit** `feat(email): optional HTML body and attachments on the email provider`.

### Task 5: Shared document PDF renderer

**Files:** `reports/finance-pdfs.ts` (export `collectPdfBuffer`, `money`, `formatDate`, `ensureNewPage`, `writeWrappedLines`; the last two take an optional `header` callback), create `business-documents/business-document-pdf.ts` + `.spec.ts`.

**Interfaces:** Produces `renderBusinessDocumentPdf({ storeName, logo?: Buffer | null, numberLabel, version, sha256, snapshot }) → Promise<Buffer>`.

- [ ] **Step 1: Tests.** Reuse the inflate-and-read-text helper from `finance-pdfs.spec.ts`.
  - The output starts with `%PDF-`.
  - The text contains the store name, `COB-0001`, the item descriptions, `30,00 BOB`, the block heading and text, and `sha256 0123456789ab`.
  - 90 items give a multi-page PDF with the footer on every page (count ≥ 2).
  - It does not throw when there are no items and no customer.
- [ ] **Step 2: FAIL. Step 3: Implement.** Use `bufferPages: true`, and draw the footer on every buffered page with `margins.bottom = 0` while drawing. **Step 4: PASS**, together with `npx jest reports`. **Step 5: Commit** `feat(documents): shared branded PDF renderer for business documents`.

### Task 6: Shared structured AI helper

**Files:** create `ai/structured-completion.ts`, `ai/ai.module.ts`, `ai/structured-completion.spec.ts`.

**Interfaces:** Produces `StructuredCompletionService.structuredCompletion<T>(opts) → Promise<{ data: T; model; responseId; durationMs }>`.

- [ ] **Step 1: Tests** (`global.fetch = jest.fn()`):
  - The request body has `store: false`, `text.format.type === "json_schema"`, `strict: true`, the default model from `app.openAi.conversationModel`, a system text that contains the untrusted-input rule, and the user text.
  - The parsed `data` is returned, and `usage.record` is called with `(storeId, stage, model, body, ms, "COMPLETED")`.
  - A refusal gives `BadRequestException` and is recorded as FAILED.
  - `status: "incomplete"` gives `BadGatewayException`.
  - Invalid JSON gives `BadGatewayException`.
  - A fetch rejection gives `BadGatewayException` and is recorded as FAILED with a null body.
  - A missing key gives `ServiceUnavailableException`, with no fetch and no record.
  - An explicit `model` overrides the default.
- [ ] **Step 2: FAIL. Step 3: Implement. Step 4: PASS**, together with `npx jest ai-usage`. **Step 5: Commit** `feat(ai): shared metered structured-output helper`.

### Task 7: Document service — drafts and send

**Files:** create `business-documents/dto/business-document.dto.ts`, `business-documents/business-document-email.ts`, `business-documents/business-documents.service.ts` + `.spec.ts`.

**Interfaces:** `BusinessDocumentsService(prisma, config, email: EmailProvider)` with `create`, `list`, `get`, `update`, `remove`, `send(merchantId, storeId, id, { email?, message? })`, which returns `{ document, publicUrl, emailed }`.

- [ ] **Step 1: Tests** (in-memory Prisma double):
  - `create` on another merchant's store gives `NotFoundException`.
  - `create` stores the totals and customer snapshot, has no number, and records a `created` event.
  - `businessCustomerId` from another store gives 404.
  - `update` replaces the items and recomputes the totals, and is rejected (409) when PAID.
  - `remove` works on a never-sent draft only.
  - `send`:
    - the first send assigns number 1, creates version 1 with the sha of the snapshot, sets SENT, and records a `sent` event;
    - the email goes to the customer with `html`, the PDF attachment and `replyTo` set to the store's `contactEmail`;
    - a second send with no edits creates no version (the event has `resend: true`);
    - an edit then a send gives version 2 with the same number;
    - a `{{placeholder}}` gives 422 and no version;
    - a P2002 on the number is retried;
    - an email rejection gives an `email_failed` event and `emailed: false`;
    - the HTML escapes `<script>` in the title and the message.
- [ ] **Step 2: FAIL. Step 3: Implement. Step 4: PASS. Step 5: Commit** `feat(documents): drafts, totals and send with a frozen version and email`.

### Task 8: Void, public view and PDF; controllers; module

**Files:** extend the service and its spec; create both controllers, the controller spec and `business-documents.module.ts`; modify `app.module.ts`.

- [ ] **Step 1: Tests.**
  - `void`: from SENT, sets VOIDED and records a `voided` event with the reason; PAID or VOIDED gives 409.
  - `publicView`:
    - a bad token, or a document that was never sent, gives 404;
    - it returns `{ kind, numberLabel, status, version, sha256, sentAt, updatedAfterFirstSend, store: { name, logoUrl }, document: snapshot }` and no `storeId`/`merchantId`;
    - it records `viewed` once per version (a second call inserts nothing; version 2 records again);
    - a P2002 on the event is swallowed;
    - SENT becomes VIEWED, and PAID stays PAID.
  - `publicPdf` returns a PDF of the frozen version.
  - Controllers: the public controller passes `requestContext(req)`; the merchant controller passes `merchant.id`.
- [ ] **Step 2: FAIL. Step 3: Implement.** Register `BusinessDocumentsModule` in `app.module.ts`. **Step 4: PASS. Step 5: Commit** `feat(documents): public document link with once-per-version views, void and routes`.

### Task 9: Verify

- [ ] `cd apps/api && npx jest business-documents ai reports dashboard legal config` passes.
- [ ] `npx tsc --noEmit -p tsconfig.json` is clean.
- [ ] `npx eslint <touched files>` reports 0 errors.
- [ ] Record the results in the ledger.
