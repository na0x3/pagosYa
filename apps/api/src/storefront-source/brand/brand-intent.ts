/** «Mejorar mi marca» from words, not only the chip: a rebrand / branding / identity request (spec 2026-11-18 §3.1). */
const BRAND_REQUEST = /\b(mejorar|mejora|cambiar|crear|hacer|hazme|haz|dame|rediseñ\w*|renovar)\b[^.]{0,30}\b(mi |una |la )?(marca|branding|identidad( de marca)?)\b|\bbranding\b|\bparezca una marca\b|\bimprove my brand(ing)?\b|\brebrand\b/i;
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
