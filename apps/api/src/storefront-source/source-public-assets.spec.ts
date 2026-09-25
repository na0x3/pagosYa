import { NotFoundException } from '@nestjs/common';
import { SourcePublishingService } from './source-publishing.service';
import { SourceSiteController } from './source-publishing.controller';

const png = Buffer.from('fake-png-bytes');
const snapshot = { schemaVersion: 1, brief: { businessType: '', audience: '', primaryAction: '', visualDirection: '' }, files: [
  { path: 'index.html', content: '<img src="assets/a.png">', encoding: 'utf8' },
  { path: 'config.js', content: 'window.PAGOSYA_CONFIG = {};', encoding: 'utf8' },
  { path: 'assets/a.png', content: png.toString('base64'), encoding: 'base64' },
  { path: 'server.mjs', content: 'private', encoding: 'utf8' },
] };
const digest = 'a'.repeat(64);

function harness(opts: { experiment?: { controlRevision: number; variantRevision: number } | null } = {}) {
  const prisma: any = {
    store: { findFirst: jest.fn().mockResolvedValue({ id: 's', publishedSourceRevision: 3, publishedRuntimeDigest: null }) },
    storeSourceExperiment: { findUnique: jest.fn().mockResolvedValue(opts.experiment ?? null) },
    storeSourceVersion: { findUnique: jest.fn().mockResolvedValue({ digest }) },
  };
  const service = new SourcePublishingService(prisma);
  const loads = jest.spyOn(service, 'snapshot').mockImplementation(async () => structuredClone(snapshot) as any);
  return { service, prisma, loads };
}

describe('published source assets', () => {
  it('publicSite returns URL placeholders and an assetPath instead of bytes', async () => {
    const { service } = harness();
    const site: any = await service.publicSite('tienda');
    expect(site.assetPath).toBe('/stores/public/tienda/source-site/assets/3-aaaaaaaaaaaa/');
    expect(site.snapshot.files.find((f: any) => f.path === 'assets/a.png')).toEqual({ path: 'assets/a.png', encoding: 'url', content: '' });
    expect(site.snapshot.files.some((f: any) => f.path === 'server.mjs')).toBe(false);
  });

  it('serves the bytes with the right type and an ETag, and caches the revision in memory', async () => {
    const { service, loads } = harness();
    const file = await service.publicAsset('tienda', '3-aaaaaaaaaaaa', 'assets/a.png');
    expect(file.bytes.equals(png)).toBe(true);
    expect(file.contentType).toBe('image/png');
    expect(file.etag).toMatch(/^"[\w-]+"$/);
    await service.publicAsset('tienda', '3-aaaaaaaaaaaa', 'assets/a.png');
    expect(loads).toHaveBeenCalledTimes(1);
  });

  it('refuses unpublished revisions, a wrong digest, traversal and non-media paths', async () => {
    const { service } = harness();
    for (const [version, path] of [['2-aaaaaaaaaaaa', 'assets/a.png'], ['3-bbbbbbbbbbbb', 'assets/a.png'], ['3-aaaaaaaaaaaa', '../assets/a.png'], ['3-aaaaaaaaaaaa', 'assets//a.png'], ['3-aaaaaaaaaaaa', 'server.mjs'], ['3-aaaaaaaaaaaa', 'assets/missing.png'], ['x', 'assets/a.png']])
      await expect(service.publicAsset('tienda', version, path)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('serves an active experiment variant revision', async () => {
    const { service } = harness({ experiment: { controlRevision: 3, variantRevision: 4 } });
    await expect(service.publicAsset('tienda', '4-aaaaaaaaaaaa', 'assets/a.png')).resolves.toMatchObject({ contentType: 'image/png' });
  });

  it('the route sets immutable caching, nosniff, cross-origin and CORS for the sandbox', async () => {
    const { service } = harness();
    const controller = new SourceSiteController(service);
    const headers: Record<string, string> = {};
    const res: any = { set: (h: Record<string, string>) => Object.assign(headers, h), status: jest.fn() };
    const body = await controller.asset('tienda', '3-aaaaaaaaaaaa', ['assets', 'a.png'], res);
    expect(body).toBeDefined();
    expect(headers).toMatchObject({ 'Content-Type': 'image/png', 'X-Content-Type-Options': 'nosniff', 'Cross-Origin-Resource-Policy': 'cross-origin', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=31536000, immutable' });
    const notModified = await controller.asset('tienda', '3-aaaaaaaaaaaa', ['assets', 'a.png'], res, headers.ETag);
    expect(notModified).toBeUndefined();
    expect(res.status).toHaveBeenCalledWith(304);
  });
});

describe('published source assets — review fixes', () => {
  it('serves every media file the site JSON lists, including fonts the runtime adds at publish time', async () => {
    const { service, loads } = harness();
    loads.mockImplementation(async () => { const copy = structuredClone(snapshot); copy.files.push({ path: 'styles.css', content: "@font-face{font-family:F;src:url('assets/fraunces.ttf')}", encoding: 'utf8' }); return copy as any; });
    const site: any = await service.publicSite('tienda');
    const listed: string[] = site.snapshot.files.filter((f: any) => f.encoding === 'url').map((f: any) => f.path);
    expect(listed).toContain('assets/fraunces.ttf');
    for (const path of listed) await expect(service.publicAsset('tienda', '3-aaaaaaaaaaaa', path)).resolves.toMatchObject({ bytes: expect.any(Buffer) });
  });

  it('loads a revision once for a burst of concurrent requests, and retries after a failed load', async () => {
    const { service, loads } = harness();
    await Promise.all(Array.from({ length: 6 }, () => service.publicAsset('tienda', '3-aaaaaaaaaaaa', 'assets/a.png')));
    expect(loads).toHaveBeenCalledTimes(1);
    const other = harness();
    other.loads.mockRejectedValueOnce(new Error('db down'));
    await expect(other.service.publicAsset('tienda', '3-aaaaaaaaaaaa', 'assets/a.png')).rejects.toThrow('db down');
    await expect(other.service.publicAsset('tienda', '3-aaaaaaaaaaaa', 'assets/a.png')).resolves.toMatchObject({ contentType: 'image/png' });
  });

  it('answers byte ranges so Safari can play video, and refuses unsatisfiable ones', async () => {
    const { service } = harness();
    const controller = new SourceSiteController(service);
    const call = async (range?: string) => {
      const headers: Record<string, string> = {};
      const res: any = { set: (h: Record<string, string>) => Object.assign(headers, h), status: jest.fn() };
      const body = await controller.asset('tienda', '3-aaaaaaaaaaaa', ['assets', 'a.png'], res, undefined, range);
      return { headers, status: res.status, body };
    };
    const full = await call();
    expect(full.headers['Accept-Ranges']).toBe('bytes');
    const part = await call('bytes=0-3');
    expect(part.status).toHaveBeenCalledWith(206);
    expect(part.headers).toMatchObject({ 'Content-Range': `bytes 0-3/${png.length}`, 'Content-Length': '4', 'Accept-Ranges': 'bytes' });
    const tail = await call('bytes=10-');
    expect(tail.headers).toMatchObject({ 'Content-Range': `bytes 10-${png.length - 1}/${png.length}`, 'Content-Length': String(png.length - 10) });
    const bad = await call('bytes=99-');
    expect(bad.status).toHaveBeenCalledWith(416);
    expect(bad.headers['Content-Range']).toBe(`bytes */${png.length}`);
    expect(bad.body).toBeUndefined();
  });
});
