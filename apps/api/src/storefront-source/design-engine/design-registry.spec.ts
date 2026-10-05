import { SECTION_COMPOSITIONS } from '@pagosya/shared-types';
import { SOURCE_SKETCH_COMPOSITIONS, sketchCompositionFit } from '../source-composition-registry';
import { compatibleCreativePlan, fallbackCreative, inferBrand } from './design-engine';
import { DESIGN_FIXTURES } from './design-fixtures';
import { creativeContext } from './design-prompts';
const input = DESIGN_FIXTURES[0].input;
it('describes every renderable composition with requirements, suitable contexts and a mobile fallback', () => {
  const keys = Object.entries(SECTION_COMPOSITIONS).flatMap(([type, variants]) => variants.map(variant => `${type}/${variant}`));
  expect(SOURCE_SKETCH_COMPOSITIONS.map(entry => `${entry.type}/${entry.variant}`).sort()).toEqual(keys.slice().sort());
  expect(keys).toHaveLength(68);
  expect(new Set(SOURCE_SKETCH_COMPOSITIONS.map(entry => entry.id)).size).toBe(keys.length);
  for (const entry of SOURCE_SKETCH_COMPOSITIONS) {
    expect(entry.purpose).toBeTruthy(); expect(entry.goodFor.styles.length).toBeGreaterThan(0);
    expect(entry.goodFor.verticals.length).toBeGreaterThan(0); expect(entry.worksWith.length).toBeGreaterThan(0);
    expect(entry.mobile).toBeTruthy(); expect(entry.primitive).toBeTruthy();
  }
});
it('rejects image-dependent layouts without suitable assets and oversized commerce for broad catalogs', () => {
  const context = { text: 'Premium home', catalogItems: 100, assets: [{ role: 'product' }], style: 'minimal' as const, density: 'airy' as const };
  for (const key of ['hero/immersive', 'gallery/collage', 'catalog/feature', 'reviews/quote', 'newsletter/center']) {
    const metadata = SOURCE_SKETCH_COMPOSITIONS.find(entry => `${entry.type}/${entry.variant}` === key)!;
    expect(sketchCompositionFit(metadata, context).eligible).toBe(false);
  }
  expect(sketchCompositionFit(SOURCE_SKETCH_COMPOSITIONS.find(entry => entry.type === 'catalog' && entry.variant === 'dense-grid')!, context).eligible).toBe(true);
});
it('normalizes valid model choices using merchant prerequisites rather than trusting layout ids alone', () => {
  const plan = fallbackCreative(input, inferBrand(input));
  plan.sections[0].composition = 'immersive';
  const catalog = plan.sections.find(section => section.type === 'catalog')!; catalog.composition = 'feature';
  const normalized = compatibleCreativePlan(plan, { ...input, assets: [{ path: 'assets/packshot.webp', role: 'product' }], products: Array(80).fill({ name: 'A real product' }) });
  expect(normalized.sections[0].composition).not.toBe('immersive');
  expect(normalized.sections.find(section => section.type === 'catalog')!.composition).not.toBe('feature');
  const prompt = JSON.parse(creativeContext({ request: input.prompt, assets: input.assets, catalog: { totals: { count: 3 } } }));
  expect(prompt.registry[0]).toHaveProperty('fit.eligible'); expect(prompt.ownedDirections.length).toBeGreaterThan(0);
  expect(prompt.registry[0]).toHaveProperty('avoidWhen');
});
