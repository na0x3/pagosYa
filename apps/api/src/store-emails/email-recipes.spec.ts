import { receiptCalls, receiptType, resolveCopy, richReceiptCalls, type ReceiptData, type ResolvedContent } from './email-recipes';
import type { EmailContext } from './email-context';
import { DEFAULT_EMAIL_COPY } from './email-copy-defaults';

const data: ReceiptData = { storeName: 'Café Illimani', customerName: 'Ana', orderId: 'pi_1', total: 'Bs 150,00', originalTotal: null,
  trackingUrl: 'https://t.example/track/1', subscription: null, appointment: null,
  items: [{ name: 'Café', variant: null, extras: null, quantity: 1, amount: 'Bs 150,00', image: null }] };

describe('resolveCopy', () => {
  it('prefers the merchant, then the kit, then the platform', () => {
    const copy = resolveCopy('order_confirmation', { order_confirmation: { headline: 'Del kit', intro: 'Intro del kit' } }, { headline: 'Del comercio' }, { cliente: 'Ana', tienda: 'Café' });
    expect(copy.headline).toBe('Del comercio');
    expect(copy.intro).toBe('Intro del kit');
    expect(copy.cta).toBe(DEFAULT_EMAIL_COPY.order_confirmation.cta);
  });

  it('fills placeholders, and reads naturally without a customer name', () => {
    expect(resolveCopy('order_confirmation', {}, {}, { cliente: 'Ana', tienda: 'Café' }).intro).toMatch(/^Hola Ana, /);
    expect(resolveCopy('order_confirmation', {}, {}, { cliente: null, tienda: 'Café' }).intro).toMatch(/^Hola, /);
    expect(resolveCopy('order_confirmation', {}, {}, { cliente: null, tienda: 'Café' }).subject).toBe('Recibo de tu compra en Café');
  });
});

describe('receipt recipes', () => {
  const copy = resolveCopy('order_confirmation', {}, {}, { cliente: 'Ana', tienda: 'Café Illimani' });

  it('order confirmation: heading, items, button, then the order id', () => {
    const calls = receiptCalls('order_confirmation', data, copy);
    expect(calls.map(c => c.block)).toEqual(['heading', 'items', 'button', 'note']);
    expect((calls.at(-1) as { text: string }).text).toContain('Orden: pi_1');
  });

  it('drops the button without a tracking link', () => {
    expect(receiptCalls('order_confirmation', { ...data, trackingUrl: null }, copy).map(c => c.block)).toEqual(['heading', 'items', 'note']);
  });

  it('adds the subscription note, which always says nothing is charged automatically', () => {
    const notes = receiptCalls('order_confirmation', { ...data, subscription: 'Tu suscripción se renueva cada mes.' }, copy)
      .filter(c => c.block === 'note').map(c => (c as { text: string }).text);
    expect(notes[0]).toBe('Tu suscripción se renueva cada mes. No se cobra automáticamente.');
  });

  it('appointment: heading, the service and date, items when paid, button, then the order id', () => {
    const appt = { ...data, appointment: { name: 'Corte de cabello', date: '12/10/2026, 10:00' } };
    expect(receiptType(appt)).toBe('appointment_confirmed');
    const calls = receiptCalls('appointment_confirmed', appt, resolveCopy('appointment_confirmed', {}, {}, { cliente: 'Ana', tienda: 'Café' }));
    expect(calls.map(c => c.block)).toEqual(['heading', 'note', 'items', 'button', 'note']);
    expect((calls[1] as { text: string }).text).toBe('Corte de cabello · 12/10/2026, 10:00');
    expect(receiptCalls('appointment_confirmed', { ...appt, items: [] }, copy).map(c => c.block)).not.toContain('items');
  });
});

describe('the rich receipt', () => {
  const copy = resolveCopy('order_confirmation', {}, {}, { cliente: 'Ana', tienda: 'Café Illimani' });
  const ctx: EmailContext = { storeUrl: 'https://s/cafe', heroImage: { src: 'https://h', alt: 'Café' }, nav: [], socials: [], address: null,
    policies: [{ key: 'returns', label: 'Cambios y devoluciones', href: 'https://s/cafe' }], contact: { email: 'hola@cafe.bo', phone: '+59170000000', whatsapp: true },
    delivers: true, review: null, promos: [], recommendations: () => [] };
  const content: ResolvedContent = { announcement: 'Envío gratis desde Bs 300', heroImage: null, promo: null, story: null, note: 'Gracias por confiar.', recommendations: true };
  const rich = (over = {}) => ({ ...data, delivery: null, ...over });

  it('orders the sections: announcement, hero, items, address, steps, trust, quote, contact, signoff', () => {
    const calls = richReceiptCalls('order_confirmation', rich({ trackingUrl: 'https://t', delivery: { method: 'delivery', recipient: 'Ana', lines: ['Av. 1', 'La Paz'] } }), copy, ctx, content);
    expect(calls.map(c => c.block)).toEqual(['announce', 'hero', 'items', 'address', 'steps', 'trust', 'quote', 'contact', 'note']);
    expect(calls[1]).toMatchObject({ href: 'https://t', label: copy.cta, image: ctx.heroImage });
    expect(calls.find(c => c.block === 'contact')).toMatchObject({ cards: [{ icon: 'mail', href: 'mailto:hola@cafe.bo' }, { icon: 'whatsapp', href: 'https://wa.me/59170000000' }] });
  });

  it('shows only the trust items the store actually offers', () => {
    const calls = richReceiptCalls('order_confirmation', rich(), copy, { ...ctx, policies: [], delivers: false, contact: { email: null, phone: null, whatsapp: false } }, content);
    expect((calls.find(c => c.block === 'trust') as any).items.map((i: any) => i.label)).toEqual(['Pago seguro']);
  });

  it('a store with nothing set up still gets a complete email and no empty boxes', () => {
    const bare: EmailContext = { ...ctx, heroImage: null, policies: [], contact: { email: null, phone: null, whatsapp: false }, delivers: false };
    const calls = richReceiptCalls('order_confirmation', rich({ trackingUrl: null }), copy, bare, { ...content, announcement: null });
    expect(calls.map(c => c.block)).toEqual(['hero', 'items', 'steps', 'trust', 'quote', 'note']);
    expect(calls[0]).toMatchObject({ image: null, href: null, label: null });
  });

  it("the merchant's chosen photo wins over the site's", () => {
    const own = { src: 'https://api.example/v1/uploads/own.webp', alt: 'Café' };
    expect(richReceiptCalls('order_confirmation', rich(), copy, ctx, { ...content, heroImage: own })[1]).toMatchObject({ image: own });
  });

  it('pickup and appointment get their own box and steps', () => {
    const pickup = richReceiptCalls('order_confirmation', rich({ delivery: { method: 'pickup', location: 'Sucursal Centro' } }), copy, ctx, content);
    expect(pickup.find(c => c.block === 'address')).toMatchObject({ title: 'Retiro en tienda', lines: ['Sucursal Centro'] });
    expect((pickup.find(c => c.block === 'steps') as any).steps.at(-1).title).toBe('Listo para retirar');
    const appt = richReceiptCalls('appointment_confirmed', rich({ appointment: { name: 'Corte', date: '12/10/2026, 10:00' } }), copy, ctx, content);
    expect(appt.find(c => c.block === 'address')).toMatchObject({ title: 'Tu cita', lines: ['Corte', '12/10/2026, 10:00'] });
    expect((appt.find(c => c.block === 'steps') as any).steps.map((s: any) => s.title)).toEqual(['Confirmada', 'Recordatorio', 'Te esperamos']);
  });

  it('a delivery order without an address shows no empty box', () => {
    expect(richReceiptCalls('order_confirmation', rich({ delivery: { method: 'delivery', recipient: null, lines: [] } }), copy, ctx, content).map(c => c.block)).not.toContain('address');
  });

  it('uses a real review when there is one, else the store note signed by the store', () => {
    const withReview = richReceiptCalls('order_confirmation', rich(), copy, { ...ctx, review: { text: 'Llegó perfecto', author: 'Ana', stars: 5 } }, content);
    expect(withReview.find(c => c.block === 'quote')).toMatchObject({ text: 'Llegó perfecto', author: 'Ana', stars: 5 });
    expect(richReceiptCalls('order_confirmation', rich(), copy, ctx, content).find(c => c.block === 'quote')).toMatchObject({ text: 'Gracias por confiar.', author: 'Café Illimani', stars: null });
  });

  it('adds promo, story and recommendations when present, each droppable in order', () => {
    const products = [{ name: 'A', price: '1', href: 'h', image: null }, { name: 'B', price: '1', href: 'h', image: null }];
    const calls = richReceiptCalls('order_confirmation', rich(), copy, { ...ctx, recommendations: () => products },
      { ...content, promo: { code: 'VUELVE10', discount: '10% en tu próxima compra' }, story: { title: 'Sobre', text: 'Hecho a mano', image: null } });
    const drop = Object.fromEntries(calls.filter(c => c.drop !== undefined).map(c => [c.block, c.drop]));
    expect(drop).toMatchObject({ steps: 1, trust: 2, promo: 3, quote: 4, story: 5, products: 6 });
    expect(calls.filter(c => ['hero', 'items', 'contact', 'note'].includes(c.block)).every(c => c.drop === undefined)).toBe(true);
  });

  it('recommends nothing from the order, and nothing when the merchant turned it off', () => {
    const recommendations = jest.fn(() => []);
    richReceiptCalls('order_confirmation', rich({ items: [{ ...data.items[0], productId: 'pl_1' }] }), copy, { ...ctx, recommendations }, content);
    expect(recommendations).toHaveBeenCalledWith(['pl_1']);
    recommendations.mockClear();
    richReceiptCalls('order_confirmation', rich(), copy, { ...ctx, recommendations }, { ...content, recommendations: false });
    expect(recommendations).not.toHaveBeenCalled();
  });
});
