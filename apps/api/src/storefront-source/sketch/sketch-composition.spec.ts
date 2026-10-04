import { applySketchComposition, compositionPrompt, SKETCH_COMPOSITION_SCHEMA } from './sketch-composition';
import { repairSketch } from './sketch-schema';

const ctx = { storeName: 'salv', purpose: 'shop' as const, photos: ['assets/a.jpg'] };
const base = () => repairSketch({ blocks: [
  { id: 'h1', type: 'hero', headline: 'Pan de verdad', sub: 'Todos los días', photo: 'assets/a.jpg' },
  { id: 's1', type: 'story', title: 'Quiénes somos', paragraphs: ['Uno', 'Dos'] },
] }, ctx).sketch;
const entry = (over: Record<string, unknown>) => ({ id: 'h1', free: [], extras: [], order: [], layout: [], ...over });

it('schema is strict and every property is required, as json_schema demands', () => {
  const item = (SKETCH_COMPOSITION_SCHEMA.properties.blocks as any).items;
  expect(item.additionalProperties).toBe(false);
  expect(item.required).toEqual(['id', 'free', 'extras', 'order', 'layout']);
  expect(item.properties.free.items.required).toEqual(['path', 'x', 'y', 'w', 'r']);
});

it('places a freed part at a real path and clamps it into the band', () => {
  const { sketch, touched } = applySketchComposition(base(), { blocks: [entry({ free: [{ path: 'copy/headline', x: 140, y: -20, w: 40, r: 0 }] })] }, ctx);
  expect(touched).toBe(1);
  expect(sketch.blocks.find(b => b.id === 'h1')!.free).toEqual({ 'copy/headline': { x: 100, y: 0, w: 40 } });
});

// Review Focus 2: sketchFreePos clamps any finite w to [5,100], so a raw 0 would render a 5%-wide sliver.
it('treats w: 0 as automatic width rather than a 5% sliver', () => {
  const { sketch } = applySketchComposition(base(), { blocks: [entry({ free: [{ path: 'copy/headline', x: 10, y: 10, w: 0, r: 0 }] })] }, ctx);
  expect(sketch.blocks.find(b => b.id === 'h1')!.free!['copy/headline']).toEqual({ x: 10, y: 10 });
});

// Review Focus 3: the model sees ids as strings and will eventually invent one.
it('ignores an entry for a block that does not exist', () => {
  const before = base();
  const { sketch, touched, notes } = applySketchComposition(before, { blocks: [entry({ id: 'nope' })] }, ctx);
  expect(touched).toBe(0);
  expect(sketch).toEqual(before);
  expect(notes.length).toBeGreaterThan(0);
});

// Review Focus 4: NEVER_FREE and freeShape already encode this; the merge must route through them.
it('refuses a spot on a protected part or an invented path', () => {
  const { sketch } = applySketchComposition(base(), { blocks: [entry({ free: [
    { path: 'media/photo', x: 10, y: 10, w: 0, r: 0 },
    { path: 'media/sticker', x: 20, y: 20, w: 0, r: 0 },
    { path: 'copy/invented', x: 30, y: 30, w: 0, r: 0 },
  ] })] }, ctx);
  expect(sketch.blocks.find(b => b.id === 'h1')).not.toHaveProperty('free');
});

it('keeps a valid inserted element and drops a kind it does not know', () => {
  const { sketch } = applySketchComposition(base(), { blocks: [entry({ extras: [
    { id: 'e1a', kind: 'emoji', value: '🥐', href: '', x: 80, y: 10, w: 8, r: 12 },
    { id: 'e2a', kind: 'hologram', value: 'x', href: '', x: 10, y: 10, w: 8, r: 0 },
  ] })] }, ctx);
  const extras = sketch.blocks.find(b => b.id === 'h1')!.extras!;
  expect(extras).toHaveLength(1);
  expect(extras[0]).toMatchObject({ kind: 'emoji', value: '🥐', r: 12 });
});

// Review Focus 2 again, for the other path: an inserted element's w: 0 must also mean automatic width.
// The free map and the extras list take different routes into repair, so one being right proves nothing about the other.
it('treats an inserted element w: 0 as automatic width too', () => {
  const { sketch } = applySketchComposition(base(), { blocks: [entry({ extras: [
    { id: 'e1a', kind: 'emoji', value: '🥐', href: '', x: 80, y: 10, w: 0, r: 0 },
  ] })] }, ctx);
  expect(sketch.blocks.find(b => b.id === 'h1')!.extras![0]).not.toHaveProperty('w');
});

it('folds the layout array back into the record repair expects, dropping unknown groups', () => {
  const { sketch } = applySketchComposition(base(), { blocks: [entry({ id: 's1', layout: [
    { group: 'copy', gap: 'l', dir: '', align: '', valign: 'center' },
    { group: 'nope', gap: 'l', dir: '', align: '', valign: '' },
  ] })] }, ctx);
  expect(sketch.blocks.find(b => b.id === 's1')!.layout).toEqual({ copy: { gap: 'l', valign: 'center' } });
});

it('reorders a copy column', () => {
  const { sketch } = applySketchComposition(base(), { blocks: [entry({ id: 's1', order: ['paragraphs', 'title'] })] }, ctx);
  expect(sketch.blocks.find(b => b.id === 's1')!.order).toEqual(['paragraphs', 'title']);
});

it('survives garbage without throwing', () => {
  for (const bad of [undefined, null, 'x', 42, { blocks: 'nope' }, { blocks: [null, 7] }]) {
    expect(() => applySketchComposition(base(), bad, ctx)).not.toThrow();
  }
});

it('prompt carries the real freeable paths and the energy line', () => {
  const prompt = compositionPrompt({ sketch: base(), energy: 'Energía maximalista: stickers en hero.' });
  expect(prompt).toContain('copy/headline');
  expect(prompt).toContain('maximalista');
  // A path the tree does not contain must never be advertised.
  expect(prompt).not.toContain('copy/invented');
});

/* Dosage (2026-10-04). A real generation freed 42 parts across 10 of 13 blocks: containers lost every in-flow
 * child, so sections collapsed to their padding and the absolute parts piled on each other. Measured on the
 * owner's store: aviso sectionH=19px with 3 freed parts spilling out, pasos 9 overlapping pairs. */
const wide = () => repairSketch({ blocks: [
  { id: 'h1', type: 'hero', headline: 'Pan de verdad', sub: 'Todos los días', photo: 'assets/a.jpg', cta: 'Comprar', cta2: 'Ver', badge: 'Nuevo', trust: 'Envío gratis' },
  { id: 'a1', type: 'announce', left: 'Izquierda', right: 'Derecha' },
  { id: 'a2', type: 'announce', left: 'Izquierda', right: 'Derecha' },
  { id: 'a3', type: 'announce', left: 'Izquierda', right: 'Derecha' },
  { id: 'a4', type: 'announce', left: 'Izquierda', right: 'Derecha' },
] }, ctx).sketch;
const spot = (path: string) => ({ path, x: 20, y: 30, w: 0, r: 0 });
const freeOf = (sketch: ReturnType<typeof wide>, id: string) => sketch.blocks.find(b => b.id === id)!.free;

it('keeps a block to two freed parts, in the order the model asked for them', () => {
  const { sketch } = applySketchComposition(wide(), { blocks: [entry({ id: 'h1', free: [
    spot('copy/headline'), spot('copy/sub'), spot('copy/trust'), spot('copy/badge'),
  ] })] }, ctx);
  expect(Object.keys(freeOf(sketch, 'h1')!)).toEqual(['copy/headline', 'copy/sub']);
});

it('frees parts in at most three blocks, so a page keeps bands that behave', () => {
  const { sketch } = applySketchComposition(wide(), { blocks: ['a1', 'a2', 'a3', 'a4'].map(id => entry({ id, free: [spot('row/left')] })) }, ctx);
  expect(['a1', 'a2', 'a3', 'a4'].filter(id => freeOf(sketch, id)).length).toBe(3);
});

// The collapse itself: `row` holds exactly two freeable parts, so freeing both leaves nothing in the flow and the
// band shrinks to its padding — which is how the owner's announce bar ended up 19px tall with its text outside it.
it('never frees every part of a container, so the band keeps its height', () => {
  const { sketch } = applySketchComposition(wide(), { blocks: [entry({ id: 'a1', free: [spot('row/left'), spot('row/right')] })] }, ctx);
  expect(Object.keys(freeOf(sketch, 'a1')!)).toEqual(['row/left']);
});

it('asks the model for restraint rather than relying only on the clamp', () => {
  const prompt = compositionPrompt({ sketch: wide(), energy: 'Energía calma.' });
  expect(prompt).toMatch(/2 partes|dos partes/);
  expect(prompt).toMatch(/3 bloques|tres bloques/);
});

