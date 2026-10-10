import { NotFoundException } from '@nestjs/common';
import sharp from 'sharp';
import { StoreFaviconService } from './store-favicon.service';

const store = { id: 's1', name: 'Estudio Eje', logoUrl: null as string | null, publishedSourceRevision: 3 as number | null };
function service(overrides: { store?: typeof store | null; files?: Array<{ path: string; content: string }>; logo?: Buffer | null | Error } = {}) {
  const prisma = {
    store: { findFirst: jest.fn(async () => overrides.store === undefined ? store : overrides.store) },
    $queryRaw: jest.fn(async () => overrides.files ?? [{ path: 'styles/globals.css', content: ':root{--store-background:#0b3d2e;--store-foreground:#ffffff}' }]),
  };
  const uploads = { getBuffer: jest.fn(async () => { if (overrides.logo instanceof Error) throw overrides.logo; return overrides.logo ?? null; }) };
  return { favicons: new StoreFaviconService(prisma as any, uploads as any), prisma, uploads };
}

describe('StoreFaviconService', () => {
  it('404s an unknown store', async () => {
    await expect(service({ store: null }).favicons.favicon('nope', 32)).rejects.toBeInstanceOf(NotFoundException);
  });
  it('draws the mark in the published colours and caches it by store, logo, revision and size', async () => {
    const { favicons, prisma } = service();
    const first = await favicons.favicon('eje', 32);
    const again = await favicons.favicon('eje', 32);
    expect(again.etag).toBe(first.etag);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    const { data } = await sharp(first.body).raw().toBuffer({ resolveWithObject: true });
    expect([data[0], data[1], data[2]]).toEqual([0x0b, 0x3d, 0x2e]);
    expect((await favicons.favicon('eje', 180)).etag).not.toBe(first.etag);
  });
  it('redraws after a rename: the name is part of the cache key and the ETag', async () => {
    const { favicons, prisma } = service();
    const before = await favicons.favicon('eje', 32);
    prisma.store.findFirst.mockResolvedValue({ ...store, name: 'Taller Norte' } as any);
    const after = await favicons.favicon('eje', 32);
    expect(after.etag).not.toBe(before.etag);
    expect(after.body.equals(before.body)).toBe(false);
  });
  it('uses the uploaded logo, and falls back to the mark when storage fails', async () => {
    const red = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#ff0000' } }).png().toBuffer();
    const withLogo = service({ store: { ...store, logoUrl: '/v1/uploads/0a1b2c3d-0000-4000-8000-000000000000.png' }, logo: red });
    const { data, info } = await sharp((await withLogo.favicons.favicon('eje', 32)).body).raw().toBuffer({ resolveWithObject: true });
    const centre = (16 * info.width + 16) * info.channels;
    expect([data[centre], data[centre + 1], data[centre + 2]]).toEqual([255, 0, 0]);
    const broken = service({ store: { ...store, logoUrl: '/v1/uploads/0a1b2c3d-0000-4000-8000-000000000000.png' }, logo: new Error('S3 down') });
    expect((await broken.favicons.favicon('eje', 32)).body.length).toBeGreaterThan(0);
  });
  it('never reads a logo that is not an upload, and skips the design query for an unpublished store', async () => {
    const { favicons, uploads, prisma } = service({ store: { ...store, logoUrl: 'https://cdn.example/logo.png', publishedSourceRevision: null } });
    await favicons.favicon('eje', 32);
    expect(uploads.getBuffer).not.toHaveBeenCalled();
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });
  it('serves the wordmark as SVG', async () => {
    const { body } = await service().favicons.logoSvg('eje');
    expect(body.toString()).toMatch(/^<svg [^>]*><path fill="#ffffff"/);
  });
});
