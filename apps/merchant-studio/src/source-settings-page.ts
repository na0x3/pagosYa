import { MerchantStudioApi, SESSION_STORAGE_KEY } from './api';
import { mountSettingsShell, SETTINGS_GROUPS, type SettingsSection } from './settings-shell';

export type { SettingsSection } from './settings-shell';

/** Ajustes (spec 2026-09-26 templates/settings/MCP, part 2): the dashboard opens this page in a transparent overlay
 * frame over itself. It shows the settings window (a rail of sections beside the Studio's brand, shipping and domain
 * panels) and tells the dashboard which section was showing when the window closes. */
export async function mountSettingsPage(app: HTMLElement, section: SettingsSection) {
  const storeId = new URLSearchParams(location.search).get('store') || '';
  const known = SETTINGS_GROUPS.some(group => group.items.some(item => item.id === section));
  const closed = (name: string) => window.parent.postMessage({ type: 'pagosya:settings-closed', section: name }, location.origin);
  if (!known) { closed(section); return; }
  const api = new MerchantStudioApi(sessionStorage.getItem(SESSION_STORAGE_KEY) || '');
  document.body.classList.add('settings-overlay-page');
  // The dashboard shows this page in a transparent frame over itself: only the window is visible.
  document.documentElement.style.background = document.body.style.background = 'transparent';
  app.replaceChildren();
  let showing = section;
  mountSettingsShell(app, {
    initial: section,
    open: async (next, host) => {
      showing = next;
      if (next === 'brand') await (await import('./brand-profile')).openBrandProfile(api, storeId, host);
      else if (next === 'shipping') await (await import('./shipping-settings')).openShippingSettings(api, storeId, undefined, host);
      else await (await import('./domain-shop')).openDomainShop(api, storeId, undefined, host);
    },
    onClose: () => closed(showing),
  });
}
