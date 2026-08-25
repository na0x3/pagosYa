import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, PromoDiscountType } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { CreatePromoCodeDto } from "./dto/create-promo-code.dto";

@Injectable()
export class PromoCodesService {
  constructor(private readonly prisma: PrismaService) {}

  private async ownedStoreOrThrow(merchantId: string, storeId: string) {
    const store = await this.prisma.store.findFirst({ where: { id: storeId, merchantId }, select: { id: true } });
    if (!store) throw new NotFoundException("Tienda no encontrada");
    return store;
  }

  async create(merchantId: string, storeId: string, dto: CreatePromoCodeDto) {
    await this.ownedStoreOrThrow(merchantId, storeId);
    if (dto.discountType === PromoDiscountType.PERCENT && dto.discountValue > 99) {
      throw new BadRequestException("El descuento porcentual debe estar entre 1% y 99%");
    }
    try {
      return await this.prisma.promoCode.create({
        data: {
          storeId,
          code: dto.code.trim().toUpperCase(),
          discountType: dto.discountType,
          discountValue: dto.discountValue,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("Ese código ya existe en esta tienda");
      }
      throw error;
    }
  }

  async list(merchantId: string, storeId: string) {
    await this.ownedStoreOrThrow(merchantId, storeId);
    return this.prisma.promoCode.findMany({ where: { storeId }, orderBy: [{ isActive: "desc" }, { createdAt: "desc" }] });
  }

  async setActive(merchantId: string, storeId: string, id: string, isActive: boolean) {
    await this.ownedStoreOrThrow(merchantId, storeId);
    const code = await this.prisma.promoCode.findFirst({ where: { id, storeId }, select: { id: true } });
    if (!code) throw new NotFoundException("Código promocional no encontrado");
    return this.prisma.promoCode.update({ where: { id }, data: { isActive } });
  }

  async resolveActiveForStore(storeId: string, rawCode: string) {
    const code = rawCode.trim().toUpperCase();
    const promo = await this.prisma.promoCode.findFirst({ where: { storeId, code, isActive: true } });
    if (!promo) throw new BadRequestException("El código no existe o está desactivado");
    return promo;
  }

  discountAmount(subtotal: number, discountType: PromoDiscountType, discountValue: number): number {
    if (subtotal <= 1) return 0;
    const requested = discountType === PromoDiscountType.PERCENT
      ? Math.floor(subtotal * discountValue / 100)
      : discountValue;
    // Integrated rails require a positive charge. A code can reduce the cart
    // to one minor unit, never create a negative or zero-value PaymentIntent.
    return Math.max(0, Math.min(requested, subtotal - 1));
  }
}
