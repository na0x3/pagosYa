import { TransactionType } from "@prisma/client";
import { PaymentIntentsService } from "./payment-intents.service";

/** The rail success transaction, trimmed to what a cobro payment touches. */
function harness(metadata: Record<string, unknown>, livemode = true) {
  const intent = { id: "pi_1", status: "SUCCEEDED", livemode, amount: 3000, currency: "BOB", customerEmail: null, customerName: "Ana", metadata };
  const db: any = {
    $queryRaw: jest.fn().mockResolvedValue([{ ...intent, status: "REQUIRES_ACTION" }]),
    merchant: { findUniqueOrThrow: jest.fn().mockResolvedValue({ name: "Estudio", settlementMode: "AGGREGATOR" }) },
    transaction: { create: jest.fn().mockResolvedValue({ id: "tx_1" }) },
    paymentIntent: { update: jest.fn().mockResolvedValue(intent) },
    storeOrder: { findUnique: jest.fn().mockResolvedValue(null) },
    subscriptionInvoice: { updateMany: jest.fn() },
    appointment: { updateMany: jest.fn() },
    businessDocument: {
      findUnique: jest.fn().mockResolvedValue({ id: "cdoc1", status: "VIEWED", currentVersion: 1 }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    // The frozen version the customer was shown: Bs 30,00, the amount paid.
    businessDocumentVersion: { findUnique: jest.fn().mockResolvedValue({ content: { totalAmount: 3000, currency: "BOB" } }) },
    businessDocumentEvent: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
  };
  db.$transaction = jest.fn((fn: any) => fn(db));
  const config = { get: jest.fn((key: string) => (key === "app.dlocal" ? { bobPerUsd: 0, intlFeeBps: 590, costBps: 0 } : undefined)) };
  const limits = { assertPerPayment: jest.fn(), settle: jest.fn(), release: jest.fn() };
  const invoicing = { enqueueInvoice: jest.fn() };
  const ledger = { buildCaptureJournal: jest.fn(), generateGroupId: jest.fn(), postJournalEntry: jest.fn() };
  const service = new PaymentIntentsService(db, {} as any, {} as any, ledger as any, { enqueueEvent: jest.fn() } as any, invoicing as any, { send: jest.fn() } as any, config as any, limits as any, { notify: jest.fn() } as any, { recordCapture: jest.fn() } as any);
  jest.spyOn(service as any, "sendReceiptEmail").mockResolvedValue(undefined);
  jest.spyOn(service as any, "sendDebtPaymentNotification").mockResolvedValue(undefined);
  return { db, service, invoicing };
}

describe("PaymentIntentsService — a paid cobro", () => {
  it("marks the cobro paid in the same transaction that captures the payment, and still enqueues the SIN invoice", async () => {
    const { db, service, invoicing } = harness({ storeId: "store_1", businessDocument: { documentId: "cdoc1", version: 1, numberLabel: "COB-0001" } });
    await (service as any).applyRailResult("pi_1", "m_1", "rail", { status: "succeeded", raw: {} }, TransactionType.CAPTURE);
    expect(db.businessDocument.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: "cdoc1" }), data: expect.objectContaining({ status: "PAID", paymentIntentId: "pi_1" }) }));
    expect(db.businessDocumentEvent.createMany).toHaveBeenCalledWith(expect.objectContaining({ skipDuplicates: true }));
    expect(invoicing.enqueueInvoice).toHaveBeenCalledWith(db, "m_1", expect.objectContaining({ paymentIntentId: "pi_1", amount: 3000 }));
  });

  it("does not look for a cobro when the payment is not for one", async () => {
    const { db, service } = harness({ storeId: "store_1" });
    await (service as any).applyRailResult("pi_1", "m_1", "rail", { status: "succeeded", raw: {} }, TransactionType.CAPTURE);
    expect(db.businessDocument.findUnique).not.toHaveBeenCalled();
  });

  it("leaves the cobro alone when the payment fails", async () => {
    const { db, service } = harness({ storeId: "store_1", businessDocument: { documentId: "cdoc1", version: 1 } });
    db.paymentIntent.update.mockResolvedValue({ id: "pi_1", status: "FAILED", livemode: true, amount: 3000, currency: "BOB", metadata: {} });
    db.webhooks = undefined;
    await (service as any).applyRailResult("pi_1", "m_1", "rail", { status: "failed", raw: {} }, TransactionType.CAPTURE);
    expect(db.businessDocument.updateMany).not.toHaveBeenCalled();
  });
});
