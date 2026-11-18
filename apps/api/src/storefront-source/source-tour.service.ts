import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { pickPopupLook, POPUP_LOOK_NAMES, readPopupLook } from '../store-popups/popup-looks';
import type { SourceProjectFileDto } from './dto/save-source-project.dto';
import { readMasterState } from './source-templates';
import { stepLine, tourSteps, type TourStep } from './source-tour';

export type TourAction = 'start' | 'later' | 'like' | 'change' | 'skip' | 'ok' | 'again';
type TourState = { id: string; steps: TourStep[]; at: number; liked: string[]; changed: string[]; disliked: string[]; waiting?: string; offered?: true; done?: true };
type Chip = { label: string; action: TourAction };

const STEP_CHIPS: Chip[] = [{ label: 'Me gusta', action: 'like' }, { label: 'Cámbiala', action: 'change' }, { label: 'Saltar', action: 'skip' }];
const OFFER = '¿Te muestro tu tienda sección por sección? Te pregunto qué te gusta y cambio lo que quieras.';
const NEW_STORE_MS = 3 * 24 * 60 * 60_000;

/** YAPI store tour (spec 2026-11-09-yapi-tour): the state lives on YAPI's chat messages (metadata.tour) — no table, no model call. */
@Injectable()
export class SourceTourService {
  constructor(private readonly prisma: PrismaService) {}

  private async thread(storeId: string) { return this.prisma.storeAgentThread.upsert({ where: { storeId }, create: { storeId }, update: {} }); }
  private async post(storeId: string, content: string, metadata: Record<string, unknown>) {
    const thread = await this.thread(storeId);
    return this.prisma.storeAgentMessage.create({ data: { threadId: thread.id, channel: 'source', role: 'ASSISTANT', content, metadata: metadata as never } });
  }
  /** The newest tour state on the chat (offered, open or done). */
  private async latest(storeId: string): Promise<TourState | null> {
    return (await this.latestRow(storeId))?.tour ?? null;
  }
  private async latestRow(storeId: string): Promise<{ id: string; metadata: Record<string, unknown>; tour: TourState } | null> {
    const thread = await this.thread(storeId);
    const rows = await this.prisma.storeAgentMessage.findMany({ where: { threadId: thread.id, channel: 'source', role: 'ASSISTANT' }, orderBy: { createdAt: 'desc' }, take: 60, select: { id: true, metadata: true } });
    for (const row of rows) { const tour = (row.metadata as { tour?: TourState } | null)?.tour; if (tour?.id) return { id: row.id, metadata: row.metadata as Record<string, unknown>, tour }; }
    return null;
  }
  private async stepsFor(storeId: string): Promise<TourStep[]> {
    const store = await this.prisma.store.findUnique({ where: { id: storeId }, select: { slug: true, sourceProject: { select: { revision: true } } } });
    const revision = store?.sourceProject?.revision ?? 0;
    const version = revision ? await this.prisma.storeSourceVersion.findUnique({ where: { storeId_revision: { storeId, revision } }, select: { snapshot: true } }) : null;
    const files = ((version?.snapshot as { files?: SourceProjectFileDto[] } | null)?.files ?? []);
    let layout: unknown[] = [];
    try { layout = files.length ? readMasterState(files).layout : []; } catch { layout = []; }
    const hasProduct = (await this.prisma.paymentLink.count({ where: { storeId, status: 'ACTIVE' } })) > 0;
    const settings = ((await this.prisma.storeRetention.findUnique({ where: { storeId } }))?.settings ?? {}) as Record<string, unknown>;
    const look = readPopupLook(settings.popupLook) ?? pickPopupLook(store?.slug ?? storeId);
    return tourSteps({ layout, hasProduct, popupLookName: POPUP_LOOK_NAMES[look] });
  }
  private postStep(storeId: string, tour: TourState, lead = '') {
    const step = tour.steps[tour.at];
    return this.post(storeId, lead + stepLine(step, tour.at + 1, tour.steps.length), { tour, tourStep: step, tourChips: STEP_CHIPS });
  }
  private finish(storeId: string, tour: TourState) {
    const liked = tour.liked.length, changed = tour.changed.length;
    const changedPart = changed ? `cambiamos ${changed} (${tour.changed.join(', ')})` : 'no cambiamos ninguna';
    const text = `Listo, recorrimos tu tienda: te gustaron ${liked} ${liked === 1 ? 'sección' : 'secciones'} y ${changedPart}. Puedes pedirme cambios cuando quieras.`;
    return this.post(storeId, text, { tour: { ...tour, waiting: undefined, done: true } });
  }
  private advance(storeId: string, tour: TourState, lead = '') {
    const next = { ...tour, at: tour.at + 1, waiting: undefined };
    return next.at >= next.steps.length ? this.finish(storeId, next) : this.postStep(storeId, next, lead);
  }

  /** After a new store's first build: offered once; never for stores older than three days. */
  async offer(storeId: string) {
    const store = await this.prisma.store.findUnique({ where: { id: storeId }, select: { createdAt: true } });
    if (!store || Date.now() - new Date(store.createdAt).getTime() > NEW_STORE_MS) return null;
    if (await this.latest(storeId)) return null;
    return this.post(storeId, OFFER, { tour: { id: randomUUID(), steps: [], at: 0, liked: [], changed: [], disliked: [], offered: true }, tourChips: [{ label: 'Empezar', action: 'start' }, { label: 'Ahora no', action: 'later' }] });
  }
  /** On request: resumes the open tour, else starts a new one from the saved store. */
  async start(storeId: string) {
    const open = await this.latest(storeId);
    if (open && !open.done && !open.offered && open.steps.length) return this.postStep(storeId, { ...open, waiting: undefined });
    const steps = await this.stepsFor(storeId);
    return this.postStep(storeId, { id: randomUUID(), steps, at: 0, liked: [], changed: [], disliked: [] });
  }
  async answer(storeId: string, tourId: string, action: TourAction) {
    const tour = await this.latest(storeId);
    if (action === 'start') return this.start(storeId);
    if (!tour || tour.id !== tourId || tour.done) return null;
    if (action === 'later') return this.post(storeId, 'Perfecto. Cuando quieras, escríbeme «muéstrame mi tienda».', { tour: { ...tour, offered: undefined, done: true } });
    if (tour.offered || !tour.steps[tour.at]) return null;
    const step = tour.steps[tour.at];
    if (action === 'like') return this.advance(storeId, { ...tour, liked: [...tour.liked, step.label] });
    if (action === 'skip') return this.advance(storeId, tour);
    if (action === 'change' || action === 'again') {
      const disliked = tour.disliked.includes(step.label) ? tour.disliked : [...tour.disliked, step.label];
      return this.post(storeId, `¿Qué le cambio a «${step.label}»? Por ejemplo: otra foto, otro texto, más corta, otro color o quitarla.`, { tour: { ...tour, disliked, waiting: step.id }, tourStep: step });
    }
    // ok: the change is kept → next step.
    const changed = tour.changed.includes(step.label) ? tour.changed : [...tour.changed, step.label];
    return this.advance(storeId, { ...tour, changed });
  }
  /** «Perdón, sí me gustaba» while YAPI waits for a change: the step counts as liked and the tour goes on. */
  async keep(storeId: string) {
    const tour = await this.latest(storeId);
    if (!tour || tour.done || !tour.waiting) return null;
    const step = tour.steps[tour.at];
    const liked = tour.liked.includes(step.label) ? tour.liked : [...tour.liked, step.label];
    return this.advance(storeId, { ...tour, liked, disliked: tour.disliked.filter(label => label !== step.label) }, 'Perfecto, la dejamos así. ');
  }
  /** The step waiting for «¿Qué le cambio?», so the chat edits that section only; null when none. */
  async waiting(storeId: string): Promise<TourStep | null> {
    const tour = await this.latest(storeId);
    return tour && !tour.done && tour.waiting ? tour.steps.find(step => step.id === tour.waiting) ?? null : null;
  }
  /** The step a chat reply edits: the one waiting after «Cámbiala», or (live Remolino 2026-11-09) the step whose question is the newest
   *  message — «¿Te gusta así o cambio algo?» invites typing the change straight away, so that step then waits as if «Cámbiala» was pressed. */
  async stepForReply(storeId: string): Promise<TourStep | null> {
    const found = await this.latestRow(storeId);
    if (!found || found.tour.done || found.tour.offered) return null;
    const { tour } = found;
    if (tour.waiting) return tour.steps.find(step => step.id === tour.waiting) ?? null;
    const step = tour.steps[tour.at];
    const thread = await this.thread(storeId);
    const newest = await this.prisma.storeAgentMessage.findFirst({ where: { threadId: thread.id, channel: 'source' }, orderBy: { createdAt: 'desc' }, select: { id: true } });
    if (!step || newest?.id !== found.id) return null;
    const disliked = tour.disliked.includes(step.label) ? tour.disliked : [...tour.disliked, step.label];
    await this.prisma.storeAgentMessage.update({ where: { id: found.id }, data: { metadata: { ...found.metadata, tour: { ...tour, disliked, waiting: step.id } } as never } });
    return step;
  }
  /** After the edit of a waiting step: «¿Así está bien?». */
  async afterEdit(storeId: string, failed = false) {
    const tour = await this.latest(storeId);
    if (!tour || tour.done || !tour.waiting) return null;
    const step = tour.steps[tour.at];
    if (failed) return this.post(storeId, 'No pude cambiarla; ¿probamos otra cosa o seguimos?', { tour: { ...tour, waiting: undefined }, tourStep: step, tourChips: [{ label: 'Probar otra cosa', action: 'again' }, { label: 'Seguir', action: 'skip' }] });
    return this.post(storeId, '¿Así está bien?', { tour: { ...tour, waiting: undefined }, tourStep: step, tourChips: [{ label: 'Sí, sigue', action: 'ok' }, { label: 'Cámbiala otra vez', action: 'again' }] });
  }
}
