import { brandCall, jsonFromText } from './brand-model-call';

const responses = (json: unknown) => ({ ok: true, status: 200, json: async () => ({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(json) }] }] }) });
const failing = (status = 400) => ({ ok: false, status, json: async () => ({ error: { code: 'unsupported_on_claude' } }) });
const deps = (fetchImpl: any, extra = {}) => ({ endpoint: 'https://x/v1/responses', apiKey: 'k', model: 'gpt-5.6-sol', fetch: fetchImpl, ...extra });
const request = { text: 't', schemaName: 's', schema: { type: 'object' }, webSearch: true };

describe('brandCall', () => {
  it('sends the web search tool on the Responses endpoint and reports searched', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(responses({ a: 1 }));
    expect(await brandCall(deps(fetchImpl), request)).toEqual({ json: { a: 1 }, searched: true });
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body).tools).toEqual([{ type: 'web_search' }]);
  });

  it('falls back to a call without tools when search is refused', async () => {
    const fetchImpl = jest.fn().mockResolvedValueOnce(failing()).mockResolvedValueOnce(responses({ a: 2 }));
    expect(await brandCall(deps(fetchImpl), request)).toEqual({ json: { a: 2 }, searched: false });
    expect(JSON.parse(fetchImpl.mock.calls[1][1].body).tools).toBeUndefined();
  });

  it('searches through Anthropic when a Claude key is given, reading the JSON from its text', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ content: [{ type: 'server_tool_use' }, { type: 'text', text: 'Aquí está:\n```json\n{"a":3}\n```' }] }) });
    const result = await brandCall(deps(fetchImpl, { anthropic: { apiKey: 'ak', model: 'claude-sonnet-5-5' } }), request);
    expect(result).toEqual({ json: { a: 3 }, searched: true });
    expect(fetchImpl.mock.calls[0][0]).toBe('https://api.anthropic.com/v1/messages');
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body).tools[0].type).toBe('web_search_20250305');
  });

  it('throws when the plain call fails too', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(failing(503));
    await expect(brandCall(deps(fetchImpl), request)).rejects.toThrow();
  });

  it('reads JSON wrapped in prose or a fence', () => {
    expect(jsonFromText('x {"b":[1]} y')).toEqual({ b: [1] });
    expect(() => jsonFromText('no json')).toThrow();
  });
});
