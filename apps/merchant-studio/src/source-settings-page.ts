import { MerchantStudioApi, SESSION_STORAGE_KEY } from './api';
import { mountSettingsShell, SETTINGS_GROUPS, type SettingsSection } from './settings-shell';

export type { SettingsSection } from './settings-shell';

/** Ajustes (spec 2026-09-26 templates/settings/MCP, part 2). With `inline=1` the dashboard shows this page inside its
 * Ajustes tabs, so only the section's panel is drawn. Without it, the page is the settings window (a rail of sections
 * beside the Studio's brand, shipping and domain panels) and tells its parent which section showed when it closed. */
export async function mountSettingsPage(app: HTMLElement, section: SettingsSection) {
  const params = new URLSearchParams(location.search);
  const storeId = params.get('store') || '', inline = params.get('inline') === '1';
  const known = SETTINGS_GROUPS.some(group => group.items.some(item => item.id === section));
  const closed = (name: string) => window.parent.postMessage({ type: 'pagosya:settings-closed', section: name }, location.origin);
  if (!known) { if (!inline) closed(section); return; }
  const api = new MerchantStudioApi(sessionStorage.getItem(SESSION_STORAGE_KEY) || '');
  document.body.classList.add(inline ? 'settings-inline-page' : 'settings-overlay-page');
  // The dashboard shows this page in a transparent frame: only the window, or the inline panel, is visible.
  document.documentElement.style.background = document.body.style.background = 'transparent';
  app.replaceChildren();
  let showing = section;
  mountSettingsShell(app, {
    initial: section,
    inline,
    open: async (next, host) => {
      showing = next;
      if (next === 'brand') await (await import('./brand-profile')).openBrandProfile(api, storeId, host);
      else if (next === 'shipping') await (await import('./shipping-settings')).openShippingSettings(api, storeId, undefined, host);
      else await (await import('./domain-shop')).openDomainShop(api, storeId, undefined, host);
    },
    onClose: () => { if (!inline) closed(showing); },
  });
}
