import { escapeHtml as escape } from './studio-ui';
import './product-content-blocks-editor.css';

export type ContentBlockInput =
  | { id?: string; type: 'media'; imageUrl: string; alt: string; caption?: string }
  | { id?: string; type: 'compare'; title: string; beforeUrl: string; afterUrl: string; beforeLabel: string; afterLabel: string; alt: string };
type Draft = Record<string, string> & { type: 'media' | 'compare' };
const fields = {
  alt: ['Descripción de la foto (para lectores de pantalla)', 160],
  caption: ['Texto de la foto (opcional)', 140],
  title: ['Título', 60], beforeLabel: ['Etiqueta antes', 24], afterLabel: ['Etiqueta después', 24],
} as const;

export function mountContentBlocksEditor(host: HTMLElement, options: { initial: ContentBlockInput[]; photos: () => Array<{ preview: string }>; max?: number }) {
  const max = Number.isInteger(options.max) ? Math.max(1, Math.min(6, options.max!)) : 6;
  const rows: Draft[] = options.initial.map(row => ({ ...row }));
  const photoKeys = (row: Draft) => row.type === 'media' ? ['imageUrl'] : ['beforeUrl', 'afterUrl'];
  host.classList.add('product-content-editor');
  host.innerHTML = '<details><summary>Contenido del producto (opcional)</summary><p>Agrega fotos con texto o una comparación antes / después usando las fotos del producto.</p><div data-block-rows></div><div class="product-block-actions"><span data-block-count aria-live="polite"></span><details><summary>Agregar bloque</summary><button type="button" data-block-add="media">Foto con texto</button><button type="button" data-block-add="compare">Antes / después</button></details></div></details>';
  const container = host.querySelector<HTMLElement>('[data-block-rows]')!;
  const input = (row: Draft, key: keyof typeof fields) => `<label>${fields[key][0]}<input data-block-field="${key}" maxlength="${fields[key][1]}" value="${escape(row[key] || '')}"></label>`;
  function draw() {
    const photos = options.photos().map(photo => photo.preview);
    const photoInput = (row: Draft, key: string, label: string) => {
      const missing = Boolean(row[key] && !photos.includes(row[key]));
      return `<label>${label}<select data-block-field="${key}" aria-invalid="${missing}"><option value="">Elige una foto</option>${photos.map((url, i) => `<option value="${escape(url)}" ${row[key] === url ? 'selected' : ''}>Foto ${i + 1}</option>`).join('')}${missing ? `<option value="${escape(row[key])}" selected>Foto retirada</option>` : ''}</select></label>`;
    };
    container.innerHTML = rows.map((row, index) => `<article data-block-row="${index}"><header><h4>${index + 1}. ${row.type === 'media' ? 'Foto con texto' : 'Antes / después'}</h4><div><button type="button" data-block-up aria-label="Subir bloque ${index + 1}" ${index === 0 ? 'disabled' : ''}>↑</button><button type="button" data-block-down aria-label="Bajar bloque ${index + 1}" ${index === rows.length - 1 ? 'disabled' : ''}>↓</button><button type="button" data-block-delete aria-label="Eliminar bloque ${index + 1}">Eliminar</button></div></header>${row.type === 'media' ? photoInput(row, 'imageUrl', 'Foto') + input(row, 'alt') + input(row, 'caption') : input(row, 'title') + photoInput(row, 'beforeUrl', 'Foto antes') + photoInput(row, 'afterUrl', 'Foto después') + input(row, 'beforeLabel') + input(row, 'afterLabel') + input(row, 'alt')}</article>`).join('');
    host.querySelector('[data-block-count]')!.textContent = `${rows.length} de ${max}`;
    host.querySelectorAll<HTMLButtonElement>('[data-block-add]').forEach(button => { button.disabled = rows.length >= max; });
  }
  function edit(event: Event) {
    const input = event.target;
    if (!(input instanceof HTMLInputElement || input instanceof HTMLSelectElement) || !input.hasAttribute('data-block-field')) return;
    const row = input.closest<HTMLElement>('[data-block-row]');
    if (!row) return;
    rows[Number(row.dataset.blockRow)][input.dataset.blockField!] = input.value;
    if (input instanceof HTMLSelectElement) input.setAttribute('aria-invalid', String(Boolean(input.value && !options.photos().some(photo => photo.preview === input.value))));
  }
  function click(event: Event) {
    const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('button') : null;
    if (!button || !host.contains(button) || button.disabled || button.matches(':disabled')) return;
    if (button.dataset.blockAdd && rows.length < max) {
      if (button.dataset.blockAdd === 'media') rows.push({ type: 'media', imageUrl: '', alt: '', caption: '' });
      else rows.push({ type: 'compare', title: '', beforeUrl: '', afterUrl: '', beforeLabel: '', afterLabel: '', alt: '' });
      draw(); host.querySelector<HTMLDetailsElement>('details')!.open = true;
      container.lastElementChild?.querySelector<HTMLElement>('input,select')?.focus();
      return;
    }
    const node = button.closest<HTMLElement>('[data-block-row]'); if (!node) return;
    const index = Number(node.dataset.blockRow);
    let next = index;
    if (button.hasAttribute('data-block-delete')) rows.splice(index, 1);
    else {
      next = index + (button.hasAttribute('data-block-up') ? -1 : 1);
      if (next < 0 || next >= rows.length) return;
      [rows[index], rows[next]] = [rows[next], rows[index]];
    }
    draw();
    (container.children[Math.min(next, rows.length - 1)]?.querySelector<HTMLElement>('input,select') || host.querySelector<HTMLElement>('[data-block-add]'))?.focus();
  }
  host.addEventListener('input', edit); host.addEventListener('change', edit); host.addEventListener('click', click);
  draw();
  return {
    values(): ContentBlockInput[] {
      if (rows.length > max) throw Error(`Usa hasta ${max} bloques por producto.`);
      const photos = options.photos().map(photo => photo.preview);
      return rows.map((row, index) => {
        for (const key of photoKeys(row)) {
          if (!row[key]) throw Error(`Elige una foto en el bloque ${index + 1}.`);
          if (!photos.includes(row[key])) throw Error(`Una foto de un bloque fue retirada. Elige otra foto para el bloque ${index + 1}.`);
        }
        const text = (key: keyof typeof fields, optional = false) => {
          const value = (row[key] || '').trim();
          if (!optional && !value) throw Error(`Falta ${key === 'alt' ? 'la descripción de la foto' : key === 'title' ? 'el título' : 'la etiqueta ' + (key === 'beforeLabel' ? 'antes' : 'después')} en el bloque ${index + 1}.`);
          if (value.length > fields[key][1]) throw Error(`Usa hasta ${fields[key][1]} caracteres en ${fields[key][0].toLowerCase()} del bloque ${index + 1}.`);
          return value;
        };
        const base = { ...(row.id ? { id: row.id } : {}), alt: text('alt') };
        if (row.type === 'media') { const caption = text('caption', true); return { ...base, type: 'media', imageUrl: row.imageUrl, ...(caption ? { caption } : {}) }; }
        return { ...base, type: 'compare', title: text('title'), beforeUrl: row.beforeUrl, afterUrl: row.afterUrl, beforeLabel: text('beforeLabel'), afterLabel: text('afterLabel') };
      });
    },
    refreshPhotos: draw,
    dispose() { host.removeEventListener('input', edit); host.removeEventListener('change', edit); host.removeEventListener('click', click); host.replaceChildren(); },
  };
}
