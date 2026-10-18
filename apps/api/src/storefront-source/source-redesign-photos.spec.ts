import { createHash } from 'node:crypto';
import { recoverStorePhotos, savedStorePhotos } from './source-redesign-photos';

/** baek 2026-10-16 and florart 2026-10-18: a redesign with nothing attached must start from the store's own photos. */
const bytes = (label: string) => Buffer.from(`photo ${label}`);
const pathOf = (label: string, ext = 'jpg') => `assets/image-${createHash('sha256').update(bytes(label)).digest('hex').slice(0, 12)}.${ext}`;
const manifest = (assets: Array<{ path: string; role: string; description?: string }>) => ({ path: 'visual-assets.json', content: JSON.stringify({ version: 1, assets }) });
const file = (path: string) => ({ path, content: 'AAAA', encoding: 'base64' as const });
const uploads: Record<string, Buffer> = { '/v1/uploads/a.jpg': bytes('a'), '/v1/uploads/b.jpg': bytes('b'), '/v1/uploads/c.jpg': bytes('c'), '/v1/uploads/r.jpg': bytes('r') };
const project = [
  file(pathOf('a')), file(pathOf('b')), file(pathOf('r')), file('assets/icons/check.svg'), file('assets/creative/x.png'),
  manifest([{ path: pathOf('a'), role: 'business', description: 'Ramo naranja' }, { path: pathOf('b'), role: 'product', description: 'Bouquet' }, { path: pathOf('r'), role: 'reference' }]),
];

describe('a redesign keeps the store photos', () => {
  it('lists only the saved content photos: never a reference, an icon or a platform illustration', () => {
    expect(savedStorePhotos(project).map(photo => [photo.path, photo.role])).toEqual([[pathOf('a'), 'business'], [pathOf('b'), 'product']]);
  });

  it('finds the upload behind each saved photo by content, with its confirmed role and description, and stops reading once all are found', async () => {
    const read = jest.fn(async (url: string) => uploads[url] ?? null);
    const result = await recoverStorePhotos({ files: project, candidates: ['/v1/uploads/c.jpg', '/v1/uploads/b.jpg', '/v1/uploads/a.jpg', '/v1/uploads/r.jpg'], read, limit: 24 });
    expect(result.assetUrls).toEqual(['/v1/uploads/a.jpg', '/v1/uploads/b.jpg']);
    expect(result.imageUses).toEqual([{ url: '/v1/uploads/a.jpg', role: 'business', description: 'Ramo naranja' }, { url: '/v1/uploads/b.jpg', role: 'product', description: 'Bouquet' }]);
    expect(read).toHaveBeenCalledTimes(3);
  });

  it('keeps what it found when an upload is gone or unreadable, and respects the limit', async () => {
    const read = async (url: string) => { if (url.includes('b')) throw new Error('gone'); return uploads[url] ?? null; };
    expect((await recoverStorePhotos({ files: project, candidates: ['/v1/uploads/b.jpg', '/v1/uploads/a.jpg'], read, limit: 24 })).assetUrls).toEqual(['/v1/uploads/a.jpg']);
    expect((await recoverStorePhotos({ files: project, candidates: Object.keys(uploads), read: async url => uploads[url], limit: 1 })).assetUrls).toEqual(['/v1/uploads/a.jpg']);
  });
});
