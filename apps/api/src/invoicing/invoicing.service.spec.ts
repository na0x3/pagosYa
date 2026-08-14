import { InvoicingService } from "./invoicing.service";
import { InvoicingProvider } from "./interfaces/invoicing-provider.interface";

function makeFakePrisma() {
  return {
    merchantInvoicingProfile: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
    },
    invoice: {
      create: jest.fn(),
    },
  };
}

function makeFakeProvider(): jest.Mocked<InvoicingProvider> {
  return {
    invoiceEmissionReady: true,
    ensureCuis: jest.fn(),
    requestCufd: jest.fn(),
    emitInvoice: jest.fn(),
  };
}

describe("InvoicingService.enqueueInvoice", () => {
  it("does not enqueue fiscal documents when the selected provider is only ready for SIAT code testing", async () => {
    const prisma = makeFakePrisma();
    const provider = makeFakeProvider();
    Object.defineProperty(provider, "invoiceEmissionReady", { value: false });
    const service = new InvoicingService(prisma as any, provider);

    await service.enqueueInvoice(prisma as any, "m_1", {
      paymentIntentId: "pi_1",
      amount: 5000,
      currency: "BOB",
    });

    expect(prisma.merchantInvoicingProfile.findUnique).not.toHaveBeenCalled();
    expect(prisma.invoice.create).not.toHaveBeenCalled();
  });

  it("skips silently when the merchant has no invoicing profile configured", async () => {
    const prisma = makeFakePrisma();
    prisma.merchantInvoicingProfile.findUnique.mockResolvedValue(null);
    const service = new InvoicingService(prisma as any, makeFakeProvider());

    // `tx` is the same fake prisma object — enqueueInvoice takes it directly, not via $transaction.
    await service.enqueueInvoice(prisma as any, "m_1", {
      paymentIntentId: "pi_1",
      amount: 5000,
      currency: "BOB",
    });

    expect(prisma.invoice.create).not.toHaveBeenCalled();
  });

  it("skips silently when a profile exists but has no CUIS yet", async () => {
    const prisma = makeFakePrisma();
    prisma.merchantInvoicingProfile.findUnique.mockResolvedValue({ cuis: null });
    const service = new InvoicingService(prisma as any, makeFakeProvider());

    await service.enqueueInvoice(prisma as any, "m_1", { paymentIntentId: "pi_1", amount: 5000, currency: "BOB" });

    expect(prisma.invoice.create).not.toHaveBeenCalled();
  });

  it("creates a PENDING invoice defaulting to SIN NOMBRE / 0 when no buyer info is given", async () => {
    const prisma = makeFakePrisma();
    prisma.merchantInvoicingProfile.findUnique.mockResolvedValue({ cuis: "CUIS-MOCK-1" });
    const service = new InvoicingService(prisma as any, makeFakeProvider());

    await service.enqueueInvoice(prisma as any, "m_1", { paymentIntentId: "pi_1", amount: 5000, currency: "BOB" });

    expect(prisma.invoice.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        merchantId: "m_1",
        paymentIntentId: "pi_1",
        amount: 5000,
        currency: "BOB",
        customerName: "SIN NOMBRE",
        customerDocument: "0",
      }),
    });
  });

  it("uses the provided buyer name/document when given", async () => {
    const prisma = makeFakePrisma();
    prisma.merchantInvoicingProfile.findUnique.mockResolvedValue({ cuis: "CUIS-MOCK-1" });
    const service = new InvoicingService(prisma as any, makeFakeProvider());

    await service.enqueueInvoice(prisma as any, "m_1", {
      paymentIntentId: "pi_1",
      amount: 5000,
      currency: "BOB",
      customerName: "Juan Perez",
      customerDocument: "1234567",
    });

    expect(prisma.invoice.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ customerName: "Juan Perez", customerDocument: "1234567" }),
    });
  });
});

describe("InvoicingService.upsertProfile", () => {
  it("reuses the active CUIS when the taxpayer/branch/point scope is unchanged", async () => {
    const prisma = makeFakePrisma();
    const provider = makeFakeProvider();
    const existing = {
      id: "profile_1",
      merchantId: "m_1",
      nit: "709354049",
      razonSocial: "Original",
      sucursal: 0,
      puntoVenta: 0,
      cuis: "CUIS-ACTIVE",
    };
    prisma.merchantInvoicingProfile.findUnique.mockResolvedValue(existing);
    const service = new InvoicingService(prisma as any, provider);

    await expect(service.upsertProfile("m_1", { nit: "709354049", razonSocial: "Original" })).resolves.toBe(existing);
    expect(provider.ensureCuis).not.toHaveBeenCalled();
    expect(prisma.merchantInvoicingProfile.upsert).not.toHaveBeenCalled();
  });
});

describe("InvoicingService.ensureFreshCufd", () => {
  it("reuses a non-expired CUFD without calling the provider", async () => {
    const prisma = makeFakePrisma();
    const provider = makeFakeProvider();
    const service = new InvoicingService(prisma as any, provider);

    const cufd = await service.ensureFreshCufd({
      id: "profile_1",
      nit: "123",
      cuis: "CUIS-1",
      sucursal: 0,
      puntoVenta: 0,
      cufd: "CUFD-CACHED",
      cufdExpiresAt: new Date(Date.now() + 60_000),
    });

    expect(cufd).toBe("CUFD-CACHED");
    expect(provider.requestCufd).not.toHaveBeenCalled();
  });

  it("requests a new CUFD and persists it when expired", async () => {
    const prisma = makeFakePrisma();
    const provider = makeFakeProvider();
    const expiresAt = new Date(Date.now() + 86_400_000);
    provider.requestCufd.mockResolvedValue({ cufd: "CUFD-FRESH", expiresAt });
    const service = new InvoicingService(prisma as any, provider);

    const cufd = await service.ensureFreshCufd({
      id: "profile_1",
      nit: "123",
      cuis: "CUIS-1",
      sucursal: 0,
      puntoVenta: 0,
      cufd: "CUFD-OLD",
      cufdExpiresAt: new Date(Date.now() - 1_000),
    });

    expect(cufd).toBe("CUFD-FRESH");
    expect(provider.requestCufd).toHaveBeenCalledWith({
      nit: "123",
      cuis: "CUIS-1",
      sucursal: 0,
      puntoVenta: 0,
    });
    expect(prisma.merchantInvoicingProfile.update).toHaveBeenCalledWith({
      where: { id: "profile_1" },
      data: { cufd: "CUFD-FRESH", cufdExpiresAt: expiresAt },
    });
  });

  it("throws if the profile has no CUIS", async () => {
    const prisma = makeFakePrisma();
    const service = new InvoicingService(prisma as any, makeFakeProvider());

    await expect(
      service.ensureFreshCufd({
        id: "profile_1",
        nit: "123",
        cuis: null,
        sucursal: 0,
        puntoVenta: 0,
        cufd: null,
        cufdExpiresAt: null,
      }),
    ).rejects.toThrow(/CUIS/);
  });
});
