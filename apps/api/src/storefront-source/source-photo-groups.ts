import { parse } from 'parse5';
import type { SourceProjectFileDto } from './dto/save-source-project.dto';

/**
 * No photo groups, enforced where every static store is saved (owner 2026-10-15 and 2026-10-18).
 *
 * The browser check (source-media-design.ts) only runs inside the agent engine; the Sep-5 author that builds a
 * picked style wrote florart's six-photo «La mesa se llena de flores» wall straight into the saved store
 * (3mst1q0y, 2026-10-18). The owner wants no cramped photos, and no single fixed section either («i dont want any
 * websites looking the same»): how a store earns trust is drawn per store (frame-draw.ts). So a section with three or
 * more of the store's own photos, that the merchant did not ask for, keeps its heading, text and design, and its
 * photos move into a carousel that shows one at a time (kit content/carousel.js). No photo is lost or invented.
 */

type LocatedNode = {
  nodeName: string; tagName?: string; attrs?: Array<{ name: string; value: string }>; childNodes?: LocatedNode[]; content?: { childNodes?: LocatedNode[] };
  parentNode?: LocatedNode;
  sourceCodeLocation?: { startOffset: number; endOffset: number; startTag?: { startOffset: number; endOffset: number }; endTag?: { startOffset: number; endOffset: number } };
};

/** Pages the kit owns: their photos are the catalog's. */
const KIT_PAGES = new Set(['product.html', 'checkout.html', 'productos.html', 'coleccion.html', 'colecciones.html']);
/** A photo inside a link to a product or collection is a card, not a wall. */
const PRODUCT_LINK = /(?:^|\/)(?:product|productos|coleccion|colecciones)\.html(?:[?#]|$)/i;

const attr = (node: LocatedNode, name: string) => node.attrs?.find(a => a.name === name)?.value;
const children = (node: LocatedNode) => [...(node.childNodes ?? []), ...(node.content?.childNodes ?? [])];
/** An authored product card: a card that holds its own add-to-cart button. */
const sellsItself = (node: LocatedNode): boolean => children(node).some(child => Boolean(child.attrs?.some(a => a.name === 'data-product-add' || a.name === 'data-add')) || sellsItself(child));
const normalSrc = (src: string) => src.trim().split(/[?#]/, 1)[0].replace(/^\.?\/+/, '');

type Group = { section: LocatedNode; srcs: string[]; images: LocatedNode[] };

/** Every section (or direct child of <main>) holding three or more of the store's own photos, innermost first.
 *  Photos already in a carousel ([data-pagosya-carousel], like every data-pagosya- mount) are never counted. */
export function sourcePhotoGroups(html: string): Group[] {
  const groups: Group[] = [];
  const walk = (node: LocatedNode, inMain: boolean, excluded: boolean): LocatedNode[] => {
    const tag = node.tagName;
    const found: LocatedNode[] = [];
    if (tag === 'img' && !excluded) {
      const src = attr(node, 'src') || '';
      if (src && !/\.svg(?:[?#]|$)|^data:image\/svg/i.test(src)) found.push(node);
    }
    const shut = excluded || tag === 'header' || tag === 'footer' || tag === 'nav' || tag === 'template'
      || Boolean(node.attrs?.some(a => a.name.startsWith('data-pagosya-')))
      || (tag === 'a' && PRODUCT_LINK.test(attr(node, 'href') || ''))
      || ((tag === 'article' || tag === 'li' || tag === 'figure') && sellsItself(node));
    const scope = tag === 'section' || (inMain && (tag === 'article' || tag === 'div' || tag === 'figure'));
    for (const child of children(node)) found.push(...walk(child, tag === 'main', shut));
    if (scope && found.length >= 3 && node.sourceCodeLocation?.endTag) {
      groups.push({ section: node, images: found, srcs: found.map(img => normalSrc(attr(img, 'src') || '')) });
      return [];
    }
    return found;
  };
  walk(parse(html, { sourceCodeLocationInfo: true }) as unknown as LocatedNode, false, false);
  return groups;
}

const ancestors = (node: LocatedNode, stop: LocatedNode): LocatedNode[] => {
  const chain: LocatedNode[] = [];
  for (let at: LocatedNode | undefined = node; at && at !== stop; at = at.parentNode) chain.unshift(at);
  return chain;
};

/** The edit that moves a group's photos into one carousel: the innermost element holding them all gets a track whose
 *  slides are its children that hold a photo, in order; a wrapper holding nothing else (a grid) becomes the track. */
function carouselEdit(html: string, group: Group): { start: number; end: number; text: string } | undefined {
  const chains = group.images.map(img => ancestors(img, group.section));
  let holder = group.section;
  for (let depth = 0; chains.every(chain => chain.length > depth + 1 && chain[depth] === chains[0][depth]); depth++) holder = chains[0][depth];
  const slides = [...new Set(chains.map(chain => chain[ancestors(holder, group.section).length]))];
  if (slides.some(slide => !slide?.sourceCodeLocation)) return undefined;
  const track = slides.map(slide => html.slice(slide.sourceCodeLocation!.startOffset, slide.sourceCodeLocation!.endOffset)).join('\n');
  const markup = `<div data-pagosya-carousel data-carousel-repaired aria-label="Fotos">\n${track}\n</div>`;
  const others = children(holder).filter(child => child.tagName && !slides.includes(child));
  if (holder !== group.section && !others.length && holder.sourceCodeLocation) return { start: holder.sourceCodeLocation.startOffset, end: holder.sourceCodeLocation.endOffset, text: markup };
  // Text between the slides stays where it was; the track takes the first slide's place.
  const first = slides[0].sourceCodeLocation!, last = slides[slides.length - 1].sourceCodeLocation!;
  const between = children(holder).filter(child => child.sourceCodeLocation && child.sourceCodeLocation.startOffset > first.startOffset && child.sourceCodeLocation.endOffset < last.endOffset && !slides.includes(child));
  return { start: first.startOffset, end: last.endOffset, text: `${markup}${between.map(child => html.slice(child.sourceCodeLocation!.startOffset, child.sourceCodeLocation!.endOffset)).join('')}` };
}

/**
 * Moves each photo group this save introduced into a carousel. A group the previous revision of the same page already
 * showed is left alone (a local edit never redesigns a section it was not asked about); a redesign or a new store
 * passes no previous files, so every group moves.
 */
export function repairSourcePhotoGroups(files: SourceProjectFileDto[], options: { previousFiles: SourceProjectFileDto[]; allowPhotoGroups: boolean }): { files: SourceProjectFileDto[]; repairs: string[] } {
  if (options.allowPhotoGroups) return { files, repairs: [] };
  const repairs: string[] = [];
  const repaired = files.map(file => {
    if (file.encoding === 'base64' || !/\.html$/i.test(file.path) || KIT_PAGES.has(file.path)) return file;
    const groups = sourcePhotoGroups(file.content);
    if (!groups.length) return file;
    const old = options.previousFiles.find(previous => previous.path === file.path && previous.encoding !== 'base64');
    const before = old ? sourcePhotoGroups(old.content).map(group => new Set(group.srcs)) : [];
    const fresh = groups.filter(group => !before.some(set => group.srcs.every(src => set.has(src))));
    const edits = fresh.flatMap(group => { const edit = carouselEdit(file.content, group); return edit ? [{ ...edit, count: group.srcs.length }] : []; });
    if (!edits.length) return file;
    let html = file.content;
    for (const edit of edits.sort((a, b) => b.start - a.start)) {
      html = `${html.slice(0, edit.start)}${edit.text}${html.slice(edit.end)}`;
      repairs.push(`${file.path}: moved a group of ${edit.count} photos into a carousel (no photo groups)`);
    }
    return { ...file, content: html };
  });
  return { files: repaired, repairs: repairs.reverse() };
}
