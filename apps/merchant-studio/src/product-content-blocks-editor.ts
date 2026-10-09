import { escapeHtml as escape } from './studio-ui';
import { PRODUCT_HIGHLIGHT_ICON_LABELS } from './product-highlight-icons';
import './product-content-blocks-editor.css';

/** Only YAPI's blocks carry origin 'yapi'; any edit makes a block the merchant's (spec 2026-10-09). */
type Origin = { origin?: 'yapi' };
export type PageBlockInput = (
  | { id?: string; type: 'story'; title?: string; problem: string; tried: string; solution: string }
  | { id?: string; type: 'versus'; title?: string; ours: string; theirs: string; rows: Array<{ label: string; ours: boolean; theirs: boolean }> }
  | { id?: string; type: 'faq'; title?: string; items: Array<{ q: string; a: string }> }
  | { id?: string; type: 'details'; items: Array<{ imageUrl: string; title: string; text: string; alt: string }> }
  | { id?: string; type: 'features'; title?: string; items: Array<{ icon: string; label: string; detail: string }> }
) & Origin;
export type ContentBlockInput = (
  | { id?: string; type: 'media'; imageUrl: string; alt: string; caption?: string }
  | { id?: string; type: 'compare'; title: string; beforeUrl: string; afterUrl: string; beforeLabel: string; afterLabel: string; alt: string }
) & Origin | PageBlockInput;
type Draft = Record<string, string> & { type: 'media' | 'compare' };
/** A long-page section is edited in place as the object it is, so an untouched one is saved exactly as YAPI wrote it. */
type PageRow = { page: PageBlockInput };
type Row = Draft | PageRow;
const isPage = (row: Row): row is PageRow => 'page' in row;
const PAGE_TYPES = ['story', 'versus', 'faq', 'details', 'features'];
const PAGE_NAMES: Record<string, string> = { story: 'Historia', versus: 'Comparación', faq: 'Preguntas frecuentes', details: 'Detalles con foto', features: 'Características' };
/** Block-level text: [label, max, textarea]. */
const PAGE_FIELDS: Record<string, Array<[string, string, number, boolean]>> = {
  story: [['title', 'Título (opcional)', 60, false], ['problem', 'El problema', 220, true], ['tried', 'Lo que la gente prueba', 220, true], ['solution', 'Cómo lo resuelve', 260, true]],
  versus: [['title', 'Título (opcional)', 60, false], ['ours', 'Tu producto', 24, false], ['theirs', 'Lo de siempre', 24, false]],
  faq: [['title', 'Título (opcional)', 60, false]],
  details: [],
  features: [['title', 'Título (opcional)', 60, false]],
};
/** Item text per type: [key, label, max, textarea]; versus rows add two checkboxes, details a photo, features an icon. */
const ITEM_FIELDS: Record<string, Array<[string, string, number, boolean]>> = {
  versus: [['label', 'Característica', 48, false]],
  faq: [['q', 'Pregunta', 120, false], ['a', 'Respuesta', 400, true]],
  details: [['title', 'Título', 40, false], ['text', 'Texto', 160, true], ['alt', 'Descripción de la foto', 160, false]],
  features: [['label', 'Dato', 24, false], ['detail', 'Detalle', 60, false]],
};
const ITEM_LIMITS: Record<string, [number, number]> = { versus: [2, 8], faq: [2, 8], details: [1, 4], features: [3, 6] };
const OPTIONAL_KEYS = new Set(['title']);
const itemsOf = (page: PageBlockInput): Array<Record<string, unknown>> => page.type === 'versus' ? page.rows as Array<Record<string, unknown>> : page.type === 'story' ? [] : (page as { items: Array<Record<string, unknown>> }).items;
const newItem = (type: string): Record<string, unknown> => type === 'versus' ? { label: '', ours: true, theirs: false } : type === 'faq' ? { q: '', a: '' } : type === 'details' ? { imageUrl: '', title: '', text: '', alt: '' } : { icon: PRODUCT_HIGHLIGHT_ICON_LABELS[0][0], label: '', detail: '' };
const fields = {
  alt: ['Descripción de la foto (para lectores de pantalla)', 160],
  caption: ['Texto de la foto (opcional)', 140],
  title: ['Título', 60], beforeLabel: ['Etiqueta antes', 24], afterLabel: ['Etiqueta después', 24],
} as const;

export function mountContentBlocksEditor(host: HTMLElement, options: { initial: ContentBlockInput[]; photos: () => Array<{ preview: string }>; max?: number }) {
  const max = Number.isInteger(options.max) ? Math.max(1, Math.min(12, options.max!)) : 12;
  const rows: Row[] = options.initial.map(row => PAGE_TYPES.includes(row.type) ? { page: structuredClone(row as PageBlockInput) } : { ...(row as Record<string, string>) } as Draft);
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
    const pageMarkup = (page: PageBlockInput) => {
      const text = (attr: string, key: string, label: string, value: unknown, max: number, area: boolean) => area
        ? `<label>${label}<textarea ${attr}="${key}" maxlength="${max}">${escape(String(value ?? ''))}</textarea></label>`
        : `<label>${label}<input ${attr}="${key}" maxlength="${max}" value="${escape(String(value ?? ''))}"></label>`;
      const own = PAGE_FIELDS[page.type].map(([key, label, maxLength, area]) => text('data-block-field', key, label, (page as Record<string, unknown>)[key], maxLength, area)).join('');
      if (page.type === 'story') return own;
      const items = itemsOf(page), [min, most] = ITEM_LIMITS[page.type];
      const rowsMarkup = items.map((item, i) => {
        const extra = page.type === 'versus'
          ? `<label><input type="checkbox" data-item-field="ours" ${item.ours ? 'checked' : ''}> ${escape(page.ours || 'Tu producto')}</label><label><input type="checkbox" data-item-field="theirs" ${item.theirs ? 'checked' : ''}> ${escape(page.theirs || 'Lo de siempre')}</label>`
          : page.type === 'details'
            ? `<label>Foto<select data-item-field="imageUrl" aria-invalid="${Boolean(item.imageUrl && !photos.includes(String(item.imageUrl)))}"><option value="">Elige una foto</option>${photos.map((url, n) => `<option value="${escape(url)}" ${item.imageUrl === url ? 'selected' : ''}>Foto ${n + 1}</option>`).join('')}${item.imageUrl && !photos.includes(String(item.imageUrl)) ? `<option value="${escape(String(item.imageUrl))}" selected>Foto retirada</option>` : ''}</select></label>`
            : page.type === 'features'
              ? `<label>Icono<select data-item-field="icon">${PRODUCT_HIGHLIGHT_ICON_LABELS.map(([name, label]) => `<option value="${escape(name)}" ${item.icon === name ? 'selected' : ''}>${escape(label)}</option>`).join('')}</select></label>`
              : '';
        return `<fieldset data-item-index="${i}"><legend>${i + 1}</legend>${page.type === 'features' || page.type === 'details' ? extra : ''}${ITEM_FIELDS[page.type].map(([key, label, maxLength, area]) => text('data-item-field', key, label, item[key], maxLength, area)).join('')}${page.type === 'versus' ? extra : ''}<button type="button" data-item-remove="${i}" ${items.length <= min ? 'disabled' : ''}>Quitar</button></fieldset>`;
      }).join('');
      return `${own}${rowsMarkup}<button type="button" data-item-add ${items.length >= most ? 'disabled' : ''}>Agregar fila</button>`;
    };
    container.innerHTML = rows.map((row, index) => isPage(row)
      ? `<article data-block-row="${index}" data-page-type="${escape(row.page.type)}"><header><h4>${index + 1}. ${PAGE_NAMES[row.page.type]}${row.page.origin === 'yapi' ? ' <span class="product-block-origin">Escrito por YAPI</span>' : ''}</h4><div><button type="button" data-block-up aria-label="Subir bloque ${index + 1}" ${index === 0 ? 'disabled' : ''}>↑</button><button type="button" data-block-down aria-label="Bajar bloque ${index + 1}" ${index === rows.length - 1 ? 'disabled' : ''}>↓</button><button type="button" data-block-delete aria-label="Eliminar bloque ${index + 1}">Eliminar</button></div></header>${pageMarkup(row.page)}</article>`
      : `<article data-block-row="${index}"><header><h4>${index + 1}. ${row.type === 'media' ? 'Foto con texto' : 'Antes / después'}</h4><div><button type="button" data-block-up aria-label="Subir bloque ${index + 1}" ${index === 0 ? 'disabled' : ''}>↑</button><button type="button" data-block-down aria-label="Bajar bloque ${index + 1}" ${index === rows.length - 1 ? 'disabled' : ''}>↓</button><button type="button" data-block-delete aria-label="Eliminar bloque ${index + 1}">Eliminar</button></div></header>${row.type === 'media' ? photoInput(row, 'imageUrl', 'Foto') + input(row, 'alt') + input(row, 'caption') : input(row, 'title') + photoInput(row, 'beforeUrl', 'Foto antes') + photoInput(row, 'afterUrl', 'Foto después') + input(row, 'beforeLabel') + input(row, 'afterLabel') + input(row, 'alt')}</article>`).join('');
    host.querySelector('[data-block-count]')!.textContent = `${rows.length} de ${max}`;
    host.querySelectorAll<HTMLButtonElement>('[data-block-add]').forEach(button => { button.disabled = rows.length >= max; });
  }
  function edit(event: Event) {
    const input = event.target;
    if (!(input instanceof HTMLInputElement || input instanceof HTMLSelectElement || input instanceof HTMLTextAreaElement)) return;
    const row = input.closest<HTMLElement>('[data-block-row]');
    if (!row) return;
    const target = rows[Number(row.dataset.blockRow)];
    if (target && isPage(target)) {
      const value = input instanceof HTMLInputElement && input.type === 'checkbox' ? input.checked : input.value;
      const item = input.closest<HTMLElement>('[data-item-index]');
      if (input.dataset.blockField) (target.page as Record<string, unknown>)[input.dataset.blockField] = value;
      else if (item && input.dataset.itemField) itemsOf(target.page)[Number(item.dataset.itemIndex)][input.dataset.itemField] = value;
      else return;
      delete target.page.origin;
      return;
    }
    if (!input.hasAttribute('data-block-field') || !target) return;
    target[input.dataset.blockField!] = input.value;
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
    const pageRow = rows[index];
    if (pageRow && isPage(pageRow) && (button.hasAttribute('data-item-add') || button.dataset.itemRemove)) {
      const items = itemsOf(pageRow.page), [min, most] = ITEM_LIMITS[pageRow.page.type];
      if (button.hasAttribute('data-item-add') && items.length < most) items.push(newItem(pageRow.page.type));
      else if (button.dataset.itemRemove && items.length > min) items.splice(Number(button.dataset.itemRemove), 1);
      delete pageRow.page.origin;
      draw();
      return;
    }
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
  /** A section ready to save: required text present, item counts within limits, detail photos still in the product. */
  function pageValue(page: PageBlockInput, index: number, photos: string[]): PageBlockInput {
    const clean = (value: unknown, key: string, label: string, maxLength: number) => {
      const text = String(value ?? '').trim();
      if (!text && !OPTIONAL_KEYS.has(key)) throw Error(`Falta «${label}» en el bloque ${index + 1}.`);
      if (text.length > maxLength) throw Error(`Usa hasta ${maxLength} caracteres en «${label}» del bloque ${index + 1}.`);
      return text;
    };
    const out: Record<string, unknown> = { ...(page.id ? { id: page.id } : {}), type: page.type };
    for (const [key, label, maxLength] of PAGE_FIELDS[page.type]) {
      const text = clean((page as Record<string, unknown>)[key], key === 'title' ? 'title' : key, label, maxLength);
      if (text) out[key] = text;
    }
    if (page.type !== 'story') {
      const items = itemsOf(page), [min, most] = ITEM_LIMITS[page.type];
      if (items.length < min || items.length > most) throw Error(`Usa entre ${min} y ${most} filas en el bloque ${index + 1}.`);
      out[page.type === 'versus' ? 'rows' : 'items'] = items.map(item => {
        const next: Record<string, unknown> = {};
        if (page.type === 'details') {
          if (!item.imageUrl) throw Error(`Elige una foto en el bloque ${index + 1}.`);
          if (!photos.includes(String(item.imageUrl))) throw Error(`Una foto de un bloque fue retirada. Elige otra foto para el bloque ${index + 1}.`);
          next.imageUrl = item.imageUrl;
        }
        if (page.type === 'features') next.icon = item.icon;
        for (const [key, label, maxLength] of ITEM_FIELDS[page.type]) next[key] = clean(item[key], key, label, maxLength);
        if (page.type === 'versus') { next.ours = Boolean(item.ours); next.theirs = Boolean(item.theirs); }
        return next;
      });
    }
    if (page.origin === 'yapi') out.origin = 'yapi';
    return out as PageBlockInput;
  }
  host.addEventListener('input', edit); host.addEventListener('change', edit); host.addEventListener('click', click);
  draw();
  return {
    values(): ContentBlockInput[] {
      if (rows.length > max) throw Error(`Usa hasta ${max} bloques por producto.`);
      const photos = options.photos().map(photo => photo.preview);
      return rows.map((row, index) => {
        if (isPage(row)) return pageValue(row.page, index, photos);
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
