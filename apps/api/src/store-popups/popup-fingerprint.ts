import { createHash } from 'node:crypto';
import { parseFragment, type DefaultTreeAdapterMap } from 'parse5';

/** Popups 2.0 (spec 2026-11-18 §6): how a design is built, not what it says — so two stores never get the same composition
 *  (the Nov 8 designer drifted to one photo split for every store). Words, images and colours never change it; the order and
 *  nesting of the parts and the sheet's layout choices do. */
type Node = DefaultTreeAdapterMap['node'];
type Element = DefaultTreeAdapterMap['element'];

const children = (node: { childNodes?: Node[] }) => (node.childNodes ?? []).filter(child => !child.nodeName.startsWith('#')) as Element[];
const skeleton = (el: Element, depth: number): string => {
  const kids = depth < 3 ? children(el) : [];
  return `${el.tagName}${kids.length ? `(${kids.map(kid => skeleton(kid, depth + 1)).join(',')})` : ''}`;
};

function cssLayout(css: string): string[] {
  const features = new Set<string>();
  for (const m of css.matchAll(/display\s*:\s*(grid|flex|inline-flex|inline-grid)/gi)) features.add(`display:${m[1].toLowerCase()}`);
  for (const m of css.matchAll(/flex-direction\s*:\s*([a-z-]+)/gi)) features.add(`direction:${m[1].toLowerCase()}`);
  for (const m of css.matchAll(/grid-template-columns\s*:\s*([^;}]+)/gi)) features.add(`columns:${m[1].trim().split(/\s+(?![^(]*\))/).length}`);
  if (/position\s*:\s*absolute/i.test(css)) features.add('absolute');
  return [...features].sort();
}

export function popupFingerprint(steps: Record<string, string>, css: string): string {
  const shape = Object.values(steps).map(html => children(parseFragment(html)).map(el => skeleton(el, 0)).join('+'));
  return createHash('sha256').update(JSON.stringify({ shape, layout: cssLayout(css) })).digest('hex').slice(0, 16);
}

const STOP = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'con', 'a', 'al', 'en', 'y', 'un', 'una', 'the', 'with', 'and']);
const words = (text: string) => text.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().split(/[^a-z0-9]+/).filter(word => word && !STOP.has(word)).join(' ');

/** Null when the candidate is new; otherwise the reason, in the words YAPI gets back on a retry. */
export function varietyProblem(candidate: { fingerprint: string; composition: string }, taken: Array<{ fingerprint: string; composition: string }>): string | null {
  const same = taken.find(other => other.fingerprint === candidate.fingerprint || (words(other.composition) && words(other.composition) === words(candidate.composition)));
  return same ? `Composición repetida: otra tienda ya usa «${same.composition}». Inventa otra disposición.` : null;
}
