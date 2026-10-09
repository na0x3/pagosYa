import { API_BASE_URL, type MerchantStudioApi, type ProductFiscalMapping } from './api';
import { PRODUCT_HIGHLIGHT_ICON_LABELS, type ProductHighlightInput } from './product-highlight-icons';
import { prepareSourceImage } from './source-images';
import { escapeHtml as escape } from './studio-ui';
import './source-create-product.css';
import './source-library.css';
import '@pagosya/variant-editor';
import '@pagosya/variant-editor/style.css';
import type { VariantInput, VariantDraft } from '@pagosya/variant-editor';
import { mountContentBlocksEditor, type ContentBlockInput } from './product-content-blocks-editor';

export type ProductExtraRecord = { id: string; name: string; amount: number; required?: boolean; groupName?: string; freeAllowance?: number; pickCount?: number; productId?: string };
type BoxChoice = { id: string; name: string; imageUrls?: string[] };
export type ProductGuideRecord = { id: string; name: string; extras?: ProductExtraRecord[]; highlights?: ProductHighlightInput[]; description?: string | null; amount: number; currency?: string; stock?: number | null; imageUrls?: string[]; variants?: Array<VariantInput & { id: string }>; specifications?: ProductSpecification[]; contentBlocks?: ContentBlockInput[] } & ProductFiscalMapping;
export type ProductSpecification = { label: string; value: string };

/** "Nombre: valor" lines to specification rows, or a message for the first invalid line. */
export function parseSpecificationLines(text: string): { rows: ProductSpecification[]; problem: string } {
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (lines.length > 8) return { rows: [], problem: 'Agrega hasta 8 datos en la ficha técnica.' };
  const rows: ProductSpecification[] = [];
  for (const line of lines) {
    const colon = line.indexOf(':'), label = line.slice(0, colon).trim(), value = line.slice(colon + 1).trim();
    if (colon <= 0 || !label || !value) return { rows: [], problem: `Escribe “${line.slice(0, 40)}” con el formato Nombre: valor.` };
    if (label.length > 40 || value.length > 120) return { rows: [], problem: 'Cada nombre admite 40 caracteres y cada valor 120.' };
    rows.push({ label, value });
  }
  return { rows, problem: '' };
}

/** Steps another screen may open an existing product at (Crecimiento's insights), and their place in the guide. */
export const PRODUCT_GUIDE_STEPS = ['description', 'price', 'photos', 'stock'] as const;
export type ProductGuideStep = typeof PRODUCT_GUIDE_STEPS[number];
const GUIDE_STEP_NUMBER: Record<ProductGuideStep, number> = { description: 2, price: 3, photos: 5, stock: 7 };

/** Fixed YAPI questions. Keep answers, combinations and successful uploads on retry. */
/** Every photo a block points at, mapped between uploaded paths and the previews the editor picks from. Sections
 * without photos (story, comparison, FAQ, features) pass through untouched. */
function mapBlockPhotos(block: ContentBlockInput, map: (url: string) => string): ContentBlockInput {
  if (block.type === 'media') return { ...block, imageUrl: map(block.imageUrl) };
  if (block.type === 'compare') return { ...block, beforeUrl: map(block.beforeUrl), afterUrl: map(block.afterUrl) };
  if (block.type === 'details') return { ...block, items: block.items.map(item => ({ ...item, imageUrl: map(item.imageUrl) })) };
  return block;
}

export function createProductForm(api: MerchantStudioApi, storeId: string, onSaved: () => void, onClose: () => void, initial?: ProductGuideRecord, startAt?: ProductGuideStep) {
  const dialog = document.createElement('section');
  dialog.className = 'product-create-panel';
  dialog.setAttribute('aria-labelledby', 'product-create-title');
  let busy = false, completed = false, step = 1, highlightsAsked = false;
  const highlights: ProductHighlightInput[] = [];
  const photos: Array<{ file?: File; preview: string; url?: string; scene?: boolean }> = [];
  const sceneSettings = [['auto', 'Automático'], ['studio', 'Estudio'], ['lifestyle', 'En uso'], ['natural', 'Natural'], ['editorial', 'Editorial']] as const;
  const uploadedPreview = (url: string) => /^\/(?:api\/)?v1\/uploads\//.test(url) ? new URL(url, new URL(API_BASE_URL, location.href)).href : url;
  dialog.innerHTML = `<header><span class="product-yapi-badge">✳ YAPI</span><h2 id="product-create-title">Nuevo producto</h2><p data-product-step aria-live="polite">Paso 1 de 8</p><div class="product-step-track" aria-hidden="true">${Array.from({length:8}, () => '<span></span>').join('')}</div></header>
    <div class="product-answer-history" data-product-history aria-label="Tus respuestas"></div>
    <form data-product-form novalidate><fieldset>
      <p class="product-yapi-question" data-product-question aria-live="polite"></p>
      <section data-guide-step="1"><label>Nombre del producto<input name="name" required maxlength="120" autocomplete="off" placeholder="Ej. Suéter Merino"></label></section>
      <section data-guide-step="2" hidden><label>Descripción del producto<textarea name="description" rows="3" maxlength="500" placeholder="Qué es, para quién es y por qué elegirlo"></textarea></label><label>Ficha técnica (opcional)<textarea name="specifications" rows="4" maxlength="1400" placeholder="Material: Algodón&#10;Medidas: 30 × 40 cm&#10;Origen: La Paz" aria-describedby="product-specifications-help"></textarea></label><p class="product-step-help" id="product-specifications-help">Una línea por dato, con el formato Nombre: valor (hasta 8). Se muestra como ficha en la página del producto. Ambos campos son opcionales.</p></section>
      <section data-guide-step="3" hidden><label>Precio (Bs)<input name="price" required type="number" min="0" max="21474836.47" step="0.01" inputmode="decimal" placeholder="0.00"></label></section>
      <section data-guide-step="4" hidden><h3 id="product-highlights-title">Destacados</h3><p id="product-highlights-help">YAPI propone hasta 6 datos cortos con un icono. Edítalos o quítalos; solo se publican los que guardes.</p><div data-highlight-rows aria-describedby="product-highlights-help"></div><button type="button" data-highlight-add>Añadir destacado</button><p data-highlight-status aria-live="polite"></p></section>
      <section data-guide-step="5" hidden><h3 id="product-photos-title">Fotos del producto</h3><p id="product-photos-help">Hasta 10 fotos de 8 MB. La portada es la foto que se ve en tu catálogo. También puedes continuar sin fotos.</p><label class="product-photo-upload"><span>Añadir fotos</span><small>JPG, PNG o WebP</small><input name="photos" type="file" accept="image/jpeg,image/png,image/webp" multiple aria-describedby="product-photos-help"></label><div class="product-create-photos" data-product-photos></div><div class="product-scene" data-product-scene hidden></div><div data-product-content-blocks></div>${initial?.id ? '<p class="product-page-regenerate"><button type="button" data-page-regenerate>Regenerar con YAPI</button> <span data-page-regenerate-status role="status"></span></p>' : ''}</section>
      <section data-guide-step="6" hidden><label class="product-option-toggle"><input type="checkbox" name="hasOptions">El cliente elige opciones (talla, color u otras)</label><div data-product-options hidden></div><p class="product-step-help">Crea tus propias opciones. Cada combinación tiene su precio, foto y stock: azul / S es diferente de blanco / S.</p><label class="product-option-toggle"><input type="checkbox" name="isBox">Es una caja: el cliente elige productos de tu catálogo</label><p class="product-step-help" data-box-locked hidden>Este producto ya tiene extras configurados en el panel de productos; edítalos allí.</p><div class="product-box" data-product-box hidden><div class="product-box-fields"><label>¿Cuántos elige el cliente?<input name="boxPickCount" type="number" min="1" max="24" step="1" inputmode="numeric" placeholder="6"></label><label>Título de la elección<input name="boxGroupName" maxlength="60" placeholder="Sabores" value="Elige tus productos"></label></div><fieldset class="product-box-choices"><legend>Productos que pueden ir en la caja</legend><div data-box-choices><p role="status">Cargando tu catálogo…</p></div></fieldset><p class="product-step-help">Cada elección descuenta una unidad del stock de ese producto. Solo se muestran productos sin opciones propias.</p></div></section>
      <section data-guide-step="7" hidden><label data-stock-label>Stock (opcional)<input name="stock" type="number" min="0" max="1000000" step="1" inputmode="numeric" placeholder="Sin límite"></label><p data-variant-stock hidden>Usaremos el stock que definiste para cada combinación. Cero significa agotado. Vuelve al paso anterior si quieres cambiarlo.</p></section>
      <section data-guide-step="8" hidden><div data-product-review class="product-review"></div>
        <details class="product-fiscal" data-product-fiscal hidden><summary>Clasificación para facturar (SIN)</summary>
          <p class="product-step-help">Opcional. Con estos datos tus facturas electrónicas llevan la clasificación que exige el SIN.</p>
          <label>Código interno del producto<input name="codigoProducto" maxlength="64" pattern="[A-Za-z0-9._\-]+" placeholder="Ej. NIKE-AM90" autocomplete="off"></label>
          <label>Actividad económica<select name="actividadEconomica" disabled><option value="">Cargando…</option></select></label>
          <label>Buscar clasificación<input name="sinSearch" type="search" placeholder="Ej. calzado" autocomplete="off" disabled></label>
          <label>Clasificación del SIN<select name="codigoProductoSin" disabled><option value="">Selecciona una actividad</option></select></label>
          <label>Unidad de medida<select name="unidadMedida" disabled><option value="">Cargando…</option></select></label>
          <p role="status" data-fiscal-status></p>
        </details>
      </section>
      <p role="alert" data-product-error hidden></p><p role="status" data-product-status></p>
      <footer><button type="button" class="product-back" data-product-back aria-label="Cancelar creación de producto">←</button><button type="submit" class="product-next" disabled>Siguiente <span aria-hidden="true">›</span></button></footer>
    </fieldset></form>`;
  const form = dialog.querySelector<HTMLFormElement>('form')!;
  const fieldset = dialog.querySelector<HTMLFieldSetElement>('fieldset')!;
  const submit = dialog.querySelector<HTMLButtonElement>('[type=submit]')!;
  const back = dialog.querySelector<HTMLButtonElement>('[data-product-back]')!;
  const nameInput = form.elements.namedItem('name') as HTMLInputElement;
  const priceInput = form.elements.namedItem('price') as HTMLInputElement;
  const status = dialog.querySelector<HTMLElement>('[data-product-status]')!;
  const error = dialog.querySelector<HTMLElement>('[data-product-error]')!;
  const picker = form.elements.namedItem('photos') as HTMLInputElement;
  const optionsToggle = form.elements.namedItem('hasOptions') as HTMLInputElement;
  const stockInput = form.elements.namedItem('stock') as HTMLInputElement;
  const optionsHost = dialog.querySelector<HTMLElement>('[data-product-options]')!;
  const boxToggle = form.elements.namedItem('isBox') as HTMLInputElement;
  const boxHost = dialog.querySelector<HTMLElement>('[data-product-box]')!;
  const boxPickInput = form.elements.namedItem('boxPickCount') as HTMLInputElement;
  const boxGroupInput = form.elements.namedItem('boxGroupName') as HTMLInputElement;
  // Studio edits only boxes; extras set up in the products panel (inventory, cortesías) stay there, untouched.
  const savedBox = (initial?.extras || []).filter(extra => extra.productId);
  const boxLocked = (initial?.extras || []).some(extra => !extra.productId);
  let boxChoices: BoxChoice[] | null = null;
  const selectedBox = new Set(savedBox.map(extra => extra.productId!));
  async function drawBoxChoices() {
    const host = dialog.querySelector<HTMLElement>('[data-box-choices]')!;
    try {
      if (!boxChoices) {
        const catalog = await api.sourceCatalog(storeId) as { items?: Array<BoxChoice & { variants?: unknown[]; extras?: unknown[] }> };
        boxChoices = (catalog.items || []).filter(item => item.id !== initial?.id && !item.variants?.length && !item.extras?.length);
      }
      host.innerHTML = boxChoices.length ? boxChoices.map(item => {
        const photo = item.imageUrls?.[0];
        return `<label class="product-box-choice">${photo ? `<img src="${escape(uploadedPreview(photo))}" alt="">` : ''}<input type="checkbox" name="boxProduct" value="${escape(item.id)}" ${selectedBox.has(item.id) ? 'checked' : ''}><span>${escape(item.name)}</span></label>`;
      }).join('') : '<p>Crea primero los productos que irán dentro de la caja.</p>';
    } catch { host.innerHTML = '<p role="alert">No pudimos cargar tu catálogo. Vuelve a abrir este paso para intentar de nuevo.</p>'; boxChoices = null; }
  }
  /** The checklist is the source of truth once drawn; the set keeps a saved box while the catalog loads. */
  function syncBoxSelection() {
    const inputs = dialog.querySelectorAll<HTMLInputElement>('[name="boxProduct"]');
    if (!inputs.length) return;
    selectedBox.clear();
    inputs.forEach(input => { if (input.checked) selectedBox.add(input.value); });
  }
  dialog.addEventListener('change', event => { if ((event.target as HTMLInputElement).name === 'boxProduct') syncBoxSelection(); });
  boxToggle.checked = savedBox.length > 0; boxHost.hidden = !boxToggle.checked;
  boxToggle.disabled = boxLocked; dialog.querySelector<HTMLElement>('[data-box-locked]')!.hidden = !boxLocked;
  if (savedBox.length) { boxPickInput.value = String(savedBox[0].pickCount || ''); boxGroupInput.value = savedBox[0].groupName || boxGroupInput.value; void drawBoxChoices(); }
  boxToggle.addEventListener('change', () => {
    boxHost.hidden = !boxToggle.checked;
    if (boxToggle.checked) {
      if (optionsToggle.checked) { optionsToggle.checked = false; optionsToggle.dispatchEvent(new Event('change')); }
      void drawBoxChoices();
    }
  });
  const boxChosen = () => (boxChoices || []).filter(item => selectedBox.has(item.id));
  const fiscal = dialog.querySelector<HTMLDetailsElement>('[data-product-fiscal]')!;
  const ownCodeInput = form.elements.namedItem('codigoProducto') as HTMLInputElement;
  const activitySelect = form.elements.namedItem('actividadEconomica') as HTMLSelectElement;
  const sinSearchInput = form.elements.namedItem('sinSearch') as HTMLInputElement;
  const sinCodeSelect = form.elements.namedItem('codigoProductoSin') as HTMLSelectElement;
  const unitSelect = form.elements.namedItem('unidadMedida') as HTMLSelectElement;
  const fiscalStatus = dialog.querySelector<HTMLElement>('[data-fiscal-status]')!;
  const option = (value: string | number, label: string) => `<option value="${escape(String(value))}">${escape(label)}</option>`;
  let fiscalCatalogs: Promise<void> | null = null, sinSearchTimer = 0;
  function loadFiscalCatalogs() {
    fiscalCatalogs ||= Promise.all([api.siatActivities(), api.siatUnits()]).then(([activities, units]) => {
      activitySelect.innerHTML = option('', 'Selecciona una actividad') + activities.entries.map(entry => option(entry.codigoCaeb, `${entry.descripcion} · ${entry.codigoCaeb}`)).join('');
      unitSelect.innerHTML = option('', 'Selecciona una unidad') + units.entries.map(entry => option(entry.codigoClasificador, entry.descripcion)).join('');
      activitySelect.disabled = unitSelect.disabled = sinSearchInput.disabled = false;
      fiscalStatus.textContent = '';
    }).catch(cause => {
      fiscalCatalogs = null;
      fiscalStatus.textContent = `No pudimos cargar los catálogos del SIN${cause instanceof Error ? `: ${cause.message}` : ''}. Cierra y vuelve a abrir esta sección para reintentar.`;
      throw cause;
    });
    return fiscalCatalogs;
  }
  async function loadSinProducts(selected = '') {
    if (!activitySelect.value) { sinCodeSelect.innerHTML = option('', 'Selecciona una actividad'); sinCodeSelect.disabled = true; return; }
    sinCodeSelect.disabled = true;
    sinCodeSelect.innerHTML = option('', 'Buscando clasificaciones…');
    try {
      const result = await api.siatProducts(activitySelect.value, sinSearchInput.value.trim());
      sinCodeSelect.innerHTML = option('', 'Selecciona una clasificación') + result.entries.map(entry => option(entry.codigoProducto, `${entry.descripcionProducto} · ${entry.codigoProducto}`)).join('');
      sinCodeSelect.disabled = false;
      if (selected && result.entries.some(entry => String(entry.codigoProducto) === selected)) sinCodeSelect.value = selected;
      fiscalStatus.textContent = result.total ? `${result.total} clasificaciones para esta actividad.` : 'No hay coincidencias. Prueba otra búsqueda o actividad.';
    } catch (cause) {
      sinCodeSelect.innerHTML = option('', 'No se pudieron cargar las clasificaciones');
      fiscalStatus.textContent = cause instanceof Error ? cause.message : 'No se pudieron cargar las clasificaciones.';
    }
  }
  fiscal.addEventListener('toggle', () => { if (fiscal.open) void loadFiscalCatalogs().catch(() => undefined); });
  activitySelect.addEventListener('change', () => { sinSearchInput.value = ''; void loadSinProducts(); });
  sinSearchInput.addEventListener('input', () => { window.clearTimeout(sinSearchTimer); sinSearchTimer = window.setTimeout(() => void loadSinProducts(), 250); });
  sinSearchInput.addEventListener('keydown', event => { if (event.key === 'Enter') event.preventDefault(); });
  // Only stores that invoice through pagosYa see the section; an edit reopens what was saved.
  void Promise.resolve().then(() => api.productFiscalReady(storeId)).then(async ready => {
    fiscal.hidden = !ready;
    if (!ready || !initial) return;
    ownCodeInput.value = initial.codigoProducto || '';
    if (!initial.actividadEconomica) return;
    fiscal.open = true;
    await loadFiscalCatalogs();
    activitySelect.value = initial.actividadEconomica;
    unitSelect.value = initial.unidadMedida ? String(initial.unidadMedida) : '';
    await loadSinProducts(initial.codigoProductoSin || '');
  }).catch(() => undefined);
  if (initial) {
    nameInput.value = initial.name;
    (form.elements.namedItem('description') as HTMLTextAreaElement).value = initial.description || '';
    (form.elements.namedItem('specifications') as HTMLTextAreaElement).value = (initial.specifications || []).map(row => `${row.label}: ${row.value}`).join('\n');
    priceInput.value = (initial.amount / 100).toFixed(2); stockInput.value = initial.stock == null ? '' : String(initial.stock);
    optionsToggle.checked = Boolean(initial.variants?.length); optionsHost.hidden = !optionsToggle.checked;
    highlights.push(...(initial.highlights || []).map(row => ({ ...row })));
    highlightsAsked = highlights.length > 0;
    stockInput.disabled = optionsToggle.checked; stockInput.closest('label')!.hidden = optionsToggle.checked;
    dialog.querySelector<HTMLElement>('[data-variant-stock]')!.hidden = !optionsToggle.checked;
    [...new Set([...(initial.imageUrls || []), ...(initial.variants || []).flatMap(v => v.imageUrls?.length ? v.imageUrls : [v.imageUrl]).filter((url): url is string => Boolean(url))])].forEach(url => photos.push({preview: /^\/(?:api\/)?v1\/uploads\//.test(url) ? new URL(url, new URL(API_BASE_URL, location.href)).href : url, url}));
    dialog.querySelector('#product-create-title')!.textContent = 'Editar producto';
  }
  let optionDrafts: VariantDraft[] = initial?.variants?.map(v => ({ ...v, amount: String(v.amount / 100), stock: v.stock == null ? '' : String(v.stock), imageUrl: v.imageUrl ? uploadedPreview(v.imageUrl) : undefined, imageUrls: (v.imageUrls?.length ? v.imageUrls : v.imageUrl ? [v.imageUrl] : []).map(uploadedPreview) })) || [];
  const optionEditor = PagosYaProductOptions.mount(optionsHost, { variants: optionDrafts, onChange: rows => { optionDrafts = rows; }, basePrice: () => priceInput.value, photos: () => photos.map(p => p.preview) });
  const mountBlocks = (blocks: ContentBlockInput[]) => mountContentBlocksEditor(dialog.querySelector<HTMLElement>('[data-product-content-blocks]')!, {
    photos: () => photos,
    initial: blocks.map(block => mapBlockPhotos(block, uploadedPreview)),
  });
  let blockEditor = mountBlocks(initial?.contentBlocks || []);
  // What the dialog last loaded from the server: regenerating rewrites the saved product, so unsaved edits would be lost.
  const pageSnapshot = () => { try { return JSON.stringify({ highlights, blocks: blockEditor.values() }); } catch { return 'unsaved'; } };
  let pageBaseline = pageSnapshot();
  // YAPI rewrites only its own sections and highlights; whatever the merchant edited stays (spec 2026-10-09).
  dialog.querySelector<HTMLButtonElement>('[data-page-regenerate]')?.addEventListener('click', event => {
    const button = event.currentTarget as HTMLButtonElement, status = dialog.querySelector<HTMLElement>('[data-page-regenerate-status]')!;
    if (!initial?.id || button.disabled) return;
    if (pageSnapshot() !== pageBaseline) { status.textContent = 'Guarda tus cambios antes de regenerar con YAPI.'; return; }
    button.disabled = true; status.textContent = 'YAPI está escribiendo la página del producto…';
    api.regenerateProductPage(storeId, initial.id).then(result => {
      highlights.splice(0, highlights.length, ...(result.highlights || []).map(row => ({ ...row })));
      highlightsAsked = true;
      drawHighlights();
      blockEditor.dispose();
      blockEditor = mountBlocks(result.contentBlocks || []);
      pageBaseline = pageSnapshot();
      status.textContent = 'Listo: la nueva página ya está en tu tienda. Puedes editarla aquí y guardar.';
    }).catch(() => { status.textContent = 'No se pudo generar; reintentar.'; }).finally(() => { button.disabled = false; });
  });
  optionsToggle.addEventListener('change', () => { optionsHost.hidden = !optionsToggle.checked; stockInput.disabled = optionsToggle.checked; stockInput.closest('label')!.hidden = optionsToggle.checked; dialog.querySelector<HTMLElement>('[data-variant-stock]')!.hidden = !optionsToggle.checked; });
  const showError = (message: string) => { error.textContent = message; error.hidden = !message; };
  const setBusy = (value: boolean) => { busy = value; fieldset.disabled = value; submit.disabled = value || (step === 1 && !nameInput.value.trim()); form.setAttribute('aria-busy', String(value)); };
  const dispose = () => { blockEditor.dispose(); photos.forEach(photo => URL.revokeObjectURL(photo.preview)); dialog.remove(); };
  const questions = ['¿Cómo se llama tu producto?', '¿Qué debería saber el cliente sobre este producto?', '¿Cuál es su precio de venta?', '¿Qué quieres destacar de este producto?', '¿Qué fotos quieres mostrar?', '¿El cliente puede elegir talla, color u otras opciones?', '¿Cuántas unidades tienes disponibles?', 'Todo listo. Revisa tus respuestas antes de guardar.'];
  function answers() {
    syncBoxSelection();
    return [nameInput.value.trim(), (form.elements.namedItem('description') as HTMLTextAreaElement).value.trim() || 'Sin descripción', `Bs ${Number(priceInput.value).toFixed(2)}`, highlights.length ? `${highlights.length} destacados` : 'Sin destacados', `${photos.length} fotos`, optionsToggle.checked ? 'Con opciones y stock por combinación' : boxToggle.checked ? `Caja: el cliente elige ${boxPickInput.value || '?'} entre ${selectedBox.size} productos` : 'Sin opciones', optionsToggle.checked ? 'Stock por combinación' : stockInput.value === '' ? 'Sin límite' : `${stockInput.value} unidades`];
  }
  const highlightRows = () => dialog.querySelector('[data-highlight-rows]')!;
  const highlightStatus = () => dialog.querySelector('[data-highlight-status]')!;
  function drawHighlights() {
    highlightRows().innerHTML = highlights.map((row, index) => `<div class="product-highlight-row" data-highlight-row="${index}">
      <label><span class="product-highlight-label">Icono</span><select data-highlight-icon>${PRODUCT_HIGHLIGHT_ICON_LABELS.map(([name, label]) => `<option value="${name}" ${name === row.icon ? 'selected' : ''}>${escape(label)}</option>`).join('')}</select></label>
      <label><span class="product-highlight-label">Destacado</span><input data-highlight-text value="${escape(row.label)}" maxlength="24" placeholder="Ej. Gasolina"></label>
      <label><span class="product-highlight-label">Detalle (opcional)</span><input data-highlight-detail value="${escape(row.detail || '')}" maxlength="40" placeholder="Ej. 1.6 L"></label>
      <button type="button" data-highlight-remove="${index}" aria-label="Quitar destacado ${escape(row.label || String(index + 1))}">Quitar</button></div>`).join('');
  }
  dialog.addEventListener('input', event => {
    const field = event.target as HTMLInputElement | HTMLSelectElement;
    const row = field.closest<HTMLElement>('[data-highlight-row]');
    if (!row) return;
    const entry = highlights[Number(row.dataset.highlightRow)];
    if (!entry) return;
    if (field.hasAttribute('data-highlight-icon')) entry.icon = field.value;
    if (field.hasAttribute('data-highlight-text')) entry.label = field.value;
    if (field.hasAttribute('data-highlight-detail')) entry.detail = field.value;
    // An edited row is the merchant's: YAPI never rewrites it.
    delete entry.origin;
  });
  dialog.addEventListener('click', event => {
    const button = (event.target as Element).closest<HTMLButtonElement>('[data-highlight-remove],[data-highlight-add]');
    if (!button || busy) return;
    if (button.hasAttribute('data-highlight-add')) { if (highlights.length < 6) highlights.push({ icon: PRODUCT_HIGHLIGHT_ICON_LABELS[0][0], label: '' }); }
    else highlights.splice(Number(button.dataset.highlightRemove), 1);
    drawHighlights();
  });
  /** Ask YAPI once per product; the merchant keeps whatever they approve. */
  async function askHighlights() {
    // A product that already has highlights shows them instead of asking YAPI again.
    if (highlightsAsked || highlights.length) { drawHighlights(); return; }
    highlightsAsked = true;
    highlightStatus().textContent = 'YAPI está proponiendo destacados…';
    try {
      const { rows } = parseSpecificationLines((form.elements.namedItem('specifications') as HTMLTextAreaElement).value);
      const result = await api.suggestProductHighlights(storeId, { name: nameInput.value.trim(), description: (form.elements.namedItem('description') as HTMLTextAreaElement).value.trim() || null, specifications: rows });
      highlights.push(...result.highlights.slice(0, 6));
      highlightStatus().textContent = highlights.length ? 'Revisa y edita lo que quieras publicar.' : 'YAPI no encontró datos para destacar. Puedes añadirlos tú.';
    } catch {
      highlightStatus().textContent = 'No pudimos proponer destacados. Puedes añadirlos tú.';
    }
    drawHighlights();
  }
  function updateStep() {
    dialog.querySelectorAll<HTMLElement>('[data-guide-step]').forEach(section => { section.hidden = Number(section.dataset.guideStep) !== step; });
    dialog.querySelector('[data-product-step]')!.textContent = `Paso ${step} de 8`;
    dialog.querySelector('[data-product-question]')!.textContent = questions[step - 1];
    dialog.querySelectorAll('.product-step-track span').forEach((el, index) => el.classList.toggle('is-current', index < step));
    dialog.querySelector('[data-product-history]')!.innerHTML = answers().slice(0, Math.min(step - 1, 7)).map((answer, index) => `<button type="button" data-answer-step="${index + 1}"><small>${['Nombre','Descripción','Precio','Destacados','Fotos','Opciones','Stock'][index]}</small><span>${escape(answer)}</span><span aria-hidden="true">↗</span></button>`).join('');
    dialog.querySelectorAll<HTMLButtonElement>('[data-answer-step]').forEach(button => button.onclick = () => { if (!busy) { step = Number(button.dataset.answerStep); updateStep(); } });
    if (step === 8) {
      const variants = optionsToggle.checked ? optionEditor.values() : [];
      dialog.querySelector('[data-product-review]')!.innerHTML = `<strong>${escape(nameInput.value.trim())}</strong><p>${variants.length ? `${variants.length} combinaciones · desde Bs ${(Math.min(...variants.map(v => v.amount)) / 100).toFixed(2)}` : answers()[2]}</p>${variants.map(v => { const stock = v.stock === undefined ? initial?.variants?.find(row => row.id === v.id)?.stock : v.stock; return `<p>${escape(v.name)} · Bs ${(v.amount / 100).toFixed(2)} · ${stock == null ? 'Sin límite' : stock === 0 ? 'Agotado' : `${stock} unidades`}</p>`; }).join('')}${boxToggle.checked ? `<p>${escape(answers()[5])}</p>` : ''}<p>Al guardar, ${initial ? 'se actualizará este producto' : 'se añadirá al catálogo de esta tienda'}.</p>`;
    }
    submit.innerHTML = step === 8 ? 'Guardar producto' : 'Siguiente <span aria-hidden="true">›</span>';
    back.setAttribute('aria-label', step === 1 ? 'Cancelar creación de producto' : 'Volver al paso anterior');
    showError(''); setBusy(false);
    if (step === 4) void askHighlights();
    dialog.querySelector<HTMLElement>(`[data-guide-step="${step}"] input, [data-guide-step="${step}"] textarea`)?.focus();
  }
  function validateStep() {
    const fields = dialog.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(`[data-guide-step="${step}"] input:not([type=file]), [data-guide-step="${step}"] textarea`);
    for (const field of fields) if (!field.disabled && !field.reportValidity()) return false;
    if (step === 1 && !nameInput.value.trim()) { showError('Escribe el nombre del producto.'); return false; }
    if (step === 2) {
      const { problem } = parseSpecificationLines((form.elements.namedItem('specifications') as HTMLTextAreaElement).value);
      if (problem) { showError(problem); (form.elements.namedItem('specifications') as HTMLTextAreaElement).focus(); return false; }
    }
    if (step === 6 && boxToggle.checked) {
      syncBoxSelection();
      if (!selectedBox.size) { showError('Elige al menos un producto para la caja.'); return false; }
      if (!boxGroupInput.value.trim()) { showError('Escribe un título para la elección, por ejemplo Sabores.'); boxGroupInput.focus(); return false; }
      const count = Number(boxPickInput.value);
      if (!boxPickInput.value || !Number.isInteger(count) || count < 1 || count > 24) { showError('Indica cuántos productos elige el cliente, entre 1 y 24.'); boxPickInput.focus(); return false; }
    }
    if (step === 8 && !fiscal.hidden) {
      const classification = [activitySelect.value, sinCodeSelect.value, unitSelect.value];
      if (classification.some(Boolean) && !classification.every(Boolean)) { fiscal.open = true; showError('Para facturar este producto elige actividad, clasificación y unidad, o deja las tres vacías.'); return false; }
    }
    if (step === 5 && optionsToggle.checked) {
      try { optionEditor.values(); } catch (cause) { showError(cause instanceof Error ? cause.message : 'Revisa las opciones.'); return false; }
    }
    return true;
  }
  back.addEventListener('click', () => { if (busy) return; if (step > 1) { step--; updateStep(); } else onClose(); });
  nameInput.addEventListener('input', () => { submit.disabled = busy || !nameInput.value.trim(); });
  function drawPhotos() {
    optionEditor.refreshPhotos();
    blockEditor.refreshPhotos();
    const host = dialog.querySelector<HTMLElement>('[data-product-photos]')!;
    host.innerHTML = photos.map((photo, index) => `<figure><img src="${escape(photo.preview)}" alt="${escape(photo.file?.name || `Foto ${index + 1}`)}"><figcaption>${index === 0 ? 'Portada' : `Foto ${index + 1}`}${photo.scene ? ' · Escena YAPI' : ''}</figcaption>${index === 0 ? '' : `<button type="button" class="button" data-cover-photo="${index}" aria-label="Usar la foto ${index + 1} como portada">Usar como portada</button>`}${photo.scene ? '' : `<button type="button" class="button" data-scene-photo="${index}" aria-label="Crear escena con la foto ${index + 1}">Crear escena</button>`}<button type="button" class="button" data-remove-photo="${index}" aria-label="Quitar foto ${index + 1}">Quitar</button></figure>`).join('');
    host.querySelectorAll<HTMLButtonElement>('[data-scene-photo]').forEach(button => button.addEventListener('click', () => { if (!busy) openScene(Number(button.dataset.scenePhoto)); }));
    // The cover is what a storefront card shows, so it is the owner's choice rather than upload order.
    host.querySelectorAll<HTMLButtonElement>('[data-cover-photo]').forEach(button => button.addEventListener('click', () => {
      if (busy) return;
      photos.unshift(...photos.splice(Number(button.dataset.coverPhoto), 1));
      drawPhotos(); status.textContent = 'Portada actualizada.';
      // Re-rendering destroyed the clicked button; keep keyboard users on the photo that moved.
      host.querySelector<HTMLButtonElement>('figure button')?.focus();
    }));
    host.querySelectorAll<HTMLButtonElement>('[data-remove-photo]').forEach(button => button.addEventListener('click', () => {
      if (busy) return;
      const [removed] = photos.splice(Number(button.dataset.removePhoto), 1);
      if (removed.file) URL.revokeObjectURL(removed.preview);
      drawPhotos();
    }));
  }
  /** YAPI keeps the product from the merchant's photo and only generates its surroundings; nothing is added until the merchant accepts it. */
  function openScene(index: number) {
    const panel = dialog.querySelector<HTMLElement>('[data-product-scene]')!, source = photos[index];
    if (!source) return;
    panel.hidden = false;
    panel.innerHTML = `<h4 id="product-scene-title">Escena con YAPI</h4><p>YAPI conserva tu producto tal como aparece en la foto y crea solo el entorno. Tú decides si la añades.</p><fieldset class="product-scene-settings"><legend>Entorno</legend>${sceneSettings.map(([value, label], i) => `<label><input type="radio" name="sceneSetting" value="${value}"${i ? '' : ' checked'}>${label}</label>`).join('')}</fieldset><label>Detalle opcional<input name="sceneNote" maxlength="200" placeholder="Ej. mesa de desayuno con luz de mañana" autocomplete="off"></label><div class="product-scene-actions"><button type="button" class="product-next" data-scene-generate>Crear escena</button><button type="button" class="button" data-scene-close>Cancelar</button></div>`;
    panel.querySelector<HTMLButtonElement>('[data-scene-close]')!.onclick = () => { panel.hidden = true; panel.innerHTML = ''; };
    panel.querySelector<HTMLButtonElement>('[data-scene-generate]')!.onclick = () => {
      if (busy) return;
      if (photos.length >= 10) { showError('Puedes añadir hasta 10 fotos. Quita una antes de crear otra escena.'); return; }
      const setting = (panel.querySelector<HTMLInputElement>('[name=sceneSetting]:checked')?.value || 'auto') as (typeof sceneSettings)[number][0];
      const note = panel.querySelector<HTMLInputElement>('[name=sceneNote]')!.value.trim() || null;
      setBusy(true); showError(''); status.textContent = 'YAPI está creando la escena. Puede tardar hasta un minuto…';
      void (async () => {
        if (!source.url) source.url = (await api.upload(source.file!)).url;
        const scene = await api.createProductScene(storeId, { imageUrl: source.url, productName: nameInput.value.trim() || 'Producto', description: (form.elements.namedItem('description') as HTMLTextAreaElement).value.trim() || null, setting, note, aspect: 'square' });
        const preview = uploadedPreview(scene.url);
        panel.innerHTML = `<h4>Revisa la escena</h4><div class="product-scene-compare"><figure><img src="${escape(source.preview)}" alt="Tu foto original"><figcaption>Tu foto</figcaption></figure><figure><img src="${escape(preview)}" alt="Escena creada por YAPI"><figcaption>Escena YAPI</figcaption></figure></div><p>Añádela solo si tu producto se ve igual: forma, colores, etiqueta y cantidad.</p><div class="product-scene-actions"><button type="button" class="product-next" data-scene-accept>Añadir a las fotos</button><button type="button" class="button" data-scene-close>Descartar</button></div>`;
        panel.querySelector<HTMLButtonElement>('[data-scene-accept]')!.onclick = () => {
          if (busy || photos.length >= 10) return;
          // The owner just confirmed the scene shows their product exactly, and a staged photograph sells
          // from a catalog card where a cut-out does not. It leads; "Usar como portada" undoes it.
          photos.unshift({ preview, url: scene.url, scene: true }); drawPhotos();
          panel.hidden = true; panel.innerHTML = ''; status.textContent = 'Escena añadida como portada.';
        };
        panel.querySelector<HTMLButtonElement>('[data-scene-close]')!.onclick = () => { panel.hidden = true; panel.innerHTML = ''; };
        status.textContent = '';
      })().catch(cause => { status.textContent = ''; showError(cause instanceof Error ? cause.message : 'No se pudo crear la escena. Tu foto sigue intacta.'); })
        .finally(() => { setBusy(false); panel.querySelector<HTMLButtonElement>('[data-scene-accept]')?.focus(); });
    };
    panel.querySelector<HTMLElement>('[name=sceneSetting]')!.focus();
  }
  picker.addEventListener('change', () => {
    const selected = Array.from(picker.files || []); picker.value = '';
    if (busy || !selected.length) return;
    showError('');
    if (photos.length + selected.length > 10) { showError('Puedes añadir hasta 10 fotos.'); return; }
    if (selected.some(file => !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 8 * 1024 * 1024)) { showError('Usa fotos JPG, PNG o WebP de hasta 8 MB cada una.'); return; }
    setBusy(true); status.textContent = 'Preparando fotos…';
    void Promise.all(selected.map(prepareSourceImage)).then(files => {
      photos.push(...files.map(file => ({ file, preview: URL.createObjectURL(file) }))); drawPhotos();
    }).catch(cause => showError(cause instanceof Error ? cause.message : 'No se pudieron preparar las fotos.')).finally(() => { setBusy(false); status.textContent = ''; });
  });
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (busy) return;
    if (!validateStep()) return;
    if (step < 8) { step++; updateStep(); return; }
    const data = new FormData(form);
    const name = String(data.get('name') || '').trim();
    if (!name) { showError('Escribe el nombre del producto.'); (form.elements.namedItem('name') as HTMLInputElement).focus(); return; }
    let variants: VariantInput[] | undefined;
    let contentBlocks: ContentBlockInput[];
    try {
      contentBlocks = blockEditor.values();
      if (optionsToggle.checked) {
        variants = optionEditor.values();
        if (optionDrafts.some(v => (v.imageUrls?.length ? v.imageUrls : v.imageUrl ? [v.imageUrl] : []).some(url => !photos.some(p => p.preview === url)))) throw Error('Una foto de combinación fue retirada. Elige otra foto para esa combinación.');
      }
    } catch (cause) { showError(cause instanceof Error ? cause.message : 'Revisa las combinaciones.'); return; }
    const input = { name, description: String(data.get('description') || '').trim() || null, amount: variants ? Math.min(...variants.map(v => v.amount)) : Math.round(Number(data.get('price')) * 100), currency: initial?.currency || 'BOB', stock: variants ? initial && variants.some(v => v.stock === undefined) ? initial.stock ?? null : variants.some(v => v.stock == null) ? null : variants.reduce((n, v) => n + v.stock!, 0) : data.get('stock') === '' ? null : Number(data.get('stock')), imageUrls: [] as string[], ...(variants ? { variants } : {}), ...(contentBlocks.length || initial?.contentBlocks?.length ? { contentBlocks } : {}) };
    const pickCount = Number(boxPickInput.value), groupName = boxGroupInput.value.trim();
    if (boxToggle.checked) Object.assign(input, { extras: [...selectedBox].map(productId => ({
      ...(savedBox.find(extra => extra.productId === productId)?.id ? { id: savedBox.find(extra => extra.productId === productId)!.id } : {}),
      name: boxChosen().find(item => item.id === productId)?.name || savedBox.find(extra => extra.productId === productId)?.name || 'Producto',
      amount: 0, groupName, freeAllowance: 0, pickCount, productId,
    })) });
    else if (savedBox.length) Object.assign(input, { extras: [] });
    const specifications = parseSpecificationLines(String(data.get('specifications') || '')).rows;
    // Only send the sheet when there is one to save or an existing one to clear.
    if (specifications.length || initial?.specifications?.length) Object.assign(input, { specifications });
    if (!fiscal.hidden) {
      const ownCode = ownCodeInput.value.trim();
      if (ownCode) Object.assign(input, { codigoProducto: ownCode });
      if (activitySelect.value && sinCodeSelect.value && unitSelect.value) Object.assign(input, { actividadEconomica: activitySelect.value, codigoProductoSin: sinCodeSelect.value, unidadMedida: Number(unitSelect.value) });
    }
    const approved = highlights.map(row => ({ icon: row.icon, label: row.label.trim(), ...(row.detail?.trim() ? { detail: row.detail.trim() } : {}), ...(row.origin === 'yapi' ? { origin: 'yapi' as const } : {}) })).filter(row => row.label).slice(0, 6);
    if (approved.length || initial?.highlights?.length) Object.assign(input, { highlights: approved });
    setBusy(true); showError(''); status.textContent = photos.length ? 'Subiendo fotos…' : 'Guardando producto…';
    void (async () => {
      for (const photo of photos) {
        if (!photo.url) photo.url = (await api.upload(photo.file!)).url;
        input.imageUrls.push(photo.url);
      }
      input.variants?.forEach(variant => { if (variant.imageUrl) variant.imageUrl = photos.find(photo => photo.preview === variant.imageUrl)!.url; if (variant.imageUrls) variant.imageUrls = variant.imageUrls.map(url => photos.find(photo => photo.preview === url)!.url!); });
      const uploaded = (preview: string) => photos.find(photo => photo.preview === preview)!.url!;
      if (input.contentBlocks) input.contentBlocks = input.contentBlocks.map(block => mapBlockPhotos(block, uploaded));
      status.textContent = 'Guardando producto…';
      if (initial) {
        const update: Partial<typeof input> = {...input, variants: variants || []};
        if (stockInput.value === (initial.stock == null ? '' : String(initial.stock))) delete update.stock;
        await api.updateProduct(storeId, initial.id, update);
      }
      else await api.createProduct(storeId, input);
      // Success replaces the form so a failed catalog refresh cannot create it twice.
      busy = false; completed = true;
      dialog.innerHTML = `<h2 id="product-create-title">${initial ? 'Producto actualizado' : 'Producto creado'}</h2><p role="status">${escape(name)} ya está en tu catálogo.</p><button type="button" class="product-next">Continuar con YAPI</button>`;
      const done = dialog.querySelector<HTMLButtonElement>('button')!;
      done.addEventListener('click', onClose); done.focus();
      onSaved();
    })().catch(cause => { setBusy(false); status.textContent = ''; showError(cause instanceof Error ? cause.message : 'No se pudo guardar el producto. Tus datos siguen aquí.'); });
  });
  if (photos.length) drawPhotos();
  // An existing product is already valid, so it may open past the earlier steps. With options, stock lives per combination (step 6).
  if (initial && startAt) step = startAt === 'stock' && optionsToggle.checked ? 6 : GUIDE_STEP_NUMBER[startAt];
  updateStep();
  return { element: dialog, dispose, focus: () => dialog.querySelector<HTMLElement>(`[data-guide-step="${step}"] input, [data-guide-step="${step}"] textarea`)?.focus(), get isBusy() { return busy; }, get hasChanges() { return !completed && Boolean(nameInput.value.trim() || photos.length); } };
}
