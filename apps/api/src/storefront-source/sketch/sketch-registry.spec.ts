import { transformSync } from 'esbuild';
import { SKETCH_COMPONENT_REGISTRY, sketchNodeTree } from '@pagosya/shared-types';
import { AFTER_HOURS_FIXTURES, generateDesignFixture } from '../design-engine/design-fixtures';
import { validateNextSources, nextPageMarkup, nextProjectExport } from '../source-next';
import { sourceRuntimeDna } from '../source-dna';
import { repairSketch, sketchKitDna } from './sketch-schema';
import { renderBlock } from './sketch-blocks';
import { assembleSketch } from './sketch-assembler';
import { sketchImageRole } from './sketch-assets';
import { validateDesign } from '../design-engine/design-engine';

const fixture = AFTER_HOURS_FIXTURES[0];
const ctx = { storeName: 'AFTER HOURS', purpose: 'shop' as const, photos: fixture.input.assets.map(a => a.path) };
const expressive = SKETCH_COMPONENT_REGISTRY.filter(entry => entry.renderer !== 'legacy');
it.each(expressive.map(entry => [entry.id, entry] as const))('%s emits valid fixed JSX with editable markers', (_id, entry) => {
  const sketch = generateDesignFixture(fixture.input, fixture.plan);
  const block = repairSketch({ blocks: [{ id: 'subject', type: entry.type, composition: entry.variant,
    headline: 'Coffee, records, culture', title: 'Coffee, records, culture', paragraphs: ['Coffee and records.'],
    photo: 'assets/scene-1.webp', photos: ['assets/scene-2.webp', 'assets/scene-3.webp'], cta: 'Explore',
    items: [{ title: 'Coffee', text: 'Explore coffee', photo: 'assets/scene-4.webp' }],
  }] }, ctx).sketch.blocks.find(b => b.id === 'subject')!;
  const markup = renderBlock(block, sketch, ctx, { h1: entry.type === 'hero' });
  expect(() => transformSync(`export default function Page(){return <>${markup}</>}`, { loader: 'tsx' })).not.toThrow();
  expect(markup).toContain('data-skb={"subject"}');
  expect(markup).toContain(`data-skb-renderer="${entry.renderer}"`);
});
it('preserves text and media free positions inside a reusable Hero adapter without duplicating images', () => {
  const sketch = generateDesignFixture(fixture.input, fixture.plan);
  const hero = sketch.blocks.find(b => b.type === 'hero')!;
  hero.composition = 'editorial-split';
  hero.free = { 'copy/headline': { x: 10, y: 20 }, 'media/photo': { x: 60, y: 40 } };
  const markup = renderBlock(hero, sketch, ctx, { h1: true });
  expect(markup.match(/data-skb-photo=\{"photo"\}/g)).toHaveLength(1);
  expect(markup.match(/data-skb-free="on"/g)).toHaveLength(2);
  expect(markup).toContain('["--skb-fx" as string]: "60"');
  expect(markup).toContain('["--skb-fx" as string]: "10"');
});
it('retains the story chapter copy order and free positions inside component props', () => {
  const sketch = generateDesignFixture(fixture.input, fixture.plan);
  const story = sketch.blocks.find(b => b.type === 'story')!;
  story.composition = 'chapters'; story.order = ['paragraphs', 'title'];
  story.free = { 'copy/title': { x: 20, y: 10 }, 'copy/paragraphs/0': { x: 50, y: 50 } };
  const markup = renderBlock(story, sketch, ctx);
  expect(markup.indexOf('<StoryChapters')).toBeLessThan(markup.indexOf('<h2'));
  expect(markup.match(/data-skb-free="on"/g)).toHaveLength(2);
});
it('preserves the live catalog inspector flags and keeps a valid purchasing template when controls are hidden', () => {
  const sketch = generateDesignFixture(fixture.input, fixture.plan);
  const catalog = sketch.blocks.find(b => b.type === 'catalog')!;
  if (catalog.type === 'catalog') { catalog.cardDesc = false; catalog.cardAdd = false; }
  const markup = renderBlock(catalog, sketch, ctx);
  expect(markup).toContain('data-skb-card-desc={"off"}'); expect(markup).toContain('data-skb-card-add={"off"}');
  expect(markup).toContain('showDescription showAdd');
});
it('makes additional hero images selectable and reorderable through the existing node tree', () => {
  const hero = { id: 'h', type: 'hero', photo: 'a', photos: ['b', 'c'], headline: 'H', cta: 'Shop' };
  const nodes = JSON.stringify(sketchNodeTree(hero));
  expect(nodes).toContain('media/photos/0'); expect(nodes).toContain('media/photos/1');
});
it('keeps an additional image free position attached to its image when repair removes duplicates and unknown uploads', () => {
  const sketch = repairSketch({ blocks: [{ id: 'h', type: 'hero', photo: ctx.photos[0], photos: ['missing', ctx.photos[0], ctx.photos[1], ctx.photos[1], ctx.photos[2]],
    free: { 'media/photos/2': { x: 30, y: 40 }, 'media/photos/4': { x: 70, y: 60 } } }] }, ctx).sketch;
  const hero = sketch.blocks.find(b => b.id === 'h')!;
  expect(hero.free).toEqual({ 'media/photos/0': { x: 30, y: 40 }, 'media/photos/1': { x: 70, y: 60 } });
});
it('keeps hostile merchant copy as data in every adapter', () => {
  const hostile = '</p><template\n    <div className="skb-hero__media">{alert(1)}';
  for (const entry of expressive) {
    const context = { ...ctx, storeName: hostile };
    const sketch = repairSketch({ blocks: [{ id: 'subject', type: entry.type, composition: entry.variant, headline: hostile, title: hostile,
      paragraphs: [hostile], photo: ctx.photos[0], photos: ctx.photos.slice(1, 3), wordmark: 'giant', tagline: hostile }] }, context).sketch;
    const block = sketch.blocks.find(b => b.id === 'subject')!;
    expect(() => transformSync(`export default function Page(){return <>${renderBlock(block, sketch, context)}</>}`, { loader: 'tsx' })).not.toThrow();
  }
});
it('uses the existing canonical DNA for sketch and runtime and leaves legacy sketches opt-in', () => {
  const sketch = generateDesignFixture(AFTER_HOURS_FIXTURES[1].input, AFTER_HOURS_FIXTURES[1].plan);
  expect(sketch.dna?.layout.grammar).toBe('brutalist');
  expect(sketch.dna?.type.display).toBe(sketch.fonts.display);
  expect(sketchKitDna(sketch).grammar).toBe(sourceRuntimeDna(sketch.dna, 'same').grammar);
  expect(repairSketch({}, ctx).sketch.dna).toBeUndefined();
});
it('keeps full-bleed media full width even when the legacy skeleton alternates adjacent band widths', () => {
  const f = AFTER_HOURS_FIXTURES[2];
  const sketch = generateDesignFixture(f.input, f.plan);
  const gallery = sketch.blocks.find(b => b.type === 'gallery')!;
  expect(gallery.composition).toBe('full-bleed');
  expect(gallery.width).toBeUndefined();
  expect(repairSketch(sketch, ctx).sketch.blocks.find(b => b.id === gallery.id)?.width).toBeUndefined();
});
it('fills the gallery image prerequisites from unclaimed real assets after a one-image hero', () => {
  const sketch = generateDesignFixture(fixture.input, fixture.plan);
  const gallery = sketch.blocks.find(b => b.type === 'gallery')!;
  expect(gallery.composition).toBe('mosaic');
  if (gallery.type === 'gallery') expect(gallery.photos.length).toBeGreaterThanOrEqual(2);
  const hero = sketch.blocks.find(b => b.type === 'hero')!;
  if (hero.type === 'hero') expect(hero.photos).toEqual([]);
});
it('repairs a registered composition whose actual image slots do not satisfy the registry', () => {
  const sketch = repairSketch({ blocks: [{ id: 'h', type: 'hero', composition: 'floating-media', photo: ctx.photos[0], photos: [] },
    { id: 'g', type: 'gallery', composition: 'mosaic', photos: [ctx.photos[1]] }] }, ctx).sketch;
  expect(validateDesign(sketch, ctx, false).sketch.blocks.find(b => b.id === 'h')?.composition).toBe('floating-media');
  const fixed = validateDesign(sketch, ctx).sketch;
  expect(fixed.blocks.find(b => b.id === 'h')?.composition).toBe('editorial-split');
  expect(fixed.blocks.find(b => b.id === 'g')?.composition).toBe('full-bleed');
});
it('honors canonical button and catalog choices while keeping the existing button editor functional', () => {
  const sketch = generateDesignFixture(AFTER_HOURS_FIXTURES[2].input, AFTER_HOURS_FIXTURES[2].plan);
  expect(sketchKitDna(sketch).button).toBe(sketch.dna?.buttons.form);
  expect(sketchKitDna(sketch).card).toBe(sketch.dna?.surfaces.card);
  sketch.style.buttons = 'square';
  const edited = repairSketch(sketch, ctx).sketch;
  expect(edited.dna?.buttons.form).toBe('block');
  expect(sketchKitDna(edited).button).toBe('block');
});
it('keeps packshots and details distinct from lifestyle scenes', () => {
  expect(sketchImageRole({ role: 'product', description: 'A landscape image' })).toBe('product');
  expect(sketchImageRole({ role: 'detail' })).toBe('product-detail');
  expect(sketchImageRole({ role: 'lifestyle' })).toBe('hero-lifestyle');
  expect(sketchImageRole({ description: 'Portrait of the merchant' })).toBe('portrait');
  expect(sketchImageRole({ role: 'product', shot: 'detail' })).toBe('product-detail');
  expect(sketchImageRole({ role: 'product', shot: 'in-use' })).toBe('hero-lifestyle');
  expect(sketchImageRole({ role: 'logo', shot: 'scene' })).toBe('logo');
});
it.each(AFTER_HOURS_FIXTURES)('$id passes the existing production validator and includes the same UI library in export', f => {
  const sketch = generateDesignFixture(f.input, f.plan);
  const files = assembleSketch(sketch, ctx).filter(file => file.path !== 'sketch.json' && file.path !== 'website-design.json');
  expect(() => validateNextSources(files)).not.toThrow();
  expect(nextPageMarkup(files, 'home')).toContain('data-pagosya-catalog');
  const exported = nextProjectExport(files, f.id);
  expect(exported.find(file => file.path === 'lib/ui.tsx')?.content).toContain('data-presentation={presentation}');
});
it('makes the catalog h1 visible to the production validator when no hero content exists', () => {
  const sketch = repairSketch({ blocks: [{ id: 'c', type: 'catalog', composition: 'editorial-index', title: 'Coffee' }] }, ctx).sketch;
  const files = assembleSketch(sketch, ctx).filter(file => file.path !== 'sketch.json');
  expect(() => validateNextSources(files)).not.toThrow();
  expect(nextPageMarkup(files, 'home')).toContain('<h1');
});
