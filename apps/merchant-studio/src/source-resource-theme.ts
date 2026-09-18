/** Resource frames inherit the dashboard theme without changing either page's preference. */
export function inheritResourceTheme() {
  try {
    const parentRoot = window.parent.document.documentElement;
    const sync = () => { document.documentElement.dataset.resourceTheme = parentRoot.dataset.dashboardTheme || 'light'; };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(parentRoot, {attributes:true, attributeFilter:['data-dashboard-theme']});
    window.addEventListener('pagehide', () => observer.disconnect(), {once:true});
  } catch { /* Standalone resource views default to the light palette. */ }
}
