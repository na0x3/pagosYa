import { ComplaintEventType, ComplaintOutcome, OpsRole, PrismaClient, SettlementMode, TransactionStatus, TransactionType } from "@prisma/client";
import { integrationDatabase } from "../common/testing/integration-database";
import { LedgerService } from "../ledger/ledger.service";
import { AuditLogService } from "../ops/audit-log.service";
import { SettlementPolicyService } from "../settlement/settlement-policy.service";
import { SettlementHoldService } from "../settlement/settlement-hold.service";
import { SettlementQueryService } from "../settlement/settlement-query.service";
import { SettlementAdminService } from "../settlement/settlement-admin.service";
import { merchantBalances } from "../settlement/settlement-balances";
import { ComplaintIntakeService } from "./complaint-intake.service";
import { ComplaintMailer } from "./complaint-mailer";
import { ComplaintOpsService } from "./complaint-ops.service";
import { ComplaintMerchantService } from "./complaint-merchant.service";

/**
 * ASFI sub-project 4 on real Postgres: the yearly counter under concurrency, and the whole complaint journey with a
 * refund drawn from the merchant's held funds. RefundsService needs rails, webhooks and shipping, so the refund goes
 * through a stand-in that posts the same journal the settlement integration spec posts (capture → drawdown).
 */
const harness = integrationDatabase("complaints");
const config = { get: (key: string) => ({ "app.checkoutOrigin": "https://checkout.pagosya.bo", "app.merchantDashboardOrigin": "https://comercios.pagosya.bo", "app.orderTrackingSecret": "integration" } as Record<string, string>)[key] };
const files = { put: jest.fn(async () => "3f2504e0-4f89-11d3-9a0c-0305e82c3301"), get: jest.fn() };
const email = { send: jest.fn(async () => undefined) };
const dto = { buyerName: "Ana", buyerEmail: "ana@example.com", storeName: "Tienda Uno", category: "NOT_DELIVERED", request: "REFUND", description: "Pagué y el pedido nunca llegó a mi casa." } as any;

harness.describeDb("complaints (real Postgres)", () => {
  if (!harness.available) {
    harness.failIfUnavailable();
    return;
  }

  jest.setTimeout(120_000);
  let db: PrismaClient;
  let ledger: LedgerService;
  let holds: SettlementHoldService;
  let mailer: ComplaintMailer;
  let intake: ComplaintIntakeService;

  beforeAll(async () => {
    db = await harness.create();
    ledger = new LedgerService();
    holds = new SettlementHoldService(db as any, ledger, new SettlementPolicyService());
    mailer = new ComplaintMailer(db as any, email as any, config as any);
    intake = new ComplaintIntakeService(db as any, files as any, mailer, config as any);
  });

  afterAll(async () => {
    await harness.drop();
  });

  it("gives 20 simultaneous complaints 20 unique, consecutive numbers", async () => {
    const now = new Date("2026-10-08T19:00:00Z");
    const results = await Promise.all(Array.from({ length: 20 }, () => intake.create(dto, [], now)));
    const numbers = results.map((r) => r.number).sort();
    expect(new Set(numbers).size).toBe(20);
    expect(numbers[0]).toBe("R-2026-000001");
    expect(numbers[19]).toBe("R-2026-000020");
  });

  it("records the whole journey and refunds from the merchant's held funds", async () => {
    const merchant = await db.merchant.create({ data: { name: "Tienda Uno", email: `tienda-${harness.databaseName}@test.test`, level: 1, settlementMode: SettlementMode.AGGREGATOR } });
    const opsUser = await db.opsUser.create({ data: { name: "Ana", email: `ana-${harness.databaseName}@pagosya.bo`, hashedToken: "x", role: OpsRole.SUPPORT_ADMIN } });
    const admin = { id: opsUser.id, name: opsUser.name, email: opsUser.email, role: OpsRole.SUPPORT_ADMIN };

    // A captured AGGREGATOR payment, held as sub-project 3 holds it.
    const intent = await db.paymentIntent.create({ data: { merchantId: merchant.id, amount: 5000, clientSecret: `cs_${Math.random().toString(36).slice(2)}` } });
    const capture = await db.transaction.create({ data: { paymentIntentId: intent.id, type: TransactionType.CAPTURE, railId: "test", amount: 5000, status: TransactionStatus.SUCCEEDED } });
    await db.$transaction(async (tx) => {
      const lines = ledger.buildCaptureJournal({ merchantId: merchant.id, transactionId: capture.id, amount: 5000, settlementMode: SettlementMode.AGGREGATOR });
      await ledger.postJournalEntry(tx, ledger.generateGroupId(), lines, "BOB");
      await holds.recordCapture(tx, { merchantId: merchant.id, paymentIntentId: intent.id, transactionId: capture.id, currency: "BOB", lines, capturedAt: new Date() });
    });
    const heldBefore = (await merchantBalances(db as any, merchant.id)).find((b) => b.currency === "BOB")!;

    const refunds = {
      create: jest.fn(async (merchantId: string, refundDto: { paymentIntentId: string; amount?: number }) => {
        const amount = refundDto.amount ?? 5000;
        const txn = await db.transaction.create({ data: { paymentIntentId: refundDto.paymentIntentId, type: TransactionType.REFUND, railId: "test", amount, status: TransactionStatus.SUCCEEDED } });
        await db.$transaction(async (tx) => {
          const journal = ledger.buildRefundJournal({ merchantId, transactionId: txn.id, amount, settlementMode: SettlementMode.AGGREGATOR });
          const lines = await holds.applyRefundDrawdown(tx, { merchantId, paymentIntentId: refundDto.paymentIntentId, currency: "BOB", settlementMode: SettlementMode.AGGREGATOR, lines: journal });
          await ledger.postJournalEntry(tx, ledger.generateGroupId(), lines, "BOB");
        });
        return txn;
      }),
    };
    const settlementAdmin = new SettlementAdminService(db as any, ledger, new AuditLogService(db as any), email as any, new SettlementQueryService(db as any, new SettlementPolicyService()));
    const ops = new ComplaintOpsService(db as any, new AuditLogService(db as any), mailer, files as any, refunds as any, settlementAdmin);
    const merchantSide = new ComplaintMerchantService(db as any, files as any);

    const { number } = await intake.create({ ...dto, reference: intent.id }, []);
    const { id } = await db.complaint.findUniqueOrThrow({ where: { number } });
    expect((await db.complaint.findUniqueOrThrow({ where: { id } })).merchantId).toBe(merchant.id);

    await ops.take(id, admin);
    await ops.askMerchant(id, "¿Enviaste el pedido?", admin);
    await merchantSide.reply(merchant.id, "mu_it", id, "Lo enviamos el lunes por courier.", []);
    await ops.refund(id, { requestId: "req_journey_1" }, admin);
    await ops.answer(id, { outcome: ComplaintOutcome.UPHELD, answer: "Te devolvimos el dinero completo." }, admin);

    const events = await db.complaintEvent.findMany({ where: { complaintId: id, type: { not: ComplaintEventType.EMAIL_SENT } }, orderBy: { createdAt: "asc" } });
    expect(events.map((e) => e.type)).toEqual([
      ComplaintEventType.RECEIVED, ComplaintEventType.LINKED, ComplaintEventType.TAKEN, ComplaintEventType.MERCHANT_ASKED,
      ComplaintEventType.MERCHANT_REPLIED, ComplaintEventType.REFUND_REQUESTED, ComplaintEventType.REFUNDED, ComplaintEventType.ANSWERED,
    ]);
    expect(refunds.create).toHaveBeenCalledWith(merchant.id, { paymentIntentId: intent.id, reason: `Reclamo ${number}` }, `complaint-${id}-req_journey_1`);
    expect(await db.transaction.count({ where: { paymentIntentId: intent.id, type: TransactionType.REFUND } })).toBe(1);
    const heldAfter = (await merchantBalances(db as any, merchant.id)).find((b) => b.currency === "BOB")!;
    expect(heldAfter.pending).toBeLessThan(heldBefore.pending);
    expect(await db.auditLogEntry.count({ where: { targetType: "Complaint", targetId: id } })).toBe(4); // take, ask, refund, answer — the merchant reply is not an ops action

    await expect(ops.answer(id, { outcome: ComplaintOutcome.UPHELD, answer: "Una segunda respuesta final." }, admin)).rejects.toThrow("Este reclamo ya fue respondido.");
    await expect(merchantSide.reply(merchant.id, "mu_it", id, "Otra respuesta tardía del comercio.", [])).rejects.toThrow("Este reclamo ya fue respondido.");
  });
});
