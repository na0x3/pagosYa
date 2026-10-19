import sharp from 'sharp';
import { cropListingPhoto, parseListingRead } from './product-screenshot';

const read = { isListing: true, name: 'Licuadora Portátil 380ml', description: 'Recargable USB', priceText: 'US$ 18.30', currency: '', options: [{ name: 'Color', values: ['Rosa', 'Negro', 'Rosa'] }, { name: 'Talla', values: ['única'] }], photo: { x: 100, y: 200, width: 600, height: 500 }, catalogName: 'Licuadora portátil', catalogDescription: 'Batidos donde estés.' };

describe('parseListingRead (2026-10-18 product screenshot)', () => {
  it('keeps a listing with its price, options and photo box', () => {
    expect(parseListingRead(read, '/v1/uploads/a.png')).toEqual({
      listing: { url: '/v1/uploads/a.png', name: 'Licuadora Portátil 380ml', description: 'Recargable USB', price: 18.3, currency: 'USD', images: [], options: [{ name: 'Color', values: ['Rosa', 'Negro'] }], videos: [] },
      copy: { name: 'Licuadora portátil', description: 'Batidos donde estés.' },
      box: { x: 100, y: 200, width: 600, height: 500 },
    });
  });
  it('drops plain photos, nameless reads and unusable boxes', () => {
    expect(parseListingRead({ ...read, isListing: false }, 'x')).toBeNull();
    expect(parseListingRead({ ...read, name: ' ' }, 'x')).toBeNull();
    expect(parseListingRead({ ...read, photo: { x: 0, y: 0, width: 0, height: 0 } }, 'x')!.box).toBeNull();
    expect(parseListingRead({ ...read, photo: { x: 600, y: 0, width: 600, height: 500 } }, 'x')!.box).toBeNull();
    expect(parseListingRead({ ...read, priceText: '$25', currency: '' }, 'x')!.listing).toMatchObject({ price: 25, currency: null });
  });
});

describe('cropListingPhoto', () => {
  const screenshot = () => sharp({ create: { width: 1000, height: 1600, channels: 3, background: '#ffffff' } }).png().toBuffer();
  it('cuts out only the photo box', async () => {
    const crop = await cropListingPhoto(await screenshot(), { x: 100, y: 100, width: 800, height: 400 });
    expect(await sharp(crop!).metadata()).toMatchObject({ width: 800, height: 640, format: 'jpeg' });
  });
  it('refuses a crop too small to sell with', async () => {
    expect(await cropListingPhoto(await screenshot(), { x: 0, y: 0, width: 200, height: 100 })).toBeNull();
  });
});
