import { buildAbandonedCarts, orderLines, personKey, phoneKey, savedCartLines, type AttemptInput, type SavedInput } from './abandoned-carts';

const at = (hours: number) => new Date(Date.parse('2026-10-13T12:00:00Z') - hours * 3600000);
const attempt = (patch: Partial<AttemptInput>): AttemptInput => ({ paymentIntentId: 'pi', name: null, email: null, phone: null, items: [{ name: 'Café', variant: null, quantity: 2 }], total: 2000, currency: 'BOB', leftAt: at(3), ...patch });
const saved = (patch: Partial<SavedInput>): SavedInput => ({ id: 'c', token: 't', email: 'x@example.com', name: null, phone: null, paymentIntentId: null, items: [{ name: 'Té', variant: null, quantity: 1 }], total: 900, currency: 'BOB', leftAt: at(2), sentAt: null, paymentSucceeded: false, ...patch });
const build = (input: Partial<Parameters<typeof buildAbandonedCarts>[0]>) => buildAbandonedCarts({ attempts: [], saved: [], paid: [], recoveryOn: true, storeUrl: 'https://pay.test/s/luz', recoverUrl: token => `https://pay.test/s/luz?recover=${token}`, ...input });

describe('abandoned carts', () => {
  it('merges a saved cart into the payment it led to, and keeps one row per person: the latest, newest first', () => {
    const rows = build({
      attempts: [attempt({ paymentIntentId: 'pi_old', email: 'ana@example.com', leftAt: at(5) }), attempt({ paymentIntentId: 'pi_new', name: 'Ana', email: 'ANA@example.com', leftAt: at(3) }), attempt({ paymentIntentId: 'pi_carla', email: 'carla@example.com', leftAt: at(6) })],
      saved: [saved({ id: 'c1', token: 'tok1', email: 'carla@example.com', paymentIntentId: 'pi_carla', sentAt: at(1), leftAt: at(6) }), saved({ id: 'c2', token: 'tok2', email: 'bruno@example.com', leftAt: at(2) })],
    });
    expect(rows.map(row => [row.key, row.source, row.reminder, row.recoverUrl])).toEqual([
      ['email:bruno@example.com', 'saved', 'scheduled', 'https://pay.test/s/luz?recover=tok2'],
      ['email:ana@example.com', 'payment', 'none', null],
      ['email:carla@example.com', 'payment', 'sent', 'https://pay.test/s/luz?recover=tok1'],
    ]);
    expect(rows[1]).toMatchObject({ name: 'Ana', leftAt: at(3).toISOString(), storeUrl: 'https://pay.test/s/luz', total: 2000, currency: 'BOB' });
  });
  it('drops a person who paid after leaving, by email in any case or by phone with or without 591, and a saved cart whose own payment went through', () => {
    const rows = build({
      attempts: [attempt({ paymentIntentId: 'a', email: 'dora@example.com' }), attempt({ paymentIntentId: 'b', phone: '70000009' }), attempt({ paymentIntentId: 'c', email: 'before@example.com' })],
      saved: [saved({ id: 'own', email: 'own@example.com', paymentIntentId: 'paid_pi', paymentSucceeded: true })],
      paid: [{ email: 'DORA@example.com', phone: null, paidAt: at(1) }, { email: null, phone: '+591 7000 0009', paidAt: at(1) }, { email: 'before@example.com', phone: null, paidAt: at(5) }],
    });
    expect(rows.map(row => row.key)).toEqual(['email:before@example.com']);
  });
  it('says there is no reminder for an unsent cart while reminders are off', () => {
    expect(build({ saved: [saved({}), saved({ id: 'c2', email: 'y@example.com', sentAt: at(1), leftAt: at(4) })], recoveryOn: false }).map(row => row.reminder)).toEqual(['none', 'sent']);
  });
  it('leaves out a payment with no usable way to reach the person', () => {
    expect(build({ attempts: [attempt({ phone: '12' })] })).toEqual([]);
  });
});

describe('people and lines', () => {
  it('reads one person from an email in any case or a phone with or without 591', () => {
    expect(personKey(' Ana@Example.com ', '70000001')).toBe('email:ana@example.com');
    expect(personKey(null, '+591 7000-0001')).toBe('phone:70000001');
    expect(phoneKey('+54 9 11 5555 5555')).toBe('5491155555555');
    expect(personKey(null, '')).toBeNull();
  });
  it('shows an order line by name, option and quantity', () => {
    expect(orderLines([{ paymentLinkId: 'p1', name: 'Café', variantName: 'Grande', quantity: 2, unitAmount: 1000 }, { name: 'roto' }, 'x'])).toEqual([{ name: 'Café', variant: 'Grande', quantity: 2 }]);
    expect(orderLines(null)).toEqual([]);
  });
  it('prices a saved cart from today’s catalog with its option and extras, and survives a removed product', () => {
    const products = new Map([['p1', { id: 'p1', name: 'Burger', amount: 3000, currency: 'BOB', variants: [{ id: 'v1', name: 'Doble', amount: 4000 }], extras: [{ id: 'x1', name: 'Queso', amount: 500, required: false }] }]]);
    expect(savedCartLines([{ paymentLinkId: 'p1', variantId: 'v1', extraIds: ['x1', 'x1'], quantity: 2 }, { paymentLinkId: 'gone', quantity: 1 }], products)).toEqual({
      items: [{ name: 'Burger', variant: 'Doble', quantity: 2 }, { name: 'Producto', variant: null, quantity: 1 }], total: 10000, currency: 'BOB',
    });
  });
});
