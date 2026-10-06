/**
 * Reads the design decisions back out of a Sep-5 generated project.
 *
 * Sep-5 writes whole HTML/CSS/JS rather than filling a schema, but it writes it
 * consistently: `--ink` and `--paper` are named for their role, every other hue
 * is named for its colour, and sections are named for the job they do. That is
 * enough to recover a palette and a section order without parsing CSS properly.
 *
 * Anything that cannot be placed is returned in `losses`, never dropped quietly
 * — the whole point of translating between two generators is knowing what the
 * narrower side could not carry.
 */

/**
 * A hue must clear both bars to count as colour. Absolute chroma alone calls a
 * deep forest green neutral; HSL saturation alone calls near-white fully
 * saturated. Together they admit #14392f and reject #fff8ee.
 */
const NEUTRAL_CHROMA = 0.08;
const NEUTRAL_SATURATION = 0.25;
/** Below this luminance a hue is reading as a dark field, not as an accent. */
const DARK_FIELD = 0.25;
/** `deep` must sit this far below the accent in luminance to earn its own slot. */
const DEEP_SEPARATION = 0.06;
/** Selectors sized like a control, however often they appear, paint almost nothing. */
const CONTROL_SELECTOR = /button|btn|link|cart|status|badge|pill|chip|add|checkout|nav|icon|label|ribbon|count|price|caption|quantity/;
/** Selectors that cover a band of the page. */
const SURFACE_SELECTOR = /^\s*(?:html|body|:root|main|header|footer|section)\b|hero|section|band|lane|strip|panel|block|last-|callout|note|guide|story|catalog|shop/;
/** Two hues closer than this on the wheel are siblings, so the darker is `deep`. */
const SIBLING_HUE_DEGREES = 40;

const rgb = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
export const chroma = (hex: string) => { const c = rgb(hex); return (Math.max(...c) - Math.min(...c)) / 255; };
function saturation(hex: string): number {
  const c = rgb(hex).map(v => v / 255);
  const max = Math.max(...c), min = Math.min(...c), light = (max + min) / 2;
  if (max === min) return 0;
  return light > 0.5 ? (max - min) / (2 - max - min) : (max - min) / (max + min);
}
const isColour = (hex: string) => chroma(hex) > NEUTRAL_CHROMA && saturation(hex) > NEUTRAL_SATURATION;
/** Mixes toward ink so a store with too few hues still gets a darker `deep`. */
function darken(hex: string, ink: string, amount = 0.45): string {
  const [a, b] = [rgb(hex), rgb(ink)];
  return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * amount).toString(16).padStart(2, '0')).join('');
}
const luminance = (hex: string) => { const [r, g, b] = rgb(hex); return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; };
function hue(hex: string): number {
  const [r, g, b] = rgb(hex).map(v => v / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (!d) return 0;
  const h = max === r ? (g - b) / d % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}
const hueGap = (a: string, b: string) => { const d = Math.abs(hue(a) - hue(b)); return d > 180 ? 360 - d : d; };

/** Sep-5 names a section for its job; the registry names it for its family. */
const FAMILY_KEYWORDS: ReadonlyArray<readonly [RegExp, string]> = [
  [/hero|opening|intro|apertura|portada/, 'hero'],
  [/catalog|catálogo|shop|menu|carta|product/, 'catalog'],
  [/rhythm|guide|step|paso|c[oó]mo|how-|compass|lab|planner|choice|chooser|routine|rutina|elegir|selector/, 'steps'],
  [/story|note|nota|origin|manifesto|about|advice|asesor|method|m[eé]todo|making|process|proceso|place|lugar|sede/, 'story'],
  [/question|faq|pregunta/, 'faq'],
  [/review|testimon|opini/, 'reviews'],
  [/newsletter|suscri|subscribe/, 'newsletter'],
  [/gallery|galer|photo|foto|break|pausa/, 'gallery'],
  [/collection|colecci|categor|season|temporada|feature|destacad/, 'collections'],
  [/call|cta|banner|closing|last|order|pedido|checkout/, 'banner'],
  [/footer|pie/, 'footer'],
];
export function sectionFamily(name: string): string | null {
  const key = name.toLowerCase();
  return FAMILY_KEYWORDS.find(([pattern]) => pattern.test(key))?.[1] ?? null;
}

export type Sep5Palette = { paper: string; ink: string; accent: string; deep: string; pop: string };
export type Sep5Section = { name: string; family: string | null; heading: string | null };
export type Sep5Extraction = {
  palette: Sep5Palette;
  droppedColours: string[];
  headline: string | null;
  sections: Sep5Section[];
  displayIsSerif: boolean;
  /** Sep-5 reaches for Arial Narrow when it wants a poster voice. */
  displayIsCondensed: boolean;
  cornerStyle: 'square' | 'soft' | 'round';
  /** Largest headline size the source set, in rem. */
  displayMaxRem: number | null;
  /** A zero-blur offset shadow is a deliberate poster/brutalist move. */
  hardShadow: boolean;
  /** How loudly the source shouts: uppercase declarations run 0–21 in practice. */
  uppercaseCount: number;
  losses: string[];
};

const text = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() || null;

export function extractSep5(files: ReadonlyArray<{ path: string; content: string }>): Sep5Extraction {
  const css = files.find(f => f.path.endsWith('.css'))?.content ?? '';
  const html = files.find(f => f.path === 'index.html')?.content ?? '';
  const losses: string[] = [];

  // --- palette ---------------------------------------------------------------
  const props = [...css.matchAll(/--([a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{6})\b/g)].map(m => ({ name: m[1], hex: m[2].toLowerCase() }));
  const named = (role: string) => props.find(p => p.name === role)?.hex;
  const byLuminance = [...props].sort((a, b) => luminance(a.hex) - luminance(b.hex));
  const paper = named('paper') ?? byLuminance[byLuminance.length - 1]?.hex ?? '#ffffff';
  const ink = named('ink') ?? byLuminance[0]?.hex ?? '#111111';

  // Painted area decides the accent, and declaration count is a poor proxy for
  // it: a hue named on five buttons covers less of the page than one behind a
  // single hero. Each rule is scored by how much its selector actually covers.
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(m => ({ selector: m[1].toLowerCase(), body: m[2] }));
  // Only the final element of a compound selector says what is being painted:
  // `.hero__visual figcaption` colours a caption, not the hero behind it.
  const painted = (selector: string) => selector.split(',')[0].split(/[\s>+~]+/).filter(Boolean).pop() ?? selector;
  const weight = (name: string) => rules.reduce((score, rule) => {
    if (!rule.body.includes(`var(--${name})`)) return score;
    const target = painted(rule.selector);
    const area = CONTROL_SELECTOR.test(target) ? 1 : SURFACE_SELECTOR.test(target) ? 6 : 3;
    return score + (/background/.test(rule.body) ? area : 1);
  }, 0);
  const candidates = props
    .filter(p => p.hex !== paper && p.hex !== ink && isColour(p.hex))
    .filter((p, i, all) => all.findIndex(o => o.hex === p.hex) === i);

  let accent = ink, deep = ink, pop = ink;
  const dropped: string[] = [];
  if (candidates.length) {
    const ranked = [...candidates].sort((a, b) => weight(b.name) - weight(a.name) || chroma(b.hex) - chroma(a.hex));
    // A near-black green or navy covering the page is Sep-5 using a dark field,
    // not choosing an accent. Promoting the brighter hue keeps the two slots
    // doing different jobs instead of holding two shades of the same colour.
    const field = ranked.length > 1 && luminance(ranked[0].hex) < DARK_FIELD ? ranked[0] : undefined;
    const lead = field ? ranked.find(p => luminance(p.hex) >= DARK_FIELD) ?? ranked[1] : ranked[0];
    accent = lead.hex;
    const rest = ranked.filter(p => p.hex !== lead.hex && p.hex !== field?.hex);
    // `deep` is the accent's darker sibling when there is one, else the darkest
    // hue left that is actually darker. A store with no darker hue gets the
    // accent mixed toward ink rather than a `deep` that reads lighter.
    const darker = rest.filter(p => luminance(accent) - luminance(p.hex) >= DEEP_SEPARATION);
    const siblings = darker.filter(p => hueGap(p.hex, accent) <= SIBLING_HUE_DEGREES);
    const deepFrom = [...(siblings.length ? siblings : darker)].sort((a, b) => luminance(a.hex) - luminance(b.hex))[0];
    deep = field?.hex ?? deepFrom?.hex ?? darken(accent, ink);
    const remaining = rest.filter(p => p.hex !== deep);
    // `pop` is whatever reads furthest from the accent — the contrast hue.
    const popFrom = [...remaining].sort((a, b) => hueGap(b.hex, accent) - hueGap(a.hex, accent) || chroma(b.hex) - chroma(a.hex))[0];
    pop = popFrom?.hex ?? accent;
    if (!popFrom) losses.push(`store offered no third hue, so pop reuses the accent ${accent}`);
    dropped.push(...remaining.filter(p => p.hex !== pop).map(p => p.hex));
  }
  for (const hex of dropped) losses.push(`colour ${hex} has no slot in the five-token palette`);

  // --- sections and copy -----------------------------------------------------
  const sections: Sep5Section[] = [...html.matchAll(/<section[^>]*class="([^"]*)"[^>]*>([\s\S]*?)(?=<section|<\/body|$)/g)].map(match => {
    const name = match[1].trim().split(/\s+/)[0] ?? '';
    const family = sectionFamily(name);
    if (!family) losses.push(`section "${name}" has no registry family and will be dropped`);
    return { name, family, heading: text(match[2].match(/<h[12][^>]*>([\s\S]*?)<\/h[12]>/)?.[1] ?? '') };
  });

  const headline = text(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? '');
  // Sep-5 cannot load web fonts, so a serif display means it reached for the
  // only contrast it had. The engine honours the intent with a real face.
  const displayIsSerif = /(?:h1|\.display|\.hero[^{]*)\{[^}]*font-family:\s*var\(--serif\)/.test(css)
    || /(?:h1|\.display)[^{]*\{[^}]*(?:Georgia|serif)/.test(css);

  // The stack is usually declared on a custom property and referenced later, so
  // look at both the property and any direct font-family.
  const displayIsCondensed = /(?:font-family|--[a-z-]*(?:sans|serif|display|font)[a-z-]*)\s*:[^;]*(?:Narrow|Condensed)/i.test(css);
  // Corner language comes from whatever the source actually rounded, whether it
  // named a --radius property or wrote border-radius directly.
  const radii = [
    ...[...css.matchAll(/(?:--radius|border-radius)\s*:\s*([\d.]+)\s*rem/g)].map(m => Number(m[1])),
    ...[...css.matchAll(/(?:--radius|border-radius)\s*:\s*([\d.]+)\s*px/g)].map(m => Number(m[1]) / 16),
  ].filter(n => n > 0);
  const widest = radii.length ? Math.max(...radii) : 0;
  const cornerStyle = widest === 0 ? 'square' : widest < 1 ? 'soft' : 'round';

  const headlineRules = rules.filter(rule => /\bh1\b/.test(rule.selector));
  const sizes = headlineRules.flatMap(rule => [...rule.body.matchAll(/font-size:[^;]*?([\d.]+)rem/g)].map(m => Number(m[1])));
  const displayMaxRem = sizes.length ? Math.max(...sizes) : null;
  const hardShadow = /box-shadow:[^;]*\b\d+px\s+\d+px\s+0\b/.test(css);
  const uppercaseCount = (css.match(/text-transform:\s*uppercase/g) || []).length;

  return { palette: { paper, ink, accent, deep, pop }, droppedColours: dropped, headline, sections, displayIsSerif, displayIsCondensed, cornerStyle, displayMaxRem, hardShadow, uppercaseCount, losses };
}
