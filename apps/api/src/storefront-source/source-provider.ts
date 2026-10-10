import { ServiceUnavailableException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { chatgptPlanProvider } from '../ai/chatgpt-plan-provider';

/** Claude models run only on YAPI's agent engine (Anthropic Messages API with tools). */
export const isClaude = (model: string) => model.startsWith('claude-');

/** Resolve credentials only on the server. A selected provider never falls back to another. */
export function sourceProvider(config: ConfigService, model: string) {
  const plan = chatgptPlanProvider(config, model);
  if (plan) return plan;
  if (isClaude(model)) {
    const apiKey = config.get<string>('app.anthropic.apiKey');
    if (!apiKey) throw new ServiceUnavailableException('Los modelos Claude no están configurados. Configura ANTHROPIC_API_KEY en el servidor para usarlos. Tu sitio sigue guardado.');
    return { name: 'Anthropic', apiKey, endpoint: 'https://api.anthropic.com/v1/messages' };
  }
  const apiKey = config.get<string>('app.openAi.apiKey');
  if (!apiKey || config.get<boolean>('app.openAi.enabled') === false) {
    throw new ServiceUnavailableException('La integración no está configurada. Configura OPENAI_API_KEY en el servidor para usar OpenAI. Tu sitio sigue guardado.');
  }
  return { name: 'OpenAI', apiKey, endpoint: 'https://api.openai.com/v1/responses' };
}
