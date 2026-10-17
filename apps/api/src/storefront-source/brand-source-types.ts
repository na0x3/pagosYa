import type { BrandQuote } from './brand-source-website';

/** What the chat step hands the build when the merchant shared their OWN brand material (spec 2026-10-16 brand source). */
export type BrandSourceInput = {
  /** Attached images of the merchant's own brand (Instagram screenshots, banners): sampled for colour, read once by vision. */
  imageUrls: string[];
  /** Indexes into execution.referenceCaptures that show the merchant's own old site. */
  captureIndexes: number[];
  quotes: BrandQuote[];
  fontFamilies: string[];
  imported: Array<{ url: string; source: string; kind: 'photo' | 'logo' }>;
  /** The request is about the look (colours, style, a redesign): the brand palette overrides on an edit too. */
  look: boolean;
  notes: string[];
};
