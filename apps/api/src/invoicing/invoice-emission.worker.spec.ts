import { InvoiceStatus } from "@prisma/client";
import { InvoiceEmissionWorker } from "./invoice-emission.worker";

function makeFakePrisma() {
  return {
    invoice: { findMany: jest.fn(), updateMany: jest.fn(), update: jest.fn() },
  };
}

function makeFakeInvoicingService() {
  return { ensureFreshCufd: jest.fn() };
}

function makeFakeProvider() {
  return { ensureCuis: jest.fn(), requestCufd: jest.fn(), emitInvoice: jest.fn() };
}

const profile = {
  id: "profile_1",
  nit: "123",
  cuis: "CUIS-1",
  sucursal: 0,
  puntoVenta: 0,
  cufd: "CUFD-1",
  cufdExpiresAt: new Date(Date.now() + 60_000),
};

const baseInvoice = {
  id: "inv_1",
  amount: 5000,
  currency: "BOB",
  customerName: "Juan",
  customerDocument: "123",
  status: InvoiceStatus.PENDING,
  attempts: 0,
  merchant: { invoicingProfile: profile },
};

describe("InvoiceEmissionWorker.emitDueInvoices", () => {
  it("skips an invoice when the optimistic claim loses the race", async () => {
    const prisma = makeFakePrisma();
    prisma.invoice.findMany.mockResolvedValue([baseInvoice]);
    prisma.invoice.updateMany.mockResolvedValue({ count: 0 });
    const provider = makeFakeProvider();

    const worker = new InvoiceEmissionWorker(prisma as any, makeFakeInvoicingService() as any, provider as any);
    await worker.emitDueInvoices();

    expect(provider.emitInvoice).not.toHaveBeenCalled();
  });

  it("marks a successful emission EMITTED with the returned CUF", async () => {
    const prisma = makeFakePrisma();
    prisma.invoice.findMany.mockResolvedValue([baseInvoice]);
    prisma.invoice.updateMany.mockResolvedValue({ count: 1 });
    const invoicing = makeFakeInvoicingService();
    invoicing.ensureFreshCufd.mockResolvedValue("CUFD-FRESH");
    const provider = makeFakeProvider();
    provider.emitInvoice.mockResolvedValue({ status: "emitted", cuf: "CUF-XYZ", raw: {} });

    const worker = new InvoiceEmissionWorker(prisma as any, invoicing as any, provider as any);
    await worker.emitDueInvoices();

    expect(prisma.invoice.update).toHaveBeenCalledWith({
      where: { id: "inv_1" },
      data: expect.objectContaining({
        status: InvoiceStatus.EMITTED,
        cuf: "CUF-XYZ",
        cufd: "CUFD-FRESH",
        nextRetryAt: null,
      }),
    });
  });

  it("schedules a retry when the provider reports failure", async () => {
    const prisma = makeFakePrisma();
    prisma.invoice.findMany.mockResolvedValue([{ ...baseInvoice, attempts: 1 }]);
    prisma.invoice.updateMany.mockResolvedValue({ count: 1 });
    const invoicing = makeFakeInvoicingService();
    invoicing.ensureFreshCufd.mockResolvedValue("CUFD-1");
    const provider = makeFakeProvider();
    provider.emitInvoice.mockResolvedValue({ status: "failed", failureReason: "sin_service_unavailable", raw: {} });

    const worker = new InvoiceEmissionWorker(prisma as any, invoicing as any, provider as any);
    await worker.emitDueInvoices();

    expect(prisma.invoice.update).toHaveBeenCalledWith({
      where: { id: "inv_1" },
      data: expect.objectContaining({ status: InvoiceStatus.FAILED, failureReason: "sin_service_unavailable" }),
    });
  });

  it("catches a thrown error from ensureFreshCufd and schedules a retry instead of rejecting", async () => {
    const prisma = makeFakePrisma();
    prisma.invoice.findMany.mockResolvedValue([baseInvoice]);
    prisma.invoice.updateMany.mockResolvedValue({ count: 1 });
    const invoicing = makeFakeInvoicingService();
    invoicing.ensureFreshCufd.mockRejectedValue(new Error("no CUIS"));
    const provider = makeFakeProvider();

    const worker = new InvoiceEmissionWorker(prisma as any, invoicing as any, provider as any);
    await expect(worker.emitDueInvoices()).resolves.toBeUndefined();

    expect(prisma.invoice.update).toHaveBeenCalledWith({
      where: { id: "inv_1" },
      data: expect.objectContaining({ status: InvoiceStatus.FAILED, failureReason: "no CUIS" }),
    });
  });

  it("retries without calling the provider when the merchant's invoicing profile has no CUIS", async () => {
    const prisma = makeFakePrisma();
    prisma.invoice.findMany.mockResolvedValue([
      { ...baseInvoice, merchant: { invoicingProfile: { ...profile, cuis: null } } },
    ]);
    prisma.invoice.updateMany.mockResolvedValue({ count: 1 });
    const provider = makeFakeProvider();

    const worker = new InvoiceEmissionWorker(prisma as any, makeFakeInvoicingService() as any, provider as any);
    await worker.emitDueInvoices();

    expect(provider.emitInvoice).not.toHaveBeenCalled();
    expect(prisma.invoice.update).toHaveBeenCalledWith({
      where: { id: "inv_1" },
      data: expect.objectContaining({ failureReason: "invoicing_profile_not_configured" }),
    });
  });

  it("stops scheduling retries once MAX_ATTEMPTS is reached", async () => {
    const prisma = makeFakePrisma();
    prisma.invoice.findMany.mockResolvedValue([{ ...baseInvoice, attempts: 7 }]);
    prisma.invoice.updateMany.mockResolvedValue({ count: 1 });
    const invoicing = makeFakeInvoicingService();
    invoicing.ensureFreshCufd.mockResolvedValue("CUFD-1");
    const provider = makeFakeProvider();
    provider.emitInvoice.mockResolvedValue({ status: "failed", failureReason: "x", raw: {} });

    const worker = new InvoiceEmissionWorker(prisma as any, invoicing as any, provider as any);
    await worker.emitDueInvoices();

    expect(prisma.invoice.update).toHaveBeenCalledWith({
      where: { id: "inv_1" },
      data: expect.objectContaining({ nextRetryAt: null }),
    });
  });
});
