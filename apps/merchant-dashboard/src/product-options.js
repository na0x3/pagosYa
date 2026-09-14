/* Shared by the dashboard and Studio. Amounts in this editor are decimal Bs;
 * the API boundary converts them to integer minor units. */
/** @typedef {import('./product-options').VariantDraft} VariantDraft */
/** @typedef {import('./product-options').VariantInput} VariantInput */
/** @typedef {{name:string, values:string[]}} OptionGroup */
/** @typedef {{name:string, value:string}} OptionValue */
(() => {
  const MAX_GROUPS = 6, MAX_VARIANTS = 256;
  /** @param {unknown} value */
  const key = value => String(value).trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  /** @param {unknown} value */
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] || c);
  /** @param {OptionValue[]} options */
  const identity = options => JSON.stringify(options.map(o => [key(o.name), key(o.value)]).sort((a, b) => a[0].localeCompare(b[0])));
  /** @param {OptionGroup[]} groups @param {VariantDraft[]} previous @param {string} price @returns {VariantDraft[]} */
  function combinations(groups, previous = [], price = '') {
    if (!groups.length || groups.length > MAX_GROUPS) throw Error(`Añade entre 1 y ${MAX_GROUPS} opciones.`);
    const names = new Set();
    const clean = groups.map(group => {
      const name = group.name.trim();
      const values = group.values.map(v => v.trim()).filter(Boolean);
      if (!name || name.length > 40 || names.has(key(name))) throw Error('Cada opción necesita un nombre distinto, de hasta 40 caracteres.');
      names.add(key(name));
      if (!values.length || values.some(v => v.length > 40) || new Set(values.map(key)).size !== values.length) throw Error(`Revisa los valores de ${name}: no pueden estar vacíos ni repetidos y admiten hasta 40 caracteres.`);
      return { name, values };
    });
    if (clean.reduce((n, group) => n * group.values.length, 1) > MAX_VARIANTS) throw Error(`Estas opciones superan las ${MAX_VARIANTS} combinaciones. Reduce los valores antes de generarlas.`);
    const old = new Map(previous.filter(v => v.options?.length).map(v => [identity(v.options || []), v]));
    return clean.reduce((rows, group) => rows.flatMap(row => group.values.map(value => [...row, { name: group.name, value }])), /** @type {OptionValue[][]} */ ([[]])).map(options => {
      const name = options.map(o => o.value).join(' / ');
      const prior = old.get(identity(options)) || (clean.length === 1 ? previous.find(v => !v.options?.length && key(v.name) === key(name)) : undefined);
      return { ...(prior || { amount: price, stock: '0' }), name, options };
    });
  }
  /** @param {VariantDraft[]} rows @returns {VariantInput[]} */
  function serialize(rows) {
    if (!rows.length) throw Error('Genera las combinaciones antes de guardar.');
    const shared = rows.filter(v => v.legacySharedStock && v.stock === '');
    if (shared.length && shared.length !== rows.length) throw Error('Asigna stock a todas las combinaciones para dejar de usar stock compartido.');
    return rows.map(row => {
      const amount = Number(row.amount);
      const stock = row.stock === '' || row.stock == null ? null : Number(row.stock);
      if (String(row.amount).trim() === '' || !Number.isFinite(amount) || amount < 0 || Math.round(amount * 100) > 2147483647) throw Error(`Revisa el precio de ${row.name}.`);
      if (stock !== null && (!Number.isInteger(stock) || stock < 0 || stock > 1000000)) throw Error(`Revisa el stock de ${row.name}.`);
      return { ...(row.id ? { id: row.id } : {}), name: row.name, amount: Math.round(amount * 100), ...(row.id && !row.stockDirty || row.legacySharedStock && row.stock === '' ? {} : { stock }), ...(row.options?.length ? { options: row.options } : {}), ...(row.imageUrl ? { imageUrl: row.imageUrl } : row.imageDirty ? { imageUrl: null } : {}) };
    });
  }
  /** @param {HTMLElement} host @param {import('./product-options').EditorConfig} config */
  function mount(host, config = {}) {
    let rows = structuredClone(config.variants || []), dirty = false, proposed = false;
    const first = rows[0]?.options;
    let groups = first?.length ? first.map((o, i) => ({ name: o.name, values: [...new Set(rows.map(v => v.options?.[i]?.value).filter(value => typeof value === 'string'))] }))
      : rows.length ? [{ name: 'Versión', values: rows.map(v => v.name) }] : [{ name: '', values: [] }];
    host.classList.add('variant-editor');
    host.innerHTML = `<header><h3>Opciones y combinaciones</h3><p>Define lo que el cliente elige: color, talla, material, sabor o cualquier otra opción.</p></header><div data-groups></div><div class="ve-actions"><button type="button" data-group-add>Añadir opción</button><button type="button" data-generate>Generar combinaciones</button></div><p class="ve-help">Hasta ${MAX_GROUPS} opciones y ${MAX_VARIANTS} combinaciones. Las nuevas empiezan con stock 0 para que las revises.</p><p data-error role="alert" hidden></p><section data-matrix hidden><div class="ve-matrix-heading"><h4 data-count></h4><label>Buscar combinación<input type="search" data-search placeholder="Ej. Azul S"></label></div><p class="ve-help">Cada fila tiene su propio stock. 0 = agotado; vacío = sin límite.</p><div class="ve-bulk"><label>Precio (Bs)<input data-bulk-price type="number" min="0" step="0.01" placeholder="Sin cambio"></label><label>Stock<input data-bulk-stock type="number" min="0" max="1000000" step="1" placeholder="Sin cambio"></label><button type="button" data-bulk>Aplicar a filas visibles</button></div><div data-rows></div><p data-empty hidden>No hay combinaciones con esa búsqueda.</p></section>`;
    /** @param {string} selector */
    const $ = selector => /** @type {HTMLInputElement} */ (host.querySelector(selector));
    const error = $('[data-error]');
    /** @param {string} message */
    const fail = message => { error.textContent = message; error.hidden = !message; };
    const updateCount = () => { $('[data-count]').textContent = `${rows.length} combinaciones · ${rows.filter(r => r.stock === '' || r.stock == null || Number(r.stock) > 0).length} disponibles`; };
    const notify = () => { updateCount(); config.onChange?.(structuredClone(rows)); };
    const markDirty = () => { dirty = true; proposed = false; $('[data-generate]').textContent = 'Generar combinaciones'; };
    function drawGroups() {
      $('[data-groups]').innerHTML = groups.map((group, index) => `<div class="ve-group"><label>Opción ${index + 1}<input data-group-name="${index}" maxlength="40" value="${esc(group.name)}" placeholder="Ej. Color"></label><label>Valores, separados por comas<input data-group-values="${index}" value="${esc(group.values.join(', '))}" placeholder="Ej. Azul, Blanco, Negro"></label><button type="button" data-group-remove="${index}" aria-label="Quitar opción ${index + 1}">Quitar</button></div>`).join('');
      $('[data-group-add]').disabled = groups.length >= MAX_GROUPS;
    }
    function visible() {
      const terms = key($('[data-search]').value).split(/\s+/).filter(Boolean);
      return rows.map((row, index) => ({ row, index })).filter(({ row }) => terms.every(term => key(row.name).includes(term)));
    }
    function drawRows() {
      const list = visible();
      const photos = config.photos?.() || [];
      $('[data-matrix]').hidden = !rows.length;
      updateCount();
      $('[data-empty]').hidden = list.length > 0;
      $('[data-rows]').innerHTML = list.map(({ row, index }) => `<div class="ve-row" data-row="${index}"><div class="ve-name"><strong>${esc(row.name)}</strong><span data-availability>${row.stock === '' || row.stock == null ? row.legacySharedStock ? 'Stock compartido' : 'Sin límite' : Number(row.stock) > 0 ? `${esc(row.stock)} disponibles` : 'Agotado'}</span></div><label>Precio (Bs)<input data-field="amount" aria-label="Precio ${esc(row.name)}" type="number" min="0" max="21474836.47" step="0.01" value="${esc(row.amount)}"></label><label>Stock<input data-field="stock" aria-label="Stock ${esc(row.name)}" type="number" min="0" max="1000000" step="1" placeholder="Sin límite" value="${esc(row.stock)}"></label><label>Foto<select data-field="imageUrl" aria-label="Foto ${esc(row.name)}"><option value="">Foto del producto</option>${[...new Set([...photos, ...(row.imageUrl ? [row.imageUrl] : [])])].map((url, n) => `<option value="${esc(url)}" ${url === row.imageUrl ? 'selected' : ''}>Foto ${n + 1}</option>`).join('')}</select></label></div>`).join('');
    }
    host.addEventListener('input', event => {
      const input = event.target; if (!(input instanceof HTMLInputElement)) return;
      if (input.hasAttribute('data-group-name')) { groups[Number(input.dataset.groupName)].name = input.value; markDirty(); }
      if (input.hasAttribute('data-group-values')) { groups[Number(input.dataset.groupValues)].values = input.value.split(','); markDirty(); }
      if (input.hasAttribute('data-search')) drawRows();
      if (input.hasAttribute('data-field')) {
        const rowElement = /** @type {HTMLElement} */ (input.closest('[data-row]'));
        const row = rows[Number(rowElement.dataset.row)];
        if (input.dataset.field === 'amount') row.amount = input.value;
        if (input.dataset.field === 'stock') row.stock = input.value;
        if (input.dataset.field === 'stock') {
          row.legacySharedStock = false; row.stockDirty = true;
          /** @type {HTMLElement} */ (rowElement.querySelector('[data-availability]')).textContent = input.value === '' ? 'Sin límite' : Number(input.value) > 0 ? `${input.value} disponibles` : 'Agotado';
        }
        proposed = false; notify();
      }
    });
    host.addEventListener('change', event => {
      const input = event.target;
      if (input instanceof HTMLSelectElement && input.matches('select[data-field]')) {
        const rowElement = /** @type {HTMLElement} */ (input.closest('[data-row]'));
        const row = rows[Number(rowElement.dataset.row)]; row.imageUrl = input.value; row.imageDirty = true; notify();
      }
    });
    host.addEventListener('click', event => {
      if (!(event.target instanceof Element)) return;
      const button = event.target.closest('button'); if (!button || !host.contains(button)) return;
      fail('');
      if (button.hasAttribute('data-group-add') && groups.length < MAX_GROUPS) { groups.push({ name: '', values: [] }); markDirty(); drawGroups(); $(`[data-group-name="${groups.length - 1}"]`).focus(); }
      if (button.hasAttribute('data-group-remove')) { groups.splice(Number(button.dataset.groupRemove), 1); markDirty(); drawGroups(); }
      if (button.hasAttribute('data-generate')) {
        try {
          const next = combinations(groups, rows, config.basePrice?.() || '');
          const retained = new Set(next.filter(r => r.id).map(r => r.id));
          const removed = rows.filter(r => r.id && !retained.has(r.id)).length;
          if (removed && !proposed) { proposed = true; button.textContent = `Aplicar y retirar ${removed} combinaciones`; fail(`Se retirarán ${removed} combinaciones guardadas. Las coincidencias conservan su precio, foto y stock. Pulsa Aplicar para confirmar este cambio.`); return; }
          rows = next; dirty = false; proposed = false; button.textContent = 'Actualizar combinaciones'; drawRows(); notify();
        } catch (cause) { fail(cause instanceof Error ? cause.message : 'Revisa las opciones.'); }
      }
      if (button.hasAttribute('data-bulk')) {
        const amount = $('[data-bulk-price]'), stock = $('[data-bulk-stock]');
        if (!amount.reportValidity() || !stock.reportValidity()) return;
        visible().forEach(({ row }) => { if (amount.value !== '') row.amount = amount.value; if (stock.value !== '') { row.stock = stock.value; row.legacySharedStock = false; row.stockDirty = true; } });
        proposed = false; drawRows(); notify();
      }
    });
    drawGroups(); drawRows();
    return { values() { if (dirty) throw Error('Aplica los cambios de opciones con Generar combinaciones antes de guardar.'); return serialize(rows); }, refreshPhotos: drawRows };
  }
  globalThis.PagosYaProductOptions = { mount, combinations, serialize, MAX_GROUPS, MAX_VARIANTS };
})();
