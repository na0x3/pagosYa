import { distinctBoldDisplay, distinctBoldDisplays, validateStyleDesign, styleConceptsSchema } from './source-style-design';
import { savedSourceDesign, sourceDesignSchema, SOURCE_DESIGN_FILE } from './source-design';
import { validDna } from './fixtures/dna';

const concept = (name: string) => ({ name, premise: `${name} premise`, opening: `${name} opening`, flow: `${name} flow`, typography: 'Instrument', imagery: 'No photos', mobile: 'Keep order visible',
  composition: { family: 'menu-led', rationale: 'The cafe needs a clear menu for quick ordering.', pages: [{ page: 'index.html', purpose: 'shopping', rationale: 'Choose from the real menu.', sections: [{ id: 'menu', intent: 'Choose products and order.', layout: 'product-grid', geometry: 'grid', media: [], mobile: 'grid', primaryAction: 'Order' }] }] },
  layout: { sections: ['menu'], catalogSection: 'menu', standaloneIntro: false, productsInOpening: true },
  story: { promise: `${name} promise`, eyebrow: '', headline: `${name} para compartir`, support: 'Una selección breve y clara.', primaryAction: 'Ver menú', beats: [{ section: 'menu', role: 'offer', headline: 'Menú', media: 'product' }] },
  motion: { mode: 'subtle', scrollFeel: 'soft', entrance: 'none', scenes: [] }, dna: validDna(),
  cardName: `${name} de barrio`, vibe: `${name} vibe paragraph.`, inspiration: ['El tostado de cada mañana', 'La esquina de la plaza', 'Tazas de cerámica local'] });
const four = () => ['Menu', 'Window', 'Counter', 'Studio'].map(concept);
const modes = ['calm', 'calm', 'bold', 'bold'] as Array<'calm' | 'bold'>;

it('keeps four valid concepts with their card, slot and mode', () => {
  const { design, dropped } = validateStyleDesign({ concepts: four(), selection: { index: 3, rationale: 'Fits the brief' } }, modes, { narrative: true });
  expect(dropped).toEqual([]);
  expect(design.concepts).toHaveLength(4);
  expect(design.concepts.map(c => c.card)).toEqual(four().map((c, slot) => ({ slot, mode: modes[slot], name: c.cardName, vibe: c.vibe, inspiration: c.inspiration })));
  expect(design.selected).toBe(3);
  expect(design.selection).toEqual({ source: 'planner', rationale: 'Fits the brief' });
});

it('drops an invalid concept, keeps the others and remaps the recommendation', () => {
  const value = four();
  (value[1].layout as any).catalogSection = 'missing';
  const { design, dropped } = validateStyleDesign({ concepts: value, selection: { index: 2, rationale: 'r' } }, modes, { narrative: true });
  expect(design.concepts.map(c => c.card!.slot)).toEqual([0, 2, 3]);
  expect(design.concepts[design.selected].card!.slot).toBe(2);
  expect(dropped[0]).toMatch(/concepts\[1\]/);
});

it('falls back to the first kept concept when the recommended one was dropped', () => {
  const value = four();
  (value[3] as any).cardName = '';
  expect(validateStyleDesign({ concepts: value, selection: { index: 3, rationale: 'r' } }, modes, { narrative: true }).design.selected).toBe(0);
});

it('drops a copied opening and throws when nothing is left', () => {
  const value = four();
  value[2].opening = value[0].opening;
  expect(validateStyleDesign({ concepts: value, selection: { index: 0, rationale: 'r' } }, modes, { narrative: true }).design.concepts).toHaveLength(3);
  expect(() => validateStyleDesign({ concepts: four().map(c => ({ ...c, cardName: '' })), selection: { index: 0, rationale: 'r' } }, modes, { narrative: true })).toThrow();
});

it('asks the model for exactly four concepts with card fields', () => {
  const schema = styleConceptsSchema(structuredClone(sourceDesignSchema.properties.concepts));
  expect([schema.minItems, schema.maxItems]).toEqual([4, 4]);
  expect(schema.items.required).toEqual(expect.arrayContaining(['cardName', 'vibe', 'inspiration']));
});

it('loads a saved design of two or four concepts, card included', () => {
  const { design } = validateStyleDesign({ concepts: four(), selection: { index: 1, rationale: 'r' } }, modes, { narrative: true });
  const saved = savedSourceDesign([{ path: SOURCE_DESIGN_FILE, content: JSON.stringify({ ...design, selected: 1, selection: { source: 'forced', rationale: null } }) }]);
  expect(saved?.concepts).toHaveLength(4);
  expect(saved?.concepts[1].card?.name).toBe('Window de barrio');
  const two = { ...design, concepts: design.concepts.slice(0, 2), selected: 1 };
  expect(savedSourceDesign([{ path: SOURCE_DESIGN_FILE, content: JSON.stringify(two) }])?.concepts).toHaveLength(2);
});

it('puts a lane\'s real slot on its card and maps the recommendation through it', () => {
  const { design } = validateStyleDesign({ concepts: [concept('Counter')], selection: { index: 0, rationale: 'r' } }, ['bold'], { narrative: true, slots: [2] });
  expect(design.concepts.map(c => [c.card!.slot, c.card!.mode])).toEqual([[2, 'bold']]);
  expect(design.selected).toBe(0);
  expect(design.selection?.rationale).toBe('r');
});

it('seeds DNA defaults by the real slot, like the four-concept plan', () => {
  const broken = { ...concept('Counter'), dna: undefined };
  const four = validateStyleDesign({ concepts: [concept('Menu'), concept('Window'), broken, concept('Studio')], selection: { index: 0, rationale: 'r' } }, modes, { narrative: true, seed: 'store-1' }).design;
  const lane = validateStyleDesign({ concepts: [broken], selection: { index: 0, rationale: 'r' } }, ['bold'], { narrative: true, seed: 'store-1', slots: [2] }).design;
  expect(lane.concepts[0].dna).toEqual(four.concepts[2].dna);
});

it('asks for as many concepts as there are lanes', () => {
  const schema = styleConceptsSchema(structuredClone(sourceDesignSchema.properties.concepts), 1);
  expect([schema.minItems, schema.maxItems]).toEqual([1, 1]);
});

it('moves a bold concept off a display font another bold concept already uses, to the first font no concept uses', () => {
  const { design } = validateStyleDesign({ concepts: four(), selection: { index: 0, rationale: 'r' } }, modes, { narrative: true });
  const [calm, , boldA, boldB] = design.concepts;
  expect(distinctBoldDisplay(boldB, [boldA]).dna!.type.display).toBe('bricolage');
  expect(distinctBoldDisplay(boldB, [calm])).toBe(boldB);
  expect(distinctBoldDisplay(calm, [boldA])).toBe(calm);
  expect(distinctBoldDisplays(design).concepts[3].dna!.type.display).toBe(distinctBoldDisplay(boldB, design.concepts.slice(0, 3)).dna!.type.display);
});
