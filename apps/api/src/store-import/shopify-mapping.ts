import { normalizeProductVariants } from '../payment-links/product-variants';
import type { ProductVariantDto } from '../payment-links/dto/create-payment-link.dto';
import type { ShopifyArticle, ShopifyProduct, ShopifyStoreData } from './shopify-types';

export type ImportVariant = { name: string; amount: number; stock: number | null; options?: Array<{ name: string; value: string }>; imageSource?: string };
export type ImportProduct = { externalId: string; name: string; description: string; tags: string[]; categoryName: string | null; amount: number; discountPercent: number | null; stock: number | null; shippingWeightGrams: number | null; variants: ImportVariant[]; imageSources: string[]; skus: string[] };
export type ImportArticle = { externalId: string; slug: string; title: string; excerpt: string; body: string };
export type ImportPreview = { name: string; currency: string; needsExchangeRate: boolean; counts: { products: number; variants: number; collections: number; pages: number; policies: number; photos: number }; products: Array<{ externalId: string; name: string; price: string; image: string | null; problem: string | null }>; warnings: string[] };

const POLICY_TITLES: Record<string, [string, string]> = {
  'refund-policy': ['politica-de-devoluciones', 'Política de devoluciones'], 'shipping-policy': ['politica-de-envios', 'Política de envíos'],
  'privacy-policy': ['politica-de-privacidad', 'Política de privacidad'], 'terms-of-service': ['terminos-del-servicio', 'Términos del servicio'],
};
const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/** Shopify HTML is never stored (spec 2026-09-27 §4): block elements become paragraphs, everything else plain text. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|noscript|iframe|template)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|ul|ol|section|article|blockquote|tr)>/gi, '\n\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (match, entity: string) => entity[0] === '#'
      ? String.fromCodePoint(entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1)))
      : ENTITIES[entity.toLowerCase()] ?? match)
    .split('\n').map(line => line.replace(/[ \t ]+/g, ' ').trim()).join('\n')
    .replace(/\n{3,}/g, '\n\n').trim().slice(0, 20_000);
}

/** Shopify prices are decimal strings in the store's currency; rateMilli converts to bolivianos (Bs per unit × 1000). */
export function toCentavos(price: string, rateMilli: number | null): number | null {
  if (!/^\d+(\.\d+)?$/.test(price.trim())) return null;
  const value = Number(price) * (rateMilli ? rateMilli / 1000 : 1);
  return Number.isFinite(value) ? Math.round(value * 100) : null;
}

export function mapProduct(product: ShopifyProduct, rateMilli: number | null, stockKnown: boolean): { product: ImportProduct } | { problem: string } {
  const name = product.title.slice(0, 200) || product.handle;
  if (!product.variants.length) return { problem: `${name}: no tiene variantes con precio.` };
  // Shopify never publishes quantities; only the CSV knows them. Sold out is 0, available is unlimited.
  const stockOf = (variant: ShopifyProduct['variants'][number]) => stockKnown && variant.inventoryQuantity !== undefined ? variant.inventoryQuantity : variant.available ? null : 0;
  const priced = product.variants.map(variant => ({ variant, amount: toCentavos(variant.price, rateMilli) }));
  if (priced.some(item => item.amount === null)) return { problem: `${name}: no tiene precio.` };
  const cheapest = priced.reduce((min, item) => item.amount! < min.amount! ? item : min);
  const compare = cheapest.variant.compareAtPrice ? toCentavos(cheapest.variant.compareAtPrice, rateMilli) : null;
  const discountPercent = compare && compare > cheapest.amount! ? Math.min(99, Math.max(1, Math.round((1 - cheapest.amount! / compare) * 100))) : null;
  const single = product.variants.length === 1 && (product.optionNames[0] ?? 'Title') === 'Title';
  const variants: ImportVariant[] = single ? [] : priced.map(({ variant, amount }) => ({
    name: variant.options.join(' / '), amount: amount!, stock: stockOf(variant),
    options: product.optionNames.map((optionName, index) => ({ name: optionName, value: variant.options[index] })).filter(option => option.value),
    ...(variant.imageSrc ? { imageSource: variant.imageSrc } : {}),
  }));
  // pagosYa's own variant rules decide; a product that breaks them is named in the review, the rest still import.
  try { normalizeProductVariants(variants as unknown as ProductVariantDto[]); }
  catch (error) { return { problem: `${name}: ${(error as Error).message}` }; }
  return { product: {
    externalId: product.handle, name, description: htmlToText(product.bodyHtml), tags: product.tags.slice(0, 20).map(tag => tag.slice(0, 40)),
    categoryName: product.productType ? product.productType.slice(0, 80) : null,
    amount: cheapest.amount!, discountPercent, stock: single ? stockOf(product.variants[0]) : null,
    shippingWeightGrams: product.variants[0].grams > 0 ? Math.round(product.variants[0].grams) : null,
    variants, imageSources: product.images.slice(0, 10), skus: product.variants.map(variant => variant.sku).filter((sku): sku is string => Boolean(sku)),
  } };
}

export function mapArticle(article: ShopifyArticle): ImportArticle {
  const policy = article.kind === 'policy' ? POLICY_TITLES[article.handle] : undefined;
  const body = htmlToText(article.bodyHtml);
  const slug = policy?.[0] ?? (article.handle.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'pagina');
  return { externalId: `${article.kind}:${article.handle}`, slug, title: (policy?.[1] ?? article.title).slice(0, 200), excerpt: body.split('\n')[0].slice(0, 200), body };
}

export function buildPreview(data: ShopifyStoreData): ImportPreview {
  const products = data.products.map(product => {
    // The exchange rate does not change whether a product maps; the review only needs its problem.
    const mapped = mapProduct(product, null, data.stockKnown);
    return { externalId: product.handle, name: product.title, price: product.variants[0]?.price ?? '', image: product.images[0] ?? null, problem: 'problem' in mapped ? mapped.problem : null };
  });
  const warnings = [...data.warnings];
  if (!data.stockKnown) warnings.push("El stock no es público en Shopify: súbelo con el CSV o queda en 'sin límite' (los agotados quedan en 0).");
  if (data.truncated) warnings.push('Tu tienda tiene más de 1.000 productos; importaremos los primeros 1.000.');
  const problems = products.filter(product => product.problem).length;
  if (problems) warnings.push(`${problems} ${problems === 1 ? 'producto tiene un problema y no se importará' : 'productos tienen problemas y no se importarán'}.`);
  return { name: data.name, currency: data.currency, needsExchangeRate: data.currency !== 'BOB', warnings, products,
    counts: { products: data.products.length, variants: data.products.reduce((sum, product) => sum + product.variants.length, 0), collections: data.collections.length,
      pages: data.articles.filter(article => article.kind === 'page').length, policies: data.articles.filter(article => article.kind === 'policy').length,
      photos: new Set(data.products.flatMap(product => product.images)).size } };
}
