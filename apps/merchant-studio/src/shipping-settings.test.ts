// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from 'vitest';
import { openShippingSettings } from './shipping-settings';
import { MerchantStudioApi } from './api';

afterEach(() => document.body.replaceChildren());

describe('shipping settings carriers', () => {
  it('sends carrier and departments when adding a carrier rate', async () => {
    HTMLDialogElement.prototype.showModal = vi.fn(); HTMLDialogElement.prototype.close = vi.fn();
    const state = { enabled: true, pickupEnabled: true, carriersEnabled: true, prepMinutes: 60, rates: [], products: [], carriers: [{ id: 'car_servientrega', code: 'servientrega', name: 'Servientrega Bolivia', mode: 'MANUAL' }] };
    const api: any = { shippingSettings: vi.fn(async () => state), createShippingRate: vi.fn(async () => ({})), saveShippingSettings: vi.fn(async () => state) };
    await openShippingSettings(api, 'st_1');
    const form = document.querySelector<HTMLFormElement>('#shipping-rate')!;
    (form.querySelector('[name=name]') as HTMLInputElement).value = 'Servientrega · SCZ';
    (form.querySelector('[name=fee]') as HTMLInputElement).value = '25';
    (form.querySelector('[name=carrierId]') as HTMLSelectElement).value = 'car_servientrega';
    (form.querySelector('input[name=departments][value=SANTA_CRUZ]') as HTMLInputElement).checked = true;
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await vi.waitFor(() => expect(api.createShippingRate).toHaveBeenCalled());
    expect(api.createShippingRate.mock.calls[0][1]).toMatchObject({ carrierId: 'car_servientrega', departments: ['SANTA_CRUZ'], fee: 2500 });
  });
  it('saves the carrier toggle and prep minutes', async () => {
    const state = { enabled: true, pickupEnabled: true, carriersEnabled: false, prepMinutes: 60, rates: [], products: [], carriers: [] };
    const api: any = { shippingSettings: vi.fn(async () => state), saveShippingSettings: vi.fn(async () => state) };
    await openShippingSettings(api, 'st_1');
    const form = document.querySelector<HTMLFormElement>('#shipping-settings')!;
    (form.querySelector('[name=carriersEnabled]') as HTMLInputElement).checked = true;
    (form.querySelector('[name=prepMinutes]') as HTMLInputElement).value = '30';
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await vi.waitFor(() => expect(api.saveShippingSettings).toHaveBeenCalledWith('st_1', expect.objectContaining({ carriersEnabled: true, prepMinutes: 30 })));
  });
  it('does not show a carrier suffix on rates when couriers are disabled', async () => {
    const state = { enabled: true, pickupEnabled: true, carriersEnabled: false, prepMinutes: 60, rates: [{ id: 'rate_1', name: 'La Paz · Estándar', currency: 'BOB', fee: 1500, freeAbove: null, countryCodes: [], postalPrefixes: [], isActive: true }], products: [], carriers: [] };
    const api: any = { shippingSettings: vi.fn(async () => state), saveShippingSettings: vi.fn(async () => state) };
    await openShippingSettings(api, 'st_1');
    const article = document.querySelector('article')!;
    expect(article.textContent).not.toContain('Reparto propio');
  });
  it('limits a carrier rate to size classes and saves product dimensions and handling flags', async () => {
    HTMLDialogElement.prototype.showModal = vi.fn(); HTMLDialogElement.prototype.close = vi.fn();
    const state = { enabled: true, pickupEnabled: true, carriersEnabled: true, prepMinutes: 60, rates: [], products: [{ id: 'pl_1', name: 'Taza', shippingWeightGrams: 500, lengthCm: null, widthCm: 15, heightCm: 10, fragile: false, noStack: true }], carriers: [{ id: 'car_servientrega', code: 'servientrega', name: 'Servientrega Bolivia', mode: 'MANUAL' }] };
    const api: any = { shippingSettings: vi.fn(async () => state), createShippingRate: vi.fn(async () => ({})), saveShippingWeight: vi.fn(async () => ({})), saveShippingSettings: vi.fn(async () => state) };
    await openShippingSettings(api, 'st_1');
    const rateForm = document.querySelector<HTMLFormElement>('#shipping-rate')!;
    (rateForm.querySelector('[name=name]') as HTMLInputElement).value = 'Moto SCZ';
    (rateForm.querySelector('[name=fee]') as HTMLInputElement).value = '15';
    (rateForm.querySelector('input[name=sizeClasses][value=MOTO]') as HTMLInputElement).checked = true;
    rateForm.dispatchEvent(new Event('submit', { cancelable: true }));
    await vi.waitFor(() => expect(api.createShippingRate).toHaveBeenCalled());
    expect(api.createShippingRate.mock.calls[0][1]).toMatchObject({ sizeClasses: ['MOTO'], fee: 1500 });
    await vi.waitFor(() => expect(document.querySelector('[role=status]')?.textContent).toBe('Tarifa guardada.'));

    const product = document.querySelector<HTMLFormElement>('[data-product-weight="pl_1"]')!;
    expect((product.querySelector('[name=widthCm]') as HTMLInputElement).value).toBe('15');
    expect((product.querySelector('[name=noStack]') as HTMLInputElement).checked).toBe(true);
    (product.querySelector('[name=lengthCm]') as HTMLInputElement).value = '20';
    (product.querySelector('[name=fragile]') as HTMLInputElement).checked = true;
    product.dispatchEvent(new Event('submit', { cancelable: true }));
    await vi.waitFor(() => expect(api.saveShippingWeight).toHaveBeenCalled());
    expect(api.saveShippingWeight).toHaveBeenCalledWith('st_1', 'pl_1', { weightGrams: 500, lengthCm: 20, widthCm: 15, heightCm: 10, fragile: true, noStack: true });
  });
  it('keeps the weight-only product form and no size-class picker when couriers are disabled', async () => {
    const state = { enabled: true, pickupEnabled: true, carriersEnabled: false, prepMinutes: 60, rates: [], products: [{ id: 'pl_1', name: 'Taza', shippingWeightGrams: null, lengthCm: 20, widthCm: 15, heightCm: 10, fragile: true, noStack: false }], carriers: [] };
    const api: any = { shippingSettings: vi.fn(async () => state), saveShippingWeight: vi.fn(async () => ({})), saveShippingSettings: vi.fn(async () => state) };
    await openShippingSettings(api, 'st_1');
    expect(document.querySelector('input[name=sizeClasses]')).toBeNull();
    const product = document.querySelector<HTMLFormElement>('[data-product-weight="pl_1"]')!;
    expect(product.querySelectorAll('input').length).toBe(1);
    expect(product.querySelector('[name=lengthCm], [name=fragile], [name=noStack]')).toBeNull();
    expect(document.body.textContent).toContain('Peso de los productos');
    expect(document.body.textContent).not.toContain('medidas');
    (product.querySelector('[name=weightGrams]') as HTMLInputElement).value = '750';
    product.dispatchEvent(new Event('submit', { cancelable: true }));
    await vi.waitFor(() => expect(api.saveShippingWeight).toHaveBeenCalledWith('st_1', 'pl_1', { weightGrams: 750 }));
    await vi.waitFor(() => expect(document.querySelector('[role=status]')?.textContent).toBe('Peso guardado.'));
  });
});

describe('saveShippingWeight', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('still accepts a bare weight and sends the full profile when given one', async () => {
    const fetch = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    const api = new MerchantStudioApi('tok');
    await api.saveShippingWeight('st_1', 'pl_1', 500);
    await api.saveShippingWeight('st_1', 'pl_1', { weightGrams: 500, lengthCm: 20, fragile: true });
    expect(JSON.parse(String((fetch.mock.calls[0] as any)[1].body))).toEqual({ weightGrams: 500 });
    expect(JSON.parse(String((fetch.mock.calls[1] as any)[1].body))).toEqual({ weightGrams: 500, lengthCm: 20, fragile: true });
  });
});
