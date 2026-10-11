import { SourceDesignPlanner, type DesignPlanningAttempt } from './source-design-planner';
import { SourceRequestBudget } from './source-request-budget';
import { SOURCE_WEBSITE_REFERENCE_INSTRUCTIONS } from './source-website-reference';
import { SOURCE_DNA_DIRECTION, SOURCE_DNA_SCHEMA } from './source-dna';
import { validDna } from './fixtures/dna';
import { SOURCE_SIGNATURE_PLANNING } from './source-signature';
import { SOURCE_CONCEPT_ENERGY_DIRECTION } from './source-design';

const concepts = ['Menu', 'Window', 'Counter'].map(name => ({ name, premise: `${name} premise`, opening: `${name} opening`, flow: `${name} flow`, typography: 'Instrument', imagery: 'No photos', mobile: 'Keep order visible',
  composition: { family: 'menu-led', rationale: 'The cafe needs a clear menu for quick ordering.', pages: [{ page: 'index.html', purpose: 'shopping', rationale: 'Choose from the real menu.', sections: [{ id: 'menu', intent: 'Choose products and order.', layout: 'product-grid', geometry: 'grid', media: [], mobile: 'grid', primaryAction: 'Order' }] }] },
  layout: { sections: ['menu'], catalogSection: 'menu', standaloneIntro: false, productsInOpening: true },
  story: { promise: `${name} promise`, eyebrow: 'Hecho cerca', headline: `${name} para compartir hoy`, support: 'Una selección breve y clara para elegir con confianza.', primaryAction: 'Ver menú', beats: [{ section: 'menu', role: 'offer', headline: `${name} del día`, media: 'product' }] },
  motion: { mode: 'subtle', scrollFeel: 'soft', entrance: 'none', scenes: [{ section: 'menu', kind: 'sequence', intensity: 1 }] },
}));
const input = () => ({ model: 'gpt-5.6-terra' as const, provider: { name: 'OpenAI', endpoint: 'https://api.openai.com/v1/responses' }, apiKey: 'test-key', selected: 2, context: 'Synthetic cafe', images: [], budget: new SourceRequestBudget(25), signal: new AbortController().signal, attempts: [] as DesignPlanningAttempt[] });
afterEach(() => jest.restoreAllMocks());

it('keeps selection out of exploration and accounts for the planning call in the shared budget', async () => {
  const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ status: 'completed', usage: { input_tokens: 1500, output_tokens: 1200 }, output: [{ content: [{ type: 'output_text', text: JSON.stringify({ concepts, selected: 0 }) }] }] })));
  const request = input();
  const result = await new SourceDesignPlanner().explore(request);
  expect(result.selected).toBe(2);
  const body = JSON.parse(fetchMock.mock.calls[0][1]!.body as string);
  expect(body.text.format.schema.required).toEqual(['concepts', 'selection']);
  expect(body.input[0].content[0].text).not.toContain('Use concept index');
  expect(body.input[0].content[0].text).toContain(SOURCE_WEBSITE_REFERENCE_INSTRUCTIONS);
  expect(request.attempts[0]).toMatchObject({ phase: 'design', status: 'COMPLETED', usage: { inputTokens: 1500, outputTokens: 1200 } });
  expect(request.budget.reserve('gpt-5.6-terra', 1000, 12000).outputTokens).toBeGreaterThan(2000);
});

it('does not accept truncated concepts or hide the cost of a failed planning response', async () => {
  jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ status: 'incomplete', usage: { input_tokens: 1500, output_tokens: 3000 }, output: [] })));
  const request = input();
  await expect(new SourceDesignPlanner().explore(request)).rejects.toThrow('exploración visual');
  expect(request.attempts[0]).toMatchObject({ phase: 'design', status: 'FAILED', usage: { outputTokens: 3000 } });
});

it('repairs an inconsistent completed plan once with an actionable layout diagnostic', async () => {
  const invalid = structuredClone(concepts);
  invalid[1].layout.catalogSection = 'missing';
  const response = (value: unknown) => new Response(JSON.stringify({ status: 'completed', usage: { input_tokens: 1500, output_tokens: 1200 }, output: [{ content: [{ type: 'output_text', text: JSON.stringify(value) }] }] }));
  const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(response({ concepts: invalid })).mockResolvedValueOnce(response({ concepts }));
  const request = input();
  const result = await new SourceDesignPlanner().explore(request);
  expect(result.selected).toBe(2);
  expect(request.attempts.map(attempt => attempt.status)).toEqual(['FAILED', 'COMPLETED']);
  expect(JSON.parse(fetchMock.mock.calls[1][1]!.body as string).input[0].content[1].text).toContain('catalogSection incluido');
});

it('accepts an intro planned before the catalog without spending a repair on the flag', async () => {
  const intro = structuredClone(concepts);
  intro[1].layout.sections.unshift('intro');
  intro[1].composition.pages[0].sections.unshift({ ...intro[1].composition.pages[0].sections[0], id: 'intro', layout: 'campaign', geometry: 'fullbleed' });
  intro[1].story.beats.unshift({ section: 'intro', role: 'opening', headline: 'Una ventana al oficio', media: 'hero' });
  const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({ status: 'completed', usage: { input_tokens: 1500, output_tokens: 1200 }, output: [{ content: [{ type: 'output_text', text: JSON.stringify({ concepts: intro }) }] }] })));
  const request = input();
  const result = await new SourceDesignPlanner().explore(request);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(request.attempts.map(attempt => attempt.status)).toEqual(['COMPLETED']);
  expect(result.concepts[1].layout).toEqual(expect.objectContaining({ standaloneIntro: true }));
});

it('stops after the single planning repair also fails', async () => {
  const fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({ status: 'completed', output: [{ content: [{ type: 'output_text', text: '{}' }] }] })));
  const request = input();
  const failure = new SourceDesignPlanner().explore(request);
  await expect(failure).rejects.toThrow('YAPI no logró armar una propuesta de diseño válida');
  await expect(failure).rejects.not.toThrow(/concepts\[|catalogSection|standaloneIntro/);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  // The technical diagnostic is still recorded for support and for the repair prompt.
  expect(request.attempts.at(-1)!.failureReason).toContain('tres composiciones');
});

function planningResponse(selection: unknown) {
  return new Response(JSON.stringify({ status: 'completed', output: [{ content: [{ type: 'output_text', text: JSON.stringify({ concepts, selection }) }] }] }));
}
it('chooses the planner best fit when no explicit index is supplied and records its reason', async () => {
  jest.spyOn(globalThis, 'fetch').mockResolvedValue(planningResponse({ index: 1, rationale: 'The supplied photos support the image-led window.' }));
  const request = { ...input(), selected: undefined };
  const design = await new SourceDesignPlanner().explore(request);
  expect(design).toMatchObject({ selected: 1, selection: { source: 'planner', rationale: 'The supplied photos support the image-led window.' } });
  expect(request.attempts[0]).toMatchObject({ selectedIndex: 1, selectionSource: 'planner' });
});
it('does not attach the planner rationale to a different forced choice', async () => {
  jest.spyOn(globalThis, 'fetch').mockResolvedValue(planningResponse({ index: 0, rationale: 'Fits the catalog.' }));
  expect(await new SourceDesignPlanner().explore(input())).toMatchObject({ selected: 2, selection: { source: 'forced', rationale: null } });
});
it('repairs an invalid selected index once', async () => {
  const mock = jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(planningResponse({ index: 3, rationale: 'Invalid.' })).mockResolvedValueOnce(planningResponse({ index: 0, rationale: 'Fits the catalog.' }));
  expect((await new SourceDesignPlanner().explore({ ...input(), selected: undefined })).selected).toBe(0);
  expect(mock).toHaveBeenCalledTimes(2);
});
it('drops malformed rationale without spending another provider call', async () => {
  const mock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(planningResponse({ index: 1, rationale: 'x'.repeat(500) }));
  expect((await new SourceDesignPlanner().explore({ ...input(), selected: undefined })).selection?.rationale).toBeNull();
  expect(mock).toHaveBeenCalledTimes(1);
});

it('supports a layout-only control arm without exposing story or motion fields', async () => {
  const layoutOnly = concepts.map(({ story: _story, motion: _motion, ...concept }) => concept);
  const mock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ status: 'completed', output: [{ content: [{ type: 'output_text', text: JSON.stringify({ concepts: layoutOnly, selection: { index: 1, rationale: 'Fits the catalog.' } }) }] }] })));
  const result = await new SourceDesignPlanner().explore({ ...input(), selected: undefined, narrative: false });
  const schema = JSON.parse(mock.mock.calls[0][1]!.body as string).text.format.schema.properties.concepts.items;
  expect(schema.required).toContain('layout');
  expect(schema.required).not.toContain('story');
  expect(schema.properties).not.toHaveProperty('motion');
  expect(result.concepts[1]).not.toHaveProperty('story');
  expect(result.selected).toBe(1);
});

it('asks for a DNA per concept in both arms, with room for it in the output budget', async () => {
  const reserve = jest.spyOn(SourceRequestBudget.prototype, 'reserve');
  const mock = jest.spyOn(globalThis, 'fetch').mockImplementation(async () => planningResponse({ index: 1, rationale: 'Fits.' }));
  await new SourceDesignPlanner().explore({ ...input(), selected: undefined });
  await new SourceDesignPlanner().explore({ ...input(), selected: undefined, narrative: false });
  for (const call of mock.mock.calls) {
    const body = JSON.parse(call[1]!.body as string);
    const items = body.text.format.schema.properties.concepts.items;
    expect(items.required).toContain('dna');
    expect(items.properties.dna).toEqual(SOURCE_DNA_SCHEMA);
    expect(body.input[0].content[0].text).toContain(SOURCE_DNA_DIRECTION);
  }
  expect(reserve.mock.calls.map(call => call[2])).toEqual([7200, 7200]);
});

it('repairs an invalid DNA in code instead of spending the paid retry', async () => {
  const withDna = concepts.map(concept => ({ ...concept, dna: { ...validDna(), buttons: { form: 'sparkle', hover: 'lift', press: 'pop' } } }));
  const mock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ status: 'completed', output: [{ content: [{ type: 'output_text', text: JSON.stringify({ concepts: withDna, selection: { index: 1, rationale: 'Fits.' } }) }] }] })));
  const repairs: string[] = [];
  const result = await new SourceDesignPlanner().explore({ ...input(), selected: undefined, dnaSeed: 'store-1', repairs });
  expect(mock).toHaveBeenCalledTimes(1);
  expect(result.concepts[1].dna!.buttons.form).not.toBe('sparkle');
  expect(repairs).toEqual(expect.arrayContaining([expect.stringContaining('concepts[1].dna.buttons.form')]));
});

it('requires composition plans in new output while allowing one bounded repair', async () => {
  const missing = concepts.map(({ composition: _composition, ...concept }) => concept);
  const response = (items: unknown) => new Response(JSON.stringify({ status: 'completed', output: [{ content: [{ type: 'output_text', text: JSON.stringify({ concepts: items, selection: { index: 0, rationale: 'Fits.' } }) }] }] }));
  const mock = jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(response(missing)).mockResolvedValueOnce(response(concepts));
  expect((await new SourceDesignPlanner().explore(input())).concepts[0].composition).toBeDefined();
  expect(mock).toHaveBeenCalledTimes(2);
  expect(JSON.parse(mock.mock.calls[0][1]!.body as string).text.format.schema.properties.concepts.items.required).toContain('composition');
});


const completed = (value: unknown) => new Response(JSON.stringify({ status: 'completed', usage: { input_tokens: 1500, output_tokens: 1200 }, output: [{ content: [{ type: 'output_text', text: JSON.stringify(value) }] }] }));

describe('signature planning', () => {
  it('asks for a signature on each concept by default and keeps the one returned', async () => {
    const signature = { idea: 'El menú es un disco.', source: 'Noches de vinilo.', vocabulary: ['Cara A'], device: 'Un disco.', carries: ['menu', 'ghost'] };
    const withSignature = concepts.map(concept => ({ ...concept, signature }));
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(completed({ concepts: withSignature, selection: { index: 2, rationale: 'Cafetería con vinilos.' } }));
    const request = { ...input(), repairs: [] as string[] };
    const result = await new SourceDesignPlanner().explore(request);
    const body = JSON.parse(fetchMock.mock.calls[0][1]!.body as string);
    const item = body.text.format.schema.properties.concepts.items;
    expect(item.required).toContain('signature');
    expect(item.properties.signature.required).toEqual(['idea', 'source', 'vocabulary', 'device', 'carries']);
    expect(body.input[0].content[0].text).toContain(SOURCE_SIGNATURE_PLANNING);
    expect(result.concepts[2].signature!.carries).toEqual(['menu']);
    expect(request.repairs).toContain('concepts[2].signature.carries: kept 1 of 2 section IDs');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('sends exactly the previous schema and prompt when the switch is off', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(completed({ concepts, selection: { index: 2, rationale: 'x' } }));
    await new SourceDesignPlanner().explore({ ...input(), signature: false });
    const body = JSON.parse(fetchMock.mock.calls[0][1]!.body as string);
    const item = body.text.format.schema.properties.concepts.items;
    expect(item.required).not.toContain('signature');
    expect(item.properties).not.toHaveProperty('signature');
    expect(body.input[0].content[0].text).not.toContain('SIGNATURE.');
  });
  it('accepts a plan whose model omitted the signature without spending the repair', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(completed({ concepts, selection: { index: 2, rationale: 'x' } }));
    const result = await new SourceDesignPlanner().explore(input());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.concepts.some(concept => 'signature' in concept)).toBe(false);
  });
});

// Owner 2026-10-10: a pilates brief always came back "calm" because all three concepts were calm and the pick was the
// safest brief fit. One concept is now high-energy, and the pick favours the strongest identity unless calm is asked for.
it('asks for one high-energy concept and picks the strongest identity unless the merchant asked for calm', async () => {
  const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ status: 'completed', usage: { input_tokens: 1500, output_tokens: 1200 }, output: [{ content: [{ type: 'output_text', text: JSON.stringify({ concepts, selection: { index: 1, rationale: 'x' } }) }] }] })));
  await new SourceDesignPlanner().explore(input()).catch(() => undefined);
  const text = JSON.parse(fetchMock.mock.calls[0][1]!.body as string).input[0].content[0].text as string;
  expect(text).toContain(SOURCE_CONCEPT_ENERGY_DIRECTION);
  expect(SOURCE_CONCEPT_ENERGY_DIRECTION).toMatch(/snappy or playful/);
  expect(SOURCE_CONCEPT_ENERGY_DIRECTION).toMatch(/strongest, most memorable identity/);
  expect(SOURCE_CONCEPT_ENERGY_DIRECTION).toMatch(/calm, minimal or sober/);
  expect(text).not.toContain('This is a brief-fit judgment, not a rendered visual quality score.');
});

describe('style slots', () => {
  const styled = () => [...structuredClone(concepts), { ...structuredClone(concepts[0]), name: 'Studio', premise: 'Studio premise', opening: 'Studio opening', flow: 'Studio flow' }]
    .map((concept, slot) => ({ ...concept, cardName: `Estilo ${slot + 1}`, vibe: 'Una vibra clara.', inspiration: ['Uno', 'Dos', 'Tres'] }));
  const slots = (['calm', 'calm', 'bold', 'bold'] as const).map((mode, i) => ({ mode, direction: `CONCEPT ${i + 1} of 4 (${mode}` }));
  const reply = (value: unknown) => new Response(JSON.stringify({ status: 'completed', usage: { input_tokens: 1500, output_tokens: 1200 }, output: [{ content: [{ type: 'output_text', text: JSON.stringify(value) }] }] }));

  it('plans four style concepts from four slots and returns their cards', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(reply({ concepts: styled(), selection: { index: 2, rationale: 'Fits' } }));
    const result = await new SourceDesignPlanner().explore({ ...input(), selected: undefined, styleSlots: slots });
    const body = JSON.parse(fetchMock.mock.calls[0][1]!.body as string);
    expect(body.text.format.schema.properties.concepts.minItems).toBe(4);
    expect(body.text.format.schema.properties.selection.properties.index.maximum).toBe(3);
    const prompt = body.input[0].content[0].text as string;
    expect(prompt).toContain('Return exactly four fully developed concepts');
    expect(prompt).toContain('CONCEPT 3 of 4 (bold');
    expect(prompt).not.toContain(SOURCE_CONCEPT_ENERGY_DIRECTION);
    expect(result.concepts.map(c => c.card?.mode)).toEqual(['calm', 'calm', 'bold', 'bold']);
    expect(result.selected).toBe(2);
  });

  it('keeps the cards that validate instead of repairing a partly bad style plan', async () => {
    const value = styled();
    (value[1].layout as any).catalogSection = 'missing';
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(reply({ concepts: value, selection: { index: 0, rationale: 'r' } }));
    const result = await new SourceDesignPlanner().explore({ ...input(), selected: undefined, styleSlots: slots });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.concepts.map(c => c.card!.slot)).toEqual([0, 2, 3]);
  });

  it('keeps the three-concept prompt byte-identical without style slots', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(reply({ concepts, selection: { index: 2, rationale: 'r' } }));
    await new SourceDesignPlanner().explore(input());
    const prompt = JSON.parse(fetchMock.mock.calls[0][1]!.body as string).input[0].content[0].text as string;
    expect(prompt).toContain('Return exactly three fully developed concepts and NO source files. Develop all three concepts fully before choosing.');
    expect(prompt).toContain(SOURCE_CONCEPT_ENERGY_DIRECTION);
  });
});
