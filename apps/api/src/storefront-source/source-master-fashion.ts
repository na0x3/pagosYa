/** Fashion look spec 2026-10-21: clothing, designer wear, couture, knitwear, shoes, bags and worn accessories get the fashion
 *  card and product page. The fill read says so (`kind`); the store's own words back it up when the read is missing or says
 *  other. Weak words («tejido», «punto», «boutique») count only two together and never in a food business: a bakery says
 *  «Boutique del Pan» and «pan de punto» too. */
const STRONG = /\b(ropa|moda|prendas?|atelier|couture|alta costura|disenador(a|as|es)?|vestidos?|blusas?|camisas?|camisetas?|poleras?|pantalon(es)?|faldas?|chaquetas?|abrigos?|sastreria|lenceria|calzados?|zapatos?|zapatillas?|botas?|carteras?|bolsos?|jerseys?|sueteres?|sweaters?|corses?|knitwear|denim|jeans?|polos?)\b/;
const WEAK = /\b(tejidos?|punto|boutique|novias?|accesorios)\b/g;
const FOOD = /\b(pan|panes|panaderia|pasteleria|tortas?|pasteles?|cafe|cafeteria|comida|restaurante|cocina|dulces|chocolates?|helados?|bebidas?)\b/;
const plain = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function isFashionStore(input: { kind?: 'fashion' | 'other'; storeName?: string; what?: string; categories?: string[]; products?: string[] }): boolean {
  if (input.kind === 'fashion') return true;
  const words = plain([input.storeName, input.what, ...(input.categories ?? []), ...(input.products ?? [])].filter(Boolean).join(' · '));
  if (STRONG.test(words)) return true;
  return !FOOD.test(words) && new Set((words.match(WEAK) ?? []).map(word => word.replace(/s$/, ''))).size >= 2;
}
