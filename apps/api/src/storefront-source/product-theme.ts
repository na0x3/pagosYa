import { SOURCE_DNA_ENUMS } from './source-dna';
import { presetFor, type PresetId, type ProductCardParams } from './source-product-card-presets';
import { sanitizeProductThemeCss, type ThemeCssReport } from './product-theme-css';
import type { ThemeCheckFailure } from './product-theme-check';
import type { SourceDesign } from './source-design';

/** The one entry point for choosing a store's product-card theme (theme plan, D6): a preset, optional per-dimension
 * overrides and optional guarded CSS. The CSS is always sanitized; when a browser check is supplied and reports any
 * failure the CSS is removed while the DNA parameters (safe by construction) stay. Pure apart from the injected check. */
export type ProductThemeInput = { preset?: PresetId; params?: Partial<ProductCardParams>; css?: string };
export type ProductThemeResult = {
  dna: { productCard: ProductCardParams; productCss: string };
  report: { dropped: ThemeCssReport['dropped']; failures: ThemeCheckFailure[]; presetUsed?: PresetId };
};

/** The theme the agent chose, written into the selected concept's DNA (so later edits and regenerations keep it). */
export function applyProductThemeToDesign(design: SourceDesign | undefined, theme: ProductThemeResult['dna'] | null): SourceDesign | undefined {
  if (!design || !theme) return design;
  const concept = design.concepts[design.selected];
  if (!concept?.dna) return design;
  return { ...design, concepts: design.concepts.map((c, i) => i === design.selected ? { ...c, dna: { ...c.dna!, productCard: { ...theme.productCard }, productCss: theme.productCss } } : c) };
}

/** The same theme as fields of the runtime DNA (config.dna); productCss only when there is one. */
export function productThemeRuntime(theme: ProductThemeResult['dna']): Record<string, string> {
  return { ...theme.productCard, ...(theme.productCss ? { productCss: theme.productCss } : {}) };
}

/** A snapshot with the theme in its config.js (dna is created when the store has none, or the runtime would ignore the theme). */
export function snapshotWithProductTheme<T extends { files: Array<{ path: string; content: string }> }>(snapshot: T, theme: ProductThemeResult['dna']): T {
  return { ...snapshot, files: snapshot.files.map(file => {
    if (file.path !== 'config.js') return file;
    try {
      const config = JSON.parse(file.content.match(/^\s*window\.PAGOSYA_CONFIG\s*=\s*([\s\S]*?);?\s*$/)?.[1] ?? '{}');
      return { ...file, content: `window.PAGOSYA_CONFIG = ${JSON.stringify({ ...config, dna: { version: 1, ...(config.dna ?? {}), ...theme.productCard, productCss: theme.productCss } })};` };
    } catch { return file; }
  }) };
}

/** Does the merchant's request concern the product page? Whole-store designs always may set a theme; a local edit only on this. */
export function instructionConcernsProductCard(text: string): boolean {
  const t = text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  return /\b(?:ficha|tarjeta)s?\s+(?:de(?:l)?\s+)?productos?\b|\bpagina\s+de(?:l)?\s+productos?\b|\bproduct\s+(?:page|card|detail)s?\b|\bopciones?\s+del\s+producto\b|\bficha\b/.test(t);
}

export async function resolveProductTheme(input: ProductThemeInput, options: { check?: (css: string) => Promise<ThemeCheckFailure[]> } = {}): Promise<ProductThemeResult> {
  const preset = presetFor(input.preset ?? 'plain');
  const productCard: ProductCardParams = { ...preset.params };
  for (const [key, value] of Object.entries(input.params ?? {})) {
    const allowed = (SOURCE_DNA_ENUMS.productCard as Record<string, readonly string[]>)[key];
    if (!allowed) throw new Error(`invalid productCard.${key}: not a product card setting`);
    if (!allowed.includes(value as string)) throw new Error(`invalid productCard.${key}: ${JSON.stringify(value)} (use ${allowed.join(', ')})`);
    (productCard as Record<string, string>)[key] = value as string;
  }
  const sanitized = sanitizeProductThemeCss(`${preset.css}${input.css ?? ''}`);
  let productCss = sanitized.css;
  let failures: ThemeCheckFailure[] = [];
  if (productCss && options.check) {
    failures = await options.check(productCss);
    if (failures.length) productCss = '';
  }
  return { dna: { productCard, productCss }, report: { dropped: sanitized.dropped, failures, ...(input.preset ? { presetUsed: input.preset } : {}) } };
}
