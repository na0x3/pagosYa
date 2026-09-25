import { addDays, dayCount, daysBetween } from './store-analytics-days';

describe('store analytics days', () => {
  it('counts the days of a range arithmetically, both ends included', () => {
    expect(dayCount('2026-09-01', '2026-09-01')).toBe(1);
    expect(dayCount('2026-09-01', '2026-09-30')).toBe(30);
    expect(dayCount('2026-09-05', '2026-09-01')).toBe(-3);
    expect(dayCount('0001-01-01', '9999-12-31')).toBe(3_652_059);
  });

  it('lists the days of a range and ends at the last day even at the edge of year 9999', () => {
    expect(daysBetween('2026-02-27', '2026-03-01')).toEqual(['2026-02-27', '2026-02-28', '2026-03-01']);
    expect(daysBetween('9999-12-30', '9999-12-31')).toEqual(['9999-12-30', '9999-12-31']);
    expect(addDays('9999-12-31', 1)).toBe('+010000-01'); // sorts before '9999-12-31' as a string
  });

  it('refuses to build a list longer than a report may be (a caller that skipped validation)', () => {
    expect(() => daysBetween('0001-01-01', '9999-12-31')).toThrow(RangeError);
  });
});
