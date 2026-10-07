import { BadRequestException, ConflictException, ForbiddenException } from "@nestjs/common";
import { LedgerAccount, LedgerDirection, OpsRole, SettlementHoldStatus } from "@prisma/client";
import { LedgerService } from "../ledger/ledger.service";
import { SettlementAdminService } from "./settlement-admin.service";

const admin = { id: "ops_1", name: "Ana", email: "ana@pagosya.bo", role: OpsRole.SUPPORT_ADMIN };
const agent = { id: "ops_2", name: "Beto", email: "beto@pagosya.bo", role: OpsRole.SUPPORT_AGENT };

function setup(merchant: Record<string, unknown> = { id: "m_1", payoutHeldAt: null, payoutHoldReason: null, payoutHeldByLabel: null }) {
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(0),
    merchant: { findUnique: jest.fn().mockResolvedValue(merchant), update: jest.fn(async ({ data }: { data: object }) => ({ ...merchant, ...data })) },
    settlementHold: { findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
    ledgerEntry: { groupBy: jest.fn().mockResolvedValue([]), createMany: jest.fn() },
    reserveSeizure: { create: jest.fn(async ({ data }: { data: object }) => ({ id: "rs_1", ...data })) },
  };
  const prisma = {
    $transaction: jest.fn(async (cb: (t: unknown) => unknown) => cb(tx)),
    merchant: { findMany: jest.fn().mockResolvedValue([]) },
    merchantUser: { findMany: jest.fn().mockResolvedValue([{ email: "dueno@tienda.bo" }]) },
  };
  const auditLog = { record: jest.fn() };
  const email = { send: jest.fn().mockResolvedValue(undefined) };
  const query = { balances: jest.fn(), schedule: jest.fn() };
  const svc = new SettlementAdminService(prisma as any, new LedgerService(), auditLog as any, email as any, query as any);
  return { svc, tx, prisma, auditLog, email };
}

describe("SettlementAdminService holds", () => {
  it("lets any ops user place a hold, audits it and emails the merchant without the reason", async () => {
    const { svc, tx, auditLog, email } = setup();
    await expect(svc.placeHold("m_1", "Reclamos de compradores sin entrega", agent)).resolves.toEqual({ held: true });
    expect(tx.merchant.update).toHaveBeenCalledWith({
      where: { id: "m_1" },
      data: { payoutHoldReason: "Reclamos de compradores sin entrega", payoutHeldAt: expect.any(Date), payoutHeldByLabel: "Beto <beto@pagosya.bo>" },
    });
    expect(auditLog.record).toHaveBeenCalledWith(tx, expect.objectContaining({ action: "settlement.hold_placed", targetId: "m_1" }));
    expect(email.send).toHaveBeenCalledTimes(1);
    const mail = email.send.mock.calls[0][0];
    expect(mail.to).toBe("dueno@tienda.bo");
    expect(`${mail.subject} ${mail.body}`).not.toContain("Reclamos");
  });

  it("refuses a second hold without emailing again", async () => {
    const { svc, email } = setup({ id: "m_1", payoutHeldAt: new Date(), payoutHoldReason: "x", payoutHeldByLabel: "y" });
    await expect(svc.placeHold("m_1", "Otra razón suficiente", agent)).rejects.toBeInstanceOf(ConflictException);
    expect(email.send).not.toHaveBeenCalled();
  });

  it("only lets an admin lift a hold", async () => {
    const { svc } = setup({ id: "m_1", payoutHeldAt: new Date(), payoutHoldReason: "x", payoutHeldByLabel: "y" });
    await expect(svc.liftHold("m_1", agent)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(svc.liftHold("m_1", admin)).resolves.toEqual({ held: false });
  });

  it("explains when there is no hold to lift", async () => {
    const { svc } = setup();
    await expect(svc.liftHold("m_1", admin)).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe("SettlementAdminService overrides and seizure", () => {
  it("only lets an admin change overrides", async () => {
    const { svc } = setup();
    await expect(svc.updateOverrides("m_1", { reserveBpsOverride: 0 }, agent)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("refuses to seize more than the reserve", async () => {
    const { svc, tx } = setup();
    tx.ledgerEntry.groupBy.mockResolvedValue([{ direction: LedgerDirection.CREDIT, _sum: { amount: 500 } }]);
    await expect(svc.seize("m_1", { amount: 600, currency: "BOB", reason: "Fraude confirmado", externalReference: "TRX-1" }, admin))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(tx.ledgerEntry.createMany).not.toHaveBeenCalled();
  });

  it("seizes oldest reserve first, posts RESERVE -> RAIL_CLEARING and records it", async () => {
    const { svc, tx, auditLog } = setup();
    tx.ledgerEntry.groupBy.mockResolvedValue([{ direction: LedgerDirection.CREDIT, _sum: { amount: 800 } }]);
    tx.settlementHold.findMany.mockResolvedValue([
      { id: "new", paymentIntentId: "p2", status: SettlementHoldStatus.RESERVE_HELD, pendingAmount: 0, reserveAmount: 500, createdAt: new Date("2026-09-20") },
      { id: "old", paymentIntentId: "p1", status: SettlementHoldStatus.RESERVE_HELD, pendingAmount: 0, reserveAmount: 300, createdAt: new Date("2026-09-01") },
    ]);
    await svc.seize("m_1", { amount: 400, currency: "BOB", reason: "Fraude confirmado", externalReference: "TRX-1" }, admin);
    expect(tx.$executeRaw).toHaveBeenCalled();
    expect(tx.settlementHold.update).toHaveBeenNthCalledWith(1, { where: { id: "old" }, data: { reserveAmount: 0, status: SettlementHoldStatus.CLOSED } });
    expect(tx.settlementHold.update).toHaveBeenNthCalledWith(2, { where: { id: "new" }, data: { reserveAmount: 400, status: SettlementHoldStatus.RESERVE_HELD } });
    expect(tx.ledgerEntry.createMany.mock.calls[0][0].data).toEqual([
      expect.objectContaining({ account: LedgerAccount.RESERVE, direction: LedgerDirection.DEBIT, amount: 400, merchantId: "m_1" }),
      expect.objectContaining({ account: LedgerAccount.RAIL_CLEARING, direction: LedgerDirection.CREDIT, amount: 400, merchantId: "m_1" }),
    ]);
    expect(tx.reserveSeizure.create).toHaveBeenCalledWith({ data: expect.objectContaining({ merchantId: "m_1", amount: 400, currency: "BOB", externalReference: "TRX-1", opsUserId: "ops_1", opsLabel: "Ana <ana@pagosya.bo>" }) });
    expect(auditLog.record).toHaveBeenCalledWith(tx, expect.objectContaining({ action: "settlement.reserve_seized" }));
  });

  it("only lets an admin seize", async () => {
    const { svc } = setup();
    await expect(svc.seize("m_1", { amount: 1, currency: "BOB", reason: "Fraude confirmado", externalReference: "TRX-1" }, agent))
      .rejects.toBeInstanceOf(ForbiddenException);
  });
});
