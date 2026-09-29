import { normalizeProductVariants } from '../payment-links/product-variants';
import type { ProductVariantDto } from '../payment-links/dto/create-payment-link.dto';
import type { ShopifyArticle, ShopifyProduct, ShopifyStoreData } from './shopify-types';

export type ImportVariant = { name: string; amount: number; stock: number | null; options?: Array<{ name: string; value: string }>; imageSource?: string };
export type ImportProduct = { externalId: string; name: string; description: string; descriptionTruncated: boolean; tags: string[]; categoryName: string | null; amount: number; onSale: boolean; stock: number | null; shippingWeightGrams: number | null; variants: ImportVariant[]; imageSources: string[]; skus: string[] };
export type ImportArticle = { externalId: string; slug: string; title: string; excerpt: string; body: string };
export type ImportPreview = { name: string; currency: string; needsExchangeRate: boolean; counts: { products: number; variants: number; collections: number; pages: number; policies: number; photos: number }; products: Array<{ externalId: string; name: string; price: string; image: string | null; problem: string | null }>; warnings: string[] };

const POLICY_TITLES: Record<string, [string, string]> = {
  'refund-policy': ['politica-de-devoluciones', 'Política de devoluciones'], 'shipping-policy': ['politica-de-envios', 'Política de envíos'],
  'privacy-policy': ['politica-de-privacidad', 'Política de privacidad'], 'terms-of-service': ['terminos-del-servicio', 'Términos del servicio'],
};
const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

// The characters IsSafeText rejects (controls and bidi overrides): imported text must pass the product form later.
const UNSAFE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u202A-\u202E\u2066-\u2069]/g;
const safe = (value: string) => value.replace(UNSAFE, '');
// The product form's limits (CreatePaymentLinkDto): name 120, description 500, 6 tags of 24.
const NAME_MAX = 120, DESCRIPTION_MAX = 500, TAGS_MAX = 6, TAG_MAX = 24;
export const MAX_PHOTOS = 3000;

/** The store name as CreateStoreDto accepts it: no invisible characters, one line, at most 120 characters. */
export const storeName = (value: string) => safe(value).replace(/\s+/g, ' ').trim().slice(0, NAME_MAX).trim() || 'Mi tienda';

/** Every photo an import copies for this product: its gallery, then its variants' photos. */
export const photoSources = (product: ImportProduct) => [...product.imageSources, ...product.variants.flatMap(variant => variant.imageSource ? [variant.imageSource] : [])];

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
    .replace(UNSAFE, '')
    .split('\n').map(line => line.replace(/[ \t ]+/g, ' ').trim()).join('\n')
    .replace(/\n{3,}/g, '\n\n').trim().slice(0, 20_000);
}

/** Shopify prices are decimal strings in the store's currency; rateMilli converts to bolivianos (Bs per unit × 1000).
 * Integer arithmetic only: no price may land a centavo off because of the nearest binary double. */
export function toCentavos(price: string, rateMilli: number | null): number | null {
  const match = /^(\d{1,15})(?:\.(\d{1,15}))?$/.exec(price.trim());
  if (!match || (rateMilli !== null && !Number.isSafeInteger(rateMilli))) return null;
  const fraction = match[2] ?? '';
  // centavos = digits / 10^d × rate / 1000 × 100 = digits × rate / (10 × 10^d), rounded half up.
  const numerator = BigInt(match[1] + fraction) * BigInt(rateMilli ?? 1000), denominator = 10n * 10n ** BigInt(fraction.length);
  const centavos = (2n * numerator + denominator) / (2n * denominator);
  return centavos <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(centavos) : null;
}

export function mapProduct(product: ShopifyProduct, rateMilli: number | null, stockKnown: boolean): { product: ImportProduct } | { problem: string } {
  const name = safe(product.title).slice(0, NAME_MAX) || product.handle.slice(0, NAME_MAX);
  if (!product.variants.length) return { problem: `${name}: no tiene variantes con precio.` };
  // Shopify never publishes quantities; only the CSV knows them. Sold out is 0, available is unlimited.
  const stockOf = (variant: ShopifyProduct['variants'][number]) => stockKnown && variant.inventoryQuantity !== undefined ? variant.inventoryQuantity : variant.available ? null : 0;
  const priced = product.variants.map(variant => ({ variant, amount: toCentavos(variant.price, rateMilli) }));
  if (priced.some(item => item.amount === null)) return { problem: `${name}: no tiene precio.` };
  const cheapest = priced.reduce((min, item) => item.amount! < min.amount! ? item : min);
  const compare = cheapest.variant.compareAtPrice ? toCentavos(cheapest.variant.compareAtPrice, rateMilli) : null;
  // pagosYa discounts are scheduled (start and end dates); Shopify's compare-at price has neither, so the sale price is
  // imported as the price and the review tells the merchant to recreate the offer (final review, Critical #1).
  const onSale = Boolean(compare && compare > cheapest.amount!);
  const single = product.variants.length === 1 && (product.optionNames[0] ?? 'Title') === 'Title';
  const variants: ImportVariant[] = single ? [] : priced.map(({ variant, amount }) => ({
    name: variant.options.join(' / '), amount: amount!, stock: stockOf(variant),
    options: product.optionNames.map((optionName, index) => ({ name: optionName, value: variant.options[index] })).filter(option => option.value),
    ...(variant.imageSrc ? { imageSource: variant.imageSrc } : {}),
  }));
  // pagosYa's own variant rules decide; a product that breaks them is named in the review, the rest still import.
  try { normalizeProductVariants(variants as unknown as ProductVariantDto[]); }
  catch (error) { return { problem: `${name}: ${(error as Error).message}` }; }
  const fullDescription = htmlToText(product.bodyHtml);
  return { product: {
    externalId: product.handle, name, description: fullDescription.length > DESCRIPTION_MAX ? `${fullDescription.slice(0, DESCRIPTION_MAX - 1).replace(/\s+\S*$/, '')}…` : fullDescription,
    descriptionTruncated: fullDescription.length > DESCRIPTION_MAX,
    tags: product.tags.map(tag => safe(tag).trim()).filter(tag => tag && tag.length <= TAG_MAX).slice(0, TAGS_MAX),
    categoryName: product.productType ? safe(product.productType).slice(0, 80) : null,
    amount: cheapest.amount!, onSale, stock: single ? stockOf(product.variants[0]) : null,
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
  const mapped = data.products.map(product => mapProduct(product, null, data.stockKnown)).flatMap(result => 'product' in result ? [result.product] : []);
  const onSale = mapped.filter(product => product.onSale).length;
  if (onSale) warnings.push(`${onSale} ${onSale === 1 ? 'producto estaba en oferta' : 'productos estaban en oferta'} en Shopify: se importa${onSale === 1 ? '' : 'n'} con el precio de oferta. Crea la oferta en pagosYa si quieres mostrar el precio anterior.`);
  const truncated = mapped.filter(product => product.descriptionTruncated).length;
  if (truncated) warnings.push(`${truncated} ${truncated === 1 ? 'descripción se acortó' : 'descripciones se acortaron'} a 500 caracteres, el límite de pagosYa.`);
  const photos = new Set(mapped.flatMap(photoSources)).size;
  if (photos > MAX_PHOTOS) warnings.push(`Tu tienda tiene ${photos.toLocaleString('es-BO')} fotos; copiaremos las primeras ${MAX_PHOTOS.toLocaleString('es-BO')} y el resto de los productos quedará sin foto.`);
  const problems = products.filter(product => product.problem).length;
  if (problems) warnings.push(`${problems} ${problems === 1 ? 'producto tiene un problema y no se importará' : 'productos tienen problemas y no se importarán'}.`);
  return { name: data.name, currency: data.currency, needsExchangeRate: data.currency !== 'BOB', warnings, products,
    counts: { products: data.products.length, variants: data.products.reduce((sum, product) => sum + product.variants.length, 0), collections: data.collections.length,
      pages: data.articles.filter(article => article.kind === 'page').length, policies: data.articles.filter(article => article.kind === 'policy').length,
      photos: new Set(data.products.flatMap(product => product.images)).size } };
}
