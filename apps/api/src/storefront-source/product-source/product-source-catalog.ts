/** The catalog product built from a listing (spec 2026-10-18 product link store, decisions 6–8). Pure. */
import type { ProductVariantDto } from '../../payment-links/dto/create-payment-link.dto';
import type { ProductListing } from './product-source-extract';

export type ProductCopy = { name: string; description: string };
export type ProductSourceProduct = { name: string; description: string; amount: number; currency: 'BOB' | 'USD'; imageUrls: string[]; variants?: ProductVariantDto[]; priceToConfirm: boolean };

const FIGURE = String.raw`(\d{1,7}(?:[.,]\d{1,2})?)`;
const PRICE = new RegExp(String.raw`(?<!\p{L})(?:(bs\.?|bob|bolivianos|usd|us\$|d[oó]lares)\s*${FIGURE}|${FIGURE}\s*(bs\.?|bob|bolivianos|usd|us\$|d[oó]lares))(?!\p{L})`, 'iu');
const MAX_COMBINATIONS = 24;

/** The merchant's own price in their message («a Bs 120», «lo vendo en 25 dólares»), in minor units; else null. */
export function merchantPrice(words: string): { amount: number; currency: 'BOB' | 'USD' } | null {
  const match = PRICE.exec(words);
  if (!match) return null;
  const unit = (match[1] ?? match[4]).toLowerCase();
  const amount = Math.round(Number((match[2] ?? match[3]).replace(',', '.')) * 100);
  return amount > 0 ? { amount, currency: /usd|us\$|d[oó]lares/.test(unit) ? 'USD' : 'BOB' } : null;
}

const cut = (value: string, max: number) => value.length <= max ? value : `${value.slice(0, max - 1).replace(/\s+\S*$/, '')}…`;

/** One or two option groups and at most 24 combinations become variants at the product's price (decision 8). */
export function listingVariants(options: ProductListing['options'], amount: number): ProductVariantDto[] | undefined {
  const groups = options.filter(option => option.values.length > 1).slice(0, 3);
  if (!groups.length || groups.length > 2) return undefined;
  const combinations = groups.reduce<Array<Array<{ name: string; value: string }>>>((rows, group) => rows.flatMap(row => group.values.map(value => [...row, { name: group.name.slice(0, 40), value: value.slice(0, 40) }])), [[]]);
  if (combinations.length > MAX_COMBINATIONS) return undefined;
  return combinations.map(selected => ({ name: selected.map(option => option.value).join(' / '), amount, options: selected, stock: null }));
}

/** The product the server creates before the build. A price the merchant wrote is used and confirmed; otherwise the listing's
 *  price in BOB or USD, else 0, waits for the merchant (decision 7). */
export function productFromListing(listing: ProductListing, copy: ProductCopy | undefined, words: string, imageUrls: string[]): ProductSourceProduct {
  const stated = merchantPrice(words);
  const listed = listing.price !== null && (listing.currency === 'BOB' || listing.currency === 'USD') ? { amount: Math.round(listing.price * 100), currency: listing.currency as 'BOB' | 'USD' } : null;
  const price = stated ?? listed ?? { amount: 0, currency: 'BOB' as const };
  const variants = listingVariants(listing.options, price.amount);
  return {
    name: cut(copy?.name.trim() || listing.name, 120),
    description: cut(copy?.description.trim() || listing.description, 500),
    amount: price.amount, currency: price.currency, imageUrls: imageUrls.slice(0, 10),
    ...(variants ? { variants } : {}),
    priceToConfirm: !stated,
  };
}
