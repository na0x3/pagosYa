import { API_BASE_URL, type MerchantStudioApi } from './api';
import { prepareSourceImage } from './source-images';
import { escapeHtml as escape } from './studio-ui';
import './source-create-product.css';
import './source-library.css';
import '../../merchant-dashboard/src/product-options.js';
import '../../merchant-dashboard/src/product-options.css';
import type { VariantInput } from '../../merchant-dashboard/src/product-options';

export type ProductGuideRecord = { id: string; name: string; description?: string | null; amount: number; currency?: string; stock?: number | null; imageUrls?: string[]; variants?: Array<VariantInput & { id: string }>; specifications?: ProductSpecification[] };
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

/** Fixed YAPI questions. Keep answers, combinations and successful uploads on retry. */
export function createProductForm(api: MerchantStudioApi, storeId: string, onSaved: () => void, onClose: () => void, initial?: ProductGuideRecord) {
  const dialog = document.createElement('section');
  dialog.className = 'product-create-panel';
  dialog.setAttribute('aria-labelledby', 'product-create-title');
  let busy = false, completed = false, step = 1;
  const photos: Array<{ file?: File; preview: string; url?: string; scene?: boolean }> = [];
  const sceneSettings = [['auto', 'Automático'], ['studio', 'Estudio'], ['lifestyle', 'En uso'], ['natural', 'Natural'], ['editorial', 'Editorial']] as const;
  const uploadedPreview = (url: string) => /^\/(?:api\/)?v1\/uploads\//.test(url) ? new URL(url, new URL(API_BASE_URL, location.href)).href : url;
  dialog.innerHTML = `<header><span class="product-yapi-badge">✳ YAPI</span><h2 id="product-create-title">Nuevo producto</h2><p data-product-step aria-live="polite">Paso 1 de 7</p><div class="product-step-track" aria-hidden="true">${Array.from({length:7}, () => '<span></span>').join('')}</div></header>
    <div class="product-answer-history" data-product-history aria-label="Tus respuestas"></div>
    <form data-product-form novalidate><fieldset>
      <p class="product-yapi-question" data-product-question aria-live="polite"></p>
      <section data-guide-step="1"><label>Nombre del producto<input name="name" required maxlength="120" autocomplete="off" placeholder="Ej. Suéter Merino"></label></section>
      <section data-guide-step="2" hidden><label>Descripción del producto<textarea name="description" rows="3" maxlength="500" placeholder="Qué es, para quién es y por qué elegirlo"></textarea></label><label>Ficha técnica (opcional)<textarea name="specifications" rows="4" maxlength="1400" placeholder="Material: Algodón&#10;Medidas: 30 × 40 cm&#10;Origen: La Paz" aria-describedby="product-specifications-help"></textarea></label><p class="product-step-help" id="product-specifications-help">Una línea por dato, con el formato Nombre: valor (hasta 8). Se muestra como ficha en la página del producto. Ambos campos son opcionales.</p></section>
      <section data-guide-step="3" hidden><label>Precio (Bs)<input name="price" required type="number" min="0" max="21474836.47" step="0.01" inputmode="decimal" placeholder="0.00"></label></section>
      <section data-guide-step="4" hidden><h3 id="product-photos-title">Fotos del producto</h3><p id="product-photos-help">Hasta 10 fotos de 8 MB. La primera será la portada. También puedes continuar sin fotos.</p><label class="product-photo-upload"><span>Añadir fotos</span><small>JPG, PNG o WebP</small><input name="photos" type="file" accept="image/jpeg,image/png,image/webp" multiple aria-describedby="product-photos-help"></label><div class="product-create-photos" data-product-photos></div><div class="product-scene" data-product-scene hidden></div></section>
      <section data-guide-step="5" hidden><label class="product-option-toggle"><input type="checkbox" name="hasOptions">El cliente elige opciones (talla, color u otras)</label><div data-product-options hidden></div><p class="product-step-help">Crea tus propias opciones. Cada combinación tiene su precio, foto y stock: azul / S es diferente de blanco / S.</p></section>
      <section data-guide-step="6" hidden><label data-stock-label>Stock (opcional)<input name="stock" type="number" min="0" max="1000000" step="1" inputmode="numeric" placeholder="Sin límite"></label><p data-variant-stock hidden>Usaremos el stock que definiste para cada combinación. Cero significa agotado. Vuelve al paso anterior si quieres cambiarlo.</p></section>
      <section data-guide-step="7" hidden><div data-product-review class="product-review"></div></section>
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
  if (initial) {
    nameInput.value = initial.name;
    (form.elements.namedItem('description') as HTMLTextAreaElement).value = initial.description || '';
    (form.elements.namedItem('specifications') as HTMLTextAreaElement).value = (initial.specifications || []).map(row => `${row.label}: ${row.value}`).join('\n');
    priceInput.value = (initial.amount / 100).toFixed(2); stockInput.value = initial.stock == null ? '' : String(initial.stock);
    optionsToggle.checked = Boolean(initial.variants?.length); optionsHost.hidden = !optionsToggle.checked;
    stockInput.disabled = optionsToggle.checked; stockInput.closest('label')!.hidden = optionsToggle.checked;
    dialog.querySelector<HTMLElement>('[data-variant-stock]')!.hidden = !optionsToggle.checked;
    [...new Set([...(initial.imageUrls || []), ...(initial.variants || []).map(v => v.imageUrl).filter((url): url is string => Boolean(url))])].forEach(url => photos.push({preview: /^\/(?:api\/)?v1\/uploads\//.test(url) ? new URL(url, new URL(API_BASE_URL, location.href)).href : url, url}));
    dialog.querySelector('#product-create-title')!.textContent = 'Editar producto';
  }
  const optionEditor = PagosYaProductOptions.mount(optionsHost, { variants: initial?.variants?.map(v => ({...v, amount: String(v.amount / 100), stock: v.stock == null ? '' : String(v.stock), imageUrl: photos.find(photo => photo.url === v.imageUrl)?.preview || v.imageUrl || undefined})), basePrice: () => priceInput.value, photos: () => photos.map(p => p.preview) });
  optionsToggle.addEventListener('change', () => { optionsHost.hidden = !optionsToggle.checked; stockInput.disabled = optionsToggle.checked; stockInput.closest('label')!.hidden = optionsToggle.checked; dialog.querySelector<HTMLElement>('[data-variant-stock]')!.hidden = !optionsToggle.checked; });
  const showError = (message: string) => { error.textContent = message; error.hidden = !message; };
  const setBusy = (value: boolean) => { busy = value; fieldset.disabled = value; submit.disabled = value || (step === 1 && !nameInput.value.trim()); form.setAttribute('aria-busy', String(value)); };
  const dispose = () => { photos.forEach(photo => URL.revokeObjectURL(photo.preview)); dialog.remove(); };
  const questions = ['¿Cómo se llama tu producto?', '¿Qué debería saber el cliente sobre este producto?', '¿Cuál es su precio de venta?', '¿Qué fotos quieres mostrar?', '¿El cliente puede elegir talla, color u otras opciones?', '¿Cuántas unidades tienes disponibles?', 'Todo listo. Revisa tus respuestas antes de guardar.'];
  function answers() {
    return [nameInput.value.trim(), (form.elements.namedItem('description') as HTMLTextAreaElement).value.trim() || 'Sin descripción', `Bs ${Number(priceInput.value).toFixed(2)}`, `${photos.length} fotos`, optionsToggle.checked ? 'Con opciones y stock por combinación' : 'Sin opciones', optionsToggle.checked ? 'Stock por combinación' : stockInput.value === '' ? 'Sin límite' : `${stockInput.value} unidades`];
  }
  function updateStep() {
    dialog.querySelectorAll<HTMLElement>('[data-guide-step]').forEach(section => { section.hidden = Number(section.dataset.guideStep) !== step; });
    dialog.querySelector('[data-product-step]')!.textContent = `Paso ${step} de 7`;
    dialog.querySelector('[data-product-question]')!.textContent = questions[step - 1];
    dialog.querySelectorAll('.product-step-track span').forEach((el, index) => el.classList.toggle('is-current', index < step));
    dialog.querySelector('[data-product-history]')!.innerHTML = answers().slice(0, Math.min(step - 1, 6)).map((answer, index) => `<button type="button" data-answer-step="${index + 1}"><small>${['Nombre','Descripción','Precio','Fotos','Opciones','Stock'][index]}</small><span>${escape(answer)}</span><span aria-hidden="true">↗</span></button>`).join('');
    dialog.querySelectorAll<HTMLButtonElement>('[data-answer-step]').forEach(button => button.onclick = () => { if (!busy) { step = Number(button.dataset.answerStep); updateStep(); } });
    if (step === 7) {
      const variants = optionsToggle.checked ? optionEditor.values() : [];
      dialog.querySelector('[data-product-review]')!.innerHTML = `<strong>${escape(nameInput.value.trim())}</strong><p>${variants.length ? `${variants.length} combinaciones · desde Bs ${(Math.min(...variants.map(v => v.amount)) / 100).toFixed(2)}` : answers()[2]}</p>${variants.map(v => { const stock = v.stock === undefined ? initial?.variants?.find(row => row.id === v.id)?.stock : v.stock; return `<p>${escape(v.name)} · Bs ${(v.amount / 100).toFixed(2)} · ${stock == null ? 'Sin límite' : stock === 0 ? 'Agotado' : `${stock} unidades`}</p>`; }).join('')}<p>Al guardar, ${initial ? 'se actualizará este producto' : 'se añadirá al catálogo de esta tienda'}.</p>`;
    }
    submit.innerHTML = step === 7 ? 'Guardar producto' : 'Siguiente <span aria-hidden="true">›</span>';
    back.setAttribute('aria-label', step === 1 ? 'Cancelar creación de producto' : 'Volver al paso anterior');
    showError(''); setBusy(false);
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
    if (step === 5 && optionsToggle.checked) {
      try { optionEditor.values(); } catch (cause) { showError(cause instanceof Error ? cause.message : 'Revisa las opciones.'); return false; }
    }
    return true;
  }
  back.addEventListener('click', () => { if (busy) return; if (step > 1) { step--; updateStep(); } else onClose(); });
  nameInput.addEventListener('input', () => { submit.disabled = busy || !nameInput.value.trim(); });
  function drawPhotos() {
    optionEditor.refreshPhotos();
    const host = dialog.querySelector<HTMLElement>('[data-product-photos]')!;
    host.innerHTML = photos.map((photo, index) => `<figure><img src="${escape(photo.preview)}" alt="${escape(photo.file?.name || `Foto ${index + 1}`)}"><figcaption>${index === 0 ? 'Portada' : `Foto ${index + 1}`}${photo.scene ? ' · Escena YAPI' : ''}</figcaption>${photo.scene ? '' : `<button type="button" class="button" data-scene-photo="${index}" aria-label="Crear escena con la foto ${index + 1}">Crear escena</button>`}<button type="button" class="button" data-remove-photo="${index}" aria-label="Quitar foto ${index + 1}">Quitar</button></figure>`).join('');
    host.querySelectorAll<HTMLButtonElement>('[data-scene-photo]').forEach(button => button.addEventListener('click', () => { if (!busy) openScene(Number(button.dataset.scenePhoto)); }));
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
          photos.push({ preview, url: scene.url, scene: true }); drawPhotos();
          panel.hidden = true; panel.innerHTML = ''; status.textContent = 'Escena añadida a las fotos.';
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
    if (step < 7) { step++; updateStep(); return; }
    const data = new FormData(form);
    const name = String(data.get('name') || '').trim();
    if (!name) { showError('Escribe el nombre del producto.'); (form.elements.namedItem('name') as HTMLInputElement).focus(); return; }
    let variants: VariantInput[] | undefined;
    try {
      if (optionsToggle.checked) {
        variants = optionEditor.values();
        if (variants.some(v => v.imageUrl && !photos.some(p => p.preview === v.imageUrl))) throw Error('Una foto de combinación fue retirada. Elige otra foto para esa combinación.');
      }
    } catch (cause) { showError(cause instanceof Error ? cause.message : 'Revisa las combinaciones.'); return; }
    const input = { name, description: String(data.get('description') || '').trim() || null, amount: variants ? Math.min(...variants.map(v => v.amount)) : Math.round(Number(data.get('price')) * 100), currency: initial?.currency || 'BOB', stock: variants ? initial && variants.some(v => v.stock === undefined) ? initial.stock ?? null : variants.some(v => v.stock == null) ? null : variants.reduce((n, v) => n + v.stock!, 0) : data.get('stock') === '' ? null : Number(data.get('stock')), imageUrls: [] as string[], ...(variants ? { variants } : {}) };
    const specifications = parseSpecificationLines(String(data.get('specifications') || '')).rows;
    // Only send the sheet when there is one to save or an existing one to clear.
    if (specifications.length || initial?.specifications?.length) Object.assign(input, { specifications });
    setBusy(true); showError(''); status.textContent = photos.length ? 'Subiendo fotos…' : 'Guardando producto…';
    void (async () => {
      for (const photo of photos) {
        if (!photo.url) photo.url = (await api.upload(photo.file!)).url;
        input.imageUrls.push(photo.url);
      }
      input.variants?.forEach(variant => { if (variant.imageUrl) variant.imageUrl = photos.find(photo => photo.preview === variant.imageUrl)!.url; });
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
  updateStep();
  return { element: dialog, dispose, focus: () => dialog.querySelector<HTMLElement>(`[data-guide-step="${step}"] input, [data-guide-step="${step}"] textarea`)?.focus(), get isBusy() { return busy; }, get hasChanges() { return !completed && Boolean(nameInput.value.trim() || photos.length); } };
}
