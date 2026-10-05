import { isSceneImage, isProductImage, sketchImageRole } from './sketch/sketch-assets';
import { SKETCH_COMPONENT_REGISTRY as SOURCE_SKETCH_COMPOSITIONS, type SketchCompositionMetadata, type ArtDirection } from '@pagosya/shared-types';
import { createHash } from 'node:crypto';
import { SOURCE_DNA_ENUMS } from './source-dna';

export type SourceLayoutGrammar = typeof SOURCE_DNA_ENUMS.layout.grammar[number];

/**
 * The signature moment of a direction, named after the `@pagosya/ui` component
 * that performs it.
 *
 * This used to be inferred from the prose in `signature`, and the recipe below
 * then ignored it: every direction was handed the same Hero → Catalog →
 * FeatureSplit example whatever scene it had chosen. A model copies the concrete
 * example far more readily than the component list it rides with, so the kit's
 * scroll scenes — ScrollScrubHero, ParallaxStack, StoryChapters, Gallery,
 * TextFillStatement — were built, styled, tested for reduced motion, and then
 * never asked for. The scene is now declared per direction and the recipe emits
 * it.
 */
export type SceneName = 'feature-split' | 'chapters' | 'showcase' | 'floating-media'
  | 'parallax-stack' | 'scrub-media' | 'text-fill' | 'directory' | 'gallery' | 'marquee'
  | 'before-after' | 'video';

/** Authored reference directions, not templates or business facts. Choices remain advisory. */
export type SourceUiComposition = {
  header: string; hero: string; catalog: string; card: string; fx: string; signature: string;
  footer: string; radius: string; rhythm: string;
  family?: string; direction?: string; rationale?: string; typography?: string; mobile?: string;
  assetPlan?: string; sections?: readonly string[]; referenceExample?: string;
  storyRoles?: readonly string[]; scene?: SceneName; scrollFeel?: 'native' | 'soft' | 'cinematic';
};
type Direction = Omit<SourceUiComposition, 'family' | 'rationale' | 'referenceExample'> & { minImages: number };
export type SourceCompositionFamily = {
  id: string; purpose: string; terms: readonly string[]; referenceExample?: string;
  /** DNA layout grammars this family serves, strongest first: the chosen concept's grammar prefers it. */
  grammars: readonly SourceLayoutGrammar[];
  /**
   * The family's look only makes sense for its own trade (a café menu, a beauty
   * edit). It earns the grammar bonus only when the brief names that trade, so a
   * planner's grammar never turns a watch shop into a coffee counter.
   */
  domainBound?: boolean;
  directions: readonly Direction[];
};

export const SOURCE_COMPOSITION_FAMILIES: readonly SourceCompositionFamily[] = [
  {
    id: 'cafe-expressive', domainBound: true, grammars: ['poster', 'editorial'], purpose: 'A memorable food or drink identity with a fast path to the real menu.',
    terms: ['cafe', 'coffee', 'cafeteria', 'panaderia', 'bakery', 'restaurante', 'restaurant', 'bebidas', 'heladeria'],
    referenceExample: 'examples/yapi-design-families/cafe-expressive',
    directions: [
      { direction: 'Counter poster', minImages: 0, scene: 'text-fill', header: 'classic', hero: 'typographic', catalog: 'grid', card: 'minimal', fx: 'none', signature: 'Bespoke typographic menu with one oversized category index; only actual catalog labels.', footer: 'ink', radius: '4-8', rhythm: 'balanced (space 1)', typography: 'Bricolage display / Instrument Sans text', mobile: 'Compact opening; menu and purchase controls remain immediately reachable.', assetPlan: 'Works without photos; do not invent drinks, prices or imagery.', sections: ['opening', 'menu'] },
      { direction: 'Floating counter', minImages: 2, scene: 'floating-media', header: 'split', hero: 'split', catalog: 'grid', card: 'framed', fx: 'lift', signature: 'FloatingMedia using approved drink or food images; preserve photo backgrounds unless real cutouts are provided.', footer: 'ink', radius: '14-24', rhythm: 'balanced (space 1)', typography: 'Bricolage display / Instrument Sans text', mobile: 'Stack heading then two contained photos; stop decorative drift for reduced motion.', assetPlan: 'Two approved images; keep product identity and contain complete packaging.', sections: ['opening', 'menu', 'place'] },
      { direction: 'Neighborhood journal', minImages: 1, scene: 'feature-split', header: 'centered', hero: 'editorial', catalog: 'editorial', card: 'caption', fx: 'none', signature: 'A single FeatureSplit about the actual place, using supplied facts and one large photo.', footer: 'paper', radius: '0', rhythm: 'airy (space 1.15)', typography: 'Fraunces display / Instrument Sans text', mobile: 'Photo follows headline; editorial catalog becomes readable single-column rows.', assetPlan: 'One approved photograph; include the place story only when evidenced.', sections: ['opening', 'menu', 'story'] },
      { direction: 'Counter reel', minImages: 2, scene: 'marquee', header: 'floating', hero: 'fullbleed', catalog: 'rail', card: 'overlay', fx: 'grow', signature: 'Marquee of the real menu labels over a full-bleed counter photograph; only names that exist in the catalog.', footer: 'ink', radius: '14-24', rhythm: 'tight (space 0.9)', typography: 'Bricolage display / Instrument Sans text', mobile: 'Rail scrolls by touch; marquee halves its speed and stops under reduced motion.', assetPlan: 'Two approved photographs of the place or the food; never invent a dish.', sections: ['opening', 'menu'] },
      { direction: 'Counter film', minImages: 1, scene: 'video', header: 'split', hero: 'fullbleed', catalog: 'grid', card: 'framed', fx: 'lift', signature: 'VideoHero playing the merchant-supplied clip of the real place, with a photographic poster for the first frame.', footer: 'ink', radius: '14-24', rhythm: 'balanced (space 1)', typography: 'Bricolage display / Instrument Sans text', mobile: 'Poster carries the opening; the clip never autoplays with sound.', assetPlan: 'One approved MP4 supplied by the merchant plus its poster photograph; never promise or generate footage.', sections: ['opening', 'menu'] },
    ],
  },
  {
    id: 'beauty-editorial', domainBound: true, grammars: ['editorial', 'magazine'], purpose: 'Editorial beauty, skincare or fragrance presentation with clear product choices.',
    terms: ['beauty', 'belleza', 'cosmetica', 'cosmeticos', 'skincare', 'piel', 'perfume', 'fragrance', 'maquillaje'],
    referenceExample: 'examples/yapi-design-families/beauty-editorial',
    directions: [
      { direction: 'Product editorial', minImages: 1, scene: 'feature-split', header: 'centered', hero: 'editorial', catalog: 'editorial', card: 'caption', fx: 'none', signature: 'A bespoke still-life frame with oversized type and one approved product photograph.', footer: 'paper', radius: '0', rhythm: 'airy (space 1.2)', typography: 'Instrument Serif display / Instrument Sans text', mobile: 'Headline before contained product image; no text across unreadable packaging.', assetPlan: 'One real product image; never fabricate efficacy, ingredients or before/after results.', sections: ['opening', 'collection', 'details'] },
      { direction: 'Ritual sequence', minImages: 3, scene: 'chapters', header: 'split', hero: 'split', catalog: 'grid', card: 'minimal', fx: 'reveal', signature: 'StoryChapters with three approved images and only evidenced product-use steps.', footer: 'ink', radius: '4-8', rhythm: 'balanced (space 1)', typography: 'Fraunces display / Instrument Sans text', mobile: 'Chapters read in document order without pinning on small screens.', assetPlan: 'Three approved images; use visual chapters without inventing a routine when product instructions are absent.', sections: ['opening', 'collection', 'ritual'] },
      { direction: 'Beauty index', minImages: 0, scene: 'text-fill', header: 'classic', hero: 'typographic', catalog: 'grid', card: 'minimal', fx: 'none', signature: 'Bespoke category typography and restrained hairlines built around the available catalog.', footer: 'paper', radius: '0', rhythm: 'balanced (space 1)', typography: 'Instrument Sans with contrasting display scale', mobile: 'Concise opening and visible product names, prices and actions.', assetPlan: 'Photo-independent; leave optional media absent rather than invent it.', sections: ['opening', 'collection'] },
      { direction: 'Texture scrub', minImages: 2, scene: 'scrub-media', header: 'split', hero: 'fullbleed', catalog: 'masonry', card: 'minimal', fx: 'reveal zoom', signature: 'ScrollScrubHero holding one approved texture while the claim resolves; masonry catalog beneath.', footer: 'paper', radius: '4-8', rhythm: 'airy (space 1.15)', typography: 'Instrument Serif display / Instrument Sans text', mobile: 'The scrub stage becomes a static full-bleed opening; masonry reflows to one column.', assetPlan: 'Two approved product or texture photographs; never imply results the merchant has not stated.', sections: ['opening', 'collection'] },
      { direction: 'Evidence pair', minImages: 2, scene: 'before-after', header: 'centered', hero: 'split', catalog: 'grid', card: 'caption', fx: 'reveal', signature: 'BeforeAfter comparing two photographs the merchant supplied of the same subject; label only what they stated, never an implied result.', footer: 'paper', radius: '4-8', rhythm: 'balanced (space 1)', typography: 'Instrument Serif display / Instrument Sans text', mobile: 'The slider stays thumb-sized and both labels remain readable.', assetPlan: 'Two approved photographs of the same subject; omit the section entirely unless the merchant confirmed the pair.', sections: ['opening', 'collection', 'evidence'] },
    ],
  },
  {
    id: 'product-cinematic', grammars: ['editorial', 'collage'], purpose: 'Image-led furniture, objects, clothing or considered product stories.',
    terms: ['furniture', 'muebles', 'mobiliario', 'interiores', 'interior', 'design objects', 'objetos', 'cinematic', 'cinematografico', 'moda', 'fashion', 'textiles'],
    referenceExample: 'examples/yapi-design-families/product-cinematic',
    directions: [
      { direction: 'Object in space', minImages: 1, scene: 'showcase', header: 'floating', hero: 'fullbleed', catalog: 'spotlight', card: 'caption', fx: 'none', signature: 'One ProductShowcase scene built around the approved hero object; preserve the product silhouette.', footer: 'ink', radius: '0', rhythm: 'airy (space 1.2)', typography: 'Instrument Serif display / Instrument Sans text', mobile: 'Use a legible text panel and static portrait crop; keep the object visible.', assetPlan: 'Requires a suitable approved scene photo. If available photos are packshots, use a contained split hero instead. Video is optional only when supplied.', sections: ['opening', 'collection', 'object-story'] },
      { direction: 'Material journal', minImages: 2, scene: 'feature-split', header: 'split', hero: 'editorial', catalog: 'editorial', card: 'minimal', fx: 'none', signature: 'FeatureSplit pairs approved object and detail photos with supplied material facts.', footer: 'paper', radius: '0', rhythm: 'airy (space 1.15)', typography: 'Fraunces display / Instrument Sans text', mobile: 'Alternate images collapse into ordered image/caption pairs with natural scrolling.', assetPlan: 'Two approved photographs; never synthesize construction, provenance or certifications.', sections: ['opening', 'collection', 'material'] },
      { direction: 'Object index', minImages: 0, scene: 'text-fill', header: 'classic', hero: 'typographic', catalog: 'grid', card: 'minimal', fx: 'none', signature: 'An oversized object index with a typographic brand detail specific to the supplied catalog.', footer: 'paper', radius: '0', rhythm: 'balanced (space 1)', typography: 'Instrument Sans with strong size contrast', mobile: 'Short title, compact navigation and a straightforward product grid.', assetPlan: 'Usable with no images; optional supplied packshots remain contained.', sections: ['opening', 'collection'] },
      { direction: 'Object parallax', minImages: 3, scene: 'parallax-stack', header: 'floating', hero: 'split', catalog: 'spotlight', card: 'framed', fx: 'grow zoom', signature: 'ParallaxStack of three approved object photographs at different depths; the product stays whole in every plate.', footer: 'ink', radius: '14-24', rhythm: 'balanced (space 1)', typography: 'Instrument Serif display / Instrument Sans text', mobile: 'Plates stack in document order with the drift removed.', assetPlan: 'Three approved photographs of the same object family; no invented angles.', sections: ['opening', 'collection', 'object-story'] },
      { direction: 'Object gallery', minImages: 4, scene: 'gallery', header: 'centered', hero: 'editorial', catalog: 'masonry', card: 'overlay', fx: 'zoom', signature: 'A mosaic Gallery of approved photographs reading as a contact sheet, with the catalog as its index.', footer: 'paper', radius: '0', rhythm: 'airy (space 1.15)', typography: 'Fraunces display / Instrument Sans text', mobile: 'Mosaic becomes a two-column grid; overlay captions stay legible over every crop.', assetPlan: 'Four or more approved photographs; show only goods the merchant actually sells.', sections: ['opening', 'collection', 'gallery'] },
    ],
  },
  {
    id: 'catalog-practical', grammars: ['grid', 'index'], purpose: 'Photo-light or broad catalogs where finding and buying products is the main task.',
    terms: ['catalogo', 'catalog', 'ferreteria', 'hardware', 'abarrotes', 'grocery', 'repuestos', 'wholesale', 'mayorista'],
    directions: [
      { direction: 'Clear catalog', minImages: 0, scene: 'directory', header: 'classic', hero: 'typographic', catalog: 'grid', card: 'minimal', fx: 'none', signature: 'A bespoke compact category index grounded in the real catalog.', footer: 'paper', radius: '4-8', rhythm: 'dense (space 0.92)', typography: 'Instrument Sans with strong heading weight contrast', mobile: 'Keep category controls and purchase buttons reachable without horizontal page overflow.', assetPlan: 'Does not depend on photography; use existing product images only.', sections: ['opening', 'catalog'] },
      { direction: 'Editorial directory', minImages: 0, scene: 'directory', header: 'split', hero: 'typographic', catalog: 'editorial', card: 'caption', fx: 'none', signature: 'A numbered category directory with generous dividing rules and concise factual descriptions.', footer: 'ink', radius: '0', rhythm: 'balanced (space 1)', typography: 'Oswald display / Instrument Sans text', mobile: 'Directory and product rows become single-column; long names wrap.', assetPlan: 'Typography carries the identity when no approved photography exists.', sections: ['directory', 'catalog'] },
      { direction: 'Featured selection', minImages: 1, scene: 'feature-split', header: 'centered', hero: 'split', catalog: 'grid', card: 'framed', fx: 'none', signature: 'One approved feature photograph with a compact live catalog immediately below.', footer: 'paper', radius: '4-8', rhythm: 'balanced (space 1)', typography: 'Bricolage display / Instrument Sans text', mobile: 'Small contained opening image; never make a large catalog horizontally scroll only.', assetPlan: 'One approved image, no invented bestseller or promotion claims.', sections: ['opening', 'catalog'] },
      { direction: 'Shelf sequence', minImages: 3, scene: 'chapters', header: 'classic', hero: 'split', catalog: 'rail', card: 'classic', fx: 'reveal lift', signature: 'StoryChapters walking the real aisles or ranges, each with one approved photograph and factual copy.', footer: 'ink', radius: '4-8', rhythm: 'balanced (space 1)', typography: 'Instrument Sans with contrasting display scale', mobile: 'Chapters read in order without pinning; the rail stays swipeable with prices visible.', assetPlan: 'Three approved photographs of real ranges; never stage a category that does not exist.', sections: ['opening', 'collection', 'ranges'] },
    ],
  },
  {
    id: 'poster-loud', grammars: ['poster', 'brutalist'], purpose: 'A loud, type-first identity for music, events, streetwear and drops, with the live catalog one scroll away.',
    terms: ['discos', 'vinilos', 'vinyl', 'records', 'musica', 'music', 'eventos', 'events', 'streetwear', 'ropa urbana', 'merch', 'sneakers', 'zapatillas'],
    directions: [
      { direction: 'Headline poster', minImages: 0, scene: 'text-fill', header: 'classic', hero: 'typographic', catalog: 'grid', card: 'minimal', fx: 'reveal', signature: 'A wall-sized headline cropped by the viewport edge, set from the real merchant name or offer, then the live drop grid.', footer: 'ink', radius: '0', rhythm: 'tight (space 0.9)', typography: 'Big Shoulders Display display / Space Grotesk text', mobile: 'The headline wraps to three lines at most at 320px; the grid starts within the first screen.', assetPlan: 'Photo-independent; the typography is the poster.', sections: ['opening', 'drop'] },
      { direction: 'Drop reel', minImages: 2, scene: 'marquee', header: 'floating', hero: 'fullbleed', catalog: 'rail', card: 'overlay', fx: 'grow', signature: 'Marquee of the real product or release names over a full-bleed approved photograph, like a flyposted wall.', footer: 'ink', radius: '0', rhythm: 'tight (space 0.9)', typography: 'Anton display / Chivo text', mobile: 'Rail scrolls by touch; the marquee slows and stops under reduced motion.', assetPlan: 'Two approved photographs; only names that exist in the catalog.', sections: ['opening', 'drop'] },
      { direction: 'Gig bill', minImages: 1, scene: 'floating-media', header: 'split', hero: 'split', catalog: 'grid', card: 'framed', fx: 'lift', signature: 'An asymmetric bill-poster opening: stacked condensed lines beside one approved image, set like a concert bill.', footer: 'paper', radius: '0', rhythm: 'balanced (space 1)', typography: 'Bebas Neue display / Space Mono text', mobile: 'Lines stack above a single contained image; decorative drift stops for reduced motion.', assetPlan: 'One approved image; never invent dates, venues or line-ups.', sections: ['opening', 'drop', 'info'] },
    ],
  },
  {
    id: 'magazine-spread', grammars: ['magazine', 'editorial'], purpose: 'A printed-magazine rhythm for books, stationery, food writing and considered goods.',
    terms: ['libros', 'books', 'libreria', 'bookshop', 'revista', 'magazine', 'papeleria', 'stationery', 'zine'],
    directions: [
      { direction: 'Cover story', minImages: 1, scene: 'feature-split', header: 'centered', hero: 'editorial', catalog: 'editorial', card: 'caption', fx: 'none', signature: 'A cover-like opening with a masthead wordmark and one approved photograph, then a feature spread about a real product.', footer: 'paper', radius: '0', rhythm: 'airy (space 1.15)', typography: 'Playfair Display display / Newsreader text', mobile: 'Masthead, then the photograph, then the headline; columns become one reading column.', assetPlan: 'One approved photograph; the feature copy uses supplied facts only.', sections: ['cover', 'catalog', 'feature'] },
      { direction: 'Feature well', minImages: 3, scene: 'chapters', header: 'split', hero: 'split', catalog: 'grid', card: 'caption', fx: 'reveal', signature: 'StoryChapters paced like a magazine feature well: one approved photograph and one evidenced fact per page.', footer: 'ink', radius: '0', rhythm: 'balanced (space 1)', typography: 'DM Serif Display display / Figtree text', mobile: 'Chapters read in order without pinning.', assetPlan: 'Three approved photographs; never invent an interview or quote.', sections: ['opening', 'catalog', 'feature'] },
      { direction: 'Contents page', minImages: 0, scene: 'directory', header: 'classic', hero: 'typographic', catalog: 'editorial', card: 'minimal', fx: 'none', signature: 'A table of contents built from the real categories, with page-number-like counts of real products.', footer: 'paper', radius: '0', rhythm: 'balanced (space 1)', typography: 'Libre Caslon Text display / Manrope text', mobile: 'Contents become a single column of tappable rows.', assetPlan: 'Photo-independent; counts come from the live catalog only.', sections: ['contents', 'catalog'] },
    ],
  },
  {
    id: 'collage-cutout', grammars: ['collage'], purpose: 'Layered, handmade-feeling composition for crafts, toys, gifts, plants and playful goods.',
    terms: ['artesania', 'artesanias', 'handmade', 'hecho a mano', 'crafts', 'juguetes', 'toys', 'regalos', 'gifts', 'plantas', 'plants', 'flores', 'flowers'],
    directions: [
      { direction: 'Scrapbook table', minImages: 2, scene: 'floating-media', header: 'floating', hero: 'split', catalog: 'masonry', card: 'framed', fx: 'grow', signature: 'Approved photographs laid like prints on a table, overlapping at slight angles around the real name.', footer: 'paper', radius: '4-8', rhythm: 'balanced (space 1)', typography: 'Shrikhand display / Nunito text', mobile: 'Prints stack with small offsets; nothing covers text or controls.', assetPlan: 'Two or more approved photographs; keep every product whole.', sections: ['opening', 'catalog'] },
      { direction: 'Pinned gallery', minImages: 3, scene: 'gallery', header: 'centered', hero: 'editorial', catalog: 'masonry', card: 'overlay', fx: 'reveal zoom', signature: 'A pinned-board Gallery of approved photographs with handwritten-feeling captions from real product names.', footer: 'ink', radius: '4-8', rhythm: 'airy (space 1.15)', typography: 'Young Serif display / Rubik text', mobile: 'The board becomes a two-column grid; captions stay legible.', assetPlan: 'Three or more approved photographs; show only goods the merchant sells.', sections: ['opening', 'catalog', 'board'] },
      { direction: 'Label sheet', minImages: 0, scene: 'marquee', header: 'classic', hero: 'typographic', catalog: 'grid', card: 'framed', fx: 'lift', signature: 'Real category names set as tilted paper labels around the catalog; no invented artwork.', footer: 'paper', radius: '14-24', rhythm: 'balanced (space 1)', typography: 'Rubik display / Nunito text', mobile: 'Labels straighten into a wrapping row above the grid.', assetPlan: 'Photo-independent; labels come from real categories.', sections: ['opening', 'catalog'] },
    ],
  },
  {
    id: 'brutalist-raw', grammars: ['brutalist', 'grid'], purpose: 'Raw, structural, high-contrast storefront for tech, tools, skate and experimental brands.',
    terms: ['tecnologia', 'tech', 'electronica', 'electronics', 'gaming', 'skate', 'gadgets', 'software'],
    directions: [
      { direction: 'Spec sheet', minImages: 0, scene: 'directory', header: 'classic', hero: 'typographic', catalog: 'grid', card: 'minimal', fx: 'none', signature: 'Exposed grid lines and monospaced real specifications; the catalog reads like a parts sheet.', footer: 'ink', radius: '0', rhythm: 'dense (space 0.92)', typography: 'Space Mono display / Space Grotesk text', mobile: 'Spec rows stack; no horizontal page scroll.', assetPlan: 'Photo-independent; specifications come from the catalog only.', sections: ['opening', 'catalog'] },
      { direction: 'Exposed grid', minImages: 1, scene: 'text-fill', header: 'split', hero: 'split', catalog: 'grid', card: 'classic', fx: 'reveal lift', signature: 'A hard-edged split opening with visible grid rules and one oversized statement that fills as it is read.', footer: 'ink', radius: '0', rhythm: 'tight (space 0.9)', typography: 'Unbounded display / Epilogue text', mobile: 'Grid rules collapse to a single column divider.', assetPlan: 'One approved image, shown uncropped.', sections: ['opening', 'catalog', 'statement'] },
      { direction: 'Product x-ray', minImages: 2, scene: 'scrub-media', header: 'floating', hero: 'fullbleed', catalog: 'spotlight', card: 'framed', fx: 'zoom', signature: 'ScrollScrubHero holding one approved product photograph while labelled real specifications resolve.', footer: 'ink', radius: '0', rhythm: 'balanced (space 1)', typography: 'Syne display / Chivo text', mobile: 'The scrub becomes a static opening with the specifications listed below.', assetPlan: 'Two approved photographs; never invent specifications.', sections: ['opening', 'catalog'] },
    ],
  },
  {
    id: 'index-archive', grammars: ['index', 'grid'], purpose: 'A numbered archive for vintage, antiques, collections and curated one-off pieces.',
    terms: ['vintage', 'antiguedades', 'antiques', 'coleccion', 'coleccionables', 'collectibles', 'archivo', 'archive', 'segunda mano', 'thrift'],
    directions: [
      { direction: 'Numbered archive', minImages: 0, scene: 'directory', header: 'classic', hero: 'typographic', catalog: 'editorial', card: 'caption', fx: 'none', signature: 'Each real piece gets an archive number and a one-line record, like an auction index.', footer: 'paper', radius: '0', rhythm: 'dense (space 0.92)', typography: 'Bodoni Moda display / Familjen Grotesk text', mobile: 'Index rows keep number, name and price on one line where they fit.', assetPlan: 'Photo-independent; numbers are presentational, never stock claims.', sections: ['index', 'catalog'] },
      { direction: 'Lot catalogue', minImages: 2, scene: 'gallery', header: 'centered', hero: 'editorial', catalog: 'masonry', card: 'caption', fx: 'zoom', signature: 'A contact-sheet Gallery of approved photographs captioned with real lot names.', footer: 'paper', radius: '0', rhythm: 'airy (space 1.15)', typography: 'Lora display / Outfit text', mobile: 'The sheet becomes a two-column grid.', assetPlan: 'Two or more approved photographs; one-off pieces stay truthful about condition.', sections: ['opening', 'catalog', 'sheet'] },
      { direction: 'Shelf index', minImages: 1, scene: 'feature-split', header: 'split', hero: 'split', catalog: 'grid', card: 'minimal', fx: 'reveal', signature: 'A shelf-label index beside one approved photograph of the collection.', footer: 'ink', radius: '4-8', rhythm: 'balanced (space 1)', typography: 'Sora display / Bitter text', mobile: 'Photograph first, then the index as rows.', assetPlan: 'One approved photograph of the real collection.', sections: ['opening', 'catalog', 'shelf'] },
    ],
  },
];

export type SourceCompositionInput = {
  seed?: string; brief?: unknown; instruction?: string; catalogItemCount?: number;
  /** The chosen concept's DNA layout.grammar; unknown values are ignored. */
  grammar?: string;
  assets?: ReadonlyArray<{ kind: string; role?: string }>;
};
const normalized = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const hash = (text: string) => createHash('sha256').update(text).digest().readUInt32BE(0);

/** Seed varies whole compatible directions, never independent style fields. No network/model work. */
export function sourceUiCompositions(input: SourceCompositionInput = {}): SourceUiComposition[] {
  const brief = typeof input.brief === 'string' ? input.brief : JSON.stringify(input.brief ?? {});
  const text = normalized(`${brief} ${input.instruction ?? ''}`);
  const imageCount = (input.assets ?? []).filter(asset => asset.kind === 'image' && !['logo', 'reference', 'unused'].includes(asset.role ?? '')).length;
  const seed = input.seed ?? `${brief}|${input.instruction ?? ''}`;
  const ranked = SOURCE_COMPOSITION_FAMILIES.map(family => {
    const keywords = family.terms.reduce((sum, term) => sum + (new RegExp(`(?:^|[^a-z])${term}(?:$|[^a-z])`).test(text) ? 10 : 0), 0);
    // The planner already committed to this grammar, so it outweighs a keyword match —
    // except for a domain-bound family the brief never named.
    const grammarFits = Boolean(input.grammar) && (!family.domainBound || keywords > 0);
    return { family, score: keywords
      + (family.id === 'catalog-practical' ? 1 + ((input.catalogItemCount ?? 0) > 24 ? 12 : 0) : 0)
      + (grammarFits && family.grammars[0] === input.grammar ? 25 : grammarFits && family.grammars.includes(input.grammar as SourceLayoutGrammar) ? 12 : 0) };
  }).sort((a, b) => b.score - a.score);
  const primary = ranked[0].family;
  const candidates = ranked.flatMap(({ family }, rank) => family.directions
    .filter(direction => direction.minImages <= imageCount)
    // Counts establish feasibility only. A scene with multiple decorative photos
    // needs a thematic job; additional uploads never create that job.
    .filter(direction => {
      if (direction.scene === 'gallery') return /lookbook|editorial collection|collection story|gallery|galeria|archivo|archive|vintage/.test(text);
      if (['floating-media', 'parallax-stack'].includes(direction.scene ?? '')) return input.grammar === 'collage' || /collage|cutout|recortes|parallax|floating/.test(text);
      if (direction.scene === 'before-after') return /before.after|antes.y.despues|comparison pair/.test(text);
      if (direction.scene === 'video') return (input.assets ?? []).some(asset => asset.kind === 'video' && !['reference', 'unused'].includes(asset.role ?? ''));
      return true;
    })
    .map(direction => ({ family, direction, rank, order: hash(`${seed}|${family.id}|${direction.direction}`) })))
    .sort((a, b) => a.rank - b.rank || a.order - b.order).slice(0, 3);
  return candidates.map(({ family, direction }) => {
    const { minImages: _minImages, ...composition } = direction;
    const scene = direction.scene ?? 'feature-split';
    const storyRoles = direction.sections?.map((section, index) => index === 0 ? 'opening' : /menu|catalog|collection/.test(section) ? 'offer' : index === direction.sections!.length - 1 ? 'action' : 'proof');
    return { ...composition, family: family.id, referenceExample: family.referenceExample,
      storyRoles, scene, scrollFeel: SCENES[scene].feel,
      rationale: `${family.id === primary.id ? 'Closest brief/catalog fit' : 'Compatible alternative'}; ${imageCount} usable image(s), ${input.catalogItemCount ?? 0} current catalog items. ${family.purpose}`,
    };
  });
}

export const SOURCE_COMPOSITION_PLANNING = 'Composition candidates are independent starting directions with asset requirements and mobile plans, not a mandatory template. Develop each concept from a different candidate or an explicitly explained custom composition. Merchant instructions, confirmed typography/colors and actual image roles override every candidate. Never force the suggested fonts, sections or effect when they conflict. Borrow visual structure from an owned reference, never its fictional copy, prices or product facts. Keep catalog and purchase controls complete for large catalogs; omit unsupported story sections. Product grids, category discovery, useful comparisons and thematic editorial collections are valid. Image quantity establishes feasibility, never a reason for a collage or extra gallery. References such as craft denim, outdoor apparel, travel goods and fashion campaigns teach different buying journeys: choose from product facts and theme, never clone brand claims. A concept may depart from all families when the brief warrants it. Keep all unrelated composition and tokens on later local edits.';

/**
 * What each scene is, as code the model can copy.
 *
 * `opening` replaces the Hero when the scene owns the top of the page; `story`
 * is the signature section. `imports` keeps the recipe's import line honest:
 * it used to name eleven components for every direction, which is roughly a
 * quarter of the kit and exactly the quarter that turned up in the output.
 */
const SCENES: Record<SceneName, { opening?: string; story?: string; imports: readonly string[]; feel: 'native' | 'soft' | 'cinematic' }> = {
  'feature-split': { imports: ['FeatureSplit'], feel: 'soft' },
  'floating-media': { feel: 'soft', imports: ['FloatingMedia'],
    opening: '<FloatingMedia images={approvedImages} title={merchantHeading} lead={merchantIntro} actions={<Button href="#collection">Ver productos</Button>}/>' },
  'scrub-media': { feel: 'cinematic', imports: ['ScrollScrubHero'],
    opening: '<ScrollScrubHero poster={approvedHero} title={merchantHeading} lead={merchantIntro} actions={<Button href="#collection">Ver productos</Button>}/>' },
  showcase: { feel: 'cinematic', imports: ['ProductShowcase'],
    story: '<ProductShowcase image={approvedHero} title={actualProductName} body={actualProductFacts} action={<Button href="#collection">Ver la colección</Button>}/>' },
  'parallax-stack': { feel: 'cinematic', imports: ['ParallaxStack'],
    story: '<ParallaxStack images={approvedImages}/>' },
  chapters: { feel: 'soft', imports: ['StoryChapters'],
    story: '<StoryChapters chapters={[{title:evidencedStepTitle,body:evidencedStepCopy,image:approvedStepImage}]}/>' },
  gallery: { feel: 'soft', imports: ['Gallery'],
    story: '<Gallery images={approvedImages} variant="mosaic"/>' },
  'text-fill': { feel: 'native', imports: ['TextFillStatement'],
    story: '<TextFillStatement>{merchantStatement}</TextFillStatement>' },
  directory: { feel: 'native', imports: ['SectionSequence', 'SectionHead'],
    story: '<SectionSequence><SectionHead title={realCategoryTitle}/><Text>{evidencedCategoryCopy}</Text></SectionSequence>' },
  marquee: { feel: 'native', imports: ['Marquee'],
    story: '<Marquee items={realCatalogLabels}/>' },
  // Only honest with two photographs of the same subject the merchant supplied;
  // never a stock pair and never an implied result.
  'before-after': { feel: 'soft', imports: ['BeforeAfter'],
    story: '<BeforeAfter before={approvedBeforePhoto} after={approvedAfterPhoto} label={evidencedComparisonLabel}/>' },
  video: { feel: 'cinematic', imports: ['VideoHero'],
    opening: '<VideoHero poster={approvedHero} src={approvedVideoPath} title={merchantHeading} lead={merchantIntro} actions={<Button href="#collection">Ver productos</Button>}/>' },
};

/** Self-contained implementation evidence: no filesystem access or example business facts needed by the model. */
export function sourceUiCompositionRecipe(composition: SourceUiComposition): string {
  const scene = SCENES[composition.scene ?? 'feature-split'] ?? SCENES['feature-split'];
  const opening = scene.opening
    ?? `<Hero variant="${composition.hero}" title={merchantHeading} lead={merchantIntro}${composition.hero === 'typographic' ? '' : ' image={approvedHero}'} actions={<Button href="#collection">Ver productos</Button>}/>`;
  // The side is a property of the direction, kept stable so a rebuilt recipe
  // does not move a merchant's page. Every direction used to hand back this same
  // FeatureSplit, whatever scene it had chosen.
  const signature = scene.story
    ?? `<FeatureSplit image={approvedSupportingImage} title={evidencedStoryHeading}${hash(`${composition.family}|${composition.direction ?? ''}`) % 2 ? ' reverse' : ''}><Text>{evidencedStoryCopy}</Text></FeatureSplit>`;
  // A scene that owns only the opening still falls back to FeatureSplit for its
  // story, and an import line missing it hands the model an example that cannot compile.
  const imports = ['StoreTheme', 'SiteHeader', ...(scene.opening ? [] : ['Hero']), 'Catalog', ...scene.imports,
    ...(scene.story ? [] : ['FeatureSplit']), 'Text', 'Button', 'CommerceSlots'];
  return `OWNED COMPOSITION RECIPE (${composition.family}/${composition.direction}; technique example, not a required page or business content):
import {${[...new Set(imports)].join(',')}} from '@pagosya/ui';
<StoreTheme tokens={merchantTokens}>
  <SiteHeader name={merchantName} variant="${composition.header}" links={realNavigation}/>
  <main>
    <section id="opening">${opening}</section>
    <section id="collection"><Catalog title={catalogHeading} layout="${composition.catalog}" card="${composition.card}" fx="${composition.fx}"/></section>
    <section id="story">${signature}</section>
  </main><CommerceSlots/>
</StoreTheme>
Replace every variable with declared values from this brief and owned image paths. Rename/reorder section IDs to match the committed plan. The chosen concept overrides this example. Omit story or supporting media when facts/assets are absent; never invent a photograph to fill the recipe. Use the same merchantTokens and shared navigation on product/checkout pages. Story/feature sections link to the catalog or ProductDetail instead of repeating prices; amount is integer minor units, never a display string. ${composition.assetPlan} Mobile: ${composition.mobile} Use content-sized opening spacing without photos; avoid a short heading isolated in an empty viewport. Keep intentional display scale, visible purchase actions and clean 320px reflow. State the Hero variant explicitly; an unstated one is chosen for you. When a page carries more than one FeatureSplit, alternate the side the photograph sits on by adding or dropping reverse, so two consecutive ones never share a handedness. This scene is the page's one signature moment: author a merchant-specific visual detail around it rather than adding a second scroll effect.`;
}

/** The structured Boceto adapter for the same owned composition library. This is metadata,
 * never a code recipe: sketch.json references family/variant and the assembler owns markup. */
export { SKETCH_COMPONENT_REGISTRY as SOURCE_SKETCH_COMPOSITIONS, type SketchCompositionMetadata } from '@pagosya/shared-types';
export type SketchCompositionFitInput = { style?: ArtDirection['style']; density?: ArtDirection['layoutDensity']; text: string; catalogItems: number; assets: ReadonlyArray<{ role?: string }>; newsletterEnabled?: boolean; hasReviewContent?: boolean };
export function sketchCompositionFit(entry: SketchCompositionMetadata, input: SketchCompositionFitInput): { eligible: boolean; score: number; reasons: string[] } {
  const images = input.assets.map(asset => ({ ...asset, role: sketchImageRole(asset) })).filter(asset => !['logo', 'reference', 'unused'].includes(asset.role || ''));
  const reasons: string[] = [];
  if (images.length < entry.needs.images) reasons.push(`Needs ${entry.needs.images} usable image(s)`);
  if (entry.needs.sceneImage && !images.some(asset => isSceneImage(asset.role))) reasons.push('Needs a scene photograph suitable for a full-bleed crop');
  if (entry.needs.productImage && !images.some(asset => isProductImage(asset.role))) reasons.push('Needs actual product or packaging photography');
  if (entry.maxCatalogItems && input.catalogItems > entry.maxCatalogItems) reasons.push('Catalog too large for an unfiltered product feature');
  if (entry.needs.newsletter && !input.newsletterEnabled) reasons.push('Signup disabled');
  if (entry.needs.reviewContent && !input.hasReviewContent) reasons.push('No supplied quote content');
  const text = normalized(input.text);
  const score = Number(!!input.style && entry.goodFor.styles.includes(input.style)) * 5 + Number(!!input.density && entry.worksWith.includes(input.density)) * 2 + entry.goodFor.verticals.reduce((sum, term) => sum + Number(text.includes(term)) * 2, 0);
  return { eligible: !reasons.length, score, reasons };
}
export function sourceSketchCompositionCandidates(input: SketchCompositionFitInput) {
  return SOURCE_SKETCH_COMPOSITIONS.map(entry => ({ ...entry, fit: sketchCompositionFit(entry, input) }));
}
