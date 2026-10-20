  // One calm checkout (spec 2026-10-20): shell pieces shared by the order review, the test payment and its confirmation.
  // The look is checkout-shell/shell.css, the same file the hosted payment page imports; stores only lend their logo,
  // name, photo and a readable accent.
  const shellStyle = document.createElement('style');
  shellStyle.setAttribute('data-pagosya-checkout-shell', '');
  shellStyle.textContent = CHECKOUT_SHELL_CSS;
  document.head.append(shellStyle);
  const LOCK_ICON = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';
  const CHECK_ICON = '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';
  const BACK_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>';
  // A store upload path ("/v1/uploads/…") lives on the API, not on the store's own origin.
  function storeAssetUrl(value) {
    if (typeof value !== 'string' || !value.trim()) return '';
    try { return safeUrl(/^\/v1\//.test(value.trim()) && config.apiBaseUrl ? new URL(value.trim(), config.apiBaseUrl).href : value); } catch { return ''; }
  }
  function shellBrand() {
    const logo = storeAssetUrl(store.logoUrl);
    return `<span class="pya-co__brand">${logo ? `<img class="pya-co__logo" src="${escape(logo)}" alt="">` : ''}<strong class="pya-co__name">${escape(store.storeName || '')}</strong></span>`;
  }
  // Carrito › Entrega › Pago: the step just before the current one goes back to it.
  function shellSteps(current) {
    const steps = ['Carrito', 'Entrega', 'Pago'];
    const at = current === 'done' ? steps.length : current === 'payment' ? 2 : 1;
    return `<ol class="pya-co__steps">${steps.map((label, index) => `<li${index === at ? ' aria-current="step"' : ''}>${index === at - 1 && current !== 'done' ? `<button type="button" data-checkout-back>${label}</button>` : label}</li>`).join('')}</ol>`;
  }
  function logoBadges(names) {
    return names.map(name => PAYMENT_LOGOS.logos[name] ? `<span class="pya-co__logo-badge">${PAYMENT_LOGOS.logos[name]}</span>` : '').join('');
  }
  // The review previews how the shopper will pay; the test payment lets them pick one (nothing is charged).
  function paymentMethodsList(selectable, selected = PAYMENT_LOGOS.methods[0].type) {
    if (!selectable) return `<ul class="pya-co__methods pya-co__methods--preview">${PAYMENT_LOGOS.methods.map(method => `<li class="pya-co__method"><span class="pya-co__method-name">${escape(method.label)}</span><span class="pya-co__logos">${logoBadges(method.logos)}</span></li>`).join('')}</ul>`;
    return `<div class="pya-co__methods" role="radiogroup" aria-label="Método de pago">${PAYMENT_LOGOS.methods.map(method => `<div class="pya-co__method"><label><input type="radio" name="demoPaymentMethod" value="${method.type}"${method.type === selected ? ' checked' : ''}><span class="pya-co__method-name">${escape(method.label)}</span><span class="pya-co__logos">${logoBadges(method.logos)}</span></label>${method.type === selected ? `<div class="pya-co__method-body"><p>${escape(method.note)}</p><p>Es una prueba: no se cobra nada.</p></div>` : ''}</div>`).join('')}</div>`;
  }
  function trustStrip() {
    const names = [...new Set(PAYMENT_LOGOS.methods.flatMap(method => method.logos))];
    return `<div class="pya-co__trust"><span class="pya-co__logos">${logoBadges(names)}</span><span>${LOCK_ICON} Pago seguro procesado por pagosYa</span></div>`;
  }
  const parseRgb = text => { const value = String(text), n = value.match(/[\d.]+/g); return /^rgba?\(/.test(value) && n && n.length >= 3 && (n[3] === undefined || Number(n[3]) === 1) ? n.slice(0, 3).map(Number) : null; };
  function contrastRatio(a, b) {
    const lum = c => { const [r, g, bl] = c.map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4); return .2126 * r + .7152 * g + .0722 * bl; };
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + .05) / (y + .05);
  }
  // The store's accent paints the pay button and the chosen radio only when it reads: its text at 4.5:1 and the button
  // at 3:1 on the white page. Otherwise ink. The browser resolves whatever colour syntax the store used.
  function shellAccent(root) {
    let accent = null, ink = null;
    try {
      const probe = document.createElement('span');
      probe.style.cssText = 'position:absolute;visibility:hidden;color:var(--store-accent,var(--brand-accent,var(--accent,#1a1a1a)))';
      document.body.append(probe);
      accent = parseRgb(getComputedStyle(probe).color);
      probe.style.color = 'var(--store-accent-foreground,var(--brand-accent-foreground,#ffffff))';
      ink = parseRgb(getComputedStyle(probe).color);
      probe.remove();
    } catch { /* No colour to read: ink. */ }
    const readable = accent && ink && contrastRatio(accent, ink) >= 4.5 && contrastRatio(accent, [255, 255, 255]) >= 3;
    root.style.setProperty('--pya-accent', readable ? `rgb(${accent.join(',')})` : '#1a1a1a');
    root.style.setProperty('--pya-accent-ink', readable ? `rgb(${ink.join(',')})` : '#ffffff');
  }
  // Everything around the open checkout leaves the tab order: its own siblings and those of every ancestor.
  function inertAround(node, saved) {
    for (let child = node; child && child !== document.body && child.parentElement; child = child.parentElement) {
      for (const sibling of child.parentElement.children) if (sibling !== child && !saved.has(sibling) && !sibling.matches('script,style,template')) { saved.set(sibling, sibling.inert); sibling.inert = true; }
    }
  }
  document.addEventListener('click', event => {
    const toggle = event.target.closest?.('[data-shell-summary]');
    if (!toggle) return;
    const root = toggle.closest('.pya-checkout');
    const open = !root.hasAttribute('data-summary-open');
    root.toggleAttribute('data-summary-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.querySelector('[data-shell-summary-label]').textContent = open ? 'Ocultar resumen del pedido' : 'Ver resumen del pedido';
  });
