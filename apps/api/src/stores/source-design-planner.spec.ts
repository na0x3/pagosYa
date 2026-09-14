import { SourceDesignPlanner, type DesignPlanningAttempt } from './source-design-planner';
import { SourceRequestBudget } from './source-request-budget';
import { SOURCE_WEBSITE_REFERENCE_INSTRUCTIONS } from './source-website-reference';

const concepts = ['Menu', 'Window', 'Counter'].map(name => ({ name, premise: `${name} premise`, opening: `${name} opening`, flow: `${name} flow`, typography: 'Instrument', imagery: 'No photos', mobile: 'Keep order visible', layout: { sections: ['menu'], catalogSection: 'menu', standaloneIntro: false, productsInOpening: true } }));
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
  invalid[1].layout.sections.unshift('intro');
  const response = (value: unknown) => new Response(JSON.stringify({ status: 'completed', usage: { input_tokens: 1500, output_tokens: 1200 }, output: [{ content: [{ type: 'output_text', text: JSON.stringify(value) }] }] }));
  const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(response({ concepts: invalid })).mockResolvedValueOnce(response({ concepts }));
  const request = input();
  const result = await new SourceDesignPlanner().explore(request);
  expect(result.selected).toBe(2);
  expect(request.attempts.map(attempt => attempt.status)).toEqual(['FAILED', 'COMPLETED']);
  expect(JSON.parse(fetchMock.mock.calls[1][1]!.body as string).input[0].content[0].text).toContain('sections[0]=catalogSection');
});

it('stops after the single planning repair also fails', async () => {
  const fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({ status: 'completed', output: [{ content: [{ type: 'output_text', text: '{}' }] }] })));
  await expect(new SourceDesignPlanner().explore(input())).rejects.toThrow('tres composiciones');
  expect(fetchMock).toHaveBeenCalledTimes(2);
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
