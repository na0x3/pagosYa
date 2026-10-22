import { normalizePlan, planJsonSchema, type PlanCatalogue } from './store-plan';

const catalogue: PlanCatalogue = {
  variants: { hero: ['full', 'split-left', 'type'], grid: ['grid3', 'grid4', 'feature'], header: ['classic', 'minimal'] },
  sections: ['process', 'faq', 'sizes'], palettes: ['linen', 'citrus'], fonts: ['grotesk', 'serif'],
};

it('keeps valid choices with their reasons and drops what does not exist', () => {
  const plan = normalizePlan({
    parts: { hero: { id: 'type', why: 'el nombre corto de la marca se lee grande' }, grid: { id: 'mosaic-xl', why: 'x' }, footer: { id: 'columns', why: 'y' } },
    sections: [{ id: 'faq', why: 'tres productos piden instrucciones de uso' }, { id: 'manifesto', why: 'z' }],
    custom: [{ kind: 'per-brand', why: '8 marcas en el catálogo', items: [{ name: 'Bloom', layout: 'stats', colourFrom: 'foto 2' }] }],
    colour: { palette: 'citrus', accent: '#F26B1D', from: 'logo' }, fonts: { id: 'grotesk', why: 'letra gruesa para un tono enérgico' },
    motif: { what: 'espiral', from: 'logo' }, brands: ['Bloom', 'MAGNUS'], card: ['Una sección por marca'],
  }, catalogue, 3);
  expect(plan.parts).toEqual({ hero: { id: 'type', why: 'el nombre corto de la marca se lee grande' } });
  expect(plan.sections).toEqual([{ id: 'faq', why: 'tres productos piden instrucciones de uso' }]);
  expect(plan.custom[0].items[0]).toEqual({ name: 'Bloom', layout: 'stats', colourFrom: 'foto 2' });
  expect(plan.colour).toEqual({ palette: 'citrus', accent: '#f26b1d', from: 'logo' });
  expect(plan.revision).toBe(3);
});

it('survives garbage without throwing', () => {
  expect(normalizePlan('nope', catalogue, 1)).toMatchObject({ version: 1, parts: {}, sections: [], custom: [], brands: [], card: [], colour: { palette: 'linen', from: '' }, fonts: { id: 'grotesk', why: '' } });
});

it('caps lists so a runaway answer stays a plan', () => {
  const many = Array.from({ length: 20 }, (_, i) => ({ id: 'faq', why: `motivo número ${i}` }));
  const plan = normalizePlan({ sections: many, card: Array.from({ length: 20 }, (_, i) => `línea ${i}`) }, catalogue, 1);
  expect(plan.sections).toHaveLength(1);
  expect(plan.card.length).toBeLessThanOrEqual(7);
});

it('offers the model only real ids', () => {
  const schema = JSON.stringify(planJsonSchema(catalogue));
  expect(schema).toContain('"split-left"');
  expect(schema).toContain('"sizes"');
  expect(schema).not.toContain('mosaic-xl');
});
