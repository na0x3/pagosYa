import { checkPlan, validSource, type CatalogFacts } from './store-plan-checks';
import type { StorePlan } from './store-plan';

const base: StorePlan = { version: 1, parts: {}, sections: [], custom: [], colour: { palette: 'linen', from: '' }, fonts: { id: 'grotesk', why: '' }, brands: [], card: [], revision: 1 };
const facts: CatalogFacts = { productNames: ['Best Behavior Cereal', 'Bloom Clear', 'Bloom Pre', 'MAGNUS Recovery'], productCount: 4, photoCount: 6, categorySizes: [3, 1], colourProducts: 0, colourPhotoProducts: 0, sizeProducts: 0 };
const rolled = { hero: 'full', grid: 'grid3', closing: 'accent', card: 'plain', filters: 'bar', menu: 'none' };

it('a part without a real reason falls back to the dice', () => {
  const out = checkPlan({ ...base, parts: { hero: { id: 'type', why: 'se ve moderno' }, card: { id: 'framed', why: 'las fotos tienen fondos distintos y un marco las une' } } }, facts, rolled);
  expect(out.variants.hero).toBe('full');
  expect(out.variants.card).toBe('framed');
});

it('an accent needs a source; a custom colour without one stays on the ground', () => {
  expect(validSource('logo', 0)).toBe(true);
  expect(validSource('foto 5', 6)).toBe(true);
  expect(validSource('foto 9', 6)).toBe(false);
  expect(validSource('me gusta el naranja', 6)).toBe(false);
  const out = checkPlan({ ...base, colour: { palette: 'citrus', accent: '#ff00aa', from: 'energía' }, brands: ['Bloom', 'MAGNUS', 'Best Behavior'],
    custom: [{ kind: 'per-brand', why: '3 marcas', items: [{ name: 'Bloom', layout: 'stats', colourFrom: 'inventado' }, { name: 'MAGNUS', layout: 'numbered', colourFrom: 'foto 1' }] }] }, facts, rolled);
  expect(out.plan.colour.accent).toBeUndefined();
  expect(out.plan.custom[0].items[0].colourFrom).toBeUndefined();
  expect(out.plan.custom[0].items[1].colourFrom).toBe('foto 1');
});

it('taste rules: no giant feature grid over 4 products, no dark text band', () => {
  const big = { ...facts, productCount: 9 };
  const out = checkPlan({ ...base, parts: { grid: { id: 'feature', why: 'los productos estrella van grandes' }, closing: { id: 'dark', why: 'cierre fuerte con contraste alto' } } }, big, rolled);
  expect(out.variants.grid).toBe('grid4');
  expect(out.variants.closing).toBe('photo');
  expect(checkPlan({ ...base, parts: { closing: { id: 'dark', why: 'cierre fuerte con contraste alto' } } }, { ...facts, photoCount: 0 }, rolled).variants.closing).toBe('newsletter');
});

it('the catalog switches features on and says why', () => {
  const rich: CatalogFacts = { ...facts, productCount: 14, categorySizes: [5, 4, 5], colourProducts: 6, colourPhotoProducts: 4, sizeProducts: 3 };
  const out = checkPlan({ ...base, brands: ['Bloom', 'MAGNUS', 'Best Behavior', 'Inventada'] }, rich, rolled);
  expect(out.dna.card).toBe('swatch-swap');
  expect(out.variants.filters).toBe('sidebar');
  expect(out.variants.menu).toBe('dropdowns');
  expect(out.sections).toContain('sizes');
  expect(out.plan.brands).toEqual(['Bloom', 'MAGNUS', 'Best Behavior']);
  expect(out.plan.custom.some(s => s.kind === 'per-brand')).toBe(true);
  expect(out.plan.card.join(' ')).toMatch(/6 productos vienen en colores/);
});

it('a one-product store with no photos still checks clean', () => {
  const tiny: CatalogFacts = { productNames: ['Vela'], productCount: 1, photoCount: 0, categorySizes: [], colourProducts: 0, colourPhotoProducts: 0, sizeProducts: 0 };
  const out = checkPlan(base, tiny, rolled);
  expect(out.dna.card).toBeUndefined();
  expect(out.variants.menu).toBe('none');
  expect(out.variants.filters).toBe('bar');
  expect(out.plan.custom).toEqual([]);
});

describe('final review fixes (2026-10-22)', () => {
  it('F1: a logo or brand accent is never a model hex; «foto N» counts only photos the model was shown', () => {
    expect(checkPlan({ ...base, colour: { palette: 'citrus', accent: '#f26b1d', from: 'logo' } }, facts, rolled).plan.colour.accent).toBeUndefined();
    expect(checkPlan({ ...base, colour: { palette: 'citrus', accent: '#f26b1d', from: 'foto 2' } }, { ...facts, shownPhotos: 0 }, rolled).plan.colour.accent).toBeUndefined();
    expect(checkPlan({ ...base, colour: { palette: 'citrus', accent: '#f26b1d', from: 'foto 2' } }, { ...facts, shownPhotos: 3 }, rolled).plan.colour.accent).toBe('#f26b1d');
  });
  it('F3: sidebar filters only from 12 products; no photo groups or photo-first product page without photos', () => {
    const tiny: CatalogFacts = { productNames: ['Vela'], productCount: 1, photoCount: 0, categorySizes: [], colourProducts: 0, colourPhotoProducts: 0, sizeProducts: 0 };
    const out = checkPlan(base, tiny, { ...rolled, filters: 'sidebar', hero: 'collage', story: 'pair', pdp: 'stacked', menu: 'dropdowns' });
    expect(out.variants).toMatchObject({ filters: 'bar', menu: 'none' });
    expect(['collage', 'strip']).not.toContain(out.variants.hero);
    expect(out.variants.story).not.toBe('pair');
    expect(['stacked', 'editorial']).not.toContain(out.variants.pdp);
  });
  it('F3: a size guide the catalog needs is never cut by the section cap', () => {
    const plan = { ...base, sections: ['process', 'faq', 'gallery', 'journal'].map(id => ({ id, why: `motivo concreto para ${id} en esta tienda` })) };
    expect(checkPlan(plan, { ...facts, sizeProducts: 2 }, rolled).sections).toContain('sizes');
  });
});
