const productCutout = jest.fn();
jest.mock('../storefront-source/source-photo-cutout', () => ({ productCutout: (...args: unknown[]) => productCutout(...args) }));
jest.mock('sharp', () => () => ({ trim: () => ({ resize: () => ({ webp: () => ({ toBuffer: async () => Buffer.from('webp-cut') }) }) }) }));
import { PopupDesignService } from './popup-design.service';

/** Owner 2026-11-18 (Fishwife's Alia popup): the designer cuts a few product photos out locally and hands them to YAPI. */
describe('product cut-outs for the popup', () => {
  it('cuts up to 4 products out, uploads them, names them in the prompt and serves them to the browser check', async () => {
    const products = Array.from({ length: 6 }, (_, i) => ({ id: `p${i}`, name: `Lata ${i}`, amount: 1000, imageUrls: [`/v1/uploads/p${i}.jpg`] }));
    const prisma: any = {
      store: { findFirst: jest.fn(async () => ({ id: 's1', name: 'Fishwife', slug: 'fw', merchantId: 'm1', onboarding: null })) },
      storeRetention: { findUnique: jest.fn(async () => ({ settings: {}, updatedAt: new Date(1) })), updateMany: jest.fn(async () => ({ count: 1 })) },
      paymentLink: { findMany: jest.fn(async () => products) },
      storePopupDesign: { findMany: jest.fn(async () => []), aggregate: jest.fn(async () => ({ _max: { version: null } })), create: jest.fn(async ({ data }: any) => data) },
      $executeRaw: jest.fn(async () => 1),
    };
    prisma.$transaction = (fn: any) => fn(prisma);
    let saved = 0;
    const uploads: any = { getBuffer: jest.fn(async () => Buffer.from('jpg')), saveBuffer: jest.fn(async () => ({ url: `/v1/uploads/cut-${++saved}.webp`, filename: `cut-${saved}.webp`, mimeType: 'image/webp', byteSize: 8 })) };
    productCutout.mockImplementation(async () => ({ cut: Buffer.from('png') }));
    const service = new PopupDesignService(prisma, { get: () => undefined } as any, uploads);
    const prompts: string[] = [];
    service.call = jest.fn(async (prompt: string) => { prompts.push(prompt); return null; });
    let served: string[] = [];
    service.measure = jest.fn(async (input: any) => { served = Object.keys(input.photos); return []; });
    await service.design('m1', 's1', { createdBy: 'batch' });
    expect(productCutout).toHaveBeenCalledTimes(4);
    expect(prompts[0]).toContain('/v1/uploads/cut-1.webp');
    expect(prompts[0]).toContain('Lata 0');
    void served;
  });
});
