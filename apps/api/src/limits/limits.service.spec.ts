import { ForbiddenException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { LimitsService, laPazMonth } from "./limits.service";

const policies = [
  { level: 0, name: "Sin verificar", liveEnabled: false, monthlyLimit: null, perPaymentLimit: null },
  { level: 1, name: "Persona", liveEnabled: true, monthlyLimit: 1_000_000, perPaymentLimit: 200_000 },
  { level: 3, name: "Empresa", liveEnabled: true, monthlyLimit: null, perPaymentLimit: null },
];

function setup(merchant: Record<string, unknown> = { id: "m_1", level: 1, monthlyLimitOverride: null, perPaymentLimitOverride: null }, updated = 1) {
  const tx = {
    merchantMonthlyVolume: {
      upsert: jest.fn().mockResolvedValue({}),
      findUniqueOrThrow: jest.fn().mockResolvedValue({ reserved: 850_000, settled: 0, warnedAt: null }),
      update: jest.fn(),
    },
    $executeRaw: jest.fn().mockResolvedValue(updated),
    paymentIntent: { update: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 1 }), findUnique: jest.fn() },
  };
  const prisma = {
    merchant: { findUniqueOrThrow: jest.fn().mockResolvedValue(merchant) },
    merchantLevelPolicy: { findUnique: jest.fn(({ where }) => Promise.resolve(policies.find((p) => p.level === where.level) ?? null)) },
    limitSettings: { findUnique: jest.fn().mockResolvedValue({ usdToBobRate: new Prisma.Decimal("6.96") }) },
    merchantMonthlyVolume: { findUnique: jest.fn().mockResolvedValue(null) },
    supportCase: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: "c1" }) },
  };
  return { tx, prisma, service: new LimitsService(prisma as any) };
}

const intent = (over: Record<string, unknown> = {}) => ({ id: "pi_1", merchantId: "m_1", amount: 100_000, currency: "BOB", metadata: {}, livemode: true, limitStatus: null, ...over });

describe("laPazMonth", () => {
  it("uses La Paz time at the month boundary", () => {
    expect(laPazMonth(new Date("2026-10-01T03:59:00Z"))).toBe("2026-09");
    expect(laPazMonth(new Date("2026-10-01T04:00:00Z"))).toBe("2026-10");
  });
});

describe("LimitsService.effectiveLimits", () => {
  it("prefers merchant overrides", async () => {
    const { service } = setup({ id: "m_1", level: 1, monthlyLimitOverride: 5_000_000, perPaymentLimitOverride: null });
    await expect(service.effectiveLimits("m_1")).resolves.toMatchObject({ monthlyLimit: 5_000_000, perPaymentLimit: 200_000, misconfigured: false });
  });

  it("fails closed and opens one ops case when a live level has no limit", async () => {
    const { service, prisma } = setup({ id: "m_1", level: 3, monthlyLimitOverride: null, perPaymentLimitOverride: null });
    await expect(service.effectiveLimits("m_1")).resolves.toMatchObject({ liveEnabled: false, misconfigured: true });
    expect(prisma.supportCase.create).toHaveBeenCalledTimes(1);
  });
});

describe("LimitsService.amountInBob", () => {
  it("counts an international charge at its original BOB amount", async () => {
    const { service } = setup();
    await expect(service.amountInBob(intent({ amount: 1_437, currency: "USD", metadata: { fx: { originalAmount: 10_000, originalCurrency: "BOB", rate: 6.96 } } })))
      .resolves.toEqual({ amountBob: 10_000, fxRate: null });
  });

  it("converts a USD-priced intent at the ops rate, rounding up", async () => {
    const { service } = setup();
    const result = await service.amountInBob(intent({ amount: 1_000, currency: "USD" }));
    expect(result.amountBob).toBe(6_960);
    expect(result.fxRate?.toString()).toBe("6.96");
  });

  it("refuses other currencies", async () => {
    const { service } = setup();
    await expect(service.amountInBob(intent({ currency: "EUR" }))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("refuses a negative fx.originalAmount", async () => {
    const { service } = setup();
    await expect(
      service.amountInBob(intent({ amount: 1_437, currency: "USD", metadata: { fx: { originalAmount: -10_000, originalCurrency: "BOB", rate: 6.96 } } })),
    ).rejects.toMatchObject({ response: { code: "limit_exceeded" } });
  });

  it("refuses a fractional fx.originalAmount", async () => {
    const { service } = setup();
    await expect(
      service.amountInBob(intent({ amount: 1_437, currency: "USD", metadata: { fx: { originalAmount: 10_000.5, originalCurrency: "BOB", rate: 6.96 } } })),
    ).rejects.toMatchObject({ response: { code: "limit_exceeded" } });
  });
});

describe("LimitsService.assertPerPayment", () => {
  it("allows exactly the maximum and refuses one centavo more", async () => {
    const { service } = setup();
    await expect(service.assertPerPayment("m_1", intent({ amount: 200_000 }), "buyer")).resolves.toBeUndefined();
    await expect(service.assertPerPayment("m_1", intent({ amount: 200_001 }), "merchant"))
      .rejects.toMatchObject({ response: { code: "per_payment_limit_exceeded", message: "Este cobro supera el máximo por pago de tu nivel." } });
  });

  it("shows buyers the neutral message", async () => {
    const { service } = setup();
    await expect(service.assertPerPayment("m_1", intent({ amount: 200_001 }), "buyer"))
      .rejects.toMatchObject({ response: { code: "per_payment_limit_exceeded", message: "Este comercio no puede recibir pagos en este momento." } });
  });
});

describe("LimitsService.reserve", () => {
  const now = new Date("2026-09-15T12:00:00Z");

  it("never touches TEST payments", async () => {
    const { service, tx } = setup();
    await service.reserve(tx as any, intent({ livemode: false }), now);
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it("makes no $executeRaw call for a zero-amount intent", async () => {
    const { service, tx } = setup();
    await service.reserve(tx as any, intent({ amount: 0 }), now);
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it("does not reserve twice for a retried confirm", async () => {
    const { service, tx } = setup();
    await service.reserve(tx as any, intent({ limitStatus: "RESERVED" }), now);
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it("reserves again after a failed attempt released", async () => {
    const { service, tx } = setup();
    await service.reserve(tx as any, intent({ limitStatus: "RELEASED" }), now);
    expect(tx.$executeRaw).toHaveBeenCalledTimes(2); // row insert + conditional reserve
  });

  it("refuses with limit_exceeded when the conditional update matches nothing", async () => {
    const { service, tx } = setup(undefined, 0); // both raw statements report 0 rows
    await expect(service.reserve(tx as any, intent(), now))
      .rejects.toMatchObject({ response: { code: "limit_exceeded", message: "Este comercio no puede recibir pagos en este momento." } });
    expect(tx.paymentIntent.update).not.toHaveBeenCalled();
  });

  it("records the month and amount and reports crossing 80% once", async () => {
    const { service, tx } = setup();
    await expect(service.reserve(tx as any, intent(), now)).resolves.toEqual({ crossedWarning: true });
    expect(tx.paymentIntent.update).toHaveBeenCalledWith({ where: { id: "pi_1" }, data: { limitMonth: "2026-09", limitAmountBob: 100_000, limitFxRate: null, limitStatus: "RESERVED" } });
    expect(tx.merchantMonthlyVolume.update).toHaveBeenCalledWith({ where: { merchantId_month: { merchantId: "m_1", month: "2026-09" } }, data: { warnedAt: now } });
  });
});

describe("LimitsService.settle/release", () => {
  it("moves the amount only while the intent is still RESERVED", async () => {
    const { service, tx } = setup();
    tx.paymentIntent.findUnique.mockResolvedValue({ merchantId: "m_1", limitMonth: "2026-09", limitAmountBob: 100_000, limitStatus: "RESERVED" });
    await service.settle(tx as any, "pi_1");
    expect(tx.paymentIntent.updateMany).toHaveBeenCalledWith({ where: { id: "pi_1", limitStatus: "RESERVED" }, data: { limitStatus: "SETTLED" } });
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);

    tx.paymentIntent.updateMany.mockResolvedValue({ count: 0 });
    await service.release(tx as any, "pi_1");
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it("does nothing for an intent that was never reserved", async () => {
    const { service, tx } = setup();
    tx.paymentIntent.findUnique.mockResolvedValue({ merchantId: "m_1", limitMonth: null, limitAmountBob: null, limitStatus: null });
    await service.release(tx as any, "pi_1");
    expect(tx.paymentIntent.updateMany).not.toHaveBeenCalled();
  });
});
