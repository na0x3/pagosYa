import { fallbackTemplatePick, leastUsedPick, pickableTemplates, randomPick, readTemplatePicks, readTemplateRandom, templatePickSchema, templateSwitchRequest } from './source-template-pick';

const manifest = (id: string, extra: Record<string, unknown> = {}) => ({
  id, name: id, category: 'comida', description: `Plantilla ${id}`, tags: [], extends: 'esencial',
  preset: { variants: { theme: id }, layout: [{ type: 'cover-split' }] }, ...extra,
}) as never;

describe('template pick', () => {
  it('offers only themed Esencial presets with a home, minus the hidden ones', () => {
    const list = pickableTemplates([
      manifest('mordisco'), manifest('shrine'),
      manifest('plain', { preset: { variants: { theme: 'none' }, layout: [{ type: 'cover-split' }] } }),
      manifest('nohome', { preset: { variants: { theme: 'x' } } }),
      manifest('esencial', { extends: undefined, preset: undefined }),
    ], new Set(['shrine']));
    expect(list.map(template => template.id)).toEqual(['mordisco']);
  });

  it('keeps up to three known, distinct candidates in order, with their reasons', () => {
    const templates = pickableTemplates([manifest('mordisco'), manifest('pecas'), manifest('grano'), manifest('sorbo')]);
    expect(readTemplatePicks({ plantillas: [{ plantilla: 'pecas', porque: '  Va con tu   piel. ' }, { plantilla: 'otra', porque: 'x' }, { plantilla: 'pecas', porque: 'y' }, { plantilla: 'grano', porque: '' }, { plantilla: 'sorbo', porque: '' }, { plantilla: 'mordisco', porque: '' }] }, templates))
      .toEqual([{ id: 'pecas', reason: 'Va con tu piel.' }, { id: 'grano', reason: '' }, { id: 'sorbo', reason: '' }]);
    expect(readTemplatePicks(null, templates)).toEqual([]);
    expect(templatePickSchema(['a', 'b']).properties.plantillas.items.properties.plantilla.enum).toEqual(['a', 'b']);
  });

  it('takes the least used candidate; a tie keeps the model order (spec 2026-11-04 §2: two art stores both got Muro)', () => {
    const candidates = [{ id: 'muro', reason: 'a' }, { id: 'calma', reason: 'b' }, { id: 'diario', reason: 'c' }];
    expect(leastUsedPick(candidates, new Map([['muro', 2], ['calma', 1]]))).toEqual({ id: 'diario', reason: 'c' });
    expect(leastUsedPick(candidates, new Map([['muro', 1], ['calma', 1], ['diario', 1]]))).toEqual({ id: 'muro', reason: 'a' });
    expect(leastUsedPick([], new Map())).toBeNull();
  });

  it('draws one at random when the owner switches the draw on (2026-11-04: «podemos hacer que sea random?»)', () => {
    const candidates = [{ id: 'muro', reason: 'a' }, { id: 'calma', reason: 'b' }, { id: 'diario', reason: 'c' }];
    expect(randomPick(candidates, () => 0)).toEqual({ id: 'muro', reason: 'a' });
    expect(randomPick(candidates, () => 0.5)).toEqual({ id: 'calma', reason: 'b' });
    expect(randomPick(candidates, () => 0.9999)).toEqual({ id: 'diario', reason: 'c' });
    expect(randomPick([], () => 0)).toBeNull();
    expect([' Pick', 'ALL', '', undefined, 'yes'].map(readTemplateRandom)).toEqual(['pick', 'all', 'off', 'off', 'off']);
  });

  it('falls back to the template sharing the most words with the business', () => {
    const templates = pickableTemplates([
      manifest('mordisco', { tags: ['mascotas', 'perros', 'premios'], category: 'mascotas' }),
      manifest('sorbo', { tags: ['té', 'infusiones', 'bebidas'] }),
    ]);
    expect(fallbackTemplatePick('Premios naturales para perros y gatos', templates)?.id).toBe('mordisco');
    expect(fallbackTemplatePick('Infusiones de hierbas andinas', templates)?.id).toBe('sorbo');
    expect(fallbackTemplatePick('Servicio de contabilidad', templates)).toBeNull();
  });
});

describe('template switch request', () => {
  const templates = pickableTemplates([manifest('tacon', { name: 'Tacón' }), manifest('muro', { name: 'Muro' })]);
  it('a named template', () => {
    expect(templateSwitchRequest('Cámbiala a la plantilla Tacón por favor', templates)).toEqual({ id: 'tacon' });
    expect(templateSwitchRequest('quiero la plantilla muro', templates)).toEqual({ id: 'muro' });
  });
  it('another template, none named', () => {
    expect(templateSwitchRequest('prueba otra plantilla', templates)).toBe('other');
    expect(templateSwitchRequest('cambia la plantilla, no me gusta', templates)).toBe('other');
  });
  it('ordinary edits never switch', () => {
    expect(templateSwitchRequest('cambia el color del botón', templates)).toBeNull();
    expect(templateSwitchRequest('agrega una sección de preguntas', templates)).toBeNull();
  });
  it('reads a template named inside a first message (live 2026-11-04, Miga Dorada got Gumdrop)', () => {
    const templates = [{ id: 'grano', name: 'Grano', category: 'comida', description: '', tags: [] }, { id: 'gumdrop', name: 'Gumdrop', category: 'comida', description: '', tags: [] }];
    expect(templateSwitchRequest('Somos una panadería en La Paz. Quiero una tienda cálida. Usa la plantilla Grano.', templates)).toEqual({ id: 'grano' });
    expect(templateSwitchRequest('Somos una panadería de grano entero en La Paz.', templates)).toBeNull();
  });
});
