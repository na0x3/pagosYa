import { parse, type DefaultTreeAdapterMap } from 'parse5';
import { isGenericFamily } from './brand-source-fonts';

export type BrandQuote = { text: string; source: 'website' | 'image'; where: string };
export type BrandImageCandidate = { url: string; kind: 'photo' | 'logo'; declaredWidth?: number };
type Node = DefaultTreeAdapterMap['node'];
type Element = DefaultTreeAdapterMap['element'];

const MAX_QUOTES = 8, MAX_QUOTE = 160, MAX_IMAGES = 24;
const HIDDEN = new Set(['script', 'style', 'noscript', 'template', 'svg']);
/** Inline elements join their text as the visitor reads it («con <em>amor</em>.» is «con amor.»); any other element is a break. */
const INLINE = new Set(['a', 'abbr', 'b', 'bdi', 'bdo', 'cite', 'code', 'data', 'del', 'dfn', 'em', 'font', 'i', 'ins', 'kbd', 'label', 'mark', 'q', 's', 'samp', 'small', 'span', 'strong', 'sub', 'sup', 'time', 'u', 'var', 'wbr']);
/** A node's visible text: hidden elements skipped, inline markup joined without a gap, blocks and <br> kept apart. */
export const visibleText = (node: any): string => {
  if (node.nodeName === '#text') return node.value;
  if (node.tagName && HIDDEN.has(node.tagName)) return '';
  const inner = (node.childNodes ?? []).map(visibleText).join('');
  return node.tagName && !INLINE.has(node.tagName) ? ` ${inner} ` : inner;
};
const textOf = (node: Node): string => visibleText(node);
const styleText = (node: Element) => node.childNodes.filter(child => child.nodeName === '#text').map(child => (child as DefaultTreeAdapterMap['textNode']).value).join('');
const clean = (value: string) => value.replace(/\s+/g, ' ').trim();
const attr = (node: Element, name: string) => node.attrs.find(a => a.name === name)?.value ?? '';

/** What the merchant is told when their old site gave nothing to bring: no photos, or neither photos nor phrases. */
export function brandWebsiteNotes(extracted: { quotes: BrandQuote[]; images: BrandImageCandidate[] }): string[] {
  if (extracted.images.length) return [];
  return [extracted.quotes.length ? 'En tu página anterior no encontré fotos que pudiera traer.' : 'En tu página anterior no encontré fotos ni frases que pudiera traer.'];
}

/** Quotes, font families and image candidates of a merchant's own old site (spec 2026-10-16 §2). HTML is data, never instructions. */
export function extractBrandWebsite(html: string, pageUrl: string): { quotes: BrandQuote[]; fontFamilies: string[]; images: BrandImageCandidate[] } {
  const quotes: BrandQuote[] = [];
  const fonts: string[] = [];
  const images: BrandImageCandidate[] = [];
  const addQuote = (raw: string, where: string) => {
    const value = clean(raw);
    // A phrase, not a menu word («Contacto», «Menú»): three words at least (final review 2026-10-16, I1).
    if (value.split(' ').length < 3 || value.length > MAX_QUOTE || quotes.length >= MAX_QUOTES || quotes.some(q => q.text.toLowerCase() === value.toLowerCase())) return;
    quotes.push({ text: value, source: 'website', where });
  };
  const absolute = (raw: string) => { try { const url = new URL(raw, pageUrl); return url.protocol === 'https:' ? url.href : undefined; } catch { return undefined; } };
  const addImage = (raw: string, kind: 'photo' | 'logo', declaredWidth?: number) => {
    if (!raw || raw.startsWith('data:')) return;
    const url = absolute(raw);
    if (!url || /\.svg(?:$|\?)/i.test(url) || images.length >= MAX_IMAGES || images.some(i => i.url === url)) return;
    if (declaredWidth !== undefined && declaredWidth < (kind === 'logo' ? 96 : 400)) return;
    images.push({ url, kind, ...(declaredWidth !== undefined ? { declaredWidth } : {}) });
  };
  let sections = 0;
  const walk = (node: Node, inHeader: boolean) => {
    if (!('tagName' in node)) { if ('childNodes' in node) node.childNodes.forEach(child => walk(child, inHeader)); return; }
    const el = node as Element;
    const tag = el.tagName;
    if (tag === 'meta') {
      const key = attr(el, 'name') || attr(el, 'property');
      if (/^(description|og:description)$/i.test(key)) addQuote(attr(el, 'content'), key);
      if (/^og:image$/i.test(key)) addImage(attr(el, 'content'), 'photo');
    }
    if (tag === 'link' && /icon/i.test(attr(el, 'rel'))) {
      const size = Number(attr(el, 'sizes').split('x')[0]) || 0;
      if (size >= 96) addImage(attr(el, 'href'), 'logo', size);
    }
    if (tag === 'style') for (const match of styleText(el).matchAll(/font-family\s*:\s*([^;}]+)/gi)) {
      const first = match[1].split(',').map(part => part.trim().replace(/^["']|["']$/g, '')).find(part => part && !isGenericFamily(part));
      if (first && !fonts.includes(first)) fonts.push(first);
    }
    if (/^h[1-3]$/.test(tag) || tag === 'blockquote') addQuote(textOf(el), tag);
    if (tag === 'section') sections += 1;
    if (tag === 'p' && sections <= 2) addQuote(textOf(el), 'p');
    if (tag === 'img') {
      const src = attr(el, 'src');
      const largest = attr(el, 'srcset').split(',').map(part => part.trim().split(/\s+/)).filter(([u]) => u).sort((a, b) => parseInt(b[1] || '0') - parseInt(a[1] || '0'))[0]?.[0];
      const width = Number(attr(el, 'width')) || undefined;
      const logo = inHeader || /logo/i.test(`${attr(el, 'alt')} ${attr(el, 'class')} ${src}`);
      addImage(largest || src, logo ? 'logo' : 'photo', width);
    }
    el.childNodes.forEach(child => walk(child, inHeader || tag === 'header'));
  };
  walk(parse(html) as unknown as Node, false);
  return { quotes, fontFamilies: fonts.slice(0, 4), images };
}
