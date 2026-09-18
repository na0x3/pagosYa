export const CATALOG_LAYOUTS = ['all', 'sections', 'page', 'tabs'] as const;
export type CatalogLayout = (typeof CATALOG_LAYOUTS)[number];

/** Anything unrecognized renders today's single grid, so an older row or a
 * bad write can never leave a storefront without its catalog. */
export function readCatalogLayout(value: unknown): CatalogLayout {
  return CATALOG_LAYOUTS.includes(value as CatalogLayout) ? (value as CatalogLayout) : 'all';
}
