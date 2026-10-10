import { ServiceUnavailableException } from '@nestjs/common';
import { isClaude, sourceProvider, sourceSeesImages } from './source-provider';
import { SOURCE_MODELS, sourceConversationModel } from './source-generation-policy';

const config = (values: Record<string, unknown>) => ({ get: (key: string) => values[key] }) as any;

describe('local ChatGPT plan', () => {
  const values = { 'app.environment': 'development', 'app.chatgptPlan': { url: 'http://127.0.0.1:54321/v1/responses', secret: 'local-only' }, 'app.openAi.apiKey': 'paid-key', 'app.anthropic.apiKey': 'paid-key' };
  it('routes GPT requests to the local bridge even when a paid key exists', () => {
    expect(sourceProvider(config(values), 'gpt-5.6-sol')).toEqual({ name: 'ChatGPT plan', apiKey: 'local-only', endpoint: values['app.chatgptPlan'].url });
  });
  it('rejects paid providers and production instead of falling back', () => {
    expect(() => sourceProvider(config(values), 'claude-sonnet-5')).toThrow('desactivados');
    expect(() => sourceProvider(config(values), 'deepseek-v4-flash')).toThrow('desactivados');
    expect(() => sourceProvider(config({ ...values, 'app.environment': 'production' }), 'gpt-5.6-sol')).toThrow('desarrollo local');
  });
});

describe('Claude models', () => {
  it('are priced like every other model and recognised as Claude', () => {
    for (const id of ['claude-opus-5-5', 'claude-sonnet-5', 'claude-haiku-4-5-20251001']) {
      expect(Object.hasOwn(SOURCE_MODELS, id)).toBe(true);
      expect(isClaude(id)).toBe(true);
    }
    expect(isClaude('gpt-5.6-terra')).toBe(false);
  });
  it('talk to Anthropic with the Anthropic key, and say which key is missing', () => {
    expect(sourceProvider(config({ 'app.anthropic.apiKey': 'sk-ant-test' }), 'claude-sonnet-5')).toEqual({ name: 'Anthropic', apiKey: 'sk-ant-test', endpoint: 'https://api.anthropic.com/v1/messages' });
    expect(() => sourceProvider(config({}), 'claude-sonnet-5')).toThrow(ServiceUnavailableException);
    expect(() => sourceProvider(config({}), 'claude-sonnet-5')).toThrow('ANTHROPIC_API_KEY');
  });
  it('keep the conversation on the economical OpenAI model the chat is built for', () => {
    expect(sourceConversationModel('claude-opus-5-5' as any, undefined)).toBe('gpt-5.6-luna');
  });
});

describe('sourceSeesImages', () => {
  it('is false only for DeepSeek models without vision, which reject images', () => {
    expect(['gpt-5.5', 'claude-opus-5-5', 'deepseek-v4-flash-vision-exp', 'deepseek-v4-pro'].map(sourceSeesImages)).toEqual([true, true, true, false]);
  });
});
