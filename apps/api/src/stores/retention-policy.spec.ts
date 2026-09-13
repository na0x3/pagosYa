import { comebackCode, qualifyingDays, unusedDays } from './retention-policy';
const order = (date: string, extras: any = {}) => ({ amount: 1000, paymentIntent: { livemode: true, status: 'SUCCEEDED', transactions: [{ type: 'CAPTURE', status: 'SUCCEEDED', amount: 1000, createdAt: date }], ...extras } });
describe('Comeback paid-day rules', () => {
  const since = new Date('2026-01-01');
  it('counts one stamp per local day, including midnight and summer-time boundaries', () => {
    const days = qualifyingDays([order('2026-03-08T04:30:00Z'), order('2026-03-08T06:30:00Z'), order('2026-03-08T08:30:00Z')], 'America/New_York', since);
    expect(days).toEqual(['2026-03-07', '2026-03-08']);
  });
  it('excludes sandbox, pending, fully refunded, before-program and uncaptured payments', () => {
    expect(qualifyingDays([order('2025-12-30'), order('2026-01-02', { livemode: false }), order('2026-01-02', { status: 'PROCESSING' }), order('2026-01-02', { transactions: [] }), order('2026-01-02', { transactions: [{ type: 'CAPTURE', status: 'SUCCEEDED', createdAt: '2026-01-02' }, { type: 'REFUND', status: 'SUCCEEDED', amount: 1000 }] }), order('2026-01-02', { creditReservation: { refundedAmount: 1000 } })], 'UTC', since)).toEqual([]);
  });
  it('retains partially refunded purchases and consumes each earned day once', () => {
    const days = qualifyingDays([order('2026-01-02', { creditReservation: { refundedAmount: 500 } }), order('2026-01-03')], 'UTC', since);
    expect(unusedDays(days, [{ days: ['2026-01-02'] }])).toEqual(['2026-01-03']);
    expect(comebackCode({ id: 'card', token: 'secret' }, days)).not.toEqual(comebackCode({ id: 'card', token: 'other' }, days));
  });
});
