# ASFI sub-project 4 — Public buyer complaints channel (design)

Date: 2026-10-08
Branch: `feature/asfi-program` (worktree `.claude/worktrees/asfi-program`, based on `feature/store-page-architecture` @ 25743648, which carries sub-project 3)
Requirement served: ASFI checklist — buyer complaints (*reclamos*). The bank's exact wording was not available; this design follows ASFI's general first-instance complaint rules (*Punto de Reclamo*): a case number at intake, a written answer within 5 business days (extendable with a reason), and notice of the right to take the complaint to ASFI. **Every deadline and every buyer-facing text marked ⚖ is for the owner's lawyer to confirm.**

Fourth of seven compliance sub-projects (1 terms, 2 merchant levels/limits, 3 holdback/reserve/payouts, **4 buyer complaints**, 5 merchant monitoring, 6 AML, 7 security before pentest).

## Goal

Any buyer, with or without a pagosYa account, can file a complaint about a payment, gets a case number and a deadline at once, and receives a written answer from pagosYa. Every step is recorded so the full history of any complaint can be shown to ASFI or the bank.

## Decisions (approved)

- **pagosYa owns every complaint** (rejected: the merchant answers first). pagosYa registers it, asks the merchant for their side, and sends the final answer. The merchant never answers the buyer through this channel.
- **One public page, no login**: `checkout.pagosya.bo/reclamos` (rejected: inside the buyer app only — excludes most buyers; adding an in-app button is deferred). Linked from every receipt email, the checkout's legal notice and the pagosya.bo footer.
- **No automatic money hold in this sub-project** (rejected: earmark the disputed amount). Ops pauses payouts manually (existing `POST /ops/merchants/:id/payout_hold`) and refunds through a new ops refund action. Automatic holds from complaint patterns belong to sub-project 5.
- **A new `complaints` module with its own tables** (rejected: reuse `SupportCase` — it requires a merchant, is an ops-access envelope, and its statuses don't fit; rejected: a mailbox — no case numbers or deadlines).
- **Business days = Monday–Friday, holidays not excluded.** A missed holiday can only make our deadline earlier than ASFI's, never later; no holiday calendar to maintain.

## Buyer journey

### Form — `checkout.pagosya.bo/reclamos` (apps/checkout, Spanish)

Fields:
- Name (required), email (required), phone (optional).
- Payment reference (optional) — the "Orden:" value on the receipt, which is the payment intent id. Without it, the store's name (free text, required when there is no reference).
- Category (required): `NOT_DELIVERED` (no recibí mi pedido), `NOT_AS_DESCRIBED` (el producto es distinto o está dañado), `UNRECOGNIZED_CHARGE` (no reconozco este cobro), `DUPLICATE_CHARGE` (me cobraron dos veces), `REFUND_NOT_RECEIVED` (no recibí mi reembolso), `OTHER`.
- Description (required, 20–5000 characters).
- What they want (required): `REFUND`, `DELIVERY`, `OTHER`.
- Up to 3 attachments: JPG, PNG or PDF, 5 MB each, checked by magic bytes server-side as well as by the client.
- A hidden honeypot field.
- A notice ⚖ that the data is used to handle the complaint and is shared with the merchant only as described in the privacy policy.

On submit the page shows the case number, the answer-by date and says a confirmation email is on its way.

### Tracking page — `checkout.pagosya.bo/reclamos/s/:token`

Shows the case number, status (in plain Spanish), the answer-by date, the buyer's own messages and attachments, and — once answered — the final answer. The buyer can add a message and up to 3 more files while the complaint is not answered. The first visit sets `emailConfirmedAt` (the link proves the address).

The final answer always ends with the second-instance notice ⚖: if the buyer is not satisfied they may take the complaint to ASFI's financial consumer office (*Defensoría del Consumidor Financiero*), with the case number.

### Emails to the buyer (platform sender via `EMAIL_PROVIDER`)

1. Received — case number, answer-by date, tracking link.
2. Deadline extended — new date and reason.
3. Answered — outcome, answer text, second-instance notice, tracking link.

## Ops journey (apps/ops, Spanish)

- **Queue** sorted by `dueAt`: overdue in red, due within one business day marked, filter by status, search by case number/email/merchant.
- **Complaint view**: buyer data, the linked payment (amount, date, status, refunds) and merchant, description, attachments, full history, internal notes.
- **Actions**:
  - Take (assigns to self; status `RECEIVED` → `IN_REVIEW`).
  - Link payment / merchant when the reference didn't match.
  - Internal note (never shown to buyer or merchant).
  - Ask the merchant (`IN_REVIEW` → `WAITING_MERCHANT`, sets `merchantDueAt` = +2 business days, emails the merchant). Needs a linked merchant.
  - Extend the deadline — once, with a reason, +5 business days ⚖; emails the buyer. `SUPPORT_ADMIN` only.
  - Send the final answer — outcome `UPHELD` / `PARTIALLY_UPHELD` / `NOT_UPHELD` + text; emails the buyer; status `ANSWERED` (final). `SUPPORT_ADMIN` only.
  - **Refund** (new) — refunds the linked payment, fully or partly, through `RefundsService.create` on the merchant's behalf with the ops actor recorded in `AuditLogService` and on the complaint history. Money comes from the merchant's held funds per sub-project 3. `SUPPORT_ADMIN` only.
  - **Pause payouts** — the existing payout-hold action, opened from the complaint with the case number prefilled as the reason.
- **Export**: CSV for a date range — case number, received, due, extended, answered, business days taken (Mon–Fri, as for deadlines), category, outcome, merchant, linked payment. ASFI's periodic report format ⚖ to be confirmed; the CSV holds every field it is likely to need.
- **Morning reminder** (daily job, 08:00 La Paz): one email to ops listing complaints due within one business day and overdue ones; it also retries failed buyer emails.

## Merchant journey (apps/merchant-dashboard)

- Email when ops asks for their side, with the case number and reply-by date.
- **Reclamos** list and detail: category, description, the payment, the buyer's attachments, the buyer's name. The buyer's email and phone are not shown (the merchant already has whatever the order collected).
- Reply once per request: text (required) + up to 3 files. Status goes back to `IN_REVIEW`. A late reply is still accepted and marked late.
- A merchant sees only complaints linked to their own merchant id. No merchant can see internal notes or other merchants' complaints.

## Data model (Prisma; hand-written migration, not applied to the dev DB until merge)

```prisma
enum ComplaintStatus { RECEIVED IN_REVIEW WAITING_MERCHANT ANSWERED }
enum ComplaintCategory { NOT_DELIVERED NOT_AS_DESCRIBED UNRECOGNIZED_CHARGE DUPLICATE_CHARGE REFUND_NOT_RECEIVED OTHER }
enum ComplaintRequest { REFUND DELIVERY OTHER }
enum ComplaintOutcome { UPHELD PARTIALLY_UPHELD NOT_UPHELD }
enum ComplaintActor { BUYER OPS MERCHANT SYSTEM }
enum ComplaintEventType {
  RECEIVED EMAIL_CONFIRMED BUYER_MESSAGE TAKEN LINKED NOTE MERCHANT_ASKED MERCHANT_REPLIED
  EXTENDED ANSWERED REFUNDED PAYOUTS_PAUSED EMAIL_SENT EMAIL_FAILED
}

model Complaint {
  id                String            @id @default(cuid())
  number            String            @unique          // "R-2026-000123"
  status            ComplaintStatus   @default(RECEIVED)
  category          ComplaintCategory
  request           ComplaintRequest
  buyerName         String
  buyerEmail        String
  buyerPhone        String?
  referenceGiven    String?                            // exactly what the buyer typed
  storeNameGiven    String?
  paymentIntentId   String?
  merchantId        String?
  description       String
  outcome           ComplaintOutcome?
  answer            String?
  assignedOpsUserId String?
  trackingTokenHash String            @unique          // sha256 of a 32-byte random token
  receivedAt        DateTime          @default(now())
  dueAt             DateTime
  extendedAt        DateTime?
  extensionReason   String?
  merchantDueAt     DateTime?
  emailConfirmedAt  DateTime?
  answeredAt        DateTime?
  events            ComplaintEvent[]
  attachments       ComplaintAttachment[]
  // relations to PaymentIntent, Merchant, OpsUser omitted here; all optional

  @@index([status, dueAt])
  @@index([merchantId, receivedAt])
  @@index([buyerEmail])
}

// Append-only: the code never updates or deletes a row. Sub-project 7 makes it tamper-evident.
model ComplaintEvent {
  id          String             @id @default(cuid())
  complaintId String
  type        ComplaintEventType
  actor       ComplaintActor
  actorId     String?            // OpsUser / MerchantUser id
  body        String?
  createdAt   DateTime           @default(now())

  @@index([complaintId, createdAt])
}

model ComplaintAttachment {
  id          String         @id @default(cuid())
  complaintId String
  eventId     String?        // the message/reply it came with
  uploadedBy  ComplaintActor
  storageKey  String         // PrivateFilesService key
  fileName    String
  contentType String
  sizeBytes   Int
  createdAt   DateTime       @default(now())
}

model ComplaintCounter {
  year Int @id
  last Int
}
```

Numbering: inside the creating transaction, `INSERT … ON CONFLICT (year) DO UPDATE SET last = last + 1 RETURNING last` — atomic, gap-free within committed rows of a year, formatted `R-{year}-{last:06}`.

## API (apps/api/src/complaints)

Public (no auth, `@Throttle` 5/hour/IP on create, 30/hour/IP on tracking):
- `POST /public/complaints` (multipart) → `{ number, dueAt, trackingUrl }`. Honeypot filled → same response shape with a fake number, nothing stored.
- `GET /public/complaints/track` (token in `Authorization: Bearer`) → buyer view.
- `POST /public/complaints/track/messages` (token, multipart).
- `GET /public/complaints/track/attachments/:id` (token) → streams the buyer's own file.

Ops (`OpsAuthGuard`, role checks as above): list, get, take, link, note, ask-merchant, extend, answer, refund, export CSV, attachment download.

Merchant (dashboard session guard): list own, get own, reply (multipart), attachment download for own complaints.

Reference matching on create: `referenceGiven` is trimmed and looked up as a payment intent id; if found, `paymentIntentId` and `merchantId` are set and a `LINKED` event with actor `SYSTEM` is written. The response is identical either way (no payment enumeration).

## Components

- `complaint-dates.ts` — `addBusinessDays(at, n)` → 23:59:59.999 La Paz on the n-th weekday after `at`'s La Paz date; built on `settlement-dates.ts` helpers.
- `complaint-state.ts` — pure transition table; every service method asks it whether an action is allowed from the current status and refuses otherwise (409).
- `ComplaintsService` — create, track, buyer message, ops actions, merchant reply. Every action writes its `ComplaintEvent` in the same transaction as the change; ops actions also write `AuditLogService` entries.
- `ComplaintMailer` — builds the three buyer emails, the merchant request and the ops digest; a failed send writes `EMAIL_FAILED`, never rolls back the complaint.
- `ComplaintReminderJob` — daily 08:00 La Paz: ops digest + retry of `EMAIL_FAILED` sends not yet followed by `EMAIL_SENT`.
- Attachments through `PrivateFilesService` (same private bucket as KYC photos; production needs `PRIVATE_DOWNLOAD_BUCKET`, already an open item).

## Links into existing surfaces

- Receipt emails (`order-emails`, `store-emails` receipts): a line "¿Problemas con tu compra? Presenta un reclamo" → `/reclamos?ref=<payment intent id>` (prefills the reference). For AI-authored store emails the link is appended by the platform after the authored body, like the existing legal footer.
- Checkout legal notice (`apps/checkout/src/legal-notice.ts`): add the complaints link beside the terms links.
- pagosYaWeb footer: link to `https://checkout.pagosya.bo/reclamos` — edited in place in the owner's working copy, never committed there.

## Edge cases

- Complaint about a FACILITATOR merchant's payment: handled the same; the ops refund action works as for any refund the merchant could make.
- Complaint with no reference and an unknown store: stays unlinked; ops can still answer it. "Ask the merchant" is disabled until linked.
- Buyer files twice for the same payment: both are kept; ops sees "otro reclamo del mismo correo" on each and answers one referencing the other.
- Buyer messages after `ANSWERED`: refused on the tracking page with the second-instance notice instead.
- Merchant replies after ops already answered: refused (409).
- Tracking token lost: the buyer can file again or write to support; no token recovery by email in this sub-project.
- Data retention: complaints and their files are kept with the other legal records (the account-deletion notice already says complaint records are kept) ⚖ period to confirm.

## Rollout

1. Migration (hand-written SQL) + `prisma generate`; applied to the dev DB only at merge, by the owner's call.
2. API module, then ops UI, merchant UI, checkout pages, links.
3. Works in TEST mode the same way (complaints about test payments are flagged "prueba" in ops).

## Testing

- Unit: `addBusinessDays` (weekends, La Paz midnight edges), state transitions (every allowed/refused pair), honeypot, reference matching without enumeration, role checks (`SUPPORT_AGENT` cannot extend/answer/refund), merchant scoping, token hashing, attachment type/size checks, mailer failure path.
- Integration on a throwaway Postgres (`jest.integration.config.js`): 20 concurrent creates → 20 unique consecutive numbers; full journey buyer → ops take → ask merchant → merchant reply → answer → refund leaves the expected event sequence and a refund journal drawn from held funds.
- Front-end unit tests (node --test / vitest per app) for the form validation, tracking view, ops queue ordering and merchant list rendering.

## Legal dependency ⚖

Lawyer to confirm: the 5-business-day deadline and the extension length; the second-instance notice text; the privacy notice on the form; retention period; ASFI's periodic complaint report format.

## Out of scope

- "Reclamar" button inside the buyer app (deferred).
- Automatic payout holds from complaints (sub-project 5).
- Phone or in-person complaint intake (ops can file one on a buyer's behalf later if needed).
- Tamper-evident event log (sub-project 7).
