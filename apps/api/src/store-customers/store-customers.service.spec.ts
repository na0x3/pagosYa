import { BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { StoreCustomersService, CUSTOMER_GENERIC_ANSWER } from './store-customers.service';

const stores: Record<string, any> = {
  cafe: { id: 's-cafe', slug: 'cafe', name: 'Café', status: 'ACTIVE', sourcePublicationPaused: false, publicVisibility: true },
  te: { id: 's-te', slug: 'te', name: 'Té', status: 'ACTIVE', sourcePublicationPaused: false, publicVisibility: true },
};

/** A tiny in-memory stand-in for the three tables and the order/subscription reads the service uses. */
function setup(extra: { orders?: any[]; subscriptions?: any[] } = {}) {
  const customers: any[] = [], sessions: any[] = [], tokens: any[] = [];
  let n = 0;
  const match = (row: any, where: any) => Object.entries(where).every(([key, value]: [string, any]) => {
    if (key === 'storeId_email') return row.storeId === value.storeId && row.email === value.email;
    if (value && typeof value === 'object' && 'gt' in value) return row[key] > value.gt;
    if (value && typeof value === 'object' && 'in' in value) return value.in.includes(row[key]);
    return row[key] === value;
  });
  const table = (rows: any[], defaults: (data: any) => any = data => data) => ({
    findUnique: jest.fn(async ({ where, include }: any) => { const row = rows.find(r => match(r, where)); return row && include?.customer ? { ...row, customer: customers.find(c => c.id === row.customerId) } : row ?? null; }),
    create: jest.fn(async ({ data }: any) => { const row = { id: `id${++n}`, createdAt: new Date(), ...defaults(data) }; rows.push(row); return row; }),
    update: jest.fn(async ({ where, data }: any) => { const row = rows.find(r => match(r, where))!; Object.assign(row, data); return row; }),
    updateMany: jest.fn(async ({ where, data }: any) => { const hit = rows.filter(r => match(r, where)); hit.forEach(r => Object.assign(r, data)); return { count: hit.length }; }),
    deleteMany: jest.fn(async ({ where }: any) => { const hit = rows.filter(r => match(r, where)); hit.forEach(r => rows.splice(rows.indexOf(r), 1)); return { count: hit.length }; }),
  });
  const prisma: any = {
    store: { findUnique: jest.fn(async ({ where }: any) => stores[where.slug] ?? null) },
    storeCustomer: { ...table(customers, data => ({ addresses: [], emailVerifiedAt: null, deletedAt: null, phone: null, ...data })) },
    storeCustomerSession: table(sessions, data => ({ revokedAt: null, ...data })),
    storeCustomerToken: table(tokens, data => ({ usedAt: null, ...data })),
    // The real queries match the email ignoring case, newest first, at most `take` rows; the fake does the same.
    storeOrder: { findMany: jest.fn(async ({ where, take }: any) => (extra.orders ?? []).filter(o => o.storeId === where.storeId && String(o.paymentIntent?.customerEmail).toLowerCase() === where.paymentIntent.customerEmail.equals.toLowerCase()).sort((a, b) => b.createdAt - a.createdAt).slice(0, take ?? 1000)) },
    customerSubscription: { findMany: jest.fn(async ({ where }: any) => (extra.subscriptions ?? []).filter(s => s.storeId === where.storeId && String(s.customerEmail).toLowerCase() === where.customerEmail.equals.toLowerCase())) },
  };
  prisma.$transaction = jest.fn(async (work: any) => work(prisma));
  const mail: any = { send: jest.fn(async () => undefined) };
  const config: any = { get: jest.fn((key: string) => (key === 'app.checkoutOrigin' ? 'https://pay.example' : undefined)) };
  const service = new StoreCustomersService(prisma, config, mail);
  const tokenFromMail = (index = -1) => { const body = String(mail.send.mock.calls.at(index)![0].body); return new URL(body.match(/https?:\/\/\S+/)![0]).searchParams.get('token')!; };
  return { service, prisma, mail, customers, sessions, tokens, tokenFromMail };
}
const PASSWORD = 'correct horse battery';
const account = async (ctx: ReturnType<typeof setup>, slug = 'cafe', email = 'ana@example.com') => {
  await ctx.service.register(slug, { name: 'Ana', email, password: PASSWORD });
  await ctx.service.verifyEmail(slug, ctx.tokenFromMail());
  return ctx.service.login(slug, email, PASSWORD);
};

describe('StoreCustomersService', () => {
  jest.setTimeout(60_000);

  describe('register and verify', () => {
    it('creates an unverified customer, stores only a hashed password, and mails a link on the store', async () => {
      const ctx = setup();
      const answer = await ctx.service.register('cafe', { name: ' Ana ', email: 'Ana@Example.com ', password: PASSWORD });
      expect(answer).toEqual(CUSTOMER_GENERIC_ANSWER);
      expect(ctx.customers).toHaveLength(1);
      expect(ctx.customers[0]).toMatchObject({ storeId: 's-cafe', email: 'ana@example.com', name: 'Ana', emailVerifiedAt: null });
      expect(ctx.customers[0].hashedPassword).toMatch(/^\$argon2id\$/);
      expect(JSON.stringify(ctx.customers[0])).not.toContain(PASSWORD);
      const mail = ctx.mail.send.mock.calls[0][0];
      expect(mail.to).toBe('ana@example.com');
      expect(mail.body).toContain('https://pay.example/cuenta/cafe/verificar?token=');
      expect(ctx.tokens[0].hashedToken).toMatch(/^sha256:/);
      expect(JSON.stringify(ctx.tokens)).not.toContain(ctx.tokenFromMail());
    });

    it('answers the same and sends nothing for an email that is already verified, so nobody can probe for accounts', async () => {
      const ctx = setup();
      await account(ctx);
      ctx.mail.send.mockClear();
      const answer = await ctx.service.register('cafe', { name: 'Otra', email: 'ana@example.com', password: 'another password' });
      expect(answer).toEqual(CUSTOMER_GENERIC_ANSWER);
      expect(ctx.mail.send).not.toHaveBeenCalled();
      expect(ctx.customers).toHaveLength(1);
      await expect(ctx.service.login('cafe', 'ana@example.com', 'another password')).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('sends a fresh link for an email that registered but never verified, without preserving credentials from an earlier unverified registration', async () => {
      const ctx = setup();
      await ctx.service.register('cafe', { name: 'Ana', email: 'ana@example.com', password: PASSWORD });
      const oldLink = ctx.tokenFromMail();
      await ctx.service.register('cafe', { name: 'Ana', email: 'ana@example.com', password: 'someone else' });
      expect(ctx.customers).toHaveLength(1);
      expect(ctx.mail.send).toHaveBeenCalledTimes(2);
      await expect(ctx.service.verifyEmail('cafe', oldLink)).rejects.toBeInstanceOf(BadRequestException);
      await ctx.service.verifyEmail('cafe', ctx.tokenFromMail());
      await expect(ctx.service.login('cafe', 'ana@example.com', PASSWORD)).rejects.toBeInstanceOf(UnauthorizedException);
      await expect(ctx.service.login('cafe', 'ana@example.com', 'someone else')).resolves.toMatchObject({ token: expect.any(String) });
    });

    it('rejects a weak or oversized password and an invalid email before anything is stored', async () => {
      const ctx = setup();
      for (const input of [{ password: 'short' }, { password: 'x'.repeat(129) }, { email: 'not-an-email' }, { name: '' }, { name: 'n'.repeat(101) }]) {
        await expect(ctx.service.register('cafe', { name: 'Ana', email: 'ana@example.com', password: PASSWORD, ...input })).rejects.toBeInstanceOf(BadRequestException);
      }
      expect(ctx.customers).toHaveLength(0);
    });

    it('verifies once: a used, unknown or expired token is refused', async () => {
      const ctx = setup();
      await ctx.service.register('cafe', { name: 'Ana', email: 'ana@example.com', password: PASSWORD });
      const token = ctx.tokenFromMail();
      await expect(ctx.service.verifyEmail('cafe', token)).resolves.toEqual({ ok: true });
      await expect(ctx.service.verifyEmail('cafe', token)).rejects.toBeInstanceOf(BadRequestException);
      await expect(ctx.service.verifyEmail('cafe', 'nope')).rejects.toBeInstanceOf(BadRequestException);
      await ctx.service.register('cafe', { name: 'Bea', email: 'bea@example.com', password: PASSWORD });
      const late = ctx.tokenFromMail();
      ctx.tokens.find(t => !t.usedAt)!.expiresAt = new Date(Date.now() - 1000);
      await expect(ctx.service.verifyEmail('cafe', late)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('never accepts a token in another store, and an unknown store is a 404', async () => {
      const ctx = setup();
      await ctx.service.register('cafe', { name: 'Ana', email: 'ana@example.com', password: PASSWORD });
      await expect(ctx.service.verifyEmail('te', ctx.tokenFromMail())).rejects.toBeInstanceOf(BadRequestException);
      await expect(ctx.service.register('nope', { name: 'Ana', email: 'ana@example.com', password: PASSWORD })).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('login and sessions', () => {
    it('logs in only after the email is verified, and says so only after the password was right', async () => {
      const ctx = setup();
      await ctx.service.register('cafe', { name: 'Ana', email: 'ana@example.com', password: PASSWORD });
      await expect(ctx.service.login('cafe', 'ana@example.com', 'wrong password')).rejects.toThrow('Correo o contraseña incorrectos');
      await expect(ctx.service.login('cafe', 'ana@example.com', PASSWORD)).rejects.toThrow('Confirma tu correo');
      await expect(ctx.service.login('cafe', 'ghost@example.com', PASSWORD)).rejects.toThrow('Correo o contraseña incorrectos');
    });

    it('never accepts a correct 128-character password followed by extra characters', async () => {
      const ctx = setup(), password = 'x'.repeat(128);
      await ctx.service.register('cafe', { name: 'Ana', email: 'ana@example.com', password });
      await ctx.service.verifyEmail('cafe', ctx.tokenFromMail());
      const session = await ctx.service.login('cafe', 'ana@example.com', password);
      await expect(ctx.service.login('cafe', 'ana@example.com', password + 'extra')).rejects.toBeInstanceOf(UnauthorizedException);
      await expect(ctx.service.deleteAccount(session.customer, password + 'extra')).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('issues a token stored only as a digest, and authenticates with it in its own store only', async () => {
      const ctx = setup();
      const session = await account(ctx);
      expect(session.token.length).toBeGreaterThanOrEqual(40);
      expect(ctx.sessions[0].hashedToken).toMatch(/^sha256:/);
      expect(JSON.stringify(ctx.sessions)).not.toContain(session.token);
      await expect(ctx.service.authenticate('cafe', session.token)).resolves.toMatchObject({ email: 'ana@example.com', storeId: 's-cafe' });
      await expect(ctx.service.authenticate('te', session.token)).rejects.toBeInstanceOf(UnauthorizedException);
      await expect(ctx.service.authenticate('cafe', 'garbage')).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('keeps the same email in two stores as two separate accounts', async () => {
      const ctx = setup();
      await account(ctx, 'cafe');
      await account(ctx, 'te');
      expect(ctx.customers.map(c => c.storeId).sort()).toEqual(['s-cafe', 's-te']);
      await expect(ctx.service.login('te', 'ana@example.com', PASSWORD)).resolves.toBeDefined();
    });

    it('logout revokes the session, and an expired or revoked session is refused', async () => {
      const ctx = setup();
      const session = await account(ctx);
      await ctx.service.logout('cafe', session.token);
      await expect(ctx.service.authenticate('cafe', session.token)).rejects.toBeInstanceOf(UnauthorizedException);
      const second = await ctx.service.login('cafe', 'ana@example.com', PASSWORD);
      ctx.sessions.at(-1)!.expiresAt = new Date(Date.now() - 1000);
      await expect(ctx.service.authenticate('cafe', second.token)).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('runs a password check even for an unknown email, so the answer takes the same time', async () => {
      const ctx = setup();
      const spy = jest.spyOn(require('argon2'), 'verify');
      await expect(ctx.service.login('cafe', 'ghost@example.com', PASSWORD)).rejects.toBeInstanceOf(UnauthorizedException);
      expect(spy).toHaveBeenCalledTimes(1);
      spy.mockRestore();
    });
  });

  describe('forgot and reset password', () => {
    it('answers the same for any email and mails a reset link only to a verified customer of this store', async () => {
      const ctx = setup();
      await account(ctx);
      ctx.mail.send.mockClear();
      await expect(ctx.service.forgotPassword('cafe', 'ghost@example.com')).resolves.toEqual(CUSTOMER_GENERIC_ANSWER);
      expect(ctx.mail.send).not.toHaveBeenCalled();
      await expect(ctx.service.forgotPassword('te', 'ana@example.com')).resolves.toEqual(CUSTOMER_GENERIC_ANSWER);
      expect(ctx.mail.send).not.toHaveBeenCalled();
      await expect(ctx.service.forgotPassword('cafe', 'ana@example.com')).resolves.toEqual(CUSTOMER_GENERIC_ANSWER);
      expect(ctx.mail.send).toHaveBeenCalledTimes(1);
      expect(String(ctx.mail.send.mock.calls[0][0].body)).toContain('https://pay.example/cuenta/cafe/restablecer?token=');
    });

    it('resets the password once, revokes every session, and the old password stops working', async () => {
      const ctx = setup();
      const session = await account(ctx);
      await ctx.service.forgotPassword('cafe', 'ana@example.com');
      const token = ctx.tokenFromMail();
      await expect(ctx.service.resetPassword('cafe', token, 'a brand new password')).resolves.toEqual({ ok: true });
      await expect(ctx.service.authenticate('cafe', session.token)).rejects.toBeInstanceOf(UnauthorizedException);
      await expect(ctx.service.login('cafe', 'ana@example.com', PASSWORD)).rejects.toBeInstanceOf(UnauthorizedException);
      await expect(ctx.service.login('cafe', 'ana@example.com', 'a brand new password')).resolves.toBeDefined();
      await expect(ctx.service.resetPassword('cafe', token, 'yet another password')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses a weak new password and keeps the token usable', async () => {
      const ctx = setup();
      await account(ctx);
      await ctx.service.forgotPassword('cafe', 'ana@example.com');
      const token = ctx.tokenFromMail();
      await expect(ctx.service.resetPassword('cafe', token, 'short')).rejects.toBeInstanceOf(BadRequestException);
      await expect(ctx.service.resetPassword('cafe', token, 'a brand new password')).resolves.toEqual({ ok: true });
    });

    it('does not let a verification token reset a password', async () => {
      const ctx = setup();
      await ctx.service.register('cafe', { name: 'Ana', email: 'ana@example.com', password: PASSWORD });
      await expect(ctx.service.resetPassword('cafe', ctx.tokenFromMail(), 'a brand new password')).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('profile, addresses, orders and subscriptions', () => {
    it('updates the name and phone, and replaces at most ten well-formed addresses', async () => {
      const ctx = setup();
      const session = await account(ctx);
      const me = await ctx.service.authenticate('cafe', session.token);
      await expect(ctx.service.updateProfile(me, { name: 'Ana María', phone: '+59170000000' })).resolves.toMatchObject({ name: 'Ana María', phone: '+59170000000' });
      const address = (i: number) => ({ label: `Casa ${i}`, recipient: 'Ana', phone: '+59170000000', department: 'La Paz', city: 'La Paz', street: 'Av. 6', references: '' });
      const saved = await ctx.service.replaceAddresses(me, Array.from({ length: 3 }, (_, i) => address(i)));
      expect(saved).toHaveLength(3);
      expect(saved.every((a: any) => typeof a.id === 'string' && a.id.length > 5)).toBe(true);
      await expect(ctx.service.replaceAddresses(me, Array.from({ length: 11 }, (_, i) => address(i)))).rejects.toBeInstanceOf(BadRequestException);
      await expect(ctx.service.replaceAddresses(me, [{ ...address(1), street: 'x'.repeat(300) }])).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects incomplete addresses, invalid phones and duplicate identifiers', async () => {
      const ctx = setup(), session = await account(ctx);
      const valid = { id: 'address-1', recipient: 'Ana', department: 'La Paz', city: 'La Paz', street: 'Av. 6', phone: '+59170000000' };
      for (const list of [[{}], [{ ...valid, street: ' ' }], [{ ...valid, phone: 'bad' }], [valid, valid]]) {
        await expect(ctx.service.replaceAddresses(session.customer, list)).rejects.toBeInstanceOf(BadRequestException);
      }
    });

    it('lists only this store\'s orders for the verified email, newest first, and none for an unverified one', async () => {
      const order = (id: string, storeId: string, email: string, at: number) => ({ id, storeId, amount: 1000, currency: 'BOB', status: 'PAID', items: [{ name: 'Café', quantity: 1 }], createdAt: new Date(at), paymentIntent: { customerEmail: email } });
      const ctx = setup({ orders: [order('o1', 's-cafe', 'ana@example.com', 1), order('o2', 's-cafe', 'ana@example.com', 2), order('o3', 's-te', 'ana@example.com', 3), order('o4', 's-cafe', 'other@example.com', 4)] });
      const session = await account(ctx);
      const me = await ctx.service.authenticate('cafe', session.token);
      expect((await ctx.service.orders(me)).map((o: any) => o.id)).toEqual(['o2', 'o1']);
      await expect(ctx.service.orders({ ...me, emailVerifiedAt: null })).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('lists this store\'s subscriptions for the verified email', async () => {
      const ctx = setup({ subscriptions: [{ id: 'sub1', storeId: 's-cafe', customerEmail: 'ana@example.com', status: 'ACTIVE' }, { id: 'sub2', storeId: 's-te', customerEmail: 'ana@example.com', status: 'ACTIVE' }] });
      const session = await account(ctx);
      const me = await ctx.service.authenticate('cafe', session.token);
      expect((await ctx.service.subscriptions(me)).map((s: any) => s.id)).toEqual(['sub1']);
    });
  });

  describe('export and delete', () => {
    it('exports what is held about the customer without the password or any token', async () => {
      const ctx = setup();
      const session = await account(ctx);
      const me = await ctx.service.authenticate('cafe', session.token);
      const data = await ctx.service.exportData(me);
      expect(data).toMatchObject({ email: 'ana@example.com', name: 'Ana' });
      expect(JSON.stringify(data)).not.toMatch(/hashedPassword|argon2|sha256|token/i);
    });

    it('deletes the account only with the password: personal data gone, sessions revoked, the email free again', async () => {
      const ctx = setup();
      const session = await account(ctx);
      const me = await ctx.service.authenticate('cafe', session.token);
      await expect(ctx.service.deleteAccount(me, 'wrong password')).rejects.toBeInstanceOf(UnauthorizedException);
      await expect(ctx.service.deleteAccount(me, PASSWORD)).resolves.toEqual({ ok: true });
      await expect(ctx.service.authenticate('cafe', session.token)).rejects.toBeInstanceOf(UnauthorizedException);
      await expect(ctx.service.login('cafe', 'ana@example.com', PASSWORD)).rejects.toBeInstanceOf(UnauthorizedException);
      const row = ctx.customers.find(c => c.id === me.id)!;
      expect(row).toMatchObject({ name: '', phone: null, addresses: [] });
      expect(row.email).not.toBe('ana@example.com');
      expect(row.deletedAt).toBeInstanceOf(Date);
      await expect(ctx.service.register('cafe', { name: 'Ana', email: 'ana@example.com', password: PASSWORD })).resolves.toEqual(CUSTOMER_GENERIC_ANSWER);
      expect(ctx.customers.filter(c => c.email === 'ana@example.com' && !c.deletedAt)).toHaveLength(1);
    });
  });
});
