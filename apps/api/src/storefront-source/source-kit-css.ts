import postcss, { type AtRule, type ChildNode, type Container, type Declaration, type Root, type Rule } from 'postcss';
import type { SourceProjectFileDto } from './dto/save-source-project.dto';

/**
 * Validated free-CSS layer (sub-project 7). YAPI writes kit-surface CSS in one place: `styles/kit.css` (static) or a
 * `pagosya-kit` block in `styles/globals.css` (component mode). This module validates it and emits the served form: its
 * surface rules sit in the `pagosya-store-kit` cascade layer, after the kit's layers and the DNA. Its product-page rules
 * are unlayered and scoped by one ID, the only way to restyle the platform-owned product page. The same
 * protected-element and motion rules also apply to every other authored stylesheet, because unlayered authored CSS
 * outranks any layer. Nothing here throws on content: violations are stripped, clamped or dropped, and reported.
 */

export const SOURCE_KIT_CSS_PATH = 'styles/kit.css';
export const SOURCE_KIT_CSS_MAX_BYTES = 12 * 1024;
/** Declared by the served file itself, so the order holds whether it loads before or after the kit's own styles. */
export const STORE_KIT_LAYER_ORDER = '@layer pagosya-commerce, pagosya-contact-base, pagosya-dna, pagosya-store-kit;';
/** One ID of specificity: above the kit's unlayered product-page rules and the DNA page rules, which use classes only. */
export const STORE_KIT_SCOPE = ':root:not(#pagosya-store-kit)';
/** The product-page hooks the kit runtime releases from authored stylesheets (commerce.js `productHook`, pinned by a test). */
export const SOURCE_KIT_PRODUCT_HOOK = /\[data-pagosya-product(?:-page)?(?=[\]~|^$*=\s])|\.product-detail__/;
/** A store's own --motion-* numbers, held to the ranges the kit runtime and @pagosya/ui clamp to (commerce.js MOTION_LIMITS). */
export const SOURCE_MOTION_LIMITS = { fast: [0, 900], base: [0, 900], slow: [0, 900], distance: [0, 40], stagger: [0, 120], parallax: [0, 2], press: [0.85, 1] } as const;

const MOTION_PROPS: Record<string, keyof typeof SOURCE_MOTION_LIMITS> = {
  '--motion-fast': 'fast', '--motion-base': 'base', '--motion-slow': 'slow', '--motion-distance': 'distance',
  '--motion-stagger': 'stagger', '--motion-parallax': 'parallax', '--motion-press-scale': 'press',
};
const HEADER = '/* pagosYa store kit CSS. Validated on every save: surface rules load in the pagosya-store-kit layer and product-page rules are scoped by the platform. Edit as plain CSS rules on kit surfaces. */';
/** A leading `html`/`:root` compound qualified only by DNA attributes. */
const QUALIFIER = /^(?:html|:root)(?:\[data-dna-[\w-]+(?:[~|^$*]?=(?:"[^"]*"|'[^']*'|[\w-]+))?\])*$/i;
const KIT_ROOT = /^(?:[a-z][a-z0-9-]*)?(?:\.cart-drawer|\.cart-added|\.order-item|\.checkout-review|\[data-pagosya-checkout|\[data-pagosya-product|\.product-detail__|\.menu-item|\.menu-add|\.checkout-button|\.pagosya-contact-|\[data-pagosya-contact|\[data-pagosya-privacy|\.quantity)/i;
/** Price, total, buy/pay button, quantity, legal and privacy text, the status line. */
const PROTECTED = /\.[\w-]*(?:price|total)[\w-]*|\.(?:checkout-button|menu-add|quantity|pagosya-policies|pagosya-secure-note)(?![\w-])|\.product-detail__(?:buy|quantity|status)|\[data-(?:pay|add|checkout|product-quantity|pagosya-status|pagosya-checkout-status|pagosya-privacy|pagosya-policy|pagosya-policies)(?![\w-])|\[data-product-field=["']?price/i;
/** Legal, privacy and status compounds: every descendant is protected text. */
const LEGAL = /\.(?:pagosya-policies|pagosya-secure-note)(?![\w-])|\.product-detail__status(?![\w-])|\[data-(?:pagosya-status|pagosya-checkout-status|pagosya-privacy|pagosya-policy|pagosya-policies)(?![\w-])/i;
/** Under a protected compound every descendant is protected (the label span of a pay button…) except media and icons. */
const MEDIA = /^(?:svg|path|use|g|circle|rect|line|polyline|polygon|img|picture|source|video|canvas|iframe)(?![\w-])/i;
/** A bare control or any-element subject under a kit surface: it may be the buy or pay control itself. */
const BARE_CONTROL = /^(?:button|a|input|\*)?(?=$|[:[])/i;
const PSEUDO_ELEMENT = /::|:(?:before|after|first-letter|first-line)\b/i;
/** A state qualifier on the compound itself: its contents inside :has()/:is()/:where()/:not() never count. */
const STATE = /:disabled|\[disabled|\[aria-disabled|:empty|\[hidden/i;
const ALLOWED_AT_RULES = new Set(['media', 'supports', 'container', 'starting-style', 'keyframes', '-webkit-keyframes']);
const ASSET_URL = /^(?:\.\/|\.\.\/|\/)?(assets|motifs)\/((?:(?!\.\.)[\w.@%+-]+\/?)+)$/;

class Notes {
  private readonly items: string[] = [];
  private extra = 0;
  constructor(private readonly path: string) {}
  add(note: string) { if (this.items.length < 12) this.items.push(`${this.path}: ${note}`); else this.extra++; }
  list() { return this.extra ? [...this.items, `${this.path}: …and ${this.extra} more`] : this.items; }
  get size() { return this.items.length + this.extra; }
}

/** Split on top-level commas (not inside brackets, parentheses or quotes). */
export function splitSelectors(list: string): string[] {
  const parts: string[] = [];
  let depth = 0, quote = '', start = 0;
  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    if (c === '\\') { i++; continue; }
    if (quote) { if (c === quote) quote = ''; continue; }
    if (c === '"' || c === "'") quote = c;
    else if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') depth--;
    else if (c === ',' && depth === 0) { parts.push(list.slice(start, i)); start = i + 1; }
  }
  parts.push(list.slice(start));
  return parts.map(part => part.trim()).filter(Boolean);
}
/** The compounds of one selector, split on combinators outside brackets, parentheses and quotes. */
function compounds(selector: string): string[] {
  const parts: string[] = [];
  let depth = 0, quote = '', current = '';
  for (let i = 0; i < selector.length; i++) {
    const c = selector[i];
    if (c === '\\') { current += c + (selector[i + 1] ?? ''); i++; continue; }
    if (quote) { current += c; if (c === quote) quote = ''; continue; }
    if (c === '"' || c === "'") quote = c;
    else if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') depth--;
    if (depth === 0 && /[\s>+~]/.test(c)) { if (current) parts.push(current); current = ''; continue; }
    current += c;
  }
  if (current) parts.push(current);
  return parts;
}
const withoutNot = (compound: string) => compound.replace(/:not\((?:[^()]|\([^()]*\))*\)/gi, '');
/** The compound's own simple selectors: functional pseudo-classes and their arguments removed. */
const ownSimple = (compound: string) => compound.replace(/:(?:not|is|where|has|matches|-webkit-any|-moz-any)\((?:[^()]|\((?:[^()]|\([^()]*\))*\))*\)/gi, '');

/** 'surface' when rooted on a kit surface, 'root' for a bare :root/html (tokens only), else null. */
function kitSelector(selector: string): 'surface' | 'root' | null {
  const parts = compounds(selector);
  const first = QUALIFIER.test(parts[0] ?? '') ? 1 : 0;
  if (first === parts.length) return 'root';
  return KIT_ROOT.test(parts[first]) ? 'surface' : null;
}
/**
 * 'element': a protected element (every rule applies). 'container': any other product-page hook; it holds the buy flow, so
 * nothing may hide, move, fade or clip it. null: free. `state` exempts hiding and fading (:disabled, [hidden]…).
 */
function protectedSelector(selector: string): { protected: 'element' | 'container' | null; state: boolean } {
  const parts = compounds(selector);
  const subject = parts.at(-1) ?? '';
  if (PSEUDO_ELEMENT.test(subject)) return { protected: null, state: false };
  const own = withoutNot(subject), ancestors = parts.slice(0, -1).map(withoutNot);
  const state = STATE.test(ownSimple(subject));
  const bare = ownSimple(subject).replace(/\[[^\]]*\]|:[\w-]+/g, '');
  const hit = PROTECTED.test(own)
    || ancestors.some(part => LEGAL.test(part))
    || (!MEDIA.test(bare) && ancestors.some(part => PROTECTED.test(part)))
    || (BARE_CONTROL.test(bare) && !/[.#]/.test(bare) && ancestors.some(part => KIT_ROOT.test(part)));
  if (hit) return { protected: 'element', state };
  return { protected: SOURCE_KIT_PRODUCT_HOOK.test(selector) ? 'container' : null, state };
}
const insideKeyframes = (node: ChildNode) => {
  for (let parent = node.parent as Container | undefined; parent; parent = parent.parent as Container | undefined) if (parent.type === 'atrule' && /keyframes$/i.test((parent as AtRule).name)) return true;
  return false;
};

/* ---- values ---- */
const PHONE = { vw: 3.2, vh: 5.68 }, DESKTOP = { vw: 14.4, vh: 9 };
const FONT_KEYWORDS: Record<string, number> = { 'xx-small': 9, 'x-small': 10, small: 13, medium: 16, large: 18, 'x-large': 24, 'xx-large': 32, 'xxx-large': 48 };
/** Evaluates a CSS length expression (calc/min/max/clamp, px/rem/em/%/pt/vw/vh…) in px, or null when it cannot. */
function lengthPx(value: string, viewport: { vw: number; vh: number }): number | null {
  const units: Record<string, number> = { px: 1, rem: 16, em: 16, '%': 0.16, pt: 4 / 3, pc: 16, ch: 8, ex: 8, cm: 37.8, mm: 3.78, in: 96,
    vw: viewport.vw, svw: viewport.vw, lvw: viewport.vw, dvw: viewport.vw, cqw: viewport.vw, vmin: viewport.vw, vi: viewport.vw,
    vh: viewport.vh, svh: viewport.vh, lvh: viewport.vh, dvh: viewport.vh, cqh: viewport.vh, vmax: viewport.vh, vb: viewport.vh, '': 1 };
  const tokens = value.toLowerCase().match(/-?\d*\.?\d+(?:e-?\d+)?[a-z%]*|[a-z-]+\(|[()+\-*/,]/g);
  if (!tokens || tokens.join('').length !== value.toLowerCase().replace(/\s+/g, '').length) return null;
  let i = 0;
  const expr = (): number | null => {
    let left = term(); if (left === null) return null;
    while (tokens[i] === '+' || tokens[i] === '-') { const op = tokens[i++]; const right = term(); if (right === null) return null; left = op === '+' ? left + right : left - right; }
    return left;
  };
  const term = (): number | null => {
    let left = factor(); if (left === null) return null;
    while (tokens[i] === '*' || tokens[i] === '/') { const op = tokens[i++]; const right = factor(); if (right === null || (op === '/' && right === 0)) return null; left = op === '*' ? left * right : left / right; }
    return left;
  };
  const args = (): number[] | null => {
    const list: number[] = [];
    for (;;) { const v = expr(); if (v === null) return null; list.push(v); if (tokens[i] === ',') { i++; continue; } if (tokens[i] === ')') { i++; return list; } return null; }
  };
  const factor = (): number | null => {
    const token = tokens[i++];
    if (token === undefined) return null;
    if (token === '(') { const v = expr(); return tokens[i++] === ')' ? v : null; }
    if (token === '-') { const v = factor(); return v === null ? null : -v; }
    if (/^[a-z-]+\($/.test(token)) {
      const list = args(); if (!list) return null;
      if (token === 'calc(') return list.length === 1 ? list[0] : null;
      if (token === 'min(') return Math.min(...list);
      if (token === 'max(') return Math.max(...list);
      if (token === 'clamp(') return list.length === 3 ? Math.max(list[0], Math.min(list[1], list[2])) : null;
      return null;
    }
    const match = token.match(/^(-?\d*\.?\d+(?:e-?\d+)?)([a-z%]*)$/);
    if (!match || !(match[2] in units)) return null;
    return Number(match[1]) * units[match[2]];
  };
  const result = expr();
  return result !== null && i === tokens.length && Number.isFinite(result) ? result : null;
}
function fontFloor(value: string): number | null {
  const v = value.trim().toLowerCase();
  if (v in FONT_KEYWORDS) return FONT_KEYWORDS[v];
  const phone = lengthPx(v, PHONE), desktop = lengthPx(v, DESKTOP);
  return phone === null || desktop === null ? null : Math.min(phone, desktop);
}
const TRANSPARENT = /^(?:transparent|#[\da-f]{3}0|#[\da-f]{6}00|(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\([^)]*(?:,|\/)\s*0(?:\.0*)?%?\s*\))$/i;
const flat = (value: string) => value.trim().toLowerCase().replace(/\s+/g, '');
function scaleFactors(value: string): number[] {
  const factors: number[] = [];
  for (const match of value.matchAll(/scale(?:3d|x|y|z)?\(([^)]*)\)/gi)) for (const part of match[1].split(/[\s,]+/).filter(Boolean)) {
    const n = parseFloat(part); if (Number.isFinite(n)) factors.push(part.endsWith('%') ? n / 100 : n);
  }
  return factors;
}
/** An offset that puts the element a phone's width (320px) or its own containing block (100%) away: off screen, or out of an
 * overflow-hidden card. Shorthands are read side by side; only left/right sides count when they are large and positive. */
function farOffset(prop: string, value: string): boolean {
  const parts = value.split(/\s+/).filter(Boolean);
  const shorthand = prop === 'margin' || prop === 'inset';
  const horizontalAt = (index: number) => !shorthand ? /left|right|inline|indent/.test(prop) : parts.length === 1 || index % 2 === 1;
  return parts.some((part, index) => {
    const horizontal = horizontalAt(index);
    if (part.endsWith('%')) { const n = parseFloat(part); return Number.isFinite(n) && (n <= -100 || (horizontal && n >= 100)); }
    const px = lengthPx(part, PHONE);
    return px !== null && (px <= -320 || (horizontal && px >= 320));
  });
}

/** A translation of its own size (100%) or a phone's width: out of an overflow-hidden card or off screen. */
const farShift = (part: string) => {
  if (part.endsWith('%')) { const n = parseFloat(part); return Number.isFinite(n) && Math.abs(n) >= 100; }
  const px = lengthPx(part, PHONE);
  return px !== null && Math.abs(px) >= 320;
};
const DEGREES: Record<string, number> = { deg: 1, rad: 180 / Math.PI, turn: 360, grad: 0.9 };
/** rotateX/rotateY near 90° turns the element edge-on: nothing is left to see or click. */
const edgeOn = (value: string) => [...value.matchAll(/rotate([xy])\(\s*(-?[\d.]+)(deg|rad|turn|grad)\s*\)/gi)]
  .some(m => Math.abs(Math.cos(Number(m[2]) * DEGREES[m[3].toLowerCase()] * Math.PI / 180)) < 0.2);
/** Why a filter() list makes text unreadable, or null. */
function filterViolation(value: string, state: boolean): string | null {
  for (const m of value.matchAll(/(opacity|blur|brightness|contrast)\(\s*([^)]*)\)/gi)) {
    const name = m[1].toLowerCase(), arg = m[2].trim();
    const n = arg === '' ? (name === 'blur' ? 0 : 1) : arg.endsWith('%') ? parseFloat(arg) / 100 : parseFloat(arg);
    if (name === 'blur') { const px = lengthPx(arg || '0', PHONE); if (px !== null && px >= 2) return 'blurs'; continue; }
    if (!Number.isFinite(n)) return name === 'opacity' && !state ? 'fades' : null;
    if (name === 'opacity' && n < 1 && !state) return 'fades';
    if ((name === 'brightness' || name === 'contrast') && n <= 0.3) return 'darkens away';
  }
  return null;
}
/** A polygon() whose points span less than half the box (percentages) or under 12px (lengths). */
function degeneratePolygon(value: string): boolean {
  return [...value.matchAll(/polygon\(([^)]*)\)/gi)].some(m => {
    const points = m[1].replace(/^\s*(?:nonzero|evenodd)\s*,/i, '').split(',').map(point => point.trim().split(/\s+/));
    const axis = (index: number) => points.map(point => point[index] ?? '').map(part => part.endsWith('%') ? { pct: parseFloat(part) } : { px: lengthPx(part, PHONE) });
    return [0, 1].some(index => {
      const values = axis(index);
      if (values.every(v => 'pct' in v || v.px === 0)) { const n = values.map(v => ('pct' in v ? v.pct : 0) as number); return Math.max(...n) - Math.min(...n) < 50; }
      if (values.every(v => 'px' in v && v.px !== null)) { const n = values.map(v => (v as { px: number }).px); return Math.max(...n) - Math.min(...n) < 12; }
      return false;
    });
  });
}
/** Alpha of a colour value in 0–1, or null when it cannot be read (var(), currentcolor…). */
function colorAlpha(value: string): number | null {
  const v = value.trim().toLowerCase();
  if (v === 'transparent') return 0;
  const hex = v.match(/^#([\da-f]{3,8})$/);
  if (hex) { const h = hex[1]; return h.length === 4 ? parseInt(h[3] + h[3], 16) / 255 : h.length === 8 ? parseInt(h.slice(6), 16) / 255 : 1; }
  const fn = v.match(/^([a-z-]+)\(([\s\S]*)\)$/);
  if (!fn) return /^[a-z]+$/.test(v) && v !== 'currentcolor' && v !== 'inherit' && v !== 'initial' && v !== 'unset' && v !== 'revert' ? 1 : null;
  const [, name, inner] = fn;
  if (/var\(|calc\(|attr\(|env\(/.test(inner)) return null;
  if (name === 'color-mix') {
    const args = splitSelectors(inner);
    if (args.length !== 3) return null;
    const sides = args.slice(1).map(arg => { const m = arg.match(/^(.*?)\s+([\d.]+)%$/) || arg.match(/^([\d.]+)%\s+(.*)$/); return m ? (/%$/.test(arg) ? { color: m[1], weight: Number(m[2]) } : { color: m[2], weight: Number(m[1]) }) : { color: arg, weight: null as number | null }; });
    const [a, b] = sides;
    const wa = a.weight ?? (b.weight !== null ? 100 - b.weight : 50), wb = b.weight ?? 100 - wa;
    const alphaA = colorAlpha(a.color), alphaB = colorAlpha(b.color);
    if (alphaA === null || alphaB === null || wa + wb <= 0) return null;
    return (alphaA * wa + alphaB * wb) / Math.max(100, wa + wb);
  }
  if (!/^(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)$/.test(name)) return null;
  const slash = inner.split('/');
  const raw = slash.length === 2 ? slash[1].trim() : inner.split(',').length === 4 ? inner.split(',')[3].trim() : null;
  if (raw === null) return 1;
  const n = parseFloat(raw);
  return Number.isFinite(n) ? (raw.endsWith('%') ? n / 100 : n) : null;
}
const OVERFLOW_CLIPS = (rule: Rule) => (rule.nodes || []).some(node => node.type === 'decl' && /^overflow(?:-[xy]|-block|-inline)?$/i.test(node.prop) && /\b(?:hidden|clip)\b/i.test(node.value));

/** Why a declaration hides, fades or shrinks a protected element, or null. */
function protectedViolation(decl: Declaration, state: boolean, level: 'element' | 'container'): string | null {
  const prop = decl.prop.toLowerCase(), value = decl.value.trim().toLowerCase();
  if (level === 'container' && /^(?:font-size|color|-webkit-text-fill-color|background(?:-color)?)$/.test(prop)) return null;
  if (!state) {
    if (prop === 'display' && /^none\b/.test(value)) return 'hides';
    if (prop === 'visibility' && /^(?:hidden|collapse)\b/.test(value)) return 'hides';
    if (prop === 'content-visibility' && /^hidden\b/.test(value)) return 'hides';
    if (prop === 'pointer-events' && /^none\b/.test(value)) return 'disables';
    if (prop === 'opacity') { const n = parseFloat(value); if (!(Number.isFinite(n) && /^[\d.]+%?$/.test(value) && (value.endsWith('%') ? n >= 100 : n >= 1))) return 'fades'; }
  }
  if (prop === 'clip' && /rect\(/.test(value)) return 'clips';
  if (prop === 'clip-path' && (/\b(?:circle|ellipse)\(\s*0(?:px|%)?\b/.test(value) || [...value.matchAll(/inset\(([^)]*)\)/g)].some(m => m[1].split(/\s+round\s+/)[0].split(/\s+/).some(part => part.endsWith('%') && parseFloat(part) >= 50)))) return 'clips';
  if (prop === 'font-size') { const floor = fontFloor(value); if (floor !== null && floor < 12) return 'shrinks'; }
  if (prop === 'transform' && scaleFactors(value).some(n => n < 0.9)) return 'shrinks';
  if ((prop === 'scale' || prop === 'zoom') && value.split(/\s+/).some(part => { const n = parseFloat(part); return Number.isFinite(n) && (part.endsWith('%') ? n / 100 : n) < 0.9; })) return 'shrinks';
  if (prop === 'transform' && [...value.matchAll(/translate(?:3d|x|y)?\(([^)]*)\)/gi)].some(m => m[1].split(/[\s,]+/).filter(Boolean).some(farShift))) return 'moves off screen';
  if (prop === 'translate' && value.split(/\s+/).some(farShift)) return 'moves off screen';
  if (prop === 'transform' && edgeOn(value)) return 'turns edge-on';
  if (/^(?:-webkit-)?filter$/.test(prop)) { const reason = filterViolation(value, state); if (reason) return reason; }
  if (/^(?:-webkit-)?mask(?:-image|-border(?:-source)?)?$/.test(prop) && !/^none$/.test(value)) return 'masks';
  if (prop === 'clip-path' && degeneratePolygon(value)) return 'clips';
  if (prop === 'content' && !/^(?:normal|none)$/.test(value)) return 'replaces';
  if (/^(?:max-)?(?:height|block-size)$/.test(prop) && OVERFLOW_CLIPS(decl.parent as Rule)) { const px = lengthPx(value, PHONE); if (px !== null && px <= 1) return 'collapses'; }
  if (/^(?:left|right|top|bottom|inset(?:-[a-z-]+)?|margin(?:-[a-z-]+)?|text-indent)$/.test(prop) && farOffset(prop, value)) return 'moves off screen';
  if ((prop === 'color' || prop === '-webkit-text-fill-color') && TRANSPARENT.test(value)) return 'makes its text invisible';
  if (prop === 'color' || prop === '-webkit-text-fill-color') { const alpha = colorAlpha(value); if (alpha === 0) return 'makes its text invisible'; if (alpha !== null && alpha < 0.5 && !state) return 'fades'; }
  if (prop === 'color' || /^background(?:-color)?$/.test(prop)) {
    const rule = decl.parent as Rule;
    const siblings = (rule.nodes || []).filter((node): node is Declaration => node.type === 'decl');
    const color = siblings.find(node => node.prop.toLowerCase() === 'color');
    const backgrounds = siblings.filter(node => /^background(?:-color)?$/i.test(node.prop));
    if (prop !== 'color' && flat(value) === 'currentcolor') return 'paints its background in its text colour';
    if (prop === 'color' && color === decl && backgrounds.some(node => flat(node.value) === flat(value))) return 'sets its text colour to its background';
  }
  return null;
}

function clampMotion(decl: Declaration, notes: Notes): void {
  const name = MOTION_PROPS[decl.prop.toLowerCase()];
  if (!name) return;
  const [min, max] = SOURCE_MOTION_LIMITS[name];
  const match = decl.value.trim().match(/^(-?\d*\.?\d+)(ms|s|px)?$/i);
  if (!match) { notes.add(`removed ${decl.prop}: ${decl.value} (not a number the kit can hold to its range)`); decl.remove(); return; }
  const raw = Number(match[1]) * (match[2]?.toLowerCase() === 's' ? 1000 : 1);
  const value = Math.min(max, Math.max(min, raw));
  if (value === raw) return;
  const unit = name === 'distance' ? 'px' : name === 'parallax' || name === 'press' ? '' : 'ms';
  notes.add(`clamped ${decl.prop} from ${decl.value.trim()} to ${value}${unit} (allowed ${min}–${max}${unit})`);
  decl.value = `${value}${unit}`;
}

/** A rule's selectors resolved against CSS nesting (`&`, or a relative selector) and `@scope (root)` (`:scope`). */
function effectiveSelectors(rule: Rule): string[] {
  const own = splitSelectors(rule.selector);
  for (let parent = rule.parent as Container | undefined; parent && parent.type !== 'root'; parent = parent.parent as Container | undefined) {
    const scope = parent.type === 'atrule' && (parent as AtRule).name.toLowerCase() === 'scope' ? (parent as AtRule).params.match(/^\s*\(([^)]*)\)/)?.[1] : undefined;
    if (parent.type !== 'rule' && !scope) continue;
    const outer = scope ? splitSelectors(scope) : effectiveSelectors(parent as Rule);
    return outer.flatMap(base => own.map(selector => {
      const nested = scope ? selector.replace(/:scope\b/gi, '&') : selector;
      return nested.includes('&') ? nested.replace(/&/g, `:is(${base})`) : `${base} ${nested}`;
    }));
  }
  return own;
}

function checkProtected(decl: Declaration, notes: Notes): void {
  const rule = decl.parent;
  if (!rule || rule.type !== 'rule' || insideKeyframes(decl)) return;
  for (const selector of effectiveSelectors(rule as Rule)) {
    const hit = protectedSelector(selector);
    if (!hit.protected) continue;
    const reason = protectedViolation(decl, hit.state, hit.protected);
    if (!reason) continue;
    notes.add(`removed \`${decl.prop}:${decl.value.trim()}\` on ${selector} (${reason} a protected ${hit.protected === 'element' ? 'element' : 'product-page container'})`);
    decl.remove();
    return;
  }
}

/**
 * A positioned ::before/::after on a kit surface can sit over the buy button and take its clicks (the pseudo-element's
 * clicks go to the card, not the button). Such an overlay gets pointer-events:none; it still paints.
 */
function releaseOverlays(root: Root, notes: Notes): void {
  root.walkRules(rule => {
    if (insideKeyframes(rule)) return;
    const decls = (rule.nodes || []).filter((node): node is Declaration => node.type === 'decl');
    if (!decls.some(decl => decl.prop.toLowerCase() === 'position' && /^(?:absolute|fixed)\b/i.test(decl.value.trim()))) return;
    const events = decls.filter(decl => decl.prop.toLowerCase() === 'pointer-events');
    if (events.length && events.every(decl => /^none\b/i.test(decl.value.trim()))) return;
    const selectors = splitSelectors(rule.selector);
    const overlays = selectors.filter(selector => {
      const parts = compounds(selector), subject = parts.at(-1) ?? '';
      return /::?(?:before|after)\b/i.test(subject) && parts.some(part => KIT_ROOT.test(withoutNot(part)));
    });
    if (!overlays.length) return;
    if (overlays.length === selectors.length) { events.forEach(decl => decl.remove()); rule.append({ prop: 'pointer-events', value: 'none' }); }
    else rule.after(postcss.rule({ selector: overlays.join(', '), nodes: [postcss.decl({ prop: 'pointer-events', value: 'none' })] }));
    notes.add(`added pointer-events:none to ${overlays.join(', ')} (a positioned overlay must not take the buy button's clicks)`);
  });
}

function removeEmpty(container: Container): void {
  container.each(node => {
    if ((node.type === 'rule' || node.type === 'atrule') && (node as Container).nodes) {
      removeEmpty(node as Container);
      if (!(node as Container).nodes!.length) node.remove();
    }
  });
}

/** The store's other stylesheets: protected elements and --motion-* ranges only. Byte-identical when clean. */
export function validateAuthoredCss(css: string, path: string): { css: string; repairs: string[] } {
  let root: Root;
  try { root = postcss.parse(css); } catch { return { css, repairs: [] }; }
  const notes = new Notes(path);
  root.walkDecls(decl => { clampMotion(decl, notes); if (decl.parent) checkProtected(decl, notes); });
  releaseOverlays(root, notes);
  if (!notes.size) return { css, repairs: [] };
  root.walkRules(rule => { if (!rule.nodes.length) rule.remove(); });
  return { css: root.toString(), repairs: notes.list() };
}

const rebaseAssets = (value: string) => value.replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/gi, (whole, _quote, target: string) => {
  const match = target.trim().match(ASSET_URL);
  return match ? `url("../${match[1]}/${match[2]}")` : whole;
});
function checkResources(decl: Declaration, notes: Notes): void {
  const value = decl.value;
  if (/image-set\(/i.test(value)) { notes.add(`removed \`${decl.prop}\` (image-set is not allowed; use url(assets/…))`); decl.remove(); return; }
  for (const match of value.matchAll(/url\(\s*(["']?)([^"')]*)\1\s*\)/gi)) {
    if (!ASSET_URL.test(match[2].trim())) { notes.add(`removed \`${decl.prop}\` with url(${match[2].slice(0, 60)}) (only bundled assets/ and motifs/ files)`); decl.remove(); return; }
  }
  if (/url\(/i.test(value.replace(/url\(\s*(["']?)[^"')]*\1\s*\)/gi, ''))) { notes.add(`removed \`${decl.prop}\` (unreadable url())`); decl.remove(); }
}

/** Store kit CSS (plain or served form) → the served form (or the plain validated rules), or '' when nothing is left. */
export function validateStoreKitCss(css: string, path = SOURCE_KIT_CSS_PATH, form: 'served' | 'plain' = 'served'): { css: string; repairs: string[] } {
  const notes = new Notes(path);
  let root: Root;
  try { root = postcss.parse(css); } catch { notes.add('could not be parsed; removed'); return { css: '', repairs: notes.list() }; }
  // Back to plain rules: a previous served form (or the model's own layers) is unwrapped, the platform scope removed.
  root.walkComments(comment => { comment.remove(); });
  root.walkAtRules(/^layer$/i, layer => {
    const ours = !layer.nodes ? /^pagosya-/.test(layer.params.trim()) : layer.params.trim() === 'pagosya-store-kit';
    if (!ours) notes.add(`removed the @layer ${layer.params.trim()} ${layer.nodes ? 'wrapper' : 'statement'} (the platform assigns the layer)`);
    if (layer.nodes) layer.replaceWith(...layer.nodes); else layer.remove();
  });
  root.walkRules(rule => { if (rule.selector.includes('#pagosya-store-kit')) rule.selector = splitSelectors(rule.selector).map(s => s.split(`${STORE_KIT_SCOPE} `).join('').split(':not(#pagosya-store-kit)').join('')).join(', '); });
  root.walkAtRules(atRule => {
    if (ALLOWED_AT_RULES.has(atRule.name.toLowerCase())) return;
    notes.add(`removed @${atRule.name}${atRule.name.toLowerCase() === 'font-face' ? ' (declare fonts in the store\'s main stylesheet)' : atRule.name.toLowerCase() === 'import' ? ' (no external or imported styles)' : ''}`);
    atRule.remove();
  });
  root.walkRules(rule => {
    if (insideKeyframes(rule)) return;
    if (rule.parent?.type === 'rule') { notes.add(`removed a nested rule (${rule.selector}) inside ${(rule.parent as Rule).selector}`); rule.remove(); return; }
    const selectors = splitSelectors(rule.selector);
    const kinds = selectors.map(kitSelector);
    selectors.forEach((selector, index) => { if (!kinds[index]) notes.add(`removed selector ${selector} (not a kit surface)`); });
    const surface = selectors.filter((_, index) => kinds[index] === 'surface'), tokens = selectors.filter((_, index) => kinds[index] === 'root');
    if (tokens.length) {
      const tokenRule = rule.clone({ selector: tokens.join(', ') });
      tokenRule.each(node => { if (node.type === 'decl' && !/^--(?:kit|motion)-/i.test(node.prop)) { notes.add(`removed \`${node.prop}\` on ${tokenRule.selector} (a :root rule here sets only --kit-* and --motion-* tokens)`); node.remove(); } });
      rule.before(tokenRule);
    }
    if (!surface.length) rule.remove();
    else if (surface.length !== selectors.length) rule.selector = surface.join(', ');
  });
  root.walkDecls(decl => {
    if (decl.important) { notes.add(`dropped !important on \`${decl.prop}\` (the store kit layer already outranks the kit)`); decl.important = false; }
    checkResources(decl, notes);
    if (!decl.parent) return;
    clampMotion(decl, notes);
    if (decl.parent) checkProtected(decl, notes);
  });
  releaseOverlays(root, notes);
  removeEmpty(root);
  if (Buffer.byteLength(root.toString()) > SOURCE_KIT_CSS_MAX_BYTES) {
    while (root.nodes.length && Buffer.byteLength(root.toString()) > SOURCE_KIT_CSS_MAX_BYTES) root.last!.remove();
    notes.add('trimmed the last rules to stay within 12 KB');
  }
  if (!root.nodes.length) return { css: '', repairs: notes.list() };
  return { css: form === 'plain' ? root.toString().trim() : servedForm(root), repairs: notes.list() };
}

/** Surface rules in the store-kit layer; product-page rules unlayered, scoped by one ID (never released by the kit). */
function servedForm(plain: Root): string {
  const layered = plain.clone(), product = plain.clone();
  layered.walkRules(rule => {
    if (insideKeyframes(rule)) return;
    const selectors = splitSelectors(rule.selector), kept = selectors.filter(selector => !SOURCE_KIT_PRODUCT_HOOK.test(selector));
    if (!kept.length) rule.remove(); else if (kept.length !== selectors.length) rule.selector = kept.join(', ');
  });
  product.walkAtRules(/keyframes$/i, keyframes => { keyframes.remove(); });
  product.walkRules(rule => {
    const kept = splitSelectors(rule.selector).filter(selector => SOURCE_KIT_PRODUCT_HOOK.test(selector));
    if (!kept.length) { rule.remove(); return; }
    rule.selector = kept.map(selector => {
      const first = compounds(selector)[0];
      return QUALIFIER.test(first) ? first + ':not(#pagosya-store-kit)' + selector.slice(first.length) : `${STORE_KIT_SCOPE} ${selector}`;
    }).join(', ');
  });
  const text = (root: Root) => {
    removeEmpty(root);
    root.walkDecls(decl => { if (/url\(/i.test(decl.value)) decl.value = rebaseAssets(decl.value); });
    root.each(node => { node.raws.before = '\n'; });
    root.raws.after = '';
    return root.toString();
  };
  const surface = text(layered), page = text(product);
  return `${HEADER}\n${STORE_KIT_LAYER_ORDER}\n${surface ? `@layer pagosya-store-kit {${surface}\n}\n` : ''}${page ? page.slice(1) + '\n' : ''}`;
}

/* ---- project files ---- */
const KIT_BLOCK = /\/\*\s*pagosya-kit:start\s*\*\/([\s\S]*?)(?:\/\*\s*pagosya-kit:end\s*\*\/|$)/g;
const BLOCK_PLACEHOLDER = '/*pagosya-kit-block*/';
const PLATFORM_CSS = new Set(['commerce-pages.css', 'brand.css', SOURCE_KIT_CSS_PATH]);

/** The component-mode block(s) of globals.css, concatenated, and the file without them. */
export function extractKitBlock(css: string): { rest: string; block: string | null } {
  let block: string | null = null;
  const rest = css.replace(KIT_BLOCK, (_match, inner: string) => { block = (block ?? '') + inner; return ''; });
  return { rest, block };
}

/** The link the platform owns: after the store's stylesheet; data-pagosya-kit exempts it from the product-page release. */
export const storeKitLink = (prefix = '') => `<link rel="stylesheet" href="${prefix}${SOURCE_KIT_CSS_PATH}" data-pagosya-kit="store">`;
function linkStoreKit(html: string, path: string, present: boolean): string {
  let out = html.replace(/<link\b[^>]*\bhref\s*=\s*["'](?:\.\.?\/)*styles\/kit\.css["'][^>]*>/gi, '');
  // Only the platform marks a stylesheet as the kit's own.
  out = out.replace(/(<(?:link|style)\b[^>]*?)\s+data-pagosya-kit(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?/gi, '$1');
  if (!present) return out;
  const link = storeKitLink('../'.repeat(path.split('/').length - 1));
  const styles = out.match(/<link\b[^>]*\bhref\s*=\s*["'](?:\.\.?\/)*styles\.css["'][^>]*>/i);
  if (styles) return out.replace(styles[0], styles[0] + link);
  if (/<\/head>/i.test(out)) return out.replace(/<\/head>/i, link + '</head>');
  return out.replace(/^(\s*<!doctype[^>]*>)?/i, (doctype = '') => doctype + link);
}

/**
 * The validated free-CSS layer on a project's files. Static: styles/kit.css becomes its served form (removed when nothing
 * valid is left) and every page links it; component mode: the globals.css block keeps plain validated rules (the compile
 * serves them). `authored` also checks the store's other stylesheets (a generation); a merchant's own save leaves them.
 */
export function applySourceKitCss<T extends SourceProjectFileDto>(files: T[], options: { next: boolean; authored?: boolean }): { files: T[]; repairs: string[] } {
  const authored = options.authored !== false;
  const repairs: string[] = [];
  const text = (file: SourceProjectFileDto) => file.encoding !== 'base64' && typeof file.content === 'string';
  if (options.next) {
    return { files: files.map(file => {
      if (file.path !== 'styles/globals.css' || !text(file)) return file;
      let count = 0, block: string | null = null;
      let content = file.content.replace(KIT_BLOCK, (_match, inner: string) => { block = (block ?? '') + inner; return count++ ? '' : BLOCK_PLACEHOLDER; });
      if (authored) { const checked = validateAuthoredCss(content, file.path); content = checked.css; repairs.push(...checked.repairs); }
      if (block !== null) {
        const kit = validateStoreKitCss(block, file.path, 'plain');
        repairs.push(...kit.repairs);
        content = content.replace(BLOCK_PLACEHOLDER, kit.css ? `/* pagosya-kit:start */\n${kit.css}\n/* pagosya-kit:end */` : '');
      }
      return content === file.content ? file : { ...file, content };
    }), repairs };
  }
  let present = false;
  const checked = files.flatMap(file => {
    if (!text(file)) return [file];
    if (file.path === SOURCE_KIT_CSS_PATH) {
      const kit = validateStoreKitCss(file.content, file.path);
      repairs.push(...kit.repairs);
      if (!kit.css) return [];
      present = true;
      return [kit.css === file.content ? file : { ...file, content: kit.css }];
    }
    if (authored && file.path.endsWith('.css') && !PLATFORM_CSS.has(file.path)) {
      const css = validateAuthoredCss(file.content, file.path);
      repairs.push(...css.repairs);
      return [css.css === file.content ? file : { ...file, content: css.css }];
    }
    return [file];
  });
  return { files: checked.map(file => {
    if (!file.path.endsWith('.html') || !text(file)) return file;
    const content = linkStoreKit(file.content, file.path, present);
    return content === file.content ? file : { ...file, content };
  }), repairs };
}

/* ---- prompt ---- */
const kitCssDirection = (where: string) => `Kit-surface CSS goes ${where}: plain rules on kit classes (.cart-drawer, .cart-added, .checkout-review, .product-detail__*, .menu-add, .checkout-button…). It outranks the kit and DNA, is the only CSS that restyles the product page and may set --kit-btn-* and --motion-* tokens. Prices, totals, pay and buy buttons, quantity, legal and status text are never hidden, faded, scaled down or under 12px.`;
/** Prompt guidance (stable across stores). The validator enforces it; the prompt only avoids wasted rules. */
export const SOURCE_KIT_CSS_DIRECTION = kitCssDirection('in styles/kit.css');
export const SOURCE_KIT_CSS_DIRECTION_NEXT = kitCssDirection('in styles/globals.css between /* pagosya-kit:start */ and /* pagosya-kit:end */');
