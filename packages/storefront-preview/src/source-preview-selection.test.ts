// @vitest-environment jsdom
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { receivePreviewSelection, receivePreviewViewing, sourcePreviewDocument } from './source-preview';

/** The injected edit mode runs in a page of its own; jsdom (from the checkout app's dependencies) runs the real preview document. */
const { JSDOM } = createRequire(join(__dirname, '../../../apps/checkout/package.json'))('jsdom');

const page = `<!doctype html><html><body><header><a href="index.html">Inicio</a></header><main>
  <section id="hero"><h1>Hola mundo</h1><p class="lead">Bienvenido a nuestra tienda</p><a href="otra.html">Ver más</a></section>
  <section id="menu-del-dia"><div data-pagosya-catalog><p class="card">Producto</p></div><h2>Menú</h2></section>
  <section id="contacto"><p>Escríbenos</p></section>
  <div id="Id_No_Valido" data-x="1">no es una sección</div>
</main></body></html>`;
const snapshot = { schemaVersion: 1, brief: { businessType: '', audience: '', primaryAction: '', visualDirection: '' }, files: [{ path: 'index.html', content: page }, { path: 'otra.html', content: '<h1>Otra</h1>' }] };

const windows: any[] = [];
afterEach(() => { windows.splice(0).forEach(w => w.close()); });

/** Loads the preview document and records what the page posts to its parent (in jsdom the top window is its own parent). */
function load(navigation: Record<string, unknown> = {}) {
  const dom = new JSDOM(sourcePreviewDocument(snapshot, 'index.html', navigation), { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://source.invalid/index.html' });
  const w = dom.window; windows.push(w);
  const posted: any[] = [];
  w.addEventListener('message', (event: any) => { if (event.data?.type === 'pagosya:source-select') posted.push(event.data); });
  const send = (data: unknown) => w.dispatchEvent(new w.MessageEvent('message', { data, source: w }));
  const click = (selector: string) => { const el = w.document.querySelector(selector); const event = new w.MouseEvent('click', { bubbles: true, cancelable: true }); el.dispatchEvent(event); return event; };
  return { w, posted, send, click, overlay: () => w.document.querySelector('[data-pagosya-edit-overlay]') };
}
const tick = () => new Promise(resolve => setTimeout(resolve, 10));

it('posts the section that was clicked, its label and its own text, while edit mode is on', async () => {
  const { posted, send, click } = load();
  send({ type: 'pagosya:source-edit-mode', on: true });
  click('#hero h1');
  await vi.waitFor(() => expect(posted).toHaveLength(1));
  expect(posted[0]).toEqual({ type: 'pagosya:source-select', kind: 'section', sectionId: 'hero', label: 'Hola mundo', text: 'Hola mundo' });
});

it('finds the section from a deeper element, labels a section without a heading from its id, and ignores things that are not sections', async () => {
  const { posted, send, click } = load();
  send({ type: 'pagosya:source-edit-mode', on: true });
  click('#hero .lead');
  click('#contacto p');
  click('#Id_No_Valido');
  click('header a');
  await vi.waitFor(() => expect(posted).toHaveLength(2));
  expect(posted.map(p => [p.sectionId, p.label])).toEqual([['hero', 'Hola mundo'], ['contacto', 'Contacto']]);
});

it('marks platform-owned parts as platform, with no section id', async () => {
  const { posted, send, click } = load();
  send({ type: 'pagosya:source-edit-mode', on: true });
  click('[data-pagosya-catalog] .card');
  await vi.waitFor(() => expect(posted).toHaveLength(1));
  expect(posted[0]).toMatchObject({ kind: 'platform', sectionId: '', label: 'Lo administra pagosYa' });
});

it('does not let links, buttons or the cart act while editing: the click is cancelled and nothing navigates', async () => {
  const { posted, send, click, w } = load();
  send({ type: 'pagosya:source-edit-mode', on: true });
  const navigations: any[] = [];
  w.addEventListener('message', (event: any) => { if (event.data?.type === 'pagosya:source-navigate') navigations.push(event.data); });
  const event = click('#hero a');
  await tick();
  expect(event.defaultPrevented).toBe(true);
  expect(navigations).toEqual([]);
  expect(posted).toHaveLength(1);
});

it('does nothing at all until edit mode is turned on: no selection message, no overlay, links behave as before', async () => {
  const { posted, click, overlay, w } = load();
  const navigations: any[] = [];
  w.addEventListener('message', (event: any) => { if (event.data?.type === 'pagosya:source-navigate') navigations.push(event.data); });
  const event = click('#hero h1');
  click('#hero a');
  await tick();
  expect(posted).toEqual([]);
  expect(overlay()).toBeNull();
  expect(event.defaultPrevented).toBe(false);
  expect(navigations).toHaveLength(1);
});

it('draws an outline while editing and removes it, and stops listening, when edit mode is turned off', async () => {
  const { posted, send, click, overlay } = load();
  send({ type: 'pagosya:source-edit-mode', on: true });
  await vi.waitFor(() => expect(overlay()).not.toBeNull());
  expect(overlay()!.getAttribute('style') ?? '').toMatch(/pointer-events:\s*none/);
  send({ type: 'pagosya:source-edit-mode', on: false });
  await vi.waitFor(() => expect(overlay()).toBeNull());
  click('#hero h1');
  await tick();
  expect(posted).toEqual([]);
});

it('Escape while editing clears the selection', async () => {
  const { posted, send, w } = load();
  send({ type: 'pagosya:source-edit-mode', on: true });
  w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await vi.waitFor(() => expect(posted).toHaveLength(1));
  expect(posted[0]).toEqual({ type: 'pagosya:source-select', kind: 'section', sectionId: '', label: '' });
});

it('ignores edit-mode messages that do not come from the parent window', async () => {
  const { posted, click, w, overlay } = load();
  w.dispatchEvent(new w.MessageEvent('message', { data: { type: 'pagosya:source-edit-mode', on: true }, source: null }));
  click('#hero h1');
  await tick();
  expect(posted).toEqual([]);
  expect(overlay()).toBeNull();
});

it('is left out of a hosted (published) document altogether', () => {
  const hosted = sourcePreviewDocument(snapshot, 'index.html', { hosted: true });
  expect(hosted).not.toContain('data-pagosya-edit-overlay');
  expect(hosted).not.toContain('pagosya:source-select');
  expect(sourcePreviewDocument(snapshot, 'index.html', {})).toContain('pagosya:source-select');
});

describe('receivePreviewSelection', () => {
  const frame = () => ({ contentWindow: {} as Window }) as unknown as HTMLIFrameElement;
  const event = (data: unknown, frameEl: HTMLIFrameElement, over: Partial<MessageEvent> = {}) => ({ data, source: frameEl.contentWindow, origin: 'null', ...over }) as MessageEvent;
  const good = { type: 'pagosya:source-select', kind: 'section', sectionId: 'hero', label: 'Hola', text: 'Hola' };

  it('returns the parsed selection for a well-formed message from the preview frame', () => {
    const f = frame();
    expect(receivePreviewSelection(event(good, f), f)).toEqual({ kind: 'section', sectionId: 'hero', label: 'Hola', text: 'Hola' });
    expect(receivePreviewSelection(event({ ...good, kind: 'platform', sectionId: '', label: 'Lo administra pagosYa', text: undefined }, f), f)).toEqual({ kind: 'platform', sectionId: '', label: 'Lo administra pagosYa' });
    expect(receivePreviewSelection(event({ ...good, sectionId: '', label: '', text: undefined }, f), f)).toEqual({ kind: 'section', sectionId: '', label: '' });
  });

  it.each([
    ['another window', (f: HTMLIFrameElement) => event(good, f, { source: {} as Window })],
    ['another origin', (f: HTMLIFrameElement) => event(good, f, { origin: 'https://evil.test' })],
    ['an unknown type', (f: HTMLIFrameElement) => event({ ...good, type: 'other' }, f)],
    ['an unknown kind', (f: HTMLIFrameElement) => event({ ...good, kind: 'button' }, f)],
    ['an invalid section id', (f: HTMLIFrameElement) => event({ ...good, sectionId: 'Hero!' }, f)],
    ['a section id that is too long', (f: HTMLIFrameElement) => event({ ...good, sectionId: 'a'.repeat(49) }, f)],
    ['a non-string section id', (f: HTMLIFrameElement) => event({ ...good, sectionId: 5 }, f)],
    ['a platform selection with a section id', (f: HTMLIFrameElement) => event({ ...good, kind: 'platform' }, f)],
    ['a label over 60 characters', (f: HTMLIFrameElement) => event({ ...good, label: 'x'.repeat(61) }, f)],
    ['a non-string label', (f: HTMLIFrameElement) => event({ ...good, label: { a: 1 } }, f)],
    ['no data', (f: HTMLIFrameElement) => event(null, f)],
  ])('rejects %s', (_name, make) => {
    const f = frame();
    expect(receivePreviewSelection(make(f), f)).toBeNull();
    expect(receivePreviewSelection(make(f), null)).toBeNull();
  });

  it('ignores a non-text text field and cuts a long one to 200 characters', () => {
    const f = frame();
    expect(receivePreviewSelection(event({ ...good, text: 42 }, f), f)).toEqual({ kind: 'section', sectionId: 'hero', label: 'Hola' });
    expect(receivePreviewSelection(event({ ...good, text: 't'.repeat(500) }, f), f)!.text).toHaveLength(200);
  });
});

// Point YAPI at a part of the page (spec 2026-11-05 point-at): template sections, circles, what the merchant is looking at.
const templatePage = `<!doctype html><html><body><header class="es-header"><nav><a href="index.html">Inicio</a></nav></header>
<main id="contenido" data-lb-home>
  <section id="lb-0" data-lb="cover-split"><h1>Alta costura</h1></section>
  <section id="lb-2" data-lb="products-grid"><h2>Colección</h2><div data-pagosya-catalog><p class="card">Vestido Cala</p></div></section>
  <section id="inicio" data-lb="hero-split"><h2>Sin número</h2></section>
</main>
<div data-lb-home data-lb-page="about"><section id="lb-0" data-lb="story-split"><h2>Nuestra historia</h2></section></div>
<footer class="es-footer"><p>NOA</p></footer></body></html>`;
function loadTemplate() {
  const snap = { ...snapshot, files: [{ path: 'index.html', content: templatePage }] };
  const dom = new JSDOM(sourcePreviewDocument(snap, 'index.html', {}), { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://source.invalid/index.html' });
  const w = dom.window; windows.push(w);
  const posted: any[] = [];
  w.addEventListener('message', (event: any) => { if (event.data?.type === 'pagosya:source-select') posted.push(event.data); });
  const send = (data: unknown) => w.dispatchEvent(new w.MessageEvent('message', { data, source: w }));
  const click = (selector: string) => w.document.querySelector(selector).dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
  return { w, posted, send, click };
}

it('addresses a template section by page and number, and a product card inside it selects the section', async () => {
  const { posted, send, click } = loadTemplate();
  send({ type: 'pagosya:source-edit-mode', on: true });
  click('[data-lb="cover-split"] h1');
  click('[data-pagosya-catalog] .card');
  click('[data-lb-page="about"] h2');
  await vi.waitFor(() => expect(posted).toHaveLength(3));
  expect(posted[0]).toMatchObject({ kind: 'section', sectionId: 'lb-0', page: 'home', at: 0, label: 'Alta costura' });
  expect(posted[1]).toMatchObject({ kind: 'section', sectionId: 'lb-2', page: 'home', at: 2, label: 'Colección' });
  expect(posted[2]).toMatchObject({ kind: 'section', sectionId: 'lb-0', page: 'about', at: 0 });
});

it('falls back to the position among the [data-lb] children when the id carries no number', async () => {
  const { posted, send, click } = loadTemplate();
  send({ type: 'pagosya:source-edit-mode', on: true });
  click('#inicio h2');
  await vi.waitFor(() => expect(posted).toHaveLength(1));
  expect(posted[0]).toMatchObject({ sectionId: 'inicio', page: 'home', at: 2 });
});

it('the Studio keeps a template address and drops a bad one', () => {
  const frame = { contentWindow: {} } as unknown as HTMLIFrameElement;
  const event = (data: unknown) => ({ source: frame.contentWindow, origin: 'null', data }) as unknown as MessageEvent;
  expect(receivePreviewSelection(event({ type: 'pagosya:source-select', kind: 'section', sectionId: 'lb-0', label: 'x', at: 0, page: 'about' }), frame))
    .toEqual({ kind: 'section', sectionId: 'lb-0', label: 'x', at: 0, page: 'about' });
  expect(receivePreviewSelection(event({ type: 'pagosya:source-select', kind: 'section', sectionId: 'lb-0', label: 'x', at: 41, page: 'home' }), frame)).toBeNull();
  expect(receivePreviewSelection(event({ type: 'pagosya:source-select', kind: 'section', sectionId: 'lb-0', label: 'x', at: 1, page: 'blog' }), frame)).toBeNull();
});

/** jsdom has no layout: give elements boxes (client coordinates; the page is not scrolled). */
function box(w: any, selector: string, x: number, y: number, width: number, height: number) {
  w.document.querySelectorAll(selector).forEach((el: any) => { el.getBoundingClientRect = () => ({ left: x, top: y, right: x + width, bottom: y + height, width, height, x, y }); });
}
function drag(w: any, path: Array<[number, number]>, startOn = 'body') {
  const at = (type: string, [x, y]: [number, number], target: any) => target.dispatchEvent(new w.MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y }));
  const start = w.document.querySelector(startOn);
  at('pointerdown', path[0], start);
  path.slice(1).forEach(point => at('pointermove', point, w.document));
  at('pointerup', path[path.length - 1], w.document);
  start.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
}
const square = (x: number, y: number, s: number): Array<[number, number]> => [[x, y], [x + s, y], [x + s, y + s], [x, y + s], [x, y + 1]];

it('a circle selects the sections, words, photos and header parts it covers, and its click selects nothing more', async () => {
  const { w, posted, send } = loadTemplate();
  w.document.querySelector('[data-lb="cover-split"]').insertAdjacentHTML('beforeend', '<img src="https://api.test/v1/uploads/cala.jpg" alt="">');
  box(w, '.es-header', 0, 0, 1280, 80); box(w, '.es-header nav', 400, 20, 400, 40); box(w, '.es-header nav a', 410, 25, 60, 20);
  box(w, '[data-lb="cover-split"]', 0, 80, 1280, 600); box(w, '[data-lb="cover-split"] h1', 100, 200, 400, 80); box(w, '[data-lb="cover-split"] img', 700, 150, 300, 400);
  box(w, '[data-lb="products-grid"]', 0, 680, 1280, 800); box(w, '.es-footer', 0, 3000, 1280, 200);
  send({ type: 'pagosya:source-edit-mode', on: true });
  drag(w, square(50, 10, 1000), '[data-lb="cover-split"] h1');
  await vi.waitFor(() => expect(posted).toHaveLength(1));
  const area = posted[0].area;
  expect(posted[0]).toMatchObject({ kind: 'area', sectionId: 'lb-0', label: 'Alta costura' });
  expect(area.sections.map((s: any) => [s.page, s.at])).toEqual([['home', 0], ['home', 2]]);
  expect(area.texts).toEqual(['Inicio', 'Alta costura']);
  expect(area.photos).toEqual(['https://api.test/v1/uploads/cala.jpg']);
  expect(area.parts).toEqual(['header', 'menu']);
  expect(area.points.length % 2).toBe(0);
  expect(area.rect).toEqual({ x: 50, y: 10, width: 1000, height: 1000 });
  expect(area.pageQuery).toBe('index.html');
  // Final review 2026-11-05: the picture is drawn at the preview's own viewport height (covers are sized in vh).
  expect(area.height).toBe(w.innerHeight);
});

it('ignores a loop smaller than 24 × 24 and a drag never navigates', async () => {
  const { w, posted, send } = loadTemplate();
  send({ type: 'pagosya:source-edit-mode', on: true });
  const navigations: any[] = [];
  w.addEventListener('message', (event: any) => { if (event.data?.type === 'pagosya:source-navigate') navigations.push(event.data); });
  drag(w, square(10, 10, 20), '.es-header nav a');
  await tick();
  expect(posted).toEqual([]);
  expect(navigations).toEqual([]);
});

it('the Studio keeps a valid area and drops a malformed one', () => {
  const frame = { contentWindow: {} } as unknown as HTMLIFrameElement;
  const event = (data: unknown) => ({ source: frame.contentWindow, origin: 'null', data }) as unknown as MessageEvent;
  const area = { points: [0, 0, 100, 0, 100, 100], rect: { x: 0, y: 0, width: 100, height: 100 }, sections: [{ page: 'home', at: 1, label: 'Hola' }], texts: ['Hola'], photos: [], parts: ['menu'], width: 1280, height: 720, pageQuery: 'index.html' };
  expect(receivePreviewSelection(event({ type: 'pagosya:source-select', kind: 'area', sectionId: 'lb-1', label: 'Hola', area }), frame)).toMatchObject({ kind: 'area', area });
  for (const bad of [{ ...area, height: 100 }, { ...area, points: [0, NaN, 1, 1, 2, 2] }, { ...area, texts: Array(13).fill('x') }, { ...area, parts: ['body'] }, { ...area, width: 100 }, { ...area, pageQuery: '../x.html' }, { ...area, photos: ['/' + 'x'.repeat(500)] }])
    expect(receivePreviewSelection(event({ type: 'pagosya:source-select', kind: 'area', sectionId: 'lb-1', label: 'Hola', area: bad }), frame)).toBeNull();
});

it('always says which section is in the middle of the screen, without edit mode, once per 400 ms', async () => {
  const { w } = loadTemplate();
  const seen: any[] = [];
  w.addEventListener('message', (event: any) => { if (event.data?.type === 'pagosya:source-viewing') seen.push(event.data); });
  Object.defineProperty(w, 'innerHeight', { value: 800, configurable: true });
  box(w, '[data-lb="cover-split"]', 0, -900, 1280, 600); box(w, '[data-lb="products-grid"]', 0, -300, 1280, 900); box(w, '#inicio', 0, 600, 1280, 500);
  w.dispatchEvent(new w.Event('scroll')); w.dispatchEvent(new w.Event('scroll')); w.dispatchEvent(new w.Event('scroll'));
  await vi.waitFor(() => expect(seen).toHaveLength(1), { timeout: 1500 });
  await new Promise(resolve => setTimeout(resolve, 500));
  expect(seen).toHaveLength(1);
  expect(seen[0]).toMatchObject({ page: 'home', at: 2, sectionId: 'lb-2', label: 'Colección' });
});

it('the Studio keeps a valid viewing and drops a bad one', () => {
  const frame = { contentWindow: {} } as unknown as HTMLIFrameElement;
  const event = (data: unknown) => ({ source: frame.contentWindow, origin: 'null', data }) as unknown as MessageEvent;
  expect(receivePreviewViewing(event({ type: 'pagosya:source-viewing', page: 'faq', at: 1, sectionId: 'lb-1', label: 'Preguntas' }), frame)).toEqual({ page: 'faq', at: 1, sectionId: 'lb-1', label: 'Preguntas' });
  expect(receivePreviewViewing(event({ type: 'pagosya:source-viewing', page: 'faq', at: -1, label: 'x' }), frame)).toBeNull();
  expect(receivePreviewViewing({ source: {}, origin: 'null', data: { type: 'pagosya:source-viewing', page: 'home', label: 'x' } } as unknown as MessageEvent, frame)).toBeNull();
});

// Live 2026-11-05: the real preview is an opaque srcdoc, so the page comes from PAGOSYA_PREVIEW_PAGE, never from location.
it('a circle names the page the preview shows, with its query, whatever the frame URL is', async () => {
  const snap = { ...snapshot, files: [{ path: 'nosotros.html', content: templatePage }] };
  const dom = new JSDOM(sourcePreviewDocument(snap, 'nosotros.html', { query: '?id=abc' }), { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://source.invalid/' });
  const w = dom.window; windows.push(w);
  const posted: any[] = [];
  w.addEventListener('message', (event: any) => { if (event.data?.type === 'pagosya:source-select') posted.push(event.data); });
  box(w, '[data-lb="cover-split"]', 0, 0, 1280, 600); box(w, '[data-lb="cover-split"] h1', 100, 200, 400, 80);
  w.dispatchEvent(new w.MessageEvent('message', { data: { type: 'pagosya:source-edit-mode', on: true }, source: w }));
  drag(w, square(50, 50, 600), '[data-lb="cover-split"] h1');
  await vi.waitFor(() => expect(posted).toHaveLength(1));
  expect(posted[0].area.pageQuery).toBe('nosotros.html?id=abc');
});

// Live 2026-11-05: a drag that started on words or a photo became the browser's own text selection / drag-and-drop, which cancels
// the pointer (no pointerup), so the circle never arrived. While selecting, the page neither selects text nor drags.
it('while selecting, a press neither selects text nor starts the browser drag, and a cancelled pointer still ends the circle', async () => {
  const { w, posted, send } = loadTemplate();
  box(w, '[data-lb="cover-split"]', 0, 0, 1280, 600); box(w, '[data-lb="cover-split"] h1', 100, 200, 400, 80);
  send({ type: 'pagosya:source-edit-mode', on: true });
  const h1 = w.document.querySelector('[data-lb="cover-split"] h1');
  const down = new w.MouseEvent('pointerdown', { bubbles: true, cancelable: true, clientX: 120, clientY: 220 });
  h1.dispatchEvent(down);
  const dragStart = new w.Event('dragstart', { bubbles: true, cancelable: true });
  h1.dispatchEvent(dragStart);
  expect(down.defaultPrevented).toBe(true);
  expect(dragStart.defaultPrevented).toBe(true);
  expect(w.document.documentElement.style.userSelect).toBe('none');
  for (const [x, y] of square(60, 60, 500).slice(1)) w.document.dispatchEvent(new w.MouseEvent('pointermove', { bubbles: true, cancelable: true, clientX: x, clientY: y }));
  w.document.dispatchEvent(new w.MouseEvent('pointercancel', { bubbles: true, clientX: 60, clientY: 61 }));
  await vi.waitFor(() => expect(posted).toHaveLength(1));
  expect(posted[0]).toMatchObject({ kind: 'area', sectionId: 'lb-0' });
});

// Final review 2026-11-05: a fixed-id section («preguntas») after one that drew nothing is addressed by its data-lb-at, not its position.
it('takes the layout number from data-lb-at before the id or the position', async () => {
  const snap = { ...snapshot, files: [{ path: 'index.html', content: `<!doctype html><html><body><main data-lb-home>
    <section id="lb-0" data-lb-at="0" data-lb="cover-split"><h1>Hola</h1></section>
    <section id="preguntas" data-lb-at="3" data-lb="faq-split"><h2>Preguntas</h2></section></main></body></html>` }] };
  const dom = new JSDOM(sourcePreviewDocument(snap, 'index.html', {}), { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://source.invalid/index.html' });
  const w = dom.window; windows.push(w);
  const posted: any[] = [];
  w.addEventListener('message', (event: any) => { if (event.data?.type === 'pagosya:source-select') posted.push(event.data); });
  w.dispatchEvent(new w.MessageEvent('message', { data: { type: 'pagosya:source-edit-mode', on: true }, source: w }));
  w.document.querySelector('#preguntas h2').dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
  await vi.waitFor(() => expect(posted).toHaveLength(1));
  expect(posted[0]).toMatchObject({ sectionId: 'preguntas', page: 'home', at: 3 });
});
