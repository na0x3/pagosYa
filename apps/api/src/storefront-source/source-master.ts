/** Spec 2026-10-19 master template: the copy, look and theme a master template (manifest.master) is filled with.
 *  Pure; the template apply and the content edits (source-templates.ts) both use it. */
import type { MasterCopy, MasterSettings } from '@pagosya/store-templates';
import { SOURCE_FONT_CATALOG } from './source-font-catalog';
import { bestInkFor, contrastRatio } from './sketch/sketch-schema';
import type { StoreMenuGroup } from './source-store-menu';
import type { FeatureCopy } from './source-master-features';

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
export type MasterLook = { palette: string; fonts: string; colors: Partial<Record<MasterColour, string>> };
export type MasterFill = { copy?: Partial<MasterCopy>; look?: Partial<MasterLook>; heroPhoto?: string | null; storyPhoto?: string | null;
  /** Owner 2026-10-25: a video the merchant attached, played as the cover (store-data photos.heroVideo). */
  heroVideo?: string;
  /** Owner 2026-10-27: the merchant asked for an animated store (source-master-animated.ts). */
  animated?: boolean;
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
  return { palette, fonts, colors };
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
  const ink = contrastRatio(merged.paper, merged.ink) >= 4.5 ? merged.ink : bestInkFor(merged.paper, merged.ink);
  // The footer, empty cart and hovers put ink on muted: a muted the ink cannot be read on becomes a tint of the paper.
  const muted = contrastRatio(merged.muted, ink) >= 4.5 ? merged.muted : mixHex(merged.paper, ink, 0.06);
  return { ...merged, ink, muted, onAccent: bestInkFor(merged.accent, '#ffffff'), onDeep: bestInkFor(merged.deep, '#ffffff') };
}

const catalogFont = (id: string) => {
  const font = SOURCE_FONT_CATALOG.find(entry => entry.id === id);
  if (!font) throw new TypeError(`La fuente ${id} no está en el catálogo de pagosYa.`);
  return font;
};
const face = (id: string) => { const font = catalogFont(id); return `@font-face{font-family:'${font.family}';src:url(assets/${font.id}.ttf) format('truetype');font-weight:${font.weights.replace('–', ' ')};font-display:swap}`; };

export function masterThemeCss(settings: MasterSettings, look: MasterLook): string {
  const pair = settings.fonts.find(f => f.id === look.fonts) ?? settings.fonts[0];
  const c = masterColours(settings, look);
  const vars = `:root{--es-paper:${c.paper};--es-ink:${c.ink};--es-muted:${c.muted};--es-accent:${c.accent};--es-deep:${c.deep};--es-on-accent:${c.onAccent};--es-on-deep:${c.onDeep};`
    + `--es-heading:'${catalogFont(pair.heading).family}',Georgia,serif;--es-body:'${catalogFont(pair.body).family}',system-ui,sans-serif;`
    + `--store-background:var(--es-paper);--store-foreground:var(--es-ink);--store-accent:var(--es-accent);--store-accent-foreground:var(--es-on-accent);`
    // Sort & filter styles spec 2026-10-21: kit pages (checkout fallback, info pages) read these, so they show the store's fonts.
    + `--store-heading-font:var(--es-heading);--store-body-font:var(--es-body)}`;
  return [MASTER_THEME_START, face(pair.heading), pair.body !== pair.heading ? face(pair.body) : '', vars, MASTER_THEME_END].filter(Boolean).join('\n');
}

export function withMasterTheme(css: string, block: string): string {
  const start = css.indexOf(MASTER_THEME_START);
  const end = css.indexOf(MASTER_THEME_END);
  if (start !== -1 && end > start) return css.slice(0, start) + block + css.slice(end + MASTER_THEME_END.length);
  return `${block}\n${css}`;
}

/** The rolled button shape and corners, as the kit's DNA, so kit-drawn parts (cart, checkout, product buy box) match. */
const DNA_BUTTON: Record<string, string> = { pill: 'pill', soft: 'block', square: 'block', underline: 'underline', dashed: 'block' };
const DNA_RADIUS: Record<string, string> = { round: 'round', soft: 'soft', sharp: 'none' };
export function masterDnaLook(variants: Partial<MasterVariants> | undefined): Record<string, string> {
  const button = DNA_BUTTON[String(variants?.button)];
  const radius = DNA_RADIUS[String(variants?.corners)];
  return { ...(button ? { button } : {}), ...(radius ? { radius } : {}) };
}

/** Showcase commerce: the rolled card design and offer-square layout, read by the kit from config.showcase. */
export function masterShowcase(variants: Partial<MasterVariants> | undefined): { cards?: string; offers?: string } {
  const cards = ['showcase', 'compact', 'split', 'fashion'].includes(String(variants?.cards)) ? String(variants!.cards) : undefined;
  const offers = ['steps', 'grid', 'rows'].includes(String(variants?.offers)) ? String(variants!.offers) : undefined;
  return { ...(cards ? { cards } : {}), ...(offers ? { offers } : {}) };
}

/** Sort & filter styles spec 2026-10-21: the rolled filters variant, read by the kit from config.filterStyle. */
export function masterFilterStyle(variants: Partial<MasterVariants> | undefined): { filterStyle?: 'bar' | 'chips' | 'sidebar' } {
  const style = String(variants?.filters);
  return style === 'bar' || style === 'chips' || style === 'sidebar' ? { filterStyle: style } : {};
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
    ...(Array.isArray(read.sections) && keep('sections') ? { sections: read.sections.slice(0, 4) } : {}),
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
