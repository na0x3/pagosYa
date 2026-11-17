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
    .pym-top{display:inline-flex;align-items:center;min-height:44px;padding:0;border:0;background:none;color:inherit;font:inherit;font-size:13px;letter-spacing:.12em;text-transform:uppercase;text-decoration:none;cursor:pointer}
    /* A menu group with one page (Nosotros) is a link, not a button: same line and look as its neighbours (owner 2026-11-13). */
    .pym-top[aria-expanded="true"]{text-decoration:underline;text-underline-offset:6px}
    .pym-panel{position:absolute;left:0;right:0;top:100%;z-index:40;max-height:calc(100dvh - 72px);overflow:auto;padding:24px max(20px,calc((100% - 1280px)/2));background:var(--store-background,var(--kit-paper,#fff));color:var(--store-foreground,var(--kit-ink,#111));border-top:1px solid color-mix(in srgb,currentColor 12%,transparent);box-shadow:0 24px 48px -24px rgb(0 0 0 / .25);text-align:left;animation:pym-in .18s ease-out}
    .pym-panel[hidden],.pym-group[hidden]{display:none!important}
    @keyframes pym-in{from{opacity:0;transform:translateY(-6px)}}
    @media (prefers-reduced-motion: reduce){.pym-panel{animation:none}}
    .pym-tabs{display:flex;width:max-content;max-width:100%;margin:0 0 20px;border:1px solid currentColor}
    /* Owner 2026-11-16 (Bake Lab phone: «COM-PRAR», «DESA-YUNA-R»): tab names never break; a row too wide scrolls sideways and stays
       clear of the close button. */
    .pym-tabs{overflow-x:auto;scrollbar-width:none}.pym-tabs::-webkit-scrollbar{display:none}
    .pym-panel:is([data-mode=panel],[data-model=overlay],[data-model=split],[data-model=drawer]) .pym-tabs{max-width:calc(100% - 52px)}
    .pym-panel[data-mode="dropdown"] .pym-tabs,.pym-tabs[data-single]{display:none}
    .pym-tab{flex:none;white-space:nowrap;min-height:44px;padding:10px 20px;border:0;background:transparent;color:inherit;font:inherit;font-size:13px;letter-spacing:.12em;text-transform:uppercase;cursor:pointer}
    .pym-tab[aria-selected="true"]{background:var(--store-foreground,var(--kit-ink,#111));color:var(--store-background,var(--kit-paper,#fff))}
    .pym-links{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:2px 32px;margin:0;padding:0;list-style:none}
    .pym-links a{display:flex;align-items:center;min-height:44px;color:inherit;font-size:15px;text-decoration:none}
    .pym-links a:hover{text-decoration:underline;text-underline-offset:5px}
    .pym-tiles{margin-top:24px}
    .pym-tiles-title{margin:0 0 12px;font-size:12px;letter-spacing:.14em;text-transform:uppercase;opacity:.75}
    .pym-tiles ul{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:0;padding:0;list-style:none}
    .pym-tiles a{display:grid;gap:8px;color:inherit;font-size:14px;text-decoration:none}
    .pym-tiles img{display:block;width:100%;aspect-ratio:4/5;object-fit:cover}
    .pym-price{font-size:13px;opacity:.75}
    .pym-footer{display:flex;align-items:center;justify-content:center;min-height:52px;margin-top:24px;background:var(--store-foreground,var(--kit-ink,#111));color:var(--store-background,var(--kit-paper,#fff));font-size:13px;letter-spacing:.14em;text-transform:uppercase;text-decoration:none}
    .pym-extras{display:flex;flex-wrap:wrap;gap:4px 24px;margin-top:20px;padding-top:16px;border-top:1px solid color-mix(in srgb,currentColor 12%,transparent)}
    .pym-extras a{display:inline-flex;align-items:center;min-height:44px;color:inherit;font-size:14px}
    /* Owner 2026-10-29 («a little menu with the accent of the brand colors, font»): the menu wears the brand where the store sets it. */
    .pym-panel{background:var(--store-surface,var(--kit-paper,var(--store-background,var(--kit-paper,#fff))));border-top:3px solid var(--store-accent,var(--kit-accent,currentColor))}
    .pym-tab[aria-selected="true"]{background:var(--store-accent,var(--kit-accent,var(--store-foreground,var(--kit-ink,#111))));color:var(--store-on-accent,var(--kit-on-accent,var(--store-background,var(--kit-paper,#fff))))}
    .pym-links a{font-family:var(--store-heading-font,var(--kit-display,inherit));font-size:19px}
    .pym-links a:hover{color:var(--store-accent,var(--kit-accent,inherit))}
    .pym-tiles a{font-family:var(--store-heading-font,var(--kit-display,inherit))}
    .pym-footer{background:var(--store-accent,var(--kit-accent,var(--store-foreground,var(--kit-ink,#111))));color:var(--store-on-accent,var(--kit-on-accent,var(--store-background,var(--kit-paper,#fff))))}
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
    style.textContent = STORE_MENU_CSS + STORE_MENU_MODEL_CSS;
    document.head.appendChild(style);
  }
  // Menu models (spec 2026-11-15 store menu models): one look per store. «style» is kept for older stores (panel → tabs,
  // dropdowns → dropdown); a model the runtime does not know falls back to tabs, never to no menu.
  const STORE_MENU_MODELS = ['tabs', 'mega', 'overlay', 'dropdown', 'drawer', 'split', 'index', 'dock', 'stickers', 'circles', 'rail', 'bestsellers', 'need', 'offer', 'search', 'thumb'];
  // Models that open from top links on a computer (the old «dropdowns» style); the rest open from ☰ or never close.
  const STORE_MENU_TOP_LINKS = new Set(['dropdown', 'mega', 'bestsellers', 'need', 'offer']);
  function storeMenuModel(menu) {
    if (STORE_MENU_MODELS.includes(menu.model)) return menu.model;
    return menu.style === 'dropdowns' ? 'dropdown' : 'tabs';
  }
  function storeMenuConfig() {
    const menu = config.header && config.header.menu;
    return menu && (menu.style === 'panel' || menu.style === 'dropdowns' || typeof menu.model === 'string') ? menu : null;
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
      // By id, or by name (live 2026-11-16: YAPI wrote «category:Sodas»).
      const category = storeMenuCategories().find(entry => entry.id === value.slice(9)) || storeMenuCategories().find(entry => filterFold(entry.name) === filterFold(value.slice(9)));
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
    // The pages YAPI made (spec 2026-11-05 creates anything): <slug>.html; the link carries its own label.
    if (value.startsWith('extra:') && /^[a-z][a-z0-9-]{0,39}$/.test(value.slice(6))) return { href: pageHref(value.slice(6) + '.html'), label: '' };
    if (value.startsWith('page:')) {
      const kind = value.slice(5), page = STORE_MENU_PAGES[kind];
      return page && infoBody(kind) ? { href: pageHref(page[0]), label: page[1] } : null;
    }
    if (value.startsWith('section:') && /^[\w-]{1,60}$/.test(value.slice(8))) return { href: pageHref('index.html', '#' + value.slice(8)), label: '' };
    return null;
  }
  // A store photo: an http(s) upload, or the data URL the Studio preview turns it into (live check 2026-10-21, NOA VARGAS).
  // …or one of the store's own bundled photos (V2 stores, spec 2026-11-15 menu models: assets/<name>.<ext>, served next to the page).
  const storeMenuPhoto = url => (typeof url === 'string' && (/^(?:https?:\/\/|data:image\/(?:png|jpe?g|webp|avif|gif);)/i.test(url) || /^assets\/[\w.-]+\.(?:jpe?g|png|webp|avif)$/i.test(url)) ? url : '');
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
  /** The first product photo behind a «category:id», «collection:slug» or «collection:slug/category:id» link; '' otherwise. */
  function storeMenuLinkPhoto(to) {
    const match = /^(?:collection:([^/]+))?\/?(?:category:(.+))?$/.exec(to);
    if (!match || (!match[1] && !match[2])) return '';
    const collection = match[1] ? infoCollections().find(c => c && c.slug === match[1]) : null;
    if (match[1] && !collection) return '';
    const ids = collection ? new Set(Array.isArray(collection.productIds) ? collection.productIds : []) : null;
    const item = products().find(product => (!ids || ids.has(product.id)) && (!match[2] || product.categoryId === match[2]) && storeMenuPhoto((product.imageUrls || [])[0]));
    return item ? storeMenuPhoto(item.imageUrls[0]) : '';
  }
  // A store upload path ("/v1/uploads/…") lives on the API, not on the store's own origin.
  function storeMenuStorePhoto(url) {
    if (typeof url !== 'string' || !url.trim()) return '';
    try { return storeMenuPhoto(/^\/v1\//.test(url.trim()) && config.apiBaseUrl ? new URL(url.trim(), config.apiBaseUrl).href : url.trim()); } catch { return ''; }
  }
  /** Spec 2026-11-04 §3 (Canasta Viva: «Descubre» was four words over an empty panel): a group with no photo of its own shows the
   *  store's own photo on «Nuestra historia» (never a product photo) and up to two products, badged ones first. */
  function storeMenuDiscoverTiles(group) {
    const tiles = [];
    const about = (Array.isArray(group.links) ? group.links : []).some(link => link && link.to === 'page:about') ? storeMenuTarget('page:about') : null;
    const story = about ? storeMenuStorePhoto(store.aboutImageUrl) || storeMenuStorePhoto(store.bannerUrl) : '';
    if (about && story) tiles.push({ href: about.href, title: about.label, image: story });
    const shown = products().filter(item => storeMenuPhoto((item.imageUrls || [])[0]));
    for (const item of [...shown.filter(entry => entry.badge), ...shown.filter(entry => !entry.badge)].slice(0, 2)) {
      tiles.push({ href: pageHref(config.productPage || 'product.html', '?id=' + encodeURIComponent(item.id)), title: String(item.name || '').slice(0, 28),
        image: storeMenuPhoto(item.imageUrls[0]), price: money(price(item), item.currency || 'BOB') });
    }
    return tiles;
  }
  /** Groups with every link, tile and footer resolved; a repeated label is shown once, and a group with no link left is dropped. */
  function resolveStoreMenuGroups(groups) {
    return (Array.isArray(groups) ? groups : []).slice(0, 7).map(group => {
      const seen = new Set();
      const links = (Array.isArray(group.links) ? group.links : []).map(link => {
        // A link may carry a one-line note (index, need) and its photo (overlay, split swap the big photo to it).
        const note = String(link.note || '').slice(0, 60);
        if (link.href) return { href: link.href, label: String(link.label).slice(0, 28), note, image: '' };
        const target = storeMenuTarget(link.to);
        return target && (link.label || target.label) ? { href: target.href, label: String(link.label || target.label).slice(0, 28), note, image: storeMenuLinkPhoto(link.to) } : null;
      }).filter(link => link && !seen.has(link.label.toLowerCase()) && seen.add(link.label.toLowerCase())).slice(0, 12);
      const named = (Array.isArray(group.tiles) ? group.tiles : []).map(tile => { const target = storeMenuTarget(tile.to); return target && storeMenuPhoto(tile.image) ? { href: target.href, title: String(tile.title || target.label).slice(0, 28), image: tile.image } : null; }).filter(Boolean).slice(0, 3);
      // Owner 2026-10-30 («dropdown menus now dont have pictures»): a group written without tiles shows the first product photo
      // of each category or collection its links point to, as the default menu does.
      const tiles = named.length ? named : (Array.isArray(group.links) ? group.links : []).map(link => {
        const target = typeof link.to === 'string' ? storeMenuTarget(link.to) : null;
        const image = target ? storeMenuLinkPhoto(link.to) : '';
        return target && image ? { href: target.href, title: String(link.label || target.label).slice(0, 28), image } : null;
      // Each photo and each page once (review 2026-10-30: «Ver todo» and the first category share a photo).
      }).filter((tile, index, list) => tile && list.findIndex(other => other && (other.image === tile.image || other.href === tile.href)) === index).slice(0, 3);
      const shownTiles = tiles.length ? tiles : storeMenuDiscoverTiles(group);
      const footerTarget = group.footer ? storeMenuTarget(group.footer.to) : null;
      return { label: String(group.label || '').slice(0, 28), note: String(group.note || '').slice(0, 60), links, direct: group.direct === true && links.length === 1, tilesTitle: shownTiles.length ? String(group.tilesTitle || '') : '', tiles: shownTiles, footer: footerTarget ? { href: footerTarget.href, label: String(group.footer.label || footerTarget.label).slice(0, 28) } : null };
    }).filter(group => group.label && group.links.length);
  }
  // Selling menus (spec 2026-11-15): only the store's real data — badged products first, a real offer or none, live prices.
  const STORE_MENU_BADGES = /más vendido|nuevo/i;
  const storeMenuBadge = item => String(item.highlight || item.badge || '');
  function storeMenuBest() {
    const pool = products().filter(item => storeMenuPhoto((item.imageUrls || [])[0]));
    return [...pool.filter(item => STORE_MENU_BADGES.test(storeMenuBadge(item))), ...pool.filter(item => !STORE_MENU_BADGES.test(storeMenuBadge(item)))].slice(0, 3);
  }
  function storeMenuOffer() {
    const goal = Number(store.freeShippingFrom);
    if (Number.isInteger(goal) && goal > 0) return { kind: 'shipping', title: `Envío gratis desde ${money(goal, 'BOB')}`, href: pageHref('productos.html') };
    const pack = store.bundlesEnabled && Array.isArray(store.bundles) ? store.bundles.find(b => b && Number(b.discountPercent) > 0) : null;
    if (pack) return { kind: 'pack', title: String(pack.label || 'Pack').slice(0, 40), detail: `Ahorras ${Math.round(Number(pack.discountPercent))}%`, href: pageHref('productos.html') };
    return null;
  }
  const storeMenuFrom = links => {
    const prices = links.flatMap(link => { const id = new URL(link.href, location.href).searchParams.get('f_categoria'); return id ? products().filter(item => filterFold(item.categoryId) === id).map(price) : []; });
    return prices.length ? `desde ${money(Math.min(...prices), 'BOB')}` : '';
  };
  const storeMenuProductHref = item => pageHref(config.productPage || 'product.html', '?id=' + encodeURIComponent(item.id));
  // An item with options opens its page (a size or a colour comes first), like the catalogue's cards.
  const storeMenuBuy = item => optionGroups(item) ? `<a class="pym-add" data-product="${escape(item.id)}" href="${escape(storeMenuProductHref(item))}">Elegir</a>` : `<button type="button" class="pym-add" data-add="${escape(item.id)}" data-quantity="1">Agregar</button>`;
  const storeMenuCard = item => `<li><a href="${escape(storeMenuProductHref(item))}"><img src="${escape(item.imageUrls[0])}" alt="" loading="lazy"><span>${escape(String(item.name || '').slice(0, 40))}</span><b>${escape(money(price(item), item.currency || 'BOB'))}</b></a>${storeMenuBuy(item)}</li>`;
  let storeMenuCount = 0;
  const storeMenuOpenState = { host: null, close: null };
  function renderStoreMenu(host, menu) {
    const toggleMount = host.querySelector('[data-pagosya-store-menu="toggle"]');
    if (!toggleMount) return;
    const model = storeMenuModel(menu);
    const linksMount = STORE_MENU_TOP_LINKS.has(model) ? host.querySelector('[data-pagosya-store-menu="links"]') : null;
    let groups = resolveStoreMenuGroups(menu.groups);
    if (!groups.length) groups = resolveStoreMenuGroups(defaultStoreMenuGroups(host));
    // Only direct page links (spec 2026-11-05 creates anything): the kit's own menu stays, the links follow it.
    else if (groups.every(group => group.direct)) groups = [...resolveStoreMenuGroups(defaultStoreMenuGroups(host)), ...groups];
    if (!groups.length) return;
    const id = 'pym-' + (++storeMenuCount);
    host.setAttribute('data-store-menu', STORE_MENU_TOP_LINKS.has(model) ? 'dropdowns' : 'panel');
    host.setAttribute('data-store-menu-model', model);
    host.toggleAttribute('data-store-menu-links', Boolean(linksMount));
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    toggleMount.innerHTML = `<button type="button" class="pym-toggle" data-store-menu-toggle aria-expanded="false" aria-controls="${id}"><span class="pym-bars" aria-hidden="true"></span><span class="pym-sr">Menú</span></button>`;
    if (linksMount) linksMount.innerHTML = groups.map((group, index) => group.direct
      ? `<a class="pym-top" href="${escape(group.links[0].href)}">${escape(group.label)}</a>`
      : `<button type="button" class="pym-top" data-store-menu-top="${index}" aria-expanded="false" aria-controls="${id}">${escape(group.label)}</button>`).join('');
    const extras = [...host.querySelectorAll('[data-store-menu-extra] a[href]')].map(anchor => { const copy = anchor.cloneNode(true); copy.removeAttribute('id'); copy.removeAttribute('class'); return copy.outerHTML; }).join('');
    const panel = document.createElement('div');
    panel.className = 'pym-panel';
    panel.id = id;
    panel.hidden = true;
    panel.setAttribute('data-store-menu-panel', '');
    panel.setAttribute('aria-label', 'Menú');
    // The rail is a drawer wherever it cannot stand as a column (below 1280 px); its column is drawn below.
    panel.setAttribute('data-model', model === 'rail' ? 'drawer' : model);
    const countOf = href => { const id = new URL(href, location.href).searchParams.get('f_categoria'); const n = id ? products().filter(item => filterFold(item.categoryId) === id).length : 0; return n ? `${n} ${n === 1 ? 'producto' : 'productos'}` : ''; };
    const swaps = model === 'overlay' || model === 'split';
    const linkHtml = link => `<li><a href="${escape(link.href)}"${swaps && link.image ? ` data-photo-for="${escape(link.image)}"` : ''}>${model === 'stickers' && link.image ? `<span class="pym-sticker-photo"><img src="${escape(link.image)}" alt="" loading="lazy"></span>` : ''}<span class="pym-link-label">${escape(link.label)}</span>${link.note ? `<span class="pym-note">${escape(link.note)}</span>` : ''}${model === 'index' ? `<span class="pym-count">${escape(countOf(link.href))}</span>` : ''}</a></li>`;
    const tileHtml = tile => `<li><a href="${escape(tile.href)}"><img src="${escape(tile.image)}" alt="" loading="lazy"><span${model === 'mega' ? ' class="pym-tile-title"' : ''}>${escape(tile.title)}</span>${tile.price ? `<small class="pym-price">${escape(tile.price)}</small>` : ''}</a></li>`;
    const firstPhoto = (groups.find(group => group.tiles.length) || { tiles: [] }).tiles[0] || groups.flatMap(group => group.links).find(link => link.image);
    const heroPhoto = swaps && firstPhoto ? `<div class="pym-hero-photo"><img src="${escape(firstPhoto.image)}" alt="" loading="lazy"></div>` : '';
    const best = (model === 'bestsellers' || model === 'offer' || model === 'search') ? storeMenuBest() : [];
    const offer = model === 'offer' ? storeMenuOffer() : null;
    const offerHtml = model !== 'offer' ? '' : offer
      ? `<a class="pym-offer" data-kind="${offer.kind}" href="${escape(offer.href)}">${best[0] ? `<img src="${escape(best[0].imageUrls[0])}" alt="" loading="lazy">` : ''}<b>${escape(offer.title)}</b>${offer.detail ? `<span>${escape(offer.detail)}</span>` : ''}</a>`
      : best[0] ? `<a class="pym-offer" data-kind="product" href="${escape(storeMenuProductHref(best[0]))}"><img src="${escape(best[0].imageUrls[0])}" alt="" loading="lazy"><b>${escape(best[0].name)}</b><span>${escape(money(price(best[0]), best[0].currency || 'BOB'))}</span></a>` : '';
    const popular = [...storeMenuCategories().map(c => ({ label: c.name, href: pageHref('productos.html', '?f_categoria=' + encodeURIComponent(filterFold(c.id))) })), ...products().map(item => ({ label: item.name, href: storeMenuProductHref(item) }))].slice(0, 6);
    const searchHtml = model !== 'search' ? '' : `<form class="pym-search" action="${escape(pageHref('buscar.html'))}" role="search"><input type="search" name="q" placeholder="Busca productos" aria-label="Buscar"></form>${popular.length ? `<p class="pym-tiles-title">Populares</p><div class="pym-popular">${popular.map(chip => `<a href="${escape(chip.href)}">${escape(String(chip.label).slice(0, 28))}</a>`).join('')}</div>` : ''}${best.length ? `<div class="pym-best"><ul>${best.map(storeMenuCard).join('')}</ul></div>` : ''}`;
    // Live 2026-11-16 (DooBoo r11, overlay): a menu that covers the page has its own visible close button.
    panel.innerHTML = '<button type="button" class="pym-close" data-store-menu-close aria-label="Cerrar menú"><span aria-hidden="true">×</span></button>' + heroPhoto + offerHtml + searchHtml + `<div class="pym-tabs" role="tablist" aria-label="Menú"${groups.length === 1 ? ' data-single' : ''}${model === 'dock' || model === 'search' ? ' hidden' : ''}>${groups.map((group, index) => `<button type="button" class="pym-tab" role="tab" id="${id}-tab-${index}" aria-controls="${id}-group-${index}" aria-selected="${index === 0}" tabindex="${index === 0 ? 0 : -1}">${escape(group.label)}</button>`).join('')}</div>`
      + groups.map((group, index) => `<div class="pym-group" role="tabpanel" id="${id}-group-${index}" aria-labelledby="${id}-tab-${index}"${index ? ' hidden' : ''}>`
        + (model === 'need' ? `<div class="pym-need">${group.tiles[0] ? `<img src="${escape(group.tiles[0].image)}" alt="" loading="lazy">` : ''}<span class="pym-need-label">${escape(group.label)}</span>${group.note ? `<span class="pym-note">${escape(group.note)}</span>` : ''}<span class="pym-need-from">${escape(storeMenuFrom(group.links))}</span></div>` : '')
        + `<ul class="pym-links">${group.links.map(linkHtml).join('')}</ul>`
        + (model === 'bestsellers' && best.length ? `<div class="pym-best"><p class="pym-best-title">${best.some(item => STORE_MENU_BADGES.test(storeMenuBadge(item))) ? 'Lo más vendido' : 'Destacados'}</p><ul>${best.map(storeMenuCard).join('')}</ul></div>` : '')
        + (group.tiles.length && model !== 'index' ? `<div class="pym-tiles">${group.tilesTitle ? `<p class="pym-tiles-title">${escape(group.tilesTitle)}</p>` : ''}<ul>${group.tiles.map(tileHtml).join('')}</ul></div>` : '')
        + (group.footer ? `<a class="pym-footer" href="${escape(group.footer.href)}">${escape(group.footer.label)}</a>` : '')
        + '</div>').join('')
      + (extras ? `<div class="pym-extras">${extras}</div>` : '');
    host.appendChild(panel);
    // Thumb bar (spec 2026-11-15): four buttons fixed at the bottom of the phone; the page and the floating buttons sit above it.
    document.querySelectorAll('.pym-thumbbar').forEach(bar => bar.remove());
    if (model === 'thumb') {
      const bar = document.createElement('nav');
      bar.className = 'pym-thumbbar'; bar.setAttribute('aria-label', 'Accesos');
      bar.innerHTML = `<a href="${escape(pageHref('index.html'))}">Inicio</a><button type="button" data-thumb-menu aria-controls="${id}">Categorías</button><a href="${escape(pageHref('buscar.html'))}">Buscar</a><button type="button" data-cart-open>Bolsa <span data-cart-count>${escape(([...document.querySelectorAll('[data-cart-count]')].find(el => !el.closest('.pym-thumbbar')) || {}).textContent || '0')}</span></button>`;
      document.body.appendChild(bar);
      document.documentElement.style.setProperty('--pym-bottom-bar', '64px');
      bar.querySelector('[data-thumb-menu]').addEventListener('click', event => { event.stopPropagation(); toggleMount.querySelector('[data-store-menu-toggle]').click(); });
    } else document.documentElement.style.removeProperty('--pym-bottom-bar');
    // Overlay and split: the big photo follows the link under the pointer or the keyboard focus.
    if (swaps) panel.querySelectorAll('a[data-photo-for]').forEach(link => { const show = () => { const img = panel.querySelector('.pym-hero-photo img'); if (img) img.src = link.getAttribute('data-photo-for'); }; link.addEventListener('pointerenter', show); link.addEventListener('focus', show); });
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
    // The dock's buttons open the panel too, so they say whether it is open (minor M4).
    const openers = () => [toggle, ...tops, ...document.querySelectorAll('.pym-dock [data-dock]')];
    function close(returnFocus) {
      clearTimeout(openTimer); clearTimeout(closeTimer);
      if (panel.hidden) return;
      panel.hidden = true;
      openers().forEach(button => button.setAttribute('aria-expanded', 'false'));
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
      openers().forEach(button => button.setAttribute('aria-expanded', String(button === from)));
      storeMenuOpenState.host = host; storeMenuOpenState.close = close;
      if (mode === 'panel' && lockedFrom === null) { lockedFrom = document.documentElement.style.overflow; document.documentElement.style.overflow = 'hidden'; }
      if (mode === 'dropdown') unlock();
      // Search opens on its field; models that hide their tabs (dock, search) start on the first thing that can be used.
      const start = model === 'search' ? panel.querySelector('.pym-search input') : mode === 'panel' && !tabs[0]?.closest('[hidden]') ? tabs.find(tab => tab.getAttribute('aria-selected') === 'true') : focusable()[0];
      if (focus) start?.focus({ preventScroll: true });
    }
    toggle.addEventListener('click', () => (panel.hidden || panel.getAttribute('data-mode') !== 'panel' ? open('panel', 0, toggle, true) : close(true)));
    // Each top button opens its own group: direct page links (plain <a>) are not buttons, so the list index is not the group's.
    tops.forEach(top => {
      const index = Number(top.getAttribute('data-store-menu-top'));
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
    panel.addEventListener('click', event => { if (event.target.closest('[data-store-menu-close]')) { close(true); return; } if (event.target.closest('a[href]')) close(false); });
    panel.addEventListener('keydown', event => {
      if (event.key !== 'Tab' || panel.getAttribute('data-mode') !== 'panel') return;
      const items = focusable();
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
    // Always-visible menus and the dock (spec 2026-11-15): drawn once per render, outside the panel.
    document.querySelectorAll('.pym-circles,.pym-rail,.pym-dock').forEach(el => el.remove());
    if (model === 'circles' && !document.querySelector('[data-pagosya-checkout-page]')) {
      const row = document.createElement('nav');
      row.className = 'pym-circles'; row.setAttribute('aria-label', 'Categorías');
      row.innerHTML = storeMenuCategories().map(category => ({ category, image: storeMenuLinkPhoto('category:' + category.id), target: storeMenuTarget('category:' + category.id) }))
        .filter(entry => entry.image && entry.target).map(entry => `<a href="${escape(entry.target.href)}"><img src="${escape(entry.image)}" alt="" loading="lazy"><span>${escape(String(entry.category.name).slice(0, 28))}</span></a>`).join('');
      if (row.children.length) host.after(row);
    }
    if (model === 'rail') {
      const aside = document.createElement('aside');
      aside.className = 'pym-rail'; aside.setAttribute('aria-label', 'Menú');
      const logo = host.querySelector('[data-nav-logo]');
      aside.innerHTML = (logo ? `<div class="pym-rail-logo">${logo.outerHTML}</div>` : '') + `<ul class="pym-links">${groups[0].links.map(link => `<li><a href="${escape(link.href)}">${escape(link.label)}</a></li>`).join('')}</ul>` + (extras ? `<div class="pym-extras">${extras}</div>` : '');
      document.body.prepend(aside);
    }
    if (model === 'dock') {
      const dock = document.createElement('nav');
      dock.className = 'pym-dock'; dock.setAttribute('aria-label', 'Menú');
      dock.innerHTML = groups.map((group, index) => `<button type="button" data-dock="${index}" aria-controls="${id}" aria-expanded="false">${escape(group.label)}</button>`).join('');
      dock.querySelectorAll('[data-dock]').forEach(button => button.addEventListener('click', event => {
        event.stopPropagation();
        const index = Number(button.getAttribute('data-dock'));
        if (!panel.hidden && panes[index] && !panes[index].hidden) close(true); else open('panel', index, button, true);
      }));
      document.body.appendChild(dock);
    }
    host.__pagosyaStoreMenu = { close, panel };
  }
  function renderStoreMenus() {
    const menu = storeMenuConfig();
    // Bars drawn outside the header go with every render, so a menu turned off (or left with no groups) leaves none behind (M5).
    document.querySelectorAll('.pym-circles,.pym-rail,.pym-dock,.pym-thumbbar').forEach(el => el.remove());
    document.querySelectorAll('[data-pagosya-store-menu="toggle"]').forEach(mount => {
      const host = mount.closest('header') || mount.parentElement;
      if (host.__pagosyaStoreMenu) { host.__pagosyaStoreMenu.close(false); host.__pagosyaStoreMenu.panel.remove(); host.__pagosyaStoreMenu = null; }
      // Owner 2026-11-16 («the menu… created by the model»): a header that brings its own menu (NavShell menu) keeps it.
      if (!menu || host.matches?.('[data-own-menu]')) return;
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
