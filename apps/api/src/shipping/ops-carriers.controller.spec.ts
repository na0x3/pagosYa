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
  it('rejects templates with quotes, angle brackets or whitespace (they would break out of the buyer page href)', async () => {
    tx.shippingCarrier.update.mockClear();
    for (const template of ['https://x.example/{tracking}" onmouseover="alert(1)', "https://x.example/{tracking}'", 'https://x.example/<b>{tracking}', 'https://x.example/{tracking}>', 'https://x.example/a b/{tracking}', 'https://x.example/\t{tracking}', 'https://x.example/{tracking}`']) {
      await expect(controller.update({ id: 'ops_1' } as any, 'car_ocs', { trackingUrlTemplate: template })).rejects.toThrow('La plantilla no puede tener comillas, < > ni espacios.');
    }
    expect(tx.shippingCarrier.update).not.toHaveBeenCalled();
  });
  it('clears the tracking template when given an empty string', async () => {
    await controller.update({ id: 'ops_1' } as any, 'car_ocs', { trackingUrlTemplate: '' });
    expect(tx.shippingCarrier.update).toHaveBeenCalledWith({ where: { id: 'car_ocs' }, data: { trackingUrlTemplate: null } });
  });
  it('clears the tracking template when given only whitespace', async () => {
    await controller.update({ id: 'ops_1' } as any, 'car_ocs', { trackingUrlTemplate: '   ' });
    expect(tx.shippingCarrier.update).toHaveBeenCalledWith({ where: { id: 'car_ocs' }, data: { trackingUrlTemplate: null } });
  });
  it('still accepts a valid https template', async () => {
    await controller.update({ id: 'ops_1' } as any, 'car_ocs', { trackingUrlTemplate: 'https://x.example/{tracking}' });
    expect(tx.shippingCarrier.update).toHaveBeenCalledWith({ where: { id: 'car_ocs' }, data: { trackingUrlTemplate: 'https://x.example/{tracking}' } });
  });
});
