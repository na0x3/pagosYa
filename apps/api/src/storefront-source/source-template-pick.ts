import type { TemplateManifest } from '@pagosya/store-templates';

/**
 * Owner 2026-10-31 («do the recommendation»): a new store starts on the whole template — header, home, product page, footer —
 * that fits its business best, chosen by YAPI from the themed templates (34 templates programme) with one sentence saying why.
 * Pure parts here: which templates can be chosen, the prompt, the answer's schema and the word-based fallback.
 * (source-preset-pick picks among the older industry presets; source-starter-pick among the starters.)
 */

export type PickableTemplate = { id: string; name: string; category: string; description: string; tags: string[] };

/** The templates a new store can start on: Esencial presets that carry a whole theme and its home (variants.theme + layout).
 *  Templates kept off (the Shrine pair until the owner decides) are left out. */
export function pickableTemplates(manifests: readonly TemplateManifest[], hidden: ReadonlySet<string> = new Set()): PickableTemplate[] {
  return manifests
    .filter(manifest => manifest.extends === 'esencial' && manifest.preset && !hidden.has(manifest.id))
    .filter(manifest => { const theme = (manifest.preset!.variants as Record<string, string | undefined>).theme; return Boolean(theme && theme !== 'none' && manifest.preset!.layout?.length); })
    .map(manifest => ({ id: manifest.id, name: manifest.name, category: manifest.category, description: manifest.description, tags: [...(manifest.tags ?? [])] }));
}

export const TEMPLATE_PICK_PROMPT = `Eres YAPI, el diseñador de pagosYa. Una tienda nueva necesita su plantilla: elige UNA de «plantillas» para empezar.
Cada plantilla es una tienda completa (encabezado, portada, página de producto, pie) pensada para un rubro y un estilo.
Elige por el negocio: qué vende (sus palabras y los nombres de sus productos), para quién y con qué tono. El rubro manda; si dos
plantillas sirven por igual, elige la que mejor va con el tono (alegre, elegante, sencillo, divertido) que muestran sus palabras.
«porque»: una sola frase corta en español, para el comerciante, que diga por qué esa plantilla va con su negocio (sin halagos ni
promesas). Responde solo el JSON.`;

export function templatePickSchema(ids: readonly string[]) {
  return {
    type: 'object', additionalProperties: false, required: ['plantilla', 'porque'],
    properties: { plantilla: { type: 'string', enum: [...ids] }, porque: { type: 'string', maxLength: 220 } },
  } as const;
}

/** The model's answer, checked: a known template and a short reason, or null. */
export function readTemplatePick(answer: unknown, templates: readonly PickableTemplate[]): { id: string; reason: string } | null {
  const raw = (answer ?? {}) as { plantilla?: unknown; porque?: unknown };
  const id = String(raw.plantilla ?? '');
  if (!templates.some(template => template.id === id)) return null;
  const reason = String(raw.porque ?? '').replace(/\s+/g, ' ').trim().slice(0, 220);
  return { id, reason };
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
