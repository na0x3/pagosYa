# Document foundations (D0) — design

Date: 2026-09-25. Parent: `docs/superpowers/specs/2026-09-25-business-documents-and-guided-growth-design.md`
(§2 row D0, §3 decisions, §4 shared rules). Written under the owner's instruction not to be asked
questions: every choice below is a ruling the owner may overturn.

## 1. What exists (from the code, 2026-09-25)

- **PDF:** `apps/api/src/reports/finance-pdfs.ts` has private pdfkit helpers (`collectPdfBuffer`,
  `applyHeader` with a pagosYa amber band, `ensureNewPage`, `writeWrappedLines`, `money`, `formatDate`).
- **Public links:** `consumer/order-tracking-token.ts` signs `base64url(id).HMAC(context:id)` and
  checks it with `timingSafeEqual`. The secret is `app.orderTrackingSecret`, with a development default and
  a production check in `assertProductionSecurityConfig`.
- **Email:** `EmailProvider` sends text only. Resend is the real adapter, and a logging mock is used
  when `RESEND_API_KEY` is unset (`EMAIL_PROVIDER` token, `DashboardModule`).
- **Evidence:** `legal` stores immutable rows with `sha256Hex(body)`, and each acceptance keeps the IP
  and user agent (`requestContext(req)` honours `TRUST_PROXY`).
- **AI:** about 11 callers write the same Responses API call by hand. `debt-collections.service.ts:297-380`
  is the template. `AiUsageService.record(...)` meters them.
- **Customers:** `BusinessCustomer` (store CRM, `@@unique([storeId, email])`), with no relations declared.

## 2. Decisions

1. **One table for three kinds.** `BusinessDocument.kind` is `INVOICE | PROPOSAL | CONTRACT`, and
   `status` covers every state D1–D3 need: `DRAFT SENT VIEWED ACCEPTED CHANGES_REQUESTED SIGNED PAID
   OVERDUE DECLINED EXPIRED VOIDED`. D0 only moves through DRAFT → SENT → VIEWED and → VOIDED.
2. **The new tables declare no Prisma relations to existing models.** `storeId`, `merchantId`,
   `businessCustomerId` and `paymentLinkId` are indexed plain strings, following `BusinessCustomer`.
   The migration then creates tables only and never alters an existing table. Other agents are
   editing `schema.prisma`, so a back-relation on `Store` would be a merge hazard. The document's
   own children (items, versions, events, signatures) do cascade from the document.
3. **The number is assigned on the first send**, as a sequence per store and kind:
   `@@unique([storeId, kind, number])`. When two sends collide, the unique violation is retried
   (up to 5 attempts). Drafts have no number, so a deleted draft leaves no gap. Display prefixes:
   `COB-0001` (a cobro, see the umbrella's naming decision), `PRO-`, `CON-`.
4. **Money and quantity are integers.** Amounts are in minor units, and quantity is a whole number
   from 1 to 100,000. The subtotal is Σ quantity × unit. A document-level `discountAmount` (≤ subtotal)
   is taken off to give the total. There is no tax line: prices include IVA, and the fiscal factura
   stays in the SIN pipeline. The database columns are `Int`, so a line or a total above
   2,000,000,000 is rejected with a 400.
5. **Content is a list of typed blocks:** `heading | paragraph | list | clause`, with an optional
   `title`, `text` and `items[]`. There are at most 200 blocks, and text is at most 5,000 characters.
   D2 and D3 write the same blocks.
6. **Sending freezes a version.** The snapshot holds only public fields: kind, number label, title,
   customer, currency, items, totals, blocks, due date and validity. It is serialised as canonical
   JSON with recursively sorted keys, and hashed with `sha256Hex`. It is stored in
   `BusinessDocumentVersion(version, sha256, content, sentAt)` and never updated.
   - A send whose snapshot equals the latest version creates no new version. It only re-delivers
     the document and records a `sent` event with `{ resend: true }`.
   - A draft whose text still contains a `{{placeholder}}` cannot be sent: 422, listing the
     placeholders (umbrella decision 3).
7. **The working copy stays editable after sending**, except in `ACCEPTED`, `SIGNED`, `PAID`, `DECLINED`,
   `EXPIRED` and `VOIDED` (409). The public link always shows the latest *sent* version and never the
   working copy.
   - `DELETE` only removes a document that was never sent.
   - `void` works on every state except `PAID`, `SIGNED` and `VOIDED`.
8. **Public link.** `createDocumentLinkToken(id, secret)` uses its own context,
   `pagosya-business-document-link-v1`, and a new secret, `DOCUMENT_LINK_SECRET`. It has a
   development default and is added to the production check, so production refuses to start
   without it. The link has no version and no expiry: voiding the document is how it is revoked,
   and void revokes the content, not the URL. A voided link still answers (so the customer learns
   why), but its JSON view keeps only `kind`, `numberLabel`, `title`, `status: VOIDED`, `voidedAt`
   and the store's name and logo — no customer name, email, phone or document, no items, totals,
   dates or blocks, no version or sha256. Its PDF is rendered from that same reduced content
   (header, title, "Documento anulado el <fecha>") with a diagonal "ANULADO" stamp on every page.
   Opening a voided link records no view.
   The public URL is `${CHECKOUT_ORIGIN}/d/<token>`. D1 builds that page.
9. **Viewed is recorded once per version.** `BusinessDocumentEvent.dedupeKey` is unique per
   document (`viewed:v<n>`), so concurrent opens insert one row. The event carries the IP and user
   agent. SENT → VIEWED is a conditional `updateMany` on `status = SENT`, so a view never moves a
   PAID or VOIDED document backwards. Unsent documents and bad tokens return the same 404.
10. **Email is HTML plus a PDF attachment.** `SendEmailRequest` gains optional `html` and
    `attachments: {filename, contentType, content (base64)}[]`. Resend passes both through. The
    mock logs them and keeps its last 20 messages. Existing callers are unchanged. Document emails
    go from the platform sender with `replyTo = store.contactEmail`, and use `failLoudly`, so a
    failed delivery becomes an `email_failed` event and `emailed: false` rather than a lost send.
11. **PDF renderer** (`business-documents/business-document-pdf.ts`) builds on the finance-pdf
    helpers. Those helpers become exports, and `ensureNewPage` / `writeWrappedLines` take an
    optional header callback, so the page-break logic is reused under a store header instead of
    pagosYa's.
    - The header has the store name, an optional logo, the kind and number, and the dates.
    - The body has the items table, the totals and then the blocks.
    - Every page has the footer `COB-0001 · v2 · sha256 1a2b3c4d5e6f` (12 hex characters).
    - The logo is passed in as image bytes: the renderer never fetches a URL. D0 passes none, and D1
      reads the store logo through `UploadsService`.
12. **The AI helper** is `apps/api/src/ai/structured-completion.ts`: `StructuredCompletionService`
    and `AiModule`.
    - Call: `structuredCompletion({ storeId, stage, model?, system, user, schema: { name, schema },
      timeoutMs = 60000, maxOutputTokens = 8000 })` → `{ data, model, responseId, durationMs }`.
    - The model defaults to `app.openAi.conversationModel` (luna). A caller asks for a larger tier by
      passing `designModel`.
    - It uses the Responses API with a strict `json_schema` and `store: false`, and adds a fixed
      untrusted-input line to the system prompt.
    - Every outcome is metered once: COMPLETED or FAILED.
    - Errors: no key → 503; transport, HTTP, incomplete or invalid output → 502; a refusal → 400.
    - The 11 existing callers are not touched.

## 3. Units

| Unit | File | Responsibility |
|---|---|---|
| Schema | `apps/api/prisma/schema.prisma`, `prisma/migrations/20260925120000_business_documents/` | 4 enums, 5 tables, create-only SQL. |
| Link token | `business-documents/document-link-token.ts` | Sign and read, with the context string. |
| Config | `config/configuration.ts` (+ spec, `.env.example`) | `documentLinkSecret`, production check. |
| Snapshot and totals | `business-documents/business-document-snapshot.ts` | `computeTotals`, `buildSnapshot`, `canonicalJson`, `snapshotSha256`, `findPlaceholders`, `documentNumberLabel`. |
| Service | `business-documents/business-documents.service.ts` | create, list, get, update, delete, send, void, publicView, publicPdf. |
| Controllers | `business-documents.controller.ts` (merchant, `MerchantAuthGuard`), `business-documents-public.controller.ts` | Routes; the ownership check is `store.findFirst({ id, merchantId })` in the service. |
| Email | `dashboard/interfaces/email-provider.interface.ts`, both adapters | `html` and `attachments`. |
| Document email | `business-documents/business-document-email.ts` | Escaped HTML and text body. |
| PDF | `reports/finance-pdfs.ts` (exports), `business-documents/business-document-pdf.ts` | Shared renderer. |
| AI | `ai/structured-completion.ts`, `ai/ai.module.ts` | The helper. |

Routes: `GET|POST v1/stores/:storeId/documents`, `GET|PATCH|DELETE v1/stores/:storeId/documents/:id`,
`POST …/:id/send`, `POST …/:id/void`, `GET v1/documents/public/:token`,
`GET v1/documents/public/:token/pdf`. The public routes are throttled and `no-store`.

## 4. Tests

- The token round-trips. A tampered token, another secret or the order-tracking context is rejected.
- Config: production refuses a missing or demo `DOCUMENT_LINK_SECRET`.
- Snapshot: the totals, the discount cap and the Int overflow guard. Canonical JSON does not depend
  on key order. The same snapshot gives the same sha. Placeholders are found in the title, items and blocks.
- Service (mocked Prisma):
  - Another merchant's store gives 404.
  - Sending assigns the number, freezes version 1 with the sha and records events. A second send
    with no changes creates no version, and an edit then a send gives version 2.
  - A placeholder blocks the send.
  - A number collision is retried.
  - The email carries the HTML and the PDF. A delivery failure gives `email_failed` and `emailed: false`.
  - A terminal state blocks updates, and `void` keeps its rules.
  - The public view returns only snapshot fields, records `viewed` once per version and does not
    move a PAID document backwards. A draft or a bad token gives 404.
- Email adapters: Resend receives `html` and `attachments`. A text-only request is unchanged.
- PDF: the text includes the store, the number, the items, the totals, the blocks and the footer
  sha. The footer is on every page of a long document.
- AI helper (mocked `fetch`): the request shape is strict, with `store: false` and the default
  model. It parses the output, meters success and failure, and maps refusal, incomplete and
  missing key.

## 5. Out of scope

The checkout `/d/:token` page, the dashboard UI, payment, reminders and overdue (D1). AI drafting
prompts (D2). The signing flow and codes (D3); D0 only creates the `BusinessDocumentSignature` table.
