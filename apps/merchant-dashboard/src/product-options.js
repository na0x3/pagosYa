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
  /** @param {OptionGroup[]} groups @param {VariantDraft[]} previous @param {string} price @param {string} stock Units for each new combination; empty = no limit. @returns {VariantDraft[]} */
  function combinations(groups, previous = [], price = '', stock = '') {
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
      return { ...(prior || { amount: price, stock, stockDirty: true, autoStock: true }), name, options };
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
  const SUGGESTIONS = [['Talla', 'S, M, L'], ['Color', 'Negro, Blanco'], ['Tamaño', 'Pequeño, Grande'], ['Sabor', ''], ['Material', '']];
  /** @param {VariantDraft} row */
  const rowLabel = row => row.options?.length ? row.options.map(o => `${o.name}: ${o.value}`).join(' · ') : row.name;
  /** @param {VariantDraft} row */
  const availability = row => row.stock === '' || row.stock == null ? row.legacySharedStock ? 'Stock compartido' : 'Sin límite' : Number(row.stock) > 0 ? `${row.stock} a la venta` : 'Agotado';
  /** Values repeated across different options usually mean the owner split one option into several. @param {OptionGroup[]} groups */
  function repeatedValues(groups) {
    const seen = new Map();
    for (const [index, group] of groups.entries()) for (const value of group.values.map(v => v.trim()).filter(Boolean)) {
      const previous = seen.get(key(value));
      if (previous !== undefined && previous.index !== index) return `«${value}» aparece en ${groups[previous.index].name.trim() || `la opción ${previous.index + 1}`} y en ${group.name.trim() || `la opción ${index + 1}`}. Cada opción agrupa todos sus valores: por ejemplo, Color → Azul, Beige, Rojo en una sola opción.`;
      if (previous === undefined) seen.set(key(value), { index });
    }
    return '';
  }
  /** @param {HTMLElement} host @param {import('./product-options').EditorConfig} config */
  function mount(host, config = {}) {
    let rows = structuredClone(config.variants || []), dirty = false, proposed = false, timer = 0;
    const first = rows[0]?.options;
    let groups = first?.length ? first.map((o, i) => ({ name: o.name, values: [...new Set(rows.map(v => v.options?.[i]?.value).filter(value => typeof value === 'string'))] }))
      : rows.length ? [{ name: 'Versión', values: rows.map(v => v.name) }] : [{ name: '', values: [] }];
    host.classList.add('variant-editor');
    host.innerHTML = `<header><h3>¿Qué puede elegir el cliente?</h3><p>Crea una opción por cada decisión (Color, Talla…) y escribe todos sus valores juntos. Las combinaciones se arman solas.</p></header><div class="ve-suggestions" aria-label="Opciones frecuentes">${SUGGESTIONS.map(([name]) => `<button type="button" data-suggest="${esc(name)}">+ ${esc(name)}</button>`).join('')}</div><div data-groups></div><div class="ve-actions"><button type="button" data-group-add>Añadir otra opción</button><label class="ve-default-stock">Unidades de cada combinación nueva<input data-default-stock type="number" min="0" max="1000000" step="1" placeholder="Sin límite"></label><button type="button" data-generate hidden>Actualizar combinaciones</button></div><p class="ve-help">Hasta ${MAX_GROUPS} opciones y ${MAX_VARIANTS} combinaciones. Deja las unidades vacías para vender sin límite; luego puedes ajustar cada combinación.</p><p data-warning class="ve-warning" role="status" hidden></p><p data-error role="alert" hidden></p><section data-matrix hidden><div class="ve-matrix-heading"><h4 data-count></h4><label>Buscar combinación<input type="search" data-search placeholder="Ej. Azul S"></label></div><div class="ve-bulk"><label>Precio para todas (Bs)<input data-bulk-price type="number" min="0" step="0.01" placeholder="Sin cambio"></label><label>Unidades para todas<input data-bulk-stock type="number" min="0" max="1000000" step="1" placeholder="Sin cambio"></label><button type="button" data-bulk>Aplicar a las filas visibles</button></div><div class="ve-table-head" aria-hidden="true"><span>Combinación</span><span>Precio (Bs)</span><span>Unidades</span><span>Foto</span></div><div data-rows></div><p data-empty hidden>No hay combinaciones con esa búsqueda.</p></section>`;
    /** @param {string} selector */
    const $ = selector => /** @type {HTMLInputElement} */ (host.querySelector(selector));
    const error = $('[data-error]'), warning = $('[data-warning]');
    /** @param {string} message */
    const fail = message => { error.textContent = message; error.hidden = !message; };
    const updateCount = () => {
      const soldOut = rows.filter(r => r.stock !== '' && r.stock != null && Number(r.stock) <= 0).length;
      $('[data-count]').textContent = `${rows.length} ${rows.length === 1 ? 'combinación' : 'combinaciones'} · ${rows.length - soldOut} a la venta${soldOut ? ` · ${soldOut} ${soldOut === 1 ? 'agotada' : 'agotadas'}` : ''}`;
    };
    const notify = () => { updateCount(); config.onChange?.(structuredClone(rows)); };
    function drawGroups() {
      $('[data-groups]').innerHTML = groups.map((group, index) => {
        const values = group.values.map(v => v.trim()).filter(Boolean);
        return `<div class="ve-group"><label>Nombre de la opción<input data-group-name="${index}" maxlength="40" value="${esc(group.name)}" placeholder="Ej. Color"></label><label>Valores (sepáralos con comas)<input data-group-values="${index}" value="${esc(group.values.map(v => v.trim()).filter(Boolean).join(', '))}" placeholder="${esc(SUGGESTIONS.find(([name]) => key(name) === key(group.name))?.[1] || 'Ej. Azul, Blanco, Negro')}"></label><button type="button" data-group-remove="${index}" aria-label="Quitar opción ${index + 1}">Quitar</button><p class="ve-chips" data-chips="${index}">${values.length ? `${values.length} ${values.length === 1 ? 'valor' : 'valores'}: ${values.map(v => `<span>${esc(v)}</span>`).join('')}` : ''}</p></div>`;
      }).join('');
      $('[data-group-add]').disabled = groups.length >= MAX_GROUPS;
    }
    function visible() {
      const terms = key($('[data-search]').value).split(/\s+/).filter(Boolean);
      return rows.map((row, index) => ({ row, index })).filter(({ row }) => terms.every(term => key(rowLabel(row)).includes(term)));
    }
    function drawRows() {
      const list = visible();
      const photos = config.photos?.() || [];
      $('[data-matrix]').hidden = !rows.length;
      updateCount();
      $('[data-empty]').hidden = list.length > 0;
      $('[data-rows]').innerHTML = list.map(({ row, index }) => `<div class="ve-row" data-row="${index}"><div class="ve-name"><strong>${esc(rowLabel(row))}</strong><span data-availability>${esc(availability(row))}</span></div><label><span class="ve-cell-label">Precio (Bs)</span><input data-field="amount" aria-label="Precio ${esc(row.name)}" type="number" min="0" max="21474836.47" step="0.01" value="${esc(row.amount)}"></label><label><span class="ve-cell-label">Unidades</span><input data-field="stock" aria-label="Stock ${esc(row.name)}" type="number" min="0" max="1000000" step="1" placeholder="Sin límite" value="${esc(row.stock)}"></label><label><span class="ve-cell-label">Foto</span><select data-field="imageUrl" aria-label="Foto ${esc(row.name)}"><option value="">Foto del producto</option>${[...new Set([...photos, ...(row.imageUrl ? [row.imageUrl] : [])])].map((url, n) => `<option value="${esc(url)}" ${url === row.imageUrl ? 'selected' : ''}>Foto ${n + 1}</option>`).join('')}</select></label></div>`).join('');
    }
    /** Rebuild combinations from the options. Removing saved combinations always needs explicit confirmation. @param {boolean} confirmRemoval */
    function regenerate(confirmRemoval) {
      warning.textContent = repeatedValues(groups); warning.hidden = !warning.textContent;
      const button = /** @type {HTMLButtonElement} */ ($('[data-generate]'));
      try {
        const next = combinations(groups, rows, config.basePrice?.() || '', $('[data-default-stock]').value.trim());
        const retained = new Set(next.filter(r => r.id).map(r => r.id));
        const removed = rows.filter(r => r.id && !retained.has(r.id)).length;
        if (removed && !confirmRemoval) { proposed = true; button.hidden = false; button.textContent = `Aplicar y retirar ${removed} ${removed === 1 ? 'combinación' : 'combinaciones'}`; fail(`Se retirarán ${removed} ${removed === 1 ? 'combinación guardada' : 'combinaciones guardadas'}. Las que coinciden conservan su precio, foto y unidades.`); return false; }
        rows = next; dirty = false; proposed = false; button.hidden = true; fail(''); drawRows(); notify(); return true;
      } catch (cause) { dirty = true; button.hidden = true; fail(cause instanceof Error ? cause.message : 'Revisa las opciones.'); return false; }
    }
    const scheduleRegenerate = () => { dirty = true; proposed = false; clearTimeout(timer); timer = setTimeout(() => regenerate(false), 400); };
    host.addEventListener('input', event => {
      const input = event.target; if (!(input instanceof HTMLInputElement)) return;
      if (input.hasAttribute('data-group-name')) { groups[Number(input.dataset.groupName)].name = input.value; scheduleRegenerate(); }
      if (input.hasAttribute('data-group-values')) {
        const index = Number(input.dataset.groupValues);
        groups[index].values = input.value.split(',');
        const values = groups[index].values.map(v => v.trim()).filter(Boolean);
        /** @type {HTMLElement} */ (host.querySelector(`[data-chips="${index}"]`)).innerHTML = values.length ? `${values.length} ${values.length === 1 ? 'valor' : 'valores'}: ${values.map(v => `<span>${esc(v)}</span>`).join('')}` : '';
        scheduleRegenerate();
      }
      if (input.hasAttribute('data-search')) drawRows();
      if (input.hasAttribute('data-default-stock')) {
        // New combinations the owner has not adjusted follow the default units.
        rows.forEach(row => { if (!row.id && row.autoStock) row.stock = input.value.trim(); });
        drawRows(); notify();
      }
      if (input.hasAttribute('data-field')) {
        const rowElement = /** @type {HTMLElement} */ (input.closest('[data-row]'));
        const row = rows[Number(rowElement.dataset.row)];
        if (input.dataset.field === 'amount') row.amount = input.value;
        if (input.dataset.field === 'stock') {
          row.stock = input.value; row.legacySharedStock = false; row.stockDirty = true; row.autoStock = false;
          /** @type {HTMLElement} */ (rowElement.querySelector('[data-availability]')).textContent = availability(row);
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
      if (button.hasAttribute('data-suggest') && groups.length <= MAX_GROUPS) {
        const name = button.dataset.suggest || '';
        if (groups.some(group => key(group.name) === key(name))) { $(`[data-group-values="${groups.findIndex(group => key(group.name) === key(name))}"]`).focus(); return; }
        const empty = groups.findIndex(group => !group.name.trim() && !group.values.some(v => v.trim()));
        if (empty >= 0) groups[empty].name = name; else if (groups.length < MAX_GROUPS) groups.push({ name, values: [] }); else return;
        drawGroups(); $(`[data-group-values="${empty >= 0 ? empty : groups.length - 1}"]`).focus(); scheduleRegenerate();
      }
      if (button.hasAttribute('data-group-add') && groups.length < MAX_GROUPS) { fail(''); groups.push({ name: '', values: [] }); drawGroups(); $(`[data-group-name="${groups.length - 1}"]`).focus(); }
      if (button.hasAttribute('data-group-remove')) { fail(''); groups.splice(Number(button.dataset.groupRemove), 1); if (!groups.length) groups.push({ name: '', values: [] }); drawGroups(); scheduleRegenerate(); }
      if (button.hasAttribute('data-generate')) { clearTimeout(timer); regenerate(proposed); }
      if (button.hasAttribute('data-bulk')) {
        const amount = $('[data-bulk-price]'), stock = $('[data-bulk-stock]');
        if (!amount.reportValidity() || !stock.reportValidity()) return;
        visible().forEach(({ row }) => { if (amount.value !== '') row.amount = amount.value; if (stock.value !== '') { row.stock = stock.value; row.legacySharedStock = false; row.stockDirty = true; row.autoStock = false; } });
        proposed = false; drawRows(); notify();
      }
    });
    drawGroups(); drawRows();
    return {
      values() {
        clearTimeout(timer);
        // Saving applies pending option edits; only an unconfirmed removal blocks it.
        if (dirty && !regenerate(false)) throw Error(proposed ? 'Confirma qué combinaciones se retiran antes de guardar.' : error.textContent || 'Revisa las opciones antes de guardar.');
        return serialize(rows);
      },
      refreshPhotos: drawRows,
    };
  }
  globalThis.PagosYaProductOptions = { mount, combinations, serialize, MAX_GROUPS, MAX_VARIANTS };
})();
