import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { Prisma, PromoDiscountType } from "@prisma/client";
import { PromoCodesService } from "./promo-codes.service";

describe("PromoCodesService", () => {
  const makePrisma = () => ({
    store: { findFirst: jest.fn().mockResolvedValue({ id: "store_1" }) },
    promoCode: {
      create: jest.fn(), findMany: jest.fn(), findFirst: jest.fn(), update: jest.fn(),
    },
  });

  it("creates an owned, normalized percentage code", async () => {
    const prisma = makePrisma();
    prisma.promoCode.create.mockResolvedValue({ id: "promo_1", code: "VERANO20" });
    const service = new PromoCodesService(prisma as any);

    await service.create("merchant_1", "store_1", {
      code: "verano20", discountType: PromoDiscountType.PERCENT, discountValue: 20,
    });

    expect(prisma.promoCode.create).toHaveBeenCalledWith({ data: expect.objectContaining({ code: "VERANO20", discountValue: 20 }) });
  });

  it("rejects an invalid percentage and caps fixed discounts above the subtotal", async () => {
    const service = new PromoCodesService(makePrisma() as any);
    await expect(service.create("merchant_1", "store_1", {
      code: "MAL100", discountType: PromoDiscountType.PERCENT, discountValue: 100,
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(service.discountAmount(1000, PromoDiscountType.FIXED, 5000)).toBe(999);
  });

  it("does not expose another merchant's store", async () => {
    const prisma = makePrisma();
    prisma.store.findFirst.mockResolvedValue(null);
    await expect(new PromoCodesService(prisma as any).list("merchant_2", "store_1")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("turns a duplicate database key into a useful conflict", async () => {
    const prisma = makePrisma();
    prisma.promoCode.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("duplicate", { code: "P2002", clientVersion: "5" }));
    await expect(new PromoCodesService(prisma as any).create("merchant_1", "store_1", {
      code: "VERANO20", discountType: PromoDiscountType.PERCENT, discountValue: 20,
    })).rejects.toBeInstanceOf(ConflictException);
  });

  it("updates only the flags it is given, and refuses an empty change", async () => {
    const prisma = makePrisma();
    prisma.promoCode.findFirst.mockResolvedValue({ id: "promo_1" });
    const service = new PromoCodesService(prisma as any);
    await service.setFlags("merchant_1", "store_1", "promo_1", { showInEmails: true });
    expect(prisma.promoCode.update).toHaveBeenCalledWith({ where: { id: "promo_1" }, data: { showInEmails: true } });
    await expect(service.setFlags("merchant_1", "store_1", "promo_1", {})).rejects.toBeInstanceOf(BadRequestException);
  });

  it("marks a code the assistant may offer, and nothing else", async () => {
    const prisma = makePrisma();
    prisma.promoCode.findFirst.mockResolvedValue({ id: "promo_1" });
    await new PromoCodesService(prisma as any).setFlags("merchant_1", "store_1", "promo_1", { showInAssistant: true });
    expect(prisma.promoCode.update).toHaveBeenCalledWith({ where: { id: "promo_1" }, data: { showInAssistant: true } });
  });

  it("does not change another store's code", async () => {
    const prisma = makePrisma();
    prisma.promoCode.findFirst.mockResolvedValue(null);
    await expect(new PromoCodesService(prisma as any).setFlags("merchant_1", "store_1", "promo_x", { isActive: false })).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.promoCode.update).not.toHaveBeenCalled();
  });

  it("refuses a one-use winner code once a paid order used it (spec addendum 2026-11-09)", async () => {
    const prisma: any = { ...makePrisma(), store: { findFirst: jest.fn(), findUnique: jest.fn().mockResolvedValue({ merchantId: "m1" }) }, paymentIntent: { count: jest.fn().mockResolvedValue(1) } };
    prisma.promoCode.findFirst.mockResolvedValue({ id: "p1", storeId: "store_1", code: "RULETA15-K7QM2X", maxUses: 1, isActive: true });
    const service = new PromoCodesService(prisma);
    await expect(service.resolveActiveForStore("store_1", "ruleta15-k7qm2x")).rejects.toThrow("Este código ya se usó");
    expect(prisma.paymentIntent.count).toHaveBeenCalledWith({ where: { merchantId: "m1", status: "SUCCEEDED", metadata: { path: ["promoCode"], equals: "RULETA15-K7QM2X" } } });
    prisma.paymentIntent.count.mockResolvedValue(0);
    await expect(service.resolveActiveForStore("store_1", "RULETA15-K7QM2X")).resolves.toMatchObject({ code: "RULETA15-K7QM2X" });
    prisma.promoCode.findFirst.mockResolvedValue({ id: "p2", storeId: "store_1", code: "VERANO20", maxUses: null, isActive: true });
    prisma.paymentIntent.count.mockClear();
    await expect(service.resolveActiveForStore("store_1", "VERANO20")).resolves.toMatchObject({ code: "VERANO20" });
    expect(prisma.paymentIntent.count).not.toHaveBeenCalled();
  });
});
