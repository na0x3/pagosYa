import { parse, serialize } from 'parse5';
import { ATTRIBUTE_SLOTS, EMAIL_RENDER_MAX_BYTES, type EmailBlockType, type ValidEmailKit } from './email-kit-contract';
import { attrOf, clampHtml, fragmentOf, has, kids, remove, setAttr, setText, walk, type Element, type Node } from './email-dom';

export type EmailImage = { src: string; alt: string };
export type EmailItem = { name: string; variant: string | null; extras: string | null; quantity: number; amount: string; image: EmailImage | null };
export type EmailProduct = { name: string; price: string; href: string; image: EmailImage | null };
export type BlockCall =
  | { block: 'hero'; image: EmailImage | null; title: string; text: string | null }
  | { block: 'heading'; title: string; text: string | null }
  | { block: 'items'; items: EmailItem[]; total: string; originalTotal: string | null }
  | { block: 'button'; href: string; label: string }
  | { block: 'products'; products: EmailProduct[] }
  | { block: 'promo'; code: string; text: string | null }
  | { block: 'note'; text: string };
export type LayoutData = { storeName: string; logoUrl: string | null; storeUrl: string | null; preheader: string; unsubscribeUrl: string | null; marketing: boolean };

const SLOT = /^data-(?:block|item|items|product|store|email)(?:-|$)/;
const detach = (el: Element) => { el.attrs = el.attrs.filter(a => !SLOT.test(a.name)); };

/** An image slot gets its source, alt text and a quiet background; a missing image is removed, never left broken. */
function fillImage(el: Element, image: EmailImage | null) {
  if (!image) { remove(el); return; }
  setAttr(el, 'src', image.src);
  setAttr(el, 'alt', image.alt);
  if (!attrOf(el, 'width')) setAttr(el, 'width', '64');
  const style = attrOf(el, 'style')?.value ?? '';
  if (!/background/i.test(style)) setAttr(el, 'style', style ? `${style.replace(/;+$/, '')};background:#eeeeee` : 'background:#eeeeee');
  detach(el);
}

/** Fills a text or attribute slot, or removes the element when there is nothing truthful to put there. */
function fillSlot(el: Element, slot: string, value: string | null) {
  if (value === null || value === '') { remove(el); return; }
  const as = ATTRIBUTE_SLOTS[slot];
  if (as) setAttr(el, as, value); else setText(el, value);
  detach(el);
}

function fillWithin(root: Node, values: Record<string, string | null>) {
  for (const el of [...walk(root)]) for (const [slot, value] of Object.entries(values)) if (has(el, slot)) { fillSlot(el, slot, value); break; }
}

/** Clones the one model row (`data-item` / `data-product`) once per entry, filling each copy. */
function repeat<T>(root: Node, rowSlot: string, entries: T[], fillRow: (row: Element, entry: T) => void) {
  const model = [...walk(root)].find(el => has(el, rowSlot));
  if (!model) return;
  const parent: any = (model as any).parentNode;
  const html = serialize({ nodeName: '#document-fragment', childNodes: [model] } as any);
  const rows = entries.map(entry => {
    const row = [...walk(fragmentOf(html))].find(el => has(el, rowSlot))!;
    fillRow(row, entry);
    detach(row);
    (row as any).parentNode = parent;
    return row as Node;
  });
  parent.childNodes = parent.childNodes.flatMap((c: Node) => (c === model ? rows : [c]));
}

function fillImages(root: Node, slot: string, image: EmailImage | null) {
  for (const el of [...walk(root)]) if (has(el, slot)) fillImage(el, image);
}

function fillBlock(html: string, call: BlockCall): Node[] {
  const root = fragmentOf(html);
  switch (call.block) {
    case 'hero':
      fillImages(root, 'data-block-image', call.image);
      fillWithin(root, { 'data-block-title': call.title, 'data-block-text': call.text });
      break;
    case 'heading':
      fillWithin(root, { 'data-block-title': call.title, 'data-block-text': call.text });
      break;
    case 'items':
      repeat(root, 'data-item', call.items, (row, item) => {
        fillImages(row, 'data-item-image', item.image);
        fillWithin(row, { 'data-item-name': item.name, 'data-item-variant': item.variant, 'data-item-extras': item.extras,
          'data-item-quantity': `x${item.quantity}`, 'data-item-amount': item.amount || null });
      });
      fillWithin(root, { 'data-items-total': `Total: ${call.total}`, 'data-items-original-total': call.originalTotal });
      break;
    case 'button':
      fillWithin(root, { 'data-block-link': call.href, 'data-block-label': call.label });
      break;
    case 'products':
      repeat(root, 'data-product', call.products, (card, product) => {
        fillImages(card, 'data-product-image', product.image);
        fillWithin(card, { 'data-product-name': product.name, 'data-product-price': product.price, 'data-product-link': product.href });
      });
      break;
    case 'promo':
      fillWithin(root, { 'data-block-code': call.code, 'data-block-text': call.text });
      break;
    case 'note':
      fillWithin(root, { 'data-block-text': call.text });
      break;
  }
  for (const el of [...walk(root)]) detach(el);
  return kids(root);
}

/**
 * Builds one email: each call's block from the store's kit (or the standard block when the
 * kit lacks it), filled by construction, placed in the layout's single content slot. Values
 * go in as text nodes and attributes, so parse5 escapes them; nothing is concatenated.
 */
export function assembleEmail(kit: ValidEmailKit, floor: ValidEmailKit, calls: BlockCall[], layout: LayoutData): { html: string; repairs: string[] } {
  const repairs: string[] = [];
  if (!kit.layout) repairs.push('layout: standard layout used');
  const doc = parse(kit.layout ?? floor.layout!) as unknown as Node;

  const nodes: Node[] = [];
  for (const call of calls) {
    const own = kit.blocks[call.block as EmailBlockType];
    if (!own) repairs.push(`${call.block}: standard block used`);
    nodes.push(...fillBlock(own ?? floor.blocks[call.block as EmailBlockType]!, call));
  }

  const content = [...walk(doc)].find(el => has(el, 'data-email-content'))!;
  for (const node of nodes) (node as any).parentNode = content;
  (content as any).childNodes = nodes;
  detach(content);

  if (layout.marketing && layout.unsubscribeUrl && ![...walk(doc)].some(el => has(el, 'data-email-unsubscribe'))) {
    const footer = fragmentOf('<p style="margin:24px 0 0;font-size:12px;color:#6b6b73;background:#ffffff"><a style="color:#6b6b73;background:#ffffff">Dejar de recibir estos correos</a></p>');
    setAttr([...walk(footer)].find(el => el.tagName === 'a')!, 'href', layout.unsubscribeUrl);
    for (const node of kids(footer)) { (node as any).parentNode = content; (content as any).childNodes.push(node); }
  }

  fillWithin(doc, {
    'data-store-name': layout.storeName,
    'data-store-logo': layout.logoUrl,
    'data-email-preheader': layout.preheader,
    'data-email-unsubscribe': layout.marketing ? layout.unsubscribeUrl : null,
  });
  // Without a store address the link keeps its contents and loses only the href.
  for (const el of [...walk(doc)]) if (has(el, 'data-store-link')) { if (layout.storeUrl) setAttr(el, 'href', layout.storeUrl); detach(el); }

  let html = serialize(doc as any);
  if (Buffer.byteLength(html, 'utf8') > EMAIL_RENDER_MAX_BYTES) {
    repairs.push(`render: clamped to ${EMAIL_RENDER_MAX_BYTES} bytes`);
    html = clampHtml(html, EMAIL_RENDER_MAX_BYTES, '</td></tr></table></td></tr></table></body></html>');
  }
  return { html, repairs };
}
