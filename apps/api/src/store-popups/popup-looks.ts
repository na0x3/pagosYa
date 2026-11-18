/** The six built popup looks (spec 2026-11-09-popup-looks). retention.js holds their HTML and CSS; a store keeps only the look's id. */
export const POPUP_LOOK_IDS = ['clasica', 'portada', 'cartel', 'postal', 'revista', 'etiqueta'] as const;
export type PopupLookId = (typeof POPUP_LOOK_IDS)[number];
export const POPUP_LOOK_NAMES: Record<PopupLookId, string> = { clasica: 'Clásica', portada: 'Portada', cartel: 'Cartel', postal: 'Postal', revista: 'Revista', etiqueta: 'Etiqueta' };
export type PopupLookSettings = { popupLook?: string; popupLookPrevious?: string; popupPhoto?: string };

const fold = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
export function readPopupLook(value: unknown): PopupLookId | null {
  if (typeof value !== 'string') return null;
  const id = fold(value);
  return (POPUP_LOOK_IDS as readonly string[]).includes(id) ? id as PopupLookId : null;
}
/** FNV-1a: the same slug always gets the same look, and slugs spread evenly over the six. */
function hash(text: string) { let h = 0x811c9dc5; for (const c of String(text ?? '')) { h ^= c.codePointAt(0)!; h = Math.imul(h, 0x01000193) >>> 0; } return h; }
export function pickPopupLook(slug: string, avoid?: string): PopupLookId {
  const at = hash(slug) % POPUP_LOOK_IDS.length;
  return POPUP_LOOK_IDS[POPUP_LOOK_IDS[at] === avoid ? (at + 1) % POPUP_LOOK_IDS.length : at];
}
export function nextPopupLook(current: string | null | undefined): PopupLookId {
  const at = POPUP_LOOK_IDS.indexOf(readPopupLook(current) ?? 'etiqueta');
  return POPUP_LOOK_IDS[(at + 1) % POPUP_LOOK_IDS.length];
}
