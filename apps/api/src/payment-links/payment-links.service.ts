import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PaymentLinkStatus, Prisma } from "@prisma/client";
import { customAlphabet } from "nanoid";
import { PrismaService } from "../prisma/prisma.service";
import { UploadsService } from "../uploads/uploads.service";
import { CreatePaymentLinkDto } from "./dto/create-payment-link.dto";
import { UpdatePaymentLinkDto } from "./dto/update-payment-link.dto";
import { ImportInventoryDto } from "./dto/import-inventory.dto";
import { SiatCatalogService } from "../invoicing/siat-catalog.service";

const variantIdPart = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 12);
const extraIdPart = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 12);
type ProductVariant = { id: string; name: string; amount: number; stock?: number | null };
type ProductExtra = {
  id: string;
  name: string;
  amount: number;
  required: boolean;
  groupName?: string;
  freeAllowance?: number;
  inventoryKey?: string;
  inventoryName?: string;
  stock?: number;
};
const DEFAULT_IMAGE_POSITION = "50% 50%";
const IMAGE_POSITION_PATTERN = /^(?:0|[1-9]\d?|100)% (?:0|[1-9]\d?|100)%$/;

@Injectable()
export class PaymentLinksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uploads: UploadsService,
    private readonly siatCatalogs: SiatCatalogService,
  ) {}

  private async validateFiscalMapping(
    merchantId: string,
    mapping: {
      codigoProducto?: string | null;
      actividadEconomica?: string | null;
      codigoProductoSin?: string | null;
      unidadMedida?: number | null;
    },
  ): Promise<void> {
    const values = [mapping.codigoProducto, mapping.actividadEconomica, mapping.codigoProductoSin, mapping.unidadMedida];
    if (values.every((value) => value === undefined || value === null)) return;
    if (values.some((value) => value === undefined || value === null || value === "")) {
      throw new BadRequestException(
        "codigoProducto, actividadEconomica, codigoProductoSin, and unidadMedida must be configured together",
      );
    }
    await this.siatCatalogs.assertProductClassification(merchantId, {
      actividadEconomica: mapping.actividadEconomica!,
      codigoProductoSin: mapping.codigoProductoSin!,
      unidadMedida: mapping.unidadMedida!,
    });
  }

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
        ((entry as Record<string, unknown>).amount as number) >= 0 &&
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

  private readExtras(value: Prisma.JsonValue | undefined): ProductExtra[] {
    if (!Array.isArray(value)) return [];
    return value.filter(
      (entry): entry is ProductExtra =>
        !!entry &&
        typeof entry === "object" &&
        !Array.isArray(entry) &&
        typeof (entry as Record<string, unknown>).id === "string" &&
        typeof (entry as Record<string, unknown>).name === "string" &&
        Number.isInteger((entry as Record<string, unknown>).amount) &&
        ((entry as Record<string, unknown>).amount as number) >= 0 &&
        typeof (entry as Record<string, unknown>).required === "boolean" &&
        (!("groupName" in entry) || typeof (entry as Record<string, unknown>).groupName === "string") &&
        (!("freeAllowance" in entry) || (Number.isInteger((entry as Record<string, unknown>).freeAllowance) && ((entry as Record<string, unknown>).freeAllowance as number) >= 0)) &&
        (!("inventoryKey" in entry) || typeof (entry as Record<string, unknown>).inventoryKey === "string") &&
        (!("inventoryName" in entry) || typeof (entry as Record<string, unknown>).inventoryName === "string") &&
        (!("stock" in entry) || (Number.isInteger((entry as Record<string, unknown>).stock) && ((entry as Record<string, unknown>).stock as number) >= 0)),
    );
  }

  /** Keep focus metadata aligned with its gallery even when an API client
   * updates just one of the two arrays. */
  private normalizeImagePositions(imageUrls: string[], positions?: string[]): string[] {
    return imageUrls.map((_, index) => {
      const position = positions?.[index];
      return position && IMAGE_POSITION_PATTERN.test(position) ? position : DEFAULT_IMAGE_POSITION;
    });
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

  private normalizeExtras(extras: CreatePaymentLinkDto["extras"], existing: ProductExtra[] | null = null): ProductExtra[] {
    if (!extras?.length) return [];
    const existingIds = new Set((existing ?? []).map((extra) => extra.id));
    const names = new Set<string>();
    const inventoryKeys = new Set<string>();
    const groupAllowances = new Map<string, number>();
    return extras.map((extra) => {
      const name = extra.name.trim();
      const nameKey = name.toLocaleLowerCase("es");
      if (!name) throw new BadRequestException("Cada extra necesita un nombre");
      if (names.has(nameKey)) throw new BadRequestException(`El extra "${name}" está repetido`);
      names.add(nameKey);
      if (existing !== null && extra.id && !existingIds.has(extra.id)) {
        throw new BadRequestException("Un extra del producto ya no existe");
      }
      const inventoryName = extra.inventoryName?.trim().replace(/\s+/g, " ");
      const groupName = extra.groupName?.trim().replace(/\s+/g, " ");
      const freeAllowance = groupName ? (extra.freeAllowance ?? 0) : 0;
      if (!groupName && (extra.freeAllowance ?? 0) > 0) {
        throw new BadRequestException(`La cortesía de "${name}" necesita un nombre de grupo`);
      }
      if (groupName) {
        const groupKey = groupName.normalize("NFKC").toLocaleLowerCase("es");
        const existingAllowance = groupAllowances.get(groupKey);
        if (existingAllowance !== undefined && existingAllowance !== freeAllowance) {
          throw new BadRequestException(`Todos los extras de "${groupName}" deben usar la misma cantidad gratis`);
        }
        groupAllowances.set(groupKey, freeAllowance);
      }
      if (!inventoryName && extra.stock !== undefined) {
        throw new BadRequestException(`El stock compartido de "${name}" necesita un nombre de inventario`);
      }
      if (inventoryName && extra.stock === undefined) {
        throw new BadRequestException(`Ingresa el stock compartido para "${inventoryName}"`);
      }
      const inventoryKey = inventoryName?.normalize("NFKC").toLocaleLowerCase("es");
      if (inventoryKey && inventoryKeys.has(inventoryKey)) {
        throw new BadRequestException(`El inventario "${inventoryName}" no puede repetirse dentro del mismo producto`);
      }
      if (inventoryKey) inventoryKeys.add(inventoryKey);
      return {
        id: existing !== null && extra.id ? extra.id : `ext_${extraIdPart()}`,
        name,
        amount: extra.amount,
        required: extra.required === true,
        ...(groupName ? { groupName, freeAllowance } : {}),
        ...(inventoryName ? {
          inventoryKey,
          inventoryName,
          stock: extra.stock,
        } : {}),
      };
    });
  }

  /** A named extra inventory is store-scoped. Updating it on any product
   * replenishes or corrects every product that references the same pool. */
  private async syncSharedExtraInventory(storeId: string, extras: ProductExtra[]): Promise<void> {
    const pools = new Map(extras.filter((extra) => extra.inventoryKey).map((extra) => [extra.inventoryKey!, extra]));
    if (!pools.size) return;
    for (const [inventoryKey, pool] of pools) {
      // Update only the matching JSON objects in PostgreSQL. A read/modify/write
      // loop could otherwise overwrite an unrelated product edit made between
      // the read and write.
      await this.prisma.$executeRaw`
        UPDATE "PaymentLink"
        SET "extras" = (
          SELECT jsonb_agg(
            CASE
              WHEN extra_value ->> 'inventoryKey' = ${inventoryKey}
              THEN jsonb_set(
                jsonb_set(extra_value, '{inventoryName}', to_jsonb(${pool.inventoryName!}::text), true),
                '{stock}', to_jsonb(${pool.stock!}::int), true
              )
              ELSE extra_value
            END
            ORDER BY ordinal
          )
          FROM jsonb_array_elements("extras") WITH ORDINALITY AS extra_rows(extra_value, ordinal)
        )
        WHERE "storeId" = ${storeId}
          AND EXISTS (
            SELECT 1 FROM jsonb_array_elements("extras") AS extra_rows(extra_value)
            WHERE extra_value ->> 'inventoryKey' = ${inventoryKey}
          )
      `;
    }
  }

  async create(merchantId: string, storeId: string, dto: CreatePaymentLinkDto) {
    await this.ownedStoreOrThrow(merchantId, storeId);
    if (dto.categoryId) await this.ownedCategoryOrThrow(storeId, dto.categoryId);
    await this.validateFiscalMapping(merchantId, dto);
    const variants = this.normalizeVariants(dto.variants);
    const extras = this.normalizeExtras(dto.extras);
    const created = await this.prisma.paymentLink.create({
      data: {
        storeId,
        categoryId: dto.categoryId,
        name: dto.name,
        description: dto.description,
        imageUrls: dto.imageUrls ?? [],
        imagePositions: this.normalizeImagePositions(dto.imageUrls ?? [], dto.imagePositions),
        tags: dto.tags ?? [],
        stock: variants.length ? this.totalVariantStock(variants) : dto.stock,
        color: dto.color,
        variants: variants as unknown as Prisma.InputJsonValue,
        extras: extras as unknown as Prisma.InputJsonValue,
        // `amount` remains the sortable/fallback product price. With options,
        // keep it aligned to the lowest customer-selectable price.
        amount: variants.length ? Math.min(...variants.map((variant) => variant.amount)) : dto.amount,
        currency: dto.currency ?? "BOB",
        codigoProducto: dto.codigoProducto,
        actividadEconomica: dto.actividadEconomica,
        codigoProductoSin: dto.codigoProductoSin,
        unidadMedida: dto.unidadMedida,
      },
    });
    await this.syncSharedExtraInventory(storeId, extras);
    return created;
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

    const result = await this.prisma.$transaction(async (tx) => {
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
        await this.validateFiscalMapping(merchantId, product);
        const variants = this.normalizeVariants(product.variants);
        const extras = this.normalizeExtras(product.extras);
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
              imagePositions: this.normalizeImagePositions(product.imageUrls ?? [], product.imagePositions),
              tags: product.tags ?? [],
              stock: variants.length ? this.totalVariantStock(variants) : product.stock,
              color: product.color,
              variants: variants as unknown as Prisma.InputJsonValue,
              extras: extras as unknown as Prisma.InputJsonValue,
              amount: variants.length ? Math.min(...variants.map((variant) => variant.amount)) : product.amount,
              currency: product.currency ?? "BOB",
              codigoProducto: product.codigoProducto,
              actividadEconomica: product.actividadEconomica,
              codigoProductoSin: product.codigoProductoSin,
              unidadMedida: product.unidadMedida,
            },
          }),
        );
      }

      return { products, categoriesCreated };
    });
    await this.syncSharedExtraInventory(storeId, result.products.flatMap((product) => this.readExtras(product.extras)));
    return result;
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
    await this.validateFiscalMapping(merchantId, {
      codigoProducto: dto.codigoProducto ?? link.codigoProducto,
      actividadEconomica: dto.actividadEconomica ?? link.actividadEconomica,
      codigoProductoSin: dto.codigoProductoSin ?? link.codigoProductoSin,
      unidadMedida: dto.unidadMedida ?? link.unidadMedida,
    });
    const variants = dto.variants !== undefined ? this.normalizeVariants(dto.variants, this.readVariants(link.variants)) : undefined;
    const extras = dto.extras !== undefined ? this.normalizeExtras(dto.extras, this.readExtras(link.extras)) : undefined;
    const imagePositions = dto.imageUrls !== undefined || dto.imagePositions !== undefined
      ? this.normalizeImagePositions(dto.imageUrls ?? link.imageUrls, dto.imagePositions ?? link.imagePositions)
      : undefined;
    if (variants?.some((variant) => variant.stock === undefined) && variants.some((variant) => variant.stock !== undefined)) {
      throw new BadRequestException("Asigna stock a todas las opciones para dejar de usar el stock compartido");
    }
    // Explicit-field spread, not `{...dto}` — an edit call that omits a field (e.g. no
    // new photo) must leave it untouched, not clobber it to undefined.
    const updated = await this.prisma.paymentLink.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.imageUrls !== undefined && { imageUrls: dto.imageUrls }),
        ...(imagePositions !== undefined && { imagePositions }),
        ...(dto.tags !== undefined && { tags: dto.tags }),
        ...(variants !== undefined && variants.length > 0 && variants.every((variant) => variant.stock !== undefined)
          ? { stock: this.totalVariantStock(variants) }
          : dto.stock !== undefined
            ? { stock: dto.stock }
            : {}),
        ...(dto.categoryId !== undefined && { categoryId: dto.categoryId }),
        ...(dto.color !== undefined && { color: dto.color }),
        ...(variants !== undefined && { variants: variants as unknown as Prisma.InputJsonValue }),
        ...(extras !== undefined && { extras: extras as unknown as Prisma.InputJsonValue }),
        ...(variants !== undefined && variants.length > 0
          ? { amount: Math.min(...variants.map((variant) => variant.amount)) }
          : dto.amount !== undefined
            ? { amount: dto.amount }
            : {}),
        ...(dto.currency !== undefined && { currency: dto.currency }),
        ...(dto.codigoProducto !== undefined && { codigoProducto: dto.codigoProducto }),
        ...(dto.actividadEconomica !== undefined && { actividadEconomica: dto.actividadEconomica }),
        ...(dto.codigoProductoSin !== undefined && { codigoProductoSin: dto.codigoProductoSin }),
        ...(dto.unidadMedida !== undefined && { unidadMedida: dto.unidadMedida }),
      },
    });
    if (extras) await this.syncSharedExtraInventory(storeId, extras);
    return updated;
  }
}
