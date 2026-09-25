import { ProposalsController } from "./proposals.controller";
import { BusinessDocumentsPublicController } from "./business-documents-public.controller";

describe("proposal routes", () => {
  it("scopes every merchant route to the signed-in merchant and the store in the path", async () => {
    const proposals = { draft: jest.fn(), regenerateSection: jest.fn(), summary: jest.fn(), createCobro: jest.fn() };
    const controller = new ProposalsController(proposals as any);
    const merchant = { id: "m_1" };
    await controller.draft(merchant, "store_1", { brief: "Diseño de logo para una cafetería" });
    await controller.regenerate(merchant, "store_1", "doc_1", { block: { type: "paragraph", text: "x" } });
    await controller.summary(merchant, "store_1");
    await controller.cobro(merchant, "store_1", "doc_1", {});
    for (const method of Object.values(proposals)) expect(method.mock.calls[0].slice(0, 2)).toEqual(["m_1", "store_1"]);
    expect(proposals.regenerateSection.mock.calls[0][2]).toBe("doc_1");
    expect(proposals.createCobro.mock.calls[0][2]).toBe("doc_1");
  });

  it("hands the customer's Aceptar and Pedir cambios to the proposals service with who and from where", async () => {
    const proposals = { accept: jest.fn().mockResolvedValue({ status: "ACCEPTED" }), requestChanges: jest.fn().mockResolvedValue({ status: "CHANGES_REQUESTED" }) };
    const controller = new BusinessDocumentsPublicController({} as any, {} as any, proposals as any);
    const req = { ip: "190.0.0.1", headers: { "user-agent": "Mozilla/5.0" } };
    await expect(controller.accept("tok", { name: "Ana", email: "ana@example.com", version: 1 }, req)).resolves.toEqual({ status: "ACCEPTED" });
    expect(proposals.accept).toHaveBeenCalledWith("tok", { name: "Ana", email: "ana@example.com", version: 1 }, { ipAddress: "190.0.0.1", userAgent: "Mozilla/5.0" });
    await controller.changes("tok", { email: "ana@example.com", message: "Otro color" }, req);
    expect(proposals.requestChanges).toHaveBeenCalledWith("tok", { email: "ana@example.com", message: "Otro color" }, { ipAddress: "190.0.0.1", userAgent: "Mozilla/5.0" });
  });
});
