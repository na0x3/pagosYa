/** The fixed group tree of every Boceto block (spec 2026-10-03-boceto-structure-and-icons-design). One source for the
 * API renderer and repair and the Studio editor, so the canvas, the saved sketch and the inspector cannot drift.
 * A path names a node inside a block: '' is the block, 'copy', 'copy/actions', 'copy/actions/cta', 'items/2'. */

export type SketchGroupKind = 'column' | 'row' | 'head' | 'items' | 'media';
/** How a container's children are reordered: the copy column's `order`, an array field, the copy/media `flip`,
 * the two-button `swap`, the announce left/right text `fields`, or not at all. */
export type SketchReorder = { kind: 'order' } | { kind: 'array'; field: string } | { kind: 'flip' } | { kind: 'swap' } | { kind: 'fields'; a: string; b: string } | { kind: 'none' };
export type SketchGroup = { key: string; parent: string; kind: SketchGroupKind; reorder: SketchReorder };
export type SketchGroupLayout = { gap?: 's' | 'm' | 'l'; dir?: 'row' | 'column'; align?: 'start' | 'center' | 'end'; valign?: 'start' | 'center' | 'end' };
export type SketchNode = { path: string; key: string; label: string; children: SketchNode[] };
/** Free layer (spec 2026-10-03-boceto-free-layer-design): a freed part's spot and an inserted element, in percentages
 * of the part's positioning box (its section, or the photo column for parts inside it); `r` is degrees. */
export type SketchFreePos = { x: number; y: number; w?: number; r?: number };
export type SketchExtraKind = 'emoji' | 'text' | 'button' | 'photo' | 'icon';
export type SketchExtra = SketchFreePos & { id: string; kind: SketchExtraKind; value: string; href?: string };
export const SKETCH_EXTRA_KINDS: readonly SketchExtraKind[] = ['emoji', 'text', 'button', 'photo', 'icon'];
export const SKETCH_EXTRA_LABEL: Record<SketchExtraKind, string> = { emoji: 'Emoji', text: 'Texto', button: 'Botón', photo: 'Foto', icon: 'Ícono' };
export const SKETCH_EXTRA_MAX = 12;
export const SKETCH_FREE_MAX = 30;

/** Copy-column elements that reorder, in default order (hero/split keep the keys saved before this module). */
export const SKETCH_COPY_ORDER: Record<string, readonly string[]> = {
  hero: ['badge', 'headline', 'sub', 'actions', 'trust', 'note'],
  split: ['headline', 'body', 'pills', 'stats', 'boxes', 'actions'],
  story: ['title', 'paragraphs'],
  newsletter: ['title', 'note', 'form'],
  banner: ['headline', 'cta'],
};
/** Blocks whose copy column sits beside a photo; their two top groups swap sides through `flip`. */
export const SKETCH_TWO_COLUMN: readonly string[] = ['hero', 'split', 'story', 'newsletter'];

const none: SketchReorder = { kind: 'none' };
const order: SketchReorder = { kind: 'order' };
const array = (field: string): SketchReorder => ({ kind: 'array', field });
const g = (key: string, parent: string, kind: SketchGroupKind, reorder: SketchReorder): SketchGroup => ({ key, parent, kind, reorder });
const headAndItems = (field: string | null): SketchGroup[] => [g('head', '', 'head', none), g('items', '', 'items', field ? array(field) : none)];

const GROUPS: Record<string, SketchGroup[]> = {
  hero: [g('copy', '', 'column', order), g('media', '', 'media', none), g('actions', 'copy', 'row', { kind: 'swap' })],
  split: [g('copy', '', 'column', order), g('media', '', 'media', none), g('actions', 'copy', 'row', { kind: 'swap' }), g('pills', 'copy', 'row', array('pills')), g('stats', 'copy', 'row', array('stats')), g('boxes', 'copy', 'row', array('boxes'))],
  story: [g('copy', '', 'column', order), g('media', '', 'media', none), g('paragraphs', 'copy', 'items', array('paragraphs'))],
  newsletter: [g('copy', '', 'column', order), g('media', '', 'media', none)],
  banner: [g('copy', '', 'column', order)],
  steps: headAndItems('items'),
  collections: headAndItems('items'),
  reviews: headAndItems('quotes'),
  gallery: headAndItems('photos'),
  faq: headAndItems('items'),
  catalog: headAndItems(null),
  announce: [g('row', '', 'row', { kind: 'fields', a: 'left', b: 'right' })],
  account: [g('intro', '', 'column', none), g('perks', 'intro', 'row', array('perks'))],
};

export const sketchGroups = (type: string): SketchGroup[] => GROUPS[type] ?? [];
export const sketchGroup = (type: string, key: string): SketchGroup | undefined => sketchGroups(type).find(group => group.key === key);

/** The rule for reordering the children of the container at `parentPath` ('' = the block itself). */
export function sketchReorder(block: { type: string }, parentPath: string): SketchReorder {
  if (!parentPath) return SKETCH_TWO_COLUMN.includes(block.type) ? { kind: 'flip' } : none;
  const key = parentPath.split('/').pop()!;
  return sketchGroup(block.type, key)?.reorder ?? none;
}

/** Layout fields each group kind accepts. Column alignment and head alignment stay the block's own `align`. */
const LAYOUT_FIELDS: Record<SketchGroupKind, ReadonlyArray<keyof SketchGroupLayout>> = { column: ['gap', 'valign'], row: ['gap', 'dir', 'align'], head: [], items: ['gap'], media: [] };
const LAYOUT_VALUES: Record<keyof SketchGroupLayout, readonly string[]> = { gap: ['s', 'm', 'l'], dir: ['row', 'column'], align: ['start', 'center', 'end'], valign: ['start', 'center', 'end'] };

/** Keeps known groups and allowed values; anything else is dropped silently. Undefined when nothing survives. */
export function repairSketchLayout(type: string, raw: unknown): Record<string, SketchGroupLayout> | undefined {
  if (type === 'account' || typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined;
  const out: Record<string, SketchGroupLayout> = {};
  for (const group of sketchGroups(type)) {
    const entry = (raw as Record<string, unknown>)[group.key];
    if (typeof entry !== 'object' || entry === null) continue;
    const kept: Record<string, string> = {};
    for (const field of LAYOUT_FIELDS[group.kind]) {
      const value = (entry as Record<string, unknown>)[field];
      if (typeof value === 'string' && LAYOUT_VALUES[field].includes(value)) kept[field] = value;
    }
    if (Object.keys(kept).length) out[group.key] = kept as SketchGroupLayout;
  }
  return Object.keys(out).length ? out : undefined;
}

const LABELS: Record<string, string> = {
  copy: 'Columna de texto', media: 'Foto', actions: 'Botones', pills: 'Etiquetas', stats: 'Cifras', boxes: 'Cajitas', paragraphs: 'Párrafos',
  head: 'Encabezado', row: 'Avisos', intro: 'Presentación', perks: 'Beneficios',
  badge: 'Etiqueta superior', headline: 'Título', title: 'Título', sub: 'Bajada', body: 'Texto', trust: 'Confianza', note: 'Nota', kicker: 'Antetítulo',
  cta: 'Botón principal', cta2: 'Botón secundario', form: 'Formulario', photo: 'Foto', caption: 'Pie de foto', tag: 'Etiqueta de foto', sticker: 'Sticker',
  left: 'Aviso izquierdo', right: 'Aviso derecho', seeAll: 'Ver todo', rating: 'Calificación', lead: 'Bajada',
};
const ITEMS_LABEL: Record<string, string> = { steps: 'Pasos', collections: 'Categorías', reviews: 'Reseñas', gallery: 'Fotos', faq: 'Preguntas', catalog: 'Productos' };
const ITEM_LABEL: Record<string, string> = { pills: 'Etiqueta', stats: 'Cifra', boxes: 'Cajita', paragraphs: 'Párrafo', perks: 'Beneficio', steps: 'Paso', collections: 'Categoría', reviews: 'Reseña', gallery: 'Foto', faq: 'Pregunta' };

function label(type: string, key: string, parentPath: string): string {
  if (/^\d+$/.test(key)) {
    const container = parentPath.split('/').pop() ?? '';
    return `${ITEM_LABEL[container === 'items' ? type : container] ?? 'Elemento'} ${Number(key) + 1}`;
  }
  if (key === 'items') return ITEMS_LABEL[type] ?? 'Elementos';
  return LABELS[key] ?? key;
}

const filled = (value: unknown) => (typeof value === 'string' ? value.trim() !== '' : Array.isArray(value) ? value.length > 0 : value != null && value !== false);

function partsTree(block: any): SketchNode[] {
  const type = String(block?.type ?? '');
  const make = (parent: string, key: string, children: (path: string) => SketchNode[] = () => []): SketchNode => {
    const path = parent ? `${parent}/${key}` : key;
    return { path, key, label: label(type, key, parent), children: children(path) };
  };
  const indices = (parent: string, field: string): SketchNode[] => (Array.isArray(block[field]) ? block[field] : []).map((_: unknown, i: number) => make(parent, String(i)));
  const leaves = (parent: string, keys: string[]) => keys.filter(key => filled(block[key])).map(key => make(parent, key));
  const copyChild = (key: string) => ['headline', 'title', 'form'].includes(key) || (key === 'actions' ? filled(block.cta) : filled(block[key]));
  const copy = () => make('', 'copy', path => {
    const saved: string[] = Array.isArray(block.order) ? block.order : [...(SKETCH_COPY_ORDER[type] ?? [])];
    return [...leaves(path, ['kicker']), ...saved.filter(copyChild).map(key => make(path, key, sub =>
      key === 'actions' ? leaves(sub, block.swap ? ['cta2', 'cta'] : ['cta', 'cta2'])
        : ['pills', 'stats', 'boxes', 'paragraphs'].includes(key) ? indices(sub, key) : []))];
  });
  const media = (extras: string[]) => make('', 'media', path => [make(path, 'photo'), ...leaves(path, [...extras, 'sticker'])]);
  const head = (extras: string[]) => make('', 'head', path => [...leaves(path, ['kicker']), make(path, 'title'), ...leaves(path, extras)]);
  switch (type) {
    case 'hero': case 'split':
      return [copy(), ...(block.photo ? [media([type === 'hero' ? 'caption' : 'tag'])] : leaves('', ['sticker']))];
    case 'story': return [copy(), ...(block.photo ? [media([])] : [])];
    case 'newsletter': return [copy(), ...(block.variant === 'split' && block.photo ? [media([])] : [])];
    case 'banner': return [copy(), ...leaves('', ['sticker'])];
    case 'steps': case 'collections': return [head(['note']), make('', 'items', path => indices(path, 'items'))];
    case 'reviews': return [make('', 'head', path => [...leaves(path, ['kicker']), make(path, 'title'), ...(filled(block.ratingValue) ? [make(path, 'rating')] : [])]), make('', 'items', path => indices(path, 'quotes'))];
    case 'gallery': return [head([]), make('', 'items', path => indices(path, 'photos'))];
    case 'faq': return [head([]), make('', 'items', path => indices(path, 'items'))];
    case 'catalog': return [head(['seeAll']), make('', 'items')];
    case 'announce': return [make('', 'row', path => [make(path, 'left'), make(path, 'right')])];
    case 'account': return [make('', 'intro', path => [...leaves(path, ['kicker']), make(path, 'title'), make(path, 'lead'), ...(filled(block.perks) ? [make(path, 'perks', sub => indices(sub, 'perks'))] : [])])];
    default: return [];
  }
}

/** The block's nodes as the canvas renders them (the renderer stamps the same keys), skipping empty optional parts;
 * inserted elements come last, under "Elementos sueltos". */
export function sketchNodeTree(block: any): SketchNode[] {
  const nodes = partsTree(block);
  const extras = Array.isArray(block?.extras) && block.type !== 'account' ? block.extras.filter((extra: any) => extra && typeof extra.id === 'string') : [];
  if (!extras.length) return nodes;
  return [...nodes, { path: 'extras', key: 'extras', label: 'Elementos sueltos', children: extras.map((extra: any) => ({ path: `extras/${extra.id}`, key: extra.id, label: SKETCH_EXTRA_LABEL[extra.kind as SketchExtraKind] ?? 'Elemento', children: [] })) }];
}

export function sketchFindNode(nodes: SketchNode[], path: string): SketchNode | undefined {
  for (const node of nodes) {
    if (node.path === path) return node;
    if (path.startsWith(`${node.path}/`)) return sketchFindNode(node.children, path);
  }
  return undefined;
}

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));
const tenth = (value: number) => Math.round(value * 10) / 10;
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

export function sketchFreePos(raw: unknown): SketchFreePos | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const { x, y, w, r } = raw as Record<string, unknown>;
  if (!finite(x) || !finite(y)) return undefined;
  const turn = finite(r) ? clamp(Math.round(r), -180, 180) : 0;
  return { x: clamp(tenth(x), 0, 100), y: clamp(tenth(y), 0, 100), ...(finite(w) ? { w: clamp(tenth(w), 5, 100) } : {}), ...(turn ? { r: turn } : {}) };
}

/** The sticker is already free and the column photo is its column's content; top-level groups stay in the flow. */
const NEVER_FREE = ['sticker', 'photo'];
const freeShape = (block: any, path: string) => Boolean(path) && block?.type !== 'account' && path.includes('/') && !path.startsWith('extras/') && !NEVER_FREE.includes(path.split('/').pop()!);
const freeMap = (block: any): Record<string, SketchFreePos> => (block?.free && typeof block.free === 'object' && !Array.isArray(block.free) ? block.free : {});
const insideFree = (free: Record<string, unknown>, path: string) => Object.keys(free).some(other => path.startsWith(`${other}/`));

export function sketchCanFree(block: any, path: string): boolean {
  return freeShape(block, path) && Boolean(sketchFindNode(sketchNodeTree(block), path));
}

/** What the canvas may pull out of its box: freeable parts with no freed part around them (freed ones included). */
export function sketchFreeablePaths(block: any): string[] {
  const free = freeMap(block);
  const walk = (nodes: SketchNode[]): string[] => nodes.flatMap(node => [...(freeShape(block, node.path) && !insideFree(free, node.path) ? [node.path] : []), ...walk(node.children)]);
  return walk(sketchNodeTree(block));
}

/** Frees a part at a spot (or moves it). Positions never nest: freed parts inside it rejoin it. */
export function sketchSetFree(block: any, path: string, pos: SketchFreePos): boolean {
  const current = freeMap(block);
  if (!sketchCanFree(block, path) || insideFree(current, path)) return false;
  const next: Record<string, SketchFreePos> = Object.fromEntries(Object.entries(current).filter(([other]) => !other.startsWith(`${path}/`)));
  next[path] = pos;
  if (Object.keys(next).length > SKETCH_FREE_MAX) return false;
  block.free = next;
  return true;
}

/** "Volver a su lugar": the part (and anything freed inside it) goes back into its box. */
export function sketchUnfree(block: any, path: string): void {
  const next = Object.fromEntries(Object.entries(freeMap(block)).filter(([other]) => other !== path && !other.startsWith(`${path}/`)));
  if (Object.keys(next).length) block.free = next; else delete block.free;
}

export function repairSketchFree(block: any, raw: unknown): Record<string, SketchFreePos> | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined;
  const out: Record<string, SketchFreePos> = {};
  for (const [path, value] of Object.entries(raw)) {
    if (Object.keys(out).length >= SKETCH_FREE_MAX) break;
    const pos = sketchFreePos(value);
    if (pos && sketchCanFree(block, path)) out[path] = pos;
  }
  for (const path of Object.keys(out)) if (insideFree(out, path)) delete out[path];
  return Object.keys(out).length ? out : undefined;
}

/** The node path of the group an array field fills (`reviews`/`quotes` → `items`). */
export function sketchListPath(type: string, field: string): string | undefined {
  const group = sketchGroups(type).find(item => item.reorder.kind === 'array' && item.reorder.field === field);
  return group ? (group.parent ? `${group.parent}/${group.key}` : group.key) : undefined;
}

/** Array items are keyed by index: when items move or go, their free spots follow (or go with them). */
function remapFree(block: any, parentPath: string, map: (index: number) => number | null) {
  const prefix = `${parentPath}/`;
  const next: Record<string, SketchFreePos> = {};
  for (const [path, pos] of Object.entries(freeMap(block))) {
    const [head, ...rest] = path.startsWith(prefix) ? path.slice(prefix.length).split('/') : [''];
    if (!/^\d+$/.test(head)) { next[path] = pos; continue; }
    const to = map(Number(head));
    if (to !== null) next[[parentPath, String(to), ...rest].join('/')] = pos;
  }
  if (Object.keys(next).length) block.free = next; else delete block.free;
}

const split = (path: string) => { const parts = path.split('/'); const key = parts.pop() ?? ''; return { key, parent: parts.join('/') }; };

export function sketchCanMove(block: any, path: string): boolean {
  if (!path || Object.prototype.hasOwnProperty.call(freeMap(block), path)) return false;
  const { key, parent } = split(path);
  const rule = sketchReorder(block, parent);
  switch (rule.kind) {
    case 'order': return (SKETCH_COPY_ORDER[block.type] ?? []).includes(key);
    case 'array': return /^\d+$/.test(key) && Array.isArray(block[rule.field]) && block[rule.field].length > 1;
    case 'flip': return (key === 'copy' || key === 'media') && Boolean(block.photo) && (block.type !== 'newsletter' || block.variant === 'split');
    case 'swap': return (key === 'cta' || key === 'cta2') && filled(block.cta2);
    case 'fields': return key === rule.a || key === rule.b;
    default: return false;
  }
}

/** Applies a sibling order (keys as the canvas shows them after a drop) to the block data. 'live' when the canvas DOM
 * already matches the data, 'reload' when field indices changed and the preview must re-render, null when refused. */
export function sketchApplyMove(block: any, parentPath: string, nextOrder: string[]): 'live' | 'reload' | null {
  const rule = sketchReorder(block, parentPath);
  switch (rule.kind) {
    case 'order': {
      const allowed = SKETCH_COPY_ORDER[block.type] ?? [];
      const kept = [...new Set(nextOrder.filter(key => allowed.includes(key)))];
      const full = [...kept, ...allowed.filter(key => !kept.includes(key))];
      if (full.every((key, index) => key === allowed[index])) delete block.order; else block.order = full;
      return 'live';
    }
    case 'array': {
      const list = Array.isArray(block[rule.field]) ? block[rule.field] : [];
      const picks = nextOrder.map(Number);
      const permutation = picks.length === list.length && picks.every(n => Number.isInteger(n) && n >= 0 && n < list.length) && new Set(picks).size === picks.length;
      if (!permutation) return null;
      block[rule.field] = picks.map(n => list[n]);
      remapFree(block, parentPath, from => picks.indexOf(from));
      return 'reload';
    }
    case 'flip': if (nextOrder[0] === 'media') block.flip = true; else delete block.flip; return 'live';
    case 'swap': if (nextOrder[0] === 'cta2') block.swap = true; else delete block.swap; return 'live';
    case 'fields': {
      if (nextOrder[0] !== rule.b) return 'live';
      [block[rule.a], block[rule.b]] = [block[rule.b], block[rule.a]];
      return 'reload';
    }
    default: return null;
  }
}

/** Optional single elements a merchant may remove (they become empty and disappear from the canvas). */
const OPTIONAL = ['badge', 'sub', 'trust', 'note', 'kicker', 'cta2', 'caption', 'tag', 'sticker', 'seeAll', 'body'];

export function sketchCanRemove(block: any, path: string): boolean {
  if (!path) return false;
  const { key, parent } = split(path);
  if (parent === 'extras') return Array.isArray(block.extras) && block.extras.some((extra: any) => extra?.id === key);
  const rule = sketchReorder(block, parent);
  if (rule.kind === 'array') return /^\d+$/.test(key) && Array.isArray(block[rule.field]) && Number(key) < block[rule.field].length;
  return OPTIONAL.includes(key) && filled(block[key]);
}

export function sketchRemoveNode(block: any, path: string): boolean {
  if (!sketchCanRemove(block, path)) return false;
  const { key, parent } = split(path);
  if (parent === 'extras') {
    block.extras = block.extras.filter((extra: any) => extra?.id !== key);
    if (!block.extras.length) delete block.extras;
    return true;
  }
  const rule = sketchReorder(block, parent);
  if (rule.kind === 'array') {
    const gone = Number(key);
    block[rule.field].splice(gone, 1);
    remapFree(block, parent, index => (index === gone ? null : index > gone ? index - 1 : index));
    return true;
  }
  block[key] = '';
  if (key === 'sticker') delete block.stickerPos;
  sketchUnfree(block, path);
  return true;
}
