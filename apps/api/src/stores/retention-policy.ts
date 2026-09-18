import { createHmac } from 'node:crypto';
/** One stamp per local paid day; fully refunded and sandbox orders earn none. */
export function qualifyingDays(orders: any[], timezone: string, since: Date): string[] {
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' });
  return [...new Set<string>(orders.flatMap(order => {
    const pi = order.paymentIntent;
    if (!pi?.livemode || pi.status !== 'SUCCEEDED') return [];
    const captures = pi.transactions.filter((t: any) => t.type === 'CAPTURE' && t.status === 'SUCCEEDED');
    const refunds = pi.transactions.filter((t: any) => t.type === 'REFUND' && t.status === 'SUCCEEDED').reduce((sum: number, t: any) => sum + t.amount, 0);
    const creditRefund = pi.creditReservation?.refundedAmount || 0;
    if (!captures.length || order.amount - refunds - creditRefund <= 0) return [];
    const paidAt = new Date(Math.min(...captures.map((t: any) => new Date(t.createdAt).getTime())));
    return paidAt >= since ? [date.format(paidAt)] : [];
  }))].sort();
}
export function comebackCode(card: { id: string; token: string }, days: string[]) {
  return `CB-${card.id}-${createHmac('sha256', card.token).update(days.join('|')).digest('hex').slice(0, 16)}`;
}
export function unusedDays(days: string[], rewards: Array<{ days: string[] }>) {
  const used = new Set(rewards.flatMap(reward => reward.days));
  return days.filter(day => !used.has(day));
}
