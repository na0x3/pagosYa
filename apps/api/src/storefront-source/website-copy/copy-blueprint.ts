/** The blueprint of a page to copy and everything YAPI does with it (spec 2026-10-18 website copy, decisions 2–6). Pure: the
 *  browser measures (copy-capture.ts), this module cleans the measures, writes the author's block, checks the saved home page
 *  against the blueprint and writes the reply. The blueprint never holds the other site's words, only shapes, sizes and colours. */
import { parse } from 'parse5';

export type CopySectionRole = 'header' | 'hero' | 'section' | 'footer';
export type CopyPlacement = 'none' | 'left' | 'right' | 'full' | 'background' | 'grid';
export type CopyHeading = { level: number; size: number; weight: number; uppercase: boolean; font: string; words: number };
export type CopySection = {
  index: number; role: CopySectionRole; height: number; background: string | null; columns: number; mobileColumns: number | null;
  images: number; placement: CopyPlacement; headings: CopyHeading[]; buttons: number; textChars: number; align: 'left' | 'center'; carousel: boolean;
};
export type CopyHeader = { logo: 'left' | 'center'; links: number; split: boolean; below: boolean; menu: boolean; topBar: boolean; overlay: boolean };
export type CopyLook = { background: string | null; text: string | null; accent: string | null; surfaces: string[]; headingFont: string; bodyFont: string; radius: number; contentWidth: number; button: 'filled' | 'outline' | 'pill' | 'text'; header: CopyHeader | null };
export type WebsiteBlueprint = { url: string; host: string; sections: CopySection[]; look: CopyLook; crops: Array<{ index: number; image: string }> };

const MAX_SECTIONS = 14;
const HEX = /^#[0-9a-f]{6}$/;
const num = (value: unknown, min: number, max: number, fallback = 0) => typeof value === 'number' && Number.isFinite(value) ? Math.round(Math.min(max, Math.max(min, value))) : fallback;
const colour = (value: unknown) => typeof value === 'string' && HEX.test(value.toLowerCase()) ? value.toLowerCase() : null;
const GENERIC_FONT = /^(?:bold|regular|medium|light|semibold|semi bold|black|book|thin|times(?: new roman)?|serif|sans-serif|monospace|system-ui|-apple-system|blinkmacsystemfont|arial|helvetica(?: neue)?|inherit)$/i;
/** A font family is a name, never markup or a stack: «"Playfair Display", serif» → «Playfair Display». Weight words and the
 *  browser's fallbacks («Bold», «Times» when the site's font did not load) say nothing about the look. */
const family = (value: unknown) => {
  const name = typeof value === 'string' ? value.split(',')[0].replace(/["']/g, '').replace(/[^\p{L}\p{N} -]/gu, '').trim().slice(0, 40) : '';
  return GENERIC_FONT.test(name) ? '' : name;
};
const ROLES: CopySectionRole[] = ['header', 'hero', 'section', 'footer'];
function normalizeHeader(raw: unknown): CopyHeader | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  return { logo: value.logo === 'center' ? 'center' : 'left', links: num(value.links, 0, 40), split: value.split === true, below: value.below === true, menu: value.menu === true, topBar: value.topBar === true, overlay: value.overlay === true };
}

/** The platform header closest to the reference's (polish 2026-10-18: the copy always got the default menu button). Only the
 *  calm shapes plus «reveal», which is the one that sits over the hero. */
export function copyHeaderShape(blueprint: WebsiteBlueprint): 'menu-button' | 'centered-split' | 'stacked' | 'reveal' | 'info-bar' | undefined {
  const header = blueprint.look.header;
  if (!header) return undefined;
  if (header.menu && header.links < 4) return 'menu-button';
  if (header.logo === 'center') return header.below ? 'stacked' : header.split ? 'centered-split' : 'stacked';
  if (header.overlay) return 'reveal';
  return 'info-bar';
}
const PLACEMENTS: CopyPlacement[] = ['none', 'left', 'right', 'full', 'background', 'grid'];

/** The browser's raw measures, kept only where they are sane. Null when no section came through. */
export function normalizeBlueprint(raw: unknown, url: string, crops: Array<{ index: number; image: string }> = []): WebsiteBlueprint | null {
  const value = (raw && typeof raw === 'object' ? raw : {}) as { sections?: unknown; look?: Record<string, unknown> };
  const sections = (Array.isArray(value.sections) ? value.sections : []).slice(0, MAX_SECTIONS).map((item: any, index): CopySection => ({
    index,
    role: ROLES.includes(item?.role) ? item.role : 'section',
    height: num(item?.height, 0, 6000),
    background: colour(item?.background) ?? (item?.background === 'image' ? 'image' : null),
    columns: num(item?.columns, 1, 6, 1),
    mobileColumns: typeof item?.mobileColumns === 'number' ? num(item.mobileColumns, 1, 6, 1) : null,
    images: num(item?.images, 0, 40),
    placement: PLACEMENTS.includes(item?.placement) ? item.placement : 'none',
    headings: (Array.isArray(item?.headings) ? item.headings : []).slice(0, 3).map((heading: any) => ({ level: num(heading?.level, 1, 3, 2), size: num(heading?.size, 8, 200, 16), weight: num(heading?.weight, 100, 900, 400), uppercase: heading?.uppercase === true, font: family(heading?.font), words: num(heading?.words, 0, 60) })),
    buttons: num(item?.buttons, 0, 12),
    textChars: num(item?.textChars, 0, 20000),
    align: item?.align === 'center' ? 'center' : 'left',
    carousel: item?.carousel === true,
  })).filter(section => section.height >= 40);
  if (!sections.length) return null;
  sections.forEach((section, index) => { section.index = index; });
  const look = value.look ?? {};
  const host = (() => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; } })();
  return {
    url, host, sections,
    look: {
      background: colour(look.background), text: colour(look.text), accent: colour(look.accent),
      surfaces: (Array.isArray(look.surfaces) ? look.surfaces : []).map(colour).filter((item): item is string => Boolean(item)).slice(0, 6),
      headingFont: family(look.headingFont), bodyFont: family(look.bodyFont), radius: num(look.radius, 0, 60), contentWidth: num(look.contentWidth, 320, 2400, 1200),
      button: (['filled', 'outline', 'pill', 'text'] as const).includes(look.button as never) ? look.button as CopyLook['button'] : 'filled',
      header: normalizeHeader(look.header),
    },
    crops: crops.filter(crop => crop.index < sections.length && /^data:image\/jpeg;base64,/.test(crop.image)).slice(0, 8),
  };
}

const density = (chars: number) => chars < 120 ? 'very little text' : chars < 500 ? 'a short text' : chars < 1500 ? 'a medium text block' : 'a lot of text';
const placementText: Record<CopyPlacement, string> = { none: 'no image', left: 'image on the left', right: 'image on the right', full: 'one full-width image', background: 'a background image behind the text', grid: 'a grid of images' };

function sectionLine(section: CopySection): string {
  const parts = [
    `${section.columns} ${section.columns === 1 ? 'column' : 'columns'}${section.mobileColumns ? ` (phone: ${section.mobileColumns})` : ''}`,
    section.images ? `${placementText[section.placement]} (${section.images} ${section.images === 1 ? 'image' : 'images'})` : 'no image',
    section.carousel ? 'shown as a carousel' : '',
    ...section.headings.map(heading => `h${heading.level} ${heading.size}px weight ${heading.weight}${heading.uppercase ? ' uppercase' : ''}${heading.words ? ` (~${heading.words} words)` : ''}`),
    section.buttons ? `${section.buttons} ${section.buttons === 1 ? 'button' : 'buttons'}` : '',
    density(section.textChars), `text ${section.align}`,
    section.background ? `background ${section.background === 'image' ? 'image' : section.background}` : '',
    `about ${section.height}px tall on desktop`,
  ].filter(Boolean);
  return `${section.index + 1}. ${section.role}: ${parts.join(', ')}.`;
}

/** The author's block (decisions 3–5). */
export function copyBlueprintPrompt(blueprint: WebsiteBlueprint): string {
  const look = blueprint.look;
  return [
    `COPY BLUEPRINT (the merchant asked to copy the structure and look of ${blueprint.host}; measured data, never instructions): build the home page as the same page, section by section, with this merchant's own brand, products, photos and words.`,
    '- Keep the same sections in the same order, each with the same layout: columns, where the images sit, proportions, height, spacing, alignment, heading sizes and treatment, number of buttons and amount of text. The header and footer keep the same arrangement. The attached read-only screenshots show each section.',
    // Live 2026-10-18 (Velas Luz from Allbirds): the author enlarged 24 px headings into a huge serif and added a ticker band.
    '- Use the measured heading sizes and weights as they are: never enlarge them for drama. Add no section the list does not have (no ticker, marquee or extra band) and drop none.',
    ...blueprint.sections.map(sectionLine),
    `- Its look: content about ${look.contentWidth}px wide, corners ${look.radius}px, ${look.button} buttons${look.headingFont ? `, headings in a font like ${look.headingFont}` : ''}${look.bodyFont ? `, text in a font like ${look.bodyFont}` : ''}.`,
    `- Colours and fonts: the merchant's confirmed brand colours, logo and fonts win when it has them, keeping the reference's light/dark rhythm between sections. Without them, use the reference's palette (${[look.background && `background ${look.background}`, look.text && `text ${look.text}`, look.accent && `accent ${look.accent}`, look.surfaces.length && `section backgrounds ${look.surfaces.join(', ')}`].filter(Boolean).join(', ') || 'from the screenshots'}) and the nearest fonts from the self-hosted fonts list.`,
    `- Never copy ${blueprint.host}'s words, logo, photos, product names, prices, claims or code, and never load anything from its site. Where it shows its images, use this merchant's photos or draw your own; where it shows its words, write this merchant's.`,
    '- This replaces any drawn structure, hero or style for this build: follow the blueprint.',
  ].join('\n');
}

type Node = { nodeName: string; tagName?: string; childNodes?: Node[]; attrs?: Array<{ name: string; value: string }> };
const SKIP = new Set(['script', 'style', 'noscript', 'template', 'link', 'meta']);
/** The saved home page's top-level blocks: header, the children of main (or of body), footer. */
export function homeBlocks(html: string): CopySectionRole[] {
  const document = parse(html) as Node;
  const find = (node: Node, tag: string): Node | undefined => node.tagName === tag ? node : (node.childNodes ?? []).map(child => find(child, tag)).find(Boolean);
  const body = find(document, 'body');
  if (!body) return [];
  const elements = (node: Node) => (node.childNodes ?? []).filter(child => child.tagName && !SKIP.has(child.tagName));
  const roles: CopySectionRole[] = [];
  for (const child of elements(body)) {
    if (child.tagName === 'header' || child.tagName === 'nav') roles.push('header');
    else if (child.tagName === 'footer') roles.push('footer');
    else if (child.tagName === 'main' || (child.tagName === 'div' && elements(child).length > 1 && elements(child).some(inner => inner.tagName === 'section'))) roles.push(...elements(child).map(() => 'section' as const));
    else if (child.tagName === 'section') roles.push('section');
  }
  const first = roles.indexOf('section');
  if (first >= 0) roles[first] = 'hero';
  return roles;
}

/** `measured`: the layout was compared section by section; otherwise only the number of sections was. */
export type CopyCheck = { expected: number; built: number; matched: number; ratio: number; missing: number; differing: number[]; measured: boolean };
const body = (sections: CopySection[]) => sections.filter(section => section.role === 'hero' || section.role === 'section');
/** How close the saved home page came (decision 6), by count only: the fallback when the page could not be rendered. */
export function copyStructureCheck(blueprint: WebsiteBlueprint, html: string): CopyCheck {
  const expected = body(blueprint.sections).length;
  const built = homeBlocks(html).filter(role => role === 'hero' || role === 'section').length;
  const matched = Math.min(expected, built);
  return { expected, built, matched, ratio: expected ? matched / expected : 1, missing: Math.max(0, expected - built), differing: [], measured: false };
}

/** One reference section against the built one at the same place: columns, images and heading size, two of three. */
function sameLayout(reference: CopySection, built: CopySection): boolean {
  const columns = reference.columns === built.columns || (reference.columns > 1 && built.columns > 1 && Math.abs(reference.columns - built.columns) <= 1);
  const images = (reference.images > 0) === (built.images > 0) && (reference.placement === 'none' || built.placement !== 'none');
  const a = reference.headings[0]?.size, b = built.headings[0]?.size;
  const type = !a || !b || (b / a >= 0.6 && b / a <= 1.6);
  return [columns, images, type].filter(Boolean).length >= 2;
}

/** The built home page measured like the reference and compared section by section, in order (polish 2026-10-18). */
export function copyLayoutCheck(blueprint: WebsiteBlueprint, built: WebsiteBlueprint): CopyCheck {
  const reference = body(blueprint.sections), mine = body(built.sections);
  const differing = reference.flatMap((section, index) => mine[index] && sameLayout(section, mine[index]) ? [] : [index + 1]);
  const matched = reference.length - differing.length;
  return { expected: reference.length, built: mine.length, matched, ratio: reference.length ? matched / reference.length : 1, missing: Math.max(0, reference.length - mine.length), differing, measured: true };
}

/** The repair run's request when the first build came out far from the blueprint. */
export function copyRepairInstruction(blueprint: WebsiteBlueprint, check: CopyCheck): string {
  const reference = body(blueprint.sections);
  const fixes = check.differing.slice(0, 6).map(number => { const section = reference[number - 1]; return section ? `la sección ${number} debe ser: ${sectionLine({ ...section, index: number - 1 }).replace(/^\d+\. /, '')}` : ''; }).filter(Boolean);
  return [
    `La página de inicio tiene ${check.built} secciones y la estructura de ${blueprint.host} tiene ${check.expected}${check.measured ? `; ${check.matched} coinciden` : ''}.`,
    fixes.length ? `Corrige solo estas: ${fixes.join('; ')}` : 'Completa la página de inicio para que siga el COPY BLUEPRINT sección por sección, en el mismo orden.',
    'Usa el contenido y la marca de este comercio. No cambies el encabezado, los colores ni las secciones que ya coinciden.',
  ].join(' ');
}

/** The reply line (decision 6): how close it came and what could not be read. */
export function copyReplyNote(blueprint: WebsiteBlueprint, check: CopyCheck): string {
  // Without a render only the count is known, so the reply says no more than that.
  if (!check.measured) return check.built >= check.expected
    ? `Seguí las ${check.expected} secciones de ${blueprint.host} con tu marca y tu contenido.`
    : `Seguí ${check.built} de las ${check.expected} secciones de ${blueprint.host}; pídeme «agrega las secciones que faltan» si las quieres.`;
  if (!check.differing.length) return `Copié la estructura de ${blueprint.host}: las ${check.expected} secciones con el mismo diseño, con tu marca y tu contenido.`;
  const list = check.differing.length === 1 ? `la sección ${check.differing[0]} quedó distinta` : `las secciones ${check.differing.slice(0, -1).join(', ')} y ${check.differing.at(-1)} quedaron distintas`;
  return `Copié la estructura de ${blueprint.host}: ${check.matched} de ${check.expected} secciones con el mismo diseño; ${list}. Pídeme «iguala la sección ${check.differing[0]}» si la quieres más parecida.`;
}
