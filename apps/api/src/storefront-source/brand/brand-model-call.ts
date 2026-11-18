import { sourceResponseJson } from '../source-response';

export type BrandCallDeps = { endpoint: string; apiKey: string; model: string; anthropic?: { apiKey: string; model: string }; fetch?: typeof fetch; record?: (body: unknown, ms: number, ok: boolean) => Promise<void> };
export type BrandCallRequest = { text: string; images?: Array<{ type: 'input_image'; image_url: string; detail: 'auto' | 'high' }>; schemaName: string; schema: object; webSearch?: boolean; maxOutputTokens?: number; signal?: AbortSignal };

/** The first {...} block in a text answer (Anthropic's web-search answers come as prose with the JSON inside). */
export function jsonFromText(text: string): unknown {
  const start = text.indexOf('{'), end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('No JSON in the answer');
  return JSON.parse(text.slice(start, end + 1));
}

/** «Mejorar mi marca»: one schema-checked call, metered through `record`; with `webSearch`, live search first and a plain call if that fails. */
export async function brandCall(deps: BrandCallDeps, request: BrandCallRequest): Promise<{ json: unknown; searched: boolean }> {
  const doFetch = deps.fetch ?? fetch;
  const timed = (ms: number) => AbortSignal.any([request.signal ?? new AbortController().signal, AbortSignal.timeout(ms)]);
  const measured = async <T>(run: () => Promise<{ ok: boolean; body: any }>, read: (body: any) => T): Promise<T> => {
    const started = Date.now();
    let outcome: { ok: boolean; body: any } = { ok: false, body: null };
    try { outcome = await run(); } finally { await deps.record?.(outcome.body, Date.now() - started, outcome.ok).catch(() => undefined); }
    if (!outcome.ok) throw new Error(`Model call failed: ${String(outcome.body?.error?.code ?? outcome.body?.error?.message ?? 'no answer').slice(0, 120)}`);
    return read(outcome.body);
  };
  const responses = (tools: boolean) => measured(async () => {
    const response = await doFetch(deps.endpoint, { method: 'POST', signal: timed(240_000), headers: { Authorization: `Bearer ${deps.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: deps.model, store: false, instructions: '', input: [{ role: 'user', content: [{ type: 'input_text', text: request.text }, ...(request.images ?? [])] }],
        max_output_tokens: request.maxOutputTokens ?? 4000, reasoning: { effort: 'medium' }, ...(tools ? { tools: [{ type: 'web_search' }] } : {}),
        text: { format: { type: 'json_schema', name: request.schemaName, strict: true, schema: request.schema } } }) });
    const body = await response.json().catch(() => null);
    return { ok: response.ok && body?.status === 'completed', body };
  }, body => sourceResponseJson(body));
  const anthropic = (key: { apiKey: string; model: string }) => measured(async () => {
    const response = await doFetch('https://api.anthropic.com/v1/messages', { method: 'POST', signal: timed(240_000), headers: { 'x-api-key': key.apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: key.model, max_tokens: request.maxOutputTokens ?? 4000, tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }],
        messages: [{ role: 'user', content: `${request.text}\n\nResponde al final SOLO con un objeto JSON que cumpla este esquema:\n${JSON.stringify(request.schema)}` }] }) });
    const body = await response.json().catch(() => null);
    return { ok: response.ok && Array.isArray(body?.content), body };
  }, body => jsonFromText((body.content as any[]).filter(part => part?.type === 'text').map(part => part.text).join('\n')));

  if (request.webSearch) {
    try { return { json: deps.anthropic ? await anthropic(deps.anthropic) : await responses(true), searched: true }; } catch { /* the plain call below */ }
  }
  return { json: await responses(false), searched: false };
}
