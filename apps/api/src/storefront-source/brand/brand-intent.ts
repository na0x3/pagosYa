/** «Mejorar mi marca» from words, not only the chip (spec 2026-11-18 §3.1). Only a message that IS the request, from its first words
 *  («mejorar mi marca», «quiero rediseñar mi identidad de marca»), or «que parezca una marca»: an edit that names the brand («haz más
 *  grande el logo de mi marca», «quita el branding del footer») is an edit, never a rebrand (final review 2026-11-18). */
const BRAND_REQUEST = /^\s*(?:✦\s*)?(?:quiero\s+|me\s+gustar[ií]a\s+|ay[uú]dame\s+a\s+)?(?:mejorar|mejora|redise[ñn]ar|redise[ñn]a|crear|crea|renovar|renueva|hazme|hacer)\s+(?:mi|una|un|la)\s+(?:marca|branding|identidad(?:\s+de\s+marca)?)\b|\bparezca\s+una\s+marca\b|^\s*(?:improve|redo)\s+(?:my\s+)?brand(?:ing)?\b|^\s*rebrand\b/i;
export const isBrandRequest = (text: string) => BRAND_REQUEST.test(text);

const URL_RE = /https?:\/\/[^\s<>"')]+/gi;
export function brandLinks(text: string): { website?: string; social?: 'instagram' | 'tiktok' } {
  for (const raw of text.match(URL_RE) ?? []) {
    let host = '';
    try { host = new URL(raw).hostname.toLowerCase(); } catch { continue; }
    if (/(^|\.)instagram\.com$/.test(host)) return { social: 'instagram' };
    if (/(^|\.)tiktok\.com$/.test(host)) return { social: 'tiktok' };
    return { website: raw.replace(/[.,;]+$/, '') };
  }
  return {};
}
