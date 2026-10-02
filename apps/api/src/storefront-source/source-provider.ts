import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { chatgptPlanProvider } from '../ai/chatgpt-plan-provider';

export const isDeepSeek = (model: string) => model.startsWith('deepseek-');
/** Claude models run only on YAPI's agent engine (Anthropic Messages API with tools). */
export const isClaude = (model: string) => model.startsWith('claude-');

/** Resolve credentials only on the server. A selected provider never falls back to another. */
export function sourceProvider(config: ConfigService, model: string, hasImages = false) {
  const plan = chatgptPlanProvider(config, model);
  if (plan) return plan;
  if (isClaude(model)) {
    const apiKey = config.get<string>('app.anthropic.apiKey');
    if (!apiKey) throw new ServiceUnavailableException('Los modelos Claude no están configurados. Configura ANTHROPIC_API_KEY en el servidor para usarlos. Tu sitio sigue guardado.');
    return { name: 'Anthropic', apiKey, endpoint: 'https://api.anthropic.com/v1/messages' };
  }
  const deepSeek = isDeepSeek(model);
  const name = deepSeek ? 'DeepSeek' : 'OpenAI';
  const namespace = deepSeek ? 'deepSeek' : 'openAi';
  const apiKey = config.get<string>(`app.${namespace}.apiKey`);
  if (!apiKey || config.get<boolean>(`app.${namespace}.enabled`) === false) {
    throw new ServiceUnavailableException(`La integración no está configurada. Configura ${deepSeek ? 'DEEPSEEK_API_KEY' : 'OPENAI_API_KEY'} en el servidor para usar ${name}. Tu sitio sigue guardado.`);
  }
  if (deepSeek && hasImages && model !== 'deepseek-v4-flash-vision-exp') {
    throw new BadRequestException('Esta solicitud incluye imágenes. Selecciona DeepSeek Flash Vision para que la IA pueda verlas.');
  }
  return { name, apiKey, endpoint: deepSeek ? 'https://api.deepseek.com/responses' : 'https://api.openai.com/v1/responses' };
}

/** DeepSeek caches automatically; do not send OpenAI-specific cache or service options. */
export function sourceProviderBody(body: Record<string, any>) {
  if (!isDeepSeek(body.model)) return body;
  return {
    model: body.model,
    ...(body.instructions ? { instructions: body.instructions } : {}),
    input: body.input.map((message: any) => ({ role: message.role, content: message.content.map((part: any) => {
      const { prompt_cache_breakpoint: _cache, ...content } = part;
      return content;
    }) })),
    text: { format: { type: body.text.format.type, name: body.text.format.name, schema: body.text.format.schema } },
    reasoning: body.reasoning,
    max_output_tokens: body.max_output_tokens,
  };
}
