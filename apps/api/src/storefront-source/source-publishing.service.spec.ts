import { experimentEvidence } from './source-publishing.service';
const old = new Date(Date.now() - 8 * 86400000);
describe('experiment evidence', () => {
  it('never picks the arm with more raw orders when its conversion rate is lower', () => {
    expect(experimentEvidence({ visitors: 10000, buyers: 300 }, { visitors: 2000, buyers: 200 }, old).winner).toBe('B');
  });
  it('requires duration, visitors, purchases and separated intervals', () => {
    expect(experimentEvidence({ visitors: 1000, buyers: 20 }, { visitors: 1000, buyers: 100 }, new Date()).winner).toBeNull();
    expect(experimentEvidence({ visitors: 100, buyers: 20 }, { visitors: 100, buyers: 60 }, old).winner).toBeNull();
    expect(experimentEvidence({ visitors: 1000, buyers: 10 }, { visitors: 1000, buyers: 100 }, old).winner).toBeNull();
    expect(experimentEvidence({ visitors: 1000, buyers: 30 }, { visitors: 1000, buyers: 32 }, old).winner).toBeNull();
    expect(experimentEvidence({ visitors: 1000, buyers: 20 }, { visitors: 1000, buyers: 100 }, old, new Date(), true).winner).toBeNull();
  });
});

import { SourcePublishingService } from './source-publishing.service';
it('serves merchant MP4 video bytes from the asset route while omitting private export tools', async () => {
  const prisma: any = { store: { findFirst: jest.fn().mockResolvedValue({ id: 's', publishedSourceRevision: 1 }) }, storeSourceExperiment: { findUnique: jest.fn().mockResolvedValue(null) }, storeSourceVersion: { findUnique: jest.fn().mockResolvedValue({ digest: 'a'.repeat(64) }) } };
  const service = new SourcePublishingService(prisma);
  jest.spyOn(service, 'snapshot').mockImplementation(async () => ({ schemaVersion: 1, brief: { businessType: '', audience: '', primaryAction: '', visualDirection: '' }, files: [
    { path: 'index.html', content: '<video controls src="assets/ritual.mp4"></video>', encoding: 'utf8' },
    { path: 'assets/ritual.mp4', content: Buffer.from('test-video').toString('base64'), encoding: 'base64' },
    { path: 'server.mjs', content: 'private export server', encoding: 'utf8' },
  ] }));
  const site = await service.publicSite('demo');
  expect(site.snapshot?.files.find(f => f.path === 'assets/ritual.mp4')).toEqual({ path: 'assets/ritual.mp4', encoding: 'url', content: '' });
  await expect(service.publicAsset('demo', '1-aaaaaaaaaaaa', 'assets/ritual.mp4')).resolves.toMatchObject({ contentType: 'video/mp4' });
  expect(site.snapshot?.files.some(f => f.path === 'server.mjs')).toBe(false);
});

import { sourceRuntimeDna } from './source-dna';
it('gives a published revision without a DNA a seeded one, and leaves an existing DNA alone', async () => {
  const prisma: any = { store: { findFirst: jest.fn().mockResolvedValue({ id: 'store-7', publishedSourceRevision: 1 }) }, storeSourceExperiment: { findUnique: jest.fn().mockResolvedValue(null) }, storeSourceVersion: { findUnique: jest.fn().mockResolvedValue({ digest: 'b'.repeat(64) }) } };
  const service = new SourcePublishingService(prisma);
  const config = (value: object) => ({ path: 'config.js', content: `window.PAGOSYA_CONFIG = ${JSON.stringify(value)};`, encoding: 'utf8' as const });
  const served = async (value: object) => {
    jest.spyOn(service, 'snapshot').mockResolvedValue({ schemaVersion: 1, brief: { businessType: '', audience: '', primaryAction: '', visualDirection: '' }, files: [{ path: 'index.html', content: '<main></main>', encoding: 'utf8' }, config(value)] } as any);
    const site = await service.publicSite('demo');
    return JSON.parse(site.snapshot!.files.find(f => f.path === 'config.js')!.content.match(/=\s*([\s\S]*?);?\s*$/)![1]);
  };
  expect((await served({ productPageStyle: 'dense', data: {} })).dna).toEqual(sourceRuntimeDna(undefined, 'store-7', 'dense'));
  expect((await served({ dna: { button: 'pill' } })).dna).toEqual({ button: 'pill' });
});

import { createHash } from 'node:crypto';
import { currentSourceRuntimeBundle } from './source-runtime';
import fs = require('node:fs/promises');
import { kitPath } from '@pagosya/storefront-kit';
import { creativeAssetCatalog, creativeAssetFile } from './source-creative-assets';
import { sourceProjectDigest, sourceProjectSnapshot, type SourceProjectSnapshot } from './source-project';

const checkRequired = 'Revisa la tienda en escritorio y móvil antes de publicarla.';
function checkedPublishing() {
  const snapshots = [1, 2].map(revision => ({ schemaVersion: 1, brief: { businessType: 'Café', audience: 'Vecinos', primaryAction: 'Comprar', visualDirection: 'Editorial' }, files: [
    { path: 'index.html', encoding: 'utf8', content: `<header>Marca propia</header><h1>Diseño ${revision}</h1><button data-cart-open>Pedido</button><div data-pagosya-catalog></div><script src="config.js"></script><script src="commerce.js"></script>` },
    { path: 'config.js', encoding: 'utf8', content: 'window.PAGOSYA_CONFIG = {};' },
    { path: 'commerce.js', encoding: 'utf8', content: '// stored runtime' },
    { path: 'package.json', encoding: 'utf8', content: '{"name":"test","scripts":{"build":"node build.mjs"}}' },
    { path: 'build.mjs', encoding: 'utf8', content: '// build' },
    { path: 'README.md', encoding: 'utf8', content: 'Proyecto' },
  ] } as SourceProjectSnapshot)).map(snapshot => sourceProjectSnapshot({ ...snapshot, revision: 0, label: 'Diseño' }));
  const results: any[] = [];
  const store = { publishedRuntimeDigest: null as string | null, id: 's', merchantId: 'm', status: 'ACTIVE', publicVisibility: true, sourcePublicationPaused: false, publishedSourceRevision: 1, checkoutMode: 'payment', merchant: { status: 'ACTIVE' } };
  const bundles = new Map<string, any>();
  const publications: any[] = [];
  const prisma: any = {
    sourceRuntimeBundle: {
      upsert: jest.fn(async ({ create }) => { if (!bundles.has(create.digest)) bundles.set(create.digest, create); return bundles.get(create.digest); }),
      findUniqueOrThrow: jest.fn(async ({ where }) => bundles.get(where.digest)),
    },
    storeRuntimePublication: {
      create: jest.fn(async ({ data }) => { publications.push(data); return data; }),
      findFirst: jest.fn(async ({ where }) => publications.find(row => row.storeId === where.storeId && row.digest === where.digest) || null),
    },
    store: { findFirst: jest.fn(async ({ where }) => where.merchantId === 'm' ? store : null), findUniqueOrThrow: jest.fn(async () => store), updateMany: jest.fn(async () => ({ count: 1 })), update: jest.fn(async ({ data }) => Object.assign(store, data)) },
    storeSourceVersion: { findUnique: jest.fn(async ({ where }) => { const revision = where.storeId_revision.revision; const snapshot = snapshots[revision - 1]; return snapshot ? { snapshot, digest: sourceProjectDigest(snapshot), label: 'Diseño' } : null; }) },
    sourceCheckResult: {
      create: jest.fn(async ({ data }) => { const row = { ...data, id: String(results.length), createdAt: new Date() }; results.push(row); return row; }),
      findFirst: jest.fn(async ({ where }) => results.slice().reverse().find(row => Object.entries(where).every(([key, value]) => row[key] === value)) || null),
    },
    storeSourceExperiment: { findUnique: jest.fn(async () => null), findFirst: jest.fn(async () => null), create: jest.fn(), updateMany: jest.fn(async () => ({ count: 1 })) },
  };
  prisma.$transaction = jest.fn(async work => work(prisma));
  const service = new SourcePublishingService(prisma);
  const record = (revision = 2, passed = true, merchant = 'm', findings: unknown = []) => service.recordChecks(merchant, 's', revision, { passed, findings: findings as unknown[] });
  return { service, prisma, results, snapshots, record, store, bundles, publications };
}

describe('persisted browser checks gate publication and experiment B', () => {
  afterEach(() => jest.restoreAllMocks());
  for (const action of ['publish', 'start'] as const) {
    it(`${action}: rejects an unchecked revision with 409 before changing publication`, async () => {
      const { service, prisma } = checkedPublishing();
      await expect(service[action]('m', 's', 2, 0)).rejects.toMatchObject({ status: 409, message: checkRequired });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
    it(`${action}: rejects a passing check for an older revision`, async () => {
      const { service, record } = checkedPublishing();
      await record(1);
      await expect(service[action]('m', 's', 2, 0)).rejects.toMatchObject({ status: 409, message: checkRequired });
    });
    it(`${action}: rejects a failing check`, async () => {
      const { service, record } = checkedPublishing();
      await record(2, false);
      await expect(service[action]('m', 's', 2, 0)).rejects.toMatchObject({ status: 409, message: checkRequired });
    });
    it(`${action}: accepts a passing check for the exact revision`, async () => {
      const { service, record, prisma } = checkedPublishing();
      await record();
      await expect(service[action]('m', 's', 2, 0)).resolves.toBeDefined();
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });
    it(`${action}: rejects checks after the commerce runtime changes`, async () => {
      const { service, record } = checkedPublishing();
      await record();
      const readFile = fs.readFile;
      jest.spyOn(fs, 'readFile').mockImplementation((async (path: any, ...args: any[]) => {
        const content = await (readFile as any)(path, ...args);
        return path === kitPath('retention.js') ? content + '\n// updated runtime' : content;
      }) as any);
      await expect(service[action]('m', 's', 2, 0)).rejects.toMatchObject({ status: 409, message: checkRequired });
    });
    it(`${action}: rejects a check with a different snapshot digest`, async () => {
      const { service, record, results } = checkedPublishing();
      await record(); results[0].snapshotDigest = 'stale';
      await expect(service[action]('m', 's', 2, 0)).rejects.toMatchObject({ status: 409, message: checkRequired });
    });
  }
  it('computes both digests on the server and persists failed findings too', async () => {
    const { record, results, snapshots } = checkedPublishing();
    const findings = [{ label: 'Móvil', status: 'failed', detail: 'El carrito no abre.' }];
    await record(2, false, 'm', findings);
    const runtime = await currentSourceRuntimeBundle();
    expect(results[0]).toMatchObject({ storeId: 's', revision: 2, passed: false, findings, snapshotDigest: sourceProjectDigest(snapshots[1]), runtimeDigest: runtime.digest });
  });
  it('denies another merchant before reading a revision or writing checks', async () => {
    const { record, prisma } = checkedPublishing();
    await expect(record(2, true, 'other')).rejects.toMatchObject({ status: 404 });
    expect(prisma.storeSourceVersion.findUnique).not.toHaveBeenCalled();
    expect(prisma.sourceCheckResult.create).not.toHaveBeenCalled();
  });
  it('rejects missing revisions and oversized or malformed findings', async () => {
    const { record, prisma } = checkedPublishing();
    await expect(record(99)).rejects.toMatchObject({ status: 404 });
    for (const findings of [null, {}, ['x'.repeat(65537)]]) await expect(record(2, true, 'm', findings)).rejects.toMatchObject({ status: 400 });
    expect(prisma.sourceCheckResult.create).not.toHaveBeenCalled();
  });
});


describe('versioned trusted runtime publications', () => {
  afterEach(() => jest.restoreAllMocks());
  const runtimePaths = ['privacy.js', 'commerce.js', 'retention.js', 'productos.html', 'coleccion.html', 'video.js', 'motion.js', 'product.html'].sort();
  const bundleFiles = () => Promise.all(runtimePaths.map(async path => ({ path, content: await fs.readFile(kitPath(path), 'utf8') })));
  const digestOf = (files: unknown) => createHash('sha256').update(JSON.stringify(files)).digest('hex');

  for (const action of ['publish', 'start'] as const) {
    it(`${action}: records the exact checked bundle for every publication while the store keeps following the latest kit`, async () => {
      const { service, prisma, record, store, bundles, publications } = checkedPublishing();
      const files = await bundleFiles();
      const check = await record();
      await service[action]('m', 's', 2, 0);
      await service[action]('m', 's', 2, 1);
      expect(check.runtimeDigest).toBe(digestOf(files));
      expect(store.publishedRuntimeDigest).toBeNull();
      expect(bundles.size).toBe(1);
      expect(bundles.get(check.runtimeDigest).files).toEqual(files);
      expect(publications).toEqual([0, 1].map(() => ({ storeId: 's', digest: check.runtimeDigest, publishedAt: expect.any(Date) })));
      expect(prisma.sourceRuntimeBundle.upsert).toHaveBeenCalledWith({ where: { digest: check.runtimeDigest }, create: { digest: check.runtimeDigest, files }, update: {} });
    });
    it(`${action}: rejects checks after a catalog page changes`, async () => {
      const { service, record } = checkedPublishing();
      await record();
      const readFile = fs.readFile;
      jest.spyOn(fs, 'readFile').mockImplementation((async (path: any, ...args: any[]) => {
        const content = await (readFile as any)(path, ...args);
        return path === kitPath('productos.html') ? content + '<!-- nueva versión -->' : content;
      }) as any);
      await expect(service[action]('m', 's', 2, 0)).rejects.toMatchObject({ status: 409, message: checkRequired });
    });
  }

  it('records the bytes checked before the transaction even if the installed kit changes during publication', async () => {
    const { service, prisma, record, bundles } = checkedPublishing();
    const check = await record();
    prisma.$transaction.mockImplementationOnce(async (work: any) => {
      const readFile = fs.readFile;
      jest.spyOn(fs, 'readFile').mockImplementation((async (path: any, ...args: any[]) => {
        const content = await (readFile as any)(path, ...args);
        return path === kitPath('commerce.js') ? content + '\n// cambio durante publicación' : content;
      }) as any);
      return work(prisma);
    });
    await service.publish('m', 's', 2, 0);
    expect(bundles.get(check.runtimeDigest).files.find((f: any) => f.path === 'commerce.js').content).not.toContain('cambio durante publicación');
  });

  it('applying an experiment winner neither records nor changes the runtime pin', async () => {
    const { service, prisma, record, store, publications } = checkedPublishing();
    await record();
    await service.start('m', 's', 2, 0);
    store.publishedRuntimeDigest = 'b'.repeat(64);
    const experiment = { id: 'experiment', status: 'RUNNING', controlRevision: 1, variantRevision: 2, startedAt: old };
    prisma.storeSourceExperiment.findFirst.mockResolvedValue(experiment);
    prisma.storeSourceVisit = { groupBy: jest.fn(async () => ['A', 'B'].map(variant => ({ variant, _count: 1000 }))) };
    prisma.storeOrder = { findMany: jest.fn(async () => ['A', 'B'].flatMap(variant => Array.from({ length: variant === 'A' ? 20 : 100 }, (_, index) => ({ sourceVisitId: `${variant}-${index}`, sourceVisit: { variant }, amount: 100, currency: 'BOB', paymentIntent: { transactions: [] } })))) };
    await service.finish('m', 's', 1, 'experiment', true);
    expect(store.publishedSourceRevision).toBe(2);
    expect(store.publishedRuntimeDigest).toBe('b'.repeat(64));
    expect(publications).toHaveLength(1);
  });

  it('serves pinned scripts and catalog templates after the installed kit changes; legacy views use the current kit', async () => {
    const { service, prisma, store, bundles } = checkedPublishing();
    const files = await bundleFiles();
    const digest = digestOf(files);
    bundles.set(digest, { digest, files });
    store.publishedRuntimeDigest = digest;
    prisma.store.findFirst.mockResolvedValue(store);
    const before = await service.publicSite('demo');
    const readFile = fs.readFile;
    jest.spyOn(fs, 'readFile').mockImplementation((async (path: any, ...args: any[]) => {
      const content = await (readFile as any)(path, ...args);
      return runtimePaths.some(name => path === kitPath(name)) ? content.replaceAll('Tu tienda', 'Nueva plantilla') + '\n/* kit modificado */' : content;
    }) as any);
    const after = await service.publicSite('demo');
    expect(after.snapshot?.files).toEqual(before.snapshot?.files);
    store.publishedRuntimeDigest = null;
    const legacy = await service.publicSite('demo');
    expect(legacy.snapshot?.files.find(f => f.path === 'commerce.js')?.content).toContain('kit modificado');
    expect(legacy.snapshot?.files).not.toEqual(before.snapshot?.files);
  });

  it('serves the old bundle after rollback without reverting the published design', async () => {
    const { service, prisma, record, store, publications } = checkedPublishing();
    const first = await record(1);
    await service.publish('m', 's', 1, 0);
    const readFile = fs.readFile;
    jest.spyOn(fs, 'readFile').mockImplementation((async (path: any, ...args: any[]) => {
      const content = await (readFile as any)(path, ...args);
      return path === kitPath('retention.js') ? content + '\n// segunda versión' : content;
    }) as any);
    await record(2);
    await service.publish('m', 's', 2, 1);
    expect(store.publishedRuntimeDigest).toBeNull();
    await service.rollbackRuntime('m', 's', first.runtimeDigest, 2);
    expect(store.publishedRuntimeDigest).toBe(first.runtimeDigest);
    prisma.store.findFirst.mockResolvedValue(store);
    const site = await service.publicSite('demo');
    expect(site.revision).toBe(2);
    expect(site.snapshot?.files.find(f => f.path === 'commerce.js')?.content).not.toContain('segunda versión');
    expect(site.snapshot?.files.find(f => f.path === 'index.html')?.content).toContain('Diseño 2');
    expect(publications).toHaveLength(2);
    // Returning to the latest kit, or publishing again, clears the rollback pin.
    await service.rollbackRuntime('m', 's', null, 3);
    expect(store.publishedRuntimeDigest).toBeNull();
    const latest = await service.publicSite('demo');
    expect(latest.snapshot?.files.find(f => f.path === 'commerce.js')?.content).toContain('segunda versión');
  });

  it('only allows the owner to roll back a digest previously published by this store, using the publication version', async () => {
    const { service, prisma, store, publications } = checkedPublishing();
    const digest = 'a'.repeat(64);
    publications.push({ storeId: 'another-store', digest });
    await expect(service.rollbackRuntime('other', 's', digest, 0)).rejects.toMatchObject({ status: 404 });
    await expect(service.rollbackRuntime('m', 's', digest, 0)).rejects.toMatchObject({ status: 404 });
    expect(prisma.store.update).not.toHaveBeenCalled();
    publications.push({ storeId: 's', digest });
    await service.rollbackRuntime('m', 's', digest, 0);
    expect(store.publishedRuntimeDigest).toBe(digest);
    expect(store.publishedSourceRevision).toBe(1);
    expect(prisma.store.updateMany).toHaveBeenLastCalledWith({ where: { id: 's', merchantId: 'm', sourcePublicationVersion: 0 }, data: { sourcePublicationVersion: { increment: 1 } } });
    const writes = prisma.store.update.mock.calls.length;
    const history = publications.length;
    prisma.store.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(service.rollbackRuntime('m', 's', digest, 0)).rejects.toMatchObject({ status: 409 });
    expect(prisma.store.update).toHaveBeenCalledTimes(writes);
    expect(publications).toHaveLength(history);
  });
});

it('serves the sanitised DNA motif drawings with the public site, as text the preview inlines', async () => {
  const prisma: any = { store: { findFirst: jest.fn().mockResolvedValue({ id: 's', publishedSourceRevision: 1 }) }, storeSourceExperiment: { findUnique: jest.fn().mockResolvedValue(null) }, storeSourceVersion: { findUnique: jest.fn().mockResolvedValue({ digest: 'c'.repeat(64) }) } };
  const service = new SourcePublishingService(prisma);
  const drawing = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M1 1h20"/></svg>';
  jest.spyOn(service, 'snapshot').mockResolvedValue({ schemaVersion: 1, brief: { businessType: '', audience: '', primaryAction: '', visualDirection: '' }, files: [
    { path: 'index.html', content: '<img src="motifs/sol.svg" alt="" aria-hidden="true">', encoding: 'utf8' },
    { path: 'motifs/sol.svg', content: drawing, encoding: 'utf8' },
    { path: 'assets/other.svg', content: drawing, encoding: 'utf8' },
  ] } as any);
  const site = await service.publicSite('demo');
  expect(site.snapshot?.files.find(f => f.path === 'motifs/sol.svg')).toEqual({ path: 'motifs/sol.svg', content: drawing, encoding: 'utf8' });
  // Only motif drawings, which every save sanitises; other SVG files stay private as before.
  expect(site.snapshot?.files.some(f => f.path === 'assets/other.svg')).toBe(false);
});

it('serves library illustrations byte-identical to the kit with the public site, and nothing posing as one', async () => {
  const prisma: any = { store: { findFirst: jest.fn().mockResolvedValue({ id: 's', publishedSourceRevision: 1 }) }, storeSourceExperiment: { findUnique: jest.fn().mockResolvedValue(null) }, storeSourceVersion: { findUnique: jest.fn().mockResolvedValue({ digest: 'c'.repeat(64) }) } };
  const service = new SourcePublishingService(prisma);
  const cone = creativeAssetFile(creativeAssetCatalog().find(asset => asset.path === 'assets/creative/fluent-mono/soft-ice-cream.svg')!);
  const coffee = creativeAssetFile(creativeAssetCatalog().find(asset => asset.path === 'assets/creative/fluent-flat/coffee.svg')!);
  jest.spyOn(service, 'snapshot').mockResolvedValue({ schemaVersion: 1, brief: { businessType: '', audience: '', primaryAction: '', visualDirection: '' }, files: [
    { path: 'index.html', content: '<img src="/assets/creative/fluent-flat/coffee.svg" alt="">', encoding: 'utf8' },
    cone,
    { ...coffee, content: coffee.content.replace('<svg', '<svg onload="alert(1)"') },
    { path: 'assets/creative/fluent-flat/not-in-kit.svg', content: cone.content, encoding: 'utf8' },
  ] } as any);
  const site = await service.publicSite('demo');
  expect(site.snapshot?.files.find(f => f.path === cone.path)).toEqual(cone);
  expect(site.snapshot?.files.some(f => f.path === coffee.path)).toBe(false);
  expect(site.snapshot?.files.some(f => f.path === 'assets/creative/fluent-flat/not-in-kit.svg')).toBe(false);
});

it('serves the store icons with the public site, sanitised, so the header bag and arrows are not blank', async () => {
  const prisma: any = { store: { findFirst: jest.fn().mockResolvedValue({ id: 's', publishedSourceRevision: 1 }) }, storeSourceExperiment: { findUnique: jest.fn().mockResolvedValue(null) }, storeSourceVersion: { findUnique: jest.fn().mockResolvedValue({ digest: 'c'.repeat(64) }) } };
  const service = new SourcePublishingService(prisma);
  const bag = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 10a4 4 0 0 1-8 0"/></svg>';
  jest.spyOn(service, 'snapshot').mockResolvedValue({ schemaVersion: 1, brief: { businessType: '', audience: '', primaryAction: '', visualDirection: '' }, files: [
    { path: 'index.html', content: '<img src="/assets/icons/shopping-bag.svg" alt="">', encoding: 'utf8' },
    { path: 'assets/icons/shopping-bag.svg', content: bag + '\n', encoding: 'utf8' },
    { path: 'assets/icons/x.svg', content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" onload="alert(1)"><script>alert(2)</script><path d="M1 1h20"/></svg>', encoding: 'utf8' },
    { path: 'assets/icons/LICENSE.txt', content: 'ISC', encoding: 'utf8' },
    { path: 'assets/other.svg', content: bag, encoding: 'utf8' },
  ] } as any);
  const files = (await service.publicSite('demo')).snapshot!.files;
  expect(files.find(f => f.path === 'assets/icons/shopping-bag.svg')).toEqual({ path: 'assets/icons/shopping-bag.svg', content: bag, encoding: 'utf8' });
  const x = files.find(f => f.path === 'assets/icons/x.svg');
  expect(x?.content ?? '').not.toMatch(/script|onload/);
  expect(files.some(f => f.path === 'assets/icons/LICENSE.txt' || f.path === 'assets/other.svg')).toBe(false);
});

describe('a published design with a drawn signup turns subscriptions on', () => {
  afterEach(() => jest.restoreAllMocks());
  const opener = '<section data-pagosya-subscribe-block><button type="button" data-pagosya-subscribe-open>Suscribirme</button></section>';
  async function publishWith(row: { settings: object; revision: number } | null, markup = opener) {
    const setup = checkedPublishing();
    const second = setup.snapshots[1];
    setup.snapshots[1] = sourceProjectSnapshot({ ...second, revision: 0, label: 'Diseño', files: second.files.map(f => f.path === 'index.html' ? { ...f, content: f.content + markup } : f) });
    setup.prisma.storeRetention = { findUnique: jest.fn(async () => row), createMany: jest.fn(async () => ({ count: 1 })), updateMany: jest.fn(async () => ({ count: 1 })) };
    await setup.record();
    await setup.service.publish('m', 's', 2, 0);
    return setup.prisma.storeRetention;
  }
  it('creates the setting for a store that never configured subscriptions', async () => {
    const retention = await publishWith(null);
    expect(retention.createMany).toHaveBeenCalledWith({ data: [{ storeId: 's', settings: { signupEnabled: true } }], skipDuplicates: true });
  });
  it('adds it to settings saved for other features, keeping them and bumping the revision', async () => {
    const retention = await publishWith({ settings: { emailWorkspace: { sender: 'x' } }, revision: 3 });
    expect(retention.updateMany).toHaveBeenCalledWith({ where: { storeId: 's', revision: 3 }, data: { settings: { emailWorkspace: { sender: 'x' }, signupEnabled: true }, revision: { increment: 1 } } });
  });
  it('respects a merchant who turned subscriptions off', async () => {
    const retention = await publishWith({ settings: { signupEnabled: false }, revision: 2 });
    expect(retention.createMany).not.toHaveBeenCalled();
    expect(retention.updateMany).not.toHaveBeenCalled();
  });
  it('leaves settings alone when the design draws no signup (a selector string does not count)', async () => {
    const retention = await publishWith(null, '<script>document.querySelector("[data-pagosya-subscribe-open]")</script>');
    expect(retention.findUnique).not.toHaveBeenCalled();
    expect(retention.createMany).not.toHaveBeenCalled();
  });
});
