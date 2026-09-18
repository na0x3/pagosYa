/** Icons the storefront kit can draw for a product highlight. The kit owns the drawings and their motion. */
export const PRODUCT_HIGHLIGHT_ICONS = [
  // Vehicles
  'car', 'fuel', 'gauge', 'gear', 'seat', 'road',
  // Delivery and time
  'truck', 'package', 'clock', 'calendar',
  // Electronics
  'bolt', 'battery', 'plug', 'wifi', 'chip', 'screen',
  // Home and materials
  'leaf', 'ruler', 'drop', 'sun', 'flame', 'snowflake',
  // Apparel and beauty
  'shirt', 'wash', 'sparkle', 'hand', 'scissors',
  // Food and drink
  'cup', 'wheat', 'chef-hat', 'bottle',
  // General
  'shield', 'star', 'heart', 'recycle', 'check',
] as const;

export type ProductHighlightIcon = typeof PRODUCT_HIGHLIGHT_ICONS[number];
export type ProductHighlight = { icon: ProductHighlightIcon; label: string; detail?: string };

const MAX_HIGHLIGHTS = 4, MAX_LABEL = 24, MAX_DETAIL = 40;
const known = (icon: unknown): icon is ProductHighlightIcon => PRODUCT_HIGHLIGHT_ICONS.includes(icon as ProductHighlightIcon);

/** Keep only rows a shopper can trust: a known icon, a label, and one detail line, never repeating a label. */
export function normalizeProductHighlights(rows: Array<{ icon: string; label: string; detail?: string | null }> | null | undefined): ProductHighlight[] {
  const seen = new Set<string>();
  return (rows ?? [])
    .filter((row) => row && known(row.icon) && typeof row.label === 'string')
    .map((row) => {
      const label = row.label.trim().slice(0, MAX_LABEL);
      const detail = typeof row.detail === 'string' ? row.detail.trim().slice(0, MAX_DETAIL) : '';
      return { icon: row.icon as ProductHighlightIcon, label, ...(detail ? { detail } : {}) };
    })
    .filter((row) => row.label && !seen.has(row.label.toLocaleLowerCase()) && seen.add(row.label.toLocaleLowerCase()))
    .slice(0, MAX_HIGHLIGHTS);
}
