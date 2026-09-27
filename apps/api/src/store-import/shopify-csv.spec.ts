import { parseCsv, readShopifyCsv } from './shopify-csv';

const CSV = [
  'Handle,Title,Body (HTML),Type,Tags,Option1 Name,Option1 Value,Option2 Name,Option2 Value,Variant SKU,Variant Grams,Variant Inventory Qty,Variant Price,Variant Compare At Price,Image Src,Image Position,Variant Image,Status',
  'croquetas,Croquetas Premium,"<p>Para perros, ""felices""</p>",Alimento,"perros, premium",Tamaño,1 kg,Sabor,Pollo,CR-1,1000,12,50.00,60.00,https://cdn.shopify.com/a.jpg,1,,active',
  'croquetas,,,,,,3 kg,,Pollo,CR-3,3000,0,120.00,,https://cdn.shopify.com/b.jpg,2,https://cdn.shopify.com/b.jpg,',
  'borrador,Borrador,,,,Title,Default Title,,,,0,5,10.00,,,,,draft',
].join('\r\n');

describe('Shopify CSV', () => {
  it('parses quotes, doubled quotes and CRLF', () => {
    expect(parseCsv('a,"b,""c""",d\r\n1,2,3')).toEqual([['a', 'b,"c"', 'd'], ['1', '2', '3']]);
  });

  it('keeps newlines inside quoted cells', () => {
    expect(parseCsv('a,"uno\ndos"\n1,2')).toEqual([['a', 'uno\ndos'], ['1', '2']]);
  });

  it('groups rows by handle into products with exact stock and skips drafts', () => {
    const data = readShopifyCsv(CSV, 'Mi tienda', 'mitienda.com');
    expect(data.stockKnown).toBe(true);
    expect(data.products).toHaveLength(1);
    const [product] = data.products;
    expect(product).toMatchObject({ handle: 'croquetas', title: 'Croquetas Premium', productType: 'Alimento', tags: ['perros', 'premium'], optionNames: ['Tamaño', 'Sabor'] });
    expect(product.bodyHtml).toBe('<p>Para perros, "felices"</p>');
    expect(product.variants).toEqual([
      expect.objectContaining({ options: ['1 kg', 'Pollo'], sku: 'CR-1', price: '50.00', compareAtPrice: '60.00', inventoryQuantity: 12, available: true, grams: 1000 }),
      expect.objectContaining({ options: ['3 kg', 'Pollo'], inventoryQuantity: 0, available: false, imageSrc: 'https://cdn.shopify.com/b.jpg' }),
    ]);
    expect(product.images).toEqual(['https://cdn.shopify.com/a.jpg', 'https://cdn.shopify.com/b.jpg']);
  });

  it('rejects a file that is not a Shopify product export', () => {
    expect(() => readShopifyCsv('nombre,precio\nA,1', 'x', 'x.com')).toThrow('no es una exportación de productos de Shopify');
  });
});
