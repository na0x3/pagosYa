import { seoPrice } from '../../store-seo/store-seo';

export type FeedItem = { id: string; groupId: string | null; title: string; description: string; link: string; imageLinks: string[]; available: boolean; price: number; currency: string; brand: string };
type PublicVariant = { id: string; name: string; amount: number; stock?: number | null; imageUrl?: string | null };
type PublicItem = { id: string; name: string; description?: string | null; imageUrls: string[]; amount: number; currency: string; stock?: number | null; variants?: PublicVariant[] } & Record<string, unknown>;

const xml = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]!).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
export const formatPrice = (centavos: number, currency: string) => `${Math.floor(centavos / 100)}.${String(centavos % 100).padStart(2, '0')} ${currency.toUpperCase()}`;

/** The storefront's own public catalog, as Google Merchant Center and Meta Commerce Manager read it (spec §7.3). */
export function feedItems(input: { storeName: string; items: PublicItem[]; productUrl: (id: string) => string; image: (url: string) => string | undefined }) {
  const skipped = { noPhoto: 0, noPrice: 0 };
  const items: FeedItem[] = [];
  for (const product of input.items) {
    const photos = product.imageUrls.map(input.image).filter((url): url is string => Boolean(url)).slice(0, 11);
    if (!photos.length) { skipped.noPhoto++; continue; }
    const base = { description: String(product.description ?? '').slice(0, 5000), link: input.productUrl(product.id), currency: product.currency, brand: input.storeName };
    const variants = product.variants ?? [];
    if (!variants.length) {
      const price = seoPrice(product);
      if (!(price > 0)) { skipped.noPrice++; continue; }
      items.push({ ...base, id: product.id, groupId: null, title: product.name, imageLinks: photos, available: product.stock !== 0, price });
      continue;
    }
    const priced = variants.filter(variant => seoPrice({ ...product, amount: variant.amount }) > 0);
    if (!priced.length) { skipped.noPrice++; continue; }
    for (const variant of priced) {
      const own = variant.imageUrl ? input.image(variant.imageUrl) : undefined;
      items.push({ ...base, id: `${product.id}-${variant.id}`, groupId: product.id, title: `${product.name} · ${variant.name}`, imageLinks: own ? [own, ...photos.filter(url => url !== own)].slice(0, 11) : photos, available: variant.stock !== 0 && product.stock !== 0, price: seoPrice({ ...product, amount: variant.amount }) });
    }
  }
  return { items, skipped };
}

export function productFeedXml(title: string, home: string, items: FeedItem[]) {
  const entries = items.map(item => '<item>'
    + `<g:id>${xml(item.id)}</g:id>${item.groupId ? `<g:item_group_id>${xml(item.groupId)}</g:item_group_id>` : ''}`
    + `<g:title>${xml(item.title.slice(0, 150))}</g:title><g:description>${xml(item.description || item.title)}</g:description>`
    + `<g:link>${xml(item.link)}</g:link><g:image_link>${xml(item.imageLinks[0])}</g:image_link>`
    + item.imageLinks.slice(1).map(url => `<g:additional_image_link>${xml(url)}</g:additional_image_link>`).join('')
    + `<g:availability>${item.available ? 'in_stock' : 'out_of_stock'}</g:availability><g:price>${formatPrice(item.price, item.currency)}</g:price>`
    + `<g:condition>new</g:condition><g:brand>${xml(item.brand)}</g:brand><g:identifier_exists>no</g:identifier_exists></item>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0"><channel><title>${xml(title)}</title><link>${xml(home)}</link><description>${xml(`Catálogo de ${title}`)}</description>\n${entries}\n</channel></rss>`;
}
