import { DesignRetryableConflict } from './source-design-errors';
import { BadRequestException, ConflictException, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { Prisma, type StoreSourceDesignJob } from '@prisma/client';
import { SourceDesignJobsService, DESIGN_JOB_CAPS, DesignBudgetError, designDigest } from './source-design-jobs.service';
import { SourceDesignEvaluator, designCaptureFailures, type DesignAssessment } from './source-design-evaluator';
import { SourceProjectsService } from './source-projects.service';
import { SourceGenerationService } from './source-generation.service';
import { SourceVisualReviewService } from './source-visual-review.service';
import { captureSourceVisuals, probeSourceShopping, type VisualCapture } from './source-visual-capture';
import { currentSourceRuntime } from './source-runtime';
import { assertSourceCommerceContract } from './source-commerce-contract';
import { sourceProjectDigest, type SourceProjectSnapshot } from './source-project';
import { sourceVisualState } from './source-visual-state';
import { sourceMotionMode } from './source-motion';

const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
export function knownDesignSpend(attempts: any[]): number | null { return attempts.length && attempts.every(a => Number.isSafeInteger(a.usage?.providerMicroUsd) && a.usage.providerMicroUsd >= 0) ? attempts.reduce((sum, a) => sum + a.usage.providerMicroUsd, 0) : null; }
const runtimeDigest = (snapshot: SourceProjectSnapshot) => designDigest(snapshot.files.filter(f => ['commerce.js', 'privacy.js', 'retention.js', 'commerce-pages.css'].includes(f.path)));

@Injectable()
export class SourceDesignJobWorker implements OnModuleDestroy {
  private busy = false;
  private lastPruned = 0;
  private controller?: AbortController;
  private readonly logger = new Logger(SourceDesignJobWorker.name);
  constructor(private readonly jobs: SourceDesignJobsService, private readonly projects: SourceProjectsService, private readonly generator: SourceGenerationService, private readonly review: SourceVisualReviewService, private readonly evaluator: SourceDesignEvaluator) {}
  onModuleDestroy() { this.controller?.abort(); }
  @Interval(3000)
  async tick() {
    if (this.busy || !this.jobs.enabled()) return;
    this.busy = true;
    try { if (Date.now() - this.lastPruned > 3600000) { await this.jobs.pruneEvidence(); this.lastPruned = Date.now(); } await this.jobs.expire(); const job = await this.jobs.claim(); if (job) await this.run(job); }
    catch (error) { this.logger.warn(error instanceof Error ? error.message : 'Design worker failed'); }
    finally { this.busy = false; }
  }
  async run(job: StoreSourceDesignJob) {
    const controller = new AbortController(); this.controller = controller;
    const signal = controller.signal;
    const heartbeat = setInterval(() => { void this.jobs.heartbeat(job).then(ok => { if (!ok) controller.abort(); }).catch(() => controller.abort()); }, 5000);
    let actual: number | null = null;
    const cp = structuredClone(job.checkpoints) as any;
    const input = job.input as any;
    try {
      const store = await this.jobs.prisma.store.findUniqueOrThrow({ where: { id: job.storeId }, select: { merchantId: true } });
      await this.jobs.assertFresh(job, store.merchantId);
      const version = await this.projects.version(store.merchantId, job.storeId, job.revision);
      if (version.digest !== job.sourceDigest) throw new ConflictException('La revisión guardada cambió.');
      const current = await currentSourceRuntime(version.snapshot as unknown as SourceProjectSnapshot);
      if (cp.runtimeDigest && runtimeDigest(current) !== cp.runtimeDigest) throw new ConflictException('El runtime cambió. Inicia otra revisión.');
      // A job does not monopolize the chat generation slot across nonpaid stages.
      // Wait before reserving a stage if an ordinary generation currently owns it.
      if (DESIGN_JOB_CAPS[job.stage] && await this.jobs.prisma.storeSourceGeneration.findFirst({ where: { activeStoreId: job.storeId } })) {
        await this.next(job, job.stage, cp, { availableAt: new Date(Date.now() + 15000) }); return;
      }
      signal.throwIfAborted();
      await this.jobs.reserve(job);
      const context = { brief: current.brief, page: input.page, productId: cp.productId || input.productId || null, revision: job.revision, sourceDigest: job.sourceDigest, runtimeDigest: cp.runtimeDigest, catalogDigest: job.contextDigest };
      if (job.stage === 'CAPTURE_BASELINE') {
        const catalog = await this.generator.catalog(store.merchantId, job.storeId);
        const baseline = { ...current, files: current.files.map(f => {
          if (f.path !== 'config.js') return f;
          const settings = JSON.parse(f.content.match(/^\s*window\.PAGOSYA_CONFIG\s*=\s*([\s\S]*?);?\s*$/)![1]);
          const absolute = (url: string) => url.startsWith('/v1/uploads/') ? new URL(url, settings.apiBaseUrl).href : url;
          const data = { ...catalog, items: catalog.items.map((p: any) => ({ ...p, imageUrls: (p.imageUrls || []).map(absolute), variants: p.variants?.map((v: any) => ({ ...v, ...(v.imageUrl ? { imageUrl: absolute(v.imageUrl) } : {}) })) })) };
          return { ...f, content: 'window.PAGOSYA_CONFIG = ' + JSON.stringify({ ...settings, data }) + ';\n' };
        }) };
        const pinned = await this.review.hydrate(baseline, store.merchantId);
        cp.productId = sourceVisualState(pinned, input.page, input.productId).productId;
        cp.runtimeDigest = runtimeDigest(current); cp.baselineDigest = sourceProjectDigest(baseline);
        const captures = await captureSourceVisuals(pinned, input.page, cp.productId, signal);
        // Broken loading is inconclusive evidence; never spend on judging it.
        if (captures.some(c => !c.readiness.fontsLoaded || c.readiness.missingImages)) { cp.loadingError = 'No se cargaron los recursos de la captura. Revisa las imágenes antes de iniciar otra mejora.'; await this.finish(job, 'INCONCLUSIVE', cp, null); return; }
        cp.baselineShopping = await probeSourceShopping(pinned, signal);
        if (!cp.baselineShopping.some((r: any) => ['passed', 'failed'].includes(r.status))) { await this.finish(job, 'UNSUPPORTED', cp, null); return; }
        cp.baselineCoverage = captures.map(({ image, ...c }) => c);
        await this.next(job, 'REVIEW_BASELINE', cp, {}, { baseline, 'baseline-captures': captures }); return;
      }
      if (job.stage === 'REVIEW_BASELINE') {
        actual = 0;
        const captures = await this.jobs.artifact<VisualCapture[]>(job.id, 'baseline-captures');
        cp.review = await this.evaluator.assess(job.storeId, context, captures, undefined, DESIGN_JOB_CAPS.REVIEW_BASELINE, signal, false, { onDispatch: () => { actual = null; }, onUsage: cost => { actual = cost; } });
        actual = cp.review.providerMicroUsd;
        if (!cp.review.findings.some((f: any) => f.severity === 'major') && !designCaptureFailures(captures).length) {
          await this.finish(job, 'UNCHANGED', cp, actual); return;
        }
        cp.findings = [...cp.review.findings, ...designCaptureFailures(captures).map(observation => ({ viewport: 'both', severity: 'major', category: 'layout', location: input.page, observation, correction: 'Corrige el tamaño de columnas y contenedores sin ocultar contenido ni controles.' }))];
        await this.next(job, 'REPAIR', cp, this.jobs.settlement(job, actual)); return;
      }
      if (job.stage === 'REPAIR') {
        actual = 0;
        const baseline = await this.jobs.artifact<SourceProjectSnapshot>(job.id, 'baseline');
        const generated = await this.generator.generate(store.merchantId, job.storeId, { revision: job.revision, brief: baseline.brief, instruction: 'Corrige los hallazgos visuales adjuntos.', maxCredits: DESIGN_JOB_CAPS.REPAIR, model: 'gpt-5.6-sol', motion: sourceMotionMode(baseline.files) }, undefined, [], undefined, { candidate: true, snapshot: baseline, findings: cp.findings, referenceCaptures: (await this.jobs.artifact<VisualCapture[]>(job.id, 'baseline-captures')).filter(c => c.y === 0 || c.viewport === 'mobile'), signal, onDispatch: () => { actual = null; }, onAttempts: attempts => { actual = attempts.length ? knownDesignSpend(attempts) : actual; } });
        actual = knownDesignSpend(generated.generation.attempts);
        if (!generated.candidate) throw new Error('No se recibió una propuesta privada.');
        cp.candidateDigest = sourceProjectDigest(generated.candidate); cp.generation = generated.generation;
        await this.next(job, 'CAPTURE_CANDIDATE', cp, { ...this.jobs.settlement(job, actual), repairs: job.repairs + 1 }, { ['candidate-' + (job.repairs + 1)]: generated.candidate }); return;
      }
      if (job.stage === 'CAPTURE_CANDIDATE') {
        const candidate = await this.jobs.artifact<SourceProjectSnapshot>(job.id, 'candidate-' + job.repairs);
        assertSourceCommerceContract(candidate);
        const captures = await captureSourceVisuals(await this.review.hydrate(candidate, store.merchantId), input.page, cp.productId, signal);
        cp.candidateCoverage = captures.map(({ image, ...c }) => c);
        const failures = designCaptureFailures(captures);
        if (failures.length) {
          cp.rejections = [...(cp.rejections || []), { repair: job.repairs, failures }];
          if (job.repairs < input.maxRepairs) { cp.findings = [...cp.findings, ...failures.map(observation => ({ location: input.page, observation, correction: 'Repara la causa sin ocultar controles, texto o imágenes.' }))]; await this.next(job, 'REPAIR', cp, {}, { ['candidate-captures-' + job.repairs]: captures }); }
          else await this.finish(job, 'RETAINED_BASELINE', cp, null, { ['candidate-captures-' + job.repairs]: captures });
          return;
        }
        // Persist masked order before dispatch, so resume uses the same comparison.
        cp.reverse = parseInt(designDigest(job.id + ':' + job.repairs).slice(0, 2), 16) % 2 === 1;
        await this.next(job, 'PROBE_CANDIDATE', cp, {}, { ['candidate-captures-' + job.repairs]: captures }); return;
      }
      if (job.stage === 'PROBE_CANDIDATE') {
        const candidate = await this.jobs.artifact<SourceProjectSnapshot>(job.id, 'candidate-' + job.repairs);
        cp.shopping = await probeSourceShopping(await this.review.hydrate(candidate, store.merchantId), signal);
        if (cp.shopping.some((r: any) => r.status === 'failed') || !cp.shopping.some((r: any) => r.status === 'passed')) { await this.finish(job, 'RETAINED_BASELINE', cp, null); return; }
        await this.next(job, 'COMPARE', cp); return;
      }
      if (job.stage === 'COMPARE') {
        actual = 0;
        const baseline = await this.jobs.artifact<VisualCapture[]>(job.id, 'baseline-captures');
        const candidate = await this.jobs.artifact<VisualCapture[]>(job.id, 'candidate-captures-' + job.repairs);
        cp.comparison = await this.evaluator.assess(job.storeId, context, baseline, candidate, DESIGN_JOB_CAPS.COMPARE, signal, cp.reverse, { onDispatch: () => { actual = null; }, onUsage: cost => { actual = cost; } });
        actual = cp.comparison.providerMicroUsd;
        const comparison: DesignAssessment = cp.comparison;
        if (comparison.preference === 'candidate' && !comparison.regressions.length && !comparison.findings.some(f => f.severity === 'major')) { await this.next(job, 'APPLY', cp, this.jobs.settlement(job, actual)); return; }
        await this.finish(job, 'RETAINED_BASELINE', cp, actual); return;
      }
      if (job.stage === 'APPLY') {
        const candidate = await this.jobs.artifact<SourceProjectSnapshot>(job.id, 'candidate-' + job.repairs);
        await this.jobs.assertFresh(job, store.merchantId); signal.throwIfAborted();
        if (await this.jobs.prisma.storeSourceGeneration.findFirst({ where: { activeStoreId: job.storeId } })) { await this.next(job, 'APPLY', cp, { availableAt: new Date(Date.now() + 15000) }); return; }
        clearInterval(heartbeat);
        await this.projects.applyPrepared(store.merchantId, job.storeId, job.revision, candidate, cp.candidateDigest, async tx => {
          const applied = await tx.storeSourceDesignJob.updateMany({ where: this.jobs.fence(job), data: { status: 'APPLIED', activeStoreId: null, leaseToken: null, leaseUntil: null, resultRevision: job.revision + 1 } });
          if (!applied.count) throw new ConflictException('La mejora fue cancelada o perdió su turno.');
          // Lock the parent to fence inserts and concurrent generation admission.
          await tx.$queryRaw`SELECT id FROM "Store" WHERE id = ${job.storeId} AND "merchantId" = ${store.merchantId} FOR UPDATE`;
          await tx.$queryRaw`SELECT id FROM "PaymentLink" WHERE "storeId" = ${job.storeId} FOR SHARE`;
          await tx.$queryRaw`SELECT id FROM "Category" WHERE "storeId" = ${job.storeId} FOR SHARE`;
          if (await this.jobs.contextDigest(job.storeId, tx) !== job.contextDigest) throw new ConflictException('El catálogo cambió durante la mejora.');
          if (await tx.storeSourceGeneration.findFirst({ where: { activeStoreId: job.storeId } })) throw new ConflictException('Hay una generación en curso.');
        });
      }
    } catch (error) {
      if (error instanceof DesignRetryableConflict && !signal.aborted) { await this.next(job, job.stage, cp, { ...this.jobs.settlement(job, actual ?? 0), availableAt: new Date(Date.now() + 15000) }).catch(() => {}); return; }
      const cancelled = signal.aborted;
      const status = cancelled ? 'INTERRUPTED' : error instanceof ConflictException ? 'STALE' : error instanceof DesignBudgetError ? 'BUDGET_EXHAUSTED' : 'FAILED';
      await this.jobs.checkpoint(job, { status, activeStoreId: null, leaseToken: null, leaseUntil: null, error: cancelled ? 'Trabajo interrumpido. Los intentos enviados pueden tener costo.' : (error instanceof Error ? error.message : 'No se completó la mejora.').slice(0, 700), ...this.jobs.settlement(job, actual) }).catch(() => {});
    } finally { clearInterval(heartbeat); if (this.controller === controller) this.controller = undefined; }
  }
  private next(job: StoreSourceDesignJob, stage: string, checkpoints: unknown, extra: Prisma.StoreSourceDesignJobUpdateManyMutationInput = {}, artifacts: Record<string, unknown> = {}) {
    return this.jobs.stageResult(job, { status: 'QUEUED', stage, availableAt: new Date(), leaseToken: null, leaseUntil: null, checkpoints: json(checkpoints), ...extra }, artifacts);
  }
  private finish(job: StoreSourceDesignJob, status: string, checkpoints: unknown, actual: number | null, artifacts: Record<string, unknown> = {}) {
    return this.jobs.stageResult(job, { status, activeStoreId: null, leaseToken: null, leaseUntil: null, checkpoints: json(checkpoints), ...this.jobs.settlement(job, actual) }, artifacts);
  }
}
