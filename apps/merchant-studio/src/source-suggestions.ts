/** YAPI's next-step cards under its build message (spec 2026-10-19-store-popup-suggestions-design §2): a design or product
 *  card goes to YAPI as a normal request, the popup card turns the signup popup on, «No, gracias» hides them for good. */
export type SuggestionCard = { id: string; title: string; instruction: string; kind: 'design' | 'popup' | 'product' };
type RetentionApi = { retention(storeId: string): Promise<any>; writeRetention(storeId: string, path: string, method: string, body: Record<string, any>): Promise<any> };

const esc = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function suggestionCards(metadata: Record<string, unknown> | null | undefined): SuggestionCard[] {
  const list = Array.isArray(metadata?.suggestions) ? metadata!.suggestions as Array<Partial<SuggestionCard>> : [];
  return list.filter((card): card is SuggestionCard => typeof card?.id === 'string' && typeof card.title === 'string' && !!card.title.trim()
    && typeof card.instruction === 'string' && !!card.instruction.trim() && ['design', 'popup', 'product'].includes(card.kind as string)).slice(0, 3);
}

export function renderSuggestions(cards: SuggestionCard[], disabled: boolean): string {
  if (!cards.length) return '';
  const off = disabled ? ' disabled' : '';
  return `<div class="clarification-options source-suggestions" data-suggestions>${cards.map(card => `<button type="button" data-suggestion-card="${esc(card.id)}"${off}>${esc(card.title)}</button>`).join('')}<button type="button" class="source-suggestions__dismiss" data-suggestions-dismiss${off}>No, gracias</button></div>`;
}

/** What tapping a card does; returns the line to show the merchant when the card is not a chat request. */
export async function applySuggestion(card: SuggestionCard, deps: { send(text: string): unknown; api: RetentionApi; storeId: string }): Promise<string> {
  if (card.kind !== 'popup') { await deps.send(card.instruction); return ''; }
  const { settings } = await deps.api.retention(deps.storeId);
  // Keys only the server keeps are never sent back: the settings form refuses unknown fields (review 2026-11-09: 400 on stores with a
  // chat-chosen popup photo or previous look).
  const { startedAt: _startedAt, popupLookPrevious: _previous, popupPhoto: _photo, emailWorkspace: _workspace, suggestionsDismissedAt: _dismissed,
    popupKit: _kit, popupKitPrevious: _kitPrevious, popupKitTriedAt: _kitTried, ...current } = settings || {};
  await deps.api.writeRetention(deps.storeId, '', 'PUT', { ...current, signupEnabled: true, popupTrigger: 'both' });
  return 'Listo: el popup de suscripción está activado. Puedes elegir un código de bienvenida en Tu comunidad.';
}

export async function dismissSuggestions(api: Pick<RetentionApi, 'writeRetention'>, storeId: string) {
  await api.writeRetention(storeId, 'suggestions/dismiss', 'POST', {});
}
