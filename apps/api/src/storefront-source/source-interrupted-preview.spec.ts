import { SourceGenerationService } from './source-generation.service';
import { agentPreviewSnapshot } from './agent/agent-capture';
import { createHash } from 'node:crypto';

jest.mock('./agent/agent-capture', () => ({ ...jest.requireActual('./agent/agent-capture'), agentPreviewSnapshot: jest.fn(async (base, authored) => ({ ...base, files: [...base.files, ...authored] })) }));
const authored = [{ path: 'components/home.tsx', content: 'export default function Home(){return <h1>Recovered</h1>}' }];
function setup(status = 'FAILED') {
  const run = { status, createdAt: new Date(1000), checkpoint: { files: authored, assetUrls: [] } };
  const prisma: any = { storeSourceGeneration: { findFirst: jest.fn().mockResolvedValue(run) }, storeAgentMessage: { findFirst: jest.fn() }, mediaAsset: { findMany: jest.fn().mockResolvedValue([]) } };
  const projects: any = { current: jest.fn().mockResolvedValue({ revision: 3 }), version: jest.fn().mockResolvedValue({ snapshot: { brief: {}, files: [{ path: 'config.js', content: 'config' }] } }) };
  const uploads: any = { getBuffer: jest.fn().mockResolvedValue(Buffer.from('photo')) };
  const service = new SourceGenerationService(prisma, {} as any, projects, uploads, {} as any);
  return { service, prisma, projects, uploads, run };
}
beforeEach(() => jest.clearAllMocks());
it('rebuilds only an interrupted checkpoint on the current revision, without saving it', async () => {
  const { service, prisma } = setup();
  expect(await service.interruptedPreview('merchant', 'store')).toMatchObject({ at: 1000, interrupted: true, files: expect.arrayContaining(authored) });
  expect(prisma.storeSourceGeneration.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ storeId: 'store', baseRevision: 3 }), orderBy: { createdAt: 'desc' } }));
});
it.each(['RUNNING', 'COMPLETED', 'CANDIDATE'])('does not resurrect older work when the latest run is %s', async status => {
  const { service, projects } = setup(status);
  expect(await service.interruptedPreview('merchant', 'store')).toEqual({ at: null });
  expect(projects.version).not.toHaveBeenCalled();
});
it('checks ownership before looking up checkpoints and avoids recompiling unchanged previews', async () => {
  const { service, prisma, projects } = setup();
  expect(await service.interruptedPreview('merchant', 'store', 1000)).toEqual({ at: 1000, interrupted: true });
  expect(agentPreviewSnapshot).not.toHaveBeenCalled();
  prisma.storeSourceGeneration.findFirst.mockClear();
  projects.current.mockRejectedValue(new Error('Store not found'));
  await expect(service.interruptedPreview('other', 'store')).rejects.toThrow('Store not found');
  expect(prisma.storeSourceGeneration.findFirst).not.toHaveBeenCalled();
});
it('recovers a first-site draft from its checkpoint runtime without requiring a saved revision', async () => {
  const { service, projects, run } = setup();
  projects.current.mockResolvedValue({ revision: 0 });
  Object.assign(run.checkpoint, { base: { brief: { businessType: 'Panadería' }, files: [{ path: 'config.js', content: 'config' }] } });
  expect(await service.interruptedPreview('merchant', 'store')).toMatchObject({ interrupted: true, files: expect.arrayContaining(authored) });
  expect(projects.version).not.toHaveBeenCalled();
});
it('recovers uploaded bytes only from assets owned by the requesting merchant', async () => {
  const { service, prisma, uploads, run } = setup();
  const owned = '/v1/uploads/aabb.jpg', foreign = '/v1/uploads/ccdd.jpg';
  run.checkpoint.assetUrls = [owned, foreign] as never[];
  prisma.mediaAsset.findMany.mockResolvedValue([{ url: owned }]);
  const result = await service.interruptedPreview('merchant', 'store');
  expect(prisma.mediaAsset.findMany).toHaveBeenCalledWith({ where: { merchantId: 'merchant', url: { in: [owned, foreign] } }, select: { url: true } });
  expect(uploads.getBuffer).toHaveBeenCalledTimes(1);
  expect(uploads.getBuffer).toHaveBeenCalledWith('aabb.jpg');
  expect(result.files).toContainEqual({ path: `assets/image-${createHash('sha256').update('photo').digest('hex').slice(0,12)}.jpg`, content: Buffer.from('photo').toString('base64'), encoding: 'base64' });
});

it('restores the last renderable stage even if later unfinished edits broke compilation', async () => {
  const { service, run } = setup();
  const broken = [{ path: 'components/home.tsx', content: 'unfinished syntax' }];
  Object.assign(run.checkpoint, { files: broken, preview: { files: authored, theme: null } });
  const result = await service.interruptedPreview('merchant', 'store');
  expect(agentPreviewSnapshot).toHaveBeenCalledWith(expect.anything(), authored);
  expect(result.files).toEqual(expect.arrayContaining(authored));
});
it('returns the request the draft was built from, so the Studio can finish it instead of starting over', async () => {
  const { service, prisma, run } = setup();
  Object.assign(run, { requestJobId: 'job-1' });
  prisma.storeSourceChatJob = { findFirst: jest.fn().mockResolvedValue({ input: { instruction: 'Una gelatería editorial', assetUrls: ['/v1/uploads/a.jpg'], currentPage: 'index.html', setupAction: 'generate' } }) };
  expect(await service.interruptedPreview('merchant', 'store')).toMatchObject({ retry: { text: 'Una gelatería editorial', assetUrls: ['/v1/uploads/a.jpg'], currentPage: 'index.html', setupAction: 'generate' } });
  expect(prisma.storeSourceChatJob.findFirst).toHaveBeenCalledWith({ where: { id: 'job-1', storeId: 'store', merchantId: 'merchant' }, select: { input: true } });
});
