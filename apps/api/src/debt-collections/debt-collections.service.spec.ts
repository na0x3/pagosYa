import { BadRequestException, NotFoundException } from "@nestjs/common";
import { DebtCollectionLinkStatus, DebtRecordStatus, MerchantStatus, StoreStatus } from "@prisma/client";
import { chunkDebtCsvForAi, compactDebtCsvForAi, DebtCollectionsService, normalizeCustomerDocument } from "./debt-collections.service";

function makeService() {
  const publicLink = {
    id: "debt_link_1",
    slug: "agosto2026",
    name: "Mensualidades de agosto",
    currency: "BOB",
    notificationEmail: "cobranzas@gmail.com",
    status: DebtCollectionLinkStatus.ACTIVE,
    store: {
      id: "store_1",
      name: "Colegio Demo",
      merchantId: "merchant_1",
      status: StoreStatus.ACTIVE,
      contactEmail: "ayuda@colegio.bo",
      contactPhone: "+59170000000",
      merchant: { id: "merchant_1", email: "cuenta@gmail.com", status: MerchantStatus.ACTIVE },
    },
  };
  const publicStore = { ...publicLink.store, debtPortalSlug: publicLink.slug };
  const prisma = {
    store: {
      findFirst: jest.fn().mockResolvedValue(publicStore),
      findUnique: jest.fn().mockResolvedValue(publicStore),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    debtCollectionLink: {
      create: jest.fn().mockImplementation(({ data }) => ({ id: "debt_link_1", ...data, _count: { debts: data.debts.create.length } })),
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(),
      findUnique: jest.fn().mockResolvedValue(publicLink),
      update: jest.fn(),
    },
    debtRecord: {
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn(),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };
  const paymentIntents = { createInTransaction: jest.fn() };
  const config = { get: jest.fn() };
  return { service: new DebtCollectionsService(prisma as any, paymentIntents as any, config as any), prisma, publicLink, config, paymentIntents };
}

describe("DebtCollectionsService", () => {
  it("normalizes Bolivian carnet formatting consistently", () => {
    expect(normalizeCustomerDocument(" 7.845-123 LP ")).toBe("7845123");
  });

  it("removes unrelated CSV columns while preserving only supported identity, amount and contact fields", () => {
    const compacted = compactDebtCsvForAi([
      "Código interno;Estudiante;Curso;Saldo Bs;Identificación;Tutor;Concepto;Gmail;Celular;Observaciones",
      "A-19;María Quispe;4A;125,50;7.845-123 LP;Ana Quispe;Mensualidad;maria@gmail.com;71234567;No llamar",
    ].join("\n"));

    expect(compacted.removedColumnCount).toBe(5);
    expect(compacted.csv).toContain("customerDocument,customerName,amount,customerEmail,customerPhone");
    expect(compacted.csv).toContain("7.845-123 LP");
    expect(compacted.csv).not.toContain("Curso");
    expect(compacted.csv).not.toContain("Tutor");
    expect(compacted.csv).not.toContain("Observaciones");
    expect(compacted.csv).not.toContain("No llamar");
  });

  it("drops incomplete and excess CSV rows before sending data to the model", () => {
    const rows = ["nit,nombre,monto,notas", "sin-monto,Persona,,ignorar"];
    for (let index = 0; index < 1005; index += 1) rows.push(`${1000000 + index},Persona ${index},10,ignorar`);

    const compacted = compactDebtCsvForAi(rows.join("\n"));

    expect(compacted.csv.split("\n")).toHaveLength(1001);
    expect(compacted.ignoredRowCount).toBe(6);
    expect(compacted.csv).not.toContain("notas");
    expect(compacted.csv).not.toContain("ignorar");
  });

  it("splits a 600-row recognized CSV into six complete model batches", () => {
    const rows = ["nit,nombre,monto"];
    for (let index = 0; index < 600; index += 1) rows.push(`${10000000 + index},Persona ${index},10`);

    const compacted = compactDebtCsvForAi(rows.join("\n"));
    const chunks = chunkDebtCsvForAi(compacted.csv, compacted.hasRecognizedHeaders);

    expect(chunks).toHaveLength(6);
    expect(chunks.every((chunk) => chunk.split("\n").length === 101)).toBe(true);
    expect(chunks[5]).toContain("10000599");
  });

  it("creates a company link with normalized, server-owned debt amounts", async () => {
    const { service, prisma } = makeService();

    await service.create("merchant_1", "store_1", {
      name: " Mensualidades ",
      notificationEmail: "COBRANZAS@GMAIL.COM",
      debts: [{ customerDocument: "7.845-123", customerName: "María Quispe", amount: 12550 }],
    });

    expect(prisma.debtCollectionLink.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        storeId: "store_1",
        name: "Mensualidades",
        notificationEmail: "cobranzas@gmail.com",
        debts: { create: [expect.objectContaining({ customerDocument: "7845123", normalizedDocument: "7845123", amount: 12550 })] },
      }),
    }));
  });

  it("preserves repeated carnet values because one person may have several debts", async () => {
    const { service, prisma } = makeService();

    await service.create("merchant_1", "store_1", {
      name: "Cuotas",
      debts: [
        { customerDocument: "7845123", customerName: "María", amount: 1000 },
        { customerDocument: "7.845-123", customerName: "María", amount: 2000 },
      ],
    });

    const createdRows = prisma.debtCollectionLink.create.mock.calls[0][0].data.debts.create;
    expect(createdRows).toHaveLength(2);
    expect(createdRows.map((row: { normalizedDocument: string }) => row.normalizedDocument)).toEqual(["7845123", "7845123"]);
  });

  it("adds more debts to an existing active collection", async () => {
    const { service, prisma } = makeService();
    prisma.debtCollectionLink.findFirst.mockResolvedValue({ id: "debt_link_1", currency: "BOB" });
    prisma.debtRecord.createMany.mockResolvedValue({ count: 2 });

    await expect(service.addDebts("merchant_1", "store_1", "debt_link_1", [
      { customerDocument: "7.845-123", customerName: "María Quispe", amount: 12550 },
      { customerDocument: "7845123", customerName: "María Quispe", amount: 8000 },
    ])).resolves.toEqual({ added: 2 });

    expect(prisma.debtRecord.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ debtCollectionLinkId: "debt_link_1", normalizedDocument: "7845123", amount: 12550, currency: "BOB" }),
        expect.objectContaining({ debtCollectionLinkId: "debt_link_1", normalizedDocument: "7845123", amount: 8000, currency: "BOB" }),
      ],
    });
  });

  it("lists the people and payment state needed by the merchant status view", async () => {
    const { service, prisma } = makeService();

    await service.list("merchant_1", "store_1");

    expect(prisma.debtCollectionLink.findMany).toHaveBeenCalledWith(expect.objectContaining({
      include: expect.objectContaining({
        debts: expect.objectContaining({
          select: expect.objectContaining({
            customerName: true,
            customerDocument: true,
            status: true,
            paidAt: true,
          }),
        }),
      }),
    }));
  });

  it("adapts an arbitrary debt CSV through OpenAI structured output", async () => {
    const { service, config } = makeService();
    config.get.mockImplementation((key: string) => ({
      "app.openAi.apiKey": "server-key",
      "app.openAi.inventoryModel": "gpt-5.6-luna",
    } as Record<string, string>)[key]);
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({
        output: [{ content: [{ type: "output_text", text: JSON.stringify({
          warnings: [],
          debts: [{
            customerDocument: "7.845-123 LP",
            customerName: "María Quispe",
            amount: 12550,
            customerEmail: null,
            customerPhone: "71234567",
          }],
        }) }] }],
      }),
    }) as unknown as typeof fetch;

    try {
      const result = await service.normalizeCsv("merchant_1", "store_1", "alumno,saldo,ci,curso,observaciones\nMaría,125.50,7845123,4A,ignorar");
      expect(result.debts).toEqual([expect.objectContaining({ customerName: "María Quispe", customerDocument: "7845123", customerPhone: "71234567", amount: 12550 })]);
      expect(result.ignoredColumnCount).toBe(2);
      expect(global.fetch).toHaveBeenCalledWith("https://api.openai.com/v1/responses", expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer server-key" }),
      }));
      const request = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body as string);
      const developerInput = request.input[0].content[0].text as string;
      const userInput = request.input[1].content[0].text as string;
      expect(developerInput).toContain("EXCLUSIVAMENTE dígitos");
      expect(developerInput).toContain("customerPhone");
      expect(userInput).toContain("2 columnas irrelevantes ya descartadas");
      expect(userInput).not.toContain("observaciones");
      expect(userInput).not.toContain("ignorar");
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("merges every AI batch instead of silently truncating a 600-row CSV", async () => {
    const { service, config } = makeService();
    config.get.mockImplementation((key: string) => ({
      "app.openAi.apiKey": "server-key",
      "app.openAi.inventoryModel": "gpt-5.6-luna",
    } as Record<string, string>)[key]);
    const originalFetch = global.fetch;
    let batchIndex = 0;
    global.fetch = jest.fn().mockImplementation(async () => {
      const offset = batchIndex * 100;
      batchIndex += 1;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          output: [{ content: [{ type: "output_text", text: JSON.stringify({
            warnings: ["Se procesaron las primeras 100 filas válidas del CSV mostrado. Las filas restantes no se incluyen por limitación de salida."],
            debts: Array.from({ length: 100 }, (_, index) => ({
              customerDocument: String(10000000 + offset + index),
              customerName: `Persona ${offset + index}`,
              amount: 1000,
              customerEmail: null,
              customerPhone: null,
            })),
          }) }] }],
        }),
      } as unknown as Response;
    });

    const rows = ["nit,nombre,monto"];
    for (let index = 0; index < 600; index += 1) rows.push(`${10000000 + index},Persona ${index},10`);

    try {
      const result = await service.normalizeCsv("merchant_1", "store_1", rows.join("\n"));
      expect(global.fetch).toHaveBeenCalledTimes(6);
      expect(result.debts).toHaveLength(600);
      expect(result.debts[599]).toEqual(expect.objectContaining({ customerDocument: "10000599", customerName: "Persona 599" }));
      expect(result.warnings).toEqual([]);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("explains when debt CSV adaptation has no server-side OpenAI key", async () => {
    const { service } = makeService();
    await expect(service.normalizeCsv("merchant_1", "store_1", "nombre,monto,ci\nMaría,125,7845123"))
      .rejects.toThrow("OPENAI_API_KEY");
  });

  it("exports the current payer status as a real PDF", async () => {
    const { service, prisma } = makeService();
    prisma.debtCollectionLink.findFirst.mockResolvedValue({
      id: "debt_link_1",
      slug: "agosto2026",
      name: "Mensualidades de agosto",
      currency: "BOB",
      createdAt: new Date("2026-08-01T12:00:00Z"),
      store: { name: "Colegio Demo" },
      debts: [
        { customerName: "María Quispe", customerDocument: "7845123", reference: "AGO-001", amount: 12550, status: "PAID", paidAt: new Date("2026-08-15T12:00:00Z") },
        { customerName: "Juan Pérez", customerDocument: "6192044", reference: "AGO-002", amount: 8000, status: "PENDING", paidAt: null },
      ],
    });

    const result = await service.exportStatusPdf("merchant_1", "store_1", "debt_link_1");

    expect(result.filename).toBe("estado-pagos-agosto2026.pdf");
    expect(result.buffer.subarray(0, 4).toString()).toBe("%PDF");
    expect(result.buffer.length).toBeGreaterThan(1000);
  });

  it("returns a masked customer label and never exposes the full name on lookup", async () => {
    const { service, prisma } = makeService();
    prisma.debtRecord.findMany.mockResolvedValue([
      {
        id: "debt_1",
        status: DebtRecordStatus.PENDING,
        customerName: "María Elena Quispe",
        amount: 12550,
        currency: "BOB",
        description: "Mensualidad",
        reference: "AGO-1",
        debtCollectionLink: { name: "Agosto" },
      },
      {
        id: "debt_2",
        status: DebtRecordStatus.PENDING,
        customerName: "María Elena Quispe",
        amount: 8000,
        currency: "BOB",
        description: "Material",
        reference: "MAT-1",
        debtCollectionLink: { name: "Materiales" },
      },
    ]);

    await expect(service.lookup("agosto2026", "7845123")).resolves.toEqual(expect.objectContaining({
      status: "pending",
      customerLabel: "María E. Q.",
      pendingTotal: 20550,
      debts: [
        expect.objectContaining({ id: "debt_1", collectionName: "Agosto", amount: 12550 }),
        expect.objectContaining({ id: "debt_2", collectionName: "Materiales", amount: 8000 }),
      ],
    }));
  });

  it("creates one payment intent for exactly the selected pending debts", async () => {
    const { service, prisma, paymentIntents } = makeService();
    prisma.debtRecord.findMany.mockResolvedValueOnce([{ id: "debt_1" }, { id: "debt_2" }]);
    const selectedDebts = [
      {
        id: "debt_1",
        customerDocument: "7845123",
        normalizedDocument: "7845123",
        customerName: "María Quispe",
        customerEmail: "maria@gmail.com",
        customerPhone: "71234567",
        description: "Mensualidad",
        reference: "AGO-1",
        amount: 12550,
        currency: "BOB",
        status: DebtRecordStatus.PENDING,
        paymentIntentId: null,
        paymentIntent: null,
        debtCollectionLink: { name: "Agosto", notificationEmail: "agosto@colegio.bo" },
      },
      {
        id: "debt_2",
        customerDocument: "7845123",
        normalizedDocument: "7845123",
        customerName: "María Quispe",
        customerEmail: "maria@gmail.com",
        customerPhone: "71234567",
        description: "Material",
        reference: "MAT-1",
        amount: 8000,
        currency: "BOB",
        status: DebtRecordStatus.PENDING,
        paymentIntentId: null,
        paymentIntent: null,
        debtCollectionLink: { name: "Materiales", notificationEmail: "materiales@colegio.bo" },
      },
    ];
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: "debt_1" }, { id: "debt_2" }]),
      debtRecord: {
        findMany: jest.fn().mockResolvedValue(selectedDebts),
        updateMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
    };
    (prisma as any).$transaction = jest.fn().mockImplementation(async (callback: (transaction: typeof tx) => unknown) => callback(tx));
    paymentIntents.createInTransaction.mockResolvedValue({
      id: "pi_debts",
      clientSecret: "pi_debts_secret",
      description: "Pago de 2 deudas",
    });

    await expect(service.checkout("agosto2026", "7845123", ["debt_1", "debt_2", "debt_2"])).resolves.toEqual(expect.objectContaining({
      clientSecret: "pi_debts_secret",
      description: "Pago de 2 deudas",
    }));
    expect(paymentIntents.createInTransaction).toHaveBeenCalledWith(tx, "merchant_1", true, expect.objectContaining({
      amount: 20550,
      metadata: expect.objectContaining({
        debt: expect.objectContaining({
          debtRecordIds: ["debt_1", "debt_2"],
          items: expect.arrayContaining([expect.objectContaining({ id: "debt_1" }), expect.objectContaining({ id: "debt_2" })]),
        }),
      }),
    }));
    expect(tx.debtRecord.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: { in: ["debt_1", "debt_2"] } },
      data: { paymentIntentId: "pi_debts" },
    }));
  });

  it("does not reveal whether a carnet exists when the public link is inactive", async () => {
    const { service, prisma, publicLink } = makeService();
    prisma.store.findUnique.mockResolvedValue(null);
    prisma.debtCollectionLink.findUnique.mockResolvedValue({ ...publicLink, status: DebtCollectionLinkStatus.ARCHIVED });

    await expect(service.lookup("agosto2026", "7845123")).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.debtRecord.findMany).not.toHaveBeenCalled();
  });
});
