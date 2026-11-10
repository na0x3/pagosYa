import { SourceTourService } from './source-tour.service';
import { tourFocus, TOUR_REQUEST } from './source-tour';
import { AB_END, AB_REQUEST, AB_STATUS, abKind } from './source-ab';
import { SourceAbService } from './source-ab.service';
import { PlansService } from '../plans/plans.service';
import { sourceMerchantRequest } from './source-merchant-request';
import { BadRequestException, ConflictException, HttpException, Injectable, Logger, NotFoundException, OnModuleDestroy, Optional } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { createHash, randomUUID } from 'node:crypto';
import { Prisma, StoreSourceChatJob } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PersonalTouchSkipped, SourceChatService } from './source-chat.service';
import { SendSourceMessageDto, type SourceMessageInput } from './dto/send-source-message.dto';
import { sourceRequestContext } from './source-request-context';
import { MODEL_LIMIT, MODEL_LIMIT_MERCHANT_FAILURE, merchantFacingSourceFailure } from './source-validation-error';
import { SourceProviderQuotaException } from './source-provider-error';
import { isFirstBuildStep, PopupLookService } from '../store-popups/popup-look.service';
/** Spec 2026-10-28 §1: a new store's first design waits out a spent ChatGPT plan — 12 tries, 10 minutes apart — instead of failing. */
export const FIRST_DESIGN_MAX_ATTEMPTS = 12;
export const QUOTA_PAUSE_MS = 10 * 60_000;
import { continuesRequest, pendingRequestIn, unfinishedNote } from './source-unfinished-request';

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
  if (error instanceof Error && MODEL_LIMIT.test(error.message)) return MODEL_LIMIT_MERCHANT_FAILURE;
  if (isPrismaError(error) || !(error instanceof HttpException)) return null;
  return error.getStatus() < 500 || merchantFacingSourceFailure(error) === error ? error.message : null;
}
// By name: an aborted fetch rejects with a DOMException, which is not always an Error in this realm.
const isAbort = (error: unknown) => ['AbortError', 'TimeoutError'].includes((error as { name?: unknown } | null)?.name as string);
/** Where a waiting request stands: requests running or queued before it, and the running store when it is the merchant's own. */
export type ChatJobQueue = { ahead: number; runningStore?: string };
export function chatJobView(job: StoreSourceChatJob, queue?: ChatJobQueue) {
  const input = job.input as unknown as SourceMessageInput | null;
  // Spec 2026-10-28 §1: the Studio covers the canvas while a new store's first design is pending or running.
  const design = { firstDesign: Boolean(input?.firstDesign), designNext: Boolean((job.result as { followUp?: { firstDesign?: boolean } } | null)?.followUp?.firstDesign) };
  return { ...(queue ? { queue } : {}), ...design, background: Boolean(input?.personalTouch && !input.ownRequest), id: job.id, requestId: job.requestId, status: job.status, sequence: job.sequence, progress: job.progress, attempt: job.attempt, result: job.result, error: job.error, lastCommittedRevision: job.lastCommittedRevision, createdAt: job.createdAt, updatedAt: job.updatedAt };
}
/** Review fix 2026-10-28 (I2): a first design that a spent quota would send back to the queue says so to the chat, which then
 *  writes no failure note for that try; the last try fails out loud. */
function withQuotaRetry(job: StoreSourceChatJob): SourceMessageInput {
  const input = job.input as unknown as SourceMessageInput;
  return input?.firstDesign && job.attempt < FIRST_DESIGN_MAX_ATTEMPTS ? { ...input, quotaRetry: true } : input;
}
@Injectable()
export class SourceChatJobsService implements OnModuleDestroy {
  private busy = false;
  /** Spec 2026-10-28: when a first design hit a spent quota, the worker rests until then. */
  private pausedUntil = 0;
  private controller?: AbortController;
  private readonly logger = new Logger(SourceChatJobsService.name);
  constructor(private readonly prisma: PrismaService, private readonly chat: SourceChatService, @Optional() private readonly plans?: PlansService, @Optional() private readonly popupLooks?: PopupLookService, @Optional() private readonly tour?: SourceTourService, @Optional() private readonly ab?: SourceAbService) {}
  /** The API is shutting down (a deploy, a dev restart): a running first design goes back to the queue instead of ending. */
  private stopping = false;
  onModuleDestroy() { this.stopping = true; this.controller?.abort(); }
  private async owner(merchantId: string, storeId: string) {
    if (!await this.prisma.store.findFirst({ where: { id: storeId, merchantId }, select: { id: true } })) throw new NotFoundException('Tienda no encontrada.');
  }
  async create(merchantId: string, storeId: string, input: SourceMessageInput) {
    await this.owner(merchantId, storeId);
    const requestId = input.requestId;
    if (!requestId) throw new BadRequestException('La solicitud necesita un requestId.');
    const inputDigest = chatRequestDigest(input);
    const existing = await this.prisma.storeSourceChatJob.findUnique({ where: { storeId_requestId: { storeId, requestId } } });
    if (existing) {
      if (existing.inputDigest !== inputDigest) throw new ConflictException('Este requestId ya corresponde a otro pedido.');
      return chatJobView(existing);
    }
    // Plans 2026-11-07: a merchant whose month of YAPI credits is used up is told so now, before anything is queued.
    if (!input.personalTouch) await this.plans?.assertCredits(storeId, merchantId);
    await this.expire();
    // Variety spec §5: the merchant's own request wins — a queued or running personal touch on the store is cancelled.
    if (!input.personalTouch) {
      const active = await this.prisma.storeSourceChatJob.findMany({ where: { storeId, status: { in: ['QUEUED', 'RUNNING'] } }, select: { id: true, input: true } });
      // The merchant's own request riding on a new store's follow-up is not a touch: it is never cancelled for them.
      for (const job of active) if ((job.input as unknown as SourceMessageInput | null)?.personalTouch && !(job.input as unknown as SourceMessageInput).ownRequest) await this.cancel(merchantId, storeId, job.id).catch(() => undefined);
    }
    const history = await this.prisma.storeAgentMessage.findMany({ where: { thread: { storeId }, channel: 'source', role: 'ASSISTANT' }, orderBy: { createdAt: 'desc' }, take: 30, select: { id: true, metadata: true } });
    // Owner 2026-10-22: «sigue» after a request that did not finish runs that request again, as it was kept.
    // A new store (revision 0) resumes too: a failed first plan keeps its request and its setup action (final review 2026-10-22).
    const pending = !input.personalTouch && continuesRequest(input.instruction) ? pendingRequestIn(history) : undefined;
    if (pending) input = { ...input, instruction: pending.instruction, resumeWords: input.instruction.trim(), ...(pending.setupAction ? { setupAction: pending.setupAction as SourceMessageInput['setupAction'] } : {}), ...(pending.direct ? { personalTouch: true, ownRequest: true } : {}) };
    // Spec 2026-11-09 A/B tests: a design test ask builds B by the usual edit; the words travel so the saved B gets its test card.
    const abAsk = !input.personalTouch && !input.resumeWords && !input.tourStepId && AB_REQUEST.test(input.instruction);
    if (abAsk && abKind(input.instruction) === 'design') input = { ...input, abRequest: input.instruction.trim().slice(0, 200) };
    // YAPI tour (spec 2026-11-09): a reply to «¿Qué le cambio?», or a change typed straight after a step question, edits that step only.
    const tourStep = !abAsk && !AB_STATUS.test(input.instruction) && !AB_END.test(input.instruction) && !input.personalTouch && !input.selection && !input.tourStepId && !input.resumeWords && !TOUR_REQUEST.test(input.instruction) ? await this.tour?.stepForReply(storeId).catch(() => null) : null;
    if (tourStep) input = tourFocus(input, tourStep) as SourceMessageInput;
    const contextAnchor = history.find(message => !(message.metadata as any)?.failed && !(message.metadata as any)?.adaptationFailed)?.id;
    try {
      return chatJobView(await this.prisma.storeSourceChatJob.create({ data: { merchantId, storeId, requestId, inputDigest, input: json({ ...input, merchantRequest: sourceMerchantRequest(input, contextAnchor) }), activeStoreId: storeId } }));
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const duplicate = await this.prisma.storeSourceChatJob.findUnique({ where: { storeId_requestId: { storeId, requestId } } });
        if (duplicate?.inputDigest === inputDigest) return chatJobView(duplicate);
        throw new ConflictException('Ya hay un pedido de YAPI en curso en esta tienda.');
      }
      throw error;
    }
  }
  async latest(merchantId: string, storeId: string) {
    await this.owner(merchantId, storeId); await this.expire();
    const job = await this.prisma.storeSourceChatJob.findFirst({ where: { storeId }, orderBy: { createdAt: 'desc' } });
    return { job: job ? chatJobView(job, await this.queue(job)) : null };
  }
  async get(merchantId: string, storeId: string, id: string) {
    await this.owner(merchantId, storeId);
    const job = await this.prisma.storeSourceChatJob.findFirst({ where: { id, storeId, merchantId } });
    if (!job) throw new NotFoundException('Pedido no encontrado.');
    return chatJobView(job, await this.queue(job));
  }
  /** One worker runs one request at a time (tick), so a request can wait behind another store's run (2026-10-15). */
  private async queue(job: StoreSourceChatJob): Promise<ChatJobQueue | undefined> {
    if (job.status !== 'QUEUED') return undefined;
    const ahead = await this.prisma.storeSourceChatJob.count({ where: { OR: [{ status: 'RUNNING' }, { status: 'QUEUED', createdAt: { lt: job.createdAt } }] } });
    const running = await this.prisma.storeSourceChatJob.findFirst({ where: { status: 'RUNNING' }, orderBy: { createdAt: 'asc' }, select: { storeId: true, merchantId: true } });
    // Another merchant's store name is never shown.
    const store = running && running.merchantId === job.merchantId && running.storeId !== job.storeId ? await this.prisma.store.findUnique({ where: { id: running.storeId }, select: { name: true } }) : null;
    return { ahead, ...(store?.name ? { runningStore: store.name } : {}) };
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
    const expired = await this.prisma.storeSourceChatJob.findMany({ where: { status: 'RUNNING', leaseUntil: { lt: new Date() } }, select: { id: true, storeId: true, attempt: true, input: true }, take: 50 });
    for (const job of expired) {
      // Oh Belly 2026-10-29: a kill with no shutdown hook (the dev watcher) leaves a first design to expire; like a clean shutdown,
      // it goes back to the queue under its cap, so the merchant's «YAPI está diseñando» resumes instead of ending on the template.
      if ((job.input as { firstDesign?: boolean } | null)?.firstDesign && job.attempt < FIRST_DESIGN_MAX_ATTEMPTS) {
        const requeued = await this.prisma.$transaction(async tx => {
          const changed = await tx.storeSourceChatJob.updateMany({ where: { id: job.id, status: 'RUNNING', leaseUntil: { lt: new Date() } }, data: { status: 'QUEUED', activeStoreId: job.storeId, leaseToken: null, leaseUntil: null, sequence: { increment: 1 } } });
          // The dead run's generation gives back the store's active slot, or the next try could not start.
          if (changed.count) await tx.storeSourceGeneration.updateMany({ where: { requestJobId: job.id, status: 'RUNNING' }, data: { status: 'INTERRUPTED', activeStoreId: null, completedAt: new Date() } });
          return changed.count;
        });
        if (requeued) { this.logger.warn(`first design ${job.id} goes back to the queue: its lease expired`); continue; }
      }
      await this.expireOne(job);
    }
  }
  private async expireOne(job: { id: string }) {
    await this.prisma.$transaction(async tx => {
      const changed = await tx.storeSourceChatJob.updateMany({ where: { id: job.id, status: 'RUNNING', leaseUntil: { lt: new Date() } }, data: { status: 'INTERRUPTED', activeStoreId: null, leaseToken: null, leaseUntil: null, sequence: { increment: 1 }, error: 'La conexión de trabajo se interrumpió. Tu diseño y el borrador se conservan. Reintenta para continuar.' } });
      if (changed.count) await tx.storeSourceGeneration.updateMany({ where: { requestJobId: job.id, status: 'RUNNING' }, data: { status: 'INTERRUPTED', activeStoreId: null, completedAt: new Date() } });
      return changed.count;
    }).then(count => count ? this.noteInterrupted(job.id) : undefined);
  }
  /** Owner 2026-10-22: a request cut off (the computer shut off, the server restarted) says so in the chat and keeps the request
   * for «sigue», so neither the merchant nor YAPI takes the store for finished. A personal touch of YAPI's own stays silent. */
  private async noteInterrupted(jobId: string) {
    try {
      const job = await this.prisma.storeSourceChatJob.findUnique({ where: { id: jobId } });
      const input = job?.input as unknown as SourceMessageInput | null;
      if (!job || !input || input.personalTouch && !input.ownRequest) return;
      const thread = await this.prisma.storeAgentThread.findUnique({ where: { storeId: job.storeId }, select: { id: true } });
      if (!thread) return;
      if (input.personalTouch && !input.resumeWords) await this.prisma.storeAgentMessage.deleteMany({ where: { threadId: thread.id, role: 'USER', content: 'Toque personal', metadata: { path: ['requestId'], equals: job.requestId } } });
      await this.prisma.storeAgentMessage.create({ data: { threadId: thread.id, channel: 'source', role: 'ASSISTANT', content: unfinishedNote('interrupted', Boolean(input.ownRequest)),
        metadata: { failed: true, interrupted: true, pendingRequest: { instruction: input.instruction, direct: Boolean(input.personalTouch) } } } });
    } catch (error) { this.logger.warn(`interrupted note not written for ${jobId}: ${String(error).slice(0, 200)}`); }
  }
  private fence(job: StoreSourceChatJob) { return { id: job.id, status: 'RUNNING', leaseToken: job.leaseToken, leaseUntil: { gt: new Date() } }; }
  @Interval(1000)
  async tick() {
    if (this.busy) return;
    this.busy = true;
    try {
      await this.expire();
      if (Date.now() < this.pausedUntil) return;
      // A merchant's request goes before any background personal touch (review fix): touches run when nothing else waits.
      const waiting = await this.prisma.storeSourceChatJob.findMany({ where: { status: 'QUEUED' }, orderBy: { createdAt: 'asc' }, take: 25 });
      const queued = waiting.find(candidate => !(candidate.input as { personalTouch?: boolean } | null)?.personalTouch) ?? waiting[0];
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
      // A request queued before the month ran out stops here with the same message (a background touch too).
      await this.plans?.assertCredits(job.storeId);
      const result = await sourceRequestContext.run({ request: (job.input as any).merchantRequest || sourceMerchantRequest(job.input as unknown as SendSourceMessageDto), jobId: job.id, signal: controller.signal, progress: async progress => {
        const updated = await this.prisma.storeSourceChatJob.updateMany({ where: this.fence(job), data: { progress: json(progress), sequence: { increment: 1 } } });
        if (!updated.count) controller.abort();
      }, assertLease: async (tx, revision, targetStoreId) => {
        if (targetStoreId !== job.storeId) throw new ConflictException('El pedido pertenece a otra tienda.');
        controller.signal.throwIfAborted();
        // The row lock fences cancellation and competing workers in the same transaction as the revision.
        const held = await tx.storeSourceChatJob.updateMany({ where: this.fence(job), data: { lastCommittedRevision: revision, sequence: { increment: 1 } } });
        if (!held.count) throw new ConflictException('Este pedido perdió su turno; el diseño anterior se conserva.');
      } }, () => this.chat.send(job.merchantId, job.storeId, withQuotaRetry(job))
        .catch(error => { if (error instanceof PersonalTouchSkipped) return { skipped: true as const, ...(error.followUp ? { followUp: error.followUp } : {}) }; throw error; }));
      const failed = (result as any).assistantMessage?.metadata?.failed || (result as any).assistantMessage?.metadata?.adaptationFailed;
      await this.prisma.storeSourceChatJob.updateMany({ where: this.fence(job), data: { status: failed ? 'FAILED' : 'skipped' in result || 'revision' in result && result.revision ? 'COMPLETED' : 'AWAITING_INPUT', result: json(result), activeStoreId: null, leaseToken: null, leaseUntil: null, sequence: { increment: 1 } } });
      // Variety spec §5: a reply can carry a follow-up request (the personal touch). A store has one active job at a time,
      // so it is queued only now that this job is closed; failing to queue it never fails the merchant's request.
      // Spec 2026-11-01: the rest of a template layout edit was the merchant's own message, already in the chat; its echo goes.
      const restOf = job.input as unknown as SourceMessageInput | null;
      if (restOf?.layoutRest || restOf?.shippingRest) await this.prisma.storeAgentMessage.deleteMany({ where: { role: 'USER', metadata: { path: ['requestId'], equals: job.requestId } } }).catch(() => undefined);
      const followUp = !failed && 'followUp' in result ? result.followUp as SourceMessageInput | undefined : undefined;
      if (followUp) await this.create(job.merchantId, job.storeId, followUp).catch(error => this.logger.warn(`follow-up not queued for ${job.storeId}: ${String(error).slice(0, 200)}`));
      // Spec 2026-11-09: the last step of a new store's first build gives its popup a look (instant; never delays the chat).
      // Spec 2026-11-09 tour: then YAPI offers to walk the new store (after the popup line, so the offer is the last message).
      if (!failed && !followUp && isFirstBuildStep(job.input)) void Promise.resolve(this.popupLooks?.designAfterBuild(job.storeId)).catch(() => undefined)
        .then(() => this.tour?.offer(job.storeId)).catch(error => this.logger.warn(`tour offer failed for ${job.storeId}: ${String(error).slice(0, 200)}`));
      if (restOf?.tourStepId) void this.tour?.afterEdit(job.storeId, Boolean(failed)).catch(() => undefined);
      // Spec 2026-11-09 A/B tests: the saved revision is B — YAPI asks to launch the test (nothing when the edit saved nothing).
      const savedB = !failed && restOf?.abRequest && 'revision' in result ? (result as { revision?: { revision?: number } }).revision?.revision : undefined;
      if (savedB && restOf?.abRequest) void this.ab?.proposeDesign(job.storeId, savedB, restOf.abRequest).catch(error => this.logger.warn(`A/B card failed for ${job.storeId}: ${String(error).slice(0, 200)}`));
    } catch (error) {
      if ((job.input as unknown as SourceMessageInput | null)?.tourStepId) void this.tour?.afterEdit(job.storeId, true).catch(() => undefined);
      const generation = await this.prisma.storeSourceGeneration.findFirst({ where: { requestJobId: job.id }, orderBy: { createdAt: 'desc' }, select: { status: true } }).catch(() => null);
      const outcome = generation && ['PARTIAL', 'BLOCKED'].includes(generation.status) ? generation.status : 'FAILED';
      const message = merchantJobError(error);
      const detail = `YAPI job ${job.id} failed: ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`;
      const input = job.input as unknown as SourceMessageInput | null;
      if (input?.firstDesign && (message === MODEL_LIMIT_MERCHANT_FAILURE || error instanceof SourceProviderQuotaException) && job.attempt < FIRST_DESIGN_MAX_ATTEMPTS && !controller.signal.aborted) {
        // The ChatGPT plan ran out mid-design: the merchant keeps «YAPI está diseñando», the store keeps its one active slot, and
        // every worker rests until the quota may be back (every call would fail the same way meanwhile).
        this.pausedUntil = Date.now() + QUOTA_PAUSE_MS;
        this.logger.warn(`first design ${job.id} waits for the model quota (try ${job.attempt} of ${FIRST_DESIGN_MAX_ATTEMPTS})`);
        await this.prisma.storeSourceChatJob.updateMany({ where: this.fence(job), data: { status: 'QUEUED', activeStoreId: job.storeId, leaseToken: null, leaseUntil: null, sequence: { increment: 1 } } });
        return;
      }
      // Live check 2026-10-28 (Remolino): a restart mid-design left the new store on its template; it resumes once the API is back.
      if (input?.firstDesign && this.stopping && controller.signal.aborted) {
        const requeued = await this.prisma.storeSourceChatJob.updateMany({ where: this.fence(job), data: { status: 'QUEUED', activeStoreId: job.storeId, leaseToken: null, leaseUntil: null, sequence: { increment: 1 } } });
        if (requeued.count) { this.logger.warn(`first design ${job.id} goes back to the queue: the API is restarting`); return; }
      }
      // A cancelled or interrupted job is not a fault.
      if (message === null) { if (controller.signal.aborted || isAbort(error)) this.logger.warn(detail); else this.logger.error(detail); }
      const closed = await this.prisma.storeSourceChatJob.updateMany({ where: this.fence(job), data: { status: controller.signal.aborted ? 'INTERRUPTED' : outcome, activeStoreId: null, leaseToken: null, leaseUntil: null, sequence: { increment: 1 }, error: (message ?? FAILED_JOB_MESSAGE).slice(0, 1000) } }).catch(() => ({ count: 0 }));
      if (closed.count && controller.signal.aborted) await this.noteInterrupted(job.id);
    } finally { clearInterval(heartbeat); if (this.controller === controller) this.controller = undefined; }
  }
}
