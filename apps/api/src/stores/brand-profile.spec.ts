import { brandContext, brandFacts, brandStyles, linkBrandStylesheet } from './brand-profile';
import { detectedMediaMime } from '../uploads/uploads.service';
import { publicBrandUrl } from './brand-import';
import { BrandProfileService } from './brand-profile.service';
import { sourceUsage } from './source-generation-policy';

const fact = { field: 'accent' as const, value: '#135724', source: 'merchant', evidence: 'Color oficial' };
describe('Durable brand evidence', () => {
  afterEach(() => jest.restoreAllMocks());
  it('caches identical evidence without another model call and keeps interpretations unconfirmed', async () => {
    let saved: any = null;
    const prisma: any = { store: { findFirst: jest.fn().mockResolvedValue({ id: 's' }) }, mediaAsset: { findMany: jest.fn().mockResolvedValue([]) }, storeBrandRevision: { create: jest.fn() }, storeBrandProfile: {
      findUnique: jest.fn(async () => saved), upsert: jest.fn(async () => { saved ||= { revision: 0, data: { confirmed: [], suggested: [] } }; }),
      updateMany: jest.fn(async ({ where, data }: any) => { if (saved.revision !== where.revision) return { count: 0 }; saved = { ...saved, data: data.data, analysisHash: data.analysisHash, revision: saved.revision + 1 }; return { count: 1 }; }),
    }, $transaction: (fn: any) => fn(prisma) };
    const usage: any = { record: jest.fn() };
    const service = new BrandProfileService(prisma, { get: (key: string) => key.endsWith('apiKey') ? 'test-key' : true } as any, {} as any, usage);
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ status: 'completed', output: [{ content: [{ type: 'output_text', text: JSON.stringify({ facts: [fact] }) }] }], usage: { input_tokens: 100, output_tokens: 100 } })));
    const first = await service.analyze('m', 's', { revision: 0, text: 'El color oficial es #135724.' });
    expect(first.data).toEqual({ confirmed: [], suggested: [fact] });
    const second = await service.analyze('m', 's', { revision: first.revision, text: 'El color oficial es #135724.' });
    expect(second.cacheHit).toBe(true); expect(fetchMock).toHaveBeenCalledTimes(1); expect(usage.record).toHaveBeenCalledTimes(1);
  });
  it('keeps unconfirmed interpretations out of generation and CSS', () => {
    const data = { confirmed: [fact], suggested: [{ ...fact, field: 'background' as const, value: '#ffffff' }] };
    expect(brandContext(data)).toBe('{"accent":"#135724"}');
    expect(brandStyles(data)).toContain('--brand-accent: #135724;');
    expect(brandStyles(data)).not.toContain('#ffffff');
  });
  it('rejects injected CSS, duplicate fields and invalid evidence', () => {
    for (const facts of [[{ ...fact, value: 'red;}body{display:none}' }], [fact, fact], [{ ...fact, source: {} }], [{ ...fact, field: '__proto__' }]]) expect(() => brandFacts(facts)).toThrow();
  });
  it.each(['http://example.com', 'https://user:secret@example.com', 'https://127.0.0.1', 'https://[::1]', 'https://example.com:8443', 'https://localhost'])('rejects unsafe import address %s', url => expect(() => publicBrandUrl(url)).toThrow());
  it('checks ownership and rejects stale saves without overwriting evidence', async () => {
    const prisma: any = { store: { findFirst: jest.fn().mockResolvedValue({ id: 's' }) }, storeBrandProfile: { findUnique: jest.fn().mockResolvedValue(null), upsert: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 0 }) }, $transaction: jest.fn((fn: any) => fn(prisma)) };
    const service = new BrandProfileService(prisma, {} as any, {} as any, {} as any);
    await expect(service.save('m', 's', 0, { confirmed: [fact], suggested: [] })).rejects.toThrow('marca cambió');
    prisma.store.findFirst.mockResolvedValue(null);
    await expect(service.get('other', 's')).rejects.toThrow('Store not found');
  });
  it('charges cache writes once, separately from reads and reasoning output', () => {
    expect(sourceUsage('gpt-5.6-sol', { input_tokens: 1000, input_tokens_details: { cached_tokens: 400, cache_write_tokens: 500 }, output_tokens: 100 })).toMatchObject({ cacheWriteTokens: 500, providerMicroUsd: 5060 });
  });
  it('rejects fake font uploads and external font URLs; bundles only safe local font paths', () => {
    expect(detectedMediaMime(Buffer.from('wOF2 pretending to be a font'))).toBeNull();
    expect(() => brandFacts([{ ...fact, field: 'bodyFontUrl', value: 'https://fonts.example/font.woff2' }])).toThrow();
    const css = brandStyles({ confirmed: [fact], suggested: [] }, { bodyFontUrl: 'assets/font-abcdef123456.woff2', headingFontUrl: "evil');}" });
    expect(css).toContain("src: url('assets/font-abcdef123456.woff2')"); expect(css).toContain('--brand-body-font'); expect(css).not.toContain('evil');
  });
  it('loads the shared identity on nested pages and HTML fragments without duplicating links', () => {
    expect(linkBrandStylesheet('<!doctype html><html><body>Hola</body></html>', 'pages/about.html')).toContain('<head><link rel="stylesheet" href="../brand.css"></head>');
    const linked = '<head><link rel="stylesheet" href=\'brand.css\'></head>';
    expect(linkBrandStylesheet(linked, 'index.html')).toBe(linked);
    expect(linkBrandStylesheet('<main>Hola</main>', 'index.html')).toContain('href="brand.css"');
  });
});
