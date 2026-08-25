import { OpsRole, SupportCaseCategory, SupportCasePriority, SupportCaseStatus } from "@prisma/client";
import { SupportService } from "./support.service";

const actor = { id: "ops_1", name: "Ana", email: "ana@pagosya.bo", role: OpsRole.SUPPORT_AGENT };

function makeFakePrisma() {
  const prisma: any = {
    merchant: { findUnique: jest.fn() },
    merchantUser: { findFirst: jest.fn() },
    merchantSession: { updateMany: jest.fn() },
    supportCase: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn() },
    supportCaseNote: { create: jest.fn() },
  };
  prisma.$transaction = jest.fn(async (callback: any) => callback(prisma));
  return prisma;
}

describe("SupportService", () => {
  it("lets an authenticated merchant submit a traceable case in SENT status", async () => {
    const prisma = makeFakePrisma();
    const auditLog = { record: jest.fn() };
    prisma.merchantUser.findFirst.mockResolvedValue({ id: "user_1", email: "owner@merchant.bo" });
    prisma.supportCase.create.mockResolvedValue({
      id: "case_merchant_1",
      category: SupportCaseCategory.PAYMENTS,
      status: SupportCaseStatus.SENT,
      summary: "Un cobro figura duplicado.",
    });
    const service = new SupportService(prisma, auditLog as any, {} as any);

    const result = await service.createMerchantCase(
      "merchant_1",
      { id: "user_1", email: "owner@merchant.bo" },
      { category: SupportCaseCategory.PAYMENTS, summary: "Un cobro figura duplicado." },
    );

    expect(result.status).toBe(SupportCaseStatus.SENT);
    expect(prisma.supportCase.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        merchantId: "merchant_1",
        createdByMerchantUserId: "user_1",
        status: SupportCaseStatus.SENT,
        priority: SupportCasePriority.NORMAL,
      }),
    }));
    expect(auditLog.record).toHaveBeenCalledWith(prisma, expect.objectContaining({
      actorType: "MERCHANT_USER",
      action: "support.case_submitted",
      targetId: "case_merchant_1",
    }));
  });

  it("creates a case assigned to the current ops user and audits it in the same transaction", async () => {
    const prisma = makeFakePrisma();
    const auditLog = { record: jest.fn() };
    prisma.merchant.findUnique.mockResolvedValue({ id: "merchant_1" });
    prisma.supportCase.create.mockResolvedValue({ id: "case_1", merchantId: "merchant_1" });
    const service = new SupportService(prisma, auditLog as any, {} as any);

    await service.createCase(
      {
        merchantId: "merchant_1",
        category: SupportCaseCategory.ACCOUNT_ACCESS,
        priority: SupportCasePriority.NORMAL,
        summary: "El titular no puede ingresar.",
      },
      actor,
    );

    expect(prisma.supportCase.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ createdByOpsUserId: actor.id, assignedToOpsUserId: actor.id, status: SupportCaseStatus.REVIEWED }),
    }));
    expect(auditLog.record).toHaveBeenCalledWith(prisma, expect.objectContaining({ action: "support.case_created", targetId: "case_1" }));
  });

  it("revokes only active sessions belonging to the user and records the reason", async () => {
    const prisma = makeFakePrisma();
    const auditLog = { record: jest.fn() };
    prisma.supportCase.findUnique.mockResolvedValue({ id: "case_1", merchantId: "merchant_1", status: SupportCaseStatus.REVIEWED });
    prisma.merchantUser.findFirst.mockResolvedValue({ id: "user_1", merchantId: "merchant_1" });
    prisma.merchantSession.updateMany.mockResolvedValue({ count: 2 });
    const service = new SupportService(prisma, auditLog as any, {} as any);

    const result = await service.revokeSessions("case_1", "user_1", "El titular reportó un equipo perdido.", actor);

    expect(result).toEqual({ revokedCount: 2 });
    expect(prisma.merchantSession.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ merchantUserId: "user_1", revokedAt: null }),
    }));
    expect(auditLog.record).toHaveBeenCalledWith(prisma, expect.objectContaining({
      action: "support.sessions_revoked",
      metadata: expect.objectContaining({ caseId: "case_1", reason: "El titular reportó un equipo perdido.", revokedCount: 2 }),
    }));
  });

  it("sends password recovery only for a user belonging to the open case and audits success", async () => {
    const prisma = makeFakePrisma();
    const auditLog = { record: jest.fn() };
    const merchantUsers = { requestPasswordReset: jest.fn().mockResolvedValue({ message: "sent" }) };
    prisma.supportCase.findUnique.mockResolvedValue({ id: "case_1", merchantId: "merchant_1", status: SupportCaseStatus.REVIEWED });
    prisma.merchantUser.findFirst.mockResolvedValue({ id: "user_1", merchantId: "merchant_1", email: "owner@merchant.bo" });
    const service = new SupportService(prisma, auditLog as any, merchantUsers as any);

    await service.requestPasswordReset("case_1", "user_1", "El titular solicitó recuperar su acceso.", actor);

    expect(merchantUsers.requestPasswordReset).toHaveBeenCalledWith("owner@merchant.bo");
    expect(auditLog.record).toHaveBeenCalledWith(prisma, expect.objectContaining({
      action: "support.password_reset_sent",
      metadata: expect.objectContaining({ caseId: "case_1", reason: "El titular solicitó recuperar su acceso." }),
    }));
  });
});
