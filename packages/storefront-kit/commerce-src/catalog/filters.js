  /* Sort & filter (spec 2026-10-19 showcase commerce §4): only on full catalog pages with 6 or more products; a filter appears
   * only when the store's data has it; the state lives in the URL so a filtered page can be shared and the back button works. */
  const filterFold = text => String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const SORTS = [['destacados', 'Destacados'], ['precio-asc', 'Precio ↑'], ['precio-desc', 'Precio ↓'], ['novedades', 'Novedades'], ['mejor-oferta', 'Mejor oferta']];
  const FILTER_TOGGLES = ['descuento', 'disponible', 'ofertas'];
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
  function readFilterState() {
    const params = new URLSearchParams(window.PAGOSYA_PREVIEW_QUERY || location.search);
    const state = { orden: SORTS.some(([v]) => v === params.get('orden')) ? params.get('orden') : 'destacados', precio: null, sets: {}, toggles: new Set() };
    const range = /^(\d+)-(\d+)$/.exec(params.get('precio') || '');
    if (range) state.precio = [Number(range[1]) * 100, Number(range[2]) * 100];
    for (const [key, value] of params) if (key.startsWith('f_')) state.sets[filterFold(key.slice(2))] = value.split(',').map(filterFold).filter(Boolean);
    for (const key of FILTER_TOGGLES) if (params.get(key) === '1') state.toggles.add(key);
    return state;
  }
  function writeFilterState(state) {
    const params = new URLSearchParams(location.search);
    [...params.keys()].filter(k => k.startsWith('f_') || ['orden', 'precio', ...FILTER_TOGGLES].includes(k)).forEach(k => params.delete(k));
    if (state.orden !== 'destacados') params.set('orden', state.orden);
    if (state.precio) params.set('precio', `${Math.floor(state.precio[0] / 100)}-${Math.ceil(state.precio[1] / 100)}`);
    for (const [key, values] of Object.entries(state.sets)) if (values.length) params.set(`f_${key}`, values.join(','));
    for (const key of state.toggles) params.set(key, '1');
    try { history.replaceState(history.state, '', `${location.pathname}${params.toString() ? `?${params}` : ''}${location.hash}`); } catch { /* sandboxed previews */ }
  }
  function applyFilters(items, state) {
    return items.filter(p => {
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
  function filtersMarkup(all, state, shown) {
    const groups = filterGroups(all);
    const control = g => g.kind === 'range'
      ? `<fieldset data-filter-group="precio"><legend>Precio (Bs)</legend><label>Desde <input type="number" name="precio-min" min="0" inputmode="numeric" value="${Math.floor((state.precio?.[0] ?? g.values[0]) / 100)}"></label><label>Hasta <input type="number" name="precio-max" min="0" inputmode="numeric" value="${Math.ceil((state.precio?.[1] ?? g.values[1]) / 100)}"></label></fieldset>`
      : g.kind === 'toggle' ? `<label class="catalog-filters__toggle" data-filter-group="${escape(g.key)}"><input type="checkbox" name="${escape(g.key)}" ${state.toggles.has(g.key) ? 'checked' : ''}> ${escape(g.label)}</label>`
      : `<fieldset data-filter-group="${escape(g.key)}"><legend>${escape(g.label)}</legend>${g.values.map(v => `<label><input type="checkbox" name="f_${escape(g.key)}" value="${escape(v.value)}" ${(state.sets[g.key] || []).includes(v.value) ? 'checked' : ''}>${v.color ? `<span data-swatch style="--swatch:${escape(v.color)}" aria-hidden="true"></span>` : ''} ${escape(v.text)}</label>`).join('')}</fieldset>`;
    const textOf = (key, value) => groups.find(g => g.key === key)?.values?.find?.(v => v.value === value)?.text || value;
    const active = [...Object.entries(state.sets).flatMap(([key, values]) => values.map(value => [key, value, textOf(key, value)])), ...[...state.toggles].map(key => [key, '', groups.find(g => g.key === key)?.label || key]), ...(state.precio ? [['precio', '', 'Precio']] : [])];
    const layout = all.length >= 9 || groups.length >= 3 ? 'sidebar' : 'bar';
    return `<div class="catalog-filters" data-filters-layout="${layout}"><button type="button" class="catalog-filters__open" data-filters-open aria-expanded="false">Filtrar${active.length ? ` (${active.length})` : ''}</button>`
      + `<label class="catalog-filters__sort">Ordenar <select name="orden">${SORTS.map(([value, text]) => `<option value="${value}" ${state.orden === value ? 'selected' : ''}>${text}</option>`).join('')}</select></label>`
      + (groups.length ? `<form class="catalog-filters__panel" data-filters-form>${groups.map(control).join('')}<button type="submit" class="catalog-filters__apply">Ver ${shown} productos</button></form>` : '')
      + (active.length ? `<p class="catalog-filters__active">${active.map(([key, value, text]) => `<button type="button" data-filter-remove="${escape(key)}:${escape(value)}" aria-label="Quitar ${escape(text)}">${escape(text)} ✕</button>`).join('')}<button type="button" data-filters-clear>Borrar todo</button></p>` : '')
      + `<p class="catalog-filters__count" aria-live="polite">${shown} ${shown === 1 ? 'producto' : 'productos'}</p></div>`;
  }
  /** Reads the controls back into a state (every change applies at once; the phone sheet's button only closes it). */
  function filterStateFromControls(root) {
    const state = { orden: root.querySelector('select[name=orden]')?.value || 'destacados', precio: null, sets: {}, toggles: new Set() };
    for (const input of root.querySelectorAll('input[type=checkbox]:checked')) {
      if (input.name.startsWith('f_')) (state.sets[input.name.slice(2)] ||= []).push(input.value);
      else if (FILTER_TOGGLES.includes(input.name)) state.toggles.add(input.name);
    }
    const min = root.querySelector('input[name="precio-min"]'), max = root.querySelector('input[name="precio-max"]');
    const range = filterGroups(products()).find(g => g.kind === 'range')?.values;
    if (min && max && range && (Number(min.value) * 100 > range[0] || Number(max.value) * 100 < range[1])) state.precio = [Math.max(0, Number(min.value) || 0) * 100, Math.max(0, Number(max.value) || 0) * 100];
    return state;
  }
  document.addEventListener('change', event => {
    const root = event.target?.closest?.('.catalog-filters');
    if (!root) return;
    writeFilterState(filterStateFromControls(root));
    render();
  });
  document.addEventListener('submit', event => {
    const form = event.target?.closest?.('[data-filters-form]');
    if (!form) return;
    event.preventDefault();
    form.closest('.catalog-filters')?.removeAttribute('data-open');
  });
