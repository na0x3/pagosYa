import { planCardOf } from './source-plan-card';
import { suggestionCards } from './source-suggestions';

/** YAPI in design mode (spec 2026-10-22 v2): the pill, the exit and the conversation sheet. */
const esc = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function renderPill(o: { busy: boolean; spin: 'spin' | 'pulse' | 'idle'; selectionLabel?: string; attachments: string; menuOpen: boolean; logo: string }): string {
  const off = o.busy ? ' disabled' : '';
  return `<form class="yapi-pill" data-composer data-yapi-pill aria-label="Habla con YAPI">
    ${o.attachments ? `<div class="yapi-pill__files">${o.attachments}</div>` : ''}
    <div class="yapi-pill__row">
      <img class="yapi-pill__star ${o.spin === 'spin' ? 'is-spin' : o.spin === 'pulse' ? 'is-pulse' : ''}" data-yapi-star tabindex="0" src="${esc(o.logo)}" alt="Mover a YAPI" width="34" height="34" draggable="false" title="Arrastra para mover · doble clic para volver al centro">
      ${o.selectionLabel ? `<span class="yapi-pill__chip">Sobre: ${esc(o.selectionLabel)}</span>` : ''}
      <label for="agent-command" class="sr-only">Indicación para YAPI</label>
      <textarea id="agent-command" name="command" rows="1" maxlength="12000" placeholder="¿Qué quieres crear o mejorar?"${off}></textarea>
      <div class="yapi-pill__plus">
        <button type="button" class="yapi-pill__icon" data-yapi-plus aria-expanded="${o.menuOpen}" aria-label="Más opciones"${off}><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></button>
        <div class="yapi-pill__menu" role="menu" ${o.menuOpen ? '' : 'hidden'}>
          <button type="button" role="menuitem" data-action="open-upload">Agregar fotos</button>
          <button type="button" role="menuitem" data-composer-action="create-product">Crear producto</button>
        </div>
      </div>
      <button type="button" class="yapi-pill__icon" data-yapi-history-open aria-label="Ver la conversación"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/></svg></button>
      <button type="submit" class="yapi-pill__send"${off}>Enviar ↗</button>
    </div>
    <input class="sr-only" type="file" accept="image/png,image/jpeg,image/webp,video/mp4,.mp4" multiple data-image-input aria-label="Seleccionar hasta 24 imágenes o videos MP4">
  </form>`;
}

export function needsAnswer(message: { id: string; role: string; metadata?: Record<string, unknown> | null }, currentRevision: number): boolean {
  if (message.role !== 'ASSISTANT') return false;
  const meta = message.metadata ?? {};
  const card = planCardOf(message, currentRevision);
  if (card) return !card.outdated;
  if (meta.plan) return false;
  const clarification = meta.clarification as { options?: unknown[] } | undefined;
  return Boolean(clarification?.options?.length || (meta.failed && meta.pendingRequest) || suggestionCards(meta).length || meta.styleProposal || meta.startChoices || Array.isArray(meta.templateChoices));
}

export const renderExit = () => '<button type="button" class="yapi-exit" data-yapi-exit aria-label="Salir del diseño">×</button>';

export function renderHistory(open: boolean, inner: string): string {
  return `<section class="yapi-history" role="dialog" aria-label="Conversación con YAPI" ${open ? '' : 'hidden'}>
    <header><strong>Conversación</strong><button type="button" data-yapi-history-close aria-label="Cerrar la conversación">×</button></header>
    <div class="yapi-history__list">${inner}</div>
  </section>`;
}
