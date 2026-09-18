import { BadRequestException } from "@nestjs/common";
import { PaymentIntentStatus, SettlementMode, TransactionStatus, TransactionType } from "@prisma/client";
import { RefundsService } from "./refunds.service";

function harness(refundedOrReserved = 0) {
  const refundTransaction = {
    id: "txn_refund_1",
    paymentIntentId: "pi_abc",
    railId: "mock_card",
    amount: 300,
    status: TransactionStatus.PENDING,
  };
  const prisma: any = {
    $queryRaw: jest.fn().mockResolvedValue([
      { id: "pi_abc", amount: 1_000, currency: "BOB", status: PaymentIntentStatus.SUCCEEDED },
    ]),
    transaction: {
      findFirst: jest.fn().mockResolvedValue({ railId: "mock_card", railReference: "rail_auth_1" }),
      aggregate: jest.fn().mockResolvedValue({ _sum: { amount: refundedOrReserved } }),
      create: jest.fn().mockResolvedValue(refundTransaction),
      update: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ ...refundTransaction, ...data })),
    },
    merchant: { findUniqueOrThrow: jest.fn().mockResolvedValue({ settlementMode: SettlementMode.AGGREGATOR }) },
  };
  prisma.$transaction = jest.fn((callback: (tx: any) => unknown) => callback(prisma));
  const rail = {
    refund: jest.fn().mockResolvedValue({ status: "succeeded", railReference: "rail_refund_1", raw: {} }),
  };
  const rails = { get: jest.fn().mockReturnValue(rail) };
  const ledger = {
    buildRefundJournal: jest.fn().mockReturnValue([]),
    generateGroupId: jest.fn().mockReturnValue("group_1"),
    postJournalEntry: jest.fn(),
  };
  const webhooks = { enqueueEvent: jest.fn() };
  const config = { get: jest.fn().mockReturnValue({ bobPerUsd: 0, intlFeeBps: 590, costBps: 0 }) };
  const shipments = { cancelForOrder: jest.fn() };
  return { service: new RefundsService(prisma, rails as any, ledger as any, webhooks as any, config as any, shipments as any), prisma, rail, ledger, webhooks, shipments };
}

describe("RefundsService stops the order's shipment on a full refund", () => {
  // The payment is 1000; `settled` is the sum of SUCCEEDED refunds once this one has succeeded.
  function withOrder(settled: number) {
    const test = harness();
    test.prisma.storeOrder = { findUnique: jest.fn().mockResolvedValue({ id: "ord_1", storeId: "st_1", storeName: "Tienda" }) };
    test.prisma.transaction.aggregate = jest.fn(({ where }: any) => Promise.resolve({ _sum: { amount: where.status === TransactionStatus.SUCCEEDED ? settled : 0 } }));
    return test;
  }

  it("cancels the shipment inside the refund transaction when the payment is fully refunded", async () => {
    const test = withOrder(1_000);
    test.rail.refund.mockResolvedValue({ status: "succeeded", railReference: "rail_refund_1", raw: {} });
    await test.service.create("merchant_1", { paymentIntentId: "pi_abc" }, "refund-order-full");
    expect(test.prisma.storeOrder.findUnique).toHaveBeenCalledWith({ where: { paymentIntentId: "pi_abc" } });
    expect(test.shipments.cancelForOrder).toHaveBeenCalledWith(test.prisma, "ord_1");
  });

  it("leaves the shipment alone on a partial refund", async () => {
    const test = withOrder(300);
    await test.service.create("merchant_1", { paymentIntentId: "pi_abc", amount: 300 }, "refund-order-partial");
    expect(test.shipments.cancelForOrder).not.toHaveBeenCalled();
  });

  it("does not cancel while the rail refund is still pending", async () => {
    const test = withOrder(1_000);
    test.rail.refund.mockResolvedValue({ status: "pending", railReference: "rail_refund_1", raw: {} });
    await test.service.create("merchant_1", { paymentIntentId: "pi_abc" }, "refund-order-pending");
    expect(test.shipments.cancelForOrder).not.toHaveBeenCalled();
  });

  it("does nothing for a payment that is not a store order", async () => {
    const test = withOrder(1_000);
    test.prisma.storeOrder.findUnique.mockResolvedValue(null);
    await test.service.create("merchant_1", { paymentIntentId: "pi_abc" }, "refund-order-none");
    expect(test.shipments.cancelForOrder).not.toHaveBeenCalled();
  });
});

describe("RefundsService financial invariants", () => {
  it("requires a bounded idempotency key before contacting storage or a rail", async () => {
    const test = harness();
    await expect(test.service.create("merchant_1", { paymentIntentId: "pi_abc", amount: 300 }, undefined)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(test.prisma.$transaction).not.toHaveBeenCalled();
    expect(test.rail.refund).not.toHaveBeenCalled();
  });

  it("reserves the amount under a row lock before calling the external rail", async () => {
    const test = harness();
    await test.service.create("merchant_1", { paymentIntentId: "pi_abc", amount: 300 }, "refund-order-123");

    expect(test.prisma.transaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ type: TransactionType.REFUND, amount: 300, status: TransactionStatus.PENDING }),
    });
    expect(test.rail.refund).toHaveBeenCalledWith(expect.objectContaining({
      amount: 300,
      idempotencyKey: expect.stringMatching(/^refund_[a-f0-9]{64}$/),
    }));
    expect(test.prisma.transaction.update).toHaveBeenCalledWith({
      where: { id: "txn_refund_1" },
      data: expect.objectContaining({ status: TransactionStatus.SUCCEEDED }),
    });
    expect(test.ledger.postJournalEntry).toHaveBeenCalled();
    expect(test.webhooks.enqueueEvent).toHaveBeenCalled();
  });

  it("keeps a pending rail refund reserved as PENDING without posting the refund journal yet", async () => {
    const test = harness();
    test.rail.refund.mockResolvedValue({ status: "pending", railReference: "R-1", raw: { status: "PENDING" } });
    const result = await test.service.create("merchant_1", { paymentIntentId: "pi_abc", amount: 300 }, "refund-order-789");

    expect(test.prisma.transaction.update).toHaveBeenCalledWith({
      where: { id: "txn_refund_1" },
      data: expect.objectContaining({ status: TransactionStatus.PENDING, railReference: "R-1" }),
    });
    expect(result.status).toBe(TransactionStatus.PENDING);
    expect(test.ledger.postJournalEntry).not.toHaveBeenCalled();
    expect(test.webhooks.enqueueEvent).not.toHaveBeenCalled();
  });

  it("still records a failed rail refund as FAILED, releasing the reservation", async () => {
    const test = harness();
    test.rail.refund.mockResolvedValue({ status: "failed", railReference: "rail_refund_x", raw: {} });
    await test.service.create("merchant_1", { paymentIntentId: "pi_abc", amount: 300 }, "refund-order-790");
    expect(test.prisma.transaction.update).toHaveBeenCalledWith({
      where: { id: "txn_refund_1" },
      data: expect.objectContaining({ status: TransactionStatus.FAILED }),
    });
    expect(test.ledger.postJournalEntry).not.toHaveBeenCalled();
  });

  it("counts pending reservations and succeeded refunds against the refundable balance", async () => {
    const test = harness(800);
    await expect(
      test.service.create("merchant_1", { paymentIntentId: "pi_abc", amount: 300 }, "refund-order-456"),
    ).rejects.toThrow("remaining refundable amount (200)");
    expect(test.rail.refund).not.toHaveBeenCalled();
  });
  it.each([true, false])("queues refund mail only for a real store payment (livemode=%s)", async (livemode) => {
    const test = harness();
    test.prisma.$queryRaw.mockResolvedValue([{id:"pi_abc",amount:1000,currency:"BOB",status:PaymentIntentStatus.SUCCEEDED,livemode,customerEmail:"buyer@example.test",customerName:"Ana"}]);
    test.prisma.storeOrder={findUnique:jest.fn().mockResolvedValue({id:"order-1",storeId:"store-a",storeName:"Tienda A"})};
    test.prisma.storeRetention={findUnique:jest.fn().mockResolvedValue({settings:{emailWorkspace:{templates:{REFUND:{enabled:true,subject:"Reembolso {{store}}",body:"Importe: {{amount}}"}},staff:{enabled:false,recipients:[]}}}})};
    test.prisma.storeEmailDelivery={upsert:jest.fn()};
    await test.service.create("merchant_1",{paymentIntentId:"pi_abc",amount:300},"refund-mail-1");
    expect(test.prisma.storeEmailDelivery.upsert).toHaveBeenCalledTimes(livemode ? 1 : 0);
    if(livemode)expect(test.prisma.storeEmailDelivery.upsert).toHaveBeenCalledWith(expect.objectContaining({create:expect.objectContaining({storeId:"store-a",kind:"WORKSPACE_REFUND",body:"Importe: 3.00 BOB"})}));
  });

});
