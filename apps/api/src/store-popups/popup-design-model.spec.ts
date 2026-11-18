const brandCall = jest.fn();
jest.mock('../storefront-source/brand/brand-model-call', () => ({ brandCall: (...args: unknown[]) => brandCall(...args) }));
jest.mock('../storefront-source/source-provider', () => ({ sourceProvider: () => ({ endpoint: 'http://127.0.0.1:1/v1/responses', apiKey: 'k' }) }));
import { PopupDesignService } from './popup-design.service';

/** Live 2026-11-18: the usage row belongs to the store, and the model's own error reaches the merchant and the batch log. */
describe('the popup model call', () => {
  const store = { id: 's1', name: 'Calima', slug: 'calima', merchantId: 'm1', onboarding: null };
  const prisma: any = {
    store: { findFirst: jest.fn(async () => store) },
    storeRetention: { findUnique: jest.fn(async () => ({ settings: {}, updatedAt: new Date(1) })), updateMany: jest.fn(async () => ({ count: 1 })) },
    paymentLink: { findMany: jest.fn(async () => []) },
    storePopupDesign: { findMany: jest.fn(async () => []), aggregate: jest.fn(async () => ({ _max: { version: null } })), create: jest.fn(async ({ data }: any) => data) },
    $executeRaw: jest.fn(async () => 1),
  };
  prisma.$transaction = (fn: any) => fn(prisma);
  const usage = { record: jest.fn(async () => undefined) };
  const service = new PopupDesignService(prisma, { get: () => undefined } as any, { getBuffer: jest.fn(), saveBuffer: jest.fn() } as any, undefined, usage as any);

  it('records usage under the store and passes the model error on, without a second try when the allowance is used up', async () => {
    brandCall.mockImplementation(async (opts: any) => { await opts.record({ usage: {} }, 12, false); throw new Error('Model call failed: subscription_sharing_usage_limit_exceeded'); });
    const result = await service.design('m1', 's1', { createdBy: 'batch' });
    expect(usage.record).toHaveBeenCalledWith('s1', 'popup-design', expect.any(String), expect.anything(), 12, 'FAILED');
    expect(result.design.status).toBe('FAILED');
    expect(result.problems.join(' ')).toMatch(/subscription_sharing_usage_limit_exceeded/);
    expect(brandCall).toHaveBeenCalledTimes(1);
  });
});
