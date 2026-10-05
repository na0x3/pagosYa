import { assembleSketch, repairSketch, carryEditorFields } from '../sketch';
import { DESIGN_FIXTURES, generateDesignFixture } from './design-fixtures';
import { attachDesign, inferBrand, fallbackCreative, regenerateSketch, validateDesign, plannedStructure } from './design-engine';
import { websiteDesignSpecSchema, syncDesignSpec } from './design-document';
import { brandDirectionSchema, creativePlanSchema } from './design-schemas';
import { structuredOutputSchema } from './structured-output';
import { SKETCH_JSON_SCHEMA } from '../sketch/sketch-request';

const fixture = DESIGN_FIXTURES[0];
const ctx = { storeName: fixture.input.store.name, purpose: 'shop' as const, photos: fixture.input.assets.map(a => a.path) };

describe('Yapi structured design engine', () => {
  it('generates three distinct brand compositions through the existing assembler', () => {
    const sketches = DESIGN_FIXTURES.map(f => generateDesignFixture(f.input));
    for (const sketch of sketches) {
      expect(websiteDesignSpecSchema.safeParse(sketch.design).success).toBe(true);
      expect(sketch.blocks.filter(b => b.type === 'catalog')).toHaveLength(1);
      expect(sketch.blocks.at(-1)?.type).toBe('footer');
      expect(sketch.blocks.some(b => b.type === 'reviews')).toBe(false);
    }
    expect(new Set(sketches.map(s => s.design?.artDirection.style)).size).toBe(3);
    expect(new Set(sketches.map(s => s.fonts.display)).size).toBe(3);
    expect(new Set(sketches.map(s => s.blocks.map(b => `${b.type}/${b.composition}`).join('|'))).size).toBe(3);
    const files = assembleSketch(sketches[0], ctx);
    expect(files.find(f => f.path === 'components/home.tsx')?.content).toContain('data-skb-composition');
    expect(files.find(f => f.path === 'styles/globals.css')?.content).toContain('--yapi-display');
    expect(files.find(f => f.path === 'website-design.json')).toBeDefined();
  });
  it('reproduces an input and seed without nondeterministic default draws', () => {
    expect(generateDesignFixture(fixture.input)).toEqual(generateDesignFixture(fixture.input));
    const signatures = Array.from({ length: 12 }, (_, n) => fallbackCreative({ ...fixture.input, designSeed: `seed-${n}` }, inferBrand(fixture.input)));
    expect(new Set(signatures.map(p => JSON.stringify(p.sections))).size).toBeGreaterThan(3);
  });
  it('rejects invalid model brand, fonts and unregistered compositions', () => {
    expect(brandDirectionSchema.safeParse({ audience: 'everyone' }).success).toBe(false);
    const plan = fallbackCreative(fixture.input, inferBrand(fixture.input));
    expect(creativePlanSchema.safeParse({ ...plan, fonts: { display: 'evil', text: 'epilogue' } }).success).toBe(false);
    expect(creativePlanSchema.safeParse({ ...plan, sections: [{ type: 'hero', composition: 'arbitrary-react', intent: 'Hello' }] }).success).toBe(false);
    expect(structuredOutputSchema(SKETCH_JSON_SCHEMA).safeParse({ blocks: [] }).success).toBe(false);
  });
  it('keeps old bocetos compatible and drops invalid design metadata', () => {
    const old = repairSketch({ blocks: [{ id: 'h', type: 'hero', headline: 'Hola', cta: 'Ver' }] }, ctx).sketch;
    expect(old.design).toBeUndefined();
    const selected = structuredClone(old); selected.blocks[0].composition = 'poster';
    expect(assembleSketch(selected, ctx).find(file => file.path === 'styles/globals.css')?.content).toContain('data-skb-composition="poster"');
    expect(assembleSketch(old, ctx).some(f => f.path === 'website-design.json')).toBe(false);
    expect(repairSketch({ ...old, design: { schemaVersion: 99 } }, ctx).sketch.design).toBeUndefined();
  });
  it('projects merchant edits into tokens, pages and assignments with idempotent repair', () => {
    const sketch = generateDesignFixture(fixture.input);
    sketch.palette.accent = '#993311'; sketch.fonts.display = 'syne';
    const hero = sketch.blocks.find(b => b.type === 'hero')!;
    if (hero.type === 'hero') { hero.headline = 'Merchant authored copy'; hero.photo = ctx.photos[0]; }
    hero.composition = 'overlap'; hero.imageFit = 'contain'; hero.focalPoint = { x: 30, y: 70 };
    const repaired = repairSketch(sketch, ctx).sketch;
    expect(repaired.design?.theme.colors.primary).toBe('#993311');
    expect(repaired.design?.theme.typography.displayFont).toBe('syne');
    expect(repaired.design?.pages[0].sections.find(b => b.id === hero.id)?.content.headline).toBe('Merchant authored copy');
    expect(repaired.design?.assetAssignments.find(a => a.sectionId === hero.id)?.focalPoint).toEqual({ x: 30, y: 70 });
    expect(repairSketch(repaired, ctx).sketch).toEqual(repaired);
  });
  it('regenerates safely while retaining copy, images and live product references', () => {
    const sketch = generateDesignFixture(fixture.input), before = new Map(sketch.blocks.map(b => [b.id, b]));
    const next = regenerateSketch(sketch, ctx, 'new-seed');
    expect(next.design?.designSeed).toBe('new-seed');
    expect(next).toEqual(regenerateSketch(sketch, ctx, 'new-seed'));
    for (const b of next.blocks) { const previous = before.get(b.id)!; expect(b.productRefs).toEqual(previous.productRefs); if ('headline' in b && 'headline' in previous) expect(b.headline).toBe(previous.headline); if ('photo' in b && 'photo' in previous) expect(b.photo).toBe(previous.photo); }
    const hero = sketch.blocks.find(b => b.type === 'hero')!;
    const section = regenerateSketch(sketch, ctx, 'section-seed', hero.id);
    expect(section.blocks.filter(b => b.id !== hero.id)).toEqual(sketch.blocks.filter(b => b.id !== hero.id));
  });
  it('carries new layout fields through AI copy edits', () => {
    const sketch = generateDesignFixture(fixture.input);
    const edited = repairSketch({ ...sketch, blocks: sketch.blocks.map(({ composition, productRefs, imageFit, focalPoint, ...b }) => b) }, ctx).sketch;
    const blocks = carryEditorFields(sketch, edited);
    expect(blocks.find(b => b.type === 'hero')?.composition).toBe(sketch.blocks.find(b => b.type === 'hero')?.composition);
    expect(blocks.find(b => b.type === 'catalog')?.productRefs).toEqual(sketch.blocks.find(b => b.type === 'catalog')?.productRefs);
  });
  it('does not fabricate review sections or newsletter without enabled support', () => {
    const plan = fallbackCreative(fixture.input, inferBrand(fixture.input));
    plan.sections.push({ type: 'reviews', composition: 'quote', intent: 'Invented proof' });
    const structure = plannedStructure(plan, { products: 0, photos: 0, categories: 0, briefWords: 0, reviews: 40 }, 'shop', false);
    expect(structure.slots.some(s => s.type === 'reviews' || s.type === 'newsletter' || s.type === 'gallery')).toBe(false);
    expect(structure.slots.filter(s => s.type === 'catalog')).toHaveLength(1);
  });
  it('repairs empty actions and impossible immersive layouts without changing merchant edits', () => {
    const sketch = generateDesignFixture(fixture.input), hero = sketch.blocks.find(b => b.type === 'hero')!;
    if (hero.type === 'hero') { hero.cta = ''; delete hero.photo; hero.composition = 'immersive'; }
    const report = validateDesign(sketch, ctx, false);
    expect(report.sketch.blocks.find(b => b.id === hero.id)?.composition).toBe('immersive');
    const repaired = validateDesign(sketch, ctx);
    expect(repaired.quality.findings).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'empty-cta', repaired: true }), expect.objectContaining({ code: 'immersive-without-image', repaired: true })]));
  });
  it('bounds focal points and rejects CSS injection in persisted metadata', () => {
    const sketch = generateDesignFixture(fixture.input); sketch.blocks[0].focalPoint = { x: -300, y: 400 };
    const repaired = repairSketch(sketch, ctx).sketch;
    expect(repaired.blocks[0].focalPoint).toEqual({ x: 0, y: 100 });
    const unsafe = structuredClone(sketch.design!); unsafe.theme.typography.displayScale = NaN;
    expect(syncDesignSpec(unsafe, sketch, ctx)).toBeUndefined();
  });
});

it('binds only owned product ids selected by the design agent, retaining the live catalog', () => {
  const sketch = generateDesignFixture(fixture.input), brand = inferBrand(fixture.input), plan = fallbackCreative(fixture.input, brand);
  plan.sections.find(section => section.type === 'catalog')!.productRefs = ['absent-id'];
  const productId = (fixture.input.products[1] as { id: string }).id;
  plan.sections.find(section => section.type === 'catalog')!.productRefs!.push(productId);
  const composed = attachDesign(sketch, fixture.input, brand, plan, 'ai');
  expect(composed.blocks.find(b => b.type === 'catalog')?.productRefs).toEqual([productId]);
  expect(assembleSketch(composed, ctx).find(f => f.path === 'components/home.tsx')?.content).toContain('productIds=');
});
it('keeps deterministic brand defaults bounded for long merchant descriptions', () => {
  expect(inferBrand({ ...fixture.input, store: { ...fixture.input.store, description: 'A'.repeat(5000) } }).positioning).toHaveLength(500);
});
