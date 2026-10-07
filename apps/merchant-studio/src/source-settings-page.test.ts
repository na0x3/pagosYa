// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';

/** Each real panel draws its own <dialog> into the host it is given; these stand-ins do the same and record the call. */
const brand = vi.fn(), shipping = vi.fn(), domain = vi.fn();
const panel = (spy: typeof brand, label: string) => (host: HTMLElement | undefined, ...args: unknown[]) => {
  spy(...args);
  const dialog = document.createElement('dialog'); dialog.setAttribute('open', ''); dialog.textContent = label;
  (host ?? document.body).append(dialog);
};
vi.mock('./brand-profile', () => ({ openBrandProfile: async (_api: unknown, storeId: string, host?: HTMLElement) => panel(brand, 'panel-brand')(host, storeId) }));
vi.mock('./shipping-settings', () => ({ openShippingSettings: async (_api: unknown, storeId: string, _onSaved?: unknown, host?: HTMLElement) => panel(shipping, 'panel-shipping')(host, storeId) }));
vi.mock('./domain-shop', () => ({ openDomainShop: async (_api: unknown, storeId: string, _onConnected?: unknown, host?: HTMLElement) => panel(domain, 'panel-domain')(host, storeId) }));

afterEach(() => { vi.restoreAllMocks(); brand.mockClear(); shipping.mockClear(); domain.mockClear(); document.body.replaceChildren(); });

const mount = async (section: 'brand' | 'shipping' | 'domain') => {
  history.replaceState(null, '', `/studio/?embedded=1&library=settings&section=${section}&store=s1`);
  const post = vi.spyOn(window.parent, 'postMessage').mockImplementation(() => {});
  const { mountSettingsPage } = await import('./source-settings-page');
  const app = document.createElement('div'); document.body.append(app);
  await mountSettingsPage(app, section);
  return { post, host: () => document.body.querySelector('[data-settings-host]')! };
};

it('shows the settings window with the requested section open inside it, for the store in the URL', async () => {
  const { host } = await mount('brand');
  await vi.waitFor(() => expect(host().textContent).toContain('panel-brand'));
  expect(brand).toHaveBeenCalledWith('s1');
  expect(document.body.querySelector('[data-settings-section="brand"]')!.getAttribute('aria-current')).toBe('page');
  expect(document.body.querySelector('.settings-shell__rail')).not.toBeNull();
});

it('opens the domain panel first when the dashboard asks for it, and can switch to the others from the rail', async () => {
  const { host } = await mount('domain');
  await vi.waitFor(() => expect(host().textContent).toContain('panel-domain'));
  (document.body.querySelector('[data-settings-section="shipping"]') as HTMLButtonElement).click();
  await vi.waitFor(() => expect(host().textContent).toContain('panel-shipping'));
  expect(host().textContent).not.toContain('panel-domain');
  expect(shipping).toHaveBeenCalledWith('s1');
});

it('tells the dashboard which section was showing when the window closes', async () => {
  const { post, host } = await mount('brand');
  await vi.waitFor(() => expect(host().textContent).toContain('panel-brand'));
  (document.body.querySelector('[data-settings-section="domain"]') as HTMLButtonElement).click();
  await vi.waitFor(() => expect(host().textContent).toContain('panel-domain'));
  (document.body.querySelector('[data-settings-close]') as HTMLButtonElement).click();
  expect(post).toHaveBeenCalledWith({ type: 'pagosya:settings-closed', section: 'domain' }, location.origin);
});

it('closes at once for a section that does not exist', async () => {
  const post = vi.spyOn(window.parent, 'postMessage').mockImplementation(() => {});
  const { mountSettingsPage } = await import('./source-settings-page');
  await mountSettingsPage(document.createElement('div'), 'nope' as never);
  expect(post).toHaveBeenCalledWith({ type: 'pagosya:settings-closed', section: 'nope' }, location.origin);
  expect(document.body.querySelector('.settings-shell')).toBeNull();
});

it('with inline=1 it draws the section into the page for the dashboard\'s Ajustes tab, never a window', async () => {
  history.replaceState(null, '', '/studio/?embedded=1&library=settings&inline=1&section=shipping&store=s1');
  const post = vi.spyOn(window.parent, 'postMessage').mockImplementation(() => {});
  const { mountSettingsPage } = await import('./source-settings-page');
  const app = document.createElement('div'); document.body.append(app);
  await mountSettingsPage(app, 'shipping');
  await vi.waitFor(() => expect(document.body.querySelector('[data-settings-host]')!.textContent).toContain('panel-shipping'));
  expect(shipping).toHaveBeenCalledWith('s1');
  expect(document.body.querySelector('dialog.settings-shell, .settings-shell__rail')).toBeNull();
  expect(document.body.classList.contains('settings-inline-page')).toBe(true);
  expect(post).not.toHaveBeenCalled();
});
