import { sellingForVisitor, stopSellingTest } from '../selling/selling-store';
import { PlansService } from '../plans/plans.service';
import { boundedSourceFindings, requireSourceChecks, sourceRuntimeDigest, SourceCheckResultDto } from './source-check-results';
import { assumedFactsBlockMessage, assumedFactsCheckRow } from './assumed-facts';
import { pendingAssumptions, readVoice } from './store-voice';
import { isPublicStore, PUBLIC_STORE_WHERE } from '../stores/active-store';
import { assertSourceCommerceContract } from './source-commerce-contract';
import { currentSourceRuntime, currentSourceRuntimeBundle, withSourceRuntime, type SourceRuntimeFiles, type TrustedSourceRuntimeBundle } from './source-runtime';
import { BadRequestException, ConflictException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { createHash, randomBytes, randomInt } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { sourceProjectDigest, sourceProjectSnapshot, type SourceProjectSnapshot } from './source-project';
import { sourceMotionMode, withSourceMotion } from './source-motion';
import { withSeededDna } from './source-dna';
import { isSourceMotifFile } from './source-motifs';
import { isKitCreativeFile } from './source-creative-assets';
import { sanitizeMotifSvg } from './source-svg-sanitize';
import { popupWordsFor, signupEvidence, staleTest } from './source-ab';
import { readPopupLook, type PopupLookId } from '../store-popups/popup-looks';

const PUBLIC_ASSET = /\.(png|jpe?g|webp|gif|avif|mp4|woff2?|ttf)$/i;
/** Lucide line icons the asset library bundles (assets/icons/NAME.svg). */
const ICON_PATH = /^assets\/icons\/[a-z0-9-]{2,40}\.svg$/;
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

/** The design draws its own signup (a boceto newsletter block, a YAPI footer form): a real element carrying
 * data-pagosya-subscribe-open. A selector string such as "[data-pagosya-subscribe-open]" does not count. */
const SIGNUP_OPENER = /data-pagosya-subscribe-open(?=[\s>=/"'{])/;
const RUNTIME_FILES = new Set(['config.js', 'commerce.js', 'retention.js']);
const drawsSignup = (snapshot: SourceProjectSnapshot) =>
  snapshot.files.some(f => f.encoding === 'utf8' && !RUNTIME_FILES.has(f.path) && SIGNUP_OPENER.test(f.content));

/** The runtime hides a drawn signup until subscriptions are on, so a published design would show shoppers
 * nothing. Turn them on for a store that never chose; a merchant who switched them off keeps that choice. */
async function enableDrawnSignup(tx: Prisma.TransactionClient, storeId: string) {
  const row = await tx.storeRetention.findUnique({ where: { storeId } });
  if (!row) { await tx.storeRetention.createMany({ data: [{ storeId, settings: { signupEnabled: true } }], skipDuplicates: true }); return; }
  const settings = (row.settings ?? {}) as Prisma.JsonObject;
  if ('signupEnabled' in settings) return;
  // Losing a race with a settings save only skips the default; the merchant's save wins.
  await tx.storeRetention.updateMany({ where: { storeId, revision: row.revision }, data: { settings: { ...settings, signupEnabled: true }, revision: { increment: 1 } } });
}

export async function publicationState(prisma: PrismaService, storeId: string) {
  const store = await prisma.store.findUniqueOrThrow({ where: { id: storeId }, select: { contactFormEnabled: true, publicVisibility: true, sourcePublicationPaused: true, publishedSourceRevision: true, publishedRuntimeDigest: true, sourcePublicationVersion: true, sourcePublishedAt: true, status: true, slug: true, checkoutMode: true, merchant: { select: { status: true } } } });
  const experiment = await prisma.storeSourceExperiment.findFirst({ where: { storeId, status: 'RUNNING' } }) || await prisma.storeSourceExperiment.findFirst({ where: { storeId }, orderBy: [{ endedAt: { sort: 'desc', nulls: 'last' } }, { startedAt: 'desc' }] });
  let test: any = null;
  if (experiment) {
    const [visits, orders, signups] = await Promise.all([
      prisma.storeSourceVisit.groupBy({ by: ['variant'], where: { experimentId: experiment.id }, _count: true }),
      prisma.storeOrder.findMany({ where: { storeId, sourceVisit: { experimentId: experiment.id }, paymentIntent: { livemode: true, status: 'SUCCEEDED' } }, take: 10001,
        select: { sourceVisitId: true, sourceVisit: { select: { variant: true } }, amount: true, currency: true, paymentIntent: { select: { transactions: { where: { type: 'REFUND', status: 'SUCCEEDED' }, select: { amount: true } } } } } }),
      // Spec 2026-11-09 A/B tests: a new popup signup carries the visit it came from (set only while a test runs).
      experiment.kind === 'popup' ? prisma.storeNewsletterSubscriber.findMany({ where: { storeId, sourceVisit: { experimentId: experiment.id } }, take: 20001, select: { sourceVisit: { select: { variant: true } } } }) : Promise.resolve([] as Array<{ sourceVisit: { variant: string } | null }>),
    ]);
    // Review I4 (rasca y elige 2026-11-10): popup signups by WhatsApp count too.
    const whatsappSignups: Array<{ variant: string; n: number }> = experiment.kind === 'popup' && typeof prisma.$queryRaw === 'function'
      ? await (prisma.$queryRaw`SELECT v."variant" AS variant, COUNT(*)::int AS n FROM "StoreWhatsappSubscriber" w JOIN "StoreSourceVisit" v ON v."id" = w."sourceVisitId" WHERE w."storeId" = ${storeId} AND v."experimentId" = ${experiment.id} GROUP BY v."variant"` as Promise<Array<{ variant: string; n: number }>>).catch(() => [])
      : [];
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
      const signed = signups.filter(row => row.sourceVisit?.variant === variant).length + Number(whatsappSignups.find(row => row.variant === variant)?.n ?? 0);
      return { variant, revision: variant === 'A' ? experiment.controlRevision : experiment.variantRevision, visitors, buyers: buyers.size, signups: signed, paidOrders, conversionRate: visitors ? buyers.size / visitors : 0, revenue: [...revenue].map(([currency, amount]) => ({ currency, amount })) };
    });
    // A popup test is judged on signups; a design test on purchases (spec 2026-11-09 §2).
    const evidence = experiment.kind === 'popup' ? signupEvidence(variants[0], variants[1], experiment.startedAt) : experimentEvidence(variants[0], variants[1], experiment.startedAt, new Date(), orders.length > 10000);
    const days = Math.max(0, Math.floor((Date.now() - new Date(experiment.startedAt).getTime()) / 86400000));
    test = { ...experiment, activeStoreId: undefined, variants, evidence, truncated: orders.length > 10000, days, stale: experiment.status === 'RUNNING' && !evidence.winner && staleTest(new Date(experiment.startedAt), experiment.extendedUntil ? new Date(experiment.extendedUntil) : null) };
  }
  return { contactFormEnabled: store.contactFormEnabled, payments: store.checkoutMode === 'payment' ? store.merchant.status === 'ACTIVE' ? 'live' : 'test' : 'contact', revision: store.publishedSourceRevision, runtimeDigest: store.publishedRuntimeDigest, version: store.sourcePublicationVersion, publishedAt: store.sourcePublishedAt, active: isPublicStore(store), slug: store.slug, experiment: test };
}

/** The publish refusal while listing prices wait for the merchant (spec 2026-10-18 product link store, decision 7). */
export function priceToConfirmMessage(names: string[]): string {
  const one = names.length === 1;
  return `Antes de publicar, confirma ${one ? 'el precio' : 'los precios'} de ${names.map(name => `«${name}»`).join(', ')}: YAPI ${one ? 'lo tomó del anuncio' : 'los tomó de los anuncios'}. ${one ? 'Edítalo' : 'Edítalos'} en Productos.`;
}

@Injectable()
export class SourcePublishingService {
  constructor(private readonly prisma: PrismaService, @Optional() private readonly plans?: PlansService) {}
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

  /** Spec 2026-10-14 store voice: a revision whose sheet lists a fact YAPI assumed and the merchant has not confirmed, corrected
   *  or removed cannot go live. The message lists the facts; the Studio shows the three actions beside them. */
  private assertNoPendingAssumptions(snapshot: SourceProjectSnapshot) {
    const pending = pendingAssumptions(readVoice(snapshot.files));
    if (pending.length) throw new ConflictException(assumedFactsBlockMessage(pending));
  }
  /** Spec 2026-10-18 product link store: a price YAPI took from a shop listing never goes live unconfirmed. */
  private async assertNoPriceToConfirm(storeId: string) {
    let waiting: Array<{ name: string }> = [];
    // Before the column's migration is applied no product can carry the mark, so a failed read blocks nothing.
    try { waiting = await this.prisma.paymentLink.findMany({ where: { storeId, status: 'ACTIVE', priceToConfirm: true }, select: { name: true }, orderBy: { createdAt: 'asc' }, take: 5 }); } catch { waiting = []; }
    if (waiting.length) throw new ConflictException(priceToConfirmMessage(waiting.map(product => product.name)));
  }
  async recordChecks(merchantId: string, storeId: string, revision: number, body: SourceCheckResultDto) {
    await this.owner(merchantId, storeId);
    if (!Number.isInteger(revision) || revision < 1 || revision > 2147483647) throw new BadRequestException('La revisión debe ser un entero positivo.');
    if (typeof body.passed !== 'boolean') throw new BadRequestException('El resultado debe indicar si la comprobación pasó.');
    const findings = boundedSourceFindings(body.findings) as Prisma.InputJsonArray;
    const snapshot = await this.snapshot(storeId, revision);
    // Spec 2026-10-14 store voice: while a fact YAPI assumed waits for the merchant, the check is recorded as failed with the facts
    // listed. It is still recorded: only publishing waits, never the checks, drafts or previews.
    const pending = pendingAssumptions(readVoice(snapshot.files));
    return this.prisma.sourceCheckResult.create({ data: {
      storeId, revision, snapshotDigest: sourceProjectDigest(snapshot), runtimeDigest: await sourceRuntimeDigest(), passed: body.passed && !pending.length,
      findings: (pending.length ? [...findings, assumedFactsCheckRow(pending)] : findings) as Prisma.InputJsonArray,
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
    // Plans 2026-11-07: the Gratis plan builds and previews; publishing opens the plans in the Studio.
    await this.plans?.assertCanPublish(merchantId);
    if (store.status !== 'ACTIVE') throw new BadRequestException('Activa la tienda antes de publicar este diseño.');
    const snapshot = await this.snapshot(storeId, revision);
    assertSourceCommerceContract(snapshot);
    this.assertNoPendingAssumptions(snapshot);
    await this.assertNoPriceToConfirm(storeId);
    const runtime = await currentSourceRuntimeBundle();
    await requireSourceChecks(this.prisma, storeId, revision, snapshot, runtime.digest);
    return this.change(merchantId, storeId, expected, async tx => {
      // A selling test always serves the published design, so it never blocks publishing (spec 2026-11-16).
      const running = await tx.storeSourceExperiment.findUnique({ where: { activeStoreId: storeId } });
      if (running && running.kind !== 'selling') throw new ConflictException('Detén la prueba antes de publicar otro diseño.');
      await this.recordRuntime(tx, storeId, runtime);
      // A new publication was checked against the latest kit, so it clears any earlier rollback pin.
      await tx.store.update({ where: { id: storeId }, data: { publicVisibility: true, sourcePublicationPaused: false, publishedSourceRevision: revision, publishedRuntimeDigest: null, sourcePublishedAt: new Date() } });
      if (drawsSignup(snapshot)) await enableDrawnSignup(tx, storeId);
    });
  }
  async visibility(merchantId: string, storeId: string, published: boolean, expected: number) {
    if (published) await this.plans?.assertCanPublish(merchantId);
    if (published) { const store = await this.owner(merchantId, storeId); if (store.publishedSourceRevision) assertSourceCommerceContract(await this.snapshot(storeId, store.publishedSourceRevision)); }
    return this.change(merchantId, storeId, expected, async tx => {
      const store = await tx.store.findUniqueOrThrow({ where: { id: storeId } });
      if (!store.publishedSourceRevision) throw new BadRequestException('Publica un diseño antes de cambiar su visibilidad.');
      if (published && store.status !== 'ACTIVE') throw new BadRequestException('Activa tu tienda desde el panel antes de publicarla.');
      if (!published) {
        // Spec 2026-11-09 A/B tests: a popup test's hidden B code ends with the test.
        const running = await tx.storeSourceExperiment.findFirst({ where: { storeId, status: 'RUNNING' } });
        if (running?.variantPromoCodeId) await tx.promoCode.updateMany({ where: { id: running.variantPromoCodeId, storeId }, data: { isActive: false } });
        await tx.storeSourceExperiment.updateMany({ where: { storeId, status: 'RUNNING' }, data: { status: 'STOPPED', activeStoreId: null, endedAt: new Date() } });
      }
      await tx.store.update({ where: { id: storeId }, data: { sourcePublicationPaused: !published, ...(published ? { publicVisibility: true } : {}) } });
    });
  }
  /** What every test needs before it starts: a paid plan, a public store with integrated payments, and no other test running. */
  private async testGate(merchantId: string, storeId: string) {
    const store = await this.owner(merchantId, storeId);
    await this.plans?.assertCanPublish(merchantId);
    if (!isPublicStore(store) || !store.publishedSourceRevision) throw new BadRequestException('Publica tu diseño y activa la tienda antes de iniciar una prueba.');
    if (store.checkoutMode !== 'payment') throw new BadRequestException('Activa los pagos integrados para comparar compras confirmadas.');
    let running = await this.prisma.storeSourceExperiment.findUnique({ where: { activeStoreId: storeId } });
    // The merchant's own test wins over an automatic selling test (spec 2026-11-16): that one stops, undone.
    if (running?.kind === 'selling') { await stopSellingTest(this.prisma as never, running.id, 'Pausado: empezaste tu propia prueba'); running = null; }
    if (running) throw new ConflictException(`Ya tienes una prueba de «${running.request || (running.kind === 'popup' ? 'tu ventana' : 'tu diseño')}» corriendo. ¿La termino para empezar esta?`);
    return store;
  }
  async start(merchantId: string, storeId: string, revision: number, expected: number, request?: string) {
    const store = await this.testGate(merchantId, storeId);
    const [a, b] = await Promise.all([this.snapshot(storeId, store.publishedSourceRevision!), this.snapshot(storeId, revision)]);
    assertSourceCommerceContract(a); assertSourceCommerceContract(b);
    this.assertNoPendingAssumptions(b);
    const authored = (s: SourceProjectSnapshot) => JSON.stringify(s.files.filter(f => /\.(html|css|js)$/.test(f.path) && !['config.js', 'commerce.js'].includes(f.path)).sort((x,y)=>x.path.localeCompare(y.path)));
    if (store.publishedSourceRevision === revision || authored(a) === authored(b)) throw new BadRequestException('La versión B quedó igual a tu tienda; dime qué cambio quieres probar.');
    const runtime = await currentSourceRuntimeBundle();
    await requireSourceChecks(this.prisma, storeId, revision, b, runtime.digest);
    return this.change(merchantId, storeId, expected, async tx => {
      await this.recordRuntime(tx, storeId, runtime);
      await tx.storeSourceExperiment.create({ data: { storeId, activeStoreId: storeId, controlRevision: store.publishedSourceRevision!, variantRevision: revision, kind: 'design', ...(request ? { request: request.slice(0, 200) } : {}) } });
    });
  }
  /** Spec 2026-11-09 A/B tests: a popup test runs on the published design; B differs only in its popup. A different percent gets its own
   *  hidden code, so a B shopper's welcome code matches what B promised. */
  async startPopupTest(merchantId: string, storeId: string, variant: { discount?: number; look?: PopupLookId }, request: string, expected: number) {
    const store = await this.testGate(merchantId, storeId);
    const settings = ((await this.prisma.storeRetention.findUnique({ where: { storeId } }))?.settings ?? {}) as Record<string, unknown>;
    const codeA = typeof settings.popupPromoCodeId === 'string' ? await this.prisma.promoCode.findFirst({ where: { id: settings.popupPromoCodeId, storeId, isActive: true } }) : null;
    const percentA = codeA?.discountType === 'PERCENT' ? Number(codeA.discountValue) : 0;
    const discount = variant.discount && variant.discount !== percentA ? variant.discount : undefined;
    const look = readPopupLook(variant.look) ?? undefined;
    if (!discount && !look) throw new BadRequestException('La versión B quedó igual a tu tienda; dime qué cambio quieres probar.');
    return this.change(merchantId, storeId, expected, async tx => {
      const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      const code = discount ? await tx.promoCode.create({ data: { storeId, code: `BIENVENIDA${discount}-${Array.from({ length: 4 }, () => alphabet[randomInt(alphabet.length)]).join('')}`, discountType: 'PERCENT', discountValue: discount, isActive: true, showInEmails: false } }) : null;
      await tx.storeSourceExperiment.create({ data: { storeId, activeStoreId: storeId, kind: 'popup', controlRevision: store.publishedSourceRevision!, variantRevision: store.publishedSourceRevision!,
        variantSettings: { ...(discount ? { discount, percentA } : {}), ...(look ? { look } : {}) }, ...(code ? { variantPromoCodeId: code.id } : {}), request: request.slice(0, 200) } });
    });
  }
  /** The merchant's choice ends a test whatever the numbers say (spec 2026-11-09: YAPI recommends, the merchant decides). */
  async finishWith(merchantId: string, storeId: string, expected: number, experimentId: string, keep: 'A' | 'B', stopped = false) {
    return this.change(merchantId, storeId, expected, async tx => {
      const test = await tx.storeSourceExperiment.findFirst({ where: { id: experimentId, storeId, status: 'RUNNING' } });
      if (!test) throw new ConflictException('Esta prueba ya terminó.');
      const ended = await tx.storeSourceExperiment.updateMany({ where: { id: experimentId, storeId, status: 'RUNNING' }, data: { status: stopped ? 'STOPPED' : 'COMPLETED', activeStoreId: null, winner: stopped ? null : keep, endedAt: new Date() } });
      if (!ended.count) throw new ConflictException('Esta prueba ya terminó.');
      // A selling test only ends: its revision is the design published when it began, and the merchant may have published since
      // (final review I1). The daily job turns winner B into a kept change.
      if (test.kind === 'selling') return;
      if (test.kind !== 'popup') {
        if (keep === 'B') await tx.store.update({ where: { id: storeId }, data: { publishedSourceRevision: test.variantRevision, sourcePublishedAt: new Date() } });
        return;
      }
      if (keep === 'A') {
        if (test.variantPromoCodeId) await tx.promoCode.updateMany({ where: { id: test.variantPromoCodeId, storeId }, data: { isActive: false } });
        return;
      }
      const row = await tx.storeRetention.findUnique({ where: { storeId } });
      if (!row) throw new ConflictException('No encontré la ventana de suscripción de tu tienda.');
      const settings = (row.settings ?? {}) as Record<string, unknown>;
      const b = (test.variantSettings ?? {}) as { discount?: number; percentA?: number; look?: PopupLookId };
      const next: Record<string, unknown> = { ...settings, ...popupWordsFor(settings, b) };
      if (b.look) { next.popupLookPrevious = settings.popupLook; next.popupLook = b.look; }
      if (test.variantPromoCodeId) next.popupPromoCodeId = test.variantPromoCodeId;
      await tx.storeRetention.update({ where: { storeId }, data: { settings: next as Prisma.InputJsonValue, revision: { increment: 1 } } });
    });
  }
  /** «Seguir 2 semanas más»: no stale card for another 14 days. */
  async extend(merchantId: string, storeId: string, experimentId: string) {
    await this.owner(merchantId, storeId);
    const changed = await this.prisma.storeSourceExperiment.updateMany({ where: { id: experimentId, storeId, status: 'RUNNING' }, data: { extendedUntil: new Date(Date.now() + 14 * 86400000) } });
    if (!changed.count) throw new ConflictException('Esta prueba ya terminó.');
    return publicationState(this.prisma, storeId);
  }
  async finish(merchantId: string, storeId: string, expected: number, experimentId: string, apply: boolean) {
    await this.owner(merchantId, storeId);
    const state = await publicationState(this.prisma, storeId);
    if (!state.experiment || state.experiment.id !== experimentId || state.experiment.status !== 'RUNNING') throw new ConflictException('Esta prueba ya no está activa.');
    const winner = apply ? state.experiment.evidence.winner : null;
    // Final review 2026-11-09: the «Pruebas A/B» page's buttons end a popup test by the popup rules (B's popup on a win, B's code off).
    if (state.experiment.kind === 'popup' || state.experiment.kind === 'selling') {
      if (apply && !winner) throw new BadRequestException('Todavía no hay evidencia suficiente para aplicar un ganador.');
      return this.finishWith(merchantId, storeId, expected, experimentId, apply ? winner as 'A' | 'B' : 'A', !apply);
    }
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
    let revision = store.publishedSourceRevision, visitToken: string | null = null, variant: string | undefined;
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
      // A selling test (spec 2026-11-16) differs only in its switches: both sides see the published design.
      if (experiment.kind !== 'selling') revision = visit.variant === 'B' ? experiment.variantRevision : experiment.controlRevision;
      visitToken = visit.token; variant = visit.variant;
    }
    const selling = await sellingForVisitor(this.prisma as never, store.id, experiment, variant);
    const { snapshot, files } = await this.publicRevisionFiles(store.id, revision, store.publishedRuntimeDigest);
    // Export tooling is private. Only the selected public revision's browser assets leave the API.
    const assetPath = `/stores/public/${encodeURIComponent(slug)}/source-site/assets/${await this.assetVersion(store.id, revision)}/`;
    // Stores published before the DNA existed get one seeded by the store id, without regenerating.
    const publicFiles = withSeededDna(files, store.id)
      // Store icons reach visitors only as the SVG sanitiser rewrites them: a store saved under an older icon set keeps
      // its icons, and anything that is not a plain drawing is dropped.
      .flatMap(f => { if (!ICON_PATH.test(f.path)) return [f]; const svg = f.encoding === 'base64' ? null : sanitizeMotifSvg(f.content).svg; return svg ? [{ ...f, content: svg }] : []; })
      // DNA motif drawings travel as text (every save sanitises them); the preview inlines them for a hero <img>.
      // Library illustrations travel the same way, but only byte-identical to the kit's own files.
      .filter(f => (/\.(html|css|js|png|jpe?g|webp|gif|avif|mp4|woff2?|ttf)$/i.test(f.path) || isSourceMotifFile(f.path) && f.encoding !== 'base64' || isKitCreativeFile(f) || ICON_PATH.test(f.path)) && !['server.mjs', 'build.mjs'].includes(f.path))
      // Binary media is served by publicAsset; the site JSON only names it.
      .map(f => f.encoding === 'base64' && PUBLIC_ASSET.test(f.path) ? { path: f.path, encoding: 'url' as const, content: '' } : f);
    return { published: true, revision, visitToken, selling, analyticsAvailable: true, assetPath, snapshot: { ...snapshot, brief: {}, files: publicFiles } };
  }

  /** One in-flight load per revision: a burst of first requests shares it instead of each decoding the snapshot. */
  private readonly assetCache = new Map<string, Promise<Map<string, { bytes: Buffer; etag: string }>>>();

  /** The files a visitor receives: the revision merged with its trusted runtime. Site JSON and asset route share it. */
  private async publicRevisionFiles(storeId: string, revision: number, runtimeDigest: string | null) {
    const snapshot = await this.snapshot(storeId, revision);
    // Hosted publications keep their trusted kit even after a deployment; previews use the current kit.
    const runtime = runtimeDigest
      ? await this.prisma.sourceRuntimeBundle.findUniqueOrThrow({ where: { digest: runtimeDigest } })
      : null;
    const { files } = runtime
      ? await withSourceRuntime(snapshot, { digest: runtime.digest, files: runtime.files as SourceRuntimeFiles })
      : await currentSourceRuntime(snapshot);
    return { snapshot, files };
  }

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

  /** Speed (owner 2026-11-18): a saved draft's media for the Studio's preview, addressed like a published store's. The revision's
   *  digest in the address is the key: only someone who already has the version (its owner, through the authenticated API)
   *  can build it. Only media files are served, as for published stores. */
  async draftAsset(storeId: string, version: string, path: string): Promise<{ bytes: Buffer; contentType: string; etag: string }> {
    const missing = () => new NotFoundException('Archivo no encontrado');
    const match = /^(\d+)-([a-f0-9]{12})$/.exec(version);
    if (!match || !PUBLIC_ASSET.test(path) || path.split('/').some(part => !part || part === '.' || part === '..')) throw missing();
    const revision = Number(match[1]);
    const key = `draft:${storeId}:${revision}:${match[2]}`;
    let load = this.assetCache.get(key);
    if (load) this.assetCache.delete(key);
    else load = this.prisma.storeSourceVersion.findUnique({ where: { storeId_revision: { storeId, revision } }, select: { digest: true, snapshot: true } }).then(saved => {
      if (!saved || saved.digest.slice(0, 12) !== match[2]) throw missing();
      const files = ((saved.snapshot as unknown as SourceProjectSnapshot).files ?? []).filter(f => f.encoding === 'base64' && PUBLIC_ASSET.test(f.path));
      return new Map(files.map(f => { const bytes = Buffer.from(f.content, 'base64'); return [f.path, { bytes, etag: `"${createHash('sha1').update(bytes).digest('base64url')}"` }] as const; }));
    });
    this.assetCache.set(key, load);
    while (this.assetCache.size > ASSET_CACHE_REVISIONS) this.assetCache.delete(this.assetCache.keys().next().value!);
    let files: Map<string, { bytes: Buffer; etag: string }>;
    try { files = await load; } catch (error) { if (this.assetCache.get(key) === load) this.assetCache.delete(key); throw error; }
    const file = files.get(path);
    if (!file) throw missing();
    return { bytes: file.bytes, contentType: ASSET_TYPES[path.split('.').pop()!.toLowerCase()], etag: file.etag };
  }

  async publicAsset(slug: string, version: string, path: string): Promise<{ bytes: Buffer; contentType: string; etag: string }> {
    const missing = () => new NotFoundException('Archivo no encontrado');
    const match = /^(\d+)-([a-f0-9]{12})$/.exec(version);
    if (!match || !PUBLIC_ASSET.test(path) || path.split('/').some(part => !part || part === '.' || part === '..')) throw missing();
    const revision = Number(match[1]);
    const store = await this.prisma.store.findFirst({ where: { slug, ...PUBLIC_STORE_WHERE }, select: { id: true, publishedSourceRevision: true, publishedRuntimeDigest: true } });
    if (!store?.publishedSourceRevision || !(await this.servableRevisions(store.id, store.publishedSourceRevision)).includes(revision)) throw missing();
    // The digest pins the URL to this store's exact revision, so a reused slug never inherits cached media.
    if (await this.assetVersion(store.id, revision) !== version) throw missing();
    const key = `${store.id}:${revision}:${store.publishedRuntimeDigest ?? 'current'}`;
    let load = this.assetCache.get(key);
    if (load) this.assetCache.delete(key); // re-inserted below: least recently used is evicted first
    else load = this.publicRevisionFiles(store.id, revision, store.publishedRuntimeDigest).then(({ files }) => new Map(files
      .filter(f => f.encoding === 'base64' && PUBLIC_ASSET.test(f.path))
      .map(f => { const bytes = Buffer.from(f.content, 'base64'); return [f.path, { bytes, etag: `"${createHash('sha1').update(bytes).digest('base64url')}"` }] as const; })));
    this.assetCache.set(key, load);
    while (this.assetCache.size > ASSET_CACHE_REVISIONS) this.assetCache.delete(this.assetCache.keys().next().value!);
    let files: Map<string, { bytes: Buffer; etag: string }>;
    try { files = await load; } catch (error) { if (this.assetCache.get(key) === load) this.assetCache.delete(key); throw error; }
    const file = files.get(path);
    if (!file) throw missing();
    return { bytes: file.bytes, contentType: ASSET_TYPES[path.split('.').pop()!.toLowerCase()], etag: file.etag };
  }
}
