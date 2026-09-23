# ASFI sub-project 2 — Merchant levels and limits (design)

Date: 2026-09-23
Branch: `feature/asfi-compliance` (worktree, on top of sub-project 1)
Requirement served: ASFI checklist — merchant affiliation (afiliación): know who each merchant is, in proportion to how much they can collect through pagosYa.

Second of seven compliance sub-projects (1 terms, **2 merchant levels/limits**, 3 holdback/reserve/payouts, 4 buyer complaints, 5 merchant monitoring, 6 AML, 7 security before pentest).

## Goal

Let informal merchants (no NIT) go live with verified identity and a low monthly cap, while merchants with a NIT or company documents get higher caps. Enforce the caps at checkout so pagosYa never collects more for a merchant than their verification allows.

## Decisions (approved)

- Amounts are **placeholders editable by ops without a deploy**; the bank's real numbers replace them later.
- Four levels:

  | Level | Name | Evidence | Monthly limit (placeholder) | Per-payment max (placeholder) |
  |---|---|---|---|---|
  | 0 | Sin verificar | none | TEST mode only | — |
  | 1 | Persona | CI front + back, selfie holding CI, bank account in own name | Bs 10.000 | Bs 2.000 |
  | 2 | Negocio | Level 1 data + NIT, legal name, legal representative (today's KYC form) | Bs 100.000 | Bs 20.000 |
  | 3 | Empresa | Level 2 + company documents requested by ops | per merchant (ops) | per merchant (ops) |

- At the limit: **warn at 80%, refuse new live payments at 100%**. Money already collected is never touched.
- Limit window: **calendar month in America/La_Paz**, counting live payments; **refunds do not free room**. Each level also has a **per-payment maximum**.
- Level 1 is **reviewed by ops by hand** (CI photos + selfie), like today's KYC.
- Existing merchants with an approved KYC, or already ACTIVE, become **level 2**; everyone else level 0.
- Enforcement uses a **per-merchant monthly counter with an atomic conditional reservation** at confirm (approach A; rejected: summing payments per confirm — racy; checking after the bank answers — too late).
- TEST mode is never limited.

## Data model (Prisma)

All amounts are minor units (centavos) of BOB, like `PaymentIntent.amount`.

```prisma
model Merchant {
  // ...existing
  level                   Int  @default(0)   // 0..3
  monthlyLimitOverride    Int?               // ops-set; wins over the level policy
  perPaymentLimitOverride Int?
}

// One row per level. Ops-editable; every change is audit-logged.
model MerchantLevelPolicy {
  level           Int      @id           // 0..3
  name            String                 // "Sin verificar", "Persona", ...
  liveEnabled     Boolean                // false for level 0
  monthlyLimit    Int?                   // null = must come from a merchant override
  perPaymentLimit Int?
  updatedAt       DateTime @updatedAt
}

// Single-row settings for the limits feature.
model LimitSettings {
  id           String   @id @default("singleton")
  usdToBobRate Decimal  @db.Decimal(10, 4)   // placeholder 6.96
  updatedAt    DateTime @updatedAt
}

// Running total per merchant per La Paz calendar month.
model MerchantMonthlyVolume {
  merchantId String
  month      String    // "2026-09"
  reserved   Int       @default(0)   // confirms in flight
  settled    Int       @default(0)   // succeeded
  warnedAt   DateTime?               // first 80% email this month
  merchant   Merchant  @relation(fields: [merchantId], references: [id])

  @@id([merchantId, month])
}

model PaymentIntent {
  // ...existing
  limitMonth     String?                     // month reserved in; null = not reserved (TEST)
  limitAmountBob Int?                        // amount counted, after USD conversion
  limitFxRate    Decimal? @db.Decimal(10, 4) // rate used for USD, for audit
}

model MerchantKycSubmission {
  // ...existing
  targetLevel        Int     @default(2)
  taxId              String? // was required; optional for level 1
  legalRepName       String?
  legalRepDocumentId String? // holds the CI number for level 1
  ciFrontDocId       String? // MerchantKycDocument ids; files live in private storage, never public upload URLs
  ciBackDocId        String?
  selfieDocId        String?
}

// Binds each private upload to the merchant who made it, so a submission can't reference someone else's photo.
model MerchantKycDocument {
  id         String          @id @default(cuid())
  merchantId String
  slot       KycDocumentSlot // CI_FRONT | CI_BACK | SELFIE
  storageKey String          @unique
  mimeType   String
  byteSize   Int
  createdAt  DateTime        @default(now())
}
```

Migration:
- Adds the columns (all nullable or defaulted) and tables.
- Inserts the four `MerchantLevelPolicy` rows and the `LimitSettings` row with the placeholders.
- Sets `level = 2` for merchants with an APPROVED KYC submission or `status = ACTIVE` (so nobody already live is locked out); existing submissions keep `targetLevel = 2`. These merchants keep level 2 without CI photos (their approved NIT submission stands); new level 2 submissions require the photos.
- `taxId`, `legalRepName`, `legalRepDocumentId` become nullable in the database; the DTO still requires them when `targetLevel >= 2`.

## Effective limits

`LimitsService.effectiveLimits(merchantId)` returns `{ level, liveEnabled, monthlyLimit, perPaymentLimit }`:
- Override fields on the merchant win over the policy row.
- Missing policy row, or a live-enabled level whose monthly or per-payment limit resolves to null → **fail closed** (no live payments) and raise an ops alert through the existing ops escalation path.
- Level 0 → `liveEnabled = false`. Live mode still also requires `Merchant.status === ACTIVE`, as today; the level adds the amount checks.

## Enforcement flow (live payments only)

1. **Create** (`PaymentIntentsService.createInTransaction`, which store and payment-link checkout paths already call): if the BOB-equivalent amount exceeds `perPaymentLimit`, reject with `per_payment_limit_exceeded` (merchant-facing message: "Este cobro supera el máximo por pago de tu nivel"). Hosted checkout for a store or payment link shows the neutral buyer message instead.
2. **Confirm** (`PaymentIntentsService.confirm`), inside the transaction that records buyer terms, before any rail call:
   - Compute `month` (La Paz) and `amountBob` (USD × `usdToBobRate`, rounded up to the centavo).
   - Upsert the volume row, then run one conditional update:
     `UPDATE "MerchantMonthlyVolume" SET reserved = reserved + $amt WHERE "merchantId" = $m AND month = $mo AND reserved + settled + $amt <= $limit`.
   - 0 rows updated → throw `limit_exceeded`; no rail call is made. Checkout maps it to "Este comercio no puede recibir pagos en este momento." Amounts and limits are never shown to the buyer.
   - Store `limitMonth`, `limitAmountBob`, `limitFxRate` on the payment intent.
   - A retried confirm on an intent that already has `limitMonth` does not reserve again.
3. **Outcome**, wherever the payment intent's status changes (state machine, rail callbacks, webhooks, reconciliation):
   - → `SUCCEEDED`: `reserved -= amt; settled += amt` on the row for `limitMonth`.
   - → `FAILED` or `CANCELED` (expiry ends as CANCELED): `reserved -= amt`.
   - Release happens in the same transaction as the status update and only when the previous status was not terminal, so it runs at most once.
   - `PROCESSING` and `REQUIRES_ACTION` keep the reservation until reconciliation settles them.
4. **Refunds** do not change the counter.
5. **Warning**: after a reservation, if `reserved + settled >= 80%` of the monthly limit and `warnedAt` is null, set `warnedAt` and send one email to the merchant's users.

## Merchant dashboard

- "Tu nivel" card: level name, "Bs X de Y este mes", per-payment max, reset date (1st of next month).
- ≥ 80%: warning banner with "Subir de nivel". ≥ 100%: red banner — live payments paused until the 1st or a level upgrade.
- The upgrade flow asks only for what the next level needs; terms acceptance (sub-project 1) is still required before submitting. Level 3 is a request that ops follows up by hand.
- New endpoint: `GET /dashboard/limits` → level, limits, used this month, reset date.

## Ops

- The KYC queue shows `targetLevel` and the document photos (through the private endpoint) next to the details.
- Approve sets `Merchant.level = targetLevel`; the first approval also sets `status = ACTIVE` (existing behaviour). Reject keeps the current level.
- New endpoints (SUPPORT_ADMIN), all audit-logged:
  - `PATCH /internal/merchants/:id/limits` — set or clear overrides, or set the level directly (e.g. level 3).
  - `GET/PATCH /internal/limits/policies` and `/internal/limits/settings` — edit level amounts and the USD rate.
  - `GET /internal/limits/near-limit` — merchants at ≥ 80% this month.

## Private identity documents

- New `IdentityDocumentsService`, separate from `UploadsService`: the same MIME and size checks (images only), but it writes to a private `kyc/` prefix in S3, or a private folder outside the public upload directory locally, under random keys.
- Storage reuses the existing `PrivateFilesService` (separate private bucket, `PRIVATE_DOWNLOAD_BUCKET`; refuses the public bucket).
- The merchant uploads through `POST /v1/merchants/kyc/documents`, which returns a document id to use in the KYC submission. An id is accepted only if it belongs to that merchant and matches its slot.
- Viewing: `GET /internal/kyc/:submissionId/documents/:slot` — ops only, streams the file, records `kyc.document_viewed` in the audit log.
- Files are never reachable via `/v1/uploads` and are kept after a rejection as evidence.

## Rollout

- One migration as above. The dev seed puts the demo merchant at level 2.
- Before merging, check last month's live volume per merchant and set overrides for anyone close to Bs 100.000 so their payments aren't refused on deploy.

## Testing

- API:
  - Reservation at exactly the limit passes; one centavo over fails.
  - Two concurrent confirms that together exceed the limit: exactly one passes.
  - Each release path (failed, canceled, rail callback, reconciliation) releases once; a repeated transition doesn't release twice.
  - Refunds leave the counter unchanged.
  - Month boundary: 23:59 La Paz on the last day counts in that month.
  - USD conversion uses the stored rate and records it on the payment.
  - Missing policy fails closed; TEST mode is never limited or reserved.
  - Per-payment maximum enforced at create.
  - 80% email sent once per month.
  - Approve sets the level; a level 1 submission without NIT is accepted, a level 2 one without NIT is rejected.
  - Documents: another merchant's key is rejected; viewing is ops-only and audit-logged; not reachable via `/v1/uploads`.
- Checkout: `limit_exceeded` and `per_payment_limit_exceeded` show the neutral message and never amounts.
- Dashboard: level card, 80% and 100% banners, the upgrade form per level.

## Out of scope

- Payout reserve/holdback (sub-project 3).
- Automatic behaviour monitoring and holds (5).
- Sanctions screening and an automatic check that the payout account matches the KYC name (6); ops checks it by eye here.
- Encrypting documents and fields at rest (7).
