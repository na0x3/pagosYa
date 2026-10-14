import { allowedFrom, checkReply } from './assistant-guard';
import { foldText } from './assistant-text';
import type { AssistantToolbox } from './assistant-tools';
import type { AssistantBlock, AssistantReply, ProductCard } from './assistant-types';

export const SAFE_REPLY_WITH_CARDS = 'Te muestro el producto para que veas el precio actualizado.';
export const SAFE_REPLY_NO_CARDS = 'Prefiero no darte un dato que no pude confirmar. Te paso con la tienda.';
export const EMPTY_REPLY = 'No pude armar una respuesta. ¿Te paso con la tienda?';
const MAX_CARDS = 4;

const whatsappUrl = (phone: string | null, summary: string) => {
  const digits = (phone ?? '').replace(/\D/g, '');
  return digits ? `https://wa.me/${digits}?text=${encodeURIComponent(`Hola, vengo del chat de la tienda.${summary ? ` ${summary}` : ''}`)}` : null;
};

type BoxState = Pick<AssistantToolbox, 'evidence' | 'cards' | 'searched' | 'addBlocks' | 'handoff'>;

/** Lower-case words separated by single spaces, padded, so a name matches only whole words ("Té" is not inside "también"). */
const wordsOf = (value: string) => ` ${foldText(value).replace(/[^\p{L}\p{N}]+/gu, ' ').trim()} `;

/** Cards, buttons and links come only from the toolbox; the model's text only chooses which products to name. */
export function assembleReply(input: { text: string; box: BoxState; evidence: string[]; contactPhone: string | null }): { reply: AssistantReply; guarded: boolean; offending: string[] } {
  const { box } = input;
  const cards = [...box.cards.values()];
  const check = checkReply(input.text, allowedFrom([...input.evidence, ...box.evidence]));
  const guarded = !check.ok;
  const replyWords = wordsOf(input.text);
  let shown: ProductCard[];
  if (guarded) shown = cards.slice(0, MAX_CARDS);
  else {
    const named = cards.filter((card) => { const name = wordsOf(card.name); return name.trim() !== '' && replyWords.includes(` ${name.trim()} `); });
    shown = (named.length ? named : box.searched.map((id) => box.cards.get(id)).filter((c): c is ProductCard => !!c)).slice(0, MAX_CARDS);
  }
  const blocks: AssistantBlock[] = [];
  if (shown.length) blocks.push({ type: 'products', items: shown });
  if (!guarded) {
    const addKeys = new Set<string>();
    for (const block of box.addBlocks) {
      if (block.type === 'add_to_cart') {
        if (addKeys.has(block.addKey)) continue;
        addKeys.add(block.addKey);
      }
      blocks.push(block);
    }
  }
  if (box.handoff || (guarded && !shown.length) || !input.text) {
    // A guarded reply may carry an invented figure, so the handoff text never reuses the model-written summary.
    const summary = guarded ? '' : (box.handoff?.summary ?? '');
    blocks.push({ type: 'handoff', whatsappUrl: whatsappUrl(input.contactPhone, summary), summary });
  }
  const text = !input.text ? EMPTY_REPLY : guarded ? (shown.length ? SAFE_REPLY_WITH_CARDS : SAFE_REPLY_NO_CARDS) : input.text;
  return { reply: { text, blocks }, guarded, offending: check.ok ? [] : check.offending };
}
