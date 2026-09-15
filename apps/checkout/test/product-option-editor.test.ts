import { afterEach, expect, it } from 'vitest';
import '../../merchant-dashboard/src/product-options.js';
import { productOptionGroups, matchingOptionVariant, optionValueAvailable } from '../src/product-options';

const editor = PagosYaProductOptions;
const groups = [{ name: 'Color', values: ['Azul', 'Blanco'] }, { name: 'Talla', values: ['S', 'M'] }];
afterEach(() => { document.body.innerHTML = ''; });
function input(selector: string, value: string) { const el = document.querySelector<HTMLInputElement>(selector)!; el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })); }
function click(selector: string) { document.querySelector<HTMLButtonElement>(selector)!.click(); }
// Combinations loaded from a saved product carry no new-row flags.
function saved(rows: ReturnType<typeof editor.combinations>) { return rows.map(({ stockDirty, autoStock, ...row }, i) => ({ ...row, id: `v${i}` })); }

it('tracks Blue/S independently from White/S and never treats missing combinations as purchasable', () => {
  const rows = editor.combinations(groups, [], '120').map((row, i) => ({ ...row, id: `v${i}`, stock: String(i === 0 ? 0 : 4) }));
  const variants = editor.serialize(rows.map(r => ({ ...r, stockDirty: true }))).map((v, i) => ({ ...v, id: `v${i}` }));
  const selection = { Color: 'Azul', Talla: 'S' };
  expect(productOptionGroups(variants)).toEqual(groups);
  expect(matchingOptionVariant(variants, selection)?.stock).toBe(0);
  expect(optionValueAvailable(variants, selection, 'Color', 'Azul', v => Number(v.stock) > 0)).toBe(false);
  expect(optionValueAvailable(variants, selection, 'Color', 'Blanco', v => Number(v.stock) > 0)).toBe(true);
  expect(matchingOptionVariant(variants, { Color: 'Azul', Talla: 'XL' })).toBeUndefined();
});

it('preserves IDs, prices, photos and stock when adding values or reordering groups', () => {
  const previous = editor.combinations(groups, [], '120').map((r, i) => ({ ...r, id: `v${i}`, stock: String(i + 1), imageUrl: '/v1/uploads/photo.webp' }));
  const rows = editor.combinations([groups[1], { name: 'Color', values: ['Blanco', 'Azul', 'Negro'] }], previous, '150');
  expect(rows.find(r => r.name === 'S / Azul')).toMatchObject({ id: 'v0', stock: '1', amount: '120', imageUrl: '/v1/uploads/photo.webp' });
  // New combinations start without a stock limit unless the owner sets units for new combinations.
  expect(rows.find(r => r.name === 'S / Negro')).toMatchObject({ stock: '', amount: '150' });
  expect(editor.combinations(groups, [], '150', '3').every(r => r.stock === '3')).toBe(true);
  expect(previous[0].options?.[0].name).toBe('Color');
});

it('supports custom option names and rejects duplicates and oversized products before expansion', () => {
  const custom = ['Material', 'Acabado', 'Largo', 'Grabado', 'Empaque', 'Modelo'].map(name => ({ name, values: ['A', 'B'] }));
  expect(editor.combinations(custom, [], '1')).toHaveLength(64);
  expect(() => editor.combinations([...custom, { name: 'Otra', values: ['A'] }])).toThrow('6');
  expect(() => editor.combinations(custom.map(g => ({ ...g, values: ['A', 'B', 'C'] })))).toThrow('256');
  expect(() => editor.combinations([{ name: 'Color', values: ['Azul', ' azúl '] }])).toThrow('repetidos');
  expect(() => editor.combinations([{ name: 'Color', values: ['A'] }, { name: ' color ', values: ['B'] }])).toThrow('distinto');
});

it('filters bulk edits to matching combinations and distinguishes zero from unlimited stock', () => {
  document.body.innerHTML = '<div id="editor"></div>';
  const instance = editor.mount(document.querySelector('#editor')!, { variants: editor.combinations(groups, [], '120', '0') });
  input('[data-search]', 'Azul S'); input('[data-bulk-stock]', '5'); click('[data-bulk]');
  expect(instance.values().map(v => v.stock)).toEqual([5, 0, 0, 0]);
  input('[data-row="0"] [data-field="stock"]', '');
  expect(instance.values()[0].stock).toBeNull();
  input('[data-row="0"] [data-field="stock"]', '-1');
  expect(() => instance.values()).toThrow('stock');
});

it('rebuilds combinations on save but asks before retiring saved ones', () => {
  document.body.innerHTML = '<div id="editor"></div>';
  const instance = editor.mount(document.querySelector('#editor')!, { variants: saved(editor.combinations(groups, [], '120')) });
  input('[data-group-values="0"]', 'Azul');
  expect(() => instance.values()).toThrow('Confirma');
  expect(document.querySelector('[data-error]')!.textContent).toContain('retirarán 2');
  expect(() => instance.values()).toThrow('Confirma');
  click('[data-generate]');
  expect(instance.values().map(v => v.id)).toEqual(['v0', 'v1']);
});

it('does not overwrite inventory that may have changed while a merchant edits a price', () => {
  document.body.innerHTML = '<div id="editor"></div>';
  const rows = saved(editor.combinations(groups, [], '120')).map(r => ({ ...r, stock: '5' }));
  const instance = editor.mount(document.querySelector('#editor')!, { variants: rows });
  input('[data-row="0"] [data-field="amount"]', '130');
  expect(instance.values().every(v => !('stock' in v))).toBe(true);
  input('[data-row="1"] [data-field="stock"]', '2');
  expect(instance.values()[1].stock).toBe(2);
  expect(instance.values()[0]).not.toHaveProperty('stock');
});
