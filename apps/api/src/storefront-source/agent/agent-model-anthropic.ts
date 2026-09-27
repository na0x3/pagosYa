import type { SourceRequestBudget } from '../source-request-budget';
import { checkSourceProviderQuota } from '../source-provider-error';
import type { AgentModel } from './agent-loop';

type Block = Record<string, unknown>;
type Message = { role: 'user' | 'assistant'; content: Block[] };

const IMAGE_TOKENS = 1600;
function estimateInputTokens(value: unknown) {
  const json = JSON.stringify(value);
  const images = json.match(/"(?:input_)?image"/g)?.length ?? 0;
  return Math.ceil(json.replace(/data:image\/[a-z]+;base64,[A-Za-z0-9+/=]+/g, '').length / 3.5) + images * IMAGE_TOKENS;
}

function imageBlock(url: string): Block {
  const match = url.match(/^data:(image\/[a-z+]+);base64,(.+)$/);
  return match ? { type: 'image', source: { type: 'base64', media_type: match[1], data: match[2] } } : { type: 'image', source: { type: 'url', url } };
}

/**
 * The agent keeps one transcript shape (Responses-style items); Claude reads it as alternating messages: user text and
 * images, assistant text and tool_use, then the tool_result blocks (and screenshots) in the next user message.
 */
export function anthropicMessages(transcript: unknown[]): Message[] {
  const messages: Message[] = [];
  const push = (role: Message['role'], blocks: Block[]) => {
    if (!blocks.length) return;
    const last = messages.at(-1);
    if (last?.role === role) last.content.push(...blocks);
    else messages.push({ role, content: blocks });
  };
  for (const raw of transcript) {
    const item = raw as Record<string, any>;
    if (item?.type === 'function_call') {
      let input: unknown = {};
      try { input = JSON.parse(item.arguments || '{}'); } catch { input = {}; }
      push('assistant', [{ type: 'tool_use', id: String(item.call_id), name: String(item.name), input }]);
    } else if (item?.type === 'function_call_output') {
      push('user', [{ type: 'tool_result', tool_use_id: String(item.call_id), content: String(item.output ?? '') }]);
    } else if (item?.type === 'message' || item?.role === 'assistant') {
      const parts = Array.isArray(item.content) ? item.content : [];
      push('assistant', parts.filter((part: any) => typeof part?.text === 'string' && part.text).map((part: any) => ({ type: 'text', text: part.text })));
    } else if (item?.role === 'user') {
      const parts = Array.isArray(item.content) ? item.content : [];
      push('user', parts.flatMap((part: any): Block[] => part?.type === 'input_text' && part.text ? [{ type: 'text', text: part.text }]
        : part?.type === 'input_image' && typeof part.image_url === 'string' ? [imageBlock(part.image_url)] : []));
    }
    // Provider-specific items (OpenAI reasoning) have no meaning for Claude and are skipped.
  }
  return messages;
}

/** One Anthropic Messages call per agent turn: one credit reservation, settled with the provider's usage. */
export function anthropicAgentModel(input: { endpoint: string; apiKey: string; model: string; budget: SourceRequestBudget; maxOutputTokens: number; signal?: AbortSignal; onTurn?: (turn: { body: any; durationMs: number; status: 'COMPLETED' | 'FAILED' }) => void | Promise<void>; fetchImpl?: typeof fetch }): AgentModel {
  const fetchImpl = input.fetchImpl ?? fetch;
  return async ({ instructions, transcript, tools }) => {
    let reserved: ReturnType<SourceRequestBudget['reserve']>;
    try { reserved = input.budget.reserve(input.model, estimateInputTokens({ instructions, transcript, tools }), input.maxOutputTokens, 1024); }
    catch (error) { throw Object.assign(error as Error, { agentLimit: true }); }
    const messages = anthropicMessages(transcript);
    // The transcript only grows: caching up to its end lets the next turn read everything before it at the cached rate.
    const lastBlock = messages.at(-1)?.content.at(-1);
    if (lastBlock) lastBlock.cache_control = { type: 'ephemeral' };
    const started = Date.now();
    let response: Response | undefined;
    let body: any = null;
    let usage: any;
    try {
      response = await fetchImpl(input.endpoint, {
        method: 'POST', signal: input.signal,
        headers: { 'x-api-key': input.apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({
          model: input.model, max_tokens: reserved.outputTokens,
          system: [{ type: 'text', text: instructions, cache_control: { type: 'ephemeral' } }],
          tools: (tools as Array<{ name: string; description: string; parameters: object }>).map(tool => ({ name: tool.name, description: tool.description, input_schema: tool.parameters })),
          messages: messages.length ? messages : [{ role: 'user', content: [{ type: 'text', text: 'Continúa.' }] }],
        }),
      });
      body = await response.json().catch(() => null);
    } catch (error) {
      if (input.signal?.aborted) throw error;
      const cause = (error as { cause?: { code?: string; message?: string } })?.cause;
      throw new Error(`No se pudo contactar al proveedor de IA (${cause?.code || cause?.message || (error as Error).message}).`);
    } finally {
      // Anthropic counts cached tokens apart from input_tokens; the shared shape counts them inside it.
      const raw = body?.usage;
      usage = raw ? {
        input_tokens: (raw.input_tokens ?? 0) + (raw.cache_read_input_tokens ?? 0) + (raw.cache_creation_input_tokens ?? 0),
        output_tokens: raw.output_tokens ?? 0,
        input_tokens_details: { cached_tokens: raw.cache_read_input_tokens ?? 0, cache_write_tokens: raw.cache_creation_input_tokens ?? 0 },
      } : undefined;
      reserved.settle(usage);
      const ok = Boolean(response?.ok && Array.isArray(body?.content));
      await input.onTurn?.({ body: body ? { ...body, usage } : body, durationMs: Date.now() - started, status: ok ? 'COMPLETED' : 'FAILED' });
    }
    checkSourceProviderQuota(response!.status, body, 'Anthropic');
    if (!response!.ok || !Array.isArray(body?.content)) throw new Error(`El proveedor de IA respondió ${response!.status}.`);
    const content: any[] = body.content;
    const text = content.filter(block => block?.type === 'text' && block.text).map(block => block.text).join('\n') || undefined;
    const calls = content.filter(block => block?.type === 'tool_use').map(block => ({ name: String(block.name), arguments: JSON.stringify(block.input ?? {}), callId: String(block.id) }));
    return {
      text,
      calls,
      // Replayed by the loop: the assistant's words, then its tool calls, in the shared transcript shape.
      output: [
        ...(text ? [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text }] }] : []),
        ...calls.map(call => ({ type: 'function_call', call_id: call.callId, name: call.name, arguments: call.arguments })),
      ],
    };
  };
}
