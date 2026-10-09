import postcss, { type AtRule, type Declaration, type Rule } from 'postcss';

/** Guarded CSS for the product page (theme plan, D3). A store's product theme may restyle the COSMETIC parts of the
 * page and nothing else: every selector must be a `[data-part=…]` compound, every declaration must pass an allowlist
 * with numeric bounds, and the output is scoped to the product page by construction. Price, stock, option state, the
 * buy button and the pagosYa seal are never selectable. Anything not explicitly allowed is dropped and reported;
 * input that is too large or unparsable produces nothing (fail closed). */
export const COSMETIC_PARTS = ['gallery', 'stage', 'thumbs', 'thumb', 'swatch', 'title', 'eyebrow', 'intro', 'highlights', 'blocks', 'block', 'block-media', 'block-compare', 'frame', 'decor-a', 'decor-b'] as const;
export type ThemeCssReport = { css: string; dropped: Array<{ rule?: string; declaration?: string; reason: string }> };

const MAX_CHARS = 3000, MAX_RULES = 40, MAX_DECLARATIONS = 200, MAX_COMPOUNDS = 3, MAX_KEYFRAME_STEPS = 10;
const SCOPE = '[data-pagosya-product][data-style] ';
/** Idempotence: stored designs are normalized again on every load, so the sanitizer accepts its own output
 * (the scope prefix on selectors, the pt- prefix on keyframes) and returns it unchanged. */
const withoutScope = (text: string) => text.split(active.scope).join('');
const keyframeName = (name: string) => name.startsWith(active.keyframePrefix) ? name : `${active.keyframePrefix}${name}`;
/** Parts that are boxes the theme may size (width/height). Text parts keep the kit's sizing. */
const SIZED_PARTS = new Set(['swatch', 'thumb', 'thumbs', 'frame', 'decor-a', 'decor-b', 'block', 'block-media', 'block-compare', 'blocks', 'gallery', 'stage']);
/** What one kind of page may restyle: its parts, the scope every selector is prefixed with, the parts that may be sized,
 * the keyframes prefix, the variables values may read, and parts whose declarations a page refuses outright. */
export type ThemeCssProfile = { parts: readonly string[]; sizedParts: readonly string[]; scope: string; keyframePrefix: string; variables: RegExp; variableHint: string; refuse?: (part: string, property: string) => boolean };
type ActiveProfile = ThemeCssProfile & { sized: Set<string>; compound: RegExp };
const activate = (profile: ThemeCssProfile): ActiveProfile => ({ ...profile, sized: new Set(profile.sizedParts), compound: compoundFor(profile.parts) });

class Reject extends Error {}
type Ctx = { parts: string[]; pseudo: boolean; decor: boolean; motion: 'none' | 'reduce' | 'no-preference'; keyframes: Set<string> };
type Validator = (value: string, ctx: Ctx) => string;

// ---- tokens and numbers ---------------------------------------------------------------------------------------------
function split(value: string, separator: ',' | ' '): string[] {
  const out: string[] = [];
  let depth = 0, current = '';
  for (const ch of value.trim()) {
    if (ch === '(' || ch === '[') depth++;
    if (ch === ')' || ch === ']') depth--;
    if (depth === 0 && (separator === ',' ? ch === ',' : /\s/.test(ch))) { if (current.trim()) out.push(current.trim()); current = ''; continue; }
    current += ch;
  }
  if (current.trim()) out.push(current.trim());
  return out;
}
const LENGTH = /^(-?(?:\d+\.?\d*|\.\d+))(px|rem|em|%|vw|vh|deg|ms|s)?$/i;
const parseLength = (token: string) => { const m = token.match(LENGTH); return m ? { n: parseFloat(m[1]), unit: (m[2] ?? '').toLowerCase() } : null; };
/** A length in pixels (rem/em count 16px); unitless 0 is allowed. */
const px = (token: string): number | null => {
  const l = parseLength(token);
  if (!l) return null;
  if (l.unit === 'px' || (l.unit === '' && l.n === 0)) return l.n;
  return l.unit === 'rem' || l.unit === 'em' ? l.n * 16 : null;
};
const inPx = (token: string, min: number, max: number) => { const n = px(token); return n !== null && n >= min && n <= max; };
const pct = (token: string, min: number, max: number) => { const l = parseLength(token); return !!l && l.unit === '%' && l.n >= min && l.n <= max; };
const timeMs = (token: string): number | null => { const m = token.match(/^(\d*\.?\d+)(ms|s)$/i); return m ? parseFloat(m[1]) * (m[2].toLowerCase() === 's' ? 1000 : 1) : null; };
const number = (token: string): number | null => (/^-?(?:\d+\.?\d*|\.\d+)$/.test(token) ? parseFloat(token) : null);
const VAR = /^var\(\s*--(?:pd|store|brand|pt)-[a-z0-9-]+\s*(?:,\s*[#\w.%\s-]+)?\)$/i;
const isColour = (t: string) => /^#[0-9a-f]{3,8}$/i.test(t) || /^(?:transparent|currentcolor)$/i.test(t) || /^[a-z]{3,20}$/i.test(t) || /^(?:rgb|rgba|hsl|hsla)\([\d.\s,%/-]+\)$/i.test(t) || VAR.test(t);

// ---- validators -------------------------------------------------------------------------------------------------------
const fail = (reason: string): never => { throw new Reject(reason); };
const each = (value: string, separator: ',' | ' ', check: (token: string) => boolean, what: string, max = 8) => {
  const tokens = split(value, separator);
  if (!tokens.length || tokens.length > max) fail(`expected ${what}`);
  for (const token of tokens) if (!check(token)) fail(`'${token}' is not allowed here (${what})`);
  return value;
};
const enumOf = (...values: string[]): Validator => value => values.includes(value.trim().toLowerCase()) ? value.trim().toLowerCase() : fail(`only ${values.join(' | ')} are allowed`);
const colour: Validator = value => isColour(value.trim()) ? value.trim() : fail('expected a colour (hex, rgb, hsl, name or a store variable)');
const lengths = (min: number, max: number, what: string): Validator => value => each(value, ' ', t => inPx(t, min, max), `${what}: 1-4 lengths from ${min}px to ${max}px`, 4);
const gradient = (value: string) => /^(?:linear|radial|conic)-gradient\([\w\s.,%#()/-]+\)$/i.test(value.trim());
const backgroundImage: Validator = value => value.trim().toLowerCase() === 'none' || gradient(value) ? value.trim() : fail('only gradients are allowed as a background image');
const background: Validator = value => gradient(value) || isColour(value.trim()) ? value.trim() : fail('a background may be a colour or a gradient');
const BORDER_STYLES = new Set(['solid', 'dashed', 'dotted', 'double', 'none']);
const borderShorthand: Validator = value => each(value, ' ', t => BORDER_STYLES.has(t.toLowerCase()) || isColour(t) || inPx(t, 0, 8), 'border: width 0-8px, solid|dashed|dotted|double|none, colour', 3);
const opacity: Validator = value => {
  const l = parseLength(value.trim());
  const n = l ? (l.unit === '%' ? l.n / 100 : l.unit === '' ? l.n : NaN) : NaN;
  return n >= 0.6 && n <= 1 ? value.trim() : fail('opacity must be between 0.6 and 1');
};
const shadow: Validator = value => {
  if (value.trim().toLowerCase() === 'none') return 'none';
  const layers = split(value, ',');
  if (!layers.length || layers.length > 4) fail('use up to 4 shadow layers');
  for (const layer of layers) {
    const tokens = split(layer, ' ');
    const lens = tokens.filter(t => parseLength(t));
    const rest = tokens.filter(t => !parseLength(t));
    if (lens.length < 2 || lens.length > 4 || lens.some(t => !inPx(t, -60, 60))) fail('shadow lengths must be 2-4 values between -60px and 60px');
    if (rest.some(t => t.toLowerCase() !== 'inset' && !isColour(t))) fail('shadow may only add a colour or inset');
    if (rest.filter(t => t.toLowerCase() !== 'inset').length > 1) fail('shadow takes one colour');
  }
  return value.trim();
};
const transform: Validator = value => {
  if (value.trim().toLowerCase() === 'none') return 'none';
  return each(value, ' ', t => {
    const m = t.match(/^(translate|translatex|translatey|scale|scalex|scaley|rotate|skew|skewx|skewy)\(([^()]*)\)$/i);
    if (!m) return false;
    const name = m[1].toLowerCase(), args = m[2].split(',').map(a => a.trim());
    if (!args.length || args.length > 2 || args.some(a => !a)) return false;
    if (name.startsWith('translate')) return args.every(a => inPx(a, -48, 48) || pct(a, -50, 50));
    if (name.startsWith('scale')) return args.every(a => { const n = number(a); return n !== null && n >= 0.8 && n <= 1.25; });
    const limit = name === 'rotate' ? 12 : 8;
    return args.every(a => { const l = parseLength(a); return !!l && l.unit === 'deg' && Math.abs(l.n) <= limit; });
  }, 'transform: translate ≤48px, scale 0.8-1.25, rotate ≤12deg, skew ≤8deg', 4);
};
const TIMING = /^(?:ease|linear|ease-in|ease-out|ease-in-out|cubic-bezier\(\s*-?[\d.]+\s*(?:,\s*-?[\d.]+\s*){3}\))$/i;
const TRANSITION_PROPS = new Set(['all', 'opacity', 'transform', 'color', 'background-color', 'border-color', 'box-shadow', 'filter', 'outline-color', 'text-decoration-color', 'clip-path']);
const okTime = (t: string) => { const ms = timeMs(t); return ms !== null && ms <= 1500; };
const transition: Validator = value => {
  for (const item of split(value, ',')) each(item, ' ', t => okTime(t) || TIMING.test(t) || TRANSITION_PROPS.has(t.toLowerCase()) || t.toLowerCase() === 'none', 'transition: property, duration ≤1.5s, easing', 6);
  return value.trim();
};
const FILL = new Set(['none', 'forwards', 'backwards', 'both']);
const DIRECTION = new Set(['normal', 'reverse', 'alternate', 'alternate-reverse']);
const animation: Validator = (value, ctx) => {
  const items = split(value, ',').map(item => split(item, ' ').map(token => {
    if (ctx.keyframes.has(token)) return keyframeName(token);
    if (okTime(token) || TIMING.test(token) || FILL.has(token.toLowerCase()) || DIRECTION.has(token.toLowerCase())) return token;
    const n = number(token);
    if (n !== null && n >= 0 && n <= 3) return token;
    if (token.toLowerCase() === 'infinite') return ctx.motion === 'no-preference' ? token : fail("'infinite' animations are only allowed inside @media (prefers-reduced-motion: no-preference)");
    return fail(`'${token}' is not a keyframes block of this CSS or an allowed animation value (duration ≤1.5s, up to 3 iterations)`);
  }).join(' '));
  if (!items.length || items.length > 3) fail('use up to 3 animations');
  return items.join(', ');
};
const animationName: Validator = (value, ctx) => split(value, ',').map(name => ctx.keyframes.has(name) ? keyframeName(name) : fail(`'${name}' is not a keyframes block of this CSS`)).join(', ');
const filter: Validator = value => {
  if (value.trim().toLowerCase() === 'none') return 'none';
  return each(value, ' ', t => {
    const m = t.match(/^(grayscale|saturate|contrast|brightness|sepia|hue-rotate)\(\s*(-?[\d.]+)(%|deg)?\s*\)$/i);
    if (!m) return false;
    const name = m[1].toLowerCase(), n = parseFloat(m[2]) / (m[3] === '%' ? 100 : 1);
    if (name === 'hue-rotate') return m[3] === 'deg' && Math.abs(n) <= 45;
    if (name === 'grayscale' || name === 'sepia') return n >= 0 && n <= 1;
    if (name === 'saturate') return n >= 0 && n <= 2;
    return n >= 0.5 && n <= 1.5;
  }, 'filter: grayscale/sepia 0-1, saturate 0-2, contrast/brightness 0.5-1.5, hue-rotate ≤45deg', 4);
};
const clipPath: Validator = value => {
  const m = value.trim().match(/^(inset|circle|ellipse|polygon)\(([\w\s.,%-]+)\)$/i);
  if (!m) return value.trim().toLowerCase() === 'none' ? 'none' : fail('clip-path may be none, inset(), circle(), ellipse() or polygon()');
  if (m[1].toLowerCase() === 'polygon' && m[2].split(',').length > 12) fail('polygon() may have at most 12 points');
  return value.trim();
};
const varFont: Validator = value => VAR.test(value.trim()) && !value.includes(',') ? value.trim() : fail('font-family may only use a store font variable (var(--store-… / --brand-… / --pd-…))');
const fontSize: Validator = value => inPx(value.trim(), 12, 72) ? value.trim() : fail('font-size must be between 12px and 72px');
const fontWeight: Validator = value => { const n = number(value.trim()); return ['normal', 'bold'].includes(value.trim().toLowerCase()) || (n !== null && n >= 300 && n <= 800) ? value.trim() : fail('font-weight must be normal, bold or 300-800'); };
const lineHeight: Validator = value => { const n = number(value.trim()); return value.trim() === 'normal' || (n !== null && n >= 1 && n <= 2) ? value.trim() : fail('line-height must be 1-2'); };
const letterSpacing: Validator = value => {
  const l = parseLength(value.trim());
  return value.trim() === 'normal' || (l && ((l.unit === 'em' && l.n >= -0.05 && l.n <= 0.3) || (l.unit === 'px' && l.n >= -1 && l.n <= 8))) ? value.trim() : fail('letter-spacing must be -0.05em to 0.3em');
};
const zIndex: Validator = value => { const n = number(value.trim()); return n !== null && Number.isInteger(n) && n >= 0 && n <= 2 ? value.trim() : fail('z-index must be 0-2'); };
const position: Validator = (value, ctx) => {
  const v = value.trim().toLowerCase();
  if (v === 'relative' || v === 'static') return v;
  return v === 'absolute' && (ctx.pseudo || ctx.decor) ? v : fail('position:absolute is only allowed on ::before/::after and the decor slots');
};
const offset: Validator = (value, ctx) => {
  if (!(ctx.pseudo || ctx.decor)) fail('offsets are only allowed where position:absolute is');
  return each(value, ' ', t => inPx(t, -100, 100) || pct(t, -100, 100), 'offset: px or % between -100 and 100', 4);
};
/** Sizes keep a floor (24px, the WCAG 2.2 minimum target; 10% / 5vw / 5vh) so a theme cannot hide a control by shrinking it; only the decor slots may be 0. */
const size: Validator = (value, ctx) => {
  if (!ctx.parts.every(part => active.sized.has(part))) fail('this part keeps the kit\'s sizing');
  const v = value.trim().toLowerCase();
  if (v === 'auto') return v;
  const l = parseLength(v);
  const floor = ctx.decor ? 0 : 24;
  const ok = l && (((l.unit === 'px' || (l.unit === '' && l.n === 0)) && l.n >= floor && l.n <= 1200) || (l.unit === '%' && l.n >= (ctx.decor ? 0 : 10) && l.n <= 100) || ((l.unit === 'vw' || l.unit === 'vh') && l.n >= (ctx.decor ? 0 : 5) && l.n <= 100));
  return ok ? v : fail(`size must be ${floor}-1200px or ${ctx.decor ? 0 : 10}-100% / vw / vh (a theme may not shrink a control away)`);
};
/** Interactive parts keep their full clip: a clip-path could hide an option or a thumbnail button. */
const INTERACTIVE_PARTS = new Set(['swatch', 'thumb', 'thumbs']);
const clipPathOnPart: Validator = (value, ctx) => ctx.parts.some(part => INTERACTIVE_PARTS.has(part)) ? fail('clip-path is not allowed on the option and thumbnail buttons') : clipPath(value, ctx);
/** Text stays readable: no transparent text and no alpha under 0.6. */
const textColour: Validator = (value, ctx) => {
  const v = value.trim();
  if (/^transparent$/i.test(v)) fail('text colour may not be transparent');
  const alpha = v.match(/^(?:rgba|hsla)\([^)]*?(?:,|\/)\s*(\d*\.?\d+)(%?)\s*\)$/i);
  if (alpha && parseFloat(alpha[1]) / (alpha[2] ? 100 : 1) < 0.6) fail('text colour alpha must be at least 0.6');
  return colour(v, ctx);
};
/** An outline is a focus ring: it may be restyled, never removed. */
const outlineShorthand: Validator = (value, ctx) => {
  const tokens = split(value, ' ');
  if (tokens.some(t => t.toLowerCase() === 'none' || t === '0' || px(t) === 0)) fail('outlines may be restyled but not removed (no none or 0 width)');
  return borderShorthand(value, ctx);
};
const content: Validator = (value, ctx) => (value.trim() === '""' || value.trim() === "''") && ctx.pseudo ? '""' : fail('content is only allowed as "" on ::before/::after');
const aspectRatio: Validator = value => /^\d+(?:\.\d+)?(?:\s*\/\s*\d+(?:\.\d+)?)?$/.test(value.trim()) ? value.trim() : fail('aspect-ratio must be like 4 / 3');
const objectPosition: Validator = value => each(value, ' ', t => /^(?:left|right|top|bottom|center)$/i.test(t) || pct(t, 0, 100) || inPx(t, 0, 200), 'object-position: keywords or percentages', 4);
const textDecoration: Validator = value => each(value, ' ', t => /^(?:none|underline|overline|line-through|solid|dotted|dashed|wavy|double)$/i.test(t) || isColour(t) || inPx(t, 0, 6), 'text-decoration: line, style, colour, thickness ≤6px', 4);
const time: Validator = value => split(value, ',').every(okTime) ? value.trim() : fail('durations up to 1.5s');
const timingFn: Validator = value => split(value, ',').every(t => TIMING.test(t)) ? value.trim() : fail('use a standard easing');
const transitionProperty: Validator = value => split(value, ',').every(t => TRANSITION_PROPS.has(t.toLowerCase())) ? value.trim() : fail('only visual properties may transition');
const iterationCount: Validator = (value, ctx) => split(value, ',').every(t => { const n = number(t); return (n !== null && n >= 0 && n <= 3) || (t.toLowerCase() === 'infinite' && ctx.motion === 'no-preference'); }) ? value.trim() : fail("iteration count must be up to 3 ('infinite' only inside prefers-reduced-motion: no-preference)");
const borderRadius: Validator = value => each(value, ' ', t => inPx(t, 0, 999) || pct(t, 0, 100), 'border-radius: 1-4 values, px ≤999 or %', 4);

const PROPERTIES: Record<string, Validator> = {
  color: textColour, 'background-color': colour, 'border-color': value => each(value, ' ', isColour, 'colours', 4), 'outline-color': colour, fill: colour, stroke: colour, 'text-decoration-color': colour,
  background, 'background-image': backgroundImage,
  border: borderShorthand, 'border-top': borderShorthand, 'border-right': borderShorthand, 'border-bottom': borderShorthand, 'border-left': borderShorthand,
  'border-width': lengths(0, 8, 'border-width'), 'border-style': value => each(value, ' ', t => BORDER_STYLES.has(t.toLowerCase()), 'solid|dashed|dotted|double|none', 4), 'border-radius': borderRadius,
  'box-shadow': shadow, 'text-shadow': shadow, outline: outlineShorthand, 'outline-offset': lengths(-8, 16, 'outline-offset'),
  opacity, filter, transform, 'transform-origin': objectPosition, transition, 'transition-property': transitionProperty, 'transition-duration': time, 'transition-delay': time, 'transition-timing-function': timingFn,
  animation, 'animation-name': animationName, 'animation-duration': time, 'animation-delay': time, 'animation-timing-function': timingFn, 'animation-iteration-count': iterationCount,
  'animation-fill-mode': value => each(value, ',', t => FILL.has(t.toLowerCase()), 'none|forwards|backwards|both', 3), 'animation-direction': value => each(value, ',', t => DIRECTION.has(t.toLowerCase()), 'normal|reverse|alternate|alternate-reverse', 3),
  'clip-path': clipPathOnPart, 'aspect-ratio': aspectRatio, 'object-fit': enumOf('cover', 'contain', 'fill', 'none', 'scale-down'), 'object-position': objectPosition,
  padding: lengths(0, 64, 'padding'), 'padding-top': lengths(0, 64, 'padding'), 'padding-right': lengths(0, 64, 'padding'), 'padding-bottom': lengths(0, 64, 'padding'), 'padding-left': lengths(0, 64, 'padding'),
  margin: lengths(-16, 64, 'margin'), 'margin-top': lengths(-16, 64, 'margin'), 'margin-right': lengths(-16, 64, 'margin'), 'margin-bottom': lengths(-16, 64, 'margin'), 'margin-left': lengths(-16, 64, 'margin'),
  gap: lengths(0, 64, 'gap'), 'row-gap': lengths(0, 64, 'gap'), 'column-gap': lengths(0, 64, 'gap'),
  width: size, height: size, 'min-width': size, 'min-height': size, 'max-width': size, 'max-height': size,
  'letter-spacing': letterSpacing, 'text-transform': enumOf('none', 'uppercase', 'lowercase', 'capitalize'), 'font-style': enumOf('normal', 'italic'), 'font-weight': fontWeight, 'font-family': varFont, 'font-size': fontSize, 'line-height': lineHeight,
  'text-decoration': textDecoration, 'text-decoration-line': textDecoration, 'text-decoration-style': enumOf('solid', 'dotted', 'dashed', 'wavy', 'double'), 'text-decoration-thickness': lengths(0, 6, 'thickness'), 'text-underline-offset': lengths(0, 16, 'offset'),
  display: enumOf('block', 'flex', 'grid', 'inline-block', 'inline-flex'), visibility: enumOf('visible'), position, top: offset, right: offset, bottom: offset, left: offset, inset: offset, 'z-index': zIndex,
  overflow: enumOf('visible', 'hidden', 'clip'), 'mix-blend-mode': enumOf('normal', 'multiply', 'screen', 'overlay'), content,
};
const KEYFRAME_PROPS = new Set(['opacity', 'transform', 'filter', 'background-color', 'color', 'border-color', 'box-shadow', 'clip-path']);

/** Values refused in any property, before the property's own rules run. */
function bannedValue(value: string): string | null {
  if (value.includes('\\')) return 'escape sequences are not allowed';
  if (/url\s*\(|image-set|expression|@import|javascript:/i.test(value)) return 'urls, image-set and script values are not allowed';
  if (/(?:^|[^\w-])(?:calc|clamp|min|max|env|attr)\s*\(/i.test(value)) return 'calc(), clamp(), min(), max(), env() and attr() are not allowed; use literal values';
  for (const match of value.matchAll(/var\(\s*(--[^,)\s]*)/gi)) if (!active.variables.test(match[1])) return `variable ${match[1]} is not allowed (only ${active.variableHint} variables)`;
  return null;
}

// ---- selectors ----------------------------------------------------------------------------------------------------------
function compoundFor(parts: readonly string[]) {
  const PART_ALTERNATION = [...parts].sort((a, b) => b.length - a.length).join('|');
  return new RegExp(`^\\[data-part=(?:"|')?(${PART_ALTERNATION})(?:"|')?\\](?:\\[data-part-type=(?:"|')?(media|compare)(?:"|')?\\])?((?::(?:hover|focus-visible|active|first-child|last-child|nth-child\\(\\d{1,2}\\)))*)(::(?:before|after))?$`);
}
type ParsedSelector = { selector: string; last: string; pseudo: boolean };
function parseSelector(raw: string): ParsedSelector | string {
  const refusal = `selector "${raw.trim()}" is not allowed (only [data-part=…] selectors on the cosmetic parts, with :hover, :focus-visible, :active, :first-child, :last-child, :nth-child() and one ::before/::after on the last part)`;
  const tokens = withoutScope(raw.trim() + ' ').replace(/\s*>\s*/g, ' > ').split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let compounds = 0, last = '', pseudo = false, expectCompound = true;
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i] === '>') {
      if (expectCompound || i === tokens.length - 1) return refusal;
      out.push('>'); expectCompound = true; continue;
    }
    const m = tokens[i].match(active.compound);
    const isLast = i === tokens.length - 1;
    if (!m || (m[4] && !isLast)) return refusal;
    compounds++;
    out.push(`[data-part="${m[1]}"]${m[2] ? `[data-part-type="${m[2]}"]` : ''}${m[3] ?? ''}${m[4] ?? ''}`);
    last = m[1]; pseudo = !!m[4]; expectCompound = false;
  }
  if (!compounds || compounds > MAX_COMPOUNDS || expectCompound) return refusal;
  return { selector: active.scope + out.join(' '), last, pseudo };
}

// ---- the sanitizer ------------------------------------------------------------------------------------------------------
const PRODUCT_PROFILE: ThemeCssProfile = { parts: COSMETIC_PARTS, sizedParts: [...SIZED_PARTS], scope: SCOPE, keyframePrefix: 'pt-', variables: /^--(?:pd|store|brand|pt)-[a-z0-9-]+$/i, variableHint: '--pd-, --store-, --brand- and --pt-' };
let active: ActiveProfile;
export function sanitizeProductThemeCss(input: unknown): ThemeCssReport { return sanitizeThemeCss(input, PRODUCT_PROFILE); }
/** The same guarded sanitizer for another kind of page (the account pages, spec 2026-10-08). Synchronous, so the active
 * profile is set for exactly this call. */
export function sanitizeThemeCss(input: unknown, profile: ThemeCssProfile): ThemeCssReport {
  const previous = active;
  active = activate(profile);
  try { return sanitizeActive(input); } finally { active = previous; }
}
function sanitizeActive(input: unknown): ThemeCssReport {
  const dropped: ThemeCssReport['dropped'] = [];
  const closed = (reason: string): ThemeCssReport => ({ css: '', dropped: [...dropped, { reason }] });
  if (typeof input !== 'string') return closed('CSS must be text');
  if (!input.trim()) return { css: '', dropped };
  if (withoutScope(input).length > MAX_CHARS) return closed(`CSS is too long (limit ${MAX_CHARS} characters)`);
  let root: ReturnType<typeof postcss.parse>;
  try { root = postcss.parse(input); } catch { return closed('invalid CSS: it could not be parsed'); }

  let rules = 0, declarations = 0;
  root.walk(node => {
    if (node.type === 'rule' && !(node.parent?.type === 'atrule' && /keyframes$/i.test((node.parent as AtRule).name))) rules++;
    if (node.type === 'decl') declarations++;
  });
  if (rules > MAX_RULES) return closed(`too many rules (limit ${MAX_RULES})`);
  if (declarations > MAX_DECLARATIONS) return closed(`too many declarations (limit ${MAX_DECLARATIONS})`);

  const keyframes = new Set<string>();
  root.each(node => { if (node.type === 'atrule' && node.name.toLowerCase() === 'keyframes' && /^[a-z][a-z0-9-]{0,30}$/i.test(node.params.trim())) keyframes.add(node.params.trim()); });

  const output = postcss.root();
  const checkDeclaration = (decl: Declaration, ctx: Ctx, allowed?: Set<string>): { prop: string; value: string } | null => {
    const prop = decl.prop.toLowerCase();
    const drop = (reason: string) => { dropped.push({ declaration: `${prop}: ${decl.value}`, reason }); return null; };
    if (active.refuse && ctx.parts.some(part => active.refuse!(part, prop))) return drop('protected part: it must stay visible and usable');
    if (decl.important) return drop('!important is not allowed');
    if (prop.startsWith('--')) return drop('custom properties are not allowed');
    if (prop.startsWith('-')) return drop(`property '${prop}' is not allowed (no vendor properties)`);
    const banned = bannedValue(decl.value);
    if (banned) return drop(banned);
    const validator = PROPERTIES[prop];
    if (!validator || (allowed && !allowed.has(prop))) return drop(`property '${prop}' is not allowed${allowed ? ' in keyframes' : ''}`);
    try { return { prop, value: validator(decl.value.trim(), ctx) }; } catch (error) {
      if (error instanceof Reject) return drop(error.message);
      throw error;
    }
  };

  const processRule = (rule: Rule, motion: Ctx['motion'], into: { append(node: Rule): unknown }) => {
    const valid: ParsedSelector[] = [];
    for (const raw of split(rule.selector, ',')) {
      const parsed = parseSelector(raw);
      if (typeof parsed === 'string') dropped.push({ rule: raw.trim(), reason: parsed });
      else valid.push(parsed);
    }
    if (!valid.length) return;
    const ctx: Ctx = { parts: valid.map(s => s.last), pseudo: valid.every(s => s.pseudo), decor: valid.every(s => s.last.startsWith('decor-')), motion, keyframes };
    const next = postcss.rule({ selector: valid.map(s => s.selector).join(',\n') });
    rule.each(child => {
      if (child.type !== 'decl') { dropped.push({ rule: rule.selector.trim(), reason: 'only declarations are allowed inside a rule' }); return; }
      const ok = checkDeclaration(child, ctx);
      if (ok) next.append(postcss.decl({ prop: ok.prop, value: ok.value }));
    });
    if (next.nodes.length) into.append(next);
  };

  root.each(node => {
    if (node.type === 'comment') return;
    if (node.type === 'decl') { dropped.push({ declaration: `${node.prop}: ${node.value}`, reason: 'declarations must be inside a rule' }); return; }
    if (node.type === 'rule') { processRule(node, 'none', output); return; }
    if (node.type !== 'atrule') return;
    const name = node.name.toLowerCase();
    if (name === 'keyframes') {
      const id = node.params.trim();
      if (!keyframes.has(id)) { dropped.push({ rule: `@keyframes ${id}`, reason: 'invalid keyframes name' }); return; }
      const frames = postcss.atRule({ name: 'keyframes', params: keyframeName(id) });
      const stepCtx: Ctx = { parts: [], pseudo: false, decor: false, motion: 'none', keyframes };
      let steps = 0;
      node.each(step => {
        if (step.type !== 'rule' || !/^(?:from|to|\d{1,3}%)(?:\s*,\s*(?:from|to|\d{1,3}%))*$/i.test(step.selector.trim())) { dropped.push({ rule: `@keyframes ${id}`, reason: 'keyframe steps must be from, to or a percentage' }); return; }
        if (++steps > MAX_KEYFRAME_STEPS) { dropped.push({ rule: `@keyframes ${id}`, reason: `too many keyframe steps (limit ${MAX_KEYFRAME_STEPS})` }); return; }
        const next = postcss.rule({ selector: step.selector.trim() });
        step.each(child => {
          if (child.type !== 'decl') return;
          const ok = checkDeclaration(child, stepCtx, KEYFRAME_PROPS);
          if (ok) next.append(postcss.decl({ prop: ok.prop, value: ok.value }));
        });
        if (next.nodes.length) frames.append(next);
      });
      if (frames.nodes?.length) output.append(frames);
      return;
    }
    if (name === 'media') {
      const params = node.params.trim();
      let normalized = '';
      let motion: Ctx['motion'] = 'none';
      const width = params.match(/^\(\s*(min|max)-width\s*:\s*(\d{2,4})px\s*\)$/i);
      const preference = params.match(/^\(\s*prefers-reduced-motion\s*:\s*(reduce|no-preference)\s*\)$/i);
      if (width && +width[2] >= 240 && +width[2] <= 2000) normalized = `(${width[1].toLowerCase()}-width: ${width[2]}px)`;
      else if (preference) { normalized = `(prefers-reduced-motion: ${preference[1].toLowerCase()})`; motion = preference[1].toLowerCase() as Ctx['motion']; }
      if (!normalized) { dropped.push({ rule: `@media ${params}`, reason: 'media query not allowed (use min-width/max-width between 240px and 2000px, or prefers-reduced-motion)' }); return; }
      const media = postcss.atRule({ name: 'media', params: normalized });
      node.each(child => {
        if (child.type === 'rule') processRule(child, motion, media);
        else if (child.type !== 'comment') dropped.push({ rule: `@media ${params}`, reason: 'only rules are allowed inside a media query' });
      });
      if (media.nodes?.length) output.append(media);
      return;
    }
    dropped.push({ rule: `@${node.name} ${node.params}`.trim(), reason: `at-rule @${node.name} is not allowed (only @keyframes and @media)` });
  });

  return { css: output.toString().trim(), dropped };
}
