import { SOURCE_DNA_ENUMS } from './source-dna';
import { presetFor, type PresetId, type ProductCardParams } from './source-product-card-presets';
import { sanitizeProductThemeCss, type ThemeCssReport } from './product-theme-css';
import type { ThemeCheckFailure } from './product-theme-check';

/** The one entry point for choosing a store's product-card theme (theme plan, D6): a preset, optional per-dimension
 * overrides and optional guarded CSS. The CSS is always sanitized; when a browser check is supplied and reports any
 * failure the CSS is removed while the DNA parameters (safe by construction) stay. Pure apart from the injected check. */
export type ProductThemeInput = { preset?: PresetId; params?: Partial<ProductCardParams>; css?: string };
export type ProductThemeResult = {
  dna: { productCard: ProductCardParams; productCss: string };
  report: { dropped: ThemeCssReport['dropped']; failures: ThemeCheckFailure[]; presetUsed?: PresetId };
};

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
