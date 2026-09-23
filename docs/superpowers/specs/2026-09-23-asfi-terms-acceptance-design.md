# ASFI sub-project 1 — Terms acceptance (design)

Date: 2026-09-23
Branch: `feature/asfi-compliance` (worktree, based on local `main` @ 5783632)
Requirement served: ASFI checklist item 1, "Términos y Condiciones de Uso de los servicios — constancia de la inclusión en los contratos que la APP suscriba con sus clientes de los puntos establecidos en el Reglamento de la ASFI."

This is the first of seven compliance sub-projects (1 terms, 2 merchant tiers/limits, 3 holdback/reserve/payouts, 4 buyer complaints, 5 merchant monitoring, 6 AML, 7 security before pentest). Each gets its own spec and plan.

## Goal

Produce auditable proof that every merchant and every buyer accepted a specific, immutable text of pagosYa's terms: who, which exact text (by hash), when, and from where. Ship the mechanism now; it activates when the lawyer's text is published.

## Decisions (approved)

- Terms live as immutable, versioned rows in the database with a SHA-256 of the body. Acceptances reference the exact row.
- Merchants: checkbox at web signup (recorded), and the current version is **required** before submitting KYC and before payouts are created. Existing merchants and new versions are prompted in the dashboard. TEST mode is never restricted.
- Buyers: clickwrap-by-action — a notice beside the Pay button with links; the confirm call records the version. No checkbox.
- If no document of a kind has been published and made effective, every gate for that kind is inert.

## Data model (Prisma)

```prisma
enum LegalDocumentKind {
  MERCHANT_TERMS
  BUYER_TERMS
  PRIVACY_POLICY
}

enum TermsAcceptanceSource {
  WEB_SIGNUP
  DASHBOARD
}

// Immutable once created. A text change is a new version, never an update.
model LegalDocument {
  id                   String            @id @default(cuid())
  kind                 LegalDocumentKind
  version              String            // e.g. "2026-10-01"
  title                String
  body                 String            // markdown
  sha256               String            // hex digest of body, computed server-side
  effectiveAt          DateTime          // becomes "current" at this instant
  publishedAt          DateTime          @default(now())
  publishedByOpsUserId String?           // null only for the dev-only draft seed
  publishedByOpsUser   OpsUser?          @relation(fields: [publishedByOpsUserId], references: [id])
  publishedByLabel     String            // "Name <email>" snapshot, like MerchantKycSubmission.reviewedByLabel

  @@unique([kind, version])
  @@index([kind, effectiveAt])
}

// Append-only.
model MerchantTermsAcceptance {
  id             String                @id @default(cuid())
  merchantId     String
  merchant       Merchant              @relation(fields: [merchantId], references: [id])
  merchantUserId String?
  merchantUser   MerchantUser?         @relation(fields: [merchantUserId], references: [id])
  documentId     String
  document       LegalDocument         @relation(fields: [documentId], references: [id])
  source         TermsAcceptanceSource
  ipAddress      String?
  userAgent      String?               // truncated to 512
  acceptedAt     DateTime              @default(now())

  @@unique([merchantId, documentId])
  @@index([merchantId, acceptedAt])
}

// One per PaymentIntent; written on the first confirm that carries a version.
model BuyerTermsAcceptance {
  id                String         @id @default(cuid())
  paymentIntentId   String         @unique
  paymentIntent     PaymentIntent  @relation(fields: [paymentIntentId], references: [id])
  termsDocumentId   String
  termsDocument     LegalDocument  @relation("BuyerTerms", fields: [termsDocumentId], references: [id])
  privacyDocumentId String?
  privacyDocument   LegalDocument? @relation("BuyerPrivacy", fields: [privacyDocumentId], references: [id])
  ipAddress         String?
  userAgent         String?
  acceptedAt        DateTime       @default(now())
}
```

## Rules

- **Current version of a kind** = the row with the greatest `effectiveAt` where `effectiveAt <= now`; ties broken by `publishedAt` desc.
- **Upcoming version** = the earliest row with `effectiveAt > now`. The dashboard shows it (notice period) and lets the merchant accept it early; accepting it satisfies the gate once it becomes current.
- **Merchant has accepted** = a `MerchantTermsAcceptance` exists for the merchant pointing at the current MERCHANT_TERMS document, or at one with a later `effectiveAt`.
- **No current document** → `needsAcceptance = false`; gates pass.
- Publishing: `version` unique per kind (409 otherwise); `effectiveAt` may not be more than 60 seconds in the past (no back-dating); `body` non-empty, max 200 000 chars; `title` max 200; `version` matches `^[A-Za-z0-9._-]{1,40}$`; `sha256` computed by the server. Only `OpsRole.SUPPORT_ADMIN` may publish (403 otherwise). Each publish writes an `AuditLogEntry` (`action: "legal_document.publish"`, `targetType: "LegalDocument"`, metadata: kind, version, sha256, effectiveAt).
- Acceptance endpoints take a `version` string and reject it (400) unless it is the current or upcoming version of that kind — prevents accepting a stale text.
- IP: `request.ip` (Express, honours the existing `TRUST_PROXY` setting). For `WEB_SIGNUP` the API sees the pagosYaWeb server, so the stored IP is that server's. Documented limitation, not engineered around.

## API

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/legal/:kind` | public | Current document of a kind (`merchant-terms`, `buyer-terms`, `privacy-policy`), plus `upcoming` summary. 404 when none current. |
| GET | `/legal/:kind/:version` | public | A specific version (historical links). |
| POST | `/ops/legal-documents` | OpsAuthGuard + SUPPORT_ADMIN | Publish `{ kind, version, title, body, effectiveAt }`. |
| GET | `/ops/legal-documents` | OpsAuthGuard | List all versions (no bodies). |
| GET | `/dashboard/terms` | merchant session | `{ current, upcoming, acceptedVersion, needsAcceptance }` for MERCHANT_TERMS. |
| POST | `/dashboard/terms/accept` | merchant session | `{ version }` → DASHBOARD acceptance. Idempotent per (merchant, document). |
| POST | `/merchants` | public (existing) | New optional `termsVersion`; validated before creating anything (400 if invalid); WEB_SIGNUP acceptance recorded after the merchant is created. |
| POST | `/payment_intents/:id/confirm` | client secret (existing) | New optional `buyerTermsVersion`, `buyerPrivacyVersion`; validated (400 if invalid) and the `BuyerTermsAcceptance` upserted **before** contacting the rail. Absent → no record (custom integrations). |

## Gates

- `KycService.submit` → `BadRequestException("Debes aceptar los Términos y Condiciones vigentes antes de enviar tu verificación")` when `needsAcceptance`.
- `PayoutsService.createDuePayouts` → skips (does not fail) merchants whose `needsAcceptance` is true; balance stays in `MERCHANT_PAYABLE` and is picked up on the next run after acceptance. One warn log per skipped merchant id.
- Nothing else is gated: TEST keys, dashboard access and checkout remain available.

## Module layout

New `apps/api/src/legal/`:
- `legal-documents.service.ts` — publish, current/upcoming lookup, get by version, hashing.
- `terms-acceptance.service.ts` — merchant accept, `merchantTermsStatus(merchantId)`, `needsMerchantAcceptance`, buyer acceptance.
- `legal.controller.ts` (public), `ops-legal-documents.controller.ts`, `dashboard-terms.controller.ts` (guarded like existing dashboard routes).
- `legal.module.ts` exporting `TermsAcceptanceService` and `LegalDocumentsService` to `MerchantsModule` (KYC + signup), `PayoutsModule`, `PaymentIntentsModule`.
- DTOs with class-validator in the existing style.

## Frontends

- **pagosYaWeb** (`/Users/saramia/pagosYaWeb`, branch `feature/asfi-terms`):
  - `/signup`: required checkbox "Acepto los Términos y Condiciones para comercios" linking to `/terminos/comercios`. The page fetches the current version; with none published, no checkbox. The route handler forwards `termsVersion` to `POST /merchants` and rejects a missing acceptance when a version exists.
  - Pages `/terminos/comercios`, `/terminos/compradores`, `/privacidad` render the current markdown with version and effective date; `?version=` shows a past one; friendly empty state when unpublished.
- **merchant-dashboard**: when `needsAcceptance` or an `upcoming` exists, a banner with title, effective date, link to the full text and an **Aceptar** button. The KYC form shows the same prompt inline and stays disabled until accepted.
- **checkout**: under Pay, "Al pagar aceptas los Términos y la Política de privacidad de pagosYa" linking to the pagosYaWeb pages; `confirmPaymentIntent` sends the versions fetched once from `/legal/*`. When no buyer terms are published, the line is hidden and nothing is sent.
- `docs/DEVELOPER_API.md`: document the confirm fields and that custom checkouts must display the notice.

## Placeholder text

The dev seed creates draft MERCHANT_TERMS, BUYER_TERMS and PRIVACY_POLICY titled "BORRADOR — pendiente de revisión legal" (with `publishedByOpsUserId = null`, `publishedByLabel = "seed"`) so the UI can be exercised locally. No code path publishes to production; activation is an ops publish with the lawyer's text.

## Error handling

- Unknown kind → 404. Unknown version → 404 (GET) / 400 (accept, confirm, signup).
- Duplicate publish → 409. Non-admin publish → 403.
- Two confirms for one PaymentIntent → upsert on `paymentIntentId`; first write wins.
- Buyer acceptance is written before the rail call; if the write fails the confirm returns 500 and no rail call happens, so no payment exists without its acceptance when a version was sent.

## Testing

- `legal-documents.service.spec.ts`: current/upcoming across effective dates; none case; hash from body; duplicate 409; back-dating rejected; non-admin 403; audit entry written.
- `terms-acceptance.service.spec.ts`: status with none/old/current/upcoming acceptance; stale version rejected; idempotent accept; buyer upsert first-wins.
- `kyc.service.spec.ts`: submit blocked without current acceptance; allowed when none published.
- `payouts.service.spec.ts`: unaccepted merchant skipped with balance intact; included after acceptance.
- Payment-intents confirm: records acceptance when sent; 400 on unknown version; nothing recorded when omitted.
- pagosYaWeb signup route: forwards `termsVersion`; rejects missing acceptance when a version exists.

## Out of scope

- The legal text itself (lawyer).
- Per-store merchant-to-buyer policies (already exist, unrelated).
- E-signature of a PDF merchant contract; the click record is the evidence for now.
- Emailing merchants about new versions (fits sub-project 5 alerting).
