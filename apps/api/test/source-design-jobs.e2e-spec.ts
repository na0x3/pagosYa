import { SourceDesignJobWorker } from '../src/stores/source-design-job.worker';
import * as visualCapture from '../src/stores/source-visual-capture';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../src/prisma/prisma.service';
import { SourceProjectsService } from '../src/stores/source-projects.service';
import { SourceDesignJobsService } from '../src/stores/source-design-jobs.service';
import { sourceProjectDigest, sourceProjectSnapshot } from '../src/stores/source-project';

describe('Durable design jobs with PostgreSQL', () => {
  const prisma = new PrismaClient();
  const projects = new SourceProjectsService(prisma as PrismaService);
  const jobs = new SourceDesignJobsService(prisma as PrismaService, projects, new ConfigService({ app: { sourceDesignJobsEnabled: true } }));
  let merchantId: string, storeId: string;
  const snapshot = sourceProjectSnapshot({ revision: 1, label: 'Base', brief: { businessType: 'Café', audience: 'Vecinos', primaryAction: 'Comprar', visualDirection: 'Carta clara' }, files: [{ path: 'index.html', content: '<!doctype html><h1>Café</h1><button data-cart-open>Carrito</button><div data-pagosya-catalog></div><div data-pagosya-cart></div><p data-pagosya-status></p><script src="config.js" defer></script><script src="commerce.js" defer></script>' }, { path: 'config.js', content: 'window.PAGOSYA_CONFIG = {"data":{"items":[]}};' }, { path: 'commerce.js', content: '// Runtime fixture' }, { path: 'package.json', content: '{"name":"job-test","scripts":{"build":"node build.mjs"}}' }, { path: 'README.md', content: '# Job test' }] });
  const input = () => ({ requestId: randomUUID(), revision: 1, page: 'index.html', maxCredits: 150, maxRepairs: 2 });
  beforeAll(() => prisma.$connect());
  beforeEach(async () => {
    const merchant = await prisma.merchant.create({ data: { name: 'Job test', email: randomUUID() + '@local.invalid' } }); merchantId = merchant.id;
    const store = await prisma.store.create({ data: { merchantId, name: 'Café', slug: randomUUID().slice(0, 8) } }); storeId = store.id;
    await prisma.storeSourceProject.create({ data: { storeId, revision: 1, versions: { create: { revision: 1, label: 'Base', digest: sourceProjectDigest(snapshot), snapshot: snapshot as any } } } });
  });
  afterEach(async () => { jest.restoreAllMocks(); await prisma.store.delete({ where: { id: storeId } }); await prisma.merchant.delete({ where: { id: merchantId } }); });
  afterAll(() => prisma.$disconnect());

  for (const preference of ['candidate', 'baseline'] as const) it(`runs all durable stages and ${preference === 'candidate' ? 'applies' : 'rejects'} a prepared repair`, async () => {
    const captures = ['desktop', 'mobile'].map(viewport => ({ viewport, width: viewport === 'desktop' ? 1280 : 390, height: 844, y: 0, pageHeight: 844, state: 'initial', readiness: { fontsLoaded: true, missingImages: 0, scrollWidth: viewport === 'desktop' ? 1280 : 390 }, image: 'data:image/jpeg;base64,AA==' }));
    jest.spyOn(visualCapture, 'captureSourceVisuals').mockResolvedValue(captures as any);
    jest.spyOn(visualCapture, 'probeSourceShopping').mockResolvedValue([{ width: 390, productId: 'p', status: 'passed' }]);
    const generator: any = { catalog: jest.fn().mockResolvedValue({ items: [] }), generate: jest.fn(async (...args: any[]) => ({ generation: { attempts: [{ usage: { providerMicroUsd: 30000 } }] }, candidate: sourceProjectSnapshot({ ...args[6].snapshot, revision: 1, label: 'Repair', files: args[6].snapshot.files.map((f: any) => f.path === 'index.html' ? { ...f, content: f.content.replace('<h1>', '<h1 style="line-height:1.1">') } : f) }) })) };
    const evaluator: any = { assess: jest.fn().mockResolvedValueOnce({ summary: 'Mejorar jerarquía', findings: [{ severity: 'major', observation: 'Jerarquía', correction: 'Ajustar tipografía' }], preference: 'uncertain', regressions: [], providerMicroUsd: 10000 }).mockResolvedValueOnce({ summary: 'Comparación', findings: [], preference, regressions: [], providerMicroUsd: 20000 }) };
    const worker = new SourceDesignJobWorker(jobs, projects, generator, { hydrate: async (s: any) => s } as any, evaluator);
    const created = await jobs.create(merchantId, storeId, input());
    for (let i = 0; i < 8; i++) await worker.tick();
    const result = await jobs.get(merchantId, storeId, created.id);
    expect(result.error).toBeNull();
    expect(result.status).toBe(preference === 'candidate' ? 'APPLIED' : 'RETAINED_BASELINE');
    expect(result.observedCredits).toBe(6);
    expect((await projects.current(merchantId, storeId)).revision).toBe(preference === 'candidate' ? 2 : 1);
    expect(generator.generate).toHaveBeenCalledTimes(1);
    expect(evaluator.assess).toHaveBeenCalledTimes(2);
  });

  it('preserves the repair index when retrying an interrupted paid attempt', async () => {
    const created = await jobs.create(merchantId, storeId, { ...input(), maxCredits: 250, maxRepairs: 1 });
    await prisma.storeSourceDesignJob.update({ where: { id: created.id }, data: { stage: 'REPAIR' } });
    const first = (await jobs.claim())!; await jobs.reserve(first);
    expect(first.repairs).toBe(0);
    await prisma.storeSourceDesignJob.update({ where: { id: first.id }, data: { leaseUntil: new Date(0) } }); await jobs.expire();
    expect((await jobs.get(merchantId, storeId, first.id)).resumeAvailable).toBe(true);
    await jobs.resume(merchantId, storeId, first.id); const second = (await jobs.claim())!; await jobs.reserve(second);
    expect((second.receipts as any[]).map(r => r.repair)).toEqual([1, 1]);
    expect(second.reservedMicroUsd).toBe(1700000);
  });
  it('does not claim a delayed job and detects retention edits', async () => {
    const created = await jobs.create(merchantId, storeId, input());
    const job = (await jobs.claim())!;
    await jobs.checkpoint(job, { status: 'QUEUED', leaseToken: null, leaseUntil: null, availableAt: new Date(Date.now() + 15000) });
    expect(await jobs.claim()).toBeNull();
    await prisma.storeRetention.create({ data: { storeId, settings: {} } });
    await expect(jobs.assertFresh(job, merchantId)).rejects.toThrow('catálogo');
  });
  it('marks cancelled pending receipts unknown without releasing their allowance', async () => {
    const created = await jobs.create(merchantId, storeId, input());
    await prisma.storeSourceDesignJob.update({ where: { id: created.id }, data: { stage: 'REVIEW_BASELINE' } });
    const job = (await jobs.claim())!; await jobs.reserve(job); await jobs.cancel(merchantId, storeId, job.id);
    const result = await jobs.get(merchantId, storeId, job.id);
    expect((result.receipts as any[])[0].status).toBe('unknown'); expect(result.reservedCredits).toBe(15);
  });

  it('expires old private evidence while keeping spend receipts and source revisions', async () => {
    const created = await jobs.create(merchantId, storeId, input()); const job = (await jobs.claim())!;
    await jobs.stageResult(job, { status: 'FAILED', activeStoreId: null }, { baseline: snapshot });
    await prisma.storeSourceDesignJob.update({ where: { id: created.id }, data: { updatedAt: new Date(Date.now() - 31 * 86400000) } });
    await jobs.pruneEvidence();
    expect((await jobs.get(merchantId, storeId, created.id)).status).toBe('EXPIRED');
    expect(await prisma.storeSourceDesignArtifact.count({ where: { jobId: created.id } })).toBe(0);
    expect((await projects.current(merchantId, storeId)).revision).toBe(1);
  });

  it('deduplicates the same request and rejects reuse with a changed budget', async () => {
    const request = input(); const a = await jobs.create(merchantId, storeId, request), b = await jobs.create(merchantId, storeId, request);
    expect(a.id).toBe(b.id);
    await expect(jobs.create(merchantId, storeId, { ...request, maxCredits: 200 })).rejects.toThrow('otra solicitud');
    await expect(jobs.get('another-merchant', storeId, a.id)).rejects.toThrow('no encontrado');
  });
  it('permits one active job and one lease under simultaneous requests', async () => {
    const creates = await Promise.allSettled([jobs.create(merchantId, storeId, input()), jobs.create(merchantId, storeId, input())]);
    expect(creates.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    const claims = await Promise.all([jobs.claim(), jobs.claim()]);
    expect(claims.filter(Boolean)).toHaveLength(1);
  });
  it('resumes after a paid interruption without losing its held budget or reusing its old lease', async () => {
    const created = await jobs.create(merchantId, storeId, input());
    await prisma.storeSourceDesignJob.update({ where: { id: created.id }, data: { stage: 'REVIEW_BASELINE' } });
    const first = (await jobs.claim())!; await jobs.reserve(first);
    await prisma.storeSourceDesignJob.update({ where: { id: first.id }, data: { leaseUntil: new Date(0) } });
    await jobs.expire();
    const interrupted = await jobs.get(merchantId, storeId, first.id);
    expect(interrupted.status).toBe('INTERRUPTED'); expect(interrupted.reservedCredits).toBe(15);
    await jobs.resume(merchantId, storeId, first.id);
    const second = (await jobs.claim())!; expect(second.leaseToken).not.toBe(first.leaseToken);
    await expect(jobs.checkpoint(first, { status: 'APPLIED' })).rejects.toThrow();
    await jobs.reserve(second);
    expect((await jobs.get(merchantId, storeId, second.id)).reservedCredits).toBe(30);
    await jobs.checkpoint(second, jobs.settlement(second, 25000));
    const settled = await jobs.get(merchantId, storeId, second.id);
    expect(settled.reservedCredits).toBe(17.5); expect(settled.observedCredits).toBe(2.5);
  });
  it('retries an expired nonpaid checkpoint without inventing spend', async () => {
    await jobs.create(merchantId, storeId, input()); const first = (await jobs.claim())!;
    await prisma.storeSourceDesignJob.update({ where: { id: first.id }, data: { leaseUntil: new Date(0) } }); await jobs.expire();
    expect((await jobs.get(merchantId, storeId, first.id)).status).toBe('QUEUED');
    expect((await jobs.claim())!.reservedMicroUsd).toBe(0);
  });
  it('blocks a stage whose reservation would exceed the total allowance', async () => {
    const created = await jobs.create(merchantId, storeId, { ...input(), maxCredits: 10 });
    await prisma.storeSourceDesignJob.update({ where: { id: created.id }, data: { stage: 'REVIEW_BASELINE' } });
    const job = (await jobs.claim())!; await expect(jobs.reserve(job)).rejects.toThrow('presupuesto');
    expect((await jobs.get(merchantId, storeId, job.id)).reservedCredits).toBe(0);
  });
  it('records observed overspend honestly and prevents another reservation', async () => {
    const created = await jobs.create(merchantId, storeId, { ...input(), maxCredits: 20 });
    await prisma.storeSourceDesignJob.update({ where: { id: created.id }, data: { stage: 'REVIEW_BASELINE' } });
    const job = (await jobs.claim())!; await jobs.reserve(job); await jobs.checkpoint(job, jobs.settlement(job, 250000));
    const refreshed = await prisma.storeSourceDesignJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(refreshed.reservedMicroUsd).toBe(250000); await expect(jobs.reserve(refreshed)).rejects.toThrow('presupuesto');
  });
  it('cancellation fences later writes and makes the old heartbeat fail', async () => {
    await jobs.create(merchantId, storeId, input()); const job = (await jobs.claim())!;
    await jobs.cancel(merchantId, storeId, job.id);
    expect(await jobs.heartbeat(job)).toBe(false);
    await expect(jobs.checkpoint(job, { status: 'APPLIED' })).rejects.toThrow();
    expect((await projects.current(merchantId, storeId)).revision).toBe(1);
  });
  it('detects catalog edits even without a new source revision', async () => {
    await jobs.create(merchantId, storeId, input()); const job = (await jobs.claim())!;
    await prisma.paymentLink.create({ data: { storeId, name: 'Café', amount: 1500, currency: 'BOB' } });
    await expect(jobs.assertFresh(job, merchantId)).rejects.toThrow('catálogo');
  });
  it('applies exact candidate bytes atomically with the job result and leaves publication untouched', async () => {
    const created = await jobs.create(merchantId, storeId, input()); const job = (await jobs.claim())!;
    await projects.applyPrepared(merchantId, storeId, 1, snapshot, sourceProjectDigest(snapshot), async tx => {
      const changed = await tx.storeSourceDesignJob.updateMany({ where: jobs.fence(job), data: { status: 'APPLIED', activeStoreId: null, resultRevision: 2 } });
      if (!changed.count) throw new Error('Lost lease');
    });
    expect((await projects.version(merchantId, storeId, 2)).digest).toBe(sourceProjectDigest(snapshot));
    expect((await jobs.get(merchantId, storeId, created.id)).resultRevision).toBe(2);
    expect((await prisma.store.findUniqueOrThrow({ where: { id: storeId } })).publishedSourceRevision).toBeNull();
    await jobs.cancel(merchantId, storeId, created.id);
    expect((await jobs.get(merchantId, storeId, created.id)).status).toBe('APPLIED');
  });
  it('rolls back the job result when the source revision changed before apply', async () => {
    await jobs.create(merchantId, storeId, input()); const job = (await jobs.claim())!;
    await prisma.storeSourceProject.update({ where: { storeId }, data: { revision: 2 } });
    await expect(projects.applyPrepared(merchantId, storeId, 1, snapshot, sourceProjectDigest(snapshot), async tx => {
      await tx.storeSourceDesignJob.update({ where: { id: job.id }, data: { status: 'APPLIED', resultRevision: 2 } });
    })).rejects.toThrow('otra sesión');
    expect((await jobs.get(merchantId, storeId, job.id)).resultRevision).toBeNull();
  });
  it('checks evidence integrity and never includes private artifacts in polling responses', async () => {
    await jobs.create(merchantId, storeId, input()); const job = (await jobs.claim())!;
    await jobs.stageResult(job, { status: 'QUEUED' }, { baseline: snapshot });
    expect(await jobs.artifact(job.id, 'baseline')).toEqual(snapshot);
    expect(JSON.stringify(await jobs.get(merchantId, storeId, job.id))).not.toContain('<!doctype');
    await prisma.storeSourceDesignArtifact.update({ where: { jobId_key: { jobId: job.id, key: 'baseline' } }, data: { digest: 'wrong' } });
    await expect(jobs.artifact(job.id, 'baseline')).rejects.toThrow('evidencia');
  });
});
