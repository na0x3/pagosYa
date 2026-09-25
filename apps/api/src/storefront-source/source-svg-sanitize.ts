/** Sub-project 3 (illustrated motion), parent spec §5 gate 5: a DNA motif is a small line drawing the platform
 * inlines into kit slots, so its SVG is an allow-list, never a deny-list. Anything outside the lists below is removed
 * with its subtree (a disallowed wrapper does not leak its children), text survives only as escaped text, and the
 * result is size-capped. Pure: no DOM, parse5 (already the API's HTML parser) builds the tree. The kit and the checkout
 * verify inserted markup against the same element and attribute lists (a test pins them). */
import { parseFragment } from 'parse5';

export const MOTIF_SVG_MAX_BYTES = 6 * 1024;
const SVG_NS = 'http://www.w3.org/2000/svg';
export const MOTIF_SVG_ELEMENTS = ['svg', 'g', 'path', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'rect', 'defs', 'linearGradient', 'radialGradient', 'stop', 'clipPath', 'mask', 'title', 'desc'] as const;
export const MOTIF_SVG_ATTRIBUTES = [
  'viewBox', 'preserveAspectRatio', 'width', 'height', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'fx', 'fy', 'fr', 'd', 'points', 'pathLength',
  'fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-opacity',
  'opacity', 'color', 'transform', 'vector-effect', 'clip-path', 'clip-rule', 'mask', 'offset', 'stop-color', 'stop-opacity',
  'gradientUnits', 'gradientTransform', 'spreadMethod', 'clipPathUnits', 'maskUnits', 'maskContentUnits', 'class', 'id', 'data-part', 'aria-hidden', 'focusable',
] as const;
const ELEMENTS = new Set<string>(MOTIF_SVG_ELEMENTS);
const ATTRIBUTES = new Set<string>(MOTIF_SVG_ATTRIBUTES);
const DRAWABLE = new Set(['path', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'rect']);
const NON_RENDERED = new Set(['defs', 'clipPath', 'mask', 'linearGradient', 'radialGradient', 'title', 'desc']);
const LOCAL_REF = /^url\(\s*#([A-Za-z][\w-]*)\s*\)$/;

type Node = { nodeName: string; tagName?: string; namespaceURI?: string; attrs?: Array<{ name: string; value: string; prefix?: string }>; childNodes?: Node[]; value?: string };
export type MotifSvgResult = { svg?: string; removed: string[]; dropped?: string };

const escapeText = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeAttr = (value: string) => escapeText(value).replace(/"/g, '&quot;');

/** An attribute value is kept only when it cannot reach anything outside the drawing. */
function safeValue(name: string, value: string): boolean {
  if (/[<>"`\\]/.test(value) || /(?:javascript|vbscript|data)\s*:/i.test(value) || /expression\s*\(/i.test(value)) return false;
  if (/url\s*\(/i.test(value) && !LOCAL_REF.test(value.trim())) return false;
  if (name === 'data-part') return /^[a-z][a-z-]{0,23}$/.test(value);
  if (name === 'id') return /^[A-Za-z][\w-]{0,63}$/.test(value);
  return value.length <= 4000 || name === 'd' || name === 'points';
}

export function sanitizeMotifSvg(raw: string, options: { idPrefix?: string } = {}): MotifSvgResult {
  const removed = new Set<string>();
  const findSvg = (nodes: Node[] = []): Node | undefined => {
    for (const node of nodes) {
      if (node.tagName === 'svg' && node.namespaceURI === SVG_NS) return node;
      const inner = findSvg(node.childNodes);
      if (inner) return inner;
    }
  };
  const root = typeof raw === 'string' ? findSvg((parseFragment(raw) as unknown as Node).childNodes) : undefined;
  if (!root) return { removed: [], dropped: 'not an SVG drawing' };
  const prefix = options.idPrefix && /^[a-z][\w-]*$/i.test(options.idPrefix) ? options.idPrefix : '';
  const prefixed = (id: string) => prefix && !id.startsWith(prefix) ? prefix + id : id;
  let drawable = false;
  let viewBox = '';
  const serialize = (node: Node, hidden: boolean, isRoot: boolean): string => {
    if (node.nodeName === '#text') return escapeText(node.value ?? '');
    if (!node.tagName) return ''; // comments, doctypes, processing instructions
    if (node.namespaceURI !== SVG_NS || !ELEMENTS.has(node.tagName)) { removed.add(`<${node.tagName}>`); return ''; }
    const tag = node.tagName;
    if (DRAWABLE.has(tag) && !hidden) drawable = true;
    const attrs: string[] = isRoot ? [`xmlns="${SVG_NS}"`] : [];
    for (const attr of node.attrs ?? []) {
      const name = attr.prefix ? `${attr.prefix}:${attr.name}` : attr.name;
      if (isRoot && name === 'xmlns') continue;
      if (!ATTRIBUTES.has(name) || !safeValue(name, attr.value)) { removed.add(name); continue; }
      let value = attr.value;
      if (name === 'id') value = prefixed(value);
      const ref = value.trim().match(LOCAL_REF);
      if (ref) value = `url(#${prefixed(ref[1])})`;
      if (isRoot && name === 'viewBox') viewBox = value;
      attrs.push(`${name}="${escapeAttr(value)}"`);
    }
    if (isRoot && !validViewBox(viewBox)) {
      const size = (name: string) => node.attrs?.find(attr => attr.name === name)?.value.trim().match(/^(\d+(?:\.\d+)?)(?:px)?$/)?.[1];
      const [width, height] = [size('width'), size('height')];
      viewBox = width && height ? `0 0 ${width} ${height}` : '';
      const without = attrs.filter(attr => !attr.startsWith('viewBox='));
      attrs.splice(0, attrs.length, ...without, ...(viewBox ? [`viewBox="${viewBox}"`] : []));
    }
    const children = (node.childNodes ?? []).map(child => serialize(child, hidden || NON_RENDERED.has(tag), false)).join('');
    const open = `<${tag}${attrs.length ? ' ' + attrs.join(' ') : ''}`;
    return children ? `${open}>${children}</${tag}>` : `${open}/>`;
  };
  const svg = serialize(root, false, true);
  const notes = [...removed];
  if (!validViewBox(viewBox)) return { removed: notes, dropped: 'no usable viewBox' };
  if (!drawable) return { removed: notes, dropped: 'nothing to draw' };
  if (Buffer.byteLength(svg) > MOTIF_SVG_MAX_BYTES) return { removed: notes, dropped: 'over 6 KB after cleaning' };
  return { svg, removed: notes };
}

function validViewBox(value: string): boolean {
  const parts = value.trim().split(/[\s,]+/).map(Number);
  return parts.length === 4 && parts.every(Number.isFinite) && parts[2] > 0 && parts[3] > 0;
}
