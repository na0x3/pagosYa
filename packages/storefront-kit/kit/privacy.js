(() => {
  'use strict';
  if (window.PAGOSYA_PRIVACY) return;
  const memory = new Map();
  const key = slug => `pagosya:privacy:${slug}`;
  function choice(slug) {
    if (navigator.globalPrivacyControl === true) return false;
    try { const saved = JSON.parse(localStorage.getItem(key(slug)) || 'null'); if (saved?.version === 1 && saved.expires > Date.now() && typeof saved.analytics === 'boolean') return saved.analytics; return null; } catch {}
    const temporary = memory.get(slug); return temporary?.expires > Date.now() ? temporary.analytics : null;
  }
  function clearTracking(slug) {
    try { localStorage.removeItem(`pagosya:source-visitor:${slug}`); sessionStorage.removeItem(`pagosya:source-visit:${slug}`); sessionStorage.removeItem(`pagosya:partner:${slug}`); sessionStorage.removeItem(`pagosya:funnel:${slug}`); sessionStorage.removeItem(`pagosya:analytics:${slug}`); } catch {}
  }
  function save(slug, analytics) {
    if (navigator.globalPrivacyControl === true) analytics = false;
    memory.set(slug, { analytics, expires: Date.now() + 180 * 86400000 });
    try { localStorage.setItem(key(slug), JSON.stringify({ version: 1, analytics, expires: Date.now() + 180 * 86400000 })); } catch {}
    if (!analytics) clearTracking(slug);
    window.dispatchEvent(new CustomEvent('pagosya:privacy-change', { detail: { slug, analytics } }));
  }
  function mount(slug, options = {}) {
    if (!slug || options.preview) return;
    if (choice(slug) !== true) clearTracking(slug);
    let root = document.querySelector('[data-pagosya-privacy]');
    if (root?.dataset.slug === slug) return;
    root?.remove(); root = document.createElement('aside'); root.dataset.pagosyaPrivacy = ''; root.dataset.slug = slug;
    root.setAttribute('aria-label', 'Privacidad y almacenamiento');
    // Owner 2026-11-12 («amboras … the cookie pop up to the side»): a small card at the bottom left — one sentence, Aceptar first.
    root.innerHTML = '<button type="button" data-privacy-open>Privacidad y cookies</button><section data-privacy-panel hidden aria-label="Preferencias de cookies"><button type="button" data-privacy-close aria-label="Cerrar">×</button><h2>Cookies</h2><p>Usamos cookies para el carrito y el pago. Con tu permiso, también medimos visitas para mejorar esta tienda (nunca para enviarte promociones). <a href="cookies.html">Más información</a></p><div><button type="button" data-privacy-accept>Aceptar</button><button type="button" data-privacy-reject>Solo necesarias</button></div><p role="status" aria-live="polite"></p></section>';
    if (navigator.globalPrivacyControl === true) { root.querySelector('[data-privacy-accept]').disabled = true; root.querySelector('[role=status]').textContent = 'Tu navegador ha solicitado desactivar el seguimiento.'; }
    const panel = root.querySelector('[data-privacy-panel]');
    const open = root.querySelector('[data-privacy-open]');
    // Owner 2026-10-29 («a cookies button for the store by default»): every store asks once on the first visit, pixel or not.
    if (choice(slug) === null) { panel.hidden = false; root.dataset.notice = 'true'; }
    open.onclick = () => { panel.hidden = false; root.querySelector('[data-privacy-reject]').focus(); };
    root.querySelector('[data-privacy-close]').onclick = () => { panel.hidden = true; delete root.dataset.notice; open.focus(); };
    for (const [name, value] of [['reject', false], ['accept', true]]) root.querySelector(`[data-privacy-${name}]`).onclick = () => { save(slug, value); panel.hidden = true; delete root.dataset.notice; open.focus(); options.onChange?.(value); };
    if (!document.querySelector('#pagosya-privacy-style')) {
      const style = document.createElement('style'); style.id = 'pagosya-privacy-style';
      style.textContent = `@layer pagosya-commerce { [data-pagosya-privacy]{position:relative;font:inherit;color:inherit;text-align:center;padding:16px}[data-pagosya-privacy] button{font:inherit;min-height:44px;padding:10px 16px;cursor:pointer;border:1px solid currentColor;background:var(--brand-background,var(--paper,Canvas));color:var(--brand-foreground,var(--ink,CanvasText));border-radius:var(--brand-radius,0)}[data-pagosya-privacy] :focus-visible{outline:3px solid currentColor;outline-offset:3px}[data-privacy-panel]:not([hidden]){position:fixed;z-index:2147483000;left:20px;bottom:20px;box-sizing:border-box;width:min(360px,calc(100% - 24px));max-height:calc(100dvh - 32px);overflow:auto;padding:20px 20px 16px;border:1px solid color-mix(in srgb,currentColor 18%,transparent);border-radius:16px;background:var(--brand-background,var(--paper,Canvas));color:var(--brand-foreground,var(--ink,CanvasText));text-align:left;box-shadow:0 18px 48px -18px #0006}[data-privacy-panel] h2{font:inherit;font-size:17px;font-weight:700;margin:0 36px 6px 0}[data-privacy-panel] p{font:inherit;font-size:14px;line-height:1.45;margin:0 0 14px}[data-privacy-panel] p a{color:inherit;text-decoration:underline;text-underline-offset:2px}[data-privacy-panel] p[role=status]{margin:8px 0 0;font-size:13px}[data-privacy-panel] p[role=status]:empty{display:none}[data-privacy-panel]>div{display:flex;gap:8px}[data-privacy-panel]>div button{flex:1;min-width:0;font-size:14px;padding:10px 12px}[data-privacy-accept]{background:var(--brand-foreground,var(--ink,CanvasText))!important;color:var(--brand-background,var(--paper,Canvas))!important;border-color:transparent!important}[data-privacy-close]{position:absolute;top:8px;right:8px;width:36px;min-height:36px!important;padding:0!important;border:0!important;background:transparent!important;font-size:22px!important;line-height:1}@media (max-width:600px){[data-privacy-panel]:not([hidden]){left:12px;right:12px;bottom:12px;width:auto}}:root[data-dna-button] [data-pagosya-privacy] button{border-radius:var(--kit-radius,0px);border-color:var(--kit-line,currentColor);background:var(--store-background,var(--brand-background,var(--paper,Canvas)));color:var(--store-foreground,var(--brand-foreground,var(--ink,CanvasText)))}:root[data-dna-button] [data-privacy-panel]:not([hidden]){border-radius:var(--kit-radius-panel,0px);border-color:var(--kit-line,currentColor);background:var(--store-background,var(--brand-background,var(--paper,Canvas)));color:var(--store-foreground,var(--brand-foreground,var(--ink,CanvasText)));font-family:var(--store-body-font,var(--brand-body-font,inherit));box-shadow:0 18px 48px -18px #0006}:root[data-dna-button] [data-privacy-panel] h2{font-family:var(--store-heading-font,var(--brand-heading-font,inherit))}:root[data-dna-button] [data-privacy-accept]{background:var(--store-foreground,var(--brand-foreground,var(--ink,CanvasText)))!important;color:var(--store-background,var(--brand-background,var(--paper,Canvas)))!important} }`;
      document.head.append(style);
    }
    document.body.append(root);
  }
  window.PAGOSYA_PRIVACY = { choice, save, analyticsAllowed: slug => choice(slug) === true, mount, clearTracking };
  window.addEventListener('storage', event => { if (event.key?.startsWith('pagosya:privacy:')) { const slug = event.key.slice('pagosya:privacy:'.length); memory.delete(slug); if (choice(slug) !== true) clearTracking(slug); } });
  // PAGOSYA_ANALYTICS_AVAILABLE is set by the measurement gate the API injects into the
  // head, so a store whose merchant configured a pixel asks the question unprompted
  // instead of waiting for the shopper to find the privacy button.
  if (window.PAGOSYA_CONFIG && !window.PAGOSYA_HOSTED && !window.PAGOSYA_PREVIEW && !window.PAGOSYA_CONFIG.demo) mount(window.PAGOSYA_CONFIG.slug, { analyticsAvailable: window.PAGOSYA_ANALYTICS_AVAILABLE === true });
})();
