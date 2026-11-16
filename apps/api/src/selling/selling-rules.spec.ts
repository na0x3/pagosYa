import { decide, mergeKept, nextChange, ordersDropped, visitorSelling } from './selling-rules';

const day = (n: number) => new Date(Date.UTC(2026, 10, n));

describe('selling rules (spec 2026-11-16 la tienda que vende sola)', () => {
  it('merges the kept changes, the newest winning, and ignores the rest', () => {
    expect(mergeKept([
      { kind: 'buyWord', status: 'KEPT', settings: { buyWord: 'Comprar ahora' }, endedAt: day(1) },
      { kind: 'buyWord', status: 'KEPT', settings: { buyWord: 'Lo quiero' }, endedAt: day(3) },
      { kind: 'best', status: 'UNDONE', settings: { best: 'a' }, endedAt: day(4) },
      { kind: 'stickyBuy', status: 'TRYING', settings: { stickyBuy: true }, endedAt: null },
      { kind: 'best', status: 'KEPT', settings: { best: 'b', price: 1 }, endedAt: day(2) },
    ])).toEqual({ buyWord: 'Lo quiero', best: 'b' });
  });
  it('gives side B of a selling test its switches on top of the kept ones, and side A only the kept ones', () => {
    const kept = { buyWord: 'Comprar ahora' };
    const test = { kind: 'selling', variantSettings: { buyWord: 'Lo quiero' } };
    expect(visitorSelling(kept, test, 'B')).toEqual({ buyWord: 'Lo quiero' });
    expect(visitorSelling(kept, test, 'A')).toEqual(kept);
    expect(visitorSelling(kept, { kind: 'design', variantSettings: { buyWord: 'x' } }, 'B')).toEqual(kept);
    expect(visitorSelling(kept, null, undefined)).toEqual(kept);
  });
  it('keeps a change only with ≥5% more adds per visit and no fewer orders, after 300 visits a side or 14 days', () => {
    const side = (visits: number, adds: number, orders = 0) => ({ visits, adds, orders });
    expect(decide({ days: 5, a: side(300, 30, 3), b: side(300, 32, 3) }).decision).toBe('KEEP');
    expect(decide({ days: 5, a: side(300, 30, 3), b: side(300, 31, 3) }).decision).toBe('UNDO');
    expect(decide({ days: 5, a: side(300, 30, 3), b: side(300, 40, 2) }).decision).toBe('UNDO');
    expect(decide({ days: 10, a: side(120, 12), b: side(118, 20) }).decision).toBe('WAIT');
    expect(decide({ days: 14, a: side(120, 12), b: side(118, 20) }).decision).toBe('KEEP');
    const empty = decide({ days: 14, a: side(0, 0), b: side(0, 0) });
    expect(empty.decision).toBe('UNDO');
    expect(Number.isFinite(empty.lift)).toBe(true);
    expect(decide({ days: 14, a: side(50, 0), b: side(50, 3) }).decision).toBe('KEEP');
  });
  it('sees a real drop in orders, not noise', () => {
    expect(ordersDropped(5, 40)).toBe(true);
    expect(ordersDropped(9, 40)).toBe(false);
    expect(ordersDropped(0, 4)).toBe(false);
  });
  describe('nextChange', () => {
    const signals = { bestSellers: [{ productId: 'b', name: 'Ginger', orders: 4 }], sections: [{ index: 2, views: 200, clicks: 10 }, { index: 3, views: 150, clicks: 15 }], sectionNames: { 2: 'Sabores', 3: 'Historia' } };
    it('starts with the best seller when one product sold three times or more', () => {
      expect(nextChange(signals, [], {})).toMatchObject({ kind: 'best', settings: { best: 'b' }, summary: '«Ginger» primero como Más vendido' });
    });
    it('moves a section up when the one below gets 1.2× the clicks per view, after the best seller is kept', () => {
      const history = [{ kind: 'best', status: 'KEPT', settings: { best: 'b' }, endedAt: day(10) }];
      expect(nextChange(signals, history, { best: 'b' })).toMatchObject({ kind: 'order', settings: { order: ['s3', 's2'] }, summary: 'Subimos «Historia» un lugar' });
    });
    it('never repeats a change undone in the last 60 days, and tries the buy word and the sticky bar', () => {
      const now = day(20);
      const history = [
        { kind: 'best', status: 'UNDONE', settings: { best: 'b' }, endedAt: day(12) },
        { kind: 'order', status: 'UNDONE', settings: { order: ['s3', 's2'] }, endedAt: day(13) },
      ];
      const next = nextChange(signals, history, {}, now);
      expect(next).toMatchObject({ kind: 'buyWord', settings: { buyWord: 'Comprar ahora' } });
      const after = nextChange(signals, [...history, { kind: 'buyWord', status: 'UNDONE', settings: { buyWord: 'Comprar ahora' }, endedAt: day(19) }], {}, now);
      expect(after).toMatchObject({ kind: 'buyWord', settings: { buyWord: 'Lo quiero' } });
    });
    it('has nothing left to try when everything is kept or undone', () => {
      const history = ['Comprar ahora', 'Lo quiero'].map(word => ({ kind: 'buyWord', status: 'UNDONE', settings: { buyWord: word }, endedAt: day(19) }));
      expect(nextChange({ bestSellers: [], sections: [], sectionNames: {} }, history, { stickyBuy: true }, day(20))).toBeNull();
    });
  });
});
