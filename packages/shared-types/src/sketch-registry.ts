/** Portable registry: AI metadata, schema enums, editor choices and fixed renderer routing.
 * Renderer ids reference trusted server adapters; merchant JSON never carries executable code. */
import type { ArtDirection } from './website-design';
export type DesignSectionType = 'hero' | 'catalog' | 'story' | 'split' | 'gallery' | 'collections' | 'steps' | 'reviews' | 'banner' | 'newsletter' | 'footer' | 'announce' | 'marquee' | 'faq';
type Definition = { type: DesignSectionType; variant: string; label: string; purpose: string; renderer: string; legacyVariant?: string };
const definitions: readonly Definition[] = [
  { type: 'hero', variant: 'split', label: 'Foto y texto', purpose: 'A clear introduction beside one supplied image.', renderer: 'legacy', legacyVariant: 'photo-right' },
  { type: 'hero', variant: 'immersive', legacyVariant: 'full-bleed', label: 'Imagen inmersiva', purpose: 'One strong scene photograph fills the opening, with legible overlay copy.', renderer: 'legacy' },
  { type: 'hero', variant: 'editorial', label: 'Editorial', purpose: 'Oversized type and an offset portrait image create editorial hierarchy.', renderer: 'legacy' },
  { type: 'hero', variant: 'statement', label: 'Título grande', purpose: 'A concise typographic introduction when imagery is absent or secondary.', renderer: 'legacy' },
  { type: 'hero', variant: 'overlap', label: 'Superpuesta', purpose: 'Copy and imagery meet through deliberate desktop overlap.', renderer: 'legacy' },
  { type: 'hero', variant: 'offset', label: 'Asimétrica', purpose: 'Unequal columns and a lowered image provide an airy opening.', renderer: 'legacy' },
  { type: 'hero', variant: 'product', label: 'Producto protagonista', purpose: 'Contained packshot takes priority without cropping the product.', renderer: 'legacy' },
  { type: 'hero', variant: 'poster', label: 'Póster', purpose: 'A compact large-type poster with rules and one clear action.', renderer: 'hero-poster' },
  { type: 'hero', variant: 'stacked', legacyVariant: 'stacked', label: 'Apilada', purpose: 'Legacy stacked copy and supplied media, preserved for existing merchants.', renderer: 'legacy' },
  { type: 'catalog', variant: 'grid', label: 'Cuadrícula', purpose: 'A straightforward live catalog with clear names, prices and purchasing.', renderer: 'legacy' },
  { type: 'catalog', variant: 'oversized', label: 'Tarjetas grandes', purpose: 'Large product cards for a considered small collection.', renderer: 'legacy' },
  { type: 'catalog', variant: 'rail', label: 'Carril', purpose: 'A horizontal browsing moment with visible product controls.', renderer: 'legacy' },
  { type: 'catalog', variant: 'alternating', label: 'Alternada', purpose: 'Staggered product photography for a small editorial selection.', renderer: 'legacy' },
  { type: 'catalog', variant: 'feature', label: 'Producto destacado', purpose: 'Lead with one featured live product, then show the remaining catalog.', renderer: 'legacy' },
  { type: 'catalog', variant: 'dense-grid', label: 'Compacta', purpose: 'Compact cards and category discovery for broad assortments.', renderer: 'legacy' },
  { type: 'story', variant: 'split', label: 'Foto y texto', purpose: 'Supplied brand facts beside one optional photograph.', renderer: 'legacy' },
  { type: 'story', variant: 'manifesto', label: 'Manifiesto', purpose: 'One large grounded brand statement as a typographic pause.', renderer: 'story-manifesto' },
  { type: 'story', variant: 'article', label: 'Artículo', purpose: 'Merchant-authored story arranged as an editorial article.', renderer: 'legacy' },
  { type: 'story', variant: 'quote', label: 'Cita', purpose: 'An expressive brand statement, never an invented customer testimonial.', renderer: 'legacy' },
  { type: 'story', variant: 'chapters', label: 'Capítulos', purpose: 'Numbered merchant story paragraphs in reading order, without invented steps.', renderer: 'story-chapters' },
  { type: 'split', variant: 'split', label: 'Foto y texto', purpose: 'A reusable image/copy feature with real details and actions.', renderer: 'legacy' },
  { type: 'split', variant: 'overlap', label: 'Superpuesta', purpose: 'An image feature meeting a copy panel on desktop.', renderer: 'legacy' },
  { type: 'split', variant: 'offset', label: 'Asimétrica', purpose: 'An asymmetric feature with breathing room around media.', renderer: 'legacy' },
  { type: 'gallery', variant: 'rail', label: 'Carril', purpose: 'Touch-scrollable supplied imagery with contained section boundaries.', renderer: 'legacy' },
  { type: 'gallery', variant: 'mosaic', label: 'Mosaico', purpose: 'Mixed-scale supplied photographs for a visual collection.', renderer: 'gallery-mosaic' },
  { type: 'gallery', variant: 'collage', label: 'Collage', purpose: 'A playful contact sheet with restrained desktop rotation.', renderer: 'legacy' },
  { type: 'gallery', variant: 'bleed', label: 'Imagen a todo ancho', purpose: 'One immersive full-width photographic moment.', renderer: 'legacy' },
  { type: 'collections', variant: 'grid', label: 'Cuadrícula', purpose: 'Clear navigation through real product categories.', renderer: 'legacy' },
  { type: 'collections', variant: 'spotlight', label: 'Categoría destacada', purpose: 'Give one genuine category more visual weight.', renderer: 'legacy' },
  { type: 'collections', variant: 'rail', label: 'Carril', purpose: 'Horizontal category discovery within a compact band.', renderer: 'legacy' },
  { type: 'steps', variant: 'grid', label: 'Cuadrícula', purpose: 'Supplied process or usage facts in a readable grid.', renderer: 'legacy' },
  { type: 'steps', variant: 'list', label: 'Lista', purpose: 'Supplied steps as spacious ruled rows, without invented processes.', renderer: 'legacy' },
  { type: 'reviews', variant: 'grid', label: 'Cuadrícula', purpose: 'Genuine supplied customer quotes with attribution.', renderer: 'legacy' },
  { type: 'reviews', variant: 'quote', label: 'Cita', purpose: 'One genuine supplied customer quote with typographic emphasis.', renderer: 'legacy' },
  { type: 'banner', variant: 'statement', label: 'Título grande', purpose: 'A brief grounded campaign or conversion statement.', renderer: 'legacy' },
  { type: 'banner', variant: 'offset', label: 'Asimétrica', purpose: 'A left-aligned editorial conversion moment.', renderer: 'legacy' },
  { type: 'newsletter', variant: 'center', label: 'Centrada', purpose: 'A concise signup entry for an enabled retention feature.', renderer: 'legacy' },
  { type: 'newsletter', variant: 'split', label: 'Foto y texto', purpose: 'Enabled signup paired with optional supplied brand imagery.', renderer: 'legacy' },
  { type: 'footer', variant: 'columns', label: 'Columnas', purpose: 'Familiar grouped navigation and store information.', renderer: 'legacy' },
  { type: 'footer', variant: 'statement', label: 'Título grande', purpose: 'Close with a large brand wordmark and practical links.', renderer: 'legacy' },
  { type: 'footer', variant: 'minimal', label: 'Minimalista', purpose: 'Quiet navigation and brand information for restrained layouts.', renderer: 'footer-minimal' },
  { type: 'footer', variant: 'editorial', label: 'Editorial', purpose: 'An asymmetric closing brand signature with ruled navigation.', renderer: 'legacy' },
  { type: 'announce', variant: 'strip', label: 'Franja', purpose: 'A short merchant-supplied announcement, never an invented promotion.', renderer: 'legacy' },
  { type: 'marquee', variant: 'strip', label: 'Franja', purpose: 'Real category or brand labels; pause motion for accessibility.', renderer: 'legacy' },
  { type: 'faq', variant: 'list', label: 'Lista', purpose: 'Known merchant questions and answers, with unknown policies omitted.', renderer: 'legacy' },
  { type: 'hero', variant: 'editorial-split', label: 'Editorial dividido', purpose: 'Oversized copy meets a narrow offset photograph.', renderer: 'hero-editorial' },
  { type: 'hero', variant: 'full-bleed', label: 'Fotografía inmersiva', purpose: 'A landscape lifestyle scene fills the opening with high contrast overlay copy.', renderer: 'hero-bleed' },
  { type: 'hero', variant: 'massive-type', label: 'Tipografía monumental', purpose: 'A type-led statement and compact navigation actions; no image required.', renderer: 'hero-type' },
  { type: 'hero', variant: 'floating-media', label: 'Medios flotantes', purpose: 'Two distinct photographs float beside a stable copy column.', renderer: 'hero-floating' },
  { type: 'hero', variant: 'product-stage', label: 'Escenario de producto', purpose: 'A contained genuine packshot dominates a generous stage.', renderer: 'hero-product' },
  { type: 'hero', variant: 'asymmetric-collage', label: 'Collage asimétrico', purpose: 'Two supplied images of different scales surround editorial copy.', renderer: 'hero-collage' },
  { type: 'hero', variant: 'magazine-cover', label: 'Portada de revista', purpose: 'A full-width headline above a wide photograph and ruled caption.', renderer: 'hero-cover' },
  { type: 'catalog', variant: 'editorial-index', label: 'Índice editorial', purpose: 'Numbered product rows with large titles, contained photography and inline purchasing.', renderer: 'catalog-index' },
  { type: 'catalog', variant: 'oversized-two-up', label: 'Dos productos grandes', purpose: 'Two large products with caption-style copy and compact purchase controls.', renderer: 'catalog-two-up' },
  { type: 'catalog', variant: 'horizontal-rail', label: 'Carril de productos', purpose: 'Large touch and keyboard scrollable live products.', renderer: 'catalog-rail' },
  { type: 'catalog', variant: 'product-spotlight', label: 'Producto protagonista', purpose: 'One product dominates a full-width row; remaining products keep their real prices and controls.', renderer: 'catalog-spotlight' },
  { type: 'catalog', variant: 'asymmetric-grid', label: 'Cuadrícula asimétrica', purpose: 'Unequal product media sizes in a six-column editorial arrangement.', renderer: 'catalog-asymmetric' },
  { type: 'catalog', variant: 'lookbook', label: 'Lookbook', purpose: 'Alternating full-width media/copy product spreads.', renderer: 'catalog-lookbook' },
  { type: 'story', variant: 'editorial-split', label: 'Historia editorial', purpose: 'Grounded narrative beside an offset photograph.', renderer: 'story-split' },
  { type: 'story', variant: 'oversized-quote', label: 'Cita monumental', purpose: 'A large brand statement set as a quote, without invented attribution.', renderer: 'story-quote' },
  { type: 'gallery', variant: 'asymmetric-collage', label: 'Collage asimétrico', purpose: 'A mixed scale contact sheet with restrained desktop rotation.', renderer: 'gallery-collage' },
  { type: 'gallery', variant: 'full-bleed', label: 'Fotografía a todo ancho', purpose: 'One immersive lifestyle photograph without cards.', renderer: 'gallery-bleed' },
  { type: 'gallery', variant: 'horizontal-strip', label: 'Tira fotográfica', purpose: 'A horizontal photo essay with touch and keyboard scrolling.', renderer: 'gallery-strip' },
  { type: 'collections', variant: 'editorial-index', label: 'Índice de categorías', purpose: 'Real category links as numbered editorial rows.', renderer: 'categories-index' },
  { type: 'collections', variant: 'large-type-links', label: 'Enlaces monumentales', purpose: 'Real categories become oversized navigation typography.', renderer: 'categories-type' },
  { type: 'collections', variant: 'image-categories', label: 'Categorías fotográficas', purpose: 'Real categories are navigated through supplied photography.', renderer: 'categories-images' },
  { type: 'footer', variant: 'giant-wordmark', label: 'Marca monumental', purpose: 'An oversized brand signature closes the page with practical navigation.', renderer: 'footer-wordmark' },
  { type: 'footer', variant: 'editorial-columns', label: 'Columnas editoriales', purpose: 'An asymmetric ruled directory and compact brand signature.', renderer: 'footer-editorial' },
];
const VERTICALS = { editorial: ['coffee', 'fashion', 'magazine', 'records'], playful: ['botanical', 'tea', 'skincare', 'gifts'], premium: ['home', 'furniture', 'fashion', 'objects'], practical: ['technology', 'hardware', 'groceries', 'large catalog'] } as const;
export const SKETCH_COMPONENT_REGISTRY = definitions.map(definition => {
  const { type, variant, renderer } = definition;
  const playful = /overlap|collage|floating/.test(variant);
  const practical = ['grid', 'dense-grid', 'list', 'columns', 'editorial-index'].includes(variant);
  const premium = /offset|article|minimal|product|bleed|immersive|oversized|alternating|feature|lookbook/.test(variant);
  const styles: ArtDirection['style'][] = playful ? ['playful', 'experimental', 'bold-commerce'] : practical ? ['minimal', 'industrial', 'bold-commerce'] : premium ? ['minimal', 'luxury', 'lifestyle', 'organic'] : ['editorial', 'retro', 'bold-commerce'];
  const needsImage = type === 'collections' && variant === 'image-categories' || type === 'story' && variant === 'editorial-split' || type === 'hero' && !['statement', 'poster', 'massive-type'].includes(variant) || type === 'gallery';
  const smallCatalog = type === 'catalog' && !['grid', 'dense-grid', 'rail', 'horizontal-rail', 'editorial-index'].includes(variant);
  const multi = /collage|floating-media/.test(variant);
  return { ...definition, id: `${type}.${variant}`, family: type,
    goodFor: { styles, verticals: playful ? VERTICALS.playful : practical ? VERTICALS.practical : premium ? VERTICALS.premium : VERTICALS.editorial },
    needs: { images: multi || type === 'gallery' && !['bleed', 'full-bleed'].includes(variant) ? 2 : needsImage ? 1 : 0,
      sceneImage: ['immersive', 'full-bleed', 'magazine-cover'].includes(variant), productImage: type === 'hero' && ['product', 'product-stage'].includes(variant),
      newsletter: type === 'newsletter', reviewContent: type === 'reviews' },
    defaultWidth: (type === 'hero' || type === 'footer' || variant === 'full-bleed' ? 'bleed' : type === 'story' && ['quote', 'oversized-quote'].includes(variant) ? 'offset-right' : type === 'story' && variant === 'article' ? 'narrow' : 'wide') as 'bleed' | 'wide' | 'narrow' | 'offset-right',
    supports: { products: type === 'catalog', fullBleed: /bleed|cover/.test(variant), overlap: /collage|overlap|floating/.test(variant) },
    worksWith: (variant === 'dense-grid' ? ['dense', 'balanced'] : practical ? ['balanced', 'dense', 'airy'] : ['airy', 'balanced']) as ArtDirection['layoutDensity'][],
    avoidWhen: [...(smallCatalog ? ['The unfiltered catalog exceeds 24 products.'] : []), ...(['immersive', 'full-bleed'].includes(variant) ? ['Only packaging/packshots are available.'] : []), ...(type === 'reviews' ? ['No actual review text was supplied.'] : []), ...(type === 'newsletter' ? ['Merchant signup is disabled.'] : [])],
    ...(smallCatalog ? { maxCatalogItems: 24 } : {}),
    mobile: /rail|strip/.test(variant) ? 'Touch and keyboard scrolling, visible controls, no clipped copy.' : 'Copy first, media below; remove overlap and rotation; keep readable controls.',
    primitive: renderer.startsWith('catalog') ? 'Catalog' : renderer === 'hero-floating' || renderer === 'hero-collage' ? 'FloatingMedia' : renderer.startsWith('hero') ? 'Hero' : renderer === 'story-chapters' ? 'StoryChapters' : renderer === 'story-manifesto' ? 'Statement' : renderer.startsWith('story') ? 'FeatureSplit' : renderer.startsWith('gallery') ? 'Gallery' : 'SectionSequence',
  };
});
export type SketchCompositionMetadata = typeof SKETCH_COMPONENT_REGISTRY[number];
export const SECTION_COMPOSITIONS = Object.fromEntries([...new Set(definitions.map(d => d.type))].map(type => [type, definitions.filter(d => d.type === type).map(d => d.variant)])) as unknown as Record<DesignSectionType, readonly string[]>;
export const sectionCompositions = (type: string): readonly string[] => SECTION_COMPOSITIONS[type as DesignSectionType] ?? [];
export const sketchComponents = (type: string) => SKETCH_COMPONENT_REGISTRY.filter(d => d.type === type);
export const sketchComponent = (type: string, variant?: string) => SKETCH_COMPONENT_REGISTRY.find(d => d.type === type && d.variant === variant);
