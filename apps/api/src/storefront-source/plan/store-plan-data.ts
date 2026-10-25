import { Prisma } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { readMasterState, TEMPLATE_STORE_DATA_PATH } from '../source-templates';
import { MASTER_TEMPLATE_ID } from '../source-master';
import type { CatalogFacts } from './store-plan-checks';
import { fingerprintOf, type Fingerprint } from './store-plan-fingerprint';

type Variant = { options?: Array<{ name?: unknown; value?: unknown }>; imageUrls?: unknown };
const COLOUR = /^(colou?r|tono)$/i;
const SIZE = /^(talla|size)$/i;
// «Tamaño» / «medida» also name a loaf, a cake or a box (BAEK 2026-10-23): they count only with wearable values (S, XL, 38, 40.5).
const MEASURE = /^(tamaño|medida)$/i;
const WEARABLE = /^(xxs|xs|s|m|l|xl|xxl|xxxl|\d{1,2}([.,]5)?)$/i;
const has = (variants: Variant[], pattern: RegExp) => variants.some(v => (v.options ?? []).some(o => typeof o.name === 'string' && pattern.test(o.name.trim())));
const hasSizes = (variants: Variant[]) => has(variants, SIZE)
  || variants.some(v => (v.options ?? []).some(o => typeof o.name === 'string' && MEASURE.test(o.name.trim()) && typeof o.value === 'string' && WEARABLE.test(o.value.trim())));

export async function catalogFacts(prisma: PrismaService, storeId: string): Promise<CatalogFacts> {
  const products = await prisma.paymentLink.findMany({ where: { storeId, status: 'ACTIVE' }, select: { name: true, imageUrls: true, categoryId: true, variants: true }, orderBy: { createdAt: 'asc' }, take: 200 });
  const categories = new Map<string, number>();
  let photoCount = 0, colourProducts = 0, colourPhotoProducts = 0, sizeProducts = 0;
  for (const product of products) {
    const variants = (Array.isArray(product.variants) ? product.variants : []) as Variant[];
    photoCount += Array.isArray(product.imageUrls) ? product.imageUrls.length : 0;
    if (product.categoryId) categories.set(product.categoryId, (categories.get(product.categoryId) ?? 0) + 1);
    if (has(variants, COLOUR)) {
      colourProducts++;
      if (variants.filter(v => Array.isArray(v.imageUrls) && v.imageUrls.length).length >= 2) colourPhotoProducts++;
    }
    if (hasSizes(variants)) sizeProducts++;
  }
  return { productNames: products.map(p => p.name), productCount: products.length, photoCount, categorySizes: [...categories.values()], colourProducts, colourPhotoProducts, sizeProducts };
}

/** Every other store's current Esencial look, read from store-data in SQL (a whole snapshot carries the kit and photos). */
export async function otherFingerprints(prisma: PrismaService, storeId: string): Promise<Fingerprint[]> {
  const rows = await prisma.$queryRaw<Array<{ data: string | null }>>(Prisma.sql`
    SELECT DISTINCT ON (v."storeId") (SELECT f->>'content' FROM jsonb_array_elements(v.snapshot->'files') f WHERE f->>'path' = ${TEMPLATE_STORE_DATA_PATH} LIMIT 1) AS data
    FROM "StoreSourceVersion" v
    WHERE v."storeId" <> ${storeId} AND v.snapshot->'brief'->>'templateId' = ${MASTER_TEMPLATE_ID}
    ORDER BY v."storeId", v.revision DESC`).catch(() => [] as Array<{ data: string | null }>);
  return rows.flatMap(row => {
    if (!row.data) return [];
    const state = readMasterState([{ path: TEMPLATE_STORE_DATA_PATH, content: row.data }]);
    if (!state.variants || !state.look) return [];
    const { sections = [], ...variants } = state.variants;
    return [fingerprintOf({ variants: variants as Record<string, string>, sections, palette: state.look.palette, fonts: state.look.fonts, accent: state.look.colors?.accent })];
  });
}
