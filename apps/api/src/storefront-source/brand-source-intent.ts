/** Own brand or someone else's, from the merchant's own words (spec 2026-10-16 brand source, §1). Accent-safe whole words. */
export type BrandSourceIntent = 'own' | 'other' | 'unknown';

const OWN = /(?<!\p{L})(mi|mis|nuestr[oa]s?)\s+(?:propi[oa]s?\s+)?(p[aá]gina|sitio|web|instagram|insta|banners?|publicaciones|posts?|marca|negocio|logo|feed|historias|stories|capturas)(?!\p{L})|(?<!\p{L})de mi (?:marca|negocio|tienda|empresa)(?!\p{L})|(?<!\p{L})(our|my) (?:brand|old site|website|instagram)(?!\p{L})/iu;
const OTHER = /(?<!\p{L})(como esta|como este|me gusta este estilo|me gusta esta|insp[ií]rate en|parecid[oa] a|similar a|like this)(?!\p{L})/iu;

export function brandSourceIntent(words: string): BrandSourceIntent {
  if (OWN.test(words)) return 'own';
  if (OTHER.test(words)) return 'other';
  return 'unknown';
}

/** The merchant names a link as their OWN old site (final review 2026-10-16, C1): «mi página anterior», «esta es mi web»;
 *  «pon en mi sitio el link …» or «que mi sitio se parezca a …» is not. */
const OWN_SITE = /(?<!\p{L})(?:mi|nuestr[oa])\s+(?:p[aá]gina|sitio|web)\s+(?:anterior|vieja|antigua|de antes|actual)(?!\p{L})|(?<!\p{L})(?:esta|esa)\s+es\s+(?:mi|nuestra)\s+(?:p[aá]gina|web|sitio)(?!\p{L})|(?<!\p{L})(?:my|our)\s+old\s+(?:site|website)(?!\p{L})/iu;
export const brandSourceOwnSite = (words: string) => OWN_SITE.test(words);
/** Style-only wording about another site («como esta tienda», «me gusta este estilo»). */
export const brandSourceOther = (words: string) => OTHER.test(words);

export const BRAND_SOURCE_QUESTION = '¿Es material de tu marca (uso sus colores, frases y fotos) o solo una inspiración de estilo?';

const ANSWER_OWN = /^(s[ií]|claro)(?!\p{L})|(?<!\p{L})(es m[ií][oa]|son m[ií]os|de mi marca|mi marca|mi negocio)(?!\p{L})/iu;
const ANSWER_OTHER = /(?<!\p{L})(solo (?:estilo|inspiraci[oó]n|referencia)|de otra|no es m[ií][oa]|no son m[ií]os)(?!\p{L})|(?<!\p{L})no(?!\p{L}).{0,12}(?<!\p{L})(?:es|son)\s+(?:de\s+)?(?:m[ií][oa]s?|mi marca|mi negocio)(?!\p{L})/iu;
/** The merchant's answer to BRAND_SOURCE_QUESTION; undefined when the message is about something else. */
export function brandSourceAnswer(words: string): 'own' | 'other' | undefined {
  const text = words.trim();
  if (ANSWER_OTHER.test(text)) return 'other';
  if (ANSWER_OWN.test(text)) return 'own';
  return undefined;
}

const LOOK = /(?<!\p{L})(colou?r(?:es)?|paleta|tonos|redise[ñn]\p{L}*|onda|estilo|look|tipograf[ií]a|letras?|fuentes?|todo el sitio|todo mi sitio|se parezca)(?!\p{L})/iu;
/** The request is about the look (colours, style, a redesign): the brand palette then overrides on an edit too. */
export const brandSourceTouchesLook = (words: string) => LOOK.test(words);
