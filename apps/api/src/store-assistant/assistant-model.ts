import type { ConfigService } from '@nestjs/config';
import { openAiAgentModel } from '../storefront-source/agent/agent-model';
import { DEFAULT_MAX_CREDITS } from '../storefront-source/source-generation-policy';
import { sourceProvider } from '../storefront-source/source-provider';
import { SourceRequestBudget } from '../storefront-source/source-request-budget';
import type { AssistantModel } from './assistant-loop';

export const ASSISTANT_MODEL_FACTORY = Symbol('ASSISTANT_MODEL_FACTORY');
export type AssistantModelFactory = (input: {
  storeId: string; signal: AbortSignal;
  onTurn: (turn: { body: any; durationMs: number; status: 'COMPLETED' | 'FAILED' }) => Promise<void>;
}) => { model: AssistantModel; modelName: string };

/** The conversation tier through the same provider plumbing as YAPI (OpenAI, or the local ChatGPT-plan bridge in dev). */
export function defaultAssistantModelFactory(config: ConfigService): AssistantModelFactory {
  return ({ storeId, signal, onTurn }) => {
    const modelName = config.get<string>('app.openAi.conversationModel') ?? 'gpt-5.6-luna';
    const provider = sourceProvider(config, modelName);
    const model = openAiAgentModel({
      endpoint: provider.endpoint, apiKey: provider.apiKey, model: modelName, providerName: provider.name,
      budget: new SourceRequestBudget(DEFAULT_MAX_CREDITS, Boolean(config.get('app.chatgptPlan'))),
      maxOutputTokens: 1200, reasoningEffort: 'low', promptCacheKey: `assistant-${storeId}`, signal, onTurn,
    }) as unknown as AssistantModel;
    return { model, modelName };
  };
}
