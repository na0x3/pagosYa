// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { joinHtml, membershipFromPrice, membershipPurchaseHtml, membershipsHtml, rememberJoin, takePendingJoin } from './membership-views';
import { formatAmount } from '../ui/html';

const context = { slug: 'cafe', storeName: 'Café Norte', signedIn: true };
const club = { id: 'club', name: 'Club del café', currency: 'BOB', fulfillmentType: 'MEMBERSHIP', membershipPeriods: [{ id: 'm1', months: 1, amount: 5000 }, { id: 'm12', months: 12, amount: 48000 }] } as any;

describe('pending join', () => {
  beforeEach(() => { localStorage.clear(); sessionStorage.clear(); vi.useRealTimers(); });
  it('survives another tab (localStorage, not sessionStorage)', () => {
    rememberJoin('cafe', '?producto=club&periodo=m12');
    expect(sessionStorage.length).toBe(0);
    expect(localStorage.getItem('pagosya:join:cafe')).toContain('club');
    expect(takePendingJoin('cafe')).toBe('?producto=club&periodo=m12');
  });
  it('is read once', () => {
    rememberJoin('cafe', '?producto=club&periodo=m12');
    takePendingJoin('cafe');
    expect(takePendingJoin('cafe')).toBeNull();
  });
  it('expires after one hour', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-09T10:00:00Z'));
    rememberJoin('cafe', '?producto=club&periodo=m12');
    vi.setSystemTime(new Date('2026-10-09T11:00:01Z'));
    expect(takePendingJoin('cafe')).toBeNull();
    expect(localStorage.getItem('pagosya:join:cafe')).toBeNull();
  });
  it('still returns it within the hour', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-09T10:00:00Z'));
    rememberJoin('cafe', '?producto=club&periodo=m12');
    vi.setSystemTime(new Date('2026-10-09T10:59:00Z'));
    expect(takePendingJoin('cafe')).toBe('?producto=club&periodo=m12');
  });
  it('tolerates extra params and stores the canonical query', () => {
    rememberJoin('cafe', '?utm_source=x&periodo=m12&account_embed=1&producto=club');
    expect(takePendingJoin('cafe')).toBe('?producto=club&periodo=m12');
  });
  it('refuses invalid values', () => {
    for (const q of ['javascript:alert(1)', '?producto=club', '?producto=a%20b&periodo=m1', '?producto=club&periodo=' + 'x'.repeat(41)]) {
      rememberJoin('cafe', q);
      expect(localStorage.getItem('pagosya:join:cafe')).toBeNull();
    }
  });
  it('drops a tampered stored value', () => {
    localStorage.setItem('pagosya:join:cafe', JSON.stringify({ query: '?producto=<x>&periodo=m1', at: Date.now() }));
    expect(takePendingJoin('cafe')).toBeNull();
  });
});

describe('joinHtml', () => {
  it('shows the chosen period, the price, the consent and a pay button', () => {
    const html = joinHtml(context, club, 'm12');
    expect(html).toContain('Club del café');
    expect(html).toMatch(/value="m12" checked/);
    expect(html).toContain('Cada período te enviaremos un enlace para pagar; no se cobra nada automáticamente.');
    expect(html).toContain('data-form="join"');
  });
});

describe('membershipsHtml', () => {
  it('shows state, activa hasta and only the actions that apply', () => {
    const html = membershipsHtml(context, [
      { id: 's1', productId: 'club', name: 'Club del café', state: 'ACTIVE', stateLabel: 'Activa', accessUntil: '2026-12-12T12:00:00Z', nextBillingAt: '2026-12-12T12:00:00Z', amount: 5000, currency: 'BOB', period: { id: 'm1', months: 1, label: 'Mensual' }, pendingPeriod: null, periods: [{ id: 'm1', months: 1, amount: 5000, label: 'Mensual' }, { id: 'm12', months: 12, amount: 48000, label: 'Anual' }], renewalUrl: 'https://pagar.test/#client_secret=x' },
      { id: 's2', productId: 'yoga', name: 'Yoga', state: 'LAPSED', stateLabel: 'Vencida', accessUntil: '2026-09-01T12:00:00Z', nextBillingAt: null, amount: 9000, currency: 'BOB', period: { id: 'y1', months: 1, label: 'Mensual' }, pendingPeriod: null, periods: [], renewalUrl: null },
    ] as any);
    expect(html).toContain('Activa hasta');
    expect(html).toContain('href="https://pagar.test/#client_secret=x"');
    expect(html).toContain('data-member-action="cancel" data-id="s1"');
    expect(html).toContain('href="/cuenta/cafe/unirme?producto=yoga&amp;periodo=y1"');
    expect(html).not.toContain('data-member-action="cancel" data-id="s2"');
  });
});

describe('membershipPurchaseHtml', () => {
  it('sends the built-in product page to the account join page with the period', () => {
    const html = membershipPurchaseHtml('cafe', club);
    expect(html).toContain('action="/cuenta/cafe/unirme"');
    expect(html.match(/name="periodo"/g)).toHaveLength(2);
  });
});

describe('membershipFromPrice', () => {
  it('reads as a recurring price from the cheapest period', () => {
    expect(membershipFromPrice(club)).toBe(`Desde ${formatAmount(5000, 'BOB')} / mes`);
  });
  it('picks the cheapest period whatever the order', () => {
    const yearlyFirst = { ...club, membershipPeriods: [{ id: 'm12', months: 12, amount: 48000 }, { id: 'm3', months: 3, amount: 14000 }] };
    expect(membershipFromPrice(yearlyFirst)).toBe(`Desde ${formatAmount(14000, 'BOB')} / 3 meses`);
  });
  it('is empty without periods', () => {
    expect(membershipFromPrice({ ...club, membershipPeriods: [] })).toBe('');
  });
});
