import { PayoutStatus } from "@prisma/client";
import { PayoutDeliveryWorker } from "./payout-delivery.worker";
import { LedgerService } from "../ledger/ledger.service";

function makeFakePrisma() {
  const prisma: any = {
    payout: { findMany: jest.fn(), updateMany: jest.fn(), update: jest.fn() },
    ledgerEntry: { createMany: jest.fn() },
    $transaction: jest.fn(),
  };
  // The transaction callback receives `tx` — hand it the same mocked prisma
  // object so `tx.payout.update`/`tx.ledgerEntry.createMany` resolve to spies.
  prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(prisma));
  return prisma;
}

function makeFakePayoutsService() {
  return { createDuePayouts: jest.fn().mockResolvedValue(undefined) };
}

function makeFakeProvider() {
  return { disburse: jest.fn() };
}

const basePayout = {
  id: "payout_1",
  merchantId: "m_1",
  amount: 10000,
  currency: "BOB",
  bankAccount: "BNB 123",
  status: PayoutStatus.PENDING,
  attempts: 0,
};

describe("PayoutDeliveryWorker.tick", () => {
  it("runs createDuePayouts before delivering candidates", async () => {
    const prisma = makeFakePrisma();
    prisma.payout.findMany.mockResolvedValue([]);
    const payoutsService = makeFakePayoutsService();

    const worker = new PayoutDeliveryWorker(prisma, payoutsService as any, new LedgerService(), makeFakeProvider() as any);
    await worker.tick();

    expect(payoutsService.createDuePayouts).toHaveBeenCalled();
  });

  it("skips a payout when the optimistic claim loses the race", async () => {
    const prisma = makeFakePrisma();
    prisma.payout.findMany.mockResolvedValue([basePayout]);
    prisma.payout.updateMany.mockResolvedValue({ count: 0 });
    const provider = makeFakeProvider();

    const worker = new PayoutDeliveryWorker(prisma, makeFakePayoutsService() as any, new LedgerService(), provider as any);
    await worker.tick();

    expect(provider.disburse).not.toHaveBeenCalled();
  });

  it("marks a successful disbursement SUCCEEDED and posts a balanced payout ledger journal", async () => {
    const prisma = makeFakePrisma();
    prisma.payout.findMany.mockResolvedValue([basePayout]);
    prisma.payout.updateMany.mockResolvedValue({ count: 1 });
    const provider = makeFakeProvider();
    provider.disburse.mockResolvedValue({ status: "succeeded", railReference: "payout_ref_1", raw: {} });

    const worker = new PayoutDeliveryWorker(prisma, makeFakePayoutsService() as any, new LedgerService(), provider as any);
    await worker.tick();

    expect(prisma.payout.update).toHaveBeenCalledWith({
      where: { id: "payout_1" },
      data: expect.objectContaining({
        status: PayoutStatus.SUCCEEDED,
        railReference: "payout_ref_1",
        nextRetryAt: null,
      }),
    });

    const entries = prisma.ledgerEntry.createMany.mock.calls[0][0].data;
    const debits = entries.filter((e: any) => e.direction === "DEBIT").reduce((s: number, e: any) => s + e.amount, 0);
    const credits = entries.filter((e: any) => e.direction === "CREDIT").reduce((s: number, e: any) => s + e.amount, 0);
    expect(debits).toBe(credits);
    expect(debits).toBe(10000);
  });

  it("schedules an exponential backoff retry when disbursement fails", async () => {
    const prisma = makeFakePrisma();
    // pre-claim attempts=3 -> post-claim=4 -> backoff = 5000 * 2^(4-1) = 40000ms
    prisma.payout.findMany.mockResolvedValue([{ ...basePayout, attempts: 3 }]);
    prisma.payout.updateMany.mockResolvedValue({ count: 1 });
    const provider = makeFakeProvider();
    provider.disburse.mockResolvedValue({ status: "failed", failureReason: "bank_account_rejected", raw: {} });

    const before = Date.now();
    const worker = new PayoutDeliveryWorker(prisma, makeFakePayoutsService() as any, new LedgerService(), provider as any);
    await worker.tick();

    const call = prisma.payout.update.mock.calls[0][0];
    expect(call.data.status).toBe(PayoutStatus.FAILED);
    expect(call.data.failureReason).toBe("bank_account_rejected");
    const nextRetryAt = call.data.nextRetryAt.getTime();
    expect(nextRetryAt - before).toBeGreaterThanOrEqual(39_000);
    expect(nextRetryAt - before).toBeLessThan(41_000);
  });

  it("catches a thrown provider error and schedules a retry instead of rejecting", async () => {
    const prisma = makeFakePrisma();
    prisma.payout.findMany.mockResolvedValue([basePayout]);
    prisma.payout.updateMany.mockResolvedValue({ count: 1 });
    const provider = makeFakeProvider();
    provider.disburse.mockRejectedValue(new Error("bank api down"));

    const worker = new PayoutDeliveryWorker(prisma, makeFakePayoutsService() as any, new LedgerService(), provider as any);
    await expect(worker.tick()).resolves.toBeUndefined();

    expect(prisma.payout.update).toHaveBeenCalledWith({
      where: { id: "payout_1" },
      data: expect.objectContaining({ status: PayoutStatus.FAILED, failureReason: "bank api down" }),
    });
  });

  it("stops scheduling retries once MAX_ATTEMPTS is reached", async () => {
    const prisma = makeFakePrisma();
    prisma.payout.findMany.mockResolvedValue([{ ...basePayout, attempts: 7 }]);
    prisma.payout.updateMany.mockResolvedValue({ count: 1 });
    const provider = makeFakeProvider();
    provider.disburse.mockResolvedValue({ status: "failed", failureReason: "x", raw: {} });

    const worker = new PayoutDeliveryWorker(prisma, makeFakePayoutsService() as any, new LedgerService(), provider as any);
    await worker.tick();

    expect(prisma.payout.update).toHaveBeenCalledWith({
      where: { id: "payout_1" },
      data: expect.objectContaining({ nextRetryAt: null }),
    });
  });
});
