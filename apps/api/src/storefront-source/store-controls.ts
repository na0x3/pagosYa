/**
 * Store controls (spec docs/superpowers/specs/2026-10-14-store-controls-design.md, part 2): one button language per store,
 * kept as config.controls beside config.look. Pure and clamped like store-look.ts: the header (source-header.ts), the kit
 * (commerce.js, controls.css) and the guard read only what sanitizeControls returns. Colours are absent by design: the
 * controls use the store's --store-* tokens through `colour` (accent, ink or paper).
 */
import { patchConfigFile, readConfigFile } from './store-look';

export const CONTROL_OUTLINES = ['rounded', 'pill', 'square', 'ticket', 'tag', 'sticker', 'tab', 'stamp', 'bracket', 'underline', 'blob'] as const;
export const CONTROL_BORDERS = ['none', 'hairline', 'solid', 'double', 'dashed', 'offset'] as const;
export const CONTROL_FILLS = ['solid', 'outline', 'ghost', 'inverted'] as const;
export const CONTROL_COLOURS = ['accent', 'ink', 'paper'] as const;
export const CART_LAYOUTS = ['icon+word', 'icon', 'word'] as const;
export const ACCOUNT_LAYOUTS = ['icon', 'word', 'icon+word'] as const;
export const CONTROL_BADGES = ['dot', 'circle', 'inline', 'corner', 'stamp'] as const;
export const CONTROL_SOURCES = ['yapi', 'library'] as const;
export const ICON_SLOTS = ['cart', 'account', 'menu', 'search', 'plus', 'minus', 'close'] as const;
export const ICON_MAX_CHARS = 1500;
export const WORD_MAX_CHARS = 14;
export const CONTROL_RANGES = { corner: [0, 24], notch: [0, 10], tilt: [-6, 6], weight: [1, 3] } as const;

export type ControlOutline = (typeof CONTROL_OUTLINES)[number];
export type ControlBorder = (typeof CONTROL_BORDERS)[number];
export type ControlFill = (typeof CONTROL_FILLS)[number];
export type ControlColour = (typeof CONTROL_COLOURS)[number];
export type CartLayout = (typeof CART_LAYOUTS)[number];
export type AccountLayout = (typeof ACCOUNT_LAYOUTS)[number];
export type ControlBadge = (typeof CONTROL_BADGES)[number];
export type IconSlot = (typeof ICON_SLOTS)[number];
export type StoreControls = {
  version: 1;
  shape: { outline: ControlOutline; corner: number; notch: number; tilt: number; border: ControlBorder; weight: number; fill: ControlFill; colour: ControlColour };
  layout: { cart: CartLayout; account: AccountLayout };
  icons: Partial<Record<IconSlot, string>>;
  words: { cart?: string; account?: string };
  badge: ControlBadge;
  source: (typeof CONTROL_SOURCES)[number];
};

type Point = [number, number];
const ICON_CHARS = /^[MmLlHhVvCcSsQqTtAaZz0-9eE.,+\-\s]+$/;
const PARAMS: Record<string, number> = { m: 2, l: 2, h: 1, v: 1, c: 6, s: 4, q: 4, t: 2, a: 7 };
const NUMBER = /[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/y;
/** Curves are sampled for the area check; their control points are checked against the box directly (a Bézier stays in its hull). */
const EDGE = 0.05, CURVE_STEPS = 12, ARC_STEPS = 32;
/** The even-odd fill is rasterised on a 48×48 grid of the 24×24 box: fewer painted cells than this is no drawing at all. */
const GRID = 48, MIN_PAINTED_CELLS = 8;

const cubicAt = (p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point => {
  const u = 1 - t;
  return [u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0], u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]];
};
const quadAt = (p0: Point, p1: Point, p2: Point, t: number): Point => {
  const u = 1 - t;
  return [u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]];
};
/** Points along an SVG elliptical arc (endpoint parameterisation, SVG 1.1 implementation notes F.6.5), ending exactly at its end. */
function arcPoints(x1: number, y1: number, rxIn: number, ryIn: number, angle: number, large: number, sweep: number, x2: number, y2: number): Point[] {
  let rx = Math.abs(rxIn), ry = Math.abs(ryIn);
  if (!rx || !ry || (x1 === x2 && y1 === y2)) return [[x2, y2]];
  const phi = (angle * Math.PI) / 180, cos = Math.cos(phi), sin = Math.sin(phi);
  const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2;
  const x1p = cos * dx + sin * dy, y1p = -sin * dx + cos * dy;
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) { const scale = Math.sqrt(lambda); rx *= scale; ry *= scale; }
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  const coef = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, num / den));
  const cxp = coef * ((rx * y1p) / ry), cyp = coef * (-(ry * x1p) / rx);
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2, cy = sin * cxp + cos * cyp + (y1 + y2) / 2;
  const angleOf = (ux: number, uy: number, vx: number, vy: number) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const theta = angleOf(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let delta = angleOf((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!sweep && delta > 0) delta -= 2 * Math.PI; else if (sweep && delta < 0) delta += 2 * Math.PI;
  const points: Point[] = [];
  for (let k = 1; k < ARC_STEPS; k++) {
    const t = theta + (delta * k) / ARC_STEPS, ex = rx * Math.cos(t), ey = ry * Math.sin(t);
    points.push([cos * ex - sin * ey + cx, sin * ex + cos * ey + cy]);
  }
  points.push([x2, y2]);
  return points;
}
/** Cells of a 48×48 grid whose centre the even-odd fill of `subpaths` covers (each subpath closed, as a fill closes it). */
function paintedCells(subpaths: Point[][]): number {
  const edges: Array<[number, number, number, number]> = [];
  for (const points of subpaths) for (let k = 0; k < points.length; k++) {
    const [ax, ay] = points[k], [bx, by] = points[(k + 1) % points.length];
    if (ay !== by) edges.push([ax, ay, bx, by]);
  }
  let cells = 0;
  for (let row = 0; row < GRID; row++) {
    const y = ((row + 0.5) * 24) / GRID;
    const crossings: number[] = [];
    for (const [ax, ay, bx, by] of edges) if ((ay <= y) !== (by <= y)) crossings.push(ax + ((y - ay) * (bx - ax)) / (by - ay));
    crossings.sort((a, b) => a - b);
    for (let col = 0; col < GRID; col++) {
      const x = ((col + 0.5) * 24) / GRID;
      let inside = false;
      for (const cross of crossings) { if (cross > x) break; inside = !inside; }
      if (inside) cells++;
    }
  }
  return cells;
}

/** One icon: SVG path data only, parsed command by command, every point inside the 24×24 box, and something visible drawn. */
export function parseIconPath(raw: unknown): { ok: true; d: string } | { ok: false; reason: string } {
  if (typeof raw !== 'string') return { ok: false, reason: 'not text' };
  const d = raw.trim().replace(/\s+/g, ' ');
  if (!d) return { ok: false, reason: 'empty' };
  if (d.length > ICON_MAX_CHARS) return { ok: false, reason: `longer than ${ICON_MAX_CHARS} characters` };
  if (!ICON_CHARS.test(d)) return { ok: false, reason: 'not path data' };
  let i = 0;
  const skip = () => { while (i < d.length && (d[i] === ' ' || d[i] === ',')) i++; };
  const number = (): number | null => {
    skip();
    NUMBER.lastIndex = i;
    const match = NUMBER.exec(d);
    if (!match) return null;
    i = NUMBER.lastIndex;
    const value = Number(match[0]);
    return Number.isFinite(value) ? value : null;
  };
  const flag = (): number | null => { skip(); return d[i] === '0' || d[i] === '1' ? Number(d[i++]) : null; };
  const checked: Point[] = [];
  const subpaths: Point[][] = [];
  let current: Point[] = [];
  let command = '', x = 0, y = 0, startX = 0, startY = 0;
  let cubic: Point | null = null, quad: Point | null = null;
  const to = (point: Point) => { if (!current.length) current.push([x, y]); checked.push(point); current.push(point); };
  for (;;) {
    skip();
    if (i >= d.length) break;
    if (/[MmLlHhVvCcSsQqTtAaZz]/.test(d[i])) command = d[i++];
    // `e` is allowed only inside a number (1e1); where a command belongs it is not path data.
    else if (d[i] === 'e' || d[i] === 'E') return { ok: false, reason: 'not path data' };
    else if (!command || command === 'z' || command === 'Z') return { ok: false, reason: 'numbers without a command' };
    if (!checked.length && command !== 'M' && command !== 'm') return { ok: false, reason: 'does not start with M' };
    const lower = command.toLowerCase(), relative = command === lower;
    if (lower === 'z') { if (current.length) subpaths.push(current); current = []; x = startX; y = startY; cubic = quad = null; continue; }
    const values: number[] = [];
    for (let k = 0; k < PARAMS[lower]; k++) {
      const value = lower === 'a' && (k === 3 || k === 4) ? flag() : number();
      if (value === null) return { ok: false, reason: `incomplete ${command} command` };
      values.push(value);
    }
    const px = (v: number) => relative ? x + v : v, py = (v: number) => relative ? y + v : v;
    if (lower === 'm') {
      const point: Point = [px(values[0]), py(values[1])];
      if (current.length) subpaths.push(current);
      current = [point];
      checked.push(point);
      [x, y] = point; [startX, startY] = point; cubic = quad = null;
      command = relative ? 'l' : 'L';
    } else if (lower === 'l' || lower === 'h' || lower === 'v') {
      const point: Point = lower === 'l' ? [px(values[0]), py(values[1])] : lower === 'h' ? [px(values[0]), y] : [x, py(values[0])];
      to(point); [x, y] = point; cubic = quad = null;
    } else if (lower === 'c' || lower === 's') {
      const first: Point = lower === 'c' ? [px(values[0]), py(values[1])] : cubic ? [2 * x - cubic[0], 2 * y - cubic[1]] : [x, y];
      const rest = lower === 'c' ? values.slice(2) : values;
      const second: Point = [px(rest[0]), py(rest[1])], end: Point = [px(rest[2]), py(rest[3])];
      checked.push(first, second);
      for (let k = 1; k <= CURVE_STEPS; k++) to(cubicAt([x, y], first, second, end, k / CURVE_STEPS));
      [x, y] = end; cubic = second; quad = null;
    } else if (lower === 'q' || lower === 't') {
      const control: Point = lower === 'q' ? [px(values[0]), py(values[1])] : quad ? [2 * x - quad[0], 2 * y - quad[1]] : [x, y];
      const end: Point = lower === 'q' ? [px(values[2]), py(values[3])] : [px(values[0]), py(values[1])];
      checked.push(control);
      for (let k = 1; k <= CURVE_STEPS; k++) to(quadAt([x, y], control, end, k / CURVE_STEPS));
      [x, y] = end; quad = control; cubic = null;
    } else {
      const end: Point = [px(values[5]), py(values[6])];
      for (const point of arcPoints(x, y, values[0], values[1], values[2], values[3], values[4], end[0], end[1])) to(point);
      [x, y] = end; cubic = quad = null;
    }
  }
  if (current.length) subpaths.push(current);
  if (!checked.length) return { ok: false, reason: 'no drawing' };
  if (checked.some(([cx, cy]) => !Number.isFinite(cx) || !Number.isFinite(cy) || cx < -EDGE || cy < -EDGE || cx > 24 + EDGE || cy > 24 + EDGE)) return { ok: false, reason: 'outside the 24×24 box' };
  if (paintedCells(subpaths) < MIN_PAINTED_CELLS) return { ok: false, reason: 'draws no visible area' };
  return { ok: true, d };
}

const WORD = /^[\p{L}\p{M}][\p{L}\p{M} '’.-]*$/u;
/** Words a model writes in English out of habit; the store speaks Spanish. */
const NOT_SPANISH = /^(?:cart|my cart|bag|my bag|basket|checkout|account|my account|log ?in|sign ?in|shop|store)$/i;
/** A control's word: 1–14 letters, no emoji or markup, trimmed, in the store's language; undefined when it is not one. */
export function cleanControlWord(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const word = raw.normalize('NFC').replace(/\s+/g, ' ').trim();
  if (!word || [...word].length > WORD_MAX_CHARS || !WORD.test(word) || NOT_SPANISH.test(word)) return undefined;
  return word;
}

const oneOf = <T extends string>(list: readonly T[], value: unknown): T | undefined => (list as readonly unknown[]).includes(value) ? value as T : undefined;
const clampTo = (value: unknown, [low, high]: readonly [number, number]): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(high, Math.max(low, Math.round(value * 2) / 2)) : undefined;

export type ControlsReport = { controls?: StoreControls; replacedIcons: IconSlot[]; droppedWords: Array<'cart' | 'account'>; reason?: string };
/** A record validated again (idempotent). Numbers are clamped; an unknown enum or a missing number drops the record; a bad icon
 *  takes `fallbackIcon(slot)` (left out without one); a bad word is left out. */
export function sanitizeControlsReport(raw: unknown, options: { fallbackIcon?: (slot: IconSlot) => string | undefined } = {}): ControlsReport {
  const drop = (reason: string): ControlsReport => ({ replacedIcons: [], droppedWords: [], reason });
  if (!raw || typeof raw !== 'object') return drop('no record');
  const input = raw as Record<string, any>;
  if (input.version !== 1) return drop('version');
  const shape = input.shape && typeof input.shape === 'object' ? input.shape : {};
  const outline = oneOf(CONTROL_OUTLINES, shape.outline), border = oneOf(CONTROL_BORDERS, shape.border), fill = oneOf(CONTROL_FILLS, shape.fill), colour = oneOf(CONTROL_COLOURS, shape.colour);
  const corner = clampTo(shape.corner, CONTROL_RANGES.corner), notch = clampTo(shape.notch, CONTROL_RANGES.notch), tilt = clampTo(shape.tilt, CONTROL_RANGES.tilt), weight = clampTo(shape.weight, CONTROL_RANGES.weight);
  const cart = oneOf(CART_LAYOUTS, input.layout?.cart), account = oneOf(ACCOUNT_LAYOUTS, input.layout?.account);
  const badge = oneOf(CONTROL_BADGES, input.badge), source = oneOf(CONTROL_SOURCES, input.source);
  if (!outline || !border || !fill || !colour) return drop('shape enum');
  if (corner === undefined || notch === undefined || tilt === undefined || weight === undefined) return drop('shape number');
  if (!cart || !account) return drop('layout enum');
  if (!badge) return drop('badge enum');
  if (!source) return drop('source enum');
  const icons: StoreControls['icons'] = {};
  const replacedIcons: IconSlot[] = [];
  const given = input.icons && typeof input.icons === 'object' ? input.icons as Record<string, unknown> : {};
  for (const slot of ICON_SLOTS) {
    if (given[slot] === undefined || given[slot] === '') continue;
    const parsed = parseIconPath(given[slot]);
    if (parsed.ok) { icons[slot] = parsed.d; continue; }
    replacedIcons.push(slot);
    const fallback = options.fallbackIcon?.(slot);
    if (fallback) icons[slot] = fallback;
  }
  const words: StoreControls['words'] = {};
  const droppedWords: Array<'cart' | 'account'> = [];
  for (const key of ['cart', 'account'] as const) {
    const value = input.words?.[key];
    if (value === undefined || value === '') continue;
    const word = cleanControlWord(value);
    if (word) words[key] = word; else droppedWords.push(key);
  }
  return { controls: { version: 1, shape: { outline, corner, notch, tilt, border, weight, fill, colour }, layout: { cart, account }, icons, words, badge, source }, replacedIcons, droppedWords };
}
export function sanitizeControls(raw: unknown, options: { fallbackIcon?: (slot: IconSlot) => string | undefined } = {}): StoreControls | undefined {
  return sanitizeControlsReport(raw, options).controls;
}

/** The record a file list's config.js carries, sanitized; undefined when it has none. */
export function readControls(files: ReadonlyArray<{ path: string; content: string }>): StoreControls | undefined {
  return sanitizeControls(readConfigFile(files).controls);
}
/** config.js with `controls` set to the record, or removed when it is undefined; every other file is returned as the same object. */
export function withControlsConfig<T extends { path: string; content: string }>(files: T[], controls: StoreControls | undefined): T[] {
  return patchConfigFile(files, ({ controls: _old, ...config }) => controls ? { ...config, controls } : config);
}
