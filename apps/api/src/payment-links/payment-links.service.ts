import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PaymentLinkStatus, Prisma } from "@prisma/client";
import { customAlphabet } from "nanoid";
import { PrismaService } from "../prisma/prisma.service";
import { UploadsService } from "../uploads/uploads.service";
import { CreatePaymentLinkDto } from "./dto/create-payment-link.dto";
import { UpdatePaymentLinkDto } from "./dto/update-payment-link.dto";
import { ImportInventoryDto } from "./dto/import-inventory.dto";

const variantIdPart = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 12);
type ProductVariant = { id: string; name: string; amount: number; stock?: number | null };

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

  private readVariants(value: Prisma.JsonValue | undefined): ProductVariant[] {
    if (!Array.isArray(value)) return [];
    return value.filter(
      (entry): entry is ProductVariant =>
        !!entry &&
        typeof entry === "object" &&
        !Array.isArray(entry) &&
        typeof (entry as Record<string, unknown>).id === "string" &&
        typeof (entry as Record<string, unknown>).name === "string" &&
        Number.isInteger((entry as Record<string, unknown>).amount) &&
        ((entry as Record<string, unknown>).amount as number) > 0 &&
        (!("stock" in entry) ||
          (entry as Record<string, unknown>).stock === null ||
          (Number.isInteger((entry as Record<string, unknown>).stock) &&
            ((entry as Record<string, unknown>).stock as number) >= 0)),
    );
  }

  private totalVariantStock(variants: ProductVariant[]): number | null {
    if (variants.some((variant) => variant.stock === null || variant.stock === undefined)) return null;
    return variants.reduce((sum, variant) => sum + variant.stock!, 0);
  }

  private normalizeVariants(
    variants: CreatePaymentLinkDto["variants"],
    existing: ProductVariant[] | null = null,
  ): ProductVariant[] {
    if (!variants?.length) return [];
    if (variants.length < 2) throw new BadRequestException("Agrega por lo menos 2 opciones o elimina las opciones del producto");
    const existingIds = new Set((existing ?? []).map((variant) => variant.id));
    const names = new Set<string>();
    return variants.map((variant) => {
      const name = variant.name.trim();
      const nameKey = name.toLocaleLowerCase("es");
      if (!name) throw new BadRequestException("Cada opción necesita un nombre");
      if (names.has(nameKey)) throw new BadRequestException(`La opción "${name}" está repetida`);
      names.add(nameKey);

      if (existing !== null && variant.id && !existingIds.has(variant.id)) {
        throw new BadRequestException("Una opción del producto ya no existe");
      }
      const normalized: ProductVariant = {
        id: existing !== null && variant.id ? variant.id : `var_${variantIdPart()}`,
        name,
        amount: variant.amount,
      };
      // Missing stock is a legacy shared-inventory marker. Keep that
      // distinction on edits so merely renaming an old option cannot turn a
      // finite product into an unlimited one. New options send null explicitly
      // when the merchant chooses unlimited stock.
      if (existing === null || "stock" in variant) {
        normalized.stock = variant.stock ?? null;
      } else {
        const existingVariant = existing.find((candidate) => candidate.id === variant.id);
        if (existingVariant && "stock" in existingVariant) normalized.stock = existingVariant.stock;
      }
      return normalized;
    });
  }

  async create(merchantId: string, storeId: string, dto: CreatePaymentLinkDto) {
    await this.ownedStoreOrThrow(merchantId, storeId);
    if (dto.categoryId) await this.ownedCategoryOrThrow(storeId, dto.categoryId);
    const variants = this.normalizeVariants(dto.variants);
    return this.prisma.paymentLink.create({
      data: {
        storeId,
        categoryId: dto.categoryId,
        name: dto.name,
        description: dto.description,
        imageUrls: dto.imageUrls ?? [],
        tags: dto.tags ?? [],
        stock: variants.length ? this.totalVariantStock(variants) : dto.stock,
        color: dto.color,
        variants: variants as unknown as Prisma.InputJsonValue,
        // `amount` remains the sortable/fallback product price. With options,
        // keep it aligned to the lowest customer-selectable price.
        amount: variants.length ? Math.min(...variants.map((variant) => variant.amount)) : dto.amount,
        currency: dto.currency ?? "BOB",
      },
    });
  }

  async listForStore(merchantId: string, storeId: string) {
    await this.ownedStoreOrThrow(merchantId, storeId);
    return this.prisma.paymentLink.findMany({ where: { storeId }, orderBy: { createdAt: "desc" } });
  }

  async importInventory(merchantId: string, storeId: string, dto: ImportInventoryDto) {
    await this.ownedStoreOrThrow(merchantId, storeId);
    const existingCategories = await this.prisma.category.findMany({ where: { storeId }, orderBy: { sortOrder: "asc" } });
    const categoryKey = (name: string) => name.trim().toLocaleLowerCase("es");
    const requestedCategoryNames = new Map<string, string>();
    for (const product of dto.products) {
      const name = product.categoryName?.trim();
      if (name) requestedCategoryNames.set(categoryKey(name), name);
    }

    return this.prisma.$transaction(async (tx) => {
      const categoriesByName = new Map(existingCategories.map((category) => [categoryKey(category.name), category]));
      const categoriesCreated = [];
      let nextCategorySortOrder = existingCategories.length;
      for (const [key, name] of requestedCategoryNames) {
        if (categoriesByName.has(key)) continue;
        const category = await tx.category.create({
          data: { storeId, name, sortOrder: nextCategorySortOrder++ },
        });
        categoriesByName.set(key, category);
        categoriesCreated.push(category);
      }

      const products = [];
      for (const product of dto.products) {
        const variants = this.normalizeVariants(product.variants);
        const category = product.categoryName?.trim()
          ? categoriesByName.get(categoryKey(product.categoryName))
          : undefined;
        products.push(
          await tx.paymentLink.create({
            data: {
              storeId,
              categoryId: category?.id ?? null,
              name: product.name.trim(),
              description: product.description,
              imageUrls: product.imageUrls ?? [],
              tags: product.tags ?? [],
              stock: variants.length ? this.totalVariantStock(variants) : product.stock,
              color: product.color,
              variants: variants as unknown as Prisma.InputJsonValue,
              amount: variants.length ? Math.min(...variants.map((variant) => variant.amount)) : product.amount,
              currency: product.currency ?? "BOB",
            },
          }),
        );
      }

      return { products, categoriesCreated };
    });
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
    const variants = dto.variants !== undefined ? this.normalizeVariants(dto.variants, this.readVariants(link.variants)) : undefined;
    if (variants?.some((variant) => variant.stock === undefined) && variants.some((variant) => variant.stock !== undefined)) {
      throw new BadRequestException("Asigna stock a todas las opciones para dejar de usar el stock compartido");
    }
    // Explicit-field spread, not `{...dto}` — an edit call that omits a field (e.g. no
    // new photo) must leave it untouched, not clobber it to undefined.
    return this.prisma.paymentLink.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.imageUrls !== undefined && { imageUrls: dto.imageUrls }),
        ...(dto.tags !== undefined && { tags: dto.tags }),
        ...(variants !== undefined && variants.length > 0 && variants.every((variant) => variant.stock !== undefined)
          ? { stock: this.totalVariantStock(variants) }
          : dto.stock !== undefined
            ? { stock: dto.stock }
            : {}),
        ...(dto.categoryId !== undefined && { categoryId: dto.categoryId }),
        ...(dto.color !== undefined && { color: dto.color }),
        ...(variants !== undefined && { variants: variants as unknown as Prisma.InputJsonValue }),
        ...(variants !== undefined && variants.length > 0
          ? { amount: Math.min(...variants.map((variant) => variant.amount)) }
          : dto.amount !== undefined
            ? { amount: dto.amount }
            : {}),
        ...(dto.currency !== undefined && { currency: dto.currency }),
      },
    });
  }
}
