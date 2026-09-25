import { StreamableFile } from "@nestjs/common";
import { BusinessDocumentsController } from "./business-documents.controller";
import { BusinessDocumentsPublicController } from "./business-documents-public.controller";

describe("business document controllers", () => {
  it("scopes every merchant route to the signed-in merchant and the store in the path", async () => {
    const documents = {
      list: jest.fn(), create: jest.fn(), get: jest.fn(), update: jest.fn(), remove: jest.fn(), send: jest.fn(), void: jest.fn(),
    };
    const controller = new BusinessDocumentsController(documents as any);
    const merchant = { id: "m_1" };
    await controller.list(merchant, "store_1", { kind: "INVOICE" });
    await controller.create(merchant, "store_1", { kind: "INVOICE", title: "t" });
    await controller.get(merchant, "store_1", "doc_1");
    await controller.update(merchant, "store_1", "doc_1", { title: "t" });
    await controller.remove(merchant, "store_1", "doc_1");
    await controller.send(merchant, "store_1", "doc_1", { email: false });
    await controller.void(merchant, "store_1", "doc_1", { reason: "r" });
    for (const method of Object.values(documents)) expect(method.mock.calls[0].slice(0, 2)).toEqual(["m_1", "store_1"]);
  });

  it("passes the viewer's IP and user agent to the public view", async () => {
    const documents = { publicView: jest.fn().mockResolvedValue({}), publicPdf: jest.fn() };
    const controller = new BusinessDocumentsPublicController(documents as any, {} as any, {} as any);
    await controller.view("tok", { ip: "190.0.0.1", headers: { "user-agent": "Mozilla/5.0" } });
    expect(documents.publicView).toHaveBeenCalledWith("tok", { ipAddress: "190.0.0.1", userAgent: "Mozilla/5.0" }, undefined);
  });

  it("hands the merchant's preview token to the public view", async () => {
    const documents = { publicView: jest.fn().mockResolvedValue({}) };
    const controller = new BusinessDocumentsPublicController(documents as any, {} as any, {} as any);
    await controller.view("tok", { ip: "190.0.0.1", headers: {} }, "prev");
    expect(documents.publicView).toHaveBeenCalledWith("tok", expect.any(Object), "prev");
  });

  it("hands the customer's Pagar to the cobro checkout", async () => {
    const cobros = { pay: jest.fn().mockResolvedValue({ checkoutUrl: "https://pay.example/#client_secret=x" }) };
    const controller = new BusinessDocumentsPublicController({} as any, cobros as any, {} as any);
    await expect(controller.pay("tok")).resolves.toEqual({ checkoutUrl: "https://pay.example/#client_secret=x" });
    expect(cobros.pay).toHaveBeenCalledWith("tok");
  });

  it("serves the public PDF inline with its number as the file name", async () => {
    const documents = { publicPdf: jest.fn().mockResolvedValue({ buffer: Buffer.from("%PDF-1.3"), filename: "COB-0001.pdf" }) };
    const file = await new BusinessDocumentsPublicController(documents as any, {} as any, {} as any).pdf("tok");
    expect(file).toBeInstanceOf(StreamableFile);
    expect(file.getHeaders()).toEqual(expect.objectContaining({ type: "application/pdf", disposition: 'inline; filename="COB-0001.pdf"' }));
  });
});
