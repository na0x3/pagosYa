import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { templatesDir } from '@pagosya/store-templates';
import { LIBRARY_CATALOG, libraryAnswerSchema, type LayoutBlock } from './source-section-library';
import { HOME_REVIEW_PROBLEMS } from './agent/home-writer-review';

/** Spec 2026-11-11 store composer: what a template lets its composed home use. `fit` and `signature` come from section-fit.json. */
export type SectionFit = { fit: Record<string, string[]>; signature: Record<string, string[]>; vetoed?: Record<string, string[]> };
/** `opener`: the first section of a template whose own home has no cover (Tacón's banner); it stays first in place of a cover. */
export type ComposerTemplate = { id: string; name: string; signature: string[]; allowed: string[]; looks: Record<string, string[]>; lead?: string; opener?: string };
export type HomeSummary = { store: string; cover: string; types: string[] };
export type ComposerChangeKind = 'swap' | 'look' | 'move' | 'photo' | 'band' | 'remove';
export type ComposerProblem = { problem: string; at: number; kind: ComposerChangeKind; value: string };

const BY_ID = new Map(LIBRARY_CATALOG.map(section => [section.id, section]));
const roleOf = (type: string) => BY_ID.get(type)?.role;
const MAIN_GRID = new Set(['products-grid', 'products-tabs']);
const BANDS = ['paper', 'muted', 'accent', 'deep', ''];
const add = (map: Record<string, string[]>, type: string, look: string) => { const list = (map[type] ??= []); if (!list.includes(look)) list.push(look); };

let fitCache: SectionFit | undefined;
/** section-fit.json (spec 2026-11-11), read once; a missing or unreadable file means no template is composed. */
export function readSectionFit(): SectionFit {
  if (fitCache) return fitCache;
  try {
    const raw = JSON.parse(readFileSync(join(templatesDir, 'esencial', 'section-fit.json'), 'utf8'));
    fitCache = { fit: raw.fit ?? {}, signature: raw.signature ?? {}, vetoed: raw.vetoed ?? {} };
  } catch { fitCache = { fit: {}, signature: {} }; }
  return fitCache;
}

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
  // Owner 2026-11-11: a home with no cover keeps its opener first (the signature starts with it); others may keep a bar above the cover.
  if (!own.some(block => roleOf(block.type) === 'cover')) return signature[0] === first.type ? { id, name, signature: [...signature], allowed, looks, opener: first.type } : null;
  const lead = ['strip', 'promo'].includes(roleOf(first.type) ?? '') ? first.type : undefined;
  return { id, name, signature: [...signature], allowed, looks, ...(lead ? { lead } : {}) };
}

/** Live test 2026-11-11 (Oh Belly had no press quotes, Remolino no services): the template as this store can fill it. Its first
 *  signature section (the cover or opener) always stays; every other section the store cannot fill is left out. */
export function fillableTemplate(template: ComposerTemplate, canFill: (type: string) => boolean): ComposerTemplate {
  const keep = (type: string) => type === template.signature[0] || canFill(type);
  return { ...template, signature: template.signature.filter(keep), allowed: template.allowed.filter(keep) };
}

export function lookOptions(template: ComposerTemplate, type: string): string[] {
  return [...new Set([...(BY_ID.get(type)?.looks ?? []), ...(template.looks[type] ?? [])])];
}

export function homeSummary(store: string, layout: readonly { type: string; look?: string }[]): HomeSummary {
  // A home without a cover is known by its opener.
  const cover = layout.find(block => roleOf(block.type) === 'cover') ?? layout[0];
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
  if (template.opener) {
    if (types[0] !== template.opener) reasons.push(`${template.opener} va primera: abre la página de ${template.name}`);
    if (types.some(type => roleOf(type) === 'cover')) reasons.push(`${template.name} va sin otra portada: ${template.opener} hace de portada`);
  } else {
    if (roleOf(types[top] ?? '') !== 'cover') reasons.push(template.lead ? `la portada va primera, o segunda debajo de ${template.lead}` : 'la portada va primera');
    if (types.slice(top + 1).some(type => roleOf(type) === 'cover')) reasons.push('una sola portada');
  }
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
  // The opener is the same in every store on its template; there only the order tells two homes apart.
  // A template with one cover and one look (Estudio, live test 2026-11-11) has no other cover to give; the order tells them apart.
  // Motion 2026-11-12: a signature cover is fixed too, so there only its looks can change.
  const covers = roleOf(template.signature[0]) === 'cover' ? [template.signature[0]] : template.allowed.filter(type => roleOf(type) === 'cover');
  const oneCover = covers.length === 1 && lookOptions(template, covers[0]).length <= 1;
  const repeated = template.opener || oneCover ? undefined : recent.slice(0, 2).find(other => other.cover && other.cover === mine.cover);
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
      const cover = rows.findIndex(entry => (template.opener ? entry.block.type === template.opener : roleOf(entry.block.type) === 'cover'));
      if (role === 'cover' || type === template.lead || type === template.opener || !Number.isInteger(to) || to <= cover || to >= rows.length) continue;
      rows = rows.filter(entry => entry !== row); rows.splice(to, 0, row); applied.push(`${type} a la posición ${to}`);
    }
  }
  return { layout: rows.map(entry => entry.block), applied, rewrite: rows.flatMap((entry, at) => (swapped.has(entry.origin) ? [at] : [])) };
}

export function composerCatalogue(template: ComposerTemplate) {
  return template.allowed.map(id => { const section = BY_ID.get(id)!; const looks = lookOptions(template, id);
    return { id, role: section.role, use: section.use, ...(looks.length ? { looks } : {}) }; });
}

export function composerAnswerSchema(photoCount: number, template: ComposerTemplate): object {
  const schema = JSON.parse(JSON.stringify(libraryAnswerSchema(photoCount)));
  const block = schema.properties.blocks.items.properties;
  block.type.enum = [...template.allowed];
  block.look.enum = [...new Set([...block.look.enum, ...Object.values(template.looks).flat()])];
  return schema;
}

export function composerPrompt(template: ComposerTemplate, recent: readonly HomeSummary[], feedback: readonly string[]): string {
  return `MODO COMPOSITOR (manda sobre las reglas de arriba): la tienda usa la plantilla ${template.name}. Su encabezado, menú, pie, tarjetas, fuentes
y colores ya están puestos; tú armas SOLO su portada, con secciones de «catalogue» (todas probadas dentro de esta plantilla).
- Secciones firma de ${template.name}, cada una UNA vez: ${template.signature.join(', ')}. ${template.opener
    ? `${template.opener} abre la página (es la apertura de ${template.name}) y va arriba, sin otra portada`
    : `${template.signature[0]} es la portada y va arriba${template.lead ? ` (o justo debajo de ${template.lead}, la barra de la plantilla, si la usas)` : ''}`}. Elige su look entre los suyos.
- El resto es tuyo, para ESTA marca: qué secciones, cuántas (en total de 7 a 12), en qué orden, el look de cada una, las bandas y las fotos.
  Mira las fotos: la portada lleva la que mejor cuenta la marca.
- ${template.name} ya armó estas portadas para otras tiendas; la tuya se ve distinta (otra portada u otro look, otro orden, otras secciones):
${recent.map(other => `  · ${other.store}: ${other.cover} → ${other.types.join(', ')}`).join('\n') || '  (ninguna todavía)'}
${feedback.length ? `- Tu respuesta anterior no pasó estas revisiones; corrígelas:\n${feedback.map(reason => `  · ${reason}`).join('\n')}` : ''}`.trim();
}

export const COMPOSER_PROBLEMS = [...HOME_REVIEW_PROBLEMS, 'se parece a otra tienda de la plantilla'] as const;
const CHANGES: readonly ComposerChangeKind[] = ['swap', 'look', 'move', 'photo', 'band', 'remove'];

export function composerReviewSchema(): object {
  return { type: 'object', additionalProperties: false, required: ['problemas'], properties: { problemas: { type: 'array', maxItems: 6, items: {
    type: 'object', additionalProperties: false, required: ['problema', 'seccion', 'cambio', 'valor'], properties: {
      problema: { type: 'string', enum: [...COMPOSER_PROBLEMS] }, seccion: { type: 'integer', minimum: 0, maximum: 20 },
      cambio: { type: 'string', enum: [...CHANGES] }, valor: { type: 'string' } } } } } };
}

export function composerReviewPrompt(): string {
  return `Revisas la portada de una tienda antes de guardarla. Recibes capturas de página entera cortadas de arriba abajo: primero escritorio
(1280 px), luego celular (390 px), y la lista numerada de sus secciones.
Informa SOLO estos problemas, cuando se ven claramente: ${COMPOSER_PROBLEMS.join('; ')}.
No opines de gustos. Cada problema trae UN cambio sobre una sección por su número:
swap (valor = otra sección de «Puede usar»), look (valor = uno de sus looks), move (valor = la nueva posición),
photo (valor = el número de otra foto), band (paper, muted, accent, deep o vacío), remove (valor vacío).
Nunca quites ni cambies una sección [firma] ni la grilla principal; nunca muevas la portada. Si no hay problemas, devuelve la lista vacía.`;
}

export function composerReviewText(layout: readonly LayoutBlock[], template: ComposerTemplate, recent: readonly HomeSummary[], photoCount: number): string {
  const lines = layout.map((block, at) => `${at}. ${block.type}${block.look ? ` (${block.look})` : ''}${block.band ? ` banda ${block.band}` : ''}${block.title ? ` — «${block.title}»` : ''}${
    template.signature.includes(block.type) ? ' [firma]' : ''}${lookOptions(template, block.type).length ? ` looks: ${lookOptions(template, block.type).join('/')}` : ''}`);
  return `${lines.join('\n')}
Puede usar: ${template.allowed.join(', ')}.
Fotos de la tienda: 0 a ${Math.max(0, photoCount - 1)}.
Otras portadas recientes de ${template.name}:
${recent.map(other => `· ${other.store}: ${other.types.join(', ')}`).join('\n') || '(ninguna)'}`;
}

export function readComposerReview(raw: unknown): ComposerProblem[] {
  let value = raw;
  if (typeof value === 'string') { try { value = JSON.parse(value); } catch { return []; } }
  const list = (value as { problemas?: unknown } | null)?.problemas;
  return (Array.isArray(list) ? list : []).flatMap(entry => {
    const { problema, seccion, cambio, valor } = (entry ?? {}) as Record<string, unknown>;
    return (COMPOSER_PROBLEMS as readonly string[]).includes(String(problema)) && Number.isInteger(seccion) && (CHANGES as readonly string[]).includes(String(cambio))
      ? [{ problem: String(problema), at: seccion as number, kind: cambio as ComposerChangeKind, value: typeof valor === 'string' ? valor : '' }] : [];
  }).slice(0, 6);
}
