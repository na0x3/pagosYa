// @vitest-environment jsdom
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { sourcePreviewDocument } from './source-preview';

/** The injected boceto mode runs in a page of its own; jsdom (from the checkout app's dependencies) runs the real preview document. */
const { JSDOM } = createRequire(join(__dirname, '../../../apps/checkout/package.json'))('jsdom');

const page = `<!doctype html><html><body><main id="contenido">
  <section data-skb="h" id="skb-h"><div class="copy" data-skb-group="copy"><h1 data-skb-el="headline" data-skb-field="headline">Algo dulce</h1><p data-skb-el="sub" data-skb-field="sub">sub</p><div data-skb-el="actions" data-skb-group="actions"><a data-skb-node="cta" href="#">cta</a><a data-skb-node="cta2" href="#">cta2</a></div></div><div class="media" data-skb-group="media"><img data-skb-node="photo" data-skb-photo="photo" src="x.png"><p data-skb-el="sticker" data-skb-field="sticker">Fresco</p></div></section>
  <section data-skb="c" id="skb-c"><div data-skb-group="head"><h2 data-skb-node="title" data-skb-field="title">Productos</h2></div></section>
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

const clickOn = (w: any, selector: string) => w.document.querySelector(selector).dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
const selects = (posted: any[]) => posted.filter(message => message.type === 'pagosya:boceto-select').map(message => [message.id, message.path]);

it('stays inert until activated, then clicks drill down block → group → element', async () => {
  const { w, posted, send } = load();
  clickOn(w, '[data-skb-node="cta"]'); await tick();
  expect(posted).toHaveLength(0);
  send({ type: 'pagosya:boceto-mode', on: true }); await tick();
  for (let i = 0; i < 4; i++) { clickOn(w, '[data-skb-node="cta"]'); await tick(); }
  expect(selects(posted)).toEqual([['h', ''], ['h', 'copy'], ['h', 'copy/actions'], ['h', 'copy/actions/cta']]);
});

it('a click elsewhere in the same block selects the child of the common ancestor', async () => {
  const { w, posted, send } = load();
  send({ type: 'pagosya:boceto-mode', on: true });
  send({ type: 'pagosya:boceto-apply', selection: { id: 'h', path: 'copy/actions/cta', label: 'Botón principal', movable: true, movableChildren: [] } }); await tick();
  clickOn(w, '[data-skb-el="sub"]'); await tick();
  clickOn(w, '[data-skb="c"] h2'); await tick();
  expect(selects(posted)).toEqual([['h', 'copy/sub'], ['c', '']]);
});

it('clicking block padding selects the block; Esc goes up, Enter goes into the first child', async () => {
  const { w, posted, send } = load();
  send({ type: 'pagosya:boceto-mode', on: true }); await tick();
  clickOn(w, '[data-skb="h"]'); await tick();
  const key = (k: string) => w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
  key('Enter'); await tick();
  key('Escape'); await tick();
  key('Escape'); await tick();
  expect(selects(posted)).toEqual([['h', ''], ['h', 'copy'], ['h', ''], ['', '']]);
});

it('draws the selected box with its tag and dotted boxes for its children; nothing for a stale path', async () => {
  const { w, send } = load();
  send({ type: 'pagosya:boceto-mode', on: true });
  send({ type: 'pagosya:boceto-apply', selection: { id: 'h', path: 'copy', label: 'Columna de texto', movable: true, movableChildren: ['headline', 'sub', 'actions'] } }); await tick();
  const selected = w.document.querySelectorAll('[data-boceto-box="selected"]');
  expect(selected).toHaveLength(1);
  expect(selected[0].textContent).toBe('Columna de texto');
  expect(w.document.querySelectorAll('[data-boceto-box="child"]')).toHaveLength(3);
  send({ type: 'pagosya:boceto-apply', selection: { id: 'h', path: 'copy/gone', label: 'x', movable: false, movableChildren: [] } }); await tick();
  expect(w.document.querySelectorAll('[data-boceto-box]')).toHaveLength(0);
});

it('live layout sets and clears group data attributes', async () => {
  const { w, send } = load();
  send({ type: 'pagosya:boceto-mode', on: true });
  send({ type: 'pagosya:boceto-apply', blocks: { h: { layout: { actions: { dir: 'column', gap: 'l', align: 'center' }, copy: { valign: 'end', gap: 'zz' } } } } }); await tick();
  const actions = w.document.querySelector('[data-skb-group="actions"]');
  expect([actions.getAttribute('data-skb-dir'), actions.getAttribute('data-skb-gap'), actions.getAttribute('data-skb-galign')]).toEqual(['column', 'l', 'center']);
  const copy = w.document.querySelector('[data-skb-group="copy"]');
  expect([copy.getAttribute('data-skb-valign'), copy.hasAttribute('data-skb-gap')]).toEqual(['end', false]);
  send({ type: 'pagosya:boceto-apply', blocks: { h: { layout: {} } } }); await tick();
  expect(actions.hasAttribute('data-skb-dir')).toBe(false);
});

const pointer = (w: any, type: string, target: any, x: number, y: number) =>
  target.dispatchEvent(new w.MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 }));

it('dragging a movable child of the selection reorders it and posts node-move with the new sibling order', async () => {
  const { w, posted, send } = load();
  send({ type: 'pagosya:boceto-mode', on: true });
  send({ type: 'pagosya:boceto-apply', selection: { id: 'h', path: 'copy', label: 'Columna de texto', movable: false, movableChildren: ['headline', 'sub', 'actions'] } }); await tick();
  const headline = w.document.querySelector('[data-skb-el="headline"]');
  pointer(w, 'pointerdown', headline, 10, 10);
  pointer(w, 'pointermove', w.document, 10, 40); await tick();
  pointer(w, 'pointermove', w.document, 10, 60);
  pointer(w, 'pointerup', w.document, 10, 60); await tick();
  const move = posted.find(message => message.type === 'pagosya:boceto-node-move');
  expect(move).toEqual({ type: 'pagosya:boceto-node-move', id: 'h', path: 'copy/headline', order: ['sub', 'actions', 'headline'] });
  expect(posted.some(message => message.type === 'pagosya:boceto-el-reorder')).toBe(false);
});

it('a child that is not movable drags the whole section instead', async () => {
  const { w, posted, send } = load();
  send({ type: 'pagosya:boceto-mode', on: true });
  send({ type: 'pagosya:boceto-apply', selection: { id: 'h', path: 'copy', label: '', movable: false, movableChildren: [] } }); await tick();
  const headline = w.document.querySelector('[data-skb-el="headline"]');
  pointer(w, 'pointerdown', headline, 10, 10);
  pointer(w, 'pointermove', w.document, 10, 40);
  pointer(w, 'pointerup', w.document, 10, 900); await tick();
  expect(posted.some(message => message.type === 'pagosya:boceto-node-move')).toBe(false);
});

it('forwards ⌥↑ / ⌥↓ / Supr to the Studio, but never while editing text', async () => {
  const { w, posted, send } = load();
  send({ type: 'pagosya:boceto-mode', on: true });
  send({ type: 'pagosya:boceto-apply', selection: { id: 'h', path: 'copy/sub', label: '', movable: true, movableChildren: [] } }); await tick();
  const key = (k: string, alt = false) => w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: k, altKey: alt, bubbles: true, cancelable: true }));
  key('ArrowUp', true); key('ArrowDown', true); key('Delete'); await tick();
  expect(posted.filter(m => m.type === 'pagosya:boceto-key').map(m => m.key)).toEqual(['up', 'down', 'delete']);
  w.document.querySelector('[data-skb-el="sub"]').dispatchEvent(new w.MouseEvent('dblclick', { bubbles: true, cancelable: true })); await tick();
  key('Backspace'); await tick();
  expect(posted.filter(m => m.type === 'pagosya:boceto-key')).toHaveLength(3);
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

it('review fixes: a reveal request reports where the selected part sits on the page', async () => {
  const { posted, send } = load();
  send({ type: 'pagosya:boceto-mode', on: true });
  send({ type: 'pagosya:boceto-apply', selection: { id: 'h', path: 'copy/sub', label: 'Bajada', movable: true, movableChildren: [], reveal: true } }); await tick();
  const reveal = posted.find(message => message.type === 'pagosya:boceto-reveal');
  expect(reveal).toMatchObject({ type: 'pagosya:boceto-reveal' });
  expect(typeof reveal.top).toBe('number');
  expect(typeof reveal.height).toBe('number');
  send({ type: 'pagosya:boceto-apply', selection: { id: 'h', path: 'copy', label: '', movable: true, movableChildren: [] } }); await tick();
  expect(posted.filter(message => message.type === 'pagosya:boceto-reveal')).toHaveLength(1);
});

it('review fixes: a copy/media flip drag leaves the columns to the flip attribute instead of moving the DOM', async () => {
  const { w, posted, send } = load();
  send({ type: 'pagosya:boceto-mode', on: true });
  send({ type: 'pagosya:boceto-apply', selection: { id: 'h', path: 'copy', label: '', movable: true, movableChildren: [] } }); await tick();
  const copy = w.document.querySelector('[data-skb-group="copy"]');
  pointer(w, 'pointerdown', copy.querySelector('h1'), 10, 10);
  pointer(w, 'pointermove', w.document, 40, 10); await tick();
  pointer(w, 'pointermove', w.document, 60, 10);
  pointer(w, 'pointerup', w.document, 60, 10); await tick();
  expect(posted.find(message => message.type === 'pagosya:boceto-node-move')).toMatchObject({ path: 'copy', order: ['media', 'copy'] });
  expect(w.document.querySelector('[data-skb="h"]').firstElementChild).toBe(copy);
});

it('review fixes: items in a multi-column grid drop by nearest position in 2D', async () => {
  const html = `<!doctype html><html><body><section data-skb="s" id="skb-s"><div data-skb-group="items" style="display:grid">${[0, 1, 2, 3].map(i => `<article data-skb-node="${i}">Paso ${i}</article>`).join('')}</div></section></body></html>`;
  const dom = new JSDOM(sourcePreviewDocument({ ...(snapshot as any), files: [{ path: 'index.html', content: html }] } as never, 'index.html', {}), { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://source.invalid/index.html' });
  const w = dom.window; windows.push(w);
  const posted: any[] = [];
  w.addEventListener('message', (event: any) => { if (event.data?.type === 'pagosya:boceto-node-move') posted.push(event.data); });
  const send = (data: unknown) => w.dispatchEvent(new w.MessageEvent('message', { data, source: w }));
  [...w.document.querySelectorAll('article')].forEach((node: any, i: number) => { node.getBoundingClientRect = () => ({ left: i * 100, right: i * 100 + 90, top: 0, bottom: 50, width: 90, height: 50, x: i * 100, y: 0 }); });
  send({ type: 'pagosya:boceto-mode', on: true });
  send({ type: 'pagosya:boceto-apply', selection: { id: 's', path: 'items', label: '', movable: false, movableChildren: ['0', '1', '2', '3'] } }); await tick();
  const first = w.document.querySelector('[data-skb-node="0"]');
  pointer(w, 'pointerdown', first, 10, 20);
  pointer(w, 'pointermove', w.document, 60, 20); await tick();
  pointer(w, 'pointermove', w.document, 260, 25);
  pointer(w, 'pointerup', w.document, 260, 25); await tick();
  expect(posted[0]).toMatchObject({ path: 'items/0', order: ['1', '2', '0', '3'] });
});
