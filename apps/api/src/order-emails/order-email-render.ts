import { parse, parseFragment, serialize, type DefaultTreeAdapterMap } from 'parse5';
import { ORDER_EMAIL_ATTRIBUTE_SLOTS, ORDER_EMAIL_RENDER_MAX_BYTES } from './order-email-slots';

type Element = DefaultTreeAdapterMap['element'];
type Node = DefaultTreeAdapterMap['node'];

export interface OrderEmailLine {
  name: string;
  variantName?: string | null;
  extras?: string | null;
  quantity: number;
  amount: string;
}

export interface OrderEmailData {
  storeName: string;
  logoUrl: string | null;
  customerName: string | null;
  orderId: string;
  items: OrderEmailLine[];
  total: string;
  originalTotal: string | null;
  trackingUrl: string | null;
  subscription: string | null;
  appointment: { name: string; date: string | null } | null;
}

const isElement = (node: Node): node is Element => 'tagName' in node;
const children = (node: Node): Node[] => ('childNodes' in node ? (node.childNodes as Node[]) : []);

function* walk(node: Node): Generator<Element> {
  for (const child of children(node)) if (isElement(child)) { yield child; yield* walk(child); }
}

const attrOf = (el: Element, name: string) => el.attrs.find(a => a.name === name);
const has = (el: Element, name: string) => attrOf(el, name) !== undefined;

function setAttr(el: Element, name: string, value: string) {
  const existing = attrOf(el, name);
  if (existing) existing.value = value; else el.attrs.push({ name, value });
}

/** Text goes in as a text node, so parse5's serializer escapes it. Never string concatenation. */
function setText(el: Element, value: string) {
  (el as any).childNodes = [{ nodeName: '#text', value, parentNode: el }];
}

function remove(el: Element) {
  const parent: any = (el as any).parentNode;
  if (parent) parent.childNodes = parent.childNodes.filter((c: Node) => c !== el);
}

/** Once filled, a slot attribute has done its job and should not reach the buyer. */
function detachSlots(el: Element) {
  el.attrs = el.attrs.filter(a => !a.name.startsWith('data-order-') && a.name !== 'data-store-logo' && a.name !== 'data-store-name');
}

/** Fills one slot, or removes the element when there is nothing truthful to put in it. */
function fill(el: Element, slot: string, value: string | null) {
  if (value === null || value === '') { remove(el); return; }
  const asAttribute = ORDER_EMAIL_ATTRIBUTE_SLOTS[slot];
  if (asAttribute) setAttr(el, asAttribute, value); else setText(el, value);
  detachSlots(el);
}

function sanitiseLines(items: unknown, repairs: string[]): OrderEmailLine[] {
  if (!Array.isArray(items)) { repairs.push('order lines: not a list, dropped'); return []; }
  const out: OrderEmailLine[] = [];
  for (const raw of items) {
    const line = raw as Partial<OrderEmailLine> | null;
    if (!line || typeof line.name !== 'string' || !line.name.trim() || !Number.isFinite(line.quantity) || Number(line.quantity) <= 0) {
      repairs.push('order line: missing name or non-positive quantity, dropped');
      continue;
    }
    out.push({
      name: line.name,
      variantName: line.variantName ?? null,
      extras: line.extras ?? null,
      quantity: Number(line.quantity),
      amount: typeof line.amount === 'string' ? line.amount : '',
    });
  }
  return out;
}

/**
 * Cuts `html` so that the result, closing tags included, fits the budget. The suffix is
 * reserved up front, and a cut that lands mid-character is trimmed back: a severed UTF-8
 * sequence decodes to U+FFFD, which re-encodes to three bytes and would breach the budget
 * the clamp exists to hold.
 */
function clampHtml(html: string, maxBytes: number, suffix: string): string {
  const room = maxBytes - Buffer.byteLength(suffix, 'utf8');
  if (room <= 0) return suffix.slice(0, maxBytes);
  let body = Buffer.from(html, 'utf8').subarray(0, room).toString('utf8');
  while (body && Buffer.byteLength(body, 'utf8') > room) body = body.slice(0, -1);
  return body + suffix;
}

export function renderOrderEmail(template: string, data: OrderEmailData): { html: string; repairs: string[] } {
  const repairs: string[] = [];
  const doc = parse(template);
  const lines = sanitiseLines(data.items, repairs);

  // Item rows first: cloning changes the tree the rest of the walk sees.
  for (const container of [...walk(doc as unknown as Node)].filter(el => has(el, 'data-order-items'))) {
    const rows = [...walk(container)].filter(el => has(el, 'data-order-item'));
    if (rows.length === 0) { repairs.push('template: no data-order-item row to clone'); detachSlots(container); continue; }
    if (rows.length > 1) repairs.push('template: more than one data-order-item row, using the first');
    const model = rows[0];
    const parent: any = (model as any).parentNode;
    const modelHtml = serialize({ childNodes: [model] } as any);
    const built: Node[] = [];

    for (const line of lines) {
      const fragment = parseFragment(modelHtml);
      const row = [...walk(fragment as unknown as Node)].find(el => has(el, 'data-order-item'));
      if (!row) continue;
      for (const el of [row, ...walk(row)]) {
        if (has(el, 'data-order-item-name')) fill(el, 'data-order-item-name', line.name);
        else if (has(el, 'data-order-item-variant')) fill(el, 'data-order-item-variant', line.variantName ?? null);
        else if (has(el, 'data-order-item-extras')) fill(el, 'data-order-item-extras', line.extras ?? null);
        else if (has(el, 'data-order-item-quantity')) fill(el, 'data-order-item-quantity', `x${line.quantity}`);
        else if (has(el, 'data-order-item-amount')) fill(el, 'data-order-item-amount', line.amount || null);
      }
      detachSlots(row);
      (row as any).parentNode = parent;
      built.push(row);
    }
    parent.childNodes = parent.childNodes.flatMap((c: Node) => (c === model ? built : [c]));
    detachSlots(container);
  }

  const values: Record<string, string | null> = {
    'data-order-greeting': data.customerName ? `Hola ${data.customerName},` : 'Hola,',
    'data-order-id': `Orden: ${data.orderId}`,
    'data-order-total': `Total: ${data.total}`,
    'data-order-original-total': data.originalTotal,
    'data-order-tracking': data.trackingUrl,
    'data-order-subscription': data.subscription,
    'data-order-appointment-name': data.appointment?.name ?? null,
    'data-order-appointment-date': data.appointment?.date ?? null,
    'data-store-name': data.storeName,
    'data-store-logo': data.logoUrl,
  };

  for (const el of [...walk(doc as unknown as Node)]) {
    for (const [slot, value] of Object.entries(values)) if (has(el, slot)) { fill(el, slot, value); break; }
  }

  let html = serialize(doc as any);
  if (Buffer.byteLength(html, 'utf8') > ORDER_EMAIL_RENDER_MAX_BYTES) {
    repairs.push(`render: clamped to ${ORDER_EMAIL_RENDER_MAX_BYTES} bytes`);
    html = clampHtml(html, ORDER_EMAIL_RENDER_MAX_BYTES, '</body></html>');
  }
  return { html, repairs };
}
