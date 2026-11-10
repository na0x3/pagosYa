import { HttpException, Injectable, Logger, Optional } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PlansService } from '../plans/plans.service';
import { PrismaService } from '../prisma/prisma.service';
import { isPublicStore } from '../stores/active-store';
import { pickPopupLook, POPUP_LOOK_NAMES, readPopupLook, type PopupLookId } from '../store-popups/popup-looks';
import { readGame } from '../store-popups/popup-games';
import { endLine, progressLine, readPopupVariant, type AbNumbers } from './source-ab';
import { publicationState, SourcePublishingService } from './source-publishing.service';
import { merchantFacingSourceFailure } from './source-validation-error';

export type AbAction = 'launch' | 'launched' | 'another' | 'cancel' | 'keepA' | 'keepB' | 'extend';
type Chip = { label: string; action: AbAction };
type Proposal = { id: string; kind: 'popup' | 'design'; request: string; revision?: number; variant?: { discount?: number; look?: PopupLookId } };
const LAUNCH = 'La mitad de tus visitantes verá esta versión.';
const NONE = 'No tienes una prueba corriendo. Pídeme una: por ejemplo «prueba si 15% atrae más que 10%» o «prueba otra portada».';

/** YAPI A/B tests (spec 2026-11-09-yapi-ab-tests): the cards, the answers and the notes — read from the test's own numbers, no model call. */
@Injectable()
export class SourceAbService {
  private readonly logger = new Logger(SourceAbService.name);
  constructor(private readonly prisma: PrismaService, private readonly publishing: SourcePublishingService, @Optional() private readonly plans?: PlansService) {}

  private async post(storeId: string, content: string, metadata: Record<string, unknown> = {}) {
    const thread = await this.prisma.storeAgentThread.upsert({ where: { storeId }, create: { storeId }, update: {} });
    return this.prisma.storeAgentMessage.create({ data: { threadId: thread.id, channel: 'source', role: 'ASSISTANT', content, metadata: metadata as never } });
  }
  private async proposal(storeId: string, id: string): Promise<Proposal | null> {
    const thread = await this.prisma.storeAgentThread.upsert({ where: { storeId }, create: { storeId }, update: {} });
    const rows = await this.prisma.storeAgentMessage.findMany({ where: { threadId: thread.id, channel: 'source', role: 'ASSISTANT' }, orderBy: { createdAt: 'desc' }, take: 60, select: { metadata: true } });
    for (const row of rows) { const proposal = (row.metadata as { abProposal?: Proposal } | null)?.abProposal; if (proposal?.id === id) return proposal; }
    return null;
  }
  private running(storeId: string) { return this.prisma.storeSourceExperiment.findUnique({ where: { activeStoreId: storeId } }); }
  /** A popup change while a popup test runs reaches version A too: the chat says so. */
  async popupTestRunning(storeId: string) { return (await this.running(storeId))?.kind === 'popup'; }
  private async store(storeId: string) { return this.prisma.store.findFirst({ where: { id: storeId } }); }

  /** What stops a test before YAPI builds B: nothing is spent on a test that cannot start. */
  async blocker(merchantId: string, storeId: string): Promise<string | null> {
    const store = await this.store(storeId);
    if (!store || !store.publishedSourceRevision || !isPublicStore(store)) return 'Para hacer una prueba A/B, primero publica tu tienda.';
    // Final review 2026-11-09: only a refusal written for merchants is said as it is; a database fault never reaches the chat.
    try { await this.plans?.assertCanPublish(merchantId); } catch (error) {
      if (error instanceof HttpException) return (merchantFacingSourceFailure(error) as Error).message;
      this.logger.warn(`A/B plan check failed for ${storeId}: ${String((error as Error)?.message ?? error).slice(0, 400)}`);
      return 'No pude revisar tu plan por un problema mío. Inténtalo de nuevo en un momento.';
    }
    if (store.checkoutMode !== 'payment') return 'Para comparar ventas reales, activa los pagos integrados de tu tienda.';
    const running = await this.running(storeId);
    return running ? `Ya tienes una prueba de «${running.request || (running.kind === 'popup' ? 'tu ventana' : 'tu diseño')}» corriendo. ¿La termino para empezar esta?` : null;
  }

  /** The blocker said in the chat; a running test's refusal carries the buttons that end it (live Remolino 2026-11-09: «sí» alone
   *  meant nothing to YAPI). */
  async blocked(storeId: string, text: string) {
    const running = await this.running(storeId);
    return this.post(storeId, text, running ? { abChips: [{ label: 'Terminarla y dejar A', action: 'keepA' }, { label: 'Terminarla y dejar B', action: 'keepB' }] satisfies Chip[] } : {});
  }
  /** A popup ask: B is read from the words and only shown — the live popup is never touched before the test starts. */
  async proposePopup(storeId: string, text: string) {
    const store = await this.store(storeId);
    const settings = ((await this.prisma.storeRetention.findUnique({ where: { storeId } }))?.settings ?? {}) as Record<string, unknown>;
    // Final review 2026-11-09: with a game on, every signup wins the game's prize — B's discount would never be given or measured.
    if (readGame(settings.popupGame)) return this.post(storeId, 'Tu ventana tiene un juego (rasca o ruleta) y cada cliente gana su premio, así que una prueba de la ventana no mediría nada. Apaga el juego y la pruebo.');
    const code = typeof settings.popupPromoCodeId === 'string' ? await this.prisma.promoCode.findFirst({ where: { id: settings.popupPromoCodeId, storeId, isActive: true } }) : null;
    const percent = code?.discountType === 'PERCENT' ? Number(code.discountValue) : 0;
    const look = readPopupLook(settings.popupLook) ?? pickPopupLook(store?.slug ?? storeId);
    const variant = readPopupVariant(text, { discount: percent, look });
    if (!variant) return this.post(storeId, '¿Qué quieres probar en tu ventana: otro descuento (por ejemplo 15 %) u otro estilo (Clásica, Portada, Cartel, Postal, Revista o Etiqueta)?');
    const parts = [...(variant.discount ? [`${variant.discount} % de descuento${percent ? ` (hoy ${percent} %)` : ''}`] : []), ...(variant.look ? [`estilo ${POPUP_LOOK_NAMES[variant.look]} (hoy ${POPUP_LOOK_NAMES[look]})`] : [])];
    const proposal: Proposal = { id: randomUUID(), kind: 'popup', request: text.trim().slice(0, 200), variant };
    return this.post(storeId, `Versión B de tu ventana: ${parts.join(' y ')}. ¿Lanzo la prueba? ${LAUNCH}`, { abProposal: proposal, abChips: [{ label: 'Lanzar prueba', action: 'launch' }, { label: 'Cancelar', action: 'cancel' }] satisfies Chip[] });
  }
  /** A design ask ended in a saved revision: that revision is B. */
  async proposeDesign(storeId: string, revision: number, request: string) {
    const proposal: Proposal = { id: randomUUID(), kind: 'design', request: request.trim().slice(0, 200), revision };
    return this.post(storeId, `Esta es la versión B (en la vista previa). ¿Lanzo la prueba? ${LAUNCH}`, { abProposal: proposal,
      abChips: [{ label: 'Lanzar prueba', action: 'launch' }, { label: 'Ver otra opción', action: 'another' }, { label: 'Cancelar', action: 'cancel' }] satisfies Chip[] });
  }

  /** A card's button. A design launch returns `needsChecks` (the Studio runs the desktop/mobile checks, then starts); «Ver otra opción»
   *  returns `resend` (the Studio sends the words again). Everything else is answered in the chat. */
  async answer(merchantId: string, storeId: string, proposalId: string, action: AbAction): Promise<{ message?: unknown; needsChecks?: { revision: number; request: string }; resend?: string }> {
    // Live Remolino 2026-11-09: a database error reached the chat as code. Only a refusal written for merchants (an HTTP exception) is
    // said as it is; anything else is logged and said in plain words.
    const said = async (run: () => Promise<string>) => {
      try { return { message: await this.post(storeId, await run()) }; } catch (error) {
        const shown = error instanceof HttpException ? (merchantFacingSourceFailure(error) as Error).message : null;
        if (!shown) this.logger.warn(`A/B ${action} failed for ${storeId}: ${String((error as Error)?.message ?? error).slice(0, 400)}`);
        return { message: await this.post(storeId, shown ?? 'No pude iniciar la prueba por un problema mío. Tu tienda sigue como estaba; inténtalo de nuevo en un momento.') };
      }
    };
    if (action === 'keepA' || action === 'keepB' || action === 'extend') {
      const running = await this.running(storeId);
      if (!running) return { message: await this.post(storeId, NONE) };
      const store = await this.store(storeId);
      if (action === 'extend') return said(async () => { await this.publishing.extend(merchantId, storeId, running.id); return 'Listo: la prueba sigue dos semanas más.'; });
      const keep = action === 'keepA' ? 'A' : 'B', what = running.kind === 'popup' ? 'tu ventana' : 'tu tienda';
      return said(async () => {
        await this.publishing.finishWith(merchantId, storeId, store?.sourcePublicationVersion ?? 0, running.id, keep);
        return keep === 'B' ? `Listo: dejé la versión B como ${what}.` : `Listo: me quedo con A, ${what} como estaba.`;
      });
    }
    const proposal = await this.proposal(storeId, proposalId);
    if (!proposal) return { message: await this.post(storeId, 'Esa propuesta ya no está. Pídeme la prueba otra vez.') };
    if (action === 'cancel') return { message: await this.post(storeId, 'Listo, no lanzo la prueba.') };
    if (action === 'another') return { resend: proposal.request };
    // The Studio ran B's checks and started the design test: YAPI says so (only when a test really runs).
    if (action === 'launched') {
      const running = await this.running(storeId);
      return { message: await this.post(storeId, running ? `Listo: tu prueba de «${running.request || proposal.request}» empezó. La mitad de tus visitantes ve la versión B; te cuento cómo va.` : NONE) };
    }
    if (proposal.kind === 'design') {
      // Final review 2026-11-09: a running test is said at once, never after minutes of checks.
      const running = await this.running(storeId);
      if (running) return { message: await this.blocked(storeId, `Ya tienes una prueba de «${running.request || (running.kind === 'popup' ? 'tu ventana' : 'tu diseño')}» corriendo. ¿La termino para empezar esta?`) };
      return { needsChecks: { revision: proposal.revision!, request: proposal.request } };
    }
    const store = await this.store(storeId);
    return said(async () => {
      await this.publishing.startPopupTest(merchantId, storeId, proposal.variant ?? {}, proposal.request, store?.sourcePublicationVersion ?? 0);
      return `Listo: tu prueba de «${proposal.request}» empezó. La mitad de tus visitantes ve la versión B; te cuento cómo va.`;
    });
  }

  /** The running test's numbers in the shape YAPI's lines read; null when no test runs. */
  async numbers(storeId: string): Promise<AbNumbers | null> {
    const test = (await publicationState(this.prisma, storeId)).experiment;
    if (!test || test.status !== 'RUNNING') return null;
    const side = (variant: string) => { const row = test.variants.find((v: { variant: string }) => v.variant === variant) ?? {}; return { visitors: row.visitors ?? 0, buyers: row.buyers ?? 0, signups: row.signups ?? 0 }; };
    return { kind: test.kind === 'popup' ? 'popup' : 'design', request: test.request || (test.kind === 'popup' ? 'tu ventana' : 'tu diseño'), days: test.days ?? 0, a: side('A'), b: side('B'), winner: test.evidence?.winner ?? null, stale: Boolean(test.stale) };
  }
  async status(storeId: string) {
    const numbers = await this.numbers(storeId);
    return this.post(storeId, numbers ? progressLine(numbers) : NONE);
  }
  async end(storeId: string) {
    const numbers = await this.numbers(storeId);
    if (!numbers) return this.post(storeId, NONE);
    const a = numbers.kind === 'popup' ? 'tu ventana como está' : 'tu tienda como está';
    return this.post(storeId, `¿Qué versión dejo? A es ${a}; B es la de «${numbers.request}».`, { abChips: [{ label: 'Dejar A', action: 'keepA' }, { label: 'Dejar B', action: 'keepB' }] satisfies Chip[] });
  }
  /** On the Studio's load: at most one line a day, only when visitors came since the last one; the end card once there is an answer. */
  async note(storeId: string) {
    const running = await this.running(storeId);
    if (!running) return null;
    const last = running.lastNoteAt ? new Date(running.lastNoteAt).getTime() : 0;
    if (Date.now() - last < 86400000) return null;
    const numbers = await this.numbers(storeId);
    if (!numbers) return null;
    const ending = Boolean(numbers.winner || numbers.stale);
    if (!ending && last && !(await this.prisma.storeSourceVisit.count({ where: { experimentId: running.id, createdAt: { gt: new Date(last) } } }))) return null;
    await this.prisma.storeSourceExperiment.updateMany({ where: { id: running.id, status: 'RUNNING' }, data: { lastNoteAt: new Date() } });
    if (!ending) return this.post(storeId, progressLine(numbers));
    const chips: Chip[] = numbers.winner === 'B' ? [{ label: 'Sí, deja B', action: 'keepB' }, { label: 'Quedarme con A', action: 'keepA' }]
      : numbers.winner === 'A' ? [{ label: 'Quedarme con A', action: 'keepA' }, { label: 'Dejar B igual', action: 'keepB' }]
      : [{ label: 'Quedarme con A', action: 'keepA' }, { label: 'Seguir 2 semanas más', action: 'extend' }];
    return this.post(storeId, endLine(numbers), { abChips: chips });
  }
}
