import { parseFragment, type DefaultTreeAdapterMap } from 'parse5';

/** parse5 tree helpers shared by the store email assembler and the legacy receipt renderer. */
export type Element = DefaultTreeAdapterMap['element'];
export type Node = DefaultTreeAdapterMap['node'];

export const isElement = (node: Node): node is Element => 'tagName' in node;
export const kids = (node: Node): Node[] => ('childNodes' in node ? (node.childNodes as Node[]) : []);

export function* walk(node: Node): Generator<Element> {
  for (const child of kids(node)) if (isElement(child)) { yield child; yield* walk(child); }
}

export const attrOf = (el: Element, name: string) => el.attrs.find(a => a.name === name);
export const has = (el: Element, name: string) => attrOf(el, name) !== undefined;

export function setAttr(el: Element, name: string, value: string) {
  const existing = attrOf(el, name);
  if (existing) existing.value = value; else el.attrs.push({ name, value });
}

/** Text goes in as a text node, so parse5's serializer escapes it. Never string concatenation. */
export function setText(el: Element, value: string) {
  (el as any).childNodes = [{ nodeName: '#text', value, parentNode: el }];
}

export function remove(el: Element) {
  const parent: any = (el as any).parentNode;
  if (parent) parent.childNodes = parent.childNodes.filter((c: Node) => c !== el);
}

/**
 * Cuts `html` so that the result, closing tags included, fits the budget. The suffix is
 * reserved up front, and a cut that lands mid-character is trimmed back: a severed UTF-8
 * sequence decodes to U+FFFD, which re-encodes to three bytes and would breach the budget
 * the clamp exists to hold.
 */
export function clampHtml(html: string, maxBytes: number, suffix: string): string {
  const room = maxBytes - Buffer.byteLength(suffix, 'utf8');
  if (room <= 0) return suffix.slice(0, maxBytes);
  let body = Buffer.from(html, 'utf8').subarray(0, room).toString('utf8');
  while (body && Buffer.byteLength(body, 'utf8') > room) body = body.slice(0, -1);
  return body + suffix;
}

export const fragmentOf = (html: string): Node => parseFragment(html) as unknown as Node;
