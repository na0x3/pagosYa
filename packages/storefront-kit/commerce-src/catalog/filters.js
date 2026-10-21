  /* Sort & filter (spec 2026-10-19 showcase commerce §4): only on full catalog pages with 6 or more products; a filter appears
   * only when the store's data has it; the state lives in the URL so a filtered page can be shared and the back button works. */
  const filterFold = text => String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const SORTS = [['destacados', 'Destacados'], ['precio-asc', 'Precio ↑'], ['precio-desc', 'Precio ↓'], ['novedades', 'Novedades'], ['mejor-oferta', 'Mejor oferta']];
  const FILTER_TOGGLES = ['descuento', 'disponible', 'ofertas'];
  /** Search (amendment 2026-10-21): the words of a query, folded; the catalogue and buscar.html match with the same rule —
   *  every word in the product's name, description, tags or category name, case and accents ignored. */
  function searchWords(text) { return filterFold(String(text || '').slice(0, 80)).split(/\s+/).filter(Boolean); }
  function matchesSearch(item, words) {
    if (!words.length) return true;
    const category = (Array.isArray(store.categories) ? store.categories : []).find(c => c && c.id === item.categoryId)?.name;
    const haystack = filterFold([item.name, item.description, ...(Array.isArray(item.tags) ? item.tags : []), category].filter(Boolean).join(' '));
    return words.every(word => haystack.includes(word));
  }
  function filterGroups(items) {
    const groups = [];
    const cats = (store.categories || []).filter(c => items.some(p => p.categoryId === c.id));
    if (cats.length > 1) groups.push({ key: 'categoria', label: 'Categoría', kind: 'check', values: cats.map(c => ({ value: filterFold(c.id), text: c.name })) });
    const prices = items.map(p => price(p));
    if (Math.min(...prices) < Math.max(...prices)) groups.push({ key: 'precio', label: 'Precio', kind: 'range', values: [Math.min(...prices), Math.max(...prices)] });
    const options = new Map();
    for (const p of items) for (const g of optionGroups(p) || []) {
      const key = filterFold(g.name);
      const entry = options.get(key) || { key, label: g.name.charAt(0).toUpperCase() + g.name.slice(1).toLowerCase(), values: new Map() };
      for (const value of g.values) if (!entry.values.has(filterFold(value))) entry.values.set(filterFold(value), { value: filterFold(value), text: value, color: swatchColor(g.name, value) });
      options.set(key, entry);
    }
    for (const entry of options.values()) groups.push({ key: entry.key, label: entry.label, kind: [...entry.values.values()].some(v => v.color) ? 'swatch' : 'check', values: [...entry.values.values()] });
    if (items.some(p => !isMembership(p) && price(p) < p.amount)) groups.push({ key: 'descuento', label: 'Con descuento', kind: 'toggle', values: [] });
    if (items.some(p => p.stock === 0) && items.some(p => p.stock !== 0)) groups.push({ key: 'disponible', label: 'Disponible', kind: 'toggle', values: [] });
    if (items.some(p => offerOptions(p, undefined).length)) groups.push({ key: 'ofertas', label: 'Packs y suscripción', kind: 'toggle', values: [] });
    return groups;
  }
  /** The query the page last wrote, kept in memory too: in the Studio preview the frame's address cannot change, and a typed
   *  search or a chosen chip was read back from the old address and lost (live check 2026-10-21, NOA VARGAS rev 8). */
  let filterQuery = null;
  function readFilterState() {
    const params = new URLSearchParams(filterQuery ?? (window.PAGOSYA_PREVIEW_QUERY || location.search));
    const state = { orden: SORTS.some(([v]) => v === params.get('orden')) ? params.get('orden') : 'destacados', precio: null, sets: {}, toggles: new Set(), q: (params.get('q') || '').slice(0, 80) };
    const range = /^(\d+)-(\d+)$/.exec(params.get('precio') || '');
    if (range) state.precio = [Number(range[1]) * 100, Number(range[2]) * 100];
    for (const [key, value] of params) if (key.startsWith('f_')) state.sets[filterFold(key.slice(2))] = value.split(',').map(filterFold).filter(Boolean);
    for (const key of FILTER_TOGGLES) if (params.get(key) === '1') state.toggles.add(key);
    return state;
  }
  function writeFilterState(state) {
    const params = new URLSearchParams(filterQuery ?? (window.PAGOSYA_PREVIEW_QUERY || location.search));
    [...params.keys()].filter(k => k.startsWith('f_') || ['orden', 'precio', 'q', ...FILTER_TOGGLES].includes(k)).forEach(k => params.delete(k));
    if (state.q && state.q.trim()) params.set('q', state.q.slice(0, 80));
    if (state.orden !== 'destacados') params.set('orden', state.orden);
    if (state.precio) params.set('precio', `${Math.floor(state.precio[0] / 100)}-${Math.ceil(state.precio[1] / 100)}`);
    for (const [key, values] of Object.entries(state.sets)) if (values.length) params.set(`f_${key}`, values.join(','));
    for (const key of state.toggles) params.set(key, '1');
    filterQuery = params.toString() ? `?${params}` : '';
    try { history.replaceState(history.state, '', `${location.pathname}${filterQuery}${location.hash}`); } catch { /* sandboxed previews keep it in memory */ }
  }
  function applyFilters(items, state) {
    const words = searchWords(state.q);
    return items.filter(p => {
      if (!matchesSearch(p, words)) return false;
      if (state.precio && (price(p) < state.precio[0] || price(p) > state.precio[1])) return false;
      if (state.toggles.has('descuento') && !(price(p) < p.amount)) return false;
      if (state.toggles.has('disponible') && p.stock === 0) return false;
      if (state.toggles.has('ofertas') && !offerOptions(p, undefined).length) return false;
      for (const [key, values] of Object.entries(state.sets)) {
        if (!values.length) continue;
        if (key === 'categoria') { if (!values.includes(filterFold(p.categoryId))) return false; continue; }
        const group = (optionGroups(p) || []).find(g => filterFold(g.name) === key);
        if (!group || !group.values.some(v => values.includes(filterFold(v)))) return false;
      }
      return true;
    });
  }
  function sortItems(items, order) {
    const saving = p => p.amount - Math.min(price(p), ...offerOptions(p, undefined).map(o => o.perUnit));
    const list = [...items];
    if (order === 'precio-asc') list.sort((a, b) => price(a) - price(b));
    if (order === 'precio-desc') list.sort((a, b) => price(b) - price(a));
    if (order === 'novedades') list.sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0));
    if (order === 'mejor-oferta') list.sort((a, b) => saving(b) - saving(a));
    return list;
  }
  /* Sort & filter styles (spec 2026-10-21): three finished styles over the same state — `bar` (top row + drawer), `chips` (the
   * John Smedley explorer: category and option chip rows, price and switches in «Más filtros») and `sidebar` (collapsible groups
   * beside the grid; the drawer under 900 px). Every control edits the state directly (read → change → write → render). */
  const FILTER_STYLES = ['bar', 'chips', 'sidebar'];
  let filtersDrawerOpen = false, filtersLockedFrom = null, filtersOpener = null;
  const filterStyleFor = (all, groups) => FILTER_STYLES.includes(config.filterStyle) ? config.filterStyle : all.length >= 9 || groups.length >= 3 ? 'sidebar' : 'bar';
  const productsWord = n => `${n} ${n === 1 ? 'producto' : 'productos'}`;
  function filtersMarkup(all, state, shown) {
    const groups = filterGroups(all);
    const style = filterStyleFor(all, groups);
    const chosen = key => state.sets[key] || [];
    const chip = (g, v) => `<button type="button" class="cf-chip"${v.color ? ' data-swatch-chip' : ''} data-filter-chip="${escape(g.key)}:${escape(v.value)}" aria-pressed="${chosen(g.key).includes(v.value)}">${v.color ? `<span data-swatch style="--swatch:${escape(v.color)}" aria-hidden="true"></span>` : ''}<span>${escape(v.text)}</span></button>`;
    const range = g => {
      const lo = Math.floor(g.values[0] / 100), hi = Math.ceil(g.values[1] / 100);
      const a = Math.floor((state.precio?.[0] ?? g.values[0]) / 100), b = Math.ceil((state.precio?.[1] ?? g.values[1]) / 100);
      return `<div class="cf-range" data-filter-range data-lo="${lo}" data-hi="${hi}"><p class="cf-range__values"><output data-range-out="min">Bs ${a}</output><span aria-hidden="true">–</span><output data-range-out="max">Bs ${b}</output></p>`
        + `<input type="range" name="precio-min" min="${lo}" max="${hi}" step="1" value="${a}" aria-label="Precio desde"><input type="range" name="precio-max" min="${lo}" max="${hi}" step="1" value="${b}" aria-label="Precio hasta"></div>`;
    };
    const toggle = g => `<button type="button" class="cf-switch" role="switch" data-filter-toggle="${escape(g.key)}" aria-checked="${state.toggles.has(g.key)}"><span class="cf-switch__track" aria-hidden="true"></span><span>${escape(g.label)}</span></button>`;
    const body = g => g.kind === 'range' ? range(g) : g.kind === 'toggle' ? toggle(g) : `<div class="cf-chips" role="group" aria-label="${escape(g.label)}">${g.values.map(v => chip(g, v)).join('')}</div>`;
    const title = g => g.kind === 'range' ? 'Precio' : g.label;
    const section = g => g.kind === 'toggle' ? `<div class="cf-group cf-group--toggle" data-filter-group="${escape(g.key)}">${body(g)}</div>` : `<section class="cf-group" data-filter-group="${escape(g.key)}"><h3 class="cf-group__title">${escape(title(g))}</h3>${body(g)}</section>`;
    const textOf = (key, value) => groups.find(g => g.key === key)?.values?.find?.(v => v.value === value)?.text || value;
    const active = [...(state.q ? [['q', '', `“${state.q}”`]] : []), ...Object.entries(state.sets).flatMap(([key, values]) => values.map(value => [key, value, textOf(key, value)])), ...[...state.toggles].map(key => [key, '', groups.find(g => g.key === key)?.label || key]), ...(state.precio ? [['precio', '', 'Precio']] : [])];
    const filterCount = active.filter(([key]) => key !== 'q').length;
    const sortLabel = (SORTS.find(([value]) => value === state.orden) || SORTS[0])[1];
    const sort = `<div class="cf-sort"><button type="button" class="cf-sort__toggle" data-sort-toggle aria-haspopup="listbox" aria-expanded="false" aria-controls="cf-sort-list">Ordenar: <strong>${escape(sortLabel)}</strong><span class="cf-caret" aria-hidden="true"></span></button>`
      + `<ul class="cf-sort__list" id="cf-sort-list" role="listbox" aria-label="Ordenar" hidden>${SORTS.map(([value, text]) => `<li role="option" tabindex="-1" data-sort="${value}" aria-selected="${state.orden === value}">${escape(text)}</li>`).join('')}</ul></div>`;
    const search = `<div class="catalog-search" role="search"><label class="catalog-search__label" for="catalog-q">Buscar productos</label><span class="catalog-search__icon" aria-hidden="true"></span><input id="catalog-q" type="search" name="q" maxlength="80" autocomplete="off" placeholder="Buscar en la tienda" value="${escape(state.q || '')}">${state.q ? '<button type="button" class="catalog-search__clear" data-search-clear aria-label="Borrar búsqueda">✕</button>' : ''}</div>`;
    const count = `<p class="catalog-filters__count" aria-live="polite">${productsWord(shown)}</p>`;
    const activeRow = active.length ? `<p class="catalog-filters__active">${active.map(([key, value, text]) => `<button type="button" data-filter-remove="${escape(key)}:${escape(value)}" aria-label="Quitar ${escape(text)}">${escape(text)} <span aria-hidden="true">✕</span></button>`).join('')}<button type="button" class="cf-link" data-filters-clear>Borrar todo</button></p>` : '';
    const opener = label => `<button type="button" class="cf-open" data-filters-open aria-expanded="${filtersDrawerOpen}" aria-controls="cf-drawer">${escape(label)}${filterCount ? ` (${filterCount})` : ''}</button>`;
    const drawer = (list, label) => list.length ? `<div class="cf-drawer" id="cf-drawer" data-filters-drawer role="dialog" aria-modal="true" aria-label="${escape(label)}"${filtersDrawerOpen ? '' : ' hidden'}><div class="cf-drawer__panel"><div class="cf-drawer__head"><h2>${escape(label)}</h2><button type="button" class="cf-drawer__close" data-filters-close aria-label="Cerrar">✕</button></div><div class="cf-drawer__body">${list.map(section).join('')}</div><div class="cf-drawer__foot"><button type="button" class="cf-link" data-filters-clear>Borrar todo</button><button type="button" class="cf-done" data-filters-done>Ver ${productsWord(shown)}</button></div></div></div>` : '';
    let inner;
    if (style === 'chips') {
      const cat = groups.find(g => g.key === 'categoria');
      const options = groups.filter(g => g.key !== 'categoria' && (g.kind === 'check' || g.kind === 'swatch'));
      const more = groups.filter(g => g.kind === 'range' || g.kind === 'toggle');
      const catRow = cat ? `<div class="catalog-filters__row catalog-filters__row--categories" data-filter-group="categoria" role="group" aria-label="${escape(cat.label)}"><button type="button" class="cf-chip cf-chip--plain" data-filter-chip="categoria:" aria-pressed="${!chosen('categoria').length}">Todo</button>${cat.values.map(v => chip(cat, v).replace('class="cf-chip"', 'class="cf-chip cf-chip--plain"')).join('')}</div>` : '';
      const optionRow = options.length ? `<div class="catalog-filters__row catalog-filters__row--options">${options.map(g => `<div class="cf-chips" data-filter-group="${escape(g.key)}" role="group" aria-label="${escape(g.label)}">${g.values.map(v => chip(g, v)).join('')}</div>`).join('')}</div>` : '';
      inner = `${search}<div class="catalog-filters__top">${catRow}${sort}</div>${optionRow}<div class="catalog-filters__bar">${count}${more.length ? opener('Más filtros') : ''}</div>${activeRow}${drawer(more, 'Más filtros')}`;
    } else if (style === 'sidebar') {
      const details = g => g.kind === 'toggle' ? `<div class="cf-group cf-group--toggle" data-filter-group="${escape(g.key)}">${toggle(g)}</div>`
        : `<details class="cf-group" data-filter-group="${escape(g.key)}" open><summary>${escape(title(g))}${chosen(g.key).length ? ` · ${chosen(g.key).length}` : ''}<span class="cf-caret" aria-hidden="true"></span></summary>${body(g)}</details>`;
      // On desktop the sidebar takes a fixed left column of the catalogue and its groups stay in view as the products scroll;
      // a grid row span left the products ~2300 px below it (final review 2026-10-21).
      inner = `${search}<aside class="catalog-filters__side" aria-label="Filtros"><div class="catalog-filters__side-inner">${groups.map(details).join('')}${filterCount ? '<button type="button" class="cf-link" data-filters-clear="filters">Borrar filtros</button>' : ''}</div></aside>`
        + `<div class="catalog-filters__bar">${count}${opener('Filtrar')}${sort}</div>${activeRow}${drawer(groups, 'Filtrar')}`;
    } else {
      inner = `${search}<div class="catalog-filters__bar">${count}${sort}${groups.length ? opener('Filtrar') : ''}</div>${activeRow}${drawer(groups, 'Filtrar')}`;
    }
    return `<div class="catalog-filters" data-filter-style="${style}">${inner}</div>`;
  }
  /** The search field filters as the shopper types (150 ms after the last key); Esc and ✕ clear it. */
  let searchTimer = 0;
  const setSearch = value => { clearTimeout(searchTimer); const state = readFilterState(); state.q = String(value || '').slice(0, 80); writeFilterState(state); render(); };
  /** A value inside a double-quoted attribute selector (CSS.escape is missing in some runtimes). */
  const attrValue = value => String(value).replace(/["\\]/g, '\\$&');
  const filterControl = selector => document.querySelector(`.catalog-filters ${selector}`);
  /** Writes a changed state, redraws, and gives the focus back to the control that was used (the redraw replaced it). */
  function applyFilterChange(state, focusSelector) {
    writeFilterState(state);
    render();
    if (focusSelector) filterControl(focusSelector)?.focus({ preventScroll: true });
  }
  const drawerFocusable = drawer => [...drawer.querySelectorAll('button:not([disabled]),input,[tabindex="0"],summary')].filter(el => !el.closest('[hidden]'));
  function openFiltersDrawer(opener) {
    const drawer = document.querySelector('[data-filters-drawer]');
    if (!drawer) return;
    filtersDrawerOpen = true; filtersOpener = opener;
    drawer.hidden = false;
    document.querySelectorAll('[data-filters-open]').forEach(button => button.setAttribute('aria-expanded', 'true'));
    if (filtersLockedFrom === null) { filtersLockedFrom = document.documentElement.style.overflow; document.documentElement.style.overflow = 'hidden'; }
    drawerFocusable(drawer)[0]?.focus({ preventScroll: true });
  }
  function closeFiltersDrawer(returnFocus) {
    filtersDrawerOpen = false;
    const drawer = document.querySelector('[data-filters-drawer]');
    if (drawer) drawer.hidden = true;
    document.querySelectorAll('[data-filters-open]').forEach(button => button.setAttribute('aria-expanded', 'false'));
    if (filtersLockedFrom !== null) { document.documentElement.style.overflow = filtersLockedFrom; filtersLockedFrom = null; }
    if (returnFocus) (document.querySelector('[data-filters-open]') || filtersOpener)?.focus({ preventScroll: true });
  }
  function setSortOpen(open) {
    const list = document.querySelector('.cf-sort__list'), toggle = document.querySelector('[data-sort-toggle]');
    if (!list || !toggle) return;
    list.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    if (open) (list.querySelector('[aria-selected="true"]') || list.querySelector('[role=option]'))?.focus({ preventScroll: true });
  }
  function pickSort(value) {
    const state = readFilterState();
    state.orden = SORTS.some(([v]) => v === value) ? value : 'destacados';
    applyFilterChange(state, '[data-sort-toggle]');
  }
  document.addEventListener('input', event => {
    const target = event.target;
    if (target?.matches?.('.catalog-search input[name=q]')) {
      const value = target.value;
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => setSearch(value), 150);
      return;
    }
    // The price range shows its numbers while it is dragged; the products follow on release (`change`).
    const range = target?.closest?.('[data-filter-range]');
    if (range) for (const name of ['min', 'max']) { const out = range.querySelector(`[data-range-out="${name}"]`), input = range.querySelector(`input[name="precio-${name}"]`); if (out && input) out.textContent = `Bs ${input.value}`; }
  });
  document.addEventListener('change', event => {
    const range = event.target?.closest?.('[data-filter-range]');
    if (!range) return;
    let a = Number(range.querySelector('input[name="precio-min"]').value), b = Number(range.querySelector('input[name="precio-max"]').value);
    if (a > b) [a, b] = [b, a];
    const state = readFilterState();
    state.precio = a <= Number(range.dataset.lo) && b >= Number(range.dataset.hi) ? null : [a * 100, b * 100];
    applyFilterChange(state, `[data-filter-range] input[name="${event.target.name}"]`);
  });
  document.addEventListener('click', event => {
    const target = event.target;
    if (target?.closest?.('[data-search-clear]')) { setSearch(''); return; }
    const chipButton = target?.closest?.('[data-filter-chip]');
    if (chipButton) {
      const raw = chipButton.dataset.filterChip, at = raw.indexOf(':'), key = raw.slice(0, at), value = raw.slice(at + 1);
      const state = readFilterState(), single = key === 'categoria' && chipButton.closest('.catalog-filters__row--categories');
      const current = state.sets[key] || [];
      state.sets[key] = !value ? [] : single ? (current.length === 1 && current[0] === value ? [] : [value]) : current.includes(value) ? current.filter(v => v !== value) : [...current, value];
      applyFilterChange(state, `[data-filter-chip="${attrValue(raw)}"]`);
      return;
    }
    const switchButton = target?.closest?.('[data-filter-toggle]');
    if (switchButton) {
      const state = readFilterState(), key = switchButton.dataset.filterToggle;
      if (state.toggles.has(key)) state.toggles.delete(key); else state.toggles.add(key);
      applyFilterChange(state, `[data-filter-toggle="${attrValue(key)}"]`);
      return;
    }
    if (target?.closest?.('[data-sort-toggle]')) { setSortOpen(document.querySelector('.cf-sort__list')?.hidden !== false); return; }
    const option = target?.closest?.('.cf-sort__list [data-sort]');
    if (option) { pickSort(option.dataset.sort); return; }
    if (!target?.closest?.('.cf-sort')) setSortOpen(false);
    if (target?.closest?.('[data-filters-open]')) { if (filtersDrawerOpen) closeFiltersDrawer(true); else openFiltersDrawer(target.closest('[data-filters-open]')); return; }
    if (target?.closest?.('[data-filters-close],[data-filters-done]') || target?.matches?.('[data-filters-drawer]')) closeFiltersDrawer(true);
  });
  document.addEventListener('keydown', event => {
    const target = event.target;
    if (event.key === 'Escape' && target?.matches?.('.catalog-search input[name=q]') && target.value) { event.preventDefault(); setSearch(''); return; }
    const list = document.querySelector('.cf-sort__list');
    if (list && !list.hidden) {
      const options = [...list.querySelectorAll('[role=option]')], at = options.indexOf(document.activeElement);
      if (event.key === 'Escape') { event.preventDefault(); setSortOpen(false); document.querySelector('[data-sort-toggle]')?.focus({ preventScroll: true }); return; }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); options[Math.max(0, Math.min(options.length - 1, at + (event.key === 'ArrowDown' ? 1 : -1)))]?.focus(); return; }
      if ((event.key === 'Enter' || event.key === ' ') && at >= 0) { event.preventDefault(); pickSort(options[at].dataset.sort); return; }
    }
    if (!filtersDrawerOpen) return;
    if (event.key === 'Escape') { event.preventDefault(); closeFiltersDrawer(true); return; }
    const drawer = document.querySelector('[data-filters-drawer]');
    if (event.key === 'Tab' && drawer && drawer.contains(target)) {
      const items = drawerFocusable(drawer), first = items[0], last = items[items.length - 1];
      if (event.shiftKey && target === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && target === last) { event.preventDefault(); first?.focus(); }
    }
  });
  window.addEventListener('pagehide', () => { if (filtersDrawerOpen) closeFiltersDrawer(false); });
