import { DeliveryFailuresService } from "./delivery-failures.service";

function makeFakePrisma() {
  return {
    payout: { findMany: jest.fn() },
    invoice: { findMany: jest.fn() },
    webhookEvent: { findMany: jest.fn() },
  };
}

describe("DeliveryFailuresService.summary", () => {
  it("buckets failures into still-retrying vs. exhausted based on nextRetryAt", async () => {
    const prisma = makeFakePrisma();
    prisma.payout.findMany.mockResolvedValue([
      { id: "payout_retrying", nextRetryAt: new Date(Date.now() + 60_000) },
      { id: "payout_exhausted", nextRetryAt: null },
    ]);
    prisma.invoice.findMany.mockResolvedValue([{ id: "invoice_exhausted", nextRetryAt: null }]);
    prisma.webhookEvent.findMany.mockResolvedValue([{ id: "webhook_retrying", nextRetryAt: new Date(Date.now() + 60_000) }]);

    const service = new DeliveryFailuresService(prisma as any);
    const result = await service.summary();

    expect(result.payouts.retrying.map((p) => p.id)).toEqual(["payout_retrying"]);
    expect(result.payouts.exhausted.map((p) => p.id)).toEqual(["payout_exhausted"]);
    expect(result.invoices.exhausted.map((i) => i.id)).toEqual(["invoice_exhausted"]);
    expect(result.invoices.retrying).toEqual([]);
    expect(result.webhookEvents.retrying.map((w) => w.id)).toEqual(["webhook_retrying"]);
    expect(result.webhookEvents.exhausted).toEqual([]);
  });

  it("only queries FAILED-status rows, one query per delivery type", async () => {
    const prisma = makeFakePrisma();
    prisma.payout.findMany.mockResolvedValue([]);
    prisma.invoice.findMany.mockResolvedValue([]);
    prisma.webhookEvent.findMany.mockResolvedValue([]);

    const service = new DeliveryFailuresService(prisma as any);
    await service.summary();

    expect(prisma.payout.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { status: "FAILED" } }));
    expect(prisma.invoice.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { status: "FAILED" } }));
    expect(prisma.webhookEvent.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { status: "FAILED" } }));
  });
});
