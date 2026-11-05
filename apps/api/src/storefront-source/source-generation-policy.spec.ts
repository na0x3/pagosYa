import { agentStepModel, merchantModelChoice, sourceConversationModel, sourceGenerationPlan, sourceGenerationEstimate, sourceImageMicroUsd, sourceOutputBudget, sourcePromptCacheKey, sourceUsage } from './source-generation-policy';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { SendSourceMessageDto } from './dto/send-source-message.dto';
import { SourceChatJobsController } from './source-chat-jobs.controller';

describe('Source model routing and credit budgets', () => {
  it('rejects the removed DeepSeek choices at the API boundary', async () => {
    for (const model of ['deepseek-v4-flash', 'deepseek-v4-pro', 'deepseek-v4-flash-vision-exp']) {
      expect(await validate(plainToInstance(SendSourceMessageDto, { revision: 0, instruction: 'Crea una tienda', model }))).not.toHaveLength(0);
      expect(() => sourceGenerationPlan(model as any, 0, 'Crea una tienda')).toThrow('Selecciona un modelo disponible.');
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

describe('cost controls', () => {
  it('shares one cache key and prefix across merchants, and changes it when the prompt changes', () => {
    const prefix = 'the global contracts every store sends';
    expect(sourcePromptCacheKey('source', prefix, 'store-a')).toBe(sourcePromptCacheKey('source', prefix, 'store-b'));
    expect(sourcePromptCacheKey('source', prefix, 'store-a')).not.toContain('store-a');
    // A reworded prompt must not be served the previous prefix's cache entry.
    expect(sourcePromptCacheKey('source', prefix + ' v2', 'store-a')).not.toBe(sourcePromptCacheKey('source', prefix, 'store-a'));
    expect(sourcePromptCacheKey('conversation', prefix, '')).not.toBe(sourcePromptCacheKey('source', prefix, ''));
  });

  it('keeps chat off code-generation models whatever the merchant picked for building', () => {
    expect(sourceConversationModel('gpt-5.6-sol', undefined)).toBe('gpt-5.6-luna');
    expect(sourceConversationModel('gpt-5.6-terra', undefined)).toBe('gpt-5.6-luna');
    expect(sourceConversationModel('auto', 'gpt-5.6-sol')).toBe('gpt-5.6-luna');
    expect(sourceConversationModel(undefined, undefined)).toBe('gpt-5.6-luna');
    // An operator-configured model outside the priced table is left untouched.
    expect(sourceConversationModel('auto', 'gpt-5.5')).toBe('gpt-5.5');
  });

  it('prices images per image so they stop recording as free', () => {
    expect(sourceImageMicroUsd('1024x1024')).toBe(42_000);
    expect(sourceImageMicroUsd('1024x1536')).toBe(63_000);
    expect(sourceImageMicroUsd('1536x1024')).toBe(63_000);
    expect(sourceImageMicroUsd('1024x1024', 2)).toBe(84_000);
    expect(sourceImageMicroUsd('1024x1024', 1, { square: 0.01 })).toBe(10_000);
    // Unknown shapes stay unknown rather than being counted as nothing.
    expect(sourceImageMicroUsd('not-a-size')).toBeNull();
    expect(sourceImageMicroUsd('1024x1024', 0)).toBeNull();
  });
});

it('routes the observed multi-part dog-food request as substantial work, not a color tweak', () => {
  const instruction='y cambia la informacion para una tienda que trae comida de perros a bolivia, y adapta mas o menos a los colores de las fotos el sitio, y anade mas secciones con estas fotos';
  expect(sourceGenerationPlan('auto',7,instruction)).toMatchObject({model:'gpt-5.6-sol',reasoningEffort:'medium'});
});
it('routes new independent pages and account changes to a capable model',()=>{
  expect(sourceGenerationPlan('auto',7,'Crea páginas Servicios y Galería y añádelas al menú').model).toBe('gpt-5.6-sol');
  expect(sourceGenerationPlan('auto',7,'Cambia el color del botón del login').model).toBe('gpt-5.6-sol');
});

// Spec 2026-10-29 (agent cost): the build steps run on a cheaper model; planning and review keep the plan's model.
describe('agentStepModel', () => {
  const sol = sourceGenerationPlan('auto', 1, 'Rediseña toda la tienda');
  it('builds an auto sol plan on terra by default, or on the configured model', () => {
    expect(sol.model).toBe('gpt-5.6-sol');
    expect(agentStepModel(sol, undefined)).toBe('gpt-5.6-terra');
    expect(agentStepModel(sol, 'gpt-5.6-luna')).toBe('gpt-5.6-luna');
    expect(agentStepModel(sol, 'gpt-5.6-sol')).toBe('gpt-5.6-sol');
  });
  it('keeps a named model', () => {
    expect(agentStepModel(sourceGenerationPlan('gpt-5.6-sol', 1, 'Rediseña toda la tienda'), 'gpt-5.6-terra')).toBe('gpt-5.6-sol');
  });
  it('never upgrades a cheaper auto pick', () => {
    const luna = sourceGenerationPlan('auto', 1, 'Cambia el color del botón');
    expect(luna.model).toBe('gpt-5.6-luna');
    expect(agentStepModel(luna, 'gpt-5.6-terra')).toBe('gpt-5.6-luna');
  });
  it('ignores an unknown or non-GPT step model', () => {
    expect(agentStepModel(sol, 'gpt-4o')).toBe('gpt-5.6-terra');
    expect(agentStepModel(sol, 'claude-sonnet-5')).toBe('gpt-5.6-terra');
  });
});

describe('merchant model choice (spec 2026-11-04 §7)', () => {
  it('without the picker every merchant request is auto', () => {
    expect(merchantModelChoice('claude-opus-5-5', false)).toBe('auto');
    expect(merchantModelChoice('gpt-5.6-luna', false)).toBe('auto');
    expect(merchantModelChoice(undefined, false)).toBe('auto');
  });
  it('with the picker the choice passes through', () => {
    expect(merchantModelChoice('gpt-5.6-sol', true)).toBe('gpt-5.6-sol');
    expect(merchantModelChoice(undefined, true)).toBeUndefined();
  });
  it('a merchant\'s queued chat message reaches the job as auto when the picker is off, and as asked when it is on', () => {
    const jobs = { create: jest.fn() };
    const input = { revision: 1, instruction: 'Hola', model: 'claude-opus-5-5' } as any;
    new SourceChatJobsController(jobs as any, { get: () => false } as any).create({ id: 'm' }, 's', input);
    expect(jobs.create).toHaveBeenLastCalledWith('m', 's', expect.objectContaining({ model: 'auto' }));
    new SourceChatJobsController(jobs as any, { get: (key: string) => key === 'app.yapiModelPicker' } as any).create({ id: 'm' }, 's', input);
    expect(jobs.create).toHaveBeenLastCalledWith('m', 's', expect.objectContaining({ model: 'claude-opus-5-5' }));
  });
});
