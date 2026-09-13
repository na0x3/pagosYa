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
  expect(body.text.format.schema.required).toEqual(['concepts']);
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
