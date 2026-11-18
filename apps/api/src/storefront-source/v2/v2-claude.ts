import sharp from 'sharp';

/** Owner 2026-11-16 («i have 100 usd in claude api tokens… create only one store, but lets try to minimize the costs»): a V2 call
 *  on a Claude model, through the Anthropic Messages API (raw HTTP like agent/agent-model-anthropic.ts — the SDK is not installed
 *  and installing it stops the dev stack). Same contract as the OpenAI-shaped call: instructions + text/image parts + a strict JSON
 *  schema in, the parsed JSON out. Cost levers: the instructions are cached (the writer's prompt repeats across every writer and
 *  fix call), «low» detail images are sent at 512 px (Claude bills every image by its pixels, there is no low-detail mode), and the
 *  answer streams so a long writer call never hits an HTTP timeout. */

export type V2Part = { type: 'input_text'; text: string } | { type: 'input_image'; image_url: string; detail?: 'low' | 'high' | 'auto' };

/** Claude's structured outputs take a subset of JSON Schema: no numeric bounds, no string patterns, no item counts above one.
 *  Those are dropped here (the V2 contract checks the answer anyway). */
export function claudeSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(claudeSchema);
  if (!schema || typeof schema !== 'object') return schema;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema as Record<string, unknown>)) {
    if (['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf', 'minLength', 'maxLength', 'pattern', 'maxItems', 'uniqueItems'].includes(key)) continue;
    if (key === 'minItems' && typeof value === 'number' && value > 1) continue;
    // Property names are data, never keywords: a property called «pattern» or «maximum» stays.
    out[key] = key === 'properties' && value && typeof value === 'object'
      ? Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([name, sub]) => [name, claudeSchema(sub)]))
      : claudeSchema(value);
  }
  return out;
}

const LOW = 512, HIGH = 1568;

/** The parts as Claude content blocks; an image larger than its detail allows is scaled down (webp keeps cut-outs' transparency). */
export async function claudeContent(parts: readonly V2Part[]): Promise<object[]> {
  return Promise.all(parts.map(async part => {
    if (part.type === 'input_text') return { type: 'text', text: part.text };
    const match = /^data:(image\/[\w+.-]+);base64,(.+)$/s.exec(part.image_url);
    if (!match) return { type: 'image', source: { type: 'url', url: part.image_url } };
    const [, media, data] = match;
    const limit = part.detail === 'low' ? LOW : HIGH;
    const bytes = Buffer.from(data, 'base64');
    const meta = await sharp(bytes).metadata().catch(() => null);
    const supported = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(media);
    if (meta?.width && meta.height && Math.max(meta.width, meta.height) <= limit && supported) return { type: 'image', source: { type: 'base64', media_type: media, data } };
    const scaled = await sharp(bytes).resize({ width: limit, height: limit, fit: 'inside', withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
    return { type: 'image', source: { type: 'base64', media_type: 'image/webp', data: scaled.toString('base64') } };
  }));
}

export type ClaudeResult = { text: string; stopReason: string | null; usage: { input_tokens: number; output_tokens: number; input_tokens_details: { cached_tokens: number; cache_write_tokens: number } } | null; error?: string; status: number };

/** Reads the event stream: the text of the answer (restarted when a fallback model takes over), the stop reason and the usage,
 *  in the shared OpenAI-like usage shape (cached tokens counted inside input_tokens) the metering and sourceUsage read. */
export async function readClaudeStream(response: Response): Promise<ClaudeResult> {
  if (!response.ok || !response.body) {
    const body = await response.json().catch(() => null) as { error?: { message?: string } } | null;
    return { text: '', stopReason: null, usage: null, error: body?.error?.message ?? `HTTP ${response.status}`, status: response.status };
  }
  let text = '', stopReason: string | null = null, error: string | undefined;
  const raw = { input: 0, read: 0, write: 0, output: 0 };
  const decoder = new TextDecoder();
  let buffer = '';
  const handle = (event: any) => {
    if (event?.type === 'message_start') {
      const usage = event.message?.usage ?? {};
      raw.input += usage.input_tokens ?? 0; raw.read += usage.cache_read_input_tokens ?? 0; raw.write += usage.cache_creation_input_tokens ?? 0; raw.output += usage.output_tokens ?? 0;
    } else if (event?.type === 'content_block_start' && event.content_block?.type === 'fallback') text = '';
    else if (event?.type === 'content_block_delta' && event.delta?.type === 'text_delta') text += event.delta.text;
    else if (event?.type === 'message_delta') {
      stopReason = event.delta?.stop_reason ?? stopReason;
      // message_delta carries the running output count for the whole response.
      if (typeof event.usage?.output_tokens === 'number') raw.output = event.usage.output_tokens;
    } else if (event?.type === 'error') error = event.error?.message ?? 'error';
  };
  for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
    buffer += decoder.decode(chunk, { stream: true });
    let cut: number;
    while ((cut = buffer.indexOf('\n\n')) >= 0) {
      const frame = buffer.slice(0, cut); buffer = buffer.slice(cut + 2);
      const data = frame.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trim()).join('');
      if (data) { try { handle(JSON.parse(data)); } catch { /* a keep-alive or partial frame */ } }
    }
  }
  return {
    text, stopReason, error, status: response.status,
    usage: { input_tokens: raw.input + raw.read + raw.write, output_tokens: raw.output, input_tokens_details: { cached_tokens: raw.read, cache_write_tokens: raw.write } },
  };
}

/** One strict-JSON V2 call on Claude. Thinking stays adaptive (the model's default); effort is the only depth control. The
 *  instructions carry a cache breakpoint; a refusal is re-run by the server on a fallback model («default» routing). */
export async function claudeJson(input: { apiKey: string; model: string; instructions: string; content: readonly V2Part[]; schema: object; maxOutput: number; effort: 'low' | 'medium' | 'high'; signal?: AbortSignal; fetchImpl?: typeof fetch }): Promise<ClaudeResult & { json: unknown }> {
  const response = await (input.fetchImpl ?? fetch)('https://api.anthropic.com/v1/messages', {
    method: 'POST', signal: input.signal,
    headers: { 'x-api-key': input.apiKey, 'anthropic-version': '2023-06-01', 'anthropic-beta': 'server-side-fallback-2026-07-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: input.model, stream: true,
      // Thinking counts inside max_tokens: the answer's own budget plus room to think.
      max_tokens: Math.min(128_000, input.maxOutput + 16_000),
      system: [{ type: 'text', text: input.instructions, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: await claudeContent(input.content) }],
      output_config: { effort: input.effort, format: { type: 'json_schema', schema: claudeSchema(input.schema) } },
      fallbacks: 'default',
    }),
  });
  const result = await readClaudeStream(response);
  let json: unknown = null;
  if (!result.error && result.stopReason !== 'refusal' && result.stopReason !== 'max_tokens') { try { json = JSON.parse(result.text); } catch { json = null; } }
  return { ...result, json };
}
