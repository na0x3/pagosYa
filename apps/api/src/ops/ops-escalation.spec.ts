import { openOpsCaseOnce } from "./ops-escalation";

function prismaWith(existing: { id: string } | null) {
  return { supportCase: { findFirst: jest.fn().mockResolvedValue(existing), create: jest.fn().mockResolvedValue({ id: "case_new" }) } };
}

describe("openOpsCaseOnce", () => {
  it("opens a high-priority payments case when none is open for the key", async () => {
    const prisma = prismaWith(null);
    await expect(openOpsCaseOnce(prisma, { merchantId: "m_1", dedupeKey: "pi_1", summary: "Cobro pi_1 sin conciliar" }))
      .resolves.toEqual({ id: "case_new", created: true });
    expect(prisma.supportCase.findFirst).toHaveBeenCalledWith({
      where: { summary: { contains: "pi_1" }, status: { not: "RESOLVED" } },
      select: { id: true },
    });
    expect(prisma.supportCase.create).toHaveBeenCalledWith({
      data: { merchantId: "m_1", category: "PAYMENTS", priority: "HIGH", summary: "Cobro pi_1 sin conciliar" },
    });
  });

  it("reuses a case that is still open", async () => {
    const prisma = prismaWith({ id: "case_open" });
    await expect(openOpsCaseOnce(prisma, { merchantId: "m_1", dedupeKey: "pi_1", summary: "Cobro pi_1" }))
      .resolves.toEqual({ id: "case_open", created: false });
    expect(prisma.supportCase.create).not.toHaveBeenCalled();
  });

  it("refuses a summary that could never be found again by its key", async () => {
    await expect(openOpsCaseOnce(prismaWith(null), { merchantId: "m_1", dedupeKey: "pi_1", summary: "sin referencia" })).rejects.toThrow();
  });
});
