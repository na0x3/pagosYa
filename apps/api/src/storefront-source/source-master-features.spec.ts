import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildFeatures, eligibleFeatures, featureFacts, FEATURE_SWATCHES, rollFeatures } from './source-master-features';

/** John Smedley sections (spec 2026-10-21): which sections a store can have, the roll, and each section's data. */
const variant = (value: string, group = 'Color') => ({ id: value, name: value, amount: 1000, options: [{ name: group, value }] });
const item = (id: string, categoryId: string | null, imageUrls: string[], variants: any[] = []) => ({ id, name: id, categoryId, imageUrls, variants });
const data = (over: Record<string, unknown> = {}) => ({
  categories: [{ id: 'C1', name: 'Vestidos' }, { id: 'c2', name: 'Faldas' }, { id: 'c3', name: 'Vacía' }],
  items: [item('a', 'C1', ['https://x/a.jpg']), item('b', 'c2', ['https://x/b.jpg']), item('c', 'C1', ['https://x/c.jpg'])], ...over,
});
const photos = { hero: 'https://x/hero.jpg', story: 'https://x/story.jpg', p1: 'https://x/a.jpg', p2: 'https://x/b.jpg', p3: '', p4: '' };
const sixColours = ['Negro', 'Blanco', 'Rojo', 'Azul', 'Verde', 'Beige'].map(name => variant(name));

describe('featureFacts and eligibility', () => {
  it('reads lifestyle photos (hero excluded, each once), categories with products, products and mapped colours', () => {
    const facts = featureFacts(data({ items: [...data().items, item('d', 'c2', ['https://x/hero.jpg'], [...sixColours, variant('Fucsia'), variant('M', 'Talla')])] }), photos, 'La Paz');
    // The story photo goes last: the story section right beside these sections already shows it (final review 2026-10-21).
    expect(facts.lifestyle).toEqual(['https://x/a.jpg', 'https://x/b.jpg', 'https://x/story.jpg']);
    expect(facts.categories).toEqual([{ id: 'C1', name: 'Vestidos' }, { id: 'c2', name: 'Faldas' }]);
    expect(facts.productIds).toEqual(['a', 'b', 'c', 'd']);
    expect(facts.colours.map(c => c.name)).toEqual(['Negro', 'Blanco', 'Rojo', 'Azul', 'Verde', 'Beige']);
    expect(facts.colours[0]).toMatchObject({ group: 'color', value: 'negro', hex: '#292b29' });
  });
  it('each section needs what it shows; palette is fashion-only with 6+ colours', () => {
    const rich = featureFacts(data({ items: [...data().items, item('d', 'c2', [], sixColours)] }), photos, '');
    expect(eligibleFeatures(rich, true)).toEqual(['duo', 'explore', 'capsule', 'origin', 'palette']);
    expect(eligibleFeatures(rich, false)).toEqual(['duo', 'explore', 'capsule', 'origin']);
    const onePhoto = featureFacts(data({ categories: [{ id: 'C1', name: 'Vestidos' }], items: [item('a', 'C1', ['https://x/hero.jpg']), item('b', 'C1', [])] }), { ...photos, p1: '', p2: '' }, '');
    expect(eligibleFeatures(onePhoto, true)).toEqual(['capsule', 'origin']);
    const nothing = featureFacts({ categories: [], items: [] }, { hero: '', story: '' }, '');
    expect(eligibleFeatures(nothing, false)).toEqual([]);
  });
});

describe('rollFeatures', () => {
  const all = ['duo', 'explore', 'capsule', 'origin', 'palette'];
  it('picks 0, 1 or 2, the same for a seed, never two that would sit side by side', () => {
    const rolls = Array.from({ length: 80 }, (_, i) => rollFeatures({ seed: `s${i}`, eligible: all, fashion: false, exclude: [] }));
    expect(new Set(rolls.map(r => r.length))).toEqual(new Set([0, 1, 2]));
    expect(rollFeatures({ seed: 's1', eligible: all, fashion: false, exclude: [] })).toEqual(rollFeatures({ seed: 's1', eligible: all, fashion: false, exclude: [] }));
    for (const roll of rolls) for (const pair of [['explore', 'capsule'], ['explore', 'origin'], ['capsule', 'origin']]) expect(pair.every(id => roll.includes(id))).toBe(false);
    for (const roll of rolls) expect(roll.every(id => all.includes(id))).toBe(true);
  });
  it('only rolls what is eligible, and honours exclusions for at most half', () => {
    for (let i = 0; i < 30; i++) expect(rollFeatures({ seed: `e${i}`, eligible: ['origin'], fashion: false, exclude: [] }).every(id => id === 'origin')).toBe(true);
    const excluded = Array.from({ length: 60 }, (_, i) => rollFeatures({ seed: `x${i}`, eligible: ['duo', 'origin'], fashion: false, exclude: ['feature:origin'] })).flat();
    expect(excluded).not.toContain('origin');
    const tooMany = Array.from({ length: 60 }, (_, i) => rollFeatures({ seed: `y${i}`, eligible: ['duo', 'origin'], fashion: false, exclude: ['feature:origin', 'feature:duo'] })).flat();
    expect(tooMany.length).toBeGreaterThan(0);
  });
  it('fashion stores lead with duo, explore or palette', () => {
    const firsts = Array.from({ length: 80 }, (_, i) => rollFeatures({ seed: `f${i}`, eligible: all, fashion: true, exclude: [] })).filter(r => r.length).map(r => r[0]);
    expect(firsts.every(id => ['duo', 'explore', 'palette'].includes(id))).toBe(true);
  });
});

describe('buildFeatures', () => {
  const facts = featureFacts(data({ items: [...data().items, item('d', 'c2', [], sixColours)] }), photos, 'La Paz');
  const fallback = { productsTitle: 'Nuestros productos', storyTitle: 'Nuestra historia', subcopy: 'Prendas hechas a mano.' };
  it('duo: two photos, two categories, the fill words or the fallbacks', () => {
    const built = buildFeatures(['duo'], facts, { duoTitles: ['Novias', ''], duoCtas: ['', 'Ver faldas'] }, fallback) as any;
    expect(built.duo.halves).toEqual([
      { photo: 'https://x/a.jpg', title: 'Novias', cta: 'Ver ahora', href: 'productos.html?f_categoria=c1' },
      { photo: 'https://x/b.jpg', title: 'Faldas', cta: 'Ver faldas', href: 'productos.html?f_categoria=c2' },
    ]);
  });
  it('explore, capsule, origin and palette carry their data and never an empty text', () => {
    const built = buildFeatures(['explore', 'capsule', 'origin', 'palette'], facts, {}, fallback) as any;
    expect(built.explore.categories).toEqual([{ id: 'C1', name: 'Vestidos' }, { id: 'c2', name: 'Faldas' }]);
    expect(built.explore.colours).toHaveLength(6);
    expect(built.capsule).toMatchObject({ text: 'Prendas hechas a mano.', cta: 'Ver colección' });
    expect(built.capsule.products.length).toBeGreaterThanOrEqual(2);
    expect(built.capsule.products.length).toBeLessThanOrEqual(3);
    expect(built.origin).toMatchObject({ caption: 'Hecho en La Paz', link: 'Nuestra historia', href: '#historia' });
    expect(built.palette.intro).toBe('Elige por color');
    expect(built.palette.colours[0]).toEqual({ name: 'Negro', hex: '#292b29', href: 'productos.html?f_color=negro' });
    const photosUsed = [built.explore.photo, built.capsule.photo, built.origin.photo];
    expect(new Set(photosUsed).size).toBe(3);
  });
  it('without a city the origin caption is the story title; without colours explore has none', () => {
    const plain = featureFacts(data(), photos, '');
    const built = buildFeatures(['explore', 'origin'], plain, {}, fallback) as any;
    expect(built.origin.caption).toBe('Nuestra historia');
    expect(built.explore.colours).toEqual([]);
  });
  it('clips the fill words to their caps', () => {
    const built = buildFeatures(['duo', 'capsule'], facts, { duoTitles: ['x'.repeat(50), 'y'], duoCtas: ['z'.repeat(40), 'w'], capsuleText: 'p'.repeat(400) }, fallback) as any;
    expect(built.duo.halves[0].title).toHaveLength(28);
    expect(built.duo.halves[0].cta).toHaveLength(18);
    expect(built.capsule.text).toHaveLength(220);
  });
});

it('the swatch table is the kit\'s', () => {
  const kit = readFileSync(join(__dirname, '../../../../packages/storefront-kit/commerce-src/product/setup.js'), 'utf8');
  const table = Function(`return ${kit.match(/const swatchColors = (\{[^;]*\});/)![1]}`)();
  expect(FEATURE_SWATCHES).toEqual(table);
});

it('the same upload as a path and as a full URL counts once (final review 2026-10-21)', () => {
  const facts = featureFacts(data(), { hero: '', story: '/v1/uploads/aaaaaaaa-0000-0000-0000-000000000001.jpg', p1: 'https://api.test/v1/uploads/aaaaaaaa-0000-0000-0000-000000000001.jpg' }, '');
  expect(facts.lifestyle).toHaveLength(1);
});

it('the built sections keep the words they were given, so an edit can show them back (final review 2026-10-21)', () => {
  const facts = featureFacts(data(), photos, '');
  const built = buildFeatures(['duo'], facts, { duoTitles: ['Verano', ''] }, { productsTitle: 'P', storyTitle: 'S', subcopy: 'C' }) as any;
  expect(built.copy).toEqual({ duoTitles: ['Verano', ''] });
});

