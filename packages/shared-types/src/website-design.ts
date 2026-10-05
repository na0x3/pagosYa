export { SECTION_COMPOSITIONS, sectionCompositions } from './sketch-registry';
import type { DesignSectionType } from './sketch-registry';
export type { DesignSectionType } from './sketch-registry';
export type BrandDirection = {
  businessType: string; positioning: string; audience: string[]; personality: string[];
  visualKeywords: string[]; contentTone: string;
  pricePositioning: 'budget' | 'mid-market' | 'premium' | 'luxury';
  primaryConversionGoal: string; secondaryGoals: string[];
};
export type ArtDirection = {
  style: 'editorial' | 'minimal' | 'bold-commerce' | 'playful' | 'luxury' | 'organic' | 'retro' | 'industrial' | 'experimental' | 'lifestyle';
  layoutDensity: 'airy' | 'balanced' | 'dense'; composition: 'grid' | 'editorial' | 'asymmetric' | 'modular' | 'mixed';
  imageTreatment: 'cover' | 'contain'; typographyTreatment: string;
  motionLevel: 'none' | 'subtle' | 'expressive'; cornerStyle: 'square' | 'soft' | 'round'; sectionRhythm: string;
};
export type DesignTokens = {
  colors: { background: string; foreground: string; primary: string; secondary: string; accent: string; muted: string; border: string };
  typography: { displayFont: string; headingFont: string; bodyFont: string; displayScale: number; headingScale: number; bodyScale: number; letterSpacing: number; lineHeight: number };
  spacing: { unit: number; section: number; gutter: number };
  radius: { card: number; button: number }; shadows: { elevation: 'none' | 'soft' | 'hard' };
  containerWidths: { wide: number; narrow: number };
  buttonStyles: { treatment: string }; imageStyles: { fit: 'cover' | 'contain'; ratio: '4-3' | '1-1' | '3-4' };
};
export type AssetAssignment = {
  assetId: string; role: 'logo' | 'product' | 'lifestyle' | 'portrait' | 'background' | 'detail' | 'packaging' | 'decorative' | 'hero-lifestyle' | 'product-detail' | 'brand-editorial' | 'location';
  pageId: string; sectionId: string; field: string; cropStrategy: 'cover' | 'contain';
  focalPoint: { x: number; y: number }; alt: string;
};
export type DesignSectionSpec = {
  id: string; type: DesignSectionType; variant: string; content: Record<string, unknown>;
  layout: { width: string; alignment: string; mobile: 'stack' | 'rail'; tablet: 'stack' | 'grid' };
  productRefs: string[]; assetRefs: string[];
};
export type DesignQuality = {
  scores: Record<'hierarchy' | 'consistency' | 'brandFit' | 'imageUsage' | 'contentCompleteness' | 'sectionVariety' | 'ecommerceClarity' | 'mobileSafety' | 'accessibility' | 'visualRhythm', number>;
  findings: Array<{ code: string; sectionId?: string; severity: 'warning' | 'error'; repaired: boolean }>;
};
export type WebsiteDesignSpec = {
  schemaVersion: 1; promptVersion: string; designSeed: string; brand: BrandDirection;
  artDirection: ArtDirection; theme: DesignTokens;
  pages: Array<{ id: string; slug: string; pageType: 'home' | 'product' | 'checkout'; sections: DesignSectionSpec[] }>;
  globalSections: { navigation: 'minimal' | 'editorial' | 'centered' | 'transparent'; footerId: string };
  assetAssignments: AssetAssignment[];
  responsiveStrategy: { mobile: number; tablet: number; overlapOnMobile: false; respectReducedMotion: true };
  quality: DesignQuality;
  generation: { mode: 'ai' | 'fallback'; stages: string[] };
};
