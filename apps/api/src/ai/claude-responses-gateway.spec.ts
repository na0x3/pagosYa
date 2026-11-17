import { claudeRequest, responsesAnswer } from './claude-responses-gateway';
import { sourceResponseJson } from '../storefront-source/source-response';

describe('the chat on Claude (owner 2026-11-17 «i told you the gpt plan is not good»)', () => {
  it('turns an OpenAI-shaped chat call into a Claude call: instructions cached, parts, strict schema, effort and room to think', async () => {
    const request = await claudeRequest({
      model: 'gpt-5.6-luna', instructions: 'Eres YAPI.', reasoning: { effort: 'minimal' }, max_output_tokens: 2000,
      input: [{ role: 'developer', content: 'Responde en español.' }, { role: 'user', content: [{ type: 'input_text', text: 'Hola' }] }, { role: 'user', content: 'otra vez' }],
      text: { format: { type: 'json_schema', schema: { type: 'object', additionalProperties: false, required: ['reply'], properties: { reply: { type: 'string', maxLength: 40 } } } } },
    }, 'claude-sonnet-5-5') as any;
    expect(request.model).toBe('claude-sonnet-5-5');
    expect(request.system).toEqual([{ type: 'text', text: 'Eres YAPI.\n\nResponde en español.', cache_control: { type: 'ephemeral' } }]);
    expect(request.messages).toEqual([{ role: 'user', content: [{ type: 'text', text: 'Hola' }, { type: 'text', text: 'otra vez' }] }]);
    expect(request.output_config.effort).toBe('low');
    expect(request.output_config.format.schema.properties.reply).toEqual({ type: 'string' });
    expect(request.max_tokens).toBe(18_000);
  });

  it('asks for a schema too big for Claude in words: no strict format, the schema in the instructions', async () => {
    const request = await claudeRequest({ instructions: 'Llena la plantilla.', input: 'Hola', text: { format: { type: 'json_schema', schema: { type: 'object', properties: { a: { type: 'string' } } } } } }, 'claude-sonnet-5-5', true) as any;
    expect(request.output_config.format).toBeUndefined();
    expect(request.system[0].text).toMatch(/Llena la plantilla\.[\s\S]*SOLO con un objeto JSON[\s\S]*"properties":\{"a"/);
  });

  it('refuses what only OpenAI has (tools) instead of guessing', async () => {
    expect(await claudeRequest({ input: 'Hola', tools: [{ type: 'function', name: 'x' }] }, 'claude-sonnet-5-5')).toBeNull();
  });

  it('answers in the OpenAI shape the chat reads, with Claude usage; errors keep their status', () => {
    const ok = responsesAnswer('gpt-5.6-luna', { text: '{"reply":"Hola"}', stopReason: 'end_turn', status: 200, usage: { input_tokens: 10, output_tokens: 5, input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 } } });
    expect(ok.status).toBe(200);
    expect(sourceResponseJson(ok.body)).toEqual({ reply: 'Hola' });
    expect((ok.body as any).usage.output_tokens).toBe(5);
    expect(responsesAnswer('m', { text: '', stopReason: null, usage: null, error: 'rate', status: 429 }).status).toBe(429);
    expect(() => sourceResponseJson(responsesAnswer('m', { text: '', stopReason: 'refusal', usage: null, status: 200 }).body)).toThrow();
  });
});
