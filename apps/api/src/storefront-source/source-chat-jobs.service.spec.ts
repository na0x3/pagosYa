import { Prisma } from '@prisma/client';
import { BadGatewayException, ConflictException, InternalServerErrorException, Logger, ServiceUnavailableException } from '@nestjs/common';
import { SourceProviderQuotaException, checkSourceProviderQuota } from './source-provider-error';
import { SourceChatJobsService, chatJobView, chatRequestDigest } from './source-chat-jobs.service';
import { PersonalTouchSkipped } from './source-chat.service';
import { sourceRequestContext } from './source-request-context';
function setup() {
  const updateMany = jest.fn().mockResolvedValue({ count: 1 });
  const prisma: any = { store: { findFirst: jest.fn().mockResolvedValue({ id: 's' }) }, storeSourceGeneration: { findFirst: jest.fn().mockResolvedValue(null), updateMany: jest.fn().mockResolvedValue({ count: 1 }) }, storeSourceChatJob: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn(), findFirst: jest.fn(), create: jest.fn(), updateMany } };
  prisma.$transaction = (fn: any) => fn(prisma);
  const chat: any = { send: jest.fn().mockResolvedValue({ assistantMessage: { metadata: {} } }) };
  return { prisma, chat, service: new SourceChatJobsService(prisma, chat) };
}
const input = { requestId: 'request', revision: 1, instruction: 'Make the logo green' };
const job: any = { id: 'job', storeId: 's', merchantId: 'm', status: 'RUNNING', leaseToken: 'lease', input, sequence: 1 };
it('deduplicates the same request and rejects a changed payload with the same ID', async () => {
  const { service, prisma } = setup();
  prisma.storeSourceChatJob.findUnique.mockResolvedValue({ ...job, inputDigest: chatRequestDigest(input) });
  expect((await service.create('m', 's', input)).id).toBe('job');
  expect(prisma.storeSourceChatJob.create).not.toHaveBeenCalled();
  await expect(service.create('m', 's', { ...input, instruction: 'Redesign everything' })).rejects.toThrow('otro pedido');
  expect(chatRequestDigest(input)).toBe(chatRequestDigest({ instruction: input.instruction, revision: 1, requestId: 'request' }));
});
it('fences a stale worker before any revision can commit', async () => {
  const { service, prisma, chat } = setup();
  const commit = jest.fn();
  chat.send.mockImplementation(async () => {
    await sourceRequestContext.getStore()!.assertLease({ storeSourceChatJob: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) } } as any, 2, 's');
    commit();
  });
  await service.run(job);
  expect(commit).not.toHaveBeenCalled();
  expect(prisma.storeSourceChatJob.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ leaseToken: 'lease', status: 'RUNNING' }), data: expect.objectContaining({ status: 'FAILED' }) }));
});
describe('personal touch (variety spec §5)', () => {
  it('queues the follow-up a reply carries only after the store\'s job is closed (live check: one active job per store)', async () => {
    const { service, prisma, chat } = setup();
    const order: string[] = [];
    prisma.storeSourceChatJob.updateMany.mockImplementation(async ({ data }: any) => { if (data.status) order.push(data.status); return { count: 1 }; });
    prisma.storeSourceChatJob.create.mockImplementation(async ({ data }: any) => { order.push('create'); return { ...job, ...data, id: 'touch' }; });
    prisma.storeAgentMessage = { findMany: jest.fn().mockResolvedValue([]) };
    chat.send.mockResolvedValue({ assistantMessage: { metadata: {} }, revision: { revision: 1 }, followUp: { instruction: 'Toque personal', revision: 1, personalTouch: true, requestId: '00000000-0000-4000-8000-000000000001' } });
    await service.run(job);
    expect(order).toEqual(['COMPLETED', 'create']);
    expect(prisma.storeSourceChatJob.create.mock.calls[0][0].data.input).toMatchObject({ personalTouch: true });
  });
  it('a merchant request cancels a queued personal touch on the store', async () => {
    const { service, prisma } = setup();
    prisma.storeSourceChatJob.findMany.mockImplementation(async ({ where }: any) => where.status?.in ? [{ id: 'touch', input: { personalTouch: true } }, { id: 'other', input: {} }] : []);
    prisma.storeSourceChatJob.findFirst = jest.fn().mockResolvedValue({ ...job, id: 'touch', status: 'CANCELLED' });
    await service.create('m', 's', input).catch(() => undefined);
    expect(prisma.storeSourceChatJob.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: 'touch' }), data: expect.objectContaining({ status: 'CANCELLED' }) }));
    expect(prisma.storeSourceChatJob.updateMany).not.toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: 'other' }) }));
  });
  it('a skipped personal touch completes quietly', async () => {
    const { service, prisma, chat } = setup();
    chat.send.mockRejectedValue(new PersonalTouchSkipped('moved on'));
    await service.run({ ...job, input: { ...input, personalTouch: true } });
    expect(prisma.storeSourceChatJob.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'COMPLETED' }) }));
  });
});

it('does not label a template adaptation failure as completed', async () => {
  const { service, prisma, chat } = setup();
  chat.send.mockResolvedValue({ assistantMessage: { metadata: { adaptationFailed: true } }, revision: { revision: 2 } });
  await service.run(job);
  expect(prisma.storeSourceChatJob.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED', activeStoreId: null }) }));
});
it('expires an abandoned lease without dispatching another model request', async () => {
  const { service, prisma, chat } = setup(); prisma.storeSourceChatJob.findMany.mockResolvedValue([{ id: 'job' }]); await service.expire();
  expect(prisma.storeSourceChatJob.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ status: 'RUNNING', leaseUntil: expect.any(Object) }), data: expect.objectContaining({ status: 'INTERRUPTED', leaseToken: null }) }));
  expect(chat.send).not.toHaveBeenCalled();
});
it('anchors new requests to successful conversation context, excluding failed adaptations', async () => {
  const { service, prisma } = setup();
  prisma.storeAgentMessage = { findMany: jest.fn().mockResolvedValue([{id:'failed',metadata:{failed:true}},{id:'adaptation',metadata:{adaptationFailed:true}},{id:'confirmed',metadata:{}}]) };
  prisma.storeSourceChatJob.create.mockImplementation(async ({data}:any)=>({...job,...data}));
  await service.create('m','s',input);
  expect(prisma.storeSourceChatJob.create.mock.calls[0][0].data.input.merchantRequest.contextAnchor).toBe('confirmed');
});
describe('failure message stored on the job', () => {
  const stored = (prisma: any) => prisma.storeSourceChatJob.updateMany.mock.calls.map((c: any[]) => c[0].data.error).filter(Boolean).at(-1);
  const friendly = 'No pude completar el pedido. Tu diseño anterior se conserva.';
  it('never stores a Prisma message; it is logged instead', async () => {
    const logged = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const errors = [
      new Prisma.PrismaClientKnownRequestError('Invalid `prisma.storeSourceGeneration.updateMany()` invocation: new row violates check constraint "status_check"', { code: 'P2004', clientVersion: 'x' }),
      new Prisma.PrismaClientUnknownRequestError('Raw query failed. Code: `23514`', { clientVersion: 'x' }),
      new Prisma.PrismaClientValidationError('Argument `status`: Invalid value provided.', { clientVersion: 'x' }),
    ];
    for (const error of errors) {
      const { service, prisma, chat } = setup();
      chat.send.mockRejectedValue(error);
      await service.run(job);
      expect(stored(prisma)).toBe(friendly);
      expect(logged).toHaveBeenLastCalledWith(expect.stringContaining(error.message));
    }
    logged.mockRestore();
  });
  it('stores the friendly message for an internal error, and keeps a merchant-facing one', async () => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const cases: Array<[Error, string]> = [
      [new TypeError("Cannot read properties of undefined (reading 'concepts')"), friendly],
      [new InternalServerErrorException('Invalid `prisma.storeSourceGeneration.updateMany()` invocation'), friendly],
      [new ServiceUnavailableException('Expected column "proposal" in components/home.tsx'), friendly],
      [new BadGatewayException('YAPI no logró armar una propuesta de diseño válida en este intento.'), 'YAPI no logró armar una propuesta de diseño válida en este intento.'],
      [new ConflictException('El proyecto cambió. Recarga antes de generar.'), 'El proyecto cambió. Recarga antes de generar.'],
    ];
    for (const [error, message] of cases) {
      const { service, prisma, chat } = setup();
      chat.send.mockRejectedValue(error);
      await service.run(job);
      expect(stored(prisma)).toBe(message);
    }
    jest.restoreAllMocks();
  });
  it('passes merchant-facing 503s through: an exhausted provider balance, a ChatGPT-plan failure, a provider that is not configured', async () => {
    const logged = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    let plan: unknown;
    try { checkSourceProviderQuota(429, {}, 'ChatGPT plan'); } catch (error) { plan = error; }
    expect(plan).toBeInstanceOf(ServiceUnavailableException);
    const cases = [new SourceProviderQuotaException('OpenAI'), plan as Error, new ServiceUnavailableException('La integración no está configurada. Configura OPENAI_API_KEY en el servidor para usar OpenAI. Tu sitio sigue guardado.')];
    for (const error of cases) {
      const { service, prisma, chat } = setup();
      chat.send.mockRejectedValue(error);
      await service.run(job);
      expect(stored(prisma)).toBe(error.message);
    }
    expect(logged).not.toHaveBeenCalled();
    logged.mockRestore();
  });
  it('does not log a cancelled or aborted job as an error', async () => {
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const { service, prisma, chat } = setup();
    chat.send.mockRejectedValue(new DOMException('This operation was aborted', 'AbortError'));
    await service.run(job);
    expect(stored(prisma)).toBe(friendly);
    expect(error).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('AbortError'));
    jest.restoreAllMocks();
  });
});

// 2026-10-15 owner report: a queued request looked frozen ("YAPI sigue trabajando…") behind another store's run.
describe('queue position on a waiting request', () => {
  const queued: any = { id: 'q', storeId: 's', merchantId: 'm', status: 'QUEUED', requestId: 'r', sequence: 0, createdAt: new Date('2026-10-15T23:13:37Z') };
  it('counts what runs or waits before it and names the running store only when it is the same merchant', async () => {
    const { prisma, service } = setup();
    prisma.storeSourceChatJob.findFirst = jest.fn()
      .mockResolvedValueOnce(queued)
      .mockResolvedValueOnce({ id: 'run', storeId: 'other', merchantId: 'm', status: 'RUNNING' });
    prisma.storeSourceChatJob.count = jest.fn().mockResolvedValue(2);
    prisma.store.findUnique = jest.fn().mockResolvedValue({ name: 'Raíz Viva' });
    const view = await service.get('m', 's', 'q');
    expect(view.queue).toEqual({ ahead: 2, runningStore: 'Raíz Viva' });
    expect(prisma.storeSourceChatJob.count).toHaveBeenCalledWith({ where: { OR: [{ status: 'RUNNING' }, { status: 'QUEUED', createdAt: { lt: queued.createdAt } }] } });
  });
  it("never names another merchant's store, and a running job has no queue", async () => {
    const { prisma, service } = setup();
    prisma.storeSourceChatJob.findFirst = jest.fn()
      .mockResolvedValueOnce(queued)
      .mockResolvedValueOnce({ id: 'run', storeId: 'x', merchantId: 'someone-else', status: 'RUNNING' });
    prisma.storeSourceChatJob.count = jest.fn().mockResolvedValue(1);
    prisma.store.findUnique = jest.fn();
    expect((await service.get('m', 's', 'q')).queue).toEqual({ ahead: 1 });
    expect(prisma.store.findUnique).not.toHaveBeenCalled();
    prisma.storeSourceChatJob.findFirst = jest.fn().mockResolvedValueOnce({ ...queued, status: 'RUNNING' });
    expect((await service.get('m', 's', 'q')).queue).toBeUndefined();
  });
});

describe('review fixes: background jobs', () => {
  it('the worker takes a merchant request before an older personal touch', async () => {
    const { service, prisma } = setup();
    const touch = { ...job, id: 'touch', status: 'QUEUED', input: { ...input, personalTouch: true } };
    const merchant = { ...job, id: 'merchant', status: 'QUEUED', input };
    prisma.storeSourceChatJob.findMany.mockImplementation(async ({ where }: any) => where.status === 'QUEUED' ? [touch, merchant] : []);
    prisma.storeSourceChatJob.findFirst = jest.fn().mockResolvedValue(touch);
    const claimed: string[] = [];
    prisma.storeSourceChatJob.updateMany.mockImplementation(async ({ where }: any) => { if (where.status === 'QUEUED') claimed.push(where.id); return { count: 0 }; });
    await service.tick();
    expect(claimed[0]).toBe('merchant');
  });
  it('a personal touch job says it runs in the background', () => {
    expect((chatJobView({ ...job, status: 'QUEUED', input: { ...input, personalTouch: true } }) as any).background).toBe(true);
    expect((chatJobView({ ...job, status: 'QUEUED', input }) as any).background).toBe(false);
  });
});
describe('unfinished requests (owner 2026-10-22: the computer shut off mid-build)', () => {
  const kept = { metadata: { failed: true, pendingRequest: { instruction: 'Esta tienda empezó desde la plantilla Esencial…', direct: true } } };
  it('an interrupted request leaves a note in the chat that keeps it for «sigue»', async () => {
    const { service, prisma, chat } = setup();
    prisma.storeSourceChatJob.findMany.mockResolvedValue([{ id: 'job' }]);
    prisma.storeSourceChatJob.findUnique.mockResolvedValue({ ...job, input: { ...input, personalTouch: true, ownRequest: true } });
    prisma.storeAgentThread = { findUnique: jest.fn().mockResolvedValue({ id: 't' }) };
    prisma.storeAgentMessage = { create: jest.fn(), deleteMany: jest.fn() };
    await service.expire();
    expect(prisma.storeAgentMessage.deleteMany).toHaveBeenCalledWith({ where: expect.objectContaining({ content: 'Toque personal' }) });
    const note = prisma.storeAgentMessage.create.mock.calls[0][0].data;
    expect(note.content).toMatch(/se cortó antes de terminar.*base de la plantilla.*«sigue»/);
    expect(note.metadata).toMatchObject({ failed: true, interrupted: true, pendingRequest: { instruction: input.instruction, direct: true } });
    expect(chat.send).not.toHaveBeenCalled();
  });
  it('a personal touch of YAPI\'s own stays silent when interrupted', async () => {
    const { service, prisma } = setup();
    prisma.storeSourceChatJob.findMany.mockResolvedValue([{ id: 'job' }]);
    prisma.storeSourceChatJob.findUnique.mockResolvedValue({ ...job, input: { ...input, personalTouch: true } });
    prisma.storeAgentThread = { findUnique: jest.fn().mockResolvedValue({ id: 't' }) };
    prisma.storeAgentMessage = { create: jest.fn(), deleteMany: jest.fn() };
    await service.expire();
    expect(prisma.storeAgentMessage.create).not.toHaveBeenCalled();
  });
  it('«sigue» after the note runs the kept request, showing the merchant\'s words', async () => {
    const { service, prisma } = setup();
    prisma.storeAgentMessage = { findMany: jest.fn().mockResolvedValue([kept]) };
    prisma.storeSourceChatJob.create.mockImplementation(async ({ data }: any) => ({ ...job, ...data }));
    await service.create('m', 's', { ...input, instruction: 'sigue con lo que estábamos haciendo' });
    expect(prisma.storeSourceChatJob.create.mock.calls[0][0].data.input).toMatchObject({ instruction: kept.metadata.pendingRequest.instruction, resumeWords: 'sigue con lo que estábamos haciendo', personalTouch: true, ownRequest: true });
  });
  it('any other message, or one after a saved build, is a new request', async () => {
    const { service, prisma } = setup();
    prisma.storeSourceChatJob.create.mockImplementation(async ({ data }: any) => ({ ...job, ...data }));
    prisma.storeAgentMessage = { findMany: jest.fn().mockResolvedValue([kept]) };
    await service.create('m', 's', input);
    prisma.storeAgentMessage.findMany.mockResolvedValue([{ metadata: { sourceRevision: 3 } }, kept]);
    await service.create('m', 's', { ...input, requestId: 'r2', instruction: 'sigue' });
    expect(prisma.storeSourceChatJob.create.mock.calls.map((call: any) => call[0].data.input.instruction)).toEqual([input.instruction, 'sigue']);
  });
  it('the merchant\'s own request on a new store is shown as theirs and never cancelled by their next message', async () => {
    const { service, prisma } = setup();
    expect(chatJobView({ ...job, input: { ...input, personalTouch: true, ownRequest: true } }).background).toBe(false);
    prisma.storeSourceChatJob.findMany.mockImplementation(async ({ where }: any) => where.status?.in ? [{ id: 'own', input: { personalTouch: true, ownRequest: true } }] : []);
    await service.create('m', 's', input).catch(() => undefined);
    expect(prisma.storeSourceChatJob.updateMany).not.toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'CANCELLED' }) }));
  });
});

it('F5: «sigue» on a new store (revision 0) resumes the kept request with its setup action', async () => {
  const { service, prisma } = setup();
  prisma.storeAgentMessage = { findMany: jest.fn().mockResolvedValue([{ metadata: { failed: true, pendingRequest: { instruction: 'Hazme una tienda de velas', direct: false, setupAction: 'generate' } } }]) };
  prisma.storeSourceChatJob.create.mockImplementation(async ({ data }: any) => ({ ...job, ...data }));
  await service.create('m', 's', { requestId: 'r0', revision: 0, instruction: 'sigue' });
  expect(prisma.storeSourceChatJob.create.mock.calls[0][0].data.input).toMatchObject({ instruction: 'Hazme una tienda de velas', resumeWords: 'sigue', setupAction: 'generate' });
});

// Remolino ty78citn 2026-10-28: the ChatGPT plan ran out mid-redesign and the new store stayed on its template.
describe('a first design and a spent quota (2026-10-28)', () => {
  const { MODEL_LIMIT_MERCHANT_FAILURE } = jest.requireActual('./source-validation-error');
  const design = { ...job, attempt: 1, input: { ...input, personalTouch: true, ownRequest: true, redesign: true, firstDesign: true } };
  it('goes back to the queue and the worker rests before trying again', async () => {
    const { service, prisma, chat } = setup();
    chat.send.mockRejectedValue(new BadGatewayException(MODEL_LIMIT_MERCHANT_FAILURE));
    await service.run(design);
    expect(prisma.storeSourceChatJob.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'QUEUED', activeStoreId: 's' }) }));
    expect(prisma.storeSourceChatJob.updateMany).not.toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) }));
    prisma.storeSourceChatJob.findMany.mockClear();
    await service.tick();
    // Expired runs are still tidied; no waiting job is taken.
    expect(prisma.storeSourceChatJob.findMany).not.toHaveBeenCalledWith(expect.objectContaining({ where: { status: 'QUEUED' } }));
  });
  // Review fix 2026-10-28 (I2): a try that will be retried leaves no «escríbeme sigue» note in the chat; the last one does.
  it('tells the chat when a spent quota will be retried, and not on the last try', async () => {
    const { service, chat } = setup();
    chat.send.mockRejectedValue(new BadGatewayException(MODEL_LIMIT_MERCHANT_FAILURE));
    await service.run(design);
    expect(chat.send).toHaveBeenLastCalledWith('m', 's', expect.objectContaining({ firstDesign: true, quotaRetry: true }));
    await service.run({ ...design, attempt: 12 });
    expect(chat.send.mock.calls.at(-1)[2].quotaRetry).toBeUndefined();
    await service.run(job);
    expect(chat.send.mock.calls.at(-1)[2].quotaRetry).toBeUndefined();
  });
  it('after twelve tries it fails with the quota note', async () => {
    const { service, prisma, chat } = setup();
    chat.send.mockRejectedValue(new BadGatewayException(MODEL_LIMIT_MERCHANT_FAILURE));
    await service.run({ ...design, attempt: 12 });
    expect(prisma.storeSourceChatJob.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED', error: MODEL_LIMIT_MERCHANT_FAILURE }) }));
  });
  // Live check 2026-10-28 (Remolino 6f2bikgu): an API restart left the first design INTERRUPTED and the store on its template.
  it('an API shutdown sends a running first design back to the queue; any other request is interrupted', async () => {
    const stop = (service: SourceChatJobsService) => async () => { service.onModuleDestroy(); throw Object.assign(new Error('This operation was aborted'), { name: 'AbortError' }); };
    const first = setup();
    first.chat.send.mockImplementation(stop(first.service));
    await first.service.run(design);
    expect(first.prisma.storeSourceChatJob.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'QUEUED', activeStoreId: 's' }) }));
    expect(first.prisma.storeSourceChatJob.updateMany).not.toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'INTERRUPTED' }) }));
    const other = setup();
    other.chat.send.mockImplementation(stop(other.service));
    await other.service.run(job);
    expect(other.prisma.storeSourceChatJob.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'INTERRUPTED' }) }));
  });
  // Oh Belly cmvtbdl6e 2026-10-29: the watcher killed the API mid-try, so no shutdown hook ran; the lease expired on the next boot.
  it('a first design whose lease expired goes back to the queue, without a chat note; under the cap only', async () => {
    const { service, prisma, chat } = setup();
    prisma.storeSourceChatJob.findMany.mockResolvedValue([{ id: 'job', storeId: 's', attempt: 7, input: { firstDesign: true } }]);
    await service.expire();
    expect(prisma.storeSourceChatJob.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: 'job', status: 'RUNNING' }), data: expect.objectContaining({ status: 'QUEUED', activeStoreId: 's', leaseToken: null }) }));
    expect(prisma.storeSourceChatJob.updateMany).not.toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'INTERRUPTED' }) }));
    expect(chat.send).not.toHaveBeenCalled();
    const spent = setup();
    spent.prisma.storeSourceChatJob.findMany.mockResolvedValue([{ id: 'job', storeId: 's', attempt: 12, input: { firstDesign: true } }]);
    await spent.service.expire();
    expect(spent.prisma.storeSourceChatJob.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'INTERRUPTED' }) }));
  });
  it('an ordinary request still fails on a spent quota', async () => {
    const { service, prisma, chat } = setup();
    chat.send.mockRejectedValue(new BadGatewayException(MODEL_LIMIT_MERCHANT_FAILURE));
    await service.run(job);
    expect(prisma.storeSourceChatJob.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) }));
  });
  it('the job view says when a first design runs and when one comes next', () => {
    expect((chatJobView({ ...design, status: 'RUNNING' }) as any).firstDesign).toBe(true);
    expect((chatJobView({ ...job, status: 'COMPLETED', result: { followUp: { firstDesign: true } } }) as any).designNext).toBe(true);
    expect((chatJobView({ ...job, status: 'COMPLETED' }) as any)).toMatchObject({ firstDesign: false, designNext: false });
  });
});

// Spec 2026-11-09 YAPI A/B tests: a design test ask is marked when queued; the saved B gets its test card.
describe('A/B design tests', () => {
  it('a design test ask is queued with its words as abRequest; a popup ask and an ordinary ask are not', async () => {
    const { service, prisma } = setup();
    prisma.storeAgentMessage = { findMany: jest.fn().mockResolvedValue([]) };
    prisma.storeSourceChatJob.create.mockImplementation(async ({ data }: any) => ({ ...job, ...data }));
    const queued = async (instruction: string) => { prisma.storeSourceChatJob.create.mockClear(); await service.create('m', 's', { requestId: '00000000-0000-4000-8000-00000000000a', revision: 1, instruction } as any); return prisma.storeSourceChatJob.create.mock.calls[0][0].data.input; };
    expect(await queued('prueba otra portada')).toMatchObject({ abRequest: 'prueba otra portada' });
    expect((await queued('prueba si 15% atrae más que 10%')).abRequest).toBeUndefined();
    expect((await queued('cambia la portada')).abRequest).toBeUndefined();
  });
  it('the saved B gets the test card with its revision; a failed or revision-less edit gets none', async () => {
    const { service, chat } = setup();
    const ab = { proposeDesign: jest.fn(async () => ({})) };
    (service as any).ab = ab;
    const abJob = { ...job, input: { ...input, instruction: 'prueba otra portada', abRequest: 'prueba otra portada' } };
    chat.send.mockResolvedValue({ assistantMessage: { metadata: {} }, revision: { revision: 7, label: 'Versión B' } });
    await service.run(abJob);
    await new Promise(resolve => setImmediate(resolve));
    expect(ab.proposeDesign).toHaveBeenCalledWith('s', 7, 'prueba otra portada');
    ab.proposeDesign.mockClear();
    chat.send.mockResolvedValue({ assistantMessage: { metadata: { failed: true } } });
    await service.run(abJob);
    chat.send.mockResolvedValue({ assistantMessage: { metadata: {} } });
    await service.run(abJob);
    await new Promise(resolve => setImmediate(resolve));
    expect(ab.proposeDesign).not.toHaveBeenCalled();
  });
});

it('spec 2026-11-17: a new store\'s V2 first design runs on the V2 engine, not the chat, and completes or fails plainly', async () => {
  const { prisma, chat } = setup();
  const v2: any = { designForChat: jest.fn().mockResolvedValue({ revision: { revision: 3 } }) };
  const service = new SourceChatJobsService(prisma, chat, undefined, undefined, undefined, undefined, v2);
  await service.run({ ...job, input: { ...input, revision: 2, v2Design: true, firstDesign: true, personalTouch: true } });
  expect(v2.designForChat).toHaveBeenCalledWith('m', 's', 2);
  expect(chat.send).not.toHaveBeenCalled();
  expect(prisma.storeSourceChatJob.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'COMPLETED' }) }));
  v2.designForChat.mockResolvedValue({ assistantMessage: { metadata: { failed: true } } });
  prisma.storeSourceChatJob.updateMany.mockClear();
  await service.run({ ...job, input: { ...input, revision: 2, v2Design: true, firstDesign: true } });
  expect(prisma.storeSourceChatJob.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) }));
});

it('spec 2026-11-18: a «Mejorar mi marca» job runs the brand flow, not the chat', async () => {
  const { prisma, chat } = setup();
  const brandFlow: any = { runForChat: jest.fn().mockResolvedValue({ revision: { revision: 4 } }) };
  const service = new SourceChatJobsService(prisma, chat, undefined, undefined, undefined, undefined, undefined, brandFlow);
  await service.run({ ...job, input: { ...input, revision: 2, brandFlow: true } });
  expect(brandFlow.runForChat).toHaveBeenCalledWith(expect.objectContaining({ merchantId: 'm', storeId: 's', input: expect.objectContaining({ brandFlow: true }) }));
  expect(chat.send).not.toHaveBeenCalled();
  expect(prisma.storeSourceChatJob.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'COMPLETED' }) }));
});

it('spec 2026-11-18: a branding request in words is queued as a brand-flow job', async () => {
  const { prisma, chat } = setup();
  prisma.storeSourceChatJob.findUnique.mockResolvedValue(null);
  prisma.storeAgentMessage = { findMany: jest.fn().mockResolvedValue([]) };
  prisma.storeSourceChatJob.create.mockImplementation(async ({ data }: any) => ({ id: 'j', ...data, status: 'QUEUED', sequence: 0, attempt: 0, createdAt: new Date(), updatedAt: new Date() }));
  const service = new SourceChatJobsService(prisma, chat);
  await service.create('m', 's', { instruction: 'quiero mejorar mi marca', revision: 2, requestId: '6f1d2c0e-1111-4c4c-9999-000000000001' } as any);
  expect(prisma.storeSourceChatJob.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ input: expect.objectContaining({ brandFlow: true }) }) }));
});

it('final review 2026-11-18: photos sent after YAPI asked for them resume the brand flow with the first words', async () => {
  const { prisma, chat } = setup();
  prisma.storeSourceChatJob.findUnique.mockResolvedValue(null);
  prisma.storeAgentMessage = { findMany: jest.fn().mockResolvedValue([{ id: 'a1', metadata: { brandAsk: { instruction: 'Mejorar mi marca https://instagram.com/calima' } } }]) };
  prisma.storeSourceChatJob.create.mockImplementation(async ({ data }: any) => ({ id: 'j', ...data, status: 'QUEUED', sequence: 0, attempt: 0, createdAt: new Date(), updatedAt: new Date() }));
  const service = new SourceChatJobsService(prisma, chat);
  await service.create('m', 's', { instruction: 'aquí están', assetUrls: ['/v1/uploads/p.jpg'], revision: 2, requestId: '6f1d2c0e-1111-4c4c-9999-000000000002' } as any);
  expect(prisma.storeSourceChatJob.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ input: expect.objectContaining({ brandFlow: true, instruction: 'Mejorar mi marca https://instagram.com/calima aquí están' }) }) }));
});
