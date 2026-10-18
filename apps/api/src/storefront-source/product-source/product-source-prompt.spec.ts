import { productSourceFailureReply, productSourceNoPhotosReply, productSourcePrompt, productSourceReplyNote } from './product-source-prompt';

const product = { name: 'Licuadora portátil', description: 'Batidos donde estés.', amount: 1830, currency: 'USD' as const, imageUrls: ['/v1/uploads/a.jpg', '/v1/uploads/b.jpg'], priceToConfirm: true };

describe('product source prompt and replies (spec 2026-10-18 product link store)', () => {
  it('tells the build to sell the one product, never the supplier, and never to print an unconfirmed price', () => {
    const block = productSourcePrompt({ ...product, variants: [{ name: 'Negro', amount: 1830 }, { name: 'Rosa', amount: 1830 }] }, 'High quality 2000mAh');
    expect(block).toContain('already in the catalog as «Licuadora portátil»');
    expect(block).toContain('Its options: Negro, Rosa.');
    expect(block).toContain('never copy a sentence): High quality 2000mAh');
    expect(block).toContain('Never mention the supplier');
    expect(block).toContain('never print a price in the page copy');
    expect(productSourcePrompt({ ...product, priceToConfirm: false }, '')).not.toContain('placeholder');
  });

  it('says where the product came from and what to confirm', () => {
    expect(productSourceReplyNote(product, 'Alibaba')).toBe('Traje «Licuadora portátil» de Alibaba con 2 fotos. Puse USD 18.30, el precio del anuncio: confirma tu precio de venta en Productos antes de publicar.');
    expect(productSourceReplyNote({ ...product, amount: 0, currency: 'BOB' }, 'Take App')).toContain('no tenía un precio en Bs o USD');
    expect(productSourceReplyNote({ ...product, priceToConfirm: false, imageUrls: ['/v1/uploads/a.jpg'] }, 'Amazon')).toBe('Traje «Licuadora portátil» de Amazon con 1 foto.');
  });

  it('asks for screenshots or photos, naming why', () => {
    expect(productSourceFailureReply('login', 'Facebook')).toMatch(/^Facebook solo muestra esa publicación con una cuenta iniciada.*Mándame capturas/);
    expect(productSourceFailureReply('blocked', 'Temu')).toContain('Temu no me dejó abrir ese enlace');
    expect(productSourceFailureReply('not-product', 'shop.com')).toContain('no encontré un producto');
    expect(productSourceFailureReply('unavailable', 'shop.com')).toMatch(/^No pude abrir ese enlace/);
    expect(productSourceNoPhotosReply('Licuadora', 'Alibaba')).toBe('Leí «Licuadora» en Alibaba, pero no pude traer sus fotos. Mándame las fotos del producto y armo toda tu tienda con ellas.');
  });
});
