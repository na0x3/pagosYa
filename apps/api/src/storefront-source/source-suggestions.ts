/** YAPI's next-step cards after a build (spec 2026-10-19-store-popup-suggestions-design §2): at most three, personal to the
 *  business, never something the store already has. The model proposes; this module decides what the merchant sees. */
export const SUGGESTION_KINDS = ['design', 'popup', 'product'] as const;
export type SuggestionKind = typeof SUGGESTION_KINDS[number];
export type SuggestionCard = { id: string; title: string; instruction: string; kind: SuggestionKind; section?: string; productId?: string };
export type SuggestionInput = { storeName: string; sections: string[]; products: Array<{ id: string; name: string }>; featuredProductIds: string[]; signupEnabled: boolean };
type Proposed = { title?: unknown; instruction?: unknown; kind?: unknown; section?: unknown; productId?: unknown };

const text = (value: unknown, max: number) => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';

export function filterSuggestions(cards: readonly Proposed[], input: SuggestionInput): SuggestionCard[] {
  const out: SuggestionCard[] = [];
  const seen = new Set<string>();
  for (const card of cards) {
    if (out.length === 3) break;
    const kind = SUGGESTION_KINDS.find(k => k === card.kind);
    const title = text(card.title, 60), instruction = text(card.instruction, 400);
    if (!kind || !title || !instruction || seen.has(title.toLowerCase())) continue;
    if (kind === 'popup' && input.signupEnabled) continue;
    const productId = text(card.productId, 60);
    if (kind === 'product' && (!input.products.some(p => p.id === productId) || input.featuredProductIds.includes(productId))) continue;
    const section = text(card.section, 40);
    if (kind === 'design' && section && input.sections.includes(section)) continue;
    seen.add(title.toLowerCase());
    out.push({ id: `s${out.length + 1}`, title, instruction, kind, ...(section ? { section } : {}), ...(kind === 'product' ? { productId } : {}) });
  }
  return out;
}

/** The cards for one reply: none when the store dismissed them, the model fails or it has nothing worth offering. */
export async function buildSuggestions(o: { dismissed: boolean; input: SuggestionInput; suggest: (input: SuggestionInput) => Promise<readonly Proposed[] | null> }): Promise<SuggestionCard[]> {
  if (o.dismissed) return [];
  try { return filterSuggestions((await o.suggest(o.input)) ?? [], o.input); } catch { return []; }
}

export const SUGGESTIONS_PROMPT = [
  'Eres YAPI. Acabas de crear la tienda en línea de este negocio. Propón 2 o 3 próximos pasos personales que la tienda todavía no tiene.',
  'Tipos: «design» (una sección o detalle nuevo; pon en section un id corto como faq, story, testimonials, guide, newsletter), «popup» (activar el popup de suscripción por correo, solo si signupEnabled es false), «product» (destacar un producto; productId debe ser uno de products y no estar en featuredProductIds).',
  'Nunca propongas lo que ya existe (sections, featuredProductIds, signupEnabled). title: máximo 60 caracteres, en español, en la voz del negocio. instruction: el pedido exacto que YAPI ejecutará, máximo 400 caracteres. No inventes datos, precios ni reseñas.',
].join('\n');

export const SUGGESTIONS_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['suggestions'],
  properties: { suggestions: { type: 'array', maxItems: 3, items: { type: 'object', additionalProperties: false, required: ['title', 'instruction', 'kind', 'section', 'productId'],
    properties: { title: { type: 'string' }, instruction: { type: 'string' }, kind: { type: 'string', enum: [...SUGGESTION_KINDS] }, section: { type: 'string' }, productId: { type: 'string' } } } } },
} as const;
