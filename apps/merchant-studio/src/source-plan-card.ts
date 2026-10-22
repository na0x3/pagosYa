/** YAPI plan card (spec 2026-10-22): what YAPI will do, with Construir / Cambiar, under its plan message. */
export type PlanCardView = { id: string; kind: 'new' | 'edit'; lines: string[]; outdated: boolean };
const esc = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function planCardOf(message: { id: string; metadata?: Record<string, unknown> | null }, currentRevision: number): PlanCardView | null {
  const meta = message.metadata ?? {};
  const plan = meta.plan as { revision?: unknown; card?: unknown } | undefined;
  if (!plan || !Array.isArray(plan.card)) return null;
  const lines = plan.card.filter((line): line is string => typeof line === 'string' && Boolean(line.trim())).slice(0, 7);
  return lines.length ? { id: message.id, kind: meta.planKind === 'edit' ? 'edit' : 'new', lines, outdated: plan.revision !== currentRevision } : null;
}

export function renderPlanCard(card: PlanCardView, disabled: boolean): string {
  const off = disabled ? ' disabled' : '';
  return `<div class="plan-card" data-plan-card="${esc(card.id)}"><ul>${card.lines.map(line => `<li>${esc(line)}</li>`).join('')}</ul>`
    + (card.outdated ? '<p class="plan-card__outdated">La tienda cambió desde este plan.</p>'
      : `<div class="plan-card__actions"><button type="button" class="plan-card__build" data-plan-build="${esc(card.id)}"${off}>${card.kind === 'edit' ? 'Hacer cambios' : 'Construir'}</button><button type="button" data-plan-change${off}>Cambiar</button></div>`)
    + '</div>';
}

/** With the card below it, the plan message shows only its intro line; the card carries the lines and the buttons. */
export const planIntro = (content: string) => content.split('\n')[0].trim();
