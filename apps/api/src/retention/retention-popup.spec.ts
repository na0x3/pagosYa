import { BadRequestException } from '@nestjs/common';
import { RetentionService, publicRetentionSettings } from './retention.service';
import { DEFAULT_RETENTION } from './retention.dto';

// The signup popup (plan 2026-10-20-store-popup): its timing and welcome code live in the store's retention settings,
// and the code only leaves the server after a popup signup, only when it is this store's active code.
const CODES = [
  { id: 'own', storeId: 's1', code: 'PEPPA10', isActive: true },
  { id: 'off', storeId: 's1', code: 'OLD', isActive: false },
  { id: 'foreign', storeId: 's2', code: 'OTHER', isActive: true },
];
function service(saved: Record<string, unknown> = {}) {
  const findFirst = jest.fn(async ({ where }: any) => CODES.find(c => c.id === where.id && c.storeId === where.storeId && c.isActive === where.isActive) || null);
  const tx = {
    storeRetention: { findUnique: jest.fn(async () => null), create: jest.fn(async ({ data }: any) => data), updateMany: jest.fn(async () => ({ count: 1 })) },
    storeNewsletterSubscriber: { upsert: jest.fn(async () => ({ id: 'sub1' })) },
    storeEmailDelivery: { upsert: jest.fn() },
  };
  const prisma = {
    store: { findFirst: jest.fn(async () => ({ id: 's1', merchantId: 'm1' })) },
    promoCode: { findFirst },
    storeRetention: { findUnique: jest.fn(async () => ({ settings: { ...DEFAULT_RETENTION, signupEnabled: true, ...saved }, revision: 1 })) },
    category: { findMany: jest.fn(async () => []) },
    $transaction: jest.fn(async (fn: any) => fn(tx)),
  };
  const s = Object.create(RetentionService.prototype); s.prisma = prisma;
  return { s, prisma, tx };
}
const dto = (over: Record<string, unknown> = {}) => ({ ...DEFAULT_RETENTION, revision: 0, signupEnabled: true, ...over }) as any;
const store = { id: 's1', slug: 'peppa', name: 'PEPPA please' };

describe('signup popup settings', () => {
  it('refuses a welcome code that is inactive or belongs to another store', async () => {
    for (const id of ['off', 'foreign']) await expect(service().s.save('m1', 's1', dto({ popupPromoCodeId: id }))).rejects.toThrow(new BadRequestException('Elige un código activo de esta tienda.'));
  });
  it('saves the timing and the store own active code', async () => {
    const { s, tx } = service();
    await s.save('m1', 's1', dto({ popupTrigger: 'delay', popupDelaySeconds: 12, popupPromoCodeId: 'own' }));
    expect(tx.storeRetention.create.mock.calls[0][0].data.settings).toMatchObject({ popupTrigger: 'delay', popupDelaySeconds: 12, popupPromoCodeId: 'own' });
  });
  it('defaults to both triggers after eight seconds and no code', () => {
    expect(DEFAULT_RETENTION).toMatchObject({ popupTrigger: 'both', popupDelaySeconds: 8, popupPromoCodeId: null });
  });
});

describe('popup signup', () => {
  it('hands out the store active code only to a popup signup', async () => {
    expect(await service({ popupPromoCodeId: 'own' }).s.subscribe(store, 'ana@example.com', { source: 'popup' })).toEqual({ subscribed: true, code: 'PEPPA10' });
    expect(await service({ popupPromoCodeId: 'own' }).s.subscribe(store, 'ana@example.com', {})).toEqual({ subscribed: true });
  });
  it('gives no code when the saved code was switched off or none is set', async () => {
    expect(await service({ popupPromoCodeId: 'off' }).s.subscribe(store, 'ana@example.com', { source: 'popup' })).toEqual({ subscribed: true });
    expect(await service().s.subscribe(store, 'ana@example.com', { source: 'popup' })).toEqual({ subscribed: true });
  });
});

describe('public popup settings', () => {
  it('carry the timing and whether a code exists, never the code or its id', () => {
    const out = publicRetentionSettings({ ...DEFAULT_RETENTION, signupEnabled: true, popupTrigger: 'exit', popupDelaySeconds: 5, popupPromoCodeId: 'own' } as any);
    expect(out).toMatchObject({ signupEnabled: true, popupTrigger: 'exit', popupDelaySeconds: 5, popupHasCode: true });
    expect(JSON.stringify(out)).not.toMatch(/own|PEPPA10|popupPromoCodeId/);
  });
});
