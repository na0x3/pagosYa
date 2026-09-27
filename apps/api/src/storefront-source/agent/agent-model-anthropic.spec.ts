import { SourceRequestBudget } from '../source-request-budget';
import { anthropicAgentModel, anthropicMessages } from './agent-model-anthropic';

describe('Claude as the agent model', () => {
  it('turns the agent transcript into alternating Claude messages with tool use, tool results and images', () => {
    const messages = anthropicMessages([
      { role: 'user', content: [{ type: 'input_text', text: 'pedido' }, { type: 'input_image', image_url: 'data:image/jpeg;base64,QUJD' }] },
      { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Voy a mirar.' }] },
      { type: 'function_call', call_id: 't1', name: 'screenshot', arguments: '{"width":1280}' },
      { type: 'function_call_output', call_id: 't1', output: 'captura adjunta' },
      { role: 'user', content: [{ type: 'input_image', image_url: 'data:image/jpeg;base64,REVG', detail: 'auto' }] },
    ]);
    expect(messages).toEqual([
      { role: 'user', content: [{ type: 'text', text: 'pedido' }, { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'QUJD' } }] },
      { role: 'assistant', content: [{ type: 'text', text: 'Voy a mirar.' }, { type: 'tool_use', id: 't1', name: 'screenshot', input: { width: 1280 } }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: 'captura adjunta' }, { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'REVG' } }] },
    ]);
  });

  it('sends the tools and a cached system prompt, maps tool use to calls and usage to the shared shape', async () => {
    const fetchImpl = jest.fn(async () => new Response(JSON.stringify({
      stop_reason: 'tool_use',
      content: [{ type: 'text', text: 'Edito la portada.' }, { type: 'tool_use', id: 'toolu_1', name: 'edit_file', input: { path: 'components/home.tsx', search: 'a', replacement: 'b' } }],
      usage: { input_tokens: 200, cache_read_input_tokens: 3000, cache_creation_input_tokens: 500, output_tokens: 90 },
    })));
    const onTurn = jest.fn();
    const model = anthropicAgentModel({ endpoint: 'https://api.anthropic.com/v1/messages', apiKey: 'sk-ant', model: 'claude-sonnet-5', budget: new SourceRequestBudget(50), maxOutputTokens: 4000, onTurn, fetchImpl: fetchImpl as any });
    const turn = await model({ instructions: 'protocolo', transcript: [{ role: 'user', content: [{ type: 'input_text', text: 'pedido' }] }], tools: [{ type: 'function', name: 'edit_file', description: 'Edita', parameters: { type: 'object', properties: {} }, strict: true }] as any });
    expect(turn.calls).toEqual([{ name: 'edit_file', arguments: JSON.stringify({ path: 'components/home.tsx', search: 'a', replacement: 'b' }), callId: 'toolu_1' }]);
    expect(turn.text).toBe('Edito la portada.');
    const [url, init] = fetchImpl.mock.calls[0] as any;
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(init.headers).toMatchObject({ 'x-api-key': 'sk-ant', 'anthropic-version': '2023-06-01' });
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ model: 'claude-sonnet-5', tools: [{ name: 'edit_file', description: 'Edita', input_schema: { type: 'object', properties: {} } }] });
    expect(body.system).toEqual([{ type: 'text', text: 'protocolo', cache_control: { type: 'ephemeral' } }]);
    expect(body.messages.at(-1).content.at(-1).cache_control).toEqual({ type: 'ephemeral' });
    expect(body.max_tokens).toBeGreaterThan(0);
    expect(onTurn).toHaveBeenCalledWith(expect.objectContaining({ status: 'COMPLETED', body: expect.objectContaining({ usage: { input_tokens: 3700, output_tokens: 90, input_tokens_details: { cached_tokens: 3000, cache_write_tokens: 500 } } }) }));
  });

  it('fails in Spanish on a provider error and marks an exhausted credit limit as an agent limit', async () => {
    const failing = anthropicAgentModel({ endpoint: 'e', apiKey: 'k', model: 'claude-sonnet-5', budget: new SourceRequestBudget(50), maxOutputTokens: 2000, fetchImpl: (async () => new Response(JSON.stringify({ type: 'error', error: { message: 'overloaded' } }), { status: 529 })) as any });
    await expect(failing({ instructions: 'x', transcript: [], tools: [] as any })).rejects.toThrow('respondió 529');
    const broke = anthropicAgentModel({ endpoint: 'e', apiKey: 'k', model: 'claude-opus-5-5', budget: new SourceRequestBudget(1), maxOutputTokens: 2000, fetchImpl: jest.fn() as any });
    await expect(broke({ instructions: 'x'.repeat(40_000), transcript: [], tools: [] as any })).rejects.toMatchObject({ agentLimit: true });
  });
});
