// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { sourceShoppingProbe } from './source-shopping-probe';
import type { SourceCheck } from './source-checks';

const nativeFocus = HTMLElement.prototype.focus;
const nativeWindowFocus = window.focus;
afterEach(() => { HTMLElement.prototype.focus = nativeFocus; window.focus = nativeWindowFocus; vi.restoreAllMocks(); vi.useRealTimers(); document.body.innerHTML = ''; document.head.innerHTML = ''; });

async function probe(markup = '', script?: () => void) {
  vi.useFakeTimers();
  document.head.innerHTML = '<style>:focus{outline-style:solid;outline-width:3px;outline-color:rgb(0, 0, 0)}</style>';
  document.body.innerHTML = '<h1>Tienda de prueba para teclado</h1>' + markup;
  // jsdom does not invalidate its computed-style cache on pseudo-class changes.
  for (const el of document.body.querySelectorAll<HTMLElement>('*')) {
    el.addEventListener('focus', () => el.style.setProperty('--test-focus', 'focus'));
    el.addEventListener('blur', () => el.style.setProperty('--test-focus', 'blur'));
  }
  Object.defineProperty(document, 'fonts', { configurable: true, value: { ready: Promise.resolve() } });
  Object.defineProperty(HTMLElement.prototype, 'innerText', { configurable: true, get() { return this.textContent || ''; } });
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function(this: Element) {
    const hidden = this.closest('[hidden],dialog:not([open])');
    return { x: 0, y: 0, left: 0, top: 0, right: 100, bottom: 30, width: hidden ? 0 : 100, height: hidden ? 0 : 30, toJSON() {} };
  });
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
  const listeners = vi.spyOn(window, 'addEventListener').mockImplementation(() => {});
  const posted = vi.spyOn(window, 'postMessage').mockImplementation(() => {});
  sourceShoppingProbe();
  script?.();
  const load = listeners.mock.calls.find(([name]) => name === 'load')![1] as EventListener;
  load(new Event('load'));
  await vi.runAllTimersAsync();
  return (posted.mock.calls.find(([message]) => message.type === 'pagosya:source-check-result')![0] as { results: SourceCheck[] }).results;
}

it('preserves native element focus', async () => {
  const focus = HTMLElement.prototype.focus;
  await probe('<button>Comprar</button>');
  expect(HTMLElement.prototype.focus).toBe(focus);
});

it.each([
  ['<button><span aria-hidden="true">★</span></button>', 'Nombres accesibles con teclado'],
  ['<button style="opacity:0">Comprar</button>', 'Controles visibles con teclado'],
  ['<button style="outline-style:none;box-shadow:none">Comprar</button>', 'Indicador de foco visible'],
  ['<button style="outline-style:none;box-shadow:0 0 0 3px black">Sombra fija</button>', 'Indicador de foco visible'],
  ['<div style="opacity:0"><button>Oculto</button></div>', 'Controles visibles con teclado'],
  ['<button tabindex="-1" data-cart-open>Pedido</button>', 'Carrito accesible con Tab'],
])('reports keyboard defects for %s', async (markup, label) => {
  const rows = await probe(markup);
  expect(rows).toContainEqual(expect.objectContaining({ label, status: 'failed' }));
});


it('accepts labels, labelledby, image names and a changing focus outline', async () => {
  const rows = await probe('<button aria-label="Menú"><span aria-hidden="true">★</span></button><span id="name" hidden>Pedido</span><button aria-labelledby="name"></button><label for="email">Correo</label><input id="email"><a href="#"><img alt="Inicio"></a><button hidden>Oculto</button><button disabled>Deshabilitado</button>');
  for (const label of ['Recorrido con Tab', 'Nombres accesibles con teclado', 'Controles visibles con teclado', 'Indicador de foco visible']) {
    expect(rows).toContainEqual(expect.objectContaining({ label, status: 'passed' }));
  }
});

it('reports a Tab handler that traps focus before the cart', async () => {
  const rows = await probe('<button id="trap">Menú</button><button data-cart-open>Pedido</button>', () => {
    document.getElementById('trap')!.addEventListener('keydown', event => { if (event.key === 'Tab') event.preventDefault(); });
  });
  expect(rows).toContainEqual(expect.objectContaining({ label: 'Recorrido con Tab', status: 'failed' }));
  expect(rows).toContainEqual(expect.objectContaining({ label: 'Carrito accesible con Tab', status: 'failed' }));
});

for (const mode of ['working', 'click-only', 'cancel-enter', 'cancel-escape', 'cancel-dialog', 'wrong-focus'] as const) {
  it(`checks cart keyboard handlers and focus restoration: ${mode}`, async () => {
    const openerTag = mode === 'click-only' ? 'div tabindex="0" role="button"' : 'button';
    const rows = await probe(`<${openerTag} data-cart-open>Pedido</${mode === 'click-only' ? 'div' : 'button'}><button id="other">Otro</button><dialog class="cart-drawer"><button id="close">Cerrar</button></dialog>`, () => {
      const opener = document.querySelector<HTMLElement>('[data-cart-open]')!;
      const drawer = document.querySelector('dialog')!;
      const close = document.getElementById('close')!;
      // jsdom has no native dialog implementation. Keep application handlers and
      // native focus intact, and supply only the dialog's open/close primitives.
      drawer.close = () => { drawer.open = false; drawer.dispatchEvent(new Event('close')); };
      drawer.addEventListener('close', () => (mode === 'wrong-focus' ? document.getElementById('other')! : opener).focus());
      opener.addEventListener('click', () => { drawer.open = true; close.focus(); });
      opener.addEventListener('keydown', event => { if (mode === 'cancel-enter' && event.key === 'Enter') event.preventDefault(); });
      close.addEventListener('keydown', event => { if (mode === 'cancel-escape' && event.key === 'Escape') event.preventDefault(); });
      drawer.addEventListener('cancel', event => { if (mode === 'cancel-dialog') event.preventDefault(); });
    });
    expect(rows).toContainEqual(expect.objectContaining({ label: 'Carrito abre con Enter', status: ['click-only', 'cancel-enter'].includes(mode) ? 'failed' : 'passed' }));
    if (!['click-only', 'cancel-enter'].includes(mode)) {
      expect(rows).toContainEqual(expect.objectContaining({ label: 'Carrito cierra con Escape', status: ['cancel-escape', 'cancel-dialog'].includes(mode) ? 'failed' : 'passed' }));
      expect(rows).toContainEqual(expect.objectContaining({ label: 'El foco vuelve al pedido', status: mode === 'working' ? 'passed' : 'failed' }));
    }
  });
}


it('does not accept a zero-size shadow as a visible focus indicator', async () => {
  const rows = await probe('<button style="outline-style:none">Comprar</button>', () => {
    document.querySelector('button')!.addEventListener('focus', event => {
      (event.target as HTMLElement).style.boxShadow = 'rgb(0, 0, 0) 0px 0px 0px 0px';
    });
  });
  expect(rows).toContainEqual(expect.objectContaining({ label: 'Indicador de foco visible', status: 'failed' }));
});
