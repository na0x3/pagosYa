import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { collectionSlug } from "./collection-slug";
import { CreateCollectionDto } from "./dto/create-collection.dto";
import { UpdateCollectionDto } from "./dto/update-collection.dto";

// A store can have at most this many playlists-of-products.
export const MAX_COLLECTIONS = 12;
// A single collection can hold at most this many products.
export const MAX_COLLECTION_PRODUCTS = 200;

@Injectable()
export class CollectionsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Every mutation here is scoped to a store the caller owns — never trust a bare storeId. */
  private async ownedStoreOrThrow(merchantId: string, storeId: string) {
    const store = await this.prisma.store.findFirst({ where: { id: storeId, merchantId } });
    if (!store) throw new NotFoundException("Store not found");
    return store;
  }

  async create(merchantId: string, storeId: string, dto: CreateCollectionDto) {
    await this.ownedStoreOrThrow(merchantId, storeId);
    const count = await this.prisma.collection.count({ where: { storeId } });
    if (count >= MAX_COLLECTIONS) {
      throw new BadRequestException(`Puedes tener hasta ${MAX_COLLECTIONS} colecciones`);
    }
    // The slug is generated once, here, from the current set of taken slugs —
    // it never regenerates on a later rename, so shared links keep working.
    const existing = await this.prisma.collection.findMany({ where: { storeId }, select: { slug: true } });
    const slug = collectionSlug(dto.name, new Set(existing.map((collection) => collection.slug)));
    // Default to the end of the list, not 0 — otherwise every new collection
    // would jump to the front, ahead of ones the merchant already ordered.
    const sortOrder = dto.sortOrder ?? count;
    return this.prisma.collection.create({
      data: { storeId, name: dto.name, slug, sortOrder },
    });
  }

  /** The Studio panel needs each collection's current membership to show
   * pre-checked product checkboxes, so the list carries a flat productIds
   * array rather than making the owner open a second endpoint per collection. */
  async listForStore(merchantId: string, storeId: string) {
    await this.ownedStoreOrThrow(merchantId, storeId);
    const collections = await this.prisma.collection.findMany({
      where: { storeId },
      orderBy: { sortOrder: "asc" },
      include: { products: { orderBy: { sortOrder: "asc" }, select: { paymentLinkId: true } } },
    });
    return collections.map(({ products, ...collection }) => ({
      ...collection,
      productIds: products.map((product) => product.paymentLinkId),
    }));
  }

  async update(merchantId: string, storeId: string, id: string, dto: UpdateCollectionDto) {
    await this.ownedStoreOrThrow(merchantId, storeId);
    const collection = await this.prisma.collection.findFirst({ where: { id, storeId } });
    if (!collection) throw new NotFoundException("Collection not found");
    // slug is intentionally never written here — renames must not break
    // shared /c/<slug> links.
    return this.prisma.collection.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
      },
    });
  }

  async reorder(merchantId: string, storeId: string, collectionIds: string[]) {
    await this.ownedStoreOrThrow(merchantId, storeId);
    const collections = await this.prisma.collection.findMany({ where: { storeId }, select: { id: true } });
    const currentIds = new Set(collections.map((collection) => collection.id));
    const uniqueIds = new Set(collectionIds);
    const hasExactCollectionSet =
      uniqueIds.size === currentIds.size && collectionIds.every((id) => currentIds.has(id));
    if (!hasExactCollectionSet) {
      throw new BadRequestException("Envía todas las colecciones de la tienda una sola vez para guardar el orden");
    }

    await this.prisma.$transaction(
      collectionIds.map((id, sortOrder) => this.prisma.collection.update({ where: { id }, data: { sortOrder } })),
    );
    return this.prisma.collection.findMany({ where: { storeId }, orderBy: { sortOrder: "asc" } });
  }

  /** Deleting a collection only removes the grouping (and its CollectionProduct
   * membership rows via cascade) — the products themselves are untouched. */
  async remove(merchantId: string, storeId: string, id: string) {
    await this.ownedStoreOrThrow(merchantId, storeId);
    const collection = await this.prisma.collection.findFirst({ where: { id, storeId } });
    if (!collection) throw new NotFoundException("Collection not found");
    await this.prisma.collection.delete({ where: { id } });
    return { success: true };
  }

  /** Replaces the collection's membership wholesale (delete + createMany in one
   * transaction) rather than diffing — simpler and the list is capped at 200. */
  async setProducts(merchantId: string, storeId: string, id: string, paymentLinkIds: string[]) {
    await this.ownedStoreOrThrow(merchantId, storeId);
    const collection = await this.prisma.collection.findFirst({ where: { id, storeId } });
    if (!collection) throw new NotFoundException("Collection not found");
    if (paymentLinkIds.length > MAX_COLLECTION_PRODUCTS) {
      throw new BadRequestException(`Una colección puede tener hasta ${MAX_COLLECTION_PRODUCTS} productos`);
    }
    if (paymentLinkIds.length) {
      const ownedCount = await this.prisma.paymentLink.count({
        where: { storeId, id: { in: paymentLinkIds } },
      });
      if (ownedCount !== paymentLinkIds.length) {
        throw new BadRequestException("Uno o más productos no pertenecen a esta tienda");
      }
    }
    await this.prisma.$transaction([
      this.prisma.collectionProduct.deleteMany({ where: { collectionId: id } }),
      this.prisma.collectionProduct.createMany({
        data: paymentLinkIds.map((paymentLinkId, sortOrder) => ({ collectionId: id, paymentLinkId, sortOrder })),
      }),
    ]);
    return this.prisma.collection.findFirst({
      where: { id },
      include: { products: { orderBy: { sortOrder: "asc" } } },
    });
  }
}
