# ASFI Terms Acceptance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Versioned, immutable pagosYa terms with auditable merchant and buyer acceptance, gating KYC submission and payouts on the current merchant terms.

**Architecture:** New NestJS `legal` module owns three Prisma models (`LegalDocument`, `MerchantTermsAcceptance`, `BuyerTermsAcceptance`) and two services (`LegalDocumentsService` for publishing/lookup, `TermsAcceptanceService` for acceptance/status). Existing KYC, payouts, merchant signup and payment confirm call into it. Frontends (merchant-dashboard, checkout, pagosYaWeb) read `/v1/legal/*` and post acceptances.

**Tech Stack:** NestJS 11, Prisma 5 (PostgreSQL), Jest (api), Vitest (checkout), Playwright (merchant-dashboard), Next.js 16 (pagosYaWeb).

**Spec:** `docs/superpowers/specs/2026-09-23-asfi-terms-acceptance-design.md`

## Global Constraints

- Legal documents are immutable: no update or delete endpoint, ever.
- `sha256` is the lowercase hex SHA-256 of `body` (UTF-8), computed server-side.
- Current = greatest `effectiveAt <= now` (tie: latest `publishedAt`); upcoming = earliest `effectiveAt > now`.
- No current MERCHANT_TERMS → `needsAcceptance = false`; all gates inert.
- Only `OpsRole.SUPPORT_ADMIN` publishes; back-dating tolerance is 60 000 ms.
- `version` matches `^[A-Za-z0-9._-]{1,40}$`; `title` ≤ 200 chars; `body` 1–200 000 chars; `userAgent` stored truncated to 512.
- Route prefixes: public `v1/legal`, dashboard `v1/dashboard/terms`, ops `internal/legal_documents` (matches existing `internal/*` ops controllers).
- URL kind slugs: `merchant-terms`, `buyer-terms`, `privacy-policy`.
- TEST mode, dashboard access and checkout are never blocked.
- User-facing copy is Spanish.

## Review Focus

- Merchant accepted an **upcoming** version that has since become current → counts as accepted (Task 3).
- Merchant accepted an **old** version, a newer one is current → `needsAcceptance = true`, payouts held, KYC blocked (Tasks 3, 5).
- `POST /v1/merchants` with an invalid `termsVersion` → 400 and **no merchant created** (Task 6).
- Two confirms for one PaymentIntent with versions → one `BuyerTermsAcceptance`, no error on the second (Task 6, upsert with empty update).
- No buyer terms published and no version sent → payment proceeds untouched; checkout hides the notice (Tasks 6, 9).

## Tasks (summary — full code lives in the commits)

1. **Schema + migration** — enums `LegalDocumentKind`, `TermsAcceptanceSource`; models `LegalDocument` (`@@unique([kind, version])`), `MerchantTermsAcceptance` (`@@unique([merchantId, documentId])`), `BuyerTermsAcceptance` (`paymentIntentId @unique`); back-relations on `OpsUser`, `Merchant`, `MerchantUser`, `PaymentIntent`. Migration SQL generated with `prisma migrate diff --from-schema-datamodel <HEAD schema> --to-schema-datamodel prisma/schema.prisma --script`; must contain only the new objects.
2. **`LegalDocumentsService`** (`apps/api/src/legal/legal-documents.service.ts`) — `kindFromSlug`, `sha256Hex`, `publish(input, actor, now?)` (403 non-admin, 400 back-dated, 409 on P2002, audit entry `legal_document.publish` in the same transaction), `current`, `upcoming`, `getVersion` (404), `resolveAcceptable` (400 unless current or upcoming), `list` (no bodies). Jest spec first.
3. **`TermsAcceptanceService`** (`terms-acceptance.service.ts`) — `merchantStatus` (accepted if latest accepted doc is the current one or has a later `effectiveAt`), `needsMerchantAcceptance`, `acceptMerchantTerms`, idempotent `recordMerchantAcceptance` (upsert on `merchantId_documentId`, `update: {}`), `resolveBuyerDocuments` (null when no terms version; 400 on privacy-without-terms), `truncateUserAgent`. Jest spec first.
4. **Controllers + module** — `LegalController` (`v1/legal/:kind`, `v1/legal/:kind/:version`), `OpsLegalDocumentsController` (`internal/legal_documents`, GET list + POST publish, OpsAuthGuard), `DashboardTermsController` (`v1/dashboard/terms`, GET status + POST accept, MerchantSessionGuard), DTOs, `requestContext(req)`, `LegalModule` (imports OpsModule, DashboardModule; exports both services), registered in `AppModule`.
5. **Gates** — `KycService` gains `TermsAcceptanceService`; `submit` throws "Debes aceptar los Términos y Condiciones vigentes antes de enviar tu verificación". `PayoutsService` gains it; `createDuePayouts` skips (warn log) merchants needing acceptance. Existing specs pass a stub returning `false`; new tests cover both gates.
6. **Capture at signup and checkout** — `CreateMerchantDto.termsVersion?`; `MerchantsController.create` resolves the version **before** creating the merchant, then records WEB_SIGNUP. `ConfirmPaymentIntentDto.buyerTermsVersion?/buyerPrivacyVersion?`; `PaymentIntentsController.confirm` resolves documents and passes `BuyerTermsRecord` to `PaymentIntentsService.confirm(id, dto, buyerTerms?)`, which upserts `BuyerTermsAcceptance` inside the confirm transaction before any rail call.
7. **Dev seed** — draft `draft-0` documents for all three kinds, titled "BORRADOR — pendiente de revisión legal", skipped in production.
8. **Merchant dashboard** — `#termsPrompt` in `#kycSection` with title, effective date, link to `https://pagosya.bo/terminos/comercios?version=…`, **Aceptar** button; KYC submit disabled while `needsAcceptance`; status loaded with the overview. Playwright spec `tests/terms-acceptance.spec.mjs`.
9. **Checkout** — `src/legal-notice.ts` (`parseBuyerLegal`, `fetchBuyerLegal` never throws, `legalNoticeHtml`, `legalConfirmFields`) with Vitest spec; notice under `#pay`; versions sent on confirm.
10. **pagosYaWeb** (worktree branch `feature/asfi-terms`) — `src/lib/legal.ts`, pages `/terminos/comercios`, `/terminos/compradores`, `/privacidad` (text-block markdown rendering, no raw HTML), signup checkbox when a version exists, route forwards `termsVersion` and rejects a mismatch with 400; sitemap entries. Verified with tsc, lint, build.
11. **Docs + full verification** — `docs/DEVELOPER_API.md` documents the new fields; run api Jest + tsc, checkout Vitest + tsc, dashboard unit + the two Playwright specs.
