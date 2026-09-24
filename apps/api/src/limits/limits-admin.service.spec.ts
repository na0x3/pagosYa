import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { LimitsAdminService } from "./limits-admin.service";

const admin = { id: "ops_1", name: "Ana", email: "ana@pagosya.bo", role: "SUPPORT_ADMIN" };
const agent = { ...admin, role: "SUPPORT_AGENT" };

function setup() {
  const tx = {
    merchantLevelPolicy: {
      findUnique: jest.fn().mockResolvedValue({ level: 1, monthlyLimit: 1_000_000, perPaymentLimit: 200_000, liveEnabled: true }),
      update: jest.fn().mockResolvedValue({ level: 1, monthlyLimit: 2_000_000, perPaymentLimit: 200_000, liveEnabled: true }),
    },
    merchant: {
      findUnique: jest.fn().mockResolvedValue({ id: "m_1", level: 1, monthlyLimitOverride: null, perPaymentLimitOverride: null }),
      update: jest.fn().mockResolvedValue({ id: "m_1", level: 3, monthlyLimitOverride: 50_000_000, perPaymentLimitOverride: 5_000_000 }),
    },
    limitSettings: { findUnique: jest.fn().mockResolvedValue({ usdToBobRate: "6.96" }), update: jest.fn().mockResolvedValue({ usdToBobRate: "6.97" }) },
  };
  const prisma = { $transaction: jest.fn((fn) => fn(tx)), $queryRaw: jest.fn().mockResolvedValue([]) };
  const audit = { record: jest.fn() };
  return { tx, audit, service: new LimitsAdminService(prisma as any, audit as any) };
}

const MERCHANT_SELECT = { id: true, level: true, monthlyLimitOverride: true, perPaymentLimitOverride: true };

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

it("404s when the policy level doesn't exist", async () => {
  const { service, tx } = setup();
  tx.merchantLevelPolicy.findUnique.mockResolvedValue(null);
  await expect(service.updatePolicy(99, { monthlyLimit: 1_000_000 }, admin as any)).rejects.toBeInstanceOf(NotFoundException);
});

it("sets a merchant to level 3 with custom limits", async () => {
  const { service, tx } = setup();
  await service.updateMerchant("m_1", { level: 3, monthlyLimitOverride: 50_000_000, perPaymentLimitOverride: 5_000_000 }, admin as any);
  expect(tx.merchant.update).toHaveBeenCalledWith({
    where: { id: "m_1" },
    data: { level: 3, monthlyLimitOverride: 50_000_000, perPaymentLimitOverride: 5_000_000 },
    select: MERCHANT_SELECT,
  });
});

it("keeps the untouched fields in the audit trail on a partial merchant update", async () => {
  const { service, tx, audit } = setup();
  tx.merchant.findUnique.mockResolvedValue({ id: "m_2", level: 1, monthlyLimitOverride: 5_000_000, perPaymentLimitOverride: 2_000_000 });
  // The DB row Prisma would actually return: level changed, monthlyLimitOverride untouched by this partial update.
  tx.merchant.update.mockResolvedValue({ id: "m_2", level: 3, monthlyLimitOverride: 5_000_000, perPaymentLimitOverride: 2_000_000 });
  await service.updateMerchant("m_2", { level: 3 }, admin as any);
  expect(audit.record).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
    action: "limits.merchant_updated",
    metadata: {
      before: expect.objectContaining({ monthlyLimitOverride: 5_000_000 }),
      after: expect.objectContaining({ level: 3, monthlyLimitOverride: 5_000_000 }),
    },
  }));
});

it("404s when the merchant doesn't exist", async () => {
  const { service, tx } = setup();
  tx.merchant.findUnique.mockResolvedValue(null);
  await expect(service.updateMerchant("missing", { level: 1 }, admin as any)).rejects.toBeInstanceOf(NotFoundException);
});

it("refuses to null out a limit on a live, non-level-3 policy — that would fail closed for every merchant at that level", async () => {
  const { service, tx } = setup();
  await expect(service.updatePolicy(1, { perPaymentLimit: null }, admin as any)).rejects.toBeInstanceOf(BadRequestException);
  expect(tx.merchantLevelPolicy.update).not.toHaveBeenCalled();
});

it("allows nulling a policy limit on level 3 or once liveEnabled is off", async () => {
  const { service, tx } = setup();
  tx.merchantLevelPolicy.findUnique.mockResolvedValueOnce({ level: 3, monthlyLimit: null, perPaymentLimit: null, liveEnabled: true });
  await service.updatePolicy(3, { monthlyLimit: null }, admin as any);
  expect(tx.merchantLevelPolicy.update).toHaveBeenCalledTimes(1);

  tx.merchantLevelPolicy.findUnique.mockResolvedValueOnce({ level: 1, monthlyLimit: 1_000_000, perPaymentLimit: 200_000, liveEnabled: true });
  await service.updatePolicy(1, { liveEnabled: false, monthlyLimit: null }, admin as any);
  expect(tx.merchantLevelPolicy.update).toHaveBeenCalledTimes(2);
});

it("refuses to move a merchant to level 3 without both overrides — that would block every one of its live payments", async () => {
  const { service, tx } = setup();
  tx.merchant.findUnique.mockResolvedValue({ id: "m_1", level: 1, monthlyLimitOverride: null, perPaymentLimitOverride: null });
  await expect(service.updateMerchant("m_1", { level: 3 }, admin as any)).rejects.toBeInstanceOf(BadRequestException);
  expect(tx.merchant.update).not.toHaveBeenCalled();
});

it("only admins change the USD rate", async () => {
  const { service, audit } = setup();
  await expect(service.updateSettings(6.97, agent as any)).rejects.toBeInstanceOf(ForbiddenException);
  await service.updateSettings(6.97, admin as any);
  expect(audit.record).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: "limits.settings_updated" }));
});

it("404s when the settings row doesn't exist", async () => {
  const { service, tx } = setup();
  tx.limitSettings.findUnique.mockResolvedValue(null);
  await expect(service.updateSettings(6.97, admin as any)).rejects.toBeInstanceOf(NotFoundException);
});
