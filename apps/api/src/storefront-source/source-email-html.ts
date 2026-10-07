import juice from 'juice';
import { parse, serialize, type DefaultTreeAdapterMap } from 'parse5';
import { ORDER_EMAIL_MAX_BYTES, ORDER_EMAIL_REQUIRED_SLOTS, ORDER_EMAIL_TEMPLATE_PATH } from '../order-emails/order-email-slots';

type Element = DefaultTreeAdapterMap['element'];
type Node = DefaultTreeAdapterMap['node'];

/** Email clients render a narrow vocabulary; everything else is removed rather than trusted. */
const ALLOWED = new Set(['html', 'head', 'meta', 'title', 'body', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th',
  'a', 'p', 'h1', 'h2', 'h3', 'span', 'strong', 'em', 'b', 'i', 'img', 'div', 'ul', 'ol', 'li', 'br', 'hr', 'center']);
const BANNED_DECLS = /(?:^|;)\s*(?:display\s*:\s*(?:flex|grid|inline-flex|inline-grid)|position\s*:\s*[a-z]+)\s*(?=;|$)/gi;
/** A currency amount: Bs / BOB / USD / $ followed by a digit. */
const LITERAL_AMOUNT = /\b(?:Bs|BOB|USD|\$)\s?\d/;

const isElement = (node: Node): node is Element => 'tagName' in node;
const children = (node: Node): Node[] => ('childNodes' in node ? (node.childNodes as Node[]) : []);
function* walk(node: Node): Generator<Element> {
  for (const child of children(node)) if (isElement(child)) { yield child; yield* walk(child); }
}
const has = (el: Element, name: string) => el.attrs.some(a => a.name === name);
function remove(el: Element) {
  const parent: any = (el as any).parentNode;
  if (parent) parent.childNodes = parent.childNodes.filter((c: Node) => c !== el);
}
const textOf = (el: Element): string =>
  children(el).map(c => (isElement(c) ? textOf(c) : ((c as any).value ?? ''))).join('');

/** Reserves the closing tags, then trims a severed UTF-8 sequence back inside the budget. */
function clampHtml(html: string, maxBytes: number, suffix: string): string {
  const room = maxBytes - Buffer.byteLength(suffix, 'utf8');
  if (room <= 0) return suffix.slice(0, maxBytes);
  let body = Buffer.from(html, 'utf8').subarray(0, room).toString('utf8');
  while (body && Buffer.byteLength(body, 'utf8') > room) body = body.slice(0, -1);
  return body + suffix;
}

/**
 * Validated authored email. Like `validateStoreKitCss`, this never throws on content:
 * violations are stripped, clamped or dropped, and reported. `usable` is false when the
 * result is no longer a receipt, and the caller falls back to the kit floor.
 */
export function validateOrderEmailHtml(input: string, path = ORDER_EMAIL_TEMPLATE_PATH): { html: string; repairs: string[]; usable: boolean } {
  const repairs: string[] = [];
  let source = input;
  try { source = juice(input, { removeStyleTags: true, preserveMediaQueries: true }); }
  catch { repairs.push(`${path}: style block could not be inlined, dropped`); }

  const doc = parse(source);

  for (const el of [...walk(doc as unknown as Node)]) {
    const tag = el.tagName.toLowerCase();
    if (!ALLOWED.has(tag)) { remove(el); repairs.push(`${path}: <${tag}> removed`); continue; }
    el.attrs = el.attrs.filter(a => {
      if (/^on/i.test(a.name)) { repairs.push(`${path}: ${a.name} handler removed`); return false; }
      if ((a.name === 'href' || a.name === 'src') && /^\s*(javascript|vbscript|data):/i.test(a.value)) {
        repairs.push(`${path}: unsafe ${a.name} removed`); return false;
      }
      return true;
    });
    const style = el.attrs.find(a => a.name === 'style');
    if (style) {
      BANNED_DECLS.lastIndex = 0;
      if (BANNED_DECLS.test(style.value)) {
        BANNED_DECLS.lastIndex = 0;
        style.value = style.value.replace(BANNED_DECLS, '').replace(/^;+|;+$/g, '');
        repairs.push(`${path}: layout declaration removed`);
      }
      // Gmail inverts an unpaired colour in dark mode until it is unreadable.
      if (/(?:^|;)\s*color\s*:/i.test(style.value) && !/background(?:-color)?\s*:/i.test(style.value)) {
        style.value = `${style.value.replace(/;+$/, '')};background:#ffffff`;
        repairs.push(`${path}: background added beside an unpaired colour`);
      }
    }
  }

  // Truthfulness: no literal amount where an order fact belongs. Static copy elsewhere is fine.
  for (const el of [...walk(doc as unknown as Node)]) {
    if (!has(el, 'data-order-items') && !has(el, 'data-order-total')) continue;
    if (!LITERAL_AMOUNT.test(textOf(el))) continue;
    repairs.push(`${path}: literal amount inside the order summary removed; the platform fills it`);
    for (const node of children(el)) if (!isElement(node)) (node as any).value = '';
  }

  let html = serialize(doc as any);
  if (Buffer.byteLength(html, 'utf8') > ORDER_EMAIL_MAX_BYTES) {
    repairs.push(`${path}: clamped to ${ORDER_EMAIL_MAX_BYTES} bytes`);
    html = clampHtml(html, ORDER_EMAIL_MAX_BYTES, '</body></html>');
  }
  const usable = ORDER_EMAIL_REQUIRED_SLOTS.every(slot => html.includes(slot));
  return { html, repairs, usable };
}
