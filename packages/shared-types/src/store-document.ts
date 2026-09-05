import type {
  SiteArtDirection,
  SiteDesignGenome,
  SiteSectionBlock,
  SiteSectionFamily,
} from "./site-design";

/**
 * Canonical persisted storefront-document vocabulary.
 *
 * AI generation may intentionally use a narrower set (for example it cannot
 * create event-ticket bindings), but API validation, editor state and Checkout
 * rendering must all agree on these persisted values.
 */
export const STORE_SITE_DOCUMENT_VERSION = 1 as const;
export const STORE_SITE_SECTION_KINDS = ["hero", "story", "catalog", "gallery", "event-tickets", "contact", "location", "links"] as const;
export const STORE_SITE_SECTION_LAYOUTS = ["split", "full-bleed", "centered", "offset", "grid", "stacked", "rail", "minimal"] as const;
export const STORE_SITE_SECTION_WIDTHS = ["full", "wide", "contained"] as const;
export const STORE_SITE_SECTION_ALIGNS = ["left", "center", "right"] as const;
export const STORE_SITE_SECTION_MOTIONS = ["none", "reveal", "clip", "drift", "scale", "parallax", "story-scroll"] as const;
export const STORE_SITE_FONT_ROLES = ["grotesk", "editorial", "humanist", "geometric", "classic", "mono", "artisan", "condensed", "luxury"] as const;
export const STORE_SITE_NAV_LAYOUTS = ["brand-left", "centered", "split"] as const;
export const STORE_SITE_HEADER_STYLES = ["floating", "square", "full"] as const;
export const STORE_SITE_HEADER_POSITIONS = ["left", "center", "right"] as const;
export const STORE_SITE_HEADER_ACTION_POSITIONS = ["left", "right"] as const;
export const STORE_SITE_PRODUCT_LAYOUTS = ["gallery", "editorial", "compact", "showcase"] as const;
export const STORE_SITE_SHADOW_STYLES = ["none", "soft", "lifted"] as const;
export const STORE_SITE_DISPLAY_SCALES = ["balanced", "dramatic", "monumental"] as const;
export const STORE_SITE_DENSITIES = ["airy", "balanced", "dense"] as const;
export const STORE_SITE_IMAGE_TREATMENTS = ["natural", "cinematic", "cutout", "editorial"] as const;
export const STORE_SITE_LOGO_TREATMENTS = ["mark", "wordmark", "oversized", "seal"] as const;
export const STORE_SITE_MOTION_INTENSITIES = ["restrained", "expressive", "cinematic"] as const;
export const STORE_SITE_SPOTLIGHT_LAYOUTS = ["feature-first", "alternating", "lookbook", "collection"] as const;
export const STORE_SITE_SIGNATURE_EXPERIENCES = [
  "none", "scroll-expansion", "hero-gallery-scroll", "image-stream", "full-screen-chapters", "frame-sequence",
  "layered-text", "text-rotate", "text-glitch", "text-reveal-block", "text-along-path",
] as const;
export const STORE_SITE_TEXT_EXPERIENCES = [
  "layered-text", "text-rotate", "text-glitch", "text-reveal-block", "text-along-path",
] as const;
export const STORE_SITE_EXPERIENCE_PLACEMENTS = ["after-hero", "after-story", "after-catalog"] as const;

export type StoreSiteSectionKind = (typeof STORE_SITE_SECTION_KINDS)[number];
export type StoreSiteSectionLayout = (typeof STORE_SITE_SECTION_LAYOUTS)[number];
export type StoreSiteSectionWidth = (typeof STORE_SITE_SECTION_WIDTHS)[number];
export type StoreSiteSectionAlign = (typeof STORE_SITE_SECTION_ALIGNS)[number];
export type StoreSiteSectionMotion = (typeof STORE_SITE_SECTION_MOTIONS)[number];
export type StoreSiteFontRole = (typeof STORE_SITE_FONT_ROLES)[number];

export interface StoreCanvasTextStyle {
  textScale?: number;
  textWidthPercent?: number;
  textAlign?: "left" | "center" | "right";
  textColor?: string;
  fontStyle?: "modern" | "editorial" | "friendly" | "classic" | "geometric" | "artisan" | "condensed" | "luxury";
  textOffsetX?: number;
  textOffsetY?: number;
  textOffsetBasis?: "element" | "section";
}

export interface StoreSiteNavigationItem {
  id: string;
  label: string;
  target: "home" | "catalog" | "section" | "page";
  sectionId?: string;
  pageId?: string;
  style?: StoreCanvasTextStyle;
}

export interface StoreSitePage {
  id: string;
  label: string;
  slug: string;
}

export interface StoreSiteFooterItem {
  id: string;
  label: string;
  href: string;
}

export interface StoreSiteFooter {
  enabled: boolean;
  brandDescription: string;
  columns: Array<{
    id: string;
    title: string;
    items: StoreSiteFooterItem[];
  }>;
  copyright: string;
  badge: string;
  newsletter?: {
    enabled: boolean;
    title: string;
    body: string;
    buttonLabel: string;
    successMessage: string;
  };
}

export interface StoreSiteDocument {
  version: typeof STORE_SITE_DOCUMENT_VERSION;
  direction: string;
  artDirection?: SiteArtDirection;
  designGenome: SiteDesignGenome;
  theme: {
    pageBackground: string;
    textColor: string;
    accentColor: string;
    secondaryColor: string;
    surfaceColor: string;
    mutedColor: string;
    borderColor: string;
    headingFont: StoreSiteFontRole;
    bodyFont: StoreSiteFontRole;
    radius: number;
    shadow: (typeof STORE_SITE_SHADOW_STYLES)[number];
    productLayout: (typeof STORE_SITE_PRODUCT_LAYOUTS)[number];
    displayScale: (typeof STORE_SITE_DISPLAY_SCALES)[number];
    density: (typeof STORE_SITE_DENSITIES)[number];
    imageTreatment: (typeof STORE_SITE_IMAGE_TREATMENTS)[number];
  };
  navigation: {
    layout: (typeof STORE_SITE_NAV_LAYOUTS)[number];
    barStyle?: (typeof STORE_SITE_HEADER_STYLES)[number];
    brandPosition?: (typeof STORE_SITE_HEADER_POSITIONS)[number];
    navPosition?: (typeof STORE_SITE_HEADER_POSITIONS)[number];
    searchPosition?: (typeof STORE_SITE_HEADER_ACTION_POSITIONS)[number];
    profilePosition?: (typeof STORE_SITE_HEADER_ACTION_POSITIONS)[number];
    cartPosition?: (typeof STORE_SITE_HEADER_ACTION_POSITIONS)[number];
    brandStyle?: StoreCanvasTextStyle;
    taglineStyle?: StoreCanvasTextStyle;
    sticky: boolean;
    transparent: boolean;
    logoTreatment: (typeof STORE_SITE_LOGO_TREATMENTS)[number];
    items?: StoreSiteNavigationItem[];
  };
  pages?: StoreSitePage[];
  footer?: StoreSiteFooter;
  motion: { intensity: (typeof STORE_SITE_MOTION_INTENSITIES)[number] };
  merchandising: {
    featuredProductIds: string[];
    productOrderIds: string[];
    spotlightLayout: (typeof STORE_SITE_SPOTLIGHT_LAYOUTS)[number];
    showDescriptions: boolean;
    collectionMenuStyle?: "tabs" | "editorial-sidebar";
    collections?: Array<{ id: string; name: string; productIds: string[] }>;
  };
  experience: {
    type: (typeof STORE_SITE_SIGNATURE_EXPERIENCES)[number];
    placement: (typeof STORE_SITE_EXPERIENCE_PLACEMENTS)[number];
    title: string;
    body: string;
    mediaUrls: string[];
  };
  sections: Array<{
    id: string;
    pageId?: string;
    /** Optional merchant-selected catalog subset for this section. */
    productIds?: string[];
    kind: StoreSiteSectionKind;
    family?: SiteSectionFamily;
    layout: StoreSiteSectionLayout;
    width: StoreSiteSectionWidth;
    /** Merchant-controlled fixed section height for desktop/tablet storefronts. */
    heightPx?: number;
    /** Optional mobile override; desktop height remains the fallback when omitted. */
    mobileHeightPx?: number;
    align: StoreSiteSectionAlign;
    motion: StoreSiteSectionMotion;
    title: string;
    body: string;
    ctaLabel: string;
    /** Server-owned binding. AI generation cannot invent this value. */
    eventId?: string;
    backgroundColor: string;
    textColor: string;
    titleStyle?: StoreCanvasTextStyle;
    bodyStyle?: StoreCanvasTextStyle;
    mediaUrls: string[];
    items: Array<{
      title: string;
      body: string;
      mediaUrl: string | null;
      titleStyle?: StoreCanvasTextStyle;
      bodyStyle?: StoreCanvasTextStyle;
    }>;
    blocks?: SiteSectionBlock[];
  }>;
}

export function isStoreSiteDocumentVersion(value: unknown): value is typeof STORE_SITE_DOCUMENT_VERSION {
  return value === STORE_SITE_DOCUMENT_VERSION;
}
