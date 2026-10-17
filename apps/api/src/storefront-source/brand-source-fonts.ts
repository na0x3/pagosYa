import { SOURCE_FONT_CATALOG } from './source-font-catalog';

/** Words a CSS family name or a vision «typeLook» uses, mapped to the catalogue's personality tags (spec 2026-10-16 §2). */
const KINDS: Array<[RegExp, string]> = [
  [/serif|georgia|times|garamond|didot|bodoni|playfair|contraste/i, 'serif'],
  [/script|cursiva|manuscrit|handwrit|caveat|pacifico/i, 'script'],
  [/condensed|condensad|oswald|bebas|anton|poster|impact/i, 'condensed'],
  [/mono|courier|code/i, 'mono'],
  [/slab|rockwell|bitter/i, 'slab'],
  [/sans|helvetica|arial|inter|roboto|grotesk|geom[eé]tric|montserrat|poppins/i, 'grotesk'],
];
const GENERIC = /^(serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-[a-z-]+|-apple-system|blinkmacsystemfont|inherit|initial)$/i;
const unquote = (name: string) => name.trim().replace(/^["']|["']$/g, '');
export const isGenericFamily = (name: string) => GENERIC.test(unquote(name));

/** The served family closest to a brand's font (its own name, else its kind); undefined when nothing fits. */
export function matchServedFont(nameOrLook: string, role: 'display' | 'text'): string | undefined {
  const name = unquote(nameOrLook);
  if (!name || isGenericFamily(name)) return undefined;
  const exact = SOURCE_FONT_CATALOG.find(font => font.family.toLowerCase() === name.toLowerCase());
  if (exact) return exact.family;
  const kind = KINDS.find(([pattern]) => pattern.test(name))?.[1];
  if (!kind) return undefined;
  return SOURCE_FONT_CATALOG.find(font => (font.role === role || font.role === 'both') && font.personality.some(tag => tag.includes(kind)))?.family;
}
