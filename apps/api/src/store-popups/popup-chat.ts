/** Popups 2.0 (spec 2026-11-18 §8): what a chat message asks of the store's YAPI popup — only when it names the popup. A new
 *  discount or contact is a setting (no model call); anything else about the popup is a redesign with the merchant's words. */
export type PopupChatRequest = { redesign: boolean; request?: string; percent?: number; capture?: 'email' | 'whatsapp' };

const POPUP = /\b(?:pop-?ups?|ventana emergente|ventanita)\b/i;
const REDESIGN = /\b(?:redise[ñn]\w*|otr[oa]s?|nuev[oa]|distint[oa]|m[aá]s\s+\w+|menos\s+\w+|agrega|añade|quita|saca|pregunta|preguntas|divertid\w*|bonit\w*|elegante|cambia\w*\s+(?:el\s+|mi\s+)?(?:dise[ñn]o|estilo|look))\b/i;
const BARE = /^\s*(?:redise[ñn]a|cambia|renueva)\s+(?:mi|el)\s+pop-?up\s*[.!]?\s*$/i;

// Final review I4: switching the popup on/off, its timing and A/B tests keep their own paths.
const SWITCH = /\b(?:apag\w*|desactiv\w*|activ\w*|enciend\w*|prend\w*|quita\w*|saca\w*|elimin\w*|ocult\w*|borra\w*)\s+(?:el\s+|mi\s+|ese\s+)?pop-?ups?\b/i;
const TIMING_OR_TEST = /\b(?:segundos?|minutos?|prueba\w*|test|a\/b|experiment\w*|versi[oó]n\s+b)\b/i;

export function popupChatRequest(text: string): PopupChatRequest | null {
  if (!POPUP.test(text) || SWITCH.test(text) || TIMING_OR_TEST.test(text)) return null;
  const percentMatch = /(\d{1,2})\s*%/.exec(text);
  const percent = percentMatch ? Number(percentMatch[1]) : undefined;
  const asked = /\bpid(?:a|e|an|ir)\s+(?:su\s+|el\s+|tu\s+|un\s+)?(e-?mail|correo|whats?app)/i.exec(text)?.[1];
  const capture = asked ? (/whats/i.test(asked) ? 'whatsapp' as const : 'email' as const) : undefined;
  if ((percent !== undefined || capture) && !REDESIGN.test(text)) return { redesign: false, ...(percent !== undefined ? { percent } : {}), ...(capture ? { capture } : {}) };
  return BARE.test(text) ? { redesign: true } : { redesign: true, request: text.trim().slice(0, 300) };
}
