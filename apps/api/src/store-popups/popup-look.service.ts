import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { pickPopupLook, POPUP_LOOK_NAMES, readPopupLook, type PopupLookId, type PopupLookSettings } from './popup-looks';

export const POPUP_LOOK_CHOSEN = (look: PopupLookId) => `Elegí un estilo para tu ventana de suscripción: ${POPUP_LOOK_NAMES[look]}. Mírala en Mi tienda › Marketing con «Ver ventana de suscripción».`;

/** A job of the new store's first-build chain (template build, section fill, polish, «Revisión del pedido»). */
export function isFirstBuildStep(input: unknown): boolean {
  const flags = (input ?? {}) as { firstDesign?: boolean; briefCheck?: number; sectionLibrary?: boolean; polish?: boolean };
  return Boolean(flags.firstDesign || flags.briefCheck || flags.sectionLibrary || flags.polish);
}

/** Spec 2026-11-09 popup looks: the store's look, photo and one step of undo; instant, no model call. */
@Injectable()
export class PopupLookService {
  private readonly logger = new Logger(PopupLookService.name);
  constructor(private readonly prisma: PrismaService) {}

  /** Only the popup keys are added to the stored row; the defaults are never written (review 2026-11-09). */
  private async write(storeId: string, patch: (stored: PopupLookSettings) => Partial<PopupLookSettings> | null): Promise<boolean> {
    const stored = ((await this.prisma.storeRetention.findUnique({ where: { storeId } }))?.settings as Record<string, unknown> | undefined) ?? {};
    const change = patch(stored as PopupLookSettings);
    if (!change) return false;
    const next = { ...stored, ...change };
    await this.prisma.storeRetention.upsert({ where: { storeId }, create: { storeId, settings: next as never }, update: { settings: next as never } });
    return true;
  }

  /** After a new store's first build: its look (the slug's stable pick), said in the chat; a look already saved is kept. */
  async designAfterBuild(storeId: string): Promise<void> {
    try {
      const store = await this.prisma.store.findUnique({ where: { id: storeId }, select: { slug: true } });
      if (!store) return;
      const look = pickPopupLook(store.slug);
      // No popup row yet: none is created (it would lock the timezone and start the Comeback count — review 2026-11-09); the store
      // page already gets this same look from the slug. A row without a look gets it saved.
      const row = await this.prisma.storeRetention.findUnique({ where: { storeId }, select: { settings: true } });
      if (row && readPopupLook((row.settings as PopupLookSettings | null)?.popupLook)) return;
      if (row) await this.write(storeId, () => ({ popupLook: look }));
      const thread = await this.prisma.storeAgentThread.upsert({ where: { storeId }, create: { storeId }, update: {} });
      await this.prisma.storeAgentMessage.create({ data: { threadId: thread.id, channel: 'source', role: 'ASSISTANT', content: POPUP_LOOK_CHOSEN(look), metadata: { popupLook: look } } });
    } catch (error) {
      this.logger.warn(`popup look after build skipped for ${storeId}: ${String((error as Error)?.message ?? error).slice(0, 200)}`);
    }
  }
  async setLook(storeId: string, look: PopupLookId): Promise<void> {
    await this.write(storeId, stored => ({ popupLook: look, ...(readPopupLook(stored.popupLook) && stored.popupLook !== look ? { popupLookPrevious: stored.popupLook } : {}) }));
  }
  async setPhoto(storeId: string, photo: string): Promise<void> { await this.write(storeId, () => ({ popupPhoto: photo })); }
  /** «vuelve a la ventana anterior»: one step, swapped (so asking again comes back). */
  undo(storeId: string): Promise<boolean> {
    return this.write(storeId, stored => (readPopupLook(stored.popupLook) && readPopupLook(stored.popupLookPrevious) ? { popupLook: stored.popupLookPrevious, popupLookPrevious: stored.popupLook } : null));
  }
}
