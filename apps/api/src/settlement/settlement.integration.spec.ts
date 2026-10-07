import { LedgerAccount, LedgerDirection, OpsRole, PrismaClient, SettlementHoldStatus, SettlementMode, TransactionStatus, TransactionType } from "@prisma/client";
import { integrationDatabase } from "../common/testing/integration-database";
import { LedgerService } from "../ledger/ledger.service";
import { AuditLogService } from "../ops/audit-log.service";
import { SettlementPolicyService } from "./settlement-policy.service";
import { SettlementHoldService } from "./settlement-hold.service";
import { SettlementQueryService } from "./settlement-query.service";
import { SettlementAdminService } from "./settlement-admin.service";
import { merchantBalances } from "./settlement-balances";

/**
 * The money invariant behind ASFI row 5: every journal balances, and for each
 * merchant PENDING + PAYABLE + RESERVE equals what pagosYa still owes them,
 * with hold rows agreeing with the ledger. Real Postgres because the advisory
 * lock only exists inside real transactions.
 */
const harness = integrationDatabase("settlement");

harness.describeDb("settlement holds (real Postgres)", () => {
  if (!harness.available) {
    harness.failIfUnavailable();
    return;
  }

  jest.setTimeout(120_000);
  let db: PrismaClient;
  let ledger: LedgerService;
  let holds: SettlementHoldService;
  let admin: SettlementAdminService;
  const opsAdmin = { id: "ops_it", name: "Ana", email: "ana@pagosya.bo", role: OpsRole.SUPPORT_ADMIN };

  beforeAll(async () => {
    db = await harness.create();
    ledger = new LedgerService();
    const policies = new SettlementPolicyService();
    holds = new SettlementHoldService(db as any, ledger, policies);
    const query = new SettlementQueryService(db as any, policies);
    admin = new SettlementAdminService(db as any, ledger, new AuditLogService(db as any), { send: jest.fn() } as any, query);
  });

  afterAll(async () => {
    await harness.drop();
  });

  async function merchant(label: string) {
    return db.merchant.create({ data: { name: label, email: `${label}-${harness.databaseName}@test.test`, level: 1, settlementMode: SettlementMode.AGGREGATOR } });
  }

  async function capture(merchantId: string, amount: number, capturedAt: Date) {
    const intent = await db.paymentIntent.create({ data: { merchantId, amount, clientSecret: `cs_${Math.random().toString(36).slice(2)}` } });
    const txn = await db.transaction.create({ data: { paymentIntentId: intent.id, type: TransactionType.CAPTURE, railId: "test", amount, status: TransactionStatus.SUCCEEDED } });
    await db.$transaction(async (tx) => {
      const lines = ledger.buildCaptureJournal({ merchantId, transactionId: txn.id, amount, settlementMode: SettlementMode.AGGREGATOR });
      await ledger.postJournalEntry(tx, ledger.generateGroupId(), lines, "BOB");
      await holds.recordCapture(tx, { merchantId, paymentIntentId: intent.id, transactionId: txn.id, currency: "BOB", lines, capturedAt });
    });
    return intent.id;
  }

  async function refund(merchantId: string, paymentIntentId: string, amount: number) {
    const txn = await db.transaction.create({ data: { paymentIntentId, type: TransactionType.REFUND, railId: "test", amount, status: TransactionStatus.SUCCEEDED } });
    await db.$transaction(async (tx) => {
      const journal = ledger.buildRefundJournal({ merchantId, transactionId: txn.id, amount, settlementMode: SettlementMode.AGGREGATOR });
      const lines = await holds.applyRefundDrawdown(tx, { merchantId, paymentIntentId, currency: "BOB", settlementMode: SettlementMode.AGGREGATOR, lines: journal });
      await ledger.postJournalEntry(tx, ledger.generateGroupId(), lines, "BOB");
    });
  }

  async function payout(merchantId: string, amount: number) {
    await db.$transaction((tx) => ledger.postJournalEntry(tx, ledger.generateGroupId(), ledger.buildPayoutJournal({ merchantId, amount }), "BOB"));
  }

  async function bob(merchantId: string) {
    return (await merchantBalances(db as any, merchantId)).find((b) => b.currency === "BOB") ?? { currency: "BOB", available: 0, pending: 0, reserve: 0 };
  }

  async function expectInvariant(merchantId: string, owed: number) {
    const groups = await db.ledgerEntry.groupBy({ by: ["transactionGroupId", "direction"], where: { merchantId }, _sum: { amount: true } });
    const net = new Map<string, number>();
    for (const g of groups) net.set(g.transactionGroupId, (net.get(g.transactionGroupId) ?? 0) + (g._sum.amount ?? 0) * (g.direction === LedgerDirection.CREDIT ? 1 : -1));
    for (const [group, value] of net) expect([group, value]).toEqual([group, 0]);

    const b = await bob(merchantId);
    expect(b.pending + b.available + b.reserve).toBe(owed);
    const open = await db.settlementHold.findMany({ where: { merchantId } });
    expect(open.filter((h) => h.status === SettlementHoldStatus.PENDING).reduce((s, h) => s + h.pendingAmount, 0)).toBe(b.pending);
    expect(open.filter((h) => h.status === SettlementHoldStatus.RESERVE_HELD).reduce((s, h) => s + h.reserveAmount, 0)).toBe(b.reserve);
  }

  it("keeps the money invariant through capture, release, payout, refund, seizure and reserve release", async () => {
    const m = await merchant("lifecycle");
    // Level 1 placeholder from the migration: 7 days, 10% reserve, 60 days.
    await capture(m.id, 10_000, new Date("2026-10-01T15:00:00Z")); // net 9750, reserve 975
    const piB = await capture(m.id, 20_000, new Date("2026-10-01T15:00:00Z")); // net 19500, reserve 1950
    expect(await bob(m.id)).toEqual({ currency: "BOB", available: 0, pending: 29_250, reserve: 0 });
    await expectInvariant(m.id, 29_250);

    expect(await holds.releaseDue(new Date("2026-10-08T03:59:00Z"))).toBe(0); // one minute before 00:00 La Paz
    expect(await holds.releaseDue(new Date("2026-10-08T05:00:00Z"))).toBe(2);
    expect(await bob(m.id)).toEqual({ currency: "BOB", available: 26_325, pending: 0, reserve: 2_925 });
    expect(await holds.releaseDue(new Date("2026-10-08T05:00:00Z"))).toBe(0); // idempotent

    await payout(m.id, 26_325);
    await refund(m.id, piB, 20_000); // net 19500: reserve 2925 (oldest first), then 16575 negative
    expect(await bob(m.id)).toEqual({ currency: "BOB", available: -16_575, pending: 0, reserve: 0 });
    await expectInvariant(m.id, -16_575);

    await capture(m.id, 30_000, new Date("2026-10-09T15:00:00Z")); // net 29250, reserve 2925
    await holds.releaseDue(new Date("2026-10-16T05:00:00Z"));
    expect(await bob(m.id)).toEqual({ currency: "BOB", available: 9_750, pending: 0, reserve: 2_925 });

    await expect(admin.seize(m.id, { amount: 3_000, currency: "BOB", reason: "Fraude confirmado", externalReference: "TRX-1" }, opsAdmin)).rejects.toThrow("no puedes retirar más");
    await admin.seize(m.id, { amount: 1_000, currency: "BOB", reason: "Fraude confirmado", externalReference: "TRX-1" }, opsAdmin);
    expect((await bob(m.id)).reserve).toBe(1_925);

    await holds.releaseDue(new Date("2026-12-08T05:00:00Z")); // Oct 9 + 60 days
    expect(await bob(m.id)).toEqual({ currency: "BOB", available: 11_675, pending: 0, reserve: 0 });
    // owed = 58500 nets - 26325 paid out - 19500 refunded - 1000 seized
    await expectInvariant(m.id, 11_675);
    expect(await db.auditLogEntry.count({ where: { action: "settlement.reserve_seized", targetId: m.id } })).toBe(1);
  });

  it("never spends the same pending money twice when a refund races the daily release", async () => {
    const m = await merchant("race");
    const pi = await capture(m.id, 10_000, new Date("2026-10-01T15:00:00Z")); // net 9750
    await Promise.all([holds.releaseDue(new Date("2026-10-08T05:00:00Z")), refund(m.id, pi, 10_000)]);
    const b = await bob(m.id);
    expect(b.pending).toBe(0);
    await expectInvariant(m.id, 0);
  });
});
