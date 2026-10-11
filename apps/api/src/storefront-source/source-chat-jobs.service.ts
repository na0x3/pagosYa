import { sourceMerchantRequest } from './source-merchant-request';
import { BadRequestException, ConflictException, HttpException, Injectable, Logger, NotFoundException, OnModuleDestroy } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { createHash, randomUUID } from 'node:crypto';
import { Prisma, StoreSourceChatJob } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SourceChatService } from './source-chat.service';
import { SendSourceMessageDto } from './dto/send-source-message.dto';
import { sourceRequestContext } from './source-request-context';
import { merchantFacingSourceFailure } from './source-validation-error';

const LEASE_MS = 45_000;
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
function canonical(value: any): string { return JSON.stringify(value === null || typeof value !== 'object' ? value : Array.isArray(value) ? value.map(v => JSON.parse(canonical(v))) : Object.fromEntries(Object.keys(value).sort().filter(k => value[k] !== undefined).map(k => [k, JSON.parse(canonical(value[k]))]))); }
export function chatRequestDigest(input: SendSourceMessageDto) { return createHash('sha256').update(canonical(input)).digest('hex'); }
const FAILED_JOB_MESSAGE = 'No pude completar el pedido. Tu diseño anterior se conserva.';
const isPrismaError = (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError || error instanceof Prisma.PrismaClientUnknownRequestError
  || error instanceof Prisma.PrismaClientValidationError || error instanceof Prisma.PrismaClientRustPanicError || error instanceof Prisma.PrismaClientInitializationError;
/** What a failed job tells the merchant: an HTTP error written for them (a client error, or any error the merchant-facing
 * gate leaves unchanged, such as a provider quota or ChatGPT-plan 503), never database, internal or diagnostic text. */
export function merchantJobError(error: unknown): string | null {
  if (isPrismaError(error) || !(error instanceof HttpException)) return null;
  return error.getStatus() < 500 || merchantFacingSourceFailure(error) === error ? error.message : null;
}
// By name: an aborted fetch rejects with a DOMException, which is not always an Error in this realm.
const isAbort = (error: unknown) => ['AbortError', 'TimeoutError'].includes((error as { name?: unknown } | null)?.name as string);
export function chatJobView(job: StoreSourceChatJob) {
  return { id: job.id, requestId: job.requestId, status: job.status, sequence: job.sequence, progress: job.progress, attempt: job.attempt, result: job.result, error: job.error, lastCommittedRevision: job.lastCommittedRevision, createdAt: job.createdAt, updatedAt: job.updatedAt };
}
@Injectable()
export class SourceChatJobsService implements OnModuleDestroy {
  private busy = false;
  private controller?: AbortController;
  private readonly logger = new Logger(SourceChatJobsService.name);
  constructor(private readonly prisma: PrismaService, private readonly chat: SourceChatService) {}
  onModuleDestroy() { this.controller?.abort(); }
  private async owner(merchantId: string, storeId: string) {
    if (!await this.prisma.store.findFirst({ where: { id: storeId, merchantId }, select: { id: true } })) throw new NotFoundException('Tienda no encontrada.');
  }
  async create(merchantId: string, storeId: string, input: SendSourceMessageDto) {
    await this.owner(merchantId, storeId);
    if (!input.requestId) throw new BadRequestException('La solicitud necesita un requestId.');
    const inputDigest = chatRequestDigest(input);
    const existing = await this.prisma.storeSourceChatJob.findUnique({ where: { storeId_requestId: { storeId, requestId: input.requestId } } });
    if (existing) {
      if (existing.inputDigest !== inputDigest) throw new ConflictException('Este requestId ya corresponde a otro pedido.');
      return chatJobView(existing);
    }
    await this.expire();
    const history = await this.prisma.storeAgentMessage.findMany({ where: { thread: { storeId }, channel: 'source', role: 'ASSISTANT' }, orderBy: { createdAt: 'desc' }, take: 30, select: { id: true, metadata: true } });
    const contextAnchor = history.find(message => !(message.metadata as any)?.failed && !(message.metadata as any)?.adaptationFailed)?.id;
    try {
      return chatJobView(await this.prisma.storeSourceChatJob.create({ data: { merchantId, storeId, requestId: input.requestId, inputDigest, input: json({ ...input, merchantRequest: sourceMerchantRequest(input, contextAnchor) }), activeStoreId: storeId } }));
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const duplicate = await this.prisma.storeSourceChatJob.findUnique({ where: { storeId_requestId: { storeId, requestId: input.requestId } } });
        if (duplicate?.inputDigest === inputDigest) return chatJobView(duplicate);
        throw new ConflictException('Ya hay un pedido de YAPI en curso en esta tienda.');
      }
      throw error;
    }
  }
  async latest(merchantId: string, storeId: string) {
    await this.owner(merchantId, storeId); await this.expire();
    const job = await this.prisma.storeSourceChatJob.findFirst({ where: { storeId }, orderBy: { createdAt: 'desc' } });
    return { job: job ? chatJobView(job) : null };
  }
  async get(merchantId: string, storeId: string, id: string) {
    await this.owner(merchantId, storeId);
    const job = await this.prisma.storeSourceChatJob.findFirst({ where: { id, storeId, merchantId } });
    if (!job) throw new NotFoundException('Pedido no encontrado.');
    return chatJobView(job);
  }
  async cancel(merchantId: string, storeId: string, id: string) {
    await this.get(merchantId, storeId, id);
    await this.prisma.storeSourceChatJob.updateMany({ where: { id, storeId, status: { in: ['QUEUED', 'RUNNING'] } }, data: { status: 'CANCELLED', activeStoreId: null, leaseToken: null, leaseUntil: null, sequence: { increment: 1 }, error: 'Pedido cancelado. El último diseño guardado se conserva.' } });
    await this.prisma.storeSourceGeneration.updateMany({ where: { requestJobId: id, status: 'RUNNING' }, data: { status: 'INTERRUPTED', activeStoreId: null, completedAt: new Date() } });
    return this.get(merchantId, storeId, id);
  }
  @Interval(5000)
  async expire() {
    // Never automatically repeat a dispatched model call after a process crash.
    const expired = await this.prisma.storeSourceChatJob.findMany({ where: { status: 'RUNNING', leaseUntil: { lt: new Date() } }, select: { id: true }, take: 50 });
    for (const job of expired) await this.prisma.$transaction(async tx => {
      const changed = await tx.storeSourceChatJob.updateMany({ where: { id: job.id, status: 'RUNNING', leaseUntil: { lt: new Date() } }, data: { status: 'INTERRUPTED', activeStoreId: null, leaseToken: null, leaseUntil: null, sequence: { increment: 1 }, error: 'La conexión de trabajo se interrumpió. Tu diseño y el borrador se conservan. Reintenta para continuar.' } });
      if (changed.count) await tx.storeSourceGeneration.updateMany({ where: { requestJobId: job.id, status: 'RUNNING' }, data: { status: 'INTERRUPTED', activeStoreId: null, completedAt: new Date() } });
    });
  }
  private fence(job: StoreSourceChatJob) { return { id: job.id, status: 'RUNNING', leaseToken: job.leaseToken, leaseUntil: { gt: new Date() } }; }
  @Interval(1000)
  async tick() {
    if (this.busy) return;
    this.busy = true;
    try {
      await this.expire();
      const queued = await this.prisma.storeSourceChatJob.findFirst({ where: { status: 'QUEUED' }, orderBy: { createdAt: 'asc' } });
      if (!queued) return;
      const leaseToken = randomUUID();
      const claim = await this.prisma.storeSourceChatJob.updateMany({ where: { id: queued.id, status: 'QUEUED' }, data: { status: 'RUNNING', leaseToken, leaseUntil: new Date(Date.now() + LEASE_MS), attempt: { increment: 1 }, sequence: { increment: 1 } } });
      if (!claim.count) return;
      await this.run({ ...queued, status: 'RUNNING', leaseToken });
    } catch (error) { this.logger.warn(error instanceof Error ? error.message : 'YAPI worker failed'); }
    finally { this.busy = false; }
  }
  async run(job: StoreSourceChatJob) {
    const controller = new AbortController(); this.controller = controller;
    const heartbeat = setInterval(() => {
      void this.prisma.storeSourceChatJob.updateMany({ where: this.fence(job), data: { leaseUntil: new Date(Date.now() + LEASE_MS) } }).then(result => { if (!result.count) controller.abort(); }).catch(() => controller.abort());
    }, 5000);
    try {
      const result = await sourceRequestContext.run({ request: (job.input as any).merchantRequest || sourceMerchantRequest(job.input as unknown as SendSourceMessageDto), jobId: job.id, signal: controller.signal, progress: async progress => {
        const updated = await this.prisma.storeSourceChatJob.updateMany({ where: this.fence(job), data: { progress: json(progress), sequence: { increment: 1 } } });
        if (!updated.count) controller.abort();
      }, assertLease: async (tx, revision, targetStoreId) => {
        if (targetStoreId !== job.storeId) throw new ConflictException('El pedido pertenece a otra tienda.');
        controller.signal.throwIfAborted();
        // The row lock fences cancellation and competing workers in the same transaction as the revision.
        const held = await tx.storeSourceChatJob.updateMany({ where: this.fence(job), data: { lastCommittedRevision: revision, sequence: { increment: 1 } } });
        if (!held.count) throw new ConflictException('Este pedido perdió su turno; el diseño anterior se conserva.');
      } }, () => this.chat.send(job.merchantId, job.storeId, job.input as unknown as SendSourceMessageDto));
      const failed = (result as any).assistantMessage?.metadata?.failed || (result as any).assistantMessage?.metadata?.adaptationFailed;
      await this.prisma.storeSourceChatJob.updateMany({ where: this.fence(job), data: { status: failed ? 'FAILED' : 'revision' in result && result.revision ? 'COMPLETED' : 'AWAITING_INPUT', result: json(result), activeStoreId: null, leaseToken: null, leaseUntil: null, sequence: { increment: 1 } } });
    } catch (error) {
      const generation = await this.prisma.storeSourceGeneration.findFirst({ where: { requestJobId: job.id }, orderBy: { createdAt: 'desc' }, select: { status: true } }).catch(() => null);
      const outcome = generation && ['PARTIAL', 'BLOCKED'].includes(generation.status) ? generation.status : 'FAILED';
      const message = merchantJobError(error);
      const detail = `YAPI job ${job.id} failed: ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`;
      // A cancelled or interrupted job is not a fault.
      if (message === null) { if (controller.signal.aborted || isAbort(error)) this.logger.warn(detail); else this.logger.error(detail); }
      await this.prisma.storeSourceChatJob.updateMany({ where: this.fence(job), data: { status: controller.signal.aborted ? 'INTERRUPTED' : outcome, activeStoreId: null, leaseToken: null, leaseUntil: null, sequence: { increment: 1 }, error: (message ?? FAILED_JOB_MESSAGE).slice(0, 1000) } }).catch(() => {});
    } finally { clearInterval(heartbeat); if (this.controller === controller) this.controller = undefined; }
  }
}
