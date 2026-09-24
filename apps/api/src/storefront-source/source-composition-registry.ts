import { createHash } from 'node:crypto';

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
  directions: readonly Direction[];
};

export const SOURCE_COMPOSITION_FAMILIES: readonly SourceCompositionFamily[] = [
  {
    id: 'cafe-expressive', purpose: 'A memorable food or drink identity with a fast path to the real menu.',
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
    id: 'beauty-editorial', purpose: 'Editorial beauty, skincare or fragrance presentation with clear product choices.',
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
    id: 'product-cinematic', purpose: 'Image-led furniture, objects, clothing or considered product stories.',
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
    id: 'catalog-practical', purpose: 'Photo-light or broad catalogs where finding and buying products is the main task.',
    terms: ['catalogo', 'catalog', 'ferreteria', 'hardware', 'abarrotes', 'grocery', 'repuestos', 'wholesale', 'mayorista'],
    directions: [
      { direction: 'Clear catalog', minImages: 0, scene: 'directory', header: 'classic', hero: 'typographic', catalog: 'grid', card: 'minimal', fx: 'none', signature: 'A bespoke compact category index grounded in the real catalog.', footer: 'paper', radius: '4-8', rhythm: 'dense (space 0.92)', typography: 'Instrument Sans with strong heading weight contrast', mobile: 'Keep category controls and purchase buttons reachable without horizontal page overflow.', assetPlan: 'Does not depend on photography; use existing product images only.', sections: ['opening', 'catalog'] },
      { direction: 'Editorial directory', minImages: 0, scene: 'directory', header: 'split', hero: 'typographic', catalog: 'editorial', card: 'caption', fx: 'none', signature: 'A numbered category directory with generous dividing rules and concise factual descriptions.', footer: 'ink', radius: '0', rhythm: 'balanced (space 1)', typography: 'Oswald display / Instrument Sans text', mobile: 'Directory and product rows become single-column; long names wrap.', assetPlan: 'Typography carries the identity when no approved photography exists.', sections: ['directory', 'catalog'] },
      { direction: 'Featured selection', minImages: 1, scene: 'feature-split', header: 'centered', hero: 'split', catalog: 'grid', card: 'framed', fx: 'none', signature: 'One approved feature photograph with a compact live catalog immediately below.', footer: 'paper', radius: '4-8', rhythm: 'balanced (space 1)', typography: 'Bricolage display / Instrument Sans text', mobile: 'Small contained opening image; never make a large catalog horizontally scroll only.', assetPlan: 'One approved image, no invented bestseller or promotion claims.', sections: ['opening', 'catalog'] },
      { direction: 'Shelf sequence', minImages: 3, scene: 'chapters', header: 'classic', hero: 'split', catalog: 'rail', card: 'classic', fx: 'reveal lift', signature: 'StoryChapters walking the real aisles or ranges, each with one approved photograph and factual copy.', footer: 'ink', radius: '4-8', rhythm: 'balanced (space 1)', typography: 'Instrument Sans with contrasting display scale', mobile: 'Chapters read in order without pinning; the rail stays swipeable with prices visible.', assetPlan: 'Three approved photographs of real ranges; never stage a category that does not exist.', sections: ['opening', 'collection', 'ranges'] },
    ],
  },
];

export type SourceCompositionInput = {
  seed?: string; brief?: unknown; instruction?: string; catalogItemCount?: number;
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
  const ranked = SOURCE_COMPOSITION_FAMILIES.map(family => ({ family,
    score: family.terms.reduce((sum, term) => sum + (new RegExp(`(?:^|[^a-z])${term}(?:$|[^a-z])`).test(text) ? 10 : 0), 0)
      + (family.id === 'catalog-practical' ? 1 + ((input.catalogItemCount ?? 0) > 24 ? 12 : 0) : 0),
  })).sort((a, b) => b.score - a.score);
  const primary = ranked[0].family;
  const candidates = ranked.flatMap(({ family }, rank) => family.directions
    .filter(direction => direction.minImages <= imageCount)
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

export const SOURCE_COMPOSITION_PLANNING = 'Composition candidates are independent starting directions with asset requirements and mobile plans, not a mandatory template. Develop each concept from a different candidate or an explicitly explained custom composition. Merchant instructions, confirmed typography/colors and actual image roles override every candidate. Never force the suggested fonts, sections or effect when they conflict. Borrow visual structure from an owned reference, never its fictional copy, prices or product facts. Keep catalog and purchase controls complete for large catalogs; omit unsupported story sections. A concept may depart from all families when the brief warrants it. Keep all unrelated composition and tokens on later local edits.';

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
    opening: '<ScrollScrubHero poster={approvedHero} eyebrow={merchantEyebrow} title={merchantHeading} lead={merchantIntro} actions={<Button href="#collection">Ver productos</Button>}/>' },
  showcase: { feel: 'cinematic', imports: ['ProductShowcase'],
    story: '<ProductShowcase image={approvedHero} eyebrow={merchantEyebrow} title={actualProductName} body={actualProductFacts} action={<Button href="#collection">Ver la colección</Button>}/>' },
  'parallax-stack': { feel: 'cinematic', imports: ['ParallaxStack'],
    story: '<ParallaxStack images={approvedImages}/>' },
  chapters: { feel: 'soft', imports: ['StoryChapters'],
    story: '<StoryChapters chapters={[{eyebrow:evidencedStep,title:evidencedStepTitle,body:evidencedStepCopy,image:approvedStepImage}]}/>' },
  gallery: { feel: 'soft', imports: ['Gallery'],
    story: '<Gallery images={approvedImages} variant="mosaic"/>' },
  'text-fill': { feel: 'native', imports: ['TextFillStatement'],
    story: '<TextFillStatement>{merchantStatement}</TextFillStatement>' },
  directory: { feel: 'native', imports: ['SectionSequence', 'SectionHead'],
    story: '<SectionSequence><SectionHead eyebrow={realCategoryLabel} title={realCategoryTitle}/><Text>{evidencedCategoryCopy}</Text></SectionSequence>' },
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
