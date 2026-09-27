import { buildPreview, htmlToText, mapArticle, mapProduct, storeName, toCentavos } from './shopify-mapping';
import type { ShopifyProduct, ShopifyStoreData } from './shopify-types';

const base: ShopifyProduct = { handle: 'croquetas', title: 'Croquetas', bodyHtml: '<p>Hola &amp; <b>chau</b></p><script>alert(1)</script><p>Dos<br>líneas</p>', productType: 'Alimento', tags: ['perros'],
  optionNames: ['Title'], variants: [{ id: '1', options: ['Default Title'], sku: 'CR', price: '50.00', compareAtPrice: '62.50', available: true, grams: 1000 }], images: ['https://cdn.shopify.com/a.jpg'] };

describe('Shopify → pagosYa mapping', () => {
  it('turns HTML into clean text with paragraphs and no scripts', () => {
    expect(htmlToText(base.bodyHtml)).toBe('Hola & chau\n\nDos\nlíneas');
    expect(htmlToText('<p>&#39;x&#39; &nbsp;y</p>')).toBe("'x' y");
  });

  it('converts prices to centavos, applying the exchange rate when the store is not in bolivianos', () => {
    expect(toCentavos('50.00', null)).toBe(5000);
    expect(toCentavos('10', 6960)).toBe(6960);
    expect(toCentavos('abc', null)).toBeNull();
  });

  it('converts with whole-number arithmetic, rounding half a centavo up', () => {
    // As doubles, 1.005 × 100 is 100.49999… and 0.145 × 100 is 14.499…: both used to lose a centavo.
    expect(toCentavos('1.005', null)).toBe(101);
    expect(toCentavos('0.145', null)).toBe(15);
    expect(toCentavos('19.99', 6960)).toBe(13913);
    expect(toCentavos('1.15', 6865)).toBe(789);
    expect(toCentavos('9999999999999999', null)).toBeNull();
  });

  it('cleans the store name the way the store form requires', () => {
    expect(storeName('  Mi\u202Etienda \n de  ropa ')).toBe('Mitienda de ropa');
    expect(storeName('\u0000')).toBe('Mi tienda');
    expect(storeName('x'.repeat(200))).toHaveLength(120);
  });

  it('warns in the review when the store has more photos than an import copies', () => {
    const many = { ...base, images: Array.from({ length: 10 }, (_, i) => `https://cdn.shopify.com/${i}.jpg`) };
    const products = Array.from({ length: 301 }, (_, i) => ({ ...many, handle: `p${i}`, images: many.images.map(src => `${src}?p=${i}`) }));
    const preview = buildPreview({ host: 'x.com', origin: 'https://x.com/', name: 'X', currency: 'BOB', products, collections: [], articles: [], truncated: false, stockKnown: false, warnings: [] });
    expect(preview.warnings).toContainEqual(expect.stringContaining('3.010 fotos; copiaremos las primeras 3.000'));
  });

  it('maps a single-variant product with its discount, weight, stock and photos', () => {
    expect(mapProduct(base, null, false)).toEqual({ product: { externalId: 'croquetas', name: 'Croquetas', description: 'Hola & chau\n\nDos\nlíneas', tags: ['perros'], categoryName: 'Alimento',
      amount: 5000, onSale: true, descriptionTruncated: false, stock: null, shippingWeightGrams: 1000, variants: [], imageSources: ['https://cdn.shopify.com/a.jpg'], skus: ['CR'] } });
  });

  it('maps option combinations into structured variants; sold out becomes zero stock', () => {
    const product = { ...base, optionNames: ['Tamaño', 'Sabor'], variants: [
      { ...base.variants[0], id: '1', options: ['1 kg', 'Pollo'], price: '50', compareAtPrice: null },
      { ...base.variants[0], id: '2', options: ['3 kg', 'Pollo'], price: '120', compareAtPrice: null, available: false, imageSrc: 'https://cdn.shopify.com/b.jpg' },
    ] };
    const mapped = mapProduct(product, null, false) as any;
    expect(mapped.product.amount).toBe(5000);
    expect(mapped.product.variants).toEqual([
      { name: '1 kg / Pollo', amount: 5000, stock: null, options: [{ name: 'Tamaño', value: '1 kg' }, { name: 'Sabor', value: 'Pollo' }] },
      { name: '3 kg / Pollo', amount: 12000, stock: 0, options: [{ name: 'Tamaño', value: '3 kg' }, { name: 'Sabor', value: 'Pollo' }], imageSource: 'https://cdn.shopify.com/b.jpg' },
    ]);
  });

  it('uses exact CSV stock when known', () => {
    const product = { ...base, variants: [{ ...base.variants[0], inventoryQuantity: 7 }] };
    expect((mapProduct(product, null, true) as any).product.stock).toBe(7);
  });

  it('names the problem instead of failing the whole import', () => {
    expect(mapProduct({ ...base, variants: [{ ...base.variants[0], price: '' }] }, null, false)).toEqual({ problem: 'Croquetas: no tiene precio.' });
    const duplicated = { ...base, optionNames: ['Talla'], variants: [{ ...base.variants[0], id: '1', options: ['M'] }, { ...base.variants[0], id: '2', options: ['m'] }] };
    expect((mapProduct(duplicated, null, false) as any).problem).toMatch(/^Croquetas: /);
  });

  it('maps pages and policies to unpublished article content with Spanish policy slugs', () => {
    expect(mapArticle({ kind: 'policy', handle: 'refund-policy', title: 'Refund policy', bodyHtml: '<p>30 días.</p>' }))
      .toEqual({ externalId: 'policy:refund-policy', slug: 'politica-de-devoluciones', title: 'Política de devoluciones', excerpt: '30 días.', body: '30 días.' });
    expect(mapArticle({ kind: 'page', handle: 'nosotros', title: 'Nosotros', bodyHtml: '<p>Somos</p>' }).slug).toBe('nosotros');
  });

  it('builds the review: counts, problems, the exchange-rate question and the stock warning', () => {
    const data: ShopifyStoreData = { host: 'x.com', origin: 'https://x.com/', name: 'X', currency: 'USD', products: [base, { ...base, handle: 'sin-precio', title: 'Sin precio', variants: [{ ...base.variants[0], price: '' }] }],
      collections: [{ handle: 'c', title: 'C', description: '', productHandles: ['croquetas'] }], articles: [{ kind: 'page', handle: 'p', title: 'P', bodyHtml: '' }], truncated: true, stockKnown: false, warnings: ['w'] };
    const preview = buildPreview(data);
    expect(preview.needsExchangeRate).toBe(true);
    expect(preview.counts).toEqual({ products: 2, variants: 2, collections: 1, pages: 1, policies: 0, photos: 1 });
    expect(preview.products[1]).toMatchObject({ externalId: 'sin-precio', problem: 'Sin precio: no tiene precio.' });
    expect(preview.warnings).toEqual(expect.arrayContaining(['w', expect.stringMatching(/stock no es público/), expect.stringMatching(/primeros 1\.000/)]));
  });

  // Final review, Critical #1: pagosYa discounts are scheduled (start + end); an undated percent broke later edits.
  it('imports the sale price without a pagosYa discount and flags the product as on sale', () => {
    const mapped = mapProduct(base, null, false) as any;
    expect(mapped.product).not.toHaveProperty('discountPercent');
    expect(mapped.product).toMatchObject({ amount: 5000, onSale: true });
    expect((mapProduct({ ...base, variants: [{ ...base.variants[0], compareAtPrice: null }] }, null, false) as any).product.onSale).toBe(false);
  });

  it('warns in the review about products that were on sale', () => {
    const data: ShopifyStoreData = { host: 'x.com', origin: 'https://x.com/', name: 'X', currency: 'BOB', products: [base], collections: [], articles: [], truncated: false, stockKnown: true, warnings: [] };
    expect(buildPreview(data).warnings.join(' ')).toMatch(/1 producto estaba en oferta/);
  });

  // Final review, Important #2: what the import writes must pass the product form's own limits, or the next edit fails.
  it('keeps names, descriptions and tags within the product limits and drops unsafe characters', () => {
    const long = { ...base, title: 'N'.repeat(150), bodyHtml: `<p>${'palabra '.repeat(100)}</p><p>&#8238;oculto</p>`, tags: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'x'.repeat(30)] };
    const product = (mapProduct(long, null, false) as any).product;
    expect(product.name).toHaveLength(120);
    expect(product.description.length).toBeLessThanOrEqual(500);
    expect(product.descriptionTruncated).toBe(true);
    expect(product.tags).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
    expect(htmlToText('<p>a&#8238;b\u0007c</p>')).toBe('abc');
  });
});
