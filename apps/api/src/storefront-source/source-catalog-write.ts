/* YAPI creates anything, part 2 (spec 2026-11-05 creates anything part 2 §5): a checked catalog change, written inside the quick
 * edit's transaction — new categories first (so products can be filed into them), renames and order, products, codes, and the
 * removed categories last (their products are left without a category by the schema). Products are archived, never deleted. */
import type { Prisma } from '@prisma/client';
import { totalVariantStock, type ProductVariant } from '../payment-links/product-variants';
import { applyVariantOperations } from './source-product-options';
import type { CatalogChange } from './source-catalog-edit';

export async function writeCatalogChange(tx: Prisma.TransactionClient, storeId: string, change: CatalogChange): Promise<void> {
  const made = new Map<string, string>();
  if (change.categories.create.length) {
    let sortOrder = await tx.category.count({ where: { storeId } });
    for (const category of change.categories.create)
      made.set(category.ref, (await tx.category.create({ data: { storeId, name: category.name, sortOrder: sortOrder++ }, select: { id: true } })).id);
  }
  const categoryId = (ref: string | null) => ref === null ? null : ref.startsWith('new:') ? made.get(ref) ?? null : ref;
  for (const category of change.categories.rename) await tx.category.updateMany({ where: { id: category.id, storeId }, data: { name: category.name } });
  for (const [sortOrder, id] of (change.categories.order ?? []).entries()) await tx.category.updateMany({ where: { id, storeId }, data: { sortOrder } });
  for (const product of change.products.create) {
    await tx.paymentLink.create({ data: { storeId, name: product.name, description: product.description || null, amount: product.amount, currency: product.currency,
      imageUrls: product.imageUrls, stock: product.stock, categoryId: categoryId(product.categoryRef),
      ...(product.variants.length ? { variants: product.variants as unknown as Prisma.InputJsonValue } : {}) } });
  }
  for (const update of change.products.update) {
    // Options are re-read under a row lock: a sale between the chat's read and this write keeps its stock.
    if (update.variantOps?.length) await tx.$queryRaw`SELECT id FROM "PaymentLink" WHERE id = ${update.id} AND "storeId" = ${storeId} FOR UPDATE`;
    const existing = await tx.paymentLink.findFirst({ where: { id: update.id, storeId }, select: { id: true, variants: true } });
    if (!existing) continue;
    const variants = update.variantOps?.length
      ? applyVariantOperations((Array.isArray(existing.variants) ? existing.variants : []) as unknown as ProductVariant[], update.variantOps) : undefined;
    await tx.paymentLink.update({ where: { id: existing.id }, data: {
      ...(update.status ? { status: update.status } : {}),
      ...(update.stock !== undefined ? { stock: update.stock } : {}),
      ...(update.categoryRef !== undefined ? { categoryId: categoryId(update.categoryRef) } : {}),
      ...(variants ? { variants: variants as unknown as Prisma.InputJsonValue, amount: Math.min(...variants.map(variant => variant.amount)),
        ...(variants.every(variant => variant.stock !== undefined) ? { stock: totalVariantStock(variants) } : {}),
        ...(update.variantOps!.some(operation => operation.changes?.amount !== undefined) ? { priceToConfirm: false } : {}) } : {}),
    } });
  }
  for (const code of change.codes.create) await tx.promoCode.create({ data: { storeId, code: code.code, discountType: code.type, discountValue: code.value } });
  for (const { id, ...flags } of change.codes.flags) await tx.promoCode.updateMany({ where: { id, storeId }, data: flags });
  if (change.categories.remove.length) await tx.category.deleteMany({ where: { storeId, id: { in: change.categories.remove.map(category => category.id) } } });
}
