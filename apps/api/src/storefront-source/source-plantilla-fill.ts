/** Spec 2026-10-20 Plantillas fill §4: a converted template's text slots, filled for one business in one model call.
 *  Pure; the call itself is SourceConversationService.fillPlantilla. Esencial keeps its own fill (source-master.ts). */
import type { TemplateCopySlot } from '@pagosya/store-templates';

export const PLANTILLA_FILL_PROMPT = `You fill a ready-made online store template for one real business in Bolivia.
You receive the business facts (its name, what it sells in the merchant's own words, its products, its photos) and the
template's text slots. Each slot has a key, a role (headline, title, lead, body, cta, label, item, question, answer, quote,
name, alt), the template's own demo text — written for an invented business, shown only so you see the purpose, tone and
length — and a maximum length.
Return one value for every key, in the merchant's language (Spanish unless they write otherwise), about THIS business:
- Never mention the demo business, its products or its city; never copy a demo sentence unless it is generic shop UI
  («Mi pedido», «Carrito», «Ver todo»), which you keep as it is.
- Keep each slot's job: a headline stays a short headline, a cta a short action, a question and the answer after it a
  coherent pair about buying from this business, a quote a short customer sentence, a name a first name and a city.
- Never invent facts you were not given: no prices, dates, addresses, phone numbers, awards or numbers of years. Payment
  is with QR from any bank or with card; delivery or pickup only as the facts say, otherwise «Coordina la entrega al pedir».
- An alt text describes the kind of photo plainly («Corte de carne a la parrilla»), never a demo photo.
- Stay within each maximum length; similar length to the demo text keeps the design intact.
When "current" and "request" are given, change only what the request asks and return every other value unchanged.`;

export function plantillaFillSchema(slots: readonly TemplateCopySlot[]) {
  return {
    type: 'object' as const, additionalProperties: false as const, required: slots.map(slot => slot.key),
    properties: Object.fromEntries(slots.map(slot => [slot.key, { type: 'string' as const, description: `${slot.role}; máximo ${slot.max} caracteres` }])),
  };
}

/** At a word when one fits, otherwise at the limit. */
const clip = (value: string, max: number) => {
  const text = value.replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max + 1).replace(/\s+\S*$/, '').trim();
  return (cut.length >= max * 0.5 ? cut : text.slice(0, max)).replace(/[\s,;:–—-]+$/, '');
};

/** The model's answer kept to the template's slots: unknown keys dropped, non-strings and missing keys left out. */
export function plantillaFillFromRead(read: Record<string, unknown> | null | undefined, slots: readonly TemplateCopySlot[]): Record<string, string> {
  if (!read || typeof read !== 'object') return {};
  return Object.fromEntries(slots.flatMap(slot => typeof read[slot.key] === 'string' ? [[slot.key, clip(read[slot.key] as string, slot.max)]] : []));
}

/** When the fill fails: the merchant's own words, so no demo sentence ever reaches their store. The shop's own controls in
 *  the shell («Mi pedido») stay; demo questions, answers, quotes and stories read empty until YAPI or the merchant writes them. */
export function plantillaFallback(slots: readonly TemplateCopySlot[], facts: { storeName: string; tagline?: string; products: string[] }): Record<string, string> {
  const lead = facts.tagline?.trim() || facts.products.slice(0, 3).join(', ');
  let titled = false;
  return Object.fromEntries(slots.map(slot => {
    if (slot.key.startsWith('shell_') && (slot.role === 'label' || slot.role === 'cta')) return [slot.key, slot.default];
    const value = slot.role === 'headline' ? facts.storeName
      : slot.role === 'lead' ? lead
      : slot.role === 'cta' ? 'Ver productos'
      : slot.role === 'title' && !titled ? (titled = true, 'Nuestros productos')
      : slot.role === 'alt' ? `Foto de ${facts.storeName}`
      : '';
    return [slot.key, clip(value, slot.max)];
  }));
}
