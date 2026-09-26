import { API_BASE_URL, MerchantStudioApi } from './api';
import { createPreviewImageLoader, sourcePreviewDocument, type SourceSnapshot } from '@pagosya/storefront-preview';
import { escapeHtml as escape } from './studio-ui';
import './source-templates.css';

/** Plantillas: complete designer-made stores the merchant picks; applying one saves it as the next revision. */
export type TemplateSummary = { id: string; name: string; category: string; description: string; tags: string[]; order: number };

const CATEGORY_LABELS: Record<string, string> = {
  comida: 'Comida y bebidas', moda: 'Moda', belleza: 'Belleza', hogar: 'Hogar', arte: 'Arte y artesanía', tecnologia: 'Tecnología',
  mascotas: 'Mascotas', ninos: 'Niños', deporte: 'Deporte y aire libre', servicios: 'Servicios', libros: 'Libros', 'producto-unico': 'Producto único',
};
const label = (category: string) => CATEGORY_LABELS[category] ?? category;

export const templateCategories = (templates: TemplateSummary[]) => [...new Set(templates.map(template => template.category))];

/** `hasSite` means "say the current design stays in the history": false while the store is untouched. */
export type GalleryState = { category: string; selected: string; busy: boolean; error: string; hasSite: boolean; previewBase: string; width?: 'desktop' | 'phone'; adapting?: boolean };

export function renderTemplateGallery(templates: TemplateSummary[], state: GalleryState): string {
  const off = state.busy ? 'disabled' : '';
  const shown = templates.filter(template => !state.category || template.category === state.category);
  const chosen = templates.find(template => template.id === state.selected);
  const count = (category: string) => templates.filter(template => !category || template.category === category).length;
  const chip = (value: string, text: string) => `<button type="button" class="tpl-chip" data-template-category="${escape(value)}" aria-pressed="${state.category === value}" ${off}>${escape(text)} <span>${count(value)}</span></button>`;
  if (chosen) return renderTemplatePreview(chosen, state);
  return `<header class="tpl-head"><div><h2>Elige una plantilla</h2><p>Tiendas completas con tus productos. Mira cómo queda la tuya antes de elegir.</p></div><button type="button" class="tpl-close" data-template-close aria-label="Cerrar"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></header>
    ${state.error ? `<p class="tpl-error" role="alert">${escape(state.error)}</p>` : ''}
    <nav class="tpl-chips" aria-label="Categorías">${chip('', 'Todas')}${templateCategories(templates).map(category => chip(category, label(category))).join('')}</nav>
    <ul class="tpl-grid">${shown.map(template => `<li class="tpl-card" data-template-card="${escape(template.id)}">
      <button type="button" class="tpl-card__pick" data-template-pick="${escape(template.id)}" ${off} aria-label="Ver ${escape(template.name)}">
        <span class="tpl-card__frame"><img class="tpl-card__desk" src="${escape(state.previewBase)}plantillas/${escape(template.id)}.webp" alt="" loading="lazy"><img class="tpl-card__phone" src="${escape(state.previewBase)}plantillas/${escape(template.id)}-mobile.webp" alt="" loading="lazy"></span>
        <span class="tpl-card__meta"><strong>${escape(template.name)}</strong><small>${escape(label(template.category))}</small></span>
        <span class="tpl-card__desc">${escape(template.description)}</span>
      </button>
    </li>`).join('')}</ul>`;
}

/** One template on the merchant's own store (spec 2026-09-26 §1.2); the frame is filled by `openTemplateGallery`. */
export function renderTemplatePreview(template: TemplateSummary, state: GalleryState): string {
  const off = state.busy ? 'disabled' : '';
  const width = state.width || 'desktop';
  const size = (value: 'desktop' | 'phone', text: string) => `<button type="button" data-template-width="${value}" aria-pressed="${width === value}" ${off}>${text}</button>`;
  return `<header class="tpl-preview-bar">
      <button type="button" class="tpl-back" data-template-back ${off}>← Volver</button>
      <div class="tpl-preview-title"><strong>${escape(template.name)}</strong><small>${escape(label(template.category))}</small></div>
      <div class="tpl-preview-nav"><button type="button" data-template-prev aria-label="Plantilla anterior" ${off}>‹</button><button type="button" data-template-next aria-label="Plantilla siguiente" ${off}>›</button></div>
      <div class="tpl-width" role="group" aria-label="Tamaño de la vista previa">${size('desktop', 'Escritorio')}${size('phone', 'Celular')}</div>
      <button type="button" class="button button--publish" data-template-apply ${off}>${state.busy ? (state.adapting ? 'Aplicando y adaptando…' : 'Aplicando…') : `Usar ${escape(template.name)}`}</button>
      <button type="button" class="tpl-close" data-template-close aria-label="Cerrar"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
    </header>
    ${state.error ? `<p class="tpl-error" role="alert">${escape(state.error)}</p>` : ''}
    <p class="tpl-preview-note" data-template-confirm>Así se verá tu tienda con tus productos, precios y fotos.${state.hasSite ? ' Tu diseño actual queda guardado en el historial y puedes volver a él.' : ''}</p>
    <div class="tpl-preview tpl-preview--${width}"><iframe class="tpl-preview__frame" title="Vista previa de ${escape(template.name)}" sandbox="allow-scripts" referrerpolicy="no-referrer"></iframe><p class="tpl-preview__loading" data-template-loading>Preparando la vista previa con tus productos…</p></div>`;
}

export type TemplateChoice = { id: string; name: string; reason: string };

/** YAPI's three suggestions (spec 2026-09-26): the card itself is the choice, no separate button. */
export function renderTemplateChoices(choices: TemplateChoice[], previewBase: string, off: boolean): string {
  return `<div class="tpl-choices">${choices.map(choice => `<button type="button" class="tpl-choice" data-template-choice="${escape(choice.id)}" data-template-name="${escape(choice.name)}" ${off ? 'disabled' : ''}>
    <img src="${escape(previewBase)}plantillas/${escape(choice.id)}.webp" alt="" loading="lazy">
    <strong>${escape(choice.name)}</strong><span>${escape(choice.reason)}</span>
  </button>`).join('')}</div>`;
}

/** Opens the gallery; `applied` receives the new revision once the template is saved. */
export async function openTemplateGallery(api: MerchantStudioApi, options: { storeId: string; revision: number; hasSite: boolean; applied: (revision: number) => Promise<void> }) {
  const dialog = document.createElement('dialog'); dialog.className = 'tpl-dialog'; dialog.setAttribute('aria-label', 'Plantillas');
  const state: GalleryState = { category: '', selected: '', busy: false, error: '', hasSite: options.hasSite, previewBase: import.meta.env.BASE_URL, width: 'desktop' };
  const snapshots = new Map<string, Promise<SourceSnapshot>>();
  const loadImages = createPreviewImageLoader(API_BASE_URL);
  let templates: TemplateSummary[] = [];
  document.body.append(dialog); dialog.innerHTML = '<p role="status">Cargando plantillas…</p>'; dialog.showModal();
  dialog.addEventListener('close', () => dialog.remove());
  dialog.addEventListener('cancel', event => { if (state.busy) event.preventDefault(); });
  const shown = () => templates.filter(template => !state.category || template.category === state.category);
  function step(delta: number) {
    const list = shown(); const at = list.findIndex(template => template.id === state.selected);
    if (state.busy || at < 0 || list.length < 2) return;
    state.selected = list[(at + delta + list.length) % list.length].id; state.error = ''; render();
  }
  async function fillPreview() {
    const id = state.selected;
    const frame = dialog.querySelector<HTMLIFrameElement>('iframe.tpl-preview__frame');
    const loading = dialog.querySelector<HTMLElement>('[data-template-loading]');
    if (!id || !frame) return;
    try {
      if (!snapshots.has(id)) snapshots.set(id, api.templatePreview(options.storeId, id));
      const snapshot = await loadImages(await snapshots.get(id)!);
      if (state.selected !== id || !frame.isConnected) return;
      frame.srcdoc = sourcePreviewDocument(snapshot, 'index.html', {});
      frame.addEventListener('load', () => { if (loading) loading.hidden = true; }, { once: true });
    } catch (error) {
      snapshots.delete(id);
      if (state.selected === id && loading) { loading.textContent = error instanceof Error ? error.message : 'No se pudo preparar la vista previa.'; loading.setAttribute('role', 'alert'); }
    }
  }
  function render() {
    dialog.innerHTML = renderTemplateGallery(templates, state);
    dialog.querySelector('[data-template-close]')?.addEventListener('click', () => { if (!state.busy) dialog.close(); });
    dialog.querySelectorAll<HTMLButtonElement>('[data-template-category]').forEach(button => button.addEventListener('click', () => { state.category = button.dataset.templateCategory || ''; render(); }));
    dialog.querySelectorAll<HTMLButtonElement>('[data-template-pick]').forEach(button => button.addEventListener('click', () => { state.selected = button.dataset.templatePick || ''; state.error = ''; render(); dialog.querySelector<HTMLElement>('[data-template-apply]')?.focus(); }));
    dialog.querySelector('[data-template-back]')?.addEventListener('click', () => { state.selected = ''; state.error = ''; render(); });
    dialog.querySelector('[data-template-prev]')?.addEventListener('click', () => step(-1));
    dialog.querySelector('[data-template-next]')?.addEventListener('click', () => step(1));
    // The size toggle only resizes the frame, so the loaded preview is kept.
    dialog.querySelectorAll<HTMLButtonElement>('[data-template-width]').forEach(button => button.addEventListener('click', () => {
      state.width = button.dataset.templateWidth === 'phone' ? 'phone' : 'desktop';
      dialog.querySelector('.tpl-preview')?.classList.toggle('tpl-preview--phone', state.width === 'phone');
      dialog.querySelector('.tpl-preview')?.classList.toggle('tpl-preview--desktop', state.width === 'desktop');
      dialog.querySelectorAll('[data-template-width]').forEach(other => other.setAttribute('aria-pressed', String(other === button)));
    }));
    dialog.querySelector('[data-template-apply]')?.addEventListener('click', () => void apply());
    void fillPreview();
  }
  dialog.addEventListener('keydown', event => {
    if (!state.selected || event.target instanceof HTMLInputElement) return;
    if (event.key === 'ArrowLeft') { event.preventDefault(); step(-1); }
    if (event.key === 'ArrowRight') { event.preventDefault(); step(1); }
  });
  async function apply() {
    if (state.busy || !state.selected) return;
    state.busy = true; state.adapting = false; state.error = ''; render();
    // A YAPI-flow store is adapted after the template is applied, which takes longer: say so.
    const slow = window.setTimeout(() => { if (state.busy) { state.adapting = true; const button = dialog.querySelector('[data-template-apply]'); if (button) button.textContent = 'Aplicando y adaptando…'; } }, 2000);
    try {
      const saved = await api.applyTemplate(options.storeId, state.selected, options.revision);
      dialog.close();
      await options.applied(saved.revision);
    } catch (error) {
      state.busy = false; state.adapting = false; state.error = error instanceof Error ? error.message : 'No se pudo aplicar la plantilla.'; render();
    } finally { window.clearTimeout(slow); }
  }
  try { templates = await api.listTemplates(); render(); }
  catch { dialog.innerHTML = '<p role="alert">No se pudieron cargar las plantillas.</p><button type="button" class="button" data-template-close>Cerrar</button>'; dialog.querySelector('[data-template-close]')?.addEventListener('click', () => dialog.close()); }
}
