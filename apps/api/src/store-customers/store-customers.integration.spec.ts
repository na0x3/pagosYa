import type { PrismaClient } from '@prisma/client';
import { integrationDatabase } from '../common/testing/integration-database';
import { StoreCustomersService } from './store-customers.service';

const harness = integrationDatabase('customer_auth');
harness.describeDb('customer credential races (real Postgres)', () => {
  if (!harness.available) { harness.failIfUnavailable(); return; }
  let db: PrismaClient, service: StoreCustomersService;
  const slug = 'customer-auth-test', email = 'shopper@example.test';
  const mail = { send: jest.fn(async (_message: any) => undefined) };
  const token = (index = -1) => new URL(mail.send.mock.calls.at(index)![0].body.match(/https?:\/\/\S+/)![0]).searchParams.get('token')!;
  jest.setTimeout(120_000);
  beforeAll(async () => {
    db = await harness.create();
    const merchant = await db.merchant.create({ data: { name: 'Test', email: 'merchant@example.test' } });
    await db.store.create({ data: { merchantId: merchant.id, name: 'Test', slug, status: 'ACTIVE', publicVisibility: true } });
    service = new StoreCustomersService(db as any, { get: () => 'https://pay.example.test' } as any, mail as any);
  });
  afterAll(() => harness.drop());
  beforeEach(async () => { await db.storeCustomer.deleteMany(); mail.send.mockClear(); });
  it('serializes simultaneous registrations and binds the surviving link to its password', async () => {
    await Promise.all(['password-one', 'password-two'].map(password => service.register(slug, { name: password, email, password })));
    expect(await db.storeCustomer.count()).toBe(1);
    let successes = 0;
    for (let i = 0; i < 2; i++) {
      try { await service.verifyEmail(slug, token(i)); }
      catch { continue; }
      successes++;
      const password = mail.send.mock.calls[i][0].body.match(/^Hola ([^,]+),/)[1];
      await expect(service.login(slug, email, password)).resolves.toHaveProperty('token');
      await expect(service.login(slug, email, password === 'password-one' ? 'password-two' : 'password-one')).rejects.toThrow();
    }
    expect(successes).toBe(1);
  });
  it('consumes a verification link only once under concurrency', async () => {
    await service.register(slug, { name: 'Ana', email, password: 'password-one' });
    const link = token();
    const results = await Promise.allSettled([service.verifyEmail(slug, link), service.verifyEmail(slug, link)]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
  });
  it('rolls back token consumption if a password update fails, then resets and revokes all sessions', async () => {
    await service.register(slug, { name: 'Ana', email, password: 'password-one' });
    await service.verifyEmail(slug, token());
    const session = await service.login(slug, email, 'password-one');
    await service.forgotPassword(slug, email);
    const reset = token();
    const original = (service as any).credentials.bind(service);
    const spy = jest.spyOn(service as any, 'credentials').mockImplementationOnce((work: any) => original(async (tx: any) => { await work(tx); throw new Error('simulated database failure'); }));
    await expect(service.resetPassword(slug, reset, 'password-two')).rejects.toThrow('simulated database failure');
    spy.mockRestore();
    await expect(service.authenticate(slug, session.token)).resolves.toBeDefined();
    await expect(service.resetPassword(slug, reset, 'password-two')).resolves.toEqual({ ok: true });
    await expect(service.authenticate(slug, session.token)).rejects.toThrow();
    await expect(service.login(slug, email, 'password-one')).rejects.toThrow();
    await expect(service.login(slug, email, 'password-two')).resolves.toHaveProperty('token');
  });
  it('never leaves an old-password login alive after a concurrent reset', async () => {
    await service.register(slug, { name: 'Ana', email, password: 'password-one' });
    await service.verifyEmail(slug, token());
    await service.forgotPassword(slug, email);
    const reset = token();
    const [login, changed] = await Promise.allSettled([service.login(slug, email, 'password-one'), service.resetPassword(slug, reset, 'password-two')]);
    expect(changed.status).toBe('fulfilled');
    if (login.status === 'fulfilled') await expect(service.authenticate(slug, login.value.token)).rejects.toThrow();
  });
});
