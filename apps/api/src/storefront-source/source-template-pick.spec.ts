import { fallbackTemplatePick, pickableTemplates, readTemplatePick, templatePickSchema } from './source-template-pick';

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
