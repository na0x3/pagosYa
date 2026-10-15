import { sep5Caller } from './source-sep5-call';
import { SourceRequestBudget } from './source-request-budget';
import type { SourceGenerationAttempt } from './source-generation-types';
import type { SourceModel } from './source-generation-policy';

const completed = () => new Response(JSON.stringify({ status: 'completed', output: [], usage: { input_tokens: 10, output_tokens: 10 } }));
const caller = (model: () => SourceModel, attempts: SourceGenerationAttempt[]) =>
  sep5Caller({ provider: { endpoint: 'https://provider.test/v1/responses' }, apiKey: 'k', budget: new SourceRequestBudget(500), model, signal: new AbortController().signal, attempts, storeId: 's1' });

describe('sep5Caller', () => {
  afterEach(() => jest.restoreAllMocks());

  it('reads the run model at each call, not when the caller is made (the repair may switch it before the chat touch)', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(async () => completed());
    let model: SourceModel = 'gpt-5.6-terra';
    const attempts: SourceGenerationAttempt[] = [];
    const { sep5Call } = caller(() => model, attempts);
    await sep5Call('author', 'hola', [], 'independent_storefront', {}, 5_000);
    model = 'gpt-5.6-sol';
    await sep5Call('touch', 'hola', [], 'storefront_kit_touch', {}, 5_000);
    expect(attempts.map(attempt => attempt.model)).toEqual(['gpt-5.6-terra', 'gpt-5.6-sol']);
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]!.body)).model).toBe('gpt-5.6-sol');
  });

  it("records into the attempts it is given (the review's), not the run's", async () => {
    jest.spyOn(globalThis, 'fetch').mockImplementation(async () => completed());
    const runAttempts: SourceGenerationAttempt[] = [], reviewAttempts: SourceGenerationAttempt[] = [];
    const { sep5Call } = caller(() => 'gpt-5.6-terra', runAttempts);
    const { attempt } = await sep5Call('review', 'hola', [], 'storefront_self_review', {}, 5_000, { attempts: reviewAttempts });
    expect(runAttempts).toEqual([]);
    expect(reviewAttempts).toEqual([attempt]);
    expect(attempt).toMatchObject({ phase: 'review', responseStatus: 'completed', status: 'FAILED' });
  });
});
