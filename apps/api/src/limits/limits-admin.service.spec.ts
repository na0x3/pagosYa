import { ForbiddenException } from "@nestjs/common";
import { LimitsAdminService } from "./limits-admin.service";

const admin = { id: "ops_1", name: "Ana", email: "ana@pagosya.bo", role: "SUPPORT_ADMIN" };
const agent = { ...admin, role: "SUPPORT_AGENT" };

function setup() {
  const tx = {
    merchantLevelPolicy: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({ level: 1, monthlyLimit: 1_000_000, perPaymentLimit: 200_000, liveEnabled: true }),
      update: jest.fn().mockResolvedValue({ level: 1, monthlyLimit: 2_000_000, perPaymentLimit: 200_000, liveEnabled: true }),
    },
    merchant: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({ id: "m_1", level: 1, monthlyLimitOverride: null, perPaymentLimitOverride: null }),
      update: jest.fn().mockResolvedValue({}),
    },
    limitSettings: { findUniqueOrThrow: jest.fn().mockResolvedValue({ usdToBobRate: "6.96" }), update: jest.fn().mockResolvedValue({ usdToBobRate: "6.97" }) },
  };
  const prisma = { $transaction: jest.fn((fn) => fn(tx)), $queryRaw: jest.fn().mockResolvedValue([]) };
  const audit = { record: jest.fn() };
  return { tx, audit, service: new LimitsAdminService(prisma as any, audit as any) };
}

it("only admins change policies, and the change is audited with before and after", async () => {
  const { service, audit } = setup();
  await expect(service.updatePolicy(1, { monthlyLimit: 2_000_000 }, agent as any)).rejects.toBeInstanceOf(ForbiddenException);
  await service.updatePolicy(1, { monthlyLimit: 2_000_000 }, admin as any);
  expect(audit.record).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
    action: "limits.policy_updated",
    targetId: "1",
    metadata: { before: expect.objectContaining({ monthlyLimit: 1_000_000 }), after: expect.objectContaining({ monthlyLimit: 2_000_000 }) },
  }));
});

it("sets a merchant to level 3 with custom limits", async () => {
  const { service, tx } = setup();
  await service.updateMerchant("m_1", { level: 3, monthlyLimitOverride: 50_000_000, perPaymentLimitOverride: 5_000_000 }, admin as any);
  expect(tx.merchant.update).toHaveBeenCalledWith({ where: { id: "m_1" }, data: { level: 3, monthlyLimitOverride: 50_000_000, perPaymentLimitOverride: 5_000_000 } });
});

it("only admins change the USD rate", async () => {
  const { service, audit } = setup();
  await expect(service.updateSettings(6.97, agent as any)).rejects.toBeInstanceOf(ForbiddenException);
  await service.updateSettings(6.97, admin as any);
  expect(audit.record).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: "limits.settings_updated" }));
});
