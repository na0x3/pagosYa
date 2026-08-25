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
});
