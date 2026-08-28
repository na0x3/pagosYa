import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import * as argon2 from "argon2";
import { createHash } from "node:crypto";
import { MerchantSessionService } from "./merchant-session.service";

function makeFakePrisma() {
  const prisma: any = {
    merchantUser: { findUnique: jest.fn(), findUniqueOrThrow: jest.fn(), findFirst: jest.fn(), count: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    merchantSession: { create: jest.fn(), findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]), update: jest.fn(), updateMany: jest.fn() },
    emailVerificationToken: { deleteMany: jest.fn() },
    passwordResetToken: { deleteMany: jest.fn() },
    merchant: { update: jest.fn() },
    store: { findFirst: jest.fn(), updateMany: jest.fn() },
    paymentIntent: { count: jest.fn() },
    merchantProgressCelebration: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    apiKey: { updateMany: jest.fn() },
    webhookEndpoint: { updateMany: jest.fn() },
    auditLogEntry: { create: jest.fn() },
  };
  prisma.$executeRawUnsafe = jest.fn().mockResolvedValue(1);
  prisma.$transaction = jest.fn((callback: any) => callback(prisma));
  return prisma;
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
    expect(prisma.merchantSession.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ hashedToken: expect.stringMatching(/^sha256:[a-f0-9]{64}$/) }),
    });
    expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
      "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
      "user_1",
    );
  });

  it("revokes the oldest sessions when a fourth active session is issued", async () => {
    const prisma = makeFakePrisma();
    const hashedPassword = await argon2.hash("correct-password");
    prisma.merchantUser.findUnique.mockResolvedValue({
      id: "user_1",
      merchantId: "m_1",
      email: "owner@tienda.bo",
      hashedPassword,
      emailVerifiedAt: new Date(),
    });
    prisma.merchantSession.findMany.mockResolvedValue([{ id: "session_oldest" }]);

    await new MerchantSessionService(prisma as any).login("owner@tienda.bo", "correct-password");

    expect(prisma.merchantSession.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ merchantUserId: "user_1", revokedAt: null }),
      skip: 3,
    }));
    expect(prisma.merchantSession.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["session_oldest"] } },
      data: { revokedAt: expect.any(Date) },
    });
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

describe("MerchantSessionService.loginWithGoogle", () => {
  it("links an authoritative Google identity to a provisioned merchant user and issues the normal session", async () => {
    const prisma = makeFakePrisma();
    prisma.merchantUser.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: "user_1",
        merchantId: "m_1",
        email: "owner@gmail.com",
        emailVerifiedAt: new Date(),
        googleSubject: null,
        deletedAt: null,
      });
    prisma.merchantUser.update.mockResolvedValue({
      id: "user_1",
      merchantId: "m_1",
      email: "owner@gmail.com",
      emailVerifiedAt: new Date(),
      googleSubject: "google_123",
      deletedAt: null,
    });
    const google = {
      verifyCredential: jest.fn().mockResolvedValue({
        subject: "google_123",
        email: "owner@gmail.com",
        name: "Owner",
        emailAuthoritative: true,
      }),
    };

    const result = await new MerchantSessionService(prisma, google as any).loginWithGoogle("id-token");

    expect(prisma.merchantUser.update).toHaveBeenCalledWith({
      where: { id: "user_1" },
      data: { googleSubject: "google_123", emailVerifiedAt: expect.any(Date) },
    });
    expect(result.token).toMatch(/^dash_/);
  });
});

describe("MerchantSessionService.claimDailyLoginStar", () => {
  it("awards one star on the first dashboard check-in of the Bolivia day", async () => {
    const prisma = makeFakePrisma();
    const now = new Date("2026-08-20T15:30:00.000Z");
    prisma.merchantUser.updateMany.mockResolvedValue({ count: 1 });
    prisma.merchantUser.findUniqueOrThrow.mockResolvedValue({ dailyLoginStars: 7, lastDailyStarAt: now });

    const result = await new MerchantSessionService(prisma).claimDailyLoginStar("user_1", now);

    expect(result).toEqual({
      awarded: true,
      totalStars: 7,
      awardedAt: now,
      nextRewardAt: new Date("2026-08-21T04:00:00.000Z"),
    });
    expect(prisma.merchantUser.updateMany).toHaveBeenCalledWith({
      where: {
        id: "user_1",
        OR: [
          { lastDailyStarAt: null },
          { lastDailyStarAt: { lt: new Date("2026-08-20T04:00:00.000Z") } },
        ],
      },
      data: { dailyLoginStars: { increment: 1 }, lastDailyStarAt: now },
    });
  });

  it("returns the balance without granting a duplicate star on the same day", async () => {
    const prisma = makeFakePrisma();
    const now = new Date("2026-08-20T22:00:00.000Z");
    prisma.merchantUser.updateMany.mockResolvedValue({ count: 0 });
    prisma.merchantUser.findUniqueOrThrow.mockResolvedValue({ dailyLoginStars: 7, lastDailyStarAt: new Date("2026-08-20T12:00:00.000Z") });

    const result = await new MerchantSessionService(prisma).claimDailyLoginStar("user_1", now);

    expect(result.awarded).toBe(false);
    expect(result.totalStars).toBe(7);
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

    prisma.merchantSession.findFirst.mockResolvedValue({
      id: "sess_1",
      merchantId: "m_1",
      merchantUserId: "user_1",
      hashedToken: storedHashedToken,
      merchantUser: { email: "owner@tienda.bo" },
    });

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
    expect(prisma.merchantSession.findFirst).not.toHaveBeenCalled();
    expect(prisma.merchantSession.findMany).not.toHaveBeenCalled();
  });

  it("rejects a token that matches no active session (e.g. expired/revoked, already excluded by the query)", async () => {
    const prisma = makeFakePrisma();
    prisma.merchantSession.findFirst.mockResolvedValue(null);
    prisma.merchantSession.findMany.mockResolvedValue([]);

    const service = new MerchantSessionService(prisma as any);
    await expect(service.verify("dash_nonexistent")).resolves.toBeNull();
  });

  it("never scans legacy Argon2 sessions when a digest lookup misses", async () => {
    const prisma = makeFakePrisma();
    prisma.merchantSession.findFirst.mockResolvedValue(null);

    const service = new MerchantSessionService(prisma as any);
    await expect(service.verify("dash_invalid")).resolves.toBeNull();
    expect(prisma.merchantSession.findMany).not.toHaveBeenCalled();
    expect(prisma.merchantSession.update).not.toHaveBeenCalled();
  });
});

describe("MerchantSessionService.revoke", () => {
  it("marks the matching session revoked", async () => {
    const prisma = makeFakePrisma();
    prisma.merchantSession.findFirst.mockResolvedValue({ id: "sess_1", isPrimary: false });

    const service = new MerchantSessionService(prisma as any);
    await service.revoke("dash_abc123");

    expect(prisma.merchantSession.update).toHaveBeenCalledWith({
      where: { id: "sess_1" },
      data: { revokedAt: expect.any(Date), isPrimary: false },
    });
  });

  it("revokes a digest session without scanning legacy sessions", async () => {
    const prisma = makeFakePrisma();
    prisma.merchantSession.findFirst.mockResolvedValue({ id: "sess_fast" });

    const service = new MerchantSessionService(prisma as any);
    await service.revoke("dash_fast");

    expect(prisma.merchantSession.findMany).not.toHaveBeenCalled();
    expect(prisma.merchantSession.update).toHaveBeenCalledWith({
      where: { id: "sess_fast" },
      data: { revokedAt: expect.any(Date), isPrimary: false },
    });
  });

  it("promotes the oldest remaining session when the primary logs out", async () => {
    const prisma = makeFakePrisma();
    prisma.merchantSession.findFirst
      .mockResolvedValueOnce({ id: "session_main", merchantUserId: "user_1", isPrimary: true })
      .mockResolvedValueOnce({ id: "session_next" });

    await new MerchantSessionService(prisma as any).revoke("dash_main");

    expect(prisma.merchantSession.update).toHaveBeenNthCalledWith(1, {
      where: { id: "session_main" },
      data: { revokedAt: expect.any(Date), isPrimary: false },
    });
    expect(prisma.merchantSession.update).toHaveBeenNthCalledWith(2, {
      where: { id: "session_next" },
      data: { isPrimary: true },
    });
  });
});

describe("MerchantSessionService active-session management", () => {
  it("lists only the user's active sessions and identifies the presented session", async () => {
    const prisma = makeFakePrisma();
    const token = "dash_current";
    const currentDigest = "sha256:" + createHash("sha256").update(token).digest("hex");
    const createdAt = new Date("2026-08-21T02:15:00.000Z");
    const expiresAt = new Date("2026-08-22T02:15:00.000Z");
    prisma.merchantSession.findMany.mockResolvedValue([
      {
        id: "session_current",
        hashedToken: currentDigest,
        profileName: "Dueño",
        profileAvatarId: 2,
        isPrimary: true,
        createdAt,
        expiresAt,
      },
    ]);

    const result = await new MerchantSessionService(prisma as any).listActiveSessions("user_1", token);

    expect(result).toEqual({
      limit: 3,
      active: 1,
      profiles: [{ profileName: "Dueño", profileAvatarId: 2 }],
      currentSessionId: "session_current",
      canManageSessions: true,
      sessions: [{
        id: "session_current",
        profileName: "Dueño",
        profileAvatarId: 2,
        isPrimary: true,
        current: true,
        createdAt,
        expiresAt,
      }],
    });
    expect(prisma.merchantSession.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ merchantUserId: "user_1", revokedAt: null }),
    }));
  });

  it("revokes a selected session only when it belongs to the authenticated user", async () => {
    const prisma = makeFakePrisma();
    prisma.merchantSession.findFirst
      .mockResolvedValueOnce({ id: "session_main", isPrimary: true })
      .mockResolvedValueOnce({ id: "session_other", merchantUserId: "user_1", isPrimary: false });

    const result = await new MerchantSessionService(prisma as any).revokeSessionById("user_1", "session_other", "dash_current");

    expect(result).toEqual({ revoked: true, current: false });
    expect(prisma.merchantSession.findFirst).toHaveBeenNthCalledWith(2, {
      where: { id: "session_other", merchantUserId: "user_1", revokedAt: null, expiresAt: { gt: expect.any(Date) } },
    });
    expect(prisma.merchantSession.update).toHaveBeenCalledWith({
      where: { id: "session_other" },
      data: { revokedAt: expect.any(Date), isPrimary: false },
    });
  });

  it("does not let a secondary session close another session", async () => {
    const prisma = makeFakePrisma();
    prisma.merchantSession.findFirst
      .mockResolvedValueOnce({ id: "session_secondary", isPrimary: false })
      .mockResolvedValueOnce({ id: "session_other", merchantUserId: "user_1", isPrimary: false });

    const service = new MerchantSessionService(prisma as any);
    await expect(service.revokeSessionById("user_1", "session_other", "dash_secondary")).rejects.toThrow(ForbiddenException);
    expect(prisma.merchantSession.update).not.toHaveBeenCalled();
  });

  it("allows the primary session to rename another active session", async () => {
    const prisma = makeFakePrisma();
    prisma.merchantSession.findFirst
      .mockResolvedValueOnce({ id: "session_main", isPrimary: true })
      .mockResolvedValueOnce({ id: "session_other", isPrimary: false });
    prisma.merchantSession.update.mockResolvedValue({
      id: "session_other",
      profileName: "Ana",
      profileAvatarId: 3,
      isPrimary: false,
    });

    const result = await new MerchantSessionService(prisma as any).updateSessionIdentity(
      "user_1",
      "session_other",
      "dash_main",
      "  Ana  ",
      3,
    );

    expect(result).toEqual({
      session: { id: "session_other", profileName: "Ana", profileAvatarId: 3, isPrimary: false },
    });
    expect(prisma.merchantSession.update).toHaveBeenCalledWith({
      where: { id: "session_other" },
      data: { profileName: "Ana", profileAvatarId: 3 },
      select: { id: true, profileName: true, profileAvatarId: true, isPrimary: true },
    });
  });

  it("does not let a secondary session rename another session", async () => {
    const prisma = makeFakePrisma();
    prisma.merchantSession.findFirst
      .mockResolvedValueOnce({ id: "session_secondary", isPrimary: false })
      .mockResolvedValueOnce({ id: "session_other", isPrimary: false });

    const service = new MerchantSessionService(prisma as any);
    await expect(service.updateSessionIdentity(
      "user_1",
      "session_other",
      "dash_secondary",
      "Carlos",
      4,
    )).rejects.toThrow(ForbiddenException);
    expect(prisma.merchantSession.update).not.toHaveBeenCalled();
  });
});

describe("MerchantSessionService.deactivateAccount", () => {
  it("suspends the business and retains evidence when its last dashboard user deletes access", async () => {
    const prisma = makeFakePrisma();
    prisma.merchantUser.findFirst.mockResolvedValue({
      id: "user_1",
      merchantId: "m_1",
      email: "owner@gmail.com",
      googleSubject: "google_123",
      deletedAt: null,
    });
    prisma.merchantUser.count.mockResolvedValue(1);

    const result = await new MerchantSessionService(prisma).deactivateAccount("m_1", "user_1");

    expect(result).toEqual({ deactivated: true, merchantSuspended: true });
    expect(prisma.merchant.update).toHaveBeenCalledWith({ where: { id: "m_1" }, data: { status: "SUSPENDED" } });
    expect(prisma.store.updateMany).toHaveBeenCalledWith({ where: { merchantId: "m_1", status: "ACTIVE" }, data: { status: "ARCHIVED" } });
    expect(prisma.apiKey.updateMany).toHaveBeenCalledWith({ where: { merchantId: "m_1", revokedAt: null }, data: { revokedAt: expect.any(Date) } });
    expect(prisma.auditLogEntry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "ACCOUNT_DEACTIVATED",
        targetId: "m_1",
        metadata: expect.objectContaining({ retainedEvidence: expect.arrayContaining(["NIT_KYC", "ORDERS_FULFILLMENT_EVENTS"]) }),
      }),
    });
  });
});

describe("MerchantSessionService progress celebrations", () => {
  it("returns every pending level without acknowledging it", async () => {
    const prisma = makeFakePrisma();
    prisma.store.findFirst.mockResolvedValue({ id: "store_1", viewCount: 0 });
    prisma.paymentIntent.count.mockResolvedValue(9);
    prisma.merchantProgressCelebration.findUnique.mockResolvedValue({ lastCelebratedLevel: 1 });
    const service = new MerchantSessionService(prisma);

    const result = await service.pendingProgressCelebrations("m_1", "user_1", "store_1");

    expect(result.newlyUnlockedLevels).toEqual([2, 3]);
    expect(prisma.merchantProgressCelebration.update).not.toHaveBeenCalled();
  });

  it("shows only the authoritative current companion when tracking is first introduced", async () => {
    const prisma = makeFakePrisma();
    prisma.store.findFirst.mockResolvedValue({ id: "store_1", viewCount: 100 });
    prisma.paymentIntent.count.mockResolvedValue(10);
    prisma.merchantProgressCelebration.findUnique.mockResolvedValue(null);
    const result = await new MerchantSessionService(prisma).pendingProgressCelebrations("m_1", "user_1", "store_1");
    expect(result.newlyUnlockedLevels).toEqual([4]);
  });

  it("acknowledges a displayed level and rejects levels not earned by store activity", async () => {
    const prisma = makeFakePrisma();
    prisma.store.findFirst.mockResolvedValue({ id: "store_1", viewCount: 25 });
    prisma.paymentIntent.count.mockResolvedValue(1);
    prisma.merchantProgressCelebration.findUnique.mockResolvedValue(null);
    const service = new MerchantSessionService(prisma);

    await expect(service.acknowledgeProgressCelebration("m_1", "user_1", "store_1", 2)).rejects.toThrow("todavía no fue alcanzado");
    await expect(service.acknowledgeProgressCelebration("m_1", "user_1", "store_1", 1)).resolves.toEqual({ acknowledgedLevel: 1 });
    expect(prisma.merchantProgressCelebration.create).toHaveBeenCalledWith({
      data: { merchantUserId: "user_1", storeId: "store_1", lastCelebratedLevel: 1 },
    });
  });
});
