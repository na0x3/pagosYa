# Payout Account Ownership Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** No payout goes to a bank account until ops have approved proof that it belongs to the verified person or company; account changes warn the merchant's users, stop payouts until approved, and wait 72 hours after approval.

**Architecture:** A new `PayoutAccount` record with its own review lifecycle (`apps/api/src/payout-accounts`), pure rules (banks, number normalisation, approval validation, `payableFrom`), a service + merchant/ops controllers, KYC linking, and a change to `PayoutsService.checkPayout` so payouts read only an approved, payable account. Dashboard gets structured account fields, an account panel with "Cambiar cuenta", and new balance lines; ops get a "Cuentas por revisar" queue.

**Tech Stack:** NestJS, Prisma/PostgreSQL, class-validator, Multer, Jest (+ `jest.integration.config.js`), node:test + Playwright (dashboard, port 4397 config), Playwright (ops, port 4396).

**Spec:** `docs/superpowers/specs/2026-10-08-payout-account-ownership-design.md`

**Deviations decided while planning (from the code):**
- The account (with its proof) is sent by the dashboard to `POST v1/dashboard/payout_accounts` first; the identity form then sends `payoutAccountId`. This keeps one upload path for first accounts and changes. `SubmitKycDto.payoutBankAccount` becomes optional (legacy text, written by the server from the account).
- Account decisions (approve/reject) happen in the "Cuentas por revisar" queue; the identity review card shows the linked account (bank, number, holder, proof button, status) and a link to it. Identity and account stay two separate decisions, as the spec requires.
- A merchant moving up a level with an already approved or waiting account reuses it (the form shows it read-only) instead of creating another.

## Global Constraints

- Work only in `/Users/saramia/pagosYa/.claude/worktrees/asfi-program`, branch `feature/asfi-program`.
- Never run `prisma migrate dev|deploy|diff|reset|push` or write to the dev DB (localhost:54329/pagosya). Hand-written migration + `npx prisma generate`; integration tests use throwaway `pagosya_it_*` DBs.
- `nice` + `--runInBand` for Jest; dashboard Playwright only through `.superpowers/sdd/2026-10-08-asfi-buyer-complaints/dashboard-pw.config.mjs` (port 4397), never :4323.
- Spanish (Bolivia) for every merchant/ops string; every typed value escaped before HTML.
- Proof: JPG, PNG or PDF by bytes, ≤ 5 MB, private bucket. Account number: digits after removing spaces and dashes, 6–20. Holder name 3–120 characters.
- First account: payable on approval. Change: payable 72 hours after approval. Approving a change needs `SUPPORT_ADMIN`.
- Level ≤ 1 → owner `PERSON`; level ≥ 2 → `COMPANY` or `SOLE_PROPRIETOR` (reason ≥ 8 chars). Three ticks required.
- Currency BOB only (international payments are off).

## Review Focus

1. **Two change requests sent at the same moment** — only one waiting account may exist; the second gets 409 "Ya tienes un cambio de cuenta en revisión". Pinned in Task 3 (service checks under the settlement lock) and Task 6 (concurrent creates on real Postgres).
2. **A payout batch running while ops approve a change** — the batch must never pay the new account before `payableFrom`, nor the old one once a change is waiting. Pinned in Task 5 (blocker precedence) and Task 6.
3. **A merchant using a session to change the account vs. an API key** — changes are session-only; an API key cannot redirect payouts. Pinned in Task 3 (controller uses `MerchantSessionGuard`; test asserts the guard metadata).
4. **The holder name or number in the proof belongs to someone else** — ops cannot approve without the three ticks; a level-1 account can only be `PERSON`. Pinned in Task 2 and Task 3.
5. **A merchant with only a legacy free-text account** — payouts stop with `account_missing` and the card says to add a proven account. Pinned in Task 5.

---

### Task 1: Schema and migration

**Files:** Modify `apps/api/prisma/schema.prisma`; create `apps/api/prisma/migrations/20261008180000_payout_account_ownership/migration.sql`.

**Produces:** `PayoutAccount` model, enums `PayoutAccountStatus` (`PENDING_REVIEW APPROVED REJECTED REPLACED`), `PayoutAccountOwner` (`PERSON COMPANY SOLE_PROPRIETOR`), `Payout.payoutAccountId`, back-relations `Merchant.payoutAccounts`, `OpsUser.reviewedPayoutAccounts @relation("PayoutAccountReviewer")`, `MerchantKycSubmission.payoutAccounts`, `PayoutAccount.payouts`.

- [ ] **Step 1:** Add to `schema.prisma` (after the `Payout` model):

```prisma
enum PayoutAccountStatus {
  PENDING_REVIEW
  APPROVED
  REJECTED
  REPLACED
}

enum PayoutAccountOwner {
  PERSON
  COMPANY
  SOLE_PROPRIETOR
}

// A bank account a merchant asked to be paid to, and the proof that it is theirs. Payouts use only an APPROVED
// one whose payableFrom has passed (payout account ownership check).
model PayoutAccount {
  id                  String                 @id @default(cuid())
  merchantId          String
  merchant            Merchant               @relation(fields: [merchantId], references: [id])
  currency            String                 @default("BOB")
  bankCode            String
  accountNumber       String
  holderName          String
  proofStorageKey     String
  proofFileName       String
  proofContentType    String
  status              PayoutAccountStatus    @default(PENDING_REVIEW)
  isChange            Boolean                @default(false)
  ownerType           PayoutAccountOwner?
  checks              Json?
  reviewNote          String?
  reviewedAt          DateTime?
  reviewedByOpsUserId String?
  reviewedByOpsUser   OpsUser?               @relation("PayoutAccountReviewer", fields: [reviewedByOpsUserId], references: [id])
  reviewedByLabel     String?
  payableFrom         DateTime?
  kycSubmissionId     String?
  kycSubmission       MerchantKycSubmission? @relation(fields: [kycSubmissionId], references: [id])
  createdAt           DateTime               @default(now())
  payouts             Payout[]

  @@index([merchantId, currency, status])
}
```

In `model Payout` add `payoutAccountId String?` and `payoutAccount PayoutAccount? @relation(fields: [payoutAccountId], references: [id])`. Back-relations: `Merchant { payoutAccounts PayoutAccount[] }`, `OpsUser { reviewedPayoutAccounts PayoutAccount[] @relation("PayoutAccountReviewer") }`, `MerchantKycSubmission { payoutAccounts PayoutAccount[] }`. Insert without running `prisma format` (it realigns unrelated models).

- [ ] **Step 2:** Migration SQL:

```sql
-- Payout account ownership check.
CREATE TYPE "PayoutAccountStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'REJECTED', 'REPLACED');
CREATE TYPE "PayoutAccountOwner" AS ENUM ('PERSON', 'COMPANY', 'SOLE_PROPRIETOR');

CREATE TABLE "PayoutAccount" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BOB',
    "bankCode" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "holderName" TEXT NOT NULL,
    "proofStorageKey" TEXT NOT NULL,
    "proofFileName" TEXT NOT NULL,
    "proofContentType" TEXT NOT NULL,
    "status" "PayoutAccountStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "isChange" BOOLEAN NOT NULL DEFAULT false,
    "ownerType" "PayoutAccountOwner",
    "checks" JSONB,
    "reviewNote" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewedByOpsUserId" TEXT,
    "reviewedByLabel" TEXT,
    "payableFrom" TIMESTAMP(3),
    "kycSubmissionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PayoutAccount_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PayoutAccount_merchantId_currency_status_idx" ON "PayoutAccount"("merchantId", "currency", "status");

ALTER TABLE "Payout" ADD COLUMN "payoutAccountId" TEXT;

ALTER TABLE "PayoutAccount" ADD CONSTRAINT "PayoutAccount_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PayoutAccount" ADD CONSTRAINT "PayoutAccount_reviewedByOpsUserId_fkey" FOREIGN KEY ("reviewedByOpsUserId") REFERENCES "OpsUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PayoutAccount" ADD CONSTRAINT "PayoutAccount_kycSubmissionId_fkey" FOREIGN KEY ("kycSubmissionId") REFERENCES "MerchantKycSubmission"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_payoutAccountId_fkey" FOREIGN KEY ("payoutAccountId") REFERENCES "PayoutAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

- [ ] **Step 3:** `cd apps/api && npx prisma validate && npx prisma generate && nice npx tsc --noEmit -p tsconfig.json; echo exit $?` → valid, generated, `exit 0`.
- [ ] **Step 4:** Commit `feat(payout-accounts): schema for payout accounts with their proof, review and payable date`.

---

### Task 2: Pure rules

**Files:** Create `apps/api/src/payout-accounts/bolivian-banks.ts`, `payout-account-rules.ts`, `payout-account-rules.spec.ts`.

**Produces:**
- `BOLIVIAN_BANKS: ReadonlyArray<{ code: string; name: string }>`; `bankName(code: string): string | null`
- `CHANGE_WAIT_MS = 72 * 60 * 60_000`
- `normaliseAccountNumber(raw: string): string` (throws `BadRequestException("El número de cuenta debe tener entre 6 y 20 dígitos.")`)
- `accountSnapshot(a: { bankCode: string; accountNumber: string; holderName: string }): string` → `"Banco Nacional de Bolivia 4012345678 — Ana Pérez"`
- `type ApprovalChecks = { nameMatches: boolean; numberMatches: boolean; bankMatches: boolean }`
- `validateApproval(input: { isChange: boolean; actorRole: OpsRole; level: number; checks: ApprovalChecks; ownerType: PayoutAccountOwner; reason?: string | null }): void` (throws `BadRequestException` / `ForbiddenException`)
- `payableFromFor(isChange: boolean, approvedAt: Date): Date`

- [ ] **Step 1: Failing tests** (`payout-account-rules.spec.ts`):

```ts
import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { OpsRole, PayoutAccountOwner } from "@prisma/client";
import { accountSnapshot, bankName, normaliseAccountNumber, payableFromFor, validateApproval } from "./payout-account-rules";

const ticks = { nameMatches: true, numberMatches: true, bankMatches: true };
const base = { isChange: false, actorRole: OpsRole.SUPPORT_AGENT, level: 1, checks: ticks, ownerType: PayoutAccountOwner.PERSON };

describe("payout account rules", () => {
  it("normalises account numbers and refuses anything else", () => {
    expect(normaliseAccountNumber(" 401-234 5678 ")).toBe("4012345678");
    for (const bad of ["12345", "1".repeat(21), "40123A5678", ""]) expect(() => normaliseAccountNumber(bad)).toThrow("El número de cuenta debe tener entre 6 y 20 dígitos.");
  });

  it("names banks and formats the payout snapshot", () => {
    expect(bankName("BNB")).toBe("Banco Nacional de Bolivia");
    expect(bankName("XYZ")).toBeNull();
    expect(accountSnapshot({ bankCode: "BNB", accountNumber: "4012345678", holderName: "Ana Pérez" })).toBe("Banco Nacional de Bolivia 4012345678 — Ana Pérez");
  });

  it("approves only with the three ticks", () => {
    expect(() => validateApproval(base)).not.toThrow();
    for (const key of ["nameMatches", "numberMatches", "bankMatches"] as const) {
      expect(() => validateApproval({ ...base, checks: { ...ticks, [key]: false } })).toThrow("Marca las tres comprobaciones antes de aprobar.");
    }
  });

  it("matches the owner type to the level", () => {
    expect(() => validateApproval({ ...base, ownerType: PayoutAccountOwner.COMPANY })).toThrow("Una cuenta de nivel 1 debe estar a nombre de la persona verificada.");
    expect(() => validateApproval({ ...base, level: 2, ownerType: PayoutAccountOwner.PERSON })).toThrow("Una cuenta de empresa debe estar a nombre de la empresa o, si es unipersonal, de su dueño.");
    expect(() => validateApproval({ ...base, level: 2, ownerType: PayoutAccountOwner.COMPANY })).not.toThrow();
  });

  it("asks a reason for a sole proprietorship", () => {
    expect(() => validateApproval({ ...base, level: 2, ownerType: PayoutAccountOwner.SOLE_PROPRIETOR, reason: "corta" })).toThrow("Explica por qué la cuenta unipersonal está a nombre del dueño.");
    expect(() => validateApproval({ ...base, level: 2, ownerType: PayoutAccountOwner.SOLE_PROPRIETOR, reason: "Empresa unipersonal, dueño es el representante legal" })).not.toThrow();
  });

  it("lets only an admin approve a change", () => {
    expect(() => validateApproval({ ...base, isChange: true })).toThrow(ForbiddenException);
    expect(() => validateApproval({ ...base, isChange: true, actorRole: OpsRole.SUPPORT_ADMIN })).not.toThrow();
  });

  it("makes a first account payable at once and a change 72 hours later", () => {
    const at = new Date("2026-10-08T19:00:00Z");
    expect(payableFromFor(false, at).toISOString()).toBe("2026-10-08T19:00:00.000Z");
    expect(payableFromFor(true, at).toISOString()).toBe("2026-10-11T19:00:00.000Z");
  });

  it("refuses with 400s", () => {
    expect(() => validateApproval({ ...base, checks: { ...ticks, bankMatches: false } })).toThrow(BadRequestException);
  });
});
```

- [ ] **Step 2:** Run `nice npx jest src/payout-accounts --runInBand` → FAIL (modules missing).
- [ ] **Step 3: Implement.** `bolivian-banks.ts`:

```ts
/** Banks a payout account can be in. Ops confirm this list before launch; add a bank here when a merchant needs it. */
export const BOLIVIAN_BANKS: ReadonlyArray<{ code: string; name: string }> = [
  { code: "BNB", name: "Banco Nacional de Bolivia" },
  { code: "BMSC", name: "Banco Mercantil Santa Cruz" },
  { code: "BCP", name: "Banco de Crédito de Bolivia" },
  { code: "BISA", name: "Banco BISA" },
  { code: "BUN", name: "Banco Unión" },
  { code: "BEC", name: "Banco Económico" },
  { code: "BGA", name: "Banco Ganadero" },
  { code: "BSOL", name: "BancoSol" },
  { code: "FIE", name: "Banco FIE" },
  { code: "FORT", name: "Banco Fortaleza" },
  { code: "PRODEM", name: "Banco Prodem" },
  { code: "ECOF", name: "Banco PYME Ecofuturo" },
  { code: "PCOM", name: "Banco PYME de la Comunidad" },
];

export function bankName(code: string): string | null {
  return BOLIVIAN_BANKS.find((bank) => bank.code === code)?.name ?? null;
}
```

`payout-account-rules.ts`:

```ts
import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { OpsRole, PayoutAccountOwner } from "@prisma/client";
import { bankName } from "./bolivian-banks";

export { bankName } from "./bolivian-banks";

/** After ops approve a change, the real owner gets this long to object before money moves to the new account. */
export const CHANGE_WAIT_MS = 72 * 60 * 60_000;

export function normaliseAccountNumber(raw: string): string {
  const digits = raw.replace(/[\s-]/g, "");
  if (!/^\d{6,20}$/.test(digits)) throw new BadRequestException("El número de cuenta debe tener entre 6 y 20 dígitos.");
  return digits;
}

export function accountSnapshot(a: { bankCode: string; accountNumber: string; holderName: string }): string {
  return `${bankName(a.bankCode) ?? a.bankCode} ${a.accountNumber} — ${a.holderName}`;
}

export type ApprovalChecks = { nameMatches: boolean; numberMatches: boolean; bankMatches: boolean };

export function validateApproval(input: { isChange: boolean; actorRole: OpsRole; level: number; checks: ApprovalChecks; ownerType: PayoutAccountOwner; reason?: string | null }): void {
  if (input.isChange && input.actorRole !== OpsRole.SUPPORT_ADMIN) throw new ForbiddenException("Solo un administrador puede aprobar un cambio de cuenta.");
  const { nameMatches, numberMatches, bankMatches } = input.checks;
  if (!(nameMatches === true && numberMatches === true && bankMatches === true)) throw new BadRequestException("Marca las tres comprobaciones antes de aprobar.");
  if (input.level <= 1 && input.ownerType !== PayoutAccountOwner.PERSON) throw new BadRequestException("Una cuenta de nivel 1 debe estar a nombre de la persona verificada.");
  if (input.level >= 2 && input.ownerType === PayoutAccountOwner.PERSON) throw new BadRequestException("Una cuenta de empresa debe estar a nombre de la empresa o, si es unipersonal, de su dueño.");
  if (input.ownerType === PayoutAccountOwner.SOLE_PROPRIETOR && (input.reason?.trim().length ?? 0) < 8) {
    throw new BadRequestException("Explica por qué la cuenta unipersonal está a nombre del dueño.");
  }
}

export function payableFromFor(isChange: boolean, approvedAt: Date): Date {
  return new Date(approvedAt.getTime() + (isChange ? CHANGE_WAIT_MS : 0));
}
```

- [ ] **Step 4:** Run tests → PASS. **Step 5:** Commit `feat(payout-accounts): bank list, account number, approval rules and the 72-hour wait for a change`.

---

### Task 3: Service, controllers, module

**Files:** Create `apps/api/src/payout-accounts/payout-accounts.service.ts`, `payout-accounts.service.spec.ts`, `dto/payout-account.dto.ts`, `dashboard-payout-accounts.controller.ts`, `ops-payout-accounts.controller.ts`, `payout-accounts.module.ts`; modify `apps/api/src/app.module.ts`.

**Consumes:** Task 2; `lockMerchantSettlement(tx, merchantId)` (`settlement/settlement-lock.ts`); `checkComplaintFiles`, `safeFileName` (`complaints/complaint-files.ts`); `PrivateFilesService`; `AuditLogService`; `EMAIL_PROVIDER`.

**Produces:**
- `PayoutAccountsService.create(merchantId: string, dto: CreatePayoutAccountDto, file: UploadedComplaintFile | undefined): Promise<MerchantPayoutAccountView>`
- `listForMerchant(merchantId): Promise<MerchantPayoutAccountView[]>` newest first; view = `{ id, bankCode, bankName, accountLast4, holderName, status, isChange, payableFrom, reviewNote, createdAt }`
- `pendingQueue(): Promise<OpsPayoutAccountRow[]>` oldest first; row = account fields + `merchant { id, name, email, level }` + `expected { level, legalName, legalRepName }` (from the linked submission, else the latest approved submission) + `kycPending: boolean`
- `approve(id, dto: ApprovePayoutAccountDto, actor: { id; name; email; role })`, `reject(id, reason, actor)` → the updated row
- `proof(id, actor)` → `{ bytes, fileName, contentType }`, audit `payout_account.proof_viewed`
- `rejectLinkedToSubmission(tx, submissionId, note): Promise<void>`
- Merchant routes (session only, `MerchantSessionGuard`): `GET v1/dashboard/payout_accounts`, `POST v1/dashboard/payout_accounts` (multipart field `proof`)
- Ops routes (`OpsAuthGuard`): `GET internal/payout_accounts`, `GET internal/payout_accounts/:id/proof`, `POST internal/payout_accounts/:id/approve`, `POST internal/payout_accounts/:id/reject`

- [ ] **Step 1: DTOs**

```ts
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { PayoutAccountOwner } from "@prisma/client";
import { Type } from "class-transformer";
import { IsBoolean, IsEnum, IsIn, IsOptional, IsString, Length, MaxLength, ValidateNested } from "class-validator";
import { BOLIVIAN_BANKS } from "../bolivian-banks";

export class CreatePayoutAccountDto {
  @ApiProperty() @IsIn(BOLIVIAN_BANKS.map((bank) => bank.code)) bankCode!: string;
  @ApiProperty() @IsString() @MaxLength(40) accountNumber!: string;
  @ApiProperty() @IsString() @Length(3, 120) holderName!: string;
}

class ChecksDto {
  @IsBoolean() nameMatches!: boolean;
  @IsBoolean() numberMatches!: boolean;
  @IsBoolean() bankMatches!: boolean;
}

export class ApprovePayoutAccountDto {
  @ApiProperty() @ValidateNested() @Type(() => ChecksDto) checks!: ChecksDto;
  @ApiProperty({ enum: PayoutAccountOwner }) @IsEnum(PayoutAccountOwner) ownerType!: PayoutAccountOwner;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

export class RejectPayoutAccountDto {
  @ApiProperty() @IsString() @Length(8, 500) reason!: string;
}
```

- [ ] **Step 2: Failing service tests** covering: create refuses an unknown bank number shape and a bad proof; create refuses a second waiting account (409 "Ya tienes un cambio de cuenta en revisión"); create marks `isChange` true when an approved account exists and emails every verified user (body contains "Si no fuiste tú" and the last 4 digits only); a first account sends no warning email; lock taken before the waiting-account check; approve validates (agent cannot approve a change), sets `payableFrom` (+72 h for a change), replaces the previous approved account in the same transaction, writes audit `payout_account.approved`, emails the date; reject requires a waiting account, writes audit, emails the reason; `rejectLinkedToSubmission` rejects only waiting accounts of that submission; `pendingQueue` derives `expected` from the linked submission; the merchant controller uses `MerchantSessionGuard` (assert via `Reflect.getMetadata("__guards__", DashboardPayoutAccountsController)`).

```ts
import { OpsRole, PayoutAccountOwner, PayoutAccountStatus } from "@prisma/client";
import { MerchantSessionGuard } from "../dashboard/guards/merchant-session.guard";
import { DashboardPayoutAccountsController } from "./dashboard-payout-accounts.controller";
import { PayoutAccountsService } from "./payout-accounts.service";

const NOW = new Date("2026-10-08T19:00:00Z");
const png = { originalname: "cert.png", mimetype: "image/png", size: 9, buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]) };
const dto = { bankCode: "BNB", accountNumber: "401-234-5678", holderName: "Ana Pérez" };
const admin = { id: "ops_a", name: "Ana", email: "ana@pagosya.bo", role: OpsRole.SUPPORT_ADMIN };
const agent = { id: "ops_b", name: "Beto", email: "beto@pagosya.bo", role: OpsRole.SUPPORT_AGENT };

function setup(state: { approved?: any; pending?: any; account?: any; merchantLevel?: number } = {}) {
  const db: any = {
    $executeRaw: jest.fn().mockResolvedValue(0),
    payoutAccount: {
      findFirst: jest.fn(async ({ where }) => (where.status === PayoutAccountStatus.PENDING_REVIEW ? state.pending ?? null : where.status === PayoutAccountStatus.APPROVED ? state.approved ?? null : null)),
      findUnique: jest.fn(async () => state.account ?? null),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(async ({ data }) => ({ id: "pa_new", createdAt: NOW, status: PayoutAccountStatus.PENDING_REVIEW, payableFrom: null, reviewNote: null, ...data })),
      update: jest.fn(async ({ data }) => ({ ...state.account, ...data })),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    merchant: { findUniqueOrThrow: jest.fn().mockResolvedValue({ id: "m_1", level: state.merchantLevel ?? 1 }) },
    merchantKycSubmission: { findFirst: jest.fn().mockResolvedValue({ legalName: "Ana Pérez", legalRepName: "Ana Pérez", targetLevel: 1 }) },
    merchantUser: { findMany: jest.fn().mockResolvedValue([{ email: "ana@tienda.bo" }, { email: "socio@tienda.bo" }]) },
  };
  db.$transaction = jest.fn(async (cb: any) => cb(db));
  const files = { put: jest.fn().mockResolvedValue("3f2504e0-4f89-11d3-9a0c-0305e82c3301"), get: jest.fn().mockResolvedValue(Buffer.from("x")) };
  const audit = { record: jest.fn() };
  const email = { send: jest.fn().mockResolvedValue(undefined) };
  return { db, files, audit, email, service: new PayoutAccountsService(db, files as any, audit as any, email as any) };
}

describe("PayoutAccountsService.create", () => {
  it("stores a first account as waiting, with no warning email", async () => {
    const { db, email, service } = setup();
    const view = await service.create("m_1", dto, png as any);
    expect(db.payoutAccount.create).toHaveBeenCalledWith({ data: expect.objectContaining({ merchantId: "m_1", bankCode: "BNB", accountNumber: "4012345678", holderName: "Ana Pérez", isChange: false, proofContentType: "image/png" }) });
    expect(view).toEqual(expect.objectContaining({ accountLast4: "5678", bankName: "Banco Nacional de Bolivia" }));
    expect(email.send).not.toHaveBeenCalled();
  });

  it("marks a change and warns every verified user, showing only the last 4 digits", async () => {
    const { db, email, service } = setup({ approved: { id: "pa_old" } });
    await service.create("m_1", dto, png as any);
    expect(db.payoutAccount.create).toHaveBeenCalledWith({ data: expect.objectContaining({ isChange: true }) });
    expect(email.send).toHaveBeenCalledTimes(2);
    const body = email.send.mock.calls[0][0].body as string;
    expect(body).toContain("Si no fuiste tú");
    expect(body).toContain("5678");
    expect(body).not.toContain("4012345678");
  });

  it("allows one waiting account at a time, checked under the merchant's lock", async () => {
    const { db, service } = setup({ pending: { id: "pa_wait" } });
    await expect(service.create("m_1", dto, png as any)).rejects.toThrow("Ya tienes un cambio de cuenta en revisión");
    expect(db.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(db.payoutAccount.findFirst.mock.invocationCallOrder[0]);
  });

  it("refuses a missing or wrong proof and a bad number", async () => {
    const { service } = setup();
    await expect(service.create("m_1", dto, undefined)).rejects.toThrow("Sube el certificado o la captura de tu banco.");
    await expect(service.create("m_1", dto, { ...png, buffer: Buffer.from("GIF89a") } as any)).rejects.toThrow("Solo se aceptan fotos JPG o PNG y archivos PDF.");
    await expect(service.create("m_1", { ...dto, accountNumber: "12" }, png as any)).rejects.toThrow("entre 6 y 20 dígitos");
  });

  it("is reachable only from a dashboard session, never an API key", () => {
    expect(Reflect.getMetadata("__guards__", DashboardPayoutAccountsController)).toEqual([MerchantSessionGuard]);
  });
});

describe("PayoutAccountsService review", () => {
  const waiting = (over = {}) => ({ id: "pa_new", merchantId: "m_1", currency: "BOB", status: PayoutAccountStatus.PENDING_REVIEW, isChange: false, kycSubmissionId: null, accountNumber: "4012345678", bankCode: "BNB", holderName: "Ana Pérez", ...over });
  const approveDto = { checks: { nameMatches: true, numberMatches: true, bankMatches: true }, ownerType: PayoutAccountOwner.PERSON };

  it("approves a first account payable at once", async () => {
    const { db, audit, service } = setup({ account: waiting() });
    await service.approve("pa_new", approveDto, agent, NOW);
    expect(db.payoutAccount.update).toHaveBeenCalledWith({ where: { id: "pa_new" }, data: expect.objectContaining({ status: PayoutAccountStatus.APPROVED, payableFrom: NOW, ownerType: PayoutAccountOwner.PERSON, reviewedByOpsUserId: "ops_b" }) });
    expect(audit.record).toHaveBeenCalledWith(db, expect.objectContaining({ action: "payout_account.approved" }));
  });

  it("approves a change only for an admin, 72 hours out, replacing the old account in the same transaction", async () => {
    await expect(setup({ account: waiting({ isChange: true }) }).service.approve("pa_new", approveDto, agent, NOW)).rejects.toThrow("Solo un administrador");
    const { db, email, service } = setup({ account: waiting({ isChange: true }) });
    await service.approve("pa_new", approveDto, admin, NOW);
    expect(db.payoutAccount.update).toHaveBeenCalledWith({ where: { id: "pa_new" }, data: expect.objectContaining({ payableFrom: new Date("2026-10-11T19:00:00.000Z") }) });
    expect(db.payoutAccount.updateMany).toHaveBeenCalledWith({ where: { merchantId: "m_1", currency: "BOB", status: PayoutAccountStatus.APPROVED, id: { not: "pa_new" } }, data: { status: PayoutAccountStatus.REPLACED } });
    expect(email.send.mock.calls[0][0].body).toContain("11/10/2026");
  });

  it("uses the identity submission's level for a first account", async () => {
    const { db, service } = setup({ account: waiting({ kycSubmissionId: "kyc_1" }), merchantLevel: 0 });
    db.merchantKycSubmission.findFirst.mockResolvedValue({ legalName: "Tienda SRL", legalRepName: "Ana Pérez", targetLevel: 2 });
    await expect(service.approve("pa_new", approveDto, agent, NOW)).rejects.toThrow("Una cuenta de empresa");
  });

  it("refuses to decide an account that is not waiting", async () => {
    const { service } = setup({ account: waiting({ status: PayoutAccountStatus.APPROVED }) });
    await expect(service.approve("pa_new", approveDto, admin, NOW)).rejects.toThrow("Esta cuenta ya fue revisada.");
    await expect(service.reject("pa_new", "No coincide el titular", admin)).rejects.toThrow("Esta cuenta ya fue revisada.");
  });

  it("rejects with a reason, audited and emailed", async () => {
    const { db, audit, email, service } = setup({ account: waiting({ isChange: true }) });
    await service.reject("pa_new", "El titular del certificado es otra persona", agent);
    expect(db.payoutAccount.update).toHaveBeenCalledWith({ where: { id: "pa_new" }, data: expect.objectContaining({ status: PayoutAccountStatus.REJECTED, reviewNote: "El titular del certificado es otra persona" }) });
    expect(audit.record).toHaveBeenCalledWith(db, expect.objectContaining({ action: "payout_account.rejected" }));
    expect(email.send.mock.calls[0][0].body).toContain("El titular del certificado es otra persona");
  });

  it("rejects the waiting first account of a rejected identity", async () => {
    const { db, service } = setup();
    await service.rejectLinkedToSubmission(db, "kyc_1", "Documentos ilegibles");
    expect(db.payoutAccount.updateMany).toHaveBeenCalledWith({ where: { kycSubmissionId: "kyc_1", status: PayoutAccountStatus.PENDING_REVIEW }, data: expect.objectContaining({ status: PayoutAccountStatus.REJECTED, reviewNote: "Documentos ilegibles" }) });
  });
});
```

- [ ] **Step 3:** Run → FAIL (modules missing).
- [ ] **Step 4: Implement `payout-accounts.service.ts`**

```ts
import { BadRequestException, ConflictException, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { OpsRole, PayoutAccountStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { PrivateFilesService } from "../commerce-platform/private-files.service";
import { AuditLogService } from "../ops/audit-log.service";
import { EMAIL_PROVIDER } from "../dashboard/tokens";
import { EmailProvider } from "../dashboard/interfaces/email-provider.interface";
import { lockMerchantSettlement } from "../settlement/settlement-lock";
import { checkComplaintFiles, safeFileName, type UploadedComplaintFile } from "../complaints/complaint-files";
import { bankName, normaliseAccountNumber, payableFromFor, validateApproval } from "./payout-account-rules";
import { ApprovePayoutAccountDto, CreatePayoutAccountDto } from "./dto/payout-account.dto";

export type PayoutAccountActor = { id: string; name: string; email: string; role: OpsRole };
const label = (actor: PayoutAccountActor) => `${actor.name} <${actor.email}>`;
const CURRENCY = "BOB";
const laPazDateTime = (at: Date) => new Intl.DateTimeFormat("es-BO", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "America/La_Paz" }).format(at);

type AccountRow = Prisma.PayoutAccountGetPayload<object>;

function merchantView(a: AccountRow) {
  return {
    id: a.id, bankCode: a.bankCode, bankName: bankName(a.bankCode), accountLast4: a.accountNumber.slice(-4), holderName: a.holderName,
    status: a.status, isChange: a.isChange, payableFrom: a.payableFrom, reviewNote: a.reviewNote, createdAt: a.createdAt,
  };
}
export type MerchantPayoutAccountView = ReturnType<typeof merchantView>;

@Injectable()
export class PayoutAccountsService {
  private readonly logger = new Logger(PayoutAccountsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly files: PrivateFilesService,
    private readonly auditLog: AuditLogService,
    @Inject(EMAIL_PROVIDER) private readonly email: EmailProvider,
  ) {}

  async create(merchantId: string, dto: CreatePayoutAccountDto, file: UploadedComplaintFile | undefined) {
    if (!file) throw new BadRequestException("Sube el certificado o la captura de tu banco.");
    const [proof] = checkComplaintFiles([file]);
    const accountNumber = normaliseAccountNumber(dto.accountNumber);
    const holderName = dto.holderName.trim();
    const storageKey = await this.files.put(proof.buffer, proof.contentType);
    const created = await this.prisma.$transaction(async (tx) => {
      // The same lock the payout batch takes: a change and a batch never interleave, and two changes can't both pass.
      await lockMerchantSettlement(tx, merchantId);
      if (await tx.payoutAccount.findFirst({ where: { merchantId, currency: CURRENCY, status: PayoutAccountStatus.PENDING_REVIEW } })) {
        throw new ConflictException("Ya tienes un cambio de cuenta en revisión.");
      }
      const approved = await tx.payoutAccount.findFirst({ where: { merchantId, currency: CURRENCY, status: PayoutAccountStatus.APPROVED } });
      return tx.payoutAccount.create({
        data: {
          merchantId, currency: CURRENCY, bankCode: dto.bankCode, accountNumber, holderName,
          proofStorageKey: storageKey, proofFileName: safeFileName(proof.originalname), proofContentType: proof.contentType,
          isChange: Boolean(approved),
        },
      });
    });
    if (created.isChange) {
      await this.notify(merchantId, "Pidieron cambiar tu cuenta para desembolsos",
        `Pidieron cambiar la cuenta bancaria donde recibes tus desembolsos de pagosYa a una cuenta terminada en ${accountNumber.slice(-4)} (${bankName(dto.bankCode)}).\n\nSi no fuiste tú, escríbenos de inmediato. Mientras revisamos el cambio, tus desembolsos están en pausa; tus ventas siguen registradas.`);
    }
    return merchantView(created);
  }

  async listForMerchant(merchantId: string) {
    const rows = await this.prisma.payoutAccount.findMany({ where: { merchantId, currency: CURRENCY }, orderBy: { createdAt: "desc" }, take: 20 });
    return rows.map(merchantView);
  }

  async pendingQueue() {
    const rows = await this.prisma.payoutAccount.findMany({
      where: { status: PayoutAccountStatus.PENDING_REVIEW },
      orderBy: { createdAt: "asc" },
      include: { merchant: { select: { id: true, name: true, email: true, level: true } }, kycSubmission: { select: { legalName: true, legalRepName: true, targetLevel: true, status: true } } },
    });
    const out = [];
    for (const row of rows) {
      const submission = row.kycSubmission ?? (await this.prisma.merchantKycSubmission.findFirst({ where: { merchantId: row.merchantId, status: "APPROVED" }, orderBy: { createdAt: "desc" }, select: { legalName: true, legalRepName: true, targetLevel: true, status: true } }));
      const { proofStorageKey: _key, kycSubmission: _sub, ...rest } = row;
      out.push({
        ...rest,
        bankName: bankName(row.bankCode),
        expected: { level: Math.max(row.merchant.level, submission?.targetLevel ?? 0), legalName: submission?.legalName ?? null, legalRepName: submission?.legalRepName ?? null },
        kycPending: row.kycSubmission?.status === "PENDING_REVIEW",
      });
    }
    return out;
  }

  private async decide(id: string, actor: PayoutAccountActor, action: string, work: (tx: Prisma.TransactionClient, account: AccountRow) => Promise<{ data: Prisma.PayoutAccountUpdateInput; metadata: Record<string, unknown> }>) {
    return this.prisma.$transaction(async (tx) => {
      const account = await tx.payoutAccount.findUnique({ where: { id } });
      if (!account) throw new NotFoundException("Cuenta no encontrada");
      await lockMerchantSettlement(tx, account.merchantId);
      const current = await tx.payoutAccount.findUnique({ where: { id } });
      if (!current || current.status !== PayoutAccountStatus.PENDING_REVIEW) throw new ConflictException("Esta cuenta ya fue revisada.");
      const { data, metadata } = await work(tx, current);
      const updated = await tx.payoutAccount.update({ where: { id }, data });
      await this.auditLog.record(tx, { actorType: "OPS_USER", actorId: actor.id, actorLabel: label(actor), action, targetType: "PayoutAccount", targetId: id, metadata: { merchantId: current.merchantId, isChange: current.isChange, ...metadata } });
      return updated;
    });
  }

  async approve(id: string, dto: ApprovePayoutAccountDto, actor: PayoutAccountActor, now = new Date()) {
    const updated = await this.decide(id, actor, "payout_account.approved", async (tx, account) => {
      const merchant = await tx.merchant.findUniqueOrThrow({ where: { id: account.merchantId } });
      const submission = account.kycSubmissionId ? await tx.merchantKycSubmission.findFirst({ where: { id: account.kycSubmissionId } }) : null;
      const level = Math.max(merchant.level, submission?.targetLevel ?? 0);
      validateApproval({ isChange: account.isChange, actorRole: actor.role, level, checks: dto.checks, ownerType: dto.ownerType, reason: dto.reason });
      const payableFrom = payableFromFor(account.isChange, now);
      await tx.payoutAccount.updateMany({
        where: { merchantId: account.merchantId, currency: account.currency, status: PayoutAccountStatus.APPROVED, id: { not: account.id } },
        data: { status: PayoutAccountStatus.REPLACED },
      });
      return {
        data: { status: PayoutAccountStatus.APPROVED, ownerType: dto.ownerType, checks: dto.checks, reviewNote: dto.reason?.trim() || null, reviewedAt: now, reviewedByOpsUser: { connect: { id: actor.id } }, reviewedByLabel: label(actor), payableFrom },
        metadata: { checks: dto.checks, ownerType: dto.ownerType, reason: dto.reason ?? null, payableFrom: payableFrom.toISOString() },
      };
    });
    await this.notify(updated.merchantId, "Aprobamos tu cuenta para desembolsos",
      `Verificamos la cuenta terminada en ${updated.accountNumber.slice(-4)}. Recibes desembolsos en ella desde el ${laPazDateTime(updated.payableFrom!)}.`);
    return updated;
  }

  async reject(id: string, reason: string, actor: PayoutAccountActor) {
    const updated = await this.decide(id, actor, "payout_account.rejected", async () => ({
      data: { status: PayoutAccountStatus.REJECTED, reviewNote: reason.trim(), reviewedAt: new Date(), reviewedByOpsUser: { connect: { id: actor.id } }, reviewedByLabel: label(actor) },
      metadata: { reason: reason.trim() },
    }));
    await this.notify(updated.merchantId, "No aprobamos tu cuenta para desembolsos",
      `No aprobamos la cuenta terminada en ${updated.accountNumber.slice(-4)}: ${reason.trim()}\n\n${updated.isChange ? "Seguimos pagando a tu cuenta anterior." : "Sube un nuevo comprobante desde tu panel para recibir desembolsos."}`);
    return updated;
  }

  /** Called inside the identity review's transaction when ops reject the identity. */
  async rejectLinkedToSubmission(tx: Prisma.TransactionClient, submissionId: string, note: string) {
    await tx.payoutAccount.updateMany({
      where: { kycSubmissionId: submissionId, status: PayoutAccountStatus.PENDING_REVIEW },
      data: { status: PayoutAccountStatus.REJECTED, reviewNote: note, reviewedAt: new Date() },
    });
  }

  async proof(id: string, actor: PayoutAccountActor) {
    const account = await this.prisma.payoutAccount.findUnique({ where: { id } });
    if (!account) throw new NotFoundException("Cuenta no encontrada");
    const bytes = await this.files.get(account.proofStorageKey);
    await this.prisma.$transaction((tx) => this.auditLog.record(tx, { actorType: "OPS_USER", actorId: actor.id, actorLabel: label(actor), action: "payout_account.proof_viewed", targetType: "PayoutAccount", targetId: id, metadata: { merchantId: account.merchantId } }));
    return { bytes, fileName: account.proofFileName, contentType: account.proofContentType };
  }

  /** Best effort: the change stands even if an email fails; the failure is logged. */
  private async notify(merchantId: string, subject: string, body: string) {
    const users = await this.prisma.merchantUser.findMany({ where: { merchantId, deletedAt: null, emailVerifiedAt: { not: null } }, select: { email: true } });
    for (const { email } of users) {
      await this.email.send({ to: email, subject, body }).catch((error) => this.logger.warn(`Payout account email to ${email} failed: ${(error as Error).message}`));
    }
  }
}
```

(Spec test note: the "approves a first account" expectation uses `reviewedByOpsUserId`; with the relation `connect`, assert `reviewedByOpsUser: { connect: { id: "ops_b" } }` instead.)

- [ ] **Step 5: Controllers + module**

`dashboard-payout-accounts.controller.ts`:

```ts
import { Body, Controller, Get, Post, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { MerchantSessionGuard } from "../dashboard/guards/merchant-session.guard";
import { CurrentMerchant } from "../auth/decorators/current-merchant.decorator";
import type { UploadedComplaintFile } from "../complaints/complaint-files";
import { PayoutAccountsService } from "./payout-accounts.service";
import { CreatePayoutAccountDto } from "./dto/payout-account.dto";

/** Session only: an API key must never be able to redirect a merchant's payouts. */
@ApiTags("payout-accounts")
@ApiBearerAuth()
@UseGuards(MerchantSessionGuard)
@Controller("v1/dashboard/payout_accounts")
export class DashboardPayoutAccountsController {
  constructor(private readonly accounts: PayoutAccountsService) {}

  @Get() list(@CurrentMerchant() merchant: { id: string }) { return this.accounts.listForMerchant(merchant.id); }

  @Post()
  @UseInterceptors(FileInterceptor("proof", { limits: { fileSize: 5_000_000 } }))
  create(@CurrentMerchant() merchant: { id: string }, @Body() dto: CreatePayoutAccountDto, @UploadedFile() proof: UploadedComplaintFile) {
    return this.accounts.create(merchant.id, dto, proof);
  }
}
```

`ops-payout-accounts.controller.ts`:

```ts
import { Body, Controller, Get, Param, Post, StreamableFile, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { OpsAuthGuard } from "../ops/guards/ops-auth.guard";
import { CurrentOpsUser } from "../ops/decorators/current-ops-user.decorator";
import { PayoutAccountActor, PayoutAccountsService } from "./payout-accounts.service";
import { ApprovePayoutAccountDto, RejectPayoutAccountDto } from "./dto/payout-account.dto";

@ApiTags("ops")
@ApiBearerAuth()
@UseGuards(OpsAuthGuard)
@Controller("internal/payout_accounts")
export class OpsPayoutAccountsController {
  constructor(private readonly accounts: PayoutAccountsService) {}

  @Get() queue() { return this.accounts.pendingQueue(); }

  @Get(":id/proof")
  async proof(@Param("id") id: string, @CurrentOpsUser() actor: PayoutAccountActor) {
    const file = await this.accounts.proof(id, actor);
    return new StreamableFile(file.bytes, { type: file.contentType, disposition: `inline; filename="${file.fileName}"` });
  }

  @Post(":id/approve") approve(@Param("id") id: string, @Body() dto: ApprovePayoutAccountDto, @CurrentOpsUser() actor: PayoutAccountActor) { return this.accounts.approve(id, dto, actor); }
  @Post(":id/reject") reject(@Param("id") id: string, @Body() dto: RejectPayoutAccountDto, @CurrentOpsUser() actor: PayoutAccountActor) { return this.accounts.reject(id, dto.reason, actor); }
}
```

`payout-accounts.module.ts`: `imports: [DashboardModule, OpsModule, AuthModule]`, controllers both, providers `[PayoutAccountsService, PrivateFilesService]`, `exports: [PayoutAccountsService]`. Register `PayoutAccountsModule` in `app.module.ts`. Add a wiring spec `payout-accounts-module-wiring.spec.ts` mirroring `complaints-module-wiring.spec.ts` (compile the real module with `PrismaService` overridden; resolve `PayoutAccountsService`).

- [ ] **Step 6:** `nice npx jest src/payout-accounts --runInBand && nice npx tsc --noEmit -p tsconfig.json` → PASS, exit 0.
- [ ] **Step 7:** Commit `feat(payout-accounts): merchants send an account with proof, a change warns their users, ops approve or reject with the three ticks`.

---

### Task 4: Identity verification links the account

**Files:** Modify `apps/api/src/merchants/dto/submit-kyc.dto.ts`, `kyc.service.ts`, `kyc.service.spec.ts`, `merchants.module.ts`.

**Consumes:** `PayoutAccountsService.rejectLinkedToSubmission`, `accountSnapshot`.

- [ ] **Step 1: Failing tests** in `kyc.service.spec.ts` (constructor gains a 5th argument `payoutAccounts` mock `{ rejectLinkedToSubmission: jest.fn() }`, and the prisma fake gains `payoutAccount: { findFirst, update }`):
  - submit requires `payoutAccountId` of the merchant's own account in `PENDING_REVIEW` or `APPROVED` → "Agrega tu cuenta bancaria con su comprobante" otherwise (null, someone else's, or REJECTED/REPLACED);
  - a waiting account without a submission gets `kycSubmissionId` set to the new submission; an approved or already-linked one is left as is;
  - the submission's `payoutBankAccount` is the account snapshot (`"Banco Nacional de Bolivia 4012345678 — Ana Pérez"`);
  - reviewing with `REJECTED` calls `payoutAccounts.rejectLinkedToSubmission(tx, submissionId, note)`; `APPROVED` does not.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement.** DTO: `payoutBankAccount` becomes `@IsOptional()` (legacy, ignored); add `@ApiProperty() @IsString() @MaxLength(40) payoutAccountId!: string;`. In `submit`, after the pending-submission check:

```ts
    const account = await this.prisma.payoutAccount.findFirst({
      where: { id: dto.payoutAccountId, merchantId, status: { in: [PayoutAccountStatus.PENDING_REVIEW, PayoutAccountStatus.APPROVED] } },
    });
    if (!account) throw new BadRequestException("Agrega tu cuenta bancaria con su comprobante");
```

create the submission with `payoutBankAccount: accountSnapshot(account)`, then `if (account.status === PayoutAccountStatus.PENDING_REVIEW && !account.kycSubmissionId) await this.prisma.payoutAccount.update({ where: { id: account.id }, data: { kycSubmissionId: submission.id } });` and return the submission. In `review`, inside the transaction after the update: `if (dto.decision === KycStatus.REJECTED) await this.payoutAccounts.rejectLinkedToSubmission(tx, submissionId, dto.note ?? "Verificación rechazada");`. Inject `PayoutAccountsService`; `merchants.module.ts` imports `PayoutAccountsModule`.
- [ ] **Step 4:** `nice npx jest src/merchants src/payout-accounts --runInBand` → PASS; tsc exit 0.
- [ ] **Step 5:** Commit `feat(kyc): the identity form links a proven payout account, and rejecting an identity rejects its waiting account`.

---

### Task 5: Payouts use only an approved, payable account

**Files:** Modify `apps/api/src/payouts/payouts.service.ts`, `payouts.service.spec.ts`, `payouts.controller.ts` (no shape change), `apps/merchant-dashboard/src/settlement.mjs`, `settlement.test.mjs`.

**Produces:** `PayoutBlocker` adds `"account_missing" | "account_review" | "account_waiting"`; BOB payouts carry `payoutAccountId` and the snapshot as `bankAccount`; `payoutBlockerLabel(code, currency, extra?: { payableFrom?: string })`.

- [ ] **Step 1: Failing API tests** in `payouts.service.spec.ts`. Extend `makeFakePrisma` with `payoutAccount: { findFirst: jest.fn() }` defaulting to an approved, payable account for BOB:

```ts
const approvedAccount = { id: "pa_1", bankCode: "BNB", accountNumber: "4012345678", holderName: "Ana Pérez", status: "APPROVED", payableFrom: new Date("2026-01-01T00:00:00Z") };
// in makeFakePrisma:
payoutAccount: { findFirst: jest.fn(async ({ where }: any) => (where.status === "APPROVED" && where.currency === "BOB" ? approvedAccount : null)) },
```

Update existing BOB expectations from `bankAccount: "BNB 123"` to `bankAccount: "Banco Nacional de Bolivia 4012345678 — Ana Pérez", payoutAccountId: "pa_1"`. New tests:

```ts
describe("PayoutsService payout account", () => {
  const merchant = { id: "m_1", settlementMode: SettlementMode.AGGREGATOR, status: MerchantStatus.ACTIVE };
  function ready() {
    const prisma = makeFakePrisma();
    prisma.merchant.findMany.mockResolvedValue([merchant]);
    prisma.payout.findFirst.mockResolvedValue(null);
    prisma.ledgerEntry.groupBy.mockResolvedValue([{ currency: "BOB", direction: LedgerDirection.CREDIT, _sum: { amount: 5000 } }]);
    prisma.merchantKycSubmission.findFirst.mockResolvedValue({ status: KycStatus.APPROVED, payoutBankAccount: "BNB legacy text" });
    return prisma;
  }

  it("never pays the legacy free-text account: no approved account means account_missing", async () => {
    const prisma = ready();
    prisma.payoutAccount.findFirst.mockResolvedValue(null);
    const service = new PayoutsService(prisma as any, termsAccepted() as any);
    await expect(service.payoutBlocker("m_1", "BOB")).resolves.toBe("account_missing");
    await service.createDuePayouts();
    expect(prisma.payout.create).not.toHaveBeenCalled();
  });

  it("pays nothing while a change waits for review, even with an approved account", async () => {
    const prisma = ready();
    prisma.payoutAccount.findFirst.mockImplementation(async ({ where }: any) => (where.status === "PENDING_REVIEW" ? { id: "pa_2" } : approvedAccount));
    await expect(new PayoutsService(prisma as any, termsAccepted() as any).payoutBlocker("m_1", "BOB")).resolves.toBe("account_review");
  });

  it("waits until the approved change is payable", async () => {
    const prisma = ready();
    prisma.payoutAccount.findFirst.mockImplementation(async ({ where }: any) => (where.status === "APPROVED" ? { ...approvedAccount, payableFrom: new Date(Date.now() + 3_600_000) } : null));
    await expect(new PayoutsService(prisma as any, termsAccepted() as any).payoutBlocker("m_1", "BOB")).resolves.toBe("account_waiting");
  });

  it("checks a pause and the terms before the account", async () => {
    const prisma = ready();
    prisma.payoutAccount.findFirst.mockResolvedValue(null);
    const terms = { needsMerchantAcceptance: jest.fn().mockResolvedValue(true) };
    await expect(new PayoutsService(prisma as any, terms as any).payoutBlocker("m_1", "BOB")).resolves.toBe("terms");
  });

  it("records which approved account a payout went to", async () => {
    const prisma = ready();
    await new PayoutsService(prisma as any, termsAccepted() as any).createDuePayouts();
    expect(prisma.payout.create).toHaveBeenCalledWith({ data: expect.objectContaining({ payoutAccountId: "pa_1", bankAccount: "Banco Nacional de Bolivia 4012345678 — Ana Pérez" }) });
  });
});
```

Dashboard `settlement.test.mjs`:

```js
test("explains the payout account steps", () => {
  assert.equal(payoutBlockerLabel("account_missing", "BOB"), "Agrega tu cuenta bancaria con un comprobante para recibir desembolsos.");
  assert.equal(payoutBlockerLabel("account_review", "BOB"), "Estamos revisando tu cuenta bancaria.");
  assert.equal(payoutBlockerLabel("account_waiting", "BOB", { payableFrom: "2026-10-11T19:00:00.000Z" }), "Tu nueva cuenta recibe desembolsos desde el 11/10/2026 15:00.");
  assert.equal(payoutBlockerLabel("account_waiting", "BOB"), "Tu nueva cuenta recibe desembolsos en unos días.");
});
```

- [ ] **Step 2:** Run both → FAIL.
- [ ] **Step 3: Implement** in `PayoutsService`: `PayoutBlocker` union adds the three codes; `PayoutCheck` success adds `payoutAccountId: string | null`. In `checkPayout`, after the KYC check and before `in_flight`:

```ts
    let bankAccount: string | null;
    let payoutAccountId: string | null = null;
    if (currency === "BOB") {
      // Only an account ops approved against proof, once its 72-hour change wait is over (payout account ownership).
      if (await db.payoutAccount.findFirst({ where: { merchantId, currency, status: PayoutAccountStatus.PENDING_REVIEW } })) return { blocker: "account_review" };
      const account = await db.payoutAccount.findFirst({ where: { merchantId, currency, status: PayoutAccountStatus.APPROVED }, orderBy: { reviewedAt: "desc" } });
      if (!account) return { blocker: "account_missing" };
      if (account.payableFrom && account.payableFrom.getTime() > Date.now()) return { blocker: "account_waiting" };
      bankAccount = accountSnapshot(account);
      payoutAccountId = account.id;
    } else {
      bankAccount = currency === "USD" ? approvedKyc.payoutUsdBankAccount : null;
      if (!bankAccount) return { blocker: "no_account" };
    }
```

(the old `bankAccount` lines for BOB are removed); return `{ blocker: null, bankAccount, payoutAccountId }`; `createDuePayout` adds `payoutAccountId: check.payoutAccountId` to the payout data. In `settlement.mjs` `payoutBlockerLabel(code, currency, extra = {})` adds:

```js
    case "account_missing":
      return "Agrega tu cuenta bancaria con un comprobante para recibir desembolsos.";
    case "account_review":
      return "Estamos revisando tu cuenta bancaria.";
    case "account_waiting": {
      if (!extra.payableFrom) return "Tu nueva cuenta recibe desembolsos en unos días.";
      const at = laPaz(new Date(extra.payableFrom));
      return `Tu nueva cuenta recibe desembolsos desde el ${releaseDateLabel(at.day)} ${at.time}.`;
    }
```

Fix existing fixtures that now fail because payouts read `PayoutAccount`: `payouts.service.spec.ts` (above) and `settlement/settlement.integration.spec.ts` (seed an `APPROVED` `PayoutAccount` with `payableFrom` in the past for each merchant whose payout the test expects, linked by `merchantId`).
- [ ] **Step 4:** `nice npx jest src/payouts src/settlement --runInBand --testPathIgnorePatterns integration`, `nice npx jest --config jest.integration.config.js src/settlement --runInBand`, `cd ../merchant-dashboard && node --test src/settlement.test.mjs` → all PASS; tsc exit 0.
- [ ] **Step 5:** Commit `feat(payouts): payouts go only to an approved account whose change wait is over, and the balance says which step is missing`.

---

### Task 6: Real-database tests

**Files:** Create `apps/api/src/payout-accounts/payout-accounts.integration.spec.ts`.

- [ ] **Step 1:** Using `integrationDatabase("payout_accounts")`, seed a merchant (AGGREGATOR, ACTIVE, level 1), an approved KYC submission, a verified merchant user, an ops admin, and a captured payment whose hold is already released (copy the seeding from `settlement.integration.spec.ts`, then call `SettlementHoldService.releaseDue(farFuture)`), so the merchant has an available BOB balance. Tests:
  1. **Two simultaneous change requests** after an approved first account → exactly one `PENDING_REVIEW` row, the other call rejected with "Ya tienes un cambio de cuenta en revisión".
  2. **Change journey:** approved first account `A` (payable now) → `createDuePayouts()` creates a payout to `A`; mark it SUCCEEDED (ledger journal as in the settlement spec) and add balance again → request change `B` → batch creates nothing (`account_review`) → admin approves `B` at `T` → batch at `T+1h` creates nothing (`account_waiting`; pass time by setting `payableFrom` check through `jest.useFakeTimers({ now: … })` or by updating `B.payableFrom` in the test) → at `T+73h` the batch creates a payout with `payoutAccountId = B.id`; `A` is `REPLACED`.
  3. **Rejected change** keeps paying `A`.
- [ ] **Step 2:** `nice npx jest --config jest.integration.config.js src/payout-accounts src/settlement --runInBand` → PASS. Main session (never a subagent) then runs the migration drift check on a throwaway DB (`node /tmp/claude-501/drift.cjs` with `NODE_PATH`; extend its filter to `PayoutAccount`) → 0 lines.
- [ ] **Step 3:** Commit `test(payout-accounts): one waiting change under concurrency, and the change journey on real Postgres`.

---

### Task 7: Merchant dashboard

**Files:** Modify `apps/merchant-dashboard/index.html`, `src/dashboard.js`, `server.mjs`; create `src/payout-accounts.mjs`, `src/payout-accounts.test.mjs`, `src/payout-account-panel.mjs`, `tests/payout-accounts.spec.mjs`.

**Produces:** `BANKS` (code+name, same list as the API), `accountStatusLabel(account)`, `currentAccounts(list) → { approved, waiting, lastRejected }`; `mountPayoutAccountPanel({ api, onChange }) → { show(): Promise<void>, current(): { waitingPayableFrom?: string } }`.

- [ ] **Step 1: Failing unit tests** (`payout-accounts.test.mjs`): `currentAccounts` picks the newest approved, the waiting one and a rejected change newer than the approved one; `accountStatusLabel` returns "En revisión", "Aprobada · recibe desembolsos", "Aprobada · desde el 11/10/2026 15:00", "No aprobada: {motivo}".
- [ ] **Step 2: Failing Playwright test** (`tests/payout-accounts.spec.mjs`, run with the 4397 config): (a) Desembolsos shows the approved account "BNB ····5678 · Ana Pérez" and a "Cambiar cuenta" button; sending the form posts multipart with `bankCode`, `accountNumber`, `holderName`, `proof`; then shows "Estamos revisando tu cuenta bancaria."; (b) a rejected change shows "Tu cambio de cuenta no fue aprobado: {motivo}" and the old account; (c) the identity form has the bank select, number, holder and proof fields, uploads the account first and sends `payoutAccountId` to `/merchants/kyc`; when an account is already waiting or approved it shows it read-only and sends its id.
- [ ] **Step 3: Implement.**
  - `index.html`: in `#kycForm` replace the `payoutBankAccount` input with `<div id="kycAccountFields">` holding `<select name="bankCode" required>` (options rendered from `BANKS`), `<input name="accountNumber" inputmode="numeric" required>`, `<input name="holderName" required>`, `<input type="file" id="kycAccountProof" accept="image/png,image/jpeg,application/pdf" required>`, and `<p id="kycAccountExisting" hidden>`. In `#payoutsSection` add `<div class="panel" id="payoutAccountPanel"></div>` above the payouts table.
  - `payout-account-panel.mjs` renders the current account, its status line, the last rejection, and a "Cambiar cuenta" button that reveals the same four fields; submit → `api("/dashboard/payout_accounts", { method: "POST", body: formData })` → re-render; errors shown in the panel; every value through `escapeHtml`.
  - `dashboard.js`: KYC submit → if `#kycAccountExisting` holds an id use it, else post the account form data (fields + `kycAccountProof` file as `proof`) to `/dashboard/payout_accounts` and take its `id`; send `payoutAccountId` in the KYC payload; drop `payoutBankAccount`. `renderBalanceCards` passes `{ payableFrom: payoutPanel.current().waitingPayableFrom }` to `payoutBlockerLabel`. Mount the panel; call `show()` when the payouts view opens and after `refresh()`.
  - `server.mjs`: serve `/src/payout-accounts.mjs` and `/src/payout-account-panel.mjs`.
- [ ] **Step 4:** `node --test unit/*.test.mjs src/*.test.mjs` and the Playwright file (4397 config) → PASS; then the full dashboard e2e suite on 4397 and compare failures with the 14 pre-existing ones (same set or fewer).
- [ ] **Step 5:** Commit `feat(dashboard): payout account with proof in the identity form, an account panel with "Cambiar cuenta", and the balance says which step is missing`.

---

### Task 8: Ops console

**Files:** Modify `apps/ops/index.html`; create `apps/ops/tests/ops-payout-accounts.spec.mjs`; add `if (path === "/internal/payout_accounts") return route.fulfill({ json: [] });` to the default mocks of `ops-limits`, `ops-settlement`, `ops-complaints`, `ops-international` specs.

- [ ] **Step 1: Failing Playwright tests:** the "Cuentas por revisar" section lists waiting accounts oldest first with merchant, bank, number, holder, expected name ("Nombre esperado: Ana Pérez" / razón social + representative for level 2), and "Cambio" or "Primera cuenta"; the "Aprobar" button stays disabled until the three boxes are ticked; level ≥ 2 shows owner choices "Empresa" / "Unipersonal (a nombre del dueño)" and "Unipersonal" requires a reason; approve posts `{ checks, ownerType, reason? }`; reject asks a reason and posts it; a change shows "Solo un administrador puede aprobar" and no Aprobar button for `SUPPORT_AGENT`; "Ver comprobante" fetches `/internal/payout_accounts/:id/proof` with the token and opens a blob. The identity review row shows the linked account summary instead of the free-text account.
- [ ] **Step 2: Implement** a `<section class="block" id="cuentas">` (nav "Cuentas por revisar"), `loadPayoutAccounts()` (called from `refresh()` alongside the other queues, `.catch(() => null)`), `renderPayoutAccount(row)`, using the page's `api`, `esc`, `dateTime`, `opsRole`. In the identity queue row, replace `${esc(s.payoutBankAccount)}…` with the submission's `payoutBankAccount` snapshot plus "(revisar en Cuentas)".
- [ ] **Step 3:** `nice npx playwright test` (ops) → all PASS; `node --check server.mjs`.
- [ ] **Step 4:** Commit `feat(ops): Cuentas por revisar — proof, expected name, three ticks, owner type, admin-only approval of a change`.

---

### Task 9: Whole-branch verification

- [ ] API: `nice npx jest src/payout-accounts src/payouts src/settlement src/merchants src/complaints src/international src/config src/payment-intents src/refunds --runInBand`; integration `src/payout-accounts src/settlement src/complaints`; tsc.
- [ ] Dashboard: node tests + Playwright on 4397 (compare with pre-existing failures). Ops: full Playwright.
- [ ] Final whole-branch review (fresh reviewer, most capable model), fix pass, ledger.
