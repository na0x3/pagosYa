# Cobros (D1) — design

Date: 2026-09-25. Parent: `docs/superpowers/specs/2026-09-25-business-documents-and-guided-growth-design.md`
(§2 row D1, §3 decisions 1, 6 and 7, §4 shared rules). Builds on D0,
`docs/superpowers/specs/2026-09-25-document-foundations-design.md`. Owner request: "Invoice — Generate and send
invoices on mobile or web app … everything guided and easy for the user, the user experience to be bomb." The
owner asked not to be asked questions: every choice below is a ruling the owner may overturn.

## 1. What exists (from the code, 2026-09-25)

- D0 gives `BusinessDocument` (kind `INVOICE`), numbering `COB-0001` on the first send, frozen hashed versions,
  the HMAC public link `${CHECKOUT_ORIGIN}/d/<token>`, `GET v1/documents/public/:token` (+ `/pdf`), HTML email
  with a PDF attachment, a per-store email cap (`DOCUMENT_EMAILS_PER_DAY`) and placeholders that block a send.
  It has no payment, no overdue, no reminders, no checkout page and no dashboard UI.
- Paying: `PaymentIntentsService.createInTransaction` creates an intent with metadata; the checkout pays it at
  `${CHECKOUT_ORIGIN}/#client_secret=…` (`operations-helpers.ts paymentCheckoutUrl`). `SubscriptionInvoice` is the
  closest precedent: a due charge with a `paymentIntentId`, reused unless failed, marked PAID inside the
  payment's success transaction (`applyRailResult`), which already enqueues the SIN `Invoice` for any paid
  intent when the merchant's invoicing is configured.
- Checkout pages outside a store (order tracking `/track/:token`) are rendered by `apps/checkout/src/main.ts`
  from a path match; production `server.mjs` whitelists those paths to `index.html` and marks them noindex.
- The dashboard is vanilla JS. New features live in their own module (`rewards-panel.mjs`: `mountX(deps)`),
  with minimal glue in `dashboard.js` / `index.html`; `server.mjs` whitelists every served `/src/*` file.

## 2. Decisions

1. **Schema (own table only).** `BusinessDocument` gains `paymentIntentId String?`, `paidAt DateTime?`,
   `autoReminders Boolean @default(true)` and an index `(kind, status, dueAt)` for the worker. The migration
   alters only the D0 table (no existing model is touched).
2. **Due date.** The UI offers Hoy / 7 / 15 / 30 días / otra fecha; the date is stored as the end of that day in
   Bolivia (`23:59:59-04:00`). A cobro is overdue once `dueAt` has passed.
3. **Paying.** `POST v1/documents/public/:token/pay` (throttled, no-store) returns
   `{ clientSecret, checkoutUrl }` for the *frozen* total and currency of the latest sent version:
   - 404 for a bad token, an unsent document or a non-invoice; 409 for `VOIDED`, `PAID` or `EXPIRED`.
     `OVERDUE` stays payable.
   - Inside one transaction the document row is locked (`FOR UPDATE`). An existing intent is reused when it is
     for the same version, amount and currency and is not failed or canceled. Otherwise a new one is created;
     an old intent still at `REQUIRES_PAYMENT_METHOD` or `FAILED` is canceled (an in-flight one is left alone).
   - `livemode = merchant ACTIVE && store ACTIVE` (the subscriptions rule). The intent carries the customer
     fields of the frozen snapshot (so the SIN factura gets the NIT/CI) and metadata
     `{ storeId, businessDocument: { documentId, version, numberLabel } }`, which also brands the checkout.
   - A `checkout_started` event is recorded only when an intent is created.
4. **Paid hook.** `markBusinessDocumentPaid(tx, intent)` runs in `applyRailResult`'s success branch, next to
   the subscription-invoice update, only when the intent's metadata names a document. It flips
   `SENT | VIEWED | OVERDUE → PAID` with `paidAt` and `paymentIntentId` (conditional `updateMany`), and records
   one event per intent with `createMany … skipDuplicates` (never a unique violation that would abort the
   payment's transaction): `paid` or, when the document was already closed (voided or paid by another intent),
   `payment_after_close` so the merchant can refund. The event carries amount, currency, version and
   `livemode`. Like orders and subscription invoices, a test-mode payment also marks the cobro paid; the event
   says `livemode: false` and the UI says "Pago de prueba". No email is sent from the hook (the checkout's own
   receipt already goes to the buyer).
5. **Void** also cancels the linked intent when it is still `REQUIRES_PAYMENT_METHOD`.
6. **Overdue.** A worker (every 15 min) moves `INVOICE` documents in `SENT | VIEWED` with `dueAt < now` to
   `OVERDUE` (conditional `updateMany`) and records `overdue` once per version (`dedupeKey overdue:v<n>`).
7. **Reminders.**
   - Manual: `POST v1/stores/:storeId/documents/:id/remind { channel: "email" | "whatsapp" }`. Email sends a
     reminder email (HTML + PDF) through the per-store cap; a second email reminder within 6 hours answers 409.
     WhatsApp only records the event (the dashboard opens `wa.me`). Only `SENT | VIEWED | OVERDUE` cobros.
   - Automatic (worker, when `autoReminders` and the customer has an email): on the due day (from
     `dueAt − 15h` to `dueAt`, only if the cobro was sent more than 24 h earlier) and 3 days after it
     (`dueAt + 3d` to `dueAt + 10d`). Each is claimed once per version with a `dedupeKey`
     (`reminder:due:v<n>`, `reminder:overdue3:v<n>`) before the email goes out, so two API instances never both
     send. Over the store's cap the reminder is skipped and retried on the next tick while its window is open.
   - Reminder emails count against `DOCUMENT_EMAILS_PER_DAY` (the cap counts `emailed` and `reminded` email
     events).
8. **Sharing.** `POST …/:id/shared { channel: "whatsapp" | "link" }` records a `shared` event for the timeline.
   The dashboard creates and sends (`email: false`) in one step ("Crear cobro"), then offers Email / WhatsApp /
   Copiar enlace as real links, so a popup blocker never eats the WhatsApp tab. Email is a re-send of the same
   version (no new version, D0 rule).
9. **Merchant preview never counts as a view.** The merchant detail returns `previewUrl`: the public URL plus
   `?preview=<token>`, where the token is an HMAC over `(documentId, expiry)` with its own context and a 2-hour
   expiry. `GET v1/documents/public/:token?preview=…` with a valid preview token for the same document skips
   the view record and answers `preview: true`; the page then disables Pagar and says it is a preview.
10. **Public view** adds `dueAt`, `paidAt`, `payable` and the store's contact phone and email (already public on
    the storefront). A voided view stays reduced (D0).
11. **Customer suggestions.** `GET v1/stores/:storeId/document-customers?q=` merges the store CRM
    (`BusinessCustomer`), customers of earlier cobros and recent paying buyers (succeeded intents with this
    `storeId`), deduplicated by email, phone or name, at most 12.
12. **Branded PDF.** The store logo is read through `UploadsService.getBuffer` for the email and public PDF;
    an unreadable or non-PNG/JPEG logo is skipped by the renderer (D0 behaviour).
13. **Checkout page `/d/:token`.** Rendered by `apps/checkout/src/documents/cobro-page.ts`, same shell rules as
    order tracking (no merchant scripts, noindex). It shows the store (logo or initials, name), the cobro number,
    a status line (Por pagar · Vence el … / Vencido el … / Pagado el … / Anulado el …), the customer, items and
    totals, the note, a big "Pagar Bs X" button (QR o tarjeta), "Descargar PDF", and a contact line. Pagar asks
    the API for the checkout session and navigates to it. Production `server.mjs` serves `/d/:token` and adds
    `X-Robots-Tag: noindex`.
14. **Dashboard.** A new nav group **Documentos** with **Cobros** (room for Propuestas and Contratos later).
    `src/cobros.mjs` holds pure helpers (money parsing, due presets, status and timeline copy, WhatsApp text,
    filters), unit-tested with `node --test`; `src/cobros-panel.mjs` mounts the view (`mountCobrosPanel(deps)`)
    with its own `src/cobros.css`.
    - Summary: Por cobrar · Vencido · Cobrado (30 días).
    - Filters: Todos, Por cobrar, Vencidos, Pagados (with counts); list cards with customer, number, amount,
      status chip and a relative due line.
    - First run: one sentence ("Crea un cobro, compártelo por WhatsApp y recibe el pago con QR o tarjeta.") and
      one button ("Crear mi primer cobro").
    - Create flow (a full-screen sheet on phones, a centered dialog on desktop): customer (suggestions or type
      name, WhatsApp and email), items (catalog products with their price, or a free line), due preset, optional
      note, automatic reminders toggle, live total; "Crear cobro". Copy states that when SIN invoicing is
      configured the factura is emitted automatically when the cobro is paid.
    - Share sheet: WhatsApp (message with name, number, amount, due date and link), Email (if the customer has
      one), Copiar enlace, Ver como cliente.
    - Detail: amount, status, due, customer, items, timeline, and actions Compartir, Recordar, Ver como cliente,
      PDF, Anular (confirm); a draft offers Enviar and Eliminar.
    - `dashboard.js` glue: mount, pass `api`, `storeId`, `apiBase`, notify on store change and view change;
      the `api()` 429 error keeps `status` and the server's message so the email cap message reaches the UI.

## 3. Units

| Unit | File | Responsibility |
|---|---|---|
| Schema | `prisma/schema.prisma`, `prisma/migrations/20260925180000_cobros/` | 3 columns + index on `BusinessDocument`. |
| Preview token | `business-documents/document-link-token.ts` | `createDocumentPreviewToken`, `readDocumentPreviewToken`. |
| Paid hook | `business-documents/cobro-payment.ts` | `businessDocumentLink(metadata)`, `markBusinessDocumentPaid(tx, intent)`. |
| Cobros service | `business-documents/cobros.service.ts` | pay, remind, shared, customer suggestions, maintenance (overdue + automatic reminders). |
| Worker | `business-documents/cobros.worker.ts` | `@Interval` 15 min → `runMaintenance`. |
| Routes | `business-documents.controller.ts`, `business-documents-public.controller.ts`, `cobros.controller.ts` | New routes. |
| D0 service | `business-documents.service.ts` | view fields, preview, public fields, quota counts reminders, void cancels intent, logo. |
| Email | `business-document-email.ts` | Reminder variants; "Ver y pagar" for cobros. |
| Payment hook call | `payment-intents/payment-intents.service.ts` | One call in the success branch. |
| Checkout | `apps/checkout/src/documents/cobro-page.ts`, `main.ts` (3 lines), `server.mjs`, `src/style.css` → own `cobro-page.css` | The public page. |
| Dashboard | `src/cobros.mjs`, `src/cobros-panel.mjs`, `src/cobros.css`, `index.html`, `dashboard.js`, `server.mjs` | The view. |

## 4. Tests

- API (jest): preview token round-trip, expiry and wrong document; pay (reuse, new version, refusals, livemode,
  metadata, cancel of an old intent, event once); hook (paid once, after close, never throws on duplicates,
  ignores intents without a document); overdue (once, only past due, not paid/voided); reminders (windows,
  once per version, cap, cooldown, whatsapp records only); suggestions (merge and dedupe, other store never);
  public view (preview skips the view, fields); quota counts reminders; void cancels an open intent.
- Checkout (vitest): `/d/:token` renders the cobro escaped, the Pagar button posts to `/pay` and navigates to the
  returned checkout URL, a paid cobro shows "Pagado" with no button, a voided one shows "Anulado" and no items,
  a preview disables Pagar.
- Dashboard: `node --test` for `cobros.mjs`; Playwright `tests/cobros.spec.mjs` with mocked API: empty state →
  create → share sheet → list with status, at 390 px and 1280 px; the smoke suite includes the new view.

## 5. Out of scope

Partial payments, installments, recurring cobros (subscriptions exist), taxes beyond "prices include IVA",
SMS or the WhatsApp API, editing a sent cobro from the dashboard (the API allows it; the UI offers void and
re-create in D1), proposals and contracts (D2, D3).
