import { AiUsageService } from './ai-usage.service';
it('records image token usage without inventing a price or storing response content', async () => {
  const create = jest.fn(); const service = new AiUsageService({ storeAiUsage: { create } } as any);
  await service.record('s1', 'visual-image', 'gpt-image-2', { id: 'r1', data: [{ b64_json: 'private-image' }], usage: { input_tokens: 100, output_tokens: 200, output_tokens_details: { image_tokens: 180 }, prompt: 'private text' } }, 2000, 'COMPLETED');
  const data = create.mock.calls[0][0].data;
  expect(data.usage).toEqual({ providerMicroUsd: null, providerUsage: { input_tokens: 100, output_tokens: 200, output_tokens_details: { image_tokens: 180 } } });
  expect(JSON.stringify(data)).not.toContain('private');
});
it('keeps a completed task usable if telemetry storage fails', async () => {
  const service = new AiUsageService({ storeAiUsage: { create: jest.fn().mockRejectedValue(new Error('database error')) } } as any);
  jest.spyOn((service as any).logger, 'error').mockImplementation(() => {});
  await expect(service.record('s', 'conversation', 'gpt-5.6-terra', null, 100, 'FAILED')).resolves.toBeUndefined();
});

it('persists failure diagnostics even without usage and excludes untrusted details', async () => {
  const create = jest.fn(); const service = new AiUsageService({ storeAiUsage: { create } } as any);
  await service.record('s', 'conversation', 'gpt-5.6-sol', { error: { message: 'private error' } }, 120007, 'FAILED', {
    code: 'timeout', attempt: 1, timeoutMs: 120000, httpStatus: 503, requestId: 'req_123', providerStatus: 'private status',
    incompleteReason: 'private reason', message: 'private prompt', apiKey: 'private key',
  } as any);
  const data = create.mock.calls[0][0].data;
  expect(data.usage).toEqual({ providerMicroUsd: null, diagnostic: { code: 'timeout', attempt: 1, timeoutMs: 120000, httpStatus: 503, requestId: 'req_123' } });
  expect(JSON.stringify(data)).not.toContain('private');
});
