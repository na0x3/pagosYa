import { PayoutsController } from "./payouts.controller";

describe("PayoutsController.getBalance", () => {
  const settlement = {
    balances: jest.fn().mockResolvedValue([{ currency: "BOB", available: 8775, pending: 9750, reserve: 975 }]),
    payoutsHeld: jest.fn().mockResolvedValue(false),
  };
  const payouts = { payoutBlocker: jest.fn().mockResolvedValue(null) };

  it("keeps the old fields and adds pending, reserve and the next batch", async () => {
    // Only the clock is faked; leaving the microtask queue real keeps the awaited mocks resolving.
    jest.useFakeTimers({ now: new Date("2026-10-08T13:00:00Z"), doNotFake: ["nextTick", "queueMicrotask", "setImmediate"] });
    const body = await new PayoutsController(payouts as any, settlement as any).getBalance({ id: "m_1" });
    jest.useRealTimers();
    expect(body).toEqual({
      payableBalance: 8775,
      currency: "BOB",
      payoutsHeld: false,
      balances: [{ currency: "BOB", payableBalance: 8775, available: 8775, pending: 9750, reserve: 975, nextPayoutAt: "2026-10-08T14:00:00.000Z", payoutBlocker: null }],
    });
  });

  it("shows no next payout while payouts are held, and never the reason", async () => {
    settlement.payoutsHeld.mockResolvedValueOnce(true);
    payouts.payoutBlocker.mockResolvedValueOnce("held");
    const body = await new PayoutsController(payouts as any, settlement as any).getBalance({ id: "m_1" });
    expect(body.payoutsHeld).toBe(true);
    expect(body.balances[0].nextPayoutAt).toBeNull();
    expect(body.balances[0].payoutBlocker).toBe("held");
    expect(JSON.stringify(body)).not.toContain("Reason");
  });

  it("promises no payout the batch would skip, and says why with a code", async () => {
    payouts.payoutBlocker.mockResolvedValueOnce("terms");
    const body = await new PayoutsController(payouts as any, settlement as any).getBalance({ id: "m_1" });
    expect(payouts.payoutBlocker).toHaveBeenCalledWith("m_1", "BOB");
    expect(body.balances[0].nextPayoutAt).toBeNull();
    expect(body.balances[0].payoutBlocker).toBe("terms");
  });
});
