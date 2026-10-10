import sharp from 'sharp';
import { bundleSourceCatalogMedia } from './source-catalog-media';
import type { SourceProjectFileDto } from './dto/save-source-project.dto';

const origin = new URL('http://localhost:3001');
it('bundles photos added after generation, reuses original photos, and covers variants', async () => {
  const assets: SourceProjectFileDto[] = [];
  const retained: SourceProjectFileDto[] = [{ path: 'assets/original.webp', content: Buffer.from('original').toString('base64'), encoding: 'base64' }];
  const items = [{ imageUrls: ['/v1/uploads/aa.jpg', 'http://localhost:3001/v1/uploads/bb.png'], variants: [{ imageUrl: '/v1/uploads/bb.png' }] }];
  const read = jest.fn(async path => Buffer.from(path.includes('aa') ? 'original' : 'new photo'));
  await bundleSourceCatalogMedia(items, origin, retained, assets, read);
  expect(items[0].imageUrls).toEqual(['assets/original.webp', assets[0].path]);
  expect(items[0].variants[0].imageUrl).toBe(assets[0].path);
  expect(read).toHaveBeenCalledTimes(2);
  expect(assets).toHaveLength(1);
});
it('does not fetch foreign media or silently remove missing photos', async () => {
  const urls = ['https://foreign.test/v1/uploads/aa.jpg', '/v1/uploads/bb.jpg', 'assets/kept.jpg'];
  const items = [{ imageUrls: [...urls] }];
  const read = jest.fn(async () => null);
  const assets: SourceProjectFileDto[] = [];
  await bundleSourceCatalogMedia(items, origin, [], assets, read);
  expect(items[0].imageUrls).toEqual(urls);
  expect(read).toHaveBeenCalledTimes(1);
  expect(assets).toEqual([]);
});

it('hydrates a valid catalog upload larger than the historical attachment limit', async () => {
  const assets: SourceProjectFileDto[] = [];
  const items = [{ imageUrls: ['/v1/uploads/aa.png'] }];
  const bytes = await sharp({ create: { width: 1400, height: 1000, channels: 3, background: '#bc8578' } }).png({ compressionLevel: 0 }).toBuffer();
  expect(bytes.length).toBeGreaterThan(2_000_000);
  const legend: Array<{ original: string; path: string }> = [];
  await bundleSourceCatalogMedia(items, origin, [], assets, async () => bytes, legend);
  expect(items[0].imageUrls[0]).toBe(assets[0].path);
  expect(assets[0].content.length).toBeLessThan(2_800_000);
  expect(await sharp(Buffer.from(assets[0].content, 'base64')).metadata()).toMatchObject({ format: 'webp', width: 1400, height: 1000 });
  expect(legend).toEqual([{ original: '/v1/uploads/aa.png', path: assets[0].path }]);
});

it('bundles the photos inside product content blocks, so the preview never shows a broken block image', async () => {
  const assets: SourceProjectFileDto[] = [];
  const items = [{ imageUrls: ['/v1/uploads/aa.jpg'], contentBlocks: [
    { type: 'details', items: [{ imageUrl: '/v1/uploads/aa.jpg', title: 'Selección', text: 'x', alt: 'Mercado' }, { imageUrl: '/v1/uploads/cc.jpg', title: 'Otra', text: 'y', alt: 'Otra' }] },
    { type: 'media', imageUrl: '/v1/uploads/bb.jpg', alt: 'Foto' },
    { type: 'compare', beforeUrl: '/v1/uploads/bb.jpg', afterUrl: 'https://foreign.test/v1/uploads/dd.jpg', alt: 'Antes y después' },
    { type: 'features', items: [{ icon: 'leaf', label: 'Fresco' }] },
  ] }];
  const read = jest.fn(async (path: string) => Buffer.from(path));
  await bundleSourceCatalogMedia(items, origin, [], assets, read);
  const [details, media, compare, features] = items[0].contentBlocks as any[];
  expect(details.items.map((item: any) => item.imageUrl)).toEqual([items[0].imageUrls[0], expect.stringMatching(/^assets\/image-/)]);
  expect(media.imageUrl).toMatch(/^assets\/image-/);
  expect(compare.beforeUrl).toBe(media.imageUrl);
  expect(compare.afterUrl).toBe('https://foreign.test/v1/uploads/dd.jpg');
  expect(features.items).toEqual([{ icon: 'leaf', label: 'Fresco' }]);
  expect(assets).toHaveLength(3);
});
