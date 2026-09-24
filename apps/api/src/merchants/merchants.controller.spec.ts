import { BadRequestException } from "@nestjs/common";
import { LegalDocumentKind, TermsAcceptanceSource } from "@prisma/client";
import { MerchantsController } from "./merchants.controller";

function setup() {
  const merchants = { create: jest.fn().mockResolvedValue({ merchant: { id: "m_1" }, testKeys: {} }) };
  const legal = { resolveAcceptable: jest.fn() };
  const terms = { recordMerchantAcceptance: jest.fn().mockResolvedValue(undefined) };
  const controller = new MerchantsController(merchants as any, {} as any, {} as any, legal as any, terms as any);
  const req = { ip: "1.1.1.1", headers: { "user-agent": "UA" } };
  return { merchants, legal, terms, controller, req };
}

describe("MerchantsController.create", () => {
  it("records a WEB_SIGNUP acceptance when the signer sent the version in force", async () => {
    const { controller, legal, terms, req } = setup();
    legal.resolveAcceptable.mockResolvedValue({ id: "d1" });

    await controller.create({ name: "Tienda", email: "a@b.bo", termsVersion: "v1" }, req);

    expect(legal.resolveAcceptable).toHaveBeenCalledWith(LegalDocumentKind.MERCHANT_TERMS, "v1");
    expect(terms.recordMerchantAcceptance).toHaveBeenCalledWith({
      merchantId: "m_1",
      document: { id: "d1" },
      source: TermsAcceptanceSource.WEB_SIGNUP,
      context: { ipAddress: "1.1.1.1", userAgent: "UA" },
    });
  });

  it("creates no merchant when the version is invalid or stale", async () => {
    const { controller, legal, merchants, req } = setup();
    legal.resolveAcceptable.mockRejectedValue(new BadRequestException("stale"));

    await expect(controller.create({ name: "Tienda", email: "a@b.bo", termsVersion: "v0" }, req)).rejects.toThrow(BadRequestException);
    expect(merchants.create).not.toHaveBeenCalled();
  });

  it("keeps working for API clients that send no version", async () => {
    const { controller, merchants, terms, legal, req } = setup();

    await controller.create({ name: "Tienda", email: "a@b.bo" }, req);

    expect(merchants.create).toHaveBeenCalled();
    expect(legal.resolveAcceptable).not.toHaveBeenCalled();
    expect(terms.recordMerchantAcceptance).not.toHaveBeenCalled();
  });
});
