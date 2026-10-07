import { parse, serialize, type DefaultTreeAdapterMap } from 'parse5';
import { LITERAL_AMOUNT, sanitizeEmailHtml } from '../storefront-source/source-email-html';
import {
  EMAIL_BLOCK_TYPES, EMAIL_COPY_FIELDS, EMAIL_KIT_FILE_MAX_BYTES, EMAIL_TYPES, REQUIRED_EMAIL_BLOCKS,
  type EmailBlockType, type EmailCopy, type EmailCopyField, type RawEmailKit, type ValidEmailKit,
} from './email-kit-contract';

type Element = DefaultTreeAdapterMap['element'];
type Node = DefaultTreeAdapterMap['node'];
const isElement = (node: Node): node is Element => 'tagName' in node;
const kids = (node: Node): Node[] => ('childNodes' in node ? (node.childNodes as Node[]) : []);
function* walk(node: Node): Generator<Element> { for (const c of kids(node)) if (isElement(c)) { yield c; yield* walk(c); } }
const attr = (el: Element, name: string) => el.attrs.find(a => a.name === name)?.value;
const textOf = (el: Element): string => kids(el).map(c => (isElement(c) ? textOf(c) : ((c as any).value ?? ''))).join('');
const count = (root: Node, name: string) => [...walk(root)].filter(el => attr(el, name) !== undefined).length;

const AMOUNT = /(?:\b(?:Bs|BOB|USD)\.?|\$)\s?\d[\d.,]*/gi;
const DATE = /\b\d{1,2}\s?[/.-]\s?\d{1,2}(?:\s?[/.-]\s?\d{2,4})?\b/g;
const ORDER_ID = /\bpi_[A-Za-z0-9]+\b/g;
const LONG_NUMBER = /\b\d{4,}\b/g;
const AUTO_CHARGE = /cobr\w*\s+autom[aá]tic|autom[aá]tic\w*\s+(?:se\s+)?cobr|d[eé]bito\s+autom[aá]tic|cargo\s+autom[aá]tic/i;
const PLACEHOLDER = /\{(\w+)\}/g;
const ALLOWED_PLACEHOLDERS = new Set(['cliente', 'tienda']);

/** One line of wording, cleaned: no facts, no unknown placeholders, no automatic-charge promise, within its cap. */
export function cleanCopyValue(field: EmailCopyField, value: string): { value: string | null; repairs: string[] } {
  const repairs: string[] = [];
  if (AUTO_CHARGE.test(value)) return { value: null, repairs: [`${field}: implies automatic charging, dropped`] };
  let out = value.replace(PLACEHOLDER, (match, name: string) => {
    if (ALLOWED_PLACEHOLDERS.has(name)) return match;
    repairs.push(`${field}: placeholder {${name}} removed`);
    return '';
  });
  for (const [pattern, label] of [[ORDER_ID, 'order number'], [AMOUNT, 'amount'], [DATE, 'date'], [LONG_NUMBER, 'number']] as const) {
    pattern.lastIndex = 0;
    if (!pattern.test(out)) continue;
    pattern.lastIndex = 0;
    out = out.replace(pattern, '');
    repairs.push(`${field}: ${label} removed; the platform fills facts`);
  }
  out = out.replace(/\s{2,}/g, ' ').replace(/\s+([,.;:!?])/g, '$1').trim();
  const cap = EMAIL_COPY_FIELDS[field];
  if (out.length > cap) { out = out.slice(0, cap).trimEnd(); repairs.push(`${field}: cut to ${cap} characters`); }
  return { value: out || null, repairs };
}

export function validateEmailCopy(raw: unknown): { copy: EmailCopy; repairs: string[] } {
  const copy: EmailCopy = {};
  const repairs: string[] = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { copy, repairs };
  for (const type of EMAIL_TYPES) {
    const entry = (raw as Record<string, unknown>)[type];
    if (!entry || typeof entry !== 'object') continue;
    for (const field of Object.keys(EMAIL_COPY_FIELDS) as EmailCopyField[]) {
      const value = (entry as Record<string, unknown>)[field];
      if (typeof value !== 'string') continue;
      const cleaned = cleanCopyValue(field, value);
      repairs.push(...cleaned.repairs.map(r => `copy.${type}.${r}`));
      if (cleaned.value) (copy[type] ??= {})[field] = cleaned.value;
    }
  }
  return { copy, repairs };
}

function validateLayout(input: string, repairs: string[]): string | null {
  const { html, repairs: found } = sanitizeEmailHtml(input, 'emails/layout.html', EMAIL_KIT_FILE_MAX_BYTES);
  repairs.push(...found);
  const slots = count(parse(html) as unknown as Node, 'data-email-content');
  if (slots !== 1) { repairs.push(`emails/layout.html: needs exactly one data-email-content, found ${slots}; the standard layout is used`); return null; }
  return html;
}

/**
 * The slots that carry a block's facts. A block without them would show whatever the author typed in
 * their place (a made-up product, a dead button), so it is refused and the standard block is used.
 */
const FACT_SLOTS: Record<EmailBlockType, string[]> = {
  hero: ['data-block-title'],
  heading: ['data-block-title'],
  items: ['data-item-name', 'data-item-quantity', 'data-item-amount', 'data-items-total'],
  button: ['data-block-link', 'data-block-label'],
  products: ['data-product-name', 'data-product-price', 'data-product-link'],
  promo: ['data-block-code'],
  note: ['data-block-text'],
};
const SLOT_ATTRIBUTE = /^data-(?:block|item|items|product)-/;

/** Text in an item row belongs in a slot; anything else in the row would print beside every real line. */
function blankLooseText(row: Element): boolean {
  let blanked = false;
  const visit = (node: Element) => {
    if (node !== row && node.attrs.some(a => SLOT_ATTRIBUTE.test(a.name))) return;
    for (const child of kids(node)) {
      if (isElement(child)) visit(child);
      else if (((child as any).value ?? '').trim()) { (child as any).value = ''; blanked = true; }
    }
  };
  visit(row);
  return blanked;
}

function validateBlocks(input: string, repairs: string[]): Partial<Record<EmailBlockType, string>> {
  const { html, repairs: found } = sanitizeEmailHtml(`<!doctype html><html><body>${input}</body></html>`, 'emails/blocks.html', EMAIL_KIT_FILE_MAX_BYTES);
  repairs.push(...found);
  const body = [...walk(parse(html) as unknown as Node)].find(el => el.tagName === 'body');
  const out: Partial<Record<EmailBlockType, string>> = {};
  for (const el of body ? kids(body).filter(isElement) : []) {
    const type = attr(el, 'data-block');
    if (type === undefined) continue;
    if (!(EMAIL_BLOCK_TYPES as readonly string[]).includes(type)) { repairs.push(`emails/blocks.html: unknown block "${type}" ignored`); continue; }
    const block = type as EmailBlockType;
    if (out[block]) { repairs.push(`emails/blocks.html: ${block} appears twice, using the first`); continue; }
    if (block === 'items' && count(el, 'data-item') !== 1) { repairs.push('emails/blocks.html: items needs exactly one data-item row; the standard block is used'); continue; }
    if (block === 'products' && count(el, 'data-product') !== 1) { repairs.push('emails/blocks.html: products needs exactly one data-product card; the standard block is used'); continue; }
    const missing = FACT_SLOTS[block].filter(slot => count(el, slot) === 0);
    if (missing.length) { repairs.push(`emails/blocks.html: ${block}: missing ${missing.join(', ')}; the standard block is used`); continue; }
    if (block === 'items') {
      const row = [...walk(el)].find(child => attr(child, 'data-item') !== undefined)!;
      if (blankLooseText(row)) repairs.push('emails/blocks.html: items: text outside a slot in the item row removed');
    }
    if (block === 'items' && LITERAL_AMOUNT.test(textOf(el))) {
      repairs.push('emails/blocks.html: literal amount inside items removed; the platform fills it');
      for (const cell of walk(el)) for (const n of kids(cell)) if (!isElement(n) && LITERAL_AMOUNT.test((n as any).value ?? '')) (n as any).value = '';
    }
    out[block] = serialize({ nodeName: '#document-fragment', childNodes: [el] } as any);
  }
  return out;
}

/** Validates a designed kit. Never throws on content; `usable` says whether it can become a store's look. */
export function validateEmailKit(raw: RawEmailKit): { kit: ValidEmailKit; repairs: string[]; usable: boolean } {
  const repairs: string[] = [];
  const layout = validateLayout(String(raw.layout ?? ''), repairs);
  const blocks = validateBlocks(String(raw.blocks ?? ''), repairs);
  let parsedCopy: unknown = raw.copy;
  if (typeof raw.copy === 'string') {
    try { parsedCopy = JSON.parse(raw.copy); }
    catch { repairs.push('emails/copy.json: not valid JSON, default wording used'); parsedCopy = {}; }
  }
  const { copy, repairs: copyRepairs } = validateEmailCopy(parsedCopy);
  repairs.push(...copyRepairs);
  const missing = REQUIRED_EMAIL_BLOCKS.filter(block => !blocks[block]);
  if (missing.length) repairs.push(`emails/blocks.html: missing ${missing.join(', ')}`);
  return { kit: { layout, blocks, copy }, repairs, usable: layout !== null && missing.length === 0 };
}
