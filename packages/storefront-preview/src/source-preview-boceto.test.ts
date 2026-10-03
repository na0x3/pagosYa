// @vitest-environment jsdom
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { sourcePreviewDocument } from './source-preview';

/** The injected boceto mode runs in a page of its own; jsdom (from the checkout app's dependencies) runs the real preview document. */
const { JSDOM } = createRequire(join(__dirname, '../../../apps/checkout/package.json'))('jsdom');

const page = `<!doctype html><html><body><main id="contenido">
  <section data-skb="h" id="skb-h"><div class="copy"><h1 data-skb-el="headline" data-skb-field="headline">Algo dulce</h1><p data-skb-el="sub" data-skb-field="sub">sub</p><div data-skb-el="actions"><a href="#">cta</a></div></div><div class="media"><p data-skb-el="sticker" data-skb-field="sticker">Fresco</p></div></section>
  <section data-skb="c" id="skb-c"><h2 data-skb-field="title">Productos</h2></section>
</main></body></html>`;
const snapshot = { schemaVersion: 1, brief: { businessType: '', audience: '', primaryAction: '', visualDirection: '' }, files: [{ path: 'index.html', content: page }] } as never;

const windows: any[] = [];
afterEach(() => { windows.splice(0).forEach(w => w.close()); });

function load() {
  const dom = new JSDOM(sourcePreviewDocument(snapshot, 'index.html', {}), { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://source.invalid/index.html' });
  const w = dom.window; windows.push(w);
  const posted: any[] = [];
  w.addEventListener('message', (event: any) => { if (String(event.data?.type || '').startsWith('pagosya:boceto-') && !['pagosya:boceto-mode','pagosya:boceto-ready','pagosya:boceto-size'].includes(event.data.type)) posted.push(event.data); });
  const send = (data: unknown) => w.dispatchEvent(new w.MessageEvent('message', { data, source: w }));
  return { w, posted, send };
}
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

it('stays inert until activated, then clicking a section posts boceto-select', async () => {
  const { w, posted, send } = load();
  const click = () => w.document.querySelector('[data-skb="h"] h1').dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
  click(); await tick();
  expect(posted).toHaveLength(0);
  send({ type: 'pagosya:boceto-mode', on: true }); await tick();
  click(); await tick();
  expect(posted).toEqual([{ type: 'pagosya:boceto-select', id: 'h' }]);
});

it('dragging a copy element reorders it inside its block and posts the visible order', async () => {
  const { w, posted, send } = load();
  send({ type: 'pagosya:boceto-mode', on: true }); await tick();
  const headline = w.document.querySelector('[data-skb-el="headline"]');
  const pointer = (type: string, target: any, x: number, y: number) =>
    target.dispatchEvent(new w.MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 }));
  pointer('pointerdown', headline, 10, 10);
  pointer('pointermove', w.document, 10, 40); await tick();
  pointer('pointermove', w.document, 10, 60);
  pointer('pointerup', w.document, 10, 60); await tick();
  const reorder = posted.find(message => message.type === 'pagosya:boceto-el-reorder');
  expect(reorder).toBeDefined();
  expect(reorder.id).toBe('h');
  expect(reorder.order).toEqual(['sub', 'actions', 'headline']);
});

it('dragging the sticker posts clamped percentage coordinates', async () => {
  const { w, posted, send } = load();
  send({ type: 'pagosya:boceto-mode', on: true }); await tick();
  const sticker = w.document.querySelector('[data-skb-el="sticker"]');
  const pointer = (type: string, target: any, x: number, y: number) =>
    target.dispatchEvent(new w.MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 }));
  pointer('pointerdown', sticker, 5, 5);
  pointer('pointermove', w.document, 25, 35); await tick();
  pointer('pointerup', w.document, 25, 35); await tick();
  const move = posted.find(message => message.type === 'pagosya:boceto-el-move');
  expect(move).toBeDefined();
  expect(move.id).toBe('h');
  expect(move.el).toBe('sticker');
  expect(move.x).toBeGreaterThanOrEqual(0);
  expect(move.x).toBeLessThanOrEqual(100);
  expect(move.y).toBeGreaterThanOrEqual(0);
  expect(move.y).toBeLessThanOrEqual(100);
});

it('double-click edits a field in place and commits on Enter', async () => {
  const { w, posted, send } = load();
  send({ type: 'pagosya:boceto-mode', on: true }); await tick();
  const headline = w.document.querySelector('[data-skb-field="headline"]');
  headline.dispatchEvent(new w.MouseEvent('dblclick', { bubbles: true, cancelable: true })); await tick();
  expect(headline.getAttribute('contenteditable')).toBeTruthy();
  headline.textContent = 'Nuevo título';
  headline.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); await tick();
  expect(posted).toContainEqual({ type: 'pagosya:boceto-text', id: 'h', field: 'headline', value: 'Nuevo título' });
  expect(headline.getAttribute('contenteditable')).toBeNull();
});

it('live apply: page style on the site root, alignment/flip on sections, photos only as inline image data', async () => {
  const html = `<!doctype html><html><body><div class="skb-site" data-skb-radius="round"><section data-skb="h" id="skb-h"><img data-skb-photo="photo" src="data:image/png;base64,AAAA" alt=""><img data-skb-photo="photos.1" src="data:image/png;base64,AAAA" alt=""></section></div></body></html>`;
  const dom = new JSDOM(sourcePreviewDocument({ ...(snapshot as any), files: [{ path: 'index.html', content: html }] } as never, 'index.html', {}), { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://source.invalid/index.html' });
  const w = dom.window; windows.push(w);
  const send = (data: unknown) => w.dispatchEvent(new w.MessageEvent('message', { data, source: w }));
  send({ type: 'pagosya:boceto-apply', style: { radius: 'square', header: 'center', evil: 'x' }, blocks: { h: { align: 'end', flip: true, photos: { photo: 'data:image/jpeg;base64,BBBB', 'photos.1': 'javascript:alert(1)', onerror: 'data:image/png;base64,CCCC' } } } });
  await tick();
  const site = w.document.querySelector('.skb-site');
  expect(site.getAttribute('data-skb-radius')).toBe('square');
  expect(site.getAttribute('data-skb-header')).toBe('center');
  expect(site.hasAttribute('data-skb-evil')).toBe(false);
  const section = w.document.querySelector('[data-skb="h"]');
  expect(section.getAttribute('data-skb-align')).toBe('end');
  expect(section.getAttribute('data-skb-flip')).toBe('on');
  expect(w.document.querySelector('img[data-skb-photo="photo"]').getAttribute('src')).toBe('data:image/jpeg;base64,BBBB');
  expect(w.document.querySelector('img[data-skb-photo="photos.1"]').getAttribute('src')).toBe('data:image/png;base64,AAAA');
});
