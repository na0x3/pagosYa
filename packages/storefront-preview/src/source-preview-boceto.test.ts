// @vitest-environment jsdom
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { sourcePreviewDocument } from './source-preview';

/** The injected boceto mode runs in a page of its own; jsdom (from the checkout app's dependencies) runs the real preview document. */
const { JSDOM } = createRequire(join(__dirname, '../../../apps/checkout/package.json'))('jsdom');

const page = `<!doctype html><html><body><main id="contenido">
  <section data-skb="h" id="skb-h"><h1 data-skb-field="headline">Algo dulce</h1><p data-skb-field="sub">sub</p></section>
  <section data-skb="c" id="skb-c"><h2 data-skb-field="title">Productos</h2></section>
</main></body></html>`;
const snapshot = { schemaVersion: 1, brief: { businessType: '', audience: '', primaryAction: '', visualDirection: '' }, files: [{ path: 'index.html', content: page }] } as never;

const windows: any[] = [];
afterEach(() => { windows.splice(0).forEach(w => w.close()); });

function load() {
  const dom = new JSDOM(sourcePreviewDocument(snapshot, 'index.html', {}), { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://source.invalid/index.html' });
  const w = dom.window; windows.push(w);
  const posted: any[] = [];
  w.addEventListener('message', (event: any) => { if (String(event.data?.type || '').startsWith('pagosya:boceto-') && !['pagosya:boceto-mode','pagosya:boceto-ready'].includes(event.data.type)) posted.push(event.data); });
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
