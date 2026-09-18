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
