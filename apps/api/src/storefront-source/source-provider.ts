import { ServiceUnavailableException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { chatgptPlanProvider } from '../ai/chatgpt-plan-provider';
import { claudeChatProvider } from '../ai/claude-responses-gateway';

/** Claude models run only on YAPI's agent engine (Anthropic Messages API with tools). */
export const isClaude = (model: string) => model.startsWith('claude-');

/** Resolve credentials only on the server. A selected provider never falls back to another. */
export function sourceProvider(config: ConfigService, model: string) {
  // Owner 2026-11-17: with YAPI_CHAT_ON_CLAUDE the OpenAI-shaped calls run on Claude through the local gateway, before the plan.
  const claude = isClaude(model) ? undefined : claudeChatProvider();
  if (claude) return claude;
  // A Claude model while the chat runs on Claude (live 2026-11-17, NOA's edits) is paid from the Anthropic key, never the ChatGPT plan.
  const plan = isClaude(model) && process.env.YAPI_CHAT_ON_CLAUDE ? undefined : chatgptPlanProvider(config, model);
  if (plan) return plan;
  if (isClaude(model)) {
    // The key V2 and the chat gateway use (YAPI_CLAUDE_API_KEY) when ANTHROPIC_API_KEY is empty (live 2026-11-17).
    const apiKey = config.get<string>('app.anthropic.apiKey') || process.env.YAPI_CLAUDE_API_KEY;
    if (!apiKey) throw new ServiceUnavailableException('Los modelos Claude no están configurados. Configura ANTHROPIC_API_KEY en el servidor para usarlos. Tu sitio sigue guardado.');
    return { name: 'Anthropic', apiKey, endpoint: 'https://api.anthropic.com/v1/messages' };
  }
  const apiKey = config.get<string>('app.openAi.apiKey');
  if (!apiKey || config.get<boolean>('app.openAi.enabled') === false) {
    throw new ServiceUnavailableException('La integración no está configurada. Configura OPENAI_API_KEY en el servidor para usar OpenAI. Tu sitio sigue guardado.');
  }
  return { name: 'OpenAI', apiKey, endpoint: 'https://api.openai.com/v1/responses' };
}
