import { sketchFreePos, sketchListPath, SKETCH_EXTRA_MAX, type SketchExtra } from '@pagosya/shared-types';
import type { BocetoPick } from './boceto-selection';

/** The Boceto's own clipboard (this session, not the system one). Fixed parts copy as inserted elements, because a
 * block holds one title, one subtitle, one main button. */
export type ClipItem = { kind: 'block'; block: any } | { kind: 'item'; type: string; field: string; item: unknown } | { kind: 'extra'; extra: SketchExtra };

const TEXT_PARTS = ['headline', 'title', 'sub', 'body', 'badge', 'note', 'trust', 'kicker', 'caption', 'tag', 'sticker', 'left', 'right', 'lead', 'seeAll', 'rating'];
/** The list limits repair keeps (and the inspector's "+ Añadir" stops at). */
const LIST_LIMIT: Record<string, number> = { 'steps.items': 4, 'collections.items': 4, 'faq.items': 6, 'reviews.quotes': 6, 'gallery.photos': 6, 'story.paragraphs': 6, 'split.pills': 6, 'split.stats': 4, 'split.boxes': 3 };
const LIST_FIELDS = Object.keys(LIST_LIMIT).map(key => key.split('.') as [string, string]);
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

function listItem(block: any, path: string): { field: string; index: number } | null {
  for (const [type, field] of LIST_FIELDS) {
    if (type !== block.type) continue;
    const listPath = sketchListPath(type, field);
    const match = listPath ? new RegExp(`^${listPath}/(\\d+)$`).exec(path) : null;
    if (match && Array.isArray(block[field]) && Number(match[1]) < block[field].length) return { field, index: Number(match[1]) };
  }
  return null;
}

function partAsExtra(block: any, path: string): SketchExtra | null {
  const key = path.split('/').pop()!;
  const spot = block.free?.[path];
  const at = { x: spot?.x ?? 45, y: spot?.y ?? 40 };
  if (TEXT_PARTS.includes(key)) {
    const value = String((key === 'rating' ? block.ratingValue : block[key]) ?? '').trim();
    return value ? { id: '', kind: 'text', value: value.slice(0, 120), ...at } : null;
  }
  if (key === 'cta' || key === 'cta2') {
    const value = String(block[key] ?? '').trim();
    return value ? { id: '', kind: 'button', value: value.slice(0, 40), href: typeof block.href === 'string' && block.href ? block.href : 'checkout.html', ...at } : null;
  }
  if (path === 'media/photo' && block.photo) return { id: '', kind: 'photo', value: block.photo, w: 22, ...at };
  return null;
}

export function copyPicks(blocks: any[], picks: BocetoPick[]): ClipItem[] {
  const out: ClipItem[] = [];
  for (const pick of picks) {
    const block = blocks.find(item => item.id === pick.id);
    if (!block) continue;
    if (!pick.path) { if (block.type !== 'account' && block.type !== 'footer') out.push({ kind: 'block', block: clone(block) }); continue; }
    if (pick.path.startsWith('extras/')) {
      const extra = (block.extras || []).find((item: any) => `extras/${item.id}` === pick.path);
      if (extra) out.push({ kind: 'extra', extra: clone(extra) });
      continue;
    }
    const list = listItem(block, pick.path);
    if (list) { out.push({ kind: 'item', type: block.type, field: list.field, item: clone(block[list.field][list.index]) }); continue; }
    const extra = partAsExtra(block, pick.path);
    if (extra) out.push({ kind: 'extra', extra });
  }
  return out;
}

function freshBlockId(blocks: any[], base: string) {
  let id = `${base}-copia`.slice(0, 32), n = 2;
  while (blocks.some(block => block.id === id)) id = `${base}-copia-${n++}`.slice(0, 32);
  return id;
}
function freshExtraId(block: any) {
  let n = 1, id = '';
  do id = `ec${String(n++).padStart(3, '0')}`; while ((block.extras || []).some((extra: any) => extra.id === id));
  return id;
}

export function pasteClip(sketch: { blocks: any[]; account?: any }, clip: ClipItem[], target: { blockId?: string; at?: { x: number; y: number } }) {
  const all = [...sketch.blocks, ...(sketch.account ? [sketch.account] : [])];
  const host = all.find(block => block.id === target.blockId) ?? sketch.blocks.filter(block => block.type !== 'footer').at(-1) ?? sketch.blocks[0];
  const picks: BocetoPick[] = [];
  let skipped = 0;
  let after = sketch.blocks.indexOf(host);
  const anchor = clip.find((item): item is Extract<ClipItem, { kind: 'extra' }> => item.kind === 'extra')?.extra;
  for (const item of clip) {
    if (item.kind === 'block') {
      if (sketch.blocks.length >= 20) { skipped++; continue; }
      const footer = sketch.blocks.findIndex(block => block.type === 'footer');
      let at = after === -1 ? sketch.blocks.length : after + 1;
      if (footer !== -1 && at > footer) at = footer;
      const id = freshBlockId(sketch.blocks, item.block.id);
      sketch.blocks.splice(at, 0, { ...clone(item.block), id });
      after = at; picks.push({ id, path: '' });
      continue;
    }
    if (!host) { skipped++; continue; }
    if (item.kind === 'item') {
      const limit = LIST_LIMIT[`${host.type}.${item.field}`];
      const list = host.type === item.type && Array.isArray(host[item.field]) ? host[item.field] : null;
      const listPath = sketchListPath(host.type, item.field);
      if (!list || !limit || !listPath || list.length >= limit) { skipped++; continue; }
      list.push(clone(item.item));
      picks.push({ id: host.id, path: `${listPath}/${list.length - 1}` });
      continue;
    }
    if (host.type === 'account' || (host.extras?.length ?? 0) >= SKETCH_EXTRA_MAX) { skipped++; continue; }
    const base = target.at && anchor ? { x: target.at.x + item.extra.x - anchor.x, y: target.at.y + item.extra.y - anchor.y } : { x: item.extra.x + 3, y: item.extra.y + 3 };
    const spot = sketchFreePos(base) ?? { x: 45, y: 40 };
    const id = freshExtraId(host);
    if (!Array.isArray(host.extras)) host.extras = [];
    host.extras.push({ ...clone(item.extra), id, x: spot.x, y: spot.y });
    picks.push({ id: host.id, path: `extras/${id}` });
  }
  return { picks, skipped };
}

export function duplicatePicks(sketch: { blocks: any[]; account?: any }, picks: BocetoPick[]) {
  const out: BocetoPick[] = [];
  let skipped = 0;
  for (const pick of picks) {
    const clip = copyPicks([...sketch.blocks, ...(sketch.account ? [sketch.account] : [])], [pick]);
    if (!clip.length) { skipped++; continue; }
    const result = pasteClip(sketch, clip, { blockId: pick.id });
    out.push(...result.picks); skipped += result.skipped;
  }
  return { picks: out, skipped };
}
