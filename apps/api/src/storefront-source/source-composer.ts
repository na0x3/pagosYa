import { LIBRARY_CATALOG, type LayoutBlock } from './source-section-library';

/** Spec 2026-11-11 store composer: what a template lets its composed home use. `fit` and `signature` come from section-fit.json. */
export type SectionFit = { fit: Record<string, string[]>; signature: Record<string, string[]>; vetoed?: Record<string, string[]> };
export type ComposerTemplate = { id: string; name: string; signature: string[]; allowed: string[]; looks: Record<string, string[]>; lead?: string };
export type HomeSummary = { store: string; cover: string; types: string[] };
export type ComposerChangeKind = 'swap' | 'look' | 'move' | 'photo' | 'band' | 'remove';
export type ComposerProblem = { problem: string; at: number; kind: ComposerChangeKind; value: string };

const BY_ID = new Map(LIBRARY_CATALOG.map(section => [section.id, section]));
const roleOf = (type: string) => BY_ID.get(type)?.role;
const MAIN_GRID = new Set(['products-grid', 'products-tabs']);
const BANDS = ['paper', 'muted', 'accent', 'deep', ''];
const add = (map: Record<string, string[]>, type: string, look: string) => { const list = (map[type] ??= []); if (!list.includes(look)) list.push(look); };

export function composerTemplate(id: string, name: string, preset: { layout?: readonly LayoutBlock[]; choices?: { looks?: Readonly<Record<string, readonly string[]>> } } | undefined,
  data: SectionFit): ComposerTemplate | null {
  const signature = data.signature[id];
  const fit = data.fit[id];
  const own = preset?.layout ?? [];
  if (!signature?.length || !fit?.length || !own.length) return null;
  const vetoed = new Set(data.vetoed?.[id] ?? []);
  const allowed = [...new Set([...own.map(block => block.type), ...fit])].filter(type => BY_ID.has(type) && !BY_ID.get(type)!.decor && !vetoed.has(type));
  const looks: Record<string, string[]> = {};
  for (const block of own) if (block.look) add(looks, block.type, block.look);
  for (const [type, list] of Object.entries(preset?.choices?.looks ?? {})) for (const look of list) add(looks, type, look);
  const first = own[0];
  const lead = first && ['strip', 'promo'].includes(roleOf(first.type) ?? '') ? first.type : undefined;
  return { id, name, signature: [...signature], allowed, looks, ...(lead ? { lead } : {}) };
}

export function lookOptions(template: ComposerTemplate, type: string): string[] {
  return [...new Set([...(BY_ID.get(type)?.looks ?? []), ...(template.looks[type] ?? [])])];
}

export function homeSummary(store: string, layout: readonly { type: string; look?: string }[]): HomeSummary {
  const cover = layout.find(block => roleOf(block.type) === 'cover');
  return { store, cover: cover ? `${cover.type}:${cover.look ?? ''}` : '', types: layout.map(block => block.type) };
}

/** Longest common subsequence: how much of one page's order the other repeats. */
export function commonOrder(a: readonly string[], b: readonly string[]): number {
  const row: number[] = new Array(b.length + 1).fill(0);
  for (const left of a) {
    let diagonal = 0;
    for (let j = 1; j <= b.length; j++) { const keep = row[j]; row[j] = left === b[j - 1] ? diagonal + 1 : Math.max(row[j], row[j - 1]); diagonal = keep; }
  }
  return row[b.length];
}

export function tooClose(candidate: HomeSummary, recent: HomeSummary): boolean {
  if (!candidate.cover || candidate.cover !== recent.cover) return false;
  const shorter = Math.min(candidate.types.length, recent.types.length);
  return shorter > 0 && commonOrder(candidate.types, recent.types) / shorter >= 0.6;
}

/** The reasons a composed home is refused, in the words the composer reads next (empty = it passes). */
export function composerCheck(layout: readonly LayoutBlock[], template: ComposerTemplate, recent: readonly HomeSummary[]): string[] {
  const reasons: string[] = [];
  const types = layout.map(block => block.type);
  if (types.length < 7 || types.length > 12) reasons.push(`la portada lleva entre 7 y 12 secciones (mandaste ${types.length})`);
  const top = template.lead && types[0] === template.lead ? 1 : 0;
  if (roleOf(types[top] ?? '') !== 'cover') reasons.push(template.lead ? `la portada va primera, o segunda debajo de ${template.lead}` : 'la portada va primera');
  if (types.slice(top + 1).some(type => roleOf(type) === 'cover')) reasons.push('una sola portada');
  for (const type of template.signature) {
    const count = types.filter(other => other === type).length;
    if (count !== 1) reasons.push(`la sección firma ${type} va una vez (está ${count})`);
  }
  const outside = [...new Set(types.filter(type => !template.allowed.includes(type) && type !== template.lead))];
  if (outside.length) reasons.push(`estas secciones no van en ${template.name}: ${outside.join(', ')}`);
  const grids = types.flatMap((type, at) => (MAIN_GRID.has(type) ? [at] : []));
  if (grids.length > 1 || (grids.length === 1 && grids[0] > top + 2)) reasons.push('la grilla principal va una vez, entre las tres primeras');
  const mine = homeSummary('', layout);
  for (const other of recent) {
    if (!tooClose(mine, other)) continue;
    reasons.push(`se parece a la tienda ${other.store}: la misma portada (${other.cover}) y ${commonOrder(mine.types, other.types)} de ${Math.min(mine.types.length, other.types.length)} secciones en el mismo orden`);
  }
  const repeated = recent.slice(0, 2).find(other => other.cover && other.cover === mine.cover);
  if (repeated) reasons.push(`la portada ${mine.cover} es la misma que la tienda ${repeated.store}: usa otro look u otra portada`);
  return reasons;
}

/** The review's changes, by the numbers the reviewer saw; a change that does not fit the template is left out. */
export function applyComposerChanges(layout: readonly LayoutBlock[], problems: readonly ComposerProblem[], template: ComposerTemplate, photos: readonly string[]):
  { layout: LayoutBlock[]; applied: string[]; rewrite: number[] } {
  let rows = layout.map((block, origin) => ({ block: { ...block }, origin }));
  const signature = new Set(template.signature);
  const applied: string[] = [];
  const swapped = new Set<number>();
  for (const change of problems) {
    const row = rows.find(entry => entry.origin === change.at);
    if (!row) continue;
    const type = row.block.type;
    const role = roleOf(type);
    if (change.kind === 'look') {
      if (lookOptions(template, type).includes(change.value) && change.value !== row.block.look) { row.block.look = change.value; applied.push(`${type}: look ${change.value}`); }
    } else if (change.kind === 'band') {
      if (!BANDS.includes(change.value) || (['accent', 'deep'].includes(change.value) && role === 'products')) continue;
      if (change.value) row.block.band = change.value; else delete row.block.band;
      applied.push(`${type}: banda ${change.value || 'ninguna'}`);
    } else if (change.kind === 'photo') {
      const at = Number(change.value);
      if (!Number.isInteger(at) || !photos[at] || !row.block.photo) continue;
      row.block.photo = photos[at]; applied.push(`${type}: foto ${at}`);
    } else if (change.kind === 'swap') {
      const next = change.value;
      if (signature.has(type) || MAIN_GRID.has(type) || role === 'cover' || roleOf(next) === 'cover' || !template.allowed.includes(next) || rows.some(entry => entry.block.type === next)) continue;
      row.block = { type: next, ...(row.block.band ? { band: row.block.band } : {}) };
      swapped.add(row.origin); applied.push(`${type} → ${next}`);
    } else if (change.kind === 'remove') {
      if (signature.has(type) || MAIN_GRID.has(type) || role === 'cover') continue;
      rows = rows.filter(entry => entry !== row); applied.push(`quité ${type}`);
    } else if (change.kind === 'move') {
      const to = Number(change.value);
      const cover = rows.findIndex(entry => roleOf(entry.block.type) === 'cover');
      if (role === 'cover' || type === template.lead || !Number.isInteger(to) || to <= cover || to >= rows.length) continue;
      rows = rows.filter(entry => entry !== row); rows.splice(to, 0, row); applied.push(`${type} a la posición ${to}`);
    }
  }
  return { layout: rows.map(entry => entry.block), applied, rewrite: rows.flatMap((entry, at) => (swapped.has(entry.origin) ? [at] : [])) };
}
