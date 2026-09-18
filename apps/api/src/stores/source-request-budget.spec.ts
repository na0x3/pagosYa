import { SourceRequestBudget } from './source-request-budget';
import { sourceUsage } from './source-generation-policy';

it('deducts conversation and failed generation usage before sizing a repair with a different model', () => {
  const budget = new SourceRequestBudget(10);
  budget.reserve('gpt-5.6-terra', 2000, 2000).settle({ input_tokens: 2000, output_tokens: 1000 });
  budget.reserve('gpt-5.6-luna', 3500, 4000).settle({ input_tokens: 3500, output_tokens: 4000 });
  const repair = budget.reserve('gpt-5.6-sol', 3500, 10000, 2000);
  expect(repair.outputTokens).toBeLessThan(10000);
  const cost = sourceUsage('gpt-5.6-sol', { input_tokens: 3500, input_tokens_details: { cache_write_tokens: 3500 }, output_tokens: repair.outputTokens })!.providerMicroUsd;
  expect(cost + 16000 + 5500).toBeLessThanOrEqual(100000);
});

it('does not allow the observed two-credit Luna-to-Sol overspend', () => {
  const budget = new SourceRequestBudget(2);
  budget.reserve('gpt-5.6-luna', 3500, 4000).settle({ input_tokens: 3500, output_tokens: 4000 });
  expect(() => budget.reserve('gpt-5.6-sol', 3500, 4000, 2000)).toThrow('límite restante');
});

it('keeps unknown usage reserved and only settles a call once', () => {
  const budget = new SourceRequestBudget(1);
  const call = budget.reserve('gpt-5.6-luna', 1000, 10000);
  call.settle(null);
  call.settle({ input_tokens: 0, output_tokens: 0 });
  expect(() => budget.reserve('gpt-5.6-luna', 1000, 1000)).toThrow('límite restante');
});

it('fails before spending for invalid limits and unpriced models', () => {
  for (const limit of [0, 501, NaN, 1.5]) expect(() => new SourceRequestBudget(limit)).toThrow();
  expect(() => new SourceRequestBudget().reserve('unpriced', 1000, 1000)).toThrow('tarifa');
});
