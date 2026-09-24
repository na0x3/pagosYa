import type { SourceProjectFileDto } from './dto/save-source-project.dto';

/** Recover authored commerce routes for revisions created before route metadata existed. */
export function sourceCommerceRoutes(files: SourceProjectFileDto[], config: Record<string, unknown> = {}) {
  const html = files.filter(file => file.path.endsWith('.html') && file.encoding !== 'base64');
  const valid = (path: unknown): path is string => typeof path === 'string' && html.some(file => file.path === path);
  const checkouts = html.filter(file => file.path !== 'index.html' && (file.content.includes('data-pagosya-checkout-page') || file.content.includes('data-pagosya-cart') && file.content.includes('data-checkout-review')));
  const products = html.filter(file => file.path !== 'index.html' && file.content.includes('data-pagosya-product-page'));
  const checkoutPage = valid(config.checkoutPage) ? config.checkoutPage : checkouts.length === 1 ? checkouts[0].path : undefined;
  const productPage = valid(config.productPage) ? config.productPage : products.length === 1 ? products[0].path : undefined;
  return { checkoutPage, productPage };
}
