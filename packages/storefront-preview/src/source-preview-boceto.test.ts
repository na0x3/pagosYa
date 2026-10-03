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
  send({ type: 'pagosya:boceto-apply', selection: { id: 'h', path: 'copy/actions/cta', label: 'Botón principal' } }); await tick();
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
  send({ type: 'pagosya:boceto-apply', selection: { id: 'h', path: 'copy', label: 'Columna de texto' } }); await tick();
  const selected = w.document.querySelectorAll('[data-boceto-box="selected"]');
  expect(selected).toHaveLength(1);
  expect(selected[0].textContent).toBe('Columna de texto');
  expect(w.document.querySelectorAll('[data-boceto-box="child"]')).toHaveLength(3);
  send({ type: 'pagosya:boceto-apply', selection: { id: 'h', path: 'copy/gone', label: 'x' } }); await tick();
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
  send({ type: 'pagosya:boceto-apply', blocks: { h: { movable: ['copy/headline', 'copy/sub', 'copy/actions'] } }, selection: { id: 'h', path: 'copy', label: 'Columna de texto' } }); await tick();
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
  send({ type: 'pagosya:boceto-apply', selection: { id: 'h', path: 'copy', label: '' } }); await tick();
  const headline = w.document.querySelector('[data-skb-el="headline"]');
  pointer(w, 'pointerdown', headline, 10, 10);
  pointer(w, 'pointermove', w.document, 10, 40);
  pointer(w, 'pointerup', w.document, 10, 900); await tick();
  expect(posted.some(message => message.type === 'pagosya:boceto-node-move')).toBe(false);
});

it('forwards ⌥↑ / ⌥↓ / Supr to the Studio, but never while editing text', async () => {
  const { w, posted, send } = load();
  send({ type: 'pagosya:boceto-mode', on: true });
  send({ type: 'pagosya:boceto-apply', selection: { id: 'h', path: 'copy/sub', label: '' } }); await tick();
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
  send({ type: 'pagosya:boceto-apply', selection: { id: 'h', path: 'copy/sub', label: 'Bajada', reveal: true } }); await tick();
  const reveal = posted.find(message => message.type === 'pagosya:boceto-reveal');
  expect(reveal).toMatchObject({ type: 'pagosya:boceto-reveal' });
  expect(typeof reveal.top).toBe('number');
  expect(typeof reveal.height).toBe('number');
  send({ type: 'pagosya:boceto-apply', selection: { id: 'h', path: 'copy', label: '' } }); await tick();
  expect(posted.filter(message => message.type === 'pagosya:boceto-reveal')).toHaveLength(1);
});

it('review fixes: a copy/media flip drag leaves the columns to the flip attribute instead of moving the DOM', async () => {
  const { w, posted, send } = load();
  send({ type: 'pagosya:boceto-mode', on: true });
  send({ type: 'pagosya:boceto-apply', blocks: { h: { movable: ['copy', 'media'] } }, selection: { id: 'h', path: 'copy', label: '' } }); await tick();
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
  send({ type: 'pagosya:boceto-apply', blocks: { s: { movable: ['items/0', 'items/1', 'items/2', 'items/3'] } } }); await tick();
  const first = w.document.querySelector('[data-skb-node="0"]');
  pointer(w, 'pointerdown', first, 10, 20);
  pointer(w, 'pointermove', w.document, 60, 20); await tick();
  pointer(w, 'pointermove', w.document, 260, 25);
  pointer(w, 'pointerup', w.document, 260, 25); await tick();
  expect(posted[0]).toMatchObject({ path: 'items/0', order: ['1', '2', '0', '3'] });
});

it('follow-ups: Enter and Esc that finish a text edit leave the selection where it was', async () => {
  const { w, posted, send } = load();
  send({ type: 'pagosya:boceto-mode', on: true });
  send({ type: 'pagosya:boceto-apply', selection: { id: 'h', path: 'copy', label: '' } }); await tick();
  const sub = w.document.querySelector('[data-skb-el="sub"]');
  for (const key of ['Enter', 'Escape']) {
    sub.dispatchEvent(new w.MouseEvent('dblclick', { bubbles: true, cancelable: true })); await tick();
    expect(sub.getAttribute('contenteditable')).toBeTruthy();
    sub.dispatchEvent(new w.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })); await tick();
    expect(sub.getAttribute('contenteditable')).toBeNull();
  }
  expect(selects(posted)).toEqual([]);
});

it('follow-ups: the antetítulo is never a drop spot, so a part dropped above it lands below it', async () => {
  const html = `<!doctype html><html><body><section data-skb="b" id="skb-b"><div data-skb-group="copy"><p data-skb-node="kicker">NUEVO</p><h2 data-skb-el="headline">Título</h2><a data-skb-el="cta" href="#">Comprar</a></div></section></body></html>`;
  const dom = new JSDOM(sourcePreviewDocument({ ...(snapshot as any), files: [{ path: 'index.html', content: html }] } as never, 'index.html', {}), { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://source.invalid/index.html' });
  const w = dom.window; windows.push(w);
  const posted: any[] = [];
  w.addEventListener('message', (event: any) => { if (event.data?.type === 'pagosya:boceto-node-move') posted.push(event.data); });
  const send = (data: unknown) => w.dispatchEvent(new w.MessageEvent('message', { data, source: w }));
  [...w.document.querySelectorAll('[data-skb-group="copy"] > *')].forEach((node: any, i: number) => { node.getBoundingClientRect = () => ({ left: 0, right: 300, top: i * 40, bottom: i * 40 + 30, width: 300, height: 30, x: 0, y: i * 40 }); });
  send({ type: 'pagosya:boceto-mode', on: true });
  send({ type: 'pagosya:boceto-apply', blocks: { b: { movable: ['copy/headline', 'copy/cta'] } }, selection: { id: 'b', path: 'copy/cta', label: '' } }); await tick();
  const cta = w.document.querySelector('[data-skb-el="cta"]');
  pointer(w, 'pointerdown', cta, 10, 95);
  pointer(w, 'pointermove', w.document, 10, 60); await tick();
  pointer(w, 'pointermove', w.document, 10, 2);
  pointer(w, 'pointerup', w.document, 10, 2); await tick();
  expect(posted[0]).toMatchObject({ path: 'copy/cta', order: ['cta', 'headline'] });
  expect([...w.document.querySelector('[data-skb-group="copy"]').children].map((node: any) => node.textContent)).toEqual(['NUEVO', 'Comprar', 'Título']);
});

it('direct manipulation: grabbing a text, a button or a card drags that part with nothing selected', async () => {
  const { w, posted, send } = load();
  send({ type: 'pagosya:boceto-mode', on: true });
  send({ type: 'pagosya:boceto-apply', blocks: { h: { movable: ['copy', 'media', 'copy/headline', 'copy/sub', 'copy/actions', 'copy/actions/cta', 'copy/actions/cta2'] } } }); await tick();
  const drag = async (selector: string, toX: number, toY: number) => {
    pointer(w, 'pointerdown', w.document.querySelector(selector), 10, 10);
    pointer(w, 'pointermove', w.document, 10, 40); await tick();
    pointer(w, 'pointermove', w.document, toX, toY);
    pointer(w, 'pointerup', w.document, toX, toY); await tick();
  };
  await drag('[data-skb-el="headline"]', 10, 60);
  await drag('[data-skb-node="cta2"]', 10, 60);
  const moves = posted.filter(message => message.type === 'pagosya:boceto-node-move').map(message => message.path);
  expect(moves).toEqual(['copy/headline', 'copy/actions/cta2']);
  expect(selects(posted)).toEqual([['h', 'copy/headline'], ['h', 'copy/actions/cta2']]);
  expect(posted.some(message => message.type === 'pagosya:boceto-reorder')).toBe(false);
});

it('direct manipulation: the browser never starts its own drag of a link or photo on the board', async () => {
  const { w, send } = load();
  const start = () => { const event = new w.Event('dragstart', { bubbles: true, cancelable: true }); w.document.querySelector('[data-skb-node="cta"]').dispatchEvent(event); return event.defaultPrevented; };
  expect(start()).toBe(false);
  send({ type: 'pagosya:boceto-mode', on: true }); await tick();
  expect(start()).toBe(true);
  expect(w.document.documentElement.hasAttribute('data-boceto-on')).toBe(true);
});

it('direct manipulation: a cancelled pointer ends the drag instead of leaving the board stuck', async () => {
  const { w, posted, send } = load();
  send({ type: 'pagosya:boceto-mode', on: true });
  send({ type: 'pagosya:boceto-apply', blocks: { h: { movable: ['copy/headline', 'copy/sub', 'copy/actions'] } } }); await tick();
  pointer(w, 'pointerdown', w.document.querySelector('[data-skb-el="headline"]'), 10, 10);
  pointer(w, 'pointermove', w.document, 10, 40); await tick();
  pointer(w, 'pointercancel', w.document, 10, 40); await tick();
  expect(w.document.querySelector('[data-boceto-dragging]')).toBeNull();
  pointer(w, 'pointerdown', w.document.querySelector('[data-skb-el="sub"]'), 10, 10);
  pointer(w, 'pointermove', w.document, 10, 40); await tick();
  pointer(w, 'pointermove', w.document, 10, 60);
  pointer(w, 'pointerup', w.document, 10, 60); await tick();
  expect(posted.filter(message => message.type === 'pagosya:boceto-node-move').map(message => message.path)).toContain('copy/sub');
});

const rect = (left: number, top: number, width: number, height: number) => ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON() {} });
const layoutBoard = (w: any) => {
  w.document.querySelector('[data-skb="h"]').getBoundingClientRect = () => rect(0, 0, 1000, 600);
  w.document.querySelector('[data-skb-group="copy"]').getBoundingClientRect = () => rect(0, 0, 400, 300);
  w.document.querySelector('[data-skb-el="headline"]').getBoundingClientRect = () => rect(20, 30, 200, 50);
  w.document.querySelector('[data-skb-el="sub"]').getBoundingClientRect = () => rect(20, 100, 100, 20);
};

it('free layer: a part dragged 24px past its box comes out and lands where it is dropped', async () => {
  const { w, posted, send } = load();
  layoutBoard(w);
  send({ type: 'pagosya:boceto-mode', on: true });
  send({ type: 'pagosya:boceto-apply', blocks: { h: { movable: ['copy/headline', 'copy/sub', 'copy/actions'], freeable: ['copy/headline', 'copy/sub'] } } }); await tick();
  const headline = w.document.querySelector('[data-skb-el="headline"]');
  pointer(w, 'pointerdown', headline, 30, 40);
  pointer(w, 'pointermove', w.document, 30, 50); await tick();
  pointer(w, 'pointermove', w.document, 600, 100);
  pointer(w, 'pointerup', w.document, 600, 100); await tick();
  expect(posted.find(m => m.type === 'pagosya:boceto-free')).toEqual({ type: 'pagosya:boceto-free', id: 'h', path: 'copy/headline', x: 59, y: 15, w: 20 });
  expect(headline.getAttribute('data-skb-free')).toBe('on');
  expect(posted.some(m => m.type === 'pagosya:boceto-node-move')).toBe(false);
});

it('free layer: within 24px of its box a part still reorders instead', async () => {
  const { w, posted, send } = load();
  layoutBoard(w);
  send({ type: 'pagosya:boceto-mode', on: true });
  send({ type: 'pagosya:boceto-apply', blocks: { h: { movable: ['copy/headline', 'copy/sub', 'copy/actions'], freeable: ['copy/headline'] } } }); await tick();
  pointer(w, 'pointerdown', w.document.querySelector('[data-skb-el="headline"]'), 30, 40);
  pointer(w, 'pointermove', w.document, 30, 50); await tick();
  pointer(w, 'pointermove', w.document, 410, 120);
  pointer(w, 'pointerup', w.document, 410, 120); await tick();
  expect(posted.some(m => m.type === 'pagosya:boceto-free')).toBe(false);
});

it('free layer: a free part moves freely; live apply sets and clears its spot', async () => {
  const { w, posted, send } = load();
  layoutBoard(w);
  send({ type: 'pagosya:boceto-mode', on: true });
  send({ type: 'pagosya:boceto-apply', blocks: { h: { freeable: ['copy/sub'], free: { 'copy/sub': { x: 10, y: 20 } } } } }); await tick();
  const sub = w.document.querySelector('[data-skb-el="sub"]');
  expect([sub.getAttribute('data-skb-free'), sub.style.getPropertyValue('--skb-fx'), sub.style.getPropertyValue('--skb-fy')]).toEqual(['on', '10', '20']);
  pointer(w, 'pointerdown', sub, 50, 50);
  pointer(w, 'pointermove', w.document, 50, 60); await tick();
  pointer(w, 'pointermove', w.document, 150, 110);
  pointer(w, 'pointerup', w.document, 150, 110); await tick();
  expect(posted.find(m => m.type === 'pagosya:boceto-free')).toEqual({ type: 'pagosya:boceto-free', id: 'h', path: 'copy/sub', x: 20, y: 30 });
  send({ type: 'pagosya:boceto-apply', blocks: { h: { free: {} } } }); await tick();
  expect([sub.hasAttribute('data-skb-free'), sub.style.getPropertyValue('--skb-fx')]).toEqual([false, '']);
});

it('free layer: the corner square of a selected free part sets its width', async () => {
  const { w, posted, send } = load();
  layoutBoard(w);
  send({ type: 'pagosya:boceto-mode', on: true });
  send({ type: 'pagosya:boceto-apply', blocks: { h: { freeable: ['copy/sub'], free: { 'copy/sub': { x: 10, y: 20 } } } }, selection: { id: 'h', path: 'copy/sub', label: 'Bajada' } }); await tick();
  const grip = w.document.querySelector('[data-boceto-resize]');
  expect(grip).not.toBeNull();
  pointer(w, 'pointerdown', grip, 120, 120);
  pointer(w, 'pointermove', w.document, 220, 120);
  pointer(w, 'pointerup', w.document, 220, 120); await tick();
  expect(posted.find(m => m.type === 'pagosya:boceto-free')).toEqual({ type: 'pagosya:boceto-free', id: 'h', path: 'copy/sub', x: 10, y: 20, w: 20 });
});

it('free layer: on a board narrower than 900px nothing comes out of its box', async () => {
  const { w, posted, send } = load();
  layoutBoard(w);
  Object.defineProperty(w, 'innerWidth', { value: 600, configurable: true });
  send({ type: 'pagosya:boceto-mode', on: true });
  send({ type: 'pagosya:boceto-apply', blocks: { h: { freeable: ['copy/headline', 'copy/sub'], free: { 'copy/sub': { x: 10, y: 20 } } } } }); await tick();
  for (const selector of ['[data-skb-el="headline"]', '[data-skb-el="sub"]']) {
    pointer(w, 'pointerdown', w.document.querySelector(selector), 30, 40);
    pointer(w, 'pointermove', w.document, 30, 50); await tick();
    pointer(w, 'pointermove', w.document, 600, 100);
    pointer(w, 'pointerup', w.document, 600, 100); await tick();
  }
  expect(posted.some(m => m.type === 'pagosya:boceto-free')).toBe(false);
});

it('review: a part that held up its section lands under the pointer after the section closes the gap', async () => {
  const { w, posted, send } = load();
  layoutBoard(w);
  const headline = w.document.querySelector('[data-skb-el="headline"]');
  w.document.querySelector('[data-skb="h"]').getBoundingClientRect = () => (headline.hasAttribute('data-skb-free') ? rect(0, 0, 1000, 400) : rect(0, 0, 1000, 600));
  send({ type: 'pagosya:boceto-mode', on: true });
  send({ type: 'pagosya:boceto-apply', blocks: { h: { freeable: ['copy/headline'] } } }); await tick();
  pointer(w, 'pointerdown', headline, 30, 40);
  pointer(w, 'pointermove', w.document, 30, 50); await tick();
  pointer(w, 'pointermove', w.document, 600, 100);
  pointer(w, 'pointerup', w.document, 600, 100); await tick();
  expect(posted.find(m => m.type === 'pagosya:boceto-free')).toEqual({ type: 'pagosya:boceto-free', id: 'h', path: 'copy/headline', x: 59, y: 22.5, w: 20 });
});

it('review: an inserted text emptied in place keeps its words (a regular field may still empty)', async () => {
  const { w, posted, send } = load();
  send({ type: 'pagosya:boceto-mode', on: true }); await tick();
  const layer = w.document.createElement('div');
  layer.setAttribute('data-skb-group', 'extras');
  layer.innerHTML = '<p data-skb-node="eab1" data-skb-free="on" data-skb-field="extras.0.value">Hecho hoy</p>';
  w.document.querySelector('[data-skb="h"]').append(layer);
  const extra = layer.firstElementChild;
  extra.dispatchEvent(new w.MouseEvent('dblclick', { bubbles: true, cancelable: true })); await tick();
  extra.textContent = '  ';
  extra.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); await tick();
  expect(extra.textContent).toBe('Hecho hoy');
  expect(posted).toContainEqual({ type: 'pagosya:boceto-text', id: 'h', field: 'extras.0.value', value: '' });
  const sub = w.document.querySelector('[data-skb-field="sub"]');
  sub.dispatchEvent(new w.MouseEvent('dblclick', { bubbles: true, cancelable: true })); await tick();
  sub.textContent = '';
  sub.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); await tick();
  expect(sub.textContent).toBe('');
});

it('Ctrl/⌘+Z on the board asks the Studio to go back a step, even with nothing selected; not while typing', async () => {
  const { w, posted, send } = load();
  send({ type: 'pagosya:boceto-mode', on: true }); await tick();
  const press = (init: object) => w.document.dispatchEvent(new w.KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }));
  press({ key: 'z', ctrlKey: true }); press({ key: 'Z', metaKey: true, shiftKey: true }); press({ key: 'y', ctrlKey: true });
  await tick();
  expect(posted.filter(message => message.type === 'pagosya:boceto-key')).toEqual([{ type: 'pagosya:boceto-key', key: 'undo' }, { type: 'pagosya:boceto-key', key: 'redo' }, { type: 'pagosya:boceto-key', key: 'redo' }]);
  const headline = w.document.querySelector('[data-skb-field="headline"]');
  headline.dispatchEvent(new w.MouseEvent('dblclick', { bubbles: true, cancelable: true })); await tick();
  press({ key: 'z', ctrlKey: true }); await tick();
  expect(posted.filter(message => message.type === 'pagosya:boceto-key')).toHaveLength(3);
});

const pointerAt = (w: any, type: string, target: any, x: number, y: number, init: object = {}) =>
  target.dispatchEvent(new w.MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, ...init }));
const layoutStory = (w: any) => {
  const section = w.document.createElement('section');
  section.setAttribute('data-skb', 's');
  section.innerHTML = '<div data-skb-group="copy"><h2 data-skb-node="title">T</h2><div data-skb-group="paragraphs"><p data-skb-node="0">a</p><p data-skb-node="1">b</p><p data-skb-node="2">c</p></div></div>';
  w.document.querySelector('main').append(section);
  section.getBoundingClientRect = () => rect(0, 700, 1000, 500);
  section.querySelector('[data-skb-group="copy"]').getBoundingClientRect = () => rect(100, 750, 500, 400);
  section.querySelector('[data-skb-node="title"]').getBoundingClientRect = () => rect(100, 750, 400, 60);
  section.querySelector('[data-skb-group="paragraphs"]').getBoundingClientRect = () => rect(100, 830, 400, 260);
  ['0', '1', '2'].forEach((key, i) => { section.querySelector(`[data-skb-node="${key}"]`).getBoundingClientRect = () => rect(100, 830 + i * 100, 400, 60); });
  w.document.querySelector('[data-skb="h"]').getBoundingClientRect = () => rect(0, 0, 1000, 600);
  w.document.querySelector('[data-skb="c"]').getBoundingClientRect = () => rect(0, 600, 1000, 100);
  return section;
};

it('box: dragging from empty space selects the parts fully inside, never the section drag', async () => {
  const { w, posted, send } = load();
  const story = layoutStory(w);
  send({ type: 'pagosya:boceto-mode', on: true }); await tick();
  pointerAt(w, 'pointerdown', story, 50, 820);
  pointerAt(w, 'pointermove', w.document, 60, 830);
  pointerAt(w, 'pointermove', w.document, 520, 1000);
  pointerAt(w, 'pointerup', w.document, 520, 1000); await tick();
  expect(posted.filter(m => m.type === 'pagosya:boceto-reorder')).toEqual([]);
  // the box covers paragraphs 0 and 1 (not 2); the paragraphs group is not fully inside
  expect(posted.find(m => m.type === 'pagosya:boceto-select-many')).toEqual({ type: 'pagosya:boceto-select-many', items: [{ id: 's', path: 'copy/paragraphs/0' }, { id: 's', path: 'copy/paragraphs/1' }], add: false });
});

it('box: a box around every paragraph picks the paragraphs, not their group; Shift adds', async () => {
  const { w, posted, send } = load();
  const story = layoutStory(w);
  send({ type: 'pagosya:boceto-mode', on: true }); await tick();
  pointerAt(w, 'pointerdown', story, 50, 820);
  pointerAt(w, 'pointermove', w.document, 60, 830);
  pointerAt(w, 'pointermove', w.document, 520, 1100);
  pointerAt(w, 'pointerup', w.document, 520, 1100, { shiftKey: true }); await tick();
  expect(posted.find(m => m.type === 'pagosya:boceto-select-many')).toEqual({ type: 'pagosya:boceto-select-many', items: ['0', '1', '2'].map(key => ({ id: 's', path: `copy/paragraphs/${key}` })), add: true });
});

it('box: a box across two sections picks both blocks', async () => {
  const { w, posted, send } = load();
  layoutStory(w);
  send({ type: 'pagosya:boceto-mode', on: true }); await tick();
  pointerAt(w, 'pointerdown', w.document.querySelector('[data-skb="c"]'), 900, 650);
  pointerAt(w, 'pointermove', w.document, 905, 660);
  pointerAt(w, 'pointermove', w.document, 950, 760);
  pointerAt(w, 'pointerup', w.document, 950, 760); await tick();
  expect(posted.find(m => m.type === 'pagosya:boceto-select-many').items).toEqual([{ id: 'c', path: '' }, { id: 's', path: '' }]);
});

it('Shift+click adds the clicked part; every pick from the Studio gets a selected box', async () => {
  const { w, posted, send } = load();
  send({ type: 'pagosya:boceto-mode', on: true });
  send({ type: 'pagosya:boceto-apply', selection: { id: 'h', path: 'copy/headline', label: '', others: [{ id: 'h', path: 'copy/sub' }, { id: 'bad id', path: 'x' }] } }); await tick();
  expect(w.document.querySelectorAll('[data-boceto-box="selected"]')).toHaveLength(2);
  w.document.querySelector('[data-skb-el="sub"]').dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true })); await tick();
  expect(posted.at(-1)).toEqual({ type: 'pagosya:boceto-select', id: 'h', path: 'copy/sub', add: true });
});

it('right-click never shows the browser menu: it posts where it happened and what is under it', async () => {
  const { w, posted, send } = load();
  layoutBoard(w);
  send({ type: 'pagosya:boceto-mode', on: true }); await tick();
  const event = new w.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 100, clientY: 150 });
  w.document.querySelector('[data-skb-el="sub"]').dispatchEvent(event); await tick();
  expect(event.defaultPrevented).toBe(true);
  expect(posted.at(-1)).toEqual({ type: 'pagosya:boceto-context', id: 'h', path: '', x: 100, y: 150, fx: 10, fy: 25 });
  send({ type: 'pagosya:boceto-apply', selection: { id: 'h', path: 'copy/sub', label: '', others: [{ id: 'h', path: 'copy/headline' }] } }); await tick();
  w.document.querySelector('[data-skb-el="headline"]').dispatchEvent(new w.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 30, clientY: 40 })); await tick();
  expect(posted.at(-1)).toMatchObject({ type: 'pagosya:boceto-context', id: 'h', path: 'copy/headline' });
});
