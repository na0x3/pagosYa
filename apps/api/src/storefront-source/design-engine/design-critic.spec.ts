import { applyDesignCritique, designCritiqueSchema } from './design-critic';
import { DESIGN_FIXTURES, generateDesignFixture } from './design-fixtures';
const fixture = DESIGN_FIXTURES[0];
const ctx = { storeName: fixture.input.store.name, purpose: 'shop' as const, photos: fixture.input.assets.map(a => a.path) };
const patch = (sectionId: string, composition = 'offset') => ({ sectionId, composition, width: 'wide', alignment: 'start', size: 'l', reason: 'Improve hierarchy' });
it('applies bounded layout patches without changing any content or product/image references', () => {
  const sketch = generateDesignFixture(fixture.input), hero = sketch.blocks.find(b => b.type === 'hero')!;
  const next = applyDesignCritique(sketch, { summary: 'Target the opening', patches: [patch(hero.id)] }, ctx);
  const changed = next.blocks.find(b => b.id === hero.id)!;
  expect(changed).toEqual({ ...hero, composition: 'offset', width: 'wide', align: 'start', size: 'l' });
  expect(next.blocks.filter(b => b.id !== hero.id)).toEqual(sketch.blocks.filter(b => b.id !== hero.id));
  expect(next.design?.generation.stages).toContain('critic');
});
it('ignores unknown ids and unregistered variants and rejects copy/code patches', () => {
  const sketch = generateDesignFixture(fixture.input), hero = sketch.blocks.find(b => b.type === 'hero')!;
  expect(applyDesignCritique(sketch, { summary: '', patches: [patch('absent'), patch(hero.id, 'arbitrary-code')] }, ctx).blocks).toEqual(sketch.blocks);
  const unsafe = { summary: '', patches: [{ ...patch(hero.id), headline: 'Invented certification' }] };
  expect(designCritiqueSchema.safeParse(unsafe).success).toBe(false);
  expect(applyDesignCritique(sketch, unsafe, ctx)).toBe(sketch);
  expect(designCritiqueSchema.safeParse({ summary: '', patches: Array.from({ length: 4 }, () => patch(hero.id)) }).success).toBe(false);
});
