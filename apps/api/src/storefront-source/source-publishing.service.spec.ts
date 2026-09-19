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
it('keeps merchant MP4 video bytes in a published snapshot while omitting private export tools', async () => {
  const prisma: any = { store: { findFirst: jest.fn().mockResolvedValue({ id: 's', publishedSourceRevision: 1 }) }, storeSourceExperiment: { findUnique: jest.fn().mockResolvedValue(null) } };
  const service = new SourcePublishingService(prisma);
  jest.spyOn(service, 'snapshot').mockResolvedValue({ schemaVersion: 1, brief: { businessType: '', audience: '', primaryAction: '', visualDirection: '' }, files: [
    { path: 'index.html', content: '<video controls src="assets/ritual.mp4"></video>', encoding: 'utf8' },
    { path: 'assets/ritual.mp4', content: Buffer.from('test-video').toString('base64'), encoding: 'base64' },
    { path: 'server.mjs', content: 'private export server', encoding: 'utf8' },
  ] });
  const site = await service.publicSite('demo');
  expect(site.snapshot?.files.find(f => f.path === 'assets/ritual.mp4')?.content).toBe(Buffer.from('test-video').toString('base64'));
  expect(site.snapshot?.files.some(f => f.path === 'server.mjs')).toBe(false);
});

import { createHash } from 'node:crypto';
import fs = require('node:fs/promises');
import { kitPath } from '@pagosya/storefront-kit';
import { sourceProjectDigest, sourceProjectSnapshot, type SourceProjectSnapshot } from './source-project';

const checkRequired = 'Revisa la tienda en escritorio y móvil antes de publicarla.';
function checkedPublishing() {
  const snapshots = [1, 2].map(revision => ({ schemaVersion: 1, brief: { businessType: 'Café', audience: 'Vecinos', primaryAction: 'Comprar', visualDirection: 'Editorial' }, files: [
    { path: 'index.html', encoding: 'utf8', content: `<h1>Diseño ${revision}</h1><button data-cart-open>Pedido</button><div data-pagosya-catalog></div><script src="config.js"></script><script src="commerce.js"></script>` },
    { path: 'config.js', encoding: 'utf8', content: 'window.PAGOSYA_CONFIG = {};' },
    { path: 'commerce.js', encoding: 'utf8', content: '// stored runtime' },
    { path: 'package.json', encoding: 'utf8', content: '{"name":"test","scripts":{"build":"node build.mjs"}}' },
    { path: 'build.mjs', encoding: 'utf8', content: '// build' },
    { path: 'README.md', encoding: 'utf8', content: 'Proyecto' },
  ] } as SourceProjectSnapshot)).map(snapshot => sourceProjectSnapshot({ ...snapshot, revision: 0, label: 'Diseño' }));
  const results: any[] = [];
  const store = { id: 's', merchantId: 'm', status: 'ACTIVE', publicVisibility: true, sourcePublicationPaused: false, publishedSourceRevision: 1, checkoutMode: 'payment', merchant: { status: 'ACTIVE' } };
  const prisma: any = {
    store: { findFirst: jest.fn(async ({ where }) => where.merchantId === 'm' ? store : null), findUniqueOrThrow: jest.fn(async () => store), updateMany: jest.fn(async () => ({ count: 1 })), update: jest.fn() },
    storeSourceVersion: { findUnique: jest.fn(async ({ where }) => { const revision = where.storeId_revision.revision; const snapshot = snapshots[revision - 1]; return snapshot ? { snapshot, digest: sourceProjectDigest(snapshot), label: 'Diseño' } : null; }) },
    sourceCheckResult: {
      create: jest.fn(async ({ data }) => { const row = { ...data, id: String(results.length), createdAt: new Date() }; results.push(row); return row; }),
      findFirst: jest.fn(async ({ where }) => results.slice().reverse().find(row => Object.entries(where).every(([key, value]) => row[key] === value)) || null),
    },
    storeSourceExperiment: { findUnique: jest.fn(async () => null), findFirst: jest.fn(async () => null), create: jest.fn() },
  };
  prisma.$transaction = jest.fn(async work => work(prisma));
  const service = new SourcePublishingService(prisma);
  const record = (revision = 2, passed = true, merchant = 'm', findings: unknown = []) => service.recordChecks(merchant, 's', revision, { passed, findings: findings as unknown[] });
  return { service, prisma, results, snapshots, record };
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
    const commerce = (await Promise.all(['privacy.js', 'commerce.js', 'retention.js'].map(name => fs.readFile(kitPath(name), 'utf8')))).join('\n');
    expect(results[0]).toMatchObject({ storeId: 's', revision: 2, passed: false, findings, snapshotDigest: sourceProjectDigest(snapshots[1]), runtimeDigest: createHash('sha256').update(commerce).digest('hex') });
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
