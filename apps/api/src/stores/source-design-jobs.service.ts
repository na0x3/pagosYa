import { BadRequestException, ConflictException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, type StoreSourceDesignJob } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { SourceProjectsService } from './source-projects.service';
import { sourceProjectDigest, sourceProjectSnapshot, type SourceProjectSnapshot } from './source-project';
import { sourceVisualState } from './source-visual-state';
import { CREDIT_MICRO_USD } from './source-generation-policy';

export const DESIGN_JOB_LEASE_MS = 60000;
export const DESIGN_JOB_CAPS: Record<string, number> = { REVIEW_BASELINE: 15, REPAIR: 85, COMPARE: 25 };
// PostgreSQL JSONB changes object-key order; hashes must survive persistence.
export const designDigest = (value: unknown) => {
  const stable = (v: any): any => Array.isArray(v) ? v.map(stable) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, stable(v[k])])) : v;
  return createHash('sha256').update(JSON.stringify(stable(JSON.parse(JSON.stringify(value))))).digest('hex');
};
export class DesignBudgetError extends BadRequestException {}
export type DesignJobInput = { requestId: string; revision: number; page: string; productId?: string; maxCredits: number; maxRepairs?: number };
export type DesignReceipt = { id: string; stage: string; repair: number; reservedMicroUsd: number; actualMicroUsd: number | null; status: 'pending' | 'completed' | 'unknown'; startedAt: string; finishedAt?: string };
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

/** Durable job state only; paid work is performed by a separately fenced worker. */
@Injectable()
export class SourceDesignJobsService {
  constructor(readonly prisma: PrismaService, private readonly projects: SourceProjectsService, private readonly config: ConfigService) {}
  enabled() { return this.config.get<boolean>('app.sourceDesignJobsEnabled') === true; }
  assertEnabled() { if (!this.enabled()) throw new ServiceUnavailableException('Las mejoras automáticas están desactivadas en esta instalación.'); }
  async contextDigest(storeId: string, db: Prisma.TransactionClient | PrismaService = this.prisma) {
    const [store, products, categories, brand, retention] = await Promise.all([
      db.store.findUniqueOrThrow({ where: { id: storeId }, select: { updatedAt: true } }),
      db.paymentLink.findMany({ where: { storeId }, orderBy: { id: 'asc' }, select: { id: true, updatedAt: true } }),
      db.category.findMany({ where: { storeId }, orderBy: { id: 'asc' }, select: { id: true, updatedAt: true } }),
      db.storeBrandProfile.findUnique({ where: { storeId }, select: { revision: true } }),
      db.storeRetention.findUnique({ where: { storeId }, select: { revision: true, updatedAt: true } }),
    ]);
    return designDigest({ store, products, categories, brand, retention });
  }
  private async owned(merchantId: string, storeId: string, id: string) {
    const job = await this.prisma.storeSourceDesignJob.findFirst({ where: { id, storeId, store: { merchantId } } });
    if (!job) throw new NotFoundException('Trabajo no encontrado.');
    return job;
  }
  summary(job: StoreSourceDesignJob) {
    const cp = job.checkpoints as any;
    return { id: job.id, requestId: job.requestId, revision: job.revision, page: (job.input as any).page, productId: (job.input as any).productId, status: job.status, stage: job.stage, maxCredits: job.maxCredits, reservedCredits: job.reservedMicroUsd / CREDIT_MICRO_USD, observedCredits: job.settledMicroUsd / CREDIT_MICRO_USD, repairs: job.repairs, maxRepairs: (job.input as any).maxRepairs, receipts: job.receipts, error: job.error, resultRevision: job.resultRevision, createdAt: job.createdAt, updatedAt: job.updatedAt, report: cp.comparison || cp.review || null, resumeAvailable: ['FAILED', 'INTERRUPTED'].includes(job.status) && job.reservedMicroUsd + (DESIGN_JOB_CAPS[job.stage] || 0) * CREDIT_MICRO_USD <= job.maxCredits * CREDIT_MICRO_USD && (job.receipts as unknown as DesignReceipt[]).filter(r => r.stage === job.stage && r.repair === job.repairs + Number(job.stage === 'REPAIR') && r.actualMicroUsd !== 0).length < 2 && (job.stage !== 'REPAIR' || job.repairs < (job.input as any).maxRepairs) };
  }
  async create(merchantId: string, storeId: string, input: DesignJobInput) {
    this.assertEnabled();
    const normalized = { requestId: input.requestId, revision: input.revision, page: input.page, ...(input.productId ? { productId: input.productId } : {}), maxCredits: input.maxCredits, maxRepairs: input.maxRepairs ?? 1 };
    if (!/^[0-9a-f-]{36}$/i.test(input.requestId) || !Number.isInteger(input.maxCredits) || input.maxCredits < 1 || input.maxCredits > 500 || ![1, 2].includes(normalized.maxRepairs)) throw new BadRequestException('Solicitud o límite inválido.');
    const current = await this.projects.current(merchantId, storeId);
    const requestDigest = designDigest(normalized);
    const existing = await this.prisma.storeSourceDesignJob.findUnique({ where: { storeId_requestId: { storeId, requestId: input.requestId } } });
    if (existing) { if (existing.requestDigest !== requestDigest) throw new ConflictException('Este identificador ya se usó para otra solicitud.'); return this.summary(existing); }
    if (!input.revision || current.revision !== input.revision) throw new ConflictException('Actualiza la revisión antes de mejorarla.');
    const version = await this.projects.version(merchantId, storeId, input.revision);
    const snapshot = sourceProjectSnapshot({ ...(version.snapshot as unknown as SourceProjectSnapshot), revision: version.revision, label: version.label });
    if (sourceProjectDigest(snapshot) !== version.digest) throw new ConflictException('No se pudo verificar la revisión.');
    try { sourceVisualState(snapshot, input.page, input.productId); } catch (error) { throw new BadRequestException(error instanceof Error ? error.message : 'Página inválida.'); }
    try {
      const job = await this.prisma.storeSourceDesignJob.create({ data: { storeId, availableAt: new Date(), requestId: input.requestId, requestDigest, activeStoreId: storeId, revision: input.revision, sourceDigest: version.digest, contextDigest: await this.contextDigest(storeId), maxCredits: input.maxCredits, input: json(normalized) } });
      return this.summary(job);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const same = await this.prisma.storeSourceDesignJob.findUnique({ where: { storeId_requestId: { storeId, requestId: input.requestId } } });
        if (same?.requestDigest === requestDigest) return this.summary(same);
        throw new ConflictException('Ya hay una mejora en curso para esta tienda.');
      }
      throw error;
    }
  }
  async get(merchantId: string, storeId: string, id: string) { return this.summary(await this.owned(merchantId, storeId, id)); }
  async latest(merchantId: string, storeId: string) {
    await this.projects.current(merchantId, storeId);
    const job = await this.prisma.storeSourceDesignJob.findFirst({ where: { storeId }, orderBy: { createdAt: 'desc' } });
    return { enabled: this.enabled(), job: job ? this.summary(job) : null };
  }
  async cancel(merchantId: string, storeId: string, id: string) {
    await this.owned(merchantId, storeId, id);
    await this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "StoreSourceDesignJob" WHERE id = ${id} FOR UPDATE`;
      const job = await tx.storeSourceDesignJob.findUniqueOrThrow({ where: { id } });
      const receipts = (job.receipts as unknown as DesignReceipt[]).map(r => r.status === 'pending' ? { ...r, status: 'unknown' as const, finishedAt: new Date().toISOString() } : r);
      await tx.storeSourceDesignJob.updateMany({ where: { id, status: { in: ['QUEUED', 'RUNNING', 'FAILED', 'INTERRUPTED'] } }, data: { cancelRequested: true, status: 'CANCELLED', activeStoreId: null, leaseToken: null, leaseUntil: null, receipts: json(receipts), error: 'Cancelado. La revisión publicada no cambió; una llamada ya enviada puede tener costo.' } });
    });
    return this.get(merchantId, storeId, id);
  }
  async resume(merchantId: string, storeId: string, id: string) {
    this.assertEnabled();
    const job = await this.owned(merchantId, storeId, id);
    if (!this.summary(job).resumeAvailable) throw new ConflictException('Este trabajo no se puede continuar dentro de su límite.');
    await this.assertFresh(job, merchantId);
    try {
      const changed = await this.prisma.storeSourceDesignJob.updateMany({ where: { id, status: job.status, updatedAt: job.updatedAt }, data: { status: 'QUEUED', activeStoreId: storeId, cancelRequested: false, leaseToken: null, leaseUntil: null, error: null } });
      if (!changed.count) throw new ConflictException('El trabajo cambió en otra sesión.');
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('Hay otra mejora en curso.');
      throw error;
    }
    return this.get(merchantId, storeId, id);
  }
  async assertFresh(job: StoreSourceDesignJob, merchantId: string) {
    const current = await this.projects.current(merchantId, job.storeId);
    if (current.revision !== job.revision || await this.contextDigest(job.storeId) !== job.contextDigest) throw new ConflictException('El sitio, catálogo o identidad cambió. Inicia una revisión del estado actual.');
  }
  /** Keep financial receipts, but expire large private evidence after 30 days. */
  async pruneEvidence() {
    const cutoff = new Date(Date.now() - 30 * 86400000);
    const stale = await this.prisma.storeSourceDesignJob.findMany({ where: { updatedAt: { lt: cutoff }, status: { notIn: ['QUEUED', 'RUNNING', 'EXPIRED'] }, artifacts: { some: {} } }, select: { id: true, status: true }, take: 10 });
    for (const job of stale) await this.prisma.$transaction(async tx => {
      const changed = await tx.storeSourceDesignJob.updateMany({ where: { id: job.id, status: job.status, updatedAt: { lt: cutoff } }, data: { ...(['FAILED', 'INTERRUPTED'].includes(job.status) ? { status: 'EXPIRED', error: 'La evidencia de esta mejora expiró después de 30 días. Inicia una nueva revisión.' } : {}), updatedAt: new Date() } });
      if (changed.count) await tx.storeSourceDesignArtifact.deleteMany({ where: { jobId: job.id } });
    });
  }
  async expire() {
    const jobs = await this.prisma.storeSourceDesignJob.findMany({ where: { status: 'RUNNING', leaseUntil: { lt: new Date() } }, take: 30 });
    for (const job of jobs) {
      const receipts = (job.receipts as unknown as DesignReceipt[]).map(r => r.status === 'pending' ? { ...r, status: 'unknown' as const, finishedAt: new Date().toISOString() } : r);
      const paid = Boolean(DESIGN_JOB_CAPS[job.stage]);
      await this.prisma.storeSourceDesignJob.updateMany({ where: { id: job.id, status: 'RUNNING', leaseToken: job.leaseToken, leaseUntil: { lt: new Date() } }, data: { status: paid ? 'INTERRUPTED' : 'QUEUED', activeStoreId: paid ? null : job.storeId, leaseToken: null, leaseUntil: null, receipts: json(receipts), error: paid ? 'La llamada se interrumpió. Su reserva se conserva; continuar puede iniciar otra llamada con costo.' : null } });
    }
  }
  async claim() {
    if (!this.enabled()) return null;
    const job = await this.prisma.storeSourceDesignJob.findFirst({ where: { status: 'QUEUED', cancelRequested: false, availableAt: { lte: new Date() } }, orderBy: [{ availableAt: 'asc' }, { createdAt: 'asc' }] });
    if (!job) return null;
    const leaseToken = randomUUID();
    const changed = await this.prisma.storeSourceDesignJob.updateMany({ where: { id: job.id, status: 'QUEUED', cancelRequested: false }, data: { status: 'RUNNING', leaseToken, leaseUntil: new Date(Date.now() + DESIGN_JOB_LEASE_MS) } });
    return changed.count ? this.prisma.storeSourceDesignJob.findUniqueOrThrow({ where: { id: job.id } }) : null;
  }
  fence(job: StoreSourceDesignJob) { return { id: job.id, status: 'RUNNING', leaseToken: job.leaseToken, cancelRequested: false, leaseUntil: { gt: new Date() } }; }
  async heartbeat(job: StoreSourceDesignJob) {
    if (!this.enabled()) return false;
    const result = await this.prisma.storeSourceDesignJob.updateMany({ where: this.fence(job), data: { leaseUntil: new Date(Date.now() + DESIGN_JOB_LEASE_MS) } });
    return result.count === 1;
  }
  async checkpoint(job: StoreSourceDesignJob, data: Prisma.StoreSourceDesignJobUpdateManyMutationInput) {
    const changed = await this.prisma.storeSourceDesignJob.updateMany({ where: this.fence(job), data });
    if (!changed.count) throw new ConflictException('El trabajo perdió su turno o fue cancelado.');
  }
  async stageResult(job: StoreSourceDesignJob, data: Prisma.StoreSourceDesignJobUpdateManyMutationInput, artifacts: Record<string, unknown> = {}) {
    await this.prisma.$transaction(async tx => {
      const changed = await tx.storeSourceDesignJob.updateMany({ where: this.fence(job), data });
      if (!changed.count) throw new ConflictException('El trabajo perdió su turno o fue cancelado.');
      for (const [key, value] of Object.entries(artifacts)) {
        const digest = designDigest(value);
        await tx.storeSourceDesignArtifact.upsert({ where: { jobId_key: { jobId: job.id, key } }, create: { jobId: job.id, key, digest, data: json(value) }, update: { digest, data: json(value) } });
      }
    });
  }
  async artifact<T>(jobId: string, key: string): Promise<T> {
    const artifact = await this.prisma.storeSourceDesignArtifact.findUniqueOrThrow({ where: { jobId_key: { jobId, key } } });
    if (designDigest(artifact.data) !== artifact.digest) throw new ConflictException('No se pudo verificar la evidencia guardada.');
    return artifact.data as T;
  }
  async reserve(job: StoreSourceDesignJob) {
    const cap = DESIGN_JOB_CAPS[job.stage]; if (!cap) return;
    const repairs = job.repairs + Number(job.stage === 'REPAIR');
    if (repairs > (job.input as any).maxRepairs) throw new DesignBudgetError('Se alcanzó el máximo de reparaciones.');
    const receipts = job.receipts as unknown as DesignReceipt[];
    if (receipts.filter(r => r.stage === job.stage && r.repair === repairs && r.actualMicroUsd !== 0).length >= 2) throw new DesignBudgetError('Se alcanzó el máximo de intentos para esta etapa.');
    const reserved = cap * CREDIT_MICRO_USD;
    if (job.reservedMicroUsd + reserved > job.maxCredits * CREDIT_MICRO_USD) throw new DesignBudgetError('El presupuesto restante no alcanza para la siguiente etapa.');
    const receipt: DesignReceipt = { id: randomUUID(), stage: job.stage, repair: repairs, reservedMicroUsd: reserved, actualMicroUsd: null, status: 'pending', startedAt: new Date().toISOString() };
    await this.checkpoint(job, { reservedMicroUsd: { increment: reserved }, receipts: json([...receipts, receipt]) });
    job.reservedMicroUsd += reserved; job.receipts = JSON.parse(JSON.stringify([...receipts, receipt]));
  }
  settlement(job: StoreSourceDesignJob, actual: number | null) {
    const receipts = structuredClone(job.receipts) as unknown as DesignReceipt[];
    const pending = [...receipts].reverse().find(r => r.status === 'pending');
    if (!pending) return {};
    pending.status = actual === null ? 'unknown' : 'completed'; pending.actualMicroUsd = actual; pending.finishedAt = new Date().toISOString();
    return { receipts: json(receipts), ...(actual === null ? {} : { reservedMicroUsd: job.reservedMicroUsd - pending.reservedMicroUsd + actual, settledMicroUsd: job.settledMicroUsd + actual }) };
  }
}
