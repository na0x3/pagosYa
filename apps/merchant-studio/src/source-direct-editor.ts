import type { MerchantStudioApi, SourceVersion } from './api';
import { escapeHtml as escape } from './studio-ui';
import './source-direct-editor.css';

export type VisualField = { id: string; path: string; label: string; kind: 'text' | 'image' | 'color' | 'select'; value: string; options?: string[]; optionLabels?: Record<string, string> };
export type VisualFields = { revision: number; fields: VisualField[] };
type Mount = { storeId: string; version: SourceVersion; locked: boolean; close(): void; pending(value: boolean): void; saved(): Promise<void>; prepare(text: string): void };

export function createDirectEditor(api: MerchantStudioApi) {
  let host: HTMLElement | null = null, options: Mount | null = null;
  let key = '', fields: VisualField[] = [], selected = '', draft = '', error = '', hint = '', pending = false, loading = false;
  let loadRequest = 0, undoRevision: number | null = null, undoKey = '';
  const choose = (field: VisualField) => { selected = field.id; draft = field.value; error = ''; hint = ''; };
  function draw() {
    if (!host || !options) return;
    const field = fields.find(item => item.id === selected), locked = options.locked || pending || loading;
    const images = options.version.snapshot.files.filter(file => /\.(png|jpe?g|webp|avif|gif|svg)$/i.test(file.path));
    const choices = field?.options || (field?.kind === 'image' ? [...new Set([field.value, ...images.map(image => image.path)])] : []);
    host.innerHTML = `<section class="source-direct-editor" aria-label="Editar diseño"><header><div><h2>Editar diseño</h2><p>Haz clic en un texto o una imagen del sitio.</p></div><button type="button" data-direct-close aria-label="Cerrar edición visual" ${pending ? 'disabled' : ''}>×</button></header>
      ${loading ? '<p role="status">Buscando elementos editables…</p>' : ''}${error ? `<p role="alert">${escape(error)}</p>` : ''}${hint ? `<p role="status">${escape(hint)}</p>` : ''}
      ${fields.length ? `<label>Elemento<select data-direct-field ${locked ? 'disabled' : ''}>${fields.map(item => `<option value="${escape(item.id)}" ${item.id === selected ? 'selected' : ''}>${escape(item.label)} · ${escape(item.value.slice(0, 55))}</option>`).join('')}</select></label>` : !loading ? '<p>Este diseño necesita un ajuste de YAPI para editar sus elementos personalizados.</p>' : ''}
      ${field ? `<form data-direct-form><label>${field.kind === 'image' ? 'Imagen guardada' : field.kind === 'color' ? 'Color' : field.kind === 'select' ? 'Presentación' : 'Texto'}${choices.length ? `<select data-direct-value ${locked ? 'disabled' : ''}>${choices.map(value => `<option value="${escape(value)}" ${value === draft ? 'selected' : ''}>${escape(field.optionLabels?.[value] || (value === '__end__' ? 'Al final' : value.split('/').at(-1) || value))}</option>`).join('')}</select>` : field.kind === 'color' ? `<input type="text" data-direct-value value="${escape(draft)}" maxlength="80" ${locked ? 'disabled' : ''}>` : `<textarea data-direct-value rows="4" maxlength="3000" ${locked ? 'disabled' : ''}>${escape(draft)}</textarea>`}</label>
      <button class="direct-save" ${locked || draft === field.value ? 'disabled' : ''}>${pending ? 'Guardando…' : 'Guardar cambio'}</button></form><button type="button" data-direct-ai ${locked ? 'disabled' : ''}>Pedir un cambio a YAPI</button>` : ''}
      ${undoRevision ? `<button type="button" data-direct-undo ${locked ? 'disabled' : ''}>Deshacer último cambio visual</button>` : ''}<small>Los cambios directos se guardan como una nueva revisión.</small></section>`;
    host.querySelector('[data-direct-close]')?.addEventListener('click', () => options?.close());
    host.querySelector('[data-direct-field]')?.addEventListener('change', event => { const next = fields.find(item => item.id === (event.target as HTMLSelectElement).value); if (next) { choose(next); draw(); } });
    host.querySelector('[data-direct-value]')?.addEventListener('input', event => {
      draft = (event.target as HTMLInputElement).value;
      const save = host?.querySelector<HTMLButtonElement>('.direct-save'); if (save) save.disabled = locked || draft === field?.value;
    });
    host.querySelector('[data-direct-form]')?.addEventListener('submit', event => { event.preventDefault(); if (field && !locked && draft !== field.value) void save(field); });
    host.querySelector('[data-direct-undo]')?.addEventListener('click', () => { if (undoRevision && !locked) void undo(); });
    host.querySelector('[data-direct-ai]')?.addEventListener('click', () => { if (field) options?.prepare(`En ${field.path}, cambia solo el elemento «${field.label}» cuyo valor actual es ${JSON.stringify(field.value)}. Conserva las demás secciones, los productos y el comportamiento de compra. Mi cambio: `); });
  }
  async function save(field: VisualField) {
    if (!options) return;
    const current = options, revision = current.version.revision, value = draft;
    pending = true; error = ''; current.pending(true); draw();
    try { const saved = await api.editSourceVisual(current.storeId, { revision, fieldId: field.id, value }); undoRevision = revision; undoKey = `${current.storeId}:${saved.revision}`; await current.saved(); }
    catch (cause) { error = cause instanceof Error ? cause.message : 'No pudimos guardar el cambio.'; }
    finally { pending = false; current.pending(false); draw(); }
  }
  async function undo() {
    if (!options || !undoRevision) return;
    const current = options;
    pending = true; current.pending(true); error = ''; draw();
    try { await api.restoreSource(current.storeId, undoRevision, current.version.revision); undoRevision = null; await current.saved(); }
    catch (cause) { error = cause instanceof Error ? cause.message : 'No pudimos deshacer el cambio.'; }
    finally { pending = false; current.pending(false); draw(); }
  }
  return {
    mount(element: HTMLElement, input: Mount) {
      host = element; options = input;
      const nextKey = `${input.storeId}:${input.version.revision}`;
      if (nextKey !== key) {
        if (undoRevision && nextKey !== undoKey) { undoRevision = null; undoKey = ''; }
        key = nextKey; fields = []; selected = ''; draft = ''; hint = ''; error = ''; loading = true;
        const request = ++loadRequest;
        void api.sourceVisualFields(input.storeId, input.version.revision).then(result => {
          if (request !== loadRequest || result.revision !== options?.version.revision) return;
          fields = result.fields; if (fields[0]) choose(fields[0]);
        }).catch(cause => { if (request === loadRequest) error = cause instanceof Error ? cause.message : 'No pudimos cargar los elementos.'; })
          .finally(() => { if (request === loadRequest) { loading = false; draw(); } });
      }
      draw();
    },
    select(value: unknown, kind: unknown) {
      if (typeof value !== 'string' || value.length > 3000 || !['text', 'image'].includes(String(kind))) return;
      const normalize = (text: string) => text.replace(/\s+/g, ' ').trim();
      const matches = fields.filter(field => field.kind === kind && normalize(field.value) === normalize(value));
      if (matches.length === 1) choose(matches[0]);
      else hint = matches.length > 1 ? 'Este contenido aparece más de una vez. Elige el elemento en la lista.' : 'Este elemento es personalizado. Selecciona otro elemento o pide el ajuste a YAPI.';
      draw(); host?.querySelector<HTMLElement>('[data-direct-value]')?.focus();
    },
  };
}
