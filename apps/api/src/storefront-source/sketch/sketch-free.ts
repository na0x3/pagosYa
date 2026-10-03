import type { SketchFreePos } from '@pagosya/shared-types';
import type { SketchBlock, SketchContext } from './sketch-schema';

/** Free layer (spec 2026-10-03-boceto-free-layer-design). Freed parts keep their place in the markup and gain their spot
 * as CSS variables; the base CSS lifts them out only from 900px up, so on phones they sit back in their column. */
const expr = (value: string) => `{${JSON.stringify(value)}}`;

const freeVars = (pos: SketchFreePos) => ([['--skb-fx', pos.x], ['--skb-fy', pos.y], ...(pos.w !== undefined ? [['--skb-fw', pos.w]] : []), ...(pos.r ? [['--skb-fr', pos.r]] : [])] as Array<[string, number]>)
  .map(([name, value]) => `[${JSON.stringify(name)} as string]: ${JSON.stringify(String(value))}`).join(', ');

type Tag = { name: string; end: number; selfClosing: boolean; attrs: Map<string, { start: number; end: number }> };

function skipString(src: string, i: number): number {
  const quote = src[i];
  for (i++; i < src.length && src[i] !== quote; i++) if (src[i] === '\\') i++;
  return i + 1;
}
/** A balanced `{…}` expression; string literals inside are opaque, so merchant text never counts as markup. */
function skipBraces(src: string, i: number): number {
  let depth = 0;
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === '"' || c === "'" || c === '`') { i = skipString(src, i) - 1; continue; }
    if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return i + 1;
  }
  return i;
}
function readTag(src: string, open: number): Tag {
  let i = open + 1;
  const name = /^[A-Za-z][\w.]*/.exec(src.slice(i, i + 40))?.[0] ?? '';
  i += name.length;
  const attrs = new Map<string, { start: number; end: number }>();
  while (i < src.length) {
    while (/\s/.test(src[i])) i++;
    if (src[i] === '>') return { name, end: i, selfClosing: false, attrs };
    if (src[i] === '/' && src[i + 1] === '>') return { name, end: i, selfClosing: true, attrs };
    const attr = /^[^\s=/>]+/.exec(src.slice(i, i + 80))?.[0] ?? '';
    if (!attr) { i++; continue; }
    i += attr.length;
    if (src[i] !== '=') { attrs.set(attr, { start: i, end: i }); continue; }
    const start = ++i;
    i = src[i] === '{' ? skipBraces(src, i) : src[i] === '"' || src[i] === "'" ? skipString(src, i) : i;
    attrs.set(attr, { start, end: i });
  }
  return { name, end: src.length, selfClosing: true, attrs };
}
/** The canvas segment of a tag, with the canvas's precedence: group, then node, then element. */
function segmentOf(src: string, tag: Tag): string | null {
  for (const name of ['data-skb-group', 'data-skb-node', 'data-skb-el']) {
    const at = tag.attrs.get(name);
    if (!at) continue;
    const raw = src.slice(at.start, at.end);
    try { const value = JSON.parse(raw.startsWith('{') ? raw.slice(1, -1) : raw); if (typeof value === 'string') return value; } catch { /* not a literal */ }
  }
  return null;
}

/** Marks the part at each freed path, reading paths from the markup's nesting exactly as the canvas does. */
export function stampFree(markup: string, free?: Record<string, SketchFreePos>): string {
  if (!free || !Object.keys(free).length) return markup;
  const edits: Array<{ at: number; text: string }> = [];
  const stack: Array<{ name: string; segment: string | null }> = [];
  for (let i = 0; i < markup.length;) {
    const c = markup[i];
    if (c === '{') { i = skipBraces(markup, i); continue; }
    if (c !== '<') { i++; continue; }
    if (markup[i + 1] === '/') {
      const close = markup.indexOf('>', i);
      const name = markup.slice(i + 2, close).trim();
      const at = stack.map(entry => entry.name).lastIndexOf(name);
      if (at !== -1) stack.length = at;
      i = close + 1;
      continue;
    }
    if (!/[A-Za-z]/.test(markup[i + 1] ?? '')) { i++; continue; }
    const tag = readTag(markup, i);
    const segment = segmentOf(markup, tag);
    const pos = segment ? free[[...stack.map(entry => entry.segment).filter(Boolean), segment].join('/')] : undefined;
    if (pos) {
      const style = tag.attrs.get('style');
      if (style && markup.startsWith('{{', style.start)) {
        edits.push({ at: style.start + 2, text: ` ${freeVars(pos)},` }, { at: tag.end, text: ' data-skb-free="on"' });
      } else edits.push({ at: tag.end, text: ` data-skb-free="on" style={{ ${freeVars(pos)} }}` });
    }
    if (!tag.selfClosing) stack.push({ name: tag.name, segment });
    i = tag.end + (tag.selfClosing ? 2 : 1);
  }
  return edits.sort((a, b) => b.at - a.at).reduce((out, edit) => out.slice(0, edit.at) + edit.text + out.slice(edit.at), markup);
}

/** Inserted elements: one layer at the end of the section (absolute on desktop, a centred row on phones). */
export function extrasLayer(block: SketchBlock, ctx: SketchContext): string {
  const extras = block.extras ?? [];
  if (!extras.length) return '';
  const items = extras.map((extra, i) => {
    const attrs = `data-skb-node=${expr(extra.id)} data-skb-free="on" style={{ ${freeVars(extra)} }}`;
    const field = `data-skb-field=${expr(`extras.${i}.value`)}`;
    switch (extra.kind) {
      case 'emoji': return `<span className="skb-x skb-x--emoji" aria-hidden="true" ${attrs}>${expr(extra.value)}</span>`;
      case 'text': return `<p className="skb-x skb-x--text" ${attrs} ${field}>${expr(extra.value)}</p>`;
      case 'button': {
        const href = extra.href ?? 'checkout.html';
        return `<a className="skb-btn skb-x skb-x--button" href=${expr(href)}${href.startsWith('https://') ? ' target="_blank" rel="noopener noreferrer"' : ''} ${attrs} ${field}>${expr(extra.value)}</a>`;
      }
      case 'photo': return `<img className="skb-x skb-x--photo" src=${expr(extra.value)} alt=${expr(`Foto de ${ctx.storeName}`)} data-skb-photo=${expr(`extras.${i}.value`)} ${attrs} />`;
      default: return `<img className="skb-x skb-x--icon" src=${expr(`assets/icons/${extra.value}.svg`)} alt="" aria-hidden="true" ${attrs} />`;
    }
  });
  return `<div className="skb-extras" data-skb-group=${expr('extras')}>${items.join('')}</div>`;
}

export function withFreeLayer(block: SketchBlock, markup: string, ctx: SketchContext): string {
  const stamped = stampFree(markup, block.free);
  const layer = extrasLayer(block, ctx);
  return layer ? stamped.replace(/<\/section>\s*$/, `  ${layer}\n  </section>`) : stamped;
}

/** Desktop keeps the exact spots; below 900px freed parts sit back in their column and inserted elements line up at
 * the end of their section, so nothing covers anything. An unset `--skb-fw` leaves the width automatic. */
export const FREE_CSS = `
.skb-extras { display: flex; flex-wrap: wrap; justify-content: center; align-items: center; gap: 0.8rem; padding-top: 1.2rem; white-space: normal; }
.skb-split > .skb-extras { padding: 0 1.2rem 1.5rem; }
.skb-x--emoji { font-size: 2.6rem; line-height: 1; }
.skb-x--icon { width: 2.6rem; height: auto; display: block; }
.skb-x--photo { width: min(45%, 12rem); height: auto; border-radius: var(--skb-r-sm); display: block; object-fit: cover; }
.skb-x--text { margin: 0; font-size: 1.05rem; font-weight: 600; }
@media (min-width: 900px) {
  .skb [data-skb-free] { position: absolute; left: calc(var(--skb-fx, 0) * 1%); top: calc(var(--skb-fy, 0) * 1%); right: auto; bottom: auto; width: calc(var(--skb-fw) * 1%); margin: 0; rotate: calc(var(--skb-fr, 0) * 1deg); z-index: 2; }
  .skb .skb-extras { position: absolute; inset: 0; padding: 0; display: block; pointer-events: none; z-index: 2; container-type: inline-size; }
  .skb-extras > * { pointer-events: auto; }
  .skb .skb-x--emoji { font-size: calc(var(--skb-fw, 8) * 0.8cqi); text-align: center; }
  .skb [data-skb-free].skb-x--icon { width: calc(var(--skb-fw, 6) * 1%); }
  .skb [data-skb-free].skb-x--photo { width: calc(var(--skb-fw, 22) * 1%); }
}`;
