import { BadRequestException } from '@nestjs/common';
import { KEPT_SETTINGS, RetentionService } from './retention.service';

/** Popups 2.0 part 1 (spec 2026-11-18 §7): the LIVE design served, signups tagged with it, one personal code per contact. */
const design = { id: 'cdesign0000000000000000001', storeId: 's1', status: 'LIVE', flow: [{ id: 'o', kind: 'offer' }, { id: 'c', kind: 'capture' }, { id: 'r', kind: 'reveal' }], steps: { o: '<div></div>' }, css: '', launcher: null, capture: 'whatsapp', percent: 15, composition: 'x', fingerprint: 'y', moment: 'welcome' };

function setup(over: { design?: any } = {}) {
  const codes: any[] = [];
  const prisma: any = {
    storeRetention: { findUnique: jest.fn(async () => ({ settings: { signupEnabled: true, popupDesignId: design.id } })) },
    storePopupDesign: { findFirst: jest.fn(async ({ where }: any) => { const row = 'design' in over ? over.design : design; return row && row.id === where.id && row.storeId === where.storeId && (where.status === undefined || row.status === where.status) ? row : null; }), findMany: jest.fn(async () => []) },
    storePopupEvent: { create: jest.fn(async ({ data }: any) => data), findFirst: jest.fn(async () => null) },
    storeWhatsappSubscriber: { upsert: jest.fn(async ({ create }: any) => ({ id: 'w1', ...create })) },
    storeNewsletterSubscriber: { upsert: jest.fn(async ({ create }: any) => ({ id: 'n1', ...create })) },
    promoCode: {
      findFirst: jest.fn(async ({ where }: any) => codes.find(c => c.storeId === where.storeId && (typeof where.code === 'string' ? c.code === where.code : where.code.in.includes(c.code))) ?? null),
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

describe('popup moments in retention (spec 2026-11-21 §4, §7)', () => {
  const rescueRow = { ...design, id: 'crescue00000000000000001', moment: 'rescue' };
  it('serves the LIVE moments the store has switched on, never an off one or another store\'s', async () => {
    const { service, prisma } = setup();
    prisma.storePopupDesign.findMany = jest.fn(async ({ where }: any) => [rescueRow].filter(r => where.id.in.includes(r.id) && r.storeId === where.storeId && r.status === where.status));
    await expect(service.liveMoments('s1', { popupMoments: { rescue: { id: rescueRow.id }, interest: { id: 'cgone', off: true } } } as any)).resolves.toEqual({ rescue: expect.objectContaining({ id: rescueRow.id, moment: 'rescue' }) });
    await expect(service.liveMoments('s2', { popupMoments: { rescue: { id: rescueRow.id } } } as any)).resolves.toEqual({});
  });
  it('records an event only for this store\'s own design', async () => {
    const { service, prisma } = setup();
    await service.recordPopupEvent('s1', { visitor: 'a'.repeat(24), designId: design.id, moment: 'welcome', kind: 'shown' } as any);
    expect(prisma.storePopupEvent.create).toHaveBeenCalledWith({ data: { storeId: 's1', designId: design.id, moment: 'welcome', visitor: 'a'.repeat(24), kind: 'shown', step: null } });
    await expect(service.recordPopupEvent('s2', { visitor: 'a'.repeat(24), designId: design.id, moment: 'welcome', kind: 'shown' } as any)).resolves.toEqual({ ok: true });
    expect(prisma.storePopupEvent.create).toHaveBeenCalledTimes(1);
  });
  it('code-status refuses foreign and plain codes, and says a used code is not active', async () => {
    const { service, codes } = setup();
    codes.push({ storeId: 's1', code: 'POPAAA234', isActive: true, popupDesignId: design.id, discountValue: 15, maxUses: 1 }, { storeId: 's1', code: 'PEPPA10', isActive: true, popupDesignId: null, discountValue: 10 }, { storeId: 's1', code: 'POPUSED22', isActive: true, popupDesignId: design.id, discountValue: 15, maxUses: 1 });
    (service as any).promoCodes = { resolveActiveForStore: jest.fn(async (_s: string, code: string) => { if (code === 'POPUSED22') throw new Error('Este código ya se usó'); return codes.find(c => c.code === code); }) };
    await expect(service.popupCodeStatus('s1', 'popaaa234')).resolves.toEqual({ active: true, percent: 15 });
    await expect(service.popupCodeStatus('s1', 'PEPPA10')).resolves.toEqual({ active: false });
    await expect(service.popupCodeStatus('s2', 'POPAAA234')).resolves.toEqual({ active: false });
    await expect(service.popupCodeStatus('s1', 'POPUSED22')).resolves.toEqual({ active: false });
  });
  it('keeps the family pointers when the other retention settings are saved', () => {
    expect(KEPT_SETTINGS).toEqual(expect.arrayContaining(['popupMoments']));
  });
});

describe('one code per shopper across the family (final review I1)', () => {
  it('a contact who already got a code from one popup gets the same code from another', async () => {
    const { service, prisma, codes } = setup();
    const rescue = { ...design, id: 'crescue00000000000000001', moment: 'rescue' };
    prisma.storePopupDesign.findFirst = jest.fn(async ({ where }: any) => [design, rescue].find(r => r.id === where.id && r.storeId === where.storeId && (where.status === undefined || r.status === where.status)) ?? null);
    prisma.storePopupDesign.findMany = jest.fn(async ({ where }: any) => [design, rescue].filter(r => r.storeId === where.storeId).map(r => ({ id: r.id })));
    prisma.promoCode.findFirst = jest.fn(async ({ where }: any) => codes.find(c => c.storeId === where.storeId && (typeof where.code === 'string' ? c.code === where.code : where.code.in.includes(c.code))) ?? null);
    const first = await service.subscribe(store, null, { phone: '71234567', source: 'popup', popupDesignId: design.id } as any);
    const second = await service.subscribe(store, null, { phone: '71234567', source: 'popup', popupDesignId: rescue.id } as any);
    expect(second.code).toBe(first.code);
    expect(codes).toHaveLength(1);
  });
});

describe('the popups a store page gets (final review I7)', () => {
  it('sends the other moments even when the welcome is switched off', async () => {
    const { service, prisma } = setup();
    const rescueRow = { ...design, id: 'crescue00000000000000001', moment: 'rescue' };
    prisma.storePopupDesign.findMany = jest.fn(async () => [rescueRow]);
    const off = await service.publicPopups('s1', { popupDesignId: null, popupDesignOff: design.id, popupMoments: { rescue: { id: rescueRow.id } } } as any);
    expect(off.popupDesign).toBeUndefined();
    expect(Object.keys(off.popupMoments ?? {})).toEqual(['rescue']);
    const both = await service.publicPopups('s1', { popupDesignId: design.id, popupMoments: { rescue: { id: rescueRow.id } } } as any);
    expect(both.popupDesign).toMatchObject({ id: design.id });
    expect(await service.publicPopups('s1', {} as any)).toEqual({});
  });
});

describe('popup events cannot be inflated (minor 3)', () => {
  it('records one event per visitor, design and kind in 30 minutes, and only for the design\'s own moment', async () => {
    const { service, prisma } = setup();
    let last: any = null;
    prisma.storePopupEvent.findFirst = jest.fn(async () => last);
    prisma.storePopupEvent.create = jest.fn(async ({ data }: any) => { last = data; return data; });
    const event = { visitor: 'a'.repeat(24), designId: design.id, moment: 'welcome', kind: 'shown' } as any;
    await service.recordPopupEvent('s1', event);
    await service.recordPopupEvent('s1', event);
    expect(prisma.storePopupEvent.create).toHaveBeenCalledTimes(1);
    expect(prisma.storePopupEvent.findFirst).toHaveBeenLastCalledWith({ where: { storeId: 's1', designId: design.id, visitor: event.visitor, kind: 'shown', createdAt: { gte: expect.any(Date) } }, select: { id: true } });
    last = null;
    await service.recordPopupEvent('s1', { ...event, moment: 'rescue' });
    expect(prisma.storePopupEvent.create).toHaveBeenCalledTimes(1);
  });
});
