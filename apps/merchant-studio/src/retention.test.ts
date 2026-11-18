// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { openRetention } from './retention';
import type { MerchantStudioApi } from './api';

const state = () => ({ settings: { revision: 1, comebackEnabled: true, visitsRequired: 5, rewardLabel: 'Un café gratis', timezone: 'America/La_Paz', signupEnabled: true, signupTitle: 'Club', signupBody: 'Únete', signupButton: 'Entrar', welcomeEnabled: false, welcomeSubject: 'Hola', welcomeBody: 'Bienvenido', recoveryEnabled: false, recoveryHours: 24, reviewRequestsEnabled: false }, cards: 12, subscriberCount: 7, carts: 3, subscribers: [{ name: 'Ana', email: 'ana@example.com', createdAt: '2026-09-14T12:00:00Z' }], campaigns: [{ id: 'c1', subject: 'Novedades', body: 'Vuelve pronto', _count: { deliveries: 0 } }], deliveries: [], emailConfigured: true });
let host: HTMLDivElement;
let api: MerchantStudioApi;
const input = (name: string, value: string) => { const field = host.querySelector<HTMLInputElement>(`[name=${name}]`)!; field.value = value; field.dispatchEvent(new Event('input', { bubbles: true })); };
beforeEach(() => {
  document.body.innerHTML = '<div id="host"></div>';
  host = document.querySelector('#host')!;
  api = { retention: vi.fn().mockResolvedValue(state()), sourceState: vi.fn().mockResolvedValue({ revision: 3, publication: { revision: 2 } }), sourceVersion: vi.fn().mockResolvedValue({ snapshot: { files: [{ path: 'config.js', content: 'window.PAGOSYA_CONFIG = {"data":{"storeName":"Café Aroma","accentColor":"#a47145"}};' }] } }), writeRetention: vi.fn().mockResolvedValue({}) } as unknown as MerchantStudioApi;
});
describe('Comeback workspaces', () => {
  it.each([
    ['program', 'Comeback Card', '[data-settings]', '[data-campaign], [data-redeem]'],
    ['campaigns', 'Campañas', '[data-campaign]', '[data-settings], [data-redeem]'],
    ['customers', 'Clientes y canjes', '[data-redeem]', '[data-settings], [data-campaign]'],
  ])('renders distinct %s content without repeated navigation', async (view, title, present, absent) => {
    await openRetention(api, 's1', undefined, { host, view });
    expect(host.querySelector('h2')!.textContent).toBe(title);
    expect(host.querySelector(present)).not.toBeNull();
    expect(host.querySelector(absent)).toBeNull();
    expect(host.querySelector('.retention-nav')).toBeNull();
    if (view !== 'program') expect(api.sourceState).not.toHaveBeenCalled();
  });
  it('previews the published brand and updates drafts without saving', async () => {
    await openRetention(api, 's1', undefined, { host, view: 'program' });
    await vi.waitFor(() => expect(host.querySelector('.comeback-brand')?.textContent).toContain('Café Aroma'));
    expect(api.sourceVersion).toHaveBeenCalledWith('s1', 2);
    input('visitsRequired', '8'); input('rewardLabel', 'Una bebida especial');
    expect(host.querySelectorAll('.comeback-stamps li')).toHaveLength(8);
    expect(host.querySelector('.comeback-reward')!.textContent).toBe('Una bebida especial');
    expect(api.writeRetention).not.toHaveBeenCalled();
  });
  it('retains the preview and input draft after a failed save', async () => {
    await openRetention(api, 's1', undefined, { host, view: 'program' });
    await vi.waitFor(() => expect(host.querySelector('.comeback-card')).not.toBeNull());
    input('rewardLabel', 'Premio editado');
    vi.mocked(api.writeRetention).mockRejectedValueOnce(Error('Sin conexión'));
    host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(host.querySelector('[role=alert]')?.textContent).toBe('Sin conexión'));
    expect(host.querySelector<HTMLInputElement>('[name=rewardLabel]')!.value).toBe('Premio editado');
    expect(host.querySelector('.comeback-reward')!.textContent).toBe('Premio editado');
  });
  it('keeps settings usable and retries a failed preview independently', async () => {
    vi.mocked(api.sourceState).mockRejectedValueOnce(Error('Offline'));
    await openRetention(api, 's1', undefined, { host, view: 'program' });
    await vi.waitFor(() => expect(host.querySelector('[data-retry-preview]')).not.toBeNull());
    input('rewardLabel', 'Mi premio');
    host.querySelector<HTMLButtonElement>('[data-retry-preview]')!.click();
    await vi.waitFor(() => expect(host.querySelector('.comeback-reward')?.textContent).toBe('Mi premio'));
    expect(host.querySelector<HTMLButtonElement>('[type=submit]')!.disabled).toBe(false);
  });
  it('sends the popup look only when the merchant changed it (review 2026-11-09: a stale form undid a chat change)', async () => {
    const withLook = state(); (withLook.settings as Record<string, unknown>).popupLook = 'cartel';
    vi.mocked(api.retention).mockResolvedValue(withLook as never);
    await openRetention(api, 's1', undefined, { host, view: 'program' });
    const look = host.querySelector<HTMLSelectElement>('[name=popupLook]')!;
    expect(look.value).toBe('cartel');
    host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(api.writeRetention).toHaveBeenCalledTimes(1));
    expect(vi.mocked(api.writeRetention).mock.calls[0][3]).not.toHaveProperty('popupLook');
  });
  it('sends a popup look the merchant picked', async () => {
    const withLook = state(); (withLook.settings as Record<string, unknown>).popupLook = 'cartel';
    vi.mocked(api.retention).mockResolvedValue(withLook as never);
    await openRetention(api, 's1', undefined, { host, view: 'program' });
    host.querySelector<HTMLSelectElement>('[name=popupLook]')!.value = 'revista';
    host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(api.writeRetention).toHaveBeenCalled());
    expect(vi.mocked(api.writeRetention).mock.calls[0][3]).toMatchObject({ popupLook: 'revista' });
  });
  it('turns a game on and moves its top prize (spec 2026-11-09)', async () => {
    (api as any).popupGame = vi.fn().mockResolvedValue({ popupGame: 'wheel', popupGamePrizes: [], popupQuestion: null });
    await openRetention(api, 's1', undefined, { host, view: 'program' });
    host.querySelector<HTMLSelectElement>('[name=popupGame]')!.value = 'wheel';
    host.querySelector<HTMLButtonElement>('[data-save-game]')!.click();
    await vi.waitFor(() => expect((api as any).popupGame).toHaveBeenCalledWith('s1', { game: 'wheel' }));
    // The save reloads the settings and redraws the panel: wait for it before the second change.
    await vi.waitFor(() => expect(api.retention).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(host.querySelector<HTMLButtonElement>('[data-save-game]')!.disabled).toBe(false));
    host.querySelector<HTMLSelectElement>('[name=popupGame]')!.value = 'wheel';
    host.querySelector<HTMLInputElement>('[name=topPrize]')!.value = '25';
    host.querySelector<HTMLButtonElement>('[data-save-game]')!.click();
    await vi.waitFor(() => expect((api as any).popupGame).toHaveBeenLastCalledWith('s1', { game: 'wheel', topPrize: 25 }));
  });
  it('lets the merchant choose when the signup popup appears and its welcome code', async () => {
    (api as any).promoCodes = vi.fn().mockResolvedValue([{ id: 'own', code: 'PEPPA10', isActive: true }, { id: 'off', code: 'OLD', isActive: false }]);
    await openRetention(api, 's1', undefined, { host, view: 'program' });
    const trigger = host.querySelector<HTMLSelectElement>('[name=popupTrigger]')!;
    expect([...trigger.options].map(o => o.value)).toEqual(['load', 'delay', 'exit', 'both']);
    expect(host.querySelector<HTMLInputElement>('[name=popupDelaySeconds]')!.max).toBe('60');
    const code = host.querySelector<HTMLSelectElement>('[name=popupPromoCodeId]')!;
    expect([...code.options].map(o => o.textContent)).toEqual(['Sin código', 'PEPPA10']);
    trigger.value = 'delay'; input('popupDelaySeconds', '12'); code.value = 'own';
    host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(api.writeRetention).toHaveBeenCalled());
    expect(vi.mocked(api.writeRetention).mock.calls[0][3]).toMatchObject({ popupTrigger: 'delay', popupDelaySeconds: 12, popupPromoCodeId: 'own' });
  });
  it('leaves the welcome, reminder and review emails to Correos y marketing and saves them unchanged', async () => {
    const loaded = state();
    Object.assign(loaded.settings, { welcomeEnabled: true, welcomeSubject: 'Hola {{store}}', welcomeBody: 'Bienvenida', recoveryEnabled: true, recoveryHours: 48, reviewRequestsEnabled: true });
    vi.mocked(api.retention).mockResolvedValue(loaded);
    await openRetention(api, 's1', undefined, { host, view: 'program' });
    for (const name of ['welcomeEnabled', 'welcomeSubject', 'welcomeBody', 'recoveryEnabled', 'recoveryHours', 'reviewRequestsEnabled']) expect(host.querySelector(`[name=${name}]`)).toBeNull();
    expect(host.textContent).toContain('Correos y marketing');
    input('rewardLabel', 'Un postre');
    host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(api.writeRetention).toHaveBeenCalled());
    expect(vi.mocked(api.writeRetention).mock.calls[0][3]).toMatchObject({ rewardLabel: 'Un postre', welcomeEnabled: true, welcomeSubject: 'Hola {{store}}', welcomeBody: 'Bienvenida', recoveryEnabled: true, recoveryHours: 48, reviewRequestsEnabled: true });
  });
});

describe('rasca y elige subscribers (spec 2026-11-10)', () => {
  it('lists the WhatsApp signups with what they chose, and the most chosen favourites', async () => {
    api.retention = vi.fn().mockResolvedValue({ ...state(), whatsappCount: 2, whatsappSubscribers: [{ phone: '+591 7123 4567', interests: ['Para regalar', 'Desayunos'], favourite: 'Torre de cookies', createdAt: '2026-11-10T12:00:00Z' }],
      favourites: [{ name: 'Torre de cookies', count: 3 }, { name: 'Caja de rolls', count: 1 }] }) as never;
    await openRetention(api, 's1', undefined, { host, view: 'customers' });
    const text = host.textContent!.replace(/\s+/g, ' ');
    expect(text).toContain('Por WhatsApp (2)');
    expect(text).toContain('+591 7123 4567');
    expect(text).toContain('Favorito: Torre de cookies');
    expect(host.querySelectorAll('[data-whatsapp-subscriber] .retention-chip')).toHaveLength(2);
    expect(text).toContain('Favoritos más elegidos');
    expect(text).toContain('Torre de cookies · 3');
  });
  // Deferred minor fixed 2026-11-10: a customer who asks to stop is taken off the list (pagosYa sends no WhatsApp; the merchant does).
  it('takes a number off the WhatsApp list with «Quitar»', async () => {
    api.retention = vi.fn().mockResolvedValue({ ...state(), whatsappCount: 1, whatsappSubscribers: [{ id: 'w1', phone: '+591 7123 4567', interests: [], favourite: null, createdAt: '2026-11-10T12:00:00Z' }], favourites: [] }) as never;
    api.writeRetention = vi.fn().mockResolvedValue({ removed: 1 }) as never;
    await openRetention(api, 's1', undefined, { host, view: 'customers' });
    host.querySelector<HTMLButtonElement>('[data-remove-whatsapp="w1"]')!.click();
    await vi.waitFor(() => expect(api.writeRetention).toHaveBeenCalledWith('s1', 'whatsapp/w1/remove', 'POST', {}));
  });
});
