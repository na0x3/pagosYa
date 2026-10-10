import { SOURCE_DESIGN_FILE } from '../storefront-source/source-design';
import { SOURCE_FONT_CATALOG } from '../storefront-source/source-font-catalog';
import { LOGO_GROUND, LOGO_INK } from './typographic-logo';

/** What a drawn logo needs from a saved store design. Read-only; every miss is a default, never an error. */
export type StoreIdentity = { fontId: string; upper: boolean; ink: string; ground: string };
export const DEFAULT_LOGO_FONT = 'bricolage';
export const DEFAULT_IDENTITY: StoreIdentity = { fontId: DEFAULT_LOGO_FONT, upper: false, ink: LOGO_INK, ground: LOGO_GROUND };
const FONT_IDS = new Set<string>(SOURCE_FONT_CATALOG.map(font => font.id));

// The same fallback order the kit's commerce-pages.css uses for the page's own text and background.
const INK_TOKENS = ['store-foreground', 'brand-foreground', 'ink'];
const GROUND_TOKENS = ['store-background', 'brand-background', 'paper'];
const HEX = '#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3})';
const IS_HEX = new RegExp(`^${HEX}$`, 'i');
// One level of indirection, as templates write it: --store-background: var(--ri-forest[, #fallback]).
const VAR_REF = new RegExp(`^var\\(\\s*--([\\w-]+)\\s*(?:,\\s*(${HEX})\\s*)?\\)$`, 'i');
const declarations = (css: string, name: string) => [...css.matchAll(new RegExp(`--${name}\\s*:\\s*([^;}]+)`, 'gi'))].map(match => match[1].trim());
const plainHex = (css: string, name: string) => declarations(css, name).find(value => IS_HEX.test(value));
const hexToken = (css: string, name: string) => {
  for (const value of declarations(css, name)) {
    if (IS_HEX.test(value)) return value;
    const ref = value.match(VAR_REF);
    const resolved = ref && (plainHex(css, ref[1]) ?? ref[2]);
    if (resolved) return resolved;
  }
  return undefined;
};
const firstHex = (css: string, names: string[]) => names.map(name => hexToken(css, name)).find(Boolean);

// WCAG relative luminance; below 3:1 the mark would vanish into its square.
const luminance = (hex: string) => {
  const full = hex.length === 4 ? hex.replace(/[0-9a-f]/gi, digit => digit + digit) : hex.slice(0, 7);
  return [1, 3, 5].map(at => parseInt(full.slice(at, at + 2), 16) / 255).map(c => c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4).reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
};
const contrast = (a: string, b: string) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
const legibleInk = (ink: string, ground: string) => contrast(ink, ground) >= 3 ? ink : contrast('#ffffff', ground) >= contrast(LOGO_INK, ground) ? '#ffffff' : LOGO_INK;

export function storeIdentity(files: Array<{ path: string; content: string; encoding?: string }>): StoreIdentity {
  let fontId = DEFAULT_LOGO_FONT;
  let upper = false;
  try {
    const design = JSON.parse(files.find(file => file.path === SOURCE_DESIGN_FILE)?.content ?? 'null');
    const type = design?.concepts?.[design.selected]?.dna?.type;
    if (typeof type?.display === 'string' && FONT_IDS.has(type.display)) fontId = type.display;
    upper = type?.case === 'upper';
  } catch { /* a broken design file keeps the defaults */ }
  const css = files.filter(file => file.path.endsWith('.css') && file.encoding !== 'base64').map(file => file.content).join('\n');
  const ground = firstHex(css, GROUND_TOKENS) ?? LOGO_GROUND;
  return { fontId, upper, ink: legibleInk(firstHex(css, INK_TOKENS) ?? LOGO_INK, ground), ground };
}
