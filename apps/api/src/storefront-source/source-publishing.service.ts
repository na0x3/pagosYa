import { boundedSourceFindings, requireSourceChecks, sourceRuntimeDigest, SourceCheckResultDto } from './source-check-results';
import { isPublicStore, PUBLIC_STORE_WHERE } from '../stores/active-store';
import { assertSourceCommerceContract } from './source-commerce-contract';
import { currentSourceRuntime, currentSourceRuntimeBundle, withSourceRuntime, type SourceRuntimeFiles, type TrustedSourceRuntimeBundle } from './source-runtime';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes, randomInt } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { sourceProjectDigest, sourceProjectSnapshot, type SourceProjectSnapshot } from './source-project';
import { sourceMotionMode, withSourceMotion } from './source-motion';

const PUBLIC_ASSET = /\.(png|jpe?g|webp|gif|avif|mp4|woff2?|ttf)$/i;
const ASSET_TYPES: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif', mp4: 'video/mp4', woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf' };
/** Published revisions are immutable, so their decoded media can be cached by store and revision. */
const ASSET_CACHE_REVISIONS = 12;

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
  const store = await prisma.store.findUniqueOrThrow({ where: { id: storeId }, select: { contactFormEnabled: true, publicVisibility: true, sourcePublicationPaused: true, publishedSourceRevision: true, publishedRuntimeDigest: true, sourcePublicationVersion: true, sourcePublishedAt: true, status: true, slug: true, checkoutMode: true, merchant: { select: { status: true } } } });
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
  return { contactFormEnabled: store.contactFormEnabled, payments: store.checkoutMode === 'payment' ? store.merchant.status === 'ACTIVE' ? 'live' : 'test' : 'contact', revision: store.publishedSourceRevision, runtimeDigest: store.publishedRuntimeDigest, version: store.sourcePublicationVersion, publishedAt: store.sourcePublishedAt, active: isPublicStore(store), slug: store.slug, experiment: test };
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
  async recordChecks(merchantId: string, storeId: string, revision: number, body: SourceCheckResultDto) {
    await this.owner(merchantId, storeId);
    if (!Number.isInteger(revision) || revision < 1 || revision > 2147483647) throw new BadRequestException('La revisión debe ser un entero positivo.');
    if (typeof body.passed !== 'boolean') throw new BadRequestException('El resultado debe indicar si la comprobación pasó.');
    const findings = boundedSourceFindings(body.findings) as Prisma.InputJsonArray;
    const snapshot = await this.snapshot(storeId, revision);
    return this.prisma.sourceCheckResult.create({ data: {
      storeId, revision, snapshotDigest: sourceProjectDigest(snapshot), runtimeDigest: await sourceRuntimeDigest(), passed: body.passed, findings,
    } });
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
  /** Records the trusted runtime a publication went live with. Stores keep following the latest kit, so
   * platform fixes reach every published store; the record makes an explicit rollback possible. */
  private async recordRuntime(tx: Prisma.TransactionClient, storeId: string, bundle: TrustedSourceRuntimeBundle) {
    // Immutable content is deduplicated globally; each store publication remains auditable.
    await tx.sourceRuntimeBundle.upsert({ where: { digest: bundle.digest }, create: { digest: bundle.digest, files: bundle.files }, update: {} });
    await tx.storeRuntimePublication.create({ data: { storeId, digest: bundle.digest, publishedAt: new Date() } });
  }
  /** Pin a runtime this store has published before, or pass null to follow the latest kit again. */
  async rollbackRuntime(merchantId: string, storeId: string, digest: string | null, expectedVersion: number) {
    return this.change(merchantId, storeId, expectedVersion, async tx => {
      if (digest !== null && !(await tx.storeRuntimePublication.findFirst({ where: { storeId, digest } }))) throw new NotFoundException('Este runtime no pertenece al historial de publicaciones de la tienda.');
      await tx.store.update({ where: { id: storeId }, data: { publishedRuntimeDigest: digest } });
    });
  }
  async publish(merchantId: string, storeId: string, revision: number, expected: number) {
    const store = await this.owner(merchantId, storeId);
    if (store.status !== 'ACTIVE') throw new BadRequestException('Activa la tienda antes de publicar este diseño.');
    const snapshot = await this.snapshot(storeId, revision);
    assertSourceCommerceContract(snapshot);
    const runtime = await currentSourceRuntimeBundle();
    await requireSourceChecks(this.prisma, storeId, revision, snapshot, runtime.digest);
    return this.change(merchantId, storeId, expected, async tx => {
      if (await tx.storeSourceExperiment.findUnique({ where: { activeStoreId: storeId } })) throw new ConflictException('Detén la prueba antes de publicar otro diseño.');
      await this.recordRuntime(tx, storeId, runtime);
      // A new publication was checked against the latest kit, so it clears any earlier rollback pin.
      await tx.store.update({ where: { id: storeId }, data: { publicVisibility: true, sourcePublicationPaused: false, publishedSourceRevision: revision, publishedRuntimeDigest: null, sourcePublishedAt: new Date() } });
    });
  }
  async visibility(merchantId: string, storeId: string, published: boolean, expected: number) {
    if (published) { const store = await this.owner(merchantId, storeId); if (store.publishedSourceRevision) assertSourceCommerceContract(await this.snapshot(storeId, store.publishedSourceRevision)); }
    return this.change(merchantId, storeId, expected, async tx => {
      const store = await tx.store.findUniqueOrThrow({ where: { id: storeId } });
      if (!store.publishedSourceRevision) throw new BadRequestException('Publica un diseño antes de cambiar su visibilidad.');
      if (published && store.status !== 'ACTIVE') throw new BadRequestException('Activa tu tienda desde el panel antes de publicarla.');
      if (!published) await tx.storeSourceExperiment.updateMany({ where: { storeId, status: 'RUNNING' }, data: { status: 'STOPPED', activeStoreId: null, endedAt: new Date() } });
      await tx.store.update({ where: { id: storeId }, data: { sourcePublicationPaused: !published, ...(published ? { publicVisibility: true } : {}) } });
    });
  }
  async start(merchantId: string, storeId: string, revision: number, expected: number) {
    const store = await this.owner(merchantId, storeId);
    if (!isPublicStore(store) || !store.publishedSourceRevision) throw new BadRequestException('Publica tu diseño y activa la tienda antes de iniciar una prueba.');
    if (store.checkoutMode !== 'payment') throw new BadRequestException('Activa los pagos integrados para comparar compras confirmadas.');
    const [a, b] = await Promise.all([this.snapshot(storeId, store.publishedSourceRevision), this.snapshot(storeId, revision)]);
    assertSourceCommerceContract(a); assertSourceCommerceContract(b);
    const authored = (s: SourceProjectSnapshot) => JSON.stringify(s.files.filter(f => /\.(html|css|js)$/.test(f.path) && !['config.js', 'commerce.js'].includes(f.path)).sort((x,y)=>x.path.localeCompare(y.path)));
    if (store.publishedSourceRevision === revision || authored(a) === authored(b)) throw new BadRequestException('Elige una alternativa con un cambio de diseño para comparar.');
    const runtime = await currentSourceRuntimeBundle();
    await requireSourceChecks(this.prisma, storeId, revision, b, runtime.digest);
    return this.change(merchantId, storeId, expected, async tx => {
      await this.recordRuntime(tx, storeId, runtime);
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
      if (apply) {
        await tx.store.update({ where: { id: storeId }, data: { publishedSourceRevision: winner === 'A' ? state.experiment.controlRevision : state.experiment.variantRevision, sourcePublishedAt: new Date() } });
      }
    });
  }
  async publicSite(slug: string, visitorId?: string) {
    const store = await this.prisma.store.findFirst({ where: { slug, ...PUBLIC_STORE_WHERE }, select: { id: true, publishedSourceRevision: true, publishedRuntimeDigest: true } });
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
    // Hosted publications keep their trusted kit even after a deployment; previews use the current kit.
    const runtime = store.publishedRuntimeDigest
      ? await this.prisma.sourceRuntimeBundle.findUniqueOrThrow({ where: { digest: store.publishedRuntimeDigest } })
      : null;
    const { files } = runtime
      ? await withSourceRuntime(snapshot, { digest: runtime.digest, files: runtime.files as SourceRuntimeFiles })
      : await currentSourceRuntime(snapshot);
    // Export tooling is private. Only the selected public revision's browser assets leave the API.
    const assetPath = `/stores/public/${encodeURIComponent(slug)}/source-site/assets/${await this.assetVersion(store.id, revision)}/`;
    const publicFiles = files
      .filter(f => /\.(html|css|js|png|jpe?g|webp|gif|avif|mp4|woff2?|ttf)$/i.test(f.path) && !['server.mjs', 'build.mjs'].includes(f.path))
      // Binary media is served by publicAsset; the site JSON only names it.
      .map(f => f.encoding === 'base64' && PUBLIC_ASSET.test(f.path) ? { path: f.path, encoding: 'url' as const, content: '' } : f);
    return { published: true, revision, visitToken, analyticsAvailable: true, assetPath, snapshot: { ...snapshot, brief: {}, files: publicFiles } };
  }

  private readonly assetCache = new Map<string, Map<string, Buffer>>();

  /** Revisions a visitor can already see: the published one and a running experiment's arms. */
  private async servableRevisions(storeId: string, published: number): Promise<number[]> {
    const experiment = await this.prisma.storeSourceExperiment.findUnique({ where: { activeStoreId: storeId } });
    return [published, ...(experiment ? [experiment.controlRevision, experiment.variantRevision] : [])];
  }

  private async assetVersion(storeId: string, revision: number): Promise<string> {
    const version = await this.prisma.storeSourceVersion.findUnique({ where: { storeId_revision: { storeId, revision } }, select: { digest: true } });
    if (!version) throw new NotFoundException('Revisión no encontrada');
    return `${revision}-${version.digest.slice(0, 12)}`;
  }

  async publicAsset(slug: string, version: string, path: string): Promise<{ bytes: Buffer; contentType: string; etag: string }> {
    const missing = () => new NotFoundException('Archivo no encontrado');
    const match = /^(\d+)-([a-f0-9]{12})$/.exec(version);
    if (!match || !PUBLIC_ASSET.test(path) || path.split('/').some(part => !part || part === '.' || part === '..')) throw missing();
    const revision = Number(match[1]);
    const store = await this.prisma.store.findFirst({ where: { slug, ...PUBLIC_STORE_WHERE }, select: { id: true, publishedSourceRevision: true } });
    if (!store?.publishedSourceRevision || !(await this.servableRevisions(store.id, store.publishedSourceRevision)).includes(revision)) throw missing();
    // The digest pins the URL to this store's exact revision, so a reused slug never inherits cached media.
    if (await this.assetVersion(store.id, revision) !== version) throw missing();
    const key = `${store.id}:${revision}`;
    let files = this.assetCache.get(key);
    if (!files) {
      const snapshot = await this.snapshot(store.id, revision);
      files = new Map(snapshot.files.filter(f => f.encoding === 'base64' && PUBLIC_ASSET.test(f.path)).map(f => [f.path, Buffer.from(f.content, 'base64')]));
      this.assetCache.set(key, files);
      while (this.assetCache.size > ASSET_CACHE_REVISIONS) this.assetCache.delete(this.assetCache.keys().next().value!);
    }
    const bytes = files.get(path);
    if (!bytes) throw missing();
    return { bytes, contentType: ASSET_TYPES[path.split('.').pop()!.toLowerCase()], etag: `"${createHash('sha1').update(bytes).digest('base64url')}"` };
  }
}
