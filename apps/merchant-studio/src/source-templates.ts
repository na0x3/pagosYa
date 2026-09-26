import { MerchantStudioApi } from './api';
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

export type GalleryState = { category: string; selected: string; busy: boolean; error: string; hasSite: boolean; previewBase: string };

export function renderTemplateGallery(templates: TemplateSummary[], state: GalleryState): string {
  const off = state.busy ? 'disabled' : '';
  const shown = templates.filter(template => !state.category || template.category === state.category);
  const chosen = templates.find(template => template.id === state.selected);
  const chip = (value: string, text: string) => `<button type="button" class="tpl-chip" data-template-category="${escape(value)}" aria-pressed="${state.category === value}" ${off}>${escape(text)}</button>`;
  return `<header class="tpl-head"><div><h2>Plantillas</h2><p>Tiendas completas, listas para tus productos. Elige una y cambia fotos y textos cuando quieras.</p></div><button type="button" class="button" data-template-close>Cerrar</button></header>
    ${state.error ? `<p class="tpl-error" role="alert">${escape(state.error)}</p>` : ''}
    ${chosen ? `<section class="tpl-confirm" data-template-confirm aria-live="polite">
      <img src="${escape(state.previewBase)}plantillas/${escape(chosen.id)}.webp" alt="" aria-hidden="true">
      <div><h3>${escape(chosen.name)}</h3><p>Tu tienda tomará este diseño con tus productos, precios y fotos.${state.hasSite ? ' Tu diseño actual queda guardado en el historial y puedes volver a él.' : ''}</p>
      <div class="tpl-confirm__actions"><button type="button" class="button button--publish" data-template-apply ${off}>${state.busy ? 'Aplicando…' : `Usar ${escape(chosen.name)}`}</button><button type="button" class="button button--secondary" data-template-back ${off}>Ver otras</button></div></div>
    </section>` : ''}
    <nav class="tpl-chips" aria-label="Categorías">${chip('', 'Todas')}${templateCategories(templates).map(category => chip(category, label(category))).join('')}</nav>
    <ul class="tpl-grid">${shown.map(template => `<li class="tpl-card" data-template-card="${escape(template.id)}">
      <button type="button" class="tpl-card__pick" data-template-pick="${escape(template.id)}" ${off} aria-label="Ver ${escape(template.name)}">
        <span class="tpl-card__frame"><img src="${escape(state.previewBase)}plantillas/${escape(template.id)}.webp" alt="Vista previa de ${escape(template.name)}" loading="lazy"></span>
        <span class="tpl-card__meta"><strong>${escape(template.name)}</strong><small>${escape(label(template.category))}</small></span>
        <span class="tpl-card__desc">${escape(template.description)}</span>
      </button>
    </li>`).join('')}</ul>`;
}

/** Opens the gallery; `applied` receives the new revision once the template is saved. */
export async function openTemplateGallery(api: MerchantStudioApi, options: { storeId: string; revision: number; hasSite: boolean; applied: (revision: number) => Promise<void> }) {
  const dialog = document.createElement('dialog'); dialog.className = 'tpl-dialog'; dialog.setAttribute('aria-label', 'Plantillas');
  const state: GalleryState = { category: '', selected: '', busy: false, error: '', hasSite: options.hasSite, previewBase: import.meta.env.BASE_URL };
  let templates: TemplateSummary[] = [];
  document.body.append(dialog); dialog.innerHTML = '<p role="status">Cargando plantillas…</p>'; dialog.showModal();
  dialog.addEventListener('close', () => dialog.remove());
  dialog.addEventListener('cancel', event => { if (state.busy) event.preventDefault(); });
  function render() {
    dialog.innerHTML = renderTemplateGallery(templates, state);
    dialog.querySelector('[data-template-close]')?.addEventListener('click', () => { if (!state.busy) dialog.close(); });
    dialog.querySelectorAll<HTMLButtonElement>('[data-template-category]').forEach(button => button.addEventListener('click', () => { state.category = button.dataset.templateCategory || ''; render(); }));
    dialog.querySelectorAll<HTMLButtonElement>('[data-template-pick]').forEach(button => button.addEventListener('click', () => { state.selected = button.dataset.templatePick || ''; state.error = ''; render(); dialog.querySelector<HTMLElement>('[data-template-apply]')?.focus(); }));
    dialog.querySelector('[data-template-back]')?.addEventListener('click', () => { state.selected = ''; render(); });
    dialog.querySelector('[data-template-apply]')?.addEventListener('click', () => void apply());
  }
  async function apply() {
    if (state.busy || !state.selected) return;
    state.busy = true; state.error = ''; render();
    try {
      const saved = await api.applyTemplate(options.storeId, state.selected, options.revision);
      dialog.close();
      await options.applied(saved.revision);
    } catch (error) {
      state.busy = false; state.error = error instanceof Error ? error.message : 'No se pudo aplicar la plantilla.'; render();
    }
  }
  try { templates = await api.listTemplates(); render(); }
  catch { dialog.innerHTML = '<p role="alert">No se pudieron cargar las plantillas.</p><button type="button" class="button" data-template-close>Cerrar</button>'; dialog.querySelector('[data-template-close]')?.addEventListener('click', () => dialog.close()); }
}
