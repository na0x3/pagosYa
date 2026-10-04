import { SOURCE_DNA_ENUMS } from './source-dna';
import { presetFor, type PresetId, type ProductCardParams } from './source-product-card-presets';
import { sanitizeProductThemeCss, type ThemeCssReport } from './product-theme-css';
import type { ThemeCheckFailure } from './product-theme-check';
import type { SourceDesign } from './source-design';

/** The one entry point for choosing a store's product-card theme (theme plan, D6): a preset, optional per-dimension
 * overrides and optional guarded CSS. The CSS is always sanitized; when a browser check is supplied and reports any
 * failure the CSS is removed while the DNA parameters (safe by construction) stay. Pure apart from the injected check. */
export type ProductThemeInput = { preset?: PresetId; params?: Partial<ProductCardParams>; css?: string; assurances?: unknown };
export type ProductThemeResult = {
  dna: { productCard: ProductCardParams; productCss: string; assurances?: ProductAssurance[] };
  report: { dropped: ThemeCssReport['dropped']; failures: ThemeCheckFailure[]; presetUsed?: PresetId; assuranceNotes?: string[] };
};

/** Custom assurance items on the product page (the "Retiro en tienda / Pago seguro" row): merchant-owned
 * honest lines, rendered escaped by the kit BEFORE the platform's own delivery and payment lines, which
 * stay derived from store facts and can never be replaced. Icons come from the kit's inline set. */
export const ASSURANCE_ICONS = ['pickup', 'delivery', 'digital', 'payment', 'chat', 'clock', 'star', 'leaf', 'gift', 'heart', 'award', 'flame', 'sparkles', 'package', 'coffee', 'map-pin', 'thumbs-up'] as const;
export type ProductAssurance = { icon: string; title: string; detail: string };
const ASSURANCE_LIMITS = { items: 3, title: 40, detail: 80 };
/** Claims only the platform may make, and anything that smells like a link: such items are dropped, never rewritten. */
const ASSURANCE_FORBIDDEN = /pagosya|pago\s+seguro|verificad|https?:\/\/|www\./i;
export function sanitizeProductAssurances(input: unknown): { items: ProductAssurance[]; notes: string[] } {
  const notes: string[] = [];
  if (input !== undefined && !Array.isArray(input)) return { items: [], notes: ['las garantías no eran una lista; se quitaron'] };
  const items: ProductAssurance[] = [];
  for (const raw of (input as unknown[] | undefined) ?? []) {
    if (items.length >= ASSURANCE_LIMITS.items) { notes.push(`máximo ${ASSURANCE_LIMITS.items} garantías; se conservaron las primeras`); break; }
    const item = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
    const title = (typeof item.title === 'string' ? item.title : '').trim().slice(0, ASSURANCE_LIMITS.title);
    const detail = (typeof item.detail === 'string' ? item.detail : '').trim().slice(0, ASSURANCE_LIMITS.detail);
    if (!title) continue;
    if (ASSURANCE_FORBIDDEN.test(`${title} ${detail}`)) { notes.push(`la garantía «${title.slice(0, 30)}» usa afirmaciones reservadas a la plataforma o enlaces; se quitó`); continue; }
    items.push({ icon: (ASSURANCE_ICONS as readonly string[]).includes(item.icon as string) ? (item.icon as string) : 'sparkles', title, detail });
  }
  return { items, notes };
}

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
      const { productAssurances: previous, ...rest } = config;
      // assurances undefined = untouched; [] clears; a list replaces. The row's platform lines are kit-derived.
      const assurances = theme.assurances === undefined ? previous : theme.assurances.length ? theme.assurances : undefined;
      return { ...file, content: `window.PAGOSYA_CONFIG = ${JSON.stringify({ ...rest, ...(assurances ? { productAssurances: assurances } : {}), dna: { version: 1, ...(config.dna ?? {}), ...theme.productCard, productCss: theme.productCss } })};` };
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
  const assured = input.assurances === undefined ? null : sanitizeProductAssurances(input.assurances);
  const sanitized = sanitizeProductThemeCss(`${preset.css}${input.css ?? ''}`);
  let productCss = sanitized.css;
  let failures: ThemeCheckFailure[] = [];
  if (productCss && options.check) {
    failures = await options.check(productCss);
    if (failures.length) productCss = '';
  }
  return { dna: { productCard, productCss, ...(assured ? { assurances: assured.items } : {}) }, report: { dropped: sanitized.dropped, failures, ...(input.preset ? { presetUsed: input.preset } : {}), ...(assured?.notes.length ? { assuranceNotes: assured.notes } : {}) } };
}
