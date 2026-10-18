/**
 * The store name lettered by YAPI (2026-10-18, the owner's Sep-8 POKEATE: «POKE» in ink, «ATE» in red, a spade after it).
 * The platform draws the header (spec 2026-10-13), which printed the name as plain text, so a lettered name could no longer
 * reach it. YAPI now writes the lettering once, <template data-pagosya-wordmark> in index.html (or the style card hero marks
 * it with data-pagosya-wordmark), and the header shows it in place of the plain name. Only lettering survives: spans and
 * emphasis with class names, the store name's own letters and symbols. A lettering that no longer spells the store name (a
 * renamed store) is dropped and the plain name comes back.
 */
import { parseFragment, serialize, type DefaultTreeAdapterMap } from 'parse5';

const LETTERING_TAGS = new Set(['span', 'strong', 'b', 'em', 'i', 'small', 'sup', 'sub']);
const CLASS_NAME = /^[a-z][a-z0-9_-]{0,40}$/i;
const MAX_LENGTH = 1500;
const MAX_ELEMENTS = 40;
const TEMPLATE = /<template\b[^>]*\bdata-pagosya-wordmark\b[^>]*>([\s\S]*?)<\/template>/i;

type ParentNode = { childNodes: DefaultTreeAdapterMap['node'][] };
type Element = DefaultTreeAdapterMap['element'];

/** Letters and digits only, without accents or case: what must match the store name. */
const spelling = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

/** Rebuilds the fragment from the lettering allowlist; elements outside it give up their text in place. */
function clean(parent: ParentNode, budget: { elements: number }): boolean {
  const kept: DefaultTreeAdapterMap['node'][] = [];
  for (const node of parent.childNodes) {
    if (node.nodeName === '#text') { kept.push(node); continue; }
    if (node.nodeName === '#comment') continue;
    const element = node as Element;
    const tag = element.tagName?.toLowerCase();
    if (tag === 'script' || tag === 'style' || tag === 'template') continue;
    if (!clean(element, budget)) return false;
    if (!LETTERING_TAGS.has(tag)) { kept.push(...element.childNodes); continue; }
    if (++budget.elements > MAX_ELEMENTS) return false;
    const classes = (element.attrs.find(attr => attr.name === 'class')?.value ?? '').split(/\s+/).filter(name => CLASS_NAME.test(name)).slice(0, 4);
    element.attrs = classes.length ? [{ name: 'class', value: classes.join(' ') }] : [];
    kept.push(element);
  }
  parent.childNodes = kept;
  for (const child of kept) (child as { parentNode?: unknown }).parentNode = parent;
  return true;
}

/** The lettering as safe HTML, or undefined when it is empty, too large or does not spell `storeName`. */
export function sanitizeWordmark(html: string | undefined, storeName: string): string | undefined {
  if (typeof html !== 'string' || !html.trim() || html.length > MAX_LENGTH * 2 || html.split('<').length > MAX_ELEMENTS * 3) return undefined;
  try {
    const fragment = parseFragment(html.trim()) as unknown as ParentNode;
    if (!clean(fragment, { elements: 0 })) return undefined;
    const out = serialize(fragment as never).trim();
    const text = parseFragment(out).childNodes.map(function textOf(node: DefaultTreeAdapterMap['node']): string {
      return node.nodeName === '#text' ? (node as DefaultTreeAdapterMap['textNode']).value : ((node as Element).childNodes ?? []).map(textOf).join('');
    }).join('');
    if (!out || out.length > MAX_LENGTH || !spelling(storeName) || spelling(text) !== spelling(storeName)) return undefined;
    return out;
  } catch { return undefined; }
}

/** The element a style card hero marked as its lettering: its inner HTML. */
function markedElement(html: string): string | undefined {
  const open = /<([a-z][a-z0-9]*)\b[^>]*\bdata-pagosya-wordmark\b[^>]*>/i.exec(html);
  if (!open) return undefined;
  const tag = open[1].toLowerCase();
  let depth = 1;
  const at = open.index + open[0].length;
  const tags = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'gi');
  tags.lastIndex = at;
  for (let match = tags.exec(html); match; match = tags.exec(html)) {
    depth += match[1] ? -1 : 1;
    if (depth === 0) return html.slice(at, match.index);
  }
  return undefined;
}

/** The lettering a page carries: its <template data-pagosya-wordmark>, else an element marked data-pagosya-wordmark. */
export function readWordmark(html: string | undefined, storeName: string): string | undefined {
  if (!html) return undefined;
  const template = TEMPLATE.exec(html)?.[1];
  return sanitizeWordmark(template ?? markedElement(html), storeName);
}

/** index.html with exactly one <template data-pagosya-wordmark> holding `wordmark`, before </body>. Idempotent. */
export function withWordmarkTemplate(html: string, wordmark: string): string {
  const template = `<template data-pagosya-wordmark>${wordmark}</template>`;
  if (TEMPLATE.test(html)) return html.replace(TEMPLATE, template);
  return /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `${template}</body>`) : html + template;
}

/** What an author must know to letter the store name. */
export const WORDMARK_DIRECTION = 'LETTERED NAME: when the store has no logo image, letter its name as part of the identity, the way a sign painter would: in index.html put <template data-pagosya-wordmark>…</template> holding the exact letters of the store name, split into <span class="…"> where colour, weight, size or case changes (e.g. POKE<span class="wm-red">ATE</span>), optionally with one symbol character from the business (♠, ★, ✿). Style those classes in styles.css under .pyh-wordmark (e.g. .pyh-wordmark .wm-red{color:#d62828}). The platform header shows this lettering in place of the plain name on every page; a lettering that does not spell the store name is ignored.';
