import { isDeepSeek } from './source-provider';
import { BadRequestException } from '@nestjs/common';

// Standard API prices checked 2026-09-06. Credits are usage units, not a prepaid wallet.
// https://developers.openai.com/api/docs/models/gpt-5.6-{luna,terra,sol}
export const SOURCE_MODELS = {
  'gpt-5.6-luna': { label: 'GPT-5.6 Luna', input: 0.2, cached: 0.02, output: 1.2 },
  'gpt-5.6-terra': { label: 'GPT-5.6 Terra', input: 2, cached: 0.2, output: 12 },
  'gpt-5.6-sol': { label: 'GPT-5.6 Sol', input: 4, cached: 0.4, output: 20 },
  // Peak rates checked 2026-09-09: https://api-docs.deepseek.com/quick_start/pricing/
  // Conservative estimate: off-peak invoices may be lower. No OpenAI long-context/cache-write premiums.
  'deepseek-v4-flash': { label: 'DeepSeek Flash', input: 0.44, cached: 0.014, output: 1.32 },
  'deepseek-v4-pro': { label: 'DeepSeek Pro', input: 1.32, cached: 0.044, output: 3.96 },
  'deepseek-v4-flash-vision-exp': { label: 'DeepSeek Flash Vision (experimental)', input: 0.44, cached: 0.014, output: 1.32 },
} as const;
export type SourceModel = keyof typeof SOURCE_MODELS;
export type SourceModelChoice = 'auto' | SourceModel;
export const SOURCE_MODEL_CHOICES = ['auto', ...Object.keys(SOURCE_MODELS)];
export const CREDIT_MICRO_USD = 10_000;
export const DEFAULT_MAX_CREDITS = 50;

export function sourceGenerationPlan(choice: SourceModelChoice = 'auto', revision: number, instruction: string) {
  if (!SOURCE_MODEL_CHOICES.includes(choice)) throw new BadRequestException('Selecciona un modelo disponible.');
  const task = instruction.split('Pedido actual del comercio:').at(-1)!.trim();
  const redesign = /(?:gener|haz|crea|dise[ñn])[a-záéíóúñ]*\s+(?:lo\s+)?de\s+nuevo|regener|redise|redesign|rebuild|marquesina|marquee|animaci|animation|m[aá]s\s+arte/i.test(task);
  const complex = redesign || /checkout|pago|payment|carrito|cart|reserva|booking|navega|navigation|páginas?|pages?|redise|redesign|error|bug|no funciona|not working/i.test(task);
  const simple = revision > 0 && task.length < 350 && !complex && /texto|text|título|title|color|fuente|font|espacio|spacing|margen|margin|botón|button|copy/i.test(task);
  const model: SourceModel = choice === 'auto' ? complex && revision > 0 ? 'gpt-5.6-sol' : simple ? 'gpt-5.6-luna' : 'gpt-5.6-terra' : choice;
  // DeepSeek low thinking consumed 7.8–9.6k of a 12k allowance in live tests.
  // Code generation uses non-thinking mode; chat still uses low reasoning.
  return { requestedModel: choice, model, reasoningEffort: isDeepSeek(model) ? 'none' as const : simple ? 'low' as const : 'medium' as const,
    maxOutputTokens: revision === 0 ? 12000 : simple ? 4000 : 10000,
    reason: choice !== 'auto' ? 'Modelo elegido por ti.' : complex && revision > 0 ? 'Cambio de funcionalidad.' : simple ? 'Ajuste puntual.' : 'Diseño y composición del sitio.' };
}

export function sourceUsage(model: SourceModel, raw: any) {
  const integer = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
  if (!integer(raw?.input_tokens) || !integer(raw?.output_tokens)) return null;
  const inputTokens = raw.input_tokens as number, outputTokens = raw.output_tokens as number;
  const cachedInputTokens = Math.min(inputTokens, integer(raw.input_tokens_details?.cached_tokens) ? raw.input_tokens_details.cached_tokens : 0);
  const cacheWriteTokens = isDeepSeek(model) ? 0 : Math.min(inputTokens - cachedInputTokens, integer(raw.input_tokens_details?.cache_write_tokens) ? raw.input_tokens_details.cache_write_tokens : 0);
  const rates = SOURCE_MODELS[model];
  const long = !isDeepSeek(model) && inputTokens > 272000;
  const providerMicroUsd = Math.ceil(((inputTokens - cachedInputTokens + cacheWriteTokens * .25) * rates.input + cachedInputTokens * rates.cached) * (long ? 2 : 1) + outputTokens * rates.output * (long ? 1.5 : 1));
  return { inputTokens, cachedInputTokens, outputTokens, providerMicroUsd, ...(cacheWriteTokens ? { cacheWriteTokens } : {}) };
}

export function sourceGenerationEstimate(plan: ReturnType<typeof sourceGenerationPlan>, sourceCharacters: number, instructionCharacters = 0, imageCount = 0, explore = false) {
  // Planning estimate only: actual usage comes from the provider. Never presented as an invoice.
  const inputTokens = 3500 + Math.ceil((sourceCharacters + instructionCharacters) / 3) + imageCount * 3000;
  const low = sourceUsage(plan.model, { input_tokens: inputTokens, output_tokens: Math.min(2000, plan.maxOutputTokens) })!;
  const high = sourceUsage(plan.model, { input_tokens: inputTokens, input_tokens_details: { cache_write_tokens: inputTokens }, output_tokens: plan.maxOutputTokens })!;
  const planningLow = explore ? sourceUsage(plan.model, { input_tokens: 3500 + imageCount * 3000, output_tokens: 1400 })!.providerMicroUsd : 0;
  const planningHigh = explore ? sourceUsage(plan.model, { input_tokens: inputTokens, output_tokens: 3000 })!.providerMicroUsd : 0;
  return { minCredits: Math.max(1, Math.ceil((low.providerMicroUsd + planningLow) / CREDIT_MICRO_USD)), maxCredits: Math.ceil((high.providerMicroUsd + planningHigh) / CREDIT_MICRO_USD), estimatedInputTokens: inputTokens };
}

export function sourceOutputBudget(plan: ReturnType<typeof sourceGenerationPlan>, estimatedInputTokens: number, maxCredits = DEFAULT_MAX_CREDITS) {
  if (!Number.isInteger(maxCredits) || maxCredits < 1 || maxCredits > 500) throw new BadRequestException('El límite debe ser de 1 a 500 créditos.');
  const inputCost = sourceUsage(plan.model, { input_tokens: estimatedInputTokens, input_tokens_details: { cache_write_tokens: estimatedInputTokens }, output_tokens: 0 })!.providerMicroUsd;
  const rate = SOURCE_MODELS[plan.model].output * (!isDeepSeek(plan.model) && estimatedInputTokens > 272000 ? 1.5 : 1);
  const tokens = Math.min(plan.maxOutputTokens, Math.floor((maxCredits * CREDIT_MICRO_USD - inputCost) / rate));
  if (tokens < Math.min(plan.maxOutputTokens, 2000)) throw new BadRequestException('El límite no alcanza para esta solicitud. Elige otro modelo o aumenta los créditos.');
  return tokens;
}
