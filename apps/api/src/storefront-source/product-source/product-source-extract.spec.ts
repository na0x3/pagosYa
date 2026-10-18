import { extractProductListing, listingCurrency, listingPrice, productPageBlock } from './product-source-extract';

const ld = (data: unknown) => `<script type="application/ld+json">${JSON.stringify(data)}</script>`;

describe('extractProductListing (spec 2026-10-18 product link store)', () => {
  it('reads a JSON-LD Product (Alibaba, Shopify): name with entities, price, currency, photos', () => {
    const html = `<html><head><title>x</title>${ld({ '@context': 'https://schema.org', '@type': 'Product', name: 'Licuadora Port&aacute;til Recargable', description: '<p>USB, 6 cuchillas</p>',
      image: ['//s.alicdn.com/a.jpg', { '@type': 'ImageObject', url: 'https://s.alicdn.com/b.jpg' }, 'https://s.alicdn.com/a.jpg'], offers: { '@type': 'AggregateOffer', lowPrice: '18.30', priceCurrency: 'USD' } })}</head></html>`;
    expect(extractProductListing(html, 'https://www.alibaba.com/product-detail/x_1.html')).toEqual({
      url: 'https://www.alibaba.com/product-detail/x_1.html', name: 'Licuadora Portátil Recargable', description: 'USB, 6 cuchillas',
      price: 18.3, currency: 'USD', images: ['https://s.alicdn.com/a.jpg', 'https://s.alicdn.com/b.jpg'], options: [],
    });
  });

  it('reads options from a ProductGroup and prefers it over a lone Product', () => {
    const html = ld([{ '@type': 'Product', name: 'Suelto', image: 'https://x.com/s.jpg' }, { '@type': 'ProductGroup', name: 'BlendJet 2', image: 'https://x.com/g.jpg', hasVariant: [
      { '@type': 'Product', color: 'Negro', image: 'https://x.com/negro.jpg', offers: { price: 49.99, priceCurrency: 'USD' } },
      { '@type': 'Product', color: 'Rosa', offers: { price: 49.99, priceCurrency: 'USD' } },
      { '@type': 'Product', color: 'Rosa', additionalProperty: [{ name: 'Capacidad', value: '475 ml' }] },
    ] }]);
    const listing = extractProductListing(html, 'https://blendjet.com/products/blendjet-2')!;
    expect(listing.name).toBe('BlendJet 2');
    expect(listing.options).toEqual([{ name: 'Color', values: ['Negro', 'Rosa'] }]);
    expect(listing.price).toBe(49.99);
    expect(listing.images).toEqual(['https://x.com/g.jpg', 'https://x.com/negro.jpg']);
  });

  it('falls back to Open Graph and product meta tags', () => {
    const html = '<meta property="og:title" content="420ml Mini Blender"><meta content="https://take.app/i.jpg" property="og:image"><meta property="product:price:amount" content="160"><meta property="product:price:currency" content="BOB"><meta name="description" content="Recargable">';
    expect(extractProductListing(html, 'https://take.app/shop/p/1')).toMatchObject({ name: '420ml Mini Blender', description: 'Recargable', price: 160, currency: 'BOB', images: ['https://take.app/i.jpg'] });
  });

  it("reads Amazon's own page: title, the core price, full-size photos and bullets", () => {
    const html = `<span id="productTitle" class="a">  Hamilton Beach Licuadora portátil  </span><div id="corePrice_feature_div"><span class="a-offscreen">BOB291.54</span></div><span class="a-offscreen">BOB9</span>
      <div id="feature-bullets"><ul><li>14 oz</li><li>Vaso de viaje</li></ul></div><script>{"hiRes":"https://m.media-amazon.com/1.jpg","x":1},{"hiRes":"https://m.media-amazon.com/2.jpg"}</script>`;
    expect(extractProductListing(html, 'https://www.amazon.com/dp/B00KVZ27UA')).toMatchObject({ name: 'Hamilton Beach Licuadora portátil', price: 291.54, currency: 'BOB',
      images: ['https://m.media-amazon.com/1.jpg', 'https://m.media-amazon.com/2.jpg'], description: '14 oz. Vaso de viaje.' });
  });

  it('is null without a name or a photo', () => {
    expect(extractProductListing('<title>AliExpress</title><script>runParams = {}</script>', 'https://es.aliexpress.com/item/1.html')).toBeNull();
    expect(extractProductListing(ld({ '@type': 'Product', name: 'Sin foto' }), 'https://x.com/p/1')).toBeNull();
  });
});

describe('listingPrice / listingCurrency', () => {
  it('reads common price shapes', () => {
    expect(listingPrice('18.30')).toBe(18.3);
    expect(listingPrice('1.302,21')).toBe(1302.21);
    expect(listingPrice('1,302')).toBe(1302);
    expect(listingPrice('US$ 29,99')).toBe(29.99);
    expect(listingPrice(0)).toBeNull();
    expect(listingPrice('gratis')).toBeNull();
  });
  it('reads currency codes and prefixes', () => {
    expect(listingCurrency('usd')).toBe('USD');
    expect(listingCurrency('BOB291.54')).toBe('BOB');
    expect(listingCurrency('US$29')).toBe('USD');
    expect(listingCurrency('Bs. 35')).toBe('BOB');
    expect(listingCurrency('$29')).toBeNull();
  });
});

describe('productPageBlock', () => {
  it('tells login walls from robot checks', () => {
    expect(productPageBlock('<title>Temu | Login</title>', 'https://www.temu.com/login.html?from=x', 200)).toBe('login');
    expect(productPageBlock('<title>Security verification</title>', 'https://www.temu.com/bgn_verification.html', 200)).toBe('blocked');
    expect(productPageBlock('<title>Mercado Libre</title>', 'https://www.mercadolibre.com.co/gz/account-verification?go=x', 200)).toBe('blocked');
    expect(productPageBlock('<title>Just a moment...</title>', 'https://shop.co.uk/product/x', 403)).toBe('blocked');
    expect(productPageBlock('<title></title><script>var _____tmd_____ = 1</script>', 'https://es.aliexpress.com/item/1.html', 200)).toBe('blocked');
    expect(productPageBlock('<title>Licuadora</title>', 'https://blendjet.com/products/x', 200)).toBeNull();
  });
});
