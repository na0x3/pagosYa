// @vitest-environment jsdom
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { receivePreviewSelection, sourcePreviewDocument } from './source-preview';

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
