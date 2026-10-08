# ASFI Buyer Complaints Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Any buyer can file a complaint about a payment on a public page, gets a case number and a 5-business-day deadline, and receives pagosYa's written answer; ops works the queue, asks the merchant, refunds or pauses payouts; every step is recorded.

**Architecture:** A new NestJS module `apps/api/src/complaints` with pure helpers (dates, state table, files, token, email texts), three services (buyer intake, ops actions, merchant replies), a mailer that records every send, and a daily reminder job. Four Prisma tables via a hand-written migration. Three front-ends gain a surface: checkout `/reclamos` pages (TypeScript + vitest), an ops "Reclamos" section (single `index.html` + Playwright with mocked API), and a merchant-dashboard "Reclamos" panel (`.mjs` + `node --test`).

**Tech Stack:** NestJS 10, Prisma 5 (PostgreSQL), class-validator DTOs, `@nestjs/throttler`, `@nestjs/schedule`, Multer (`FilesInterceptor`), Jest (unit + `jest.integration.config.js` on throwaway DBs), Vite/vitest (checkout), Playwright (ops), node:test (merchant dashboard).

**Spec:** `docs/superpowers/specs/2026-10-08-asfi-buyer-complaints-design.md`

**Deviations from the spec (decided while planning, from the code):**
- API paths follow the repo's conventions: public `v1/complaints…` (like `v1/legal`), ops `internal/complaints…` (like `internal/support`), merchant `v1/dashboard/complaints…` (like `v1/dashboard/terms`).
- The tracking token is **signed** (`base64url(id).HMAC`, like `consumer/order-tracking-token.ts`) instead of a stored random-token hash, so a failed "received" email can be re-sent with its link. `trackingTokenHash` is dropped from the model.
- `ComplaintEvent` gains `meta Json?` (email kind, late flag, refund id). `Complaint` gains no other fields.
- The merchant sees a complaint only once ops has asked them (`merchantDueAt` not null).

## Global Constraints

- Work only in the worktree `/Users/saramia/pagosYa/.claude/worktrees/asfi-program` on branch `feature/asfi-program`.
- **Never run `prisma migrate dev|deploy|diff|reset|push|pull|resolve` or any DB write against the dev DB (localhost:54329/pagosya).** Schema changes are hand-written SQL + `npx prisma generate` only. Integration tests (`npx jest --config jest.integration.config.js …`) create and drop their own `pagosya_it_*` databases and are allowed.
- The owner's machine overheats: run Jest with `--runInBand` and prefix heavy commands with `nice`.
- Every buyer- and merchant-facing string is Spanish (Bolivia). Every string a buyer, merchant or ops user typed is escaped before it reaches HTML.
- Business days = Monday–Friday in America/La_Paz (UTC-4), holidays not excluded. Answer due = +5 business days; merchant reply due = +2; one extension of +5.
- Case number format `R-{YYYY}-{NNNNNN}` (La Paz year, 6-digit zero-padded, per-year counter).
- Attachments: JPG, PNG, PDF only (checked by magic bytes), ≤ 5 MB each, ≤ 3 per message.
- Public rate limits: create 5/hour/IP, tracking endpoints 30/hour/IP.
- `SUPPORT_ADMIN` only: extend, answer, refund. Any ops user: take, link, note, ask merchant, pause payouts.
- Texts marked ⚖ in the spec stay as written here; the lawyer reviews them later.
- Commit after each task with a conventional message (`feat(complaints): …`, `test(complaints): …`).

## Review Focus

1. **A buyer files with a reference that belongs to someone else's payment, or a made-up one** — the response must be identical either way (no way to probe which payment ids exist). Pinned in Task 5 (`create` returns the same shape and no merchant/payment data in both cases).
2. **Two buyers submit in the same instant** — they must get different, consecutive case numbers. Pinned in Task 10 (20 concurrent creates on real Postgres).
3. **A CSV export opened in Excel with a description starting with `=`, `+`, `-` or `@`** — the cell must not run as a formula. Pinned in Task 4 (`toCsv` prefixes such cells with `'`).
4. **A merchant opens or replies to a complaint of another merchant, or one ops never sent them** — 404, never the data. Pinned in Task 8.
5. **The email provider is down when the complaint is filed** — the complaint is saved, the buyer still sees the number, `EMAIL_FAILED` is recorded and the morning job re-sends with a working tracking link. Pinned in Task 4 (mailer) and Task 9 (retry).

---

## File Structure

API (`apps/api/src/complaints/`):
- `complaint-dates.ts` — `addBusinessDays`, `businessDaysBetween`, `complaintYear`.
- `complaint-state.ts` — `ComplaintAction`, `canDo`, `nextStatus`, `assertCan`.
- `complaint-files.ts` — magic-byte check, limits, safe file names.
- `complaint-token.ts` — signed tracking token create/read.
- `complaint-number.ts` — `nextComplaintNumber(tx, now)`.
- `complaint-events.ts` — `recordComplaintEvent(db, complaintId, event)`.
- `complaint-emails.ts` — pure builders for every email text.
- `complaint-csv.ts` — `toCsv(rows)` with formula-injection guard.
- `complaint-mailer.ts` — `ComplaintMailer` (send + record, never throws).
- `complaint-intake.service.ts` — buyer create / track / message / attachment.
- `complaint-ops.service.ts` — ops queue, detail and actions, export.
- `complaint-merchant.service.ts` — merchant list / detail / reply / attachment.
- `complaint-reminder.job.ts` — 08:00 La Paz digest + email retry.
- `complaint-links.ts` — receipt link helpers.
- `public-complaints.controller.ts`, `ops-complaints.controller.ts`, `dashboard-complaints.controller.ts`.
- `dto/create-complaint.dto.ts`, `dto/buyer-message.dto.ts`, `dto/ops-complaint.dto.ts`, `dto/merchant-reply.dto.ts`.
- `complaints.module.ts`.
- Tests: one `*.spec.ts` beside each unit; `complaints.integration.spec.ts`.

Modified API files: `prisma/schema.prisma`, new `prisma/migrations/20261008120000_asfi_buyer_complaints/migration.sql`, `app.module.ts`, `settlement/settlement.module.ts` (export `SettlementAdminService`), `payment-intents/payment-intents.service.ts` (receipt link).

Checkout (`apps/checkout/src/complaints/`): `complaints-form.ts` (pure), `complaints-form.test.ts`, `complaints-page.ts`, `complaints-page.css`; modify `main.ts`, `legal-notice.ts`, `legal-notice.test.ts`.

Ops (`apps/ops/`): modify `index.html`; create `tests/ops-complaints.spec.mjs`.

Merchant dashboard (`apps/merchant-dashboard/`): `src/complaints.mjs` (pure), `src/complaints.test.mjs`, `src/complaints-panel.mjs`; modify `index.html`, `src/dashboard.js`, `server.mjs`.

pagosYaWeb (owner's working copy, edit in place, **never commit, never run pnpm**): footer link.

---

### Task 1: Schema and migration

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20261008120000_asfi_buyer_complaints/migration.sql`

**Interfaces:**
- Produces: Prisma models `Complaint`, `ComplaintEvent`, `ComplaintAttachment`, `ComplaintCounter`; enums `ComplaintStatus`, `ComplaintCategory`, `ComplaintRequest`, `ComplaintOutcome`, `ComplaintActor`, `ComplaintEventType`. Back-relations `PaymentIntent.complaints`, `Merchant.complaints`, `OpsUser.assignedComplaints`.

- [ ] **Step 1: Add the models to `schema.prisma`** (append after the `SupportCaseNote` model):

```prisma
enum ComplaintStatus {
  RECEIVED
  IN_REVIEW
  WAITING_MERCHANT
  ANSWERED
}

enum ComplaintCategory {
  NOT_DELIVERED
  NOT_AS_DESCRIBED
  UNRECOGNIZED_CHARGE
  DUPLICATE_CHARGE
  REFUND_NOT_RECEIVED
  OTHER
}

enum ComplaintRequest {
  REFUND
  DELIVERY
  OTHER
}

enum ComplaintOutcome {
  UPHELD
  PARTIALLY_UPHELD
  NOT_UPHELD
}

enum ComplaintActor {
  BUYER
  OPS
  MERCHANT
  SYSTEM
}

enum ComplaintEventType {
  RECEIVED
  EMAIL_CONFIRMED
  BUYER_MESSAGE
  TAKEN
  LINKED
  NOTE
  MERCHANT_ASKED
  MERCHANT_REPLIED
  EXTENDED
  ANSWERED
  REFUNDED
  PAYOUTS_PAUSED
  EMAIL_SENT
  EMAIL_FAILED
}

// ASFI sub-project 4: a buyer complaint pagosYa registers, investigates and answers.
model Complaint {
  id                String                @id @default(cuid())
  number            String                @unique
  status            ComplaintStatus       @default(RECEIVED)
  category          ComplaintCategory
  request           ComplaintRequest
  buyerName         String
  buyerEmail        String
  buyerPhone        String?
  referenceGiven    String?
  storeNameGiven    String?
  paymentIntentId   String?
  paymentIntent     PaymentIntent?        @relation(fields: [paymentIntentId], references: [id])
  merchantId        String?
  merchant          Merchant?             @relation(fields: [merchantId], references: [id])
  description       String
  outcome           ComplaintOutcome?
  answer            String?
  assignedOpsUserId String?
  assignedOpsUser   OpsUser?              @relation("ComplaintAssignee", fields: [assignedOpsUserId], references: [id])
  receivedAt        DateTime              @default(now())
  dueAt             DateTime
  extendedAt        DateTime?
  extensionReason   String?
  merchantDueAt     DateTime?
  emailConfirmedAt  DateTime?
  answeredAt        DateTime?
  events            ComplaintEvent[]
  attachments       ComplaintAttachment[]

  @@index([status, dueAt])
  @@index([merchantId, receivedAt])
  @@index([buyerEmail])
}

// Append-only: the code never updates or deletes a row (sub-project 7 makes it tamper-evident).
model ComplaintEvent {
  id          String                @id @default(cuid())
  complaintId String
  complaint   Complaint             @relation(fields: [complaintId], references: [id], onDelete: Restrict)
  type        ComplaintEventType
  actor       ComplaintActor
  actorId     String?
  body        String?
  meta        Json?
  createdAt   DateTime              @default(now())
  attachments ComplaintAttachment[]

  @@index([complaintId, createdAt])
  @@index([type, createdAt])
}

model ComplaintAttachment {
  id          String          @id @default(cuid())
  complaintId String
  complaint   Complaint       @relation(fields: [complaintId], references: [id], onDelete: Restrict)
  eventId     String?
  event       ComplaintEvent? @relation(fields: [eventId], references: [id])
  uploadedBy  ComplaintActor
  storageKey  String
  fileName    String
  contentType String
  sizeBytes   Int
  createdAt   DateTime        @default(now())

  @@index([complaintId])
}

model ComplaintCounter {
  year Int @id
  last Int
}
```

Add the back-relations inside the existing models:
- `model PaymentIntent { … complaints Complaint[] }`
- `model Merchant { … complaints Complaint[] }`
- `model OpsUser { … assignedComplaints Complaint[] @relation("ComplaintAssignee") }`

- [ ] **Step 2: Write the migration SQL** at `apps/api/prisma/migrations/20261008120000_asfi_buyer_complaints/migration.sql`:

```sql
-- ASFI sub-project 4: buyer complaints.
CREATE TYPE "ComplaintStatus" AS ENUM ('RECEIVED', 'IN_REVIEW', 'WAITING_MERCHANT', 'ANSWERED');
CREATE TYPE "ComplaintCategory" AS ENUM ('NOT_DELIVERED', 'NOT_AS_DESCRIBED', 'UNRECOGNIZED_CHARGE', 'DUPLICATE_CHARGE', 'REFUND_NOT_RECEIVED', 'OTHER');
CREATE TYPE "ComplaintRequest" AS ENUM ('REFUND', 'DELIVERY', 'OTHER');
CREATE TYPE "ComplaintOutcome" AS ENUM ('UPHELD', 'PARTIALLY_UPHELD', 'NOT_UPHELD');
CREATE TYPE "ComplaintActor" AS ENUM ('BUYER', 'OPS', 'MERCHANT', 'SYSTEM');
CREATE TYPE "ComplaintEventType" AS ENUM ('RECEIVED', 'EMAIL_CONFIRMED', 'BUYER_MESSAGE', 'TAKEN', 'LINKED', 'NOTE', 'MERCHANT_ASKED', 'MERCHANT_REPLIED', 'EXTENDED', 'ANSWERED', 'REFUNDED', 'PAYOUTS_PAUSED', 'EMAIL_SENT', 'EMAIL_FAILED');

CREATE TABLE "Complaint" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "status" "ComplaintStatus" NOT NULL DEFAULT 'RECEIVED',
    "category" "ComplaintCategory" NOT NULL,
    "request" "ComplaintRequest" NOT NULL,
    "buyerName" TEXT NOT NULL,
    "buyerEmail" TEXT NOT NULL,
    "buyerPhone" TEXT,
    "referenceGiven" TEXT,
    "storeNameGiven" TEXT,
    "paymentIntentId" TEXT,
    "merchantId" TEXT,
    "description" TEXT NOT NULL,
    "outcome" "ComplaintOutcome",
    "answer" TEXT,
    "assignedOpsUserId" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "extendedAt" TIMESTAMP(3),
    "extensionReason" TEXT,
    "merchantDueAt" TIMESTAMP(3),
    "emailConfirmedAt" TIMESTAMP(3),
    "answeredAt" TIMESTAMP(3),
    CONSTRAINT "Complaint_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ComplaintEvent" (
    "id" TEXT NOT NULL,
    "complaintId" TEXT NOT NULL,
    "type" "ComplaintEventType" NOT NULL,
    "actor" "ComplaintActor" NOT NULL,
    "actorId" TEXT,
    "body" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ComplaintEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ComplaintAttachment" (
    "id" TEXT NOT NULL,
    "complaintId" TEXT NOT NULL,
    "eventId" TEXT,
    "uploadedBy" "ComplaintActor" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ComplaintAttachment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ComplaintCounter" (
    "year" INTEGER NOT NULL,
    "last" INTEGER NOT NULL,
    CONSTRAINT "ComplaintCounter_pkey" PRIMARY KEY ("year")
);

CREATE UNIQUE INDEX "Complaint_number_key" ON "Complaint"("number");
CREATE INDEX "Complaint_status_dueAt_idx" ON "Complaint"("status", "dueAt");
CREATE INDEX "Complaint_merchantId_receivedAt_idx" ON "Complaint"("merchantId", "receivedAt");
CREATE INDEX "Complaint_buyerEmail_idx" ON "Complaint"("buyerEmail");
CREATE INDEX "ComplaintEvent_complaintId_createdAt_idx" ON "ComplaintEvent"("complaintId", "createdAt");
CREATE INDEX "ComplaintEvent_type_createdAt_idx" ON "ComplaintEvent"("type", "createdAt");
CREATE INDEX "ComplaintAttachment_complaintId_idx" ON "ComplaintAttachment"("complaintId");

ALTER TABLE "Complaint" ADD CONSTRAINT "Complaint_paymentIntentId_fkey" FOREIGN KEY ("paymentIntentId") REFERENCES "PaymentIntent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Complaint" ADD CONSTRAINT "Complaint_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Complaint" ADD CONSTRAINT "Complaint_assignedOpsUserId_fkey" FOREIGN KEY ("assignedOpsUserId") REFERENCES "OpsUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ComplaintEvent" ADD CONSTRAINT "ComplaintEvent_complaintId_fkey" FOREIGN KEY ("complaintId") REFERENCES "Complaint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ComplaintAttachment" ADD CONSTRAINT "ComplaintAttachment_complaintId_fkey" FOREIGN KEY ("complaintId") REFERENCES "Complaint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ComplaintAttachment" ADD CONSTRAINT "ComplaintAttachment_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "ComplaintEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

- [ ] **Step 3: Validate and generate** (no database touched)

Run: `cd apps/api && npx prisma validate && npx prisma generate`
Expected: "The schema … is valid" and "Generated Prisma Client".

- [ ] **Step 4: Type-check**

Run: `cd apps/api && nice npx tsc --noEmit -p tsconfig.json; echo exit $?`
Expected: `exit 0`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20261008120000_asfi_buyer_complaints
git commit -m "feat(complaints): schema for buyer complaints, their history, attachments and yearly case numbers"
```

The migration is applied to real Postgres for the first time by Task 10's integration test. The main session (never a subagent) then checks schema/migration drift against that throwaway database.

---

### Task 2: Business-day dates and the state table

**Files:**
- Create: `apps/api/src/complaints/complaint-dates.ts`, `complaint-dates.spec.ts`, `complaint-state.ts`, `complaint-state.spec.ts`

**Interfaces:**
- Consumes: `laPazDayStart(at, days)`, `laPazDateKey(at)` from `apps/api/src/settlement/settlement-dates.ts`.
- Produces:
  - `ANSWER_BUSINESS_DAYS = 5`, `MERCHANT_BUSINESS_DAYS = 2`, `EXTENSION_BUSINESS_DAYS = 5`
  - `addBusinessDays(at: Date, n: number): Date`
  - `businessDaysBetween(from: Date, to: Date): number`
  - `complaintYear(at: Date): number`
  - `type ComplaintAction = "take" | "link" | "note" | "askMerchant" | "merchantReply" | "extend" | "answer" | "buyerMessage" | "refund" | "pausePayouts"`
  - `canDo(action: ComplaintAction, status: ComplaintStatus): boolean`
  - `nextStatus(action: ComplaintAction, status: ComplaintStatus): ComplaintStatus`
  - `assertCan(action: ComplaintAction, status: ComplaintStatus): void` (throws `ConflictException` with Spanish message)

- [ ] **Step 1: Write the failing date tests** (`complaint-dates.spec.ts`)

```ts
import { addBusinessDays, businessDaysBetween, complaintYear } from "./complaint-dates";

// 2026-10-08 is a Thursday. La Paz is UTC-4.
describe("addBusinessDays", () => {
  it("ends at 23:59:59.999 La Paz on the 5th weekday after a Thursday", () => {
    expect(addBusinessDays(new Date("2026-10-08T19:00:00Z"), 5).toISOString()).toBe("2026-10-16T03:59:59.999Z"); // Thu 15 Oct
  });
  it("starts counting on Monday for a complaint filed on Saturday", () => {
    expect(addBusinessDays(new Date("2026-10-10T15:00:00Z"), 5).toISOString()).toBe("2026-10-17T03:59:59.999Z"); // Fri 16 Oct
  });
  it("uses the La Paz date, not the UTC date, near midnight", () => {
    // 03:30Z on the 8th is 23:30 Wednesday the 7th in La Paz.
    expect(addBusinessDays(new Date("2026-10-08T03:30:00Z"), 5).toISOString()).toBe("2026-10-15T03:59:59.999Z"); // Wed 14 Oct
  });
  it("gives the merchant two business days", () => {
    expect(addBusinessDays(new Date("2026-10-08T19:00:00Z"), 2).toISOString()).toBe("2026-10-13T03:59:59.999Z"); // Mon 12 Oct
  });
});

describe("businessDaysBetween", () => {
  it("counts weekdays after the first day up to the last", () => {
    expect(businessDaysBetween(new Date("2026-10-08T19:00:00Z"), new Date("2026-10-08T22:00:00Z"))).toBe(0);
    expect(businessDaysBetween(new Date("2026-10-08T19:00:00Z"), new Date("2026-10-12T14:00:00Z"))).toBe(2);
    expect(businessDaysBetween(new Date("2026-10-08T19:00:00Z"), new Date("2026-10-15T20:00:00Z"))).toBe(5);
  });
});

describe("complaintYear", () => {
  it("is the La Paz year", () => {
    expect(complaintYear(new Date("2027-01-01T02:00:00Z"))).toBe(2026);
    expect(complaintYear(new Date("2027-01-01T05:00:00Z"))).toBe(2027);
  });
});
```

- [ ] **Step 2: Run, expect failure**

Run: `cd apps/api && nice npx jest src/complaints/complaint-dates.spec.ts --runInBand`
Expected: FAIL — "Cannot find module './complaint-dates'".

- [ ] **Step 3: Implement `complaint-dates.ts`**

```ts
import { laPazDateKey, laPazDayStart } from "../settlement/settlement-dates";

/** ASFI first-instance deadlines (⚖ lawyer to confirm). Business days are Mon–Fri; holidays are not skipped, so a
 * deadline can only fall earlier than the regulator's, never later. */
export const ANSWER_BUSINESS_DAYS = 5;
export const MERCHANT_BUSINESS_DAYS = 2;
export const EXTENSION_BUSINESS_DAYS = 5;

function isWeekday(dayStart: Date): boolean {
  const weekday = new Date(`${laPazDateKey(dayStart)}T00:00:00Z`).getUTCDay();
  return weekday !== 0 && weekday !== 6;
}

/** 23:59:59.999 La Paz on the n-th weekday after `at`'s La Paz date. */
export function addBusinessDays(at: Date, n: number): Date {
  let day = 0;
  let counted = 0;
  while (counted < n) {
    day += 1;
    if (isWeekday(laPazDayStart(at, day))) counted += 1;
  }
  return new Date(laPazDayStart(at, day + 1).getTime() - 1);
}

/** Weekdays after `from`'s La Paz date, up to and including `to`'s. */
export function businessDaysBetween(from: Date, to: Date): number {
  let count = 0;
  for (let day = 1; laPazDayStart(from, day).getTime() <= to.getTime(); day += 1) {
    if (isWeekday(laPazDayStart(from, day))) count += 1;
  }
  return count;
}

export function complaintYear(at: Date): number {
  return Number(laPazDateKey(at).slice(0, 4));
}
```

- [ ] **Step 4: Run, expect pass**

Run: `cd apps/api && nice npx jest src/complaints/complaint-dates.spec.ts --runInBand`
Expected: PASS (6 tests).

- [ ] **Step 5: Write the failing state tests** (`complaint-state.spec.ts`)

```ts
import { ComplaintStatus } from "@prisma/client";
import { ConflictException } from "@nestjs/common";
import { assertCan, canDo, nextStatus, type ComplaintAction } from "./complaint-state";

const { RECEIVED, IN_REVIEW, WAITING_MERCHANT, ANSWERED } = ComplaintStatus;
const ALL = [RECEIVED, IN_REVIEW, WAITING_MERCHANT, ANSWERED];

const allowed: Record<ComplaintAction, ComplaintStatus[]> = {
  take: [RECEIVED, IN_REVIEW, WAITING_MERCHANT],
  link: [RECEIVED, IN_REVIEW, WAITING_MERCHANT],
  note: ALL,
  askMerchant: [IN_REVIEW],
  merchantReply: [WAITING_MERCHANT],
  extend: [RECEIVED, IN_REVIEW, WAITING_MERCHANT],
  answer: [IN_REVIEW, WAITING_MERCHANT],
  buyerMessage: [RECEIVED, IN_REVIEW, WAITING_MERCHANT],
  refund: ALL,
  pausePayouts: ALL,
};

describe("complaint state table", () => {
  for (const [action, statuses] of Object.entries(allowed) as [ComplaintAction, ComplaintStatus[]][]) {
    for (const status of ALL) {
      it(`${action} from ${status} is ${statuses.includes(status) ? "allowed" : "refused"}`, () => {
        expect(canDo(action, status)).toBe(statuses.includes(status));
      });
    }
  }

  it("moves through the journey", () => {
    expect(nextStatus("take", RECEIVED)).toBe(IN_REVIEW);
    expect(nextStatus("take", WAITING_MERCHANT)).toBe(WAITING_MERCHANT);
    expect(nextStatus("askMerchant", IN_REVIEW)).toBe(WAITING_MERCHANT);
    expect(nextStatus("merchantReply", WAITING_MERCHANT)).toBe(IN_REVIEW);
    expect(nextStatus("answer", WAITING_MERCHANT)).toBe(ANSWERED);
    expect(nextStatus("note", ANSWERED)).toBe(ANSWERED);
  });

  it("refuses with a 409 in Spanish", () => {
    expect(() => assertCan("answer", ANSWERED)).toThrow(ConflictException);
    expect(() => assertCan("answer", ANSWERED)).toThrow("Este reclamo ya fue respondido.");
    expect(() => assertCan("merchantReply", IN_REVIEW)).toThrow("No hay una consulta pendiente para el comercio.");
  });
});
```

- [ ] **Step 6: Run, expect failure** — `nice npx jest src/complaints/complaint-state.spec.ts --runInBand` → FAIL (module missing).

- [ ] **Step 7: Implement `complaint-state.ts`**

```ts
import { ConflictException } from "@nestjs/common";
import { ComplaintStatus } from "@prisma/client";

const { RECEIVED, IN_REVIEW, WAITING_MERCHANT, ANSWERED } = ComplaintStatus;
const OPEN = [RECEIVED, IN_REVIEW, WAITING_MERCHANT];
const ALL = [...OPEN, ANSWERED];

export type ComplaintAction =
  | "take" | "link" | "note" | "askMerchant" | "merchantReply" | "extend" | "answer" | "buyerMessage" | "refund" | "pausePayouts";

const RULES: Record<ComplaintAction, { from: ComplaintStatus[]; to?: (from: ComplaintStatus) => ComplaintStatus }> = {
  take: { from: OPEN, to: (from) => (from === RECEIVED ? IN_REVIEW : from) },
  link: { from: OPEN },
  note: { from: ALL },
  askMerchant: { from: [IN_REVIEW], to: () => WAITING_MERCHANT },
  merchantReply: { from: [WAITING_MERCHANT], to: () => IN_REVIEW },
  extend: { from: OPEN },
  answer: { from: [IN_REVIEW, WAITING_MERCHANT], to: () => ANSWERED },
  buyerMessage: { from: OPEN },
  refund: { from: ALL },
  pausePayouts: { from: ALL },
};

export function canDo(action: ComplaintAction, status: ComplaintStatus): boolean {
  return RULES[action].from.includes(status);
}

export function nextStatus(action: ComplaintAction, status: ComplaintStatus): ComplaintStatus {
  return RULES[action].to?.(status) ?? status;
}

export function assertCan(action: ComplaintAction, status: ComplaintStatus): void {
  if (canDo(action, status)) return;
  if (status === ANSWERED) throw new ConflictException("Este reclamo ya fue respondido.");
  if (action === "merchantReply") throw new ConflictException("No hay una consulta pendiente para el comercio.");
  if (action === "askMerchant") throw new ConflictException("Toma el reclamo antes de consultar al comercio.");
  if (action === "answer") throw new ConflictException("Toma el reclamo antes de responderlo.");
  throw new ConflictException("Esta acción no está disponible en el estado actual del reclamo.");
}
```

- [ ] **Step 8: Run both suites, expect pass** — `nice npx jest src/complaints --runInBand` → PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/complaints/complaint-dates.ts apps/api/src/complaints/complaint-dates.spec.ts apps/api/src/complaints/complaint-state.ts apps/api/src/complaints/complaint-state.spec.ts
git commit -m "feat(complaints): business-day deadlines in La Paz time and the complaint state table"
```

---

### Task 3: Files, tracking token, case numbers, events

**Files:**
- Create: `apps/api/src/complaints/complaint-files.ts`, `complaint-files.spec.ts`, `complaint-token.ts`, `complaint-token.spec.ts`, `complaint-number.ts`, `complaint-number.spec.ts`, `complaint-events.ts`

**Interfaces:**
- Consumes: `complaintYear` (Task 2).
- Produces:
  - `MAX_COMPLAINT_FILES = 3`, `MAX_COMPLAINT_FILE_BYTES = 5_000_000`
  - `type UploadedComplaintFile = { originalname: string; mimetype: string; size: number; buffer: Buffer }`
  - `type CheckedComplaintFile = UploadedComplaintFile & { contentType: "image/jpeg" | "image/png" | "application/pdf" }`
  - `sniffComplaintFileType(buffer: Buffer): CheckedComplaintFile["contentType"] | null`
  - `checkComplaintFiles(files: UploadedComplaintFile[] | undefined): CheckedComplaintFile[]` (throws `BadRequestException`)
  - `safeFileName(name: string): string`
  - `createComplaintToken(complaintId: string, secret: string): string`
  - `readComplaintToken(token: string, secret: string): string | null`
  - `formatComplaintNumber(year: number, n: number): string`
  - `nextComplaintNumber(tx: Prisma.TransactionClient, now: Date): Promise<string>`
  - `type ComplaintEventInput = { type: ComplaintEventType; actor: ComplaintActor; actorId?: string | null; body?: string | null; meta?: Prisma.InputJsonValue }`
  - `recordComplaintEvent(db: Prisma.TransactionClient | PrismaClient, complaintId: string, event: ComplaintEventInput): Promise<ComplaintEvent>`

- [ ] **Step 1: Write failing tests** (`complaint-files.spec.ts`)

```ts
import { BadRequestException } from "@nestjs/common";
import { checkComplaintFiles, safeFileName, sniffComplaintFileType } from "./complaint-files";

const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]);
const pdf = Buffer.from("%PDF-1.7\n");
const file = (buffer: Buffer, over = {}) => ({ originalname: "foto.jpg", mimetype: "image/jpeg", size: buffer.length, buffer, ...over });

describe("complaint files", () => {
  it("recognises JPG, PNG and PDF by their bytes, whatever the declared type", () => {
    expect(sniffComplaintFileType(jpg)).toBe("image/jpeg");
    expect(sniffComplaintFileType(png)).toBe("image/png");
    expect(sniffComplaintFileType(pdf)).toBe("application/pdf");
    expect(sniffComplaintFileType(Buffer.from("<svg/>"))).toBeNull();
  });

  it("returns the sniffed type, not the declared one", () => {
    expect(checkComplaintFiles([file(pdf, { mimetype: "image/jpeg" })])[0].contentType).toBe("application/pdf");
  });

  it("accepts none", () => {
    expect(checkComplaintFiles(undefined)).toEqual([]);
  });

  it("refuses more than 3 files, a file over 5 MB and any other type", () => {
    expect(() => checkComplaintFiles([file(jpg), file(jpg), file(jpg), file(jpg)])).toThrow("Puedes adjuntar hasta 3 archivos.");
    expect(() => checkComplaintFiles([file(jpg, { size: 5_000_001 })])).toThrow("Cada archivo puede pesar hasta 5 MB.");
    expect(() => checkComplaintFiles([file(Buffer.from("GIF89a"))])).toThrow(BadRequestException);
  });

  it("keeps file names printable and short", () => {
    expect(safeFileName("../../etc/passwd")).toBe(".._.._etc_passwd");
    expect(safeFileName("recibo <script>.pdf")).toBe("recibo _script_.pdf");
    expect(safeFileName("")).toBe("archivo");
    expect(safeFileName("a".repeat(300)).length).toBe(120);
  });
});
```

`complaint-token.spec.ts`:

```ts
import { createComplaintToken, readComplaintToken } from "./complaint-token";
import { createOrderTrackingToken } from "../consumer/order-tracking-token";

describe("complaint tracking token", () => {
  const id = "cmg1abcdefghijklmnopqrstu";
  it("round-trips", () => {
    expect(readComplaintToken(createComplaintToken(id, "s3cret"), "s3cret")).toBe(id);
  });
  it("rejects another secret, a tampered id and junk", () => {
    const token = createComplaintToken(id, "s3cret");
    expect(readComplaintToken(token, "other")).toBeNull();
    const [, sig] = token.split(".");
    expect(readComplaintToken(`${Buffer.from("cmg1zzzzzzzzzzzzzzzzzzzzz").toString("base64url")}.${sig}`, "s3cret")).toBeNull();
    expect(readComplaintToken("nope", "s3cret")).toBeNull();
    expect(readComplaintToken("a.b.c", "s3cret")).toBeNull();
  });
  it("is not interchangeable with an order tracking token for the same id", () => {
    expect(createComplaintToken(id, "s3cret")).not.toBe(createOrderTrackingToken(id, "s3cret"));
  });
});
```

`complaint-number.spec.ts`:

```ts
import { formatComplaintNumber, nextComplaintNumber } from "./complaint-number";

describe("complaint numbers", () => {
  it("formats R-YYYY-NNNNNN", () => {
    expect(formatComplaintNumber(2026, 123)).toBe("R-2026-000123");
  });
  it("takes the next number for the La Paz year in one statement", async () => {
    const tx = { $queryRaw: jest.fn().mockResolvedValue([{ last: 7 }]) };
    await expect(nextComplaintNumber(tx as any, new Date("2027-01-01T02:00:00Z"))).resolves.toBe("R-2026-000007");
    const sql = (tx.$queryRaw.mock.calls[0][0] as TemplateStringsArray).join("?");
    expect(sql).toContain("ON CONFLICT");
    expect(tx.$queryRaw.mock.calls[0][1]).toBe(2026);
  });
});
```

- [ ] **Step 2: Run, expect failure** — `nice npx jest src/complaints --runInBand` → FAIL (modules missing).

- [ ] **Step 3: Implement**

`complaint-files.ts`:

```ts
import { BadRequestException } from "@nestjs/common";

export const MAX_COMPLAINT_FILES = 3;
export const MAX_COMPLAINT_FILE_BYTES = 5_000_000;

export type UploadedComplaintFile = { originalname: string; mimetype: string; size: number; buffer: Buffer };
export type CheckedComplaintFile = UploadedComplaintFile & { contentType: "image/jpeg" | "image/png" | "application/pdf" };

const SIGNATURES: Array<{ type: CheckedComplaintFile["contentType"]; bytes: number[] }> = [
  { type: "image/jpeg", bytes: [0xff, 0xd8, 0xff] },
  { type: "image/png", bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { type: "application/pdf", bytes: [0x25, 0x50, 0x44, 0x46, 0x2d] },
];

export function sniffComplaintFileType(buffer: Buffer): CheckedComplaintFile["contentType"] | null {
  return SIGNATURES.find(({ bytes }) => buffer.length >= bytes.length && bytes.every((byte, i) => buffer[i] === byte))?.type ?? null;
}

/** The declared mimetype is ignored: only the bytes decide, so a renamed SVG or HTML file never reaches ops. */
export function checkComplaintFiles(files: UploadedComplaintFile[] | undefined): CheckedComplaintFile[] {
  const list = files ?? [];
  if (list.length > MAX_COMPLAINT_FILES) throw new BadRequestException(`Puedes adjuntar hasta ${MAX_COMPLAINT_FILES} archivos.`);
  return list.map((file) => {
    if (file.size > MAX_COMPLAINT_FILE_BYTES) throw new BadRequestException("Cada archivo puede pesar hasta 5 MB.");
    const contentType = sniffComplaintFileType(file.buffer);
    if (!contentType) throw new BadRequestException("Solo se aceptan fotos JPG o PNG y archivos PDF.");
    return { ...file, contentType };
  });
}

export function safeFileName(name: string): string {
  return name.replace(/[^\w.\- ]+/g, "_").slice(0, 120) || "archivo";
}
```

`complaint-token.ts`:

```ts
import { createHmac, timingSafeEqual } from "node:crypto";

// Signed rather than stored, so a "received" email that failed can be re-sent with its link. Domain-separated from
// order tracking tokens, which sign the bare id with the same secret.
const signature = (complaintId: string, secret: string) => createHmac("sha256", secret).update(`complaint:${complaintId}`).digest();

export function createComplaintToken(complaintId: string, secret: string): string {
  return `${Buffer.from(complaintId, "utf8").toString("base64url")}.${signature(complaintId, secret).toString("base64url")}`;
}

export function readComplaintToken(token: string, secret: string): string | null {
  const [encodedId, encodedSignature, ...rest] = token.split(".");
  if (!encodedId || !encodedSignature || rest.length) return null;
  const complaintId = Buffer.from(encodedId, "base64url").toString("utf8");
  if (!/^c[a-z0-9]{20,40}$/i.test(complaintId)) return null;
  const supplied = Buffer.from(encodedSignature, "base64url");
  const expected = signature(complaintId, secret);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected) ? complaintId : null;
}
```

`complaint-number.ts`:

```ts
import { Prisma } from "@prisma/client";
import { complaintYear } from "./complaint-dates";

export function formatComplaintNumber(year: number, n: number): string {
  return `R-${year}-${String(n).padStart(6, "0")}`;
}

/** One atomic upsert: concurrent filings each get their own number, and a rolled-back filing gives its number back. */
export async function nextComplaintNumber(tx: Prisma.TransactionClient, now: Date): Promise<string> {
  const year = complaintYear(now);
  const [row] = await tx.$queryRaw<{ last: number }[]>`
    INSERT INTO "ComplaintCounter" ("year", "last") VALUES (${year}, 1)
    ON CONFLICT ("year") DO UPDATE SET "last" = "ComplaintCounter"."last" + 1
    RETURNING "last"`;
  return formatComplaintNumber(year, Number(row.last));
}
```

`complaint-events.ts`:

```ts
import { ComplaintActor, ComplaintEventType, Prisma, PrismaClient } from "@prisma/client";

export type ComplaintEventInput = {
  type: ComplaintEventType;
  actor: ComplaintActor;
  actorId?: string | null;
  body?: string | null;
  meta?: Prisma.InputJsonValue;
};

/** The only way complaint history is written. Rows are never updated or deleted. */
export function recordComplaintEvent(db: Prisma.TransactionClient | PrismaClient, complaintId: string, event: ComplaintEventInput) {
  return db.complaintEvent.create({
    data: {
      complaintId,
      type: event.type,
      actor: event.actor,
      actorId: event.actorId ?? null,
      body: event.body ?? null,
      ...(event.meta !== undefined ? { meta: event.meta } : {}),
    },
  });
}
```

- [ ] **Step 4: Run, expect pass** — `nice npx jest src/complaints --runInBand` → PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/complaints
git commit -m "feat(complaints): attachment checks by file bytes, signed tracking links, yearly case numbers and the history writer"
```

---

### Task 4: Email texts, CSV, mailer

**Files:**
- Create: `apps/api/src/complaints/complaint-emails.ts`, `complaint-emails.spec.ts`, `complaint-csv.ts`, `complaint-csv.spec.ts`, `complaint-mailer.ts`, `complaint-mailer.spec.ts`

**Interfaces:**
- Consumes: `recordComplaintEvent` (Task 3), `createComplaintToken` (Task 3), `EMAIL_PROVIDER`/`EmailProvider` (`apps/api/src/dashboard/tokens`, `…/interfaces/email-provider.interface`), config keys `app.checkoutOrigin`, `app.merchantDashboardOrigin`, `app.orderTrackingSecret`.
- Produces:
  - `type ComplaintEmailKind = "RECEIVED" | "EXTENDED" | "ANSWERED" | "MERCHANT_ASKED"`
  - `SECOND_INSTANCE_NOTICE(number: string): string`
  - `buyerEmail(kind: "RECEIVED" | "EXTENDED" | "ANSWERED", c: BuyerEmailFacts): { subject: string; body: string }` where `BuyerEmailFacts = { number: string; buyerName: string; dueAt: Date; trackingUrl: string; extensionReason?: string | null; outcome?: ComplaintOutcome | null; answer?: string | null }`
  - `merchantAskedEmail(f: { number: string; question: string; merchantDueAt: Date; dashboardUrl: string }): { subject: string; body: string }`
  - `opsDigestEmail(items: Array<{ number: string; dueAt: Date; overdue: boolean; merchantName: string | null }>): { subject: string; body: string }`
  - `laPazDateLabel(at: Date): string`
  - `toCsv(rows: Array<Record<string, string | number | null>>, columns: string[]): string`
  - `ComplaintMailer.trackingUrl(complaintId: string): string`
  - `ComplaintMailer.send(kind: ComplaintEmailKind, complaintId: string): Promise<boolean>` — never throws; records `EMAIL_SENT` or `EMAIL_FAILED` with `meta: { kind, to }`
  - `ComplaintMailer.sendOpsDigest(items): Promise<void>`

- [ ] **Step 1: Write failing tests**

`complaint-emails.spec.ts`:

```ts
import { ComplaintOutcome } from "@prisma/client";
import { buyerEmail, laPazDateLabel, merchantAskedEmail, opsDigestEmail } from "./complaint-emails";

const facts = { number: "R-2026-000123", buyerName: "Ana", dueAt: new Date("2026-10-16T03:59:59.999Z"), trackingUrl: "https://checkout.pagosya.bo/reclamos/s/tok" };
const DUE_LABEL = laPazDateLabel(facts.dueAt);

describe("complaint emails", () => {
  it("dates in La Paz, in Spanish", () => {
    expect(DUE_LABEL).toContain("15 de octubre de 2026");
    expect(DUE_LABEL.toLowerCase()).toContain("jueves");
  });

  it("confirms receipt with the number, the deadline and the tracking link", () => {
    const { subject, body } = buyerEmail("RECEIVED", facts);
    expect(subject).toBe("Recibimos tu reclamo R-2026-000123");
    expect(body).toContain(DUE_LABEL);
    expect(body).toContain(facts.trackingUrl);
  });

  it("explains an extension with its reason", () => {
    expect(buyerEmail("EXTENDED", { ...facts, extensionReason: "Esperamos al banco." }).body).toContain("Esperamos al banco.");
  });

  it("ends every answer with the ASFI second-instance notice", () => {
    const { subject, body } = buyerEmail("ANSWERED", { ...facts, outcome: ComplaintOutcome.UPHELD, answer: "Te devolvimos el dinero." });
    expect(subject).toBe("Respuesta a tu reclamo R-2026-000123");
    expect(body).toContain("Te devolvimos el dinero.");
    expect(body).toContain("Resultado: a tu favor");
    expect(body.trim().endsWith("www.asfi.gob.bo.")).toBe(true);
  });

  it("asks the merchant with the question and the reply-by date", () => {
    const merchantDueAt = new Date("2026-10-13T03:59:59.999Z");
    const { body } = merchantAskedEmail({ number: "R-2026-000123", question: "¿Enviaste el pedido?", merchantDueAt, dashboardUrl: "https://comercios.pagosya.bo/#dashboard-complaints" });
    expect(body).toContain("¿Enviaste el pedido?");
    expect(body).toContain(laPazDateLabel(merchantDueAt));
  });

  it("lists overdue complaints first in the ops digest", () => {
    const { body } = opsDigestEmail([
      { number: "R-2026-000002", dueAt: new Date("2026-10-16T03:59:59.999Z"), overdue: false, merchantName: "Tienda" },
      { number: "R-2026-000001", dueAt: new Date("2026-10-08T03:59:59.999Z"), overdue: true, merchantName: null },
    ]);
    expect(body.indexOf("R-2026-000001")).toBeLessThan(body.indexOf("R-2026-000002"));
    expect(body).toContain("VENCIDO");
  });
});
```

`complaint-csv.spec.ts`:

```ts
import { toCsv } from "./complaint-csv";

describe("toCsv", () => {
  it("quotes and escapes cells", () => {
    expect(toCsv([{ a: 'dijo "hola", y se fue', b: 3 }], ["a", "b"])).toBe('a,b\r\n"dijo ""hola"", y se fue",3\r\n');
  });
  it("defuses spreadsheet formulas", () => {
    expect(toCsv([{ a: "=HYPERLINK(\"x\")" }, { a: "+1" }, { a: "-2" }, { a: "@SUM(A1)" }], ["a"])).toBe(
      "a\r\n\"'=HYPERLINK(\"\"x\"\")\"\r\n'+1\r\n'-2\r\n'@SUM(A1)\r\n",
    );
  });
  it("writes null as empty", () => {
    expect(toCsv([{ a: null }], ["a"])).toBe("a\r\n\r\n");
  });
});
```

`complaint-mailer.spec.ts`:

```ts
import { ComplaintActor, ComplaintEventType } from "@prisma/client";
import { ComplaintMailer } from "./complaint-mailer";

const complaint = { id: "cmg1abcdefghijklmnopqrstu", number: "R-2026-000123", buyerName: "Ana", buyerEmail: "ana@example.com", dueAt: new Date("2026-10-16T03:59:59.999Z"), extensionReason: null, outcome: null, answer: null, merchantId: null, merchantDueAt: null };
const config = { get: (key: string) => ({ "app.checkoutOrigin": "https://checkout.pagosya.bo", "app.merchantDashboardOrigin": "https://comercios.pagosya.bo", "app.orderTrackingSecret": "s" } as Record<string, string>)[key] };

function setup(send: jest.Mock) {
  const prisma: any = {
    complaint: { findUnique: jest.fn().mockResolvedValue(complaint) },
    complaintEvent: { create: jest.fn().mockResolvedValue({}), findFirst: jest.fn().mockResolvedValue(null) },
    merchantUser: { findMany: jest.fn().mockResolvedValue([]) },
  };
  return { prisma, mailer: new ComplaintMailer(prisma, { send } as any, config as any) };
}

describe("ComplaintMailer", () => {
  it("sends loudly and records EMAIL_SENT", async () => {
    const send = jest.fn().mockResolvedValue(undefined);
    const { prisma, mailer } = setup(send);
    await expect(mailer.send("RECEIVED", complaint.id)).resolves.toBe(true);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ to: "ana@example.com", failLoudly: true, idempotencyKey: `complaint-${complaint.id}-RECEIVED` }));
    expect(send.mock.calls[0][0].body).toContain("https://checkout.pagosya.bo/reclamos/s/");
    expect(prisma.complaintEvent.create).toHaveBeenCalledWith({ data: expect.objectContaining({ type: ComplaintEventType.EMAIL_SENT, actor: ComplaintActor.SYSTEM, meta: { kind: "RECEIVED", to: "ana@example.com" } }) });
  });

  it("records EMAIL_FAILED and never throws when delivery fails", async () => {
    const { prisma, mailer } = setup(jest.fn().mockRejectedValue(new Error("Resend down")));
    jest.spyOn((mailer as any).logger, "warn").mockImplementation(() => undefined);
    await expect(mailer.send("RECEIVED", complaint.id)).resolves.toBe(false);
    expect(prisma.complaintEvent.create).toHaveBeenCalledWith({ data: expect.objectContaining({ type: ComplaintEventType.EMAIL_FAILED, body: "Resend down" }) });
  });
});
```

- [ ] **Step 2: Run, expect failure** — `nice npx jest src/complaints --runInBand` → FAIL (modules missing).

- [ ] **Step 3: Implement `complaint-emails.ts`**

```ts
import { ComplaintOutcome } from "@prisma/client";

export type ComplaintEmailKind = "RECEIVED" | "EXTENDED" | "ANSWERED" | "MERCHANT_ASKED";

export type BuyerEmailFacts = {
  number: string;
  buyerName: string;
  dueAt: Date;
  trackingUrl: string;
  extensionReason?: string | null;
  outcome?: ComplaintOutcome | null;
  answer?: string | null;
};

const OUTCOME_LABEL: Record<ComplaintOutcome, string> = {
  UPHELD: "a tu favor",
  PARTIALLY_UPHELD: "parcialmente a tu favor",
  NOT_UPHELD: "no a tu favor",
};

export function laPazDateLabel(at: Date): string {
  return new Intl.DateTimeFormat("es-BO", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "America/La_Paz" }).format(at);
}

/** ⚖ Lawyer to confirm the wording. */
export const SECOND_INSTANCE_NOTICE = (number: string) =>
  `Si no estás de acuerdo con esta respuesta, puedes presentar tu reclamo en segunda instancia ante la Autoridad de Supervisión del Sistema Financiero (ASFI), indicando el número de reclamo ${number}. Más información en www.asfi.gob.bo.`;

export function buyerEmail(kind: "RECEIVED" | "EXTENDED" | "ANSWERED", c: BuyerEmailFacts): { subject: string; body: string } {
  const hello = `Hola ${c.buyerName},`;
  const track = `Puedes ver tu reclamo y agregar información aquí:\n${c.trackingUrl}`;
  if (kind === "RECEIVED") {
    return {
      subject: `Recibimos tu reclamo ${c.number}`,
      body: `${hello}\n\nRegistramos tu reclamo con el número ${c.number}. Te responderemos por escrito a más tardar el ${laPazDateLabel(c.dueAt)}.\n\n${track}\n\npagosYa`,
    };
  }
  if (kind === "EXTENDED") {
    return {
      subject: `Tu reclamo ${c.number}: nueva fecha de respuesta`,
      body: `${hello}\n\nNecesitamos más tiempo para responder tu reclamo ${c.number}. Motivo: ${c.extensionReason ?? ""}\n\nTe responderemos a más tardar el ${laPazDateLabel(c.dueAt)}.\n\n${track}\n\npagosYa`,
    };
  }
  return {
    subject: `Respuesta a tu reclamo ${c.number}`,
    body: `${hello}\n\nEsta es nuestra respuesta a tu reclamo ${c.number}.\n\nResultado: ${c.outcome ? OUTCOME_LABEL[c.outcome] : ""}\n\n${c.answer ?? ""}\n\n${track}\n\n${SECOND_INSTANCE_NOTICE(c.number)}`,
  };
}

export function merchantAskedEmail(f: { number: string; question: string; merchantDueAt: Date; dashboardUrl: string }): { subject: string; body: string } {
  return {
    subject: `Reclamo ${f.number}: necesitamos tu respuesta`,
    body: `Un comprador presentó el reclamo ${f.number} sobre un pago a tu comercio. pagosYa lo está revisando y necesita tu versión.\n\nNuestra consulta: ${f.question}\n\nResponde desde tu panel a más tardar el ${laPazDateLabel(f.merchantDueAt)}:\n${f.dashboardUrl}\n\nNo respondas al comprador directamente; pagosYa le enviará la respuesta final.`,
  };
}

export function opsDigestEmail(items: Array<{ number: string; dueAt: Date; overdue: boolean; merchantName: string | null }>): { subject: string; body: string } {
  const sorted = [...items].sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());
  const overdue = items.filter((item) => item.overdue).length;
  const lines = sorted.map((item) => `${item.overdue ? "VENCIDO  " : "Vence    "}${item.number}  ${laPazDateLabel(item.dueAt)}  ${item.merchantName ?? "sin comercio"}`);
  return {
    subject: `Reclamos: ${overdue} vencidos, ${items.length - overdue} vencen pronto`,
    body: `Reclamos sin responder que vencen hasta mañana hábil:\n\n${lines.join("\n")}\n`,
  };
}
```

- [ ] **Step 4: Implement `complaint-csv.ts`**

```ts
// A cell starting with one of these is a formula in Excel/Sheets; prefixing "'" makes it plain text.
const FORMULA_START = /^[=+\-@\t\r]/;

function cell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  let text = String(value);
  if (typeof value === "string" && FORMULA_START.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(rows: Array<Record<string, string | number | null>>, columns: string[]): string {
  return [columns.join(","), ...rows.map((row) => columns.map((column) => cell(row[column])).join(","))].map((line) => `${line}\r\n`).join("");
}
```

- [ ] **Step 5: Implement `complaint-mailer.ts`**

```ts
import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ComplaintActor, ComplaintEventType } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { EMAIL_PROVIDER } from "../dashboard/tokens";
import { EmailProvider } from "../dashboard/interfaces/email-provider.interface";
import { buyerEmail, merchantAskedEmail, opsDigestEmail, type ComplaintEmailKind } from "./complaint-emails";
import { createComplaintToken } from "./complaint-token";
import { recordComplaintEvent } from "./complaint-events";

@Injectable()
export class ComplaintMailer {
  private readonly logger = new Logger(ComplaintMailer.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(EMAIL_PROVIDER) private readonly email: EmailProvider,
    private readonly config: ConfigService,
  ) {}

  trackingUrl(complaintId: string): string {
    const origin = (this.config.get<string>("app.checkoutOrigin") ?? "http://localhost:5174").replace(/\/$/, "");
    return `${origin}/reclamos/s/${createComplaintToken(complaintId, this.config.get<string>("app.orderTrackingSecret") ?? "")}`;
  }

  /** Builds the email from the complaint as it is now, sends it and records the outcome. Never throws. */
  async send(kind: ComplaintEmailKind, complaintId: string): Promise<boolean> {
    let recipients: string[] = [];
    try {
      const complaint = await this.prisma.complaint.findUnique({ where: { id: complaintId } });
      if (!complaint) return false;
      let message: { subject: string; body: string };
      if (kind === "MERCHANT_ASKED") {
        if (!complaint.merchantId || !complaint.merchantDueAt) return false;
        const asked = await this.prisma.complaintEvent.findFirst({ where: { complaintId, type: ComplaintEventType.MERCHANT_ASKED }, orderBy: { createdAt: "desc" } });
        const users = await this.prisma.merchantUser.findMany({ where: { merchantId: complaint.merchantId, deletedAt: null, emailVerifiedAt: { not: null } }, select: { email: true } });
        recipients = users.map((user) => user.email);
        const dashboard = (this.config.get<string>("app.merchantDashboardOrigin") ?? "http://localhost:4323").replace(/\/$/, "");
        message = merchantAskedEmail({ number: complaint.number, question: asked?.body ?? "", merchantDueAt: complaint.merchantDueAt, dashboardUrl: `${dashboard}/#dashboard-complaints` });
      } else {
        recipients = [complaint.buyerEmail];
        message = buyerEmail(kind, { ...complaint, trackingUrl: this.trackingUrl(complaint.id) });
      }
      for (const to of recipients) {
        await this.email.send({ to, ...message, failLoudly: true, idempotencyKey: `complaint-${complaint.id}-${kind}` });
        await recordComplaintEvent(this.prisma, complaintId, { type: ComplaintEventType.EMAIL_SENT, actor: ComplaintActor.SYSTEM, meta: { kind, to } });
      }
      return true;
    } catch (error) {
      this.logger.warn(`Complaint ${complaintId} ${kind} email failed: ${(error as Error).message}`);
      await recordComplaintEvent(this.prisma, complaintId, {
        type: ComplaintEventType.EMAIL_FAILED,
        actor: ComplaintActor.SYSTEM,
        body: (error as Error).message,
        meta: { kind, to: recipients.join(",") },
      }).catch(() => undefined);
      return false;
    }
  }

  async sendOpsDigest(items: Array<{ number: string; dueAt: Date; overdue: boolean; merchantName: string | null }>): Promise<void> {
    if (!items.length) return;
    const message = opsDigestEmail(items);
    const opsUsers = await this.prisma.opsUser.findMany({ where: { revokedAt: null }, select: { email: true } });
    for (const { email } of opsUsers) {
      await this.email.send({ to: email, ...message }).catch((error) => this.logger.warn(`Complaint digest to ${email} failed: ${(error as Error).message}`));
    }
  }
}
```

- [ ] **Step 6: Run, expect pass** — `nice npx jest src/complaints --runInBand` → PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/complaints
git commit -m "feat(complaints): buyer, merchant and ops email texts, a formula-safe CSV and a mailer that records every send"
```

---

### Task 5: Buyer intake service and public controller

**Files:**
- Create: `apps/api/src/complaints/dto/create-complaint.dto.ts`, `dto/buyer-message.dto.ts`, `complaint-intake.service.ts`, `complaint-intake.service.spec.ts`, `public-complaints.controller.ts`, `complaints.module.ts`
- Modify: `apps/api/src/app.module.ts` (import `ComplaintsModule`)

**Interfaces:**
- Consumes: Tasks 2–4; `PrivateFilesService.put(bytes, mime): Promise<string>` / `.get(key): Promise<Buffer>` (`apps/api/src/commerce-platform/private-files.service.ts`).
- Produces:
  - `ComplaintIntakeService.create(dto: CreateComplaintDto, uploads: UploadedComplaintFile[] | undefined, now?: Date): Promise<{ number: string; dueAt: Date; trackingUrl: string }>`
  - `ComplaintIntakeService.track(token: string, now?: Date): Promise<BuyerComplaintView>`
  - `ComplaintIntakeService.addMessage(token: string, body: string, uploads?: UploadedComplaintFile[]): Promise<BuyerComplaintView>`
  - `ComplaintIntakeService.attachment(token: string, attachmentId: string): Promise<{ bytes: Buffer; fileName: string; contentType: string }>`
  - `storeComplaintFiles(files: PrivateFilesService, checked: CheckedComplaintFile[]): Promise<Array<{ storageKey: string; file: CheckedComplaintFile }>>` exported from `complaint-intake.service.ts` for reuse by Task 8.
  - `type BuyerComplaintView = { number: string; status: "RECEIVED" | "IN_REVIEW" | "ANSWERED"; category: ComplaintCategory; request: ComplaintRequest; receivedAt: Date; dueAt: Date; extendedAt: Date | null; extensionReason: string | null; answeredAt: Date | null; outcome: ComplaintOutcome | null; answer: string | null; secondInstanceNotice: string | null; messages: Array<{ id: string; at: Date; body: string; attachments: Array<{ id: string; fileName: string; contentType: string; sizeBytes: number }> }> }` — `WAITING_MERCHANT` is reported to the buyer as `IN_REVIEW`.
  - Public routes: `POST v1/complaints` (multipart, field `files`), `GET v1/complaints/track`, `POST v1/complaints/track/messages` (multipart), `GET v1/complaints/track/attachments/:id`; token in `Authorization: Bearer <token>`.
  - `ComplaintsModule` (later tasks add providers and controllers to it).

- [ ] **Step 1: Write the DTOs**

`dto/create-complaint.dto.ts`:

```ts
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { ComplaintCategory, ComplaintRequest } from "@prisma/client";
import { IsEmail, IsEnum, IsOptional, IsString, Length, MaxLength } from "class-validator";

export class CreateComplaintDto {
  @ApiProperty() @IsString() @Length(2, 120) buyerName!: string;
  @ApiProperty() @IsEmail() @MaxLength(200) buyerEmail!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) buyerPhone?: string;
  @ApiPropertyOptional({ description: "The 'Orden:' value on the receipt" }) @IsOptional() @IsString() @MaxLength(80) reference?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) storeName?: string;
  @ApiProperty({ enum: ComplaintCategory }) @IsEnum(ComplaintCategory) category!: ComplaintCategory;
  @ApiProperty({ enum: ComplaintRequest }) @IsEnum(ComplaintRequest) request!: ComplaintRequest;
  @ApiProperty() @IsString() @Length(20, 5000) description!: string;
  /** Honeypot: hidden from people, filled in by bots. */
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) website?: string;
}
```

`dto/buyer-message.dto.ts`:

```ts
import { ApiProperty } from "@nestjs/swagger";
import { IsString, Length } from "class-validator";

export class BuyerMessageDto {
  @ApiProperty() @IsString() @Length(2, 5000) body!: string;
}
```

- [ ] **Step 2: Write the failing service tests** (`complaint-intake.service.spec.ts`)

```ts
import { ComplaintActor, ComplaintEventType, ComplaintStatus } from "@prisma/client";
import { ComplaintIntakeService } from "./complaint-intake.service";
import { createComplaintToken } from "./complaint-token";

const NOW = new Date("2026-10-08T19:00:00Z");
const dto = { buyerName: "Ana Pérez", buyerEmail: "ana@example.com", reference: "pi_abc123", category: "NOT_DELIVERED", request: "REFUND", description: "Pagué hace dos semanas y nunca llegó el pedido." } as any;
const config = { get: (key: string) => ({ "app.checkoutOrigin": "https://checkout.pagosya.bo", "app.orderTrackingSecret": "s" } as Record<string, string>)[key] };

function setup(payment: { id: string; merchantId: string } | null) {
  const tx: any = {
    $queryRaw: jest.fn().mockResolvedValue([{ last: 42 }]),
    paymentIntent: { findUnique: jest.fn().mockResolvedValue(payment) },
    complaint: { create: jest.fn(async ({ data }) => ({ id: "cmg1abcdefghijklmnopqrstu", ...data })) },
    complaintEvent: { create: jest.fn(async ({ data }) => ({ id: `ev_${data.type}`, ...data })) },
    complaintAttachment: { create: jest.fn() },
  };
  const prisma: any = { ...tx, $transaction: jest.fn(async (cb: any) => cb(tx)) };
  const files = { put: jest.fn().mockResolvedValue("3f2504e0-4f89-11d3-9a0c-0305e82c3301"), get: jest.fn() };
  const mailer = { send: jest.fn().mockResolvedValue(true), trackingUrl: (id: string) => `https://checkout.pagosya.bo/reclamos/s/${createComplaintToken(id, "s")}` };
  return { tx, prisma, files, mailer, service: new ComplaintIntakeService(prisma, files as any, mailer as any, config as any) };
}

describe("ComplaintIntakeService.create", () => {
  it("numbers the complaint, sets the 5-business-day deadline, links the payment and emails the buyer", async () => {
    const { tx, mailer, service } = setup({ id: "pi_abc123", merchantId: "m_1" });
    const result = await service.create(dto, [], NOW);
    expect(result.number).toBe("R-2026-000042");
    expect(result.dueAt.toISOString()).toBe("2026-10-16T03:59:59.999Z");
    expect(result.trackingUrl).toMatch(/^https:\/\/checkout\.pagosya\.bo\/reclamos\/s\//);
    expect(tx.complaint.create).toHaveBeenCalledWith({ data: expect.objectContaining({ paymentIntentId: "pi_abc123", merchantId: "m_1", referenceGiven: "pi_abc123" }) });
    expect(tx.complaintEvent.create).toHaveBeenCalledWith({ data: expect.objectContaining({ type: ComplaintEventType.LINKED, actor: ComplaintActor.SYSTEM }) });
    expect(mailer.send).toHaveBeenCalledWith("RECEIVED", "cmg1abcdefghijklmnopqrstu");
  });

  it("answers an unknown reference exactly like a known one", async () => {
    const known = await setup({ id: "pi_abc123", merchantId: "m_1" }).service.create(dto, [], NOW);
    const { tx, service } = setup(null);
    const unknown = await service.create({ ...dto, reference: "pi_doesnotexist" }, [], NOW);
    expect(Object.keys(unknown).sort()).toEqual(Object.keys(known).sort());
    expect(tx.complaint.create).toHaveBeenCalledWith({ data: expect.objectContaining({ paymentIntentId: null, merchantId: null }) });
  });

  it("never looks up a reference that isn't shaped like a payment id", async () => {
    const { tx, service } = setup(null);
    await service.create({ ...dto, reference: "' OR 1=1 --" }, [], NOW);
    expect(tx.paymentIntent.findUnique).not.toHaveBeenCalled();
  });

  it("requires a reference or a store name", async () => {
    const { service } = setup(null);
    await expect(service.create({ ...dto, reference: " ", storeName: undefined }, [], NOW)).rejects.toThrow("Escribe la referencia de tu pago o el nombre de la tienda.");
  });

  it("stores nothing for a bot that filled the honeypot, yet answers in the same shape", async () => {
    const { prisma, files, mailer, service } = setup(null);
    const result = await service.create({ ...dto, website: "http://spam" }, [], NOW);
    expect(result.number).toMatch(/^R-2026-\d{6}$/);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(files.put).not.toHaveBeenCalled();
    expect(mailer.send).not.toHaveBeenCalled();
  });

  it("stores checked files privately and attaches them to the RECEIVED event", async () => {
    const { tx, files, service } = setup(null);
    const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
    await service.create(dto, [{ originalname: "caja rota.jpg", mimetype: "image/jpeg", size: 4, buffer: jpg }], NOW);
    expect(files.put).toHaveBeenCalledWith(jpg, "image/jpeg");
    expect(tx.complaintAttachment.create).toHaveBeenCalledWith({ data: expect.objectContaining({ eventId: "ev_RECEIVED", uploadedBy: ComplaintActor.BUYER, fileName: "caja rota.jpg", contentType: "image/jpeg" }) });
  });
});

describe("ComplaintIntakeService.track", () => {
  const stored = {
    id: "cmg1abcdefghijklmnopqrstu", number: "R-2026-000042", status: ComplaintStatus.WAITING_MERCHANT, category: "NOT_DELIVERED", request: "REFUND",
    receivedAt: NOW, dueAt: new Date("2026-10-16T03:59:59.999Z"), extendedAt: null, extensionReason: null, answeredAt: null, outcome: null, answer: null, emailConfirmedAt: null,
    events: [
      { id: "e1", type: ComplaintEventType.RECEIVED, actor: ComplaintActor.BUYER, body: "Nunca llegó.", createdAt: NOW, attachments: [] },
      { id: "e2", type: ComplaintEventType.NOTE, actor: ComplaintActor.OPS, body: "interno", createdAt: NOW, attachments: [] },
      { id: "e3", type: ComplaintEventType.MERCHANT_REPLIED, actor: ComplaintActor.MERCHANT, body: "del comercio", createdAt: NOW, attachments: [] },
    ],
  };

  it("shows the buyer only their own messages, reports WAITING_MERCHANT as IN_REVIEW and confirms the email once", async () => {
    const { prisma, tx, service } = setup(null);
    prisma.complaint.findUnique = jest.fn().mockResolvedValue(stored);
    tx.complaint.update = jest.fn().mockResolvedValue({});
    const view = await service.track(createComplaintToken(stored.id, "s"), NOW);
    expect(view.status).toBe("IN_REVIEW");
    expect(view.messages.map((m) => m.body)).toEqual(["Nunca llegó."]);
    expect(JSON.stringify(view)).not.toContain("interno");
    expect(JSON.stringify(view)).not.toContain("del comercio");
    expect(tx.complaint.update).toHaveBeenCalledWith({ where: { id: stored.id }, data: { emailConfirmedAt: NOW } });
  });

  it("is a 404 for a bad token", async () => {
    const { service } = setup(null);
    await expect(service.track("bad.token")).rejects.toThrow("Reclamo no encontrado");
  });

  it("refuses a buyer message after the answer", async () => {
    const { prisma, service } = setup(null);
    prisma.complaint.findUnique = jest.fn().mockResolvedValue({ ...stored, status: ComplaintStatus.ANSWERED });
    await expect(service.addMessage(createComplaintToken(stored.id, "s"), "una cosa más", [])).rejects.toThrow("Este reclamo ya fue respondido.");
  });
});
```

- [ ] **Step 3: Run, expect failure** — `nice npx jest src/complaints/complaint-intake.service.spec.ts --runInBand` → FAIL.

- [ ] **Step 4: Implement `complaint-intake.service.ts`**

```ts
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ComplaintActor, ComplaintCategory, ComplaintEventType, ComplaintOutcome, ComplaintRequest, ComplaintStatus } from "@prisma/client";
import { randomInt } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";
import { PrivateFilesService } from "../commerce-platform/private-files.service";
import { ANSWER_BUSINESS_DAYS, addBusinessDays, complaintYear } from "./complaint-dates";
import { CheckedComplaintFile, UploadedComplaintFile, checkComplaintFiles, safeFileName } from "./complaint-files";
import { formatComplaintNumber, nextComplaintNumber } from "./complaint-number";
import { readComplaintToken } from "./complaint-token";
import { recordComplaintEvent } from "./complaint-events";
import { assertCan } from "./complaint-state";
import { ComplaintMailer } from "./complaint-mailer";
import { SECOND_INSTANCE_NOTICE } from "./complaint-emails";
import { CreateComplaintDto } from "./dto/create-complaint.dto";

const PAYMENT_ID = /^pi_[0-9a-z]+$/;

export type BuyerComplaintView = {
  number: string;
  status: "RECEIVED" | "IN_REVIEW" | "ANSWERED";
  category: ComplaintCategory;
  request: ComplaintRequest;
  receivedAt: Date;
  dueAt: Date;
  extendedAt: Date | null;
  extensionReason: string | null;
  answeredAt: Date | null;
  outcome: ComplaintOutcome | null;
  answer: string | null;
  secondInstanceNotice: string | null;
  messages: Array<{ id: string; at: Date; body: string; attachments: Array<{ id: string; fileName: string; contentType: string; sizeBytes: number }> }>;
};

/** Uploads before the transaction (object storage can't join it); a failed transaction leaves unreferenced private files only. */
export async function storeComplaintFiles(files: PrivateFilesService, checked: CheckedComplaintFile[]) {
  const stored: Array<{ storageKey: string; file: CheckedComplaintFile }> = [];
  for (const file of checked) stored.push({ storageKey: await files.put(file.buffer, file.contentType), file });
  return stored;
}

const BUYER_EVENTS: ComplaintEventType[] = [ComplaintEventType.RECEIVED, ComplaintEventType.BUYER_MESSAGE];

@Injectable()
export class ComplaintIntakeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly files: PrivateFilesService,
    private readonly mailer: ComplaintMailer,
    private readonly config: ConfigService,
  ) {}

  async create(dto: CreateComplaintDto, uploads: UploadedComplaintFile[] | undefined, now = new Date()) {
    const dueAt = addBusinessDays(now, ANSWER_BUSINESS_DAYS);
    if (dto.website?.trim()) {
      // A bot: same answer shape, nothing stored, nothing sent. The decoy id never exists, so its link shows "no encontrado".
      return { number: formatComplaintNumber(complaintYear(now), randomInt(1, 1_000_000)), dueAt, trackingUrl: this.mailer.trackingUrl(`c${randomInt(10 ** 9, 10 ** 10)}decoyxxxxxxxxxx`) };
    }
    const reference = dto.reference?.trim() || null;
    const storeName = dto.storeName?.trim() || null;
    if (!reference && !storeName) throw new BadRequestException("Escribe la referencia de tu pago o el nombre de la tienda.");
    const stored = await storeComplaintFiles(this.files, checkComplaintFiles(uploads));

    const complaint = await this.prisma.$transaction(async (tx) => {
      const number = await nextComplaintNumber(tx, now);
      const payment = reference && PAYMENT_ID.test(reference)
        ? await tx.paymentIntent.findUnique({ where: { id: reference }, select: { id: true, merchantId: true } })
        : null;
      const created = await tx.complaint.create({
        data: {
          number,
          category: dto.category,
          request: dto.request,
          buyerName: dto.buyerName.trim(),
          buyerEmail: dto.buyerEmail.trim().toLowerCase(),
          buyerPhone: dto.buyerPhone?.trim() || null,
          referenceGiven: reference,
          storeNameGiven: storeName,
          paymentIntentId: payment?.id ?? null,
          merchantId: payment?.merchantId ?? null,
          description: dto.description.trim(),
          receivedAt: now,
          dueAt,
        },
      });
      const received = await recordComplaintEvent(tx, created.id, { type: ComplaintEventType.RECEIVED, actor: ComplaintActor.BUYER, body: created.description });
      if (payment) {
        await recordComplaintEvent(tx, created.id, { type: ComplaintEventType.LINKED, actor: ComplaintActor.SYSTEM, meta: { paymentIntentId: payment.id, merchantId: payment.merchantId } });
      }
      for (const { storageKey, file } of stored) {
        await tx.complaintAttachment.create({
          data: { complaintId: created.id, eventId: received.id, uploadedBy: ComplaintActor.BUYER, storageKey, fileName: safeFileName(file.originalname), contentType: file.contentType, sizeBytes: file.size },
        });
      }
      return created;
    });

    await this.mailer.send("RECEIVED", complaint.id);
    return { number: complaint.number, dueAt, trackingUrl: this.mailer.trackingUrl(complaint.id) };
  }

  private complaintIdFrom(token: string): string {
    const id = readComplaintToken(token, this.config.get<string>("app.orderTrackingSecret") ?? "");
    if (!id) throw new NotFoundException("Reclamo no encontrado");
    return id;
  }

  private async load(token: string) {
    const complaint = await this.prisma.complaint.findUnique({
      where: { id: this.complaintIdFrom(token) },
      include: { events: { orderBy: { createdAt: "asc" }, include: { attachments: true } } },
    });
    if (!complaint) throw new NotFoundException("Reclamo no encontrado");
    return complaint;
  }

  async track(token: string, now = new Date()): Promise<BuyerComplaintView> {
    const complaint = await this.load(token);
    if (!complaint.emailConfirmedAt) {
      await this.prisma.$transaction(async (tx) => {
        await tx.complaint.update({ where: { id: complaint.id }, data: { emailConfirmedAt: now } });
        await recordComplaintEvent(tx, complaint.id, { type: ComplaintEventType.EMAIL_CONFIRMED, actor: ComplaintActor.BUYER });
      });
    }
    const answered = complaint.status === ComplaintStatus.ANSWERED;
    return {
      number: complaint.number,
      status: answered ? "ANSWERED" : complaint.status === ComplaintStatus.RECEIVED ? "RECEIVED" : "IN_REVIEW",
      category: complaint.category,
      request: complaint.request,
      receivedAt: complaint.receivedAt,
      dueAt: complaint.dueAt,
      extendedAt: complaint.extendedAt,
      extensionReason: complaint.extensionReason,
      answeredAt: complaint.answeredAt,
      outcome: complaint.outcome,
      answer: complaint.answer,
      secondInstanceNotice: answered ? SECOND_INSTANCE_NOTICE(complaint.number) : null,
      messages: complaint.events
        .filter((event) => event.actor === ComplaintActor.BUYER && BUYER_EVENTS.includes(event.type))
        .map((event) => ({
          id: event.id,
          at: event.createdAt,
          body: event.body ?? "",
          attachments: event.attachments.map(({ id, fileName, contentType, sizeBytes }) => ({ id, fileName, contentType, sizeBytes })),
        })),
    };
  }

  async addMessage(token: string, body: string, uploads?: UploadedComplaintFile[]): Promise<BuyerComplaintView> {
    const complaint = await this.load(token);
    assertCan("buyerMessage", complaint.status);
    const stored = await storeComplaintFiles(this.files, checkComplaintFiles(uploads));
    await this.prisma.$transaction(async (tx) => {
      const event = await recordComplaintEvent(tx, complaint.id, { type: ComplaintEventType.BUYER_MESSAGE, actor: ComplaintActor.BUYER, body: body.trim() });
      for (const { storageKey, file } of stored) {
        await tx.complaintAttachment.create({
          data: { complaintId: complaint.id, eventId: event.id, uploadedBy: ComplaintActor.BUYER, storageKey, fileName: safeFileName(file.originalname), contentType: file.contentType, sizeBytes: file.size },
        });
      }
    });
    return this.track(token);
  }

  async attachment(token: string, attachmentId: string) {
    const complaintId = this.complaintIdFrom(token);
    const attachment = await this.prisma.complaintAttachment.findFirst({ where: { id: attachmentId, complaintId, uploadedBy: ComplaintActor.BUYER } });
    if (!attachment) throw new NotFoundException("Archivo no encontrado");
    return { bytes: await this.files.get(attachment.storageKey), fileName: attachment.fileName, contentType: attachment.contentType };
  }
}
```

- [ ] **Step 5: Implement `public-complaints.controller.ts`**

```ts
import { Body, Controller, Get, Headers, NotFoundException, Param, Post, StreamableFile, UploadedFiles, UseInterceptors } from "@nestjs/common";
import { FilesInterceptor } from "@nestjs/platform-express";
import { ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { MAX_COMPLAINT_FILES, MAX_COMPLAINT_FILE_BYTES, UploadedComplaintFile } from "./complaint-files";
import { ComplaintIntakeService } from "./complaint-intake.service";
import { CreateComplaintDto } from "./dto/create-complaint.dto";
import { BuyerMessageDto } from "./dto/buyer-message.dto";

const HOUR = 3_600_000;
const UPLOADS = FilesInterceptor("files", MAX_COMPLAINT_FILES, { limits: { fileSize: MAX_COMPLAINT_FILE_BYTES } });

function bearer(header: string | undefined): string {
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
  if (!token) throw new NotFoundException("Reclamo no encontrado");
  return token;
}

@ApiTags("complaints")
@Controller("v1/complaints")
export class PublicComplaintsController {
  constructor(private readonly intake: ComplaintIntakeService) {}

  @Post()
  @Throttle({ default: { limit: 5, ttl: HOUR } })
  @UseInterceptors(UPLOADS)
  create(@Body() dto: CreateComplaintDto, @UploadedFiles() files: UploadedComplaintFile[]) {
    return this.intake.create(dto, files);
  }

  @Get("track")
  @Throttle({ default: { limit: 30, ttl: HOUR } })
  track(@Headers("authorization") authorization: string | undefined) {
    return this.intake.track(bearer(authorization));
  }

  @Post("track/messages")
  @Throttle({ default: { limit: 30, ttl: HOUR } })
  @UseInterceptors(UPLOADS)
  message(@Headers("authorization") authorization: string | undefined, @Body() dto: BuyerMessageDto, @UploadedFiles() files: UploadedComplaintFile[]) {
    return this.intake.addMessage(bearer(authorization), dto.body, files);
  }

  @Get("track/attachments/:id")
  @Throttle({ default: { limit: 30, ttl: HOUR } })
  async attachment(@Headers("authorization") authorization: string | undefined, @Param("id") id: string) {
    const file = await this.intake.attachment(bearer(authorization), id);
    return new StreamableFile(file.bytes, { type: file.contentType, disposition: `attachment; filename="${file.fileName}"` });
  }
}
```

- [ ] **Step 6: Create `complaints.module.ts` and register it**

```ts
import { Module } from "@nestjs/common";
import { DashboardModule } from "../dashboard/dashboard.module";
import { PrivateFilesService } from "../commerce-platform/private-files.service";
import { ComplaintMailer } from "./complaint-mailer";
import { ComplaintIntakeService } from "./complaint-intake.service";
import { PublicComplaintsController } from "./public-complaints.controller";

@Module({
  imports: [DashboardModule],
  controllers: [PublicComplaintsController],
  providers: [PrivateFilesService, ComplaintMailer, ComplaintIntakeService],
})
export class ComplaintsModule {}
```

In `apps/api/src/app.module.ts` add `import { ComplaintsModule } from "./complaints/complaints.module";` and `ComplaintsModule,` to `imports` next to `SettlementModule`.

`DashboardModule` must export `EMAIL_PROVIDER` (`SettlementAdminService` already injects it through the same import; confirm with `grep -n "exports" apps/api/src/dashboard/dashboard.module.ts`).

- [ ] **Step 7: Run tests and type-check**

Run: `cd apps/api && nice npx jest src/complaints --runInBand && nice npx tsc --noEmit -p tsconfig.json; echo exit $?`
Expected: PASS, `exit 0`.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/complaints apps/api/src/app.module.ts
git commit -m "feat(complaints): buyers file, track and add to a complaint on public, rate-limited endpoints"
```

---

### Task 6: Ops queue, actions and export

**Files:**
- Create: `apps/api/src/complaints/dto/ops-complaint.dto.ts`, `complaint-ops.service.ts`, `complaint-ops.service.spec.ts`, `ops-complaints.controller.ts`
- Modify: `apps/api/src/complaints/complaints.module.ts`

**Interfaces:**
- Consumes: Tasks 2–5; `AuditLogService.record(tx, { actorType, actorId, actorLabel, action, targetType, targetId, metadata })` (`apps/api/src/ops/audit-log.service.ts`); `OpsAuthGuard`, `CurrentOpsUser` (`apps/api/src/ops/…`); `laPazDayStart` (`settlement-dates.ts`).
- Produces:
  - `type ComplaintOpsActor = { id: string; name: string; email: string; role: OpsRole }`
  - `ComplaintOpsService.list(filter: { status?: ComplaintStatus; q?: string }, now?: Date)` → rows `{ id, number, status, category, buyerName, buyerEmail, merchant: { id, name } | null, receivedAt, dueAt, assignedTo: { id, name } | null, overdue, dueSoon, emailFailed, test }`
  - `ComplaintOpsService.get(id: string)` → complaint fields + `payment { id, amount, currency, status, livemode, createdAt } | null` + `merchant { id, name, email, payoutHeldAt } | null` + `assignedOpsUser` + `events` (with attachments) + `sameEmailCount`
  - `take(id, actor)`, `link(id, { paymentIntentId?, merchantId? }, actor)`, `note(id, body, actor)`, `askMerchant(id, question, actor, now?)`, `extend(id, reason, actor, now?)`, `answer(id, { outcome, answer }, actor, now?)` — each returns the `get` shape
  - `attachment(id, attachmentId)`, `exportCsv(from: string, to: string): Promise<string>`
  - `unresolvedEmailFailures(events: Array<{ type: ComplaintEventType; meta: Prisma.JsonValue | null }>): string[]` (exported; used by Task 9)
  - Routes under `internal/complaints` (Step 5).

- [ ] **Step 1: DTOs** (`dto/ops-complaint.dto.ts`)

```ts
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { ComplaintOutcome, ComplaintStatus } from "@prisma/client";
import { IsEnum, IsInt, IsOptional, IsPositive, IsString, Length, Matches, MaxLength } from "class-validator";

export class ListComplaintsQuery {
  @ApiPropertyOptional({ enum: ComplaintStatus }) @IsOptional() @IsEnum(ComplaintStatus) status?: ComplaintStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) q?: string;
}
export class ExportComplaintsQuery {
  @ApiProperty() @Matches(/^\d{4}-\d{2}-\d{2}$/) from!: string;
  @ApiProperty() @Matches(/^\d{4}-\d{2}-\d{2}$/) to!: string;
}
export class LinkComplaintDto {
  @ApiPropertyOptional() @IsOptional() @Matches(/^pi_[0-9a-z]+$/) paymentIntentId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) merchantId?: string;
}
export class ComplaintNoteDto { @ApiProperty() @IsString() @Length(2, 5000) body!: string; }
export class AskMerchantDto { @ApiProperty() @IsString() @Length(10, 2000) question!: string; }
export class ExtendComplaintDto { @ApiProperty() @IsString() @Length(8, 1000) reason!: string; }
export class AnswerComplaintDto {
  @ApiProperty({ enum: ComplaintOutcome }) @IsEnum(ComplaintOutcome) outcome!: ComplaintOutcome;
  @ApiProperty() @IsString() @Length(20, 5000) answer!: string;
}
export class ComplaintRefundDto {
  @ApiPropertyOptional({ description: "Minor units; omit for a full refund" }) @IsOptional() @IsInt() @IsPositive() amount?: number;
}
export class ComplaintPauseDto { @ApiProperty() @IsString() @Length(8, 500) reason!: string; }
```

- [ ] **Step 2: Write the failing service tests** (`complaint-ops.service.spec.ts`)

```ts
import { ComplaintActor, ComplaintEventType, ComplaintOutcome, ComplaintStatus, OpsRole } from "@prisma/client";
import { ForbiddenException } from "@nestjs/common";
import { ComplaintOpsService } from "./complaint-ops.service";

const NOW = new Date("2026-10-08T19:00:00Z");
const admin = { id: "ops_admin", name: "Ana", email: "ana@pagosya.bo", role: OpsRole.SUPPORT_ADMIN };
const agent = { id: "ops_agent", name: "Beto", email: "beto@pagosya.bo", role: OpsRole.SUPPORT_AGENT };
const ID = "cmg1abcdefghijklmnopqrstu";

function base(over = {}) {
  return { id: ID, number: "R-2026-000042", status: ComplaintStatus.IN_REVIEW, merchantId: "m_1", paymentIntentId: "pi_1", buyerEmail: "ana@example.com", extendedAt: null, dueAt: new Date("2026-10-16T03:59:59.999Z"), receivedAt: NOW, ...over };
}

function setup(complaint: any) {
  const db: any = {
    complaint: {
      findUnique: jest.fn().mockResolvedValue(complaint),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      update: jest.fn(async ({ data }) => ({ ...complaint, ...data })),
    },
    complaintEvent: { create: jest.fn().mockResolvedValue({}), findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
    paymentIntent: { findUnique: jest.fn().mockResolvedValue({ id: "pi_9", merchantId: "m_9" }) },
    merchant: { findUnique: jest.fn().mockResolvedValue({ id: "m_9" }) },
    complaintAttachment: { findFirst: jest.fn() },
  };
  db.$transaction = jest.fn(async (cb: any) => cb(db));
  const audit = { record: jest.fn() };
  const mailer = { send: jest.fn().mockResolvedValue(true) };
  const files = { get: jest.fn() };
  const refunds = { create: jest.fn().mockResolvedValue({ id: "re_1", amount: 5000 }) };
  const settlementAdmin = { placeHold: jest.fn().mockResolvedValue({ held: true }) };
  const service = new ComplaintOpsService(db, audit as any, mailer as any, files as any, refunds as any, settlementAdmin as any);
  jest.spyOn(service, "get").mockResolvedValue({ id: complaint?.id } as any);
  return { db, audit, mailer, refunds, settlementAdmin, service };
}

describe("ComplaintOpsService", () => {
  it("take assigns the complaint and moves RECEIVED to IN_REVIEW, with history and audit", async () => {
    const { db, audit, service } = setup(base({ status: ComplaintStatus.RECEIVED }));
    await service.take(ID, agent);
    expect(db.complaint.update).toHaveBeenCalledWith({ where: { id: ID }, data: { assignedOpsUserId: "ops_agent", status: ComplaintStatus.IN_REVIEW } });
    expect(db.complaintEvent.create).toHaveBeenCalledWith({ data: expect.objectContaining({ type: ComplaintEventType.TAKEN, actor: ComplaintActor.OPS, actorId: "ops_agent" }) });
    expect(audit.record).toHaveBeenCalledWith(db, expect.objectContaining({ action: "complaint.taken", targetType: "Complaint" }));
  });

  it("askMerchant needs a linked merchant, sets the 2-business-day reply date and emails the merchant", async () => {
    const unlinked = setup(base({ merchantId: null }));
    await expect(unlinked.service.askMerchant(ID, "¿Enviaste el pedido?", agent, NOW)).rejects.toThrow("Vincula el reclamo a un comercio primero.");
    const { db, mailer, service } = setup(base());
    await service.askMerchant(ID, "¿Enviaste el pedido?", agent, NOW);
    expect(db.complaint.update).toHaveBeenCalledWith({ where: { id: ID }, data: { status: ComplaintStatus.WAITING_MERCHANT, merchantDueAt: new Date("2026-10-13T03:59:59.999Z") } });
    expect(mailer.send).toHaveBeenCalledWith("MERCHANT_ASKED", ID);
  });

  it("only an admin extends, only once, by 5 business days from the current due date", async () => {
    await expect(setup(base()).service.extend(ID, "Esperamos al banco.", agent, NOW)).rejects.toThrow(ForbiddenException);
    await expect(setup(base({ extendedAt: NOW })).service.extend(ID, "Esperamos al banco.", admin, NOW)).rejects.toThrow("El plazo ya se extendió una vez.");
    const { db, mailer, service } = setup(base());
    await service.extend(ID, "Esperamos al banco.", admin, NOW);
    expect(db.complaint.update).toHaveBeenCalledWith({ where: { id: ID }, data: { dueAt: new Date("2026-10-23T03:59:59.999Z"), extendedAt: NOW, extensionReason: "Esperamos al banco." } });
    expect(mailer.send).toHaveBeenCalledWith("EXTENDED", ID);
  });

  it("only an admin answers; the answer is final and emailed", async () => {
    await expect(setup(base()).service.answer(ID, { outcome: ComplaintOutcome.UPHELD, answer: "Te devolvimos el dinero completo." }, agent, NOW)).rejects.toThrow(ForbiddenException);
    const { db, mailer, service } = setup(base());
    await service.answer(ID, { outcome: ComplaintOutcome.UPHELD, answer: "Te devolvimos el dinero completo." }, admin, NOW);
    expect(db.complaint.update).toHaveBeenCalledWith({ where: { id: ID }, data: { status: ComplaintStatus.ANSWERED, outcome: ComplaintOutcome.UPHELD, answer: "Te devolvimos el dinero completo.", answeredAt: NOW } });
    expect(mailer.send).toHaveBeenCalledWith("ANSWERED", ID);
    await expect(setup(base({ status: ComplaintStatus.ANSWERED })).service.answer(ID, { outcome: ComplaintOutcome.UPHELD, answer: "otra vez otra respuesta" }, admin, NOW)).rejects.toThrow("Este reclamo ya fue respondido.");
  });

  it("link takes the merchant from the payment when a payment is given", async () => {
    const { db, service } = setup(base({ merchantId: null, paymentIntentId: null }));
    await service.link(ID, { paymentIntentId: "pi_9" }, agent);
    expect(db.complaint.update).toHaveBeenCalledWith({ where: { id: ID }, data: { paymentIntentId: "pi_9", merchantId: "m_9" } });
  });

  it("marks overdue, due-soon, test and failed-email rows in the queue", async () => {
    const { db, service } = setup(null);
    db.complaint.findMany.mockResolvedValue([
      { ...base({ dueAt: new Date("2026-10-08T03:59:59.999Z") }), merchant: null, assignedOpsUser: null, paymentIntent: { livemode: false }, events: [] },
      { ...base({ id: "c2", dueAt: new Date("2026-10-10T03:59:59.999Z") }), merchant: null, assignedOpsUser: null, paymentIntent: null, events: [{ type: ComplaintEventType.EMAIL_FAILED, meta: { kind: "RECEIVED" } }] },
    ]);
    const rows = await service.list({}, NOW);
    expect(rows[0]).toEqual(expect.objectContaining({ overdue: true, dueSoon: false, test: true }));
    expect(rows[1]).toEqual(expect.objectContaining({ overdue: false, dueSoon: true, emailFailed: true, test: false }));
  });
});
```

- [ ] **Step 3: Run, expect failure** — `nice npx jest src/complaints/complaint-ops.service.spec.ts --runInBand` → FAIL.

- [ ] **Step 4: Implement `complaint-ops.service.ts`** (Task 7 fills in `refund` and `pausePayouts`; the constructor already takes their collaborators so the spec's `setup` works from this task on):

```ts
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { ComplaintActor, ComplaintEventType, ComplaintOutcome, ComplaintStatus, OpsRole, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { PrivateFilesService } from "../commerce-platform/private-files.service";
import { AuditLogService } from "../ops/audit-log.service";
import { RefundsService } from "../refunds/refunds.service";
import { SettlementAdminService } from "../settlement/settlement-admin.service";
import { laPazDayStart } from "../settlement/settlement-dates";
import { EXTENSION_BUSINESS_DAYS, MERCHANT_BUSINESS_DAYS, addBusinessDays, businessDaysBetween } from "./complaint-dates";
import { recordComplaintEvent } from "./complaint-events";
import { assertCan, nextStatus } from "./complaint-state";
import { ComplaintMailer } from "./complaint-mailer";
import { toCsv } from "./complaint-csv";

export type ComplaintOpsActor = { id: string; name: string; email: string; role: OpsRole };

const label = (actor: ComplaintOpsActor) => `${actor.name} <${actor.email}>`;
const OPEN: ComplaintStatus[] = [ComplaintStatus.RECEIVED, ComplaintStatus.IN_REVIEW, ComplaintStatus.WAITING_MERCHANT];

type StoredComplaint = NonNullable<Awaited<ReturnType<PrismaService["complaint"]["findUnique"]>>>;

/** EMAIL_FAILED events not followed by an EMAIL_SENT of the same kind. Events must be in createdAt order. */
export function unresolvedEmailFailures(events: Array<{ type: ComplaintEventType; meta: Prisma.JsonValue | null }>): string[] {
  const open = new Set<string>();
  for (const event of events) {
    const kind = (event.meta as { kind?: string } | null)?.kind;
    if (!kind) continue;
    if (event.type === ComplaintEventType.EMAIL_FAILED) open.add(kind);
    if (event.type === ComplaintEventType.EMAIL_SENT) open.delete(kind);
  }
  return [...open];
}

@Injectable()
export class ComplaintOpsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly mailer: ComplaintMailer,
    private readonly files: PrivateFilesService,
    private readonly refunds: RefundsService,
    private readonly settlementAdmin: SettlementAdminService,
  ) {}

  private assertAdmin(actor: ComplaintOpsActor) {
    if (actor.role !== OpsRole.SUPPORT_ADMIN) throw new ForbiddenException("Solo un administrador puede hacer esto");
  }

  /** Loads the complaint, runs one action, writes its audit entry in the same transaction, returns the fresh detail. */
  private async mutate(id: string, actor: ComplaintOpsActor, action: string, work: (tx: Prisma.TransactionClient, complaint: StoredComplaint) => Promise<Record<string, unknown>>) {
    await this.prisma.$transaction(async (tx) => {
      const complaint = await tx.complaint.findUnique({ where: { id } });
      if (!complaint) throw new NotFoundException("Reclamo no encontrado");
      const metadata = await work(tx, complaint);
      await this.auditLog.record(tx, { actorType: "OPS_USER", actorId: actor.id, actorLabel: label(actor), action, targetType: "Complaint", targetId: id, metadata: { number: complaint.number, ...metadata } });
    });
    return this.get(id);
  }

  async list(filter: { status?: ComplaintStatus; q?: string }, now = new Date()) {
    const q = filter.q?.trim();
    const rows = await this.prisma.complaint.findMany({
      where: {
        status: filter.status ?? { in: OPEN },
        ...(q ? { OR: [{ number: { contains: q, mode: "insensitive" } }, { buyerEmail: { contains: q, mode: "insensitive" } }, { merchant: { name: { contains: q, mode: "insensitive" } } }] } : {}),
      },
      orderBy: { dueAt: "asc" },
      take: 200,
      include: {
        merchant: { select: { id: true, name: true } },
        assignedOpsUser: { select: { id: true, name: true } },
        paymentIntent: { select: { livemode: true } },
        events: { where: { type: { in: [ComplaintEventType.EMAIL_FAILED, ComplaintEventType.EMAIL_SENT] } }, select: { type: true, meta: true }, orderBy: { createdAt: "asc" } },
      },
    });
    const soon = addBusinessDays(now, 1);
    return rows.map((row) => {
      const answered = row.status === ComplaintStatus.ANSWERED;
      return {
        id: row.id,
        number: row.number,
        status: row.status,
        category: row.category,
        buyerName: row.buyerName,
        buyerEmail: row.buyerEmail,
        merchant: row.merchant,
        receivedAt: row.receivedAt,
        dueAt: row.dueAt,
        assignedTo: row.assignedOpsUser,
        overdue: !answered && row.dueAt.getTime() < now.getTime(),
        dueSoon: !answered && row.dueAt.getTime() >= now.getTime() && row.dueAt.getTime() <= soon.getTime(),
        emailFailed: unresolvedEmailFailures(row.events).length > 0,
        test: row.paymentIntent ? !row.paymentIntent.livemode : false,
      };
    });
  }

  async get(id: string) {
    const complaint = await this.prisma.complaint.findUnique({
      where: { id },
      include: {
        paymentIntent: { select: { id: true, amount: true, currency: true, status: true, livemode: true, createdAt: true } },
        merchant: { select: { id: true, name: true, email: true, payoutHeldAt: true } },
        assignedOpsUser: { select: { id: true, name: true } },
        events: { orderBy: { createdAt: "asc" }, include: { attachments: { select: { id: true, fileName: true, contentType: true, sizeBytes: true, uploadedBy: true } } } },
      },
    });
    if (!complaint) throw new NotFoundException("Reclamo no encontrado");
    const sameEmailCount = await this.prisma.complaint.count({ where: { buyerEmail: complaint.buyerEmail, id: { not: id } } });
    const { paymentIntent, ...rest } = complaint;
    return { ...rest, payment: paymentIntent, sameEmailCount };
  }

  take(id: string, actor: ComplaintOpsActor) {
    return this.mutate(id, actor, "complaint.taken", async (tx, complaint) => {
      assertCan("take", complaint.status);
      await tx.complaint.update({ where: { id }, data: { assignedOpsUserId: actor.id, status: nextStatus("take", complaint.status) } });
      await recordComplaintEvent(tx, id, { type: ComplaintEventType.TAKEN, actor: ComplaintActor.OPS, actorId: actor.id });
      return {};
    });
  }

  link(id: string, data: { paymentIntentId?: string; merchantId?: string }, actor: ComplaintOpsActor) {
    return this.mutate(id, actor, "complaint.linked", async (tx, complaint) => {
      assertCan("link", complaint.status);
      let merchantId = data.merchantId ?? null;
      let paymentIntentId = complaint.paymentIntentId;
      if (data.paymentIntentId) {
        const payment = await tx.paymentIntent.findUnique({ where: { id: data.paymentIntentId }, select: { id: true, merchantId: true } });
        if (!payment) throw new BadRequestException("No existe un pago con esa referencia.");
        paymentIntentId = payment.id;
        merchantId = payment.merchantId;
      } else if (merchantId) {
        if (!(await tx.merchant.findUnique({ where: { id: merchantId }, select: { id: true } }))) throw new BadRequestException("Comercio no encontrado.");
      } else {
        throw new BadRequestException("Indica un pago o un comercio.");
      }
      await tx.complaint.update({ where: { id }, data: { paymentIntentId, merchantId } });
      await recordComplaintEvent(tx, id, { type: ComplaintEventType.LINKED, actor: ComplaintActor.OPS, actorId: actor.id, meta: { paymentIntentId, merchantId } });
      return { paymentIntentId, merchantId };
    });
  }

  note(id: string, body: string, actor: ComplaintOpsActor) {
    return this.mutate(id, actor, "complaint.note_added", async (tx, complaint) => {
      assertCan("note", complaint.status);
      await recordComplaintEvent(tx, id, { type: ComplaintEventType.NOTE, actor: ComplaintActor.OPS, actorId: actor.id, body: body.trim() });
      return {};
    });
  }

  async askMerchant(id: string, question: string, actor: ComplaintOpsActor, now = new Date()) {
    const detail = await this.mutate(id, actor, "complaint.merchant_asked", async (tx, complaint) => {
      assertCan("askMerchant", complaint.status);
      if (!complaint.merchantId) throw new ConflictException("Vincula el reclamo a un comercio primero.");
      const merchantDueAt = addBusinessDays(now, MERCHANT_BUSINESS_DAYS);
      await tx.complaint.update({ where: { id }, data: { status: nextStatus("askMerchant", complaint.status), merchantDueAt } });
      await recordComplaintEvent(tx, id, { type: ComplaintEventType.MERCHANT_ASKED, actor: ComplaintActor.OPS, actorId: actor.id, body: question.trim(), meta: { merchantDueAt: merchantDueAt.toISOString() } });
      return { merchantDueAt: merchantDueAt.toISOString() };
    });
    await this.mailer.send("MERCHANT_ASKED", id);
    return detail;
  }

  async extend(id: string, reason: string, actor: ComplaintOpsActor, now = new Date()) {
    this.assertAdmin(actor);
    const detail = await this.mutate(id, actor, "complaint.extended", async (tx, complaint) => {
      assertCan("extend", complaint.status);
      if (complaint.extendedAt) throw new ConflictException("El plazo ya se extendió una vez.");
      const dueAt = addBusinessDays(complaint.dueAt, EXTENSION_BUSINESS_DAYS);
      await tx.complaint.update({ where: { id }, data: { dueAt, extendedAt: now, extensionReason: reason.trim() } });
      await recordComplaintEvent(tx, id, { type: ComplaintEventType.EXTENDED, actor: ComplaintActor.OPS, actorId: actor.id, body: reason.trim(), meta: { from: complaint.dueAt.toISOString(), to: dueAt.toISOString() } });
      return { from: complaint.dueAt.toISOString(), to: dueAt.toISOString() };
    });
    await this.mailer.send("EXTENDED", id);
    return detail;
  }

  async answer(id: string, data: { outcome: ComplaintOutcome; answer: string }, actor: ComplaintOpsActor, now = new Date()) {
    this.assertAdmin(actor);
    const detail = await this.mutate(id, actor, "complaint.answered", async (tx, complaint) => {
      assertCan("answer", complaint.status);
      await tx.complaint.update({ where: { id }, data: { status: nextStatus("answer", complaint.status), outcome: data.outcome, answer: data.answer.trim(), answeredAt: now } });
      await recordComplaintEvent(tx, id, { type: ComplaintEventType.ANSWERED, actor: ComplaintActor.OPS, actorId: actor.id, body: data.answer.trim(), meta: { outcome: data.outcome } });
      return { outcome: data.outcome };
    });
    await this.mailer.send("ANSWERED", id);
    return detail;
  }

  async attachment(id: string, attachmentId: string) {
    const attachment = await this.prisma.complaintAttachment.findFirst({ where: { id: attachmentId, complaintId: id } });
    if (!attachment) throw new NotFoundException("Archivo no encontrado");
    return { bytes: await this.files.get(attachment.storageKey), fileName: attachment.fileName, contentType: attachment.contentType };
  }

  async exportCsv(from: string, to: string): Promise<string> {
    const start = laPazDayStart(new Date(`${from}T12:00:00Z`), 0);
    const end = laPazDayStart(new Date(`${to}T12:00:00Z`), 1);
    const rows = await this.prisma.complaint.findMany({
      where: { receivedAt: { gte: start, lt: end } },
      orderBy: { receivedAt: "asc" },
      include: { merchant: { select: { name: true } } },
    });
    const iso = (at: Date | null) => (at ? at.toISOString() : null);
    return toCsv(
      rows.map((row) => ({
        numero: row.number,
        recibido: iso(row.receivedAt),
        vence: iso(row.dueAt),
        extendido: iso(row.extendedAt),
        respondido: iso(row.answeredAt),
        dias_habiles: row.answeredAt ? businessDaysBetween(row.receivedAt, row.answeredAt) : null,
        categoria: row.category,
        pedido: row.request,
        resultado: row.outcome,
        estado: row.status,
        comercio: row.merchant?.name ?? row.storeNameGiven,
        pago: row.paymentIntentId,
      })),
      ["numero", "recibido", "vence", "extendido", "respondido", "dias_habiles", "categoria", "pedido", "resultado", "estado", "comercio", "pago"],
    );
  }
}
```

- [ ] **Step 5: Implement `ops-complaints.controller.ts`**

```ts
import { Body, Controller, Get, Header, Param, Post, Query, StreamableFile, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { OpsAuthGuard } from "../ops/guards/ops-auth.guard";
import { CurrentOpsUser } from "../ops/decorators/current-ops-user.decorator";
import { ComplaintOpsActor, ComplaintOpsService } from "./complaint-ops.service";
import { AnswerComplaintDto, AskMerchantDto, ComplaintNoteDto, ExportComplaintsQuery, ExtendComplaintDto, LinkComplaintDto, ListComplaintsQuery } from "./dto/ops-complaint.dto";

@ApiTags("ops")
@ApiBearerAuth()
@UseGuards(OpsAuthGuard)
@Controller("internal/complaints")
export class OpsComplaintsController {
  constructor(private readonly complaints: ComplaintOpsService) {}

  @Get() list(@Query() query: ListComplaintsQuery) { return this.complaints.list(query); }

  // Declared before ":id" so "export.csv" is never read as an id.
  @Get("export.csv")
  @Header("content-type", "text/csv; charset=utf-8")
  @Header("content-disposition", 'attachment; filename="reclamos.csv"')
  export(@Query() query: ExportComplaintsQuery) { return this.complaints.exportCsv(query.from, query.to); }

  @Get(":id") get(@Param("id") id: string) { return this.complaints.get(id); }
  @Post(":id/take") take(@Param("id") id: string, @CurrentOpsUser() actor: ComplaintOpsActor) { return this.complaints.take(id, actor); }
  @Post(":id/link") link(@Param("id") id: string, @Body() dto: LinkComplaintDto, @CurrentOpsUser() actor: ComplaintOpsActor) { return this.complaints.link(id, dto, actor); }
  @Post(":id/notes") note(@Param("id") id: string, @Body() dto: ComplaintNoteDto, @CurrentOpsUser() actor: ComplaintOpsActor) { return this.complaints.note(id, dto.body, actor); }
  @Post(":id/ask_merchant") ask(@Param("id") id: string, @Body() dto: AskMerchantDto, @CurrentOpsUser() actor: ComplaintOpsActor) { return this.complaints.askMerchant(id, dto.question, actor); }
  @Post(":id/extend") extend(@Param("id") id: string, @Body() dto: ExtendComplaintDto, @CurrentOpsUser() actor: ComplaintOpsActor) { return this.complaints.extend(id, dto.reason, actor); }
  @Post(":id/answer") answer(@Param("id") id: string, @Body() dto: AnswerComplaintDto, @CurrentOpsUser() actor: ComplaintOpsActor) { return this.complaints.answer(id, dto, actor); }

  @Get(":id/attachments/:attachmentId")
  async attachment(@Param("id") id: string, @Param("attachmentId") attachmentId: string) {
    const file = await this.complaints.attachment(id, attachmentId);
    return new StreamableFile(file.bytes, { type: file.contentType, disposition: `attachment; filename="${file.fileName}"` });
  }
}
```

Module: `imports: [DashboardModule, OpsModule, RefundsModule, SettlementModule]`, add `OpsComplaintsController` and `ComplaintOpsService`. In `apps/api/src/settlement/settlement.module.ts` add `SettlementAdminService` to `exports` (needed now because the constructor injects it). `OpsModule` must export `AuditLogService` and `OpsUserService` — `SettlementModule` already relies on both; confirm with `grep -n exports apps/api/src/ops/ops.module.ts`. If `RefundsModule` ↔ `SettlementModule` produce a circular import error at boot, use `forwardRef(() => RefundsModule)` in `ComplaintsModule` only.

- [ ] **Step 6: Run tests and type-check** — `nice npx jest src/complaints --runInBand && nice npx tsc --noEmit -p tsconfig.json; echo exit $?` → PASS, `exit 0`.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/complaints apps/api/src/settlement/settlement.module.ts
git commit -m "feat(complaints): ops queue by deadline, take, link, notes, ask the merchant, extend once, answer and CSV export"
```

---

### Task 7: Ops refund and payout pause from a complaint

**Files:**
- Modify: `apps/api/src/complaints/complaint-ops.service.ts`, `complaint-ops.service.spec.ts`, `ops-complaints.controller.ts`

**Interfaces:**
- Consumes: `RefundsService.create(merchantId: string, dto: CreateRefundDto, idempotencyKey?: string)` (`apps/api/src/refunds/refunds.service.ts`); `SettlementAdminService.placeHold(merchantId: string, reason: string, actor: SettlementActor): Promise<{ held: true }>`.
- Produces:
  - `ComplaintOpsService.refund(id: string, amount: number | undefined, actor: ComplaintOpsActor)` — admin only; idempotency key `complaint-${id}-refund-${n}`, `n` = existing `REFUNDED` events + 1
  - `ComplaintOpsService.pausePayouts(id: string, reason: string, actor: ComplaintOpsActor)` — any ops user; hold reason `Reclamo ${number}: ${reason}`
  - Routes `POST internal/complaints/:id/refund` (`ComplaintRefundDto`), `POST internal/complaints/:id/pause_payouts` (`ComplaintPauseDto`).

- [ ] **Step 1: Add failing tests** to `complaint-ops.service.spec.ts`:

```ts
describe("ComplaintOpsService money actions", () => {
  it("refunds the linked payment on the merchant's behalf with a per-refund idempotency key, then records it", async () => {
    const { db, refunds, audit, service } = setup(base());
    db.complaintEvent.count.mockResolvedValue(1);
    await service.refund(ID, 2500, admin);
    expect(refunds.create).toHaveBeenCalledWith("m_1", { paymentIntentId: "pi_1", amount: 2500, reason: "Reclamo R-2026-000042" }, `complaint-${ID}-refund-2`);
    expect(db.complaintEvent.create).toHaveBeenCalledWith({ data: expect.objectContaining({ type: ComplaintEventType.REFUNDED, meta: { refundId: "re_1", amount: 5000 } }) });
    expect(audit.record).toHaveBeenCalledWith(db, expect.objectContaining({ action: "complaint.refunded" }));
  });

  it("refuses a refund from an agent or without a linked payment", async () => {
    await expect(setup(base()).service.refund(ID, undefined, agent)).rejects.toThrow(ForbiddenException);
    await expect(setup(base({ paymentIntentId: null })).service.refund(ID, undefined, admin)).rejects.toThrow("Vincula el reclamo a un pago primero.");
  });

  it("pauses the merchant's payouts with the case number in the reason", async () => {
    const { settlementAdmin, db, service } = setup(base());
    await service.pausePayouts(ID, "Varios reclamos de entrega", agent);
    expect(settlementAdmin.placeHold).toHaveBeenCalledWith("m_1", "Reclamo R-2026-000042: Varios reclamos de entrega", agent);
    expect(db.complaintEvent.create).toHaveBeenCalledWith({ data: expect.objectContaining({ type: ComplaintEventType.PAYOUTS_PAUSED }) });
  });
});
```

- [ ] **Step 2: Run, expect failure** — `nice npx jest src/complaints/complaint-ops.service.spec.ts --runInBand` → FAIL ("service.refund is not a function").

- [ ] **Step 3: Implement.** First check what `RefundsService.create` returns: `grep -n "return" apps/api/src/refunds/refunds.service.ts | head`. Use its id and amount field names in `meta` (and in the test if they differ from `id`/`amount`). Add to `ComplaintOpsService`:

```ts
  /** The refund runs in RefundsService's own transaction (it draws from the merchant's held funds, sub-project 3);
   * the complaint event and audit entry follow it. A retry with the same n is idempotent. */
  async refund(id: string, amount: number | undefined, actor: ComplaintOpsActor) {
    this.assertAdmin(actor);
    const complaint = await this.prisma.complaint.findUnique({ where: { id } });
    if (!complaint) throw new NotFoundException("Reclamo no encontrado");
    assertCan("refund", complaint.status);
    if (!complaint.paymentIntentId || !complaint.merchantId) throw new ConflictException("Vincula el reclamo a un pago primero.");
    const n = (await this.prisma.complaintEvent.count({ where: { complaintId: id, type: ComplaintEventType.REFUNDED } })) + 1;
    const refund = await this.refunds.create(
      complaint.merchantId,
      { paymentIntentId: complaint.paymentIntentId, ...(amount ? { amount } : {}), reason: `Reclamo ${complaint.number}` },
      `complaint-${id}-refund-${n}`,
    );
    return this.mutate(id, actor, "complaint.refunded", async (tx) => {
      await recordComplaintEvent(tx, id, { type: ComplaintEventType.REFUNDED, actor: ComplaintActor.OPS, actorId: actor.id, meta: { refundId: refund.id, amount: refund.amount } });
      return { refundId: refund.id, amount: refund.amount };
    });
  }

  async pausePayouts(id: string, reason: string, actor: ComplaintOpsActor) {
    const complaint = await this.prisma.complaint.findUnique({ where: { id } });
    if (!complaint) throw new NotFoundException("Reclamo no encontrado");
    assertCan("pausePayouts", complaint.status);
    if (!complaint.merchantId) throw new ConflictException("Vincula el reclamo a un comercio primero.");
    await this.settlementAdmin.placeHold(complaint.merchantId, `Reclamo ${complaint.number}: ${reason.trim()}`, actor);
    return this.mutate(id, actor, "complaint.payouts_paused", async (tx) => {
      await recordComplaintEvent(tx, id, { type: ComplaintEventType.PAYOUTS_PAUSED, actor: ComplaintActor.OPS, actorId: actor.id, body: reason.trim() });
      return { merchantId: complaint.merchantId };
    });
  }
```

Controller additions (import `ComplaintRefundDto`, `ComplaintPauseDto`):

```ts
  @Post(":id/refund") refund(@Param("id") id: string, @Body() dto: ComplaintRefundDto, @CurrentOpsUser() actor: ComplaintOpsActor) { return this.complaints.refund(id, dto.amount, actor); }
  @Post(":id/pause_payouts") pause(@Param("id") id: string, @Body() dto: ComplaintPauseDto, @CurrentOpsUser() actor: ComplaintOpsActor) { return this.complaints.pausePayouts(id, dto.reason, actor); }
```

- [ ] **Step 4: Run tests, type-check** — `nice npx jest src/complaints src/settlement --runInBand --testPathIgnorePatterns integration && nice npx tsc --noEmit -p tsconfig.json; echo exit $?` → PASS, `exit 0`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/complaints
git commit -m "feat(complaints): ops refunds a complaint's payment from the merchant's held funds and can pause the merchant's payouts"
```

---

### Task 8: Merchant side

**Files:**
- Create: `apps/api/src/complaints/dto/merchant-reply.dto.ts`, `complaint-merchant.service.ts`, `complaint-merchant.service.spec.ts`, `dashboard-complaints.controller.ts`
- Modify: `apps/api/src/complaints/complaints.module.ts`

**Interfaces:**
- Consumes: `MerchantSessionGuard` (`apps/api/src/dashboard/guards/merchant-session.guard.ts`, sets `request.merchant = { id }` and `request.merchantUser = { id, email }`), `CurrentMerchant` (`apps/api/src/auth/decorators/current-merchant.decorator.ts`); `storeComplaintFiles` (Task 5).
- Produces:
  - `ComplaintMerchantService.list(merchantId: string, now?: Date)` → `Array<{ id, number, status, category, receivedAt, merchantDueAt, waitingOnYou: boolean, late: boolean }>`
  - `ComplaintMerchantService.get(merchantId: string, id: string)` → `{ id, number, status, category, request, description, buyerName, receivedAt, merchantDueAt, payment: { id, amount, currency, createdAt } | null, questions: Array<{ at, body }>, replies: Array<{ at, body, late, attachments }>, buyerAttachments: Array<{ id, fileName, contentType, sizeBytes }> }`
  - `ComplaintMerchantService.reply(merchantId, merchantUserId, id, body, uploads?, now?)` → same as `get`
  - `ComplaintMerchantService.attachment(merchantId, id, attachmentId)`
  - Routes under `v1/dashboard/complaints`: `GET /`, `GET /:id`, `POST /:id/reply` (multipart `files`, body field `body`), `GET /:id/attachments/:attachmentId`.

- [ ] **Step 1: DTO** (`dto/merchant-reply.dto.ts`)

```ts
import { ApiProperty } from "@nestjs/swagger";
import { IsString, Length } from "class-validator";

export class MerchantReplyDto {
  @ApiProperty() @IsString() @Length(10, 5000) body!: string;
}
```

- [ ] **Step 2: Write failing tests** (`complaint-merchant.service.spec.ts`)

```ts
import { ComplaintActor, ComplaintEventType, ComplaintStatus } from "@prisma/client";
import { ComplaintMerchantService } from "./complaint-merchant.service";

const NOW = new Date("2026-10-12T15:00:00Z");
const row = {
  id: "cmg1abcdefghijklmnopqrstu", number: "R-2026-000042", status: ComplaintStatus.WAITING_MERCHANT, category: "NOT_DELIVERED", request: "REFUND",
  description: "Nunca llegó.", buyerName: "Ana", buyerEmail: "ana@example.com", buyerPhone: "70000000", receivedAt: NOW, merchantId: "m_1",
  merchantDueAt: new Date("2026-10-13T03:59:59.999Z"), paymentIntent: { id: "pi_1", amount: 5000, currency: "BOB", createdAt: NOW },
  events: [
    { id: "e1", type: ComplaintEventType.RECEIVED, actor: ComplaintActor.BUYER, body: "Nunca llegó.", createdAt: NOW, meta: null, attachments: [{ id: "a1", fileName: "foto.jpg", contentType: "image/jpeg", sizeBytes: 10, uploadedBy: ComplaintActor.BUYER }] },
    { id: "e2", type: ComplaintEventType.NOTE, actor: ComplaintActor.OPS, body: "nota interna", createdAt: NOW, meta: null, attachments: [] },
    { id: "e3", type: ComplaintEventType.MERCHANT_ASKED, actor: ComplaintActor.OPS, body: "¿Enviaste el pedido?", createdAt: NOW, meta: null, attachments: [] },
  ],
};

function setup(found: any) {
  const db: any = {
    complaint: { findFirst: jest.fn().mockResolvedValue(found), findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
    complaintEvent: { create: jest.fn(async ({ data }) => ({ id: "e_new", ...data })) },
    complaintAttachment: { create: jest.fn(), findFirst: jest.fn() },
  };
  db.$transaction = jest.fn(async (cb: any) => cb(db));
  return { db, service: new ComplaintMerchantService(db, { put: jest.fn(), get: jest.fn() } as any) };
}

describe("ComplaintMerchantService", () => {
  it("only finds complaints linked to this merchant that ops has sent them", async () => {
    const { db, service } = setup(row);
    await service.get("m_1", row.id);
    expect(db.complaint.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: row.id, merchantId: "m_1", merchantDueAt: { not: null } } }));
  });

  it("is a 404 for another merchant's complaint", async () => {
    const { service } = setup(null);
    await expect(service.get("m_2", row.id)).rejects.toThrow("Reclamo no encontrado");
    await expect(service.reply("m_2", "mu_1", row.id, "Lo enviamos el lunes por courier.", [], NOW)).rejects.toThrow("Reclamo no encontrado");
  });

  it("never shows internal notes, the buyer's email or phone", async () => {
    const { service } = setup(row);
    const detail = JSON.stringify(await service.get("m_1", row.id));
    expect(detail).not.toContain("nota interna");
    expect(detail).not.toContain("ana@example.com");
    expect(detail).not.toContain("70000000");
    expect(detail).toContain("¿Enviaste el pedido?");
  });

  it("records a reply, marks it late after the reply-by date, and hands the complaint back to ops", async () => {
    const { db, service } = setup(row);
    await service.reply("m_1", "mu_1", row.id, "Lo enviamos el lunes por courier.", [], new Date("2026-10-13T12:00:00Z"));
    expect(db.complaint.update).toHaveBeenCalledWith({ where: { id: row.id }, data: { status: ComplaintStatus.IN_REVIEW } });
    expect(db.complaintEvent.create).toHaveBeenCalledWith({ data: expect.objectContaining({ type: ComplaintEventType.MERCHANT_REPLIED, actor: ComplaintActor.MERCHANT, actorId: "mu_1", meta: { late: true } }) });
  });

  it("refuses a reply nobody asked for", async () => {
    const { service } = setup({ ...row, status: ComplaintStatus.IN_REVIEW });
    await expect(service.reply("m_1", "mu_1", row.id, "Lo enviamos el lunes por courier.", [], NOW)).rejects.toThrow("No hay una consulta pendiente para el comercio.");
  });
});
```

- [ ] **Step 3: Run, expect failure** — `nice npx jest src/complaints/complaint-merchant.service.spec.ts --runInBand` → FAIL.

- [ ] **Step 4: Implement `complaint-merchant.service.ts`**

```ts
import { Injectable, NotFoundException } from "@nestjs/common";
import { ComplaintActor, ComplaintEventType, ComplaintStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { PrivateFilesService } from "../commerce-platform/private-files.service";
import { UploadedComplaintFile, checkComplaintFiles, safeFileName } from "./complaint-files";
import { recordComplaintEvent } from "./complaint-events";
import { assertCan, nextStatus } from "./complaint-state";
import { storeComplaintFiles } from "./complaint-intake.service";

const attachmentView = (a: { id: string; fileName: string; contentType: string; sizeBytes: number }) => ({ id: a.id, fileName: a.fileName, contentType: a.contentType, sizeBytes: a.sizeBytes });

@Injectable()
export class ComplaintMerchantService {
  constructor(private readonly prisma: PrismaService, private readonly files: PrivateFilesService) {}

  /** A merchant sees a complaint only once ops has asked them about it, and only their own. */
  private scope(merchantId: string, id?: string) {
    return { ...(id ? { id } : {}), merchantId, merchantDueAt: { not: null } };
  }

  async list(merchantId: string, now = new Date()) {
    const rows = await this.prisma.complaint.findMany({
      where: this.scope(merchantId),
      orderBy: { receivedAt: "desc" },
      take: 100,
      select: { id: true, number: true, status: true, category: true, receivedAt: true, merchantDueAt: true },
    });
    return rows.map((row) => {
      const waitingOnYou = row.status === ComplaintStatus.WAITING_MERCHANT;
      return { ...row, waitingOnYou, late: waitingOnYou && !!row.merchantDueAt && row.merchantDueAt.getTime() < now.getTime() };
    });
  }

  private async load(merchantId: string, id: string) {
    const complaint = await this.prisma.complaint.findFirst({
      where: this.scope(merchantId, id),
      include: {
        paymentIntent: { select: { id: true, amount: true, currency: true, createdAt: true } },
        events: { orderBy: { createdAt: "asc" }, include: { attachments: true } },
      },
    });
    if (!complaint) throw new NotFoundException("Reclamo no encontrado");
    return complaint;
  }

  async get(merchantId: string, id: string) {
    const c = await this.load(merchantId, id);
    return {
      id: c.id,
      number: c.number,
      status: c.status,
      category: c.category,
      request: c.request,
      description: c.description,
      buyerName: c.buyerName,
      receivedAt: c.receivedAt,
      merchantDueAt: c.merchantDueAt,
      payment: c.paymentIntent,
      questions: c.events.filter((e) => e.type === ComplaintEventType.MERCHANT_ASKED).map((e) => ({ at: e.createdAt, body: e.body ?? "" })),
      replies: c.events
        .filter((e) => e.type === ComplaintEventType.MERCHANT_REPLIED)
        .map((e) => ({ at: e.createdAt, body: e.body ?? "", late: Boolean((e.meta as { late?: boolean } | null)?.late), attachments: e.attachments.map(attachmentView) })),
      buyerAttachments: c.events.flatMap((e) => e.attachments.filter((a) => a.uploadedBy === ComplaintActor.BUYER)).map(attachmentView),
    };
  }

  async reply(merchantId: string, merchantUserId: string, id: string, body: string, uploads?: UploadedComplaintFile[], now = new Date()) {
    const complaint = await this.load(merchantId, id);
    assertCan("merchantReply", complaint.status);
    const stored = await storeComplaintFiles(this.files, checkComplaintFiles(uploads));
    const late = !!complaint.merchantDueAt && now.getTime() > complaint.merchantDueAt.getTime();
    await this.prisma.$transaction(async (tx) => {
      await tx.complaint.update({ where: { id }, data: { status: nextStatus("merchantReply", complaint.status) } });
      const event = await recordComplaintEvent(tx, id, { type: ComplaintEventType.MERCHANT_REPLIED, actor: ComplaintActor.MERCHANT, actorId: merchantUserId, body: body.trim(), meta: { late } });
      for (const { storageKey, file } of stored) {
        await tx.complaintAttachment.create({
          data: { complaintId: id, eventId: event.id, uploadedBy: ComplaintActor.MERCHANT, storageKey, fileName: safeFileName(file.originalname), contentType: file.contentType, sizeBytes: file.size },
        });
      }
    });
    return this.get(merchantId, id);
  }

  async attachment(merchantId: string, id: string, attachmentId: string) {
    await this.load(merchantId, id);
    const attachment = await this.prisma.complaintAttachment.findFirst({ where: { id: attachmentId, complaintId: id, uploadedBy: { in: [ComplaintActor.BUYER, ComplaintActor.MERCHANT] } } });
    if (!attachment) throw new NotFoundException("Archivo no encontrado");
    return { bytes: await this.files.get(attachment.storageKey), fileName: attachment.fileName, contentType: attachment.contentType };
  }
}
```

- [ ] **Step 5: Implement `dashboard-complaints.controller.ts`**

```ts
import { Body, Controller, Get, Param, Post, Req, StreamableFile, UploadedFiles, UseGuards, UseInterceptors } from "@nestjs/common";
import { FilesInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { MerchantSessionGuard } from "../dashboard/guards/merchant-session.guard";
import { CurrentMerchant } from "../auth/decorators/current-merchant.decorator";
import { MAX_COMPLAINT_FILES, MAX_COMPLAINT_FILE_BYTES, UploadedComplaintFile } from "./complaint-files";
import { ComplaintMerchantService } from "./complaint-merchant.service";
import { MerchantReplyDto } from "./dto/merchant-reply.dto";

@ApiTags("complaints")
@ApiBearerAuth()
@UseGuards(MerchantSessionGuard)
@Controller("v1/dashboard/complaints")
export class DashboardComplaintsController {
  constructor(private readonly complaints: ComplaintMerchantService) {}

  @Get() list(@CurrentMerchant() merchant: { id: string }) { return this.complaints.list(merchant.id); }
  @Get(":id") get(@CurrentMerchant() merchant: { id: string }, @Param("id") id: string) { return this.complaints.get(merchant.id, id); }

  @Post(":id/reply")
  @UseInterceptors(FilesInterceptor("files", MAX_COMPLAINT_FILES, { limits: { fileSize: MAX_COMPLAINT_FILE_BYTES } }))
  reply(@CurrentMerchant() merchant: { id: string }, @Req() request: { merchantUser: { id: string } }, @Param("id") id: string, @Body() dto: MerchantReplyDto, @UploadedFiles() files: UploadedComplaintFile[]) {
    return this.complaints.reply(merchant.id, request.merchantUser.id, id, dto.body, files);
  }

  @Get(":id/attachments/:attachmentId")
  async attachment(@CurrentMerchant() merchant: { id: string }, @Param("id") id: string, @Param("attachmentId") attachmentId: string) {
    const file = await this.complaints.attachment(merchant.id, id, attachmentId);
    return new StreamableFile(file.bytes, { type: file.contentType, disposition: `attachment; filename="${file.fileName}"` });
  }
}
```

Register `DashboardComplaintsController` and `ComplaintMerchantService` in `complaints.module.ts`. If Nest reports a missing dependency for `MerchantSessionGuard`, add `AuthModule` to `imports` (the settlement module imports both `AuthModule` and `DashboardModule` for its merchant guard).

- [ ] **Step 6: Run tests, type-check, boot-check the module graph**

Run: `nice npx jest src/complaints --runInBand && nice npx tsc --noEmit -p tsconfig.json; echo exit $?` → PASS, `exit 0`.
Then: `nice npx jest src/inbox/inbox-module-wiring.spec.ts --runInBand` — it compiles the real `AppModule`; a missing provider in `ComplaintsModule` fails here.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/complaints
git commit -m "feat(complaints): merchants see only complaints ops sent them, without the buyer's contact or internal notes, and reply with files"
```

---

### Task 9: Morning reminder job

**Files:**
- Create: `apps/api/src/complaints/complaint-reminder.job.ts`, `complaint-reminder.job.spec.ts`
- Modify: `apps/api/src/complaints/complaints.module.ts`

**Interfaces:**
- Consumes: `ComplaintMailer.send`, `ComplaintMailer.sendOpsDigest` (Task 4), `unresolvedEmailFailures` (Task 6), `addBusinessDays` (Task 2).
- Produces: `ComplaintReminderJob.run(now?: Date)` (cron `0 8 * * *`, `America/La_Paz`, advisory lock `hashtext('complaint-reminders')`); `digest(now)`, `retryFailedEmails(now)`.

- [ ] **Step 1: Write failing tests**

```ts
import { ComplaintEventType, ComplaintStatus } from "@prisma/client";
import { ComplaintReminderJob } from "./complaint-reminder.job";

const NOW = new Date("2026-10-08T12:00:00Z");

function setup() {
  const prisma: any = {
    complaint: { findMany: jest.fn().mockResolvedValue([]) },
    complaintEvent: { findMany: jest.fn().mockResolvedValue([]) },
    $queryRaw: jest.fn().mockResolvedValue([{ locked: true }]),
  };
  prisma.$transaction = jest.fn(async (cb: any) => cb(prisma));
  const mailer = { send: jest.fn().mockResolvedValue(true), sendOpsDigest: jest.fn() };
  return { prisma, mailer, job: new ComplaintReminderJob(prisma, mailer as any) };
}

describe("ComplaintReminderJob", () => {
  it("digests open complaints due by the end of the next business day, overdue flagged", async () => {
    const { prisma, mailer, job } = setup();
    prisma.complaint.findMany.mockResolvedValue([
      { number: "R-2026-000001", dueAt: new Date("2026-10-08T03:59:59.999Z"), merchant: null },
      { number: "R-2026-000002", dueAt: new Date("2026-10-10T03:59:59.999Z"), merchant: { name: "Tienda" } },
    ]);
    await job.digest(NOW);
    expect(prisma.complaint.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { status: { in: [ComplaintStatus.RECEIVED, ComplaintStatus.IN_REVIEW, ComplaintStatus.WAITING_MERCHANT] }, dueAt: { lte: new Date("2026-10-10T03:59:59.999Z") } },
    }));
    expect(mailer.sendOpsDigest).toHaveBeenCalledWith([
      { number: "R-2026-000001", dueAt: new Date("2026-10-08T03:59:59.999Z"), overdue: true, merchantName: null },
      { number: "R-2026-000002", dueAt: new Date("2026-10-10T03:59:59.999Z"), overdue: false, merchantName: "Tienda" },
    ]);
  });

  it("re-sends each failed email kind once, unless a later send of that kind succeeded", async () => {
    const { prisma, mailer, job } = setup();
    prisma.complaintEvent.findMany.mockResolvedValue([
      { complaintId: "c1", type: ComplaintEventType.EMAIL_FAILED, meta: { kind: "RECEIVED" } },
      { complaintId: "c1", type: ComplaintEventType.EMAIL_FAILED, meta: { kind: "RECEIVED" } },
      { complaintId: "c2", type: ComplaintEventType.EMAIL_FAILED, meta: { kind: "ANSWERED" } },
      { complaintId: "c2", type: ComplaintEventType.EMAIL_SENT, meta: { kind: "ANSWERED" } },
    ]);
    await job.retryFailedEmails(NOW);
    expect(mailer.send).toHaveBeenCalledTimes(1);
    expect(mailer.send).toHaveBeenCalledWith("RECEIVED", "c1");
  });

  it("skips the run when another replica holds the lock", async () => {
    const { prisma, mailer, job } = setup();
    prisma.$queryRaw.mockResolvedValue([{ locked: false }]);
    await job.run(NOW);
    expect(mailer.sendOpsDigest).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run, expect failure.**

- [ ] **Step 3: Implement `complaint-reminder.job.ts`**

```ts
import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { ComplaintEventType, ComplaintStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { addBusinessDays } from "./complaint-dates";
import { ComplaintMailer } from "./complaint-mailer";
import type { ComplaintEmailKind } from "./complaint-emails";
import { unresolvedEmailFailures } from "./complaint-ops.service";

const RETRY_WINDOW_MS = 14 * 24 * 60 * 60_000;

/** 08:00 La Paz: tell ops what is due by the next business day and retry buyer/merchant emails that failed. */
@Injectable()
export class ComplaintReminderJob {
  private readonly logger = new Logger(ComplaintReminderJob.name);

  constructor(private readonly prisma: PrismaService, private readonly mailer: ComplaintMailer) {}

  /** Same single-runner pattern as PayoutScheduleJob: a transaction-scoped advisory lock held while the work runs. */
  @Cron("0 8 * * *", { name: "complaint-reminders", timeZone: "America/La_Paz" })
  async run(now = new Date()): Promise<void> {
    try {
      await this.prisma.$transaction(
        async (tx) => {
          const [lock] = await tx.$queryRaw<{ locked: boolean }[]>`SELECT pg_try_advisory_xact_lock(hashtext('complaint-reminders')) AS locked`;
          if (!lock?.locked) return;
          await this.digest(now).catch((error) => this.logger.error(`Complaint digest failed: ${(error as Error).message}`));
          await this.retryFailedEmails(now).catch((error) => this.logger.error(`Complaint email retry failed: ${(error as Error).message}`));
        },
        { timeout: 10 * 60_000 },
      );
    } catch (error) {
      this.logger.error(`Complaint reminders failed: ${(error as Error).message}`, (error as Error).stack);
    }
  }

  async digest(now: Date): Promise<void> {
    const rows = await this.prisma.complaint.findMany({
      where: { status: { in: [ComplaintStatus.RECEIVED, ComplaintStatus.IN_REVIEW, ComplaintStatus.WAITING_MERCHANT] }, dueAt: { lte: addBusinessDays(now, 1) } },
      orderBy: { dueAt: "asc" },
      select: { number: true, dueAt: true, merchant: { select: { name: true } } },
    });
    await this.mailer.sendOpsDigest(rows.map((row) => ({ number: row.number, dueAt: row.dueAt, overdue: row.dueAt.getTime() < now.getTime(), merchantName: row.merchant?.name ?? null })));
  }

  async retryFailedEmails(now: Date): Promise<void> {
    const events = await this.prisma.complaintEvent.findMany({
      where: { type: { in: [ComplaintEventType.EMAIL_FAILED, ComplaintEventType.EMAIL_SENT] }, createdAt: { gte: new Date(now.getTime() - RETRY_WINDOW_MS) } },
      orderBy: { createdAt: "asc" },
      select: { complaintId: true, type: true, meta: true },
    });
    const byComplaint = new Map<string, typeof events>();
    for (const event of events) byComplaint.set(event.complaintId, [...(byComplaint.get(event.complaintId) ?? []), event]);
    for (const [complaintId, list] of byComplaint) {
      for (const kind of unresolvedEmailFailures(list)) await this.mailer.send(kind as ComplaintEmailKind, complaintId);
    }
  }
}
```

Register `ComplaintReminderJob` in `complaints.module.ts` providers (`ScheduleModule` is already registered in `AppModule`; `PayoutScheduleJob` relies on it).

- [ ] **Step 4: Run tests, type-check** → PASS, `exit 0`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/complaints
git commit -m "feat(complaints): a morning digest of due and overdue complaints for ops, and a retry of emails that failed"
```

---

### Task 10: Integration tests on real Postgres

**Files:**
- Create: `apps/api/src/complaints/complaints.integration.spec.ts`

**Interfaces:**
- Consumes: `integrationDatabase(label)` (`apps/api/src/common/testing/integration-database.ts`) — `harness.describeDb`, `harness.create(): Promise<PrismaClient>`, `harness.drop()`; services from Tasks 5–8; `apps/api/src/settlement/settlement.integration.spec.ts` as the pattern for seeding a merchant and a captured payment with its ledger journal and settlement hold, and for wiring `RefundsService` / `SettlementAdminService` collaborators.

- [ ] **Step 1: Read `settlement.integration.spec.ts`** in full and note its seeding helper names and how it constructs `LedgerService`, `SettlementHoldService`, `AuditLogService`, `PayoutsService`.

- [ ] **Step 2: Write the tests.**

```ts
import { ComplaintEventType, ComplaintOutcome, OpsRole, PrismaClient } from "@prisma/client";
import { integrationDatabase } from "../common/testing/integration-database";
import { ComplaintIntakeService } from "./complaint-intake.service";
import { ComplaintMailer } from "./complaint-mailer";

const harness = integrationDatabase("complaints");
const config = { get: (key: string) => ({ "app.checkoutOrigin": "https://checkout.pagosya.bo", "app.merchantDashboardOrigin": "https://comercios.pagosya.bo", "app.orderTrackingSecret": "integration" } as Record<string, string>)[key] };
const files = { put: jest.fn(async () => "3f2504e0-4f89-11d3-9a0c-0305e82c3301"), get: jest.fn() };
const email = { send: jest.fn(async () => undefined) };
const dto = { buyerName: "Ana", buyerEmail: "ana@example.com", storeName: "Tienda Uno", category: "NOT_DELIVERED", request: "REFUND", description: "Pagué y el pedido nunca llegó a mi casa." } as any;

harness.describeDb("complaints (real Postgres)", () => {
  let prisma: PrismaClient;
  beforeAll(async () => { prisma = await harness.create(); }, 120_000);
  afterAll(async () => { await harness.drop(); });

  it("gives 20 simultaneous complaints 20 unique, consecutive numbers", async () => {
    const mailer = new ComplaintMailer(prisma as any, email as any, config as any);
    const intake = new ComplaintIntakeService(prisma as any, files as any, mailer, config as any);
    const now = new Date("2026-10-08T19:00:00Z");
    const results = await Promise.all(Array.from({ length: 20 }, () => intake.create(dto, [], now)));
    const numbers = results.map((r) => r.number).sort();
    expect(new Set(numbers).size).toBe(20);
    expect(numbers[0]).toBe("R-2026-000001");
    expect(numbers[19]).toBe("R-2026-000020");
  }, 60_000);

  it("records the whole journey and refunds from the merchant's held funds", async () => {
    // Body to write, using the seeding and wiring from settlement.integration.spec.ts:
    // 1. Seed merchant "m_it" (AGGREGATOR, ACTIVE, approved KYC), an OpsUser with role SUPPORT_ADMIN, a verified
    //    MerchantUser, and a captured payment "pi_it1" of 5000 BOB with its capture journal and settlement hold.
    // 2. Construct ComplaintIntakeService, ComplaintOpsService (real AuditLogService, real RefundsService and
    //    SettlementAdminService wired as in the settlement spec) and ComplaintMerchantService on `prisma`; keep
    //    `email` and `files` mocks.
    // 3. const { number } = await intake.create({ ...dto, reference: "pi_it1" }, []); find the complaint by number;
    //    expect merchantId "m_it".
    // 4. ops.take(id, admin); ops.askMerchant(id, "¿Enviaste el pedido?", admin);
    //    merchant.reply("m_it", merchantUserId, id, "Lo enviamos el lunes por courier.", []);
    //    ops.refund(id, undefined, admin);
    //    ops.answer(id, { outcome: ComplaintOutcome.UPHELD, answer: "Te devolvimos el dinero completo." }, admin).
    // 5. Event types in order, EMAIL_SENT filtered out, must equal:
    //    [RECEIVED, LINKED, TAKEN, MERCHANT_ASKED, MERCHANT_REPLIED, REFUNDED, ANSWERED].
    // 6. A Refund row exists for pi_it1, and the merchant's ledger/hold moved as the settlement spec's refund test
    //    asserts (reuse its balance helper).
    // 7. ops.answer again rejects with "Este reclamo ya fue respondido."; merchant.reply rejects with the same 409.
  }, 120_000);
});
```

Write steps 1–7 as real code in the second test; every call and expected value is named above.

- [ ] **Step 3: Run** — `cd apps/api && nice npx jest --config jest.integration.config.js src/complaints --runInBand` → PASS (2 tests). If it prints "SKIPPED", the dev Postgres isn't running: start it with `node ~/pagosYa/scripts/dev-db.mjs start`. The test creates its own `pagosya_it_complaints_*` database and drops it.

- [ ] **Step 4: Drift check — main session only, never a subagent.** Create a throwaway database from all migrations (same code path as `integrationDatabase.create`), run `npx prisma migrate diff --from-url <throwaway url> --to-schema-datamodel prisma/schema.prisma --script`, then drop it. Expected: no statements touching `Complaint*` tables or enums (pre-existing drift in unrelated tables is known).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/complaints/complaints.integration.spec.ts
git commit -m "test(complaints): concurrent case numbers and the full buyer→ops→merchant→refund→answer journey on real Postgres"
```

---

### Task 11: Checkout pages

**Files:**
- Create: `apps/checkout/src/complaints/complaints-form.ts`, `complaints-form.test.ts`, `complaints-page.ts`, `complaints-page.css`
- Modify: `apps/checkout/src/main.ts` (routes), `apps/checkout/src/legal-notice.ts` + `legal-notice.test.ts` (link)

**Interfaces:**
- Consumes: `API_BASE_URL` (`apps/checkout/src/api.ts`, ends in `/v1`), `app` (`apps/checkout/src/ui/app.ts`), `markPrivateStorePage` (`apps/checkout/src/store-seo.ts`), public API from Task 5.
- Produces:
  - `CATEGORY_OPTIONS`, `REQUEST_OPTIONS`, `BUYER_STATUS_LABEL`, `OUTCOME_LABEL`
  - `type ComplaintDraft = { buyerName; buyerEmail; buyerPhone; reference; storeName; category; request; description }` (all `string`)
  - `validateComplaintDraft(d: ComplaintDraft): Record<string, string>` (field → Spanish message; `{}` = valid)
  - `clientFileProblem(files: Array<{ name: string; size: number; type: string }>): string | null`
  - `complaintDateLabel(iso: string): string`
  - `mountComplaintForm(root: HTMLElement, prefillReference: string | null): void`, `mountComplaintTracking(root: HTMLElement, token: string): Promise<void>`
  - `complaintsLinkHtml(siteOrigin?: string): string` in `legal-notice.ts`

- [ ] **Step 1: Write failing tests** (`complaints-form.test.ts`)

```ts
import { describe, expect, it } from "vitest";
import { clientFileProblem, complaintDateLabel, validateComplaintDraft } from "./complaints-form";

const ok = { buyerName: "Ana", buyerEmail: "ana@example.com", buyerPhone: "", reference: "pi_abc123", storeName: "", category: "NOT_DELIVERED", request: "REFUND", description: "Pagué y el pedido nunca llegó a mi casa." };

describe("complaint form", () => {
  it("accepts a complete draft", () => {
    expect(validateComplaintDraft(ok)).toEqual({});
  });
  it("asks for a reference or a store name", () => {
    expect(validateComplaintDraft({ ...ok, reference: " ", storeName: "" })).toEqual({ reference: "Escribe la referencia de tu pago o el nombre de la tienda." });
  });
  it("checks email, description length and required choices", () => {
    const errors = validateComplaintDraft({ ...ok, buyerEmail: "ana@", description: "corto", category: "", request: "" });
    expect(Object.keys(errors).sort()).toEqual(["buyerEmail", "category", "description", "request"]);
  });
  it("refuses more than 3 files, files over 5 MB and other types before upload", () => {
    const jpg = { name: "a.jpg", size: 10, type: "image/jpeg" };
    expect(clientFileProblem([jpg, jpg, jpg, jpg])).toBe("Puedes adjuntar hasta 3 archivos.");
    expect(clientFileProblem([{ ...jpg, size: 5_000_001 }])).toBe("Cada archivo puede pesar hasta 5 MB.");
    expect(clientFileProblem([{ name: "a.gif", size: 10, type: "image/gif" }])).toBe("Solo se aceptan fotos JPG o PNG y archivos PDF.");
    expect(clientFileProblem([jpg, { name: "b.pdf", size: 10, type: "application/pdf" }])).toBeNull();
  });
  it("shows dates in La Paz", () => {
    expect(complaintDateLabel("2026-10-16T03:59:59.999Z")).toContain("15 de octubre de 2026");
  });
});
```

Add to `legal-notice.test.ts`:

```ts
it("links the complaints page", () => {
  expect(complaintsLinkHtml("https://checkout.pagosya.bo")).toBe('<a href="https://checkout.pagosya.bo/reclamos" target="_blank" rel="noopener">Presentar un reclamo</a>');
});
```

(import `complaintsLinkHtml` alongside the existing imports).

- [ ] **Step 2: Run, expect failure** — `cd apps/checkout && nice npx vitest run src/complaints src/legal-notice.test.ts` → FAIL.

- [ ] **Step 3: Implement `complaints-form.ts`**

```ts
export const CATEGORY_OPTIONS = [
  { value: "NOT_DELIVERED", label: "No recibí mi pedido" },
  { value: "NOT_AS_DESCRIBED", label: "El producto es distinto o llegó dañado" },
  { value: "UNRECOGNIZED_CHARGE", label: "No reconozco este cobro" },
  { value: "DUPLICATE_CHARGE", label: "Me cobraron dos veces" },
  { value: "REFUND_NOT_RECEIVED", label: "No recibí mi reembolso" },
  { value: "OTHER", label: "Otro" },
];
export const REQUEST_OPTIONS = [
  { value: "REFUND", label: "Que me devuelvan el dinero" },
  { value: "DELIVERY", label: "Que me entreguen el pedido" },
  { value: "OTHER", label: "Otra solución" },
];
export const BUYER_STATUS_LABEL = { RECEIVED: "Recibido", IN_REVIEW: "En revisión", ANSWERED: "Respondido" } as const;
export const OUTCOME_LABEL: Record<string, string> = { UPHELD: "A tu favor", PARTIALLY_UPHELD: "Parcialmente a tu favor", NOT_UPHELD: "No a tu favor" };

export type ComplaintDraft = { buyerName: string; buyerEmail: string; buyerPhone: string; reference: string; storeName: string; category: string; request: string; description: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ALLOWED = ["image/jpeg", "image/png", "application/pdf"];

export function validateComplaintDraft(d: ComplaintDraft): Record<string, string> {
  const errors: Record<string, string> = {};
  if (d.buyerName.trim().length < 2) errors.buyerName = "Escribe tu nombre.";
  if (!EMAIL.test(d.buyerEmail.trim())) errors.buyerEmail = "Escribe un correo válido; ahí te enviaremos la respuesta.";
  if (!d.reference.trim() && !d.storeName.trim()) errors.reference = "Escribe la referencia de tu pago o el nombre de la tienda.";
  if (!d.category) errors.category = "Elige qué pasó.";
  if (!d.request) errors.request = "Elige qué solución esperas.";
  const length = d.description.trim().length;
  if (length < 20 || length > 5000) errors.description = "Cuéntanos qué pasó (entre 20 y 5000 caracteres).";
  return errors;
}

export function clientFileProblem(files: Array<{ name: string; size: number; type: string }>): string | null {
  if (files.length > 3) return "Puedes adjuntar hasta 3 archivos.";
  if (files.some((file) => file.size > 5_000_000)) return "Cada archivo puede pesar hasta 5 MB.";
  if (files.some((file) => !ALLOWED.includes(file.type))) return "Solo se aceptan fotos JPG o PNG y archivos PDF.";
  return null;
}

export function complaintDateLabel(iso: string): string {
  return new Intl.DateTimeFormat("es-BO", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "America/La_Paz" }).format(new Date(iso));
}
```

- [ ] **Step 4: Implement `complaints-page.ts`** (every interpolated value through `esc`; Spanish copy is final):

```ts
import "./complaints-page.css";
import { API_BASE_URL } from "../api";
import { markPrivateStorePage } from "../store-seo";
import { BUYER_STATUS_LABEL, CATEGORY_OPTIONS, OUTCOME_LABEL, REQUEST_OPTIONS, clientFileProblem, complaintDateLabel, validateComplaintDraft, type ComplaintDraft } from "./complaints-form";

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (char) => ESCAPES[char]);
const options = (list: Array<{ value: string; label: string }>) => `<option value="">Elige una opción</option>${list.map((o) => `<option value="${o.value}">${esc(o.label)}</option>`).join("")}`;
const DRAFT_FIELDS = ["buyerName", "buyerEmail", "buyerPhone", "reference", "storeName", "category", "request", "description"] as const;

async function apiError(response: Response): Promise<string> {
  if (response.status === 429) return "Enviaste demasiados reclamos seguidos. Intenta de nuevo en una hora.";
  const body = await response.json().catch(() => null);
  const message = Array.isArray(body?.message) ? body.message[0] : body?.message;
  return typeof message === "string" ? message : "No pudimos enviar tu reclamo. Intenta de nuevo.";
}

export function mountComplaintForm(root: HTMLElement, prefillReference: string | null): void {
  markPrivateStorePage();
  document.title = "Presentar un reclamo · pagosYa";
  root.innerHTML = `
  <main class="complaint-page">
    <h1>Presentar un reclamo</h1>
    <p class="complaint-lead">pagosYa registra tu reclamo, lo revisa con la tienda y te responde por escrito en un máximo de 5 días hábiles.</p>
    <form id="complaintForm" novalidate>
      <label>Tu nombre<input name="buyerName" autocomplete="name" required></label>
      <label>Tu correo<input name="buyerEmail" type="email" autocomplete="email" required></label>
      <label>Tu teléfono (opcional)<input name="buyerPhone" type="tel" autocomplete="tel"></label>
      <label>Referencia del pago<input name="reference" value="${esc(prefillReference ?? "")}" placeholder="La encuentras en tu recibo como «Orden: pi_…»"></label>
      <label>Si no tienes la referencia, nombre de la tienda<input name="storeName"></label>
      <label>¿Qué pasó?<select name="category" required>${options(CATEGORY_OPTIONS)}</select></label>
      <label>¿Qué solución esperas?<select name="request" required>${options(REQUEST_OPTIONS)}</select></label>
      <label>Cuéntanos qué pasó<textarea name="description" rows="6" maxlength="5000" required></textarea></label>
      <label>Fotos o documentos (opcional, hasta 3: JPG, PNG o PDF de 5 MB)<input name="files" type="file" multiple accept="image/jpeg,image/png,application/pdf"></label>
      <div class="complaint-trap" aria-hidden="true"><label>Sitio web<input name="website" tabindex="-1" autocomplete="off"></label></div>
      <p class="complaint-privacy">Usamos estos datos solo para atender tu reclamo. Compartimos con la tienda lo necesario para resolverlo, como indica nuestra <a href="https://pagosya.bo/privacidad" target="_blank" rel="noopener">Política de privacidad</a>.</p>
      <p class="complaint-error" id="complaintError" role="alert" hidden></p>
      <button type="submit" class="complaint-submit">Enviar reclamo</button>
    </form>
  </main>`;
  const form = root.querySelector<HTMLFormElement>("#complaintForm")!;
  const error = root.querySelector<HTMLElement>("#complaintError")!;
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const draft = Object.fromEntries(DRAFT_FIELDS.map((key) => [key, String(data.get(key) ?? "")])) as ComplaintDraft;
    const errors = validateComplaintDraft(draft);
    const files = (data.getAll("files") as File[]).filter((file) => file.size > 0);
    const fileProblem = clientFileProblem(files);
    form.querySelectorAll("[aria-invalid]").forEach((el) => el.removeAttribute("aria-invalid"));
    for (const name of Object.keys(errors)) form.querySelector(`[name="${name}"]`)?.setAttribute("aria-invalid", "true");
    const first = Object.values(errors)[0] ?? fileProblem;
    if (first) { error.textContent = first; error.hidden = false; return; }
    error.hidden = true;
    const body = new FormData();
    for (const [key, value] of Object.entries(draft)) if (value.trim()) body.append(key, value.trim());
    const trap = String(data.get("website") ?? "");
    if (trap) body.append("website", trap);
    for (const file of files) body.append("files", file);
    const button = form.querySelector<HTMLButtonElement>("button[type=submit]")!;
    button.disabled = true;
    button.textContent = "Enviando…";
    try {
      const response = await fetch(`${API_BASE_URL}/complaints`, { method: "POST", body });
      if (!response.ok) throw new Error(await apiError(response));
      const result = (await response.json()) as { number: string; dueAt: string; trackingUrl: string };
      root.querySelector("main")!.innerHTML = `
        <h1>Recibimos tu reclamo</h1>
        <p class="complaint-number">Número de reclamo: <strong>${esc(result.number)}</strong></p>
        <p>Te responderemos por escrito a más tardar el <strong>${esc(complaintDateLabel(result.dueAt))}</strong>.</p>
        <p>Te enviamos un correo con este número y un enlace para seguir tu reclamo.</p>
        <p><a href="${esc(result.trackingUrl)}">Ver mi reclamo</a></p>`;
    } catch (cause) {
      error.textContent = (cause as Error).message;
      error.hidden = false;
      button.disabled = false;
      button.textContent = "Enviar reclamo";
    }
  });
}

type TrackingView = {
  number: string; status: keyof typeof BUYER_STATUS_LABEL; dueAt: string; extendedAt: string | null; extensionReason: string | null;
  outcome: string | null; answer: string | null; secondInstanceNotice: string | null;
  messages: Array<{ id: string; at: string; body: string; attachments: Array<{ id: string; fileName: string }> }>;
};

export async function mountComplaintTracking(root: HTMLElement, token: string): Promise<void> {
  markPrivateStorePage();
  document.title = "Tu reclamo · pagosYa";
  const headers = { authorization: `Bearer ${token}` };
  const render = (view: TrackingView) => {
    const answered = view.status === "ANSWERED";
    root.innerHTML = `
    <main class="complaint-page">
      <h1>Reclamo ${esc(view.number)}</h1>
      <p class="complaint-status">Estado: <strong>${esc(BUYER_STATUS_LABEL[view.status])}</strong></p>
      ${answered ? "" : `<p>Respuesta a más tardar el <strong>${esc(complaintDateLabel(view.dueAt))}</strong>.</p>`}
      ${view.extendedAt ? `<p>Extendimos el plazo. Motivo: ${esc(view.extensionReason)}</p>` : ""}
      ${answered ? `<section class="complaint-answer"><h2>Nuestra respuesta</h2><p>Resultado: <strong>${esc(OUTCOME_LABEL[view.outcome ?? ""] ?? "")}</strong></p><p>${esc(view.answer).replace(/\n/g, "<br>")}</p><p class="complaint-second-instance">${esc(view.secondInstanceNotice)}</p></section>` : ""}
      <section><h2>Lo que nos enviaste</h2>${view.messages.map((m) => `<article class="complaint-message"><time>${esc(complaintDateLabel(m.at))}</time><p>${esc(m.body).replace(/\n/g, "<br>")}</p>${m.attachments.map((a) => `<button type="button" class="complaint-file" data-attachment="${esc(a.id)}">${esc(a.fileName)}</button>`).join("")}</article>`).join("")}</section>
      ${answered ? "" : `<form id="complaintMessage"><label>Agregar información<textarea name="body" rows="4" maxlength="5000" required></textarea></label><label>Archivos (opcional)<input name="files" type="file" multiple accept="image/jpeg,image/png,application/pdf"></label><p class="complaint-error" id="messageError" role="alert" hidden></p><button type="submit">Enviar</button></form>`}
    </main>`;
    root.querySelectorAll<HTMLButtonElement>("[data-attachment]").forEach((button) => button.addEventListener("click", async () => {
      const response = await fetch(`${API_BASE_URL}/complaints/track/attachments/${encodeURIComponent(button.dataset.attachment!)}`, { headers });
      if (!response.ok) return;
      const url = URL.createObjectURL(await response.blob());
      window.open(url, "_blank", "noopener");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    }));
    const form = root.querySelector<HTMLFormElement>("#complaintMessage");
    form?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const data = new FormData(form);
      const files = (data.getAll("files") as File[]).filter((file) => file.size > 0);
      const error = root.querySelector<HTMLElement>("#messageError")!;
      const problem = String(data.get("body") ?? "").trim().length < 2 ? "Escribe tu mensaje." : clientFileProblem(files);
      if (problem) { error.textContent = problem; error.hidden = false; return; }
      const body = new FormData();
      body.append("body", String(data.get("body")).trim());
      for (const file of files) body.append("files", file);
      const response = await fetch(`${API_BASE_URL}/complaints/track/messages`, { method: "POST", headers, body });
      if (!response.ok) { error.textContent = await apiError(response); error.hidden = false; return; }
      render(await response.json());
    });
  };
  const response = await fetch(`${API_BASE_URL}/complaints/track`, { headers });
  if (!response.ok) {
    root.innerHTML = `<main class="complaint-page"><h1>Reclamo no encontrado</h1><p>Revisa que el enlace sea el de tu correo, o <a href="/reclamos">presenta un reclamo nuevo</a>.</p></main>`;
    return;
  }
  render(await response.json());
}
```

`complaints-page.css`: one centred column (`max-width: 640px; margin: 0 auto; padding: 32px 16px`), labels stacked with `display: grid; gap: 6px`, inputs/selects/textarea full width, `.complaint-trap { position: absolute; left: -10000px; width: 1px; height: 1px; overflow: hidden; }`, `.complaint-error { color: #b42318; }`, `[aria-invalid="true"] { border-color: #b42318; }`. Read `apps/checkout/src/documents/cobro-page.css` first and reuse its colour/radius/button variables instead of new values.

- [ ] **Step 5: Route in `main.ts`** — at the top of `main()`, before the verification route:

```ts
  const complaintToken = /^\/reclamos\/s\/([^/]+)\/?$/.exec(window.location.pathname)?.[1];
  if (complaintToken) {
    const { mountComplaintTracking } = await import("./complaints/complaints-page");
    let token = "";
    try { token = decodeURIComponent(complaintToken); } catch {}
    await mountComplaintTracking(app, token);
    return;
  }
  if (/^\/reclamos\/?$/.test(window.location.pathname)) {
    const { mountComplaintForm } = await import("./complaints/complaints-page");
    mountComplaintForm(app, new URLSearchParams(window.location.search).get("ref"));
    return;
  }
```

- [ ] **Step 6: Link from the legal notice** — in `legal-notice.ts` add:

```ts
export function complaintsLinkHtml(siteOrigin = window.location.origin): string {
  return `<a href="${siteOrigin}/reclamos" target="_blank" rel="noopener">Presentar un reclamo</a>`;
}
```

and append ` · ${complaintsLinkHtml()}` to the notice `legalNoticeHtml` returns, inside the same element. Update existing `legal-notice.test.ts` expectations that assert the whole notice string so they include the link.

- [ ] **Step 7: Run tests and type-check**

Run: `cd apps/checkout && nice npx vitest run && nice npx tsc --noEmit -p tsconfig.json; echo exit $?`
Expected: all pass, `exit 0`.

- [ ] **Step 8: Commit**

```bash
git add apps/checkout/src/complaints apps/checkout/src/main.ts apps/checkout/src/legal-notice.ts apps/checkout/src/legal-notice.test.ts
git commit -m "feat(checkout): /reclamos form and the buyer's tracking page, linked from the checkout's legal notice"
```

---

### Task 12: Links from receipts and pagosya.bo

**Files:**
- Create: `apps/api/src/complaints/complaint-links.ts`, `complaint-links.spec.ts`
- Modify: `apps/api/src/payment-intents/payment-intents.service.ts` (receipt send, the `this.email.send({ to: intent.customerEmail, …` call)
- Modify (owner's working copy, never commit): `/Users/saramia/pagosYaWeb` footer

**Interfaces:**
- Produces: `complaintsUrl(checkoutOrigin: string, paymentIntentId: string): string`, `complaintsTextLine(url: string): string`, `appendComplaintsFooter(html: string, url: string): string`.

- [ ] **Step 1: Failing tests** (`complaint-links.spec.ts`)

```ts
import { appendComplaintsFooter, complaintsTextLine, complaintsUrl } from "./complaint-links";

describe("complaint links in receipts", () => {
  const url = complaintsUrl("https://checkout.pagosya.bo/", "pi_abc123");
  it("prefills the payment reference", () => {
    expect(url).toBe("https://checkout.pagosya.bo/reclamos?ref=pi_abc123");
  });
  it("adds one plain-text line", () => {
    expect(complaintsTextLine(url)).toBe("\n¿Problemas con tu compra? Presenta un reclamo: https://checkout.pagosya.bo/reclamos?ref=pi_abc123\n");
  });
  it("puts the footer before </body>, or at the end when there is none", () => {
    expect(appendComplaintsFooter("<html><body><p>Hola</p></body></html>", url)).toMatch(/<p>Hola<\/p><p [^>]*>¿Problemas con tu compra\? <a href="https:\/\/checkout\.pagosya\.bo\/reclamos\?ref=pi_abc123"[^>]*>Presenta un reclamo<\/a><\/p><\/body><\/html>$/);
    expect(appendComplaintsFooter("<p>Hola</p>", url)).toMatch(/^<p>Hola<\/p><p /);
  });
});
```

- [ ] **Step 2: Run, expect failure.**

- [ ] **Step 3: Implement `complaint-links.ts`**

```ts
const escapeAttr = (value: string) => value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

export function complaintsUrl(checkoutOrigin: string, paymentIntentId: string): string {
  return `${checkoutOrigin.replace(/\/$/, "")}/reclamos?ref=${encodeURIComponent(paymentIntentId)}`;
}

export function complaintsTextLine(url: string): string {
  return `\n¿Problemas con tu compra? Presenta un reclamo: ${url}\n`;
}

/** A platform line every receipt carries (ASFI), outside whatever the store authored. */
export function appendComplaintsFooter(html: string, url: string): string {
  const footer = `<p style="margin:24px 0 0;font-size:12px;color:#6b6b73;text-align:center">¿Problemas con tu compra? <a href="${escapeAttr(url)}" style="color:#6b6b73">Presenta un reclamo</a></p>`;
  const at = html.toLowerCase().lastIndexOf("</body>");
  return at === -1 ? `${html}${footer}` : `${html.slice(0, at)}${footer}${html.slice(at)}`;
}
```

- [ ] **Step 4: Use it in the receipt.** In `payment-intents.service.ts`, just before `await this.email.send({ to: intent.customerEmail, …`:

```ts
      const complaintsLink = complaintsUrl(this.config?.get<string>("app.checkoutOrigin") ?? "http://localhost:5174", intent.id);
      if (html) html = appendComplaintsFooter(html, complaintsLink);
```

and in that call's `body` template insert `${complaintsTextLine(complaintsLink)}` immediately before `\nGracias por tu compra.`. Import the three helpers from `../complaints/complaint-links`. Update any receipt test asserting the whole body (`grep -rln "Gracias por tu compra" apps/api/src --include=*.spec.ts`).

- [ ] **Step 5: Run** — `cd apps/api && nice npx jest src/complaints src/payment-intents --runInBand` → PASS.

- [ ] **Step 6: pagosya.bo footer (owner's working copy).** In `/Users/saramia/pagosYaWeb`, find the footer (`grep -rln "terminos" /Users/saramia/pagosYaWeb/src --include=*.tsx`) and add, next to the Términos/Privacidad links and with the same element and classes, `Presentar un reclamo` → `https://checkout.pagosya.bo/reclamos`. **Do not commit in pagosYaWeb and do not run pnpm there** (it is an npm repo). Report the edited path.

- [ ] **Step 7: Commit (pagosYa only)**

```bash
git add apps/api/src/complaints/complaint-links.ts apps/api/src/complaints/complaint-links.spec.ts apps/api/src/payment-intents
git commit -m "feat(receipts): every receipt links to the complaints page with the payment reference filled in"
```

---

### Task 13: Ops "Reclamos" section

**Files:**
- Modify: `apps/ops/index.html`
- Create: `apps/ops/tests/ops-complaints.spec.mjs`

**Interfaces:**
- Consumes: ops routes from Tasks 6–7; the page's `api(path, options)`, `esc`, `dateTime`, `money` helpers and the signed-in role from `/internal/ops_users/me`.
- Produces: nav link `#reclamos`; `<section id="reclamos">` with `#complaintsRows` and `#complaintDetail`; element ids `#complaintOutcome`, `#complaintAnswer`, `#complaintAnswerSend`, `#complaintExtend`, `#complaintRefund`, `#complaintAskMerchant`, `#complaintPause`.

- [ ] **Step 1: Write the failing Playwright test** (`tests/ops-complaints.spec.mjs`). Copy `openOps` and its default routes from `tests/ops-settlement.spec.mjs`, adding a `role` option used for `/internal/ops_users/me` (default `"SUPPORT_ADMIN"`) and a default `[]` response for `/internal/complaints`:

```js
const row = (over = {}) => ({ id: "c1", number: "R-2026-000001", status: "RECEIVED", category: "NOT_DELIVERED", buyerName: "Ana", buyerEmail: "ana@example.com", merchant: { id: "m1", name: "Tienda Uno" }, receivedAt: "2026-10-01T15:00:00.000Z", dueAt: "2026-10-08T03:59:59.999Z", assignedTo: null, overdue: true, dueSoon: false, emailFailed: false, test: false, ...over });
const detail = (over = {}) => ({
  ...row(), description: "Nunca llegó mi pedido <b>urgente</b>.", request: "REFUND", buyerPhone: null, referenceGiven: "pi_1", storeNameGiven: null, outcome: null, answer: null, extendedAt: null, extensionReason: null, merchantDueAt: null, assignedOpsUser: null,
  payment: { id: "pi_1", amount: 5000, currency: "BOB", status: "SUCCEEDED", livemode: true, createdAt: "2026-09-30T15:00:00.000Z" },
  merchant: { id: "m1", name: "Tienda Uno", email: "t@example.com", payoutHeldAt: null },
  events: [{ id: "e1", type: "RECEIVED", actor: "BUYER", actorId: null, body: "Nunca llegó mi pedido <b>urgente</b>.", meta: null, createdAt: "2026-10-01T15:00:00.000Z", attachments: [] }],
  sameEmailCount: 1, ...over,
});

test("lists complaints by deadline, opens one, escapes the buyer's text and answers it", async ({ page }) => {
  const calls = [];
  await openOps(page, {
    onRequest: async (route, { path, method, request }) => {
      if (path === "/internal/complaints" && method === "GET") { await route.fulfill({ json: [row(), row({ id: "c2", number: "R-2026-000002", overdue: false, dueSoon: true, dueAt: "2026-10-10T03:59:59.999Z" })] }); return true; }
      if (path === "/internal/complaints/c1" && method === "GET") { await route.fulfill({ json: detail({ status: "IN_REVIEW" }) }); return true; }
      if (path === "/internal/complaints/c1/answer") { calls.push(JSON.parse(request.postData())); await route.fulfill({ json: detail({ status: "ANSWERED", outcome: "UPHELD", answer: "Te devolvimos el dinero completo." }) }); return true; }
      return false;
    },
  });
  await page.goto("/#reclamos");
  const rows = page.locator("#complaintsRows tr");
  await expect(rows.nth(0)).toContainText("R-2026-000001");
  await expect(rows.nth(0)).toHaveClass(/is-overdue/);
  await expect(rows.nth(1)).toHaveClass(/is-due-soon/);
  await rows.nth(0).click();
  await expect(page.locator("#complaintDetail")).toContainText("Nunca llegó mi pedido <b>urgente</b>.");
  await expect(page.locator("#complaintDetail")).toContainText("Otro reclamo del mismo correo");
  await page.selectOption("#complaintOutcome", "UPHELD");
  await page.fill("#complaintAnswer", "Te devolvimos el dinero completo.");
  await page.click("#complaintAnswerSend");
  await expect.poll(() => calls.length).toBe(1);
  expect(calls[0]).toEqual({ outcome: "UPHELD", answer: "Te devolvimos el dinero completo." });
  await expect(page.locator("#complaintDetail")).toContainText("Respondido");
});

test("an agent does not see extend, answer or refund", async ({ page }) => {
  await openOps(page, {
    role: "SUPPORT_AGENT",
    onRequest: async (route, { path }) => {
      if (path === "/internal/complaints") { await route.fulfill({ json: [row()] }); return true; }
      if (path === "/internal/complaints/c1") { await route.fulfill({ json: detail({ status: "IN_REVIEW" }) }); return true; }
      return false;
    },
  });
  await page.goto("/#reclamos");
  await page.locator("#complaintsRows tr").first().click();
  await expect(page.locator("#complaintAnswerSend")).toHaveCount(0);
  await expect(page.locator("#complaintExtend")).toHaveCount(0);
  await expect(page.locator("#complaintRefund")).toHaveCount(0);
  await expect(page.locator("#complaintAskMerchant")).toBeVisible();
});
```

- [ ] **Step 2: Run, expect failure** — `cd apps/ops && nice npx playwright test tests/ops-complaints.spec.mjs` → FAIL (no `#complaintsRows`). The config serves on port 4396; never point it at the owner's running ops server.

- [ ] **Step 3: Implement in `index.html`.**
  - Nav: `<a href="#reclamos">Reclamos</a>` after "Soporte de cuentas".
  - Section inside `<main>`, after the support section: heading "Reclamos de compradores"; filter `<select id="complaintsStatus">` with options Abiertos (value ""), Recibido, En revisión, Esperando al comercio, Respondido; search `<input id="complaintsSearch" placeholder="Número, correo o comercio">`; export controls `<input type="date" id="complaintsFrom">`, `<input type="date" id="complaintsTo">`, button `#complaintsExport` "Exportar CSV"; a table with headers Número · Vence · Estado · Comprador · Comercio · Asignado and `<tbody id="complaintsRows">`; `<div id="complaintDetail" class="panel" hidden>`.
  - CSS: `tr.is-overdue td { color: #b42318; font-weight: 600 }`, `tr.is-due-soon td:first-child::after { content: " · vence pronto"; color: #b54708; font-weight: 400 }`, `#complaintsRows tr { cursor: pointer }`.
  - Script (using the page's existing `api`, `esc`, `dateTime`, `money`; store the signed-in role from the existing whoami call in a variable `opsRole` if the page doesn't already keep it):

```js
  const COMPLAINT_STATUS = { RECEIVED: "Recibido", IN_REVIEW: "En revisión", WAITING_MERCHANT: "Esperando al comercio", ANSWERED: "Respondido" };
  const COMPLAINT_CATEGORY = { NOT_DELIVERED: "Pedido no recibido", NOT_AS_DESCRIBED: "Producto distinto o dañado", UNRECOGNIZED_CHARGE: "Cobro no reconocido", DUPLICATE_CHARGE: "Cobro duplicado", REFUND_NOT_RECEIVED: "Reembolso no recibido", OTHER: "Otro" };
  const COMPLAINT_OUTCOME = { UPHELD: "A favor del comprador", PARTIALLY_UPHELD: "Parcialmente a favor", NOT_UPHELD: "No a favor" };
  const COMPLAINT_EVENT = { RECEIVED: "Reclamo recibido", EMAIL_CONFIRMED: "Correo confirmado", BUYER_MESSAGE: "Mensaje del comprador", TAKEN: "Tomado", LINKED: "Vinculado", NOTE: "Nota interna", MERCHANT_ASKED: "Consulta al comercio", MERCHANT_REPLIED: "Respuesta del comercio", EXTENDED: "Plazo extendido", ANSWERED: "Respuesta enviada", REFUNDED: "Reembolso", PAYOUTS_PAUSED: "Desembolsos en pausa", EMAIL_SENT: "Correo enviado", EMAIL_FAILED: "Correo no entregado" };
  const complaintsRowsEl = document.getElementById("complaintsRows");
  const complaintDetailEl = document.getElementById("complaintDetail");

  async function loadComplaints() {
    const params = new URLSearchParams();
    const status = document.getElementById("complaintsStatus").value;
    const q = document.getElementById("complaintsSearch").value.trim();
    if (status) params.set("status", status);
    if (q) params.set("q", q);
    const rows = await api(`/internal/complaints${params.size ? `?${params}` : ""}`);
    complaintsRowsEl.innerHTML = rows.map((r) => `
      <tr class="${r.overdue ? "is-overdue" : r.dueSoon ? "is-due-soon" : ""}" data-complaint="${esc(r.id)}">
        <td>${esc(r.number)}${r.test ? ' <span class="badge">prueba</span>' : ""}${r.emailFailed ? ' <span class="badge">correo no entregado</span>' : ""}</td>
        <td>${esc(dateTime(r.dueAt))}</td>
        <td>${esc(COMPLAINT_STATUS[r.status])}</td>
        <td>${esc(r.buyerName)}<br><small>${esc(r.buyerEmail)}</small></td>
        <td>${esc(r.merchant?.name ?? "—")}</td>
        <td>${esc(r.assignedTo?.name ?? "—")}</td>
      </tr>`).join("") || `<tr><td colspan="6">No hay reclamos.</td></tr>`;
    complaintsRowsEl.querySelectorAll("[data-complaint]").forEach((tr) => tr.addEventListener("click", () => openComplaint(tr.dataset.complaint)));
  }

  async function complaintAction(id, path, body) {
    try {
      const detail = await api(`/internal/complaints/${encodeURIComponent(id)}/${path}`, { method: "POST", body: JSON.stringify(body ?? {}) });
      renderComplaint(detail);
      await loadComplaints();
    } catch (error) {
      errorEl.textContent = error.message;
      errorEl.hidden = false;
    }
  }

  async function openComplaintFile(id, attachmentId) {
    const res = await fetch(apiOriginEl.value.replace(/\/$/, "") + `/internal/complaints/${encodeURIComponent(id)}/attachments/${encodeURIComponent(attachmentId)}`, { headers: { authorization: "Bearer " + opsTokenEl.value } });
    if (!res.ok) return;
    const url = URL.createObjectURL(await res.blob());
    window.open(url, "_blank", "noopener");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  function renderComplaint(c) {
    const admin = opsRole === "SUPPORT_ADMIN";
    const open = c.status !== "ANSWERED";
    complaintDetailEl.hidden = false;
    complaintDetailEl.innerHTML = `
      <h3>Reclamo ${esc(c.number)} · ${esc(COMPLAINT_STATUS[c.status])}</h3>
      <p>Vence ${esc(dateTime(c.dueAt))}${c.extendedAt ? ` (extendido: ${esc(c.extensionReason)})` : ""}</p>
      <p><strong>${esc(c.buyerName)}</strong> · ${esc(c.buyerEmail)}${c.buyerPhone ? ` · ${esc(c.buyerPhone)}` : ""}</p>
      ${c.sameEmailCount ? `<p class="badge">Otro reclamo del mismo correo (${esc(c.sameEmailCount)})</p>` : ""}
      <p>${esc(COMPLAINT_CATEGORY[c.category])} · pide: ${esc(c.request)}</p>
      <p>${c.payment ? `Pago ${esc(c.payment.id)} · ${esc(money(c.payment.amount, c.payment.currency))} · ${esc(c.payment.status)}${c.payment.livemode ? "" : " · prueba"}` : `Sin pago vinculado (referencia escrita: ${esc(c.referenceGiven ?? "—")}, tienda: ${esc(c.storeNameGiven ?? "—")})`}</p>
      <p>${c.merchant ? `Comercio ${esc(c.merchant.name)}${c.merchant.payoutHeldAt ? " · desembolsos en pausa" : ""}` : "Sin comercio vinculado"}</p>
      <h4>Historial</h4>
      <ol class="complaint-history">${c.events.map((e) => `<li><time>${esc(dateTime(e.createdAt))}</time> · ${esc(COMPLAINT_EVENT[e.type] ?? e.type)}${e.body ? `<br>${esc(e.body)}` : ""}${e.attachments.map((a) => ` <button type="button" class="ghost" data-file="${esc(a.id)}">${esc(a.fileName)}</button>`).join("")}</li>`).join("")}</ol>
      ${open ? `<button type="button" id="complaintTake">Tomar</button>` : ""}
      ${open ? `<form id="complaintLinkForm"><label>Vincular pago<input id="complaintLinkPayment" placeholder="pi_…"></label><button type="submit">Vincular</button></form>` : ""}
      <form id="complaintNoteForm"><label>Nota interna<textarea id="complaintNote" rows="2"></textarea></label><button type="submit">Guardar nota</button></form>
      ${c.status === "IN_REVIEW" && c.merchant ? `<form id="complaintAskForm"><label>Consulta al comercio<textarea id="complaintQuestion" rows="2"></textarea></label><button type="submit" id="complaintAskMerchant">Consultar al comercio</button></form>` : ""}
      ${c.merchant && !c.merchant.payoutHeldAt ? `<form id="complaintPauseForm"><label>Motivo de la pausa<input id="complaintPauseReason"></label><button type="submit" id="complaintPause">Pausar desembolsos</button></form>` : ""}
      ${admin && open && !c.extendedAt ? `<form id="complaintExtendForm"><label>Motivo de la extensión<input id="complaintExtendReason"></label><button type="submit" id="complaintExtend">Extender plazo (5 días hábiles)</button></form>` : ""}
      ${admin && c.payment ? `<form id="complaintRefundForm"><label>Monto a reembolsar (Bs, vacío = total)<input id="complaintRefundAmount" inputmode="decimal"></label><button type="submit" id="complaintRefund">Reembolsar</button></form>` : ""}
      ${admin && (c.status === "IN_REVIEW" || c.status === "WAITING_MERCHANT") ? `<form id="complaintAnswerForm"><label>Resultado<select id="complaintOutcome"><option value="">Elige</option>${Object.entries(COMPLAINT_OUTCOME).map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join("")}</select></label><label>Respuesta al comprador<textarea id="complaintAnswer" rows="5"></textarea></label><button type="submit" id="complaintAnswerSend">Enviar respuesta final</button></form>` : ""}
      ${c.status === "ANSWERED" ? `<p><strong>${esc(COMPLAINT_OUTCOME[c.outcome] ?? "")}</strong></p><p>${esc(c.answer)}</p>` : ""}`;
    const on = (id, handler) => { const el = complaintDetailEl.querySelector(id); if (el) el.addEventListener(el.tagName === "FORM" ? "submit" : "click", (event) => { event.preventDefault(); handler(); }); };
    on("#complaintTake", () => complaintAction(c.id, "take"));
    on("#complaintLinkForm", () => complaintAction(c.id, "link", { paymentIntentId: complaintDetailEl.querySelector("#complaintLinkPayment").value.trim() }));
    on("#complaintNoteForm", () => complaintAction(c.id, "notes", { body: complaintDetailEl.querySelector("#complaintNote").value }));
    on("#complaintAskForm", () => complaintAction(c.id, "ask_merchant", { question: complaintDetailEl.querySelector("#complaintQuestion").value }));
    on("#complaintPauseForm", () => complaintAction(c.id, "pause_payouts", { reason: complaintDetailEl.querySelector("#complaintPauseReason").value }));
    on("#complaintExtendForm", () => complaintAction(c.id, "extend", { reason: complaintDetailEl.querySelector("#complaintExtendReason").value }));
    on("#complaintRefundForm", () => {
      const raw = complaintDetailEl.querySelector("#complaintRefundAmount").value.replace(",", ".").trim();
      complaintAction(c.id, "refund", raw ? { amount: Math.round(Number(raw) * 100) } : {});
    });
    on("#complaintAnswerForm", () => complaintAction(c.id, "answer", { outcome: complaintDetailEl.querySelector("#complaintOutcome").value, answer: complaintDetailEl.querySelector("#complaintAnswer").value }));
    complaintDetailEl.querySelectorAll("[data-file]").forEach((button) => button.addEventListener("click", () => openComplaintFile(c.id, button.dataset.file)));
  }

  async function openComplaint(id) {
    renderComplaint(await api(`/internal/complaints/${encodeURIComponent(id)}`));
  }

  document.getElementById("complaintsStatus").addEventListener("change", loadComplaints);
  document.getElementById("complaintsSearch").addEventListener("input", () => { clearTimeout(window.__complaintsSearchTimer); window.__complaintsSearchTimer = setTimeout(loadComplaints, 250); });
  document.getElementById("complaintsExport").addEventListener("click", async () => {
    const from = document.getElementById("complaintsFrom").value;
    const to = document.getElementById("complaintsTo").value;
    if (!from || !to) return;
    const res = await fetch(apiOriginEl.value.replace(/\/$/, "") + `/internal/complaints/export.csv?from=${from}&to=${to}`, { headers: { authorization: "Bearer " + opsTokenEl.value } });
    if (!res.ok) return;
    const link = document.createElement("a");
    link.href = URL.createObjectURL(await res.blob());
    link.download = `reclamos-${from}-${to}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 60_000);
  });
```

  Call `loadComplaints().catch(() => null)` wherever the page loads its other queues after connecting (next to the `api("/internal/payout_holds")` call).

- [ ] **Step 4: Run, expect pass** — `nice npx playwright test tests/ops-complaints.spec.mjs` → PASS; then `nice npx playwright test` (whole ops suite) → PASS; `node --check server.mjs`.

- [ ] **Step 5: Commit**

```bash
git add apps/ops/index.html apps/ops/tests/ops-complaints.spec.mjs
git commit -m "feat(ops): Reclamos queue by deadline with take, link, notes, ask the merchant, pause, and admin-only extend, refund and answer"
```

---

### Task 14: Merchant dashboard "Reclamos" panel

**Files:**
- Create: `apps/merchant-dashboard/src/complaints.mjs`, `src/complaints.test.mjs`, `src/complaints-panel.mjs`
- Modify: `apps/merchant-dashboard/index.html`, `src/dashboard.js`, `server.mjs`

**Interfaces:**
- Consumes: merchant routes from Task 8; dashboard `api(path, options)` (handles `FormData`; `{ raw: true }` returns a Blob), `setDashboardView`, `escapeHtml` from `./html.mjs`.
- Produces: `complaintStatusLabel(status)`, `complaintCategoryLabel(category)`, `replyByLabel(iso, now?)`, `canReply(detail)`; `mountComplaintsPanel({ api, signedIn }) → { show(): Promise<void> }`; dashboard view `complaints` at `#dashboard-complaints`.

- [ ] **Step 1: Failing tests** (`src/complaints.test.mjs`)

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { canReply, complaintCategoryLabel, complaintStatusLabel, replyByLabel } from "./complaints.mjs";

test("labels statuses from the merchant's point of view", () => {
  assert.equal(complaintStatusLabel("WAITING_MERCHANT"), "Esperando tu respuesta");
  assert.equal(complaintStatusLabel("IN_REVIEW"), "En revisión por pagosYa");
  assert.equal(complaintStatusLabel("ANSWERED"), "Cerrado");
  assert.equal(complaintCategoryLabel("DUPLICATE_CHARGE"), "Cobro duplicado");
});

test("says when the reply is due, and when it is late", () => {
  const now = new Date("2026-10-12T15:00:00Z");
  assert.equal(replyByLabel("2026-10-13T03:59:59.999Z", now), "Responde hasta hoy");
  assert.equal(replyByLabel("2026-10-14T03:59:59.999Z", now), "Responde hasta el 13/10/2026");
  assert.equal(replyByLabel("2026-10-12T03:59:59.999Z", now), "Fuera de plazo: responde lo antes posible");
});

test("only a complaint waiting on the merchant takes a reply", () => {
  assert.equal(canReply({ status: "WAITING_MERCHANT" }), true);
  assert.equal(canReply({ status: "IN_REVIEW" }), false);
});
```

- [ ] **Step 2: Run, expect failure** — `cd apps/merchant-dashboard && node --test src/complaints.test.mjs` → FAIL.

- [ ] **Step 3: Implement `src/complaints.mjs`**

```js
// America/La_Paz is UTC-4 all year; formatting by hand keeps output identical in every browser and in node --test.
const LA_PAZ_OFFSET_MS = 4 * 60 * 60 * 1000;
const laPazDay = (date) => new Date(date.getTime() - LA_PAZ_OFFSET_MS).toISOString().slice(0, 10);

const STATUS = { RECEIVED: "Recibido", IN_REVIEW: "En revisión por pagosYa", WAITING_MERCHANT: "Esperando tu respuesta", ANSWERED: "Cerrado" };
const CATEGORY = {
  NOT_DELIVERED: "Pedido no recibido",
  NOT_AS_DESCRIBED: "Producto distinto o dañado",
  UNRECOGNIZED_CHARGE: "Cobro no reconocido",
  DUPLICATE_CHARGE: "Cobro duplicado",
  REFUND_NOT_RECEIVED: "Reembolso no recibido",
  OTHER: "Otro",
};

export const complaintStatusLabel = (status) => STATUS[status] ?? status;
export const complaintCategoryLabel = (category) => CATEGORY[category] ?? category;
export const canReply = (detail) => detail?.status === "WAITING_MERCHANT";

export function replyByLabel(iso, now = new Date()) {
  if (!iso) return "";
  const due = new Date(iso);
  if (due.getTime() < now.getTime()) return "Fuera de plazo: responde lo antes posible";
  const day = laPazDay(due);
  if (day === laPazDay(now)) return "Responde hasta hoy";
  const [y, m, d] = day.split("-");
  return `Responde hasta el ${d}/${m}/${y}`;
}
```

- [ ] **Step 4: Implement `src/complaints-panel.mjs`**

```js
import { escapeHtml as esc } from "./html.mjs";
import { canReply, complaintCategoryLabel, complaintStatusLabel, replyByLabel } from "./complaints.mjs";

/**
 * Reclamos (ASFI sub-project 4): complaints pagosYa sent this merchant for their side. The merchant never answers
 * the buyer here; pagosYa does. Buyer contact details are not shown.
 */
export function mountComplaintsPanel({ api, signedIn }) {
  const root = document.getElementById("complaintsRoot");
  const money = (amount, currency) => `${(amount / 100).toFixed(2)} ${esc(currency)}`;
  const date = (iso) => new Date(iso).toLocaleDateString("es-BO", { timeZone: "America/La_Paz" });
  const paragraphs = (text) => esc(text).replace(/\n/g, "<br>");

  async function openFile(id, attachmentId) {
    const blob = await api(`/v1/dashboard/complaints/${encodeURIComponent(id)}/attachments/${encodeURIComponent(attachmentId)}`, { raw: true });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  const fileButtons = (id, files) => files.map((f) => `<button type="button" class="ghost" data-file="${esc(f.id)}" data-complaint="${esc(id)}">${esc(f.fileName)}</button>`).join(" ");

  async function renderDetail(id) {
    const d = await api(`/v1/dashboard/complaints/${encodeURIComponent(id)}`);
    root.innerHTML = `
      <button type="button" class="ghost" id="complaintsBack">← Reclamos</button>
      <h2>Reclamo ${esc(d.number)}</h2>
      <p>${esc(complaintStatusLabel(d.status))} · ${esc(complaintCategoryLabel(d.category))}${canReply(d) ? ` · <strong>${esc(replyByLabel(d.merchantDueAt))}</strong>` : ""}</p>
      ${d.payment ? `<p>Pago ${esc(d.payment.id)} · ${money(d.payment.amount, d.payment.currency)} · ${esc(date(d.payment.createdAt))}</p>` : ""}
      <h3>Lo que dice ${esc(d.buyerName)}</h3>
      <p>${paragraphs(d.description)}</p>
      ${d.buyerAttachments.length ? `<p>${fileButtons(d.id, d.buyerAttachments)}</p>` : ""}
      ${d.questions.map((q) => `<h3>Consulta de pagosYa (${esc(date(q.at))})</h3><p>${paragraphs(q.body)}</p>`).join("")}
      ${d.replies.map((r) => `<h3>Tu respuesta (${esc(date(r.at))})${r.late ? " · fuera de plazo" : ""}</h3><p>${paragraphs(r.body)}</p>${fileButtons(d.id, r.attachments)}`).join("")}
      ${canReply(d) ? `
      <form id="complaintReply">
        <label>Tu respuesta para pagosYa<textarea name="body" rows="6" minlength="10" maxlength="5000" required></textarea></label>
        <label>Comprobantes (opcional, hasta 3: JPG, PNG o PDF de 5 MB)<input name="files" type="file" multiple accept="image/jpeg,image/png,application/pdf"></label>
        <p class="notice error" id="complaintReplyError" role="alert" hidden></p>
        <button class="primary" type="submit">Enviar respuesta</button>
      </form>` : ""}`;
    root.querySelector("#complaintsBack").addEventListener("click", () => renderList());
    root.querySelectorAll("[data-file]").forEach((button) => button.addEventListener("click", () => openFile(button.dataset.complaint, button.dataset.file)));
    root.querySelector("#complaintReply")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      const body = new FormData();
      body.append("body", String(data.get("body") ?? "").trim());
      for (const file of data.getAll("files")) if (file.size > 0) body.append("files", file);
      try {
        await api(`/v1/dashboard/complaints/${encodeURIComponent(d.id)}/reply`, { method: "POST", body });
        await renderDetail(d.id);
      } catch (error) {
        const notice = root.querySelector("#complaintReplyError");
        notice.textContent = error.message;
        notice.hidden = false;
      }
    });
  }

  async function renderList() {
    const rows = await api("/v1/dashboard/complaints");
    root.innerHTML = rows.length
      ? `<h2>Reclamos</h2><p class="faint">Cuando un comprador presenta un reclamo sobre un pago tuyo, pagosYa lo revisa y te pide tu versión aquí.</p>
         <ul class="complaints-list">${rows.map((r) => `<li><button type="button" class="complaints-row" data-open="${esc(r.id)}"><strong>${esc(r.number)}</strong> · ${esc(complaintCategoryLabel(r.category))} · ${esc(complaintStatusLabel(r.status))}${r.waitingOnYou ? ` · <span class="${r.late ? "is-late" : ""}">${esc(replyByLabel(r.merchantDueAt))}</span>` : ""}</button></li>`).join("")}</ul>`
      : `<h2>Reclamos</h2><p class="faint">No tienes reclamos. Si un comprador presenta uno sobre un pago tuyo, te avisaremos por correo.</p>`;
    root.querySelectorAll("[data-open]").forEach((button) => button.addEventListener("click", () => renderDetail(button.dataset.open)));
  }

  return {
    async show() {
      if (!signedIn()) return;
      try { await renderList(); } catch (error) { root.innerHTML = `<p class="notice error" role="alert">${esc(error.message)}</p>`; }
    },
  };
}
```

- [ ] **Step 5: Wire it in.**
  - `index.html` nav, after the "Desembolsos" link: `<a class="dashboard-nav-button" href="#dashboard-complaints" data-dashboard-view="complaints"><span class="dashboard-nav-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M12 7v4"/><path d="M12 14h.01"/></svg></span>Reclamos</a>`; and next to `#contractsSection`: `<section class="complaints-view" id="complaintsSection" data-dashboard-page="complaints" aria-label="Reclamos" hidden><div id="complaintsRoot"></div></section>`.
  - `src/dashboard.js`: `import { mountComplaintsPanel } from "/src/complaints-panel.mjs";`; after `const contracts = mountContractsPanel(…)`: `const complaintsPanel = mountComplaintsPanel({ api, signedIn: () => !!sessionToken });`; in `setDashboardView` next to `if (nextView === "contracts") contracts.show();`: `if (nextView === "complaints") complaintsPanel.show();`. Search `dashboard.js` for every other place `"contracts"` is listed as a known view (e.g. an allow-list of views or hash routes) and add `"complaints"` the same way.
  - `server.mjs`: add `"/src/complaints.mjs", "/src/complaints-panel.mjs"` to the served-files array.

- [ ] **Step 6: Run** — `cd apps/merchant-dashboard && nice node --test unit/*.test.mjs src/*.test.mjs` → all pass; `node --check server.mjs`.

- [ ] **Step 7: Commit**

```bash
git add apps/merchant-dashboard/src/complaints.mjs apps/merchant-dashboard/src/complaints.test.mjs apps/merchant-dashboard/src/complaints-panel.mjs apps/merchant-dashboard/index.html apps/merchant-dashboard/src/dashboard.js apps/merchant-dashboard/server.mjs
git commit -m "feat(dashboard): Reclamos — merchants read what pagosYa asks, see the buyer's files and reply with their own"
```

---

### Task 15: Whole-branch verification

- [ ] **Step 1:** `cd apps/api && nice npx jest --runInBand` → all unit suites pass.
- [ ] **Step 2:** `cd apps/api && nice npx jest --config jest.integration.config.js --runInBand src/complaints src/settlement` → pass.
- [ ] **Step 3:** `cd apps/api && nice npx tsc --noEmit -p tsconfig.json` → exit 0.
- [ ] **Step 4:** `cd apps/checkout && nice npx vitest run && nice npx tsc --noEmit -p tsconfig.json` → pass.
- [ ] **Step 5:** `cd apps/ops && nice npx playwright test` → pass.
- [ ] **Step 6:** `cd apps/merchant-dashboard && nice node --test unit/*.test.mjs src/*.test.mjs` → pass.
- [ ] **Step 7:** Report: commits on `feature/asfi-program`, the migration still unapplied to the dev DB, the pagosYaWeb file edited (uncommitted), and the ⚖ items for the lawyer.
