// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import '@pagosya/variant-editor';
afterEach(() => document.body.replaceChildren());
const photos = Array.from({ length: 9 }, (_, i) => `https://shop.test/${i + 1}.jpg`);
function setup(imageUrl?: string) {
  const host = document.createElement('div'); document.body.append(host);
  const editor = PagosYaProductOptions.mount(host, { photos: () => photos, variants: ['Rojo', 'Azul'].map(name => ({ id: name, name, amount: '10', stock: '2', imageUrl, options: [{ name: 'Color', value: name }] })) });
  const boxes = () => [...host.querySelectorAll<HTMLInputElement>('[data-row="0"] input[type=checkbox]')];
  return { host, editor, boxes };
}
it('selects photos in pool order, mirrors the first, and explicitly clears all photos', () => {
  const t = setup(); expect(t.boxes()).toHaveLength(9);
  t.boxes()[2].click(); t.boxes()[0].click();
  expect(t.editor.values()[0]).toMatchObject({ imageUrls: [photos[0], photos[2]], imageUrl: photos[0] });
  expect(t.host.querySelector('[data-row="0"] summary')!.textContent).toBe('2 fotos');
  t.boxes()[0].click(); t.boxes()[2].click();
  expect(t.editor.values()[0]).toMatchObject({ imageUrls: null, imageUrl: null });
});
it('loads legacy photos checked and omits untouched photo fields', () => {
  const t = setup(photos[1]);
  expect(t.boxes().filter(box => box.checked).map(box => box.value)).toEqual([photos[1]]);
  expect(t.editor.values()[0]).not.toHaveProperty('imageUrls');
  expect(t.editor.values()[0]).not.toHaveProperty('imageUrl');
});
it('does not allow a ninth selected photo', () => {
  const t = setup(); for (let i = 0; i < 8; i++) t.boxes()[i].click();
  expect(t.boxes()[8].disabled).toBe(true); t.boxes()[8].click();
  expect(t.editor.values()[0].imageUrls).toHaveLength(8);
});
