import { UnauthorizedException } from "@nestjs/common";
import * as argon2 from "argon2";
import { MerchantSessionService } from "./merchant-session.service";

function makeFakePrisma() {
  return {
    merchantUser: { findUnique: jest.fn() },
    merchantSession: { create: jest.fn(), findMany: jest.fn(), update: jest.fn() },
  };
}

describe("MerchantSessionService.login", () => {
  it("issues a dash_ token for a correct password on a verified account", async () => {
    const prisma = makeFakePrisma();
    const hashedPassword = await argon2.hash("correct-password");
    prisma.merchantUser.findUnique.mockResolvedValue({
      id: "user_1",
      merchantId: "m_1",
      email: "owner@tienda.bo",
      hashedPassword,
      emailVerifiedAt: new Date(),
    });
    prisma.merchantSession.create.mockResolvedValue({});

    const service = new MerchantSessionService(prisma as any);
    const result = await service.login("owner@tienda.bo", "correct-password");

    expect(result.token).toMatch(/^dash_/);
    expect(result.merchant).toEqual({ id: "m_1" });
    expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("rejects login for a correct password on an unverified account", async () => {
    const prisma = makeFakePrisma();
    const hashedPassword = await argon2.hash("correct-password");
    prisma.merchantUser.findUnique.mockResolvedValue({
      id: "user_1",
      merchantId: "m_1",
      email: "owner@tienda.bo",
      hashedPassword,
      emailVerifiedAt: null,
    });

    const service = new MerchantSessionService(prisma as any);
    await expect(service.login("owner@tienda.bo", "correct-password")).rejects.toThrow(UnauthorizedException);
    expect(prisma.merchantSession.create).not.toHaveBeenCalled();
  });

  it("rejects a wrong password", async () => {
    const prisma = makeFakePrisma();
    const hashedPassword = await argon2.hash("correct-password");
    prisma.merchantUser.findUnique.mockResolvedValue({
      id: "user_1",
      merchantId: "m_1",
      email: "owner@tienda.bo",
      hashedPassword,
      emailVerifiedAt: new Date(),
    });

    const service = new MerchantSessionService(prisma as any);
    await expect(service.login("owner@tienda.bo", "wrong-password")).rejects.toThrow(UnauthorizedException);
    expect(prisma.merchantSession.create).not.toHaveBeenCalled();
  });

  it("rejects an unknown email without leaking whether the account exists", async () => {
    const prisma = makeFakePrisma();
    prisma.merchantUser.findUnique.mockResolvedValue(null);

    const service = new MerchantSessionService(prisma as any);
    await expect(service.login("nobody@tienda.bo", "whatever")).rejects.toThrow(UnauthorizedException);
  });
});

describe("MerchantSessionService.verify", () => {
  it("resolves a valid, unexpired session back to its merchant/user", async () => {
    const prisma = makeFakePrisma();
    const service = new MerchantSessionService(prisma as any);

    // Drive a real login first so the token/hash pairing is genuine, not hand-rolled.
    const hashedPassword = await argon2.hash("correct-password");
    prisma.merchantUser.findUnique.mockResolvedValue({
      id: "user_1",
      merchantId: "m_1",
      email: "owner@tienda.bo",
      hashedPassword,
      emailVerifiedAt: new Date(),
    });
    let storedHashedToken = "";
    prisma.merchantSession.create.mockImplementation(({ data }: any) => {
      storedHashedToken = data.hashedToken;
      return Promise.resolve({});
    });
    const { token } = await service.login("owner@tienda.bo", "correct-password");

    prisma.merchantSession.findMany.mockResolvedValue([
      {
        id: "sess_1",
        merchantId: "m_1",
        merchantUserId: "user_1",
        hashedToken: storedHashedToken,
        merchantUser: { email: "owner@tienda.bo" },
      },
    ]);

    await expect(service.verify(token)).resolves.toEqual({
      merchantId: "m_1",
      merchantUserId: "user_1",
      email: "owner@tienda.bo",
    });
  });

  it("rejects a token without the dash_ prefix without querying the database", async () => {
    const prisma = makeFakePrisma();
    const service = new MerchantSessionService(prisma as any);

    await expect(service.verify("sk_test_something")).resolves.toBeNull();
    expect(prisma.merchantSession.findMany).not.toHaveBeenCalled();
  });

  it("rejects a token that matches no active session (e.g. expired/revoked, already excluded by the query)", async () => {
    const prisma = makeFakePrisma();
    prisma.merchantSession.findMany.mockResolvedValue([]);

    const service = new MerchantSessionService(prisma as any);
    await expect(service.verify("dash_nonexistent")).resolves.toBeNull();
  });
});

describe("MerchantSessionService.revoke", () => {
  it("marks the matching session revoked", async () => {
    const prisma = makeFakePrisma();
    const hashedToken = await argon2.hash("dash_abc123");
    prisma.merchantSession.findMany.mockResolvedValue([{ id: "sess_1", hashedToken }]);

    const service = new MerchantSessionService(prisma as any);
    await service.revoke("dash_abc123");

    expect(prisma.merchantSession.update).toHaveBeenCalledWith({
      where: { id: "sess_1" },
      data: { revokedAt: expect.any(Date) },
    });
  });
});
