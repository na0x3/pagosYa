import type { VisualField } from './source-visual-fields';

export type SectionSelection = { sectionId: string; label: string };

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
    set(value: SectionSelection) { current = { sectionId: value.sectionId, label: value.label }; },
    clear() { current = null; },
  };
}

const collapse = (value: string) => value.replace(/\s+/g, ' ').trim();

/** The single text field whose value is exactly the clicked text; anything ambiguous or missing gives null. */
export function matchEditableText(text: string | undefined, fields: VisualField[]): VisualField | null {
  if (typeof text !== 'string' || !collapse(text)) return null;
  const wanted = collapse(text);
  const matches = fields.filter(field => field.kind === 'text' && collapse(field.value) === wanted);
  return matches.length === 1 ? matches[0] : null;
}
