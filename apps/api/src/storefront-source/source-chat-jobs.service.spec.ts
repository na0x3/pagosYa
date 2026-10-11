import { Prisma } from '@prisma/client';
import { BadGatewayException, ConflictException, InternalServerErrorException, Logger, ServiceUnavailableException } from '@nestjs/common';
import { SourceProviderQuotaException, checkSourceProviderQuota } from './source-provider-error';
import { SourceChatJobsService, chatRequestDigest } from './source-chat-jobs.service';
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
