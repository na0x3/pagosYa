import { MerchantUserService } from "./merchant-user.service";
import { EmailProvider } from "./interfaces/email-provider.interface";

function makeFakePrisma() {
  return {
    merchantUser: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    emailVerificationToken: {
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
      findMany: jest.fn(),
    },
    passwordResetToken: {
      create: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
      findMany: jest.fn(),
    },
    merchantSession: {
      updateMany: jest.fn(),
    },
  };
}

function makeFakeEmailProvider(): jest.Mocked<EmailProvider> {
  return { send: jest.fn().mockResolvedValue(undefined) };
}

function makeFakeConfig() {
  return { get: jest.fn().mockReturnValue("http://localhost:3001") } as any;
}

const HOUR_MS = 60 * 60 * 1000;

describe("MerchantUserService.signup", () => {
  it("creates an unverified user and emails a confirmation token for a brand-new email", async () => {
    const prisma = makeFakePrisma();
    prisma.merchantUser.findUnique.mockResolvedValue(null);
    prisma.merchantUser.create.mockResolvedValue({ id: "user_1", email: "owner@tienda.bo" });
    const email = makeFakeEmailProvider();

    const service = new MerchantUserService(prisma as any, email, makeFakeConfig());
    const result = await service.signup("m_1", "owner@tienda.bo", "a-strong-password");

    expect(prisma.merchantUser.create).toHaveBeenCalled();
    expect(prisma.emailVerificationToken.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ merchantUserId: "user_1" }),
    });
    expect(email.send).toHaveBeenCalledWith(expect.objectContaining({ to: "owner@tienda.bo" }));
    expect(result).toEqual({ message: "If that email can be used, check your inbox for a confirmation link." });
  });

  it("does not create/update anything or send email when the address is already verified", async () => {
    const prisma = makeFakePrisma();
    prisma.merchantUser.findUnique.mockResolvedValue({
      id: "user_1",
      emailVerifiedAt: new Date(),
      createdAt: new Date(),
    });
    const email = makeFakeEmailProvider();

    const service = new MerchantUserService(prisma as any, email, makeFakeConfig());
    const result = await service.signup("attacker_merchant", "owner@tienda.bo", "whatever");

    expect(prisma.merchantUser.create).not.toHaveBeenCalled();
    expect(prisma.merchantUser.update).not.toHaveBeenCalled();
    expect(email.send).not.toHaveBeenCalled();
    // Same response as the success path — no oracle for the caller to read.
    expect(result).toEqual({ message: "If that email can be used, check your inbox for a confirmation link." });
  });

  it("does not supersede a still-fresh unverified signup attempt", async () => {
    const prisma = makeFakePrisma();
    prisma.merchantUser.findUnique.mockResolvedValue({
      id: "user_1",
      emailVerifiedAt: null,
      createdAt: new Date(Date.now() - 1 * HOUR_MS), // well within the 24h window
    });
    const email = makeFakeEmailProvider();

    const service = new MerchantUserService(prisma as any, email, makeFakeConfig());
    await service.signup("attacker_merchant", "victim@tienda.bo", "whatever");

    expect(prisma.merchantUser.update).not.toHaveBeenCalled();
    expect(email.send).not.toHaveBeenCalled();
  });

  it("supersedes a stale (expired) unverified attempt, so the real owner can reclaim the email", async () => {
    const prisma = makeFakePrisma();
    prisma.merchantUser.findUnique.mockResolvedValue({
      id: "user_1",
      emailVerifiedAt: null,
      createdAt: new Date(Date.now() - 25 * HOUR_MS), // past the 24h window
    });
    prisma.merchantUser.update.mockResolvedValue({ id: "user_1", email: "victim@tienda.bo" });
    const email = makeFakeEmailProvider();

    const service = new MerchantUserService(prisma as any, email, makeFakeConfig());
    await service.signup("real_owner_merchant", "victim@tienda.bo", "a-strong-password");

    expect(prisma.merchantUser.update).toHaveBeenCalledWith({
      where: { id: "user_1" },
      data: expect.objectContaining({ merchantId: "real_owner_merchant", emailVerifiedAt: null }),
    });
    expect(prisma.emailVerificationToken.deleteMany).toHaveBeenCalledWith({ where: { merchantUserId: "user_1" } });
    expect(email.send).toHaveBeenCalled();
  });
});

describe("MerchantUserService.verifyEmail", () => {
  it("marks the matching user verified and consumes the token", async () => {
    const prisma = makeFakePrisma();
    const service = new MerchantUserService(prisma as any, makeFakeEmailProvider(), makeFakeConfig());

    // Drive a real signup first so the token/hash pairing is genuine.
    prisma.merchantUser.findUnique.mockResolvedValue(null);
    prisma.merchantUser.create.mockResolvedValue({ id: "user_1", email: "owner@tienda.bo" });
    let issuedToken = "";
    const originalSend = (service as any).emailProvider.send;
    (service as any).emailProvider.send = jest.fn(async (req: { body: string }) => {
      issuedToken = req.body.match(/token=(\w+)/)![1];
    });
    let storedHashedToken = "";
    prisma.emailVerificationToken.create.mockImplementation(({ data }: any) => {
      storedHashedToken = data.hashedToken;
      return Promise.resolve({});
    });
    await service.signup("m_1", "owner@tienda.bo", "a-strong-password");
    (service as any).emailProvider.send = originalSend;

    prisma.emailVerificationToken.findMany.mockResolvedValue([
      { id: "tok_1", merchantUserId: "user_1", hashedToken: storedHashedToken },
    ]);

    const result = await service.verifyEmail(issuedToken);

    expect(result).toEqual({ verified: true });
    expect(prisma.merchantUser.update).toHaveBeenCalledWith({
      where: { id: "user_1" },
      data: { emailVerifiedAt: expect.any(Date) },
    });
    expect(prisma.emailVerificationToken.delete).toHaveBeenCalledWith({ where: { id: "tok_1" } });
  });

  it("returns unverified for an unknown/invalid token without mutating anything", async () => {
    const prisma = makeFakePrisma();
    prisma.emailVerificationToken.findMany.mockResolvedValue([]);
    const service = new MerchantUserService(prisma as any, makeFakeEmailProvider(), makeFakeConfig());

    await expect(service.verifyEmail("totally-made-up")).resolves.toEqual({ verified: false });
    expect(prisma.merchantUser.update).not.toHaveBeenCalled();
  });
});

describe("MerchantUserService.requestPasswordReset", () => {
  it("issues a reset token and email when the account exists", async () => {
    const prisma = makeFakePrisma();
    prisma.merchantUser.findUnique.mockResolvedValue({ id: "user_1", email: "owner@tienda.bo" });
    const email = makeFakeEmailProvider();

    const service = new MerchantUserService(prisma as any, email, makeFakeConfig());
    const result = await service.requestPasswordReset("owner@tienda.bo");

    expect(prisma.passwordResetToken.deleteMany).toHaveBeenCalledWith({ where: { merchantUserId: "user_1" } });
    expect(prisma.passwordResetToken.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ merchantUserId: "user_1" }),
    });
    expect(email.send).toHaveBeenCalledWith(expect.objectContaining({ to: "owner@tienda.bo" }));
    expect(result).toEqual({ message: "If that email has a dashboard login, check your inbox for a reset link." });
  });

  it("returns the identical response for an unknown email, without sending anything", async () => {
    const prisma = makeFakePrisma();
    prisma.merchantUser.findUnique.mockResolvedValue(null);
    const email = makeFakeEmailProvider();

    const service = new MerchantUserService(prisma as any, email, makeFakeConfig());
    const result = await service.requestPasswordReset("nobody@tienda.bo");

    expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
    expect(email.send).not.toHaveBeenCalled();
    expect(result).toEqual({ message: "If that email has a dashboard login, check your inbox for a reset link." });
  });
});

describe("MerchantUserService.resetPassword", () => {
  it("updates the password, verifies the email, and revokes existing sessions for a valid token", async () => {
    const prisma = makeFakePrisma();
    const service = new MerchantUserService(prisma as any, makeFakeEmailProvider(), makeFakeConfig());

    // Drive a real requestPasswordReset first so token/hash pairing is genuine.
    prisma.merchantUser.findUnique.mockResolvedValue({ id: "user_1", email: "owner@tienda.bo" });
    let issuedToken = "";
    const capturingEmail = { send: jest.fn(async (req: { body: string }) => { issuedToken = req.body.match(/token=(\w+)/)![1]; }) };
    (service as any).emailProvider = capturingEmail;
    let storedHashedToken = "";
    prisma.passwordResetToken.create.mockImplementation(({ data }: any) => {
      storedHashedToken = data.hashedToken;
      return Promise.resolve({});
    });
    await service.requestPasswordReset("owner@tienda.bo");

    prisma.passwordResetToken.findMany.mockResolvedValue([
      { id: "reset_1", merchantUserId: "user_1", hashedToken: storedHashedToken },
    ]);

    const result = await service.resetPassword(issuedToken, "a-new-strong-password");

    expect(result).toEqual({ reset: true });
    expect(prisma.merchantUser.update).toHaveBeenCalledWith({
      where: { id: "user_1" },
      data: { hashedPassword: expect.any(String), emailVerifiedAt: expect.any(Date) },
    });
    expect(prisma.passwordResetToken.delete).toHaveBeenCalledWith({ where: { id: "reset_1" } });
    expect(prisma.merchantSession.updateMany).toHaveBeenCalledWith({
      where: { merchantUserId: "user_1", revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it("returns unreset for an unknown/expired token without mutating anything", async () => {
    const prisma = makeFakePrisma();
    prisma.passwordResetToken.findMany.mockResolvedValue([]);
    const service = new MerchantUserService(prisma as any, makeFakeEmailProvider(), makeFakeConfig());

    await expect(service.resetPassword("totally-made-up", "new-password")).resolves.toEqual({ reset: false });
    expect(prisma.merchantUser.update).not.toHaveBeenCalled();
    expect(prisma.merchantSession.updateMany).not.toHaveBeenCalled();
  });
});
