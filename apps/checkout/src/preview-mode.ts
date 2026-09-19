/** How this page was opened: a store preview inside the Studio editor, the owner's own view, or a normal visit. */

export const storePreviewMode = new URLSearchParams(window.location.search).get("preview") === "1";
export const storeEditorMode = storePreviewMode && new URLSearchParams(window.location.search).get("editor") === "1";
export const storeOwnerMode = new URLSearchParams(window.location.search).get("owner") === "1";
export const STORE_PREVIEW_SECTIONS = ["brand", "navigation", "announcement", "hero", "products", "about", "gallery", "motion", "contact", "links", "location", "footer", "promotion"] as const;
export type StorePreviewSection = (typeof STORE_PREVIEW_SECTIONS)[number];

export interface StorePreviewEditorSelection {
  section: StorePreviewSection | `animation-${string}` | `site-${string}`;
  field: string;
  label: string;
  itemId?: string;
  itemIndex?: number;
  animationId?: string;
}
