# Business documents and guided growth — umbrella design

Date: 2026-09-25. Owner request (2026-09-24): "AI Contract — generate eSignature-ready contracts, all in one
workflow; Invoice — generate and send invoices on mobile or web app; AI Proposal — create professional online
proposals in seconds with AI. And I want user to have more control of its analytics, like clicks on site, clicks
on checkout, many more insights, on actions he could take to take his store to another level… everything
guided and easy… the user experience to be bomb." The owner asked not to be asked questions. Every decision
that would normally be a question is marked **Decision (owner may overturn)**.

## 1. What exists (research 2026-09-25)

- **Invoicing:** SIN/SIAT electronic invoicing (`apps/api/src/invoicing`). The `Invoice` row is tied 1:1 to a paid
  PaymentIntent and has no line items, due date or send state. Real SIAT emission is a stub. There is no
  invoice PDF, no email and no UI listing invoices.
- **Charging customers today:** quick QR payments, the debt-collection portal (lookup by carnet), and
  `SubscriptionInvoice` (a due charge plus a plain-text email with a checkout link, no UI).
- **Proposals, contracts, signatures:** none. The legal module (`apps/api/src/legal`) has the evidence
  pattern: an immutable, versioned document with the body's sha256, plus acceptance rows with IP, user
  agent and time.
- **Building blocks:**
  - pdfkit PDFs (`reports/finance-pdfs.ts`);
  - HMAC public tokens (`consumer/order-tracking-token.ts`);
  - `EmailProvider` (text only);
  - `BusinessCustomer` (store CRM, no UI);
  - S3-compatible uploads;
  - AI calls hand-rolled in about 11 places (`debt-collections.service.ts:297-380` is the cleanest);
  - `AiUsageService` metering.
- **Analytics:**
  - A consent-gated funnel with one row per session (`StoreFunnelVisit`); paid comes from orders.
  - No click tracking and no per-product views.
  - The raw `viewCount` is not deduplicated.
  - No rollups and no retention.
  - `GET v1/stores/:storeId/growth/insights` returns a 30-day funnel plus rule-based suggestions, but no
    screen uses it.

## 2. Sub-projects

| # | Sub-project | Outcome |
|---|---|---|
| D0 | Document foundations | `BusinessDocument` (kind invoice/proposal/contract) with line items, customer, a status timeline and an immutable sent version (sha256); an HMAC public link; HTML email with a PDF attachment; a shared PDF renderer; a shared AI structured-output helper with metering. |
| D1 | Invoices ("cobros") | Create on mobile or web in under a minute; send by email, WhatsApp link or copied link; a branded public page; pay through the existing checkout; sent → viewed → paid / overdue with reminders; when paid and SIN is configured, the existing fiscal `Invoice` is enqueued. |
| D2 | AI Proposals | Describe the job → YAPI drafts (scope, deliverables, timeline, priced items, validity, terms) → a block editor → a public page with Accept or Request changes; accepted → an invoice in one tap. |
| D3 | AI Contracts with e-signature | Drafted from a type (services, sale of goods, rental, confidentiality, custom) plus party data; clauses can be edited; both parties sign; a signed PDF with an evidence page. |
| G1 | Analytics capture | Consent-gated events (CTA clicks, card impressions and clicks, product views with product id, cart open, checkout steps, pay click), a daily rollup, 13-month raw retention. |
| G2 | Guided growth | A "Crecimiento" view: funnel with drop-offs, products, traffic, site and checkout clicks. Each insight comes with evidence, one action and a button that does it (open YAPI prefilled, edit a product, restock, create a proposal or promo). A weekly summary. |
| UX | Guided experience | A "Documentos" hub, first-run guides, empty states that teach, mobile-first; every new screen is checked in a browser at 390 and 1280px. It is part of every sub-project's definition of done. |

Order: D0 → D1 → D2 → D3. G1 → G2 run in parallel with the D track (different files; each commits only
its own paths).

## 3. Decisions (owner may overturn)

1. **Naming.** The UI document is a **"Cobro"**, not "Factura", because in Bolivia "factura" is the SIN fiscal
   document. When a cobro is paid and SIN is configured, the fiscal factura is emitted by the existing
   pipeline, and the UI says so.
2. **Signature level: a simple electronic signature with evidence.**
   - The signer opens a unique HMAC link, confirms a 6-digit code sent to their email, and types or draws
     their name.
   - The platform records the sha256 of the exact version, the time, IP, user agent and code verification,
     and adds an evidence page to the signed PDF.
   - Both parties sign (the merchant in the dashboard), and the signed version is immutable.

   This is **not** a qualified digital signature (ADSIB / Ley 164 "firma digital"), which some acts need
   (public deeds, some real-estate or labour formalities). The screen shows a plain notice listing those cases.
3. **AI drafting is assistance, not legal advice.** A visible notice appears on every draft. The model never
   invents party details: missing data becomes placeholders that block sending.
4. **Cost.** Drafts use the luna-class model by default and a larger tier only on request. Usage is metered.
   Tests mock the helper and never make paid calls.
5. **Privacy.** New events follow the existing consent rule. Raw events are kept 13 months; rollups hold
   no personal data.
6. **Delivery channels.** Email (HTML plus a PDF attachment), a WhatsApp `wa.me` share link, and copy link.
   No SMS and no WhatsApp API.
7. **Payments.** Existing PaymentIntent checkout only; no new rail.

## 4. Shared rules

- Public document pages are rendered by the checkout app (same rules as order tracking) and run no
  merchant scripts.
- Every state change goes into a timeline.
- Sent documents are immutable. Edits create a new version, and the link shows the latest with a note.
- Money is stored as integer minor units.
