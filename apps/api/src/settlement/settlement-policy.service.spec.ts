import { STRICT_FALLBACK_POLICY, SettlementPolicyService } from "./settlement-policy.service";

function db(merchant: Record<string, unknown>, policy: Record<string, unknown> | null) {
  return {
    merchant: { findUniqueOrThrow: jest.fn().mockResolvedValue(merchant) },
    merchantLevelPolicy: { findUnique: jest.fn().mockResolvedValue(policy) },
  };
}
const noOverrides = { level: 1, payoutDelayDaysOverride: null, reserveBpsOverride: null, reserveDaysOverride: null };
const level1 = { level: 1, payoutDelayDays: 7, reserveBps: 1000, reserveDays: 60 };

describe("SettlementPolicyService.resolve", () => {
  it("uses the level policy when the merchant has no overrides", async () => {
    await expect(new SettlementPolicyService().resolve(db(noOverrides, level1) as any, "m_1"))
      .resolves.toEqual({ delayDays: 7, reserveBps: 1000, reserveDays: 60 });
  });

  it("lets each override win field by field", async () => {
    const merchant = { ...noOverrides, reserveBpsOverride: 0 };
    await expect(new SettlementPolicyService().resolve(db(merchant, level1) as any, "m_1"))
      .resolves.toEqual({ delayDays: 7, reserveBps: 0, reserveDays: 60 });
  });

  it("fails closed to the strict fallback when the level has no policy row", async () => {
    await expect(new SettlementPolicyService().resolve(db(noOverrides, null) as any, "m_1"))
      .resolves.toEqual(STRICT_FALLBACK_POLICY);
  });

  it("still applies overrides on top of the fallback", async () => {
    const merchant = { ...noOverrides, payoutDelayDaysOverride: 2 };
    await expect(new SettlementPolicyService().resolve(db(merchant, null) as any, "m_1"))
      .resolves.toEqual({ delayDays: 2, reserveBps: 1000, reserveDays: 90 });
  });
});
