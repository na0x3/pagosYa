import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { readSourcePaymentPreview } from '../src/source-payment-preview';

const hash = new URLSearchParams({ amount: '19500', currency: 'BOB', merchantName: 'PEANU', description: '2 × Maní · 1 × Snack', parent_origin: 'http://localhost:4323' }).toString();
let requests: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.resetModules();
  document.body.innerHTML = '<div id="app"></div>';
  document.body.className = '';
  requests = vi.fn(() => Promise.reject(new Error('Preview must not contact the API')));
  vi.stubGlobal('fetch', requests);
  window.history.replaceState({}, '', `/?source_payment_preview=1#${hash}`);
});
afterEach(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'x' })); vi.unstubAllGlobals(); });

it('uses the pagosYa form, validates customer fields, and simulates completion without API calls', async () => {
  await import('../src/main');
  expect(document.querySelector('#payment-form')).not.toBeNull();
  expect(document.body.textContent).toContain('Sin cobros ni pedidos reales');
  expect(document.querySelector('.amount')?.textContent).toContain('195');
  expect(document.querySelector('#token')).toBeNull();
  document.querySelector<HTMLFormElement>('#payment-form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  expect(document.querySelector('#customerNameError')?.textContent).toContain('Ingresa tu nombre');
  for (const [id, value] of Object.entries({ customerName: 'Cliente de prueba', customerEmail: 'prueba@example.com', customerPhone: '+59170000000' })) {
    const field = document.getElementById(id) as HTMLInputElement; field.value = value; field.dispatchEvent(new Event('input'));
  }
  document.querySelector<HTMLButtonElement>('.tab[data-type="QR"]')?.click();
  document.querySelector<HTMLFormElement>('#payment-form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await vi.waitFor(() => expect(document.body.textContent).toContain('Prueba completada'));
  expect(document.querySelector('.payment-printer-machine-brand')?.textContent).toContain('pagosYa');
  expect(document.querySelector('.payment-printer-feed')?.textContent).toContain('Vista previa · Sin cobros');
  expect(document.querySelector('.payment-printer-feed')?.textContent).toContain('Maní');
  expect(document.querySelector('.payment-success-overlay')?.parentElement).toBe(document.body);
  expect(requests).not.toHaveBeenCalled();
});

it('canceling a preview does not cancel or fetch a real payment session', async () => {
  await import('../src/main');
  document.querySelector<HTMLButtonElement>('#cancel')!.click();
  expect(requests).not.toHaveBeenCalled();
});

it('invalid preview data fails closed even if a real-looking client secret is present', async () => {
  window.history.replaceState({}, '', '/?source_payment_preview=1#amount=-1&currency=BOB&client_secret=must-not-be-used');
  await import('../src/main');
  expect(document.body.textContent).toContain('pedido de prueba no es válido');
  expect(document.querySelector('#payment-form')).toBeNull();
  expect(requests).not.toHaveBeenCalled();
  expect(() => readSourcePaymentPreview('#amount=2&currency=BOB&merchantName=PEANU')).not.toThrow();
});
