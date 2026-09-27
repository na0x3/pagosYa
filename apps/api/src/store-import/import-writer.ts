import { Prisma } from '@prisma/client';
import { collectionSlug } from '../collections/collection-slug';
import { normalizeProductVariants, totalVariantStock, type ProductVariant } from '../payment-links/product-variants';
import type { ProductVariantDto } from '../payment-links/dto/create-payment-link.dto';
import type { ImportArticle, ImportProduct } from './shopify-mapping';

export type ImportCollection = { externalId: string; title: string; productExternalIds: string[] };
export type ImportSummary = { products: { created: number; updated: number }; collections: number; articles: number; redirects: number; skippedRedirects: number };
type WritableProduct = ImportProduct & { imageUrls: string[]; variantImageUrls: Array<string | undefined> };
const REDIRECT_CAP = 500;
const SHOPIFY_PATH = /^\/(?:products|collections)\/[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Writes one import inside the caller's transaction (spec 2026-09-27 §4). StoreImportLink makes a re-import update, never duplicate. */
export async function writeImport(tx: Prisma.TransactionClient, input: { storeId: string; sourceHost: string; authorName: string; products: WritableProduct[]; collections: ImportCollection[]; articles: ImportArticle[] }): Promise<ImportSummary> {
  const { storeId, sourceHost } = input;
  // Same lock StorePagesService.saveRedirect takes, so the 500-redirect cap holds against a concurrent edit.
  await tx.$queryRaw`SELECT id FROM "Store" WHERE id = ${storeId} FOR UPDATE`;
  const links = await tx.storeImportLink.findMany({ where: { storeId, sourceHost } });
  const linked = (kind: string, externalId: string) => links.find(link => link.kind === kind && link.externalId === externalId)?.localId;
  const link = (kind: string, externalId: string, localId: string, skus: string[] = []) => tx.storeImportLink.upsert({
    where: { storeId_sourceHost_kind_externalId: { storeId, sourceHost, kind, externalId } }, create: { storeId, sourceHost, kind, externalId, localId, skus }, update: { localId, skus } });

  const categories = await tx.category.findMany({ where: { storeId } });
  const categoryId = async (name: string | null) => {
    if (!name) return null;
    const found = categories.find(category => category.name.toLocaleLowerCase('es') === name.toLocaleLowerCase('es'));
    if (found) return found.id;
    const created = await tx.category.create({ data: { storeId, name, sortOrder: categories.length } });
    categories.push(created);
    return created.id;
  };

  const summary: ImportSummary = { products: { created: 0, updated: 0 }, collections: 0, articles: 0, redirects: 0, skippedRedirects: 0 };
  const productIds = new Map<string, string>();
  for (const product of input.products) {
    const existingId = linked('PRODUCT', product.externalId);
    const existing = existingId ? await tx.paymentLink.findFirst({ where: { id: existingId, storeId } }) : null;
    const previous = (existing?.variants as unknown as ProductVariant[] | undefined) ?? [];
    // Variant ids are kept by name so carts opened before a re-import still point at the same option.
    const variants = normalizeProductVariants(product.variants.map((variant, index) => {
      const kept = previous.find(item => item.name === variant.name);
      return { ...(kept ? { id: kept.id } : {}), name: variant.name, amount: variant.amount, stock: variant.stock, options: variant.options, imageUrl: product.variantImageUrls[index] ?? null };
    }) as unknown as ProductVariantDto[], existing ? previous : null);
    const data = {
      name: product.name, description: product.description || null, tags: product.tags, categoryId: await categoryId(product.categoryName),
      imageUrls: product.imageUrls, imagePositions: product.imageUrls.map(() => '50% 50%'), shippingWeightGrams: product.shippingWeightGrams,
      variants: variants as unknown as Prisma.InputJsonValue,
      amount: variants.length ? Math.min(...variants.map(variant => variant.amount)) : product.amount,
      stock: variants.length ? totalVariantStock(variants) : product.stock,
      discountPercent: product.discountPercent, discountStartsAt: null, discountEndsAt: null,
    };
    const saved = existing ? await tx.paymentLink.update({ where: { id: existing.id }, data }) : await tx.paymentLink.create({ data: { storeId, currency: 'BOB', ...data } });
    if (existing) summary.products.updated++; else summary.products.created++;
    productIds.set(product.externalId, saved.id);
    await link('PRODUCT', product.externalId, saved.id, product.skus);
  }

  const collectionSlugs = new Map<string, string>();
  const taken = new Set((await tx.collection.findMany({ where: { storeId }, select: { slug: true } })).map(row => row.slug));
  for (const [index, collection] of input.collections.entries()) {
    const existingId = linked('COLLECTION', collection.externalId);
    const existing = existingId ? await tx.collection.findFirst({ where: { id: existingId, storeId } }) : null;
    const saved = existing
      ? await tx.collection.update({ where: { id: existing.id }, data: { name: collection.title } })
      : await tx.collection.create({ data: { storeId, name: collection.title, slug: collectionSlug(collection.externalId, taken), sortOrder: index } });
    taken.add(saved.slug);
    await tx.collectionProduct.deleteMany({ where: { collectionId: saved.id } });
    const members = [...new Set(collection.productExternalIds.map(id => productIds.get(id)).filter((id): id is string => Boolean(id)))];
    await tx.collectionProduct.createMany({ data: members.map((paymentLinkId, sortOrder) => ({ collectionId: saved.id, paymentLinkId, sortOrder })) });
    collectionSlugs.set(collection.externalId, saved.slug);
    summary.collections++;
    await link('COLLECTION', collection.externalId, saved.id);
  }

  for (const article of input.articles) {
    const existingId = linked('ARTICLE', article.externalId);
    const existing = existingId ? await tx.storeArticle.findFirst({ where: { id: existingId, storeId } }) : null;
    let saved;
    if (existing) saved = await tx.storeArticle.update({ where: { id: existing.id }, data: { title: article.title, excerpt: article.excerpt, body: article.body, revision: { increment: 1 } } });
    else {
      let slug = article.slug;
      for (let suffix = 2; await tx.storeArticle.findUnique({ where: { storeId_locale_slug: { storeId, locale: 'es', slug } } }); suffix++) slug = `${article.slug.slice(0, 76)}-${suffix}`;
      // Unpublished: pages and policies are legal text the merchant reviews before buyers see it.
      saved = await tx.storeArticle.create({ data: { storeId, locale: 'es', slug, title: article.title, excerpt: article.excerpt, body: article.body, author: input.authorName, publishedAt: null } });
    }
    summary.articles++;
    await link('ARTICLE', article.externalId, saved.id);
  }

  // Collections first: fewer, and they carry more links from outside. Targets are generated /p/ and /c/ paths,
  // which no fromPath can start with, so no cycle is possible.
  const wanted = [
    ...[...collectionSlugs].map(([handle, slug]) => ({ fromPath: `/collections/${handle}`, toPath: `/c/${slug}` })),
    ...[...productIds].map(([handle, id]) => ({ fromPath: `/products/${handle}`, toPath: `/p/${id}` })),
  ].filter(redirect => SHOPIFY_PATH.test(redirect.fromPath) && redirect.fromPath.length <= 200);
  const existingPaths = new Set((await tx.storeRedirect.findMany({ where: { storeId }, select: { fromPath: true } })).map(row => row.fromPath));
  let room = REDIRECT_CAP - existingPaths.size;
  for (const redirect of wanted) {
    if (!existingPaths.has(redirect.fromPath)) { if (room <= 0) { summary.skippedRedirects++; continue; } room--; }
    await tx.storeRedirect.upsert({ where: { storeId_fromPath: { storeId, fromPath: redirect.fromPath } }, create: { storeId, ...redirect }, update: { toPath: redirect.toPath } });
    summary.redirects++;
  }
  return summary;
}
