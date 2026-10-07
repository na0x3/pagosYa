import { SettlementQueryService } from "./settlement-query.service";

function prismaWith(merchant: Record<string, unknown>, policies: Record<number, Record<string, unknown>>) {
  return {
    merchant: { findUniqueOrThrow: jest.fn().mockResolvedValue(merchant), findUnique: jest.fn().mockResolvedValue(merchant) },
    merchantLevelPolicy: { findUnique: jest.fn(async ({ where }: { where: { level: number } }) => policies[where.level] ?? null) },
    settlementHold: { findMany: jest.fn().mockResolvedValue([]) },
    ledgerEntry: { groupBy: jest.fn().mockResolvedValue([]) },
  };
}
const levels = {
  1: { level: 1, name: "Persona", liveEnabled: true, payoutDelayDays: 7, reserveBps: 1000, reserveDays: 60 },
  2: { level: 2, name: "Negocio", liveEnabled: true, payoutDelayDays: 3, reserveBps: 500, reserveDays: 45 },
};
const plain = { level: 1, payoutDelayDaysOverride: null, reserveBpsOverride: null, reserveDaysOverride: null, payoutHeldAt: null };

describe("SettlementQueryService.schedule", () => {
  it("returns the effective policy and the next level's numbers", async () => {
    const policies = { resolve: jest.fn().mockResolvedValue({ delayDays: 7, reserveBps: 1000, reserveDays: 60 }) };
    const schedule = await new SettlementQueryService(prismaWith(plain, levels) as any, policies as any).schedule("m_1");
    expect(schedule.policy).toEqual({ level: 1, levelName: "Persona", delayDays: 7, reserveBps: 1000, reserveDays: 60 });
    expect(schedule.nextLevel).toEqual({ level: 2, name: "Negocio", delayDays: 3, reserveBps: 500, reserveDays: 45 });
    expect(schedule.releases).toEqual([]);
  });

  it("hides the next level for a merchant on custom conditions", async () => {
    const policies = { resolve: jest.fn().mockResolvedValue({ delayDays: 1, reserveBps: 0, reserveDays: 0 }) };
    const schedule = await new SettlementQueryService(prismaWith({ ...plain, payoutDelayDaysOverride: 1 }, levels) as any, policies as any).schedule("m_1");
    expect(schedule.nextLevel).toBeNull();
  });

  it("never exposes the internal hold reason", async () => {
    const policies = { resolve: jest.fn().mockResolvedValue({ delayDays: 7, reserveBps: 1000, reserveDays: 60 }) };
    const schedule = await new SettlementQueryService(prismaWith({ ...plain, payoutHoldReason: "fraude sospechado" }, levels) as any, policies as any).schedule("m_1");
    expect(JSON.stringify(schedule)).not.toContain("fraude");
  });
});
