// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from 'vitest';
import { openShippingSettings } from './shipping-settings';

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
});
