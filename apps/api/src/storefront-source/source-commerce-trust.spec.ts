import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { kitPath } from '@pagosya/storefront-kit';

/** The trust block (owner 2026-10-18: «structured sections with emojis, and things for the customers to trust»): the kit
 * fills [data-pagosya-trust] with emoji points from the store's live settings only, and hides it with nothing to say. */
const { JSDOM, VirtualConsole } = createRequire(join(__dirname, '../../../checkout/package.json'))('jsdom');
const commerce = readFileSync(kitPath('commerce.js'), 'utf8');

const windows: any[] = [];
async function open(settings: Record<string, unknown>, purpose = 'shop') {
  const virtualConsole = new VirtualConsole();
  const body = '<section id="confianza" data-pagosya-trust-section><div data-pagosya-trust><h2>Compra con tranquilidad</h2></div></section><section data-pagosya-catalog></section>';
  const dom = new JSDOM(`<html><head></head><body>${body}</body></html>`, { url: 'https://shop.test/', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole });
  const w = dom.window; windows.push(w);
  w.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  w.matchMedia = () => ({ matches: true });
  const data = { storeName: 'Marca', items: [], categories: [], ...settings };
  w.PAGOSYA_CONFIG = { slug: 'marca', apiBaseUrl: 'https://api.test', checkoutOrigin: 'https://pay.test', sitePurpose: purpose, data };
  w.fetch = jest.fn(async () => ({ ok: true, json: async () => data }));
  w.eval(commerce);
  await new Promise(resolve => setImmediate(resolve));
  return w.document as any;
}
afterEach(() => { windows.splice(0).forEach(w => w.close()); });
const points = (doc: any) => Array.from(doc.querySelectorAll('.pagosya-trust__card'), (card: any) => card.textContent.replace(/\s+/g, ' ').trim());

describe('the kit trust block', () => {
  it('lists only what the store settings make true, keeps the heading, and links contact and returns', async () => {
    const doc = await open({ checkoutMode: 'payment', shippingPickupEnabled: true, shippingEnabled: false, contactPhone: '+591 7735 5093', policies: { returns: 'Cambios en 7 días.' } });
    expect(doc.querySelector('[data-pagosya-trust] h2').textContent).toBe('Compra con tranquilidad');
    expect(points(doc)).toEqual(['🔒Pago seguroProcesado por pagosYa', '🧾Sin sorpresasRevisas tu pedido y el total antes de pagar', '🛍️Retiro en tiendaLo eliges al revisar tu pedido', '↩️Cambios y devolucionesLee la política antes de comprar', '💬Escríbenos por WhatsApp+591 7735 5093']);
    expect(doc.querySelector('a.pagosya-trust__card').getAttribute('href')).toBe('https://wa.me/59177355093');
    expect(doc.querySelector('button.pagosya-trust__card').getAttribute('data-pagosya-policy')).toBe('returns');
    expect(doc.querySelectorAll('.pagosya-trust__list')).toHaveLength(1);
    // Emoji are markers beside their text, silent for screen readers.
    expect(Array.from(doc.querySelectorAll('.pagosya-trust__emoji'), (el: any) => el.getAttribute('aria-hidden'))).toEqual(Array(5).fill('true'));
  });

  it('never promises delivery or payment the store does not offer', async () => {
    const doc = await open({ checkoutMode: 'whatsapp', shippingEnabled: true, contactPhone: '+59170000000' });
    expect(Array.from(doc.querySelectorAll('.pagosya-trust__card strong'), (el: any) => el.textContent)).toEqual(['Pedido por WhatsApp', 'Sin sorpresas', 'Entrega a domicilio']);
  });

  it('hides the block, and the section the save made for it, with under two points (a showcase with no contact)', async () => {
    const doc = await open({}, 'service');
    expect(doc.querySelector('[data-pagosya-trust]').hidden).toBe(true);
    expect(doc.querySelector('[data-pagosya-trust-section]').hidden).toBe(true);
  });
});
