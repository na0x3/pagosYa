import { PayoutScheduleJob } from "./payout-schedule.job";

describe("PayoutScheduleJob", () => {
  it("releases due holds before creating payouts", async () => {
    const order: string[] = [];
    const holds = { releaseDue: jest.fn(async () => { order.push("release"); return 2; }) };
    const payouts = { createDuePayouts: jest.fn(async () => { order.push("payouts"); }) };
    const now = new Date("2026-10-08T14:00:00Z");
    await new PayoutScheduleJob(holds as any, payouts as any).run(now);
    expect(holds.releaseDue).toHaveBeenCalledWith(now);
    expect(order).toEqual(["release", "payouts"]);
  });

  it("still pays out already-available money when the release fails", async () => {
    const holds = { releaseDue: jest.fn().mockRejectedValue(new Error("db down")) };
    const payouts = { createDuePayouts: jest.fn().mockResolvedValue(undefined) };
    await new PayoutScheduleJob(holds as any, payouts as any).run();
    expect(payouts.createDuePayouts).toHaveBeenCalled();
  });
});
