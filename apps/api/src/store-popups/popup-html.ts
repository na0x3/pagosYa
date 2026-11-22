import { parseFragment, serialize, type DefaultTreeAdapterMap } from 'parse5';
import type { PopupStepKind } from './popup-flow';

/** Popups 2.0 (spec 2026-11-18 §5): YAPI's markup for one step, rebuilt from an allowlist (the pattern of design-engine/style-hero.ts
 *  sanitizeHeroHtml) and checked for the hooks the runtime needs. No scripts, handlers, outside links or outside images survive. */
export const MAX_STEP_HTML = 12_000;

type Node = DefaultTreeAdapterMap['node'];
type Element = DefaultTreeAdapterMap['element'];

const TAGS = new Set(['div', 'section', 'header', 'footer', 'p', 'h1', 'h2', 'h3', 'h4', 'span', 'strong', 'em', 'small', 'br', 'hr', 'img', 'picture', 'source',
  'button', 'ul', 'ol', 'li', 'figure', 'figcaption', 'label', 'input', 'svg', 'g', 'path', 'circle', 'rect', 'ellipse', 'line', 'polyline', 'polygon',
  // Harmless text and section tags YAPI reaches for (links stay out: the runtime does every navigation).
  'b', 'i', 'u', 's', 'mark', 'del', 'ins', 'sup', 'sub', 'blockquote', 'q', 'cite', 'time', 'article', 'aside', 'nav', 'main', 'dl', 'dt', 'dd', 'text', 'tspan', 'defs', 'lineargradient', 'radialgradient', 'stop', 'clippath']);
const ATTRS = new Set(['class', 'id', 'role', 'alt', 'src', 'srcset', 'width', 'height', 'loading', 'viewbox', 'd', 'fill', 'stroke', 'stroke-width', 'stroke-linecap',
  'stroke-linejoin', 'clip-path', 'offset', 'stop-color', 'stop-opacity', 'gradientunits', 'gradienttransform', 'fx', 'fy', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'points', 'transform', 'opacity', 'type', 'placeholder', 'autocomplete', 'inputmode', 'for', 'style']);
const INPUT_TYPES = new Set(['email', 'tel', 'text']);
// The store's own uploads and project assets only (an optional srcset descriptor after it).
const LOCAL = /^(?:\/v1\/uploads\/[A-Za-z0-9._-]+|assets\/[A-Za-z0-9._/-]+)(?:\s+\d+(?:\.\d+)?[wx])?$/;
const SCRIPTY = /javascript:|vbscript:|expression\s*\(|url\s*\(/i;

/** Only custom properties survive in a style attribute (`--tilt: 3deg`): the look itself lives in the scoped sheet. */
const customProperties = (style: string) => style.split(';').map(part => part.trim()).filter(part => /^--[\w-]+\s*:/.test(part) && !SCRIPTY.test(part)).join(';');

function cleanNode(parent: { childNodes: Node[] }): void {
  const kept: Node[] = [];
  for (const node of parent.childNodes) {
    if (node.nodeName === '#comment') continue;
    if (node.nodeName === '#text') { kept.push(node); continue; }
    const el = node as Element;
    const tag = el.tagName.toLowerCase();
    if (!TAGS.has(tag)) continue;
    el.attrs = el.attrs.flatMap(attr => {
      const name = attr.name.toLowerCase(), value = attr.value.trim();
      // SVG paints may point at a gradient or clip inside the drawing (`url(#g1)`), never anywhere else.
      if (['fill', 'stroke', 'clip-path'].includes(name) && /^url\(#[A-Za-z][\w-]{0,40}\)$/.test(value)) return [attr];
      if (name.startsWith('on') || SCRIPTY.test(value) && name !== 'style') return [];
      if (name.startsWith('data-') || name.startsWith('aria-')) return [attr];
      if (!ATTRS.has(name)) return [];
      if (name === 'src') return LOCAL.test(value) ? [attr] : [];
      if (name === 'srcset') return value.split(',').every(candidate => LOCAL.test(candidate.trim())) ? [attr] : [];
      if (name === 'style') { const kept = customProperties(value); return kept ? [{ ...attr, value: kept }] : []; }
      return [attr];
    });
    // The picker's photo slot is filled by the platform per product: it is the one image allowed without a src.
    if (tag === 'img' && !el.attrs.some(attr => attr.name === 'src' || (attr.name === 'data-slot' && attr.value === 'photo'))) continue;
    if (tag === 'input') {
      const type = (el.attrs.find(attr => attr.name === 'type')?.value ?? 'text').toLowerCase();
      if (!INPUT_TYPES.has(type)) continue;
    }
    cleanNode(el);
    kept.push(node);
  }
  parent.childNodes = kept;
}

function elements(root: { childNodes: Node[] }, out: Element[] = []): Element[] {
  for (const node of root.childNodes) {
    if (node.nodeName.startsWith('#')) continue;
    const el = node as Element;
    out.push(el);
    elements(el, out);
  }
  return out;
}
const attr = (el: Element, name: string) => el.attrs.find(a => a.name === name)?.value;
const hasAttr = (el: Element, name: string, value?: string) => el.attrs.some(a => a.name === name && (value === undefined || a.value === value));

/** The first hook a step of this kind is missing, in the words YAPI gets back on a retry. */
function hookProblem(root: { childNodes: Node[] }, kind: PopupStepKind | 'launcher'): string | null {
  const all = elements(root);
  const some = (name: string, value?: string) => all.some(el => hasAttr(el, name, value));
  // The launcher is a small tab that opens the popup again: no fields, no hooks of its own.
  if (kind === 'launcher') return all.some(el => el.tagName === 'input' || el.tagName === 'button' || hasAttr(el, 'data-field') || hasAttr(el, 'data-submit')) ? 'La pestaña no lleva campos ni botones: la plataforma la hace un botón.' : null;
  if (!some('data-close')) return 'Falta [data-close] (el botón para cerrar).';
  if (kind === 'offer' && !some('data-next')) return 'Falta [data-next] (el botón para seguir).';
  if (kind === 'game' && !some('data-game-surface')) return 'Falta [data-game-surface] (dónde va el juego).';
  // One tile template the platform repeats per product (pick) or per cart line (cart, spec 2026-11-21).
  const tileProblem = (what: string) => {
    const tiles = all.filter(el => hasAttr(el, 'data-tile'));
    if (tiles.length !== 1) return `Hace falta exactamente un [data-tile] (la plantilla de cada ${what}).`;
    const inside = elements(tiles[0]);
    for (const slot of ['photo', 'name']) if (!inside.some(el => attr(el, 'data-slot') === slot)) return `Falta data-slot="${slot}" dentro de [data-tile].`;
    return null;
  };
  if (kind === 'pick') { const problem = tileProblem('producto'); if (problem) return problem; }
  if (kind === 'cart') { const problem = tileProblem('producto del carrito'); if (problem) return problem; }
  if (kind === 'remind' && !some('data-slot', 'code')) return 'Falta data-slot="code" (dónde va su código).';
  if (kind === 'remind' && !some('data-apply')) return 'Falta un botón data-apply en remind (usa el código).';
  if (kind === 'quiz') {
    if (!some('data-question')) return 'Falta [data-question] (dónde va la pregunta).';
    if (all.filter(el => hasAttr(el, 'data-choice')).length !== 1) return 'Hace falta exactamente un [data-choice] (la plantilla de cada respuesta).';
  }
  if (kind === 'capture') {
    if (!some('data-field')) return 'Falta [data-field] (el campo de WhatsApp o email).';
    if (!some('data-submit')) return 'Falta [data-submit] (el botón para enviar).';
  }
  if (kind === 'reveal' && !some('data-slot', 'code')) return 'Falta data-slot="code" (dónde va el código).';
  if (kind === 'reveal' && !some('data-next')) return 'Falta un botón data-next en reveal (lleva al producto con el código).';
  return null;
}

export function cleanStepHtml(html: string, kind: PopupStepKind | 'launcher'): { html: string } | { problem: string } {
  if (typeof html !== 'string' || !html.trim()) return { problem: 'El paso está vacío.' };
  if (html.length > MAX_STEP_HTML) return { problem: `El paso es demasiado grande (máx. ${MAX_STEP_HTML.toLocaleString('es')} caracteres).` };
  // A real step has a few hundred tags; thousands only come from nesting bombs that make the parser slow.
  if (html.split('<').length > 1500) return { problem: 'El paso tiene demasiadas etiquetas.' };
  try {
    const fragment = parseFragment(html);
    cleanNode(fragment);
    const raw = serialize(fragment).trim();
    // The browser re-parses what we emit: unless parse → serialise is a fixed point, the tree we checked is not the tree it builds.
    if (serialize(parseFragment(raw)).trim() !== raw) return { problem: 'El HTML del paso no es estable al volver a leerlo.' };
    if (/\b(?:https?|ftp|wss?):/i.test(raw) || /(?:^|[\s"'(=,>])\/\/[^\s"'/]/.test(raw)) return { problem: 'El paso apunta fuera de la tienda.' };
    const problem = hookProblem(parseFragment(raw), kind);
    return problem ? { problem } : { html: raw };
  } catch {
    return { problem: 'El HTML del paso no se pudo leer.' };
  }
}
