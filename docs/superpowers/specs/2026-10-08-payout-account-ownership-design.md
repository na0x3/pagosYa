# Payout account ownership check (design)

Date: 2026-10-08
Branch: `feature/asfi-program` (worktree `.claude/worktrees/asfi-program`)
Why: an outside review of the fraud/AML document flagged that pagosYa records a merchant's payout bank account but never confirms it belongs to the verified person or company. It is first in the new build order (before AML screening and merchant monitoring).

## Goal

No payout ever goes to a bank account until a pagosYa staff member has seen proof that the account belongs to the verified person or company. When an account changes, the merchant's users are warned at once, payouts stop until the new proof is approved, and a 3-day wait after approval gives the real owner time to object.

## Decisions (approved)

- **Proof:** a bank certificate (certificado de cuenta) **or** a screenshot of the bank's app, showing the account holder's full name and the account number (rejected: certificate only — slows informal sellers; test deposit — proves control, not name, and needs arbitrary small transfers).
- **Whose name:** level 1 → the CI holder; level 2–3 → the company's legal name; exception: a sole proprietorship (empresa unipersonal) may use the owner's own name if that person is the verified legal representative, ticked by ops with a written reason (rejected: always company only; company or representative always).
- **Changes:** every verified merchant user is emailed when a change is requested; payouts stop until ops approve the new proof; after approval of a *change*, payouts resume 72 hours later; a merchant's *first* account has no wait (rejected: no wait; 7-day wait).
- **Account entry:** three fields — bank from a fixed list, account number (digits), holder name as on the proof (rejected: keep the free-text box).
- **Model:** a separate `PayoutAccount` record with its own review lifecycle (rejected: fields on the identity submission — every bank change would need a full re-verification).
- **Currency:** bolivianos only. International payments are switched off (`INTERNATIONAL_PAYMENTS_ENABLED`, commit 51039a80), so no USD payouts; a USD account gets the same check when international payments return.
- **Existing merchants:** no real money has moved, so no grandfathering: every merchant must add a proven account before their next payout.

## Merchant journey

### First account (with identity verification)

The identity form (dashboard → Cumplimiento) replaces the free-text "Cuenta bancaria a tu nombre" box with:
- **Banco** — a select from `BOLIVIAN_BANKS` (code + name, kept in code).
- **Número de cuenta** — digits only after removing spaces and dashes, 6–20 digits.
- **Titular** — the holder's name as it appears on the proof, 3–120 characters.
- **Comprobante** — one JPG, PNG or PDF up to 5 MB, checked by its bytes, stored in the private bucket.

Submitting the form creates the identity submission and a `PayoutAccount` (`PENDING_REVIEW`, `isChange: false`) linked to it.

### Changing the account (Desembolsos page)

"Cambiar cuenta" opens the same four fields. Sending them:
1. creates a `PayoutAccount` (`PENDING_REVIEW`, `isChange: true`); refused with "Ya tienes un cambio de cuenta en revisión" if one is already waiting;
2. emails every verified merchant user: "Pidieron cambiar la cuenta bancaria donde recibes tus desembolsos de pagosYa. Si no fuiste tú, escríbenos de inmediato." (no account digits beyond the last 4);
3. stops payouts at once; sales keep accruing.

### What the balance card says

| Situation | Line under the balance |
| --- | --- |
| No approved account | Agrega tu cuenta bancaria con un comprobante para recibir desembolsos. |
| An account (first or change) waiting for review | Estamos revisando tu cuenta bancaria. |
| Change approved, inside the 72 hours | Tu nueva cuenta recibe desembolsos desde el {dd/mm/aaaa hh:mm}. |
| Last change rejected | Tu cambio de cuenta no fue aprobado: {motivo}. (the old account keeps paying) |

These are new `PayoutBlocker` codes (`account_missing`, `account_review`, `account_waiting`) plus a rejection note on the account panel; the existing `held`, `terms`, `in_flight` keep their order of precedence (held → terms → kyc → account_* → in_flight).

## Ops journey

- **First account:** shown in the identity review card next to the CI photos (proof opened through a fetch with the ops token; every opening audit-logged as `payout_account.proof_viewed`). Identity and account are two separate decisions; any ops reviewer may decide a first account.
- **Changes:** a new "Cuentas por revisar" queue in the ops console, oldest first. Approving a change requires `SUPPORT_ADMIN`.
- **Expected name** shown beside the proof: level 1 → the submission's legal name (the CI holder); level 2–3 → the legal name (razón social); the legal representative's name is shown too for the sole-proprietorship case.
- **Approve** requires three ticks — `nameMatches`, `numberMatches`, `bankMatches` — and an owner type: `PERSON` (level 1), `COMPANY`, or `SOLE_PROPRIETOR` (level 2–3 only, with a reason of at least 8 characters). The API refuses an approval missing any tick, a level-1 account typed `COMPANY`/`SOLE_PROPRIETOR`, or a sole proprietorship without a reason.
- **On approval:** status `APPROVED`, reviewer and label snapshot stored, `payableFrom` = approval time (first account) or approval + 72 h (change); the previously approved BOB account becomes `REPLACED` in the same transaction; the merchant is emailed the date payouts resume.
- **On rejection** (reason required, 8+ characters): status `REJECTED`; a first account leaves payouts paused; a rejected change leaves the previous approved account in force; the merchant is emailed the reason. Ops can still place a payout hold if the change looks like an attack.
- Every decision is audit-logged (`payout_account.approved` / `.rejected`) with the ticks, owner type, reason and actor, in the same transaction as the change.

## Data model (Prisma; hand-written migration, not applied to the dev DB until merge)

```prisma
enum PayoutAccountStatus { PENDING_REVIEW APPROVED REJECTED REPLACED }
enum PayoutAccountOwner { PERSON COMPANY SOLE_PROPRIETOR }

model PayoutAccount {
  id                  String               @id @default(cuid())
  merchantId          String
  merchant            Merchant             @relation(fields: [merchantId], references: [id])
  currency            String               @default("BOB")
  bankCode            String
  accountNumber       String
  holderName          String
  proofStorageKey     String
  proofFileName       String
  proofContentType    String
  status              PayoutAccountStatus  @default(PENDING_REVIEW)
  isChange            Boolean              @default(false)
  ownerType           PayoutAccountOwner?
  checks              Json?                // { nameMatches, numberMatches, bankMatches }
  reviewNote          String?
  reviewedAt          DateTime?
  reviewedByOpsUserId String?
  reviewedByOpsUser   OpsUser?             @relation(fields: [reviewedByOpsUserId], references: [id])
  reviewedByLabel     String?
  payableFrom         DateTime?
  kycSubmissionId     String?
  kycSubmission       MerchantKycSubmission? @relation(fields: [kycSubmissionId], references: [id])
  createdAt           DateTime             @default(now())

  @@index([merchantId, currency, status])
}
```

`Payout` gains `payoutAccountId String?` (FK, set null on delete) beside today's `bankAccount` text snapshot, which becomes `"{bank name} {account number} — {holder}"`.

One waiting account per merchant and currency is enforced in code under the merchant's settlement lock (no partial unique index: Prisma cannot express it and the lock already serialises writes).

## Payout eligibility

`PayoutsService.checkPayout` (BOB) stops reading `MerchantKycSubmission.payoutBankAccount` and instead:
1. `held`, `terms`, `kyc` as today;
2. a `PENDING_REVIEW` account for the merchant and currency → `account_review`;
3. no `APPROVED` account → `account_missing`;
4. `APPROVED` with `payableFrom > now` → `account_waiting`;
5. `in_flight` as today;
6. otherwise pay to that account, recording `payoutAccountId`.

`nextPayoutAt` in the balance endpoint follows the same rule (it already calls `payoutBlocker`). USD balances keep `no_account` while international payments are off.

## Components

- `payout-accounts/bolivian-banks.ts` — `BOLIVIAN_BANKS: { code, name }[]`; ops confirm the list before launch.
- `payout-accounts/payout-account-rules.ts` — pure: normalise the account number, expected-name rule per level, approval validation (ticks, owner type vs level, sole-proprietor reason), `payableFromFor(isChange, approvedAt)`.
- `PayoutAccountsService` — create (first/with KYC, change), list for merchant, review queue, approve, reject, proof download; emails through `EMAIL_PROVIDER`.
- Controllers: merchant `v1/dashboard/payout_accounts` (session guard), ops `internal/payout_accounts`.
- `KycService.submit` — takes the three fields + proof instead of the free-text account; writes the legacy text column for old readers.
- `PayoutsService` — eligibility above; payout rows get `payoutAccountId`.
- Dashboard: identity form fields, Desembolsos "Cambiar cuenta", blocker labels in `settlement.mjs`. Ops: account block in the identity review, "Cuentas por revisar" queue.

## Edge cases

- A merchant sends a change, then sends the identity form to move up a level: the identity form's account fields are prefilled from the waiting change and do not create a second waiting account.
- Ops reject the first account while approving the identity: the merchant is ACTIVE (live payments allowed, limits apply) but payouts stay paused with `account_missing` until a new proof is approved.
- A change approved while a payout is already on its way: the in-flight payout keeps its account (it was approved at creation); the next one uses the new account after 72 h.
- Facilitator merchants: unaffected (no payouts through pagosYa).

## Testing

- Unit: `payout-account-rules` (number normalisation, expected name per level, every approval refusal, `payableFrom`), `PayoutsService.checkPayout` for each new blocker and the precedence order, service approve/reject (replacement, rejected change keeps old account, admin-only change approval, audit in the same transaction, emails), proof upload checks, one-waiting-account refusal.
- Integration (throwaway Postgres): request a change → daily batch skips → approve → batch skips within 72 h → batch pays the new account and the payout row links it; a rejected change keeps paying the old account.
- Dashboard e2e (port 4397 config): identity form fields; change form; each balance line. Ops e2e: queue, ticks required, admin-only approve of a change.

## Out of scope

- USD account check (returns with international payments).
- Automatic name matching or bank APIs.
- Notifying the bank of a suspected account takeover.
