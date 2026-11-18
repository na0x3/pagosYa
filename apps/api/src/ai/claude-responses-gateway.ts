import { randomBytes } from 'node:crypto';
import { appendFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { claudeContent, claudeSchema, readClaudeStream, type ClaudeResult, type V2Part } from '../storefront-source/v2/v2-claude';
import { sourceUsage, type SourceModel } from '../storefront-source/source-generation-policy';

/** Owner 2026-11-17 («do that with the claude models» … «i told you the gpt plan is not good»): YAPI's chat steps (the reply, the
 *  template fill, the reviews) are written for OpenAI's Responses format and ran on the ChatGPT plan, which answered 429 in the
 *  middle of a test. With YAPI_CHAT_ON_CLAUDE=<claude model> they go through this local gateway instead: the same request in the
 *  Responses shape, sent to Claude with the V2 helpers (cached instructions, images at Claude's sizes, the schema Claude takes),
 *  answered back in the Responses shape the callers read. Local development only, like the plan bridge: 127.0.0.1, one secret per
 *  run. Each call's real Claude cost goes to the YAPI trace (the callers meter by the model they asked for, an OpenAI one). */

type ResponsesBody = { model?: string; instructions?: string; input?: unknown; tools?: unknown[]; text?: { format?: { type?: string; schema?: object } }; reasoning?: { effort?: string }; max_output_tokens?: number };
const EFFORT: Record<string, 'low' | 'medium' | 'high'> = { none: 'low', minimal: 'low', low: 'low', medium: 'medium', high: 'high', xhigh: 'high' };

function parts(content: unknown): V2Part[] {
  if (typeof content === 'string') return [{ type: 'input_text', text: content }];
  if (!Array.isArray(content)) return [];
  return content.flatMap((part: any): V2Part[] => part?.type === 'input_text' || part?.type === 'output_text' ? [{ type: 'input_text', text: String(part.text ?? '') }]
    : part?.type === 'input_image' && typeof part.image_url === 'string' ? [{ type: 'input_image', image_url: part.image_url, detail: part.detail }] : []);
}

/** The Responses request as a Messages request; null when it needs what only OpenAI has here (tools, non-message items). */
export async function claudeRequest(body: ResponsesBody, model: string, schemaInPrompt = false): Promise<object | null> {
  if (Array.isArray(body.tools) && body.tools.length) return null;
  const system = body.instructions ? [body.instructions] : [];
  const messages: Array<{ role: 'user' | 'assistant'; content: object[] }> = [];
  const items = typeof body.input === 'string' ? [{ role: 'user', content: body.input }] : Array.isArray(body.input) ? body.input : [];
  for (const item of items as any[]) {
    if (item?.type && item.type !== 'message') return null;
    if (item?.role === 'system' || item?.role === 'developer') { system.push(parts(item.content).map(part => part.type === 'input_text' ? part.text : '').join('\n')); continue; }
    const role = item?.role === 'assistant' ? 'assistant' : 'user';
    const content = await claudeContent(parts(item?.content));
    if (!content.length) continue;
    const last = messages.at(-1);
    if (last?.role === role) last.content.push(...content); else messages.push({ role, content });
  }
  if (messages[0]?.role !== 'user') return null;
  const schema = body.text?.format?.type === 'json_schema' ? body.text.format.schema : undefined;
  // Live 2026-11-17: a big schema (the template fill) is refused («compiled grammar is too large»); it is then asked for in words.
  if (schema && schemaInPrompt) system.push(`Responde SOLO con un objeto JSON válido, sin texto alrededor, que cumpla este esquema JSON:\n${JSON.stringify(schema)}`);
  const format = schema && !schemaInPrompt ? { type: 'json_schema', schema: claudeSchema(schema) } : undefined;
  return {
    model, stream: true,
    // Thinking counts inside max_tokens, as in claudeJson: the answer's budget plus room to think.
    max_tokens: Math.min(128_000, (body.max_output_tokens ?? 8_000) + 16_000),
    ...(system.length ? { system: [{ type: 'text', text: system.join('\n\n'), cache_control: { type: 'ephemeral' } }] } : {}),
    messages, output_config: { effort: EFFORT[body.reasoning?.effort ?? ''] ?? 'medium', ...(format ? { format } : {}) }, fallbacks: 'default',
  };
}

/** Claude's answer in the Responses shape (sourceResponseJson, the usage readers); an error keeps its HTTP status (429 stays 429). */
export function responsesAnswer(model: string, result: ClaudeResult): { status: number; body: object } {
  if (result.error) return { status: result.status >= 400 ? result.status : 502, body: { error: { type: 'claude_gateway', message: result.error } } };
  const refused = result.stopReason === 'refusal';
  return { status: 200, body: {
    object: 'response', model, status: result.stopReason === 'max_tokens' ? 'incomplete' : 'completed', usage: result.usage,
    output: [{ type: 'message', role: 'assistant', status: 'completed', content: [refused ? { type: 'refusal', refusal: 'Claude declined the request.' } : { type: 'output_text', text: result.text, annotations: [] }] }],
    output_text: refused ? '' : result.text,
  } };
}

let gateway: { server: Server; url: string; secret: string } | undefined;

/** The provider for the chat's OpenAI-shaped calls when YAPI_CHAT_ON_CLAUDE names a Claude model; undefined otherwise. */
export function claudeChatProvider(env: NodeJS.ProcessEnv = process.env): { name: string; apiKey: string; endpoint: string } | undefined {
  const model = env.YAPI_CHAT_ON_CLAUDE, apiKey = env.YAPI_CLAUDE_API_KEY || env.ANTHROPIC_API_KEY;
  if (!model?.startsWith('claude-') || !apiKey || env.NODE_ENV === 'production') return undefined;
  gateway ??= start(model, apiKey, Number(env.YAPI_CLAUDE_GATEWAY_PORT) || 3019, env.YAPI_TRACE_FILE);
  return { name: 'Claude (chat)', apiKey: gateway.secret, endpoint: gateway.url };
}

function start(model: string, apiKey: string, port: number, trace?: string) {
  const secret = randomBytes(32).toString('base64url');
  const server = createServer(async (req, res) => {
    const send = (status: number, body: object) => { if (!res.destroyed) res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify(body)); };
    if (req.headers.origin || req.headers.authorization !== `Bearer ${secret}` || req.method !== 'POST' || req.url !== '/v1/responses') { send(403, { error: { code: 'forbidden' } }); return; }
    const controller = new AbortController();
    res.on('close', () => { if (!res.writableEnded) controller.abort(); });
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      const body = JSON.parse(Buffer.concat(chunks).toString()) as ResponsesBody;
      const request = await claudeRequest(body, model);
      if (!request) { send(400, { error: { code: 'unsupported_on_claude', message: 'This call uses tools, which the Claude chat gateway does not carry.' } }); return; }
      const started = Date.now();
      const headers = { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'anthropic-beta': 'server-side-fallback-2026-07-01', 'content-type': 'application/json' };
      const response = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', signal: controller.signal, body: JSON.stringify(request), headers });
      let result = await readClaudeStream(response);
      if (result.error && /grammar is too large/i.test(result.error)) {
        const words = await claudeRequest(body, model, true);
        result = await readClaudeStream(await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', signal: controller.signal, body: JSON.stringify(words), headers }));
      }
      const usage = result.usage ? sourceUsage(model as SourceModel, result.usage) : null;
      if (trace) void appendFile(trace, JSON.stringify({ at: new Date().toISOString(), event: 'claude_chat', model, asked: body.model, ms: Date.now() - started, usd: usage ? usage.providerMicroUsd / 1e6 : null, error: result.error?.slice(0, 200) }) + '\n').catch(() => undefined);
      const answer = responsesAnswer(body.model ?? model, result);
      send(answer.status, answer.body);
    } catch (error) {
      send(502, { error: { type: 'claude_gateway', message: String((error as Error)?.message ?? error).slice(0, 300) } });
    }
  });
  // An IP literal binds synchronously, so the first call never races the listen.
  server.listen(port, '127.0.0.1');
  server.unref();
  return { server, url: `http://127.0.0.1:${port}/v1/responses`, secret };
}
