import { PayoutScheduleJob } from "./payout-schedule.job";

function fakePrisma(locked = true) {
  const tx = { $queryRaw: jest.fn().mockResolvedValue([{ locked }]) };
  return { tx, prisma: { $transaction: jest.fn(async (cb: (t: unknown) => unknown) => cb(tx)) } };
}

describe("PayoutScheduleJob", () => {
  it("releases due holds before creating payouts", async () => {
    const order: string[] = [];
    const holds = { releaseDue: jest.fn(async () => { order.push("release"); return 2; }) };
    const payouts = { createDuePayouts: jest.fn(async () => { order.push("payouts"); }) };
    const now = new Date("2026-10-08T14:00:00Z");
    const { prisma, tx } = fakePrisma();
    await new PayoutScheduleJob(prisma as any, holds as any, payouts as any).run(now);
    expect(tx.$queryRaw).toHaveBeenCalled();
    expect(holds.releaseDue).toHaveBeenCalledWith(now);
    expect(order).toEqual(["release", "payouts"]);
  });

  it("still pays out already-available money when the release fails", async () => {
    const holds = { releaseDue: jest.fn().mockRejectedValue(new Error("db down")) };
    const payouts = { createDuePayouts: jest.fn().mockResolvedValue(undefined) };
    await new PayoutScheduleJob(fakePrisma().prisma as any, holds as any, payouts as any).run();
    expect(payouts.createDuePayouts).toHaveBeenCalled();
  });

  it("does nothing when another instance holds the batch lock", async () => {
    const holds = { releaseDue: jest.fn().mockResolvedValue(0) };
    const payouts = { createDuePayouts: jest.fn().mockResolvedValue(undefined) };
    await new PayoutScheduleJob(fakePrisma(false).prisma as any, holds as any, payouts as any).run();
    expect(holds.releaseDue).not.toHaveBeenCalled();
    expect(payouts.createDuePayouts).not.toHaveBeenCalled();
  });

  it("logs instead of throwing when creating payouts fails", async () => {
    const holds = { releaseDue: jest.fn().mockResolvedValue(0) };
    const payouts = { createDuePayouts: jest.fn().mockRejectedValue(new Error("db down")) };
    const job = new PayoutScheduleJob(fakePrisma().prisma as any, holds as any, payouts as any);
    const logged = jest.spyOn((job as any).logger, "error").mockImplementation(() => undefined);
    await expect(job.run()).resolves.toBeUndefined();
    expect(logged.mock.calls[0][0]).toContain("db down");
  });
});
