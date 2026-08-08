import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreateCategoryDto } from "./dto/create-category.dto";
import { UpdateCategoryDto } from "./dto/update-category.dto";

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Every mutation here is scoped to a store the caller owns — never trust a bare storeId. */
  private async ownedStoreOrThrow(merchantId: string, storeId: string) {
    const store = await this.prisma.store.findFirst({ where: { id: storeId, merchantId } });
    if (!store) throw new NotFoundException("Store not found");
    return store;
  }

  async create(merchantId: string, storeId: string, dto: CreateCategoryDto) {
    await this.ownedStoreOrThrow(merchantId, storeId);
    let sortOrder = dto.sortOrder;
    if (sortOrder === undefined) {
      // Default to the end of the list, not 0 — otherwise every new category
      // would jump to the front, ahead of ones the merchant already ordered.
      const count = await this.prisma.category.count({ where: { storeId } });
      sortOrder = count;
    }
    return this.prisma.category.create({ data: { storeId, name: dto.name, sortOrder } });
  }

  async listForStore(merchantId: string, storeId: string) {
    await this.ownedStoreOrThrow(merchantId, storeId);
    return this.prisma.category.findMany({ where: { storeId }, orderBy: { sortOrder: "asc" } });
  }

  async update(merchantId: string, storeId: string, id: string, dto: UpdateCategoryDto) {
    await this.ownedStoreOrThrow(merchantId, storeId);
    const category = await this.prisma.category.findFirst({ where: { id, storeId } });
    if (!category) throw new NotFoundException("Category not found");
    return this.prisma.category.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
      },
    });
  }

  /** Products in this category aren't deleted — categoryId just goes back to
   * null (schema-level ON DELETE SET NULL) and they render uncategorized. */
  async remove(merchantId: string, storeId: string, id: string) {
    await this.ownedStoreOrThrow(merchantId, storeId);
    const category = await this.prisma.category.findFirst({ where: { id, storeId } });
    if (!category) throw new NotFoundException("Category not found");
    await this.prisma.category.delete({ where: { id } });
    return { success: true };
  }
}
