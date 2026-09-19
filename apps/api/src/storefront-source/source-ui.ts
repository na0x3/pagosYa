import { randomInt } from 'node:crypto';

/**
 * Generator contract for `@pagosya/ui` (packages/storefront-kit/kit/ui.tsx). Kept compact: it rides in
 * the cached stable prompt of every React generation, retry and repair.
 */
export const SOURCE_UI_TOOLS = `DESIGN FRAMEWORK @pagosya/ui (trusted, bundled, self-styled; prefer it over hand-built equivalents): import {...} from '@pagosya/ui'.
Root: wrap each page once in <StoreTheme tokens={tokens}> with one shared tokens object (export it from a shared component): {paper, ink, accent, onAccent?, surface?, displayFont?, bodyFont?, subheadStyle?:'italic'|'normal', radius?:0-28, space?:0.85-1.25, displayRatio?:2.4-3.4, labelTracking?:0.06-0.22 (em), displayWeight?:300-800, cardAspect?:'1/1'|'4/5'|'3/4'|'2/3'|'5/4'|'16/9'}. Tokens also theme the shared cart, product page and checkout. Fonts: declare @font-face for bundled fonts in styles/globals.css and name them in displayFont/bodyFont.
Chrome: <AnnouncementBar>, <SiteHeader name tagline? logo?={src,alt} links={[{label,href}]} variant='classic'|'centered'|'split'|'floating' sticky? cartLabel?> (includes the data-cart-open cart button), <SiteFooter name blurb? columns={[{title,links}]} note? tone='ink'|'paper'>, <CommerceSlots/> (cart drawer + status; once per selling page), <CartButton label?>.
Sections: <Hero variant='split'|'fullbleed'|'editorial'|'typographic' eyebrow title lead image={src,alt,position?} actions scrollGrow?>, <Catalog title eyebrow body layout='grid'|'editorial'|'spotlight'|'rail'|'masonry' card='classic'|'overlay'|'minimal'|'framed'|'caption' fx='none'|'grow'|'zoom'|'lift'|'reveal'|'grow zoom'|'reveal zoom'|'reveal lift' columns=2-5 showDescription?> (the live catalog with its product-card template; replaces a hand-written data-pagosya-catalog), <ProductShowcase image eyebrow title body action from? to?> (sticky scene: the product photo grows from a small framed object to fill the stage as the visitor scrolls), <FeatureSplit image title eyebrow action reverse grow>children</FeatureSplit>, <StoryChapters chapters={[{eyebrow,title,body,image}]}> (stacking cards), <Gallery images variant='mosaic'|'grid'|'strip'>, <Statement align>one sentence</Statement> (words light up while read), <Marquee items speed>, <TrustStrip points={[{title,detail}]}> (only facts from Public business data), <Faq items={[{question,answer}]}>, <Reviews title?> (verified reviews only), <SectionHead>, <Section id tone='paper'|'surface'|'ink'|'accent' space='none'|'sm'|'md'|'lg' width='narrow'|'default'|'wide'|'full' reveal>.
Primitives: Container, Eyebrow, Display, Heading, Lead, Text, Button (href|onClick, variant solid|outline|ghost|link, size sm|md|lg), Badge, Hairline. Effects: <ScrollScale from>, <Parallax strength>, <Reveal>. Page bodies: <ProductDetail/> for product.tsx, <CheckoutDetail/> for checkout.tsx.
All effects respect reduced motion and the merchant's motion setting automatically; content is never hidden without motion.
MAKE EVERY STORE ITS OWN: the framework is a floor, not a template. (1) Tokens must come from this merchant (palette sampled from their products/photos, a type pairing that fits the goods). (2) Choose section variants, order and rhythm for this business; never fall back to the same header/hero/catalog/card combination. (3) Author at least one bespoke signature component in components/ that exists only for this store (a material-specific motif, a product-specific interaction, a custom layout) and style it in globals.css with the ui tokens (var(--ui-accent), var(--ui-ink), var(--ui-s5)...). (4) Use at most two scroll effects per page; a signature effect is stronger alone. (5) Outside links work on the live store only when they point to the merchant's own Public business data.links, leadCaptureUrl, WhatsApp/tel of contactPhone or mailto of contactEmail; use those exact URLs and never invent social profiles. (6) Never draw verification, security or trust seals, 'verificado'/'seguro' badges or payment-network logos: pagosYa shows the real, checkable seal outside the design.`;

const pick = <T,>(items: readonly T[], random: (max: number) => number) => items[random(items.length)];

export type SourceUiComposition = {
  header: string; hero: string; catalog: string; card: string; fx: string; signature: string; footer: string; radius: string; rhythm: string;
};

/** A seeded starting combination so fresh designs spread across the framework instead of converging. */
export function sourceUiComposition(random: (max: number) => number = randomInt): SourceUiComposition {
  return {
    header: pick(['classic', 'centered', 'split', 'floating'], random),
    hero: pick(['split', 'fullbleed', 'editorial', 'typographic'], random),
    catalog: pick(['grid', 'editorial', 'spotlight', 'rail', 'masonry'], random),
    card: pick(['classic', 'overlay', 'minimal', 'framed', 'caption'], random),
    fx: pick(['zoom', 'grow zoom', 'reveal lift', 'reveal zoom', 'lift'], random),
    signature: pick([
      'ProductShowcase: the hero product grows into the stage as the visitor scrolls',
      'StoryChapters: the making-of told as cards that stack while scrolling',
      'Statement + Parallax: one sentence that lights up word by word over a drifting photograph',
      'Hero with scrollGrow and a Marquee of real product qualities',
      "a bespoke interactive component built from this store's own material, product or place",
    ], random),
    footer: pick(['ink', 'paper'], random),
    radius: pick(['0 (sharp, editorial)', '4-8 (soft)', '14-24 (rounded, friendly)'], random),
    rhythm: pick(['airy (space 1.15-1.25)', 'balanced (space 1)', 'dense (space 0.85-0.92)'], random),
  };
}

export function sourceUiCompositionPrompt(composition: SourceUiComposition) {
  return `Suggested @pagosya/ui starting combination for this generation (seeded for variety; keep it unless the brief, the products or the brand clearly call for something else, and say why in the concept): header ${composition.header}; hero ${composition.hero}; catalog layout ${composition.catalog} with card ${composition.card} and fx '${composition.fx}'; signature moment: ${composition.signature}; footer tone ${composition.footer}; radius ${composition.radius}; rhythm ${composition.rhythm}.`;
}
