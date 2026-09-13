import { assertSourceCommerceContract } from './source-commerce-contract';
import { currentSourceRuntime } from './source-runtime';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes, randomInt } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { sourceProjectDigest, sourceProjectSnapshot, type SourceProjectSnapshot } from './source-project';
import { sourceMotionMode, withSourceMotion } from './source-motion';

export function experimentEvidence(a: { visitors: number; buyers: number }, b: { visitors: number; buyers: number }, startedAt: Date, now = new Date(), truncated = false) {
  const interval = (n: number, x: number) => {
    const z = 1.96, p = x / n, d = 1 + z * z / n;
    const mid = (p + z * z / (2 * n)) / d;
    const half = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d;
    return [mid - half, mid + half];
  };
  if (truncated) return { winner: null, reason: 'El volumen supera el límite de este informe. No se recomienda un ganador.' };
  if (now.getTime() - startedAt.getTime() < 7 * 86400000 || Math.min(a.visitors, b.visitors) < 200 || Math.min(a.buyers, b.buyers) < 20) return { winner: null, reason: 'Recopilando datos: al menos 7 días, 200 visitantes y 20 compradores por versión.' };
  const ai = interval(a.visitors, a.buyers), bi = interval(b.visitors, b.buyers);
  const winner = ai[0] > bi[1] ? 'A' : bi[0] > ai[1] ? 'B' : null;
  return { winner, reason: winner ? 'Ventaja observada con intervalos de conversión del 95% separados. Revisa los resultados antes de aplicar.' : 'Todavía no hay una diferencia clara entre las versiones.' };
}

export async function publicationState(prisma: PrismaService, storeId: string) {
  const store = await prisma.store.findUniqueOrThrow({ where: { id: storeId }, select: { contactFormEnabled: true, sourcePublicationPaused: true, publishedSourceRevision: true, sourcePublicationVersion: true, sourcePublishedAt: true, status: true, slug: true, checkoutMode: true, merchant: { select: { status: true } } } });
  const experiment = await prisma.storeSourceExperiment.findFirst({ where: { storeId, status: 'RUNNING' } }) || await prisma.storeSourceExperiment.findFirst({ where: { storeId }, orderBy: [{ endedAt: { sort: 'desc', nulls: 'last' } }, { startedAt: 'desc' }] });
  let test: any = null;
  if (experiment) {
    const [visits, orders] = await Promise.all([
      prisma.storeSourceVisit.groupBy({ by: ['variant'], where: { experimentId: experiment.id }, _count: true }),
      prisma.storeOrder.findMany({ where: { storeId, sourceVisit: { experimentId: experiment.id }, paymentIntent: { livemode: true, status: 'SUCCEEDED' } }, take: 10001,
        select: { sourceVisitId: true, sourceVisit: { select: { variant: true } }, amount: true, currency: true, paymentIntent: { select: { transactions: { where: { type: 'REFUND', status: 'SUCCEEDED' }, select: { amount: true } } } } } }),
    ]);
    const variants = ['A', 'B'].map(variant => {
      const buyers = new Set<string>(); const revenue = new Map<string, number>(); let paidOrders = 0;
      for (const order of orders.slice(0, 10000)) {
        if (order.sourceVisit?.variant !== variant) continue;
        const net = Math.max(0, order.amount - order.paymentIntent.transactions.reduce((sum, t) => sum + t.amount, 0));
        if (!net) continue;
        buyers.add(order.sourceVisitId!); paidOrders++;
        revenue.set(order.currency, (revenue.get(order.currency) || 0) + net);
      }
      const visitors = visits.find(v => v.variant === variant)?._count || 0;
      return { variant, revision: variant === 'A' ? experiment.controlRevision : experiment.variantRevision, visitors, buyers: buyers.size, paidOrders, conversionRate: visitors ? buyers.size / visitors : 0, revenue: [...revenue].map(([currency, amount]) => ({ currency, amount })) };
    });
    test = { ...experiment, activeStoreId: undefined, variants, evidence: experimentEvidence(variants[0], variants[1], experiment.startedAt, new Date(), orders.length > 10000), truncated: orders.length > 10000 };
  }
  return { contactFormEnabled: store.contactFormEnabled, payments: store.checkoutMode === 'payment' ? store.merchant.status === 'ACTIVE' ? 'live' : 'test' : 'contact', revision: store.publishedSourceRevision, version: store.sourcePublicationVersion, publishedAt: store.sourcePublishedAt, active: store.status === 'ACTIVE' && !store.sourcePublicationPaused, slug: store.slug, experiment: test };
}

@Injectable()
export class SourcePublishingService {
  constructor(private readonly prisma: PrismaService) {}
  async owner(merchantId: string, storeId: string) {
    const store = await this.prisma.store.findFirst({ where: { id: storeId, merchantId } });
    if (!store) throw new NotFoundException('Tienda no encontrada');
    return store;
  }
  async snapshot(storeId: string, revision: number) {
    const version = await this.prisma.storeSourceVersion.findUnique({ where: { storeId_revision: { storeId, revision } } });
    if (!version) throw new NotFoundException('Revisión no encontrada');
    const stored = version.snapshot as unknown as SourceProjectSnapshot;
    const snapshot = sourceProjectSnapshot({ ...stored, revision, label: version.label });
    if (sourceProjectDigest(snapshot) !== version.digest) throw new ConflictException('No se pudo verificar esta revisión.');
    if (!snapshot.files.some(f => f.path === 'index.html') || !snapshot.files.some(f => f.path === 'config.js')) throw new BadRequestException('Esta revisión necesita una página inicial y configuración de comercio.');
    await withSourceMotion(snapshot.files, sourceMotionMode(snapshot.files));
    return snapshot;
  }
  async change(merchantId: string, storeId: string, expected: number, operation: (tx: Prisma.TransactionClient) => Promise<void>) {
    await this.owner(merchantId, storeId);
    try {
      await this.prisma.$transaction(async tx => {
        // A shared lock serializes publish/start/stop/promote across sessions.
        const changed = await tx.store.updateMany({ where: { id: storeId, merchantId, sourcePublicationVersion: expected }, data: { sourcePublicationVersion: { increment: 1 } } });
        if (!changed.count) throw new ConflictException('La publicación cambió en otra sesión. Actualiza antes de continuar.');
        await operation(tx);
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2034'].includes(error.code)) throw new ConflictException('La prueba cambió en otra sesión. Actualiza antes de continuar.');
      throw error;
    }
    return publicationState(this.prisma, storeId);
  }
  async publish(merchantId: string, storeId: string, revision: number, expected: number) {
    const store = await this.owner(merchantId, storeId);
    if (store.status !== 'ACTIVE') throw new BadRequestException('Activa la tienda antes de publicar este diseño.');
    assertSourceCommerceContract(await this.snapshot(storeId, revision));
    return this.change(merchantId, storeId, expected, async tx => {
      if (await tx.storeSourceExperiment.findUnique({ where: { activeStoreId: storeId } })) throw new ConflictException('Detén la prueba antes de publicar otro diseño.');
      await tx.store.update({ where: { id: storeId }, data: { sourcePublicationPaused: false, publishedSourceRevision: revision, sourcePublishedAt: new Date() } });
    });
  }
  async visibility(merchantId: string, storeId: string, published: boolean, expected: number) {
    if (published) { const store = await this.owner(merchantId, storeId); if (store.publishedSourceRevision) assertSourceCommerceContract(await this.snapshot(storeId, store.publishedSourceRevision)); }
    return this.change(merchantId, storeId, expected, async tx => {
      const store = await tx.store.findUniqueOrThrow({ where: { id: storeId } });
      if (!store.publishedSourceRevision) throw new BadRequestException('Publica un diseño antes de cambiar su visibilidad.');
      if (published && store.status !== 'ACTIVE') throw new BadRequestException('Activa tu tienda desde el panel antes de publicarla.');
      if (!published) await tx.storeSourceExperiment.updateMany({ where: { storeId, status: 'RUNNING' }, data: { status: 'STOPPED', activeStoreId: null, endedAt: new Date() } });
      await tx.store.update({ where: { id: storeId }, data: { sourcePublicationPaused: !published } });
    });
  }
  async start(merchantId: string, storeId: string, revision: number, expected: number) {
    const store = await this.owner(merchantId, storeId);
    if (store.status !== 'ACTIVE' || store.sourcePublicationPaused || !store.publishedSourceRevision) throw new BadRequestException('Publica tu diseño y activa la tienda antes de iniciar una prueba.');
    if (store.checkoutMode !== 'payment') throw new BadRequestException('Activa los pagos integrados para comparar compras confirmadas.');
    const [a, b] = await Promise.all([this.snapshot(storeId, store.publishedSourceRevision), this.snapshot(storeId, revision)]);
    assertSourceCommerceContract(a); assertSourceCommerceContract(b);
    const authored = (s: SourceProjectSnapshot) => JSON.stringify(s.files.filter(f => /\.(html|css|js)$/.test(f.path) && !['config.js', 'commerce.js'].includes(f.path)).sort((x,y)=>x.path.localeCompare(y.path)));
    if (store.publishedSourceRevision === revision || authored(a) === authored(b)) throw new BadRequestException('Elige una alternativa con un cambio de diseño para comparar.');
    return this.change(merchantId, storeId, expected, async tx => {
      await tx.storeSourceExperiment.create({ data: { storeId, activeStoreId: storeId, controlRevision: store.publishedSourceRevision!, variantRevision: revision } });
    });
  }
  async finish(merchantId: string, storeId: string, expected: number, experimentId: string, apply: boolean) {
    await this.owner(merchantId, storeId);
    const state = await publicationState(this.prisma, storeId);
    if (!state.experiment || state.experiment.id !== experimentId || state.experiment.status !== 'RUNNING') throw new ConflictException('Esta prueba ya no está activa.');
    const winner = apply ? state.experiment.evidence.winner : null;
    if (apply && !winner) throw new BadRequestException('Todavía no hay evidencia suficiente para aplicar un ganador.');
    return this.change(merchantId, storeId, expected, async tx => {
      const ended = await tx.storeSourceExperiment.updateMany({ where: { id: experimentId, storeId, status: 'RUNNING' }, data: { status: apply ? 'COMPLETED' : 'STOPPED', activeStoreId: null, winner, endedAt: new Date() } });
      if (!ended.count) throw new ConflictException('Esta prueba ya terminó.');
      if (apply) await tx.store.update({ where: { id: storeId }, data: { publishedSourceRevision: winner === 'A' ? state.experiment.controlRevision : state.experiment.variantRevision, sourcePublishedAt: new Date() } });
    });
  }
  async publicSite(slug: string, visitorId?: string) {
    const store = await this.prisma.store.findFirst({ where: { slug, status: 'ACTIVE', sourcePublicationPaused: false }, select: { id: true, publishedSourceRevision: true } });
    if (!store) throw new NotFoundException('Tienda no encontrada');
    if (!store.publishedSourceRevision) return { published: false };
    let revision = store.publishedSourceRevision, visitToken: string | null = null;
    const experiment = await this.prisma.storeSourceExperiment.findUnique({ where: { activeStoreId: store.id } });
    // Missing visitor id is an untracked view of the control (merchant preview).
    if (experiment && visitorId) {
      const visitorHash = createHash('sha256').update(visitorId).digest('hex');
      const key = { experimentId_visitorHash: { experimentId: experiment.id, visitorHash } };
      let visit;
      try {
        visit = await this.prisma.storeSourceVisit.upsert({ where: key, update: {}, create: { experimentId: experiment.id, visitorHash, token: randomBytes(24).toString('base64url'), variant: randomInt(2) ? 'B' : 'A' } });
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
        visit = await this.prisma.storeSourceVisit.findUniqueOrThrow({ where: key });
      }
      revision = visit.variant === 'B' ? experiment.variantRevision : experiment.controlRevision; visitToken = visit.token;
    }
    const snapshot = await this.snapshot(store.id, revision);
    // Always use the trusted current commerce runtime; authored scripts stay isolated.
    const { files } = await currentSourceRuntime(snapshot);
    // Export tooling is private. Only the selected public revision's browser assets leave the API.
    return { published: true, revision, visitToken, analyticsAvailable: true, snapshot: { ...snapshot, brief: {}, files: files.filter(f => /\.(html|css|js|png|jpe?g|webp|gif|avif|woff2?|ttf)$/i.test(f.path) && !['server.mjs', 'build.mjs'].includes(f.path)) } };
  }
}
