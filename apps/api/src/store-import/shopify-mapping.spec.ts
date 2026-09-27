import { buildPreview, htmlToText, mapArticle, mapProduct, toCentavos } from './shopify-mapping';
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

  it('maps a single-variant product with its discount, weight, stock and photos', () => {
    expect(mapProduct(base, null, false)).toEqual({ product: { externalId: 'croquetas', name: 'Croquetas', description: 'Hola & chau\n\nDos\nlíneas', tags: ['perros'], categoryName: 'Alimento',
      amount: 5000, discountPercent: 20, stock: null, shippingWeightGrams: 1000, variants: [], imageSources: ['https://cdn.shopify.com/a.jpg'], skus: ['CR'] } });
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
});
