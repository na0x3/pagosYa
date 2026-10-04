import { SKETCH_JSON_SCHEMA, sketchPrompt, sketchEditPrompt, sketchFromResponse, sketchPhotoAllowlist } from './sketch-request';
import { drawSketchDirection } from './sketch-direction';
import { drawPageStructure } from './sketch-structure-draw';
import { countSubstance } from './sketch-substance';

const ctx = { storeName: 'salv', purpose: 'shop' as const, photos: ['assets/a.jpg'] };
const structure = drawPageStructure(countSubstance({ products: 6, photos: 4, brief: { businessType: 'Repostería' } }), () => 0.4);
const response = (text: string) => ({ status: 'completed', output: [{ content: [{ type: 'output_text', text }] }] });

it('the schema is a strict object with anyOf blocks', () => {
  expect(SKETCH_JSON_SCHEMA.type).toBe('object');
  expect(SKETCH_JSON_SCHEMA.additionalProperties).toBe(false);
  expect(Array.isArray((SKETCH_JSON_SCHEMA.properties.blocks as any).items.anyOf)).toBe(true);
  expect((SKETCH_JSON_SCHEMA.properties.blocks as any).items.anyOf).toHaveLength(14);
  // Tint backgrounds are offered to the model; editor-only fields (order, stickerPos, align) are not.
  const heroSchema = (SKETCH_JSON_SCHEMA.properties.blocks as any).items.anyOf.find((b: any) => b.properties.type.enum[0] === 'hero');
  expect(heroSchema.properties.bg.enum).toContain('tint-accent');
  expect(heroSchema.properties.order).toBeUndefined();
  expect(heroSchema.properties.stickerPos).toBeUndefined();
});

it('the prompt names the photos, catalog, instruction and real font ids', () => {
  const prompt = sketchPrompt({ storeName: 'salv', purpose: 'shop', instruction: 'quiero un sitio dulce y cálido', brief: { businessType: 'Repostería' }, photos: [{ path: 'assets/a.jpg', description: 'galletas' }], catalogNames: ['Caja de rolls'], structure });
  expect(prompt).toContain('assets/a.jpg');
  expect(prompt).toContain('galletas');
  expect(prompt).toContain('Caja de rolls');
  expect(prompt).toContain('quiero un sitio dulce y cálido');
  expect(prompt).toContain('anton');
});

it('every generation carries a creative direction, and different draws differ', () => {
  const a = drawSketchDirection(() => 0);
  const b = drawSketchDirection(() => 0.99);
  expect(a.name).not.toBe(b.name);
  expect(a.lines.join('\n')).not.toBe(b.lines.join('\n'));
  const prompt = sketchPrompt({ storeName: 'salv', purpose: 'shop', instruction: 'x', brief: {}, photos: [], catalogNames: [], direction: a, structure });
  expect(prompt).toContain('DIRECCIÓN CREATIVA');
  for (const line of a.lines) expect(prompt).toContain(line);
  // Sin dirección explícita, se sortea una: el prompt nunca sale sin dirección.
  expect(sketchPrompt({ storeName: 'salv', purpose: 'shop', instruction: 'x', brief: {}, photos: [], catalogNames: [], structure })).toContain('DIRECCIÓN CREATIVA');
});

it('is total: null, garbage text and missing output all yield the usable default', () => {
  for (const body of [null, undefined, 42, {}, response('this is not json'), response('{"blocks": "nope"')]) {
    const { sketch } = sketchFromResponse(body, ctx);
    expect(sketch.blocks.some(b => b.type === 'catalog')).toBe(true);
    expect(sketch.blocks.at(-1)?.type).toBe('footer');
  }
});

it('a valid response round-trips through repair', () => {
  const { sketch } = sketchFromResponse(response(JSON.stringify({ blocks: [{ id: 'h', type: 'hero', headline: 'Algo dulce', photo: 'assets/a.jpg' }] })), ctx);
  const hero = sketch.blocks.find(b => b.type === 'hero') as { headline: string; photo?: string };
  expect(hero.headline).toBe('Algo dulce');
  expect(hero.photo).toBe('assets/a.jpg');
});

it('exposes whether the model reply parsed, for honest attempt records (F4)', () => {
  expect(sketchFromResponse(response('{"blocks": []}'), ctx).parsed).toBe(true);
  expect(sketchFromResponse(response('not json'), ctx).parsed).toBe(false);
  expect(sketchFromResponse(null, ctx).parsed).toBe(false);
});

it('photo allowlist drops reference, unused and unknown roles (F3)', () => {
  const assets = [{ path: 'assets/a.jpg' }, { path: 'assets/b.jpg' }, { path: 'assets/c.webp' }, { path: 'assets/d.png' }, { path: 'assets/vid.mp4' }];
  const legend = [
    { original: 'u/a', path: 'assets/a.jpg' }, { original: 'u/b', path: 'assets/b.jpg' },
    { original: 'u/c', path: 'assets/c.webp' }, { original: 'u/d', path: 'assets/d.png' },
  ];
  const uses = [
    { url: 'u/a', role: 'product', description: 'galletas' },
    { url: 'u/b', role: 'reference', description: 'competidor' },
    { url: 'u/c', role: 'unused', description: '' },
  ] as any;
  const photos = sketchPhotoAllowlist(assets, legend, uses);
  expect(photos.map(p => p.path)).toEqual(['assets/a.jpg', 'assets/d.png']);
  expect(photos[0].description).toBe('galletas');
});

it('the edit prompt carries the current sketch, the instruction and an optional block target', () => {
  const { sketch } = sketchFromResponse(response(JSON.stringify({ blocks: [{ id: 'h', type: 'hero', headline: 'Hola' }] })), ctx);
  const targeted = sketchEditPrompt({ sketch, instruction: 'haz el titular más juguetón', targetBlockId: 'h', photos: [{ path: 'assets/a.jpg' }], catalogNames: [] });
  expect(targeted).toContain('"Hola"');
  expect(targeted).toContain('haz el titular más juguetón');
  expect(targeted).toContain('Edita únicamente el bloque h');
  const untargeted = sketchEditPrompt({ sketch, instruction: 'más color', photos: [], catalogNames: [] });
  expect(untargeted).not.toContain('Edita únicamente');
});

describe('layout controls reach the model', () => {
  const blockSchemas = () => (SKETCH_JSON_SCHEMA.properties.blocks as any).items.anyOf as any[];
  it('offers width, flip, align and swap on every block type, all required for strict mode', () => {
    for (const schema of blockSchemas()) {
      for (const field of ['width', 'flip', 'align', 'swap']) {
        expect(schema.properties).toHaveProperty(field);
        expect(schema.required).toContain(field);
      }
      expect(schema.properties.width.enum).toEqual(['bleed', 'wide', 'narrow', 'offset-left', 'offset-right']);
      expect(schema.additionalProperties).toBe(false);
    }
  });
  it('keeps the composition layer out, so a chat edit can never invent a node path', () => {
    for (const schema of blockSchemas()) {
      for (const field of ['free', 'extras', 'order', 'layout']) expect(schema.properties).not.toHaveProperty(field);
    }
  });
  it('tells the model what the controls are for', () => {
    const prompt = sketchPrompt({ storeName: 'Pan', purpose: 'shop', instruction: 'x', brief: {}, photos: [], catalogNames: [], structure });
    for (const control of ['align', 'flip', 'swap']) expect(prompt).toContain(control);
    // Width and size belong to the slots: asking the model to vary them is the free choice the skeleton replaces.
    expect(prompt).not.toMatch(/VARÍA el ancho|offset-left/);
  });
});

describe('the model is handed the page it must fill', () => {
  const aStructure = () => structure;
  const promptInput = () => ({ storeName: 'Pan', purpose: 'shop' as const, instruction: 'x', brief: {}, photos: [], catalogNames: [] });
  it('lists every slot by id and forbids inventing bands', () => {
    const structure = aStructure();
    const prompt = sketchPrompt({ ...promptInput(), structure });
    for (const slot of structure.slots) expect(prompt).toContain(slot.id);
    expect(prompt).toMatch(/no inventes bandas/i);
  });
  it('keeps the colour rule, which is about background and not structure', () => {
    expect(sketchPrompt({ ...promptInput(), structure: aStructure() })).toContain('COLOR DE VERDAD');
  });
  it('no longer carries a prose structure line', () => {
    const prompt = sketchPrompt({ ...promptInput(), structure: aStructure() });
    expect(prompt).not.toContain('Estructura revista');
    expect(prompt).not.toContain('Estructura póster');
    expect(drawSketchDirection(() => 0).lines.join('\n')).not.toContain('Estructura ');
  });
  it('gives no second opinion on length or size: the slots own both', () => {
    for (const draw of [0, 0.5, 0.99]) expect(drawSketchDirection(() => draw).lines.join('\n')).not.toMatch(/\d+-\d+ bloques|tamaños/);
  });
  it('forwards the structure so the response is bound to its slots', () => {
    const structure = aStructure();
    const { sketch } = sketchFromResponse(response(JSON.stringify({ blocks: [{ id: 'invented', type: 'banner', headline: 'x' }] })), ctx, { structure });
    expect(sketch.blocks.some(b => b.id === 'invented')).toBe(false);
    const slotIds = structure.slots.map(slot => slot.id);
    for (const block of sketch.blocks) expect(slotIds).toContain(block.id);
    expect(sketch.blocks.at(-1)?.type).toBe('footer');
  });
});
