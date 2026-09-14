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
  return { service: new RefundsService(prisma, rails as any, ledger as any, webhooks as any), prisma, rail, ledger, webhooks };
}

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
