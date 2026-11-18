import { describe, expect, it } from 'vitest';
import { abViewOf, renderAbChips } from './source-ab-ui';

// Spec 2026-11-09 YAPI A/B tests: the card buttons under YAPI's newest message.
const card = { id: 'c', role: 'ASSISTANT', metadata: { abProposal: { id: 'p1', kind: 'design', revision: 7 }, abChips: [{ label: 'Lanzar prueba', action: 'launch' }, { label: 'Ver otra opción', action: 'another' }, { label: 'Cancelar', action: 'cancel' }] } };
describe('A/B card', () => {
  it('shows the buttons only on the newest YAPI message, with the proposal id', () => {
    expect(abViewOf(card, [card])).toEqual({ proposalId: 'p1', chips: card.metadata.abChips });
    expect(abViewOf(card, [card, { id: 'u', role: 'USER' }])).toEqual({ proposalId: 'p1', chips: card.metadata.abChips });
    expect(abViewOf(card, [card, { id: 'n', role: 'ASSISTANT', metadata: {} }])).toBeNull();
  });
  it('an end card has no proposal and still has its buttons; unknown actions are dropped', () => {
    const end = { id: 'e', role: 'ASSISTANT', metadata: { abChips: [{ label: 'Dejar A', action: 'keepA' }, { label: 'Borrar todo', action: 'drop' }] } };
    expect(abViewOf(end, [end])).toEqual({ proposalId: 'end', chips: [{ label: 'Dejar A', action: 'keepA' }] });
  });
  it('draws escaped buttons that carry their action', () => {
    const html = renderAbChips({ proposalId: 'p1', chips: [{ label: 'Lanzar <prueba>', action: 'launch' }] }, true);
    expect(html).toContain('data-ab-action="launch"');
    expect(html).toContain('data-ab-proposal="p1"');
    expect(html).toContain('Lanzar &lt;prueba&gt;');
    expect(html).toContain('disabled');
  });
});
