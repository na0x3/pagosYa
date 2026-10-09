import { describe, expect, it } from 'vitest';
import { membershipPeriodsHtml, parseMembershipPeriods, periodsSummary } from './membership-periods-editor';

describe('parseMembershipPeriods', () => {
  it('turns Bs prices into centavos and keeps the order', () => {
    expect(parseMembershipPeriods([{ months: 1, price: '50' }, { months: 12, price: '480.50' }])).toEqual({ periods: [{ months: 1, amount: 5000 }, { months: 12, amount: 48050 }], problem: '' });
  });
  it('explains what is wrong', () => {
    expect(parseMembershipPeriods([]).problem).toBe('Agrega al menos un período con su precio.');
    expect(parseMembershipPeriods([{ months: 1, price: '0' }]).problem).toBe('Cada período necesita un precio mayor que cero.');
    expect(parseMembershipPeriods([{ months: 1, price: '50' }, { months: 1, price: '60' }]).problem).toBe('Cada duración puede aparecer una sola vez.');
  });
});

describe('membershipPeriodsHtml', () => {
  it('draws one row per period with a length select, a price and a remove button, and hides "add" at four', () => {
    const html = membershipPeriodsHtml([{ months: 1, price: '50' }, { months: 3, price: '135' }, { months: 6, price: '250' }, { months: 12, price: '480' }]);
    expect(html.match(/data-period-row=/g)).toHaveLength(4);
    expect(html).toContain('<option value="12" selected>Anual</option>');
    expect(html).not.toContain('data-period-add');
  });
  it('summarises the periods for the review step', () => {
    expect(periodsSummary([{ months: 1, price: '50' }, { months: 12, price: '480' }])).toBe('Mensual Bs 50 · Anual Bs 480');
  });
});
