/** DASHBOARD_FULL_NAV=1 brings back every screen and field the calm dashboard hides (spec 2026-10-21 A2). */
export function injectFullNav(html, enabled) {
  if (!enabled || /<html[^>]*\sdata-full-nav[\s>]/.test(html)) return html;
  return html.replace(/<html(\s[^>]*)?>/, (tag, attrs = "") => `<html${attrs} data-full-nav>`);
}
