import { LedgerAccount, SettlementHoldStatus } from "@prisma/client";
import { OpenHold, planRefundDrawdown, takeFromReserve } from "./settlement-drawdown";

const { PENDING, RESERVE_HELD, CLOSED } = SettlementHoldStatus;
const hold = (over: Partial<OpenHold>): OpenHold => ({
  id: "h", paymentIntentId: "pi_other", status: PENDING, pendingAmount: 0, reserveAmount: 0, createdAt: new Date("2026-10-01T00:00:00Z"), ...over,
});

describe("planRefundDrawdown", () => {
  it("takes everything from available when it covers the refund", () => {
    const plan = planRefundDrawdown({ net: 1000, available: 5000, paymentIntentId: "pi_1", holds: [hold({ id: "h1", pendingAmount: 900 })] });
    expect(plan.debits).toEqual([{ account: LedgerAccount.MERCHANT_PAYABLE, amount: 1000 }]);
    expect(plan.holdUpdates).toEqual([]);
  });

  it("then takes pending from the refunded payment's own hold first, then oldest-first", () => {
    const holds = [
      hold({ id: "older", pendingAmount: 400, reserveAmount: 40, createdAt: new Date("2026-09-01T00:00:00Z") }),
      hold({ id: "own", paymentIntentId: "pi_1", pendingAmount: 500, reserveAmount: 50, createdAt: new Date("2026-10-02T00:00:00Z") }),
    ];
    const plan = planRefundDrawdown({ net: 1000, available: 300, paymentIntentId: "pi_1", holds });
    expect(plan.debits).toEqual([
      { account: LedgerAccount.MERCHANT_PAYABLE, amount: 300 },
      { account: LedgerAccount.MERCHANT_PENDING, amount: 700 },
    ]);
    expect(plan.holdUpdates).toEqual([
      { id: "own", pendingAmount: 0, reserveAmount: 0, status: CLOSED },
      { id: "older", pendingAmount: 200, reserveAmount: 40, status: PENDING },
    ]);
  });

  it("then takes reserve oldest-first", () => {
    const holds = [
      hold({ id: "r2", status: RESERVE_HELD, reserveAmount: 300, createdAt: new Date("2026-09-10T00:00:00Z") }),
      hold({ id: "r1", status: RESERVE_HELD, reserveAmount: 200, createdAt: new Date("2026-09-01T00:00:00Z") }),
    ];
    const plan = planRefundDrawdown({ net: 400, available: 0, paymentIntentId: "pi_1", holds });
    expect(plan.debits).toEqual([{ account: LedgerAccount.RESERVE, amount: 400 }]);
    expect(plan.holdUpdates).toEqual([
      { id: "r1", pendingAmount: 0, reserveAmount: 0, status: CLOSED },
      { id: "r2", pendingAmount: 0, reserveAmount: 100, status: RESERVE_HELD },
    ]);
  });

  it("drives available negative for whatever is left, and ignores an already negative available", () => {
    const plan = planRefundDrawdown({ net: 1000, available: -200, paymentIntentId: "pi_1", holds: [hold({ id: "r", status: RESERVE_HELD, reserveAmount: 100 })] });
    expect(plan.debits).toEqual([
      { account: LedgerAccount.MERCHANT_PAYABLE, amount: 900 },
      { account: LedgerAccount.RESERVE, amount: 100 },
    ]);
  });

  it("returns no debits for a zero net", () => {
    expect(planRefundDrawdown({ net: 0, available: 0, paymentIntentId: "pi_1", holds: [] }).debits).toEqual([]);
  });
});

describe("takeFromReserve", () => {
  it("takes oldest-first and closes emptied holds", () => {
    const holds = [
      hold({ id: "new", status: RESERVE_HELD, reserveAmount: 500, createdAt: new Date("2026-09-20T00:00:00Z") }),
      hold({ id: "old", status: RESERVE_HELD, reserveAmount: 300, createdAt: new Date("2026-09-01T00:00:00Z") }),
      hold({ id: "pending", status: PENDING, pendingAmount: 999 }),
    ];
    expect(takeFromReserve(400, holds)).toEqual([
      { id: "old", pendingAmount: 0, reserveAmount: 0, status: CLOSED },
      { id: "new", pendingAmount: 0, reserveAmount: 400, status: RESERVE_HELD },
    ]);
  });
});
