/**
 * Production configuration written into index.html by server.mjs (security audit 2026-10-21): the API and checkout
 * origins come from the environment, and in production the login's «Opciones de desarrollo» (an editable API URL that
 * a phishing message could talk a merchant into changing) are hidden and ignored. Unset values leave the page as is.
 */
const attr = (value) => String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** @param {string} html @param {{ apiBase?: string, checkoutOrigin?: string, production?: boolean }} config */
export function injectServerConfig(html, { apiBase, checkoutOrigin, production } = {}) {
  let out = html;
  if (apiBase) out = out.replace(/<input id="apiBase" value="[^"]*">/, `<input id="apiBase" value="${attr(apiBase)}">`);
  if (checkoutOrigin) out = out.replace(/(<input id="checkoutOrigin" [^>]*value=")[^"]*(">)/, `$1${attr(checkoutOrigin)}$2`);
  if (production) {
    out = out.replace('<details class="login-dev">', '<details class="login-dev" hidden>');
    out = out.replace(/<html(\s[^>]*)?>/, (tag, attrs = "") => (/\sdata-production[\s>]/.test(tag) ? tag : `<html${attrs} data-production>`));
  }
  return out;
}
