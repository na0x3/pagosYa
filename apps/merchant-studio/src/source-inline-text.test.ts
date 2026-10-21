import { describe, expect, it } from 'vitest';
import { matchInlineField } from './source-inline-text';

// Spec 2026-10-20 §6: the double-clicked text is saved through the direct-edit field that holds it.
describe('matchInlineField', () => {
  const fields = [
    { id: 'c1', kind: 'color', value: 'Comprar', previewValue: 'Comprar', path: 'x', label: '' },
    { id: 't1', kind: 'text', value: 'Comprar\n  ahora', previewValue: 'Comprar ahora', path: 'components/store-data.tsx', label: '' },
    { id: 't2', kind: 'text', value: 'Comprar ahora', previewValue: 'Comprar ahora', path: 'components/Shell.tsx', label: '' },
    { id: 't3', kind: 'text', value: 'Fuego', previewValue: 'Fuego', path: 'components/home.tsx', label: '' },
  ] as any[];
  it('takes the first text field showing the same words, whitespace aside', () => {
    expect(matchInlineField(fields, '  Comprar   ahora ')?.id).toBe('t1');
    expect(matchInlineField(fields, 'Fuego')?.id).toBe('t3');
  });
  it('never matches a colour or select field, and returns nothing for words no field holds', () => {
    expect(matchInlineField([fields[0]], 'Comprar')).toBeUndefined();
    expect(matchInlineField(fields, 'Bs 150')).toBeUndefined();
  });
});

// Owner 2026-10-21: a product's name, description and simple price change right in the preview.
import { inlineProductChange, inlineProducts, parseBolivianPrice, simplePrice } from './source-inline-text';
describe('product words in place', () => {
  it('reads prices the way Bolivians write them', () => {
    expect(parseBolivianPrice('Bs 320,00')).toBe(32000);
    expect(parseBolivianPrice('Bs. 1.234,50')).toBe(123450);
    expect(parseBolivianPrice('150')).toBe(15000);
    expect(parseBolivianPrice('150.5')).toBe(15050);
    expect(parseBolivianPrice('1.500')).toBe(150000);
    expect(parseBolivianPrice('BOB 99,9')).toBe(9990);
    for (const bad of ['', 'gratis', '0', '-5', '1,2,3', 'Bs 1.2.3,4']) expect(parseBolivianPrice(bad)).toBeNull();
  });
  it('a price is edited in place only on a simple product', () => {
    expect(simplePrice({ id: 'a', variants: [] })).toBe(true);
    expect(simplePrice({ id: 'a', variants: [{ name: 'XL' }] })).toBe(false);
    expect(simplePrice({ id: 'a', fulfillmentType: 'MEMBERSHIP' })).toBe(false);
    expect(simplePrice({ id: 'a', discountPercent: 10 })).toBe(false);
    expect(simplePrice({ id: 'a', subscriptionPlans: [{ months: 1 }] })).toBe(false);
    expect(inlineProducts({ items: [{ id: 'a', variants: [] }, { id: 'b', variants: [{}] }, { name: 'x' }] })).toEqual({ a: { price: true }, b: { price: false } });
  });
  it('turns the change into the product patch, or sends it to the editor with a reason', () => {
    const item = { id: 'a', name: 'Tomahawk', amount: 32000, variants: [] };
    expect(inlineProductChange(item, 'name', '  Tomahawk  1 kg ')).toEqual({ patch: { name: 'Tomahawk 1 kg' } });
    expect(inlineProductChange(item, 'description', 'Madurado 28 días')).toEqual({ patch: { description: 'Madurado 28 días' } });
    expect(inlineProductChange(item, 'price', 'Bs 299,90')).toEqual({ patch: { amount: 29990 } });
    expect(inlineProductChange(item, 'price', 'caro')).toMatchObject({ editor: 'price' });
    expect(inlineProductChange({ ...item, variants: [{}] }, 'price', 'Bs 10')).toMatchObject({ editor: 'price' });
    expect(inlineProductChange(item, 'name', ' ')).toMatchObject({ editor: 'description' });
    expect(inlineProductChange(undefined, 'name', 'x')).toMatchObject({ editor: 'description' });
  });
});
