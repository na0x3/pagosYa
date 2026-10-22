/** Owner 2026-10-22: «siempre tiene que ser desde la plantilla» + «include that»: a new store starts from the Plantillas preset
 *  closest to its business (the merchant's words and product names), not from a random roll of Esencial. Most specific first:
 *  a pet shop that sells «comida» is a pet shop; a kids' clothes shop is a kids' shop. Undefined keeps the usual roll. */
const PRESET_WORDS: Array<[string, RegExp]> = [
  ['patitas', /(?<!\p{L})(mascotas?|perr[oa]s?|gat[oa]s?|cachorr\p{L}*|veterinari\p{L}*|pet ?shop)(?!\p{L})/iu],
  ['recreo', /(?<!\p{L})(niñ[oa]s?|beb[eé]s?|juguetes?|infantil(es)?|jugueter[ií]a)(?!\p{L})/iu],
  ['voltio', /(?<!\p{L})(celulares?|aud[ií]fonos?|electr[oó]nic\p{L}*|gamer|laptops?|cargadores?|parlantes?)(?!\p{L})/iu],
  ['nucleo', /(?<!\p{L})(software|tecnolog[ií]\p{L}*|apps?|saas|inform[aá]tic\p{L}*)(?!\p{L})/iu],
  ['cimiento', /(?<!\p{L})(construcci[oó]n|constructora|obra gruesa|ferreter[ií]a|materiales de construcci[oó]n)(?!\p{L})/iu],
  ['cima', /(?<!\p{L})(deportes?|deportiv\p{L}*|monta[nñ]a|bicicletas?|outdoor|aire libre|trekking|camping|running)(?!\p{L})/iu],
  ['firma', /(?<!\p{L})(alta costura|lujo|dise[nñ]ador[ae]?s?|novias?|atelier|vestidos de (novia|noche|fiesta))(?!\p{L})/iu],
  ['diario', /(?<!\p{L})(ropa|moda|poleras?|jeans?|camisas?|zapatillas?|vestidos?)(?!\p{L})/iu],
  ['glow', /(?<!\p{L})(skincare|maquillaje|belleza|cosm[eé]tic\p{L}*|perfumes?|crema facial)(?!\p{L})/iu],
  ['casa', /(?<!\p{L})(decoraci[oó]n|muebles?|hogar|velas|textiles)(?!\p{L})/iu],
  ['mercado', /(?<!\p{L})(verduras?|frutas?|org[aá]nic\p{L}*|almac[eé]n|mercado|frescos?)(?!\p{L})/iu],
  ['horno', /(?<!\p{L})(caf[eé]s?|cafeter[ií]a|panader[ií]a|pasteler[ií]a|tortas?|reposter[ií]a|tostamos)(?!\p{L})/iu],
  ['antojo', /(?<!\p{L})(snacks?|prote[ií]nas?|suplementos?|salud|batidos?|golosinas?|comida)(?!\p{L})/iu],
];

export function closestPreset(text: string): string | undefined {
  return PRESET_WORDS.find(([, words]) => words.test(text))?.[0];
}
