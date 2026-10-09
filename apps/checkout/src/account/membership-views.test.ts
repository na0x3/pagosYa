// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { joinHtml, membershipPurchaseHtml, membershipsHtml, rememberJoin, takePendingJoin } from './membership-views';

const context = { slug: 'cafe', storeName: 'Café Norte', signedIn: true };
const club = { id: 'club', name: 'Club del café', currency: 'BOB', fulfillmentType: 'MEMBERSHIP', membershipPeriods: [{ id: 'm1', months: 1, amount: 5000 }, { id: 'm12', months: 12, amount: 48000 }] } as any;

describe('pending join', () => {
  beforeEach(() => sessionStorage.clear());
  it('survives sign-in, registration and email confirmation, and is read once', () => {
    rememberJoin('cafe', '?producto=club&periodo=m12');
    expect(takePendingJoin('cafe')).toBe('?producto=club&periodo=m12');
    expect(takePendingJoin('cafe')).toBeNull();
  });
  it('ignores anything that is not a membership query', () => {
    rememberJoin('cafe', 'javascript:alert(1)');
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
