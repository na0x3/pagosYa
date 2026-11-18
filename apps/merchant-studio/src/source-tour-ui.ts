/** YAPI store tour in the Studio (spec 2026-11-09-yapi-tour): the step buttons under YAPI's newest tour message, and where the
 *  preview goes for each step. */
export type TourStepView = { id: string; kind: string; page: string; at?: number; part?: string; label: string };
export type TourChip = { label: string; action: string };
export type TourView = { messageId: string; tourId: string; chips: TourChip[]; step: TourStepView | null };
type Message = { id: string; role: string; metadata?: Record<string, unknown> | null };

const ACTIONS = new Set(['start', 'later', 'like', 'change', 'skip', 'ok', 'again']);
const esc = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** The buttons belong to the newest YAPI message only: older steps were already answered. */
export function tourViewOf(message: Message, messages: Message[]): TourView | null {
  const meta = message.metadata ?? {};
  const tourId = (meta.tour as { id?: unknown } | undefined)?.id;
  const chips = Array.isArray(meta.tourChips) ? (meta.tourChips as TourChip[]).filter(chip => typeof chip?.label === 'string' && ACTIONS.has(chip.action)) : [];
  if (typeof tourId !== 'string' || !chips.length) return null;
  const newest = [...messages].reverse().find(m => m.role !== 'USER');
  if (newest && newest.id !== message.id) return null;
  const step = meta.tourStep && typeof meta.tourStep === 'object' ? meta.tourStep as TourStepView : null;
  return { messageId: message.id, tourId, chips, step };
}

export function renderTourChips(view: TourView, disabled: boolean): string {
  const off = disabled ? ' disabled' : '';
  return `<div class="clarification-options source-tour-chips">${view.chips.map(chip => `<button type="button" data-tour-action="${esc(chip.action)}" data-tour-id="${esc(view.tourId)}"${off}>${esc(chip.label)}</button>`).join('')}</div>`;
}

/** What the preview is told; null for the popup step (the Studio opens the popup preview itself). */
export function tourFocusPayload(step: TourStepView): Record<string, unknown> | null {
  if (step.kind === 'popup') return null;
  if (step.kind === 'cart' || step.kind === 'product') return { type: 'pagosya:tour-focus', kind: step.kind };
  if (step.part) return { type: 'pagosya:tour-focus', part: step.part };
  if (typeof step.at === 'number') return { type: 'pagosya:tour-focus', page: step.page, at: step.at };
  return null;
}
