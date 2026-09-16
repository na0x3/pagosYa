import { DlocalReconciliationWorker } from "./dlocal-reconciliation.worker";

function setup(intents: unknown[]) {
  const prisma = { paymentIntent: { findMany: jest.fn().mockResolvedValue(intents) } };
  const adapter = { getStatus: jest.fn() };
  const paymentIntents = { applyCallbackResult: jest.fn().mockResolvedValue({}) };
  return { worker: new DlocalReconciliationWorker(prisma as any, adapter as any, paymentIntents as any), prisma, adapter, paymentIntents };
}

describe("DlocalReconciliationWorker", () => {
  const now = new Date("2026-09-17T12:00:00.000Z");

  it("queries stale dlocal intents with the right cutoffs", async () => {
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
      { id: "pi_paid", transactions: [{ railReference: "D-1" }] },
      { id: "pi_wait", transactions: [{ railReference: "D-2" }] },
      { id: "pi_unknown", transactions: [{ railReference: "order:pi_unknown" }] },
      { id: "pi_none", transactions: [] },
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
      { id: "pi_a", transactions: [{ railReference: "D-a" }] },
      { id: "pi_b", transactions: [{ railReference: "D-b" }] },
    ]);
    adapter.getStatus.mockRejectedValueOnce(new Error("dLocal down")).mockResolvedValueOnce({ status: "failed", railReference: "D-b", raw: {} });
    await worker.tick(now);
    expect(paymentIntents.applyCallbackResult).toHaveBeenCalledWith("pi_b", expect.anything(), { railId: "dlocal" });
  });
});
