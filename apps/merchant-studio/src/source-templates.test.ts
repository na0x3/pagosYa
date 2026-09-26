// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { renderTemplateGallery, templateCategories, type TemplateSummary } from './source-templates';

const templates: TemplateSummary[] = [
  { id: 'aurora', name: 'Aurora', category: 'belleza', description: 'Cosmética minimal.', tags: [], order: 10 },
  { id: 'cumbre', name: 'Cumbre', category: 'deporte', description: 'Aire libre.', tags: [], order: 20 },
  { id: 'x', name: '<img src=x onerror=alert(1)>', category: 'deporte', description: '"quoted"', tags: [], order: 30 },
];
const render = (state: Partial<Parameters<typeof renderTemplateGallery>[1]> = {}) => {
  const root = document.createElement('div');
  root.innerHTML = renderTemplateGallery(templates, { category: '', selected: '', busy: false, error: '', hasSite: true, previewBase: '/', ...state });
  return root;
};

describe('Plantillas gallery', () => {
  it('offers one chip per category present, after Todas', () => {
    expect(templateCategories(templates)).toEqual(['belleza', 'deporte']);
    const chips = [...render().querySelectorAll('[data-template-category]')].map(chip => chip.textContent);
    expect(chips).toEqual(['Todas', 'Belleza', 'Deporte y aire libre']);
  });

  it('shows every template as a card with its preview, escaping names', () => {
    const root = render();
    expect(root.querySelectorAll('[data-template-card]')).toHaveLength(3);
    expect(root.querySelector('[data-template-card="aurora"] img')!.getAttribute('src')).toBe('/plantillas/aurora.webp');
    expect(root.querySelector('img[onerror]')).toBeNull();
    expect(root.textContent).toContain('<img src=x onerror=alert(1)>');
  });

  it('filters by category', () => {
    const root = render({ category: 'deporte' });
    expect([...root.querySelectorAll('[data-template-card]')].map(card => card.getAttribute('data-template-card'))).toEqual(['cumbre', 'x']);
    expect(root.querySelector('[data-template-category="deporte"]')!.getAttribute('aria-pressed')).toBe('true');
  });

  it('asks before replacing a site, saying the current design stays in the history', () => {
    const root = render({ selected: 'aurora' });
    expect(root.querySelector('[data-template-confirm]')!.textContent).toContain('Tu diseño actual queda guardado en el historial');
    expect(root.querySelector('[data-template-apply]')!.textContent).toContain('Usar Aurora');
  });

  it('does not mention a previous design when the store has no site yet', () => {
    const root = render({ selected: 'aurora', hasSite: false });
    expect(root.querySelector('[data-template-confirm]')!.textContent).not.toContain('historial');
  });

  it('disables every action while applying and shows errors as alerts', () => {
    const root = render({ selected: 'aurora', busy: true, error: 'El proyecto cambió.' });
    expect([...root.querySelectorAll('button')].filter(button => !button.hasAttribute('data-template-close')).every(button => (button as HTMLButtonElement).disabled)).toBe(true);
    expect(root.querySelector('[role="alert"]')!.textContent).toBe('El proyecto cambió.');
  });
});
