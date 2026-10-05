import { completeStructuredFixture } from '../fixtures/structured-response';
import { SKETCH_JSON_SCHEMA, sketchPrompt, sketchEditPrompt, sketchFromResponse, sketchPhotoAllowlist } from './sketch-request';
import { catalogueDigest } from './sketch-catalogue-digest';
import { repairSketch } from './sketch-schema';
import { drawSketchDirection } from './sketch-direction';
import { drawPageStructure } from './sketch-structure-draw';
import { countSubstance } from './sketch-substance';
import { sectionCompositions } from '@pagosya/shared-types';

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
  for (const block of (SKETCH_JSON_SCHEMA.properties.blocks as any).items.anyOf) {
    expect(block.properties.composition.enum).toEqual(['auto', ...sectionCompositions(block.properties.type.enum[0])]);
  }
});

it('the prompt names the photos, catalog, instruction and real font ids', () => {
  const prompt = sketchPrompt({ storeName: 'salv', purpose: 'shop', instruction: 'quiero un sitio dulce y cálido', brief: { businessType: 'Repostería' }, photos: [{ path: 'assets/a.jpg', description: 'galletas' }], catalogue: catalogueDigest([{ name: 'Caja de rolls' }]), structure });
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
  const prompt = sketchPrompt({ storeName: 'salv', purpose: 'shop', instruction: 'x', brief: {}, photos: [], catalogue: catalogueDigest([]), direction: a, structure });
  expect(prompt).toContain('DIRECCIÓN CREATIVA');
  for (const line of a.lines) expect(prompt).toContain(line);
  // Sin dirección explícita, se sortea una: el prompt nunca sale sin dirección.
  expect(sketchPrompt({ storeName: 'salv', purpose: 'shop', instruction: 'x', brief: {}, photos: [], catalogue: catalogueDigest([]), structure })).toContain('DIRECCIÓN CREATIVA');
});

it('is total: null, garbage text and missing output all yield the usable default', () => {
  for (const body of [null, undefined, 42, {}, response('this is not json'), response('{"blocks": "nope"')]) {
    const { sketch } = sketchFromResponse(body, ctx);
    expect(sketch.blocks.some(b => b.type === 'catalog')).toBe(true);
    expect(sketch.blocks.at(-1)?.type).toBe('footer');
  }
});

it('a valid response round-trips through repair', () => {
  const { sketch } = sketchFromResponse(response(JSON.stringify(completeStructuredFixture({ blocks: [{ id: 'h', type: 'hero', headline: 'Algo dulce', photo: 'assets/a.jpg' }] }, SKETCH_JSON_SCHEMA))), ctx);
  const hero = sketch.blocks.find(b => b.type === 'hero') as { headline: string; photo?: string };
  expect(hero.headline).toBe('Algo dulce');
  expect(hero.photo).toBe('assets/a.jpg');
});

it('exposes whether the model reply parsed, for honest attempt records (F4)', () => {
  expect(sketchFromResponse(response('{"blocks": []}'), ctx).parsed).toBe(false);
  expect(sketchFromResponse(response(JSON.stringify(completeStructuredFixture({ blocks: [] }, SKETCH_JSON_SCHEMA))), ctx).parsed).toBe(true);
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
  const { sketch } = sketchFromResponse(response(JSON.stringify(completeStructuredFixture({ blocks: [{ id: 'h', type: 'hero', headline: 'Hola' }] }, SKETCH_JSON_SCHEMA))), ctx);
  const targeted = sketchEditPrompt({ sketch, instruction: 'haz el titular más juguetón', targetBlockId: 'h', photos: [{ path: 'assets/a.jpg' }], catalogue: catalogueDigest([]) });
  expect(targeted).toContain('"Hola"');
  expect(targeted).toContain('haz el titular más juguetón');
  expect(targeted).toContain('Edita únicamente el bloque h');
  const untargeted = sketchEditPrompt({ sketch, instruction: 'más color', photos: [], catalogue: catalogueDigest([]) });
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
    const prompt = sketchPrompt({ storeName: 'Pan', purpose: 'shop', instruction: 'x', brief: {}, photos: [], catalogue: catalogueDigest([]), structure });
    for (const control of ['align', 'flip', 'swap']) expect(prompt).toContain(control);
    // Width and size belong to the slots: asking the model to vary them is the free choice the skeleton replaces.
    expect(prompt).not.toMatch(/VARÍA el ancho|offset-left/);
  });
});

describe('the model is handed the page it must fill', () => {
  const aStructure = () => structure;
  const promptInput = () => ({ storeName: 'Pan', purpose: 'shop' as const, instruction: 'x', brief: {}, photos: [], catalogue: catalogueDigest([]) });
  it('lists every slot by id and forbids inventing bands', () => {
    const structure = aStructure();
    const prompt = sketchPrompt({ ...promptInput(), structure });
    for (const slot of structure.slots) expect(prompt).toContain(slot.id);
    expect(prompt).toMatch(/no inventes bandas/i);
  });
  it('chooses purposeful composition rather than forcing saturated section backgrounds', () => {
    const prompt = sketchPrompt({ ...promptInput(), structure: aStructure() });
    expect(prompt).not.toContain('COLOR DE VERDAD');
    expect(prompt).toContain('5–8 secciones fuertes');
    expect(prompt).toContain('hero.magazine-cover');
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

describe('the catalogue is the subject of the whole page', () => {
  const categories = [{ id: 'c1', name: 'Panadería' }, { id: 'c2', name: 'Dulces' }];
  const digest = catalogueDigest([
    { name: 'Pan de masa madre', amount: 4500, description: 'Fermentado 24 h', categoryId: 'c1', variants: [{ options: [{ name: 'Tamaño', value: 'Chica' }, ] }, { options: [{ name: 'Tamaño', value: 'Grande' }] }], highlights: [{ label: 'Sin aditivos' }] },
    { name: 'Torta de naranja', amount: 12000, description: 'Naranja y almendra', categoryId: 'c2', discountPercent: 10, stock: 0 },
  ], categories);
  const input = () => ({ storeName: 'Pan', purpose: 'shop' as const, instruction: 'x', brief: {}, photos: [], structure });

  it('puts real products, formatted prices, categories and options in the prompt, without reformatting', () => {
    const prompt = sketchPrompt({ ...input(), catalogue: digest });
    for (const fact of ['Pan de masa madre', 'Fermentado 24 h', 'Panadería', 'Dulces', '45.00 BOB', '120.00 BOB', 'Tamaño: Chica, Grande', 'Sin aditivos', '2 productos']) expect(prompt).toContain(fact);
    expect(prompt).not.toMatch(/4500|0\.45 BOB|4\.50 BOB/);
    expect(prompt).toMatch(/10%/);
    expect(prompt).toMatch(/agotado/i);
  });
  it('keeps the structure argument while swapping the catalogue', () => {
    const prompt = sketchPrompt({ ...input(), catalogue: digest });
    for (const slot of structure.slots) expect(prompt).toContain(slot.id);
  });
  it('no longer tells the model the catalogue belongs to one block', () => {
    expect(sketchPrompt({ ...input(), catalogue: digest })).not.toContain('el bloque catalog los muestra solo');
  });
  it('asks every prose band for something only this store could say and names the filler verbatim', () => {
    const prompt = sketchPrompt({ ...input(), catalogue: digest });
    expect(prompt).toMatch(/sólo esta tienda|solo esta tienda/i);
    for (const filler of ['calidad que se nota', 'hecho con amor', 'una selección pensada', 'objetos que conversan entre sí']) expect(prompt).toContain(`"${filler}"`);
  });
  it('tells an empty store to say less, not to invent a selection or reviews', () => {
    const prompt = sketchPrompt({ ...input(), catalogue: catalogueDigest([]) });
    expect(prompt).toMatch(/todavía no hay productos/i);
    expect(prompt).toMatch(/no inventes/i);
    expect(prompt).toMatch(/reseñas/i);
    expect(prompt).toMatch(/corta/i);
    expect(prompt).not.toContain('LO QUE ESTA TIENDA VENDE');
  });
  it('gives the chat edit the same facts, and an empty store nothing invented', () => {
    const sketch = sketchFromResponse(response('{}'), ctx).sketch;
    const edit = sketchEditPrompt({ sketch, instruction: 'x', photos: [], catalogue: digest });
    expect(edit).toContain('Fermentado 24 h');
    expect(edit).toContain('45.00 BOB');
    expect(sketchEditPrompt({ sketch, instruction: 'x', photos: [], catalogue: catalogueDigest([]) })).toMatch(/no hay productos/i);
  });
  it('says how many products there are when the sample is shorter than the catalogue', () => {
    const many = catalogueDigest(Array.from({ length: 30 }, (_, i) => ({ name: `P${i}`, amount: 100 })), [], 5);
    expect(sketchPrompt({ ...input(), catalogue: many })).toContain('30 productos');
  });
});

describe('the page grammar the model is told about', () => {
  const photos = [{ path: 'assets/a.jpg', description: 'Una foto.' }];
  const catalogue = catalogueDigest([], []);

  it('tells both prompts that new pages are impossible and how a card links', () => {
    const generate = sketchPrompt({ storeName: 'salv', purpose: 'shop', instruction: 'x', brief: {}, photos, catalogue, structure });
    const edit = sketchEditPrompt({ sketch: repairSketch({ blocks: [] }, { storeName: 'salv', purpose: 'shop', photos: [] }).sketch, instruction: 'llevame a otra pagina', photos, catalogue });
    for (const prompt of [generate, edit]) {
      expect(prompt).toContain('NO podés crear páginas nuevas');
      expect(prompt).toContain('collections[].href');
    }
  });

  it('offers href on a collection item in the structured-output schema', () => {
    const variants = (SKETCH_JSON_SCHEMA.properties.blocks.items as { anyOf: Array<Record<string, any>> }).anyOf;
    const collections = variants.find(v => v.properties?.type?.enum?.[0] === 'collections')!;
    const item = collections.properties.items.items;
    expect(Object.keys(item.properties)).toContain('href');
    // Strict structured output: every property must also be required, or the model may not emit it.
    expect(item.required).toContain('href');
  });
});
