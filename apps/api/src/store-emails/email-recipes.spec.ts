import { receiptCalls, receiptType, resolveCopy, type ReceiptData } from './email-recipes';
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
