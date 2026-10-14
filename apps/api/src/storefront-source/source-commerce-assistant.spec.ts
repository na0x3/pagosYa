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

function open(settings: Record<string, unknown>, hostedReply?: (action: string, body: any) => any) {
  const virtualConsole = new VirtualConsole();
  const dom = new JSDOM('<html><head></head><body><main></main><footer></footer></body></html>', { url: 'https://shop.test/', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole });
  const w = dom.window;
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
});
