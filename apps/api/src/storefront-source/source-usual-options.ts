/** Owner 2026-10-25: «yapi should build all alone… a shirt shop that has sizes, colors… without the user having to ask».
 *  A clothing or shoe product with no options gets the usual sizes — and the colours its name lists, when it lists two or
 *  more — each at the product's own price with no stock limit; the merchant is told so they set the real stock. A fixed
 *  rule rather than the model's guess, so nothing is invented beyond the sizes every such shop sells. */
import type { ProductVariantDto } from '../payment-links/dto/create-payment-link.dto';

const fold = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const CLOTHING = /\b(?:poleras?|camisetas?|camisas?|blusas?|remeras?|sudaderas?|buzos?|hoodies?|chompas?|sueteres?|sweaters?|jerseys?|chaquetas?|casacas?|camperas?|abrigos?|chalecos?|vestidos?|faldas?|polleras?|pantalon(?:es)?|jeans?|shorts?|bermudas?|leggings?|calzas?|bodys?|tops?|crop tops?|t-?shirts?|shirts?|dress(?:es)?|pants|jackets?|blazers?|trajes?|sacos?|ternos?|gabardinas?|trench|cardigans?|kimonos?|overoles?|uniformes?|pijamas?|enterizos?|monos?|conjuntos? deportivos?)\b/;
const SHOES = /\b(?:zapatos?|zapatillas?|tenis|sneakers?|botas?|botines?|sandalias?|mocasines?|shoes?|boots?)\b/;
/** Sizes nobody can guess: children's ranges, one-size items, and a size the name already gives. */
const SKIP = /\b(?:bebes?|baby|ninos?|ninas?|nino|nina|infantil(?:es)?|kids?|talla unica|one size|unitalla|talla (?:xs|s|m|l|xl|xxl|\d{2})|size (?:xs|s|m|l|xl|\d{2}))\b/;
const COLOURS: Array<[RegExp, string]> = [
  [/\bnegr[oa]s?\b/, 'Negro'], [/\bblanc[oa]s?\b/, 'Blanco'], [/\bgris(?:es)?\b/, 'Gris'], [/\bazul(?:es)?\b/, 'Azul'], [/\bceleste\b/, 'Celeste'],
  [/\broj[oa]s?\b/, 'Rojo'], [/\bverdes?\b/, 'Verde'], [/\bamarill[oa]s?\b/, 'Amarillo'], [/\brosad[oa]s?\b|\brosa\b/, 'Rosado'], [/\bmorad[oa]s?\b|\blila\b/, 'Morado'],
  [/\bbeige\b/, 'Beige'], [/\bcafe\b|\bmarron\b/, 'Café'], [/\bnaranjas?\b/, 'Naranja'], [/\bcrema\b/, 'Crema'], [/\bguindo\b|\bvino\b/, 'Guindo'],
];
export const USUAL_SIZES = { clothing: ['S', 'M', 'L', 'XL'], shoes: ['36', '37', '38', '39', '40', '41', '42', '43'] } as const;

export function usualOptionKind(product: { name: string }): 'clothing' | 'shoes' | null {
  const name = fold(product.name);
  if (SKIP.test(name)) return null;
  return SHOES.test(name) ? 'shoes' : CLOTHING.test(name) ? 'clothing' : null;
}

/** The colours the name lists, in its order; only two or more make a choice. */
function listedColours(name: string): string[] {
  const folded = fold(name);
  const found = COLOURS.map(([pattern, value]) => ({ value, at: folded.search(pattern) })).filter(colour => colour.at >= 0).sort((a, b) => a.at - b.at);
  return found.length >= 2 ? found.map(colour => colour.value) : [];
}

export function usualVariants(product: { name: string; amount: number; description?: string | null }): ProductVariantDto[] | undefined {
  const kind = usualOptionKind(product);
  if (!kind) return undefined;
  // Owner 2026-10-28 («adentro de la ropa que tenga opciones de colores»): a name with no colours lets the description's
  // «Colores: …» line give them.
  const named = listedColours(product.name);
  const said = /colou?r(?:es)?\s*[:：]\s*([^.\n]{2,160})/i.exec(product.description ?? '')?.[1] ?? '';
  const sizes = USUAL_SIZES[kind], colours = named.length ? named : listedColours(said);
  const rows = colours.length ? colours.flatMap(colour => sizes.map(size => [{ name: 'Color', value: colour }, { name: 'Talla', value: size }])) : sizes.map(size => [{ name: 'Talla', value: size }]);
  return rows.map(options => ({ name: options.map(option => option.value).join(' / '), amount: product.amount, stock: null, options }) as ProductVariantDto);
}

/** One line for YAPI's reply: which products got sizes, and that the stock is the merchant's to set. */
export function usualOptionsNote(names: string[]): string {
  if (!names.length) return '';
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} y ${names.at(-1)}`;
  return `Agregué las tallas de siempre a ${list}, sin límite de stock por ahora; ajusta el stock de cada talla en Productos.`;
}
