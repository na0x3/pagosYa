import { syncMembershipPeriods } from "./membership-periods";

function makeTx(existing: Array<{ id: string; months: number; amount: number; archivedAt: Date | null }>, used: string[] = []) {
  return {
    membershipPeriod: {
      findMany: jest.fn().mockResolvedValue(existing),
      update: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockResolvedValue({}),
      delete: jest.fn().mockResolvedValue({}),
    },
    customerSubscription: {
      count: jest.fn(async ({ where }: any) => (used.includes(where.OR[0].membershipPeriodId) ? 1 : 0)),
    },
  };
}

describe("syncMembershipPeriods", () => {
  it("updates kept lengths, creates new ones and orders them as given", async () => {
    const tx = makeTx([{ id: "m1", months: 1, amount: 5000, archivedAt: null }]);
    await syncMembershipPeriods(tx as never, "p1", [{ months: 12, amount: 48000 }, { months: 1, amount: 5500 }]);
    expect(tx.membershipPeriod.create).toHaveBeenCalledWith({ data: { paymentLinkId: "p1", months: 12, amount: 48000, position: 0 } });
    expect(tx.membershipPeriod.update).toHaveBeenCalledWith({ where: { id: "m1" }, data: { amount: 5500, position: 1, archivedAt: null } });
  });

  it("archives a removed length that members used and deletes one nobody used", async () => {
    const tx = makeTx([
      { id: "m1", months: 1, amount: 5000, archivedAt: null },
      { id: "m3", months: 3, amount: 13500, archivedAt: null },
      { id: "m6", months: 6, amount: 25000, archivedAt: null },
    ], ["m3"]);
    await syncMembershipPeriods(tx as never, "p1", [{ months: 1, amount: 5000 }]);
    expect(tx.membershipPeriod.update).toHaveBeenCalledWith({ where: { id: "m3" }, data: { archivedAt: expect.any(Date) } });
    expect(tx.membershipPeriod.delete).toHaveBeenCalledWith({ where: { id: "m6" } });
  });

  it("brings an archived length back when the owner offers it again", async () => {
    const tx = makeTx([{ id: "m3", months: 3, amount: 13500, archivedAt: new Date("2026-10-01") }]);
    await syncMembershipPeriods(tx as never, "p1", [{ months: 3, amount: 14000 }]);
    expect(tx.membershipPeriod.update).toHaveBeenCalledWith({ where: { id: "m3" }, data: { amount: 14000, position: 0, archivedAt: null } });
    expect(tx.membershipPeriod.create).not.toHaveBeenCalled();
  });
});
