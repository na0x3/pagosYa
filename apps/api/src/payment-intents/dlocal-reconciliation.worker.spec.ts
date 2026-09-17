import { DlocalReconciliationWorker } from "./dlocal-reconciliation.worker";

function setup(intents: unknown[]) {
  const prisma = {
    paymentIntent: { findMany: jest.fn().mockResolvedValue(intents) },
    supportCase: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: "case_1" }) },
  };
  const adapter = { getStatus: jest.fn() };
  const paymentIntents = { applyCallbackResult: jest.fn().mockResolvedValue({}) };
  return { worker: new DlocalReconciliationWorker(prisma as any, adapter as any, paymentIntents as any), prisma, adapter, paymentIntents };
}

describe("DlocalReconciliationWorker unresolvable intents", () => {
  const now = new Date("2026-09-17T12:00:00.000Z");
  const stuck = [
    { id: "pi_timeout", merchantId: "m_1", status: "REQUIRES_ACTION", transactions: [{ railReference: "order:pi_timeout" }] },
    { id: "pi_norow", merchantId: "m_2", status: "PROCESSING", transactions: [] },
    { id: "pi_resolvable", merchantId: "m_3", status: "REQUIRES_ACTION", transactions: [{ railReference: "D-7" }] },
  ];

  it("selects dlocal intents stuck for more than 6 hours without a dLocal payment id", async () => {
    const { worker, prisma } = setup([]);
    await worker.escalateUnresolvable(now);
    expect(prisma.paymentIntent.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        railId: "dlocal",
        status: { in: ["PROCESSING", "REQUIRES_ACTION"] },
        updatedAt: { lt: new Date("2026-09-17T06:00:00.000Z") },
        OR: [
          { transactions: { none: { type: "AUTHORIZATION" } } },
          { transactions: { some: { type: "AUTHORIZATION", railReference: { startsWith: "order:" } } } },
        ],
      }),
    }));
  });

  it("logs an error and opens one support case per unresolvable intent, only once", async () => {
    const { worker, prisma } = setup(stuck);
    const errorLog = jest.spyOn((worker as any).logger, "error").mockImplementation(() => undefined);

    await worker.escalateUnresolvable(now);
    expect(errorLog).toHaveBeenCalledTimes(2);
    expect(errorLog).toHaveBeenCalledWith(expect.stringContaining("pi_timeout"));
    expect(errorLog).toHaveBeenCalledWith(expect.stringContaining("pi_norow"));
    expect(prisma.supportCase.create).toHaveBeenCalledTimes(2);
    expect(prisma.supportCase.create).toHaveBeenCalledWith({ data: expect.objectContaining({ merchantId: "m_1", summary: expect.stringContaining("pi_timeout") }) });
    expect(prisma.supportCase.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ summary: { contains: "pi_timeout" } }) }));

    await worker.escalateUnresolvable(now);
    expect(errorLog).toHaveBeenCalledTimes(2);
    expect(prisma.supportCase.create).toHaveBeenCalledTimes(2);
    expect(prisma.paymentIntent.findMany.mock.calls[1][0].where.id).toEqual({ notIn: ["pi_timeout", "pi_norow"] });
  });

  it("does not open a duplicate case after a restart when one is still open", async () => {
    const { worker, prisma } = setup([stuck[0]]);
    jest.spyOn((worker as any).logger, "error").mockImplementation(() => undefined);
    prisma.supportCase.findFirst.mockResolvedValue({ id: "case_open" });
    await worker.escalateUnresolvable(now);
    expect(prisma.supportCase.create).not.toHaveBeenCalled();
  });

  it("retries a case it could not open on the next run", async () => {
    const { worker, prisma } = setup([stuck[0]]);
    jest.spyOn((worker as any).logger, "error").mockImplementation(() => undefined);
    prisma.supportCase.create.mockRejectedValueOnce(new Error("db down"));
    await worker.escalateUnresolvable(now);
    await worker.escalateUnresolvable(now);
    expect(prisma.supportCase.create).toHaveBeenCalledTimes(2);
  });
});

describe("DlocalReconciliationWorker", () => {
  const now = new Date("2026-09-17T12:00:00.000Z");

  it("queries stale dlocal intents with the right cutoffs (first tick, no cursor)", async () => {
    const { worker, prisma } = setup([]);
    await worker.tick(now);
    expect(prisma.paymentIntent.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        railId: "dlocal",
        OR: [
          { status: "PROCESSING", updatedAt: { lt: new Date("2026-09-17T11:45:00.000Z") } },
          { status: "REQUIRES_ACTION", updatedAt: { lt: new Date("2026-09-17T11:00:00.000Z") } },
        ],
      },
      take: 50,
    }));
  });

  it("applies final statuses, skips pending ones and order: references", async () => {
    const { worker, adapter, paymentIntents } = setup([
      { id: "pi_paid", updatedAt: new Date(), transactions: [{ railReference: "D-1" }] },
      { id: "pi_wait", updatedAt: new Date(), transactions: [{ railReference: "D-2" }] },
      { id: "pi_unknown", updatedAt: new Date(), transactions: [{ railReference: "order:pi_unknown" }] },
      { id: "pi_none", updatedAt: new Date(), transactions: [] },
    ]);
    adapter.getStatus.mockImplementation(async (ref: string) =>
      ref === "D-1" ? { status: "succeeded", railReference: "D-1", raw: {} } : { status: "pending", railReference: ref, raw: {} });

    await worker.tick(now);

    expect(adapter.getStatus).toHaveBeenCalledTimes(2);
    expect(paymentIntents.applyCallbackResult).toHaveBeenCalledTimes(1);
    expect(paymentIntents.applyCallbackResult).toHaveBeenCalledWith("pi_paid", expect.objectContaining({ status: "succeeded" }), { railId: "dlocal" });
  });

  it("keeps going when one intent fails", async () => {
    const { worker, adapter, paymentIntents } = setup([
      { id: "pi_a", updatedAt: new Date(), transactions: [{ railReference: "D-a" }] },
      { id: "pi_b", updatedAt: new Date(), transactions: [{ railReference: "D-b" }] },
    ]);
    adapter.getStatus.mockRejectedValueOnce(new Error("dLocal down")).mockResolvedValueOnce({ status: "failed", railReference: "D-b", raw: {} });
    await worker.tick(now);
    expect(paymentIntents.applyCallbackResult).toHaveBeenCalledWith("pi_b", expect.anything(), { railId: "dlocal" });
  });

  it("sets cursor when page is full (50 rows) and includes cursor in next tick", async () => {
    const { worker, prisma } = setup([]);
    const fullPage = Array.from({ length: 50 }, (_, i) => ({
      id: `pi_${i}`,
      updatedAt: new Date("2026-09-17T10:00:00.000Z"),
      transactions: [],
    }));
    fullPage[49].updatedAt = new Date("2026-09-17T10:30:00.000Z");
    fullPage[49].id = "pi_50_last";

    prisma.paymentIntent.findMany.mockResolvedValueOnce(fullPage);
    await worker.tick(now);
    expect(prisma.paymentIntent.findMany).toHaveBeenCalledTimes(1);
    const firstCall = prisma.paymentIntent.findMany.mock.calls[0][0];
    expect(firstCall.where).not.toHaveProperty("AND");

    // Second tick should include cursor
    prisma.paymentIntent.findMany.mockResolvedValueOnce([]);
    await worker.tick(now);
    expect(prisma.paymentIntent.findMany).toHaveBeenCalledTimes(2);
    const secondCall = prisma.paymentIntent.findMany.mock.calls[1][0];
    expect(secondCall.where.AND).toBeDefined();
    expect(secondCall.where.AND[1]).toEqual({
      OR: [
        { updatedAt: { gt: new Date("2026-09-17T10:30:00.000Z") } },
        { updatedAt: new Date("2026-09-17T10:30:00.000Z"), id: { gt: "pi_50_last" } },
      ],
    });
  });

  it("resets cursor when page has < 50 rows", async () => {
    const { worker, prisma } = setup([]);
    const fullPage = Array.from({ length: 50 }, (_, i) => ({
      id: `pi_${i}`,
      updatedAt: new Date("2026-09-17T10:00:00.000Z"),
      transactions: [],
    }));
    fullPage[49].updatedAt = new Date("2026-09-17T10:30:00.000Z");
    fullPage[49].id = "pi_50_last";

    prisma.paymentIntent.findMany.mockResolvedValueOnce(fullPage);
    await worker.tick(now);

    // Second tick with < 50 rows should reset cursor
    const smallPage = [{ id: "pi_new", updatedAt: new Date("2026-09-17T11:00:00.000Z"), transactions: [] }];
    prisma.paymentIntent.findMany.mockResolvedValueOnce(smallPage);
    await worker.tick(now);

    // Third tick should have no cursor again
    prisma.paymentIntent.findMany.mockResolvedValueOnce([]);
    await worker.tick(now);
    const thirdCall = prisma.paymentIntent.findMany.mock.calls[2][0];
    expect(thirdCall.where).not.toHaveProperty("AND");
    expect(thirdCall.where.OR).toBeDefined();
  });

  it("escalates to error log after 8 consecutive failures for same intent", async () => {
    const { worker, adapter } = setup([
      { id: "pi_fail", updatedAt: new Date(), transactions: [{ railReference: "D-fail" }] },
    ]);
    adapter.getStatus.mockRejectedValue(new Error("dLocal API down"));
    const loggerSpy = jest.spyOn((worker as any).logger, "error");
    const warnSpy = jest.spyOn((worker as any).logger, "warn");

    // First 7 failures should warn
    for (let i = 0; i < 7; i++) {
      await worker.tick(now);
      expect(warnSpy).toHaveBeenCalledTimes(i + 1);
      expect(loggerSpy).not.toHaveBeenCalled();
    }

    // 8th failure should error once
    await worker.tick(now);
    expect(loggerSpy).toHaveBeenCalledTimes(1);
    expect(loggerSpy).toHaveBeenCalledWith(expect.stringMatching(/failed 8 times in a row; needs manual review: dLocal API down/));
    expect(warnSpy).toHaveBeenCalledTimes(7);

    // Subsequent failures should not call error again
    await worker.tick(now);
    expect(loggerSpy).toHaveBeenCalledTimes(1);

    loggerSpy.mockRestore();
    warnSpy.mockRestore();
  });
});
