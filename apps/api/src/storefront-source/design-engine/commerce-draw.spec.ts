import { COMMERCE_LEAN, COMMERCE_OPTIONS, CART_WORDS, cartWordFor, commerceRuntimeDna, commerceSummary, drawCommerce, parseCommerceDraw } from './commerce-draw';
import { PLAYBOOK } from './playbook';

const seq = (values: number[]) => { let i = 0; return () => values[i++ % values.length]; };

describe('drawCommerce', () => {
  it('rotates every part over seeds within the mode\'s narrowing', () => {
    for (const mode of ['calm', 'bold'] as const) {
      const seen: Record<string, Set<string>> = {};
      for (let s = 0; s < 40; s++) {
        const draw = drawCommerce(seq([s / 40, (s * 7 % 40) / 40]), [], mode);
        for (const [part, id] of Object.entries(draw)) {
          expect(COMMERCE_LEAN[mode][part as keyof typeof COMMERCE_LEAN.calm]).toContain(id);
          (seen[part] ??= new Set()).add(id);
        }
      }
      for (const part of Object.keys(COMMERCE_OPTIONS)) expect(seen[part].size).toBe(COMMERCE_LEAN[mode][part as keyof typeof COMMERCE_LEAN.calm].length);
    }
  });
  it('calm leans quiet and bold leans loud, sharing no account, checkout, fields or cart surface', () => {
    expect(COMMERCE_LEAN.calm.account).toEqual(['card', 'minimal']);
    expect(COMMERCE_LEAN.bold.checkout).toEqual(['ticket', 'brand']);
    for (const part of ['account', 'checkout', 'fields', 'cartSurface'] as const) expect(COMMERCE_LEAN.calm[part].filter(id => COMMERCE_LEAN.bold[part].includes(id))).toEqual([]);
  });
  it('avoids history beyond the spread', () => {
    const recent = Array.from({ length: 3 }, () => ({ account: 'card' as const, checkout: 'columns' as const, fields: 'boxed' as const, cartSurface: 'drawer' as const, added: 'toast' as const }));
    for (let s = 0; s < 20; s++) expect(drawCommerce(seq([s / 20]), recent, 'calm', 1)).toEqual({ account: 'minimal', checkout: 'steps', fields: 'underline', cartSurface: 'page', added: 'inline' });
  });
  it('falls back to every option when a narrowing is empty', () => {
    const seen = new Set<string>();
    for (let s = 0; s < 40; s++) seen.add(drawCommerce(seq([s / 40]), [], 'calm', 1, { account: [] }).account);
    expect([...seen].sort()).toEqual([...COMMERCE_OPTIONS.account].sort());
  });
});

describe('parseCommerceDraw', () => {
  it('keeps only known ids', () => {
    expect(parseCommerceDraw({ account: 'split', checkout: 'nope', fields: 'pill', cartSurface: 'sheet', added: 3, extra: 'x' })).toEqual({ account: 'split', fields: 'pill', cartSurface: 'sheet' });
    expect(parseCommerceDraw(null)).toEqual({});
  });
});

describe('cart words, runtime DNA and summary', () => {
  it('has one word per playbook kind and nothing for an unknown kind', () => {
    expect(Object.keys(CART_WORDS).sort()).toEqual(Object.keys(PLAYBOOK).sort());
    expect(cartWordFor('clothing')).toBe('Tu bolsa');
    expect(cartWordFor('flowers-gifts')).toBe('Tu ramo');
    expect(cartWordFor('nope')).toBeUndefined();
    expect(cartWordFor(undefined)).toBeUndefined();
  });
  it('maps a draw to runtime DNA, the checkout picking the review it builds on', () => {
    expect(commerceRuntimeDna({ account: 'split', checkout: 'steps', fields: 'pill', cartSurface: 'sheet', added: 'stamp' })).toEqual({ cart: 'sheet', added: 'stamp', review: 'stacked', checkout: 'steps', fields: 'pill' });
    expect(commerceRuntimeDna({ checkout: 'brand' })).toEqual({ review: 'split', checkout: 'brand' });
    expect(commerceRuntimeDna({})).toEqual({});
  });
  it('writes the preview line in Spanish', () => {
    expect(commerceSummary({ account: 'split', checkout: 'ticket', cartSurface: 'sheet' })).toBe('Cuenta: dividida · Pago: ticket · Carrito: hoja');
    expect(commerceSummary({})).toBe('');
  });
});
