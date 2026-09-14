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
});
