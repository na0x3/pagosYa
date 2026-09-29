// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { filterTemplates, renderTemplateChoices, renderTemplateGallery, renderTemplatePreview, templateBrowserUrl, templateCategories, type TemplateSummary } from './source-templates';

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
    expect(chips.map(chip => chip?.replace(/\s+/g, ' ').trim())).toEqual(['Todas 3', 'Belleza 1', 'Deporte y aire libre 2']);
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

describe('gallery look', () => {
  it('labels the construction category', () => {
    const construction = [{ id: 'obra', name: 'Obra', category: 'construccion', description: 'Constructora.', tags: [], order: -300 }];
    const root = document.createElement('div');
    root.innerHTML = renderTemplateGallery(construction, { category: '', selected: '', busy: false, error: '', hasSite: true, previewBase: '/' });
    expect(root.querySelector('[data-template-category="construccion"]')!.textContent).toContain('Construcción');
  });
  it('frames each desktop capture in a browser window, without the phone capture', () => {
    const card = render().querySelector('[data-template-card="aurora"]')!;
    expect(card.querySelectorAll('.tpl-card__chrome i')).toHaveLength(3);
    expect(card.querySelector('.tpl-card__desk')!.getAttribute('src')).toBe('/plantillas/aurora.webp');
    expect(card.querySelector('.tpl-card__phone')).toBeNull();
    expect(card.querySelector('.tpl-card__meta')!.textContent).toContain('Aurora');
  });
  it('titles the page with a search field, and keeps an icon close button for the dialog', () => {
    const root = render();
    expect(root.querySelector('h2')!.textContent).toBe('Elige la plantilla que te encante');
    const search = root.querySelector<HTMLInputElement>('input[data-template-search]')!;
    expect(search.type).toBe('search');
    expect(search.getAttribute('aria-label')).toBe('Buscar plantillas');
    expect(root.querySelector('[data-template-close]')!.getAttribute('aria-label')).toBe('Cerrar');
  });
});

describe('search', () => {
  const ids = (root: HTMLElement) => [...root.querySelectorAll('[data-template-card]')].map(card => card.getAttribute('data-template-card'));
  it('matches name, category label and description, ignoring case and accents', () => {
    expect(filterTemplates(templates, { category: '', query: 'AURORA' }).map(t => t.id)).toEqual(['aurora']);
    expect(filterTemplates(templates, { category: '', query: 'cosmetica' }).map(t => t.id)).toEqual(['aurora']);
    expect(filterTemplates(templates, { category: '', query: 'aire libre' }).map(t => t.id)).toEqual(['cumbre', 'x']);
  });
  it('combines with the chosen category', () => {
    expect(ids(render({ category: 'deporte', query: 'quoted' }))).toEqual(['x']);
  });
  it('keeps the typed text in the field and says when nothing matches', () => {
    const root = render({ query: 'zzz "<b>' });
    expect(root.querySelector<HTMLInputElement>('[data-template-search]')!.value).toBe('zzz "<b>');
    expect(ids(root)).toEqual([]);
    expect(root.querySelector('[data-template-results]')!.textContent).toContain('No encontramos plantillas para «zzz "<b>»');
    expect(root.querySelector('[data-template-results] b')).toBeNull();
  });
  it('counts the templates shown', () => {
    expect(render({ category: 'deporte' }).querySelector('[data-template-count]')!.textContent).toBe('2 plantillas');
    expect(render({ query: 'aurora' }).querySelector('[data-template-count]')!.textContent).toBe('1 plantilla');
  });
});

describe('card actions', () => {
  it('offers Editar, Ver and Info on every card', () => {
    const card = render().querySelector('[data-template-card="cumbre"]')!;
    expect(card.querySelector('[data-template-edit="cumbre"]')!.textContent).toBe('Editar');
    expect(card.querySelector('[data-template-view="cumbre"]')!.textContent).toBe('Ver');
    const info = card.querySelector('[data-template-pick="cumbre"]')!;
    expect(info.textContent).toBe('Info');
    expect(info.getAttribute('aria-label')).toBe('Info de Cumbre');
  });
  it('asks on the card before Editar replaces an existing design', () => {
    const card = render({ confirm: 'aurora' }).querySelector('[data-template-card="aurora"]')!;
    expect(card.querySelector('[data-template-edit-confirm]')!.textContent).toBe('Usar Aurora');
    expect(card.querySelector('[data-template-edit-cancel]')).toBeTruthy();
    expect(card.textContent).toContain('Tu diseño actual queda guardado en el historial');
    expect(render({ confirm: 'aurora' }).querySelector('[data-template-card="cumbre"] [data-template-edit-confirm]')).toBeNull();
  });
  it('shows which card is being applied and disables the rest', () => {
    const root = render({ busy: true, applying: 'cumbre' });
    expect(root.querySelector('[data-template-edit="cumbre"]')!.textContent).toBe('Aplicando…');
    expect([...root.querySelectorAll<HTMLButtonElement>('[data-template-edit],[data-template-view],[data-template-pick]')].every(button => button.disabled)).toBe(true);
  });
  it('links Ver to the full-window template preview for the store', () => {
    expect(templateBrowserUrl('/studio/', 's 1', 'aurora', 'http://localhost:4323')).toBe('http://localhost:4323/studio/?source=1&browser=1&store=s+1&template=aurora');
  });
});

describe('template preview', () => {
  const state = (hasSite: boolean, width: 'desktop' | 'phone') => ({ category: '', selected: 'cumbre', busy: false, error: '', hasSite, previewBase: '/', width });
  it('shows the chosen template with navigation, width toggle and apply', () => {
    const root = document.createElement('div');
    root.innerHTML = renderTemplatePreview(templates[1], state(true, 'desktop'));
    for (const selector of ['[data-template-prev]', '[data-template-next]', '[data-template-apply]', '[data-template-back]', '[data-template-width]', 'iframe.tpl-preview__frame']) expect(root.querySelector(selector)).toBeTruthy();
    expect(root.textContent).toContain('queda guardado en el historial');
  });
  it('waits for the preview with the bouncing pagosYa star and a status line', () => {
    const root = document.createElement('div');
    root.innerHTML = renderTemplatePreview(templates[1], state(true, 'desktop'));
    const loading = root.querySelector('[data-template-loading]')!;
    expect(loading.getAttribute('role')).toBe('status');
    expect(loading.querySelector('.tpl-loader-star svg')).toBeTruthy();
    expect(loading.querySelector('.tpl-loader-star')!.getAttribute('aria-hidden')).toBe('true');
    expect(loading.textContent).toContain('Preparando la vista previa con tus productos');
  });
  it('drops the history note while the store is untouched', () => {
    const root = document.createElement('div');
    root.innerHTML = renderTemplatePreview(templates[1], state(false, 'phone'));
    expect(root.textContent).not.toContain('historial');
    expect(root.querySelector('.tpl-preview')!.classList.contains('tpl-preview--phone')).toBe(true);
  });
});

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
