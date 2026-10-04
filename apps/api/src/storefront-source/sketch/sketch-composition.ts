import { repairSketchFree, repairSketchLayout, sketchFreeablePaths, sketchGroups, SKETCH_COPY_ORDER, SKETCH_EXTRA_KINDS } from '@pagosya/shared-types';
import { repairSketchExtras, repairSketchOrder } from './sketch-schema';
import type { SketchBlock, SketchContext, StoreSketch } from './sketch-schema';

/** Stage 2 of sketch generation (spec 2026-10-04-yapi-composition-and-width-design.md). The first call draws the page;
 * this one composes it. It exists as its own call because `free` is keyed by internal node paths the model cannot
 * guess, and `repairSketchFree` drops an invalid path silently — so freedom has to be granted by a call that is handed
 * the real paths. Everything here is total: any response, including none, leaves the sketch usable. */

const str = { type: 'string' } as const;
const num = { type: 'number' } as const;
/** '' is how the model declines a layout field; strict json_schema has no optional properties. */
const opt = (values: readonly string[]) => ({ type: 'string', enum: [...values, ''] });

export const SKETCH_COMPOSITION_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    blocks: { type: 'array', items: {
      type: 'object', additionalProperties: false,
      properties: {
        id: str,
        // Maps become arrays carrying their own key: strict mode forbids open-ended `additionalProperties`.
        free: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { path: str, x: num, y: num, w: num, r: num }, required: ['path', 'x', 'y', 'w', 'r'] } },
        extras: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { id: str, kind: { type: 'string', enum: [...SKETCH_EXTRA_KINDS] }, value: str, href: str, x: num, y: num, w: num, r: num }, required: ['id', 'kind', 'value', 'href', 'x', 'y', 'w', 'r'] } },
        order: { type: 'array', items: str },
        layout: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { group: str, gap: opt(['s', 'm', 'l']), dir: opt(['row', 'column']), align: opt(['start', 'center', 'end']), valign: opt(['start', 'center', 'end']) }, required: ['group', 'gap', 'dir', 'align', 'valign'] } },
      },
      required: ['id', 'free', 'extras', 'order', 'layout'],
    } },
  },
  required: ['blocks'],
} as { type: 'object'; additionalProperties: false; properties: Record<string, any>; required: string[] };

/** `w: 0` and `r: 0` are the sentinels for "unset". `r: 0` needs no help — sketchFreePos already drops a zero
 * rotation — but a finite `w` is clamped to [5,100], so a raw 0 would render a 5%-wide sliver instead of an
 * automatic width. It must be deleted before repair ever sees it. */
const position = (raw: { x: number; y: number; w: number; r: number }) => ({ x: raw.x, y: raw.y, ...(raw.w ? { w: raw.w } : {}), r: raw.r });

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const asRecord = (value: unknown): Record<string, unknown> => (typeof value === 'object' && value !== null ? value as Record<string, unknown> : {});

export function compositionPrompt(input: { sketch: StoreSketch; energy: string }): string {
  const lines = input.sketch.blocks.map(block => {
    const paths = sketchFreeablePaths(block);
    const groups = sketchGroups(block.type).map(group => group.key);
    const copyOrder = SKETCH_COPY_ORDER[block.type];
    return `- ${block.id} (${block.type}): partes que podés soltar = ${paths.length ? paths.join(', ') : 'ninguna'}${groups.length ? ` | grupos = ${groups.join(', ')}` : ''}${copyOrder ? ` | orden de la columna = ${copyOrder.join(', ')}` : ''}`;
  });
  return [
    'Ya existe el boceto de esta tienda. Tu trabajo ahora es COMPONERLO: sacar partes de su caja y colocarlas donde quieras, insertar elementos sueltos, reordenar columnas y ajustar los grupos. Devolvé JSON estricto según el esquema.',
    `Boceto actual: ${JSON.stringify(input.sketch)}`,
    `Dirección de esta tienda: ${input.energy}`,
    'PARTES REALES DE CADA BLOQUE (usá EXACTAMENTE estas rutas; una ruta inventada se descarta y tu idea se pierde):',
    ...lines,
    'x e y son porcentajes de la banda (0 = izquierda/arriba, 100 = derecha/abajo). w es el ancho en porcentaje; poné 0 para que sea automático. r son grados de giro; 0 es sin girar.',
    'Ideas de composición, como vocabulario y NO como menú — podés hacer cualquier otra cosa: un titular que monta sobre su foto (x alto, y medio, r pequeño), un badge montado en la esquina de la foto, un emoji grande asomando fuera de una tarjeta, una cifra enorme girada en el margen, dos pastillas desarmadas a distinto alto.',
    'Componé con intención: lo que no aporta, dejalo en su lugar. Un bloque que no querés tocar simplemente no aparece en tu respuesta. En energía minimal casi no toques nada; en maximalista animate.',
    'No tapes un texto con otro texto: si dos cosas caen en el mismo punto, movelas.',
  ].join('\n');
}

/** Merges a composition response into the sketch. Every field goes through the same repair the Boceto's own saves
 * use, so an invented path, an unknown group or a protected part is dropped rather than rendered. */
export function applySketchComposition(sketch: StoreSketch, raw: unknown, ctx: SketchContext): { sketch: StoreSketch; notes: string[]; touched: number } {
  const notes: string[] = [];
  const entries = asArray(asRecord(raw).blocks).map(asRecord).filter(entry => typeof entry.id === 'string');
  const byId = new Map(entries.map(entry => [entry.id as string, entry]));
  let touched = 0;
  const blocks = sketch.blocks.map(block => {
    const entry = byId.get(block.id);
    if (!entry) return block;
    byId.delete(block.id);
    const next = { ...block } as SketchBlock & Record<string, unknown>;

    const inserted = repairSketchExtras(asArray(entry.extras).map(item => {
      const extra = asRecord(item);
      return { ...extra, ...position({ x: Number(extra.x), y: Number(extra.y), w: Number(extra.w), r: Number(extra.r) }) };
    }), ctx);
    if (inserted.length) next.extras = inserted; else delete next.extras;

    const reordered = repairSketchOrder(entry.order, SKETCH_COPY_ORDER[block.type]);
    if (reordered) next.order = reordered; else delete next.order;

    const layout = repairSketchLayout(block.type, Object.fromEntries(asArray(entry.layout).map(asRecord)
      .filter(item => typeof item.group === 'string')
      .map(item => [item.group as string, Object.fromEntries(Object.entries(item).filter(([key, value]) => key !== 'group' && value !== ''))])));
    if (layout) next.layout = layout; else delete next.layout;

    // Freed parts are named against the block as it now stands, so a spot on an element the composition just
    // reordered or inserted still resolves.
    const free = repairSketchFree(next, Object.fromEntries(asArray(entry.free).map(asRecord)
      .filter(item => typeof item.path === 'string')
      .map(item => [item.path as string, position({ x: Number(item.x), y: Number(item.y), w: Number(item.w), r: Number(item.r) })])));
    if (free) next.free = free; else delete next.free;

    const changed = (['extras', 'order', 'layout', 'free'] as const).some(key => JSON.stringify(next[key]) !== JSON.stringify((block as Record<string, unknown>)[key]));
    if (changed) touched++;
    return next as SketchBlock;
  });
  for (const id of byId.keys()) notes.push(`la composición nombró un bloque que no existe (${id.slice(0, 40)}); se ignoró`);
  return { sketch: { ...sketch, blocks }, notes, touched };
}
