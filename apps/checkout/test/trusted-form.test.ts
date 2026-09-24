import { afterEach, expect, it } from 'vitest';
import { collectPersonalFields, withoutPersonalFields } from '../src/trusted-form';

if (!HTMLDialogElement.prototype.showModal) HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
if (!HTMLDialogElement.prototype.close) HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
afterEach(() => { document.body.innerHTML = ''; });
const dialog = () => document.querySelector<HTMLDialogElement>('dialog.pagosya-trusted')!;
const fill = (name: string, value: string) => { (dialog().querySelector(`[name="${name}"]`) as HTMLInputElement).value = value; };
const submit = () => dialog().querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));

it('drops every personal field the design frame tries to supply', () => {
  expect(withoutPersonalFields('checkout', { items: [1], shippingAddress: 'x', creditCode: 'y', email: 'z', fulfillmentMethod: 'delivery' })).toEqual({ items: [1], fulfillmentMethod: 'delivery' });
  expect(withoutPersonalFields('lead', { items: [], name: 'a', email: 'b', phone: 'c', message: 'd' })).toEqual({ items: [] });
  expect(withoutPersonalFields('review', { productId: 'p', trackingToken: 't', displayName: 'n', rating: 5, body: 'b' })).toEqual({ productId: 'p' });
  expect(withoutPersonalFields('retention', { path: 'subscribe', payload: { email: 'e', name: 'n', phone: 'p', interests: ['x'], consent: true } })).toEqual({ path: 'subscribe', payload: { interests: ['x'], consent: true } });
});

it('asks nothing for pickup, and asks for the address in pagosYa\'s own dialog for delivery', async () => {
  expect(await collectPersonalFields('checkout', { fulfillmentMethod: 'pickup' }, { storeName: 'Pliegue' })).toEqual({});
  const pending = collectPersonalFields('checkout', { fulfillmentMethod: 'delivery' }, { storeName: 'Pliegue', creditsEnabled: true });
  expect(dialog().textContent).toContain('Formulario seguro de pagosYa');
  expect(dialog().querySelector('[name=creditCode]')).not.toBeNull();
  fill('shippingAddress', 'Av. 6 de Marzo 123');
  submit();
  expect(await pending).toEqual({ shippingAddress: 'Av. 6 de Marzo 123', creditCode: undefined });
  expect(dialog()).toBeNull();
});

it('returns null when the shopper cancels, and shows a server error with the typed values on retry', async () => {
  const cancelled = collectPersonalFields('lead', {}, { storeName: 'Pliegue' });
  (dialog().querySelector('[data-cancel]') as HTMLButtonElement).click();
  expect(await cancelled).toBeNull();
  const retry = collectPersonalFields('review', {}, { storeName: 'Pliegue' }, { error: 'Código no válido.', values: { trackingToken: 'abc', displayName: 'Ana', rating: '4', body: 'Bien' } });
  expect(dialog().querySelector('[role=alert]')!.textContent).toBe('Código no válido.');
  expect((dialog().querySelector('[name=trackingToken]') as HTMLInputElement).value).toBe('abc');
  expect((dialog().querySelector('[name=rating]') as HTMLSelectElement).value).toBe('4');
  submit();
  expect(await retry).toEqual({ trackingToken: 'abc', displayName: 'Ana', rating: 4, body: 'Bien' });
});

it('requires explicit consent for marketing email', async () => {
  const pending = collectPersonalFields('retention', { path: 'subscribe' }, { storeName: 'Pliegue' });
  fill('email', 'ana@example.test');
  submit();
  expect(dialog()).not.toBeNull();
  (dialog().querySelector('[name=consent]') as HTMLInputElement).checked = true;
  submit();
  expect(await pending).toEqual({ email: 'ana@example.test', consent: true });
});

it('drops the courier destination too, but lets the department through for quotes', () => {
  expect(withoutPersonalFields('shipping', { items: [1], shippingDepartment: 'LA_PAZ', shippingDestination: { street: 'x' }, shippingAddress: 'y' })).toEqual({ items: [1], shippingDepartment: 'LA_PAZ' });
  expect(withoutPersonalFields('checkout', { items: [1], shippingDepartment: 'LA_PAZ', shippingDestination: { street: 'x' } })).toEqual({ items: [1], shippingDepartment: 'LA_PAZ' });
});

it('collects the courier address and door pin in pagosYa\'s dialog, starting from the chosen department', async () => {
  const pending = collectPersonalFields('checkout', { fulfillmentMethod: 'delivery', shippingDepartment: 'SANTA_CRUZ' }, { storeName: 'Pliegue', carrierRate: true });
  expect(dialog().querySelector('[data-shipping-map]')).not.toBeNull();
  expect((dialog().querySelector('[name=destDepartment]') as HTMLSelectElement).value).toBe('SANTA_CRUZ');
  expect(dialog().querySelector('[name=shippingAddress]')).toBeNull();
  fill('destCity', 'Santa Cruz'); fill('destStreet', 'Av. Busch 55'); fill('destName', 'Ana Quispe'); fill('destPhone', '+59171234567');
  submit();
  expect(dialog()).not.toBeNull();
  expect(dialog().querySelector('[data-pin-status]')!.textContent).toContain('Marca tu puerta');
  fill('destLat', '-17.78'); fill('destLng', '-63.18');
  submit();
  expect(await pending).toEqual({
    shippingAddress: 'Av. Busch 55, Santa Cruz', creditCode: undefined,
    shippingDestination: { department: 'SANTA_CRUZ', city: 'Santa Cruz', street: 'Av. Busch 55', references: undefined, lat: -17.78, lng: -63.18, recipientName: 'Ana Quispe', recipientPhone: '+59171234567' },
  });
  // A rejected checkout reopens the dialog with what the shopper already typed.
  const again = collectPersonalFields('checkout', { fulfillmentMethod: 'delivery' }, { storeName: 'Pliegue', carrierRate: true }, { error: 'Tarifa no disponible.' });
  expect((dialog().querySelector('[name=destStreet]') as HTMLInputElement).value).toBe('Av. Busch 55');
  (dialog().querySelector('[data-cancel]') as HTMLButtonElement).click();
  expect(await again).toBeNull();
});
