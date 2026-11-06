/** Owner 2026-11-06 («que siempre sean iconos nunca palabras; si es una joyería que el carrito sea un anillo»): the Esencial header's
 *  cart shows what the store sells — variant `goods`, read by Shell.tsx (GOODS_ICONS). Picked once, at the first build, from the
 *  store's products, categories and name; nothing clear keeps the theme's own bag, cart or basket (''). */

const fold = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Each goods icon and the words that name it (folded, whole words; a trailing * matches any ending: «anill*» → anillo, anillos). */
const GOODS: Array<[string, string[]]> = [
  ['gem', ['joya*', 'joyeria*', 'anill*', 'aros', 'arete*', 'argolla*', 'collar*', 'pulsera*', 'dije*', 'gargantilla*']],
  ['watch', ['reloj*']],
  ['sofa', ['mueble*', 'sillon*', 'sofa*', 'cama*', 'estante*', 'repisa*', 'comoda*', 'velador*', 'butaca*']],
  ['lamp', ['lampara*', 'iluminacion']],
  ['flask', ['serum*', 'botica*', 'perfume*', 'fragancia*', 'balsamo*', 'bruma*', 'tonico*']],
  ['sparkles', ['belleza', 'maquillaje*', 'cosmetica*', 'skincare', 'labial*', 'rubor*', 'brillo*']],
  ['flame', ['vela*', 'salsa*', 'picante*', 'aji', 'ajies', 'chile*']],
  ['beef', ['carne*', 'parrilla*', 'asado*', 'bife*', 'chorizo*', 'costilla*', 'lomo*', 'picanha*']],
  ['icecream', ['helado*', 'gelato*', 'paleta*']],
  ['coffee', ['cafe*', 'cafeteria*', 'matcha', 'latte*', 'espresso*', 'infusion*']],
  ['croissant', ['panaderia*', 'pan', 'panes', 'croissant*', 'medialuna*', 'roll*', 'pastry']],
  ['cake', ['torta*', 'pasteleria*', 'pastel*', 'cupcake*', 'reposteria*']],
  ['cookie', ['galleta*', 'cookie*']],
  ['wine', ['vino*', 'bodega*', 'cerveza*', 'licor*', 'gin', 'pisco*']],
  ['shirt', ['ropa', 'moda', 'polera*', 'hoodie*', 'buzo*', 'vestido*', 'blazer*', 'camisa*', 'pantalon*', 'abrigo*', 'chaqueta*', 'falda*', 'jean*']],
  ['paw', ['perro*', 'gato*', 'mascota*', 'canino*', 'felino*', 'croqueta*']],
  ['apple', ['fruta*', 'verdura*', 'hortaliza*', 'organico*']],
  ['soda', ['soda*', 'bebida*', 'refresco*', 'kombucha*', 'jugo*']],
  ['palette', ['cuadro*', 'lamina*', 'lienzo*', 'arte', 'obra*', 'retrato*', 'pintura*', 'ilustracion*', 'acuarela*']],
  ['book', ['libro*', 'libreria*', 'novela*', 'lectura*']],
  ['flower', ['flor', 'flores', 'floreria*', 'ramo*']],
  ['sprout', ['planta*', 'huerta*', 'semilla*', 'vivero*', 'suculenta*']],
  ['dumbbell', ['gimnasio*', 'proteina*', 'suplemento*', 'fitness', 'pesa*']],
  ['droplet', ['aceite*']],
  ['baby', ['bebe*', 'recien']],
];
export const GOODS_ICON_IDS = GOODS.map(([id]) => id);

const patterns = GOODS.map(([id, words]) => [id, words.map(word => new RegExp(`(?<![a-z0-9])${word.endsWith('*') ? `${word.slice(0, -1)}[a-z]*` : word}(?![a-z0-9])`, 'g'))] as const);

/** The goods icon for the store's product and category names and its own name (which weighs as much as four products: «Taller
 *  Lienzo» sells paintings, some named «Café…»), or '' when no icon wins clearly. */
export function goodsIcon(words: readonly string[], storeName = ''): string {
  const text = fold(words.filter(Boolean).join(' · ')), name = fold(storeName);
  let best = '', bestScore = 0, second = 0;
  for (const [id, regexes] of patterns) {
    const score = regexes.reduce((sum, regex) => sum + (text.match(regex)?.length ?? 0) + 4 * (name.match(regex)?.length ?? 0), 0);
    if (score > bestScore) { second = bestScore; best = id; bestScore = score; } else if (score > second) second = score;
  }
  // Two mentions at least, and clearly ahead of the next: a lone «aceite» in a bakery never turns its cart into a drop.
  return bestScore >= 2 && bestScore > second ? best : '';
}
