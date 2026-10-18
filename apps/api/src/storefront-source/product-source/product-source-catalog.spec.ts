import { listingVariants, merchantPrice, productFromListing } from './product-source-catalog';

const listing = { url: 'https://x.com/p/1', name: 'Portable Blender USB Rechargeable 380ml 6 Blades Smoothie Maker For Travel Gym Office 2000mAh Juicer Cup Mini Mixer Personal Size Fresh', description: 'Supplier text', price: 18.3, currency: 'USD', images: [], options: [] };

describe('merchantPrice (spec 2026-10-18 product link store)', () => {
  it('reads the price the merchant wrote, either way round', () => {
    expect(merchantPrice('lo vendo a Bs 120')).toEqual({ amount: 12000, currency: 'BOB' });
    expect(merchantPrice('precio 85,50 bs')).toEqual({ amount: 8550, currency: 'BOB' });
    expect(merchantPrice('a 25 dólares')).toEqual({ amount: 2500, currency: 'USD' });
    expect(merchantPrice('USD 19.90 cada una')).toEqual({ amount: 1990, currency: 'USD' });
  });
  it('is null without a currency', () => {
    expect(merchantPrice('quiero vender 3 licuadoras de 380 ml')).toBeNull();
    expect(merchantPrice('https://x.com/p/1')).toBeNull();
  });
});

describe('productFromListing', () => {
  it("uses the merchant's price and confirms it", () => {
    expect(productFromListing(listing, { name: 'Licuadora portátil', description: 'Batidos donde estés.' }, 'véndela a Bs 150', ['/v1/uploads/a.jpg'])).toEqual({
      name: 'Licuadora portátil', description: 'Batidos donde estés.', amount: 15000, currency: 'BOB', imageUrls: ['/v1/uploads/a.jpg'], priceToConfirm: false,
    });
  });
  it("keeps the listing's BOB or USD price to confirm, else 0, and shortens the supplier title", () => {
    const usd = productFromListing(listing, undefined, 'arma mi tienda', []);
    expect(usd).toMatchObject({ amount: 1830, currency: 'USD', priceToConfirm: true });
    expect(usd.name.length).toBeLessThanOrEqual(120);
    expect(usd.name.endsWith('…')).toBe(true);
    expect(productFromListing({ ...listing, currency: 'ZMW' }, undefined, '', [])).toMatchObject({ amount: 0, currency: 'BOB', priceToConfirm: true });
  });
});

describe('listingVariants', () => {
  it('makes every combination of one or two groups at one price', () => {
    expect(listingVariants([{ name: 'Color', values: ['Negro', 'Rosa'] }, { name: 'Talla', values: ['S', 'M'] }], 1000)).toEqual([
      { name: 'Negro / S', amount: 1000, options: [{ name: 'Color', value: 'Negro' }, { name: 'Talla', value: 'S' }], stock: null },
      { name: 'Negro / M', amount: 1000, options: [{ name: 'Color', value: 'Negro' }, { name: 'Talla', value: 'M' }], stock: null },
      { name: 'Rosa / S', amount: 1000, options: [{ name: 'Color', value: 'Rosa' }, { name: 'Talla', value: 'S' }], stock: null },
      { name: 'Rosa / M', amount: 1000, options: [{ name: 'Color', value: 'Rosa' }, { name: 'Talla', value: 'M' }], stock: null },
    ]);
  });
  it('skips three groups or more than 24 combinations', () => {
    expect(listingVariants([{ name: 'A', values: ['1', '2'] }, { name: 'B', values: ['1', '2'] }, { name: 'C', values: ['1', '2'] }], 1)).toBeUndefined();
    expect(listingVariants([{ name: 'A', values: Array.from({ length: 5 }, (_, i) => `${i}`) }, { name: 'B', values: Array.from({ length: 5 }, (_, i) => `${i}`) }], 1)).toBeUndefined();
    expect(listingVariants([], 1)).toBeUndefined();
  });
});
