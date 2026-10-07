import { parse, serialize } from 'parse5';
import { ATTRIBUTE_SLOTS, EMAIL_RENDER_MAX_BYTES, type EmailBlockType, type ValidEmailKit } from './email-kit-contract';
import { attrOf, clampHtml, fragmentOf, has, kids, remove, setAttr, setText, walk, type Element, type Node } from './email-dom';
import { emailIconUrl, type EmailIcon, type IconTone } from './email-image-url';

export type EmailImage = { src: string; alt: string };
export type EmailItem = { name: string; variant: string | null; extras: string | null; quantity: number; amount: string; image: EmailImage | null; productId?: string | null };
export type EmailProduct = { name: string; price: string; href: string; image: EmailImage | null };
/** `drop` marks an optional section: when the email is over budget, the highest `drop` goes first. */
export type BlockCall = (
  | { block: 'hero'; image: EmailImage | null; title: string; text: string | null; href?: string | null; label?: string | null }
  | { block: 'heading'; title: string; text: string | null }
  | { block: 'items'; items: EmailItem[]; total: string; originalTotal: string | null }
  | { block: 'button'; href: string; label: string }
  | { block: 'products'; products: EmailProduct[] }
  | { block: 'promo'; code: string; discount: string; text: string | null }
  | { block: 'note'; text: string }
  | { block: 'announce'; text: string }
  | { block: 'address'; title: string; lines: string[] }
  | { block: 'steps'; steps: { icon: EmailIcon; title: string }[] }
  | { block: 'trust'; items: { icon: EmailIcon; label: string }[] }
  | { block: 'quote'; text: string; author: string; stars: number | null }
  | { block: 'story'; image: EmailImage | null; title: string; text: string }
  | { block: 'contact'; title: string; cards: { icon: EmailIcon; label: string; value: string; href: string }[] }
) & { drop?: number };
export type LayoutData = {
  storeName: string; logoUrl: string | null; storeUrl: string | null; preheader: string; unsubscribeUrl: string | null; marketing: boolean;
  nav?: { label: string; href: string }[];
  /** A social link whose network has no icon shows as its label. */
  socials?: { icon: EmailIcon | null; label: string; href: string }[];
  address?: string | null;
  policies?: { label: string; href: string }[];
  iconBase?: string | null;
};

const SLOT = /^data-(?:block|item|items|product|store|email|line|step|trust|quote|contact|nav|social|policy|tone)(?:-|$)/;
const detach = (el: Element) => { el.attrs = el.attrs.filter(a => !SLOT.test(a.name)); };

/** An image slot gets its source, alt text and a quiet background; a missing image is removed, never left broken. */
function fillImage(el: Element, image: EmailImage | null) {
  if (!image) { remove(el); return; }
  setAttr(el, 'src', image.src);
  setAttr(el, 'alt', image.alt);
  if (!attrOf(el, 'width')) setAttr(el, 'width', '64');
  // The quiet background goes on the photo's cell when it has one: a client that blocks images hides the <img> box too.
  const parent: any = (el as any).parentNode;
  const target: Element = parent?.tagName === 'td' || parent?.tagName === 'th' ? parent : el;
  const style = attrOf(target, 'style')?.value ?? '';
  if (!/background/i.test(style)) setAttr(target, 'style', style ? `${style.replace(/;+$/, '')};background:#eeeeee` : 'background:#eeeeee');
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

/** A block marked as sitting on a dark background takes light icons, and the reverse. */
const blockTone = (root: Node): IconTone => ([...walk(root)].some(el => attrOf(el, 'data-tone')?.value === 'dark') ? 'light' : 'dark');

const iconImage = (name: EmailIcon | null, tone: IconTone, base: string | null, alt: string): EmailImage | null => {
  const src = name ? emailIconUrl(name, tone, base) : null;
  return src ? { src, alt } : null;
};

const STARS = 5;

function fillBlock(html: string, call: BlockCall, layout: LayoutData): Node[] {
  const root = fragmentOf(html);
  const tone = blockTone(root);
  const base = layout.iconBase ?? null;
  switch (call.block) {
    case 'hero':
      fillImages(root, 'data-block-image', call.image);
      fillWithin(root, { 'data-block-title': call.title, 'data-block-text': call.text });
      fillWithin(root, { 'data-block-link': call.href ?? null, 'data-block-label': call.label ?? null });
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
      fillWithin(root, { 'data-block-discount': call.discount, 'data-block-code': call.code, 'data-block-text': call.text });
      break;
    case 'note':
    case 'announce':
      fillWithin(root, { 'data-block-text': call.text });
      break;
    case 'address':
      fillWithin(root, { 'data-block-title': call.title });
      repeat(root, 'data-line', call.lines, (row, line) => setText(row, line));
      break;
    case 'steps':
      repeat(root, 'data-step', call.steps, (row, step) => {
        fillImages(row, 'data-step-icon', iconImage(step.icon, tone, base, ''));
        fillWithin(row, { 'data-step-title': step.title });
      });
      break;
    case 'trust':
      repeat(root, 'data-trust', call.items, (row, item) => {
        fillImages(row, 'data-trust-icon', iconImage(item.icon, tone, base, ''));
        fillWithin(row, { 'data-trust-label': item.label });
      });
      break;
    case 'quote': {
      // The stars are drawn from the rating, so a review's text can never claim more than it has.
      const stars = call.stars ? Math.max(0, Math.min(STARS, Math.round(call.stars))) : 0;
      fillWithin(root, { 'data-quote-text': call.text, 'data-quote-author': `— ${call.author}`,
        'data-quote-stars': stars ? '★'.repeat(stars) + '☆'.repeat(STARS - stars) : null });
      break;
    }
    case 'story':
      fillImages(root, 'data-block-image', call.image);
      fillWithin(root, { 'data-block-title': call.title, 'data-block-text': call.text });
      break;
    case 'contact':
      fillWithin(root, { 'data-block-title': call.title });
      repeat(root, 'data-contact', call.cards, (row, card) => {
        fillImages(row, 'data-contact-icon', iconImage(card.icon, tone, base, ''));
        fillWithin(row, { 'data-contact-label': card.label });
        for (const el of [...walk(row)]) if (has(el, 'data-contact-value')) { setText(el, card.value); setAttr(el, 'href', card.href); detach(el); }
      });
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
    nodes.push(...fillBlock(own ?? floor.blocks[call.block as EmailBlockType]!, call, layout));
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

  repeat(doc, 'data-nav-link', layout.nav ?? [], (a, n) => { setAttr(a, 'href', n.href); setText(a, n.label); });
  repeat(doc, 'data-policy-link', layout.policies ?? [], (a, p) => { setAttr(a, 'href', p.href); setText(a, p.label); });
  // The footer sits on the accent colour, so its icons are always the light tone.
  repeat(doc, 'data-social', layout.socials ?? [], (a, s) => {
    setAttr(a, 'href', s.href);
    const img = [...walk(a)].find(e => has(e, 'data-social-icon'));
    const icon = iconImage(s.icon, 'light', layout.iconBase ?? null, s.label);
    if (img && icon) fillImage(img, icon); else { if (img) remove(img); setText(a, s.label); }
  });

  fillWithin(doc, {
    'data-store-address': layout.address ?? null,
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

/**
 * Assembles the email and, while it is over Gmail's clipping size, removes the optional
 * section with the highest `drop` and tries again. Required sections carry no `drop`, so
 * the order lines are never what gets cut.
 */
export function assembleWithinBudget(kit: ValidEmailKit, floor: ValidEmailKit, calls: BlockCall[], layout: LayoutData): { html: string; repairs: string[] } {
  const dropped: string[] = [];
  let current = [...calls];
  for (;;) {
    const result = assembleEmail(kit, floor, current, layout);
    const over = result.repairs.some(r => r.startsWith('render: clamped'));
    const droppable = current.map((call, index) => ({ call, index })).filter(({ call }) => call.drop !== undefined);
    if (!over || !droppable.length) return { html: result.html, repairs: [...dropped, ...result.repairs] };
    const victim = droppable.reduce((a, b) => (b.call.drop! >= a.call.drop! ? b : a));
    dropped.push(`budget: ${victim.call.block} removed to fit Gmail`);
    current = current.filter((_, i) => i !== victim.index);
  }
}
