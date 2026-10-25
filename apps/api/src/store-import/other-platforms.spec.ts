import { decimalPrice, readPlatformCsv } from './platform-csv';
import { ShopifyReadError } from './shopify-reader';
import { pageProduct, readSitemapStore, sitemapProductUrls } from './sitemap-reader';
import { readAnyStore } from './store-reader';
import { minorToDecimal, readWooStore } from './woocommerce-reader';

// Owner 2026-10-25: «can we also make it so we accept websites from wix and etc» → «do the recommendation».

describe('WooCommerce Store API', () => {
  it('turns minor units into decimal prices without floats', () => {
    expect(minorToDecimal('1250', 2)).toBe('12.50');
    expect(minorToDecimal('5', 2)).toBe('0.05');
    expect(minorToDecimal('900', 0)).toBe('900');
    expect(minorToDecimal('abc', 2)).toBe('');
  });

  it('reads products, sale prices, variations and categories from the public Store API', async () => {
    const page = [
      { id: 7, name: 'Taza Andina', slug: 'taza-andina', description: '<p>Cerámica</p>', prices: { price: '4500', regular_price: '5000', currency_code: 'BOB', currency_minor_unit: 2 },
        images: [{ src: 'https://tienda.bo/wp-content/taza.jpg' }], categories: [{ slug: 'cocina', name: 'Cocina' }], is_in_stock: true,
        attributes: [{ name: 'Color', has_variations: true, terms: [{ name: 'Rojo', slug: 'rojo' }, { name: 'Azul', slug: 'azul' }] }],
        variations: [{ id: 71, attributes: [{ name: 'Color', value: 'rojo' }] }, { id: 72, attributes: [{ name: 'Color', value: 'azul' }] }] },
      { id: 8, name: 'Plato', slug: 'plato', prices: { price: '3000', regular_price: '3000', currency_code: 'BOB', currency_minor_unit: 2 }, images: [], categories: [{ slug: 'cocina', name: 'Cocina' }] },
    ];
    const get = jest.fn(async (path: string) => path.includes('page=1') ? { status: 200, json: page } : { status: 200, json: [] });
    const store = await readWooStore('tienda.bo', get);
    expect(store.currency).toBe('BOB');
    expect(store.products[0]).toMatchObject({ handle: 'taza-andina', title: 'Taza Andina', optionNames: ['Color'], images: ['https://tienda.bo/wp-content/taza.jpg'] });
    expect(store.products[0].variants.map(v => [v.options, v.price, v.compareAtPrice])).toEqual([[['Rojo'], '45.00', '50.00'], [['Azul'], '45.00', '50.00']]);
    expect(store.products[1].variants).toEqual([expect.objectContaining({ options: [], price: '30.00', compareAtPrice: null })]);
    expect(store.collections).toEqual([{ handle: 'cocina', title: 'Cocina', description: '', productHandles: ['taza-andina', 'plato'] }]);
    expect(store.warnings[0]).toContain('precio del producto');
  });

  it('is «not WooCommerce» when the Store API does not answer', async () => {
    await expect(readWooStore('tienda.bo', async () => ({ status: 404, json: null }))).rejects.toMatchObject({ code: 'not_shopify' });
  });
});

describe('any shop through its sitemap', () => {
  const productPage = (name: string, price: string) => `<html><head><script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'Product', name,
    description: 'Hecho a mano', image: ['/media/a.jpg'], category: 'Hogar > Velas', offers: { '@type': 'Offer', price, priceCurrency: 'BOB', availability: 'https://schema.org/InStock' } })}</script></head><body>wixstatic.com</body></html>`;
  const site: Record<string, string> = {
    'https://velas.bo/sitemap.xml': '<sitemapindex><sitemap><loc>https://velas.bo/pages-sitemap.xml</loc></sitemap><sitemap><loc>https://velas.bo/store-products-sitemap.xml</loc></sitemap></sitemapindex>',
    'https://velas.bo/store-products-sitemap.xml': '<urlset><url><loc>https://velas.bo/product-page/vela-lavanda</loc></url><url><loc>https://velas.bo/product-page/vela-cedro</loc></url><url><loc>https://velas.bo/product-page/rota</loc></url></urlset>',
    'https://velas.bo/product-page/vela-lavanda': productPage('Vela Lavanda', '85.00'),
    'https://velas.bo/product-page/vela-cedro': productPage('Vela Cedro', '90'),
    'https://velas.bo/product-page/rota': '<html><body>Sin datos</body></html>',
  };
  const get = async (url: string) => site[url] ? { status: 200, body: site[url] } : { status: 404, body: '' };

  it('lists the product sitemap\'s pages, whatever their path', async () => {
    expect(await sitemapProductUrls(new URL('https://velas.bo/'), get)).toEqual(['https://velas.bo/product-page/vela-lavanda', 'https://velas.bo/product-page/vela-cedro', 'https://velas.bo/product-page/rota']);
  });

  it('reads each product page\'s own product data and names the platform', async () => {
    const store = await readSitemapStore('velas.bo', get);
    expect(store.platform).toBe('Wix');
    expect(store.currency).toBe('BOB');
    expect(store.products.map(p => [p.handle, p.title, p.variants[0].price, p.images[0]]).sort()).toEqual([
      ['vela-cedro', 'Vela Cedro', '90', 'https://velas.bo/media/a.jpg'], ['vela-lavanda', 'Vela Lavanda', '85.00', 'https://velas.bo/media/a.jpg']]);
    expect(store.collections[0]).toMatchObject({ handle: 'velas', title: 'Velas' });
    expect(store.warnings.join(' ')).toContain('1 páginas no se pudieron leer');
  });

  it('falls back to Open Graph product tags, and turns named offers into options', () => {
    const og = '<meta property="og:title" content="Mate &amp; bombilla"><meta property="product:price:amount" content="120,50"><meta property="product:price:currency" content="BOB"><meta property="og:image" content="/m.jpg">';
    expect(pageProduct(og, 'https://x.bo/p/mate')).toMatchObject({ name: 'Mate & bombilla', currency: 'BOB', images: ['https://x.bo/m.jpg'], offers: [{ price: '120.50' }] });
    const offers = `<script type="application/ld+json">${JSON.stringify({ '@type': 'Product', name: 'Polera', offers: [{ name: 'Polera - S', price: '80' }, { name: 'Polera - M', price: '85' }] })}</script>`;
    expect(pageProduct(offers, 'https://x.bo/p/polera')?.offers.map(o => o.name)).toEqual(['Polera - S', 'Polera - M']);
  });
});

describe('CSV exports from other platforms', () => {
  it('reads decimal prices in either convention', () => {
    expect(decimalPrice('1.250,50')).toBe('1250.50');
    expect(decimalPrice('1250,00')).toBe('1250.00');
    expect(decimalPrice('Bs 12.50')).toBe('12.50');
    expect(decimalPrice('1,250')).toBe('1250');
    expect(decimalPrice('')).toBe('');
  });

  it('reads a Wix export: products, option variants with surcharges, media ids and collections', () => {
    const csv = [
      'handleId,fieldType,name,description,productImageUrl,collection,sku,price,surcharge,visible,inventory,productOptionName1,productOptionDescription1',
      'p1,Product,Polera Boxy,Algodón,abc~mv2.jpg;https://x.bo/b.jpg,Poleras;Nuevo,,80,,true,InStock,Talla,S;M',
      'p1,Variant,,,,,PB-S,,0,true,10,,S',
      'p1,Variant,,,,,PB-M,,5,true,0,,M',
      'p2,Product,Oculta,,,,,10,,false,InStock,,',
    ].join('\n');
    const store = readPlatformCsv(csv, 'Boxy', 'boxy.bo')!;
    expect(store.platform).toBe('Wix');
    expect(store.products).toHaveLength(1);
    expect(store.products[0].images).toEqual(['https://static.wixstatic.com/media/abc~mv2.jpg', 'https://x.bo/b.jpg']);
    expect(store.products[0].variants.map(v => [v.options, v.price, v.available])).toEqual([[['S'], '80.00', true], [['M'], '85.00', false]]);
    expect(store.collections.map(c => c.title)).toEqual(['Poleras', 'Nuevo']);
  });

  it('reads a WooCommerce export: simple and variable products with their variations', () => {
    const csv = [
      'ID,Type,SKU,Name,Published,Description,In stock?,Stock,Sale price,Regular price,Categories,Tags,Images,Parent,Attribute 1 name,Attribute 1 value(s)',
      '10,simple,TZ,Taza,1,Cerámica,1,,45,50,Cocina > Tazas,,https://x.bo/t.jpg,,,',
      '11,variable,PL,Polera,1,,1,,,,Ropa,,https://x.bo/p.jpg,,Talla,"S, M"',
      '12,variation,PL-S,Polera - S,1,,1,,,80,,,,id:11,Talla,S',
      '13,variation,PL-M,Polera - M,1,,0,,,85,,,,id:11,Talla,M',
      '14,simple,,Borrador,0,,1,,,10,,,,,,',
    ].join('\n');
    const store = readPlatformCsv(csv, 'Tienda', 'x.bo')!;
    expect(store.platform).toBe('WooCommerce');
    expect(store.products.map(p => p.title)).toEqual(['Taza', 'Polera']);
    expect(store.products[0].variants[0]).toMatchObject({ price: '45', compareAtPrice: '50' });
    expect(store.products[1].variants.map(v => [v.options, v.price, v.available])).toEqual([[['S'], '80', true], [['M'], '85', false]]);
    expect(store.collections.map(c => c.title)).toEqual(['Tazas', 'Ropa']);
  });

  it('reads a Tiendanube export with semicolons, comma decimals and stock, and says it carries no photos', () => {
    const csv = [
      '"Identificador de URL";"Nombre";"Categorías";"Nombre de propiedad 1";"Valor de propiedad 1";"Precio";"Precio promocional";"Peso (kg)";"Stock";"SKU";"Mostrar en tienda";"Descripción";"Tags"',
      '"buzo-andino";"Buzo Andino";"Ropa > Buzos";"Talla";"S";"250,00";"";"0,50";"3";"BA-S";"SI";"Lana";""',
      '"buzo-andino";"";"";"Talla";"M";"250,00";"220,00";"0,50";"0";"BA-M";"";"";""',
    ].join('\n');
    const store = readPlatformCsv(csv, 'Andino', 'andino.bo')!;
    expect(store.platform).toBe('Tiendanube');
    expect(store.products[0]).toMatchObject({ handle: 'buzo-andino', title: 'Buzo Andino', optionNames: ['Talla'] });
    expect(store.products[0].variants.map(v => [v.options, v.price, v.compareAtPrice, v.inventoryQuantity, v.grams])).toEqual([[['S'], '250.00', null, 3, 500], [['M'], '220.00', '250.00', 0, 500]]);
    expect(store.stockKnown).toBe(true);
    expect(store.warnings.join(' ')).toContain('no trae fotos');
  });

  it('leaves any other file to the Shopify reader', () => {
    expect(readPlatformCsv('Handle,Title,Variant Price\nx,X,1', 'X', 'x.bo')).toBeNull();
  });
});

describe('one import for any shop', () => {
  const store = (name: string) => ({ host: 'x.bo', origin: 'https://x.bo/', name, currency: 'BOB', products: [], collections: [], articles: [], truncated: false, stockKnown: false, warnings: [] });
  const notThis = () => Promise.reject(new ShopifyReadError('not_shopify', 'no'));

  it('tries Shopify, then WooCommerce, then the sitemap', async () => {
    expect((await readAnyStore('x.bo', { shopify: () => Promise.resolve(store('s')), woo: notThis, sitemap: notThis as any })).platform).toBe('Shopify');
    expect((await readAnyStore('x.bo', { shopify: notThis, woo: () => Promise.resolve(store('w')), sitemap: notThis as any })).platform).toBe('WooCommerce');
    expect((await readAnyStore('x.bo', { shopify: notThis, woo: notThis, sitemap: () => Promise.resolve({ ...store('m'), platform: 'Wix' }) })).platform).toBe('Wix');
  });

  it('stops at a password-protected or unreachable shop instead of trying the next platform', async () => {
    const sitemap = jest.fn();
    await expect(readAnyStore('x.bo', { shopify: () => Promise.reject(new ShopifyReadError('protected', 'contraseña')), woo: notThis, sitemap })).rejects.toMatchObject({ code: 'protected' });
    expect(sitemap).not.toHaveBeenCalled();
  });
});
