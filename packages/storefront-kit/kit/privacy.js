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
    try { localStorage.removeItem(`pagosya:source-visitor:${slug}`); sessionStorage.removeItem(`pagosya:source-visit:${slug}`); sessionStorage.removeItem(`pagosya:partner:${slug}`); sessionStorage.removeItem(`pagosya:funnel:${slug}`); } catch {}
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
    root.innerHTML = '<button type="button" data-privacy-open>Privacidad y cookies</button><section data-privacy-panel hidden aria-label="Preferencias de privacidad"><h2>Tu privacidad, tu elección</h2><p>Usamos almacenamiento del navegador para el carrito, el pago y tus preferencias. Puedes comprar sin aceptar estadísticas.</p><p>Con tu permiso, podemos medir visitas y comparar diseños de esta tienda. No lo usamos para enviarte promociones; la suscripción por correo se acepta por separado.</p><div><button type="button" data-privacy-reject>Solo necesarias</button><button type="button" data-privacy-accept>Permitir estadísticas</button><button type="button" data-privacy-close>Cerrar</button></div><p role="status" aria-live="polite"></p></section>';
    if (navigator.globalPrivacyControl === true) { root.querySelector('[data-privacy-accept]').disabled = true; root.querySelector('[role=status]').textContent = 'Tu navegador ha solicitado desactivar el seguimiento.'; }
    const panel = root.querySelector('[data-privacy-panel]');
    const open = root.querySelector('[data-privacy-open]');
    if (options.analyticsAvailable && choice(slug) === null) { panel.hidden = false; root.dataset.notice = 'true'; }
    open.onclick = () => { panel.hidden = false; root.querySelector('[data-privacy-reject]').focus(); };
    root.querySelector('[data-privacy-close]').onclick = () => { panel.hidden = true; delete root.dataset.notice; open.focus(); };
    for (const [name, value] of [['reject', false], ['accept', true]]) root.querySelector(`[data-privacy-${name}]`).onclick = () => { save(slug, value); panel.hidden = true; delete root.dataset.notice; open.focus(); options.onChange?.(value); };
    if (!document.querySelector('#pagosya-privacy-style')) {
      const style = document.createElement('style'); style.id = 'pagosya-privacy-style';
      style.textContent = `@layer pagosya-commerce { [data-pagosya-privacy]{position:relative;font:inherit;color:inherit;text-align:center;padding:16px}[data-pagosya-privacy] button{font:inherit;min-height:44px;padding:10px 14px;cursor:pointer;border:1px solid currentColor;background:var(--brand-background,var(--paper,Canvas));color:var(--brand-foreground,var(--ink,CanvasText));border-radius:var(--brand-radius,0)}[data-pagosya-privacy] :focus-visible{outline:3px solid currentColor;outline-offset:3px}[data-privacy-panel]:not([hidden]){position:fixed;z-index:2147483000;bottom:16px;left:16px;right:16px;box-sizing:border-box;width:min(640px,calc(100% - 32px));max-height:calc(100dvh - 32px);overflow:auto;padding:24px;border:1px solid currentColor;background:var(--brand-background,var(--paper,Canvas));color:var(--brand-foreground,var(--ink,CanvasText));text-align:left;margin:auto}[data-privacy-panel] h2{font:inherit;font-size:22px;font-weight:700;margin:0 0 12px}[data-privacy-panel] p{font:inherit;line-height:1.5}[data-privacy-panel]>div{display:flex;flex-wrap:wrap;gap:10px}[data-privacy-panel] button{flex:1;min-width:140px} }`;
      document.head.append(style);
    }
    document.body.append(root);
  }
  window.PAGOSYA_PRIVACY = { choice, save, analyticsAllowed: slug => choice(slug) === true, mount, clearTracking };
  window.addEventListener('storage', event => { if (event.key?.startsWith('pagosya:privacy:')) { const slug = event.key.slice('pagosya:privacy:'.length); memory.delete(slug); if (choice(slug) !== true) clearTracking(slug); } });
  if (window.PAGOSYA_CONFIG && !window.PAGOSYA_HOSTED && !window.PAGOSYA_PREVIEW && !window.PAGOSYA_CONFIG.demo) mount(window.PAGOSYA_CONFIG.slug);
})();
