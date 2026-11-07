import { KycStatus, MerchantStatus, OpsRole, PayoutAccountOwner, PayoutAccountStatus, PayoutStatus, PrismaClient, SettlementMode, TransactionStatus, TransactionType } from "@prisma/client";
import { integrationDatabase } from "../common/testing/integration-database";
import { LedgerService } from "../ledger/ledger.service";
import { AuditLogService } from "../ops/audit-log.service";
import { SettlementPolicyService } from "../settlement/settlement-policy.service";
import { SettlementHoldService } from "../settlement/settlement-hold.service";
import { PayoutsService } from "../payouts/payouts.service";
import { PayoutAccountsService } from "./payout-accounts.service";

/** The payout account ownership check on real Postgres: one waiting change under concurrency, and the change journey. */
const harness = integrationDatabase("payout_accounts");
const png = () => ({ originalname: "cert.png", mimetype: "image/png", size: 9, buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]) });
const account = (accountNumber: string) => ({ bankCode: "BNB", accountNumber, holderName: "Ana Pérez" });
const ticks = { checks: { nameMatches: true, numberMatches: true, bankMatches: true }, ownerType: PayoutAccountOwner.PERSON };

harness.describeDb("payout accounts (real Postgres)", () => {
  if (!harness.available) {
    harness.failIfUnavailable();
    return;
  }

  jest.setTimeout(120_000);
  let db: PrismaClient;
  let ledger: LedgerService;
  let holds: SettlementHoldService;
  let accounts: PayoutAccountsService;
  let payouts: PayoutsService;
  let admin: { id: string; name: string; email: string; role: OpsRole };
  let n = 0;

  beforeAll(async () => {
    db = await harness.create();
    ledger = new LedgerService();
    holds = new SettlementHoldService(db as any, ledger, new SettlementPolicyService());
    const files = { put: jest.fn(async () => "3f2504e0-4f89-11d3-9a0c-0305e82c3301"), get: jest.fn() };
    accounts = new PayoutAccountsService(db as any, files as any, new AuditLogService(db as any), { send: jest.fn(async () => undefined) } as any);
    payouts = new PayoutsService(db as any, { needsMerchantAcceptance: jest.fn().mockResolvedValue(false) } as any);
    const ops = await db.opsUser.create({ data: { name: "Ana", email: `ana-${harness.databaseName}@pagosya.bo`, hashedToken: "x", role: OpsRole.SUPPORT_ADMIN } });
    admin = { id: ops.id, name: ops.name, email: ops.email, role: OpsRole.SUPPORT_ADMIN };
  });

  afterAll(async () => {
    await harness.drop();
  });

  /** An active level-1 aggregator with an approved identity and an available BOB balance. */
  async function merchantWithBalance() {
    n += 1;
    const m = await db.merchant.create({ data: { name: `Tienda ${n}`, email: `t${n}-${harness.databaseName}@test.test`, level: 1, status: MerchantStatus.ACTIVE, settlementMode: SettlementMode.AGGREGATOR } });
    await db.merchantKycSubmission.create({ data: { merchantId: m.id, legalName: "Ana Pérez", payoutBankAccount: "legacy", status: KycStatus.APPROVED, targetLevel: 1 } });
    const intent = await db.paymentIntent.create({ data: { merchantId: m.id, amount: 10_000, clientSecret: `cs_${Math.random().toString(36).slice(2)}` } });
    const txn = await db.transaction.create({ data: { paymentIntentId: intent.id, type: TransactionType.CAPTURE, railId: "test", amount: 10_000, status: TransactionStatus.SUCCEEDED } });
    await db.$transaction(async (tx) => {
      const lines = ledger.buildCaptureJournal({ merchantId: m.id, transactionId: txn.id, amount: 10_000, settlementMode: SettlementMode.AGGREGATOR });
      await ledger.postJournalEntry(tx, ledger.generateGroupId(), lines, "BOB");
      await holds.recordCapture(tx, { merchantId: m.id, paymentIntentId: intent.id, transactionId: txn.id, currency: "BOB", lines, capturedAt: new Date("2026-01-05T15:00:00Z") });
    });
    await holds.releaseDue(new Date("2026-01-20T15:00:00Z"));
    return m;
  }

  /** Lets the next batch run: a delivered payout no longer counts as in flight. */
  const deliverAll = (merchantId: string) => db.payout.updateMany({ where: { merchantId }, data: { status: PayoutStatus.SUCCEEDED, nextRetryAt: null } });

  it("keeps a single waiting change when two arrive at once", async () => {
    const m = await merchantWithBalance();
    const first = await accounts.create(m.id, account("4012345678"), png() as any);
    await accounts.approve(first.id, ticks, admin);
    const results = await Promise.allSettled([accounts.create(m.id, account("5012345678"), png() as any), accounts.create(m.id, account("6012345678"), png() as any)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const refused = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(String(refused.reason.message)).toContain("Ya tienes una cuenta en revisión");
    expect(await db.payoutAccount.count({ where: { merchantId: m.id, status: PayoutAccountStatus.PENDING_REVIEW } })).toBe(1);
  });

  it("stops payouts during a change, waits 72 hours after approval, then pays the new account", async () => {
    const m = await merchantWithBalance();
    expect(await payouts.payoutBlocker(m.id, "BOB")).toBe("account_missing");

    const a = await accounts.create(m.id, account("4012345678"), png() as any);
    expect(await payouts.payoutBlocker(m.id, "BOB")).toBe("account_review");
    await accounts.approve(a.id, ticks, admin);
    await payouts.createDuePayouts();
    const firstPayout = await db.payout.findFirstOrThrow({ where: { merchantId: m.id } });
    expect(firstPayout.payoutAccountId).toBe(a.id);
    await deliverAll(m.id);

    const b = await accounts.create(m.id, account("5012345678"), png() as any);
    await payouts.createDuePayouts();
    expect(await db.payout.count({ where: { merchantId: m.id } })).toBe(1);
    expect(await payouts.payoutBlocker(m.id, "BOB")).toBe("account_review");

    await accounts.approve(b.id, ticks, admin);
    expect(await payouts.payoutBlocker(m.id, "BOB")).toBe("account_waiting");
    await payouts.createDuePayouts();
    expect(await db.payout.count({ where: { merchantId: m.id } })).toBe(1);
    expect((await db.payoutAccount.findUniqueOrThrow({ where: { id: a.id } })).status).toBe(PayoutAccountStatus.REPLACED);

    // 73 hours later.
    await db.payoutAccount.update({ where: { id: b.id }, data: { payableFrom: new Date(Date.now() - 3_600_000) } });
    await payouts.createDuePayouts();
    const latest = await db.payout.findFirstOrThrow({ where: { merchantId: m.id }, orderBy: { createdAt: "desc" } });
    expect(latest.payoutAccountId).toBe(b.id);
    expect(latest.bankAccount).toBe("Banco Nacional de Bolivia 5012345678 — Ana Pérez");
  });

  it("keeps paying the old account when a change is rejected", async () => {
    const m = await merchantWithBalance();
    const a = await accounts.create(m.id, account("4012345678"), png() as any);
    await accounts.approve(a.id, ticks, admin);
    const b = await accounts.create(m.id, account("5012345678"), png() as any);
    await accounts.reject(b.id, "El titular del certificado es otra persona", admin);
    await payouts.createDuePayouts();
    const payout = await db.payout.findFirstOrThrow({ where: { merchantId: m.id } });
    expect(payout.payoutAccountId).toBe(a.id);
  });
});
