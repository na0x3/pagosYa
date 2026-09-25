import { SourceDesignPlanner, type DesignPlanningAttempt } from './source-design-planner';
import { SourceRequestBudget } from './source-request-budget';
import { SOURCE_WEBSITE_REFERENCE_INSTRUCTIONS } from './source-website-reference';
import { SOURCE_DNA_DIRECTION, SOURCE_DNA_SCHEMA } from './source-dna';
import { validDna } from './fixtures/dna';

const concepts = ['Menu', 'Window', 'Counter'].map(name => ({ name, premise: `${name} premise`, opening: `${name} opening`, flow: `${name} flow`, typography: 'Instrument', imagery: 'No photos', mobile: 'Keep order visible',
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
  expect(reserve.mock.calls.map(call => call[2])).toEqual([5600, 5600]);
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
