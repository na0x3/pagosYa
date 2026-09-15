import { SOURCE_ICON_DIRECTION } from './source-asset-library';
import { BadGatewayException } from '@nestjs/common';
import { parse, type DefaultTreeAdapterMap } from 'parse5';
import type { SourceProjectFileDto } from './dto/save-source-project.dto';
import { SOURCE_VISUAL_ASSET_DIRECTION } from './source-visual-assets';

export const SOURCE_DESIGN_FILE = 'design-direction.json';
export const SOURCE_PRODUCT_PRESENTATION_DIRECTION = `Treat each product page as a complete shopping experience. Compose a photographic gallery beside a carefully proportioned purchase area: category, title, concise factual description, price, actual choices, quantity, selected configuration and total, then a clear purchase action. Give color a clear role through product imagery, selected states and purposeful accents. Derive spacing, typography and surface treatments from one project-specific system. Avoid a different filled box for every piece of content; group related information with alignment and spacing. Do not equate premium with monochrome, emptiness, oversized type or more decoration. On mobile stack the image and purchase panel in a readable order.
Adapt the presentation to the product's real catalog data. Color options use labeled swatches; sizes and capacities use compact choice buttons; flavors, materials and packs use clearly labeled choices. Keep selected, unavailable and keyboard-focus states distinguishable without color alone. Do not invent options to fill space or hardcode choices disconnected from variant IDs, prices or stock. Use the platform's product, option, quantity and cart hooks so a selected configuration survives into the cart and checkout.
Use the bundled local icons consistently for actions and short evidenced product details. Every icon-only action needs an accessible name. Give supporting content visual rhythm with appropriate facts, product imagery or supplied video; never pad a product with fabricated reviews, certifications, benefits, shipping guarantees or nutrition claims. Video must have usable playback controls and a descriptive label. Match the richness of supplied references through composition and real choices, never by embedding the reference screenshot or cloning its products.
Style the runtime as carefully as the homepage using its exact hooks: [data-pagosya-product] .product-detail__layout, .product-detail__gallery, .product-detail__photo, .product-detail__copy, .product-detail__pricing, .product-detail__options fieldset/legend, .product-detail__values, [data-product-option][aria-pressed=true], .product-detail__swatch, .product-detail__purchase, .product-detail__quantity, .product-detail__subtotal and .product-detail__buy. Do not guess nonexistent classes such as .product-detail__option. Keep choices and the purchase action reasonably close to the title by balancing image height and panel spacing. Preserve the empty data-pagosya-product-page mount and let the runtime render the selected product; never place a second static product configurator beside it. On local edits apply this guidance only to the requested scope.`;
const fields = ['name', 'premise', 'opening', 'flow', 'typography', 'imagery', 'mobile'] as const;
export type SourceDesignLayout = { sections: string[]; catalogSection: string; standaloneIntro: boolean; productsInOpening: boolean };
export type SourceDesignConcept = Record<(typeof fields)[number], string> & { layout?: SourceDesignLayout };
export type SourceDesign = { concepts: SourceDesignConcept[]; selected: number; selection?: { source: 'planner' | 'forced'; rationale: string | null } };
export const sourceDesignSchema = {
  type: 'object', additionalProperties: false, required: ['concepts', 'selected'], properties: {
    selected: { type: 'integer', minimum: 0, maximum: 2 },
    concepts: { type: 'array', minItems: 3, maxItems: 3, items: {
      type: 'object', additionalProperties: false, required: [...fields, 'layout'],
      properties: { ...Object.fromEntries(fields.map(field => [field, { type: 'string', minLength: 1, maxLength: field === 'name' ? 80 : 500 }])),
        layout: { type: 'object', additionalProperties: false, required: ['sections', 'catalogSection', 'standaloneIntro', 'productsInOpening'], properties: {
          sections: { type: 'array', minItems: 1, maxItems: 12, items: { type: 'string', pattern: '^[a-z][a-z0-9-]{0,47}$' } },
          catalogSection: { type: 'string', pattern: '^[a-z][a-z0-9-]{0,47}$' }, standaloneIntro: { type: 'boolean' }, productsInOpening: { type: 'boolean' },
        } },
      },
    } },
  },
};

export function sourceDesignExploration(selected?: number) {
  return { selected };
}

export function validateSourceDesign(value: any, selected?: number, requireLayout = false): SourceDesign {
  const fail = (detail = '') => { throw new BadGatewayException('La propuesta necesita tres composiciones distintas y una dirección de diseño válida.' + (detail ? ' ' + detail : '')); };
  if (!value || !Number.isInteger(value.selected) || value.selected < 0 || value.selected > 2 || (selected !== undefined && value.selected !== selected)
    || !Array.isArray(value.concepts) || value.concepts.length !== 3) return fail();
  const concepts = value.concepts.map((concept: any, index: number) => {
    const invalidField = fields.find(field => !concept || typeof concept[field] !== 'string' || !concept[field].trim() || concept[field].length > (field === 'name' ? 80 : 500));
    if (invalidField) return fail(`concepts[${index}].${invalidField}: texto obligatorio, máximo ${invalidField === 'name' ? 80 : 500} caracteres.`);
    const result = Object.fromEntries(fields.map(field => [field, concept[field].trim()])) as SourceDesignConcept;
    const layout = concept.layout;
    if (requireLayout || layout !== undefined) {
      if (!layout || !Array.isArray(layout.sections) || !layout.sections.length || layout.sections.length > 12
        || layout.sections.some((id: unknown) => typeof id !== 'string' || !/^[a-z][a-z0-9-]{0,47}$/.test(id))
        || new Set(layout.sections).size !== layout.sections.length || !layout.sections.includes(layout.catalogSection)
        || typeof layout.standaloneIntro !== 'boolean' || typeof layout.productsInOpening !== 'boolean') return fail(`concepts[${index}].layout: 1–12 IDs únicos válidos, catalogSection incluido y ambos indicadores booleanos.`);
      if (!layout.standaloneIntro && layout.sections[0] !== layout.catalogSection) return fail(`concepts[${index}].layout: standaloneIntro=false exige sections[0]=catalogSection (${layout.catalogSection}); no puede precederlo otro bloque.`);
      result.layout = { sections: [...layout.sections], catalogSection: layout.catalogSection, standaloneIntro: layout.standaloneIntro, productsInOpening: layout.productsInOpening };
    }
    return result;
  });
  const normalize = (text: string) => text.toLowerCase().replace(/\s+/g, ' ').trim();
  // Catch copied proposals without pretending a string comparison measures visual originality.
  if (new Set(concepts.map((c: SourceDesignConcept) => normalize(c.opening))).size !== 3
    || new Set(concepts.map((c: SourceDesignConcept) => normalize(c.flow))).size !== 3) return fail('Los tres opening y los tres flow deben ser distintos.');
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
const mainBlocks = (main: HtmlElement) => main.childNodes.filter(isHtmlElement).filter(node => !['script', 'template', 'style'].includes(node.tagName) && !node.attrs.some(a => /^data-pagosya-(contact|comeback|subscribe|status|cart)$/.test(a.name)));

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
export function validateSourceDesignImplementation(design: SourceDesign, files: SourceProjectFileDto[]): void {
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

export const SOURCE_CREATIVE_DIRECTION = `You are the creative director and frontend designer of this merchant's storefront. Make a specific, memorable visual identity and carry it through every customer page. Work from the merchant's products, people, place, materials, cultural references and buying behavior. Choose a composition that would feel wrong with an unrelated business's name pasted into it.
There is NO mandatory hero format, homepage section list, section count, section order, spacing scale, color family, card shape, symmetry, font pairing or illustration style. A catalog can open the page; a product, image, wordmark, story or interaction can be the focal point. Choose what this business earns. Omit unsupported sections and redundant purchasing instructions instead of filling a long page. A merchant's precise design request takes priority over novelty. On a fresh design or authorized redesign, vary density, alignment, scale and image treatment deliberately; do not repeat one heading/text/card treatment down the page.
Choose the homepage structure and action hierarchy for the business and the merchant’s request. Storytelling, catalogs, galleries and interactive scenes may share the page or have their own destinations. Keep the buying path discoverable and navigation understandable; there is no required CTA count or section-to-page split.
Compose WITH the actual assets: name the image paths, roles, crops and focal points; preserve the real product's appearance and logo. Reference screenshots guide composition; photos explicitly supplied as content remain content across later edits, even if they contain other brands. If photos are absent, choose a confident typographic, interactive or menu-based concept. Custom SVG/CSS drawings, mascots and sticker-library artwork require an explicit current request for illustration; do not introduce them merely to fill space or replace existing photos. Do not fabricate photographs or leave empty photo placeholders. Typography may mix appropriate local/system families and uploaded fonts; define a complete hierarchy and mobile scale. Gradients, textures, image backgrounds and expressive layout are available when they serve this concept and the merchant's brief.
${SOURCE_VISUAL_ASSET_DIRECTION}
${SOURCE_ICON_DIRECTION}
Build the mobile concept with equal care: retain its distinguishing imagery/composition, visible navigation and buying action. Content may reflow substantially rather than simply shrinking the desktop. Use natural customer-facing copy about products and shopping. Do not describe runtime hooks, generated capability, API tokens, schemas or “real options” in storefront copy. Every authored link or control must work. Keep real content visible without animation. Use reduced-motion alternatives and keyboard-accessible controls.
Before returning files, review the implementation against the selected concept: actual catalog selectors exist, imagery is used with its intended role, sections contain meaningful content, mobile retains the identity, and product/checkout share the visual language. Resolve mismatches in the code. Do not claim browser verification: Studio separately inspects the rendered result.`;

export const SOURCE_DESIGN_CONTRACT = `For each concept, commit to a layout object BEFORE writing code. layout.sections lists the invented IDs of the direct content blocks inside main, in exact order (1–12 blocks, no required count). layout.catalogSection is the ID of the block containing the real data-pagosya-catalog. Optional runtime contact/comeback/subscribe slots may sit outside these content blocks. Every other direct content element in main must be one of the listed blocks. When the merchant asks for tabs, separate views or distinct sections, list every tab panel or view as its own block in layout.sections, in navigation order; the implementation keeps them all mounted and toggles visibility. When standaloneIntro=false, layout.sections[0] MUST equal layout.catalogSection. Put the masthead/header outside main. The catalog block is first and must not contain a disguised full-screen introduction: compact brand/context and immediately purchasable products lead. For this catalog-first choice, the actual catalog must begin within the first 320 CSS pixels of the document at both desktop and mobile; use a compact masthead or place intro beside products, not a large nested headline above them. productsInOpening means a real product name, price AND add action are visible without scrolling at BOTH 1280x844 and 390x844. This is a checked promise, not prose. Set the booleans honestly to match the concept. A photo/wordmark-led concept may have a standalone intro; a menu-led concept need not. The three concepts must differ in at least two meaningful structural choices (opening, product presentation, density, alignment, typography hierarchy, story sequence); explain those contrasts in their premises. Use the merchant's precise choices first. Do not produce three editorial-serif headline/catalog/footer variations. Give each concept its own visual grammar; type-led, image-led, densely useful and spacious compositions are all available. Keep a clearly labelled Mi pedido button and count visible in the mobile header outside collapsed navigation. Do not hide purchasing controls in a menu. Match product and checkout surfaces to the selected typography, geometry and spacing; empty photo galleries and empty status boxes must take no space. Use semantic product headings and aria-hidden on decorative marks. Do not insert the same emoji or fake sequential number into every product. Leave absent product imagery out; brand illustration belongs to the composition, not a pretend product thumbnail. For optional product images use a data-product-media wrapper; the runtime hides it when no image exists and marks the product data-no-image. Collapse any reserved media column for [data-no-image], rather than leaving blank tiles. For every product composition, place the actual name, price and add action as a coherent group. When a featured product uses multiple grid rows, explicitly place media, copy and purchase areas; do not let auto-placement put the price under the image in a different column from its name. Use minmax(0,1fr), min-width:0 and wrapping purchase actions where necessary. At 320px, every purchase control must fit its container with a comfortable 44px hit area. Never hide overflow to conceal a clipped purchase action. Mark separate product artwork with data-product-decoration and aria-hidden=true. Size CSS/SVG drawings against the available column width, including pseudo-elements; transform:scale alone does not remove intrinsic grid sizing. Keep decorative artwork in its own layout space; on mobile it must not overlap headings, copy or controls. Keep display letter-spacing at or above -0.04em and preserve open counters and clear word spaces.
Action hierarchy must make sense for the selected concept and merchant brief. Navigation uses real anchors and state changes use buttons. Keep purchasing accessible through the experience; do not invent destinations or use inactive controls.`;
