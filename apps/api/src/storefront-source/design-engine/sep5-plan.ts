import { SECTION_COMPOSITIONS } from '@pagosya/shared-types';
import { creativePlanSchema, type CreativePlan } from './design-schemas';
import { chroma, type Sep5Extraction } from './sep5-extract';

/**
 * Turns a Sep-5 extraction into a creative plan the design engine can render.
 *
 * This is the lossy seam between the two generators, so every decision Sep-5
 * made that the plan cannot hold is returned in `losses` rather than quietly
 * discarded. The caller decides whether a loss is acceptable; this module only
 * refuses to hide one.
 */
export type Sep5Translation = { plan: CreativePlan; losses: string[] };

/** The engine's own stage pins composition eligibility; these are the openings. */
const DEFAULT_COMPOSITION: Record<string, string> = {
  catalog: 'grid', story: 'split', steps: 'list', banner: 'statement', faq: 'list',
  gallery: 'rail', collections: 'grid', reviews: 'grid', newsletter: 'center',
  footer: 'columns', split: 'split', announce: 'strip', marquee: 'strip',
};

/**
 * Sep-5 cannot load a web font, so Georgia and Arial Narrow are the only two
 * voices it has. Reading them as intent rather than as literal faces is the one
 * place the translation gains something: the engine answers with a real face.
 */
function chooseFonts(extraction: Sep5Extraction): { display: string; text: string } {
  if (extraction.displayIsCondensed) return { display: 'oswald', text: 'newsreader' };
  if (!extraction.displayIsSerif) return { display: 'bricolage', text: 'newsreader' };
  const energy = chroma(extraction.palette.accent);
  // A saturated palette carries a characterful serif; a quiet one wants the
  // high-contrast editorial face instead.
  const display = energy > 0.6 ? 'fraunces' : energy > 0.35 ? 'instrument-serif' : 'playfair-display';
  return { display, text: 'instrument' };
}

/**
 * Nine Sep-5 stores all reach for a serif, so serif-versus-sans alone collapses
 * every store onto one art direction — the exact sameness this translation is
 * meant to undo. These signals were measured across the corpus because they
 * actually vary: zero-blur shadows on four of nine, uppercase density 0–21,
 * corner radii from none through pill.
 */
function chooseStyle(x: Sep5Extraction): CreativePlan['artDirection']['style'] {
  if (x.hardShadow && x.cornerStyle !== 'square') return 'playful';
  if (x.hardShadow && x.uppercaseCount >= 15) return 'retro';
  if (x.hardShadow) return 'bold-commerce';
  // A condensed poster face states a louder intent than a rounded corner does.
  if (x.displayIsCondensed) return 'bold-commerce';
  if (x.cornerStyle === 'round') return x.uppercaseCount <= 2 ? 'luxury' : 'organic';
  return x.uppercaseCount >= 10 ? 'editorial' : 'minimal';
}
const NAVIGATION: Record<string, CreativePlan['navigation']> = {
  retro: 'minimal', 'bold-commerce': 'minimal', editorial: 'editorial',
  luxury: 'centered', organic: 'transparent', playful: 'centered', minimal: 'minimal',
};

export function sep5CreativePlan(extraction: Sep5Extraction): Sep5Translation {
  const losses = [...extraction.losses];

  const mapped = extraction.sections.filter(section => {
    if (section.family && section.family in SECTION_COMPOSITIONS) return true;
    losses.push(`section "${section.name}"${section.heading ? ` (“${section.heading}”)` : ''} has no registry family and was dropped`);
    return false;
  });

  // `plannedStructure` keeps one section per family, so a store that used the
  // same shape twice loses the repeat. Saying which one goes is the point.
  const seen = new Map<string, number>();
  for (const section of mapped) seen.set(section.family!, (seen.get(section.family!) ?? 0) + 1);
  for (const [family, count] of seen) {
    if (count > 1) losses.push(`Sep-5 used ${count} ${family} sections; the engine renders only one per page, so ${count - 1} will be dropped`);
  }

  const sections = mapped.map(section => {
    const type = section.family as keyof typeof SECTION_COMPOSITIONS;
    const composition = type === 'hero'
      ? (extraction.displayIsCondensed ? 'massive-type' : extraction.displayIsSerif ? 'editorial' : 'statement')
      : DEFAULT_COMPOSITION[type] ?? SECTION_COMPOSITIONS[type][0];
    return { type, composition, intent: section.heading || `${type} section carried over from the authored source`, productRefs: [] as string[] };
  });

  // The schema will not accept fewer than three sections. Padding is a repair,
  // not a translation, so it is reported as one.
  const padding: Array<{ type: keyof typeof SECTION_COMPOSITIONS; composition: string; intent: string }> = [
    { type: 'hero' as never, composition: 'statement', intent: 'Brand introduction' },
    { type: 'catalog' as never, composition: 'grid', intent: 'Shop the catalogue' },
    { type: 'footer' as never, composition: 'columns', intent: 'Close the page' },
  ];
  const padded = [...sections];
  for (const candidate of padding) {
    if (padded.length >= 3) break;
    if (padded.some(s => s.type === candidate.type)) continue;
    padded.push({ ...candidate, productRefs: [] as string[] });
    losses.push(`authored source had ${sections.length} usable sections; padded to the schema minimum with a ${candidate.type}`);
  }

  const fonts = chooseFonts(extraction);
  const style = chooseStyle(extraction);
  // The source already chose a headline size; carry its proportion rather than
  // imposing one. Measured h1 maxima run 3.7–4.5rem.
  const displayScale = extraction.displayMaxRem
    ? Math.min(10, Math.max(4, Math.round(extraction.displayMaxRem * 16) / 10))
    : extraction.displayIsCondensed ? 8 : 7;
  const plan = creativePlanSchema.parse({
    artDirection: {
      style, layoutDensity: extraction.uppercaseCount >= 15 ? 'dense' : extraction.cornerStyle === 'round' ? 'airy' : 'balanced', composition: 'editorial', imageTreatment: 'cover',
      typographyTreatment: extraction.displayIsCondensed
        ? 'Condensed poster display over a reading serif'
        : extraction.displayIsSerif ? 'High-contrast serif display over a quiet grotesk' : 'Expressive grotesk display over a reading serif',
      motionLevel: style === 'playful' || style === 'retro' ? 'expressive' : 'subtle', cornerStyle: extraction.cornerStyle,
      sectionRhythm: 'Alternate authored copy moments with product photography, as the source did',
    },
    palette: extraction.palette,
    fonts,
    navigation: NAVIGATION[style] ?? 'minimal',
    displayScale,
    bodyScale: 1.05,
    sections: padded,
  });
  return { plan, losses };
}
