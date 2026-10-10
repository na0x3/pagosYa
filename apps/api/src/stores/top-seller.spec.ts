import { topSellerId, TOP_SELLER_MIN_ORDERS } from './top-seller';

const order = (...lines: Array<[string, number?]>) => ({ items: lines.map(([paymentLinkId, quantity]) => ({ paymentLinkId, ...(quantity === undefined ? {} : { quantity }) })) });

describe('top seller', () => {
  it('needs at least five paid orders', () => {
    expect(TOP_SELLER_MIN_ORDERS).toBe(5);
    expect(topSellerId([order(['a', 9]), order(['a']), order(['b']), order(['a'])])).toBeNull();
  });
  it('picks the product with the most units, counting a line without quantity as one', () => {
    expect(topSellerId([order(['a', 1]), order(['b', 3]), order(['a']), order(['a']), order(['c'], ['a'])])).toBe('a');
    expect(topSellerId([order(['a', 1]), order(['b', 6]), order(['a']), order(['a']), order(['c'])])).toBe('b');
  });
  it('gives no badge on a tie and ignores malformed lines', () => {
    expect(topSellerId([order(['a', 2]), order(['b', 2]), order(['c']), order(), { items: null }])).toBeNull();
    expect(topSellerId([order(['a', 2]), order(['b', 1]), order(), { items: [null, { quantity: 5 }] }, { items: 'x' }])).toBe('a');
  });
});
