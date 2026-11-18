import { BadRequestException } from '@nestjs/common';
import { KEPT_SETTINGS, RetentionService } from './retention.service';

/** Popups 2.0 part 1 (spec 2026-11-18 §7): the LIVE design served, signups tagged with it, one personal code per contact. */
const design = { id: 'cdesign0000000000000000001', storeId: 's1', status: 'LIVE', flow: [{ id: 'o', kind: 'offer' }, { id: 'c', kind: 'capture' }, { id: 'r', kind: 'reveal' }], steps: { o: '<div></div>' }, css: '', launcher: null, capture: 'whatsapp', percent: 15, composition: 'x', fingerprint: 'y' };

function setup(over: { design?: any } = {}) {
  const codes: any[] = [];
  const prisma: any = {
    storeRetention: { findUnique: jest.fn(async () => ({ settings: { signupEnabled: true, popupDesignId: design.id } })) },
    storePopupDesign: { findFirst: jest.fn(async ({ where }: any) => { const row = 'design' in over ? over.design : design; return row && row.id === where.id && row.storeId === where.storeId && row.status === where.status ? row : null; }) },
    storeWhatsappSubscriber: { upsert: jest.fn(async ({ create }: any) => ({ id: 'w1', ...create })) },
    storeNewsletterSubscriber: { upsert: jest.fn(async ({ create }: any) => ({ id: 'n1', ...create })) },
    promoCode: {
      findFirst: jest.fn(async ({ where }: any) => codes.find(c => c.storeId === where.storeId && c.code === where.code) ?? null),
      create: jest.fn(async ({ data }: any) => { codes.push(data); return data; }),
    },
    paymentLink: { findMany: jest.fn(async () => [{ id: 'p1', variants: [] }]) },
  };
  prisma.$transaction = (fn: any) => fn(prisma);
  const config: any = { get: (key: string) => (key === 'app.orderTrackingSecret' ? 'test-secret-xxxxxxxxxxxxxxxxxxxxxxxx' : undefined) };
  const service = new RetentionService(prisma, config, { send: jest.fn() } as any);
  return { prisma, service, codes };
}
const store = { id: 's1', slug: 'calima', name: 'Calima' };

describe('popup designs in retention', () => {
  it('serves the LIVE design of this store only', async () => {
    const { service } = setup();
    await expect(service.liveDesign('s1', { popupDesignId: design.id } as any)).resolves.toEqual({ id: design.id, flow: design.flow, steps: design.steps, css: '', launcher: null, capture: 'whatsapp', percent: 15 });
    await expect(setup({ design: { ...design, status: 'FAILED' } }).service.liveDesign('s1', { popupDesignId: design.id } as any)).resolves.toBeNull();
    await expect(service.liveDesign('s2', { popupDesignId: design.id } as any)).resolves.toBeNull();
    await expect(service.liveDesign('s1', {} as any)).resolves.toBeNull();
  });

  it('saves a WhatsApp signup with the design and gives one tagged personal code', async () => {
    const { service, prisma, codes } = setup();
    const first = await service.subscribe(store, null, { phone: '71234567', source: 'popup', popupDesignId: design.id, favourite: 'p1' } as any);
    expect(prisma.storeWhatsappSubscriber.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ popupDesignId: design.id, favourite: 'p1' }) }));
    expect(first).toEqual({ subscribed: true, code: expect.stringMatching(/^POP[A-Z0-9]{6}$/) });
    expect(codes[0]).toMatchObject({ discountType: 'PERCENT', discountValue: 15, maxUses: 1, popupDesignId: design.id });
    const again = await service.subscribe(store, null, { phone: '71234567', source: 'popup', popupDesignId: design.id } as any);
    expect(again).toEqual(first);
    expect(codes).toHaveLength(1);
  });

  it('asks for the contact the design wants, and refuses a design that is not live', async () => {
    const { service } = setup();
    await expect(service.subscribe(store, 'ana@x.bo', { source: 'popup', popupDesignId: design.id } as any)).rejects.toThrow('Esta tienda pide tu WhatsApp');
    await expect(setup({ design: null }).service.subscribe(store, null, { phone: '71234567', source: 'popup', popupDesignId: design.id } as any)).rejects.toBeInstanceOf(BadRequestException);
  });
  // Final review 2026-11-18 (I2): saving the Comeback/welcome settings must not switch the YAPI popup off.
  it('keeps the YAPI popup settings when the other retention settings are saved', () => {
    expect(KEPT_SETTINGS).toEqual(expect.arrayContaining(['popupDesignId', 'popupDesignOff', 'popupDesignPercent', 'popupDesignCapture']));
  });
  it('keeps only answers the design\'s quiz offers as interests', async () => {
    const quizDesign = { ...design, flow: [{ id: 'q', kind: 'quiz', questions: [{ id: 'a', text: '¿Picante?', answers: [{ id: 's', text: 'Muy picante', products: ['p1'] }] }] }, ...design.flow] };
    const { service, prisma } = setup({ design: quizDesign });
    await service.subscribe(store, null, { phone: '71234567', source: 'popup', popupDesignId: design.id, answers: ['Muy picante', 'compra en http://x.test'] } as any);
    expect(prisma.storeWhatsappSubscriber.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ interests: ['Muy picante'] }) }));
  });
});
