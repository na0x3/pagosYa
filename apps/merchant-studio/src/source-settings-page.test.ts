// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';

const opened = vi.fn();
vi.mock('./brand-profile', () => ({ openBrandProfile: async (_api: unknown, storeId: string) => {
  opened(storeId);
  const dialog = document.createElement('dialog'); document.body.append(dialog);
  setTimeout(() => dialog.remove(), 0);
} }));
vi.mock('./shipping-settings', () => ({ openShippingSettings: vi.fn() }));
vi.mock('./domain-shop', () => ({ openDomainShop: vi.fn() }));

afterEach(() => { vi.restoreAllMocks(); document.body.replaceChildren(); });

it('opens the brand panel for the store in the URL and tells the dashboard when it closes', async () => {
  history.replaceState(null, '', '/studio/?embedded=1&library=settings&section=brand&store=s1');
  const post = vi.spyOn(window.parent, 'postMessage').mockImplementation(() => {});
  const { mountSettingsPage } = await import('./source-settings-page');
  await mountSettingsPage(document.createElement('div'), 'brand');
  expect(opened).toHaveBeenCalledWith('s1');
  await vi.waitFor(() => expect(post).toHaveBeenCalledWith({ type: 'pagosya:settings-closed', section: 'brand' }, location.origin));
});
