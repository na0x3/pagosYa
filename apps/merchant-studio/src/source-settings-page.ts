import { MerchantStudioApi, SESSION_STORAGE_KEY } from './api';

export type SettingsSection = 'brand' | 'shipping' | 'domain';

/** Ajustes (spec 2026-09-26 templates/settings/MCP, part 2): the dashboard opens the Studio's own brand, shipping and
 * domain panels in a transparent overlay frame; this page shows the panel and tells the dashboard when it closes. */
export async function mountSettingsPage(app: HTMLElement, section: SettingsSection) {
  const storeId = new URLSearchParams(location.search).get('store') || '';
  const api = new MerchantStudioApi(sessionStorage.getItem(SESSION_STORAGE_KEY) || '');
  document.body.classList.add('settings-overlay-page');
  // The dashboard shows this page in a transparent frame over itself: only the panel's own dialog is visible.
  document.documentElement.style.background = document.body.style.background = 'transparent';
  app.replaceChildren();
  const closed = () => window.parent.postMessage({ type: 'pagosya:settings-closed', section }, location.origin);
  // Every panel is a <dialog> appended to the body and removed when it closes.
  const watch = new MutationObserver(() => { if (!document.body.querySelector('dialog')) { watch.disconnect(); closed(); } });
  if (section === 'brand') await (await import('./brand-profile')).openBrandProfile(api, storeId);
  else if (section === 'shipping') await (await import('./shipping-settings')).openShippingSettings(api, storeId);
  else if (section === 'domain') await (await import('./domain-shop')).openDomainShop(api, storeId);
  else { closed(); return; }
  if (!document.body.querySelector('dialog')) closed();
  else watch.observe(document.body, { childList: true });
}
