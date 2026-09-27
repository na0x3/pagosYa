import { feedItems, formatPrice, productFeedXml } from './product-feed';

const item = (over: any = {}) => ({ id: 'p1', name: 'Taza <azul>', description: 'Cerámica & esmalte', imageUrls: ['/v1/uploads/a.png', '/v1/uploads/b.png'], amount: 4550, currency: 'BOB', stock: null, variants: [], discountPercent: 0, ...over });
const input = (items: any[]) => ({ storeName: 'Café & Co', items, productUrl: (id: string) => `https://micafe.com/p/${id}`, image: (url: string) => `https://api.pagosya.bo${url}` });

describe('product feed', () => {
  it('formats centavos with integer math', () => {
    expect(formatPrice(4550, 'BOB')).toBe('45.50 BOB');
    expect(formatPrice(5, 'bob')).toBe('0.05 BOB');
    expect(formatPrice(100000, 'BOB')).toBe('1000.00 BOB');
  });

  // Review focus 4: variants grouped, a sold-out variant marked, a photo-less product skipped and counted.
  it('groups variants, marks sold-out ones, and skips products without a photo or price', () => {
    const { items, skipped } = feedItems(input([
      item({ variants: [{ id: 'v1', name: 'Rojo', amount: 4000, stock: 3, imageUrl: '/v1/uploads/r.png' }, { id: 'v2', name: 'Negro', amount: 4200, stock: 0 }] }),
      item({ id: 'p2', imageUrls: [] }),
      item({ id: 'p3', amount: 0 }),
      item({ id: 'p4', stock: 0 }),
    ]));
    expect(skipped).toEqual({ noPhoto: 1, noPrice: 1 });
    expect(items.map(entry => [entry.id, entry.groupId, entry.available, entry.price])).toEqual([['p1-v1', 'p1', true, 4000], ['p1-v2', 'p1', false, 4200], ['p4', null, false, 4550]]);
    expect(items[0]).toMatchObject({ title: 'Taza <azul> · Rojo', link: 'https://micafe.com/p/p1', imageLinks: ['https://api.pagosya.bo/v1/uploads/r.png', 'https://api.pagosya.bo/v1/uploads/a.png', 'https://api.pagosya.bo/v1/uploads/b.png'] });
  });

  it('writes RSS 2.0 with the g: namespace, escaped, with every required field', () => {
    const xml = productFeedXml('Café & Co', 'https://micafe.com/', feedItems(input([item()])).items);
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">')).toBe(true);
    for (const field of ['<g:id>p1</g:id>', '<g:title>Taza &lt;azul&gt;</g:title>', '<g:description>Cerámica &amp; esmalte</g:description>', '<g:link>https://micafe.com/p/p1</g:link>', '<g:image_link>https://api.pagosya.bo/v1/uploads/a.png</g:image_link>', '<g:additional_image_link>https://api.pagosya.bo/v1/uploads/b.png</g:additional_image_link>', '<g:availability>in_stock</g:availability>', '<g:price>45.50 BOB</g:price>', '<g:condition>new</g:condition>', '<g:brand>Café &amp; Co</g:brand>', '<g:identifier_exists>no</g:identifier_exists>']) expect(xml).toContain(field);
    expect(xml).not.toContain('<g:item_group_id>');
  });
});
