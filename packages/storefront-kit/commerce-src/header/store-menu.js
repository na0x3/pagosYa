  // ---- Store menu (spec 2026-10-21 dropdown menu) ----
  // config.header.menu = { style: 'panel' | 'dropdowns', groups? } turns the menu on. The host header holds the mounts
  // [data-pagosya-store-menu="toggle"] (☰, opens the panel) and optionally [data-pagosya-store-menu="links"] (desktop top links
  // for dropdowns); what the menu replaces carries data-store-menu-replaces. Links name targets, resolved here against the live
  // store, so a deleted category never leaves a dead link; without groups the menu is built from the categories and pages.
  // One panel per header: it takes focus when opened from ☰, Esc or a choice closes it, Tab stays inside, and the scroll lock
  // goes back to what the page had.
  const STORE_MENU_PAGES = { about: ['nosotros.html', 'Nuestra historia'], contact: ['contacto.html', 'Contacto'], shipping: ['envios.html', 'Envíos y entregas'], refund: ['reembolsos.html', 'Cambios y devoluciones'], faq: ['faq.html', 'Preguntas frecuentes'] };
  const STORE_MENU_OPEN_MS = 120, STORE_MENU_CLOSE_MS = 200;
  const STORE_MENU_CSS = `
    [data-store-menu] [data-store-menu-replaces]{display:none!important}
    [data-pagosya-store-menu="links"]{display:none}
    .pym-toggle{display:inline-grid;place-items:center;width:44px;height:44px;padding:0;border:0;background:transparent;color:inherit;cursor:pointer}
    .pym-bars,.pym-bars::before,.pym-bars::after{display:block;width:20px;height:1.5px;background:currentColor;content:""}
    .pym-bars{position:relative}.pym-bars::before{position:absolute;top:-6px}.pym-bars::after{position:absolute;top:6px}
    .pym-top{min-height:44px;padding:0;border:0;background:none;color:inherit;font:inherit;font-size:13px;letter-spacing:.12em;text-transform:uppercase;cursor:pointer}
    .pym-top[aria-expanded="true"]{text-decoration:underline;text-underline-offset:6px}
    .pym-panel{position:absolute;left:0;right:0;top:100%;z-index:40;max-height:calc(100dvh - 72px);overflow:auto;padding:24px max(20px,calc((100% - 1280px)/2));background:var(--store-background,#fff);color:var(--store-foreground,#111);border-top:1px solid color-mix(in srgb,currentColor 12%,transparent);box-shadow:0 24px 48px -24px rgb(0 0 0 / .25);text-align:left;animation:pym-in .18s ease-out}
    .pym-panel[hidden],.pym-group[hidden]{display:none!important}
    @keyframes pym-in{from{opacity:0;transform:translateY(-6px)}}
    @media (prefers-reduced-motion: reduce){.pym-panel{animation:none}}
    .pym-tabs{display:flex;width:max-content;max-width:100%;margin:0 0 20px;border:1px solid currentColor}
    .pym-panel[data-mode="dropdown"] .pym-tabs,.pym-tabs[data-single]{display:none}
    .pym-tab{min-height:44px;padding:10px 20px;border:0;background:transparent;color:inherit;font:inherit;font-size:13px;letter-spacing:.12em;text-transform:uppercase;cursor:pointer}
    .pym-tab[aria-selected="true"]{background:var(--store-foreground,#111);color:var(--store-background,#fff)}
    .pym-links{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:2px 32px;margin:0;padding:0;list-style:none}
    .pym-links a{display:flex;align-items:center;min-height:44px;color:inherit;font-size:15px;text-decoration:none}
    .pym-links a:hover{text-decoration:underline;text-underline-offset:5px}
    .pym-tiles{margin-top:24px}
    .pym-tiles-title{margin:0 0 12px;font-size:12px;letter-spacing:.14em;text-transform:uppercase;opacity:.75}
    .pym-tiles ul{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:0;padding:0;list-style:none}
    .pym-tiles a{display:grid;gap:8px;color:inherit;font-size:14px;text-decoration:none}
    .pym-tiles img{display:block;width:100%;aspect-ratio:4/5;object-fit:cover}
    .pym-footer{display:flex;align-items:center;justify-content:center;min-height:52px;margin-top:24px;background:var(--store-foreground,#111);color:var(--store-background,#fff);font-size:13px;letter-spacing:.14em;text-transform:uppercase;text-decoration:none}
    .pym-extras{display:flex;flex-wrap:wrap;gap:4px 24px;margin-top:20px;padding-top:16px;border-top:1px solid color-mix(in srgb,currentColor 12%,transparent)}
    .pym-extras a{display:inline-flex;align-items:center;min-height:44px;color:inherit;font-size:14px}
    .pym-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
    @media (min-width:861px){
      [data-store-menu="dropdowns"][data-store-menu-links] [data-pagosya-store-menu="toggle"]{display:none}
      [data-store-menu="dropdowns"][data-store-menu-links] [data-pagosya-store-menu="links"]{display:flex;align-items:center;gap:28px}
      .pym-group{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.2fr);gap:16px 40px;align-items:start}
      .pym-tiles{margin-top:0}
      .pym-footer{grid-column:1/-1;margin-top:8px}
      .pyh--side-rail .pym-panel{position:fixed;top:0;left:88px;right:auto;width:min(960px,calc(100vw - 88px));max-height:100dvh;padding:32px}
    }`;
  function ensureStoreMenuStyle() {
    if (document.querySelector('style[data-pagosya-store-menu-style]')) return;
    const style = document.createElement('style');
    style.setAttribute('data-pagosya-store-menu-style', '');
    style.textContent = STORE_MENU_CSS;
    document.head.appendChild(style);
  }
  function storeMenuConfig() {
    const menu = config.header && config.header.menu;
    return menu && (menu.style === 'panel' || menu.style === 'dropdowns') ? menu : null;
  }
  const storeMenuCategories = () => (Array.isArray(store.categories) ? store.categories : []).filter(category => category && typeof category.id === 'string' && products().some(item => item.categoryId === category.id));
  /** A target as { href, label }, or null when the live store has nothing there. */
  function storeMenuTarget(to) {
    const value = String(to || '');
    // A showcase sells nothing online: no catalog, category, collection, shipping or refund page to link (final review 2026-10-21).
    if (SHOWCASE && (value === 'all' || value === 'new' || /^(?:category|collection):/.test(value) || SHOP_ONLY_INFO.has(value.slice(5)) && value.startsWith('page:'))) return null;
    if (value === 'all') return { href: pageHref('productos.html'), label: 'Todos los productos' };
    if (value === 'new') return products().length ? { href: pageHref('productos.html', '?orden=novedades'), label: 'Novedades' } : null;
    if (value.startsWith('category:')) {
      const category = storeMenuCategories().find(entry => entry.id === value.slice(9));
      return category ? { href: pageHref('productos.html', '?f_categoria=' + encodeURIComponent(filterFold(category.id))), label: category.name } : null;
    }
    // Owner 2026-10-28: «Mujer → Zapatos» is the Mujer collection showing one category (collection:<slug>/category:<id>).
    const nested = /^collection:([^/]+)\/category:(.+)$/.exec(value);
    if (nested) {
      const collection = infoCollections().find(entry => entry.slug === nested[1]);
      const category = storeMenuCategories().find(entry => entry.id === nested[2]);
      return collection && category ? { href: pageHref('coleccion.html', '?c=' + encodeURIComponent(collection.slug) + '&f_categoria=' + encodeURIComponent(filterFold(category.id))), label: category.name } : null;
    }
    if (value.startsWith('collection:')) {
      const collection = infoCollections().find(entry => entry.slug === value.slice(11));
      return collection ? { href: pageHref('coleccion.html', '?c=' + encodeURIComponent(collection.slug)), label: collection.name } : null;
    }
    if (value.startsWith('page:')) {
      const kind = value.slice(5), page = STORE_MENU_PAGES[kind];
      return page && infoBody(kind) ? { href: pageHref(page[0]), label: page[1] } : null;
    }
    if (value.startsWith('section:') && /^[\w-]{1,60}$/.test(value.slice(8))) return { href: pageHref('index.html', '#' + value.slice(8)), label: '' };
    return null;
  }
  // A store photo: an http(s) upload, or the data URL the Studio preview turns it into (live check 2026-10-21, NOA VARGAS).
  const storeMenuPhoto = url => (typeof url === 'string' && /^(?:https?:\/\/|data:image\/(?:png|jpe?g|webp|avif|gif);)/i.test(url) ? url : '');
  /** The default menu (spec): «Tienda» from the categories, «Descubre» from the host's own links and the info pages. */
  function defaultStoreMenuGroups(host) {
    const categories = storeMenuCategories();
    const tiles = categories.map(category => ({ title: category.name, to: 'category:' + category.id, image: storeMenuPhoto(category.bannerUrl) || storeMenuPhoto((products().find(item => item.categoryId === category.id)?.imageUrls || [])[0]) }))
      .filter(tile => tile.image).slice(0, 3);
    const shop = { label: 'Tienda', links: [{ to: 'new' }, ...categories.map(category => ({ to: 'category:' + category.id })), { to: 'all' }], tilesTitle: 'Por categoría', tiles, footer: { label: 'Ver toda la tienda', to: 'all' } };
    const own = [...host.querySelectorAll('[data-store-menu-replaces] a[href]')]
      .map(anchor => ({ href: anchor.getAttribute('href'), label: anchor.textContent.trim() }))
      .filter(link => link.label && !/^(?:\.\.\/)*(?:index|productos)\.html$/.test(link.href));
    const discover = { label: 'Descubre', links: [...own, ...['about', 'shipping', 'refund', 'faq', 'contact'].map(kind => ({ to: 'page:' + kind }))] };
    // Owner 2026-10-28 («colección Mujer y adentro zapatos, ropa…»): with two collections or more (Mujer, Hombre, Niños), each is
    // its own menu — the categories it holds, a photo tile per category, and «Ver todo».
    const collectionsWithProducts = infoCollections();
    if (collectionsWithProducts.length >= 2) {
      const byCollection = collectionsWithProducts.slice(0, 3).map(collection => {
        const ids = new Set(Array.isArray(collection.productIds) ? collection.productIds : []);
        const inside = products().filter(item => ids.has(item.id));
        const cats = categories.filter(category => inside.some(item => item.categoryId === category.id));
        const tilesHere = cats.map(category => ({ title: category.name, to: `collection:${collection.slug}/category:${category.id}`,
          image: storeMenuPhoto((inside.find(item => item.categoryId === category.id)?.imageUrls || [])[0]) })).filter(tile => tile.image).slice(0, 3);
        return { label: collection.name, links: [...cats.map(category => ({ to: `collection:${collection.slug}/category:${category.id}` })), { label: `Ver todo ${collection.name}`, to: `collection:${collection.slug}` }],
          tilesTitle: 'Por categoría', tiles: tilesHere, footer: { label: `Ver todo ${collection.name}`, to: `collection:${collection.slug}` } };
      });
      return [...byCollection, discover];
    }
    return [shop, discover];
  }
  /** Groups with every link, tile and footer resolved; a repeated label is shown once, and a group with no link left is dropped. */
  function resolveStoreMenuGroups(groups) {
    return (Array.isArray(groups) ? groups : []).slice(0, 4).map(group => {
      const seen = new Set();
      const links = (Array.isArray(group.links) ? group.links : []).map(link => {
        if (link.href) return { href: link.href, label: String(link.label).slice(0, 28) };
        const target = storeMenuTarget(link.to);
        return target && (link.label || target.label) ? { href: target.href, label: String(link.label || target.label).slice(0, 28) } : null;
      }).filter(link => link && !seen.has(link.label.toLowerCase()) && seen.add(link.label.toLowerCase())).slice(0, 12);
      const tiles = (Array.isArray(group.tiles) ? group.tiles : []).map(tile => { const target = storeMenuTarget(tile.to); return target && storeMenuPhoto(tile.image) ? { href: target.href, title: String(tile.title || target.label).slice(0, 28), image: tile.image } : null; }).filter(Boolean).slice(0, 3);
      const footerTarget = group.footer ? storeMenuTarget(group.footer.to) : null;
      return { label: String(group.label || '').slice(0, 28), links, tilesTitle: tiles.length ? String(group.tilesTitle || '') : '', tiles, footer: footerTarget ? { href: footerTarget.href, label: String(group.footer.label || footerTarget.label).slice(0, 28) } : null };
    }).filter(group => group.label && group.links.length);
  }
  let storeMenuCount = 0;
  const storeMenuOpenState = { host: null, close: null };
  function renderStoreMenu(host, menu) {
    const toggleMount = host.querySelector('[data-pagosya-store-menu="toggle"]');
    if (!toggleMount) return;
    const linksMount = menu.style === 'dropdowns' ? host.querySelector('[data-pagosya-store-menu="links"]') : null;
    let groups = resolveStoreMenuGroups(menu.groups);
    if (!groups.length) groups = resolveStoreMenuGroups(defaultStoreMenuGroups(host));
    if (!groups.length) return;
    const id = 'pym-' + (++storeMenuCount);
    host.setAttribute('data-store-menu', menu.style);
    host.toggleAttribute('data-store-menu-links', Boolean(linksMount));
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    toggleMount.innerHTML = `<button type="button" class="pym-toggle" data-store-menu-toggle aria-expanded="false" aria-controls="${id}"><span class="pym-bars" aria-hidden="true"></span><span class="pym-sr">Menú</span></button>`;
    if (linksMount) linksMount.innerHTML = groups.map((group, index) => `<button type="button" class="pym-top" data-store-menu-top="${index}" aria-expanded="false" aria-controls="${id}">${escape(group.label)}</button>`).join('');
    const extras = [...host.querySelectorAll('[data-store-menu-extra] a[href]')].map(anchor => { const copy = anchor.cloneNode(true); copy.removeAttribute('id'); copy.removeAttribute('class'); return copy.outerHTML; }).join('');
    const panel = document.createElement('div');
    panel.className = 'pym-panel';
    panel.id = id;
    panel.hidden = true;
    panel.setAttribute('data-store-menu-panel', '');
    panel.setAttribute('aria-label', 'Menú');
    panel.innerHTML = `<div class="pym-tabs" role="tablist" aria-label="Menú"${groups.length === 1 ? ' data-single' : ''}>${groups.map((group, index) => `<button type="button" class="pym-tab" role="tab" id="${id}-tab-${index}" aria-controls="${id}-group-${index}" aria-selected="${index === 0}" tabindex="${index === 0 ? 0 : -1}">${escape(group.label)}</button>`).join('')}</div>`
      + groups.map((group, index) => `<div class="pym-group" role="tabpanel" id="${id}-group-${index}" aria-labelledby="${id}-tab-${index}"${index ? ' hidden' : ''}>`
        + `<ul class="pym-links">${group.links.map(link => `<li><a href="${escape(link.href)}">${escape(link.label)}</a></li>`).join('')}</ul>`
        + (group.tiles.length ? `<div class="pym-tiles">${group.tilesTitle ? `<p class="pym-tiles-title">${escape(group.tilesTitle)}</p>` : ''}<ul>${group.tiles.map(tile => `<li><a href="${escape(tile.href)}"><img src="${escape(tile.image)}" alt="" loading="lazy"><span>${escape(tile.title)}</span></a></li>`).join('')}</ul></div>` : '')
        + (group.footer ? `<a class="pym-footer" href="${escape(group.footer.href)}">${escape(group.footer.label)}</a>` : '')
        + '</div>').join('')
      + (extras ? `<div class="pym-extras">${extras}</div>` : '');
    host.appendChild(panel);
    const toggle = toggleMount.querySelector('[data-store-menu-toggle]');
    const tops = linksMount ? [...linksMount.querySelectorAll('[data-store-menu-top]')] : [];
    const tabs = [...panel.querySelectorAll('[role=tab]')];
    const panes = [...panel.querySelectorAll('[role=tabpanel]')];
    // openedBy: a hover-opened dropdown closes when the pointer leaves; a clicked one stays until clicked again (final review 2026-10-21).
    let opener = null, openedBy = '', lockedFrom = null, openTimer = 0, closeTimer = 0;
    const select = index => tabs.forEach((tab, i) => { tab.setAttribute('aria-selected', String(i === index)); tab.tabIndex = i === index ? 0 : -1; panes[i].hidden = i !== index; });
    const focusable = () => [...panel.querySelectorAll('a[href],button:not([disabled])')].filter(el => !el.closest('[hidden]') && !el.closest('.pym-tabs[data-single]') && !(panel.getAttribute('data-mode') === 'dropdown' && el.closest('.pym-tabs')));
    const unlock = () => { if (lockedFrom !== null) { document.documentElement.style.overflow = lockedFrom; lockedFrom = null; } };
    const mouse = event => !event.pointerType || event.pointerType === 'mouse';
    function close(returnFocus) {
      clearTimeout(openTimer); clearTimeout(closeTimer);
      if (panel.hidden) return;
      panel.hidden = true;
      [toggle, ...tops].forEach(button => button.setAttribute('aria-expanded', 'false'));
      unlock();
      storeMenuOpenState.host = storeMenuOpenState.close = null;
      if (returnFocus && opener) opener.focus({ preventScroll: true });
    }
    function open(mode, index, from, focus, by = 'click') {
      if (storeMenuOpenState.close && storeMenuOpenState.host !== host) storeMenuOpenState.close(false);
      opener = from;
      openedBy = by;
      panel.setAttribute('data-mode', mode);
      select(index);
      panel.hidden = false;
      [toggle, ...tops].forEach(button => button.setAttribute('aria-expanded', String(button === from)));
      storeMenuOpenState.host = host; storeMenuOpenState.close = close;
      if (mode === 'panel' && lockedFrom === null) { lockedFrom = document.documentElement.style.overflow; document.documentElement.style.overflow = 'hidden'; }
      if (mode === 'dropdown') unlock();
      if (focus) (mode === 'panel' ? tabs.find(tab => tab.getAttribute('aria-selected') === 'true') : focusable()[0])?.focus({ preventScroll: true });
    }
    toggle.addEventListener('click', () => (panel.hidden || panel.getAttribute('data-mode') !== 'panel' ? open('panel', 0, toggle, true) : close(true)));
    tops.forEach((top, index) => {
      top.addEventListener('click', () => { clearTimeout(openTimer); clearTimeout(closeTimer); if (!panel.hidden && opener === top && openedBy === 'click') close(false); else open('dropdown', index, top, true); });
      top.addEventListener('pointerenter', event => { if (!mouse(event)) return; clearTimeout(closeTimer); clearTimeout(openTimer); if (!panel.hidden && openedBy === 'click') return; openTimer = setTimeout(() => open('dropdown', index, top, false, 'hover'), STORE_MENU_OPEN_MS); });
      top.addEventListener('pointerleave', event => { if (!mouse(event)) return; clearTimeout(openTimer); if (panel.getAttribute('data-mode') === 'dropdown' && openedBy === 'hover') closeTimer = setTimeout(() => close(false), STORE_MENU_CLOSE_MS); });
    });
    panel.addEventListener('pointerenter', event => { if (mouse(event)) clearTimeout(closeTimer); });
    panel.addEventListener('pointerleave', event => { if (mouse(event) && panel.getAttribute('data-mode') === 'dropdown' && openedBy === 'hover') closeTimer = setTimeout(() => close(false), STORE_MENU_CLOSE_MS); });
    tabs.forEach((tab, index) => {
      tab.addEventListener('click', () => select(index));
      tab.addEventListener('keydown', event => {
        const next = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: tabs.length - 1 }[event.key];
        if (next === undefined) return;
        event.preventDefault();
        const target = (next + tabs.length) % tabs.length;
        select(target);
        tabs[target].focus();
      });
    });
    panel.addEventListener('click', event => { if (event.target.closest('a[href]')) close(false); });
    panel.addEventListener('keydown', event => {
      if (event.key !== 'Tab' || panel.getAttribute('data-mode') !== 'panel') return;
      const items = focusable();
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
    host.__pagosyaStoreMenu = { close, panel };
  }
  function renderStoreMenus() {
    const menu = storeMenuConfig();
    document.querySelectorAll('[data-pagosya-store-menu="toggle"]').forEach(mount => {
      const host = mount.closest('header') || mount.parentElement;
      if (host.__pagosyaStoreMenu) { host.__pagosyaStoreMenu.close(false); host.__pagosyaStoreMenu.panel.remove(); host.__pagosyaStoreMenu = null; }
      if (!menu) return;
      ensureStoreMenuStyle();
      renderStoreMenu(host, menu);
    });
  }
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !storeMenuOpenState.close) return;
    event.preventDefault();
    storeMenuOpenState.close(true);
  });
  document.addEventListener('click', event => {
    if (!storeMenuOpenState.close || storeMenuOpenState.host.contains(event.target)) return;
    storeMenuOpenState.close(false);
  });
  window.addEventListener('pagehide', () => storeMenuOpenState.close && storeMenuOpenState.close(false));
  document.addEventListener('pagosya:ready', renderStoreMenus);
  window.pagosyaStoreMenu = { render: renderStoreMenus, close: () => storeMenuOpenState.close && storeMenuOpenState.close(false) };
  renderStoreMenus();
