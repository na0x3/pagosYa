import { ContractsController } from "./contracts.controller";
import { BusinessDocumentsPublicController } from "./business-documents-public.controller";

describe("contract routes", () => {
  it("scopes every merchant route to the signed-in merchant and the store, and signs as the signed-in user", async () => {
    const contracts = { draft: jest.fn(), regenerateClause: jest.fn(), summary: jest.fn(), merchantSign: jest.fn() };
    const controller = new ContractsController(contracts as any);
    const merchant = { id: "m_1" };
    const req = { ip: "10.0.0.1", headers: { "user-agent": "Mozilla/5.0 Mac", authorization: "Bearer dash_secret" }, merchantUser: { id: "mu_1", email: "ana@andino.bo" } };
    await controller.draft(merchant, "store_1", { contractType: "servicios", objeto: "Diseño de logo" });
    await controller.regenerate(merchant, "store_1", "doc_1", { index: 1 });
    await controller.summary(merchant, "store_1");
    await controller.sign(merchant, "store_1", "doc_1", { version: 1, name: "Ana Quispe", method: "TYPED" }, req);
    for (const method of Object.values(contracts)) expect(method.mock.calls[0].slice(0, 2)).toEqual(["m_1", "store_1"]);
    const [, , id, dto, actor, context] = contracts.merchantSign.mock.calls[0];
    expect(id).toBe("doc_1");
    expect(dto).toEqual({ version: 1, name: "Ana Quispe", method: "TYPED" });
    expect(actor).toEqual({ userId: "mu_1", email: "ana@andino.bo", sessionRef: expect.stringMatching(/^[0-9a-f]{16}$/) });
    expect(JSON.stringify(actor)).not.toContain("dash_secret");
    expect(context).toEqual({ ipAddress: "10.0.0.1", userAgent: "Mozilla/5.0 Mac" });
  });

  it("hands the customer's code, verification and signature to the contracts service with where they came from", async () => {
    const contracts = { requestCode: jest.fn().mockResolvedValue({ sentTo: "a***@x.bo" }), verifyCode: jest.fn().mockResolvedValue({ verified: true }), sign: jest.fn().mockResolvedValue({ status: "SIGNED" }) };
    const controller = new BusinessDocumentsPublicController({} as any, {} as any, {} as any, contracts as any);
    const req = { ip: "181.115.1.2", headers: { "user-agent": "iPhone" } };
    const context = { ipAddress: "181.115.1.2", userAgent: "iPhone" };
    await controller.signCode("tok", { version: 1 }, req);
    await controller.verifyCode("tok", { version: 1, code: "123456" }, req);
    await expect(controller.sign("tok", { version: 1, name: "Luis Mamani", method: "TYPED", readConfirmed: true }, req)).resolves.toEqual({ status: "SIGNED" });
    expect(contracts.requestCode).toHaveBeenCalledWith("tok", { version: 1 }, context);
    expect(contracts.verifyCode).toHaveBeenCalledWith("tok", { version: 1, code: "123456" }, context);
    expect(contracts.sign).toHaveBeenCalledWith("tok", { version: 1, name: "Luis Mamani", method: "TYPED", readConfirmed: true }, context);
  });
});
