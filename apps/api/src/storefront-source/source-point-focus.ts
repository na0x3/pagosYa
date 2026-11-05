import type { SourceSelectionDto, SourceViewingDto } from './dto/source-selection.dto';

/** What the merchant pointed at in the preview (spec 2026-11-05 point-at), as the quick template edit reads it. */
export type PointFocus = { pagina: string; secciones: number[]; textos: string[]; fotos: string[]; partes: string[]; mirando?: { pagina: string; at?: number } };
/** «esto», «esta foto», «aquí», «acá»: the words that mean «what I'm looking at». «está» (the verb) never matches. */
export const DEICTIC = /(?<!\p{L})(?:esto|esta|este|estas|estos|aqu[ií]|ac[aá]|ah[ií])(?!\p{L})/iu;

export function pointFocus(input: { instruction: string; selection?: SourceSelectionDto; viewing?: SourceViewingDto }): PointFocus | null {
  const selection = input.selection;
  if (selection?.area) {
    const area = selection.area;
    const pagina = area.sections[0]?.page ?? 'home';
    return { pagina, secciones: area.sections.filter(s => s.page === pagina).map(s => s.at), textos: [...area.texts], fotos: [...area.photos], partes: [...area.parts] };
  }
  if (selection && typeof selection.at === 'number' && selection.page) return { pagina: selection.page, secciones: [selection.at], textos: [], fotos: [], partes: [] };
  if (selection) return null;
  if (input.viewing && DEICTIC.test(input.instruction)) {
    const { page, at } = input.viewing;
    return { pagina: page, secciones: [], textos: [], fotos: [], partes: [], mirando: { pagina: page, ...(typeof at === 'number' ? { at } : {}) } };
  }
  return null;
}

/** Ops that touched a section of the focused page outside the focus — logged, never blocked (the merchant may have named it). */
export function outsideFocus(ops: Array<{ page?: string; at: number }>, focus: PointFocus | null): string[] {
  if (!focus?.secciones.length) return [];
  return ops.filter(op => (op.page || 'home') === focus.pagina && op.at >= 0 && !focus.secciones.includes(op.at)).map(op => `${focus.pagina}:${op.at}`);
}
