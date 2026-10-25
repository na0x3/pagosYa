import { ConfigService } from '@nestjs/config';
import { SourceStartersController } from './source-starters.controller';
import { SourceStartersService } from './source-starters.service';

jest.mock('./source-templates', () => ({ ...jest.requireActual('./source-templates'), readMasterState: jest.fn(() => ({ copy: { headline: 'Ropa con calle' }, sections: [{ id: 'faq', title: 'Preguntas', items: [] }], features: {}, photos: { hero: 'assets/image-1d87bb3f91c7.jpg', story: 'http://localhost:3001/v1/uploads/x.jpg' } })) }));

/** Spec 2026-10-24 §2, «Probar otro estilo»: two other starters while the store is still on its first build. */
let controller: SourceStartersController, prisma: any, projects: any, chat: any, jobs: any, config: Map<string, unknown>;
let versions: Array<{ revision: number; label: string }>, chatJobs: Array<{ id: string; status: string; input: any; lastCommittedRevision: number | null; createdAt: Date }>;
const merchant = { id: 'm' };
beforeEach(() => {
  versions = [{ revision: 1, label: 'Estilo: Calle' }];
  chatJobs = [];
  prisma = {
    store: { findFirst: jest.fn().mockResolvedValue({ name: 'Norte', onboarding: { what: 'Ropa urbana, poleras y streetwear', story: '' } }) },
    paymentLink: { findMany: jest.fn().mockResolvedValue([{ name: 'Polera negra' }]) },
    storeSourceVersion: { findMany: jest.fn().mockImplementation(async () => versions) },
    storeSourceChatJob: { findMany: jest.fn().mockImplementation(async ({ where }) => chatJobs.filter(job => !where.status || where.status.in.includes(job.status))) },
    storeAgentThread: { upsert: jest.fn().mockResolvedValue({ id: 't' }) },
    storeAgentMessage: { create: jest.fn().mockResolvedValue({ id: 'msg' }) },
  };
  projects = { current: jest.fn().mockImplementation(async () => ({ revision: versions[versions.length - 1].revision })), version: jest.fn().mockResolvedValue({ revision: 1, label: 'Estilo: Calle', snapshot: { brief: { starterId: 'calle' }, files: [{ path: 'assets/image-1d87bb3f91c7.jpg', content: 'aGVsbG8=', encoding: 'base64' }] } }) };
  chat = { rebuildFromStarter: jest.fn().mockImplementation(async (_m, _s, starter, revision) => ({ revision: revision + 1, label: `Estilo: ${starter.id}` })) };
  jobs = { create: jest.fn().mockResolvedValue({ id: 'j2' }), cancel: jest.fn().mockResolvedValue({}) };
  config = new Map<string, unknown>([['app.yapiStarters', true]]);
  controller = new SourceStartersController(new SourceStartersService(prisma, projects, chat, jobs, { get: (key: string) => config.get(key) } as unknown as ConfigService));
});

it('lists the other starters that fit, never the current one or Esencial', async () => {
  const body = await controller.alternatives(merchant, 's');
  expect(body.current).toBe('calle');
  // A fashion store is offered fashion starters only.
  expect(body.alternatives.map(alternative => alternative.id)).toEqual(['taller']);
  expect(body.alternatives[0]).toMatchObject({ name: 'Taller', preview: 'plantillas/taller.webp' });
  expect(body.alternatives[0].description).toBeTruthy();
});

// Live check 2026-10-24: a café was offered Calle («Ropa y accesorios»). A store that does not sell clothes is not offered the
// fashion starters; their card, page and words are made for clothes.
it('a store that does not sell clothes is not offered the fashion starters', async () => {
  prisma.store.findFirst.mockResolvedValue({ name: 'Antojo Café', onboarding: { what: 'Café de especialidad y pasteles' } });
  prisma.paymentLink.findMany.mockResolvedValue([{ name: 'Café de altura' }]);
  projects.version.mockResolvedValue({ snapshot: { brief: {}, files: [] } });
  const body = await controller.alternatives(merchant, 's');
  expect(body.current).toBe('esencial');
  expect(body.alternatives.map(alternative => alternative.id)).toEqual(['vitrina']);
});

it("YAPI's own follow-up keeps the store on its first build", async () => {
  versions.push({ revision: 2, label: 'Rediseño con tu marca' });
  chatJobs.push({ id: 'j1', status: 'COMPLETED', input: { revision: 1, personalTouch: true, ownRequest: true }, lastCommittedRevision: 2, createdAt: new Date() });
  expect((await controller.alternatives(merchant, 's')).alternatives).toHaveLength(1);
});

it("hides the alternatives and refuses a swap after the merchant's own change", async () => {
  versions.push({ revision: 2, label: 'Cambios de YAPI' });
  chatJobs.push({ id: 'j1', status: 'COMPLETED', input: { revision: 1 }, lastCommittedRevision: 2, createdAt: new Date() });
  expect(await controller.alternatives(merchant, 's')).toEqual({ current: null, alternatives: [] });
  await expect(controller.swap(merchant, 's', 'taller', { revision: 2 })).rejects.toThrow('Tu tienda ya tiene cambios tuyos');
});

it('an edit saved without YAPI (no job) also counts as the merchant’s own', async () => {
  versions.push({ revision: 2, label: 'Texto editado' });
  expect((await controller.alternatives(merchant, 's')).alternatives).toEqual([]);
});

it('rebuilds from the chosen starter keeping the words, and queues the first build’s follow-up again', async () => {
  versions.push({ revision: 2, label: 'Rediseño con tu marca' });
  chatJobs.push({ id: 'j1', status: 'COMPLETED', input: { instruction: 'Rediseña', revision: 1, personalTouch: true, ownRequest: true, redesign: true, requestId: 'r1', merchantRequest: 'x' }, lastCommittedRevision: 2, createdAt: new Date() });
  const out = await controller.swap(merchant, 's', 'taller', { revision: 2 });
  expect(chat.rebuildFromStarter).toHaveBeenCalledWith('m', 's', expect.objectContaining({ id: 'taller', kind: 'master' }), 2, { copy: { headline: 'Ropa con calle' }, sections: [{ id: 'faq', title: 'Preguntas', items: [] }] },
    // The build's own photos: a bundled one travels with its file, an upload is bundled again by the new build.
    { heroPhoto: 'assets/image-1d87bb3f91c7.jpg', storyPhoto: 'http://localhost:3001/v1/uploads/x.jpg', files: [{ path: 'assets/image-1d87bb3f91c7.jpg', content: 'aGVsbG8=', encoding: 'base64' }] });
  expect(out).toEqual({ revision: 3 });
  const followUp = jobs.create.mock.calls[0][2];
  expect(followUp).toMatchObject({ instruction: 'Rediseña', revision: 3, personalTouch: true, redesign: true });
  expect(followUp.requestId).not.toBe('r1');
  expect(followUp).not.toHaveProperty('merchantRequest');
  expect(prisma.storeAgentMessage.create).toHaveBeenCalledWith({ data: expect.objectContaining({ role: 'ASSISTANT', content: expect.stringContaining('Taller'), metadata: expect.objectContaining({ sourceRevision: 3 }) }) });
});

it('a swap from Calle into Vitrina keeps the words', async () => {
  await controller.swap(merchant, 's', 'vitrina', { revision: 1 });
  expect(chat.rebuildFromStarter).toHaveBeenCalledWith('m', 's', expect.objectContaining({ id: 'vitrina', kind: 'master' }), 1, { copy: { headline: 'Ropa con calle' }, sections: [{ id: 'faq', title: 'Preguntas', items: [] }] },
    { heroPhoto: 'assets/image-1d87bb3f91c7.jpg', storyPhoto: 'http://localhost:3001/v1/uploads/x.jpg', files: [{ path: 'assets/image-1d87bb3f91c7.jpg', content: 'aGVsbG8=', encoding: 'base64' }] });
});

it('stops a running follow-up first, and waits while the merchant’s own request runs', async () => {
  chatJobs.push({ id: 'j1', status: 'RUNNING', input: { revision: 1, personalTouch: true, ownRequest: true }, lastCommittedRevision: null, createdAt: new Date() });
  await controller.swap(merchant, 's', 'taller', { revision: 1 });
  expect(jobs.cancel).toHaveBeenCalledWith('m', 's', 'j1');
  chatJobs[0] = { ...chatJobs[0], input: { revision: 1 } };
  await expect(controller.swap(merchant, 's', 'taller', { revision: 1 })).rejects.toThrow('YAPI está trabajando');
});

it('refuses an unknown style, the current one, and a stale revision', async () => {
  await expect(controller.swap(merchant, 's', 'nada', { revision: 1 })).rejects.toThrow('Ese estilo no existe');
  await expect(controller.swap(merchant, 's', 'calle', { revision: 1 })).rejects.toThrow('ya usa ese estilo');
  await expect(controller.swap(merchant, 's', 'taller', { revision: 0 })).rejects.toThrow('El proyecto cambió');
  expect(chat.rebuildFromStarter).not.toHaveBeenCalled();
});

it('with YAPI_STARTERS off there is nothing to offer and nothing to swap', async () => {
  config.set('app.yapiStarters', false);
  expect(await controller.alternatives(merchant, 's')).toEqual({ current: null, alternatives: [] });
  await expect(controller.swap(merchant, 's', 'taller', { revision: 1 })).rejects.toThrow('Ese estilo no existe');
});
