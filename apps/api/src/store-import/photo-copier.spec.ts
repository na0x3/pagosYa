import { copyPhotos } from './photo-copier';

// A real 1×1 PNG, so content detection sees a valid image.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const ok = (body = PNG) => ({ status: 200, url: new URL('https://cdn.shopify.com/x'), contentType: 'image/png', body });

describe('copyPhotos', () => {
  it('copies allowed photos once, resizes Shopify CDN requests and reuses earlier copies', async () => {
    const fetch = jest.fn(async () => ok()) as any;
    const save = jest.fn(async () => ({ url: '/v1/uploads/new.png' }));
    const result = await copyPhotos(['https://cdn.shopify.com/a.png?v=1', 'https://cdn.shopify.com/a.png?v=1', 'https://cdn.shopify.com/old.png'],
      { storeHost: 'mitienda.com', done: { 'https://cdn.shopify.com/old.png': '/v1/uploads/old.png' }, save, fetch });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(String(fetch.mock.calls[0][0])).toBe('https://cdn.shopify.com/a.png?v=1&width=1600');
    expect(save).toHaveBeenCalledWith(PNG, 'image/png');
    expect(result.urls).toEqual({ 'https://cdn.shopify.com/a.png?v=1': '/v1/uploads/new.png', 'https://cdn.shopify.com/old.png': '/v1/uploads/old.png' });
    expect(result.failed).toEqual([]);
  });

  it('refuses other hosts and non-images, and keeps going when one photo fails', async () => {
    const fetch = jest.fn(async (url: URL) => String(url).includes('bad') ? { ...ok(), body: Buffer.from('<html>') } : ok()) as any;
    const result = await copyPhotos(['https://evil.example/a.png', 'https://cdn.shopify.com/bad.png', 'https://mitienda.com/good.png'],
      { storeHost: 'mitienda.com', done: {}, save: async () => ({ url: '/v1/uploads/g.png' }), fetch });
    expect(result.failed).toEqual(['https://evil.example/a.png', 'https://cdn.shopify.com/bad.png']);
    expect(Object.keys(result.urls)).toEqual(['https://mitienda.com/good.png']);
  });
});
