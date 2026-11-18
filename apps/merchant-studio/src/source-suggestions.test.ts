// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { applySuggestion, dismissSuggestions, renderSuggestions, suggestionCards } from './source-suggestions';

// Spec 2026-10-19 §2: YAPI's next-step cards under its build message.
const cards = [
  { id: 's1', title: 'Agrega una guía de picante', instruction: 'Agrega una sección con el nivel de picante de cada salsa.', kind: 'design' },
  { id: 's2', title: 'Activa el popup de bienvenida', instruction: 'Activa el popup de suscripción.', kind: 'popup' },
  { id: 's3', title: 'Destaca Garlic Heat', instruction: 'Destaca Garlic Heat en la portada.', kind: 'product' },
  { id: 's4', title: 'Una de más', instruction: 'x', kind: 'design' },
];

describe('suggestion cards', () => {
  it('reads at most three valid cards from a message', () => {
    expect(suggestionCards({ suggestions: [...cards, { id: 's9', title: '', instruction: '', kind: 'design' }] }).map(c => c.id)).toEqual(['s1', 's2', 's3']);
    expect(suggestionCards({})).toEqual([]);
  });
  it('draws a button per card plus «No, gracias», all disabled while YAPI is busy', () => {
    document.body.innerHTML = renderSuggestions(suggestionCards({ suggestions: cards }), true);
    const buttons = [...document.querySelectorAll<HTMLButtonElement>('[data-suggestion-card]')];
    expect(buttons.map(b => b.textContent)).toEqual(['Agrega una guía de picante', 'Activa el popup de bienvenida', 'Destaca Garlic Heat']);
    expect(document.querySelector('[data-suggestions-dismiss]')!.textContent).toBe('No, gracias');
    expect([...document.querySelectorAll('button')].every(b => (b as HTMLButtonElement).disabled)).toBe(true);
    expect(renderSuggestions([], false)).toBe('');
  });
  it('sends a design or product card to YAPI as a normal message', async () => {
    const send = vi.fn(); const api = { retention: vi.fn(), writeRetention: vi.fn() };
    await applySuggestion(cards[0] as any, { send, api, storeId: 'st' });
    await applySuggestion(cards[2] as any, { send, api, storeId: 'st' });
    expect(send.mock.calls.map(c => c[0])).toEqual([cards[0].instruction, cards[2].instruction]);
    expect(api.writeRetention).not.toHaveBeenCalled();
  });
  it('never sends the keys only the server keeps (review 2026-11-09: they made the save fail with 400)', async () => {
    const send = vi.fn();
    const api = { retention: vi.fn().mockResolvedValue({ settings: { revision: 3, startedAt: 'x', signupEnabled: false, popupLook: 'postal', popupLookPrevious: 'cartel', popupPhoto: '/v1/uploads/a.jpg', emailWorkspace: {}, suggestionsDismissedAt: 'y', popupKit: {} } }), writeRetention: vi.fn().mockResolvedValue({}) };
    await applySuggestion(cards[1] as any, { send, api, storeId: 'st' });
    expect(api.writeRetention).toHaveBeenCalledWith('st', '', 'PUT', { revision: 3, signupEnabled: true, popupLook: 'postal', popupTrigger: 'both' });
  });
  it('turns signup and the popup on for a popup card, keeping the other settings', async () => {
    const send = vi.fn();
    const api = { retention: vi.fn().mockResolvedValue({ settings: { revision: 3, startedAt: '2026-10-20', signupEnabled: false, signupTitle: 'Club', popupTrigger: 'load' } }), writeRetention: vi.fn().mockResolvedValue({ saved: true }) };
    const message = await applySuggestion(cards[1] as any, { send, api, storeId: 'st' });
    expect(api.writeRetention).toHaveBeenCalledWith('st', '', 'PUT', { revision: 3, signupEnabled: true, signupTitle: 'Club', popupTrigger: 'both' });
    expect(send).not.toHaveBeenCalled();
    expect(message).toBe('Listo: el popup de suscripción está activado. Puedes elegir un código de bienvenida en Tu comunidad.');
  });
  it('dismisses them for the store', async () => {
    const api = { writeRetention: vi.fn().mockResolvedValue({ dismissed: true }) };
    await dismissSuggestions(api, 'st');
    expect(api.writeRetention).toHaveBeenCalledWith('st', 'suggestions/dismiss', 'POST', {});
  });
});
