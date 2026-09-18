import { sourceGenerationPlan, sourceGenerationEstimate, sourceOutputBudget, sourceUsage } from './source-generation-policy';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { SendSourceMessageDto } from './dto/send-source-message.dto';

describe('Source model routing and credit budgets', () => {
  it('prices DeepSeek with conservative peak rates, caching and no OpenAI premiums', () => {
    const usage = { input_tokens: 300000, input_tokens_details: { cached_tokens: 100000, cache_write_tokens: 200000 }, output_tokens: 1000 };
    expect(sourceUsage('deepseek-v4-flash', usage)?.providerMicroUsd).toBe(90720);
    expect(sourceUsage('deepseek-v4-pro', usage)?.providerMicroUsd).toBe(272360);
    expect(sourceUsage('deepseek-v4-flash-vision-exp', usage)).toEqual(sourceUsage('deepseek-v4-flash', usage));
    const plan = sourceGenerationPlan('deepseek-v4-flash', 1, 'Fix checkout');
    expect(plan.model).toBe('deepseek-v4-flash');
    expect(sourceOutputBudget(plan, 300000, 15)).toBe(10000);
  });
  it('accepts the DeepSeek choices at the API boundary', async () => {
    for (const model of ['deepseek-v4-flash', 'deepseek-v4-pro', 'deepseek-v4-flash-vision-exp']) {
      expect(await validate(plainToInstance(SendSourceMessageDto, { revision: 0, instruction: 'Crea una tienda', model }))).toHaveLength(0);
    }
  });
  it('routes on the current request, rather than old conversation mentioning checkout', () => {
    expect(sourceGenerationPlan('auto', 1, 'Antes: arregla checkout\nPedido actual del comercio:\nCambia el color del título').model).toBe('gpt-5.6-luna');
    expect(sourceGenerationPlan('auto', 1, 'El checkout no funciona').model).toBe('gpt-5.6-sol');
    expect(sourceGenerationPlan('auto', 0, 'Crea una tienda').model).toBe('gpt-5.6-terra');
    expect(sourceGenerationPlan('gpt-5.6-luna', 1, 'Arregla el checkout').model).toBe('gpt-5.6-luna');
  });
  it('gives a full colorful animated redesign enough capacity even when the request mentions color', () => {
    const request = 'generalo de nuevo con estas imagenes, quiero mas color, mas animaciones, mas arte, marquesina que se mueve, colores vibrantes, footer con mas informacion';
    expect(sourceGenerationPlan('auto', 1, request)).toMatchObject({ model: 'gpt-5.6-sol', maxOutputTokens: 10000, reasoningEffort: 'medium' });
    expect(sourceGenerationPlan('gpt-5.6-terra', 1, request).model).toBe('gpt-5.6-terra');
  });
  it('counts cached tokens once and includes billed reasoning output without counting it twice', () => {
    expect(sourceUsage('gpt-5.6-sol', { input_tokens: 1000, input_tokens_details: { cached_tokens: 500 }, output_tokens: 2000, output_tokens_details: { reasoning_tokens: 1000 } })).toEqual({ inputTokens: 1000, cachedInputTokens: 500, outputTokens: 2000, providerMicroUsd: 42200 });
    expect(sourceUsage('gpt-5.6-sol', null)).toBeNull();
    expect(sourceUsage('gpt-5.6-sol', { input_tokens: -1, output_tokens: 20 })).toBeNull();
    expect(sourceUsage('gpt-5.6-sol', { input_tokens: 300000, output_tokens: 1000 })?.providerMicroUsd).toBe(2430000);
  });
  it('rejects impossible budgets and bounds output for smaller affordable requests', () => {
    const plan = sourceGenerationPlan('gpt-5.6-terra', 0, 'Create');
    const quote = sourceGenerationEstimate(plan, 0);
    expect(() => sourceOutputBudget(plan, quote.estimatedInputTokens, 1)).toThrow('límite no alcanza');
    expect(sourceOutputBudget(plan, quote.estimatedInputTokens, 5)).toBeLessThan(plan.maxOutputTokens);
    expect(sourceOutputBudget(plan, quote.estimatedInputTokens, 50)).toBe(plan.maxOutputTokens);
  });
  it('rejects arbitrary model ids, noninteger credits and out-of-range caps at the API boundary', async () => {
    for (const invalid of [{ model: 'unpriced-model' }, { maxCredits: 0 }, { maxCredits: 501 }, { maxCredits: 1.2 }, { maxCredits: '50' }]) {
      expect(await validate(plainToInstance(SendSourceMessageDto, { revision: 0, instruction: 'Crea una tienda', ...invalid }))).not.toHaveLength(0);
    }
  });
});
