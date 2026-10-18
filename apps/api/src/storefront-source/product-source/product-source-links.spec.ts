import { productLinkIn, productSiteName } from './product-source-links';

describe('productLinkIn (spec 2026-10-18 product link store)', () => {
  it('takes marketplace links whatever their path', () => {
    expect(productLinkIn('quiero vender esto https://www.alibaba.com/product-detail/200W-Blender_1601972610715.html')).toEqual({ url: 'https://www.alibaba.com/product-detail/200W-Blender_1601972610715.html', host: 'www.alibaba.com', social: false });
    expect(productLinkIn('https://es.aliexpress.com/item/1005005528151980.html.')?.url).toBe('https://es.aliexpress.com/item/1005005528151980.html');
    expect(productLinkIn('mira www.amazon.com/dp/B00KVZ27UA')?.url).toBe('https://www.amazon.com/dp/B00KVZ27UA');
  });

  it('takes a product path on any shop', () => {
    expect(productLinkIn('arma mi tienda con https://blendjet.com/products/blendjet-2')?.host).toBe('blendjet.com');
    expect(productLinkIn('https://mitienda.com/producto/licuadora-rosa/')?.social).toBe(false);
  });

  it('marks login-walled social links without fetching them', () => {
    expect(productLinkIn('lo vendo en https://www.facebook.com/marketplace/item/1259177466401495')).toMatchObject({ social: true, host: 'www.facebook.com' });
    expect(productLinkIn('https://www.instagram.com/p/Cabc123/')).toMatchObject({ social: true });
  });

  it("leaves another site's look to the website reference", () => {
    expect(productLinkIn('quiero mi tienda como esta https://blendjet.com/products/blendjet-2')).toBeNull();
    expect(productLinkIn('inspírate en https://www.alibaba.com/product-detail/x_1.html')).toBeNull();
  });

  it('lets selling words win over look words', () => {
    expect(productLinkIn('quiero vender este producto, hazlo con el estilo de https://www.aliexpress.com/item/1.html')?.host).toBe('www.aliexpress.com');
  });

  it('ignores home pages, images and plain sites', () => {
    expect(productLinkIn('mi web es https://blendjet.com')).toBeNull();
    expect(productLinkIn('https://cdn.shop.com/products/foto.jpg')).toBeNull();
    expect(productLinkIn('sin enlaces')).toBeNull();
  });
});

describe('productSiteName', () => {
  it('names known sites and falls back to the host', () => {
    expect(productSiteName('es.aliexpress.com')).toBe('AliExpress');
    expect(productSiteName('www.mercadolibre.com.co')).toBe('Mercado Libre');
    expect(productSiteName('www.blendjet.com')).toBe('blendjet.com');
  });
});
