import { ConflictException, type Logger } from '@nestjs/common';
import { pendingAssumptions, readVoice } from './store-voice';
import type { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import type { SourceProjectsService } from './source-projects.service';
import type { SaveSourceProjectDto, SourceProjectFileDto } from './dto/save-source-project.dto';
import type { SourceModel } from './source-generation-policy';
import { reviewMessage, SOURCE_REVIEW_LABEL, SOURCE_REVIEW_STATUS, SourceReviewCancelled, SourceReviewDiscarded, type SourceReviewRegistry } from './source-background-review';
import { sourceRequestContext } from './source-request-context';
import { completedCredits, SEP5_CLIENT_TIMEOUT_MS } from './source-generation-run';
import { captureHeaderCovers, headerCoverProblems, introducedHeaderCovers, type HeaderCover } from './design-engine/header-clickable';
import { currentSourceRuntime } from './source-runtime';
import type { SourceProjectSnapshot } from './source-project';
import type { Sep5Review, SourceGenerationAttempt } from './source-generation-types';

/** What the background review needs from SourceGenerationService, read when the review starts. */
export type BackgroundReviewDeps = {
  prisma: PrismaService; projects: SourceProjectsService; config: ConfigService; logger: Logger;
  reviews: SourceReviewRegistry; reviewHeartbeatMs: number;
  /** The service's coverWithRewardCredits, bound to the service (it reads this.rewards and swallows its own errors). */
  coverWithRewardCredits: (merchantId: string, generationId: string, credits: number) => Promise<number>;
};
export type BackgroundReviewInput = { merchantId: string; storeId: string; revision: number; brief: SaveSourceProjectDto['brief']; savedFiles: SourceProjectFileDto[]; model: SourceModel; requestedModel: string; maxCredits: number; freeRun: boolean; review: Sep5Review };

/** The catalog items revision N saved in config.js, written into `files`' config.js; files unchanged when N has none. */
export async function withSavedCatalog(deps: Pick<BackgroundReviewDeps, 'projects'>, merchantId: string, storeId: string, revision: number, files: SourceProjectFileDto[]): Promise<SourceProjectFileDto[]> {
  const configOf = (content: string | undefined) => { try { return content ? JSON.parse(content.replace(/^\s*window\.PAGOSYA_CONFIG\s*=\s*/, '').replace(/;?\s*$/, '')) : null; } catch { return null; } };
  const version = await Promise.resolve().then(() => deps.projects.version(merchantId, storeId, revision)).catch(() => null);
  const items = configOf((version?.snapshot as { files?: SourceProjectFileDto[] } | undefined)?.files?.find(file => file.path === 'config.js')?.content)?.data?.items;
  if (!Array.isArray(items)) return files;
  return files.map(file => {
    const config = file.path === 'config.js' ? configOf(file.content) : null;
    return config ? { ...file, content: `window.PAGOSYA_CONFIG = ${JSON.stringify({ ...config, data: { ...config.data, items } })};\n` } : file;
  });
}

/**
 * YAPI's self-review of a Sep-5 store, after revision N is saved and shown (spec 2026-10-12 faster generation, part 2).
 * It runs in this API process, outside the chat request that saved N, on its own REVIEWING row:
 * - no lease, so a new request cancels it instead of waiting;
 * - a heartbeat, which Studio's reviewPending reads;
 * - the row flips to COMPLETED in the same transaction that saves N+1 «Revisión de YAPI».
 * The save keeps the optimistic revision check, so a merchant change, template or restore since N discards the result
 * silently. Credits are charged on the row only when the review's answer is used. Resolves once the row exists.
 */
export async function startBackgroundReview(deps: BackgroundReviewDeps, input: BackgroundReviewInput): Promise<void> {
  const row = await deps.prisma.storeSourceGeneration.create({ data: { storeId: input.storeId, baseRevision: input.revision, requestedModel: input.requestedModel, model: input.model, maxCredits: input.maxCredits, status: SOURCE_REVIEW_STATUS } })
    .catch(error => { deps.logger.warn(JSON.stringify({ event: 'sep5_review_not_started', storeId: input.storeId, reason: ((error as Error)?.message || '').slice(0, 300) })); return null; });
  if (!row) return;
  // Outside the request's context: its lease fence and progress reporter belong to a chat job that has finished.
  void deps.reviews.start(input.storeId, cancel => sourceRequestContext.exit(async () => {
    const started = Date.now(), attempts: SourceGenerationAttempt[] = [], lost = new AbortController();
    const heartbeat = setInterval(() => {
      void deps.prisma.storeSourceGeneration.updateMany({ where: { id: row.id, status: SOURCE_REVIEW_STATUS }, data: { heartbeatAt: new Date() } }).then(result => { if (!result.count) lost.abort(); }).catch(() => undefined);
    }, deps.reviewHeartbeatMs);
    const record = () => ({ attempts: attempts as unknown as Prisma.InputJsonValue, durationMs: Date.now() - started, completedAt: new Date() });
    try {
      const deadline = Date.now() + SEP5_CLIENT_TIMEOUT_MS;
      const signal = AbortSignal.any([cancel, lost.signal, AbortSignal.timeout(SEP5_CLIENT_TIMEOUT_MS)]);
      const outcome = await input.review({ signal, attempts, deadline });
      signal.throwIfAborted();
      const credits = completedCredits(attempts, input.maxCredits, input.freeRun);
      if (!outcome) {
        await deps.prisma.storeSourceGeneration.updateMany({ where: { id: row.id, status: SOURCE_REVIEW_STATUS }, data: { status: 'COMPLETED', credits, ...record() } });
        deps.logger.log(JSON.stringify({ event: 'sep5_review_unchanged', generationId: row.id }));
        return;
      }
      // Header controls the review covers, judged against revision N, like an edit: only covers it brings in block.
      if (deps.config.get<boolean>('app.headerClickGate') === true) {
        let introduced: HeaderCover[] = [];
        try {
          const covers = async (files: SourceProjectFileDto[]) => captureHeaderCovers(await currentSourceRuntime({ brief: input.brief, files } as unknown as SourceProjectSnapshot), signal);
          const saved = await covers(input.savedFiles);
          introduced = introducedHeaderCovers(await covers(outcome.saveInput.files), saved);
        } catch (error) {
          signal.throwIfAborted();
          deps.logger.warn(JSON.stringify({ event: 'header_click_check_failed', generationId: row.id, reason: ((error as Error)?.message || '').slice(0, 300) }));
        }
        if (introduced.length) throw new SourceReviewDiscarded(headerCoverProblems(introduced).join(' '));
      }
      // N's save rewrote config.js with the catalog this run created (append); the review assembled its config from the
      // run's start, before those products existed, so N+1 carries N's catalog instead of an empty one.
      const files = await withSavedCatalog(deps, input.merchantId, input.storeId, input.revision, outcome.saveInput.files);
      const saved = await deps.projects.save(input.merchantId, input.storeId, { ...outcome.saveInput, files, revision: input.revision, label: SOURCE_REVIEW_LABEL }, undefined, async tx => {
        const held = await tx.storeSourceGeneration.updateMany({ where: { id: row.id, status: SOURCE_REVIEW_STATUS }, data: { status: 'COMPLETED', revision: input.revision + 1, credits, ...record() } });
        if (held.count !== 1) throw new SourceReviewCancelled('la revisión se canceló antes de guardarse');
      });
      const thread = await deps.prisma.storeAgentThread.findUnique({ where: { storeId: input.storeId }, select: { id: true } }).catch(() => null);
      if (thread) await deps.prisma.storeAgentMessage.create({ data: { threadId: thread.id, channel: 'source', role: 'ASSISTANT', content: reviewMessage(outcome.notes, outcome.saveInput.label, pendingAssumptions(readVoice(outcome.saveInput.files)).length), metadata: { sourceRevision: saved.revision, label: SOURCE_REVIEW_LABEL, review: true } } }).catch(() => undefined);
      if (credits) await deps.coverWithRewardCredits(input.merchantId, row.id, credits);
      deps.logger.log(JSON.stringify({ event: 'sep5_review_saved', generationId: row.id, revision: saved.revision, notes: outcome.notes.length }));
    } catch (error) {
      const status = cancel.aborted || lost.signal.aborted || error instanceof SourceReviewCancelled ? 'CANCELLED'
        : error instanceof ConflictException || error instanceof SourceReviewDiscarded ? 'DISCARDED' : 'FAILED';
      await deps.prisma.storeSourceGeneration.updateMany({ where: { id: row.id, status: { in: [SOURCE_REVIEW_STATUS, 'CANCELLED'] } }, data: { status, credits: 0, ...record() } }).catch(() => undefined);
      deps.logger.warn(JSON.stringify({ event: 'sep5_review_kept_draft', generationId: row.id, status, reason: ((error as Error)?.message || 'sin respuesta').slice(0, 300) }));
    } finally { clearInterval(heartbeat); }
  }));
}
