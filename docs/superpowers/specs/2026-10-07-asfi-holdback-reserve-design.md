# ASFI sub-project 3 — Payout delay, rolling reserve and daily payouts (design)

Date: 2026-10-07
Branch: `feature/asfi-holdback` (worktree `.claude/worktrees/asfi-holdback`, based on local `main`)
Requirement served: ASFI checklist — *Cobertura de su seguro ante posibles fraudes*: mechanisms that guarantee buyers get their money back if fraud happens; without fraud insurance, the risk-coverage strategy.

Third of seven compliance sub-projects (1 terms, 2 merchant levels/limits, **3 holdback/reserve/payouts**, 4 buyer complaints, 5 merchant monitoring, 6 AML, 7 security before pentest).

## Goal

Keep enough of an aggregator merchant's money inside pagosYa, for long enough, that a buyer refund or a fraud restitution is paid from that merchant's own funds rather than pagosYa's. Make every step a ledger record so the coverage can be shown to the bank.

## Problem today

- `PayoutDeliveryWorker.tick()` runs every 10 s and calls `createDuePayouts()`, which pays out any positive `MERCHANT_PAYABLE` balance. A merchant is paid seconds after a capture.
- `buildRefundJournal` debits `MERCHANT_PAYABLE` whatever the balance. A refund after the money has gone out drives the balance negative: pagosYa fronts the buyer's money.
- `LedgerAccount.RESERVE` exists in the enum and is unused.

Main threat in Bolivia: QR/bank-transfer payments have no card chargebacks, so the risk is a merchant who collects and does not deliver, or disappears before refunding.

## Decisions (approved)

- **Delay + rolling reserve, per verification level** (rejected: reserve only — a new fraudulent merchant still leaves with most of the money on day one; delay only — no protection after day N and worse cash flow). Numbers are **placeholders editable by ops**, next to the level limits:

  | Level | Payout delay | Reserve | Reserve held for |
  |---|---|---|---|
  | 0 | — (no live payments) | — | — |
  | 1 | 7 days | 10% (1000 bps) | 60 days |
  | 2 | 3 days | 5% (500 bps) | 45 days |
  | 3 | 1 day | 0% | 0 days |

- **Payouts once a day**, automatically, at **10:00 America/La_Paz** (rejected: continuous — many small transfers; weekly — bad cash flow for informal merchants).
- **Automatic refund drawdown**: available → pending → reserve → negative available, recovered from future releases (rejected: ops approval for reserve use — refunds stall; never touching the reserve — it then protects nobody).
- **Ops tools in scope**: payout hold, per-merchant overrides, manual reserve seizure. **No early reserve release.**
- **Approach: separate ledger accounts + a release schedule** (rejected: computing holds from capture dates without ledger entries — the reserve would not exist in the ledger, so it cannot be shown to the bank; a mutable balance table — breaks the append-only ledger).
- FACILITATOR merchants are untouched: their funds settle directly, pagosYa never holds them.
- Balances that exist when this ships are treated as **already available**; no retroactive holds.

## Data model (Prisma)

```prisma
enum LedgerAccount {
  // existing values…
  MERCHANT_PENDING   // captured, still inside the payout delay
}

model MerchantLevelPolicy {
  // existing fields…
  payoutDelayDays Int @default(7)
  reserveBps      Int @default(0)   // 0–10000
  reserveDays     Int @default(0)
}

model Merchant {
  // existing fields…
  payoutDelayDaysOverride Int?
  reserveBpsOverride      Int?
  reserveDaysOverride     Int?
  payoutHoldReason        String?    // internal; never shown to the merchant
  payoutHeldAt            DateTime?  // non-null = payouts held
  payoutHeldByLabel       String?    // ops name/email snapshot
  settlementHolds         SettlementHold[]
  reserveSeizures         ReserveSeizure[]
}

enum SettlementHoldStatus {
  PENDING        // inside the delay
  RESERVE_HELD   // delay over, reserve portion still held
  CLOSED         // nothing left to release
}

model SettlementHold {
  id               String               @id @default(cuid())
  merchantId       String
  merchant         Merchant             @relation(fields: [merchantId], references: [id])
  transactionId    String               @unique
  currency         String
  netAmount        Int                  // merchant net credited to PENDING at capture
  pendingAmount    Int                  // still in PENDING (reduced by refund drawdown)
  reserveAmount    Int                  // reserve portion: planned while PENDING, held while RESERVE_HELD
  availableAt      DateTime
  reserveReleaseAt DateTime
  status           SettlementHoldStatus @default(PENDING)
  delayDays        Int                  // policy snapshot at capture
  reserveBps       Int
  reserveDays      Int
  createdAt        DateTime             @default(now())
  updatedAt        DateTime             @updatedAt

  @@index([status, availableAt])
  @@index([status, reserveReleaseAt])
  @@index([merchantId, currency, status])
}

model ReserveSeizure {
  id                String   @id @default(cuid())
  merchantId        String
  merchant          Merchant @relation(fields: [merchantId], references: [id])
  amount            Int
  currency          String
  reason            String
  externalReference String   // e.g. the bank transfer that paid the buyer
  opsUserId         String
  opsLabel          String   // name/email snapshot
  ledgerGroupId     String
  createdAt         DateTime @default(now())

  @@index([merchantId, createdAt])
}
```

Migration seeds the placeholder policy numbers above on the existing level rows. Reserve amount = `floor(net × reserveBps / 10000)` — rounding favours the merchant. `reserveAmount` is fixed at capture from the snapshot, so later policy edits never change an existing hold.

## Ledger flows (AGGREGATOR only; every event is one balanced journal)

| Event | Lines |
|---|---|
| Capture | As today, but the merchant net is **CREDIT MERCHANT_PENDING** (was MERCHANT_PAYABLE). FACILITATOR capture unchanged. |
| Delay ends | DEBIT PENDING `pendingAmount`; CREDIT PAYABLE `pendingAmount − reserve`; CREDIT RESERVE `reserve`, where `reserve = min(reserveAmount, pendingAmount)` |
| Reserve date | DEBIT RESERVE `reserveAmount`; CREDIT PAYABLE `reserveAmount` |
| Refund | DEBIT, in order, PAYABLE up to the available balance (if positive), PENDING, RESERVE, then PAYABLE for any remainder; DEBIT PAGOSYA_FEE_REVENUE fee; CREDIT RAIL_CLEARING amount |
| Payout | Unchanged: DEBIT PAYABLE; CREDIT RAIL_CLEARING |
| Reserve seizure | DEBIT RESERVE; CREDIT RAIL_CLEARING |

Balances per merchant and currency: **pending** = PENDING, **available** = PAYABLE (may be negative), **reserve** = RESERVE, **owed** = sum of the three. A negative available balance is repaid automatically because each release credits PAYABLE before the next payout reads it.

Invariant kept: for every hold, `pendingAmount` equals its unreleased share of PENDING, and the sum of `reserveAmount` over `RESERVE_HELD` holds equals the merchant's RESERVE balance in that currency.

## Components

New module `apps/api/src/settlement/`, following `limits/` and `legal/`.

### `SettlementPolicyService.resolve(merchantId)`
Returns `{ delayDays, reserveBps, reserveDays }`: each field is the merchant override if non-null, else the level policy's value. If the level has no policy row, it fails closed to a strict fallback (`30 days, 1000 bps, 90 days`) and logs an error. A capture never fails because of policy resolution — the buyer has already paid.

### `SettlementHoldService`
- `createForCapture(tx, { merchantId, transactionId, currency, netAmount, capturedAt })` — called **inside the capture transaction** in `PaymentIntentsService` right after the capture journal is posted, for AGGREGATOR merchants only. Writes the hold with the policy snapshot.
- `releaseDue(now)` — for each hold due (`PENDING` with `availableAt ≤ now`, or `RESERVE_HELD` with `reserveReleaseAt ≤ now`), in its own transaction: take the merchant's advisory lock, re-read the hold, post the journal, update amounts and status. On the delay stage the hold's `reserveAmount` is set to the actually moved `min(reserveAmount, pendingAmount)` and `pendingAmount` to 0; if that reserve is 0 the hold goes straight to `CLOSED`, else to `RESERVE_HELD`. Idempotent: an already-moved hold is skipped, so a repeated run or a catch-up after downtime does nothing extra.
- `drawdownForRefund(tx, { merchantId, transactionId, currency, net })` — returns the merchant-side debit lines in drawdown order and decrements hold rows. Pending is taken from the refunded transaction's own hold first, then other `PENDING` holds oldest-first; reserve is taken from `RESERVE_HELD` holds oldest-first. A `PENDING` hold whose `pendingAmount` reaches 0 becomes `CLOSED` (its planned reserve was never moved, so nothing is left); a `RESERVE_HELD` hold whose `reserveAmount` reaches 0 becomes `CLOSED`. `RefundsService` uses these lines in place of the single MERCHANT_PAYABLE debit for AGGREGATOR merchants; fee and RAIL_CLEARING lines stay as in `buildRefundJournal`.
- `seize(actor, merchantId, { amount, currency, reason, externalReference })` — admin only; `amount ≤ RESERVE balance` in that currency, taken from `RESERVE_HELD` holds oldest-first; writes `ReserveSeizure`, the journal, and an audit-log entry in one transaction.

### Locking
`releaseDue`, `drawdownForRefund` and `seize` take `pg_advisory_xact_lock(hashtext('settlement:' || merchantId))` inside their transaction, so a refund and the daily release can never spend the same pending money.

### Timing (America/La_Paz)
- `availableAt` = 00:00 La Paz on the calendar day `capturedAt + delayDays`; `reserveReleaseAt` = 00:00 La Paz on `capturedAt + reserveDays` (never earlier than `availableAt`). Example: level 2, captured Monday 15:00 → available Thursday 00:00 → paid in Thursday's 10:00 batch.
- Calendar days, not business days.

### Daily job
`@Cron('0 10 * * *', { timeZone: 'America/La_Paz' })` on a new `SettlementDailyJob`: `releaseDue(now)` then `PayoutsService.createDuePayouts()`. `PayoutDeliveryWorker.tick()` stops calling `createDuePayouts()` and only delivers/retries existing Payout rows.

### `PayoutsService.createDuePayouts()` changes
- Skips merchants with `payoutHeldAt` set, logging the merchant id (not the reason).
- Pays only a positive `MERCHANT_PAYABLE` balance (unchanged query), so a negative balance pays nothing.
- Keeps the terms-acceptance, approved-KYC and one-in-flight checks.

## Ops (apps/ops, Spanish; every change audit-logged in the same transaction via `AuditLogService`)

- **Policies table** in the limits workspace: three columns (demora, reserva %, días de reserva), saved through the existing `PATCH internal/limits/policies/:level` (extended DTO, admin only).
- **"Fondos" card** on the merchant detail: pending / available / reserve per currency, next release dates, negative available highlighted; overrides form; hold control; seizure form with a confirm step.
- **"Pagos retenidos"** list: merchants on hold, who placed it, when.

Endpoints (`internal/`, `OpsAuthGuard`):

| Endpoint | Who | Purpose |
|---|---|---|
| `GET merchants/:id/settlement` | any ops | balances + upcoming releases |
| `PATCH merchants/:id/settlement` | SUPPORT_ADMIN | overrides (null clears) |
| `POST merchants/:id/payout_hold` | any ops | place hold; `reason` required |
| `DELETE merchants/:id/payout_hold` | SUPPORT_ADMIN | lift hold |
| `POST merchants/:id/reserve_seizures` | SUPPORT_ADMIN | seize reserve |
| `GET payout_holds` | any ops | merchants on hold |

Audit actions: `settlement.overrides_updated`, `settlement.hold_placed`, `settlement.hold_lifted`, `settlement.reserve_seized`, plus the existing `limits.policy_updated` for policy columns.

## Merchant dashboard

- `GET v1/merchants/balance` keeps `payableBalance`, `currency` and `balances[].payableBalance` (existing clients) and adds per currency `available`, `pending`, `reserve`, `nextPayoutAt` (next 10:00 La Paz batch if available > 0 and not held, else null), plus top-level `payoutsHeld: boolean`.
- `GET v1/merchants/settlement/schedule` — the effective policy and upcoming releases grouped by La Paz date for the next 60 days (`{ date, currency, toAvailable, fromReserve }`).
- Balance cards show *Disponible / En espera / Reserva* and "Próximo pago: hoy 10:00".
- Panel **"Cuándo recibes tu dinero"**: the policy in plain words ("Nivel 1: tus ventas están disponibles a los 7 días; guardamos el 10% por 60 días como reserva de protección."), the release schedule, and a line that the next level shortens it.
- When held: banner "Tus pagos están en pausa. Escríbenos a soporte." and one email to the merchant's users when the hold is placed. The internal reason is never sent to the merchant.

## Legal dependency

The merchant terms must disclose the delay, the reserve and the drawdown order. After deploy, ops publishes a new merchant terms version through sub-project 1; until a merchant accepts it, the existing terms check already holds their payouts. Deliverable from this sub-project: a draft Spanish clause for the lawyer (text approval is the owner's).

## Edge cases

- **Shipping**: `shippingCollectedJournal` is not posted anywhere yet (shipments are "Phase 2"). Out of scope; a comment on the function records that, when wired for AGGREGATOR captures, it must debit MERCHANT_PENDING and reduce that capture's hold. Shipment adjustments and cancellation fees stay on PAYABLE (charges to the merchant; may drive it negative).
- Partial and repeated refunds use the same drawdown.
- Refund after its own hold is `CLOSED`: drawdown starts at available.
- Refund larger than everything owed: PAYABLE goes negative.
- Currencies are never mixed in holds, drawdown or payouts.
- Level or override changes apply to new captures only; no early release when a merchant moves up.
- Merchants that are not `ACTIVE`: holds keep releasing on schedule, nothing is paid out (existing check); seizure still allowed.
- Refund between the 10:00 batch and disbursement: PAYABLE can go negative; recovered from later releases; logged.
- Missed daily run: next run releases everything due.

## Rollout

1. Migration: enum value, columns, two tables, seeded placeholders. Applied to the dev DB by the main session with `prisma migrate dev` — subagents never run prisma migrate/diff/reset on the dev DB.
2. Existing PAYABLE balances stay available; no holds created for past captures.
3. Ops publishes the new merchant terms version once the lawyer approves the clause.
4. Production: confirm placeholder numbers with the bank; the bank disbursement adapter remains the mock.

## Testing

- Unit: policy resolution incl. fail-closed fallback; La Paz day-boundary math for `availableAt`/`reserveReleaseAt`; `releaseDue` stages, zero-reserve close, idempotency, catch-up; every drawdown branch (available only, into pending own-hold-first, into reserve, negative); seizure cap; `createDuePayouts` skipping held and negative merchants; worker no longer creating payouts.
- Ledger invariant test: scripted capture → release → refund → seizure → reserve release → payout; every journal balances and PENDING + PAYABLE + RESERVE equals the expected owed amount, hold rows match ledger balances.
- Controller: role rules (any ops places a hold; only admin lifts, seizes, sets overrides); reason required; merchant endpoints never expose `payoutHoldReason`.
- Playwright: ops "Fondos" card and holds list; merchant balance cards and schedule panel, alongside the existing `apps/ops/tests` and dashboard specs.

## Out of scope

- Automatic holds from complaints or risk patterns (sub-project 5).
- Public buyer complaints channel (4).
- Early reserve release.
- A real bank disbursement adapter.
- Business-day calendars and bank holidays.
- Lawyer-approved terms text; the written risk-coverage policy for the bank (drafted after the build).
