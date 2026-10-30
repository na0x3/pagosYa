/** Fashion look spec 2026-10-21: clothing, designer wear, couture, knitwear, shoes, bags and worn accessories get the fashion
 *  card and product page. The fill read says so (`kind`); the store's own words back it up when the read is missing or says
 *  other. Weak words («tejido», «punto», «boutique», «atelier», «moda») count only two together and never in another trade (food,
 *  flowers, ceramics): a bakery says «Boutique del Pan» and «pan de punto» too. */
const STRONG = /\b(ropa|prendas?|couture|alta costura|disenador(a|as|es)?|vestidos?|blusas?|camisas?|camisetas?|poleras?|pantalon(es)?|faldas?|chaquetas?|abrigos?|sastreria|lenceria|calzados?|zapatos?|zapatillas?|carteras?|bolsos?|jerseys?|sueteres?|sweaters?|corses?|knitwear|denim|jeans?|chompas?|gorros?|bufandas?|ponchos?|hoodies?|sudaderas?|polerones?|poleron|buzos?|sweatshirts?|joggers?)\b/;
/** Words a clothing store uses but so do others («atelier» de cerámica, «polos» de fruta, «de moda», «botas» de lluvia). */
const WEAK = /\b(tejidos?|punto|boutique|novias?|accesorios|atelier|moda|polos?|botas?)\b/g;
/** Trades that borrow those words: food, flowers, ceramics. */
const OTHER_TRADES = /\b(pan|panes|panaderia|pasteleria|tortas?|pasteles?|cafe|cafeteria|comida|restaurante|cocina|dulces?|chocolates?|helados?|heladeria|bebidas?|flores|floreria|florales?|ramos?|ceramica|tazas?|platos?)\b/;
const plain = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export function isFashionStore(input: { kind?: 'fashion' | 'other'; storeName?: string; what?: string; categories?: string[]; products?: string[] }): boolean {
  if (input.kind === 'fashion') return true;
  const words = plain([input.storeName, input.what, ...(input.categories ?? []), ...(input.products ?? [])].filter(Boolean).join(' · '));
  const otherTrade = OTHER_TRADES.test(words);
  // The read said other and the store names another trade: a clothing word alone does not overrule it (review 2026-10-21).
  // NOA VARGAS 2026-10-29: two different garments (vestido and falda) are a clothing store, whatever the read and the flowers say.
  const garments = new Set((words.match(new RegExp(STRONG.source, 'g')) ?? []).map(word => word.replace(/(es|s)$/, '')));
  if (garments.size >= 2) return true;
  if (STRONG.test(words)) return !(input.kind === 'other' && otherTrade);
  return !otherTrade && new Set((words.match(WEAK) ?? []).map(word => word.replace(/s$/, ''))).size >= 2;
}
