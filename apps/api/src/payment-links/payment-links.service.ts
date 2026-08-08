import { Injectable, NotFoundException } from "@nestjs/common";
import { PaymentLinkStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { UploadsService } from "../uploads/uploads.service";
import { CreatePaymentLinkDto } from "./dto/create-payment-link.dto";
import { UpdatePaymentLinkDto } from "./dto/update-payment-link.dto";

@Injectable()
export class PaymentLinksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uploads: UploadsService,
  ) {}

  /** Every mutation here is scoped to a store the caller owns — never trust a bare storeId. */
  private async ownedStoreOrThrow(merchantId: string, storeId: string) {
    const store = await this.prisma.store.findFirst({ where: { id: storeId, merchantId } });
    if (!store) throw new NotFoundException("Store not found");
    return store;
  }

  /** A categoryId must belong to the same store — otherwise a merchant could
   * point a product at another store's (or another merchant's) category. */
  private async ownedCategoryOrThrow(storeId: string, categoryId: string) {
    const category = await this.prisma.category.findFirst({ where: { id: categoryId, storeId } });
    if (!category) throw new NotFoundException("Category not found");
  }

  async create(merchantId: string, storeId: string, dto: CreatePaymentLinkDto) {
    await this.ownedStoreOrThrow(merchantId, storeId);
    if (dto.categoryId) await this.ownedCategoryOrThrow(storeId, dto.categoryId);
    return this.prisma.paymentLink.create({
      data: {
        storeId,
        categoryId: dto.categoryId,
        name: dto.name,
        description: dto.description,
        imageUrls: dto.imageUrls ?? [],
        tags: dto.tags ?? [],
        stock: dto.stock,
        color: dto.color,
        amount: dto.amount,
        currency: dto.currency ?? "BOB",
      },
    });
  }

  async listForStore(merchantId: string, storeId: string) {
    await this.ownedStoreOrThrow(merchantId, storeId);
    return this.prisma.paymentLink.findMany({ where: { storeId }, orderBy: { createdAt: "desc" } });
  }

  async archive(merchantId: string, storeId: string, id: string) {
    await this.ownedStoreOrThrow(merchantId, storeId);
    const link = await this.prisma.paymentLink.findFirst({ where: { id, storeId } });
    if (!link) throw new NotFoundException("Payment link not found");
    return this.prisma.paymentLink.update({ where: { id }, data: { status: PaymentLinkStatus.ARCHIVED } });
  }

  /** Hard delete — unlike archive(), this is not reversible. Safe to call on a product
   * that already has payments against it: PaymentIntents reference their cart lines by
   * value (JSON metadata snapshot at checkout time), not a live FK, so past payment
   * records are untouched. */
  async remove(merchantId: string, storeId: string, id: string) {
    await this.ownedStoreOrThrow(merchantId, storeId);
    const link = await this.prisma.paymentLink.findFirst({ where: { id, storeId } });
    if (!link) throw new NotFoundException("Payment link not found");
    await this.prisma.paymentLink.delete({ where: { id } });
    await this.uploads.deleteFiles(link.imageUrls);
    return { success: true };
  }

  async update(merchantId: string, storeId: string, id: string, dto: UpdatePaymentLinkDto) {
    await this.ownedStoreOrThrow(merchantId, storeId);
    const link = await this.prisma.paymentLink.findFirst({ where: { id, storeId } });
    if (!link) throw new NotFoundException("Payment link not found");
    if (dto.categoryId) await this.ownedCategoryOrThrow(storeId, dto.categoryId);
    // Explicit-field spread, not `{...dto}` — an edit call that omits a field (e.g. no
    // new photo) must leave it untouched, not clobber it to undefined.
    return this.prisma.paymentLink.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.imageUrls !== undefined && { imageUrls: dto.imageUrls }),
        ...(dto.tags !== undefined && { tags: dto.tags }),
        ...(dto.stock !== undefined && { stock: dto.stock }),
        ...(dto.categoryId !== undefined && { categoryId: dto.categoryId }),
        ...(dto.color !== undefined && { color: dto.color }),
        ...(dto.amount !== undefined && { amount: dto.amount }),
        ...(dto.currency !== undefined && { currency: dto.currency }),
      },
    });
  }
}
