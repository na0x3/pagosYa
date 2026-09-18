import { ConflictException } from "@nestjs/common";
import { SettlementMode, TransactionStatus, TransactionType } from "@prisma/client";
import { RefundsService } from "./refunds.service";

function harness(options: {
  byId?: Record<string, unknown> | null;
  timedOut?: Record<string, unknown>[];
  lockedStatus?: TransactionStatus;
  paymentReference?: string | null;
  inFlight?: Record<string, unknown> | null;
} = {}) {
  const pendingRefund = { id: "txn_refund_1", paymentIntentId: "pi_usd", railId: "dlocal", type: TransactionType.REFUND, amount: 5000, status: TransactionStatus.PENDING, railReference: "R-1" };
  const prisma: any = {
    transaction: {
      findFirst: jest.fn().mockImplementation(({ where }: any) => {
        if (where.type === TransactionType.REFUND && where.railReference === null) return Promise.resolve(options.inFlight ?? null);
        if (where.type === TransactionType.REFUND) return Promise.resolve(options.byId === undefined ? pendingRefund : options.byId);
        // AUTHORIZATION lookups: the dLocal payment behind the intent
        const reference = options.paymentReference === undefined ? "D-1" : options.paymentReference;
        if (!reference) return Promise.resolve(null);
        if (where.railReference && where.railReference !== reference) return Promise.resolve(null);
        return Promise.resolve({ paymentIntentId: "pi_usd", railReference: reference, paymentIntent: { merchantId: "merchant_1" } });
      }),
      findMany: jest.fn().mockResolvedValue(options.timedOut ?? []),
      update: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ ...pendingRefund, ...data })),
    },
    paymentIntent: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({ id: "pi_usd", merchantId: "merchant_1", livemode: false, amount: 5000, currency: "USD", customerEmail: null, customerName: null }),
    },
    $queryRaw: jest.fn().mockResolvedValue([{ status: options.lockedStatus ?? TransactionStatus.PENDING }]),
    merchant: { findUniqueOrThrow: jest.fn().mockResolvedValue({ settlementMode: SettlementMode.AGGREGATOR }) },
    supportCase: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: "case_1" }) },
  };
  prisma.$transaction = jest.fn((callback: (tx: any) => unknown) => callback(prisma));
  const ledger = { buildRefundJournal: jest.fn().mockReturnValue([]), generateGroupId: jest.fn().mockReturnValue("group_1"), postJournalEntry: jest.fn() };
  const webhooks = { enqueueEvent: jest.fn() };
  const config = { get: jest.fn().mockReturnValue({ bobPerUsd: 6.96, intlFeeBps: 590, costBps: 420 }) };
  const shipments = { cancelForOrder: jest.fn() };
  const service = new RefundsService(prisma, { get: jest.fn() } as any, ledger as any, webhooks as any, config as any, shipments as any);
  jest.spyOn((service as any).logger, "error").mockImplementation(() => undefined);
  jest.spyOn((service as any).logger, "warn").mockImplementation(() => undefined);
  return { service, prisma, ledger, webhooks, shipments };
}

const notice = (fields: Record<string, unknown> = {}) => ({ id: "R-1", payment_id: "D-1", status: "SUCCESS", amount: 50, currency: "USD", ...fields });
const timedOutRow = { id: "txn_refund_1", paymentIntentId: "pi_usd", railId: "dlocal", amount: 5000, status: TransactionStatus.PENDING, railReference: "refund:D-1" };

describe("RefundsService.applyDlocalRefundNotification", () => {
  it("marks a pending refund SUCCEEDED and posts the refund journal with dLocal pricing", async () => {
    const test = harness();
    await expect(test.service.applyDlocalRefundNotification(notice())).resolves.toBe("applied");
    expect(test.prisma.transaction.update).toHaveBeenCalledWith({
      where: { id: "txn_refund_1" },
      data: expect.objectContaining({ status: TransactionStatus.SUCCEEDED, railReference: "R-1" }),
    });
    expect(test.ledger.buildRefundJournal).toHaveBeenCalledWith(expect.objectContaining({
      merchantId: "merchant_1", transactionId: "txn_refund_1", amount: 5000, settlementMode: SettlementMode.AGGREGATOR,
      pricing: expect.objectContaining({ feeBps: 590 }),
    }));
    expect(test.ledger.postJournalEntry).toHaveBeenCalledWith(test.prisma, "group_1", [], "USD");
    expect(test.webhooks.enqueueEvent).toHaveBeenCalledWith(test.prisma, "merchant_1", "refund.succeeded", { paymentIntentId: "pi_usd", amount: 5000 });
  });

  it("a SUCCESS that completes a full refund cancels the order's shipment in the same transaction; a partial one does not", async () => {
    for (const [settled, cancels] of [[5000, true], [2000, false]] as const) {
      const test = harness();
      test.prisma.storeOrder = { findUnique: jest.fn().mockResolvedValue({ id: "ord_1", storeId: "st_1", storeName: "Tienda" }) };
      test.prisma.transaction.aggregate = jest.fn().mockResolvedValue({ _sum: { amount: settled } });
      await expect(test.service.applyDlocalRefundNotification(notice())).resolves.toBe("applied");
      expect(test.prisma.transaction.aggregate).toHaveBeenCalledWith({ where: { paymentIntentId: "pi_usd", type: TransactionType.REFUND, status: TransactionStatus.SUCCEEDED }, _sum: { amount: true } });
      if (cancels) expect(test.shipments.cancelForOrder).toHaveBeenCalledWith(test.prisma, "ord_1");
      else expect(test.shipments.cancelForOrder).not.toHaveBeenCalled();
    }
  });

  it("marks a pending refund FAILED on REJECTED, releasing the reservation without a journal", async () => {
    const test = harness();
    await expect(test.service.applyDlocalRefundNotification(notice({ status: "REJECTED" }))).resolves.toBe("applied");
    expect(test.prisma.transaction.update).toHaveBeenCalledWith({
      where: { id: "txn_refund_1" },
      data: expect.objectContaining({ status: TransactionStatus.FAILED }),
    });
    expect(test.ledger.postJournalEntry).not.toHaveBeenCalled();
  });

  it("is idempotent when the same outcome arrives again", async () => {
    const succeeded = harness({ lockedStatus: TransactionStatus.SUCCEEDED });
    await expect(succeeded.service.applyDlocalRefundNotification(notice())).resolves.toBe("duplicate");
    const failed = harness({ lockedStatus: TransactionStatus.FAILED });
    await expect(failed.service.applyDlocalRefundNotification(notice({ status: "REJECTED" }))).resolves.toBe("duplicate");
    for (const test of [succeeded, failed]) {
      expect(test.prisma.transaction.update).not.toHaveBeenCalled();
      expect(test.ledger.postJournalEntry).not.toHaveBeenCalled();
      expect(test.prisma.supportCase.create).not.toHaveBeenCalled();
    }
  });

  it("leaves a PENDING notification pending but binds a timed-out refund to dLocal's refund id", async () => {
    const test = harness({ byId: null, timedOut: [timedOutRow] });
    await expect(test.service.applyDlocalRefundNotification(notice({ status: "PENDING" }))).resolves.toBe("pending");
    expect(test.prisma.transaction.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { type: TransactionType.REFUND, railId: "dlocal", railReference: "refund:D-1", status: TransactionStatus.PENDING },
    }));
    expect(test.prisma.transaction.update).toHaveBeenCalledWith({ where: { id: "txn_refund_1" }, data: { railReference: "R-1" } });
    expect(test.ledger.postJournalEntry).not.toHaveBeenCalled();
  });

  it("settles a timed-out refund matched through its payment id", async () => {
    const test = harness({ byId: null, timedOut: [timedOutRow] });
    await expect(test.service.applyDlocalRefundNotification(notice())).resolves.toBe("applied");
    expect(test.ledger.postJournalEntry).toHaveBeenCalled();
  });

  it("opens a support case instead of guessing when several timed-out refunds share the payment", async () => {
    const test = harness({ byId: null, timedOut: [timedOutRow, { ...timedOutRow, id: "txn_b" }] });
    await expect(test.service.applyDlocalRefundNotification(notice())).resolves.toBe("escalated");
    expect(test.prisma.transaction.update).not.toHaveBeenCalled();
    expect(test.prisma.supportCase.create).toHaveBeenCalledWith({ data: expect.objectContaining({ merchantId: "merchant_1", summary: expect.stringContaining("R-1") }) });
  });

  it("opens a support case when a successful refund matches no refund we recorded", async () => {
    const test = harness({ byId: null, timedOut: [] });
    await expect(test.service.applyDlocalRefundNotification(notice())).resolves.toBe("escalated");
    expect(test.prisma.supportCase.create).toHaveBeenCalledTimes(1);
  });

  it("asks dLocal to retry (409) when the refund request that created it is still being recorded", async () => {
    const test = harness({ byId: null, timedOut: [], inFlight: { id: "txn_in_flight" } });
    await expect(test.service.applyDlocalRefundNotification(notice())).rejects.toBeInstanceOf(ConflictException);
    expect(test.prisma.transaction.findFirst).toHaveBeenCalledWith({
      where: {
        type: TransactionType.REFUND, railId: "dlocal", railReference: null, status: TransactionStatus.PENDING,
        paymentIntent: { transactions: { some: { type: TransactionType.AUTHORIZATION, railId: "dlocal", railReference: "D-1" } } },
      },
      select: { id: true },
    });
    expect(test.prisma.supportCase.create).not.toHaveBeenCalled();
  });

  it("only logs an unmatched REJECTED or PENDING refund, since nothing was reserved or moved", async () => {
    const test = harness({ byId: null, timedOut: [] });
    await expect(test.service.applyDlocalRefundNotification(notice({ status: "REJECTED" }))).resolves.toBe("ignored");
    await expect(test.service.applyDlocalRefundNotification(notice({ status: "PENDING" }))).resolves.toBe("ignored");
    expect(test.prisma.supportCase.create).not.toHaveBeenCalled();
  });

  it("logs at error level when a successful unmatched refund has no merchant to open a case for", async () => {
    const test = harness({ byId: null, timedOut: [], paymentReference: null });
    await expect(test.service.applyDlocalRefundNotification(notice())).resolves.toBe("escalated");
    expect(test.prisma.supportCase.create).not.toHaveBeenCalled();
    expect((test.service as any).logger.error).toHaveBeenCalledWith(expect.stringContaining("R-1"));
  });

  it("opens a support case when the notification's payment, amount or currency does not match the recorded refund", async () => {
    const payment = harness({ paymentReference: "D-other" });
    const amount = harness();
    const currency = harness();
    await expect(payment.service.applyDlocalRefundNotification(notice())).resolves.toBe("escalated");
    await expect(amount.service.applyDlocalRefundNotification(notice({ amount: 49.99 }))).resolves.toBe("escalated");
    await expect(currency.service.applyDlocalRefundNotification(notice({ currency: "BRL" }))).resolves.toBe("escalated");
    for (const test of [amount, currency]) {
      expect(test.prisma.transaction.update).not.toHaveBeenCalled();
      expect(test.prisma.supportCase.create).toHaveBeenCalledTimes(1);
    }
    expect(payment.prisma.transaction.update).not.toHaveBeenCalled();
  });

  it("opens a support case when dLocal reports SUCCESS for a refund we already released as FAILED", async () => {
    const test = harness({ lockedStatus: TransactionStatus.FAILED });
    await expect(test.service.applyDlocalRefundNotification(notice())).resolves.toBe("escalated");
    expect(test.prisma.transaction.update).not.toHaveBeenCalled();
    expect(test.prisma.supportCase.create).toHaveBeenCalledTimes(1);
  });

  it("ignores a notification without a refund id or payment id", async () => {
    const test = harness();
    await expect(test.service.applyDlocalRefundNotification(notice({ id: undefined }))).resolves.toBe("ignored");
    await expect(test.service.applyDlocalRefundNotification(notice({ payment_id: "" }))).resolves.toBe("ignored");
    expect(test.prisma.transaction.update).not.toHaveBeenCalled();
  });
});
