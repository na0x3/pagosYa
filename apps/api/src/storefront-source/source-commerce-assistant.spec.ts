import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { kitPath } from '@pagosya/storefront-kit';

const { JSDOM, VirtualConsole } = createRequire(join(__dirname, '../../../checkout/package.json'))('jsdom');
const commerce = readFileSync(kitPath('commerce.js'), 'utf8');
const chat = readFileSync(kitPath('chat.js'), 'utf8');
const ITEMS = [{ id: 'p1', name: 'Café', amount: 1000, currency: 'BOB', stock: null, imageUrls: [], variants: [], extras: [], categoryId: null }];
const ASSISTANT = { name: 'Carla', greeting: '¡Hola! Soy Carla.', avatarUrl: null, handoff: 'whatsapp', suggestions: ['¿Qué me recomiendas?'] };
const flush = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0)); };

const windows: any[] = [];
afterEach(() => { while (windows.length) windows.pop().close(); });

function open(settings: Record<string, unknown>, hostedReply?: (action: string, body: any) => any, prepare?: (w: any) => void) {
  const virtualConsole = new VirtualConsole();
  const dom = new JSDOM('<html><head></head><body><main></main><footer></footer></body></html>', { url: 'https://shop.test/', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole });
  const w = dom.window;
  windows.push(w);
  w.HTMLElement.prototype.scrollIntoView = () => {};
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new w.Event('close')); };
  w.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
  w.PAGOSYA_PREVIEW = true; w.PAGOSYA_HOSTED = true; w.PAGOSYA_PREVIEW_PAGE = 'index.html'; w.PAGOSYA_PREVIEW_QUERY = '';
  const data = { storeName: 'Luz', items: ITEMS, categories: [], contactPhone: '+591 70000000', contactFormEnabled: true, checkoutMode: 'payment', ...settings };
  w.PAGOSYA_CONFIG = { slug: 'luz', apiBaseUrl: 'https://api.test/v1', checkoutOrigin: 'https://pay.test', data };
  w.fetch = jest.fn(async () => ({ ok: true, json: async () => data }));
  w.PAGOSYA_HOSTED_REQUEST = jest.fn(async (action: string, body: any) => hostedReply ? hostedReply(action, body) : { ok: true, body: {} });
  const posted: any[] = []; w.parent.postMessage = (m: any) => { posted.push(m); };
  prepare?.(w);
  w.eval(commerce); w.eval(chat);
  return { w, doc: w.document, posted };
}

describe('kit chat.js', () => {
  it('stays away when the store has no assistant, and the contact button remains', () => {
    const { doc } = open({ assistant: null });
    expect(doc.querySelector('[data-pagosya-assistant]')).toBeNull();
    expect(doc.querySelector('[data-pagosya-contact]:not([hidden])')).not.toBeNull();
  });

  it('replaces the contact button with the bubble and opens with the greeting and suggestions', () => {
    const { doc } = open({ assistant: ASSISTANT });
    expect(doc.querySelector('[data-pagosya-contact]:not([hidden])')).toBeNull();
    const toggle = doc.querySelector('[data-assistant-toggle]') as HTMLButtonElement;
    expect(toggle.getAttribute('aria-label')).toBe('Abrir asistente de Luz');
    toggle.click();
    expect(doc.querySelector('.pya-panel')!.hasAttribute('hidden')).toBe(false);
    expect(doc.querySelector('.pya-log')!.textContent).toContain('¡Hola! Soy Carla.');
    expect([...doc.querySelectorAll('.pya-suggestions button')].map((b: any) => b.textContent)).toEqual(['¿Qué me recomiendas?']);
  });

  // baek 2026-10-16: an avatar filling the whole launcher (a logo on a light background) read as a beige blob, so the owner
  // could not find the bot. The launcher is always the chat icon on the accent; the avatar is a badge and stays in the panel.
  it('keeps the chat icon on the launcher when the bot has an avatar, which shows as a badge and in the panel', () => {
    const { doc } = open({ assistant: { ...ASSISTANT, avatarUrl: 'https://api.test/v1/uploads/logo.png' } });
    const toggle = doc.querySelector('[data-assistant-toggle]')!;
    expect(toggle.querySelector(':scope > .pya-launcher-icon svg')).not.toBeNull();
    expect(toggle.querySelector('.pya-badge img')?.getAttribute('src')).toBe('https://api.test/v1/uploads/logo.png');
    expect(doc.querySelector('.pya-head .pya-face img')?.getAttribute('src')).toBe('https://api.test/v1/uploads/logo.png');
  });

  // baek 2026-10-17: in Studio the bot only said «responde en tu tienda publicada», so the owner of a published store could
  // never talk to it there. A Studio preview now asks Studio, which answers through the merchant's test chat.
  const askInStudio = async (message: string) => {
    const opened = open({ assistant: ASSISTANT }, undefined, w => { w.PAGOSYA_HOSTED = false; });
    (opened.doc.querySelector('[data-assistant-toggle]') as HTMLButtonElement).click();
    (opened.doc.querySelector('#pya-input') as HTMLTextAreaElement).value = message;
    opened.doc.querySelector('.pya-form')!.dispatchEvent(new opened.w.Event('submit', { bubbles: true, cancelable: true }));
    await flush();
    return opened;
  };
  it('in a Studio preview asks Studio, which answers through the merchant test chat', async () => {
    const { w, doc, posted } = await askInStudio('¿Tienen croissants?');
    const asked = posted.find((m: any) => m?.type === 'pagosya:assistant-test');
    expect(asked.body).toEqual(expect.objectContaining({ message: '¿Tienen croissants?' }));
    w.dispatchEvent(new w.MessageEvent('message', { source: w, data: { type: 'pagosya:assistant-test-ack', id: asked.id } }));
    w.dispatchEvent(new w.MessageEvent('message', { source: w, data: { type: 'pagosya:assistant-test-reply', id: asked.id, ok: true, status: 200, json: { conversationId: 'cabcdefghijklmnopqrstuvw', reply: { text: 'Sí, hay croissants.', blocks: [] } } } }));
    await flush();
    expect(doc.querySelector('.pya-log')!.textContent).toContain('Sí, hay croissants.');
    expect(doc.querySelector('.pya-log')!.textContent).not.toContain('Vista previa');
  });

  it('in a Studio preview shows the test chat\'s own refusal, such as the monthly test allowance', async () => {
    const { w, doc, posted } = await askInStudio('Hola');
    const asked = posted.find((m: any) => m?.type === 'pagosya:assistant-test');
    w.dispatchEvent(new w.MessageEvent('message', { source: w, data: { type: 'pagosya:assistant-test-ack', id: asked.id } }));
    w.dispatchEvent(new w.MessageEvent('message', { source: w, data: { type: 'pagosya:assistant-test-reply', id: asked.id, ok: false, status: 400, json: { message: 'Usaste las 50 pruebas de este mes.' } } }));
    await flush();
    expect(doc.querySelector('.pya-log')!.textContent).toContain('Usaste las 50 pruebas de este mes.');
  });

  it('a preview no Studio answers says where to try the bot', async () => {
    const { doc } = await askInStudio('Hola');
    await new Promise(resolve => setTimeout(resolve, 1700));
    expect(doc.querySelector('.pya-log')!.textContent).toContain('Crecer › Asistente');
  });

  it('shows the chat icon and no badge on the launcher without an avatar', () => {
    const toggle = open({ assistant: ASSISTANT }).doc.querySelector('[data-assistant-toggle]')!;
    expect(toggle.querySelector(':scope > .pya-launcher-icon svg')).not.toBeNull();
    expect(toggle.querySelector('.pya-badge')).toBeNull();
  });

  it('sends through the hosted bridge, renders reply text as text, and adds to the cart with the kit button', async () => {
    const { w, doc } = open({ assistant: ASSISTANT }, (action) => action === 'assistant'
      ? { ok: true, body: { conversationId: 'cabcdefghijklmnopqrstuvw', reply: { text: 'Mira <img src=x onerror="window.__xss=1"> esto', blocks: [{ type: 'products', items: [{ id: 'p1', name: 'Café', price: 'Bs 10,00', originalPrice: null, inStock: true, image: null, addKey: 'p1' }] }] } } }
      : { ok: true, body: {} });
    (doc.querySelector('[data-assistant-toggle]') as HTMLButtonElement).click();
    (doc.querySelector('.pya-panel textarea') as HTMLTextAreaElement).value = '¿Tienen café?';
    doc.querySelector('.pya-panel form')!.dispatchEvent(new w.Event('submit', { cancelable: true, bubbles: true }));
    expect((doc.querySelector('.pya-panel form button[type=submit]') as HTMLButtonElement).disabled).toBe(true);
    await flush();
    expect(w.PAGOSYA_HOSTED_REQUEST).toHaveBeenCalledWith('assistant', expect.objectContaining({ message: '¿Tienen café?', pagePath: 'index.html' }));
    expect(doc.querySelector('.pya-log img')).toBeNull();
    expect(w.__xss).toBeUndefined();
    (doc.querySelector('.pya-card [data-add="p1"]') as HTMLButtonElement).click();
    const detail: any = {}; doc.dispatchEvent(new w.CustomEvent('pagosya:serialize-cart', { detail }));
    expect(detail.items).toEqual([{ id: 'p1', quantity: 1 }]);
    await flush();
    expect(doc.querySelector('.pya-panel [data-cart-open]')).not.toBeNull();
  });

  it('a contact fallback shows the WhatsApp handoff through the parent page', async () => {
    const { w, doc, posted } = open({ assistant: ASSISTANT }, () => ({ ok: true, body: { conversationId: null, fallback: 'contact' } }));
    (doc.querySelector('[data-assistant-toggle]') as HTMLButtonElement).click();
    (doc.querySelector('.pya-panel textarea') as HTMLTextAreaElement).value = 'hola';
    doc.querySelector('.pya-panel form')!.dispatchEvent(new w.Event('submit', { cancelable: true, bubbles: true }));
    await flush();
    expect(doc.querySelector('.pya-log')!.textContent).toContain('Ahora no puedo responder. Escríbele a la tienda 👉');
    (doc.querySelector('.pya-log [data-assistant-whatsapp]') as HTMLButtonElement).click();
    expect(posted).toContainEqual({ type: 'pagosya:source-external', url: 'https://wa.me/59170000000?text=' + encodeURIComponent('Hola, vengo del chat de la tienda.') });
  });

  it('"Ver" asks the kit to open the product page, and an unaddable card has no Agregar', () => {
    const { w, doc } = open({ assistant: ASSISTANT });
    const seen: any[] = []; doc.addEventListener('pagosya:open-product', (e: any) => seen.push(e.detail));
    w.PAGOSYA_ASSISTANT.open();
    w.PAGOSYA_ASSISTANT.render({ text: 'x', blocks: [{ type: 'products', items: [{ id: 'p1', name: 'Café', price: 'Bs 10,00', originalPrice: null, inStock: true, image: null, addKey: null }] }] });
    (doc.querySelector('[data-assistant-product="p1"]') as HTMLButtonElement).click();
    expect(seen).toEqual([{ id: 'p1' }]);
    expect(doc.querySelector('.pya-card [data-add]')).toBeNull();
  });

  const typeAndSend = (w: any, doc: Document, text: string) => {
    (doc.querySelector('[data-assistant-toggle]') as HTMLButtonElement).click();
    (doc.querySelector('.pya-panel textarea') as HTMLTextAreaElement).value = text;
    doc.querySelector('.pya-panel form')!.dispatchEvent(new w.Event('submit', { cancelable: true, bubbles: true }));
  };

  it('a malformed reply is never re-sent as if the connection dropped', async () => {
    const { w, doc } = open({ assistant: ASSISTANT }, () => ({ ok: true, body: { conversationId: 'cabcdefghijklmnopqrstuvw', reply: { text: 'x', blocks: [{ type: 'products', items: null }] } } }));
    typeAndSend(w, doc, 'hola'); await flush();
    expect(w.PAGOSYA_HOSTED_REQUEST).toHaveBeenCalledTimes(1);
    expect(doc.querySelector('.pya-log')!.textContent).toContain('No pude mostrar la respuesta.');
  });

  it('ignores a handoff WhatsApp link that is not the store number', async () => {
    const { w, doc } = open({ assistant: ASSISTANT }, () => ({ ok: true, body: { conversationId: 'cabcdefghijklmnopqrstuvw', reply: { text: 'x', blocks: [{ type: 'handoff', whatsappUrl: 'https://evil.example/x', summary: 's' }] } } }));
    typeAndSend(w, doc, 'hola'); await flush();
    const urls = [...doc.querySelectorAll('[data-assistant-whatsapp]')].map((b: any) => b.dataset.url);
    expect(urls.length).toBe(1);
    expect(urls[0]).toMatch(/^https:\/\/wa\.me\/59170000000\?text=/);
  });

  it('hosted failure shows Reintentar at once without re-sending', async () => {
    const { w, doc } = open({ assistant: ASSISTANT }, () => { throw new Error('timeout'); });
    typeAndSend(w, doc, 'hola'); await flush();
    expect(w.PAGOSYA_HOSTED_REQUEST).toHaveBeenCalledTimes(1);
    expect(doc.querySelector('.pya-log')!.textContent).toContain('Se cortó la conexión.');
    expect(doc.querySelector('[data-assistant-retry]')).not.toBeNull();
  });

  it('a failing hosted lead request is reported and re-enables the button', async () => {
    const { w, doc } = open({ assistant: { ...ASSISTANT, handoff: 'form' }, contactPhone: '' }, (action) => { if (action === 'lead') return Promise.reject(new Error('x')); return { ok: true, body: {} }; });
    (doc.querySelector('[data-assistant-toggle]') as HTMLButtonElement).click();
    const b = doc.querySelector('[data-assistant-handoff]') as HTMLButtonElement; b.click();
    expect(b.disabled).toBe(true);
    await flush();
    expect(doc.querySelector('.pya-log')!.textContent).toContain('No se pudo enviar. Inténtalo otra vez.');
    expect(b.disabled).toBe(false);
  });

  it('a refused message shows Spanish copy by status, never the raw server message', async () => {
    const cases: Array<[any, string]> = [
      [{ statusCode: 429, message: 'ThrottlerException: Too Many Requests' }, 'Vas muy rápido. Espera un momento y vuelve a escribir.'],
      [{ statusCode: 400, message: ['message must match /\\S/ regular expression'] }, 'No pude leer tu mensaje. Escríbelo de nuevo.'],
      [{ statusCode: 500, message: 'Internal server error' }, 'No se pudo enviar. Inténtalo otra vez.'],
      [{ message: 'Ya hay una solicitud en curso.' }, 'No se pudo enviar. Inténtalo otra vez.'],
    ];
    for (const [body, copy] of cases) {
      const { w, doc } = open({ assistant: ASSISTANT }, () => ({ ok: false, body }));
      typeAndSend(w, doc, 'hola'); await flush();
      const text = doc.querySelector('.pya-log')!.textContent!;
      expect(text).toContain(copy);
      expect(text).not.toContain('Exception');
      expect(text).not.toContain('Internal server error');
      expect(text).not.toContain('regular expression');
    }
  });

  it('a refused non-hosted message reads the HTTP status', async () => {
    const { w, doc } = open({ assistant: ASSISTANT });
    w.PAGOSYA_HOSTED = false; w.PAGOSYA_PREVIEW = false;
    doc.querySelector('[data-pagosya-assistant]')!.remove();
    delete w.PAGOSYA_ASSISTANT;
    w.fetch = jest.fn(async () => ({ ok: false, status: 429, json: async () => ({ message: 'Too Many Requests' }) }));
    w.eval(chat);
    typeAndSend(w, doc, 'hola'); await flush();
    expect(doc.querySelector('.pya-log')!.textContent).toContain('Vas muy rápido. Espera un momento y vuelve a escribir.');
    expect(doc.querySelector('.pya-log')!.textContent).not.toContain('Too Many Requests');
  });

  it('in a hosted store the product hint stays away once this page has a conversation', async () => {
    const hints: Array<() => void> = [];
    const onProductPage = (w: any) => {
      w.document.addEventListener('pagosya:current-product', (e: any) => { e.detail.id = 'p1'; e.detail.name = 'Café'; });
      const real = w.setTimeout.bind(w);
      w.setTimeout = (fn: any, ms: number) => { if (ms === 8000) { hints.push(fn); return 1; } return real(fn, ms); };
    };
    const fresh = open({ assistant: ASSISTANT }, undefined, onProductPage);
    expect(hints.length).toBe(1);
    hints.pop()!();
    expect(fresh.doc.querySelector('.pya-hint')!.hasAttribute('hidden')).toBe(false);

    const { w, doc } = open({ assistant: ASSISTANT }, () => ({ ok: true, body: { conversationId: 'cabcdefghijklmnopqrstuvw', reply: { text: 'Hola', blocks: [] } } }), onProductPage);
    typeAndSend(w, doc, 'hola'); await flush();
    (doc.querySelector('[data-assistant-close]') as HTMLButtonElement).click();
    expect(hints.length).toBe(1);
    hints.pop()!();
    expect(doc.querySelector('.pya-hint')!.hasAttribute('hidden')).toBe(true);
  });

  it('Escape on the launcher closes the open panel', () => {
    const { w, doc } = open({ assistant: ASSISTANT });
    const toggle = doc.querySelector('[data-assistant-toggle]') as HTMLButtonElement; toggle.click();
    toggle.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(doc.querySelector('.pya-panel')!.hasAttribute('hidden')).toBe(true);
  });

  it('a hung non-hosted request is aborted after 30 s and ends in the error path', async () => {
    const { w, doc } = open({ assistant: ASSISTANT });
    w.PAGOSYA_HOSTED = false; w.PAGOSYA_PREVIEW = false;
    doc.querySelector('[data-pagosya-assistant]')!.remove();
    delete w.PAGOSYA_ASSISTANT;
    let signal: any; const timers: any[] = []; const real = w.setTimeout.bind(w);
    w.setTimeout = (fn: any, ms: number) => { if (ms === 30000) { timers.push(fn); return 1; } return real(fn, ms); };
    w.fetch = jest.fn((_u: string, init: any) => { signal = init.signal; return new Promise((_r, rej) => init.signal.addEventListener('abort', () => rej(new Error('abort')))); });
    w.eval(chat);
    typeAndSend(w, doc, 'hola');
    expect(timers.length).toBe(1);
    timers[0]();
    expect(signal.aborted).toBe(true);
    await flush();
    expect(doc.querySelector('.pya-log')!.textContent).toContain('hola');
  });
});
