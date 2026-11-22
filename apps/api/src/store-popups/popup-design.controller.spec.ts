import { NotFoundException } from '@nestjs/common';
import { PopupDesignController } from './popup-design.controller';
import { PopupDesignService } from './popup-design.service';

/** Popups 2.0 part 1 (spec 2026-11-18 §9): the Popups page only ever reads or changes the merchant's own store. */
describe('PopupDesignController', () => {
  const prisma: any = {
    store: { findFirst: jest.fn(async ({ where }: any) => (where.merchantId === 'm1' && where.id === 's1' ? { id: 's1', name: 'Calima', slug: 'calima', merchantId: 'm1', onboarding: null } : null)) },
    storeRetention: { findUnique: jest.fn(async () => ({ settings: { popupDesignId: 'cd1', popupDesignPercent: 15 } })), upsert: jest.fn() },
    storePopupDesign: { findMany: jest.fn(async () => [{ id: 'cd1', version: 2, status: 'LIVE', composition: 'Ticket', previews: [{ stepId: 'o', url: '/v1/uploads/o.jpg' }], percent: 15, capture: 'whatsapp', flow: [{ id: 'o', kind: 'offer' }, { id: 'p', kind: 'pick', products: ['p1', 'p2'] }], createdAt: new Date() }]), findFirst: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    paymentLink: { findMany: jest.fn(async () => [{ id: 'p1', name: 'Habanero' }, { id: 'p2', name: 'Serrano' }, { id: 'p3', name: 'Jalapeño' }]) },
    storePopupEvent: { groupBy: jest.fn(async () => []) },
  };
  const controller = new PopupDesignController(new PopupDesignService(prisma, { get: () => undefined } as any, {} as any));

  it('refuses another merchant\'s store on every route', async () => {
    await expect(controller.overview({ id: 'm2' }, 's1')).rejects.toBeInstanceOf(NotFoundException);
    await expect(controller.restore({ id: 'm2' }, 's1', 'cd1')).rejects.toBeInstanceOf(NotFoundException);
    await expect(controller.settings({ id: 'm2' }, 's1', { percent: 20 })).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.storePopupDesign.update).not.toHaveBeenCalled();
  });

  it('gives the owner the versions, the live one, the settings and the products for «¿qué buscas?»', async () => {
    const overview = await controller.overview({ id: 'm1' }, 's1');
    expect(overview).toMatchObject({ liveId: 'cd1', on: true, percent: 15, capture: 'whatsapp', pick: ['p1', 'p2'], products: [{ id: 'p1', name: 'Habanero' }, { id: 'p2', name: 'Serrano' }, { id: 'p3', name: 'Jalapeño' }] });
    expect(overview.designs[0]).toMatchObject({ id: 'cd1', version: 2, status: 'LIVE', previews: [{ stepId: 'o', url: '/v1/uploads/o.jpg' }] });
    expect(overview.designs[0]).not.toHaveProperty('flow');
  });
});
