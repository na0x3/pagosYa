import { PayoutsController } from "./payouts.controller";

describe("PayoutsController.getBalance", () => {
  const settlement = {
    balances: jest.fn().mockResolvedValue([{ currency: "BOB", available: 8775, pending: 9750, reserve: 975 }]),
    payoutsHeld: jest.fn().mockResolvedValue(false),
  };

  it("keeps the old fields and adds pending, reserve and the next batch", async () => {
    // Only the clock is faked; leaving the microtask queue real keeps the awaited mocks resolving.
    jest.useFakeTimers({ now: new Date("2026-10-08T13:00:00Z"), doNotFake: ["nextTick", "queueMicrotask", "setImmediate"] });
    const body = await new PayoutsController({} as any, settlement as any).getBalance({ id: "m_1" });
    jest.useRealTimers();
    expect(body).toEqual({
      payableBalance: 8775,
      currency: "BOB",
      payoutsHeld: false,
      balances: [{ currency: "BOB", payableBalance: 8775, available: 8775, pending: 9750, reserve: 975, nextPayoutAt: "2026-10-08T14:00:00.000Z" }],
    });
  });

  it("shows no next payout while payouts are held, and never the reason", async () => {
    settlement.payoutsHeld.mockResolvedValueOnce(true);
    const body = await new PayoutsController({} as any, settlement as any).getBalance({ id: "m_1" });
    expect(body.payoutsHeld).toBe(true);
    expect(body.balances[0].nextPayoutAt).toBeNull();
    expect(JSON.stringify(body)).not.toContain("Reason");
  });
});
