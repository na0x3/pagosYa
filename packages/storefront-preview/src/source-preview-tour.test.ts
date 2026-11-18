// @vitest-environment jsdom
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { sourcePreviewDocument } from './source-preview';

const { JSDOM } = createRequire(join(__dirname, '../../../apps/checkout/package.json'))('jsdom');
const page = `<!doctype html><html><body><header id="top">Menú <button data-cart-open>Carrito</button></header><main><div data-lb-home>
  <section data-lb data-lb-at="0"><h1>Portada</h1></section><section data-lb data-lb-at="1"><h2>Productos</h2><div data-pagosya-catalog><article class="card">Pan</article></div></section><section data-lb data-lb-at="2"><h2>Opiniones</h2></section>
</div></main><footer id="pie">Pie</footer></body></html>`;
const snapshot = { schemaVersion: 1, brief: { businessType: '', audience: '', primaryAction: '', visualDirection: '' }, files: [{ path: 'index.html', content: page }] };
const windows: any[] = [];
afterEach(() => { windows.splice(0).forEach(w => w.close()); });

function load() {
  const dom = new JSDOM(sourcePreviewDocument(snapshot as never, 'index.html', {}), { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://source.invalid/index.html' });
  const w = dom.window; windows.push(w);
  const scrolled: string[] = [];
  w.HTMLElement.prototype.scrollIntoView = function () { scrolled.push(this.tagName + (this.getAttribute('data-lb-at') ?? '')); };
  const send = (data: unknown) => w.dispatchEvent(new w.MessageEvent('message', { data, source: w }));
  return { w, scrolled, send, marked: () => Array.from(w.document.querySelectorAll('[data-pagosya-tour-focus]')).map((el: any) => el.tagName + (el.getAttribute('data-lb-at') ?? '')) };
}

describe('YAPI tour focus in the preview (spec 2026-11-09)', () => {
  it('scrolls to and marks a home section by its number, the header and the footer', () => {
    const { send, scrolled, marked } = load();
    send({ type: 'pagosya:tour-focus', page: 'home', at: 2 });
    expect(scrolled).toEqual(['SECTION2']); expect(marked()).toEqual(['SECTION2']);
    send({ type: 'pagosya:tour-focus', part: 'header' });
    expect(marked()).toEqual(['HEADER']);
    send({ type: 'pagosya:tour-focus', part: 'main' });
    expect(marked()).toEqual(['MAIN']);
    send({ type: 'pagosya:tour-focus', part: 'footer' });
    expect(scrolled.at(-1)).toBe('FOOTER'); expect(marked()).toEqual(['FOOTER']);
  });
  it('the cart step marks the cart button; an unknown section changes nothing; another window is ignored', () => {
    const { w, send, marked } = load();
    send({ type: 'pagosya:tour-focus', kind: 'cart' });
    expect(marked()).toEqual(['BUTTON']);
    send({ type: 'pagosya:tour-focus', kind: 'product' });
    expect(marked()).toEqual(['DIV']);
    send({ type: 'pagosya:tour-focus', kind: 'cart' });
    send({ type: 'pagosya:tour-focus', page: 'home', at: 9 });
    expect(marked()).toEqual(['BUTTON']);
    w.dispatchEvent(new w.MessageEvent('message', { data: { type: 'pagosya:tour-focus', part: 'footer' }, source: null }));
    expect(marked()).toEqual(['BUTTON']);
  });
});
