/** YAPI A/B tests in the Studio (spec 2026-11-09-yapi-ab-tests): the card buttons under YAPI's newest message. */
export type AbChip = { label: string; action: string };
export type AbView = { proposalId: string; chips: AbChip[] };
type Message = { id: string; role: string; metadata?: Record<string, unknown> | null };

const ACTIONS = new Set(['launch', 'another', 'cancel', 'keepA', 'keepB', 'extend']);
const esc = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** The buttons belong to the newest YAPI message only; an end card (no proposal) answers the running test. */
export function abViewOf(message: Message, messages: Message[]): AbView | null {
  const meta = message.metadata ?? {};
  const chips = Array.isArray(meta.abChips) ? (meta.abChips as AbChip[]).filter(chip => typeof chip?.label === 'string' && ACTIONS.has(chip.action)) : [];
  if (!chips.length) return null;
  const newest = [...messages].reverse().find(m => m.role !== 'USER');
  if (newest && newest.id !== message.id) return null;
  const id = (meta.abProposal as { id?: unknown } | undefined)?.id;
  return { proposalId: typeof id === 'string' ? id : 'end', chips };
}

export function renderAbChips(view: AbView, disabled: boolean): string {
  const off = disabled ? ' disabled' : '';
  return `<div class="clarification-options source-ab-chips">${view.chips.map(chip => `<button type="button" data-ab-action="${esc(chip.action)}" data-ab-proposal="${esc(view.proposalId)}"${off}>${esc(chip.label)}</button>`).join('')}</div>`;
}
