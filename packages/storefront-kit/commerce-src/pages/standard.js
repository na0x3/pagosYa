  const infoText = value => (typeof value === 'string' ? value.trim() : '');
  const infoParagraphs = text => text.split(/\n{2,}/).map(paragraph => `<p>${escape(paragraph).replace(/\n/g, '<br>')}</p>`).join('');
  const policyText = key => infoText(storePolicies()[key]);
  const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const infoLocations = () => (Array.isArray(store.locations) ? store.locations.filter(place => place && typeof place.name === 'string') : []);
  const placeNames = places => places.map(place => escape(place.name)).join(', ');
  function placeHours(place) {
    const rows = (Array.isArray(place.openingHours) ? place.openingHours : []).filter(row => row && Number.isInteger(row.day) && row.day >= 0 && row.day <= 6);
    return rows.map(row => `${WEEKDAYS[row.day]}: ${row.closed ? 'cerrado' : `${escape(row.open)} a ${escape(row.close)}`}`).join(' · ');
  }
  function placeList(keep = () => true) {
    const items = infoLocations().filter(keep).map(place => `<li><strong>${escape(place.name)}</strong>${place.address ? `<br>${escape(place.address)}` : ''}${placeHours(place) ? `<br>${placeHours(place)}` : ''}<br>${[place.pickupEnabled && 'Retiro en tienda', place.deliveryEnabled && 'Entrega a domicilio'].filter(Boolean).join(' · ') || 'Sin métodos de entrega disponibles'}</li>`);
    return items.length ? `<ul class="pagosya-info__list">${items.join('')}</ul>` : '';
  }
  const phoneLink = () => { const phone = infoText(store.contactPhone); return /^\+?[0-9][0-9 ()-]{5,24}$/.test(phone) ? `<a href="tel:${escape(phone.replace(/[^0-9+]/g, ''))}">${escape(phone)}</a>` : ''; };
  const emailLink = () => { const email = infoText(store.contactEmail); return /^[^\s@<>"'`]+@[^\s@<>"'`]+\.[^\s@<>"'`]+$/.test(email) ? `<a href="mailto:${escape(email)}">${escape(email)}</a>` : ''; };
  function faqBody() {
    const places = infoLocations(), delivering = places.filter(place => place.deliveryEnabled), pickup = places.filter(place => place.pickupEnabled);
    const entries = [];
    if (store.shippingEnabled || delivering.length) entries.push(['¿Hacen envíos?', delivering.length ? `Sí, entregamos a domicilio desde: ${placeNames(delivering)}.` : 'Sí, hacemos envíos.']);
    if (pickup.length || store.shippingPickupEnabled) entries.push(['¿Puedo retirar mi pedido?', pickup.length ? `Sí, puedes retirarlo en: ${placeNames(pickup)}.` : 'Sí, puedes retirar tu pedido.']);
    if (places.length) entries.push(['¿Dónde están?', `<ul class="pagosya-info__list">${places.map(place => `<li><strong>${escape(place.name)}</strong>${place.address ? ` — ${escape(place.address)}` : ''}</li>`).join('')}</ul>`]);
    if (store.checkoutMode === 'payment') entries.push(['¿Cómo pago?', 'Pagas con QR o tarjeta desde la tienda, con pago seguro procesado por pagosYa.']);
    const contact = [phoneLink(), emailLink()].filter(Boolean);
    if (contact.length) entries.push(['¿Cómo los contacto?', contact.join(' · ')]);
    return entries.length >= 2 ? entries.map(([question, answer]) => `<section class="pagosya-info__qa"><h2>${escape(question)}</h2>${answer.startsWith('<') ? answer : `<p>${answer}</p>`}</section>`).join('') : '';
  }
  // Catalog pages. `collections()` and `collectionHref` are declared further down the file, so these read the store directly.
  const foldText = value => String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const infoCollections = () => (Array.isArray(store.collections) ? store.collections : [])
    .filter(collection => collection && typeof collection.slug === 'string' && typeof collection.name === 'string')
    .map(collection => ({ ...collection, count: (Array.isArray(collection.productIds) ? collection.productIds : []).filter(id => products().some(item => item.id === id)).length }))
    .filter(collection => collection.count > 0);
  function collectionsBody() {
    const list = infoCollections();
    if (!list.length) return '';
    return `<ul class="pagosya-info__cards">${list.map(collection => `<li><a href="${escape(pageHref('coleccion.html', '?c=' + encodeURIComponent(collection.slug)))}"><strong>${escape(collection.name)}</strong><small>${collection.count} ${collection.count === 1 ? 'producto' : 'productos'}</small></a></li>`).join('')}</ul><p><a href="${escape(pageHref('productos.html'))}">Ver todos los productos</a></p>`;
  }
  const searchQuery = () => (new URLSearchParams(window.PAGOSYA_PREVIEW_QUERY || location.search).get('q') || '').trim().slice(0, 80);
  const safeImage = url => (typeof url === 'string' && /^(?:https?:\/\/|\/(?!\/))/.test(url) ? url : '');
  function searchBody() {
    const items = products();
    if (!items.length) return '';
    const q = searchQuery();
    const form = `<form class="pagosya-search" role="search" method="get" action="${escape(pageHref('buscar.html'))}"><label>Buscar productos<input type="search" name="q" value="${escape(q)}" maxlength="80" autocomplete="off"></label><button type="submit">Buscar</button></form>`;
    if (!q) return `${form}<p>Escribe lo que buscas.</p>`;
    const words = foldText(q).split(/\s+/).filter(Boolean);
    const categoryName = item => (Array.isArray(store.categories) ? store.categories : []).find(category => category && category.id === item.categoryId)?.name;
    const haystack = item => foldText([item.name, item.description, ...(Array.isArray(item.tags) ? item.tags : []), categoryName(item)].filter(Boolean).join(' '));
    const hits = items.filter(item => { const text = haystack(item); return words.every(word => text.includes(word)); });
    if (!hits.length) return `${form}<p role="status">No encontramos productos para “${escape(q)}”.</p>`;
    const cards = hits.slice(0, 48).map(item => { const image = safeImage(Array.isArray(item.imageUrls) ? item.imageUrls[0] : ''); return `<li><a href="${escape(productHref(item))}">${image ? `<img src="${escape(image)}" alt="" loading="lazy">` : ''}<strong>${escape(item.name)}</strong><span>${escape(money(item.amount, item.currency))}</span></a></li>`; });
    return `${form}<p role="status">${hits.length > 48 ? `Mostrando 48 de ${hits.length} resultados` : `${hits.length} ${hits.length === 1 ? 'resultado' : 'resultados'}`} para “${escape(q)}”.</p><ul class="pagosya-info__cards">${cards.join('')}</ul>`;
  }
  const COOKIES_BODY = '<p>Esta tienda no usa cookies.</p><p>Para funcionar guarda algunos datos en el almacenamiento de tu navegador. Esos datos no salen de tu dispositivo, salvo lo que envías al hacer un pedido.</p><ul class="pagosya-info__list"><li><strong>Tu carrito:</strong> para que no pierdas lo que elegiste al cambiar de página.</li><li><strong>Tu elección de privacidad:</strong> si aceptaste o rechazaste las estadísticas; se recuerda 180 días.</li><li><strong>Estadísticas de visita</strong> (solo si las aceptas): identificadores anónimos de visitante y de visita para contar cuántas personas ven la tienda.</li><li><strong>Código de referido:</strong> si llegaste con un enlace de un socio, se recuerda durante la visita.</li><li><strong>Avisos de la tienda:</strong> si cerraste un aviso o tienes un enlace para recuperar un pedido, se recuerda durante la visita.</li></ul>';
  const infoBody = kind => ({
    about: () => [infoText(store.tagline) && `<p class="pagosya-info__lead">${escape(infoText(store.tagline))}</p>`, infoText(store.aboutText) && infoParagraphs(infoText(store.aboutText))].filter(Boolean).join(''),
    contact: () => [phoneLink() && `<p>Teléfono: ${phoneLink()}</p>`, emailLink() && `<p>Correo: ${emailLink()}</p>`, placeList()].filter(Boolean).join(''),
    shipping: () => [policyText('delivery') && infoParagraphs(policyText('delivery')), placeList(place => place.pickupEnabled || place.deliveryEnabled)].filter(Boolean).join(''),
    refund: () => (policyText('returns') ? infoParagraphs(policyText('returns')) : ''),
    privacy: () => (policyText('privacy') ? infoParagraphs(policyText('privacy')) : ''),
    terms: () => (policyText('terms') ? infoParagraphs(policyText('terms')) : ''),
    faq: faqBody,
    collections: collectionsBody,
    search: searchBody,
    cookies: () => COOKIES_BODY,
  })[kind]?.() || '';
  function setNoindex(on) {
    let meta = document.head.querySelector('meta[data-pagosya-noindex]');
    if (on && !meta) { meta = document.createElement('meta'); meta.name = 'robots'; meta.content = 'noindex'; meta.setAttribute('data-pagosya-noindex', ''); document.head.append(meta); }
    else if (!on && meta) meta.remove();
  }
  // Outside preview, demo and hosted the store is only trusted once the live copy arrived (`ready`), so a page never
  // flashes "no disponible" while it loads; `force` fills from whatever the store holds when that fetch failed.
  function renderInfoPages(force = false) {
    renderAccountGates();
    const live = force || ready;
    if (live) document.querySelectorAll('[data-pagosya-pages]').forEach(slot => {
      const account = SHOWCASE ? '' : accountEntry();
      slot.innerHTML = INFO_LINKS.filter(([kind]) => !(SHOWCASE && SHOP_ONLY_INFO.has(kind)) && infoBody(kind)).map(([, href, label]) => `<a href="${href}">${escape(label)}</a>`).join('') + (account ? `<a href="${escape(account)}" data-pagosya-account>Mi cuenta</a>` : '');
      slot.hidden = !slot.innerHTML;
    });
    let unavailable = false;
    document.querySelectorAll('[data-pagosya-page]').forEach(mount => {
      const kind = mount.getAttribute('data-pagosya-page');
      // The fixed pages need no store data, so they never wait for it.
      if (kind === 'notfound') { mount.innerHTML = '<p>La página que buscas no existe.</p><p><a href="index.html">Volver al inicio</a></p>'; return; }
      if (kind === 'cookies') { mount.innerHTML = `<div class="pagosya-info">${COOKIES_BODY}</div>`; return; }
      if (!live) return;
      const html = infoBody(kind);
      mount.innerHTML = html ? `<div class="pagosya-info">${html}</div>` : '<p>Esta información aún no está disponible.</p><p><a href="index.html">Volver al inicio</a></p>';
      if (!html) unavailable = true;
    });
    // A failed live fetch (`force`) says nothing about the page, so it never asks search engines to drop it.
    if (live && document.querySelector('[data-pagosya-page]')) setNoindex(unavailable && !force);
  }
  let policyDialog;
  function openPolicy(key, trigger) {
    const text = storePolicies()[key];
    if (!POLICY_TITLES[key] || typeof text !== 'string') return;
    if (!policyDialog) {
      policyDialog = document.createElement('dialog');
      policyDialog.className = 'pagosya-policy-dialog';
      policyDialog.setAttribute('aria-labelledby', 'pagosya-policy-title');
      policyDialog.addEventListener('click', event => { if (event.target === policyDialog || event.target.closest('[data-policy-close]')) policyDialog.close(); });
      document.body.append(policyDialog);
    }
    policyDialog.innerHTML = `<header><h2 id="pagosya-policy-title">${escape(POLICY_TITLES[key])}</h2><button type="button" data-policy-close aria-label="Cerrar">×</button></header><div>${text.split(/\n{2,}/).map(paragraph => `<p>${escape(paragraph).replace(/\n/g, '<br>')}</p>`).join('')}</div><p class="pagosya-policy-dialog__store">${escape(store.storeName || '')}</p>`;
    policyDialog.addEventListener('close', () => trigger?.focus?.(), { once: true });
    if (typeof policyDialog.showModal === 'function') policyDialog.showModal(); else policyDialog.setAttribute('open', '');
    policyDialog.querySelector('[data-policy-close]')?.focus();
  }
  document.addEventListener('click', event => {
    const button = event.target.closest?.('[data-pagosya-policy]');
    if (button) { event.preventDefault(); openPolicy(button.dataset.pagosyaPolicy, button); }
  });
