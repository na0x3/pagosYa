import { BadRequestException } from "@nestjs/common";
import { LegalDocumentKind, TermsAcceptanceSource } from "@prisma/client";
import { MerchantsController } from "./merchants.controller";

function setup() {
  const merchants = { create: jest.fn().mockResolvedValue({ merchant: { id: "m_1" }, testKeys: {} }) };
  const legal = { resolveAcceptable: jest.fn() };
  const terms = { recordMerchantAcceptance: jest.fn().mockResolvedValue(undefined) };
  const users = { emailTaken: jest.fn().mockResolvedValue(false), createForNewAccount: jest.fn().mockResolvedValue({ id: "u_1", merchantId: "m_1", email: "a@b.bo" }) };
  const sessions = { startNewAccount: jest.fn().mockResolvedValue({ token: "dash_x", merchant: { id: "m_1" } }) };
  const controller = new MerchantsController(merchants as any, {} as any, {} as any, legal as any, terms as any, users as any, sessions as any);
  const req = { ip: "1.1.1.1", headers: { "user-agent": "UA" } };
  return { merchants, legal, terms, users, sessions, controller, req };
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

describe("MerchantsController.register (owner 2026-11-07: sign up and go straight into the dashboard)", () => {
  it("creates the business and its owner, and hands back their first session", async () => {
    const { controller, merchants, users, sessions, req } = setup();
    const result = await controller.register({ name: "Tienda", email: " A@B.bo ", password: "una-clave-segura" }, req as any);
    expect(merchants.create).toHaveBeenCalledWith({ name: "Tienda", email: "a@b.bo" });
    expect(users.createForNewAccount).toHaveBeenCalledWith("m_1", "a@b.bo", "una-clave-segura");
    expect(sessions.startNewAccount).toHaveBeenCalled();
    expect(result).toEqual({ token: "dash_x", merchant: { id: "m_1" }, welcome: true });
  });

  it("refuses an email already in use before creating anything", async () => {
    const { controller, merchants, users, req } = setup();
    users.emailTaken.mockResolvedValue(true);
    await expect(controller.register({ name: "Tienda", email: "a@b.bo", password: "una-clave-segura" }, req as any)).rejects.toThrow("Ya existe una cuenta");
    expect(merchants.create).not.toHaveBeenCalled();
  });
});
