/** Spec 2026-10-19 master template: the copy, look and theme a master template (manifest.master) is filled with.
 *  Pure; the template apply and the content edits (source-templates.ts) both use it. */
import type { MasterCopy, MasterSettings } from '@pagosya/store-templates';
import { SOURCE_FONT_CATALOG } from './source-font-catalog';
import { bestInkFor, contrastRatio } from './sketch/sketch-schema';
import type { StoreMenuGroup } from './source-store-menu';
import type { FeatureCopy } from './source-master-features';
import { TITLE_STYLES, isTitleStyle, type TitleStyle } from './source-title-style';

export const MASTER_TEMPLATE_ID = 'esencial';
export const MASTER_THEME_START = '/* pagosya:master-theme */';
export const MASTER_THEME_END = '/* pagosya:master-theme:end */';
export const MASTER_COPY_CAPS = { announcement: 90, eyebrow: 40, headline: 70, subcopy: 160, primaryCta: 28, secondaryCta: 28, productsTitle: 50, storyTitle: 60, storyBody: 420, closingLine: 80, closingCta: 28, tagline: 90 } as const;
export const MASTER_VALUE_CAPS = { title: 40, text: 140 } as const;
/** Fields a merchant may leave empty on purpose: the bar and the footer line are then not shown. */
const OPTIONAL = new Set(['announcement', 'tagline']);
const HEX = /^#[0-9a-f]{6}$/i;

export type MasterColour = 'paper' | 'ink' | 'muted' | 'accent' | 'deep';
export const MASTER_COLOURS: readonly MasterColour[] = ['paper', 'ink', 'muted', 'accent', 'deep'];
/** Miga Dorada 2026-11-07 («que el footer sea rosado»): the parts a merchant may colour on their own, over the theme's fixed colour. */
export type MasterPart = 'header' | 'footer' | 'announce';
export const MASTER_PARTS: readonly MasterPart[] = ['header', 'footer', 'announce'];
export type MasterLook = { palette: string; fonts: string; colors: Partial<Record<MasterColour, string>>; titles?: string[];
  /** A part's own background colour (#rrggbb); a part left out keeps its theme's colour. */
  parts?: Partial<Record<MasterPart, string>> };
export type MasterFill = { copy?: Partial<MasterCopy>; look?: Partial<MasterLook>; heroPhoto?: string | null; storyPhoto?: string | null;
  /** Section library (spec 2026-10-31): the home's blocks, in order (store-data `layout`); photos already bundled. */
  layout?: unknown[];
  /** Owner 2026-10-31 («the inside of each product card»): the template's sections under the product page's buy box (store-data
   *  `productLayout`), filled like the home. */
  productLayout?: unknown[];
  /** Spec 2026-11-05: the template's sections on the menu pages (store-data `pageLayouts`: about, contact, faq, shipping). */
  pageLayouts?: Record<string, unknown[]>;
  /** The pages YAPI made (spec 2026-11-05 creates anything): store-data `extraPages`; photos bundled. */
  extraPages?: import('./source-extra-pages').ExtraPage[];
  /** Owner 2026-10-25: a video the merchant attached, played as the cover (store-data photos.heroVideo). */
  heroVideo?: string;
  /** Owner 2026-10-28 (avril, «longer with more pictures»): the merchant's own pictures the cover and story did not take, in the
   *  order sent; store-data photos.b1…b6, which the templates' sections show before any product photo. */
  brandPhotos?: string[];
  /** Owner 2026-10-28: the colours the merchant named for the brand (source-palette.ts coloursFromWords), as hex, in the order written. */
  namedColours?: string[];
  /** Variety spec: the business's character, its sections and any variant the merchant named. */
  character?: MasterCharacter; sections?: MasterSection[]; variants?: Partial<MasterVariants>;
  /** The uploads the bundled hero/story photos came from, so product slots holding the same photo can point at the bundle. */
  photoSources?: { hero?: string; story?: string };
  /** Dropdown menu spec 2026-10-21: the menu style (none removes it) and the groups YAPI wrote ([] = built from the categories). */
  menu?: { style: 'none' | 'panel' | 'dropdowns'; groups: StoreMenuGroup[] };
  /** John Smedley sections (spec 2026-10-21): the words for the rolled sections. */
  featureCopy?: Partial<FeatureCopy>;
  /** YAPI plan card (spec 2026-10-22): kit surfaces a plan pins (card swatches…); unknown values are dropped. */
  dna?: Record<string, string> };

/** a → b by t (0..1), both #rrggbb. */
const mixHex = (a: string, b: string, t: number) => '#' + [1, 3, 5].map(i => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - t) + parseInt(b.slice(i, i + 2), 16) * t).toString(16).padStart(2, '0')).join('');

const clip = (value: unknown, max: number) => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max).trim() : undefined;

export function masterCopy(settings: MasterSettings, partial: Partial<MasterCopy> = {}): MasterCopy {
  const base = settings.copy;
  const text = Object.fromEntries((Object.keys(MASTER_COPY_CAPS) as Array<keyof typeof MASTER_COPY_CAPS>).map(key => {
    const value = clip(partial[key], MASTER_COPY_CAPS[key]);
    return [key, value === undefined || (!value && !OPTIONAL.has(key)) ? base[key] : value];
  })) as Omit<MasterCopy, 'values'>;
  const given = Array.isArray(partial.values) ? partial.values : [];
  const values = base.values.map((fallback, index) => {
    const title = clip(given[index]?.title, MASTER_VALUE_CAPS.title);
    const body = clip(given[index]?.text, MASTER_VALUE_CAPS.text);
    return title && body ? { title, text: body } : { title: fallback.title, text: fallback.text };
  });
  return { ...text, values };
}

/** A merchant upload saved as a path (`/v1/uploads/…`) as the full API URL: a published store on its own domain must still load it. */
export function masterPhotoUrl(url: string | null | undefined, apiUrl?: URL): string {
  if (!url) return '';
  return apiUrl && url.startsWith('/') && !url.startsWith('//') ? new URL(url, apiUrl.origin).href : url;
}

export function masterLook(settings: MasterSettings, partial: Partial<MasterLook> = {}): MasterLook {
  const palette = settings.palettes.some(p => p.id === partial.palette) ? partial.palette! : settings.palettes[0].id;
  const fonts = settings.fonts.some(f => f.id === partial.fonts) ? partial.fonts! : settings.fonts[0].id;
  const colors: Partial<Record<MasterColour, string>> = {};
  for (const key of MASTER_COLOURS) { const value = partial.colors?.[key]; if (typeof value === 'string' && HEX.test(value)) colors[key] = value.toLowerCase(); }
  // Chunky colour titles (spec 2026-11-03): up to four title colours from the store's photos.
  const titles = (partial.titles ?? []).filter(value => typeof value === 'string' && HEX.test(value)).map(value => value.toLowerCase()).slice(0, 4);
  const parts = lookParts(partial.parts);
  return { palette, fonts, colors, ...(titles.length ? { titles } : {}), ...(Object.keys(parts).length ? { parts } : {}) };
}

/** The part colours that are #rrggbb, lower case. */
function lookParts(parts: unknown): Partial<Record<MasterPart, string>> {
  const given = (parts && typeof parts === 'object' ? parts : {}) as Record<string, unknown>;
  return Object.fromEntries(MASTER_PARTS.flatMap(part => typeof given[part] === 'string' && HEX.test(given[part] as string) ? [[part, (given[part] as string).toLowerCase()]] : []));
}

/** The saved part colours with a change over them: a hex sets the part, "" gives it back to the theme, anything else is ignored. */
export function mergeLookParts(current: unknown, change: unknown): Partial<Record<MasterPart, string>> {
  const out = lookParts(current);
  const asked = (change && typeof change === 'object' ? change : {}) as Record<string, unknown>;
  for (const part of MASTER_PARTS) {
    const value = asked[part];
    if (value === '') delete out[part];
    else if (typeof value === 'string' && HEX.test(value)) out[part] = value.toLowerCase();
  }
  return out;
}

/** A part's colour drawn over every theme (they paint it a fixed hex): its words follow in a colour that reads on it, but not a box
 *  inside with its own colour — the footer's ticker strip, signup form and dark boxes, a dropdown panel, the cart count, a button. */
export function masterPartsCss(parts: Partial<Record<MasterPart, string>> | undefined): string {
  const rules: string[] = [];
  const ink = (hex: string) => bestInkFor(hex, '#ffffff');
  if (parts?.announce) rules.push(`.es-announce{background:${parts.announce}!important;color:${ink(parts.announce)}!important}`,
    '.es-announce :is(p,span,a){color:inherit!important}');
  if (parts?.header) rules.push(`.es-header{background:${parts.header}!important;color:${ink(parts.header)}!important;-webkit-backdrop-filter:none!important;backdrop-filter:none!important}`,
    '.es-header :is(a,button,span,p,.es-logo,.es-icon-btn):not(.es-btn):not(.es-btn *):not(.es-cart-count):not(.es-header__search *):not([class*="panel"] *):not([class*="drop"] *){color:inherit!important}');
  if (parts?.footer) rules.push(`.es-footer{background-color:${parts.footer}!important;color:${ink(parts.footer)}!important}`,
    '.es-footer:not([data-es-footer="column"]) :is(a,p,h2,h3,label,span,small,li,.es-footer__big,.es-footer__word):not(.es-footer__ticker *):not(.es-footer__signup *):not(button *):not([data-es-footer="twotone"] .es-footer__brand *){color:inherit!important}');
  return rules.join('\n');
}

/** The palette with the merchant's own colours over it; text is always readable on paper, accent and deep. */
/** Review fix: a brand accent (with no brand paper) must stay readable on the rolled palette's paper; otherwise the first
 *  catalogue palette it reads on (3:1, the large-text and UI floor) replaces the roll. A brand paper is the brand's choice. */
export function paletteForBrand(settings: MasterSettings, rolled: string, colours: Partial<Record<'paper' | 'ink' | 'accent' | 'muted', string>>): string {
  if (!colours.accent || colours.paper) return rolled;
  const reads = (id: string) => { const paper = settings.palettes.find(p => p.id === id)?.paper; return Boolean(paper) && contrastRatio(colours.accent!, paper!) >= 3; };
  return reads(rolled) ? rolled : settings.palettes.find(p => reads(p.id))?.id ?? rolled;
}

export function masterColours(settings: MasterSettings, look: MasterLook) {
  const base = settings.palettes.find(p => p.id === look.palette) ?? settings.palettes[0];
  const merged = { paper: base.paper, ink: base.ink, muted: base.muted, accent: base.accent, deep: base.deep, ...look.colors };
  return readableColours(merged);
}

/** Unreadable ink or muted are replaced; the accent and deep get their own readable text colour. */
function readableColours(merged: Record<MasterColour, string>) {
  const ink = contrastRatio(merged.paper, merged.ink) >= 4.5 ? merged.ink : bestInkFor(merged.paper, merged.ink);
  // The footer, empty cart and hovers put ink on muted: a muted the ink cannot be read on becomes a tint of the paper.
  const muted = contrastRatio(merged.muted, ink) >= 4.5 ? merged.muted : mixHex(merged.paper, ink, 0.06);
  return { ...merged, ink, muted, onAccent: bestInkFor(merged.accent, '#ffffff'), onDeep: bestInkFor(merged.deep, '#ffffff'), accentInk: accentInk(merged.accent, merged.paper, ink) };
}

/** Owner 2026-11-02 (DooBoo «el fondo y las letras del mismo color»): the templates write headings, card names and links in the accent,
 *  drawn for a dark accent. A pale brand accent (DooBoo's cream gelato) keeps its buttons; its words on the page move towards the ink,
 *  in the accent's family, until they read (4.5:1). An accent that already reads at 3:1 (large headings) stays itself. */
export function accentInk(accent: string, paper: string, ink: string): string {
  if (!HEX.test(accent) || !HEX.test(paper) || !HEX.test(ink) || contrastRatio(accent, paper) >= 3) return accent;
  for (let t = 0.1; t < 1; t += 0.1) { const mixed = mixHex(accent, ink, t); if (contrastRatio(mixed, paper) >= 4.5) return mixed; }
  return ink;
}

/** The accent as text on the page (no background of its own in the rule, not inside an accent or dark band) becomes
 *  var(--es-accent-ink), which is the accent itself whenever the accent reads on the paper. A section that redraws the accent
 *  (an accent band sets --es-accent to the colour read on it) redraws --es-accent-ink with it (DooBoo rev 4: maroon on maroon). Idempotent. */
export function readableAccentText(css: string): string {
  return css.replace(/([^{}]*)\{([^{}]*)\}/g, (rule, selector: string, body: string) => {
    const redrawn = /(?:^|[;\s])--es-accent:\s*([^;]+)/.exec(body);
    if (redrawn && !/--es-accent-ink:/.test(body)) return `${selector}{${body.replace(/;?\s*$/, '')};--es-accent-ink:${redrawn[1].trim()}}`;
    if (!/(^|[;\s])color:\s*var\(--es-accent\)/.test(body) || /background/.test(body) || /band="(accent|deep|dark)"|es-(header|footer)\b/.test(selector)) return rule;
    return `${selector}{${body.replace(/(^|[;\s])color:\s*var\(--es-accent\)/g, '$1color:var(--es-accent-ink,var(--es-accent))')}}`;
  });
}

const catalogFont = (id: string) => {
  const font = SOURCE_FONT_CATALOG.find(entry => entry.id === id);
  if (!font) throw new TypeError(`La fuente ${id} no está en el catálogo de pagosYa.`);
  return font;
};
const face = (id: string) => { const font = catalogFont(id); return `@font-face{font-family:'${font.family}';src:url(assets/${font.id}.ttf) format('truetype');font-weight:${font.weights.replace('–', ' ')};font-display:swap}`; };

/** Chunky colour titles (spec 2026-11-03): four title colours (a shorter list repeats in order) and the style's font. */
const titleVars = (colours: string[]) => [0, 1, 2, 3].map(at => `--es-title-${at + 1}:${colours[at % colours.length]};`).join('');

/** Spec 2026-10-29 (home writer): the theme block from five colours and two catalog fonts. */
export function masterThemeBlock(colours: Record<MasterColour, string>, headingFont: string, bodyFont: string, monoFont?: string, titles?: { colours?: string[]; style?: string }): string {
  const c = readableColours(colours);
  const titleFont = isTitleStyle(titles?.style) ? TITLE_STYLES[titles!.style as TitleStyle].font : undefined;
  const vars = `:root{--es-paper:${c.paper};--es-ink:${c.ink};--es-muted:${c.muted};--es-accent:${c.accent};--es-deep:${c.deep};--es-on-accent:${c.onAccent};--es-on-deep:${c.onDeep};--es-accent-ink:${c.accentInk};`
    + `--es-heading:'${catalogFont(headingFont).family}',Georgia,serif;--es-body:'${catalogFont(bodyFont).family}',system-ui,sans-serif;`
    // 34 templates (2026-10-31): a theme's third font (eyebrows, labels); the body font when the pair has none.
    + `--es-mono:${monoFont ? `'${catalogFont(monoFont).family}',ui-monospace,monospace` : 'var(--es-body)'};`
    + titleVars(titles?.colours?.length ? titles.colours : [c.accentInk, c.ink])
    + (titleFont ? `--es-title-font:'${catalogFont(titleFont).family}',var(--es-heading);` : '')
    + `--store-background:var(--es-paper);--store-foreground:var(--es-ink);--store-accent:var(--es-accent);--store-accent-foreground:var(--es-on-accent);`
    // Sort & filter styles spec 2026-10-21: kit pages (checkout fallback, info pages) read these, so they show the store's fonts.
    + `--store-heading-font:var(--es-heading);--store-body-font:var(--es-body)}`;
  return [MASTER_THEME_START, face(headingFont), bodyFont !== headingFont ? face(bodyFont) : '', monoFont && monoFont !== headingFont && monoFont !== bodyFont ? face(monoFont) : '',
    titleFont && titleFont !== headingFont && titleFont !== bodyFont && titleFont !== monoFont ? face(titleFont) : '', vars, MASTER_THEME_END].filter(Boolean).join('\n');
}

export function masterThemeCss(settings: MasterSettings, look: MasterLook, titleStyle?: string): string {
  const pair = settings.fonts.find(f => f.id === look.fonts) ?? settings.fonts[0];
  const c = masterColours(settings, look);
  const block = masterThemeBlock({ paper: c.paper, ink: c.ink, muted: c.muted, accent: c.accent, deep: c.deep }, pair.heading, pair.body, (pair as { mono?: string }).mono, { colours: look.titles, style: titleStyle });
  // Inside the block, so every refill redraws the part colours from the look.
  const parts = masterPartsCss(look.parts);
  return parts ? block.replace(MASTER_THEME_END, `${parts}\n${MASTER_THEME_END}`) : block;
}

/** 34 templates (2026-10-31): the template stylesheet carries every theme between «/* theme:id *\/» and «/* /theme:id *\/»; a store
 *  keeps only its own theme's block, so it never ships the other themes' rules or fonts. */
export function withOnlyTheme(css: string, theme: string | undefined, sections?: ReadonlySet<string>, choices?: Record<string, unknown>): string {
  const themed = css.replace(/\/\* theme:([a-z0-9-]+) \*\/[\s\S]*?\/\* \/theme:\1 \*\//g, (block, id: string) => id === theme ? block : '');
  // Template sections' CSS (live check 2026-10-31: the stylesheet passed the 180 kB file limit): a block tagged «lb:ids» stays only
  // when the store's home uses one of those sections. Without a list (an older caller) every block stays.
  if (!sections) return themed;
  // Product pages (owner 2026-10-31) keep their sections' CSS too, which brought Palo Alto back to the limit: the notes written for
  // developers go as well (every comment but the pagosya/theme/lb/v markers that later edits look for).
  const pruned = themed.replace(/\/\* lb:([a-z0-9,-]+) \*\/[\s\S]*?\/\* \/lb:\1 \*\//g, (block, ids: string) => ids.split(',').some(id => sections.has(id)) ? block : '')
    .replace(NOTE, '');
  return choices ? withOnlyVariants(pruned, choices) : pruned;
}

/** Every comment but the markers later edits and refills look for. */
const NOTE = /\/\*(?! ?\/?(?:theme|lb|v):| ?pagosya)[\s\S]*?\*\//g;
const VARIANT_BLOCK = /\/\* v:([a-z]+)=([a-z0-9-]+) \*\/[\s\S]*?\/\* \/v:\1=\2 \*\//g;
const emptyVariant = (part: string, value: string) => `/* v:${part}=${value} *//* /v:${part}=${value} */`;
// Hand-made styles (2026-11-10): their own product sections carry the store's card too.
const PRODUCT_SECTIONS = ['products-grid', 'products-tabs', 'products-slider', 'products-rows', 'products-words'];

/** Template frame variety (spec 2026-11-03): the template sheet carries every footer, button, library card and product page between
 *  «/* v:part=value *\/» markers; a store keeps the blocks of the ones it uses and an empty marker for the rest, so a refill that
 *  changes one can fill it back in place (refreshVariantBlocks). A part the store has no value for uses its default, which has no block. */
export function withOnlyVariants(css: string, choices: Record<string, unknown>): string {
  return css.replace(VARIANT_BLOCK, (block, part: string, value: string) => String(choices[part] ?? '') === value ? block : emptyVariant(part, value));
}

/** What a store's variant blocks follow: its footer, button and product-page variants, and the library card of its first products
 *  section (the card every page draws, see esencial libraryCard). */
export function frameChoices(variants: Record<string, unknown>, layout: readonly { type?: unknown; card?: unknown }[]): Record<string, string> {
  const pick = (part: string) => typeof variants[part] === 'string' ? { [part]: variants[part] as string } : {};
  const card = layout.find(block => PRODUCT_SECTIONS.includes(String(block.type)))?.card;
  return { ...pick('footer'), ...pick('button'), ...pick('pdp'), lbcard: typeof card === 'string' && card ? card : 'classic' };
}

/** A refill (the merchant or YAPI changed a variant, or a template update): every marker the store's sheet carries takes the
 *  template's current block when it is chosen and stays empty otherwise; a chosen block an older store never had goes in before
 *  its theme block (theme rules still win on order). */
export function refreshVariantBlocks(sheet: string, source: string, choices: Record<string, unknown>): string {
  const latest = new Map<string, string>();
  for (const match of source.matchAll(VARIANT_BLOCK)) latest.set(`${match[1]}=${match[2]}`, match[0].replace(NOTE, ''));
  const present = new Set<string>();
  let out = sheet.replace(VARIANT_BLOCK, (block, part: string, value: string) => {
    present.add(`${part}=${value}`);
    return String(choices[part] ?? '') === value ? latest.get(`${part}=${value}`) ?? block : emptyVariant(part, value);
  });
  const missing = Object.entries(choices).map(([part, value]) => latest.get(`${part}=${value}`) && !present.has(`${part}=${value}`) ? latest.get(`${part}=${value}`)! : '').filter(Boolean);
  if (missing.length) {
    const at = out.indexOf('/* theme:');
    out = at < 0 ? `${out}\n${missing.join('\n')}` : `${out.slice(0, at)}${missing.join('\n')}\n${out.slice(at)}`;
  }
  return out;
}

/** Template quick edits (spec 2026-11-01 §2): a theme paints its accent as a fixed hex, so the store's accent never showed. In the
 *  store's own theme block the preset accent becomes var(--es-accent), and a fixed text colour in a rule drawn on the accent (its
 *  background, or an accent band) becomes var(--es-on-accent). Until the accent changes the page looks the same. Idempotent; a
 *  theme whose accent is also its paper, ink or deep is left alone (the hex would not say which one it means). */
export function bindThemeAccent(css: string, theme: string, preset: Partial<Record<MasterColour, string>>): string {
  const accent = String(preset.accent ?? '').toLowerCase();
  if (!HEX.test(accent) || (['paper', 'ink', 'deep'] as const).some(name => String(preset[name] ?? '').toLowerCase() === accent)) return css;
  const start = css.indexOf(`/* theme:${theme} */`);
  const end = css.indexOf(`/* /theme:${theme} */`);
  if (start < 0 || end < start) return css;
  const short = accent[1] === accent[2] && accent[3] === accent[4] && accent[5] === accent[6] ? `|#${accent[1]}${accent[3]}${accent[5]}` : '';
  const hex = new RegExp(`(?:${accent}${short})(?![0-9a-f])`, 'gi');
  // Sections the kit itself paints on the accent («.lb-cover-ribbon{background:var(--es-base-accent)…}»): a theme's fixed white or
  // black words in them follow the store's text-on-accent too (Miga Dorada 2026-11-02: Gumdrop's white title on a mustard accent).
  const accentSections = [...css.matchAll(/(?:^|\})\s*\.([a-z0-9_-]+)\s*\{[^{}]*background:\s*var\(--es-base-accent/gi)].map(match => match[1]);
  const inAccentSection = (selector: string) => accentSections.some(name => new RegExp(`\\.${name}(?![a-z0-9_-])`, 'i').test(selector));
  const NEUTRAL = /#(?:f{3}|f{6}|e{6}|0{3}|0{6}|1{3}|1{6}|2{6})(?![0-9a-f])/i;
  const block = css.slice(start, end).replace(hex, 'var(--es-accent)')
    .replace(/([^{}]*)\{([^{}]*)\}/g, (rule, selector: string, body: string) => {
      // Inside an accent band the band redraws --es-on-accent as the accent itself (DooBoo 2026-11-02: maroon words on the maroon
      // cover), so a rule in the band takes the store's own text-on-accent, --es-base-on-accent; an earlier binding is corrected.
      const section = inAccentSection(selector);
      if (section) body = body.replace(new RegExp(`(^|;)(\\s*)(color|--es-ink):\\s*${NEUTRAL.source}`, 'gi'), '$1$2$3:var(--es-base-on-accent)');
      const band = /band="accent"/.test(selector);
      if (band || section) body = body.replace(/(^|;)(\s*)color:\s*var\(--es-on-accent\)/g, '$1$2color:var(--es-base-on-accent)');
      const onAccent = band || /background(?:-color)?:[^;]*--es-accent\)/.test(body);
      return onAccent ? `${selector}{${body.replace(/(^|;)(\s*)color:\s*#[0-9a-f]{3,8}(?![0-9a-f])/gi, `$1$2color:var(${band ? '--es-base-on-accent' : '--es-on-accent'})`)}}` : `${selector}{${body}}`;
    });
  return css.slice(0, start) + block + css.slice(end);
}

/** On a template the theme is drawn for its own paper, ink and deep, so a look change takes only the accent: the one the merchant
 *  named, or, when only the palette changed, that palette's accent. */
export function templateLook(settings: MasterSettings, current: MasterLook, change: Partial<MasterLook>): MasterLook {
  const before = masterLook(settings, current);
  const after = masterLook(settings, { ...before, ...change });
  const asked = String(change.colors?.accent ?? '').toLowerCase();
  const palette = after.palette !== before.palette ? settings.palettes.find(p => p.id === after.palette) : undefined;
  const accent = HEX.test(asked) && asked !== before.colors.accent ? asked : palette ? palette.accent.toLowerCase() : before.colors.accent;
  const parts = mergeLookParts(before.parts, change.parts);
  return { palette: after.palette, fonts: after.fonts, colors: { ...before.colors, ...(accent ? { accent } : {}) }, ...(change.titles ? { titles: after.titles } : before.titles ? { titles: before.titles } : {}),
    ...(Object.keys(parts).length ? { parts } : {}) };
}

export function withMasterTheme(css: string, block: string): string {
  const start = css.indexOf(MASTER_THEME_START);
  const end = css.indexOf(MASTER_THEME_END);
  if (start !== -1 && end > start) return css.slice(0, start) + block + css.slice(end + MASTER_THEME_END.length);
  return `${block}\n${css}`;
}

/** The rolled button shape and corners, as the kit's DNA, so kit-drawn parts (cart, checkout, product buy box) match. */
const DNA_BUTTON: Record<string, string> = { pill: 'pill', soft: 'block', square: 'block', underline: 'underline', dashed: 'block',
  // Template frame variety (2026-11-03): the button looks copied from real stores, as the kit's nearest shape.
  lift: 'block', sticker: 'sticker', block: 'block', caps: 'outline', rounded: 'block', cushion: 'block', chunky: 'block' };
const DNA_RADIUS: Record<string, string> = { round: 'round', soft: 'soft', sharp: 'none' };
/** Template frame variety (2026-11-03): the product pages that show every photo at once tell the kit how to lay them out. */
const DNA_GALLERY: Record<string, string> = { 'grid-2': 'mosaic', stacked: 'stack', strip: 'strip' };
export function masterDnaLook(variants: Partial<MasterVariants> | undefined): Record<string, string> {
  const button = DNA_BUTTON[String(variants?.button)];
  const radius = DNA_RADIUS[String(variants?.corners)];
  const gallery = DNA_GALLERY[String(variants?.pdp)];
  // Lively one-product stores (spec 2026-11-03): Único's buttons lift on hover and squash on press, like nubecorp's.
  const lively: Record<string, string> = variants?.theme === 'unico' ? { hover: 'lift', press: 'squash' } : {};
  return { ...(button ? { button } : {}), ...(radius ? { radius } : {}), ...(gallery ? { gallery } : {}), ...lively };
}

/** Showcase commerce: the rolled card design and offer-square layout, read by the kit from config.showcase. */
export function masterShowcase(variants: Partial<MasterVariants> | undefined): { cards?: string; offers?: string } {
  const cards = ['showcase', 'compact', 'split', 'fashion'].includes(String(variants?.cards)) ? String(variants!.cards) : undefined;
  const offers = ['steps', 'grid', 'rows'].includes(String(variants?.offers)) ? String(variants!.offers) : undefined;
  return { ...(cards ? { cards } : {}), ...(offers ? { offers } : {}) };
}

/** Sort & filter styles spec 2026-10-21: the rolled filters variant, read by the kit from config.filterStyle. */
export function masterFilterStyle(variants: Partial<MasterVariants> | undefined): { filterStyle?: 'bar' | 'chips' | 'sidebar' | 'browse' } {
  const style = String(variants?.filters);
  return style === 'bar' || style === 'chips' || style === 'sidebar' || style === 'browse' ? { filterStyle: style } : {};
}

/** Fashion look spec 2026-10-21: the fashion product page is a kit style, read by the kit from config.productPageStyle. */
export function masterProductStyle(variants: Partial<MasterVariants> | undefined): { productPageStyle?: 'fashion' } {
  return variants?.pdp === 'fashion' ? { productPageStyle: 'fashion' } : {};
}

export function masterDnaFonts(settings: MasterSettings, look: MasterLook) {
  const pair = settings.fonts.find(f => f.id === look.fonts) ?? settings.fonts[0];
  return { display: pair.heading, text: pair.body };
}

/** What the fill call returns (spec 2026-10-19 §2.3): every copy field, the look, photo indexes (-1 = none) and, for an
 *  edit, the field names it changed ('look' = palette/fonts/colors; heroPhoto and storyPhoto each by name). */
export type MasterRead = MasterCopy & { palette: string; fonts: string; colors: Record<MasterColour, string>; heroPhoto: number; storyPhoto: number; changed: string[];
  tone?: 'calm' | 'bold'; kind?: 'fashion' | 'other'; temperature?: 'warm' | 'cool' | 'neutral'; lead?: 'photo' | 'text'; exclude?: string[]; sections?: MasterSection[];
  /** A layout the merchant named in an edit («hero con la foto a la izquierda» → hero: split-left). */
  variantChoices?: Array<{ part: string; id: string }>;
  /** Dropdown menu spec 2026-10-21: the menu style and the groups YAPI wrote ([] = built from the categories). */
  menuStyle?: 'none' | 'panel' | 'dropdowns';
  menuGroups?: Array<{ label: string; links: Array<{ label: string; target: string }>; tilesTitle: string; tiles: Array<{ title: string; photo: number; target: string }>; footerLabel: string; footerTarget: string }>;
  featureCopy?: FeatureCopy };
const COPY_FIELDS = [...Object.keys(MASTER_COPY_CAPS), 'values'];

export function masterFillFromRead(read: MasterRead, photos: readonly string[], edit: boolean): MasterFill {
  const keep = (field: string) => !edit || read.changed.includes(field);
  const copy = Object.fromEntries(COPY_FIELDS.filter(keep).map(field => [field, (read as unknown as Record<string, unknown>)[field]])) as Partial<MasterCopy>;
  const colors = Object.fromEntries(MASTER_COLOURS.filter(key => read.colors?.[key]).map(key => [key, read.colors[key]]));
  const photo = (index: number) => Number.isInteger(index) && index >= 0 && index < photos.length ? photos[index] : null;
  return {
    ...(Object.keys(copy).length ? { copy } : {}),
    ...(keep('look') ? { look: { palette: read.palette, fonts: read.fonts, colors } } : {}),
    ...(read.tone ? { character: { tone: read.tone, temperature: read.temperature ?? 'neutral', lead: read.lead ?? 'photo', exclude: Array.isArray(read.exclude) ? read.exclude : [], ...(read.kind ? { kind: read.kind } : {}) } } : {}),
    ...(Array.isArray(read.sections) && keep('sections') ? { sections: read.sections.slice(0, 6) } : {}),
    ...(Array.isArray(read.variantChoices) && read.variantChoices.length && keep('variants') ? { variants: Object.fromEntries(read.variantChoices.map(choice => [choice.part, choice.id])) } : {}),
    ...(read.featureCopy && keep('features') ? { featureCopy: read.featureCopy } : {}),
    ...(read.menuStyle && keep('menu') ? { menu: { style: read.menuStyle, groups: menuGroupsFromRead(read.menuGroups, photos) } } : {}),
    ...(keep('heroPhoto') ? { heroPhoto: photo(read.heroPhoto) } : {}),
    ...(keep('storyPhoto') ? { storyPhoto: photo(read.storyPhoto) } : {}),
  };
}

/** Dropdown menu spec 2026-10-21: the fill read's groups as the menu config; a tile's photo index becomes that photo. Labels
 *  left empty take the target's own name at the save check. */
export function menuGroupsFromRead(groups: MasterRead['menuGroups'], photos: readonly string[]): StoreMenuGroup[] {
  return (groups ?? []).map(group => {
    const tiles = group.tiles.flatMap(tile => Number.isInteger(tile.photo) && tile.photo >= 0 && tile.photo < photos.length ? [{ title: tile.title, image: photos[tile.photo], to: tile.target }] : []);
    return {
      label: group.label,
      links: group.links.map(link => ({ ...(link.label ? { label: link.label } : {}), to: link.target })),
      ...(tiles.length ? { ...(group.tilesTitle ? { tilesTitle: group.tilesTitle } : {}), tiles } : {}),
      ...(group.footerTarget ? { footer: { label: group.footerLabel, to: group.footerTarget } } : {}),
    };
  });
}

/** Variety spec §2–3: the rolled variant per part (header, hero, grid…) plus the chosen business sections. */
export type MasterVariants = Record<string, string> & { sections: string[] };
/** What the fill call says about the business; the dice choose within it. */
export type MasterCharacter = { tone: 'calm' | 'bold'; temperature: 'warm' | 'cool' | 'neutral'; lead: 'photo' | 'text'; exclude: string[]; kind?: 'fashion' | 'other' };
export type MasterSection = { id: string; title: string; items: Array<{ title: string; text: string }> };
