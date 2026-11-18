// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mountPopupDesigns } from './popup-designs-panel';

const overview = () => ({ liveId: 'cd2', on: true, percent: 15, capture: 'whatsapp', pick: ['p1', 'p2'], products: [{ id: 'p1', name: 'Habanero' }, { id: 'p2', name: 'Serrano' }, { id: 'p3', name: 'Jalapeño' }],
  designs: [{ id: 'cd2', version: 2, status: 'LIVE', composition: 'Ticket inclinado', previews: [{ stepId: 'o', url: '/v1/uploads/o.jpg' }, { stepId: 'p', url: '/v1/uploads/p.jpg' }, { stepId: 'c', url: '/v1/uploads/c.jpg' }] },
    { id: 'cd1', version: 1, status: 'RETIRED', composition: 'Póster', previews: [{ stepId: 'o', url: '/v1/uploads/x.jpg' }] }, { id: 'cd0', version: 0, status: 'FAILED', composition: '', previews: null }] });
let host: HTMLElement;
let api: any;
beforeEach(() => {
  document.body.innerHTML = '<div id="h"></div>'; host = document.querySelector('#h')!;
  api = { popupDesigns: vi.fn().mockResolvedValue(overview()), popupRedesign: vi.fn().mockResolvedValue({}), popupRestore: vi.fn().mockResolvedValue({}), popupSettings: vi.fn().mockResolvedValue({}) };
});

describe('Popups page', () => {
  it('shows the live design\'s steps in order and the earlier versions, never a failed one', async () => {
    await mountPopupDesigns(host, api, 's1');
    expect(Array.from(host.querySelectorAll('[data-popup-steps] img')).map(img => img.getAttribute('src')!.replace(/^.*\/v1\//, '/v1/'))).toEqual(['/v1/uploads/o.jpg', '/v1/uploads/p.jpg', '/v1/uploads/c.jpg']);
    expect(host.textContent).toContain('Ticket inclinado');
    expect(host.querySelectorAll('[data-popup-version]')).toHaveLength(1);
    expect(host.querySelector('[data-popup-version="cd0"]')).toBeNull();
  });

  it('«Rediseñar» sends the request, «Volver a esta» restores, and the percent is kept within 5–30', async () => {
    await mountPopupDesigns(host, api, 's1');
    host.querySelector<HTMLTextAreaElement>('[name=popupRequest]')!.value = 'más divertido';
    host.querySelector<HTMLButtonElement>('[data-popup-redesign]')!.click();
    await vi.waitFor(() => expect(api.popupRedesign).toHaveBeenCalledWith('s1', 'más divertido'));
    await vi.waitFor(() => expect(host.querySelector('[data-popup-version="cd1"] button:not([disabled])')).not.toBeNull());
    host.querySelector<HTMLButtonElement>('[data-popup-version="cd1"] button')!.click();
    await vi.waitFor(() => expect(api.popupRestore).toHaveBeenCalledWith('s1', 'cd1'));
    await vi.waitFor(() => expect(host.querySelector('[data-popup-save]:not([disabled])')).not.toBeNull());
    const percent = host.querySelector<HTMLInputElement>('[name=popupPercent]')!;
    percent.value = '50'; host.querySelector<HTMLButtonElement>('[data-popup-save]')!.click();
    await vi.waitFor(() => expect(api.popupSettings).toHaveBeenCalledWith('s1', expect.objectContaining({ percent: 30, capture: 'whatsapp', products: ['p1', 'p2'], on: true })));
  });

  it('says nothing when the store has no YAPI popup yet, except how to get one', async () => {
    api.popupDesigns.mockResolvedValue({ ...overview(), liveId: null, on: false, designs: [] });
    await mountPopupDesigns(host, api, 's1');
    expect(host.querySelector('[data-popup-steps]')).toBeNull();
    expect(host.querySelector('[data-popup-redesign]')!.textContent).toMatch(/Diseñar mi popup/);
  });
});
