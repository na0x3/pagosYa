// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { renderTemplateChoices } from './source-templates';

describe('template choices in a YAPI message', () => {
  const choices = [{ id: 'tostado', name: 'Tostado', reason: 'Hecha para café' }, { id: 'x', name: '<b>Evil</b>', reason: '"quoted"' }];
  const root = (off = false) => { const element = document.createElement('div'); element.innerHTML = renderTemplateChoices(choices, '/studio/', off); return element; };
  it('renders each choice as one tappable card with its preview, escaping text', () => {
    const cards = [...root().querySelectorAll<HTMLButtonElement>('[data-template-choice]')];
    expect(cards.map(card => card.dataset.templateChoice)).toEqual(['tostado', 'x']);
    expect(cards[0].querySelector('img')!.getAttribute('src')).toBe('/studio/plantillas/tostado.webp');
    expect(cards[0].textContent).toContain('Hecha para café');
    expect(cards[1].innerHTML).not.toContain('<b>');
    expect(cards[1].dataset.templateName).toBe('<b>Evil</b>');
  });
  it('disables the cards while busy', () => {
    expect([...root(true).querySelectorAll<HTMLButtonElement>('[data-template-choice]')].every(card => card.disabled)).toBe(true);
  });
});
