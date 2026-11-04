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
    // An empty block is left out (spec 2026-10-14 store voice): a place without pickup or delivery says nothing about them.
    const items = infoLocations().filter(keep).map(place => {
      const methods = [place.pickupEnabled && 'Retiro en tienda', place.deliveryEnabled && 'Entrega a domicilio'].filter(Boolean).join(' · ');
      return `<li><strong>${escape(place.name)}</strong>${place.address ? `<br>${escape(place.address)}` : ''}${placeHours(place) ? `<br>${placeHours(place)}` : ''}${methods ? `<br>${methods}` : ''}</li>`;
    });
    return items.length ? `<ul class="pagosya-info__list">${items.join('')}</ul>` : '';
  }
  const phoneLink = () => { const phone = infoText(store.contactPhone); return /^\+?[0-9][0-9 ()-]{5,24}$/.test(phone) ? `<a href="tel:${escape(phone.replace(/[^0-9+]/g, ''))}">${escape(phone)}</a>` : ''; };
  const emailLink = () => { const email = infoText(store.contactEmail); return /^[^\s@<>"'`]+@[^\s@<>"'`]+\.[^\s@<>"'`]+$/.test(email) ? `<a href="mailto:${escape(email)}">${escape(email)}</a>` : ''; };
  // YAPI edits everything (spec 2026-11-03): the store's links (Instagram, TikTok…) close a footer's information links, so every
  // store shows them with no change to its files. http(s) only; at most six.
  const storeLinks = () => (Array.isArray(store.links) ? store.links : []).filter(link => link && infoText(link.label) && /^https?:\/\//i.test(infoText(link.url))).slice(0, 6)
    .map(link => `<a href="${escape(infoText(link.url))}" target="_blank" rel="noopener noreferrer" data-pagosya-store-link>${escape(infoText(link.label))}</a>`).join('');
  // YAPI edits everything (spec 2026-11-03): the merchant's own questions, written in the chat, come first.
  const ownQuestions = () => (Array.isArray(store.faq) ? store.faq : []).filter(entry => entry && infoText(entry.q) && infoText(entry.a)).slice(0, 12);
  function faqBody() {
    const places = infoLocations(), delivering = places.filter(place => place.deliveryEnabled), pickup = places.filter(place => place.pickupEnabled);
    const own = ownQuestions();
    const entries = own.map(entry => [infoText(entry.q), infoParagraphs(infoText(entry.a))]);
    if (store.shippingEnabled || delivering.length) entries.push(['¿Hacen envíos?', delivering.length ? `Sí, entregamos a domicilio desde: ${placeNames(delivering)}.` : 'Sí, hacemos envíos.']);
    // Only questions the store can answer (spec 2026-10-14): pickup needs a place that offers it, not only the switch.
    if (pickup.length) entries.push(['¿Puedo retirar mi pedido?', `Sí, puedes retirarlo en: ${placeNames(pickup)}.`]);
    if (places.length) entries.push(['¿Dónde están?', `<ul class="pagosya-info__list">${places.map(place => `<li><strong>${escape(place.name)}</strong>${place.address ? ` — ${escape(place.address)}` : ''}</li>`).join('')}</ul>`]);
    // How to order and how to pay are always answerable in a store that sells something (2026-10-18: a new store's FAQ had
    // fewer than two answers and showed nothing but the voice sheet's line).
    if (products().length) entries.push(['¿Cómo hago mi pedido?', store.checkoutMode === 'whatsapp' ? 'Eliges tu producto, lo sumas a tu pedido y lo confirmas por WhatsApp.' : store.checkoutMode === 'payment' ? 'Eliges tu producto, lo sumas a tu pedido y pagas desde la tienda.' : 'Eliges tu producto, lo sumas a tu pedido y lo confirmas desde la tienda.']);
    entries.push(['¿Cómo pago?', store.checkoutMode === 'payment' ? 'Pagas con QR o tarjeta desde la tienda, con pago seguro procesado por pagosYa.' : store.checkoutMode === 'whatsapp' ? 'Confirmas tu pedido por WhatsApp y acuerdas el pago con la tienda.' : 'Acuerdas el pago con la tienda al confirmar tu pedido.']);
    const contact = [phoneLink(), emailLink()].filter(Boolean);
    if (contact.length) entries.push(['¿Cómo los contacto?', contact.join(' · ')]);
    // One question of the merchant's own is a page; the facts alone need two.
    return own.length || entries.length >= 2 ? entries.map(([question, answer]) => `<section class="pagosya-info__qa"><h2>${escape(question)}</h2>${answer.startsWith('<') ? answer : `<p>${answer}</p>`}</section>`).join('') : '';
  }
  // Catalog pages. `collections()` and `collectionHref` are declared further down the file, so these read the store directly.
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
  // Owner 2026-10-28 («things appear without pictures when searched»): the editor's preview hands the photos over as data: and
  // blob: URLs, which the results dropped; an inline image is a photo too.
  const safeImage = url => (typeof url === 'string' && /^(?:https?:\/\/|\/(?!\/)|data:image\/|blob:)/.test(url) ? url : '');
  function searchBody() {
    const items = products();
    if (!items.length) return '';
    const q = searchQuery();
    const form = `<form class="pagosya-search" role="search" method="get" action="${escape(pageHref('buscar.html'))}"><label>Buscar productos<input type="search" name="q" value="${escape(q)}" maxlength="80" autocomplete="off"></label><button type="submit">Buscar</button></form>`;
    if (!q) return `${form}<p>Escribe lo que buscas.</p>`;
    // One match rule with the catalogue's search bar (catalog/filters.js, amendment 2026-10-21).
    const words = searchWords(q);
    const found = items.filter(item => matchesSearch(item, words));
    if (!found.length) return `${form}<p role="status">No encontramos productos para “${escape(q)}”.</p>`;
    // Owner 2026-10-28 («put like a sorter by category and etc»): the results narrow to one category and sort by price or name.
    // Both are links that keep the query, so they work in the editor's preview and on the published store alike.
    const params = new URLSearchParams(window.PAGOSYA_PREVIEW_QUERY || location.search);
    const categories = (Array.isArray(store.categories) ? store.categories : []).filter(c => c && found.some(item => item.categoryId === c.id));
    const category = categories.find(c => c.id === params.get('c'))?.id || '';
    const order = ['precio-asc', 'precio-desc', 'nombre'].includes(params.get('orden')) ? params.get('orden') : '';
    const searchLink = (next = {}) => { const query = new URLSearchParams({ q }); const c = 'c' in next ? next.c : category, o = 'orden' in next ? next.orden : order;
      if (c) query.set('c', c); if (o) query.set('orden', o); return escape(pageHref('buscar.html', '?' + query.toString())); };
    const narrowed = category ? found.filter(item => item.categoryId === category) : found;
    const price = item => Number(item.amount) || 0;
    const hits = order === 'precio-asc' ? [...narrowed].sort((a, b) => price(a) - price(b)) : order === 'precio-desc' ? [...narrowed].sort((a, b) => price(b) - price(a))
      : order === 'nombre' ? [...narrowed].sort((a, b) => String(a.name).localeCompare(String(b.name), 'es')) : narrowed;
    const chip = (label, href, on) => `<a class="pagosya-search__chip" href="${href}"${on ? ' aria-current="true"' : ''}>${escape(label)}</a>`;
    const cats = categories.length > 1 || category ? `<nav class="pagosya-search__row" aria-label="Categorías">${chip('Todo', searchLink({ c: '' }), !category)}${categories.map(c => chip(c.name, searchLink({ c: c.id }), c.id === category)).join('')}</nav>` : '';
    const sorts = found.length > 1 ? `<nav class="pagosya-search__row pagosya-search__sort" aria-label="Ordenar"><span>Ordenar</span>${[['', 'Relevancia'], ['precio-asc', 'Precio: menor'], ['precio-desc', 'Precio: mayor'], ['nombre', 'A–Z']].map(([id, label]) => chip(label, searchLink({ orden: id }), id === order)).join('')}</nav>` : '';
    const tools = cats || sorts ? `<div class="pagosya-search__tools">${cats}${sorts}</div>` : '';
    const cards = hits.slice(0, 48).map(item => { const image = safeImage(Array.isArray(item.imageUrls) ? item.imageUrls[0] : ''); return `<li><a href="${escape(productHref(item))}">${image ? `<img src="${escape(image)}" alt="" loading="lazy">` : ''}<strong>${escape(item.name)}</strong><span>${escape(money(item.amount, item.currency))}</span></a></li>`; });
    return `${form}${tools}<p role="status">${hits.length > 48 ? `Mostrando 48 de ${hits.length} resultados` : `${hits.length} ${hits.length === 1 ? 'resultado' : 'resultados'}`} para “${escape(q)}”.</p><ul class="pagosya-info__cards">${cards.join('')}</ul>`;
  }
  // Owner 2026-10-28 («when searching give suggestions»): a store's search field shows up to six matching products — photo,
  // name, price — under it while the shopper types, and a line to every result. ↓ moves into the list, Escape closes it.
  function searchSuggest(field) {
    const form = field.form; if (!form) return;
    let box = form.querySelector('.pagosya-suggest');
    const q = field.value.trim().slice(0, 80);
    const words = searchWords(q);
    const hits = words.length ? products().filter(item => matchesSearch(item, words)).slice(0, 6) : [];
    if (!q) { box?.remove(); field.removeAttribute('aria-expanded'); return; }
    if (!box) {
      box = document.createElement('ul'); box.className = 'pagosya-suggest'; box.id = `pagosya-suggest-${Math.random().toString(36).slice(2, 8)}`;
      box.setAttribute('role', 'listbox'); box.setAttribute('aria-label', 'Sugerencias');
      form.append(box); field.setAttribute('aria-controls', box.id); field.setAttribute('autocomplete', 'off');
    }
    const all = `<li class="pagosya-suggest__all"><a href="${escape(pageHref('buscar.html', '?q=' + encodeURIComponent(q)))}">${hits.length ? 'Ver todos los resultados' : `Buscar “${escape(q)}”`}</a></li>`;
    box.innerHTML = hits.map(item => { const image = safeImage(Array.isArray(item.imageUrls) ? item.imageUrls[0] : '');
      return `<li role="option"><a href="${escape(productHref(item))}">${image ? `<img src="${escape(image)}" alt="" loading="lazy">` : '<span class="pagosya-suggest__blank"></span>'}<span><strong>${escape(item.name)}</strong><small>${escape(money(item.amount, item.currency))}</small></span></a></li>`; }).join('') + all;
    field.setAttribute('aria-expanded', 'true');
  }
  const suggestField = target => target instanceof HTMLInputElement && target.name === 'q' && target.closest('form[role=search]') ? target : null;
  document.addEventListener('input', event => { const field = suggestField(event.target); if (field) searchSuggest(field); });
  document.addEventListener('keydown', event => {
    const box = event.target.closest?.('form[role=search]')?.querySelector('.pagosya-suggest'); if (!box) return;
    const links = [...box.querySelectorAll('a')]; const at = links.indexOf(event.target);
    if (event.key === 'Escape') { box.remove(); suggestField(event.target)?.removeAttribute('aria-expanded'); return; }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const next = event.key === 'ArrowDown' ? at + 1 : at - 1;
    if (next < 0) { box.closest('form').querySelector('input[name=q]')?.focus(); return; }
    links[Math.min(next, links.length - 1)]?.focus();
  });
  document.addEventListener('focusout', event => {
    const form = event.target.closest?.('form[role=search]'); if (!form) return;
    setTimeout(() => { if (!form.contains(document.activeElement)) form.querySelector('.pagosya-suggest')?.remove(); }, 150);
  });
  const COOKIES_BODY = '<p>Esta tienda no usa cookies.</p><p>Para funcionar guarda algunos datos en el almacenamiento de tu navegador. Esos datos no salen de tu dispositivo, salvo lo que envías al hacer un pedido.</p><ul class="pagosya-info__list"><li><strong>Tu carrito:</strong> para que no pierdas lo que elegiste al cambiar de página.</li><li><strong>Tu elección de privacidad:</strong> si aceptaste o rechazaste las estadísticas; se recuerda 180 días.</li><li><strong>Estadísticas de visita</strong> (solo si las aceptas): identificadores anónimos de visitante y de visita para contar cuántas personas ven la tienda.</li><li><strong>Código de referido:</strong> si llegaste con un enlace de un socio, se recuerda durante la visita.</li><li><strong>Avisos de la tienda:</strong> si cerraste un aviso o tienes un enlace para recuperar un pedido, se recuerda durante la visita.</li><li><strong>Ventana de novedades:</strong> cuándo la viste o la cerraste por última vez, para no volver a mostrártela durante 30 días; queda en este dispositivo.</li></ul>';
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
      slot.innerHTML = INFO_LINKS.filter(([kind]) => !(SHOWCASE && SHOP_ONLY_INFO.has(kind)) && infoBody(kind)).map(([, href, label]) => `<a href="${href}">${escape(label)}</a>`).join('') + (account ? `<a href="${escape(account)}" data-pagosya-account>Mi cuenta</a>` : '')
        + (slot.closest('footer') ? storeLinks() : '');
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
      // A page with nothing to show links home, never a placeholder (spec 2026-10-14). It no longer prints the voice sheet's line:
      // that line tells YAPI's writers how the store talks and was never meant for customers (live 2026-10-18, Batido Ya's FAQ).
      mount.innerHTML = html ? `<div class="pagosya-info">${html}</div>` : '<p><a href="index.html">Volver al inicio</a></p>';
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
