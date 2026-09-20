export const SOURCE_SITE_PURPOSES = ['shop', 'service', 'portfolio', 'editorial'] as const;
export type SourceSitePurpose = typeof SOURCE_SITE_PURPOSES[number];
/** Absent values belong to existing commerce projects. Never infer purpose from generated source. */
export function sourceSitePurpose(brief?: { sitePurpose?: unknown }): SourceSitePurpose {
  return SOURCE_SITE_PURPOSES.includes(brief?.sitePurpose as SourceSitePurpose) ? brief!.sitePurpose as SourceSitePurpose : 'shop';
}

export function sourceSitePurposePrompt(purpose: SourceSitePurpose): string {
  if (purpose === 'shop') return '';
  const content = purpose === 'service' ? 'Present the actual services and a clear inquiry action. A booking inquiry is not a confirmed reservation: use an exact merchant-provided booking URL when available, otherwise offer contact.'
    : purpose === 'portfolio' ? 'Present approved projects, case studies and actual work, with an inquiry action. Never invent clients, project outcomes or testimonials.'
    : 'Present supplied editorial content. Use the empty data-pagosya-blog mount for the real published article feed; only existing published articles have CMS-managed URLs. Authored content pages may use supplied text, never fictional articles.';
  return `SITE PURPOSE OVERRIDE: ${purpose}. This is a presentation website. It overrides all default shop/catalog/product/checkout requirements elsewhere in this prompt. ${content} Do not force a catalog, cart button, product page or checkout into this website. In React, require only components/home.tsx and styles/globals.css; optional content pages use components/page-SLUG.tsx (default export), linked as SLUG.html, with a shared navigation/footer. Static sites require index.html, styles.css and site.js, plus optional real content pages. Keep data-pagosya-status on every page and an empty hidden data-pagosya-contact slot on home; the real platform contact setting controls its visibility. Never create personal-data inputs, fake form submissions or a booking backend. If contact is disabled, use only a supplied contact/booking link and do not promise an unavailable form. Keep config.js and commerce.js for platform forms and published articles. For layout planning, catalogSection is a legacy field naming the principal content section (services, work or articles); no catalog hook is required there. Set standaloneIntro=true and productsInOpening=false. Keep section order, responsive behavior, evidence-based business facts and all platform privacy/security rules. Use a custom composition appropriate to this purpose instead of retail composition candidates.`;
}
