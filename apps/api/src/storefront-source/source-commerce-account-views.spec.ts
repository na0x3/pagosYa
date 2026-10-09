import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { kitPath } from '@pagosya/storefront-kit';

const { JSDOM } = createRequire(join(__dirname, '../../../checkout/package.json'))('jsdom');
const commerce = readFileSync(kitPath('commerce.js'), 'utf8');
type Ask = (action: string, body?: any) => Promise<{ ok: boolean; body: any }>;

// Spec 2026-10-08-store-built-in-account-pages: the account pages are drawn by the runtime, styled by the store.
async function page(gate: string, request: Ask | undefined, options: { preview?: boolean; config?: Record<string, unknown> } = {}) {
  const dom = new JSDOM(`<html><head></head><body><main class="ui-account-gate" data-account-gate="${gate}"><div class="ui-container"><a href="#" data-pagosya-account="${gate}">Ir</a></div></main><footer><nav data-pagosya-pages></nav></footer><p data-pagosya-status></p></body></html>`, { runScripts: 'outside-only', url: 'https://preview.invalid/' });
  const w = dom.window as any;
  w.HTMLElement.prototype.scrollIntoView = () => {};
  w.matchMedia = () => ({ matches: true });
  w.PAGOSYA_PREVIEW = true;
  if (options.preview === false) { w.PAGOSYA_HOSTED = true; w.PAGOSYA_HOSTED_REQUEST = jest.fn(async () => ({ ok: true, body: {} })); }
  if (request) w.PAGOSYA_ACCOUNT_REQUEST = request;
  w.PAGOSYA_CONFIG = { slug: 'cafe', apiBaseUrl: 'https://api.test', checkoutOrigin: 'https://pagos.test', ...options.config, data: { storeName: 'Café', items: [] } };
  w.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ storeName: 'Café', items: [] }) }));
  w.__nav = null;
  w.document.addEventListener('click', (event: any) => { const link = event.target.closest?.('a'); if (link) { event.preventDefault(); w.__nav = link.getAttribute('href'); } }, true);
  w.eval(commerce);
  const settle = () => new Promise(resolve => setTimeout(resolve, 40));
  await settle();
  const input = (name: string) => w.document.querySelector(`[data-part=form] [name=${name}]`) as HTMLInputElement;
  return {
    w, doc: w.document as Document, settle,
    fill: (name: string, value: string) => { input(name).value = value; },
    value: (name: string) => input(name).value,
    submit: async () => { w.document.querySelector('[data-part=form]').dispatchEvent(new w.Event('submit', { cancelable: true, bubbles: true })); await settle(); },
    navigatedTo: () => w.__nav,
  };
}
const signedOut: Ask = async action => action === 'state' ? { ok: true, body: { signedIn: false } } : { ok: true, body: { signedIn: true, name: 'Ana' } };

describe('account pages drawn by the store runtime', () => {
  it('signed out, the login view draws its parts and signs in through the bridge', async () => {
    const calls: any[] = [];
    const p = await page('login', async (action, body) => { calls.push([action, body]); return signedOut(action); });
    const root = p.doc.querySelector('[data-part=account]') as HTMLElement;
    expect(root.dataset.layout).toBe('card');
    for (const part of ['title', 'form', 'input', 'submit', 'link']) expect(root.querySelector(`[data-part=${part}]`)).toBeTruthy();
    p.fill('email', 'a@b.bo'); p.fill('password', 'Gelato2026!'); await p.submit();
    expect(calls[1]).toEqual(['login', { email: 'a@b.bo', password: 'Gelato2026!' }]);
    expect(p.navigatedTo()).toBe('cuenta-pedidos.html');
    p.w.close();
  });

  it('a failed login keeps what was typed and shows the message in the error part', async () => {
    const p = await page('login', async action => action === 'state' ? { ok: true, body: { signedIn: false } } : { ok: false, body: { message: 'Correo o contraseña incorrectos.' } });
    p.fill('email', 'a@b.bo'); p.fill('password', 'malmalmal'); await p.submit();
    expect(p.doc.querySelector('[data-part=error]')!.textContent).toBe('Correo o contraseña incorrectos.');
    expect(p.value('email')).toBe('a@b.bo');
    p.w.close();
  });

  it('an account page signed out shows sign-in in place and returns there after signing in', async () => {
    const p = await page('addresses', signedOut);
    expect(p.doc.querySelector('[data-part=form] [name=password]')).toBeTruthy();
    p.fill('email', 'a@b.bo'); p.fill('password', 'Gelato2026!'); await p.submit();
    expect(p.navigatedTo()).toBe('cuenta-direcciones.html');
    p.w.close();
  });

  it('an expired session falls back to sign-in with a short message', async () => {
    const p = await page('orders', async action => action === 'state' ? { ok: true, body: { signedIn: true, name: 'Ana' } } : { ok: false, body: { status: 401, message: 'Sesión vencida' } });
    await p.settle();
    expect(p.doc.querySelector('[data-part=account]')!.textContent).toMatch(/Tu sesión terminó/);
    expect(p.doc.querySelector('[data-part=form] [name=password]')).toBeTruthy();
    p.w.close();
  });

  it('signed in, orders list escaped rows and a menu to the other account pages', async () => {
    const p = await page('orders', async action => action === 'state' ? { ok: true, body: { signedIn: true, name: '<img onerror=x>' } } : { ok: true, body: [{ id: 'o1', status: 'PAID', amount: 1000, currency: 'BOB', createdAt: '2026-10-01T00:00:00Z', items: [{ name: '<b>x</b>', quantity: 1 }] }] });
    await p.settle();
    expect(p.doc.querySelectorAll('[data-part=order]')).toHaveLength(1);
    expect(p.doc.querySelector('[data-part=order-status]')!.textContent).toBe('Pagado');
    expect(p.doc.querySelector('[data-part=account] img[onerror]')).toBeNull();
    expect(p.doc.querySelector('[data-part=account] b')).toBeNull();
    expect(Array.from(p.doc.querySelectorAll('[data-part=nav-item]') as any, (a: any) => a.getAttribute('href'))).toEqual(['cuenta-pedidos.html', 'cuenta-suscripciones.html', 'cuenta-direcciones.html', 'cuenta-perfil.html']);
    p.w.close();
  });

  it('without a trusted parent the gate keeps its link to the account app and draws nothing', async () => {
    const p = await page('login', undefined);
    expect(p.doc.querySelector('[data-part=account]')).toBeNull();
    expect((p.doc.querySelector('a[data-pagosya-account]') as HTMLAnchorElement).href).toBe('https://pagos.test/cuenta/cafe');
    p.w.close();
  });

  it('in the preview says no accounts are created, and applies the theme layout, photo and css', async () => {
    const p = await page('register', signedOut, { config: { accountTheme: { layout: 'split', photo: 'assets/hero.jpg', css: '[data-account-gate] [data-part="title"]{letter-spacing:1px}' } } });
    expect(p.doc.querySelector('[data-part=notice]')!.textContent).toBe('Vista previa · No se crean cuentas');
    expect((p.doc.querySelector('[data-part=account]') as HTMLElement).dataset.layout).toBe('split');
    expect(p.doc.querySelector('[data-part=media] img')!.getAttribute('src')).toBe('assets/hero.jpg');
    expect(p.doc.querySelector('style[data-pagosya-kit=account-theme]')!.textContent).toContain('letter-spacing');
    p.w.close();
  });

  it('shows the email confirmation the parent reports on the login view', async () => {
    const p = await page('login', async action => action === 'state' ? { ok: true, body: { signedIn: false, verified: true } } : { ok: true, body: {} });
    expect(p.doc.querySelector('[data-part=account]')!.textContent).toContain('Tu correo quedó confirmado');
    p.w.close();
  });
});
