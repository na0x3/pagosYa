import { SourceRequestBudget } from '../source-request-budget';
import { openAiAgentModel } from './agent-model';

const make = (fetchImpl: any, onTurn = jest.fn()) => ({ onTurn, model: openAiAgentModel({ endpoint: 'https://api.openai.com/v1/responses', apiKey: 'k', model: 'gpt-5.6-terra', providerName: 'OpenAI', budget: new SourceRequestBudget(50), maxOutputTokens: 4000, reasoningEffort: 'medium', onTurn, fetchImpl }) });

describe('openAiAgentModel', () => {
  it('marks an exhausted credit limit as an agent limit and sends the prompt cache key', async () => {
    const fetchImpl = jest.fn(async () => new Response(JSON.stringify({ status: 'completed', usage: { input_tokens: 10, output_tokens: 10 }, output: [] })));
    const cached = openAiAgentModel({ endpoint: 'e', apiKey: 'k', model: 'gpt-5.6-terra', providerName: 'OpenAI', budget: new SourceRequestBudget(50), maxOutputTokens: 2000, reasoningEffort: 'low', promptCacheKey: 'agent-key', fetchImpl: fetchImpl as any });
    await cached({ instructions: 'x', transcript: [], tools: [] as any });
    expect(JSON.parse((fetchImpl.mock.calls[0] as any)[1].body).prompt_cache_key).toBe('agent-key');
    const broke = openAiAgentModel({ endpoint: 'e', apiKey: 'k', model: 'gpt-5.6-sol', providerName: 'OpenAI', budget: new SourceRequestBudget(1), maxOutputTokens: 2000, reasoningEffort: 'low', fetchImpl: fetchImpl as any });
    await expect(broke({ instructions: 'x'.repeat(40_000), transcript: [], tools: [] as any })).rejects.toMatchObject({ agentLimit: true });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('sends the tools, maps function calls and reports the turn', async () => {
    const output = [
      { type: 'function_call', call_id: 'c1', name: 'read_file', arguments: '{"path":"components/home.tsx"}' },
      { type: 'message', content: [{ type: 'output_text', text: 'Leyendo la portada.' }] },
    ];
    const fetchImpl = jest.fn(async () => new Response(JSON.stringify({ status: 'completed', usage: { input_tokens: 1200, output_tokens: 80 }, output })));
    const { model, onTurn } = make(fetchImpl);
    const turn = await model({ instructions: 'protocolo', transcript: [], tools: [] as any });
    expect(turn.calls).toEqual([{ name: 'read_file', arguments: '{"path":"components/home.tsx"}', callId: 'c1' }]);
    expect(turn.text).toBe('Leyendo la portada.');
    expect(turn.output).toEqual(output);
    const body = JSON.parse((fetchImpl.mock.calls[0] as any)[1].body);
    expect(body).toMatchObject({ model: 'gpt-5.6-terra', tool_choice: 'auto', parallel_tool_calls: false, store: false, instructions: 'protocolo' });
    expect(body.max_output_tokens).toBeGreaterThan(0);
    // Unstored responses: reasoning items replayed on the next turn must carry their encrypted content.
    expect(body.include).toEqual(['reasoning.encrypted_content']);
    expect(onTurn).toHaveBeenCalledWith(expect.objectContaining({ status: 'COMPLETED', body: expect.objectContaining({ usage: { input_tokens: 1200, output_tokens: 80 } }) }));
  });
  it('throws a merchant-safe error on a provider failure and reports the failed turn', async () => {
    const { model, onTurn } = make(async () => new Response(JSON.stringify({ error: { message: 'x' } }), { status: 500 }));
    await expect(model({ instructions: 'x', transcript: [], tools: [] as any })).rejects.toThrow('respondió 500');
    expect(onTurn).toHaveBeenCalledWith(expect.objectContaining({ status: 'FAILED' }));
  });
  it('releases the reservation of a request the provider rejected, and names the provider error', async () => {
    // A rejected request is not billed; keeping its reservation turned two provider errors into a false credit limit.
    const fetchImpl = jest.fn(async () => new Response(JSON.stringify({ error: { code: 'rate_limit_exceeded', message: 'Rate limit reached' } }), { status: 429 }));
    const model = openAiAgentModel({ endpoint: 'e', apiKey: 'k', model: 'gpt-5.6-terra', providerName: 'OpenAI', budget: new SourceRequestBudget(10), maxOutputTokens: 4000, reasoningEffort: 'low', fetchImpl: fetchImpl as any });
    for (let index = 0; index < 3; index++) await expect(model({ instructions: 'x', transcript: [], tools: [] as any })).rejects.toThrow('respondió 429 (rate_limit_exceeded)');
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
  it('explains a network failure in Spanish with its cause, never the bare runtime message', async () => {
    const { model } = make(async () => { throw Object.assign(new TypeError('fetch failed'), { cause: Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' }) }); });
    await expect(model({ instructions: 'x', transcript: [], tools: [] as any })).rejects.toThrow('No se pudo contactar al proveedor de IA (ECONNRESET)');
  });
});
