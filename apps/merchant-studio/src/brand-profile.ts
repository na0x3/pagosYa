import { MerchantStudioApi } from './api';
import { escapeHtml as escape } from './studio-ui';
import { prepareSourceImage } from './source-images';
import './brand-profile.css';

const coreFields = ['positioning', 'audience', 'personality'];
const fields: Record<string, string> = { positioning: 'Qué hace única a tu marca', audience: 'A quién te diriges', personality: 'Personalidad', voice: 'Tono de voz', headlineExamples: 'Ejemplos de titulares', avoid: 'Qué debemos evitar', logoUsage: 'Uso del logo', typography: 'Tipografía', composition: 'Composición y espacios', photography: 'Estilo de fotografía', motion: 'Movimiento', background: 'Color de fondo', foreground: 'Color de texto', accent: 'Color de acento', accentForeground: 'Texto sobre el acento', surface: 'Color de superficies', headingFontUrl: 'Archivo de fuente para titulares', bodyFontUrl: 'Archivo de fuente para texto' };
export type BrandFact = { field: string; value: string; evidence: string; source: string };
export type BrandState = { revision: number; data: { confirmed: BrandFact[]; suggested: BrandFact[] }; cacheHit?: boolean };

export async function openBrandProfile(api: MerchantStudioApi, storeId: string): Promise<void> {
  const dialog = document.createElement('dialog'); dialog.className = 'brand-dialog';
  dialog.setAttribute('aria-labelledby', 'brand-title');
  let state: BrandState; let busy = false; let message = ''; let importText = ''; let websiteUrl = ''; let selectedFiles: File[] = [];
  const expanded = new Set<string>();
  let history: Array<BrandState & { createdAt: string }> = [];
  const close = () => { if (!busy) dialog.close(); };
  dialog.addEventListener('close', () => dialog.remove());
  dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
  document.body.append(dialog);
  dialog.innerHTML = '<p role="status">Cargando tu marca…</p>'; dialog.showModal();
  try { state = await api.brandProfile(storeId); render(); } catch (e) { dialog.innerHTML = `<p role="alert">${escape(e instanceof Error ? e.message : 'No se pudo cargar la marca.')}</p><button type="button">Cerrar</button>`; dialog.querySelector('button')!.onclick = close; }
  function collect() {
    const previous = new Map(state.data.confirmed.map(f => [f.field, f]));
    const inputs = [...dialog.querySelectorAll<HTMLTextAreaElement>('[data-brand-field]')];
    const editedFields = new Set(inputs.map(el => el.dataset.brandField));
    state.data.confirmed = inputs.filter(el => el.value.trim()).map(el => {
      const field = el.dataset.brandField!; const value = el.value.trim(); const old = previous.get(field);
      return old?.value === value ? old : { field, value, source: 'merchant', evidence: 'Editado y confirmado por el comercio.' };
    });
    state.data.confirmed.push(...[...previous.values()].filter(f => !editedFields.has(f.field)));
    importText = dialog.querySelector<HTMLTextAreaElement>('#brand-evidence')?.value || '';
    websiteUrl = dialog.querySelector<HTMLInputElement>('#brand-url')?.value || '';
  }
  async function action(task: () => Promise<void>) {
    if (busy) return;
    collect(); busy = true; message = ''; render();
    try { await task(); } catch (e) { message = e instanceof Error ? e.message : 'No se pudo completar la acción.'; }
    finally { busy = false; render(); }
  }
  function renderFields(keys: string[]) {
    return keys.map(key => {
      const fact = state.data.confirmed.find(f => f.field === key);
      const color = ['background', 'foreground', 'accent', 'accentForeground', 'surface'].includes(key);
      return `<label for="brand-${key}">${escape(fields[key])}<textarea id="brand-${key}" data-brand-field="${key}" maxlength="1200" rows="${color || ['audience', 'personality'].includes(key) ? 1 : 2}" placeholder="${color ? '#RRGGBB' : 'Opcional'}" ${busy ? 'disabled' : ''}>${escape(fact?.value || '')}</textarea></label>`;
    }).join('');
  }
  function render() {
    dialog.innerHTML = `<header><div><h2 id="brand-title">Tu marca.</h2></div><button class="button" id="brand-close" type="button" ${busy ? 'disabled' : ''}>Cerrar</button></header>
      <p>Cuéntanos lo esencial. YAPI usará tu marca y te hará unas preguntas antes de crear el sitio.</p>
      <form id="brand-form"><div class="brand-fields">${renderFields(coreFields)}</div></form>
      <details data-brand-details="advanced"><summary>Ajustes de diseño y voz</summary><div class="brand-fields">${renderFields(Object.keys(fields).filter(key => !coreFields.includes(key) && !['headingFontUrl', 'bodyFontUrl', 'headlineExamples', 'logoUsage', 'composition', 'accentForeground', 'surface'].includes(key)))}</div>
      <section class="brand-import"><h3>Fuentes de tu marca</h3><p>Sube archivos WOFF2 de hasta 2 MB que puedas publicar en tu web. Se incluirán en el sitio exportado.</p><p>${escape(state.data.confirmed.find(f => f.field === 'headingFontUrl')?.evidence || 'Titulares: sin archivo propio.')}</p><label>Fuente de titulares<input data-font="headingFontUrl" type="file" accept=".woff2,font/woff2" ${busy ? 'disabled' : ''}></label><p>${escape(state.data.confirmed.find(f => f.field === 'bodyFontUrl')?.evidence || 'Texto: sin archivo propio.')}</p><label>Fuente del texto<input data-font="bodyFontUrl" type="file" accept=".woff2,font/woff2" ${busy ? 'disabled' : ''}></label>${['headingFontUrl', 'bodyFontUrl'].filter(field => state.data.confirmed.some(f => f.field === field)).map(field => `<button class="button" data-remove-font="${field}" ${busy ? 'disabled' : ''}>Quitar fuente de ${field === 'headingFontUrl' ? 'titulares' : 'texto'}</button>`).join('')}</section>
      </details><details data-brand-details="references"><summary>Importar una web, guía o imágenes</summary><section class="brand-import"><p>Comparte texto, la dirección final de tu web o hasta seis imágenes. Revisarás las sugerencias antes de incorporarlas.</p>
      <label>Web de la marca<input id="brand-url" type="url" maxlength="2000" placeholder="https://" value="${escape(websiteUrl)}" ${busy ? 'disabled' : ''}></label>
      <label>Guía, ejemplos de voz o contexto<textarea id="brand-evidence" rows="4" maxlength="18000" ${busy ? 'disabled' : ''}>${escape(importText)}</textarea></label>
      <label>Logo, referencias o páginas de tu guía<input id="brand-images" type="file" accept="image/png,image/jpeg,image/webp" multiple ${busy ? 'disabled' : ''}></label>
      <p>${selectedFiles.length ? `${selectedFiles.length} imágenes seleccionadas` : 'Las imágenes se analizan como referencias; no se publican en tu sitio.'}</p>
      <button class="button" id="brand-analyze" ${busy ? 'disabled' : ''}>${busy ? 'Procesando…' : 'Analizar referencias'}</button></section></details>
      ${state.data.suggested.length ? `<section class="brand-suggestions"><h3>Lo que entendimos</h3><p>Comprueba la evidencia. Aceptar una sugerencia la añade al formulario; guarda la identidad para usarla.</p>${state.data.suggested.map((fact, i) => `<article><strong>${escape(fields[fact.field] || fact.field)}</strong><p>${escape(fact.value)}</p><small>${escape(fact.evidence)} · ${escape(fact.source)}</small><button class="button" data-brand-accept="${i}" ${busy ? 'disabled' : ''}>Usar esta sugerencia</button></article>`).join('')}</section>` : ''}
      <details data-brand-details="history"><summary>Historial de identidad</summary><section class="brand-import"><p>Restaurar crea una nueva versión. Las anteriores siguen guardadas.</p><button class="button" id="brand-history" ${busy ? 'disabled' : ''}>Ver últimas 20 versiones</button>${history.map(version => `<article><p>Versión ${version.revision} · ${escape(new Date(version.createdAt).toLocaleString())}</p><button class="button" data-restore-brand="${version.revision}" ${busy || version.revision === state.revision ? 'disabled' : ''}>Restaurar versión ${version.revision}</button></article>`).join('')}</section>
      </details><footer class="brand-actions"><p role="status" aria-live="polite">${escape(message)}</p><button class="button button--publish" type="submit" form="brand-form" ${busy ? 'disabled' : ''}>${busy ? 'Guardando…' : 'Guardar identidad'}</button></footer>`;
    dialog.querySelectorAll<HTMLDetailsElement>('[data-brand-details]').forEach(details => {
      const key = details.dataset.brandDetails!;
      details.open = expanded.has(key);
      details.addEventListener('toggle', () => { if (details.isConnected) { if (details.open) expanded.add(key); else expanded.delete(key); } });
    });
    dialog.querySelectorAll<HTMLButtonElement>('[data-remove-font]').forEach(button => button.onclick = () => { collect(); state.data.confirmed = state.data.confirmed.filter(f => f.field !== button.dataset.removeFont); message = 'Fuente quitada. Guarda la identidad para confirmar.'; render(); });
    dialog.querySelectorAll<HTMLInputElement>('[data-font]').forEach(input => input.addEventListener('change', () => {
      const file = input.files?.[0]; if (!file) return;
      const field = input.dataset.font!;
      void action(async () => {
        if (file.size > 2_000_000 || !file.name.toLowerCase().endsWith('.woff2')) throw new Error('Usa un archivo WOFF2 de hasta 2 MB.');
        try { await new FontFace('Brand upload validation', await file.arrayBuffer()).load(); } catch { throw new Error('No se pudo leer esta fuente. Exporta un archivo WOFF2 válido.'); }
        const asset = await api.upload(new File([file], file.name, { type: 'font/woff2' }));
        state.data.confirmed = [...state.data.confirmed.filter(f => f.field !== field), { field, value: asset.url, source: 'merchant', evidence: file.name }];
        message = 'Fuente subida. Guarda la identidad para usarla.';
      });
    }));
    dialog.querySelector('#brand-history')!.addEventListener('click', () => void action(async () => { history = await api.brandHistory(storeId); }));
    dialog.querySelectorAll<HTMLButtonElement>('[data-restore-brand]').forEach(button => button.onclick = () => void action(async () => { state = await api.restoreBrand(storeId, state.revision, Number(button.dataset.restoreBrand)); history = await api.brandHistory(storeId); message = 'Identidad restaurada como una nueva versión.'; }));
    dialog.querySelector('#brand-close')!.addEventListener('click', close);
    dialog.querySelector('#brand-form')!.addEventListener('submit', event => { event.preventDefault(); void action(async () => { state = await api.saveBrandProfile(storeId, state); message = 'Identidad guardada. YAPI la usará en tus próximos cambios.'; }); });
    dialog.querySelector('#brand-images')!.addEventListener('change', event => {
      selectedFiles = [...((event.target as HTMLInputElement).files || [])];
      if (selectedFiles.length > 6) { selectedFiles = []; message = 'Selecciona hasta seis imágenes.'; collect(); render(); }
    });
    dialog.querySelector('#brand-analyze')!.addEventListener('click', () => void action(async () => {
      if (!importText.trim() && !websiteUrl.trim() && !selectedFiles.length) throw new Error('Añade una web, texto o imágenes para analizar.');
      const urlInput = dialog.querySelector<HTMLInputElement>('#brand-url');
      if (websiteUrl && urlInput && !urlInput.validity.valid) throw new Error('Escribe una dirección web válida, por ejemplo https://tumarca.com.');
      // Persist merchant edits first so analysis cannot overwrite unsaved rules.
      state = await api.saveBrandProfile(storeId, state);
      const assetUrls: string[] = [];
      for (const file of selectedFiles) assetUrls.push((await api.upload(await prepareSourceImage(file))).url);
      state = await api.analyzeBrandProfile(storeId, { revision: state.revision, text: importText, websiteUrl: websiteUrl || undefined, assetUrls });
      selectedFiles = []; message = state.cacheHit ? 'Estas referencias ya estaban analizadas. Reutilizamos el resultado.' : 'Análisis listo. Revisa las sugerencias.';
    }));
    dialog.querySelectorAll<HTMLButtonElement>('[data-brand-accept]').forEach(button => button.onclick = () => {
      collect(); const fact = state.data.suggested[Number(button.dataset.brandAccept)];
      state.data.confirmed = [...state.data.confirmed.filter(f => f.field !== fact.field), fact];
      state.data.suggested = state.data.suggested.filter(f => f.field !== fact.field);
      message = 'Sugerencia añadida. Guarda la identidad para confirmarla.'; render();
    });
  }
}
