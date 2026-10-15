  const assuranceIcons = {
    pickup: '<path d="M3 9.5 12 4l9 5.5"/><path d="M5 9v10h14V9"/><path d="M10 19v-5h4v5"/>',
    delivery: '<path d="M3 6h11v10H3z"/><path d="M14 10h4l3 3v3h-7"/><circle cx="7" cy="17.5" r="1.5"/><circle cx="17.5" cy="17.5" r="1.5"/>',
    digital: '<path d="M12 4v11"/><path d="m7 10 5 5 5-5"/><path d="M5 20h14"/>',
    payment: '<path d="M12 3 5 6v5c0 4.5 3 8.5 7 10 4-1.5 7-5.5 7-10V6z"/><path d="m9 12 2 2 4-4"/>',
    chat: '<path d="M4 5h16v11H9l-5 4z"/>',
    /* Curated extras for merchant-authored assurance lines (config.productAssurances); Lucide outlines. */
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    star: '<path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"/>',
    leaf: '<path d="M11 20a10 10 0 0010-10 25.9 25.9 0 00-1.04-7.281 1 1 0 00-1.755-.325C15.833 5.5 13 5.5 9.8 6.1A7 7 0 0011 20"/><path d="M2 21a5 5 0 012.911-4.544C7.613 15.212 8.351 15.24 11 13"/>',
    gift: '<path d="M12 7v14"/><path d="M20 11v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8"/><path d="M7.5 7a1 1 0 0 1 0-5A4.8 8 0 0 1 12 7a4.8 8 0 0 1 4.5-5 1 1 0 0 1 0 5"/><rect x="3" y="7" width="18" height="4" rx="1"/>',
    heart: '<path d="M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5"/>',
    award: '<path d="m15.477 12.89 1.515 8.526a.5.5 0 0 1-.81.47l-3.58-2.687a1 1 0 0 0-1.197 0l-3.586 2.686a.5.5 0 0 1-.81-.469l1.514-8.526"/><circle cx="12" cy="8" r="6"/>',
    flame: '<path d="M12 3q1 4 4 6.5t3 5.5a1 1 0 0 1-14 0 5 5 0 0 1 1-3 1 1 0 0 0 5 0c0-2-1.5-3-1.5-5q0-2 2.5-4"/>',
    sparkles: '<path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z"/><path d="M20 2v4"/><path d="M22 4h-4"/><circle cx="4" cy="20" r="2"/>',
    package: '<path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z"/><path d="M12 22V12"/><polyline points="3.29 7 12 12 20.71 7"/><path d="m7.5 4.27 9 5.15"/>',
    coffee: '<path d="M10 2v2"/><path d="M14 2v2"/><path d="M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1"/><path d="M6 2v2"/>',
    'map-pin': '<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>',
    'thumbs-up': '<path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z"/><path d="M7 10v12"/>',
  };
  // Merchant-authored policies, rendered as escaped text in a runtime-owned dialog.
  const POLICY_TITLES = { returns: 'Cambios y devoluciones', delivery: 'Envíos y entregas', privacy: 'Privacidad', terms: 'Términos y condiciones' };
  const storePolicies = () => (store.policies && typeof store.policies === 'object' ? store.policies : {});
  function policyLinks(keys = Object.keys(POLICY_TITLES)) {
    const present = keys.filter(key => typeof storePolicies()[key] === 'string' && storePolicies()[key].trim());
    return present.length ? `<nav class="pagosya-policies" aria-label="Políticas de la tienda">${present.map(key => `<button type="button" data-pagosya-policy="${key}">${escape(POLICY_TITLES[key])}</button>`).join('')}</nav>` : '';
  }
  // Information pages (spec 2026-09-30-store-content-pages-design): each `data-pagosya-page` mount is filled from the
  // live store with escaped text, and `data-pagosya-pages` links only the pages that have something to show.
  const INFO_LINKS = [
    ['collections', 'colecciones.html', 'Colecciones'], ['search', 'buscar.html', 'Buscar'],
    ['about', 'nosotros.html', 'Nosotros'], ['contact', 'contacto.html', 'Contacto'], ['shipping', 'envios.html', 'Envíos y entregas'],
    ['faq', 'faq.html', 'Preguntas frecuentes'], ['refund', 'reembolsos.html', 'Cambios y devoluciones'], ['privacy', 'privacidad.html', 'Privacidad'],
    ['terms', 'terminos.html', 'Términos y condiciones'], ['cookies', 'cookies.html', 'Cookies y almacenamiento'],
  ];
  // A showcase (spec 2026-10-13) sells nothing online: its footer never links search, collections, shipping, refunds or a
  // shopper account. A store saved before sitePurpose was written into config.js is a shop.
  const SHOWCASE = typeof config.sitePurpose === 'string' && config.sitePurpose !== 'shop';
  const SHOP_ONLY_INFO = new Set(['collections', 'search', 'shipping', 'refund']);
  // The shopper's account is served by the checkout app on its own origin, never inside the store, where authored code runs.
  const accountUrl = () => { try { return config.slug && config.checkoutOrigin ? new URL(`/cuenta/${encodeURIComponent(config.slug)}`, config.checkoutOrigin).href : ''; } catch { return ''; } };
