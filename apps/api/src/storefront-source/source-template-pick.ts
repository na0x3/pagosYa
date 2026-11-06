import type { TemplateManifest } from '@pagosya/store-templates';

/**
 * Owner 2026-10-31 («do the recommendation»): a new store starts on the whole template — header, home, product page, footer —
 * that fits its business best, chosen by YAPI from the themed templates (34 templates programme) with one sentence saying why.
 * Pure parts here: which templates can be chosen, the prompt, the answer's schema and the word-based fallback.
 * (source-preset-pick picks among the older industry presets; source-starter-pick among the starters.)
 */

export type PickableTemplate = { id: string; name: string; category: string; description: string; tags: string[]; sections?: number };

/** The templates a new store can start on: Esencial presets that carry a whole theme and its home (variants.theme + layout).
 *  Templates kept off (the Shrine pair until the owner decides) are left out. */
export function pickableTemplates(manifests: readonly TemplateManifest[], hidden: ReadonlySet<string> = new Set()): PickableTemplate[] {
  return manifests
    .filter(manifest => manifest.extends === 'esencial' && manifest.preset && !hidden.has(manifest.id))
    .filter(manifest => { const theme = (manifest.preset!.variants as Record<string, string | undefined>).theme; return Boolean(theme && theme !== 'none' && manifest.preset!.layout?.length); })
    .map(manifest => ({ id: manifest.id, name: manifest.name, category: manifest.category, description: manifest.description, tags: [...(manifest.tags ?? [])], sections: manifest.preset!.layout!.length }));
}

// Spec 2026-11-04 §2 (owner «las de arte usaron la misma»): three candidates by style from any rubro — the rubro alone sent every
// art shop to Muro (arte has 2 templates, libros 1) — and the server takes the one fewer stores already wear.
export const TEMPLATE_PICK_PROMPT = `Eres YAPI, el diseñador de pagosYa. Una tienda nueva necesita su plantilla: propone las TRES de «plantillas» que mejor le quedan, la mejor primero.
Cada plantilla es una tienda completa (encabezado, portada, página de producto, pie) con un estilo; su «rubro» dice para qué negocio se pensó, pero
el contenido se llena con los productos y las palabras de esta tienda, así que una plantilla de otro rubro sirve cuando su forma le queda a este
catálogo (una tienda de láminas puede vestirse con una de moda calma o de diario; una de libros con una editorial). Nunca propongas una cuyas
secciones necesitan lo que esta tienda no tiene (tallas para una panadería, una carta para ropa).
Elige por el negocio y el estilo: qué vende (sus palabras y los nombres de sus productos), para quién, y cómo quiere verse. Si sus palabras o sus
respuestas dicen un estilo («Colorida», «Tranquila», «Elegante», «Divertida», un color, una tienda que le gusta), ese estilo manda sobre el rubro.
«secciones» es cuántas secciones tiene su portada. Si el comercio pide una tienda completa o con muchas secciones, prefiere las de 10 o más
(2026-11-02: las cuatro tiendas «completas» recibieron plantillas de 7).
«porque»: una sola frase corta en español, para el comerciante, que diga por qué esa plantilla va con su negocio (sin halagos ni promesas).
Tres plantillas distintas. Responde solo el JSON.`;

export function templatePickSchema(ids: readonly string[]) {
  return {
    type: 'object', additionalProperties: false, required: ['plantillas'],
    properties: { plantillas: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['plantilla', 'porque'],
      properties: { plantilla: { type: 'string', enum: [...ids] }, porque: { type: 'string', maxLength: 220 } } } } },
  } as const;
}

/** The model's candidates, checked: known templates, each once, at most three, with a short reason. */
export function readTemplatePicks(answer: unknown, templates: readonly PickableTemplate[]): Array<{ id: string; reason: string }> {
  const list = Array.isArray((answer as { plantillas?: unknown } | null)?.plantillas) ? (answer as { plantillas: unknown[] }).plantillas : [];
  const out: Array<{ id: string; reason: string }> = [];
  for (const entry of list) {
    const raw = (entry ?? {}) as { plantilla?: unknown; porque?: unknown };
    const id = String(raw.plantilla ?? '');
    if (!templates.some(template => template.id === id) || out.some(pick => pick.id === id)) continue;
    out.push({ id, reason: String(raw.porque ?? '').replace(/\s+/g, ' ').trim().slice(0, 220) });
    if (out.length === 3) break;
  }
  return out;
}

/** Of the candidates, the one fewer stores already wear; a tie keeps the model's order. */
export function leastUsedPick(candidates: ReadonlyArray<{ id: string; reason: string }>, uses: ReadonlyMap<string, number>) {
  let best: { id: string; reason: string } | null = null;
  for (const candidate of candidates) if (!best || (uses.get(candidate.id) ?? 0) < (uses.get(best.id) ?? 0)) best = candidate;
  return best;
}

/** Owner 2026-11-04 («podemos hacer que sea random? … pruebas con 1 y 3»): YAPI_TEMPLATE_RANDOM=pick draws one of YAPI's three,
 *  =all draws any store template without asking YAPI; anything else keeps the least used. */
export type TemplateRandom = 'off' | 'pick' | 'all';
export function readTemplateRandom(value?: string): TemplateRandom {
  const mode = (value ?? '').trim().toLowerCase();
  return mode === 'pick' || mode === 'all' ? mode : 'off';
}

export function randomPick<T>(items: readonly T[], random: () => number = Math.random): T | null {
  return items.length ? items[Math.min(items.length - 1, Math.floor(random() * items.length))] : null;
}

/** Owner 2026-11-06 («siento que siempre usan las 2 mismas plantillas»: a plain draw put 4 of 8 stores on Shrine Pro): a draw among
 *  the templates fewest stores wear, so a run of new stores goes round the whole pool before any template repeats. */
export function leastUsedDraw<T extends { id: string }>(items: readonly T[], uses: ReadonlyMap<string, number>, random: () => number = Math.random): T | null {
  if (!items.length) return null;
  const fewest = Math.min(...items.map(item => uses.get(item.id) ?? 0));
  return randomPick(items.filter(item => (uses.get(item.id) ?? 0) === fewest), random);
}

/** Spec 2026-11-04 writer on templates §1 (owner: «sorbo, shrine pro, broadcast…»): a new store's template comes only from the
 *  owner's pool; `keep` (Único for one-product stores) always stays. A pool that matches none of these is ignored, so a typo
 *  in YAPI_TEMPLATE_POOL never leaves YAPI with nothing to pick. */
export function inTemplatePool<T extends { id: string }>(templates: readonly T[], pool: readonly string[], keep: readonly string[] = []): T[] {
  if (!pool.length || !templates.some(template => pool.includes(template.id))) return [...templates];
  return templates.filter(template => pool.includes(template.id) || keep.includes(template.id));
}

const fold = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
// Words every shop uses say nothing about which template fits.
const GENERIC = new Set(['tiend', 'produ', 'nuest', 'grand', 'plant', 'hecho', 'compr', 'venta', 'vende', 'para', 'todos', 'calid']);
const stems = (text: string) => fold(text).split(/[^a-z0-9ñ]+/).filter(word => word.length >= 4).map(word => word.slice(0, 5)).filter(word => !GENERIC.has(word));

/** Without an answer: the template whose tags and trade (counted twice) and description share the most words with the business
 *  (their first five letters, so «perros» meets «perro»); ties keep the catalogue order. Null when nothing matches. */
export function fallbackTemplatePick(businessWords: string, templates: readonly PickableTemplate[]): { id: string; reason: string } | null {
  const words = new Set(stems(businessWords));
  let best: { id: string; score: number } | null = null;
  for (const template of templates) {
    const strong = new Set(stems([...template.tags, template.category].join(' ')).filter(word => words.has(word)));
    const weak = new Set(stems(template.description).filter(word => words.has(word) && !strong.has(word)));
    const score = strong.size * 2 + weak.size;
    if (score > 0 && (!best || score > best.score)) best = { id: template.id, score };
  }
  return best ? { id: best.id, reason: '' } : null;
}

/** Owner 2026-10-31 (switching templates later): a chat message asking for another template. A template named by its name
 *  («cámbiala a la plantilla Tacón», «usa Muro») → that one; «otra plantilla» / «cambia la plantilla» with none named → 'other'
 *  (YAPI picks a different one). Anything else → null, so ordinary edits never switch the store's design. */
export function templateSwitchRequest(instruction: string, templates: readonly PickableTemplate[]): { id: string } | 'other' | null {
  const text = fold(instruction);
  const asks = /\b(?:otra|nueva|distinta|diferente)\s+plantilla\b|\bplantilla\s+(?:distinta|diferente|nueva)\b|\b(?:cambia\w*|prueba\w*|usa\w*|pon\w*|aplica\w*|quiero)\b[^.!?\n]{0,30}\bplantilla\b/.test(text);
  if (!asks) return null;
  const named = templates.find(template => new RegExp(`\\bplantilla\\s+(?:de\\s+|llamada\\s+)?[«"']?${fold(template.name)}\\b|\\b(?:a|la|por)\\s+${fold(template.name)}\\b`).test(text));
  return named ? { id: named.id } : 'other';
}
