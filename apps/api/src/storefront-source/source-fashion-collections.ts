/** Owner 2026-10-28 («para tiendas de ropa: colección Mujer y adentro zapatos, ropa, etc; colección Hombre…»): a clothing store's
 *  first build groups its products into Mujer, Hombre and Niños collections from their own words, so the menu opens each one
 *  and its categories (header/store-menu.js) and the collection page sorts and filters them. A unisex product sits in both
 *  adult collections; a product that names no one sits in none. Only a store with two of the groups gets them. */
const fold = (text: string) => String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export const FASHION_GROUPS = [
  { name: 'Mujer', words: /\b(?:mujer(?:es)?|dama|damas|femenin[oa]s?|para ella|women|womens|woman|ladies)\b/ },
  { name: 'Hombre', words: /\b(?:hombre|hombres|caballero|caballeros|masculin[oa]s?|varon(?:es)?|para el|men|mens|man)\b/ },
  { name: 'Niños', words: /\b(?:nin[oa]s?|infantil(?:es)?|kids?|bebes?|junior|juvenil(?:es)?)\b/ },
] as const;
const UNISEX = /\bunisex\b/;

export function fashionCollections(products: ReadonlyArray<{ id: string; name: string; description?: string | null; category?: string | null }>): Array<{ name: string; productIds: string[] }> {
  const groups = FASHION_GROUPS.map(group => ({ name: group.name, productIds: [] as string[] }));
  for (const product of products) {
    const words = fold([product.name, product.description, product.category].filter(Boolean).join(' · '));
    const hits = FASHION_GROUPS.map((group, index) => group.words.test(words) ? index : -1).filter(index => index >= 0);
    // Children's words win: «zapatillas para niños» is not an adult product even when it says «hombre».
    const placed = hits.includes(2) ? [2] : UNISEX.test(words) && !hits.length ? [0, 1] : hits;
    for (const index of placed) groups[index].productIds.push(product.id);
  }
  const filled = groups.filter(group => group.productIds.length);
  return filled.length >= 2 ? filled : [];
}
