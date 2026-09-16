import { BadRequestException, ConflictException } from "@nestjs/common";
import { InternationalPaymentsService } from "./international-payments.service";

function setup(merchant: Record<string, unknown> = {}, rate = 6.96, updateManyCount = 1) {
  const tx = { merchant: { updateMany: jest.fn().mockResolvedValue({ count: updateManyCount }) } };
  const prisma = {
    merchant: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({ id: "m_1", settlementMode: "AGGREGATOR", internationalPaymentsStatus: "OFF", internationalPaymentsNote: null, ...merchant }),
      update: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([]),
    },
    merchantKycSubmission: { findFirst: jest.fn().mockResolvedValue({ payoutUsdBankAccount: null }) },
    $transaction: jest.fn((cb) => cb(tx)),
  };
  const client = { listPaymentMethods: jest.fn().mockResolvedValue([
    { id: "CARD", type: "CARD", name: "Tarjeta", logo: "c.png" },
    { id: "PX", type: "BANK_TRANSFER", name: "Pix" },
  ]) };
  const auditLog = { record: jest.fn() };
  const config = { get: jest.fn().mockReturnValue({ bobPerUsd: rate, intlFeeBps: 590, costBps: 0 }) };
  const service = new InternationalPaymentsService(prisma as any, client as any, auditLog as any, config as any);
  return { service, prisma, tx, client, auditLog };
}

const actor = { id: "ops_1", name: "Ops", email: "ops@pagosya.bo", role: "ADMIN" } as any;

describe("InternationalPaymentsService", () => {
  it("lets an AGGREGATOR merchant request access", async () => {
    const { service, prisma } = setup();
    await expect(service.request("m_1")).resolves.toEqual({ status: "REQUESTED" });
    expect(prisma.merchant.update).toHaveBeenCalledWith({ where: { id: "m_1" }, data: { internationalPaymentsStatus: "REQUESTED", internationalPaymentsNote: null } });
  });

  it("refuses FACILITATOR merchants and duplicate requests", async () => {
    await expect(setup({ settlementMode: "FACILITATOR" }).service.request("m_1")).rejects.toBeInstanceOf(BadRequestException);
    await expect(setup({ internationalPaymentsStatus: "ENABLED" }).service.request("m_1")).rejects.toBeInstanceOf(ConflictException);
  });

  it("approves only REQUESTED merchants and writes an audit entry in the same transaction", async () => {
    const { service, tx, auditLog } = setup({ internationalPaymentsStatus: "REQUESTED" });
    await expect(service.decide("m_1", "approve", "KYC y cuenta USD verificadas", actor)).resolves.toEqual({ status: "ENABLED" });
    expect(tx.merchant.updateMany).toHaveBeenCalledWith({
      where: { id: "m_1", internationalPaymentsStatus: "REQUESTED" },
      data: { internationalPaymentsStatus: "ENABLED", internationalPaymentsNote: "KYC y cuenta USD verificadas" },
    });
    expect(auditLog.record).toHaveBeenCalledWith(tx, expect.objectContaining({ action: "international_payments.approve", targetType: "Merchant", targetId: "m_1" }));
  });

  it("refuses to decide a request another operator already resolved (updateMany matched zero rows)", async () => {
    const { service, tx, auditLog } = setup({ internationalPaymentsStatus: "REQUESTED" }, 6.96, 0);
    await expect(service.decide("m_1", "approve", "motivo largo", actor)).rejects.toBeInstanceOf(ConflictException);
    expect(tx.merchant.updateMany).toHaveBeenCalledWith({
      where: { id: "m_1", internationalPaymentsStatus: "REQUESTED" },
      data: { internationalPaymentsStatus: "ENABLED", internationalPaymentsNote: "motivo largo" },
    });
    expect(auditLog.record).not.toHaveBeenCalled();
  });

  it("is available for an intent only when enabled and a rate exists", async () => {
    await expect(setup({ internationalPaymentsStatus: "ENABLED" }).service.availableForIntent({ merchantId: "m_1" })).resolves.toBe(true);
    await expect(setup({ internationalPaymentsStatus: "ENABLED" }, 0).service.availableForIntent({ merchantId: "m_1" })).resolves.toBe(false);
    await expect(setup({ internationalPaymentsStatus: "REQUESTED" }).service.availableForIntent({ merchantId: "m_1" })).resolves.toBe(false);
  });

  it("quotes USD and lists methods, caching per country", async () => {
    const { service, client } = setup({ internationalPaymentsStatus: "ENABLED" });
    const intent = { merchantId: "m_1", amount: 70000, currency: "BOB", metadata: {} };
    const first = await service.methodsForIntent(intent, "BR");
    await service.methodsForIntent(intent, "BR");
    expect(client.listPaymentMethods).toHaveBeenCalledTimes(1);
    expect(first).toEqual({
      country: "BR",
      quote: { amount: 10058, currency: "USD", originalAmount: 70000, originalCurrency: "BOB", rate: 6.96 },
      methods: [
        { id: "CARD", kind: "CARD", name: "Tarjeta", logo: "c.png" },
        { id: "PX", kind: "LOCAL_METHOD", name: "Pix", logo: null },
      ],
    });
  });
});
