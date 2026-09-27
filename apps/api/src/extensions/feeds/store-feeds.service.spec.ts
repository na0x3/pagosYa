import { NotFoundException } from '@nestjs/common';
import { StoreFeedsService } from './store-feeds.service';

function setup(installation: any) {
  const prisma: any = { storeExtension: { findUnique: jest.fn(async () => installation) } };
  const seo: any = { context: jest.fn(async () => ({ store: { id: 's', name: 'Café' }, home: 'https://micafe.com/', productUrl: (id: string) => `https://micafe.com/p/${id}` })) };
  const publicStores: any = { getStorePublic: jest.fn(async () => ({ items: [{ id: 'p1', name: 'Taza', description: '', imageUrls: ['/v1/uploads/a.png'], amount: 1000, currency: 'BOB', stock: null, variants: [] }] })) };
  return { service: new StoreFeedsService(prisma, seo, publicStores, { get: () => undefined } as any), publicStores };
}

describe('StoreFeedsService', () => {
  it('serves the feed of an installed, enabled feed extension, cached for an hour', async () => {
    const { service, publicStores } = setup({ enabled: true });
    expect(await service.feed('cafe', 'google-shopping.xml')).toContain('<g:id>p1</g:id>');
    await service.feed('cafe', 'google-shopping.xml');
    expect(publicStores.getStorePublic).toHaveBeenCalledTimes(1);
  });

  it('404s when the extension is missing, paused, not a feed, or the file is malformed', async () => {
    await expect(setup(null).service.feed('cafe', 'google-shopping.xml')).rejects.toBeInstanceOf(NotFoundException);
    await expect(setup({ enabled: false }).service.feed('cafe', 'meta-catalog.xml')).rejects.toBeInstanceOf(NotFoundException);
    await expect(setup({ enabled: true }).service.feed('cafe', 'meta-pixel.xml')).rejects.toBeInstanceOf(NotFoundException);
    await expect(setup({ enabled: true }).service.feed('cafe', 'google-shopping')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('counts what the feed leaves out, for the extension card', async () => {
    await expect(setup({ enabled: true }).service.summary('cafe')).resolves.toEqual({ skipped: { noPhoto: 0, noPrice: 0 } });
  });
});
