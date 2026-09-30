import { UnauthorizedException } from '@nestjs/common';
import { StoreCustomersController } from './store-customers.controller';

const limit = (handler: unknown) => ({ limit: Reflect.getMetadata('THROTTLER:LIMITdefault', handler as object), ttl: Reflect.getMetadata('THROTTLER:TTLdefault', handler as object) });

describe('StoreCustomersController', () => {
  const proto = StoreCustomersController.prototype as any;

  it('limits every unauthenticated route by IP, more tightly for the ones that send mail or guess passwords', () => {
    expect(limit(proto.login)).toEqual({ limit: 10, ttl: 60_000 });
    expect(limit(proto.register)).toEqual({ limit: 5, ttl: 3_600_000 });
    expect(limit(proto.forgotPassword)).toEqual({ limit: 5, ttl: 3_600_000 });
    expect(limit(proto.resetPassword)).toEqual({ limit: 10, ttl: 3_600_000 });
    expect(limit(proto.verifyEmail)).toEqual({ limit: 10, ttl: 3_600_000 });
  });

  it('limits the authenticated routes that change data or check a password too', () => {
    for (const name of ['updateMe', 'replaceAddresses', 'deleteMe']) expect({ name, set: limit(proto[name]).limit > 0 }).toEqual({ name, set: true });
  });

  it('reads the session token only from a well-formed Bearer header and passes the store slug along', async () => {
    const customers: any = { authenticate: jest.fn(async () => ({ id: 'c1' })), orders: jest.fn(async () => []) };
    const controller = new StoreCustomersController(customers);
    await controller.me('cafe', 'Bearer abcdefghijklmnopqrstuvwxyz0123456789');
    expect(customers.authenticate).toHaveBeenCalledWith('cafe', 'abcdefghijklmnopqrstuvwxyz0123456789');
    for (const header of [undefined, '', 'abc', 'Basic abcdefghijklmnopqrstuvwxyz', 'Bearer ', 'Bearer a b', 'Bearer ' + 'x'.repeat(300)]) {
      customers.authenticate.mockClear();
      expect(() => controller.me('cafe', header as any)).toThrow(UnauthorizedException);
      expect(customers.authenticate).not.toHaveBeenCalled();
    }
  });

  it('answers with no-store caching on every route, because every answer is personal or a token', () => {
    const names = ['register', 'verifyEmail', 'login', 'logout', 'forgotPassword', 'resetPassword', 'me', 'updateMe', 'replaceAddresses', 'orders', 'subscriptions', 'exportMe', 'deleteMe'];
    for (const name of names) {
      const headers: Array<{ name: string; value: string }> = Reflect.getMetadata('__headers__', proto[name]) ?? [];
      expect({ name, noStore: headers.some(header => header.name === 'Cache-Control' && header.value === 'no-store') }).toEqual({ name, noStore: true });
    }
  });
});
