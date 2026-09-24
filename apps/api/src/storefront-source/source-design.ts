import { SOURCE_ICON_DIRECTION } from './source-asset-library';
import { BadGatewayException } from '@nestjs/common';
import { parse, type DefaultTreeAdapterMap } from 'parse5';
import type { SourceProjectFileDto } from './dto/save-source-project.dto';
import { SOURCE_VISUAL_ASSET_DIRECTION } from './source-visual-assets';
import { SOURCE_SCROLL_FEELS, type SourceScrollFeel } from './source-motion';

export const SOURCE_DESIGN_FILE = 'design-direction.json';
export const SOURCE_PRODUCT_PRESENTATION_DIRECTION = `The platform renders every product page and quick view inside the empty data-pagosya-product-page mount, in the editorial, dense, image-led or story-led presentation chosen by layout.productPage. Image-led uses an expansive uncropped photo beside purchasing details; story-led places the photo above a readable product story and purchasing details. Do not write CSS for [data-pagosya-product], [data-pagosya-product-page] or any .product-detail__ class; the runtime ignores those rules. The product page takes its identity from the tokens in :root (background, foreground, accent, accent-foreground, surface, border, radius, body-font, heading-font), so choose them with the product page in mind: the accent fills the purchase button and must contrast with accent-foreground, and heading-font sets the product title. Keep the header and footer of product.html consistent with the homepage. Header search and cart actions are icon-only buttons with accessible names, and the cart shows its count in a small badge. Never place a second static product configurator beside the mount, and never pad a product with fabricated reviews, certifications, benefits, shipping guarantees or nutrition claims. On local edits apply this guidance only to the requested scope.`;
const fields = ['name', 'premise', 'opening', 'flow', 'typography', 'imagery', 'mobile'] as const;
export const SOURCE_PRODUCT_PAGE_STYLES = ['editorial', 'dense', 'image-led', 'story-led'] as const;
export type SourceProductPageStyle = typeof SOURCE_PRODUCT_PAGE_STYLES[number];
export type SourceDesignLayout = { sections: string[]; catalogSection: string; standaloneIntro: boolean; productsInOpening: boolean; productPage?: SourceProductPageStyle };
export const SOURCE_STORY_ROLES = ['opening', 'proof', 'offer', 'difference', 'trust', 'action'] as const;
export const SOURCE_STORY_MEDIA = ['none', 'hero', 'product', 'editorial'] as const;
export const SOURCE_SCENE_KINDS = ['sequence', 'parallax-stack', 'text-fill', 'scrub-media'] as const;
export const SOURCE_ENTRANCE_KINDS = ['none', 'stroke', 'letter', 'curtain', 'wordmark'] as const;
export type SourceStoryPlan = {
  promise: string; eyebrow: string; headline: string; support: string; primaryAction: string;
  beats: Array<{ section: string; role: typeof SOURCE_STORY_ROLES[number]; headline: string; media: typeof SOURCE_STORY_MEDIA[number] }>;
};
export type SourceMotionChoreography = {
  mode: 'subtle' | 'expressive'; scrollFeel: SourceScrollFeel; entrance: typeof SOURCE_ENTRANCE_KINDS[number];
  scenes: Array<{ section: string; kind: typeof SOURCE_SCENE_KINDS[number]; intensity: 1 | 2 | 3 }>;
};
export type SourceDesignConcept = Record<(typeof fields)[number], string> & { layout?: SourceDesignLayout; story?: SourceStoryPlan; motion?: SourceMotionChoreography };
export type SourceDesign = { concepts: SourceDesignConcept[]; selected: number; selection?: { source: 'planner' | 'forced'; rationale: string | null } };
export const sourceDesignSchema = {
  type: 'object', additionalProperties: false, required: ['concepts', 'selected'], properties: {
    selected: { type: 'integer', minimum: 0, maximum: 2 },
    concepts: { type: 'array', minItems: 3, maxItems: 3, items: {
      type: 'object', additionalProperties: false, required: [...fields, 'layout', 'story', 'motion'],
      properties: { ...Object.fromEntries(fields.map(field => [field, { type: 'string', minLength: 1, maxLength: field === 'name' ? 80 : 500 }])),
        layout: { type: 'object', additionalProperties: false, required: ['sections', 'catalogSection', 'standaloneIntro', 'productsInOpening', 'productPage'], properties: {
          productPage: { type: 'string', enum: [...SOURCE_PRODUCT_PAGE_STYLES] },
          sections: { type: 'array', minItems: 1, maxItems: 12, items: { type: 'string', pattern: '^[a-z][a-z0-9-]{0,47}$' } },
          catalogSection: { type: 'string', pattern: '^[a-z][a-z0-9-]{0,47}$' }, standaloneIntro: { type: 'boolean' }, productsInOpening: { type: 'boolean' },
        } },
        story: { type: 'object', additionalProperties: false, required: ['promise', 'eyebrow', 'headline', 'support', 'primaryAction', 'beats'], properties: {
          promise: { type: 'string', minLength: 1, maxLength: 140 }, eyebrow: { type: 'string', minLength: 1, maxLength: 40 }, headline: { type: 'string', minLength: 1, maxLength: 100 }, support: { type: 'string', minLength: 1, maxLength: 240 }, primaryAction: { type: 'string', minLength: 1, maxLength: 60 },
          beats: { type: 'array', minItems: 1, maxItems: 12, items: { type: 'object', additionalProperties: false, required: ['section', 'role', 'headline', 'media'], properties: {
            section: { type: 'string', pattern: '^[a-z][a-z0-9-]{0,47}$' }, role: { type: 'string', enum: [...SOURCE_STORY_ROLES] }, headline: { type: 'string', minLength: 1, maxLength: 100 }, media: { type: 'string', enum: [...SOURCE_STORY_MEDIA] },
          } } },
        } },
        motion: { type: 'object', additionalProperties: false, required: ['mode', 'scrollFeel', 'entrance', 'scenes'], properties: {
          mode: { type: 'string', enum: ['subtle', 'expressive'] }, scrollFeel: { type: 'string', enum: [...SOURCE_SCROLL_FEELS] }, entrance: { type: 'string', enum: [...SOURCE_ENTRANCE_KINDS] },
          scenes: { type: 'array', maxItems: 2, items: { type: 'object', additionalProperties: false, required: ['section', 'kind', 'intensity'], properties: {
            section: { type: 'string', pattern: '^[a-z][a-z0-9-]{0,47}$' }, kind: { type: 'string', enum: [...SOURCE_SCENE_KINDS] }, intensity: { type: 'integer', minimum: 1, maximum: 3 },
          } } },
        } },
      },
    } },
  },
};

export function sourceDesignExploration(selected?: number) {
  return { selected };
}

function fitProse(text: string, max: number) {
  const cut = text.slice(0, max);
  const sentence = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('; '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  if (sentence >= max * 0.5) return cut.slice(0, sentence + 1).trim();
  const word = cut.lastIndexOf(' ');
  return (word >= max * 0.5 ? cut.slice(0, word) : cut).trim();
}

export function validateSourceDesign(value: any, selected?: number, requireLayout = false, requireNarrative = false): SourceDesign {
  const fail = (detail = '') => { throw new BadGatewayException('La propuesta necesita tres composiciones distintas y una dirección de diseño válida.' + (detail ? ' ' + detail : '')); };
  if (!value || !Number.isInteger(value.selected) || value.selected < 0 || value.selected > 2 || (selected !== undefined && value.selected !== selected)
    || !Array.isArray(value.concepts) || value.concepts.length !== 3) return fail();
  const concepts = value.concepts.map((concept: any, index: number) => {
    // Prose a little past the limit is a formatting slip, not a bad design: keep it, cut at a sentence or word.
    // Losing a paid run over a 540-character premise helps nobody. Runaway text still fails below.
    if (concept && typeof concept === 'object') concept = { ...concept, ...Object.fromEntries(fields.filter(field => field !== 'name' && typeof concept[field] === 'string' && concept[field].trim().length > 500 && concept[field].length <= 2000).map(field => [field, fitProse(concept[field].trim(), 500)])) };
    const invalidField = fields.find(field => !concept || typeof concept[field] !== 'string' || !concept[field].trim() || concept[field].length > (field === 'name' ? 80 : 500));
    if (invalidField) return fail(`concepts[${index}].${invalidField}: texto obligatorio, máximo ${invalidField === 'name' ? 80 : 500} caracteres.`);
    const result = Object.fromEntries(fields.map(field => [field, concept[field].trim()])) as SourceDesignConcept;
    const layout = concept.layout;
    if (requireLayout || layout !== undefined) {
      if (!layout || !Array.isArray(layout.sections) || !layout.sections.length || layout.sections.length > 12
        || layout.sections.some((id: unknown) => typeof id !== 'string' || !/^[a-z][a-z0-9-]{0,47}$/.test(id))
        || new Set(layout.sections).size !== layout.sections.length || !layout.sections.includes(layout.catalogSection)
        || typeof layout.standaloneIntro !== 'boolean' || typeof layout.productsInOpening !== 'boolean') return fail(`concepts[${index}].layout: 1–12 IDs únicos válidos, catalogSection incluido y ambos indicadores booleanos.`);
      // The section order is the composition the model actually planned; a contradicting flag is the slip.
      // An intro before the catalog is by definition a standalone intro, so the flag follows the order.
      const standaloneIntro = layout.standaloneIntro || layout.sections[0] !== layout.catalogSection;
      if (layout.productPage !== undefined && !SOURCE_PRODUCT_PAGE_STYLES.includes(layout.productPage)) return fail(`concepts[${index}].layout.productPage: usa editorial, dense, image-led o story-led.`);
      result.layout = { sections: [...layout.sections], catalogSection: layout.catalogSection, standaloneIntro, productsInOpening: layout.productsInOpening, ...(layout.productPage ? { productPage: layout.productPage } : {}) };
    }
    const story = concept.story;
    const choreography = concept.motion;
    if (requireNarrative || story !== undefined || choreography !== undefined) {
      if (!result.layout || !story || !choreography) return fail(`concepts[${index}]: story, motion y layout deben planearse juntos.`);
      const short = (text: unknown, max: number) => typeof text === 'string' && text.trim().length > 0 && text.trim().length <= max;
      if (!short(story.promise, 140) || !short(story.eyebrow, 40) || !short(story.headline, 100) || !short(story.support, 240) || !short(story.primaryAction, 60)
        || !Array.isArray(story.beats) || !story.beats.length || story.beats.length > 12) return fail(`concepts[${index}].story: completa promesa, apertura, acción y 1–12 beats breves.`);
      const beatSections = story.beats.map((beat: any) => beat?.section);
      const exactStory = JSON.stringify(beatSections) === JSON.stringify(result.layout.sections);
      const savedSubset = beatSections.every((section: string, beatIndex: number) => result.layout!.sections.indexOf(section) > (beatIndex ? result.layout!.sections.indexOf(beatSections[beatIndex - 1]) : -1));
      if (story.beats.some((beat: any) => !result.layout!.sections.includes(beat?.section) || !SOURCE_STORY_ROLES.includes(beat?.role) || !SOURCE_STORY_MEDIA.includes(beat?.media) || !short(beat?.headline, 100))
        || (requireNarrative ? !exactStory : !savedSubset)) return fail(`concepts[${index}].story.beats: usa cada section en el orden del layout con roles, titulares y medios válidos.`);
      const offer = story.beats.find((beat: any) => beat.section === result.layout!.catalogSection);
      if (!offer || !['offer', 'proof'].includes(offer.role)) return fail(`concepts[${index}].story: catalogSection debe demostrar o presentar la oferta.`);
      const scenes = choreography.scenes;
      if (!['subtle', 'expressive'].includes(choreography.mode) || !SOURCE_SCROLL_FEELS.includes(choreography.scrollFeel) || !SOURCE_ENTRANCE_KINDS.includes(choreography.entrance)
        || !Array.isArray(scenes) || scenes.length > 2 || scenes.some((scene: any) => !result.layout!.sections.includes(scene?.section) || !SOURCE_SCENE_KINDS.includes(scene?.kind) || ![1, 2, 3].includes(scene?.intensity))
        || new Set(scenes.map((scene: any) => scene.section)).size !== scenes.length) return fail(`concepts[${index}].motion: usa entrada válida y hasta dos escenas en sections distintas.`);
      result.story = { promise: story.promise.trim(), eyebrow: story.eyebrow.trim(), headline: story.headline.trim(), support: story.support.trim(), primaryAction: story.primaryAction.trim(), beats: story.beats.map((beat: any) => ({ section: beat.section, role: beat.role, headline: beat.headline.trim(), media: beat.media })) };
      result.motion = { mode: choreography.mode, scrollFeel: choreography.scrollFeel, entrance: choreography.entrance, scenes: scenes.map((scene: any) => ({ section: scene.section, kind: scene.kind, intensity: scene.intensity })) };
    }
    return result;
  });
  const normalize = (text: string) => text.toLowerCase().replace(/\s+/g, ' ').trim();
  // Catch copied proposals without pretending a string comparison measures visual originality.
  if (new Set(concepts.map((c: SourceDesignConcept) => normalize(c.opening))).size !== 3
    || new Set(concepts.map((c: SourceDesignConcept) => normalize(c.flow))).size !== 3) return fail('Los tres opening y los tres flow deben ser distintos.');
  // Fresh YAPI designs default to a clear brand reveal and two purposeful page beats.
  // Explicit Studio motion settings still turn this choreography down or off at runtime.
  if (requireNarrative) {
    const chosen = concepts[value.selected];
    const layout = chosen.layout!;
    const motion = chosen.motion!;
    const targetScenes = Math.min(2, layout.sections.length);
    const scenes: SourceMotionChoreography['scenes'] = (motion.scenes as SourceMotionChoreography['scenes'])
      .slice(0, targetScenes).map(scene => ({ ...scene, intensity: Math.max(2, scene.intensity) as 2 | 3 }));
    const usedSections = new Set(scenes.map(scene => scene.section));
    const usedKinds = new Set(scenes.map(scene => scene.kind));
    for (const section of layout.sections) {
      if (scenes.length >= targetScenes) break;
      if (usedSections.has(section)) continue;
      const kind = !usedKinds.has('sequence') ? 'sequence' : 'text-fill';
      scenes.push({ section, kind, intensity: 2 });
      usedSections.add(section);
      usedKinds.add(kind);
    }
    chosen.motion = { ...motion, mode: 'expressive', scrollFeel: motion.scrollFeel === 'native' ? 'soft' : motion.scrollFeel, entrance: 'wordmark', scenes };
  }
  const metadata = value.selection;
  const selection = metadata && ['planner', 'forced'].includes(metadata.source)
    ? { source: metadata.source as 'planner' | 'forced', rationale: typeof metadata.rationale === 'string' && metadata.rationale.trim().length <= 400 ? metadata.rationale.trim() || null : null } : undefined;
  return { concepts, selected: value.selected, ...(selection ? { selection } : {}) };
}

type HtmlNode = DefaultTreeAdapterMap['node'];
type HtmlElement = DefaultTreeAdapterMap['element'];
const isHtmlElement = (node: HtmlNode): node is HtmlElement => 'tagName' in node;
const htmlDescendants = (node: HtmlNode): HtmlElement[] => 'childNodes' in node ? node.childNodes.flatMap(child => isHtmlElement(child) && ['template', 'script', 'style'].includes(child.tagName) ? [] : [...(isHtmlElement(child) ? [child] : []), ...htmlDescendants(child)]) : [];
const homeMain = (html: string) => htmlDescendants(parse(html)).find(node => node.tagName === 'main');
const mainBlocks = (main: HtmlElement) => main.childNodes.filter(isHtmlElement).filter(node => {
  const classes = node.attrs.find(attribute => ['class', 'classname'].includes(attribute.name))?.value.split(/\s+/) || [];
  const trustedEntrance = classes.includes('ui-entrance') && node.attrs.some(attribute => attribute.name === 'aria-hidden' && attribute.value === 'true');
  return !trustedEntrance && !['script', 'template', 'style'].includes(node.tagName)
    && !node.attrs.some(attribute => /^data-pagosya-(contact|comeback|subscribe|status|cart)$/.test(attribute.name));
});

/** Blocks added after the complete planned sequence (e.g. merchant-requested tabs) extend the layout; the planned opening never changes. */
export function adoptTrailingDesignSections(design: SourceDesign, homeHtml: string): SourceDesign {
  const layout = design.concepts[design.selected]?.layout;
  const main = layout && homeMain(homeHtml);
  if (!layout || !main) return design;
  const ids = mainBlocks(main).map(node => node.attrs.find(a => a.name === 'id')?.value);
  const extras = ids.slice(layout.sections.length);
  if (!extras.length || ids.length > 12 || JSON.stringify(ids.slice(0, layout.sections.length)) !== JSON.stringify(layout.sections)
    || extras.some(id => !id || !/^[a-z][a-z0-9-]{0,47}$/.test(id)) || new Set(ids).size !== ids.length) return design;
  const copy = structuredClone(design);
  copy.concepts[copy.selected].layout!.sections = ids as string[];
  return copy;
}

/** Parse HTML without executing generated code. Rendering/viewport claims are checked in Studio. */
export function validateSourceDesignImplementation(design: SourceDesign, files: SourceProjectFileDto[], purpose: 'shop' | 'service' | 'portfolio' | 'editorial' = 'shop'): void {
  const layout = design.concepts[design.selected].layout;
  if (!layout) return; // Older revisions remain readable and editable.
  const attr = (node: HtmlElement, name: string) => node.attrs.find(a => a.name === name)?.value;
  const main = homeMain(files.find(f => f.path === 'index.html')?.content || '');
  const fail = (message: string): never => { throw new BadGatewayException(`El diseño elegido no coincide con index.html: ${message}`); };
  if (!main) return fail('falta main con los bloques de layout.sections.');
  const sections = mainBlocks(main);
  const ids = sections.map(node => attr(node, 'id'));
  if (!ids.length) return fail(`main no contiene bloques literales; se esperaban ${layout.sections.join(' → ')}. Renderiza cada sección planificada como hijo directo de main, sin condiciones, .map() ni {expresiones}; para pestañas, mantenlas montadas y alterna hidden o className.`);
  if (JSON.stringify(ids) !== JSON.stringify(layout.sections)) return fail(`los bloques directos de main deben seguir ${layout.sections.join(' → ')}; encontrados ${ids.map(id => id || '(sin id)').join(' → ')}. No añadas una portada fuera del plan.`);
  if (purpose !== 'shop') return;
  const catalogs = htmlDescendants(main).filter(node => attr(node, 'data-pagosya-catalog') !== undefined);
  const catalogSection = sections.find(node => attr(node, 'id') === layout.catalogSection)!;
  if (catalogs.length !== 1 || !(catalogs[0] === catalogSection || htmlDescendants(catalogSection).includes(catalogs[0]))) return fail(`sitúa el único catálogo real dentro de #${layout.catalogSection}.`);
}

export function savedSourceDesign(files: SourceProjectFileDto[] = []): SourceDesign | null {
  try { return validateSourceDesign(JSON.parse(files.find(f => f.path === SOURCE_DESIGN_FILE && f.encoding !== 'base64')?.content || '')); }
  catch { return null; }
}

/** Shared quality contract for visual systems that must survive every generated page. */
export const SOURCE_VISUAL_COHERENCE_CONTRACT = `Visual coherence is a first-class acceptance criterion, not a finishing suggestion. Before writing the storefront, choose a visual language for this merchant's brief and supplied references. Carry its identity through the homepage, product page, cart, checkout and mobile while allowing deliberate variation between sections.
Choose iconography, atmosphere, motion, header and footer treatments for this specific project. Historical preset names never impose a recipe or override current instructions. Preserve semantic action meaning (cart stays cart, search stays search, close stays close) while choosing the treatment, optical weight and recurring motifs. Use the bundled local Lucide icons from assets/icons/NAME.svg for action controls; decorative artwork has a separate role from navigation and purchasing controls.
Define shared CSS tokens for spacing, type, icon size, border/radius, background motif and motion. Use normal flow for readable content; deliberate overlaps, absolute-positioned artwork, transforms and layered compositions are allowed. Keep decorative layers from obscuring text or controls and resolve their responsive bounds. Display headings must keep letter-spacing at -0.04em or more open, preserve clear word spaces and wrap naturally when the real merchant name is long. Never use white-space:nowrap on a prominent h1/h2 unless the wordmark has been verified to fit at 320px, 390px, 768px and 1280px. Title, image and action may share a layered composition when their contrast, hierarchy and mobile behavior remain clear.
Before returning source, check the real copy and responsive rules for 1280×844, 768×844, 390×844 and 320×844. Repair clipped or illegible text and controls without discarding the project's distinguishing composition. Do not claim browser verification unless a browser result was supplied.`;

const headingSelector = /(?:^|[\s,>+~])h[1-3](?:$|[\s.#:[,])|(?:wordmark|display|headline|hero-title|page-title|section-title)/i;
const tightTracking = /letter-spacing\s*:\s*(-?(?:0|\.)?\d+(?:\.\d+)?)\s*em\b/gi;
const tightTrackingClass = /tracking-\[\s*['"]?(-?(?:0|\.)?\d+(?:\.\d+)?)em['"]?\s*\]/gi;

/** A heading tracked a hair too tight is a one-number fix, not a reason to discard a whole paid store. Ease it to
 * the floor that validateSourcePresentation enforces; only changed files are touched, so edits stay byte-stable. */
export function relaxSourceTracking(files: SourceProjectFileDto[], baseline: SourceProjectFileDto[] = []): SourceProjectFileDto[] {
  const floor = (value: string) => Number(value) < -0.04 ? '-0.04' : value;
  return files.map(file => {
    if (!/\.(css|html|tsx|jsx)$/.test(file.path) || file.encoding === 'base64' || baseline.find(candidate => candidate.path === file.path)?.content === file.content) return file;
    let content = file.content;
    if (file.path.endsWith('.css')) content = content.replace(/([^{}]+)\{([^{}]*)\}/g, (rule, selector: string, body: string) => headingSelector.test(selector)
      ? `${selector}{${body.replace(tightTracking, (match, value: string) => match.replace(value, floor(value)))}}` : rule);
    content = content.replace(tightTrackingClass, (match, value: string) => match.replace(value, floor(value)));
    return content === file.content ? file : { ...file, content };
  });
}

/** Rejects the class of heading bug that visual review already caught in production. */
export function validateSourcePresentation(files: SourceProjectFileDto[], baseline: SourceProjectFileDto[] = []): void {
  const bad: string[] = [];
  for (const file of files) {
    if (!/\.(css|html|tsx|jsx)$/.test(file.path) || file.encoding === 'base64') continue;
    const previous = baseline.find(candidate => candidate.path === file.path);
    if (previous?.content === file.content) continue;
    const source = file.content;
    if (file.path.endsWith('.css')) {
      for (const match of source.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        if (!headingSelector.test(match[1])) continue;
        for (const tracking of match[2].matchAll(tightTracking)) if (Number(tracking[1]) < -0.04) bad.push(`${file.path} (${tracking[1]}em)`);
      }
    }
    for (const tracking of source.matchAll(tightTrackingClass)) if (Number(tracking[1]) < -0.04) bad.push(`${file.path} (tracking ${tracking[1]}em)`);
  }
  if (bad.length) throw new BadGatewayException(`El título comprime demasiado el espaciado tipográfico: ${bad.slice(0, 4).join(', ')}. Usa -0.04em o más abierto y deja que el texto envuelva de forma natural.`);
}

/** Numeric quality bar from docs/STOREFRONT_DESIGN_LEVEL_UP.md §3-§4. The prompt text below is
 * generated from these values so a later wording edit cannot silently move a band or a budget.
 * They constrain ratios, counts and consistency only; never a palette, family or composition. */
export const SOURCE_DISPLAY_BODY_RATIO = { min: 2.6, max: 3.2 } as const;
export const SOURCE_INK_LADDER = [100, 85, 70, 55, 40] as const;
export const SOURCE_TYPE_ROLES = ['display', 'subhead', 'body', 'label', 'numeric'] as const;
export const SOURCE_SPACING_SCALE = [4, 8, 12, 20, 32, 48, 72, 112] as const;
export const SOURCE_SPACING_SCALE_FACTOR = { min: 0.85, max: 1.25 } as const;
/** Largest vertical gap on a page divided by the smallest. A page where every gap is 14-22px fails. */
export const SOURCE_GAP_CONTRAST_MIN = 6;
export const SOURCE_BODY_MEASURE_CH = { min: 46, max: 62 } as const;
/** Exactly one accent, and only these slots may carry it. */
export const SOURCE_ACCENT_SLOTS = ['announcement bar fill', 'rating marks', 'eyebrow text', 'selected-state ring or fill', 'primary action fill'] as const;
export const SOURCE_HAIRLINES_PER_SCREEN_MAX = 3;
export const SOURCE_HAIRLINE_INK_PERCENT = 14;
export const SOURCE_MEDIA_TO_CONTROL_RADIUS = { min: 1.2, max: 2.0 } as const;
export const SOURCE_NUMERIC_PRICE_RATIO = { editorial: '1.0-1.3x', dense: '1.8-2.2x' } as const;

/** §3. Five named roles, a constrained display:body band and one ink at a fixed opacity ladder. */
export const SOURCE_TYPE_ROLE_DIRECTION = `Type system. Start with five useful roles (${SOURCE_TYPE_ROLES.join(', ')}) and one or two families. These are coordinated defaults, not restrictions on the merchant's visual direction. Use fewer roles when content is sparse; a distinctive display treatment may add an intentional role.
- display: default titles at ${SOURCE_DISPLAY_BODY_RATIO.min}-${SOURCE_DISPLAY_BODY_RATIO.max}x body, weight 350-500 for a restrained editorial composition. An expressive or poster concept may use substantially larger type and weight 600-800 when the actual font supports it; specify responsive clamp, line breaks and a mobile size that fits at 320px. Keep line-height appropriate to the typeface and letter-spacing never below -0.04em.
- subhead: optional supporting line, normal or italic according to the brand, same family or the serif partner, around 1.05-1.25x body. Omit it when it repeats the heading.
- body: start around 16px desktop and mobile, line-height 1.5-1.8 suited to the language and measure, max-width ${SOURCE_BODY_MEASURE_CH.min}-${SOURCE_BODY_MEASURE_CH.max}ch for prose. Short interface labels and large editorial introductions can use a different measured width.
- label: eyebrows, option legends, breadcrumbs and announcements at 10.5-12px, uppercase, letter-spacing 0.10-0.20em, weight 500-600.
- numeric: prices, counters, quantities and spec values with font-variant-numeric:tabular-nums; price ${SOURCE_NUMERIC_PRICE_RATIO.editorial} body in editorial concepts and ${SOURCE_NUMERIC_PRICE_RATIO.dense} in dense ones.
Check scale against the actual heading and longest product name. The default display:body band is not a maximum: a short theatrical headline can be larger, while product names and controls must wrap cleanly. Never clip text or hide overflow to simulate fit.
Create hierarchy with size, measure, colour and weight as the concept requires. Start with at most two weights per family; bold lettering is appropriate for expressive brands. Italic is optional, never a universal signature. Use supported font styles instead of forcing a faux italic.
Give longer paragraphs an intentional reading measure. For a photo-free opening, let purposeful typography or useful content occupy its space: a short 48px heading floating in an otherwise empty 100vh panel is not a cinematic composition. Use content-sized spacing for compact menus unless the merchant explicitly asks for a full-height poster; a poster needs hierarchy and real visual content.
A restrained default uses one ink at an opacity ladder of ${SOURCE_INK_LADDER.map(rung => rung + '%').join(' / ')}, each rung written color-mix(in srgb, var(--store-foreground) N%, var(--store-background)). Keep muted text readable; confirmed brand colours and distinct semantic states may need their own accessible colour tokens.`;

/** §4. One spacing scale, a measurable gap contrast, one accent with a fixed slot budget, one hairline. */
export const SOURCE_RHYTHM_DIRECTION = `Rhythm and measure. Define one spacing scale of ${SOURCE_SPACING_SCALE.length} steps, ${SOURCE_SPACING_SCALE.join(' / ')}, optionally multiplied as a whole by one factor between ${SOURCE_SPACING_SCALE_FACTOR.min} and ${SOURCE_SPACING_SCALE_FACTOR.max}. Use it for a coherent starting rhythm; optical corrections, responsive layouts and deliberate composition can use other values.
Compress inside a semantic group (title and subhead, price and qualifier, legend and values) with steps 1-3, separate groups with steps 5-7, separate page sections with steps 7-8. A varied scale can make the largest vertical gap at least ${SOURCE_GAP_CONTRAST_MIN}x the smallest; choose spacing from actual content, not a required empty-space quota.
Give display titles an intentional max-width and line-break plan, with text-wrap:balance when useful. Two desktop lines and three mobile lines are a good starting point, not a ban on a deliberate poster. At 320px all words and controls must remain visible and usable.
Accent defaults: a restrained composition can use one accent in ${SOURCE_ACCENT_SLOTS.join('; ')}. Expressive brands may use large colour fields, alternating section colours or a coordinated secondary accent when the brief/concept warrants them. Keep a clear primary action and sufficient foreground/background contrast; do not force every merchant into pale paper with small accent buttons.
When --brand-accent is not confirmed, sample the accent from a colour physically present in this merchant's own product photography or its setting, and name the image evidence when available. If no suitable images exist, select a palette from the brief and explain the choice without pretending it was sampled. Explicit merchant colours take priority.
visualAssets[].photo is measured, not suggested: shot (packshot or scene), productKey (photographs of one product share it), dominant (colours read off the pixels, most-covering first), backdropHex and aspect. Take that accent from a photo's dominant list. When the merchant supplied the photographs, set --store-surface to their shared backdropHex or a near neighbour so the goods sit on their own ground. When one productKey has both a scene and a packshot, an image-led story usually leads with the scene; contained packshots remain useful in comparison catalogs and detail views. Choose the photograph for its role, and preserve an explicitly requested crop or photo.
Use one hairline per store, 1px solid color-mix(in srgb, var(--store-foreground) ${SOURCE_HAIRLINE_INK_PERCENT}%, var(--store-background)), ending at the content measure rather than the container edge unless it is a full-bleed divider, at most ${SOURCE_HAIRLINES_PER_SCREEN_MAX} per screenful.
Declare two radii, controls and media, with media ${SOURCE_MEDIA_TO_CONTROL_RADIUS.min}-${SOURCE_MEDIA_TO_CONTROL_RADIUS.max}x controls. Zero for both is valid and often better.`;

/** §6 generator half and §8.2. One card contract per store; a masthead that reads as a shop. */
export const SOURCE_CARD_AND_MASTHEAD_DIRECTION = `Card contract. Declare one catalog card contract and make every card obey it: one image aspect ratio, one order of name / price / action, one action treatment, one image treatment, with the shared ratio set once on the catalog element. A featured card may differ, but deliberately and completely, with a different span and a different composition; never by one card placing its action on another row or stretching to leave a void mid-tile.
Masthead. The header carries the wordmark plus one second line at the label role, four to six navigation entries where the catalog supports them, and a right-hand cluster of icon-only controls with accessible names and a cart count badge. The second line uses confirmed merchant data only, such as the real city, founding year, materials or method. Never invent a tagline, city, year, material or claim to fill the lockup; omit the line when that data is not confirmed.`;

export const SOURCE_CREATIVE_DIRECTION = `You are the creative director and frontend designer of this merchant's storefront. Make a specific, memorable visual identity and carry it through every customer page. Work from the merchant's products, people, place, materials, cultural references and buying behavior. Choose a composition that would feel wrong with an unrelated business's name pasted into it.
There is NO mandatory hero format, homepage section list, section count, section order, spacing scale, color family, card shape, symmetry, font pairing or illustration style. A catalog can open the page; a product, image, wordmark, story or interaction can be the focal point. Choose what this business earns. Omit unsupported sections and redundant purchasing instructions instead of filling a long page. A merchant's precise design request takes priority over novelty. On a fresh design or authorized redesign, vary density, alignment, scale and image treatment deliberately; do not repeat one heading/text/card treatment down the page.
Choose the homepage structure and action hierarchy for the business and the merchant’s request. Storytelling, catalogs, galleries and interactive scenes may share the page or have their own destinations. Keep the buying path discoverable and navigation understandable; there is no required CTA count or section-to-page split.
Compose WITH the actual assets: name the image paths, roles, crops and focal points; preserve the real product's appearance and logo. Reference screenshots guide composition; photos explicitly supplied as content remain content across later edits, even if they contain other brands. If photos are absent, choose a confident typographic, interactive or menu-based concept. Custom SVG/CSS drawings, mascots and sticker-library artwork require an explicit current request for illustration; do not introduce them merely to fill space or replace existing photos. Do not fabricate photographs or leave empty photo placeholders. Typography may mix appropriate local/system families and uploaded fonts; define a complete hierarchy and mobile scale. Gradients, textures, image backgrounds and expressive layout are available when they serve this concept and the merchant's brief.
${SOURCE_TYPE_ROLE_DIRECTION}
${SOURCE_RHYTHM_DIRECTION}
${SOURCE_VISUAL_ASSET_DIRECTION}
${SOURCE_ICON_DIRECTION}
Build the mobile concept with equal care: retain its distinguishing imagery/composition, visible navigation and buying action. Content may reflow substantially rather than simply shrinking the desktop. Use natural customer-facing copy about products and shopping. Do not describe runtime hooks, generated capability, API tokens, schemas or “real options” in storefront copy. Every authored link or control must work. Keep real content visible without animation. Use reduced-motion alternatives and keyboard-accessible controls.
Before returning files, review the implementation against the selected concept: actual catalog selectors exist, imagery is used with its intended role, sections contain meaningful content, mobile retains the identity, and product/checkout share the visual language. Resolve mismatches in the code. Do not claim browser verification: Studio separately inspects the rendered result.`;

export const SOURCE_STORY_MOTION_CONTRACT = `For each concept, commit to story and motion objects before writing code. story turns the page into one coherent argument: a short promise; an opening eyebrow of roughly 2–5 words, headline of roughly 3–9 words, one or two supporting sentences and one primary action; then one beat for every layout section in the same order. Each beat states its role, truthful headline and media role. The catalog/principal-content beat must prove or present the offer. Do not repeat the opening headline in later beats or invent claims. motion names the saved choreography: subtle or expressive, native/soft/cinematic scroll feel, one clear branded entrance and up to two section scenes. The selected concept should feel bold: reveal the actual merchant wordmark before the page, then use two different purposeful scene types across different story sections when the layout has at least two sections. A conventional text column beside one static image is not a signature opening; compose scale, cropping, layers and motion into a recognizable first scene. Use scrub-media only with an approved local poster/video and always keep a static mobile/reduced-motion reading order. Use parallax-stack only for approved imagery. Keep motion off commerce controls, forms and long body copy.`;

/** Layout-only control arm for matched benchmarks. Production generation uses SOURCE_DESIGN_CONTRACT. */
export const SOURCE_LAYOUT_CONTRACT = `For each concept, commit to the layout object before writing code. layout.productPage chooses the platform product page style: "dense" for products bought on specifications (electronics, tools, appliances, vehicles, technical gear), "editorial" for a balanced photo/details composition, "image-led" for strong product photography with a compact purchase column, or "story-led" for a large photo followed by a readable product narrative and purchasing details. Keep real purchasing controls and product photos; never fabricate story claims. layout.sections lists the invented IDs of the direct content blocks inside main, in exact order (1–12 blocks, no required count). layout.catalogSection is the ID of the block containing the real data-pagosya-catalog. Optional runtime contact/comeback/subscribe slots may sit outside these content blocks. Every other direct content element in main must be one of the listed blocks. When the merchant asks for tabs, separate views or distinct sections, list every tab panel or view as its own block in layout.sections, in navigation order; the implementation keeps them all mounted and toggles visibility. When standaloneIntro=false, layout.sections[0] MUST equal layout.catalogSection. Put the masthead/header outside main. The catalog block is first and must not contain a disguised full-screen introduction: compact brand/context and immediately purchasable products lead. For this catalog-first choice, the actual catalog must begin within the first 320 CSS pixels of the document at both desktop and mobile; use a compact masthead or place intro beside products, not a large nested headline above them. productsInOpening means a real product name, price AND add action are visible without scrolling at BOTH 1280x844 and 390x844. This is a checked promise, not prose. Set the booleans honestly to match the concept. A photo/wordmark-led concept may have a standalone intro; a menu-led concept need not. The three concepts must differ in at least two meaningful structural choices (opening, product presentation, density, alignment, typography hierarchy, story sequence); explain those contrasts in their premises. Use the merchant's precise choices first. Do not produce three editorial-serif headline/catalog/footer variations. Give each concept its own visual grammar; type-led, image-led, densely useful and spacious compositions are all available. Keep a clearly labelled Mi pedido button and count visible in the mobile header outside collapsed navigation. Do not hide purchasing controls in a menu. Match product and checkout surfaces to the selected typography, geometry and spacing; empty photo galleries and empty status boxes must take no space. Use semantic product headings and aria-hidden on decorative marks. Do not insert the same emoji or fake sequential number into every product. Leave absent product imagery out; brand illustration belongs to the composition, not a pretend product thumbnail. For optional product images use a data-product-media wrapper; the runtime hides it when no image exists and marks the product data-no-image. Collapse any reserved media column for [data-no-image], rather than leaving blank tiles. For every product composition, place the actual name, price and add action as a coherent group. When a featured product uses multiple grid rows, explicitly place media, copy and purchase areas; do not let auto-placement put the price under the image in a different column from its name. Use minmax(0,1fr), min-width:0 and wrapping purchase actions where necessary. At 320px, every purchase control must fit its container with a comfortable 44px hit area. Never hide overflow to conceal a clipped purchase action. Mark separate product artwork with data-product-decoration and aria-hidden=true. Size CSS/SVG drawings against the available column width, including pseudo-elements; transform:scale alone does not remove intrinsic grid sizing. Keep decorative artwork in its own layout space; on mobile it must not overlap headings, copy or controls. Keep display letter-spacing at or above -0.04em and preserve open counters and clear word spaces.
${SOURCE_CARD_AND_MASTHEAD_DIRECTION}
Action hierarchy must make sense for the selected concept and merchant brief. Navigation uses real anchors and state changes use buttons. Keep purchasing accessible through the experience; do not invent destinations or use inactive controls.`;

export const SOURCE_DESIGN_CONTRACT = `${SOURCE_STORY_MOTION_CONTRACT}\n${SOURCE_LAYOUT_CONTRACT}`;
