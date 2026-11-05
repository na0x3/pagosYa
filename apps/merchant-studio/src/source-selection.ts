import type { PointArea, PointPage, PreviewViewing } from '@pagosya/storefront-preview';
import type { VisualField } from './source-visual-fields';

/** A picked part of the preview: a classic section id, or on a template store its address (page + number) or the circle drawn
 *  around it (spec 2026-11-05 point-at). */
export type SectionSelection = { sectionId: string; label: string; at?: number; page?: PointPage; area?: PointArea };
export type SelectionPayload = { sectionId: string; at?: number; page?: PointPage; area?: PointArea };
export type ViewingPayload = { page: PointPage; at?: number; sectionId?: string };

/** Each action pre-fills the composer with a precise sentence; the merchant can edit it before sending. */
export const QUICK_ACTIONS: Array<{ id: string; label: string; instruction: string }> = [
  { id: 'edit-text', label: 'Cambiar el texto', instruction: 'Cambia el texto de esta sección por: ' },
  { id: 'bigger', label: 'Hacer más grande', instruction: 'Haz esta sección más grande y con más presencia.' },
  { id: 'move-up', label: 'Mover arriba', instruction: 'Mueve esta sección una posición hacia arriba.' },
  { id: 'move-down', label: 'Mover abajo', instruction: 'Mueve esta sección una posición hacia abajo.' },
  { id: 'duplicate', label: 'Duplicar', instruction: 'Duplica esta sección justo debajo de la original.' },
  { id: 'hide', label: 'Ocultar', instruction: 'Oculta esta sección de la página sin borrar su contenido.' },
];

export function createSelectionState() {
  let current: SectionSelection | null = null;
  return {
    get: () => current,
    set(value: SectionSelection) {
      current = { sectionId: value.sectionId, label: value.label, ...(value.area ? { area: value.area } : typeof value.at === 'number' && value.page ? { at: value.at, page: value.page } : {}) };
    },
    clear() { current = null; },
  };
}

/** What a message carries about the pointed part: a circle, a template address, or a classic section id. */
export function selectionPayload(s: SectionSelection): SelectionPayload {
  return { sectionId: s.sectionId, ...(s.area ? { area: s.area } : typeof s.at === 'number' && s.page ? { at: s.at, page: s.page } : {}) };
}
export const selectionChipLabel = (s: SectionSelection) => s.area ? `zona marcada · ${s.label}` : s.label;
export const viewingPayload = (v: PreviewViewing): ViewingPayload => ({ page: v.page, ...(typeof v.at === 'number' ? { at: v.at } : {}), ...(v.sectionId ? { sectionId: v.sectionId } : {}) });
/** The section in the middle of the preview, kept per page (cleared when the page changes or reloads). */
export function createViewingState() {
  let current: PreviewViewing | null = null;
  return { get: () => current, set(value: PreviewViewing) { current = { ...value }; }, clear() { current = null; } };
}

const collapse = (value: string) => value.replace(/\s+/g, ' ').trim();

/** The single text field whose value is exactly the clicked text; anything ambiguous or missing gives null. */
export function matchEditableText(text: string | undefined, fields: VisualField[]): VisualField | null {
  if (typeof text !== 'string' || !collapse(text)) return null;
  const wanted = collapse(text);
  const matches = fields.filter(field => field.kind === 'text' && collapse(field.value) === wanted);
  return matches.length === 1 ? matches[0] : null;
}
