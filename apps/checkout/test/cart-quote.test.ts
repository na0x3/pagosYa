import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountCartQuote } from '../src/cart-quote';
import { insideBolivia, readDestination } from '../src/shipping-destination';

const quote = { amount: 12500, subtotal: 10000, discountAmount: 0, shippingAmount: 2500, currency: 'BOB', shippingOptions: [{ id: 'z1', name: 'Servientrega · Santa Cruz', amount: 2500, currency: 'BOB', carrierId: 'car_servientrega' }] };
const bodies: Record<string, any>[] = [];
const items = [{ paymentLinkId: 'link_1', quantity: 1 }];

function mount(extra: Partial<Parameters<typeof mountCartQuote>[1]> = {}) {
  const root = document.createElement('section'); document.body.append(root);
  const finish = mountCartQuote(root, { slug: 'kit', items, shipping: true, pickup: true, money: (a, c) => `${c} ${a / 100}`, onQuote: () => {}, ...extra });
  return { root, finish };
}
const field = (root: HTMLElement, name: string) => root.querySelector<HTMLInputElement | HTMLSelectElement>(`[name=${name}]`)!;
function fill(root: HTMLElement, name: string, value: string) { const el = field(root, name); el.value = value; el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); }
async function choose(root: HTMLElement, selector: string, value: string) { const el = root.querySelector<HTMLSelectElement>(selector)!; el.value = value; el.dispatchEvent(new Event('change')); await vi.waitFor(() => expect(root.querySelector('[data-quote-status]')!.textContent).not.toBe('Calculando total…')); }

beforeEach(() => {
  bodies.length = 0;
  document.body.innerHTML = '';
  // No Leaflet in jsdom: the map must degrade to address + "Usar mi ubicación".
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => { bodies.push(JSON.parse(String(init.body))); return new Response(JSON.stringify(quote), { status: 200, headers: { 'content-type': 'application/json' } }); }));
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('shipping destination helpers', () => {
  it('only accepts pins inside Bolivia', () => {
    expect(insideBolivia(-17.78, -63.18)).toBe(true);
    expect(insideBolivia(-34.6, -58.38)).toBe(false);
    expect(insideBolivia(Number.NaN, -63)).toBe(false);
  });
});

describe('cart quote for carrier stores', () => {
  it('collects a structured Bolivian address and pin and sends it with the quote', async () => {
    const { root, finish } = mount({ carriers: true });
    await choose(root, '[data-method]', 'delivery');
    expect(root.querySelector('[data-address]')).toBeNull();
    for (const label of ['Departamento', 'Ciudad', 'Calle y número', 'Referencias', 'Nombre de quien recibe', 'Teléfono de quien recibe']) expect(root.textContent).toContain(label);
    expect(field(root, 'destPhone').getAttribute('inputmode')).toBe('tel');
    fill(root, 'destDepartment', 'SANTA_CRUZ'); fill(root, 'destCity', 'Santa Cruz'); fill(root, 'destStreet', 'Av. Busch 55');
    fill(root, 'destName', 'Ana Quispe'); fill(root, 'destPhone', '71234567');
    expect(readDestination(root)).toBeUndefined();
    expect(() => finish?.()).toThrow('marca tu puerta');
    expect((window as any).__pagosyaSetPin(-34.6, -58.38)).toBe(false);
    expect(root.querySelector('[data-pin-status]')!.textContent).toBe('La ubicación debe estar dentro de Bolivia.');
    expect((window as any).__pagosyaSetPin(-17.78, -63.18)).toBe(true);
    await vi.waitFor(() => expect(bodies.at(-1)?.shippingDestination).toEqual({ department: 'SANTA_CRUZ', city: 'Santa Cruz', street: 'Av. Busch 55', lat: -17.78, lng: -63.18, recipientName: 'Ana Quispe', recipientPhone: '71234567' }));
    await vi.waitFor(() => expect(root.querySelectorAll('[data-rate] option')).toHaveLength(2));
    await choose(root, '[data-rate]', 'z1');
    expect(bodies.at(-1)).toMatchObject({ fulfillmentMethod: 'delivery', shippingZoneId: 'z1', shippingAddress: 'Av. Busch 55, Santa Cruz', shippingDestination: { lat: -17.78 } });
    expect(finish?.()).toMatchObject({ shippingAddress: 'Av. Busch 55, Santa Cruz', shippingDestination: { department: 'SANTA_CRUZ', recipientPhone: '71234567' } });
  });

  it('keeps the single address field and sends no destination when carriers are off', async () => {
    const { root, finish } = mount();
    await choose(root, '[data-method]', 'delivery');
    expect(root.querySelector('[name=destDepartment]')).toBeNull();
    const address = root.querySelector<HTMLInputElement>('[data-address]')!; address.value = 'Av. Busch 55';
    await vi.waitFor(() => expect(root.querySelectorAll('[data-rate] option')).toHaveLength(2));
    await choose(root, '[data-rate]', 'z1');
    expect(bodies.at(-1)).not.toHaveProperty('shippingDestination');
    expect(finish?.()).toEqual({ creditCode: undefined, fulfillmentMethod: 'delivery', shippingCountry: undefined, shippingPostalCode: undefined, shippingZoneId: 'z1', shippingAddress: 'Av. Busch 55' });
  });
});
