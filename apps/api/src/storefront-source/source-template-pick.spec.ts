import { fallbackTemplatePick, pickableTemplates, readTemplatePick, templatePickSchema, templateSwitchRequest } from './source-template-pick';

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

  it('keeps a known answer and its reason, drops an unknown one', () => {
    const templates = pickableTemplates([manifest('mordisco'), manifest('pecas')]);
    expect(readTemplatePick({ plantilla: 'pecas', porque: '  Va con tu   cuidado de la piel. ' }, templates)).toEqual({ id: 'pecas', reason: 'Va con tu cuidado de la piel.' });
    expect(readTemplatePick({ plantilla: 'otra', porque: 'x' }, templates)).toBeNull();
    expect(readTemplatePick(null, templates)).toBeNull();
    expect(templatePickSchema(['a', 'b']).properties.plantilla.enum).toEqual(['a', 'b']);
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
});
