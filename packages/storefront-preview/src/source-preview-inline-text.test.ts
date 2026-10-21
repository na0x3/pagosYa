// @vitest-environment jsdom
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { sourcePreviewDocument } from './source-preview';

const { JSDOM } = createRequire(join(__dirname, '../../../apps/checkout/package.json'))('jsdom');

// Spec 2026-10-20 §6: double-click any text in the Studio preview and change it there.
const page = `<!doctype html><html><body><main>
  <h1 id="title">Fuego sin disculpas</h1>
  <p id="lead">Carne <strong>madurada</strong> en seco.</p>
  <article class="menu-item"><button class="menu-item__quick-look" data-product="p1">Vista rápida</button><h3 class="menu-item__name" data-product-field="name">Ribeye</h3><p data-product-field="price">Bs 150</p></article>
  <form><label id="field">Tu correo</label></form>
</main></body></html>`;
const snapshot = { schemaVersion: 1, brief: { businessType: '', audience: '', primaryAction: '', visualDirection: '' }, files: [{ path: 'index.html', content: page }] };
const windows: any[] = [];
afterEach(() => { windows.splice(0).forEach(w => w.close()); });

function load(inlineText = true) {
  const dom = new JSDOM(sourcePreviewDocument(snapshot, 'index.html', { inlineText }), { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://source.invalid/index.html' });
  const w = dom.window; windows.push(w);
  const posted: any[] = [];
  w.addEventListener('message', (event: any) => { if (/^pagosya:inline-(text|product)$/.test(event.data?.type)) posted.push(event.data); });
  const el = (selector: string) => w.document.querySelector(selector);
  const dbl = (selector: string) => el(selector).dispatchEvent(new w.MouseEvent('dblclick', { bubbles: true, cancelable: true }));
  const key = (selector: string, name: string) => el(selector).dispatchEvent(new w.KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true }));
  const send = (data: unknown) => w.dispatchEvent(new w.MessageEvent('message', { data, source: w }));
  return { w, posted, el, dbl, key, send };
}
const tick = () => new Promise(resolve => setTimeout(resolve, 10));

it('turns a double-clicked text into an editable one and posts the change on Enter', async () => {
  const { el, dbl, key, posted } = load();
  dbl('#title');
  expect(el('#title').getAttribute('contenteditable')).toMatch(/plaintext-only|true/);
  el('#title').textContent = 'Fuego  lento ';
  key('#title', 'Enter');
  await tick();
  expect(el('#title').hasAttribute('contenteditable')).toBe(false);
  expect(posted).toEqual([{ type: 'pagosya:inline-text', before: 'Fuego sin disculpas', after: 'Fuego lento' }]);
});

it('Escape restores the text and posts nothing; an unchanged commit posts nothing', async () => {
  const { el, dbl, key, posted } = load();
  dbl('#title'); el('#title').textContent = 'Otro'; key('#title', 'Escape');
  expect(el('#title').textContent).toBe('Fuego sin disculpas');
  dbl('#title'); key('#title', 'Enter');
  await tick();
  expect(posted).toEqual([]);
});

it('edits the innermost text-only element', async () => {
  const { el, dbl } = load();
  dbl('#lead strong');
  expect(el('#lead strong').getAttribute('contenteditable')).toMatch(/plaintext-only|true/);
  expect(el('#lead').hasAttribute('contenteditable')).toBe(false);
});

it('a product name or price asks the Studio for that product instead of editing it', async () => {
  const { el, dbl, posted } = load();
  dbl('.menu-item__name'); dbl('[data-product-field="price"]');
  await tick();
  expect(el('.menu-item__name').hasAttribute('contenteditable')).toBe(false);
  expect(posted).toEqual([{ type: 'pagosya:inline-product', productId: 'p1', field: 'name' }, { type: 'pagosya:inline-product', productId: 'p1', field: 'price' }]);
});

it('leaves forms alone, restores on the Studio’s revert, and stays off unless asked for', async () => {
  const on = load();
  on.dbl('#field');
  expect(on.el('#field').hasAttribute('contenteditable')).toBe(false);
  on.dbl('#title'); on.el('#title').textContent = 'Cambiado'; on.key('#title', 'Enter');
  on.send({ type: 'pagosya:inline-text-revert' });
  expect(on.el('#title').textContent).toBe('Fuego sin disculpas');
  const off = load(false);
  off.dbl('#title');
  expect(off.el('#title').hasAttribute('contenteditable')).toBe(false);
});
