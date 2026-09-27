import type { SourceRequestBudget } from '../source-request-budget';
import { sourceProviderBody } from '../source-provider';
import { checkSourceProviderQuota } from '../source-provider-error';
import type { AgentModel } from './agent-loop';

const IMAGE_TOKENS = 1500;
function estimateInputTokens(value: unknown) {
  const json = JSON.stringify(value);
  const images = json.match(/"input_image"/g)?.length ?? 0;
  return Math.ceil(json.replace(/data:image\/[a-z]+;base64,[A-Za-z0-9+/=]+/g, '').length / 3.5) + images * IMAGE_TOKENS;
}

/** One Responses API call per agent turn: one credit reservation, settled with the provider's usage. */
export function openAiAgentModel(input: { endpoint: string; apiKey: string; model: string; providerName: string; budget: SourceRequestBudget; maxOutputTokens: number; reasoningEffort: string; promptCacheKey?: string; signal?: AbortSignal; onTurn?: (turn: { body: any; durationMs: number; status: 'COMPLETED' | 'FAILED' }) => void | Promise<void>; fetchImpl?: typeof fetch }): AgentModel {
  const fetchImpl = input.fetchImpl ?? fetch;
  return async ({ instructions, transcript, tools }) => {
    let reserved: ReturnType<SourceRequestBudget['reserve']>;
    try { reserved = input.budget.reserve(input.model, estimateInputTokens({ instructions, transcript, tools }), input.maxOutputTokens, 1024); }
    catch (error) { throw Object.assign(error as Error, { agentLimit: true }); }
    const started = Date.now();
    let response: Response | undefined;
    let body: any = null;
    try {
      response = await fetchImpl(input.endpoint, {
        method: 'POST', signal: input.signal,
        headers: { Authorization: `Bearer ${input.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(sourceProviderBody({ model: input.model, instructions, input: transcript, tools, tool_choice: 'auto', parallel_tool_calls: false, reasoning: { effort: input.reasoningEffort }, max_output_tokens: reserved.outputTokens, store: false, include: ['reasoning.encrypted_content'], ...(input.promptCacheKey ? { prompt_cache_key: input.promptCacheKey } : {}) })),
      });
      body = await response.json().catch(() => null);
    } finally {
      reserved.settle(body?.usage);
      const ok = Boolean(response?.ok && (body?.status === 'completed' || body?.status === 'incomplete'));
      await input.onTurn?.({ body, durationMs: Date.now() - started, status: ok ? 'COMPLETED' : 'FAILED' });
    }
    checkSourceProviderQuota(response!.status, body, input.providerName);
    if (!response!.ok || (body?.status !== 'completed' && body?.status !== 'incomplete')) throw new Error(`El proveedor de IA respondió ${response!.status}.`);
    const output: any[] = Array.isArray(body.output) ? body.output : [];
    return {
      output,
      calls: output.filter(item => item?.type === 'function_call').map(item => ({ name: String(item.name), arguments: String(item.arguments ?? '{}'), callId: String(item.call_id) })),
      text: output.filter(item => item?.type === 'message').flatMap(item => item.content || []).filter((part: any) => part?.type === 'output_text').map((part: any) => part.text).join('\n') || undefined,
    };
  };
}
