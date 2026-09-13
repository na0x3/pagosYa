import { SOURCE_ICON_DIRECTION } from './source-asset-library';
import { BadGatewayException } from '@nestjs/common';
import { randomInt } from 'node:crypto';
import { parse, type DefaultTreeAdapterMap } from 'parse5';
import type { SourceProjectFileDto } from './dto/save-source-project.dto';
import { SOURCE_VISUAL_ASSET_DIRECTION } from './source-visual-assets';

export const SOURCE_DESIGN_FILE = 'design-direction.json';
const fields = ['name', 'premise', 'opening', 'flow', 'typography', 'imagery', 'mobile'] as const;
export type SourceDesignLayout = { sections: string[]; catalogSection: string; standaloneIntro: boolean; productsInOpening: boolean };
export type SourceDesignConcept = Record<(typeof fields)[number], string> & { layout?: SourceDesignLayout };
export type SourceDesign = { concepts: SourceDesignConcept[]; selected: number };
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

export function sourceDesignExploration(selected = randomInt(3)) {
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
  return { concepts, selected: value.selected };
}

/** Parse HTML without executing generated code. Rendering/viewport claims are checked in Studio. */
export function validateSourceDesignImplementation(design: SourceDesign, files: SourceProjectFileDto[]): void {
  const layout = design.concepts[design.selected].layout;
  if (!layout) return; // Older revisions remain readable and editable.
  type Node = DefaultTreeAdapterMap['node'];
  type Element = DefaultTreeAdapterMap['element'];
  const isElement = (node: Node): node is Element => 'tagName' in node;
  const attr = (node: Element, name: string) => node.attrs.find(a => a.name === name)?.value;
  const descendants = (node: Node): Element[] => 'childNodes' in node ? node.childNodes.flatMap(child => isElement(child) && ['template', 'script', 'style'].includes(child.tagName) ? [] : [...(isElement(child) ? [child] : []), ...descendants(child)]) : [];
  const nodes = descendants(parse(files.find(f => f.path === 'index.html')?.content || ''));
  const main = nodes.find(node => node.tagName === 'main');
  const fail = (message: string): never => { throw new BadGatewayException(`El diseño elegido no coincide con index.html: ${message}`); };
  if (!main) return fail('falta main con los bloques de layout.sections.');
  const sections = main.childNodes.filter(isElement).filter(node => !['script', 'template', 'style'].includes(node.tagName) && !node.attrs.some(a => /^data-pagosya-(contact|comeback|subscribe|status|cart)$/.test(a.name)));
  const ids = sections.map(node => attr(node, 'id'));
  if (JSON.stringify(ids) !== JSON.stringify(layout.sections)) return fail(`los bloques directos de main deben seguir ${layout.sections.join(' → ')}; encontrados ${ids.map(id => id || '(sin id)').join(' → ')}. No añadas una portada fuera del plan.`);
  const catalogs = descendants(main).filter(node => attr(node, 'data-pagosya-catalog') !== undefined);
  const catalogSection = sections.find(node => attr(node, 'id') === layout.catalogSection)!;
  if (catalogs.length !== 1 || !(catalogs[0] === catalogSection || descendants(catalogSection).includes(catalogs[0]))) return fail(`sitúa el único catálogo real dentro de #${layout.catalogSection}.`);
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
Compose WITH the actual assets: name the image paths, roles, crops and focal points; preserve the real product's appearance and logo. Reference screenshots guide the composition and are never pasted in as content. If photos are absent, choose a confident typographic, illustrated, interactive or menu-based concept. Original SVG/CSS artwork and the optional sticker library are available without separate permission. Do not fabricate photographs or leave empty photo placeholders. Typography may mix appropriate local/system families and uploaded fonts; define a complete hierarchy and mobile scale. Gradients, textures, image backgrounds and expressive layout are available when they serve this concept and the merchant's brief.
${SOURCE_VISUAL_ASSET_DIRECTION}
${SOURCE_ICON_DIRECTION}
Build the mobile concept with equal care: retain its distinguishing imagery/composition, visible navigation and buying action. Content may reflow substantially rather than simply shrinking the desktop. Every authored link or control must work. Keep real content visible without animation. Use reduced-motion alternatives and keyboard-accessible controls.
Before returning files, review the implementation against the selected concept: actual catalog selectors exist, imagery is used with its intended role, sections contain meaningful content, mobile retains the identity, and product/checkout share the visual language. Resolve mismatches in the code. Do not claim browser verification: Studio separately inspects the rendered result.`;

export const SOURCE_DESIGN_CONTRACT = `For each concept, commit to a layout object BEFORE writing code. layout.sections lists the invented IDs of the direct content blocks inside main, in exact order (1–12 blocks, no required count). layout.catalogSection is the ID of the block containing the real data-pagosya-catalog. Optional runtime contact/comeback/subscribe slots may sit outside these content blocks. Every other direct content element in main must be one of the listed blocks. When standaloneIntro=false, layout.sections[0] MUST equal layout.catalogSection. Put the masthead/header outside main. The catalog block is first and must not contain a disguised full-screen introduction: compact brand/context and immediately purchasable products lead. For this catalog-first choice, the actual catalog must begin within the first 320 CSS pixels of the document at both desktop and mobile; use a compact masthead or place intro beside products, not a large nested headline above them. productsInOpening means a real product name, price AND add action are visible without scrolling at BOTH 1280x844 and 390x844. This is a checked promise, not prose. Set the booleans honestly to match the concept. A photo/wordmark-led concept may have a standalone intro; a menu-led concept need not. The three concepts must differ in at least two meaningful structural choices (opening, product presentation, density, alignment, typography hierarchy, story sequence); explain those contrasts in their premises. Use the merchant's precise choices first. Do not produce three editorial-serif headline/catalog/footer variations. Give each concept its own visual grammar; type-led, image-led, densely useful and spacious compositions are all available. Keep a clearly labelled Mi pedido button and count visible in the mobile header outside collapsed navigation. Do not hide purchasing controls in a menu. Match product and checkout surfaces to the selected typography, geometry and spacing; empty photo galleries and empty status boxes must take no space. Use semantic product headings and aria-hidden on decorative marks. Do not insert the same emoji or fake sequential number into every product. Leave absent product imagery out; brand illustration belongs to the composition, not a pretend product thumbnail. For optional product images use a data-product-media wrapper; the runtime hides it when no image exists and marks the product data-no-image. Collapse any reserved media column for [data-no-image], rather than leaving blank tiles. For every product composition, place the actual name, price and add action as a coherent group. When a featured product uses multiple grid rows, explicitly place media, copy and purchase areas; do not let auto-placement put the price under the image in a different column from its name. Use minmax(0,1fr), min-width:0 and wrapping purchase actions where necessary. At 320px, every purchase control must fit its container with a comfortable 44px hit area. Never hide overflow to conceal a clipped purchase action. Mark separate product artwork with data-product-decoration and aria-hidden=true. Size CSS/SVG drawings against the available column width, including pseudo-elements; transform:scale alone does not remove intrinsic grid sizing. Keep decorative artwork in its own layout space; on mobile it must not overlap headings, copy or controls. Keep display letter-spacing at or above -0.04em and preserve open counters and clear word spaces.
Action hierarchy must make sense for the selected concept and merchant brief. Navigation uses real anchors and state changes use buttons. Keep purchasing accessible through the experience; do not invent destinations or use inactive controls.`;
