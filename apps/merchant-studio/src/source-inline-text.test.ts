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
