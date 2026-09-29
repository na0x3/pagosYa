import type { ProductCardParams } from './source-product-card-presets';

/** How far apart two stores' product pages are: the number of product card settings that differ (of five), plus one when
 * exactly one of them carries guarded CSS. 0 = the same page, 6 = as different as the theme allows. Two businesses that sell
 * different things should score at least PRODUCT_CARD_MIN_DISTANCE (checked by the YAPI evaluation, not enforced at build time). */
export const PRODUCT_CARD_MIN_DISTANCE = 3;
export type ProductCardTheme = { productCard: ProductCardParams; productCss: string };

export function productCardDistance(a: ProductCardTheme, b: ProductCardTheme): number {
  const keys = Object.keys(a.productCard) as Array<keyof ProductCardParams>;
  const differing = keys.filter(key => a.productCard[key] !== b.productCard[key]).length;
  return differing + (Boolean(a.productCss) !== Boolean(b.productCss) ? 1 : 0);
}
