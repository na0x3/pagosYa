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

/** The block's nodes as the canvas renders them (the renderer stamps the same keys), skipping empty optional parts. */
export function sketchNodeTree(block: any): SketchNode[] {
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

export function sketchFindNode(nodes: SketchNode[], path: string): SketchNode | undefined {
  for (const node of nodes) {
    if (node.path === path) return node;
    if (path.startsWith(`${node.path}/`)) return sketchFindNode(node.children, path);
  }
  return undefined;
}

const split = (path: string) => { const parts = path.split('/'); const key = parts.pop() ?? ''; return { key, parent: parts.join('/') }; };

export function sketchCanMove(block: any, path: string): boolean {
  if (!path) return false;
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
  const rule = sketchReorder(block, parent);
  if (rule.kind === 'array') return /^\d+$/.test(key) && Array.isArray(block[rule.field]) && Number(key) < block[rule.field].length;
  return OPTIONAL.includes(key) && filled(block[key]);
}

export function sketchRemoveNode(block: any, path: string): boolean {
  if (!sketchCanRemove(block, path)) return false;
  const { key, parent } = split(path);
  const rule = sketchReorder(block, parent);
  if (rule.kind === 'array') { block[rule.field].splice(Number(key), 1); return true; }
  block[key] = '';
  if (key === 'sticker') delete block.stickerPos;
  return true;
}
