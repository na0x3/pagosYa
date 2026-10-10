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
const hexToken = (css: string, name: string) => css.match(new RegExp(`--${name}\\s*:\\s*(#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3}))\\s*[;}]`, 'i'))?.[1];

const firstHex = (css: string, names: string[]) => names.map(name => hexToken(css, name)).find(Boolean);

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
  return { fontId, upper, ink: firstHex(css, INK_TOKENS) ?? LOGO_INK, ground: firstHex(css, GROUND_TOKENS) ?? LOGO_GROUND };
}
