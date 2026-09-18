import { OpsCarriersController } from './ops-carriers.controller';

describe('OpsCarriersController', () => {
  const tx = { shippingCarrier: { update: jest.fn(async ({ data }: any) => ({ id: 'car_ocs', ...data })) } };
  const prisma: any = { $transaction: (fn: any) => fn(tx), shippingCarrier: { findMany: jest.fn(async () => []) }, shipment: { findMany: jest.fn(async () => []) } };
  const audit = { record: jest.fn(async () => undefined) };
  const controller = new OpsCarriersController(prisma, audit as any);
  it('updates a carrier and writes an audit entry', async () => {
    await controller.update({ id: 'ops_1' } as any, 'car_ocs', { trackingUrlTemplate: 'https://ocs.example/t/{tracking}', platformMarginBps: 500 });
    expect(tx.shippingCarrier.update).toHaveBeenCalledWith({ where: { id: 'car_ocs' }, data: { trackingUrlTemplate: 'https://ocs.example/t/{tracking}', platformMarginBps: 500 } });
    expect(audit.record).toHaveBeenCalledTimes(1);
  });
  it('rejects templates without the placeholder or not on https', async () => {
    await expect(controller.update({ id: 'ops_1' } as any, 'car_ocs', { trackingUrlTemplate: 'http://x.example/{tracking}' })).rejects.toThrow('https');
    await expect(controller.update({ id: 'ops_1' } as any, 'car_ocs', { trackingUrlTemplate: 'https://x.example/' })).rejects.toThrow('{tracking}');
  });
});
