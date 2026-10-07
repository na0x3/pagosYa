import { LedgerAccount, LedgerDirection, SettlementHoldStatus, SettlementMode } from "@prisma/client";
import { LedgerService } from "../ledger/ledger.service";
import { SettlementHoldService } from "./settlement-hold.service";

const { CREDIT, DEBIT } = LedgerDirection;
const policy = { delayDays: 7, reserveBps: 1000, reserveDays: 60 };

function fakeTx() {
  return {
    $executeRaw: jest.fn().mockResolvedValue(0),
    settlementHold: { create: jest.fn(), findUniqueOrThrow: jest.fn(), update: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    ledgerEntry: { createMany: jest.fn(), groupBy: jest.fn().mockResolvedValue([]) },
  };
}

function service(tx = fakeTx(), dueRows: { pending?: unknown[]; reserve?: unknown[] } = {}) {
  const prisma = {
    $transaction: jest.fn(async (cb: (t: unknown) => unknown) => cb(tx)),
    settlementHold: {
      findMany: jest.fn()
        .mockResolvedValueOnce(dueRows.pending ?? [])
        .mockResolvedValueOnce(dueRows.reserve ?? []),
    },
  };
  const policies = { resolve: jest.fn().mockResolvedValue(policy) };
  return { svc: new SettlementHoldService(prisma as any, new LedgerService(), policies as any), tx, prisma, policies };
}

const captureLines = [
  { account: LedgerAccount.RAIL_CLEARING, direction: DEBIT, amount: 10000, merchantId: "m_1", transactionId: "t_1" },
  { account: LedgerAccount.MERCHANT_PENDING, direction: CREDIT, amount: 9750, merchantId: "m_1", transactionId: "t_1" },
  { account: LedgerAccount.PAGOSYA_FEE_REVENUE, direction: CREDIT, amount: 250, merchantId: "m_1", transactionId: "t_1" },
];

describe("SettlementHoldService.recordCapture", () => {
  it("writes a hold with the policy snapshot, La Paz dates and a floored reserve", async () => {
    const { svc, tx } = service();
    await svc.recordCapture(tx as any, {
      merchantId: "m_1", paymentIntentId: "pi_1", transactionId: "t_1", currency: "BOB", lines: captureLines,
      capturedAt: new Date("2026-10-01T15:00:00Z"),
    });
    expect(tx.settlementHold.create).toHaveBeenCalledWith({
      data: {
        merchantId: "m_1", paymentIntentId: "pi_1", transactionId: "t_1", currency: "BOB",
        netAmount: 9750, pendingAmount: 9750, reserveAmount: 975,
        availableAt: new Date("2026-10-08T04:00:00.000Z"), reserveReleaseAt: new Date("2026-11-30T04:00:00.000Z"),
        delayDays: 7, reserveBps: 1000, reserveDays: 60,
      },
    });
  });

  it("does nothing for a capture without a MERCHANT_PENDING credit (FACILITATOR)", async () => {
    const { svc, tx, policies } = service();
    const facilitator = [
      { account: LedgerAccount.RAIL_CLEARING, direction: DEBIT, amount: 1000 },
      { account: LedgerAccount.MERCHANT_PAYABLE, direction: CREDIT, amount: 1000 },
    ];
    await svc.recordCapture(tx as any, { merchantId: "m_1", paymentIntentId: "pi_1", transactionId: "t_1", currency: "BOB", lines: facilitator });
    expect(tx.settlementHold.create).not.toHaveBeenCalled();
    expect(policies.resolve).not.toHaveBeenCalled();
  });

  it("never schedules the reserve release before the delay ends", async () => {
    const { svc, tx, policies } = service();
    policies.resolve.mockResolvedValue({ delayDays: 7, reserveBps: 500, reserveDays: 2 });
    await svc.recordCapture(tx as any, { merchantId: "m_1", paymentIntentId: "pi_1", transactionId: "t_1", currency: "BOB", lines: captureLines, capturedAt: new Date("2026-10-01T15:00:00Z") });
    const data = tx.settlementHold.create.mock.calls[0][0].data;
    expect(data.reserveReleaseAt).toEqual(data.availableAt);
  });
});

describe("SettlementHoldService.releaseDue", () => {
  const now = new Date("2026-10-08T05:00:00Z");
  const pendingHold = {
    id: "h_1", merchantId: "m_1", transactionId: "t_1", currency: "BOB", status: SettlementHoldStatus.PENDING,
    pendingAmount: 9750, reserveAmount: 975, availableAt: new Date("2026-10-08T04:00:00Z"), reserveReleaseAt: new Date("2026-11-30T04:00:00Z"),
  };

  it("moves a due pending hold into available and reserve under the merchant lock", async () => {
    const tx = fakeTx();
    tx.settlementHold.findUniqueOrThrow.mockResolvedValue(pendingHold);
    const { svc } = service(tx, { pending: [{ id: "h_1", merchantId: "m_1" }] });
    await expect(svc.releaseDue(now)).resolves.toBe(1);
    expect(tx.$executeRaw).toHaveBeenCalled();
    expect(tx.ledgerEntry.createMany.mock.calls[0][0].data).toEqual([
      expect.objectContaining({ account: LedgerAccount.MERCHANT_PENDING, direction: DEBIT, amount: 9750, transactionId: "t_1" }),
      expect.objectContaining({ account: LedgerAccount.MERCHANT_PAYABLE, direction: CREDIT, amount: 8775 }),
      expect.objectContaining({ account: LedgerAccount.RESERVE, direction: CREDIT, amount: 975 }),
    ]);
    expect(tx.settlementHold.update).toHaveBeenCalledWith({ where: { id: "h_1" }, data: { pendingAmount: 0, reserveAmount: 975, status: SettlementHoldStatus.RESERVE_HELD } });
  });

  it("closes a hold straight away when it has no reserve", async () => {
    const tx = fakeTx();
    tx.settlementHold.findUniqueOrThrow.mockResolvedValue({ ...pendingHold, reserveAmount: 0 });
    const { svc } = service(tx, { pending: [{ id: "h_1", merchantId: "m_1" }] });
    await svc.releaseDue(now);
    expect(tx.settlementHold.update).toHaveBeenCalledWith({ where: { id: "h_1" }, data: { pendingAmount: 0, reserveAmount: 0, status: SettlementHoldStatus.CLOSED } });
  });

  it("releases a due reserve back to available", async () => {
    const tx = fakeTx();
    tx.settlementHold.findUniqueOrThrow.mockResolvedValue({ ...pendingHold, status: SettlementHoldStatus.RESERVE_HELD, pendingAmount: 0, reserveReleaseAt: new Date("2026-10-08T04:00:00Z") });
    const { svc } = service(tx, { reserve: [{ id: "h_1", merchantId: "m_1" }] });
    await expect(svc.releaseDue(now)).resolves.toBe(1);
    expect(tx.ledgerEntry.createMany.mock.calls[0][0].data).toEqual([
      expect.objectContaining({ account: LedgerAccount.RESERVE, direction: DEBIT, amount: 975 }),
      expect.objectContaining({ account: LedgerAccount.MERCHANT_PAYABLE, direction: CREDIT, amount: 975 }),
    ]);
    expect(tx.settlementHold.update).toHaveBeenCalledWith({ where: { id: "h_1" }, data: { reserveAmount: 0, status: SettlementHoldStatus.CLOSED } });
  });

  it("skips a hold another run or a refund already moved (idempotent)", async () => {
    const tx = fakeTx();
    tx.settlementHold.findUniqueOrThrow.mockResolvedValue({ ...pendingHold, status: SettlementHoldStatus.CLOSED });
    const { svc } = service(tx, { pending: [{ id: "h_1", merchantId: "m_1" }] });
    await expect(svc.releaseDue(now)).resolves.toBe(0);
    expect(tx.ledgerEntry.createMany).not.toHaveBeenCalled();
  });

  it("keeps going when one hold fails", async () => {
    const tx = fakeTx();
    tx.settlementHold.findUniqueOrThrow.mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce(pendingHold);
    const { svc } = service(tx, { pending: [{ id: "bad", merchantId: "m_1" }, { id: "h_1", merchantId: "m_1" }] });
    await expect(svc.releaseDue(now)).resolves.toBe(1);
  });
});

describe("SettlementHoldService.applyRefundDrawdown", () => {
  const refundLines = [
    { account: LedgerAccount.MERCHANT_PAYABLE, direction: DEBIT, amount: 975, merchantId: "m_1", transactionId: "r_1" },
    { account: LedgerAccount.PAGOSYA_FEE_REVENUE, direction: DEBIT, amount: 25, merchantId: "m_1", transactionId: "r_1" },
    { account: LedgerAccount.RAIL_CLEARING, direction: CREDIT, amount: 1000, merchantId: "m_1", transactionId: "r_1" },
  ];

  it("leaves FACILITATOR refunds untouched", async () => {
    const { svc, tx } = service();
    await expect(svc.applyRefundDrawdown(tx as any, { merchantId: "m_1", paymentIntentId: "pi_1", currency: "BOB", settlementMode: SettlementMode.FACILITATOR, lines: refundLines }))
      .resolves.toBe(refundLines);
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it("replaces the payable debit with the drawdown and updates the holds", async () => {
    const tx = fakeTx();
    tx.ledgerEntry.groupBy.mockResolvedValue([{ direction: CREDIT, _sum: { amount: 100 } }]); // available 100
    tx.settlementHold.findMany.mockResolvedValue([
      { id: "own", paymentIntentId: "pi_1", status: SettlementHoldStatus.PENDING, pendingAmount: 975, reserveAmount: 97, createdAt: new Date("2026-10-01T00:00:00Z") },
    ]);
    const { svc } = service(tx);
    const lines = await svc.applyRefundDrawdown(tx as any, { merchantId: "m_1", paymentIntentId: "pi_1", currency: "BOB", settlementMode: SettlementMode.AGGREGATOR, lines: refundLines });
    expect(tx.$executeRaw).toHaveBeenCalled();
    expect(lines).toEqual([
      refundLines[1],
      refundLines[2],
      { account: LedgerAccount.MERCHANT_PAYABLE, direction: DEBIT, amount: 100, merchantId: "m_1", transactionId: "r_1" },
      { account: LedgerAccount.MERCHANT_PENDING, direction: DEBIT, amount: 875, merchantId: "m_1", transactionId: "r_1" },
    ]);
    expect(tx.settlementHold.update).toHaveBeenCalledWith({ where: { id: "own" }, data: { pendingAmount: 100, reserveAmount: 97, status: SettlementHoldStatus.PENDING } });
  });
});
