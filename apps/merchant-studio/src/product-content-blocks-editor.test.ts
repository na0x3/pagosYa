// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { mountContentBlocksEditor, type ContentBlockInput } from './product-content-blocks-editor';
afterEach(() => document.body.replaceChildren());
const a = { preview: 'https://shop.test/a.jpg' }, b = { preview: 'https://shop.test/b.jpg' };
const media: ContentBlockInput = { id: 'blk_aaaaaaaaaaaa', type: 'media', imageUrl: a.preview, alt: 'Respaldo', caption: 'Reclinada' };
const compare: ContentBlockInput = { id: 'blk_bbbbbbbbbbbb', type: 'compare', title: 'Reclinación', beforeUrl: a.preview, afterUrl: b.preview, beforeLabel: 'Recta', afterLabel: '35°', alt: 'Silla' };
function setup(initial: ContentBlockInput[] = []) {
  const host = document.createElement('div'); document.body.append(host);
  let photos = [a, b];
  const editor = mountContentBlocksEditor(host, { initial, photos: () => photos });
  const click = (selector: string) => host.querySelector<HTMLButtonElement>(selector)!.click();
  const fill = (field: string, value: string, row = 0) => { const input = host.querySelector<HTMLInputElement>(`[data-block-row="${row}"] [data-block-field="${field}"]`)!; input.value = value; input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); };
  return { host, editor, click, fill, removePhoto: () => { photos = [a]; editor.refreshPhotos(); } };
}
it('adds media from the photo pool and returns trimmed plain text', () => {
  const t = setup(); expect(t.host.querySelector('details')!.open).toBe(false);
  t.click('[data-block-add="media"]');
  t.fill('imageUrl', b.preview); t.fill('alt', ' Respaldo '); t.fill('caption', '<img onerror=x>');
  expect(t.editor.values()).toEqual([{ type: 'media', imageUrl: b.preview, alt: 'Respaldo', caption: '<img onerror=x>' }]);
  expect(t.host.querySelector('img[onerror]')).toBeNull();
});
it('adds an accessible before/after block with both photos and labels', () => {
  const t = setup(); t.click('[data-block-add="compare"]');
  for (const [key, value] of Object.entries(compare)) if (!['id', 'type'].includes(key)) t.fill(key, value);
  const { id, ...expected } = compare; expect(t.editor.values()).toEqual([expected]);
});
it('preserves saved ids and text, reorders and deletes blocks', () => {
  const t = setup([media, compare]); expect(t.editor.values()).toEqual([media, compare]);
  t.click('[data-block-row="0"] [data-block-down]'); expect(t.editor.values()).toEqual([compare, media]);
  t.click('[data-block-row="1"] [data-block-up]'); expect(t.editor.values()).toEqual([media, compare]);
  t.click('[data-block-row="0"] [data-block-delete]'); expect(t.editor.values()).toEqual([compare]);
});
it('disables adding at six and makes a seventh impossible', () => {
  const t = setup(); for (let i = 0; i < 7; i++) t.click('[data-block-add="media"]');
  expect(t.host.querySelectorAll('[data-block-row]')).toHaveLength(6);
  expect(t.host.querySelector<HTMLButtonElement>('[data-block-add="media"]')!.disabled).toBe(true);
  expect(t.host.querySelector('[data-block-count]')!.textContent).toBe('6 de 6');
});
it('marks removed pool photos invalid and refuses to save until corrected', () => {
  const t = setup([compare]); t.removePhoto();
  expect(t.host.querySelector('[data-block-field="afterUrl"]')!.getAttribute('aria-invalid')).toBe('true');
  expect(() => t.editor.values()).toThrow(/^Una foto de un bloque fue retirada/);
  t.fill('afterUrl', a.preview); expect(t.editor.values()[0]).toMatchObject({ afterUrl: a.preview });
});
it('reports required and overlong text in Spanish before save', () => {
  const t = setup([media, { ...media, alt: '' }]);
  expect(() => t.editor.values()).toThrow('Falta la descripción de la foto en el bloque 2.');
  t.fill('alt', 'x'.repeat(161), 1); expect(() => t.editor.values()).toThrow('160');
});
it('escapes saved text on redraw and disposes its delegated handlers', () => {
  const t = setup([{ ...media, caption: '\"><img src=x onerror=alert(1)>' }]);
  t.editor.refreshPhotos(); expect(t.host.querySelector('img')).toBeNull();
  expect(t.editor.values()[0]).toMatchObject({ caption: '\"><img src=x onerror=alert(1)>' });
  t.editor.dispose(); expect(t.host.childElementCount).toBe(0);
});
