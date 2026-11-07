import { BadRequestException, ConflictException } from "@nestjs/common";
import { InternationalPaymentsService } from "./international-payments.service";

function setup(merchant: Record<string, unknown> = {}, rate = 6.96, updateManyCount = 1, env: { environment?: string; enabled?: boolean; international?: boolean } = {}) {
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
  const dlocal = { bobPerUsd: rate, intlFeeBps: 590, costBps: 0, enabled: env.enabled ?? false, internationalPaymentsEnabled: env.international ?? true };
  const config = { get: jest.fn((key: string) => (key === "app.environment" ? env.environment ?? "development" : dlocal)) };
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

  it("is never available in production while dLocal runs on fixtures", async () => {
    await expect(setup({ internationalPaymentsStatus: "ENABLED" }, 6.96, 1, { environment: "production", enabled: false }).service.availableForIntent({ merchantId: "m_1" })).resolves.toBe(false);
    await expect(setup({ internationalPaymentsStatus: "ENABLED" }, 6.96, 1, { environment: "production", enabled: true }).service.availableForIntent({ merchantId: "m_1" })).resolves.toBe(true);
    await expect(setup({ internationalPaymentsStatus: "ENABLED" }, 6.96, 1, { environment: "development", enabled: false }).service.availableForIntent({ merchantId: "m_1" })).resolves.toBe(true);
  });

  describe("while international payments are switched off", () => {
    const off = (merchant: Record<string, unknown>) => setup(merchant, 6.96, 1, { environment: "production", enabled: true, international: false });

    it("is never available for an intent, even with dLocal live and the merchant approved", async () => {
      await expect(off({ internationalPaymentsStatus: "ENABLED" }).service.availableForIntent({ merchantId: "m_1" })).resolves.toBe(false);
    });

    it("refuses a merchant's request and says so", async () => {
      const { service, prisma } = off({});
      await expect(service.request("m_1")).rejects.toThrow("Los pagos internacionales no están disponibles por ahora.");
      expect(prisma.merchant.update).not.toHaveBeenCalled();
    });

    it("refuses to approve a request but still lets ops reject one", async () => {
      const { service, tx } = off({ internationalPaymentsStatus: "REQUESTED" });
      await expect(service.decide("m_1", "approve", "motivo largo", actor)).rejects.toThrow("Los pagos internacionales están desactivados.");
      await expect(service.decide("m_1", "reject", "motivo largo", actor)).resolves.toEqual({ status: "REJECTED" });
      expect(tx.merchant.updateMany).toHaveBeenCalledTimes(1);
    });

    it("tells ops the feature is switched off", () => {
      expect(off({}).service.availability()).toEqual({ available: false });
      expect(setup({}).service.availability()).toEqual({ available: true });
    });

    it("tells the dashboard the feature is unavailable", async () => {
      await expect(off({}).service.statusFor("m_1")).resolves.toEqual(expect.objectContaining({ available: false }));
      await expect(setup({}).service.statusFor("m_1")).resolves.toEqual(expect.objectContaining({ available: true }));
    });
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
