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
  <a id="nav" href="index.html">Inicio</a>
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

it('a link waits a moment on one click and never navigates on a double-click (live check 2026-10-21)', async () => {
  const { w, el } = load();
  const reached: string[] = [];
  // The preview's own navigation listens on the document in the capture phase.
  w.addEventListener('message', (event: any) => { if (event.data?.type === 'pagosya:source-navigate') reached.push('nav'); });
  const click = () => el('#nav').dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true, button: 0, detail: 1 }));
  await tick();
  click();
  expect(reached).toEqual([]);
  await new Promise(resolve => setTimeout(resolve, 360));
  expect(reached).toEqual(['nav']);
  click(); click();
  await new Promise(resolve => setTimeout(resolve, 350));
  expect(reached).toEqual(['nav']);
});

it('a scripted link click goes through at once: the kit opens checkout with a link it removes right after (owner 2026-10-22)', async () => {
  const { w } = load();
  const reached: string[] = [];
  w.addEventListener('message', (event: any) => { if (event.data?.type === 'pagosya:source-navigate') reached.push(event.data.page); });
  await tick();
  // commerce-src/checkout/overlay.js openCheckout: append, click(), remove — held back, the replay hit a detached link
  // and the frame loaded checkout.html for real («localhost refused to connect»).
  const link = w.document.createElement('a'); link.href = 'index.html'; w.document.body.append(link); link.click(); link.remove();
  await tick();
  expect(reached).toEqual(['index.html']);
});

it('a kit card: words under its «Ver detalle» overlay open that product, never an inline edit (live check 2026-10-21)', async () => {
  const card = `<!doctype html><html><body><article class="menu-item" data-product-id="p9"><a class="menu-item__details" href="index.html" aria-label="Ver detalle"></a><div class="menu-item__copy"><h3 id="name">Tomahawk</h3><p id="desc">Madurada</p></div><strong class="menu-item__price" id="price">Bs 320</strong></article></body></html>`;
  const dom = new JSDOM(sourcePreviewDocument({ ...snapshot, files: [{ path: 'index.html', content: card }] }, 'index.html', { inlineText: true }), { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://source.invalid/index.html' });
  const w = dom.window; windows.push(w);
  const posted: any[] = []; w.addEventListener('message', (event: any) => { if (/^pagosya:inline-/.test(event.data?.type)) posted.push(event.data); });
  await tick();
  const overlay = w.document.querySelector('.menu-item__details');
  for (const id of ['name', 'price', 'desc']) {
    w.document.elementsFromPoint = () => [overlay, w.document.getElementById(id), w.document.querySelector('.menu-item'), w.document.body];
    overlay.dispatchEvent(new w.MouseEvent('dblclick', { bubbles: true, cancelable: true }));
  }
  await tick();
  expect(posted).toEqual([
    { type: 'pagosya:inline-product', productId: 'p9', field: 'name' },
    { type: 'pagosya:inline-product', productId: 'p9', field: 'price' },
    { type: 'pagosya:inline-product', productId: 'p9', field: 'name' },
  ]);
  expect(w.document.querySelector('[contenteditable]')).toBeNull();
});

it('an allowed product: name, description and simple price change in place and post as a product edit (owner 2026-10-21)', async () => {
  const card = `<!doctype html><html><body><article class="menu-item" data-product-id="p9"><a class="menu-item__details" href="index.html" aria-label="Ver detalle"></a><div class="menu-item__copy"><h3 id="name">Tomahawk</h3><p id="desc">Madurada</p></div><strong class="menu-item__price" id="price">Bs 320,00</strong></article>
    <article class="menu-item" data-product-id="p8"><div class="menu-item__copy"><h3 id="name8">Kit</h3></div><strong class="menu-item__price" id="price8">Bs 90,00</strong></article>
    <article class="gr-card menu-item" data-product-id="p7"><h3 class="gr-card__name" data-product-field="name"><a id="name7" href="index.html">Chorizo</a></h3></article></body></html>`;
  const dom = new JSDOM(sourcePreviewDocument({ ...snapshot, files: [{ path: 'index.html', content: card }] }, 'index.html', { inlineText: true, inlineProducts: { p9: { price: true }, p8: { price: false }, p7: { price: true } } }), { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://source.invalid/index.html' });
  const w = dom.window; windows.push(w);
  const posted: any[] = []; w.addEventListener('message', (event: any) => { if (/^pagosya:inline-/.test(event.data?.type)) posted.push(event.data); });
  await tick();
  const el = (id: string) => w.document.getElementById(id);
  const edit = (id: string, text: string) => {
    el(id).dispatchEvent(new w.MouseEvent('dblclick', { bubbles: true, cancelable: true }));
    expect(el(id).getAttribute('contenteditable')).toMatch(/plaintext-only|true/);
    el(id).textContent = text;
    el(id).dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  };
  edit('name', 'Tomahawk 1 kg'); edit('desc', 'Madurada 28 días'); edit('price', 'Bs 299,90');
  // A template card: the kit wraps the name in a link to its page; the link's words are what change.
  el('name7').dispatchEvent(new w.MouseEvent('dblclick', { bubbles: true, cancelable: true }));
  expect(w.getSelection().toString()).toBe('Chorizo');
  el('name7').dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  edit('name7', 'Chorizo casero');
  // A price with options is not edited here: its editor opens instead.
  el('price8').dispatchEvent(new w.MouseEvent('dblclick', { bubbles: true, cancelable: true }));
  await tick();
  expect(el('price8').hasAttribute('contenteditable')).toBe(false);
  expect(posted).toEqual([
    { type: 'pagosya:inline-product-text', productId: 'p9', field: 'name', before: 'Tomahawk', after: 'Tomahawk 1 kg' },
    { type: 'pagosya:inline-product-text', productId: 'p9', field: 'description', before: 'Madurada', after: 'Madurada 28 días' },
    { type: 'pagosya:inline-product-text', productId: 'p9', field: 'price', before: 'Bs 320,00', after: 'Bs 299,90' },
    { type: 'pagosya:inline-product-text', productId: 'p7', field: 'name', before: 'Chorizo', after: 'Chorizo casero' },
    { type: 'pagosya:inline-product', productId: 'p8', field: 'price' },
  ]);
});
